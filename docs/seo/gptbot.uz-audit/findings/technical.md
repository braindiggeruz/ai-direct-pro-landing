# Technical SEO — GPTBot.uz

Captured 2026-09-06, 04:10–04:13 UTC. Read-only audit of live production. Repository inspected: `F:/Claude/gptbot-chat-ui-release-20260905`. No public runtime or content was changed by this audit.

**Technical readiness score: 88/100 (editorial assessment, not a Google metric).** The foundation is healthy. The strongest confirmed defect is links to unpublished articles: 24 link edges across 18 source pages lead to 12 real 404 responses. This is worth fixing before expanding the site. No critical indexation outage was found.

## Scope and method

- Bundled `sitemap_discovery.py` validated all three declared sitemap XML documents. The documented legacy launcher path was absent; the installed latest skill launcher succeeded through Git Bash, with no dependency installation.
- Crawled all 288 unique URLs from the main sitemap and two additive sitemaps, then 158 additional same-origin URLs/resources. Maximum concurrency 5; one-second pause between batches. `robots.txt` restrictions respected; no admin/API crawl.
- Main sitemap: 288 URLs; `sitemap-new.xml`: 5; `sitemap-priority.xml`: 17. Additive entries are subsets of the main set. All three HTTP 200 and valid XML.
- Raw HTML inspected without JavaScript. Bundled `render_page.py --mode never` additionally classified the primary Uzbek chat page as non-SPA and extracted its substantial explanatory text. This does not prove chat hydration or user interactions.
- Evidence: `../technical/pages.json`, `resources.json`, `broken-links.json`, `sitemaps.json`, `sitemap-discovery.json`, `summary.json`, `robots.txt`; reproducible crawler `crawl.mjs`.
- `resources.json` byte counts for binary images are decoded-text lengths, not transfer-size measurements; do not use them to score image performance. HTML/CSS/JS lengths are source lengths, not compressed transfer sizes.

## Category results

| Category | Status | Actual evidence |
| --- | --- | --- |
| Crawlability | PASS with link defect | 288/288 sitemap pages return 200; robots permits them; all three sitemaps validated. 12 linked non-sitemap articles return 404. |
| Indexability | PASS with improvements | All 288 have one title, one H1, description, and canonical; no meta/header noindex. All canonical values resolve to the requested URL. 20 canonical attributes are relative instead of recommended absolute URLs. Actual Google-selected canonical/index status requires GSC, outside this HTTP audit. |
| Security | PASS for SEO baseline | All 288 responses include HSTS, CSP and nosniff; sampled HTTP URL redirects to HTTPS in one hop. No security penetration test was performed. |
| URL structure | PASS with link defect | Clean stable paths; sampled missing trailing slash gives 308 to canonical. Seven linked legacy URLs intentionally redirect in one hop to existing sitemap pages. Random nonexistent path correctly returns 404. |
| Mobile | PASS for source prerequisites | All 288 include viewport and public CSS. All visible content images have width/height; excluded hidden Yandex noscript tracking pixels. Touch targets, visual overflow and focus behavior require browser checks by the main agent. |
| Core Web Vitals | UNMEASURED | No field LCP/INP/CLS or lab run in this audit. CSS is 148,594 uncompressed bytes shared sitewide and browser-cacheable for one year. Largest sampled HTML is 169,068 bytes. These are candidates for measurement, not proof of a failed CWV metric. |
| Structured data | PASS syntax only | No JSON-LD parse errors across 288 pages. Content accuracy, eligibility and rich-result requirements belong to the dedicated schema/content review. |
| JavaScript rendering | Verified in raw HTML | All 288 pages include readable headings and page text without JavaScript. Chat interaction still requires JavaScript and the API. |
| IndexNow | IMPLEMENTED; operation unverified | Existing `functions/lib/indexnow/submit-engine.ts` implements chunking/retry/deduplication and an admin route exists. No submission performed; no claim about current external acceptance or credential health. |

## Prioritized findings

### High — TECH-001: published articles link to draft articles

**Confirmed:** 12 distinct 404 target URLs, each linked from two published pages (24 edges total). All corresponding target JSON files have `status: "draft"`; this is not a temporary HTTP outage. Complete source/target matrix: `../technical/broken-links.json`.

**Cause:** `scripts/prerender-blog.ts:222–231` renders every `a.internalLinks` entry as a related card, while publication selection at line 614 filters articles by publication/indexability. Link targets are not checked against that selection. Thus unavailable editorial drafts leak into published navigation.

