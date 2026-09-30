# Соль хешей `GPT_HASH_SALT`, перекей и удаление переписки

*WP-07 плана «AI-чат + оплата», 2026-10-01 (D7, решение L8). Код: `functions/lib/gpt-chat/hash.ts`, `salt-rekey-store.ts`, `retention-store.ts`, `functions/lib/telegram/store.ts` (`pseudoUser`), `functions/api/internal/gpt-billing-maintenance.ts`. Тесты: `tests/gpt-hash-salt.test.ts`, `tests/gpt-retention.test.ts`. Выкатывается в релизе R2.*

## Коротко

- Сейчас IP хранится как `sha256(ip)`, а Telegram-псевдоним — как первые 32 символа `sha256("tg:" + id)`. Соли нет, поэтому любой такой хеш за минуты перебирается по всему IPv4 или по всем Telegram id.
- С момента `GPT_HASH_SALT_SINCE` новые хеши солёные (v2): `"h2_" + HMAC-SHA256(GPT_HASH_SALT, старый_хеш)`. У псевдонима длина остаётся 32: `"h2_"` и 29 hex-символов.
- v2 считается **из старого хеша**, а не из IP. Поэтому крон обслуживания переводит уже сохранённые строки в v2 без исходных адресов. Квоты, история, сохранение переписки и псевдонимы бота продолжаются без разрыва.
- До `SINCE` ничего не меняется. Если соль задана, а `SINCE` нет, хеши остаются старыми, а в лог один раз пишется `gpt_hash_salt_since_missing`. Соль короче 32 байт считается незаданной.
- Токен сессии (`gpt_sessions.anon_token`) от соли **не зависит**: это `sha256(токена)`, байт в байт как в проде до WP-07. Сессии и история не ломаются в момент включения.
- Удаление переписки (`GPT_MESSAGES_RETENTION_DAYS`) сделано, но **выключено**. Включают его только по решению владельца и вместе с текстом политики (WP-18).

## Что перекеивается

Шаг `rekey` крона (`*/15`) после `SINCE`. За один тик — не больше 200 строк на таблицу (сначала **самые новые**, от них зависят квоты) и не больше 400 строк на тик в сумме, чтобы HMAC уложился в лимит CPU Workers Free. Строка берётся, только пока её значение имеет старый вид (64 или 32 hex-символа), а `UPDATE` условный: повторный прогон ничего не меняет, двойного ключа нет. Курсор на таблицу — `gpt_billing_ops`, задача `salt_rekey:<таблица>` (`next_at` = время самой старой обработанной строки, `0` = таблица готова). Аренда одна: задача `salt_rekey`, 2 минуты, в конце тика снимается.

| Таблица, колонка | Что это | Как |
|---|---|---|
| `gpt_turn_reservations.ip_hash`, `.subject` | квоты чата | перекей; `subject` аккаунта (`acct_…`) не трогается; только org `gptbot-consumer` |
| `gpt_limit_hits.subject` | счётчик отказов 429 | перекей; если v2-строка того же дня и причины уже есть (SINCE внутри суток), счётчики складываются |
| `gpt_sessions.hashed_ip` | сессии чата | перекей |
| `telegram_events.pseudo_user` | аналитика бота | перекей псевдонима |
| `gpt_handoffs.claimed_by` | кто забрал ссылку «продолжить в боте» | перекей псевдонима |
| `gpt_events` (`GPTChatHandoffClaimed`, поле `claimedBy`) | то же в событии | перекей псевдонима внутри JSON (**сверх плана**, см. HANDOFF) |
| `gpt_usage_daily` | устаревшая таблица, её никто не читает и не пишет | строки до `SINCE` удаляются |
| `gpt_rate_limits.subject` | окна антиспама (час или сутки) | не перекеивается: окна один раз начинаются заново. Закрытые окна старше 2 суток удаляет шаг `maintenance` |

