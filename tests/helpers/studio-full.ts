// The full deck's test kit (T3.1), on top of studio-site.ts: a buyer (a
// Studio account session, as account.ts makes one, and an entitlement), the
// measured 12-slide Uzbek deck «Suvning tabiatda aylanishi» (T0.1,
// tests/fixtures/studio/measure30.json) and a Z.ai stand-in that answers
// each request by what it asks for, so parts written at once get their own
// slides whatever order they reach it in. No network, no remote database.
import { IdentityStore } from "../../functions/lib/gpt-chat/identity-store";
import { checkPart } from "../../functions/lib/studio/deck-schema";
import { PROOF_SYSTEM } from "../../functions/lib/studio/prompts";
import { STUDIO_ORG } from "../../functions/lib/studio/schema";
import { FIXTURE, SITE, zaiStream, type Site } from "./studio-site";

/** The switches of the paid release (full deck on), with room for many starts. */
export const PAID = {
  STUDIO_API: "on",
  STUDIO_FREE_DECK: "true",
  STUDIO_PAID_SERVICE: "on",
  STUDIO_FULL_DECK: "true",
  STUDIO_RAMP_DECKS_DAILY: "",
  STUDIO_FREE_DAILY_USD: "3",
  STUDIO_JOB_GLOBAL_PER_MIN: "60",
  STUDIO_MAX_SLIDES: "15",
};

export interface MeasuredDeck {
  readonly id: string;
  readonly topic: string;
  readonly slides: number;
  readonly outline: { title: string; subtitle: string; slides: Array<{ title: string; point: string; image_prompt: string }> };
  readonly parts: Array<{ indexes: number[]; slides: Array<{ index: number; title: string; bullets: string[]; notes: string }> }>;
}

const deck = (id: string) => FIXTURE.decks.find((item: { id: string }) => item.id === id) as MeasuredDeck;

/** uz04: 12 Uzbek slides, three parts. */
export const SUV = deck("uz04-suv-aylanishi");
/** ru03: 12 Russian slides, three parts. */
export const PROCENTY = deck("ru03-procenty");

export const FULL_TASK = { topic: SUV.topic, locale: "uz", audience: "maktab", slides: 12, palette: 2 } as const;
export const RU_TASK = { topic: PROCENTY.topic, locale: "ru", audience: "maktab", slides: 12, palette: 1 } as const;

export const STUDIO_ACCOUNT_COOKIE = "__Host-studio_account";
const HOUR = 3_600_000;

export interface Buyer {
  readonly cookie: string;
  readonly userId: string;
  readonly subject: string;
  readonly entitlementId: string;
}

let entitlements = 0;

/**
 * A Studio account signed in (IdentityStore.syntheticLogin("acct_studio_"),
 * exactly how account.ts makes one) with a live entitlement of
 * `presentations` full decks.
 */
export async function buyer(site: Site, over: { presentations?: number; mode?: "live" | "test"; endsAt?: number; sessionMs?: number } = {}): Promise<Buyer> {
  const now = Date.now();
  const { id, token } = await new IdentityStore(site.db.asD1(), STUDIO_ORG).syntheticLogin("acct_studio_", over.sessionMs ?? 365 * 24 * HOUR, now);
  const entitlementId = `se_test_${(++entitlements).toString().padStart(6, "0")}`;
  site.db.sqlite
    .prepare(
      `INSERT INTO studio_entitlements(org_id,id,order_id,user_id,mode,plan,plan_version,starts_at,ends_at,presentations_limit,photos_limit)
       VALUES(?,?,?,?,?,'oylik','studio-2026-10-decks-v1',?,?,?,0)`,
    )
    .run(STUDIO_ORG, entitlementId, entitlementId, id, over.mode ?? "live", now - HOUR, over.endsAt ?? now + 30 * 24 * HOUR, over.presentations ?? 10);
  return { cookie: `${STUDIO_ACCOUNT_COOKIE}=${token}`, userId: id, subject: `a:${id}`, entitlementId };
}

export const presentationsUsed = (site: Site, entitlementId: string) =>
  Number(site.db.value("SELECT presentations_used FROM studio_entitlements WHERE org_id=? AND id=?", STUDIO_ORG, entitlementId));

// ── What the model answers ──────────────────────────────────────────────────

/**
 * Part `i` (0-based) as the part step hands it out before any proofreading:
 * the measured slides through deck-schema.ts checkPart (Uzbek-normalized).
 */
