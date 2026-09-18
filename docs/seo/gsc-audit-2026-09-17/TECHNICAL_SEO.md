# Technical SEO — gptbot.uz, проверка 2026-09-17

Для каждого пункта указан источник: **[API]** Search Analytics через OpenSEO MCP, **[INSP]** URL Inspection API (31 URL), **[HTTP]** публичные запросы к сайту, **[CRAWL]** краул 289 URL sitemap без выполнения JS, **[CODE]** репозиторий `origin/main` a16f7988. Что не проверялось — сказано явно.

## Стек и где что задаётся [CODE]

- Vite 8 + React 19 SPA; публичные страницы **полностью пререндерены** в статический HTML: `scripts/prerender.ts` (лендинги), `scripts/prerender-blog.ts` (статьи), `scripts/prerender-home.ts`. Краул подтверждает: 600–3 000 слов текста в HTML без JS, `has_root_div_only = 0`.
- Контент: `content/pages/{ru,uz}/*.json` (73 + 49), `content/blog/{ru,uz}/*.json` (127 + 56), `content/global/site.json`. Поля: `title`, `h1`, `description`, `canonical`, `hreflangRu/Uz`, `og*`, `robotsIndex`, `schemaTypes`, `faq`, `internalLinks`, `cta`, `lastReviewedAt/updatedAt/dateModified`.
- JSON-LD: `scripts/jsonld-helpers.ts` (Organization + ProfessionalService, WebSite, Person, BreadcrumbList, Service, WebPage, Article), FAQPage — inline в prerender-скриптах.
- Sitemap: `scripts/generate-sitemap.ts` → `dist/sitemap.xml` из published-контента с `lastmod` (`lastReviewedAt || updatedAt || createdAt`; для статей `dateModified || …`) и `xhtml:link` hreflang. `functions/sitemap.xml.ts` домешивает динамические статьи из D1.
- robots.txt: `src/shared/robots-policy.ts` (единый источник) → `scripts/generate-robots.ts` и `functions/robots.txt.ts` (edge, обходит Cloudflare Free managed-блок AI-ботов).
- Редиректы/заголовки: `scripts/generate-robots.ts` пишет `dist/_redirects` и `dist/_headers` из `content/seo/redirects.json` (16 правил) + www→non-www; `public/_redirects`, `public/_headers` — резерв. `functions/_middleware.ts` — `?lang=` → локаль (301).
- Деплой: `scripts/release/pages-production.ts` (stamp / check / check-production / deploy) с guard `scripts/seo-protection.ts` по baseline `docs/seo/evidence/2026-09-14/reviewed-protected-pages.json` (10 URL). Прямой wrangler запрещён процессом.
- Существующая GSC-интеграция в коде: `functions/lib/gsc/sitemap.ts` (submit sitemap по OAuth refresh-token из секретов Cloudflare Pages `GSC_CLIENT_ID/SECRET/REFRESH_TOKEN`) — значения недоступны локально и не использовались.

## Индексация

- [INSP] 42 URL (все 10 защищённых, ключевые сервисные, все 12 без показов, legacy): 36 — «Submitted and indexed», PASS, Google canonical = user canonical во всех случаях; crawledAs MOBILE; последний краул у лидеров 4–14 сентября.
- [INSP] Проблемные: /ru/promty-gpt-chatgpt-50-primerov/ и /ru/chto-takoe-gpt-i-kak-polzovatsya/ — «Crawled – currently not indexed» (обе — краул 13.07, обе RU-объяснительные страницы про GPT, обе без показов); /ru/telegram-bot-uzbekistan/ — «Not found (404)» на 23.08 (сейчас 301 [HTTP]); /ru/gpt-vs-chatgpt-sravnesie/ — «URL is unknown to Google», 404 [HTTP]; два «Page with redirect» — норма.
- [INSP] Для 10 проиндексированных URL Google не связывает ни один sitemap (`inSitemapPerGoogle` пуст): /ru/stoimost-chat-bota/, /uz/chat-bot-narxi/, /ru/seo-prodvizhenie-saytov-tashkent/, /ru/smm-prodvizhenie-tashkent/, /ru/telegram-bot-dlya-biznesa/, /ru/, /uz/, /ru/blog/chatgpt-i-claude-v-uzbekistane/, /uz/blog/ai-chat-nima…, /ru/gpt-vs-chatgpt-sravnenie/ — при том, что они есть в sitemap.xml [HTTP]. Индексации это не мешает; указывает на то, что Google давно не перечитывал sitemap целиком или читает его частями.
- Отчёты Coverage/Index («262 проиндексировано / 78 исключено» на 6 сентября из интерфейса) через API недоступны — не проверялись.
- [API] Страниц с показами за всё время 295, из них 18 вне текущего sitemap (13 legacy-301, 2 × 404, ?lang=, www, http).
- [CRAWL] 12 URL sitemap без показов за 16 месяцев (список в PAGE_ANALYSIS.md).

