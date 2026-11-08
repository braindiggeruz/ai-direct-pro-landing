# SEO / AI roadmap release — 2026-11-08

**Deployed and verified; search recrawl and measured outcomes remain pending.** The owner authorized autonomous implementation and release. This record supersedes pre-release statuses in the committed planning/checkpoint documents.

| Release identity | Verified value |
|---|---|
| Source commit | `a52cc9420aafe582485921196af5317208f82878` |
| Cloudflare Pages deployment | `cf2b3d7c` — [deployment](https://cf2b3d7c.ai-direct-pro-landing.pages.dev) |
| Guarded release completed / verified | 2026-11-08T04:46:46Z |
| Published artifact SHA256 | `b5df41ddbe4ca1778658a59a8315a791ecc8b81ac3996c5e0fc0c48b6d8ef207` |
| Production manifest | [gptbot-release.json](https://gptbot.uz/gptbot-release.json), exact match to the committed production build |
| Source baseline | `e6bafc4b32060dcdb6a04c4050589c18715ae221` |
| Previous production | `02a3613c7ccb85f8de52a6cbe4d3a22781607375` |
| Previous artifact | `550f142fa8d94ff678da6f243b50abb12db27a0ff80455a773134146bad1aa9d`; immutable 1,063-file baseline hash verified |

The existing guarded runner used explicit physical `DR_ROOT`; no raw deployment bypass was used. Existing Railway document and TG Sender lineage is retained. A later documentation-only commit does not replace the deployed source identity above.

## What is live

Runtime-derived product facts feed visible chat blocks, pricing/schema and AI-readable text. Chat H1 states three trial answers; exact UTC package validity and charged-answer cap are explained. Homepage/About/author content distinguishes consumer chat, Studio and custom business implementation. Five existing commercial pages clarify scope, operating costs and acceptance evidence. The Cake City case clarifies measurement limitations. The UZ login article has one description-only test; both main-chat title/description pairs remain unchanged.

The product facts are unchanged business rules: three lifetime trial answers; 20,000 UZS / 300 package-charged answers / one UTC calendar month from confirmed payment with month-end clamp; up to 50 package-charged answers per account per UTC day, reset 05:00 Tashkent; active-package included free allowance separate; no auto-renewal. Studio remains separate. Payment, DB, legal-offer and webhook logic were not changed. [Full implementation and changed-page list](IMPLEMENTATION.md); [intent/content reasoning](INTENT-AND-CONTENT.md).

## Verification

- Main/admin/Studio production builds, web/Functions typechecks, scoped lint for 13 files and SEO audit passed.
- Integrated suite: 165 passed, 2 conditional legacy-offer-baseline skips out of 167; candidate mocked browser funnel passed. No real lead/payment/inference was needed for that test.
- Product/schema assertions: 88/88. Mobile/no-JS UI scenarios: 9/9. Independent review: no P0/P1/P2.
- All 329 sitemap URL identities preserved; JSON-LD parsed on 329 pages; 18 declared content/metadata contract changes reviewed. Immutable Nov 8 SEO protection revision recorded. Predecessor LF/CRLF representation fixed only in the new comparison; old baseline left unchanged; SEO-protection retest 21/21.
- Production readback at 2026-11-08T04:49:07Z: **443/443** comparisons passed, including all 329 HTML pages, current shared JS/CSS assets, all 28 Markdown twins, sitemap/feed/robots and llms files. The manifest matches exactly. HTML is compared to the exact documented Cloudflare edge transform: literal `email_off` marker removal and one exact known beacon insertion; no broad normalizer hides other changes. Evidence: [live-readback.json](live-readback.json) and [verifier](verify-live.py).

Local evidence root (`E`): `C:/Users/Borinio/.codex/visualizations/2026/11/08/01a1b921-58ac-72f3-af9a-3684d2e788b4/gptbot-implementation-20261108`. Build/typecheck/lint/guard/deploy logs, product assertions and prior artifact are retained there. Public comparison checks confirm served code/content, not receipt in analytics dashboards or reconciled business revenue.

## Discovery receipts

The existing deployment flow sent WebSub once for three changed feeds: RU blog RSS, UZ blog RSS and updates Atom. Each returned HTTP 204. Receipt: `reports/websub-receipts/2026-11-08T04-46-41-381Z_f45bd569.json`; completion 04:46:46Z.

After full production verification, the release-specific discovery wrapper ran `--check-only` successfully, then one authorized `--submit` at 04:50:03Z–04:50:07Z:

| Destination | Exact scope | Receipt |
|---|---|---|
| Google Search Console | Four already-registered and changed surfaces: `/sitemap.xml`, `/sitemap-updates.xml`, `/uz/blog/feed.xml`, `/updates/atom.xml` | 4× HTTP 204; every `lastSubmitted` advanced into the corresponding attempt window; readback reported no sitemap errors |
| IndexNow | Exactly the 18 paths in `artifact-review.json` differences, including changed blog indexes; existing published ownership key reused | HTTP 200, accepted |

Evidence: `E/search-discovery/a52cc9420aaf/public-checks.json`, `submissions.json`, `google-before.json`, `google-after.json`, `google-readback.json`; procedure in `E/SEARCH-DISCOVERY.md`. The exclusive journal blocks repeat submission even after an uncertain attempt; automatic retries are disabled. No all-329 IndexNow batch, new key, new sitemap entry, Indexing API or paid discovery tool was used. Notifications and timestamp readback do **not** prove recrawl, indexing, rank or citation gains.

## Follow-up and remaining work

Automation `gptbot-google` is ACTIVE in thread `01a1b921-58ac-72f3-af9a-3684d2e788b4`: Mondays at 12:00 Asia/Karachi (UTC+5), through 2026-12-21T07:00:00Z. It is read-only; it does not authorize new paid tools, external edits or repeat submissions. The login-description observation window starts after confirmed recrawl and requires 2–4 weeks of comparable query/country/device data. No recrawl date or win/loss is asserted now.

R06 Glotr/INITE corrections are unsent drafts because ownership/edit access remains unverified. R11 diagnostics found substantial third-party transfer weight, but no source speed patch was accepted and no field-CWV improvement is claimed. R15 awaits a stable post-release baseline. R18's actual 24-task RU/UZ chat evaluation was not run; its methodology is prepared. R20 traffic, purchases, qualified leads and AI citation outcomes require sufficient later observations.

External owned GitHub profile `97849841` and catalog `fb513053` were published and verified. R03 collected 107/108 search answers, with citations in 12/72 neutral and 35/35 answered branded prompts; repeats may be cached and the scheduled AI tracker remains disabled. This baseline is separate from the unrun R18 product evaluation and does not measure release uplift. Provider-IP crawler checks confirmed successful observed HTTP aggregates; they do not prove indexing/citations.

Rollback: inspect current production ancestry, then revert this release's scoped changes through the existing guarded build/deploy flow. Preserve unrelated later work, Railway documents, TG Sender, billing and stored data. Do not deploy the older baseline artifact over newer platform releases.
