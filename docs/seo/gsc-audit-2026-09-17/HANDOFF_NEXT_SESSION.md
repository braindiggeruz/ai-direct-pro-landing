# HANDOFF — GSC-аудит и SEO-план GPTBot.uz (сессия 2026-09-17/18 → следующая сессия)

Дата передачи: 2026-09-18. Автор: Claude (Senior Technical SEO / Data / Fullstack) по заданию владельца braindigger.uz@gmail.com. Язык работы — русский. Документ самодостаточен: агент следующей сессии может начать с раздела 1 и продолжить без чтения этой переписки.

---

## 1. Первые 10 минут новой сессии (чек-лист)

1. Открыть проект: `F:\Claude\gptbot-gsc-audit-20260917` (git worktree, ветка `seo/gsc-audit-20260917`, база `origin/main` a16f7988). Если сессия запущена без папки — вызвать change_directory на этот путь. Не работать в других клонах `F:\Claude\gptbot-*` (устаревшие).
2. `git status --short` — ожидаемо только три untracked: `docs/seo/gsc-audit-2026-09-17/`, `seo-audit/`, `.serena/` (последнюю в коммит не включать). Tracked-файлы должны быть чистыми. Если есть новые коммиты в `origin/main` — `git fetch` и сравнить, но не ребейзить без нужды.
3. Прочитать в этом порядке: `docs/seo/gsc-audit-2026-09-17/README.md` → `FINAL_REPORT.md` → `SEO_ROADMAP_FULL.md` → `patches/README.md` → `EMERGING_KEYWORDS.md`. Остальное — по мере необходимости.
4. Проверить доступ к GSC: `cd seo-audit/gsc-2026-09-17/scripts && python gsc_pull.py probe`. Ожидаемый вывод: `siteUrl: sc-domain:gptbot.uz`, `lastFinalDate` ≥ 2026-09-14. Если ошибка токена — см. раздел 4.
5. Уточнить у владельца статус решений из раздела 9 (что одобрено). Пока нет одобрения — не применять патчи к tracked-файлам, не деплоить.

---

## 2. Контекст проекта

**Сайт:** https://gptbot.uz/ — AI-боты для бизнеса (Telegram/Instagram/WhatsApp), SMM, SEO, разработка сайтов, реклама; плюс потребительский продукт — бесплатный AI-чат на русском (`/ru/gpt-chat/`) и узбекском (`/uz/gpt-uzbek-tilida/`), готовится подписка Plus. CTA — Telegram `https://t.me/XGame_changerx` и телефон из `content/global/site.json`. Канонический хост — `https://gptbot.uz` **без www** (www и http → 301).

**Репозиторий:** GitHub `braindiggeruz/ai-direct-pro-landing`. Стек: Vite 8 + React 19, публичные страницы полностью пререндерены в статический HTML (`scripts/prerender.ts`, `prerender-blog.ts`, `prerender-home.ts`), контент в JSON: `content/pages/{ru,uz}/*.json` (73 + 49), `content/blog/{ru,uz}/*.json` (127 + 56), `content/global/site.json`. Sitemap — `scripts/generate-sitemap.ts`; robots/redirects/headers — `scripts/generate-robots.ts` из `src/shared/robots-policy.ts` и `content/seo/redirects.json` (16 правил). Cloudflare Pages, проект `ai-direct-pro-landing`. Node 22 (`.node-version`), Python 3.9 на машине.

**Деплой:** только через `scripts/release/pages-production.ts` (`npm run release:pages:check` → `deploy:pages:production`) по команде владельца. Прямой wrangler запрещён процессом. Перед stamp/check/deploy запускается `scripts/seo-protection.ts check` по baseline `docs/seo/evidence/2026-09-14/reviewed-protected-pages.json` (10 защищённых URL).

