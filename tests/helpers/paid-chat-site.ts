// The site's own Pages Functions behind one dispatcher, for the paid-chat
// rehearsals (plan WP-22): the in-process purchases of
// tests/paid-chat-e2e-rehearsal.test.ts and the offline mode of
// scripts/paid-chat/dark-rehearsal.ts, which serves the same dispatcher on
// 127.0.0.1. Only the routes a purchase passes through are mounted; any other
// path is the 404 of a missing route, and a method a route does not export is
// a 405. Nothing here talks to the network by itself.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import * as adminPayments from "../../functions/api/admin/ai-chat/payments";
import * as adminRefundRecord from "../../functions/api/admin/ai-chat/refund-record";
import * as adminRehearsal from "../../functions/api/admin/ai-chat/rehearsal-session";
import * as account from "../../functions/api/gpt/account";
import * as botStart from "../../functions/api/gpt/auth/bot/start";
import * as botStatus from "../../functions/api/gpt/auth/bot/status";
import * as chat from "../../functions/api/gpt/chat";
import * as uiEvent from "../../functions/api/gpt/event";
import * as subscribe from "../../functions/api/gpt/subscribe";
import * as maintenance from "../../functions/api/internal/gpt-billing-maintenance";
import * as clickRefundRecord from "../../functions/api/internal/gpt-click-refund-record";
import * as internalRehearsal from "../../functions/api/internal/gpt-rehearsal-session";
import * as uzumRefund from "../../functions/api/internal/gpt-uzum-refund";
import * as click from "../../functions/api/payments/click";
import * as uzum from "../../functions/api/payments/uzum";
import * as uzumMerchant from "../../functions/api/payments/uzum-merchant/[op]";
import * as assistant from "../../functions/api/telegram/assistant";
import type { BillingEnv } from "../../functions/lib/gpt-chat/billing-config";
import { hydrateRuntimeConfig } from "../../functions/lib/runtime-config";

type Handler = (context: unknown) => Promise<Response> | Response;
type RouteModule = Partial<Record<"onRequest" | "onRequestGet" | "onRequestPost", unknown>>;

/** Path → module; `:op` is the Uzum Merchant API operation. */
const ROUTES: ReadonlyArray<readonly [RegExp, RouteModule]> = [
  [/^\/api\/admin\/ai-chat\/rehearsal-session$/, adminRehearsal],
  [/^\/api\/admin\/ai-chat\/payments$/, adminPayments],
  [/^\/api\/admin\/ai-chat\/refund-record$/, adminRefundRecord],
  [/^\/api\/internal\/gpt-rehearsal-session$/, internalRehearsal],
  [/^\/api\/internal\/gpt-click-refund-record$/, clickRefundRecord],
  [/^\/api\/internal\/gpt-uzum-refund$/, uzumRefund],
  [/^\/api\/internal\/gpt-billing-maintenance$/, maintenance],
  [/^\/api\/gpt\/account$/, account],
  [/^\/api\/gpt\/subscribe$/, subscribe],
  [/^\/api\/gpt\/chat$/, chat],
  [/^\/api\/gpt\/event$/, uiEvent],
  [/^\/api\/gpt\/auth\/bot\/start$/, botStart],
  [/^\/api\/gpt\/auth\/bot\/status$/, botStatus],
  [/^\/api\/telegram\/assistant$/, assistant],
  [/^\/api\/payments\/click$/, click],
  [/^\/api\/payments\/uzum$/, uzum],
  [/^\/api\/payments\/uzum-merchant\/(?<op>[a-z]+)$/, uzumMerchant],
];

export type SiteDispatch = (request: Request) => Promise<Response>;

/** The public settings a purchase depends on; hosts and model chains stay the caller's. */
const BILLING_SETTING =
  /^(?:GPT_PAYMENT_PROVIDERS|GPT_BILLING_[A-Z_]+|GPT_FISCAL_[A-Z_]+|GPT_CLICK_AUTOFISCAL|GPT_CLICK_FISCAL_[A-Z_]+|GPT_BOT_LOGIN_MODE|GPT_HANDOFF_BOT_USERNAME|GPT_ALERTS_ENABLED|GPT_HASH_SALT_SINCE|UZUM_API|UZUM_AUTOFISCAL)$/;

/**
 * The billing settings committed in wrangler.toml, hydrated from
 * GPTBOT_RUNTIME_CONFIG_JSON the way production reads them
 * (functions/lib/runtime-config.ts): every provider off, the offer, the
 * fiscal codes, the bot sign-in.
 */
export function committedBillingSettings(): Partial<BillingEnv> {
  const source = readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8");
  const packed = /GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(source)?.[1];
  if (!packed) throw new Error("wrangler.toml has no GPTBOT_RUNTIME_CONFIG_JSON");
  const hydrated = hydrateRuntimeConfig({ GPTBOT_RUNTIME_CONFIG_JSON: packed } as unknown as BillingEnv) as unknown as Record<string, unknown>;
  return Object.fromEntries(Object.entries(hydrated).filter(([key]) => BILLING_SETTING.test(key))) as Partial<BillingEnv>;
}

/**
 * One request through the matching Pages Function, as Pages calls it:
 * {request, env, params, waitUntil}. Work a handler hands to waitUntil lands
 * in `background`; the caller drains it.
 */
export function siteDispatcher(env: BillingEnv, background: Promise<unknown>[]): SiteDispatch {
  return async (request) => {
    const { pathname } = new URL(request.url);
    for (const [pattern, module] of ROUTES) {
      const match = pattern.exec(pathname);
      if (!match) continue;
      const method = request.method.charAt(0) + request.method.slice(1).toLowerCase();
      const handler = (module[`onRequest${method}` as keyof RouteModule] ?? module.onRequest) as Handler | undefined;
      if (!handler) return Response.json({ ok: false, code: "method_not_allowed" }, { status: 405 });
      return handler({
        request,
        env,
        params: { ...match.groups },
        waitUntil: (task: Promise<unknown>) => background.push(task),
      });
    }
    return Response.json({ ok: false, code: "not_found" }, { status: 404 });
  };
}

/**
 * A dispatcher served on 127.0.0.1 at a free port, as plain HTTP: the
 * request URL is rebuilt from the Host header, so same-origin checks see the
 * loopback origin. Bodies are buffered (they are small); Set-Cookie lines are
 * kept apart.
 */
export async function serveOnLoopback(
  dispatch: SiteDispatch,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (typeof value === "string") headers.set(key, value);
      const response = await dispatch(
        new Request(new URL(req.url ?? "/", `http://${req.headers.host}`), {
          method: req.method,
          headers,
          ...(req.method === "GET" || req.method === "HEAD" ? {} : { body: Buffer.concat(chunks) }),
        }),
      );
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") res.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader("set-cookie", cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.statusCode = 500;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no loopback port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
