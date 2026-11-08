# SEO and AI search roadmap implementation — 2026-11-08

Status: **deployed_verified_awaiting_recrawl**. The owner authorized autonomous implementation. Source `a52cc9420aafe582485921196af5317208f82878` was deployed through the guarded runner to Pages `cf2b3d7c`, verified at 2026-11-08T04:46:46Z. Exact production readback passed 443/443 comparisons at 04:49:07Z. This establishes the technical release, not Google recrawl, improved rankings, revenue or AI citations. See [RELEASE.md](RELEASE.md) for artifact identity, discovery receipts and remaining work.

Source baseline: `e6bafc4b32060dcdb6a04c4050589c18715ae221`, the documentation successor of verified production `02a3613c7ccb85f8de52a6cbe4d3a22781607375`. Existing Railway documents and TG Sender ancestry is preserved. Physical checkout: `F:/_moved_from_C/Documents_ChatGPT/Easy Breezy/gptbot-seo-ai-20261108`.

Evidence root (`E` below): `C:/Users/Borinio/.codex/visualizations/2026/11/08/01a1b921-58ac-72f3-af9a-3684d2e788b4/gptbot-implementation-20261108`. Original roadmap: sibling `gptbot-unified-roadmap-20261108/ROADMAP.md`. That original plan is not an implementation status report; this record supersedes its initial `planned` labels for the work described here.

## Roadmap status

| Item | Status at this checkpoint | Evidence and remaining condition |
|---|---|---|
| R01 baseline and rollback | Captured | `E/SESSION.md`, immutable `E/before-dist/`, baseline measurement and content contracts. Recheck current production ancestry immediately before release. |
| R02 useful-action measurement | Tested with fixtures; receipt/business reconciliation separate | Browser test covers useful answers, confirmed payment once, successful lead acknowledgement, retries and attribution without real leads/payments/inference. Existing GA4 history is event evidence, not reconciled revenue. `E/performance/MEASUREMENT-FINDINGS.md`. |
| R03 AI answer baseline | Collected with one upstream failure | Three runs: 107/108 answers; Google B4 UZ failed `UPSTREAM_UNAVAILABLE`. Neutral prompts cited GPTBot.uz in 12/72 answers; branded prompts in 35/35 answered. Across 107 answers: 45 brand mentions and 47 answers with a citation. Repeats are not assumed independent because caching is possible. Scheduled tracker confirmed disabled. `E/ai-baseline-final.json`. |
| R04 product source | Deployed and verified | Build-only `scripts/product-facts.ts` uses existing runtime billing/trial/limit/Studio sources. No billing or entitlement change. See exact semantics below. |
| R05 owned profiles | Published and verified | GitHub profile commit `97849841de50c0376ca80a657639b22613fb3d7c`; owned catalog commit `fb51305313a99447b5c53af6db28b136ca830dfb`. File readback matches in `E/external/publication-receipts.json`. Own catalog is not an independent endorsement. Site author links were deployed and read back. |
| R06 Glotr / INITE | Drafts ready; ownership/access unresolved | No correction submitted or message sent. Browser control stopped because it could not verify the current URL; it did not establish account ownership/edit access. Exact card URLs and unsent text: `E/external/EXTERNAL-CORRECTIONS.md`. |
| R07 homepage / About | Deployed and verified | Distinguishes consumer chat, Studio and custom business implementation; existing relevant product links reused. |
| R08 chat / tariffs | Deployed and verified | Honest three-answer H1; factual blocks below the chat tool; exact UTC calendar and package-cap wording in tariffs. Main chat title/description preserved. |
| R09 linked schema | Deployed and verified | Stable `#ai-chat`, publisher `#org`, distinct trial/paid offers, conditional purchase availability and consumer tariff audience; Studio remains a separate application. `E/product-schema-check.json`: 88/88 checks pass; all public page bytes match the documented edge output. |
| R10 AI text formats | Deployed and verified | Managed facts and actual 2026-11-08 editorial date synchronized in llms output; all 28 existing Markdown twins and llms files read back exactly. No unsupported new `/pricing.md` requirement. |
| R11 speed | Diagnostics complete; optimization remains open | Twelve controlled live mobile samples and a hero experiment retained. No source speed patch accepted; hero change rejected for inconclusive benefit and a CLS regression sample. No valid PSI/CrUX score or field-CWV improvement claimed. `E/performance/MEASUREMENT-FINDINGS.md`, `HERO-EXPERIMENT.md`. |
| R12 real crawler access | Verified for observed HTTP aggregates | Official IP ranges match OAI-SearchBot, PerplexityBot and Googlebot groups; all observed matched statuses are 200/301. Free-plan verified-bot field denied, IP matching used instead. No WAF changes. See limits below. |
| R13 intent ownership | Reviewed and preserved | Existing intent manifest and current landing pages retained; no redirects, canonical migration, new landing pages or blanket keyword removal. [Content record](INTENT-AND-CONTENT.md). |
| R14 login snippet experiment | Description-only variant live; recrawl pending | Only the UZ login article's description changed. Its title, H1, body and dates stay unchanged. Start the 2–4-week observation window after confirmed recrawl, not deployment. |
| R15 chat snippet experiment | Deferred for stable data | Neither chat title/description is tested in this release. First establish a stable post-R08 baseline; RU and UZ are not randomized controls. |
| R16 long metadata | Reviewed; no mechanical edit | Length alone is not an error. Actual query-specific snippet truncation remains an observation item. |
| R17 commercial content | Five pages deployed and verified | Scope, operating costs, acceptance evidence, links and estimate method clarified on existing pages. Published price tables preserved; no invented ROI/customer results. |
| R18 proof and evaluation | Methodology clarified; real chat evaluation not run | Cake City case now states comparison requirements and evidence limits. Existing 24-task RU/UZ chat evaluation set preserved; actual model answers/scoring and permitted inputs/costs still needed. This is separate from R03 search-answer collection. |
| R19 release checks | Deployed and verified | Main/admin/Studio builds, web/Functions typechecks, scoped lint and SEO audit pass. 329 URL identities preserved, JSON-LD parses on 329 URLs, 18 declared contract changes reviewed; protected Nov 8 revision added. Integrated tests: 165 passed, 2 conditional legacy-offer-baseline skips; candidate browser funnel passed. Independent review: no P0/P1/P2; local mobile/no-JS QA: 9/9. Production readback: 443/443. |
| R20 outcome measurement | Pending recrawl and sufficient data | Separate RU/UZ chat use/purchases, login queries, qualified service leads and AI citation accuracy. No win/loss, growth or causal conclusion from this release checkpoint. |

