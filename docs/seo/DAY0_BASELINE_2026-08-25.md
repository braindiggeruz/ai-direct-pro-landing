# Day-0 baseline — commercial growth release, 2026-08-25

Everything here was read from Search Console (`sc-domain:gptbot.uz`) and GA4
property 540129731 on 2026-08-25, **before** this release reached production.
Every Search Console figure is filtered to **country = Uzbekistan**.

Two windows are quoted because they answer different questions:

- **Audit window** 2026-07-28 .. 2026-08-24 — comparable with the 2026-08-25 audit.
- **Current window** 2026-07-25 .. 2026-08-22 — what `last_28_days` returns today.

---

## 1. Site totals, country = Uzbekistan

| Window | Impressions | Clicks | Avg position |
| --- | --- | --- | --- |
| 2026-07-28..2026-08-24 | 8,441 | 136 | 9.39 |
| 2026-07-25..2026-08-22 | 5,184 | 29 | — |

For scale, the same audit window across **all** countries: Russia 1,536
impressions / 17 clicks / position 29.3; Ukraine 793 / 2 / 52.7. That is the
leakage the country filter exists to remove.

---

## 2. Commercial impression share — corrected

The audit reported **2.3% (309 of ~11,800)**. That divides a
Uzbekistan-filtered numerator by an all-country denominator. Filtered on both
sides, in the audit's own window, the site total is **8,441**, which the audit
itself quotes elsewhere as the source of "position 9.38 по Узбекистану".

| | Impressions | Share of 8,441 |
| --- | --- | --- |
| 16 money pages (measured today, audit window) | **263** | **3.12%** |
| — of which the Uzbek lane | 40 | 0.47% |
| — of which the Russian lane | 223 | 2.64% |
| Audit's numerator (309) against the correct denominator | 309 | 3.66% |

**Day-0 headline KPI: commercial impression share = 3.12%.**
Commercial clicks: **1** (`/ru/razrabotka-saytov-tashkent/`). Commercial CTR 0.38%.
Commercial clicks as a share of site clicks: 0.7%.

The audit's numerator of 309 and its 4 commercial clicks do not reproduce
today; Search Console revises. The number to compare future readings against is
the one in this file, produced by the recipe in
`docs/seo/COMMERCIAL_KPI_DEFINITIONS_2026-08-25.md`.

---

## 3. Money pages, audit window, country = Uzbekistan

| URL | Clicks | Impressions | Position |
| --- | --- | --- | --- |
| `/ru/razrabotka-saytov-tashkent/` | 1 | 85 | 73.24 |
| `/ru/seo-prodvizhenie-saytov-tashkent/` | 0 | 48 | 51.27 |
| `/ru/razrabotka-sayta-pod-klyuch/` | 0 | 28 | 65.75 |
| **`/uz/sayt-yaratish/`** | 0 | **28** | **62.86** |
| `/ru/smm-prodvizhenie-tashkent/` | 0 | 21 | 59.81 |
| `/ru/sozdanie-sayta-dlya-biznesa/` | 0 | 18 | 26.28 |
| `/ru/digital-marketing-tashkent/` | 0 | 12 | 50.42 |
| **`/uz/smm-xizmatlari/`** | 0 | 10 | 47.10 |
| `/ru/kontekstnaya-reklama-tashkent/` | 0 | 7 | 56.86 |
| `/ru/telegram-ads-uzbekistan/` | 0 | 3 | 50.00 |
| **`/uz/seo-xizmati/`** | 0 | 2 | 23.00 |
| `/ru/lokalnoe-seo-tashkent/` | 0 | 1 | 70.00 |
| **`/uz/telegram-reklama/`** | 0 | **0** | — |
| `/ru/internet-reklama-tashkent/` | 0 | 0 | — |
| `/ru/targetirovannaya-reklama-tashkent/` | 0 | 0 | — |
| `/ru/marketingovyi-audit-tashkent/` | 0 | 0 | — |

`/uz/telegram-reklama/` returns **no row at all** in this window with the
country filter applied. The audit's "position 6.00 on 2 impressions" is not
reproducible here; treat that page as unmeasured, which is also why the rank
tracker's "not in top 100" for `telegram reklama` cannot be resolved yet.

---

## 4. The phrase this release is about

`/uz/sayt-yaratish/`, country = Uzbekistan, audit window:

