# Независимый post-release readback · 08.10.2026

Проверено 08.10.2026, 13:56–13:58 UTC, после сообщения root об успешном guarded deployment. Source commit: `5de9e3850468e1915d99729e4930b8750adcf433`. Immutable deployment: <https://b50a8d04.ai-direct-pro-landing.pages.dev>. Результат этой проверки: **PASS для перечисленных HTTP/content/header проверок**. Это не подтверждение Google recrawl, индексирования, позиций или вычисленного браузером layout.

Метод: прямые GET без cookies/авторизации, без следования редиректам, с `Cache-Control: no-cache` и `User-Agent: GPTBotSEORecoveryVerification/1.0`; до четырёх параллельных запросов. Из ответа разбирались HTML, canonical, robots, H1, JSON-LD, authored modified dates, ссылки и адресные текстовые условия. API тела не сохранялись. Runtime-файлы, настройки и данные не менялись; POST, AI, оплаты и поисковые submissions этот reviewer не выполнял.

## Основной домен: 11 страниц

У всех URL ниже: HTTP 200, `text/html`, один H1, self-canonical, `meta robots=index, follow, max-image-preview:large`, нет HTTP `X-Robots-Tag: noindex`, все найденные JSON-LD блоки разбираются. HTTP cache policy сохранилась: `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400`.

| URL | Адресный readback | dateModified |
|---|---|---|
| <https://gptbot.uz/uz/gpt-uzbek-tilida/> | 3 пробных ответа, отсутствие ежедневного обновления, отдельный PPTX; RU/UZ/x-default alternates сохранены | 2026-10-08 |
| <https://gptbot.uz/ru/gpt-chat/> | «3 пробных ответа всего», «без ежедневного обновления», отдельный PPTX; RU/UZ/x-default alternates сохранены | 2026-10-08 |
| <https://gptbot.uz/uz/gpt-chat-qollanma/> | 3 ответа; trial не обновляется ежедневно; «Taqdimot rejimining limit va paketlari alohida» | 2026-10-08 |
| <https://gptbot.uz/uz/blog/referat-va-mustaqil-ish/> | 3 trial ответа, отсутствие ежедневного обновления, пояснение PPTX | 2026-10-08 |
| <https://gptbot.uz/uz/blog/rezyume-tayyorlash/> | 3 trial ответа, отсутствие ежедневного обновления | 2026-10-08 |
| <https://gptbot.uz/ru/blog/neyroseti-dlya-biznesa-v-uzbekistane/> | Существующий title с 12 задачами; проверка пилота/затрат; неподтверждённые обещания отсутствуют | 2026-10-08 |
| <https://gptbot.uz/ru/blog/gpt-bot-vs-chat-bot/> | Экономика проверяется пилотом, неизвестный ответ передаётся человеку; ошибочной UZ alternate нет | 2026-10-08 |
| <https://gptbot.uz/uz/blog/gpt-bot-va-oddiy-chat-bot-qaysi-birini-tanlash/> | Ошибочной RU alternate нет; self-canonical и прежняя authored дата сохранены | 2026-07-27 |
| <https://gptbot.uz/uz/blog/tushuntirish-xati-va-ariza-yozish/> | Gov.uz ссылка присутствует как HTML anchor; нет неразрешённого `{arizaSource}`; trial3 | 2026-10-08 |
| <https://gptbot.uz/uz/tariflar/> | Ссылка ведёт на опубликованную `/uz/oferta/`; `/uz/ommaviy-oferta/` отсутствует | Не задана для этого Studio template |
| <https://gptbot.uz/uz/oferta/> | Целевой документ доступен; canonical и RU/UZ/x-default корректны | 2026-10-08 |

В business article фактически присутствуют anchors на <https://developers.openai.com/api/docs/models> и <https://developers.openai.com/api/docs/guides/evaluation-best-practices>. В letters guide фактический anchor: <https://gov.uz/oz/advice/600/document/2638>. Эти GET не перепроверяют заново содержание внешних источников.

Дополнительная адресная проверка business article в 13:58 UTC не нашла прежних утверждений про 10–15 обращений как порог окупаемости, 20–40%, 25–40%, 70–80%, «15 минут вместо двух часов», «дешевле половины зарплаты», прежних цен 500 000 / 1 500 000 / 2 500 000 и «автоматизация уже окупается». Найдены все проверенные условия: исходный период, сопоставимая/контрольная группа, фактически сокращённые расходы, затраты, различие валовой прибыли и выручки, неопределённый результат и указание, что примеры не являются результатами клиентов GPTBot.uz. В hybrid article не найдены пять удалённых price/payback/superlative утверждений. Это адресные regressions, не утверждение о полном фактчекинге каждого предложения сайта.

## Alias и immutable preview: 10 ответов

Одинаковая матрица фактически получена для обоих hosts:

- `https://ai-direct-pro-landing.pages.dev`
- `https://b50a8d04.ai-direct-pro-landing.pages.dev`

| Path | HTTP | X-Robots-Tag | Cache-Control |
|---|---:|---|---|
| `/` | 200 | `noindex` | прежний public HTML policy |
| `/uz/gpt-uzbek-tilida/` | 200 | `noindex` | прежний public HTML policy |
| `/uz/tariflar/` | 200 | `noindex` | прежний public HTML policy |
| `/api/auth/me` без cookies | 401 | `noindex, nofollow, noarchive` | `no-store` |
| `/__seo_recovery_missing_20261008__/` | 404 | `noindex` | `no-store` |

Таким образом, main-domain индексируемость в проверенной выборке сохранена; static alias/preview закрыты от индексации; приватный unauthorized response сохранил статус и более строгие robots/cache headers; несуществующий URL остался настоящим 404.

## Границы результата

Полный 300-URL crawl, точное сравнение release manifest, protected contracts, private login POST и IndexNow/GSC выполняются root и документируются отдельно. Браузерное подтверждение видимости HomeResources после hydration, мобильного layout и Studio offer после JS эта HTTP-проверка не заменяет. Root сообщил, что новый public navigation блокируется клиентом; здесь обход блокировки не применялся. Историческая GA4 причинность, сегодняшний first-user отчёт, field CWV и восстановление позиций этим readback не измерены.
