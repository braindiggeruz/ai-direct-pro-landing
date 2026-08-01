# SEO growth phase 2 — release and governance record, 2026-08-01

**Governance note:** this repository has no `STATE.json`, `HANDOFF.md`,
`CURRENT_STATE.md`, `DECISIONS.md`, `KNOWN_ISSUES.md` or `TEST_MATRIX`. State is
recorded in dated documents under `docs/`, and that convention is followed here
rather than introducing a parallel doc system. This file is the state, decision,
known-issue, test-matrix and monitoring record for both releases of 2026-08-01.

---

## 1. Deployments

| | Release 1 | Release 2 |
| --- | --- | --- |
| Merge commit | `47d704a` | `6c87ecf` |
| Deployed SHA | `8d27150` | `6c87ecf` |
| Cloudflare deployment | `795070eb` | `4266ee40` |
| Preview URL | `https://795070eb.ai-direct-pro-landing.pages.dev` | `https://4266ee40.ai-direct-pro-landing.pages.dev` |
| Method | `wrangler pages deploy dist --branch=main`, Direct Upload | same |
| Rollback target | `1db2813c` (source `d55edc0`, the pre-release production build) | `795070eb` |
| Canonical aliases | `gptbot.uz`, `www.gptbot.uz` reassigned automatically | same |

Cloudflare authentication used the existing wrangler OAuth session on the account
that owns the project, with `pages (write)` scope. No API token was created,
entered or stored; the previous session's conclusion that a token was required
was wrong — the session was already present.

## 2. Release 1 — demand realignment, what went live

- `/uz/sayt-yaratish/` — 200, 1 H1, 11 H2, self-canonical, reciprocal RU↔UZ
  hreflang plus x-default, Service + FAQPage + BreadcrumbList + WebPage schema,
  `index, follow`, UTF-8 clean, 7 Telegram CTAs.
- Three evidence-backed 301s live and single-hop on the canonical host:
  `razrabotka-sayta-pod-klyuch` → `razrabotka-saytov-tashkent`,
  `bot-dlya-obrabotki-zayavok` → `avtomatizatsiya-zayavok`,
  `gpt-bot-dlya-biznesa` → `ai-bot-dlya-biznesa`.
- `cannib-luchshie-gpt` resolves in one hop to `/ru/ai-bot-dlya-biznesa/`.
- Sitemap 229 → 226 URLs; merged sources absent, `/uz/sayt-yaratish/` present.
- `/ru/razrabotka-saytov-tashkent/` carries the absorbed turnkey section.

## 3. Release 2 — growth sprint, what changed

| Page | Change | Evidence |
| ---- | ------ | -------- |
| `/ru/gpt-chat/` | title, description, secondary keywords | pos 5.25 for `chat gpt uz`, pos 10 for `chatgpt uz` (1,300/mo, LOW) with a title naming neither |
| `/ru/blog/chat-gpt-na-russkom/` | keywords, title, H1 narrowed to how-to | held the money page's head cluster and lost it at pos 74–85 against its pos 4.6 |
| `/ru/instagram-direct-bot/` | commercial framing | C3: article at pos 20.5 vs page at 46.6 on the shared query |
| `/ru/blog/instagram-direct-bot-kak-rabotaet/` | explainer framing, dropped the money page's head term | C3 |
| `/ru/ai-bot-dlya-salona-krasoty/` | commercial framing | C7: article 50.25 vs page 72.67 |
| `/ru/blog/ai-bot-dlya-salona-krasoty-zadachi/` | task framing, keywords narrowed | C7 |
| `/ru/blog/telegram-bot-dlya-biznesa/` | dropped three commercial keywords | C8 |
| `scripts/analytics-snippet.ts` | four SEO funnel events | no funnel events existed on prerendered landings |

No URL, slug or canonical changed. `/uz/gpt-uzbek-tilida/` and
`/ru/gpt-vs-chatgpt-sravnenie/` were deliberately not touched — see
`docs/seo/TOP_PAGE_SNAPSHOTS_2026-08-01.md`.

## 4. Decisions

- **C3, C7, C10 → DIFFERENTIATE.** In each pair the article holds the better
  position, so redirecting it into the money page would discard a position that
  is actually earned. Intent split by title, H1 and keyword ownership instead.
