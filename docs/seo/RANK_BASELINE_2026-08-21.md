# Rank tracker baseline — GPTBot.uz

The pre-change baseline for the second-pass execution sprint. Captured **before**
any file in that sprint was edited, so it measures production as it stood after
the 2026-08-21 commercial deploy and before the 2026-08-22 changes.

| | |
| --- | --- |
| Tracker | `3d4e261b-282e-4d6c-8da0-bb56ee68ccc7` |
| Run | `50df03c7-f3f0-436f-83cb-b8e1807ae657` |
| Status | completed |
| Checked at | **2026-08-21T22:05:36Z** |
| Location | 2860 (Uzbekistan) · language ru · device mobile · SERP depth 100 |
| Keywords | 25 |
| Cost | **500 credits** (~$0.50), estimated in advance and approved at that ceiling |
| Schedule | manual — it does not spend on its own |

This was the tracker's first run: `lastCheckedAt` was `null` before it. Every
`previousPosition` therefore equals its `position` and carries no trend meaning.

---

## Positions

| Keyword | Pos | Ranking URL |
| --- | ---: | --- |
| аудит digital маркетинга | **1** | /ru/blog/kak-provesti-audit-digital-marketinga/ |
| таргетированная реклама ташкент | **17** | /ru/targetirovannaya-reklama-tashkent/ |
| seo продвижение сайтов | 26 | /ru/seo-prodvizhenie-saytov-tashkent/ |
| стоимость продвижения | 33 | /ru/blog/stoimost-digital-marketinga-v-tashkente/ |
| telegram ads узбекистан | 51 | /ru/telegram-ads-uzbekistan/ |
| контекстная реклама ташкент | 57 | /ru/kontekstnaya-reklama-tashkent/ |
| продвижение сайта цена | 59 | /ru/blog/stoimost-seo-prodvizheniya-v-tashkente/ |
| цены на seo продвижение | 60 | /ru/blog/stoimost-seo-prodvizheniya-v-tashkente/ |
| sayt yaratish xizmati | 69 | /uz/sayt-yaratish/ |
| смм ташкент | 72 | /ru/smm-prodvizhenie-tashkent/ |
| смм агентство ташкент | 79 | /ru/smm-prodvizhenie-tashkent/ |

Not in the top 100 on this run: `sayt yaratish`, `sayt yaratish narxi`,
`veb sayt yaratish`, `smm nima`, `smm xizmatlari`, `telegram reklama`,
`targetolog`, `seo ташкент`, `seo оптимизация ташкент`,
`заказать seo продвижение`, `маркетинговое агентство ташкент`,
`рекламное агентство ташкент`, `разработка сайтов ташкент`,
`создание сайта ташкент`.

`smm xizmatlari` and `telegram reklama` being absent is expected — their pages
were one day old at capture and had been indexed only hours earlier.

---

## Two things this run corrects

**1. `/ru/blog/kak-provesti-audit-digital-marketinga/` is at position 1.**
Search Console's three-month average for «аудит digital маркетинга» was 18.1, and
the 7-day window read 15.67. The live mobile check says **1**. The C15 intent
decision taken on 2026-08-21 — moving that phrase off the money page and leaving
it with the article that actually earns it — worked, and worked faster than the
averaged Search Console figure could show. This is the first hard evidence that
the previous sprint's intent work produces movement.

**2. The Russian paid-media cluster ranks; it just has no impression volume.**
The second-pass audit read those pages as inert because they earn 38 impressions
between them in three months. The tracker shows `таргетированная реклама ташкент`
at **17** and `контекстная реклама ташкент` at **57**, both on their own pages.
They are not failing to rank — the queries are simply tiny. Do not conclude those
pages are broken; conclude the market is small, which is the same conclusion the
keyword data reached from the other direction.

---

## SERP features, and the frame rule

The run also captured SERP features per keyword. The split is clean enough to be
a planning rule.

**Local pack present** — not reachable without a Google Business Profile:
`seo оптимизация ташкент`, `seo продвижение сайтов`, `seo ташкент`,
`контекстная реклама ташкент`, `маркетинговое агентство ташкент`,
`разработка сайтов ташкент`, `рекламное агентство ташкент`,
`смм агентство ташкент`, `смм ташкент`, `создание сайта ташкент`.

**No local pack:** every Uzbek-language keyword tracked, plus
`telegram ads узбекистан`, `аудит digital маркетинга`, `продвижение сайта цена`,
`стоимость продвижения`, `таргетированная реклама ташкент`,
`цены на seo продвижение`, `заказать seo продвижение`.

AI Overview appears on 11 of the 25. A featured snippet appears on exactly one,
`seo продвижение сайтов`, where GPTBot sits at 26.

---

## Keywords to add before the next run

Not added before this run, because adding them would have raised the cost to 580
credits and the approved ceiling was 500. Adding keywords is free; only checking
costs. Add these four, then the next check covers 29 keywords at ~580 credits:

- `seo xizmati` — the target of `/uz/seo-xizmati/`, shipped 2026-08-22
- `marketing nima` — the target of `/uz/blog/marketing-nima/`, shipped 2026-08-22
- `smm услуги` — the C16 cannibalisation case
- `реклама в телеграм` — the phrase `/ru/telegram-ads-uzbekistan/` newly claims

A baseline for the first two would have been trivially "absent" anyway: neither
page existed at capture time.

---

## Checkpoints

Do not rewrite fresh pages. Check these, in this order, and change nothing until
a checkpoint gives a reason to.

| When | What to look at | What would count as working |
| --- | --- | --- |
| ~2026-08-29 (7 days) | Search Console **discovery**: do `/uz/seo-xizmati/` and `/uz/blog/marketing-nima/` appear in the page dimension at all | Any impressions, any position |
| ~2026-09-12 to 09-21 (21–30 days) | **Query emergence**: which queries the new pages attract, and whether `smm услуги` moves from the blog to `/ru/smm-prodvizhenie-tashkent/` | The money page appearing for `smm услуги` at any position |
| ~2026-10-06 to 10-21 (45–60 days) | **Ranking trend**: second tracker run, compared against this baseline | Top-20 entry on `seo xizmati` and `smm xizmatlari` |

Watch specifically: `seo xizmati`, `smm xizmatlari`, `telegram reklama`,
`marketing nima`, `smm услуги`, `реклама в телеграм`.

**Falsification condition.** If `/uz/smm-xizmatlari/` and `/uz/telegram-reklama/`
still show no Search Console impressions by roughly 2026-09-15, the Uzbek service
thesis is weaker than the position data suggests, and the plan should revert to
off-page work only rather than adding more Uzbek pages.
