# HANDOFF — SEO growth wave 1 + RU-UZ translator publication · 24.10.2026

## 1. Состояние
Wave 1 of the 2026-10-24 growth backlog is committed on branch seo/chat-snippets-translator-20261024 (worktree F:/Claude/gptbot-snippets-translator-20261024) on top of 1a773ee2 (production d54d5b61 + merged translator drafts). Not pushed, not deployed: production is still d54d5b61 (deployment d0264730, chat snippets). The RU-UZ translator pages are published in source. New immutable protected revision docs/seo/evidence/2026-10-24-wave1/ (previous 2026-10-24-chat-snippets). STATE.json block: seo_wave1_20261024.

## 2. Что сделано
Owner order 24.10: implement the verified growth backlog autonomously and deploy. Backlog docs/seo/research/2026-10-24-growth-audit/ (BACKLOG.md, backlog.json, verdicts in workflow-result.json and verify-W1-*.md); every item uses the verifier's corrected action.
- W1-01 trial honesty: 5 unprotected RU pages now say 3 lifetime trial replies, then the AI pack (no «дневной/часовой лимит», «базовый доступ»); FAQ «Можно ли пользоваться GPT бесплатно без ограничений?».
- W1-02 /uz/suniy-intellekt/: keyword apostrophes, new title, honest chat block, types, history table, services table, pros/risks, essay plan, Cyrillic note, 2 FAQ, 10 sources; 5 donor links.
- W1-03 «Как расшифровывается ChatGPT» on /ru/gpt-vs-chatgpt-sravnenie/, chto-takoe keywords, pair C46.
- W1-04 5 links to the payment and ChatGPT-and-Claude articles. W1-05 (as UX hygiene) Studio links. W1-06 3 UZ links. W1-08 insho «murakkab reja» for 3 topics. W1-10 H-3 anchor.
- W1-11 tests/seo-anchor-intent.test.ts. W1-12 robots.txt Clean-param. W1-13 (b, c) llms/md Cache-Control detach, 404 title. W1-14 BreadcrumbList name outside PROTECTED_PATHS, /uz/ self-loop removed.
- Translator publication: status published, visible beta note on both pages, pairs C47/C48, A8 publicationNote, contextual inbound links from 6 unprotected pages, llms.txt entries.
- Integrator: built, wrote the protected revision with a refusing generator, fixed the R3-10 build test for the translator pages (chat template, no site header), added suniy-intellekt to trialFiles, CHANGE_LOG, this handoff, STATE.

## 3. Изменённые файлы
content: 11 RU and 11 UZ page/article files (see CHANGE_LOG table), content/seo/intent-manifest.json, content/seo/demand-policy.json. public/llms.txt, public/llms-full.txt, public/404.html. scripts/jsonld-helpers.ts, scripts/generate-robots.ts, scripts/chat-layout-check.mjs, scripts/seo-protection.ts (BASELINE + paragraph); src/shared/robots-policy.ts; package.json (scripts.test +2 files). tests: seo-anchor-intent (new), seo-breadcrumb-ld (new), seo-trial-product-truth, translator-pages, gsc-indexation-hygiene, bormi-admin-hardening, react-router-v8-migration, seo-protection, seo-push-revision. docs/seo/evidence/2026-10-24-wave1/reviewed-protected-pages.json, docs/seo/implementation/2026-10-24-wave1/review-candidate.ts, docs/seo/research/2026-10-24-growth-audit/ (research + verifier evidence; one table cell reworded in verify-W1-14.md to clear a secret-scan false positive), docs/seo/CHANGE_LOG_2026-10.md, this file, STATE.json.

## 4. Архитектурные решения
None new. Content and template hygiene through the existing protected-revision flow. W1-14 imports PROTECTED_PATHS into jsonld-helpers so protected pages keep their reviewed nameless BreadcrumbList during open measurement windows; drop the exclusion only in a later reviewed revision.

## 5. Что сознательно не сделано
W1-07 and W1-09 (refuted; the optional W1-09 UX link was not added). W1-13(a): /?lang=ru is a Cloudflare zone Page Rule, not repo code. W1-15: post-deploy step. W1-02(9) figure: no image, nested list instead. Backlog evidence corrections (W1-04 §2, W1-05 §6) stay in verify-*.md. No protected content file touched; no dateModified bumps beyond those the corrected actions require (gde-polzovatsya, sravnenie, suniy-intellekt, insho). Translator blind check and native proofreading NOT done (pages say beta). No push, no deploy.