Объём на 2026-10-01 (агрегат D1, только чтение): ходов 1314, сессий 719, событий бота 228, забранных ссылок 2, событий `GPTChatHandoffClaimed` 2, отказов 1, строк `gpt_usage_daily` 123. Это примерно 7 тиков крона (около 1 ч 45 мин). Быстрее — ручными вызовами эндпоинта (шаг 6 ниже).

Окно, которое план принимает: от `SINCE` до первого тика новые v2-ключи не видят ходов последнего часа со старыми ключами. Посетитель в этом окне может получить до 5 лишних бесплатных ответов. `SINCE` = 00:00 UTC (05:00 по Ташкенту), и в этот момент суточные квоты всё равно начинаются заново.

## Настройки

| Имя | Вид | По умолчанию | Кто задаёт |
|---|---|---|---|
| `GPT_HASH_SALT` | **секрет** Pages | — | агент при релизе R2: 32 случайных байта, не печатать |
| `GPT_HASH_SALT_SINCE` | публичная (`wrangler.toml`: JSON и таблица) | пусто | агент при релизе R2: ближайшие 00:00 UTC после деплоя с секретом, вид `2026-10-03T00:00:00Z` |
| `GPT_MESSAGES_RETENTION_DAYS` | публичная (там же) | пусто = выключено | владелец и юрист; `0` = выключено, иначе 7..3650 дней |

`SINCE` принимается только как момент UTC с `Z` на конце (`2026-10-03T00:00:00Z` или `…00.000Z`). Дата без времени, время без `Z` или со смещением `+05:00` считаются опечаткой, и хеши остаются старыми.

## Выкат (релиз R2) — только по команде владельца

Git Bash, `cd F:/Claude/gptbot-gsc-audit-20260917`, `export NODE_OPTIONS=--max-old-space-size=1400`. Значения секретов не печатать. Команды wrangler — через `python F:/Claude/gptbot-tools/wr.py -- …` (ключи Cloudflare подставляются внутри, вывод очищается).

1. **Код.** Деплой коммита R2 (WP-07 и WP-08) обычным порядком R2: сначала миграция 0067 из WP-08, потом `npm run build:production` → `python F:/Claude/gptbot-tools/deploy_runner.py check` → `deploy`. `GPT_HASH_SALT_SINCE` в этом коммите **пустой**, поведение прежнее. Проверка: тик обслуживания (шаг 5) отвечает `"rekey":{"status":"off",…}`.
2. **Соль.** 32 случайных байта в hex, без перевода строки. Копия хранится только вне Git, рядом с секретом обслуживания:
   ```bash
   mkdir -p C:/Users/Borinio/.config/gptbot-private
   f=C:/Users/Borinio/.config/gptbot-private/gpt-hash-salt.txt
   test -e "$f" || node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$f"
   python F:/Claude/gptbot-tools/wr.py --stdin "$f" -- pages secret put GPT_HASH_SALT --project-name ai-direct-pro-landing
   python F:/Claude/gptbot-tools/wr.py -- pages secret list --project-name ai-direct-pro-landing   # только имена: GPT_HASH_SALT есть
   ```
   `test -e` не даёт случайно выпустить вторую соль. Секрет Pages начинает действовать только со следующим деплоем.
3. **`SINCE`.** Ближайшие 00:00 UTC, до которых деплой шага 4 успеет закончиться; если до полуночи UTC меньше часа, берутся следующие:
   ```bash
   node -e "const d=new Date(Date.now()+3600e3);d.setUTCHours(24,0,0,0);console.log(d.toISOString().replace('.000Z','Z'))"
   ```
   Значение пишется в `wrangler.toml` в **два** места: в JSON `GPTBOT_RUNTIME_CONFIG_JSON` (`"GPT_HASH_SALT_SINCE":"…"`) и в таблицу `[vars.GPTBOT_RUNTIME_CONFIG]`. Затем по одному файлу `node --import tsx --test tests/runtime-config.test.ts` и `tests/pages-config-parity.test.ts`, коммит `chore(release): switch hash salting on at <SINCE>`.
