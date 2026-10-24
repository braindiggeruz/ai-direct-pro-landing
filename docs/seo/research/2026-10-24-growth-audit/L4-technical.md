# L4 — технический SEO-аудит GPTBot.uz (2026-10-24)

Линза L4 из growth-audit. Только чтение: код, `dist/` и живой сайт не менялись. Сборка, которую проверяли: `F:\Claude\gptbot-snippets-translator-20261024\dist`. Это коммит `d54d5b61`, в production он развёрнут как `d0264730` (`dist/gptbot-release.json`, коммит `30682bc4`). Кредиты OpenSEO не тратились: `whoami` → 24 083 до работы, вызывались только бесплатные инструменты (GSC, URL Inspection, GA4).

## 0. Главное

1. **В индексе нет одной страницы с реальным спросом.** `/uz/blog/slayd-tayyorlash/` в GSC: «Crawled – currently not indexed». Последний обход — 2026-10-08, после него Google на страницу не возвращался. Эта страница по `intent-manifest.json` (C29/C40) отвечает за «slayd tayyorlash» (5 400 в месяц), «prezentatsiya tayyorlash» (1 900) и «taqdimot tayyorlash» (1 000) — данные из `demand-policy.json`. Остальные 57 из 58 проверенных URL проиндексированы, и выбранный Google canonical везде совпадает с указанным.
2. **Яндекс даёт примерно 31,5% поисковых сессий, а GSC его не видит.** В GA4 за 26.09–23.10: yandex.* — 589 сессий, google/organic — 1 251. Отдельного технического плана под Яндекс нет: в robots.txt нет `Clean-param`, состояние Яндекс.Вебмастера не проверено.
3. **Core Web Vitals не измерены.** PSI без ключа не ответил: первая попытка дала 404 (в брифе ошибка в адресе API), вторая — 429 (дневная квота исчерпана). А мобильные дают 77,7% кликов. Единственный замер — лабораторный от 2026-10-07: LCP чатов 2,1–3,1 с. На RU-чате LCP сдвигается с 2 204 на 3 100 мс, потому что React (`createRoot`) заменяет пререндеренный H1.
4. **«Unnamed item» в Breadcrumbs — это подпись, а не ошибка.** У всех 299 BreadcrumbList нет поля `name` верхнего уровня, а GSC подписывает найденные элементы по `name`. Вердикт PASS на всех 57 проиндексированных URL. Причина одна — `buildBreadcrumbLd` в `scripts/jsonld-helpers.ts:194-204`. Кроме того, на `/uz/` хлебная крошка ведёт саму на себя.
5. **Всё остальное в обходе 300 URL чисто:** 0 битых внутренних ссылок, 0 ссылок на редиректы, 0 noindex в sitemap, у каждой страницы ровно один H1 и self-canonical. Hreflang взаимен на всех 154 парных страницах, x-default согласован. `lastmod` совпадает с `dateModified` в JSON-LD, 0 расхождений. Live = dist плюс две правки Cloudflare (Email Obfuscation снимает `<!--email_off-->`, вставляется beacon Web Analytics).

## 1. Источники и методика

| Что | Как | Где лежит результат |
|---|---|---|
| Офлайн-обход 300 URL из `dist/sitemap.xml` | `l4-data/scripts/crawl_dist.py` (stdlib HTMLParser, сеть не используется) → `analyze.py` | `l4-data/dist-crawl-summary.json`, `l4-data/internal-link-graph.json` |
| Живая проверка: 28 страниц и 29 вариантов URL/служебных файлов | `l4-data/scripts/live_check.py`: GET, десктопный Chrome UA, редиректы не отслеживаются, пауза 0,6 с (≤2 запросов в секунду), sha256 сравнивается с dist | `l4-data/live-check.json` |
| GSC URL Inspection, 58 URL | OpenSEO `inspect_urls`, 8 вызовов | `l4-data/gsc-url-inspection-2026-10-24.json` |
| GSC по страницам, 28 дней (24.09–21.10) | `get_search_console_performance` dims=page: 277 строк, `hasMore=false`, resultId `a7b42bc7…`. Совпадает с `MONEY_ROBOT_GPTBOT_2026/_work/baseline.json` | `l4-data/gsc-sitemap-coverage.json` |
| GSC по устройствам и searchAppearance, 28 дней | resultId `4dd49997…` (устройства); searchAppearance — 0 строк (`77eee412…`) | в тексте |
| GSC запросы о презентациях, 3 месяца | contains «презентац» — 0 строк (`b38e42a0…`), «taqdimot» — 1 строка (`a8bf0054…`), «slayd» — 0 строк (`f0ae406e…`) | в тексте |
| GA4 source/medium, 26.09–23.10 | `get_google_analytics_traffic_acquisition`, свойство 540129731 | в тексте |
| PSI mobile, 6 URL | 2 попытки, обе без данных | `l4-data/psi-attempt1-404.txt`, `psi-attempt2-429.txt` |
| Лабораторный LCP/CLS (ранний замер) | `docs/seo/evidence/2026-10-07-chat-ui/layout-report.json`. Сделан `scripts/chat-layout-check.mjs` с CPU ×4 и сетью 562,5 мс / 1,44 Мбит/с | в тексте |

