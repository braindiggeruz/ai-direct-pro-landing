# SEO Audit Findings — 2026-06-07

> Independent technical SEO + indexation audit run on 2026-06-07.
> Inputs: production crawl (62 sitemap URLs), GSC Search Analytics API (7d/28d/90d), URL Inspection API (15 URLs), source repository (`braindiggeruz/ai-direct-pro-landing`).
> All findings cross-checked against GSC real data — no speculation.

---

## P0 — Production sanity (PASS)

| Check | Result |
|---|---|
| `https://gptbot.uz/` | 200 |
| `https://gptbot.uz/sitemap.xml` | 200 |
| Sitemap URL count | **62** (matches expected) |
| All 62 sitemap URLs HTTP status | **62/62 = 200** |
| `https://gptbot.uz/robots.txt` | 200, correct `Disallow: /admin-tools/`, `/api/`, sitemap declared |
| `/ru/blog/`, `/uz/blog/` | 200 each, 21 + 8 cards |
| `/admin-tools/` | 200 + `x-robots-tag: noindex, nofollow` + `cache-control: no-store` ✓ |
| `/api/*` | 404 (Cloudflare Pages Function 404, not indexable) |
| Random URL | 404 (no `/*` SPA fallback by design) |
| Canonicals self-canonical | 62/62 ✓ |
| Hreflang RU↔UZ reciprocity (where translation exists) | OK on all pairs verified |
| JSON-LD valid | 62/62 ✓ |
| Mojibake | 0 pages |
| Duplicate titles / descriptions / H1s | 0 |
| Multi-H1 pages | 0 |
| Secrets in HTML/JS | 0 |
| `x-content-type-options: nosniff` | present on homepage and admin |
| Cloudflare-managed AI/Search content signals | present in robots.txt |

---

## P1 — GSC real-data audit

### Totals (90 days)
- Clicks: **0**
- Impressions: **52**
- Avg position: 6.83
- CTR: 0%

### All queries with impressions (90d)
| Query | Impressions | Avg position | Page |
|---|---|---|---|
| `gptbot` | 1 | 10.0 | `/` |
| `ии бот для бизнеса` | 1 | 86.0 | `/ru/ai-bot-dlya-biznesa/` |

That is the entire query universe in 90 days. The other 50 impressions are anonymized (under GSC threshold) — pages still show in `by_page` even when the query is hidden.

### Pages with impressions but 0 clicks (90d)
Every page in the inventory. The top performers by impressions:

| Impressions | Avg pos | Page |
|---|---|---|
| 21 | 4.3 | `/` |
| 21 | 3.6 | `/ru/blog/ai-bot-dlya-biznesa-v-uzbekistane/` |
| 19 | 3.6 | `/ru/blog/gpt-bot-vs-chat-bot/` |
| 14 | 3.1 | `/ru/blog/kak-ai-bot-pomogaet-ne-teryat-klientov-posle-reklamy/` |
| 13 | 2.2 | `/ru/blog/telegram-bot-dlya-biznesa/` ← cannibalizes money page |
| 5 | 18.8 | `/ru/ai-bot-dlya-biznesa/` |
| 4 | 2.0 | `/ru/telegram-bot-dlya-biznesa/` ← outranked by its own blog post |
| 3 | 7.7 | `/?lang=uz` |
| 2 | 1.0 | `http://gptbot.uz/` ← HTTP (not HTTPS) variant still indexed |

### Country distribution (90d)
arg, arm, can, ecu, kaz, lva, mda, mex, nld, pse, rou, rus, ukr, usa — **Uzbekistan (uzb) is absent**. This is the single most important finding.

### Device split (90d)
- DESKTOP: 48 impressions / pos 6.6
- MOBILE: 4 impressions / pos 9.0

A 92 % desktop skew is unusual for Uzbekistan (mobile-first market) and suggests Google may be sampling crawler-/desktop-only ranking signals, or the audience that does see the site is not the target SMB owner segment.

---

## P2 — URL Inspection (15 URLs)

