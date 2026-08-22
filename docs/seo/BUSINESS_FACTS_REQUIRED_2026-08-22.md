# Business facts required — GPTBot.uz, 2026-08-22

Every top-3 page measured in this market publishes at least one **countable
fact**: a price floor, a project count, a client count, a phone number, or a
year the business started. Across all fourteen GPTBot money pages, extracted
from the deployed build on 2026-08-22, the result was `PRICE TOKENS: NONE` and
`PHONE: NONE`.

The repository was searched before this file was written. `content/pages/ru/otzyvy.json`,
`o-kompanii.json` and `komanda.json` contain **no year, no project count and no
client count**; `content/global/site.json` carries `"phone": ""`, `"instagram": ""`
and a city-level `"address": "Tashkent, Uzbekistan"`. There is nothing to reuse.

**Nothing in this file may be filled in by an agent.** Each value is a fact about
the business that only the owner knows. A plausible-looking number here would be
worse than the gap it closes.

---

## The form

Fill in what is true. Leave blank what is not — a blank field stays out of
production, and that is a valid answer.

```
REAL PHONE:
REAL PUBLIC ADDRESS OR SERVICE AREA:
FOUNDING YEAR:
SEO STARTING PRICE:
SMM STARTING PRICE:
WEBSITE STARTING PRICE:
TELEGRAM ADS SERVICE STARTING PRICE:
VERIFIABLE PROJECT COUNT:
VERIFIABLE CLIENT COUNT:
VERIFIABLE CASES:
```

---

## What each field unblocks

| Field | Where it is used | Blocking? |
| --- | --- | --- |
| **Real phone** | `site.json.phone` → `ContactPoint` and `Organization` schema on all 121 pages; Google Business Profile registration; every directory submission form | **Blocking** for GBP and for 8 of the 11 directory listings |
| **Public address or service area** | GBP registration type. A service-area business shows no street address and is the honest option for a studio without a public office — it is *not* a lesser profile | **Blocking** for GBP |
| **Founding year** | `foundingDate` on the Organization node; the "2015 yildan" line that saytyaratish.uz uses in its snippet | Optional |
| **Four starting prices** | See the price model below | Optional, highest commercial value |
| **Project count** | The exact shape repid.uz uses to hold #1 on `seo xizmati`: *"SEO xizmati Toshkent — 24 loyiha natijasi"* | Optional |
| **Client count** | The shape oqila.uz uses: *"+1968 mijoz"* | Optional |
| **Verifiable cases** | A real case study page — the one asset class this site has none of | Optional |

Once a value arrives it goes in **one** place — `content/global/site.json` for
identity fields, the page JSON for prices — and the schema, meta and footer
follow automatically. No page is hand-edited.

---

## Price opportunity model

Where a genuine starting figure would earn its place, and where it would not.
SERP price prevalence measured on live SERPs, location 2860, 2026-08-22.

| Page | Query | SERP price prevalence | Recommended format | Where it appears | Schema impact | Meta impact | CRO impact | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/uz/sayt-yaratish/` | `sayt yaratish narxi` | **10 of 10** top results carry a figure | `X so'mdan` | New line under the existing "Narx qanday shakllanadi" H2 | None — do **not** add `Offer`; the cluster test forbids it and a range is not an offer | Rewrite description to lead with the figure | Highest on the site: this query cannot be satisfied without a number | Low. It is a floor, not a quote |
| `/uz/sayt-yaratish/` | `sayt yaratish xizmati` | 6 of top 10 | `X so'mdan` | Same block | None | Yes | High | Low |
| `/uz/seo-xizmati/` | `seo xizmati` | 2 of top 3 (`2 mln so'mdan`) | `X so'mdan` | Under "Narx nimaga bog'liq" | None | Yes | High | Medium — SEO retainers vary more than a site build; state the period (`oyiga`) |
| `/uz/smm-xizmatlari/` | `smm xizmatlari` | #3 shows `oyiga 6 850 000 so'mdan` | `oyiga X so'mdan` | Under "Narx qanday shakllanadi" | None | Yes | High | Low |
| `/uz/telegram-reklama/` | `telegram reklama` | Low — Telegram's own pages dominate | Skip | — | — | — | Low | Not worth it |
| `/ru/seo-prodvizhenie-saytov-tashkent/` | `seo продвижение сайтов` | oqila shows `Цена от 1910000` at #13 | `от X сум` | Under "Сколько стоит SEO-продвижение" | None | Yes | Medium — page is at 26–31 | Low |
| `/ru/razrabotka-saytov-tashkent/` | `разработка сайтов ташкент` | High | `от X сум` | Existing cost block | None | Yes | Medium — page is at 74 | Low |
| `/ru/smm-prodvizhenie-tashkent/` | `smm услуги` | sos.uz shows `тарифы от $200` | `от X сум` | Under "От чего зависит стоимость SMM" | None | Yes | Medium | Low |
| `/ru/targetirovannaya-reklama-tashkent/` | `таргетированная реклама ташкент` | #4 quotes budget floors, not service fees | Budget floor, not a fee | — | None | Optional | Medium | Medium — do not present an ad budget as a service price |
| `/ru/internet-reklama-tashkent/` | anonymised long tail | n/a | Skip | — | — | — | Low | No measurable target |

**Format rules, whatever the numbers turn out to be.**

1. Publish a **floor**, never a range that reads as a quote: `2 000 000 so'mdan`,
   not `2–5 mln`.
2. Say the **period** where one applies. An SMM retainer is `oyiga X so'mdan`;
   a site build is not.
3. Keep the existing honest sentence — scope drives the number, consultation and
   initial scoping are free. The figure is added **beside** it, not instead of it.
4. **No `Offer`, `Review` or `AggregateRating` schema.** `tests/seo-cluster-quality.test.ts`
   fails the build on those, and correctly: a floor is not an offer and there are
   no published reviews to aggregate.
5. `/uz/blog/` spokes may not contain a bare currency figure — the same test
   enforces it. Prices belong on money pages only.

**What must not happen.** No placeholder ever ships. Not `от X сум`, not
`100+ клиентов`, not `+998 __ ___ __ __`. If a value is not supplied, the page
keeps today's wording, which is honest and merely less competitive.
