# HANDOFF — SEO growth wave 1b (three Uzbek guides, Telegram hub, llms-full) · 25.10.2026

## 1. Состояние
Wave 1b of the 2026-10-24 growth backlog (W2-03..W2-07) is committed on branch seo/chat-snippets-translator-20261024 (worktree F:/Claude/gptbot-snippets-translator-20261024) on top of 13d2da1f (production f97295b5, deployment a1f56a62, plus its release record). NOT deployed, not pushed. New immutable protected revision docs/seo/evidence/2026-10-24-wave1b/ (previous 2026-10-24-wave1); BASELINE points to it. STATE.json block: seo_wave1b_20261024 (status committed_not_deployed). Wave 1 itself was deployed 24.10 (reports/wave1-20261024/RELEASE.md; block seo_wave1_20261024).

## 2. Что сделано
Owner order 24.10: implement the growth backlog autonomously and deploy; wave 1b is published now instead of after ≈07.11 (tabrik must be indexed well before the December peak). Specs: docs/seo/research/2026-10-24-growth-audit/backlog.json W2-03..W2-07, lenses L3/L6/L4 and l3-data/.
- W2-03 new /uz/blog/tavsifnoma-namuna/: tavsifnoma vs tavsiyanoma, structure, three placeholder samples (o‘quvchi, amaliyotchi talaba, xodim), prompts that use only the reader's facts, checklist, 6 FAQ; requirements depend on the organisation, the signer checks the text, not legal advice. Pair C49.
- W2-04 new /uz/blog/rasmiy-xat-yozish/: requisites, letter types (so‘rov, kafolat, da’vo, minnatdorchilik) with placeholder samples, sending, prompts, 7 FAQ (one for the school assignment); one linkp from the tushuntirish/ariza guide. Pairs C50 and C52.
- W2-05 new /uz/blog/tabrik-yozish/: 30 greetings written for the page, tone table, how to ask the chat to personalise, Cyrillic block for «табриклар», 7 FAQ. Pair C51. Title shortened from the specified 73 to 59 characters.
- W2-06 /uz/telegram-bot-biznes-uchun/: H1 «Telegram bot yaratish biznes uchun: arizalarni avtomatlashtirish», section BotFather / no-code constructor / developer with an honest 3-row table, link to /ru/blog/kak-sozdat-telegram-bota/, 2 FAQ; title, description, keywords and prices unchanged.
- W2-07 dist/llms-full.txt is a superset of llms.txt (cluster notes + llms.txt verbatim + index and bodies of the 28 Markdown twins); twins drop links to unpublished articles; llms.txt +3 intent lines.
- Integrator: intent-manifest C49–C52, demand-policy 11 rows (l3-data, location 2860; «rasmiy xat yozish» 0/UNMEASURED), react-router approved routes +3, built, renamed an identifier in generate-llm-markdown.ts that made Tailwind emit an extra utility and rename the shared CSS on all pages, wrote the protected revision with a refusing generator, seo-protection test, CHANGE_LOG «Волна 1b 24.10», this handoff, STATE.

## 3. Изменённые файлы
content: content/blog/uz/tavsifnoma-namuna.json, rasmiy-xat-yozish.json, tabrik-yozish.json (new), content/blog/uz/tushuntirish-xati-va-ariza-yozish.json (+1 linkp), content/pages/uz/telegram-bot-biznes-uchun.json, content/seo/intent-manifest.json (C49–C52), content/seo/demand-policy.json (+11 rows). public/llms.txt, public/llms-full.txt. scripts/generate-llm-markdown.ts (llms-full superset, exported functions, twins drop unpublished links), scripts/seo-protection.ts (BASELINE + paragraph). tests: seo-trial-product-truth (+3), seo-protection (+1), react-router-v8-migration (+3 approved routes). docs/seo/evidence/2026-10-24-wave1b/reviewed-protected-pages.json, docs/seo/implementation/2026-10-24-wave1b/review-candidate.ts, docs/seo/CHANGE_LOG_2026-10.md, this file, STATE.json. Not committed: docs/seo/research/2026-10-24-growth-audit/NEXT_RELEASES.md (untracked, written outside this stage).

## 4. Архитектурные решения
None new. Content and template hygiene through the existing protected-revision flow. W1-14 imports PROTECTED_PATHS into jsonld-helpers so protected pages keep their reviewed nameless BreadcrumbList during open measurement windows; drop the exclusion only in a later reviewed revision.

