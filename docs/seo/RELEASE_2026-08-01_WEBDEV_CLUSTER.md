# Website-development cluster — release record, 2026-08-01

Third release of the day. Evidence and rejected topics: `WEBDEV_CLUSTER_MAP_2026-08-01.md`.
Paid-call reasoning: `PAID_CALL_JUSTIFICATION_2026-08-01.md`.

## Deployment

| | Value |
| --- | --- |
| Merge commit | `d98d485` |
| Deployed SHA | main HEAD (see below) |
| Cloudflare deployment | `5b03c391` |
| Previous deployment (rollback) | `727f2e0b` (source `849c0f4`) |
| Method | `wrangler pages deploy dist --branch=main`, Direct Upload, existing OAuth session |

Earlier deployments today: `795070eb` (`8d27150`), `4266ee40` (`6c87ecf`), `727f2e0b` (`849c0f4`).

## What shipped

Two Uzbek articles, zero Russian articles, one hub strengthened.

| URL | Target intent | Measured volume |
| --- | ------------- | --------------: |
| `/uz/blog/sayt-yaratish-narxi-nimaga-bogliq/` | what drives the price of a website | `sayt yaratish narxi` 50/mo |
| `/uz/blog/bepul-sayt-yaratish-yoki-buyurtma/` | free builder versus a commissioned site | `bepul sayt yaratish` 70/mo, 100/mo with variants |

`/uz/sayt-yaratish/` gained `web sayt yaratish` (260/mo — higher than the `veb`
spelling it already declared), `sayt ochish`, `sayt tuzish`, a "Buyurtma berishdan
oldin" block linking both guides, and two FAQ entries absorbing the `uz domenida
sayt ochish` and free-builder-migration questions without spending a URL on either.

`/ru/blog/pochemu-sayt-ne-prinosit-zayavki/` stopped declaring
`разработка сайтов в Ташкенте` — the hub's head term, which the new cluster test
caught.

## Why so few pages

The brief allowed up to four articles per language. Four Russian topics were
proposed; **four already exist**, are already hub-and-spoke linked, and earn **zero
impressions between them over six months**. A fifth would have joined them.

On the Uzbek side the paid keyword expansion returned volume for exactly two
supporting intents. The other six proposed Uzbek topics — Tashkent ordering,
timelines, contractor choice, project prep, site types, common mistakes — returned
no volume at all. Publishing them would have been the pattern the demand policy was
built to stop.

`Toshkentda sayt buyurtma qilish` was conditioned on Open SEO confirming relevance.
It did not, so it was not added anywhere.

## Cluster shape

```
/uz/sayt-yaratish/  (hub, commercial)
  ├─ /uz/blog/sayt-yaratish-narxi-nimaga-bogliq/     price formation
  └─ /uz/blog/bepul-sayt-yaratish-yoki-buyurtma/     free vs commissioned
       (spokes link to each other and back to the hub)

/ru/razrabotka-saytov-tashkent/  (hub, commercial) — unchanged
  ├─ /ru/blog/skolko-stoit-razrabotka-sayta-v-tashkente/
  ├─ /ru/blog/kak-vybrat-razrabotchika-sayta-v-tashkente/
  ├─ /ru/blog/lending-korporativnyy-sayt-ili-internet-magazin/
  └─ /ru/blog/pochemu-sayt-ne-prinosit-zayavki/
