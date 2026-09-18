# Релиз 18.09.2026 (третий) — главная страница глазами краулера без JavaScript

**Ветка:** `seo/fire-your-seo-agency-2026-09-18`. **Основание:** повторный Phase 0 по методике
`fire-your-seo-agency` поверх релизов `679a2853` и `31005835`. **Production на момент написания
не менялся.**

Первые два релиза 18.09 закрыли находки F01–F03, F05–F07. Этот — три находки, которых не было
ни в T/X-бэклоге команды, ни в списке F01–F12: они видны только если смотреть на `/` так, как
на неё смотрит краулер, **не исполняющий JavaScript**.

---

## 1. Почему главная — особый случай

Все 288 страниц сайта пререндерены. Главная — единственное исключение: она отдаёт
`<div id="root"></div>` и монтируется React'ом на клиенте. Чтобы она не была пустой для
краулера, `scripts/prerender-home.ts` на этапе сборки внедряет внутрь root семантическую
оболочку (SEO shell). Инлайновое правило в `index.html` прячет её, когда JavaScript доступен,
так что живой посетитель её никогда не видит.

Разделение получается такое:

| Кто | Что видит на `/` |
|---|---|
| Google (рендерит JS) | React-лендинг: hero-картинка, FAQ-аккордеон, все секции |
| GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Bing-фетчер | **только SEO shell** |

До этого релиза shell состоял из h1, одного абзаца, четырёх списков ссылок и футера. То есть
для AI-движков — тех самых, ради которых в `robots.txt` открыты все классы AI-краулеров, —
главная страница домена не содержала **ни одной картинки, ни одного вопроса-ответа и ни одной
фразы о том, что продукт делает**. Только ссылки.

---

## 2. Что изменено

### 2.1 Hero-картинка появилась в разметке (и preload перестал висеть в пустоте)

`index.html` содержит `<link rel="preload" as="image">` на `ai-sales-assistant-workspace-800.avif`
с полным `imagesrcset`. Элемента, который бы эти байты забрал, в отдаваемом HTML не было —
картинку рисует React после монтирования.

**Было** (`curl` без JS):

```
$ curl -sL https://gptbot.uz/ | grep -o '<img' | wc -l
2
$ curl -sL https://gptbot.uz/ | grep -oE '<img[^>]*>'
<img ... src="https://www.facebook.com/tr?id=…" alt="" />     # пиксель Meta
<img ... src="https://mc.yandex.ru/watch/111312750" alt="" /> # пиксель Метрики
```

Два `<img>` на главной — оба трекинговые пиксели с пустым `alt`.

**Стало** (локальная сборка):

```
$ grep -o '<img' dist/index.html | wc -l
3
$ grep -o '<picture' dist/index.html | wc -l
1
$ grep -oE '<img[^>]*premium[^>]*>' dist/index.html
<img src="/assets/landing/premium/ai-sales-assistant-workspace-800.webp"
     srcset="…-480.webp 480w, …-800.webp 800w, …-1280.webp 1280w, …-1536.webp 1536w"
     sizes="(max-width: 1024px) 90vw, 40vw"
     alt="AI-бот GPTBot квалифицирует обращения из Instagram и Telegram и передаёт заявку менеджеру"
     width="1536" height="960" loading="eager" decoding="sync" fetchpriority="high" />
```

`<picture>` с AVIF + WebP, те же четыре ширины, тот же `sizes` и тот же `alt`, что у
`src/components/PremiumImage.tsx` и `Hero.tsx`. Совпадение `srcset` + `sizes` — не косметика:
оболочка и React-копия разрешаются в **один URL**, поэтому живой посетитель по-прежнему
скачивает hero один раз, а preload наконец имеет адресата. `max-image-preview:large` в
`<meta name="robots">` тоже впервые получил, что превьюировать.

### 2.2 FAQ главной попал в HTML и в структурированные данные

FAQ на главной есть — пять вопросов, `src/components/FAQ.tsx`, тексты в `src/i18n.ts`.
В выдаваемом HTML их не было, и `FAQPage` в `@graph` главной отсутствовал.

```
# было: FAQPage на 285 из 288 документов
$ for f in $(find dist -name index.html); do grep -q FAQPage $f || echo $f; done
dist/index.html          ← главная
dist/ru/blog/index.html  ← CollectionPage, FAQ неприменим
dist/uz/blog/index.html  ← CollectionPage, FAQ неприменим

# стало
dist/ru/blog/index.html
dist/uz/blog/index.html
```

