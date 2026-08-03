# Bormi Admin · ADMIN-UX-1 checkpoint

Date: 2026-08-04
Branch: `feature/bormi-admin-ux`, pushed to `origin`
Base: `01a0f88` · Backup: `backup/bormi-admin-ux-base-20260803`

| Commit | What |
|--------|------|
| `4aa8de3` | `feat(admin): give the control center one coherent viewport` |
| `6fd42e7` | `docs(admin): audit the owner control center experience` |
| `35b5556` | `docs(admin): record the design system the panel actually uses` |
| this one | `docs(admin): record the ADMIN-UX-1 checkpoint` |

## What shipped

One viewport, one scroll region, navigation that stays put. The four surfaces —
Command Center, Stores and Access, Audit, System State — finished against the
rule they started with: nothing on the screen is invented, and a number that
cannot be measured is named as missing rather than drawn as a zero.

Details are in `BORMI_ADMIN_UX_AUDIT.md` (fifteen confirmed defects, what was
done about each, and the measurements) and `BORMI_ADMIN_DESIGN_SYSTEM.md`
(tokens, components, and the restraints).

## Recovery

The session that began this rewrite ran out of budget mid-way, with everything
uncommitted. Nothing was reset, restored, stashed or reconstructed from memory.
The dirty tree was copied to
`F:\Claude\bormi-recovery\ADMIN-UX-1-20260803-2041\` — a 61 KB binary patch
plus status, stat and name-status listings — before the first edit, and read in
full before anything was changed. No work was lost: HEAD was still `01a0f88`,
no commit had been created, there were no stashes and no untracked files, and
`git fsck` found only dangling objects.

## Gates

| Gate | Result |
|------|--------|
| TypeScript, root | 0 errors |
| TypeScript, admin app | 0 errors |
| ESLint, changed files | 6 findings, all identical at `01a0f88`; 0 new |
| `tests/bormi-admin.test.ts` | 44/44 pass, up from 31 |
| Market Mini App tests | 19/19 pass |
| Secret scan | 14/14 pass |
| Full corpus, 63 files | 1373/1377 pass |
| Root build | pass |
| Admin build | pass |
| `git diff --check` | clean |
| Migrations | 32, unchanged |

The four full-corpus failures are inherited. Each was reproduced in a detached
worktree at `01a0f88` before this work was blamed for it:

- `every tracked literal n8n reference has an inventory classification`
- `the current productization baseline preserves every public and admin route pattern` — `'blocked' !== 'pass'`
- `sitemap generation retains all 234 static canonical entries` — 240 emitted
- `buyer storefront route resolves the store but never launches seller onboarding`

The last three are the known stale baselines. The root build in this session
emitted 240 sitemap entries, which is the same 240 the test still expects to be
234.

The six ESLint findings are also inherited: a conditional hook in `App.tsx`, a
non-component export and a `setState` in an effect in `AppShell.tsx`, and three
in `useQuery.ts`. None is in a line this work touched, and no new one was added.

## Production state

Unchanged. Nothing was deployed.

| | |
|---|---|
| `BORMI_ADMIN_V2_ENABLED` | `"false"` in `wrangler.toml`, and absent from both Cloudflare deployment configs |
| `MARKET_OWNER_TELEGRAM_BINDING_ENABLED` | `"false"` — AUTH-1F still idle |
| `MARKET_QUICKPOST_ENABLED` / `MARKET_QUICKPOST_AI_ENABLED` | `"false"` — untouched |
| `wrangler.toml` | not modified in this session |
| D1 | no migration, no query, no write |
| Legacy `/admin-tools/*` | untouched, and still the only place commands live |

## Preview: not deployed, and why

The brief allowed two shapes of preview. Neither is safe to produce from here
right now, and the checks that established that are worth writing down.

**A synthetic preview cannot exist.** `FIXTURE_MODE` is
`import.meta.env.DEV && VITE_ADMIN_FIXTURES === '1'`, which folds to `false` in
any production build — that is the guarantee that fixture data can never reach a
deployed bundle, and two tests hold it. Making fixtures reachable from a
deployed build means removing that guarantee, which is a worse trade than having
no cloud preview.

**An authenticated preview would touch production configuration.** Read-only
inspection of the Pages project `ai-direct-pro-landing` found four things:

1. `wrangler pages deploy` rewrites the project's plain `[vars]` from
   `wrangler.toml`. That is the documented mechanism by which
   `MARKET_VOICE_SEARCH_ENABLED` previously reached production, and dashboard-only
   bindings are deleted by the next direct upload. Production currently holds 48
   plain variables; `wrangler.toml` does not describe all of them.
2. `BORMI_ADMIN_V2_ENABLED` exists in neither the production nor the preview
   deployment config. The panel would render its "выключено" screen unless the
   variable were added — and adding it to `wrangler.toml` is the one place an
   upload is known to propagate from.
3. The preview environment's bindings are not production's: it has no
   `MARKET_MEDIA` R2 bucket. The System page would truthfully report storage as
   not connected and show a red verdict — an accurate reading of a preview, and a
   misleading one to review a design against. Its D1 binding, meanwhile, is the
   same production database.
4. `preview_deployment_setting` is `none` and `deployments_enabled` is `false`.
   Previews are not part of this project's flow.

Separately, the machine has 0 GB free on `C:`, where wrangler writes its cache
and upload staging.

So: no preview URL is recorded here, because none was created. Inventing one
would be worse than not having one.

**What would make it safe**, in order: free space on `C:`; add
`BORMI_ADMIN_V2_ENABLED` to the *preview* deployment config through the
Cloudflare API rather than through `wrangler.toml`; give the preview environment
the `MARKET_MEDIA` binding so the System page reads truthfully; capture the
production config first so any rewrite can be detected and reversed; then upload
with `--branch feature/bormi-admin-ux`, which is not the production branch
`main`.

Until then the review surface is the local fixture build:

```bash
npm --prefix apps/bormi-admin run dev
```

with `VITE_ADMIN_FIXTURES=1` in `apps/bormi-admin/.env.development.local`,
served at `http://localhost:5183/admin/`. Every measurement in the UX audit was
taken there.

## Rollback

The panel is not reachable by anyone: the rollout flag is off in configuration
and absent from both deployment configs, so the built asset at `/admin/` renders
its disabled screen even if served. Nothing needs to be rolled back.

To undo the code itself: `feature/bormi-admin-ux` is three commits ahead of
`backup/bormi-admin-ux-base-20260803`, which is `01a0f88`. The branch has not
been merged anywhere.

## Known limitations

- No screenshot evidence. The browser pane could not composite frames, so
  `computer{action:"screenshot"}` timed out. Every visual claim in the audit is
  backed by a DOM measurement, a computed style or an accessibility-tree read
  instead, and nothing is claimed that was not measured.
- 200% zoom and assistive-technology output were not measured.
- The audit page shows one bounded page of 25 events. Filters narrow it
  server-side; there is no paging control.
- Everything was reviewed against synthetic fixtures, never production data.

## Not done, deliberately

ADMIN-3 listings and categories, moderation, orders, seller commands, search and
QuickPost analytics, any write operation, feature-flag editing, new backend
domains, D1 migrations, the AUTH-1F canary, QP-1B, QP-2, voice and vision. None
of them is started and nothing here anticipates them.

## Next

ADMIN-3 · Listings and Categories, after the owner has reviewed this shell.