4. **Передеплой** этого коммита: `npm run build:production` → `deploy_runner.py check` → `deploy`. Секрет и `SINCE` начинают действовать одним деплоем.
5. **До `SINCE`: проверка без значений.** Тик обслуживания с секретом обслуживания из `gptbot-private`, как в `ALERTS-RU.md`:
   ```bash
   h="$(mktemp)"; printf 'Authorization: Bearer %s' "$(cat C:/Users/Borinio/.config/gptbot-private/gpt-billing-maintenance-secret.txt)" > "$h"
   curl -sS -X POST https://gptbot.uz/api/internal/gpt-billing-maintenance -H @"$h" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).rekey)))"
   ```
   Ожидается `{"status":"waiting",…}`: соль длиной от 32 байт принята, `SINCE` разобран. `off` — секрета нет или он короче 32 байт. Тогда до `SINCE` нужно исправить секрет и передеплоить, а если не успеть — перенести `SINCE` на следующие сутки новым коммитом (пока `SINCE` не наступил, это безопасно).
6. **После `SINCE`.** Перекей идёт сам на каждом тике крона. Быстрее — ручные вызовы того же эндпоинта: каждый вызов — одна пачка, аренда в конце снимается.
   ```bash
   for i in $(seq 1 15); do curl -sS -X POST https://gptbot.uz/api/internal/gpt-billing-maintenance -H @"$h" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).rekey)))"; sleep 5; done
   rm -f "$h"
   ```
   Статусы: `ran` (пачка сделана, `pending` — какие таблицы ещё не готовы) → `done`. `busy` — в эту минуту идёт тик крона. В ответе только числа строк, без хешей.
7. **Сверка (только агрегаты)**, не раньше чем через 2 ч после `SINCE`. `<MS>` — `SINCE` в миллисекундах (`node -e "console.log(Date.parse('<SINCE>'))"`), `<ISO>` — `SINCE` в виде `2026-10-03T00:00:00.000Z` (с миллисекундами: так пишет код). Все счётчики должны быть 0:
   ```sql
   SELECT
    (SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id='gptbot-consumer' AND created_at<<MS> AND ip_hash NOT LIKE 'h2\_%' ESCAPE '\') AS turns_ip,
    (SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id='gptbot-consumer' AND created_at<<MS> AND subject NOT LIKE 'h2\_%' ESCAPE '\' AND subject NOT LIKE 'acct\_%' ESCAPE '\') AS turns_subject,
    (SELECT COUNT(*) FROM gpt_limit_hits WHERE org_id='gptbot-consumer' AND first_at<<MS> AND subject NOT LIKE 'h2\_%' ESCAPE '\' AND subject NOT LIKE 'acct\_%' ESCAPE '\') AS limit_hits,
    (SELECT COUNT(*) FROM gpt_sessions WHERE created_at<'<ISO>' AND hashed_ip NOT LIKE 'h2\_%' ESCAPE '\') AS sessions,
    (SELECT COUNT(*) FROM telegram_events WHERE created_at<'<ISO>' AND pseudo_user NOT LIKE 'h2\_%' ESCAPE '\') AS tg_events,
    (SELECT COUNT(*) FROM gpt_handoffs WHERE claimed_at<'<ISO>' AND claimed_by NOT LIKE 'h2\_%' ESCAPE '\') AS handoffs,
    (SELECT COUNT(*) FROM gpt_events WHERE event_name='GPTChatHandoffClaimed' AND created_at<'<ISO>' AND json_extract(payload_json,'$.claimedBy') NOT LIKE 'h2\_%' ESCAPE '\') AS handoff_events,
    (SELECT COUNT(*) FROM gpt_usage_daily) AS usage_daily,
    (SELECT COUNT(*) FROM gpt_billing_ops WHERE org_id='gptbot-consumer' AND task GLOB 'salt_rekey:*' AND next_at<>0) AS unfinished_tables,
    (SELECT COUNT(*) FROM gpt_sessions WHERE created_at>='<ISO>' AND hashed_ip NOT LIKE 'h2\_%' ESCAPE '\') AS new_sessions_unsalted
   ```
   Запуск: `python F:/Claude/gptbot-tools/wr.py -- d1 execute gptbot-ai-drafts --remote --json --command "<запрос в одну строку>"`. Последний счётчик доказывает, что новые строки пишутся солёными.
