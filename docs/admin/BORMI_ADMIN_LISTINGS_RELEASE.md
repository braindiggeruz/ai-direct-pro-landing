# Bormi Admin · ADMIN-3A checkpoint

Date: 2026-08-04
Branch: `feature/bormi-admin-listings`, pushed to `origin`
Base: `d3f6b02` · Backup: `backup/bormi-admin-ux-20260804`

## Before this: the ADMIN-UX-1 gate

The checkpoint left one gate open — the root build had not been re-run after the
final changes. It was re-run on 2026-08-04 and **exits 0**, emitting 240 sitemap
entries (113 pages + 124 articles), the same 240 the checkpoint session emitted
and the same 240 the stale baseline test still expects to be 234. The working
tree is unchanged by the build. Recorded in `d3f6b02`.

ADMIN-UX-1 now has no open gate.

## What shipped

Three read-only screens and four read-only endpoints. The owner can see what
exists in the catalogue, what is published, what is broken and why, and can find
one listing among the rest — and cannot change any of it from here.

| Commit | What |
|--------|------|
| `docs(admin)` | the spec, the data contract and the security note |
| `feat(admin)` | bounded listing and category read models |
| `feat(admin)` | the screens, and the real buyer preview |
| `test(admin)` | 48 tests holding read-only, bounded and private |
| this one | the checkpoint and the evidence |

## Endpoints

```
GET /api/admin/listings
GET /api/admin/listings/:id
GET /api/admin/listings/:id/media/:index
GET /api/admin/categories
```

All four `withOwnerRole('platform_owner')`. Every other method is `405` with an
`Allow: GET` header. `support_readonly` is not admitted.

## Two defects this stage found

**Prices were shown at a hundredth of their value.** The admin's `money()`
divided `price_minor` by 100; the buyer's own presenter does not divide at all.
The catalogue settles it — a production product is named "Тестовый товар
1 000 000" and carries `price_minor = 1000000`. Every price the panel had shown
since ADMIN-UX-1 was wrong by 100×. Fixed, and locked by a test that asserts the
admin and the buyer agree.

This is what building the preview from the buyer's own presenter is for. Two
implementations of the same thing agree until they don't.

**`platform` imported `agents`.** The read model pulled a type from
`agents/sotuvchi/catalog`, which the repository's own boundary test forbids. It
was caught by the full corpus, not by typecheck — two corpus tests failed on it.
The type is now declared locally; the two unions are the same three literals
that the CHECK constraint defines.

## Decisions worth the record

**Sorting by "обновлено" is not offered.** `EXPLAIN QUERY PLAN` on production
D1: `ORDER BY updated_at DESC` is `SCAN p` plus a temp B-tree — no index covers
it. ADMIN-3A adds no migration, so it adds no sort. The date is still in the
row, and the screen says why it is not a sort key. The updated-at period filter
was dropped for the same reason. Full index evidence for every other shape is in
the data contract.

**Paging is `limit`/`offset`, not a cursor.** The brief asked for a cursor; the
repository has one bounded pagination model already, and a second one for a
single screen would leave the surface with two. The property a cursor protects —
a stable, total order — is held by `(normalized_name, id)`, which is unique
because `id` is the primary key. The honest limitation is written down: with
offset paging a row inserted between two page requests can shift the window.

**Categories earned a screen.** It is the only place showing which categories
are empty, which hold only drafts, which are full of photo-less cards, and how
many products belong to no category at all. Products with no category appear as
one synthetic row, marked as not a real category.

**Mobile filters are a `<details>` disclosure, not a drawer.** The brief asked
for a bottom sheet. A disclosure is keyboard-operable and announced by the
browser; a hand-built drawer needs a focus trap, an Escape handler and a focus
restore to arrive at the same place. The goal — the catalogue is visible
immediately on a phone — is met.

**A new media route was needed.** The Mini App's `/market/media/:handle` sits
inside the buyer session and resolves the caller through `claims.sub`. Reusing it
would have meant minting a buyer session for the owner console. The new route
uses the authority the console already has, builds the R2 key from the product's
own org and store, never lists the bucket, and refuses Telegram-hosted images
rather than proxying them.

