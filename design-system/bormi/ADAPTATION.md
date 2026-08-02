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

## Verification

- 21.dev CLI review: 0 errors, 0 warnings after removing disorienting
  checkout autofocus.
- Axe: 0 violations and 0 incomplete results for buyer RU, buyer UZ, buyer
  dark and seller dashboard.
- Geometry: no overflow and no sub-44 px targets at 320, 390, landscape and
  200% text scale; reduced-motion transition resolves to 0.001 ms.
