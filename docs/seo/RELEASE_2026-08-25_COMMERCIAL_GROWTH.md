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

Options, in the order they should be considered:

1. **Push both branches, land them both on `main`, deploy `main` once.**
   Both are fast-forwards from `b0a83ff` with disjoint file sets, so the merge is
   mechanical. `main` becomes a superset of production, the drift closes, and
   nothing regresses. This is the right end state.
2. **Deploy the validated integration `c9dca96` now.** Reaches production without
   regressing anything and is already built and gated, but keeps production on a
   SHA that is not `main` — the same drift, one release longer.
3. **Deploy `main` + this branch alone.** Ships the SEO change and rolls Lead
   Radar back off production, stripping its 14 `wrangler.toml` variables.
   **Do not do this.**

### Exact commands, once the credentials are back

```bash
# 1. authenticate (interactive terminal)
gh auth login -h github.com
wrangler login

# 2. push both branches
git -C F:/Claude/gptbot-commercial-growth-20260825 push origin seo/commercial-growth-2026-08-25b
git -C F:/Claude/gptbot-ui-release-20260824      push origin codex/lead-radar-mvp-20260824

# 3. land both on main (both are fast-forwards from b0a83ff, disjoint files)
# 4. build and deploy the exact merged main SHA
npm run build:cf
node_modules/.bin/wrangler pages deploy dist \
  --project-name ai-direct-pro-landing \
  --branch main \
  --commit-hash <merged-main-sha>
```

Deploy only from a clean tree, and record the returned deployment id and its
immutable `*.pages.dev` URL next to the source SHA.

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