Target themes: online-store/payment flow (RU+UZ), logistics (RU+UZ), construction (RU+UZ), creating a bot scenario (RU+UZ), bot income/ROI (RU+UZ), and two RU draft case studies (Haier and DeutschExperte).

**Minimal correction:** remove unavailable related cards, or replace the card's destination **and anchor** with a verified existing article that actually answers the same need. Do not publish an unreviewed draft just to resolve a broken link. Do not redirect all drafts to the homepage. Where no equivalent exists, omit the card until editorial publication. Add a build check that rejects unresolved first-party related links while honoring intentional redirects and non-content routes.

**Protected-page exception:** `/uz/blog/ai-chat-nima-va-qanday-turlari-bor/` is one of the protected ten pages and links to the unpublished scenario guide. Removing its card changes the guarded text/internal-link contract. That exact small change must be reviewed deliberately; the protection baseline must not be bulk recaptured. This audit did not alter it.

**Acceptance:** all remaining generated related-card targets resolve to a published same-language page; no self-links or misleading anchors introduced; full recrawl yields zero linked 404s; ten protected contracts remain unchanged except a separately reviewed, documented exact correction if the owner-authorized implementation chooses it.

### Medium — TECH-002: stale hreflang cluster after intentional consolidation

150 pages have hreflang annotations. One Uzbek article, `/uz/blog/amocrm-bitrix24-telegram-botni-ulash-qadam-ba-qadam/`, advertises Russian and x-default alternate `/ru/blog/kak-podklyuchit-telegram-bot-k-crm/`. That URL returns **301** to `/ru/ai-bot-s-crm-amocrm-bitrix24/`; it was intentionally consolidated by `content/seo/redirects.json:60`. The destination has its own commercial-page translation, so blindly retargeting this article's hreflang to the commercial page would not establish a valid equivalent pair.

**Cause:** stale `hreflangRu` in `content/blog/uz/amocrm-bitrix24-telegram-botni-ulash-qadam-ba-qadam.json:200`, emitted by `scripts/prerender-blog.ts:348` and `scripts/generate-sitemap.ts` without validating alternate publication status.

**Minimal correction:** remove the obsolete article-level RU alternate and emit no paired hreflang for this unpaired Uzbek article, consistently in HTML and sitemap. Preserve its self-canonical and body. Do not undo the existing intentional 301 or invent a translated article. All other observed cross-page HTML alternate references are reciprocal and point to HTTP-200 sitemap pages.

**Acceptance:** every emitted alternate points directly to a canonical HTTP-200 document and returns the equivalent reciprocal set; HTML and sitemap agree. [Google localized-version guidance](https://developers.google.com/search/docs/specialty/international/localized-versions).

### Low — TECH-003: relative canonical attributes on 20 articles

20 commercial-cost/comparison articles use root-relative canonical values. They currently resolve to themselves correctly; **this is not 20 broken canonicals and not a demonstrated indexation failure**. See `summary.json.badPages` (the crawler marks exact-string deviations for review, not actual canonical mismatch).

**Cause:** `scripts/prerender-blog.ts:383` directly emits `a.canonical || fullUrl`; the 20 content entries contain relative `canonical` values.

**Minimal correction:** normalize the emitted canonical with `new URL(a.canonical || a.url, global.siteUrl).href`, preserving any deliberate canonical target. Check same-origin content policy separately rather than silently overriding intended canonicals. No protected page needs a metadata change for this correction.

**Acceptance:** 288 absolute HTTPS self-canonical attributes; no changed title, H1, URL, body or resolved canonical target. [Google recommends absolute canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

### Low — TECH-004: seven internal links still use intentional redirect sources

Seven distinct linked legacy URLs return 301 to already-crawled HTTP-200 commercial pages. These are valid existing consolidations, not broken pages. Updating source links and anchors where editorially equivalent would remove unnecessary hops. Keep all public redirects for old external links. This is lower priority than 404 removal.

## What should stay unchanged

Keep current successful URLs and ten protected page contracts. Preserve main/additive sitemap separation, static explanatory content, existing redirect consolidations, and scoped robots restrictions. Do not hide public editorial pages behind login or replace their raw HTML with an empty chat application shell. [Google JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

Opening additional training crawlers, adding `llms.txt`, or repeated IndexNow submissions is not evidence of better Google rankings or revenue. No indexing/ranking guarantee is made. Any CWV recommendation should be driven by measured field or lab results rather than this source-only inspection.
