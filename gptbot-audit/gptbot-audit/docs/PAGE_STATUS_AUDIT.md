# Page Status Audit — GPTBot SEO Cockpit

Generated from `content/pages/**/*.json`. Re-run by executing the script in `docs/PAGE_STATUS_AUDIT.md` section "Reproduce".

Total: **25**, Published: **2**, Drafts: **23**, In sitemap: **2**.

| URL | Locale | Type | Status | Should be live | Prerender | In sitemap | Canonical | Hreflang pair | Index | Completeness | Issue | Required action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/ru/ai-bot-dlya-biznesa/` | ru | money | draft | no | no | no | yes | `/uz/biznes-uchun-ai-bot/` | index | full | placeholder content | write body & FAQ, then publish |
| `/ru/ai-bot-dlya-horeca/` | ru | money | draft | no | no | no | yes | `MISSING` | index | empty | placeholder content; missing hreflang pair | write body & FAQ, then publish; add hreflang field |
| `/ru/ai-bot-dlya-kliniki/` | ru | money | draft | no | no | no | yes | `/uz/klinika-uchun-ai-bot/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/ru/ai-bot-dlya-magazina/` | ru | money | draft | no | no | no | yes | `/uz/dokon-uchun-ai-bot/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/ru/ai-bot-dlya-salona-krasoty/` | ru | money | draft | no | no | no | yes | `/uz/salon-uchun-ai-bot/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/ru/ai-bot-dlya-uchebnogo-tsentra/` | ru | money | draft | no | no | no | yes | `/uz/oquv-markazi-uchun-ai-bot/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/ru/ai-menedzher-dlya-instagram/` | ru | money | draft | no | no | no | yes | `MISSING` | index | empty | placeholder content; missing hreflang pair | write body & FAQ, then publish; add hreflang field |
| `/ru/ai-prodavec/` | ru | money | draft | no | no | no | yes | `MISSING` | index | empty | placeholder content; missing hreflang pair | write body & FAQ, then publish; add hreflang field |
| `/ru/avtomatizatsiya-prodazh/` | ru | money | draft | no | no | no | yes | `/uz/savdoni-avtomatlashtirish/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/ru/avtomatizatsiya-zayavok/` | ru | money | draft | no | no | no | yes | `/uz/arizalarni-avtomatlashtirish/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/ru/bot-dlya-obrabotki-zayavok/` | ru | money | draft | no | no | no | yes | `MISSING` | index | empty | placeholder content; missing hreflang pair | write body & FAQ, then publish; add hreflang field |
| `/ru/chat-bot-dlya-biznesa/` | ru | money | draft | no | no | no | yes | `MISSING` | index | empty | placeholder content; missing hreflang pair | write body & FAQ, then publish; add hreflang field |
| `/ru/gpt-bot-dlya-biznesa/` | ru | money | draft | no | no | no | yes | `/uz/gpt-bot-biznes-uchun/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/ru/instagram-direct-bot/` | ru | money | draft | no | no | no | yes | `/uz/instagram-bot-biznes-uchun/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/ru/telegram-bot-dlya-biznesa/` | ru | money | published | yes | yes | yes | yes | `/uz/telegram-bot-biznes-uchun/` | index | full | — | — |
| `/uz/arizalarni-avtomatlashtirish/` | uz | money | draft | no | no | no | yes | `/ru/avtomatizatsiya-zayavok/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/uz/biznes-uchun-ai-bot/` | uz | money | published | yes | yes | yes | yes | `/ru/ai-bot-dlya-biznesa/` | index | full | — | — |
| `/uz/dokon-uchun-ai-bot/` | uz | money | draft | no | no | no | yes | `/ru/ai-bot-dlya-magazina/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/uz/gpt-bot-biznes-uchun/` | uz | money | draft | no | no | no | yes | `/ru/gpt-bot-dlya-biznesa/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/uz/instagram-bot-biznes-uchun/` | uz | money | draft | no | no | no | yes | `/ru/instagram-direct-bot/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/uz/klinika-uchun-ai-bot/` | uz | money | draft | no | no | no | yes | `/ru/ai-bot-dlya-kliniki/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/uz/oquv-markazi-uchun-ai-bot/` | uz | money | draft | no | no | no | yes | `/ru/ai-bot-dlya-uchebnogo-tsentra/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/uz/salon-uchun-ai-bot/` | uz | money | draft | no | no | no | yes | `/ru/ai-bot-dlya-salona-krasoty/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/uz/savdoni-avtomatlashtirish/` | uz | money | draft | no | no | no | yes | `/ru/avtomatizatsiya-prodazh/` | index | empty | placeholder content | write body & FAQ, then publish |
| `/uz/telegram-bot-biznes-uchun/` | uz | money | draft | no | no | no | yes | `/ru/telegram-bot-dlya-biznesa/` | index | empty | placeholder content | write body & FAQ, then publish |

## Rules enforced

- `status === "draft"` → **not prerendered**, **not in sitemap**, edge serves `/` with `410 Gone` (see `_redirects`).
- `status === "published" && robotsIndex === false` → considered noindex, not in sitemap.
- `status === "noindex"` → same as above; also blocked from prerender if you want, but currently still prerendered with `<meta name="robots" content="noindex">` for explicit signalling.
- Sitemap must contain ONLY `status === "published" && robotsIndex !== false` pages.
- Build verification: `yarn seo:audit` ❌ exits non-zero on any "error"-level issue (missing title/description/canonical, duplicates).

## Reproduce

```bash
cd frontend
yarn seo:audit       # CLI report
open admin-tools     # interactive cockpit
```
