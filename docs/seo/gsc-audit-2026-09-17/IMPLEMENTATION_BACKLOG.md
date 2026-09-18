# Implementation Backlog — gptbot.uz (для разработчика)

Репозиторий: `braindiggeruz/ai-direct-pro-landing`, ветка аудита `seo/gsc-audit-20260917` (worktree `F:\Claude\gptbot-gsc-audit-20260917`, база `origin/main` a16f7988). Production не менялся. Каждая задача — отдельный коммит; релиз только через `npm run release:pages:check` → `deploy:pages:production` по команде владельца. Полный список с полями приоритета, доказательств, риска и критериев — `csv/recommended_actions.csv`.

Общие правила:
- Защищённые страницы (`scripts/seo-protection.ts:12-21`): при изменении title/H1/description/текста обновить соответствующие поля в `docs/seo/evidence/2026-09-14/reviewed-protected-pages.json` в том же коммите; иначе `stamp/check/deploy` остановится.
- После правок: `npm run build` (запускает `scripts/seo-audit.ts` — дубли/hreflang/битые ссылки), `node --import tsx scripts/seo-protection.ts check`, `npm test` (543 теста на 06.09).
- Не менять `canonical`, `url`, `slug` существующих страниц.

---

## T01 · P1 · Сниппет статьи входа под «kirish / ochish»

- Файл: `content/blog/uz/chatgptga-qanday-kirish-mumkin.json` — поля `title`, `description`, `h1`, `intro`, `body` (добавить H2), `ogTitle`, `ogDescription`, `dateModified`, `updatedAt`.
- Изменение:
  ```json
  "title": "ChatGPT kirish (login): rasmiy sayt, ochish va ro‘yxatdan o‘tish",
  "h1": "ChatGPT kirish va ochish: rasmiy sayt, ro‘yxatdan o‘tish va xatolar",
  "description": "ChatGPT’ga kirish va ochish: rasmiy chatgpt.com, hisob ochish, kod kelmasa nima qilish, klon saytlardan saqlanish. O‘zbekiston uchun 2026 qo‘llanmasi."
  ```
  В `body` первый блок — прямой ответ (2 предложения), новый H2 `ChatGPT ochish: 3 qadam` перед «Log in va Sign up farqi nimada?». Не менять URL, FAQ, ссылки.
- Baseline: обновить `title`, `h1`, `description`, хеш текста для `/uz/blog/chatgptga-qanday-kirish-mumkin/` в `docs/seo/evidence/2026-09-14/reviewed-protected-pages.json` (формат — как записал `scripts/seo-protection.ts capture`).
- Acceptance: `dist/uz/blog/chatgptga-qanday-kirish-mumkin/index.html` содержит новые `<title>`, `<h1>`, `<meta name="description">`; `seo-audit.ts` не находит дублей; длина title ≤ 65.
- Тест: `node --import tsx --test tests/seo-protection.test.ts`; ручная проверка сниппета после релиза `curl -s URL | grep -o '<title>[^<]*'`.

## T02 · P1 · VPNsiz-статья: убрать «kirish» из title/H1

- Файл: `content/blog/uz/chatgpt-ozbekistonda-vpnsiz-ishlaydimi.json` — `title`, `h1`, `description`, `body` (раздел «ChatGPT’ga kirish: 4 qadam» → 2 предложения + ссылка), `internalLinks` (добавить `/uz/blog/chatgptga-qanday-kirish-mumkin/` с якорем «ChatGPT’ga kirish»).
- Пример: `"title": "ChatGPT O‘zbekistonda ishlaydimi? VPNsiz va rasmiy usul (2026)"`, `"h1": "ChatGPT O‘zbekistonda: ishlaydimi, VPN kerakmi va rasmiy usul"`.
- Baseline: обновить запись защищённой страницы.
- Acceptance: в HTML нет «kirish» в `<title>` и `<h1>`; есть `<a href="/uz/blog/chatgptga-qanday-kirish-mumkin/">`.

## T03 · P1 · Узбекский чат: «kirish» и «uzbekcha» в title

- Файл: `content/pages/uz/gpt-uzbek-tilida.json` — `title`, `description`, `heroSubtitle` или первый `bodyBlocks`, `ogTitle`, `lastReviewedAt`.
- Пример: `"title": "ChatGPT o‘zbek tilida (uzbekcha) — bepul kirish, ro‘yxatsiz chat"`, `"description": "ChatGPT uzbekcha online: bepul kirish, ro‘yxatdan o‘tmasdan, VPNsiz. Savol bering — javob o‘zbek tilida, telefon va kompyuterda ishlaydi."`
- Baseline: обновить запись `/uz/gpt-uzbek-tilida/`.
- Acceptance: `<title>` ≤ 65 символов, содержит «kirish» и «uzbekcha»; hreflang-пара с `/ru/gpt-chat/` не изменилась.

## T04 · P1 · RU-чат: ссылка на UZ-версию над первым экраном

