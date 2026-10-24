# Release — SEO growth wave 1 + RU↔UZ translator · 24.10.2026

- Source: `f97295b5225bf68e8f94d35265a161bfa56fdf47` (branch `seo/chat-snippets-translator-20261024`); previous production `d54d5b61` (deployment `d0264730`).
- Cloudflare Pages deployment: `a1f56a62` — `deployed_and_verified`. Guarded flow: `build:production` (1009 files, stamp) → `seo-protection check` 10/10 (revision `2026-10-24-wave1`) → `deploy_runner.py check` PASS (lineage d54d5b61 → f97295b5) → `deploy`. Owner authorization: chat, 24.10 («делай всё сам автономно и выкладывай»).
- Scope: backlog wave 1 (W1-01…W1-06, W1-08, W1-10…W1-14; W1-07/W1-09 refuted, W1-15 = this IndexNow step) and publication of `/ru/russko-uzbekskiy-perevodchik/` + `/uz/rus-ozbek-tarjimon/` with the free Cyrillic↔Latin converter and a visible beta note. Details: `docs/seo/CHANGE_LOG_2026-10.md` «Волна 1 роста 24.10», `docs/seo/research/2026-10-24-growth-audit/`.

## Pre-deploy browser check (local static dist)

`/uz/rus-ozbek-tarjimon/`: title/H1/canonical/robots correct, `data-chat-role="translator"`, sidebar shows «Tarjimon», beta note visible, converter script 200. Converter: «Ўзбекистон Республикаси, шаҳар маъно, ЦЕНТР, Ғулом» → «O‘zbekiston Respublikasi, shahar ma’no, SENTR, G‘ulom»; «O'zbekiston g'oya ma'lumot Shahnoza» → «Ўзбекистон ғоя маълумот Шаҳноза».

## Live readback (curl, after deploy)

| URL | HTTP | title |
|---|---|---|
| /ru/russko-uzbekskiy-perevodchik/ | 200 | Переводчик с русского на узбекский и обратно — AI онлайн |
| /uz/rus-ozbek-tarjimon/ | 200 | Rus-o‘zbek tarjimon onlayn — AI tarjima, lotin va kirill |
| /uz/suniy-intellekt/ | 200 | Sun’iy intellekt nima: turlari, tarixi, o‘zbekcha misollar |
| /ru/gpt-vs-chatgpt-sravnenie/ | 200 | GPT и ChatGPT: расшифровка и разница простыми словами |
| /ru/gpt-chat/, /uz/gpt-uzbek-tilida/ | 200 | 24.10 snippets unchanged |

robots.txt carries the Yandex `Clean-param` line; sitemap.xml 302 `<loc>` incl. both translator pages; `/` links both translator pages; analytics loader bounds unchanged (≤3 000 ms, Meta 34 000).

## Discovery

WebSub: UZ blog feed and `/updates/atom.xml` posted (204), RU feed unchanged — receipt `reports/websub-receipts/2026-10-24T18-46-26-343Z_611c674d.json`. IndexNow (site key `712a8e89…`): 23 changed URLs, HTTP 200.

## Not done / open

Native-speaker blind check and proofreading of the translator pages (published under owner override with a beta note); `check:chat-layout --translator` (no headless Chrome run); W1-13(a) is a Cloudflare zone rule, not repo code.
