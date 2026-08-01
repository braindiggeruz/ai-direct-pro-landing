# GSC Baseline Audit — gptbot.uz

**Date:** 2026-08-01
**Property:** `sc-domain:gptbot.uz` (domain property — covers http/https, all subdomains)
**Window:** 2026-05-21 → 2026-07-29 (70 days; no GSC data exists before 2026-05-21)
**Source:** Google Search Console via OpenSEO, project `7534113b-f748-4f98-ac39-9e3782d3d9e7`

---

## 1. Headline numbers

| Metric | Value |
| ------ | ----- |
| Clicks, 70 days | **25** |
| Impressions, 70 days | ~1,400 |
| Sitewide CTR | ~1.8% |
| Average position | ~30 |
| Pages with ≥1 impression | **>150** |
| Content items in repo | 211 (78 RU blog, 27 UZ blog, 65 RU pages, 41 UZ pages) |

Clicks by page — the entire 25:

| Page | Clicks | Impr | Avg pos |
| ---- | -----: | ---: | ------: |
| `/` (homepage) | 8 | 110 | 4.8 |
| `/ru/blog/chatgpt-i-claude-v-uzbekistane/` | 8 | 108 | 6.0 |
| `/uz/instagram-uchun-ai-menejer/` | 2 | 29 | 8.9 |
| 7 other pages | 1 each | — | — |

Two URLs produce 64% of all clicks. Neither is a commercial page.

Impressions are trending up (early June ~5–20/day → late July 41–94/day). Clicks are not following.

---

## 2. The central finding: indexation is NOT the problem

Prior sessions repeatedly concluded that indexation was the biggest untapped lever and that GSC/Yandex tokens were the blocker. **The data contradicts this.**

More than 150 distinct URLs are receiving impressions in Google. The pages are crawled, indexed, and served. They are simply **ranked at position 60–95 for every commercial query the site targets.**

This is an authority and relevance problem, not a crawling or indexing problem. Submitting more URLs, pinging IndexNow, or connecting Yandex will not change it.

---

## 3. Commercial queries — where the money pages actually sit

Goal is commercial Tashkent service traffic. Actual positions:

| Query | Impr | Avg pos |
| ----- | ---: | ------: |
| разработка сайтов | 14 | 90.1 |
| разработка сайта под ключ | 8 | 89.3 |
| создание сайта под ключ | 8 | 95.6 |
| разработка сайтов в ташкенте | 7 | 82.3 |
| разработка сайтов ташкент | 12 | 81.3 |
| создание сайтов ташкент | 2 | 79.5 |
| создание сайтов в ташкенте | 2 | 77.5 |
| разработка сайта узбекистан | 2 | 76.0 |
| разработка чат ботов для бизнеса | 2 | 92.0 |
| ai боты для бизнеса | 7 | 90.3 |
| ии боты для бизнеса | 2 | 86.0 |
| ии бот для продаж | 4 | 90.8 |
| ии бот для бизнеса | 3 | 60.0 |
| как сделать бот для сайта | 42 | 62.8 |
| чат-бот мастер для бизнеса | 18 | 73.8 |
| бот для инстаграм директ | 27 | 31.1 |

Corresponding money pages:

| Page | Impr | Avg pos | Clicks |
| ---- | ---: | ------: | -----: |
| `/ru/razrabotka-saytov-tashkent/` | 56 | **77.2** | 0 |
| `/ru/razrabotka-sayta-pod-klyuch/` | 19 | **73.0** | 0 |
| `/ru/razrabotka-telegram-bota-tashkent/` | 10 | 10.6 | 0 |
| `/ru/bot-dlya-obrabotki-zayavok/` | 33 | 64.9 | 0 |
| `/ru/ai-bot-s-crm-amocrm-bitrix24/` | 17 | 69.2 | 0 |
| `/ru/ai-chat-dlya-sayta/` | 11 | 47.8 | 0 |
| `/ru/avtomatizatsiya-prodazh/` | 29 | 46.7 | 0 |
| `/ru/chat-bot-dlya-biznesa/` | 44 | 41.3 | 0 |
| `/ru/gpt-bot-dlya-biznesa/` | 37 | 34.6 | 0 |

`/ru/razrabotka-telegram-bota-tashkent/` received three rounds of deep content enrichment (commits ba9b5b6, dbd91f1, c4e650b) chasing an AI-relevance score. It has earned **10 impressions and 0 clicks in 70 days.** The enrichment work did not translate into search demand because the underlying query volume in this niche is tiny — consistent with the earlier Keyword Planner finding of 10–100/mo for bot terms in UZ.

---

## 4. Where the site DOES rank

| Query | Impr | Avg pos | Type |
| ----- | ---: | ------: | ---- |
| gptbot | 9 | 4.2 | brand (3 clicks) |
| o'zbekiston ko'chmas mulk agentliklari | 1 | **1.0** | UZ informational |
| chatgpt vs gpt | 2 | 4.0 | informational |
| gpt vs chatgpt | 1 | 5.0 | informational |
| chat gpt uz | 4 | 5.3 | UZ product |
| gpt plus бесплатно | 1 | 5.0 | informational |
| chat gpt uzbek tilida | 2 | 7.0 | UZ product |
| instagram direct nima | 1 | 8.0 | UZ informational |
| instagramda direct nima | 7 | 8.6 | UZ informational |
| sotuvchi ai | 4 | 8.3 | UZ product |
| ii chat | 4 | 8.3 | informational |
| boss digital | 6 | 8.0 | agency brand |

Everything in the top 10 is brand, informational, or Uzbek-language. Nothing commercial and Russian.

---

## 5. UZ locale verdict: invest

The question was park vs invest. Data answers it.

