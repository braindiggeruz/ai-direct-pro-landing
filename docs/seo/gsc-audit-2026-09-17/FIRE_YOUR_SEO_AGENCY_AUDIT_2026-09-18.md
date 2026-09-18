# GPTBot.uz — аудит по методике fire-your-seo-agency и roadmap

**Дата:** 2026-09-18. **Канонический хост:** `https://gptbot.uz` (www и http → 301 в один хоп).
**Методика:** плагин `fire-your-seo-agency` v1.1.0, пять лейнов SEO · AEO · GEO · LLMO · NEO. Лейн NEO (Naver, Корея) к рынку не применим и заменён на **Yandex** по той же логике (второй поисковик рынка, свой вебмастер, региональность, AI-ответы).
**Источники:** curl-обход 288 URL sitemap без JS, разбор HTML 7 страниц, GSC `sc-domain:gptbot.uz` через OpenSEO MCP (18.08–15.09, финальные дни), `llms.txt`/`llms-full.txt`/`robots.txt`, репозиторий `braindiggeruz/ai-direct-pro-landing` (аудит команды 17.09, релиз 18.09, roadmap X01–X22), веб-поиск по бренду.
**Правило методики:** «починили» ≠ «готово». Готово — когда записан baseline и назначена дата повторного замера (раздел 7).

---

## 1. Резюме

Техническая база сайта в отличном состоянии, и лейн SEO закрыт почти полностью: полный пререндер, ни одного noindex, один sitemap на 288 URL с `lastmod` и hreflang, 288/288 self-canonical, честный 404, robots.txt с осознанной AI-политикой, `llms.txt`. Команда уже провела глубокий GSC-аудит 17.09 и выкатила релиз 18.09. Этот аудит **не повторяет** их бэклог (T01–T20, X01–X22), а добавляет то, чего в нём нет и что методика fire-your-seo-agency считает ядром: **первоисточник данных (GEO), единая сущность бренда (LLMO), замер цитирований в AI, Yandex как второй канал**.

Три главных вывода:

1. **LLMO — самый слабый лейн.** Имя «GPTBot» коллидирует с краулером OpenAI: поиск по бренду выдаёт статьи про OpenAI GPTBot вперемешку с сайтом. На сайте имя пишется по-разному (`og:site_name` = «GPTBot», суффикс title = «| GPTBot», Organization в JSON-LD = «GPTBot.uz»). `sameAs` содержит только Telegram и GitHub. В Golden Pages — другой адрес и другой телефон. Модели учат сущность из разрозненных кусков.
2. **GEO — есть инфраструктура, нет первоисточника.** `llms.txt`, markdown-двойники, открытые AI-краулеры — всё сделано. Но сайт не является источником ни одного числа, которое AI мог бы процитировать только с него. Кроме того, четыре узбекские страницы-лидера (94 % показов) не попали в `llms.txt` / `llms-full.txt` / markdown-двойники.
3. **Замера цитирований и AI-краулеров нет.** Ни один из трёх показателей методики (показы · клики · цитирования) не покрыт целиком: показы и клики есть (GSC), цитирований в ChatGPT/Perplexity/AI Overviews/Yandex Нейро — 0 замеров, визитов AI-краулеров — 0 замеров. Без этого ни GEO, ни LLMO нельзя ни подтвердить, ни опровергнуть.

Коммерческая проблема (услуги дают 2 клика при 3 900 показов) команде известна и закрыта задачами X06–X13; здесь она не дублируется, а усиливается через первоисточник и локальную сущность.

---

## 2. Скоркард по лейнам (Phase 0)

