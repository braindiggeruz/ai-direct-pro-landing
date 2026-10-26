# Release — TOP-3 roadmap steps A/B + studio address · 26.10.2026

- Owner order (chat, 26.10): «сделай грамотный фикс всего, что может улучшить SEO согласно роадмапу; действуй полностью автономно и сразу деплой»; address = the Google Business card «Kichik Xalqa Yo‘li 57» (confirmed in chat: «делай всё до конца и деплой» after the plan said the site moves to it). Roadmap: `docs/seo/research/2026-10-26-top3-roadmap/ROADMAP_TOP3.md`.
- **Deployment `7b6cef54`** from `77e54817` — `deployed_and_verified` (previous `4b219a0c`, deployment `a535be94`). Commits: 812646bc (step A commercial), cd83c654 (step B: address, footer link, hreflang guard, breadcrumb held list), 329294e9 + 6b8a273e (review fixes), d7dd4588 (window journal), 77e54817 (protected revision `2026-10-26-address`).

## What shipped

- Lead forms on /ru/seo-prodvizhenie-saytov-tashkent/, /uz/seo-xizmati/, /ru/lokalnoe-seo-tashkent/, /ru/avtomatizatsiya-prodazh/, /uz/savdoni-avtomatlashtirish/ (steps 1.1).
- «Смета» block in the Telegram Ads cost article (1.2; title/date untouched until the ≈22.11 read); Claude link in the ii-chat article (1.5); «Таргетолог в Ташкенте: цена и что входит» (1.6); «Цены на SMM в Ташкенте» (1.7); 2026 price H2 + Cake City / Graver Studio portfolio on /ru/razrabotka-saytov-tashkent/ (2.6); chat-bot package table + «сроки и что прислать» (2.7). Only published prices.
- Landing footer «Услуги: … Разработка сайтов / Sayt yaratish» (115 pages; not on protected pages); hreflang guard test + manifest decision A11; breadcrumb names already live on unprotected pages, held list explicit for the 9 window pages.
- Studio address «Kichik Xalqa Yo‘li 57» and geo 41.3364 / 69.2723 (from the Google card) in site.json, footers, contact lines, Boss Digital text + JSON-LD, llms files. Offers frozen on the old address (edition v5); legal requisites unchanged (registered address in legal-entity.json).

## Checks

Before deploy: protection 10/10 (protected pages differ only by the footer address and Organization streetAddress/geo), titles/descriptions/H1/canonical/hreflang unchanged sitewide, sitemap lastmod moved only on 5 URLs, chat start bundle 109 960 B, page CSS `index-B7Z1XlOc.css` 26 919 B, 31 test files 399/402 (3 known), `deploy_runner.py check` PASS.
Live (all 329 sitemap URLs): 329 × 200; old address only on the two offers; the phone only on the offers and the privacy-policy requisites; forms live on the 5 pages; new sections present on the 5 content pages; homepage footer shows the new address.

## Discovery

WebSub by the guarded deploy. IndexNow 15 URLs (13 content + /boss-digital/, /uz/boss-digital/): indexnow.org 200, Yandex 200, Bing 200.

## Not shipped (windows)

R-S1b ≈08.11 (after P-CTR reads ≈05–07.11), R-S2 download guide 16.11, chats + kirish guide revisions ≈25.11 / ≈27.11–02.12, title of the Telegram Ads article after ≈22.11, anything on /uz/sayt-yaratish/ and /uz/instagram-target-yoqish/ before ≈22.11. Offers show the old address until edition v6.