## Exact product facts

- Trial: three answers in total, not a daily reset. The trial is distinct from the included free allowance available with an active paid package under the existing offer.
- AI package: 20,000 UZS, 300 charged package answers, no automatic renewal. Checkout availability is determined by the active payment flow; schema does not promise unconditional stock/availability.
- Validity: starts from confirmed payment. The backend adds one **UTC calendar month**, preserving UTC time and clamping to the next UTC month's final date where needed. It is not a fixed 30-day duration. Example: 1 July at 02:00 Tashkent is 30 June UTC; expiry is 31 July at 02:00 Tashkent, not 1 August. The account currently displays the expiry date, not an exact time.
- Daily cap: up to 50 answers **charged to packages** per account across active packages, resets 00:00 UTC / 05:00 Asia/Tashkent. It does not cap all free-plus-paid answers at 50. The existing active-package included free allowance is separate, as described in the offer.
- Studio is separate: 5,900 UZS / 24 hours / one presentation; 39,900 UZS / month / ten presentations. Custom implementation for businesses is a separate service.
- Published legal offer, billing logic, databases, payment providers, webhook behavior and entitlement logic are unchanged. Shared server constants are imported only by build scripts, not by browser code.

## Changed content and generated surfaces

| Group | URLs / scope |
|---|---|
| Product positioning | `/` (RU/UZ homepage rendering), `/ru/o-kompanii/`, `/uz/biz-haqimizda/`; shared Organization description |
| Main chat | `/ru/gpt-chat/`, `/uz/gpt-uzbek-tilida/` — H1 accuracy and below-tool factual blocks; title/description unchanged |
| Chat pricing | `/ru/tarify-ai-chat/`, existing AI-package section `/uz/tariflar/#ai-paket` — UTC/limits clarification and connected schema |
| Author | `/ru/avtor-boris-gerasimov/`, `/uz/muallif-boris-gerasimov/` — visible existing verified GitHub identity and product links |
| Commercial pages | `/ru/ai-bot-dlya-biznesa/`, `/ru/razrabotka-telegram-bota-tashkent/`, `/ru/stoimost-chat-bota/`, `/ru/seo-prodvizhenie-saytov-tashkent/`, `/uz/telegram-bot-biznes-uchun/` |
| Editorial evidence | `/ru/blog/keys-cake-city-platforma-kondirterskoy/` — measurement methodology/limits; no new performance or acceptance claims |
| Snippet experiment | `/uz/blog/chatgptga-qanday-kirish-mumkin/` — description only |
| AI-readable output | `/llms.txt`, `/llms-full.txt`, existing curated Markdown output; shared Organization wording also propagates through prerendered pages |