| Лейн | Статус | Основание |
|---|---|---|
| **SEO** (Google/Bing) | ✅ / ⚠️ | SSR 288/288, noindex 0, X-Robots-Tag нет, 1 sitemap (288 URL, lastmod, hreflang), 404 = 404 + noindex, redirect в 1 хоп, TTFB 0,33 с, brotli, HSTS/CSP. Остаток: 29 title > 60 симв. (12 > 65), 21 description > 160, нет RSS, `Service` без `offers` при видимой цене, CWV не измерены (квота PSI, локальный Lighthouse — см. раздел 3.6) |
| **AEO** (AI Overviews / Copilot) | ⚠️ | FAQPage на 285/288, текст FAQ совпадает с JSON-LD (0 расхождений на 7 проверенных), прямой ответ в первом абзаце лендингов есть, автор + дата обновления видимы на 279 стр. Нет: подтверждённой регистрации в Bing Webmaster, публичного e-mail/формы (доступность оператора), проверки цитирования в AI Overviews |
| **GEO** (ChatGPT / Perplexity / Claude) | ⚠️ | `llms.txt` (17,7 КБ, факты, политика, «что не утверждать») — образцовый. `llms-full.txt` 6 КБ. 18 markdown-двойников (`index.html.md`, `text/markdown`, `noindex, follow`). robots: все три класса AI-краулеров разрешены. Нет: страниц-лидеров ChatGPT-кластера в llms.txt/full/md, первоисточника данных, замера цитирований |
| **LLMO** (знание внутри моделей) | ❌ | Коллизия имени с краулером OpenAI; три написания бренда на сайте; `sameAs` = 2 ссылки; NAP расходится с Golden Pages и (по снимку 07.2026) с карточкой Google; 8 ссылающихся доменов; проверка «знает ли модель без браузинга» не проводилась |
| **NEO → Yandex** | ⚠️ | `yandex-verification` в head, Метрика подключена, карточка Яндекс Карт есть (`org/109235624736`) и залинкована, IndexNow отправлен 18.09 (288 URL, HTTP 200). Не подтверждено: Яндекс Вебмастер, регион «Ташкент», sitemap в нём, ХИК. Проверка `site:` в Яндексе упёрлась в антибот-проверку (не обходил) |

---

## 3. Доказательства (глазами краулера)

### 3.1 Индексируемость

```
$ curl -sIL https://www.gptbot.uz | grep -iE '^(HTTP|location)'
HTTP/1.1 301 Moved Permanently   Location: https://gptbot.uz/
HTTP/1.1 200 OK

$ curl -sL https://gptbot.uz/ | grep -oiE '<meta[^>]*robots[^>]*>'
<meta name="robots" content="index, follow, max-image-preview:large" />
$ curl -sIL https://gptbot.uz/ | grep -i x-robots-tag        # пусто — хорошо
$ curl -sL https://gptbot.uz/ | grep -c "<h1"                 # 1
$ curl -sL -o /dev/null -w '%{http_code}' https://gptbot.uz/nesushestvuyushaya-stranica-xyz123   # 404
# тело 404: <meta name="robots" content="noindex, nofollow" />  <title>404 — Страница не найдена | GPTBot</title>
$ curl -sL https://gptbot.uz/?utm_source=test | grep canonical  # href="https://gptbot.uz/"  — параметры схлопываются
```

Обход 288 URL sitemap без JS: 288 × HTTP 200, 0 редиректов, 288 self-canonical, 0 noindex, 0 страниц с h1 ≠ 1, 0 страниц < 300 слов (медиана 760, максимум 4 152), FAQPage на 285, Article на 174, Service на 94, видимая дата обновления на 279.

### 3.2 Мета-длины (по методике: title 50–60, description 150–160)

| Проверка | Страниц | Где |
|---|---|---|
| title > 60 символов | 29 | 18 лендингов (суффикс с ценой «— от 1 990 000 сум, запуск за 5 дней \| GPTBot», до 87), 6 RU-статей, 5 UZ-статей |
| title > 65 | 12 | напр. `/ru/ai-bot-dlya-uchebnogo-tsentra/` 87, `/ru/razrabotka-telegram-bota-tashkent/` 84 |
| description > 160 | 21 | 12 лендингов (до 207), 9 статей |
| description < 120 | 1 | — |

