# Uzbek website-authority sprint — release record, 2026-08-01

Fourth release of the day. Evidence, inventory and rejected topics:
`UZ_AUTHORITY_SPRINT_2026-08-01.md`.

## Deployment

| | Value |
| --- | --- |
| Merge commit | `a542052` |
| Deployed source | `a542052` (exact merged main) |
| Cloudflare deployment | `af73edd9-1c90-418d-83d7-c79d81ae2888` |
| Previous deployment (rollback) | `4bf46cc6` (source `dd631b4`) |
| Method | `wrangler pages deploy dist --branch=main`, Direct Upload, existing OAuth session |
| Files uploaded | 17 new (663 already present) |

`wrangler pages deployment list` shows exactly one new Production deployment for
this push. No second deployment appeared, so Cloudflare's Git integration did
not fire — automatic deployment remains off.

## What shipped

Four Uzbek articles, one hub strengthened, seven contextual link sources, eight
new quality gates. **No new commercial page.**

| URL | Owns |
| --- | ---- |
| `/uz/blog/sayt-buyurtma-qilishdan-oldin-nimalar-kerak/` | what to prepare before commissioning |
| `/uz/blog/biznes-uchun-qanday-sayt-kerak/` | choosing landing / corporate / catalogue / shop |
| `/uz/blog/domen-va-hosting-qanday-tanlanadi/` | domain and hosting, and who must own them |
| `/uz/blog/biznes-sayti-koproq-ariza-olishi-uchun/` | why an existing site produces no enquiries |

Rejected: development process, launch checklist, technical brief — the first
belongs to the hub's own `#jarayon` section, the other two are contained in the
preparation guide.

## Why these four have no volume behind them

The paid research earlier today measured six candidate topics at no volume, and
these four sit among them. They ship anyway, as blog articles rather than
commercial pages, because they answer distinct pre-purchase questions and route
authority to the hub. The demand gate exempts blog articles by design
(`scope.pageTypes = ["money", "niche"]`); it was not bypassed.

This is recorded so nobody later reads them as a demand bet. If they earn no
impressions by Day 56, the conclusion is that the Uzbek long-tail is thin — not
that they need to be longer.

## Hub

- 133 ASCII apostrophes corrected to `o‘`/`g‘` (U+2018) and `’` (U+2019). The
  hub's own spokes were already correct, so the hub was the outlier and the
  error rendered visibly. Built HTML now reports 0 ASCII apostrophes.
- New `Sayt buyurtma qilishdan oldin o‘qing` section linking all six spokes,
  plus a TOC entry.
- Two FAQ entries added (what is needed to start; Telegram/CRM integration),
  taking the visible FAQ to 14.
- Structure, schema, offer and CTA unchanged. Verified by an apostrophe-blind
  semantic diff against `origin/main`: no value changed in substance, nothing
  removed.

## Internal link graph

22 links now target `/uz/sayt-yaratish/` across 15 distinct anchors. Largest is
the exact head term at 3 of 22 (**13.6%**) against a 60% test ceiling.

Seven existing Uzbek pages gained one contextual link each. Eighteen vertical
bot pages, the GPT product pages and the legal pages deliberately did not — a
link from every Uzbek page is the sitewide pattern the anchor test exists to
catch.

## Gates

| Gate | Command | Result |
| ---- | ------- | ------ |
| SEO audit | `tsx scripts/seo-audit.ts` | exit 0 — 111 pages, 0 broken links, 0 orphans, 0 hreflang defects |
| Cluster quality | `test tests/seo-cluster-quality.test.ts` | **19/19** (was 11) |
| Full suite | `node --test` (15 files) | **219/219** (was 211) |
| Typecheck | `tsc -b` | exit 0 |
| Scoped lint | `eslint tests/seo-cluster-quality.test.ts` | exit 0 |
| Secret scan | `tsx scripts/scan-secrets.ts` | clean, 2699 files |
| Build | vite + prerender chain | 111 pages + 118 articles, sitemap **232** |
| Repo hygiene | `git diff --check`, `git fsck` | clean |

Sitemap 228 → 232. Repository-wide `eslint .` still fails on the same 74
pre-existing problems in files this release does not touch.

`yarn` is not installed on this host; every command above was run through the
local `node_modules/.bin` binaries, which is why the commands differ from
earlier release records.

