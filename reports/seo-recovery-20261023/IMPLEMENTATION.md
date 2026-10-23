# SEO recovery implementation — 23 October 2026

Status: source and local checks completed; guarded full production build, deployment and live acceptance follow this source commit. Read RELEASE.json and PRODUCTION_READBACK.json for actual deployment state; this sentence is not deployment proof.

## Evidence and prioritisation
Owner authorized implementation, deployment and indexing notifications. Initial checkout 41c61c53287fb1af13248931326aee3372e85344; verified previous production 55957ebde61beece51db71cb117bd6d45a17ffb5, artifact ce3d836a6544740766d776840805997af0bca9e8b3c350a452db76463e21bc00, 1004 files. Initial tracked WIP reports/commercial-seo-20261009/cluster-map.html and historical untracked reports remain untouched and unstaged.

Audit: https://app.openseo.so/p/7534113b-f748-4f98-ac39-9e3782d3d9e7/reports/832da499-6c1f-41f2-8959-8c8ee4d001ca . Evidence gathered before implementation: comparable GSC final windows 24 Sep–7 Oct vs 8–21 Oct, 856→728 clicks (-15%), 87,680→127,231 impressions, CTR .976%→.572%; Uzbekistan 743→604. GA4 organic sessions 966→878 is a different metric. UZ chat 303→186, login article40→10. The Uzbekistan/mobile core download cohort122→127 stayed stable: preserve its search-facing content. Top three pages account for82.1% of clicks. 10/10 inspection URLs indexed with matching canonicals; this is not evidence of a site-wide deindexation. Multiple releases, demand and SERP changes prevent a single-cause attribution. Cross-network channel labels are not proof of advertising or SEO loss.

## Shipped scope
9 existing landing pages and6 existing articles improved; no new competing indexable URLs. Telegram packages and a useful individual estimate example separate one-time work, infrastructure, support and optional integrations. Base one-language offer and explicitly bilingual packages are distinguished. Calculator configuration unchanged. No invented client case, testimonial, market price distribution, savings, ranking or lead guarantee.

Two public RU/UZ TXT briefs include scope, access ownership, budget, acceptance and failure cases. Existing price articles have real scope/acceptance tables, clearly labelled teaching examples and links to service pages and briefs. Two website-price articles now explain our actual published starting offer (2,990,000 sum), not an unsupported market-wide range. Their original URLs, titles, H1s and publication dates remain. Modification dates record genuine content edits.

Consumer recovery: UZ chat explains the independent product and usable prompts; official-login guide prioritizes chatgpt.com and troubleshooting, with independent3-reply lifetime trial clearly identified. Remove unrelated website-sales pitch from login intent. RU language guide stops repeating obsolete daily/hourly trial limits. OpenAI login facts checked against official Help pages; do not replace current published provider facts with old assumptions.

Lead reliability: one semantic payload fingerprint per attempt; unchanged retry reuses its key, changed name/budget/task/calculator estimate gets a new key.18-second deadline includes reading JSON. Uncertain network outcome is disclosed, late success cannot create a conversion, double-submit guarded synchronously. Contact duplicate confirms earlier data only and keeps new fields available. Server's existing atomic durable lead/event/outbox unchanged; local browser tests do not prove real Telegram delivery. No live test leads or client messages sent.

Technical fix: existing Cloudflare email_off wrappers now apply to the download article too. Its authored content, title, H1, description, canonical, robots, hreflang and internal links are identical to the prior protected baseline. Before release the edge inserts3 email-protection links; after release verify zero. Official mechanism: https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/ . This is a real HTML intervention and a confounder for future comparisons, not an isolated CTR experiment.

## Regression protection and validation
217/217 consolidated offline tests,0failed/0skipped, including all published-document integrity, intent/link graph, commercial claims, feeds, lead retries and bundle budget. App and functions TypeScript exit0. Scoped ESLint exit0. Public build/prerender exit0. SEO audit:124landing pages, no critical errors; publication build has170articles. The source audit is distinct from Google rankings. Browser evidence and full build logs accompany release artifacts.

New immutable protected revision records only UZ chat body and login-guide body/internalLinks (removes /uz/sayt-yaratish/). All10 titles/H1/descriptions/canonical/robots/hreflang unchanged;8other contracts unchanged. Old snapshots and comparator unmodified. Current sources independently reviewed by another agent; corrected2support/package FAQ contradictions and4misleading related-link anchors.

## Deployment and discovery
Only existing guarded runner with DR_ROOT=this checkout. Production lineage, artifact stamp, runtime cleanliness, Studio/admin feature gates and exact live manifest verification required. No DB migrations, payment/webhook/secret changes or Git push. Preserve durable WebSub ledger: deploy automatically verifies live feeds and notifies changed hashes once. IndexNow only CHANGED_URLS.json after complete live readback; pending/unknown outcomes never blindly retried. Google Indexing API is not used. Acceptance of any notification is not Google crawl or indexing proof.

## Measurement and remaining work
Priority now: mature qualified leads, not raw visits. After release, compare equal completed final GSC windows by Uzbekistan/device and exact page/query cohorts. Record later releases as confounders. Track form view→attempt→durable acknowledgement→qualified lead separately; do not count contact duplicate as fresh lead. CTR alone can decrease when impressions broaden. No post-release business benefit is proven in this record.

New commercial pages should wait for demand and conversion evidence; existing pages now have clearer service fit and qualification. Native Uzbek human review, genuine approved cases and measured customer outcomes remain valuable follow-up inputs. Existing Click Merchant -12 / unknown fiscal receipt is a separate external blocker; this release neither resubmits receipts nor changes payments. Do not replay previous recrawl monitoring submissions.

## Files
Changed content:
- content/blog/ru/skolko-stoit-sozdat-sayt-tashkent-2026.json
- content/blog/ru/stoimost-telegram-bota-dlya-biznesa-v-uzbekistane.json
- content/blog/ru/tehnicheskoe-zadanie-na-telegram-bota.json
- content/blog/uz/chatgptga-qanday-kirish-mumkin.json
- content/blog/uz/sayt-yaratish-narxi-toshkent-2026.json
- content/blog/uz/telegram-bot-biznes-uchun-narxi-uzbekistonda.json
- content/pages/ru/gpt-na-russkom.json
- content/pages/ru/kalkulyator-stoimosti-telegram-bota.json
- content/pages/ru/razrabotka-telegram-bota-tashkent.json
- content/pages/ru/stoimost-chat-bota.json
- content/pages/ru/telegram-bot-dlya-biznesa.json
- content/pages/uz/arizalarni-qabul-qiluvchi-bot.json
- content/pages/uz/chat-bot-narxi.json
- content/pages/uz/gpt-uzbek-tilida.json
- content/pages/uz/telegram-bot-biznes-uchun.json

Code: scripts/lead-form.ts, scripts/email-off.ts, scripts/seo-protection.ts, src/shared/lead-client.ts, src/gpt-chat/api.ts, src/gpt-chat/components/AiLeadForm.tsx, src/gpt-chat/lead-strings.ts, src/calculator/CalculatorApp.tsx. Evidence: reviewed-protected-pages.json, tests.txt, browser-qa.json, build-production.txt, RELEASE.json, PRODUCTION_READBACK.json, INDEXNOW.json. Refer to STAGED_FILES.json for exact commit scope.

Rollback: targeted revert of this source commit, guarded rebuild/check/deploy. No database migration. Preserve uncommitted user work and prior release lineage; never reset/clean. Do not submit unchanged discovery notifications on rollback without checking durable state.
