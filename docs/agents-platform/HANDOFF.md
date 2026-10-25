# HANDOFF — AI tools wave A (calculator, irregular verbs, Cyrillic-Latin converter, poems, greetings, ad copy, Uzum seller guides) · 25.10.2026

## 1. Состояние
DEPLOYED 25.10: AI tools wave A, deployment 8d4c8b4e from 99920cdc (reports/ai-tools-wave-a-20261025/RELEASE.md); IndexNow 30 URLs 200. Next: wave B (English tenses, practice tests pilot, niche playbooks).
- Дата: 2026-10-25.
- Ветка: seo/chat-snippets-translator-20261024 (worktree F:/Claude/gptbot-snippets-translator-20261024); production line, merge it into codex/continuation-20261007 before any deploy from there.
- HEAD: the commit «feat(seo): AI tool pages wave A — poems, greetings, calculator, irregular verbs, converter, ad-copy and Uzum funnel» on top of af0446fe (tool-page platform) → 5a579414 (production 62d8fdb0, deployment 97f56ab5, plus research docs).
- Завершённый этап: AI tools wave A (content + registries + protected revision). STATE.json block seo_ai_tools_wave_a_20261025 (committed_not_deployed).
- Следующий этап: guarded release of wave A on owner command, after a native Uzbek read of the poems and greetings (STATE.json next_stage).
- Рабочее дерево: clean after the commit, except files that were untracked before this stage. Not deployed, not pushed.
- Resume note: the integrator session restarted mid-stage; the content agents' files (C1–C4, REV-UZ, REV-RU) were in the tree uncommitted and no integrator edit had been made yet, so the integration was done from the start on top of them, nothing was redone or reverted.

## 2. Что сделано
Owner order 25.10: every new page is an AI tool of GPTBot.uz — a result from the AI chat or a free in-browser tool, then the AI chat / AI pack (B2C) or the ad and bot services (B2B); relevant traffic, not random traffic. Out of scope on purpose: currency rates, calendar, PDF tools, QR.
- Nine new gpt-chat tool pages on the af0446fe platform: /uz/ai-sher-yozish/ (writer), /uz/ai-tabrik-generatori/ + /ru/generator-pozdravleniy/ (writer; UZ with the converter), /uz/kalkulyator/ + /ru/kalkulyator/ (teacher + calculator), /uz/notogri-fellar/ + /ru/nepravilnye-glagoly/ (teacher + irregular-verbs), /uz/kirill-lotin/ + /ru/kirillica-v-latinicu/ (teacher + uz-translit). Each: 6 chips, 6–7 FAQ, the 3-trial disclosure in description/og/hero, SoftwareApplication offer price 0 UZS «yangilanmaydi / без ежедневного обновления» + «AI paket / AI-пакет», independence clause, honest limits, phone and e-mail, a B2C next step (AI pack) and a B2B line with a price printed on the service page (SMM 2 490 000/month, AI bot 1 990 000).
- Retargeted /uz/gpt-telegram-instagram-ideya/ (same URL) from «GPT Telegram Instagram» to «reklama matni yozish»: pageType blog → gpt-chat, role smm + converter, 7 rules, platform table, CTA to /uz/instagram-target-yoqish/#lead-form. New H1 on the homepage list.
- Ad-client funnel (AD_CLIENT_FUNNEL §5): Uzum seller guides /uz/blog/uzum-marketda-sotuvchi-bolish/ + /ru/blog/kak-stat-prodavcom-na-uzum-market/; DIY «7 qadam» and «Targetolog xizmati narxi» on /uz/instagram-target-yoqish/; ad-copy section on /ru/gpt-v-marketinge-smm/; step-by-step launch on /ru/blog/telegram-ads-stoimost-i-zapusk-uzbekistan/; agency price tables on /uz/boss-digital/ and /boss-digital/; /uz/sayt-yaratish/ package table aligned with its own title (2 990 000 / 6 900 000 / 14 900 000).
- Registries: intent-manifest pairs C53–C68 (each tool vs its chat; tabrik guide vs generator; poems vs greetings; general vs bot-cost calculator; translators vs converters; target hub vs ad tool; target hubs vs Uzum guides), telegram-ru gains the Telegram Ads article as its second spoke, target-uz note records the DIY extension, decision A9 (price table as a section, no new URL); demand-policy +18 rows (Google Ads, location 2860, 25.10, with source files); APPROVED_STATIC_ROUTE_ADDITIONS +11; llms.txt +19 lines.
- Inbound links: one linkp on each of nine older unprotected pages (≥2 per new page), anchors checked against every mustNotTarget; «калькулятор» → «калькулятор стоимости бота» on /ru/razrabotka-telegram-bota-tashkent/ (C60); phone/e-mail line added to the three Uzbek teacher pages (studio-contact rule for gpt-chat pages).
- Protected revision 2026-10-25-ai-tools: only «/» changes (internalLinks 300 → 311, +11 labels, retargeted H1); the chats differ by the bundle name only; seven articles byte-identical. Generator docs/seo/implementation/2026-10-25-ai-tools/review-candidate.ts; BASELINE moved; test in tests/seo-protection.test.ts.

