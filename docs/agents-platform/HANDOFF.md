# HANDOFF — AI tool pages wave B: English tenses tutor, practice tests pilot, niche ad playbooks · 25.10.2026

## 1. Состояние
DEPLOYED 26.10: owner phone replaced by Telegram, deployment a535be94 from 4b219a0c (reports/contact-telegram-20261026/RELEASE.md); phone only on the offers and the privacy-policy requisites.
DEPLOYED 26.10: monetization stages A–B, deployment 853130c0 from d110b692, then acb2c864 from 4924c998 (lastmod + llms.txt); reports/monetization-20261026/RELEASE.md; IndexNow 54 URLs (indexnow.org 200, Yandex 202, Bing 200). Till untouched (offer v5, 20 000 / 300). Before 17.12: docs/paid-chat/MODEL-CLIFF-1712-RU.md.
DEPLOYED 25.10: AI tools wave B, deployment d3010231 from 61c70ce6 (reports/ai-tools-wave-b-20261025/RELEASE.md); IndexNow 30 URLs 200. Production line = seo/chat-snippets-translator-20261024; merge into codex/continuation-20261007 before any deploy from there.
- Дата: 2026-10-25.
- Ветка: seo/chat-snippets-translator-20261024 (worktree F:/Claude/gptbot-snippets-translator-20261024).
- HEAD: the commit «feat(seo): AI tool pages wave B — English tenses tutor, practice tests pilot, niche ad playbooks» on top of 5afc925c (independent check of the pilot tests) ← 1de4cd78 (tests pilot content) ← 205461eb (practice-quiz widget) ← 07fa6d36 (wave A deployed: deployment 8d4c8b4e from 99920cdc). The practice-quiz handoff is 205461eb:docs/agents-platform/HANDOFF.md.
- Завершённый этап: AI tools wave B integration (content of three agents, language reviews, registries, protected revision). STATE.json block seo_ai_tools_wave_b_20261025 (committed_not_deployed).
- Следующий этап: a guarded release of wave B on owner command (STATE.json next_stage); before it, ideally a native Uzbek read and a subject-teacher read of the 120 questions.
- Рабочее дерево: clean after the commit. Not deployed, not pushed.

## 2. Что сделано
- **Thirteen new URLs** (owner order 25.10: every new page is an AI tool of GPTBot.uz, B2C → AI chat / AI pack, B2B → ads and AI bots):
  - English tenses (teacher role, chips, no widget): /uz/ingliz-tili-zamonlari/ (12-tense hub, hreflang pair of /ru/vremena-angliyskogo-yazyka/), /uz/present-simple/, /uz/past-simple/, /uz/present-continuous/ (formula, spelling rules, markers, 10 examples, 6 mistakes, 10 exercises with answers), /ru/vremena-angliyskogo-yazyka/ (RU mirror of the hub; per-tense RU demand is 30–70/mo, so no RU detail pages).
  - Practice tests pilot (CLUSTERS_TO_ADD card 7): /uz/informatika-test/, /uz/fizika-test/, /uz/matematika-test/ (practice-quiz widget, 40 original questions each with key and explanation, schema.org Quiz) and the hub /uz/onlayn-testlar/ (AI test builder, no quiz of its own). Sets uz-informatika / uz-fizika / uz-matematika, 120 questions, solved blind 120/120 (5afc925c, tests-verification.md).
  - Niche ad playbooks (AD_CLIENT_FUNNEL items 9–10, F4): /ru/blog/reklama-stomatologii-i-kliniki-tashkent/ + /uz/blog/stomatologiya-va-klinika-reklamasi/, /uz/blog/oquv-markazi-reklamasi/ + /ru/blog/reklama-uchebnogo-tsentra-tashkent/ (two hreflang pairs; neutral legal notes checked on lex.uz 25.10; only service-page prices).