Оболочка теперь печатает пять пар `<h3>` + `<p>`, а `@graph` — узел
`FAQPage @id=https://gptbot.uz/#faq` с теми же пятью парами. **Оба берут строки из одного
`i18n.ru.faq.items`**, который рендерит и видимый аккордеон, — требование методики
«JSON-LD = видимый текст» выполняется конструктивно, а не проверкой постфактум.

Вопросы главной не дублируются больше нигде на сайте (проверено по всем 289 документам:
`5/5` совпадений только в `dist/index.html`) — каннибализации FAQ нет.

### 2.3 Оболочка рассказывает, что продукт делает

Добавлены секции из того же `src/i18n.ts`, что рендерит React: буллиты hero, `pain`
(проблема + 5 карточек), `solution` (тезис + 6 выгод), `how` (3 шага), `niches` (8 ниш).

| Метрика `dist/index.html` | Было | Стало |
|---|---|---|
| `<h2>` | 4 | 9 |
| `<h3>` | 0 | 5 |
| `<img>` (не пиксель) | 0 | 1 |
| `FAQPage` | нет | есть |
| Размер | 73 956 Б | 81 505 Б |

Это тот текст, который отвечает на вопрос «что такое GPTBot.uz» — то есть ровно то, что
цитирует движок ответов. Ни одной новой утверждаемой фразы не написано: всё уже показывается
посетителю.

### 2.4 Главная называла две разные «главные картинки»

`og:image` и `twitter:image` на `/` указывали на
`/assets/landing/premium/gptbot-ai-bot-business-og.jpg`, а `WebPage.primaryImageOfPage` в
JSON-LD — на `/assets/landing/og.jpg`, потому что главная берёт share-картинку из
`index.html` (у неё нет content-JSON), а `prerender-home.ts` подставлял
`global.defaultOgImage`. Один URL с двумя представительными картинками — противоречие,
которое краулер разрешает угадыванием.

Теперь `prerender-home.ts` читает `og:image` из фактически собранного HTML; глобальный
дефолт остался запасным вариантом. Проверка на сборке:

```
$ grep -oE '"primaryImageOfPage":\{[^}]*\}' dist/index.html
…"url":"https://gptbot.uz/assets/landing/premium/gptbot-ai-bot-business-og.jpg"}
$ grep -oE '<meta property="og:image" content="[^"]*"' dist/index.html
<meta property="og:image" content="https://gptbot.uz/assets/landing/premium/gptbot-ai-bot-business-og.jpg"
```

### 2.5 Sitemap получил расширение image

`sitemap.xml` перечислял только URL. 141 документ сайта рендерит настоящую иллюстрацию
(hero блога, hero главной, страницы Boss Digital) — у этих картинок не было ни одного
маршрута обнаружения в Google Images, а `max-image-preview:large` нечего было превьюировать.

`scripts/generate-sitemap.ts` теперь объявляет
`xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"` и добавляет `<image:image>`
к тем URL, у которых картинка **есть в собранном HTML**. Источник — `dist/`, а не content-JSON:
файл, которого нет в разметке, на странице не находится, что бы ни утверждал JSON. Скрипт
запускается после всех pre-render-шагов (см. `build` в `package.json`), так что `dist/` к
этому моменту полон.

Фильтры: только свой домен (`/assets/…`) и только растр (`avif|webp|jpg|png`). Трекинговые
пиксели — сторонние абсолютные URL, отсекаются первым условием; словесные знаки Маркета —
SVG, отсекаются вторым.

```
Sitemap written with 288 entries (121 pages + 164 articles),
268 with hreflang alternates, 139 with 139 images → dist/sitemap.xml
```

Пример записи:

```xml
<url>
  <loc>https://gptbot.uz/ru/blog/chto-takoe-ai-bot-dlya-biznesa/</loc>
  <xhtml:link rel="alternate" hreflang="ru" href="…"/>
  <xhtml:link rel="alternate" hreflang="uz" href="…"/>
  <xhtml:link rel="alternate" hreflang="x-default" href="…"/>
  <lastmod>2026-09-13</lastmod>
  <image:image><image:loc>https://gptbot.uz/assets/blog/chto-takoe-ai-bot-dlya-biznesa-1200.webp</image:loc></image:image>
</url>
```

---

## 3. Файлы

