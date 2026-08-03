# Bormi Admin · UX audit (ADMIN-UX-1)

Date: 2026-08-03
Branch: `feature/bormi-admin-ux`
Base commit: `01a0f88` (`backup/bormi-admin-ux-base-20260803`)
Scope: the four shipped surfaces — Command Center, Stores and Access, Audit, System State.
Not in scope: ADMIN-3 listings, moderation, orders, any write, AUTH-1F, QuickPost.

## 0. Recovery note

This audit was written across two sessions. The first ran out of budget partway
through the shell rewrite, with every change still uncommitted. Nothing was
reset, restored, stashed or rewritten from memory; the working tree it left was
preserved first and read second.

What was found at takeover:

| Fact | Value |
|------|-------|
| Branch | `feature/bormi-admin-ux` |
| HEAD | `01a0f88` — unchanged, no commit was created |
| Backup branch | `backup/bormi-admin-ux-base-20260803` at the same commit |
| Working tree | dirty, 7 modified files, 0 untracked |
| Diff | +839 / −185 |
| Stashes | none |
| Merge or rebase in progress | none |
| `git fsck` | dangling objects only, no corruption |

The previous session's notes mention "created a file". No untracked file exists
and no file was added to the index, so the created file is either one of the
seven that already existed under version control or was never written. Nothing
is missing: the diff accounts for every change the session described.

The browser pane in that session reported it could not read
`functions/api/admin/overview.ts`. The file is present on disk and tracked by
Git. That was a pane limitation, not a deletion.

The whole dirty tree was copied out before the first edit, to
`F:\Claude\bormi-recovery\ADMIN-UX-1-20260803-2041\`, as a binary patch plus the
status, stat and name-status listings.

## 1. Method

The panel was run locally against synthetic fixtures
(`VITE_ADMIN_FIXTURES=1`) and measured in the browser rather than described.
Screenshot capture was not available in this environment — the browser pane was
not compositing frames, so `computer{action:"screenshot"}` timed out. Every
visual claim below is therefore backed by a DOM measurement, a computed style or
an accessibility-tree read, and none of them by a picture. Where a claim could
not be measured, it is not made.

## 2. The defect that started this

Before the rewrite the page scrolled. The sidebar was as tall as the content, so
under anything longer than the viewport it slid off the top — navigation
disappeared exactly when a long table made the reader want it. That is the one
confirmed, reproduced defect, and it is what the rewrite is for.

## 3. Confirmed defects, and what was done

| # | Defect | Where | Status |
|---|--------|-------|--------|
| 1 | Sidebar scrolled away with the page | shell | Fixed by the previous session's rewrite; verified by measurement |
| 2 | Freshness label read the clock during render, so it never aged on an idle screen | `ui.tsx` `Freshness` | Fixed — a timer measures the age |
| 3 | Sidebar carried `flex` and `hidden` together; which won was left to Tailwind's emission order | `AppShell.tsx` | Fixed — one display utility at a time |
| 4 | Sheet stayed "open" when the window widened past the rail breakpoint, trapping the keyboard in navigation with no visible close | `AppShell.tsx` | Fixed — a media-query listener closes it |
| 5 | Mobile sheet trapped focus but was not announced as a dialog | `AppShell.tsx` | Fixed — `role="dialog"`, `aria-modal`, page behind marked hidden |
| 6 | Skip link target took no focus, so the next Tab returned to the top of the navigation it skipped | `AppShell.tsx` | Fixed — `tabIndex={-1}` on `<main>` |
| 7 | Environment badge was hidden below `sm`, so the narrowest screen never said the data was invented | `AppShell.tsx` | Fixed — a synthetic label is never hidden |
| 8 | Owner disclosure claimed `role="menu"` without arrow-key navigation | `AppShell.tsx` | Fixed — it is a disclosure and is announced as one |
| 9 | Attention panel rendered an empty state duplicating the verdict strip above it | `Overview.tsx` | Fixed — absent when there is nothing to attend to |
| 10 | Attention severity colour was applied to all four borders instead of the left bar | `Overview.tsx` | Fixed |
| 11 | A flag reported by the server but unknown to the page vanished from the list while still being counted in the tile above it | `System.tsx` | Fixed — an "остальные" group catches them |
| 12 | Action, role and reason vocabularies had drifted from the server enums: `seller.unbind` missing, three invented reason codes, six real ones absent | `text.ts` | Fixed and locked by a cross-file test |
| 13 | Header measured 60px against a 64–72px contract | `styles.css` | Fixed — 64px |
| 14 | Audit page had no freshness, no filters, no detail, no stale handling and a generic skeleton | `Audit.tsx` | Built |
| 15 | Unused import left the app failing typecheck | `Overview.tsx` | Fixed |

## 4. Harness-only findings, not defects

The screenshot from the previous session shows space around the preview. That is
the browser pane's own chrome. Measured inside the application root at every
tested width, the page has no horizontal overflow, no outer card and no reserved
band above the header:

- `documentElement.scrollWidth − clientWidth = 0`
- `main` starts immediately below the header, at `y = 64`
- `body { overflow: hidden }`, and the root is exactly `100dvh`

No production CSS was changed to accommodate the harness.

## 5. Shell, before and after

| | Before | After |
|---|---|---|
| Scrolling element | the page | `<main>` only |
| Sidebar under a long table | scrolled off the top | stays |
| Vertical scrollbars | up to two | exactly one |
| Header | scrolled with content | furniture, 64px |
| Rail width | fixed | 264px, optional 76px collapsed |
| Sheet on a phone | slid, stayed in the tab order | mounted/unmounted, dialog semantics, focus trapped and returned |

## 6. Page hierarchy

Command Center answers, in this order: how old is this, is anything wrong, what
needs a person, how much of the marketplace is real, what moved. The verdict is
computed from the same counts the page then shows, so it cannot say everything
is fine above a list of problems. There is no revenue, no conversion, no view
count and no chart, because Bormi measures none of them; the gaps are named.

System State opens with a verdict, then infrastructure, then the migration
ledger, then flags, then what cannot be read from inside a request. Flags are
states, never controls.

Stores and Access answers one question — can anybody actually run a shop from
the app — and puts the answer at the top. It counts memberships and never lists
identities.

Audit is the trail, filtered by the two fields the endpoint actually narrows on.
It shows no payload, no identifier and no key, and says so.

## 7. Measured evidence

Fixture build, Chromium, at the widths below.

| Width | Page scroll X | Page scroll Y | Vertical scroll regions | Sidebar | Header |
|-------|---------------|---------------|-------------------------|---------|--------|
| 320 | 0 | 0 | 1 (`#bormi-admin-main`) | sheet, `display: none` when closed | 64px |
| 768 | 0 | 0 | 1 | sheet | 64px |
| 1024 | 0 | 0 | 1 | rail, 264px, `main` 760px | 64px |
| 1280 | 0 | 0 | 1 | rail, 264px, `main` 1016px | 64px |