## New quality gates

Eight, each from a defect found or a claim the brief required proving:
Uzbek apostrophes · mojibake · unhedged ranking promises · head-term stuffing
density · no Review/AggregateRating/Offer schema · hub carries
Service+FAQPage+BreadcrumbList with ≥4 visible questions · every spoke has a
conversion path · titles and descriptions unique within a cluster.

The mojibake gate was mutation-tested: clean Uzbek text is not flagged,
`doâ€˜kon` is.

## Production canary

All seven cluster URLs 200 with 1 H1, self-canonical, correct schema, hub link,
Telegram CTA, `index, follow`, **0 ASCII apostrophes, 0 mojibake**. All seven
contextual link sources 200 and rendering the hub link. `sitemap.xml` 200 with
232 entries including all seven; `robots.txt` 200 and not disallowing.

Regression: GPT chat `200 {"answer":"6"}` · Telegram webhook `401 forbidden` ·
payments webhook `200 handled=false provider_not_configured` · Owner Control
Center `401 Missing token` · `/api/auth/me` `401` · unknown URL `404` with no
stack leakage.

## GSC Day 0 — 2026-08-01

| URL | Coverage |
| --- | -------- |
| `/uz/sayt-yaratish/` | **Crawled – currently not indexed**, crawled 12:19 UTC, robots ALLOWED, fetch SUCCESSFUL, mobile |
| `/uz/blog/sayt-yaratish-narxi-nimaga-bogliq/` | URL is unknown to Google |
| `/uz/blog/bepul-sayt-yaratish-yoki-buyurtma/` | URL is unknown to Google |
| all four new articles | URL is unknown to Google |
| `/uz/arizalarni-avtomatlashtirish/` | Submitted and indexed, Breadcrumbs PASS |

The hub moved from "unknown" to "crawled" within hours — Google has fetched it
successfully and is deciding. "Crawled – currently not indexed" on a page this
new is normal, but it is the single most important thing to re-read at Day 7:
if it persists past Day 28 the cause is site-level authority, not this page.

Open SEO exposes no sitemap-submission or indexing-request tool, so **nothing
was submitted to Google**. The URLs are in `sitemap.xml` and will be discovered.

## Credits

4 before, **4 after**. Zero paid calls. Free tools used: `whoami`,
`get_search_console_performance` (×3), `inspect_urls` (×1).

## Operational state

- Railway: not touched, not contacted.
- Cloudflare automatic deployment: off — one manual deployment, no second entry.
- Automation Worker (`gptbot-automation`, 15-min cron): **not deployed** by this
  release. Only Cloudflare Pages was deployed. Its config is unchanged.
- SEO Autopilot scheduler: unchanged. The GitHub workflow trigger
  (`0 9 * * 1,4`) exists as before; the effective mode lives server-side in the
  `system_settings` D1 table and was neither read nor written here.
- n8n: no n8n path was modified, called or deployed.
- Auto-publication: unchanged; nothing reached `content/` except by hand.

## Monitoring

| Checkpoint | What to read |
| ---------- | ------------ |
| Day 7 | Is the hub still "crawled, not indexed"? Are the four articles discovered? |
| Day 14 | First impressions on the hub for `sayt yaratish`; any query at all on the four guides |
| Day 28 | Hub position on the head cluster. If still unindexed, the constraint is authority — stop adding content |
| Day 56 | Whether the four no-volume guides earn any impressions; `seo_money_page_click` from spokes |
| Day 90 | Whether the Russian cluster moved at all — six months at zero already says links, not content |

## Risks and limits

- **The four new guides have no measured demand.** Stated plainly above.
- **The hub is crawled but not indexed.** Expected at this age; a genuine
  problem if it persists past Day 28.
- **~100 further Uzbek files still carry ASCII apostrophes**, some with 200+
  occurrences. Correct to fix, but a large unrelated diff; deliberately left for
  its own change. The new cluster gate prevents regression inside the cluster.
- **Credits exhausted at 4.** No further paid keyword work is possible.
- The site still has no backlink profile. `AUTHORITY_PACKAGE_2026-08.md` P0 —
  the six directory and partner listings needing no gatekeeper — remains the
  highest-value action available and no amount of further content substitutes.