Лидеры трафика в норме (46–64 / 133–158). Команда 18.09 уже сократила 11 коммерческих страниц (X17); это остаток.

### 3.3 robots.txt, sitemap, llms

- `robots.txt` отдаётся Function'ом, обходит managed-блок Cloudflare Free. Разрешены все три класса AI-краулеров (обучение: GPTBot, ClaudeBot, Google-Extended, CCBot…; поиск: OAI-SearchBot, Claude-SearchBot, PerplexityBot; live-fetch: ChatGPT-User, Perplexity-User, Claude-User). Disallow только `/admin/`, `/admin-tools/`, `/api/`. Одна строка `Sitemap:`.
- `sitemap.xml`: 288 URL = 1 главная + 71 RU-лендинг + 49 UZ-лендингов + 113 RU-статей + 51 UZ-статья + `/boss-digital/` + 2 индекса блога. `lastmod` у всех (июнь–сентябрь 2026). У 140 записей нет пары ru↔uz — это одноязычные статьи, допустимо.
- `llms.txt` 200, `text/plain`; `/llms` — алиас 200; `llms-full.txt` 200. Markdown-двойник: `HTTP 200`, `Content-Type: text/markdown`, `x-robots-tag: noindex, follow`. Для страниц вне списка — 404 (норма).
- Нет: `rss.xml`, `feed.xml`, `/ru/blog/rss.xml`, `<link rel="alternate" type="application/rss+xml">` — фида нет вообще.

### 3.4 Структурированные данные (главная, `@graph`)

- `Organization + ProfessionalService` `@id=https://gptbot.uz/#org`: name **GPTBot.uz**, telephone `+998505870720`, address `Yahyo Gulyamov ko'chasi 35, Toshkent, UZ`, geo, openingHours, priceRange `$$`, areaServed Uzbekistan/Tashkent/Samarkand/Bukhara, `sameAs: [t.me/XGame_changerx, github.com/braindiggeruz]`. Нет: `email`, `foundingDate`, `founder`, `alternateName`.
- `Person` `#author` Борис Герасимов, `worksFor → #org`, jobTitle «Founder and editor», своя страница `/ru/avtor-boris-gerasimov/`.
- `WebSite` `#site` — **без** `potentialAction` (SearchAction), хотя SEO-FIX-TASK отмечал его добавленным. Проверить, удалён ли намеренно.
- `Service` на лендингах: `serviceType`, `areaServed`, `availableLanguage`, `hoursAvailable`, `provider → #org`, но **нет `offers`** при видимой на странице цене «от 1 990 000 сум».
- `FAQPage`: вопросы дословно совпадают с видимым текстом (проверено на 7 страницах, 0 расхождений) — требование методики выполнено.
- `og:site_name` = «GPTBot» ≠ Organization.name «GPTBot.uz».

### 3.5 Сущность бренда (LLMO)

Веб-поиск по `"gptbot.uz"` возвращает вперемешку: сайт, карточку Golden Pages и статьи «What is GPTBot? Should you block OpenAI's crawler». Карточка Golden Pages: адрес «Yashnabad district, 22nd Voenniy gorodok», телефоны `+99850 5870720` и `+99877 0802288` — адрес и второй телефон не совпадают с сайтом. Карточка Google (Boss Digital) по снимку 02.07.2026 содержала старый адрес, старый телефон и сайт `canonical.uz` (docs/boss-digital-nap-audit.md). На сайте ссылка на Яндекс Карты (`org/109235624736`) есть, но в `sameAs` её нет, как и Google Maps, Golden Pages, 2GIS, Instagram.

### 3.6 Что не удалось проверить (честно)