The complete baseline-versus-artifact contract comparison is `artifact-review.json` in this report folder. Details and experimental interpretation are in [INTENT-AND-CONTENT.md](INTENT-AND-CONTENT.md). Global schema wording can change generated HTML beyond the individually edited content pages; this is not a claim that only the table's URLs have different bytes.

## Crawler evidence and limits

Checked 2026-11-08T04:24:07Z, previous 24 hours. Cloudflare adaptive aggregates matched against official published provider IP ranges: OAI 26 requests (24×200, 2×301), Perplexity 30×200, Googlebot including Image 127×200. No observed matched group had 403, 429 or 5xx. No client IPs or credentials are retained in this report.

The Free plan denied `botDetectionIds`; IP matching was performed in memory using OpenAI SearchBot, PerplexityBot and Googlebot official ranges. Adaptive grouping/sampling means separately grouped query totals need not agree and must not be presented as exact raw-log counts. Out-of-range user-agent matches are unverified, not proof of abuse. These checks establish successful observed provider HTTP requests, not indexing, answer-body correctness, absence of every challenge, or AI citations. Evidence: `E/crawler-log-access/REPORT.md` and `result.json`.

## Validation and release handoff

Completed targeted checks include product facts/UTC boundary/schema, Studio prerender/content/revenue claims, intent/commercial content, home resources and mocked browser funnel behavior. Focused final product/revenue suite: 19/19; Studio/content suites: 58/58; commercial/intent/browser suite: 22/22. These overlap with other runs and are not summed into a unique-test total. Final integrated suite: 165 passed, 2 conditional legacy-offer-baseline skips out of 167; candidate browser funnel passed. An initial predecessor-hash check failed on LF/CRLF representation; the new review normalizes line endings, preserves the older baseline, and SEO-protection retest passed 21/21. Web/Functions typechecks, scoped lint for 13 files, SEO audit and main/admin/Studio production builds pass. Independent review found no P0/P1/P2; local mobile/no-JS QA passed 9/9. Committed release a52cc942 passed guarded deployment and 443/443 exact public comparisons.

The existing guarded deploy runner used explicit physical `DR_ROOT` and the verified production ancestor. Release identity, readback and notification receipts are in [RELEASE.md](RELEASE.md). Google accepted four existing sitemap/feed refreshes with matched timestamp readback; IndexNow accepted exactly 18 changed URLs with HTTP 200; WebSub accepted three changed feeds with HTTP 204. No recrawl/indexing outcome is inferred. Keep release, recrawl, observation and business acceptance separate. A narrowly scoped revert of this release after current ancestry review is the rollback route; do not redeploy an older artifact that would discard unrelated Railway/TG Sender changes.

Read-only follow-up automation `gptbot-google` is ACTIVE for this thread, Mondays at 12:00 Asia/Karachi (UTC+5), through 2026-12-21T07:00:00Z. It observes status/data; it does not authorize further paid runs, external edits or repeated submissions. R14's measured window still begins at confirmed recrawl.

Outstanding: R06 authenticated ownership/access; an accepted R11 performance candidate and field evidence; R14 recrawl/observation; R15 later stable-baseline experiment; R18 actual 24-task chat evaluation; R20 sufficient outcome data. The archived first ChatGPT baseline answer incorrectly described a daily trial reset: it is an observed answer error to monitor, not a new contradiction in the current first-party source.
