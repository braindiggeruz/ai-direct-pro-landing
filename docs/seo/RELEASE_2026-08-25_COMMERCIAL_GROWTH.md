# Release — commercial growth, 2026-08-25

Branch `seo/commercial-growth-2026-08-25b`, 9 commits on top of `b0a83ff`.
Merge to `main` is a **fast-forward** — the branch is 8/9 ahead and 0 behind
`origin/main`, so no conflict is possible.

**Status: built, verified, committed. NOT pushed and NOT deployed.** Both are
blocked on credentials the repository cannot supply. See "Blocked" below.

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

**Push.** `git push` returns
`Permission to braindiggeruz/ai-direct-pro-landing.git denied to cakecityuz-lab`.
The Windows Credential Manager holds a token for a different account, and
`gh auth status` reports the `braindiggeruz` keyring token invalid. Owner action:
re-authenticate, then `git push origin seo/commercial-growth-2026-08-25b`.

**Deploy.** `wrangler whoami` succeeded early in this session and returned
`not authenticated` later — the OAuth session was invalidated mid-run. Owner
action: `wrangler login`.

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

Options, in the order they should be considered:

1. **Land `codex/lead-radar-mvp-20260824` on `main` first**, then deploy `main`
   once. `main` becomes a superset of production, the drift closes, and nothing
   regresses. Requires the Lead Radar author to finish and merge.
2. **Deploy an integration of `3526be2` + this branch.** Reaches production today
   without regressing anything, but keeps production on a SHA that is not `main`
   and needs conflict resolution in `scripts/prerender.ts`, `src/shared/types.ts`
   and several `content/pages/ru/*` files, where `b0a83ff` and `3526be2` disagree.
3. **Deploy `main` alone.** Ships the SEO change today and accepts the Lead Radar
   rollback. Not recommended.

## Rollback

Current production deployment `3f5760f0-b64e-40e8-b62a-e50745908b93`
(`https://3f5760f0.ai-direct-pro-landing.pages.dev`, source `3526be2`) is the
rollback target for whatever ships next. The deployment before it is
`1252b988-e832-4fd3-95f3-6a4b856034e5` (source `b0a83ff`).

## Unchanged on purpose

Cloudflare auto-deploy: still disabled. Railway: untouched. SEO
auto-publication / scheduler: untouched. n8n: not restored. No force push, no
rebase, no history rewritten, no stash used as a sole copy.