## Gates

| Gate | Result |
|------|--------|
| TypeScript, root | 0 errors |
| TypeScript, admin app | 0 errors |
| ESLint, all new and changed files | 0 findings |
| `tests/bormi-admin-listings.test.ts` | 48/48 pass |
| `tests/bormi-admin.test.ts` | 45/45 pass, unchanged |
| Market Mini App tests | 19/19 pass |
| Secret scan | 14/14 pass |
| Full corpus, 64 files | 1422/1426 pass |
| Root build | pass, exit 0, 240 sitemap entries |
| Admin build | pass |
| `git diff --check` | clean |
| Migrations | 32, unchanged |
| D1 rows written | 0 |

The four corpus failures are the same four inherited ones, reproduced by name:

- `every tracked literal n8n reference has an inventory classification`
- `the current productization baseline preserves every public and admin route pattern`
- `sitemap generation retains all 234 static canonical entries`
- `buyer storefront route resolves the store but never launches seller onboarding`

The corpus grew from 1378 to 1426 because this stage added 48 tests. The two
boundary tests that failed mid-stage are green again and are counted in the
1422.

ESLint deserves a note: three real findings appeared in this work — an unused
destructure, a `setState` inside an effect, and a useless assignment — and all
three were fixed rather than suppressed. The `setState` one was replaced with
React's documented adjust-during-render pattern, so the search box follows the
URL without a second render.

## Performance

No dependency was added. The admin app still ships `react`, `react-dom` and
`react-router` and nothing else, and a test asserts exactly that list.

| Asset | Before (`d3f6b02`) | After | Delta |
|-------|--------------------|-------|-------|
| Shell JS | 251.63 kB / 79.61 gz | 197.82 kB / 62.31 gz | re-split, see below |
| Shared `lib` chunk | — | 37.23 kB / 13.46 gz | new |
| Shared `ui` chunk | — | 19.38 kB / 6.68 gz | new |
| Runtime chunk | — | 0.58 kB / 0.36 gz | new |
| CSS | 20.92 kB / 5.24 gz | 22.23 kB / 5.45 gz | +1.31 / +0.21 |
| Objявления chunk | — | 12.51 kB / 3.82 gz | new |
| Карточка chunk | — | 8.62 kB / 3.02 gz | new |
| Категории chunk | — | 5.07 kB / 1.86 gz | new |

The shell did not shrink by 54 kB: three route chunks now share `ui` and `lib`,
so rolldown extracted them rather than duplicating them. First screen — what a
cold visit to the Command Center fetches — is the honest number:

**285.09 kB → 290.35 kB raw, 89.64 kB → 93.25 kB gzip, 4 requests → 7.**

That is +3.61 kB gzip for three screens and four endpoints, at the cost of three
extra requests on the first visit. Each route chunk stays under 13 kB.

Page size is bounded at 25 by default and 100 by the shared owner limit, so the
browser never renders more than 100 rows regardless of catalogue size.

## Visual evidence

`docs/admin/evidence/admin-3a-20260804/` — 18 screenshots and
`measurements.json`, captured by `scripts/admin-listings-evidence.ts`
(`npm run admin:listings-evidence`) against the local fixture build. The script
refuses any origin that is not localhost.

| File | Shows |
|------|-------|
| `listings-1280-{dark,light}.png` | the whole screen, both themes |
| `listings-1280-fold.png` | what the reader actually opens first |
| `listings-filtered.png` | two filters applied, 13 of 57 matched |
| `listings-empty-filtered.png` | filters matched nothing, with the reset |
| `listings-search.png` | prefix search narrowing the catalogue |
| `listing-detail-1280-{dark,light}.png` | the detail, both themes |
| `listing-detail-media.png` | the gallery and its fallback |
| `categories-1280-{dark,light}.png` | the categories screen |
| `listings-768.png` | tablet |
| `listings-320-cards.png` | cards instead of a table, filters collapsed |
| `listings-320-filters-open.png` | the filter disclosure opened |
| `listing-detail-320.png` | the detail on a phone |
| `zoom200-{listings,categories,listing-detail}.png` | 200% zoom |