| Файл | Изменение |
|---|---|
| `scripts/prerender-home.ts` | hero `<picture>`, секции pain/solution/how/niches, FAQ-блок, узел `FAQPage`, `primaryImageOfPage` из фактического `og:image` |
| `scripts/generate-sitemap.ts` | namespace `image`, `imagesOf()` по собранному HTML, счётчики в логе |
| `tests/homepage-crawler-shell.test.ts` | новый: 5 проверок контракта оболочки и sitemap |
| `package.json` | новый тест добавлен в `npm test` |

Ни один файл в `content/` не тронут: тексты страниц не менялись.

---

## 4. Проверки

```
npx tsc -b                                  → 0 ошибок
npm run build:fast                          → 289 документов, sitemap 288/139 картинок
npm test                                    → 622/622
node --test tests/homepage-premium.test.ts  → 8/8
node --test tests/seo-protection.test.ts    → 3/3
node --test tests/seo-page-integrity.test.ts→ 15/15
node --test tests/seo-link-graph.test.ts    → 17/17
npx eslint <изменённые файлы>               → 0 ошибок
grep '[0-9]{8,10}:[A-Za-z0-9_-]{30,}'       → пусто
```

Сканирование всей сборки: 289 документов, 0 без canonical, 0 без `og:image`, 0 дублей
`<title>`, 0 дублей `description`, 0 дублей `<h1>`; `title > 65` — 0, `description > 160` — 3
(одна из них, 177 симв., на защищённой UZ-странице-лидере `chatgpt-telefon-va-kompyuterga-yuklab-olish`
— **намеренно не трогалась**: страница даёт CTR 12 % на позиции 3,9, риск выше выгоды).

---

## 5. Что не сделано и почему

- **Production не обновлён.** Деплой = push в `main`, по правилу `AGENTS.md` только по прямой
  команде владельца. Сборка проверена локально.
- **43 статьи блога без собственной картинки** (23 RU + 20 UZ из 164): в sitemap попали 139
  документов, остальные ссылаются на общий `og.jpg` либо не имеют изображения вовсе. Это
  контентная работа — нужны реальные иллюстрации в пайплайн `/assets/blog/<slug>-{480,800,1200}.webp`,
  генерировать их наугад смысла нет.
- **120 лендингов остаются текстовыми** — это осознанный шаблон сайта, а не дефект. Ставить
  одну и ту же картинку на 120 страниц ради строчки в sitemap — шум, не оптимизация.
- **`tests/homepage-premium.test.ts` не подключён ни к `npm test`, ни к TEST_MATRIX** — тест
  существует, проходит (8/8), но запускается только вручную. Отдельная правка, не смешана
  с этой.
- **F04, F08–F11 по-прежнему открыты** — нужны данные владельца или ручной замер, см.
  `FIRE_YOUR_SEO_AGENCY_AUDIT_2026-09-18.md` §5.
- **Заголовки 61–65 символов (31 документ) не сокращались.** Порог методики — 60, но ни один
  не превышает 65, обрезка в мобильной выдаче маловероятна, а массовая правка уже ранжирующихся
  страниц — это риск CTR без доказательства выгоды.

---

## 6. Когда мерить

«Починили» ≠ «готово». Условие завершения этого релиза:

| Что | Когда | Как |
|---|---|---|
| Повторный crawler-eye по `/` на production | сразу после деплоя | `curl -sL https://gptbot.uz/ \| grep -c '<img'` → ≥ 3; `grep -c FAQPage` → 1 |
| IndexNow на `/` | сразу после деплоя | `scripts/indexnow-ping.ts` (только главная — HTML других URL не менялся) |
| Rich Results Test для `/` | в день деплоя | FAQPage без ошибок |
| Sitemap с картинками принят | +3 дня | GSC → Файлы Sitemap: «Успешно», отчёт по картинкам |
| Индексация картинок | **02.10.2026** | GSC → Эффективность → тип поиска «Картинки»: показы > 0 |
| FAQ-сниппет и цитирование `/` | **20.10.2026** (28 дней) | GSC по запросу `gptbot` + ежемесячный O/X-замер (F08) |
| Визиты AI-краулеров на `/` | еженедельно | Cloudflare AI Audit (F09) |

Базовая линия «до» — раздел 4 файла `FIRE_YOUR_SEO_AGENCY_AUDIT_2026-09-18.md`
(843 клика / 75 021 показ / позиция ≈ 7 за 18.08–14.09), показы в поиске по картинкам на эту
дату = **0, потому что sitemap их не объявлял**.
