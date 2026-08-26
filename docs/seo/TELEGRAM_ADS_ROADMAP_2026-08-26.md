# Roadmap — winning traffic on `telegram ads` and `реклама в телеграм`

Measured 2026-08-26. This session spent **1,341 OpenSEO credits** in total
(2,309 → 968); the Telegram-specific research below cost ~520 of them: two
discovery pulls, 132 unique tail keywords, and 8 live SERPs.

---

## What the research changed

### 1. There is a fact about this market I published the page without

`telegram ads узбекистан` measures **50/mo at CPC 1.61, competition 0.51** — a
term that did not appear in the first sweep and that GPTBot already holds
position 50 on. Its SERP is the most `.uz`-saturated of anything measured:

| # | Domain | What it is |
| --- | --- | --- |
| 1 | ads.telegram.org | the platform |
| 3 | **marketing.uz** | association article |
| 4 | **magnetto.pro** | *"25 млн пользователей Telegram в Узбекистане. Неразогретый аукцион, CPM от 0.01 €"* |
| 5 | **socialactive.uz** | homepage ranking as a service page |
| 7 | **munamedia.me** | *"цена, вход и стратегии"* — quotes 1500–2000 € |
| 8 | **saytyaratish.uz** | blog post |
| 9 | **olx.uz** | a classified ad selling the service |
| 10 | **tca-media.uz** | *"Официальный партнёр Telegram Ads в Узбекистане"* |
| 11 | **kelyanmedia.uz** | *"Официальный Telegram Ads в Узбекистане 2026"* |
| 13 | **ru.wikipedia.org** | article **«Реклама в Telegram в Узбекистане»** |
| 14 | **wunder-digital.uz** | step-by-step guide |
| 15 | **meridians.uz** | *"Официальный партнёр. Евро кабинет бесплатно"* |
| 17 | elama.ru | *"минимальная ставка в кабинетах для Узбекистана — всего 0,01 €, минимальный бюджет для старта — 500 €"* |
| 18 | pickles.team | *"объявления на русском и узбекском языках"* |
| 20 | **enter-group.uz** | *"охват 25+ миллионов"* |

**Ten `.uz` or Uzbekistan-specific results in the top 20.** No local pack.

The fact the page is missing: **the Uzbekistan auction is uncontested and its CPM
floor is roughly two orders of magnitude below the Russian market.** eLama and
magnetto independently publish 0.01 € for Uzbekistan cabinets against 0.7–2 € for
Russian ones. That is the strongest "why now" argument in this market, every
ranking competitor uses it, and the page shipped without it.

The page currently states the platform's TON-cabinet minimum (0.1 Toncoin, from
`ads.telegram.org`). Both are true and they describe different cabinets. Saying
only one of them is what makes the page weaker than the competitors.

**Also worth knowing and not claiming:** `tca-media.uz` and `meridians.uz` both
call themselves *official Telegram Ads partners*. GPTBot is not one. That
sentence must never appear on a GPTBot page, and it is a real competitive limit
on the "открываем кабинет" angle.

### 2. The Russian tail is 85 phrases and four distinct intents

Discovery returned **85 advertising-relevant phrases, almost all at 10/mo**.
Individually worthless. Collectively ~850/mo, and they separate cleanly:

| Intent family | Phrases | Aggregate | Already covered? |
| --- | --- | --- | --- |
| **Price** — `реклама в телеграм цена`, `в тг каналах цена`, `стоимость`, `дешевая` | ~8 | ~80/mo | **Yes** — the cost section shipped 2026-08-26 |
| **Buying placements** — `биржа рекламы телеграм` ×7, `купить рекламу в телеграм` ×6, `закупка`, `покупка`, `продажа`, `разместить` | ~25 | ~250/mo | **No** |
| **Channel selection** — `реклама в телеграм каналах`, `в тг каналах`, `в каналах телеграм`, `в группах телеграм` | ~10 | ~100/mo | **No** |
| **Official vs seeding** — `официальная реклама в телеграм`, `официальная реклама телеграм`, `встроенная реклама` | ~4 | ~40/mo | Partly |
| **Free / examples** — `бесплатная реклама тг канала`, `пример рекламы телеграм канала` | ~6 | ~60/mo | No — and weak commercial intent |

### 3. The content inventory is lopsided

51 documents on this site mention Telegram. **All but two are about bot
development** — a cluster `demand-policy.json` itself marks FROZEN for having no
measurable demand. Telegram *advertising*, which measures ~7,900/mo, has two
pages and **zero articles**.

---

## Move 1 — fix the page before writing anything new

**No new URL. Highest value per hour of any item here.**

Add to `/ru/telegram-ads-uzbekistan/` and `/uz/telegram-reklama/`:

- **The Uzbekistan auction economics.** Reach of roughly 25–27 million Telegram
  users in the country, an auction with few competing advertisers, and a CPM
  floor published at 0.01 € for Uzbekistan cabinets against 0.7–2 € quoted for
  Russian ones. Attributed to the sources that publish it, dated, with the
  caveat that a floor is not a forecast.
- **A clear map of which minimum applies to which cabinet** — TON cabinet
  (0.1 TON per the platform docs), Uzbekistan euro cabinet via a reseller
  (0.01 € bid floor, entry budgets published from 250–2,000 €), direct contract.
  Right now the page names one and the competitors name another; naming all
  three correctly is the differentiator.
- **`telegram ads узбекистан` as an explicit target.** It is a measured 50/mo
  term at CPC 1.61 that the page already ranks 50th on, and it is the geo term
  the whole `.uz` field competes for.

Signal: impressions on `telegram ads узбекистан` within 7–14 days of recrawl.

