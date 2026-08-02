# Bormi production rebrand release

Date: 2026-08-02.

Status: `BORMI_REBRAND_LIVE_FOR_TELEGRAM_REVIEW`.

Public brand: **Bormi**. Brand mechanic: **Bormi? — Bor.**

Dedicated bot: `@gptbot_market_bot`. The legacy username is a Telegram-owned
identifier; all controllable display identity, copy and launch surfaces are
Bormi. The lead bot, its route and token were not changed.

## Exact release

- Application source: `e1101bc49c7bf76578636d7bd78bffea6ad8c79d`.
- Static production deployment:
  `2fc305fb-3a68-48c2-b7cf-adf218cd2a7a` at
  `https://gptbot-market-mini-app.pages.dev`.
- BFF and Telegram entry production deployment:
  `25da3f26-5ac3-44a1-9628-0d4f1735ed7d` at `https://gptbot.uz`.
- Static rollback: `a08d2d0f-ab72-4be2-a385-c482025833a5`, source
  `fb3537a`. Root rollback: `f64e7fee-3b3c-4914-9fc2-3d80e5e761db`, source
  `fb3537a`.
- No D1 migration, product/catalog write, payment, real-store activation,
  Railway/n8n change or public-marketplace authorization occurred.

## Skills and design method

`UX_UI_SKILL_USED=YES`

Read and applied:

- `C:\Users\Borinio\.codex\skills\ui-ux-pro-max\SKILL.md`;
- `references/pro-rules.md` and `references/quick-reference.md`;
- generated design-system source at `design-system/bormi/MASTER.md`, with
  product-specific adaptation recorded in `design-system/bormi/ADAPTATION.md`.

Applied methods: brand and attention hierarchy, task-first information
architecture, 8 px visual rhythm, 44 px touch targets, mobile-first WebView
layout, visible keyboard focus, semantic light/dark tokens, safe-area handling,
reduced motion, RU/UZ content fit, image/performance budgeting and screenshot
QA at 320/390 px, landscape and 200 percent zoom.

`21_DEV_SKILL_USED=YES`

Read and applied:

- `C:\Users\Borinio\.codex\skills\21st-ai\SKILL.md`;
- `21st-cli-use/SKILL.md`, `21st-design-sync/SKILL.md` and
  `21st-registry/SKILL.md`.

Adapted patterns: SearchBar, filter chips, image-first Product Card/Product
Reveal, floating bottom navigation, comparison tray, modal drawer/product
sheet, sticky product and checkout actions, compact checkout stepper, order
status timeline, skeleton and empty states, and a compact seller KPI/worklist.
The final `21st` review reports 0 errors and 0 warnings.

Rejected patterns: Framer Motion/Tailwind/Lucide/Radix/shadcn dependencies
(bundle and stack mismatch); 3D/glow/carousel and hover-only reveals
(WebView clarity, motion and input cost); fabricated ratings, discounts,
favorites or testimonials (not domain truth); label-only-active navigation
(discoverability); nested dialogs and payment UI (mobile complexity and no
payment authority); desktop sidebars and generic dashboards (wrong form
factor and product character).

## Product result

- New Bormi mark, violet/lime/coral consumer palette, warm light canvas and a
  contrast-safe dark theme.
- Static Bormi first-paint shell, preloaded first two product images,
  cache-first service worker and lazy seller bundle reduce perceived launch
  latency before React and authenticated catalog data settle.
- Buyer home now has a visible search task, clear product-status truth,
  image-first cards, compare tray, product detail sheet, sticky checkout and
  order timeline. Seller mode prioritizes actionable work over vanity totals.
- RU and Uzbek Latin copy, category labels and currency notation are localized.
- Twelve labelled synthetic WebPs total 232,770 bytes. Four new cohesive
  768x768 investor-demo photos cover headphones, speaker, desk lamp and kettle;
  no seller, review, traction or commercial result is fabricated.
- Dedicated Market bot responses and menu button use Bormi. A bounded one-hour
  sync also applies the Bormi display name, description and short description
  for default, RU and UZ on the next legitimate incoming Market-bot request.

## Verification

- Mini App TypeScript/tests/build: PASS / 2 of 2 / PASS.
- Candidate build: HTML 4.48 kB (1.98 gzip), CSS 25.01 kB (6.12), buyer JS
  269.99 kB (83.84), lazy seller JS 15.26 kB (3.62).
- Root TypeScript and production build: PASS; 113 pages, 124 articles, sitemap
  240 after the independent content commit `bc2792b`.
- Root suite excluding only the stale route-baseline file: 1065 of 1065 PASS.
  The full 1091-test invocation has three unrelated failures in
  `react-router-v8-migration.test.ts`: it still expects the pre-content sitemap
  total 234 while the independent content commit produces 240. No Bormi
  assertion fails.
- Affected integration corpus: 137 of 137 PASS. Core targeted corpus: 40 of 40
  PASS. Scoped ESLint: PASS.
- Automated accessibility: buyer RU, buyer UZ, buyer dark and seller each have
  0 axe violations and 0 incomplete checks. At 320/390 px, landscape and 200
  percent zoom there is no horizontal overflow and no active target below
  44 px. Reduced-motion behavior passes.
- Secret scan: 2,951 files clean. Production browser bundles contain no old
  public brand, fixture marker or token. `git diff --check` passes.
- Live: canonical and immutable static roots 200; Bormi mark 200 SVG; first
  product photo 200 WebP; root 200; empty session exchange controlled 400;
  trusted CORS 204 with exact origin and `Vary: Origin`; foreign CORS 403;
  Market webhook GET 405 and unauthenticated POST 401.
- Production D1 before/after domain counts: 1 store, 48 products, 1 existing
  order, 1 order item, 44 inventory moves, 0 handoffs and 0 notifications.
  The after probe reports `changes=0`, `changed_db=false`, `rows_written=0`.

## Honest gate and rollback

Native Telegram iOS/Android inspection by the owner is the remaining human
acceptance gate. Native Uzbek linguistic sign-off and VoiceOver/TalkBack are
not claimed. Real seller onboarding, payment and public marketplace launch
remain separate explicit authorizations.

For visual rollback, restore the static and root deployments listed above and
disable seller commands, seller reads, buyer and global flags in that order.
Restore Telegram's default menu button if needed. Do not roll D1 back: this
release added no migration and performed no domain write.
