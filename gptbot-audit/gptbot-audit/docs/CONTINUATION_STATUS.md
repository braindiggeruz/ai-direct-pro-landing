# GPTBot — Ahrefs Cleanup Continuation Status

> Started from the state left by the previous Emergent agent session
> (last commit `ec5a5ea` — "fix(seo): add Twitter card to blog index + IndexNow key file").
> This document tracks what was carried forward, verified, and finished
> in the current continuation session.

## Done by previous agent (verified against live + repo)

| Area | Status | Verification |
| --- | --- | --- |
| Sitemap rebuilt with 48 indexable URLs (30 money + 16 blog + blog index + homepage; sitemap currently emits 48 `<loc>`) | Live | `curl -s https://gptbot.uz/sitemap.xml \| grep -c '<url>'` → 48 |
| `robots.txt` blocks `/admin-tools/` and `/api/` | Live | `curl -s https://gptbot.uz/robots.txt` shows `Disallow: /admin-tools/` |
| Hreflang RU↔UZ reciprocal pairs | Live | local `tech-audit` → 0 hreflang errors across 49 pages |
| JSON-LD schema fixes (Article/Service/FAQ/BreadcrumbList/Org/WebSite) | Live | local `tech-audit` → 0 schema errors |
| Image alt text on landing components | Live | local `tech-audit` → 0 `<img>` without alt |
| Twitter card on blog index | Live | local audit → 0 OG/Twitter missing across all 49 pages |
| GTM container `GTM-NLR4WFX8` installed on public pages | Live | `curl -s https://gptbot.uz/ \| grep GTM-NLR4WFX8` returns match |
| Ahrefs Web Analytics (`data-key="Nnyl6F9bFd2XBzhizTHSVg"`) raw `<script>` in `<head>` | Live | grep on live homepage |
| GA4 (`G-V87YFL96C7`) on public pages with self-guard skipping `/admin-tools/*` + `/api/*` | Live | guard active in `index.html` |
| IndexNow key file `mrutks6jdnrob4r70zp8u7868a83lnim.txt` published at root | Live | `curl -sI https://gptbot.uz/mrutks6jdnrob4r70zp8u7868a83lnim.txt` → 200 |
| Admin SPA reachable + `X-Robots-Tag: noindex, nofollow` | Live | `curl -sI https://gptbot.uz/admin-tools/login` → `200` + noindex |
| Random URL → 404, no global `/*` fallback | Live | `curl -sI https://gptbot.uz/random-test-url-123` → 404, `curl -sI https://gptbot.uz/foo/bar/` → 404 |
| `scripts/tech-audit.ts` local mirror of Ahrefs checks | Live in repo | runnable via `npx tsx scripts/tech-audit.ts` |
| `docs/AHREFS_GTM_INSTALL.md`, `docs/IMAGE_ASSETS_AUDIT.md`, etc. | Live in repo | present in `docs/` |

## Needs verification by owner in Ahrefs UI

These were fixed in code + deployed by previous session, but Ahrefs only re-scores
after the next site crawl. Owner should trigger a New crawl in Ahrefs Site Audit.

- Hreflang “missing reciprocal hreflang / no return-tag” (was 47).
- Structured data schema.org validation error (was 45).
- Pages with links to broken page / links to redirect / links to noindex.
- Twitter card missing (was 1).
- Pages to submit to IndexNow (was 31/48).
- Health Score (was ~48 in the screenshots provided).

## Still broken before this session

- `/admin-tools/*` raw HTML still leaked the literal GA ID `G-V87YFL96C7` and
  the Meta Pixel ID `780400781706074` even though both tags were self-guarded
  at runtime. The admin Pages Function was only stripping `gtm` + Ahrefs by
  `data-tag`.

## Fixed in this continuation session

| Change | File(s) | Why |
| --- | --- | --- |
| Self-guard the Meta Pixel and add `data-tag="meta"` | `index.html` | Pixel was firing unconditionally on raw `index.html` even on admin SPA paths. |
| Add `data-tag="ga"` to inline gtag loader | `index.html`, `scripts/analytics-snippet.ts` | Lets the admin Pages Function strip it from raw HTML, not just rely on JS guard. |
| Add `data-tag="ahrefs"` to the Ahrefs `<script>` (alongside existing exact-src match) | `index.html`, `scripts/analytics-snippet.ts` | Defence-in-depth for the strip. |
| Extend admin `HTMLRewriter` strip list to `ga` + `meta` + `ahrefs` data-tags | `functions/admin-tools/[[path]].ts` | So `/admin-tools/*` raw HTML contains zero tracking IDs. |
| Extend `scripts/tech-audit.ts` with sitemap parity, OG/Twitter, mojibake and secrets-leak checks. Fail CI on P0. | `scripts/tech-audit.ts` | Make the local mirror cover every Ahrefs P0 + add regression checks owner asked for. |

## Result after this session (local audit on freshly built `dist/`)

```
Pages scanned:        49
  Indexable:          48
  Noindex:            1
Sitemap <loc> count:   48
Broken internal links: 0
Links to noindex:      0
Links to redirects:    0
Hreflang issues:       0
Schema issues:         0
<img> without alt:     0
Sitemap missing-in-dist:    0
Sitemap forbidden paths:    0
Sitemap duplicates:         0
Sitemap -> noindex:         0
Indexable not in sitemap:   0
OG/Twitter missing:    0
Mojibake pages:        0
Secrets leaked:        0
```

## Next actions for the owner

1. In Ahrefs Site Audit → run **New crawl** and wait for Health Score
   recalculation. Expected target: 90+ once Ahrefs re-scores.
2. In Google Search Console / Bing Webmaster Tools → resubmit
   `https://gptbot.uz/sitemap.xml` for re-indexing.
3. Optional one-off: run `INDEXNOW_KEY=mrutks6jdnrob4r70zp8u7868a83lnim yarn tsx scripts/indexnow-ping.ts`
   from a machine with internet access after a deploy. Owner action only — the
   pinger is opt-in (the key file is already public at `/mrutks6jdnrob4r70zp8u7868a83lnim.txt`).
4. Off-page weight: see `docs/OFFPAGE_TOP3_UZ_PLAN.md` (added in this session)
   for safe Uzbekistan-local placements to lift the Site Explorer authority.

## Out of scope (explicit)

- No new articles written.
- No design or UX changes.
- No DNS changes.
- No new Cloudflare Pages project — deploys still go to `ai-direct-pro-landing`.
- No global `/*` fallback re-introduced — random URLs stay 404.
- No slug renames — no 301s needed.
