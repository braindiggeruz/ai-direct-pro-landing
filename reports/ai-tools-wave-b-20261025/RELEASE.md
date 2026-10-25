# Release — AI tool pages, wave B · 25.10.2026

- Source: `61c70ce6` (quiz widget `205461eb`, tests pilot `1de4cd78`, independent solver fixes `5afc925c`, wave B content `2099fe4a`, reports `61c70ce6`) on branch `seo/chat-snippets-translator-20261024`; previous production `99920cdc` (deployment `8d4c8b4e`).
- Cloudflare Pages deployment `d3010231` — `deployed_and_verified`. Guarded flow: `build:production` (1040 files) → `seo-protection check` 10/10 (revision `2026-10-25-ai-tools-b`) → practice-quiz 16/16, tool-pages 18/18 → `deploy_runner.py check` PASS (lineage 99920cdc → 61c70ce6) → `deploy`. Owner authorization: chat, 24–25.10.
- Tests pilot: 120 original questions (informatika, fizika, matematika × 40); an independent solver answered all 120 before reading the keys — 120/120 keys matched, 3 wording/explanation fixes, 0 key changes (`docs/seo/research/2026-10-25-clusters-to-add/tests-verification.md`). Pages say the questions are AI-assisted and re-checked, not official exam material.
- Pre-deploy browser check (local dist): `/uz/informatika-test/` — 46 `<details>` blocks (answers work without JS), option pick → «To‘g‘ri!», explanation, score «1 tadan 1 ta · 40 tadan 1 ta»; «AI bilan tushuntirish» prefills the chat without sending. `/uz/present-simple/` role teacher with 6 chips. `/ru/blog/reklama-stomatologii-i-kliniki-tashkent/` links to the clinic AI-bot page, context/target services, lead form and lex.uz.

## Live readback (curl, after deploy)

All 200 with expected titles: /uz/ingliz-tili-zamonlari/, /uz/present-simple/, /uz/past-simple/, /uz/present-continuous/, /ru/vremena-angliyskogo-yazyka/, /uz/onlayn-testlar/, /uz/informatika-test/, /uz/fizika-test/, /uz/matematika-test/, 4 niche playbooks; wave A tools and both chats unchanged. sitemap.xml 329 `<loc>`. Analytics loader bounds unchanged.

## Discovery

WebSub posted by the guarded deploy. IndexNow (site key `712a8e89…`): 30 URLs, HTTP 200.

## Open

Native Uzbek read of tenses pages/playbooks and a subject teacher's read of the 120 questions (recommended); tests pilot: compare GSC impressions with Ads ≈10.01.2027 before adding subjects (intent-manifest A10); links from the protected chats to the tools after the chats' 28-day window (≈21–25.11).
