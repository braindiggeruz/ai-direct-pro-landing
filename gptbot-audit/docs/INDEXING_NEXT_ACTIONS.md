# GPTBot — Indexing Next Actions (Jan-2026)

> Action plan for the **owner** to push gptbot.uz from "all green at source"
> to "all green in third-party crawlers and SERPs". The repo is technically
> clean (tech-audit-report.json: 0 P0/P1 issues, 62 URLs in sitemap, all 200).
> The remaining work is **submission + recrawl signalling**.

## 1. Sitemap

- **Live URL**: `https://gptbot.uz/sitemap.xml`
- **<loc> count**: 62 (1 homepage + 1 RU blog index + 1 UZ blog index +
  15 RU money + 15 UZ money + 21 RU blog + 8 UZ blog)
- **All 62 URLs**: HTTP 200, canonical self, hreflang reciprocal (where a
  pair exists), schema valid, no noindex, no admin/api/draft/random.

## 2. Priority URLs for manual "Request indexing" (GSC + Bing)

### Priority A — Discovered, never crawled (push first)

GSC URL Inspection reported these as "Discovered - currently not indexed":

```
https://gptbot.uz/ru/chat-bot-dlya-biznesa/
https://gptbot.uz/ru/ai-menedzher-dlya-instagram/
```

Steps: GSC → URL Inspection → paste URL → "Test live URL" → "Request indexing".

### Priority B — Recently re-snippeted (rev existing positions)

These pages got title/description rewrites in `f98edd6` and `feabd57`. Ask
Google to recrawl so the new snippet appears in SERP:

```
https://gptbot.uz/ru/ai-bot-dlya-biznesa/
https://gptbot.uz/ru/instagram-direct-bot/
https://gptbot.uz/ru/gpt-bot-dlya-biznesa/
https://gptbot.uz/ru/telegram-bot-dlya-biznesa/
https://gptbot.uz/ru/chat-bot-dlya-biznesa/
```

### Priority C — De-cannibalized blog (recheck index status)

```
https://gptbot.uz/ru/blog/ai-menedzher-dlya-instagram/
https://gptbot.uz/ru/blog/avtomatizatsiya-zayavok-instruktsiya/
```

### Priority D — Newest 10 RU+UZ articles (push into discovery)

```
https://gptbot.uz/ru/blog/stoimost-telegram-bota-dlya-biznesa-v-uzbekistane/
https://gptbot.uz/ru/blog/chat-bot-dlya-biznesa-v-tashkente-kak-vybrat-kanal/
https://gptbot.uz/ru/blog/instagram-telegram-crm-odna-voronka-zayavok/
https://gptbot.uz/ru/blog/kak-podgotovit-biznes-k-zapusku-gpt-bota/
https://gptbot.uz/ru/blog/kakoi-ai-bot-nuzhen-vashei-nishe-v-uzbekistane/
https://gptbot.uz/uz/blog/telegram-bot-biznes-uchun-narxi-uzbekistonda/
https://gptbot.uz/uz/blog/toshkentda-biznes-uchun-chat-bot-qaysi-kanal/
https://gptbot.uz/uz/blog/instagram-telegram-crm-bitta-ariza-voronkasi/
https://gptbot.uz/uz/blog/gpt-botni-ishga-tushirishdan-oldin-biznesni-tayyorlash/
https://gptbot.uz/uz/blog/qaysi-ai-bot-qaysi-nishaga-mos-uzbekistonda/
```

> **GSC quota**: ~10 Request indexing actions per day. Spread Priority A+B+C
> over Day 0, Priority D over Day 1–2.

## 3. Submit cadence (suggested)

| Day | Action |
| --- | --- |
| 0 (today) | GSC: Resubmit `sitemap.xml`. Request indexing for Priority A + B + C (9 URLs). |
| 1 | Request indexing for Priority D RU (5 URLs). Bing Webmaster: resubmit sitemap. |
| 2 | Request indexing for Priority D UZ (5 URLs). |
| 3 | GSC: re-inspect Priority A URLs — verdict should be "URL is on Google" or "Crawled - currently not indexed". |
| 4 | If any URL stuck at "Discovered" → check Coverage → likely fetch budget issue → wait. |
| 7 | GSC Performance recheck → impressions / position deltas. |

## 4. IndexNow (Bing + Yandex + Seznam + Naver + Yep)

- **Key file (already live)**: `https://gptbot.uz/mrutks6jdnrob4r70zp8u7868a83lnim.txt`
  returns 200 with the key as the body.
- **Pinger script**: `scripts/indexnow-ping.ts` — reads `dist/sitemap.xml`,
  POSTs the full URL list to `https://api.indexnow.org/IndexNow`.
- **How to run** (after every deploy, or manually):

```bash
yarn build
INDEXNOW_KEY=mrutks6jdnrob4r70zp8u7868a83lnim yarn tsx scripts/indexnow-ping.ts
```

- **Expected**: `HTTP 200 OK` or `HTTP 202 Accepted` from IndexNow endpoint.

## 5. Ahrefs recrawl

Once this deploy lands:

1. Ahrefs → **Site Audit** → `gptbot.uz` project → **Crawl now**.
2. Wait for the full crawl to complete (~10–60 min depending on tier).
3. Expected outcome: Health Score moves from ~48 → 90+.
4. Re-check the historically flagged buckets:
   - Broken internal links (was: present) → expected 0.
   - Links to 4xx/redirect/noindex (was: present) → expected 0.
   - Missing reciprocal hreflang (was: 47) → expected 0.
   - Schema.org validation errors (was: 45) → expected 0.
   - Pages to submit to IndexNow (was: 31/48) → expected 0 (all 62 submitted).
   - Missing Twitter card (was: 1) → expected 0.

## 6. What to wait for (Google + Bing timeline)

- **GSC**: Sitemap "Discovered" → "Last read" within 24h. New URLs typically
  show in Coverage within 3–7 days, in Performance within 7–14 days.
- **Bing / Yandex**: IndexNow submission shows up in Bing Webmaster
  "URL submission" within minutes; full crawl + index within 24–72h.
- **Ahrefs**: Health Score updates within 1 crawl cycle (manual trigger
  recommended after this deploy).

## 7. Out of scope (do NOT do without explicit owner request)

- ❌ Do not edit `public/robots.txt` to remove the Cloudflare-managed AI bot
  block (`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, `Bytespider`,
  etc.). It is a Cloudflare WAF policy — toggle it in the Cloudflare
  dashboard, not in this repo.
- ❌ Do not add a global `/*` SPA fallback to `_redirects`. Random URLs
  must keep returning 404 + noindex.
- ❌ Do not rename slugs without a corresponding 301 in
  `content/seo/redirects.json`.
- ❌ Do not submit `/admin-tools/*` or `/api/*` URLs to GSC / Bing /
  IndexNow.