| Locale | Pages | Typical position of top pages |
| ------ | ----: | ----------------------------- |
| RU money pages | 65 | 34 – 90 |
| UZ pages | 41 | 2 – 9 |

UZ pages with real positions:

| Page | Impr | Avg pos | Clicks |
| ---- | ---: | ------: | -----: |
| `/uz/arizalarni-avtomatlashtirish/` | 15 | **2.07** | 0 |
| `/uz/biznes-uchun-ai-bot/` | 38 | 4.45 | 0 |
| `/uz/ai-sotuvchi/` | 22 | 6.32 | 0 |
| `/uz/gpt-uzbek-tilida/` | 31 | 7.84 | 1 |
| `/uz/instagram-uchun-ai-menejer/` | 29 | 8.93 | **2** |

UZ has 41 pages vs 65 RU and produces 3 of 25 clicks with dramatically better positions. The Uzbek-language SERP is far less contested. **Recommendation: invest in UZ.**

Caveat: UZ query volume is low in absolute terms. Position 2 with 15 impressions means the query gets searched roughly once every five days. Ranking is winnable; demand is thin. Volume research is required before mass-producing UZ content.

---

## 6. Cannibalization — confirmed, severe

Multiple URLs competing for the same intent. Identified from the GSC page list:

**Exact slug collision (page vs blog):**
- `/ru/telegram-bot-dlya-biznesa/` — 26 impr, pos 5.62
- `/ru/blog/telegram-bot-dlya-biznesa/` — 25 impr, pos 5.76

Same slug, two URLs, near-identical impressions and positions. Textbook cannibalization.

**"Website development" cluster — 3 pages:**
`/ru/razrabotka-saytov-tashkent/` (pos 77) · `/ru/razrabotka-sayta-pod-klyuch/` (pos 73) · `/ru/sozdanie-sayta-dlya-biznesa/` (pos 21)

**"Bot for the website" cluster — 5 URLs:**
`/ru/ai-chat-dlya-sayta/` (pos 48) · `/ru/ai-chat-dlya-sayta-polzovatel-zayavki/` (pos 11) · `/ru/sayt-s-ai-botom/` (pos 12.6) · `/ru/blog/chat-bot-dlya-sayta/` (pos 92.7) · `/ru/blog/chat-bot-dlya-sayta-kak-dobavit-i-skolko-stoit/` (89 impr, pos 62.3)

**"Applications / заявки" cluster — 5 URLs:**
`/ru/avtomatizatsiya-zayavok/` (44 impr, pos 22.9) · `/ru/bot-dlya-obrabotki-zayavok/` (pos 64.9) · `/ru/sayt-dlya-zayavok/` · `/ru/blog/bot-dlya-zayavok/` (pos 69.5) · `/ru/blog/telegram-bot-dlya-zayavok/` (pos 31.5)

**"GPT/AI for business" cluster — 6 URLs:**
`/ru/ai-bot-dlya-biznesa/` (50 impr, pos 7.6) · `/ru/gpt-bot-dlya-biznesa/` (pos 34.6) · `/ru/gpt-dlya-biznesa/` · `/ru/gpt-dlya-biznesa-v-uzbekistane/` · `/ru/blog/chto-takoe-ai-bot-dlya-biznesa/` (pos 77) · `/ru/blog/ai-bot-dlya-biznesa-v-uzbekistane/` (85 impr, pos 5.69)

The owner's stated policy is one canonical page per intent. The site currently violates that in at least five clusters.

---

## 7. Duplicate homepage URLs indexed

Four variants of the homepage are receiving impressions:

| URL | Impr | Avg pos |
| --- | ---: | ------: |
| `https://gptbot.uz/` | 110 | 4.78 |
| `https://gptbot.uz/?lang=uz` | 31 | 5.65 |
| `https://gptbot.uz/ru/` | 23 | 8.26 |
| `http://gptbot.uz/` | 2 | 1.00 |

`?lang=uz` is a parameter URL indexed as a separate document. `http://` still appears. `/ru/` and `/` both serve as homepage entry points. This splits signals across four URLs. Fixable with canonical tags and redirects — cheap, and worth doing.

Also present: `/boss-digital/` (9 impr, pos 11.6) — a non-localized path outside the `/ru/` and `/uz/` structure.

---

## 8. Why 0% CTR at good positions is misleading

Several pages show strong average position with zero clicks:
`/ru/blog/ai-bot-dlya-biznesa-v-uzbekistane/` — 85 impr, pos 5.69, 0 clicks.
`/ru/gpt-vs-chatgpt-sravnenie/` — 103 impr, pos 8.27, 0 clicks.

This is not primarily a title/snippet problem. Impressions are spread across 120+ distinct long-tail queries averaging 1–10 impressions each. No single query accumulates enough volume to reliably produce a click. GSC's average position is a mean across all those queries — a page can average position 5 while being #5 for queries almost nobody searches.

The diagnosis is demand, not presentation. Rewriting titles will not fix it.

---

## 9. Revised strategic read

The site has 211 content items, extensive on-page optimization, and clean indexation. It earns 25 clicks per 70 days. The bottleneck is not content volume, content depth, or indexation. It is:

1. **No domain authority** — commercial SERPs in Tashkent (icorp, abc-design, megagroup, upsoft) are held by older domains with backlink profiles. Position 77–95 is what a site with no links looks like against them.
2. **Target keywords have almost no volume** — the bot niche in UZ is 10–100/mo. Even a #1 ranking there yields single-digit monthly clicks.
3. **Effort has gone into depth on pages that cannot rank**, guided by an AI-relevance scoring tool rather than by search demand.

More text on money pages is the lowest-yield action available. It has been tried across multiple iterations with measurable results now visible: 0 clicks.
