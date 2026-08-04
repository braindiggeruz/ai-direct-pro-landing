# 10. План индексации

**Статус на 2026-08-04:** ветка объединена в `main`, собрана и **задеплоена в production**. Этап 1 выполнен и проверен на живом домене. Этап 2 выполнен частично — см. ниже, что осталось владельцу.

## Этап 1 — сразу после деплоя (день 0) — ВЫПОЛНЕНО

| # | Действие | Результат |
|---|---|---|
| 1 | Все три URL отдают 200 на `https://gptbot.uz/…` | **PASS.** Первая проверка сразу после деплоя вернула 404 на трёх новых URL — это был транзиентный edge-кэш Cloudflare; повторная проверка через минуту дала 200 на всех |
| 2 | Canonical на production | **PASS.** Самоссылающийся, `https://gptbot.uz/...`, на всех трёх |
| 3 | Meta `robots` | **PASS.** `index, follow, max-image-preview:large`, ни одного `noindex` |
| 4 | `robots.txt` | **PASS.** `/ru/blog/` не запрещён; закрыты только `/admin/`, `/admin-tools/`, `/api/`. Объявлен `Sitemap: https://gptbot.uz/sitemap.xml` |
| 5 | Наличие в sitemap | **PASS.** `https://gptbot.uz/sitemap.xml` отдаёт 251 запись, все три новых URL присутствуют |
| 6 | Hub ссылается на spokes | **PASS.** Проверено на живой странице |
| 7 | JSON-LD | **PASS структурно.** `"Article"` и `"FAQPage"` присутствуют на всех трёх, на hub — FAQPage без Article. Google Rich Results для hub: `verdict: PASS`, обнаружены Breadcrumbs |
| 8 | Мобильный рендер | **PASS.** Проверено до деплоя на 320/390/desktop, см. `09_QA_EVIDENCE.md` |

## Этап 2 — Search Console

| # | Действие | Статус |
|---|---|---|
| 9 | URL Inspection по трём новым URL | **ВЫПОЛНЕНО 2026-08-04.** Все три: `verdict: NEUTRAL`, `coverageState: "URL is unknown to Google"` — ожидаемо через несколько минут после публикации |
| 9b | URL Inspection по hub | **ВЫПОЛНЕНО.** `verdict: PASS`, `coverageState: "Submitted and indexed"`, `robotsTxtState: ALLOWED`, `indexingState: INDEXING_ALLOWED`, `pageFetchState: SUCCESSFUL`, последний обход 2026-08-02T12:50:28Z, `googleCanonical` совпадает с `userCanonical`, источник — sitemap |
| 10 | **Request Indexing для трёх новых URL** | **НЕ ВЫПОЛНЕНО — требует владельца.** Google Search Console API не поддерживает запрос индексации для обычных страниц: Indexing API работает только с `JobPosting` и `BroadcastEvent`. Автоматизировать нельзя. Нужно вручную открыть каждый URL в интерфейсе GSC и нажать Request Indexing |
| 11 | Request Indexing для hub | **НЕ ВЫПОЛНЕНО — та же причина.** Hub изменился и получил новые ссылки, переобход полезен |
| 12 | Пересабмит sitemap | **Не требуется.** Sitemap живой, Google уже читает его — это подтверждается тем, что hub индексирован именно через sitemap |
| 13 | Отчёт Pages на «Discovered — currently not indexed» | Через 3–5 дней, владелец |

**IndexNow:** `scripts/indexnow-ping.ts` требует переменную `INDEXNOW_KEY`, которая хранится как секрет Cloudflare Pages и локально недоступна. Пинг **не выполнялся**. Если владелец запустит скрипт с ключом, обнаружение в Bing и Яндексе ускорится.

## Этап 3 — проверки по расписанию

### День 7

| Что смотреть | Где | Ожидание |
|---|---|---|
| Статус индексации 3 URL | GSC URL Inspection | Хотя бы часть проиндексирована |
| Первые показы | GSC Performance, фильтр по page | Возможны единичные показы; ноль — не повод для тревоги |
| Обход внутренних ссылок | GSC Links → Internally linked pages | Новые URL появились в отчёте |
| Ошибки сканирования | GSC Pages | Ноль ошибок по новым URL |

### День 14