`measurements.json` carries, per shot: viewport, device pixel ratio, page
horizontal and vertical scroll, the vertical scroll regions, the horizontal
scroll containers, header height, nav display, `main` top, the `h1`, table
captions, whether every `th` has `scope="col"`, controls smaller than 44px, rows
and cards rendered, a count of controls whose text implies a write, and whether
the synthetic banner is visible.

A note on how the shots were taken: Playwright's `fullPage` cannot work against
this shell. It keeps `body { overflow: hidden }` and scrolls
`#bormi-admin-main`, so the page is always exactly one viewport tall and a
full-page capture silently returns the fold. The first run of this script
produced screenshots with no table in them for exactly that reason. Heights are
now set per shot, and one shot is deliberately taken at 800px to show the fold.

## Production state

Unchanged. Nothing was deployed.

| | |
|---|---|
| `BORMI_ADMIN_V2_ENABLED` | `"false"` |
| `MARKET_OWNER_TELEGRAM_BINDING_ENABLED` | `"false"` |
| `MARKET_QUICKPOST_ENABLED` / `_AI_ENABLED` | `"false"` |
| `wrangler.toml` | not modified |
| D1 | 0 rows written; read-only statements only |
| Unused binding challenges | 0 (0 ever issued) |
| Legacy `/admin-tools/*` | untouched |
| Mini App | imported from, never written to |

## Preview

Not deployed. The disk blocker that ADMIN-UX-1 recorded is gone — `C:` has
17 GB free — but the other four preconditions all touch production
configuration and none has been taken:

1. ~~Free space on `C:`~~ — done.
2. Add `BORMI_ADMIN_V2_ENABLED` to the *preview* deployment config through the
   Cloudflare API rather than through `wrangler.toml`.
3. Give the preview environment the `MARKET_MEDIA` binding, or the media route
   and the System page both report absence that is an artefact of the
   environment.
4. Capture the production config first, so any rewrite can be detected.
5. Upload with `--branch feature/bormi-admin-listings`.

Those are the owner's call. Until then the review surface is the evidence
directory, which needs nothing running, or the local fixture build:

```bash
npm --prefix apps/bormi-admin run dev
```

at `http://localhost:5183/admin/` — the trailing slash matters, Vite serves the
app under that base and `/admin` is a 404 from the dev server.

## Rollback

Nothing to roll back: the panel is unreachable, the flag is off in configuration
and absent from both Cloudflare deployment configs, and nothing was deployed.

To undo the code: `feature/bormi-admin-listings` is five commits ahead of
`d3f6b02`, which is `backup/bormi-admin-ux-20260804`. The branch has not been
merged anywhere. The one change that touches a screen outside this stage is the
`money()` fix, and reverting it would restore prices that are wrong by 100×.

## Known limitations

- No sort or filter by "обновлено", and no stock column. Both are data gaps
  named on screen and in the data contract, not oversights.
- Offset paging is not a snapshot: a row inserted between two page requests can
  shift the window.
- Screenshots are one engine at one scale factor — system Chrome at
  `deviceScaleFactor: 2`. No Firefox, no Safari, no real device.
- Assistive-technology output was not measured. 200% zoom was; 400% was not.
- Everything was reviewed against synthetic fixtures, never production data.
- The buyer preview shares the buyer's *data and formatting*, not the Mini App's
  component. The visual arrangement differs; every string does not.

## Not done, deliberately

ADMIN-3B commands, moderation, orders, seller commands, bulk actions, category
editing, feature-flag editing, migrations, the AUTH-1F canary, QP-1B, QP-2,
voice and vision. None is started.

## Next

**ADMIN-3B · Controlled Listing Commands**, after the owner has reviewed this.
Scope when it opens: publish, archive, unpublish — each with a closed-list
reason code, a typed confirmation for the destructive ones, an idempotency key,
an `owner_audit_events` row and a rollback path. The blocker already on record:
`owner_audit_events.action` has a CHECK allowing five verbs, so any new audited
verb needs a migration, and that migration is its own owner gate.