## Move 2 — one article, not one per keyword

**`/ru/blog/telegram-ads-ili-posevy-v-kanalah/`**
*"Telegram Ads или посевы в каналах: что выбрать бизнесу в Узбекистане"*

Owns the **buying-placements family — ~25 phrases, ~250/mo aggregate**: `биржа
рекламы телеграм`, `купить рекламу в телеграм`, `закупка`, `покупка`,
`разместить`, `официальная реклама`.

Why an article and not a section on the money page: the intent is genuinely
different. Someone searching `биржа рекламы телеграм` wants to know **where and
how to buy a post in someone else's channel** — a market with exchanges
(collaborator.pro, telega.in, adsell.io) and its own risks. Someone searching
`telegram ads узбекистан` wants an agency. Merging them makes the money page
answer two questions badly.

What it must contain to beat the incumbents, none of whom write for this market:

- the two mechanisms side by side — official platform vs direct channel deals —
  with who controls what, how payment works, and what each guarantees
- how the exchanges work and what they charge for being the intermediary
- the fraud surface: bought subscribers, dead channels, ER manipulation, and the
  concrete checks that catch each one
- what a Uzbekistan advertiser can actually access today
- **when seeding beats the official platform and when it does not** — the honest
  section every competitor skips

Rejected as separate pages: one URL per tail phrase. Twenty-five pages at 10/mo
each is a doorway farm, it would fail the demand gate, and it is exactly the
pattern that produced the frozen 140-page bot cluster.

## Move 3 — the channel-selection article

**`/ru/blog/kak-vybrat-telegram-kanal-dlya-reklamy/`**
*"Как выбрать Telegram-канал для рекламы: проверка перед покупкой"*

Owns the **channel-selection family — ~10 phrases, ~100/mo**.

The SERP for `реклама в телеграм каналах` contains **no `.uz` domain at all** —
it is Yandex, eLama, Roistat, Habr, carrotquest. That is either a wall or an
opening; the deciding factor is whether the article is written for the
Uzbekistan market rather than translated from the Russian one.

Content that does not exist in that SERP for this market: how to read ER on an
Uzbek-language channel, what a realistic subscriber price is here, how to spot a
channel whose audience is not in Uzbekistan, and a checklist that survives being
used by a non-marketer.

**Gate this one on Move 2.** If the seeding article earns no impression in six
weeks, this SERP is a wall and the money goes to Phase 3 instead.

## Move 4 — Uzbek-language

`telegram reklama` at 70/mo and competition **0.08** is the most reachable
commercial term measured anywhere in this market, and it is already the hub.
But the Uzbek tail is thin: `telegramda reklama`, `telegram kanal reklama` and
`telegram reklama narxi` all return **no measurable volume**.

So: **no Uzbek article yet.** Strengthen the hub (Move 1), then re-measure at
Day 28. If `telegram reklama` moves into the top 10 and Search Console starts
showing Uzbek tail queries that Google Ads cannot see, that is the trigger — and
it is a better trigger than a volume figure, because Search Console sees real
Uzbek queries that keyword tools miss.

## Move 5 — the part that is not content

The `telegram ads узбекистан` SERP is won by presence as much as by pages:

- **`ru.wikipedia.org` has an article «Реклама в Telegram в Узбекистане»** at
  rank 13. It is an entity in the graph for this topic. Being cited there is a
  legitimate, hard-to-copy signal — and it requires something citable first,
  which is what Moves 1–3 produce.
- **`olx.uz` ranks 9th with a plain classified ad** selling this service. That is
  the cheapest placement in the entire measured field and it needs no owner fact
  beyond a contact channel.
- **`marketing.uz`** (rank 3) is the industry association outlet already
  publishing Telegram Ads guidance for Uzbekistan. `docs/seo/CITATION_EXECUTION_PACK_2026-08-22.md`
  lists it as *pitch, do not submit*. This topic is the pitch.
- `spot.uz` (rank 8 on `telegram ads цена`) covers Telegram advertising costs in
  Uzbekistan as news.

None of these is a link-building campaign. All four are placements on pages that
already rank for the target query.

---

## Order, and what gates what

| # | Move | New URLs | Depends on |
| --- | --- | --- | --- |
| 1 | Auction economics on both hubs | 0 | nothing — do first |
| 2 | Seeding-vs-Ads article | 1 | Move 1 shipped |
| 5a | OLX listing, marketing.uz pitch | 0 | Move 1 shipped (something to point at) |
| 3 | Channel-selection article | 1 | Move 2 shows impressions by week 6 |
| 4 | Uzbek article | 1 | Search Console shows Uzbek tail at Day 28 |
| 5b | Wikipedia citation | 0 | Moves 2–3 published |

## Kill rules

| Rule | Trigger | Action |
| --- | --- | --- |
| Geo term | 5 weeks after Move 1, `telegram ads узбекистан` still ≥ 40 | The constraint is entity, not text. Stop writing, go to Move 5. |
| Seeding article | 6 weeks, zero impressions on any `биржа`/`купить` phrase | The tail does not aggregate here. Do not write Move 3. |
| Channel article | 6 weeks, zero impressions | The Russian media wall is real. Stop the Telegram content line. |
| Whole lane | Day 90, fewer than 5 commercial clicks from the Telegram cluster | Reallocate to webdev-uz. |

## What this roadmap will not do

No page per tail phrase — 25 pages at 10/mo is the frozen bot cluster repeating.
No "официальный партнёр Telegram Ads" claim — GPTBot is not one.
No invented CPM or budget as a GPTBot price — platform and third-party figures
stay attributed and dated.
No promise of a subscriber cost or a lead cost.
No new Uzbek article before Search Console justifies it.
