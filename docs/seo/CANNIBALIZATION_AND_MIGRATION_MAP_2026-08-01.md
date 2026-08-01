# Cannibalization and Migration Map — 2026-08-01

**Evidence source:** Google Search Console, `sc-domain:gptbot.uz`, dimensions `query` + `page`.
**Windows analysed:** last 28 days, last 3 months, last 6 months (GSC data begins 2026-05-21; the 6-month window returns the same 151 query→page rows).
**Baseline:** 25 clicks / ~1,400 impressions / avg position ~30 over 70 days. >150 URLs receive impressions.
**Rule applied:** a URL is only proposed for merge/redirect when a *different* URL competes for the *same query in the same language with the same intent*, and the losing URL has zero clicks.

Nothing in this document has been executed. Redirects and sitemap changes are staged separately.

---

## 1. Confirmed cannibalization

### C1 — Russian web development: "под ключ" overlap

| URL | Query | Impr | Position | Clicks |
| --- | ----- | ---: | -------: | -----: |
| `/ru/razrabotka-saytov-tashkent/` | разработка сайта под ключ | 8 | 96.25 | 0 |
| `/ru/razrabotka-sayta-pod-klyuch/` | разработка сайта под ключ | 6 | 87.50 | 0 |
| `/ru/razrabotka-sayta-pod-klyuch/` | создание сайта под ключ | 8 | 95.63 | 0 |
| `/ru/razrabotka-sayta-pod-klyuch/` | создать сайт под ключ | 1 | 33.00 | 0 |

`/ru/razrabotka-saytov-tashkent/` additionally owns every geo query in the cluster, alone:

| Query | Impr | Position |
| ----- | ---: | -------: |
| разработка сайтов | 14 | 90.07 |
| разработка сайтов ташкент | 12 | 81.25 |
| разработка сайтов в ташкенте | 7 | 82.29 |
| создание сайтов ташкент | 2 | 79.50 |
| создание сайтов в ташкенте | 2 | 77.50 |
| разработка сайтов узбекистан | 2 | 72.00 |
| разработка сайта узбекистан | 2 | 76.00 |

**Verdict:** TRUE cannibalization on "разработка сайта под ключ".
**Primary:** `/ru/razrabotka-saytov-tashkent/` — holds the whole geo cluster, 118 body blocks, 20 FAQ.
**Disposition of `/ru/razrabotka-sayta-pod-klyuch/`:** MERGE → 301. Total 15 impressions, 0 clicks, positions 33–96 across 6 months. Unique "под ключ" phrasing to be absorbed into the primary's H2/FAQ before redirecting.

### C2 — `/ru/sozdanie-sayta-dlya-biznesa/` is NOT cannibalizing

| Query | Impr | Position |
| ----- | ---: | -------: |
| сайт для бизнеса | 9 | 26.00 |
| сайт для компании | 1 | 27.00 |

Zero overlap with the geo cluster and with "под ключ". Distinct intent (generic business site, no city modifier) and the best positions of the three RU web-dev pages.

**Verdict:** NOT cannibalization. **Disposition:** KEEP + differentiate. Must not be merged.

### C3 — Instagram Direct: blog outranks its own money page

| URL | Query | Impr | Position |
| --- | ----- | ---: | -------: |
| `/ru/blog/instagram-direct-bot-kak-rabotaet/` | бот для инстаграм директ | 16 | 20.50 |
| `/ru/instagram-direct-bot/` | бот для инстаграм директ | 11 | 46.64 |
| `/ru/blog/instagram-direct-bot-kak-rabotaet/` | директ бот | 5 | 52.60 |
| `/ru/instagram-direct-bot/` | директ бот | 6 | 80.33 |

**Verdict:** TRUE cannibalization — the informational article beats the commercial page on the commercial page's own keyword.
**Disposition:** NO redirect. The blog holds the better position and real impressions. Differentiate: blog stays informational ("как работает"), money page is retargeted to commercial intent, blog gains a contextual link to the money page.

### C4 — Заявки cluster, three-way

| URL | Query | Impr | Position |
| --- | ----- | ---: | -------: |
| `/ru/avtomatizatsiya-zayavok/` | автоматизация заявок | 1 | 72.00 |
| `/ru/blog/avtomatizatsiya-zayavok-instruktsiya/` | автоматизация заявок | 5 | 93.40 |
| `/ru/avtomatizatsiya-zayavok/` | автоматизация приема заявок | 2 | 69.00 |
| `/ru/blog/avtomatizatsiya-zayavok-instruktsiya/` | автоматизация приема заявок | 1 | 80.00 |
| `/ru/bot-dlya-obrabotki-zayavok/` | автоматизация приема заявок | 1 | 90.00 |
| `/ru/avtomatizatsiya-zayavok/` | ai обработка заявок | 1 | 81.00 |
| `/ru/bot-dlya-obrabotki-zayavok/` | ai обработка заявок | 1 | 54.00 |
| `/ru/avtomatizatsiya-zayavok/` | обработка заявок нейросеть автоматизация | 2 | 59.00 |
| `/ru/bot-dlya-obrabotki-zayavok/` | обработка заявок нейросеть автоматизация | 1 | 71.00 |