## 2. Офлайн-обход dist: 300 URL sitemap

| Проверка | Результат | Комментарий |
|---|---:|---|
| Файл для URL есть в dist | 300 / 300 | |
| `<title>` есть / дубли | 300 / 0 | длина 30–66 символов, медиана 53; длиннее 60 — 27 страниц, длиннее 65 — 1 (`/uz/instagram-target-yoqish/`, 66) |
| meta description есть / дубли / несколько на странице | 300 / 0 / 0 | длина 120–172, медиана 146; длиннее 160 — 7 страниц (самая длинная — `/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/`, 172) |
| Ровно 1 canonical, self-referencing | 300 / 300 | `og:url` совпадает с canonical на всех |
| robots meta | 300 × `index, follow, max-image-preview:large` | noindex в sitemap — 0 |
| Ровно один H1, непустой | 300 / 300 | |
| `<html lang>` совпадает с префиксом URL | 300 / 300 | |
| Hreflang: страниц с парой | 154 | 0 невзаимных пар, 0 без self, 0 без x-default; x-default согласован внутри пар (150 → ru, 4 → uz: оба чата и обе оферты) |
| Hreflang: HTML = sitemap `xhtml:link` | 300 / 300 | |
| Одноязычные страницы без hreflang | 146 | Это не ошибка: UZ/RU-страницы написаны отдельно (intent-manifest) |
| JSON-LD: блоки разбираются | 300 / 300 | 0 невалидных |
| BreadcrumbList | 299 страниц (нет только на `/`) | 299 / 299 без `name` верхнего уровня; последний элемент = canonical на всех; 1 дубль (`/uz/` → `/uz/`) |
| FAQPage | 296 | В выдаче не показывается: searchAppearance за 28 дней — 0 строк |
| SoftwareApplication / WebApplication с offers | 7 (оба чата, `/ru/gpt-na-russkom/`, студия ×2, `/uz/tariflar/`, калькулятор) | Без aggregateRating, фейковых рейтингов нет; на rich result не претендуют |
| Article / BlogPosting | 183 | 0 без headline / date / image / author; headline длиннее 110 — 0 |
| `lastmod` в sitemap = `dateModified` в JSON-LD | 294 / 294 сравнимых | У 6 URL (`/`, оба индекса блога, студия ×2, `/uz/tariflar/`) нет `dateModified` в WebPage/Article |
| `sitemap-updates.xml` — подмножество sitemap | 28 / 28 | |
| Картинки из sitemap есть в dist | 140 / 140 | |
| `<img>` без alt | 0 из 458 | `<img>` без width/height — 300, и это только noscript-пиксель Яндекс.Метрики (`mc.yandex.ru/watch/111312750`), не контент |
| Внутренние ссылки: битые / на редирект / без слеша / www или http | 0 / 0 / 0 / 0 | |
| Входящие внутренние ссылки | 0 → 0 стр., 1–2 → 2, 3–9 → 203, 10+ → 95 | глубина от `/`: 1 клик — 294, 2 клика — 4, 3 клика — 1 |
| HTML-страница больше 100 КБ | 37 | максимум — 210 553 Б (`/ru/razrabotka-telegram-bota-tashkent/`), медиана 63 678 Б |
| Markdown-альтернативы (`rel=alternate type=text/markdown`) | 297 страниц, 0 битых | 28 `index.html.md`, остальные ведут на `/llms.txt`; `.md` отдаются с `X-Robots-Tag: noindex, follow` |
| HTML вне sitemap | 1 (`/404.html`, noindex) | title «404 — Страница не найдена \| GPTBot»: без «.uz», а правило бренда в AGENTS.md §2 требует «GPTBot.uz» |

## 3. Живая проверка

### 3.1 Страницы (28 URL, все 200)

