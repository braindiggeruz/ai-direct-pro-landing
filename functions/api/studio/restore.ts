// /api/studio/restore — the buyer's end of a studio restore link (restore.ts).
//
// GET ?t=<token> shows one button and changes nothing: a messenger fetching
// the link for a preview must not take the tariff. The button POSTs the
// token back; the order and every entitlement of it move to this browser's
// studio account (store.ts moveToAccount, one guarded batch), and the page
// says so with a link back to the studio. A browser with no studio account
// first gets a new one, paced like a checkout's: its cookie comes with a 307
// that repeats the same POST, so the order moves only into an account the
// browser already holds. A used, expired or forged link moves nothing; a
// repeat after the move says it is done.
//
// Open while STUDIO_PAID_SERVICE is on, on gptbot.uz (or a local host under
// STUDIO_LOCAL_DEV): anywhere else 404. noindex, no-store; no referrer leaves.
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { sameOrigin } from "../../lib/gpt-chat/identity-store";
import { createStudioAccount, paceStudioAccount, readStudioAccount } from "../../lib/studio/account";
import { studioRequestConfig } from "../../lib/studio/config";
import { notFound, studioLog } from "../../lib/studio/http";
import { identityConfigured } from "../../lib/studio/identity";
import { studioAddress } from "../../lib/studio/limits";
import { STUDIO_RESTORE_TOKEN, verifyStudioRestoreToken } from "../../lib/studio/restore";
import { StudioStore, ensureStudioPaidSchema } from "../../lib/studio/store";

const EVENT = "studio_restore";

// same-origin, not no-referrer: under no-referrer the button's POST carries
// "Origin: null" and sameOrigin() refuses it. The page loads nothing (CSP).
const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
};

const BUTTON =
  "font:inherit;font-weight:700;padding:12px 20px;border:0;border-radius:12px;background:#80f2d5;color:#09251e;text-decoration:none;display:inline-block";

function page(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(
    `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Studio · GPTBot.uz</title></head><body style="font:16px/1.5 system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;background:#0b1020;color:#e6eef7">${body}</body></html>`,
    { status, headers: { ...HEADERS, ...extra } },
  );
}

const gone = () =>
  page(
    "<p>Havola eskirgan yoki ishlatilgan. Qo‘llab-quvvatlash xizmatiga yozing.</p><p>Ссылка устарела или уже использована. Напишите в поддержку.</p>",
    410,
  );
const busy = (seconds: number) =>
  page(
    "<p>Hozir urinishlar juda ko‘p. Bir soatdan keyin shu havolani qayta oching.</p><p>Сейчас слишком много попыток. Откройте эту ссылку снова через час.</p>",
    429,
    { "Retry-After": String(seconds) },
  );
const noCookies = () =>
  page(
    "<p>Brauzer cookie saqlamayapti, shuning uchun tarif bu yerga qaytmaydi. gptbot.uz uchun cookie’ga ruxsat bering va havolani qayta oching.</p><p>Браузер не сохраняет cookie, поэтому тариф сюда не вернуть. Разрешите cookie для gptbot.uz и откройте ссылку снова.</p>",
    400,
  );
const failed = () => page("<p>Xatolik. Keyinroq urinib ko‘ring.</p><p>Ошибка. Попробуйте позже.</p>", 503);
/** The tariff is in this browser now. */
const restored = () =>
  page(
    `<p>Tarif shu brauzerga qaytarildi.<br>Тариф возвращён в этот браузер.</p><p><a href="/uz/taqdimot-ai/" style="${BUTTON}">Taqdimot AI</a> <a href="/ru/prezentatsiya-ai/" style="${BUTTON}">Презентация AI</a></p>`,
  );

function open(request: Request, env: BillingEnv): boolean {
  return studioRequestConfig(request, env).paidService;
}

export const onRequestGet: PagesFunction<BillingEnv> = async ({ request, env }) => {
  if (!open(request, env)) return notFound();
  const token = new URL(request.url).searchParams.get("t") || "";
  if (!STUDIO_RESTORE_TOKEN.test(token)) return gone();
  return page(
    `<p>Studio tarifini shu brauzerga qaytarish.<br>Вернуть тариф Studio в этот браузер.</p><form method="post" action="/api/studio/restore"><input type="hidden" name="t" value="${token}"><button type="submit" style="${BUTTON}">Tarifni tiklash · Восстановить тариф</button></form>`,
  );
};

export const onRequestPost: PagesFunction<BillingEnv> = async ({ request, env }) => {
  if (!open(request, env)) return notFound();
  const db = env.GPTBOT_DRAFTS_DB;
  if (!sameOrigin(request) || !db || !identityConfigured(env)) return gone();
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("t") ?? "");
  if (!STUDIO_RESTORE_TOKEN.test(token)) return gone();
  try {
    await ensureStudioPaidSchema(db);
    const now = Date.now();
    const store = new StudioStore(db);
    const account = await readStudioAccount(request, db, now);
    const target = await verifyStudioRestoreToken(store, env.GPT_IDENTITY_SECRET || "", token, now);
    if (!target) {
      // A second tap, or a retry after a lost answer: the tariff is here already.
      const held = account ? await store.byId(token.split(".")[2]) : null;
      return held && held.user_id === account?.userId ? restored() : gone();
    }
    if (!account) {
      if (new URL(request.url).searchParams.has("account")) return noCookies();
      const pace = await paceStudioAccount(db, await studioAddress(request, env, now), now);
      if (!pace.ok) return pace.code === "rate_limited" ? busy(pace.retryAfterSeconds) : failed();
      const created = await createStudioAccount(db, now);
      // same-origin: the repeated POST must carry this page's Origin.
      return new Response(null, {
        status: 307,
        headers: {
          Location: "/api/studio/restore?account=1",
          "Cache-Control": "no-store",
          "Referrer-Policy": "same-origin",
          "Set-Cookie": created.cookie,
        },
      });
    }
    if (account.userId !== target.order.user_id) {
      const moved = await store.moveToAccount(target.order.id, target.order.user_id, account.userId, now);
      // Moved nothing (another tap won): never "restored" over a tariff that stayed where it was.
      if (!moved && (await store.byId(target.order.id))?.user_id !== account.userId) return gone();
      studioLog(EVENT, "restored");
    }
    return restored();
  } catch {
    studioLog(EVENT, "studio_busy");
    return failed();
  }
};

export const onRequest: PagesFunction<BillingEnv> = async ({ request, env }) =>
  open(request, env) ? page("", 405, { Allow: "GET, POST" }) : notFound();
