# Платный AI-чат: WP-07 — соль хешей с перекеем и удаление переписки (выключено), 2026-10-01

**Итог.** Сделан WP-07 плана `10-PROD-PLAN.md` (релиз R2, D7, решение L8) на ветке `paid-chat/prod-readiness` поверх `77720e11` (R1 в проде). Код готов к релизу R2 и в проде ничего не меняет, пока нет секрета `GPT_HASH_SALT` и не наступил `GPT_HASH_SALT_SINCE` (в `wrangler.toml` он пустой). Удаление переписки собрано и выключено (`GPT_MESSAGES_RETENTION_DAYS=""`). Ничего не запушено и не задеплоено. Cloudflare, секреты, GSC и боты не менялись. Из D1 прочитаны только агрегаты (числа строк и форматы дат) для оценки объёма перекея. Миграции в WP-07 нет: по §5 плана 0067 относится к WP-08. Runbook: `docs/paid-chat/SALT-RU.md`.

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