Все 28 отдают 200, `text/html; charset=utf-8`, gzip. `cf-cache-status: DYNAMIC` (Pages раздаёт ассеты сам), `Cache-Control: public, max-age=0, s-maxage=3600, stale-while-revalidate=86400`. TTFB с этого хоста — 0,29–0,59 с; дольше всех `/ru/blog/` (0,588 с), его отдаёт Pages Function. HTML отличается от dist только правками Cloudflare: снимаются комментарии `<!--email_off-->`, перед `</body>` вставляется beacon `static.cloudflareinsights.com` (diff на `/ru/gpt-chat/` и `/ru/telegram-bot-dlya-biznesa/`). Title, canonical, hreflang и robots на живом сайте совпадают с dist.

### 3.2 Варианты URL и служебные файлы

| Запрос | Ответ | Вывод |
|---|---|---|
| `http://gptbot.uz/`, `http://gptbot.uz/uz/gpt-uzbek-tilida/` | 301 → https, одним шагом | OK |
| `https://www.gptbot.uz/uz/gpt-uzbek-tilida/` | 301 → без www, одним шагом | OK |
| `/uz/gpt-uzbek-tilida` (без слеша), `…/index.html`, `/uz/blog/index.html` | 308 → `…/` | OK (поведение Pages) |
| `/ru/`, `/ru` | 301 → `/` | OK. В GSC у `/ru/` ещё 70 показов (поз. 9,6) — склейка идёт |
| **`/?lang=ru`** | **301 → `/ru/` → 301 → `/`** | **Цепочка из двух шагов.** Ответ без `cf-cache-status`. Та же логика есть в `functions/index.ts` (`lang=ru` → `/ru/`), но `/` нет в `dist/_routes.json` → **какой слой отдаёт 301, не проверено** |
| `/?lang=uz` | 301 → `/uz/` | OK |
| `/ru/gpt-chat/?utm_source=test` | 200, canonical без параметра | для Google OK; для Яндекса см. §9 (Clean-param) |
| `/ru/blog/?q=test` | 301 → `/ru/blog/` | OK (`functions/lib/blog-index-edge.ts`) |
| несуществующий путь, `/UZ/GPT-UZBEK-TILIDA/`, черновик из `_redirects` | 404, `no-store`, noindex | OK |
| `/gpt-chat/`, старый `…kompyuter-ga…` | 301 одним шагом | OK |
| `robots.txt`, `sitemap.xml`, `sitemap-updates.xml`, `llms.txt`, `llms-full.txt`, фиды, `.md` | 200, sha256 = dist | OK |
| **`llms.txt`, `llms-full.txt`, `*.md` — заголовок Cache-Control** | `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400, public, max-age=21600` (для `.md` — `…, public, max-age=3600`) | **Два значения склеились:** у этих правил в `scripts/generate-robots.ts:287-303` нет `! Cache-Control`, хотя у sitemap/robots/фидов он есть |
| `/updates/atom.xml` | 200, без gzip | мелочь |
| `https://gptbot.uz/sitemap-new.xml` | **404** | GSC всё ещё числит его sitemap'ом для `/uz/suniy-intellekt/` — устаревшая отправка в GSC |
| `ai-direct-pro-landing.pages.dev` (`/` и `/ru/gpt-chat/`) | 200 + `X-Robots-Tag: noindex` | дубль хоста закрыт |

## 4. GSC URL Inspection: 58 URL

Проверены 10 приоритетных из брифа, 4 B2B-пары, 10 страниц с нулём показов, все 32 B2C-страницы из baseline и ещё 2 URL.

| Итог | URL | Детали |
|---|---:|---|
| Submitted and indexed, Google canonical = user canonical | 57 | |
| **Crawled – currently not indexed** | **1** | **`/uz/blog/slayd-tayyorlash/`**, обход 2026-10-08 02:01 UTC, fetch SUCCESSFUL, robots ALLOWED, canonical свой. В GSC за 28 дней — 1 показ (поз. 6) |
| Rich results, тип Breadcrumbs, вердикт PASS | 56 | у каждого item подписан «Unnamed item». На `/` rich result нет (BreadcrumbList там нет), на slayd — тоже нет (страница не в индексе) |
| Последний обход больше 60 дней назад | 3 | `/ru/blog/chat-bot-chto-eto-vidy-i-kak-vybrat/` (08-01), `/ru/blog/pochemu-sayt-ne-prinosit-zayavki/` (08-05), `/ru/blog/golosovoy-chat-s-ii-dlya-biznesa/` (08-15). У всех трёх в 28-дневном окне 0 показов |

