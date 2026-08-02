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

### C6 — UZ flagship product page has a near-duplicate slug — REASSESSED 2026-08-01, NOT cannibalization

| URL | Query | Impr | Position |
| --- | ----- | ---: | -------: |
| `/uz/gpt-uzbek-tilida/` | chatgpt yuklab olish uzbek tilida | 1 | 35.00 |
| `/uz/gpt-uzbek-tilida-ai-chat/` | chatgpt yuklab olish uzbek tilida | 1 | 42.00 |

`/uz/gpt-uzbek-tilida/` page-level: 31 impressions, 1 click, position 7.84. It is the site's best-positioned Uzbek product asset against `chatgpt uzbek tilida` (2,900/mo, LOW competition).

**Initial verdict (slug-based):** TRUE cannibalization.

**Reassessment before executing M1 — the two pages do not share an intent:**

| | `/uz/gpt-uzbek-tilida/` | `/uz/gpt-uzbek-tilida-ai-chat/` |
| --- | --- | --- |
| pageType / searchIntent | `gpt-chat` / transactional | `blog` / informational |
| H1 | «O'zbek tilida AI chat online» | «GPT o'zbek tilida: AI chatdan qanday foydalanish mumkin» |
| Primary keyword | chatgpt uzbek tilida | gpt o'zbek tilida |
| Structure | product surface, 8 FAQ, SoftwareApplication schema | guide: TOC, prompt formula, bad-vs-good table, 12 FAQ, Article schema |
| Role | use the chat | learn to use the chat, CTA into the product page |

Full query-level pull for both URLs over the whole 6-month window returns **three rows**:

| URL | Query | Impr | Position |
| --- | ----- | ---: | -------: |
| `/uz/gpt-uzbek-tilida/` | chat gpt uzbek tilida | 2 | 7.00 |
| `/uz/gpt-uzbek-tilida/` | chatgpt yuklab olish uzbek tilida | 1 | 35.00 |
| `/uz/gpt-uzbek-tilida-ai-chat/` | chatgpt yuklab olish uzbek tilida | 1 | 42.00 |

The single shared query carries one impression per URL, and it is a *download* query neither page is built for — the site has a dedicated article for it. That is noise, not a competing query pattern.

Page-level, the guide earns **17 impressions at position 10.12** on its own. It is not a dead duplicate that redirects would tidy away; it is a ranking asset with independent value, and it already funnels to the product page through its CTA and internal links.

**Verdict:** DIFFERENT_INTENT — product surface versus guide, different funnel stages. Per the merge rule (same language, same primary intent, same SERP task, and the loser lacking independent value) this fails on two of the four conditions.
**Disposition:** KEEP both, no redirect. Differentiation is already explicit in title, H1, schema and page type; no further change required. **M1 is withdrawn.**

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

| # | Source | Target | Reason | GSC evidence | Redirect | Canonical effect | Hreflang effect | Sitemap | Status |
| - | ------ | ------ | ------ | ------------ | -------- | ---------------- | --------------- | ------- | ------ |
| M1 | `/uz/gpt-uzbek-tilida-ai-chat/` | — | Reassessed: product surface vs guide, different intent; the guide holds pos 10.12 on its own | 3 query rows total, 1 shared query at 1 impr each | none | unchanged | unchanged | keep | **WITHDRAWN** |
| M2 | `/ru/razrabotka-sayta-pod-klyuch/` | `/ru/razrabotka-saytov-tashkent/` | Same intent, 0 clicks, primary owns geo cluster | 19 impr, pos 33–96, 0 clicks | 301 | target self-canonical | target keeps `/uz/sayt-yaratish/` pair | source removed | **EXECUTED** |
| M3 | `/ru/bot-dlya-obrabotki-zayavok/` | `/ru/avtomatizatsiya-zayavok/` | Three-way overlap, loses on every shared query | 33 impr, pos 54–90, 0 clicks | 301 | target self-canonical | `/uz/arizalarni-qabul-qiluvchi-bot/` becomes single-locale | source removed | **EXECUTED** |
| M4 | `/ru/gpt-bot-dlya-biznesa/` | `/ru/ai-bot-dlya-biznesa/` | Loses on all four shared queries to a page at pos 7.62 | 37 impr, pos 34.59, 0 clicks | 301 | target self-canonical | `/uz/gpt-bot-biznes-uchun/` becomes single-locale | source removed | **EXECUTED** |
| M5 | `/?lang=uz` | `/uz/` | Parameter duplicate of the homepage | 31 impr, pos 5.65 | 301 in `functions/index.ts` | `/uz/` self-canonical | n/a | already absent | **ALREADY SHIPPED** |

