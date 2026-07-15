# GPTBot — Agent Continuation Audit (2026-06-07 / Jan-2026 session)

> Continuation of the SEO + Ahrefs technical cleanup that previous Emergent
> agents started on `braindiggeruz/ai-direct-pro-landing`. This document is
> the source-of-truth handoff: what was already in place, what is verified
> live, what still needs owner action, and the exact delta of this session.

## 1. Previous work summary (from git log + docs)

| Phase | Commit(s) | What was delivered |
| --- | --- | --- |
| Phase 0 — admin restore | `dffb2be`, `13bbca4`, `b888310` | `/admin-tools/*` SPA reachable via Pages Function catch-all + full Blog CRUD editor. |
| Phase 1 — sitemap + draft hygiene | `19b2907`, `6e44ddf`, `e004be3`, `010c3c9` | Draft URLs → 404 + noindex; global `/*` wildcard removed; 404.html shipped; SEO shell injected into `<div id="root">`. |
| Phase 2 — content seeding | `707a44c`, `ad3cc07` | First 17 money pages + 10 blog drafts published; first RU evergreen blog article. |
| Phase 3 — SEO infrastructure | `576bb11`, `1af09e7` | 5 UZ money pages, health monitor + freshness layer, GraphQL bulk read for admin (fixes Worker 1101). |
| Phase 4 — analytics rollout | `ecb9b97`, `82f4f53`, `4b39346`, `dfcc74a` | GA4 (`G-V87YFL96C7`) + Telegram CTA tracking + Ahrefs Web Analytics + GTM container `GTM-NLR4WFX8` on public pages only. |
| Phase 5 — Ahrefs P0 cleanup | `d137e98`, `ec5a5ea` | Broken internal links, hreflang reciprocity, schema, alt-text, Twitter card on blog index, IndexNow key file. |
| Phase 6 — admin tracking strip | `1a1afd2`, `63e6b39` | `HTMLRewriter` strips GA / GTM / Meta Pixel / Ahrefs from `/admin-tools/*` raw HTML even when the bundle leaks IDs. |
| Phase 7 — new content (RU+UZ) | `c2c67e5`, `75c6022` | +5 RU blog articles, +5 UZ blog articles, IndexNow submission report. |
| Phase 8 — UZ quick wins | `5a98e1e` | 3 evergreen UZ translations + localised UZ money-page "related articles" heading. |
| Phase 9 — forensic audit | `4baef9b` | Fix phantom hreflang `?lang=ru/?lang=uz` in sitemap homepage entry + expand homepage SSR shell to surface UZ link equity to Googlebot. |
| Phase 10 — GSC data-driven fixes | `f98edd6` | Title/desc rewrites for queries `gptbot`, `ии бот для бизнеса`, `бот для инстаграм директ`; de-cannibalize `/ru/blog/avtomatizatsiya-zayavok-instruktsiya/` from money. |
| Phase 11 — cannibal cleanup + thin desc expansion | `feabd57` | De-cannibalize blog vs money, expand thin descriptions, sync docs. |

## 2. Verified LIVE (Jan-2026 smoke before any code change)

| Check | Result |
| --- | --- |
| `https://gptbot.uz/` | 200 |
| `https://www.gptbot.uz/` | 200 |
| `https://gptbot.uz/sitemap.xml` | 200, **62** `<loc>` entries |
| `https://gptbot.uz/robots.txt` | 200 (Cloudflare Managed AI Bot block layered on top of repo `Allow:/` + `Disallow:/admin-tools/` + `Disallow:/api/`) |
| `https://gptbot.uz/ru/blog/` | 200 |
| `https://gptbot.uz/uz/blog/` | 200 |
| 5 RU money pages | 200 (ai-bot-dlya-biznesa, gpt-bot-dlya-biznesa, telegram-bot-dlya-biznesa, chat-bot-dlya-biznesa, bot-dlya-obrabotki-zayavok) |
| 5 UZ money pages | 200 (biznes-uchun-ai-bot, gpt-bot-biznes-uchun, telegram-bot-biznes-uchun, chat-bot-biznes-uchun, arizalarni-avtomatlashtirish) |
| 5 RU + 5 UZ new articles (under `/ru/blog/` and `/uz/blog/`) | 10/10 → 200 |
| `https://gptbot.uz/admin-tools/login` | 200 + `x-robots-tag: noindex, nofollow` |
| `https://gptbot.uz/admin-tools/`, `/admin-tools/pages`, `/admin-tools/blog` | 200 + noindex on all three |
| `https://gptbot.uz/random-test-url-123` | 404 |
| `https://gptbot.uz/foo/bar/` | 404 |
| `https://gptbot.uz/mrutks6jdnrob4r70zp8u7868a83lnim.txt` (IndexNow key) | 200 |
| No global `/*` wildcard fallback | confirmed via `dist/_redirects` and `public/_redirects` |
| GA4 / GTM / Ahrefs on public, NOT on admin | confirmed via `index.html` self-guards + admin Pages Function `HTMLRewriter` strip |