**Почему slayd не в индексе — что проверено.** Внутренних ссылок на страницу 14, включая ссылку с UZ-чата. Глубина от главной — 1 клик. Страница есть в sitemap, `uz/blog/feed.xml` и `updates/atom.xml`. По 5-словным шинглам основного текста (без nav/footer) пересечение с любой другой страницей сайта не больше 5,1% (с `/uz/blog/referat-va-mustaqil-ish/`). Объём 1 952 слова. Значит, дело не в дубле и не в доступности. Скорее всего Google один раз обошёл страницу в день выкладки (lastmod 2026-10-08 = день обхода) и больше к ней не возвращался.

**Нулевые показы ≠ не в индексе.** У 27 из 300 URL sitemap за 28 дней 0 показов (`l4-data/gsc-sitemap-coverage.json`). Проверены 10 из них — все в индексе. Здесь вопрос спроса и контента, а не технический.

## 5. JSON-LD: откуда «Unnamed item»

**Механизм.** В URL Inspection найденный элемент структурированных данных подписывается его свойством `name`. Объект `BreadcrumbList`, который строит `buildBreadcrumbLd()` (`scripts/jsonld-helpers.ts:194-204`), содержит только `@type` и `itemListElement`. У каждого ListItem `name` и абсолютный `item` есть, поэтому вердикт PASS: это подпись, а не ошибка, и на показ хлебных крошек в выдаче она не влияет. Микроразметки и RDFa в HTML нет (0 `itemprop`/`itemscope`), значит второго, «безымянного» источника крошек тоже нет.

**Все места, где собирается BreadcrumbList:**

| Шаблон | Строка | Страницы |
|---|---|---|
| `scripts/prerender.ts` (через `buildBreadcrumbLd`) | 345–350 | все content-страницы, включая оба чата и `/uz/` |
| `scripts/prerender-blog.ts` — статьи | 284–288 | все статьи `/ru/blog/*`, `/uz/blog/*`, включая 7 защищённых |
| `scripts/prerender-blog.ts` — индекс блога | 565–568 | `/ru/blog/`, `/uz/blog/` |
| `apps/studio/scripts/studio-page.ts` | 347–350 | `/ru/prezentatsiya-ai/`, `/uz/taqdimot-ai/` (и `/uz/tariflar/`, если он собирается тем же шаблоном) |
| `functions/platform/bunzy/render.ts` | 86–92 | Bunzy (рендер на edge, не в sitemap gptbot.uz). Объект там собран вручную, `name` тоже нет |

**Вторая находка.** На `/uz/` BreadcrumbList такой: `1: GPTBot.uz → https://gptbot.uz/uz/`, `2: O‘zbekcha bo‘lim → https://gptbot.uz/uz/`. Получается крошка, которая ведёт сама на себя. Причина в `prerender.ts:347`: для узбекских страниц позиция 1 — это всегда `/uz/`, даже когда страница и есть `/uz/`.

**Защищённые страницы.** `seoContract()` (`scripts/seo-protection.ts`) вырезает `<script>` до того, как считает отпечаток. Поэтому правка JSON-LD гейт не уронит, но JSON-LD девяти защищённых страниц всё равно изменится → нужна ревизия.

## 6. Hreflang и две «известные несостыковки»

Технически всё взаимно. Пары из брифа:

| UZ | ← hreflang → | RU | GSC 28 дн. UZ | GSC 28 дн. RU | RU-конкурент без пары | GSC 28 дн. конкурента |
|---|---|---|---|---|---|---|
| `/uz/telegram-bot-biznes-uchun/` | взаимно | `/ru/telegram-bot-dlya-biznesa/` | 1 клик / 16 показов / поз. 9,9 | 0 / 71 / 17,5 | `/ru/razrabotka-telegram-bota-tashkent/` (RU-хаб `telegram-leads-ru`) | 0 / 18 / 58,5 |
| `/uz/sayt-uchun-ai-bot/` | взаимно | `/ru/ai-bot-dlya-sayta/` | 0 / 3 / 3,7 | 0 / 5 / 58,4 | `/ru/ai-chat-dlya-sayta/` | 2 / 61 / 26,6 |

Расхождение здесь на уровне интентов, а не техники: UZ-хаб сопряжён не с той RU-страницей, которую выбрали владельцем интента в off-page кампании (`MONEY_ROBOT_GPTBOT_2026/_work/cannibalization.md` P2/P3). При этом `intent-manifest.json` → `commercialClusters[telegram-leads-uz].note` прямо запрещает «hreflang reassignment». Значит, это решение владельца, а не техническая правка.

## 7. Производительность

