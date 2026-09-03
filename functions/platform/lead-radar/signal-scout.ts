/**
 * Signal Radar scout — the network side of the demand-side radar.
 *
 * Lives in the automation Worker, never in a Pages function. A Pages request
 * gets ~30 ms of CPU on the Free plan, which is not enough to fetch and parse
 * a Telegram preview. Cron has room for a handful of bounded subrequests.
 *
 * THE COST MODEL THIS FILE IS BUILT AROUND
 *
 *   Channels are free.  `t.me/s/<slug>` is server-rendered and public, so a
 *                       channel's posts are readable with zero Telegram API
 *                       calls, zero joins, and zero risk to the account.
 *
 *   Groups cost a join. A public group has no web preview at all — verified
 *                       live: `t.me/s/<group>` returns an empty interstitial.
 *                       Its content is only reachable over MTProto, which
 *                       means joining, which means a stranger can see us.
 *
 * So this scout only ever reads channels. Join *decisions* are computed by
 * `signal-join-queue` and surfaced to the operator, but no join is executed
 * here: the transport that could perform one is not wired, and shipping a
 * silent no-op would be worse than shipping nothing. `decideJoin` already
 * refuses every mode except `join`, and the default mode is `discover`.
 *
 * Discovery is demand-driven rather than scheduled: we only crawl the tgstat
 * country ranking when our pool of un-reconnoitred candidates runs low. That
 * needs no extra state, no new table, and throttles itself.
 */
import {
  parseTelegramPreview,
  parseTgstatEntities,
  scoreSignalTarget,
  SIGNAL_DISCOVERY_SOURCES,
  type TelegramPreview,
} from './signal-discovery';
import { pickSignalQuote } from './signal-triage';
import {
  decideJoin,
  localDayKey,
  SIGNAL_JOIN_POLICY,
  type JoinQueueSnapshot,
} from './signal-join-queue';
import { resolveSignalMode } from './signal-mode';
import { SignalRadarStore, signalSchemaReady } from './signal-store';
import {
  isSignalSlug,
  type SignalTarget,
} from '../../../src/shared/signal-radar';

export interface SignalScoutEnv {
  LEAD_RADAR_SIGNAL_ENABLED?: string;
  LEAD_RADAR_SIGNAL_AUTOJOIN_MODE?: string;
  LEAD_RADAR_SIGNAL_DISCOVERY_ENABLED?: string;
  LEAD_RADAR_ALLOWED_ORGS?: string;
}

/** Everything bounded lives here so a tick can never surprise the platform. */
export const SIGNAL_SCOUT_LIMITS = {
  /** Wall-clock guard per HTTP fetch. Telegram is slow from some regions. */
  fetchTimeoutMs: 12_000,
  /** Telegram and tgstat both serve fine to a normal browser UA. */
  userAgent: 'Mozilla/5.0 (compatible; GPTBotSignalRadar/1.0; +https://gptbot.uz)',
  /** Previews per tick. Cron runs every 15 min, so ~32 channels/hour. */
  maxPreviewsPerTick: 8,
  /** New slugs accepted from one tgstat page. */
  maxDiscoveriesPerTick: 40,
  /** Refill the candidate pool when it drops below this. */
  discoverWhenCandidatesBelow: 20,
  /** Politeness gap between preview fetches. */
  previewIntervalMs: 1_500,
  /** How often a watched channel is re-read for new posts. */
  pollIntervalMinutes: 30,
  /**
   * Posts a channel may hand us without a single request before we stop
   * believing it. Eight broadcast channels taught us this the hard way: 228
   * posts, one recruitment advert, and every slot of every tick spent
   * re-reading them.
   */
  quietAfterMessages: 40,
  /** How often a channel that has stopped paying out is re-read instead. */
  quietPollIntervalMinutes: 240,
  /** Posts without a single request after which the channel is retired. */
  retireAfterMessages: 150,
  /** Recon revisit delay for a candidate that scored too low to watch. */
  candidateReconMinutes: 240,
  /** Raw post text is retained only long enough to triage and quote it. */
  postRetentionDays: 7,
} as const;