- **C8 → KEEP_DIFFERENT_INTENT.** Identical slug on two paths, both top-6, every
  query anonymised by GSC. Content comparison decided it: Service schema, price
  section and sales CTA on one side; Article schema, Uzbekistan market analysis,
  Telegram Ads and launch pitfalls on the other, sharing one H2 (a summary
  block). Merging would have been a guess.
- **C6 / M1 → KEEP.** Confirmed again from page-level data: the guide earns 17
  impressions at position 10.12 on its own.
- **No paid Open SEO call.** One was budgeted. The only candidate was a backlink
  check on C8, and it was not made because the decision does not depend on it:
  both C8 pages rank top-6, and "keep both" is the safe action whatever the
  backlink profile shows. Spending a credit to confirm a decision already made
  would have been theatre. Credits: 120 before, 120 after.
- **No new Uzbek pages.** `sayt yaratish` and `veb sayt yaratish` are one intent
  and `/uz/sayt-yaratish/` covers both; `internet do'kon yaratish` and
  `landing page yaratish` returned no measurable volume. The demand gate would
  reject a page for either, which is the gate working as designed.
- **`insho yozish` / `referat yozish` — specification only, nothing published.**
  Both have real volume (1,000/mo and 320/mo, LOW). Neither has a product behind
  it today: the AI chat is a general chat, not an essay tool with topic input,
  structure output and a language check. Publishing a page for those queries now
  would be a thin doorway. Requirements are in section 8 below; the page ships
  when the product does.

## 5. Known issues

- **`www` legacy redirects take two hops.** `www.gptbot.uz/<merged-url>` resolves
  301 → apex same path → 301 → target. `content/seo/redirects.json` generates the
  correct direct www rules and `dist/_redirects` orders them before the generic
  `www/*` wildcard, so this is an edge-level rule running ahead of the Pages
  asset layer, not a build defect. It is **pre-existing**: a redirect created on
  2026-07-05 behaves identically. `www` is not the canonical host and carries one
  recorded impression. Apex and `http://` are single-hop.
- **Repository-wide `yarn lint` fails** with 74 pre-existing problems in files
  neither release touches (`src/hooks/use-controlled-state.tsx`,
  `scripts/tech-audit.ts`, `tests/indexnow-engine.test.ts`). Scoped lint over
  every changed file is clean.
- **Backlink exposure for the three merged sources is unverified.** No backlink
  source is connected. All three had zero clicks across the property's full
  history, which bounds the risk.
- **Open SEO has no sitemap-submission or indexing-request tool.** `whoami`,
  `get_search_console_performance` and `inspect_urls` are the read paths; there
  is no write path. The sitemap is live and declared in `robots.txt`, so
  discovery is by crawl.

## 6. Test matrix

| Gate | Command | Result |
| ---- | ------- | ------ |
| SEO audit | `yarn seo:audit` | exit 0 — 111 pages, 0 broken links, 0 orphans, 0 hreflang defects |
| Link graph, redirects, orphans | `yarn test:seo-links` | 15/15 |
| Demand gate | `yarn test:seo-demand` | 8/8 |
| Intent manifest | `yarn test:seo-intent` | 5/5 |
| Analytics privacy | `yarn test:seo-analytics` | 5/5 |
| Canonical + `?lang=` redirects | `yarn test:canonical` | in suite |
| Full suite | `yarn test` | **200/200** |
| Typecheck (root + Functions + shared) | `tsc -b` | exit 0 |
| Scoped lint | `eslint <changed files>` | exit 0 |
| Secret scan | `yarn scan:secrets` | clean, 2,680 files |
| Browser bundle credential scan | grep over `dist/assets/*.js` | clean — the two hits are the string `ADMIN_PASSWORD_HASH` in login help text and the boolean `jwt_secret_configured`, no values |
| Production build | `yarn build` | exit 0 — 111 pages + 112 articles, sitemap 226, `_redirects` 12 |
| Repo hygiene | `git diff --check`, `git fsck` | clean |
| Generated artifacts | — | no `_worker.bundle`, no root `package-lock.json`, `dist/` untracked |

## 7. Production canary — release 2

All 200: `/`, `/uz/sayt-yaratish/`, `/ru/razrabotka-saytov-tashkent/`,
`/ru/gpt-chat/`, `/ru/gpt-na-russkom/`, `/uz/gpt-uzbek-tilida/`,
`/uz/gpt-uzbek-tilida-ai-chat/`, both C3 pages, both C7 pages, both C8 pages,
`/ru/blog/chat-gpt-na-russkom/`, `robots.txt`, `sitemap.xml` (226 URLs).