- Файл: `content/pages/ru/gpt-chat.json` — `heroSubtitle` или первый `bodyBlocks` (текстовая ссылка `ChatGPT o‘zbek tilida — o‘zbekcha versiya` → `/uz/gpt-uzbek-tilida/`), `internalLinks`.
- Если блоки hero не поддерживают ссылки — `scripts/prerender.ts` (секция hero, ~строки 837–870) добавить рендер опционального поля `heroLink {label, href}` для `pageType` чата.
- Baseline: `/ru/gpt-chat/` защищена — обновить хеш текста и список внутренних ссылок.
- Acceptance: в HTML `/ru/gpt-chat/` до `<div id="chat">` есть `<a href="/uz/gpt-uzbek-tilida/">`.

## T05 · P2 · Редиректы двух 404

- Файл: `content/seo/redirects.json` — добавить:
  ```json
  {"id":"typo-gpt-vs-chatgpt-sravnesie","from":"/ru/gpt-vs-chatgpt-sravnesie/","to":"/ru/gpt-vs-chatgpt-sravnenie/","statusCode":301,"reason":"typo URL with 1 click in GSC (gsc-audit-2026-09-17)","createdAt":"2026-09-17"},
  {"id":"legacy-uz-kompyuter-ga-yuklab-olish","from":"/uz/blog/chatgpt-telefon-va-kompyuter-ga-yuklab-olish/","to":"/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/","statusCode":301,"reason":"slug variant seen in GSC (gsc-audit-2026-09-17)","createdAt":"2026-09-17"}
  ```
- Acceptance: `dist/_redirects` содержит обе строки; после релиза `curl -I` → 301 на целевые URL. Тест: существующий `tests/gsc-indexation-hygiene.test.ts` (если проверяет redirects.json) проходит.

## T06 · P2 · Sitemap: один источник правды

- Файлы: `public/sitemap-new.xml`, `public/sitemap-priority.xml` (статические, без lastmod), `src/shared/robots-policy.ts:96-97` (строки `Sitemap:`), `scripts/generate-robots.ts:270` (`headers.push('/sitemap-priority.xml')`), `scripts/generate-sitemap.ts`.
- Вариант A (проще): удалить два статических файла и их строки из robots-policy/generate-robots; **не** удалять submissions в GSC автоматически — владелец решает в интерфейсе.
- Вариант B: генерировать `sitemap-priority.xml` в `generate-sitemap.ts` из списка slug'ов с теми же `lastmod`, что в основном.
- Acceptance: `curl https://gptbot.uz/robots.txt | grep Sitemap` — только актуальные файлы; каждый URL из priority (если оставлен) имеет `<lastmod>` = контенту. Тест: `tests/gsc-indexation-hygiene.test.ts` обновить под новую политику.

## T07 · P2 · /ru/telegram-bot-uzbekistan/ — перекраул (ручное)

- Код не требуется (редирект `gsc-legacy-telegram-bot-uzbekistan` уже в `content/seo/redirects.json:107-108`). Действие владельца в GSC: URL Inspection → «Request indexing» для старого URL, чтобы Google заменил 404 на 301. Без разрешения не выполнять.

## T08 · P2 · /ru/promty-gpt-chatgpt-50-primerov/ — индексация

- Файлы: `content/pages/ru/promty-gpt-chatgpt-50-primerov.json` (уникальные примеры промптов с результатами, `lastReviewedAt`), `content/pages/ru/gpt-chat.json` и `content/blog/ru/chat-gpt-na-russkom.json` — `internalLinks` со ссылкой на промпты.
- Acceptance: ≥ 2 контекстных входящих ссылки в HTML; через 3–4 недели URL Inspection ≠ «Crawled – currently not indexed». Затем (ручное) запрос индексации.

## T09 · P2 · Статья о скачивании: «kompyuter» в title (после оценки T01–T04)

- Файл: `content/blog/uz/chatgpt-telefon-va-kompyuterga-yuklab-olish.json` — `title` → `ChatGPT yuklab olish o‘zbek tilida — telefon va kompyuter uchun (2026)`; `description` + «Windows/macOS»; в `body` раздел «ChatGPTni yuklamasdan ishlatsa bo‘ladimi?» сократить и сослаться на login-статью и `/uz/gpt-uzbek-tilida/`.
- Baseline: обновить. Acceptance: title ≤ 70, H1 без изменений, ссылки присутствуют.

## T10 · P2 · Единая страница «Разработка чат-ботов в Ташкенте»

