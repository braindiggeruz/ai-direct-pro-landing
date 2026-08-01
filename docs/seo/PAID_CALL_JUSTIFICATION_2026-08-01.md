# Paid Open SEO call — justification, 2026-08-01

Recorded before the call, per the credit policy.

## The question

Which Uzbek web-development *supporting* intents have measurable search volume in
Uzbekistan — pricing, timelines, site types, contractor selection, project prep?

## Why Search Console cannot answer it

`/uz/sayt-yaratish/` went live in production today. Search Console reports it as
"URL is unknown to Google". The property contains **no Uzbek web-development query
at all** across its full history (data begins 2026-05-21). There is nothing to read.

## Why the repository cannot answer it

The Uzbek blog has 31 articles and every one is about bots, AI chat or messengers.
There is no Uzbek web-development supporting content and therefore no internal
evidence about which sub-intents matter.

## What the answer changes

- Whether 0, 1, 2, 3 or 4 Uzbek supporting articles get written. Without volumes I
  would be guessing, and guessing is what produced ~140 pages for a cluster
  measuring ~80 searches a month.
- `content/seo/demand-policy.json` requires a recorded volume before a new
  indexable commercial page can pass the build gate. Any keyword I cannot measure
  cannot ship as a page.

## Budget

Balance before: **120 credits.** Uzbekistan is served from Google Ads data at a flat
~96 credits per seed, so exactly **one seed** is affordable. Two would cost ~192 and
fail.

Seed chosen: **`sayt yaratish`** — the cluster head. Its related-keyword expansion
covers the whole decision space in a single call (`narxi`, `toshkent`, `veb sayt`,
`internet do'kon`, `landing`, `buyurtma`), which no other single seed does.
`resultLimit` raised to 300; that widens coverage without adding seed cost.
`includeClickstreamData` left off — it doubles the cost and has no effect for
countries served from Google Ads data.

## Decision rule fixed in advance

- Sub-intent with recorded volume and an intent distinct from the money page →
  write one article, add the keyword to `demand-policy.json`.
- Sub-intent with no recorded volume → no article. Fold the answer into the money
  page's FAQ instead, where it costs nothing and cannibalises nothing.
- No Russian article either way: the Russian supporting cluster already exists
  (4 articles, hub-and-spoke linked) and earns zero impressions in six months.