**Полевых CWV нет.** PSI: 6 запросов на `…/pagespeedinsights/v5/…` (адрес из брифа) → 404, адрес неверный. 6 запросов на правильный `…/pagespeedonline/v5/runPagespeed` → 429 «Quota exceeded … Queries per day» (общая квота анонимного проекта). Ни один тест не прошёл. Прошлые аудиты тоже записали CWV как UNMEASURED (`docs/seo/gptbot.uz-audit/findings/technical.md:25`, `docs/seo/full-audit-2026-09-29/REPORT-RU.md:52`).

**Почему это важно.** GSC по устройствам за 28 дней: MOBILE — 1 230 кликов из 1 584 (77,7%) и 172 952 показа из 214 911 (80,5%).

**Лабораторный замер 2026-10-07** (`layout-report.json`, сборка того дня, CPU ×4, 562,5 мс, 1,44 Мбит/с — пресет DevTools «Slow 4G»):

| Экран | Чат | LCP | Элемент | CLS |
|---|---|---:|---|---:|
| 320×568 | UZ | 2 304 мс | `p.gpt-greet` | 0,002 |
| 320×568 | RU | **3 100 мс** (первый кандидат 2 204) | `h1.gpt-kicker` | 0,002 |
| 360×612 | UZ | 2 280 мс | `p.gpt-greet` | 0,0018 |
| 360×612 | RU | 2 108 мс | `p.gpt-greet` | 0,0018 |

**Механизм позднего LCP на RU.** H1 и приветствие пререндерены внутри `<div id="gpt-chat-root">`. `src/gpt-chat/main.tsx:44` вызывает `createRoot(el).render(...)`, и React при первом коммите заменяет детей контейнера. Тот же текст рисуется новым узлом, браузер записывает новый LCP-кандидат (2 204 → 3 100 мс). Порог Google для LCP «good» — 2,5 с.

**Вес (dist, сжатие gzip -9 посчитано локально):**

| Ресурс | Сырой | gzip | Где грузится |
|---|---:|---:|---|
| `assets/index-B7Z1XlOc.css` (render-blocking) | 129 234 | 24 772 | на всех 300 страницах |
| `assets/gpt-chat-CNoiPl9O.css` | 34 217 | 7 617 | 2 чата |
| `assets/gpt-chat-DXmrgoYc.js` | 147 559 | 49 888 | 2 чата |
| `assets/vendor-DSTW_80r.js` (modulepreload) | 210 828 | 65 860 | чаты и острова |
| `assets/studio/studio-D67Ss1oZ.js` | 253 585 | 79 499 | студия |
| Инлайн-аналитика: `ga` 10 031 + `ym` 5 587 + `gtm` 1 059 + first-touch 796 | ≈17,5 КБ | — | в HTML каждой страницы (на `/` ещё `meta` 2 140) |
| JSON-LD | 5 852 (`/`) … 16 846 (`/ru/razrabotka-telegram-bota-tashkent/`) | — | |

Картинки сделаны правильно. Пример — герой страницы-гайда по скачиванию: `width/height`, `srcset` 480/800/1200, `fetchpriority="high"`, `loading="eager"`, webp 14,9–50,3 КБ.

## 8. Перелинковка B2C-продуктов: студия презентаций почти изолирована

| Страница | Входящих внутр. ссылок | Глубина от `/` | Откуда ссылки | GSC 28 дн. | Индекс |
|---|---:|---:|---|---|---|
| `/ru/prezentatsiya-ai/` | 2 | 2 | `/ru/gpt-dlya-ucheby/`, `/uz/taqdimot-ai/` | 0 / 4 / поз. 30 | indexed, обход 10-22 |
| `/uz/taqdimot-ai/` | 5 | 2 | 3 UZ-гайда (`chatgpt-talabalar-uchun`, `referat-va-mustaqil-ish`, `slayd-tayyorlash`), RU-студия, `/uz/tariflar/` | 1 / 18 / 6,6 | indexed, обход **10-08** |
| `/uz/tariflar/` | 2 | 3 | только 2 страницы студии | 0 / 4 / 5 | indexed |
| для сравнения: `/ru/gpt-chat/` | 190 | 1 | | 280 / 94 001 | |
| для сравнения: `/uz/gpt-uzbek-tilida/` | 118 | 1 | | 489 / 74 002 | |

Ни один чат, ни главная, ни один RU-блог-пост на студию не ссылаются. Запросы о презентациях за 3 месяца: «презентац» — 0 строк, «taqdimot» — 1 строка (5 показов), «slayd» — 0. По `intent-manifest.json` A5 инструмент владеет ключами «презентация ии», «нейросеть для презентаций», «сделать презентацию нейросетью», «ии для презентаций», а C40 — ключами «slayd ai», «ai slayd», «slayd yaratish», «taqdimot yaratish», «prezentatsiya ai». Объёмы по этим ключам в репозитории не найдены, кредитов на их замер нет → UNVERIFIED.

