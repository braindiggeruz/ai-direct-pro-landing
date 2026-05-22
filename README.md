# AI Direct Pro — Telegram Ads Landing

Mini conversion landing (RU/UZ) for AI Sales Assistant for Instagram & Telegram.

## Stack
- Vite + React 19 + TypeScript
- Tailwind CSS v3
- Static deploy → Cloudflare Pages

## Develop
```bash
yarn install
yarn dev
```
Opens at http://localhost:3000

## Build
```bash
yarn build
```
Outputs static site to `./dist`.

## Deploy to Cloudflare Pages
Project is configured for Cloudflare Pages with these settings:

| Setting               | Value          |
|-----------------------|----------------|
| Framework preset      | Vite           |
| Build command         | `yarn build`   |
| Build output dir      | `dist`         |
| Node version          | `20`           |

Cloudflare Pages will auto-deploy on every push to `main`.

## Structure
- `src/App.tsx` — page composition
- `src/i18n.ts` — RU/UZ copy (single source of truth)
- `src/lib/cta.ts` — central `CTA_URL` + UTM passthrough + dataLayer tracking
- `src/components/*` — sections
- `public/assets/landing/` — images 1–8
- `docs/telegram-ads-copy.md` — Telegram Ads creative texts

## Analytics events (dataLayer)
- `click_hero_cta`, `click_sticky_cta`, `click_demo_cta`, `click_final_cta`, `click_header_cta`
- `switch_language`
- `scroll_50`
- `faq_open`

Meta Pixel is installed in `index.html` (id `780400781706074`).

## CTA link
Defined once in `src/lib/cta.ts`:
```ts
export const CTA_URL_BASE = 'https://t.me/aidirectprobot';
export const CTA_START_DEFAULT = 'tgads_landing';
```
UTM tags from URL are encoded into Telegram `start` param at runtime.
