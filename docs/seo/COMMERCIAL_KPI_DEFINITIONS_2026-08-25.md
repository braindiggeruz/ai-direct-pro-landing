# Commercial KPI definitions — GPTBot.uz, from 2026-08-25

Every metric on this page is filtered to **country = Uzbekistan**. That is not a
refinement, it is the whole point: over 2026-07-28..2026-08-24, **~31% of site
impressions came from outside Uzbekistan** — Russian-language explainer articles
ranking at positions 24–70 in Russia and Ukraine at CTR 0.25–1.15%. Russia alone
contributed 1,477 impressions; Ukraine 785 impressions and 2 clicks.

Those impressions are real, but they cannot buy anything. An unfiltered
impression chart will therefore rise on demand the business cannot serve, and
every report drawn from it will be systematically optimistic.

**Rule: total impressions is never the headline number.**

---

## The headline KPI

**Commercial impression share** = impressions of the 15 money pages ÷ impressions
of the site, country = Uzbekistan.

Baseline over 2026-07-28..2026-08-24: **2.3%** (309 of ~11,800).

Why this and not lead count: at 0.54 commercial organic sessions per day, seeing
even one lead with 80% probability at a 5% contact rate takes 59 days, and 109
days at 95%. A weekly lead figure would be noise, and a noisy headline number
invites fitting the story to it.

---

## The full baseline

Window 2026-07-28..2026-08-24, `sc-domain:gptbot.uz`, country = Uzbekistan.

| Metric | Definition | Baseline |
| --- | --- | --- |
| Commercial impression share | 15 money-page URLs ÷ site impressions | **2.3%** (309 / ~11,800) |
| …including commercial articles | plus pricing / contract / "what SMM includes" | 4.2% (~500) |
| Commercial clicks | same URLs | 4 |
| Commercial CTR | clicks ÷ impressions on those URLs | 0.8% |
| Top-20 commercial keywords | commercial intent, position ≤ 20 | 2 |
| Top-10 commercial | " | 0 |
| Top-3 commercial | " | 0 |
| `generate_lead` from organic | GA4 key event, channel = Organic Search | 0 |
| Commercial organic sessions | GA4 | ≈ 15 / 28 days |
| Referring domains | OpenSEO | 8 |
| RU vs UZ commercial split | impressions by locale prefix | to be recorded at Day 7 |

---

## The 15 money pages

`/uz/sayt-yaratish/`, `/uz/smm-xizmatlari/`, `/uz/seo-xizmati/`,
`/uz/telegram-reklama/`, `/ru/razrabotka-saytov-tashkent/`,
`/ru/seo-prodvizhenie-saytov-tashkent/`, `/ru/razrabotka-sayta-pod-klyuch/`,
`/ru/smm-prodvizhenie-tashkent/`, `/ru/digital-marketing-tashkent/`,
`/ru/internet-reklama-tashkent/`, `/ru/sozdanie-sayta-dlya-biznesa/`,
`/ru/kontekstnaya-reklama-tashkent/`, `/ru/targetirovannaya-reklama-tashkent/`,
`/ru/telegram-ads-uzbekistan/`, `/ru/lokalnoe-seo-tashkent/`,
`/ru/marketingovyi-audit-tashkent/`.

---

## Three traps that are already known

**`/ru/internet-reklama-tashkent/` shows position 4.26 and cannot be planned on.**
Filtering Search Console by query for that URL returns zero rows: every term is
below the anonymisation threshold. The position is genuine, the words are
unknown. No KPI may be set on it.

**GA4 "Organic Search" is not Google, and it under-counts.** It reports ~55% more
sessions than Search Console reports clicks, while `gtag` is deferred by 30–34
seconds behind first interaction, which drops short mobile sessions. Two errors
of unknown size pointing in opposite directions. Use GA4 for behaviour and
Search Console for demand; never present a GA4 percentage change as a search
result.

**`generate_lead` has no usable history before 2026-08-24.** The event reached the
code on 2026-08-21, the homepage on 2026-08-22, and was marked a Key Event on
2026-08-24. Key Event marking is not retroactive, so any "0 → N" comparison
across that boundary measures when the instrument was switched on. The two
events on record (1 user, 2026-08-24, landing `/`, channel ≠ organic) confirm the
instrument works; they are not commercial leads. See
`docs/seo/GENERATE_LEAD_HISTORY_2026-08-25.md`.

---

## How to pull it

Search Console, weekly:

- dimension `country` = `uzb`, then `page`, then `query`
- window: rolling 28 days, compared with the preceding 28
- one row per money page; commercial share computed against the site total for
  the **same filtered window**, never against the unfiltered total

GA4, weekly: Reports → Acquisition → Traffic acquisition, session default
channel group = Organic Search, secondary dimension = landing page, then filter
to the 15 URLs.

Rank tracker: every two weeks at most (228 credits per run), and not before
2026-09-06 — the current release needs a clean observation interval.
Backlinks: monthly.
