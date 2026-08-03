# Bormi Admin · design system

One file holds the whole visual layer: `apps/bormi-admin/src/styles.css`. One
file holds the whole component vocabulary: `apps/bormi-admin/src/components/ui.tsx`.
There is no second token set, no theme package and no CSS-in-JS. If a value is
not in one of those two files, it should not exist.

## 1. Three layers

Primitives are raw values and carry no meaning. Semantic tokens name a purpose
and are the only thing components reference. Geometry tokens are shared
measurements that two components would otherwise have to agree about by
accident.

```
--color-bormi-violet: #5b3cf2      primitive
        ↓
--accent: var(--color-bormi-violet) semantic
        ↓
bg-[var(--accent)]                  component
```

A component never reads a primitive. That is what makes the dark theme a
single block of overrides rather than a second stylesheet.

## 2. Colour

Bormi's violet is the Mini App's violet, so the two surfaces agree.

| Primitive | Light | Dark |
|-----------|-------|------|
| Violet | `#5b3cf2` | `#9a88ff` |
| Violet, strong | `#4625dc` | — |
| Lime | `#d8ff57` | — |
| Coral | `#ff7669` | — |

Semantic surfaces:

| Token | Light | Dark |
|-------|-------|------|
| `--surface-canvas` | `#f7f6fb` | `#121017` |
| `--surface-paper` | `#ffffff` | `#1c1924` |
| `--surface-soft` | `#efedf7` | `#282431` |
| `--border-line` | `#dedbe8` | `#3d3748` |
| `--text-primary` | `#17151f` | `#fbf9ff` |
| `--text-secondary` | `#666171` | `#b8b2c2` |

Semantic meaning:

| Token | Light | Dark | Spent on |
|-------|-------|------|----------|
| `--accent` | `#5b3cf2` | `#9a88ff` | navigation, the active section, the focus ring |
| `--tone-good` | `#14774d` | `#6dd6a7` | something is genuinely healthy |
| `--tone-warn` | `#865c00` | `#f4c860` | something needs a person, and also the synthetic marking |
| `--tone-bad` | `#b62b35` | `#ff8e84` | something is broken, or access was taken away |

Three rules govern colour here.

Almost everything is neutral. A console that paints every panel in the brand
colour tells the reader nothing; the violet is reserved for navigation and
focus, and the three tones are reserved for meaning. There is no purple card.

Lime and coral are the brand's positive and negative, but the tones that carry
meaning on screen are the darker, contrast-checked variants above. A brand
colour that fails against white is a brand colour, not a status colour.

Status is never colour alone. Every badge carries a word and the colour repeats
it, which is what keeps the tables legible without colour vision and readable in
a dark room. Measured contrast for every pair is in the UX audit.

## 3. Geometry

| Token | Value | Why it is a token |
|-------|-------|-------------------|
| `--shell-header` | `64px` | the header, the rail's logo block and the drawer's title bar are all this tall, and they must not disagree |
| `--shell-sidebar` | `264px` | |
| `--shell-sidebar-collapsed` | `76px` | |
| `--row-height` | `44px` | a console is read in columns; rows differing by two pixels make the eye re-find the line |
| `--badge-height` | `22px` | |

Radii: three, not ten. `--radius-card: 12px`, `--radius-control: 8px`,
`--radius-pill: 999px`.

Shadow: one. `--shadow-card`, and only `.surface` uses it.

Spacing: Tailwind's scale, used densely — `gap-2` inside a card, `gap-3` between
tiles, `gap-4` between cards, `mb-5` under a page header. This is a dashboard
density, not a marketing one.

## 4. Typography

No webfont. A console should not wait on a network to render a number.
`--font-sans` is the system stack; `--font-mono` is the system monospace and is
used for identifiers, build ids and file names only.

