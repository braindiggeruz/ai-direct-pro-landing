# Bormi Admin · ADMIN-UX-1 checkpoint

Date: 2026-08-04
Branch: `feature/bormi-admin-ux`, pushed to `origin`
Base: `01a0f88` · Backup: `backup/bormi-admin-ux-base-20260803`

| Commit | What |
|--------|------|
| `4aa8de3` | `feat(admin): give the control center one coherent viewport` |
| `6fd42e7` | `docs(admin): audit the owner control center experience` |
| `35b5556` | `docs(admin): record the design system the panel actually uses` |
| `f97855e` | `docs(admin): record the ADMIN-UX-1 checkpoint` |
| this one | `feat(admin): capture the visual evidence and fix what it found` |

## What shipped

One viewport, one scroll region, navigation that stays put. The four surfaces —
Command Center, Stores and Access, Audit, System State — finished against the
rule they started with: nothing on the screen is invented, and a number that
cannot be measured is named as missing rather than drawn as a zero.

Details are in `BORMI_ADMIN_UX_AUDIT.md` (seventeen confirmed defects, what was
done about each, and the measurements) and `BORMI_ADMIN_DESIGN_SYSTEM.md`
(tokens, components, and the restraints).

## Amendment, 2026-08-04: the missing pictures

This checkpoint originally shipped with no screenshot evidence, because the
browser pane was not compositing frames. It still is not. The evidence was
captured another way: `scripts/admin-ux-evidence.ts` drives the *system* Chrome
through `playwright-core`, which is already a dependency and ships no browser
binaries of its own. 18 screenshots and a `measurements.json` are committed to
`docs/admin/evidence/admin-ux1-20260804/`. The script refuses any origin that is
not `localhost`.

Re-running every width from the audit's table reproduced it exactly. Two new
defects appeared that no DOM measurement could have caught, and both are fixed:

| # | Defect | Fix |
|---|--------|-----|
| 16 | The theme toggle drew a bare `<circle>` in dark mode. Correct accessible name, correct `aria-pressed`, real inline SVG — and at 18px it renders as a dot, not a sun | Rays added. Locked by `admin: the theme control draws a sun, not a dot` |
| 17 | The audit hint said "Нажмите строку" while the row is deliberately inert; only the action cell is a button, and the code carries a comment saying so | The hint now names the control. Locked inside `admin: a row is opened by a control, not by a click on the row` |

Both fixes are cosmetic in weight: +0.20 kB raw / +0.07 kB gzip on the shell,
+0.01 kB on the audit chunk, CSS unchanged.

200% zoom, listed as unmeasured, is now measured on all four surfaces: no
horizontal scroll, one scroll region, navigation reachable through the sheet,
and the synthetic banner still visible. Details in the audit, §8.

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

Re-run in full on 2026-08-04 after the amendment. Both columns are that run.

| Gate | Result |
|------|--------|
| TypeScript, root | 0 errors — this covers the new script |
| TypeScript, admin app | 0 errors |
| ESLint, changed files | 2 findings, both in `AppShell.tsx` and both identical at `01a0f88`; `Audit.tsx`, the test file and the new script are clean; 0 new |
| `tests/bormi-admin.test.ts` | 45/45 pass, up from 44 |
| Market Mini App tests | 19/19 pass |
| Secret scan | 14/14 pass |
| Full corpus, 63 files | 1374/1378 pass |
| Root build | not re-run — see below |
| Admin build | pass |
| `git diff --check` | clean |
| Migrations | 32, unchanged |

The root build was not re-run. Nothing outside `apps/bormi-admin/`, `tests/`,
`docs/` and one new standalone script changed; the new script is wired to
`npm run admin:evidence` and is not part of any build chain; and the root
typecheck that does cover it passed. Claiming a gate that was not run would be
worse than recording why it was skipped.

The four full-corpus failures are inherited, and they are still exactly four.
Each was reproduced in a detached worktree at `01a0f88` before this work was
blamed for it, and each was reproduced again by name on 2026-08-04:

