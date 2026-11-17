# Current handoff — chat conversion release A · 17.11.2026

## 1. State
Branch claude/chat-cro-20261117, based on 39f39572 (production code 223a90a5). Production runs ac666d08 (deployed_and_verified, https://fb1ba443.ai-direct-pro-landing.pages.dev); live readback is in F:/_moved_from_C/Documents_ChatGPT/Easy Breezy/delivery/gptbot-chat-cro-roadmap-20261117/release-a. Working tree: clean after the commit.
## 2. Delivered
AI tool pages open with their own question, one-tap starters, follow-ups and an answer rating. The pack window says «Открываем страницу Click…» from the tap, speaks with a retry where it used to stop in silence, and returns to the wait by itself when the browser never leaves. Back without a payment: one card with continue, another way, ask someone to pay and a Telegram message carrying the order reference. «Нет карты?» makes a payment link for someone else. Payme links never hold a slash. A repeating fiscal failure pages the owner once a day per cause.
## 3. Files
src/gpt-chat/account/{AccountDialog,CheckoutReturn,pay-part}.tsx; src/gpt-chat/parts/{pay-screens.tsx,pay.css,chat-pay.ts,chat-uzum.ts,chat-conversion.tsx,cro.tsx,cro.css}; src/gpt-chat/{role-ui.ts,trial-copy.ts,account-strings.ts,ui-events.ts}; src/shared/checkout-events.ts; functions/lib/gpt-chat/{payme-checkout,ui-event-store,alert-policy,billing-maintenance-store}.ts; tests/{gpt-pay-cro,gpt-pay-browser,gpt-payme-link,chat-cro-ui}.test.ts and the pins they moved.
## 4. Decisions
D-CHAT-CRO-20261117 in DECISIONS.md.
## 5. Excluded
Order creation, amounts, granting, callbacks and receipts were not changed. No trial or limit change. No owner notice for unpaid attempts and no contact capture (weighed, rejected). No edit to the protected pages' titles, descriptions or visible text. CHAT_RETURN_PATHS unchanged.
## 6. Validation
Guarded release ac666d08: production build 1,281 files; gate of 55 test files run one by one with no new failing test (ten files fail exactly as on the predecessor; names in release-a/gate-fail-names.txt); chat bundle budget pass (start 109,980 B of 110,000, chat-account 11,880 B of 12,000, chat-pay 5,260 B); tsc -b, functions typecheck and eslint on the changed files clean; tests/gpt-pay-browser.test.ts drives the production build in Chrome with offline fixtures (refusal and retry, a browser that never leaves, a tap during a read, the link for someone else, a return that does not blink); release check pass; live readback 23 of 23: manifest and artifact, ten protected pages equal to the reviewed revision, five chat pages and twenty assets served as built, the anonymous account view, and the deployed bundle in a browser on /ru/gpt-chat/ and /uz/kirill-lotin/ with the order and event endpoints answered locally (no order, no counted event).
## 7. Known limits
No real payment was made by the agent: the owner pays once from a phone. Start bundle headroom is 20 B and chat-account 120 B: free space before adding to either. Click receipts are still refused by Click (-12): see STATE chat_cro_20261117.clickReceipts. The Click secret key was pasted into the chat on 2026-11-17: reissue after receipts work.
## 8. Next task
Release B: the one-time pack (5 000 UZS, 30 answers, 3 days) behind the flag GPT_PACK_ONCE, by the plan in agents/single-pack-plan.json of the evidence folder. The offer edition changes only after the owner has read the text.
## 9. Acceptance
Live manifest commit equals the release commit; the ten protected pages equal the reviewed revision; the pack window shows the price of one answer and «Нет карты?»; a refused order says so with a retry; the owner's own payment from a phone ends with the pack on screen.
## 10. Start commands
git status/log; node --import tsx --test tests/gpt-pay-cro.test.ts; after a build: node --import tsx --test tests/gpt-pay-browser.test.ts.
## 11. Risks
Do not call pay() from an effect except the two guarded continuations of a tap (tests/chat-entry.test.ts). Do not store the watch of a shared link. Do not raise bundle budgets. Do not change the classic order of Payme pairs where the link already has no slash.
## 12. Rollback
Revert ac666d08, d63f4e30, ad04507d and 4646dd5e on top of current production and use the guarded release. No data or schema migration; the new event types stay as rows nobody reads. Previous handoff retained below.

---
# Current handoff — SEO waves release · 17.11.2026

## 1. State
Branch claude/seo-waves-20261117, based on 7a0f1b81 (production code c907a6c4). Stage: all waves of the growth roadmap. Production runs 223a90a5 (deployed_and_verified); live readback is in F:/_moved_from_C/Documents_ChatGPT/Easy Breezy/delivery/gptbot-seo-waves-20261117/release. Working tree: clean after the commit.
## 2. Delivered
52 new URLs (sitemap 370 → 422): AI guides (Gemini, Claude, DeepSeek, ChatGPT versions, Gamma, NotebookLM, Higgsfield, Flow; three in Russian) with the hub /uz/ai-xizmatlar/; seasonal poems and greetings; ready-text collections; school pages; document samples; a 2027 calendar. 45 files in /downloads/docs-20261117/. Eight existing pages strengthened; /uz/, the document hub and the Russian calculator link the new pages.
## 3. Files
content/blog/{ru,uz}/ and content/pages/{ru,uz}/; content/seo/intent-manifest.json (113 → 126 pairs); public/downloads/docs-20261117/ with five generator scripts in scripts/; src/shared/content-downloads.ts; public/_headers; scripts/generate-robots.ts; scripts/seo-protection.ts (BASELINE); tests/content-downloads.test.ts; docs/seo/CHANGE_LOG_2026-11.md; docs/seo/evidence/2026-11-17-seo-waves/; reports/seo-waves-20261117/.
## 4. Decisions
D-SEO-WAVES-20261117 in DECISIONS.md.
## 5. Excluded
No edit to the ten protected pages except the homepage lists. /ru/gpt-chat/ and the leaders' titles wait for 2026-12-21. No widget, quiz-set, payment, bot, webhook, pixel, CSP or chat-bundle change. /uz/rasmdan-yechim/ from the roadmap does not exist in content and was skipped.
## 6. Validation
Guarded release 223a90a5: production build 1,277 files, final gate of 21 build-dependent test files with no new failing test, release check pass; live readback 127 of 127 (52 new and 11 changed pages, ten protected pages equal to the reviewed revision, 45 download files with noindex); IndexNow 63 URLs accepted by api.indexnow.org, Bing and Yandex; sitemap.xml resubmitted and downloaded by Google at 02:21:30 UTC.
## 7. Known limits
No native proofreading (poems, greetings, 80 grammar questions, Cyrillic blocks, Uzbek element names). Provider facts dated 2026-11-17; the Flow guide needs an update after Veo leaves Flow on 2026-12-05. Ads volumes are an upper bound. The full npm test list is not green on the predecessor either: compare with the recorded baseline.
## 8. Next task
Observation by the roadmap gate; refresh dated provider facts; read R14/R15/R20 on 2026-12-21.
## 9. Acceptance
New URLs return 200, are self-canonical, in the sitemap and indexable; download files return 200 with X-Robots-Tag noindex; the ten protected pages equal the reviewed revision; live manifest commit equals the release commit.
## 10. Start commands
git status/log; docs/seo/CHANGE_LOG_2026-11.md; reports/seo-waves-20261117/artifact-review.json.
## 11. Risks
Do not edit the chats, the download guide or the login guide before 2026-12-21. Do not create a second page for an intent that has an owner. Do not raise bundle budgets. Keep the counts in titles equal to the content.
## 12. Rollback
Revert the release commit on top of current production and use the guarded release; restore BASELINE to docs/seo/evidence/2026-11-16-seo-growth/. No data or schema migration. Previous handoff retained below.

---
# Current handoff — SEO growth release · 16.11.2026

## 1. State
Branch claude/seo-growth-20261116, based on exact live da97b1f5772dff0a8f530d602874055ff01a54cc. Stage: SEO growth after the blind-spot audit. Production runs c907a6c4 (deployed_and_verified); live readback is in F:/_moved_from_C/Documents_ChatGPT/Easy Breezy/delivery/gptbot-seo-growth-20261116/release. Working tree: clean after the commit.
## 2. Delivered
Ten new URLs (sitemap 360 → 370): four Uzbek document samples with DOCX/PDF (dars tahlili, tilxat, hisobot, kafolat xati), esse and murakkab-reja guides, New Year and birthday greeting collections, a Russian ChatGPT download guide, the /uz/hujjat-namunalari/ hub. Downloadable samples on three existing guides and a second example on the bildirgi/bildirishnoma sample. Consumer links from /uz/ and the tests hub. Lead forms: service-specific task examples, lead_form_view and lead_form_start on every form. Chat prompt: Cyrillic Uzbek on explicit request.
## 3. Files
content/blog/{ru,uz}/ and content/pages/{ru,uz}/ (10 new, 33 existing pages changed); content/seo/intent-manifest.json (101 → 113 pairs); public/downloads/docs-20261116/ (18 files) with scripts/docs-document-templates-20261116.py; src/shared/content-downloads.ts; public/_headers; public/llms.txt; scripts/generate-robots.ts, lead-form.ts, pseo-documents.ts, seo-protection.ts (BASELINE); functions/lib/gpt-chat/prompt.ts; tests/content-downloads, lead-capture-templates, seo-protection; docs/seo/CHANGE_LOG_2026-11.md; docs/seo/evidence/2026-11-16-seo-growth/; reports/seo-growth-20261116/.
## 4. Decisions
D-SEO-GROWTH-20261116 in DECISIONS.md: measured demand plus a usable artefact per new page; one URL per document type; head terms moved from aggregator guides to their own pages; cohort list fixed; protected leaders untouched.
## 5. Excluded
No edit to the ten protected pages except the homepage lists. No title/description change on the chats or the login guide (R14/R15 until 2026-12-21). No payment, bot, webhook, pixel, CSP, schema or chat-bundle change. No lastmod rewrite (54 of 58 understated pages were already recrawled). No /uz/tariflar/ restructure (links already target #ai-paket). No Gemini/Gamma guides, new tests, legal templates or rank-tracker run.
## 6. Validation
Release branch against untouched da97b1f5, one test file at a time (181 files): 2314 tests, 2276 pass, 31 fail, 7 skipped; predecessor 2297 / 2257 / 33 / 7; no new failing test name, all 31 reproduce on the predecessor. tsc -b and Functions typecheck: 0 errors; scoped ESLint clean; seo-audit OK (blog score 98/100). Production build: stamped c907a6c4, 1180 files; chat bundle within the unchanged budget; seo-protection check 10/10 against the new reviewed revision; post-build suites green (chat-bundle-budget 11, seo-protection 21, content-downloads 4, homepage-lists-frozen 4, pages-production-release 10). Guarded check: pass, predecessor da97b1f5 confirmed. Deploy 2026-11-16 17:04 UTC: deployed_and_verified. Live readback 51/51: manifest commit and artifact, sitemap 370, ten new URLs 200 and self-canonical, ten protected pages equal the reviewed revision, 18 downloads 200 with X-Robots-Tag noindex. One guest chat question on production answered in Uzbek Cyrillic on request. WebSub feeds accepted; IndexNow accepted 24 new and changed URLs (api.indexnow.org 200, Yandex 202).
## 7. Known limits
Uzbek texts were written without a native proofreader. Ads volumes are grouped and are not a forecast; week-old cohort pages are not in the top yet. Yandex gives about half of search sessions and has no webmaster data. The full npm test list is not green on the untouched predecessor either: compare with the recorded baseline, do not chase those failures here.
## 8. Next task
Observation only: URL Inspection for the ten new URLs, GSC windows from each confirmed crawl, weekly server funnel snapshot. Read R14/R15/R20 on 2026-12-21.
## 9. Acceptance
Ten new URLs return 200, are self-canonical, in the sitemap and indexable; 18 download files return 200 with X-Robots-Tag noindex; the ten protected pages equal the reviewed revision; live manifest commit equals the release commit; first indexing readback within 7 days.
## 10. Start commands
git status/log; docs/seo/CHANGE_LOG_2026-11.md; reports/seo-growth-20261116/artifact-review.json. Before any edit of a changed URL, read its lastCrawlTime and the baseline table in the change log.
## 11. Risks
Do not edit the chats, the download guide or the login guide before 2026-12-21. Do not create a second page for a document type that already has one. Do not raise bundle budgets. Do not resubmit sitemaps or request indexing in bulk. Keep the counts in titles (3, 14, 51, 57) equal to the content.
## 12. Rollback
Revert the release commit on top of current production and use the guarded release; restore BASELINE to docs/seo/evidence/2026-11-09-marketing-final/. No data or schema migration. New URLs then return 404; nothing redirects to them. Previous handoff retained below.

---
# Current handoff — chat terminal-stream errors · 14.11.2026

## 1. State
Scoped implementation on codex/chat-errors-20261114, based on exact live d1eca4a681d83e46202203a7b60b44746b5c57a9. Release remains subject to guarded production build and live verification; receipts are outside the repository.
## 2. Delivered
Client done/error and provider [DONE] terminate consumption. Late transport errors no longer replace completed answers. Cancellation cannot hold settlement open indefinitely.
## 3. Files
src/gpt-chat/api.ts; functions/api/gpt/chat.ts; their stream/truncation regression tests; reports/chat-errors-20261114/IMPLEMENTATION.md.
## 4. Decisions
No architecture change. Terminal events follow the existing SSE contract; finish reason alone remains nonterminal. Usage and settlement ordering are preserved.
## 5. Excluded
No model-policy, billing-rule, payment, bot, SEO, campaign, schema or database changes. No hidden analytics suppression.
## 6. Validation
Client20/20; backend/budget/Z.ai53/53; TypeScript web and Functions, scoped lint passed. Broader suite exposed two fixed-count model-policy failures reproduced on unchanged live source; initial missing-dist skip requires post-build SEO recheck. Exact final logs and build/bundle results are in the evidence directory.
## 7. Known limits
Screenshot reports30 GA4 users, but its exact event date/error-code breakdown was unavailable. Reservation counts cannot identify those users. No claim of zero errors or measured improvement.
## 8. Next task
Guarded production release and exact live readback of this fix, using deploy_runner.py only, with current production ancestry retained.
## 9. Acceptance
Reviewed source committed; production build and hard bundle/SEO gates pass; manifest/served asset match; complete production configuration hashes and secret names match the fresh before snapshot.
## 10. Start commands
Read git status/log and the scoped report. DR_ROOT must be the physical delivery/gptbot-chat-errors-20261114/site worktree. Run build:production, deploy_runner.py check, then deploy. Evidence: ../evidence.
## 11. Risks
Do not equate30 client_gone turns with30 GA4 users, change error tracking to hide failures, raise bundle budgets, overwrite newer production, or redeploy old CRM/bot code. Preserve all existing provider secrets and native bindings.
## 12. Rollback
Revert only this scoped commit on top of current production and use guarded release; no data rollback or schema migration. Previous handoff retained below.

---

# Current handoff — target landing CRO · 13.11.2026

## 1. State
Local implementation validated; full production build and guarded deployment pending. Owner explicitly requested an in-place redesign with unchanged advertising URL and budget.
## 2. Delivered
Isolated static conversion layout, two generated illustrations, clear package, early compact form, source metadata and accepted-only conversion tracking.
## 3. Files
See reports/target-cro-20261113/IMPLEMENTATION.md and scoped commit diff.
## 4. Decisions
Keep `/uz/instagram-target-yoqish/`, title, H1, canonical, hreflang and original SEO article. No Meta write or ad restart.
## 5. Excluded
No backend, database, payment, bot, shared chat, automation or account changes.
## 6. Validation
TypeScript, scoped lint, target tests and responsive mocked-flow QA passed. Ten protected pages unchanged. One stale calculator source assertion reproduces on the predecessor; no calculator runtime change.
## 7. Open issues
Conversion uplift requires real post-release observation. Mocked form checks do not prove new CRM delivery.
## 8. Next task
Build production, guarded check/deploy, public asset/SEO/form QA with transports mocked, then read Meta destination and budget again.
## 9. Release
DR_ROOT=F:/_moved_from_C/Documents_ChatGPT/Easy Breezy/delivery/gptbot-cro-implementation-20261113/site; deploy_runner.py only. Live baseline source was 28dfc6339b4aba5fb7556957137bde3bd22de224.
## 10. Evidence
Parent delivery folder contains before/after snapshots, images/prompts, QA, build/deploy logs and final release receipt.
## 11. Cautions
Read current production ancestry before releasing. Keep image prompts and generated assets, avoid real test leads and external messages. No git push authorized or needed.
## 12. Previous handoff
Prior operational history remains below unchanged. The current owner request is scoped to the target landing, not unrelated platform stages.

---

# Current handoff — Lead Radar readiness · 09.11.2026

## 1. State
Runtime fix deployed and verified; owner UI successfully connected the configured sender (masked 2410), retaining history. Recipient source checks remain pending after OpenStreetMap 429. No messages sent.
## 2. Delivered
Car-wash intent, private TG Sender service binding, explicit provider status refresh and truthful blocked sender UI.
## 3. Files
See reports/lead-radar-ready-20261109/IMPLEMENTATION.md and scoped commit diff.
## 4. Decisions
Preserve every previous account, search and campaign; only the existing explicit cutover may retire a legacy connection after its safety checks.
## 5. Excluded
No actual company message, fabricated contact approval, schema change, bot webhook, SEO or payment modification.
## 6. Validation
53 targeted, 109 outreach and 47 release checks PASS; three typechecks, scoped lint and full production build PASS. Public readback is required before claiming production ready.
## 7. Open issues
Cutover completed. 22 new car-wash cards have no websites/phones/Telegram; do not label them ready recipients. Existing 28-contact audience is preserved. Source verification must complete after its provider cooldown.
## 8. Next task
Build, guarded Pages release, preserved-config automation release, authenticated sender readback and campaign preparation. Stop before sending.
## 9. Release
DR_ROOT=F:/Claude/gptbot-outreach-ready-20261109; deploy_runner.py check/deploy only. Separate automation release snapshots current settings and adds only its private sender binding.
## 10. Evidence
F:/Claude/gptbot-tools/lead-radar-help-20261109. Private files remain ACL restricted; do not publish secrets or contact details.
## 11. Cautions
Current production ancestry is 07685df5. Do not redeploy the older November 7 worktree. Keep daily/pacing limits, tenant and sender binding checks unchanged.
## 12. Previous handoff
Prior history follows unchanged.

---

# Current handoff — marketing GAP implementation · 09.11.2026

## 1. State
VALIDATED, PENDING GUARDED RELEASE. Owner authorized all twenty candidates. Runtime predecessor verified live: e49675252b1c4acdd1770f7b42fc5aa5a0c42630.

## 2. Delivered
Ten new practical resources, ten improved owners, thirteen contextual-link parents, nine CSV worksheets and two local tools. See reports/marketing-gap-20261109/IMPLEMENTATION.md.

## 3. Files
PLAN.json and content-changes.json identify scope. Typed tool page, isolated static assets, existing prerender and exact download allowlist reused.

## 4. Decisions
A13 preserves existing commercial owners. New informational/tool resource registry; no new hreflang equivalence, redirect or price reassignment.

## 5. Excluded
No bot, payment, database, webhook, credential, advertising-account or subscription changes. No git push.

## 6. Validation
All 350 old metadata contracts preserved; 360 URLs. Homepage reversal proves only ten approved additions. 60 responsive checks plus six functional/no-JS checks; source tests and scoped lint/typecheck.

## 7. Open issues
UZ target remains Google Crawled-currently-not-indexed; no robots/canonical/fetch exclusion. Useful service improvements are implemented, but Google recovery requires recrawl and confirmation.

## 8. Next task
Finish full production build, guarded check/deploy, exact public readback, binding parity and discovery notifications. Save actual receipts in RELEASE.md.

## 9. Release
DR_ROOT must be this physical F: worktree. Use deploy_runner.py only. Preserve its local config discovery lock and rollback safeguards.

## 10. Evidence
External baseline and logs: ../evidence/marketing-release-20261109/. Immutable reviewed SEO revision: docs/seo/evidence/2026-11-09-marketing/.

## 11. Cautions
Small demand estimates are not traffic promises; no fabricated cases, fees or ratings. Do not expand automatically. Chat start budget remains protected.

## 12. Previous handoff
The prior production history is retained below.

---

# Current handoff — pSEO20 production verified · 08.11.2026

## 1. State
DEPLOYED AND VERIFIED. Runtime e49675252b1c4acdd1770f7b42fc5aa5a0c42630; Pages 15140984; artifact 5d6527b9738acb27ca4b5966320d5574fcec43d9004bd3a074db76c02b2f6965, 1,126 files. Explicit owner authorization covered this twenty-page cohort. Source, build and deployment evidence: reports/pseo20-20261108/RELEASE.md.

## 2. Delivered
Ten document guides / 20 DOCX/PDF files; ten practice pages / 120 original questions; multiplication and exact-equation tools; existing-parent links and intent ownership.

## 3. Files
See reports/pseo20-20261108/IMPLEMENTATION.md and exact src/shared/pseo20.ts registry. New content/datasets/renderers, scoped styles, quiz registration, parent links, tests and reviewed SEO baseline.

## 4. Decisions
A12 in intent-manifest: standalone original useful resources, preserved broad owners, nonofficial obyektivka scope. D-PSEO20-20261108 in DECISIONS.md.

## 5. Excluded
No paid research/subscription, Meta changes, backend/payment/bot/webhook/secret changes or speculative mass expansion.

## 6. Validation
74 browser, 150 document and 185 distinct regression checks pass after the documented stale-test correction; TypeScript/lint/SEO audit and full candidate compilation pass.330 old metadata contracts preserved;320 complete contracts unchanged. See external evidence and implementation report.

## 7. Open issues
No remaining content or engineering blocker. Production build, stamp, guarded deploy and public readback completed. One unchanged immutable CSS differs only in exact reviewed LF/CRLF representation; documented in RELEASE.md. Indexing/ranking/citations remain unmeasured. Chat start109,968 B vs 110,000 B budget.

## 8. Next task
Observe this fixed cohort after confirmed recrawl. Google downloaded both refreshed sitemaps with zero errors; IndexNow accepted twenty URLs. No automatic page expansion or campaign changes.

## 9. Acceptance
Completed: exact manifest; 350 HTML pages and all20downloads match, 505 exact byte checks plus one reviewed predecessor CSS representation, 40 correct live headers and8nativebindings. Next observation: query→page distribution, indexation, useful tool/download activity and actual conversions; no growth claim from delivery alone.

## 10. Start
Read scoped STATE and RELEASE.md; inspect current git and live manifest before any further work. Physical worktree: F:/_moved_from_C/Documents_ChatGPT/Easy Breezy/gptbot-pseo20-20261108. Existing read-only SEO monitoring may observe this cohort; do not republish or resubmit unchanged files.

## 11. Risks
Preserve earlier Wrangler config-discovery guard and current bot routing. New review baseline predecessor is immutable. Do not replace other project state.

## 12. Rollback
Scoped revert on current ancestry, new guarded build; never restore an artifact with missing bindings or overwrite later work. Runtime SHA and discovery/public receipts are recorded in RELEASE.md.

Previous handoffs and unrelated operational context are preserved below.

---

# Current handoff — dark brand correction and campaign delivery · 08.11.2026

**DEPLOYED / VERIFIED.** Runtime `e85da915a070acc71b7d9b76b5a7a92b1ac08fe4`, Pages `77085220`; strict public readback **464/464 PASS**. All eight native resources and packed runtime settings verified. One marked synthetic campaign lead reached `sent` on the first attempt through @gptbotuz_bot; webhook unchanged. The owner corrected the light design and requested SEO-safe linking plus this bot's delivery. Scope complete; Meta campaigns remain untouched.

Dark palette, typography, buttons, navigation and five refreshed illustrations match existing GPTBot pages. Ten new dark creative PNGs plus source/copy/UTM archives are ready. Previous light assets remain intact. Two relevant incoming links and one service link added; all 330 metadata/indexation contracts preserved, 327 unrelated HTML documents differ only in reviewed generated asset URLs, ten protected pages pass without replacing the baseline.

Campaign notification is isolated by exact source/page/service in the existing durable outbox. Only GPT_CAMPAIGN_NOTIFY_BOT_TOKEN was added; the recipient remains the existing explicit GPT_NOTIFY_CHAT_ID. No shared sender replacement, webhook/bot-command/billing change or Worker deployment. Test receipt confirms API acceptance, not an owner read; the clearly labelled synthetic row remains as evidence.

Release recovery fixed parent wrangler.jsonc shadowing local TOML. Pages rejects --config; guarded deployment now exposes exact TOML as an exclusive temporary local JSON under the shared lock and removes only its unchanged file. Parent configuration and existing files are preserved. The final release restored resources and both public runtime settings; 49 secret bindings remain. Never roll back to the missing-binding deployment.

Validation: production builds/check/deploy, web/Functions typechecks, lint, 50 SEO + 58 delivery + 4 campaign + 18 release/config tests, 13 browser checks PASS. Results and rollback: [release](../../reports/viral-dark-20261108/RELEASE.md). Artifact root: `C:/Users/Borinio/.codex/visualizations/2026/11/08/01a1b921-58ac-72f3-af9a-3684d2e788b4/gptbot-viral-dark-20261108`. Next: give dark creative archives and existing canonical URL to the separate Meta chat; observe outcomes. This section supersedes the earlier light design and incomplete delivery status only; prior operational records remain below.

---

# Current handoff — viral campaign landing · 08.11.2026

**DEPLOYED / VERIFIED.** Runtime `3fcdcd127009d67e475931c7f3369bd40f7f5011`, Pages `4e7035a0`; strict public readback **454/454 PASS**, including all 330 HTML URLs and the new campaign assets. Owner authorized creating and publishing `/ru/blog/ii-zahvatit-mir-nachnem-s-zayavok/` and five original creative concepts. This explicit scope supersedes the earlier SEO observation-only next stage for this landing only. Meta campaigns/budgets remain untouched.

Isolated checkout `F:/_moved_from_C/Documents_ChatGPT/Easy Breezy/gptbot-viral-landing-20261108`, branch `codex/viral-landing-20261108`, based on `776511fb` (live ancestor `a52cc9420aafe582485921196af5317208f82878`). Exact one-article custom renderer, existing offline demo and real lead form, five lightweight original illustrations, honest one-channel AI offer from 1,990,000 UZS. No API, database, payment, webhook or chat behavior change.

Validation: web TypeScript, scoped lint, three candidate builds, 64 lead/demo tests, 80 SEO tests, four campaign contracts and ten browser checks PASS. Widths 320/390/1440 have no overflow; axe zero violations. Mocked form errors/ACK/attribution/deduplication verified; no real lead sent. Sitemap 329→330, no removed URLs; 327 old contracts identical, homepage and RU blog listing gain exactly one entry. Ten protected pages pass the reviewed successor baseline.

Deliverables and rollback: [implementation](../../reports/viral-landing-20261108/IMPLEMENTATION.md), [campaign copy](../../reports/viral-landing-20261108/COPY.md). External evidence/assets: `C:/Users/Borinio/.codex/visualizations/2026/11/08/01a1b921-58ac-72f3-af9a-3684d2e788b4/gptbot-viral-landing-20261108`. Ten PNGs plus editable originals, prompts, copy and UTM URLs packaged in two ZIPs. Production build/stamp, guarded check/deploy and exact public readback passed. See [release receipts](../../reports/viral-landing-20261108/RELEASE.md). Next: hand off creatives to the separate Meta session; actual campaign outcomes remain unmeasured.

Previous handoffs and all unrelated operational context are preserved below.

---

# Current handoff — SEO / AI release verified · 08.11.2026

**DEPLOYED / VERIFIED, AWAITING RECRAWL.** Source `a52cc9420aafe582485921196af5317208f82878`, Pages `cf2b3d7c`, verified 2026-11-08T04:46:46Z; artifact SHA256 `b5df41ddbe4ca1778658a59a8315a791ecc8b81ac3996c5e0fc0c48b6d8ef207`. Public readback passed 443/443 (all 329 pages, shared assets, 28 Markdown twins, sitemap/feed/llms surfaces). Main/admin/Studio production builds, web/Functions typechecks, 13-file scoped lint and SEO audit pass. Integrated tests: 165 passed, 2 conditional legacy-offer-baseline skips; product schema 88/88; mobile/no-JS QA 9/9; candidate mocked browser funnel passed. Independent review found no P0/P1/P2. Technical verification does not establish ranking, citation or business improvement.

Source baseline `e6bafc4b32060dcdb6a04c4050589c18715ae221` follows previous verified live `02a3613c7ccb85f8de52a6cbe4d3a22781607375`; Railway documents / TG Sender ancestry retained. The 1,063-file predecessor artifact hash `550f142fa8d94ff678da6f243b50abb12db27a0ff80455a773134146bad1aa9d` was verified. Physical checkout: `F:/_moved_from_C/Documents_ChatGPT/Easy Breezy/gptbot-seo-ai-20261108`. Release used the existing guarded runner with explicit physical `DR_ROOT`. Future rollback: scoped revert after current ancestry review; never overwrite unrelated later releases with an old artifact.

Delivered: shared runtime-derived product facts, truthful trial H1 and below-tool chat blocks, UTC pricing explanation, linked chat/offer/Organization schema, synchronized llms files, homepage/About/author clarity, five commercial-page improvements and Cake City evidence limits. Chat title/description unchanged. The UZ login article's description-only variant is live; its observation window begins after confirmed Google recrawl. No payment, database, webhook, legal-offer or tracking-loader changes.

Facts: three lifetime trial answers; AI package 20,000 UZS / 300 package answers / one **UTC calendar month** from confirmed payment, clamped at UTC month end; up to 50 package-charged answers per account per UTC day (05:00 Tashkent reset), separate from the active-package included free allowance; no auto-renewal. The account displays the expiry date. Studio remains separate (5,900 UZS / 24h / one presentation; 39,900 UZS / month / ten).

External GitHub profile `97849841` and owned catalog `fb513053` published and read back. Glotr/INITE corrections remain unsent drafts: ownership/edit access unverified; browser URL-verification safety stop prevented inspection. R11 has diagnostics but no accepted speed patch or field-CWV improvement. R15 awaits stable data; R18 actual 24-task chat evaluation was not run. R20 outcome evaluation remains pending.

R03 search-answer baseline: 107/108 answers across three runs (one Google upstream failure); citations in 12/72 neutral and 35/35 answered branded prompts. Repeats may be cached; tracker remains disabled. R12 Cloudflare official-IP checks found successful OAI/Perplexity/Googlebot request aggregates, no observed matched 403/429/5xx; this is not indexing/citation proof. Full details: [implementation record](../../reports/seo-ai-roadmap-20261108/IMPLEMENTATION.md), [content/intent record](../../reports/seo-ai-roadmap-20261108/INTENT-AND-CONTENT.md). Evidence root: `C:/Users/Borinio/.codex/visualizations/2026/11/08/01a1b921-58ac-72f3-af9a-3684d2e788b4/gptbot-implementation-20261108`.

This dated section supersedes older SEO candidate statuses only. Other platform handoffs and all prior operational evidence below are preserved.

Discovery completed once at 04:50:07Z: four existing GSC sitemap/feed refreshes returned 204 with matching timestamp readback; IndexNow accepted 18 changed URLs with 200. Guarded release WebSub: three changed feeds accepted 204. Receipts are in [RELEASE.md](../../reports/seo-ai-roadmap-20261108/RELEASE.md); no repeated submissions or indexing claims. `gptbot-google` automation is ACTIVE for this thread, Mondays 12:00 Asia/Karachi (UTC+5) through 2026-12-21T07:00:00Z, read-only. R06, accepted R11 optimization, R15, actual R18 chat evaluation and R20 remain open.

---

# Current handoff — Railway documents · 07.11.2026

DEPLOYED / VERIFIED: source `15f1878b`, Pages `99c5dc7f`, Railway worker `1a92ac43`. Previous SEO release `ee11957d` is preserved in ancestry. The owner explicitly authorized Railway integration and deployment.

Owner: `/admin-tools/documents`; public Studio RU/UZ and embedded chat presentations have explicit cloud PDF export and history. This is structured-text PDF, not automatic customer proposal generation or client delivery. Chat/PPTX/payment behavior remains covered by regression tests.

Private D1 document queue + separate R2 + one Railway replica. Shared worker secret installed only in platform secret stores; account API token is not a runtime dependency. Quotas: 3/user/day and 20/site/day, TTL 24h. No changes to other Railway projects or global spending limit.

Evidence: `reports/railway-documents-20261107/`; runbook `docs/documents/RUNBOOK-RU.md`. 329 URL contracts and 10 protected pages preserved; 414 public comparisons PASS. Real production RU/UZ canary passed on the first attempt; PDF text, glyphs and visuals checked; test rows and artifacts deleted. New UI browser checks and 8 chat locale/viewport scenarios PASS. Costs not yet measured over a billing month.

Current worktree `F:/Claude/gptbot-railway-documents-20261107`. Use the existing deploy_runner with explicit DR_ROOT and current production ancestry; never raw deploy. Runtime commits: 9a74b229 + 15f1878b. Future doc-only evidence commit does not replace the deployed source hash.

Rollback: disable only DOCUMENT_JOBS_ENABLED in both runtime forms via a guarded release; preserve ledger/bucket, unrelated services, SEO, Click/OFD and Telegram webhook. Do not activate the legacy apps/gpt-backend gateway. No GitHub push performed.

---

# Current handoff — SEO release verified · 07.11.2026

## 1. State
DEPLOYED AND VERIFIED: `ee11957d872ea98f683bc23bbf33c715aed59a1b`, Cloudflare preview `9a47d283`. Main content/analytics release `504d3bac` is its ancestor. The following dated record supersedes candidate statuses below. Owner authorized autonomous SEO implementation.

## 2. Delivered
Six content pages corrected, three contextual links added, empty GTM removed, two publisher Organization nodes aligned with current global facts. A follow-up allows the verified regional Metrika HTTPS endpoint in script/connect CSP only.

## 3. Baseline
Source `421ac0df`; original production `3518a5d`. Immutable predecessor dist remains at sibling `gptbot-seo-evidence-20261107/before-dist`. Both releases used the existing guarded deployment runner; no push.

## 4. Architecture
Templates and models reused. No algorithm, payment, DB, webhook or API behavior changes. All shared JS/CSS bytes remain unchanged. No Yandex wildcard, frame or WebSocket expansion.

## 5. SEO protection
All 329 URL/metadata/H1 contracts and ten protected semantic contracts pass. Raw HTML changed through GTM removal; do not call it byte-identical to the original release. Final CSP follow-up changed only `_headers` and release manifest versus the first release.

## 6. Validation
485 targeted tests, 59 overlapping post-build checks, 72 Metrika tests, scoped lint and web/Functions typechecks pass. Full production builds and guards pass. Final public readback: 411/411 exact comparisons. Mobile conversion/copy/no-overflow verified.

## 7. Analytics
Browser first release: one gtag, no GTM, page_view/batched GA HTTP204, zero console errors. Final HTML/assets identical and final live CSP verified. Final PSI best practices100, no regional CSP error. Report receipt/qualified leads/payment reconciliation remains separate.

## 8. Performance
Final mobile PSI runs: 84/77 Performance, TBT650/790ms, LCP1.1/2.7s; accessibility/SEO/best-practices100. Baseline single run74/TBT1610ms. Different Chromium runners and small sample prevent a controlled speedup claim. TBT<300ms is not consistently achieved; field28-day CWV still fails. See completion.json and PSI report URLs.

## 9. Discovery
Four existing Google sitemap/feed submissions accepted204 with matched timestamps; IndexNow eight URLs202 pending validation/indexing. WebSub changed feeds204; final header-only release correctly skipped unchanged feeds. Do not resubmit the same batch automatically. Discovery helper is pinned to the content release504d, intentionally.

## 10. Release and rollback
Current checkout: `F:/_moved_from_C/Documents_ChatGPT/Easy Breezy/gptbot-seo-implementation-20261107`. Set DR_ROOT explicitly; build:production and `F:/Claude/gptbot-tools/deploy_runner.py check|deploy`. Future rollback must use scoped revert after current ancestry check. Never raw deploy.

## 11. Boundaries
Original checkout/untracked research preserved. Visible offers, seller requisites, prices and termsVersion unchanged. No real lead messages, paid subscriptions or fabricated cases. Click remains owner-deferred. npm ci reported three high dependency advisories in unchanged locked dependencies; no force upgrade performed in this SEO release.

## 12. Next
Measure comparable complete windows after recrawl, keep protected snippets stable, reconcile qualified leads/payments and obtain real case evidence before scaling. Remaining CPU includes own runtime, GA4, Meta and Metrika; do not delete functional analytics merely to improve a lab score. No ranking/traffic/revenue multiplier is claimed.

---

# Release update — 07.11.2026

SEO release `504d3bac271a04bc8104dad1e0710fba61ca934d` DEPLOYED AND VERIFIED, preview `8983beaa`. All411public checks match. 485targeted and59overlappingpostbuild checks pass; typechecks/lint/SEOguards pass. Browser proves onegtag andGA204. Google4surfaces204/readback; IndexNow8URLs202 (queued, indexing unconfirmed). Mobile firstPSI89/TBT250 versus74/1610before; field28dayCWVunchanged. Next: exact regionalMetrika `.com` CSP follow-up discovered byPSI; keepallotherprotection unchanged. This update supersedes candidate status below.

---

# Current handoff — SEO implementation · 07.11.2026

## 1. State
Validated candidate on `codex/seo-growth-20261107`. Owner authorized autonomous implementation. Final production build, guarded deploy and live checks are the next operation; no public release claimed yet. Current evidence: `reports/seo-growth-20261107/`.

## 2. Delivered
Remove the empty GTM loader from four template locations; retain direct GA4/Meta/Yandex. Correct six existing content sources, add three useful contextual links, and unify two offer publisher schema nodes with the current global publisher.

## 3. Source baseline
Source `421ac0dfb5f07c6ddf568cb77362f204faac8cc2`; live predecessor `3518a5d57cca33d666e8d8b31340e947b9f5a424`. Immutable predecessor dist at sibling `gptbot-seo-evidence-20261107/before-dist`.

## 4. Architecture
Existing templates and content models reused. No changes to algorithms, payment, webhook, DB, API behavior or shared product UI assets. Direct analytics queue, delays, SPA events and privacy guards retained.

## 5. SEO protection
No title, H1, URL, canonical or hreflang edits. Existing ten-page protection baseline retained. GTM removal changes raw HTML, so do not claim byte-identical protected HTML. Full artifact comparison checks 329 metadata contracts and JS/CSS after Studio builds.

## 6. Verification
485 targeted tests pass, zero skips after build:fast. Independent analytics and content/schema reviews pass. Complete final typechecks, scoped lint, SEO audit/protection/budget checks and full artifact comparison before deploying; retain exact results in the release report.

## 7. Analytics boundary
Before browser trace proves two same-ID gtag library loads, the second initiated by the empty GTM. This is not evidence of duplicate logical events. After release verify one library plus successful GA transport; reporting and payment reconciliation are separate.

## 8. Content and legal boundary
Current alphabet 26 letters plus Sh/Ch/Ng; tutuq separate. Future April 2027 law not applied. Slayd guide distinguishes text reply and presentation mode. No invented case, new quota, pricing or outcome promise. Publisher schema uses existing approved global facts; visible offers and seller requisites remain exact.

## 9. Release command
Set `DR_ROOT=F:/_moved_from_C/Documents_ChatGPT/Easy Breezy/gptbot-seo-implementation-20261107`; run `npm run build:production`, then `python F:/Claude/gptbot-tools/deploy_runner.py check|deploy`. Runner default checkout is stale. Studio dependencies in this worktree are owned, not a shared junction.

## 10. Acceptance and rollback
Require fresh production ancestry, matching deployed commit/manifest, content/schema and browser checks, protected contracts, one GA loader and accepted transport. Rollback only by scoped revert and guarded release after checking current production ancestry.

## 11. Preserved work
Original checkout and its unrelated untracked research are untouched. No destructive Git, push, credential output, real lead submissions or human outreach. Click remains owner-deferred.

## 12. Next
Complete release and truthful live readback; submit changed pages through existing discovery mechanisms. Compare completed search windows after recrawl. Field CWV uses a rolling window; no immediate ranking or traffic multiplier is claimed.

---

# Current handoff — growth pilot · 06.11.2026

## 1. State
DEPLOYED AND VERIFIED on `seo/uz-query-recovery-20261106`: production commit `3518a5d57cca33d666e8d8b31340e947b9f5a424`, preview `d8996a5b`, approximately 10:03 UTC. All 48 live paths and exact manifest pass. This section and STATE `seo_growth_pilot_20261106` supersede the historical status below. Owner approved autonomous implementation of the growth roadmap.

## 2. Delivered
Four tool-first pages, two Studio galleries, three articles with six DOCX/PDF downloads. See `reports/seo-growth-20261106/RELEASE.md` for exact behavior and URLs.

## 3. Source baseline
Source `335727f0`; verified predecessor production `6531d35bf0d401e33587eea2d4c959c3e9793a1f`. Preserve the earlier same-day SEO/chat repair.

## 4. Architecture
Existing converter, chat prefill bridge and PPTX exporter reused. No backend, billing, database, webhook or provider change. Gallery CSS stays inline/scoped to avoid modifying the shared chat CSS graph.

## 5. SEO protection
329 sitemap URLs and all title/H1/description/canonical/hreflang/robots values unchanged; ten protected HTML files byte-identical. Shared chat/Studio assets unchanged. Downloads noindex; HTML indexable.

## 6. Verification
296 integration tests pass; web/Functions/Studio typechecks and scoped lint pass. Mobile converter copy, translator prepare-without-send, sample PPTX download, gallery and article layout checked. Three DOCX opened in Word; two PPTX opened/exported in PowerPoint. Evidence in the release report and `qa/`.

## 7. Analytics boundary
Existing converter event reached GA transport204 without text/PII. GA4 service account reporting is403; report receipt, purchase/order matching and revenue remain unverified. Do not relabel clicks/sample downloads as product results.

## 8. Outstanding roadmap
Native language/teacher review, five-topic live generation acceptance, documented client cases and mature search impact remain separate work. Keep protected snippets stable until a full post-recrawl observation window. Existing seasonal starters were retained.

## 9. Release command
`npm run build:production`, then set `DR_ROOT=F:/Claude/gptbot-snippets-translator-20261024` and use `python F:/Claude/gptbot-tools/deploy_runner.py check|deploy`. The default runner checkout is stale; raw deployment is forbidden.

## 10. Acceptance and rollback
Run `F:/Claude/seo-growth-20261106/implementation/verify-growth-live.py --live --expected-commit <SHA>` after deployment. Compare exact manifest/assets/protected HTML and the fixed Cloudflare transform only. Rollback by targeted revert plus guarded release after checking current ancestry.

## 11. Preserved work
Do not add or erase untracked `docs/seo/research/2026-10-28-new-pages-growth/`. No reset/clean/force-push. Click is explicitly owner-deferred.

## 12. Next
Guarded release, live readback and four Google discovery submissions are complete. Measure the pilot after recrawl; keep protected snippets stable. DOCX browser-save completion remains unverified in IAB although public bytes/native Word pass. No traffic/revenue multiplier is claimed.

---

# Current handoff — SEO and chat reliability repair · 06.11.2026

DEPLOYED and verified on `seo/uz-query-recovery-20261106`: commit `6531d35bf0d401e33587eea2d4c959c3e9793a1f`, deployment `07d8e4e8-b6c2-423b-b3ee-8eb5ecc09d48`, 2026-11-06T07:38:37.735684Z. Eighteen live artifact checks and a fresh-session complete Z.AI SSE response passed. The owner authorized autonomous implementation and deployment necessary to repair SEO and chat availability. Current detailed record: `reports/seo-chat-recovery-20261106/RELEASE.md`; state block `seo_chat_recovery_20261106` supersedes old release-status paragraphs below.

- Z.AI already works in production; direct and complete fresh-session SSE checks passed. The retired NVIDIA OpenRouter fallback has zero endpoints. Remove it from runtime/default/AEO lists; keep Z.AI first and the existing dots/Gemma fallbacks. No paid-chain or budget changes.
- Four Uzbek content sources change. New immutable SEO revision preserves all metadata, URLs, nine other protected HTML pages and all 651 assets. The final production rebuild must pass the reversible generator in CHECK=1 mode against `F:/Claude/seo-audit-20261106/implementation/before-dist`.
- Google accepted all four existing sitemap/feed re-submissions at 07:49:56 UTC (HTTP 204); 6/6 inspected URLs already indexed/self-canonical, but crawls precede release. Readback is pending with no errors. See the release report and Google receipts.
- Click remains blocked by Merchant API -12 before receipt submission. User explicitly deferred Click. No fiscal/checkout/DB/webhook change or repeated receipt submission.
- Build with `npm run build:production`; use `DR_ROOT=F:/Claude/gptbot-snippets-translator-20261024` and the established `F:/Claude/gptbot-tools/deploy_runner.py check|deploy`. Never use the runner's stale default checkout or raw Pages deploy. Verify the deployed runtime config and final SSE response, not upload alone.
- Preserve unrelated untracked `docs/seo/research/2026-10-28-new-pages-growth/`. Do not reset/clean. Older historical entries follow unchanged; their stale 'not deployed' labels do not describe this candidate.

---

# HANDOFF — AI tool pages wave B: English tenses tutor, practice tests pilot, niche ad playbooks · 25.10.2026

## 1. Состояние
DEPLOYED 26.10: R-S1b early (owner order), deployment 5a760212 from 72093788 (reports/rs1b-20261026/RELEASE.md). Next dated: R-S2 16.11, UZ chat + kirish guide ≈25.11, RU chat ≈27.11–02.12, Telegram Ads title after ≈22.11.
DEPLOYED 26.10: TOP-3 steps A/B + studio address Kichik Xalqa Yo‘li 57, deployment 7b6cef54 from 77e54817 (reports/top3-stage1-20261026/RELEASE.md); next dated steps in ROADMAP_TOP3.md §4.
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