| Role | Size | Weight |
|------|------|--------|
| Page title (`h1`) | 18px, 20px from `sm` | 600 |
| Card title (`h2`) | 14px | 600 |
| Group label (`h3`) | 11px uppercase, tracked | 500 |
| Body | 14px | 400 |
| Secondary and hints | 12px | 400 |
| Metric value | 24px, tabular figures | 600 |

Every number that can be compared down a column is `tabular-nums`. A column of
proportional digits is a column that cannot be scanned.

## 5. The scroll model

This is the one structural decision the rest of the shell follows from.

The application owns the viewport. `html`, `body` and `#root` are `100dvh`;
`body` is `overflow: hidden`. The rail and the header are furniture. `<main>`
carries `.app-scroll` and is the only element in the application allowed a
vertical scrollbar. `100dvh` rather than `100vh`, because on a phone the second
is measured against a toolbar that is not there yet.

Wide content scrolls inside itself: `.table-scroll` on the container, and
`min-w-0` on every flex and grid child that could otherwise size to its widest
content and push the page sideways.

## 6. Components

All of them live in `ui.tsx`.

| Component | What it is for | The rule it enforces |
|-----------|----------------|----------------------|
| `Card` / `CardTitle` | a panel and its heading | `min-w-0`, so one wide table cannot widen the page |
| `Metric` | one number and what it counts | `null` renders as "нет данных", never as `0` |
| `Badge` | status | a word first, colour second |
| `StatusStrip` | the verdict at the top of a screen | computed from the counts the page then shows |
| `FlagList` | feature flags | states, never switches |
| `Freshness` | how old the answer is | ages on a timer, not on re-render |
| `SyntheticNotice` | which build this is | rendered by the shell, so no screen can forget it |
| `FilterSelect` | a filter over a closed list | only ever bound to a field the server filters on |
| `EmptyState` | nothing here | says why, and what would put something here |
| `ErrorState` | it did not load | the server's code, and a retry; never a stack or a payload |
| `Skeleton` | loading | the shape of the answer |
| `TableFrame` / `Th` / `Td` | tabular data | scoped headers, sticky header row, contained overflow |
| `Drawer` | one record in detail | dialog semantics, focus trapped, Escape, focus returned |
| `Field` | a labelled value | for use inside `dl` |
| `DataGap` | a number that is not available | says what is missing and why |
| `PageHeader` | the screen's `h1` | a `div`, because the shell owns the one banner landmark |

### States every screen implements

Loading is a skeleton shaped like the answer — a verdict block, a row of tiles,
the panels — not a spinner in an empty screen. Empty explains why it is empty
and what would fill it. Error names what the server said and offers a retry, and
shows no stack and no payload. Stale keeps the data on screen, marks the age and
offers a refresh; it never blanks a working table. Synthetic is marked in the
header and again above every screen.

## 7. Focus and motion

Focus is a 2px `--accent` outline with a 2px offset, applied through
`:focus-visible` on everything. It is never removed.

Motion is one keyframe, the skeleton pulse, and it is disabled under
`prefers-reduced-motion: reduce` along with every transition. There is no
animation framework, no page transition and no scroll effect. A console is
opened during an incident; nothing on it should need to finish animating.

## 8. What is deliberately not here

No chart library, no calendar, no map, no date picker, no drag and drop, no icon
package, no remote font, no CSS-in-JS, no component library. Icons are inline
SVG on a 24 grid, drawn in `AppShell.tsx` and at the call site. Emoji are never
used as icons.

## 9. Provenance

The card, badge, table and metric shapes and the rail-plus-header arrangement
come from TailAdmin (MIT). The licence and the exact commit are recorded in
`docs/licenses/TAILADMIN_MIT_LICENSE.md`, and what was and was not taken is in
`docs/admin/BORMI_ADMIN_TAILADMIN_INVENTORY.md`. TailAdmin is a source template,
not a dependency and not an installed skill. Everything above — the colour
meanings, the scroll model, the truthfulness rules and the states — is Bormi's.