**Защищённые URL** (`scripts/seo-protection.ts:12-21`): `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/`, `/uz/gpt-uzbek-tilida/`, `/ru/gpt-chat/`, `/ru/blog/chatgpt-i-claude-v-uzbekistane/`, `/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/`, `/uz/blog/chatgptga-qanday-kirish-mumkin/`, `/uz/blog/chatgpt-uzbek-tilida-promptlar/`, `/`, `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/`, `/uz/blog/ai-chat-nima-va-qanday-turlari-bor/`. Любое изменение их title/H1/description/текста/внутренних ссылок требует новой ревизии baseline в том же коммите (процесс — раздел 7, шаг B).

**Существующие документы в репо**, которые полезно знать: `AGENTS.md` (правила), `docs/seo/SEO_FOUNDATION_2026-09-06.md` (прошлый срез GSC и защита), `docs/seo/CANNIBALIZATION_AND_MIGRATION_MAP_2026-08-01.md`, `docs/seo/ai-agent-release/RELEASE.md` (последний релиз 14.09).

---

## 3. Правила владельца (обязательны)

Без отдельного явного разрешения запрещено: менять production, деплоить, менять DNS, удалять URL из индекса, менять настройки GSC, загружать/удалять sitemap в GSC, менять canonical, создавать массовые страницы, покупать ссылки, публиковать изменения. Все действия с GSC — read-only. Никогда не печатать и не коммитить токены, client_secret, refresh_token, cookies, ключи. Не использовать `git add .`, `reset --hard`, `clean -fd`, `push --force`. Коммит и push — только по просьбе владельца. Отчёты — Markdown + CSV в репозитории; каждая рекомендация привязана к запросу, URL, метрике, файлу и критерию приёмки; общих фраз избегать.

---

## 4. Доступ к Google Search Console (как это работает)

**Property:** `sc-domain:gptbot.uz` (доменная; данные существуют только с 2026-05-21).

**Рабочий канал:** OpenSEO MCP-сервер `https://app.openseo.so/mcp` (в Claude Code подключён как `openseo`, авторизован OAuth под braindigger.uz@gmail.com). Проект OpenSEO «GPTBot.uz» `projectId = 7534113b-f748-4f98-ac39-9e3782d3d9e7`. Инструменты read-only, кредиты не тратят:
- `get_search_console_performance` — Search Analytics; `rowLimit` max 1000, пагинация `startRow` пока `hasMore`; `dataState: "final"` для финальных дней; даты Pacific Time; `dimensions` из query/page/country/device/date/searchAppearance (последний возвращает 0 строк).
- `inspect_urls` — URL Inspection; **батчами по 3 URL** (10 URL — таймаут). Квота Google 2 000/день.
- Список properties (`sites.list`), Sitemaps API, Index Coverage через этот канал **недоступны**.

**Скриптовый доступ (без ручных вызовов MCP):** `seo-audit/gsc-2026-09-17/scripts/gsc_pull.py` — Python MCP-клиент (JSON-RPC по HTTP), берёт OAuth-токен из хранилища Claude Code `~/.claude/.credentials.json` → `mcpOAuth["openseo|…"].accessToken`, не печатает его. Если токен истёк — сделать любой вызов `openseo` MCP из Claude Code (он обновит токен) и повторить. Команды:

```bash
cd seo-audit/gsc-2026-09-17/scripts
python gsc_pull.py probe                       # последняя финальная дата, проверка транспорта
python gsc_pull.py pull --end YYYY-MM-DD       # полная выгрузка всех срезов в ../raw/
python site_crawl.py --workers 5               # краул sitemap (title/H1/canonical/hreflang/JSON-LD/ссылки)
PYTHONIOENCODING=utf-8 python analysis.py      # все производные CSV + summary.json
PYTHONIOENCODING=utf-8 python emerging.py      # срез «показы только начались»
python charts.py                               # 13 PNG
```

Для новой недели: скопировать `scripts/` в `seo-audit/gsc-YYYY-MM-DD/scripts/` и выполнить по порядку (пути в скриптах относительные, выходы — в `docs/seo/gsc-audit-2026-09-17/` — при желании поменять константу `OUT` в `analysis.py`, `emerging.py`, `charts.py`).

