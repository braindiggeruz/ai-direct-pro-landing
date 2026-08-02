# Bormi production adaptation

Date: 2026-08-02

## Required skill inputs

- UX/UI: `C:\Users\Borinio\.codex\skills\ui-ux-pro-max\SKILL.md`
  with `references/pro-rules.md` and `references/quick-reference.md`.
- 21.dev: `C:\Users\Borinio\.codex\skills\21st-ai\SKILL.md`,
  `21st-cli-use/SKILL.md`, `21st-design-sync/SKILL.md` and
  `21st-registry/SKILL.md`.
- UX/UI `--design-system` output: `design-system/bormi/MASTER.md`.

The generated master is discovery input, not a literal implementation spec.
Its vibrant block composition, system spacing and visible-state guidance were
accepted. Its rose/blue palette, remote display fonts, App Store landing
layout, ratings, reviews, QR, GSAP and hover-heavy cards were rejected because
they conflict with the Bormi identity, Telegram WebView performance or the
available product evidence.

## Applied UX/UI methods

- Brand hierarchy: `Bormi` is the public product; `Bormi? — Bor.` is the
  promise; seller mode is subordinate to the same product brand.
- Attention hierarchy: promise, visible search, catalog-truth line,
  categories, then image-first products and one primary card action.
- Mobile-first 8 px rhythm, 44 px minimum targets, safe-area navigation,
  semantic tokens, 4.5:1 contrast, keyboard focus trap and Escape recovery.
- System-first typography, WebP previews, eager loading only for the first two
  images, cache-first immutable assets and a filled static first paint.
- RU/UZ presentation parity, known-category localization, light/dark themes,
  320/390/landscape/200% geometry and reduced-motion verification.
- Honest conversion: synthetic media is labelled; checkout remains a seller
  request, not payment; product/store/status facts remain server-grounded.

## Adapted 21.dev patterns

- Product Card / Product Reveal Card: image-first square media, overlaid
  availability, source store, price, details CTA and compact comparison action.
- SearchBar: prominent home entry, anchored search field, leading icon,
  inline clear and adjacent filter action.
- Filter Chips Breadcrumb: horizontally scrollable category chips and visible
  selected filter state.
- Bottom Menu / Modern Mobile Menu / Floating Nav: four labelled buyer
  destinations, five seller destinations, active state and safe-area handling.
- Drawer / Dialog Modal Drawer: accessible mobile bottom sheets with focus
  containment, Escape/backdrop close and a visible handle.
- Checkout / Account Setup: progressive six-step request flow with explicit
  progress, summary and request-not-payment notice.
- Order Status Card: compact status timeline in order history.
- Empty State and Skeleton: action-oriented recovery and stable image-card
  placeholders without layout shift.
- Seller dashboard: compact exact KPIs and priority order/question work lists.
- Comparison tray: contextual fixed tray above navigation with count, open and
  clear actions.

## Rejected 21.dev patterns

- Framer Motion, Tailwind, Lucide, Radix and shadcn package imports: rejected
  to preserve the current two-dependency React client and WebView bundle.
- Hover reveal, 3D, glow, carousels and background decoration: rejected as
  touch-hostile, distracting or costly.
- Ratings, discount claims, favourite counts and testimonials: rejected
  because no production evidence exists.
- Label-only-when-active navigation: rejected for discoverability and RU/UZ
  clarity.
- Nested dialogs and payment-method UI: rejected because they add complexity
  and payment is outside the authorized product scope.
- Desktop sidebars and generic dashboard shells: rejected because Bormi is a
  mobile consumer marketplace inside Telegram, not a shadcn admin template.

## Voice search stage (2026-08-02)

Additional UX/UI queries: `--domain ux "voice input microphone permission
recording feedback accessibility"`, `--domain ux "AI interaction transparency
loading progress cancel streaming"`, `--domain ux "bottom sheet modal filter
chips search empty state"`.

Adopted from the skill:

- AI disclosure: the transcript is labelled as machine-recognized and stays
  editable, never presented as if the buyer typed it.
- Feedback: no step over 300 ms is silent — live waveform and timer while
  recording, a cancellable recognition state after.
- Errors are announced (`role="alert"`) and each names its own recovery, rather
  than being signalled by colour.
- Icon-only microphone and every chip remove button carry an `aria-label` that
  names the constraint.
- The countdown uses colour **and** a numeric timer.
- The transcript editor has a real hidden `<label>`, not a placeholder.
- Haptics on record start, stop and success only.
- A zero-result voice search offers removing a constraint instead of a dead end.

Rejected at this stage:

- Autocomplete suggestions — would imply demand data Bormi does not have over a
  synthetic catalog.
- Streaming partial transcripts — needs a second transport and streaming
  recognition; a 30-second cap with a visible timer is the honest answer.
- Thumbs up/down on the transcript — implies a learning loop that does not exist.
- The generated MASTER rose/blue palette, remote display fonts and GSAP were
  rejected again, for the same identity and WebView-performance reasons.

Adapted 21.dev patterns:

- Search field with contextual trailing action → the microphone lives inside the
  field; the filter control moved to the chip row, because four controls do not
  fit a 320 px WebView.
- Recording bottom sheet → reuses the existing accessible Bormi sheet (focus
  trap, Escape, backdrop, handle) rather than a new dialog primitive.
- Waveform/timer → 28 `transform: scaleY()` bars from an `AnalyserNode` sampled
  every 70 ms; no canvas, no width/height animation.
- Status transitions → one sheet, five states, not five screens.
- Filter chips → the understood budget and stock constraints reuse the category
  chip and are bound to live filter state, so removing a chip removes both the
  pill and the constraint.
- Inline feedback, confirmation and error states, accessible icon buttons.

Rejected 21.dev patterns:

- Framer Motion / Radix / shadcn / Lucide imports — the client keeps its two
  runtime dependencies.
- Canvas or WebGL visualisers — cost and battery for a decorative meter.
- Press-and-hold-to-talk — unreliable against Telegram's own swipe handling and
  hostile to motor-impaired users; tap to start, tap to stop.
- Live "listening…" partial text — implies streaming recognition that is not
  implemented.
- A floating voice FAB — it would cover the comparison tray.

Limitation: the 21.dev catalog was not queried live this stage. `21st whoami`
returns `Not logged in` and `21st search` requires `TWENTYFIRST_TOKEN`; login
opens a browser and needs the owner. Patterns were adapted from the skill
documentation and the pattern set already recorded above.

## Verification

- 21.dev CLI review: 0 errors, 0 warnings after removing disorienting
  checkout autofocus.
- Axe: 0 violations and 0 incomplete results for buyer RU, buyer UZ, buyer
  dark and seller dashboard.
- Geometry: no overflow and no sub-44 px targets at 320, 390, landscape and
  200% text scale; reduced-motion transition resolves to 0.001 ms.
