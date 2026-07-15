# IndexNow Submission Report — 5 RU + 5 UZ Blog Articles

**Date:** 2026-01-06
**Endpoint:** `https://api.indexnow.org/IndexNow`
**Result:** HTTP 200 OK
**Notified search engines:** Bing, Yandex, Seznam, Naver, Yep

## Key File

- Public key file: `public/mrutks6jdnrob4r70zp8u7868a83lnim.txt`
- Live URL: https://gptbot.uz/mrutks6jdnrob4r70zp8u7868a83lnim.txt → 200
- Key value (also the filename without `.txt`): `mrutks6jdnrob4r70zp8u7868a83lnim`

## Submission

`scripts/indexnow-ping.ts` reads every `<loc>` from `dist/sitemap.xml` and
submits them in a single batch. With the +10 article URLs + +1 UZ blog index,
the full batch was **59 URLs**, which includes all 10 new article URLs.

### 10 New Article URLs (in submission)

RU:
1. https://gptbot.uz/ru/blog/stoimost-telegram-bota-dlya-biznesa-v-uzbekistane/
2. https://gptbot.uz/ru/blog/chat-bot-dlya-biznesa-v-tashkente-kak-vybrat-kanal/
3. https://gptbot.uz/ru/blog/instagram-telegram-crm-odna-voronka-zayavok/
4. https://gptbot.uz/ru/blog/kak-podgotovit-biznes-k-zapusku-gpt-bota/
5. https://gptbot.uz/ru/blog/kakoi-ai-bot-nuzhen-vashei-nishe-v-uzbekistane/

UZ:
6. https://gptbot.uz/uz/blog/telegram-bot-biznes-uchun-narxi-uzbekistonda/
7. https://gptbot.uz/uz/blog/toshkentda-biznes-uchun-chat-bot-qaysi-kanal/
8. https://gptbot.uz/uz/blog/instagram-telegram-crm-bitta-ariza-voronkasi/
9. https://gptbot.uz/uz/blog/gpt-botni-ishga-tushirishdan-oldin-biznesni-tayyorlash/
10. https://gptbot.uz/uz/blog/qaysi-ai-bot-qaysi-nishaga-mos-uzbekistonda/

## How to Re-run

```
yarn build
INDEXNOW_KEY=mrutks6jdnrob4r70zp8u7868a83lnim yarn tsx scripts/indexnow-ping.ts
```

The key is not committed to the repo. It is sourced from the env var at
ping time and verified by IndexNow against the public key file at
`https://gptbot.uz/<KEY>.txt`.
