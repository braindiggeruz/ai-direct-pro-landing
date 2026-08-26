# Release — commercial growth, 2026-08-25

Branch `seo/commercial-growth-2026-08-25b`, 9 commits on top of `b0a83ff`.
Merge to `main` is a **fast-forward** — the branch is 8/9 ahead and 0 behind
`origin/main`, so no conflict is possible.

**Status: merged, pushed and DEPLOYED on 2026-08-26.**

| | |
| --- | --- |
| Deployment id | `63c0aff2-9371-41ac-b831-2189b3e61a58` |
| Immutable URL | `https://63c0aff2.ai-direct-pro-landing.pages.dev` |
| Source SHA | `3a8bf71582ca9b9a50571c9e488dd00b5b4a3ebc` |
| Rollback target | `84a1f131-7b76-4629-8a7a-17aae1a192cb` (source `ce01c0d`) |
| Built with | `npm run build:cf` from a clean tree |
| Production canary | **PASSED** |

Deployed from `3a8bf71`, not from `main` (`36b4ac5`). That tree is a **superset**
of `main`: it contains every SEO commit plus the live Lead Radar tree `ce01c0d`,
so the release ships without rolling Lead Radar back. `main` remains the SEO
lineage; the drift closes when Lead Radar lands on `main`.

`npm run build` was **not** enough: it omits `apps/bormi-admin`, so `dist/admin`
was missing and deploying that artifact would have removed the Owner Control
Center and the Lead Radar admin UI from production. `build:cf` is the only
correct build for a Pages deploy here.

Production canary against `https://gptbot.uz`: all seven release URLs HTTP 200
with one H1, no duplicate H2, self-canonical, `index, follow`, JSON-LD present,
correct hreflang, clean Uzbek apostrophes and present in the live sitemap.
`sayt yaratish xizmati` 0 → **4**, `web sayt yaratish` 0 → **2**,
`veb sayt yaratish` 1 → **3**, head-term density 0.82%. Regression surfaces
unchanged: `/`, `/ru/gpt-chat/`, `/uz/`, `/ru/sotuvchi/`, `/uz/sotuvchi/`,
`/ru/razrabotka-saytov-tashkent/`, `/ru/seo-prodvizhenie-saytov-tashkent/` all
200; unknown URL 404; `/admin/lead-radar` 302 (auth boundary intact);
`/api/telegram/agents` 405 on GET.

### Rollback

```bash
node_modules/.bin/wrangler pages deployment list --project-name ai-direct-pro-landing
# then promote 84a1f131-7b76-4629-8a7a-17aae1a192cb from the Cloudflare dashboard
```

---

### Earlier status, kept for the record

`origin/main` moved `b0a83ff -> 36b4ac5` on 2026-08-26 as a **fast-forward** —
no merge commit, no conflict, nothing rewritten. `origin/seo/commercial-growth-2026-08-25b`
points at the same commit. The push did **not** trigger a deploy, which
confirms Cloudflare Git auto-deploy is still disabled: production continued
serving the Lead Radar build after the push.

Deployment remains blocked on `wrangler login`. See "Blocked" below.

## Live state at the start, which the audit got wrong

The audit states `Продакшн 78ddd6a = origin/main`. Neither half was true by the
time this sprint ran:

| | Actual on 2026-08-25 |
| --- | --- |
| `origin/main` | `b0a83ff` — two commits past the audit's SHA |
| Production deployment | `3f5760f0`, built from **`3526be2`** |
| `3526be2` | tip of `codex/lead-radar-mvp-20260824`, **6 commits unpushed**, contains `b0eeaac` but **not** `b0a83ff` |

So production is running code that exists only on one machine, `origin/main` has
never been deployed, and the audit's "no production changes" is wrong — `b0eeaac`
had already shipped the `veb-yondashuv` and `tayyorgarlik` sections of
`/uz/sayt-yaratish/` before the audit was written.

Confirmed by content, not by trusting the deployment list: `sitemap.xml` on
`gptbot.uz` still contains `/ru/gpt-na-russkom-kak-zadavat-zaprosy/`, which
`b0a83ff` deletes. The `b0a83ff` build has 0 occurrences of it; the live one and
the `3526be2` build both have 1.