8. **Живая приёмка:**
   - квоты: 6-е сообщение за час — 429 `hourly` с `Retry-After` (`LIMITS-RU.md`);
   - заявка из чата с перепиской (с согласием) доходит владельцу;
   - открытая до `SINCE` вкладка чата продолжает тот же разговор: история загружается, ответы сохраняются.
9. **Квитанция** `docs/paid-chat/releases/R2-live-verification.json`: время `SINCE` (не соль), статусы тиков, агрегаты шага 7.

CPU перекея не замерить на превью: превью пишет в ту же боевую D1. Первые тики после `SINCE` смотреть в Cloudflare (Pages → Functions → метрики CPU) или через `wrangler pages deployment tail`. Если `rekey` попадает в `failed` с ошибкой лимита CPU, уменьшить `TICK_ROWS` в `salt-rekey-store.ts` и выкатить исправление: курсоры и условные `UPDATE` продолжат с того же места.

## Откат

- **До `SINCE`:** вернуть `GPT_HASH_SALT_SINCE` к пустому значению (revert коммита шага 3) и передеплоить. Ни одна строка не менялась.
- **После `SINCE`: только исправление вперёд.** Код до WP-07 не понимает `h2_`: он снова начнёт писать старые хеши, квоты начнутся заново, псевдонимы бота сменятся. Перевести v2 обратно в старый вид нельзя.
- **Соль не удалять и не менять** — ни после перекея, ни «для порядка». Без неё v2 не пересчитать: квоты начнутся заново, псевдонимы бота разорвутся. Новая соль потребует новой схемы (`h3_`) и нового перекея. Копия соли — только в `C:/Users/Borinio/.config/gptbot-private/`.
- **`SINCE` после наступления не двигать.** Перекей обрабатывает только строки до `SINCE`. Сдвиг назад оставит часть старых хешей, сдвиг вперёд вернёт старые ключи на новые строки.

## Удаление переписки (`GPT_MESSAGES_RETENTION_DAYS`) — выключено

- Пусто или `0` — переписка хранится, как сейчас. Любое другое целое число дней действует в пределах 7..3650: `1` означает неделю, `99999` — 3650 дней. Дробь, отрицательное число или текст считаются опечаткой и оставляют удаление выключенным.
- Когда включено, шаг `retention` на каждом тике удаляет не больше 500 строк каждого вида старше срока, одним пакетом D1:
  - `gpt_messages` — сами тексты разговоров;
  - `gpt_sessions.hashed_ip` → `NULL` (строка сессии и её id остаются, заявка по сессии не теряется);
  - `gpt_usage_daily` — устаревшие счётчики.
- Ёмкость: 500 × 96 тиков = 48 000 сообщений в сутки. Модель, токены и стоимость ходов с миграции 0066 лежат в `gpt_turn_reservations`, поэтому удаление текстов экономику не стирает.
- Удаление необратимо. Вернуть можно только через D1 Time Travel, и то на короткий срок.
- **Как включить:** решение владельца и юриста о сроке → тот же релиз меняет текст политики (WP-18, «не дольше N дней») → значение в `wrangler.toml` в двух местах (JSON и таблица) → тесты `runtime-config`, `pages-config-parity` → коммит → guarded-деплой. Тик покажет `"retention":{"enabled":true,"days":N,"deleted":{…}}`.
