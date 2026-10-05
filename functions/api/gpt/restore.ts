// /api/gpt/restore — the buyer's end of a pack restore link (guest-restore.ts).
//
// GET ?t=<token> shows one button and changes nothing: link previews (a
// messenger fetching the link) must not take the pack. The button POSTs the
// token back; the order and its pack move to this browser's account, and
// the chat opens. A browser with no account first gets a new guest account:
// its cookie comes with a 307 that repeats the same POST, so the order moves
// only into an account the browser already holds, and a lost answer never
// leaves the pack on a guest no browser has. A used, expired or forged link
// moves nothing; a repeat after the move opens the chat. noindex, no-store;
// the chat it opens gets no referrer.
import { BILLING_ORG, type BillingEnv } from "../../lib/gpt-chat/billing-config";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { resolveConfig } from "../../lib/gpt-chat/config";
import { findOrder, verifyRestoreToken } from "../../lib/gpt-chat/guest-restore";
import { addressKey, getClientIp, hashIp } from "../../lib/gpt-chat/hash";
import {
  authCookie,
  GUEST_ACCOUNT_PREFIX,
  GUEST_SESSION_MS,
  IdentityStore,
  moveOrders,
  paceGuestAccount,
  sameOrigin,
} from "../../lib/gpt-chat/identity-store";
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
// A valid link met the limit on new guest accounts: it still works later.
const busy = (seconds: number) => {
  const response = page(
    "<p>Hozir urinishlar juda ko‘p. Bir soatdan keyin shu havolani qayta oching.</p><p>Сейчас слишком много попыток. Откройте эту ссылку снова через час.</p>",
    429,
  );
  response.headers.set("Retry-After", String(seconds));
  return response;
};
// The 307 set a cookie and the browser came back without it.
const noCookies = () => page(
  "<p>Brauzer cookie saqlamayapti, shuning uchun paket bu yerga qaytmaydi. gptbot.uz uchun cookie’ga ruxsat bering va havolani qayta oching.</p><p>Браузер не сохраняет cookie, поэтому пакет сюда не вернуть. Разрешите cookie для gptbot.uz и откройте ссылку снова.</p>",
  400,
);
/** The chat, with the pack in this browser. */
const opened = (locale: string | null) =>
  new Response(null, {
    status: 303,
    headers: {
      Location: locale === "ru" ? "/ru/gpt-chat/" : "/uz/gpt-uzbek-tilida/",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });

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
    const identity = new IdentityStore(db, BILLING_ORG);
    const target = await identity.user(request);
    const order = await verifyRestoreToken(db, env.GPT_IDENTITY_SECRET || "", token);
    if (!order) {
      // A second tap, or a retry after a lost answer: the pack is here already.
      const held = target ? await findOrder(db, token.split(".")[2]) : null;
      return held && held.user_id === target ? opened(held.locale) : gone();
    }
    if (target && isRehearsalAccount(target)) return gone();
    if (!target) {
      if (new URL(request.url).searchParams.has("guest")) return noCookies();
      const address = await hashIp(addressKey(getClientIp(request)), resolveConfig(env));
      const pace = await paceGuestAccount(db, address);
      if (!pace.allowed) return busy(pace.retryAfterSeconds);
      if (pace.degraded) throw new Error("rate_limit_degraded");
      const minted = await identity.syntheticLogin(GUEST_ACCOUNT_PREFIX, GUEST_SESSION_MS);
      // same-origin: the repeated POST must carry this page's Origin.
      return new Response(null, {
        status: 307,
        headers: {
          Location: "/api/gpt/restore?guest=1",
          "Cache-Control": "no-store",
          "Referrer-Policy": "same-origin",
          "Set-Cookie": authCookie("__Host-gpt_account", minted.token, GUEST_SESSION_MS / 1000),
        },
      });
    }
    if (target !== order.user_id) {
      await db.batch(moveOrders(db, BILLING_ORG, order.user_id, target, order.id));
      // Moved nothing (the account reuses its request id, or another tap won):
      // never "restored" over a pack that stayed where it was.
      if ((await findOrder(db, order.id))?.user_id !== target) throw new Error("guest_not_moved");
      console.log(JSON.stringify({ event: "gpt_guest_pack_restored", order: order.id }));
    }
    return opened(order.locale);
  } catch {
    return page("<p>Xatolik. Keyinroq urinib ko‘ring.</p><p>Ошибка. Попробуйте позже.</p>", 503);
  }
};