That unpushed work was backed up outside git before anything was touched:
`F:\Claude\gptbot-seo-wip-backups\20260825-143308-commercial-growth\`
(status, HEAD, both diffs, untracked manifest and files, `format-patch` of all
6 unpushed commits, SHA-256 manifest).

## What shipped in this branch

| Commit | What |
| --- | --- |
| `7c23b8d` | `/uz/sayt-yaratish/` says the three phrases the manifest already claimed |
| `2d6b01c` | `telegram-uz` cluster registered; anchor concentration 77% → 46% |
| `1116c33` | `demand-policy.json` geo volume corrected 390 → 110 |
| `9d81c3b` | the one missing contextual link, `/uz/gpt-uzbek-tilida/` → `/uz/sayt-yaratish/` |
| `8bf0c24` | page renderer stops emitting one-member hreflang sets |
| `a731f22` | `generate_lead` and `telegram_open_attempt` carry all six commercial dimensions |
| `f9af3a7` | build-wide content integrity gates over all 255 indexable documents |
| `df0bafa` | KPI definitions, Day-0 baseline, lead history, directory ledger, monitoring plan |
| `791a50c` | same hreflang rule applied to the blog renderer |

New URLs: **0**. AI-cluster pages changed: **1** (`/uz/gpt-uzbek-tilida/`, one
contextual link added — the audit's own link test 3). Frozen Russian pages
changed: **0**. Marketplace / Functions code changed: **0**.

## Verification

| Gate | Result |
| --- | --- |
| `tsc -b` | clean |
| `tsc -p tsconfig.node.json` | clean |
| `tsc -p tsconfig.functions.json` | 5 errors, all in `functions/agents/sotuvchi/classifieds/service.ts` — **identical count with the branch stashed**, pre-existing and out of scope |
| `eslint .` | clean, repo-wide |
| `npm test` | 321/321 |
| SEO gate set (11 files) | 123/123 |
| `npm run seo:audit` | 120 pages, 0 critical, RU/UZ pairs 44 OK / 0 broken |
| `npm run build` | 120 pages + 135 articles, sitemap 258 entries (unchanged) |
| `npm run scan:secrets` | clean, 3,378 files |
| `git diff --check`, `git fsck --full` | clean |
| Canary on the built artifact | all checks pass, 7 URLs + 5 regression surfaces |

One failure was seen and explained rather than worked around:
`tests/gpt-chat-prerender-links.test.ts` failed against a `dist/` built at 08:10,
before `b0a83ff`. It passes after a rebuild. The test only asserts when a build
is present, which is why a stale artifact can fail it.

## Blocked

**Push — resolved on 2026-08-26, but the underlying fault is still there.**
`git push` was returning
`Permission to braindiggeruz/ai-direct-pro-landing.git denied to cakecityuz-lab`:
the Windows Credential Manager serves a token for the wrong account, and
`gh auth status` reports the `braindiggeruz` keyring token invalid. The push was
completed with a one-shot credential helper reading an owner-supplied token from
a file outside the repository; the file and the helper were deleted immediately
afterwards and nothing was written to any git config. **Both faults remain** —
the next push will fail the same way until `gh auth login -h github.com` is run
with a token carrying the `read:org` scope, or the stale `cakecityuz-lab` entry
is removed from Credential Manager.

**Deploy.** `wrangler whoami` succeeded early in this session and returned
`not authenticated` later — the OAuth session was invalidated mid-run. Owner
action: `wrangler login`.

### Update, 2026-08-26 — the Lead Radar release landed, and the integration is verified

Production has since been redeployed from `ce01c0d`, the tip of
`codex/lead-radar-mvp-20260824`, which **contains `b0a83ff`**: the live sitemap no
longer lists `/ru/gpt-na-russkom-kak-zadavat-zaprosy/`, so the indexation-recovery
work is finally serving. That branch is now clean, 10 commits ahead of
`origin/main` and 0 behind — but still unpushed, so `origin/main` remains
`b0a83ff` and production still runs code that exists only on this machine.

The two branches were checked against each other rather than assumed compatible:

- `git merge-tree --write-tree` produces a tree with **zero conflicts**.
- The two commit ranges touch **entirely disjoint file sets** — no single file is
  modified by both. The SEO release cannot affect Lead Radar and Lead Radar
  cannot affect the SEO release.
- The merge was built and gated end to end on `c9dca96`:
  `tsc -b` clean, `npm run build` 258 sitemap entries, `npm test` **346/346**,
  the 11-file SEO gate set **123/123**, the 17 Lead Radar test files **79/79**,
  `seo:audit` 0 critical with 44/0 hreflang pairs, `scan:secrets` clean across
  3,459 files, `eslint .` clean, and the built-artifact canary passing on all
  7 release URLs plus 5 regression surfaces.
- The merged `wrangler.toml` carries **all 14 `LEAD_RADAR_*` variables**, so a
  deploy from this tree does not strip the live configuration.

`c9dca96` is therefore a validated deploy candidate. It is a local validation
artifact, not an authored merge of somebody else's release: no Lead Radar file
was edited, and the branch is unpushed.

**And a decision that is not the repository's to make.** Deploying `main` with
`wrangler pages deploy` would roll production back off `3526be2`. That removes
the Lead Radar code now live, and — because `wrangler pages deploy` replaces the
project's plain-text variables with whatever `wrangler.toml` declares — it would
also delete eight live vars: `LEAD_RADAR_ADMISSION_ENABLED`,
`LEAD_RADAR_PROCESSING_ENABLED`, `LEAD_RADAR_CONTACT_ENABLED`,
`LEAD_RADAR_PERSONAL_RETENTION_DAYS`, `LEAD_RADAR_ALLOWED_ORGS`,
`LEAD_RADAR_MAX_DISPATCH_PER_TICK`, `LEAD_RADAR_TELEGRAM_BOT_USERNAME`,
`LEAD_RADAR_CONTACT_DAILY_LIMIT`. Their absence fails closed rather than open, so
nothing becomes permissive — but the feature stops working.

A second session was committing to that branch while this one ran (`2bb7fbc`,
plus 10 modified files). Integrating it here would mean merging another
engineer's in-flight work without them.

Now that `origin/main` is `36b4ac5`, the remaining options are:

1. **The Lead Radar author merges `main` into `codex/lead-radar-mvp-20260824`,
   pushes it, lands it on `main`, and deploys `main` once.** The drift closes
   permanently and nothing regresses. This is the right end state and it is
   their call, not this release's.
2. **Deploy the validated integration `00863ed`.** It contains `36b4ac5` and the
   live Lead Radar tree `ce01c0d`, and is already built into `dist/` and gated.
   Ships the SEO change without regressing anything, but leaves production on a
   SHA that is not `main` for one more release.
3. **Deploy `main` (`36b4ac5`) alone.** Ships the SEO change and rolls Lead Radar
   off production, stripping its 14 `wrangler.toml` variables. **Do not do this.**

### Exact commands, once `wrangler login` has been run

```bash
# record the rollback target FIRST
node_modules/.bin/wrangler pages deployment list --project-name ai-direct-pro-landing

