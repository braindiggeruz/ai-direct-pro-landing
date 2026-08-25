# Monitoring plan — commercial growth release, 2026-08-25

Day 0 = **2026-08-25**. Every Search Console figure is filtered to
**country = Uzbekistan**. Baseline: `docs/seo/DAY0_BASELINE_2026-08-25.md`.
Recipe: `docs/seo/COMMERCIAL_KPI_DEFINITIONS_2026-08-25.md`.

**The observation window is the deliverable.** The single most likely way to
waste this release is to publish something else into the measurement interval
and lose the ability to attribute anything. Nothing new ships until Day 28.

## Checkpoints

| Day | Date | Tools | Read | Costs credits |
| --- | --- | --- | --- | --- |
| 7 | 2026-09-01 | GSC only | Has `/uz/sayt-yaratish/` been recrawled? First impression for `web sayt yaratish` or `veb sayt yaratish`? | No |
| 14 | 2026-09-08 | GSC + query→page | Query ownership: which URL Google returns for each of the five webdev phrases. Watch for the hub and a spoke appearing on one query. | No |
| — | 2026-09-06 | Rank tracker, **first run allowed** | The 8 tracked keywords + the 3 to add. Require the run to name unchecked keywords. | **228** |
| 28 | 2026-09-22 | GSC + GA4 + tracker | Full KPI table against Day 0. Commercial impression share vs 3.12%. | 228 |
| 35 | 2026-09-29 | GSC | **Phrase kill rule** — see below | No |
| 42 | 2026-10-06 | GSC + GA4 | **Internal-link kill rule** — see below | No |
| 90 | 2026-11-23 | Everything | Uzbek lane decision | 228 |

**Do not run the rank tracker before 2026-09-06.** Two weeks is not enough for a
signal and each run costs 228 credits. Backlinks: monthly. Do not re-buy keyword
metrics or SERPs before **2026-09-20** — the 2026-08-21..25 research is still
current.

## Keywords to track

Already tracked: `sayt yaratish`, `smm xizmatlari`, `seo xizmati`.

Add on the 2026-09-06 run: **`sayt yaratish xizmati`**, **`web sayt yaratish`**,
**`veb sayt yaratish`**, `sayt yaratish narxi`, `telegram reklama`.

Require the run to report which keywords it could not check. The 2026-08-23 run
returned *"8 keyword(s) could not be checked"* without naming them, which made
its list of absences unusable — `telegram reklama` was reported missing from the
top 100 while Search Console showed the page at position 6.

## Kill rules

### 1. Phrase rule — read at Day 35 (2026-09-29)

Restated, because the audit's version is already satisfied at Day 0.
`sayt yaratish xizmati` had **12 impressions at position 75.08** before this
release. "Does a row appear" therefore proves nothing.

| Reading | Verdict |
| --- | --- |
| Position ≤ 55, **or** impressions ≥ 36 (3× baseline) | Confirmed. Apply exact-phrase coverage to the next cluster. |
| Position 56–70 with impressions up | Weak positive. Hold, re-read Day 56. Publish nothing. |
| Position ≥ 70 **and** impressions ≤ 18 | **Stop the content line.** The constraint is entity/authority, not text. Move to Organization schema, `sameAs` and citations. |
| No row at all | Measurement fault, not a result — re-pull before concluding. |

Cleaner secondary signal: `web sayt yaratish` and `veb sayt yaratish` had **no
Search Console row at Day 0** and now appear on the page for the first time. A
first-ever impression on either is unambiguous — there is no baseline to argue
about.

### 2. Internal-link rule — read at Day 42 (2026-10-06)

One link was added: `/uz/gpt-uzbek-tilida/` → `/uz/sayt-yaratish/`. The other two
the audit proposed already existed.

Fail if, at Day 42, `/uz/sayt-yaratish/` shows no increase in organic sessions
from `/uz/gpt-uzbek-tilida/` **and** no position movement.
Action on fail: **stop treating internal links as a ranking tactic in this
project.** The site's own counter-example already argues this —
`/ru/blog/kak-provesti-audit-digital-marketinga/` ranks #1 for its query and
sends 3 links to `/ru/marketingovyi-audit-tashkent/`, which has 0 impressions in
28 days.

### 3. Uzbek lane rule — read at Day 90 (2026-11-23)

Fail if commercial Uzbek clicks < 10 per 28 days. Action: reduce the Uzbek lane
to maintenance. Baseline: 0 clicks / 40 impressions across the four hubs.

### 4. Offer rule — continuous

Trigger at > 50 commercial organic clicks with 0 `generate_lead`. Action: stop
SEO expansion; the constraint is the offer, not traffic.

### 5. Measurement rule — continuous

If `generate_lead` keeps arriving only from non-organic channels, the attribution
is wrong. Rebuild it before drawing any conclusion.

### 6. Price rule — only once prices exist

If thresholds are published and neither `sayt yaratish xizmati` nor
`smm xizmatlari` improves within 8 weeks, price was not the constraint.

### 7. Content rule — continuous

Any new article with zero impressions after 6 weeks: stop publishing in that
cluster.

## What must not happen during the window

- No new URL. No new article. No rewrite of a money page.
- No change to the AI/ChatGPT cluster.
- No expansion of a frozen Russian page.
- No second rank-tracker run before 2026-09-06.
- No repurchase of keyword or SERP data before 2026-09-20.

## The next justified action

Not "write more content". Wait for the Day-7 read, and in the meantime close the
two owner items that outrank every repository change: the GA4 custom-dimension
registration (~5 minutes, and every unregistered day is permanently unreadable)
and the business-facts form, which unblocks ~1,130 monthly local-pack queries and
11 of 17 directory rows.
