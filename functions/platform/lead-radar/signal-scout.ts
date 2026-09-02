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
  /** Recon revisit delay for a candidate that scored too low to watch. */
  candidateReconMinutes: 240,
  /** Raw post text is retained only long enough to triage and quote it. */
  postRetentionDays: 7,
} as const;

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
 */
async function discover(
  env: SignalScoutEnv,
  store: SignalRadarStore,
  orgId: string,
  report: SignalScoutReport,
  deps: SignalScoutDeps,
): Promise<void> {
  if (env.LEAD_RADAR_SIGNAL_DISCOVERY_ENABLED === 'false') return;
  const fetchText = deps.fetchText ?? defaultFetchText;
  const sleep = deps.sleep ?? defaultSleep;

  for (const url of [
    SIGNAL_DISCOVERY_SOURCES.tgstatChannels('uz'),
    SIGNAL_DISCOVERY_SOURCES.tgstatChats('uz'),
  ]) {
    if (report.discovered >= SIGNAL_SCOUT_LIMITS.maxDiscoveriesPerTick) return;
    const html = await fetchText(url);
    if (!html) continue;

    for (const entity of parseTgstatEntities(html)) {
      if (report.discovered >= SIGNAL_SCOUT_LIMITS.maxDiscoveriesPerTick) break;
      if (!isSignalSlug(entity.slug)) continue;
      const existing = await store.getTargetBySlug(orgId, entity.slug);
      if (existing) continue;
      await store.upsertTarget(orgId, {
        slug: entity.slug,
        kind: entity.kind,
        source: 'tgstat:uz',
        note: entity.kind === 'group' ? 'Группа: нужен join, пока только наблюдаем' : null,
      });
      report.discovered += 1;
    }
    await sleep(SIGNAL_SCOUT_LIMITS.previewIntervalMs);
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
): Promise<void> {
  const fetchText = deps.fetchText ?? defaultFetchText;
  const html = await fetchText(`https://t.me/s/${target.slug}`);
  if (!html) {
    // A dead slug or a transient failure. Back off so we do not re-hammer it
    // every fifteen minutes for the rest of the week.
    await store.updateTarget(orgId, target.id, {
      next_action_at: new Date(nowMs + 6 * 3_600_000).toISOString(),
    });
    return;
  }

  let preview: TelegramPreview;
  try {
    preview = parseTelegramPreview(html, target.slug);
  } catch {
    report.skipped.push(`${target.slug}:unparseable`);
    return;
  }
  report.scouted += 1;

  // Telegram asks us not to index some pages. Honour it and forget the slug.
  if (!preview.indexable) {
    await store.updateTarget(orgId, target.id, { status: 'ignored', note: 'noindex от Telegram' });
    return;
  }

  // A group has no web preview. There is nothing to read here without joining,
  // so stop spending fetches on it and let the join queue decide instead.
  if (preview.shape !== 'channel') {
    await store.updateTarget(orgId, target.id, {
      kind: preview.kind === 'channel' ? 'channel' : 'group',
      next_action_at: new Date(nowMs + 24 * 3_600_000).toISOString(),
    });
    return;
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
    });
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
      });
      if (created) newLeads += 1;
    }
  }

  report.posts += newPosts;
  report.leads += newLeads;

  const members = preview.members ?? target.members;
  const status = assessment.score >= 40 || newLeads > 0
    ? (target.status === 'candidate' ? 'watching' : target.status)
    : target.status;

  await store.updateTarget(orgId, target.id, {
    kind: preview.kind === 'channel' ? 'channel' : target.kind,
    title: preview.title || target.title,
    score: assessment.score,
    members,
    status,
    messages_seen: target.messagesSeen + newPosts,
    leads_seen: target.leadsSeen + newLeads,
    last_post_at: newestAt !== null ? new Date(newestAt).toISOString() : target.lastPostAt,
    next_action_at: new Date(nowMs + (
      status === 'watching'
        ? SIGNAL_SCOUT_LIMITS.pollIntervalMinutes * 60_000
        : SIGNAL_SCOUT_LIMITS.candidateReconMinutes * 60_000
    )).toISOString(),
  });
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

      // Recon first, then polling: an unknown channel tells us nothing, so it
      // outranks a channel we already understand.
      const candidates = await store.listTargets(orgId, {
        status: ['candidate', 'watching'],
        limit: SIGNAL_SCOUT_LIMITS.maxPreviewsPerTick,
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
      for (const target of due) {
        if (fetched >= SIGNAL_SCOUT_LIMITS.maxPreviewsPerTick) break;
        fetched += 1;
        try {
          await scoutTarget(store, orgId, target, nowIso, nowMs, report, deps);
        } catch (error) {
          report.skipped.push(`${target.slug}:${(error as Error).message}`);
        }
        await sleep(SIGNAL_SCOUT_LIMITS.previewIntervalMs);
      }

      // Demand-driven discovery: refill only when the pool runs dry, which
      // throttles itself without any extra bookkeeping table.
      const remaining = await store.listTargets(orgId, {
        status: 'candidate',
        limit: SIGNAL_SCOUT_LIMITS.discoverWhenCandidatesBelow,
      });
      if (remaining.length < SIGNAL_SCOUT_LIMITS.discoverWhenCandidatesBelow) {
        await discover(env, store, orgId, report, deps);
      }

      await planJoins(db, env, store, orgId, nowIso, report);
    } catch (error) {
      report.skipped.push(`${orgId}:${(error as Error).message}`);
    }
  }

  return report;
}