# option 2 — deploy the validated integration from a clean tree
git checkout tmp/seo-lead-radar-integration
npm run build:cf
node_modules/.bin/wrangler pages deploy dist \
  --project-name ai-direct-pro-landing \
  --branch main \
  --commit-hash 00863ed3a6c5865d72182838a3b2d412c11301d5
```

Deploy only from a clean tree, and write the returned deployment id and its
immutable `*.pages.dev` URL down next to the source SHA.

After the deploy, the canary is
`scratchpad/canary.py` run against the served site rather than `dist/`: HTTP 200
on the seven release URLs, one H1, no duplicate H2, self-canonical, the new H2
present, `sayt yaratish xizmati` / `web sayt yaratish` / `veb sayt yaratish`
present, clean Uzbek apostrophes, and `/ru/gpt-chat/`, `/ru/sotuvchi/`,
`/uz/sotuvchi/` plus a 404 on an unknown URL unchanged.

## Rollback

The rollback target is whatever deployment is serving `gptbot.uz` at the moment
the next deploy is made — as of 2026-08-26 that is the Lead Radar release built
from `ce01c0d`. Its id was not recorded here because `wrangler` lost its session
before it could be read; take it from
`wrangler pages deployment list --project-name ai-direct-pro-landing` immediately
before deploying, and write it down next to the new one.

Known-good earlier deployments:
`3f5760f0-b64e-40e8-b62a-e50745908b93` (source `3526be2`) and
`1252b988-e832-4fd3-95f3-6a4b856034e5` (source `b0a83ff`).

## Unchanged on purpose

Cloudflare auto-deploy: still disabled. Railway: untouched. SEO
auto-publication / scheduler: untouched. n8n: not restored. No force push, no
rebase, no history rewritten, no stash used as a sole copy.

---

## Second deployment, 2026-08-26 — the Telegram cluster, and a clobber

| | |
| --- | --- |
| Deployment id | `cd8d3ec5-4069-4857-95d2-d350f14b7120` |
| Immutable URL | `https://cd8d3ec5.ai-direct-pro-landing.pages.dev` |
| Source SHA | `987407785a12b81558fd2b4ea4e812af847d6bf8` |
| Rollback target | `de447a11-1428-4532-8041-93856191d05a` (source `2eb9a2a`) |
| `origin/main` | `0aedc8e` — pushed |
| Production canary | **PASSED** |
| IndexNow | 258 URLs submitted, HTTP 200 |

