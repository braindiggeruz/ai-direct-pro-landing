# SEO Demand Realignment — release record, 2026-08-01

**Merged main SHA:** `47d704a0d3d516cd5fc753656f6bcd86c566a4bb`
**Deploy this SHA:** `main` HEAD — `47d704a` plus this document. The site output is
identical to the merge commit; the only later change is documentation.
**Feature branch:** `feature/seo-demand-realignment-2026-08` (last commit `b40c49d`)
**Previous production SHA:** `d55edc00e6130ce8fac6107db5638c4b119f7605`
**Deployed:** not yet — see "Outstanding owner action".

---

## What shipped

| Area | Change |
| ---- | ------ |
| New commercial page | `/uz/sayt-yaratish/` targeting `sayt yaratish` (1,300/mo, LOW competition), the largest unclaimed commercial cluster found |
| Consolidation | 3 evidence-backed 301s: `razrabotka-sayta-pod-klyuch` → `razrabotka-saytov-tashkent`, `bot-dlya-obrabotki-zayavok` → `avtomatizatsiya-zayavok`, `gpt-bot-dlya-biznesa` → `ai-bot-dlya-biznesa` |
| Audit correctness | Internal-link graph now spans pages + blog + static routes; broken links and broken hreflang pairs block the build |
| Guardrail | `content/seo/demand-policy.json` — new indexable commercial pages need recorded search volume; the bot-services cluster is frozen |
| Tests | `tests/seo-link-graph.test.ts` (15), `tests/seo-demand-gate.test.ts` (8) |

## Before → after

| Metric | Before | After |
| ------ | -----: | ----: |
| Pages | 114 | 111 |
| Sitemap URLs | 229 | 226 |
| Redirect rules | 9 | 12 |
| Broken internal links (audit) | 110 | 0 |
| Pages flagged "missing hreflang" | 32 | 0 |
| RU/UZ pairs flagged missing | 30 | 0 (29 single-locale, reported not flagged) |
| Orphan pages | 2 | 0 |
| Redirect chains | 1 | 0 |

110 of the "broken links" were false positives — the audit indexed `content/pages/**`
only, so every page → article link counted as broken. 32 of the hreflang flags were
healthy single-locale pages. Both rules were wrong; the underlying content was not.
The one real defect in that set was the new UZ landing shipping as an orphan.

## Verification run on the merged SHA

```
yarn seo:audit   0 critical
tsc -b           exit 0
yarn test        190/190 pass
yarn build       exit 0 — 111 pages + 112 articles prerendered, sitemap 226, _redirects 12
yarn scan:secrets clean (2680 files)
git diff --check clean
```

Scoped ESLint over every changed file is clean. Repository-wide `yarn lint` fails with
74 pre-existing problems in files this release does not touch
(`src/hooks/use-controlled-state.tsx`, `scripts/tech-audit.ts`,
`tests/indexnow-engine.test.ts` and others). That backlog predates this work.

## Outstanding owner action — deploy

`git push origin main` does not trigger a Cloudflare build: the Pages project is
Direct Uploads, not Git-connected (see `docs/CLOUDFLARE_DEPLOY_RUNBOOK.md`).
Confirmed after the push — production still serves the pre-merge tree
(`/uz/sayt-yaratish/` 404, the three merged URLs still 200).

Deploy needs `CLOUDFLARE_API_TOKEN`, which is not present in the release environment:

```bash
git checkout main && git pull
yarn install && yarn build
export CLOUDFLARE_API_TOKEN="<token with Pages:Edit>"
export CLOUDFLARE_ACCOUNT_ID="14ce9e04574f2e6d825e56ee603e5cd5"
./node_modules/.bin/wrangler pages deploy dist \
  --project-name=ai-direct-pro-landing \
  --branch=main \
  --commit-hash="$(git rev-parse HEAD)" \
  --commit-message="SEO demand realignment 2026-08"
```

## Post-deploy canary

Expected results once the deploy lands:

