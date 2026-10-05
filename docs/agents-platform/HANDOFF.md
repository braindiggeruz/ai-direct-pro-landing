# SEO: релиз R-S1 (одна ревизия защищённых страниц), подготовлен 2026-10-05, выход пн 12.10

**Итог.** Кандидат релиза на ветке `seo/r-s1-20261012` (база `238654bf` = прод `284b0c67` + запись о выкате недели 1): коммит `533eed03`, запись проверки `c25451e3`, коммит правок по четырём ревью 05.10 (гейты, честность, SEO, язык) `a45e29d2` и запись проверки после него. Проверка `a45e29d2`: `build:production` 0 (штамп `a45e29d2`), гейт 10/10 на пересозданной ревизии, гайд по скачиванию побайтно тот же, полный `npm test` 1311/1313 — 2 известных падения lead-radar, первый экран заново замерен; подробно — `STATE.json` → `seo_r_s1_20261012.verification_review_fixes` и `build_production_review_fixes`. Не выкачен. Роадмап 04.10 §2.2, решения владельца 1, 2, 3, 5 — да. Журнал со всеми страницами, замерами и чек-листом дня релиза: `docs/seo/CHANGE_LOG_2026-10.md`, раздел «R-S1».

1. **Сделано.** Сниппеты и H1 обоих чатов и гайда по входу — строки роадмапа 2.2; H1 чатов в первом экране (`#gpt-chat-root` + `data-h1` → заголовок пустого экрана); под чатами видимый FAQ (= FAQPage), дата, лимиты «15 в день, 5 в час» (сверено с `config.ts` и живым `/api/gpt/account`); новая `/uz/blog/slayd-tayyorlash/` (без скриншотов), insho → esse на том же URL; строка на оба чата на `/`, кнопка чата на `/uz/`; `email_off` везде, кроме гайда по скачиванию; пять мостиков недели 1 теперь подставляют вопрос в чат (`CHAT_BRIDGE_ENTRIES`); анкоры и ключи VPN-статьи и `ai-chat-nima`; лимиты и учебные страницы в `llms*.txt`; [IM] C29, C30, A4; [DP] 5 строк.
2. **Защищённые.** Новая база `docs/seo/evidence/2026-10-12-r-s1/` (`reviewedChanges` + `invisibleToGate`), гейт 10/10. Поля меняются у UZ-чата, RU-чата, гайда по входу (title, H1, мета, текст; у чатов и ссылки), `/` (текст, ссылки) и VPN-статьи (текст); у `ai-chat-nima`, `chatgpt-i-claude`, `kak-oplatit`, `promptlar` — только байты (`email_off`, ключи). **Гайд по скачиванию побайтно равен сборке `284b0c67`**, CSS `index-yIq7NheZ.css` тот же.
2а. **Ревью 05.10.** Принято и сделано: «odatda» в утверждении о языке ответа UZ-чата; первый экран чатов без рекламы перевода; языковые правки обоих чатов, `/`, VPN-статьи (тавтология «yo‘riqnomasi qo‘llanmasini», «Batafsi»), слайдов и insho/esse; `lang` у абзаца и анкоров на другом языке; `audience` EducationalAudience и короткие крошки у учебных статей (поля необязательные, гайд по скачиванию тот же); настоящий снимок чата с подставленным вопросом в статье слайдов (+ og); мета слайдов 154; [IM] C33 (RU-чат ↔ статья об аналогах, у статьи сняты 2 ключа) и C34 (UZ-чат ↔ qollanma); исправлены комментарий `BASELINE`, пункт о Markdown-двойниках и числа строки на `/`. Отложено с причиной — в CHANGE_LOG, раздел R-S1, «Правки по ревью 05.10».
3. **Первый экран.** 360×640 и 375×667, оба чата: H1 216–268 px, поле ввода 476–528 / 503–555 — целиком в экране, CLS 0, один `<h1>` (замер 05.10 после правок ревью). Под H1 больше нет обещания перевода: «Matn yozish, reja tuzish…» / «Написать текст, составить план…», карточка «Reja tuzish» / «Составить план». Скриншоты: `F:/Claude/gptbot-tools/tmp/rs1-shots/`. Бандл: старт 108 679 Б (+871 Б к базе, +517 Б к сборке `284b0c67`; ≤ 3 000).
4. **Открыто для владельца до 12.10.** (а) строка на `/` в RU: на 360×640 целиком ниже сгиба (655–694 в замере 05.10, 667–706 у ревьюера), на 375×667 видны только верхние 12 px (655–694), на 390×664 и выше — в экране; оставить под кнопкой демо (по умолчанию) или поставить над ней — решает владелец; (б) ревью узбекского текста носителем (включая правки 05.10); (в) по желанию — один пример «вопрос и ответ» для снимка в статье слайдов (снимок с подставленным вопросом уже стоит); (г) бейдж «ВАШ AI-ПОМОЩНИК» — отдельное решение.
5. **День релиза (агент).** Перепроверить факты и заменить дату «04.10.2026» (или текст), `/api/gpt/account` = 15/5, при сдвиге релиза — даты страниц; выгрузить базу «85%» за 14.09–11.10; сборка в основной LF-копии, `deploy_runner.py check` → `deploy` только по команде; после — `chat-bundle-budget --record`, curl защищённых (`/cdn-cgi/l/email-protection` = 0, кроме гайда по скачиванию), IndexNow, sitemaps, дата переобхода в CHANGE_LOG.
6. **Дальше.** 19.10 — релиз главной (реферат, резюме, `chat-gpt-online`) и решение по `/uz/gpt-chat-qollanma/` (C28, C34); R-S2 (16.11) — гайд по скачиванию: снятие его исключения из `email_off`, правка `absolute()` в Markdown-двойниках (`tel:`/`mailto:`), узбекский `aria-label` таблиц; R-S3 (18.11).

---

# SEO: выкладка №1 незащищённых страниц (неделя 1 роадмапа), 2026-10-04 / 05.10

**Итог.** Кандидат выкладки на ветке `seo/week1-20261004` (база `9a8b9ff0` = origin/main), не выкачен: `8266af67` плюс коммит правок по двум ревью 05.10 (его SHA — в `STATE.json` → `seo_week1_20261004.commit`). Владелец 04.10: «делай всё согласно роадмапу» (решения 1, 2, 3, 5 — да; 4 выполнено; 7 — нет; 6 — да при условиях). Журнал со всеми страницами и проверками: `docs/seo/CHANGE_LOG_2026-10.md`, раздел «Выкладка №1».

1. **Сделано.** Карта интентов (C22 окончательно без этапа 2, история 30.09 помечена HISTORICAL; C18, C10, C6, новые пары C23–C28); коллизионные ключи сняты с русских статей и гайда C6; мостики в чат на всех 16 страницах [RM] Б6 (5 новых блоков в статьях закрывают раздел перед заданным заголовком; 2 ссылки до первого H2 на 7 контентных страницах; 1 ссылка на `/uz/`); анкоры «ChatGPT’ga kirish (login)» и «o‘zbek tilida» (включая страницу автора); раздел на `/ru/gpt-na-russkom/` без рекламы перевода; `llms.txt` и `llms-full.txt` с двумя направлениями, `/ru/` = 301, пометка «not ChatGPT» у строк с ChatGPT-запросами; два B2B-title ≤ 60.
2. **Защищённые.** 10/10, побайтовый diff их HTML со сборкой `9a8b9ff0` = 0, имена `dist/assets` те же. HTML изменился у 20 незащищённых страниц.
3. **Условие выката (мостики).** Роадмап снял дату 07–08.10: надёжность замерена 04.10. Замер D1 05.10 05:47: с перехода на Z.ai (03.10 05:09 UTC) 152 хода, без ответа 7 — **4,6% ≤ 10%**. Страховка: агент каждое утро повторяет запрос из `execution/KPI-BASELINE-2026-10-04.md` §5; если «без ответа» > 10% за любые 3 полных дня подряд — `git revert` второго коммита, затем `8266af67`, guarded-деплой, запись в CHANGE_LOG; остальные правки возвращаются отдельным коммитом без мостиков.
4. **Как выкатывать.** Только по команде владельца. Слить ветку в основную LF-копию `F:/Claude/gptbot-gsc-audit-20260917` (fast-forward от `9a8b9ff0`), там `npm run build:production` и `F:/Claude/gptbot-tools/deploy_runner.py check` → `deploy`. Не собирать выпуск в рабочей копии ветки: она выписана с CRLF (`dist/llms.txt` получает CR, `chat-bundle-budget` «the gate runs where a release is built» там падает). Сравнивать сборки только с базой из копии с теми же концами строк: CRLF — `F:/Claude/gptbot-tools/tmp/week1-baseline-dist/`, LF — `F:/Claude/gptbot-tools/tmp/week1-baseline-dist-lf/`.
5. **Проверка 05.10.** `build:production` со штампом; `seo-protection` 10/10; бюджет бандла (старт 108 162 Б, как у `9a8b9ff0`); `seo:audit` 0 critical; `tsc -b` 0; `npm test` в LF-копии 1250/1252 — два падения `tests/lead-radar.test.ts` есть и на `9a8b9ff0` (не эта выкладка); все 537 ссылок на 20 изменённых страницах живые, в ссылках в чат нет query. Подробно: `F:/Claude/gptbot-tools/tmp/week1-verification.txt`.
6. **После выката (владелец).** «Запросить индексирование» для 17 URL (порядок — в CHANGE_LOG), по 8–9 в день, обычной кнопкой.
7. **Дальше.** R-S1 12.10: подстановка вопроса для пяти новых мостиков (id в `CHAT_ENTRIES`), блок в первом экране `/uz/` и строка на `/`, анкоры и ключи защищённых страниц (VPN-статья: «ChatGPT o‘zbek tilida», «AI chat o‘zbekcha», анкор «ChatGPT kirish yo‘riqnomasi»; `ai-chat-nima…`: «ai chat o‘zbek tilida»; «chatgpt uz», «chat gpt uz», «чат gpt онлайн» на чатах), числа лимита в `llms.txt`. Релиз главной 19.10: title/H1 `chat-gpt-online`, H1 мануала и гайда C6, кандидат «голое gpt o‘zbek tilida → UZ-чат» (решить по данным).

---

# Платный AI-чат: R5+R6+R7 в проде, тёмная репетиция пройдена, 2026-10-03

**Итог.** Прод = `b69f953e`: R5–R7 (`58265bf2`) плюс включение и выключение тестового режима для тёмной репетиции (`93b1ee27` → revert `b69f953e`). Оплата выключена; от владельца нужны только live-ключи Click и Uzum (`ONBOARDING-KEYS-RU.md`). Квитанции: `docs/paid-chat/releases/R5R7-live-verification.json`, `R5R7-migration-rehearsal.json`, `R7-dark-rehearsal.json`, IndexNow `reports/indexnow-receipts/2026-10-03T09-00-38-809Z_r5r7_release.json`.

1. Экспорт D1 до 0069 (`sha256 2da8305cfdaa…`, вне Git), репетиция 0069+0070 дважды — pass; `apply` → сверка: 71, `0070`, `gpt_leads` 15 колонок, `budget` и индекс есть, заказов 0.
2. `build:production` (в штампе `ai_chat_admin`), защищённые 10/10, seo-audit 0 critical, бандл в бюджете, live-гейт `live:false`; `deploy_runner check` → `deploy`.
3. Вживую: `inert-smoke` 40/40; оболочка админки `noindex`, API 401; бот 4/4, `matches:true`; в чате 375×812 деловой вопрос → ответ `zai/glm-5.3-flash` и одна строка «Услуга GPTBot.uz»; защищённые 10/10.
4. Тёмная репетиция (Bearer, без токена админки): тестовые креды вне Git → секреты Pages `GPT_CLICK_CREDENTIALS_JSON` и `UZUM_CREDENTIALS_JSON` (их раньше не было) → режимы `test` → деплой → прогон 48/48 с учебным алертом → revert → деплой → `verify-off` 6/6. Агрегаты: live-заказов нет, тестовых 4 (возвращены/отменены), доставленных владельцу уведомлений о тестовых заказах 0.
5. Тестовые заявки с B2B-форм не отправлялись: они уходят владельцу, нужно его согласие.

**Дальше.** После 2026-10-04T22:30Z — удалить секрет `TELEGRAM_ASSISTANT_BOT_USERNAME` и передеплоить. Ключи владельца → `ingest-keys.ts --dry-run` → `--apply` → S1…S5. Юрист: раздел 8 оферты v2 и политики. По желанию: правило ограничения частоты Cloudflare на `/api/gpt/*`.

---

# Платный AI-чат к проду: сквозная проверка релиза R5+R6+R7 (WP-19…WP-25 и WP-21), 2026-10-03

**Итог.** Проверил ветку `paid-chat/prod-readiness` на `7d44b333`. В неё входят WP-24, WP-25, WP-19, WP-20, WP-22, WP-23 и WP-21 вместе с ревью, поверх R4 (`2cdea35f`), плюс слияние живого релиза Z.ai (`f3093e83`). Сверял с планом `10-PROD-PLAN.md`: §1, §3 (R5–R7, S1–S5), §4 WP-19…WP-23, §5, §6; разделы WP-24 и WP-25 в этом файле; `AGENTS.md` §2–8 и §11. **Сбоев не найдено, код не менялся.** Этот коммит записывает результаты, квитанцию репетиции миграций и чек-лист выката.

Ничего не запушено и не задеплоено. Cloudflare, GSC, боты и вебхуки не трогались. К удалённой D1 был один агрегатный SELECT только на чтение (`changed_db: false`). К проду — только GET публичных страниц. `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты, миграции 0065–0068 побайтно те же, что в R4 (`6502224c`).

**Возобновление.** Прошлую попытку этой проверки прервал лимит. После неё остались коммит слияния `7d44b333` и неотслеженный `docs/paid-chat/releases/R5R7-predeploy-rehearsal.json`. Копия лежит в `F:/Claude/gptbot-tools/backups/R5R7-verify-partial-20261003-131221/`: `tracked.patch` пустой, `untracked.tar` и `inert-smoke.mjs.r4`. Слияние проверено (ниже). Репетицию повторил, результат тот же, кроме времени восстановления.

**Слияние `7d44b333` (проверено).**
- В проде `a69ab2c0`: Z.ai GLM-5.3-Flash по предоплаченному пакету владельца (`ZAI-live-verification.json`). `origin/main` = `f3093e83`.
- Без слияния `deploy_runner.py check` отказал бы: живой коммит не был бы предком релиза. А сам R5–R7 вернул бы прод на `glm-4.7-flash` и потерял бы `ZAI_PREPAID_MODELS`.
- Код Z.ai в `HEAD` побайтно равен `origin/main`: `zai-chat.ts`, `model-provider.ts`, `config.ts`, `model-pricing.ts`, `runtime-config.ts`, `_types.ts`, `tests/gpt-zai-provider.test.ts`, `ZAI-RU.md`, `evals/zai-2026-10-03.json`. До слияния в ветке был ровно текст `7d35a803`.
- `wrangler.toml` отличается от `origin/main` только в обеих копиях `GPT_BILLING_TERMS_VERSION` (`ai-paket-2026-10-v2`), `GPT_BILLING_TERMS_APPROVED_AT` (`2026-10-03`) и комментарием WP-25.
- У слияния не было записи в HANDOFF и STATE. Она здесь.

**Результаты** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
1. `npx tsc -b` — 0; `npm run typecheck:functions` — 0; eslint по 117 TS-файлам, изменённым после R4, — 0.
2. Тесты:
   - 54 файла: 43, которые трогали WP-13…WP-25, и контрольный список задачи (`gpt-billing`, `gpt-uzum-payments`, `gpt-click-fiscal`, `gpt-zai-provider`, `gpt-chat-handoff-link`, `telegram-web-handoff`, `telegram-assistant`, `gpt-readiness`, `gpt-operations`, `gpt-routing`, `gpt-chat`, `gpt-chat-stream`, `gpt-chat-limits`, `gpt-limit-state`, `gpt-watchdog`, `gpt-model-policy`, `runtime-config`, `pages-config-parity`, `seo-content-guards`, `seo-revenue-claims`, `owner-control-center`, `signal-radar-admin-integration`, `paid-chat-e2e-rehearsal`, `paid-chat-ingest-keys`) — **792/792**;
   - весь список `npm test`, 97 файлов — **1247/1249**: падают только два известных датозависимых теста `lead-radar` (Lead Radar после R3 не менялся). Тесты, читающие `dist`, шли после свежей сборки;
   - дополнительно `pages-production-release` 8/8, `seo-page-integrity` 17/17. Вне `npm test` по-прежнему красные `agent-boundaries` (9/10) и `react-router-v8-migration` (23/26), как записано в ревью WP-19.
3. Сборка и SEO:
   - `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений** на базе `2026-10-01-paid-chat-honesty`, ревизии нет;
   - живой прод `a69ab2c0` сегодня — 10/10 через `protected-live.mts` со снятой обфускацией e-mail;
   - `seo-audit` — 123 страницы, 0 critical, 0 сирот, 45 пар RU/UZ;
   - бандл: старт 107 808 Б br (+1 185 к базе R4, порог +3 КБ), `chat-account` 10 205, `chat-lead` 5 364, `chat-tools` 6 240 (≤ 12 КБ) — в бюджете;
   - `npm run build:production` — 0, штамп: 947 файлов, в `features` есть `ai_chat_admin`; `pages-production.ts check` — pass; `wrangler pages functions build` — собран; `live-gate.ts` — `live: false`, `issues: []`.
4. **Миграции 0069 и 0070.** Квитанция — `docs/paid-chat/releases/R5R7-predeploy-rehearsal.json`.
   - Репетиция локально, два независимых прогона на копии экспорта прода R4 (`sha256 414b6cd1…`, 36,8 МБ). Копия сначала доведена до 0068, как в проде.
   - В очереди ровно `0069_gpt_events_retention.sql` и `0070_gpt_leads_budget.sql`. Второй `apply` пуст. Число строк меняется только у `d1_migrations` (+2). `quick_check` ok, нарушений внешних ключей 0. Сырой повтор 0070 падает на `duplicate column name: budget` и следов не оставляет. Bootstrap после миграций ничего не меняет.
   - Паритет: bootstrap кода строит те же колонки и индексы `gpt_events` и `gpt_leads`. Но 0070 после такого bootstrap падает, поэтому **0070 строго до деплоя Pages и без превью**.
   - Прод, один агрегатный SELECT: `d1_migrations` 69, последняя 0068; колонки `budget` и индекса `idx_gpt_events_created` ещё нет, значит, живой код их не создаёт. `gpt_events` — 6 строк, старше 93 дней — 0 (самая старая от 04.09): уборка WP-24 до 06.12 ничего не удалит.
5. `git diff --check` (от R4 и от `origin/main`) — чисто. `scan:secrets` — чисто (3 296 файлов). `test:secret-scan` 16/16. Регэксп токена Telegram и шаблоны ключей (sk-or, AKIA, PEM, ghp, xox) по диффу от R4 — 0. Значения пяти файлов `C:/Users/Borinio/.config/gptbot-private/` в диффе и в дереве не встречаются (проверены только счётчики).
6. **Локальный смоук** `wrangler pages dev dist` (127.0.0.1:8799, отдельный `--persist-to`, после проверки остановлен, процессов не осталось). Обновлённый `inert-smoke.mjs` дал 37/37 без секретов, затем 40/40 с одноразовыми локальными секретами. Проверено:
   - `/api/gpt/account`: `providers: []`, входа нет, `termsVersion` = `ai-paket-2026-10-v2`;
   - платежи, `subscribe`, вход — 404; событие `pack_viewed` — 404; `b2b_line_shown` с чужим Origin — 403;
   - админка `overview`, `payments`, `visitors`, `refund-record`, `rehearsal-session` без токена и с мусорным — 401;
   - оферты с маркером v2, политики, тарифы; четыре B2B-страницы с формой и `<select name="budget">`;
   - с Bearer: сессия репетиции — 404, тик обслуживания ok, все провайдеры выключены, `GPT_IDENTITY_SECRET` задан;
   - локальная D1 этими маршрутами не открывалась.
7. **Что R5–R7 меняет для поисковиков.** Сравнивал сборку `origin/main` (`git archive`, отдельная папка, удалена) со сборкой `HEAD`, без учёта хешей ассетов и переводов строк. Отличаются 35 HTML-страниц:
   - текст изменён на 9: `/ru/oferta/`, `/uz/oferta/` (раздел 8 v2), `/ru/politika-konfidentsialnosti/`, `/uz/maxfiylik-siyosati/`, `/ru/tarify-ai-chat/`, а также формы и кнопки четырёх B2B-страниц;
   - на остальных 26 страницах с общей формой (`scripts/lead-form.ts`) добавлен только необязательный выбор бюджета;
   - `index.html` отличается только пробелами;
   - `sitemap.xml`, `sitemap-updates.xml`, `robots.txt`, `_redirects`, `_headers`, `llms*.txt` и `.md`-копии те же. `lastmod` не сдвинут: у оферт и политик уже 2026-10-03, а у B2B-страниц текст не менялся.

**Инструменты выката (вне Git, `F:/Claude/gptbot-tools/paid-chat/`).**
- `inert-smoke.mjs` обновлён под R5–R7. Прежняя версия в резервной копии.
  - Шаг `POST /api/gpt/event {}` (после WP-20 там 400) заменён на `pack_viewed` → 404 и `b2b_line_shown` с чужим Origin → 403.
  - Добавлены 401 админки (5 маршрутов и мусорный токен) и проверка четырёх B2B-форм.
  - Редакция оферты берётся из `--terms-version` или из `wrangler.toml` текущей папки, проверяется на страницах и в `/api/gpt/account`.
  - Против нынешнего прода (R4 + Z.ai) он красный, так и задумано: там v1, нет админки и бюджета. Запускать после деплоя R5–R7 из рабочей копии релиза.
- `rehearse-migrations.mts` и `protected-live.mts` — без изменений.

**Отклонения и замечания.**
1. В плане (§3, §5) миграция R6 называлась `0069_gpt_leads_budget.sql`. На деле `0069` — индекс уборки `gpt_events` (WP-24), `0070` — колонка `budget` (WP-20). Релиз один, порядок 0069 → 0070.
2. Выбор бюджета появился на всех страницах общей формы, а не только на четырёх B2B. Так задумано в WP-20: форма одна. Защищённых страниц это не касается (10/10).
3. Условие WP-25 остаётся: перед выкатом владелец подтверждает раздел 8 оферты v2 (оплаченный пакет не возвращается). В релизе едет `ai-paket-2026-10-v2` с датой `2026-10-03`.
4. По плану релиз — по одному на R5, R6 и R7. Здесь один выкат: миграций две, новых настроек и секретов нет, Worker не меняется.

**Чек-лист выката R5+R6+R7 одним релизом — только по команде владельца.**

Общие правила:
- Git Bash, чистая рабочая копия на коммите релиза (как R4: отдельный worktree, `node_modules` — junction); `export NODE_OPTIONS=--max-old-space-size=1400`.
- Wrangler — только через `python F:/Claude/gptbot-tools/wr.py -- …`. Секреты не печатать.
- **Превью не делать**: оно пишет в боевую D1, и bootstrap кода R6 добавил бы `budget` раньше 0070.
- Новых настроек и секретов нет, Worker `gptbot-automation` не меняется.

0. **Предусловия.**
   - Команда владельца и разрешение на push.
   - Владелец подтверждает раздел 8 v2.
   - `git status` чистый; `python F:/Claude/gptbot-tools/deploy_runner.py check`: прод `a69ab2c0` — предок `HEAD`.
   - Строка в «Выкаты» `docs/seo/CHANGE_LOG_2026-10.md`.
1. **Резервная копия D1:**
   ```
   S=F:/Claude/gptbot-production-backups/paid-chat-R5R7-$(date -u +%Y-%m-%dT%H-%M-%SZ); mkdir -p $S
   python F:/Claude/gptbot-tools/wr.py -- d1 export gptbot-ai-drafts --remote --output $S/before-0069.sql
   sha256sum $S/before-0069.sql > $S/before-0069.sql.sha256
   ```
   Копия вне Git: в ней переписки.
2. **Репетиция на копии этого экспорта** (два независимых прогона в памяти):
   ```
   node --import tsx F:/Claude/gptbot-tools/paid-chat/rehearse-migrations.mts $S/before-0069.sql docs/paid-chat/releases/R5R7-migration-rehearsal.json --expect 0069_gpt_events_retention.sql,0070_gpt_leads_budget.sql
   ```
   Нужно `status: pass`: в обоих прогонах ожидают ровно 0069 и 0070, второй `apply` пуст, меняется только `d1_migrations` (+2), паритет `true`, `quick_check` = ok. `--through` не нужен: прод уже на 0068. Иначе стоп.
3. **Боевая D1, до деплоя:**
   - по желанию агрегат уборки: `SELECT COUNT(*) n, SUM(created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-93 days')) old FROM gpt_events` (03.10: 6 и 0);
   - `wr.py -- d1 migrations list gptbot-ai-drafts --remote` — ровно `0069_gpt_events_retention.sql` и `0070_gpt_leads_budget.sql`;
   - `wr.py -- d1 migrations apply gptbot-ai-drafts --remote`;
   - сверка только чтением: `SELECT (SELECT COUNT(*) FROM d1_migrations) n, (SELECT MAX(name) FROM d1_migrations) last, (SELECT COUNT(*) FROM pragma_table_info('gpt_leads')) cols, (SELECT COUNT(*) FROM pragma_table_info('gpt_leads') WHERE name='budget') budget, (SELECT COUNT(*) FROM sqlite_master WHERE name='idx_gpt_events_created') idx` → 71, `0070_gpt_leads_budget.sql`, 15, 1, 1;
   - если 0070 упал на `duplicate column name: budget`, значит, код R6 уже где-то запускался. Тогда по шапке 0070 записать файл в `d1_migrations` вручную, ничего не удалять.
4. **Сборка:**
   - `npm run build:production` — 0, в `features` штампа есть `ai_chat_admin`;
   - `npx tsx scripts/seo-protection.ts check` — 10/10;
   - `npx tsx scripts/seo-audit.ts` — 0 critical;
   - `npx tsx scripts/chat-bundle-budget.ts` — в бюджете;
   - `npx tsx scripts/release/live-gate.ts` — `live: false`, `issues: []`.
5. **Деплой:** `python F:/Claude/gptbot-tools/deploy_runner.py check`, затем `deploy`. `curl -s https://gptbot.uz/gptbot-release.json`: `commit` = `HEAD`, в `features` есть `ai_chat_admin`.
6. **Инертность, админка без сессии и B2B-формы вживую** (из рабочей копии релиза):
   ```
   node F:/Claude/gptbot-tools/paid-chat/inert-smoke.mjs https://gptbot.uz --bearer-file C:/Users/Borinio/.config/gptbot-private/gpt-billing-maintenance-secret.txt --expect-identity
   ```
   Нужно 40/40.
   - Тик ok: значит, секрет Bearer не короче 32 символов (S1 WP-21).
   - `INFO` у Click должен называть только `GPT_BILLING_MODE_CLICK`, `GPT_BILLING_LIVE_READY`, `GPT_CLICK_CREDENTIALS_JSON`; у Uzum — `GPT_BILLING_MODE_UZUM`, `GPT_BILLING_LIVE_READY`, `UZUM_API`. Даты одобрения там больше нет.
   - `curl -sI https://gptbot.uz/admin-tools/ai-chat` — 200 (оболочка SPA), `X-Robots-Tag: noindex, nofollow`, `no-store`; данные закрывает API (401).
   - Агрегаты `SELECT COUNT(*) FROM gpt_payment_orders_all` и `SELECT COUNT(*) FROM gpt_fiscal_receipts` — как до деплоя (0).
7. **Админка с сессией владельца**, если она есть. Владелец входит на `/admin-tools/login`, значение `localStorage.gptbot_admin_token` сохраняется в `C:/Users/Borinio/.config/gptbot-private/admin-token.txt` (живёт 12 ч, нужен и для слоя 2).
   ```
   curl -s -H "Authorization: Bearer $(cat C:/Users/Borinio/.config/gptbot-private/admin-token.txt)" https://gptbot.uz/api/admin/ai-chat/overview | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);console.log(o.tz,['readiness','weeks','models','alerts'].map(k=>k+'='+(o[k].ok?'ok':o[k].error)).join(' '))})"
   ```
   Ожидается `Asia/Tashkent readiness=ok weeks=ok models=ok alerts=ok`. На экране `/admin-tools/ai-chat`:
   - «Готовность» — только имена;
   - «Ходы» по неделям совпадают с агрегатом из `ADMIN-RU.md`;
   - IP-группы показаны псевдонимами;
   - роль `support_readonly` получает 403.
8. **Бизнес-строка и B2B.**
   - Browser pane 375×812, `/ru/gpt-chat/`. Первое сообщение о заказе бота («Нужен Telegram-бот для магазина, сколько стоит разработка?»). После полного ответа один раз появляется «Услуга GPTBot.uz» с кнопками «Оставить заявку», «Об услуге» и ×. В новой сессии вопрос не о бизнесе («Как написать резюме?») — строки нет. Окна пакета и входа нет, ошибок в консоли нет. Каждый вопрос — один ход модели.
   - Агрегат: `SELECT type, detail, COUNT(*) FROM gpt_ui_events WHERE org_id='gptbot-consumer' AND type LIKE 'b2b_line_%' GROUP BY type, detail` → `b2b_line_shown`/`bot` ≥ 1.
   - Четыре тестовые заявки — только с согласия владельца: уйдут уведомления. Через формы четырёх страниц с `?utm_source=test`, у каждой свой контакт, не больше двух в час с одного IP. Затем `SELECT source, json_extract(utm_json,'$.attribution.service') service, budget, COUNT(*) FROM gpt_leads WHERE created_at >= '<начало>' GROUP BY 1,2,3` → `page_form`, `ai-bot` или `chat-bot`, выбранный бюджет. Уведомления пришли со строкой «Бюджет».
9. **Бот.** `javob-setup` теперь под общей проверкой Bearer.
   - `POST /api/internal/gpt-model-probe?target=javob` — 4 прогона ok;
   - `POST /api/internal/javob-setup` без `apply` — `matches: true`.
10. **Защищённые вживую:** `node --import tsx F:/Claude/gptbot-tools/paid-chat/protected-live.mts https://gptbot.uz` → 10/10 со снятой обфускацией e-mail.
11. **Переобход.**
    - IndexNow по 9 URL: `/ru/oferta/`, `/uz/oferta/`, `/ru/politika-konfidentsialnosti/`, `/uz/maxfiylik-siyosati/`, `/ru/tarify-ai-chat/`, `/ru/ai-bot-dlya-biznesa/`, `/uz/biznes-uchun-ai-bot/`, `/ru/gpt-dlya-biznesa/`, `/ru/luchshie-razrabotchiki-chat-botov-tashkent/`. Список — в `<tmp>/r5r7-urls.json`, затем `python F:/Claude/gptbot-tools/indexnow_list.py <tmp>/r5r7-urls.json <HEAD> r5r7_release "R5-R7: offer v2, policies, B2B lead forms"`.
    - `py -3 -W ignore F:/Claude/gptbot-tools/gsc_tools.py submit https://gptbot.uz/sitemap.xml https://gptbot.uz/sitemap-updates.xml`.
    - 26 страниц, где прибавился только выбор бюджета, отправлять не нужно.
12. **Квитанции:**
    - `npx tsx scripts/chat-bundle-budget.ts --record` из сборки релиза;
    - `docs/paid-chat/releases/R5R7-live-verification.json`: sha экспорта, репетиция, `applied_remote`, сверка, деплой, смоук 40/40, админка, бизнес-строка и заявки, бот, 10/10, IndexNow;
    - CHANGE_LOG, HANDOFF, STATE — одним коммитом.
- **Откат:** `git revert` и guarded-деплой. 0069 (индекс) и 0070 (колонка) остаются: прежний код их не читает. Оферта вернётся к v1, открытых счетов нет, оплата выключена.

**Слой 2 тёмной репетиции (R7): после выката и проверок выше,** по `docs/paid-chat/DARK-REHEARSAL-RU.md`. Предусловие: ни один провайдер не в `live`.

| Настройка (обе копии `wrangler.toml`) | Сейчас | На время прогона | После |
|---|---|---|---|
| `GPT_BILLING_MODE_CLICK` | `""` | `"test"` | `""` |
| `UZUM_API` | `""` | `"merchant"` | `""` |
| `GPT_BILLING_MODE_UZUM` | `""` | `"test"` | `""` |
| Секреты Pages `GPT_CLICK_CREDENTIALS_JSON` (`test`), `UZUM_CREDENTIALS_JSON` (`merchant.test`) | нет | кладутся | остаются: без режима инертны |

1. **Токен админки** — как в п. 7. Без него Bearer-путь, но без проверок списка оплат.
2. **Тестовые креды:** `node --import tsx scripts/paid-chat/dark-rehearsal.ts credentials --out C:/Users/Borinio/.config/gptbot-private/dark-rehearsal`.
3. **Секреты.**
   - `wr.py -- pages secret list --project-name ai-direct-pro-landing`: обоих имён быть не должно. Если хоть одно есть, не перетирать: собрать через `scripts/paid-chat/ingest-keys.ts --apply --test-credentials <папка>`.
   - Иначе:
     ```
     python F:/Claude/gptbot-tools/wr.py --stdin C:/Users/Borinio/.config/gptbot-private/dark-rehearsal/GPT_CLICK_CREDENTIALS_JSON.json -- pages secret put GPT_CLICK_CREDENTIALS_JSON --project-name ai-direct-pro-landing
     python F:/Claude/gptbot-tools/wr.py --stdin C:/Users/Borinio/.config/gptbot-private/dark-rehearsal/UZUM_CREDENTIALS_JSON.json -- pages secret put UZUM_CREDENTIALS_JSON --project-name ai-direct-pro-landing
     ```
   - Переменных Pages должно остаться ≤ 64.
4. **Временный коммит.**
   ```
   sed -i -e 's/"GPT_BILLING_MODE_CLICK":""/"GPT_BILLING_MODE_CLICK":"test"/' -e 's/"UZUM_API":""/"UZUM_API":"merchant"/' -e 's/"GPT_BILLING_MODE_UZUM":""/"GPT_BILLING_MODE_UZUM":"test"/' -e 's/^GPT_BILLING_MODE_CLICK = ""$/GPT_BILLING_MODE_CLICK = "test"/' -e 's/^UZUM_API = ""$/UZUM_API = "merchant"/' -e 's/^GPT_BILLING_MODE_UZUM = ""$/GPT_BILLING_MODE_UZUM = "test"/' wrangler.toml
   ```
   - `git diff wrangler.toml` — ровно 4 строки: строка JSON и три строки таблицы. Проверено на копии файла; `sed` в Git Bash пишет LF, при `core.autocrlf=true` Git этого не видит.
   - `runtime-config` и `pages-config-parity` зелёные. `gpt-live-readiness` «the committed configuration is inert» красный, так задумано.
   - Коммит `chore(release): dark rehearsal settings (temporary)`, затем `npm run build:production`, `deploy_runner.py check` и `deploy`.
   - `curl -s https://gptbot.uz/api/gpt/account` — `providers: []`: посетитель по-прежнему ничего не видит.
5. **Прогон:**
   ```
   node --import tsx scripts/paid-chat/dark-rehearsal.ts run --site https://gptbot.uz --credentials C:/Users/Borinio/.config/gptbot-private/dark-rehearsal --admin-token-file C:/Users/Borinio/.config/gptbot-private/admin-token.txt --bearer-file C:/Users/Borinio/.config/gptbot-private/gpt-billing-maintenance-secret.txt --drill
   ```
   Результат — `docs/paid-chat/releases/R7-dark-rehearsal.json`, `status: pass`.
   - Click: сессия репетиции, заказ, Prepare −1/−2/0, два Complete, повтор −4, пакет на 300, строка админки `test`/`paid`, «Отметить возврат» и его повтор, пакет отозван.
   - Uzum Merchant: код оплаты и 22 шага `uzum-sandbox-rehearsal`.
   - Учебный алерт (`drill`) уходит раз в час UTC. Если `drill not sent`, повторить в следующем часу.
6. **По желанию — владелец:** «Сессия репетиции» в админке, экраны окна 375×812 на RU и UZ, вход через бота настоящий. Cookie репетиции никому не передавать.
7. **Выключение:** `git revert --no-edit <временный коммит>`, затем `npm run build:production`, `deploy_runner.py check` и `deploy`.
8. **Проверка выключения:** `node --import tsx scripts/paid-chat/dark-rehearsal.ts verify-off --site https://gptbot.uz --admin-token-file C:/Users/Borinio/.config/gptbot-private/admin-token.txt` (если 12 ч прошли — `--bearer-file …`). Фаза `after_off` дописывается в ту же квитанцию. `inert-smoke.mjs … --expect-identity` снова 40/40.
9. **Агрегаты** из `lead_aggregates` квитанции через `wr.py -- d1 execute gptbot-ai-drafts --remote --json --command "<sql>"`:
   - live-строк заказов нет;
   - шагов окна в `gpt_ui_events` с начала прогона 0, если владелец не ходил по экранам;
   - доставленных владельцу событий тестовых заказов 0.

   Владелец подтверждает: «AI paket: …» не приходило, учебный алерт пришёл.
10. **Квитанция** `R7-dark-rehearsal.json`, CHANGE_LOG, HANDOFF, STATE — одним коммитом. Удалить `admin-token.txt`.

**Что владелец видит в конце.**
- **На сайте:**
  - оферта и политики новой редакции: оплаченный пакет не возвращается, кроме ошибочного списания; получатели данных названы поимённо;
  - на четырёх B2B-страницах форма заявки с необязательным бюджетом (тот же выбор есть на остальных страницах с формой);
  - в чате после первого вопроса о боте, сайте, рекламе или CRM один раз появляется строка «Услуга GPTBot.uz»;
  - окна «AI paket», оплаты и входа через бота посетители не видят; чат отвечает через Z.ai GLM-5.3-Flash, как сейчас.
- **В админке `/admin-tools/ai-chat`:**
  - разделы: готовность (чего не хватает для live), недели, модели, алерты, оплаты (тестовые строки помечены «тест» и «репетиция»), IP-группы псевдонимами;
  - кнопки «Отметить возврат» и «Сессия репетиции». После выключения вторая отвечает 409 `no_test_provider`.
- **В Telegram:** один учебный алерт, ни одного «AI paket: …», заявки приходят со строкой «Бюджет».
- **Дальше от владельца:** только `click.json` и `uzum.json` в `F:/Claude/gptbot-keys-inbox/` по `ONBOARDING-KEYS-RU.md` (Z.ai уже работает). Затем S1–S4.

**Открыто.**
1. Подтверждение раздела 8 v2 (юрист, вопрос 2 в `OFFER-RU.md`) и вычитка UZ носителем — до выката.
2. S3 и S4 WP-21: правило rate limiting Cloudflare для `/api/gpt/*` (действие владельца).
3. Кредитов OpenRouter нет, `GPT_FREE_TIER_PAID_PRIMARY` = `false`; основной провайдер — Z.ai.
4. Срок пакета в UTC (ревью WP-18, п. 2). Два датозависимых теста `lead-radar`, два старых красных теста вне `npm test`.

**Дальше.** Выкат R5–R7 по чек-листу выше и слой 2 по команде владельца. Затем ключи по `ONBOARDING-KEYS-RU.md`.

---

# Платный AI-чат: WP-21 — ревью безопасности всего платного контура (R7), 2026-10-03

**Итог.**
- Коммита WP-21 не было. Исполнитель сообщил, что `/security-review` не запустилась: рабочая папка его сессии не Git-репозиторий. Он ничего не закоммитил, дерево было чистым на `2dec6673`. Поэтому ревью-проход сделал WP-21 сам: ручной проход по диффу `f53cabcb..2dec6673` (88 коммитов, 592 файла) по чек-листу §4 WP-21. Коммит — `fix(paid-chat): address WP-21 review findings`, `d773d89f` (`d773d89f8e1c3df95a3cf03610d455feea6c3426`); следующий только записывает его SHA (D-006).
- Отчёт: **`docs/paid-chat/SECURITY-REVIEW-2026-10.md`** — чек-лист плана с доказательствами по каждому пункту, находки S1–S10 с решениями, `npm audit`, что осталось вне ревью.
- **Открытых High и Medium нет** (приёмка плана). Low: два исправлены с тестами (S1, S2), по остальным принято решение.
- Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались, `webhook.ts` и `TELEGRAM_BOT_TOKEN` тоже. Миграций и настроек нет. Защищённые страницы 10/10 без изменений, страницы GPTBot Market не тронуты.

**Возобновление.** `git status` в начале — чисто на `2dec6673`. Незаконченной работы WP-21 не было, резервная копия не понадобилась.

**Что держится (проверено, подробно в отчёте).**
- **Подписи за постоянное время:** Click MD5, Basic Uzum Merchant, Basic Payme, секрет вебхука бота, Bearer внутренних маршрутов, HMAC cookie репетиции.
- **Деньги:**
  - сумма строго 2 000 000 тийинов в UZS: `CHECK` в обеих таблицах и проверки Click, Uzum Merchant и Uzum Checkout; при регистрации Checkout `currency` 860;
  - `UNIQUE(org_id,provider,mode,external_id)`, журнал с `version`, повторы колбэков ничего не меняют.
- **Инертность:** без режима и кредов — 404 до тела и D1.
- **Хосты и ссылки:**
  - адреса Uzum — https и allowlist;
  - Click на прошитом хосте; ключи платежей и крон ходят с `redirect: "manual"`;
  - одно правило ссылок чеков для сервера и панели.
- **Cookie и CSRF:** `__Host-` и `SameSite=Lax`; проверка `Origin` на всех POST аккаунта, входа, оплаты и событий.
- **Админка и репетиция:** роль `platform_owner` на всех маршрутах админки; репетиция только в `test`; синтетический аккаунт не покупает в live.
- **Соль и бот:** соль и перекей на месте, удаление переписки выключено; в боте нет цен и оплат; в именах продукта нет GPT и Plus.
- **Код:** SQL-инъекций нет (все интерполяции — константы), XSS нет (markdown экранируется до разметки).

**Исправлено.**
1. **S1 — Bearer любой длины.** Семь внутренних маршрутов, два из них возвращают деньги, принимали `GPT_BILLING_MAINTENANCE_SECRET` любой длины. Весь остальной биллинг считает секрет короче 32 символов незаданным.
   - Теперь одна проверка `internalAuthorized` в новом `functions/lib/gpt-chat/internal-auth.ts`: не короче 32 символов, сравнение за постоянное время. Она заменила семь копий кода в `gpt-billing-maintenance`, `gpt-click-reversal`, `gpt-click-refund-record`, `gpt-uzum-refund`, `gpt-rehearsal-session`, `gpt-model-probe` и `javob-setup`.
   - Значение в проде — 64 hex: по квитанции R4 живой тик не назвал этот секрет недостающим, так что крон не ломается.
   - `ALERTS-RU.md` дополнен одной фразой.
2. **S2 — поле кода входа без маскировки Webvisor.** Поле 6-значного кода (режим `code` входа через бота) и его форма не несли `ym-disable-keys` и `ym-disable-submit`, которых договор Metrika требует на каждом поле ввода: Webvisor включён. Теперь несут (`BotLoginScreen.tsx`).

Тесты:
- новый `tests/paid-chat-security-review.test.ts` (2 теста). Короткий секрет на всех семи маршрутах даёт 403: тело не прочитано, D1 не тронута. Секрет из 32 символов пропускает только свой Bearer;
- `yandex-metrika`: экран входа в списке `MASKED` и отдельный тест на каждый `<input>`;
- `telegram-assistant`: `javob-setup` с коротким секретом → 403, тестовые секреты удлинены до 32 и более.

Мутации (снятие проверки длины, снятие любого из двух классов) тесты роняют. `package.json` `test` += новый файл.

**Не исправлял, с решением (подробно в отчёте, раздел 3).**
- **S3.** Лимиты по IP берут полный IPv6 без /64. Деньги ограничены бюджетом $1 в сутки. Группировка меняет все хеши, это отдельный WP; сначала правило Cloudflare или Turnstile.
- **S4.** У `/api/gpt/event` нет общего потолка (пункт из ревью WP-20). Нужно правило rate limiting Cloudflare, это действие владельца.
- **S5.** `chat` без проверки `Origin`. Пакет защищает `SameSite=Lax`, тратится только бесплатная квота IP.
- **S6.** «AI paket: cancelled» владельцу на каждый закрытый live-счёт: до 10 сообщений в час на аккаунт. Пересмотреть после первых недель live.
- **S7.** Вход pick и пересланная ссылка — по L11, переключатель `code` готов.
- **S8.** OIDC, OpenRouter и Z.ai — фиксированные хосты с редиректом по умолчанию. При включении OIDC добавить `redirect: "manual"`.
- **S9** (Info). `sameSecret` раскрывает длину значения.
- **S10** (Info). Cookie репетиции — предъявительский токен, открывает только `test`.

**Отклонения от плана (и почему).**
1. **`/security-review` не запускалась.** Причина та же, что у исполнителя: папка сессии — не репозиторий. Вместо неё ручной проход по тому же диффу и чек-листу, с грепом по всем исходникам (SQL-интерполяции, `fetch` и `redirect`, `console.*`) и тестами.
2. **`npm audit --omit=dev` запущен на копии.** В репозитории `yarn.lock`, а yarn на машине нет. Отчёт снят на копии `package.json` и `yarn.lock` вне Git (`npm i --package-lock-only --ignore-scripts --legacy-peer-deps`, все 17 прямых зависимостей совпали с `yarn.lock`). Итог: 0 уязвимостей на 117 продовых пакетов.
3. **Коммит называется `fix(paid-chat): address WP-21 review findings`**, как велит задача ревью: отдельного коммита WP-21 не было.

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0. eslint по 12 изменённым файлам — 0. `git diff --check` чисто.
2. Тесты:
   - новые и изменённые: `paid-chat-security-review` 2/2, `yandex-metrika` 72/72, `telegram-assistant` 77/77;
   - маршруты с новой проверкой: `gpt-rehearsal` 5/5, `gpt-click-fiscal` 14/14, `gpt-model-policy` 14/14, `gpt-operations` 8/8, `gpt-watchdog` 15/15, `gpt-hash-salt` 11/11, `gpt-retention` 4/4, `gpt-admin-ai-chat` 13/13, `gpt-uzum-payments` 26/26, `gpt-uzum-merchant` 13/13, `gpt-uzum-rehearsal` 3/3, `paid-chat-e2e-rehearsal` 5/5, `paid-chat-dark-rehearsal` 4/4;
   - регресс: `gpt-live-readiness` 10/10, `gpt-bot-login` 17/17, `gpt-pack-dialog` 15/15, `telegram-web-login` 13/13, `gpt-billing` 21/21, `secret-scan` 16/16, `web-security-hardening` 13/13, `gpt-backend-security` 31/31, `gpt-api-cors` 2/2, `runtime-config` 4/4, `pages-config-parity` 7/7.
3. `scan:secrets` — чисто (3 292 файла). Регэксп токена Telegram по диффу — 0.
4. `npm run build:fast` — 0. `seo-protection check` — **10/10 без изменений** на базе `2026-10-01-paid-chat-honesty`. Бандл-гейт в бюджете: старт 107,8 КБ br, ленивые части ≤ 10,2 КБ.

**Для релиза R7.** Ничего не включается: правка едет со сборкой R5–R7, миграций и настроек нет. После деплоя проверить, что тик обслуживания не получает 403 (раз в 15 минут, лог Worker'а `gpt_billing_maintenance_failed`). При 403 значение секрета в Pages короче 32 символов: сгенерировать новое по `ALERTS-RU.md` и положить в Pages и в Worker.

**Открыто.**
1. Действия владельца по S3 и S4: правило rate limiting Cloudflare для `/api/gpt/*`, по желанию Turnstile. Здесь Cloudflare не менялся.
2. Ключей владельца нет. Даты одобрения политик и раздела 8 оферты v2 юристом нужны гейту live (как раньше).
3. Два датозависимых теста `lead-radar` — как раньше.

**Дальше.** Релиз R5–R7 (WP-19…WP-25, WP-21) по команде владельца, затем ключи по `ONBOARDING-KEYS-RU.md` — по решению ведущего.

---

# Платный AI-чат: ревью WP-23 (runbook ключей и скрипт `ingest-keys`), 2026-10-03

**Итог.** Проверил коммиты WP-23 `41d392be` (8 файлов) и `a39a85dc` (SHA в STATE). Сверял с §4 WP-23 и §7 плана `10-PROD-PLAN.md`, с §1, §2 (L9, L10, L13, L14), §3 и §6, а также с `AGENTS.md` §2–8 и §11. Дерево было чистым, незаконченной работы не было. **Утечек значений, секретов в Git и обходов гейта нет.** Код прода, миграции и настройки WP-23 не менял. Исправлены один дефект порядка `--apply` и два места, где скрипт молча терял ключи (`fix(paid-chat): address WP-23 review findings`). Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались, `webhook.ts` и `TELEGRAM_BOT_TOKEN` тоже. `--apply` против Cloudflare не запускался.

**Что держится (проверено).**
- **Значения не печатаются.** Ни в отчёте, ни в сообщении о сломанном JSON, ни в ошибке wrangler: из неё вырезаются значение, его части и токен. Имя поля из файла владельца печатается, только если оно похоже на имя.
- **`--dry-run`** не пишет файлов, не запускает процессов и не читает `F:/Claude/.env`. `--cloudflare-env` вместе с `--dry-run` — ошибка.
- **Секрет идёт только через stdin.** Проверено по исходнику wrangler 4.118: в неинтерактивном режиме `pages secret put` читает значение из stdin. `pages secret list` печатает строки `  - NAME: Value Encrypted`, их скрипт и разбирает.
- **Схемы совпадают с парсерами сайта** (`clickCredentials`, `merchantCredentials`, `checkoutCredentials`, `uzumFiscalApiKey`, `uzumBaseUrl`, `uzumFiscalBaseUrl`). Собранный секрет читается ими же, лимиты 4096 и 8192 те же. Числа больше 2^53 отклоняются, а не округляются.
- **`wrangler.toml`.** Все настройки, которые пишет скрипт, есть в обеих копиях. Вложенная таблица — последняя секция файла. `UZUM_API` без режима инертен: маршруты Uzum отвечают 404 (`providerMode`). Тест «inert» `UZUM_API` не проверяет, так что коммит приёма его не роняет.
- **Отклонения 1–8 обоснованы.** Дата одобрения v1 из `business.json` не перетирает дату редакции v2 (`OFFER-RU.md`, ревью WP-25). Срок хранения и контакт меняют страницы, в том числе защищённые. `wr.py --stdin` требует файл с секретом на диске.
- **Приёмка на настоящей папке.** `--dry-run` — код 0, 0 проблем, `no change`. В выводе только имена.
- Слов Plus/Pro/obuna/подписка в новых текстах нет, кроме правила L16, которое их перечисляет. BOM, CRLF и NBSP нет.

**Исправлено.**
1. **`--apply` клал секреты, а потом падал на `wrangler.toml`.** Адрес Uzum с апострофом в пути (`https://chk.uzumcheckout.uz/api'v1`) сайт принимает (`uzumBaseUrl`), а `setRuntimeSettings` записать не может. `--dry-run` показывал 0 проблем и «will change». `--apply` клал `UZUM_CREDENTIALS_JSON` и падал до записи файлов. Получался приём наполовину, хотя runbook обещает обратное.
   - Теперь новый `wrangler.toml` собирается в `examine()` (поле плана `toml`).
   - Ошибка видна уже в `--dry-run` как проблема. `--apply` отказывает до первого `put`, а после `put` пишет готовый текст.
2. **Пустая или неверная папка `--test-credentials` тихо пропускалась.** `readTestCredentials` на несуществующую папку отдаёт два `null`. Приём шёл дальше, и тестовые блоки репетиции из секретов пропадали. Предупреждение было только при `--apply` и его не останавливало.
   - Теперь это ошибка до чтения папки ключей.
   - Runbook: если репетиции не было, ключ `--test-credentials` не указывать.
3. **Файл только с блоком `test` стирал боевые ключи без предупреждения.** `put` заменяет секрет целиком, а владелец по runbook удаляет файлы после приёма. Новый `click.json` с одним `test` (например, когда Click выдаст тестовый сервис) убрал бы из секрета `live`. После деплоя Click в live перестал бы продавать.
   - Значения секрета в Pages прочитать нельзя. Поэтому скрипт перед `put` предупреждает, если секрет уже есть в Pages, а в новом значении нет блока `live`. Так же он уже предупреждал про `test`.
   - Готовность после приёма в этом случае называет `GPT_CLICK_CREDENTIALS_JSON.live`, тест это проверяет.
   - В runbook правило: файл всегда кладётся целиком.

Каждый случай покрыт тестом. Если откатить любое из трёх исправлений, тест падает (проверено).

**Не исправлял (не мешает R7).**
1. `pages secret list` перечисляет только секреты (`secret_text`), а гейт деплоя — все переменные Pages. Если какое-то имя из `LIVE_SECRETS` лежит в Pages обычной переменной, готовность после `--apply` назовёт его недостающим. Это ошибка в безопасную сторону. По квитанциям R1–R4 это секреты.
2. Офлайн-готовность `--dry-run` подставляет заглушки вместо секретов вне папки. Она пишет «nothing missing for live» и рядом строку `unconfirmed`, их нужно читать вместе.
3. Runbook запрещает собирать блок `test` из боевых ключей. Скрипт одинаковый `secret_key` в `live` и `test` пропускает с пометкой (площадка Click на боевом сервисе). Решение за ведущим.
4. Тест «nothing missing for live» считает на `NOW` = 2026-10-20. Если `GPT_BILLING_TERMS_APPROVED_AT` станет позже этой даты, `NOW` в тесте нужно сдвинуть.
5. WP-21 (ревью безопасности) ещё не сделан. Два датозависимых теста `lead-radar` — как раньше.

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0. Три TS-файла (скрипт, тест, `live-gate.ts`) разовым strict-tsconfig вне репозитория с `noUnused*` — 0 своих ошибок. eslint по ним — 0. `git diff --check` чисто.
2. `paid-chat-ingest-keys` 9/9 (с новыми случаями). Регресс: `legal-oferta` 18/18, `paid-chat-dark-rehearsal` 4/4, `gpt-live-readiness` 10/10, `runtime-config` 4/4, `pages-config-parity` 7/7, `secret-scan` 16/16.
3. `--dry-run` на `F:/Claude/gptbot-keys-inbox` — код 0, 0 проблем. С несуществующей папкой `--test-credentials` до исправления — код 0 (дефект 2).
4. `scan:secrets` — чисто (3 290 файлов). Регэксп токена Telegram по диффу — 0.
5. `npm run build:fast` — 0. `seo-protection check` — **10/10 без изменений** на базе `2026-10-01-paid-chat-honesty`.

**Для релиза R7.** Как в разделе WP-23 ниже, по `docs/paid-chat/ONBOARDING-KEYS-RU.md`. Отличия:
- `--test-credentials` указывать, только если тёмная репетиция была;
- владелец кладёт каждый файл целиком;
- если скрипт написал «replaced without a live block», не деплоить: сначала взять у владельца полный файл и принять его снова. Секрет начинает действовать только с деплоем.

**Дальше.** WP-21 (ревью безопасности) — по решению ведущего.

---

# Платный AI-чат: WP-23 — runbook ключей и скрипт приёма `ingest-keys` (R7), 2026-10-03

**Итог.**
- WP-23 сделан на ветке `paid-chat/prod-readiness` поверх `766cc7d3` (ревью WP-22), коммит `41d392be` (`41d392beaaf7823883cd9fb55f294bc096ea7767`). Следующий коммит только записывает его SHA в STATE и сюда (правило D-006).
- **`scripts/paid-chat/ingest-keys.ts`** принимает ключи владельца из папки вне Git (`F:/Claude/gptbot-keys-inbox`): `click.json`, `uzum.json`, `zai.txt` и `business.json`.
  - `--dry-run` проверяет файлы по схемам. Печатает имена полей с `ok`, `missing`, `invalid (expected …)` или `unknown field`, план и `liveReadiness()` по провайдерам. Ничего не пишет, процессов не запускает, ключей Cloudflare не читает.
  - `--apply` отказывает при любой проблеме. Иначе читает имена секретов Pages, кладёт `GPT_CLICK_CREDENTIALS_JSON`, `UZUM_CREDENTIALS_JSON` и `ZAI_API_KEY` через stdin `wrangler pages secret put`. Затем пишет несекретное: обе копии runtime-конфига `wrangler.toml` и `content/global/legal-entity.json`. В конце печатает `liveReadiness()` против имён в Pages и напоминает владельцу удалить файлы.
  - Значения не печатаются нигде, в том числе в сообщении о сломанном JSON и в ошибке wrangler.
- **`docs/paid-chat/ONBOARDING-KEYS-RU.md`** — runbook по §7 плана:
  - для владельца простыми словами: куда класть файлы, их формат, что ещё нужно от него;
  - для агента точные команды: приём, коммит, выкат;
  - порядок включения S1–S4: тест → репетиция → live → одна покупка владельца → возврат этой покупки через кабинет провайдера и «Отметить возврат» в админке; покупателям по оферте деньги не возвращаются;
  - S5: переключатель Z.ai и его оценка.
- **`tests/paid-chat-ingest-keys.test.ts`** — 9 тестов: схемы, отсутствие значений в выводе, `--dry-run` ничего не пишет, `--apply`, отказы, тестовые блоки репетиции, запреты, wrangler-обвязка, запись `wrangler.toml`.
- Код прода, миграции, настройки, `wrangler.toml` и реквизиты не менялись. Защищённые страницы 10/10 без изменений. Страницы GPTBot Market, `webhook.ts` и `TELEGRAM_BOT_TOKEN` не трогались.
- Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались, запросов к проду не было. `--apply` против Cloudflare не запускался: в тестах он работает на копии файлов репозитория с фейковым хранилищем секретов.

**Возобновление.** `git status` в начале — чисто на `766cc7d3`. Резервных копий WP-23 в `F:/Claude/gptbot-tools/backups/` нет, незаконченной работы не было.

**Что сделано.**
1. **Схемы** (`SCHEMAS` в скрипте; форматы взяты у парсеров сайта):
   - `click.json`: `live` — все четыре поля (`service_id`, `merchant_id`, `secret_key`, `merchant_user_id`); `test` — `service_id` и `secret_key`, остальное по желанию. Нужен хотя бы один блок.
   - `uzum.json`: `api` (`checkout` или `merchant`, и раздел с тем же именем обязателен); разделы `checkout`, `merchant` и `fiscal` по режимам; `baseUrls` проверяет та же функция, что и сайт (https, хосты из allowlist); `autofiscal` — только `true` или `false`. `serviceTitle` сверяется с правилом L16, `accountField` должен быть `account`.
   - `zai.txt`: одна строка. BOM и перевод строки отбрасываются.
   - `business.json`: реквизиты, `fiscal` (ИКПУ, упаковка, НДС, ИНН, причём ИНН = СТИР), `lawyerApprovedAt`, `retentionDays`.
   - Неизвестное поле — проблема: опечатка иначе тихо потеряла бы значение.
   - Собранный секрет читается парсером сайта (`clickCredentials`, `providerConfigured`, `checkoutCredentials`, `merchantCredentials`, `uzumFiscalApiKey`). Если парсер его отвергает, это тоже проблема. В секрет Uzum идут только учётные данные: `serviceId` всегда числом, без `api` и адресов.
2. **Реквизиты.** Итоговую сущность проверяет `legalEntityIssues` из `scripts/legal-entity.ts`, та же проверка, что у страниц и гейта.
   - Название, адрес и директор строкой принимаются, только если совпадают с русским текстом `legal-entity.json` без учёта регистра, кавычек и пробелов. Вёрстка на страницах («Общество… «FREEDOM IS HEAVEN»») остаётся.
   - Новый текст нужно давать как `{"ru","uz"}`, чтобы узбекская страница не осталась со старым именем.
   - При изменении `_source` дописывает, когда и откуда пришли новые поля.
   - E-mail и телефон только сверяются с `content/global/site.json`, единым контактом студии на всех страницах.
3. **`wrangler.toml`.** `setRuntimeSettings` пишет только существующие ключи и сразу в обе копии: упакованный JSON и вложенную таблицу. Значения с кавычками, обратной косой чертой или управляющими символами он отклоняет.
4. **Секреты.** `wranglerPagesSecrets` запускает wrangler из `node_modules` с `--project-name ai-direct-pro-landing`.
   - Значение передаётся только через stdin.
   - Из `--cloudflare-env` берутся только `CLOUDFLARE_ACCOUNT_ID` и `CLOUDFLARE_API_TOKEN`.
   - Вывод при ошибке очищается от значения, его частей и токена; показываются три последние строки.
   - Если `put` упал, скрипт останавливается до записи файлов репозитория.
5. **`--test-credentials <папка тёмной репетиции>`.** Блоки Click `test` и Uzum `merchant.test` из `dark-rehearsal.ts credentials` идут в новые секреты там, где у владельца своих тестовых блоков нет. Так приём не выбрасывает тестовые блоки (обещание runbook WP-22). Если секрет уже есть в Pages, а тестового блока в новом значении нет, скрипт об этом предупреждает.
6. **Готовность.**
   - По каждому провайдеру `liveReadiness()` с включёнными переключателями S2/S4. Переключатели печатаются отдельной строкой.
   - Офлайн секреты вне папки подставляются заглушками (`standIns`, теперь экспорт `scripts/release/live-gate.ts`) и перечислены как `unconfirmed`, как `deferred` у гейта.
   - Z.ai — через `aiChatReadiness()`, ту же логику, что у «Готовности» в админке.
7. **Мелочи:** `package.json` `test` += новый файл; `DARK-REHEARSAL-RU.md` ссылается на `--test-credentials`.

**Отклонения от плана (и почему).**
1. **`lawyerApprovedAt` не пишется в `GPT_BILLING_TERMS_APPROVED_AT`.** План §7 (S2) это подразумевал. Но с WP-25 дата относится к редакции оферты, а `business.json` хранит одобрение v1 (2026-10-01). Запись откатила бы дату v2 (2026-10-03). Скрипт сравнивает даты и предупреждает («раньше: юрист не видел текущей редакции»). Дату ставят по `OFFER-RU.md`.
2. **`retentionDays` и контакт не пишутся.** `GPT_MESSAGES_RETENTION_DAYS` меняет политику в том же релизе (`SALT-RU.md`). E-mail и телефон стоят на каждой странице, включая защищённые, и в R5–R7 их не меняют.
3. **Формат `uzum.json` шире плана:** необязательные `autofiscal` (→ `UZUM_AUTOFISCAL`) и `baseUrls.fiscalTest` (→ `UZUM_FISCAL_TEST_BASE_URL`). Без них S4 Checkout требовал бы ручной правки.
4. **Wrangler напрямую, а не `wr.py`.** `wr.py --stdin` принимает только файл, а значение не должно ложиться на диск. Обвязка повторяет его поведение: два имени из `F:/Claude/.env`, вывод с вырезанными значениями.
5. **Владелец удаляет секретные файлы после локальных шагов**, которым они нужны: песочница Uzum Checkout и Postman Click. Это сразу после приёма, а не до него.
6. **Z.ai (S5) описан как есть.** Он уже включён по решению владельца 03.10 (быстрая проверка агента, не слепая оценка). Оценка с двумя носителями UZ и одним RU и порог UZ ≥ 3,5 остаются шагом S5, откат — `GPT_MODEL_PROVIDER="openrouter"`.
7. **Контакт студии (L14)** уже один параметр с R3 (`studioTelegram` в `site.json`), менять нечего.
8. Команда — `node --import tsx …`, как у остальных скриптов `scripts/paid-chat/`. `npx tsx` тоже работает.

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0. Три TS-файла разовым tsconfig вне репозитория (strict, noUnused): 0 своих ошибок; подложенная ошибка ловится. eslint по ним — 0.
2. `paid-chat-ingest-keys` 9/9. Регресс: `legal-oferta` 18/18, `paid-chat-dark-rehearsal` 4/4, `gpt-live-readiness` 10/10, `runtime-config` 4/4, `pages-config-parity` 7/7, `secret-scan` 16/16. Весь список `npm test` по одному файлу — 96 файлов, **1241/1243**: падают только два известных датозависимых теста `lead-radar`.
3. **Мутации** (каждая откатывалась из копии вне репозитория) — 15 из 15 ловятся:
   - значение в выводе;
   - текст парсера JSON в выводе;
   - запись в `--dry-run`;
   - одна копия конфига;
   - значение в argv;
   - нет вырезания значений;
   - тестовые блоки не сливаются;
   - строгое сравнение реквизитов;
   - неизвестные поля пропускаются;
   - `--apply` при проблемах;
   - файлы до `put`;
   - `serviceId` строкой;
   - ИНН ≠ СТИР;
   - папка ключей внутри репозитория;
   - токен не передан wrangler.
4. **Приёмка на настоящей папке:** `--dry-run --inbox F:/Claude/gptbot-keys-inbox` (и с `--test-credentials`) — код 0, 0 проблем, план `no change`. Все поля `business.json` `ok`, имя в верхнем регистре совпало с вёрсткой. `lawyerApprovedAt` раньше даты v2 — предупреждение. Дерево после прогона чистое, длинных цифр в выводе нет. Без аргументов — usage, код 1. `wrangler pages secret put --help` (локально) подтверждает форму команды.
5. `scan:secrets` — чисто (3 290 файлов). Регэксп токена Telegram и шаблоны ключей по диффу — 0. `git diff --check` чисто. BOM, CRLF и NBSP в новых файлах нет.
6. `npm run build:fast` — 0. `seo-protection check` — **10/10 без изменений** на базе `2026-10-01-paid-chat-honesty`. `live-gate.ts` — закоммиченный конфиг `issues: []`, `--assume-live click` называет только `legalReviewedAt` двух политик.

**Для релиза R7.** WP-23 ничего не включает: скрипт и runbook едут со сборкой R5–R7, миграций и настроек нет. Когда владелец положит ключи — `ONBOARDING-KEYS-RU.md`, раздел 1:
1. `--dry-run` (с `--test-credentials`, если ведущий проводил тёмную репетицию);
2. песочница Uzum Checkout;
3. `--apply --cloudflare-env F:/Claude/.env`;
4. коммит `wrangler.toml` и `legal-entity.json`;
5. `build:production` → `deploy_runner.py check` → `deploy`;
6. «Готовность» в админке;
7. S1–S4 по порядку.

Тёмную репетицию (WP-22, слой 2) лучше провести до ключей владельца. Тогда приём с `--test-credentials` сохранит её тестовые блоки.

**Открыто.**
1. Ключей владельца нет: `click.json`, `uzum.json` и `zai.txt` в папке отсутствуют.
2. Даты одобрения политик (и раздела 8 v2) юристом: без них гейт не выпустит live.
3. На коммите S2 (и S1) тест `gpt-live-readiness` «the committed configuration is inert» нужно переписать под текущий режим. Так записано в runbook.
4. WP-21 (ревью безопасности) ещё не сделан. Два датозависимых теста `lead-radar` — как раньше.

**Дальше.** Ревью WP-23, затем WP-21 — по решению ведущего.

---

# Платный AI-чат: ревью WP-22 (тёмная репетиция покупки), 2026-10-03

**Итог.** Проверил коммиты WP-22 `6f299b80` (8 файлов) и `e3368548` (SHA в STATE). Сверял с §4 WP-22 плана `10-PROD-PLAN.md`, с §1, §2 (L7, L12), §3 и §5, а также с `AGENTS.md` §2–8 и §11. Дерево было чистым, незаконченной работы не было. **Дефектов в безопасности, деньгах и данных нет.** Код прода, миграции и настройки WP-22 не менял. Исправлены один дефект скрипта слоя 2 и три места в runbook (`fix(paid-chat): address WP-22 review findings`). Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались, `webhook.ts` и `TELEGRAM_BOT_TOKEN` тоже. Запросов к проду не было.

**Что держится (проверено).**
- **Слой 1** идёт через настоящие обработчики Pages на настоящем SQLite. Настройки биллинга берутся из закоммиченного `wrangler.toml`, поверх них три настройки слоя 2 и креды, которые сгенерировал скрипт. Глобальный `functions/_middleware.ts` диспетчер не вызывает. Он только ставит заголовки и делает `hydrateRuntimeConfig`, а конфигурацию тест гидратирует сам, так что поведение не теряется.
- Проверки не пустые. Тот же фильтр сообщений владельца в live-сценарии ловит «AI paket: paid» и «refunded». Чек в live печатается с ИКПУ, упаковкой, НДС 214 286 и TIN. Алерт `uzum_amount_mismatch` записан. Гонка двух Complete и двух `confirm` допускает только 0/−4 и CONFIRMED/10016.
- **Скрипт слоя 2:**
  - ходит только на `https://gptbot.uz` (`evil.example`, `http://`, `gptbot.uz.evil.example` отклоняются до сети);
  - не следует редиректам;
  - не печатает значений: тест ищет длинный hex, `pay_/uzm_/acct_`, девятизначные коды и сами значения;
  - креды пишет только вне репозитория и не перезаписывает.

  Офлайн через CLI `run --simulate local` — 57/57.
- **Выключение проверяется fail-closed.** Просроченный токен админки даёт 401, неверный Bearer — 403. Оба валят шаг, а не проходят.
- **Отклонения 1–6 обоснованы.**
  - `refund_requested_at` убрал WP-25.
  - Regex-фейк Javob не делит базу с сайтом.
  - Live-гейт режим `test` не держит, а `deploy_runner.py` тестов не гоняет. Значит, временный коммит слоя 2 задеплоится, а `gpt-live-readiness` «inert» на нём падает только локально.
- **Uzum Merchant API в проде без `fiscal.test`.** Чеки тестовых заказов становятся `skipped_test` (`fiscal-store.ts` `dueUzum`), в Uzum никаких вызовов, алерта нет: для test он `null`. Отказы Click −1/−2 и Merchant 10001/10011 в слое 2 алертов не пишут. `click_processing` и `uzum_processing` пишутся только на исключении.
- Ключ `localStorage.gptbot_admin_token` и срок 12 ч совпадают с кодом (`src/admin/lib/api.ts`, `functions/lib/jwt.ts`). Агрегаты квитанции читают существующие колонки: view `gpt_payment_orders_all` из 0065, `gpt_ui_events` из 0068.
- Защищённые страницы, страницы GPTBot Market, `webhook.ts` и Javob не тронуты. Слов Plus/Pro/obuna/подписка нет, NBSP, BOM и CRLF тоже.

**Исправлено.**
1. **`--drill` без `--bearer-file` тихо пропускался.** Учебный алерт идёт через тик обслуживания, а тик запускается только с Bearer. Без него фазы `drill` не было, но в `owner_checks` квитанции всё равно стояло «The training alert 'drill' reached the owner's alert chat», а статус мог быть `pass`. Владелец подтвердил бы алерт, который никто не отправлял, и приёмка плана «служебные алерты доставляются — проверка через drill» закрылась бы впустую. Теперь `runRehearsal` отказывает **до первого запроса**: «--drill needs --bearer-file». Тест `guards` проверяет код 1, текст и то, что сеть не трогали.
2. **Runbook, учебный алерт раз в час.** `alertRowId` кладёт `drill` в часовую корзину (`INSERT OR IGNORE`). Второй прогон в том же часу честно падает с «drill not sent». Теперь это написано, и сказано повторить прогон в следующем часу.
3. **Runbook, секреты.** Фраза «сейчас этих секретов в Pages нет» верна только на момент квитанции R4. Если к прогону WP-23 уже положит ключи владельца, `pages secret put` их перетрёт. Теперь перед `put` идёт проверка по именам (`wr.py -- pages secret list`), а если секрет уже есть — его не трогать.
4. **Runbook, мелочи.** Токен админки велели удалить «после прогона», хотя он нужен и в шаге 5. Теперь: удалить после шага 5, а если 12 ч прошли — `verify-off` с `--bearer-file`. Deep link Telegram ссылался на «шаг 4» (выключение), а экраны владельца — это шаг 3.

**Не исправлял (не мешает R7).**
1. `rows_by_mode` считает все тестовые строки за всё время, не только этого прогона: до 20 страниц по 50 на режим. Для квитанции R7 этого хватает.
2. Снятие одного из трёх фильтров outbox тест не ловит, два других держат. Это защита в глубину, автор WP-22 это записал.
3. Если Cloudflare в проде будет челленджить запросы Node (`User-Agent: node`), шаги упадут, а не пройдут ложно.
4. WP-21 (ревью безопасности) ещё не сделан.

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0. Четыре TS-файла WP-22 разовым tsconfig вне репозитория — 0 (на подложенной ошибке срабатывает). eslint по ним — 0. `git diff --check` чисто.
2. `paid-chat-e2e-rehearsal` 5/5, `paid-chat-dark-rehearsal` 4/4 (с новой проверкой `--drill`). Регресс: `gpt-uzum-rehearsal` 3/3, `gpt-live-readiness` 10/10, `gpt-rehearsal` 5/5.
3. CLI `run --simulate local` — 57/57, без аргументов — usage и код 1.
4. `scan:secrets` — чисто (3 287 файлов). Регэксп токена Telegram по диффу WP-22 и ревью — 0.
5. `npm run build:fast` — 0. `seo-protection check` — **10/10 без изменений** на базе `2026-10-01-paid-chat-honesty`.

**Для релиза R7 (делает ведущий): слой 2** — как в разделе WP-22 ниже, по `docs/paid-chat/DARK-REHEARSAL-RU.md`. Отличия:
- перед `pages secret put` проверить имена секретов;
- `--drill` только вместе с `--bearer-file`;
- повторный прогон с `--drill` — в следующем часу;
- токен админки хранить до `verify-off`.

**Дальше.** WP-21 (ревью безопасности), затем WP-23 — по решению ведущего.

---

# Платный AI-чат: WP-22 — тёмная репетиция покупки: слой 1 в тестах, слой 2 подготовлен (R7), 2026-10-03

**Итог.**
- WP-22 сделан на ветке `paid-chat/prod-readiness` поверх `4755df9e` (ревью WP-20), коммит `6f299b80` (`6f299b80069b4cf3c8f2b6743d79a0bc9ab6d2e8`). Следующий коммит только записывает его SHA в STATE и сюда (правило D-006).
- **Слой 1 готов.** `tests/paid-chat-e2e-rehearsal.test.ts`, 5 сценариев на настоящем SQLite через настоящие обработчики Pages:
  - Click `test` от начала до конца;
  - отказы Click;
  - Click `live` на заглушке `api.click.uz`;
  - Uzum Checkout;
  - Uzum Merchant API.
- **Слой 2 подготовлен, не запускался.** `scripts/paid-chat/dark-rehearsal.ts`:
  - генерирует тестовые креды в файлы вне Git;
  - гонит продовые маршруты через сессию репетиции админки;
  - пишет квитанцию `docs/paid-chat/releases/R7-dark-rehearsal.json`.

  Его офлайн-режим `run --simulate local` проверяет `tests/paid-chat-dark-rehearsal.test.ts`. Runbook ведущего — `docs/paid-chat/DARK-REHEARSAL-RU.md`.
- Код прода не менялся: только тесты, помощник тестов, скрипт, документ и `package.json`. Миграций и настроек нет. Защищённые страницы 10/10 без изменений. Страницы GPTBot Market, `webhook.ts` и `TELEGRAM_BOT_TOKEN` не трогались.
- Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались, запросов к проду не было.

**Возобновление.** `git status` в начале — чисто. Резервных копий WP-22 в `F:/Claude/gptbot-tools/backups/` нет, незаконченной работы не было.

**Что сделано.**
1. **`tests/helpers/paid-chat-site.ts`.**
   - `siteDispatcher(env, background)` подключает настоящие функции Pages к путям, по которым идёт покупка: сайт, вход через бота, вебхук бота, колбэки Click и Uzum, админка, внутренние маршруты. Остальное — 404, чужой метод — 405.
   - `serveOnLoopback` отдаёт то же по HTTP на 127.0.0.1.
   - `committedBillingSettings()` берёт настройки биллинга из закоммиченного `GPTBOT_RUNTIME_CONFIG_JSON` через `hydrateRuntimeConfig`, как прод. Слои 1 и 2 стартуют с конфигурации из `wrangler.toml`, а не с выдуманной.
2. **Слой 1** (`tests/paid-chat-e2e-rehearsal.test.ts`, 5/5). Конфигурация теста: закоммиченные настройки, три настройки слоя 2 (`DARK_REHEARSAL_SETTINGS`) и креды, которые сгенерировал скрипт. Telegram и модель отвечают внутри теста, Click и Uzum — фейки `tests/helpers`, любой другой хост — исключение.
   - **Click `test`.**
     - Посетителю: `providers: []`, входа нет, `subscribe` и `pack_viewed` — 404.
     - Сессия репетиции из админки.
     - Вход через бота: `/start login_…` и нажатие числа идут апдейтами через вебхук `/api/telegram/assistant`, Bot API записывается. Повтор `update_id` нового вопроса не даёт.
     - Чужой браузер вход не заберёт: без cookie попытки 403, со своей — `expired`.
     - Заказ, Prepare, два Complete одновременно (оба прочитали `prepared`, пишет один по `version` журнала), повтор −4.
     - Пакет на 300, ход списан из пакета (`period_id`, `charged=1`, остаток 299).
     - Cookie аккаунта без cookie репетиции ведёт в live-контекст, где пусто, и ход там бесплатный.
     - Чек `skipped_test`, ни одного вызова Click.
     - Строка админки `test`/`paid`/−2.
     - «Отметить возврат» (повтор `recorded:false`), пакет отозван, в журнале `owner_refund_record:…` от `owner`.
     - `paid` и `refunded` лежат в outbox недоставленными, владельцу ни слова.
   - **Отказы Click.** Поддельная подпись и чужой `service_id` → −1, другая сумма → −2, Complete до Prepare → −6, несуществующий заказ → −5, просроченный счёт → −5. Заказ остаётся `pending`, пакета нет.
   - **Click `live`** на заглушке `api.click.uz` — отдельный прогон чеков:
     - ссылка `my.click.uz`;
     - подпись тестовым секретом live-заказ не оплачивает;
     - очередь `status_by_mti` → `submit_items` → `ofd_data`, ссылка ofd.soliq.uz в «Paketim»;
     - в строке чека ИКПУ, упаковка, НДС 214 286 тийинов (12 % внутри 20 000), TIN;
     - владельцу приходят `paid` и `refunded`;
     - тестовый заказ, оставшийся от репетиции, после включения live не объявляется.
   - **Uzum Checkout.**
     - Регистрация на тестовом терминале.
     - Колбэк без подписи без слова Uzum ничего не меняет; при другой сумме — алерт `uzum_amount_mismatch`, оплаты нет.
     - Колбэк → pull → пакет, поздний дубль ничего не меняет. Ход из пакета. Чеки продажи и возврата на тестовом хосте Fiscalization API.
     - «Отметить возврат» — 409 `not_refunded_at_uzum`, пока Uzum не скажет REFUNDED.
     - Сессию, истёкшую без оплаты, закрывает обслуживание.
   - **Uzum Merchant API.**
     - Код оплаты; Basic 10001, сумма 10011, повтор `transId` 10010.
     - Два `confirm` одновременно: одна оплата.
     - `status` CONFIRMED, ход из пакета, чек.
     - `reverse` отзывает пакет и печатает чек возврата, повтор 10018. «Отметить возврат» — `recorded:false`.
     - `confirm` через 30 мин → 10015, заказ закрыт.
     - Телефон не хранится.
3. **Слой 2** (`scripts/paid-chat/dark-rehearsal.ts`).
   - `credentials --out <папка вне Git>` пишет `GPT_CLICK_CREDENTIALS_JSON.json` (только `test`: фиктивные id `9xxxxxxxx`, ключ — 32 случайных байта) и `UZUM_CREDENTIALS_JSON.json` (только `merchant.test`). Права 0600. Папку в репозитории скрипт отклоняет, существующий файл не перезаписывает (половину тоже не пишет), значения не печатает.
   - `run --site https://gptbot.uz --credentials <папка> --admin-token-file <файл> [--bearer-file <файл>] [--drill]`. Сайт — только `https://gptbot.uz`, редиректы не выполняются.
     - Click: посетитель ничего не видит; сессия репетиции из админки с синтетическим аккаунтом; заказ; поддельная подпись −1; другая сумма −2; Prepare 0; два Complete одновременно; повтор −4; пакет 300; строка админки; «Отметить возврат» и его повтор; пакет отозван; перенесённая cookie аккаунта ничего не видит.
     - Uzum Merchant: код из сессии и 22 шага `rehearseMerchant` из `uzum-sandbox-rehearsal.ts`.
     - С Bearer — тик обслуживания (режимы провайдеров), с `--drill` — учебный алерт.
     - Квитанция: шаги, режимы, строки по режиму из списка оплат админки, три агрегата D1 с ожиданиями.
   - `verify-off` после снятия режимов: `providers: []`, `subscribe`, колбэк Click и вебхук Uzum — 404, сессии репетиции нет. Фаза дописывается в ту же квитанцию.
   - `run --simulate local`: обработчики сайта на 127.0.0.1 над временным SQLite, креды, токен админки и Bearer во временной папке. Наружу fetch не ходит, Telegram отвечает внутри процесса. Проверено вручную: 57/57 шагов.
   - Ни значение, ни cookie, ни номер заказа, ни код не печатаются и не попадают в квитанцию (тест проверяет).
4. **Документ** `docs/paid-chat/DARK-REHEARSAL-RU.md`: что проверяет слой 1, шаги слоя 2 с командами, офлайн-режим, чего репетиция не проверяет. **`package.json`** `test` += оба новых файла.

**Отклонения от задачи и плана (и почему).**
1. **«Запрос возврата» убран из цепочки.** После WP-25 у покупателя нет запроса возврата, поэтому возврат — технический, «Отметить возврат» продавца в админке. Так и сказано в задаче ведущего.
2. **Апдейты Telegram идут не через in-memory фейк `telegram-assistant`, а через продовый вебхук `/api/telegram/assistant` на том же SQLite**, с записью Bot API, как в `telegram-web-login.test.ts`. Фейк узнаёт SQL по regex и не может делить базу с сайтом, а вход через бота пишет в `gpt_bot_logins` той же базы.
3. **Слой 2 — одна команда вместо двух.** План гонит Uzum отдельной командой `uzum-sandbox-rehearsal.ts --simulate https://gptbot.uz`. Скрипт берёт её 22 шага (`rehearseMerchant`) через ту же сессию репетиции и пишет одну квитанцию. Старая команда работает как раньше.
4. **Кто открывает сессию.** Как в плане — админка: токен владельца, 12 ч. Но без входа владельца ведущий может прогнать то же через Bearer-секрет обслуживания: внутренние маршруты, без строк списка оплат.
5. **Слой 2 не делает ход в чате в проде** (вызов модели), и Uzum Checkout там нет: нужен настоящий тестовый терминал Uzum, а это ключи владельца. Оба случая закрывает слой 1.
6. **Временный коммит слоя 2 в `wrangler.toml`** (три настройки `test`). На нём падает `gpt-live-readiness` «the committed configuration is inert» — так и задумано, после revert тест снова зелёный (записано в runbook). Pages-переменные вместо коммита не годятся: live-гейт при деплое отказывает переменным с именами настроек биллинга.
7. **Креды не положены, ничего не задеплоено.** План говорит «агент генерирует и кладёт, деплой», задача — «подготовить, слой 2 запускает ведущий после деплоя».

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0. Новые файлы проверены разовым tsconfig вне репозитория: 0 ошибок (на подложенной ошибке он срабатывает). eslint по 4 новым TS — 0.
2. Новые: `paid-chat-e2e-rehearsal` 5/5, `paid-chat-dark-rehearsal` 4/4.
3. Регресс: `gpt-rehearsal` 5/5, `gpt-uzum-rehearsal` 3/3, `gpt-admin-ai-chat` 13/13, `gpt-bot-login` 17/17, `telegram-web-login` 13/13, `gpt-click-fiscal` 14/14, `gpt-live-readiness` 10/10, `runtime-config` 4/4, `pages-config-parity` 7/7, `secret-scan` 16/16, `gpt-uzum-merchant` 13/13, `gpt-billing` 21/21.
4. **Мутации** (каждая откатывалась из копии вне репозитория) — тесты падают:
   - снята проверка подписи Click;
   - outbox без фильтра режима (SQL и цикл);
   - `subscribe` без контекста репетиции;
   - тестовые чеки печатаются (вставка и очередь);
   - журнал без `version`;
   - возврат Uzum Checkout записан без слова Uzum;
   - вход через бота забирает любой браузер;
   - одна cookie аккаунта открывает `test`.

   Снятие одного из трёх фильтров outbox тест не ловит: оставшиеся два держат. Это защита в глубину, а не дыра.
5. `scan:secrets` — чисто (3 287 файлов), по новым файлам — чисто. Регэксп токена Telegram по диффу и новым файлам — 0. `git diff --check` чисто. NBSP, BOM и CRLF в новых файлах нет.
6. `npm run build:fast` — 0. `seo-protection check` — **10/10 без изменений**. `chat-bundle-budget` в бюджете (бандл не менялся).

**Для релиза R7 (делает ведущий): слой 2** — по `docs/paid-chat/DARK-REHEARSAL-RU.md`.
1. После деплоя сборки R5–R7: `credentials --out C:/Users/Borinio/.config/gptbot-private/dark-rehearsal`.
2. Два `wr.py --stdin … pages secret put`. Временный коммит трёх настроек `test` в JSON и в таблицу `wrangler.toml`, затем `build:production`, `deploy_runner.py check`/`deploy`.
3. `run --site https://gptbot.uz …` → `R7-dark-rehearsal.json`, `status: pass`.
4. По желанию — экраны владельца с сессией репетиции.
5. Revert, деплой, `verify-off`, `inert-smoke.mjs`, агрегаты из квитанции через `wr.py`. Владелец подтверждает: «AI paket: …» не приходило, учебный алерт пришёл.
6. Коммит квитанции.

**Открыто.**
1. Квитанции `R7-dark-rehearsal.json` ещё нет: слой 2 запускает ведущий после деплоя.
2. Токен админки требует входа владельца (12 ч). Без него — Bearer-путь без проверок списка оплат.
3. Как и раньше:
   - два датозависимых теста `lead-radar`;
   - `inert-smoke.mjs` ждёт правки к R6 (WP-20);
   - WP-21 (ревью безопасности) ещё не сделан.

**Дальше.** Ревью WP-22, затем WP-21 и WP-23 — по решению ведущего.

---

# Платный AI-чат: ревью WP-20 (B2B: источники, бюджет, 4 формы, бизнес-строка), 2026-10-03

**Итог.** Проверил коммиты WP-20 `9fc0771b` (42 файла) и `5f26f927` (SHA в STATE). Сверял с §4 WP-20 плана `10-PROD-PLAN.md`, с §1, §2 (L14), §3 и §5, с картами `05` §4 и `03` §9, а также с `AGENTS.md` §2–8 и §11. Дерево было чистым, незаконченной работы не было. **Дефектов в безопасности, деньгах и данных нет.** Исправлены три мелких дефекта: регистр вариантов бюджета по-русски, неверная запись о `#contact` в документах и шаг приёмки R6 с тестовыми заявками (`fix(b2b): address WP-20 review findings`). Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались, `webhook.ts` и `TELEGRAM_BOT_TOKEN` тоже. С прода прочитаны только четыре B2B-страницы (GET).

**Что держится (проверено).**
- Источник заявки: белый список `gpt_chat`, `chat_b2b`, `calculator`, `page_form`, `unknown`. Всё прочее и пустое значение становятся `unknown`. Калькулятор, форма страницы и обе формы чата называют себя сами. `AiLeadForm` без `source` не соберётся (prop обязателен).
- Бюджет: `normalizeLeadBudget` пропускает только закрытый список, а чужое значение превращает в `NULL` и заявку сохраняет. `INSERT` называет 15 колонок: 14 привязанных значений и `NULL`. `lead-outbox` читает `l.budget` только после `ensureSchema` (`lead.ts` и внутренний роут outbox).
- Миграция `0070` — один аддитивный `ALTER`, в шапке порядок, восстановление и откат. `LEAD_COLUMNS` с ней совпадает и переживает параллельный `ALTER` из другого изолята.
- Уведомление: каждое значение экранируется, переписка прикладывается только с согласия, для `chat_b2b` без согласия так и написано.
- `/api/gpt/event`: только тот же Origin, тело до 1 кБ, закрытые списки, `INSERT OR IGNORE` по id из браузера, лимит на хеш IP. Шаги окна пакета при выключенной оплате получают 404 до D1. Ни текста, ни IP, ни сессии чата в строке нет. Воронка в админке и её начало считаются только по шагам окна.
- Детектор: нет `\b`, lookbehind и `new RegExp`. Работает на сыром тексте посетителя и только в браузере.
- Строка: показывается после полного первого ответа и защищена счётчиком смены личности (`identityGeneration`). При лимите и в инструменте «Для бизнеса» её нет, показ — раз за сессию браузера.
- Тексты RU/UZ звучат естественно, марка «GPTBot.uz», слов Plus/Pro/obuna/подписка нет. Личных `t.me` на четырёх страницах нет.
- Защищённые страницы, страницы GPTBot Market, `webhook.ts` и Javob не тронуты.

**Исправлено.**
1. **Регистр вариантов бюджета по-русски.** В одном списке стояли «Не выбран», а дальше «до 1 млн сум», «больше 5 млн сум», «пока не знаю». По-узбекски все варианты начинаются с заглавной буквы или цифры. Теперь RU: «До 1 млн сум», «Больше 5 млн сум», «Пока не знаю» (`src/shared/lead-budget.ts`, таблица в `B2B-RU.md`). Тест `gpt-lead-budget` проверяет, что каждый вариант начинается с заглавной или цифры, на обоих языках. Строчные подписи он ловит.
2. **`#contact` на четырёх страницах существовал.** В WP-20 (раздел ниже, п. 5 «Что сделано»), в `B2B-RU.md` и в STATE было записано: «Блока `#contact` на этих страницах нет, кнопки никуда не вели». Это неверно. Сейчас в проде на всех четырёх страницах стоит карточка контактов студии (`id="contact"`, кнопки «Позвонить» и «E-mail», `scripts/contact-card.ts`). Карточка выводится только на странице, которая ссылается на `#contact`. После WP-20 кнопки ведут на `#lead-form`, и место карточки занимает форма, как на всех остальных страницах с формой. Телефон и e-mail остаются в подвале, на телефоне ещё и в нижней панели «Позвонить». Код менять не нужно: это видимая смена блока, теперь она записана в `B2B-RU.md` и STATE.
3. **Шаг приёмки R6 «4 тестовые заявки» в написанном виде не проходит.** Сервер склеивает заявки с одним контактом за 1 час: вторая ответит «ок», но строки в D1 и уведомления не будет. Кроме того, с третьей заявки за час с одного IP `/api/gpt/lead` требует Turnstile (`GPT_LEAD_TURNSTILE_AFTER`, по умолчанию 2), если задан `TURNSTILE_SECRET_KEY`. Форма страницы Turnstile не показывает и пишет «Свяжитесь с нами напрямую». Теперь в `B2B-RU.md` и STATE: у каждой заявки свой контакт, не больше двух заявок в час с одного IP.

**Не исправлял (не мешает R6; ведущему и WP-21).**
1. **Ложные срабатывания строки.** Слова желания `kerak`, `нуж`, `сколько`, `цен`, `yarat`, `созда`, `sozla`, `joriy`, `ulash` ловят и вопросы обычных пользователей и просьбы о помощи. На проверке 23 синтетических фраз строку показали:
   - «Bot ishlamayapti, nima qilish kerak?»;
   - «Сайт не открывается, нужно срочно»;
   - «Нужен совет: какой сайт лучше для покупки билетов?»;
   - «Есть ли цензура в боте?»;
   - «Сколько ботов в Telegram?»;
   - «Joriy yilda qaysi botlar mashhur?».

   Строка показывается раз за сессию и закрывается, а план относит этот риск к проверке на людях. Настраивать детектор лучше по счётчику показов и закрытий против заявок `chat_b2b`.
2. **`/api/gpt/event` при выключенной оплате пишет в D1** (шаги строки). Лимит только 60 в час на хеш IP, общего потолка нет, а у заявок есть `lead_global`. Это пункт «флуд-лимиты» для WP-21.
3. **Политика конфиденциальности** перечисляет, что уходит с заявкой: имя, телефон или Telegram, текст задачи, страница, UTM. Бюджета в списке нет. Его можно считать частью «что вы написали о задаче». Нужно ли назвать бюджет отдельно, владелец может спросить у юриста. Текст политики юрист одобрил, поэтому я его не трогал.
4. Ссылка «Об услуге» для темы `site` ведёт на `/boss-digital/`, а не на `/ru/razrabotka-saytov-tashkent/`, где формы нет. Это выбор продукта, он записан как отклонение 6 WP-20.

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0. eslint по файлам ревью — 0. `git diff --check` чисто. Регэксп токена Telegram по диффу WP-20 и ревью — 0.
2. `gpt-chat-business-intent` 5/5, `gpt-chat-business-line` 5/5, `gpt-lead-budget` 4/4, `gpt-ui-events` 8/8, `lead-attribution` 18/18, `lead-capture-templates` 32/32, `gpt-live-readiness` 10/10, `gpt-admin-ai-chat` 13/13, `gpt-chat-honesty` 11/11.
3. Регресс: `gpt-chat-lead-migration` 1/1, `gpt-chat-runtime-schema` 5/5, `gpt-paid-chat-schema` 4/4, `gpt-chat-bridge` 42/42, `gpt-lead-outbox-endpoint` 3/3, `gpt-chat-lazy-part` 7/7, `chat-bundle-budget` 9/9, `studio-contact` 18/18, `gpt-backend-security` 31/31, `gpt-events-retention` 2/2, `gpt-backend` 18/18, `gpt-chat` 19/19, `gpt-api-cors` 2/2, `gpt-chat-session-privacy` 3/3, `telegram-web-handoff` 22/22, `gpt-account-ui` 25/25, `gpt-pack-dialog` 15/15, `seo-analytics-privacy` 23/23.
4. `npm run build:fast` — 0. `seo-protection check` — **10/10 без изменений** на базе `2026-10-01-paid-chat-honesty`. Бандл чата в бюджете (`chat-lead` 5,4 kB br). В `dist` на `/ru/ai-bot-dlya-biznesa/` форма с «До 1 млн сум», `id="contact"` нет.
5. Список вариантов в чате тёмный. У `:root` стоит `color-scheme: dark`, а всплывающий список Chromium берёт фон `select` как есть (`internal_popup_menu.cc`), поэтому прозрачный фон белым не становится.

**Для релиза R6 (делает ведущий)** — как в разделе WP-20 ниже, но шаг 3 такой. 4 тестовые заявки через формы четырёх страниц с `?utm_source=test`, **у каждой свой контакт**. С одного IP — **не больше двух в час**: две сейчас, две в следующем часе или с другой сети. Затем агрегат из `B2B-RU.md` и уведомления со строкой «Бюджет». Помощник `inert-smoke.mjs` по-прежнему нужно поправить к R6 (см. WP-20, п. 4).

**Дальше.** WP-21 (ревью безопасности, R7) — по решению ведущего.

---

# Платный AI-чат: WP-20 — B2B: источники, бюджет, 4 формы, бизнес-строка в чате (R6), 2026-10-03

**Итог.**
- WP-20 сделан на ветке `paid-chat/prod-readiness` поверх `8d1bd0db` (ревью WP-19), коммит `9fc0771b` (`9fc0771b46312e776841e11e31c12a14ce77aab6`). Следующий коммит только записывает его SHA в STATE и сюда (правило D-006).
- У каждой заявки теперь явный источник (`gpt_chat`, `chat_b2b`, `calculator`, `page_form`, `unknown`) и, если человек выбрал, бюджет из закрытого списка. Колонка `gpt_leads.budget` добавляется новой миграцией `0070_gpt_leads_budget.sql`, в bootstrap тот же столбец.
- Форма заявки стоит на четырёх B2B-страницах, все их кнопки ведут к ней. Под первым ответом чата о заказе бота, сайта, рекламы или CRM один раз за сессию появляется строка «Услуга GPTBot.uz» / «GPTBot.uz xizmati» с формой в ленивом `chat-lead`.
- Защищённые страницы не менялись: `seo-protection check` 10/10 на базе `2026-10-01-paid-chat-honesty`. H1 `/ru/luchshie-…/` тот же. Страницы GPTBot Market и `webhook.ts` не трогались.
- Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались. Новых настроек нет. Оплата по-прежнему выключена.

**Возобновление.** В дереве была незаконченная работа прошлой попытки WP-20: 27 изменённых и 7 новых файлов. Резервная копия: `F:/Claude/gptbot-tools/backups/wp-20-partial-20261003-081352/` (`tracked.patch` и `untracked.tar`). Рядом лежит такая же копия `wp20-partial-20261003-0313`, сделанная за 20 секунд до этой попытки. Код прошлой попытки я проверил целиком и оставил. Исправлено: порядок doc-комментариев в `admin-store.ts`; показ строки считается раз за просмотр; литеральный NBSP в тесте (eslint); тест `gpt-live-readiness` (см. «Отклонения», п. 2). Добавлены документы, `package.json` и приёмка вида.

**Что сделано.**
1. **Источник заявки** (`functions/lib/gpt-chat/validate.ts`).
   - `LEAD_SOURCES = gpt_chat, chat_b2b, calculator, page_form, unknown`.
   - `normalizeLeadSource`: значение не из списка или его отсутствие даёт `unknown` (раньше `gpt_chat`, и чату доставались чужие заявки).
   - Формы чата называют себя сами: карточка «Для бизнеса» (`AiOfferCard`) шлёт `gpt_chat`, бизнес-строка — `chat_b2b` (`AiLeadForm` prop `source`, `LeadPayload.source`).
2. **Бюджет.**
   - Список `lt1m | 1-2m | 2-5m | gt5m | unknown` с подписями RU/UZ один на всех: `src/shared/lead-budget.ts`.
   - `normalizeLeadBudget`: значение не из списка становится `null`, заявка при этом сохраняется.
   - `lead.ts` пишет `budget`, `lead-outbox.ts` читает его для уведомления.
   - `NULL` значит «не спрашивали или не выбрал». `unknown` — ответ самого человека «пока не знаю».
3. **Схема.**
   - `migrations/0070_gpt_leads_budget.sql`: только `ALTER TABLE gpt_leads ADD COLUMN budget TEXT`, в шапке порядок и откат.
   - `schema.ts`: `LEAD_COLUMNS` (`request_id`, `budget`) — try/catch-список, повтор из другого изолята («duplicate column name») не роняет bootstrap.
   - Тест паритета на настоящем SQLite: миграция через ledger один раз, bootstrap после неё ничего не меняет, свежая база даёт ту же колонку последней. Если код опередит миграцию, `ALTER` падает (в шапке файла сказано, что делать).
4. **Уведомление** (`notify.ts`).
   - Подписи источников: «AI-чат: бизнес-строка», «источник не указан».
   - Строка «Бюджет» по-русски после «Запрос».
   - `fromChat` верно и для `chat_b2b`, и для любой заявки с сессией чата. Переписка только с согласия, без согласия уведомление так и пишет.
5. **Четыре B2B-страницы.**
   - `LEAD_FORM_PAGES` += `/ru/ai-bot-dlya-biznesa/`, `/uz/biznes-uchun-ai-bot/`, `/ru/gpt-dlya-biznesa/` → `ai-bot`; `/ru/luchshie-razrabotchiki-chat-botov-tashkent/` → `chat-bot`.
   - `ctaPrimaryHref` и кнопки в тексте: `#contact` → `#lead-form`. Блока `#contact` на этих страницах нет, кнопки никуда не вели.
   - Личных `t.me` там уже не было (WP-11), тест это закрепляет.
6. **Форма страницы** (`scripts/lead-form.ts`).
   - Добавлен `<select name="budget">` с пустым первым вариантом и подписью «Бюджет (необязательно)» / «Byudjet (ixtiyoriy)». Скрипт шлёт `budget`, только если он выбран.
   - Теперь в форме 3 input, 1 select, 4 label и 5 элементов высотой 44 px.
7. **Детектор** `src/gpt-chat/business-intent.ts` (стартовый бандл).
   - `detectBusinessTopic` возвращает `bot | site | ads | crm | null`, `businessLineTopic` добавляет условия показа.
   - Без `\b`, без lookbehind и без `new RegExp`: тест читает исходник.
   - Тема — точные словоформы. Желание и бизнес — префиксы, исключены «ложные друзья» (настроение, центр, ценный, кафедра).
   - Рекламе нужно коммерческое желание. Слова учёбы выключают строку.
8. **Бизнес-строка** `AiBusinessLine` (ленивый `chat-lead`).
   - Показывается только после полного ответа (JSON и стрим), только на первое набранное сообщение в обычном чате и раз за сессию браузера (`sessionStorage gptchat_b2b_line`).
   - Не показывается при лимите, в инструменте «Для бизнеса» и если сегодня закрыли её или карточку (общий `saveOfferDismissed`).
   - Следующее сообщение убирает строку, если её форма не открыта. «Об услуге» ведёт на страницу услуги с той же формой.
   - Событие показа уходит раз за просмотр, как у карточки.
9. **Учёт.**
   - `gpt_ui_events`: новые шаги `b2b_line_shown` и `b2b_line_dismissed`, в `detail` тема.
   - `POST /api/gpt/event` считает шаги строки при любом состоянии оплаты. Шаги окна пакета (`PACK_WINDOW_EVENTS`) по-прежнему получают 404 до D1, пока оплата выключена.
   - В админке воронка окна и её «начало» считаются только по шагам окна, заявки по неделям видят новые источники сами.
   - GA4: `b2b_line_shown` / `b2b_line_dismissed` с `topic`. `generate_lead` с `method: chat_b2b_line` и `source: chat_b2b`.
10. **Документы.** Новый `docs/paid-chat/B2B-RU.md` (для владельца и релиза), правки в `ANALYTICS-RU.md` и `ADMIN-RU.md`. `package.json` `test` += `gpt-lead-budget`, `gpt-chat-business-intent`, `gpt-chat-business-line`.

**Отклонения от задачи и плана (и почему).**
1. **Миграция `0070`, а не `0069`.** Номер `0069` занял WP-24, так велит задача ведущего.
2. **`/api/gpt/event` читает тело (до 1 кБ) раньше проверки оплаты.** Тип события решает, нужен ли 404: строку считаем всегда, окно — только при оплате. Для шагов окна 404 по-прежнему до D1. `gpt-live-readiness` теперь проверяет каждый шаг окна в боевой конфигурации (раньше слал тело без типа).
3. **Имя события GA4 `b2b_line_shown`.** Оно то же, что у счётчика на сервере (карта 03 §9). Регэксп в `gpt-chat-honesty` расширен до правила GA4 (буква первой, затем буквы, цифры и `_`). Первым сегментом раньше разрешались только буквы.
4. **Без `sendBeacon` и id сессии чата** (карта 03 §9 предлагала их). Используется тот же `recordUiEvent` с `fetch keepalive` и случайным id вкладки, что у WP-17: таблица `gpt_ui_events` по дизайну не связывает событие с перепиской.
5. **Стартовый бандл +1,2 kB br, а не ≈ +0,6.** 107,8 kB против базы R4 106,6 kB. Сам детектор — около 1,2 kB br отдельно, словари RU/UZ (латиница и кириллица). Гейт (≤ 110 kB, рост ≤ 3 kB) проходит. `chat-lead` 5,4 kB (+1,0).
6. **Страница «Об услуге» для `site`** — `/boss-digital/` и `/uz/boss-digital/`. На страницах про сайты формы нет, а план просит страницу с формой. Новые формы за пределами четырёх B2B-страниц не добавлял.
7. **Подписи CTA на страницах не менял** («Запросить демо», «Обсудить проект», «Demo so‘rash»): они уже ведут к заявке, а менять тексты страниц сверх нужного не стоит.

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0. Изменённые и новые тесты проверены разовым tsconfig вне репозитория: новых ошибок нет, остались только известные расхождения окружения (`import.meta.env`, `AccountDialog`, `ym`). eslint по 31 изменённому и новому TS/TSX — 0. `git diff --check` чисто, NBSP в файлах нет. Регэксп токена Telegram по диффу и новым файлам — 0, `test:secret-scan` 16/16, `scan:secrets` чисто (3 282 файла).
2. Новые: `gpt-chat-business-intent` 5/5 (25 положительных и 25 отрицательных синтетических фраз, плюс подсказки чата и стартовые вопросы статей), `gpt-chat-business-line` 5/5, `gpt-lead-budget` 4/4.
3. Изменённые: `lead-attribution` 18/18, `lead-capture-templates` 32/32, `gpt-ui-events` 8/8, `gpt-admin-ai-chat` 13/13, `chat-bundle-budget` 9/9, `gpt-chat-honesty` 11/11, `gpt-live-readiness` 10/10.
4. Мутации ловятся: без гейта `PACK_WINDOW_EVENTS` в `event.ts` падает `gpt-ui-events`; если рекламе хватает бизнеса, падает `gpt-chat-business-intent`; без `budget` в `LEAD_COLUMNS` падает `gpt-lead-budget`.
5. Весь список `npm test` по одному файлу: 93 файла, **1223/1225**. Падают только два известных датозависимых теста `lead-radar`.
6. `npm run build:fast` — 0. `seo-protection check` — **10/10 без изменений**. `chat-bundle-budget` в бюджете: start 107,8 kB (+1,2), `chat-lead` 5,4, `chat-account` 10,2, `chat-tools` 6,2. `seo-audit` — 0 critical (123 страницы).
7. Приёмка вида (статический сервер на 127.0.0.1, остановлен):
   - `dist`: на четырёх страницах ровно одна форма с `select` бюджета и `data-service` `ai-bot`/`chat-bot`, `#contact` нет, H1 прежние, на 375 px нет горизонтальной прокрутки, у `select` 45 px;
   - превью `AiBusinessLine` (RU, UZ, открытая форма) на собранном CSS при 375 px: метка, текст, кнопки 44 px, `select` 48 px с `label`, у страницы `color-scheme: dark` (тёмный список вариантов).

**Для релиза R6 (делает ведущий).**
1. Миграции `0069_gpt_events_retention.sql` (WP-24) и `0070_gpt_leads_budget.sql` применить **до** кода, превью тоже: превью пишет в боевую D1. Если bootstrap успел раньше, `ALTER` 0070 падает на «duplicate column name». Тогда файл записывают в `d1_migrations` вручную.
2. Новых настроек и секретов нет. Worker не затронут.
3. После деплоя:
   - 4 тестовые заявки через формы четырёх страниц с `?utm_source=test`;
   - агрегат из `B2B-RU.md`: `source=page_form`, `service` `ai-bot`/`chat-bot`, выбранный `budget`;
   - уведомления дошли со строкой «Бюджет»;
   - `POST /api/gpt/event` с `pack_viewed` → 404 (оплата выключена).
4. **`F:/Claude/gptbot-tools/paid-chat/inert-smoke.mjs` (вне Git) после деплоя WP-20 покажет ложный сбой.** Строка `POST /api/gpt/event` с телом `{}` ждёт 404, а код WP-20 отвечает 400: тело читается раньше. Для R6 замените её шагом окна, например `{"id":"<uuid>","type":"pack_viewed","detail":"header"}` → 404, и добавьте `b2b_line_shown` с чужим Origin → 403 (без записи в D1). Пока идёт релиз R4, я помощник не менял: на коде R4 правка дала бы ложный сбой уже там.

**Владельцу (по желанию).** GA4: зарегистрировать параметр `topic`. Проверить строку на 5–10 знакомых: не слишком ли часто она появляется.

**Открыто.**
1. Два датозависимых теста `lead-radar`, как и раньше.
2. `tests/agent-boundaries.test.ts` и `tests/react-router-v8-migration.test.ts` красные и до WP-20 (записано в ревью WP-19), в `npm test` их нет.
3. Ложные срабатывания строки видны только на живых людях. Счётчик показов и закрытий по темам против заявок `chat_b2b` покажет долю.

**Дальше.** Ревью WP-20, затем WP-21 (ревью безопасности, R7) — по решению ведущего.

---

# Платный AI-чат: ревью WP-19 (админка «AI-чат»), 2026-10-03

**Итог.** Проверил коммиты WP-19 `38d200ab` (42 файла: админ-раздел `/admin-tools/ai-chat`, общий `seller-refund.ts`, `openRehearsal()`, тесты) и `c82055b1` (SHA в STATE). Сверял с §4 WP-19 плана `10-PROD-PLAN.md`, картой `05` §2 (A1–A6, контракт §2.4, SQL §2.5, приватность §2.6, «Отметить возврат» §2.7, тесты §2.8), §1, §2 (L7, L12, L17), §5 и §6, а также с `AGENTS.md` §2–8 и §11. Дерево было чистым, незаконченной работы и резервных копий не было. **Дефектов в безопасности, деньгах и данных нет.** Исправлены пять мелких дефектов наблюдаемости и вида (`fix(admin): address WP-19 review findings`). Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались, `webhook.ts` и `TELEGRAM_BOT_TOKEN` тоже. Ключ Z.ai из сообщения владельца не использовался и не сохранялся: формат ключа не встречается ни в дереве, ни в диффах WP-19 и ревью.

**Что держится (проверено).**
- Все пять маршрутов закрыты `withOwnerRole('platform_owner')`: без токена 401, `support_readonly` 403, старый `admin` = владелец. На чужой метод 405 с `Allow`. Ответы `no-store` и `noindex`.
- SQL раздела только в `admin-store.ts`, только `SELECT`, все параметры через bind, `orgId` первым, в каждом запросе к таблице с `org_id` фильтр по нему. `content`, `contact_*` и `gpt_messages` не упоминаются (тест читает файл). Legacy `gpt_sessions` и `gpt_leads` читает только `BILLING_ORG`.
- Неделя Ташкента в JS (`tashkentWeekStart`) и в SQL (`+5 hours`, `weekday 0`, `-6 days`) совпадает. Курсор `(created_at, provider, id)` верен для `DESC`. `used` пакета считается тем же предикатом, что `PACK_USED` в `turn-store.ts`.
- В ответах нет IP, хешей, `subject`, id сессий, аккаунтов, Telegram и значений секретов. Готовность не падает и на испорченных настройках: проверил кривой JSON ключей Click и Uzum, `GPTBOT_RUNTIME_CONFIG_JSON`, `GPT_HASH_SALT_SINCE`, срок хранения, список провайдеров и фискальные значения.
- «Отметить возврат» денег не двигает: ни reversal Click, ни возврата Uzum. Uzum Checkout пишется только после полного `REFUNDED`. Переход `paid→refunded` идёт с проверкой версии, повтор ничего не пишет. Отказы Bearer-эндпоинтов прежние, `gpt-uzum-merchant` 13/13, `gpt-uzum-payments` 26/26. Отклонение 2 (режим Click больше не сверяется) приемлемо: отметка возможна только у оплаченного заказа и только владельцем или держателем секрета обслуживания.
- Репетиция из админки ставит `__Host-` cookie с `Path=/; HttpOnly; Secure; SameSite=Lax`, значения есть только в `Set-Cookie`. Bearer-маршрут по-прежнему отвечает 404 до чтения тела.
- Коррелированные подзапросы в `visitors` SQLite считает только для 50 выводимых строк (проверил: 54 вызова на 1000 групп), так что чтения D1 не растут с числом групп.
- Миграций нет, bootstrap не трогали. Новых настроек нет. `functions/lib/telegram/**` не менялся, `telegram-assistant` 77/77.

**Исправлено** (`fix(admin): address WP-19 review findings`).
1. **Low: сбой запроса в секции нельзя было найти в логе.** Комментарий контракта (`src/shared/ai-chat-admin.ts`) обещал, что для `query_failed` «в логе сервера есть request id», но `admin-store.ts` писал `gpt_admin_*_failed` без него. У `SectionGap` был параметр `requestId`, который никто не передавал (мёртвый код). Теперь `overview`, `payments` и `visitors` передают в store `ctx.requestId`, лог пишет `{event, request_id}` без подробностей ошибки. Секция с `query_failed` показывает номер запроса. Для `schema_pending` и `salt_missing` номер не показывается: в логе по ним ничего нет. Страница хранит ответы списков целиком (`AiChatPayments`, `AiChatVisitors`), чтобы знать их `request_id`.
2. **Low: в списке оплат не было времени закрытия.** Карта `05` §2.3 (блок 4) требует «создан/оплачен/отменён». API отдавал `cancelledAt`, а страница его не выводила, и не было видно, когда отмечен возврат. Теперь в ячейке третья строка: «возврат 02.10, 14:15» или «закрыт …», заголовок «Создан / оплачен / закрыт».
3. **Low: ошибка на второй странице оплат терялась.** Если «Показать ещё» получал секцию с ошибкой (`query_failed`), страница молча ничего не делала. Теперь это карточка «Запрос не прошёл» с кодом и номером запроса.
4. **Low: одинаковые React-ключи у карточек ошибок.** При обрыве сети все три запроса падают с `request_failed` без request id, и ключи `request_failed:null` совпадали. Теперь ключ — индекс.
5. **Low (доступность): фильтры оплат назывались для экранных дикторов по-английски** (`provider`, `state`, `mode`). В админке подписи русские: теперь «Провайдер», «Состояние», «Режим».

Тесты: в `tests/gpt-admin-ai-chat.test.ts` новый тест 8b. В нём D1 отвечает ошибкой, три секции дают `query_failed`, в логе ровно три строки с `request_id` и без текста ошибки. Тест 10 теперь проверяет время возврата, русские подписи фильтров и номер запроса только у `query_failed`. Пробел `schema_pending` в виде по-прежнему покрыт.

**Открыто (для ведущего, R5 не блокирует).**
1. `tests/react-router-v8-migration.test.ts` красный и до WP-19: 3 из 26. Импортов `react-router` 24 при ожидаемых 20, у `445b728a` и у `HEAD` их одинаково. Число маршрутов и sitemap тоже не совпадают. Файлов WP-19 это не касается, в `npm test` этого теста нет.
2. `tests/agent-boundaries.test.ts` красный и до WP-19, как записано в разделе WP-19.
3. NS-1 осторожен: когорта читается только при 14 днях истории перед ней. Поэтому первые две недели после старта резервов (с 0064) будут серыми, хотя это действительно новые группы. Так задумано и описано в `ADMIN-RU.md`.
4. При «Сессии репетиции» галочка «войти тестовым аккаунтом» включена по умолчанию. Cookie `__Host-gpt_account` заменит вход владельца на сайте в этом браузере на 2 часа. Это ожидаемо для теста, но стоит сказать владельцу.

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
- `npx tsc -b` — 0, `npm run typecheck:functions` — 0. eslint по файлам WP-19 (35) и ревью — 0. `git diff --check` чисто. Регэкспы токена Telegram и ключа Z.ai по диффам — 0. `test:secret-scan` 16/16.
- `gpt-admin-ai-chat` 13/13 (было 12). `owner-control-center` 71/71, `signal-radar-admin-integration` 26/26, `gpt-rehearsal` 5/5, `gpt-uzum-payments` 26/26, `gpt-uzum-merchant` 13/13, `gpt-uzum-rehearsal` 3/3, `gpt-uzum-fiscal` 10/10, `gpt-billing` 21/21, `gpt-operations` 8/8, `gpt-live-readiness` 10/10, `gpt-click-fiscal` 14/14, `gpt-watchdog` 15/15, `pages-production-release` 8/8, `functions-type-safety` 38/38, `error-disclosure` 16/16, `gpt-backend-security` 31/31, `gpt-readiness` 9/9, `telegram-assistant` 77/77, `web-security-hardening` 13/13, `bormi-admin` 45/45.
- `npm run build:fast` — 0. `seo-protection check` — **10/10 без изменений**. `chat-bundle-budget` в бюджете: start 106,7 kB br, чат не тронут. `inspectArtifact` по `dist` проходит все `REQUIRED_FEATURES`, включая `ai_chat_admin` (метка в чанке `AiChat-*.js`). Останавливается только на `admin/index.html`, его даёт `build:production`.

**Дальше.** WP-20 (B2B, R6) — по решению ведущего.

---

# Платный AI-чат: WP-19 — админка «AI-чат» (`/admin-tools/ai-chat`, R5), 2026-10-03

**Итог.**
- WP-19 сделан на ветке `paid-chat/prod-readiness` поверх `445b728a` (ревью WP-25), коммит `38d200ab` (`38d200ab9cd41e521790277f35938373e56fca4b`). Следующий коммит только записывает этот SHA в STATE и сюда (правило D-006).
- Владелец видит платный AI-чат без SQL в пяти блоках: готовность оплаты, 8 недель, модели и алерты, оплаты и возвраты, IP-группы под псевдонимами. Есть два действия: «Отметить возврат» (возвраты-исключения Продавца, деньги не двигает) и «Сессия репетиции» (тёмный тест WP-13 в своём браузере).
- Все эндпоинты закрыты `withOwnerRole('platform_owner')`. Страница грузится лениво, обновляется по кнопке, опроса по таймеру нет.
- Миграций нет. Оплата по-прежнему выключена.
- Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались; `webhook.ts` и `TELEGRAM_BOT_TOKEN` тоже. Защищённые страницы 10/10 без изменений.
- Ключ Z.ai из сообщения владельца в этом WP не использовался. В дереве и в диффе его нет (проверено поиском по формату ключа).

**Возобновление.** Дерево было чистым на `445b728a`. Незаконченной работы и резервных копий `wp19-*` не было.

**Что сделано.**
1. **Сервер, только чтение** (`functions/lib/gpt-chat/admin-store.ts`).
   - SQL раздела живёт только здесь, и это только `SELECT`. Каждый метод принимает `orgId` первым. `content`, `contact_*` и `gpt_messages` в коде не упоминаются, записи и bootstrap нет. Это проверяет тест.
   - `gpt_sessions` и `gpt_leads` — legacy-таблицы без `org_id`. Их читает только `BILLING_ORG`, другой org получает нули.
   - Overview делает два обращения к D1: сначала `sqlite_master` (какие таблицы и вью есть), затем **одна `db.batch`** из запросов, у которых есть таблицы. Отсутствующая таблица даёт `schema_pending` секции или `null` метрики и не роняет всю пачку.
   - Неделя начинается в понедельник в 00:00 по Ташкенту (`+5 hours`).
   - `null` означает «ещё не пишется». Итоги ходов и упоры — неделя без строк с `outcome` (до R1). Воронка окна — неделя до первого события `gpt_ui_events`. Заказы — без вью 0065.
   - NS-1 считается по 93 дням хранимой истории, `readable` — только через 14 дней после начала когорты и при 14 днях истории перед ней.
   - Псевдонимы: `HMAC(GPT_HASH_SALT, "admin-alias:v1:"+ip_hash)` → `N-XXXXXXXX`, покупатель `HMAC(salt, "admin-buyer:v1:"+user_id)` → `B-XXXXXXXX`, 8 символов base32. Без соли список IP-групп — `salt_missing` (SQL не выполняется), у покупателей псевдонима нет.
2. **Эндпоинты** `functions/api/admin/ai-chat/` (все `platform_owner`; на чужой метод 405 с `Allow`):
   - `overview.ts` (`?weeks=1..12`). Секции `{ok,data,error}`: `readiness`, `weeks` (W1, W2, W4 NS-1, W8, W9, W11, W12), `models` (W6, W7, расход сегодня против лимита), `alerts` (W5, последний запуск сторожа и проверки моделей).
   - `payments.ts` (W10). Keyset по `(created_at, provider, id)`, 50 на страницу, фильтры `provider`/`state`/`mode`. Ссылки чеков проходят через `receiptLink()`.
   - `visitors.ts` (W13). `?days=1..30`, 50 групп.
   - `refund-record.ts` и `rehearsal-session.ts` — см. п. 4 и 5.
3. **Готовность** (`admin-readiness.ts`) берётся только из env.
   - По каждому провайдеру: режим, ключи режима, `liveMissing = liveReadiness()`.
   - Также: оферта, `fiscalIssues`, соль, канал алертов, срок хранения переписки, цепочки моделей и недостающие переключатели Z.ai (`GPT_MODEL_PROVIDER`, `GPT_ZAI_EVAL_APPROVED`, `ZAI_API_KEY`), доступность репетиции.
   - Только имена и признаки, значений нет.
4. **«Отметить возврат»** — общая функция `functions/lib/gpt-chat/seller-refund.ts`.
   - Через неё же теперь работают `internal/gpt-click-refund-record.ts` и ветка «только записать» в `internal/gpt-uzum-refund.ts`. Ответы внутренних эндпоинтов прежние.
   - Click и Uzum Merchant: отметкой служит подтверждение владельца. Uzum Checkout: сначала статус у Uzum, запись только при полном `REFUNDED`.
   - Повтор даёт `recorded:false` и ничего не пишет.
   - Номер заказа вводится руками, нужен номер возврата из кабинета, галочка «деньги вернулись» и второе нажатие. Без `confirmedRefund:true` — 400.
   - Закрытый заказ («оплата прошла, пакет не начал действовать») — 409 `invalid_order` со `state`, страница объясняет, что деньги возвращаются только в кабинете.
   - После записи через `ctx.waitUntil` уходит уведомление владельцу (`maintainBilling`), для Uzum — ещё и `fiscalizeDue`.
5. **«Сессия репетиции».** `openRehearsal()` в `rehearsal.ts` общий для Bearer-эндпоинта и админки. Работает только при провайдере в `test`. Ставит cookie `__Host-gpt_rehearsal` и, по галочке, синтетический `acct_rh_*`. Значения cookie есть только в `Set-Cookie`.
6. **Клиент.**
   - Файлы: `src/shared/ai-chat-admin.ts` (контракт, курсор, недели Ташкента), `src/admin/lib/ai-chat-api.ts` (через `ownerCall` из `owner-api.ts`), `src/admin/pages/AiChat.tsx` (запросы), `src/admin/components/ai-chat/*` (вид и пять карточек).
   - Подключение: `React.lazy` в `AdminApp.tsx` — отдельный чанк `AiChat-*.js`, 35,5 kB, gzip 10,3 kB. `routes.ts` `aiChat`, пункт меню `nav-ai-chat` в группе «Обзор», `ru.ts` `nav.ai_chat`.
   - На 375 px нет горизонтальной прокрутки страницы, таблицы прокручиваются внутри карточек.
7. **A1:** в `Sidebar.tsx` `it` переименован в `item`, `owner-control-center` теперь 71/71 (был 70/71).
8. **Тесты и релиз.**
   - `package.json` `test` += `gpt-admin-ai-chat`, `owner-control-center`, `signal-radar-admin-integration`. `NAV_TEST_IDS` += `nav-ai-chat`.
   - `scripts/release/pages-production.ts` `REQUIRED_FEATURES` += `['ai_chat_admin','/api/admin/ai-chat/overview']`.
   - `tests/helpers/sqlite-d1.ts`: `batch()` отдаёт строки `SELECT`, как D1 (раньше `results: []`).
9. **Мелкое.**
   - `withOwnerRole` передаёт обработчику `waitUntil` (добавлено, ничего не убрано).
   - Экспортированы `WATCHDOG_LEASE_MS`, `CATALOGUE_INTERVAL_MS` и `alertText()`.
   - Документы: новый `docs/paid-chat/ADMIN-RU.md` (для владельца). В `OFFER-RU.md`, `CLICK-FISCAL-RU.md` и `UZUM-RU.md` добавлены ссылки на кнопки админки.

**Отклонения от задачи и плана (и почему).**
1. **«Click via the existing reversal path».** Понято как тот же переход в учёте, которым пишут reversal и `gpt-click-refund-record`. Click Reversal API админка не вызывает: так требуют L12 и комментарий в `gpt-click-reversal.ts` («never a button»).
2. **Режим Click.** Отметку Click (и через админку, и через Bearer) больше не требует, чтобы режим заказа совпадал с текущим режимом Click. Иначе возврат, сделанный после выключения продаж, нельзя записать. Uzum уже работал по режиму самого заказа.
3. **«Оплата не включила пакет».** В учёте записывать нечего: заказ закрыт. Это 409 с объяснением на странице, как решено в ревью WP-25 (`OFFER-RU.md`).
4. **Репетиция из админки.** На «нет тестового провайдера» отвечает 409 `no_test_provider`, а не 404, как Bearer-маршрут: владельцу нужна причина. Id синтетического аккаунта не возвращается, только `account:true`.
5. **Два обращения к D1 в overview** (`sqlite_master`, затем одна `db.batch`). D1 выполняет пачку одной транзакцией, поэтому одна отсутствующая таблица уронила бы все секции.
6. **W3** («у потолка» по `gpt_messages.token_out`) не делается. Его заменяет `outcome='truncated'` (0066, работает с R1), а таблица с текстами не читается вовсе.
7. **Воронка — по реальным событиям WP-17**: `pack_viewed`, `login_started`, `login_result/done`, `checkout_started`, `checkout_result/paid`. События `paywall_shown` нет. Колонку `refund_requested_at` покупателя убрал WP-25, она не показывается.
8. **Где что лежит.** Готовность только из env, поэтому всегда `ok`. Последние запуски сторожа и проверки моделей (нужна D1) лежат в секции `alerts`. Payme показывается, только если он в `GPT_PAYMENT_PROVIDERS`.

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
1. **Типы, линтер, секреты.**
   - `npx tsc -b` — 0, `npm run typecheck:functions` — 0.
   - Новый тест проверен разовым tsconfig вне репозитория: ошибок в нём нет. Есть только известные расхождения окружения: `import.meta.env` в `api.ts` и `owner-api.ts`.
   - eslint по 35 изменённым и новым TS/TSX — 0. `git diff --check` чисто, хвостовых пробелов в новых файлах нет.
   - По диффу и новым файлам: регэксп токена Telegram — 0, формат ключа Z.ai — 0. `test:secret-scan` 16/16, `scan:secrets` чисто (3 274 файла).
2. **Новый `gpt-admin-ai-chat` — 12/12.**
   - Роли и 405, недели по Ташкенту, приватность, изоляция org, keyset на 120 заказах, NS-1, готовность только по именам, `schema_pending` и 503.
   - `refund-record`: Click; Uzum Checkout только после `REFUNDED`, без вызова возврата у Uzum.
   - Сессия репетиции, страница и меню.
   - Мутации ловятся: если убрать `+5 hours` из недели или поставить в курсоре `<=`, падают тесты 2 и 5.
3. **Затронутые тесты:**
   - админка: `owner-control-center` 71/71 (было 70/71), `signal-radar-admin-integration` 26/26, `bormi-admin` 45/45;
   - оплата: `gpt-rehearsal` 5/5, `gpt-uzum-payments` 26/26, `gpt-uzum-merchant` 13/13, `gpt-uzum-rehearsal` 3/3, `gpt-uzum-fiscal` 10/10, `gpt-billing` 21/21, `gpt-operations` 8/8, `gpt-live-readiness` 10/10, `gpt-click-fiscal` 14/14;
   - остальное: `gpt-watchdog` 15/15, `pages-production-release` 8/8, `legal-oferta` 18/18, `error-disclosure` 16/16, `functions-type-safety` 38/38, `gpt-model-policy` 14/14.
4. **Весь список `npm test` по одному файлу:** 90 файлов, **1204/1206**. Падают только два известных датозависимых теста `lead-radar`.
5. **Сборка и гейты.**
   - `npm run build:fast` — 0. `seo-protection check` — **10/10 без изменений**. `chat-bundle-budget` в бюджете: чат не тронут.
   - `inspectArtifact` по `dist` проходит все `REQUIRED_FEATURES`, включая `ai_chat_admin`. Останавливается только на `admin/index.html`: его даёт отдельная сборка bormi-admin в `build:production`.
6. **Приёмка вида.**
   - Статическое превью `AiChatView` с моковыми данными на собранном CSS, 127.0.0.1, вне Git.
   - Ширина 1009 px и 375×812: горизонтальной прокрутки страницы нет, таблицы прокручиваются внутри карточек. После проверки номер заказа сделан в одну строку.
   - Сервер превью остановлен.

**Для релиза R5 (делает ведущий).**
1. Миграции от WP-19 нет. Код читает 0064–0068 (в проде) и `0069` WP-24 (только индекс, раздел от него не зависит).
2. После деплоя:
   - откройте `/admin-tools/ai-chat` под владельцем;
   - «Готовность» показывает только имена;
   - «Ходы» по неделям совпадают с агрегатом из `ADMIN-RU.md`;
   - IP-группы показаны псевдонимами (соль в проде есть);
   - `support_readonly` получает 403.
3. `inert-smoke.mjs` (вне Git) можно дополнить: `GET /api/admin/ai-chat/overview` без токена → 401.
4. `build:production` → `release:pages:stamp`: guard теперь требует `ai_chat_admin` в админ-бандле.

**Владельцу.** Новых решений не нужно. Раздел описан простым языком в `docs/paid-chat/ADMIN-RU.md`.

**Открыто.**
1. Два датозависимых теста `lead-radar`, как и раньше.
2. `tests/agent-boundaries.test.ts` падает и до WP-19: `functions/agents/sotuvchi/*` и `functions/channels/telegram/*` импортируют `lib/observability`. Файлы WP-19 тут ни при чём, в `npm test` этого теста нет.
3. Псевдонимы покупателей и IP-групп сменятся, если сменить `GPT_HASH_SALT`. Это задумано.

**Дальше.** Ревью WP-19, затем WP-20 (B2B, R6) — по решению ведущего.

---

# Платный AI-чат: ревью WP-25, 2026-10-03

**Итог.** Проверил коммиты WP-25 `1ebf5e02` (31 файл: раздел 8 оферты RU/UZ, редакция `ai-paket-2026-10-v2`, окно пакета, удаление запроса возврата покупателя, страница тарифов, документы) и `1f60163f` (SHA в STATE). Сверял с задачей ведущего на WP-25 (в §4 плана такого раздела нет), с §1, §2 (L12, L13, L14, L16, L18), §5 и §6 плана `10-PROD-PLAN.md` и с `AGENTS.md` §2–8 и §11. Дерево было чистым, незаконченной работы и резервных копий не было. **Дефектов в коде нет.** Исправлены две неточности в документах (`fix(paid-chat): address WP-25 review findings`). Ничего не запушено и не задеплоено. Cloudflare, GSC, боты и вебхуки не трогались, `webhook.ts` и `TELEGRAM_BOT_TOKEN` тоже. К удалённой D1 был один агрегатный SELECT (ниже).

**Исправлено.**
1. **Low–Medium: HANDOFF и STATE WP-25 называли замечание № 1 ревью WP-24 закрытым.** Это не так.
   - `legalReviewedAt` обеих оферт и `GPT_BILLING_TERMS_APPROVED_AT` = 2026-10-03. Это дата решения владельца: раздел 8 v2 юрист не видел.
   - `scripts/release/live-gate.ts` считает это поле одобрением юриста («legalReviewedAt (the lawyer's approval)»).
   - `live-gate.ts --assume-live click` сейчас называет только две политики. Значит, как только юрист поставит дату политикам, гейт выпустит live, даже если раздела 8 v2 юрист не видел.
   - Теперь дата честно названа датой владельца, но риск процесса тот же. В STATE пункт снова среди открытых. Порядок такой: показать юристу раздел 8 v2 вместе с политиками и ставить дату политикам только после этого.
2. **Low: `docs/paid-chat/OFFER-RU.md` не говорил, как вернуть деньги, если оплата прошла, а пакет не начал действовать** (второй случай исключения (а)).
   - Все три инструмента Продавца принимают только оплаченный заказ: `gpt-click-reversal` (`paid`), `gpt-click-refund-record` и `gpt-uzum-refund` (`paid` или `refunded`). Такой заказ они отклонят с 409 `invalid_order`: у нас он уже закрыт, а Uzum шлёт алерт `uzum_paid_after_cancel`.
   - Добавлено: деньги возвращаются в кабинете провайдера, заказ в учёте остаётся закрытым, вопрос с чеком решается с бухгалтером. У Click такого быть не должно: на Complete закрытого заказа мы отвечаем `-9`, и Click платёж не проводит.

**Сделано верно** (проверено, без изменений):
- **Оферта RU/UZ, раздел 8.** Есть правило, два исключения, срок 10 рабочих дней и чек возврата. RU и UZ говорят одно и то же. Разделы 3, 6 и 11 с ним согласованы. Нет «Plus», «Pro», «obuna» и «подписки», бренд написан как «GPTBot.uz».
- **Редакция `ai-paket-2026-10-v2` везде:** в обеих офертах, в упакованном JSON и во вложенной таблице `wrangler.toml`, в тестах и в превью. В `dist` у обеих оферт стоит `data-terms-version="ai-paket-2026-10-v2"` и строка «действует с 03.10.2026».
- **Окно.**
  - Строка о невозврате стоит в подвале карточки цены (гость и вошедший без пакета), а у кого пакет уже есть — под строкой цены. При выключенной оплате её нет, как и цены.
  - Превью на 375×812: RU, гость; UZ, «Paketim» с пакетом. Кнопки возврата нет, строка поддержки с e-mail и телефоном на месте, горизонтальной прокрутки нет. Сервер превью остановлен.
- **Сервер.**
  - `POST /api/gpt/account` принимает только `cancel_invoice`, остальное получает 400 до обращения к D1. Origin, лимит тела, вход, org и режим проверяются как раньше.
  - Из `USABLE_PACK`, `PACK_VALID` и `PACKS_LEFT` убрано условие без параметров, поэтому порядок binds не изменился.
  - Уведомление владельцу снова идёт запросом из R4 (`org_id`, `live`). Все запросы фильтруют по `org_id`.
  - Возвраты Продавца не тронуты.
- **Снятие заморозки не трогает существующие строки.** Агрегат удалённой D1: в `gpt_access_periods` 0 строк, событий `refund_requested` в outbox 0 (только `COUNT`, без идентификаторов). R4 в проде флаг писал, но пакеты не замораживал.
- **Миграций нет.** Колонка `refund_requested_at` остаётся и в 0064, и в bootstrap, паритет сохранён.
- **Ключ Z.ai** (формат `<32 hex>.<16 символов>`) не найден ни в рабочем дереве, ни в диффе WP-25, ни в последних 20 коммитах.

**Замечания (не исправлял: решают ведущий и владелец).**
1. Решение о невозврате пришло только в задаче ведущего. Сообщение владельца в этом прогоне касалось ключа Z.ai. Раздел 8 v2 нужно подтвердить у владельца до R5 (WP-25 тоже это записал).
2. **Строка «действует с 03.10.2026».** По разделу 11 новая редакция действует для покупок после её публикации. Если R5 выйдет позже 03.10, дата на странице окажется раньше публикации. Продаж нет и оплата выключена, так что вреда нет. При выкате можно поставить `lastReviewedAt` = дату деплоя: это видимая дата, а не одобрение.
3. **Короткая строка окна говорит «не возвращаются» без оговорок.** Исключения описаны в оферте, ссылка на неё стоит на том же шаге оплаты, строка поддержки — в «Мой пакет». Если юрист попросит, можно добавить «кроме ошибочных списаний».
4. **`inert-smoke.mjs` (вне Git) ждёт `data-terms-version="ai-paket-2026-10-v1"` на обеих офертах.** После R5 ожидание нужно поправить (WP-25 это уже записал).

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
- **Типы, линтер, секреты:** `npx tsc -b` — 0, `npm run typecheck:functions` — 0, eslint по 20 изменённым TS/TSX — 0, `git diff --check` чисто. Регэкспы токена Telegram и ключей по диффу — 0. `test:secret-scan` 16/16, `scan:secrets` чисто (3 254 файла).
- **Тесты WP:** `gpt-billing` 21/21, `gpt-operations` 8/8, `gpt-pack-dialog` 15/15, `gpt-account-ui` 25/25, `legal-oferta` 18/18, `gpt-chat-limits` 13/13, `gpt-chat-lazy-part` 7/7, `gpt-live-readiness` 10/10, `gpt-chat-honesty` 11/11, `gpt-chat` 19/19, `gpt-uzum-payments` 26/26, `gpt-uzum-merchant` 13/13, `gpt-uzum-fiscal` 10/10, `gpt-uzum-rehearsal` 3/3, `gpt-click-fiscal` 14/14, `gpt-paid-chat-schema` 4/4, `runtime-config` 4/4, `pages-config-parity` 7/7, `seo-content-guards` 7/7, `seo-revenue-claims` 7/7, `gpt-readiness` 9/9.
- **Весь список `npm test` по одному файлу:** 87 файлов, **1095/1097**; падают только два известных датозависимых теста `lead-radar`.
- **Сборка и гейты:** `npm run build:fast` — 0. `seo-protection check` — **10/10 без изменений**. `seo-audit` — 0 critical, 45 пар RU/UZ. `chat-bundle-budget` в бюджете (`chat-account` 10 203 Б br).
- **`live-gate.ts`:** закоммиченный конфиг даёт `issues: []`, а `--assume-live click` называет только `legalReviewedAt` двух политик.

**Дальше.** WP-19 (админка «AI-чат», R5) — по решению ведущего.

---

# Платный AI-чат: WP-25 — оплаченный пакет не возвращается, редакция оферты `ai-paket-2026-10-v2`, 2026-10-03

**Итог.** Сделан WP-25 на ветке `paid-chat/prod-readiness` поверх `bd65b94b` (ведущий: Z.ai `glm-4.7-flash` первой моделью), коммит `1ebf5e02` (`1ebf5e021224b4cce40a900c102c53c3fdb94193`; следующий коммит только записывает этот SHA в STATE и сюда, правило D-006). Решение владельца от 03.10.2026 заменяет все прежние правила возврата (полный возврат в любой момент из R4 и возврат неиспользованной части из WP-24): **оплаченный AI-пакет не возвращается**, услуга считается оказанной, когда пакет начал действовать. Два узких исключения: (а) деньги, списанные по ошибке (дважды за одну покупку или оплата прошла, а пакет не начал действовать), — Продавец проверяет заказ и возвращает всю сумму на ту же карту не позднее 10 рабочих дней со дня обращения; (б) случаи, когда возврат прямо требует законодательство Республики Узбекистан. Запроса возврата у покупателя больше нет нигде: ни кнопки, ни действия API, ни заморозки пакета. Возвраты Продавца (Click reversal и отметка, Uzum refund только после `REFUNDED`, Merchant `/reverse`) не тронуты. Оплата по-прежнему выключена. Ничего не запушено и не задеплоено; Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты. Защищённые страницы 10/10 без изменений.

**Откуда решение.** Текст решения пришёл в задаче ведущего на WP-25 (сценарий `r5-r7-build.js`). Сообщение владельца, которое запустило этот прогон, касалось только ключа Z.ai (его ведущий уже подключил в `bd65b94b`, ключ — секрет Pages, в Git его нет: проверено поиском по истории). **Ведущему: перед выкатом R5 подтвердите у владельца раздел 8 v2** — это публичная оферта.

**Возобновление.** Дерево было чистым на `bd65b94b`, незаконченной работы и резервных копий `wp25-*` не было.

**Что сделано.**
1. **Оферта RU/UZ, раздел 8** (`content/pages/{ru,uz}/oferta.json`): правило (не возвращается ни полностью, ни частично, в том числе за неиспользованные ответы), исключения (а) и (б), срок поступления денег зависит от банка, чек возврата. Пример 13 333 и формула ушли. Раздел 6 («чек на оплату и на возврат») и раздел 11 не менялись. Метаописания: «чек, возврат» → «чек, условия возврата» (RU `description`, `ogDescription`, `heroSubtitle`; UZ `ogDescription`, `heroSubtitle`).
2. **Редакция и дата.** `termsVersion` обеих оферт и `GPT_BILLING_TERMS_VERSION` (упакованный JSON и вложенная таблица `wrangler.toml`) = `ai-paket-2026-10-v2`; `legalReviewedAt` обеих оферт и `GPT_BILLING_TERMS_APPROVED_AT` = `2026-10-03` (дата решения владельца). **Владелец изменил раздел о возврате после проверки юристом 01.10 (v1)**: дата v2 — одобрение владельца, а не юриста. Комментарий в `wrangler.toml` и `OFFER-RU.md` говорят то же. Открытый счёт и код приложения Uzum, выданные под v1, после выката получат 409 `terms_changed` / новый код — так задумано (продаж не было).
3. **Окно «AI-пакет» и «Мой пакет».**
   - До оплаты, рядом с ценой: карточка пакета (гость и вошедший без пакета) — строка в подвале карточки под «Без автосписаний»; у кого пакет уже есть — сразу под строкой цены. RU «Деньги за оплаченный пакет не возвращаются: он начинает действовать сразу после оплаты.», UZ «To‘langan paket uchun pul qaytarilmaydi: u to‘lovdan keyin darhol amal qila boshlaydi.» Обычный текст, без галочки-«преимущества»; оба примечания подвала карточки теперь 12 px (было 11), чтобы условие не было мелким шрифтом.
   - Убраны «Запросить возврат», подтверждение с суммой, «Запрос на возврат принят», состояние «заморожен», CSS `.gpt-refund-confirm`. Вместо строки «Вопросы об оплате и возврате:» — одна нейтральная строка RU «Проблема с оплатой? Напишите или позвоните: ceo@gptbot.uz, +998 50 587 07 20», UZ «To‘lovda muammo bormi? Yozing yoki qo‘ng‘iroq qiling: …» (тот же `SupportLine`: «Мой пакет», отмена и долгое ожидание оплаты).
   - Остались статус «Платёжная система подтвердила возврат» и ссылка «Чек возврата»: это возврат Продавца.
4. **Сервер — мёртвый код покупательского запроса удалён.** `BillingStore.requestRefund` и `refundable`, тип `RefundablePack`, `refundUzs`, `REFUND_REQUEST_METHOD`, `refundRequestUnused`, `REFUND_WORKING_DAYS` (`billing-config.ts`), строка суммы к выплате в уведомлении владельцу (`billing-maintenance-store.ts`, запрос outbox снова как в R4), `refundable` и `pack.refundDays` в account view, действие `refund_request` в `POST /api/gpt/account` (теперь там только `cancel_invoice`, остальное — 400 `bad_request`). Фильтры заморозки `refund_requested_at IS NULL` в `USABLE_PACK` (`billing-store.ts`) и `PACK_VALID`/`PACKS_LEFT` (`turn-store.ts`) убраны: колонку больше никто не пишет. Колонка `gpt_access_periods.refund_requested_at` (миграция 0064) осталась в схеме — миграции только аддитивные. `gpt_uzum_orders.refund_requested_at` — это возврат Продавца через Uzum, не тронут.
5. **Клиент.** `types.ts`: нет `refundable`, `refundDays`, `access.refund_requested_at`; ответ старого сервера с этими полями окно читает и игнорирует (тест). `PackPanel` без `onRefund`; `AccountDialog` без `requestRefund`/`refundAsked`.
6. **`/ru/tarify-ai-chat/`**: строка про оферту теперь «Оплаченный AI-пакет не возвращается: он начинает действовать сразу после оплаты. Деньги, списанные по ошибке, возвращаются. Цена, лимиты, оплата, чек и условия возврата подробно описаны в публичной оферте.» Страница не защищённая.
7. **Документы:** `OFFER-RU.md` (редакции, «Одобрение редакции», новый раздел «Возврат: оплаченный пакет не возвращается», вопрос юристу № 2), `UZUM-RU.md` (вопрос 9, раздел 7), `CLICK-FISCAL-RU.md` (возврат через API — только исключения оферты), `ALERTS-RU.md` (уведомления одной строкой). `LOGIN-RU.md` и `CHECKOUT-RU.md` возвратов не касаются — без изменений. Тексты бота (`functions/lib/telegram/**`) пакетов и возвратов не упоминают — без изменений.
8. **Превью** `scripts/pack-window-preview.ts`: редакция v2, без `refundable`; новое состояние `refunded` (возврат Продавца с чеком возврата); `POST /api/gpt/account` кроме `cancel_invoice` отвечает 400, как сервер. `scripts/gpt-billing-rehearsal.ts`: импорт `refund` переименован в `accountAction`.

**Отклонения и решения (и почему).**
1. **WP-25 нет в плане §4**: состав — задача ведущего.
2. **Редакция повышена до v2**, хотя продаж не было (раньше правки шли в v1): так велел ведущий, и номер на странице однозначно называет текст — v1 R4 уже опубликовал. `OFFER-RU.md` теперь требует новой редакции на любую правку текста.
3. **`REFUND_WORKING_DAYS` удалён**, а не оставлен: после удаления запроса его читал только тест. 10 рабочих дней тест `legal-oferta` сверяет с текстом оферты дословно.
4. **Политики не менялись.** Они говорят об обработке данных «чтобы … сделать возврат» и о передаче Click/Uzum «для оплаты, чека и возврата» — это верно и для исключений оферты. Даты одобрения у политик по-прежнему нет.
5. **Заморозка пакета убрана целиком**, а не оставлена «на всякий случай»: колонку больше никто не пишет; пакет закрывает только возврат Продавца (`revoked_at`). В R4 (прод) заморозки не было, оплата выключена — строк с `refund_requested_at` в проде быть не может.
6. **Разделы оферты 1–7 и 9–13 не менялись.** Раздел 8 сохранил заголовок «8. Возврат» / «8. Pulni qaytarish» и строку «Написать или позвонить Продавцу можно по контактам в конце страницы».

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
1. `npx tsc -b` — 0; `npm run typecheck:functions` — 0. Изменённые тесты и скрипты — разовым tsconfig вне репозитория: новых ошибок нет (остались только расхождения окружения, как в WP-24: `json()` как `unknown` под workers-types, `import.meta.env`, `window.ym`). eslint по 20 изменённым TS/TSX — 0; `git diff --check` — чисто; регэксп токена Telegram по диффу — 0; ключа Z.ai нет ни в диффе, ни в истории Git; `test:secret-scan` 16/16, `scan:secrets` — чисто (3 254 файла).
2. Тесты по одному файлу: `gpt-billing` 21/21 (тест WP-24 о правиле возврата заменён тестом WP-25), `gpt-operations` 8/8 (уведомление владельцу о продаже и о возврате Продавца — одной строкой), `gpt-pack-dialog` 15/15, `gpt-account-ui` 25/25, `legal-oferta` 18/18 (новый тест «(h)»), `gpt-chat-limits` 13/13, `gpt-chat-lazy-part` 7/7, `gpt-live-readiness` 10/10, `gpt-chat-honesty` 11/11, `gpt-chat` 19/19, `gpt-uzum-payments` 26/26, `gpt-uzum-merchant` 13/13, `gpt-uzum-fiscal` 10/10, `gpt-uzum-rehearsal` 3/3, `gpt-click-fiscal` 14/14, `gpt-paid-chat-schema` 4/4, `gpt-events-retention` 2/2, `gpt-readiness` 9/9, `runtime-config` 4/4, `pages-config-parity` 7/7, `pages-production-release` 8/8, `seo-page-integrity` 17/17, `seo-link-graph` 17/17, `seo-content-guards` 7/7, `seo-revenue-claims` 7/7, `site-stylesheets` 5/5. Весь список `npm test` по одному файлу: 87 файлов, **1095/1097** — падают только два известных датозависимых теста `lead-radar`.
3. Что доказывают новые тесты: `POST /api/gpt/account {action:"refund_request"}` → 400 `bad_request`; пакет после этого отвечает дальше (199 из 300 после 100 использованных), в журнале нет строк покупателя, в outbox только `paid`, в account view нет `refundable`, `pack.refundDays`, `access.refund_requested_at`; пакет закрывает только возврат Продавца (`refunded`, `revoked_at`). Ответ старого сервера с полями возврата окно читает и игнорирует. Раздел 8 RU/UZ, строки окна и страница тарифов сверяются дословно; формула, пример 13 333, «Запросить возврат» запрещены в обеих офертах.
4. `npm run build:fast` — 0 (дважды, второй раз с финальным CSS); `seo-protection check` — **10/10 без изменений**; `seo-audit` — 123 страницы, 0 critical, 0 сирот, 45 пар RU/UZ; `chat-bundle-budget` в бюджете (старт 106 694 Б br, +71 к базе R4; `chat-account` 10 203, +423 к базе и на 565 меньше, чем после WP-24; `chat-lead` 4 399; `chat-tools` 6 244); `live-gate.ts` — закоммиченный конфиг `issues: []`, `--assume-live click` — только `legalReviewedAt` двух политик. В `dist` обе оферты с `data-terms-version="ai-paket-2026-10-v2"` и новым разделом 8, `/ru/tarify-ai-chat/` с новой строкой; на защищённых страницах обещаний возврата нет.
5. **Приёмка локально** (`scripts/pack-window-preview.ts`, Browser pane 375×812; сервер превью остановлен): RU, гость — строка о невозврате в подвале карточки цены под «Без автосписаний» (оба примечания подвала теперь 12 px, было 11); RU, «Мой пакет» с пакетом — кнопки возврата нет, строка о невозврате под строкой цены, «Проблема с оплатой? Напишите или позвоните: ceo@gptbot.uz, +998 50 587 07 20»; UZ, состояние `refunded` — «To‘lov tizimi pul qaytarilganini tasdiqladi…», «Pulni qaytarish cheki», строка поддержки UZ. Горизонтальной прокрутки нет; в консоли только заблокированные CSP inline-скрипты аналитики (так задумано в превью).

**Для релиза R5 (делает ведущий).**
1. **Подтвердить у владельца раздел 8 v2** (см. «Откуда решение»), затем выкатывать.
2. После деплоя: `/ru/oferta/` и `/uz/oferta/` — `data-terms-version="ai-paket-2026-10-v2"`, раздел 8 новый; `/ru/tarify-ai-chat/` с новой строкой; IndexNow и `sitemap-updates.xml` для трёх страниц (вместе с политиками из WP-24).
3. `inert-smoke.mjs` (вне Git): `termsVersion` в `/api/gpt/account` теперь `ai-paket-2026-10-v2`, в `pack` больше нет `refundDays`; если инструмент ждёт старые значения — поправить ожидание.
4. Бандл: после выката — `chat-bundle-budget.ts --record`.

**Владельцу и юристу.**
1. Показать юристу раздел 8 v2 (вопрос 2 в `OFFER-RU.md`): достаточно ли общей ссылки на законодательство (отказ потребителя от услуги по ЗРУ «О защите прав потребителей», дистанционная продажа). Если юрист поправит — редакция v3 и новая дата.
2. Вычитка UZ носителем: раздел 8 оферты, строки окна `noRefund` и `supportLabel`.

**Открыто.**
1. Пункты WP-24 «учёт и чек частичного возврата» и замечания ревью WP-24 № 1 (дата при изменённом разделе 8), № 2 (ответ «в полёте» при запросе возврата) и № 4 (ручная выплата части суммы) сняты: частичных возвратов и запроса больше нет. № 3 (уведомления об отменённых счетах) остаётся.
2. Срок пакета в UTC (ревью WP-18, п. 2) — не менялось.
3. Два датозависимых теста `lead-radar`.

**Дальше.** Ревью WP-25, затем WP-19 (админка «AI-чат», R5) — по решению ведущего.

---

# Платный AI-чат: ревью WP-24, 2026-10-03

**Итог.** Проверил коммиты WP-24 `ca24274e` (48 файлов: незавершённый счёт, два пакета, правило возврата, срок `gpt_events` и миграция `0069`, ожидание сверки Uzum, общий файл хостов чеков, вход ботом кнопкой, политики, дата юриста, `media.ts`) и `c8f5407b` (SHA в STATE). Сверял с задачей ведущего (12 пунктов; раздела WP-24 в §4 плана нет), §1, §2 (L7, L14, L16), §5 и §6 плана `10-PROD-PLAN.md`, с `AGENTS.md` §2–8 и §11. Дерево было чистым, незаконченной работы и резервных копий не было. **Один дефект средней важности исправлен** (текст политик о получателях вопроса); код рантайма не менялся. Ничего не запушено и не задеплоено; удалённая D1, Cloudflare, GSC, боты и вебхуки не трогались; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты.

**Дефект, исправлен (`fix(legal): address WP-24 review findings`).**
1. **Medium: политики RU/UZ называли закрытый список компаний, которые получают вопрос.** WP-24 написал: «Поставщики AI-моделей, которым OpenRouter передаёт вопрос: сейчас это NVIDIA, dots-studio, Google и Mistral AI…». Но OpenRouter запускает модель у провайдера, который её предоставляет: это её разработчик или сторонний хостинг. Платная модель по нашему же запросу переключается между провайдерами (`allow_fallbacks` в `functions/lib/gpt-chat/openrouter-chat.ts`). Значит, вопрос может получить компания, которой в списке нет, а тест `legal-oferta` считал список полным.
   - Теперь (RU): «Компании, у которых работает AI-модель: OpenRouter передаёт им вопрос и историю разговора. Это разработчик модели или другой провайдер, который предоставляет эту модель через OpenRouter. Сейчас чат и бот используют модели NVIDIA (Nemotron), dots-studio (dots), Google (Gemma) и Mistral AI (Mistral Small), а для разбора записи в боте — модель OpenAI…». UZ — тот же смысл («AI model ishlaydigan kompaniyalar… model ishlab chiquvchisi yoki shu modelni OpenRouter orqali taqdim etadigan boshqa provayder…»).
   - Проверка «каждый разработчик из развёрнутых цепочек назван в обеих политиках» осталась. Тест дополнительно требует в обеих политиках фразу о другом провайдере.
   - `docs/paid-chat/OFFER-RU.md`: описание политики и вопрос юристу № 3. Если юрист потребует закрытый список получателей, это делается настройкой маршрута OpenRouter (`provider.order` / `only`), а не текстом.

**Сделано верно** (проверено, без изменений):
- **Незавершённый счёт.** Закрыть можно только свой `pending` без внешнего номера и в режиме посетителя. Гонка с Prepare или регистрацией закрыта трижды: `transition` перечитывает заказ; запись журнала идёт с условием `version` и `external_id IS NULL`; `attachCheckout` пишет номер Uzum только в `pending`, иначе `transition(prepared)` падает, и страницы оплаты человек не получает. На закрытый счёт Click Prepare отвечает `-9`, Payme CreateTransaction — `-31008`: заплатить по нему нельзя. Повтор — 200; чужой аккаунт, чужая org, чужой режим — 404; чужой Origin — 403.
- **Два пакета.** `access`, `usablePacks` и `PACKS_LEFT` сортируют одинаково (`ends_at, order_id`); порядок binds во всех запросах `TurnStore` и `BillingStore` сверен. Org B пакетов org A не видит.
- **Правило возврата.** `refundUzs`: 20 000 × 200 / 300 = 13 333. Заморозка — один batch: журнал с числом неиспользованных, затем флаг (только если журнал записан), затем outbox. Повтор суммы не меняет; пустой пакет запросить нельзя; сумма в окне и у владельца берётся из журнала. Бот (`functions/lib/telegram/**`) пакетов не читает, `gpt_subscriptions` нигде не читается — заморозка их не касается.
- **`0069` и уборка `gpt_events`.** Миграция — только `CREATE INDEX IF NOT EXISTS`, совпадает с bootstrap, порядок не важен. Уборка ограничена 500 строками за тик; `created_at` везде ISO (`lead.ts`, `lead-outbox.ts`, `web-handoff.ts`). Кода, которому нужны строки старше 93 дней, нет: таблицу читает только законченный rekey соли.
- **Ожидание сверки Uzum.** Binds, алиас `o`, фильтр по org и уборка через сутки верны. Кнопка «Проверить статус» в панели ожидание не учитывает — так и надо.
- **Остальное.** `media.ts`: `redirect: 'manual'` и отказ на 3xx. Хосты чеков — один файл для сервера и окна. Вход ботом — кнопка, nonce в DOM нет. Код Uzum сохраняет черновик.
- **Тексты** RU/UZ естественные, «GPTBot.uz», без Plus, Pro, obuna и «подписки». Раздел 8 оферты RU/UZ согласован с кодом и с разделом 3.

**Замечания (не исправлял: решают ведущий и владелец).**
1. **Дата одобрения оферты 2026-10-01 при изменённом разделе 8.** Так велел ведущий, и WP-24 это отметил. Риск процесса: live-гейт проверяет только дату. Когда юрист поставит дату политикам, гейт выпустит live, даже если раздел 8 он не видел. Показывать юристу раздел 8 вместе с политиками.
2. **Ответ «в полёте» в момент запроса возврата считается использованным.** Если он потом сорвётся (по разделу 4 такой ответ не списывается), покупатель недополучит долю одного ответа — 66 сум. Редкий край.
3. **Отмена счёта уходит владельцу в Telegram** как `cancelled`, так же как истечение. Счетов можно открыть 10 в час на аккаунт, поэтому вошедший человек может вызвать до 10 таких сообщений в час (раньше — около двух в сутки). Если это помешает, можно не класть в outbox `invoice_cancelled`: счёт, который провайдер не видел, денег не касался.
4. **Ручная выплата части суммы ничем не закрывает запрос.** В панели остаётся «вернём N сум… в течение 10 рабочих дней», пока пакет не отозван. `gpt-click-reversal` и `gpt-click-refund-record` возвращают всю сумму и не смотрят, сколько ответов использовано. Это часть открытого пункта WP-24 «учёт и чек частичного возврата».

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
1. `npx tsc -b` — 0; `npm run typecheck:functions` — 0; eslint по 33 TS-файлам WP-24 и по `tests/legal-oferta.test.ts` — 0; `git diff --check` — чисто; регэксп токена Telegram по диффу — 0; `test:secret-scan` 16/16, `scan:secrets` — чисто (3 252 файла).
2. Тесты WP-24 до правки: `gpt-billing` 21/21, `gpt-operations` 8/8, `gpt-chat-limits` 13/13, `gpt-account-ui` 25/25, `gpt-pack-dialog` 15/15, `gpt-chat-lazy-part` 7/7, `gpt-uzum-payments` 26/26, `legal-oferta` 17/17, `gpt-live-readiness` 10/10, `gpt-events-retention` 2/2, `market-media-proxy` 3/3. После правки `legal-oferta` 17/17. Весь список `npm test` с правкой: 87 файлов, **1094/1096** — падают только два известных датозависимых теста `lead-radar`.
3. `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений**; `seo-audit` — 0 critical, 0 сирот, 45 пар RU/UZ.
4. `live-gate.ts`: закоммиченный конфиг — `issues: []`; `--assume-live click` — только `legalReviewedAt` двух политик.

**Для релиза R5** — как в разделе WP-24 ниже; обе политики там уже в списке переобхода.

**Дальше.** WP-19 (админка «AI-чат», R5) — по решению ведущего.

---

# Платный AI-чат: WP-24 — доводка после R4: незавершённый счёт, два пакета, правило возврата, срок `gpt_events`, Uzum без голодания, политика, 2026-10-03

**Итог.** Сделан WP-24 (пункты ревью R4 из задачи ведущего; в плане `10-PROD-PLAN.md` §4 раздела WP-24 нет) на ветке `paid-chat/prod-readiness` поверх `2cdea35f` (запись выката R4: в проде `6502224c`), коммит `ca24274e` (`ca24274e8c51bd1772441ab55ad845bb9780294d`; следующий коммит только записывает этот SHA в STATE, правило D-006). Оплата по-прежнему выключена: всё новое недостижимо, пока нет провайдера. Ничего не запушено и не задеплоено; Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались (одна попытка агрегатного SELECT по `gpt_events` отклонена Cloudflare с кодом 7403 — ничего не прочитано); `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты. Защищённые страницы 10/10 без изменений.

**Возобновление.** Дерево было чистым на `6502224c`, незаконченной работы и резервных копий `wp24-*` не было. Пока шла работа, ведущий закоммитил в ветку `2cdea35f` (квитанции выката R4 и новая база бандла); с файлами WP-24 он не пересекается.

**Что сделано.**
1. **Незавершённый счёт (решение и `docs/paid-chat/CHECKOUT-RU.md`).** Счёт, который провайдер ещё не видел (`pending` без внешнего номера: Click без Prepare, Payme без CreateTransaction, Uzum Checkout без регистрации), человек закрывает сам: `POST /api/gpt/account {action:"cancel_invoice"}` → `BillingStore.cancelInvoice` (журнал `invoice_cancelled`, актор `user`). Счёт, который провайдер принял (`prepared`), закрыть нельзя — 409 `invoice_in_progress`; его можно продолжить или дождаться. Переход условный: `from: ['pending']` и новая опция `transition({unseen: true})` (проверка и в условии записи журнала `external_id IS NULL`), так что Prepare или регистрация между чтением и записью побеждают. Тем же `unseen` теперь закрывает «невиденный» счёт и оплата в приложении Uzum. Account view отдаёт `payment.cancellable`.
   - Окно: на шаге оплаты блок «Продолжить этот платёж» + «Отменить этот счёт» (или «счёт уже открыт в Click, закроется сам»); на 409 `pending_elsewhere` — «Счёт через X ещё открыт… что с ним можно сделать — ниже»; на экране «Проверяем оплату» — «Продолжить или сменить способ оплаты» (сразу, если провайдер счёт не видел; через 2 минуты, если видел); на экране кода Uzum — то же (код заказа не создаёт). Оплаченный платёж показывается оплаченным и после перехода.
2. **Два пакета.** Ответы считаются по всем действующим пакетам: `TurnStore.allowance` и `explain` (SSE `done`, 429, account view) — сумма остатков пакетов аккаунта (`PACKS_LEFT`); `BillingStore.usablePacks` заменил `paidThrough`. В `access`: `packs`, `totalLimit`, `paidThrough` (самый поздний конец), `firstRemaining`. «Paketim»: «420 / 600 ответов осталось в пакетах», «Действует до <последний конец>», «Сначала тратится пакет до <дата>: в нём осталось 120 ответов». Строка чата «AI-пакет · ответов осталось: N» тоже показывает итог.
3. **Код Uzum Bank** сохраняет неотправленный вопрос, как переход на страницу оплаты (`onLeave` и для `flow: "code"`).
4. **Вход ботом:** «Открыть Telegram» — `<button>`, ссылку с nonce открывает `window.open` (заблокировано — та же вкладка, попытка переживает перезагрузку). В DOM нет `href` с nonce: исходящие клики Метрики и GA4 (enhanced measurement), менеджер тегов и запись сеанса его не видят.
5. **Тик Uzum не голодает:** заказ, который ответ Uzum не сдвинул (`AUTHORIZED`, несовпадение суммы с алертом, нет чека) или который нечем спросить (нет ключей режима, Uzum не ответил), ждёт четверть своего возраста, 15 мин…6 ч (`uzumWait`); ожидание — строка `uzum_wait:<заказ>` в `gpt_billing_ops` (без DDL на финансовой таблице), через сутки после конца удаляется. Тест: 5 «застрявших» не дают сверить шестой только один тик.
6. **Тест Uzum без автофискализации** снова сверяет тела запросов целиком: регистрация — тело теста 2 без корзины, возврат — ровно `{orderId, amount: 2000000}`.
7. **Хосты чеков:** правило было общим с WP-15, но жило в трёх копиях. Теперь один источник `src/shared/payment-hosts.ts` (`UZUM_HOST`, `receiptHost`) для `allowedUzumReceipt`/`receiptLink` (сервер) и `safeAccountLink`/`allowedCheckoutUrl` (окно); тест сверяет все три функции на 14 ссылках.
8. **Срок `gpt_events`:** уборка в `maintainBilling` — старше 93 дней (`TELEMETRY_RETENTION_DAYS`, `created_at` — ISO-текст), по 500 за тик. Индекс `idx_gpt_events_created` — новая миграция `0069_gpt_events_retention.sql` и тот же DDL в bootstrap (`CHAT_EVENT_INDEXES`, `ensureSchema`); тест паритета, двойного применения через ledger и любого порядка (код до миграции — тоже чисто), план запроса идёт по индексу. `gpt_ui_events` уже убирался с WP-18. Политика: счётчик окна и случайный номер вкладки уже названы (WP-18); «Сроки хранения» теперь прямо называют шаги окна и отметки о заявках и переходах в бота.
9. **Правило возврата (решение ведущего):** пока пакет действует — неиспользованная часть = цена × неиспользованные / 300, вниз до целого сума (`refundUzs`), ничего не использовано — полная цена; выплата владельцем за 10 рабочих дней (`REFUND_WORKING_DAYS`) на ту же карту.
   - Запрос «замораживает» пакет: ответы из него не списываются (`USABLE_PACK`, `PACK_VALID`), а неиспользованные ответы на момент запроса пишутся в журнал (`method = 'refund_requested:<число>'`), и только после этого ставится `refund_requested_at` — сумма не меняется от того, что досчитается потом. Запросить можно только действующий пакет с неиспользованными ответами: пустой сервер отклоняет, окно его не предлагает.
   - Сервер отдаёт в `refundable` `unused` и `refund_uzs`, в `pack` — `refundDays`. Окно: подтверждение «Не использовано 200 из 300 ответов — вернём 13 333 сум на карту, с которой платили, в течение 10 рабочих дней. Ответы из этого пакета сразу перестанут списываться»; после запроса — «Запрос на возврат принят: 13 333 сум вернём…». Замороженный пакет не называется «закончившимся».
   - Владелец получает в Telegram (live): «Вернуть 13 333 сум (не использовано 200 из 300 ответов) в течение 10 рабочих дней на карту, с которой платили».
   - Оферта RU/UZ, раздел 8, переписан (формула, полная цена, пример 13 333, момент подсчёта, 10 рабочих дней, та же карта, после срока не возвращается); `OFFER-RU.md` — раздел «Возврат по правилу оферты», `UZUM-RU.md` §7, вопросы юристу.
10. **Получатели в политике RU/UZ:** OpenRouter, Inc. (США) — сервис, через который чат и бот обращаются к моделям; поставщики моделей поимённо — NVIDIA, dots-studio, Google, Mistral AI (цепочки `OPENROUTER_MODEL_*`) и OpenAI (разбор записи в боте, `ANALYSIS_DEFAULT_MODEL`); Groq и OpenAI — распознавание голосовых сообщений бота (их в политике не было). Основание трансграничной передачи не заявлено. Тест берёт модели из развёрнутых цепочек: новый поставщик без строки в политиках роняет `legal-oferta`.
11. **Одобрение юриста:** `GPT_BILLING_TERMS_APPROVED_AT="2026-10-01"` (JSON и вложенная таблица) и `legalReviewedAt: "2026-10-01"` у обеих оферт — по словам владельца, что юрист одобрил оферту. **Раздел 8 (возврат) изменён после этой даты — его нужно показать юристу** (как и обновлённые политики).
12. **`functions/platform/market/media.ts`:** `redirect: 'manual'` и явный отказ на 3xx (тело освобождается) вместо `'error'`, который workerd отвергает. Новый `tests/market-media-proxy.test.ts`: фейк отвергает `'error'`, как workerd; редирект на `getFile` и на файле — `null` без перехода; и проверка, что в `functions/` и `workers/` больше нет `redirect: 'error'`.

**Отклонения и решения (и почему).**
1. **WP-24 нет в плане §4**: состав взят из задачи ведущего (12 пунктов) и открытых пунктов ревью R4 в этом файле.
2. **Счёт не закрывается автоматически**, только кнопкой: страница оплаты могла остаться открытой в другой вкладке. Закрыть можно лишь невиденный провайдером счёт: по нему никто не может платить.
3. **Остаток для чата — по всем пакетам**, а не только по тому, из которого списывается первым: иначе строка чата и «Paketim» расходились бы. Следствие: у отказа `monthly` поле `remaining` теперь — остаток других пакетов (тест `gpt-chat-limits` поправлен; такой отказ чат и раньше переигрывал бесплатным ходом).
4. **Заморозка пакета при запросе возврата** — иначе «неиспользованные ответы» не определены, пока пакет продолжает работать. Прежний текст «доступ сохраняется до решения» убран: решения больше нет, правило механическое.
5. **Выплата части суммы пока только вручную.** Инструменты возврата (`gpt-click-reversal`, `gpt-click-refund-record`, `gpt-uzum-refund`) записывают только полный возврат; частичный Uzum отметить нельзя (409, `uzum_partial_refund`), чек возврата на часть суммы очередь не печатает. Нужны ответы Click (частичный reversal) и бухгалтера (чек частичного возврата) — открытый пункт ниже.
6. **Политикам дату одобрения не ставил**: владелец говорил об оферте, а тексты политик WP-24 к тому же меняет. Live-гейт `--assume-live click` называет теперь только `legalReviewedAt` двух политик. Тест `legal-oferta` больше не требует даты у политик вместе с датой оферты (её требует гейт при деплое).
7. **Редакция оферты осталась `ai-paket-2026-10-v1`**, хотя R4 уже опубликовал её с полным возвратом: продаж не было, редакцию никто не принял (правило `OFFER-RU.md`). При выкате R5 текст `/ru/oferta/` и `/uz/oferta/` меняется под той же редакцией — переобход обязателен.
8. **`0069` — только индекс** (порядок миграции и кода не важен). Ожидание сверки Uzum сделано строками `gpt_billing_ops`, а не колонкой `gpt_uzum_orders`: без ALTER финансовой таблицы.
9. **Контакт студии (L14)** уже один параметр с R3: `content/global/site.json` → `studioTelegram` (пусто; рабочий Telegram — одна строка), личного Telegram на сайте нет. Четыре страницы GPTBot Market (`MARKET_SUPPORT_URL`) не тронуты.

**Проверки** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу).
1. `npx tsc -b` — 0; `npm run typecheck:functions` — 0. Изменённые тесты и `scripts/pack-window-preview.ts` — разовым tsconfig вне репозитория: новых ошибок нет (остаются только расхождения окружения: без workers-types не видны типы D1, и старые строки `gpt-billing`/`gpt-live-readiness`).
2. Весь список `npm test` по одному файлу: 87 файлов, **1094/1096** — падают только два известных датозависимых теста `lead-radar`. Новые и изменённые: `gpt-billing` 21/21 (+3), `gpt-operations` 8/8 (+1), `gpt-chat-limits` 13/13, `gpt-account-ui` 25/25 (+1), `gpt-pack-dialog` 15/15 (+3), `gpt-chat-lazy-part` 7/7, `gpt-uzum-payments` 26/26 (+2), `legal-oferta` 17/17 (+1), `gpt-live-readiness` 10/10, `gpt-events-retention` 2/2 (новый), `market-media-proxy` 3/3 (новый); вне списка `pages-production-release` 8/8, `seo-page-integrity` 17/17, `secret-scan` 16/16.
3. Мутации — 15 из 15 ловятся: скан Uzum без ожидания; заморозка без `refund_requested_at`; сумма не из журнала; закрытие без `unseen`; остаток только своего пакета; `redirect: 'error'` в media; 3xx без отказа; уборка `gpt_events` выключена; код Uzum без `onLeave`; ссылка входа как `<a href>`; «сменить способ» только после 2 минут; панель без итога пакетов; сообщение владельцу без суммы; политика без dots-studio; лишний хост чека в окне.
4. eslint по изменённым и новым файлам — 0; `git diff --check` — чисто; регэксп токена Telegram по диффу — 0; `scan:secrets` — чисто (3 252 файла).
5. `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений**; `seo-audit` — 123 страницы, 0 critical, 0 сирот, 45 пар RU/UZ; `chat-bundle-budget` в бюджете (старт 106 747 Б br, +124 к базе R4; `chat-account` 10 768, +988; `chat-lead` 4 429; `chat-tools` 6 250); `live-gate.ts` — закоммиченный конфиг `live: false`, `issues: []`; `--assume-live click` — только `legalReviewedAt` двух политик.
6. **Приёмка локально** (`scripts/pack-window-preview.ts`, Browser pane 375×812, RU и UZ; сервер превью остановлен): счёт, который Click не видел → «Отменить этот счёт» → «Платёж отменён», после галочки доступны и Click, и Uzum Bank; «Продолжить этот платёж» → «Проверяем оплату» сразу с блоком «Продолжить или сменить способ оплаты» → шаг оплаты → сервер говорит «оплачено» → «Оплата получена»; два пакета (UZ): «420 / 600 · ta javob 2 ta paketda qoldi», последний конец, строка о первом пакете, подтверждение возврата с суммой, затем «So‘rovingiz qabul qilindi: … so‘mni 10 ish kuni ichida…»; вход ботом — в DOM нет `login_`, только кнопка; код Uzum — вопрос из поля сохранён в `gptchat_draft`, «Davom ettirish yoki to‘lov usulini almashtirish» ведёт к шагу оплаты; горизонтальной прокрутки нет; в консоли только заблокированные CSP inline-скрипты аналитики (так задумано в превью).

**Для релиза R5 (делает ведущий).**
1. **Миграция `0069_gpt_events_retention.sql`**: в очереди ровно она; репетиция на копии экспорта (`rehearse-migrations.mts … --expect 0069_gpt_events_retention.sql`): только индекс, строк не меняется. Порядок с кодом не важен, но по процедуре — до деплоя.
2. **Сколько строк `gpt_events` уйдёт в первые тики** — не измерено (Cloudflare 7403 из этой сессии). Агрегат до деплоя: `SELECT COUNT(*) n, SUM(created_at < '<сейчас − 93 дня, ISO>') old FROM gpt_events`. Уборка — 500 строк за 15 минут (2 000 в час).
3. **После деплоя:** `inert-smoke.mjs` — у Click в `INFO` больше нет `GPT_BILLING_TERMS_APPROVED_AT` (дата задана), остаются `GPT_BILLING_MODE_CLICK`, `GPT_BILLING_LIVE_READY`, `GPT_CLICK_CREDENTIALS_JSON`; если инструмент вне Git ждёт старый список — поправить его ожидание. В account view гостя `pack.refundDays: 10`.
4. **Переобход:** `/ru/oferta/`, `/uz/oferta/` (раздел 8), `/ru/politika-konfidentsialnosti/`, `/uz/maxfiylik-siyosati/` (получатели, сроки) — IndexNow и `sitemap-updates.xml`.
5. Бандл: старт 106 747 Б br (+124 к базе R4), `chat-account` 10 768 Б br (+988, ≤ 12 КБ); после выката — `chat-bundle-budget.ts --record`.

**Владельцу и юристу.**
1. Показать юристу новый раздел 8 оферты (возврат неиспользованной части, 10 рабочих дней) и обновлённые политики (получатели поимённо, сроки). После его «ок» — `legalReviewedAt` политикам (и новая дата оферты, если он что-то правил).
2. Спросить Click, есть ли частичный возврат (reversal на часть суммы), и бухгалтера — как пробивать чек частичного возврата.
3. Вычитка UZ носителем: раздел 8 оферты, новые строки окна (`cancelInvoiceNote`, `invoiceHeld`, `payChange*`, `refund*`, `firstPack`).

**Открыто.**
1. **Учёт и чек частичного возврата** (до первой выплаты части суммы): запись выплаты (сумма в журнале, пакет закрыт, заказ не «возвращён целиком»), чек возврата на сумму (Uzum Fiscalization `refund_receipt`, корзина автофискализации, Click — после ответа Click), частичный `acquiring/refund` Uzum Checkout (API это умеет).
2. Срок пакета в UTC (ревью WP-18, п. 2) — не менялось.
3. Два датозависимых теста `lead-radar`.
4. Из ревью WP-16/17: возврат из приложений на iOS/Android, поездка другого аккаунта за 30 минут.

**Дальше.** Ревью WP-24, затем WP-19 (админка «AI-чат», R5) — по решению ведущего.

---

# Платный AI-чат к проду: сквозная проверка релиза R4 (WP-13…WP-18), 2026-10-03

**Итог.** Проверил ветку `paid-chat/prod-readiness` на `664185d7` (WP-13…WP-18 с ревью поверх живых R1–R3; в ветке также `6d949b53` — исправление Worker'а, он уже в проде версией `b4fc8084`). Сверял с планом `10-PROD-PLAN.md`: §1 (проверки и порядок релиза), §3 (строка R4, S1–S5), разделы WP-13…WP-18 и «R4: сборка и выкат», §5, §6, §7; с `AGENTS.md` §2–8 и §11. Дерево было чистым, незаконченной работы не было. **Сбоев не найдено, код не менялся**: этот коммит записывает результаты, квитанцию репетиции и чек-лист выката. Ничего не запушено и не задеплоено; удалённая D1, Cloudflare, GSC, боты и вебхуки не трогались (к проду — только GET публичных страниц); `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты.

**Результаты** (`NODE_OPTIONS=--max-old-space-size=1400`, тесты по одному файлу):
1. `npx tsc -b` — 0; `npm run typecheck:functions` — 0; eslint по 107 изменённым в R4 файлам — 0.
2. Тесты:
   - 51 файл: всё, что трогали WP-07…WP-18, плюс контрольный список (`gpt-billing`, `gpt-uzum-payments`, `gpt-zai-provider`, `gpt-chat-handoff-link`, `telegram-web-handoff`, `telegram-assistant`, `gpt-readiness`, `gpt-operations`, `gpt-routing`, `gpt-chat`, `gpt-chat-stream`, `gpt-chat-limits`, `gpt-limit-state`, `gpt-watchdog`, `gpt-model-policy`, `runtime-config`, `pages-config-parity`, `seo-content-guards`, `seo-revenue-claims`, `pages-production-release`) — **738/738**;
   - весь список `npm test`, 85 файлов — **1078/1080**: падают только два известных датозависимых теста `lead-radar` (Lead Radar в R4 не менялся);
   - после свежей сборки ещё раз тесты, читающие `dist`: `legal-oferta` 16/16, `gpt-chat-prerender-links` 9/9, `gpt-pack-dialog` 12/12, `pages-config-parity` 7/7, `seo-page-integrity` 17/17, `studio-contact` 18/18, `chat-bundle-budget` 9/9, `lead-capture-templates` 30/30.
3. Сборка и SEO:
   - `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений** на базе `2026-10-01-paid-chat-honesty`. R4 новой ревизии не создаёт: против прежней базы `2026-09-30-gsc-driven` все 10 страниц отличаются только `bodyTextSha256` — это ревизия R3, она уже в проде;
   - живой прод сегодня — 10/10 на текущей базе после снятия обфускации e-mail Cloudflare (без снятия — 0/10 по `internalLinks` и `bodyTextSha256`, как и в R2+R3);
   - `seo-audit` — 123 страницы, 0 critical, 0 сирот, 45 пар RU/UZ;
   - бандл чата: старт 106 623 Б br (+1 680 к базе, порог +3 КБ), `chat-account` 9 780 Б (≤ 12 КБ; +5 203 — экраны WP-17), `chat-lead` 4 409, `chat-tools` 6 251 — в бюджете;
   - `npm run build:production` — 0 (штамп прошёл live-гейт офлайн и проверку чистого дерева), `pages-production.ts check` — pass (945 файлов), `wrangler pages functions build` — собран.
4. **Миграция 0068.** Локальная репетиция, дважды, на копии экспорта прода от 01.10 (`sha256 7c29d25c…`, 35,5 МБ; сначала доведена до 0067, как в проде). Квитанция — `docs/paid-chat/releases/R4-predeploy-rehearsal.json`.
   - В очереди ровно `0068_gpt_paid_chat.sql`; первый прогон применяет его, второй — пусто.
   - Число строк меняется только у `d1_migrations` (+1); три новые таблицы пустые; `quick_check` = ok; нарушений внешних ключей 0; оба прогона совпали.
   - Повтор «сырого» SQL падает на `duplicate column name: provider` и ничего не оставляет; bootstrap после миграции ничего не меняет.
   - Паритет: bootstrap кода до миграции строит те же колонки и индексы пяти затронутых таблиц. Но миграция после такого bootstrap падает (`duplicate column`) — поэтому **0068 строго до деплоя Pages и без превью**. Код прода `0ca0a699` ни одного объекта 0068 не создаёт (проверено).
   - В экспорте 0 заказов, чеков и заказов Uzum: новая семантика срока пакета миграции данных не требует.
5. `git diff --check origin/main..HEAD` — чисто; `scan:secrets` — чисто (3 243 файла); `test:secret-scan` 16/16; регэксп токена Telegram по диффу — 0; шаблоны ключей (sk-or, AKIA, PEM, ghp) — 0. Счёт продавца — только в `legal-entity.json` (публичный реквизит оферты) и маркером утечки в `legal-oferta.test.ts`.
6. **Локальный смоук** `wrangler pages dev dist` (порт 8799, остановлен; сначала без секретов, затем с одноразовыми локальными) — 29/29:
   - `GET /api/gpt/account`: `providers: []`, `loginMethods: []`, `mode: null`, `terms` = обе оферты, `termsVersion` = `ai-paket-2026-10-v1`;
   - POST и GET `/api/payments/{click,payme,uzum,uzum-merchant/check}` — 404; `/api/gpt/subscribe` (click, uzum, payme), `/api/gpt/auth/bot/{start,status}`, `/api/gpt/auth/start`, `/api/gpt/event` — 404 со своим Origin, 403 с чужим; внутренние `gpt-rehearsal-session` и `gpt-click-reversal` без Bearer — 403;
   - с Bearer: `gpt-rehearsal-session` — 404 (нет провайдера в `test`); тик обслуживания — `ok`, все провайдеры выключены, `GPT_IDENTITY_SECRET` не в списке недостающего;
   - оферты: 200, `index, follow`, canonical, hreflang ru/uz и `x-default` = uz, маркер редакции, СТИР; политики и `/ru/tarify-ai-chat/` ссылаются на оферты; обе в `sitemap.xml`; `robots.txt` их не закрывает; на главной ссылок на оферты нет;
   - локальная D1 этими маршрутами ни разу не открыта.
7. **Что меняет R4 для поисковиков** (сборка `origin/main` против `HEAD`):
   - новые `/ru/oferta/`, `/uz/oferta/`;
   - изменены `/ru/politika-konfidentsialnosti/`, `/uz/maxfiylik-siyosati/`, `/ru/tarify-ai-chat/`, `sitemap.xml`, `sitemap-updates.xml`;
   - у `index.html` сдвинут один перевод строки (контракт защиты тот же); 284 файла отличаются только хешами ассетов; `.md`-копии, `llms*.txt`, `robots.txt`, `_redirects`, `_headers` те же;
   - гейт не видит React: под полем ввода чата (в том числе на защищённых `/ru/gpt-chat/` и `/uz/gpt-uzbek-tilida/`) появилась ссылка «Конфиденциальность / Maxfiylik».

**Инструменты выката (вне Git, `F:/Claude/gptbot-tools/paid-chat/`).** Работают из корня репозитория, значений секретов не печатают:
- `rehearse-migrations.mts <export.sql> <report.json> [--through <файл>] [--expect <файл>]` — репетиция ожидающих миграций на копии экспорта в памяти (`node:sqlite`): два прогона, повтор, «сырой» повтор, bootstrap, паритет; exit 1 при любом расхождении (проверено на неверном `--expect`);
- `inert-smoke.mjs <url> [--bearer-file <файл>] [--expect-identity]` — смоук из п. 6;
- `protected-live.mts <url>` — 10 защищённых страниц вживую против `BASELINE` со снятой обфускацией e-mail.

**Отклонения и замечания.**
1. Шаблон задачи говорил о «новой базе WP-12» и «миграции WP-07». В R4 ревизии защищённых нет (проверка — на действующей базе), а миграция R4 — `0068` (WP-14…WP-17); её и репетировал.
2. `/api/gpt/subscribe` на кривое тело отвечает 400 до 404: сначала читает тело до 2 КБ, D1 не трогает. Правило «404 до тела и D1» в плане — для колбэков провайдеров; там оно выполняется. Дефектом не считаю.
3. **Порядок секрета.** План: Pages → `GPT_IDENTITY_SECRET` → передеплой. Предлагаю положить секрет до деплоя и обойтись одним деплоем. С выключенными провайдерами секрет ничего видимого не включает, а код R3 его не читает. Порядок плана тоже рабочий.
4. **Секрет `TELEGRAM_ASSISTANT_BOT_USERNAME`.** `LOGIN-RU.md` велит удалить его после деплоя. Но код R3 берёт имя бота только из этой привязки: если удалить сразу, откат на R3 сломает ссылки на бота. Удалять после 48 ч без отката, а при откате вернуть (значение публичное — `gptbotuz_bot`).
5. Сценарии и скрипты R7 (`scripts/paid-chat/dark-rehearsal.ts`, `ingest-keys.ts`, `ONBOARDING-KEYS-RU.md`) ещё не написаны — это WP-22/23. Ниже их шаги по плану и по фактическому коду.

**Чек-лист выката R4 — только по команде владельца.** Git Bash, `cd F:/Claude/gptbot-gsc-audit-20260917`, `export NODE_OPTIONS=--max-old-space-size=1400`. Wrangler — только через `python F:/Claude/gptbot-tools/wr.py -- …`. Секреты не печатать. Превью не делать: оно пишет в боевую D1. Worker `gptbot-automation` в R4 не меняется (его код в ветке = версия `b4fc8084` в проде).
0. **Предусловия.** Push — только с разрешения владельца. `git status` чистый; `python F:/Claude/gptbot-tools/deploy_runner.py check` (прод `0ca0a699` — предок `HEAD`). Строка в «Выкаты» `docs/seo/CHANGE_LOG_2026-10.md`.
1. **Резервная копия D1.** `wr.py -- d1 export gptbot-ai-drafts --remote --output F:/Claude/gptbot-production-backups/paid-chat-R4-<stamp>/before-0068.sql`, затем `sha256sum`. Копия вне Git: в ней переписки.
2. **Репетиция на копии этого экспорта, дважды:** `node --import tsx F:/Claude/gptbot-tools/paid-chat/rehearse-migrations.mts <before-0068.sql> docs/paid-chat/releases/R4-migration-rehearsal.json --expect 0068_gpt_paid_chat.sql`. Нужно `status: pass`: `pending` = только 0068, второй прогон пуст, меняется только `d1_migrations` (+1), паритет `true`, `quick_check` = ok. Если `pending` другой — стоп.
3. **Боевая D1, до деплоя:**
   - `wr.py -- d1 migrations list gptbot-ai-drafts --remote` — ровно `0068_gpt_paid_chat.sql`;
   - `wr.py -- d1 migrations apply gptbot-ai-drafts --remote`;
   - сверка только чтением:
     - `SELECT COUNT(*) n, MAX(name) last FROM d1_migrations` → 69 и `0068_gpt_paid_chat.sql`;
     - `SELECT COUNT(*) FROM pragma_table_info('gpt_fiscal_receipts')` → 14; то же для `gpt_uzum_orders` → 25;
     - `SELECT name FROM sqlite_master WHERE name IN ('gpt_payment_codes','gpt_bot_logins','gpt_ui_events','idx_gpt_fiscal_due','idx_gpt_uzum_orders_state','idx_gpt_bot_logins_browser','idx_gpt_bot_logins_expiry','idx_gpt_ui_events_created')` → 8 имён;
     - `SELECT (SELECT COUNT(*) FROM gpt_payment_codes)+(SELECT COUNT(*) FROM gpt_bot_logins)+(SELECT COUNT(*) FROM gpt_ui_events) n` → 0.
   - Если `apply` упал на `duplicate column name`, значит, код R4 уже где-то запускался (превью). Тогда по шапке 0068: вручную выполнить только `CREATE`, записать файл в `d1_migrations`, ничего не удалять.
4. **Секрет `GPT_IDENTITY_SECRET`** (генерирует агент, ≥ 32 символов; не менять, пока есть аккаунты: смена отвязывает их):
   - `f=C:/Users/Borinio/.config/gptbot-private/gpt-identity-secret.txt; test -e "$f" || node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$f"`;
   - `python F:/Claude/gptbot-tools/wr.py --stdin "$f" -- pages secret put GPT_IDENTITY_SECRET --project-name ai-direct-pro-landing`;
   - `wr.py -- pages secret list --project-name ai-direct-pro-landing` — только имена; переменных ≤ 64.
   - По порядку плана этот шаг идёт после п. 6 и требует передеплоя того же коммита.
5. **Сборка:** `npm run build:production` (0), затем `npx tsx scripts/seo-protection.ts check` (10/10), `npx tsx scripts/seo-audit.ts` (0 critical), `npx tsx scripts/chat-bundle-budget.ts` (в бюджете), `npx tsx scripts/release/live-gate.ts` (`live: false`, `issues: []`).
6. **Деплой:** `python F:/Claude/gptbot-tools/deploy_runner.py check`, затем `deploy`. `https://gptbot.uz/gptbot-release.json` — коммит = `HEAD`. Гейт при деплое проверит и имена переменных Pages (ни одна не перекрывает настройки биллинга).
7. **Инертность вживую:** `node F:/Claude/gptbot-tools/paid-chat/inert-smoke.mjs https://gptbot.uz --bearer-file C:/Users/Borinio/.config/gptbot-private/gpt-billing-maintenance-secret.txt --expect-identity` — всё PASS.
   - `INFO` должен называть для Click только `GPT_BILLING_MODE_CLICK`, `GPT_BILLING_LIVE_READY`, `GPT_BILLING_TERMS_APPROVED_AT`, `GPT_CLICK_CREDENTIALS_JSON`; для Uzum — `GPT_BILLING_MODE_UZUM`, `GPT_BILLING_LIVE_READY`, `GPT_BILLING_TERMS_APPROVED_AT`, `UZUM_API`. Если там есть `GPT_NOTIFY_*`, `GPT_HASH_SALT` или токен бота — разобраться до следующего шага.
   - Агрегаты: `SELECT COUNT(*) FROM gpt_payment_orders_all` и `SELECT COUNT(*) FROM gpt_fiscal_receipts` — как до деплоя (по экспорту 01.10 — 0); новые таблицы — 0.
8. **Бот** (`handler.ts` получил ветку `/start login_`): `POST https://gptbot.uz/api/internal/gpt-model-probe?target=javob` — 4 прогона ok; `POST /api/internal/javob-setup` без `apply` — `matches: true`. По желанию владелец за минуту шлёт боту текст и `/start login_00000000000000000000000000000000`: ответ «ссылка устарела», `gpt_bot_logins` = 0.
9. **Страницы:** смоук п. 7 уже проверил оферты (200, `index, follow`, canonical, hreflang ru/uz + `x-default` uz, редакция `ai-paket-2026-10-v1`, СТИР), ссылки из политик и тарифов, `sitemap.xml`, `robots.txt`. Дополнительно `curl -sI https://gptbot.uz/ru/oferta/` — без `X-Robots-Tag: noindex`. Browser pane 375×812 на `/ru/gpt-chat/`: под полем ссылка «Конфиденциальность», окна пакета и входа нет, ошибок в консоли нет.
10. **Защищённые вживую:** `node --import tsx F:/Claude/gptbot-tools/paid-chat/protected-live.mts https://gptbot.uz` → 10/10 со снятой обфускацией.
11. **Переобход:**
    - IndexNow по пяти URL: `/ru/oferta/`, `/uz/oferta/`, `/ru/politika-konfidentsialnosti/`, `/uz/maxfiylik-siyosati/`, `/ru/tarify-ai-chat/`. Сначала список в `<tmp>/r4-urls.json`, затем `python F:/Claude/gptbot-tools/indexnow_list.py <tmp>/r4-urls.json <HEAD> r4_release "R4: public offer RU/UZ, privacy policies, pricing link"`;
    - `py -3 -W ignore F:/Claude/gptbot-tools/gsc_tools.py submit https://gptbot.uz/sitemap.xml https://gptbot.uz/sitemap-updates.xml`.
12. **Квитанции и уборка:**
    - `npx tsx scripts/chat-bundle-budget.ts --record` из сборки релиза;
    - `docs/paid-chat/releases/R4-live-verification.json`: экспорт (sha), репетиция, `applied_remote`, сверка, деплой, имя секрета (без значения), смоук, бот, 10/10, IndexNow;
    - CHANGE_LOG, HANDOFF, STATE — одним коммитом.
    - Через 48 ч без отката: `wr.py -- pages secret delete TELEGRAM_ASSISTANT_BOT_USERNAME --project-name ai-direct-pro-landing` и передеплой (значение уже в JSON).
- **Откат:** `git revert` и guarded-деплой. `0068` аддитивна, её не откатывать; `GPT_IDENTITY_SECRET` не удалять (код R3 его не читает). Если секрет имени бота уже удалён — вернуть его до деплоя R3.

**Что будет в R7 (по плану и по фактическому коду; скрипты пишут WP-22/23).**
- **Тёмная репетиция (WP-22, слой 2):**
  1. Агент генерирует тестовые креды в `C:/Users/Borinio/.config/gptbot-private/`:
     - `GPT_CLICK_CREDENTIALS_JSON = {"test":{service_id, merchant_id, merchant_user_id — фиктивные числа; secret_key — 32 случайных байта hex}}`;
     - `UZUM_CREDENTIALS_JSON = {"merchant":{"test":{serviceId, login, password — случайные}}}`.
     `wr.py --stdin … pages secret put` для обоих. Позже ключи владельца вливаются в те же JSON рядом с `test`.
  2. Коммит `wrangler.toml` (JSON и таблица): `GPT_BILLING_MODE_CLICK="test"`, `UZUM_API="merchant"`, `GPT_BILLING_MODE_UZUM="test"`. Затем тесты `runtime-config` и `pages-config-parity`, `build:production`, деплой.
  3. Посетитель без cookie по-прежнему видит `providers: []`, `subscribe` → 404. Колбэки Click и Uzum Merchant теперь отвечают по протоколу (принимают только тестовую подпись и тестовый Basic).
  4. Click: `POST /api/internal/gpt-rehearsal-session {"account":true}` (Bearer) → cookie `__Host-gpt_rehearsal` + `__Host-gpt_account` → `POST /api/gpt/subscribe {provider:"click", requestId, acceptTerms:true, termsVersion}` → Prepare и Complete на `https://gptbot.uz/api/payments/click`, подписанные тестовым `secret_key` → `GET /api/gpt/account` с cookie: пакет активен, чек `skipped_test` → возврат через `gpt-click-refund-record` → период отозван.
  5. Uzum: `node --import tsx scripts/uzum-sandbox-rehearsal.ts --api merchant --simulate https://gptbot.uz`. В окружении этой одной команды — `UZUM_CREDENTIALS_JSON` (merchant.test) и `GPT_BILLING_MAINTENANCE_SECRET`.
  6. По желанию владелец проходит экраны с cookie репетиции (вход через бота — настоящий, 375×812, RU и UZ).
  7. Режимы снять → деплой → `inert-smoke.mjs` снова зелёный. Строки `mode='test'` и `acct_rh_*` остаются. Агрегат по режимам: `SELECT mode, state, COUNT(*) FROM gpt_payment_orders_all GROUP BY 1,2`. Квитанция `R7-dark-rehearsal.json`.
- **Приём ключей (WP-23, §7 плана).** Владелец кладёт в `F:/Claude/gptbot-keys-inbox/` файлы `click.json`, `uzum.json`, `zai.txt`; `business.json` там уже есть.
  1. `npx tsx scripts/paid-chat/ingest-keys.ts --inbox F:/Claude/gptbot-keys-inbox --dry-run` (только имена полей) → `--apply`: секреты через stdin, несекретное — в JSON `wrangler.toml`.
  2. Коммит → guarded-деплой → тик (`inert-smoke.mjs --bearer-file`) печатает, чего не хватает live. Владелец удаляет файлы.
  3. **S1** Click `test` (15 сценариев Click, `dark-rehearsal.ts --provider click`).
  4. **S2** Click `live`. Нужна дата юриста в `GPT_BILLING_TERMS_APPROVED_AT` и в `legalReviewedAt` обеих оферт и обеих политик, затем `GPT_BILLING_MODE_CLICK=live` и `GPT_BILLING_LIVE_READY=true` → деплой (гейт проверит всё). Дальше покупка и возврат владельца, сверка чека `ofd.soliq.uz`.
  5. **S3/S4** — Uzum, **S5** — Z.ai по оценке.
  - Стоп-кран: снять `GPT_BILLING_MODE_<P>` или `GPT_BILLING_LIVE_READY=false` → деплой.

**Открыто (R4 не блокирует).**
1. Пункты ревью WP-18:
   - срок хранения `gpt_events`;
   - срок пакета считается в UTC;
   - перечень получателей данных;
   - полный возврат.
2. Одобрение юриста — дата пустая, live закрыт гейтом.
3. Кредитов OpenRouter нет: `GPT_FREE_TIER_PAID_PRIMARY` остаётся `false`.
4. Два датозависимых теста `lead-radar`.
5. Узбекскую транслитерацию реквизитов сверить со свидетельством.

**Дальше.** Выкат R4 по чек-листу выше (по команде владельца) или WP-19 — решает ведущий.

---

# Платный AI-чат к проду: ревью WP-18, 2026-10-03

**Итог.** Проверил коммиты WP-18 `67a5ae96` (оферта, политики, реквизиты, live-гейт, тесты, документы, HANDOFF, STATE) и `c8cc75c3` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md`: §1 (правила и проверки), §2 (L3, L4, L13, L14, L16), строка R4 и откат S1–S5 в §3, раздел WP-18 (файлы, тесты, приёмка, риски), §5 и §6; с картой `05` §3.1–3.6; с `AGENTS.md` §2–8 и §11. Дерево было чистым на `c8cc75c3`, незаконченной работы и резервных копий не было. Ничего не запушено и не задеплоено; Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты.

**Сделано верно:**
- **Страницы.** `/ru/oferta/` и `/uz/oferta/`: `published`, `index, follow`, canonical, взаимный hreflang, `x-default` = UZ. Обе в `sitemap.xml` и `sitemap-updates.xml`, не в 404-списке `_redirects`. Без `Offer`/`FAQPage` и без CTA. Ссылки на них — только со страницы тарифов и из политик; футеров, навигации чата и защищённых страниц нет. Отклонение с главной (страницы с `termsVersion` не попадают в её список) обосновано. Защищённые 10/10 без изменений.
- **Реквизиты.** `legal-entity.json` совпадает с `business.json`: СТИР, адрес RU, банк, счёт, МФО, директор; наименование — тот же текст в другом регистре. Контакт берётся из `site.json`, личного Telegram нет (L14). Значения экранируются, телефон и e-mail проверяются по формату, а сборка падает на неполных реквизитах.
- **Числа оферты сверены с кодом:**
  - цена и НДС (`PRICE_TIYIN`, `includedVat`);
  - 300 ответов; 50 в сутки по UTC, то есть с 05:00 по Ташкенту; 2 одновременно на субъект;
  - 600 символов у «Стоп»; бесплатные 15/5;
  - возврат только полный: код возвращает заказ целиком;
  - пакеты идут параллельно, списание — из того, что кончается раньше;
  - согласие спрашивается заново перед каждой оплатой.
- **Политики сверены с кодом:** IP хранится хешем с солью, Telegram ID — HMAC; бот хранит сообщения 24 часа, есть `/delete_me`; Вебвизор окно чата не пишет (`ym-hide-content`); пиксель Meta на главной есть.
- **Уборка `gpt_ui_events`:** только своя org, батч `LIMIT 500`, индекс `(org_id, created_at)` есть. Таблица из `0068`; в R4 миграция идёт до Pages, как и для `gpt_bot_logins`, которую уборка уже трогает.
- **Live-гейт.**
  - Печатает только имена: тест проверяет, что значения не утекают.
  - Секреты проверяет по именам из `deployment_configs.production.env_vars`; офлайн кладёт их в `deferred`.
  - Ловит переменную Pages, которая перекрывает JSON.
  - Работает во всех режимах `pages-production.ts`; в `deploy` — под замком и до загрузки.
- **Тексты** RU/UZ естественные: «GPTBot.uz», «AI-пакет» / «AI paket», без Plus, Pro, obuna и «подписки». В UZ — `‘` и `’`.

**Дефекты, исправлены (`fix(legal): address WP-18 review findings`):**
1. **Medium: гейт не пропускал откат режимом провайдера.** В карте релизов (§3, S1–S5) два стоп-крана: `GPT_BILLING_LIVE_READY=false` или снять `GPT_BILLING_MODE_<P>`.
   - Со вторым краном переключатель остаётся `"true"`, а режим снят или стоит `test`. Гейт тогда отклонял деплой с ошибкой «no provider is in live mode». Это противоречит его же правилу «выключение не блокируется».
   - Теперь правила live действуют, только когда переключатель `"true"` и хотя бы один провайдер в `live`. Оба стоп-крана выкатываются.
   - Тест: режим снят или `test` при `"true"` → `{ live: false, issues: [] }`.
2. **Low: `GPT_FISCAL_TIN` не требовался для Uzum.** План требует непустые `GPT_FISCAL_*` при live.
   - Гейт сравнивал ТИН со СТИР продавца, только если ТИН задан, а `liveReadiness()` спрашивает ТИН только у Click. Поэтому Uzum мог уйти в live с пустым `GPT_FISCAL_TIN`.
   - Теперь ТИН обязателен и должен быть равен СТИР при любом провайдере. В тест добавлен этот случай.
3. **Low: тест противоречил runbook.** `legal-oferta` закреплял «одобрения нет нигде»: `GPT_BILLING_TERMS_APPROVED_AT === ''` и `legalReviewedAt` нигде нет.
   - Если записать дату юриста по `OFFER-RU.md`, `npm test` покраснел бы.
   - Теперь тест проверяет, что одобрение записано целиком: одна дата в обеих копиях конфига и в обеих офертах, у политик своя дата. Без одобрения пусто везде.
4. **Low: мёртвый код в тесте.** Ветка `if (!complete)` в тесте L13 не могла выполниться после `assert.ok(complete)`.
   - Ветка убрана. Тест и runbook теперь описывают то, что проверяется на деле: опубликованным офертам и политикам нужны полные реквизиты, без них сборка падает.
   - Снять оферту по L13 — это `draft`, убрать ссылки на неё и блок реквизитов у политик.

Мутации ловятся все три: ТИН проверяется, только если задан; деплой отклоняется без live-провайдера; одобрение записано только в UZ-оферте.

**Открыто: R4 не блокирует, но решить до live.**
1. **У `gpt_events` нет срока хранения.** Там следы заявок и перехода из чата в бота: сессия, интент, страница, а у принятого перехода — псевдоним Telegram. Политика обещает 93 дня для технических событий без текста.
   - Вариант 1: уборка в `maintainBilling`. Нужен индекс по `created_at`: крон идёт каждые 15 минут, а `org_id` в таблице нет.
   - Вариант 2: отдельная строка в политике.
   - Решить в WP-19 (админка читает воронку) и до одобрения политики юристом.
2. **Срок пакета считается в UTC.** При оплате между 00:00 и 05:00 по Ташкенту в конце месяца срок выходит до суток длиннее, чем по правилу оферты («последний день месяца»). Это в пользу покупателя; код не менял.
3. **Получатели данных.** В бесплатной цепочке есть `dots-studio/dots-3-note-preview:free`, а политика называет поставщиков моделей «например, NVIDIA, Google, Mistral AI». Полный перечень и основание трансграничной передачи (ПКМ № 415) — вопрос юриста.
4. **Полный возврат в любой момент, пока пакет действует** (даже после почти всех 300 ответов), — решение владельца и юриста, как исполнитель и записал.

**Проверки.**
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0. `live-gate.ts`, `pages-production.ts` и `legal-oferta.test.ts` разовым tsconfig — 0 ошибок.
2. Тесты по одному файлу с `NODE_OPTIONS=--max-old-space-size=1400`:
   - весь список `npm test`, 85 файлов: падают только два известных датозависимых теста `lead-radar`; `legal-oferta` попал на момент правки и перезапущен отдельно — 16/16;
   - после правок: `legal-oferta` 16/16 (добавлен «Uzum без ТИН», «нет live-провайдера» перенесён к стоп-кранам), `pages-production-release` 8/8, `chat-bundle-budget` 9/9, `gpt-live-readiness` 10/10, `secret-scan` 16/16.
3. `npm run build:fast` — 0.
   - `seo-protection check` — 10/10 без изменений.
   - `seo-audit` — 123 страницы, 0 critical, 0 сирот, 45 пар RU/UZ.
   - `chat-bundle-budget` — старт 106,6 КБ br, в бюджете.
4. `live-gate.ts`: закоммиченный конфиг — без замечаний; `--assume-live click` — только одобрение юриста; `--assume-live uzum` — ещё `UZUM_API`.
5. eslint по изменённым файлам — 0; `git diff --check` — чисто; регэксп токена Telegram по диффу — 0; `scan:secrets` — чисто (3 243 файла).

**Следующее.** Выкат R4 (WP-13…WP-18, миграция 0068) или WP-19 — по решению ведущего. Для live нужны одобрение юриста (дата в четырёх страницах и в `GPT_BILLING_TERMS_APPROVED_AT`) и решение по пункту 1 выше.

---

# Платный AI-чат: WP-18 — оферта и политика RU/UZ, версия условий, live-гейт при деплое, 2026-10-03

**Итог.** Сделан WP-18 плана `10-PROD-PLAN.md` (релиз R4; решения L3, L4, L13, L14, L16; D7, D8) на ветке `paid-chat/prod-readiness` поверх `0147d433` (WP-17 после ревью), коммит `67a5ae96` (`67a5ae96a8eb39fa04e68813b46a02cfe9e41120`; следующий коммит только записывает этот SHA в STATE, правило D-006). Что сделано:
- `/ru/oferta/` и `/uz/oferta/` — индексируемые legal-страницы с реквизитами продавца из одного файла;
- обе политики переписаны: чат, получатели, оплата, вход, бот, сроки;
- `GPT_BILLING_TERMS_RU/UZ/VERSION` указывают на оферты, поэтому окно пакета ведёт на оферту своего языка;
- под полем ввода чата появилась ссылка «Конфиденциальность / Maxfiylik»;
- деплой с `GPT_BILLING_LIVE_READY="true"` отклоняется, пока не на месте оферты, реквизиты, одобрение юриста, фискальные настройки и секреты live-провайдеров.

Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты. Защищённые страницы 10/10 без изменений.

**Возобновление.** Дерево было чистым на `0147d433`, незаконченной работы WP-18 и резервных копий `wp18-*` не было.

**Что сделано.**
1. **Реквизиты** — `content/global/legal-entity.json`: наименование, СТИР 310618348, юридический адрес, Asia Alliance Bank, счёт, МФО 01095, директор (RU и UZ).
   - Источник — `business.json` владельца (вне Git), записан в поле `_source`.
   - E-mail и телефон в файл не копировались: они берутся из `content/global/site.json` (L14). Новый рабочий Telegram или контакт — по-прежнему одна строка.
   - `scripts/legal-entity.ts` проверяет поля (форматы СТИР, счёта, МФО, контакт) и рисует два элемента: блок «Реквизиты продавца / оператора» и строку «Редакция … · действует с …». Пока реквизиты неполны, `prerender` отказывается собирать страницу, которая их показывает (L13).
2. **`Page`** (`src/shared/types.ts`), новые поля:
   - `termsVersion` — строка редакции под H1 (`data-terms-version`);
   - `legalReviewedAt` — дата одобрения юристом, не выводится;
   - `requisites: 'seller' | 'operator'` — блок реквизитов после текста.
3. **Оферта RU/UZ** — 13 разделов по `05` §3.4: стороны и термины; предмет («не продукт OpenAI», без гарантий точности); цена с НДС; календарный месяц; 300 ответов; 50 в сутки; 2 одновременно; без автосписаний; сгорание остатка; параллельные пакеты; что списывается; бесплатный режим; оплата и чек; акцепт; возврат; данные; ответственность; изменения; споры; язык (приоритет у узбекского).
   - Без `Offer`/`FAQPage`, без CTA и чипов, `x-default` = UZ.
   - Ссылки на оферты: RU — со страницы тарифов и из RU-политики, UZ — из UZ-политики.
   - Внизу — блок реквизитов, затем карточка контактов (на неё ссылается раздел о возврате).
4. **Политики RU/UZ** переписаны. UZ-текст раньше был без апострофов («malumot», «boglanish»).
   - Новые разделы: оператор (блок реквизитов), AI-чат, вход через Telegram, бот @gptbotuz_bot, оплата и чек со ссылкой на оферту, получатели (Cloudflare, OpenRouter и поставщики моделей, Z.ai условно, Click, Uzum Bank, Telegram, GA4, Метрика, пиксель Meta на главной), сроки, права, изменения.
   - Что сказано про AI-чат: хранится текст, язык, время и модель; IP — только хеш с солью; события без текста — 93 дня; localStorage и случайный номер вкладки; Вебвизор окно чата не видит.
   - Бот: 24 часа и `/delete_me`. Переписка чата хранится «пока не попросите удалить».
   - Контакт — ceo@gptbot.uz и телефон, личного Telegram нет.
5. **Числа оферты и политики — из кода** (`tests/legal-oferta.test.ts`):
   - `PRICE_TIYIN`, НДС через `includedVat` (2 142,86 сум), `PAID_MESSAGES`, `PACK_DAILY_LIMIT`, `MAX_CONCURRENT_TURNS` (теперь экспортируется), `stopChargeMinChars`;
   - бесплатные 15/5 — из `resolveConfig` над упакованным JSON;
   - 24 часа бота — из `resolveTelegramConfig`;
   - 93 дня — новая константа `TELEMETRY_RETENTION_DAYS` вместо пяти литералов в `billing-maintenance-store.ts`;
   - ветка срока переписки — по `retentionDays()`.
6. **`gpt_ui_events` теперь хранится 93 дня**: уборка в `maintainBilling`, только своя org. Политика это обещает; закрыт открытый пункт 1 ревью WP-17.
7. **Конфиг** (JSON и вложенная таблица `wrangler.toml`): `GPT_BILLING_TERMS_RU="https://gptbot.uz/ru/oferta/"`, `GPT_BILLING_TERMS_UZ="https://gptbot.uz/uz/oferta/"`, `GPT_BILLING_TERMS_VERSION="ai-paket-2026-10-v1"`. `GPT_BILLING_TERMS_APPROVED_AT` остаётся пустым: юрист эту редакцию ещё не одобрял.
8. **React.**
   - Строка под полем ввода заканчивается ссылкой «Конфиденциальность» / «Maxfiylik» на политику своего языка.
   - Ссылка берётся из `t.privacyHref`, тем же значением пользуются согласие на вход и форма заявки (две копии адреса убраны).
   - В «Мой пакет» строка «запрос на возврат принят» называет срок ответа из оферты: 3 рабочих дня (открытый пункт WP-17).
9. **Live-гейт при деплое** — `scripts/release/live-gate.ts`, вызывается из `pages-production.ts` во всех режимах.
   - При `GPT_BILLING_LIVE_READY="true"` деплой отклоняется, пока не выполнено всё:
     - есть live-провайдер, и `liveReadiness()` не называет ничего, что видно из конфига;
     - обе оферты опубликованы, их адреса = `GPT_BILLING_TERMS_RU/UZ`, их редакция = `GPT_BILLING_TERMS_VERSION`, их `legalReviewedAt` = `GPT_BILLING_TERMS_APPROVED_AT`;
     - в `dist` обе оферты есть с этой редакцией, с реквизитами, с `index, follow` и в `sitemap.xml`;
     - реквизиты полные, СТИР = `GPT_FISCAL_TIN`;
     - у политик есть `legalReviewedAt`;
     - секреты live есть в Pages production (по имени).
   - `check-production` и `deploy` берут имена переменных из того же ответа API проекта Pages, что и коммит прода. `stamp` и `check` перечисляют такие секреты в `deferred`.
   - Всегда, даже без live: переменная Pages с именем настройки биллинга перекрыла бы JSON, поэтому деплой отклоняется.
   - Выключение live не блокируется никогда.
   - CLI `npx tsx scripts/release/live-gate.ts [--assume-live click|uzum]` показывает, чего не хватает (только имена).
10. **Документ** `docs/paid-chat/OFFER-RU.md`: где что лежит, как менять редакцию, как записать одобрение юриста, что проверяет гейт, вопросы юристу.

**Отклонения от плана (и почему).**
1. **Главная не перечисляет оферты.** Shell главной (`scripts/prerender-home.ts`) выводит ссылки на все опубликованные страницы, а главная защищена. С офертами `seo-protection` упал на `/` (`internalLinks`, `bodyTextSha256`). План (`05` §3.5) этого места не учёл. Страницы с `termsVersion` из списка исключены, и главная побайтно та же.
2. **E-mail и телефон — не в `legal-entity.json`.** Они берутся из `site.json`: так у контакта остаётся один источник (L14, решение WP-17). Гейт проверяет их формат вместе с реквизитами.
3. **`legalReviewedAt` и `GPT_BILLING_TERMS_APPROVED_AT` пусты.** В `business.json` записано `lawyerApprovedAt: 2026-10-01` («юрист одобрил оферту; текст пишет агент»), но эта дата раньше самого текста (03.10). Как одобрение этой редакции её использовать нельзя. Гейт требует одну и ту же дату в обеих офертах и в конфиге.
4. **Добавлено сверх плана:**
   - уборка `gpt_ui_events` (иначе политика говорила бы неправду);
   - срок ответа на возврат в панели;
   - проверка «переменная Pages перекрывает JSON»;
   - CLI гейта;
   - `MAX_CONCURRENT_TURNS` и `TELEMETRY_RETENTION_DAYS` как экспортируемые константы.
5. **Возврат — полная сумма**, пока пакет действует, ответ за 3 рабочих дня. Так умеет код: он возвращает только весь заказ, и чек возврата пробивается на всю сумму. То же уже говорит панель. Пропорциональный возврат — решение юриста и отдельная доработка.
6. **Гейт проверяет секреты по имени.** Для проверки он подставляет на их место заглушки правильного формата. Содержимое секретов проверяет `liveReadiness()` во время работы, при ошибке продажи закрываются. Поэтому, например, Uzum Checkout без `UZUM_AUTOFISCAL` при заданном `UZUM_CREDENTIALS_JSON` гейт пропустит. Если в секрете нет ключа фискализации, продаж всё равно не будет.

**Проверки.**
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0. Новые и изменённые скрипты и тесты проверены разовым tsconfig вне репозитория: в них ошибок нет (остались старые расхождения DOM/workers-types в `AccountDialog.tsx` и `prerender.ts:843`).
2. По одному файлу с `NODE_OPTIONS=--max-old-space-size=1400`: весь список `npm test` — 85 файлов, **1078/1080**; падают только два известных датозависимых теста `tests/lead-radar.test.ts` («manual approval is fail-closed…», «store enforces tenant isolation…»), код Lead Radar не менялся. Отдельно, в том числе после последней сборки: `legal-oferta` 16/16 (новый, с проверкой собранного `dist`), `gpt-chat-honesty` 11/11, `gpt-ui-events` 7/7 (+1), `chat-bundle-budget` 9/9, `studio-contact` 18/18, `seo-link-graph` 17/17, `seo-page-integrity` 17/17, `seo-revenue-claims` 7/7, `gpt-live-readiness` 10/10, `gpt-pack-dialog` 12/12, `gpt-account-ui` 24/24, `gpt-operations` 7/7, `homepage-crawler-shell` 5/5, `pages-production-release` 8/8 (не в `npm test`), `secret-scan` 16/16.
3. Мутации ловятся все 9:
   - равенство `legalReviewedAt` и даты одобрения;
   - проверка перекрытия только при live;
   - отсутствующий секрет не считается;
   - нет проверки `sitemap`;
   - счёт из 19 цифр;
   - уборка `gpt_ui_events` без `org_id`;
   - 600 → 500 в UZ-оферте;
   - 3 → 5 рабочих дней;
   - ссылка под полем ввода убрана.
4. eslint по изменённым файлам — 0; `git diff --check` — чисто; регэксп токена Telegram по диффу — 0; `scan:secrets` — чисто (3 243 файла).
5. `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений** (база `2026-10-01-paid-chat-honesty`).
   - `seo-audit`: 123 страницы, 0 critical, 0 сирот, пар RU/UZ 45 (+1).
   - Оферты — 100/100. У политик старое предупреждение `short-title`: title не меняли.
   - `chat-bundle-budget` в бюджете: старт 106,6 КБ br (+1 680 Б к базе 01.10, из них этот WP ≈ +60 Б), `chat-account` 9,8 КБ br, `chat-lead` 4,4, `chat-tools` 6,3.

**Приёмка, проверенная локально.**
1. `scripts/pack-window-preview.ts`, Browser pane 375×812:
   - `/ru/oferta/` и `/uz/oferta/`: строка редакции, 13 разделов, блок реквизитов, карточка контактов, горизонтальной прокрутки нет;
   - `/uz/maxfiylik-siyosati/`: «Operator rekvizitlari», ссылка на оферту;
   - под полем ввода на `/ru/gpt-chat/` и `/uz/gpt-uzbek-tilida/` есть «Конфиденциальность» / «Maxfiylik».
   - Сервер превью остановлен.
2. `dist`: обе оферты с `index, follow`, canonical, hreflang, `x-default` UZ, в `sitemap.xml`, не в 404-списке `_redirects`; на защищённых страницах `/oferta/` нет.
3. `npx tsx scripts/release/live-gate.ts`: закоммиченный конфиг проходит (live выключен). `--assume-live click` называет только одобрение юриста: `GPT_BILLING_TERMS_APPROVED_AT` и `legalReviewedAt` у двух оферт и двух политик. Секреты — в `deferred`. Для Uzum ещё `UZUM_API`.

**Для релиза R4 (делает ведущий).**
1. После деплоя: `/ru/oferta/` и `/uz/oferta/` отдают 200, `index,follow`, есть в `sitemap.xml`, редакция `ai-paket-2026-10-v1`. Политики обновлены (`Обновлено 2026-10-03`, блок реквизитов). `GET /api/gpt/account` → `terms.ru/uz` = адреса оферт, `termsVersion` = `ai-paket-2026-10-v1`, `providers: []`.
2. IndexNow и `sitemap-updates.xml`: `/ru/oferta/`, `/uz/oferta/`, обе политики, `/ru/tarify-ai-chat/`.
3. `check-production` теперь читает имена переменных проекта Pages. Если там окажется секрет с именем настройки биллинга, деплой остановится с его именем: удалить его — решение владельца.
4. Cloudflare Email Obfuscation перепишет `ceo@gptbot.uz` в HTML. Ссылки `mailto:` работают, гейт и тесты проверяют `dist`, а не живой HTML.

**Владельцу и юристу.**
1. Вычитать оферту и политику (`docs/paid-chat/OFFER-RU.md`, раздел «Вопросы юристу»): ЗРУ-792 ст. 16/23, полный возврат против пропорционального, ПКМ № 415 (OpenRouter без DPF), сроки хранения, приоритет языка.
2. Сверить узбекскую транслитерацию адреса, наименования и ФИО директора со свидетельством.
3. После одобрения: дата в `legalReviewedAt` четырёх страниц и в `GPT_BILLING_TERMS_APPROVED_AT` → коммит → деплой.

**Открыто, R4 не блокирует.**
1. UZ-тексты оферты и политики — вычитка носителем (§8 п.12).
2. Пиксель Meta на главной упомянут в политике. Если он больше не нужен, проще убрать и его, и строку.
3. `GPT_MESSAGES_RETENTION_DAYS` пуст. Когда владелец задаст срок, текст политики меняется тем же релизом — тест это требует.

**Следующее.** Выкат R4 (WP-13…WP-18, миграция 0068) или WP-19 (админка «AI-чат», R5) — по решению ведущего.

---

# Платный AI-чат к проду: ревью WP-17, 2026-10-03

**Итог.** Проверил коммиты WP-17 `782dc7f3` (код, тесты, документы, HANDOFF, STATE) и `d49f6561` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md`: §1 (правила и проверки), §2 (L7, L14, L16, L18), строка R4 в §3, раздел WP-17 (файлы, настройки, миграция, тесты, приёмка, риски), §5 и §6; с картой `03` §3.2–3.6, §4, §8.1 и §10; с `AGENTS.md` §2–8 и §11. Дерево было чистым на `d49f6561`, незаконченной работы и резервных копий не было. Ничего не запушено и не задеплоено; Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты.

**Сделано верно:**
- **Недостижимость при выключенной оплате.** Пилюли и кнопок пакета нет, `POST /api/gpt/event` отвечает 404 до тела и D1 (тест с «бомбой» вместо D1, и в `gpt-live-readiness` на закоммиченной конфигурации), гостевой `/api/gpt/account` в D1 не ходит (L18).
- **Счётчик воронки.** `sameOrigin` (403), 1 КБ, закрытые списки типа и квалификатора, `INSERT OR IGNORE` по `(org_id, id)` — повтор считается один раз (AGENTS §4), `org_id` в каждой записи и тест «org B не видит org A» (AGENTS §3), 60 событий в час на хеш IP, сбой счётчика лимита — 429 (fail-closed). Ни текста, ни IP, ни аккаунта, ни сессии чата в строке нет.
- **Миграция.** `0068` (ещё не применена в проде) дополнена только `CREATE TABLE/INDEX IF NOT EXISTS`; тот же DDL в `PAID_CHAT_DDL`, паритет и двойное применение через ledger в `gpt-paid-chat-schema`. Новых настроек нет, поэтому паритет конфига не затронут.
- **Сервер.** `access.dayRemaining` считается тем же правилом `pack_daily`, что и `reserve()`, и не больше остатка пакета; тест доводит до 50-го ответа и проверяет отказ `pack_daily`.
- **Окно.** Все числа пакета — из `account.pack`; `validAccountView` проверяет новые поля fail-closed; чеки только с `ofd.soliq.uz` и хостов Uzum; возврат — со второго нажатия; контакт — из `content/global/site.json`, личного Telegram нет (L14). `purchase` уходит только в live, после подтверждения сервером и один раз на заказ в браузере.
- **Тексты** RU/UZ естественные, «GPTBot.uz», без «Plus», «Pro», «obuna», «подписка»; o‘/g‘ с U+2018. Отклонения исполнителя (контакт из `site.json` вместо `GPT_SUPPORT_EMAIL`, срок возврата — в WP-18, `view_id`/`detail` вместо `session_id`/`topic`, нет опроса чужого счёта без поездки, нет `purchase` в test, скрипт превью) обоснованы.
- Бандл и защищённые страницы — как заявлено (числа ниже).

**Дефекты, исправлены (`fix(gpt-chat): address WP-17 review findings`):**
1. **Medium, регрессия: сломан `scripts/gpt-billing-load-rehearsal.ts`.** WP-17 удалил «неиспользуемый» `TurnStore.remaining()`, но скрипт нагрузочной репетиции допуска (им проверяли WP-05) вызывал его в двух последних проверках. Скрипт падал с `TypeError: store.remaining is not a function`; `tsc -b` скрипты не проверяет, поэтому это не всплыло. Теперь он берёт `allowance(...).remaining`: 1000 резервов, 800 списано, 200 освобождено, остатки 15 и 14, как раньше.
2. **Low, аналитика: «оплата не подтверждена» могла прийти поверх «оплата получена».** Сценарий: человек вернулся с оплаты позже 10 минут ожидания, но в пределах 30 минут поездки, а заказ уже оплачен. В одном проходе эффектов `AiAccountPanel` первый эффект отмечал `paid`, а второй, ещё со старым `outcome`, ставил таймер `pending` на 0 мс. В React 19 setState из эффекта рисуется отдельной задачей, а очистка таймера — ещё одной, поэтому таймер мог сработать раньше. Тогда в GA4 и в `gpt_ui_events` уходило `checkout_result` paid → pending → paid, а экран на миг показывал «не подтверждена». Теперь срок «ещё ждём» считает чистая `pendingDelay()` в `src/gpt-chat/checkout.ts`. Она возвращает null, пока account view не ответил, и когда он уже говорит, чем кончилась оплата. Эффект таймер тогда не ставит.
3. **Low, скрипт превью: проверка «внутри dist/» была префиксной.** `file.startsWith(dist)` пропускал соседние папки вида `dist-old/` (`/../dist-old/...`). Сервер слушает только 127.0.0.1, так что риск чисто локальный, но проверка теперь точная: `file === dist || file.startsWith(dist + path.sep)`.
4. **STATE:** `last_completed_stage` после WP-17 всё ещё называл WP-16; исправлено.

Тесты: новый в `gpt-account-ui` (`pendingDelay`: без ответа, до и после 10 минут, другой заказ, paid/cancelled/refunded; вызов в панели), строки в `gpt-pack-dialog` про проверку пути в превью. Мутации ловятся все три: `pendingDelay` без `settledCheckout`, панель со старым расчётом таймера, префиксная проверка `dist`.

**Проверки.**
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0. Изменённые тесты и оба скрипта проверены разовым tsconfig вне репозитория: в них ошибок нет (остались старые расхождения DOM и workers-types в чужих файлах).
2. По одному файлу с `NODE_OPTIONS=--max-old-space-size=1400`: `gpt-pack-dialog` 12/12, `gpt-ui-events` 6/6, `gpt-account-ui` 24/24 (+1), `gpt-account-storage` 7/7, `gpt-billing` 18/18, `gpt-chat-lazy-part` 7/7, `gpt-chat-honesty` 11/11, `chat-entry` 4/4, `chat-bundle-budget` 9/9, `gpt-paid-chat-schema` 4/4, `gpt-live-readiness` 10/10, `gpt-operations` 7/7, `gpt-readiness` 9/9, `gpt-rehearsal` 5/5, `gpt-api-cors` 2/2, `gpt-backend-security` 31/31, `functions-type-safety` 38/38, `error-disclosure` 16/16, `yandex-metrika` 69/69, `gpt-chat` 19/19, `gpt-chat-limits` 13/13, `gpt-bot-login` 17/17, `telegram-web-login` 13/13, `studio-contact` 18/18, `gpt-limit-state` 13/13, `gpt-chat-handoff-link` 12/12, `gpt-chat-prerender-links` 9/9, `runtime-config` 4/4, `pages-config-parity` 7/7, `secret-scan` 16/16, `telegram-assistant` 77/77, `gpt-chat-truncation` 8/8, `gpt-chat-budget` 10/10, `gpt-uzum-merchant` 13/13, `gpt-uzum-payments` 24/24. `scripts/gpt-billing-load-rehearsal.ts` — до правки TypeError, после: 1000 / 800 / 200.
3. eslint изменённых файлов — 0; `git diff --check` — чисто; регэксп токена Telegram — 0; `scan:secrets` — чисто (3 236 файлов).
4. `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений**; `chat-bundle-budget` в бюджете: старт 106,5 КБ br (+1 601 Б к базе 01.10), `chat-account` 9,8 КБ br, `chat-lead` 4,5, `chat-tools` 6,2.

**Открыто, R4 не блокирует.**
1. **Хранение `gpt_ui_events` не ограничено.** Персональных данных там нет, но таблица растёт без уборки. Срок (например, 180 дней) стоит задать в WP-19 вместе с отчётом админки или в `maintainBilling`. Политика конфиденциальности (WP-18) должна упомянуть серверный счётчик воронки и случайный id вкладки (`sessionStorage gptchat_view`).
2. **На экране «оплата ещё не подтверждена» нет «Продолжить этот платёж».** Кто ушёл со страницы Click «Назад», не заплатив, до 10 минут не может вернуться к счёту или выбрать другого провайдера: закрытие окна ожидание не снимает. Денежного риска нет, неудобство есть. Можно показать там кнопку продолжения, пока счёт `pending` и его можно продолжить.
3. `?pay=return` открывает окно «Проверяем оплату» и при выключенной оплате. Попасть туда можно только по собранной вручную ссылке или при откате посреди оплаты. Во втором случае это правильно: вошедший увидит свой платёж.
4. Подтверждение возврата («Деньги вернутся на карту, с которой платили…») звучит как обещание, хотя решение за владельцем (L12). Сверить с офертой в WP-18 у юриста.
5. Код Uzum Bank: уход в приложение не сохраняет вопрос из поля (`onLeave` только у перехода на страницу оплаты). Телефон, выгрузивший вкладку, пока открыт Uzum Bank, теряет неотправленный вопрос, если не было лимита.
6. Поездка другого аккаунта (вышел и вошёл другим за 30 минут) ждёт заказ, которого новый account view не покажет: через 10 минут «не подтверждена». Редко.
7. Остаётся из WP-17: срок ответа на возврат (WP-18), исходящие клики GA4 enhanced measurement, возврат из приложений Click и Uzum на iOS и Android, вычитка UZ носителем.

**Следующее.** WP-18 (оферта и политика RU/UZ, версия условий, live-гейт при деплое).

---

# Платный AI-чат: WP-17 — окно «AI paket», панель «Paketim», возврат с оплаты, 2026-10-03

**Итог.** Сделан WP-17 плана `10-PROD-PLAN.md` (релиз R4) на ветке `paid-chat/prod-readiness` поверх `0a5f791b` (WP-16 после ревью), коммит `782dc7f3` (`782dc7f3e2c506ff206de2c073df0dcf01303997`; следующий коммит только записывает этот SHA в STATE, правило D-006). Путь «лимит → окно → вход → Click/Uzum → возврат → пакет активен» собран целиком: окно пакета, вход ботом, шаг оплаты, экран «Проверяем оплату», код для приложения Uzum Bank и панель «Paketim». Всё это — в ленивой части `chat-account`. Пока оплата выключена, окно недостижимо: пилюли и кнопок пакета нет, `POST /api/gpt/event` отвечает 404 до тела и D1, гостевой `/api/gpt/account` в D1 не ходит. Ничего не запушено и не задеплоено; Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты. Защищённые страницы 10/10 без изменений.

**Возобновление.** Дерево было чистым на `0a5f791b`, незаконченной работы WP-17 и резервных копий `wp17-*` не было.

**Что сделано.**
1. **Окно** (`src/gpt-chat/account/`, ленивая часть `chat-account`): `AccountDialog.tsx` (бывший `components/AiAccountWindow.tsx`), `BotLoginScreen.tsx` (бывший `components/AiBotLogin.tsx`), `CheckoutReturn.tsx`, `UzumCodeScreen.tsx`, `PackPanel.tsx`.
   - Гость видит карточку пакета: цену, условия, «без автосписаний» и строку честности («ответы в чате GPTBot.uz, а не доступ к ChatGPT; сервис не связан с OpenAI»). Ниже — вход через бота.
   - Вошедший видит «Paketim»: «120 / 300», «сегодня можно ещё N (до 50 в день)», «действует до …». Дальше чеки (только `ofd.soliq.uz` и хосты Uzum) и запрос возврата, который отправляется только со второго нажатия, после подтверждения. Ещё ниже — куда писать (ceo@gptbot.uz, +998 50 587 07 20 из `content/global/site.json`) и «Выйти».
   - Шаг оплаты: галочка оферты своего языка и кнопки из `account.providers` в порядке сервера (Click, затем Uzum). Для Uzum Merchant кнопка — «Оплатить в приложении Uzum Bank». Под кнопками — «данные карты к нам не попадают». Незавершённый счёт продолжается, второй не создаётся; на 409 `pending_elsewhere` окно пишет «счёт через X ещё ждёт оплаты».
   - Все числа пакета (цена, ответы, дневной лимит, месяцы) берутся из `account.pack`. Литералов в окне нет.
2. **Возврат с оплаты** (`src/gpt-chat/checkout.ts`, стартовый бандл).
   - Перед уходом на страницу оплаты браузер сохраняет в `localStorage` запись `gptchat_checkout` (провайдер, время, номер заказа; без суммы и карты, на 30 минут) и вопрос из поля (`gptchat_draft`, 60 минут).
   - По `?pay=return` или по записи моложе 30 минут окно открывается само (`pack_viewed{from: pay_return}`), а параметр уходит из адреса.
   - Пока платёж не завершён, `/api/gpt/account` опрашивается каждые 3 с первые 2 минуты, затем каждые 15 с до 10 минут, и только при видимой вкладке (`useAccount(…, watchSince)`). Старый опрос 5 с × 6 удалён.
   - Экран проходит путь «Проверяем оплату…» → один из исходов: «Оплата получена» с панелью пакета; через 2 минуты без ответа — «ещё не подтверждена, не платите повторно», «Проверить статус» и контакт; «Платёж отменён» с «Попробовать ещё раз» и контактом.
   - Решает только account view, по номеру заказа. Для кода Uzum засчитывается первый заказ новее того, что был до показа кода.
   - Тестовый заказ (`mode: 'test'`) показывает «страница оплаты не открывается» и ждёт так же. Возврат из кэша страниц (bfcache) снимает «Переходим на страницу оплаты…».
3. **Код Uzum Bank**: код группами («1234 5678 2»), шаги в приложении с суммой, «Скопировать код», опрос как выше. Код берётся из `account.paymentCode`, до его появления — из ответа `subscribe`. Код закрыт от Вебвизора (`ym-hide-content`).
4. **Вопрос в поле.** Вход гостя (гость → аккаунт) больше не очищает поле ввода (`keepsComposer` в `storage.ts`). Выход и чужой аккаунт очищают его, как раньше. Уход на страницу оплаты сохраняет вопрос и без лимита (`onLeave` → `saveDraft`). Это закрывает открытый пункт 3 WP-16.
5. **Аналитика.**
   - GA4: новые `checkout_result{status, provider, mode}` и `purchase`. Покупка уходит как ecommerce через отдельную `trackPurchase`, только в live, только после подтверждения сервером и один раз на заказ в этом браузере (`gptchat_purchases`). У `login_*` для OIDC теперь `method: oidc` вместо `telegram`.
   - Итог оплаты сообщает `AiAccountPanel` (стартовый бандл), поэтому он считается и при закрытом окне. `pending` уходит, когда кончились 10 минут ожидания; позже может прийти `paid`.
   - Серверный счётчик: `POST /api/gpt/event`, `functions/lib/gpt-chat/ui-event-store.ts` и таблица `gpt_ui_events` (в `0068` и в `PAID_CHAT_DDL`). Шаги — `pack_viewed`, `login_started`, `login_result`, `checkout_started`, `checkout_result`; у каждого закрытый список квалификаторов.
   - Защиты роута: `sameOrigin` (иначе 403), 404 до тела и D1, пока посетителю не предложен провайдер, тело не больше 1 КБ, 60 событий в час на хеш IP. `id` события задаёт браузер, поэтому повтор запроса считается один раз. Ни текста, ни IP, ни аккаунта, ни сессии чата в таблице нет. У каждого события GA4 из воронки есть пара на сервере (тест).
6. **Сервер `/api/gpt/account`**: новое поле `access.dayRemaining` — сколько ответов дневной лимит пакета ещё пропустит сегодня, не больше остатка пакета. Считается по тому же правилу `pack_daily`, что у `reserve()`, одной выборкой в `allowance()`. Неиспользуемый `TurnStore.remaining()` удалён.
7. **`types.ts`**: `validAccountView` (fail-closed) проверяет `pack`, `uzumFlow`, `paymentCode` (только у вошедшего), `access.message_limit` и `access.dayRemaining`. `canStartCheckout` требует `pack`.
8. **Метрика**: ссылка «Открыть Telegram» на экране входа помечена `ym-disable-tracklink` (часть открытого пункта 1 ревью WP-16).
9. **Локальная приёмка без оплаты**: `scripts/pack-window-preview.ts`. Скрипт отдаёт `dist/` на 127.0.0.1 и отвечает на account/subscribe/event/вход фиксированными состояниями: guest, off, member, test, pending, paid, code, cancelled. Состояние переключается адресом `/__preview/<state>`. CSP не пускает со страницы ни аналитику, ни внешние запросы.
10. Документы: `docs/paid-chat/ANALYTICS-RU.md` (воронка, `purchase`, серверный счётчик) и путь экрана входа в `LOGIN-RU.md`. Оба новых теста добавлены в `npm test`.

**Отклонения от плана (и почему).**
1. **Нет V `GPT_SUPPORT_EMAIL` и поля `account.support`.** Владелец назвал контакт (ceo@gptbot.uz, +998 50 587 07 20). Он уже лежит в единственном источнике контакта студии — `content/global/site.json` (`email`, `phone`; `src/shared/studio-contact.ts`, решение L14). Копия в `wrangler.toml` со временем разошлась бы с ним. Сменить контакт — одна строка в `site.json`. Запрос возврата, как и раньше, уходит владельцу через outbox (`refund_requested`).
2. **Срока ответа на возврат («{N} рабочих дней», карта 03 §4 `refundHint`) нет.** Это обязательство оферты, его зафиксирует WP-18 после юриста. Панель говорит, куда писать, и что деньги вернутся на карту, с которой платили.
3. **Колонки `gpt_ui_events`: `view_id` и `detail` вместо `session_id` и `topic`.** `view_id` — случайный id вкладки, а не id сессии чата, поэтому событие нельзя связать с перепиской. `detail` — единственный квалификатор шага из закрытого списка (откуда открыли, способ входа, итог, провайдер); для бизнес-строки им будет тема. Типы `b2b_line_shown` и `b2b_line_dismissed` добавит WP-20 вместе со своим гейтом: сейчас роут закрыт, пока нет оплаты, а бизнес-строке нужен другой гейт.
4. **Чужой незавершённый счёт без поездки на оплату больше не опрашивается** (раньше — 6 раз по 5 с). Опрос идёт, только когда этот браузер ушёл платить или вернулся с `?pay=return`; при фокусе окно и так перечитывается.
5. **`purchase` не отправляется в режиме test**: репетиция — не выручка.
6. **Добавлен скрипт `scripts/pack-window-preview.ts`**, которого нет в плане. Он нужен для приёмки «все экраны на 375×812, RU и UZ» до включения оплаты; его состояния проверяет тест.

**Проверки.**
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0. Изменённые тесты и скрипт проверены разовым tsconfig вне репозитория: новых ошибок нет, остались старые расхождения DOM и workers-types (`Response.json(): unknown`) в чужих строках.
2. По одному файлу с `NODE_OPTIONS=--max-old-space-size=1400`: `gpt-pack-dialog` 12/12 (новый), `gpt-ui-events` 6/6 (новый), `gpt-account-ui` 23/23 (+6), `gpt-account-storage` 7/7 (+1), `gpt-chat-lazy-part` 7/7, `gpt-chat-honesty` 11/11, `chat-entry` 4/4, `chat-bundle-budget` 9/9, `gpt-billing` 18/18 (+1), `gpt-operations` 7/7, `gpt-paid-chat-schema` 4/4, `gpt-live-readiness` 10/10. Ещё: `gpt-chat` 19/19, `gpt-chat-limits` 13/13, `gpt-chat-truncation` 8/8, `gpt-hash-salt` 11/11, `gpt-readiness` 9/9, `gpt-rehearsal` 5/5, `gpt-bot-login` 17/17, `gpt-api-cors` 2/2, `gpt-backend-security` 31/31, `functions-type-safety` 38/38, `error-disclosure` 16/16, `gpt-uzum-payments` 24/24, `gpt-uzum-merchant` 13/13, `gpt-uzum-fiscal` 10/10, `gpt-uzum-rehearsal` 3/3, `gpt-click-fiscal` 14/14, `yandex-metrika` 69/69, `gpt-limit-state` 13/13, `gpt-chat-handoff-link` 12/12, `studio-contact` 18/18, `runtime-config` 4/4, `pages-config-parity` 7/7, `gpt-chat-prerender-links` 9/9, `seo-revenue-claims` 7/7, `release-preparation` 21/21, `gpt-chat-stream` 11/11, `telegram-web-handoff` 22/22, `gpt-chat-session-privacy` 3/3, `gpt-chat-budget` 10/10, `gpt-watchdog` 15/15, `gpt-retention` 4/4, `gpt-chat-runtime-schema` 5/5, `gpt-model-policy` 14/14, `telegram-web-login` 13/13, `telegram-assistant` 77/77, `gpt-routing` 6/6, `gpt-zai-provider` 18/18, `gpt-chat-bridge` 42/42, `gpt-backend` 18/18.
3. Мутации ловятся все 11: роут событий без гейта; `INSERT OR REPLACE` вместо `OR IGNORE`; любой `detail`; `dayRemaining` без потолка остатка; заказ не сверяется с `attemptId`; повторный `purchase`; `purchase` в test; поле ввода очищается при входе; `canStartCheckout` без `pack`; чек с любого хоста; цена при выключенной оплате.
4. eslint по изменённым файлам — 0; `git diff --check` — чисто; регэксп токена Telegram по диффу — 0; `scan:secrets` — чисто (3 236 файлов), `test:secret-scan` 16/16.
5. `npm run build:fast` — 0. `seo-protection check` — **10/10 без изменений** (база `2026-10-01-paid-chat-honesty`). `chat-bundle-budget` в бюджете: старт 106,6 КБ br (+1 620 Б к базе 01.10, из них ≈ +1,29 КБ — этот WP), `chat-account` 9,8 КБ br (≤ 12), `chat-lead` 4,5, `chat-tools` 6,3. `content/` не менялся.

**Приёмка, проверенная локально** (`scripts/pack-window-preview.ts`, Browser pane 375×812, RU и UZ).
1. Гость видит пакет и вход. Карточка лимита → «AI-пакет» → окно. Вход ботом показывает число 47. После входа вопрос остался в поле, появились кнопки Click и Uzum Bank.
2. Оплата (test) → «Проверяем оплату…». Сервер переключён в paid → «Оплата получена», «120 / 300», «сегодня можно ещё 37», «действует до». В dataLayer пришли `pack_viewed`, `checkout_started`, `checkout_result{paid}`, `purchase`; на сервер ушли те же шаги.
3. `?pay=return` открывает окно и убирает параметр из адреса. Отмена → «Попробовать ещё раз» → снова кнопки оплаты.
4. Код Uzum «1234 5678 2» → paid. В «Paketim» есть чек; возврат с подтверждением → «запрос принят».
5. При выключенной оплате пилюли нет.
6. В консоли ошибок нет, кроме заблокированных CSP inline-скриптов аналитики — так задумано. Сервер превью остановлен.

**Для релиза R4 (делает ведущий).**
1. `0068` теперь включает и `gpt_ui_events`. Применяется **до** кода; репетиция — как в `tests/gpt-paid-chat-schema.test.ts`.
2. Приёмка после деплоя: `POST https://gptbot.uz/api/gpt/event` (с `Origin`) → 404; `SELECT COUNT(*) FROM gpt_ui_events` = 0; `GET /api/gpt/account` гостя → `providers: []`, пилюли на чат-страницах нет.
3. На релизной сборке выполнить `npx tsx scripts/chat-bundle-budget.ts --record` (база от 01.10; рост за R4 +1,6 КБ br).
4. До включения Uzum Merchant сверить с менеджером Uzum название услуги в приложении (`UZUM_APP_SERVICE = "GPTBot.uz"` в `UzumCodeScreen.tsx`, §8 п.6).
5. Владелец: зарегистрировать в GA4 параметр `status`, после первой живой покупки отметить `purchase` ключевым событием (`ANALYTICS-RU.md`).

**Открыто, R4 не блокирует.**
1. Срок ответа на возврат — в оферте (WP-18). Тогда же можно добавить его строку в панель.
2. GA4 enhanced measurement (исходящие клики) может записать deep link входа с nonce. Метрика его больше не пишет. Риск низкий: после правки WP-16 чужое открытие ссылки только срывает попытку.
3. Тёмный прогон всех экранов в проде — WP-22. Возврат из приложения Click/Uzum на iOS и Android (та же вкладка или новая) на устройствах не проверен: новая вкладка находит запись в `localStorage`.
4. Строки UZ на вычитку носителем: «ChatGPT’ga kirish emas», «2026-10-01 dagi paket uchun …». Дату `uz-UZ` Chrome пишет как `2026-10-31`.

**Следующее.** WP-18 (оферта и политика RU/UZ, версия условий, live-гейт при деплое).

---

# Платный AI-чат к проду: ревью WP-16, 2026-10-03

**Итог.** Проверил коммиты WP-16 `85e7207f` (код, тесты, документы, HANDOFF, STATE) и `4dc289ab` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md`: §1 (правила и проверки), §2 (L11, L18), строка R4 в §3, раздел WP-16 (файлы, модель угроз, настройки, миграция, тесты, приёмка, риски), §5 и §6; с картами `02` §6 (поток, DDL, таблица угроз) и `04` §6–7 (сторона бота, кейсы 11–21); с `AGENTS.md` §2–8 и §11. Дерево было чистым на `4dc289ab`, незаконченной работы и резервных копий не было. Ничего не запушено и не задеплоено; Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты.

**Сделано верно:**
- **Недостижимость при выключенной оплате.** `bot/start`, `bot/status` и OIDC-старт отвечают 404 до тела и D1 (`offeredLoginMethods`), гостевой `/api/gpt/account` в D1 не ходит и отдаёт `loginMethods: []` (L18).
- **Одноразовость.** Каждый переход — один условный `UPDATE … RETURNING`: `pending→claimed` только у первого открывшего, одно нажатие (`claimed→confirmed|rejected`), `confirmed→consumed` ровно один раз, в режиме `code` одна попытка ввода. Гонка двух опросов проверена на настоящем SQLite. Повтор `update_id` отсекается вебхуком.
- **Привязка к браузеру.** Результат получает только владелец `__Host-gpt_botlogin` (HttpOnly, Secure, SameSite=Lax, 600 с), без cookie 403, чужая cookie видит «expired». Вход выдаёт новую случайную сессию, старая сессия браузера удаляется (без фиксации сессии). `sameOrigin` на обоих POST.
- **Бот.** Ветка `/start login_` стоит до `w_` и `site_*`, кнопки `lg:`/`lgx:`/`lgout:` — до общего `answerCallbackQuery` и поиска item. Только личный чат, 10 открытий в час на псевдоним, без моделей и без лимита Javob. Чужой `from.id` не может ни нажать, ни перехватить. `callback_data` ≤ 64 байт. `lgout` трогает только сессии нажавшего.
- **Данные и изоляция.** В таблице только хеши (nonce, секрет браузера, HMAC идентичности), `org_id` в каждом запросе, тест «org B не видит org A», уборка через сутки в `maintainBilling`. Сырой Telegram id, nonce, число и код в события не попадают. OIDC хеширует claim `id` тем же хелпером, тест «бот и OIDC — один аккаунт» на месте.
- **Миграция и конфиг.** `0068` дополнена только `CREATE TABLE/INDEX IF NOT EXISTS`, тот же DDL в `PAID_CHAT_DDL`, паритет и репетиция через ledger в тесте. `GPT_BOT_LOGIN_MODE` и `TELEGRAM_ASSISTANT_BOT_USERNAME` есть в JSON, во вложенной таблице и в `RUNTIME_CONFIG_KEYS`; явный секрет перекрывает JSON (`hydrateRuntimeConfig`), поэтому шаг «удалить секрет после деплоя» верен.
- **Тексты** RU/UZ естественные, без цен, «Plus», «obuna», «подписка» и ссылок. Отклонения исполнителя (тесты бота на SQLite, `mode`/`choices`/`client` вместо `ip_hash`, режим `code`, `status` по `{id}`, 60 опросов в минуту, экран входа в WP-16, 404 вместо 503 у OIDC-старта) обоснованы.

**Дефекты, исправлены (`fix(auth): address WP-16 review findings`):**
1. **Low–Medium, безопасность: перехваченная ссылка всё ещё могла войти в чужой аккаунт.** Таблица угроз (`02` §6.4, строка «Кража ссылки») и `LOGIN-RU.md` обещают: если ссылку первым открыл другой аккаунт Telegram, хозяин в боте видит «ссылку уже открыл другой аккаунт», а сайт — «отклонено». В коде второе открытие только отвечало `LOGIN_TAKEN` и ничего не меняло. Сайт продолжал ждать. Если перехвативший угадывал число (1 из 3), браузер хозяина входил в аккаунт перехватившего, и хозяин мог оплатить пакет не себе. Теперь `openByNonce` при открытии вторым аккаунтом условным `UPDATE` переводит попытку в полёте (`claimed` или `confirmed`) в `rejected`. Сайт показывает «отклонено, начните заново», нажатия держателя больше ничего не подтверждают. Уже собранную попытку (`consumed`) не трогаем. Отклонение от `04` §7 п.13 («другим → строка не меняется») сделано сознательно: там тест противоречит таблице угроз `02` §6.4, а новой силы второй открывший не получает (первым открыв ссылку, он и так мог её сорвать). Тесты: новый в `gpt-bot-login` (перехват до и после нажатия, уже собранная попытка), п.13 в `telegram-web-login`, ветка фейка и шаг в `telegram-assistant`. Мутации ловятся.
2. **Low–Medium, функция: при часах компьютера, ушедших вперёд на 10 минут и больше, войти было нельзя.** Окно считало срок по `expiresAt` сервера, но сравнивало его с `Date.now()` браузера. Так бывает на ПК с неверным часовым поясом, где местное время выставлено вручную: эпоха уходит вперёд на часы. Тогда каждая попытка «истекала» в первую же секунду, а при меньшем сдвиге окно сокращалось. Теперь `start` отдаёт ещё `expiresIn` (мс), и `attemptFromStart()` в `src/gpt-chat/bot-login.ts` считает срок по часам браузера. Сервер по-прежнему решает сам (`expires_at`). Тест в `gpt-account-ui` (часы на 2 часа вперёд, мусорные `expiresIn`), `gpt-bot-login` проверяет поле. Мутация ловится.
3. **Текст UZ:** «boshqa Telegram akkaunt ochgan» → «boshqa Telegram akkaunti ochgan» (изафет).

**Проверки.**
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0, до и после правки. Изменённые тесты проверены разовым tsconfig: новых ошибок нет, остались три старые в чужих строках `telegram-assistant.test.ts`.
2. По одному файлу с `NODE_OPTIONS=--max-old-space-size=1400`: `gpt-bot-login` 17/17 (+1), `telegram-web-login` 13/13, `telegram-assistant` 77/77, `gpt-account-ui` 17/17 (+1), `gpt-chat-lazy-part` 7/7, `gpt-live-readiness` 10/10, `gpt-paid-chat-schema` 4/4, `gpt-operations` 7/7, `gpt-readiness` 9/9, `gpt-rehearsal` 5/5, `telegram-web-handoff` 22/22, `gpt-chat-handoff-link` 12/12, `runtime-config` 4/4, `pages-config-parity` 7/7.
3. Мутации: без `UPDATE` при «taken» падают `gpt-bot-login`, `telegram-web-login` и (без вызова) `telegram-assistant`; со сроком по `expiresAt` сервера падает `gpt-account-ui`.
4. eslint по изменённым файлам — 0; `git diff --check` — чисто; регэксп токена Telegram по диффу — 0; `scan:secrets` — чисто (3 226 файлов), `test:secret-scan` 16/16; ещё `yandex-metrika` 69/69, `gpt-chat-honesty` 11/11, `gpt-billing` 17/17, `chat-bundle-budget` 9/9.
5. `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений** (база `2026-10-01-paid-chat-honesty`); `chat-bundle-budget` — в бюджете: старт 105,3 КБ br (+334 Б к базе, из них +73 Б — эта правка), `chat-account` 6,6 КБ br.

**Открыто, R4 не блокирует.**
1. Кнопка «Открыть Telegram» — обычная ссылка. Автотрекинг внешних ссылок (Метрика `trackLinks: true`, расширенная статистика GA4, GTM) может записать её адрес с nonce. Одного nonce для входа мало: нужны cookie браузера и число, а читающему аналитику пришлось бы открыть ссылку раньше хозяина. После правки 1 такое открытие только срывает попытку. Если нужно закрыть и это, в WP-17: открывать ссылку из `<button>` через `window.open` или добавить класс `ym-disable-tracklink` (Метрика).
2. Если попытку сорвал второй аккаунт, нажатие держателя получает тост «Уже обработано» без отдельного текста.
3. Если после `consumed` не записалась сессия (сбой D1), браузер получает 503, затем «истекло» и начинает заново. Алерта на стороне сайта нет, есть только `bot_login_failed` в боте.
4. Из WP-16 остаются: deep link на iOS/Android и возврат в ту же вкладку (во встроенном браузере Telegram на iOS `sessionStorage` может не пережить переход), claim `id` у Telegram OIDC, очистка поля ввода после входа (WP-17).

**Следующее.** WP-17 (окно «AI paket», панель «Paketim», возврат с оплаты).

---

# Платный AI-чат: WP-16 — вход на сайт через бота @gptbotuz_bot, 2026-10-03

**Итог.** Сделан WP-16 плана `10-PROD-PLAN.md` (релиз R4) на ветке `paid-chat/prod-readiness` поверх `b29dcbe2` (WP-15 после ревью), коммит `85e7207f` (`85e7207fc991c02d6a9521a7a45cafa748bd62ed`; следующий коммит только записывает этот SHA в STATE, правило D-006). Вход на сайт идёт через уже работающего бота, без BotFather: число на сайте, выбор 1 из 3 в боте, одна попытка, 10 минут, одноразово, привязано к cookie браузера, в боте есть «Выйти на всех устройствах». OIDC остаётся опцией при `GPT_TELEGRAM_CLIENT_ID` и попадает в тот же аккаунт. Пока оплата выключена, вход недостижим: кнопки нет, `start`/`status` и OIDC-старт отвечают 404 до тела и D1. Бесплатный счётчик вход не обнуляет. Ничего не запушено и не задеплоено; Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты. Защищённые страницы 10/10 без изменений.

**Возобновление.** Дерево было чистым на `b29dcbe2`, незаконченной работы WP-16 и резервных копий `wp16-*` не было.

**Что сделано.**
1. **Сервер.** `functions/api/gpt/auth/bot/start.ts`: `sameOrigin`, согласие, 10 стартов в час на хеш IP (общий счётчик `account_login` с OIDC), не больше 5 попыток браузера в полёте, nonce 128 бит, cookie `__Host-gpt_botlogin` (HttpOnly, Secure, SameSite=Lax, 600 с), ответ `{id, mode, code, deepLink, expiresAt}`. `status.ts`: без cookie 403, опрос до 60 в минуту на браузер, `confirmed → consumed` одним условным `UPDATE`, новая сессия `__Host-gpt_account`, старая сессия браузера завершается, cookie попытки и чата сбрасываются (как в OIDC callback). Состояние — `bot-login-store.ts` (весь SQL `gpt_bot_logins`, `orgId` в каждом запросе), ключ аккаунта — `telegram-identity.ts`: HMAC-SHA256(`GPT_IDENTITY_SECRET`, `"tg:"+id`).
2. **Бот.** `functions/lib/telegram/web-login.ts`; в `handler.ts` ветка `/start login_` идёт до `w_` и `site_*`, ветки `lg:`/`lgx:`/`lgout:` — до общего `answerCallbackQuery` и поиска item. Только личный чат, 10 открытий в час на псевдоним, без моделей и без лимита Javob. Сообщение на языке страницы сайта: браузер и ОС, время по Ташкенту, три числа и «Это не я». Повторное открытие тем же человеком — вопрос заново, другим — «ссылку уже открыл другой аккаунт». Решение переписывает сообщение и снимает кнопки, второе нажатие — только тост. `lgout` завершает сессии своего аккаунта и отклоняет его незавершённые входы. События `web_login_*` с meta `{locale}`. Срочный алерт `bot_login_failed`.
3. **OIDC.** Scope `openid profile`; callback хеширует claim `id` тем же хелпером; без `id` вход отклоняется. Имя, ник и фото не хранятся.
4. **`loginMethods`.** `bot` при `GPT_IDENTITY_SECRET` ≥ 32, обоих секретах бота, валидном `GPT_HANDOFF_BOT_USERNAME` и валидном `GPT_BOT_LOGIN_MODE`; `oidc` при OIDC-клиенте. `account.ts` отдаёт их только при видимом провайдере, `offeredLoginMethods()` делает то же для роутов. `liveReadiness()` без способа входа называет недостающее для бота.
5. **Сайт.** `AiBotLogin.tsx` в ленивой части `chat-account`: кнопка, шаги, крупное число, «Открыть Telegram», «Скопировать ссылку», отсчёт 10:00, предупреждение; опрос каждые 2 с при видимой вкладке и сразу по `visibilitychange`/`focus`, без параллельных запросов. Попытка живёт в `sessionStorage`, после перезагрузки `AiAccountPanel` снова открывает окно. `isBotLoginUrl()` в `handoff.ts`, `loginMethods` в `validAccountView` (fail-closed), строки `botLogin*` RU/UZ. Старт +261 Б br, `chat-account` 6,6 КБ br.
6. **Миграция и настройки.** `0068_gpt_paid_chat.sql` дополнена таблицей `gpt_bot_logins` и двумя индексами, тот же DDL — в `PAID_CHAT_DDL`, паритет и репетиция через ledger в `tests/gpt-paid-chat-schema.test.ts`. V `GPT_BOT_LOGIN_MODE="pick"`; `TELEGRAM_ASSISTANT_BOT_USERNAME="gptbotuz_bot"` перенесён в JSON (JSON 3 919 Б из 5 120). Уборка попыток через сутки после истечения — в `maintainBilling`. Runbook — `docs/paid-chat/LOGIN-RU.md`; `ALERTS-RU.md` и `BOT-RU.md` дополнены. Оба новых теста добавлены в `npm test`.

**Отклонения от плана (и почему).**
1. **Тесты бота — на настоящем SQLite**, как `telegram-web-handoff.test.ts`: защита держится на условных `UPDATE` и `changes`, regex-фейк проверял бы сам себя. Фейк Javob в `telegram-assistant.test.ts` всё равно получил ветки этого SQL и тест: вход проходит раньше Javob, а Javob отвечает как прежде.
2. **DDL:** без `ip_hash` (лимит по IP живёт в `gpt_rate_limits`, лишние персональные данные не храним); добавлены `mode`, `choices` (три числа хранятся, поэтому повторное открытие не выдаёт верное число пересечением) и `client`; статуса `expired` нет — истечение видно по `expires_at`.
3. **Режим `code` реализован** (переключатель из модели угроз): бот присылает 6 цифр, сайт принимает их одной попыткой и только после открытия ссылки. Любое другое значение `GPT_BOT_LOGIN_MODE` выключает вход через бота.
4. **`status` принимает `{id}`.** Иначе две вкладки одного браузера путали бы попытки. Лимит «5 в полёте» работает потому, что браузер сохраняет свой секрет между стартами.
5. **Опрос ограничен 60 запросами в минуту на браузер**, а не жёстко 1/с: фиксированное окно в 1 с писало бы строку счётчика на каждый опрос.
6. **Экран входа сделан в WP-16** (`AiBotLogin.tsx`). Без него сервер с `bot` отправил бы старую кнопку в OIDC-старт и получил бы 404. WP-17 может перенести его в `BotLoginScreen.tsx`.
7. **OIDC-старт отвечает 404, а не 503**, пока вход не предлагается — как все роуты оплаты.

**Проверки.** `npx tsc -b` — 0; `npm run typecheck:functions` — 0; новые и изменённые тесты проверены разовым tsconfig вне репозитория: в них новых ошибок нет (старые расхождения DOM и workers-types в чужих строках остались). По одному файлу с `NODE_OPTIONS=--max-old-space-size=1400`: `gpt-bot-login` 16/16 (новый), `telegram-web-login` 13/13 (новый), `telegram-assistant` 77/77 (+1), `gpt-live-readiness` 10/10 (+1), `gpt-paid-chat-schema` 4/4, `gpt-operations` 7/7, `gpt-account-ui` 16/16 (+2), `gpt-chat-lazy-part` 7/7 (+1), `gpt-readiness` 9/9, `gpt-rehearsal` 5/5, `gpt-billing` 17/17, `gpt-chat` 19/19, `gpt-chat-limits` 13/13, `runtime-config` 4/4, `pages-config-parity` 7/7, `gpt-chat-honesty` 11/11, `gpt-chat-handoff-link` 12/12, `telegram-web-handoff` 22/22, `gpt-watchdog` 15/15, `gpt-chat-bridge` 42/42, `gpt-uzum-payments` 24/24, `gpt-uzum-merchant` 13/13, `gpt-uzum-fiscal` 10/10, `gpt-uzum-rehearsal` 3/3, `gpt-click-fiscal` 14/14, `gpt-hash-salt` 11/11, `gpt-chat-budget` 10/10, `gpt-chat-runtime-schema` 5/5, `gpt-chat-truncation` 8/8, `gpt-model-policy` 14/14, `gpt-routing` 6/6, `gpt-zai-provider` 18/18, `chat-bundle-budget` 9/9, `chat-entry` 4/4, `seo-revenue-claims` 7/7, `yandex-metrika` 69/69, `functions-type-safety` 38/38, `error-disclosure` 16/16, `openrouter-model-catalogue` 5/5, `release-preparation` 21/21, `n8n-retirement` 16/16, `automation-runtime` 13/13, `lead-radar-release-gate` 12/12. Мутации ловятся: без гейта по провайдеру в `account.ts`, без `tg_hash` в `decide`, с `consumed` в условии `consume`, без проверки cookie в `status`, без лимита открытий, без проверки «чужой аккаунт» — каждая валит свой тест. eslint по всем изменённым файлам — 0; `git diff --check` — чисто; регэксп токена Telegram по диффу — 0; `scan:secrets` — чисто (3 226 файлов), `test:secret-scan` 16/16. `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений**; `chat-bundle-budget` — в бюджете. `content/` не менялся.

**Приёмка, проверенная локально.** С закоммиченной конфигурацией (оплата выключена) `POST /api/gpt/auth/bot/start`, `/status` и `/api/gpt/auth/start` → 404 до D1 (тест `gpt-live-readiness`, D1-«бомба»); `/api/gpt/account` → `loginAvailable:false, loginMethods:[]`. `/start login_<случайный>` → «ссылка устарела», строк в `gpt_bot_logins` — 0. Полный вход ботом и через OIDC попадает в один аккаунт; остаток бесплатных после входа тот же.

**Для релиза R4 (делает ведущий).**
1. `0068` применяется **до** кода (теперь с `gpt_bot_logins`), репетиция — как в `tests/gpt-paid-chat-schema.test.ts`.
2. Секрет Pages `GPT_IDENTITY_SECRET` (≥ 32 случайных символов, генерирует агент, не печатать) → guarded-передеплой. Без него вход и OIDC выключены.
3. После деплоя с JSON удалить Pages-секрет `TELEGRAM_ASSISTANT_BOT_USERNAME`: пока он есть, он перекрывает значение из JSON. Значение секрета не читалось; в JSON — `gptbotuz_bot`.
4. Приёмка после деплоя: `POST https://gptbot.uz/api/gpt/auth/bot/start` (с `Origin`) → 404; `/start login_<32 случайных hex>` в боте → «ссылка устарела»; `SELECT COUNT(*) FROM gpt_bot_logins` = 0. Реальный вход — в WP-22 (тёмная репетиция).

**Открыто, R4 не блокирует.**
1. Deep link `start=login_…` на iOS и Android у тех, кто уже запускал бота, и возврат в ту же вкладку не проверены на устройствах (сайт опрашивает по `visibilitychange`/`focus`, перезагрузку переживает `sessionStorage`).
2. Claim `id` в id_token Telegram OIDC — по документации; живым токеном не проверен (OIDC-клиента в проде нет). Без `id` OIDC-вход отклоняется, вход ботом работает.
3. После входа ботом чат очищает поле ввода: так он ведёт себя при любой смене личности. Возврат черновика — в пути «лимит → окно → вход → оплата» WP-17.
4. `/delete_me` в боте веб-сессии не отзывает (предложение карты 04 §6.5): для этого есть «Выйти на всех устройствах».

**Следующее.** WP-17 (окно «AI paket», панель «Paketim», возврат с оплаты).

---

# Платный AI-чат к проду: ревью WP-15, 2026-10-02

**Итог.** Проверил коммиты WP-15 `e77f655d` (код, документы, HANDOFF, STATE) и `c2d0fb15` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md`: §1 (правила и проверки), §2 (L7, L9, L16, L17), строка R4 в §3, раздел WP-15 (файлы, U1–U14, настройки, миграция, тесты, приёмка, риски), §5 и §6. Ещё — с тремя спецификациями Uzum в `docs/paid-chat/uzum-spec/` и с `AGENTS.md` §2–8, §11. Дерево было чистым на `c2d0fb15`, незаконченной работы не было. Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не менялись; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты.

**Сделано верно:**
- **Инертность.** Без режима, `UZUM_API` и кредов вебхуки Merchant API и колбэк Checkout отвечают 404 до тела и D1, шаг `uzum` тика возвращает `null` без D1, витрина и гостевой `/api/gpt/account` в D1 не ходят (L18).
- **Подлинность.** Basic проверяется до тела: схема в любом регистре, декодирование, сравнение за постоянное время. Колбэк Checkout денег не двигает, решает свой `getOrderStatus`.
- **Ключи.** Ключи уходят только на хосты из allowlist, только https, без порта, логина и query. Переход на `redirect: "manual"` с отказом на любой 3xx верен: workerd не принимает `"error"`, это подтверждает и починка крона `6d949b53`. Фейки повторяют отказ workerd.
- **Идемпотентность и изоляция.** Повтор `transId` → 10010, половинчатый `/create` подхватывается. `operation_id` и `X-Operation-Id` пишутся до вызова. Строка чека защищена `PRIMARY KEY(org_id, order_id, kind)`. `org_id` есть в каждом запросе, тесты «чужая org» на месте.
- **Код аккаунта.** Луна посчитана верно, генерация без смещения по модулю. `UNIQUE(org_id, user_id)` и `PRIMARY KEY(org_id, code)` закрывают гонки. Код несёт принятую оферту. Синтетический аккаунт в live не платит.
- **Чеки.** Тело `/v2/receipt` и `/v2/refund_receipt` совпадает со схемами `ReceiptData` и `RefundData`. `date_time` — момент оплаты по Ташкенту. 202 и «уже был» повторной отправки не дают. Кто печатает, фиксируется в заказе (`autofiscal`).
- **Миграция и конфиг.** `0068` только добавляет и ложится до кода. Паритет с обеими инициализациями и репетиция через ledger покрыты тестом. Uzum-DDL идёт только в путях Uzum (Б9). `UZUM_FISCAL_*_BASE_URL` есть в JSON, в таблице `wrangler.toml` и в `RUNTIME_CONFIG_KEYS`, паритет зелёный.
- **Тексты** алертов и документов естественные, без «Plus», «obuna» и «подписка». Отклонения исполнителя (чек Checkout через Fiscalization API, `operation_id` в строке чека, замена неподтверждённой оплаты, выключатель продаж для `/check` и `/create`, возврат по режиму заказа) обоснованы.

**Дефекты, исправлены (`fix(billing): address WP-15 review findings`):**
1. **Medium: решение по старому чтению могло «вернуть» оплаченный заказ без возврата денег.** `createAppPayment` читает открытые счета аккаунта, решает «закрыть» или «заменить», а пишет потом. `transition()` перечитывает заказ, но переход в `cancelled` разрешён и из `paid` (это `refunded`). Сценарий: `/confirm` прежней оплаты в приложении (или Complete от Click) проходит между чтением и записью. Тогда новый `/create` переводил только что оплаченный заказ в `refunded`. Пакет отзывался, в очередь вставал чек возврата, а Uzum уже получил ответ CONFIRMED и деньги оставил себе. Тот же класс ошибки был в правиле 30 минут: в шаге `uzum` тика и в `expire` вебхуков. Исправление: у `transition()` появилась опция `from`, то есть состояния, из которых заказ можно увести. Закрытие идёт только из `pending`, замена и истечение — только из `prepared`. Заказ, оплаченный в промежутке, даёт `state`: `/create` отвечает 10008, а тик пропускает строку и не валит шаг. Новый тест в `gpt-uzum-merchant` встраивает оплату между чтением и записью. Он проверен мутациями: без исправления каждая из трёх частей (оплата в приложении, счёт Click, тик) падает.
2. **Low–Medium: продажа на ОФД без чека возврата.** Если деньги вернули раньше, чем чек продажи получил ссылку, строка `PERFORM` пропускалась (`skipped_refunded`). Так было, даже когда Uzum чек уже принял (202) или принял, но ответ потерялся. Строка `CANCEL` тогда тоже пропускалась (`sale_unprinted`), и на ОФД оставалась продажа без возврата. Теперь продажа без `operation_id` (ни одного вызова не было) пропускается, как раньше. Иначе решает ответ Uzum: `receipt_url` → 404 значит «не получал», и чек пропускается. Если Uzum чек держит, он допечатывается, а за ним идёт чек возврата.
3. **Попутно: чек возврата не уходил после потерянного ответа на чек продажи.** Продажа, найденная по ссылке после потерянного ответа, не сохраняла свой `payment_id`. Тогда `CANCEL` вечно падал с `payment_id` и слал алерты. Теперь берётся `payment_id` заказа: тот же uuid, с которым ушёл чек продажи. Новый тест в `gpt-uzum-fiscal` покрывает оба случая, мутации проверены. Старый тест «возврат до чека» тоже ловит мутацию пункта 2.

**Проверки.**
1. `npx tsc -b` — 0, `npm run typecheck:functions` — 0. Изменённые тесты проверены разовой сборкой tsc (временный tsconfig вне репозитория): 0.
2. По одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`): `gpt-uzum-payments` 24/24, `gpt-uzum-merchant` 13/13 (+1), `gpt-uzum-fiscal` 10/10 (+1), `gpt-uzum-rehearsal` 3/3, `gpt-billing` 17/17, `gpt-click-fiscal` 14/14, `gpt-paid-chat-schema` 4/4, `gpt-live-readiness` 9/9, `gpt-rehearsal` 5/5, `gpt-operations` 7/7, `gpt-watchdog` 15/15, `gpt-readiness` 9/9, `gpt-account-ui` 14/14, `gpt-hash-salt` 11/11, `gpt-retention` 4/4, `gpt-chat` 19/19, `gpt-backend` 18/18, `telegram-assistant` 76/76, `gpt-chat-limits` 13/13, `runtime-config` 4/4, `pages-config-parity` 7/7.
3. `node --import tsx scripts/uzum-sandbox-rehearsal.ts --api merchant --simulate local` — 22/22.
4. eslint по семи изменённым файлам — 0. `git diff --check` — чисто. Регэксп токена Telegram по диффу — 0. `scan:secrets` — чисто (3 215 файлов), `test:secret-scan` 16/16.
5. `npm run build:fast` — 0. `seo-protection check` — **10/10 без изменений** (база `2026-10-01-paid-chat-honesty`). `src/` и `content/` не менялись.

**Открыто, R4 не блокирует:**
1. Шаг `uzum` тика берёт 5 самых старых «зависших» заказов Checkout. Заказ, который навсегда остаётся «unchanged», каждый тик занимает слот: несовпадение суммы (алерт), `AUTHORIZED` или режим без кредов. Пять таких строк остановят сверку остальных кроном, но не панелью и не U4. Видно по алертам `uzum_amount_mismatch`. Если тестовые креды уберут после репетиции, сначала закройте тестовые `prepared`.
2. Просроченный счёт Click в `prepared` (Click прислал Prepare, но не Complete) блокирует оплату в приложении кодом 10008. Это консервативно: Complete по такому счёту Click ещё может прислать. На сайте `createOrder` такие счета не считает. Случай редкий, Click обычно присылает Complete с ошибкой.
3. Из WP-15: `redirect: 'error'` в `functions/platform/market/media.ts` (Bormi) — отдельная задача.

**Следующее.** WP-16 (вход через бота @gptbotuz_bot).

---

# Платный AI-чат: WP-15 — Uzum (пакет C): ревью по спецификации, оба режима, чеки, репетиция, 2026-10-02

**Итог.** Сделан WP-15 плана `10-PROD-PLAN.md` (релиз R4) на ветке `paid-chat/prod-readiness` поверх `ded5e8a8`, коммит `e77f655d` (`e77f655d8e81e284ebe00a43acf7a455c6fa6674`; следующий коммит только записывает этот SHA в STATE, правило D-006). Uzum доведён в обоих режимах: Checkout (`X-Terminal-Id` + `X-API-Key`) и Merchant API (Basic), у обоих есть чек, оба инертны без ключей. Отчёт ревью — новый `docs/paid-chat/UZUM-REVIEW-2026-10.md`: открытых High и Medium нет. Миграция — дописана `0068_gpt_paid_chat.sql` (в проде не применена). Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты. Защищённые страницы 10/10 без изменений, `src/` и `content/` не менялись.

**Возобновление.** Дерево было чистым на `56d179c3` (WP-14 после ревью), незаконченной работы WP-15 и резервных копий `wp15-*` не было. Пока шла работа, другая сессия закоммитила в эту ветку `6d949b53` (починка крона: `redirect: "error"` в Worker) и `ded5e8a8` (квитанция ресолта); с файлами WP-15 они не пересекаются.

**Что сделано.**
1. **Ревью по спецификации** Checkout 1.10.3, Merchant API 1.0.0, Fiscalization 0.0.2: соответствие по каждой операции и полю, чек-лист безопасности, решения — `UZUM-REVIEW-2026-10.md`.
2. **Критичный дефект всех платёжных клиентов (найден по ходу).** workerd не знает `fetch(..., { redirect: "error" })` и бросает исключение до отправки (так же сломался крон, `6d949b53`). Клиенты Uzum Checkout (пакет C), Click Merchant API (WP-14) и новый Fiscalization API поэтому в проде не сделали бы ни одного запроса. Теперь `redirect: "manual"`, ответ 3xx — сбой без чтения тела. Фейки Click и Uzum в тестах бросают на `"error"`, как workerd; мутационная проверка: с `"error"` падают `gpt-click-fiscal` (11), `gpt-uzum-payments` (20), `gpt-uzum-fiscal` (9).
3. **U1 — оплата в приложении по коду.** Новый `payment-code-store.ts`: постоянный код аккаунта, 8 случайных цифр + контрольная Луна, таблица `gpt_payment_codes` (`PRIMARY KEY(org_id, code)`, `UNIQUE(org_id, user_id)`, принятая оферта). `subscribe` в режиме Merchant API заказа не создаёт и отвечает `{mode: "code", paymentCode}`; `account` отдаёт `uzumFlow` (`checkout` | `code`) и `paymentCode`, пока код несёт текущую оферту. `/check` принимает код числом и строкой (пробелы, дефисы), отвечает `account` и `product: "AI paket 300"`; `/create` создаёт заказ на лету (`request_id = transId`, сумма строго 2 000 000, согласие из кода). Uzum теперь предлагается на сайте и в этом режиме (экран кода — WP-17; нынешнее окно на `mode: "code"` просто обновляет панель).
4. **Правила одной оплаты аккаунта в приложении (U7, U10)** — `appPaymentAction`: невиденный провайдером счёт закрывается (`invoice_superseded`, актор `system`), неподтверждённая прежняя оплата в приложении заменяется (`uzum_superseded`, её поздний `/confirm` → 10015), остальное — 10008. Половинчатый `/create` того же `transId` подхватывается. Новые оплаты слушают выключатель продаж (`providerReady`, иначе 99999); `/confirm`, `/reverse`, `/status` работают всегда, пока у Uzum есть режим и креды.
5. **U8.** `/confirm` пишет `confirm_requested_at` до `paid`; `/status` и повторный `/confirm` довершают оплату (даже после 30 минут), крон через 10 минут довершает сам и шлёт `uzum_confirm_recovered`. **U9:** Basic в любом регистре, сравнение декодированных `login:password` за постоянное время (`merchantAuthorized`).
6. **U2 — чеки через Uzum Fiscalization API.** Новый `uzum-fiscal.ts` (`/v2/receipt`, `/v2/refund_receipt`, `GET /v2/receipt/{operation_id}/receipt_url`). Очередь `fiscal-store.ts` теперь общая для Click и Uzum (`provider='uzum'`, `PERFORM` и `CANCEL`): `operation_id` пишется до первого вызова и повторяется; повтор сначала спрашивает ссылку; 202 и «уже был» (400, код 2) — ждём ссылку, не шлём заново; `date_time` — момент оплаты по Ташкенту; чек возврата ждёт чек продажи и повторяет его `payment_id`, без чека продажи — `sale_unprinted`. Бэкофф и пороги как у Click, алерт `uzum_fiscal_failed` (только live). Тестовые заказы печатаются на тестовом хосте при `fiscal.test.apiKey` (Uzum требует эти ссылки до боевого ключа), без ключа — `skipped_test`.
7. **U3.** Live Checkout требует автофискализацию **или** ключ Fiscalization API. Кто печатает чек, фиксируется при регистрации (`gpt_uzum_orders.autofiscal`): строка очереди вставляется в batch перехода в `paid` только для заказа без корзины; корзина в возврате идёт ровно тогда, когда шла в оплате; колбэк чека учитывается только для заказа с автофискализацией.
8. **U4, U5, U11.** Просроченный зарегистрированный заказ перед закрытием сверяется с `getOrderStatus`, Uzum недоступен — ничего не закрывается (`uzum_unsettled` → 503). В тесте Checkout регистрирует на тестовом терминале и отдаёт `checkoutUrl` (только сессии репетиции). Панель спрашивает `getReceipts` для оплаченного заказа без чека.
9. **Шаг `uzum` в тике обслуживания** (`uzum-maintenance.ts`, 8 с параллельно с `fiscal`): сверка зарегистрированных заказов через 35 минут (U4), чеки автофискализации за 48 часов (через сутки без чека — `uzum_receipt_missing`, раз в сутки), закрытие неподтверждённых оплат через 30 минут, довершение зависших подтверждений. Пока Uzum выключен — `null` без D1.
10. **Возвраты.** `gpt-uzum-refund` берёт ключи режима самого заказа (деньги можно вернуть после выключения продаж). Для Merchant API вызова возврата нет: `confirmRefund` → 409 `uzum_merchant_refund`, запись возврата, который сделал Uzum, — по подтверждению владельца; чек возврата печатается очередью.
11. **U12–U14 и прочее.** Адреса Fiscalization API — V `UZUM_FISCAL_BASE_URL`, `UZUM_FISCAL_TEST_BASE_URL` (значения из спеки, JSON и таблица `wrangler.toml`, `RUNTIME_CONFIG_KEYS`; JSON 3 842 из 5 120 байт) за allowlist `ipt-merch.com`, `inplat-tech.com` и хостов Uzum. Сортировка по `(created_at, provider, id)`. TIN/PINFL комитента не передаются (своя продажа, вопрос Uzum). `allowedUzumReceipt` теперь то же правило, что панель (ровно `ofd.soliq.uz` или хост Uzum) — открытый пункт WP-14. Б9 перепроверен: Uzum-DDL только в путях Uzum. Тексты алертов Uzum на русском (`alert-policy.ts`).
12. **`0068_gpt_paid_chat.sql`** дописана: `gpt_fiscal_receipts.operation_id`, `gpt_uzum_orders.confirm_requested_at` и `autofiscal`, таблица `gpt_payment_codes`, индекс `idx_gpt_uzum_orders_state`. Тот же DDL — в bootstrap: колонка чека в `ensureBillingSchema`, остальное только в `ensureUzumSchema` (`UZUM_ORDER_COLUMNS`, `UZUM_PAID_CHAT_DDL`).
13. **Репетиция.** `scripts/uzum-sandbox-rehearsal.ts --api merchant --simulate <сайт | local>` играет Uzum Bank: 22 шага (неверный пароль, чужой `serviceId`, опечатка в коде, код числом и `basic` строчными, неверная сумма, повтор `transId`, потерянный ответ `/confirm` и `/status` после него, повторы, возврат, замена неподтверждённой оплаты, неизвестный `transId`). Код берёт сам через сессию репетиции и `/api/gpt/subscribe`. `local` поднимает обработчики сайта на 127.0.0.1 над временной SQLite. Режим Checkout прежний (`--refund` теперь передаёт корзину по признаку заказа).
14. Документы: `UZUM-RU.md` переписан под итог (вопросы Uzum, чеки, оба режима, возвраты, алерты, SQL); `ALERTS-RU.md` — шаги `fiscal` и `uzum` в тике, коды Uzum.

**Проверки.**
1. `npx tsc -b` — 0; `npm run typecheck:functions` — 0; новые тесты и скрипт — разовой проверкой tsc без проектного конфига (ошибок в новом коде нет; одна старая в `gpt-live-readiness.test.ts:364`, WP-13).
2. Новые и изменённые тесты по одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`): `gpt-uzum-payments` 24/24 (было 17), `gpt-uzum-merchant` 12/12 (новый), `gpt-uzum-fiscal` 9/9 (новый), `gpt-uzum-rehearsal` 3/3 (новый), `gpt-paid-chat-schema` 4/4, `gpt-live-readiness` 9/9, `gpt-click-fiscal` 14/14.
3. Весь список `npm test` по одному файлу: 80 файлов, **996/998**; падают только два известных датозависимых теста `tests/lead-radar.test.ts`.
4. `node --import tsx scripts/uzum-sandbox-rehearsal.ts --api merchant --simulate local` — 22/22; `--dry-run` обоих режимов без сети.
5. `npx eslint` по 29 изменённым и новым TS-файлам — 0; `git diff --check` — чисто; `scan:secrets` — чисто (3 215 файлов); `test:secret-scan` 16/16; регэксп токена Telegram по диффу — 0.
6. `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений**; гейт бандла в норме (старт 104 967 Б br, `chat-account` 4 529 Б).

**Отклонения от плана.**
1. Чек Checkout без автофискализации — через Fiscalization API (карта называла это запасным путём, спека Checkout прямо к нему отсылает); признак `autofiscal` в заказе.
2. `operation_id` — колонка строки чека (`gpt_fiscal_receipts`), а не `gpt_uzum_orders.fiscal_operation_id`: у чека возврата свой ключ.
3. `gpt_payment_codes` хранит принятую оферту и `UNIQUE(org_id, user_id)`; код — 9 цифр вместе с контрольной.
4. Замена неподтверждённой оплаты в приложении и закрытие невиденного счёта другого провайдера; выключатель продаж для `/check` и `/create` (99999).
5. Крон довершает зависшее подтверждение (сверх U8).
6. `gpt-uzum-refund` читает заказ до проверки конфигурации (D1 после Bearer).
7. `UZUM_WEBHOOK_IPS` не сделан (Uzum IP не давал).
8. Сверх плана: исправлен `redirect: "error"` в `click-merchant.ts` (WP-14) — тот же дефект, без него чеки Click в проде не печатались бы.

**На релиз R4 (здесь не сделано).**
- `0068` применяется **до** кода (шапка файла), репетиция — по образцу `tests/gpt-paid-chat-schema.test.ts` (теперь с объектами Uzum). WP-16 и WP-17 ещё допишут в неё свои DDL.
- Приёмка после деплоя: `POST /api/payments/uzum` и `/api/payments/uzum-merchant/check` → 404; `GET /api/gpt/account` → `providers: []`, `uzumFlow: null`; тик обслуживания: `uzum: null`, `fiscal` без ошибок; `gpt_uzum_orders` и `gpt_payment_codes` — 0 строк.
- Новые V `UZUM_FISCAL_BASE_URL`, `UZUM_FISCAL_TEST_BASE_URL` уже в `wrangler.toml`. Секретов нет; `UZUM_CREDENTIALS_JSON` (с `fiscal.{test,live}.apiKey`) присылает владелец.
- Тёмная репетиция Uzum (WP-22): `uzum-sandbox-rehearsal.ts --api merchant --simulate https://gptbot.uz` с тестовыми кредами `merchant.test`.

**Открыто.**
1. Вопросы к Uzum — `UZUM-RU.md` §2 (тип договора, боевой адрес Checkout, автофискализация, ключи и `owner_type` Fiscalization API, повтор `/create`, поведение после 10 `/status`, тест-карты).
2. Тот же `redirect: 'error'` остался в `functions/platform/market/media.ts` (Bormi, вне WP-15) — предложена отдельная задача.
3. Экран кода и выбор Uzum в окне пакета — WP-17 (`uzumFlow`, `paymentCode`, поллинг статуса).

**Следующее.** WP-16 (вход через бота @gptbotuz_bot).

---

# Платный AI-чат к проду: ревью WP-14, 2026-10-01

**Итог.** Проверил коммиты WP-14 `5ac3a73a` (код, HANDOFF, STATE) и `0bf4d233` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md`: §1 (правила и проверки), §2 (L12, L16), строка R4 в §3, раздел WP-14 (файлы, настройки, миграция, тесты, приёмка, риски), §5, §6 и §8 п. 5. Ещё сверял с картой `02` §5.1 и `AGENTS.md` §2–8, §11. Работа началась после перезагрузки ПК владельца: дерево было чистым на `0bf4d233`, незаконченной работы не было. Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не менялись; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты.

**Сделано верно:**
- **Клиент Click.** Хост зашит (`https://api.click.uz`), `redirect: "error"`, таймаут 5 с, ответ не больше 16 КБ. Заголовок `Auth` совпадает с документацией. Ключ и подпись не попадают ни в логи, ни в `last_error`: там только грубые коды.
- **Очередь чеков.** Строка `PERFORM` вставляется в том же batch и под тем же условием журнала, что и переход в `paid`. Повторный Complete и повтор перехода новых строк не дают. Test-заказ сразу получает `skipped_test`. Аренда одной строки через `UPDATE … RETURNING`, и каждая запись проверяет свою аренду. Перед повтором — `ofd_data`; принятый Click чек повторно не отправляется. Напечатанным считается только `error_code=0` со ссылкой `https` на `ofd.soliq.uz` (без порта и логина). Бэкофф 1/5/15/60 мин, затем 6 ч. Алерт с 6-й неудачи или через сутки. Тесты «чужая org не видит» есть.
- **Возврат.** Bearer сверяется за постоянное время, нужны `confirmReversal` и текущая `version`. Уже `refunded` — no-op без вызова Click. При отказе Click учёт не меняется. При успехе — тот же `transition()`, что у `gpt-click-refund-record`. Чужая org получает 409.
- **Миграция 0068** только добавляет, порядок «до кода» и откат описаны в шапке. Паритет с bootstrap и репетиция «дважды через ledger» покрыты тестом.
- **Ссылки в панели** сужены на сервере и в клиенте. `safeTermsLink` работает как раньше.
- **Тексты.** «AI paket 300 (xizmat, 1 oy)» читается естественно, тест запрещает GPT, Plus, Pro, obuna и «подписка». Текст алерта на русском понятен.
- **Отклонения исполнителя обоснованы:** `submitted_at`, индекс очереди, `confirmReversal`, режим заказа при возврате, `skipped_refunded`, `config_missing` как неудача с алертом.

**Дефекты, исправлены:**
1. **Шаг `fiscal` в тике обслуживания не помещался в своё время.** Ему дали 1,5 с, и тот же 1,5 с был внутренним бюджетом `fiscalizeDue`. Но первая печать или повторная отправка — это три вызова Click (`status_by_mti`, `submit_items`, `ofd_data`) плюс записи в D1. Функции стоят на Smart Placement, рядом с D1, а Click в Ташкенте, поэтому каждый вызов идёт сотни миллисекунд. К тому же нижняя граница таймаута 0,5 с позволяет начатому чеку выйти за бюджет. Итог: любой медленный чек в очереди обрывал шаг по `step_timeout`. Тик отвечал 503 с `failed: ["fiscal"]` и `fiscal: null`, а работа продолжалась уже параллельно с `alerts`. Теперь `fiscal` стартует первым и идёт параллельно с `providers` и `watchdog`: у шага 8 с, новый чек не начинается после 5 с. Остальным шагам вернул бюджеты R1, которые WP-14 урезал: `watchdog` 2 с, `maintenance` 2,5 с, `retention` и `diagnostics` по 1 с. В сумме по-прежнему 19 с, `alerts` ждёт чеки, поэтому алерт уходит в том же тике. Новый тест с медленным фейковым Click (600 мс на вызов) на коде WP-14 падает (503, `failed: ["fiscal"]`), с исправлением проходит.
2. **Бесконечные алерты без инструкции.** После 6-й неудачи алерт приходит раз в 6 часов, пока строка ждёт, а как это остановить, нигде не написано. В `CLICK-FISCAL-RU.md` добавлен раздел «Если чек не пробивается»: запрос причины только на чтение, что чинить по коду, и ручное закрытие строки (`status_code=-2`, `last_error='manual'`) с согласия владельца, если чек пробили другим путём. В пункт про 502 возврата добавлено: сначала перечитать заказ, его мог вернуть параллельный вызов. Комментарий `fiscal-store.ts` называет причину `manual`.

**Проверки.**
1. `npx tsc -b` и `npm run typecheck:functions` — 0 до и после исправления; изменённые тесты проверены разовой сборкой tsc (0, временный tsconfig вне репозитория).
2. `gpt-click-fiscal` 14/14 (+1), `gpt-paid-chat-schema` 4/4.
3. Весь список `npm test` по одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`): 77 файлов, **965/967**. Падают только два известных датозависимых теста `lead-radar`. Среди прочих: `gpt-watchdog` 15/15, `gpt-operations` 7/7, `gpt-hash-salt` 11/11, `gpt-retention` 4/4 (все гоняют тик обслуживания), `gpt-billing` 17/17, `telegram-assistant` 76/76.
4. eslint по четырём изменённым TS-файлам — 0. `git diff --check`, регэксп токена Telegram по `58134e7d..HEAD` и по исправлению, `scan:secrets` (3207 файлов) и `test:secret-scan` 16/16 — чисто.
5. `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений**; гейт бандла в норме. `src/` и `content/` не менялись.

**Открыто, R4 не блокирует:**
1. `receiptPrinted` в ответе возврата читается до вызова Click. Чек, который очередь допечатала за эти секунды, покажется как `false`. Для бухгалтера сверка — по `gpt_fiscal_receipts`.
2. `status_by_mti` ищет платёж по ташкентским датам Complete и Prepare. Платёж, созданный в Click за секунды до полуночи, с Prepare уже после полуночи, не найдётся: будут повторы и алерт, закрывается вручную. Вероятность ничтожная.
3. Из WP-14: хосты чеков Uzum (`allowedUzumReceipt` принимает любой поддомен `soliq.uz`) — сверить в WP-15.

**Следующее.** WP-15 (Uzum, пакет C).

---

# Платный AI-чат: WP-14 — фискальные чеки Click, 2026-10-01

**Итог.** Сделан WP-14 плана `10-PROD-PLAN.md` (релиз R4, D3) на ветке `paid-chat/prod-readiness` поверх `58134e7d`, коммит `5ac3a73a` (`5ac3a73a8b68d59c4388b6cc7f15da8cdfdf2280`; следующий коммит только записывает этот SHA в STATE, правило D-006). Создана миграция `migrations/0068_gpt_paid_chat.sql` — общий файл R4: WP-15…WP-17 дописывают в него свои DDL, интеграция R4 его закрывает. Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не трогались, `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты. Защищённые страницы 10/10 без изменений.

**Возобновление.** ПК владельца перезагрузился. Дерево было чистым на `58134e7d` (WP-13 после ревью), незаконченной работы WP-14 не было, резервных копий `wp14-*` нет. WP-14 начат с нуля.

**Источник протокола.** docs.click.uz, Merchant API: разделы «Подключение и выполнение запросов», «Фискализация товаров и услуг», «Ошибки». Сайт собран на Docusaurus, тексты взяты из его JS-чанков 01.10. Всё совпало с картой `02` §5.1: заголовок `Auth: merchant_user_id:sha1(timestamp+secret_key):timestamp`, `POST …/ofd_data/submit_items`, `GET …/ofd_data/:service_id/:payment_id` → `{paymentId, qrCodeURL}`, `GET …/status_by_mti/:service_id/:merchant_trans_id/YYYY-MM-DD` → `payment_id`, `DELETE …/reversal/:service_id/:payment_id`. Коды ошибок ofd в документации не перечислены, ошибки API — обычные HTTP-статусы.

**Что сделано.**
1. Новый `functions/lib/gpt-chat/click-merchant.ts` — чистый клиент без D1 и логов. Хост зашит: `https://api.click.uz`. Подпись SHA-1 через WebCrypto, таймаут 5 с, ответ не больше 16 КБ, `redirect: "error"`. Строка чека — `clickReceiptItem()`: `Name="AI paket 300 (xizmat, 1 oy)"`, `SPIC`, `PackageCode`, `Price=2000000`, `Amount=1`, `VAT=round(price·vat/(100+vat))` = 214 286 при 12 %, `VATPercent`, `CommissionInfo.TIN` (или `PINFL` при 14 цифрах). Тело: `received_card=2000000`, наличные и e-cash по нулям. `payment_id` берётся у Click по нашему `pay_…` (`status_by_mti`) на ташкентскую дату Complete, затем Prepare, если она другая.
2. Новый `functions/lib/gpt-chat/fiscal-store.ts` — очередь на `gpt_fiscal_receipts`:
   - статусы: `-1` ждёт, `0` напечатан, `-2` пропущен (`skipped_test`, `skipped_refunded`, `order_missing`);
   - аренда по одной строке: `UPDATE … WHERE lease_until<=? RETURNING`, 60 с. Каждая запись проверяет свою аренду (`lease_until` служит токеном);
   - повтор сначала спрашивает `ofd_data`. Принятый Click чек (`submitted_at`) повторно не отправляется: только ждём ссылку;
   - успех — `error_code=0` и `qrCodeURL` на `https://ofd.soliq.uz`;
   - бэкофф 1 → 5 → 15 → 60 мин → 6 ч. С 6-й неудачи или через 24 ч после оплаты каждая неудача пишет срочный `click_fiscal_failed`;
   - печатаются только live-заказы; `last_error` хранит грубый код (`payment_id:http_500`, `submit:click_-5`, `qr_pending`, `qr_host`, `config_missing`).
3. `billing-store.ts`: в batch перехода в `paid` для Click добавлен `INSERT … ON CONFLICT(org_id,order_id,kind) DO NOTHING`. Live-заказ получает `-1`, test — сразу `-2 skipped_test`.
4. `payments/click.ts`: после Complete — `waitUntil(fiscalizeDue(env))` (до 20 с, чек обычно печатается сразу).
5. Тик обслуживания: шаг `fiscal` (не больше 5 чеков) перед `alerts`, поэтому алерт уходит в том же тике. В ответе тика — `fiscal {printed, retried, skipped, queued, failing}`.
6. Новый `functions/api/internal/gpt-click-reversal.ts` (Bearer `GPT_BILLING_MAINTENANCE_SECRET`), тело `{orderId, version, confirmReversal:true}`:
   - чужая версия → 409 `version_changed`, не `paid` → 409;
   - уже `refunded` → 200 без вызова Click: повтор ничего не делает;
   - `error_code=0` → `paid → refunded` той же `transition()`, что и `gpt-click-refund-record.ts`, `reason=5`;
   - отказ Click → 502 с кодом, учёт не меняется;
   - в ответе `receiptPrinted`: был ли пробит чек продажи.
7. Ссылки на чеки. Сервер (`account.ts`, `receiptLink()` в `fiscal-config.ts`) и клиент (`safeAccountLink` в `src/gpt-chat/types.ts`) пропускают только `https://ofd.soliq.uz` и хосты Uzum. `safeTermsLink` стал отдельной функцией (только `https://gptbot.uz`).
8. `0068_gpt_paid_chat.sql`: 7 колонок `gpt_fiscal_receipts` (`provider`, `attempts`, `next_at`, `lease_until`, `payment_id`, `last_error`, `submitted_at`) и индекс `idx_gpt_fiscal_due`. Тот же DDL — в bootstrap (`FISCAL_RECEIPT_COLUMNS`, `PAID_CHAT_DDL`, общий `addMissingColumns`), паритет проверяется тестом.
9. Текст алерта `click_fiscal_failed` (`alert-policy.ts`). Документация: новый `docs/paid-chat/CLICK-FISCAL-RU.md` (поля чека, очередь, проверка S2, возврат, вопросы к Click), строка в `ALERTS-RU.md`. `package.json`: два новых теста в `npm test`.

**Проверки.**
1. `npx tsc -b` — 0; `npm run typecheck:functions` — 0; новые тесты проверены разовой сборкой tsc (0 ошибок, временный tsconfig удалён).
2. Новые тесты: `gpt-click-fiscal` 13/13 (фейковый Click Merchant API `tests/helpers/click-merchant-fake.ts` проверяет подпись каждого запроса), `gpt-paid-chat-schema` 4/4 (паритет 0068 с bootstrap, репетиция «дважды через ledger», порядок «миграция до кода»). Мутационные проверки: без условия аренды, без GET перед повтором, с повторной отправкой принятого чека и без проверки хоста ссылки тесты падают.
3. Весь список `npm test` по одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`): 77 файлов, **964/966**; падают только два известных датозависимых теста `tests/lead-radar.test.ts` («manual approval is fail-closed…», «store enforces tenant isolation…»), код Lead Radar не менялся. Среди них `gpt-billing` 17/17, `gpt-live-readiness` 9/9, `gpt-uzum-payments` 17/17, `gpt-watchdog` 15/15, `gpt-account-ui` 14/14, `gpt-chat-runtime-schema` 5/5.
4. `npx eslint` по 16 изменённым и новым TS-файлам — 0; `git diff --check` — чисто; `scan:secrets` — чисто; `test:secret-scan` 16/16; регэксп токена Telegram по диффу и новым файлам — 0.
5. `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений**; гейт бандла в норме (старт 104 967 Б br, +24 Б; `chat-account` 4 529 Б). `content/` не менялся.

**Отклонения от плана.**
1. Колонка `submitted_at` сверх списка плана. Без неё повтор после «чек принят, ссылки ещё нет» отправил бы позицию второй раз.
2. Индекс `idx_gpt_fiscal_due` для выборки очереди (аддитивно).
3. Бюджеты тика: `fiscal` 1,5 с. Чтобы сумма осталась 19 с при таймауте Worker'а 20 с, урезаны `watchdog` 2 → 1,5 с, `maintenance` 2,5 → 2 с, `retention` и `diagnostics` 1 → 0,75 с. Основной путь печати — сразу после Complete, тик только повторяет.
4. Строка test-заказа помечается `skipped_test` сразу при оплате, а не в очереди. Чек заказа, который вернули до печати, получает `skipped_refunded`: продажи уже нет.
5. Возврат требует ещё и `confirmReversal:true` (как у Uzum). Креды берутся по режиму заказа, а не по текущему режиму Click: деньги можно вернуть и после выключения продаж.
6. Повторы без потолка: после 6 ч — раз в 6 ч, и каждая неудача пишет алерт (не чаще раза в час), пока человек не починит. Продажа без чека — это то, о чём надо напоминать.
7. Нехватка `merchant_user_id` или `GPT_FISCAL_*` у оплаченного заказа — не пропуск, а неудача `config_missing` с повторами и алертом. Выключение продаж Click печать не останавливает.

**На релиз R4 (здесь не сделано).**
- `0068` применяется **до** кода (шапка файла). Её дописывают WP-15…WP-17. Репетиция — по образцу `tests/gpt-paid-chat-schema.test.ts`. В проде `gpt_fiscal_receipts` пуста.
- Приёмка после деплоя: тик обслуживания отдаёт `fiscal = {printed:0, retried:0, skipped:0, queued:0, failing:0}`, `failed` без `fiscal`; `POST /api/internal/gpt-click-reversal` без Bearer → 403; в `gpt_fiscal_receipts` +0 строк. Новых настроек нет: `GPT_FISCAL_*` заданы в WP-13, `merchant_user_id` придёт в секрете владельца `GPT_CLICK_CREDENTIALS_JSON`. Worker не менялся.
- Живая проверка — только в S2 (покупка владельца): SQL и сверка чека по `CLICK-FISCAL-RU.md`; вопросы к Click из §8 п. 5 (`payment_id`, `Amount`, `received_*`, `CommissionInfo`, чек возврата, тестовый сервис).

**Открыто.** Хосты чеков Uzum: `allowedUzumReceipt` (WP-15) по-прежнему принимает любой поддомен `soliq.uz`, а панель показывает только `ofd.soliq.uz` и хосты Uzum. Сверить при ревью Uzum.

**Следующее.** WP-15 (Uzum, пакет C).

---

# Платный AI-чат к проду: ревью WP-13, 2026-10-01

**Итог.** Проверил коммиты WP-13 `42b90756` (код, HANDOFF, STATE) и `e5944e76` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md` (§1: правила и проверки; §2: L7, L9, L16, L17, L18; §3, строка R4; §4, WP-13: файлы, настройки, тесты, приёмка; §5 и §6), картой `02` (Б1, U7) и `AGENTS.md` §2–8, §11. Работа началась после перезагрузки ПК владельца: дерево было чистым на `e5944e76`, незаконченной работы не было. Ничего не запушено и не задеплоено. Cloudflare, удалённая D1, GSC, боты и вебхуки не менялись; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты.

**Сделано верно:**
- **Готовность к live.** `liveReadiness()` отдаёт только имена, в устойчивом порядке, без повторов. Тест с секретами-маркерами проверяет каждое имя по отдельности и то, что значения не утекают ни в вывод, ни в диагностику тика. `providerReady()` = режим + креды режима + (test или пустой `liveReadiness()`). Колбэки смотрят только на режим и креды, поэтому `GPT_BILLING_LIVE_READY=false` останавливает новые продажи, а начатые оплаты доходят.
- **Режимы и allowlist (L7, L17).** Режим на провайдера поверх `GPT_BILLING_MODE`; `off` и опечатка значат «выключено», без отката к общему режиму. Payme работает только из списка и только в test. Выключенные Click и Payme отвечают 404 до чтения тела и D1: тест подаёт тело потоком и проверяет, что его не читали. Uzum и закоммиченная конфигурация в целом — 404 без обращения к D1.
- **Креды Click (L9).** Один секрет `{test, live}`; старые `GPT_CLICK_*` читаются, только пока секрета нет; сломанный секрет означает «кредов нет».
- **Б1 и U7.** Пакет стартует в момент оплаты, guard `MAX(ends_at)` и `nextAccess()` убраны, ход берёт пакет, который кончается раньше. Открытый счёт у другого провайдера даёт 409 `pending_elsewhere`; проверка повторена внутри `INSERT … WHERE NOT EXISTS`, тест гонки двух вкладок это доказывает. `plan='ai_paket'`.
- **Тёмный тест.** Cookie `__Host-gpt_rehearsal` — HMAC-SHA256 с разделением домена, проверка в постоянном времени (WebCrypto), 2 ч, без D1, только пока какой-то провайдер в test. Эндпоинт сначала проверяет Bearer, потом наличие test-провайдера. Синтетический `acct_rh_…` не покупает live ни в хранилище, ни в роуте. Ответы `no-store`, поэтому вид репетиции не попадёт в кеш.
- **Гость и чат (L18).** Гостевой `/api/gpt/account` в D1 не ходит; путь анонимного JSON при любом режиме тот же (тест с Railway и без).
- **Законы AGENTS.** Новый SQL (`gpt_payment_orders_all`, защищённый INSERT) берёт `org_id` первым; тесты «чужая org не видит» есть. Новых логов и PII нет. Миграций и DDL нет, паритет bootstrap и конфигурации зелёный, JSON 3 724 из 5 120 байт.
- **Тексты.** RU и UZ естественные; «Plus», «Pro», «obuna», «подписка» не появились; бренд «GPTBot.uz». Причины 429 пакета (`pack_daily`, `busy`, `monthly`) уже были с WP-05, `turn-store.ts` трогать не требовалось.
- **Отклонения исполнителя обоснованы:** типы в `BillingEnv`/`FiscalEnv`, Payme только test, фискальные значения сразу (решение владельца), `GPT_BILLING_TERMS_APPROVED_AT`, репетиция как отдельный test-контекст, раздел `payments` в диагностике.

**Дефекты, исправлены:**
1. **«Продлите пакет» сразу после продления.** Пакеты теперь идут параллельно, а кнопки оплаты видны и при активном пакете. Панель брала `renewSoon` у пакета, из которого списывается первым. Кто продлил заранее, видел «Период скоро закончится. Новый пакет начнёт действовать сразу после оплаты» и мог купить третий пакет. Старую строку «Следующий период уже оплачен» WP-13 убрал без замены. Теперь `BillingStore.paidThrough()` берёт самый поздний конец среди пакетов, из которых ход ещё может списать (условие общее с `access()`, `USABLE_PACK`), и `renewSoon` считается по нему. Отозванный или пустой поздний пакет не в счёт. Новый тест в `gpt-billing`; без исправления он падает (мутационная проверка).
2. **Комментарий `fiscal-config.ts`** называл значением `GPT_FISCAL_PACKAGE_CODE` название «услуга (раз)», а проверка пропускает только латиницу и цифры. Комментарий исправлен: нужен код (1514296), а не название.

**Открытые вопросы, R4 не блокируют:**
1. **Панель при двух пакетах (WP-17).** `access.ends_at` («Оплачен до») и `remaining` по-прежнему описывают пакет, из которого списывается первым. `PackPanel` в WP-17 должен показать оба пакета или итог.
2. **409 `pending_elsewhere` в окне (WP-17).** Сейчас это общая ошибка. Ответ несёт `attemptId` и `provider`: окну нужен блок «продолжить ту оплату». Без него открытый, но брошенный счёт держит другого провайдера до 12 ч (`PAYMENT_TTL_MS`). Закрывать ли автоматически счёт, который провайдер ещё не видел (pending без `external_id`), — решение ведущего.
3. **Uzum без автофискализации.** Фикстура Uzum теперь всегда с автофискализацией, поэтому тесты не проходят путь без корзины. Сайт этот путь не использует (live требует автофискализацию, test не регистрирует заказ), остаётся только тестовый возврат. Вернуть случай в тесты в WP-15.
4. Гонка `monthly` на первом пакете отправляет этот ход в бесплатные, а не во второй пакет; следующий ход уже берёт второй. Край, не дефект.
5. Остаются вопросы исполнителя: синтетические `acct_rh_*` в `gpt_accounts` (чистка в WP-22). В `docs/paid-chat/UZUM-RU.md` панель называется «Мой тариф», в интерфейсе — «Мой пакет» (было и до WP-13).

**Проверки ревью.**
- `tsc -b` — 0; `typecheck:functions` — 0 (до и после исправления). ESLint трёх изменённых файлов — 0. `git diff --check` и регэксп токена Telegram по `cf76bded..HEAD` и по исправлению — чисто. `scan:secrets` — чисто (3 199 файлов), `test:secret-scan` 16/16.
- Тесты по одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`) на коде WP-13: `gpt-billing` 16/16, `gpt-live-readiness` 9/9, `gpt-rehearsal` 5/5, `gpt-uzum-payments` 17/17 и ещё 18 файлов (`gpt-operations`, `gpt-readiness`, `gpt-routing`, `gpt-chat-budget`, `gpt-chat-limits`, `gpt-chat-truncation`, `gpt-model-policy`, `gpt-zai-provider`, `gpt-watchdog`, `runtime-config`, `pages-config-parity`, `gpt-account-ui`, `gpt-account-storage`, `gpt-chat-honesty`, `gpt-limit-state`, `gpt-hash-salt`, `telegram-assistant` 76/76, `gpt-chat`) — всё зелёное. После исправления: `gpt-billing` 17/17 (+1) и 8 соседних файлов зелёные.
- `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений** (база `2026-10-01-paid-chat-honesty`); гейт бандла в норме (`chat-account` 4 528 Б br, −49 Б к базе).
- Весь список `npm test` по одному файлу после исправления: 75 файлов, **947/949**; падают только два известных датозависимых теста `tests/lead-radar.test.ts` («manual approval is fail-closed…», «store enforces tenant isolation…»), код Lead Radar не менялся.

**К релизу R4** — без изменений, см. раздел WP-13 ниже: приёмка `providers: []`, 404 на `/api/payments/click` и `/payme`, +0 строк в `gpt_payment_orders`; `GPT_IDENTITY_SECRET` от агента; `GPT_CLICK_CREDENTIALS_JSON` от владельца; `GPT_BILLING_TERMS_*` в WP-18; дата одобрения юриста от владельца.

**Дальше.** WP-14 (фискальные чеки Click).

---

# Платный AI-чат: WP-13 — ядро биллинга, готовность к live, тёмный тест, 2026-10-01

**Итог.** Сделан WP-13 плана `10-PROD-PLAN.md` (релиз R4; решения L7, L9, L16, L17; D1, D2) на ветке `paid-chat/prod-readiness` поверх `cf76bded`, коммит `42b90756` (`42b90756e3636e092ef1540db88ea2f78cba9cef`; следующий коммит только записывает этот SHA в STATE, правило D-006). Миграций нет. Ничего не запушено и не задеплоено; Cloudflare, GSC, боты, вебхуки и удалённая D1 не трогались. Защищённые страницы 10/10 без изменений.

**Возобновление.** ПК владельца перезагрузился посреди прошлой попытки WP-13: в дереве было 34 изменённых и 5 новых файлов. Сначала сделана копия `F:/Claude/gptbot-tools/backups/wp13-partial-20261001-143937/` (`tracked.patch`, `untracked.tar`, `untracked.txt`), потом правки просмотрены целиком, проверены тестами и доведены. Ничего не выброшено.

**Что сделано.**
1. `functions/lib/gpt-chat/billing-config.ts`:
   - `GPT_PAYMENT_PROVIDERS` (по умолчанию `click,uzum`). Payme работает, только если указан в списке (L17), и только в test: live требует `detail` чека, которого код не шлёт, поэтому `liveReadiness()` всегда называет `payme_receipt_detail`;
   - режим на провайдера `GPT_BILLING_MODE_CLICK` / `GPT_BILLING_MODE_UZUM` (`test`, `live`, `off`) поверх `GPT_BILLING_MODE`; опечатка значит «выключено» (L7);
   - `liveReadiness(env, provider)` возвращает **только имена**: allowlist, режим, `GPT_BILLING_LIVE_READY`, `GPT_BILLING_TERMS_RU/UZ/VERSION`, `GPT_BILLING_TERMS_APPROVED_AT` (наступившая дата одобрения юристом), креды live (Click — по полям секрета; Uzum Checkout — креды, `UZUM_CHECKOUT_BASE_URL`, `UZUM_AUTOFISCAL`; Uzum Merchant — креды и `fiscal.live.apiKey`), `GPT_FISCAL_*` (`GPT_FISCAL_TIN` — только для Click), D1, канал алертов, `GPT_HASH_SALT` и наступивший `GPT_HASH_SALT_SINCE`, `GPT_IDENTITY_SECRET`, `GPT_BILLING_MAINTENANCE_SECRET`, способ входа;
   - `providerReady()` = режим + креды режима + (test или пустой `liveReadiness()`). Колбэки смотрят только на режим и креды, поэтому `GPT_BILLING_LIVE_READY=false` останавливает новые продажи, а начатые оплаты доходят;
   - Click (L9): `GPT_CLICK_CREDENTIALS_JSON` = `{"test"|"live": {service_id, merchant_id, secret_key, merchant_user_id}}`. Старые `GPT_CLICK_*` читаются, только пока секрета нет; сломанный секрет означает «кредов нет», а не фолбэк;
   - `PLAN_ID = "ai_paket"` (L16).
2. Новый `functions/lib/gpt-chat/fiscal-config.ts`: общие для Click и Uzum `GPT_FISCAL_IKPU`, `GPT_FISCAL_PACKAGE_CODE`, `GPT_FISCAL_VAT_PERCENT`, `GPT_FISCAL_TIN` (`UZUM_FISCAL_*` удалены). `includedVat()` считает НДС **внутри** цены: 2 000 000 тийин при 12 % — это 214 286 тийин (2 142,86 сум). Корзина Uzum передаёт `vatPercent: 12`, сумму НДС Uzum считает сам; окно пакета получает `pack.vat`. Чек Click (сумма НДС) — WP-14.
3. `functions/lib/gpt-chat/billing-store.ts`:
   - Б1: оплаченный пакет стартует в момент оплаты, `ends_at = addCalendarMonth(now)`; guard `MAX(ends_at)` и `nextAccess()` удалены. `access()` берёт пакет с остатком, который кончается раньше; пустой или истёкший пакет бесплатные не блокирует;
   - U7: открытый счёт у другого провайдера → `PendingElsewhereError`, `subscribe` отвечает 409 `pending_elsewhere` с `attemptId` и `provider`. Проверка повторена внутри `INSERT … WHERE NOT EXISTS`, поэтому две вкладки с разными провайдерами не получат два счёта;
   - `plan='ai_paket'` в `gpt_subscriptions`; синтетический `acct_rh_*` live-заказ не получает.
4. Роуты оплаты: `payments/click.ts` и `payments/payme.ts` (POST и GET) отвечают 404 до чтения тела и D1, если провайдер выключен, не в allowlist или без кредов своего режима. Гонка двух Prepare Click на один заказ даёт −4 без алерта.
5. `functions/api/gpt/account.ts`: `providers` — live-провайдеры всем, test — только в сессии репетиции; `pack{priceUzs, messageLimit, dailyLimit, months, vat}`, `loginMethods`, `terms`; заказы, пакеты и чеки — из контекста зрителя. Гость по-прежнему не ходит в D1 (L18).
6. `functions/api/gpt/subscribe.ts`: оплатить можно только провайдера, предложенного этому зрителю, иначе 404. `returnUrl` с `?pay=return`; ссылка Click строится из кредов; live-ссылку выдаёт только Click (у Uzum своя ветка).
7. `functions/api/gpt/chat.ts`: пока работает хоть один провайдер, гость в JSON остаётся на локальной квоте (тест: без Railway путь один при любом режиме). Ход берёт live-пакет, в репетиции — test-пакет.
8. Тёмный тест (L7), новые `functions/lib/gpt-chat/rehearsal.ts` и `functions/api/internal/gpt-rehearsal-session.ts`:
   - cookie `__Host-gpt_rehearsal` = `v1.<срок>.<nonce>.<HMAC-SHA256(GPT_IDENTITY_SECRET)>`, живёт 2 ч, D1 не читает, действует, только пока какой-то провайдер в `test`;
   - `POST /api/internal/gpt-rehearsal-session` (Bearer `GPT_BILLING_MAINTENANCE_SECRET`) выдаёт cookie; без test-провайдера — 404. С телом `{"account": true}` ещё и входит синтетическим аккаунтом `acct_rh_…` на те же 2 ч.
9. Тик обслуживания: в диагностике появился раздел `payments.{click,uzum,payme} = {mode, missing}`, только имена.
10. Настройки (JSON и таблица `wrangler.toml`, `RUNTIME_CONFIG_KEYS`): `GPT_PAYMENT_PROVIDERS="click,uzum"`; `GPT_BILLING_MODE`, `_CLICK`, `_UZUM` пустые; `GPT_BILLING_LIVE_READY="false"`; `GPT_BILLING_TERMS_RU/UZ/VERSION/APPROVED_AT` пустые; `GPT_FISCAL_IKPU="10305008002000000"`, `GPT_FISCAL_PACKAGE_CODE="1514296"`, `GPT_FISCAL_VAT_PERCENT="12"`, `GPT_FISCAL_TIN="310618348"` (решение владельца 01.10). JSON — 3 724 из 5 120 байт.
11. Тексты RU/UZ: строка «Следующий период уже оплачен» убрана; `renew` и `monthlyLimit` говорят, что новый пакет начинает действовать сразу после оплаты. `docs/paid-chat/UZUM-RU.md`: данные чека, тёмный тест, `liveReadiness()`.

**Исправлено поверх прерванной попытки.**
- U7 стал атомарным: проверка повторена в самом INSERT, добавлен тест гонки. Мутационная проверка: без условия тест падает.
- Тест U7 считал заказ чужой org (3 вместо 2): добавлен фильтр `org_id`.
- Ответ 409 `pending_elsewhere` проверен на уровне `/api/gpt/subscribe`.
- `monthlyLimit` RU/UZ обещал «следующий пакет с начала нового периода»: после Б1 это неправда, текст переписан.
- Раздел `payments` в диагностике тика (для runbook и приёмки R4).
- В тесте 11 Uzum возвращены `\n` вместо многострочного литерала (лишний шум в диффе).

**Проверки.**
1. `npx tsc -b` — 0; `npm run typecheck:functions` — 0.
2. Тесты по одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`): `gpt-billing` 16/16, `gpt-live-readiness` 9/9 (новый), `gpt-rehearsal` 5/5 (новый), `gpt-uzum-payments` 17/17, `gpt-operations` 7/7, `gpt-readiness` 9/9, `gpt-routing` 6/6, `gpt-chat-budget` 10/10, `gpt-chat-limits` 13/13, `gpt-chat-truncation` 8/8, `gpt-model-policy` 14/14, `gpt-zai-provider` 18/18, `gpt-watchdog` 15/15, `runtime-config` 4/4, `pages-config-parity` 7/7. Весь список `npm test` по одному файлу: 75 файлов, **946/948**; падают только два известных теста `tests/lead-radar.test.ts` («manual approval is fail-closed…», «store enforces tenant isolation…»), код Lead Radar не менялся.
3. `npx eslint` по 39 изменённым TS-файлам — 0; `git diff --check` — чисто; `npm run scan:secrets` — чисто; `test:secret-scan` 16/16; регулярка токена Telegram по диффу и новым файлам — 0.
4. `npm run build:fast` — 0; `seo-protection check` — **10/10 без изменений** (база `2026-10-01-paid-chat-honesty`); гейт бандла в норме (старт 104 921 Б br, −22 Б). `content/` не менялся, миграций нет.

**Отклонения от плана.**
1. Ключи настроек типизированы в `BillingEnv` / `FiscalEnv` / `UzumEnv`, как и прежние `GPT_BILLING_*`, а не в `functions/_types.ts`.
2. Payme остаётся только тестовым: для live нужен `detail` чека в `CheckPerformTransaction`, а код его не шлёт. Payme и так выключен (L17).
3. Фискальные значения закоммичены сразу, а не пустыми до бухгалтера (§6): их назвал владелец 01.10 (ИКПУ проверен на tasnif.soliq.uz, упаковка 1514296 «услуга (раз)», НДС 12 % в цене, ИНН 310618348). Сами по себе live они не открывают.
4. В `liveReadiness()` добавлен `GPT_BILLING_TERMS_APPROVED_AT`: юрист оферту ещё не одобрил, live без явной даты одобрения закрыт.
5. Сессия репетиции — только тестовый контекст: в ней видны test-провайдеры, test-заказы и test-пакеты, а live — только вне её. Так тест не смешивается с боем.
6. Раздел `payments` в диагностике тика — сверх текста плана.

**На релиз R4 (здесь не сделано).**
- R4 выкатывает WP-13…WP-18 вместе. У WP-13 своей миграции нет (0068 — у WP-14…WP-17).
- Приёмка после деплоя: `GET /api/gpt/account` → `providers: []`, `mode: null`; `POST /api/payments/click` и `/api/payments/payme` → 404; в `gpt_payment_orders` +0 строк; тик обслуживания показывает `payments.click.missing`, первым идёт `GPT_BILLING_MODE_CLICK`.
- `GPT_IDENTITY_SECRET` (агент, R4) нужен и входу, и cookie репетиции. `GPT_CLICK_CREDENTIALS_JSON` присылает владелец (шаги S).
- `GPT_BILLING_TERMS_RU/UZ/VERSION` — WP-18; `GPT_BILLING_TERMS_APPROVED_AT` — дата от владельца после юриста.
- Синтетические `acct_rh_*` остаются в `gpt_accounts` после своей 2-часовой сессии; чистку можно добавить в WP-22.

**Следующее.** WP-14 (фискальные чеки Click).

---

# Платный AI-чат: R2+R3 в проде, 2026-10-01

**Итог.** Прод = `0ca0a699` (R2+R3: соль с `SINCE` 2026-10-02T00:00:00Z, починенный бот, честный интерфейс, ленивые части чата, страницы без «Plus» и личного Telegram, ревизия защищённых `2026-10-01-paid-chat-honesty`). Квитанции: `docs/paid-chat/releases/R2R3-live-verification.json`, `R2R3-migration-rehearsal.json`, IndexNow `reports/indexnow-receipts/2026-10-01T08-48-35-069Z_paid-chat-r2r3.json`. База бандла перезаписана из выпущенной сборки.

**Находка выката.** На зоне включена Cloudflare Email Address Obfuscation: e-mail в HTML заменяется на `/cdn-cgi/l/email-protection` и «[email protected]», подключается `email-decode.min.js`. Живая сверка защищённых страниц «как есть» даёт 0/10, после обратного преобразования — 10/10. Решение: настройку зоны не трогаем (защита от спама — выбор владельца). Если нужно, чтобы AI-краулеры без JS видели адрес, — обернуть адрес в `<!--email_off-->…<!--/email_off-->` в шаблоне (гейт это не меняет) или выключить обфускацию в Cloudflare.

**После `SINCE`.** Тики крона ведут перекей до `done` (не раньше `SINCE` + 10 мин); через 2 ч — агрегаты `docs/paid-chat/SALT-RU.md` шаг 7, 429 на 6-м сообщении, непрерывность истории. Откат — только вперёд.

**Следующее.** R4 (WP-13…WP-18).

---

# Платный AI-чат: выкат R2+R3, деплой 1 и включение соли, 2026-10-01

**Итог.** R2+R3 (WP-07…WP-12, вершина `26b058e5`) выкатываются одним релизом в два деплоя Pages, по чек-листу сверки R2+R3 (ниже).
1. Экспорт D1 до 0067: `F:/Claude/gptbot-production-backups/paid-chat-R2R3-2026-10-01T08-39-51Z/before-0067.sql`, 35 470 223 байта, sha256 `7c29d25cd5c176fd73e51ded4adb279d9120621d7a815e09f21636012778b252` (вне Git).
2. Репетиция 0067 на копии экспорта: pending = только 0067; второе применение пусто; `quick_check` ok; `plans`: free=1, day_pass=0, plus=0.
3. `migrations list --remote` = ровно 0067 → `apply` → сверка: последняя 0067, ledger 68, `plans` free=1, day_pass/plus/pro/team=0.
4. `build:production` → seo-protection 10/10 (новая база `2026-10-01-paid-chat-honesty`), бюджет бандла в норме, seo-audit 0 critical, `tsc -b` 0, `deploy_runner.py check` pass → `deploy`. Guard сообщил об отставании CDN; через 20 с манифест = `26b058e5`, повторно не деплоили.
5. Тик обслуживания: `rekey.status = off`, сбоев нет.
6. Бот: проба `gpt-model-probe?target=javob` — 4/4 ok (текст и голос, UZ и RU, nemotron, 0,9–1,4 с). `javob-setup` → `{"apply":true}` → `matches: true` (`/plans` — «лимит / limit»).
7. `GPT_HASH_SALT` (32 байта, только в `C:/Users/Borinio/.config/gptbot-private/gpt-hash-salt.txt`) задан секретом Pages.

**Этот коммит.** `GPT_HASH_SALT_SINCE = 2026-10-02T00:00:00Z` в `wrangler.toml` (JSON и таблица). Тесты: runtime-config 4/4, pages-config-parity 7/7, gpt-hash-salt 11/11.

**Дальше.** Деплой 2 этого коммита, тик → `rekey waiting`; после `SINCE` перекей кроном до `done`; через 2 ч — агрегаты из `docs/paid-chat/SALT-RU.md` шаг 7; маркеры живых страниц, защищённые 10/10 вживую, sitemaps и IndexNow; квитанция `docs/paid-chat/releases/R2R3-live-verification.json`. Откат после `SINCE` — только вперёд.

---

# Платный AI-чат к проду: сквозная проверка R2+R3 одним релизом (WP-07…WP-12), 2026-10-01

**Итог.** Ветка `paid-chat/prod-readiness` проверена целиком на вершине `23e2c92c` (WP-07…WP-12 с ревью поверх живого R1 `77720e11`). Сверял с планом `10-PROD-PLAN.md`: §1 (проверки и «Релиз»), §3 (строки R2 и R3), §4 (WP-07…WP-12), §5 и §6, а также с `SALT-RU.md` и `BOT-RU.md`. Ведущий решил выкатить R2 и R3 одним релизом, поэтому ниже один чек-лист. Работа началась после закрытия приложения: дерево было чистым на `23e2c92c`, незаконченной проверки не было. Поломок не нашлось, код не менялся. Ничего не запушено и не задеплоено. Cloudflare, GSC, боты и вебхуки не менялись, удалённая D1 не читалась. Из сети читались только публичные страницы (`gptbot-release.json` и 10 защищённых URL) и список sitemap в GSC.

**Результаты.**
1. `npx tsc -b` — 0; `npm run typecheck:functions` — 0.
2. Тесты по одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`):
   - 26 файлов, которые тронули WP-07…WP-12, плюс контрольные (`gpt-uzum-payments`, `gpt-readiness`, `gpt-operations`, `gpt-routing`, `gpt-chat-stream`, `gpt-limit-state`, `runtime-config`, `pages-config-parity`, `seo-content-guards`, `secret-scan`, `functions-type-safety`): 37 файлов, **613/613**. Среди них `telegram-assistant` 76, `yandex-metrika` 69, `gpt-chat-bridge` 42, `telegram-web-handoff` 22, `studio-contact` 18, `gpt-billing` 15, `gpt-watchdog` 15, `gpt-hash-salt` 11, `gpt-chat-honesty` 11, `seo-protection` 6;
   - весь список `npm test`: 73 файла, **931/933**. Падают только два известных теста `tests/lead-radar.test.ts`: «manual approval is fail-closed…» и «store enforces tenant isolation…». На снимке `origin/main` (прод) они падают так же; код Lead Radar в R2/R3 не менялся.
3. Сборка и SEO:
   - `npm run build:fast` — 0;
   - `seo-protection check` — **10/10 на новой базе** `2026-10-01-paid-chat-honesty`;
   - против прежней базы `2026-09-30-gsc-driven` изменились **все десять** защищённых страниц и только поле `bodyTextSha256`: `/`, `/uz/gpt-uzbek-tilida/`, `/ru/gpt-chat/`, `/ru/blog/chatgpt-i-claude-v-uzbekistane/`, `/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/`, `/uz/blog/chatgptga-qanday-kirish-mumkin/`, `/uz/blog/chatgpt-uzbek-tilida-promptlar/`, `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/`, `/uz/blog/ai-chat-nima-va-qanday-turlari-bor/`, `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/`. Title, H1, description, robots, googlebot, canonical, hreflang и внутренние ссылки те же;
   - живой прод (манифест `eccfac28`) совпадает с прежней базой 10/10 (только чтение), то есть выкат меняет ровно это;
   - `npx tsx scripts/seo-audit.ts` — 121 страница, 0 critical;
   - гейт бандла пройден: старт 104 943 Б br (−337 к базе; в R1 было 116 446, то есть −11,5 КБ), `chat-account` 4 577, `chat-lead` 4 475 (+684), `chat-tools` 6 254.
4. Миграция 0067 (данные, без схемы), только локально (`wrangler d1 migrations apply --local`, временный конфиг с фиктивным id, короткая папка `%TEMP%\r23d1`, `--remote` не использовался). Два независимых прогона дали одинаковый результат:
   - применены 0001…0066, добавлены синтетические строки (пользователь бота, истёкшая подписка `plus`, истёкший заказ `day_pass`). Ledger 67, как в проде; `plans`: `free=1, day_pass=1, plus=1, pro=0, team=0`;
   - `migrations list` — ровно `0067_javob_plans_retire.sql`;
   - `apply` №1: ledger 68. `plans`: `free=1`, остальные 0, у `day_pass`/`plus` проставлен `updated_at`. Число строк изменилось только у `d1_migrations`, схема побайтно та же;
   - `apply` №2: «No migrations to apply», снимок тот же. Повторное выполнение SQL 0067 ничего не меняет (даже `updated_at`).
5. Паритет bootstrap (настоящий SQLite):
   - «миграции, потом bootstrap» и «bootstrap раньше 0067» дают одну и ту же схему;
   - каталог `plans` одинаков во всех четырёх вариантах: только миграции, миграции + bootstrap, bootstrap до миграции, пустая база + bootstrap;
   - bootstrap не меняет ни одного объекта миграций. Дрейф — те же пять давних объектов, что и в R1 (`gpt_handoffs`, `gpt_rate_limits` и три индекса); новых R2/R3 не добавляет.
6. `git diff --check origin/main..HEAD` — чисто; `npm run scan:secrets` — чисто (3 191 файл); `test:secret-scan` — 16/16; регулярка токена Telegram по диффу и по отслеживаемым файлам — 0. `webhook.ts` не тронут. `TELEGRAM_BOT_TOKEN` встречается в диффе только в тексте документов. `dist/` и `.serena/` не в Git.

**Что меняется для краулеров** (сборка `origin/main` против сборки HEAD, по `sitemap.xml`):
- изменились все 288 URL карты: обработчики в `<head>`, JSON-LD и ссылки контакта общие для всех страниц;
- видимый текст изменился на 284 URL. Четыре страницы GPTBot Market (`/ru/market-doverie/`, `/uz/market-ishonch/`, `/ru/sotuvchi/`, `/uz/sotuvchi/`) изменились только в `<head>`, JSON-LD и параметре ссылки;
- title сменился у `/ru/tarify-ai-chat/`, description — у `/ru/gpt-na-russkom/`;
- изменились 25 Markdown-копий, `llms.txt`, `llms-full.txt` и `sitemap-updates.xml`; `robots.txt`, `_redirects` и `_headers` те же;
- личная ссылка была на 288 страницах, осталась на четырёх страницах Market.

**Отклонения.**
1. Первая попытка второго прогона упала на 0023 с ошибкой локального wrangler «bad port» (порт miniflare, не SQL). Прогон повторён с нуля в новой папке и совпал с первым.
2. Ведущий выкатывает R2 и R3 одним релизом, но деплоев два. Соль нельзя включить первым деплоем: код R1 считает `sha256(ip + соль)`. Поэтому порядок такой: код с пустым `SINCE`, потом секрет, потом коммит `SINCE` и передеплой (`SALT-RU.md`).
3. Проверка живых защищённых страниц сделана однострочником на `seoContract` и `BASELINE` (п. 12 чек-листа): `scripts/seo-protection.ts` умеет только `capture|check` по `dist/`, а скрипт защиты не меняю.

**Чек-лист выката R2+R3 — только по команде владельца.** Git Bash, `cd F:/Claude/gptbot-gsc-audit-20260917`, `export NODE_OPTIONS=--max-old-space-size=1400`. Секреты не печатать, только имена. Wrangler — через `python F:/Claude/gptbot-tools/wr.py -- …`. Превью не делать: оно пишет в боевую D1. Worker `gptbot-automation` в R2/R3 не меняется.
0. **Предусловия.**
   - Push только с разрешения владельца. `git status` чистый, `python F:/Claude/gptbot-tools/deploy_runner.py check` (прод `eccfac28` — предок).
   - Выбрать дату с учётом окон C22/C11 и записать её в строку «Выкаты» `docs/seo/CHANGE_LOG_2026-10.md`. Оплату в этот день не включать.
1. **Резервная копия D1:** `wr.py -- d1 export gptbot-ai-drafts --remote --output F:/Claude/gptbot-production-backups/paid-chat-R2R3-<stamp>/before-0067.sql`, затем `sha256sum`. Копия вне Git: в ней переписки.
2. **Репетиция на копии экспорта**, как в R1: `node:sqlite`, `foreign_keys=OFF`, одна транзакция. Применить SQL 0067 дважды. Первый раз меняются две строки `plans` (`day_pass`, `plus`), второй — ни одной. Число строк ни в одной таблице не меняется; `quick_check` = ok. Итог записать в `docs/paid-chat/releases/R2R3-migration-rehearsal.json`.
3. **Боевая D1.**
   - `wr.py -- d1 migrations list gptbot-ai-drafts --remote` — ровно `0067_javob_plans_retire.sql`;
   - `wr.py -- d1 migrations apply gptbot-ai-drafts --remote`;
   - сверка только чтением: `SELECT code, is_active FROM plans ORDER BY display_order` (`free 1`, остальные 0) и `SELECT COUNT(*) n, MAX(name) last FROM d1_migrations` (68, `0067_javob_plans_retire.sql`).
4. **Сборка:** `npm run build:production`, затем `npx tsc -b` (0), `npx tsx scripts/seo-audit.ts` (0 critical), `npx tsx scripts/seo-protection.ts check` (10/10 на новой базе), `npx tsx scripts/chat-bundle-budget.ts` (в пределах).
5. **Деплой 1 — код, `GPT_HASH_SALT_SINCE` пустой:**
   - `python F:/Claude/gptbot-tools/deploy_runner.py check`, затем `deploy`;
   - `https://gptbot.uz/gptbot-release.json`: коммит = HEAD;
   - тик обслуживания (`SALT-RU.md`, шаг 5) отвечает `rekey.status = "off"`.
6. **Бот** (`BOT-RU.md`, Bearer из `gptbot-private/gpt-billing-maintenance-secret.txt` через файл заголовка, без печати):
   - `POST https://gptbot.uz/api/internal/gpt-model-probe?target=javob` — 4 прогона `ok`; при `rate_limit` повторить один раз;
   - `POST https://gptbot.uz/api/internal/javob-setup` (проверка), затем с `{"apply":true}`. Ожидается `matches: true`, `plans` — «лимит / limit»;
   - смоук: владелец за минуту шлёт @gptbotuz_bot текст и голосовое. Сверка агрегатами с момента деплоя: в `telegram_updates.status` есть `done`, а `telegram_events` показывает `javob_reply_generated` и `voice_reply_generated` больше 0.
7. **Соль:**
   - `f=C:/Users/Borinio/.config/gptbot-private/gpt-hash-salt.txt; test -e "$f" || node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$f"`;
   - `python F:/Claude/gptbot-tools/wr.py --stdin "$f" -- pages secret put GPT_HASH_SALT --project-name ai-direct-pro-landing`;
   - `pages secret list` — проверить только имя.
8. **`SINCE`:**
   - значение: `node -e "const d=new Date(Date.now()+3600e3);d.setUTCHours(24,0,0,0);console.log(d.toISOString().replace('.000Z','Z'))"`;
   - записать в `wrangler.toml` в два места: JSON и таблицу;
   - тесты `runtime-config` и `pages-config-parity` по одному файлу;
   - коммит `chore(release): switch hash salting on at <SINCE>` (с HANDOFF и STATE).
9. **Деплой 2:**
   - `build:production`, затем `seo-protection check`, затем `deploy_runner.py check|deploy`;
   - тик отвечает `rekey.status = "waiting"`. `no_since` — исправить `SINCE` новым коммитом; `off` — исправить секрет.
10. **После `SINCE`:**
    - тики крона или ручные вызовы (`SALT-RU.md`, шаг 6) до `done` (не раньше `SINCE` + 10 мин);
    - CPU шага `rekey` смотреть в метриках Functions;
    - через `SINCE` + 2 ч — агрегатный SQL из `SALT-RU.md`, шаг 7: все 12 счётчиков = 0;
    - приёмка: 6-е сообщение — 429 `hourly` с `Retry-After`; заявка из чата с перепиской доходит; вкладка, открытая до `SINCE`, продолжает историю.
11. **Живые маркеры** после деплоя 1 (`curl -s <URL> | grep -c '<строка>'`):
    - `/ru/gpt-chat/`: «когда он доступен, его условия показаны в самом чате», `mailto:ceo@gptbot.uz`;
    - `/uz/gpt-uzbek-tilida/`: «Pullik AI paket ixtiyoriy», «Biznes bot narxlari»;
    - `/`: `id="contact"`, `mailto:ceo@gptbot.uz`;
    - `/ru/tarify-ai-chat/`: title «Тарифы AI-чата — бесплатно и AI-пакет | GPTBot.uz», «20 000 сум, без автосписаний»;
    - `/uz/javob/`: «10 ta javob va oyiga 100 tagacha»;
    - `/uz/blog/chatgptga-qanday-kirish-mumkin/`: «GPTBot.uz · O‘zbek tilida»;
    - ноль совпадений `Day Pass|Plus|obuna|подписк` на `/ru/javob/`, `/uz/javob/`, `/ru/tarify-ai-chat/`, `/uz/gpt-chat-qollanma/`, `/ru/gpt-chat-guide/`;
    - `XGame_changerx` — только на четырёх страницах Market из `sitemap.xml`;
    - Browser pane 375×812: шапка «GPTBot.uz», «OpenAI mahsuloti emas», чанки грузятся по требованию, ошибок консоли нет, одно `message_sent` на сообщение.
12. **Защищённые страницы вживую** — должно быть `10/10`:
    `npx tsx -e "import fs from 'node:fs';import {seoContract,PROTECTED_PATHS,BASELINE} from './scripts/seo-protection.ts';(async()=>{const b=JSON.parse(fs.readFileSync(BASELINE,'utf8'));let ok=0;for(const p of PROTECTED_PATHS){const c=seoContract(await (await fetch('https://gptbot.uz'+p,{headers:{'cache-control':'no-cache'}})).text());const d=Object.keys(c).filter(k=>JSON.stringify(c[k])!==JSON.stringify(b.pages.find(r=>r.pathname===p).contract[k]));if(!d.length)ok++;else console.log(p,d.join(','))}console.log('live vs BASELINE:',ok+'/10')})()"`
    До выката он даёт 0/10: в проде прежняя база.
13. **Переобход:**
    - `py -3 -W ignore F:/Claude/gptbot-tools/gsc_tools.py submit https://gptbot.uz/sitemap.xml https://gptbot.uz/sitemap-updates.xml https://gptbot.uz/ru/blog/feed.xml https://gptbot.uz/uz/blog/feed.xml`;
    - IndexNow по всем 288 URL карты (на каждом изменился подвал), каждый сначала проверяется вживую: `node -e "const x=require('fs').readFileSync('dist/sitemap.xml','utf8');require('fs').writeFileSync('<tmp>/r2r3-urls.json',JSON.stringify([...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1])))"`, затем `python F:/Claude/gptbot-tools/indexnow_list.py <tmp>/r2r3-urls.json <HEAD> r2r3_release "R2+R3: contact and footer on every page, chat terms, AI pack copy"`. Квитанция ляжет в `reports/indexnow-receipts/`.
14. **Квитанции:**
    - `npx tsx scripts/chat-bundle-budget.ts --record` из сборки релиза (решение WP-10);
    - `docs/paid-chat/releases/R2R3-live-verification.json`: время `SINCE` (не соль), статусы тиков, агрегаты, маркеры, 10/10;
    - строка «Выкаты» в `CHANGE_LOG_2026-10.md` (дата, коммит, deployment);
    - HANDOFF и STATE, один коммит.
- **R2.1:** 7 дней ≥ 90 % ответов бота → `GPT_BOT_HANDOFF_ENABLED = "true"` → деплой.
- **Откат:**
  - код — `git revert` и guarded-деплой; 0067 не откатывать;
  - после `secret put`, но до `SINCE`: сначала пустой `SINCE` и передеплой. Код R1 до WP-07 возвращать, только удалив `GPT_HASH_SALT`: R1 дописал бы соль к IP;
  - после `SINCE` — только исправление вперёд: соль не удалять и не менять, `SINCE` не двигать;
  - защищённые страницы откатываются только целиком. Старая база не тронута.

**Открыто (не блокирует выкат).**
1. Давний дрейф bootstrap и миграций (п. 5) — как в R1, решение ведущего.
2. Открытые вопросы ревью WP-07…WP-12 остаются, как записаны ниже: GPTBot Market и личный Telegram; title `/uz/gpt-chat-qollanma/`; ник бота в `AGENTS.md`; `plan='plus'` в БД (WP-13); вычитка узбекских строк носителем.
3. Рабочего Telegram нет. Когда владелец его назовёт, это одна строка `studioTelegram` в `site.json` плюс три проверки в `studio-contact` и фраза в `llms.txt`.

**Дальше.** Выкат R2+R3 по команде владельца (чек-лист выше), затем WP-13 (релиз R4).

---

# Платный AI-чат к проду: ревью WP-12, 2026-10-01

**Итог.** Проверил коммиты WP-12 `98f8eb8b` (ревизия, шаблоны, контент) и `0e8bd637` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md` (§1: правила, проверки и защищённые страницы; §2: L14; §3, строка R3; §4, WP-12: файлы, тесты, приёмка), картой `03` §5 и `AGENTS.md` §2–8, §11. Работа началась после перезапуска приложения: дерево было чистым на `0e8bd637`, незаконченной работы не было. Ничего не запушено и не задеплоено. Cloudflare, D1, GSC, боты и вебхуки не менялись; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты.

**Сделано верно:**
- **Ревизия.** Новая база `2026-10-01-paid-chat-honesty` меняет на всех десяти страницах одно поле — `bodyTextSha256`. Title, H1, description, robots, googlebot, canonical, hreflang и внутренние ссылки сверил с `2026-09-30-gsc-driven` поле за полем: те же. Каждый сохранённый `bodyText` даёт свой хеш. Старая база не тронута: её sha256 совпадает с записанным. После свежего `npm run build:fast` гейт — **10/10**.
- **Текст против `reviewedChanges`.** Сравнил `bodyText` старой и новой базы построчно на всех десяти страницах. Изменилось ровно то, что описано: строки связи, футер, список условий и абзац о боте на чат-страницах, noscript, «Biznes bot narxlari», блок входа «GPTBot.uz · …», карточка контактов в двух статьях, раздел `#contact` и FAQ в оболочке главной.
- **Формулировки чат-страниц** верны и до, и после открытия оплаты: бесплатный чат без регистрации и оплаты; пакет — по желанию, его условия показаны в чате, «когда он доступен»; вопросы уходят на наш сервер и зарубежным AI-провайдерам. Обещания «продолжить в боте» нет. FAQ (только `.md`) говорит то же. Отклонение исполнителя от карты `03` («когда он доступен») верное: при закрытой оплате чат пакет не показывает.
- **Личный Telegram.** Его нет в `site.json`, футерах, главной (React и оболочка), шаблоне блога, 159 статьях, обработчиках в `<head>` и JSON-LD. В собранном `dist/` он остался только на четырёх страницах GPTBot Market. GA4 `contact_click` и цель Метрики `telegram_cta_studio` считают метку `data-contact="studio"`; копия в `index.html` — байт в байт.
- **Главная в Browser pane** (локальный мок `dist/`, 375×812). Кнопка hero ведёт к единственному `#contact`, верх раздела — на 80 px. Кнопки «Позвонить» и «E-mail» — 343×56 и 343×58. Ссылок `t.me` нет, горизонтальной прокрутки нет. Оболочка для краулеров стоит внутри `#root`, `createRoot` её заменяет, поэтому двух `id="contact"` не бывает.
- **Код и безопасность.** Экранирование в новых помощниках (`contactCardHtml`, `studioFooterLinks`, оболочка главной) верное. Админка правит `studioTelegram` и `email`. SQL, миграций, настроек Cloudflare, Javob, вебхуков и API админки WP не трогает, поэтому `org_id`, идемпотентность, PII и паритет миграций не затронуты.
- **Отклонения исполнителя обоснованы:** главная и 159 статей вошли в ревизию, потому что шаблоны общие; абзац о боте нейтральный; `defaultCTA` убран целиком; Pixel `Lead` → `Contact`.

**Дефект, исправлен:**
1. **Неграмотная фраза в статье.** В FAQ `/ru/blog/pochemu-biznes-teryaet-zayavki-iz-instagram-telegram/` стояло «Подробности проще обсудить в E-mail: ceo@gptbot.uz.». Это след замены «в Telegram» слово в слово. Фраза видна на странице и уходит в FAQPage JSON-LD. Теперь: «Подробности проще обсудить по телефону +998 50 587 07 20 или по e-mail ceo@gptbot.uz.» — как в узбекской паре этой статьи. Новый тест в `studio-contact` ловит такую замену («обсудить/написать … в e-mail») во всех статьях и страницах. На `0e8bd637` он находит этот файл, сейчас — ни одного. Статья не защищена, поэтому гейт и база не меняются.

**Открытые вопросы, R3 не блокируют:**
1. **GPTBot Market.** Четыре страницы (`/ru/market-doverie/`, `/uz/market-ishonch/`, `/ru/sotuvchi/`, `/uz/sotuvchi/`) по-прежнему называют личный Telegram владельца каналом поддержки. Это `MARKET_SUPPORT_URL` и два текста центра доверия. L14 применён к контакту студии. Оставить ли Market личный аккаунт или перевести его на e-mail или бота — решение владельца. В GA4 клик по этой ссылке теперь записывается с `contact_kind: product_bot`.
2. **GA4 `telegram_demo_click`.** Это эвристика в `<head>`: короткий текст ссылки со словом «демо», «demo» или «telegram». Теперь она срабатывает и на кнопках «Запросить демо» / «Demo so‘rash», которые ведут на `#contact` (`target_url: #contact`). Это не ключевое событие (`GA4_OWNER_SETUP_2026-08-22.md`). Читать его как «клик по кнопке демо».
3. **Подписи на главной.** «Запустить демо» (шапка, текст для скринридера в мобильной панели) и «Запустить такое демо» (демо-блок) ведут к разделу контактов. Hero и оффер говорят «Запросить демо» и «Получить демо». Выровнять можно в следующей ревизии `/`: подпись шапки входит в текст защищённой оболочки.
4. **Рабочий Telegram.** Для сайта это одна строка в `site.json`. Но три проверки в `tests/studio-contact.test.ts` (`STUDIO_TELEGRAM_URL === null`) и фразу в `llms.txt` нужно пересмотреть в том же коммите. Так задумано.
5. **Старые тесты вне `npm test`** падают и до WP-12: `bormi-admin-hardening` (скрипт сборки), `market-cabinet-shell`, `react-router-v8-migration` (число маршрутов и страниц в sitemap). WP-12 не добавляет ни страниц, ни маршрутов, ни функций.
6. Остаются вопросы исполнителя: `telegram_cta_studio` и `contact_click` молчат, пока рабочий Telegram не назван; title `/uz/gpt-chat-qollanma/`; ник Javob в `AGENTS.md`; вычитка узбекских строк носителем; `plan='plus'` в БД (WP-13).

**Проверки ревью.**
- `tsc -b` — 0; `typecheck:functions` — 0. ESLint 37 изменённых TS/TSX-файлов WP-12 и `tests/studio-contact.test.ts` — 0.
- `git diff --check` и регэксп токена Telegram по `e11524f0..HEAD` — чисто. `scan:secrets` — чисто (3 191 файл).
- `npm run build:fast` (до и после исправления): `seo-protection check` — **10/10**, `seo-audit` — 0 critical (пары RU/UZ 44/0). Гейт бандла в пределах: старт без изменений, `chat-lead` 4 475 Б br (+684 к базе, из WP-11).
- Тесты по одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`): весь список `npm test` и соседние файлы — 90 файлов, 1 173 пройдено, 7 падений. Из них 2 — известные датозависимые тесты Lead Radar, 5 — старые тесты из п. 5 выше. После исправления заново прошли `studio-contact` 18 (+1), `seo-protection` 6 и 12 соседних файлов (контент, блог, ссылки, оболочка главной, формы) — всё зелёное.

**К релизу R3** — без изменений, см. раздел WP-12 ниже: сначала выбрать дату относительно замеров C22/C11, оплату в день выката не включать; `build:production` → `deploy_runner.py check|deploy`; после выката сверить живой HTML с базой, отправить sitemap и IndexNow, перезаписать базу бандла. Владельцу: проверить, что письма на `ceo@gptbot.uz` доходят, и переключить Meta-оптимизацию с `Lead` на `Contact`, если она есть; решить вопрос по GPTBot Market (п. 1).

**Дальше.** Релиз R3 (WP-09…WP-12 вместе с кодом R2), затем WP-13 (релиз R4).

---

# Платный AI-чат: WP-12 — одна ревизия защищённых страниц, 2026-10-01

**Итог.** Сделан WP-12 плана `10-PROD-PLAN.md` (релиз R3, решение L14; цель WP-12 — формулировки, верные и до, и после открытия оплаты) на ветке `paid-chat/prod-readiness` поверх `e11524f0` (WP-11 с ревью), коммит `98f8eb8b` (`98f8eb8b86cf33c8be7c51e5e58efcce7de05f6a`; следующий коммит только записывает этот SHA в STATE, правило D-006). Это **единственная** ревизия десяти защищённых страниц в R3. Новая база гейта — `docs/seo/evidence/2026-10-01-paid-chat-honesty/reviewed-protected-pages.json`. На всех десяти страницах меняется одно поле — `bodyTextSha256`. Title, H1, description, robots, canonical, hreflang и внутренние ссылки те же. `seo-protection check` — 10/10 на новой базе. Старая база `2026-09-30-gsc-driven` не тронута: её sha256 записан в новой, тест это проверяет. Ничего не запушено и не задеплоено. Cloudflare, D1, GSC, боты и вебхуки не менялись; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты. Миграций и настроек Cloudflare нет.

Работа началась после перезапуска приложения. Дерево было чистым на `e11524f0`, незаконченных правок WP-12 и копий в `F:/Claude/gptbot-tools/backups/` не было, поэтому WP сделан с нуля. По ходу работы копии диффа лежат в `F:/Claude/gptbot-tools/backups/wp12-partial-*`.

**Что видит посетитель.**
- Личного Telegram владельца больше нет нигде на сайте, кроме GPTBot Market (отдельный продукт): ни на главной, ни на чат-страницах, ни в блоге, ни в футерах, ни в `<head>` и JSON-LD. Вместо него — телефон, `ceo@gptbot.uz` и формы.
- Чат-страницы говорят о себе то, что верно и сейчас, и после открытия оплаты. Без «платный тариф ещё не запущен», без «история остаётся в браузере» (сообщения хранятся на сервере), без обещания «продолжите в боте» (бот молчит с 13.09).
- Кнопки «демо» на главной ведут на раздел контактов внизу страницы.
- В статье о входе в ChatGPT адрес `chatgpt.com` стал ссылкой.

**Что сделано.**
1. **Чат-страницы** `/uz/gpt-uzbek-tilida/` и `/ru/gpt-chat/` (блок под чатом; первый экран не менялся):
   - список условий: «Для бесплатного чата регистрация, карта и номер телефона не нужны»; «Для бесплатного чата оплата не нужна. Платный AI-пакет — по желанию: когда он доступен, его условия показаны в самом чате»; «Вопросы отправляются на наш сервер и зарубежным AI-провайдерам для ответа — не вводите пароли…». UZ — то же («Pullik AI paket ixtiyoriy: u mavjud bo‘lganda…»);
   - абзац о боте: «В Telegram есть и бот GPTBot Javob: у него свой бесплатный лимит…». Обещания «продолжить в Telegram» больше нет: бот вернётся с R2, а решение «≥ 90 % ответов 7 дней» — пост-шаг R2.1;
   - строки связи — телефон и e-mail (`tel:`, `mailto:`), noscript — «позвоните нам: +998 50 587 07 20»;
   - UZ-навигация «Tariflar» → «Biznes bot narxlari» (адрес тот же, это прайс бизнес-ботов, F10);
   - FAQ (выводится только в `.md`) — те же формулировки; `ctaSecondary` (на чат-странице не выводится) — на B2B-страницу; `updatedAt`/`lastReviewedAt` 2026-10-01.
2. **Одна настройка контакта — теперь на всём сайте** (L14). Из `content/global/site.json` убраны поле `telegram`, `defaultCTA` и личный Telegram в `sameAs` (остался GitHub). Всё берётся из `src/shared/studio-contact.ts`:
   - общий для футеров помощник `studioFooterLinks()` (`scripts/contact-card.ts`): телефон, e-mail, Telegram — только из `studioTelegram`. Его используют футеры лендингов, чат-страниц, статей и блог-индексов;
   - карточка контактов теперь работает и в статьях: `contactCardHtml()` + `articleLinksContactCard()`. Карточка стоит на месте конечной кнопки и рисуется только там, где на неё есть ссылка. У блог-индексов кнопка «Связаться с нами» и карточка;
   - мобильная панель статей: телефон и Telegram (если настроен), иначе телефон на всю ширину — как на лендингах;
   - кнопка в шапке страницы без своего CTA ведёт на `#contact` с подписью «Связаться с нами» / «Biz bilan bog‘lanish» (вместо русской «Запустить демо в Telegram» и на узбекских статьях тоже);
   - в админке (`src/admin/pages/Settings.tsx`) поле «Telegram» заменено на «Studio Telegram» (`studioTelegram`) и «E-mail»; поля Default CTA убраны;
   - GPTBot Market получил свою константу `MARKET_SUPPORT_URL` в `scripts/market-page.ts`: его канал поддержки — решение отдельного продукта.
3. **Аналитика в `<head>` без ника.** GA4 `contact_click` и цель Метрики `telegram_cta_studio` теперь считают ссылку с меткой `data-contact="studio"` (`STUDIO_CONTACT_ATTR` / `STUDIO_CONTACT_PROPS`), а не личный ник. Метку ставят все места, где может появиться рабочий Telegram: футеры, панели, карточка, запасной вариант формы (и в `<noscript>`, и в скрипте), калькулятор, B2B-карточка и форма чата, главная. Поэтому рабочий Telegram — одна строка в `site.json`, правка тегов не нужна. Копия блока Метрики в `index.html` — байт в байт. Пока Telegram не назван, ни событие, ни цель не срабатывают.
4. **Главная** (`/`, защищённая):
   - React: все кнопки «демо» (шапка, меню, hero, «Решение», демо-чат, оффер, футер) ведут на `#contact`, без `target=_blank`. `FinalCTA` — раздел контактов: «Позвонить: +998 50 587 07 20», «E-mail: ceo@gptbot.uz», Telegram — только если настроен. Футер: телефон и e-mail вместо «Telegram bot». Мобильная панель — один телефон;
   - тексты без «Telegram»: «Запросить демо» / «Demo so‘rash», «Получить демо» / «Demo olish», FAQ «Что будет после обращения? — Вы звоните или пишете на e-mail — мы показываем демо…»;
   - оболочка для краулеров (`prerender-home.ts`) говорит то же: ссылки на `#contact`, раздел контактов, футер с e-mail;
   - Meta Pixel: клик по кнопке «демо» больше не шлёт `Lead` — теперь это прокрутка вниз, а не уход в Telegram. Клик по телефону, e-mail или Telegram шлёт `click_contact` = стандартное событие Meta `Contact` (`src/lib/cta.ts`).
5. **Блог.** Шаблон (`prerender-blog.ts`) и 159 статей:
   - 259 кнопок, которые вели в личный Telegram, ведут на карточку `#contact`. 111 подписей «…в Telegram» стали нейтральными («Запросить демо», «Demo so‘rash», «Обсудить задачу»); подписи про Telegram-бота как продукт не менялись. Две двусмысленные уточнены: «Обсудить AI-автоматизацию для Telegram», «Обсудить Telegram-бота с оплатой Payme/Click»;
   - 11 строк «Позвонить или Telegram» → «Позвонить или написать на e-mail» (`mailto:`), 15 текстов с адресом аккаунта и 27 фраз «напишите в Telegram», «обсудить можно в Telegram по кнопке ниже», «Telegram’da muhokama qilamiz» → телефон или e-mail;
   - `dateModified` статей не менялся: их содержание то же, поменялся только контакт;
   - блок входа в чат в статьях: «GPTBot AI · …» → «GPTBot.uz · На русском» / «GPTBot.uz · O‘zbek tilida» — бренд того чата, который он открывает (WP-09, AGENTS §2).
6. **Защищённые статьи** (шесть из семи меняются контентом, седьмая — только шаблоном): строки связи, блок входа, футер; у `/ru/blog/chatgpt-i-claude-v-uzbekistane/` и `/uz/blog/ai-chat-nima-va-qanday-turlari-bor/` конечная кнопка уступила место карточке контактов. В `/uz/blog/chatgptga-qanday-kirish-mumkin/` упоминание «chatgpt.com» в абзаце «Rasmiy kirish sahifasi chatgpt.com domenida…» стало ссылкой на `https://chatgpt.com/` (новая вкладка, `noopener noreferrer`). Видимый текст тот же.
7. **JSON-LD:** `Organization.email` и `ContactPoint.email` = `ceo@gptbot.uz` (открытый вопрос 5 ревью WP-11).
8. **Новая база защиты** собрана из локального `dist/` после `npm run build:fast`, как и `2026-09-30-gsc-driven`. `reviewedChanges` описывает каждую страницу: что было, что стало, старый и новый sha256, что гейт не видит. `invisibleToGate` перечисляет изменения R1–R3 вне гейта: экраны чата (R1, WP-09), скрипты и манифест (WP-10), Markdown-копии, B2B-карточку и сообщения API (WP-11), `<head>`, JSON-LD, главную и Pixel (WP-12). `measurement` описывает пересечение с замерами C22/C11. `BASELINE` и комментарий в `scripts/seo-protection.ts` обновлены.

**Отклонения от плана (и почему).**
1. **Статьи блога и главная — в WP-12.** План видел в WP-12 только защищённые страницы и футер. Но шаблон блога и главная общие с защищёнными страницами, а ревизия первого экрана бывает раз в 28 дней. Поэтому все 159 статей с личной ссылкой переведены сейчас: иначе после R3 они ещё месяц вели бы в канал, которого сайт больше не предлагает. Вариант «отдельным пакетом» ревью WP-11 оставляло на усмотрение ведущего; я выбрал WP-12, потому что в шаблоне статей карточка контактов нужна в любом случае.
2. **Формулировка о пакете.** Карта `03` предлагала «платный пакет — по желанию, его условия показаны в самом чате». Пока оплата закрыта, чат пакет не показывает (WP-09), значит, фраза была бы неправдой. Стало: «когда он доступен, его условия показаны в самом чате». Это верно в обоих состояниях.
3. **Абзац о боте — нейтрально, по условию плана.** Бот молчит с 13.09, R2 ещё не выкачен, недели ≥ 90 % не было. Поэтому «продолжить в боте» убрано, ссылка на `/uz/javob/` и `/ru/javob/` осталась.
4. **Аналитика по метке, а не по нику.** План говорил «заменить ссылку». Но с ником в `<head>` смена аккаунта ломала бы счёт молча, а `index.html` — ручная копия. Метка `data-contact="studio"` делает рабочий Telegram одной строкой в `site.json`. `GPTBot_support` из старого регэкспа не нужен: этот адрес стоит только в неотрисовываемом поле `buttonHref` двух статей.
5. **`defaultCTA` удалён целиком, а не только его `href`.** Без адреса подпись по умолчанию бессмысленна. Подпись была русской и на узбекских статьях. Теперь у кнопки без CTA своя подпись на языке страницы и цель `#contact`, и карточка рисуется всегда, когда на неё ведёт кнопка (`linksContactCard` учитывает и шапку).
6. **Бренд в блоке входа в чат.** В плане этого нет. Но это шесть защищённых статей, а следующая ревизия — не раньше чем через 28 дней. Блок открывает чат, в шапке которого с WP-09 написано «GPTBot.uz». Голое «GPTBot» — ещё и имя краулера OpenAI (AGENTS §2).
7. **Meta Pixel `Lead` → `Contact`.** В плане этого нет, но без правки каждая прокрутка к контактам считалась бы лидом.
8. **Ссылка на L2.** Задача назвала формулировки «верные до и после запуска» решением L2. В плане L2 — нумерация миграций. Применены цель WP-12 и карта `03` §5.
9. **Не тронуто, и это осознанно:** первый экран чат-страниц (строка под полем выходит в WP-18 вместе с политикой, карта `03` §3.7); title и H1 `/uz/gpt-chat-qollanma/` «GPTBot AI-chat qo‘llanmasi» (незащищённая страница, смена title — решение SEO); GPTBot Market и Bunzy; старые генераторы контента.

**Тесты** (по одному файлу, `NODE_OPTIONS=--max-old-space-size=1400`):
- `seo-protection` 6 (+3): текущая ревизия документирует каждое изменённое поле по сравнению с предшественницей, а та не изменена (sha256); ревизия WP-12 меняет только текст, и текст говорит нужное; исходники чат-страниц (FAQ) и ссылка на chatgpt.com;
- `studio-contact` 17 (+9): нет `telegram`, `defaultCTA` и личного `sameAs` в `site.json`; админка правит `studioTelegram`; ни одна страница и статья не называет личный аккаунт; фразы «студия пишет в Telegram» в статьях (регэксп ловит 29 статей на `e11524f0` и 0 сейчас); карточка в статьях и блог-индексах, ни одной висящей `#contact`; футеры; метка на каждом месте, где появится рабочий Telegram; главная ведёт на `#contact`, без `Lead`; собранный `dist/`: личный ник только на 4 страницах Market, у каждой ссылки `#contact` ровно одна карточка; список исключений сократился до Market, Bunzy, lead-бота и старых генераторов;
- переписаны: `yandex-metrika` 69 (цель студии по метке; немеченая ссылка на любой аккаунт — не студия), `seo-analytics-privacy` 23 (`contact_click` по метке, в блоке нет ника), `lead-capture-templates` 30 (+1: запасной Telegram-контакт формы помечен), `advertising-seo-content` 8, `chat-entry` 4 (бренд «GPTBot.uz»);
- весь список `npm test` и соседние файлы — по одному: 79 файлов, 986 пройдено, 2 падения — известные датозависимые тесты Lead Radar (`tests/lead-radar.test.ts`, фикстуры 2026-08-24, код Lead Radar не менялся).

**Проверки.**
- `tsc -b` — 0; `typecheck:functions` — 0. Отдельный `tsc --strict` изменённых скриптов и тестов: в моих строках ошибок нет; `prerender-blog.ts:157` (`L()`) и `prerender.ts:839` — было до WP-12.
- ESLint 37 изменённых TS/TSX-файлов — 0. `git diff --check` — чисто. `scan:secrets` — чисто (3 191 файл). Регэксп токена Telegram по диффу и новой базе — 0.
- `npm run build:fast` → `seo-protection check` — **10/10 на новой базе**; `seo-audit` — 0 critical (121 страница, пары RU/UZ 44/0); гейт бандла в пределах: старт 104 943 Б br (−337 к базе), `chat-lead` 4 475 (+684 к базе: +654 из WP-11 и 30 Б метки), `chat-account` 4 577, `chat-tools` 6 254.
- `dist/`: личный ник — только 4 страницы GPTBot Market; 228 страниц ссылаются на `#contact`, у каждой ровно одна карточка.
- Browser pane, локальный мок `dist/` (`/api` поддельный, прод не трогал), 375×812:
  - `/`: 7 кнопок «демо» ведут на `#contact` без новой вкладки; клик по «Запросить демо» прокручивает к разделу (верх раздела на 80 px); кнопки 343×56 и 343×58; ссылок `t.me` нет; панель — один телефон; горизонтальной прокрутки нет;
  - `/uz/gpt-uzbek-tilida/`, `/ru/gpt-chat/`: чат монтируется, новые условия, «Biznes bot narxlari», футер с e-mail, единственная ссылка `t.me` — бот `@gptbotuz_bot`; ошибок консоли нет;
  - `/uz/blog/ai-chat-nima-va-qanday-turlari-bor/`: шапка «Demo so‘rash» → `#contact`, карточка вместо конечной кнопки; `/ru/blog/`: «Связаться с нами» и карточка; `/uz/blog/chatgptga-qanday-kirish-mumkin/`: ссылка `chatgpt.com` (новая вкладка), блок «GPTBot.uz · O‘zbek tilida».

  Скриншоты не снимались: окно не отрисовывалось. Проверка шла по DOM и размерам элементов.

**К релизу R3.**
1. R3 = WP-09…WP-12 и, по сути, код R2 (страницы javob описывают бота R2). `npm run build:production` → `deploy_runner.py check|deploy`. Гейт при деплое проверит 10/10 на новой базе.
2. **Дата выката и замеры C22/C11.** Ревизия трогает `/uz/gpt-uzbek-tilida/` и статьи о входе и о загрузке, но не их рычаги (title, description, H1, FAQ[0], раздел `#chatgpt-kirish`). Выкат внутри окна чтения T0+14 или T0+28 всё равно добавит помеху. Дату нужно выбрать и записать в `CHANGE_LOG_2026-10.md`. Первый экран чат-страниц эта ревизия не меняет. Оплату в день выката R3 не включать (правило плана).
3. После выката:
   - живой HTML десяти страниц против новой базы (образец `docs/readiness/2026-09-06/verify-live.mjs`);
   - `gsc_tools.py sitemaps`;
   - IndexNow: 10 защищённых URL, 7 AI-чат-страниц из WP-11, `/ru/stoimost-chat-bota/`, `/uz/chat-bot-narxi/`, `/ru/kalkulyator-stoimosti-telegram-bota/`, `/ru/blog/`, `/uz/blog/`; по желанию — 153 статьи и 101 B2B-страницу (у них сменились кнопки и футер).
4. Базу бандла перезаписать `--record` из сборки релиза в коммите квитанций R3 (как решено в WP-10).
5. **Владельцу:** проверить, что письма на `ceo@gptbot.uz` доходят. Если в Meta Ads есть оптимизация на событие сайта `Lead` с главной, переключить её на `Contact`. Носителю — вычитать новые узбекские строки (§8 плана, не блокирует).

**Открыто.**
1. `telegram_cta_studio` и `contact_click` не срабатывают, пока рабочий Telegram не назван. Звонки считает `phone_click`, клики по e-mail — только `click_contact` на главной (Pixel и dataLayer).
2. Title и H1 `/uz/gpt-chat-qollanma/` — «GPTBot AI-chat qo‘llanmasi». Это незащищённая страница, её имя стоит якорем на `/` и в одной защищённой статье. Смена title — отдельное SEO-решение.
3. Подпись бота в `AGENTS.md` (строка 4) и `docs/paid-chat/ZAI-RU.md` — `@gptbot_javob_bot`, в коде — `@gptbotuz_bot` (вопрос 3 ревью WP-11, отдельный docs-коммит).
4. В БД пакет по-прежнему пишется как `plan='plus'` — это WP-13 (L16).

**Дальше.** Ревью WP-12, затем релиз R3 (WP-09…WP-12) и WP-13 (релиз R4).

---

# Платный AI-чат к проду: ревью WP-11, 2026-10-01

**Итог.** Проверил коммиты WP-11 `ea50bd9c` (код и контент) и `7f397e38` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md` (§1: правила и проверки; §2: L14, L15, L16; §3, строка R3; §4, WP-11 и граница с WP-12) и `AGENTS.md` §2–8, §11. Перед началом рабочее дерево было чистым на `7f397e38`: перезапуск приложения незаконченной работы не оставил. Ничего не запушено и не задеплоено. Cloudflare, D1, GSC, боты и вебхуки не менялись; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты.

**Сделано верно:**
- Семь AI-чат-страниц: ни «Plus», ни «Day Pass», ни «подписки». Цифры пакета (20 000 сум, 300 ответов, до 50 в день), бесплатные 15/5 и лимиты бота 10/100 тест сверяет с кодом и упакованным конфигом. Формулировки верны и до, и после открытия оплаты: кнопка «AI-пакет» в шапке чата появляется, только когда пакет можно купить (WP-09). Обрезанный ответ и сбой не списываются — так в `turn-outcome.ts`; «календарный месяц» — так в `addCalendarMonth`.
- Javob — это `@gptbotuz_bot` (`wrangler.toml`, `bot-profile.ts`); `/plans` и сутки по Ташкенту в боте есть. Исправление кнопки javob верное.
- Одна настройка `studioTelegram` в `site.json`, строгий разбор, fail-closed: мусор ссылкой не станет. В браузерный бандл попадают три строки (чанк `studio-contact` — 454 байта без сжатия), а не весь `site.json`.
- В собранном `dist/` личная ссылка в видимой разметке осталась только на 3 защищённых страницах и 4 страницах GPTBot Market. На 115 лендингах она есть лишь в `<head>`: JSON-LD `sameAs` и обработчик кликов. Это общие шаблоны, их меняет WP-12.
- На 122 лендингах нет повторяющихся `id="contact"` и `id="lead-form"` и нет якорей, которые ведут в никуда.
- Экранирование в карточке, форме и `mailto:` калькулятора верное. В событиях и логах нет PII. SQL, миграций, настроек Cloudflare, Javob и админских API WP не трогает, поэтому `org_id`, идемпотентность и паритет миграций не затронуты.
- Отклонения исполнителя обоснованы: B2B-страницы входили в задачу; фраза плана «чат об этом скажет» была бы неправдой; лестница цен бота снята, потому что бот ничего не продаёт.

**Дефекты, исправлены:**
1. **В тексте пяти страниц осталось «напишите в Telegram».** Тест проверял только кнопки, а эти фразы стоят в абзацах. Telegram на этих страницах больше не предлагается, поэтому посетителя отправляли в канал, которого нет:
   - `/ru/stoimost-chat-bota/`: «Вы пишете нам в Telegram» → «Вы оставляете заявку в форме на этой странице или звоните нам». Форма на странице есть;
   - `/uz/chat-bot-narxi/`: «Siz Telegram’ga yozasiz» → «Siz shu sahifadagi formada ariza qoldirasiz yoki bizga qo‘ng‘iroq qilasiz». Форма на странице есть;
   - `/ru/kalkulyator-stoimosti-telegram-bota/`: шаг «…или откройте Telegram» → «…или отправьте расчёт нам напрямую — кнопкой под итогом». Калькулятор теперь шлёт расчёт письмом, а с рабочим Telegram — в Telegram, и фраза верна в обоих случаях;
   - `/ru/avtor-boris-gerasimov/`, `/uz/muallif-boris-gerasimov/`: ошибку в материале присылают на `ceo@gptbot.uz`, как уже сказано в FAQ этих страниц.

   Новый тест в `studio-contact` проверяет весь текст незащищённых страниц, не только кнопки. Регэксп ловит ровно эти 5 файлов на `7f397e38` и 41 файл на `d39cece1`. Фразы про бота и про Telegram клиента он не трогает.
2. **`llms.txt` противоречил бы «одной настройке».** Файл написан вручную и говорит, что своего Telegram для обращений у GPTBot.uz нет. Если владелец впишет рабочий аккаунт в `studioTelegram`, сайт покажет Telegram, а `llms.txt` будет уверять ИИ-ассистентов, что его нет. Новый тест связывает эту фразу с настройкой и сверяет телефон и e-mail в `llms.txt` и `llms-full.txt` с `site.json`. Дата «Last updated» в обоих файлах — 2026-10-01: контакты в них поменялись.
3. **`git diff --check` не был чистым.** В разделе WP-11 этого файла 3 строки состояли из одних пробелов. Исправлено.

**Открытые вопросы, R3 не блокируют:**
1. В админке (`src/admin/pages/Settings.tsx`) поле «Telegram» меняет старое поле `telegram`. Его читают только общие с защищёнными страницами шаблоны. Полей для `studioTelegram` и `email` в админке нет. До WP-12 рабочий Telegram, вписанный в админке, появится только на главной, в блоге и на чат-страницах. WP-12 убирает `telegram` и должен заменить это поле на `studioTelegram`; `tsc` на это укажет.
2. На `/uz/maxfiylik-siyosati/` и `/uz/biz-haqimizda/` подписи кнопок без o‘/g‘: «Biz bilan boglaning», «Malumotlar boyicha boglanish». Так было и до WP-11: почти весь текст политики набран без этих знаков. Нужна вычитка носителем (§8 плана).
3. `AGENTS.md` (строка 4) и `docs/paid-chat/ZAI-RU.md` называют Javob `@gptbot_javob_bot`, а код и `wrangler.toml` — `@gptbotuz_bot`. Это стоит поправить отдельным docs-коммитом.
4. Страницы javob описывают бота R2: 10 ответов в день и 100 в месяц, ничего не продаёт. Ветка накопительная, поэтому R3 и так выходит вместе с кодом R2 или после него. Выкатывать R3 отдельно от R2 нельзя.
5. В JSON-LD Organization нет e-mail. Добавить его можно в WP-12: шаблон общий с защищёнными страницами.

**Проверки ревью.**
- `tsc -b` 0; `typecheck:functions` 0; ESLint 22 изменённых файлов и `tests/studio-contact.test.ts` — 0.
- `git diff --check` — чисто после исправления. `scan:secrets` — чисто (3 190 файлов). Регэксп токена Telegram по диффу — 0.
- Тесты, по одному файлу:
  - `studio-contact` 10 (+2), `seo-revenue-claims` 7, `lead-capture-templates` 29 (с проверками собранных страниц), `gpt-chat-handoff-link` 12, `advertising-seo-content` 8;
  - `gpt-account-ui` 14, `gpt-chat-honesty` 11, `chat-entry` 4, `gpt-chat-prerender-links` 9, `gpt-chat-lazy-part` 6, `chat-bundle-budget` 9;
  - `yandex-metrika` 69, `seo-analytics-privacy` 23, `site-stylesheets` 5, `seo-protection` 3, `homepage-crawler-shell` 5, `gsc-indexation-hygiene` 11;
  - `seo-link-graph` 17, `telegram-cost-calculator` 6, `lead-attribution` 17, `gpt-backend-security` 31, `web-security-hardening` 13;
  - `seo-commercial-claims` 9, `seo-provider-facts` 3, `service-offers` 6, `blog-related-links` 4, `seo-cluster-quality` 19, `seo-intent-manifest` 5;
  - `canonical-url-redirects` 4, `gpt-lead-outbox-endpoint` 3, `gpt-chat` 19, `gpt-backend` 18, `telegram-web-handoff` 22, `runtime-config` 4;
  - `pages-config-parity` 7, `secret-scan` 16, `seo-demand-gate` 8, `seo-indexation-recovery` 6, `blog-feed` 5, `gpt-readiness` 9;
  - `pages-production-release` 8, `home-hreflang-cluster` 4, `telegram-assistant` 76.
- `npm run build:fast` → `seo-protection check` **10/10 без изменений** → `seo-audit` 0 critical → гейт бандла в пределах: старт 104 939 Б br, `chat-lead` 4 445. Ревью не меняет `src/`, поэтому бандл тот же.

**К релизу R3** — без изменений, см. раздел WP-11 ниже. IndexNow после выката: к 7 AI-чат-адресам добавить `/ru/stoimost-chat-bota/`, `/uz/chat-bot-narxi/` и `/ru/kalkulyator-stoimosti-telegram-bota/`.

**Дальше.** WP-12 (релиз R3): одна ревизия защищённых страниц, включая общие шаблоны и поле админки из п. 1.

---

# Платный AI-чат: WP-11 — незащищённые страницы без «Plus», одна цена, без личного Telegram, 2026-10-01

**Итог.** Сделан WP-11 плана `10-PROD-PLAN.md` (релиз R3, решения L14, L15, L16) на ветке `paid-chat/prod-readiness` поверх `d39cece1` (WP-10 с ревью), коммит `ea50bd9c` (`ea50bd9c86017657a736e5a1f1d851b7a19f6f30`; следующий коммит только записывает этот SHA в STATE, правило D-006). Ничего не запушено и не задеплоено. Cloudflare, D1, GSC, боты и вебхуки не менялись; `webhook.ts` и `TELEGRAM_BOT_TOKEN` не тронуты. Миграций и новых настроек Cloudflare нет. Защищённые страницы — 10/10 без изменений.

Работа началась после перезапуска приложения. Дерево было чистым на `d39cece1`, незаконченных правок WP-11 и их копий в `F:/Claude/gptbot-tools/backups/` не было, поэтому WP сделан с нуля.

**Что видит посетитель.**
- Ни одна незащищённая страница не продаёт «Plus», «Day Pass» или подписку.
- Одна линейка: бесплатно, AI-пакет, внедрение для бизнеса. Цифры пакета на страницах те же, что в коде: 300 ответов на месяц за 20 000 сум, до 50 в день, без автосписаний, Click или Uzum Bank.
- Личного Telegram владельца нет ни на одной незащищённой странице. Вместо него — телефон, e-mail `ceo@gptbot.uz` и формы.

**Что сделано.**
1. **Одна настройка контакта студии** (L14, рабочий Telegram не назван):
   - в `content/global/site.json` добавлены `studioTelegram: ""` и `email: "ceo@gptbot.uz"`;
   - `src/shared/studio-contact.ts` читает их и `phone` именованным импортом JSON: в бандл попадают три строки, а не весь конфиг;
   - отсюда берут контакт шаблон лендингов, форма заявки, новая карточка контактов, Markdown-копии страниц, чат и калькулятор;
   - чтобы вернуть рабочий Telegram, достаточно одной строки: `"studioTelegram": "https://t.me/<handle>"`. Ссылка сразу появится в футере лендингов, в мобильной панели, в карточке контактов, в запасном варианте формы и в B2B-карточке чата;
   - значение проверяется строго: `https://t.me/<публичный handle>`. Мусор ссылкой не станет, а тест уронит сборку;
   - личный аккаунт в эту настройку записать нельзя: это тоже ловит тест.
2. **Шаблон лендингов** (`scripts/prerender.ts`, только незащищённые страницы):
   - футер: телефон и e-mail, Telegram — только из настройки;
   - мобильная панель: «Позвонить», а вторая кнопка — Telegram (если настроен), иначе «Заявка» на страницах с формой, иначе ничего, и телефон занимает всю ширину;
   - новая карточка `#contact` «Связаться с GPTBot.uz» (`scripts/contact-card.ts`): телефон, e-mail, часы работы и Telegram, если настроен. Она стоит на месте формы, перед FAQ, и рисуется только на странице, которая на неё ссылается. Поэтому якорь не бывает пустым, а остальные страницы не меняются.
3. **Форма заявки** (`scripts/lead-form.ts`). Если отправить заявку не удалось, форма предлагает Telegram с черновиком, когда он настроен, иначе телефон: «Позвонить: +998 50 587 07 20», `tel:`, без `target`. Тот же контакт стоит в `<noscript>`. Атрибуты формы — `data-fallback` и `data-fallback-text` вместо `data-telegram`. Тексты статуса — «Свяжитесь с нами напрямую».
4. **Контент — 108 страниц:**
   - **семь AI-чат-страниц:**
     - `/ru/tarify-ai-chat/` переписана целиком (title, description, og; H1 тот же);
     - `/ru/gpt-chat-guide/`, `/uz/gpt-chat-qollanma/`, `/ru/gde-polzovatsya-gpt-besplatno/`, `/ru/gpt-na-russkom/` — без Plus, с AI-пакетом. Обещание «image credits» и «истории» убрано;
     - `/ru/javob/` и `/uz/javob/` — вместо таблицы цен бота лимиты 10 в день и 100 в месяц (L15, WP-08), 1 анализ в день и `/plans`. `lastReviewedAt` 2026-10-01: страницы попали в `sitemap-updates.xml`;
   - **101 B2B-, нишевая и служебная страница:**
     - кнопки, которые вели в личный Telegram, ведут на форму `#lead-form` (26 страниц из `LEAD_FORM_PAGES`) или на карточку `#contact` (74 страницы);
     - надписи «…в Telegram» стали нейтральными: «Обсудить проект», «Demo so‘rash»;
     - около 60 фраз «напишите в Telegram» заменены на телефон, e-mail или форму;
     - в политике конфиденциальности RU/UZ контакт по данным — e-mail и телефон;
     - на `/uz/suniy-intellekt/` ссылка `{tg}` → `mailto:`.
5. **Кнопка `/ru/javob/` и `/uz/javob/` вела в пустоту.** Она открывала `t.me/gptbot_javob_bot`, а такого бота нет: публичная страница t.me показывает пустой «Contact @gptbot_javob_bot». Отвечает `@gptbotuz_bot` (`GPT_HANDOFF_BOT_USERNAME`), теперь кнопка ведёт на него с `?start=site_ru|site_uz`. Тест сверяет её с `telegramDeepLink()`.
6. **Чат** (React, страницы чата защищены, гейт этого не видит, запись есть в CHANGE_LOG):
   - B2B-карточка показывает кнопку Telegram только при настроенном рабочем аккаунте. Сейчас её путь — своя форма;
   - после заявки и при ошибке форма чата предлагает телефон студии («Если нужно быстрее, свяжитесь с нами: +998 50 587 07 20»), а не бота;
   - у `src/lib/telegram.ts` теперь всегда есть имя бота: пустое или «@» значение `VITE_TELEGRAM_BOT_USERNAME` тоже даёт `gptbotuz_bot`. Поэтому никогда не срабатывавшие запасные пути «нет бота → личный аккаунт» удалены: `TELEGRAM_CONFIGURED`, `telegramContact`, `studioTelegramLink`. Ссылка в боковой панели по-прежнему ведёт на бота.
7. **Калькулятор.** «Скопировать и открыть Telegram» заменена на «Отправить расчёт на e-mail»: письмо на `ceo@gptbot.uz` с расчётом внутри. Если форма не ушла, калькулятор предлагает то же письмо, а при `rate_limited` — телефон. Тексты ошибок не обещают Telegram.
8. **Сервер `/api/gpt/lead`.** Сообщения об ошибке больше не говорят «напишите нам в Telegram». Ссылку на прямой контакт добавляет сама страница.
9. **`/llms.txt`, `/llms-full.txt`, Markdown-копии** (`generate-llm-markdown.ts`):
   - контакт — телефон и e-mail;
   - «GPTBot Plus» заменён на AI-пакет;
   - «публичного e-mail нет» заменено на `ceo@gptbot.uz`.

**Отклонения от плана (и почему).**
1. **Объём L14 больше, чем в плане.** План (и карты `03` §6, `05` §4.2) видел личный Telegram на нескольких страницах и отдавал B2B в WP-20. На деле это 233 ссылки и фразы на 104 незащищённых страницах, и почти везде это главная кнопка. Задача прямо включила B2B-страницы, поэтому в WP-11 сделаны все незащищённые страницы `content/pages`. Формы на 4 страницах WP-20 не добавлены: это его работа вместе с бюджетом и `source`. До WP-20 там карточка `#contact`.
2. **Формулировка на странице тарифов.** План предлагал «если оплата сейчас недоступна, чат об этом скажет». Это неправда: при выключенной оплате чат пакет вообще не показывает (WP-09). На странице написано: «кнопка «AI-пакет» появляется в шапке чата, когда оплата открыта. Если кнопки нет, оплата сейчас недоступна». Это верно в обоих состояниях. Ссылки на `/ru/oferta/` нет: страницы ещё нет, она появится в WP-18.
3. **Лимиты бота 10/100, а не 3/30 из карты.** Так их задал WP-08 (L15). R3 выходит вместе с кодом R2 или после него. Тест сверяет цифры на страницах с `resolveTelegramConfig()` по `wrangler.toml`.
4. **Карточка `#contact`, а не `tel:` в кнопках.** Телефонная ссылка на компьютере часто не работает, а в карточке есть и e-mail. Кроме того, телефон и e-mail не вписаны в 74 страницы: они берутся из той же настройки, что и Telegram.
5. **Удалены никогда не срабатывавшие пути в личный аккаунт** в чате (п. 6) и **изменены сообщения сервера** заявок (п. 8). Иначе посетителя отправляли бы в Telegram, которого сайт не предлагает.
6. **«Одна лестница цен бота».** Владелец её не утвердил. Бот после WP-08 ничего не продаёт, поэтому лестница Day Pass / Plus снята со страниц целиком (D11). B2B-цены не менялись. Сверил тарифные таблицы всех B2B-страниц: внутри каждой линейки цены сходятся (AI-бот 1 990 000 / 3 900 000 / 6 900 000 и поддержка 490 000; Telegram-бот 990 000 / 2 490 000 / 4 900 000 и поддержка 290 000; Instagram 1 190 000 / 2 900 000 / 4 900 000; WhatsApp 1 490 000 / 2 900 000; SMM 2 490 000 / 4 490 000 / 7 900 000). Противоречий нет, править нечего. Одинаковые имена уровней («Старт», «Бизнес», «Pro») в разных линейках стоят по-разному — это разные продукты.
7. **Не тронуто, и это осознанно:**
   - **защищённые страницы и общие с ними шаблоны** — это WP-12, список ниже;
   - **GPTBot Market** (`/ru/market-doverie/`, `/uz/market-ishonch/`, `/uz/sotuvchi/`, футер `market-page.ts`) — отдельный продукт со своим каналом поддержки;
   - **статьи блога:** в 153 незащищённых статьях 261 ссылка на личный Telegram и 15 упоминаний в тексте. Их шаблон общий с 7 защищёнными статьями. Задача ограничила WP-11 страницами;
   - **старые генераторы контента** (`seed-pages.ts`, `apply-*.ts`, `blog-articles-part*.json`, `research-data.json`) — они не входят в сборку;
   - все эти места перечислены в тесте `studio-contact` (`LEGACY`). Любое новое место с личной ссылкой роняет тест. Когда исключение станет лишним, тест попросит его убрать.

**Тесты** (по одному файлу, `NODE_OPTIONS=--max-old-space-size=1400`):
- **новый** `studio-contact` 8:
  - одна настройка, строгий разбор, не личный аккаунт;
  - телефон и e-mail из того же файла;
  - на незащищённых страницах нет личной ссылки, а кнопки на форму или карточку не обещают Telegram;
  - каждая ссылка `#lead-form` стоит на странице с формой, у каждой `#contact` есть карточка, лишних карточек нет;
  - разметка карточки RU/UZ, Telegram в ней появляется при настроенном аккаунте;
  - калькулятор, чат и скрипты берут контакт из одного модуля;
  - защитный список мест, где личная ссылка ещё живёт.

  Проверено мутацией: с личным аккаунтом в `studioTelegram` падают 2 теста;
- **переписан** `seo-revenue-claims` 7 (было 3). Цена пакета на страницах равна `PRICE_TIYIN/100`, ответы — `PAID_MESSAGES`, дневной предел — `PACK_DAILY_LIMIT`. Бесплатные 15/5 равны `resolveConfig()` по упакованному конфигу, лимиты бота — `resolveTelegramConfig()`. На странице тарифов нет Plus, «подписки» и ссылок на оплату, B2B-кнопка ведёт на бизнес-страницу. Ни на одной из 7 страниц нет Plus и Day Pass, кнопка javob ведёт на `telegramDeepLink()`;
- **изменены:**
  - `lead-capture-templates` 29 (+2): запасной вариант — телефон, Telegram при настроенном аккаунте, разобранная страница без личной ссылки, «Заявка» в мобильной панели;
  - `gpt-chat-handoff-link` 12 (+1): аккаунт не настроен, B2B-карточка без Telegram с формой, вступление при настроенном аккаунте, `handoff.ts` никуда, кроме бота, не ведёт;
  - `advertising-seo-content` 8;
- **соседние, зелёные:** gpt-account-ui 14, gpt-chat-honesty 11, chat-entry 4, gpt-chat-prerender-links 9, gpt-chat-lazy-part 6, chat-bundle-budget 9, yandex-metrika 69, seo-analytics-privacy 23, site-stylesheets 5, seo-protection 3, homepage-crawler-shell 5, gsc-indexation-hygiene 11, seo-link-graph 17, telegram-cost-calculator 6, lead-attribution 17, gpt-backend-security 31, web-security-hardening 13, seo-commercial-claims 9, seo-provider-facts 3, service-offers 6, blog-related-links 4, home-hreflang-cluster 4, seo-cluster-quality 19, seo-intent-manifest 5, canonical-url-redirects 4, gpt-lead-outbox-endpoint 3, gpt-chat 19, gpt-backend 18, pages-production-release 8, secret-scan 16, runtime-config 4, pages-config-parity 7, seo-demand-gate 8, seo-indexation-recovery 6, blog-feed 5, gpt-readiness 9;
- `studio-contact.test.ts` добавлен в `npm test`.

**Проверки.**
- `tsc -b` — 0; `typecheck:functions` — 0. Отдельный `tsc --noEmit --strict` изменённых скриптов и тестов: в их строках ошибок нет. Ошибки в подтянутых `functions/**` (типы D1), `prerender.ts:835` и `src/lib/telegram.ts` (`import.meta.env` без типов vite) были и до WP-11.
- ESLint 22 изменённых файлов — 0; `git diff --check`, `scan:secrets` и регулярка токена Telegram — чисто.
- `npm run build:fast` → `seo-protection check` — **10/10 unchanged**. `seo-audit` — 0 critical (121 страница, пары RU/UZ 44/0).
- Гейт бандла в пределах:
  - старт 104 939 Б br (−341 к базе);
  - `chat-lead` 4 445 (+654: общий с калькулятором чанк `studio-contact` и ссылка на прямой контакт в форме);
  - `chat-account` 4 606; `chat-tools` 6 249.
- Grep приёмки `Plus|obuna|подписк|Day Pass` по `content/pages` находит:
  - строку защищённой `uz/gpt-uzbek-tilida.json` (про подписку официального ChatGPT) — это WP-12;
  - «obunachi/obuna bo‘lgan» (подписчики) на SMM- и Telegram-страницах и «сторонние подписки» в калькуляторе — это не продукт GPTBot.
- Browser pane, 375×812, локальный статический сервер `dist/`, `/api` отвечает 404, прод не трогал:
  - `/ru/ai-bot-dlya-kliniki/`: кнопка → карточка (`#contact` у верха экрана), кнопки 56 px, горизонтальной прокрутки нет, личной ссылки нет, в панели одна кнопка «Позвонить»;
  - `/ru/stoimost-chat-bota/`: в панели «Позвонить» и «Заявка»; ошибка заявки → «Свяжитесь с нами напрямую. Позвонить: +998 50 587 07 20», `tel:`, 44 px;
  - калькулятор: итог → «Отправить расчёт на e-mail»; ошибка заявки → то же письмо с расчётом;
  - `/ru/gpt-chat/` монтируется, ссылка в боковой панели ведёт на `@gptbotuz_bot`, ошибок консоли кроме 404 мока нет.

  Скриншоты в этой сессии не снимались (окно не отрисовывалось), поэтому проверка шла по DOM и вычисленным стилям.

**К релизу R3.**
1. Выкат вместе с WP-12 (он закрывает общие с защищёнными страницами шаблоны, см. ниже). `npm run build:production` → `deploy_runner.py check|deploy`.
2. Базу бандла перезаписать `--record` из сборки релиза в коммите квитанций R3, как решено в WP-10: `chat-lead` вырос на 654 Б.
3. После выката:
   - `gsc_tools.py sitemaps`;
   - IndexNow по 7 изменённым URL: `/ru/tarify-ai-chat/`, `/ru/gpt-chat-guide/`, `/uz/gpt-chat-qollanma/`, `/ru/javob/`, `/uz/javob/`, `/ru/gde-polzovatsya-gpt-besplatno/`, `/ru/gpt-na-russkom/`;
   - по желанию — по 101 B2B-странице (у них поменялись кнопки и футер).
4. **Владельцу:** проверить, что письма на `ceo@gptbot.uz` доходят. MX домена — Cloudflare Email Routing, сам адрес я не проверял. Носителю — вычитать новые узбекские строки (§8 плана, не блокирует).
5. **WP-12** вносит в `reviewedChanges` то, что гейт не видит: Markdown-копии `/uz/gpt-uzbek-tilida/` и 7 защищённых статей (хвост с телефоном и e-mail) и экран чата (B2B-карточка без Telegram, контакт после заявки). Кроме того, WP-12:
   - переводит общие с защищёнными страницами места на `studioTelegram`: футер и `<noscript>` чат-страниц; главную (`prerender-home.ts`, `src/components/Footer.tsx`, `src/lib/cta.ts`); шаблон блога (футер, панель, кнопка в шапке); обработчик кликов и цель Метрики `telegram_cta_studio` в `<head>` (`analytics-snippet.ts`, `analytics-metrika.ts` и копия в `index.html` байт в байт);
   - убирает поле `telegram`, `defaultCTA.href` и личный Telegram из `sameAs` в `site.json`;
   - затем удаляет исключения из теста `studio-contact`.

   Статьи блога (153) — в WP-12 вместе с их шаблоном или отдельным пакетом до заморозки R3; решает ведущий.

**Открыто.**
1. Блог и GPTBot Market по-прежнему ведут в личный Telegram (п. 7 отклонений).
2. Цель Метрики `telegram_cta_studio` на незащищённых лендингах больше не срабатывает: там нет студийного Telegram. Звонки по-прежнему считает `phone_click`, клики по e-mail не считаются.
3. Формы на 4 B2B-страницах WP-20 (`/ru/ai-bot-dlya-biznesa/`, `/uz/biznes-uchun-ai-bot/`, `/ru/gpt-dlya-biznesa/`, `/ru/luchshie-razrabotchiki-chat-botov-tashkent/`) — по-прежнему в WP-20. До него там карточка контактов.
4. В БД пакет по-прежнему пишется как `plan='plus'` (`billing-store.ts`) — это WP-13 (L16).

**Дальше.** WP-12 (релиз R3): одна ревизия защищённых страниц, включая общие шаблоны из списка выше.

---

# Платный AI-чат к проду: ревью WP-10, 2026-10-01

**Итог.** Проверил коммиты WP-10 `d7ab468c` (код) и `9c09e8c6` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md` (§1: проверки и пороги бандла; §3, строка R3; §4, WP-10), картой `03` (§0 п. 6, §7) и `AGENTS.md` §2–8, §11. Перед началом рабочее дерево было чистым на `9c09e8c6`: перезапуск приложения незаконченной работы не оставил. Ничего не запушено и не задеплоено. Cloudflare, D1, GSC, боты и вебхуки не менялись.

**Сделано верно:**
- `build.manifest: true`. `prerender.ts` берёт entry чата, калькулятора и лендинга из `dist/.vite/manifest.json`. На обеих страницах чата ровно один модульный скрипт, и это entry из манифеста.
- Гейт `chat-bundle-budget.ts` считает старт как замыкание статических импортов entry, а каждую часть `import()` — как то, что она добавляет к старту. Сжатие brotli q11. Пороги: старт ≤ 110 000, часть ≤ 12 000, рост ≤ 3 000. Гейт падает, если часть исчезла. Сборка `c097e937` его не проходит: 113 990 Б, +8 739.
- Гейт стоит в `release-preflight` (только после удачной сборки) и в `pages-production.ts` (stamp, check, check-production, deploy). Последний вызывает `deploy_runner.py`.
- Части грузятся по требованию. Browser pane на локальном моке: на старте 6 файлов, `chat-account` приходит при открытии. Если закрыть окно во время загрузки и открыть снова, оно появляется сразу, а запрос был один.
- 104 перенесённых значения RU/UZ совпадают с `c097e937`. Ни один ключ не потерян, неиспользуемых нет.
- `use-account.ts` — прежняя логика данных без изменений. Ключ запроса оплаты и отказ из-за новых условий переживают закрытие окна (`memoryRef`), поэтому повтор вернёт тот же счёт. Сломанную часть изолирует `PartBoundary`.
- Затронуты только клиент и сборка: нет SQL, миграций, настроек, серверных файлов, Javob и админки. Поэтому `org_id`, серверная идемпотентность, PII и паритет миграций не затронуты.
- Отклонения исполнителя обоснованы.

**Один дефект, исправлен.** Карточка «Для бизнеса» (`chat-lead`) скачивалась при каждом открытии инструмента «Бизнес». Это происходило и в тот день, когда посетитель уже закрыл карточку, хотя тогда она не покажется. Так нарушалось правило самого WP-10: «никто не скачивает то, что не сможет открыть». Теперь решает `preloadsBusinessCard` в `src/gpt-chat/preload.ts`. Она смотрит на те же два факта, что и `showOffer`: инструмент и `offerDismissed`. Тест — в `tests/gpt-account-ui.test.ts`. Browser pane: после закрытия карточки и перезагрузки инструмент «Бизнес» грузит только `chat-tools`, без закрытия — `chat-tools` и `chat-lead`.

**Бандл после исправления** (brotli q11, байты): старт 105 280 (+29), `chat-account` 4 583, `chat-lead` 3 791, `chat-tools` 6 241. База `docs/paid-chat/bundle-baseline.json` перезаписана из этой сборки: это кандидат R3 после ревью.

**Открытые вопросы, R3 не блокируют:**
1. `assertCleanRuntime` не проверяет файлы в `docs/`. Поэтому база бандла, перезаписанная `--record` и не закоммиченная, проходит guarded-деплой. Так же устроен JSON базы `seo-protection`. На R3: записывать базу только коммитом и деплоить из чистого дерева. Позже одна правка релизного скрипта может добавить оба входа гейтов в проверку чистого дерева.
2. `PartLoading` — пустой `div` с `role="status"` и `aria-label`. Скринридеры его обычно не читают: живая область озвучивает содержимое, а не имя. В окне скринридер прочтёт заголовок, а рамка инструмента молчит, пока часть грузится. Текст `sr-only` внутри стоит добавить в WP-17, который перерабатывает окно.
3. После закрытия и повторного открытия окна пакета сбрасываются галочки согласия и оферты и состояние «занято». Раньше они жили в панели, которая не размонтируется. Ключ запроса и отказ по условиям сохраняются, поэтому повторного списания нет.
4. `/.vite/manifest.json` публичен. Это задокументировано, WP-12 вносит его в `reviewedChanges`.
5. Новые узбекские строки `partLoading`, `partFailed` и `partReload` должен вычитать носитель.

**Проверки ревью.**
- `tsc -b` 0; `typecheck:functions` 0. Отдельный `tsc --noEmit` новых и изменённых скриптов и тестов: в их строках WP-10 и ревью ошибок нет. Ошибки в `release-preflight.ts:234-235`, `gpt-billing.test.ts:249` и в подтянутых файлах без типов Workers появились до WP-10.
- ESLint изменённых файлов 0; `git diff --check`, `scan:secrets`, `test:secret-scan` 16 и регэксп токена Telegram — чисто.
- Тесты, по одному файлу:
  - `chat-bundle-budget` 9, `gpt-chat-lazy-part` 6, `gpt-chat-prerender-links` 9;
  - `gpt-account-ui` 14 (+1), `chat-entry` 4, `gpt-billing` 15, `gpt-chat-honesty` 11;
  - `gpt-chat` 19, `gpt-limit-state` 13, `gpt-chat-handoff-link` 11, `gpt-chat-stream` 11;
  - `pages-production-release` 8, `seo-protection` 3, `lead-radar-release-gate` 12, `yandex-metrika` 69, `gpt-readiness` 9;
  - `advertising-seo-content` 8, `homepage-crawler-shell` 5, `telegram-web-handoff` 22, `site-stylesheets` 5, `lead-capture-templates` 27;
  - `web-security-hardening` 13, `gpt-backend-security` 31, `seo-revenue-claims` 3, `gpt-account-storage` 6, `seo-analytics-privacy` 23.
- `npm run build:fast` → гейт бандла в пределах → `seo-protection check` 10/10 без изменений.

**К релизу R3** — без изменений по сравнению с разделом WP-10 ниже. Базу перезаписывают только в коммите и только если WP-11 или WP-12 изменят бандл чата. WP-11 меняет `src/gpt-chat/contact.ts`, поэтому старт сдвинется на десятки байт: это в пределах +3 КБ.

**Дальше.** WP-11 (релиз R3): незащищённые страницы без «Plus», одна цена, без личного Telegram. По L14 личные ссылки удаляются, контакт студии задаётся одной настройкой.

---

# Платный AI-чат: WP-10 — ленивые части чата и гейт бандла, 2026-10-01

**Итог.** Сделан WP-10 плана `10-PROD-PLAN.md` (релиз R3) на ветке `paid-chat/prod-readiness` поверх `c097e937` (WP-09 с ревью), коммит `d7ab468c` (`d7ab468c233a28d21f6d2cb8dd980ce6d31c6637`; следующий коммит только записывает этот SHA в STATE, правило D-006). Окно пакета, карточка «Для бизнеса» с формой заявки и инструменты из меню больше не грузятся на старте: каждая часть приходит отдельным файлом, когда она нужна. Стартовый JS чата уменьшился с 113 990 до 105 251 байт brotli (−8 739 Б, −7,7 %). Рост бандла теперь проверяет гейт `scripts/chat-bundle-budget.ts`. Он стоит в `release-preflight` после сборки и в guarded-релизе Pages (`release:pages:stamp|check|deploy`, его вызывает `deploy_runner.py`). Страница чата берёт свой скрипт из манифеста Vite, а не «первый файл с префиксом». Ничего не запушено и не задеплоено. Cloudflare, D1, GSC, боты и вебхуки не менялись. Миграций, настроек и серверных файлов нет. Защищённые страницы — 10/10 без изменений.

Работа началась в прошлой сессии и прервалась перезапуском приложения (около 07:52). Незакоммиченные правки (16 изменённых и 15 новых файлов, копия — `F:/Claude/gptbot-tools/backups/wp10-partial-20261001-0932/`) я проверил заново, а не принял на веру. Перенесённые строки побайтно совпадают с `c097e937`: сверка скриптом, 255 значений, 0 расхождений, ни одна строка не потерялась. Логика окна пакета перенесена без изменений поведения. Исправил две мелочи: `limited={limited}` вместо повторного `limit !== null` и порядок импортов в тесте. Затем досборка, замеры, проверка в браузере и документы.

**Что сделано.**
1. **Три ленивые части** (`src/gpt-chat/lazy-part.tsx`, модули `src/gpt-chat/parts/*`; имя модуля = имя чанка в манифесте):
   - `chat-account` — тело окна пакета `AiAccountWindow` (цена, вход через Telegram, кнопки оплаты, активный пакет, чеки, возврат) и его строки `account-strings.ts`. На старте остались данные аккаунта (`use-account.ts`: запрос, повтор, опрос при ожидающем платеже), кнопка в шапке и рамка Dialog. Поэтому кнопка и карточка лимита не ждут сети;
   - `chat-lead` — карточка «Для бизнеса» (`AiOfferCard`), форма заявки (`AiLeadForm`) и их строки `lead-strings.ts`;
   - `chat-tools` — `AiToolPanel`: шаблоны (`templates.ts`, `PromptTemplateGrid`) и генератор промптов для картинок (`ImagePromptTool`).
2. **Пока часть грузится**, её место держит плашка `PartLoading` с `role="status"` («Загружаем…» / «Yuklanmoqda…»). Плашка стоит внутри уже открытого окна: 300 px для окна, 280 px для инструментов. Страница не прыгает, при `prefers-reduced-motion` анимации нет. **Если часть не пришла** (нет сети или новый релиз удалил файл), `PartFailed` пишет об этом и предлагает «Обновить страницу». Повторный `import()` того же файла бесполезен: браузер помнит неудачу. Чат вокруг работает. Карточка «Для бизнеса», которая не загрузилась, просто не показывается. Одна часть = один запрос, кто бы ни попросил первым. Неудачный запрос не запоминается. Часть, пришедшая заранее, рисуется сразу, без кадра плашки.
3. **Предзагрузка** (`src/gpt-chat/preload.ts`). Окно пакета грузится заранее при остатке ≤ 2, при 429, при `?pay=return` и при ожидающем платеже. Условие: окно можно открыть (`showsAccountPill`). Сейчас оплата выключена, и никто не скачивает окно, которое не откроет. Карточка «Для бизнеса» грузится, как только посетитель открыл инструмент «Бизнес»: там она и появляется после третьего ответа.
4. **Гейт бандла** `scripts/chat-bundle-budget.ts`:
   - entry чата — из `dist/.vite/manifest.json`;
   - старт = entry + замыкание статических импортов (без `import()`);
   - ленивая часть = то, что она добавляет к старту, общие чанки входят в каждую часть;
   - brotli q11 по файлу.
   Пороги из §1 плана: старт ≤ 110 000 Б, каждая часть ≤ 12 000 Б, рост старта ≤ +3 000 Б против `docs/paid-chat/bundle-baseline.json`. Если часть из базы пропала, гейт падает: значит, её импортировали статически. Запуск: `npx tsx scripts/chat-bundle-budget.ts` (проверка), `--dist <dir>` (другая сборка), `--record "<источник>"` (новая база; запись над порогом запрещена).
5. **Скрипт страницы из манифеста.** `vite.config.ts`: `build.manifest: true`. `scripts/vite-manifest.ts`: `readViteManifest` и `entryScript`. `scripts/prerender.ts` берёт так все три entry (чат, калькулятор, лендинг) и падает, если манифеста или entry нет. Раньше страница тихо собиралась без скрипта.
6. **Где работает гейт:** `release-preflight` (`deep:chat-bundle-budget`, только после удачной сборки, иначе в `dist/` лежала бы прошлая) и `scripts/release/pages-production.ts` после `assertSeoProtection`.

**Бандл, brotli q11 (байты).** До — `c097e937`, собран из экспорта HEAD с `--manifest`; после — `npm run build:fast` этого коммита.

| | до | после |
|---|---|---|
| старт чата (entry + статические импорты) | 113 990 | **105 251** (−8 739) |
| `chat-account` (+ общий чанк иконки `check`) | — | 4 608 |
| `chat-lead` | — | 3 790 |
| `chat-tools` | — | 6 243 |

Состав старта после: `gpt-chat`, `vendor`, `turnstile` (rolldown слил в него бывший `utils`), `preload-helper`, `rolldown-runtime`, `yandexMetrika`. База записана из этой сборки. Оценка карты `03` §7 (≈105 КБ) подтвердилась.

**Отклонения от плана (и почему).**
1. Карточка лимита, `limit-state.ts` и `AiLimitTelegram` остаются на старте, как требует карта `03` §7: карточка должна появляться мгновенно. Radix Dialog тоже на старте, он нужен мобильному меню. Из пакета `chat-lead` нет «бизнес-строки» и «парсера контакта»: бизнес-строки ещё нет (WP-20), а проверка контакта живёт внутри `AiLeadForm` и уехала с ней.
2. Кроме `account-strings.ts` добавлен `lead-strings.ts`. Строки карточки и формы иначе остались бы на старте.
3. Гейт подключён ещё и в `pages-production.ts`. Настоящий релиз идёт через `build:production` → `release:pages:stamp` и `deploy_runner.py check|deploy`, а `release-preflight --deep` в этой цепочке не вызывается. Без второй точки гейт не охранял бы выкат.
4. В предзагрузку добавлен ожидающий платёж. Условие «окно можно открыть» — тоже добавлено, его нет в плане. `?pay=return` подключён заранее: параметр начнёт добавлять оплата в WP-13/WP-17.
5. Порог «+3 КБ за релиз» применяется к старту. Для частей действует абсолютный потолок 12 КБ и запрет на исчезновение части.
6. `findJsAsset()` для лендинга тоже перешёл на манифест. Его результат даёт только HTML-комментарий на money-страницах, но поиск по префиксу больше не используется нигде.
7. **Побочный эффект манифеста:** `dist/.vite/manifest.json` уходит в выкладку и будет доступен по `/.vite/manifest.json`. Там имена файлов из `/assets` (они и так публичны) и пути исходников `src/...`. Секретов нет, тот же класс данных, что и в публичном `gptbot-release.json`. Файл нужен `release:pages:check|deploy` на собранном `dist/`, поэтому убрать его из выкладки нельзя без переделки релизного скрипта.

**Тесты** (по одному файлу; новые и затронутые):
- новые: `chat-bundle-budget` 9 (логика на фикстуре манифеста, пороги на границе, общий чанк, часть в части, статический импорт = падение, чтение `dist/` и базы, граф исходников: со старта не достижим ни один модуль частей, гейт стоит после сборки), `gpt-chat-lazy-part` 6 (один запрос, неудача не запоминается, плашка → часть, три части рисуют то же, что раньше, RU/UZ);
- изменённые: `gpt-chat-prerender-links` 9 (+3: entry из манифеста при чанке с тем же префиксом, отказ без манифеста, каждая собранная страница чата грузит entry), `gpt-account-ui` 13 (+2: предзагрузка), `chat-entry` 4, `gpt-billing` 15, `gpt-chat-honesty` 11;
- соседние: `pages-production-release` 8, `gpt-chat` 19, `gpt-limit-state` 13, `gpt-chat-handoff-link` 11, `gpt-chat-stream` 11, `yandex-metrika` 69, `seo-analytics-privacy` 23, `advertising-seo-content` 8, `lead-capture-templates` 27, `site-stylesheets` 5, `seo-protection` 3, `gpt-readiness` 9, `web-security-hardening` 13, `gpt-account-storage` 6, `lead-attribution` 17, `seo-revenue-claims` 3, `gpt-chat-session-privacy` 3, `gpt-backend-security` 31, `secret-scan` 16, `lead-radar-release-gate` 12. Все зелёные. `chat-bundle-budget.test.ts`, `gpt-chat-lazy-part.test.ts` и `gpt-chat-prerender-links.test.ts` добавлены в `npm test`.

**Проверки.**
- `tsc -b` 0; `typecheck:functions` 0; новые скрипты и тесты — отдельный `tsc --noEmit` без ошибок в своих файлах; ESLint 28 изменённых файлов 0; `git diff --check`, `scan:secrets` и регэксп токена Telegram — чисто.
- `npm run build:fast` → `chat-bundle-budget` в пределах → `seo-protection check` — **10/10 unchanged**. На обеих страницах чата (`/ru/gpt-chat/`, `/uz/gpt-uzbek-tilida/`) ровно один скрипт — entry из манифеста.
- Browser pane, 375×812, локальный мок (`dist/` и поддельный `/api`, GTM и Метрика отрезаны, прод не трогал):
  - первая загрузка RU — только 6 стартовых файлов;
  - меню → «Бизнес»: пришли `chat-tools` и `chat-lead`, шаблоны на месте; после 3 ответов карточка «Для бизнеса» и форма заявки работают (заявку не отправлял);
  - с оплатой и 15 сообщениями окно грузится по клику, с остатком 2 — заранее; без оплаты при остатке 2 ничего не грузится;
  - 429 с оплатой: `chat-account` пришёл до клика, окно с карточки лимита открылось сразу;
  - медленный `chat-account` в UZ: плашка 300 px с заголовком «AI paket», фокус на «Yopish», затем окно на узбекском;
  - отказ `chat-tools` (404): «Не удалось загрузить этот раздел…» и «Обновить страницу», после обновления инструменты работают;
  - JS-ошибок нет, кроме заранее подстроенной 404 и ответа мока 429.
- Та же проверка на сборке `c097e937`: сдвиг прокрутки при выборе инструмента и чёрная полоса на скриншоте с фокусом в поле ввода есть и там, это не регресс WP-10.

**К релизу R3.**
1. `npm run build:production`. `deploy_runner.py check` теперь сам прогоняет гейт бандла; при отказе он печатает, какая часть и насколько вышла за порог.
2. WP-12 вносит в `reviewedChanges` то, чего гейт защиты не видит: новый `src` скрипта чата на `/ru/gpt-chat/` и `/uz/gpt-uzbek-tilida/` (entry из манифеста) и новый публичный файл `/.vite/manifest.json`. Запись — в `docs/seo/CHANGE_LOG_2026-10.md`.
3. После выката в Browser pane на проде: старт без чанков частей, части — по требованию, ошибок консоли нет.
4. База `bundle-baseline.json` — это кандидат R3. WP-11 и WP-12 код чата не трогают. Если всё же тронут, гейт покажет рост, и базу перезаписывают `--record` из сборки релиза в коммите квитанций R3.

**Дальше.** WP-11 (релиз R3): незащищённые страницы без «Plus», одна цена, без личного Telegram (L14, один контакт студии в конфиге).

---

# Платный AI-чат к проду: ревью WP-09, 2026-10-01

**Итог.** Проверил коммиты WP-09 `6d69b68d` (код) и `94028dc5` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md` (§1, решения L3, L4, L14, L16, L18, §3 строка R3, §4 WP-09), картой `03` (§2, §3.7, §4, §8) и `AGENTS.md` §2–8, §11. Перед началом рабочее дерево было чистым на `94028dc5`: после отключения света незаконченной работы ревью не осталось. Сделано верно:
- в `src/gpt-chat` и `functions/api/gpt` нет «Plus», «obuna», «подписк» и «GPTBot AI», grep плана стал тестом;
- бренд «GPTBot.uz» — в шапке, в поле ввода, над каждым ответом и в меню;
- строка «не продукт OpenAI» под полем ввода видна на любой ширине;
- на первом экране числа из `freeLimits` сервера, до ответа аккаунта чисел нет;
- предупреждение о часе берётся из `hourRemaining` (SSE `done` или JSON);
- кнопка пакета, цена, кнопки «мало осталось» и «после 10 ответов» видны только при `billingOpen`, входе или активном пакете (F4, F6). Все тексты окна — в i18n;
- мёртвые стадии карточки и ссылка UZ-потребителя на B2B-прайс удалены (F10);
- GA4: закрытый каталог в snake_case, одно событие на действие, параметры фильтрует `GA4_PARAMS` (ничего из того, что ввёл посетитель), `chat_opened` при монтировании;
- Метрика: `chat_opened` и `chat_limit_hit` из React раз за просмотр (и раз на причину), `lead_form_success` только после ответа сервера. Блок в `<head>` и `index.html` не менялись.

Изменения только на клиенте: SQL, миграций, настроек и серверных файлов нет, поэтому `org_id`, идемпотентность и паритет bootstrap не затронуты. Девять отклонений исполнителя обоснованы. `packHonesty` из карты `03` вернул бы «obuna»/«подписка» и уронил бы grep плана. Ему место в окне WP-17, с другой формулировкой. Нашёл два дефекта и исправил их в этом коммите. Ничего не запушено и не задеплоено; Cloudflare, D1, GSC, боты и вебхуки не менялись.

**Что исправлено.**
1. **«O‘zbekcha» в шапке русского чата обрезалась на 375 px.**
   - Как было. «AI-пакет» шире прежней подписи. Когда кнопка пакета есть (оплата включена или человек вошёл), ссылке «O‘zbekcha» не хватало 5 px, и `overflow-hidden` срезал слово на 375 px. Это ширина приёмки плана. Отчёт исполнителя «помещается на 375» проверял только горизонтальную прокрутку. В проде сейчас кнопки нет, но при включении оплаты или у вошедших дефект проявился бы.
   - Что теперь. Пока кнопка пакета на месте, до 389 px переключатель показывает код «UZ», как и всем ниже 375 px. Слово несёт «O‘zbekcha sahifa →» на первом экране. Правило в `premium.css`, через `:has()`. Без кнопки на 375 px слово остаётся. Замерено в Browser pane: 375 с кнопкой — «UZ», переполнения нет; 390 с кнопкой — «O‘zbekcha» целиком; 375 без кнопки — «O‘zbekcha».
2. **Русские счётчики не согласовывались с числом.**
   - Как было: в шапке «Осталось 1/2/3/4 сообщений сегодня», в строке остатка «Осталось 0 сообщения на сегодня», под полем «1 символов» и «22 символов до лимита».
   - Что теперь: `remaining`, `lowWarning` и `charsLeft` идут через `ru()`, которую WP-09 уже добавил для новых строк.
3. **STATE:** корневой `state_commit` указывал на коммит WP-08 (`fd0eebc0`), теперь на `94028dc5`.

**Тесты.** `gpt-chat-honesty` 10 → 11:
- согласование трёх русских счётчиков;
- правило переключателя на 389 px.

Проверено поломкой: с прежними строками и без правила оба теста падают.

**Проверки.**
- `tsc -b` 0; `typecheck:functions` 0; ESLint изменённых файлов 0.
- Тесты по одному файлу: `gpt-chat-honesty` 11, `gpt-chat` 19, `yandex-metrika` 69, `gpt-account-ui` 11, `gpt-chat-handoff-link` 11, `gpt-limit-state` 13, `chat-entry` 4, `site-stylesheets` 5, `seo-analytics-privacy` 23, `gpt-chat-stream` 11, `gpt-billing` 15, `gpt-uzum-payments` 17, `gpt-readiness` 9, `seo-revenue-claims` 3, `gpt-chat-session-privacy` 3, `web-security-hardening` 13, `seo-protection` 3, `gpt-backend-security` 31, `lead-attribution` 17, `secret-scan` 16.
- `npm run build:fast` → `seo-protection check` — **10/10 unchanged**.
- Browser pane, локальный мок (`dist/` и поддельный `/api`, прод не трогал), 375×812, RU:
  - 6 сообщений: `chat_opened` ×1, `message_sent` ×6, `ai_response_success` ×5, `limit_hit{hourly}` ×1;
  - после 4-го сообщения — «В этот час можно отправить ещё 1 сообщение»;
  - карточка часового лимита держится, вопрос остаётся в поле.
- `git diff --check`, `scan:secrets`, регэксп токена Telegram — чисто.

**Открыто (не блокирует R3).**
1. `packHonesty` (в окне пакета: «не ChatGPT, не OpenAI») — в WP-17, без слов «obuna» и «подписка».
2. UZ `premium.monthlyLimit` говорит «to‘plam», а продукт называется «AI paket». Текст зависит от Б1 и переписывается в WP-13.
3. `scripts/chat-entry-cta.ts` подписывает блок чата в статьях «GPTBot AI». Это пререндер статей вне `src/gpt-chat`, его нужно поправить в WP-11 или WP-12, когда будут трогать эти страницы.
4. `:has()` работает в Chrome 105+, Safari 15.4+ и Firefox 121+. В старых браузерах слово режется по-прежнему, и только пока видна кнопка пакета.

**Дальше.** WP-10 (релиз R3).

---

# Платный AI-чат: WP-09 — честный интерфейс и одна аналитика (D9), 2026-10-01

**Итог.** Сделан WP-09 плана `10-PROD-PLAN.md` (релиз R3, D9) на ветке `paid-chat/prod-readiness` поверх `023a629f` (WP-08 с ревью), коммит `6d69b68d` (`6d69b68dccdc1033a5cb6c87391343ad11d235d7`; следующий коммит только записывает этот SHA в STATE, правило D-006). В чате больше нет «Plus», «obuna», «подписка» и «GPTBot AI». Бренд — «GPTBot.uz». Под полем ввода на любом экране написано, что это не продукт OpenAI и что вопросы уходят зарубежным AI-провайдерам. На первом экране — лимиты сервера (15 в день и 5 в час). Пока пакет нельзя купить, нет ни кнопки, ни цены. GA4 получает одно событие на действие, Метрика — цели `chat_opened` и `chat_limit_hit`. Ничего не запушено и не задеплоено. Cloudflare, D1, GSC, боты и вебхуки не менялись. Миграций и настроек нет. Защищённые страницы — 10/10 без изменений. Изменились только React-экран и каталоги целей, блок Метрики в `<head>` тот же. Справка: `docs/paid-chat/ANALYTICS-RU.md`.

**Что сделано.**
1. **Тексты** (`src/gpt-chat/i18n.ts`, ключи из карты `03` §4, у которых есть экран):
   - `brand` = «GPTBot.uz» — в шапке, в поле ввода и над каждым ответом (раньше «GPTBot AI» и «GPTBot»);
   - `inputMicrocopy`: RU «Не продукт OpenAI · Вопросы отправляются зарубежным AI-провайдерам — не пишите личные данные», UZ «OpenAI mahsuloti emas · Savollar xorijdagi AI-provayderlarga yuboriladi — shaxsiy ma’lumot yozmang». На телефоне строка теперь 10 px вместо 9;
   - `emptyMeta(freeLimits)`: «до 15 сообщений в день и 5 в час» / «kuniga 15 ta, soatiga 5 tagacha xabar». Числа приходят от сервера. Пока `/api/gpt/account` не ответил, строка выходит без чисел. Для русского добавлено согласование `ru()`: «до 1 сообщения», «до 21 сообщения»;
   - новая `hourWarning(n)`: при 1 оставшемся сообщении в скользящем часе (`hourRemaining` из SSE `done` или JSON) показывается строка «В этот час можно отправить ещё 1 сообщение». Через час она гаснет;
   - пакет называется «AI-пакет» / «AI paket», с пакетом — «Мой пакет» / «Paketim». Изменены `title`, `price`, `benefits`, `offer`, `active`, `manual`, `terms`, `unavailable`, `historyNote`, `refunded` (UZ). Новые: `activeLine(n)`, `packFeatures`, `checking`, `accountCheck`, `termsChanged`, `termsMissing`, `resumeNote`, `resume`;
   - `disclaimer` без NVIDIA: отвечают модели сторонних компаний, название модели указано под ответом. `pricingLink`: RU «Тарифы AI-чата», UZ «Biznes bot narxlari»;
   - удалены 39 мёртвых ключей (5 из них с «Plus») и типы `QuickAction`/`PromptCategory`.
2. **Экран:**
   - строка `actionCost` под последним ответом («В Plus…») удалена;
   - строка платного: `premium.activeLine(remaining)` вместо «Plus · N»;
   - карточка `AiOfferCard` теперь только B2B. Мёртвые стадии `hourly/daily`, их ключи, `pricingHref` и ссылка «Tariflar» на B2B-прайс удалены (F10);
   - из `api.ts` удалена мёртвая `subscribe(…, 'plus')`, из CSS — `.gpt-brand-ai` и короткая/полная подписи кнопки.
3. **Пакет (F4, F6):**
   - `types.ts`: `billingOpen()` и `showsAccountPill()`. Кнопка в шапке есть, только если пакет можно купить, есть вход или действует пакет. В проде сейчас (гость, оплата выключена) кнопки нет;
   - ниже 360 px кнопка показывает только иконку, а слово остаётся её именем для скринридера (замерено на 320, 360 и 375);
   - в окне значок «GPTBot.uz» вместо «GPTBot Plus · Скоро». Карточка с ценой — только при `billingOpen`, её пункты берутся из `packFeatures`. Раньше при сбое аккаунта показывалась цена 20 000 сум;
   - все литералы окна перенесены в i18n;
   - кнопка у предупреждения о низком остатке и предложение после 10 ответов открывают окно только при оплате.
4. **GA4** (`analytics.ts`, карта `03` §8.1):
   - закрытый каталог `EV`, все имена в snake_case, параметры фильтрует `GA4_PARAMS` (тоже snake_case);
   - `chat_opened` — при монтировании, даже если аккаунт не ответил (F18);
   - `message_sent` — одно на сообщение, `source`: composer / template / answer_action / retry;
   - на ответ ровно одно из трёх: `ai_response_success{finish}`, `ai_response_error` или `generation_stopped`;
   - `limit_hit` — на каждый 429, `pack_viewed{from}` — на каждое открытие окна;
   - `checkout_started{provider,resume}`, `login_started`/`login_result`;
   - `telegram_cta_clicked{from,channel,with_session}` — одно на клик (было 5);
   - `generate_lead` — только после ответа сервера;
   - удалены 24 дубля (`GPTChatPageView`, `VisitChat`, `StartChat`, `SendPrompt`, `LimitReached`, `UpgradeClick`, `CopyAnswer`, `website_telegram_clicked` и др.). Полный список — в `ANALYTICS-RU.md`.
5. **Метрика:**
   - `YANDEX_GOALS` += `leadFormSuccess`, `chatOpened`, `chatLimitHit`;
   - новая `reachYandexGoalOnce(goal, key)`: цель уходит раз за просмотр, ключ остаётся на странице;
   - `YANDEX_METRIKA_GOALS` += `chat_opened`, `chat_limit_hit`;
   - форма лида в чате шлёт `lead_form_success` рядом с `chat_lead_success`, калькулятор — нет, поэтому лиды не считаются дважды;
   - блок в `<head>` и `index.html` не менялись. README счётчика (§4) дополнен: 14 целей и 6 рабочих.
6. **Тесты:**
   - новый `tests/gpt-chat-honesty.test.ts`, 10 тестов. Проверяет:
     - grep плана по `src/gpt-chat` и `functions/api/gpt`;
     - все строки обоих языков;
     - бренд в трёх местах (статический рендер);
     - микрокопию и CSS (её не прячут, шрифт ≥ 10 px);
     - `emptyMeta` и согласование;
     - кнопку и цену без оплаты;
     - рендер консоли без кнопки;
     - каталог GA4: snake_case и отсутствие дублей. Каждый вызов `track()` найден через TS AST: событие — из `EV`, параметры — из `GA4_PARAMS`, одно событие на клик Telegram;
     - что `track()` отбрасывает лишние поля;
   - `yandex-metrika`: +1 тест (`reachYandexGoalOnce`), каталог, цели из React, `lead_form_success` за `ok`;
   - `gpt-account-ui`: +1 тест (`billingOpen`, `pack_viewed{from}`);
   - `gpt-chat-handoff-link`: карточка только B2B;
   - `gpt-chat`: новые имена событий;
   - `npm test` += `gpt-chat-honesty`.
7. **Документы:** новый `docs/paid-chat/ANALYTICS-RU.md` (каталог, удалённые дубли, шаги владельца, проверка после деплоя); `docs/analytics/yandex-metrika-111312750/README.md` §4.

**Отклонения от плана и почему.**
1. **Не добавлены ключи экранов, которых ещё нет:** вход через бота (WP-16), `pay*`, `uzumCode`, `refundHint`, `payNote`, `paidInterest`, `limitPackCta` (WP-17). Не тронуты ключи, зависящие от Б1: `renew`, `monthlyLimit`, `scheduled` (WP-13). Ключ без экрана — мёртвый код, а WP-10 всё равно выносит строки аккаунта в `account-strings.ts`.
2. **`packFeatures`:**
   - без «20 в час»: часового лимита у пакета нет (L3, WP-05);
   - вместо «прерванные ответы не списываются» написано «оборвавшиеся из-за сбоя или на пределе длины не списываются». «Стоп» после 600 знаков списывается (L4);
   - «без автосписаний» уже стоит в подвале карточки (`manual`), второй раз не повторяется.
3. **`chat_opened` без `anonymous`:** при монтировании аккаунт ещё неизвестен, `anonymous` передаёт `message_sent`. `entry` — id входа вместо адреса статьи в `source`, потому что `source` теперь означает источник сообщения.
4. **`response_regenerated` стал `message_sent{source: retry}`.** `paywall_viewed` срабатывал и при восстановлении после перезагрузки, его заменил `limit_hit` на каждый отказ сервера.
5. **События окна сразу названы как в §8.1:** `pack_viewed`, `login_*`, `checkout_started{resume}`. К значениям `from` добавлены `account_check` и `login_failed`. `pay_return` появится с WP-17.
6. **`hourWarning` только при 1 оставшемся сообщении.** «Ещё 0» означает отказ, а его объясняет карточка лимита. С суточным предупреждением строка вместе не показывается.
7. **Строка под полем — без ссылки «Maxfiylik»** (по плану она приходит с WP-18). Карта `03` §3.7 просила выкатывать строку только с новой политикой, но план WP-09 её включает, а текст верен уже сейчас.
8. **Кнопка пакета ниже 360 px — только иконка, сноска на телефоне — 10 px.** «AI-пакет» шире «Plus»: на 360 px запас 4 px, на 320 без правила тап-зоны сжимались.
9. **L14 (личный t.me) в WP-09 не входит.** Карточка B2B по-прежнему ведёт на `STUDIO_TELEGRAM_URL`. В WP-11 это станет одной константой, и вместе с ней сменится handle цели `telegram_cta_studio` в блоке `<head>` и `index.html`. Футер — WP-12.

**Проверки.**
- `tsc -b` 0; `typecheck:functions` 0; ESLint 20 изменённых файлов 0.
- Тесты по одному файлу:
  - новые и изменённые: `gpt-chat-honesty` 10/10 (новый), `yandex-metrika` 69/69 (+1), `gpt-account-ui` 11/11 (+1), `gpt-chat-handoff-link` 11/11, `gpt-limit-state` 13/13, `gpt-chat` 19/19, `chat-entry` 4/4;
  - весь список `npm test` и соседние файлы — 70 файлов, 880/882. Падают только две известные датозависимые фикстуры `lead-radar`.
- Проверка «на красный»: 6 временных поломок ловятся:
  - бренд UZ снова «GPTBot AI»;
  - второй `track` в кнопке Telegram;
  - цена без `billingAvailable`;
  - нет `chat_opened` в Метрике;
  - нет `lead_form_success`;
  - ошибка в согласовании.
- Grep плана `Plus|obuna|подписк|GPTBot AI` по `src/gpt-chat functions/api/gpt` — 0 строк.
- `npm run build:fast` → `seo-protection check` — **10/10 unchanged**.
- Стартовый JS чата (замыкание статических импортов, brotli q11): 116 446 → 114 052 байт, **−2 394 байт**.
- `git diff --check`, `scan:secrets` (3171 файл), `test:secret-scan` 16/16, grep токена Telegram — чисто.
- Локальная приёмка в Browser pane. Сервер — мок в scratchpad: `dist/`, поддельный `/api`, заглушка `ym`. Прод не трогал.
  - UZ, 375×812, оплата выключена:
    - шапка «GPTBot.uz», кнопки пакета нет;
    - на первом экране «kuniga 15 ta, soatiga 5 tagacha xabar», строка «OpenAI mahsuloti emas…» видна;
    - 6 сообщений: в `dataLayer` ровно `chat_opened` ×1, `message_sent` ×6 (номера 1–6, `source` composer), `ai_response_success` ×5 (`finish` stop), `limit_hit` ×1 (hourly). В Метрике — `chat_opened` и `chat_limit_hit`, по одному разу;
    - после 4-го сообщения — «Bu soat ichida yana 1 ta xabar…»;
    - под ответом нет строки про «Plus».
  - RU, оплата включена:
    - кнопка «AI-пакет» помещается на 375, 360 и 320 px (на 320 — иконка, 44 px), горизонтальной прокрутки нет;
    - окно: значок «GPTBot.uz», «AI paket: shu chatda ko‘proq javob», четыре пункта, `pack_viewed{from: header}`;
    - карточка лимита → «AI-пакет» → `pack_viewed{from: limit_card}`;
    - вход с пакетом: «Мой пакет», «AI-пакет · ответов осталось: N».
  - Ошибок в консоли нет, только сетевая запись самого 429.

**Для релиза R3 (вместе с WP-10…WP-12).**
1. Деплой обычный guarded, миграций и секретов нет.
2. WP-12 вносит в `reviewedChanges` изменения, которых гейт не видит: бренд в шапке, строку под полем, числа на первом экране, скрытую без оплаты кнопку, удалённый `actionCost`, дисклеймер меню, две цели Метрики из React. Блок `<head>` не менялся.
3. Владелец после выката (подробно — `ANALYTICS-RU.md`):
   - убрать второй тег GA4 в GTM `GTM-NLR4WFX8`;
   - зарегистрировать в GA4 параметры `reason`, `from`, `provider`, `source`;
   - создать в Метрике JS-цели `chat_opened` и `chat_limit_hit`.
4. Живая проверка: одно `message_sent` на сообщение, цель `chat_opened`.
5. Откат: `git revert` и guarded-деплой. Хранилище браузера не менялось.

**Открыто.**
1. Новые узбекские строки — `packFeatures`, `hourWarning`, `historyNote`, `disclaimer`, `inputMicrocopy` — нужна вычитка носителем (§8 плана, не блокирует).
2. 429 на кнопке под ответом всё ещё кладёт в поле служебный запрос (п. 4 ревью WP-06; WP-17).
3. Личный Telegram в карточке B2B и в форме лида — WP-11 (L14).

**Дальше.** WP-10 (релиз R3).

---

# Платный AI-чат к проду: ревью WP-08, 2026-10-01

**Итог.** Проверил коммиты WP-08 `75d542a1` (код) и `fd0eebc0` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md` (§1, решения L15 и D11 из §2, §4 WP-08, §5, §6), картой `04` (§3–7) и `AGENTS.md` §2–8, §11. Сделано верно:
- попытки считаются после фильтра здоровья (`maxAttempts`: голос 2, текст 3). Цепочка — `freeTierChain` под общим бюджетом `free_paid`; пока `GPT_FREE_TIER_PAID_PRIMARY = "false"`, бот ходит только в `:free`;
- один дедлайн — 25 с от прихода апдейта (14 + 10 с), генерация с остатком меньше секунды не начинается. Обрезанный ответ не отправляется;
- в `javob_reply_failed` только код и коды замечаний валидатора, без текста;
- исход апдейта: `processing` → `done` или `failed:<код>`; повтор `update_id` ничего не меняет. Секрет вебхука сравнивается `sameSecret`, «Сначала» работает как `/new`;
- лимиты 10/100 берутся из конфига, запасной — `plans.free`; сутки и месяц по Ташкенту; без лимита — отказ (fail closed);
- ни в тексте, ни в клавиатуре, ни в профиле бота нет цен, тарифов и ссылок на оплату. Старые кнопки Tahlil отвечают нейтрально;
- 0067 меняет только данные и идемпотентна, сид bootstrap совпадает с её результатом;
- `javob-setup` проверяет Bearer до чтения тела, на защищённого бота отвечает 409 до записи, вебхук и токен не трогает. Проба `?target=javob` возвращает только коды.

Отклонения исполнителя обоснованы. Нашёл один дефект и исправил его в этом коммите. Ничего не запушено и не задеплоено; Cloudflare, секреты, GSC, вебхуки и боты не менялись; D1 не читалась.

**Что исправлено.**
1. **`bot_silent` будил бы владельца каждый час до суток подряд.**
   - Как было. Алерт писался строкой в час, а окно сторожа — сутки. Допустим, у человека три ответа подряд не прошли валидатор, и больше боту никто не пишет (у бота один активный человек за неделю). Тогда условие остаётся истинным на каждом прогоне сторожа до следующего дня, и владелец получил бы до 24 срочных сообщений.
   - Что теперь. `bot_silent` — дневной алерт, как `openrouter_key_credit_low` (`alert-policy.ts`, `DAILY_ALERTS`): одна строка и одно сообщение в сутки UTC.
- **Тест:** `gpt-watchdog` 14 → 15. Сторож запускается в T0, T0 + 1 ч и T0 + 5 ч и каждый раз видит `bot_silent`, а строка и сообщение — одни. Проверено поломкой: без правки тест падает.
- **Документы:** в `ALERTS-RU.md` и `BOT-RU.md` написано, что `bot_silent` приходит не чаще раза в сутки. В `BOT-RU.md` блок пробы теперь сам создаёт файл заголовка: раньше `$h` брался после `rm -f`. Число запросов указано верно: текстовый прогон — до 6, голосовой — до 2.

**Что перепроверил.**
- `tsc -b` 0; `typecheck:functions` 0; ESLint изменённых файлов 0.
- Тесты по одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`): telegram-assistant 76/76, telegram-web-handoff 22/22, gpt-watchdog 15/15, gpt-model-policy 14/14, gpt-chat-budget 10/10, gpt-operations 7/7, runtime-config 4/4, pages-config-parity 7/7, openrouter-model-catalogue 5/5, gpt-routing 6/6, gpt-chat 19/19, gpt-hash-salt 11/11, telegram-channel-compat 1/1, functions-type-safety 38/38, gpt-zai-provider 18/18, secret-scan 16/16.
- `npm run build:fast` → `seo-protection check` — **10/10 unchanged**.
- `git diff --check`, `npm run scan:secrets` и регулярка токена Telegram по diff — чисто.

**Открыто (R2 не блокирует).**
1. Сторож, которого запускает неудачный ответ (`alertOperator` с `watchdog: true`), ещё не видит этот апдейт: тот в `processing` меньше 2 минут. Поэтому `bot_silent` поднимет крон — не больше чем через 15 минут.
2. Проба `javob` гоняет четыре пути одновременно. Модель `:free` может ответить 429 на этот всплеск и уйти на паузу на минуту. Если в пробе `rate_limit`, повторите её один раз, прежде чем верить.
3. Человеку, который исчерпал месячный лимит, `/plans` пишет «обновляется в 00:00». Точный срок (1-е число) есть в сообщении о лимите.
4. Прежние пункты из раздела WP-08 ниже: платная основная — только с кредитами OpenRouter; ответ длиннее 3000 символов режется без пометки; `/delete_me` обнуляет лимит; WP-16 правит тот же `handler.ts`.

**Для релиза R2** — шаги из раздела WP-08 ниже и `BOT-RU.md`, без изменений.

**Дальше.** Выкат R2 (WP-07 + WP-08) по `SALT-RU.md` и `BOT-RU.md`, затем WP-09.

---

# Платный AI-чат: WP-08 — бот @gptbotuz_bot отвечает снова, без цен и ссылок на оплату (P0, D11), миграция 0067, 2026-10-01

**Итог.** Сделан WP-08 плана `10-PROD-PLAN.md` (релиз R2, решения L15 и D11) на ветке `paid-chat/prod-readiness` поверх `9ae4f01b` (WP-07 с ревью), коммит `75d542a1`. Причина молчания бота с 13.09 (карта `04` §3.1): голосовой путь резал цепочку до одной модели **до** фильтра здоровья, а первой стояла удалённая MiniMax, которую сайт каждый час ставил на паузу, — запрос не уходил вовсе. Теперь попытки считаются после фильтра, сбои видны владельцу и сторожу, у апдейта есть исход, в боте нет цен, тарифов и ссылок на оплату. Ничего не запушено и не задеплоено. Cloudflare, секреты, GSC, вебхуки и боты не менялись; Bot API не вызывался; D1 не читалась. `GPT_BOT_HANDOFF_ENABLED` остаётся `"false"` (R2.1). Runbook: `docs/paid-chat/BOT-RU.md`.

**Что сделано.**
1. **Путь ответа** (`functions/lib/telegram/service.ts`):
   - цепочка бота — `freeTierChain` (бывший `siteFreeChain`, теперь экспортирован): платная основная только при `GPT_FREE_TIER_PAID_PRIMARY` и только из общего суточного бюджета (`freePaidBudget`, `gpt_model_spend.bucket = 'free_paid'`, как у бесплатных на сайте), затем `:free`. Без D1 бюджета нет, и цепочка только `:free`. Перед ходом `ensureBillingSchema` (схема бота не создаёт `gpt_*`);
   - `chatComplete(…, maxAttempts)` (`openrouter-chat.ts`): потолок запросов ниже `MAX_ATTEMPTS`, считается после `availableModels`. Голос — 2 запроса, текст — 3;
   - один дедлайн: работа моделей кончается через 25 с после прихода апдейта (`receivedAt` из `assistant.ts`), первая генерация ≤ 14 с, повтор после валидатора ≤ 10 с, генерация с остатком < 1 с не начинается (первая → `timeout`, повтор → `validation_failed`). Голос: одна генерация ≤ 10 с без повтора;
   - ответ, обрезанный по `max_tokens` (`finish_reason = length`), не отправляется: код `truncated`;
   - `issues` — коды замечаний валидатора без `detail`; алерты OpenRouter (402, исчерпанный бюджет) пишутся как с сайта.
2. **Обработчик** (`handler.ts`): `handleUpdate` возвращает исход `done | failed:<код>` (`failed:exception` при исключении); неудачный ответ → событие `javob_reply_failed {code, issues}`, «не удалось» с «Повторить / Сначала», затем `alertOperator('bot_<код>', {watchdog:true})` (кроме `content_refused`, `bad_request`); `restart:` = `/new`; голос — `maxAttempts: 2`, 10 с.
3. **Исход апдейта** (`store.ts`, `assistant.ts`): `claimUpdate` пишет `processing`, `finishUpdate` — `done` или `failed:<код>` (только из `processing`, повтор не перезаписывает). Секрет вебхука сравнивается `sameSecret` (постоянное время).
4. **Сторож и алерты:** `watchdog-store.ts` += `bot_silent`: за 24 ч ≥ 3 апдейта `failed:*` или `processing` дольше 2 минут и 0 `javob_reply_generated` (таблицы бота без `org_id` читает только `gptbot-consumer`; базы без них — нули). `alert-policy.ts`: вместо `bot_*` срочные только `bot_no_key`, `bot_account_unavailable`, `bot_model_unavailable`, `bot_models_cooling`, `bot_silent`, с текстами.
5. **Лимиты (L15):** `TELEGRAM_FREE_DAILY_LIMIT = "10"`, новый `TELEGRAM_FREE_MONTHLY_LIMIT = "100"` (JSON и таблица `wrangler.toml`, `RUNTIME_CONFIG_KEYS`, `_types.ts`; JSON ≈ 3,4 КБ из 5,12). Незаданное или мусорное значение берётся из `plans.free`. Сутки и месяц — по Ташкенту (`tashkentPeriodStarts`), дневной Tahlil тоже.
6. **D11** (`i18n.ts`): `/plans` — лимит, когда он обновится и сколько осталось сегодня; `HELP` «/plans — лимит / limit»; `limitReached` (день / месяц) без тарифа; удалены `limitKeyboard`, `PRICING_URL`, `ANALYSIS_PAYWALL`, `analysisPaywallKeyboard`, `ANALYSIS_PAYMENT_PENDING`, `ANALYSIS_LATER`, кнопка «Подробнее» у отчёта Tahlil, `listActivePlans`/`PlanRow`; старые `analysis_details|analysis_pay_intent|analysis_later` → `ANALYSIS_NO_DETAILS`, `payment_intent` больше не пишется. Сид `schema.ts`: `day_pass`, `plus` — `is_active = 0`.
7. **Миграция** `migrations/0067_javob_plans_retire.sql`: `UPDATE plans SET is_active = 0, updated_at = … WHERE code IN ('day_pass','plus') AND is_active <> 0`; rollback в шапке.
8. **Профиль бота:** новый `functions/lib/telegram/bot-profile.ts` (команды и описания RU по умолчанию и UZ; `plans — лимит / limit`), его читают `scripts/telegram-setup.ts` (тексты сверены побайтно с прежними, guard не тронут) и новый `POST /api/internal/javob-setup` (Bearer `GPT_BILLING_MAINTENANCE_SECRET` до чтения тела; без тела — только `getMy*` и сверка, `{"apply":true}` — `setMy*` RU и UZ и сверка; защищённый бот → 409 до записи; вебхук не трогает; токен в ответ не попадает).
9. **Проба** `POST /api/internal/gpt-model-probe?target=javob`: `runJavobValidated` на постоянном UZ и RU сообщении, текст и голос; в ответе только коды, модель, `retried`, `latencyMs`.
10. **Документы:** новый `docs/paid-chat/BOT-RU.md`; `ALERTS-RU.md` (коды бота, `bot_silent`), `MODELS-RU.md` (бот на `freeTierChain`, `maxAttempts`; таблица цепочек была в порядке до R1 — исправлена).

**Отклонения от плана (и почему).**
1. Бюджет — существующий `bucket = 'free_paid'`, а не `free`: тот же суточный $1, что у сайта (L15 требует общий).
2. Код «все на паузе» — `models_cooling` из WP-03, а не `all_cooling_down` из карты.
3. Алерты идут через `alertOperator` (запись + сторож + доставка), как у чата, а не только `recordServiceAlert`; срочными оставлены 5 кодов вместо `bot_*`: иначе каждый единичный `rate_limit` или `validation_failed` будил бы владельца (логика D6).
4. `bot_silent` считает апдейты с ошибкой или оборванные, а не все входы: вход без положенного ответа (лимит, уточняющий вопрос, короткое голосовое, `/start`) иначе поднимал бы ложную тревогу на сутки.
5. «≤ 28 с» реализовано как 25 с на модели от прихода апдейта: остаток нужен, чтобы сохранить и отправить ответ или ошибку. Голос получил 10 с вместо 8.
6. Добавлено из карты `04` §4 п.4: обрезанный ответ не отправляется (`truncated`).
7. По Ташкенту считается и месяц, и дневной Tahlil; лимит месяца получил свой текст (иначе обещание «в 00:00» было бы ложным).
8. `/plans` показывает и остаток на сегодня.
9. Проба `javob` пишет то же, что настоящий ответ (паузы моделей, бюджет, алерты OpenRouter), но не квоту и не `bot_<код>`: иначе это не проба пути бота.
10. `/delete_me` по-прежнему стирает `usage_ledger` и обнуляет лимит (карта `04` §5, «побочная мелочь») — вне WP-08.

**Проверки.**
- `npx tsc -b` — 0; `npm run typecheck:functions` — 0; ESLint изменённых файлов (24) — 0.
- Тесты по одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`): telegram-assistant 76/76 (было 61), telegram-web-handoff 22/22 (+1, настоящий SQLite: ответ после handoff мимо модели на паузе и срочный `bot_models_cooling` владельцу), gpt-watchdog 14/14 (+1), gpt-model-policy 14/14 (+1), functions-type-safety 38, gpt-zai-provider 18, runtime-config 4, pages-config-parity 7, openrouter-model-catalogue 5, gpt-chat-budget 10, gpt-routing 6, gpt-hash-salt 11, platform-events 20, telegram-channel-compat 1, gpt-operations 7, gpt-chat 19, gpt-chat-limits 13, gpt-readiness 9, gpt-chat-stream 11, gpt-chat-truncation 8, gpt-billing 15, gpt-backend-security 31, gpt-chat-bridge 42, secret-scan 16, gpt-uzum-payments 17, gpt-chat-runtime-schema 5, gpt-retention 4, gpt-chat-session-privacy 3, gpt-lead-outbox-endpoint 3, gpt-chat-handoff-link 11.
- Весь список `npm test` по одному файлу: 68 файлов, 861/863; падают только два известных теста `tests/lead-radar.test.ts` (фикстуры от 2026-08-24), как до WP-08.
- Мутации ловятся: обрезка цепочки до фильтра (голос при двух моделях на паузе), смещение Ташкента 0 (лимиты), отключённый `restart:`.
- `npm run build:fast` → `seo-protection check` — **10/10 unchanged**. `src/` и `content/` не менялись.
- `git diff --check`, `npm run scan:secrets`, регулярка токена Telegram по diff — чисто. `webhook.ts`, `TELEGRAM_BOT_TOKEN`, `scripts/seo-protection.ts`, `docs/seo/evidence` не тронуты.

**Для релиза R2 (ведущий; подробно — `BOT-RU.md`, шаги соли — `SALT-RU.md`).**
1. `migrations list --remote` — ровно `0067_javob_plans_retire.sql`; репетиция на копии (дважды, второй прогон без изменений) → `apply` → `SELECT code, is_active FROM plans` (`free 1`, остальные 0).
2. Guarded-деплой кода R2 (WP-07 + WP-08). Новых секретов WP-08 не требует; `TELEGRAM_FREE_*` приходят с `wrangler.toml`.
3. Проба `?target=javob`: 4 прогона `ok`, у голоса нет `models_cooling`.
4. `POST /api/internal/javob-setup` → проверка → `{"apply":true}` → `matches: true` (это и есть `getMyCommands`).
5. По желанию владелец за минуту шлёт боту текст и голосовое.
6. Через сутки — агрегаты из `BOT-RU.md`: в `javob_reply_failed` нет `rate_limit` от модели на паузе, в `telegram_updates.status` видны исходы.
7. R2.1: 7 дней ≥ 90 % ответов → `GPT_BOT_HANDOFF_ENABLED = "true"` → деплой.
- **Откат:** `git revert` + guarded-деплой; миграцию не откатывать (старый код покажет в `/plans` только Free).

**Открыто.**
1. Платная основная для бота включится вместе с сайтом (R1.1) только после покупки кредитов OpenRouter.
2. В сообщении бота длиннее 3000 символов текст по-прежнему обрезается до `TELEGRAM_MAX_OUTPUT_CHARS` без пометки (было и раньше; при `max_tokens` 1000 редкость).
3. WP-16 (вход через бота) правит тот же `handler.ts` — делать после R2.

**Дальше.** Выкат R2 (WP-07 + WP-08) по `SALT-RU.md` и `BOT-RU.md`, затем WP-09.

---

# Платный AI-чат к проду: ревью WP-07, 2026-10-01

**Итог.** Проверил коммиты WP-07 `2c2f0348` (код) и `4d5f14bd` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md`: §1, решение L8 из §2, §4 WP-07, §5 и §6, картой `01` §1.8 и `AGENTS.md` §2–8, §11. Сделано верно:
- старые хеши `sha256(ip)` и `sha256("tg:"+id)[0:32]` побайтно совпадают с прежним кодом при пустой соли, а в проде соли нет (карта `01`, факт 11). v2 — `h2_` + HMAC от старого значения. Соль короче 32 байт не считается;
- токен сессии не солится (L8), поэтому `ownsChat` и история переживают включение;
- перекей берёт только значения старого вида, `UPDATE` условные. Затрагивается только org `gptbot-consumer`, отказы сливаются в строку v2. Курсоры и аренда лежат в `gpt_billing_ops`, в ответе только числа;
- удаление переписки выключено, срок 7..3650 дней;
- `hashIp` во всех семи маршрутах получает конфиг. Настройки есть и в JSON, и в таблице `wrangler.toml`;
- тесты идут на настоящем SQLite, ожидаемые хеши считает `node:crypto` независимо от `hash.ts`;
- агрегат D1 (только чтение, только числа): все ходы, отказы, сессии, события бота и ссылки хранятся в старом виде (64 или 32 hex, у аккаунтов `acct_`), все времена — ISO с `Z`. Значит, сверка шага 7 может дойти до нуля.

Отклонения исполнителя обоснованы. Нашёл два дефекта и исправил их в этом коммите. Ничего не запушено и не задеплоено; Cloudflare, секреты, GSC и боты не менялись.

**Что исправлено.**
1. **Старый ключ, записанный сразу после `SINCE`, оставался навсегда.**
   - Как было. Перекей брал только строки до `SINCE`. Но запрос, который посчитал хеш за миг до `SINCE`, записывает строку чуть позже. Бот пишет событие ответа, когда модель ответила, — через секунды; ход чата — через миллисекунды. Такие строки со старым, перебираемым хешем не переводились никогда, а сверка шага 7 их не видела (`created_at < SINCE`).
   - Что теперь. Таблица просматривается до `SINCE` + 10 минут (`SETTLE_MS`), а готовой считается только после прохода, начатого позже этого момента. Если всё переведено раньше, курсор встаёт на `SINCE` + 10 минут, и следующий тик делает ещё один проход. Солёные значения не выглядят как старые, поэтому новые строки только читаются. Статус `done` теперь бывает не раньше `SINCE` + 10 минут. В сверку шага 7 `SALT-RU.md` добавлены `new_turns_unsalted` и `new_tg_events_unsalted`.
2. **Опечатка в `SINCE` выглядела как «ждём».**
   - Как было. Тик отвечал `waiting` и когда `SINCE` ещё впереди, и когда он пустой или записан без `Z`. Шаг 5 runbook считал `waiting` доказательством, что `SINCE` разобран. С опечаткой соль так и не включилась бы, а проверка это пропустила бы.
   - Что теперь. Новый статус `no_since`: соль есть, а `SINCE` пустой или с опечаткой. `waiting` — только валидный `SINCE`, который ещё не наступил. Шаг 5 `SALT-RU.md` и `ALERTS-RU.md` обновлены.
- **Тесты:** `gpt-hash-salt` 10 → 11. Новый тест поздних ключей: события бота через 2 и 40 секунд после `SINCE` и ход через 1 секунду; таблица готова только после `SINCE` + 10 минут. Плюс проверка `no_since` (без `SINCE` и без `Z`). Проверено поломкой: старая граница `SINCE` − 1 мс роняет 1 тест, отказ от прохода после `SINCE` + 10 минут — 2 теста.

**Что перепроверил.**
- `tsc -b` 0; `typecheck:functions` 0; ESLint изменённых файлов 0.
- Тесты по одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`): gpt-hash-salt 11/11, gpt-retention 4/4, gpt-operations 7/7, gpt-watchdog 13/13, runtime-config 4/4, pages-config-parity 7/7, secret-scan 16/16. До исправления на коде WP-07 также зелёные: gpt-chat-session-privacy 3, gpt-chat-bridge 42, telegram-web-handoff 21, gpt-chat 19, gpt-chat-limits 13, gpt-zai-provider 18, telegram-assistant 61, gpt-billing 15, gpt-readiness 9, gpt-uzum-payments 17, functions-type-safety 38, gpt-chat-runtime-schema 5, gpt-lead-outbox-endpoint 3, gpt-backend-security 31.
- `npm run build:fast` → `seo-protection check` — **10/10 unchanged**.
- `git diff --check`, `npm run scan:secrets` и регулярка токена Telegram по diff — чисто.

**Для релиза R2** — порядок из раздела WP-07 ниже. Изменилось:
- на шаге 5 ответ `no_since` значит, что `SINCE` надо исправить до его наступления;
- `done` бывает не раньше `SINCE` + 10 минут;
- в сверке шага 7 — два новых счётчика, все должны быть 0.

**Дальше.** WP-08 (бот @gptbotuz_bot и миграция 0067), затем выкат R2 по `SALT-RU.md`.

---

# Платный AI-чат: WP-07 — соль хешей с перекеем и удаление переписки (выключено), 2026-10-01

**Итог.** Сделан WP-07 плана `10-PROD-PLAN.md` (релиз R2, D7, решение L8) на ветке `paid-chat/prod-readiness` поверх `77720e11` (R1 в проде), коммит `2c2f0348`. Код готов к релизу R2 и в проде ничего не меняет, пока нет секрета `GPT_HASH_SALT` и не наступил `GPT_HASH_SALT_SINCE` (в `wrangler.toml` он пустой). Удаление переписки собрано и выключено (`GPT_MESSAGES_RETENTION_DAYS=""`). Ничего не запушено и не задеплоено. Cloudflare, секреты, GSC и боты не менялись. Из D1 прочитаны только агрегаты (числа строк и форматы дат) для оценки объёма перекея. Миграции в WP-07 нет: по §5 плана 0067 относится к WP-08. Runbook: `docs/paid-chat/SALT-RU.md`.

**Что сделано.**
1. `functions/lib/gpt-chat/hash.ts`:
   - старый хеш IP — `sha256(ip)` (соль больше не дописывается: в проде её никогда не было, значит, это ровно то, что лежит в D1);
   - v2 — `"h2_" + HMAC-SHA256(соль, старый хеш)`;
   - `hashIp(ip, cfg, now)` отдаёт v2 только при соли от 32 байт и `now ≥ SINCE`. Соль без `SINCE` — старый хеш и один `console.warn({"event":"gpt_hash_salt_since_missing"})` на изолят. `SINCE` принимается только как момент UTC с `Z`;
   - `hashToken(token) = sha256(token)` без соли (L8). Им пишут и сверяют `anon_token` `session.ts`, `history.ts` и `IdentityStore.ownsChat` (параметр соли у него убран).
2. `GptChatConfig` и `TelegramConfig` расширяют `HashSalt` (`hashSalt`, `hashSaltSince`) через общий `resolveHashSalt`. Вызовы `hashIp` в `chat`, `session`, `account`, `auth/start`, `handoff`, `lead`, `payments/uzum` передают конфиг. Псевдоним бота `pseudoUser(id, cfg, now)`: до `SINCE` — `sha256("tg:"+id)[0:32]`, после — `"h2_"` + 29 hex от HMAC(соль, старый псевдоним), длина 32.
3. Новый `functions/lib/gpt-chat/salt-rekey-store.ts` (`rekeySaltedHashes`):
   - работает только после `SINCE`. За тик — до 200 строк на таблицу, **сначала новые**, и не больше 400 строк на тик;
   - строка берётся, пока её значение имеет старый вид (64/32 hex). `UPDATE` условный по прочитанному значению, поэтому повтор ничего не меняет, а двойного ключа нет;
   - курсор на таблицу — `gpt_billing_ops` `salt_rekey:<таблица>` (0 = готово); аренда `salt_rekey` на 2 мин, снимается в конце тика;
   - таблицы: `gpt_turn_reservations.ip_hash` и `.subject` (без `acct_`, только org `gptbot-consumer`), `gpt_limit_hits.subject` (слияние со строкой v2 того же дня), `gpt_sessions.hashed_ip`, `telegram_events.pseudo_user`, `gpt_handoffs.claimed_by`, `gpt_events.claimedBy`; строки `gpt_usage_daily` до `SINCE` удаляются. Таблица, которой нет в базе, считается готовой;
   - в ответе только числа строк.
4. Новый `functions/lib/gpt-chat/retention-store.ts` (`purgeChatMessages`): пусто или `0` — выключено, иначе срок 7..3650 дней. Одним пакетом D1 — до 500 строк каждого вида: `gpt_messages`, `gpt_sessions.hashed_ip=NULL` (сама сессия остаётся), `gpt_usage_daily`.
5. `gpt-billing-maintenance.ts`: новые шаги `rekey` и `retention` между `maintenance` и `diagnostics`, плюс `ensureSchema` чата. Бюджеты шагов пересчитаны, в сумме 19 с < 20 с таймаута Worker'а: providers 6, watchdog 2, alerts 4,5, maintenance 2,5, rekey 2, retention 1, diagnostics 1. `maintainBilling` теперь чистит и закрытые окна `gpt_rate_limits` старше 2 суток.
6. Настройки: `GPT_HASH_SALT_SINCE` и `GPT_MESSAGES_RETENTION_DAYS` (пустые) — в `RUNTIME_CONFIG_KEYS`, `_types.ts`, JSON и таблице `wrangler.toml`. JSON 3 318 байт из 5 120.
7. Тесты: новые `tests/gpt-hash-salt.test.ts` (10) и `tests/gpt-retention.test.ts` (4), оба добавлены в `npm test`. Обновлены `gpt-chat` (hashIp), `gpt-chat-limits`, `gpt-zai-provider` (hashToken), `telegram-assistant` (pseudoUser). В `gpt-chat-session-privacy`, `gpt-chat-bridge` и `telegram-web-handoff` стоит соль как в проде после R2: 32 случайных байта и прошедший `SINCE`. Там проверяются несолёный `anon_token`, v2 `hashed_ip` и v2-псевдоним в `claimed_by`, `telegram_events` и `gpt_events`. Отдельный тест проверяет чистку окон `gpt_rate_limits`. Проверка мутациями: `ASC` вместо `DESC` и `DO NOTHING` вместо слияния отказов ловятся тестами.
8. Документы: новый `docs/paid-chat/SALT-RU.md` (схема, таблицы, настройки, шаги релиза, SQL сверки, откат, как включать удаление), в `ALERTS-RU.md` — шаги и бюджеты тика.

**Отклонения от плана (и почему).**
1. `gpt_events.payload_json.claimedBy` — плана нет. Событие `GPTChatHandoffClaimed` повторяет псевдоним бота, в проде таких строк 2. Без перекея там остались бы перебираемые Telegram id. Перекеивается через `json_set`.
2. `gpt_usage_daily` в перекее удаляется, а не перекеивается (так в карте 01 §4.1). Таблицу с 06.09 никто не пишет и не читает, в проде 123 строки со старыми хешами IP. Удаление по сроку (`retention`) тоже осталось, как в плане.
3. `gpt_rate_limits` не перекеивается (как в плане), но закрытые окна старше 2 суток теперь чистит шаг `maintenance`. Раньше их чистил только `lead.ts` на 2 % заявок, поэтому в проде лежат окна с 04.09 (11 старых хешей). Самое длинное окно — сутки.
4. Кроме пачек по 200 на таблицу введён потолок 400 строк на тик: так HMAC укладывается в лимит CPU Workers Free. Замерить CPU на превью нельзя, превью пишет в боевую D1. При нынешнем объёме (ходов 1314, сессий 719, событий бота 228) это около 7 тиков, 1 ч 45 мин. Быстрее — ручными вызовами эндпоинта (SALT-RU шаг 6).
5. В плане «передеплой того же коммита» после `secret put` + `SINCE`. Но `SINCE` живёт в `wrangler.toml`, поэтому передеплоится однострочный коммит конфигурации, как в R1.1. Секрет и `SINCE` вступают в силу одним деплоем.
6. `SINCE` без `Z` (местное время, дата без времени, `+05:00`) считается незаданным: опечатка оставляет старые хеши, а не включает соль в неожиданный момент.
7. Бюджеты шагов тика уменьшены (alerts 5 → 4,5 с, maintenance 4 → 2,5 с, diagnostics 2 → 1 с), чтобы новые шаги поместились в 20 с Worker'а без его передеплоя.
8. `anon_token` не перекеивается (карта 01 §4.1 его называла): по L8 токены не солятся.

**Проверки.**
- `npx tsc -b` — 0; `npm run typecheck:functions` — 0; ESLint изменённых файлов — 0.
- Тесты по одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`), затронутые и соседние — 28 файлов, 446/446: gpt-hash-salt 10, gpt-retention 4, gpt-chat-session-privacy 3, telegram-web-handoff 21, gpt-chat-bridge 42, gpt-chat 19, gpt-chat-limits 13, gpt-zai-provider 18, telegram-assistant 61, gpt-watchdog 13, gpt-operations 7, runtime-config 4, pages-config-parity 7, gpt-billing 15, gpt-uzum-payments 17, gpt-readiness 9, lead-attribution 17, lead-capture-templates 27, functions-type-safety 38, gpt-chat-stream 11, gpt-chat-truncation 8, gpt-chat-budget 10, gpt-routing 6, gpt-chat-handoff-link 11, gpt-backend-security 31, gpt-lead-outbox-endpoint 3, gpt-chat-runtime-schema 5, secret-scan 16.
- Весь список `npm test` по одному файлу: 68 файлов, 842/844; падают только два известных теста `tests/lead-radar.test.ts` (фикстуры от 2026-08-24), как до WP-07 (828/830 + 14 новых).
- `npm run build:fast` → `seo-protection check` — **10/10 unchanged**. `src/` и `content/` не менялись, бандл не менялся.
- `git diff --check` — чисто; `npm run scan:secrets` — чисто; регулярка токена Telegram по diff — 0; `webhook.ts`, `TELEGRAM_BOT_TOKEN`, `scripts/seo-protection.ts`, `docs/seo/evidence` не тронуты.

**Для релиза R2 (делает ведущий по команде владельца, подробно — `SALT-RU.md`).**
1. Деплой кода R2 (WP-07 + WP-08, миграция 0067 — из WP-08) с пустым `SINCE`. Тик отвечает `rekey.status = "off"`.
2. Соль: 32 случайных байта hex без перевода строки, в `C:/Users/Borinio/.config/gptbot-private/gpt-hash-salt.txt`. Запись через `wr.py --stdin … pages secret put GPT_HASH_SALT`. Не печатать, не удалять, не менять.
3. `SINCE` — ближайшие 00:00 UTC, до которых успеет деплой (не меньше часа запаса), вид `2026-10-03T00:00:00Z`. Пишется в JSON и в таблицу `wrangler.toml`, затем тесты `runtime-config` и `pages-config-parity`, коммит.
4. Guarded-деплой этого коммита. До `SINCE` тик должен отвечать `rekey.status = "waiting"`.
5. После `SINCE` — тики крона или ручные вызовы до `rekey.status = "done"`.
6. Через `SINCE` + 2 ч — агрегатный SQL из `SALT-RU.md` (шаг 7): все счётчики 0, включая `new_sessions_unsalted`.
7. Живая приёмка: 6-е сообщение — 429; заявка из чата с перепиской доходит; открытый до `SINCE` чат продолжает историю. Квитанция `R2-live-verification.json`.
- **Откат:** до `SINCE` — пустой `SINCE` и деплой; после `SINCE` — только исправление вперёд. Соль не удалять, `SINCE` не двигать.

**Открыто.**
1. Первые тики после `SINCE` — смотреть CPU шага `rekey` (Functions metrics или `wrangler pages deployment tail`). Если `failed: ["rekey"]` из-за CPU, уменьшить `TICK_ROWS`: курсоры продолжат с того же места.
2. Удаление переписки включают только по решению владельца и юриста о сроке и тем же релизом, что меняет текст политики (WP-18).
3. Админке (WP-19) в разделе «Готовность» стоит показывать `rekey.status` и `retention` из тика (без значений).

**Дальше.** WP-08 (бот @gptbotuz_bot и миграция 0067), затем выкат R2 по `SALT-RU.md`.

---

# Платный AI-чат: релиз R1 выкачен в прод, порядок бесплатных моделей, 2026-10-01

**Итог.** R1 (WP-00…WP-06, вершина `ba01fb53`) выкачен в прод 2026-10-01 ночью по поручению владельца («делай всё под ключ автономно»). Порядок выката — план §4 «R1: сборка и выкат»:
1. Экспорт D1 до миграций: `F:/Claude/gptbot-production-backups/paid-chat-R1-2026-09-30T20-29-34Z/before-0065-0066.sql`, 35 019 111 байт, sha256 `2687a1ed0eee0cbae2af7e0f6513b1bca7c573813dd3c865bc2f7fb2fa7bb0b9` (вне Git: содержит переписки).
2. Репетиция на копии этого экспорта (sqlite, foreign_keys off, одна транзакция): pending = 0065, 0066; первое применение — обе; второе — пусто; у существующих таблиц изменилось только число строк `d1_migrations` (65 → 67); `quick_check` ok; 20 колонок у `gpt_turn_reservations`; 4 индекса 0066 на месте. `wrangler d1 execute --local --file` на полном экспорте падает на `foreign key mismatch` (sotuvchi_categories), `scripts/release/d1-export-restore.ts` — на `statement_13105`: оба инструмента устарели для текущей схемы.
3. `d1 migrations list --remote` = ровно 0065, 0066 → `apply --remote` → read-only сверка: последняя 0066, ledger 67, 20 колонок, 4 индекса, view есть, новые таблицы пусты.
4. `build:production` → seo-protection 10/10, seo-audit 0 critical, `tsc -b` 0 → `deploy_runner.py check` pass → `deploy`: `deployed_and_verified`, манифест = `ba01fb53`.
5. Секрет `GPT_BILLING_MAINTENANCE_SECRET` (32 байта, сгенерирован агентом, хранится только в `C:/Users/Borinio/.config/gptbot-private/`) — в Pages (+ guarded-передеплой того же коммита) и в Worker `gptbot-automation`.
6. Worker: версия для отката — `770dc25f-0aad-472f-b452-23f4cbf92a84` (от 04.09, AUTOSEND=true — после отката сразу передеплой). Dry-run чистый (AUTOSEND "false", GPT_BILLING_MAINTENANCE_ENABLED "true"), deploy → версия `044002bc-2cbd-4328-b7b8-49c2b887fd54`, крон `*/15`.
7. Учебный алерт `{"drill":true}` → `alerts.status=sent` (коды `drill` и старый недоставленный `chat_model_unavailable` от прежнего кода).
8. Проба моделей: платные `gemma-4-26b-a4b-it` и `mistral-small-3.2` — 402 (`paid_credit_exhausted`: на OpenRouter нет кредитов — вход владельца, план §8 п.4); `gemma-4-31b-it:free` — 429 на всех вызовах; `nemotron-3-super:free` и `dots-3-note-preview:free` — 200, `reasoning_tokens` 0, TTFT ≈0,5–0,7 с.

**Изменение в этом коммите.** По правилу WP-03 (≤10% 429, иначе Gemma уходит с головы цепочки) бесплатная цепочка переставлена: `nemotron-3-super:free → dots-3-note-preview:free → gemma-4-31b-it:free` — в `wrangler.toml` (JSON и таблица), в дефолтах `functions/lib/gpt-chat/config.ts` (комментарий с датой пробы) и в ожиданиях тестов (`openrouter-model-catalogue`, `gpt-chat-budget`, `gpt-chat-truncation`, `telegram-assistant`). R1.1 (`GPT_FREE_TIER_PAID_PRIMARY=true`) **не включён**: нет кредитов OpenRouter.

**Проверки.** Тесты по одному файлу: openrouter-model-catalogue 5/5, gpt-chat-budget 10/10, gpt-chat-truncation 8/8, telegram-assistant 61/61, gpt-model-policy 13/13, gpt-chat 19/19, gpt-routing 6/6, gpt-zai-provider 18/18, gpt-operations 7/7, gpt-watchdog 13/13, gpt-chat-limits 13/13, runtime-config 4/4, pages-config-parity 7/7, gpt-readiness 9/9, gpt-chat-stream 11/11. `tsc -b` 0, `typecheck:functions` 0, ESLint изменённых файлов 0.

**Дальше.** Деплой этого коммита, живая приёмка R1 (429 hourly с `Retry-After`, карточка лимита на 375×812, тики `gpt_billing_ops`, Lead Radar молчит), квитанция `docs/paid-chat/releases/R1-live-verification.json`, затем WP-07/WP-08 (R2).

---

# Платный AI-чат к проду: сквозная проверка релиза R1 (WP-00…WP-06), 2026-10-01

**Итог.** Ветка `paid-chat/prod-readiness` проверена целиком на вершине `137ce909` (WP-00…WP-06 с ревью). Сверял с планом `10-PROD-PLAN.md`: §1 (проверки и «Релиз»), §3 (R1), §4 «R1: сборка и выкат», §5 и §6. Сборка, тесты, защищённые страницы, SEO, миграции и секреты в порядке. Нашлась одна поломка: `git diff --check origin/main..HEAD` падал на 21 строке. Все эти строки в `docs/paid-chat/uzum-spec/*.yaml`. Это дословные копии публичных спецификаций Uzum, где два пробела в конце строки означают перенос строки в Markdown. Исправлено новым `.gitattributes`: для этих трёх файлов снята проверка пробелов (`-whitespace`), а сами файлы остались побайтно такими, как у Uzum. Заодно уточнён комментарий в `tests/bormi-admin-moderation-ui.test.ts`: там было написано, что `.gitattributes` в репозитории нет. Теперь сказано, что он не задаёт концы строк. Код не менялся. Ничего не запушено и не задеплоено. Cloudflare, D1 (удалённая база даже не читалась), GSC и боты не менялись.

**Что проверено (результаты).**
1. `npx tsc -b` — 0 ошибок; `npm run typecheck:functions` — 0.
2. Тесты по одному файлу (`NODE_OPTIONS=--max-old-space-size=1400`):
   - затронутые R1 и контрольные: 30 файлов, 406/406. Среди них `gpt-billing` 15, `gpt-uzum-payments` 17, `gpt-zai-provider` 18, `gpt-chat-handoff-link` 11, `telegram-web-handoff` 21, `telegram-assistant` 61, `gpt-readiness` 9, `gpt-operations` 7, `gpt-routing` 6, `gpt-chat` 19, `gpt-chat-stream` 11, `runtime-config` 4, `pages-config-parity` 7, `openrouter-model-catalogue` 5, `seo-content-guards` 7, `gpt-watchdog` 13, `gpt-model-policy` 13, `gpt-chat-budget` 10, `gpt-chat-truncation` 8, `gpt-chat-limits` 13, `gpt-chat-runtime-schema` 5, `gpt-limit-state` 13, `gpt-account-ui` 10, `gpt-account-storage` 6, `lead-radar-worker` 17, `lead-radar-release-manifest` 11, `pages-production-release` 8, `secret-scan` 16;
   - весь список `npm test` по одному файлу: 66 файлов, 828/830;
   - один прогон `npm test` целиком: 828/830.
   - Оба раза падают только два известных теста в `tests/lead-radar.test.ts` (фикстуры от 2026-08-24). Код Lead Radar в R1 не менялся.
3. Сборка и SEO:
   - `npx vite build` и `npx tsx scripts/prerender.ts` — 0;
   - `seo-protection check` — **10/10 unchanged** (после остальных шагов `build:fast`, см. отклонение 1);
   - `npx tsx scripts/seo-audit.ts` — 121 страница, 0 critical;
   - стартовый JS чата (замыкание статических импортов, brotli q11) — 116 446 байт. Против 114,4 КБ до R1 это **+2,0 КБ br**, в пределах «≤ +3 КБ за релиз». Entry `gpt-chat` — 49 417 байт br.
4. Репетиция миграций 0065+0066 на локальной D1 (`wrangler d1 migrations apply --local`, отдельный конфиг с фиктивным id базы; `--remote` не использовался). Сделано два независимых прогона, результаты одинаковые:
   - 0001…0064 применены, затем синтетические строки: 2 сессии, 3 сообщения, 3 хода (1 `done`), 1 алерт, 1 заказ, 1 `gpt_billing_ops`;
   - `migrations list` показывает ровно 0065 и 0066;
   - `apply` №1: обе ✅. Ledger 65 → 67, таблиц 161 → 164, индексов 485 → 497 (7 именованных и 5 автоиндексов), представлений 0 → 1. У `gpt_turn_reservations` 20 колонок, у старых ходов `outcome` пустой. Новые таблицы пусты, представление видит 1 заказ;
   - `apply` №2: «No migrations to apply», все счётчики те же.
   - Сырое повторное выполнение SQL на копии (node:sqlite): 0065 идемпотентна. Повтор 0066 даёт `duplicate column name: outcome`, как и сказано в её шапке. Путь восстановления из шапки (только `CREATE`, дважды) проходит.
5. Паритет bootstrap. Сравнивал полную схему (колонки, индексы с `WHERE`, представления):
   - в порядке релиза (0001…0066, затем `ensureSchema` + `ensureBillingSchema` + `ensureUzumSchema`) bootstrap не меняет ни одного объекта R1;
   - при «коде раньше миграции» (0001…0064 + bootstrap) объекты R1 совпадают с миграциями один в один.
   - Вне R1 есть давний дрейф с `origin/main`, см. открытый вопрос 1.
6. `git diff --check origin/main..HEAD` — чисто после `.gitattributes`. `npm run scan:secrets` — чисто (3158 файлов). `test:secret-scan` — 16/16. Регулярка токена Telegram по `git diff origin/main..HEAD` и по рабочему дереву — 0 совпадений. `functions/api/telegram/webhook.ts`, `TELEGRAM_BOT_TOKEN`, `scripts/seo-protection.ts` и `docs/seo/evidence` не тронуты. `dist/` и `.serena/` не в Git. Прод `a61963f1` — предок HEAD.

**Отклонения от поручения.**
1. Цепочка `npx vite build ; npx tsx scripts/prerender.ts ; seo-protection check` из §1 плана даёт ложный красный. Проверка находит 10 изменений: блог «missing HTML» и `h1`/ссылки главной. Причина: `vite build` очищает `dist/`, а блог и главную пререндерят `prerender-blog.ts` и `prerender-home.ts`. После остальных шагов `build:fast` проверка показывает 10/10. Запускать её надо после `npm run build:fast` или `build:production`; guard деплоя так и делает.
2. На Windows локальная D1 wrangler отвечает «internal error», если путь к sqlite длиннее MAX_PATH (папка scratchpad). Поэтому репетиция шла в короткой `%TEMP%\r1d1`, после проверки папка удалена.
3. `wrangler deploy --dry-run` для Worker'а в этой проверке не запускал: поручение запрещает `wrangler deploy`. Его прогнал WP-01, он есть в чек-листе.

**Чек-лист выката R1 — только по команде владельца.** Git Bash, `cd F:/Claude/gptbot-gsc-audit-20260917`, `export NODE_OPTIONS=--max-old-space-size=1400`. Секреты не печатать, только имена. Порядок жёсткий: миграции до кода, превью до миграций не делать (превью пишет в боевую D1).
0. Предусловия:
   - push только с разрешения владельца;
   - `git status` без runtime-изменений (guard `assertCleanRuntime`);
   - `python F:/Claude/gptbot-tools/deploy_runner.py check` (линия прода: `a61963f1` — предок).
1. Резервная копия D1:
   - `npx wrangler d1 export gptbot-ai-drafts --remote --output F:/Claude/gptbot-tools/backups/d1-R1-<stamp>.sql`;
   - `sha256sum` этого файла.
2. Репетиция на копии экспорта. Отдельный `wrangler.toml` с фиктивным id и `migrations_dir`, `--persist-to` в короткой папке:
   - `wrangler d1 execute <db> --local --persist-to <dir> --file <export>`;
   - копировать 0065 и 0066;
   - `wrangler d1 migrations apply <db> --local --persist-to <dir>` дважды;
   - сравнить число строк (как в п. 4 выше).
3. Боевая D1:
   - `npx wrangler d1 migrations list gptbot-ai-drafts --remote` — в списке ровно `0065_gpt_uzum_payments.sql` и `0066_gpt_chat_runtime.sql`;
   - `npx wrangler d1 migrations apply gptbot-ai-drafts --remote`;
   - сверка только чтением: `npx wrangler d1 execute gptbot-ai-drafts --remote --command "SELECT (SELECT COUNT(*) FROM pragma_table_info('gpt_turn_reservations')) AS cols, (SELECT COUNT(*) FROM gpt_payment_orders_all) AS orders, (SELECT MAX(name) FROM d1_migrations) AS last"`. Ожидается `cols=20`, `last=0066_gpt_chat_runtime.sql`.
4. Сборка:
   - `npm run build:production` (внутри `build:fast`, админка и stamp);
   - отдельно `npx tsx scripts/seo-audit.ts` (0 critical) и `npx tsc -b` (0);
   - `npx tsx scripts/seo-protection.ts check` (10/10).
5. Деплой Pages:
   - `python F:/Claude/gptbot-tools/deploy_runner.py check`, затем `python F:/Claude/gptbot-tools/deploy_runner.py deploy`;
   - сверить `https://gptbot.uz/gptbot-release.json`: коммит = HEAD.
6. Новый секрет `GPT_BILLING_MAINTENANCE_SECRET` (Pages **и** Worker, одно значение, ≥ 32 байт, через stdin, `ALERTS-RU.md`):
   - `f="$(mktemp)"; node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$f"`;
   - `npx wrangler pages secret put GPT_BILLING_MAINTENANCE_SECRET --project-name ai-direct-pro-landing < "$f"`;
   - `npx wrangler secret put GPT_BILLING_MAINTENANCE_SECRET -c wrangler.automation.toml < "$f"`;
   - guarded-передеплой того же коммита: `python F:/Claude/gptbot-tools/deploy_runner.py deploy`. Секрет Pages вступает в силу только с деплоем.
   - Других новых секретов в R1 нет. `ZAI_API_KEY`, `UZUM_CREDENTIALS_JSON` и `GPT_CLICK_CREDENTIALS_JSON` даёт владелец позже (S1–S5). Канал алертов — существующие `GPT_NOTIFY_BOT_TOKEN`/`GPT_NOTIFY_CHAT_ID` или запасные `TELEGRAM_ASSISTANT_BOT_TOKEN`/`TELEGRAM_ADMIN_CHAT_ID`. Проверить только имена: `npx wrangler pages secret list --project-name ai-direct-pro-landing`.
7. Worker `gptbot-automation`. Его `[vars]` заменяются целиком: `LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED="false"`, `GPT_BILLING_MAINTENANCE_ENABLED="true"`.
   - `npx wrangler deployments list -c wrangler.automation.toml` — записать id версии для отката;
   - `npx wrangler deploy -c wrangler.automation.toml --dry-run --outdir <tmp>`;
   - `npx wrangler deploy -c wrangler.automation.toml`.
8. Учебный алерт:
   - `h="$(mktemp)"; printf 'Authorization: Bearer %s' "$(cat "$f")" > "$h"`;
   - `curl -sS -X POST https://gptbot.uz/api/internal/gpt-billing-maintenance -H @"$h" -d '{"drill":true}'`;
   - ожидается `alerts.status=sent`, `alerts.codes=["drill"]` и сообщение в Telegram не позже чем через 1 мин.
9. Проба моделей (`MODELS-RU.md`):
   - `curl -sS -X POST https://gptbot.uz/api/internal/gpt-model-probe -H @"$h"`;
   - `curl -sS -X POST https://gptbot.uz/api/internal/gpt-model-probe -H @"$h" -d '{"model":"google/gemma-4-31b-it:free","calls":20}'`;
   - затем `rm -f "$f" "$h"`;
   - приёмка: только `200`, `errors={}`; у `reasoningOff` `reasoningTokensMax=0`; `rate429` ≤ 0,1 у головы `:free` (иначе сменить голову в `OPENROUTER_MODEL_FREE*`, без кода); `ttftMsMedian` < `firstContentTimeoutMs`.
10. R1.1 — только если проба прошла и у OpenRouter есть кредиты:
    - `GPT_FREE_TIER_PAID_PRIMARY` → `"true"` в `wrangler.toml` в двух местах: в JSON `GPTBOT_RUNTIME_CONFIG_JSON` и во вложенной таблице `[vars.GPTBOT_RUNTIME_CONFIG]`;
    - `runtime-config` и `pages-config-parity` по одному файлу;
    - коммит, `npm run build:production`, `deploy_runner.py check`, `deploy_runner.py deploy`.
11. Приёмка после выката:
    - `LIMITS-RU.md`: 6 сообщений → 6-й ответ 429 `hourly` с `Retry-After`; карточка в Browser pane 375×812 RU/UZ держится;
    - через 30 мин в `gpt_billing_ops` есть `watchdog` и `catalogue` (агрегат);
    - capabilities Lead Radar: autosend выключен, 0 отправок за 24 ч;
    - через 24 ч агрегаты `MODELS-RU.md`: ответов ≥ 90 %, обрезанных ≤ 5 %, `SUM(actual_micro)` ≪ 1 000 000.
    - Флаг `enable_request_signal` действует на весь Pages-проект, поэтому после деплоя нужен короткий смоук чата со «Стоп».
12. Квитанция `docs/paid-chat/releases/R1-live-verification.json`, запись в журнал изменений (`docs/seo/CHANGE_LOG_2026-10.md`), коммит квитанций.
- **Стоп R1.1:** «без ответа» выше прошлой недели **или** расход > $1 три дня подряд → `GPT_FREE_TIER_PAID_PRIMARY="false"` и деплой в тот же день.
- **Откат R1:** `git revert` и guarded-деплой. Колонки и таблицы 0065/0066 остаются, `DROP` не делать. `wrangler rollback` Worker'а вернёт `AUTOSEND=true`, поэтому сразу после него снова деплой Worker'а с `false`.

**Открыто (не блокирует R1).**
1. Давний дрейф bootstrap и миграций (так уже на `origin/main`, R1 его не создавал). `ensureSchema` создаёт `gpt_handoffs`, `gpt_rate_limits`, `idx_gpt_handoffs_expires`, `idx_gpt_handoffs_session` и `idx_gpt_leads_contact`, которых нет ни в одной миграции. В проде они созданы рантаймом. Нужна ли аддитивная миграция «как есть» для ровного ledger — решение ведущего, отдельным WP.
2. В §1 плана цепочку проверки защищённых страниц стоит поправить на `npm run build:fast` → `seo-protection check` (отклонение 1).
3. Открытые вопросы ревью WP-00…WP-06 остаются как записаны ниже.

**Дальше.** Выкат R1 по команде владельца (чек-лист выше). Параллельно в ветке — WP-07.

---

# Платный AI-чат к проду: ревью WP-06, 2026-10-01

**Итог.** Проверил коммиты WP-06 `f7ed0f47` (код) и `ae080b2f` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md`: §1, решения L3 и L18 из §2, §4 WP-06, §5 и §6, картой `03` §2–§4 (F1–F3, F11–F13) и `AGENTS.md` §2–8, §11. Сделано верно:
- редьюсер лимита чистый. 429 ставит лимит с `retryAfterSec` или с запасным временем по причине, принятый ход его снимает. Панель аккаунта лимит бесплатного уровня не снимает, поэтому карточка больше не гаснет после хода и при фокусе (F1);
- `canSendNow`, тик 15 с, таймер на `retryAt`, `visibilitychange` и `focus`;
- лимит и остаток гостя в `sessionStorage`, один ключ на RU и UZ (L18). Черновик на 60 мин;
- карточка над полем для всех шести причин WP-05, «сегодня/завтра» по дате Ташкента, выходы только при `billingAvailable` и `botHandoff`, `aria-describedby`;
- SSE `done` с `truncated/charged/hourRemaining`, `retryAfterSec` из тела или `Retry-After`, `freeLimits` в `validAccountView` fail-closed, в текстах карточки нет названий тарифов;
- сервер, конфиг и миграции не менялись; бандл, защищённые страницы и документы в порядке.

Отклонения исполнителя обоснованы. Нашёл два дефекта и исправил их в этом коммите. Ничего не запушено и не задеплоено; Cloudflare, D1, GSC и боты не менялись.

**Что исправлено.**
1. **F11: после восстановления аккаунта пропадал разговор.**
   - Как было. Если `/api/gpt/account` не ответил дважды, чат работает как гость. Но аккаунт перечитывается после каждого хода. Первый же удачный ответ считался сменой личности: чат обрывал ответ, который ещё шёл, и заменял экран сохранённой историей. Вопрос и только что полученный ответ исчезали.
   - Воспроизвёл в Browser pane на локальном моке (два сбоя аккаунта, один ответ, затем удачное чтение): на экране осталась вчерашняя переписка, сегодняшние вопрос и ответ пропали.
   - Что теперь. Чистая функция `keepsShownConversation` в `storage.ts` решает так. Если чтения аккаунта падали, а на экране уже что-то есть (или ход идёт), и до сбоя страница не знала другую личность, то разговор остаётся. Ответ не обрывается, сессия та же. Экран становится сохранённым разговором этой личности, а прежний сохранённый уходит в «сохранённые чаты», как при «Новый чат». Любая другая смена личности (выход, другой аккаунт) по-прежнему обрывает ход и загружает историю новой личности. Чужие слова в чужую область хранения не попадают.
   - После исправления тот же прогон: вопрос и ответ на экране, история сохранена, вчерашняя переписка — в сохранённых чатах. Обычная загрузка по-прежнему показывает сохранённую историю, карточка лимита после 6-го сообщения держится при `focus` и `visibilitychange`.
2. **`pack_daily` переживал выход из аккаунта.**
   - Как было. Суточный лимит пакета (50) снять могло только время. После выхода гостевая панель его снять не могла. Вышедший посетитель ждал до 05:00 по Ташкенту под текстом про пакет, хотя бесплатный уровень сервер считает отдельно.
   - Что теперь. Если панель показывает, что пакета с остатком нет (вышел, пакет кончился или истёк), `pack_daily` снимается, а следующий ход решает сервер. Если сервер насчитал и бесплатный день до нуля, сразу ставится `daily`. Лимиты бесплатного уровня панель по-прежнему не снимает (F1).
- **Тесты:** `gpt-limit-state` +1 (суточный лимит пакета), `gpt-account-storage` +1 (правило восстановления, 10 случаев), `gpt-account-ui` +1 (проводка). Каждый проверен «на красный» поломкой: `pack_daily` снова держится без пакета; правило без проверки прежней личности; ветка восстановления снова загружает историю.

**Что перепроверил.**
- `tsc -b` 0; `typecheck:functions` 0; ESLint изменённых файлов 0.
- Тесты по одному файлу, после исправления: `gpt-limit-state` 13/13, `gpt-account-ui` 10/10, `gpt-account-storage` 6/6, `gpt-chat-stream` 11/11, `gpt-chat` 19/19, `chat-entry` 4/4, `gpt-billing` 15/15, `gpt-chat-handoff-link` 11/11, `gpt-uzum-payments` 17/17, `web-security-hardening` 13/13, `yandex-metrika` 68/68, `gpt-readiness` 9/9, `gpt-chat-limits` 13/13, `runtime-config` 4/4, `pages-config-parity` 7/7, `seo-protection` 3/3.
- `npm run build:fast` 0; `seo-protection check` 10/10. Стартовый JS чата 116 446 байт br: +35 байт за это исправление, +1 832 байт за WP-06 целиком (в пределах +3 КБ).
- `scan:secrets` чисто (3157 файлов), `test:secret-scan` 16/16, grep токенов пуст, `git diff --check` чисто.

**Открыто (не блокирует R1).**
1. **Сбой чтения аккаунта у уже известной личности** (например, при фокусе) по-прежнему очищает экран и обрывает идущий ответ. Так было и до WP-06, но теперь чат в этом состоянии работает, и это заметнее. Причина: тот же `onAccount(null)` вызывает выход из аккаунта, где очистка нужна. Решение: различать их (например, флаг «вышел» от кнопки выхода) и при сбое экран не трогать.
2. После восстановления ответ, который шёл в этот момент, сохраняется в историю со следующим ходом, а не сразу. Так задумано: у этого хода нет области хранения.
3. Черновик лежит в `localStorage`, лимит — в `sessionStorage`. Вторая вкладка без лимита при открытии удаляет общий черновик. В первой вкладке вопрос остаётся в поле, но её перезагрузку уже не переживёт.
4. 429 на кнопке под ответом («Продолжить», «Перевести» и др.) кладёт в поле весь служебный запрос: инструкцию и до 1 900 знаков ответа. Это буква плана (`setInput(trimmed)`). WP-09 или WP-17 могут вместо этого запоминать само действие.
5. Остальное — как у исполнителя ниже: WP-09, WP-17 и вычитка узбекских строк.

**Дальше.** WP-07.

---

# Платный AI-чат к проду: WP-06 — карточка лимита держится (UI), 2026-10-01

**Итог.** P0 закрыт. Раньше карточка часового лимита гасла примерно через 0,4 с после 429, а также при каждом фокусе окна. Причина: обновление панели аккаунта снимало лимит по устаревшему остатку. Теперь лимит ставит и снимает только сервер, а панель аккаунта его не трогает. Вопрос возвращается в поле ввода и переживает перезагрузку. Карточка стоит над полем и говорит, когда снова можно писать: «через N мин», а для суток «сегодня/завтра с 05:00». Кнопка «Отправить» возвращается по часам, решение по-прежнему принимает сервер. Если `/api/gpt/account` не ответил и после одного повтора, чат работает как гость (F11). Нить квоты берёт размер из `freeLimits` сервера, а не из «15» в коде (F13). Остаток гостя один на RU и UZ (F12, L18). Ничего не запушено и не задеплоено. Cloudflare, D1, GSC и боты не менялись; миграций и настроек нет. План — `10-PROD-PLAN.md` §4 WP-06 (вне Git). Код-коммит WP-06 — `f7ed0f47145f719df54018a5eed42d0d12d96fcf`. Следующий коммит только записывает этот SHA в STATE (правило D-006).

**Что сделано.**
- **Новый `src/gpt-chat/limit-state.ts`** — чистый редьюсер из карты `03` §3.1. События несут время, поэтому двойной рендер StrictMode безопасен.
  - `blocked`: 429 ставит лимит с `retryAfterSec`. Если сервер время не прислал, берётся запас по причине: час и `ip` — +1 ч, сутки — следующие 00:00 UTC, `busy` — +5 с, `monthly` — без времени.
  - `account` никогда не снимает лимит из 429. Исключение одно: появился пакет с остатком, а причина `hourly`, `daily` или `monthly`. Сам `account` ставит суточный лимит только тогда, когда сервер насчитал вошедшему `remaining = 0` без пакета. Гостевой кэш лимит не ставит.
  - `admitted` снимает лимит: открылся поток (`meta`) или пришёл JSON-ответ без отказа по лимиту и без сбоя Turnstile.
  - `canSendNow`, хранение в `sessionStorage` (`gptchat_limit`, один ключ на RU и UZ). Снятый, старше суток и битый лимит при загрузке отбрасывается. Тик — `LIMIT_TICK_MS` = 15 с.
- **`limit-card.ts`** переписан под причины сервера WP-05: `hourly`, `daily`, `pack_daily`, `monthly`, `busy`, `ip`. Для каждой причины — заголовок, текст и строка ожидания: `limitWait(n)`, меньше минуты — `limitLessMinute`, после `retryAt` — `limitReady`. «Сегодня» или «завтра» выбирается по дате Ташкента от `retryAt`. Это закрывает открытый вопрос №1 ревью WP-05: ночью, с 00:00 до 05:00, пишется «сегодня с 05:00». Выход «AI-пакет» появляется только при `billingAvailable` (для `hourly`/`daily` без пакета и для `monthly`). Бот — только при `botHandoff` и только для `hourly`/`daily`.
- **`AiChatConsole.tsx`:**
  - `useReducer(reduceLimit)` вместо `limitReached`/`limitReason`. `onAccount` только сообщает редьюсеру событие `account`. `setLimitReached`, `onLimitRetry` и фокус после «Повторить» удалены.
  - 429: `setMessages(history)` — пузырь без ответа убран; `setInput(trimmed)`. Пока стоит лимит, поле копируется в черновик (`gptchat_draft`, 60 мин); при снятии лимита черновик удаляется. При загрузке поле берёт черновик, если нет запроса из статьи.
  - Карточка стоит над полем. Поле с вопросом остаётся, «Отправить» выключена до `canSendNow`, у поля `aria-describedby="ai-limit-card"`. Строка «N мин» не озвучивается на каждом тике, а строка «можно писать снова» озвучивается. Кнопки «Повторить» и ссылки «AI для бизнеса» на карточке больше нет. Вторичная «Мой тариф» без оплаты тоже убрана.
  - Часы: `setInterval` 15 с, таймер на момент снятия, `visibilitychange` и `focus`. Всё это работает только пока лимит ждёт.
  - F11: состояние аккаунта `loading | ready | unknown`. Отправка закрыта только в `loading`. В `unknown` история, сессия и остаток в хранилище не пишутся, потому что неизвестно, чьи они. Поле очищается только при смене одной известной личности на другую (выход, другой аккаунт). Сбой чтения аккаунта поле больше не стирает.
  - Нить квоты: `freeLimits.daily`; константа `FREE_DAILY_SEGMENTS` удалена.
- **`AiAccountPanel.tsx`:** один повтор `/api/gpt/account` через 1,5 с, затем `onAccount(null)`.
- **`api.ts`:**
  - `done` отдаёт `truncated`, `charged` и `hourRemaining`. Старый сервер без этих полей читается как «списан, не обрезан».
  - JSON-ответ 429 получает `retryAfterSec` из тела или из `Retry-After` (новая `retryAfterSeconds`, только целые секунды).
- **`types.ts`:**
  - `validAccountView` принимает `freeLimits` (два целых ≥ 0) или его отсутствие. Всё остальное — fail-closed.
  - `ChatMessage.truncated` и поля 429 в `ChatApiResponse`.
- **`storage.ts`:** остаток в `sessionStorage`, один ключ на RU и UZ, отдельно по аккаунту. Новые `loadDraft`/`saveDraft`/`clearDraft` (60 мин). `truncated` хранится в истории и архиве.
- **`AiChatMessageList.tsx`:** под обрезанным последним ответом — плашка `truncated` («не списан с лимита, нажмите «Продолжить»»).
- **`i18n.ts`, только строки карточки:** `hourlyTitle`, `hourlyBody(h)`, `dailyTitle`, `dailyBody(d, today)`, `packDailyBody`, `busyBody`, `ipBody`, `limitWait`, `limitLessMinute`, `limitReady`, `limitDraftKept`, `truncated`. Все RU и UZ, без Plus/obuna/подписк, «o‘/g‘» через U+2018. Ключ `premium.pause` стал мёртвым и удалён.
- **`docs/paid-chat/LIMITS-RU.md`:** раздел о карточке и шаг 3 приёмки после R1 (Browser pane, RU и UZ).
- **Тесты:**
  - Новый `tests/gpt-limit-state.test.ts`, 12 тестов:
    - 429 и запасное время;
    - `account` не снимает лимит ни при какой комбинации;
    - пакет снимает только `hourly`/`daily`/`monthly`;
    - суточный лимит из счёта сервера;
    - `admitted`;
    - чистота редьюсера;
    - `canSendNow`;
    - обратный отсчёт по тикам;
    - «сегодня/завтра» на пяти моментах ночи по Ташкенту;
    - `sessionStorage`;
    - валидация полей 429;
    - статический рендер консоли: после перезагрузки карточка над полем, вопрос в поле, `aria-describedby`, нет «Повторить», бизнес-ссылки и t.me.
  - Переписаны `gpt-account-ui` (выходы карточки по всем причинам, `freeLimits`, проводка), `gpt-chat-stream` (`done` с `truncated/charged/hourRemaining`, 429 с `retryAfterSec` из тела и заголовка), `gpt-account-storage` (остаток общий для RU и UZ, черновик, `truncated`) и `gpt-chat` (квота общая для RU и UZ).
  - `npm test` += `tests/gpt-limit-state.test.ts`.

**Отклонения от плана и почему.**
1. **Причины — серверные WP-05, а не `paid_hourly/paid_daily` карты `03`.** Часовой лимит пакета убран (L3), зато пришли `pack_daily`, `busy` и `ip`. Поэтому к ключам плана добавлены строки для каждой причины: `packDailyBody`, `busyBody` (тексты `03` §4) и `ipBody` (как в `chat-copy.ts`). Ещё добавлены `limitWait` и `limitDraftKept`. Иначе три из шести причин показывали бы чужой текст.
2. **`hourlyBody(h)` вместо `hourlyBody(n)`.** Минуты вынесены в отдельную строку ожидания, общую для `hourly`, `ip` и `busy`. Её не озвучивает скринридер на каждом тике, и она сама меняется на «меньше минуты» и «можно писать снова». Числа написаны как «Лимит … в час — 5»: так падеж верен при любом числе.
3. **«Ваш вопрос остался в поле ввода» — отдельная строка**, и видна она только при непустом поле. Суточный лимит из `account` может прийти без вопроса.
4. **`dailyTitle` без «на сегодня/Bugungi»**: ночью это противоречило бы «сегодня с 05:00» (та же ночная ошибка, что в ревью WP-05).
5. **Черновик — в `localStorage` и не привязан к аккаунту**, как в F2 карты `03`. Иначе вопрос не нашёлся бы после входа ради покупки. Живёт он, только пока стоит лимит, и не дольше 60 мин. При выходе поле очищается, вместе с ним уходит черновик.
6. **Поле больше не очищается при сбое чтения аккаунта**, а только при смене известной личности. Раньше сбой `/api/gpt/account` (например, при фокусе) стирал возвращённый вопрос.
7. **В гостевом режиме F11 не пишутся ни история, ни сессия, ни остаток**, а не только история. Область хранения неизвестна.
8. **`admitted` — любой ответ сервера без отказа по лимиту и без сбоя Turnstile**, включая ошибки провайдера. Раз лимит уже не стоит, карточку «можно писать» держать незачем.
9. **Бот на карточке — только для `hourly`/`daily`** (таблица `03` §3.1). Раньше его показывали и при `monthly`.
10. **Плашка `truncated` — только под последним ответом.** Она зовёт нажать «Продолжить», а эта кнопка есть только у последнего.
11. **`hourRemaining` и `charged` разбираются**, это контракт с тестом. Показывать их пока нечем: строки `hourWarning` (`03` §3.7) нет в ключах WP-06, её место — WP-09.
12. **`AiOfferCard.tsx`:** в мёртвых стадиях `hourly/daily` (их удаляет WP-09) вызовы заменены на `hourlyBody(null)` / `dailyBody(null, false)`, только чтобы сошёлся тип.
13. **Не сделано здесь (не в WP-06):** кнопка спроса «Pullik paket kerakmi?» и предзагрузка `chat-account` (`03` §3.1) — WP-09, WP-10 и WP-17. Не тронуты «Plus» в шапке, строка платного `Plus · N`, `actionCost` и `emptyMeta` — всё это WP-09.

**Проверки.**
- `tsc -b` 0; `typecheck:functions` 0; ESLint 12 изменённых файлов `src/gpt-chat` 0.
- По одному файлу: новые и изменённые файлы:
  - `gpt-limit-state` 12/12 (новый);
  - `gpt-account-ui` 9/9;
  - `gpt-chat-stream` 11/11 (+3);
  - `gpt-account-storage` 5/5 (+2);
  - `gpt-chat` 19/19.
- Весь список `npm test` по одному файлу: 66 файлов, 825/827. Падают только две известные датозависимые фикстуры `lead-radar`.
- Проверка «на красный»: три временные поломки ловятся:
  - `account` снимает лимит при остатке > 0 (2 теста);
  - вернули `setMessages(base)` (проводка);
  - «сегодня» по правилу «≤ 5 ч» с ошибкой на границе (тест ночи).
- `npx vite build`: стартовый JS чата (замыкание статических импортов, brotli q11) — 114 614 → 116 411 байт, **+1 797 байт br (+1,75 КБ)**, в пределах +3 КБ. Entry `gpt-chat` — 47 585 → 49 382 байт br. `vendor` и `utils` не изменились.
- `prerender` и остальные шаги `build:fast` — 0 ошибок. `seo-protection check` — **10/10**.
- Локальная приёмка в Browser pane, 375×812. Сервер — мок в scratchpad: `dist/` и поддельный `/api` (5 ответов, затем 429 `hourly`). Прод не трогал.
  - UZ: 6-е сообщение → карточка над полем, вопрос в поле, «Отправить» выключена, пузырь убран.
  - После 3 обновлений аккаунта, `focus` и `visibilitychange` карточка стоит. После перезагрузки лимит и вопрос на месте.
  - Счёт «3 → 2 daqiqadan → Bir daqiqadan kamroq qoldi → Endi yana yozishingiz mumkin», кнопка вернулась. Отправка прошла, лимит и черновик очищены.
  - RU: «Часовой бесплатный лимит исчерпан … через 50 мин». Переход на UZ в той же вкладке показывает тот же лимит и тот же остаток.
  - `/api/gpt/account` = 503: через повтор чат отвечает как гость, в хранилище ничего не записано.
  - Ошибок JS в консоли нет, только сетевые записи о самих 429.
- `git diff --check` чисто; grep токенов пуст; `scan:secrets` чисто (3157 файлов), `test:secret-scan` 16/16.

**Для релиза R1.**
1. Миграций и настроек нет. Бандл +1,75 КБ br.
2. После деплоя — шаг 3 в `LIMITS-RU.md`: Browser pane 375×812, RU и UZ, 6 сообщений. Карточка держится ≥ 60 с, переживает `focus`/`visibilitychange`, вопрос в поле, «N daqiqadan keyin» тикает.
3. Откат: `git revert` и guarded-деплой. Старые ключи хранилища (`gptchat_remaining_ru/uz` в `localStorage`) новый код не читает, а старый читает их как раньше.

**Открыто.**
1. **WP-09:** «Plus» в шапке и в строке платного, `actionCost` под ответом, `emptyMeta` с часовым лимитом из `freeLimits`, строка `hourWarning` по `hourRemaining`. Удалить мёртвые стадии `AiOfferCard` и их ключи (`hourlyRetry`, `hourlyRetryHint` и др.).
2. **WP-17:** кнопка спроса при выключенной оплате и тексты окна пакета. `premium.monthlyLimit` всё ещё говорит «следующий пакет с начала нового периода» (Б1). `monthly` до посетителя не доходит: сервер повторяет ход по бесплатным правилам.
3. **Узбекские строки карточки** — [НК], нужна вычитка носителем (§8 плана, не блокирует).

**Дальше.** WP-07.

---

# Платный AI-чат к проду: ревью WP-05, 2026-09-30

**Итог.** Проверил коммиты WP-05 `05ac26f6` (код) и `0cd835e1` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md`: §1, решения L3, L5 и L18 из §2, §4 WP-05, §5 и §6, картами `01` §1.4–1.5 и §2.7 и `02` (Б2, Б3). Сверял и с `AGENTS.md` §2–8, §11. Сделано верно:
- один список правил `admissionRules` за резервом и за `explain()`. Бесплатно: сутки и час по `subject` **и** по `ip_hash` среди ходов без пакета. Пакет: 50 в сутки и `message_limit`, часового лимита нет. Всем: 2 одновременно и потолок IP 100/1000;
- каждое `retryAt`. Сутки снимаются в 00:00 UTC. Час и IP — через час после limit-го с конца хода; при строгом окне это точно. `busy` — когда истекает limit-й с конца резерв. Если причин несколько, берётся та, что снимается позже;
- повтор при гонке и запасной `busy`, выбор пакета в `access()`, повтор по бесплатным при `monthly`;
- контракт 429 с `Retry-After`;
- `gpt_limit_hits`: псевдоним вместо адреса, изоляция org, перекей в WP-07;
- гостевой `/api/gpt/account` без D1 (L18);
- SQL не собирается из ввода; параметров не больше 36 при лимите D1 в 100; если подсчёт падает, чат отвечает 503;
- паритет конфига и документы.

Шесть отклонений исполнителя обоснованы. Нашёл один дефект в текстах 429 и исправил его в этом коммите. Ничего не запушено и не задеплоено; Cloudflare, D1, GSC и боты не менялись.

**Что исправлено.**
- Сутки лимитов — UTC, то есть они начинаются в 05:00 по Ташкенту. Тексты `daily` и `pack_daily` (RU и UZ) всегда говорили «завтра с 05:00» / «Ertaga soat 05:00 dan».
- Когда это ломается. Отказ пришёл между 00:00 и 05:00 по Ташкенту, например в 02:00. Лимит снимается в 05:00 того же дня, через 3 часа (`retryAfterSec` = 10800). Текст же обещал «завтра с 05:00», то есть ожидание почти на сутки дольше. Сейчас старый UI этот `message` не показывает. Но это часть контракта 429, и честное время — цель WP-05.
- Что теперь. `chat-copy.ts` пишет «сегодня» / «Bugun», если `retryAfterSec` ≤ 5 ч, иначе «завтра» / «Ertaga». Ташкент круглый год живёт в UTC+5, поэтому «≤ 5 ч до 00:00 UTC» и значит «тот же день по Ташкенту». Первая фраза суточного текста больше не говорит «на сегодня» / «Bugungi» («Бесплатные сообщения закончились», «Kunlik 15 ta …»): ночью она читалась бы как противоречие.
- Новый тест в `tests/gpt-chat-limits.test.ts` проверяет шесть моментов по календарю Ташкента: 15:00, 23:59:59, 00:00, 02:00, 04:59:59 и 05:00, тексты `daily` и `pack_daily` на RU и UZ. Проверен «на красный» двумя поломками: «всегда завтра» и `<` вместо `<=` на границе 00:00. В тесте эндпоинта `pack_daily` допускаются оба слова, потому что он идёт по настоящим часам.
- `LIMITS-RU.md` описывает выбор слова.

**Что перепроверил.**
- Согласие резерва и `explain`: правила одни и те же, у дневных `COUNT < limit` против `COUNT ≥ limit`, у часовых и `busy` окно `LIMIT limit`. Флаг `monthly` (пакет потрачен или не действует) проверяется первым, как и `PACK_USED/PACK_VALID` в резерве.
- Гонка «пакет кончился»: отказ по пакету не создаёт строку, повтор по бесплатным получает свежий `period = null`. Бюджет, цепочка, `allowance` и `plan` в 429 и в `gpt_limit_hits` видят уже бесплатный уровень.
- `access()`:
  - подзапрос ограничен `r.org_id = p.org_id`;
  - считает так же, как `TurnStore`;
  - использует индексы `idx_gpt_turn_period` и `idx_gpt_periods_user`;
  - других вызывающих, кроме чата и панели, нет.
- Старый UI не ломается: новые поля ему безразличны. `validAccountView` не отвергает `freeLimits`. `pack_daily`, `busy` и `ip` он показывает как часовую карточку (WP-06).
- `tsc -b` 0; `typecheck:functions` 0; ESLint файлов WP-05 и этого коммита 0.
- Тесты по одному файлу, после исправления:
  - gpt-chat-limits 13/13 (+1), gpt-billing 15/15, gpt-operations 7/7, gpt-chat-truncation 8/8, gpt-model-policy 13/13, gpt-readiness 9/9;
  - gpt-routing 6/6, gpt-chat-stream 8/8, gpt-chat-budget 10/10, gpt-chat-runtime-schema 5/5, runtime-config 4/4, pages-config-parity 7/7;
  - gpt-chat 19/19, gpt-api-cors 2/2, gpt-account-ui 7/7, gpt-account-storage 3/3, gpt-uzum-payments 17/17, gpt-zai-provider 18/18;
  - gpt-watchdog 13/13, gpt-chat-bridge 42/42, gpt-chat-session-privacy 3/3, telegram-assistant 61/61, telegram-web-handoff 21/21, openrouter-model-catalogue 5/5.
- `scripts/gpt-billing-load-rehearsal.ts` проходит.
- `scan:secrets` чисто (3155 файлов), `test:secret-scan` 16/16, grep токенов пуст, `git diff --check` чисто, `seo-protection check` 10/10.

**Открыто (не дефекты WP-05, но проверить).**
1. **WP-06, та же ночная ошибка в UI.** Текст карточки `dailyBody` из карты `03` §4 говорит «Завтра с 05:00» / «Ertaga soat 05:00 dan». Слово выбирать по `retryAt`: если до снятия ≤ 5 ч, это «сегодня» по Ташкенту.
2. **Уровень плана: суточные 50 пакета.** Пакет, упёршийся в 50 за сутки, отвечает 429 `pack_daily` до 00:00 UTC. На бесплатные 15/5 он не переходит. План об этом молчит, исполнитель оставил прежнее поведение (отклонение 4). Решить ведущему или в оферте (WP-18).
3. **`gpt_limit_hits.tier`.** В ключе строки уровня нет (схема плана), поэтому строка хранит уровень первого упора за день. На обоих уровнях бывают только `busy` и `ip`. Админке (WP-19) не считать `tier` точным для этих двух причин.
4. Остальное — как у исполнителя ниже: UI (WP-06), «20 в час» в строках UI (WP-17), Б1 (WP-13), `content_filter` (вопрос ревью WP-04).

**Дальше.** WP-06.

---

# Платный AI-чат к проду: WP-05 — лимиты и честный 429 (сервер), 2026-09-30

**Итог.** Отказ чата теперь говорит правду. В 429 есть:
- точная причина: `hourly`, `daily`, `pack_daily`, `busy` или `ip`;
- уровень (`free`/`paid`) и его лимиты;
- момент, когда снова можно писать: `retryAt`, `retryAfterSec` и заголовок `Retry-After`;
- текст на языке хода (RU или UZ), без «Plus» и без названий тарифов.

Бесплатный счёт ведётся по аккаунту **и** по хешу IP (L5), поэтому вход и выход больше не обнуляют бесплатные 15/5. Пустой, истёкший или отозванный пакет не блокирует бесплатные ответы. Часовой лимит пакета «20» убран (L3). Каждый 429 в фоне считается в `gpt_limit_hits` без адреса и текста. Гостевой `/api/gpt/account` отдаёт `freeLimits` из конфига и по-прежнему не ходит в D1 (L18). Миграций нет: таблица `gpt_limit_hits` пришла с 0066 (WP-04). Ничего не запушено и не задеплоено; Cloudflare, D1, GSC и боты не менялись. План — `10-PROD-PLAN.md` §4 WP-05 (вне Git). Runbook — новый `docs/paid-chat/LIMITS-RU.md`. Код-коммит WP-05 — `05ac26f637d69c659f134057e0ea4811107f7f1f`. Следующий коммит только записывает этот SHA в STATE (правило D-006).

**Что сделано.**
- **`functions/lib/gpt-chat/turn-store.ts`.** Правила допуска описаны один раз, как данные: `admissionRules`. По ним строятся и резерв (`INSERT … SELECT … WHERE`), и объяснение отказа, поэтому они не могут разойтись.
  - Бесплатно: сутки и скользящий час, каждое и по `subject`, и по `ip_hash`, только среди ходов без пакета (`period_id IS NULL`).
  - Пакет: экспорт `PACK_DAILY_LIMIT = 50` за UTC-сутки и `message_limit` периода. Часового лимита нет.
  - Всем: ≤ 2 ответа одновременно (`busy`) и потолок запросов с хеша IP за час, 100 без пакета и 1000 с пакетом (`ip`).
- **`TurnStore.explain(...)`.** Один `SELECT` по тем же правилам даёт причину, `retryAt` и `remaining`:
  - сутки и сутки пакета: следующие 00:00 UTC, то есть 05:00 по Ташкенту;
  - час: момент, когда из окна выходит 5-й с конца ход, то есть «самый старый + 1 ч», если ходов ровно 5;
  - `ip`: через час после 100-го (1000-го) с конца запроса;
  - `busy`: когда истечёт более ранний из двух резервов, не позже 120 с;
  - `monthly`: пакет потрачен или не действует, `retryAt: null`;
  - если отказывают несколько правил, в ответе то, что снимается позже; `monthly` важнее всех.
- **`reserve()`** возвращает `{id, remaining}` или `{id: null, limit}`. Если причина отказа исчезла до `explain` (параллельный ход успел завершиться), резерв повторяется один раз. Если и второй отказ никто не объясняет, ответ — `busy` через 5 с.
- **`allowance()` и `remaining()`** принимают хеш IP. Бесплатный остаток = лимит − max(по аккаунту, по IP), как в резерве. `recordLimitHit(reason, tier, subject)`: `INSERT … ON CONFLICT DO UPDATE n=n+1` по `(org_id, day, reason, subject)`.
- **`BillingStore.access()` (Б2).** Отдаёт только действующий период с остатком (списанные и ещё готовящиеся ходы считаются, как в `TurnStore`). Из нескольких выбирается тот, что кончается раньше.
- **`functions/api/gpt/chat.ts`.**
  - Ответ 429 собирает `limitReached()`: `reason, tier, remaining, limits, retryAt, retryAfterSec, message` и заголовок `Retry-After`.
  - `waitUntil` пишет упор в `gpt_limit_hits`. Сбой записи — только `console.warn`.
  - Если резерв по пакету вернул `monthly` (пакет кончился между `access()` и резервом), ход сразу повторяется по бесплатным правилам (L5).
  - `providerMessage` отвечает на языке хода.
  - Хуки-комментарии «package D» удалены. `grep Plus chat.ts` = 0.
  - Насос потока передаёт `start.model` в `parseSseChunk` (открытый вопрос №3 ревью WP-04). Видимых изменений нет: 402 внутри потока на платной модели теперь читается как `paid_credit_exhausted`, но исход и пауза модели те же (`no_model`, `provider_error`).
- **`functions/lib/gpt-chat/chat-copy.ts`** (новый, чистый): `limitMessage(reason, locale, facts)` и `providerMessage(code, locale)`, RU и UZ. В текстах нет названий тарифов и цен, «o‘/g‘» пишутся через U+2018, а в русских фразах нет числительных с неверным падежом.
- **`functions/api/gpt/account.ts`.**
  - Всем отдаётся `freeLimits: {daily, hourly}` из конфига; гостевой путь D1 не трогает.
  - Вошедшему `remaining` считается по аккаунту и по хешу IP, как в чате.
- **Тесты.**
  - Новый `tests/gpt-chat-limits.test.ts`, 12 тестов:
    - все причины и их `retryAt`, включая «5-й с конца, а не самый старый» и «сутки и час — побеждает сутки»;
    - освобождённые и истёкшие ходы не считаются;
    - у пакета нет часового лимита; потраченный, истёкший и отозванный пакет дают `monthly`;
    - повтор при гонке и запасной `busy`;
    - изоляция org для правил и `gpt_limit_hits`;
    - 429 `hourly` от эндпоинта: поля, `Retry-After`, RU и UZ, счётчик упоров, резерва нет;
    - вход не обнуляет счёт (и панель аккаунта показывает тот же остаток);
    - пустой и истёкший пакет плюс гонка → бесплатный ход;
    - 429 `pack_daily`;
    - тексты без `Plus|obuna|подписк`, названий пакета и цен;
    - ошибка провайдера на языке хода;
    - гостевые `freeLimits` без D1.
  - В `tests/gpt-billing.test.ts` добавлен тест выбора пакета в `access()`: потраченный, отозванный и истёкший пропускаются, берётся раньше кончающийся с остатком, ход в работе держит ответ, освобождённый возвращает; другая org пакет не видит.
  - Подписи `remaining`/`allowance`/`reserve` обновлены в `gpt-billing`, `gpt-operations`, `gpt-chat-truncation` и `scripts/gpt-billing-load-rehearsal.ts`. В `gpt-model-policy` ход на узбекском теперь ждёт узбекский текст.
  - `npm test` += `tests/gpt-chat-limits.test.ts`.

**Отклонения от плана и почему.**
1. **Гонку «пакет кончился» чат решает повтором по бесплатным правилам, а не ответом 429 `monthly`.** Так требует L5: пустой пакет не блокирует бесплатные. `access()` уже не отдаёт потраченный пакет, поэтому `monthly` возможен только в гонке между `access()` и резервом. Посетитель `monthly` не получает; в типе и текстах он остался, потому что `explain` так сообщает отказ по пакету.
2. **Время часа точнее, чем «самый старый + 1 ч».** Берётся момент, когда из окна выходит 5-й с конца ход. Когда ходов ровно 5, это то же самое. Когда в окне больше (соседи по адресу или ходы, принятые до WP-05 только по `subject`), «самый старый» дал бы слишком раннее время, и посетитель получил бы повторный 429. Окно часа стало строгим (`created_at > now − 1 ч`), чтобы `retryAt` был точным до миллисекунды.
3. **Приоритет причин не был задан.** В ответе причина, которая снимается позже; `monthly` важнее всех. Иначе `retryAt` обещал бы слишком раннее время.
4. **Сутки пакета, как и раньше, считают все ответы аккаунта за день**, включая бесплатные. План об этом молчит, карта `02` (Б2) говорит «оставить по subject».
5. **У пакета `limits = {"daily": 50, "hourly": null}`** — поле из примера `01` §2.7 для платного уровня.
6. **Правило `busy` дополнительно ограничено `created_at > now − 120 с`.** Условие равносильно прежнему (резерв живёт 120 с), но индекс `(org_id, subject, created_at)` больше не читает всю историю аккаунта на каждом ходу.
7. **`freeLimits` получают все**, а не только гость: это конфиг, D1 не нужна. Вошедшему остаток теперь считается и по IP — `01` §2.7 просит «то же в `account.ts` для вошедшего без пакета», иначе панель обещала бы ответы, которые чат не даст.
8. **Тексты вынесены в `chat-copy.ts`** (чистый модуль с тестом), а не оставлены в `chat.ts`.
9. **Новый документ `docs/paid-chat/LIMITS-RU.md`**: правила, контракт 429, счётчик упоров и приёмка после R1. План его не называл.

**Проверки.**
- `tsc -b` 0; `typecheck:functions` 0; ESLint изменённых файлов 0.
- По одному файлу: `gpt-chat-limits` 12/12 (новый), `gpt-billing` 15/15 (+1), `gpt-operations` 7/7, `gpt-chat-truncation` 8/8, `gpt-model-policy` 13/13, `gpt-readiness` 9/9 (гость без D1 — `:27` зелёный), `gpt-routing` 6/6, `gpt-chat-budget` 10/10, `gpt-chat` 19/19, `gpt-zai-provider` 18/18, `gpt-uzum-payments` 17/17, `gpt-watchdog` 13/13, `gpt-chat-stream` 8/8, `gpt-account-ui` 7/7, `gpt-account-storage` 3/3, `gpt-chat-runtime-schema` 5/5, `gpt-chat-bridge` 42/42, `gpt-chat-session-privacy` 3/3, `telegram-web-handoff` 21/21, `runtime-config` 4/4, `pages-config-parity` 7/7, `openrouter-model-catalogue` 5/5.
- Весь список `npm test` по одному файлу: 65 файлов, 805/807. Падают только две известные датозависимые фикстуры `lead-radar`.
- `scripts/gpt-billing-load-rehearsal.ts`: 1000 резервов, 800 списано и 200 освобождено, как раньше.
- Проверка «на красный», пять временных поломок ловятся:
  - `access()` отдаёт потраченный пакет и выбирает по началу (ловит `gpt-billing`);
  - нет правил по IP (3 теста);
  - время часа по самому старому ходу (2 теста);
  - вернули пакету час «20»;
  - нет повтора `monthly` по бесплатным.
- `scan:secrets` чисто (3155 файлов), `test:secret-scan` 16/16, grep токенов пуст, `git diff --check` чисто, `seo-protection check` 10/10.
- `src/`, `content/` и prerender не менялись; защищённые страницы не тронуты.

**Для релиза R1.**
1. Миграций нет. `gpt_limit_hits` создаёт 0066, её порядок (до кода и до превью) описан в WP-04.
2. Приёмка — `LIMITS-RU.md`: со своего адреса 6 сообщений → 6-й = 429 `hourly`, `retryAfterSec` ≤ 3600, заголовок `Retry-After`; агрегат `gpt_limit_hits` вырос. Если на проде включён Turnstile, слать через Browser pane.
3. Нагрузка на D1: у бесплатного резерва 6 подсчётов вместо 4 (плюс сутки и час по IP); отказ — ещё 1 `SELECT` (`explain`) и 1 upsert в фоне; панель вошедшего — два индексных подсчёта вместо одного.
4. Откат: `git revert` и guarded-деплой; схема не менялась.

**Открыто.**
1. **UI (WP-06).** Старый клиент понимает только `hourly`, `daily` и `monthly`. `pack_daily`, `busy` и `ip` он показывает как часовой лимит, а новые поля (`retryAt`, `retryAfterSec`, `tier`, `limits`, `freeLimits`) пока не читает.
2. **Строки UI про «20 в час» устарели после L3:** `src/gpt-chat/i18n.ts:158` и `:305` (`benefits`), `src/gpt-chat/components/AiAccountPanel.tsx:208` и `:212`. Пока оплата выключена, их никто не видит. WP-17 переписывает `packFeatures` и должен убрать «20 в час»: в карте `03` §4 этот лимит ещё стоит, но L3 важнее.
3. **Б1 (WP-13).** После Б2 потраченный пакет не виден в панели. Новая покупка всё ещё начинается с `MAX(ends_at)` старого периода, то есть после его конца, и до конца старого периода ход идёт по бесплатным правилам. Пока оплата выключена, это никого не касается; чинит WP-13.
4. **CGNAT (принято планом, L5).** Вошедшие без пакета теперь делят бесплатную квоту адреса так же, как гости.
5. **`content_filter` (открытый вопрос №2 ревью WP-04)** к лимитам не относится и остаётся открытым: это правило списания L4, решать в оферте (WP-18) или отдельным решением ведущего.

**Дальше.** WP-06.

---

# Платный AI-чат к проду: ревью WP-04, 2026-09-30

**Итог.** Проверил коммиты WP-04 `14e04598` (код) и `f7afb677` (SHA в STATE). Сверял с планом `10-PROD-PLAN.md`: §1, решения L4 и L6 из §2, §4 WP-04 и §5. Сверял и с `AGENTS.md` §2–8, §11. Сделано верно:
- миграция 0066 и её паритет с bootstrap;
- расчёт хода: обрезка, «Стоп», `remaining` после расчёта;
- атомарный резерв бюджета и изоляция org;
- контракт `admitAttempt`, сторож и уборка;
- флаг `enable_request_signal` (сверен с документацией Cloudflare);
- паритет конфига и документы.

Отклонения исполнителя обоснованы. Нашёл один дефект в обходчиках моделей и исправил его в этом коммите. Ничего не запушено и не задеплоено; Cloudflare, D1, GSC и боты не менялись.

**Что исправлено.**
- WP-04 добавил решение `skip`: если бюджет потрачен, платная модель пропускается и попытку не занимает. Но в конце обхода оба обходчика (`chatComplete` и `chatStreamStart`) смотрят на признак «все кандидаты отклонены как неизвестные». Этот признак снимается только после отправленного запроса. Если не ушло ни одного запроса, он оставался поднятым.
- Когда это случается. День загружен, бюджет $1 потрачен, все модели `:free` на паузе после 429. Живой остаётся только платная голова цепочки, и бюджет её пропускает, поэтому запрос не уходит вовсе.
- Что было. Обходчик возвращал `model_unavailable`, то есть «цепочка устарела». Чат слал владельцу срочный `chat_model_unavailable` с текстом «проверьте OPENROUTER_MODEL_*». Диагноз ложный: именно такие WP-03 и старался исключить. До WP-04 то же состояние давало `models_cooling`. Трата бюджета и паузы `:free` растут вместе с нагрузкой, так что случай вероятен.
- Что теперь. Если обход не отправил ни одного запроса, оба обходчика возвращают `models_cooling`:
  - посетитель видит тот же `model_unavailable`;
  - ход закрывается как `no_model` с 0 попыток;
  - владелец получает срочный `chat_models_cooling`;
  - `free_paid_budget_exhausted` остаётся фоновым.
- Новый тест в `tests/gpt-chat-budget.test.ts` проверяет оба обходчика напрямую и чат в потоке и в JSON. Проверен «на красный» двумя поломками: без исправления в обоих обходчиках и без исправления только в потоковом.
- В разделе «Бюджет» файла `MODELS-RU.md` описан этот случай.

**Что перепроверил.**
- `enable_request_signal` по документации Cloudflare:
  - флаг существует, у него нет даты по умолчанию, поэтому его задают явно;
  - `request.signal` срабатывает, когда клиент отменяет запрос;
  - в подзапросы сигнал уходит только с другим флагом, `request_signal_passthrough`;
  - входящий `request.signal` читает только `functions/api/gpt/chat.ts`. У `platform/ai/facade.ts` и `aeo/observation.ts` свой объект запроса, это не входящий HTTP-запрос.
- Миграция 0066:
  - только добавляет, `DROP` нет;
  - `gpt_service_alerts` создаёт `BILLING_DDL`, поэтому индекс в `CHAT_RUNTIME_DDL` не падает на маршрутах, где работает только биллинг;
  - `PRAGMA table_info` D1 поддерживает;
  - в шапке есть порядок «миграция до кода» и инструкция на случай, если bootstrap успел раньше.
- Деньги. Худший ход ≈ 1108 микродолларов: ~5956 токенов промпта × 0,1 + 1600 × 0,32. Факт пишется по прайсу. Резерв и расчёт делаются в одной строке `gpt_model_spend` на org и сутки, и `reserved_micro` включает уже потраченное, так что потолок держит всё. Если бюджет не прочитать, модель пропускается: деньги закрыты.
- `tsc -b` 0; `typecheck:functions` 0; ESLint файлов WP-04 и этого коммита 0.
- Тесты по одному файлу, после исправления:
  - gpt-chat-budget 10/10, gpt-chat-truncation 8/8, gpt-chat-runtime-schema 5/5;
  - gpt-model-policy 13/13, openrouter-model-catalogue 5/5, gpt-zai-provider 18/18, gpt-routing 6/6, gpt-readiness 9/9, gpt-operations 7/7, gpt-chat 19/19;
  - gpt-billing 14/14, telegram-assistant 61/61, gpt-watchdog 13/13, gpt-chat-stream 8/8, runtime-config 4/4, pages-config-parity 7/7;
  - gpt-uzum-payments 17/17, gpt-account-ui 7/7, gpt-account-storage 3/3, gpt-chat-bridge 42/42.
- `scan:secrets` чисто (3152 файла), `test:secret-scan` 16/16, grep токенов пуст, `git diff --check` чисто, `seo-protection check` 10/10.

**Открыто (не дефекты WP-04, но проверить).**
1. **До S5, Z.ai в JSON-пути.** Z.ai может вернуть текст с `finish_reason = network_error`. В JSON-пути такой ответ считается готовым и списывается. Поток видит тот же случай как сбой провайдера: `partial`, без списания. L4 говорит, что сбой провайдера не списывается. Z.ai выключен до S5; выровнять пути до включения.
2. **Уровень плана, `content_filter`.** OpenRouter может прислать `finish_reason = content_filter`, когда фильтр провайдера обрезал ответ. Такой ответ списывается как обычный: L4 называет только обрезку по длине. Решить в WP-05, WP-06 или в оферте.
3. **WP-05, `chat.ts`.** Насос вызывает `parseSseChunk` без `start.model`. Поэтому 402 внутри потока на платной модели читается как `account_unavailable`, а не `paid_credit_exhausted`. Сейчас разницы нет: оба кода дают исход `no_model`, а насос OpenRouter в любом случае ставит паузу с `provider_error`. Передать модель, когда WP-05 будет менять `chat.ts`.
4. **R1.1, остановленные ходы.** Бесплатный ход на платной модели, прерванный «Стопом», держит весь резерв: usage так и не приходит. Около 900 таких «Стопов» за сутки съедают бюджет $1. Это ограничено: 100 ходов в час с IP, и `:free` продолжает отвечать. План этот риск принимает. В агрегате через 24 ч смотреть разницу `reserved_micro − actual_micro`.
5. **Шум логов.** После исчерпания бюджета каждый бесплатный ход до полуночи UTC вызывает `recordServiceAlert`. Это одна строка лога `gpt_service_failure` и один `INSERT OR IGNORE` на ход, при этом в D1 остаётся одна строка в сутки. По желанию можно запоминать это в изоляте.

**Дальше.** WP-05.

---

# Платный AI-чат к проду: WP-04 — телеметрия хода, бюджет $1, обрезка и «Стоп», миграция 0066, 2026-09-30

**Итог.** Каждый ход чата теперь закрывается одной записью без текста: исход, списан ли, модель, `finish_reason`, время до первого слова, общее время, токены, стоимость и число попыток. Ответ, обрезанный по длине, **никогда не списывается** и помечен (`truncated: true, charged: false`). «Стоп» списывается, только если посетителю уже ушло ≥ 600 символов. `remaining` считается после расчёта хода. Бесплатным на сайте цепочку может возглавить платная модель под суточным бюджетом $1: каждая попытка заранее резервирует худший случай одной атомарной записью, исчерпанный бюджет пропускает платную к `:free`. Миграция 0066 и её bootstrap готовы, репетиция на локальной D1 прошла. `GPT_FREE_TIER_PAID_PRIMARY` в репозитории по-прежнему `"false"`: включается шагом R1.1 после пробы. Ничего не запушено и не задеплоено; Cloudflare, D1, GSC и боты не менялись. План — `10-PROD-PLAN.md` §4 WP-04 (вне Git), дальше WP-05. Runbook — `docs/paid-chat/MODELS-RU.md` (разделы «Бюджет», «Исход хода»). Код-коммит WP-04 — `14e0459854b54a433bc1b3b6e0a2dc5a6ea8c31c`. Следующий коммит только записывает этот SHA в STATE (правило D-006).

**Что сделано.**
- **Миграция `migrations/0066_gpt_chat_runtime.sql`** (аддитивная, без `DROP`, CHECK статуса не тронут):
  - 12 nullable-колонок `gpt_turn_reservations`: `outcome, charged, model, finish_reason, cancel_reason, ttft_ms, total_ms, tokens_in, tokens_out, reasoning_tokens, cost_micro_usd, attempts`;
  - таблицы `gpt_model_spend(org_id, day, bucket, reserved_micro, actual_micro, attempts)` и `gpt_limit_hits(org_id, day, reason, tier, subject, n, first_at)` (пишет WP-05);
  - индексы `idx_gpt_turn_created`, `idx_gpt_messages_created`, `idx_gpt_sessions_created` и `idx_gpt_service_alerts_pending`.
- **Bootstrap:** `ensureBillingSchema` — один `PRAGMA table_info` на изолят, `ALTER` только для недостающей колонки, дубль от соседнего изолята не ошибка, другая ошибка бросается и повторяется на следующем запросе. Индексы `gpt_messages`/`gpt_sessions` — в `ensureSchema` (`CHAT_TIME_INDEXES`). Паритет 0066 ⇄ bootstrap проверяет `tests/gpt-chat-runtime-schema.test.ts` в обе стороны.
- **Исход хода** (`functions/lib/gpt-chat/turn-outcome.ts`, чистый модуль): `answered | truncated | client_gone | upstream_error | no_model | refused | context_too_large`. `TurnStore.finish(id, settlement)` — одна `UPDATE … WHERE status='reserved'`: повтор и чужой org ничего не меняют. `cost_micro_usd` пишется **всегда** (раньше стоимость жила только в `gpt_messages` и только для сохранённой переписки). Значения провайдера пишутся, только если это неотрицательные числа.
- **Насос SSE и JSON-путь** (`chat.ts`):
  - `length` / `model_context_window_exceeded` → `released`, `charged=0`, `done{truncated:true, charged:false, remaining, hourRemaining}`;
  - «Стоп» или закрытая вкладка (запись в поток не прошла или сработал `request.signal`) → `client_gone`, списание только при доставленных ≥ `GPT_STOP_CHARGE_MIN_CHARS` символах; уход посетителя не ставит модель на паузу;
  - `remaining` и `hourRemaining` (у бесплатных) читаются **после** расчёта (`TurnStore.allowance`, один SELECT) — в `done`, `error: partial` и JSON;
  - в JSON-пути ответ доходит целиком или никак, поэтому «Стоп» там не списывается.
- **Бюджет $1** (`functions/lib/gpt-chat/model-spend-store.ts`, решение L6):
  - `webChatChain(free)` = `[paidPrimary, …freeChain]` только при `GPT_FREE_TIER_PAID_PRIMARY="true"` **и** `GPT_FREE_PAID_DAILY_USD > 0`; с Z.ai — `[zai, paidPrimary, …free]`. `modelChain()`/`freeChain()` не менялись: бот, AEO и проверка каталога остаются на `:free`;
  - перед каждой платной попыткой — резерв худшего случая (`promptTokenBound` + весь ответ по `PAID_PRICE_CEILING`, ≈ $0,00067 для короткого вопроса, ≈ $0,0011 для самого длинного контекста) одним `INSERT … ON CONFLICT DO UPDATE … WHERE reserved+x ≤ cap RETURNING`;
  - ответ пришёл → резерв заменяется ценой по прайсу (`actual += cost`, разница возвращается); провал или нет usage → резерв остаётся;
  - исчерпан → `skip` к `:free` (попытку не занимает) + фоновый `free_paid_budget_exhausted` одной строкой в сутки; сбой D1 бюджета → тоже `skip` (деньги закрыты, чат отвечает);
  - ходы пакета бюджет не трогают: они идут по платной цепочке под `admitModelAttempt`.
- **Обходчики:** контракт `admitAttempt(model) → 'ok' | 'skip' | 'stop'` в обоих (`AdmitAttempt` в `openrouter-chat.ts`). `StreamStart` отдаёт `ttftMs` (от начала перебора, с упавшими попытками) и `attempts`; `ChatResult` — `finishReason`, `reasoningTokens`, `attempts` (и у Z.ai JSON — `finishReason`). У неудачи тоже есть `attempts`.
- **Сторож** (открытый вопрос ревью WP-02): ходы `client_gone`, `refused`, `context_too_large` не считаются вовсе, `truncated` считается ответом. Иначе три «Стопа» тихой ночью поднимали срочный `chat_silence`. `chat_truncation_high` теперь работает всегда.
- **Уборка:** `gpt_model_spend` и `gpt_limit_hits` старше 93 дней удаляет крон (по org).
- **`wrangler.toml`:** `compatibility_flags += "enable_request_signal"` (входящий сигнал читает только чат; в подзапросы не передаётся — это другой флаг); V `GPT_STOP_CHARGE_MIN_CHARS="600"` (JSON 3260/5120 байт и таблица, `RUNTIME_CONFIG_KEYS`, `Env`).
- **Документы:** `MODELS-RU.md` (бюджет, исход хода, шаг R1.1, агрегаты приёмки WP-04, откат), `ALERTS-RU.md` (новый фоновый код, правила сторожа). `npm test` += три новых файла.

**Отклонения от плана и почему.**
1. **Индексов четыре, а не три:** добавлен `idx_gpt_service_alerts_pending(org_id, delivered_at, created_at)` — рекомендация ревью WP-02 (доставка алертов на каждом неудачном ходе читает эту таблицу, а D1 Free считает прочитанные строки).
2. **Индексы `gpt_messages`/`gpt_sessions` — в `schema.ts`, не в `billing-schema.ts`:** эти таблицы создаёт `ensureSchema`, а маршруты `auth/callback`, `auth/logout`, `internal/gpt-billing-maintenance` зовут только `ensureBillingSchema` и упали бы на «no such table».
3. **`fallbackFrom` и `ChatResult.latencyMs` не добавлены:** колонок и читателей у них нет. `total_ms` считает `chat.ts` вокруг обхода, число попыток пишется в `attempts`. У JSON-пути `ttft_ms` = null (первого слова отдельно нет).
4. **Правила исхода — отдельный чистый модуль `turn-outcome.ts`**, SQL — только в `turn-store.ts` / `model-spend-store.ts` (AGENTS §3).
5. **Оценка худшего хода — по `PAID_PRICE_CEILING`**, а не по прайсу модели: `max_price` — настоящий предел того, что возьмёт OpenRouter (`allow_fallbacks` может увести на провайдера дороже прайса). Факт — по прайсу `estimateCostUsd`, как в плане.
6. **`free_paid_budget_exhausted` фоновый и суточный** (карта `01` §2.3: «информационный»); пишется `recordServiceAlert` напрямую, без попытки доставки.
7. **Платная основная не встаёт в цепочку при `GPT_FREE_PAID_DAILY_USD = 0`** (иначе каждая попытка пропускалась бы и писала алерт).
8. **Сторож больше не терпит отсутствие колонки `outcome`:** её гарантирует bootstrap у обоих, кто его зовёт (эндпоинт обслуживания и чат). Проверка «до 0066» из WP-02 заменена тестом «ходы до 0066 без исхода считаются как раньше».
9. **Уборка новых таблиц (93 дня)** — план молчит, карта `01` §2.6 п. 22 её просит; без неё `gpt_limit_hits` растёт без предела.
10. **`hourRemaining` только у бесплатных** (у пакета `null`): часовой лимит пакета убирает WP-05 (L3). Формула бесплатного часа пока старая (по `subject`), Б3 — в WP-05.
11. **Локальная проверка `enable_request_signal`:** флаг принимают `wrangler dev` 4.118 и Miniflare 5.20260730 с датой `2024-09-23`, но ни тот, ни другой не передают обрыв клиента в `request.signal` (отдельный воркер: обрыв через 1 с — 0 срабатываний и с флагом, и без). Поэтому эффект флага видно только на превью/проде — это шаг релиза. «Стоп» через ошибку записи в поток работает и без флага (тот же прогон: «Network connection lost» на записи); флаг добавляет обрыв запроса к модели в паузе между кусками и в JSON-пути. Код обоих путей покрыт тестами с настоящим `AbortSignal`.
12. **`promptTokenBound`** вынесен из `buildMessages` (тот же подсчёт байт + 32 на сообщение, поведение сборки промпта не менялось).
13. **`tests/gpt-chat-stream.test.ts`** проверяет клиентский разбор (новый `done` читается старым клиентом как ответ с `remaining`) и серверный `parseSseChunk` (одиночный `finish_reason`, `reasoning_tokens`). Пометку `truncated` в UI делает WP-06.

**Проверки.**
- `tsc -b` 0; `typecheck:functions` 0; ESLint изменённых файлов 0; `git diff --check` чисто; `scan:secrets` чисто (3152 файла), `test:secret-scan` 16/16, grep токенов пуст, `seo-protection check` 10/10. `src/`, `content/` и prerender не менялись.
- Весь список `npm test` по одному файлу: 64 файла, 791/793. Падают только две известные датозависимые фикстуры `lead-radar`.
- Новые: `gpt-chat-runtime-schema` 5/5, `gpt-chat-budget` 9/9, `gpt-chat-truncation` 8/8. Обновлённые: `gpt-watchdog` 13/13 (+1), `gpt-chat-stream` 8/8 (+2), `gpt-readiness` 9/9, `gpt-routing` 6/6, `gpt-operations` 7/7, `gpt-billing` 14/14, `gpt-chat` 19/19, `gpt-zai-provider` 18/18, `gpt-model-policy` 13/13, `openrouter-model-catalogue` 5/5, `runtime-config` 4/4, `pages-config-parity` 7/7.
- Проверка «на красный»: девять временных поломок ловятся (обрезка списана, «Стоп» никогда не списан, потолок бюджета не проверен, бюджет не рассчитан, сторож считает «Стоп», `remaining` до расчёта, платная основная без проверки бюджета, bootstrap без колонки, пропуск бюджета съедает попытку).
- **Репетиция 0066 на локальной D1** (`wrangler d1 migrations apply --local`, отдельная папка в scratch, фиктивный id базы, `--remote` не использовался): 0008 + 0061 + 0064 + 0065, синтетические строки → 0066 применена (19 команд) → второй `apply`: «No migrations to apply». Строк до/после: резервов 3/3, сессий 1/1, сообщений 2/2, алертов 1/1; ledger 4 → 5; новые таблицы пусты; 4 новых индекса; 20 колонок; у старых ходов `outcome` NULL. Тот же сценарий и «код раньше миграции» — в `tests/gpt-chat-runtime-schema.test.ts`.

**Для релиза R1.**
1. **0066 — строго до кода и до любого превью** (превью пишет в боевую D1). Если bootstrap успеет раньше, `migrations apply` упадёт на «duplicate column name»; что делать — в шапке миграции (применить только `CREATE` и записать файл в ledger, ничего не удалять).
2. Репетиция на копии прод-экспорта по процедуре релиза (§1: экспорт с sha256, применить дважды, сравнить строки) → `migration-rehearsal.json`.
3. Смоук `enable_request_signal` на превью: «Стоп» после первых слов → строка `client_gone`, `charged=0`; флаг действует на весь Pages-проект.
4. **R1.1:** проба моделей (`MODELS-RU.md`) → `GPT_FREE_TIER_PAID_PRIMARY = "true"` (JSON и таблица) → guarded-деплой. Без кредитов OpenRouter платная основная получит 402: ход уйдёт к `:free`, платные встанут на паузу на 15 минут, срочный `openrouter_credit_exhausted` — не чаще раза в час. Нужен вход владельца §8 (кредиты).
5. Через 24 ч после R1.1 — агрегаты из `MODELS-RU.md`: ответов ≥ 90 %, `truncated` ≤ 5 %, `actual_micro` за сутки ≪ 1 000 000, медиана `ttft_ms`.
6. Нагрузка на D1: +1 чтение на ход (`allowance`); при платной основной +2 записи на платную попытку (резерв и расчёт). Чат по-прежнему на Workers Free — следить за CPU (см. открытый вопрос WP-03).
7. Откат: `GPT_FREE_TIER_PAID_PRIMARY="false"` или `GPT_FREE_PAID_DAILY_USD="0"`; порог «Стопа» — `GPT_STOP_CHARGE_MIN_CHARS`; иначе `git revert` и guarded-деплой. Колонки и таблицы 0066 остаются, старый код их не читает.

**Дальше.** WP-05.

---

# Платный AI-чат к проду: ревью WP-03, 2026-09-30

**Итог.** Проверил коммиты WP-03 `965085d2` (код) и `8ae247a6` (SHA в STATE) по §1 и §4 WP-03 плана `10-PROD-PLAN.md` и по `AGENTS.md` §2–8, §11. Цепочки, тело запроса, классы сбоев, три попытки после фильтра, `models_cooling`, третий переключатель Z.ai, промпт, цены, паритет конфига и документы сделаны верно. Отклонения исполнителя обоснованы. Нашёл один дефект в пробе моделей и исправил его в этом коммите. Ничего не запушено и не задеплоено; Cloudflare, D1, GSC и боты не менялись.

**Что исправлено.**
- Проба `POST /api/internal/gpt-model-probe` — инструмент приёмки шага R1.1. Она считала `rate429` только по HTTP 429. Если вызов вернул не 2xx, кода ошибки у него не было.
- Но OpenRouter может ответить 200 и прислать 429 внутри потока, до первого слова. Чат такую ошибку видит: `rate_limit`, пауза модели на минуту. А проба засчитывала такой вызов в «только 200», и в долю 429 он не попадал. Тест WP-03 это закрепил: 3 ограничения на 20 вызовов давали `rate429 = 0,1`, ровно на пороге «≤ 0,1».
- Теперь:
  - у каждого неудачного вызова есть `error` — класс сбоя, как в чате. Для не-2xx он берётся из `classifyFailureResponse`: из тела 400 читается ≤ 2 КБ, и тело не возвращается;
  - `rate429` считает все `rate_limit`, и HTTP 429, и 429 внутри потока;
  - у модели есть сводка `errors`;
  - в `MODELS-RU.md` приёмка требует `errors = {}`. `bad_request` на всех вызовах значит «модель не принимает `reasoning`», `model_unavailable` — модели больше нет.
- Тест пробы дополнен: 429 внутри потока и 400 с отказом параметра. Проверен «на красный» двумя поломками: старый подсчёт 429 и вызов без кода ошибки.
- `STATE.json`: `state_commit` теперь настоящий SHA `8ae247a6`. Со словом `HEAD` он указал бы на этот коммит ревью.

**Что перепроверил.**
- Публичный каталог OpenRouter, GET без ключа:
  - у всех четырёх `REASONING_OFF_MODELS` `reasoning.mandatory: false`;
  - у `gemma-4-26b-a4b-it` 5 из 13 провайдеров в пределах `PAID_PRICE_CEILING`, и все принимают `reasoning`;
  - цены gemma 0,09/0,30 и deepseek-v4-flash 0,07854/0,15708 совпадают с кодом;
  - `minimax/minimax-m3:free` в каталоге нет.
- `agent-boundaries` падает на 7 старых импортах `lib/observability` в `agents/sotuvchi` и `channels/telegram`. К WP-03 это отношения не имеет.
- `tsc -b` 0; `typecheck:functions` 0; ESLint изменённых файлов 0.
- Тесты по одному файлу:
  - gpt-model-policy 13/13, openrouter-model-catalogue 5/5, gpt-chat 19/19, gpt-routing 6/6, gpt-zai-provider 18/18, telegram-assistant 61/61, gpt-operations 7/7, gpt-readiness 9/9, gpt-chat-stream 6/6;
  - gpt-watchdog 12/12, gpt-billing 14/14, gpt-uzum-payments 17/17, gpt-account-ui 7/7, gpt-chat-bridge 42/42, runtime-config 4/4, pages-config-parity 7/7;
  - aeo-workspace 12/12, aeo-workers 1/1, aeo-review 5/5, aeo-history 3/3.
- `scan:secrets` чисто, `test:secret-scan` 16/16, grep токенов пуст, `git diff --check` чисто, `seo-protection check` 10/10.

**Открыто (не дефекты WP-03, но проверить).**
1. **R1, CPU.** Ответ вырос с 900 до 1600 токенов. На Workers Free лимит — 10 мс CPU на запрос. Локальный худший случай (один токен на SSE-чанк, разбор и пересылка): ≈ 8 мс на ход при 900 и ≈ 16 мс при 1600. После R1 проверьте:
   - метрики Pages Functions: нет ли ошибок превышения CPU на `/api/gpt/chat`;
   - нет ли зависших резервов (`stale_reservations`).
   Если есть, уменьшите `GPT_MAX_OUTPUT_TOKENS`. Это правка конфига, код не нужен. Проба тоже разбирает ответы целиком, поэтому длинный прогон лучше дробить (`MODELS-RU.md`).
2. **S5 / WP-23, слепая проба Z.ai.** `scripts/zai-blind-eval.ts` теперь просит 1600 токенов. Но вызовы там без потока, и их режет 15 с (OpenRouter) или `ZAI_TIMEOUT_MS` (≤ 15 с). Чат же отвечает потоком до 60 с. Поэтому длинные ответы могут упасть по таймауту у любой стороны. Перед решением по Z.ai переведите пробу на поток или считайте такие таймауты ограничением стенда, а не моделью.
3. **Уровень плана.** 403 OpenRouter всегда `content_refused`: так говорят и план, и документация OpenRouter (модерация). Если OpenRouter начнёт отклонять 403 весь аккаунт, пауз не будет. Владелец узнает об этом только от сторожа (`chat_degraded` / `chat_silence`).

**Дальше.** WP-04.

---

# Платный AI-чат к проду: WP-03 — цепочка моделей, тело запроса, классификация сбоев, без MiniMax, 2026-09-30

**Итог.** Мёртвая модель MiniMax M3 `:free` убрана из цепочек и из AEO. Голова бесплатной цепочки теперь `google/gemma-4-31b-it:free`, платная основная — `google/gemma-4-26b-a4b-it`. Ответ стал длиннее: 1600 токенов вместо 900. Модели с необязательным рассуждением отвечают без него. Платные модели могут переходить между провайдерами в пределах потолка цены. Сбои OpenRouter больше не выключают модель для всех из-за вопроса одного посетителя, а 402 на платной модели не останавливает бесплатные. Появился эндпоинт пробы моделей. `GPT_FREE_TIER_PAID_PRIMARY` = `"false"`, и до WP-04 эта настройка ни на что не влияет. Ничего не запушено и не задеплоено; Cloudflare, D1, GSC и боты не менялись. План — `10-PROD-PLAN.md` §4 WP-03 (вне Git), дальше WP-04. Runbook — `docs/paid-chat/MODELS-RU.md`. Код-коммит WP-03 — `965085d2a4bcc503af9cde4a333b915edcd42808`. Следующий коммит только записывает этот SHA в STATE (правило D-006).

**Что сделано.**
- **Цепочки** (`config.ts` = `wrangler.toml`, JSON и таблица):
  - бесплатная: `google/gemma-4-31b-it:free` → `nvidia/nemotron-3-super-120b-a12b:free` → `dots-studio/dots-3-note-preview:free`;
  - пакет: `google/gemma-4-26b-a4b-it` → `mistralai/mistral-small-3.2-24b-instruct` → `google/gemma-4-31b-it:free`.
  Новый `freeChain(cfg)`, `modelChain()` не менялся: во free по-прежнему только `:free`. Сайт (`webChatChain`) и бот Javob (`telegram/service.ts`) берут `freeChain`. AEO: `AEO_MEASUREMENT_MODELS` = nemotron, dots. Комментарий к дефолтам переписан по каталогу OpenRouter от 30.09.
- **Настройки** `config.ts`:
  - `maxOutputTokens` (`GPT_MAX_OUTPUT_TOKENS`, 1600, 400..4000);
  - `firstContentTimeoutMs` (`GPT_FIRST_CONTENT_TIMEOUT_MS`, 12000, 5000..20000);
  - `freeTierPaidPrimary` (`GPT_FREE_TIER_PAID_PRIMARY`, только `"true"` включает; в `wrangler.toml` `"false"`);
  - `freePaidDailyUsd` (`GPT_FREE_PAID_DAILY_USD`, 1, 0..20);
  - `zaiEvalApproved` (`GPT_ZAI_EVAL_APPROVED`, только настоящая дата `ГГГГ-ММ-ДД`, иначе пусто).
  Все пять добавлены в `RUNTIME_CONFIG_KEYS`, `Env`, упакованный JSON и таблицу. JSON — 3226 байт из 5120.
- **Z.ai (L10):** третий переключатель `GPT_ZAI_EVAL_APPROVED`. Без даты, с несуществующей датой или без ключа цепочка без Z.ai. Если дата закоммичена, тест требует отчёт `docs/paid-chat/evals/zai-<дата>.json` (`date`, `decision: "approved"`, `sheets` — листы оценки, которые есть в репозитории). Формат описан в `ZAI-RU.md`.
- **Попытки:** модели на паузе и без ключа убираются **до** счёта трёх попыток. Цепочка больше не режется до трёх ни в `availableModels`, ни в `webChatChain`: три попытки считают обходчики (`MAX_ATTEMPTS`).
- **Тело запроса** (`buildChatBody`):
  - `reasoning: {enabled:false, exclude:true}` по списку `REASONING_OFF_MODELS` из нового `functions/platform/ai/model-policy.ts` (обе gemma, nemotron, dots). По каталогу у всех четырёх `reasoning.mandatory: false`. Список читает и AEO;
  - `allow_fallbacks: true` у платных, `false` у `:free`;
  - `max_price` — по-прежнему `priceCeiling()`.
- **Классификация OpenRouter** (`classifyFailureStatus(status, model, detail)`, `classifyFailureResponse`, `classifyFailureEnvelope`):
  - 400: читается не больше 2 КБ тела, никуда не пишется. «not a valid model / No endpoints found» → `model_unavailable` (час), иначе `bad_request` без паузы;
  - 403 → `content_refused` без паузы;
  - 402 на платной модели → `paid_credit_exhausted`: пауза шаблона `openrouter-paid/*` на 15 минут, остальные платные пропускаются, ход идёт к `:free`, срочный алерт `openrouter_credit_exhausted`;
  - 402 на `:free` и 401 → как раньше `*`;
  - все кандидаты на паузе → `models_cooling`, запрос не отправляется. Посетитель видит `model_unavailable`, владелец получает срочный `chat_models_cooling`.
  Всё это работает одинаково в JSON-пути, в потоке и в SSE-ошибках. `readBodyPrefix` вынесен в `http.ts`, `readZaiError` использует его же.
- **Чат** (`chat.ts`): `900` → `cfg.maxOutputTokens` в обоих путях. Ожидание первого слова OpenRouter — `cfg.firstContentTimeoutMs`. Тексты алертов для двух новых кодов добавлены в `alert-policy.ts`.
- **Цены** (`model-pricing.ts`): `google/gemma-4-26b-a4b-it` 0,09/0,30; `deepseek/deepseek-v4-flash` 0,07854/0,15708 (кандидат, ни в одной цепочке).
- **Промпт:** убрано «мягко предложи GPTBot.uz» (D9). Добавлено «длинный ответ: сначала суть, последнюю фразу заканчивай» и Google в списке «не утверждай, что ты официальный …».
- **Проба** `POST /api/internal/gpt-model-probe` (Bearer `GPT_BILLING_MAINTENANCE_SECRET`, проверяется до чтения тела):
  - каждой модели обеих цепочек уходит тот же потоковый запрос, что и из чата, с двумя постоянными вопросами (UZ, RU);
  - на вызов в ответе только HTTP-код, `finish_reason`, `reasoning_tokens`, `ttftMs` и машинный код ошибки, на модель — сводка с `rate429`;
  - текст ответа не возвращается и не пишется, D1 не трогается;
  - `{"model":"…","calls":20}` — доля 429 у одной модели; не больше 20 вызовов на модель и 40 всего, бюджет пробы 110 секунд.
- **Документы:** новый `docs/paid-chat/MODELS-RU.md` (цепочки, запрос, классы сбоев, проба и пороги, агрегаты, откат); `ZAI-RU.md` (третий переключатель, отчёт); `ALERTS-RU.md` (два кода теперь живые). `scripts/zai-blind-eval.ts` берёт лимит ответа и платную модель из рабочей конфигурации. `npm test` += `tests/gpt-model-policy.test.ts`.

**Отклонения от плана и почему.**
1. **Три попытки считают обходчики, а не `slice(0, 3)` в `availableModels`.** План: сначала фильтр, потом срез. Сделано строже: `availableModels` только фильтрует, а обходчики считают попытки (`MAX_ATTEMPTS`). Иначе после 402 на платной модели пропущенные платные всё равно занимали бы места среза. Например, `[zai, gemma-26b, mistral]` без `:free` в хвосте: ход падал бы, хотя `:free` жива. По той же причине `webChatChain` больше не режет цепочку до трёх.
2. **`GPT_FREE_TIER_PAID_PRIMARY` и `GPT_FREE_PAID_DAILY_USD` только разобраны и лежат в конфиге.** Цепочку они не меняют. Подключение `[paid, ...freeChain]` в плане стоит в WP-04 вместе с бюджетом $1. Если подключить раньше, платная модель стояла бы перед бесплатными посетителями без потолка трат. Тест в `gpt-operations` закрепляет, что `true` не делает бесплатную цепочку платной.
3. **Порядок Z.ai.** `[zai, paidPrimary, free…]` из плана — это бесплатная цепочка после WP-04. Сейчас `[zai, ...freeChain]` и `[zai, ...платная цепочка]`.
4. **Разбор `finish_reason` и `reasoning_tokens` в SSE** (по плану WP-04) сделан сейчас: без него проба не видит рассуждение. Насос чата эти поля пока не читает. Заодно чанк только с `usage` без `prompt_tokens` теперь не теряется.
5. **Список `REASONING_OFF_MODELS` — по каталогу, а не по живой пробе.** Живой пробы нет: локально нет ключа, а прод трогать нельзя. Каталог 30.09 показывает `reasoning.mandatory: false` у всех четырёх, у обеих gemma ещё `default_enabled: false`. Подтверждение — проба после R1. Если модель ответит 400, чат не ляжет: такой 400 не ставит паузу.
6. **В AEO gemma-4-31b:free не добавлена**, MiniMax только убран. Её доля 429 ещё не доказана, а новая модель поменяла бы сравнение AEO. Тест теперь требует, чтобы модели AEO входили в бесплатную цепочку: тогда их видит часовая проверка каталога. MiniMax в AEO умер незаметно именно потому, что эта проверка его не видела.
7. **Цена deepseek-v4-flash** — 0,07854/0,15708 по каталогу на момент работы. План писал 0,0818/0,1635, цена изменилась в тот же день.
8. **Пауза `openrouter-paid/*` — 15 минут.** В плане срока нет. 15 минут — как у баланса Z.ai: пополнение делает человек.
9. **Проба меряет только OpenRouter.** У Z.ai своя слепая проба. Ответ пробы включает `firstContentTimeoutMs`, чтобы сравнить с `ttftMsMedian`.
10. **Мелкое:** 404 остаётся `model_unavailable` (план говорит только о 400/402/403). Слепая проба Z.ai обещает «тот же запрос, что у чата», поэтому она теперь берёт 1600 токенов и платную основную вместо 900 и mistral. В промпт добавлен Google (карта `01` §2.2 п. 10): голова цепочки теперь Gemma.

**Проверки.**
- `tsc -b` 0; `typecheck:functions` 0; ESLint изменённых файлов 0; `git diff --check` чисто.
- Тесты по одному файлу:
  - новый `gpt-model-policy` 13/13;
  - openrouter-model-catalogue 5/5, gpt-chat 19/19, gpt-routing 6/6, gpt-zai-provider 18/18, telegram-assistant 61/61 (+1: бот просит только `:free`), gpt-operations 7/7;
  - gpt-readiness 9/9, gpt-chat-stream 6/6, gpt-watchdog 12/12, gpt-billing 14/14, gpt-uzum-payments 17/17, runtime-config 4/4, pages-config-parity 7/7, aeo-workspace 12/12, aeo-workers 1/1, aeo-review 5/5.
- Весь список `npm test` по одному файлу: 61 файл, 766/768. Падают только две известные датозависимые фикстуры `lead-radar`.
- Проверка «на красный»: шесть временных поломок ловятся тестами. Поломки: срез до фильтра, 403 с паузой, 402 как аккаунт, Z.ai без даты, `allow_fallbacks` всегда false, любой 400 как неизвестная модель.
- `scan:secrets` чисто (3146 файлов), `test:secret-scan` 16/16, grep токенов пуст, `seo-protection check` 10/10. `src/`, `content/` и prerender не менялись.
- `grep -rn minimax functions src wrangler.toml` → только `src/admin/lib/aeo-models.ts` (подпись старых наблюдений).
- `agent-boundaries` (не входит в `npm test`) падает на старых импортах `functions/agents/sotuvchi/**` и `functions/channels/telegram/rate-limit.ts` из `functions/lib/observability`. Это не WP-03: новый `platform/ai/model-policy.ts` ничего не импортирует.

**Для релиза R1.**
1. WP-03 уходит **в том же релизе**, что и WP-02. Иначе часовая проверка будет раз в час блокировать MiniMax и слать `catalogue_model_unavailable`.
2. **Шаг R1.1 — проба** (`MODELS-RU.md`), после деплоя Pages и секрета:
   - все модели × 2: только `200`, у `reasoningOff` `reasoningTokensMax = 0`;
   - `{"model":"google/gemma-4-31b-it:free","calls":20}`: `rate429` ≤ 0,1. Иначе gemma уходит из головы `:free` правкой `OPENROUTER_MODEL_FREE*` (без кода).
   Пока `openrouter_free_tier_50rpd` приходит, аккаунт на бесплатном уровне: полная проба съедает 26 из 50 дневных запросов к `:free` (чат, бот и AEO вместе). Запускать её утром по Ташкенту или урезать `calls`.
3. `GPT_FREE_TIER_PAID_PRIMARY` → `"true"` только после WP-04 и пробы. До WP-04 она ни на что не влияет.
4. Приёмка «в `gpt_model_health` нет строк minimax»: старая строка с прошедшим `blocked_until` останется, таблицу никто не чистит. Проверять нужно действующие паузы (SQL в `MODELS-RU.md`), через час после деплоя их должно быть 0.
5. Платные модели в R1 вызываются только для пакетов, а оплата выключена. Когда их начнут вызывать (пакеты или WP-04), без кредитов OpenRouter платная цепочка ответит через `:free`, а владелец будет раз в час получать `openrouter_credit_exhausted`. Кредиты — вход владельца из §8.
6. Откат: цепочку — правкой `OPENROUTER_MODEL_*`, длину ответа — `GPT_MAX_OUTPUT_TOKENS`, остальное — `git revert` и guarded-деплой.

**Дальше.** WP-04.

---

# Платный AI-чат к проду: ревью WP-02, 2026-09-30

**Итог.** Проверил коммиты WP-02 `31fb22e1` (код) и `77cffdd2` (SHA в STATE) по §1 и §4 WP-02 плана `10-PROD-PLAN.md` и по `AGENTS.md` §2–8, §11. Доставка алертов, потолок в час, аренды, SQL сторожа, шаги эндпоинта обслуживания, проверка моделей и тесты сделаны верно. Нашёл один дефект и исправил его в этом коммите. Ничего не запушено и не задеплоено; Cloudflare, D1, GSC и боты не менялись.

**Что исправлено.**
- `chat_no_turns` WP-02 сделал срочным (своё отклонение 2), но считал строки `gpt_sessions`. Сессию создаёт `POST /api/gpt/session`: без Turnstile и без лимита в коде. Поэтому один клиент, трижды вызвавший этот адрес, будил владельца каждый час, пока в окне 180 минут не было ходов. Тихой ночью это легко. То же мог сделать один посетитель: у страниц RU и UZ разные сессии. Если у него не прошёл Turnstile на сервере, получалось 2–3 сессии без хода.
- Теперь `WatchdogStore.sessions` считает **разные хеши IP** (`COUNT(DISTINCT hashed_ip)`), а не строки. Порог тот же: `GPT_WATCHDOG_MIN_TURNS` (3).
- Новый тест в `tests/gpt-watchdog.test.ts`: 10 сессий с одного IP не поднимают `chat_no_turns`, а три разных IP без резервов поднимают. Проверен «на красный»: со старым `COUNT(*)` тест падает. Хелпер `session()` теперь пишет `hashed_ip`. `ALERTS-RU.md` обновлён.

**Что перепроверил.**
- Форму ответа OpenRouter проверил публичными GET без ключа:
  - `/api/v1/models/{id}/endpoints` работает и с суффиксом `:free`;
  - у `minimax/minimax-m3:free` список `endpoints: []`;
  - неизвестная модель отвечает 404;
  - у моделей текущей цепочки цены в пределах потолка 0,1 / 0,32.
- Коды `click_*` и `uzum_*` записываются только после проверки подписи или Basic auth. Колбэк Uzum Checkout на неизвестный заказ отвечает `{}` и алерт не пишет.
- Эндпоинт обслуживания проверяет Bearer до чтения тела. В ответе только коды и id моделей.
- Сообщение владельцу — простой текст без `parse_mode`, в нём только коды.
- `tsc -b` 0; `typecheck:functions` 0; ESLint изменённых файлов 0.
- Тесты по одному файлу: gpt-watchdog 12/12, gpt-operations 7/7, gpt-zai-provider 18/18, gpt-uzum-payments 17/17, gpt-readiness 9/9, gpt-routing 6/6, gpt-chat 18/18, gpt-billing 14/14, gpt-chat-stream 6/6, runtime-config 4/4, pages-config-parity 7/7, openrouter-model-catalogue 4/4.
- `scan:secrets` чисто, `test:secret-scan` 16/16, grep токенов пуст, `git diff --check` чисто, `seo-protection check` 10/10.

**Открытые вопросы (не дефекты WP-02, но важны для R1 и WP-04).**
1. **WP-04.** Сторож считает «завершённым без ответа» и ход, который посетитель остановил кнопкой «Стоп», и отклонённый запрос: оба дают `released`. Один посетитель тихой ночью, трижды нажавший «Стоп», поднимет срочный `chat_silence`. Отличить их можно только по колонкам `cancel_reason`/`outcome` из 0066. Когда они появятся, эти ходы надо исключить из счёта сторожа.
2. **WP-04, миграция 0066.** Стоит добавить индекс `gpt_service_alerts(org_id, delivered_at, created_at)`. Выборку пачки делает каждый неудачный ход и каждый тик крона.
3. **R1.** До 0066 сторож (раз в 10 минут), диагностика (каждые 15 минут) и `chat_no_turns` читают `gpt_turn_reservations` и `gpt_sessions` целиком. С 01.09.2026 D1 на бесплатном плане отказывает, если за сутки прочитано больше лимита строк. Поэтому 0066 с индексами по времени надо накатить в том же релизе, как и стоит в плане.
4. **После R1.** `catalogue_check_failed` теперь поднимается, если не ответил любой из 6 запросов к эндпоинтам, а не один запрос каталога. Код срочный (`catalogue_*`, как в плане). Если ложных тревог окажется много, стоит слать его только при сбое всех запросов.

**Дальше.** WP-03.

---

# Платный AI-чат к проду: WP-02 — алерты без привязки к режиму, сторож тишины, крон обслуживания, 2026-09-30

**Итог.** Сбой чата теперь записывается и доходит до владельца в любом режиме оплаты. Срочные коды приходят в Telegram одним сообщением на пачку, с общим потолком 6 сообщений в час; фоновые коды сами не шлются. Сторож тишины ловит «ходы есть, ответов нет». Он работает от крона обслуживания Worker'а (каждые 15 минут) и, вторым контуром, от каждого неудачного хода. Эндпоинт обслуживания разбит на шаги: у каждого свой try/catch и бюджет времени. Есть учебный алерт `{"drill":true}`. Секрет `GPT_BILLING_MAINTENANCE_SECRET` только назван и описан, **не задан**. Ничего не запушено и не задеплоено; Cloudflare, D1, GSC и боты не менялись. План — `10-PROD-PLAN.md` §4 WP-02 (вне Git), дальше WP-03. Runbook — `docs/paid-chat/ALERTS-RU.md`. Код-коммит WP-02 — `31fb22e194aa9f852fbe6efd2524d63eeb0ae1bc`. Следующий коммит только записывает этот SHA в STATE (правило D-006).

**Что сделано.**
- `billing-maintenance-store.ts`:
  - `recordServiceAlert` пишет в любом режиме (убран выход при `test`);
  - новый `deliverServiceAlerts(env, now)` не зависит от `GPT_BILLING_MODE`. Условия: есть канал (`GPT_NOTIFY_*` или фолбэк на бот-ассистента, общий `resolveOwnerNotify`) и `GPT_ALERTS_ENABLED !== "false"`. Пачку срочных строк забирает один `UPDATE … RETURNING`, поэтому крон и сбойный ход не пришлют её дважды. Потолок `GPT_ALERTS_MAX_PER_HOUR` считается через `consumeRateLimit(db,'service_alert','global')`; пачка сверх потолка ждёт следующего часа. Неудачная отправка повторяется через 5 минут. Строки старше 24 часов не шлются;
  - `maintainBilling`: только уборка и outbox оплат, live-гейт остался только у outbox. Текст «GPTBot Plus» заменён на «GPTBot.uz · AI paket».
- Новый `alert-policy.ts` — важность (GLOB-шаблоны, те же в SQL), id строки (код:час или код:d<сутки>), текст сообщения.
- Новый `watchdog-store.ts`: `WatchdogStore(db, org)` (весь SQL здесь, org в каждом WHERE), чистая функция `watchdogCodes` и `runWatchdog(env, now)` с арендой `gpt_billing_ops` task `watchdog` на 10 минут. Проверки: `chat_silence`, `chat_degraded`, `chat_no_turns`, `stale_reservations` и `chat_truncation_high` (последняя пропускается, пока 0066 не добавит `outcome`).
- `operator-alert.ts`: `alertOperator(env, code, {watchdog?}, now)` = записать → (сторож) → доставить, никогда не бросает. `chat.ts`: оба пути отказа вызывают его с `watchdog: true`; уборки на пути отказа больше нет. Z.ai-события идут тем же путём.
- `billing-operations-store.ts` `checkBillingProviders`: вместо каталога на 762 КБ — `GET /api/v1/models/{id}/endpoints` для ≤ 6 моделей цепочки параллельно. 404, пустой список эндпоинтов или ни одного эндпоинта в потолке → модель блокируется на час (`model_unavailable`) и пишется `catalogue_model_unavailable`. Сеть или 5xx → `catalogue_check_failed`, модель не блокируется. Ключ проверяется через `GET /api/v1/key`: `is_free_tier` → `openrouter_free_tier_50rpd`, `limit_remaining < 1` → `openrouter_key_credit_low` (оба раз в сутки). Не-200 → `openrouter_key_unavailable`. Форма ответа API проверена 30.09 публичными GET без ключа: `minimax/minimax-m3:free` отдаёт `endpoints: []`, неизвестная модель — 404.
- `model-pricing.ts`: `PAID_PRICE_CEILING` (0,1 / 0,32 / 0), `FREE_PRICE_CEILING`, `priceCeiling(model)`. `buildChatBody` берёт `max_price` оттуда (копией), чтобы проверка и запрос не расходились.
- `internal/gpt-billing-maintenance.ts`: шаги providers (6 с) → watchdog (2 с) → alerts (5 с) → maintenance (4 с) → diagnostics (2 с), в сумме 19 с. Упавший шаг даёт 503 и список `failed`, остальные шаги выполняются. Тело `{"drill":true}` записывает срочный `drill` (один в час), и этот же тик его доставляет. Неверный JSON → 400.
- `workers/gpt-billing-maintenance.ts`: таймаут 30 → 20 с. `wrangler.automation.toml [vars]`: `GPT_BILLING_MAINTENANCE_ENABLED = "true"`, имя секрета в шапке.
- V-настройки `GPT_ALERTS_ENABLED="true"`, `GPT_ALERTS_MAX_PER_HOUR="6"`, `GPT_WATCHDOG_WINDOW_MINUTES="180"`, `GPT_WATCHDOG_MIN_TURNS="3"` добавлены в упакованный JSON и во вложенную таблицу `wrangler.toml`, в `RUNTIME_CONFIG_KEYS` и в `Env`. JSON — 3088 байт из 5120: отдельных переменных Pages это не добавляет, секрет добавит одну при релизе.
- Документы: новый `docs/paid-chat/ALERTS-RU.md` (важность, доставка, сторож, крон, настройки, секрет через stdin, drill, проверочные агрегаты, откат); строчки в `ZAI-RU.md` и `UZUM-RU.md` согласованы. `npm test` += `tests/gpt-watchdog.test.ts`.

**Отклонения от плана и почему.**
1. **Прямой пуш Z.ai убран.** `operator-alert.ts` слал `zai_*` владельцу напрямую, в обход записи, и делал это только потому, что доставка была привязана к live. Теперь `zai_*` срочные, и без удаления прямого пуша владелец получал бы одно событие дважды: пуш и доставку той же строки кроном. Отдельный счётчик `operator_alert` больше не используется, действует общий потолок.
2. **Важность уточнена по коду.**
   - `chat_no_turns` сделан срочным. Иначе он не доходил бы никогда: фоновый код попадает только в срочное сообщение, а `chat_degraded` без ходов не поднимается.
   - `chat_model_unavailable` срочный: код возникает, только когда отклонена вся цепочка (простой 04.09; `01` §3 п.3).
   - `openrouter_free_tier_50rpd` и `openrouter_key_credit_low` срочные, но раз в сутки. §8 п.4 ждёт, что они скажут владельцу, когда пополнить счёт; раз в час это 24 сообщения в сутки.
   - Фоновые: `stale_reservations`, `chat_truncation_high`, `openrouter_key_unavailable`, `payme_*` (L17) и коды отдельных ходов.
   - `chat_models_cooling` и `openrouter_credit_exhausted` уже в срочном списке: их поднимет WP-03.
3. **Фон — в каждом срочном сообщении**, строкой «Фон за час», а не только в `chat_degraded`. Сообщений от этого не больше, а причина видна сразу. Фоновые строки никогда не помечаются доставленными, поэтому уборка теперь удаляет алерты старше 93 дней **по возрасту** (раньше — только доставленные; иначе таблица росла бы без конца).
4. `chat_degraded` не поднимается вместе с `chat_silence`: тишина говорит больше.
5. **Платёжные роуты не тронуты.** Click, Payme и Uzum по-прежнему после записи алерта вызывают `maintainBilling`, а тот больше не доставляет алерты. Их срочные коды доходят через крон (≤ 15 мин) или вместе с ближайшей доставкой из чата. Раньше такая доставка была только в live, а live в проде не включался. WP-13/14/15 при желании переведут эти места на `alertOperator` одной строкой.
6. **`gpt_sessions` без `org_id`.** Это собственная таблица чата, она старше платформы. Её читает только org чата (`BILLING_ORG`); для остальных org счётчик сессий равен 0, и это закреплено тестом.
7. **Ответ эндпоинта** теперь содержит итог каждого шага (`providers`, `watchdog`, `alerts`, `failed`) плюс прежние поля. Worker по-прежнему смотрит только на `ok`.
8. **Dry-run Worker'а не запускал:** правило задачи запрещает любой `wrangler deploy`. Var в `wrangler.automation.toml` проверяет тест, код хука изменился на одну константу.

**Проверки.** `tsc -b` 0; `typecheck:functions` 0; `typecheck:lead-radar` 0; ESLint изменённых файлов 0. Тесты по одному: gpt-watchdog 11/11 (новый), gpt-operations 7/7 (+1 тест каталога), gpt-zai-provider 18/18, gpt-uzum-payments 17/17, gpt-readiness 9/9, gpt-routing 6/6, gpt-chat 18/18, gpt-billing 14/14, gpt-chat-stream 6/6, runtime-config 4/4, pages-config-parity 7/7, openrouter-model-catalogue 4/4, lead-radar-worker 17/17. Весь список `npm test` по одному файлу: 60 файлов, 749/751; падают только две известные датозависимые фикстуры `lead-radar`. Проверка «на красный»: шесть временных поломок ловятся тестами. Поломки: запись снова зависит от режима, путь отказа без сторожа, уборка только доставленных, нет потолка, фон пейджит, тишина без трафика. `scan:secrets` чисто, `test:secret-scan` 16/16, grep токенов пуст, `git diff --check` чисто. `src/`, `content/` и prerender не менялись; `seo-protection check` 10/10.

**Для релиза R1.**
1. Порядок из §3: D1 (0065, 0066) → Pages → секрет → передеплой Pages → Worker → drill. Команды для секрета есть в `ALERTS-RU.md`: значение из `randomBytes(32)`, через временный файл без перевода строки, `< файл` в `wrangler pages secret put` и `wrangler secret put -c wrangler.automation.toml`, нигде не печатается. Секрет Pages вступает в силу только со следующим деплоем.
2. В dry-run Worker'а среди привязок должны быть `GPT_BILLING_MAINTENANCE_ENABLED ("true")` и `LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED ("false")`.
3. Drill: ответ `alerts.status = "sent"`, сообщение в Telegram приходит меньше чем за минуту. Через 30 минут в `gpt_billing_ops` должны быть строки `catalogue` и `watchdog`, а у срочных строк `gpt_service_alerts` заполнен `delivered_at`. Агрегаты — в `ALERTS-RU.md`.
4. **WP-03 должен уйти в том же релизе.** `minimax/minimax-m3:free` сейчас голова бесплатной цепочки, а эндпоинтов у неё нет. Без WP-03 часовая проверка будет блокировать её и слать `catalogue_model_unavailable` каждый час.
5. Если у аккаунта OpenRouter не было покупок, после R1 раз в сутки будет приходить `openrouter_free_tier_50rpd`. Это вход владельца из §8 п.4.
6. По желанию для 0066 (WP-04): индекс `gpt_service_alerts(org_id, delivered_at, created_at)`. Сейчас выборка пачки читает всю таблицу, это около 1000 строк при хранении 93 дня.
7. Откат: `GPT_ALERTS_ENABLED="false"` (запись продолжается) или `GPT_BILLING_MAINTENANCE_ENABLED="false"` в Worker'е; код — `git revert` и guarded-деплой.

**Дальше.** WP-03.

---

# Платный AI-чат к проду: ревью WP-01, 2026-09-30

**Итог.** Проверил коммиты WP-01 `a66586d3` (код) и `cecdfa91` (SHA в STATE) по §1 и §4 WP-01 плана `10-PROD-PLAN.md` и по `AGENTS.md` §2–8, §11. Выключение autosend сделано верно и доказано тестами. В guard'е миграций, который WP-01 закрывал, нашлись две дыры; этот коммит их закрывает тестами. Ещё уточнён запрос проверки после релиза. Ничего не запушено и не задеплоено; Cloudflare, D1, GSC и боты не менялись.

**Что исправлено.**
1. `assertCleanRuntime` в `scripts/release/pages-production.ts` пропускал два случая:
   - Перенос в индексе (`git mv migrations/0066_x.sql docs/`). `git diff --name-only HEAD` показывает только новый путь, и guard считал дерево чистым, хотя миграции из HEAD в рабочем дереве нет. То же для файла из `functions/` или `src/`.
   - Путь не в ASCII. Git по умолчанию пишет его в кавычках и восьмеричными кодами (`"content/\321\201..."`), и такой путь не совпадает ни с одним runtime-префиксом. Новый `content/статья.md` релиз не блокировал.
   Теперь `git diff --name-only --no-renames -z HEAD` и `git ls-files --others --exclude-standard -z`. В `tests/pages-production-release.test.ts` добавлены оба случая на том же временном git-репозитории. Каждый проверен «на красный»: со старой командой тест падает, с новой проходит.
2. Проверка через 24 ч после деплоя Worker'а (раздел WP-01 ниже, п. 3) не искала статус `failed`. Эффект получает `failed` только из `dispatching`, то есть Worker уже взял получателя и начал отправку. Теперь в списке запрещённых статусов `dispatching`, `sent`, `failed` и `ambiguous`. `reserved` и `canceled` не показывают отправку: `reserved` пишется при создании кампании, а создание по-прежнему разрешено.

**Что перепроверил.**
- `tsc -b` 0; `typecheck:functions` 0; ESLint на файлах WP-01 и этого коммита 0.
- Тесты по одному: pages-config-parity 7/7, runtime-config 4/4, pages-production-release 8/8, lead-radar-worker 17/17, lead-radar-release-manifest 11/11, lead-radar-campaign-ui 15/15, lead-radar-0041-reconciliation 9/9, lead-radar-release-gate 12/12.
- `lead-radar-api` 4/10: все 6 падений — 503 на проверке схемы. Это совпадает с находкой WP-01 про 0059. Относительно `f53cabcb` ветка добавила в Lead Radar-область только `0065` (таблица `gpt_`, фильтр схемы её не видит).
- grep AUTOSEND по `wrangler*.toml` и `pages-config-parity` — только `false`. `scan:secrets` чисто, `test:secret-scan` 16/16, grep токенов пуст, `git diff --check` чисто, `seo-protection check` 10/10.
- Dry-run Worker'а сам не запускал: правило ревью запрещает любой `wrangler deploy`. Бандл WP-01 не меняет, это видно по диффу: только var и тесты.

**Что подтверждено по коду.**
- Отправляет только Worker (`PrivateTelegramCampaignSender` в консьюмере). Pages отклоняет `start`/`resume` (409 `lead_radar_campaign_autosend_paused`), а preflight добавляет блокер `autosend_paused`. Worker не импортирует `runtime-config.ts`, поэтому коммиты `e1ac7c8c`, `92722c0c`, `bb931b95` в его бандл не попадают. Отклонение 1 из WP-01 верно.
- История `workers/`, `functions/platform/lead-radar` и `functions/platform/automation` после выгрузки 04.09 08:36Z: только `48e1d206` (хук обслуживания биллинга). `25e1536c` и `199d5afb` от 03.09 старше выгрузки.
- Тест Worker'а доказывает именно флаг: тот же конфиг, где изменён только autosend, ставит в очередь и отправляет ровно одно сообщение.

**Замечание для релиза (не дефект кода).** Guard работает на `stamp`, `check` и `deploy`, то есть после шага 3 релиза (`migrations apply --remote`). Незакоммиченную миграцию он заметит, но уже после её применения к D1. Поэтому перед `migrations apply --remote` вывод `git status --porcelain -- migrations` должен быть пустым, а `migrations list --remote` — показывать ровно ожидаемые файлы (§1 плана, шаг 3).

**Дальше.** WP-02.

---

# Платный AI-чат к проду: WP-01 — Lead Radar AUTOSEND=false и гигиена релиза, 2026-09-30

**Итог.** Автоотправка кампаний Lead Radar выключена во всех четырёх местах, и тесты теперь доказывают, что отправки нет и на Pages, и в Worker'е. Guard деплоя блокирует незакоммиченную миграцию. Строка про деплой в `AGENTS.md` исправлена. Передеплой Worker'а подготовлен (dry-run), но **не выполнен**. Ничего не запушено и не задеплоено; Cloudflare, D1, GSC и боты не менялись. План — `10-PROD-PLAN.md` §4 WP-01 (вне Git), дальше WP-02. Код-коммит WP-01 — `a66586d3ca90cf9b60887703bb525fa0e62b8e4d`. Следующий коммит только записывает этот SHA в STATE (правило D-006).

**Что сделано.**
- `LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED = "false"`:
  - `wrangler.toml` — упакованный JSON (его читает прод) и вложенная таблица;
  - `wrangler.automation.toml` — копия, которую читает Worker; отправляет именно он;
  - пин в `tests/pages-config-parity.test.ts` — с датой и D12.
  Остальные флаги (`CAMPAIGN`, `ACCOUNT`, `CONTACT`) не тронуты. Кампанию можно подготовить и утвердить. Кнопки «Запустить» и «Возобновить» API отклоняет (409 `lead_radar_campaign_autosend_paused`). Крон кампании в очередь не ставит, а консьюмер подтверждает сообщение без захвата получателя.
- Новые тесты:
  - `pages-config-parity`: копия Worker'а совпадает с Pages по всем флагам Lead Radar, autosend выключен. Отдельный тест собирает capabilities из упакованного JSON: кампании доступны, autosend выключен.
  - `lead-radar-worker`: с флагами из `wrangler.automation.toml` крон ничего не ставит в очередь, консьюмер ничего не отправляет, получатель остаётся `pending`. Тот же конфиг, где изменён только autosend, отправляет ровно одно сообщение. Значит, держит именно флаг, а не отсутствующая привязка или тенант.
  - `pages-production-release`: `migrations/` считается runtime-файлом. На настоящем временном git-репозитории новая или изменённая миграция блокирует релиз, а `docs/` — нет.
  - Каждый новый тест проверен «на красный»: он падает, если вернуть `true` в Worker или в упакованный JSON либо убрать правило `migrations`.
- `scripts/release/pages-production.ts`: `runtimeFile` учитывает `migrations/`, поэтому `stamp`, `check` и `deploy` отказывают при незакоммиченной миграции. `runtimeFile` и `assertCleanRuntime` экспортированы для теста.
- `AGENTS.md` §2: «Deploy = push в main» → Direct Upload через `deploy_runner.py` после `build:production`, только по команде; Worker — отдельно, через `--dry-run`.
- `tests/lead-radar-worker.test.ts`: в фикстуре кампании была дата `expiresAt` 2026-09-24. Фикстура идёт по реальным часам, поэтому с 24.09 падали 7 из 16 тестов. Теперь дата считается от часов фикстуры (+30 дней). Нужно и новому тесту, и приёмке Worker'а.
- `tests/helpers/wrangler-vars.ts`: чтение `[vars]` Worker'а для двух тестов.

**Подготовка передеплоя Worker'а `gptbot-automation` (не выполнялся).**
- Активная версия `770dc25f-0aad-472f-b452-23f4cbf92a84` от 2026-09-04T08:36:42Z. Проверено read-only: `wrangler deployments list` и `versions view`. Её 23 vars совпадают с `wrangler.automation.toml` на HEAD один к одному, кроме AUTOSEND: в проде `"true"`. Секреты (только имена): `FIRECRAWL_API_KEY`, `LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY`, `LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN`. `GPT_BILLING_MAINTENANCE_SECRET` нет — его добавит WP-02.
- `wrangler deploy -c wrangler.automation.toml --dry-run --outdir <scratch>`: ok, 1379,42 KiB / gzip 301,87 KiB. Бандл до и после WP-01 совпадает побайтно: WP-01 меняет только var.
- Что принесёт передеплой. Список собран по metafile бандла: 96 своих файлов плюс `libphonenumber-js`, а не только три каталога из плана. База — последний коммит, затрагивающий эти файлы, до выгрузки: `4874e86c`, 04.09 06:53Z. Метаданных коммита у версии Worker'а нет.
  - `48e1d206` (06.09): крон вызывает `runGptBillingMaintenance`. Без `GPT_BILLING_MAINTENANCE_ENABLED="true"` и секрета вызов ничего не делает; их включает WP-02.
  - `c4037f2b` (18.09) и `2cea30dc` (29.09): `src/shared/site-config.ts` (`HOME_HREFLANG`) и `src/shared/audit.ts` (`HOME_NODE` в SEO-аудите). В бандл они попадают через seo-autopilot; на Lead Radar не влияют.
  - `functions/platform/lead-radar/**`, `functions/platform/automation/**` и `workers/` (кроме хука выше) с 03.09 не менялись.
  - Если выгрузка 04.09 шла из дерева старше `4874e86c`, добавятся ещё `7b27ec42`, `546bc893` и `4874e86c` (04.09). В них только логирование ошибок в LLM-роутере, circuit breaker и usage-store плюс новый `functions/lib/observability.ts`.
- D1, read-only агрегат на 30.09: кампаний 0, эффектов отправки 0 (за всё время и за 24 ч), аккаунтов Telegram: 1 `connected`, 12 `revoked`. Висящих кампаний нет, поэтому порядок «Pages → Worker» без риска.

**Отклонения от плана и почему.**
1. План называет коммиты `e1ac7c8c`, `92722c0c` и `bb931b95`. В бандл Worker'а они не входят: там типы в `functions/_types.ts`, а `runtime-config.ts` и `wrangler.toml` относятся к Pages. Настоящий список изменений — выше, он собран по бандлу.
2. «Коммит 04.09» однозначно не определить: у версии Worker'а нет метаданных коммита. За базу взят последний коммит с входными файлами до времени выгрузки, остаток неопределённости описан выше.
3. Добавлены тесты сверх плана: паритет Worker'а с Pages и поведение Worker'а на отгружаемом конфиге. Четыре места из плана закрепляли только Pages, а отправляет Worker.
4. Починена просроченная дата в фикстуре `lead-radar-worker` (см. выше). Поведение кода не менялось.
5. `test:lead-radar` целиком не зелёный. Эти падения есть и до WP-01: ветка не меняет ни код Lead Radar, ни эти тесты относительно `f53cabcb`. В `npm test` эти файлы не входят, кроме `lead-radar`.
   - `lead-radar` — 2 падения. Это известные датозависимые тесты: с часами на 2026-09-20 проходят 35/35.
   - `lead-radar-api` — 6 падений; `lead-radar-telegram-campaign-api` — 16 падений, после чего файл висит до таймаута 900 с. Причина общая, и дело не в датах: `lead_radar_schema_unavailable`. Подробности — в находке ниже.

**Находка вне WP (не чинил, нужен отдельный пакет Lead Radar).** Миграция `0059_lead_radar_signal_chats.sql` (03.09) добавила `lead_radar_signal_chats`. Исключения в `functions/platform/lead-radar/schema-contract.ts` её не знают, поэтому отпечаток целевой схемы Lead Radar не сходится: `schema_fingerprint_mismatch`. Бисект на фикстуре: до 0058 `pass`, с 0059 `blocked`; 0064 и 0065 ни при чём. Раз 0059 в проде применена, админ-API Lead Radar, который вызывает `assertLeadRadarRuntimeSchema` (поиски, контакты, кампании), вероятно, отвечает 503 с 03.09. В проде не проверял. Починка — добавить таблицу в список исключений с тестом. Она снова откроет админку Lead Radar, поэтому решать владельцу.

**Проверки.** `tsc -b` 0; `typecheck:functions` 0; ESLint изменённых файлов 0. Затронутые тесты по одному: pages-config-parity 7/7, runtime-config 4/4, pages-production-release 8/8, lead-radar-worker 17/17 (было 9/16). `test:lead-radar` по одному файлу — 690 pass / 24 fail; до WP-01 было 682 / 31. Разница — починенные 7 тестов `lead-radar-worker` и новый тест. Все 24 оставшихся падения были и до WP-01: 2 в `lead-radar`, 6 в `lead-radar-api`, 16 в `lead-radar-telegram-campaign-api`, который ещё и висит до таймаута (отклонение 5). `lead-radar-release-manifest` 11/11, `lead-radar-campaign-ui` 15/15. `scan:secrets` чисто (3138 файлов), `test:secret-scan` 16/16, grep токенов пуст, `git diff --check` чисто. `src/`, `content/` и prerender не менялись; `seo-protection check` 10/10.

**Для релиза R1 (Worker; Pages по §1 плана).**
1. Сначала Pages. Упакованный JSON выключит autosend в админке и API, но Worker до своего деплоя читает свою копию, где `"true"`. Поэтому Worker выкатывать в том же окне, после секрета WP-02.
2. `npx wrangler deploy -c wrangler.automation.toml --dry-run --outdir <tmp>`. В списке привязок должно быть `AUTOSEND ("false")` и `GPT_BILLING_MAINTENANCE_ENABLED` (WP-02). Затем `npx wrangler deploy -c wrangler.automation.toml`.
3. После деплоя: `wrangler versions view <новая>` → AUTOSEND `"false"`; capabilities Lead Radar → `campaignAutoSendEnabled=false`. Через 24 ч агрегат `SELECT status, COUNT(*) FROM lead_radar_tg_campaign_effects WHERE updated_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day') GROUP BY status` не должен содержать `dispatching`, `sent`, `failed` или `ambiguous` (`failed` добавлен ревью: он бывает только после `dispatching`).
4. Откат: `wrangler rollback` на `770dc25f` вернёт AUTOSEND=true. После любого отката сразу снова деплой с `false`.

---

# Платный AI-чат к проду: ревью WP-00, 2026-09-30

**Итог.** Проверил четыре коммита WP-00 (`c209366e`, `208bd0a3`, `ed2a918d`, `34fca360`) по §1 и §4 WP-00 плана `10-PROD-PLAN.md` и по `AGENTS.md` §2–8, §11. Дефектов в коде не нашёл, и этот коммит код не меняет. Исправлена только запись в STATE: вместо заглушки `"HEAD"` там теперь настоящий SHA `34fca360dff16d67fecf2f3f1d5e21e7fd1bc1e9`. Этого требует `AGENTS.md` §9, а по правилу D-006 `last_commit` — это код-коммит этапа; поле `state_commit` указывает на этот коммит, в нём только метаданные. Ничего не запушено и не задеплоено.

**Что перепроверил.**
- `tsc -b`: 0. `typecheck:functions`: 0. ESLint на файлах WP-00: 0.
- Файлы WP по одному: gpt-readiness 9/9, gpt-account-ui 7/7, gpt-uzum-payments 17/17, gpt-zai-provider 18/18, gpt-billing 14/14, gpt-chat-handoff-link 11/11, telegram-web-handoff 21/21, runtime-config 4/4, pages-config-parity 5/5.
- Все файлы `npm test` по одному: 735/737. Падают только две известные датозависимые фикстуры в `lead-radar`; WP-00 файлы Lead Radar не трогает.
- `build:fast`: 0. `seo-protection check`: 10/10 без изменений. `scan:secrets` чисто, grep токенов пуст.
- Прод `a61963f1` — предок HEAD. `.serena/` исключён и в индекс не попал.

**Что подтверждено по коду.**
- Ход чата вызывает только `ensureBillingSchema` (0064). DDL Uzum выполняет только `ensureUzumSchema`. Его вызывают:
  - Uzum-роуты, после своих гейтов 404/409;
  - `account.ts`, только при заданном `UZUM_API`;
  - `subscribe.ts` при `provider=uzum`, уже после `providerReady`.
- Гостевой `/api/gpt/account` в D1 не ходит (L18). `botHandoff` бывает true только при строке `"true"`.
- Пока флаг выключен, `AiLimitTelegram` не монтируется, поэтому одноразовая ссылка не создаётся и строка в D1 не пишется. Карточка B2B ссылку тоже не создаёт. Ссылки на бота в сайдбаре и в форме контакта были и до этапа 1.
- С выключенным флагом карточка лимита такая же, как в проде. Одно отличие: на дневном лимите без оплаты вместо ложного «Бесплатный чат доступен» теперь показывается `dailyTitle`. Это отклонение 3 из раздела ниже, оно принято.
- Миграция 0065 только добавляет объекты (`IF NOT EXISTS`, без DROP), rollback-notes есть в шапке файла. Паритет с bootstrap проверяет тест 12, а тест 13 проверяет, что каждый Uzum-путь сам создаёт объекты 0065.

**Уточнения к отчёту WP-00 (это не дефекты).**
1. «`git diff --check` чисто» — верно для рабочего дерева до коммита. `git diff --check f53cabcb HEAD` находит 21 строку с пробелами в конце: 18 в `docs/paid-chat/uzum-spec/en_checkout.yaml` и 3 в `en_fiscalization.yaml`. Это переносы строк Markdown в дословной копии спецификации Uzum. Их не править.
2. `schema_pending` спасает эндпоинт обслуживания только вне режима live. В live `maintainBilling` раньше читает тот же view для outbox, и без 0065 эндпоинт ответит 503. Порядок релиза R1 такое исключает: 0065 накатывается до кода, биллинг не в live. Для WP-02: эту ошибку не глушить. В live она означает, что уведомления об оплатах не работают.
3. Комментарии-хуки «package D» в `chat.ts` пришли с пакетом B. По плану их удаляет WP-05.

**Дальше.** WP-01.

---

# Платный AI-чат к проду: WP-00 — приём этапа 1 и предохранитель, 2026-09-30

**Состояние.** Ветка `paid-chat/prod-readiness` от `f53cabcb` (= `origin/main`); прод `a61963f1` — её предок (проверено `gptbot-release.json` и `git merge-base --is-ancestor`). Ничего не запушено и не задеплоено; Cloudflare, D1, GSC и боты не трогались. План — `C:/Users/Borinio/Desktop/seo-skills-main/gptbot.uz-audit/raw/prod-2026-09-30/10-PROD-PLAN.md` (вне Git), дальше WP-01.

**Коммиты WP-00.** `c209366e` — пакет B (Z.ai) вместе с общими `wrangler.toml` и `runtime-config.ts`, где лежат и инертные ключи `UZUM_*`; `208bd0a3` — пакет C (Uzum, миграция 0065, спецификации Uzum без правок); `ed2a918d` — пакет A (кнопки в бота); затем этот коммит `fix(gpt-chat): keep stage-1 surfaces inert`. Коммиты 1–3 — этап 1 как есть, без правок.

**Что сделал предохранитель.**
- (а) `ensureBillingSchema` создаёт только таблицы 0064. Новый `ensureUzumSchema` (0064 → 0065) вызывают только `payments/uzum.ts`, `payments/uzum-merchant/[op].ts`, `internal/gpt-uzum-refund.ts`, а также `account.ts` (при заданном `UZUM_API`) и `subscribe.ts` (при `provider=uzum`, до этого `providerReady` уже проверил настройку). Ход чата DDL Uzum больше не выполняет. `inspectBilling` без view отдаёт `outbox: "schema_pending"`, а не 503; остальные секции отвечают.
- (б) Новый V `GPT_BOT_HANDOFF_ENABLED="false"` (JSON и вложенная таблица, `RUNTIME_CONFIG_KEYS`, `Env`). `/api/gpt/account` отдаёт `botHandoff` (true только при строке `"true"`, в D1 не ходит). `validAccountView`: поле boolean или отсутствует, иное — вид отклоняется. Решение карточки лимита вынесено в `src/gpt-chat/limit-card.ts`: `AiLimitTelegram` монтируется только при `botHandoff`, поэтому без флага нет ни кнопки, ни одноразовой ссылки (строки в D1).
- (в) `npm test` += `gpt-uzum-payments`, `gpt-zai-provider`.
- (г) `.serena/` — в `F:/Claude/gptbot-repo-clean-20260801/.git/info/exclude`: это общий git-каталог worktree, в самом checkout `.git` — файл.

**Отклонения от плана и почему.**
1. Приёмка «`grep gpt_uzum billing-schema.ts` только внутри `ensureUzumSchema`» буквально не выполнима: экспорт `UZUM_BILLING_DDL` читают тесты паритета с миграцией 0065. Выполнен смысл проверки: `UZUM_BILLING_DDL` в `functions/` исполняет только `ensureUzumSchema`, а тест доказывает, что `ensureBillingSchema` не создаёт ни одного объекта Uzum.
2. Кроме Uzum-путей view читают панель вошедшего (`latestAcrossProviders`, `receipts`) и outbox в `maintainBilling` (только live). Они опираются на миграцию 0065 — так и задумано в плане (§5 и `05` A6: «миграция до кода»). Поэтому тестовая `billingFixture` теперь накатывает сам файл 0065 — это прод начиная с R1.
3. Тексты карточки без бота. `hourlyBody` и `dailyBody` зовут в Telegram, а `premium.unavailable` («бесплатный чат доступен») запрещён тестом пакета A. Без флага: часовой лимит и пакет показывают `premium.pause` (как в проде сейчас), дневной без оплаты — новый ключ `dailyTitle` «Бесплатный лимит на сегодня исчерпан» / «Bugungi bepul limit tugadi» (формулировка из `03` §4). С флагом тексты пакета A не меняются. Остальные тексты карточки переписывает WP-06.
4. `limitCard` принимает locale, а не объект строк. Если передать `t` в функцию при рендере, React Compiler перестаёт мемоизировать `onAccount` (ESLint `react-hooks/preserve-manual-memoization`).

**Проверки.** `tsc -b` 0; `typecheck:functions` 0; ESLint изменённых файлов 0. Пять файлов этапа 1 — 81/81 (handoff-link 11, telegram-web-handoff 21, zai 18, uzum 17 — новый тест 13 «каждый Uzum-путь сам поднимает 0065», billing 14). `gpt-readiness` 9/9 (новые тесты: ход чата на базе без 0065 проходит и не создаёт объектов Uzum; `schema_pending`; флаг бота). `gpt-account-ui` 7/7. Все файлы `npm test` по одному — 735/737 (две известные датозависимые фикстуры `lead-radar`). Шаги `build:fast` 0; `seo-protection check` 10/10; `scan:secrets` clean; `git diff --check` чисто; grep токенов пуст. Бандл: +1 маленький модуль, `gpt-chat-*.js` 46,5 КБ br.

**Для релиза R1.** Миграцию 0065 (шапка и rollback-notes проверены; `CREATE … IF NOT EXISTS`, без DROP) накатить вместе с 0066 (WP-04) **до** деплоя Pages. После R1 на проде ничего не меняется: Uzum инертен (`UZUM_API=""`), Z.ai выключен (`GPT_MODEL_PROVIDER=openrouter`, ключа нет), кнопка бота скрыта до R2.1 (`GPT_BOT_HANDOFF_ENABLED=true` → деплой).

**Заметки для WP-15.** `storeFor` в `billing-store.ts` используют только тесты, `BillingStore.latest` — только `scripts/gpt-billing-rehearsal.ts`. Панель вошедшего без 0065 отвечает 503 — вход появится только в R4, а 0065 применяется в R1.

---

# Правки по свежим данным Search Console, 2026-09-30

Опубликовано: production `908ee526`, deployment `3ed0959b-5850-487e-9731-044e189f51aa`; защищённые 10/10 на живом HTML, IndexNow 16 URL. База `e4742c7e`. Владелец подключил Search Console API (сервисный аккаунт, ключ вне Git). Данные: трафик плоский, ~92 % показов — пять ChatGPT-страниц; «chatgpt kirish» каннибализирован между UZ-чатом, статьёй про вход и RU-чатом; тест 19.09 нечитаем — заморозка до 03.10/20.10 снята. Сделано: интент по страницам-лидерам (описания, FAQ, первый экран UZ-чата, без смены title/H1), коммерческие title/H1 разработки ботов, FAQPage убран с чат-страниц (не был видимым), правила замера/отката C22/C11. Отчёт: `docs/seo/gsc-driven-2026-09-30/REPORT-RU.md`; защищённая ревизия `docs/seo/evidence/2026-09-30-gsc-driven/`. Следующее: чтения C22/C11 через 14 и 28 дней после переобхода. Устаревшее ниже про «заморозку до 03.10/20.10» — отменено.

---

# Приём и атрибуция заявок + блоки «заказать», 2026-09-29

Опубликовано: production `1902504e`, Cloudflare Pages deployment `40abb45f-2e77-43c8-a1b3-b12858f78ba1`, 936 файлов; живая проверка и IndexNow (115 URL) — `docs/seo/lead-capture-2026-09-29/live-verification-2026-09-29.json`. Состав (база `7b78175f`): починен калькулятор (с 04.09 отклонял все заявки), атрибуция заявок (source/service/attribution), Telegram-кнопки с готовым текстом, первый визит `gptbot_ft_v1`, новые цели Метрики, форма из двух полей на 24 коммерческих страницах, панель на /boss-digital/, навигация лендингов, блоки «заказать». Защищённые 10 и тестовые 9 страниц (`scripts/measurement-hold.ts`, до 03.10) видимо не менялись. Отчёт: `docs/seo/lead-capture-2026-09-29/REPORT-RU.md`; журнал для замеров: `docs/seo/CHANGE_LOG_2026-09.md`.

---

# Полный SEO-аудит gptbot.uz и исправления, 2026-09-29

Опубликовано. Production = `807c3d5ccf8f747bc0902a991aa7887d8f12cd7f`, Cloudflare Pages deployment `1cd04819-320a-45ce-a4b1-c1d1d653d9d4`, 935 файлов; живая проверка и защищённые 10/10 — `docs/seo/full-audit-2026-09-29/live-verification-2026-09-29.json`. Ветка `seo/full-audit-fixes-20260929` (база `9f15ffb2`). Владелец поручил исправить найденное аудитом и сразу задеплоить; решения: часы Пн–Сб 10:00–19:00, `/ru/` → 301 на `/`. Что исправлено, проверка и действия владельца — `docs/seo/full-audit-2026-09-29/REPORT-RU.md`. Находки аудита — вне Git: `C:/Users/Borinio/Desktop/seo-skills-main/gptbot.uz-audit/`. Деплой — только `npm run build:production` + `npm run deploy:pages:production`; untracked `.serena/` не включать.

**Следующий рычаг — 20.10.2026:** черновики сниппетов пяти лидеров (≈61 тыс. показов/мес) — `docs/seo/snippet-drafts-2026-10-20/DRAFTS-RU.md`; условие — итог теста формулы 03.10. Кластер AI-ботов по данным `content/seo/demand-policy.json` без спроса — ссылочный вес на него НЕ перекачивать. Пошаговые действия владельца (Яндекс Вебмастер, Яндекс Бизнес, GBP, отзывы) — `docs/seo/full-audit-2026-09-29/OWNER-STEPS-RU.md`. Замечание: релиз 29.09 изменил тело защищённых страниц (часы в футере, латинская подпись и ссылки на /uz/ в UZ-статьях) — title/description/H1 не тронуты, CTR-замер сниппетов не затронут.

---

# Рекламное SEO — полный фикс по аудиту и усиление SEO, 2026-09-28

## 1. Состояние
Опубликовано. Production = `32c4fd990b141c713aea5bf8051aabd0c6dc9de9` (первый проход `cc969d80` + второй проход `32c4fd99`), Cloudflare Pages deployment `3b76e913-6e00-43f2-bf2a-03d56e0cd0c6`, artifactSha256 `b6a831bbc026eb50ccba907136d1d31b22131d6ba26e84411891ce8ee5187a0f`, 933 файла. `main` = release commit + этот коммит-квитанция (только документы и квитанции). Владелец 28.09.2026 прямо поручил полный фикс, автономную работу и немедленный деплой. Untracked `.serena/` не включать.

## 2. Что сделано
Второй проход закрывает автономные пункты независимого аудита: один проверенный набор порогов Telegram Ads, опубликованные тарифы на RU/UZ-хабах, сырые `{token}` и CTA без адреса по всему блогу, недоказанные статистики в статьях о сайтах, заявках и подрядчиках, 17 анкоров, compactHero ещё на 5 RU-лендингах, часы Пн–Сб 10–19 в Organization и отказ от 24/7 `hoursAvailable` для услуг команды, preload латиницы на RU, внутренние абсолютные CTA без nofollow, ссылки футера главной, guard-тест.

## 2a. Третий проход (усиление SEO)
Блок «Реклама и продвижение под заявки» в `<main>` главной, «Недавно обновлено» на индексах блога, расширенная статья «Что такое лид», кириллический FAQ в UZ-статье о таргете, ранняя ссылка на хаб, единые часы в чате, 2 новых guard-теста. Ветка top3 проверена: переносить нечего. Четыре 404 из GSC перенаправлены 301 на страницы с тем же интентом; sitemap переотправлен в GSC 28.09; для группы «Ошибка переадресации» запущена новая проверка исправления. Подробности — REPORT-RU, раздел «Третий проход».

## 3. Изменённые файлы
46 content JSON (статьи и лендинги RU/UZ, `content/global/site.json`), `scripts/prerender.ts`, `scripts/jsonld-helpers.ts`, `src/components/Footer.tsx`, `tests/seo-content-guards.test.ts`, `docs/seo/advertising-2026-09-28/REPORT-RU.md`, STATE, DECISIONS, этот handoff. Подробности — REPORT-RU, раздел «Второй проход».

## 4. Архитектурные решения
D-SEO-ADS-20260928B: money-страницы только с первичными источниками, условия посредника — в статье с источником; тарифы повторяются без новых цен; `hoursAvailable` только у ботов; анкор не отдаёт главный запрос страницы чужому URL. Новых API, миграций, зависимостей и внешних сервисов нет.

## 5. Что сознательно не сделано
Латинская подпись автора в UZ-статьях (изменила бы защищённые UZ-страницы), GPT-кластер, новые посадочные, выдуманный кейс, серверная форма, изменения ботов/БД/оплат/аналитических настроек. Пункты владельца: материалы рекламного кейса, NAP и Google Business Profile, журнал реальных обращений, экспорт GA4, подтверждение цен.

## 6. Проверки
- `npx tsc -b`: 0; scoped ESLint изменённых TS/TSX: 0.
- 36 SEO/контент/релиз test files по одному: 35 зелёных; `react-router-v8-migration` — 3 старых падения счётчиков маршрутов/sitemap (долг задокументирован в STATE, маршруты не менялись).
- `seo-audit.ts`: 0 critical, 0 broken, 0 orphan. `build:fast`: exit 0, sitemap 288.
- `seo-protection.ts check`: 10/10. `scan:secrets`: clean (3085). `git diff --check`: pass.
- Локальный браузер: CTA в первом экране 1366×768 на 6 RU-лендингах; футер главной рисует новые ссылки.
- Production: `deployed_and_verified`; live 11/11 изменённых URL с маркерами, защищённые 10/10 равны артефакту, sitemap 288 (`docs/seo/advertising-2026-09-28/live-verification-2026-09-28.json`). IndexNow 45 URL — HTTP 200; WebSub 204/204.

## 7. Известные проблемы
Две фикстуры `lead-radar.test.ts` просрочены по 30-дневному TTL; три счётчика `react-router-v8-migration` устарели. Оба долга не связаны с этой работой. Диск C: машины владельца во время работы заполнился до 0 ГБ (крупные файлы `.codex`); очищены только регенерируемые кэши node/tsx/jiti, временные файлы релиза переведены на F:.

## 8. Следующая задача
29.09.2026: «Запросить индексирование» в GSC для 10 приоритетных URL из REPORT-RU (28.09 отклонено дневной квотой). Затем пункты владельца: материалы рекламного кейса, NAP и Google Business Profile, журнал реальных обращений, экспорт GA4, подтверждение цен. Через 28 полных дней после переобхода — сравнение тех же рекламных когорт GSC.

## 9. Acceptance следующего этапа
GSC подтверждает принятый запрос для каждого приоритетного URL или фиксируется причина отказа; в URL Inspection видна дата сканирования после 28.09.2026. Индексация и рост обращений не заявляются без данных GSC и журнала обращений.

## 10. Команды для старта
`git status --short`; `git log -3 --oneline`; `git ls-remote origin refs/heads/main`. Затем STATE, этот handoff и REPORT-RU. `npx tsx scripts/seo-protection.ts check`; `node --import tsx --test tests/seo-content-guards.test.ts`.

## 11. Риски
Не включать `.serena/`. Не выкладывать dist без admin/release build. Не ослаблять TTL и счётчики ради зелёного прогона. Не публиковать цифры посредника на money-страницах. Шаблон Telegram — не автоматическая атрибуция.

## 12. Rollback
`git revert` коммита второго прохода (и при необходимости `cc969d80`) с повторным guarded release. Миграций, настроек, секретов и внешних побочных эффектов нет.

---

# Исторические handoff-записи — не доказательство текущего production

# GPTBot AEO video incident closure — 2026-09-05

## AI-agent comparison article — deployed and live-verified, 2026-09-14

Runtime `bb931b955aedf232a05bebdcf8c3c70492bf0e75` is live as Cloudflare Pages deployment `ec5e4911-9e1e-4a9b-b7ee-6864e1ba3fe7`. `/ru/blog/ai-agent-ili-chat-bot/` returns 200 with the reviewed title, H1, canonical, Article and FAQPage schemas, hero and exact footer address. All three WebP assets return `image/webp` and match local SHA-256. The homepage links the article; `sitemap.xml` has 289 URLs and `sitemap-priority.xml` has 18 including the article. The release artifact has 918 files and SHA-256 `95703b896e9c0032e6c001005c096776388cbbe8aef5b940491b99999ee06b48`.

Cloudflare initially rejected the upload because the existing 95 text/secret variables exceeded the Workers Free limit of 64. The final release packs the 56 non-secret settings into one 2,565-byte text JSON binding with an explicit allowlist and fail-closed parser. Production now has 36 variables: the same 35 secret names plus `GPTBOT_RUNTIME_CONFIG_JSON`. D1, KV, both R2 buckets, Service, Queue, AI and Smart Placement match the private pre-release snapshot. Live Mini App CORS preflight is 204 and an unauthenticated request is the expected 401, proving that the packed flags and existing secrets/bindings reach the runtime.

Validation: 602/602 full tests, application/Functions/Lead Radar TypeScript, clean secret scan, full `build:cf`, protected SEO 10/10, custom-domain manifest and browser readback. No migration, payment activation, Telegram send, paid API call or provider-setting change occurred. The public auth contract still exposes no payment/checkout configuration. Final evidence: `docs/seo/ai-agent-release/live-verification.json`; reviewed baseline: `docs/seo/evidence/2026-09-14/reviewed-protected-pages.json`. Next owner action is Google Search Console submission of `sitemap-priority.xml` and URL inspection; indexing is not guaranteed by deployment.

## Consumer billing readiness — 2026-09-06

**Final release verified:** runtime `644a94a3cd0da5f1f7ef487d5649ef72f8fe7ee5`, deployment `6907261a-5483-4418-8f1b-9a4b075bbe8f`, artifact `a801903c1c78c5e610097cb2670cbbdd1755b490c20a4672374dc786025f14cf`. 598/598 full tests; 914-file build:cf; 288 live contracts, ten protected pages and eight CSS/JS hashes match. Production mobile UZ fresh 7+5 canary returned 12, final RU/UZ upcoming/payment-disabled and privacy wording verified. D1 readback has one completed free turn and zero reserved turns, paid attempts, accounts, orders or periods. Migration 0064 registered, 14 tables verified. All bindings/secret types preserved. Prepared worker maintenance hook was not separately deployed. Actual merchant/Telegram Login/terms acceptance remains external; no payment launch. Read `docs/readiness/2026-09-06/EXECUTION-RU.md` for receipts, legacy restore constraint limitations and PSI429. Candidate paragraphs below are superseded by this final receipt, not unfinished release steps.

First release 48e1d206 is deployed as 586d1812-8cae-4102-ba58-a42a64e5851d. Migration 0064 is registered; 14 new tables were empty before release. Final copy correction explicitly distinguishes the browser's conversation list from server processing (the existing transcript/handoff storage still exists). Rebuild this narrow correction before final live acceptance; do not claim messages never leave the browser. Restoration rehearsal preserved all 147 old table counts and the same pre-existing legacy constraint findings; it required disabling legacy checks during import, recorded in migration-rehearsal.json. No legacy data repair was attempted.

Owner explicitly requested roadmap followed immediately by autonomous execution. Current candidate selectively integrates the previously isolated consumer billing modules into the latest release checkout, preserving current SEO/article/mobile/AEO changes. Account history isolation, current versioned terms, pending checkout recovery, noindex/no-store API, fail-closed atomic admission, bounded model costs and meaningful-stream settlement were added or corrected. 597 tests, app/Functions TypeScript and scoped lint pass. Mobile local rehearsal proved synthetic pending → confirmation → 300 allowance → answer → 299 and logout hiding account history. New migration is 0064; existing AEO 0062/0063 are untouched. Production backup exported and hashed; migration/full guarded release still pending at this commit. Payments stay disabled because merchant credentials, Telegram Login and approved terms are absent. Roadmap, results, connection contract and evidence: `docs/readiness/2026-09-06/`. Older product records below are historical; do not infer current deployment from this candidate checkpoint.

## SEO and conversion repairs — 2026-09-06

**Released and verified:** runtime `dd7c91d9bed33efb1e39792b2ace49d367d282f1`, deployment `6b57a629-0e47-4b17-addd-729d9a2fa183`. Full build:cf 914 files; 560 tests and 15 release checks pass. All 288 live contracts, ten protected pages and eight referenced asset hashes match; bindings and existing variables preserved. Main CUA recovered and verified final mobile entry flows; one fresh Russian canary returned 4. Final evidence: `docs/seo/gptbot.uz-audit/live-verification.json` and `browser-acceptance.json`. Candidate-stage notes below describe the earlier checkpoint, not an outstanding release.

Owner authorized autonomous inspection, fixes and publication. Candidate removes 24 links to 12 unpublished targets, normalizes 20 relative canonicals without changing destinations, adds two curated Russian article-to-chat flows, rejects empty streaming completions as errors, and corrects consumer/SEO pricing contradictions. The protected Russian comparison article also receives verified provider-fact corrections with 15 official references and exactly two reviewed H2 changes. Search titles, H1, descriptions, canonical destinations, hreflang and robots of all ten protected pages remain unchanged. Seven entire protected contracts remain identical; the three exceptions are explicitly reviewed against the immutable original live snapshot. No billing launch, provider configuration, migration, bot or AEO change.

Main report and implementation/validation evidence: `docs/seo/gptbot.uz-audit/`. New candidate baseline: `docs/seo/evidence/2026-09-06/reviewed-protected-pages.json`; original `protected-pages.json` was not overwritten. A factual body correction is recorded openly, not disguised as additive-only preservation. Three GSC redirect errors now resolve 308 to 200; Google fix validation was requested and reads Started. Main search period remains August 7–September 3: 385 clicks, with 82.1% from six mostly informational/chat URLs; this is pre-release growth, not causal uplift. Revenue is unverified and consumer Plus remains unavailable.

Candidate local flows passed mobile/desktop checks. CUA disconnected before the final small header-spacing recheck; the visual report preserves that limitation. Full release build, guard, explicit upload and live receipt are next; do not infer a deployment from this candidate checkpoint. Existing unrelated platform/AEO records below are retained.

## SEO foundation — 2026-09-06

Final verification: 543/543 full tests, clean secret scan, full build:cf with public/admin and 914-file stamp, 10/10 protected contracts and production lineage check pass. Code f80fdf85132e979704fbcf0956a3740db61ced46 is verified in origin/main. Cloudflare auto-deploy is confirmed disabled; no production upload was performed because this change protects the release workflow. Public runtime remains efea33a. The report records remaining analytics investigations separately from this completed implementation.

Owner explicitly authorized execution of the SEO roadmap. Authenticated browser reports now provide fresh GSC and GA4 data: 385 versus 36 search clicks in successive 28-day periods; the top six pages contribute 82.1%. Ten live page contracts were captured and their HTML/CSS verified. `scripts/seo-protection.ts` now gates the existing Pages stamp/check/deploy CLI against accidental metadata, text and internal-link regressions. Three new behavioral tests and 30 existing release/privacy tests pass; application TypeScript and scoped ESLint pass. The guard test is included in `npm test`. Full evidence, limitations and next measurement work: `docs/seo/SEO_FOUNDATION_2026-09-06.md`. This stage changes release tooling, not public page content. Existing AEO, UI and billing boundaries below are preserved.

GA4 `generate_lead` is already a key event. Weekly error totals are largely historical: September 5 has 21 successes and 3 errors; one actual published-UI canary on September 6 succeeds. Do not claim a measured session success rate or that all errors are fixed. Attribution source=composer remains an unconfirmed transport hypothesis. Next: complete query/page and session-cohort analysis before retargeting current leaders. Do not auto-refresh the SEO baseline merely to pass a release.

## Chat UI and article entry release

Owner authorized deployment on 2026-09-05. Latest-main UI release adds the reviewed shadcn chat and seven contextual article entry paths. 540 tests, 12 release/config tests, typecheck, lint and mobile/desktop browser checks pass; seven article SEO/content baselines are preserved. Payment controls remain explicitly upcoming; no billing backend, schema, variables or bot changes. Published runtime efea33aa9c4d44d3fdd2bcc215402a93631a83c7 as acc1704b-f543-4b94-b15f-01cf43ebdaaf. Live manifest/assets, six public routes and nine real-domain article/chat browser flows passed; bindings and existing variables preserved. Details: `docs/gpt-chat/UI_ARTICLE_RELEASE_2026-09-05.md`. Existing AEO acceptance records below are preserved.

## Public CSS hotfix — owner-authorized release

Completed: runtime `ed473b193bfc77f4b078eff9d31d15fd4a9ef50b` deployed as `3c4c3059-4903-41c6-a853-0e51e3f393e5` after merging the newer AEO runtime f9a8457 and docs d186b11. Full `build:cf`, release guard, public manifest/CSS HTTP checks and RU/UZ mobile/desktop browser checks passed. Bindings and existing variables are preserved. Evidence and exact boundaries: `docs/gpt-chat/MOBILE_CSS_RELEASE_2026-09-05.md`.

The owner authorized committing and publishing the mobile CSS repair on 2026-09-05. The release checkout `F:/Claude/gptbot-mobile-css-hotfix-20260905` includes production `37706036171f28d1f7bd002c922ada87d5d3f9d7` and changes only public stylesheet selection and its release guard/tests. Prerender now follows Vite entry styles instead of alphabetically selecting AdminRoot CSS. The previous baseline passed 537 full tests and built-artifact mobile checks; the current production lineage is being rebuilt and checked before guarded publication. New premium chat/billing WIP is excluded. AEO acceptance boundaries below remain unchanged. See `docs/gpt-chat/MOBILE_CSS_RELEASE_2026-09-05.md` for release verification.

## 1. Current state

Owner requested continued verification. History language filtering, question-only search, empty-state recovery and settled-result export are repaired. New model runs persist the selected request locale; legacy unknown locales are labelled, never guessed or backfilled. Current checkpoint: released and verified. Latest verified runtime 2e4458c1421b19eabf53e7d1175595d8aa5bd9d8, deployment 82836535-df1c-4728-a1a3-8a81d9086c6b. Earlier three-model canaries remain in owner-canary-2026-09-05.json; provider request settings are unchanged.

## 2. Confirmed defects and fixes

Invalid server GitHub PAT caused content/audit HTTP 401; validated existing repository credential rotated through stdin. Workers rejected redirect=error before outbound HTTP; manual redirect plus explicit refusal fixes transport. Matching purchase/geography words produced a false cake-to-agency recommendation; analyzerVersion 2 requires subject evidence and returns no_target. Legacy recommendation panels are hidden pending recheck. The video showed NVIDIA/Dots incomplete responses: 4096-token budget, optional reasoning disabled for the three verified models and 35-second timeout now produce complete real responses. Historical provider finish reasons were unavailable, so their exact truncation cause is not asserted.

## 3. Source and scope

F:/Claude/gptbot-aeo-20260905, branch feature/aeo-production-20260905. Existing monolith, JWT, internal org and D1. Core functions/platform/aeo, functions/api/admin/aeo, src/admin/pages/AeoWorkspace.tsx, components/AeoAnswers.tsx, shared types. Historical platform context is preserved in docs/aeo/PREVIOUS-PLATFORM-HANDOFF.md. No unrelated platform changes.

## 4. Delivered UX

Explicit Content gptbot.uz versus model-answer modes. Wide single-answer reading with per-model status selectors, optional comparison, natural page scrolling. Exact source text remains available; safe Markdown display uses escaped React nodes, no raw HTML. History identifies each model. Loading models no longer shows a false configuration failure. Partial final answers remain explicitly incomplete; reasoning text is never displayed or persisted. Errors have safe causes and bounded manual retry.

## 5. Live evidence

docs/aeo/evidence/owner-canary-2026-09-05.json contains exact run IDs. MiniMax 1437 characters, NVIDIA 2922, Dots 1459: completed, finishReason stop, reasoningTokens 0. Analysis 1ecbe668-bc78-4396-a1ef-bca20a9ecf8f loads 185 RU pages: cake has no target, SEO selects the SEO-audit checklist. Prior run 992fbc15-30ae-42de-9740-3f9ccc77ca60 confirms accepted decision survives reload and undo. History restores all three answers; old 12:30 analysis shows only recheck notice. No public Save/Publish.

## 6. Validation

32 AEO and Pages release/config tests passed; actual workerd test verifies outbound transport and redirect refusal. App/functions typechecks and scoped lint passed. Production build includes main and admin and 914-file stamp. Release receipt records manifest, asset SHA, routes and preserved bindings. Browser read/compare and model switching passed at 390 and 1440 px without horizontal overflow. Latest UI-only changes receive app typecheck, scoped lint and the same targeted suites before release.

## 7. Provider contract

Only minimax/minimax-m3:free, nvidia/nemotron-3-super-120b-a12b:free and dots-studio/dots-3-note-preview:free are configured. Max price zero, plugins empty, paid fallback disabled, one attempt, 35 seconds. Optional reasoning disabled only for these verified models. OPENROUTER_API_KEY remains private. API observations are ungrounded and can contain inaccurate businesses/addresses; UI explicitly labels that distinction. Real success is point-in-time, not an availability guarantee.

## 8. Next action

No required work remains in this continuation; see history-follow-up.json for the live locale/filter canary.

## 9. Acceptance boundary

Analysis, saved review/reload/undo, all three real model answers and responsive reading are verified. Manual screen-reader audit, exhaustive human usability pilot and continuous external-provider availability are not claimed. Free API answers are not the consumer ChatGPT/Gemini search interface. This service never automatically publishes observations or briefs.

## 10. Reproduction

node --import tsx --test tests/aeo-workspace.test.ts tests/aeo-review.test.ts tests/aeo-workers.test.ts tests/pages-production-release.test.ts tests/pages-config-parity.test.ts; app/functions tsc; scoped eslint; npm run build:cf; guarded scripts/release/pages-production.ts deploy. Private helper F:/Claude/aeo-production-20260905/_implementation/release-runner.py obtains existing Wrangler OAuth in memory. Browser session access only via the bundled browser runtime; no token extraction.

## 11. Backup and mutation boundary

No new migration in this repair. Existing additive migrations 0062/0063 retained. Private d1-before.sql SHA256 8c1ce37aa546171a4415217adae9c4a3a55f11e6b0145323b7821c6a27db5a0d. Local structural restore requires ignoring an excerpt CHECK due to export/SQLite discrepancy; live invalid excerpt count zero. Never commit backup/credentials. Preserve node_modules junction. No paid calls, Telegram sends, financial operations or public content saves.

## 12. Release and rollback

Owner explicitly authorized push/deploy. Pages ai-direct-pro-landing; auto deploy disabled. Use guarded upload, preserve production vars and D1/KV/R2/service/queue/AI bindings. Rollback UI polish to 3770603 / 909e5d1f if needed; this baseline has all three successful provider canaries. Do not revert the validated GitHub credential or drop AEO tables. Older c123678 reintroduces the provider transport defect.

## IndexNow notification — 2026-09-06

Owner requested IndexNow submission after the SEO release. Exactly 50 changed canonical HTTP-200/indexable URLs were verified and submitted in one batch at 2026-09-06T04:56:01.654Z. IndexNow returned HTTP 200, confirming receipt, not indexing. Root key file matched the configured public key; no key is included in the receipt. AI search crawler policy permits public pages; llms.txt, llms-full.txt and sitemap return HTTP 200. No actual AI crawler visit or citation was confirmed. Evidence: docs/seo/gptbot.uz-audit/indexnow-receipt.json, indexnow-scope.json and ai-crawl-access.json. No runtime changes or repeat deployment. Google operates separately from IndexNow.
