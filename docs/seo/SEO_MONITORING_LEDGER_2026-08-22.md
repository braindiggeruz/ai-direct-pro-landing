# SEO monitoring ledger — GPTBot.uz, from 2026-08-22

One row per checkpoint. Each has a SUCCESS, a WARNING and a FAIL so the reading
is decided in advance rather than argued about afterwards.

**Baseline this ledger measures against**

| | |
| --- | --- |
| Production SHA at session start | `241972d` |
| Rank baseline | run `50df03c7`, 2026-08-21 22:05 UTC, 25 keywords, mobile, loc 2860, depth 100 |
| GSC 28 d to 2026-08-19 | Uzbekistan 5 528 impressions / 85 clicks / pos 10.2 · Russia 1 128 / 15 / 31.5 |
| GA4 28 d to 2026-08-21 | 253 organic sessions (prev 42), **0 key events** |
| Referring domains | 8 (3 usable) |
| Fresh pages under hold | `/uz/seo-xizmati/`, `/uz/blog/marketing-nima/`, `/uz/smm-xizmatlari/`, `/uz/telegram-reklama/`, `/uz/blog/smm-nima/` |

**Standing rule for every checkpoint below:** a checkpoint that reads WARNING is
a reason to look again at the next checkpoint, not a reason to edit a page. Only
FAIL authorises changing a page on the hold list.

---

## 2026-08-29 — does the plumbing work

| Check | How | SUCCESS | WARNING | FAIL |
| --- | --- | --- | --- | --- |
| Index status of the two unindexed URLs | `inspect_urls` on `/uz/seo-xizmati/` and `/uz/blog/marketing-nima/` | Both "Submitted and indexed" | One still "Crawled — currently not indexed" | Both still crawled-not-indexed **and** last crawl older than 2026-08-24 |
| GA4 key event | `get_google_analytics_key_events` | `generate_lead` present with count > 0 | Present, count 0 | Still not a key event → owner action not done |
| GA4 custom dimensions | `get_google_analytics_measurement_health` | 5 dimensions registered | 1–4 | 0 |
| Homepage hreflang live | fetch `https://gptbot.uz/` | Only `canonical` + `x-default`; no `hreflang="uz"` | — | `hreflang="uz"` still present → deploy did not land |
| Webvisor socket | Load any page, read console | No `connect-src` violation | — | Violation still logged |
| Homepage lead event | Click contact on `/`, read dataLayer | `generate_lead` fires | — | Does not fire |

## 2026-09-05 — is Google giving the Uzbek layer anything

| Check | How | SUCCESS | WARNING | FAIL |
| --- | --- | --- | --- | --- |
| UZ impressions on the new pages | GSC, dimensions `page`, filter country `uzb`, last 7 days | Any impressions on 2 or more of the three UZ money pages | Impressions on exactly 1 | Zero across all three |
| Query emergence | GSC `query`+`page`, filter to the new URLs | Any commercial Uzbek query appears | Only brand or junk queries | No queries at all |
| Crawl recency | `inspect_urls` | Crawled within the last 7 days | 8–14 days | Not crawled since August |

## 2026-09-15 — the hold decision

This is the checkpoint that ends or extends the observation window. It is the
one carried over from the previous session's falsification condition.

| Check | SUCCESS | WARNING | FAIL |
| --- | --- | --- | --- |
| `/uz/smm-xizmatlari/` and `/uz/telegram-reklama/` UZ impressions | Both non-zero → **hold ends**, the pages may be edited and the mid-page CTA shipped | One non-zero → extend hold to 2026-09-30 | **Both still zero → the Uzbek service thesis is weaker than the position data suggested. Stop adding Uzbek pages and move all effort off-page.** |
| `smm услуги` ownership | `/ru/smm-prodvizhenie-tashkent/` appears for it at any position | Still owned by `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | Neither appears |
| Referring domains | ≥ 12 | 9–11 | Still 8 → citation work has not started |

## 2026-09-21 — first commercial read

| Check | SUCCESS | WARNING | FAIL |
| --- | --- | --- | --- |
| `generate_lead` by service | GA4 Explore, *Service* × key events | Any service shows a non-zero count | Leads exist but `service_slug` is unreportable | Zero leads across 30 days of traffic |
| Locale split of leads | *Locale* dimension | Both `ru` and `uz` present | Only one | — |
| GSC country-filtered movement | Uzbekistan-only average position on the 10 money pages | Improved vs 2026-08-22 | Flat | Worse |
| Citations live | Count of listings from the citation pack | ≥ 4 | 1–3 | 0 |

## 2026-10-06 or later — rank re-run

**Do not run before this date.** One check of the 29-keyword tracker costs about
580 credits, and nothing measurable changes faster than six weeks in this market.

| Check | SUCCESS | WARNING | FAIL |
| --- | --- | --- | --- |
| Tracker `3d4e261b`, compared to run `50df03c7` | `seo xizmati` or `smm xizmatlari` inside top 20 | Inside top 50 | Not in top 100 |
| `таргетированная реклама ташкент` | Better than 12 | 13–17 | Worse than 19 |
| `seo продвижение сайтов` | Better than 20 | 21–26 | Worse than 26 |
| Newly measured keywords | `seo xizmati`, `marketing nima`, `smm услуги`, `реклама в телеграм` all return a position | Some return nothing | All absent |

## 2026-10-21 — 60-day commercial review

| Check | SUCCESS | WARNING | FAIL |
| --- | --- | --- | --- |
| Qualified enquiries from organic | GA4 key events, organic channel | ≥ 5 in 30 days | 1–4 | 0 |
| Referring domains | ≥ 20 | 12–19 | < 12 |
| Google Business Profile | Verified and appearing in the pack for one query | Verified, no pack appearance | Not registered |
| Uzbek money pages | At least one inside top 20 | Top 50 | None ranking |
| **Overall verdict** | Continue the Uzbek-first plan | Continue, but off-page only | Re-open the strategy: the market read was wrong |

---

## Things that must NOT be treated as progress

- **Impressions from Russia or Ukraine.** 1 128 and 559 impressions respectively
  in the last 28 days, against 5 528 from Uzbekistan. A Russian-language page
  climbing on Russian SERPs is not commercial progress for a Tashkent studio.
  Always segment by country before reading a position.
- **Country-averaged GSC positions.** The pricing article reads 4–7 globally and
  29.4 in Uzbekistan. Use the country filter or the rank tracker, never the
  unfiltered average.
- **`telegram_open_attempt` counts.** Those include product-bot clicks. Only
  `generate_lead` is an enquiry.
- **`/ru/internet-reklama-tashkent/` at position 4.9.** Every query behind it is
  below the GSC privacy threshold; there is nothing there to act on.
- **Traffic to the ChatGPT cluster.** It is 2 233 impressions on one article and
  it converts to nothing commercial. It proves Google trusts the domain in Uzbek,
  which is useful context and not a KPI.