All three merge sources: 301, single hop, correct target.

Every changed title verified live. All four funnel events present on every
prerendered landing.

Regression: GPT chat `200 {"ok":true,"answer":"2"}` · Telegram webhook `401
forbidden` (fail-closed without the secret) · payments webhook `200
handled=false` · admin API `401` · `/admin-tools/` `X-Robots-Tag: noindex,
nofollow` · unknown URL `404`.

## 8. Specification — essay and referat product page (not published)

Ships only when a visitor can, on the page itself: enter a topic; get a
structure; get a draft; edit it; run a language check; open the AI chat with that
context preserved. Until then there is no product to describe and the page would
be thin.

Mandatory framing when it does ship: the user verifies every fact; the AI drafts
and explains rather than guaranteeing an academic result; no wording that
encourages deceiving an instructor; institution rules take precedence.

Target keywords once the product exists: `insho yozish` (1,000/mo, LOW),
`referat yozish` (320/mo, LOW). Both must be added to
`content/seo/demand-policy.json` before the page can pass the build gate.

## 9. GSC Day 0 — 2026-08-01, after release 1

Property `sc-domain:gptbot.uz`. Baseline window 2026-07-01 → 2026-07-29:
171 URLs with impressions.

| URL | Index state | Impr (28d) | Clicks | Pos |
| --- | ----------- | ---------: | -----: | --: |
| `/uz/sayt-yaratish/` | URL is unknown to Google | — | — | — |
| `/ru/razrabotka-saytov-tashkent/` | Submitted and indexed, crawled 2026-07-31 | 56 | 0 | 77.18 |
| `/uz/gpt-uzbek-tilida/` | Submitted and indexed | 31 | 1 | 7.84 |
| `/ru/gpt-chat/` | Submitted and indexed | 50 | 1 | 6.48 |
| `/ru/gpt-na-russkom/` | Submitted and indexed | 5 | 0 | 4.60 |
| `/ru/gpt-bot-dlya-biznesa/` (now 301) | still indexed, crawled 2026-08-01 | 5 | 0 | 11.80 |

Google-selected canonical equals the declared canonical on every indexed URL;
Breadcrumbs rich result PASS on all of them. `/uz/sayt-yaratish/` being unknown
at Day 0 is expected — it did not exist in production until today.

## 10. Monitoring

Segments: UZ commercial · RU commercial · UZ AI product · RU AI product ·
redirected sources · consolidated targets.

| Checkpoint | What to read |
| ---------- | ------------ |
| Day 7 | Is `/uz/sayt-yaratish/` indexed? First impressions? Merged URLs starting to drop out |
| Day 14 | Impressions on the UZ landing; the three merge targets must not have lost position; `/ru/gpt-chat/` CTR on `chat gpt uz` |
| Day 28 | First position reading for `sayt yaratish`; C3/C7 pairs — has the article kept its lead and the money page moved on commercial queries |
| Day 56 | Clicks, CTR, query expansion on the UZ landing; whether `service_cta_click` and `telegram_open_attempt` show a funnel |
| Day 90 | Whether the consolidated RU pages moved at all — if not, the constraint is links, and the authority package is the answer |

Metrics per checkpoint: impressions, clicks, CTR, position, new queries, lost
queries, query-to-page switching, index state, CTA events, leads.

No growth at Day 7 is not a failure. The site has no domain authority and the RU
commercial SERPs are held by older domains.

## 11. Operational invariants — verified today

- SEO Autopilot forces `pending_review` with `manual_approval_required`; no
  auto-publish, no auto-commit, no IndexNow ping from the generator.
- Scheduler: the endpoint honours a `disabled` schedule mode.
- n8n: retired. `/api/n8n/ingest` has no route in the codebase; the n8n
  retirement tests still pass.
- Railway: `apps/gpt-backend` is byte-identical across both releases, so no
  rebuild was triggered. Auto-deploy remains paused per the owner kit's freeze
  record.
- Cloudflare: no automatic deployment. Verified empirically — after the release-1
  push, production still served the pre-merge tree until `wrangler` was run.

## 12. Next action

GSC monitoring at Day 7, Day 14 and Day 28, and human execution of the P0 items
in `docs/seo/AUTHORITY_PACKAGE_2026-08.md` — the six directory and partner
listings that need no gatekeeper.
