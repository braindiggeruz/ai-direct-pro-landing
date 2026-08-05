# Third-party notices — Bormi Admin

This panel adapts interface patterns from two MIT-licensed projects. Neither is
a runtime dependency: no package was installed from either, and nothing here is
a verbatim copy. In both cases what was taken is the *shape* of a component —
its layout, its motion, its state machine — reimplemented against this panel's
own design tokens, its own icon set and the real Admin API contracts.

## useLayouts

- Project: <https://github.com/iurvish/uselayouts>
- Copyright © Urvish Mali
- Licence: MIT
- Pinned source commit: `5ed0d94454374b47ed9805bf204a412bc2d3d456`
- Registry read: `bento-card`, `discrete-tabs`, `status-button`, `stacked-list`,
  `list-item`, `dynamic-toolbar`

Adapted into `src/components/premium.tsx`:

| useLayouts component | What was taken | Where it is used |
| --- | --- | --- |
| `bento-card` | Grid of unequal-mass cards; restrained hover lift; staggered entrance | `Bento`, `BentoCard` — Command Center, Access, Moderation, System |
| `discrete-tabs` | Shared-element active indicator that travels between options (`layoutId`) | `DiscreteTabs` — Listings, Moderation, Reports, Operations filters |
| `status-button` | idle → loading → success/error command button with an inline state badge | `StatusButton`, `useCommand` — every moderation and lifecycle command |
| `stacked-list` | Row rhythm and staggered list entrance | `StackedList`, `StackedRow` — moderation queue, reports, attention queue, audit |
| `list-item` | Compact chip filters over a short closed vocabulary | `FilterChips` — district, reason, seller type, severity |
| `dynamic-toolbar` | Contextual command surface attached to one record | `DynamicToolbar` — listing detail, moderation detail, report detail |

Deliberate departures, all for the same reason — this is a console somebody
works in, not a page they scroll once:

- **No demo data.** The originals ship invented teammates, avatar images hosted
  on a third party, and marketing copy. None of it is present; every value on
  screen comes from an Admin contract or from the local fixture set.
- **No `setTimeout` success.** `status-button` fakes its success state on a
  timer. Here `success` is reachable only after the server confirms, because a
  tick that appears on a timer tells a moderator a listing was removed when the
  request may have returned 409.
- **No second icon library.** The originals depend on `@hugeicons/react` and
  `@hugeicons/core-free-icons`. This panel already draws its own line icons on
  one 24 grid, so neither package was added.
- **Shorter, non-looping motion.** Springs that overshoot and per-character text
  morphs are lovely once and tiring by the fortieth listing. Durations here are
  120–240 ms, and every animated component also reads
  `prefers-reduced-motion` in JavaScript rather than relying on CSS alone.

## TailAdmin

- Licence: MIT
- The original arrangement of the shell — fixed sidebar, thin sticky header,
  cards on a quiet canvas — and the first card, badge, table and metric shapes
  in `src/components/ui.tsx`.

## Dependencies added for the above

| Package | Version | Why |
| --- | --- | --- |
| `motion` | `^12.42.2` | Shared-element indicator, list entrance, expand/collapse. Already used elsewhere in this repository at the same major version. |

`clsx` and `tailwind-merge` are listed by the useLayouts registry entries but
were **not** added: this panel composes class strings directly and ships a
four-line `cn` helper in `src/components/premium.tsx` instead.
