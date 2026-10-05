// /api/gpt/restore — the buyer's end of a pack restore link (guest-restore.ts).
//
// GET ?t=<token> shows one button and changes nothing: link previews (a
// messenger fetching the link) must not take the pack. The button POSTs the
// token back; the order and its pack move to this browser's account, or to
// a new guest account of this browser, and the chat opens. A used, expired
// or forged link moves nothing. noindex, no-store; the chat it opens gets no referrer.
import { BILLING_ORG, type BillingEnv } from "../../lib/gpt-chat/billing-config";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { resolveConfig } from "../../lib/gpt-chat/config";
import { verifyRestoreToken } from "../../lib/gpt-chat/guest-restore";
import { getClientIp, hashIp } from "../../lib/gpt-chat/hash";
import {
  authCookie,
  GUEST_ACCOUNT_PREFIX,
  GUEST_SESSION_MS,
  IdentityStore,
  moveOrders,
  sameOrigin,
} from "../../lib/gpt-chat/identity-store";
import { consumeRateLimit, HOUR_MS } from "../../lib/gpt-chat/rate-limit";
import { isRehearsalAccount } from "../../lib/gpt-chat/rehearsal";

// same-origin, not no-referrer: under no-referrer the browser sends the
// button's POST with "Origin: null", and sameOrigin() would refuse it. The
// page loads nothing (CSP), so its URL reaches no other site.
const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
};
const TOKEN = /^v1\.\d{13}\.pay_[0-9a-f]{32}\.[0-9a-f]{64}$/;

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>AI paket · GPTBot.uz</title></head><body style="font:16px/1.5 system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;background:#0b1020;color:#e6eef7">${body}</body></html>`,
    { status, headers: HEADERS },
  );
}

const gone = () => page(
  "<p>Havola eskirgan yoki ishlatilgan. Qo‘llab-quvvatlash xizmatiga yozing.</p><p>Ссылка устарела или уже использована. Напишите в поддержку.</p>",
  410,
);

export const onRequestGet: PagesFunction<BillingEnv> = async ({ request }) => {
  const token = new URL(request.url).searchParams.get("t") || "";
  if (!TOKEN.test(token)) return gone();
  return page(
    `<p>AI paketni shu brauzerga qaytarish.<br>Вернуть AI-пакет в этот браузер.</p><form method="post" action="/api/gpt/restore"><input type="hidden" name="t" value="${token}"><button type="submit" style="font:inherit;font-weight:700;padding:12px 20px;border:0;border-radius:12px;background:#80f2d5;color:#09251e">Paketni tiklash · Восстановить пакет</button></form>`,
  );
};

export const onRequestPost: PagesFunction<BillingEnv> = async ({ request, env }) => {
  if (!sameOrigin(request) || !env.GPTBOT_DRAFTS_DB) return gone();
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("t") ?? "");
  if (!TOKEN.test(token)) return gone();
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureBillingSchema(db);
    const order = await verifyRestoreToken(db, env.GPT_IDENTITY_SECRET || "", token);
    if (!order) return gone();
    const identity = new IdentityStore(db, BILLING_ORG);
    let target = await identity.user(request);
    let cookie: string | null = null;
    if (target && isRehearsalAccount(target)) return gone();
    if (!target) {
      const address = await hashIp(getClientIp(request), resolveConfig(env));
      const pace = await consumeRateLimit(db, "guest_account", address, { limit: 5, windowMs: HOUR_MS });
      if (!pace.allowed || pace.degraded) return gone();
      const minted = await identity.syntheticLogin(GUEST_ACCOUNT_PREFIX, GUEST_SESSION_MS);
      target = minted.id;
      cookie = authCookie("__Host-gpt_account", minted.token, GUEST_SESSION_MS / 1000);
    }
    if (target !== order.user_id)
      await db.batch(moveOrders(db, BILLING_ORG, order.user_id, target, order.id));
    const headers = new Headers({
      Location: order.locale === "ru" ? "/ru/gpt-chat/" : "/uz/gpt-uzbek-tilida/",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    if (cookie) headers.append("Set-Cookie", cookie);
    console.log(JSON.stringify({ event: "gpt_guest_pack_restored", order: order.id }));
    return new Response(null, { status: 303, headers });
  } catch {
    return page("<p>Xatolik. Keyinroq urinib ko‘ring.</p><p>Ошибка. Попробуйте позже.</p>", 503);
  }
};
