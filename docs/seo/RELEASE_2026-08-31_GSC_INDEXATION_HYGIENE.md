# GPTBot.uz — GSC indexation hygiene release

Date: 2026-08-31  
Base production: `e81f65e6c4757f77ed2991ef12b599d956185e55`  
Scope: historical alternate-canonical, 404 and redirect-source cleanup.

## Evidence

The live crawl of all 260 sitemap URLs found zero non-200 entries, zero sitemap redirects, zero canonical mismatches, zero missing canonicals, zero noindex URLs and zero raw-HTML internal links through redirects. The GSC screenshots are historical (last update 2026-08-21) and contain three actionable legacy content 404s, several intentional private-route 404s, canonical www variants and a literal retired SearchAction query template.

## Changes

- Removed the obsolete WebSite `SearchAction` from the source homepage.
- Added a 301 cleanup for `q` on RU/UZ blog indexes.
- Added permanent redirects for `/ru/telegram-bot-uzbekistan/`, `/gpt-uzbek-tilida/` and `/gpt-chat/`.
- Kept generic private-looking paths such as `/api`, `/oauth`, `/auth` and `/account` as true noindex 404s.
- Removed retired redirect sources from money-page configuration, hreflang configuration, homepage UI links, booster clusters and LLM discovery files.
- Strengthened the existing Telegram commercial owner for the Uzbekistan intent instead of creating a duplicate URL.
- Added permanent regression tests.

## Acceptance

- every sitemap URL returns 200 with a self-canonical;
- no redirect source appears in active config, homepage links or LLM files;
- the three content-like GSC 404s reach a relevant published owner with 301;
- private/probe routes remain 404 + noindex;
- the blog search-template URL reaches the clean blog index with 301;
- no SearchAction/search_term_string survives the production build.

This release improves crawl efficiency and signal consolidation. It does not guarantee a ranking position or a Top-3 result.
