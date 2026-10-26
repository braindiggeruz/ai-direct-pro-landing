# Release — monetization stages A and B · 26.10.2026

- Owner order (chat, 26.10): «приступай, делай всё под ключ максимально грамотно и затем деплой» — implement `docs/monetization/2026-10-25-tariffs-roadmap/ROADMAP.md` stages A–B; then «сделай всё, чтобы поисковые системы как можно быстрее увидели новые страницы» (Google URL inspection is done by the owner).
- Branch `seo/chat-snippets-translator-20261024`. Previous production `61c70ce6` (deployment `d3010231`).
- **Deployment `853130c0`** from `d110b692` — `deployed_and_verified`. Commits: c377b572 (stage A), 40fbefbb (role paywall, last-trial card, exit survey, widget events), fa309da1 (Ш2-lite return path), 87eb2728 + 12c6b6c9 + 2d2945b0 (G0-code, 17.12 runbook and patches), bcbd6e7c (stage B content), 4d4c4e74 + b636ed0e (review fixes), ffbd508c (token measurement, owner letters), d110b692 (protected revision `2026-10-26-monetization`).
- **Deployment `acb2c864`** from `4924c998` — `deployed_and_verified`: `updatedAt` 2026-10-26 on the 16 pages that gained a visible section (sitemap lastmod), `/uz/tariflar/` listed in llms.txt.

## Guarded flow

`build:production` (1040 files) → `seo-protection check` 10/10 (only two shared script names move on protected pages) → chat bundle within budget (start ≈109.9 of 110.0 kB, page CSS `index-B7Z1XlOc.css` 26 919 B) → 109 test files run one by one: 1517 pass, 14 fail, every failure also fails on 22e60908 → `deploy_runner.py check` PASS (lineage 61c70ce6 → d110b692) → `deploy`. Second deploy: rebuild, protection 10/10, 19 related test files green, check PASS → deploy.

Main loop checks before deploy: packed config diff = exactly `GPT_FREE_PAID_DAILY_USD` 1 → 0.3, new `GPT_PACK_PAID_DAILY_USD` 3, new `STUDIO_PAID_TEXT_FALLBACK` ""; `subscribe.ts` change limited to the validated return URL (closed list of 23 chat pages, fallback = main chat); amounts, order creation, idempotency, callbacks and offer v5 untouched; local dist read: lead form on the clinic page, «AI paket bu sahifada» on the translator, `#ai-paket` and `#tashkilotlar` on `/uz/tariflar/`.

## Live readback

54 changed URLs → 200 with expected titles: lead form on all 27 niche AI-bot pages and the 4 CTA-fixed pages, pack block on 10 tool pages, Payme and «Для организаций» on `/ru/tarify-ai-chat/`, `#ai-paket` on `/uz/tariflar/`. Protected chats serve `gpt-chat-Dw0ALAyJ.js` with unchanged titles. sitemap.xml 329 `<loc>`, lastmod 2026-10-26 on the 16 pages; llms.txt lists the UZ hub.

## Discovery

- WebSub: posted by both guarded deploys (`/updates/atom.xml` accepted, 204).
- IndexNow (site key `712a8e89…`, key file 200): the 54 URLs to api.indexnow.org (200), yandex.com (202), bing.com (200).
- Google: list for manual URL inspection handed to the owner (chat, 26.10).

## Not shipped (gates / owner)

Parents block, Ш6 on tests and calculator, ЧСБ texts (decision №17 «данные детей»); translator quota (G4, offer v6); T1 split test and Ш3 columns (need a migration); pack block on the 5 English tenses pages (wave B first check); Studio fallback model (ships off until the 17.12 runbook); bot-support price (№7), studio Telegram (№8). Owner: OpenRouter credits ≥ $10 and Z.ai decision by 15.11 (`docs/paid-chat/MODEL-CLIFF-1712-RU.md`), letters in `docs/monetization/2026-10-25-tariffs-roadmap/12-owner-letters.md`, GA4 parameters `role_id`, `correct` and key events, Yandex.Webmaster verification.
