# GPTBot Market Mini App Telegram review release

> Superseded on 2026-08-02 by the live Bormi release at source `e1101bc`,
> static deployment `2fc305fb-3a68-48c2-b7cf-adf218cd2a7a` and root deployment
> `25da3f26-5ac3-44a1-9628-0d4f1735ed7d`. See
> `BORMI_REBRAND_RELEASE.md`. This file remains the rollback baseline.

Date: 2026-08-02.

Status: `TELEGRAM_REVIEW_LIVE_PERFORMANCE_RELEASE`.

Bot: `@gptbot_market_bot` (dedicated Agents token namespace only).

## Released topology

- Static Telegram Mini App: `https://gptbot-market-mini-app.pages.dev`.
- Static Pages deployment: `a08d2d0f-ab72-4be2-a385-c482025833a5`, source
  `fb3537a`.
- BFF and Telegram integration: `https://gptbot.uz/api/market/v1/*` and the
  existing dedicated Agents webhook.
- Root Pages deployment: `f64e7fee-3b3c-4914-9fc2-3d80e5e761db`, source
  `fb3537a`.
- Immediate performance-release rollback: static
  `a7e0cfdc-c53e-4ddd-a9df-13023a6fbafc` and root
  `3af470f3-0666-4d4d-8eab-53c91a7cd9df`, both source `67b98a5`.
- Immediate integrated rollback: `b648146a-9a05-4214-8529-1da812850275`,
  source `47a605d`.
- Pre-Mini-App safe rollback: `68747046-8e1e-492a-8b81-dc4e4065916f`, source
  `08c2156`.

The app loads the official Telegram Web App bridge. The dedicated bot adds a
native `web_app` launch button to responses and performs an idempotent,
TTL-limited global menu-button sync. The existing lead bot token, webhook and
route were not changed.

## Launch performance and investor demo media

- Startup now uses one authenticated `POST /session/launch` round trip. Session,
  bootstrap and first catalog data no longer form three sequential client
  requests; bootstrap and catalog payloads are composed in parallel after the
  same server-side identity and access checks.
- Telegram initialization runs before React mount, the official bridge is
  deferred, the seller bundle is lazy-loaded and the first catalog payload is
  seeded into the query cache.
- The first loading paint is a filled four-card catalog preview instead of a
  blank spinner. Eight coherent, generated product photos cover the first
  production catalog page: notebook, bottle, power bank, car holder, charger,
  USB cable, calculator and note cards.
- The WebP set is 157,434 bytes total; every file is 800 x 600, each is below
  50 kB, the first two are preloaded and all immutable assets use cache-first
  service-worker handling. Cards with a local preview do not start a protected
  media-proxy request.
- The UI explicitly labels the images as demo/synthetic. No seller identity,
  review, traction, order or commercial result was fabricated, and no catalog
  row or media reference was changed in D1.

## Production configuration

- Global, buyer, seller-read and seller-command Mini App flags are enabled.
- The only allowed browser origin is
  `https://gptbot-market-mini-app.pages.dev`.
- `MARKET_MINI_APP_SESSION_SECRET` is stored as a new encrypted Pages secret;
  no secret value was read into evidence or Git.
- The existing encrypted `TELEGRAM_AGENTS_BOT_TOKEN` is reused in place; it
  was not copied or printed.
- Seller authority is still derived server-side from Telegram identity,
  membership and active-store state. UI mode selection grants no authority.

## Evidence

- Full repository suite: exit 0.
- Root TypeScript and production build: pass; 113 pages, 118 articles,
  sitemap 234.
- Mini App tests: 2/2; TypeScript and production build pass.
- Mini App assets: buyer/main JS 264.30 kB / 82.20 kB gzip; lazy seller JS
  15.05 kB / 3.54 kB gzip; CSS 16.64 kB / 4.43 kB gzip; HTML 1.37 kB /
  0.65 kB gzip; demo WebP set 157.43 kB raw.
- Market auth/contract corpus: 15/15; Agents webhook: 56/56; platform
  boundaries: 10/10.
- Static response: 200, official bridge present, strict CSP, `noindex,
  nofollow`.
- Trusted CORS preflight: 204 with exact origin and `Vary: Origin`; untrusted
  origin: 403.
- Forged Telegram init data: controlled 401; agents webhook GET: 405;
  invalid webhook secret: 401.
- Root, RU/UZ Sotuvchi, RU/UZ Trust and static app: 200.
- Cold HTTP probes after release: HTML TTFB 314 ms, main JS TTFB 363 ms and
  first WebP TTFB 321 ms from the release workstation. These are point probes,
  not a stable-p95 claim.
- Read-only D1 before/after: 1 store, 48 products, 1 existing order, 1 order
  item, 44 inventory moves and zero handoffs or notifications; both probes
  returned `changed_db=false`, `rows_written=0`.

A normal browser intentionally shows the unsupported-environment state. A
native Telegram launch is the remaining human acceptance check; native
Uzbek, VoiceOver/TalkBack and stable p95 are not claimed.

## Rollback

1. Set seller commands off, then seller reads, buyer and global flags off.
2. Restore Telegram's default menu button with Bot API/BotFather so the
   already-synced `web_app` button is removed.
3. Roll root Pages back to `68747046-8e1e-492a-8b81-dc4e4065916f` for a full
   pre-Mini-App rollback, or to `b648146a-9a05-4214-8529-1da812850275` to
   retain the integrated code revision.
4. The static project may remain unreachable from the bot or be rolled back
   to `3e2b8b0f-80f5-4438-9e5e-8432a2061986`.
5. Do not roll D1 back: this release added no migration and its domain writes
   remain valid records if a reviewer deliberately submits a request.
6. Re-run the HTTP/auth/D1 canaries and retain deployment evidence.
