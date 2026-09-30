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
3. После деплоя: `wrangler versions view <новая>` → AUTOSEND `"false"`; capabilities Lead Radar → `campaignAutoSendEnabled=false`. Через 24 ч агрегат `SELECT status, COUNT(*) FROM lead_radar_tg_campaign_effects WHERE updated_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day') GROUP BY status` не должен содержать `dispatching`, `sent` или `ambiguous`.
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