## Sitemap [HTTP][CODE]

| Файл | URL | Источник | lastmod |
|---|---|---|---|
| /sitemap.xml | 289 | генерируется из контента | да, из контента |
| /sitemap-new.xml | 5 | статический `public/sitemap-new.xml` | — |
| /sitemap-priority.xml | 18 | статический `public/sitemap-priority.xml` | — |

Все три объявлены в robots.txt (`src/shared/robots-policy.ts:96-97`). Все 23 URL из дополнительных файлов присутствуют в основном. Дополнительные файлы не пересобираются и не имеют lastmod — со временем расходятся с контентом. Только `https://gptbot.uz/…`, без www — корректно. `sitemap-index.xml`, `sitemap_index.xml` — 404 (не нужны).

## robots.txt [HTTP][CODE]

Allow всем, включая AI-краулеры (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-Web, GPTBot, Google-Extended и т. д.); Disallow только `/admin/`, `/admin-tools/`, `/api/`. Отдаётся Function'ом. Robots-директив, блокирующих контент, нет [INSP: robotsTxtState ALLOWED у всех].

## Canonical, хост, слеш, параметры [HTTP][CRAWL]

| Проверка | Результат |
|---|---|
| http://gptbot.uz/ | 301 → https://gptbot.uz/ |
| http(s)://www.gptbot.uz/ | 301 → https://gptbot.uz/ |
| /ru/gpt-chat (без слеша) | 308 → /ru/gpt-chat/ |
| /index.html | 308 → / |
| /?lang=uz, /?lang=ru | 301 → /uz/, /ru/ |
| /blog/ | 301 → /ru/blog/ |
| /RU/gpt-chat/ (регистр) | 404 (норма) |
| /ru/gpt-chat/?utm_source=x | 200, self-canonical без параметров |
| canonical на 289 страницах | self, один тег, https без www |
| noindex / X-Robots-Tag | 0 страниц |

В GSC-данных www/http-варианты — 4 показа за 16 месяцев: консолидация работает.

## hreflang [CRAWL][CODE]

