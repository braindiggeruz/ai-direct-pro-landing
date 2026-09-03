/**
 * Signal Radar chat harvest — the network side of the chat surface.
 *
 * Like the scout, this lives in the automation Worker and never in a Pages
 * function: a Pages request gets ~30 ms of CPU on the Free plan, which is not
 * enough to fetch one catalogue page, let alone thirty.
 *
 * WHAT THIS CRAWLER IS ALLOWED TO DO, AND WHAT IT IS NOT
 *
 * It reads public catalogue pages and public `t.me/s/<slug>` cards. Both are
 * server-rendered HTML with no login, no API key and no account involved, and
 * both were fetched and parsed by hand before a line of this was written.
 *
 * It does NOT read messages. A group's history is not published — verified
 * live: the group card carries "N members, M online" and zero message widgets.
 * Reading what people said in a room costs a join, and a join is a decision
 * for the join queue and the operator, not for a crawler. So this file stops
 * at the card and never pretends to know what was said behind a door it has
 * not opened.
 *
 * PACING IS NOT OPTIONAL
 *
 * tgchats.org answers 429 after roughly six rapid requests. Measured, not
 * guessed: the first validation run lost half its queries to it. Every
 * directory fetch is therefore separated by `directoryIntervalMs`, and every
 * card fetch by `cardIntervalMs`. A crawler that gets itself blocked produces
 * an empty table, and an empty table looks exactly like "there are no such
 * rooms" — which is the most expensive lie this module could tell.
 *
 * A TICK IS A SLICE, NOT A HARVEST
 *
 * One cron tick takes a handful of sources from a rotating cursor and stops.
 * The whole rotation takes several ticks and then repeats. That is deliberate:
 * a single Worker invocation cannot hold twenty-five slow fetches, and a
 * rotation guarantees every query eventually gets its turn instead of the
 * first query being re-crawled forever.
 */

import { isSignalSlug } from '../../../src/shared/signal-radar';
import {
  assessChat,
  buildChatQueries,
  isLocalQuery,
  parseChatCard,
  parseTelegidEntries,
  parseTgchatsResults,
  parseTgstatPeers,
  tgchatsCityUrl,
  tgstatCategoryUrl,
  TELEGID_CATALOGUES,
  TGCHATS_CITIES,
  TGSTAT_CATEGORIES,
  type ChatHarvestConfig,
  type DirectoryEntry,
} from './signal-chats';
import {
  chatsSchemaReady,
  readChatHarvestConfig,
  readChatHarvestCursor,
  SignalChatStore,
  writeChatHarvestCursor,
  type ChatHarvestPending,
} from './signal-chat-store';

export interface ChatCrawlEnv {
  LEAD_RADAR_SIGNAL_ENABLED?: string;
  LEAD_RADAR_ALLOWED_ORGS?: string;
}