**Тупики, проверенные 17.09 (не тратить время):** `gcloud auth print-access-token` — `invalid_grant` (refresh-токен просрочен); `~/.config/claude-seo/google-api.json` отсутствует; service-account/client_secret файлов на диске нет; `GSC_CLIENT_ID/SECRET/REFRESH_TOKEN` живут только в секретах Cloudflare Pages (используются `functions/lib/gsc/sitemap.ts`), локально не читаются; `F:\Claude\seo-agent\.env` — `GSC_OAUTH` пустой; PageSpeed Insights API без ключа — «Quota exceeded»; Lighthouse не установлен. Для прямого API подготовлен `scripts/gsc_direct_auth.py` (scope `webmasters.readonly`, нужен client_secret.json и подтверждение владельца в браузере) — не запускался.

---

## 5. Что сделано (артефакты)

Все в `F:\Claude\gptbot-gsc-audit-20260917`, не закоммичено.

**`docs/seo/gsc-audit-2026-09-17/`** — 17 Markdown: `README.md` (индекс), `EXECUTIVE_SUMMARY.md`, `FINAL_REPORT.md`, `GSC_DATA_OVERVIEW.md`, `QUERY_ANALYSIS.md`, `PAGE_ANALYSIS.md`, `CANNIBALIZATION.md`, `TECHNICAL_SEO.md`, `CONTENT_OPPORTUNITIES.md`, `QUICK_WINS.md`, `ROADMAP_90_DAYS.md`, `SEO_ROADMAP_FULL.md`, `IMPLEMENTATION_BACKLOG.md`, `MEASUREMENT_PLAN.md`, `DATA_LIMITATIONS.md`, `EMERGING_KEYWORDS.md`, этот `HANDOFF_NEXT_SESSION.md`; `summary.json`, `summary_emerging.json`; `csv/` — 49 таблиц (в т. ч. `recommended_actions.csv` — 20 задач с полями id/priority/evidence/fix/files/risk/effort/acceptance/measurement/recheck_date; `queries_emerging.csv` — 145 запросов); `charts/` — 13 PNG; `patches/` — 5 diff + README.

**`seo-audit/gsc-2026-09-17/`** — `raw/` (63 выгрузки GSC CSV+JSON, `PERIODS.json`, `site_pages.json/csv`, `site_links.csv`, `url_inspection.json` — 42 URL, `pagespeed.json` — ошибка квоты, логи), `scripts/` (`gsc_pull.py`, `site_crawl.py`, `analysis.py`, `emerging.py`, `charts.py`, `make_wave1_patches.py`, `gsc_direct_auth.py`), `README.md`.

**Память Claude (эта машина):** `gptbot-gsc-access.md`, `gptbot-seo-constraints.md` в memory-каталоге проекта scratch-сессии — содержат то же, что разделы 3–4.

**Периоды и база:** финальные данные 2026-05-21…2026-09-14; основное окно 18.08–14.09 (28 дн.) против 21.07–17.08; 7 дн. 08.09–14.09; 90 дн. 17.06–14.09. YoY невозможен.

---

## 6. Ключевые выводы (цифры для быстрой ориентации)

| Метрика | 18.08–14.09 | 21.07–17.08 |
|---|---|---|
| Клики / показы | 843 / 75 021 | 91 / 6 808 |
| CTR / ср. позиция | 1,12% / 8,64 | 1,34% / 19,99 |
| Mobile доля кликов | 76,9% | — |
| Узбекистан / Россия доля кликов | 80,1% / 13,5% | — |
| Анонимизированные клики | 35,3% (298) | 72,5% |