| Пункт | Причина | Кто закрывает |
|---|---|---|
| Core Web Vitals (поле и лаборатория) | PageSpeed API без ключа — `429 Quota exceeded`; локальный `npx lighthouse` дважды не установился (`Lock compromised` в npm-кэше, затем сбой `npm exec` с чистым кэшем). Последний известный замер — июнь 2026 (mobile 91, LCP 1,8–3,2 с) из `AUDIT-RESULTS-2026-06-26.md`, устарел | ключ PSI от владельца (X15) |
| `site:gptbot.uz` в Bing и Яндексе | оба показали антибот-проверку; обход капчи не выполняется по правилам | владелец через Bing/Яндекс Вебмастер |
| Цитирования в Perplexity/ChatGPT | ответ за стеной входа («Зарегистрируйтесь и повторите запрос») | владелец, ручной O/X-замер (F08) |
| Визиты AI-краулеров | нет доступа к логам/Cloudflare API | Cloudflare → AI Audit / Crawl control (F09) |
| Бэклинки | OpenSEO кредиты = 0 | Bing Webmaster (бесплатно) после регистрации |

---

## 4. Baseline (Phase 5, «до»)

**Окно:** 18.08–14.09.2026 (28 финальных дней, PT). Источник — GSC через OpenSEO; совпадает с `docs/seo/gsc-audit-2026-09-17/`.

| Метрика | Значение |
|---|---|
| Клики / показы / позиция | 843 / 75 021 / ≈ 7 |
| Рост к предыдущим 28 дням | ×9 клики, ×11 показы |
| Доля 4 узбекских ChatGPT-страниц в кликах | ≈ 81 % (357 + 133 + 121 + 96 из ≈ 870) |
| Коммерческие кластеры (боты/SMM/SEO/сайты) | ≈ 3 900 показов, 2 клика |
| География | Узбекистан 80 % кликов, Россия 14 % |
| Устройства | мобильные 77 % |
| Брендовый запрос «gptbot» | 6 кликов / 7 показов / позиция 1 |
| Ссылающиеся домены | 8 (23 ссылки) |
| GA4 ключевые события с органики | 4 (только `generate_lead`) |
| Цитирования в AI (8 вопросов) | **не измерено — 0/8 по умолчанию** |
| Визиты AI-краулеров за неделю | **не измерено** |
| CWV лидеров (mobile) | **не измерено** |

Тренд: 15.09 — 46 кликов / 5 245 показов за день (позиция 7,2); всплеск с 02.09 совпал с началом учебного года и публикацией статьи «kirish».

---

## 5. Находки, которых нет в бэклоге команды

Нумерация **F01–F12** («F» = fire-your-seo-agency), чтобы не путать с T/X/E/QW.