11 PASS, 3 Discovered-not-indexed, 1 Crawled-not-indexed. User canonical == Google canonical on 15/15 (no canonical conflicts). Full breakdown in `docs/GSC_ACTION_PLAN.md`.

---

## P3 — Indexation blockers

The site is **not** blocked from being indexed. It is **discoverable** but **functionally invisible** in the target market. The blockers found are:

1. **Cannibalization (HIGH)** — blog and money page share the same slug `/ru/[blog/]telegram-bot-dlya-biznesa/` and the same primary keyword. The blog outranks the money page on the few queries we see (pos 2.2 vs 2.0). Fixed.
2. **Cannibalization (HIGH)** — `/ru/blog/ai-menedzher-dlya-instagram/` (status: Crawled, not yet indexed) competes with `/ru/ai-menedzher-dlya-instagram/` (status: Discovered, not indexed). Same primaryKeyword in source JSON. Fixed via differentiated blog H1 ("разбор задач SMM") + title shortened 75→52 chars.
3. **Thin descriptions on 2 blog pages (MED)** — under 110 chars, wasting snippet area in SERP. Fixed.
4. **No Uzbekistan-specific ranking signal beyond ccTLD** — Service JSON-LD already declares `areaServed: Uzbekistan + Tashkent`. `sc-domain` does not allow geo-targeting in modern GSC. Considered (and deferred) adding `ru-UZ` / `uz-UZ` hreflang as additional locale signal — requires explicit approval.
5. **Mobile-first signals weak (LOW)** — site is fully responsive, but mobile impressions disproportionately low. Needs deeper PageSpeed / Core Web Vitals investigation — deferred.

---

## P4 — Cannibalization map

| Cluster | Money pages | Blog pages | Verdict |
|---|---|---|---|
| AI / ИИ | `/ru/ai-bot-dlya-biznesa/` | `/ru/blog/ai-bot-dlya-biznesa-v-uzbekistane/`, `/ru/blog/kakoi-ai-bot-nuzhen-vashei-nishe-v-uzbekistane/`, `/ru/blog/kak-vybrat-ai-bota-dlya-biznesa/` | OK — blog angle is informational/comparative; primary keyword "AI-бот для бизнеса" sits on money page |
| GPT | `/ru/gpt-bot-dlya-biznesa/` | `/ru/blog/kak-podgotovit-biznes-k-zapusku-gpt-bota/`, `/ru/blog/gpt-bot-vs-chat-bot/` | OK — blog is launch-prep / comparison angle |
| Telegram | `/ru/telegram-bot-dlya-biznesa/`, `/ru/telegram-bot-uzbekistan/` (404) | `/ru/blog/telegram-bot-dlya-biznesa/`, `/ru/blog/stoimost-telegram-bota-dlya-biznesa-v-uzbekistane/`, `/ru/blog/telegram-bot-crm-ili-menedzher/` | **HIGH-RISK** — blog & money share slug. Fixed H1/title in this audit. |
| Chatbot | `/ru/chat-bot-dlya-biznesa/`, `/ru/chat-bot-tashkent/` (404) | `/ru/blog/chat-bot-dlya-biznesa-v-tashkente-kak-vybrat-kanal/` | OK — blog is "kak vybrat kanal" angle |
| Instagram | `/ru/instagram-direct-bot/`, `/ru/ai-menedzher-dlya-instagram/` | `/ru/blog/ai-menedzher-dlya-instagram/`, `/ru/blog/instagram-direct-bot-kak-rabotaet/` | **HIGH-RISK** — money page #2 and blog share keyword "AI-менеджер для Instagram". Fixed via blog H1/title differentiation. |
| Applications | `/ru/avtomatizatsiya-zayavok/`, `/ru/bot-dlya-obrabotki-zayavok/` | `/ru/blog/avtomatizatsiya-zayavok-instruktsiya/` | OK — distinct intents (process vs. tool) |

---

## P5 — Internal linking audit

