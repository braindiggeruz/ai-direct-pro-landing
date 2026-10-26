# Release — owner phone replaced by Telegram · 26.10.2026

- Owner order (chat, 26.10): replace the owner's phone with https://t.me/XGame_changerx on every form and contact surface so visitors write instead of calling; «аккуратнее, чтобы SEO не нарушилось». Supersedes decision L14.
- **Deployment `a535be94`** from `4b219a0c` — `deployed_and_verified` (previous production `4924c998`, deployment `acb2c864`). Commits: 12feefa7 (switch + 85 content files), 79a35b97 (phone out of browser bundles), 2b5bc906 (test), f694838b (12 review fixes), 4b219a0c (protected revision `2026-10-26-contact`). A driver-update pause interrupted the first builder; the resumed run checked its commits and finished.
- Design: `content/global/site.json` `studioTelegram` = the owner's Telegram, `phonePublic: false`; `src/shared/studio-contact.ts` hides every phone renderer; Telegram links carry `data-contact="studio"` (GA4 `contact_click`, Metrika `telegram_cta_studio`), `rel="nofollow noopener noreferrer"`.

## Checks

- Before deploy: seo-protection 10/10 (revision lists only contact surfaces: footers, contact cards, 5 CTA paragraphs in 4 articles, the chats' contact/noscript line, the "/" FAQ answer «пишете в Telegram или на e-mail», Organization JSON-LD); title, description, H1, canonical, robots, hreflang, internal links, dates, sitemaps, feeds identical on all 329 pages; chat start bundle 109 960 B of 110 000 (code identical, hash names only), page CSS `index-B7Z1XlOc.css` 26 919 B; dist phone grep = 4 legal pages only; release check PASS.
- Live (all 329 sitemap URLs fetched): 329 × 200; the phone appears only on /ru/oferta/, /uz/oferta/ (approved edition v5, byte-identical) and in the requisites block of /ru/politika-konfidentsialnosti/ and /uz/maxfiylik-siyosati/; the Telegram link is on 327 pages (all but the two offers); no `telephone` in JSON-LD on /, /boss-digital/, /uz/boss-digital/, /uz/gpt-uzbek-tilida/, `contactPoint` present; llms.txt has no phone. Mobile bar on /uz/klinika-uchun-ai-bot/ reads «Telegram’da yozish» + «Ariza».

## Owner

GA4: make `contact_click` the key event instead of `phone_click`; Metrika: `telegram_cta_studio`. Google Business Profile still shows the phone (Call button) — change it there if unwanted. Offers keep the phone until the next offer edition. Privacy policies: contact-only correction, `updatedAt` kept.