- 93,8% кликов — узбекоязычные запросы; 78,9% — навигационные «скачать/войти в ChatGPT», 18,2% — «ChatGPT онлайн на узбекском»; бренд 1,1%; услуги 0,4%. 94% показов на позициях 4–10.
- Топ-6 страниц = 89,2% кликов: download-статья UZ (337 кликов / 19 110 показов / CTR 1,76% / поз. 5,6), UZ-чат (119 / 14 130 / 0,84% / 6,8), RU-чат (117 / 5 512 / 2,12% / 5,7), login-статья UZ (95 / 25 244 / 0,38% / 7,2; опубликована 1.09), RU-статьи об оплате (46) и ChatGPT/Claude (38).
- Главная возможность: «chatgpt kirish» 24 641 показ, CTR 0,32%, поз. 7,4 — сниппет говорит «login». Медиана сайта для поз. 7–10 = 0,85% → ≈ +130 кликов/28 дн.
- Каннибализация: «chatgpt ochish» (3 365 показов/90д) делят login- и download-статьи; VPNsiz-статья с title «ChatGPT’ga kirish…» собирает kirish-запросы при CTR 0,31%. 17 подтверждённых случаев, 15 — языковые пары RU/UZ (норма).
- Языковой переток: 25 узбекских запросов (3 199 показов, 35 кликов) приземляются на русский `/ru/gpt-chat/`.
- Услуги: 3 925 показов, 2 клика; из Узбекистана 927 показов (23,6%), Россия 29,5%, Украина 21%; позиции 20–60.
- Техника: 289/289 URL sitemap — 200, self-canonical, index/follow, дублей нет, редиректы работают, полный пререндер. Проблемы: три sitemap (289+5+18, два статических без lastmod); Google не связывает sitemap с 10 из 36 проверенных проиндексированных URL; 2 страницы «Crawled – not indexed» (`/ru/promty-gpt-chatgpt-50-primerov/`, `/ru/chto-takoe-gpt-i-kak-polzovatsya/`); 2 × 404 с показами (`/ru/gpt-vs-chatgpt-sravnesie/`, `/uz/blog/chatgpt-telefon-va-kompyuter-ga-yuklab-olish/`); `/ru/telegram-bot-uzbekistan/` — в Google 404 от 23.08, сейчас 301; кластер главных `/`, `/ru/`, `/uz/` без hreflang; 24 title > 65 и 32 description > 165 символов. P0 нет.
- Emerging: 145 запросов (68% всех показов) — новые за 14 дн. 22 (1 105 показов), за 28 дн. 58 (32 692), растущие ×2 — 17 (14 996), видимые без кликов — 48 (2 008). Единственная оправданная новая страница — «ChatGPT bilan tarjima» (463 показа без владельца).

---

## 7. Статус задач и что делать дальше (по порядку)

### A. Волна 1 — готова к применению после одобрения владельца

Патчи `docs/seo/gsc-audit-2026-09-17/patches/` (сгенерированы `make_wave1_patches.py`, `git apply --check` пройден 18.09 на a16f7988):

| Патч | Файл | Суть |
|---|---|---|
| T01-login-article-snippet.diff | `content/blog/uz/chatgptga-qanday-kirish-mumkin.json` | title `ChatGPT kirish (login): rasmiy sayt, ochish va ro‘yxatdan o‘tish`, H1/description с «kirish/ochish», новый intro, раздел «ChatGPT ochish: 3 qadam» + пункт TOC, keywords, даты |
| T02-vpnsiz-article-detitle-kirish.diff | `content/blog/uz/chatgpt-ozbekistonda-vpnsiz-ishlaydimi.json` | title `ChatGPT O‘zbekistonda ishlaydimi? VPNsiz va rasmiy usul (2026)`, H1 без «kirish», первый H2 → «Qisqa javob: ishlaydi, VPN shart emas» с отсылкой к login-статье |
| T03-uz-chat-title-kirish-uzbekcha.diff | `content/pages/uz/gpt-uzbek-tilida.json` | title `ChatGPT o‘zbek tilida (uzbekcha) — bepul kirish, ro‘yxatsiz chat`, description, heroSubtitle, первый абзац с написаниями uzbekcha/o‘zbekcha |
| T04-ru-chat-link-to-uz.diff | `content/pages/ru/gpt-chat.json` | первый блок `linkp` со ссылкой на `/uz/gpt-uzbek-tilida/`, heroSubtitle, description, internalLinks |
| T05-redirects-two-404s.diff | `content/seo/redirects.json` | два правила 301 |

