# pSEO20 production release — 8 November 2026

**DEPLOYED AND VERIFIED.** Runtime commit `e49675252b1c4acdd1770f7b42fc5aa5a0c42630`; Cloudflare Pages deployment `15140984`. Artifact SHA256 `5d6527b9738acb27ca4b5966320d5574fcec43d9004bd3a074db76c02b2f6965`, 1,126 files. Guarded production check and deployment exited 0.

All [twenty URLs](URLS.txt) are live: ten original Uzbek document guides with twenty DOCX/PDF downloads, and ten practice pages with 120 reviewed questions, worked examples, multiplication table and local equation solver.

## Acceptance evidence

- **350/350 HTML pages** match the built release after the existing exact Cloudflare email/beacon transform. All previous 330 URL/title/H1/description/canonical/robots/hreflang contracts remain. The sitemap adds exactly twenty pages, with no removal.
- **506/506 public checks accepted:** 505 exact expected byte comparisons plus one narrowly reviewed unchanged predecessor CSS representation, described below. All twenty downloads match their original files.
- **40/40 live header checks:** twenty HTML pages are indexable and twenty downloadable files have `X-Robots-Tag: noindex`; no redirect or missing file.
- **Eight native resource bindings** match source. Both public runtime configurations match source. All **49 secret-binding names** retain the pre-release fingerprint; values were not printed or changed. No bot webhook, notification routing, database, billing or API source was modified.
- **74/74 browser checks**, **150/150 document checks**, **185 distinct regression checks**, independent editorial review and **1,500/1,500 equation cases** pass. TypeScript, scoped lint, SEO audit, compressed-bundle budget and protected-page gate pass. The final chat bundle is the same `gpt-chat-DfSqotbQ.js` reviewed in browser QA, at 109,968 Brotli bytes.

### Exact CSS cache distinction

The existing immutable `/assets/campaigns/ai-routine/landing-dark.css` is served from CDN with its original LF bytes: SHA256 `c3076b85bbdf43db507e625c2458a9f325f03a03eb56ca891c691420c6c8701a`. Those bytes exactly equal the previous verified artifact and the Git HEAD blob. The fresh Windows checkout copied 893 CRLF sequences into the local artifact, SHA256 `b57152beb7de075997cd1e815fccb0168946bf035a56d02eb1d0a5247a99d8ed`.

Removing only CR from those CRLF sequences proves byte-for-byte identity. The first strict readback therefore recorded 505 exact passes and one difference. A fresh read confirmed the preserved predecessor asset; the verifier accepts only this exact path/hash pair and proves the line-ending conversion. A different path or changed byte is rejected. No stylesheet content was changed, no cache purge was performed, and this is not described as an exact-byte match. The original strict result is preserved in external evidence as `strict-initial-readback.json`.

## Discovery receipts

- Google Search Console accepted `sitemap.xml` and `sitemap-updates.xml` once at **2026-11-08 09:10:42 UTC**. Readback shows both downloaded at **09:10:44 UTC**, `pending=False`, **0 errors**.
- IndexNow accepted exactly **20 verified canonical URLs**, HTTP **200**, at **09:11:09 UTC**.
- The guarded WebSub hook posted only the changed Uzbek RSS and site Atom feed; both received **204**. The unchanged Russian feed was skipped.

Discovery acknowledgements and downloaded sitemaps do not establish page indexing, rankings, AI citations or revenue. Review the new cohort and its parent queries after confirmed recrawl; do not automatically expand it.

## Files and rollback

- [Implementation and test scope](IMPLEMENTATION.md)
- [Selection and demand evidence](CANDIDATES.md)
- [SEO artifact comparison](artifact-review.json)
- [Public readback](live-readback.json)
- [Production bindings](production-bindings.json)
- [Live headers](live-headers.json)
- [Content review](CONTENT_REVIEW.md)
- [Engineering review](ENGINEERING_REVIEW.md)
- [IndexNow receipt](../indexnow-receipts/2026-11-08T09-11-09-642Z_pseo20-20261108.json)
- [WebSub receipt](../websub-receipts/2026-11-08T09-05-13-549Z_a9b348ea.json)

External evidence: `C:/Users/Borinio/.codex/visualizations/2026/11/08/01a1b921-58ac-72f3-af9a-3684d2e788b4/gptbot-pseo20-20261108` (build/type/test logs, final artifact review, screenshots, PDF QA, GSC readback and pre-release bindings).

Rollback: scoped revert of the implementation commit on current ancestry, then a fresh guarded build and public checks. Preserve unrelated later changes and the earlier Wrangler binding-discovery fix. No GitHub push, Meta campaign change, paid research batch or monitoring subscription was made.