## 3. Изменённые файлы
- New content: content/pages/uz/{ai-sher-yozish,ai-tabrik-generatori,kalkulyator,kirill-lotin,notogri-fellar}.json, content/pages/ru/{generator-pozdravleniy,kalkulyator,kirillica-v-latinicu,nepravilnye-glagoly}.json, content/blog/uz/uzum-marketda-sotuvchi-bolish.json, content/blog/ru/kak-stat-prodavcom-na-uzum-market.json.
- Changed content: content/pages/uz/{gpt-telegram-instagram-ideya,instagram-target-yoqish,boss-digital,sayt-yaratish,gpt-chat-qollanma,rus-ozbek-tarjimon}.json, content/pages/ru/{gpt-v-marketinge-smm,boss-digital,gpt-chat-guide,gpt-dlya-ucheby,promty-gpt-chatgpt-50-primerov,russko-uzbekskiy-perevodchik,targetirovannaya-reklama-tashkent,razrabotka-telegram-bota-tashkent}.json, content/blog/uz/{tabrik-yozish,chatgpt-talabalar-uchun}.json, content/blog/ru/telegram-ads-stoimost-i-zapusk-uzbekistan.json.
- Registries and template: content/seo/intent-manifest.json, content/seo/demand-policy.json, public/llms.txt, scripts/widgets/calculator-block.ts (Uzbek copy only), scripts/seo-protection.ts (BASELINE + revision paragraph).
- Evidence: docs/seo/evidence/2026-10-25-ai-tools/reviewed-protected-pages.json, docs/seo/implementation/2026-10-25-ai-tools/review-candidate.ts.
- Tests: tests/seo-protection.test.ts (new revision test), tests/react-router-v8-migration.test.ts (+11 routes), tests/seo-push-revision.test.ts (R3-10: tool pages have no site header, like the chats).
- Docs: docs/seo/CHANGE_LOG_2026-10.md (section «AI-инструменты, волна A 25.10»), this file, docs/agents-platform/STATE.json.

## 4. Архитектурные решения
No code architecture change (the platform is af0446fe, D-AI-TOOL-PAGES-20261025). Content decisions live in the intent manifest: one pair per tool against its chat (manifest only, the protected chats are untouched); the converters own the script queries and the translators keep the translation queries (C63/C64); the Uzum guides are fenced from the target hubs instead of being registered as spokes (becoming a seller is not a subtopic of targeted ads); the general calculator owns «калькулятор», the bot page keeps the project-estimate phrasing (C60); the price table is a section on Boss Digital, not a new URL (A9).

