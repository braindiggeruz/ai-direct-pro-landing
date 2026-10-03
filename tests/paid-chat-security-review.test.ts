// Security review of the paid AI chat (plan WP-21), docs/paid-chat/SECURITY-REVIEW-2026-10.md.
// S1: every internal route shares one Bearer, GPT_BILLING_MAINTENANCE_SECRET,
// and two of them return money. A value shorter than 32 characters counts as
// unset there, as every secret of billing-config.ts does: the route answers
// 403 before it reads the body or touches D1, even to the matching Bearer.
// Run: node --import tsx --test tests/paid-chat-security-review.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MIN_INTERNAL_SECRET_LENGTH } from "../functions/lib/gpt-chat/internal-auth";
import { onRequestPost as maintenance } from "../functions/api/internal/gpt-billing-maintenance";
import { onRequestPost as clickRefundRecord } from "../functions/api/internal/gpt-click-refund-record";
import { onRequestPost as clickReversal } from "../functions/api/internal/gpt-click-reversal";
import { onRequestPost as modelProbe } from "../functions/api/internal/gpt-model-probe";
import { onRequestPost as rehearsalSession } from "../functions/api/internal/gpt-rehearsal-session";
import { onRequestPost as uzumRefund } from "../functions/api/internal/gpt-uzum-refund";
import { onRequestPost as javobSetup } from "../functions/api/internal/javob-setup";

type Route = (context: never) => Response | Promise<Response>;

/**
 * Each internal route and what it answers past the Bearer to `{}` with no D1,
 * no OpenRouter key, no bot token and no provider in test: the first check
 * after the Bearer, never a call outside.
 */
const ROUTES: ReadonlyArray<[path: string, route: Route, past: number]> = [
  ["gpt-billing-maintenance", maintenance as Route, 503],
  ["gpt-click-refund-record", clickRefundRecord as Route, 400],
  ["gpt-click-reversal", clickReversal as Route, 400],
  ["gpt-model-probe", modelProbe as Route, 503],
  ["gpt-rehearsal-session", rehearsalSession as Route, 404],
  ["gpt-uzum-refund", uzumRefund as Route, 400],
  ["javob-setup", javobSetup as Route, 503],
];

/** A D1 binding that records every touch and answers none. */
function watchedDb(touched: string[]): D1Database {
  return new Proxy({} as D1Database, {
    get(_target, name) {
      touched.push(String(name));
      throw new Error("D1 touched");
    },
  });
}

async function call(route: Route, path: string, env: Record<string, unknown>, secret: string) {
  const request = new Request(`https://gptbot.uz/api/internal/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const response = await route({ request, env, params: {}, waitUntil: () => undefined } as never);
  return { response, request };
}

test("S1: a Bearer secret shorter than 32 characters closes every internal route, before the body and D1", async () => {
  assert.equal(MIN_INTERNAL_SECRET_LENGTH, 32);
  const short = randomBytes(32).toString("hex").slice(0, MIN_INTERNAL_SECRET_LENGTH - 1);
  for (const [path, route] of ROUTES) {
    const touched: string[] = [];
    const env = { GPT_BILLING_MAINTENANCE_SECRET: short, GPTBOT_DRAFTS_DB: watchedDb(touched) };
    const { response, request } = await call(route, path, env, short);
    assert.equal(response.status, 403, `${path}: the matching Bearer of a short secret`);
    assert.equal(request.bodyUsed, false, `${path}: the body is not read`);
    assert.deepEqual(touched, [], `${path}: D1 is not touched`);
  }
});

test("S1: a 32-character secret opens them, and only to its own Bearer", async () => {
  const secret = randomBytes(16).toString("hex");
  assert.equal(secret.length, MIN_INTERNAL_SECRET_LENGTH);
  for (const [path, route, past] of ROUTES) {
    const env = { GPT_BILLING_MAINTENANCE_SECRET: secret };
    assert.equal((await call(route, path, env, secret)).response.status, past, `${path}: past the Bearer`);
    assert.equal((await call(route, path, env, `${secret}x`)).response.status, 403, `${path}: a longer Bearer`);
    assert.equal((await call(route, path, env, secret.slice(1))).response.status, 403, `${path}: a shorter Bearer`);
    assert.equal((await call(route, path, {}, secret)).response.status, 403, `${path}: no secret configured`);
  }
});
