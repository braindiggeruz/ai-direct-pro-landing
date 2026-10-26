# Release — R-S1b (W2-01) early · 26.10.2026

- Owner order (chat, 26.10): «давай сделаем то, что безопасно» — ship R-S1b now instead of ≈08.11; chats, kirish guide and download guide stay on their dates (16.11, ≈25.11–02.12). The ≈05–07.11 read of these articles now measures R-S1 + R-S1b together (window journal in `docs/seo/CHANGE_LOG_2026-10.md`).
- **Deployment `5a760212`** from `72093788` — `deployed_and_verified` (previous `77e54817`, deployment `7b6cef54`). Commits: d87ceff3 (links, H-5 anchor, breadcrumb names), 1286f7e4 (review fixes, planning docs), 66ad9606 (protected revision `2026-10-26-rs1b`), 72093788 (generator skips the release stamp). The first builder was killed when the app froze; its uncommitted work was verified byte-equal to its own backup and finished by a resumed run.

## What shipped

- /ru/blog/chatgpt-i-claude-v-uzbekistane/ ↔ /ru/blog/kak-oplatit-chatgpt-v-uzbekistane/ links; /uz/blog/chatgpt-uzbek-tilida-promptlar/ → /uz/blog/tushuntirish-xati-va-ariza-yozish/; H-5 anchor «insho va esse yozish».
- BreadcrumbList names on those three and on /uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/, /uz/blog/ai-chat-nima-va-qanday-turlari-bor/; still held: download guide (R-S2), both chats, kirish guide.
- Payment article re-checked against help.openai.com on 26.10 (curl): Plus $20/month, cards in all countries, UZS not a billing currency, Uzbekistan supported — unchanged; fixed: app publisher wording, «uninstalling the app does not cancel the subscription», two redirected source URLs; «Обновлено»/dateModified/lastReviewedAt 2026-10-26. Go price not verifiable (client-side pricing) — not stated in the article.

## Checks

Protection 10/10 with revision `2026-10-26-rs1b` (5 articles: scoped body/links/JSON-LD only; other 5 protected byte-equal); titles, descriptions, H1, canonical, hreflang unchanged; CSS `index-B7Z1XlOc.css`; chat bundle within budget; targeted tests green (known failures only); `deploy_runner.py check` PASS. Live: 5 articles 200 with unchanged titles, new links present, breadcrumb names in JSON-LD; chats and `/` titles unchanged.

## Discovery

WebSub by the guarded deploy. IndexNow 4 URLs (3 articles + /ru/blog/): indexnow.org 200, Yandex 200, Bing 200.