`/ru/bot-dlya-obrabotki-zayavok/` alone on: "прием и обработка заявок" (10 impr, pos 82.8), "обработка заявки" (7 impr, pos 82.4).

**Verdict:** TRUE cannibalization, three URLs.
**Primary:** `/ru/avtomatizatsiya-zayavok/` (44 page-level impressions, pos 22.9 — best of the three).
**Disposition:** `/ru/bot-dlya-obrabotki-zayavok/` → MERGE (33 impr, 0 clicks, positions 54–90). Blog article retargeted to instructional intent and linked to the primary.
**Demand note:** "автоматизация заявок" measures 0/mo. Consolidation here is bloat reduction, not a traffic play.

### C5 — "AI bot for business", five-way — worst case on the site

| URL | Query | Impr | Position |
| --- | ----- | ---: | -------: |
| `/ru/ai-bot-dlya-biznesa/` | ии бот для бизнеса | 1 | 86.00 |
| `/ru/blog/chto-takoe-ai-bot-dlya-biznesa/` | ии бот для бизнеса | 1 | 31.00 |
| `/ru/gpt-bot-dlya-biznesa/` | ии бот для бизнеса | 1 | 63.00 |
| `/ru/blog/chto-takoe-ai-bot-dlya-biznesa/` | ии боты для бизнеса | 1 | 88.00 |
| `/ru/blog/kak-vybrat-ai-bota-dlya-biznesa/` | ии боты для бизнеса | 1 | 84.00 |
| `/ru/gpt-bot-dlya-biznesa/` | ии боты для бизнеса | 1 | 88.00 |
| `/ru/blog/chto-takoe-ai-bot-dlya-biznesa/` | ии чат бот для бизнеса | 1 | 88.00 |
| `/ru/chat-bot-dlya-biznesa/` | ии чат бот для бизнеса | 1 | 51.00 |
| `/ru/gpt-bot-dlya-biznesa/` | ии чат бот для бизнеса | 2 | 90.00 |
| `/ru/gpt-bot-dlya-biznesa/` | ai боты для бизнеса | 7 | 90.29 |

Page-level totals: `/ru/ai-bot-dlya-biznesa/` 50 impr @ 7.62 · `/ru/chat-bot-dlya-biznesa/` 44 impr @ 41.27 · `/ru/gpt-bot-dlya-biznesa/` 37 impr @ 34.59.

**Verdict:** TRUE cannibalization across five URLs.
**Primary:** `/ru/ai-bot-dlya-biznesa/` — by far the strongest page-level position (7.62).
**Disposition:** requires per-URL intent review in Slice 5 before any redirect. `/ru/gpt-bot-dlya-biznesa/` is the clearest merge candidate (loses on every shared query). The two blog articles are retargeted, not redirected.

### C6 — UZ flagship product page has a near-duplicate slug

| URL | Query | Impr | Position |
| --- | ----- | ---: | -------: |
| `/uz/gpt-uzbek-tilida/` | chatgpt yuklab olish uzbek tilida | 1 | 35.00 |
| `/uz/gpt-uzbek-tilida-ai-chat/` | chatgpt yuklab olish uzbek tilida | 1 | 42.00 |

`/uz/gpt-uzbek-tilida/` page-level: 31 impressions, 1 click, position 7.84. It is the site's best-positioned Uzbek product asset against `chatgpt uzbek tilida` (2,900/mo, LOW competition).

**Verdict:** TRUE cannibalization, and it threatens the highest-value UZ asset.
**Disposition:** `/uz/gpt-uzbek-tilida-ai-chat/` → MERGE → 301 to `/uz/gpt-uzbek-tilida/`. **Highest-priority consolidation on the site.**

### C7 — Beauty salon: blog outranks money page

| URL | Query | Impr | Position |
| --- | ----- | ---: | -------: |
| `/ru/blog/ai-bot-dlya-salona-krasoty-zadachi/` | ии для салона красоты | 4 | 50.25 |
| `/ru/ai-bot-dlya-salona-krasoty/` | ии для салона красоты | 6 | 72.67 |

**Verdict:** TRUE cannibalization. **Disposition:** differentiate, no redirect. Same pattern as C3.

### C8 — Identical slug, page vs blog

- `/ru/telegram-bot-dlya-biznesa/` — 26 impr, position 5.62
- `/ru/blog/telegram-bot-dlya-biznesa/` — 25 impr, position 5.76

Queries are anonymised by GSC at this volume, so no query-level proof exists. The slug collision plus near-identical impressions and positions is structural evidence.

**Verdict:** TRUE cannibalization (structural). **Disposition:** INVESTIGATE — read both files, confirm intent overlap, then decide in Slice 5. No action without content comparison.

### C9 — Homepage indexed as four URLs

