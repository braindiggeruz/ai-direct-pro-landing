# GPTBot — Product Requirements Document (Working)

## Original Problem Statement (this session)

Continue from where the previous Emergent agent stopped (Ahrefs technical
cleanup) and ship a production-ready SEO content drop:

- Verify the previous Ahrefs technical cleanup is actually live.
- Add 5 new RU articles + 5 UZ (Uzbek Latin) adaptations from the research
  handoff DOCX.
- Wire them through Blog Admin.
- Configure canonical, hreflang, schema, sitemap.
- Strengthen money pages with internal linking.
- Deploy to the existing Cloudflare Pages project `ai-direct-pro-landing`.
- Do not break admin, sitemap, robots, random 404/noindex.

## Architecture

- React 19 + Vite + Tailwind landing.
- Build pipeline (`yarn build`):
  - `scripts/seo-audit.ts` → critical issue gate
  - `vite build`
  - `scripts/prerender.ts` → money/niche page static HTML
  - `scripts/prerender-blog.ts` → blog article static HTML + per-locale blog index
  - `scripts/prerender-home.ts` → SEO shell into root index.html
  - `scripts/generate-sitemap.ts` → dist/sitemap.xml
  - `scripts/generate-robots.ts` → dist/robots.txt
- Content store: JSON files in `content/{pages,blog}/{ru,uz}/*.json`
  conforming to `src/shared/types.ts` (`Page` and `BlogArticle`).
- Admin SPA at `/admin-tools/*` (Cloudflare Pages Function catch-all in
  `functions/admin-tools/[[path]].ts`) edits the JSON files via the
  GitHub commit API. Tracking is stripped from admin HTML via HTMLRewriter.
- Static assets and Pages Functions deploy through Wrangler to the
  existing Cloudflare Pages project `ai-direct-pro-landing`.

## Tracking

- GTM: GTM-NLR4WFX8 (public pages only)
- GA4: G-V87YFL96C7 (public pages only, gated by path check in
  `scripts/analytics-snippet.ts`)
- Ahrefs Web Analytics: present on public pages, stripped from admin.

## Personas

1. Owner — reviews the admin cockpit, edits content, deploys.
2. SMB owner in Uzbekistan — lands on a money page from search, reads
   either RU or UZ, opens Telegram demo.
3. SEO/AhrefsBot — crawls public pages with valid hreflang, schema and
   sitemap; never reaches admin / API.

## Static Requirements (carry-over, unchanged)

- All public pages: canonical, og/twitter, valid JSON-LD, hreflang
  reciprocity, no mojibake.
- All admin pages: `x-robots-tag: noindex, nofollow` and stripped of GA /
  Meta / GTM / Ahrefs.
- Sitemap: only indexable money + blog pages, never admin/api/draft.
- Robots.txt: blocks `/admin-tools/` and `/api/`, allows everything else
  that is indexable.

## Implemented Timeline

- **2026-01-06 (this session)**
  - Verified the previous agent's commit `63e6b39` is live, sitemap=48,
    all live smoke checks green.
  - Added 5 RU + 5 UZ blog articles (10 JSON files) under `content/blog/`.
  - Locale-aware blog prerender: `<html lang>`, `og:locale`, breadcrumb
    labels, FAQ heading, "Обновлено / Yangilangan" label, reciprocal
    `hreflang` driven from article JSON.
  - New UZ blog index at `/uz/blog/` (RU blog index unchanged path).
  - Sitemap now emits both blog indexes with reciprocal hreflang.
  - Money pages auto-pick up new articles via the existing
    `targetMoneyPage` → related-articles loop in `scripts/prerender.ts`
    (no template change).
  - Local audit: 0 broken links, 0 hreflang errors, 0 schema issues,
    0 mojibake, 0 secrets.
  - Live audit post-deploy: 10/10 new URLs 200, sitemap 48→59, admin
    still noindex, random URLs still 404.
  - IndexNow submitted (all 59 URLs, HTTP 200) using the existing key
    file `public/mrutks6jdnrob4r70zp8u7868a83lnim.txt`.

- **Before this session (previous agent)**
  - Commit `63e6b39` — stripped Meta Pixel noscript iframe from admin SPA.
  - Commit `1a1afd2` — stripped GA/Meta from admin raw HTML, extended
    tech-audit with sitemap parity, OG/Twitter, mojibake, secrets-leak.
  - 30 money/niche pages + 16 RU blog articles + RU blog index live.

## Prioritised Backlog

P1:
- Translate the remaining 16 RU blog articles into UZ.
- Localise the money-page related-articles heading on UZ pages (currently
  shows Russian "Полезные статьи"). The articles themselves switch
  correctly; only the section heading on UZ money pages is RU.

P2:
- Add a sitemap-index (split into per-locale sitemaps when count > 100).
- Add a blog category / cluster landing for `targetMoneyPage` clusters.
- Add author bio pages for E-E-A-T.

## Owner Next Actions

1. Resubmit `https://gptbot.uz/sitemap.xml` in Google Search Console and
   Bing Webmaster Tools.
2. Request indexing in GSC for the 10 new URLs (URL Inspection → Request
   indexing).
3. Re-run the Ahrefs Site Audit on `gptbot.uz` and wait for Health Score
   recalculation.
4. Continue off-page placements per `docs/OFFPAGE_TOP3_UZ_PLAN.md`.