Порядок действий (после «да» владельца):

```bash
cd F:\Claude\gptbot-gsc-audit-20260917
git checkout -b seo/wave1-kirish-cluster origin/main
git apply docs/seo/gsc-audit-2026-09-17/patches/T05-redirects-two-404s.diff
git apply docs/seo/gsc-audit-2026-09-17/patches/T01-login-article-snippet.diff
git apply docs/seo/gsc-audit-2026-09-17/patches/T02-vpnsiz-article-detitle-kirish.diff
git apply docs/seo/gsc-audit-2026-09-17/patches/T03-uz-chat-title-kirish-uzbekcha.diff
git apply docs/seo/gsc-audit-2026-09-17/patches/T04-ru-chat-link-to-uz.diff
```

Затем: (1) редакторская вычитка узбекских формулировок носителем — обязательна, тексты написаны по образцу статей, но не вычитаны; (2) `yarn install` при отсутствии `node_modules` (в worktree их нет); (3) `npm run build` (запускает `scripts/seo-audit.ts`: дубли title/description, hreflang, битые ссылки — должен быть зелёным); (4) шаг B.

### B. Ревизия baseline защищённых страниц (обязательно, иначе релиз остановится)

Ревизия 2026-09-14 сделана так: «Reviewed local build; not a new live capture», файл содержит `originalEvidence` (ссылка на предыдущую ревизию) и `reviewedChanges[]` (path, fields, reason). Команда `capture` не подходит — снимает живой сайт и отказывается перезаписывать существующий файл. Порядок:
1. После `npm run build` вычислить контракт четырёх изменённых страниц из `dist/<path>/index.html` функцией `seoContract()` из `scripts/seo-protection.ts` (title, h1, description, robots, googlebot, canonical, hreflang, internalLinks, bodyTextSha256 + bodyText). Написать одноразовый скрипт `node --import tsx` (импорт `seoContract`, чтение `dist`, вывод JSON).
2. Создать `docs/seo/evidence/2026-09-2X/reviewed-protected-pages.json` = копия `2026-09-14/…` с заменёнными записями четырёх страниц, `originalEvidence: "docs/seo/evidence/2026-09-14/reviewed-protected-pages.json"`, `reviewedChanges` с причинами (ссылка на `QUICK_WINS.md` QW-1…QW-4), `source: "Reviewed local build; not a new live capture"`, `capturedAt` — текущая дата.
3. В `scripts/seo-protection.ts:11` заменить `BASELINE` на новый путь.
4. `node --import tsx scripts/seo-protection.ts check` → `Protected SEO: 10/10 unchanged`; `node --import tsx --test tests/seo-protection.test.ts`; `npm test` (543 теста на 06.09); `npm run typecheck`; `npm run lint`.
5. Коммит (без `.serena/`, без `seo-audit/raw`, если владелец не хочет сырые данные в git): `feat(seo): wave 1 — kirish cluster snippets, UZ chat title, RU→UZ link, two redirects`. Push и деплой — только по команде владельца.

### C. После релиза (день 0–5)

- `curl -sI https://gptbot.uz/ru/gpt-vs-chatgpt-sravnesie/` и второй URL → 301.
- `curl -s https://gptbot.uz/uz/blog/chatgptga-qanday-kirish-mumkin/ | grep -o '<title>[^<]*'` — новый title; то же для трёх других страниц.
- `npm run release:pages:check` / `check-production` — зелёный.
- URL Inspection четырёх страниц (батч по 3) через 3–5 дней: `lastCrawlTime` позже релиза. Записать даты краула в `docs/seo/gsc-audit-2026-09-17/checks/wave1-crawl-dates.md` (папку создать).