export const CHAT_CRAWL_LIMITS = {
  fetchTimeoutMs: 12_000,
  userAgent: 'Mozilla/5.0 (compatible; GPTBotSignalRadar/1.0; +https://gptbot.uz)',
  /** Verified live: tgchats 429s after ~6 requests in quick succession. */
  directoryIntervalMs: 2_200,
  /**
   * Telegram tolerates more, but the politeness costs us one card per tick.
   *
   * Left at 300 deliberately. A controlled A/B on the same sixty slugs — 300 ms
   * and 700 ms, same parsers, same hour — returned 60/60 resolved both times,
   * so the `unresolved` rooms in an earlier live run came from what we fetched
   * (dead handles and personal accounts reached through the link graph), not
   * from how fast we fetched it. Slowing down for a problem that is not
   * throttling would have halved the harvest to no benefit.
   */
  cardIntervalMs: 300,
  /**
   * One cron tick, by arithmetic rather than habit.
   *
   * A directory costs 2.2 s of deliberate waiting, a card 0.3 s, and the tick
   * has 26 s of wall clock:
   *
   *   2 directories   4.4 s
   *   30 cards        9.0 s
   *   8 graph rooms   2.4 s
   *   4 refreshes     1.2 s
   *                 ───────
   *                  17.0 s, with a third of the budget left for slow hosts.
   *
   * Twelve cards was the earlier figure and it left half the tick idle — the
   * harvest was not short of time, it was short of permission to spend it.
   */
  maxSourcesPerTick: 2,
  maxCardsPerTick: 30,
  /**
   * Manual harvest: the operator is watching the table fill up, so the round
   * is shaped to spend the whole budget without tripping over it.
   *
   *   3 directories   6.6 s
   *   50 cards       15.0 s
   *   8 graph rooms   2.4 s
   *                 ───────
   *                  24.0 s
   *
   * Eight directories were tried first and the budget was gone before the
   * twentieth card: 17.6 s of the 26 s went to pacing, and the harvest
   * reported `budget_reached` on every single round.
   */
  maxSourcesManual: 3,
  maxCardsManual: 50,
  /** Wall-clock ceiling. Whatever is left when this hits waits for next tick. */
  budgetMs: 26_000,
  /** Rooms re-checked per tick so `online` does not rot into a stale number. */
  maxRefreshPerTick: 4,
  refreshAfterDays: 3,
  /**
   * Sibling rooms followed per tick. Communities are not in any catalogue;
   * they are reachable only through the rooms that already belong to them.
   */
  maxGraphPerTick: 8,
  maxGraphManual: 8,
} as const;

export interface ChatHarvestReport {
  orgId: string | null;
  sources: string[];
  entries: number;
  cards: number;
  kept: number;
  refreshed: number;
  rejected: number;
  /** reject reason -> count. A filter nobody can audit is a filter nobody tunes. */
  reasons: Record<string, number>;
  skipped: string[];
  nextIndex: number;
  /** Rooms named by a catalogue and still waiting for a card fetch. */
  pending: number;
  elapsedMs: number;
}

/**
 * A fresh report, built per call.
 *
 * This is a function and not a constant because a shared object would be
 * mutated in place: `{ ...EMPTY_REPORT }` copies the reference to its
 * `sources` array, so every harvest in the lifetime of the isolate would push
 * into the same one and a report would claim credit for sources it never
 * touched. That is exactly what happened — a twelve-round run reported all
 * eighty-six sources on its last round.
 */
function emptyReport(): ChatHarvestReport {
  return {
    orgId: null, sources: [], entries: 0, cards: 0, kept: 0, refreshed: 0,
    rejected: 0, reasons: {}, skipped: [], nextIndex: 0, pending: 0, elapsedMs: 0,
  };
}

export interface ChatHarvestDeps {
  fetchText?: (url: string) => Promise<string | null>;
  sleep?: (ms: number) => Promise<void>;
}

export interface ChatHarvestOptions {
  orgId?: string;
  /** Operator pressed the button: spend the larger budget. */
  manual?: boolean;
  /** Extra queries on top of the stored configuration. */
  extraKeywords?: string[];
  /**
   * Override how many cards this harvest may open. Tests use it to prove a
   * backlog survives a harvest that could not finish; production lets the
   * default stand.
   */
  maxCards?: number;
}

interface ChatSource {
  url: string;
  parser: 'tgchats' | 'telegid' | 'tgstat';
  /** The query that produced it, stored on the row so a harvest is reproducible. */
  query: string | null;
  label: string;
  /** True when the source states the room's geography by construction. */
  local: boolean;
  /**
   * The topic this source classifies its rooms under, when it classifies by
   * topic. Carried into the assessment so a room that says nothing about
   * itself can still be confirmed by where a catalogue filed it.
   */
  topic: string | null;
}