| URL | Expected |
| --- | -------- |
| `https://gptbot.uz/` | 200 |
| `https://gptbot.uz/uz/sayt-yaratish/` | 200, canonical self, hreflang ↔ `/ru/razrabotka-saytov-tashkent/` |
| `https://gptbot.uz/ru/razrabotka-sayta-pod-klyuch/` | 301 → `/ru/razrabotka-saytov-tashkent/` |
| `https://gptbot.uz/ru/bot-dlya-obrabotki-zayavok/` | 301 → `/ru/avtomatizatsiya-zayavok/` |
| `https://gptbot.uz/ru/gpt-bot-dlya-biznesa/` | 301 → `/ru/ai-bot-dlya-biznesa/` |
| `https://gptbot.uz/ru/blog/luchshie-gpt-dlya-biznesa-uzbekistana/` | 301 → `/ru/ai-bot-dlya-biznesa/` (one hop, not two) |
| `https://gptbot.uz/sitemap.xml` | 226 URLs, contains `/uz/sayt-yaratish/`, none of the three merged URLs |
| `https://gptbot.uz/ru/gpt-chat/`, `/ru/gpt-na-russkom/`, `/uz/gpt-uzbek-tilida/` | 200, unchanged — none were touched |
| `https://gptbot.uz/admin-tools/` | `X-Robots-Tag: noindex, nofollow` |
| `https://gptbot.uz/random-test-url-<ts>/` | 404 |
| `POST https://gptbot.uz/api/content` | 401 |

Also confirm the public AI chat, GPTBot Market webhook and Owner Control Center still
respond — none of their code paths were modified by this release
(`git diff d55edc0..47d704a -- apps/ functions/lib/telegram* workers/` is empty apart
from the two audit endpoints).

## Monitoring

Baseline for comparison — Search Console `sc-domain:gptbot.uz`, 2026-01-29 → 2026-07-29:
25 clicks, ~1,400 impressions, average position ~30, 186 URLs with impressions.

Priority URLs to submit and watch:

1. `/uz/sayt-yaratish/` — new, expect first impressions within 1–3 weeks
2. `/ru/razrabotka-saytov-tashkent/` — absorbed the merged page's intent
3. `/uz/gpt-uzbek-tilida/` — position 7.84, 2,900/mo cluster
4. `/ru/gpt-chat/` — position 6.48
5. `/ru/gpt-na-russkom/` — position 4.6

| Checkpoint | What to read |
| ---------- | ------------ |
| Day 0 | Resubmit sitemap; request indexing for the five priority URLs only |
| Day 7 | `/uz/sayt-yaratish/` indexed? Any impressions? Merged URLs dropping out of the index |
| Day 14 | Impressions on the UZ landing; the three merge targets should not have lost position |
| Day 28 | First position reading for `sayt yaratish`; confirm no query-to-page switching returned |
| Day 56 | Clicks, CTR, query expansion on the UZ landing |
| Day 90 | Whether the consolidated RU pages moved at all — if not, the constraint is links, not on-page |

Do not expect fast movement. The site has no domain authority and the RU commercial
SERPs are held by older domains; the honest expectation for this release is index
hygiene plus a new page in a cluster that actually has demand, not a traffic jump.

## Not done in this release

- **C3 / C7 differentiation** (blog outranks its own money page for Instagram Direct and
  beauty salon). Content-rewrite work on pages that currently rank; deliberately not
  bundled with structural changes.
- **C8 investigation** (`/ru/telegram-bot-dlya-biznesa/` page vs blog, both top-6, queries
  anonymised by GSC). Needs a content comparison before any disposition.
- **AI product page tuning** from striking-distance queries. Those pages sit in the top 10;
  changing their titles is worth doing against a snapshot and measuring separately.
- **Backlink verification** for the three merge sources. No backlink source is connected.
  All three had zero clicks across the property's full history, which bounds the risk.

## State confirmed unchanged

- SEO Autopilot: drafts forced to `pending_review` with `manual_approval_required`; no
  auto-publish, no auto-commit, no IndexNow ping from the generator.
- Scheduler: `.github/workflows/seo-autopilot-scheduler.yml` is cron-triggered but the
  endpoint honours a `disabled` schedule mode and returns "skipped".
- n8n: retired; `tests/n8n-retirement.test.ts` and `tests/n8n-dependency-inventory.test.ts`
  still pass.
- Railway: `apps/gpt-backend` is byte-identical across this release, so no rebuild.
- Cloudflare: no automatic deployment; the project remains Direct Uploads.
