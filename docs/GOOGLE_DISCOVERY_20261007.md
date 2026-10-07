# Google: обнаружение обновлений GPTBot.uz, 07.10.2026

## Подтверждённые действия

- Проверены live sitemap, RSS, robots и31 URL из `SEO_REINDEX_20261007.txt`: HTTP200, self-canonical, нет noindex, Googlebot разрешён. У каждой страницы есть входящая ссылка среди этих31 страниц; это scoped-проверка, не полный link audit.
- `sitemap.xml`:300 уникальных URL, все с lastmod; `sitemap-updates.xml`:94, строгая подборка последних14 дней. Все31 приоритетных URL присутствуют в обеих картах. Будущих дат и дублей нет. Проверка User-Agent Googlebot трёх ключевых страниц:200/200/200; это проверка доступности, не доказательство настоящего обхода Googlebot.
- GSC `sc-domain:gptbot.uz`, доступ `siteFullUser`: 07.10.2026,13:22:31–32 UTC (18:22 Asia/Karachi), отправлены обе карты и `/ru/blog/feed.xml`, `/uz/blog/feed.xml`. Readback подтвердил свежий lastSubmitted, pending=true и errors=0. Последние lastDownloaded в этом снимке относятся к предыдущим версиям: новый обход ещё не установлен.
- Удалена только ошибочная регистрация `/uz/feed.xml` в GSC: live404 и1 ошибка; правильный `/uz/blog/feed.xml` проверен и отправлен. Страницы сайта не удалялись.
- WebSub для обоих блогов: HTTP204/204, квитанция в `reports/websub-receipts/2026-10-07T13-22-53-387Z_2143f621.json`.
- URL Inspection всех31:25 `Submitted and indexed`,6 `URL is unknown to Google`. Это текущие сведения об индексе, а не live test и не обещание индексации новой версии. Для25 индексированных URL Google canonical совпадает с проверенным адресом.
- Через настоящий интерфейс GSC предпринят Request indexing для узбекской Studio. Google ответил «Квота превышена… превысили ежедневную квоту». Заявка НЕ принята; повторов/обхода квоты не выполняли. Частная screenshot-квитанция: `F:/Claude/gptbot-tools/backups/codex-continuation-20261007-140534/google-discovery-20261007/gsc-indexing-quota.png`.

## Исправление lastmod

Git `d7869e3a` подтверждает содержательные правки узбекского чата от06.10: новые абзацы, примеры и внутренние ссылки; updatedAt оставался05.10. Исправлен updatedAt на06.10, дата редакционной проверки lastReviewedAt05.10 сохранена. Генератор sitemap теперь берёт более позднюю дату содержательного изменения или проверки, вместо безусловного приоритета lastReviewedAt. Дата сборки/отправки не используется. Новые страницы и Studio уже имеют07.10; массовой замены дат нет.

Проверки до выпуска:40 targeted tests PASS/0 FAIL, включая регрессию генерации обеих карт на реальном fixture; typecheck exit0; ESLint exit0. Статус выпуска дополняется после production readback. Источник runtime до исправления:3597412854df3a4aab03285db873830d6da0b36f.

## Проверка индекса31 URL