/**
 * The city pages worth 2.2 seconds each.
 *
 * tgchats' `?city=` parameter accepts sixty-four Uzbek place names and
 * answers with 1 344 rooms between them. The distribution is brutally
 * top-heavy: Tashkent and Samarkand return fifty apiece, while the district
 * towns return one to six, and those one to six are, without exception, the
 * town's classifieds board.
 *
 * The country-wide catalogues — `telegid:uzbekistan` with 260 rooms,
 * `tgchats:узбекистан` with 48 — already carry the small-city rooms that
 * matter. Paying for sixty-four city pages to rediscover them was the
 * harvest's single largest waste of its pacing budget.
 */
const CHAT_PRIORITY_CITIES = new Set([
  'ташкент', 'tashkent', 'toshkent',
  'самарканд', 'samarqand',
  'андижан', 'andijan',
  'наманган', 'namangan',
  'бухара', 'bukhara',
  'фергана', 'fergana',
  'карши', 'karshi',
  'нукус', 'nukus',
  'термез', 'termez',
  'коканд', 'kokand',
  'узбекистан', 'uzbekistan', "o'zbekiston",
]);

/**
 * Every source in rotation order.
 *
 * Three kinds of source, and they are interleaved rather than concatenated.
 * TGStat's category ratings state what a room is *about*. Local sources —
 * telegid's city and country paths, tgchats' `?city=` pages — state where a
 * room *is*. Keyword sources are four fifths Russian mutual-promotion rooms,
 * but they are also the only source that answers the operator's own question,
 * whatever they typed into the topic box.
 *
 * Concatenating them would have been the obvious ordering — locals first,
 * because they are better — and it is wrong. There are twenty-odd local
 * sources and a manual harvest visits three, so with locals first the
 * operator's keywords would never be reached: not on the first run, not on
 * the tenth. The rotation alternates instead, so every window of the
 * rotation, and therefore every harvest, contains both.
 */
export function chatHarvestSources(config: ChatHarvestConfig): ChatSource[] {
  const topical: ChatSource[] = [];
  // TGStat's category ratings answer "what rooms exist about marketing".
  // A city directory answers "what rooms exist in Tashkent". The first
  // question is the one the operator asked, and on 2026-09-03 the second one
  // answered it with 1 614 rooms of which thirty-seven survived — twenty of
  // them bakeries and taxi dispatch, held up entirely by the words "заказ"
  // and "buyurtma".
  for (const category of TGSTAT_CATEGORIES) {
    topical.push({
      url: tgstatCategoryUrl(category.id),
      parser: 'tgstat',
      query: null,
      label: `tgstat:${category.id}`,
      local: true,
      topic: category.topic,
    });
  }
  const local: ChatSource[] = [];
  for (const url of TELEGID_CATALOGUES) {
    const city = url.split('/').pop() ?? 'uz';
    local.push({ url, parser: 'telegid', query: null, label: `telegid:${city}`, local: true, topic: null });
  }
  // Only the largest cities. Sixty-four city pages produced 1 344 rooms and
  // thirty-seven survivors, and every one of the nine hundred pages in
  // between cost 2.2 s of deliberate waiting to confirm that a district town
  // has one classifieds board. The country-wide pages are what carry the
  // small-city rooms that matter, and they are a fraction of the budget.
  const cities = TGCHATS_CITIES.filter((city) => CHAT_PRIORITY_CITIES.has(city.toLowerCase()));
  for (const city of cities) {
    local.push({
      url: tgchatsCityUrl(city),
      parser: 'tgchats',
      query: null,
      label: `tgchats:city:${city}`,
      local: true,
      topic: null,
    });
  }
  // A topic word finds topic rooms, but not local ones.
  //
  // Measured on 2026-09-03 across thirteen topic queries, Russian and Uzbek:
  // `маркетинг` 49 rooms, `дизайн` 49, `dasturlash` 15, `frilans` 1 — and
  // between 30 and 45 of every 50 were rejected `no-geo`. The directory indexes
  // the Russian-speaking web, so a search for "маркетинг" answers with Moscow
  // marketing rooms that never mention the country we are looking in. Zero of
  // those thirteen queries produced a single room that survived `localOnly`.
  //
  // A place word is the opposite: `?search=ташкент` returns fifty rooms that
  // are in Tashkent by construction. So under `localOnly` the rotation keeps
  // queries that are places and drops the rest. The operator's words still do
  // their real job — they are match terms, deciding which of the rooms the
  // city catalogues hand us are worth a look — and turning `localOnly` off
  // restores every query as a source.
  const keyword: ChatSource[] = buildChatQueries(config)
    .filter((query) => !config.localOnly || isLocalQuery(query))
    .map((query) => ({
      url: `https://tgchats.org/?search=${encodeURIComponent(query)}`,
      parser: 'tgchats' as const,
      query,
      label: `tgchats:${query}`,
      local: isLocalQuery(query),
      topic: null,
    }));

  // Three kinds, interleaved, and the interleaving is the whole design.
  //
  // Putting topical first was the obvious ordering — it is the source that
  // answers the actual question — and it starves the operator. Fifteen
  // categories at the head of the rotation, three directory slots per
  // harvest, means five whole rounds before a single keyword query is looked
  // at, and the operator's own words are the one part of the configuration no
  // catalogue can supply.
  //
  // Round-robin in a fixed priority: every window of three consecutive
  // sources contains one topical, one city and one keyword source, so a
  // harvest cut short by its budget after one slot still spends that slot on
  // the best available answer, and after three has touched all three kinds.
  return interleaveSources([topical, local, keyword]);
}

