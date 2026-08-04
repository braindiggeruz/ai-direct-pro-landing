# 08. Отчёт о внедрении

**Дата:** 2026-08-04. Worktree `F:\Claude\gptbot-seo-smm-20260804`, ветка `feature/seo-smm-cluster-20260804`.

## Изоляция от Codex — соблюдена

| Требование | Как выполнено |
|---|---|
| Не работать в worktree Codex | Работа велась только в `F:\Claude\gptbot-seo-smm-20260804`. `F:\Claude\gptbot-bormi-api-fix` (ветка `release/bormi-public-beta-1`) не открывался на запись |
| Не трогать незакоммиченные файлы Codex | На момент старта у Codex было 3 незакоммиченных пути в `docs/production-closure/2026-08-04/`. Они не читались и не менялись |
| Не переключать его ветку | Ветка не переключалась. Новый worktree создан командой `git worktree add -b … origin/main` |
| Не делать merge / rebase / force push | Не выполнялись |
| Не деплоить, не трогать Cloudflare, D1, Mini App, Bormi Admin, marketplace, API, auth, migrations | Не выполнялись |
| Не смешивать SEO-коммиты с кодом Bormi | В диффе только `content/**` и `docs/seo/**` |

**Замечание по `node_modules`.** В новом worktree зависимостей не было. Вместо `npm install` создана junction-ссылка на `node_modules` из `F:\Claude\gptbot-main-baseline-20260801` — простаивающего worktree в detached HEAD, **не** рабочего дерева Codex. Каталог в `.gitignore`, в диффе не появляется. Ссылку можно удалить командой `rmdir F:\Claude\gptbot-seo-smm-20260804\node_modules`.

## База ветки

```
git fetch --all --prune
git merge-base --is-ancestor 5a5111f90b8e1816069802a8fa06aa41d21e09b6 origin/main  → true
```

`origin/main` = `7cc234144f3fd21c3d800f947d086c37bd99b120` содержит production SHA `5a5111f`, поэтому по правилу из постановки ветка создана от свежего `origin/main`. `origin/main` не изменялся.

## Что создано

| Файл | URL | Тип |
|---|---|---|
| `content/blog/ru/stoimost-i-pakety-smm-uslug-v-tashkente.json` | `/ru/blog/stoimost-i-pakety-smm-uslug-v-tashkente/` | BlogArticle |
| `content/blog/ru/chto-vhodit-v-uslugi-smm-specialista.json` | `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | BlogArticle |
| `content/blog/ru/dogovor-na-okazanie-smm-uslug-v-uzbekistane.json` | `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | BlogArticle |
| `docs/seo/smm-cluster-20260804/*.md` | — | 11 документов |

## Что изменено

| Файл | Изменение | Что сохранено без изменений |
|---|---|---|
| `content/pages/ru/smm-prodvizhenie-tashkent.json` | +4 ссылки в `internalLinks`, +1 блок `linkp` в теле, +3 `secondaryKeywords`, +1 фраза в первом абзаце раздела, `lastReviewedAt`/`updatedAt` → 2026-08-04 | H1, title, description, canonical, hreflang, OG, `schemaTypes`, CTA, все существующие блоки и ссылки |
| `content/blog/ru/chto-takoe-smm-prodvizhenie.json` | +3 ссылки в `internalLinks`, +1 блок `linkp`, расширен существующий `linkp` про бюджет, `dateModified`/`updatedAt` → 2026-08-04 | **`keywords` не тронуты** — страница сохраняет всё, чем владела. H1, title, description, тело |
| `content/blog/ru/stoimost-digital-marketinga-v-tashkente.json` | +1 ссылка | Всё остальное |
| `content/blog/ru/kak-vybrat-digital-agentstvo-v-tashkente.json` | +2 ссылки | Всё остальное |
| `content/seo/intent-manifest.json` | +1 кластер `smm-ru` | Существующие кластеры и пары |

## Использование существующей архитектуры

Второй content engine не создавался. Задействовано то, что уже есть:

| Механизм | Как подключено |
|---|---|
| Роутинг | Не требует правок: статьи обслуживаются существующим маршрутом `/ru/blog/<slug>/` |
| Реестр статей | Отсутствует как отдельный файл — `scripts/prerender-blog.ts` и `scripts/generate-sitemap.ts` читают `content/blog/**/*.json` по glob. Новые файлы подхватились автоматически |
| Prerender | `scripts/prerender-blog.ts`, без изменений |
| Sitemap | `scripts/generate-sitemap.ts`, без изменений |
| Schema | `schemaTypes` в документе + `scripts/jsonld-helpers.ts`, без изменений |
| Breadcrumbs | Генерируются prerender'ом, без изменений |
| Блок источников | Существующее поле `sources` типа `BlogArticle`, рендерится как «Первичные источники». Ранее использовалось одной статьёй, теперь тремя |
| Дизайн | Не менялся. Статьи наследуют существующий шаблон |
| Компоненты, design-system, RSS, search index | Не затрагивались |

## Схемы

| URL | schemaTypes | Проверка соответствия видимому контенту |
|---|---|---|
| `/ru/smm-prodvizhenie-tashkent/` | Organization, WebSite, BreadcrumbList, **Service**, FAQPage | Service — подтверждённая услуга; FAQ виден на странице (8 вопросов) |
| 3 новые статьи | Organization, WebSite, BreadcrumbList, **Article**, FAQPage | Article — информационный материал; FAQ виден (по 6 вопросов на каждой) |

`Offer`, `Review`, `AggregateRating` не используются нигде — за ними нет проверяемых данных. Проверено в собранном HTML: строки отсутствуют.

## Sitemap и prerender

| Показатель | До | После |
|---|---|---|
| Записей в sitemap | 248 | **251** |
| Страниц | 115 | 115 |
| Статей | 130 | **133** |
| Потеряно существующих URL | — | **0** |

Prerender: `Prerendered 133 article(s), skipped 7 draft(s)`. Все три новые статьи присутствуют в `dist/ru/blog/<slug>/index.html` и в `dist/sitemap.xml` — проверено явно.

## Соответствие правилам проекта

| Гейт | Результат |
|---|---|
| `demand-policy.json` | Не применяется: гейт действует на `pageType: money\|niche`, новых коммерческих страниц не создано. Тест `the current repository passes its own demand gate` — пройден |
| `intent-manifest.json` | Кластер `smm-ru` добавлен, все 11 тестов кластерного качества пройдены |
| Запрет на выдуманные цены | Собственный прайс не публикуется. Рыночные цифры приведены с источником, датой и описанием метода, и явно названы наблюдениями, а не средней ценой |
| Запрет на выдуманные кейсы | Кейсов нет. Есть один явно помеченный условный сценарий расчёта |
| Запрет на гарантии | Отсутствуют. В нескольких местах прямо объясняется, почему гарантии невозможны |
| Позиционирование бренда | Нигде не заявлено родство с ChatGPT, OpenAI, Telegram, Google или Meta. Площадки упоминаются как площадки |
