// GET /api/studio/me — what this browser has left (spec §6).
//
// Open while STUDIO_API or STUDIO_PAID_SERVICE is on (studioGate).
//
// The free part. Without a valid __Host-studio_bid the answer needs no D1:
// identity false and the full daily limits. With one:
//   1. the person's own expired jobs are closed by the expiry rules first
//      (jobs.ts expireOwnJobs: one indexed read of ≤ 20 rows, a guarded close
//      only for an expired job), so a unit owed back (a job that faulted,
//      was dropped mid-request or never got its model) is back before it is
//      counted. Until the maintenance sweep runs (T4.3) nothing else gives
//      it back, and the island reads `left` before it ever starts a job;
//   2. the two counters of today (studio_free_usage, two primary-key reads
//      in one batch) give what is left;
//   3. a unit an open job still holds says until when (`openUntil`): the
//      island then says "try again after HH:MM", not "used for today".
// The day is the UTC date, so the units come back at 05:00 in Tashkent.
//
// The paid part («Mening paketim», T3.2), only while STUDIO_PAID_SERVICE is
// on and the browser carries a studio account cookie (no cookie: no D1 read
// for it):
//   account       {signedIn: true} for a live session of a studio account;
//   entitlements  the running tariffs of the viewer's mode (live; test only
//                 in a local rehearsal), with what is left of each and the
//                 jobs that may still be made once more;
//   latestOrder   the account's newest order: its number (shown after
//                 payment: «To‘lov raqamini saqlang»), state, plan and
//                 whether the buyer may still close it;
//   receipts      the links of printed receipts of those orders (receiptLink:
//                 ofd.soliq.uz and the providers' receipt hosts only).
// While a tariff runs the session's end moves to the tariff's end + 30 days
// and the cookie is sent again (account.ts extendStudioSession).
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { receiptLink } from "../../lib/gpt-chat/fiscal-config";
import { extendStudioSession, hasAccountCookie, readStudioAccount } from "../../lib/studio/account";
import { studioGate, studioRequestConfig } from "../../lib/studio/config";
import { freeLeft, type FreeLeft } from "../../lib/studio/free-usage";
import { fail, json, studioLog } from "../../lib/studio/http";
import { readIdentity } from "../../lib/studio/identity";
import { expireOwnJobs, REGEN_WINDOW_MS, type OwnJobs } from "../../lib/studio/jobs";
import { ensureDeckSchema } from "../../lib/studio/presentation";
import { StudioStore, ensureStudioPaidSchema, viewerMode, type StudioEntitlement, type StudioOrder } from "../../lib/studio/store";

const iso = (at: number) => new Date(at).toISOString();

/** A running tariff as the island shows it. */
function entitlementView(row: StudioEntitlement, regen: readonly string[]) {
  return {
    id: row.id,
    orderId: row.order_id,
    plan: row.plan,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    presentationsLeft: Math.max(0, row.presentations_limit - row.presentations_used),
    presentationsLimit: row.presentations_limit,
    photosLeft: Math.max(0, row.photos_limit - row.photos_used),
    photosLimit: row.photos_limit,
    regenAvailable: regen,
  };
}

function orderView(row: StudioOrder, now: number) {
  return {
    id: row.id,
    state: row.state,
    plan: row.plan,
    provider: row.provider,
    amountUzs: row.amount / 100,
    createdAt: iso(row.created_at),
    paidAt: row.perform_time > 0 ? iso(row.perform_time) : null,
    paymentNumber: row.provider_doc_id,
    cancellable: row.state === "pending" && !row.external_id && row.expires_at > now,
  };
}

interface PaidPart {
  readonly account: { readonly signedIn: true } | null;
  readonly entitlements: ReturnType<typeof entitlementView>[];
  readonly latestOrder: ReturnType<typeof orderView> | null;
  readonly receipts: Array<{ orderId: string; kind: "PERFORM" | "CANCEL"; url: string }>;
}

const NO_PAID_PART: PaidPart = { account: null, entitlements: [], latestOrder: null, receipts: [] };

/** The paid part for the request's studio account, and the cookie to send again when its session grew. */
async function paidPart(request: Request, db: D1Database, payments: "off" | "test" | "live", now: number): Promise<{ part: PaidPart; cookie: string | null }> {
  await ensureStudioPaidSchema(db);
  const account = await readStudioAccount(request, db, now);
  if (!account) return { part: NO_PAID_PART, cookie: null };
  const store = new StudioStore(db);
  const mode = viewerMode(payments);
  const running = (await store.entitlements(account.userId, mode)).filter(
    (row) => row.revoked_at === null && row.starts_at <= now && row.ends_at > now,
  );
  const regen = await store.regenAvailable(running.map((row) => row.id), now - REGEN_WINDOW_MS);
  const latest = await store.latestOrder(account.userId, mode);
  const orders = [...running.map((row) => row.order_id), ...(latest ? [latest.id] : [])];
  const receipts = (await store.receipts(orders)).flatMap((row) => {
    const url = receiptLink(row.receipt_url);
    return url ? [{ orderId: row.order_id, kind: row.kind, url }] : [];
  });
  const latestEnd = running.reduce((end, row) => Math.max(end, row.ends_at), 0);
  const cookie = latestEnd > 0 ? await extendStudioSession(db, account, latestEnd, now) : null;
  return {
    part: {
      account: { signedIn: true },
      entitlements: running.map((row) => entitlementView(row, regen.get(row.id) ?? [])),
      latestOrder: latest ? orderView(latest, now) : null,
      receipts,
    },
    cookie,
  };
}

export const onRequest: PagesFunction<BillingEnv> = async ({ request, env }) => {
  const closed = studioGate(request, env, "me");
  if (closed) return closed;
  if (request.method !== "GET" && request.method !== "HEAD") return fail("method_not_allowed", {}, { Allow: "GET" });
  const now = Date.now();
  const config = studioRequestConfig(request, env);
  const identity = await readIdentity(request, env, now);
  const db = env.GPTBOT_DRAFTS_DB;
  const paidAsked = config.paidService && hasAccountCookie(request);
  if ((identity || paidAsked) && !db) return fail("studio_not_configured");
  let free: FreeLeft;
  try {
    let own: OwnJobs = { closed: 0, open: [] };
    if (identity && db) {
      // expireOwnJobs settles open reservations too (gpt_model_spend): the deck schema, not only the studio's.
      await ensureDeckSchema(db);
      own = await expireOwnJobs(db, identity.subject, now);
    }
    free = await freeLeft(identity ? db ?? null : null, identity?.subject ?? null, now, own.open);
  } catch {
    studioLog("studio_me", "studio_busy");
    return fail("studio_busy");
  }
  let paid: { part: PaidPart; cookie: string | null } = { part: NO_PAID_PART, cookie: null };
  if (paidAsked && db) {
    try {
      paid = await paidPart(request, db, config.payments, now);
    } catch {
      studioLog("studio_me", "studio_busy");
      return fail("studio_busy");
    }
  }
  return json(
    {
      ok: true,
      identity: identity !== null,
      free,
      ...paid.part,
    },
    200,
    paid.cookie ? { "Set-Cookie": paid.cookie } : {},
  );
};