- **Language reviews** (uncommitted before this stage, folded in): Uzbek review of 13 files (~200 fixes; quiz diffs touch question/explanation/option text only, no `answer:` line), Russian review of 5 files (prices, links, law references re-checked).
- **Registries (integrator only):** intent-manifest pairs C69–C87 and decision A10 (tests pilot on flat URLs, full bank only after the GSC-vs-Ads check ≈10.01.2027); demand-policy +23 measured rows (location 2860, 2026-10-25, each with its research file); APPROVED_STATIC_ROUTE_ADDITIONS +13; public/llms.txt +14 lines (9 tool lines, 5 intent lines).
- **Inbound links:** one linkp on each of 15 older unprotected pages (/uz/notogri-fellar/, /uz/gpt-chat-qollanma/, /uz/blog/chatgpt-talabalar-uchun/, /uz/kalkulyator/, /uz/gpt-uzbek-tilida-ai-chat/, /ru/nepravilnye-glagoly/, /ru/gpt-dlya-ucheby/, the four AI-bot pages for clinics and learning centres after their price tables, and their four bot articles); every new URL now has ≥ 2 inbound links from older unprotected pages. Anchors respect every mustNotTarget (seo-anchor-intent 4/4). The playbooks are not placed inside the frozen bot-services pages.
- **Protected revision 2026-10-25-ai-tools-b:** only "/" changes (internalLinks 311 → 324, 13 labels); the chats and the seven protected articles are byte-identical to the wave A revision. Generator, BASELINE + comment paragraph, and a test in tests/seo-protection.test.ts.

## 3. Изменённые файлы
- New content: content/pages/uz/{ingliz-tili-zamonlari,present-simple,past-simple,present-continuous}.json, content/pages/ru/vremena-angliyskogo-yazyka.json, content/blog/ru/{reklama-stomatologii-i-kliniki-tashkent,reklama-uchebnogo-tsentra-tashkent}.json, content/blog/uz/{stomatologiya-va-klinika-reklamasi,oquv-markazi-reklamasi}.json.
- Reviewed (committed earlier in 1de4cd78/5afc925c, language fixes now): content/pages/uz/{informatika-test,fizika-test,matematika-test,onlayn-testlar}.json, src/tools/quiz/sets/{uz-informatika,uz-fizika,uz-matematika}.ts.
- Inbound links: the 15 source pages listed in §2.
- Registries: content/seo/intent-manifest.json, content/seo/demand-policy.json, public/llms.txt, tests/react-router-v8-migration.test.ts.
- Protection: docs/seo/evidence/2026-10-25-ai-tools-b/reviewed-protected-pages.json (new, immutable), docs/seo/implementation/2026-10-25-ai-tools-b/review-candidate.ts (new), scripts/seo-protection.ts (BASELINE + paragraph), tests/seo-protection.test.ts (+1 test).
- Docs: docs/seo/CHANGE_LOG_2026-10.md (section «AI-инструменты, волна B 25.10»), this file, docs/agents-platform/STATE.json (seo_ai_tools_wave_b_20261025, current_stage, next_stage).

## 4. Архитектурные решения
- A10-tests-pilot-2026-10-25 (intent-manifest): three subjects on flat URLs /uz/<subject>-test/ under /uz/onlayn-testlar/ instead of the research's /uz/testlar/{subject}/ (the content platform builds one flat file per URL); no further subject before the pilot read; no «test javoblari», DTM, milliy sertifikat, BSB or ChSB keys or material.
- Niche playbooks are pairs, not spokes: each playbook is fenced from its service page (C80, C82, C84, C86) and from its frozen AI-bot page (C81, C83, C85, C87); the bot pages link the playbooks, the playbooks declare no bot key.
- The tenses hub is fenced from its three detail pages (C70–C72), Present Simple from Present Continuous (C73, the comparison belongs to Continuous) and the irregular-verbs trainer from Past Simple (C74).