- Файлы: `content/pages/ru/luchshie-razrabotchiki-chat-botov-tashkent.json` (`title` → `Разработка чат-ботов в Ташкенте — Telegram, Instagram, AI | GPTBot`, `h1` → `Разработка чат-ботов в Ташкенте`, `bodyBlocks`: блок цен со ссылкой на `/ru/stoimost-chat-bota/`, блок «Кейсы» со ссылками на `/ru/blog/keys-cake-city-platforma-kondirterskoy/` и `/ru/blog/keys-graver-studio-seo-sayt-b2b/`), `content/pages/ru/stoimost-chat-bota.json`, `content/pages/ru/razrabotka-telegram-bota-tashkent.json`, `content/blog/ru/razrabotka-chat-bota.json` — `internalLinks` с якорем «разработка чат-ботов в Ташкенте».
- Acceptance: `seo-audit.ts` не находит дублей title; в HTML трёх страниц есть ссылка на целевую с точным якорем.

## T11 · P2 · Новая UZ-статья «ChatGPT bilan tarjima»

- Файл: новый `content/blog/uz/chatgpt-bilan-tarjima-qilish.json` (по образцу `chatgpt-uzbek-tilida-promptlar.json`: `status: published`, `locale: uz`, `title`, `h1`, `description`, `intro`, `body`, `faq`, `cta` → чат, `internalLinks`, `schemaTypes` Article+FAQPage, даты). Ссылки на неё из `gpt-uzbek-tilida.json` и `chatgpt-telefon-va-kompyuterga-yuklab-olish.json`.
- Acceptance: страница в `dist/sitemap.xml` с `lastmod`; `seo-audit.ts` зелёный; URL Inspection после релиза — indexed.

## T12 · P2 · «yozish»: расширить insho-статью

- Файл: `content/blog/uz/insho-yozish-suniy-intellekt-bilan.json` — `title`/`h1` расширить до «insho, xat, post va referat yozish», H2 по типам текстов, ссылка на чат.

## T13 · P2 · Кластер главных (/ , /ru/, /uz/) — решение владельца

- Файлы: `scripts/prerender-home.ts` (hreflang для `/`), `scripts/generate-sitemap.ts:74-79` (комментарий про RU-only главную), `content/pages/ru/` (файл `/ru/`), `content/pages/uz/` (файл `/uz/`).
- Варианты: (a) `/` = ru + x-default, `/uz/` = uz, `/ru/` → canonical на `/` или noindex; (b) `/` только x-default-редирект по языку — не рекомендуется. Требует решения владельца; `/` — защищённая страница.

## T14 · P3 · Длинные title/description (24 / 32 URL)

- Список: `csv/pages_all.csv` (`title_len > 65`, `description_len > 165`). Файлы — соответствующие `content/pages/{ru,uz}/*.json`. Правило: ≤ 60 символов title, ≤ 155 description; цену оставлять, если она — главный дифференциатор («от 990 000 сум»), суффикс «| GPTBot.uz» сокращать до «| GPTBot».
- Acceptance: краул `site_crawl.py` показывает `title_over_65 = 0` для правленных URL.

## T15 · P3 · SEO-сервис: локальные запросы

- Файлы: `content/pages/ru/seo-prodvizhenie-saytov-tashkent.json` (FAQ с ценами выше, H2 «SEO Ташкент: локальные факторы»), `content/blog/ru/chto-takoe-seo-prodvizhenie.json` (`internalLinks` на сервис с якорем «SEO-продвижение сайтов в Ташкенте»).

## T16 · P3 · Instagram Direct: лендинг ↔ статья

- Файлы: `content/pages/ru/instagram-direct-bot.json` (`h1` → «Бот для Instagram Direct для бизнеса в Узбекистане»), `content/blog/ru/instagram-direct-bot-kak-rabotaet.json` (`internalLinks` → лендинг, якорь «бот для Instagram Direct»).

## T17 · P3 · «instagram direct nima» блок-определение

- Файл: `content/blog/uz/instagram-direct-ai-bot-qanday-ishlaydi.json` — первый блок «Instagram Direct nima?» (2–3 предложения).

## T18 · P3 · «услуги смм специалиста» description

- Файл: `content/blog/ru/chto-vhodit-v-uslugi-smm-specialista.json` — `description` с ответом и ценой «от», `internalLinks` → `/ru/smm-prodvizhenie-tashkent/`.

## T19 · P2 · Измерение (скрипты аудита)

- Файлы: `seo-audit/gsc-2026-09-17/scripts/gsc_pull.py`, `analysis.py`, `charts.py`, `site_crawl.py` — вынести в `scripts/seo/gsc/` (без токенов в коде), добавить `npm run seo:gsc:pull`, `seo:gsc:analyze`. Не коммитить `raw/` с персональными данными? Данных о пользователях там нет (агрегаты GSC), можно хранить.
- Acceptance: `python scripts/seo/gsc/gsc_pull.py probe` работает с любой машины, где авторизован OpenSEO MCP; в репозитории нет секретов (`secret scan` зелёный).

## T20 · P3 · CWV лабораторно

- `npx lighthouse https://gptbot.uz/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/ --preset=perf --form-factor=mobile --output=json --output-path=docs/seo/gsc-audit-2026-09-17/lighthouse/…` для 4 лидеров (требует установки lighthouse или PSI API-ключа в `~/.config/claude-seo/google-api.json`).
