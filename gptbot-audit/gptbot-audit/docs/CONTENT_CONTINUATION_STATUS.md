# GPTBot — Content Continuation Status

## Context

This document tracks the SEO content continuation work performed on top of
the previous Ahrefs technical cleanup. It is intentionally short and only
covers the delta over the previous agent's commit (`63e6b39`).

## Previous Agent State (verified)

- **Last commit on `main`:** `63e6b39 fix(admin): strip Meta Pixel noscript iframe from admin SPA too`
- **Previous deploy URL:** `https://d8129f4c.ai-direct-pro-landing.pages.dev`
- **Final local tech-audit:** 49 pages scanned, 0 broken links, 0 hreflang
  errors, 0 schema issues, 0 missing alts, 0 sitemap missing-in-dist, 0
  forbidden sitemap paths, 0 duplicates, 0 OG/Twitter missing, 0 mojibake,
  0 secrets leaked.
- **Live smoke (re-verified before this session):**
  - `/` 200, `/sitemap.xml` 200 (48 `<loc>`s), `/robots.txt` 200
  - `/ru/blog/` 200, `/admin-tools/login` 200 + `x-robots-tag: noindex, nofollow`
  - `/random-test-url-123` 404
  - `/uz/blog/` was 404 before this session (UZ blog index did not exist).

## Current Task

Add 10 SEO articles from the research handoff DOCX and wire them through the
existing pipeline:

- 5 RU articles under `/content/blog/ru/`
- 5 UZ (Uzbek Latin) articles under `/content/blog/uz/` (new directory)
- Each article hits a primary money page via `targetMoneyPage` so the existing
  related-articles section on money pages picks them up automatically.
- RU↔UZ hreflang pairs use the existing `hreflangRu` / `hreflangUz` fields on
  `BlogArticle`.
- Article 2 (RU) targets `/ru/bot-dlya-obrabotki-zayavok/` (verified 200 live).
  The handoff DOCX contained a typo (`bot-dla-obrabotki-zayavok`) which was
  corrected against the live URL.
- Article 1 (RU) body had a stray `<bos>` model token which was stripped.
- Article 2 (RU) intro had a stray Finnish word `eivät` which was corrected to
  proper Russian. No other content was added or invented.

## Code Changes

- `scripts/prerender-blog.ts` is now locale-aware:
  - `<html lang>`, `og:locale`, `inLanguage`, breadcrumb labels, FAQ heading
    and "Обновлено / Yangilangan" label all switch on the article's `locale`.
  - Reciprocal `<link rel="alternate" hreflang="ru|uz">` is emitted from the
    article's `hreflangRu` / `hreflangUz` fields (matches the money-page
    convention).
  - Blog index is now generated per-locale: `/dist/ru/blog/index.html` and
    `/dist/uz/blog/index.html` (UZ index is new).
- `scripts/generate-sitemap.ts` emits the UZ blog index alongside the RU one
  and adds reciprocal hreflang on both indexes when both locales have at
  least one published article.

No existing RU article was modified. No URL was changed. No page was deleted.

## Risk Checklist

- [x] Do not overwrite existing slugs — all 10 new slugs verified absent in
      `content/blog/ru/` and `content/blog/uz/`.
- [x] Do not break existing money pages — money page renderer
      (`scripts/prerender.ts`) untouched.
- [x] Do not break admin tracking strip — `functions/admin-tools/[[path]].ts`
      untouched, no analytics added to admin templates.
- [x] Do not regress hreflang on existing RU articles — they still self-emit
      `hreflang="ru"` via the same fallback path.
- [x] Keep `/admin-tools/*`, `/api/*`, draft and random URLs out of sitemap —
      `generate-sitemap.ts` source filter unchanged.
- [x] Random/draft URLs remain 404 + noindex — `public/_routes.json` and
      `public/_redirects` untouched.
