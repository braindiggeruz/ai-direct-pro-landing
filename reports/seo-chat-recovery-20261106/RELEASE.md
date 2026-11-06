# SEO intent recovery and chat fallback repair — 2026-11-06

Status: deployed and verified on gptbot.uz. Owner explicitly authorized autonomous SEO repairs and then requested provider availability repair. Click investigation was deferred by the owner on November 6.

## Verified cause and scope

The GSC audit did not show a site-wide collapse: the last complete 28-day window through November 3 had 1,653 clicks versus 1,553. The affected six-query Uzbek cohort fell from 134 to 14 clicks, with a competing official-login article gaining impressions for language-chat intent. The first repair narrows that article to login and directs appropriate use cases to the independent chat. Ranking recovery remains unverified until recrawl and subsequent GSC measurement.

Four content sources changed: the Uzbek login article, student and business articles, and the independent-chat guide. All titles, H1s, descriptions, canonicals, hreflang, URLs, official login instructions, and source citations remain stable. The guide retains its #uzbek fragment and existing navigation bridge; only its substantive editorial update is dated November 6. Trial wording states three total answers, not a daily allowance. Donor dates remain unchanged.

Production provider diagnostics found Z.AI healthy: one direct synthetic response returned HTTP 200 in 2,234 ms, and a fresh site session returned a complete SSE response through zai/glm-5.3-flash in 5,079 ms. Recent recorded turns also confirmed Z.AI responses. Local daily spend guards were not exhausted. The retired nvidia/nemotron-3-super-120b-a12b:free model returned zero OpenRouter endpoints, producing recurring catalogue alerts. The remaining configured OpenRouter models had live endpoints within the existing price caps.

The free fallback chain now uses the existing evaluated dots-studio/dots-3-note-preview:free and google/gemma-4-31b-it:free models. Z.AI stays first in the web chat; the paid chain, budgets, retry caps, and alerts are unchanged. Runtime config copies, defaults, AEO's monitored model list, and the dormant standalone backend default agree. The standalone backend and maintenance cron require no separate deployment for the current live Pages request path. Production configuration had no overriding top-level model keys.

Click remains an external access blocker, not an AI availability failure: three live paid orders fail Merchant API lookup with -12 before any application receipt submission. Only SELECT/GET diagnostics were performed. No credentials, payment grants, receipt IDs, fiscal state, checkout behavior, or webhook changed. Owner chose to handle Click later. The fiscal test's SQL-fence regex now accepts both CRLF and LF; runtime fiscal code is unchanged.

## Static release proof

Predecessor production commit: 720937883d3752a6ed3dcb9bc1f03a2f01f86fb8; deployment 5a760212-11b8-44ad-9a5c-76bfc262a052. Before editing, the complete 1,041-file artifact was copied outside the repository and its manifest matched the live domain.

New immutable revision: docs/seo/evidence/2026-11-06-uz-query-recovery/reviewed-protected-pages.json. Its predecessor is the unchanged 2026-10-26-rs1b revision. The explicit reversible generator proves that 1,029 of 1,040 non-manifest files are byte-identical, all 651 assets remain unchanged, and all nine other protected HTML pages are unchanged, including both chats, homepage, and download guide. Exactly four HTML pages and seven derived files change. Sitemap lastmod changes for the guide and existing aggregate homepage/blog-index dates; homepage HTML does not change. No route additions/removals or redirects.

The generator supports CHECK=1 for the final rebuilt artifact and requires PREDECESSOR_DIST pointing at the verified backup. It checks exact HTML reversals, donor metadata, unchanged file sets/assets, and exact derived changes; the guard is not weakened to accept arbitrary content.

## Validation before release

- build:fast, admin build and Studio build: passed.
- Web and Functions typechecks: passed; final provider edit verification is recorded in the provider task output.
- seo:audit: no critical issues; zero broken internal links or links through redirects.
- Content, discovery, bundle, release, homepage, and fiscal regression batch: 136/136 passed.
- SEO revision and login-focused batch: 24/24 passed.
- Provider/configuration/fallback tests: 174 scoped cases passed across the initial batch and targeted rerun. This includes Z.AI failure followed by dots failure and a successful Gemma response for JSON and SSE, with unchanged budget limits.
- Native browser review was unavailable because Computer Use stopped before it could verify the current Windows URL. HTTP, generated artifact, schema, and streaming API checks are recorded instead; no visual review is claimed.