## 5. Что сознательно не сделано
Links from the protected UZ chat to the new guides (needs its own reviewed revision after the chat window, ≈21–25.11). Chat-entry bridges (scripts/chat-entry-cta.ts) for the new guides. The tushuntirish guide keeps its dateModified 2026-10-08 (one link paragraph added). build:production, deploy, live readback, IndexNow, URL Inspection: owner command. No protected content file touched. No push, no deploy.

## 6. Проверки
build:fast exit 0 (305 sitemap entries, 173 articles). seo-protection check: before the revision only / internalLinks + bodyTextSha256; after 10/10. Generator checks: / HTML minus the 3 new <li> and with the hub's old label equals the predecessor byte for byte; the other 9 protected pages byte-identical (shared CSS index-B7Z1XlOc.css as in production). 33 SEO/content test files: no new failures; only seo-push-revision R3-6/R3-9, react-router-v8-migration 3/26 and seo-revenue-claims (pricing-page free limits) fail, all pre-existing. tsc -b 0, typecheck:functions 0, eslint on changed TS 0, seo-audit no critical, scan:secrets only tests/telegram-assistant.test.ts:639 (pre-existing). Uzbek apostrophe scan of the five content files: 0 ASCII/U+02BB/U+02BC, no U+2019 after o/g, no mixed-script words. Full tests/*.test.ts suite not re-run for this stage.

## 7. Известные проблемы
Pre-existing failures (also on 1a773ee2): agent-boundaries, bormi-admin-hardening (build:cf order), bunzy-webhook, chat-ui-revision, gpt-account-ui ×2, gpt-chat-business-line, gpt-chat-rev-design, gpt-chat, gpt-click-fiscal, gpt-hash-salt, gpt-live-readiness, gpt-retention, gpt-zai-provider, lead-attribution, lead-radar-api ×2, market-cabinet-shell, n8n-dependency-inventory, platform-ai, platform-runtime, react-router-v8-migration ×3, seo-push-revision R3-6/R3-9, seo-revenue-claims (pricing-page free limits), studio-contact ×2, studio-d1-budget. Two deploy lanes share the Pages project: a later deploy from another branch without this commit silently reverts it. Click Merchant -12 fiscal blocker unchanged. build:fast does not build Studio pages; build:production does.

## 8. Следующая задача
On owner command: npm run build:production; DR_ROOT=this worktree python F:/Claude/gptbot-tools/deploy_runner.py check, then deploy. Live readback: the three guides (200, index, follow, self-canonical, in sitemap), /uz/telegram-bot-biznes-uchun/ H1 and new section, / Uzbek blog list (three new titles at the top) and moneyUz label, /llms-full.txt contains /llms.txt and is ≈586 KB, protected 10/10 against 2026-10-24-wave1b. Then IndexNow for the 6 changed pages (https://gptbot.uz/, /uz/blog/tavsifnoma-namuna/, /uz/blog/rasmiy-xat-yozish/, /uz/blog/tabrik-yozish/, /uz/telegram-bot-biznes-uchun/, /uz/blog/tushuntirish-xati-va-ariza-yozish/), URL Inspection request for the three guides, record the rollout date in CHANGE_LOG «Выкаты». Then the dated releases in docs/seo/research/2026-10-24-growth-audit/NEXT_RELEASES.md.

## 9. Acceptance criteria
Live: protected 10/10 against 2026-10-24-wave1b; the three guides 200, indexable, self-canonical, in sitemap and the Uzbek blog index; the hub shows the new H1; the 9 protected non-home pages byte-identical to the local build (shared CSS index-B7Z1XlOc.css). Traffic outcomes are separate and unconfirmed.

## 10. Команды для старта
git status --short; git log -3 --oneline. $env:NODE_OPTIONS='--max-old-space-size=1400'; npx tsx scripts/seo-protection.ts check; node --import tsx --test tests/seo-protection.test.ts tests/seo-anchor-intent.test.ts tests/translator-pages.test.ts. Deploy only via deploy_runner.py on owner command; never raw wrangler.

## 11. Риски
Translator quality is unverified by a native speaker (beta note on the page; A8). New translator URLs could pick up chat queries — read as a confound of the chats' 28-day window if seen in GSC. W1-04 adds external links to two protected targets (payment, Claude) — record the rollout date. Google may ignore the BreadcrumbList name; Yandex Clean-param needs Yandex.Webmaster (owner O-02) to verify. No ranking or traffic guarantee.

## 12. Rollback
git revert of the wave-1b commit returns content, manifest, demand rows, llms files, tests and BASELINE to 2026-10-24-wave1 together; then guarded build/check/deploy. Partial: set a guide back to status draft (removes it from /, sitemap and feeds only after a new reviewed revision for /). No DB or config changes.