export function writtenPart(i: number, measured: MeasuredDeck = SUV, locale: "uz" | "ru" = "uz") {
  const part = measured.parts[i];
  const checked = checkPart({ slides: part.slides }, { locale, topic: measured.topic, indexes: part.indexes });
  if (!checked.ok) throw new Error(`measured part ${i + 1} does not pass checkPart: ${checked.problems.join()}`);
  return checked.value.slides;
}

export type Asked = "outline" | "part" | "proof" | "free" | "other";

/** Which step a request to Z.ai is, from its system prompt. */
export function askedFor(body: Record<string, unknown>): Asked {
  const messages = body.messages as Array<{ role: string; content: string }>;
  const system = messages?.[0]?.content ?? "";
  if (system === PROOF_SYSTEM) return "proof";
  if (system.includes("Step 1 of 2")) return "outline";
  if (system.includes("Step 2 of 2")) return "part";
  if (system.includes("Write a short presentation in one go")) return "free";
  return "other";
}

/** The plan indexes a part request asks for («Write ONLY slides 5, 6, 7, 8»). */
export function askedIndexes(body: Record<string, unknown>): number[] {
  const messages = body.messages as Array<{ role: string; content: string }>;
  const match = /Write ONLY slides ([\d, ]+) \(plan indexes\)/.exec(messages[1].content);
  return match ? match[1].split(",").map((value) => Number(value.trim())) : [];
}

/** The JSON a proofreading request carries (the part and, for part 1, the cover). */
export function proofInput(body: Record<string, unknown>): { title?: string; subtitle?: string; slides: Array<{ index: number; title: string; bullets: string[]; notes: string }> } {
  const messages = body.messages as Array<{ role: string; content: string }>;
  return JSON.parse(messages[1].content);
}

export type Answer = (body: Record<string, unknown>) => Response | Promise<Response>;

/** The measured outline, as the model wrote it. */
export const outlineAnswer = (measured: MeasuredDeck = SUV) => zaiStream(JSON.stringify(measured.outline));

/** The measured part for the indexes a request asks for. */
export function partAnswer(body: Record<string, unknown>, measured: MeasuredDeck = SUV): Response {
  const indexes = askedIndexes(body);
  const part = measured.parts.find((item) => item.indexes.join() === indexes.join());
  if (!part) throw new Error(`no measured part for ${indexes.join()}`);
  return zaiStream(JSON.stringify({ slides: part.slides }));
}

/** A word the proofreading stand-in corrects in every bullet («suv» → «Suv»), so a proofread part is visible. */
export const PROOF_MARK = "✓";

/**
 * The proofreading stand-in: the part it was given, with PROOF_MARK added
 * to the end of the first bullet of every slide (the length and numbers
 * stay, so proofread.ts takes the correction).
 */
export function proofAnswer(body: Record<string, unknown>): Response {
  const input = proofInput(body);
  const slides = input.slides.map((slide) => ({ ...slide, bullets: slide.bullets.map((bullet, i) => (i === 0 ? `${bullet} ${PROOF_MARK}` : bullet)) }));
  return zaiStream(JSON.stringify({ ...input, slides }));
}

/**
 * Fills Site.zai with `count` answers that look at the request they answer
 * (studio-site.ts records it in site.sent just before it asks for the
 * answer): the outline, each part's own slides, the proofreading echo.
 * `override` may answer a request itself (return undefined to fall through).
 */
export function routeZai(site: Site, count = 40, override?: (asked: Asked, body: Record<string, unknown>, nth: number) => Response | undefined): void {
  const seen = new Map<Asked, number>();
  for (let i = 0; i < count; i++) {
    site.zai.push(() => {
      const body = site.sent[site.sent.length - 1].body;
      const asked = askedFor(body);
      const nth = (seen.get(asked) ?? 0) + 1;
      seen.set(asked, nth);
      const own = override?.(asked, body, nth);
      if (own) return own;
      if (asked === "outline") return outlineAnswer();
      if (asked === "part") return partAnswer(body);
      if (asked === "proof") return proofAnswer(body);
      throw new Error(`unexpected ${asked} request`);
    });
  }
}

/** Requests Z.ai got, by step. */
export const sentFor = (site: Site, asked: Asked) => site.sent.filter((item) => item.url.includes("z.ai") && askedFor(item.body) === asked);

export const FULL_SITE = SITE;