Production acceptance is recorded below. Ranking recovery still requires subsequent Google recrawl and measurement.

## Follow-up and rollback

Observe the six-query Uzbek cohort separately from generic chatgpt kirish. Start measurement from the actual deployment/recrawl, retain the current chat metadata during this observation, and do not bundle a new title experiment into this repair. The full audit and sanitized operational evidence are in F:/Claude/seo-audit-20261106/.

If a regression appears, revert the reviewed change as a new descendant commit and rebuild through the same guard. Do not deploy an ancestor artifact, rewrite immutable baseline evidence, reset other agents' work, or bypass release lineage. Existing Click receipts must be reconciled read-only before any future fiscal submission.

## Production acceptance

- Production commit: `6531d35bf0d401e33587eea2d4c959c3e9793a1f`.
- Deployment: `07d8e4e8-b6c2-423b-b3ee-8eb5ecc09d48`, created `2026-11-06T07:38:37.735684Z`.
- Published site: https://gptbot.uz/ ; deployment artifact: https://07d8e4e8.ai-direct-pro-landing.pages.dev.
- Final build:production, final immutable CHECK proof and deploy_runner check/deploy all exited 0. Production lineage was verified before upload and the live commit verified afterwards.
- Artifact SHA-256: `c4600d3c0ada509b50d514c7898faa856cb832ae8ee935cab220a6dabd4473b0`; 1,040 non-manifest files.
- At 07:45:39Z, all 18 live checks passed. Four non-HTML resources matched exactly. Fourteen HTML pages matched exactly after only the independently verified Cloudflare edge operations: removing literal email_off comments and inserting one pinned 367-byte Insights script. Raw HTML mismatch is retained in evidence; no broad normalization or hidden content difference was accepted.
- Production deployment config readback confirmed Z.AI first, dots/Gemma free fallbacks and unchanged paid chain/budgets; no top-level overrides.
- Fresh site session after deployment returned HTTP 200, meta/delta/done SSE events and a completed synthetic response from zai/glm-5.3-flash in 8,953 ms. No real payment or customer session was used.
- Read-only follow-up found no active provider cooldown and no newer catalogue alert as of the check; the catalogue lease had not yet advanced, so this is not proof of a completed post-release hourly catalogue cycle. Existing alerts were not deleted/suppressed and broad maintenance was not manually invoked.
- Actual direct OpenRouter fallback completions were not verified: the local diagnostic environment had no OPENROUTER_API_KEY. Endpoint availability, a recent recorded production fallback answer, and mocked error-to-fallback JSON/SSE behavior were verified separately.
- The existing deployment flow notified WebSub of the changed UZ RSS and Atom feeds: HTTP 204 accepted; this does not prove Google Search indexing.
- Four changed canonical/indexable URLs were submitted to IndexNow at 07:46:24Z: HTTP 200 accepted. This applies to participating engines, not Google.

The separate Click Merchant API incident remains unresolved and explicitly deferred. Browser visual review and manual Google Request indexing could not be performed because Computer Use stopped on Windows URL verification. No secret, webhook, fiscal state or payment entitlement was changed by this release.

## Google discovery request completed

At 2026-11-06 07:49:56 UTC, the existing direct Search Console integration successfully re-submitted all four existing surfaces: https://gptbot.uz/sitemap.xml, https://gptbot.uz/sitemap-updates.xml, https://gptbot.uz/uz/blog/feed.xml and https://gptbot.uz/updates/atom.xml. Each returned HTTP 204. Fresh GSC readback confirms the new lastSubmitted timestamps, pending=true and zero errors/warnings. All XML was publicly reachable, canonical, parseable and verified before submission. The main sitemap and Atom include all four changed URLs; no artificial lastmod was introduced.

Google URL Inspection reports all four changed pages and both chat controls indexed, allowed and self-canonical (6/6 PASS). The last crawl times predate this release: login November 5, students and manual November 3, business October 31. These inspections establish existing indexation, not ingestion of today's edits. The next verification is a later lastCrawlTime and then cohort performance; no repeated submissions or unsupported indexing endpoint were used.

Receipts and safe raw responses are retained beside this report. Manual Request indexing remains unperformed because browser automation was stopped; API URL Inspection is not a recrawl request. Google's official process and limits: https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl .
