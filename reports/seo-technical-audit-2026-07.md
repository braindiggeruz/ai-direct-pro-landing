# Technical SEO Audit — gptbot.uz — 2026-07

Audited live site on 2026-07-03. 10 representative pages fetched (homepage, 3 service pages, 3 blog posts, about, boss-digital, 1 UZ money page) plus robots.txt, sitemap.xml, llms.txt and all 134 sitemap URLs.

Severity scale: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 OK / minor

## 1.1 Core Web Vitals & Performance

| Check | Result | Severity |
| --- | --- | --- |
| Homepage response time | ~0.30 s TTFB+download (34 KB HTML) | 🟢 |
| HTML size | 18–36 KB per page — fully prerendered static HTML | 🟢 |
| Render-blocking resources | 1 CSS file per page; Google Fonts loaded with `media="print" onload` trick (non-blocking) + `preconnect` | 🟢 |
| Hero image preload | `<link rel="preload" as="image">` with `imagesrcset` + `fetchpriority="high"` on homepage | 🟢 |
| Image width/height | Homepage hero img has dimensions; money/blog pages have no `<img>` at all (text-only) → no CLS risk | 🟢 |
| JS on money/blog pages | React bundle intentionally NOT loaded ("static and fast" comment in HTML) — only deferred GTM/GA | 🟢 |
| GTM/GA loading | Loaded lazily on first interaction or after 4 s — good for FID/INP | 🟢 |
| Code-splitting | Homepage loads one module bundle (`/assets/index-*.js`); admin excluded | 🟢 |
| Cloudflare caching | `cache-control: public, max-age=0, must-revalidate`, `cf-cache-status: DYNAMIC` — HTML is never edge-cached | 🟡 |
| Google Fonts | 2 families / 8 weights requested (Manrope 5 + Unbounded 3). Consider trimming weights or self-hosting | 🟡 |

**Verdict:** performance is NOT what is holding the site back. Prerendering strategy is excellent. Minor wins: edge-cache HTML (`Cache-Control: s-maxage`) and self-host/trim fonts.

## 1.2 Crawlability & Indexation

| Check | Result | Severity |
| --- | --- | --- |
| robots.txt | `Allow: /` + sitemap reference. Note: live robots.txt is minimal (`User-agent: * / Allow: /`) while `public/robots.txt` in repo suggests admin paths should be disallowed via generate-robots script — verify deployed version disallows `/admin-tools/` and `/api/` | 🟡 |
| sitemap.xml | 134 URLs, **all return HTTP 200** (0 broken) | 🟢 |
| Canonical tags | Present and self-referencing on every page checked, incl. blog | 🟢 |
| hreflang | ru/uz/x-default present and cross-linked on pages with counterparts. Blog posts without a UZ twin correctly emit only ru + x-default | 🟢 |
| `/blog/[slug]` without language prefix | **Returns 404, not 301** (`/blog/telegram-bot-dlya-biznesa/` → 404). Any external link / AI citation / user habit hitting the unprefixed URL dead-ends. | 🔴 |
| `/ru/hub/` | Returns 404 while `content/pages/ru/hub.json` exists — verify intended URL or remove | 🟡 |
| Blog pagination | `/ru/blog/` lists all 40 posts on one page (no pagination). Fine at current scale; revisit past ~60 posts | 🟢 |
| 404 page | Proper 404 with `noindex, nofollow` — but it sets `<link rel="canonical" href="https://gptbot.uz/">` on a 404. Remove canonical from 404 (a canonical pointing to home from error pages is a soft-signal conflict) | 🟡 |
| HTML lang | Correct per locale (`ru`/`uz`) | 🟢 |

## 1.3 On-Page SEO Signals (10 pages)

| Page | Title len | Desc len | H1 | OG | Notes |
| --- | --- | --- | --- | --- | --- |
| / | 52 | 133 | 1 | ✅ | OK |
| /ru/telegram-bot-dlya-biznesa/ | 60 | 141 | 1 | ✅ | OK |
| /ru/instagram-direct-bot/ | 55 | 132 | 1 | ✅ | OK |
| /ru/whatsapp-bot-dlya-biznesa/ | 50 | 141 | 1 | ✅ | OK |
| /ru/blog/telegram-bot-dlya-biznesa/ | 52 | 141 | 1 | ✅ | OK |
| /ru/blog/okupaemost-chat-bota-dlya-biznesa/ | 53 | 140 | 1 | ✅ | OK |
| /ru/blog/razrabotka-ai-bota-v-tashkente-cena/ | 50 | 139 | 1 | ✅ | 🔴 **Slug/content mismatch** — see below |
| /ru/o-kompanii/ | 50 | 152 | 1 | ✅ | OK |
| /boss-digital/ | — | — | 1 | ✅ | Lives at `/boss-digital/` (not `/ru/…`), returns 200 |
| /uz/biznes-uchun-ai-bot/ | 49 | ~150 | 1 | ✅ | OK |

- Titles: all 49–60 chars, unique. ✅
- Descriptions: all 130–155 chars, unique. ✅
- Exactly one `<h1>` per page, logical h2/h3 hierarchy. ✅
- Internal linking: every money page has "Also read" article grid + related-pages grid; blog posts link to money pages via `internalLinks`. ✅
- 🔴 **Intent mismatch:** `/ru/blog/razrabotka-ai-bota-v-tashkente-cena/` (slug = "AI bot development price in Tashkent") serves an article titled "Преимущества AI-ботов для e-commerce в Узбекистане". The URL targets one of the highest-commercial-intent queries in the niche but the content answers a different intent — Google will not rank it for either query. Rewrite content to match the price intent (or 301 to the pricing article and publish a real price article).
- 🟡 Same OG image (`/assets/landing/og.jpg`) reused on every page — unique OG images per money page would improve CTR from social/AI surfaces.

## 1.4 Structured Data

- Homepage: `Organization+ProfessionalService`, `WebSite` (+SearchAction), `WebPage`, `Service` — well-formed `@graph` with `@id` cross-references. ✅
- Money pages: + `BreadcrumbList`, `FAQPage`. ✅
- Blog posts: `Article` with `datePublished`, `dateModified`, `author`, `publisher`, plus `FAQPage` and `BreadcrumbList`. ✅
- 🟠 `Organization.contactPoint` has **no `telephone`** and no `email` — only `contactType` + languages. AI assistants and local-pack ranking rely on a complete NAP. Add a phone number (or at least `url: https://t.me/XGame_changerz` contact URL) to `contactPoint`.
- 🟠 `Article.author` is an `Organization` ("GPTBot Team"), not a `Person` — weak E-E-A-T signal (see AI visibility report).
- 🟡 `address` has only `addressLocality`/`addressCountry` — no street address (`streetAddress`), which blocks `LocalBusiness` eligibility in Google Maps/local results.

## 1.5 Mobile & Accessibility

- Viewport meta present (`width=device-width, viewport-fit=cover`). ✅
- Body text ≥ 16 px (`text-base`/`text-lg`). ✅
- Tap targets: CTA buttons `px-8 py-4` — comfortably ≥ 48 px. ✅
- `lang` attribute correct; skip-to-content link present; breadcrumb `aria-label`; trust badges use `aria-label`. ✅
- 🟡 FAQ `<details>`/`<summary>` pattern is accessible by default — good.

## Summary — top technical issues

1. 🔴 `/blog/[slug]` (no language prefix) returns 404 instead of 301 → `/ru/blog/[slug]/`. Add redirect rule in `public/_redirects`: `/blog/* /ru/blog/:splat 301`.
2. 🔴 Slug/content mismatch on `/ru/blog/razrabotka-ai-bota-v-tashkente-cena/` — wasting the site's best commercial-intent URL.
3. 🟠 No `telephone` in Organization schema; no street address → invisible for local intent and weaker NAP for AI answers.
4. 🟡 404 page carries `canonical` to homepage; `/ru/hub/` 404s; HTML not edge-cached; single OG image sitewide.