## 5. Что сознательно не сделано
- No deploy, no push, no build:production, no IndexNow/URL Inspection (owner command only).
- No further subjects (biologiya, ona tili, tarix, geografiya, kimyo, huquq, RU биология) and no other tenses until the pilot and the wave are read.
- No links from the protected chats to the new pages (needs its own reviewed revision after the chats' 28-day window, ≈21–25.11).
- No demand rows for keys that returned no volume («ingliz tili zamonlari», «stomatologiya reklamasi»).
- No code change in this commit (the widget is 205461eb).

## 6. Проверки
- npm run build:fast → exit 0: 144 pages, 179 articles, 329 sitemap entries; shared CSS index-B7Z1XlOc.css, gpt-chat-cfOqBGh8.js and practice-quiz-FAFRG24f.js unchanged.
- npx tsx scripts/seo-protection.ts check → before the revision only "/: internalLinks, bodyTextSha256"; after it «Protected SEO: 10/10 unchanged.»
- 61 test files one by one (seo-*, blog-*, homepage-*, home-*, gpt-chat*, tool-pages, translator-pages, uz-translit, calculator-engine, irregular-verbs, practice-quiz, chat-bundle-budget, react-router-v8-migration, updates-feed, gsc-indexation-hygiene, intent-guard, studio-contact, studio-prerender, studio-sitemap, site-stylesheets, lead-capture-templates, advertising-seo-content, commercial-seo-contract, telegram-cost-calculator): 851 pass before the revision, no new failure. Only the known failures remain: gpt-chat «chat first screen», gpt-chat-business-line (budget list), gpt-chat-rev-design §5.3, seo-push-revision R3-6/R3-9, react-router-v8-migration ×3 (count gaps 42 and 38 unchanged), seo-revenue-claims «free limits on the pricing page», studio-contact ×1 (ai-bot-s-crm #lead-form; the old «only 149 articles» failure now passes). After the revision: seo-protection 16/16, homepage-lists-frozen 4/4, homepage-crawler-shell 7/7.
- npx tsc -b → 0; npm run typecheck:functions → 0; npx eslint on the changed TS files (generator, seo-protection.ts, the two tests, the three sets) → 0; npx tsx scripts/seo-audit.ts → no critical issues; npm run scan:secrets → only the known tests/telegram-assistant.test.ts:639.
- Uzbek apostrophe scan of every wave B Uzbek file and of the new link paragraphs: no ASCII apostrophe, U+02BB, U+02BC or o’/g’ with U+2019.

## 7. Известные проблемы
- Pre-existing failures as listed in §6 (unchanged by this stage).
- The Uzbek text of the wave (pages and 120 questions) was written and reviewed by AI agents only; a native speaker and a subject teacher have not read it.
- Tests demand is jump-shaped (×10–100 since Dec 2025, unknown cause); part may be searches for answers during BSB/ChSB. The A10 pilot read decides the full bank.
- scripts/chat-layout-check.mjs was not run for the new pages (needs a browser).

## 8. Следующая задача
Guarded release of wave B on owner command: npm run build:production, F:/Claude/gptbot-tools/deploy_runner.py check|deploy, live readback of the 13 URLs and of "/", IndexNow, URL Inspection; then record the deployment (as 07fa6d36 did for wave A). Recommended before release: a native Uzbek read of the tenses pages and playbooks and a subject-teacher read of the 120 questions. After release: read new pages like C41 (≥100 UZ impressions within 21 days of a confirmed recrawl); the A10 tests pilot read ≈10.01.2027.

## 9. Acceptance criteria
build passes the tool-page gate for all quiz pages; seo-protection 10/10 against 2026-10-25-ai-tools-b; homepage-lists-frozen 4/4; seo-intent-manifest, seo-anchor-intent, seo-commercial-coverage, seo-demand-gate, seo-cluster-quality green; every new URL has ≥ 2 inbound links from older unprotected pages; shared CSS name unchanged; no new test failure against the known list.

## 10. Команды для старта
git status --short; git log -5 --oneline. $env:NODE_OPTIONS='--max-old-space-size=1400'; npm run build:fast; npx tsx scripts/seo-protection.ts check; node --import tsx --test tests/seo-protection.test.ts; node --import tsx --test tests/homepage-lists-frozen.test.ts; node --import tsx --test tests/practice-quiz.test.ts; node --import tsx --test tests/seo-intent-manifest.test.ts; node --import tsx --test tests/seo-anchor-intent.test.ts.

## 11. Риски
A homepage label change (H1 or article title) on any of the 13 pages after this commit needs a new protected revision (the 2026-10-25-ai-tools-b file is immutable). A quiz set moved outside src/tools/quiz/sets/ would be scanned by Tailwind and could rename the shared CSS. The questions must stay original practice material: no leaked exam answers, no claim of official status. The playbooks must not move into the frozen bot pages.

## 12. Rollback
git revert of this commit removes the five tenses pages, the four playbooks, the language fixes of the test pages and sets, the registry rows (C69–C87, A10, 23 demand rows, 13 routes, 14 llms lines), the 15 inbound paragraphs and the protected revision (BASELINE returns to 2026-10-25-ai-tools). The three test pages, the hub and the sets come from 1de4cd78 and 5afc925c: revert those as well, newest first, so the homepage lists match the wave A revision again. The widget (205461eb) is inert without a page. No DB, config or backend change.
