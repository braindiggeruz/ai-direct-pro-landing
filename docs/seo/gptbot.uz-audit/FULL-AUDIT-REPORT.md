# GPTBot.uz: SEO and revenue audit — 2026-09-06

Owner authorized inspection, implementation and publication. This report separates observed search growth, implemented fixes and remaining business dependencies. Release receipt and post-release checks are recorded separately in this directory.

## Main finding

Google traffic is growing, but most visitors seek free AI help or provider instructions. GSC for August 7–September 3 shows **385 clicks, 31,531 impressions, 1.2% CTR and average position 11.7**, compared with 36 clicks in the preceding 28 days. The six leading URLs account for **316 clicks (82.1%)**. This growth predates this release; it is not evidence of uplift caused by these changes.

The observed service-page clicks are much smaller: SMM 2, website development 1, Uzbek business AI bot 1, SEO service 0. Consumer Plus is not launched. A chat interaction or Telegram click is not a sale. The useful immediate work is to keep existing entry pages accessible, help their visitors reach a relevant working chat, remove misleading commercial claims and measure qualified enquiries separately.

## Coverage and evidence

| Area | Observed evidence |
| --- | --- |
| Sitemap and page availability | 288/288 sitemap URLs returned HTTP 200; 139 sampled linked assets returned 200 |
| Search metadata | Each page has one title, H1, description and canonical; no unintended noindex found in the sitemap set; no duplicate titles or JSON-LD parse errors |
| Rendered content | All 288 pages expose readable headings and text in initial HTML; interactive chat still needs JavaScript and its API |
| Internal links | 12 unpublished target URLs generated 24 broken links across 18 source pages |
| Canonical form | 20 article canonicals were relative but resolved to the correct target; normalized to absolute URLs |
| Protected traffic pages | Original ten-page capture retained; seven contracts unchanged; three narrowly reviewed changes documented in candidate-verification.json |
| Mobile and desktop | Candidate article/chat/pricing flows checked at 375×812 and 1920×1080. Final header changes and production RU/RU/UZ flows subsequently checked in the main CUA session; no horizontal page overflow |
| Search Console | Fresh page data and redirect-validation status checked in authenticated browser; exact evidence in search-console-actions.json |
| GA4 | Earlier same-day authenticated evidence retained in ../evidence/2026-09-06/search-analytics.json; no revenue or session-success rate inferred from event totals |
| Performance / authority | No current field CWV dataset, lab performance score or backlink profile measured. No aggregate SEO score assigned |

Raw crawl evidence is in `technical/`; specialist findings are in `findings/`. Coverage is a bounded audit, not a guarantee that every historical URL, external link or user account has been tested.

## Implemented changes

1. Related article cards now use the actual publication set. Links to drafts disappear until the target is published; published cards retain their order, wording and destinations. No draft was bulk-published and no fictitious case study was created.
2. The two popular Russian comparison/payment articles open the Russian chat with a curated, editable draft and a return-to-article link. Existing seven Uzbek entry flows remain. Links work without article JavaScript. No automatic question submission or forced article redirect; the payment article clearly distinguishes independent GPTBot from official ChatGPT Plus.
3. Empty or whitespace-only streaming completions now enter the existing error path instead of displaying a blank successful answer. Offline tests cover empty, whitespace, chunked text, partial failure, abort and JSON fallback. This does not prove the cause of historical production errors.
4. The consumer pricing page no longer promises activation or an unpublished final Plus price. The Uzbek SEO page no longer says a price list is absent directly above its existing starting prices. Published service prices were not invented or changed.
5. Confirmed provider facts in the Russian comparison article were corrected using current official OpenAI, Anthropic and Google documentation. Unsupported shared-account, universal card acceptance, local-wallet topup, fixed regional price and performance claims were removed. Fifteen relevant sources replace unrelated citations. Full before/after facts and two reviewed H2 corrections are in `findings/commercial.md`.
6. Absolute article canonicals retain their destinations. The protected SEO guard now references an explicitly reviewed candidate while keeping the original production evidence immutable. Titles, H1, descriptions, canonical destinations, hreflang and robots remain unchanged on all ten protected URLs.
7. Article header controls received narrower mobile spacing and a minimum 44px primary button height following visual review. Main chat design from the preceding release remains intact.

## Preservation checks

`verify-candidate.mjs` checked all 288 generated canonical destinations and confirmed all 12 dead draft targets are absent from generated links. It compares candidate protected contracts with the original snapshot and current pre-release production. Seven pages remain identical; the payment article and Uzbek AI-types article retain their original article body. The comparison article has an explicit fact correction, not a claim of byte-identical body preservation.

No URL consolidation, mass redirect, new doorway page, bulk content expansion, paid link, fake review or fabricated case was introduced. Existing noindex/private routes were not opened to search. One inherited hreflang points through a valid consolidation redirect; a correct intent-equivalent replacement has not been established and is deferred.

## Search Console action

Three URLs listed as redirect errors currently resolve in one 308 hop to HTTP 200. On September 6, “Validate fix” was submitted and Google displayed **Started**, not Passed. Validation and indexing remain controlled by Google. Other exclusions include intentional redirects, canonical alternates and private pages; their counts are not treated as defects by themselves.

## Measurement limits and next work

Preserve the current topic ownership and the protected-page comparison before future changes. Use organic service visitors → service/price view → contact action → qualified enquiry → agreed project for service sales. Track article → chat → usable answer separately. Do not sum legacy and current parallel event names or divide event counts to invent a user conversion rate.

The `composer / (not set)` attribution anomaly remains unproven; event parameters were not renamed speculatively. A future account-side cohort/transport investigation should establish its cause. Payment access needs actual merchant credentials and end-to-end payment/entitlement acceptance before Plus can be advertised as available.

Google recommends helpful content and crawlable contextual links; neither a word-count target nor extra schema guarantees ranking. References: [helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [crawlable links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable). Exact provider references are included beside each factual correction in the commercial report and published article.

## Pre-release verification

560/560 full tests pass, application TypeScript and scoped ESLint pass, secret scan clean (2,789 files). Local preview build and candidate checks pass. Full production/admin build and publication remain recorded by the separate deployment receipt.

## Published result

Runtime `dd7c91d9bed33efb1e39792b2ace49d367d282f1` was deployed as `6b57a629-0e47-4b17-addd-729d9a2fa183`. Guarded build contains 914 files; deployment preserved existing bindings and variables. The live manifest matches the built artifact `61e3ebaf9973afe4c727548e9a9986d5916078ae5382598fa94ea3251fc03891`. All 288 live HTML contracts match the reviewed build, all ten protected contracts pass, all 12 dead draft destinations are absent from links, and eight directly referenced CSS/JS asset hashes match. Admin and auth configuration return HTTP 200.

Main CUA verified final mobile RU comparison/payment and UZ download entries, editable drafts and correct return paths. A fresh Russian question asking 2 + 2 returned 4 with minimax/minimax-m3 shown in the published UI. This is one successful canary, not an uptime measurement. Original article intent and existing SEO routes are retained; ranking effects are not yet measurable. Google redirect validation remains Started. Full evidence: deployment.json, live-verification.json and browser-acceptance.json.