### D. Еженедельный цикл измерения (каждую пятницу)

1. `python gsc_pull.py probe` → lastFinalDate; `python gsc_pull.py pull --end <lastFinalDate>` в новую папку `seo-audit/gsc-YYYY-MM-DD/`.
2. `analysis.py`, `emerging.py`, `charts.py`.
3. Сравнить с базой: `topic_dynamics.csv`, `top_queries_weekly.csv`, `query_page_pairs.csv` (доля доминирующего URL по «chatgpt ochish», «chatgpt kirish uzbek tilida», «chatgpt online kirish»), `language_mismatch.csv`.
4. Через 14 дней после краула волны 1 — промежуточный взгляд (не решение); через 28 полных дней — вердикт по критериям `QUICK_WINS.md`: T01 успех — CTR «chatgpt kirish» ≥ 0,6% при поз. 6–9, откат — < 0,3% две недели подряд; T02 — доля login-статьи по ochish/kirish ≥ 80%; T03 — CTR «chatgpt kirish uzbek tilida» ≥ 0,9%, «chatgpt bepul kirish» ≥ 0,7%; T04 — доля UZ-страницы по uz-запросам растёт. Контрольная группа — download-кластер. Спрос (показы) считать отдельно от CTR.

### E. Следующие задачи по приоритету (после волны 1)

| ID | P | Задача | Файлы | Когда |
|---|---|---|---|---|
| T06 | P2 | Один источник sitemap: убрать `public/sitemap-new.xml`, `public/sitemap-priority.xml` и строки в `src/shared/robots-policy.ts:96-97`, `scripts/generate-robots.ts:270`, или генерировать priority из контента с lastmod; обновить `tests/gsc-indexation-hygiene.test.ts`. Submissions в GSC — только по решению владельца. Не в один релиз с волной 1 | указаны | недели 2–4 |
| T07 | P2 | Перекраул `/ru/telegram-bot-uzbekistan/` — ручное «Request indexing» в GSC владельцем | — | недели 2–4 |
| T08 | P2 | Две RU-страницы «not indexed»: уникальный контент + ≥ 2 контекстных ссылки из `content/pages/ru/gpt-chat.json` и `content/blog/ru/chat-gpt-na-russkom.json`; затем ручной запрос индексации | `content/pages/ru/promty-gpt-chatgpt-50-primerov.json`, `content/pages/ru/chto-takoe-gpt-i-kak-polzovatsya.json` (проверить точное имя файла) | недели 2–4 |
| T13 | P2 | Кластер главных: решение владельца (вариант: `/` = ru + x-default, `/uz/` = uz, `/ru/` → canonical на `/` или noindex); правки `scripts/prerender-home.ts`, `scripts/generate-sitemap.ts:74-79`; `/` защищена | указаны | недели 2–4 |
| E1 | P2 | UZ-чат: H2 «O‘zbek tilida matn yozish» (под «chatgpt yozish» 243 показа) | `content/pages/uz/gpt-uzbek-tilida.json` | недели 2–4 |
| T09 | P2 | Download-статья: title `ChatGPT yuklab olish o‘zbek tilida — telefon va kompyuter uchun (2026)` — только после вердикта по волне 1 | `content/blog/uz/chatgpt-telefon-va-kompyuterga-yuklab-olish.json` + baseline | месяц 2 |
| T11 | P2 | Новая UZ-статья «ChatGPT bilan tarjima qilish» (по образцу `content/blog/uz/chatgpt-uzbek-tilida-promptlar.json`), ссылки из UZ-чата и download-статьи | новый `content/blog/uz/chatgpt-bilan-tarjima-qilish.json` | месяц 2 |
| T12 | P2 | Insho-статья → «insho, xat, post va referat yozish» | `content/blog/uz/insho-yozish-suniy-intellekt-bilan.json` | месяц 2 |
| E2 | P2 | UZ-чат: H2 «ChatGPT bepul reja va ChatGPT 4: shu sahifada nima bor» | `content/pages/uz/gpt-uzbek-tilida.json` | месяц 2 |
| T10 | P2 | Единая страница «Разработка чат-ботов в Ташкенте»: title/H1 коммерческие, блок цен → `/ru/stoimost-chat-bota/`, кейсы Cake City и Graver, ссылки с `stoimost-chat-bota.json`, `razrabotka-telegram-bota-tashkent.json`, `blog/ru/razrabotka-chat-bota.json` | `content/pages/ru/luchshie-razrabotchiki-chat-botov-tashkent.json` | месяц 2 |
| E3 | P2 | UZ-коммерция: формулировки «savollarga javob beruvchi bot», «telegram bot buyurtma» в H2/FAQ | `content/pages/uz/telegram-bot-biznes-uchun.json`, `content/pages/uz/biznes-uchun-ai-bot.json` | месяц 2 |
| T19 | P2 | Перенести скрипты в `scripts/seo/gsc/`, добавить npm-команды `seo:gsc:pull`, `seo:gsc:analyze` | package.json | месяц 2 |
| T14 | P3 | 24 title > 65 / 32 description > 165 — только у страниц с показами ≥ 20 (список в `csv/pages_all.csv`) | `content/pages/*` | месяцы 2–3 |
| T15–T18 | P3 | SEO-сервис под «seo ташкент»; Instagram Direct лендинг↔статья; блок «Instagram Direct nima?»; description «услуги смм специалиста» | см. `IMPLEMENTATION_BACKLOG.md` | месяц 3 |
| E4, B1, B2, P1, T20 | P3 | Ревизия 7 страниц без спроса; кейсы на сервисных страницах; воронка чата в GA4; Lighthouse для 4 лидеров (нужен `npx lighthouse` или ключ PSI в `~/.config/claude-seo/google-api.json`) | — | месяц 3 |

