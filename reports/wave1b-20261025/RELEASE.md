# Release — SEO growth wave 1b · 25.10.2026

- Source: `62d8fdb0071364a3b6a1687fafcb9bd5142e0ed2` (branch `seo/chat-snippets-translator-20261024`); previous production `f97295b5` (deployment `a1f56a62`).
- Cloudflare Pages deployment: `97f56ab5` — `deployed_and_verified`. Guarded flow: `build:production` (1012 files, stamp) → `seo-protection check` 10/10 (revision `2026-10-24-wave1b`) → `deploy_runner.py check` PASS (lineage f97295b5 → 62d8fdb0) → `deploy`. Owner authorization: chat, 24.10 (autonomous waves with deployment).
- Scope: backlog W2-03 `/uz/blog/tavsifnoma-namuna/`, W2-04 `/uz/blog/rasmiy-xat-yozish/` (+ reciprocal link in `/uz/blog/tushuntirish-xati-va-ariza-yozish/`), W2-05 `/uz/blog/tabrik-yozish/` (December peak), W2-06 `/uz/telegram-bot-biznes-uchun/` H1 + «o‘zingiz yaratasizmi yoki buyurtma» section + 2 FAQ, W2-07 `llms-full.txt` as a superset of `llms.txt`. Intent pairs C49–C52, demand rows. Details: `docs/seo/CHANGE_LOG_2026-10.md` «Волна 1b», `docs/seo/research/2026-10-24-growth-audit/wave1b-reports.md`.

## Live readback (curl, after deploy)

| URL | HTTP | title / H1 |
|---|---|---|
| /uz/blog/tavsifnoma-namuna/ | 200 | Tavsifnoma namunasi: o‘quvchi, talaba va xodim uchun (2026) |
| /uz/blog/rasmiy-xat-yozish/ | 200 | Rasmiy xat yozish: tuzilma, namuna va AI bilan qoralama |
| /uz/blog/tabrik-yozish/ | 200 | Tug‘ilgan kun tabriklari va Yangi yil tabriklari: namunalar |
| /uz/telegram-bot-biznes-uchun/ | 200 | H1 «Telegram bot yaratish biznes uchun: arizalarni avtomatlashtirish» |
| /uz/rus-ozbek-tarjimon/, /ru/gpt-chat/ | 200 | unchanged from wave 1 / 24.10 snippets |

sitemap.xml 305 `<loc>`; `/` lists the three guides; `llms-full.txt` 200, 586 405 B; one Cache-Control header on `/llms.txt`; analytics loader bounds unchanged.

## Discovery

WebSub posted by the guarded deploy (UZ blog feed + atom). IndexNow (site key `712a8e89…`): 8 URLs (/, three guides, hub, tushuntirish guide, llms.txt, llms-full.txt), HTTP 200.

## Next

Dated releases for the protected winners (download guide, login guide, both chats, C23) — `docs/seo/research/2026-10-24-growth-audit/NEXT_RELEASES.md`.