## 9. Яндекс — второй поисковый источник

GA4, `sessionSourceMedium`, 26.09–23.10:

| Источник | Сессии | Engagement rate |
|---|---:|---:|
| google / organic | 1 251 | 66,1% |
| yandex.uz / referral | 434 | 77,9% |
| yandex.ru / referral | 101 | 62,4% |
| yandex / organic | 15 | 53,3% |
| yandex.com.tr / ya.ru / yandex.kz / yandex.by (referral) | 13 / 9 / 9 / 8 | — |
| **Яндекс, всего** | **589** | |
| bing / organic | 29 | 69,0% |

Канал «Organic Search» = 1 863 сессии. Это примерно google 1 251 + яндекс 589 + bing 29 − мелкие расхождения. Значит, GA4 по умолчанию относит yandex.*/referral к органике. **Доля Яндекса в поиске — 589 / 1 870 ≈ 31,5%** (google + яндекс + bing + duckduckgo 1). GSC эти сессии не видит. Отчёты, которые смотрят только на «google / organic», недосчитывают органику примерно на треть.

Что технически уже есть: `yandex-verification` на `/` (`7e3ef70c4ea28942`), IndexNow через `api.indexnow.org` (`scripts/indexnow-ping.ts`; Яндекс входит в протокол), Метрика 111312750, `sameAs` на Яндекс.Карты. Чего нет: `Clean-param` в robots.txt — а платный трафик (ig/paid 182, fb/paid 22) приходит с utm-метками. Состояние Яндекс.Вебмастера (регион, страницы в поиске, ошибки) из этого окружения не видно → UNVERIFIED.

## 10. robots.txt, llms.txt, `_redirects`, `_headers`

- **robots.txt** собирается из `src/shared/robots-policy.ts` и отдаётся `functions/robots.txt.ts` (live = dist). Все боты разрешены, закрыты только `/admin/`, `/admin-tools/`, `/api/`. Контент чатов пререндерен, так что запрет `/api/` индексации не мешает. Указан один `Sitemap:`; `sitemap-updates.xml` в robots не указан, но GSC его знает (виден в inspection). Ошибок нет.
- **llms.txt** — 34 822 Б, **llms-full.txt** — 18 774 Б: «полная» версия почти вдвое меньше индекса. По llmstxt.org `llms-full.txt` должен быть расширенным корпусом. В llms.txt 133 ссылки на сайт. Без файла в dist только `https://gptbot.uz/ru/`, и она намеренно описана как «permanently redirects (301)» (строка 80) — это не дефект. Сессии из AI-ассистентов в GA4 за 28 дней: chatgpt.com 27 + 3, gemini 3 + 1, copilot 3, perplexity 1 + 1 = 39.
- **`_redirects`** (84 строки) — 301 одним шагом. Черновики отдают 404 через `/404.html` (в Pages 410 нет). SPA-fallback отсутствует, и так задумано. Цепочек внутри файла нет; единственная найденная цепочка — `/?lang=ru` (§3.2).
- **`_headers`** — security-заголовки, HSTS preload, CSP; `X-Robots-Tag: noindex` на `pages.dev` и `/admin/*`. Дефект один: склейка Cache-Control на `/llms.txt`, `/llms-full.txt`, `/*.md` (§3.2).
- **`_routes.json`** — Functions только на `/api/*`, индексах блога, `/admin*`, `/robots.txt`. HTML остальных страниц отдаётся статикой.

## 11. Возможности (по приоритету)