## 3. Repo audit (Jan-2026 fresh build)

```
yarn install         OK
yarn build           OK  (tsc + vite + 30 money pages + 29 blog articles + sitemap + robots)
yarn seo:audit       OK  (no critical issues)
npx tsx scripts/tech-audit.ts  OK
```

`tech-audit-report.json`:

```
Pages scanned:        63
  Indexable:          62
  Noindex:            1
Sitemap <loc> count:   62
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

Everything Ahrefs labels as P0/P1 is **green at source-of-truth level**.

## 4. URL pattern note — `/ru/blog/<slug>/` vs `/ru/<slug>/`

The continuation brief listed the 10 new article URLs **without** the
`/blog/` segment (e.g. `/ru/stoimost-telegram-bota-dlya-biznesa-v-uzbekistane/`).
This was a typo in the brief — the actual prerender pipeline writes blog
articles into `dist/<locale>/blog/<slug>/index.html`. The live URLs are:

- RU: `https://gptbot.uz/ru/blog/<slug>/`
- UZ: `https://gptbot.uz/uz/blog/<slug>/`

All 10 are 200 + in sitemap + reciprocal hreflang + Article+FAQPage+BreadcrumbList
schema + each carries ≥3 contextual internal links to money pages and ≥2
incoming links (homepage SSR shell + blog index card + sibling articles).

This is the **correct** URL structure — keeping articles under `/blog/`
preserves the blog/money cannibalization gates already implemented in
`scripts/prerender-blog.ts` and `scripts/prerender.ts`. No 301 needed.

## 5. New articles RU+UZ — status

### RU (under `/ru/blog/`):
| URL | 200 | in sitemap | canonical self | hreflang | schema | money links |
| --- | --- | --- | --- | --- | --- | --- |
| `stoimost-telegram-bota-dlya-biznesa-v-uzbekistane/` | ✓ | ✓ | ✓ | ru↔uz | Article+FAQ+Breadcrumb | 5 |
| `chat-bot-dlya-biznesa-v-tashkente-kak-vybrat-kanal/` | ✓ | ✓ | ✓ | ru↔uz | Article+FAQ+Breadcrumb | 5 |
| `instagram-telegram-crm-odna-voronka-zayavok/` | ✓ | ✓ | ✓ | ru↔uz | Article+FAQ+Breadcrumb | 5 |
| `kak-podgotovit-biznes-k-zapusku-gpt-bota/` | ✓ | ✓ | ✓ | ru↔uz | Article+FAQ+Breadcrumb | 5 |
| `kakoi-ai-bot-nuzhen-vashei-nishe-v-uzbekistane/` | ✓ | ✓ | ✓ | ru↔uz | Article+FAQ+Breadcrumb | 5 |

