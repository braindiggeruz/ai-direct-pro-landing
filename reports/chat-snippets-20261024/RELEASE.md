# Release — chat snippets · 24.10.2026

- Source: `d54d5b61bf25685b0228886a8d6a2608ffb9766b` (branch `seo/chat-snippets-translator-20261024`, based on `c0da2ecb`).
- Previous production: `b5ad3d935a3ecfdcdfef0bb11811710e68658bb3` (deployment `caac9729`).
- Cloudflare Pages deployment: `d0264730-fd47-432d-9b03-13bc4e7683ef`. Guarded flow: `npm run build:production` (1006 files, stamp) → `deploy_runner.py check` PASS (lineage b5ad3d93 → d54d5b61) → `deploy_runner.py deploy` → `deployed_and_verified`. Owner authorization: chat message of 24.10 («сразу всё делай автономно не спрашивай меня и выкатывай»).

## Live readback (curl, desktop UA, after deploy)

| URL | HTTP | `<title>` | meta description |
|---|---|---|---|
| /ru/gpt-chat/ | 200 | Аналог ChatGPT онлайн в Узбекистане — без регистрации | ИИ-чат на русском и узбекском в браузере, без установки: 3 бесплатных пробных ответа, затем AI-пакет. GPTBot.uz — независимый сервис, не OpenAI и не ChatGPT. |
| /uz/gpt-uzbek-tilida/ | 200 | ChatGPT uzbekcha muqobili — bepul kirish, ro‘yxatsiz chat | O‘zbekcha yozing: matn, reja va g‘oyalar brauzerda, ilovasiz. Ro‘yxatsiz 3 ta bepul sinov javobi, keyin AI paket. GPTBot.uz — mustaqil servis, OpenAI emas. |
| / | 200 | unchanged | unchanged |

Analytics loader bounds on live HTML: `setTimeout(idleLoad,600|1000|1200|3000)`, Meta pixel `34000` (deliberately excluded) — no 30 000/32 000 regression.

## Discovery

- WebSub: `/updates/atom.xml` posted, HTTP 204 (receipt `reports/websub-receipts/2026-10-24T12-54-41-357Z_f515f696.json`); both blog feeds unchanged, skipped.
- IndexNow (site key `712a8e89…`, key file live 200): 2 URLs, HTTP 200.
- Google URL Inspection (read-only, before recrawl): both chats «Submitted and indexed», last crawl 21.10 (RU) and 23.10 (UZ) — i.e. before this release. Rich results: Breadcrumbs with «Unnamed item» (pre-existing; queued for the technical wave).

## Measurement

Per `docs/seo/evidence/2026-10-24-chat-snippets/reviewed-protected-pages.json` → `measurement`: 28 days from a confirmed recrawl, Uzbekistan-only CTR and clicks/day against 09.10–21.10.