```

Hub anchors are varied by design and the variation is enforced: no single anchor may
exceed 60% of the links pointing at a hub.

## Gates

| Gate | Command | Result |
| ---- | ------- | ------ |
| SEO audit | `yarn seo:audit` | exit 0 — 111 pages, 0 broken links, 0 orphans, 0 hreflang defects |
| Cluster quality | `yarn test:seo-cluster` | 11/11 |
| Link graph | `yarn test:seo-links` | in suite |
| Demand gate | `yarn test:seo-demand` | in suite |
| Intent manifest | `yarn test:seo-intent` | in suite |
| Analytics privacy | `yarn test:seo-analytics` | in suite |
| Full suite | `yarn test` | **211/211** |
| Typecheck | `tsc -b` | exit 0 |
| Scoped lint | `eslint <changed files>` | exit 0 |
| Secret scan | `yarn scan:secrets` | clean |
| Build | `yarn build` | exit 0 — 111 pages + 114 articles, sitemap 228 |
| Repo hygiene | `git diff --check`, `git fsck` | clean |

Sitemap 226 → 228. No root `package-lock.json`, no `_worker.bundle`, `dist/` untracked.

Repository-wide `yarn lint` still fails on the same 74 pre-existing problems in files
this release does not touch.

## Uzbek copy review

Written directly in Uzbek, not translated. U+2018 apostrophes throughout, verified in
the built HTML (`ascii apostrophe in uz words: false`). Head term used where natural;
elsewhere `veb sayt`, `biznes sayti`, `korporativ sayt`, `internet do‘kon`,
`loyiha narxi`, `smeta`, `texnik topshiriq`, `qo‘llab-quvvatlash`. No Russian calques.
No mojibake in production.

## No invented data

Neither article quotes a price. The pricing article explains what moves the number —
unique layouts, catalogue, payment, integrations, who supplies content, language
versions, support — and gives an eight-question list for comparing two quotes
honestly. A test asserts no currency figure appears in either article.

No fabricated clients, cases, reviews, statistics or ranking guarantees.

## Production canary

All 200: `/`, both hubs, both new articles, two existing Russian spokes, `/uz/blog/`,
`robots.txt`, `sitemap.xml` (228 URLs, both articles present, all three merged URLs
still absent).

Per article: 1 H1, self-canonical, Article + BreadcrumbList + FAQPage schema, hub link
present, Telegram CTA present, `index, follow`, no mojibake, Uzbek apostrophes intact,
`seo_article_view` and `seo_money_page_click` emitted.

Regression: GPT chat `200 {"answer":"6"}` · Telegram webhook `401` · payments webhook
`200 handled=false` · admin API `401` · unknown URL `404`.

## GSC Day 0 — 2026-08-01

| URL | Index state |
| --- | ----------- |
| `/uz/blog/sayt-yaratish-narxi-nimaga-bogliq/` | URL is unknown to Google |
| `/uz/blog/bepul-sayt-yaratish-yoki-buyurtma/` | URL is unknown to Google |
| `/uz/sayt-yaratish/` | URL is unknown to Google |
| `/ru/razrabotka-saytov-tashkent/` | Submitted and indexed, crawled 2026-07-31, Breadcrumbs PASS |

All three Uzbek URLs are hours old. Unknown is the expected Day 0 state, not a defect.

## Monitoring

Segments: UZ commercial cluster · UZ supporting content · RU commercial cluster ·
RU supporting content.

| Checkpoint | What to read |
| ---------- | ------------ |
| Day 7 | Are the two Uzbek articles indexed? Is `/uz/sayt-yaratish/` indexed? |
| Day 14 | First impressions on `sayt yaratish narxi` and `bepul sayt yaratish`; hub impressions |
| Day 28 | Position for the hub on `sayt yaratish`; whether the spokes send `seo_money_page_click` |
| Day 56 | Clicks and CTR on the cluster; query expansion beyond the two seed intents |
| Day 90 | Whether the Russian cluster moved at all — if it still earns zero, the constraint is links, not content |

Per checkpoint: impressions, clicks, CTR, average position, new queries,
query-to-page mapping, cannibalisation between hub and spokes, money-page clicks,
Telegram CTA events.

## Risks

- **Two Uzbek articles are a small bet.** Combined measured demand is ~150/mo. That is
  the honest size of the opportunity, not a shortfall in the work.
- **`bepul sayt yaratish` attracts non-buyers by definition.** The article is written to
  be useful to them anyway and to convert only the subset with a real business need.
  If it draws traffic with no `seo_money_page_click`, that is informative, not a
  failure — treat it as evidence about the intent, not a reason to rewrite the page.
- **Credits are effectively exhausted: 4 remain.** No further paid keyword work is
  possible until the balance is topped up. Everything left runs on GSC, which is free.
- **`sayit yaratish` (1,300/mo) is a close-variant grouping of the head term**, not a
  separate query. It must never receive its own page.

## Credits

120 before → **4 after**. One `research_keywords` call, seed `sayt yaratish`,
location 2860, ~116 credits. Uzbekistan is billed at a flat rate per seed, so one seed
was the entire affordable budget — and it returned the 26 keywords that decided every
create/reject call in this release.

## Next action

GSC monitoring at Day 7, Day 14 and Day 28. In parallel, the P0 items in
`AUTHORITY_PACKAGE_2026-08.md` — the six directory and partner listings that need no
gatekeeper. The Russian cluster's zero-impression record over six months is a link
problem, and no amount of further content will change it.