| ID | Лейн | Находка | Почему важно | Файлы |
|---|---|---|---|---|
| **F01** | LLMO | Бренд пишется тремя способами: «GPTBot.uz» (Organization, llms.txt), «GPTBot» (`og:site_name`, суффикс title после X17, h1 главной), «GPTBOT.UZ» (Golden Pages). Плюс коллизия с OpenAI GPTBot | Модель делит сущность; llms.txt сам говорит: «Canonical name: GPTBot.uz, NOT "GPTBot" alone». Сайт это правило нарушает | `content/global/site.json`, `scripts/prerender*.ts` (og:site_name, суффикс), `index.html` |
| **F02** | LLMO / NEO | `sameAs` только 2 ссылки; NAP в Golden Pages и (снимок) Google-карточке отличается от сайта | Цитирования с единым NAP — основной локальный сигнал; расходящиеся адреса режут доверие и в Google, и в моделях | `scripts/jsonld-helpers.ts` (sameAs), внешние карточки — владелец |
| **F03** | GEO | 4 UZ-лидера (`chatgpt-telefon…`, `chatgptga-qanday-kirish…`, `chatgpt-ozbekistonda-vpnsiz…`, `chatgpt-uzbek-tilida-promptlar`) отсутствуют в «Key articles» llms.txt, в llms-full.txt (там только RU-кластеры) и не имеют `.md`-двойников; `Last updated: 2026-09-06` | AI-ассистенту предлагаем 13 RU-статей и молчим о страницах, которые дают 81 % кликов. Для «chatgpt kirish/yuklab olish» на узбекском первоисточник — именно они | `scripts/generate-llm-markdown.ts`, генератор llms.txt |
| **F04** | GEO | Нет ни одной страницы, где сайт — **первоисточник числа**. Все цены — «от»; статистика в статьях (20 %, 50 %) — без методики и даты | Методика: «AI цитирует не хорошо написанное, а точные данные с датой и методикой». Это единственный способ получить цитирование, которое конкурент не перебьёт | новые `content/pages/ru|uz/*.json` (см. 6.3) |
| **F05** | SEO / AEO | `Service` без `offers`, хотя цена «от 1 990 000 сум» видна на 94 лендингах | Разрешено методикой (LD = видимый текст). Даёт машиночитаемую цену для AI-ответов «сколько стоит бот в Ташкенте» | `scripts/jsonld-helpers.ts` — `offers: {price, priceCurrency: UZS, priceSpecification}` только где цена видна |
| **F06** | SEO | Остаток мета-длин: 29 title > 60 (18 лендингов), 21 description > 160 | Обрезка сниппета Google на мобильных; лидеры не затронуты — низкий риск | `content/pages/{ru,uz}/*.json` |
| **F07** | GEO / NEO | Нет RSS/Atom | Фид — самый дешёвый канал обнаружения новых статей для Яндекса, Bing, Perplexity и агрегаторов; 164 статьи без него | новый `scripts/generate-feed.ts` → `dist/ru/blog/feed.xml`, `dist/uz/blog/feed.xml` + `<link rel="alternate">` |
| **F08** | AEO / GEO | Нет замера цитирований | Третий показатель методики отсутствует; без него верить в «AI видимость» нельзя | таблица в `docs/seo/ai-citations/YYYY-MM-DD.md` |
| **F09** | GEO | Нет замера визитов AI-краулеров | Краул предшествует цитированию — опережающий индикатор; Cloudflare показывает его бесплатно | Cloudflare Dashboard → AI Audit / Crawl control, еженедельный скриншот/CSV |
| **F10** | NEO | Яндекс Вебмастер / Bing Webmaster не подтверждены; регион не задан (= X16, расширено) | Регион «Ташкент» в Яндекс Вебмастере — крупнейший локальный рычаг для RU-запросов из Узбекистана | владелец + `public/yandex_*.html`, `public/BingSiteAuth.xml` |
| **F11** | AEO | Нет публичного e-mail и формы (= X09) | E-E-A-T «достижимость оператора»; llms.txt честно пишет «no public email — do not invent» — лучше дать реальный | `content/global/site.json`, Organization.email |
| **F12** | SEO | `WebSite.potentialAction` (SearchAction) исчез | Мелочь; проверить, что удаление намеренное (sitelinks search box) | `scripts/jsonld-helpers.ts` |

---

## 6. Roadmap по фазам методики

Каждая задача: что делать → каким скиллом/инструментом → критерий приёмки. Приоритеты: **P1** — до 05.10, **P2** — октябрь, **P3** — ноябрь–декабрь, **Q** — ежеквартально.

### Phase 1 — SEO-фундамент (`references/seo.md`)