/**
 * The score at which a candidate starts being polled. Above the member bonus
 * and the language bonus alone, so a channel has to have shown us something —
 * a request, several voices, or both — before it earns a slot every half hour.
 */
export const PROMOTE_SCORE = 40;

export interface SignalScoutReport {
  orgs: number;
  discovered: number;
  scouted: number;
  posts: number;
  leads: number;
  /** Join decisions computed this tick. Never executed by this module. */
  joinPlanned: number;
  skipped: string[];
}

const EMPTY_REPORT: SignalScoutReport = {
  orgs: 0, discovered: 0, scouted: 0, posts: 0, leads: 0, joinPlanned: 0, skipped: [],
};

export function signalRadarEnabled(env: SignalScoutEnv): boolean {
  return env.LEAD_RADAR_SIGNAL_ENABLED === 'true';
}

function allowedOrganizations(env: SignalScoutEnv): string[] {
  return (env.LEAD_RADAR_ALLOWED_ORGS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^(?:owner_[a-f0-9]{24}|org_[a-f0-9]{32,64})$/.test(item));
}

/**
 * Injected so the tick can be tested without hitting Telegram or tgstat, and
 * so a test never has to wait out the real politeness delay.
 */
export interface SignalScoutDeps {
  fetchText?: (url: string) => Promise<string | null>;
  sleep?: (ms: number) => Promise<void>;
}