| ID | Что сделать | Файлы / страницы | Данные | Оценка кликов за 28 дн. (метод) | Усилие | Риск | Защищена | Владелец |
|---|---|---|---|---|---|---|---|---|
| L4-01 | Вернуть в индекс `/uz/blog/slayd-tayyorlash/`: (1) GSC → URL Inspection → «Request indexing» (через API нельзя); (2) `npx tsx scripts/indexnow-ping.ts` для этого URL — Bing и Яндекс; (3) через 14 дней повторить inspect; если всё ещё «Crawled – not indexed» — передать в контентную линзу | `/uz/blog/slayd-tayyorlash/` | inspect: Crawled – currently not indexed, обход 2026-10-08; спрос 5 400 + 1 900 + 1 000 в месяц (demand-policy / intent-manifest C29); 14 входящих ссылок, глубина 1, пересечение текста ≤5,1% | **≈1–85.** Нижняя граница — соседние UZ-гайды: 0–1 клик за 28 дн. каждый (insho 1/309, referat 1/100, kurs ishi 1/19, rezyume 0/14). Верхняя — 5 400 × 28/30,4 × 1,70% (CTR B2C-info из baseline при поз. 5,7) | S | low | нет | да (кнопка в GSC) |
| L4-02 | Яндекс: (a) в `buildRobotsTxt()` (`src/shared/robots-policy.ts:69`) добавить межсекционную строку `Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid&fbclid`. Google её игнорирует, отдельная группа `User-agent: Yandex` не нужна. Обновить тест на robots, если он сверяет текст. (b) владелец в Яндекс.Вебмастере: подтверждение, `sitemap.xml` добавлен, «Регион сайта» = Ташкент/Узбекистан, «Страницы в поиске» против 300 в sitemap, ошибки обхода | robots.txt; Яндекс.Вебмастер | GA4: яндекс 589 сессий = 31,5% поисковых, engagement yandex.uz 77,9% | unknown — без данных Вебмастера индекс и позиции в Яндексе не оценить; GSC Яндекс не покрывает | S | low | нет | да (Вебмастер) |
| L4-03 | Закрыть пробел CWV: владелец выпускает бесплатный Google API-ключ (PSI + CrUX), хранит его в env, не в репозитории. Прогон: PSI mobile для `/`, обоих чатов, гайда по скачиванию, `/ru/razrabotka-telegram-bota-tashkent/`, `/uz/blog/chatgptga-qanday-kirish-mumkin/` + CrUX origin. Без ключа — отчёт GSC «Core Web Vitals» вручную. Исправить адрес API в шаблоне брифа на `pagespeedonline` | `l4-data/scripts/psi.py` (готов) | PSI: 404 → 429; мобильные — 77,7% кликов | unknown (без полевых данных) | S | low | нет | да (ключ / GSC UI) |
| L4-04 | LCP чатов: H1 (и приветствие) не должны перерисовываться при монтировании. Вынести `<h1>` из `#gpt-chat-root` в шаблоне чата (`scripts/prerender.ts`, ветка `pageType === 'gpt-chat'`) и не рендерить второй H1 в `AiChatConsole` (сейчас берётся из `data-h1`) — либо перейти на `hydrateRoot` с идентичной разметкой. Проверка: `scripts/chat-layout-check.mjs` (perf), LCP RU 320×568 ≤2,5 с без второго кандидата | `src/gpt-chat/main.tsx:44`, `scripts/prerender.ts:484` (рамка чата), `src/gpt-chat/components/AiChatConsole.tsx:1353,1370` (H1 из `config.h1`) | лаборатория 07.10: RU 2 204 → 3 100 мс, тот же `h1.gpt-kicker` | unknown — делать после L4-03; если поле покажет LCP <2,5 с, приоритет падает | M | medium (чат-UI; контракт h1/bodyText защищённых страниц) | **да** (оба чата) | да — идёт 28-дневное чтение сниппетов, сроки решает владелец |
| L4-05 | Связать студию презентаций с B2C-кластером, сначала только с незащищённых страниц: одна контекстная ссылка в теле, анкоры из ключей A5/C40. RU → `/ru/prezentatsiya-ai/`: `/ru/gpt-vs-chatgpt-sravnenie/` (2 334 показа), `/ru/blog/chat-gpt-online/` (1 966), `/ru/blog/chat-gpt-na-russkom/` (517), `/ru/chto-takoe-gpt-i-kak-polzovatsya/` (391), `/ru/gde-polzovatsya-gpt-besplatno/` (308), `/ru/tarify-ai-chat/` (49; тарифы студии — отдельно). UZ → `/uz/taqdimot-ai/`: `/uz/blog/insho-yozish-suniy-intellekt-bilan/` (309), `/uz/gpt-uzbek-tilida-ai-chat/` (96), `/uz/blog/kurs-ishi-yozish/` (19), `/uz/gpt-chat-qollanma/` (17). `/uz/tariflar/` — из `/uz/gpt-chat-qollanma/`. Ссылки с чатов и главной — позже, отдельной ревизией | `content/pages/**`, `content/blog/**` | студия: 2 и 5 входящих, глубина 2–3; `/uz/taqdimot-ai/` не обходился с 10-08 | unknown — GSC не показывает спроса на сайте (0–5 показов за 3 мес.), объёмы A5/C40 не замерены | S | low | нет (первая волна) | нет |
| L4-06 | Убрать «Unnamed item» и самоссылку на `/uz/`: в `buildBreadcrumbLd(items, name?)` (`scripts/jsonld-helpers.ts:194`) добавить `name` (например, `name: items.at(-1).name`), во всех 4 вызовах передавать заголовок страницы. В `prerender.ts:345` не строить BreadcrumbList, если `fullUrl` — главная своей локали (`/uz/`). Bunzy (`functions/platform/bunzy/render.ts:86`) — по желанию | 299 страниц | GSC: 56 из 56 URL с rich result — PASS + «Unnamed item» | **0** (это подпись в GSC; rich result уже валиден) | S | low | да (JSON-LD 9 защищённых; гейт `seoContract` скрипты не видит) | нет |
| L4-07 | Гигиена: (a) `functions/index.ts` — при `lang=ru` на `/` вести сразу на `https://gptbot.uz/`, а не на `/ru/`; выяснить, какой слой сейчас отдаёт 301 (`/` нет в `_routes.json`); (b) `scripts/generate-robots.ts:287-303` — добавить `! Cache-Control` перед правилами `/llms.txt`, `/llms-full.txt`, `/*.md`; (c) `public/404.html:8`: title «… \| GPTBot» → «… \| GPTBot.uz»; (d) владелец: удалить `sitemap-new.xml` (404) из отчёта Sitemaps в GSC | `functions/index.ts`, `scripts/generate-robots.ts`, `public/404.html`, GSC | §3.2 | 0 | S | low | нет | только (d) |
| L4-08 | Сделать `llms-full.txt` надмножеством `llms.txt`: добавить тела 28 `index.html.md` (ключевые B2C/B2B) в `scripts/generate-llm-markdown.ts`. Факты те же, без заявлений про «официальный ChatGPT» | `llms-full.txt` | 18 774 Б против 34 822 Б; AI-ассистенты — 39 сессий за 28 дн. | unknown | M | low | нет | нет |
| L4-09 | Облегчить HTML (только после L4-03 и только если поле покажет проблему LCP/INP): вынести четыре инлайн-загрузчика аналитики (≈17,5 КБ на страницу) в один хешированный файл из `/assets` с кэшем на год; на `/ru/razrabotka-telegram-bota-tashkent/` (210 КБ) грузить lead-form (12 325 Б) и lead-demo (4 547 Б) отложенно | `scripts/analytics-snippet.ts`, `analytics-metrika.ts`, `lead-form.ts`, `lead-demo.ts` | §7 | unknown | M | medium (затронет измерения: порядок и задержка загрузчиков) | да (инлайн есть и на защищённых) | нет |
| L4-10 | Hreflang по интентам: решить, оставлять ли пары `/uz/sayt-uchun-ai-bot/` ↔ `/ru/ai-bot-dlya-sayta/` и `/uz/telegram-bot-biznes-uchun/` ↔ `/ru/telegram-bot-dlya-biznesa/`. Технически они исправны; manifest запрещает перестановку без решения | 4 URL + `intent-manifest.json` | §6 | unknown (B2B: 0–2 клика на URL) | S | medium | нет | да |

