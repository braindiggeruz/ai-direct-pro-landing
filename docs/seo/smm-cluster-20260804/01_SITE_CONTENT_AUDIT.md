# 01. Аудит существующего контента — SMM и смежные темы

**Дата аудита:** 2026-08-04
**Worktree:** `F:\Claude\gptbot-seo-smm-20260804`
**Ветка:** `feature/seo-smm-cluster-20260804`
**База:** `origin/main` = `7cc234144f3fd21c3d800f947d086c37bd99b120` (содержит production SHA `5a5111f`, проверено `git merge-base --is-ancestor`)

## Как устроен контент проекта

Наблюдения по репозиторию, а не предположения:

| Слой | Где | Как подключается |
|---|---|---|
| Коммерческие страницы | `content/pages/{ru,uz}/*.json` (тип `Page`) | glob в `scripts/prerender.ts`, `scripts/generate-sitemap.ts` |
| Статьи блога | `content/blog/{ru,uz}/*.json` (тип `BlogArticle`) | glob в `scripts/prerender-blog.ts`, `scripts/generate-sitemap.ts` |
| Реестр интентов | `content/seo/intent-manifest.json` | тесты `seo-cluster-quality`, `seo-intent-manifest` |
| Гейт спроса | `content/seo/demand-policy.json` | тест `seo-demand-gate`, только `pageType: money\|niche` |
| Редиректы | `content/seo/redirects.json` | `scripts/redirect-rules.ts`, тест `canonical-url-redirects` |

**Важное следствие:** новые статьи блога подхватываются автоматически по glob. Отдельный реестр статей править не нужно; sitemap и prerender их увидят сами. Регистрировать вручную нужно только участие в кластере — в `intent-manifest.json`.

Действующие пороги из `src/shared/audit.ts` (`RULES`): title 45–65 символов, description 120–160, минимум 3 исходящие внутренние ссылки, минимум 3 FAQ для блога и 4 для money-страницы.

## EXISTING_CONTENT_MAP

Релевантный SMM/маркетинговый срез. Все URL проверены в `content/`, не по памяти.

| URL | Тип | H1 / тема | Intent | Primary keyword (заявлен) | Риск каннибализации с новым кластером | Решение |
|---|---|---|---|---|---|---|
| `/ru/smm-prodvizhenie-tashkent/` | money | SMM-продвижение в Ташкенте: контент, реклама и заявки | transactional | `SMM продвижение Ташкент` | **Прямой.** Это готовый pillar для всего кластера A и D | **Обновить как hub.** Новый pillar не создавать |
| `/ru/blog/chto-takoe-smm-prodvizhenie/` | blog | Что такое SMM-продвижение | informational | `что такое smm продвижение` (+ «что входит», «сколько стоит smm продвижение») | **Высокий** с кластерами B и C | **Оставить, зафиксировать границу.** Включить в кластер как spoke |
| `/ru/digital-marketing-tashkent/` | money | Digital-маркетинг в Ташкенте | transactional | `digital маркетинг Ташкент` | Низкий — шире по охвату, SMM у него подраздел | Сохранить |
| `/ru/internet-reklama-tashkent/` | money | Интернет-реклама в Ташкенте | commercial | `интернет реклама Ташкент` | Низкий — платный трафик, не ведение соцсетей | Сохранить |
| `/ru/performance-marketing-tashkent/` | money | Performance-маркетинг в Ташкенте | transactional | `performance маркетинг Ташкент` | Низкий | Сохранить |
| `/ru/gpt-v-marketinge-smm/` | page/blog | GPT в маркетинге и SMM | commercial | `GPT в маркетинге` | Низкий — про AI-инструменты, не про услугу | Сохранить |
| `/ru/ai-menedzher-dlya-instagram/` | page | AI-менеджер для Instagram | commercial | — | Низкий — продукт, не SMM-услуга | Сохранить, использовать как цель ссылки |
| `/ru/blog/stoimost-digital-marketinga-v-tashkente/` | blog | Сколько стоит digital-маркетинг в Ташкенте | commercial | бюджет digital целиком | **Средний** с кластером B | Разграничить: он про весь бюджет, новая статья — только про SMM |
| `/ru/blog/kak-vybrat-digital-agentstvo-v-tashkente/` | blog | Как выбрать digital-агентство в Ташкенте | commercial | выбор подрядчика | **Средний** с кластером C | Разграничить: агентство целиком vs конкретно SMM-специалист |
| `/ru/blog/pochemu-reklama-v-instagram-ne-prinosit-zayavki/` | blog | Почему реклама в Instagram не приносит заявки | informational | `почему реклама в Instagram не приносит заявки` | Низкий | Сохранить, источник входящих ссылок |
| `/ru/blog/plan-digital-marketinga-na-90-dney/` | blog | План digital-маркетинга на 90 дней | informational | `план digital маркетинга` | Низкий | Сохранить |
| `/ru/blog/kak-provesti-audit-digital-marketinga/` | blog | Аудит digital-маркетинга | informational | `аудит digital маркетинга` | Низкий | Сохранить (позиция 20.5 в GSC — striking distance) |
| `/ru/blog/digital-strategiya-dlya-biznesa-v-uzbekistane/` | blog | Digital-стратегия для бизнеса в Узбекистане | informational | `digital стратегия Узбекистан` | Низкий | Сохранить |
| `/ru/blog/instagram-telegram-crm-odna-voronka-zayavok/` | blog | Instagram, Telegram и CRM: одна воронка | informational | воронка заявок | Низкий | Сохранить |
| `/ru/blog/chto-takoe-lid-v-marketinge/` | blog | Что такое лид в маркетинге | informational | `что такое лид в маркетинге` | Нет | Сохранить |
| `/ru/blog/cpa-cpm-cpc-cpl-v-reklame/` | blog | CPA, CPM, CPC и CPL | informational | модели оплаты | Нет | Сохранить |
| `/ru/blog/marketingovye-terminy-slovar/` | blog | Маркетинговые термины | informational | `маркетинговые термины` | Нет | Сохранить |