**Execution notes (2026-08-01):**

- Unique material from M2's source — the definition of the turnkey format and the CMS question — was moved into the target as a new H2 and two FAQ entries before the redirect was created.
- Every internal reference to a merged URL was repointed to its target, including the `targetMoneyPage` field on the articles that supported the merged pages. Links that would have become duplicates or self-links after repointing were removed.
- `cannib-luchshie-gpt` already pointed at M4's source. It was repointed to `/ru/ai-bot-dlya-biznesa/` so no request takes two hops.
- The UZ counterparts of M3 and M4 rank independently (positions 11.6 and 6.0) and are kept. Their `hreflangRu` declarations were **dropped, not repointed** — the merge targets already have their own UZ pairs, and a second claim would be a false pair. Both pages are now single-locale, which the corrected audit rule reports rather than treating as a defect.
- M5 was found to be already implemented: `functions/index.ts` 301s `?lang=ru`/`?lang=uz` to `/ru/` and `/uz/`, and `tests/canonical-url-redirects.test.ts` covers it.

**No redirect chains:** every target above is a live 200 URL that is not itself a redirect source. `tests/seo-link-graph.test.ts` now enforces this, together with "no redirect source is still published as a page" and "every redirect target is served".

**Not scheduled for redirect** (differentiate instead): C3 Instagram Direct, C7 beauty salon, both blog↔money pairs where the blog holds the better position. Redirecting a better-ranking informational URL into a worse-ranking commercial one would lose the position.

**Pending investigation:** C8 (`telegram-bot-dlya-biznesa` page vs blog) — requires content comparison before disposition.

---

## 4. Disposition summary

| Class | Count | URLs | Status |
| ----- | ----: | ---- | ------ |
| MERGE → 301 | 3 | M2, M3, M4 | executed 2026-08-01 |
| TECHNICAL FIX | 1 | M5 (`?lang=` parameter) | already shipped |
| KEEP — different intent | 2 | C6 pair (`/uz/gpt-uzbek-tilida/` + `-ai-chat`) | M1 withdrawn |
| DIFFERENTIATE (no redirect) | 4 | C3 money+blog, C7 money+blog | not started |
| KEEP + differentiate | 1 | `/ru/sozdanie-sayta-dlya-biznesa/` | no action needed |
| INVESTIGATE | 2 | C8 pair | open |
| NOT cannibalization | 5 classes | see section 2 | — |

Post-merge repository state: 111 pages (was 114), 226 sitemap URLs (was 229), 12 redirect
rules (was 9), 0 broken internal links, 0 orphan pages, 0 broken hreflang pairs.

**Still open after this release**

- **C8** `/ru/telegram-bot-dlya-biznesa/` (26 impr, pos 5.62) vs `/ru/blog/telegram-bot-dlya-biznesa/` (25 impr, pos 5.76). GSC anonymises the queries at this volume, so there is no query-level proof. Both hold top-6 positions; redirecting either would risk a position that is currently earned. Needs a content comparison, not a redirect.
- **C3 / C7** blog-outranks-money-page pairs. The disposition is differentiation, which is a content-rewrite task rather than a routing change, and it touches pages that currently rank. Deliberately not bundled into a release whose other changes are structural.
- **Backlink exposure** for M2–M4 remains unverified — no backlink source is connected. All three sources had zero clicks over the full history of the property, which bounds the risk but does not eliminate it. If Search Console reports a referring domain to any of the three, the 301 preserves it; if a redirect ever needs reverting, the source files are recoverable from commit `2302618`'s parent.