## 12. Проверено и чисто (действий не нужно)

Битые внутренние ссылки, ссылки на редиректы, www/http в ссылках, дубли title/description, noindex в sitemap, canonical, единственность H1, `lang`, невзаимный hreflang, x-default, невалидный JSON-LD, отсутствующие поля Article, картинки без alt (контентные), отсутствующие ассеты, картинки из sitemap, честность `lastmod` (нет подмены датой сборки — `scripts/content-dates.ts`), http→https и www→non-www одним шагом, 404 для неизвестных путей, noindex на `pages.dev`, совпадение live с dist.

**Замечание без действия.** Правка сниппетов `d54d5b61` поменяла title/description обоих чатов, но не `updatedAt`, поэтому `lastmod` RU-чата остался 2026-10-08. Google обходит чаты раз в 1–3 дня (RU — 10-21, UZ — 10-23), так что новый сниппет подхватится и без этого. Для других страниц правило такое: если правка только в head, нужно поднимать `updatedAt`, иначе `lastmod` перестаёт отражать значимую правку.

## 13. Ограничения (UNVERIFIED)

- Полевые CWV / CrUX: не измерены (§7).
- Индекс, регион и позиции в Яндексе: Вебмастер недоступен (§9).
- Какой слой отдаёт 301 на `/?lang=ru`: `_routes.json` не включает `/`, Cloudflare Redirect Rules не видны.
- Объёмы ключей студии A5/C40: в репозитории нет, кредиты 0.
- Реальная причина «not indexed» у slayd по версии Google не раскрывается; гипотеза «один ранний обход» строится только на датах.