## 6. Проверки
build:fast exit 0. seo-protection check: before the revision only / internalLinks + bodyTextSha256; after 10/10. Generator checks: / HTML minus the 2 new <li> equals the predecessor byte for byte; both chats equal the predecessor with the old bundle name; 7 protected articles byte-identical. Full suite node --import tsx --test tests/*.test.ts (19 batches): 4548 tests; 31 failures, of which R3-10 on the build was new (translator pages have no site header) and is fixed in the test; the other 30 fail identically on a clean 1a773ee2 export (n8n-dependency-inventory lists only pre-existing tracked files). Re-run of the touched SEO suites after fixes: 51/53, only R3-6/R3-9 (pre-existing). tsc -b 0, typecheck:functions 0, eslint on 15 changed TS/JS files 0, seo-audit no critical, scan:secrets only tests/telegram-assistant.test.ts:639 (pre-existing). Uzbek apostrophe scan of added lines: 0 ASCII/U+02BB/U+02BC, no U+2019 for o‘/g‘.

## 7. Известные проблемы
Pre-existing failures (also on 1a773ee2): agent-boundaries, bormi-admin-hardening (build:cf order), bunzy-webhook, chat-ui-revision, gpt-account-ui ×2, gpt-chat-business-line, gpt-chat-rev-design, gpt-chat, gpt-click-fiscal, gpt-hash-salt, gpt-live-readiness, gpt-retention, gpt-zai-provider, lead-attribution, lead-radar-api ×2, market-cabinet-shell, n8n-dependency-inventory, platform-ai, platform-runtime, react-router-v8-migration ×3, seo-push-revision R3-6/R3-9, seo-revenue-claims (pricing-page free limits), studio-contact ×2, studio-d1-budget. Two deploy lanes share the Pages project: a later deploy from another branch without this commit silently reverts it. Click Merchant -12 fiscal blocker unchanged. build:fast does not build Studio pages; build:production does.

## 8. Следующая задача
On owner command: npm run build:production; DR_ROOT=this worktree python F:/Claude/gptbot-tools/deploy_runner.py check, then deploy. Live readback: both translator pages (index, follow, canonical, hreflang pair, beta note), / list, /uz/suniy-intellekt/ title, robots.txt?v=<ts> Clean-param, /llms.txt single Cache-Control. Then IndexNow for the 23 changed URLs (list in the commit report / CHANGE_LOG), record the rollout date in CHANGE_LOG «Выкаты», inspect_urls on 2-3 non-protected URLs for the BreadcrumbList name. Then wave 2 (BACKLOG.md §5).

## 9. Acceptance criteria
Live: protected 10/10 against 2026-10-24-wave1; translator pages 200, indexable, self-canonical, in sitemap with x-default /uz/rus-ozbek-tarjimon/; robots.txt has exactly one Clean-param line and no Yandex group; the 9 protected non-home pages byte-identical to the local build. Traffic outcomes are separate and unconfirmed.

## 10. Команды для старта
git status --short; git log -3 --oneline. $env:NODE_OPTIONS='--max-old-space-size=1400'; npx tsx scripts/seo-protection.ts check; node --import tsx --test tests/seo-protection.test.ts tests/seo-anchor-intent.test.ts tests/translator-pages.test.ts. Deploy only via deploy_runner.py on owner command; never raw wrangler.

## 11. Риски
Translator quality is unverified by a native speaker (beta note on the page; A8). New translator URLs could pick up chat queries — read as a confound of the chats' 28-day window if seen in GSC. W1-04 adds external links to two protected targets (payment, Claude) — record the rollout date. Google may ignore the BreadcrumbList name; Yandex Clean-param needs Yandex.Webmaster (owner O-02) to verify. No ranking or traffic guarantee.

## 12. Rollback
git revert of the wave-1 commit returns content, tests, manifest and BASELINE to 2026-10-24-chat-snippets together; then guarded build/check/deploy. Partial: set the two translator pages back to status draft (removes them from /, sitemap and llms only after a new reviewed revision for /). No DB or config changes.