**UZ-локаль:** в `content/pages/uz/` и `content/blog/uz/` SMM-страниц нет вообще. Ни одной. Ближайшее — `instagram-uchun-ai-menejer.json` и `instagram-bot-biznes-uchun.json`, это про ботов, не про SMM-услугу.

## Техническое состояние (проверено по коду, не по продакшену)

- **canonical / hreflang** — поля на уровне документа, проверяются `auditPage`. У money-страницы SMM `hreflangUz` отсутствует, потому что UZ-пары нет. Это не дефект: `buildCockpit` считает такие страницы `singleLocalePages`, а не ошибкой.
- **schema** — `schemaTypes` декларативные, prerender собирает `@graph`. У money-страницы: Organization, WebSite, BreadcrumbList, Service, FAQPage.
- **breadcrumbs** — генерируются в prerender из `breadcrumbLabel`.
- **sitemap** — `scripts/generate-sitemap.ts` включает только `status: published` + `robotsIndex: true`.
- **prerender** — статьи рендерятся в `/dist/<locale>/blog/<slug>/index.html`.
- **Первичные источники** — в `BlogArticle` есть поле `sources`, prerender рендерит видимый блок «Первичные источники». Механизм E-E-A-T уже встроен; его нужно использовать, а не изобретать.

## Найденные дефекты (зафиксированы, не все в скоупе)

1. **Существующая каннибализация вне скоупа:** `/ru/blog/chto-takoe-lid-v-marketinge/` и `/ru/blog/marketingovye-terminy-slovar/` оба декларируют `что такое лид в маркетинге`, `что такое cpa в маркетинге`, `что такое cpm в маркетинге`, `что такое roi в маркетинге`. Это не SMM-кластер, поэтому в этом спринте не трогается. Передано владельцу как отдельная задача.
2. **Hub не ссылался на свою же тематическую статью:** у `/ru/smm-prodvizhenie-tashkent/` в `internalLinks` не было ссылки на `/ru/blog/chto-takoe-smm-prodvizhenie/`, хотя статья ссылается на hub. Односторонняя связь. Исправляется в этом спринте.
3. **Тип `Page.pageType` у `/ru/gpt-v-marketinge-smm/` — `blog`, а файл лежит в `content/pages/`.** Легаси, работает, не трогаем.

## Вывод аудита

Коммерческая SMM-страница уже существует, опубликована и оформлена как money-страница с Service-схемой. **Создавать вторую коммерческую страницу под «SMM-услуги в Ташкенте» нельзя** — это прямая каннибализация одного и того же transactional-интента. Правильное действие: сделать существующую страницу hub'ом кластера и добрать интенты, которые она не закрывает, статьями.