/**
 * Round-robin across buckets, in the order the buckets are given.
 *
 * Fixed priority rather than longest-first: with fifteen topical sources,
 * thirty-three city ones and thirteen keywords, sorting by length would have
 * put a city page first and the operator's own words last — exactly the
 * starvation the interleaving exists to prevent.
 */
function interleaveSources(buckets: ChatSource[][]): ChatSource[] {
  const depth = Math.max(0, ...buckets.map((bucket) => bucket.length));
  const out: ChatSource[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < depth; index += 1) {
    for (const bucket of buckets) {
      const source = bucket[index];
      if (!source || seen.has(source.label)) continue;
      seen.add(source.label);
      out.push(source);
    }
  }
  return out;
}

async function defaultFetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': CHAT_CRAWL_LIMITS.userAgent,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ru,uz,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(CHAT_CRAWL_LIMITS.fetchTimeoutMs),
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/i.test(contentType)) return null;
    return await response.text();
  } catch {
    // Timeouts, 429s and TLS errors are routine out here. A missed catalogue
    // costs one query; a tick that throws costs the whole rotation.
    return null;
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function allowedOrganizations(env: ChatCrawlEnv): string[] {
  return (env.LEAD_RADAR_ALLOWED_ORGS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^(?:owner_[a-f0-9]{24}|org_[a-f0-9]{32,64})$/.test(item));
}

/**
 * Take one candidate from each source in turn.
 *
 * Naive concatenation hands the entire card budget to whichever source was
 * fetched first, so a Tashkent catalogue of sixty rooms would consume every
 * slot and the operator's own keywords would never be looked at. Round-robin
 * guarantees every source is represented in every harvest, however small.
 */
function interleave(buckets: DirectoryEntry[][]): DirectoryEntry[] {
  const out: DirectoryEntry[] = [];
  const cursors = buckets.map(() => 0);
  let remaining = buckets.reduce((sum, bucket) => sum + bucket.length, 0);
  while (remaining > 0) {
    for (let index = 0; index < buckets.length; index += 1) {
      const bucket = buckets[index];
      const at = cursors[index];
      if (at >= bucket.length) continue;
      out.push(bucket[at]);
      cursors[index] = at + 1;
      remaining -= 1;
    }
  }
  return out;
}

function dedupeEntries(buckets: DirectoryEntry[][]): DirectoryEntry[] {
  const seen = new Set<string>();
  const cleaned: DirectoryEntry[][] = buckets.map((bucket) => bucket.filter((entry) => {
    if (!isSignalSlug(entry.slug)) return false;
    const key = entry.slug.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
  return interleave(cleaned);
}

export async function runChatHarvest(
  env: ChatCrawlEnv,
  db: D1Database | undefined,
  now = new Date(),
  deps: ChatHarvestDeps = {},
  options: ChatHarvestOptions = {},
): Promise<ChatHarvestReport> {
  if (env.LEAD_RADAR_SIGNAL_ENABLED !== 'true' || !db) return emptyReport();
  if (!(await chatsSchemaReady(db))) {
    return { ...emptyReport(), skipped: ['chats_schema_missing'] };
  }
  const fetchText = deps.fetchText ?? defaultFetchText;
  const sleep = deps.sleep ?? defaultSleep;
  const startedAt = Date.now();
  const deadline = startedAt + CHAT_CRAWL_LIMITS.budgetMs;
  const nowIso = now.toISOString();

  const organizations = allowedOrganizations(env)
    .filter((orgId) => !options.orgId || orgId === options.orgId);
  if (organizations.length === 0) {
    return { ...emptyReport(), skipped: ['org_not_allowed'] };
  }
  const orgId = organizations[0];

  const report: ChatHarvestReport = {
    ...emptyReport(), orgId, reasons: {}, skipped: [],
  };

  const store = new SignalChatStore(db);
  const config = await readChatHarvestConfig(db, orgId);
  if (options.extraKeywords && options.extraKeywords.length > 0) {
    const merged = [...new Set([...config.keywords, ...options.extraKeywords])];
    config.keywords = merged.slice(0, 40);
  }

  const manual = options.manual === true;
  const maxSources = manual ? CHAT_CRAWL_LIMITS.maxSourcesManual : CHAT_CRAWL_LIMITS.maxSourcesPerTick;
  const maxCards = options.maxCards
    ?? (manual ? CHAT_CRAWL_LIMITS.maxCardsManual : CHAT_CRAWL_LIMITS.maxCardsPerTick);

  const sources = chatHarvestSources(config);
  const cursor = await readChatHarvestCursor(db, orgId);
  const startIndex = cursor ? cursor.index % sources.length : 0;

  // A backlog that already fills this round is not topped up. Buying another
  // paced directory request while forty rooms are waiting is paying twice for
  // the same work, and the second payment is the expensive one: a directory
  // costs 2.2 s of deliberate silence, a card costs 0.3 s.
  //
  // Freezing the rotation while directories were still being bought is how
  // the harvest starved itself. The cursor advanced only when the backlog was
  // empty, and the backlog was never empty — every directory page returned
  // fifty more rooms than one tick could open. Measured over fourteen live
  // rounds: `next=0` every time, four of eighty-six sources ever visited, and
  // the same four answering every question.
  const backlogSize = (cursor?.pending ?? []).length;
  const needDirectories = backlogSize < maxCards;

  try {
    // ── Pass 1: directory pages ────────────────────────────────────────────
    const buckets: DirectoryEntry[][] = [];
    const usedSources: ChatSource[] = [];
    let taken = 0;
    if (!needDirectories) {
      report.skipped.push(`backlog_first:${backlogSize}`);
    }
    for (let offset = 0; needDirectories && offset < sources.length && taken < maxSources; offset += 1) {
      if (Date.now() >= deadline) {
        report.skipped.push('budget_reached');
        break;
      }
      const source = sources[(startIndex + offset) % sources.length];
      const html = await fetchText(source.url);
      if (!html) {
        report.skipped.push(`${source.label}:empty`);
      } else {
        const entries = source.parser === 'tgchats'
          ? parseTgchatsResults(html)
          : source.parser === 'tgstat'
            ? parseTgstatPeers(html).map((slug) => ({ slug, title: '', about: '', members: null }))
            : parseTelegidEntries(html);
        buckets.push(entries);
        usedSources.push(source);
        report.sources.push(source.label);
        if (entries.length === 0) report.skipped.push(`${source.label}:no_entries`);
      }
      taken += 1;
      await sleep(CHAT_CRAWL_LIMITS.directoryIntervalMs);
    }

    const entries = dedupeEntries(buckets);
    report.entries = entries.length;

    // The source a candidate came from travels with it, because "we found it
    // under Tashkent" is the only geography some rooms will ever have.
    const sourceOf = new Map<string, ChatSource>();
    for (let index = 0; index < buckets.length; index += 1) {
      for (const entry of buckets[index]) {
        if (!sourceOf.has(entry.slug.toLowerCase())) sourceOf.set(entry.slug.toLowerCase(), usedSources[index]);
      }
    }

    // ── Pass 2: cards ──────────────────────────────────────────────────────
    // What we owe a card fetch: whatever the last harvest could not get to,
    // then whatever this one just found. Rooms named by a catalogue are spent
    // once over as many ticks as it takes, instead of being re-discovered —
    // at one paced directory request per fifty rooms — every single time.
    const backlog: ChatHarvestPending[] = [...(cursor?.pending ?? [])];
    const seen = new Set(backlog.map((item) => item.slug.toLowerCase()));
    for (const entry of entries) {
      const key = entry.slug.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      backlog.push({ slug: entry.slug, source: sourceOf.get(key)?.label ?? 'manual' });
    }

    // Known slugs are skipped before a single fetch: re-reading a room we
    // already judged is the most expensive way to learn nothing.
    const known = await store.knownSlugs(orgId, backlog.map((item) => item.slug));
    const queue = backlog.filter((item) => !known.has(item.slug.toLowerCase()));

    // Geography comes from the source label, which is why the label travels
    // with the room across ticks: a backlog written last week must still know
    // it was found under a city.
    const sourceByLabel = new Map(sources.map((source) => [source.label, source]));

    // Rooms discovered through the link graph. Filled by pass 2, walked in
    // pass 2b.
    const frontier: Array<{ slug: string; local: boolean; via: string; good: boolean }> = [];
    const queued = new Set(queue.map((item) => item.slug.toLowerCase()));

    let fetched = 0;
    let consumed = 0;
    for (const entry of queue) {
      if (fetched >= maxCards) break;
      if (Date.now() >= deadline) {
        report.skipped.push('budget_reached');
        break;
      }
      consumed += 1;
      fetched += 1;

      let card;
      try {
        // The card is the authority. A catalogue's own name and member count
        // are frequently months out of date; `t.me/s/<slug>` is the room
        // describing itself, today.
        const html = await fetchText(`https://t.me/s/${entry.slug}`);
        if (!html) {
          report.skipped.push(`${entry.slug}:unreachable`);
          continue;
        }
        card = parseChatCard(html, entry.slug);
      } catch {
        report.skipped.push(`${entry.slug}:unparseable`);
        continue;
      }
      report.cards += 1;

      const source = sourceByLabel.get(entry.source);
      const verdict = assessChat(
        {
          slug: card.slug,
          kind: card.kind,
          title: card.title,
          about: card.about,
          members: card.members,
          online: card.online,
          indexable: card.indexable,
          localHint: entry.local ?? source?.local === true,
          topicHint: source?.topic ?? null,
        },
        config,
      );

      const rejection = verdict.reject ?? (card.title ? null : 'unresolved');
      if (rejection) {
        report.rejected += 1;
        const bucket = rejection.includes(':') ? rejection.split(':')[0] : rejection;
        report.reasons[bucket] = (report.reasons[bucket] ?? 0) + 1;
      } else {
        report.kept += 1;
      }

      // Every card we read is also a map. Siblings of a room that survived
      // are the interesting ones, so they are marked and walked first.
      // Geography is only inherited from a source that stated it — a Tashkent
      // room is perfectly capable of linking to Moscow.
      for (const linked of card.linkedSlugs) {
        const key = linked.toLowerCase();
        if (key === card.slug.toLowerCase() || queued.has(key)) continue;
        queued.add(key);
        frontier.push({
          slug: linked,
          local: source?.local === true,
          via: card.slug,
          good: !rejection,
        });
      }

      await store.upsertChat(orgId, {
        slug: card.slug,
        title: card.title || null,
        about: card.about || null,
        kind: card.kind,
        topic: verdict.topic,
        confidence: verdict.confidence,
        members: card.members,
        online: card.online,
        activity: verdict.activity,
        canWrite: verdict.canWrite,
        canWriteBasis: verdict.canWriteBasis,
        relevance: verdict.relevance,
        matched: verdict.matched,
        rejectReason: rejection,
        source: entry.source,
        query: source?.query ?? null,
        checkedAt: nowIso,
      }, nowIso);

      await sleep(CHAT_CRAWL_LIMITS.cardIntervalMs);
    }

    // Whatever the budget would not pay for waits for the next tick, in the
    // order it was found. Graph rooms go first when pass 2b did not reach
    // them: they were named by a room we have already read, which makes them
    // the best guess in the system.
    const leftover: ChatHarvestPending[] = [];

    // ── Pass 2b: walk the link graph ───────────────────────────────────────
    // Catalogues index geography; they do not index communities. A city page
    // is a list of rooms that happen to be in a city — mostly taxis, bazaars
    // and apartments — and no amount of tuning turns it into a list of rooms
    // where someone commissions a website.
    //
    // The rooms worth writing in are found through the rooms we already
    // found. Almost every Uzbek group description advertises its siblings as
    // @handles, and a room a marketing group points at is far likelier to be
    // a marketing group than the next row of a city catalogue is. This is the
    // only source here that gets better the longer the harvest runs, and it
    // is the one that finds rooms no catalogue has ever indexed.
    const graphLimit = manual
      ? CHAT_CRAWL_LIMITS.maxGraphManual
      : CHAT_CRAWL_LIMITS.maxGraphPerTick;
    frontier.sort((a, b) => Number(b.good) - Number(a.good));
    const knownGraph = await store.knownSlugs(orgId, frontier.map((item) => item.slug));
    let walked = 0;
    for (const item of frontier) {
      if (walked >= graphLimit) {
        leftover.push({ slug: item.slug, source: `graph:${item.via}`, local: item.local });
        continue;
      }
      if (Date.now() >= deadline) {
        // One note, not one note per room. The frontier is a list of a hundred
        // siblings and the log said `budget_reached_graph` a hundred times,
        // which is how a real signal turns into noise nobody reads.
        if (!report.skipped.includes('budget_reached_graph')) {
          report.skipped.push('budget_reached_graph');
        }
        // The rest of the frontier is the most valuable thing in this harvest.
        // It was named by rooms we have already read, so it waits at the front
        // of the backlog rather than being re-discovered by a catalogue.
        leftover.push({ slug: item.slug, source: `graph:${item.via}`, local: item.local });
        continue;
      }
      if (knownGraph.has(item.slug.toLowerCase())) continue;

      let card;
      try {
        const html = await fetchText(`https://t.me/s/${item.slug}`);
        if (!html) continue;
        card = parseChatCard(html, item.slug);
      } catch {
        continue;
      }
      walked += 1;
      report.cards += 1;
      report.entries += 1;

      const verdict = assessChat(
        {
          slug: card.slug,
          kind: card.kind,
          title: card.title,
          about: card.about,
          members: card.members,
          online: card.online,
          indexable: card.indexable,
          localHint: item.local,
        },
        config,
      );
      const rejection = verdict.reject ?? (card.title ? null : 'unresolved');
      if (rejection) {
        report.rejected += 1;
        const bucket = rejection.includes(':') ? rejection.split(':')[0] : rejection;
        report.reasons[bucket] = (report.reasons[bucket] ?? 0) + 1;
      } else {
        report.kept += 1;
      }

      await store.upsertChat(orgId, {
        slug: card.slug,
        title: card.title || null,
        about: card.about || null,
        kind: card.kind,
        topic: verdict.topic,
        confidence: verdict.confidence,
        members: card.members,
        online: card.online,
        activity: verdict.activity,
        canWrite: verdict.canWrite,
        canWriteBasis: verdict.canWriteBasis,
        relevance: verdict.relevance,
        matched: verdict.matched,
        rejectReason: rejection,
        source: `graph:${item.via}`,
        query: null,
        checkedAt: nowIso,
      }, nowIso);

      await sleep(CHAT_CRAWL_LIMITS.cardIntervalMs);
    }

    // Graph rooms first — they were named by rooms we have already read —
    // then the tail of the catalogue queue in the order it was found.
    leftover.push(...queue.slice(consumed).map((item) => ({
      slug: item.slug,
      source: item.source,
      local: sourceByLabel.get(item.source)?.local === true,
    })));

    // ── Pass 3: keep the table honest ──────────────────────────────────────
    // `online` is a snapshot of a moment. A room that was live in September
    // and dead in November must not keep saying "живой" — so a few of the
    // oldest rows are re-read every tick, in the time that is left.
    if (!manual) {
      const staleBefore = new Date(
        now.getTime() - CHAT_CRAWL_LIMITS.refreshAfterDays * 86_400_000,
      ).toISOString();
      const stale = await store.listStaleChats(orgId, CHAT_CRAWL_LIMITS.maxRefreshPerTick, staleBefore);
      for (const chat of stale) {
        if (Date.now() >= deadline) break;
        const html = await fetchText(`https://t.me/s/${chat.slug}`);
        if (!html) continue;
        const card = parseChatCard(html, chat.slug);
        // A room we already accepted keeps its geography; a room we already
        // rejected does not gain one. Re-checking presence must never become
        // a second, quieter admission decision.
        const verdict = assessChat(
          { ...card, localHint: chat.status !== 'rejected' },
          config,
        );
        await store.upsertChat(orgId, {
          slug: chat.slug,
          title: card.title || chat.title,
          about: card.about || chat.about,
          kind: card.kind,
          topic: verdict.topic,
          confidence: verdict.confidence,
          members: card.members ?? chat.members,
          online: card.online,
          activity: verdict.activity,
          canWrite: verdict.canWrite,
          canWriteBasis: verdict.canWriteBasis,
          relevance: verdict.relevance,
          matched: verdict.matched,
          rejectReason: verdict.reject,
          source: chat.source,
          query: chat.query,
          checkedAt: nowIso,
        }, nowIso);
        report.refreshed += 1;
        await sleep(CHAT_CRAWL_LIMITS.cardIntervalMs);
      }
    }

    // The cursor advances by the directories it actually spent. A round that
    // bought four pages moves past all four — their rooms are in the backlog
    // now, and re-reading page four next tick would produce the same fifty
    // slugs we are already carrying. A round that bought none stays put:
    // nothing was consumed, so there is nothing to advance past.
    const nextIndex = taken === 0 ? startIndex : (startIndex + taken) % sources.length;
    await writeChatHarvestCursor(db, orgId, {
      index: nextIndex,
      query: sources[nextIndex]?.query ?? null,
      at: nowIso,
      by: manual ? 'manual' : 'cron',
      pending: leftover,
    });
    report.nextIndex = nextIndex;
    report.pending = leftover.length;
  } catch (error) {
    report.skipped.push(`harvest_failed:${(error as Error).message}`);
  }

  report.elapsedMs = Date.now() - startedAt;
  return report;
}