### UZ (under `/uz/blog/`):
| URL | 200 | in sitemap | canonical self | hreflang | schema | money links |
| --- | --- | --- | --- | --- | --- | --- |
| `telegram-bot-biznes-uchun-narxi-uzbekistonda/` | ✓ | ✓ | ✓ | uz↔ru | Article+FAQ+Breadcrumb | 5 |
| `toshkentda-biznes-uchun-chat-bot-qaysi-kanal/` | ✓ | ✓ | ✓ | uz↔ru | Article+FAQ+Breadcrumb | 5 |
| `instagram-telegram-crm-bitta-ariza-voronkasi/` | ✓ | ✓ | ✓ | uz↔ru | Article+FAQ+Breadcrumb | 5 |
| `gpt-botni-ishga-tushirishdan-oldin-biznesni-tayyorlash/` | ✓ | ✓ | ✓ | uz↔ru | Article+FAQ+Breadcrumb | 5 |
| `qaysi-ai-bot-qaysi-nishaga-mos-uzbekistonda/` | ✓ | ✓ | ✓ | uz↔ru | Article+FAQ+Breadcrumb | 5 |

All 10 articles are also listed on the corresponding `/ru/blog/` or
`/uz/blog/` index pages (21 cards RU + 8 cards UZ) and surface in the
admin `/admin-tools/blog` CRUD editor.

## 6. NOT VERIFIED YET (owner action required)

1. **Ahrefs Site Audit re-crawl.** Ahrefs Health Score recomputes only after
   the next site crawl. Owner should trigger **New crawl** in Ahrefs Site Audit;
   target ≥ 90 once the fixes propagate.
2. **GSC sitemap resubmit.** Owner should resubmit
   `https://gptbot.uz/sitemap.xml` in Google Search Console → Sitemaps.
3. **GSC Request indexing** for the priority URLs listed in
   `docs/INDEXING_NEXT_ACTIONS.md`.
4. **Bing Webmaster Tools** — resubmit sitemap.
5. **Google Ads search-terms review** after first ads run; cross-check
   against the negative-keyword list in
   `docs/GOOGLE_ADS_NEGATIVE_KEYWORDS_NOTES.md`.

## 7. Risks

- **Cloudflare Managed Robots blocking AI bots.** Live `robots.txt` carries
  a Cloudflare-managed prelude that `Disallow:`s GPTBot, ClaudeBot, CCBot,
  Google-Extended, Bytespider, etc. This is **intentional** site-level WAF
  policy and is **outside this repo's robots.txt**. Signum AI Checker flags
  it as a negative (AI Readiness 53/100), but Googlebot proper is **NOT**
  blocked — only the AI-training crawlers are. If the owner wants higher
  AI Overviews citation surface (at the cost of allowing AI training), they
  can flip the Cloudflare Bot Management toggle in the dashboard. No code
  change required here.
- **Cloudflare Direct Upload vs GitHub auto-deploy.** Source-of-truth lives
  in GitHub `main`, but Cloudflare Pages may still be on Direct Upload mode.
  This session keeps git → wrangler push as the deploy path. Owner should
  connect GitHub → Pages auto-deploy (Settings → Builds & deployments) to
  eliminate drift.
- **Branded query CTR=0%** (per GSC, 91 impressions over 7d for query
  `gptbot`, 0 clicks). The `GPTBot` brand collides with OpenAI's web crawler
  also named `GPTBot`. This is a strategic/branding concern, not a code
  blocker.

## 8. Next actions (delta of this session)

1. ✓ Verified live + repo + build + tech-audit — all clean.
2. ✓ Created `docs/AGENT_CONTINUATION_AUDIT.md` (this file).
3. ✓ Created `docs/GOOGLE_ADS_NEGATIVE_KEYWORDS_NOTES.md`.
4. ✓ Created `docs/INDEXING_NEXT_ACTIONS.md` (priority list for GSC/Bing/Ahrefs).
5. → Run IndexNow ping for the live sitemap (key file already public).
6. → `git commit` + `git push origin main`.
7. → `wrangler pages deploy dist` to existing project `ai-direct-pro-landing`.
8. → Live smoke after deploy + final report.

## 9. Out of scope (explicit guardrails honored)

- ❌ No DNS changes.
- ❌ No new Cloudflare Pages project created.
- ❌ No global `/*` SPA wildcard fallback re-introduced.
- ❌ No `/admin-tools/*` behaviour changes.
- ❌ Random/draft URLs remain 404 + noindex.
- ❌ No URL/slug renames (so no 301 needed).
- ❌ No tokens printed, committed, or written to `.env` in repo.
- ❌ No Google Ads account changes (docs only, per brief).