- `every tracked literal n8n reference has an inventory classification`
- `the current productization baseline preserves every public and admin route pattern` — `'blocked' !== 'pass'`
- `sitemap generation retains all 234 static canonical entries` — 240 emitted
- `buyer storefront route resolves the store but never launches seller onboarding`

The last three are the known stale baselines. The root build in the checkpoint
session emitted 240 sitemap entries, which is the same 240 the test still
expects to be 234. None of the four is in `apps/bormi-admin` or
`tests/bormi-admin.test.ts`. The corpus total moved from 1377 to 1378 because
the amendment added one test.

The six ESLint findings are also inherited: a conditional hook in `App.tsx`, a
non-component export and a `setState` in an effect in `AppShell.tsx`, and three
in `useQuery.ts`. None is in a line this work touched, and no new one was added.
The amendment re-linted the files it changed and saw two of those six — both the
`AppShell.tsx` pair — plus nothing in `Audit.tsx`, `tests/bormi-admin.test.ts`
or `scripts/admin-ux-evidence.ts`.

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

Separately, the machine had 0 GB free on `C:`, where wrangler writes its cache
and upload staging. **Resolved 2026-08-04**: 17.2 GB free, reclaimed from
regenerable caches and logs only. That removes the first of the five
preconditions below; the other four are untouched, and they are the ones that
involve production configuration.

So: no preview URL is recorded here, because none was created. Inventing one
would be worse than not having one.

**What would make it safe**, in order:

1. ~~Free space on `C:`~~ — done, 17.2 GB.
2. Add `BORMI_ADMIN_V2_ENABLED` to the *preview* deployment config through the
   Cloudflare API rather than through `wrangler.toml`.
3. Give the preview environment the `MARKET_MEDIA` binding, so the System page
   reads truthfully instead of showing a red verdict that is an artefact of the
   environment.
4. Capture the production config first, so any rewrite can be detected and
   reversed.
5. Upload with `--branch feature/bormi-admin-ux`, which is not the production
   branch `main`.

Steps 2 through 5 all touch production configuration and none of them has been
taken. They are the owner's call, not this session's.

Until then the review surface is the local fixture build:

```bash
npm --prefix apps/bormi-admin run dev
```

with `VITE_ADMIN_FIXTURES=1` in `apps/bormi-admin/.env.development.local`,
served at `http://localhost:5183/admin/`. Every measurement in the UX audit was
taken there.

The trailing slash matters: Vite serves this app under a base of `/admin/`, so
`http://localhost:5183/admin` is a 404 from the dev server rather than a route.
The evidence script encodes that.

The pictures are the faster review surface, and they need nothing running:
`docs/admin/evidence/admin-ux1-20260804/`.

## Rollback

The panel is not reachable by anyone: the rollout flag is off in configuration
and absent from both deployment configs, so the built asset at `/admin/` renders
its disabled screen even if served. Nothing needs to be rolled back.

To undo the code itself: `feature/bormi-admin-ux` is five commits ahead of
`backup/bormi-admin-ux-base-20260803`, which is `01a0f88`. The branch has not
been merged anywhere.

To undo only the amendment, revert the last commit: it changes two lines of
rendering (the sun's rays, the audit hint), adds one test, adds one script that
nothing else calls, and adds a directory of pictures.

## Known limitations

- Assistive-technology output was not measured. 200% zoom now is; 400% is not.
- The screenshots are one engine at one scale factor — system Chrome at
  `deviceScaleFactor: 2`. No Firefox, no Safari, no real device.
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

The review no longer needs anything running: the 18 pictures in
`docs/admin/evidence/admin-ux1-20260804/` are the shell as it renders. The two
decisions the owner still owns are whether to take steps 2–5 above and put a
preview on Cloudflare, and whether `BORMI_ADMIN_V2_ENABLED` should ever become
`"true"`. Neither was taken here.