The only horizontal scroll container anywhere is `.table-scroll`, which is what
keeps the wide table inside its own card.

Collapsed rail measured 76px; expanded 264px; rail items keep their accessible
text when collapsed.

Mobile sheet, measured while open: `role="dialog"`, `aria-modal="true"`, the
content column marked hidden, focus inside the sheet, 7 focusable elements, an
overlay present, page horizontal scroll still 0. Escape closed it, the role and
the hidden marking were dropped, and focus returned to the trigger labelled
"Открыть меню".

Audit drawer, measured: opened with focus inside, closed on Escape, focus
restored to the row control that opened it.

Contrast, computed from the live tokens against the live surfaces:

| Pair | Light | Dark |
|------|-------|------|
| Body text on card | 18.05 | 16.55 |
| Body text on canvas | 16.79 | 18.07 |
| Secondary text on card | 5.98 | 8.39 |
| Positive on card | 5.56 | 9.74 |
| Warning on card | 5.92 | 10.94 |
| Negative on card | 6.20 | 7.79 |
| Accent on card | 6.23 | 6.05 |
| Focus ring on canvas | 5.79 | 6.60 |

Every measured pair is above 4.5:1 in both themes. This is a measurement of
these pairs, not a WCAG conformance claim: no full audit was run.

## 8. Accessibility

Present and verified: skip link to a focusable `<main>`; `banner`, `navigation`
and `main` landmarks with one of each; one `h1` per screen with `h2`/`h3` below
it; a visible focus ring on every interactive element; `aria-current` on the
active section; dialog semantics, focus trap, Escape and focus return on both
the mobile sheet and the audit drawer; buttons rather than clickable rows and
`div`s; `scope="col"` on every table header; status carried by a word with
colour as the second signal; a 44px minimum on interactive controls; a
`prefers-reduced-motion` block; no icon fonts and no emoji as UI.

Not verified: 200% zoom and screen-reader output were not measured in this
environment.

## 9. Performance

No dependency was added. The panel still ships React, React DOM and React Router
and nothing else at runtime. No chart library, no calendar, no map, no icon
package, no animation framework, no remote font.

Measured against a build of `01a0f88`:

| Asset | Before | After | Delta |
|-------|--------|-------|-------|
| Shell JS | 227.35 kB / 73.17 kB gzip | 251.43 kB / 79.54 kB gzip | +24.08 kB / +6.37 kB |
| Shared UI chunk | 14.07 kB / 5.17 kB gzip | folded into the shell | −1 request |
| CSS | 15.17 kB / 4.13 kB gzip | 20.92 kB / 5.24 kB gzip | +5.75 kB / +1.11 kB |
| Command Center chunk | 6.50 kB / 2.38 kB gzip | 8.71 kB / 2.98 kB gzip | +2.21 kB / +0.60 kB |
| Audit chunk | 2.18 kB / 0.97 kB gzip | 5.60 kB / 2.30 kB gzip | +3.42 kB / +1.33 kB |
| Stores and Access chunk | 5.66 kB / 2.12 kB gzip | 7.39 kB / 2.58 kB gzip | +1.73 kB / +0.46 kB |
| System State chunk | 3.91 kB / 1.68 kB gzip | 6.62 kB / 2.50 kB gzip | +2.71 kB / +0.82 kB |

First screen, everything a cold visit to the Command Center fetches:
266.40 kB → 284.89 kB raw, 86.41 kB → 89.56 kB gzip. That is +3.15 kB gzip for
the shell rewrite, the four rebuilt screens and the audit surface, across one
fewer request.

## 10. Limitations

- No screenshot evidence: the browser pane could not composite frames.
- 200% zoom and assistive-technology output were not measured.
- The audit page shows one bounded page of 25 events and says so. There is no
  paging control; the filters narrow server-side instead.
- Fixtures, not production data. Nothing here was measured against a real
  marketplace, because the rollout flag is off and this work does not turn it on.

## 11. Next

ADMIN-3 · Listings and Categories, after the owner has reviewed this shell. It
is not started, and nothing here anticipates it.