async function defaultFetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        // A browser-like Accept keeps Telegram on the HTML path instead of
        // redirecting us to a native-app deep link.
        'user-agent': SIGNAL_SCOUT_LIMITS.userAgent,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ru,uz,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(SIGNAL_SCOUT_LIMITS.fetchTimeoutMs),
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/i.test(contentType)) return null;
    return await response.text();
  } catch {
    // Timeouts, DNS failures and TLS errors are all routine out here. A missed
    // channel is cheap; a tick that throws is not.
    return null;
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Cross-post dedup: the same person pastes one request into five channels. */
function normalizeForDedup(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@+()[\].,!?;:"'«»—–\-_/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function dedupKey(orgId: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${orgId}\n${normalizeForDedup(text)}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Refill the candidate pool from the tgstat country ranking.
 *
 * tgstat publishes one ranking page per country; `uz.tgstat.com` carries the
 * Uzbek channels and groups. Its robots.txt allows `User-agent: *` and blocks
 * only commercial crawlers, so this is permitted. Its sitemaps are NOT used:
 * they are dated 2018 and most slugs in them are dead.
 *
 * As of 2026-09-02 tgstat answers the ranking page with HTTP 200 and an
 * "authorization required" interstitial, which parses to zero entities. The
 * ranking was always a poor source anyway — it sorts by subscriber count, and
 * the biggest channels in the country are broadcasts nobody can post in. So
 * the ranking is now the *second* thing we try: when it comes back empty we
 * fall back to the link graph harvested from channels we already judged good,
 * and if that is empty too we say so out loud instead of reporting a quiet
 * tick as a healthy one.
 */
async function discover(
  env: SignalScoutEnv,
  store: SignalRadarStore,
  orgId: string,
  report: SignalScoutReport,
  deps: SignalScoutDeps,
  graph: string[],
): Promise<void> {
  if (env.LEAD_RADAR_SIGNAL_DISCOVERY_ENABLED === 'false') return;
  const fetchText = deps.fetchText ?? defaultFetchText;
  const sleep = deps.sleep ?? defaultSleep;

  const accept = async (slug: string, kind: 'channel' | 'group', source: string, note: string | null) => {
    if (report.discovered >= SIGNAL_SCOUT_LIMITS.maxDiscoveriesPerTick) return false;
    if (!isSignalSlug(slug)) return false;
    if (await store.getTargetBySlug(orgId, slug)) return false;
    await store.upsertTarget(orgId, { slug, kind, source, note });
    report.discovered += 1;
    return true;
  };

  for (const url of [
    SIGNAL_DISCOVERY_SOURCES.tgstatChannels('uz'),
    SIGNAL_DISCOVERY_SOURCES.tgstatChats('uz'),
  ]) {
    if (report.discovered >= SIGNAL_SCOUT_LIMITS.maxDiscoveriesPerTick) return;
    const html = await fetchText(url);
    // A network miss on a ranking page is routine and says nothing about the
    // source; a page that arrives empty is the opposite. Only the second is
    // worth reporting, or the log fills up with weather.
    if (!html) continue;
    let seen = 0;
    for (const entity of parseTgstatEntities(html)) {
      seen += 1;
      if (report.discovered >= SIGNAL_SCOUT_LIMITS.maxDiscoveriesPerTick) break;
      await accept(entity.slug, entity.kind, 'tgstat:uz',
        entity.kind === 'group' ? 'Группа: нужен join, пока только наблюдаем' : null);
    }
    // A ranking page that served no entities is not an empty country — it is
    // an upstream that stopped talking to us, and the operator deserves to
    // read that rather than a row of zeroes.
    if (seen === 0) report.skipped.push('discovery:tgstat:empty');
    await sleep(SIGNAL_SCOUT_LIMITS.previewIntervalMs);
  }

  if (report.discovered > 0 || graph.length === 0) return;
  // The link graph, harvested only from channels that cleared the promote bar
  // during this tick. A good channel links to channels like itself; a news
  // feed links to more news feeds, which is exactly why we do not take links
  // from the ones that did not.
  for (const slug of graph) {
    const added = await accept(slug, 'channel', 'linked:uz', null);
    if (!added && report.discovered >= SIGNAL_SCOUT_LIMITS.maxDiscoveriesPerTick) break;
  }
}

/** Read one public preview, triage its posts, and remember what we learned. */
async function scoutTarget(
  store: SignalRadarStore,
  orgId: string,
  target: SignalTarget,
  now: string,
  nowMs: number,
  report: SignalScoutReport,
  deps: SignalScoutDeps,
): Promise<{ score: number; linkedSlugs: string[] }> {
  const nothing = { score: 0, linkedSlugs: [] as string[] };
  const fetchText = deps.fetchText ?? defaultFetchText;
  const html = await fetchText(`https://t.me/s/${target.slug}`);
  if (!html) {
    // A dead slug or a transient failure. Back off so we do not re-hammer it
    // every fifteen minutes for the rest of the week.
    await store.updateTarget(orgId, target.id, {
      next_action_at: new Date(nowMs + 6 * 3_600_000).toISOString(),
    });
    return nothing;
  }

  let preview: TelegramPreview;
  try {
    preview = parseTelegramPreview(html, target.slug);
  } catch {
    report.skipped.push(`${target.slug}:unparseable`);
    return nothing;
  }
  report.scouted += 1;

  // Telegram asks us not to index some pages. Honour it and forget the slug.
  if (!preview.indexable) {
    await store.updateTarget(orgId, target.id, { status: 'ignored', note: 'noindex от Telegram' });
    return nothing;
  }

  // A group has no web preview. There is nothing to read here without joining,
  // so stop spending fetches on it and let the join queue decide instead.
  if (preview.shape !== 'channel') {
    await store.updateTarget(orgId, target.id, {
      kind: preview.kind === 'channel' ? 'channel' : 'group',
      next_action_at: new Date(nowMs + 24 * 3_600_000).toISOString(),
    });
    return nothing;
  }

  const assessment = scoreSignalTarget(preview, { now: nowMs });

  let newPosts = 0;
  let newLeads = 0;
  let newestAt: number | null = null;
  for (const post of assessment.posts) {
    if (!post.text) continue;
    const occurredMs = post.occurredAt ? Date.parse(post.occurredAt) : Number.NaN;
    if (Number.isFinite(occurredMs) && (newestAt === null || occurredMs > newestAt)) {
      newestAt = occurredMs;
    }
    const key = await dedupKey(orgId, post.text);
    const inserted = await store.insertPost(orgId, {
      targetId: target.id,
      externalId: post.externalId || null,
      authorLabel: post.author,
      // A preview carries no @handle, only a display name. Replying needs a
      // handle, so the operator resolves it in the inbox before sending.
      authorHandle: null,
      excerpt: post.text.slice(0, 1200),
      dedupKey: key,
      occurredAt: post.occurredAt ?? now,
      triage: post.triage,
      // The tick's clock, not the wall clock. One tick, one timestamp: a post
      // written by this tick must be exactly as old as this tick says it is,
      // or retention — which runs off the same clock — quietly disagrees and
      // either keeps stranger text forever or deletes it before its time.
    }, now);
    // null means we already saw this exact text — the whole point of the key.
    if (!inserted) continue;
    newPosts += 1;
    // A `lead` verdict without a service would be a triage contradiction; the
    // service list is closed, so there is no honest fallback to invent.
    const service = post.triage.service ?? post.triage.services[0] ?? null;
    if (post.triage.verdict === 'lead' && service) {
      const created = await store.upsertLead(orgId, {
        postId: inserted,
        targetId: target.id,
        service,
        score: post.triage.score,
        authorLabel: post.author,
        authorHandle: null,
        quote: pickSignalQuote(post.text),
      }, now);
      if (created) newLeads += 1;
    }
  }

  report.posts += newPosts;
  report.leads += newLeads;

  const members = preview.members ?? target.members;

  // A candidate whose preview carries no messages at all is empty, dead, or not
  // readable from here. Leaving it a candidate makes it compete for preview
  // slots forever — against channels nobody has even looked at yet. Low *score*
  // is not the same thing and is deliberately not a reason to drop a channel:
  // language detection on a short preview is unreliable, and throwing away a
  // real Uzbek channel because we could not tell is worse than re-reading it.
  const unreadable = target.status === 'candidate' && assessment.posts.length === 0;

  // Evidence outranks promise. A channel is only worth a slot while it is
  // still capable of surprising us: `messages_seen` counts what it has handed
  // over and `leads_seen` counts what that was worth. A channel that has given
  // us forty posts and not one request is not a demand source, whatever its
  // subscriber count says, and a slot spent re-reading it is a slot not spent
  // on a channel nobody has ever looked at.
  const seen = target.messagesSeen + newPosts;
  const earned = target.leadsSeen + newLeads;
  const quiet = seen >= SIGNAL_SCOUT_LIMITS.quietAfterMessages && earned === 0;
  const spent = seen >= SIGNAL_SCOUT_LIMITS.retireAfterMessages && earned === 0;

  // A single lead in a single read is not enough to start polling a channel
  // every half hour: eight channels were promoted exactly that way, and one
  // of them was a holiday greeting on a marketing channel. Two requests in one
  // preview is evidence; one is a coincidence until the score agrees.
  const status = spent || unreadable
    ? 'ignored'
    : assessment.score >= PROMOTE_SCORE || newLeads >= 2
      ? (target.status === 'candidate' ? 'watching' : target.status)
      : target.status;

  const patch: Parameters<SignalRadarStore['updateTarget']>[2] = {
    kind: preview.kind === 'channel' ? 'channel' : target.kind,
    title: preview.title || target.title,
    score: assessment.score,
    members,
    status,
    messages_seen: seen,
    leads_seen: earned,
    last_post_at: newestAt !== null ? new Date(newestAt).toISOString() : target.lastPostAt,
    // A quiet channel is not thrown away, it is read less often: it keeps its
    // place in the queue but drifts to the back of it, so a genuine request
    // months from now is still found — just not at the cost of every tick.
    next_action_at: new Date(nowMs + (
      status === 'watching'
        ? (quiet ? SIGNAL_SCOUT_LIMITS.quietPollIntervalMinutes : SIGNAL_SCOUT_LIMITS.pollIntervalMinutes) * 60_000
        : SIGNAL_SCOUT_LIMITS.candidateReconMinutes * 60_000
    )).toISOString(),
  };
  // `note` is only ever written here when we are retiring the channel. Passing
  // `note: undefined` would bind NULL and silently wipe the operator's note (or
  // the "group, join later" marker) on every single poll.
  if (spent) patch.note = `пусто: ${seen} постов, ни одной заявки`;
  else if (unreadable) patch.note = 'пусто: ни одного поста в превью';

  await store.updateTarget(orgId, target.id, patch, now);

  // Only a channel we decided was worth watching is allowed to recommend its
  // neighbours. A news feed links to news feeds, and the whole point of the
  // link graph is that it inherits the quality of the seed.
  return {
    score: assessment.score,
    linkedSlugs: assessment.score >= PROMOTE_SCORE ? preview.linkedSlugs : [],
  };
}

/**
 * Compute join decisions for due targets. Records the pacing verdict so the
 * operator can see what would happen; performs no Telegram call.
 */
async function planJoins(
  db: D1Database | undefined,
  env: SignalScoutEnv,
  store: SignalRadarStore,
  orgId: string,
  now: string,
  report: SignalScoutReport,
): Promise<void> {
  // The mode is the master switch for the most dangerous feature in the
  // product, so it is the one knob an operator may turn without a deploy. It is
  // resolved once here, from the same function the admin UI reads, so the two
  // can never disagree about what is currently allowed.
  const { mode } = await resolveSignalMode(db, env);
  const policy = { ...SIGNAL_JOIN_POLICY, mode };
  if (policy.mode === 'off') return;

  const nowMs = Date.parse(now);
  const due = await store.claimDueTargets(orgId, now, policy.maxProbation);
  const counts = await store.counts(orgId);
  const snapshot: JoinQueueSnapshot = {
    // No join has ever been executed by this module, so nothing was spent
    // today. The quota is a ceiling we intend to stay under, not a receipt.
    joinsToday: 0,
    probationCount: counts.probation,
    joinedCount: counts.joined,
    cooldownUntil: null,
    quotaReduced: false,
    todayKey: localDayKey(nowMs, policy.utcOffsetMinutes),
  };

  for (const target of due) {
    const decision = decideJoin({ target, snapshot, policy, now: nowMs });
    if (decision.action === 'join') {
      // Intentionally not executed: joining needs the Telegram transport, and
      // pretending otherwise would be the most dangerous lie in this repo.
      report.joinPlanned += 1;
    }
    if (decision.nextActionAt) {
      await store.updateTarget(orgId, target.id, { next_action_at: decision.nextActionAt });
    }
  }
}

export interface SignalScoutOptions {
  /**
   * Manual scan (the operator pressed «Сканировать»). Ignore `next_action_at`
   * so the button actually does something: a cron tick is polite and waits for
   * a channel's polling date, a human asking for a scan is not.
   */
  force?: boolean;
  /** Restrict the tick to one organization. Manual scans are single-tenant. */
  orgId?: string;
}

/**
 * One bounded Signal Radar tick. Safe to call on every cron trigger: it does
 * nothing at all unless the switch is exactly "true" and the schema is present,
 * and every failure inside is contained.
 */
export async function runSignalScoutTick(
  env: SignalScoutEnv,
  db: D1Database | undefined,
  now = new Date(),
  deps: SignalScoutDeps = {},
  options: SignalScoutOptions = {},
): Promise<SignalScoutReport> {
  if (!signalRadarEnabled(env) || !db) return { ...EMPTY_REPORT };
  if (!(await signalSchemaReady(db))) return { ...EMPTY_REPORT };
  const sleep = deps.sleep ?? defaultSleep;

  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const report: SignalScoutReport = { ...EMPTY_REPORT, skipped: [] };

  // `off` is a hard stop checked *after* resolution, so it wins over the switch
  // that enabled the module. ENABLED says "this capability is provisioned";
  // mode `off` says "do not move", and the operator's word comes last.
  const resolved = await resolveSignalMode(db, env);
  if (resolved.mode === 'off') {
    return { ...report, skipped: ['mode_off'] };
  }

  // In `channels` and `join` the operator has told us what to read, so polling
  // already-watched channels outranks reconnoitring new ones. In `discover`
  // the reverse holds: finding new sources is the point.
  const pollingFirst = resolved.mode === 'channels' || resolved.mode === 'join';

  const organizations = allowedOrganizations(env)
    .filter((orgId) => !options.orgId || orgId === options.orgId);
  if (options.orgId && organizations.length === 0) {
    return { ...report, skipped: ['org_not_allowed'] };
  }

  for (const orgId of organizations) {
    report.orgs += 1;
    const store = new SignalRadarStore(db);
    try {
      // Retention first: stranger text should not outlive its usefulness even
      // if every network call below fails.
      await store.purgePostsOlderThan(
        orgId,
        new Date(nowMs - SIGNAL_SCOUT_LIMITS.postRetentionDays * 86_400_000).toISOString(),
      );

      // Ask for what is owed, not for what looks best. Under `score DESC` the
      // eight watched channels (48–55) filled every slot, and the never-scored
      // candidates (0) were never returned at all — so they never scored, so
      // they never left the pool, so discovery never refilled it.
      const candidates = await store.listTargets(orgId, {
        status: ['candidate', 'watching'],
        limit: SIGNAL_SCOUT_LIMITS.maxPreviewsPerTick,
        orderBy: 'due',
        now: nowIso,
      });
      const due = candidates
        .filter((target) => options.force || !target.nextActionAt || target.nextActionAt <= nowIso)
        .sort((left, right) => {
          if (left.status !== right.status) {
            const rank = pollingFirst
              ? (left.status === 'watching' ? -1 : 1)
              : (left.status === 'candidate' ? -1 : 1);
            return rank;
          }
          return right.score - left.score;
        });

      let fetched = 0;
      const graph: string[] = [];
      for (const target of due) {
        if (fetched >= SIGNAL_SCOUT_LIMITS.maxPreviewsPerTick) break;
        fetched += 1;
        try {
          const found = await scoutTarget(store, orgId, target, nowIso, nowMs, report, deps);
          graph.push(...found.linkedSlugs);
        } catch (error) {
          report.skipped.push(`${target.slug}:${(error as Error).message}`);
        }
        await sleep(SIGNAL_SCOUT_LIMITS.previewIntervalMs);
      }

      // Demand-driven discovery: refill when the *unexplored* pool runs dry,
      // which throttles itself without any extra bookkeeping table.
      //
      // Counting every candidate here was the second half of the stall: a
      // channel that has been reconnoitered and rejected keeps its status, so a
      // pool of dead channels reads as full forever and no new slug is ever
      // looked up. Only "never checked" means there is still something to learn.
      const unexplored = await store.countFreshCandidates(
        orgId,
        SIGNAL_SCOUT_LIMITS.discoverWhenCandidatesBelow,
      );
      if (unexplored < SIGNAL_SCOUT_LIMITS.discoverWhenCandidatesBelow) {
        await discover(env, store, orgId, report, deps, [...new Set(graph)]);
      }

      await planJoins(db, env, store, orgId, nowIso, report);
    } catch (error) {
      report.skipped.push(`${orgId}:${(error as Error).message}`);
    }
  }

  return report;
}