| URL | Impr | Position |
| --- | ---: | -------: |
| `https://gptbot.uz/` | 110 | 4.78 |
| `https://gptbot.uz/?lang=uz` | 31 | 5.65 |
| `https://gptbot.uz/ru/` | 23 | 8.26 |
| `http://gptbot.uz/` | 2 | 1.00 |

Brand query "gptbot" resolves to seven different URLs including `/?lang=uz` (pos 7) and `/uz/` (pos 6).

**Verdict:** parameter and protocol duplication. **Disposition:** canonical + redirect handling for `?lang=uz`; verify `http→https` and `/ru/`↔`/` behaviour. Technical fix, Slice 6.

---

## 2. Explicitly NOT cannibalization

| Case | Why it is not |
| ---- | ------------- |
| RU ↔ UZ counterparts (e.g. `/ru/ai-bot-dlya-biznesa/` ↔ `/uz/biznes-uchun-ai-bot/`) | Different languages, correct hreflang pairing |
| `/uz/kochmas-mulk-agentligi-uchun-ai-bot/` (pos 1) + `/uz/whatsapp-bot-biznes-uchun/` (pos 2) on "o'zbekiston ko'chmas mulk agentliklari" | Two owned SERP slots — beneficial, leave alone |
| `/ru/blog/telegram-bot-na-python/` (6 developer queries, pos 44–54) | Developer/informational intent, no overlap with service pages |
| Niche pages (клиника, салон, автосалон, HoReCa, фитнес…) | Distinct use cases, distinct queries |
| `/ru/blog/chat-bot-dlya-sayta-kak-dobavit-i-skolko-stoit/` "как сделать бот для сайта" 42 impr | Sole URL on that query, no competitor page |

**Market note:** "як зробити бот для сайту" delivers 17 impressions at position 49.5 — Ukrainian-language traffic, outside the target market. Not actionable, do not optimise for it.

---

## 3. Migration map — staged, not executed

| # | Source | Target | Reason | GSC evidence | Redirect | Canonical effect | Hreflang effect | Sitemap |
| - | ------ | ------ | ------ | ------------ | -------- | ---------------- | --------------- | ------- |
| M1 | `/uz/gpt-uzbek-tilida-ai-chat/` | `/uz/gpt-uzbek-tilida/` | Near-duplicate slug, loses on shared query, threatens best UZ asset | pos 42 vs 35, same query | 301 | target self-canonical | remove source from UZ pair | remove source |
| M2 | `/ru/razrabotka-sayta-pod-klyuch/` | `/ru/razrabotka-saytov-tashkent/` | Same intent, 0 clicks, primary owns geo cluster | 15 impr, pos 33–96, 0 clicks | 301 | target self-canonical | target gains `/uz/sayt-yaratish/` pair | remove source |
| M3 | `/ru/bot-dlya-obrabotki-zayavok/` | `/ru/avtomatizatsiya-zayavok/` | Three-way overlap, loses on every shared query | 33 impr, pos 54–90, 0 clicks | 301 | target self-canonical | none | remove source |
| M4 | `/ru/gpt-bot-dlya-biznesa/` | `/ru/ai-bot-dlya-biznesa/` | Loses on all four shared queries to a page at pos 7.62 | 37 impr, pos 34.59, 0 clicks | 301 | target self-canonical | check UZ pair | remove source |
| M5 | `/?lang=uz` | `/uz/` | Parameter duplicate of the homepage | 31 impr, pos 5.65 | canonical + param handling | `/uz/` self-canonical | n/a | already absent |

**No redirect chains:** every target above is a live 200 URL that is not itself a redirect source.

**Not scheduled for redirect** (differentiate instead): C3 Instagram Direct, C7 beauty salon, both blog↔money pairs where the blog holds the better position. Redirecting a better-ranking informational URL into a worse-ranking commercial one would lose the position.

**Pending investigation:** C8 (`telegram-bot-dlya-biznesa` page vs blog) — requires content comparison before disposition.

---

## 4. Disposition summary

| Class | Count | URLs |
| ----- | ----: | ---- |
| MERGE → 301 | 4 | M1–M4 |
| TECHNICAL FIX | 1 | M5 |
| DIFFERENTIATE (no redirect) | 4 | C3 money+blog, C7 money+blog |
| KEEP + differentiate | 1 | `/ru/sozdanie-sayta-dlya-biznesa/` |
| INVESTIGATE | 2 | C8 pair |
| NOT cannibalization | 5 classes | see section 2 |

---

## 5. Method limits

- GSC anonymises queries below a volume threshold. Only 3 of 25 clicks are attributable to a named query; the remaining 22 are hidden. Absence of query-level evidence is therefore not evidence of absence.
- The 6-month window returns the same rows as the 3-month window because the property has no data before 2026-05-21.
- Backlink exposure for redirect candidates has not been verified — no backlink data source is currently connected. This is an open risk on M1–M4 and is recorded in the release notes rather than assumed away.