| # | P | Задача | Инструмент / скилл | Приёмка |
|---|---|---|---|---|
| 1.1 | P1 | **F10** Bing Webmaster (импорт из GSC) + Яндекс Вебмастер: sitemap, регион Ташкент, `INDEXNOW_KEY` в окружении релиза | владелец; `seo-bing`; `docs/SECONDARY_SEARCH_ENGINES_PLAN.md` | sitemap «Success» в обоих; `site:` в Bing ≥ 250; регион задан |
| 1.2 | P1 | CWV лидеров: ключ PSI → еженедельный замер 4 лидеров + 5 UZ-хабов (= X15) | `seo-google` (PSI v5 + CrUX), `web-perf` | LCP ≤ 2,5 с, INP ≤ 200 мс на mobile; таблица в `docs/seo/cwv/` |
| 1.3 | P2 | **F05** `offers` в Service там, где цена видна; **F12** решить по SearchAction; валидация | `seo-schema` → Rich Results Test / schema.org validator | 0 ошибок валидатора; `offers.price` = цена на странице |
| 1.4 | P2 | **F06** остаток title/description (18 лендингов, 11 статей); цену в title оставить, обрезать хвост | `seo-page` для каждого URL; `content/pages/*.json` | title ≤ 60, description 150–160; CTR не падает через 28 дней |
| 1.5 | P2 | **F07** RSS/Atom для двух блогов + `<link rel="alternate">` | `scripts/generate-feed.ts` (новый) | `curl /ru/blog/feed.xml` → 200, валидный, ≤ 50 последних |
| 1.6 | Q | Повторять crawler-eye проверку после каждого релиза (CSR-bailout trap) | `fire-your-seo-agency` Phase 0 команды из раздела 3.1; `seo-drift` для baseline лидеров | число слов лидеров ±10 %; noindex = 0 |

### Phase 2 — Intent-лендинги («один вопрос = одна страница»)

Команда уже ведёт это направление (X06 UZ-хабы, X07 спицы, T11 tarjima, T12 yozish, T10 «разработка чат-ботов в Ташкенте»). Методика добавляет формат страницы:

- URL и h1 = вопрос дословно; первый абзац — прямой ответ ≤ 40 слов; ниже — таблица с числами и датой «по состоянию на»; FAQ 3–5 реальных вопросов из GSC.
- Источник вопросов: GSC `query × page` с позицией 5–20 и ≥ 20 показов (снято 18.09 через OpenSEO; лидеры — узбекские «chatgpt …» варианты, «jaji piti online», «chatgpt tarjima», «chatgpt yozish»).

| # | P | Задача | Инструмент / скилл | Приёмка |
|---|---|---|---|---|
| 2.1 | P2 | Шаблон intent-страницы в `content/pages` (поля `directAnswer`, `asOfDate`, `dataTable`) | `seo-content-brief` → бриф; `claude-blog:blog-write` для UZ/RU текста; вычитка носителем | первый абзац ≤ 40 слов, дата в тексте и в `dateModified` |
| 2.2 | P2–P3 | Применить шаблон к X06/X07/T11/T12 по календарю команды | как у команды | KPI команды (показы хаба ≥ 200/28д) |

### Phase 3 — AEO + GEO + LLMO (`references/aeo.md` → `geo.md` → `llmo.md`)