| Что смотреть | Ожидание | Действие при отклонении |
|---|---|---|
| Индексация | Все 3 URL в индексе | Если нет — проверить canonical, повторить URL Inspection, проверить внутренние ссылки |
| Показы по запросам кластера | Появление первых запросов со словом «smm» | Ноль — продолжать наблюдение, выводы преждевременны |
| Позиции | Любые, даже во второй сотне | Отсутствие позиций при индексации — сигнал о слабой релевантности, а не о технической проблеме |
| Каннибализация | GSC `dimensions: ['query','page']` | **Ключевая проверка.** Если один запрос делят hub и spoke либо новый spoke и `/ru/blog/chto-takoe-smm-prodvizhenie/` — пересмотреть границы по процедуре `intent-manifest` |

### День 28

| Что смотреть | Решение по итогам |
|---|---|
| Клики и CTR по кластеру | Если показы есть, а CTR низкий — переписать title и description, не трогая контент |
| Средняя позиция по 22 целевым запросам | Позиции 11–20 — приоритет на усиление; ниже 50 — проверить релевантность интенту |
| Какая из трёх статей получила показы первой | Она указывает, где спрос реален; следующие материалы делать вокруг неё |
| Совпадение запросов между страницами | Основание для правки `intent-manifest.json` |
| Итоговое решение по UZ-версии | При наличии показов у RU-кластера — вернуться к условиям из `05_CONTENT_CLUSTER_PLAN.md` |

## Таблица отслеживания запросов

Заполняется вручную после деплоя. `—` означает «замер не производился», а не «ноль».

| # | Query | Target URL | Initial position | Impressions | Clicks | CTR | Indexing state | Date checked |
|---|---|---|---|---|---|---|---|---|
| 1 | smm услуги | `/ru/smm-prodvizhenie-tashkent/` | — | — | — | — | — | — |
| 2 | smm услуги ташкент | `/ru/smm-prodvizhenie-tashkent/` | — | — | — | — | — | — |
| 3 | smm услуги в ташкенте | `/ru/smm-prodvizhenie-tashkent/` | — | — | — | — | — | — |
| 4 | smm агентство услуги | `/ru/smm-prodvizhenie-tashkent/` | — | — | — | — | — | — |
| 5 | услуги smm агентства | `/ru/smm-prodvizhenie-tashkent/` | — | — | — | — | — | — |
| 6 | заказать smm услуги | `/ru/smm-prodvizhenie-tashkent/` | — | — | — | — | — | — |
| 7 | smm продвижение ташкент | `/ru/smm-prodvizhenie-tashkent/` | — | — | — | — | — | — |
| 8 | стоимость smm услуг | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | — | — | — | — | — | — |
| 9 | пакеты smm услуг | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | — | — | — | — | — | — |
| 10 | пакет услуг smm | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | — | — | — | — | — | — |
| 11 | smm услуги цены | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | — | — | — | — | — | — |
| 12 | сколько стоят услуги smm | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | — | — | — | — | — | — |
| 13 | сколько стоят услуги smm менеджера | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | — | — | — | — | — | — |
| 14 | стоимость услуг smm менеджера | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | — | — | — | — | — | — |
| 15 | что входит в услуги smm специалиста | `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | — | — | — | — | — | — |
| 16 | smm специалист услуги | `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | — | — | — | — | — | — |
| 17 | услуги smm специалиста | `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | — | — | — | — | — | — |
| 18 | услуги smm менеджера | `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | — | — | — | — | — | — |
| 19 | что такое smm услуги | `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | — | — | — | — | — | — |
| 20 | договор на оказание smm услуг | `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | — | — | — | — | — | — |
| 21 | типовой договор на оказание услуг smm | `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | — | — | — | — | — | — |
| 22 | договор на предоставление услуг smm | `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | — | — | — | — | — | — |

Базовая линия на 2026-08-04: по всем 22 запросам **0 показов за предыдущие 6 месяцев** (GSC, 2026-02-01 … 2026-08-01). Состояние индексации на момент деплоя: три новых URL — «URL is unknown to Google», hub — «Submitted and indexed». Любой показ после деплоя — прирост от нуля.

## Чего в этом плане намеренно нет

- Обещания срока выхода в топ. Кластер стартует с нуля показов, конкуренция в Ташкенте состоит из локальных агентств с историей домена.
- Обещания трафика или заявок в штуках.
- Утверждения, что индексация запрошена. Request Indexing **не выполнялся** — Google не даёт для этого API, только ручное действие в интерфейсе GSC. Sitemap отдельно не пересабмичен, потому что он живой и Google его уже читает.