### The drift became a real regression

Between the first deployment and this one, the Lead Radar author deployed
`2eb9a2a` from `codex/lead-radar-mvp-20260824`. That branch does **not** contain
`3a8bf71`, so the deploy silently **removed the entire SEO release from
production**: `/uz/sayt-yaratish/` lost its new H2 and all three target phrases,
and link test 3 disappeared. Verified by fetching the live pages — both markers
returned 0.

This is the exact failure mode recorded above, now realised. It is not anybody's
mistake in isolation: two branches deploy to the same Pages project, neither is
a superset of the other, and whichever deploys last wins.

This deployment fixes it by shipping `9874077` = `main` (`0aedc8e`, all SEO work)
merged with `2eb9a2a` (the live Lead Radar tree). Both are preserved, the merge
was conflict-free, and all 14 `LEAD_RADAR_*` variables survive in `wrangler.toml`.

**The permanent fix is not another integration branch.** `origin/main` is now
`0aedc8e` and carries every SEO commit. The Lead Radar author must merge
`origin/main` into their branch before their next deploy, or land their branch on
`main` and deploy `main`. Until one of those happens, the next deploy from either
side clobbers the other again.

### Verification

`tsc -b` clean · `npm test` 346/346 · SEO gate set 107/107 · `seo:audit`
0 critical · `scan:secrets` clean over 3,461 files · `eslint .` clean ·
built-artifact canary passed · `dist/admin` present.

Live canary: seven release URLs 200 with one H1, no duplicate H2, self-canonical,
`index, follow`; `sayt yaratish xizmati` 4, `web sayt yaratish` 2,
`veb sayt yaratish` 3, density 0.82%; link test 3 present. Both Telegram pages
200 with their new titles and four `0,1 Toncoin` mentions each. Regression
surfaces unchanged; `/admin/lead-radar` 302, `/admin/` 200,
`/api/telegram/agents` 405 on GET, unknown URL 404.

---

## Third deployment, 2026-08-26 — the buying-placements article

| | |
| --- | --- |
| Deployment id | `a00b35d9-4c6d-43c3-a146-ec1ebc15ecca` (`https://a00b35d9.ai-direct-pro-landing.pages.dev`) |
| Source SHA | `9754dbb20049de269da5ebfc647a87f4f20ec72a` |
| What it is | `main` (`afb87f0`) merged with the live Lead Radar tree `2eb9a2a` |
| Rollback target | `8d6679fd-b284-4ed5-a4f8-2f1c17a4fc40` (source `010fd19`) |
| `origin/main` | **still `fd4177e` — the push is blocked, see below** |
| Production canary | **PASSED** |
| IndexNow | 259 URLs submitted, HTTP 200 |