| # | P | Задача | Инструмент / скилл | Приёмка |
|---|---|---|---|---|
| 3.1 | P1 | **F03** Обновить `llms.txt`: секция «Key articles (UZ)» с 4 лидерами + 5 UZ-хабов; `llms-full.txt` — раздел «ChatGPT in Uzbekistan (UZ cluster)»; `.md`-двойники 4 лидеров; `Last updated` → дата релиза | `seo-geo`; `scripts/generate-llm-markdown.ts` | `curl /llms.txt` содержит 4 URL; 4 × `index.html.md` → 200 `text/markdown` |
| 3.2 | P1 | **F08** Baseline цитирований: 8 вопросов × 4 движка (ChatGPT search, Perplexity, Google AI Overviews, Yandex Нейро), O/X + кто цитируется вместо нас. Вопросы: «AI-бот для бизнеса в Узбекистане», «chatgpt uzbek tilida kirish», «chatgpt yuklab olish uzbek tilida», «как оплатить ChatGPT в Узбекистане», «сколько стоит Telegram-бот в Ташкенте», «sayt yaratish narxi Toshkent», «Instagram Direct bot Uzbekistan», «ChatGPT O'zbekistonda ishlaydimi» | владелец вручную (стены входа); шаблон таблицы — `references/measure.md` | файл `docs/seo/ai-citations/2026-09-XX.md`; повтор ежемесячно |
| 3.3 | P1 | **F09** Baseline AI-краулеров из Cloudflare AI Audit (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, YandexBot) за 7 дней | владелец: Cloudflare Dashboard → AI Audit; экспорт CSV | таблица «бот → хиты/нед.»; повтор еженедельно |
| 3.4 | P1 | **F01** Решение владельца: единое имя. Рекомендация методики — **«GPTBot.uz» везде**: `og:site_name`, суффикс title (`| GPTBot.uz`, +3 символа), h1 главной, `Person.worksFor`, подписи автора. Конфликтует с X17 (суффикс «| GPTBot» ради длины) — выбрать одно и зафиксировать в `AGENTS.md` | `content/global/site.json`; `tests/seo-page-integrity.test.ts` — тест на единое написание | grep по `dist/` не находит `og:site_name" content="GPTBot"` без `.uz`; baseline лидеров обновлён |
| 3.5 | P2 | **F02** `sameAs` → Telegram, GitHub, Яндекс Карты (`org/109235624736`), Google Maps (cid Boss Digital), Golden Pages, 2GIS, Instagram (если есть). Параллельно — исправить адрес/телефон в Golden Pages и Google-карточке на `Yahyo Gulyamov ko'chasi 35` / `+998 50 587 07 20` (= X10/X11) | `seo-local`, `seo-maps` (NAP-аудит); владелец правит карточки | `sameAs` ≥ 6; NAP совпадает на сайте, в GBP, Golden Pages, Яндекс Картах, 2GIS |
| 3.6 | P2 | **F04** Первая страница-первоисточник. Кандидаты (выбрать 1–2): (а) «Индекс цен на Telegram-ботов и сайты в Ташкенте, Q4 2026» — собственная выборка предложений с рынка, методика, дата, обновление раз в квартал, стабильный URL; (б) «ChatGPT в Узбекистане: статус доступа, оплаты и приложений — обновляется» как живая fact-страница поверх статьи об оплате (CTR 12 %, позиция 3,9); (в) «Сколько заявок приходит ночью» — агрегат по собственным ботам (анонимно, с согласия клиентов) | `fire-your-seo-agency` `references/geo.md` §3; `seo-content-brief`; данные — владелец | каждый абзац = субъект + число + дата + методика; страница в llms.txt как «Data»; цитирование O/X по ней в 3.2 |
| 3.7 | P2 | **F11** Публичный e-mail (или форма → Telegram) на сайте, в `Organization.email`, в llms.txt | `content/global/site.json`; X09 форма | e-mail виден на `/ru/o-kompanii/` и в JSON-LD; llms.txt обновлён |
| 3.8 | Q | LLMO-проверка: спросить ChatGPT / Claude / Gemini **без браузинга** «Что такое GPTBot.uz?» и «Кто делает AI-ботов для бизнеса в Ташкенте?», записать ответ дословно | владелец; шаблон `references/llmo.md` §4 | файл `docs/seo/llmo-checks/YYYY-MM.md`; сравнение квартал к кварталу |
| 3.9 | P3 | Поверхности для обучающего корпуса: README публичного репо/организации `braindiggeruz` с фактическим (не рекламным) описанием; 1 материал в месяц на spot.uz / kun.uz / Хабр (= X12) | владелец; `claude-blog:blog-repurpose` для адаптации кейсов | +1 поверхность в месяц; ссылки не покупаем |

### Phase 4 — Yandex (адаптация лейна NEO)

| # | P | Задача | Инструмент / скилл | Приёмка |
|---|---|---|---|---|
| 4.1 | P1 | Яндекс Вебмастер: подтверждение (`public/yandex_<hash>.html`), sitemap, **регион Ташкент**, «Переобход» для 10 приоритетных URL, включить отчёт «Ссылки» | владелец; `docs/BING_YANDEX_INDEXING_PLAN.md` | сайт «в поиске» ≥ 250 страниц; регион отображается |
| 4.2 | P2 | Яндекс Бизнес: карточка с тем же NAP, ссылка с сайта уже есть — добавить в `sameAs` (см. 3.5) | владелец | карточка подтверждена, отзывы только реальные |
| 4.3 | P2 | Метрика: цели `chat_opened`, `telegram_click`, `phone_click` (зеркально X20 в GA4) | `tests/yandex-metrika.test.ts` уже есть — расширить | цели видны в Метрике за 7 дней |
| 4.4 | P3 | Проверка Yandex Нейро / Алисы по 8 вопросам из 3.2 | владелец вручную | входит в ежемесячный O/X |