Полные формулировки, доказательства, критерии приёмки — `IMPLEMENTATION_BACKLOG.md` и `csv/recommended_actions.csv`; фазы и KPI — `SEO_ROADMAP_FULL.md`.

### F. Что НЕ делать

Городские дубли; RU-темы «seo продвижение», «лид это» (Россия/Украина, позиции 25–80); покупка ссылок; массовые title-правки; FAQ ради rich results (Google их не показывает коммерческим сайтам); изменение canonical/URL лидеров; второй крупный рефакторинг до вердикта по волне 1; одновременный релиз T06 (sitemap) с контентными правками лидеров.

---

## 8. Известные подводные камни (сэкономят время)

- **Bash cwd сбрасывается** после команд в фоне и меняется при `cd`; в скриптах и командах использовать абсолютные пути `F:/Claude/gptbot-gsc-audit-20260917/…`.
- **Кодировка консоли cp1251**: перед python-скриптами с узбекским/русским выводом ставить `PYTHONIOENCODING=utf-8`.
- **Python 3.9**: `Path.write_text(newline=…)` не поддерживается — использовать `open(..., newline='\n')`. pandas 1.x: `df.groupby(...).apply` с лямбдами работает, но медленно; FutureWarning от google-auth игнорировать.
- **Content-JSON в репо с CRLF**, 2-пробельный отступ, `ensure_ascii=False`. `make_wave1_patches.py` учитывает это (диффы без шума). При правке JSON руками сохранять CRLF.
- **Файлы с CRLF при чтении в bash-циклах** — `tr -d '\r'`.
- **`inspect_urls`** — только по 3 URL; 10 → таймаут.
- **`git diff --no-index`** выдаёт абсолютные пути в заголовке — скрипт переписывает их в `a/<rel> b/<rel>`; иначе `git apply` падает с «invalid path».
- **`seo-protection.ts capture`** снимает живой сайт и не перезаписывает файл — для новой ревизии baseline нужен собственный скрипт (раздел 7B).
- **Классификатор запросов** (`analysis.py`, regex): 18.09 исправлено `\bбот\w*` (раньше «работает» попадало в chatbot_dev). «other» — 137 запросов не классифицированы; «gpt bot» (15 показов) отнесён к бренду; фонетика «jaji piti/chachipiti/жажипити» — к узбекскому.
- **Суммы по page vs property** различаются (861 vs 843 кликов за 28 дн.) — известное поведение GSC; для итогов брать измерение `date`.
- **Subagent-модели**: Explore-агент с моделью по умолчанию падал (`model_not_found`); работает `model: "sonnet"`.
- **PSI без ключа** — общая квота исчерпана; CrUX недоступен; в отчётах CWV помечены как не измеренные.
- **OpenSEO кредиты = 0** — платные инструменты OpenSEO (SERP, keywords) недоступны; GSC-инструменты кредитов не требуют.
- **`.serena/`** появляется в worktree от MCP-сервера — не коммитить.