- Лендинги (`content/pages`): пары `ru` / `uz` / `x-default` в `<link>` и в sitemap — есть (пример: /ru/gpt-chat/ ↔ /uz/gpt-uzbek-tilida/, x-default = uz).
- Статьи блога: hreflang отсутствует (одноязычный контент, пары не объявлены) — допустимо; там, где пара существует (/uz/blog/chatgpt-uzbek-tilida-promptlar/ ↔ /ru/promty-gpt-chatgpt-50-primerov/), она объявлена.
- Главная `/`: только `x-default` → `/`, при этом существуют `/ru/` («AI-боты для бизнеса в Узбекистане») и `/uz/» («Biznes uchun AI botlar O‘zbekistonda») как самостоятельные главные с self-canonical. Кластер главных не описан hreflang'ом; `/` и `/ru/` — два русских «дома» (брендовый «gptbot» делится 13 / 6 показов). Не ошибка, но неопределённость; решение владельца — см. backlog T13.
- `html lang`: `ru` / `uz` корректно по локали.

## Structured data [CRAWL][INSP]

- На всех 289: Organization + ProfessionalService (в `@graph`), WebSite, Person (автор). BreadcrumbList — на 288 (кроме `/`). Лендинги: WebPage + Service (+ SoftwareApplication на страницах чата). Статьи: Article. FAQPage — на 286 страницах.
- [INSP] Rich results, распознанные Google: только **Breadcrumbs**. FAQPage не распознаётся как rich result — ожидаемо: с августа 2023 Google показывает FAQ-расширения только для авторитетных gov/health-сайтов. Разметка не вредит (FAQ видимы на странице), но выгоды в SERP не даёт; поддерживать только там, где FAQ реально есть.
- LocalBusiness не используется (ProfessionalService — подтип LocalBusiness, адрес/телефон — в `site.json`). Отдельная проверка валидности через Rich Results Test не выполнялась.

## Внутренние ссылки [CRAWL]

- Главная ссылается на 289 URL (хаб «все страницы»). Из-за этого формальных сирот нет; страница, доступная только с главных, — /ru/kak-sdelat-ai-bota-telegram-instagram/.
- У лидеров 10–23 внутренних ссылок на странице; `content/seo/internal-links.json` пуст (`[]`) — карта перелинковки не ведётся в коде.
- Вход в чат из статей есть (кнопка «AI chatni yuklamasdan ochish» и т. п.) на всех проверенных статьях.

## Производительность и мобильность

- **Не измерено.** PageSpeed Insights API без ключа вернул «Quota exceeded» (общая анонимная квота); локальный Lighthouse не установлен; CrUX требует ключ. По документу от 6 сентября полевых CWV недостаточно (мало трафика в CrUX).
- [INSP] `mobileUsabilityResult` — VERDICT_UNSPECIFIED (Google больше не отдаёт этот отчёт через API). Все страницы краулятся как MOBILE.
- [HTTP] HTML: `Cache-Control: public, max-age=0, s-maxage=3600, stale-while-revalidate=86400`, HSTS preload, `x-content-type-options: nosniff`, Cloudflare. Размер HTML лидера — см. `site_pages.csv` (`html_bytes`).
- Рекомендация: снять Lighthouse (mobile) для 4 лидеров через `npx lighthouse` или PSI с API-ключом, отдельно от этого аудита.

## Мета-теги и контент [CRAWL]

- Title > 65 символов: 24 URL (сервисные лендинги вида «… — от 1 990 000 сум, запуск за 5 дней | GPTBot», до 89). Description > 165: 32 (9 > 200). На лидерах длины в норме (46–62 / 133–177).
- Open Graph и Twitter Card: og:title/description/image/url/locale и twitter:card на всех страницах (генерируются в prerender).
- Изображения: 1–2 на странице, alt есть (кроме пикселя Метрики с пустым alt — норма).
- Дубли title/H1/description: 0. Thin content (< 300 слов): 0. Soft-404 не обнаружены (все 289 — реальные страницы, 404 отдаётся на несуществующие пути).

## Что не проверено и почему

| Пункт | Причина |
|---|---|
| Список properties, Sitemaps API (last read, errors), Index Coverage, Page Experience | недоступно через используемую интеграцию; прямой OAuth не настроен |
| searchAppearance | API вернул 0 строк |
| Core Web Vitals (field/lab) | квота PSI, нет ключа, нет Lighthouse |
| Rich Results Test / валидатор schema | не запускался |
| Бэклинки | вне GSC-скоупа |

## Конкретные файлы для правок

| Тема | Файлы |
|---|---|
| title/description/H1 страниц | `content/pages/{ru,uz}/<slug>.json`, `content/blog/{ru,uz}/<slug>.json` |
| baseline защищённых страниц | `docs/seo/evidence/2026-09-14/reviewed-protected-pages.json`, `scripts/seo-protection.ts:12-21` |
| редиректы | `content/seo/redirects.json` → `scripts/generate-robots.ts` |
| sitemap | `scripts/generate-sitemap.ts`, `public/sitemap-new.xml`, `public/sitemap-priority.xml`, `src/shared/robots-policy.ts:96-97`, `scripts/generate-robots.ts:270` |
| hreflang главных | `scripts/prerender-home.ts`, `scripts/generate-sitemap.ts:74-79` |
| внутренние ссылки | поле `internalLinks` в JSON контента, `content/seo/internal-links.json` |