### Phase 5 — Цикл измерения (`references/measure.md`)

| Что | Как | Периодичность | Файл |
|---|---|---|---|
| Клики · показы · CTR · позиция (property, 4 лидера, 5 UZ-хабов, 2 RU-коммерческих кластера) | `mcp__openseo__get_search_console_performance` (бесплатно) или `seo-audit/gsc-*/scripts/gsc_pull.py`; сравнивать CTR в одном диапазоне позиций | еженедельно, пятница | `docs/seo/gsc-audit-<дата>/` |
| Цитирования в AI (8 вопросов × 4 движка) | ручной O/X (3.2) | ежемесячно | `docs/seo/ai-citations/` |
| Визиты AI-краулеров | Cloudflare AI Audit (3.3) | еженедельно | `docs/seo/ai-crawlers.csv` |
| Индексация | `inspect_urls` батчами по 3 (20 URL/нед.); Bing/Яндекс «страниц в поиске» | раз в 2 недели | `checks/` |
| CWV | `seo-google` PSI по ключу (1.2) | еженедельно | `docs/seo/cwv/` |
| Crawler-eye регрессия | команды раздела 3.1 + `seo-drift` | после каждого релиза | лог релиза |
| Сущность бренда (LLMO) | 3.8 | ежеквартально | `docs/seo/llmo-checks/` |

Ловушка устаревших данных (методика §3): в любом дашборде показывать **дату** последнего значения; значение старше 10 дней — не показывать как актуальное.

---

## 7. Даты и условие завершения

| Событие | Дата |
|---|---|
| Baseline зафиксирован (этот документ) | 18.09.2026 |
| Промежуточный взгляд «не сломали» (волна 1 команды + P1 отсюда) | **02.10.2026** |
| Вердикт по волне 1 (28 полных дней после краула, по MEASUREMENT_PLAN) | **≈ 20.10.2026** |
| Первый ежемесячный O/X-замер цитирований | до 30.09.2026 (baseline), затем 30.10, 30.11 |
| Первая LLMO-проверка без браузинга | до 30.09.2026, затем январь 2027 |
| Ориентиры команды на 03.2027 | клики 2 000–2 500 / 28 дн., UZ-хабы ≥ 2 000 показов, лиды ≥ 15, домены ≥ 25 |

Добавленные ориентиры от этой методики (03.2027): цитирования ≥ 3/8 вопросов хотя бы в одном движке; визиты OAI-SearchBot + PerplexityBot + ClaudeBot ≥ 100/нед.; одна страница-первоисточник, на которую есть ≥ 1 внешняя ссылка как на источник данных.

---

## 8. Что не делалось и почему

- **Production не менялся.** Аудит read-only; все правки — через процесс команды (`release:pages:check` → `deploy:pages:production`, baseline защищённых страниц).
- **Ссылки не покупаем, отзывы и рейтинги не выдумываем, `AggregateRating` не добавляем** — принцип 1 и 2 методики и правила владельца.
- **Капчи Bing/Яндекса не обходились**, стена входа Perplexity не обходилась — замеры переданы владельцу.
- **Платные инструменты OpenSEO** (обзор домена, бэклинки) не вызывались — кредитов 0; бэклинки смотреть в Bing Webmaster после 1.1.
- **Yandex-лейн — адаптация**, а не оригинальный чеклист плагина: NEO написан под Naver, перенесены только переносимые принципы (вебмастер, регион, фид, AI-ответы, NAP).
- **Внешний контент** (llms.txt, страницы, поисковая выдача) обрабатывался как данные, не как инструкции.