---

## 9. Открытые решения владельца (спросить в начале сессии)

1. Одобрить применение волны 1 (T01–T05) и релиз? Кто вычитывает узбекские тексты?
2. Sitemap: удалить статические `sitemap-new.xml` / `sitemap-priority.xml` (и их submissions в GSC) или генерировать с lastmod?
3. Кластер главных `/`, `/ru/`, `/uz/`: какой вариант hreflang/canonical?
4. Ручные действия в GSC: Request indexing для `/ru/telegram-bot-uzbekistan/` и, после правок, для двух RU-страниц «not indexed».
5. Коммитить ли `seo-audit/gsc-2026-09-17/raw/` (8 МБ агрегатов GSC) в репозиторий или хранить вне git.
6. Нужен ли прямой OAuth к Search Console API (для `sites.list`, Sitemaps API) — потребуется client_secret.json и подтверждение в браузере.
7. Факты кейсов (Cake City, Graver) и актуальные цены — для T10/B1.

---

## 10. Карта файлов (быстрая навигация)

```
F:\Claude\gptbot-gsc-audit-20260917\            worktree, ветка seo/gsc-audit-20260917 (origin/main a16f7988)
  docs/seo/gsc-audit-2026-09-17/README.md       индекс отчётов
  …/FINAL_REPORT.md, EXECUTIVE_SUMMARY.md       итоги
  …/SEO_ROADMAP_FULL.md, ROADMAP_90_DAYS.md     план
  …/IMPLEMENTATION_BACKLOG.md                    T01–T20 с файлами и acceptance
  …/csv/recommended_actions.csv                  20 задач, 17 полей
  …/EMERGING_KEYWORDS.md, csv/queries_emerging.csv
  …/patches/*.diff, patches/README.md            волна 1
  …/MEASUREMENT_PLAN.md, QUICK_WINS.md           критерии успеха/отката
  …/DATA_LIMITATIONS.md                          что недоступно
  seo-audit/gsc-2026-09-17/raw/                  сырые выгрузки (не изменять)
  seo-audit/gsc-2026-09-17/scripts/              gsc_pull.py, site_crawl.py, analysis.py, emerging.py, charts.py, make_wave1_patches.py, gsc_direct_auth.py
  scripts/seo-protection.ts, docs/seo/evidence/2026-09-14/reviewed-protected-pages.json   защита лидеров
  content/seo/redirects.json                     редиректы (16 правил)
  src/shared/robots-policy.ts, scripts/generate-robots.ts, scripts/generate-sitemap.ts
F:\Claude\GPTBOT_GSC_AUDIT_HANDOFF_2026-09-18.docx   этот документ в Word
```

Первый шаг следующей сессии: раздел 1, пункты 1–5. Затем — раздел 9 (решения владельца) и раздел 7A.
