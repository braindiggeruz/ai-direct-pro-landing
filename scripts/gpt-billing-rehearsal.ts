/** Local-only, synthetic payment/LLM rehearsal. No .env loading, real tokens,
 * provider checkout, Telegram send, migration or production write. */
import { createServer } from "vite";
import { billingFixture } from "../tests/helpers/gpt-billing-fixture";
import {
  onRequestGet as account,
  onRequestPost as refund,
} from "../functions/api/gpt/account";
import { onRequestPost as subscribe } from "../functions/api/gpt/subscribe";
import { onRequestPost as session } from "../functions/api/gpt/session";
import { onRequestPost as chat } from "../functions/api/gpt/chat";
import { onRequestPost as logout } from "../functions/api/gpt/auth/logout";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
const f = await billingFixture();
f.env.OPENROUTER_API_KEY = randomBytes(32).toString("hex");
const port = 4179;
const origin = `http://localhost:${port}`;
let behavior = "normal";
let calls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (!String(input).startsWith("https://openrouter.ai/"))
    return originalFetch(input, init);
  calls++;
  if (behavior === "fallback" && calls === 1)
    return new Response("", { status: 429 });
  if (behavior === "error") return new Response("", { status: 503 });
  const answer =
    '## Kichik qadamdan boshlang\nMaqsadni bir jumlada yozing. Keyin uni uchta aniq ishga ajrating.\n\n1. Eng muhim vazifani tanlang.\n2. Kerakli ma’lumotni tayyorlang.\n3. Natijani tekshiring.\n\n| Vazifa | Vaqt | Natija |\n| --- | --- | --- |\n| Reja | 10 daqiqa | Aniq yo‘nalish |\n| Tekshirish | 5 daqiqa | Tuzatishlar |\n\n```javascript\nconst message = "Salom, dunyo!";\nconsole.log(message);\n```\n\nBu mahalliy sinov javobi — haqiqiy model chaqirilmagan.';
  let offset = 0;
  let cancelled = false;
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async pull(output) {
        await new Promise((resolve) =>
          setTimeout(resolve, behavior === "slow" ? 200 : 20),
        );
        if (cancelled || init?.signal?.aborted) {
          output.error(new DOMException("Aborted", "AbortError"));
          return;
        }
        if (behavior === "partial" && offset > 90) {
          output.close();
          return;
        }
        if (offset >= answer.length) {
          output.enqueue(encoder.encode("data: [DONE]\n\n"));
          output.close();
          return;
        }
        output.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content: answer.slice(offset, offset + 24) } }] })}\n\n`,
          ),
        );
        offset += 24;
      },
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
};
const server = await createServer({
  server: { host: "127.0.0.1", port, strictPort: true },
  plugins: [
    {
      name: "local-billing-rehearsal",
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (
            !req.url?.startsWith("/api/") &&
            !req.url?.startsWith("/__rehearsal") &&
            !req.url?.startsWith("/ru/gpt-chat/") &&
            !req.url?.startsWith("/uz/gpt-uzbek-tilida/")
          )
            return next();
          try {
            if (
              ![`localhost:${port}`, `127.0.0.1:${port}`].includes(
                req.headers.host || "",
              )
            ) {
              res.statusCode = 403;
              res.end();
              return;
            }
            const url = new URL(req.url, origin);
            if (
              url.pathname.startsWith("/ru/") ||
              url.pathname.startsWith("/uz/")
            ) {
              const locale = url.pathname.startsWith("/uz/") ? "uz" : "ru";
              const html = `<!doctype html><html lang="${locale}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GPTBot — local rehearsal</title><link rel="stylesheet" href="/src/index.css"></head><body style="margin:0;background:#05070d"><main style="height:100dvh"><div id="gpt-chat-root" data-locale="${locale}" style="height:100%"></div></main><script type="module" src="/src/gpt-chat/main.tsx"></script></body></html>`;
              res.setHeader("Content-Type", "text/html");
              res.end(await vite.transformIndexHtml(req.url, html));
              return;
            }
            if (url.pathname === "/__rehearsal") {
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.end(
                `<html><head><title>Local payment rehearsal</title></head><body><h1>Локальный стенд. Реальных денег и внешних вызовов нет.</h1><form method="post" action="/__rehearsal/login"><button>Войти тестовым аккаунтом</button></form><form method="post" action="/__rehearsal/pay"><button>Подтвердить последний тестовый счёт</button></form><form method="post" action="/__rehearsal/cancel"><button>Отменить последний Payme платёж</button></form><form method="post" action="/__rehearsal/behavior"><select name="mode"><option>normal</option><option>fallback</option><option>partial</option><option>slow</option><option>error</option></select><button>Режим модели</button></form><a href="/uz/gpt-uzbek-tilida/">Чат UZ</a> · <a href="/ru/gpt-chat/">Чат RU</a></body></html>`,
              );
              return;
            }
            const chunks: Buffer[] = [];
            for await (const part of req) chunks.push(Buffer.from(part));
            const raw = Buffer.concat(chunks);
            const request = new Request(url, {
              method: req.method,
              headers: new Headers(req.headers as Record<string, string>),
              ...(raw.length ? { body: raw } : {}),
            });
            const ctx = f.ctx(request);
            let response: Response;
            if (url.pathname.startsWith("/__rehearsal/")) {
              if (
                req.method !== "POST" ||
                request.headers.get("origin") !== origin
              ) {
                res.statusCode = 403;
                res.end();
                return;
              }
              if (url.pathname.endsWith("/login")) {
                response = new Response(null, {
                  status: 303,
                  headers: {
                    Location: "/uz/gpt-uzbek-tilida/",
                    "Set-Cookie": `${f.cookie}; Path=/; HttpOnly; Secure; SameSite=Lax`,
                  },
                });
              } else if (url.pathname.endsWith("/behavior")) {
                behavior =
                  new URLSearchParams(raw.toString()).get("mode") || "normal";
                calls = 0;
                f.db.exec("DELETE FROM gpt_model_health");
                response = Response.redirect(
                  origin + "/uz/gpt-uzbek-tilida/",
                  303,
                );
              } else {
                const order = await f.store.latest(f.user, "test");
                if (!order) throw new Error("Create an invoice in chat first");
                const tx =
                  order.external_id || String(randomBytes(4).readUInt32BE(0));
                let result: unknown;
                if (url.pathname.endsWith("/cancel"))
                  result = await f.rpc("CancelTransaction", {
                    id: tx,
                    reason: 1,
                  });
                else if (order.provider === "payme") {
                  await f.rpc("CreateTransaction", {
                    id: tx,
                    time: order.provider_time || Date.now(),
                    amount: 2000000,
                    account: { order_id: order.id },
                  });
                  result = await f.rpc("PerformTransaction", { id: tx });
                } else {
                  await f.clickCall(order.id, "0", { click_trans_id: tx });
                  result = await f.clickCall(order.id, "1", {
                    click_trans_id: tx,
                    merchant_prepare_id: String(order.seq),
                  });
                }
                response = new Response(JSON.stringify(result), {
                  headers: { "Content-Type": "application/json" },
                });
              }
            } else if (url.pathname === "/api/auth/config")
              response = Response.json({ turnstileRequired: false });
            else if (url.pathname === "/api/gpt/account")
              response = await (req.method === "POST" ? refund : account)(ctx);
            else if (url.pathname === "/api/gpt/subscribe")
              response = await subscribe(ctx);
            else if (url.pathname === "/api/gpt/session")
              response = await session(ctx);
            else if (url.pathname === "/api/gpt/chat")
              response = await chat(ctx);
            else if (url.pathname === "/api/gpt/auth/logout")
              response = await logout(ctx);
            else
              response = Response.json(
                { ok: false, code: "local_fixture_only" },
                { status: 404 },
              );
            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
              if (key !== "set-cookie") res.setHeader(key, value);
            });
            const cookies = response.headers.getSetCookie();
            if (cookies.length) res.setHeader("set-cookie", cookies);
            if (response.body)
              Readable.fromWeb(response.body as never).pipe(res);
            else res.end();
          } catch (error) {
            res.statusCode = 500;
            res.end(String(error));
          }
        });
      },
    },
  ],
});
await server.listen();
console.log(`LOCAL ONLY: ${origin}/__rehearsal`);
