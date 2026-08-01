# GPTBot Market audit evidence — 2026-08-01

Captured read-only from public production surfaces. No authenticated session, Telegram message, seller/store creation, order, payment, deployment, migration, webhook change or other production mutation was performed.

## First-party captures

| File | URL / viewport | What it proves | Limitation |
|---|---|---|---|
| `ru-sotuvchi-mobile.png` | `https://gptbot.uz/ru/sotuvchi/`, 390×844, full page | RU landing content and mobile hierarchy | A screenshot does not prove conversion or Telegram behavior. |
| `ru-sotuvchi-tablet.png` | same, 768×1024, full page | Tablet layout | — |
| `ru-sotuvchi-desktop.png` | same, 1440×1000, full page | Desktop layout and narrow content column | — |
| `uz-sotuvchi-mobile.png` | `https://gptbot.uz/uz/sotuvchi/`, 390×844, full page | UZ landing and localization surface | Linguistic quality still needs native-speaker review. |
| `uz-sotuvchi-desktop.png` | same, 1440×1000, full page | Desktop UZ layout | — |
| `gptbot-home-mobile-hero.png` | `https://gptbot.uz/`, 390×844, viewport | Root GPTBot.uz brand and lead-bot promise | Root product is not GPTBot Market. |
| `gptbot-home-mobile.png`, `gptbot-home-desktop.png`, `gptbot-home-mobile-scrolled.png` | root, full page | Capture behavior of the animated root page | Headless full-page capture did not replay all intersection animations, producing large blank areas; do not treat those areas as proven user-visible defects. |
| `telegram-bot-public-mobile.png` | `https://t.me/gptbot_market_bot`, 390×844 | Public name, username, description and Start entry | Telegram web preview is not an in-chat session and may omit configured avatar/media. |
| `owner-login-mobile.png` | protected Owner route redirected to `/admin-tools/login`, 390×844 | Public protected entry and shared SEO Cockpit login | Authenticated Owner screens remain `EVIDENCE_GAP`. |

## External benchmark captures

| File | Result |
|---|---|
| `benchmark-olx-business.png` | Successful public viewport capture; valid visual reference. |
| `benchmark-uzum-market.png` | Uzum/Yandex anti-automation challenge; evidence that live visual inspection was blocked, not a product screenshot. |
| `benchmark-openai-shopping.png` | Cloudflare human-verification challenge; use the official source link, not this image, for product conclusions. |
| `benchmark-telegram-mini-apps.png` | Blank headless capture; use official Telegram documentation text, not this image, for conclusions. |

## Explicit evidence gaps

- In-chat RU and UZ buyer journeys on Telegram iOS and Android.
- In-chat invited seller, active seller, paused/suspended seller and role-switch journeys.
- Authenticated Owner Control Center desktop/mobile visual states.
- Independent Bot API `getWebhookInfo` status and BotFather metadata/media preview pack.
- Real-store, real-product, real-order and seller-response evidence: none exists by design at audit time.
- Multi-run p95 latency, accessibility assistive-technology test and native Uzbek copy sign-off.

To close them, collect a sanitized screenshot/screen-recording pack from an authorized RU/UZ test account on iOS and Android, an authenticated read-only Owner session, an owner-executed redacted Bot API status export, and consented Pilot #1 observations. Do not put tokens, chat IDs, phone numbers or raw conversation text in Git.