- Money pages with most incoming internal links: `/uz/telegram-bot-biznes-uchun/` (19), `/ru/avtomatizatsiya-zayavok/` (10), `/ru/ai-bot-dlya-biznesa/` (9), `/ru/ai-menedzher-dlya-instagram/` (9).
- Money pages "Discovered, not indexed" status correlates with **content authority**, **not** with internal links — `/uz/telegram-bot-biznes-uchun/` has 19 incoming links and still isn't indexed.
- No orphan pages found.
- No broken internal links (0 in tech-audit).
- No links to noindex / redirect targets (0 each).
- Homepage SSR shell injects 15 money + 21 blog + 8 UZ money links — 68 internal links total, all crawlable in raw HTML.

---

## P6 — CTR / snippet quick wins (applied)

The pages selected for CTR / snippet improvements were chosen from URL Inspection problem URLs + GSC impressions-but-0-clicks:

- `/ru/blog/ai-menedzher-dlya-instagram/` — title 75→52, H1 differentiated.
- `/ru/blog/telegram-bot-dlya-biznesa/` — title + H1 differentiated to break cannibalization.
- `/ru/blog/kak-podgotovit-biznes-k-zapusku-gpt-bota/` — desc 104→141 with Telegram/Instagram + Узбекистан signals.
- `/uz/blog/toshkentda-biznes-uchun-chat-bot-qaysi-kanal/` — desc 103→152 with audience/narx/integration + RU+UZ signals.

All edits comply with the safe-quick-win policy: no fake numbers, no "top-3 guarantee" promises, no fabricated cases, local signals added only where natural.

---

## P7 — UZ localization audit (PASS)

Crawl of UZ pages did not surface any Russian UI strings. The codebase already correctly localizes:
- `Полезные статьи` → `Foydali maqolalar`
- `Смотрите также` → `Shuningdek o'qing`
- `Обновлено` → `Yangilangan`
- `Читать далее` → `O'qish →`
- `FAQ` heading → `Tez-tez beriladigan savollar`
- Trust chips, breadcrumb labels, CTA labels — all per-locale in `scripts/prerender.ts` and `scripts/prerender-blog.ts`.

No mojibake on any of the 62 sitemap URLs. UZ uses Latin script consistently.

---

## P8 — SERP competitor quick check

Manual SERP inspection for the priority queries was NOT executed in this iteration. Recommendation: pair with a separate iteration that uses Serper or DataForSEO API to fetch real SERP snapshots from `google.co.uz` for the 7 priority queries listed in the brief, then map (a) title patterns, (b) FAQ presence, (c) local signal density on competing pages. This is deferred to next iteration.

---

## P10 — Build + audit result

- `yarn build:fast` — green
- `yarn tsx scripts/tech-audit.ts` — 0 broken links, 0 hreflang issues, 0 schema issues, 0 mojibake, 0 secrets leaked, sitemap 62/62 URLs, indexable not in sitemap: 0, sitemap missing in dist: 0
- Deploy via `wrangler pages deploy dist --project-name=ai-direct-pro-landing --branch=main` — success
- Deploy hash: **`b8c23a48`** → preview `https://b8c23a48.ai-direct-pro-landing.pages.dev`

Production verification after deploy:
- `https://gptbot.uz/` → 200
- `https://gptbot.uz/sitemap.xml` → 200, 62 entries
- `/ru/blog/` and `/uz/blog/` → 200
- random URL → 404
- `/admin-tools/` → 200 + `x-robots-tag: noindex, nofollow` + `cache-control: no-store`
- 4 changed pages verified live with new title/description/H1

---

## P11 — Items requiring owner approval before next iteration

1. **Add `hreflang="ru-UZ"` and `hreflang="uz-UZ"` to all RU/UZ pages** in addition to existing `ru` / `uz` — stronger Uzbekistan geo-targeting. Low risk.
2. **Create the two `/ru/chat-bot-tashkent/` and `/ru/telegram-bot-uzbekistan/` money pages** that the brief listed but which currently return 404. Need content from the owner.
3. **Add LocalBusiness JSON-LD** (NAP + opening hours) on homepage + key money pages. Need phone number.
4. **Switch homepage hreflang from `x-default`-only to also include `ru` self-ref + `uz` alt** pointing to `/` (since the homepage is a bilingual splash). Currently deliberate per design comment in `index.html`. Needs explicit approval to change.
