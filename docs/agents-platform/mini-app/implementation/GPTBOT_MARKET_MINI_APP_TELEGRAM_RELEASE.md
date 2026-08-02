# GPTBot Market Mini App Telegram review release

Date: 2026-08-02.

Status: `TELEGRAM_REVIEW_LIVE`.

Bot: `@gptbot_market_bot` (dedicated Agents token namespace only).

## Released topology

- Static Telegram Mini App: `https://gptbot-market-mini-app.pages.dev`.
- Static Pages deployment: `a7e0cfdc-c53e-4ddd-a9df-13023a6fbafc`, source
  `67b98a5`.
- BFF and Telegram integration: `https://gptbot.uz/api/market/v1/*` and the
  existing dedicated Agents webhook.
- Root Pages deployment: `3af470f3-0666-4d4d-8eab-53c91a7cd9df`, source
  `67b98a5`.
- Immediate integrated rollback: `b648146a-9a05-4214-8529-1da812850275`,
  source `47a605d`.
- Pre-Mini-App safe rollback: `68747046-8e1e-492a-8b81-dc4e4065916f`, source
  `08c2156`.

The app loads the official Telegram Web App bridge. The dedicated bot adds a
native `web_app` launch button to responses and performs an idempotent,
TTL-limited global menu-button sync. The existing lead bot token, webhook and
route were not changed.

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
- Mini App assets: JS 275.09 kB / 82.88 kB gzip; CSS 15.62 kB / 4.23 kB
  gzip; HTML 1.03 kB / 0.56 kB gzip.
- Market auth/contract corpus: 14/14; Agents webhook: 56/56; platform
  boundaries: 10/10.
- Static response: 200, official bridge present, strict CSP, `noindex,
  nofollow`.
- Trusted CORS preflight: 204 with exact origin and `Vary: Origin`; untrusted
  origin: 403.
- Forged Telegram init data: controlled 401; agents webhook GET: 405;
  invalid webhook secret: 401.
- Root, RU/UZ Sotuvchi, RU/UZ Trust and static app: 200.
- Read-only D1 probe: 1 store, 48 products and zero orders, order items,
  handoffs or notifications; `changed_db=false`, `rows_written=0`.

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
