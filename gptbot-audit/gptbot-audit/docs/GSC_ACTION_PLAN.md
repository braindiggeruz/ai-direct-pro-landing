# GSC Action Plan — 2026-06-07

> **Audit context**: full GSC + production + indexation audit on 2026-06-07.
> GSC property used: `sc-domain:gptbot.uz` (siteFullUser permission).
> Periods analysed: 7d / 28d / 90d via Search Analytics API.
> URL Inspection API: 15 priority URLs inspected.
> Production crawl: 62 sitemap URLs + headers + HTML.

---

## 1. GSC reality snapshot (90d, raw API data)

| Metric | Value |
|---|---|
| Property | `sc-domain:gptbot.uz` |
| Clicks (90d) | **0** |
| Impressions (90d) | **52** |
| Avg position (90d) | 6.83 |
| Queries with ≥1 impression | **2** (`gptbot`, `ии бот для бизнеса`) |
| Pages with ≥1 impression | 13 |
| Top countries (impressions) | arg, arm, can, ecu, kaz, lva, mda, mex, nld, pse, rou, rus, ukr, usa |
| Uzbekistan (uzb) impressions | **0** ← root issue |
| Device split | 48 desktop / 4 mobile |

**Reality check**: the site is technically indexed (11/15 inspected URLs PASS) but functionally invisible to its target market. The bottleneck is not Google crawling — it is total absence of demand-side discovery in Uzbekistan SERP.

---

## 2. URL Inspection results (15 priority URLs)

| Status | Count | URLs |
|---|---|---|
| Submitted and indexed (PASS) | 11 | homepage, ai-bot-dlya-biznesa, gpt-bot-dlya-biznesa, telegram-bot-dlya-biznesa, chat-bot-dlya-biznesa, instagram-direct-bot, avtomatizatsiya-zayavok, blog/gpt-bot-vs-chat-bot, uz/biznes-uchun-ai-bot, uz/gpt-bot-biznes-uchun, uz/chat-bot-biznes-uchun |
| Discovered, not indexed | 3 | `/ru/ai-menedzher-dlya-instagram/`, `/ru/bot-dlya-obrabotki-zayavok/`, `/uz/telegram-bot-biznes-uchun/` |
| Crawled, not yet indexed | 1 | `/ru/blog/ai-menedzher-dlya-instagram/` |

User canonical == Google selected canonical for all 15. No canonical conflicts.

---

## 3. Indexation blockers found

| Severity | Finding | Action |
|---|---|---|
| HIGH | Cannibalization: `/ru/blog/telegram-bot-dlya-biznesa/` and `/ru/telegram-bot-dlya-biznesa/` share slug + primary keyword; blog ranks pos 2.2 (13 imp), money pos 2.0 (4 imp) | ✅ Differentiated blog H1/title to "разбор возможностей в 2026" |
| HIGH | Cannibalization: `/ru/blog/ai-menedzher-dlya-instagram/` ↔ `/ru/ai-menedzher-dlya-instagram/` (same primaryKeyword) | ✅ Blog H1 changed to "разбор задач SMM"; title shortened 75→52 chars |
| MED | 2 blog descriptions < 110 chars (under-utilized snippet area) | ✅ Extended to 141/152 chars with UZ/Tashkent signals |
| MED | UZ blog desc encoded length > 165 due to `&#39;` entities (decoded ≤ 160, no real truncation in SERP) | INFO — no fix needed; Google decodes entities |
| LOW | 7 UZ money pages descriptions encoded 168-172 chars (decoded ≤ 160) | INFO — false positive, no fix |
| INFO | Homepage hreflang has only `x-default` (deliberate per `index.html` design comment — bilingual splash on single URL) | Left as-is per design |
| INFO | 13 RU blog articles have no UZ counterpart → no `hreflangUz` set | OK per Google docs (no translation = no alternate required) |

---

## 4. Quick wins implemented in this iteration

