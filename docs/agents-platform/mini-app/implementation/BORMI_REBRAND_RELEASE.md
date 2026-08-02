# Bormi production rebrand release

Date: 2026-08-02.

Status: `BORMI_REBRAND_LIVE_FOR_TELEGRAM_REVIEW`.

Public brand: **Bormi**. Brand mechanic: **Bormi? — Bor.**

Dedicated bot: `@BormiMarketBot`. Its exact identity, Bormi profile, avatar,
localized commands, webhook and native Mini App menu are live. The lead bot,
its route and token were not changed.

## Exact release

- Application source: `5c9e004c1b21e13a1ff0913f1c6d54f99d367f10`.
- Static production deployment:
  `2fc305fb-3a68-48c2-b7cf-adf218cd2a7a` at
  `https://gptbot-market-mini-app.pages.dev`.
- BFF and Telegram entry production deployment:
  `2625bbad-5899-4d51-967d-85347d6c8ecc` at `https://gptbot.uz`.
- Static rollback: `a08d2d0f-ab72-4be2-a385-c482025833a5`, source
  `fb3537a`. Root rollback: `f64e7fee-3b3c-4914-9fc2-3d80e5e761db`, source
  `fb3537a`.
- Root rollback before the new-bot cutover:
  `426a2f7e-7ff1-4a95-8001-a6bed6230947`, source `c106d6d`.
- No D1 schema migration, product/catalog write, payment, real-store
  activation, Railway/n8n change or public-marketplace authorization occurred.

## BormiMarketBot cutover

- A fresh production D1 export was created before mutation, restored in memory
  with `integrity_check=ok`, and hashed SHA-256. It is stored outside Git at
  `F:\Claude\gptbot-bormi-migration-backups\20260802-new-bot-cutover-c106d6d\gptbot-ai-drafts-before-bormimarketbot.sql`.
- Only the two current ownership references were moved to `bormimarketbot`:
  one `telegram_agent_routes` row and one `sotuvchi_storefront_sessions` row.
  Historical update/metric attribution was intentionally retained.
- Before/after domain counts are identical: 1 store, 48 products, 1 order,
  1 order item, 44 inventory moves, and 0 handoffs/notifications. The final
  verification was read-only with `rows_written=0`.
- The one-time cutover hook verified `getMe`, installed the exact webhook and
  native menu, uploaded the approved flat `b` avatar, and applied default/RU/UZ
  metadata. It was then removed. Permanent hourly metadata/menu sync retains
  exact-username verification and fails closed on identity mismatch.
- Public Telegram verification passes: title `Bormi`, description
  `Bormi? — Bor. Найдите, сравните и выберите товар прямо в Telegram.`, and the
  exact white `b` / lime dot / violet-square avatar. The remaining acceptance
  gate is the owner's native `/start` and Mini App launch canary.

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
  sync applies Bormi metadata for default, RU and UZ only after exact
  `@BormiMarketBot` identity verification.

## Verification

- Mini App TypeScript/tests/build: PASS / 2 of 2 / PASS.
- Candidate build: HTML 4.48 kB (1.98 gzip), CSS 25.01 kB (6.12), buyer JS
  269.99 kB (83.84), lazy seller JS 15.26 kB (3.62).
- New-bot cutover corpus: 208 of 208 PASS. Functions TypeScript and scoped
  ESLint: PASS.
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
- Secret scan: 2,966 files clean. Production browser bundles contain no old
  public brand, fixture marker or token. `git diff --check` passes.
- Live: canonical and immutable static roots 200; Bormi mark 200 SVG; first
  product photo 200 WebP; root 200; empty session exchange controlled 400;
  trusted CORS 204 with exact origin and `Vary: Origin`; foreign CORS 403;
  Market webhook GET 405 and unauthenticated POST 401.
- Production D1 domain counts after the scoped identity cutover: 1 store,
  48 products, 1 existing order, 1 order item, 44 inventory moves, 0 handoffs
  and 0 notifications. The final read probe reports `rows_written=0`.

## Honest gate and rollback

Native `/start` and Mini App inspection in `@BormiMarketBot` by the owner is the remaining human
acceptance gate. Native Uzbek linguistic sign-off and VoiceOver/TalkBack are
not claimed. Real seller onboarding, payment and public marketplace launch
remain separate explicit authorizations.

For visual rollback, restore the static and root deployments listed above and
disable seller commands, seller reads, buyer and global flags in that order.
Restore Telegram's default menu button if needed. Do not roll D1 back: this
release added no migration and performed no domain write.