## 5. Что сознательно не сделано
Currency rates, calendar, PDF and QR tools (owner order). Wave-2 clusters (English tenses, tests, formulas, alphabets, maqollar, the «sherlar» hub, EN↔RU translator). The F2 form «product → ready chat template» (new src/gpt-chat component, separate commit). No link from the protected chats to the new tools (needs a reviewed revision after the chats' 28-day window ≈21–25.11). No deploy, no push, no IndexNow.

## 6. Проверки
- npm run build:fast → exit 0 (135 pages, 175 articles, 316 sitemap entries; shared CSS index-B7Z1XlOc.css as in production; chat bundle gpt-chat-cfOqBGh8.js as built by af0446fe).
- npx tsx scripts/seo-protection.ts check → before the revision only «/: internalLinks, bodyTextSha256»; after it «Protected SEO: 10/10 unchanged.»; all ten HTML hashes equal the revision.
- node --import tsx --test, file by file, 61 files (seo-*, blog-*, homepage-*, home-*, gpt-chat*, translator-pages, uz-translit, tool-pages, calculator-engine, irregular-verbs, chat-bundle-budget, gsc-indexation-hygiene, updates-feed, react-router-v8-migration, studio-*, intent-guard, lead-capture-templates, advertising-seo-content, commercial-seo-contract, ai-chat-guide-schema, uzbek-login-journey): no new failure. Known only: gpt-chat «chat first screen», gpt-chat-business-line, gpt-chat-rev-design §5.3, seo-push-revision R3-6/R3-9, react-router-v8-migration ×3 (same count gaps 42 / 38 as before), seo-revenue-claims «free limits on the pricing page», studio-contact ×2 (ai-bot-s-crm #lead-form, «only 149 articles»). New/changed tests pass: seo-protection 15/15, homepage-lists-frozen 4/4, seo-intent-manifest 5/5, seo-anchor-intent 4/4, seo-cluster-quality 19/19, tool-pages 18/18, seo-push-revision R3-10.
- npx tsc -b → 0; npm run typecheck:functions → 0; npx eslint on the 6 changed TS files → 0; npx tsx scripts/seo-audit.ts → «no critical SEO issues»; npm run scan:secrets → only the old tests/telegram-assistant.test.ts:639; Telegram-token grep on the diff → nothing.
- Uzbek apostrophe scan of all Uzbek content files in the change: no ASCII apostrophe, U+02BB or U+02BC between letters; the only «O’» is the acronym suffix FBO’da.

## 7. Известные проблемы
- Release gate: the poems (/uz/ai-sher-yozish/) and greetings (/uz/ai-tabrik-generatori/, /ru/generator-pozdravleniy/) carry «AI yordamida yozilgan, jamoa tahriri» / «написаны для этой страницы с помощью AI и отредактированы нашей командой» (the RU label said «с помощью AI-чата GPTBot.uz»; corrected, the samples were not written in the site's chat), but only AI reviewers (REV-UZ, REV-RU) have read them; a native speaker must read them before deploy.
- Calculator: the Latin SERP and a possible Google calculator box were not checked (CLUSTERS_TO_ADD §9.5); look at the SERP from Uzbekistan once before reading results.
- Telegram Ads currency: Fragment's top-up page says «Gram», the official guide still says «0,1 Toncoin»; the article states both with a date; other pages with «0,1 Toncoin» may need a later review.
- Pre-existing test failures as listed in §6. scripts/chat-layout-check.mjs was not run for the new tool pages (needs a browser).
- External: two deploy lanes share the Pages project (a deploy from another branch without this commit reverts it). Click Merchant -12 fiscal blocker unchanged.

## 8. Следующая задача
Guarded release of wave A on owner command: (1) a native Uzbek speaker reads the 14 poems and 15 Uzbek greetings (and the Uzbek samples of the RU generator) and fixes them, so «jamoa tahriri» is true; (2) merge into the deploy line, npm run build:production, F:/Claude/gptbot-tools/deploy_runner.py check|deploy; (3) live check of the content, not the deployment id (11 new URLs 200, homepage lists, protected 10/10 against the live HTML, sitemap, llms.txt); (4) IndexNow and URL Inspection for the 11 URLs and the retargeted page; (5) read each page from 21 days after a confirmed recrawl (≥100 Uzbekistan impressions), greetings in December–March.

## 9. Acceptance criteria
Live: the 11 new URLs and the retargeted page return 200 with their H1s, chips and widgets (one script per widget); / lists them; seo-protection 10/10 against the live HTML with the 2026-10-25-ai-tools baseline; both chats differ from the predecessor only by the chat bundle name; the seven protected articles byte-identical; sitemap has 316 entries; llms.txt carries the new lines; no protected page links a new tool.

## 10. Команды для старта
git status --short; git log -3 --oneline. $env:NODE_OPTIONS='--max-old-space-size=1400'; npm run build:fast; npx tsx scripts/seo-protection.ts check; node --import tsx --test tests/seo-protection.test.ts tests/homepage-lists-frozen.test.ts tests/seo-intent-manifest.test.ts tests/seo-anchor-intent.test.ts tests/tool-pages.test.ts; DRY=1 npx tsx docs/seo/implementation/2026-10-25-ai-tools/review-candidate.ts (re-runs every check against the current dist).

## 11. Риски
Any change to an H1 or title of a published page, or a new published page, changes the protected homepage and needs a new revision (the AI-tools revision is immutable once committed). A change in src/ changes the chat bundle name and the chats' HTML: a release revision must record it as this one does. Anchors to the new pages must not equal a mustNotTarget phrase (tests/seo-anchor-intent.test.ts). Chips only prefill; never add an auto-send. No ranking or traffic guarantee.

## 12. Rollback
git revert of this commit removes the eleven new URLs, the retargeting, the funnel sections, the registry rows and the protected revision together (BASELINE returns to 2026-10-24-wave1b, which the build of af0446fe passes: the gate does not see script names). After a deploy: redeploy the previous build; the new URLs then 404 and should be removed from Search Console only if they had been submitted. No DB, config or backend change.