### What shipped

One new URL: `/ru/blog/telegram-ads-ili-posevy-v-kanalah/`, 2,281 words, RU only.
It claims the buying-placements intent family measured on 2026-08-26 — ~25
phrases around «биржа рекламы телеграм», «купить рекламу в телеграм», «закупка»,
«покупка», «продажа» and «разместить», aggregating ~250/mo — which the two
Telegram hubs deliberately do not answer. One URL for the whole family, never one
per phrase.

Registered as the `telegram-ru` spoke in `content/seo/intent-manifest.json`, so
the cluster gates now run against it. `/ru/telegram-ads-uzbekistan/` gained one
contextual paragraph linking to it; that is the only page edited to create the
incoming link. `content/seo/demand-policy.json` records «купить рекламу в
телеграм» at 10/mo with its source and measurement date, even though the demand
gate scores money and niche pages only.

Anchor concentration on `/ru/telegram-ads-uzbekistan/`: **6 of 16 (38%)**, down
from 6 of 14 (43%). Both new anchors describe the section they point at.

Third-party figures keep their source and date: 0.1 TON minimum CPM, the
160-character limit and the 1,000-subscriber threshold from the Telegram Ads
documentation; 0.01 € minimum bid and the 500 € start budget from eLama's
published reseller figures. No GPTBot price, no case, no partner claim.

### Verification

`tsc -b` clean · `eslint .` clean · `npm test` **321/321** · the six SEO test
files **74/74** · `seo:audit` 0 critical, RU/UZ pairs 44 OK / 0 broken, avg blog
score 98/100 · `scan:secrets` clean over 3,389 files · `dist/admin` present ·
14 `LEAD_RADAR_*` variables in `wrangler.toml`.

Live canary after the deploy: article **200** with exactly one H1, four tables,
self-canonical, two anchors to the hub, the sources block rendering the eLama and
`ads.telegram.org` references; `/ru/telegram-ads-uzbekistan/` links back;
`/uz/sayt-yaratish/` marker still **1**; `/admin/lead-radar` **302**; `/admin/`
**200**; `sitemap.xml` contains the new URL.

### Three numbers the handoff got wrong

The handoff brief `docs/seo/HANDOFF_TELEGRAM_ADS_MOVE2_2026-08-26.md` was written
one commit before it was committed, and two of its figures were already stale
when it was read. Live state, measured 2026-08-26:

- `origin/main` was `fd4177e`, not `a3e37b7` — the extra commit is the brief itself.
- `npm test` is **321/321**, not 346/346, and `tests/lead-radar-api.test.ts` is
  not in the `npm test` list at all, so the "known pre-existing failure" it names
  never runs in the gate. Nothing failed.
- Anchor concentration on the hub was already **43%** (6 of 14), not 57%. The two
  anchors were rewritten in `a3e37b7`, before the brief was written.

### Outstanding — the push

`main` is `afb87f0` locally and `origin/main` is still `fd4177e`. The deployment
was made from an integration containing `afb87f0`, so production is correct, but
**the commit is not on the remote yet.** A plain `git push` returns 403 because
Windows Credential Manager holds a token for `cakecityuz-lab`, and the one-shot
credential-helper override documented in §7 of the handoff was refused by the
sandbox. Until the push lands, the next deploy from `origin/main` by another
session will clobber this article exactly as `2eb9a2a` clobbered the first SEO
release.

### Kill rule

Read at **2026-10-07** (six weeks). If the article has earned zero impressions on
any «биржа» / «купить рекламу в телеграм» phrase in Search Console with
country = Uzbekistan, do **not** write
`/ru/blog/kak-vybrat-telegram-kanal-dlya-reklamy/`; move the effort to §5 of
`docs/seo/TELEGRAM_ADS_ROADMAP_2026-08-26.md` — the OLX listing, the
`marketing.uz` pitch, and citations. First signal to look for: impressions within
7–14 days of recrawl.
