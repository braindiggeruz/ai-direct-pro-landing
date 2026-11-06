# SEO intent recovery and chat fallback repair — 2026-11-06

Status: candidate validated; guarded production release pending. Owner explicitly authorized autonomous SEO repairs and then requested provider availability repair. Click investigation was deferred by the owner on November 6.

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

No production completion or ranking improvement is claimed by this candidate record. Production commit, deployment, live readback and final artifact proof will be appended after the guarded release succeeds.

## Follow-up and rollback

Observe the six-query Uzbek cohort separately from generic chatgpt kirish. Start measurement from the actual deployment/recrawl, retain the current chat metadata during this observation, and do not bundle a new title experiment into this repair. The full audit and sanitized operational evidence are in F:/Claude/seo-audit-20261106/.

If a regression appears, revert the reviewed change as a new descendant commit and rebuild through the same guard. Do not deploy an ancestor artifact, rewrite immutable baseline evidence, reset other agents' work, or bypass release lineage. Existing Click receipts must be reconciled read-only before any future fiscal submission.