| File | Change |
|---|---|
| `content/blog/ru/ai-menedzher-dlya-instagram.json` | title 75→52, H1 "разбор задач" → "разбор задач SMM", desc tightened, `dateModified` 2026-06-07 |
| `content/blog/ru/telegram-bot-dlya-biznesa.json` | H1 "в 2026" → "в 2026: разбор возможностей", title differentiated, desc adds "Узбекистан", `dateModified` 2026-06-07 |
| `content/blog/ru/kak-podgotovit-biznes-k-zapusku-gpt-bota.json` | desc 104→141 with Telegram/Instagram + Узбекистан signals |
| `content/blog/uz/toshkentda-biznes-uchun-chat-bot-qaysi-kanal.json` | desc 103→152 with audience/price/integration + RU+UZ signals |
| `content/pages/ru/ai-menedzher-dlya-instagram.json` | `lastReviewedAt` + `updatedAt` bumped to 2026-06-07 |

No slugs changed. No canonicals changed. No redirects added. No pages deleted. No admin/auth touched. No DNS changed. No global wildcard fallback added.

---

## 5. URLs the owner should Request Indexing in GSC (manual, in this order)

1. `https://gptbot.uz/ru/blog/ai-menedzher-dlya-instagram/` — was "Crawled, not yet indexed"; title/H1 now de-cannibalized
2. `https://gptbot.uz/ru/blog/telegram-bot-dlya-biznesa/` — H1 differentiated to stop competing with money page
3. `https://gptbot.uz/ru/ai-menedzher-dlya-instagram/` — was "Discovered, not indexed"; blog freshness signal should boost crawl priority
4. `https://gptbot.uz/ru/bot-dlya-obrabotki-zayavok/` — was "Discovered, not indexed"; has 6 incoming links already
5. `https://gptbot.uz/uz/telegram-bot-biznes-uchun/` — was "Discovered, not indexed"; has 19 incoming links already (issue is content authority, not links)
6. `https://gptbot.uz/ru/blog/kak-podgotovit-biznes-k-zapusku-gpt-bota/` — desc improved
7. `https://gptbot.uz/uz/blog/toshkentda-biznes-uchun-chat-bot-qaysi-kanal/` — desc improved with Tashkent signal

---

## 6. 7-day follow-up plan

| Day | Action |
|---|---|
| Day 1 (today) | Submit 7 URLs above via GSC Request Indexing |
| Day 2-3 | Re-run URL Inspection on the 4 problem URLs; check if `Crawled` → `PASS` |
| Day 4 | Pull GSC Search Analytics 7d delta; check if Uzbekistan appears in `by_country` |
| Day 5 | Pull GSC queries by page for the 2 de-cannibalized blog/money pairs; verify they don't compete for same queries any more |
| Day 7 | Decide whether next iteration needs: (a) stronger UZ-targeted hreflang (`ru-UZ` / `uz-UZ`) [needs approval], (b) LocalBusiness JSON-LD with NAP, (c) backlink campaign from `.uz` domains |

---

## 7. What NOT to do next (guardrails)

- Do **not** create new slugs / change existing slugs.
- Do **not** change canonicals or add 301/302 redirects.
- Do **not** noindex money or blog pages.
- Do **not** add a global `/*` SPA fallback (it would re-create soft 404s).
- Do **not** promise "Top-3 Google" in copy. Site has 0 clicks / 52 impressions over 90 days — top-3 is a goal, not a guarantee.
- Do **not** fabricate case studies, percentages, or client counts. Use "пример сценария" / "namuna" framing only.
- Do **not** touch `/admin-tools/` or `/api/*` SEO/auth behaviour.

---

## 8. Deeper structural items deferred (need separate approval)

| Item | Reason deferred |
|---|---|
| Add `hreflang="ru-UZ"` / `hreflang="uz-UZ"` for stronger Uzbekistan geo-targeting | Not in original safe-quick-wins scope |
| Add LocalBusiness JSON-LD with full NAP (name/address/phone) | Needs phone number to be confirmed by owner |
| Convert listed "money pages" `/ru/chat-bot-tashkent/` and `/ru/telegram-bot-uzbekistan/` from 404 → published pages | Both are referenced in problem statement P2 but do not exist; needs content creation |
| Off-page: backlinks from `.uz` business directories (already documented in `docs/LOCAL_LINKBUILDING_UZBEKISTAN.md`) | Off-page, not technical SEO |
| Mobile-first investigation (48 desktop / 4 mobile impressions in GSC is anomalous for UZ market) | Needs PageSpeed + mobile-usability deeper dive |