| Query | Impressions | Position | Occurrences on the page **before** | **after** |
| --- | --- | --- | --- | --- |
| **`sayt yaratish xizmati`** | **12** | **75.08** | **0** | **3** |
| `sayt yaratish` | 10 | 52.20 | 10 | 16 |
| `arzon sifatli veb sayt yaratish xizmati` | 2 | 77.50 | — | — |
| `sayt ochish` | 1 | 38.00 | 0 | 0 |
| `sayt tayyorlash xizmati` | 1 | 30.00 | 0 | 0 |
| `sayt tayyorlash` | 1 | 52.00 | 0 | 0 |
| `veb-sayt yaratish` | 1 | 62.00 | — | — |
| **`web sayt yaratish`** | **no row** | — | **0** | **2** |
| **`veb sayt yaratish`** | **no row** | — | **1** | **3** |
| `sayt yaratish narxi` | no row | — | 1 | 1 |

### The audit's phrase kill rule cannot be used as written

The audit's rule was: *"after 5 weeks, if Search Console shows no impression for
`sayt yaratish xizmati` on this URL, the exact match was not the constraint."*

**That row already exists** — 12 impressions at position 75.08, before any of
this release shipped. The rule as written would report success on day one.

**Restated rule, against this baseline:**

| Reading at Day 35 (2026-09-29), country = Uzbekistan | Verdict |
| --- | --- |
| `sayt yaratish xizmati` position ≤ 55 **or** impressions ≥ 36 (3×) | Exact coverage works. Apply the method to the next cluster. |
| Position 56–70, impressions up | Weak positive. Hold, re-read at Day 56, publish nothing. |
| Position still ≥ 70 **and** impressions ≤ 18 | Exact coverage was not the constraint. **Stop the content line.** Move to entity and citations — `saytyaratish.uz` holds the knowledge-graph entity for `sayt yaratish`. |
| No row at all | Treat as a measurement fault, not a result — the row existed at Day 0. Re-pull before concluding anything. |

A second, cleaner signal is available because the two phrases below had **no row
at all** at Day 0 and now appear on the page for the first time:

- **`web sayt yaratish`** (260/mo) — 0 occurrences before, 2 after
- **`veb sayt yaratish`** (210/mo) — 1 occurrence before, 3 after

A first-ever impression for either of these is unambiguous evidence that the
text change was read, with no baseline to argue about. Expect it 7–14 days after
recrawl if the mechanism works at all.

Tracker/GSC divergence stays on the record: the 2026-08-23 tracker put this
phrase at 68, Search Console says 75.08. Read positions as a corridor of
roughly 68–82, never as a point.

---

## 5. The other three Uzbek hubs

| Query | URL | Impressions | Position |
| --- | --- | --- | --- |
| `smm xizmatlari` | `/uz/smm-xizmatlari/` | 3 | 39.00 |
| `smm xizmati` | `/uz/smm-xizmatlari/` | 7 | 50.57 |
| `smm xizmati` | `/uz/blog/smm-nima/` | 4 | 86.00 |
| `seo xizmati` | `/uz/seo-xizmati/` | 2 | 23.00 |
| `marketing nima` | `/uz/blog/marketing-nima/` | 4 | 20.25 |
| `smm nima` | `/uz/blog/smm-nima/` | 7 | 41.00 |
| `telegram reklama` | — | none | — |

`smm xizmati` returns **both** `/uz/smm-xizmatlari/` (50.57) and
`/uz/blog/smm-nima/` (86.00). The hub outranks the spoke, so Google is choosing
correctly and no action follows — but this is the pair to watch if the spoke
ever moves ahead.

---

## 6. Index status — URL Inspection, 2026-08-25

All seven release-critical URLs: **verdict PASS, "Submitted and indexed",
robots ALLOWED, indexing ALLOWED, fetch SUCCESSFUL, Google-selected canonical ==
declared canonical, crawled as MOBILE, Breadcrumbs rich result PASS.**

| URL | Last crawl (UTC) |
| --- | --- |
| `/uz/sayt-yaratish/` | 2026-08-25 14:43 |
| `/uz/smm-xizmatlari/` | 2026-08-25 14:45 |
| `/uz/gpt-uzbek-tilida/` | 2026-08-25 14:45 |
| `/uz/seo-xizmati/` | 2026-08-23 14:40 |
| `/uz/telegram-reklama/` | 2026-08-23 14:42 |
| `/uz/blog/smm-nima/` | 2026-08-23 14:38 |
| `/uz/blog/marketing-nima/` | 2026-08-23 01:42 |

Two pages report no `sitemap` member in the inspection payload
(`/uz/smm-xizmatlari/`, `/uz/blog/marketing-nima/`) while both are present in
`sitemap.xml` and indexed. That is a known reporting lag in URL Inspection for
recently added URLs, not a defect — re-check at Day 7 and only investigate if it
persists.

---

## 7. GA4

Property 540129731, `generate_lead`, **channel = all**, 2026-07-01 .. 2026-08-24:
exactly one row — 2 key events, 1 user, host `gptbot.uz`, landing page `/`.

There is no earlier row of any kind. See
`docs/seo/GENERATE_LEAD_HISTORY_2026-08-25.md`.