| URL | Google coverageState | Последний обход UTC |
|---|---|---|
| https://gptbot.uz/uz/gpt-uzbek-tilida/ | Submitted and indexed | 2026-10-06T23:16:12Z |
| https://gptbot.uz/ru/gpt-chat/ | Submitted and indexed | 2026-10-06T23:38:17Z |
| https://gptbot.uz/uz/taqdimot-ai/ | URL is unknown to Google | — |
| https://gptbot.uz/ru/prezentatsiya-ai/ | URL is unknown to Google | — |
| https://gptbot.uz/uz/blog/slayd-tayyorlash/ | Submitted and indexed | 2026-10-05T08:30:43Z |
| https://gptbot.uz/uz/instagram-target-yoqish/ | URL is unknown to Google | — |
| https://gptbot.uz/uz/blog/tushuntirish-xati-va-ariza-yozish/ | URL is unknown to Google | — |
| https://gptbot.uz/uz/blog/kurs-ishi-yozish/ | URL is unknown to Google | — |
| https://gptbot.uz/uz/blog/biznes-reja-tuzish/ | URL is unknown to Google | — |
| https://gptbot.uz/uz/smm-xizmatlari/ | Submitted and indexed | 2026-10-06T04:49:43Z |
| https://gptbot.uz/ru/smm-prodvizhenie-tashkent/ | Submitted and indexed | 2026-10-04T11:54:09Z |
| https://gptbot.uz/ru/targetirovannaya-reklama-tashkent/ | Submitted and indexed | 2026-10-06T03:34:42Z |
| https://gptbot.uz/ | Submitted and indexed | 2026-10-07T01:09:53Z |
| https://gptbot.uz/uz/ | Submitted and indexed | 2026-09-29T10:33:23Z |
| https://gptbot.uz/uz/blog/ | Submitted and indexed | 2026-08-01T12:29:27Z |
| https://gptbot.uz/ru/blog/ | Submitted and indexed | 2026-10-04T16:41:35Z |
| https://gptbot.uz/uz/internet-reklama-toshkent/ | Submitted and indexed | 2026-09-29T10:35:23Z |
| https://gptbot.uz/uz/blog/smm-nima/ | Submitted and indexed | 2026-10-03T19:14:36Z |
| https://gptbot.uz/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/ | Submitted and indexed | 2026-08-26T22:56:21Z |
| https://gptbot.uz/uz/gpt-chat-qollanma/ | Submitted and indexed | 2026-10-03T13:48:27Z |
| https://gptbot.uz/uz/suniy-intellekt/ | Submitted and indexed | 2026-10-03T13:48:28Z |
| https://gptbot.uz/uz/blog/referat-va-mustaqil-ish/ | Submitted and indexed | 2026-10-05T09:08:54Z |
| https://gptbot.uz/uz/blog/chatgpt-talabalar-uchun/ | Submitted and indexed | 2026-09-19T05:22:40Z |
| https://gptbot.uz/uz/blog/rezyume-tayyorlash/ | Submitted and indexed | 2026-10-05T09:08:55Z |
| https://gptbot.uz/uz/blog/chat-gpt-uzbek-biznes-uchun/ | Submitted and indexed | 2026-10-04T14:51:36Z |
| https://gptbot.uz/uz/gpt-uzbek-tilida-ai-chat/ | Submitted and indexed | 2026-08-31T11:59:16Z |
| https://gptbot.uz/uz/blog/chatgpt-claude-gemini-ozbekistonda/ | Submitted and indexed | 2026-09-30T08:20:54Z |
| https://gptbot.uz/uz/blog/target-reklama-nima/ | Submitted and indexed | 2026-10-02T04:31:33Z |
| https://gptbot.uz/uz/blog/smm-xizmati-narxi-ozbekiston-2026/ | Submitted and indexed | 2026-09-02T14:09:08Z |
| https://gptbot.uz/uz/blog/reklama-byudjeti-qancha-bolishi-kerak/ | Submitted and indexed | 2026-10-05T20:04:44Z |
| https://gptbot.uz/uz/blog/internet-reklama-narxi-ozbekiston-2026/ | Submitted and indexed | 2026-09-02T20:34:56Z |

## Практический предел

Новые страницы уже доступны через обе карты и внутренние ссылки. Шесть неизвестных Google URL: две Studio, instagram-target-yoqish и новые tushuntirish/kurs-ishi/biznes-reja. После восстановления дневной квоты первыми подавать их через URL Inspection → «Запросить индексирование», по одному разу. Автоматический API для этого обычным страницам недоступен; sitemap/RSS остаются рабочим массовым каналом. Уведомления и приём карты не доказывают обход, индексацию или рост позиций. Старые sitemap contents.indexed=0 не используются как число индексированных страниц: отдельная URL Inspection уже показывает25 индексированных URL.

Источники: [Google: sitemap и точный lastmod](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Google: запрос повторного обхода](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), [GSC API: submit](https://developers.google.com/webmaster-tools/v1/sitemaps/submit). Полная обезличенная квитанция: `reports/google-discovery-receipts/2026-10-07-google-discovery.json`.
