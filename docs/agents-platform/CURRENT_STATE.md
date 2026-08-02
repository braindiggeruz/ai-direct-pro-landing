# CURRENT_STATE — 2026-08-01

## Bormi production rebrand (2026-08-02)

The working Telegram marketplace is now publicly branded **Bormi**, with the
mechanic **Bormi? — Bor.** Application source `5c9e004` is live on static
production deployment `2fc305fb-3a68-48c2-b7cf-adf218cd2a7a` and root/BFF
deployment `2625bbad-5899-4d51-967d-85347d6c8ecc`. The canonical Mini App is
`https://gptbot-market-mini-app.pages.dev`; the dedicated entry remains
`@BormiMarketBot`, with the Bormi profile, avatar, localized metadata, webhook
and native Mini App menu. Exact bot identity is verified before bounded sync.

The first paint is now a branded, filled catalog shell; the first two product
images are preloaded, assets are cache-first and seller code stays lazy. Twelve
labelled synthetic WebPs total 232,770 bytes, including four new cohesive
investor-demo photos. Buyer RU/UZ, dark theme and seller surfaces pass automated
a11y with zero violations/incomplete; narrow, landscape and 200 percent layouts
have no overflow or undersized controls.

Live HTTP/auth/CORS/webhook contracts pass. Read-only production D1 counts are
unchanged at 1 store, 48 products, 1 existing order/item, 44 inventory moves
and zero handoffs/notifications. A verified backup preceded the scoped update
of two bot-username references; the final read probe wrote zero rows. No schema
migration, real catalog, payment, lead-bot or public-marketplace operation was
performed.
The exact release record is
`mini-app/implementation/BORMI_REBRAND_RELEASE.md`.

## Mini App Telegram review release (2026-08-02, superseded baseline)

The owner explicitly authorized Telegram integration. The Mini App is live at
`https://gptbot-market-mini-app.pages.dev` and opens from the dedicated
`@gptbot_market_bot` through a native response button plus safe menu sync. The
versioned BFF is live on `gptbot.uz`; all four bounded Mini App flags are on,
with exact-origin CORS and server-derived seller authority. No D1 migration,
lead-bot/webhook change, Railway/n8n/payment, real seller or public-marketplace
operation was performed. Native Telegram review is now the next human gate.

The performance release at source `fb3537a` is live on static deployment
`a08d2d0f-ab72-4be2-a385-c482025833a5` and root/BFF deployment
`f64e7fee-3b3c-4914-9fc2-3d80e5e761db`. It collapses the three-step startup
waterfall into one authenticated launch request, paints filled demo cards
immediately and ships eight labelled synthetic WebP product photos (157,434
bytes total). No production catalog or media row was mutated.

## Current production state

GPTBot Market owner-independent productization is complete and deployed.

- Canonical repository: `F:\Claude\gptbot-repo-clean-20260801`.
- Current application source: `5c9e004` on the isolated Mini App branch.
- Cloudflare Pages deployment:
  `2625bbad-5899-4d51-967d-85347d6c8ecc`.
- Immutable URL: `https://2625bbad.ai-direct-pro-landing.pages.dev`.
- Pre-cutover rollback: `426a2f7e-7ff1-4a95-8001-a6bed6230947`, source
  `c106d6da202f7f04bad2c966b22dc0ea6925b719`.
- Canonical URL: `https://gptbot.uz`.
- Telegram identity: `@BormiMarketBot`; its responses carry a native Mini
  App button and the global menu is synchronized idempotently.

The production canary passes root, RU/UZ Market, immutable deployment, GPT
Chat, 404, canonical, hreflang and OG. The webhook returns 405 to GET and 401
to both empty and malformed unauthorized POST; Owner Control Center returns
401 without a session. Production automated a11y/mobile evidence passes on the
immutable URL.

## Product result

Naming is now explicit: GPTBot master brand, GPTBot Market buyer product,
Sotuvchi by GPTBot verified seller program, GPTBot.uz support/trust domain.
The canonical promise is limited to finding products in connected catalogs.

The Warm Market Signals system is implemented in production CSS/components
and assets: deep teal, warm ivory, ink surfaces, restrained coral, semantic
states, visible focus, 44px targets, responsive wide layout, tabular UZS and
reduced motion. RU/UZ Market and Trust pages have buyer/seller paths,
synthetic proof, request-not-payment and responsibility boundaries.

Telegram keeps buyer-first authority-aware routing. Product cards now project
exact media/freshness facts, accept only opaque Telegram `file_id`, use at most
two contextual actions and place navigation in a separate compact footer.
Unknown sellers see a verified-pilot application, while verified active,
paused and suspended states remain server-authorized and fail closed.

The package includes 33 editable SVG creative masters plus 33 PNG exports,
brand/Telegram identity/website packs, RU/UZ buyer concepts, seller pilot and
onboarding materials, marketing positioning, privacy-safe metric dictionary,
operations runbooks and an exact owner evidence script. Every synthetic asset
is labelled; no testimonial, seller result or commercial metric is invented.

## Release gates

- Full repository: **1146/1146**, 0 fail.
- Release, Store Pilot and Owner Control Center targeted corpus: 100/100.
- Root and Functions TypeScript: PASS.
- Backend typecheck/build/audit: PASS/PASS/0 findings.
- Root build: PASS; 113 pages, 118 articles, sitemap 234.
- Pages Functions build: PASS.
- Scoped ESLint: 0 errors; agent boundaries 0 violations and 10/10.
- Root production audit: 0 findings across 115 dependencies.
- Secret scan: clean over 2,936 files; browser bundle scan clean over 14 JS
  bundles.
- Migration and backup/restore rehearsals: PASS, local only.
- Automated production accessibility: 7 cases, 0 violations/incomplete, 171
  passed rule instances, 18/18 overflow cases, 12/12 focus steps and reduced
  motion PASS.
- `git diff --check` and `git fsck --full`: PASS/no corruption.

## Production data and operations

Read-only D1 before and after the performance deployment is identical: 1
synthetic store, 48 synthetic products, 44 inventory moves, 1 existing order,
1 order item, and zero notifications or handoffs. Both probes report
`changed_db=false` and `rows_written=0`.

Migrations 0026–0030 are physically present, but the ledger ends at 0025.
Remote migration was not run and must not be used to “repair” the ledger.

Cloudflare production auto-deploy is false and preview deployment is none. The
manual Pages upload records the exact merge source. The first-party automation
Worker and `*/15` trigger were not mutated. n8n remains retired and its old
ingest returns 410. GitHub SEO scheduling is `disabled_manually`; D1 scheduling
is `disabled` with no active days. Railway had no available CLI/token for a
fresh control-plane read; no backend file or Railway setting was changed and no
reconnect was performed.

## Honest limits

- Store Pilot #1 is not started; real stores onboarded: 0.
- Payments, escrow, logistics and public marketplace: not authorized.
- Public launch: blocked.
- Native Uzbek sign-off: pending.
- VoiceOver/TalkBack: not run.
- Authenticated Owner Control Center capture: pending owner session.
- Fresh Telegram provider `getMe`/webhook queue/error output: pending owner
  canary because no token was exported. Public identity and runtime auth pass.
- Stable p95: not claimed.

## Exact next action

Collect the one consolidated owner evidence/input package in
`release/GPTBOT_MARKET_OWNER_EVIDENCE_SCRIPT.md`: Telegram `/start` and one
search screenshot plus clarity/device/locale, protected OCC captures, legal
and native Uzbek decisions, and one verified consenting seller with 10–30
approved products, SLA/operations roles and explicit one-store authorization.
Do not create the real store until that authorization is explicit.
