# SEO Implementation Log — July 2026

Implements the actionable code/config items from the July 2026 audit set
(`seo-master-plan-2026-07.md`, `seo-technical-audit-2026-07.md`,
`ai-visibility-audit-2026-07.md`, `content-audit-2026-07.md`).

## 1. Redirects — recover /blog/* 404 link equity (CRITICAL)

- `content/seo/redirects.json` — new rule `/blog/* → /ru/blog/:splat 301`
  (source of truth; `generate-robots.ts` emits it into the built `_redirects`).
- `public/_redirects` — same rule added to the static safety net.

Before: `https://gptbot.uz/blog/<slug>` → 404 (link equity from legacy /
external / AI-generated links lost).
After: 301 → `https://gptbot.uz/ru/blog/<slug>` (verified present in
`dist/_redirects` after build).

## 2. Structured data — E-E-A-T + AI extraction (HIGH)

- `scripts/jsonld-helpers.ts`
  - New `buildAuthorPersonLd()` — named-expert `Person` node
    (`@id: #author`, `worksFor: #org`), emitted only when
    `authorName` is configured in `content/global/site.json`.
  - `buildOrganizationLd()` — `contactPoint` now carries `telephone`
    when `phone` is configured (NAP completeness).
  - `buildWebPageLd()` — optional `speakable`
    (`SpeakableSpecification`) support.
- `scripts/prerender.ts` — money/service pages now emit the Person node
  and `speakable: ["h1", ".speakable-intro"]`; the hero subtitle is
  rendered with the `.speakable-intro` class.
- `scripts/prerender-blog.ts` — every Article now has
  `author: { "@id": ".../#author" }` (Person, falls back to
  Organization when no author is configured); Person node added to the
  per-article `@graph`; visible byline shows the named author.
- `scripts/prerender-home.ts` — homepage `@graph` includes the Person node.
- `src/shared/types.ts` — `GlobalSEO.authorName` / `authorUrl` fields.
- `content/global/site.json` — `authorName: "Борис Герасимов"`,
  `authorUrl: https://gptbot.uz/ru/o-kompanii/`.

Before: Article.author was an anonymous Organization; no Person entity,
no speakable hints.
After: all 57 published articles attribute authorship to a named expert
Person cross-linked to the Organization; money pages expose speakable
selectors for voice/AI answer extraction.

## 3. Edge caching — cf-cache-status: DYNAMIC on every page (HIGH)

- `scripts/generate-robots.ts` + `public/_headers` — global
  `Cache-Control: public, max-age=0, s-maxage=3600,
  stale-while-revalidate=86400`. Browsers still revalidate; the
  Cloudflare edge now serves cached HTML. Admin (`no-store`), assets
  (`immutable`) and API overrides below remain untouched.

## 4. 404 hygiene (QUICK WIN)

- `public/404.html` — removed `<link rel="canonical" href="https://gptbot.uz/">`
  (a 404 page must not canonicalize to the homepage).

## 5. llms.txt (AI visibility)

- `public/llms.txt` — added "Key articles (best citation targets)"
  section (7 top RU articles), documented the named author, refreshed
  the last-updated date. Services/contact sections were already present.

## 6. Content quality fixes (content-audit flags)

- Keywords expanded to ≥5 on 12 flagged articles (incl. fixing the
  clinic-scenarios article whose keywords referenced pharmacies).
- CTA block appended to the 15 articles that had none — each points to
  the article's own `targetMoneyPage`
  (`{ "type": "cta", "text": …, "href": <targetMoneyPage> }`, RU/UZ
  localized). No h1/title/body text was changed.

## Verification

- `npm run build` — zero errors; 57 articles prerendered.
- Built output spot-checked: `/blog/*` rule in `dist/_redirects`,
  `Cache-Control` in `dist/_headers`, Person + `author @id` in article
  JSON-LD, `SpeakableSpecification` + `.speakable-intro` on money
  pages, no canonical in `dist/404.html`.
- `npm run lint` — remaining findings are pre-existing on `main`
  (verified via stash run) and outside the touched files.

## Estimated impact

| Category | Impact |
| --- | --- |
| /blog/* 301s | Recovers lost link equity + kills soft-404 crawl waste — expected within 2–4 weeks of recrawl |
| Person/E-E-A-T + speakable | Higher AI-assistant citation probability; Article rich-result eligibility hardened |
| Edge caching | TTFB drop on cache hits → Core Web Vitals (LCP) improvement |
| Keywords/CTA fixes | Stronger internal linking to money pages; better topical signals on 15 orphan-CTA articles |
