# Bormi Admin — premium operational UI, screenshot evidence

Captured from the fixture dev server with a real Chrome, by
`scripts/release/admin-premium-evidence.ts`. Every frame is synthetic: the panel
prints «Синтетические данные» in its own header while fixtures are on, so none
of these can be mistaken for the marketplace and no production record reaches a
PNG.

## What was measured

`measurements.json` covers the **full** run — 9 screens × 5 widths × 2 themes =
**90 frames**:

| | |
| --- | --- |
| Screens | Command Center, Access, Listings, Moderation, Reports, Categories, Operations, Audit, System |
| Widths | 1920, 1440, 1280, 390, 320 |
| Themes | light, dark |
| Horizontal overflow | **0 frames** |
| Controls under 44 px | **0** |
| Verdict | **PASS** |

The undersized-target check ignores visually-hidden controls: the `sr-only`
idiom is a 1 px box with a 50 % inset clip, not a zero-sized one, so the skip
link counted as an undersized button on all ninety frames until the harness
learned to tell the difference. It is a real control only once focus reveals it.

## What is committed here

The 1440 (the width the console is actually read at) and 390 (phone) frames in
both themes — **36 PNGs**. The 1920, 1280 and 320 frames are covered by
`measurements.json` and are reproducible rather than stored, because 90 PNGs is
6.6 MB of repository for four numbers that are already written down.

To regenerate everything:

```bash
npm run dev --prefix apps/bormi-admin
npx tsx scripts/release/admin-premium-evidence.ts
```

## What this is not

Synthetic frames prove layout, theme and reachability. They do not prove the
owner's real session, real moderation data, or that a command reached the
server — those need the production canary, which is a separate gate.