---

## 4b. Follow-up executed 2026-08-02 — C8 resolved, C3 and C7 differentiated

### C8 — content comparison done, verdict: KEEP BOTH

The comparison the map called for:

| | `/ru/telegram-bot-dlya-biznesa/` (page) | `/ru/blog/telegram-bot-dlya-biznesa/` (blog) |
| --- | --- | --- |
| pageType / intent | `money` / commercial | article, `targetMoneyPage` already set to the page |
| title | «Telegram-бот для бизнеса — заказы, рассылки, оплата» | «Telegram-бот для бизнеса: разбор возможностей в 2026» |
| H1 | «…автоматизация продаж» | «…в 2026: разбор возможностей» |
| Structure | 21 blocks, 7 FAQ, H2 «Сколько стоит», «Что получает бизнес» | 22 blocks, 5 FAQ, H2 «Чего избегать», «Telegram Ads», «Что важно для рынка Узбекистана» |

Titles, H1 and roughly half the H2 set are already distinct; the overlap is the functional catalogue («Что умеет» versus «Базовый/Продвинутый функционал»). Both URLs hold positions 5.62 and 5.76, so a redirect would forfeit an earned position on either side. **Verdict: DIFFERENT_INTENT_ENOUGH — keep both, no redirect.** The pair is now made explicit to the crawler instead: the blog opens with a contextual link stating that it is the разбор and the page carries состав работ, сроки and цена; the page links back to the blog as the разбор.

### The actual defect found — the ranking pages had no path to the commercial page

All three articles in C3, C7 and C8 contained **zero `linkp` blocks**. Their only in-body call to action pointed at `https://t.me/...`, which the renderer emits with `rel="nofollow noopener"` — an external link that passes no internal signal and routes the reader out of the site entirely. So the pages that hold the positions had no in-body route to the pages that sell.

This matches the baseline finding: positions exist, clicks do not. Fixed additively — no heading, title, slug or existing paragraph was modified, so nothing that currently earns a position was touched.

| Article | Position | Contextual links added |
| ------- | -------: | ---------------------- |
| `/ru/blog/instagram-direct-bot-kak-rabotaet/` | 20.50 | → `/ru/instagram-direct-bot/` (early), → `/ru/ai-menedzher-dlya-instagram/` (late) |
| `/ru/blog/ai-bot-dlya-salona-krasoty-zadachi/` | 50.25 | → `/ru/ai-bot-dlya-salona-krasoty/` (early), → `/ru/avtomatizatsiya-zayavok/` (late) |
| `/ru/blog/telegram-bot-dlya-biznesa/` | 5.76 | → `/ru/telegram-bot-dlya-biznesa/` (early), → `/ru/razrabotka-telegram-bota-tashkent/` (late) |

Plus one reciprocal: `/ru/telegram-bot-dlya-biznesa/` (page) → `/ru/blog/telegram-bot-dlya-biznesa/`.

Verified after rebuild: all seven targets render at a live `dist` path, none is a redirect source, and every `linkp` emits a real `<a>` in the prerendered HTML. `tests/seo-link-graph.test.ts` was **not** run — vitest is not installed in this checkout — so the link graph was checked directly against `dist` and `redirects.json` instead.

**Remaining open:** C3 and C7 money pages still lose to their own blogs on the shared query. The disposition here was deliberately limited to routing, not to retargeting the money pages' metadata: their titles and H1 are already commercial («заказать подключение», «заказать запись 24/7»), so the gap is authority, not intent signalling. Rewriting them would risk positions without addressing the cause.

## 5. Method limits

- GSC anonymises queries below a volume threshold. Only 3 of 25 clicks are attributable to a named query; the remaining 22 are hidden. Absence of query-level evidence is therefore not evidence of absence.
- The 6-month window returns the same rows as the 3-month window because the property has no data before 2026-05-21.
- Backlink exposure for redirect candidates has not been verified — no backlink data source is currently connected. This is an open risk on M1–M4 and is recorded in the release notes rather than assumed away.
