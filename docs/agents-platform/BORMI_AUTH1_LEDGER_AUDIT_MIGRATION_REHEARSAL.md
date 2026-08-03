# Bormi AUTH-1 — расхождение ledger, перестройка аудита и локальная репетиция

Дата: 2026-08-03. Ветка: `feature/bormi-quickpost`.

Ни одна из описанных операций в production не выполнена. Всё ниже — репетиция на
локальной SQLite, построенной из тех же файлов миграций.

---

## 1. Расхождение ledger 0026–0030

`wrangler d1 migrations apply` решает, что запускать, сравнивая каталог
`migrations/` с таблицей `d1_migrations`. В production ledger заканчивается на
**0025**, при том что схема физически несёт всё вплоть до **0030**: колонки,
таблицы и индексы 0026–0030 присутствуют. Runner считает пять миграций
неприменёнными и попытается их выполнить.

Три из пяти содержат голый `ALTER TABLE ... ADD COLUMN`. В SQLite нет
`IF NOT EXISTS` для колонки: первая же завершится «duplicate column name», и
пакет умрёт на середине. Повторный запуск 0026–0030 небезопасен.

Поэтому ledger нужно привести в соответствие **до** того, как runner будет
вызван снова, и сделать это файлом, который runner не видит.

### Скрипт

`scripts/d1/reconcile-ledger-0026-0030.sql` — **не** нумерованная миграция и
лежит вне `migrations/`. Запускается один раз, отдельно, через
`wrangler d1 execute --file`.

Свойства:

- не выполняет ни одного DDL: тест проверяет отсутствие
  `ALTER TABLE|CREATE TABLE|DROP TABLE|CREATE INDEX` в коде скрипта;
- **fail closed**: каждая строка вставляется только если база физически
  доказывает наличие артефактов этой миграции; отсутствует артефакт — строка не
  пишется, ledger остаётся позади, runner остаётся заблокированным. Это
  безопасное направление; ничего не чинится по догадке;
- идемпотентен: `NOT EXISTS` по уникальному `name`, второй запуск пишет 0 строк;
- пишет максимум 5 строк в `d1_migrations` и не трогает бизнес-данные.

Проверяемые артефакты:

| миграция | физическая проверка |
|---|---|
| 0026 | 4 колонки `preferred_locale`, `pending_intent`, `pending_request_key`, `pending_at` на `sotuvchi_storefront_sessions` + индекс `idx_sotuvchi_storefront_pending` |
| 0027 | `search_terms_json`, `specifications_json` на `sotuvchi_products` |
| 0028 | таблицы `sotuvchi_buyer_presentations`, `sotuvchi_buyer_comparisons` |
| 0029 | колонка `buyer_comment` на `sotuvchi_orders` |
| 0030 | таблицы `telegram_agent_update_metrics`, `telegram_agent_rate_limits`, `telegram_agent_rate_limit_notices` |

Тест `the ledger repair refuses to claim a migration that did not land` строит
базу без 0029 и доказывает, что её строка не появляется, а соседние появляются.

## 2. Перестройка таблицы аудита (0031)

`owner_audit_events.action` — `CHECK` по закрытому списку из пяти глаголов.
«Владелец выдал Telegram-личности доступ к своему магазину» среди них нет. Без
этого привязка проходила бы без аудита, а неаудированная выдача прав продавца —
не то, что должно быть возможно.

SQLite не умеет менять `CHECK` на месте, поэтому таблица пересобирается:
создаётся `owner_audit_events_new` с идентичным набором колонок, ограничений и
`UNIQUE (idempotency_key)`, строки копируются явным списком колонок (не
`SELECT *`), старая таблица удаляется, новая переименовывается, все три индекса
создаются заново.

Что **не** расширено:

- `target_type` — привязка записывается против магазина (`'store'`), который уже
  индексируется `idx_owner_audit_target`;
- `reason_code` — `'seller_request'` уже описывает ровно этот случай.

Добавлены два глагола: `seller.bind` и `seller.unbind`. Парой, как
`pilot.activate`/`pilot.pause`.

### Lockstep

Рантайм-DDL в `functions/platform/admin/audit.ts` (`ensureOwnerAuditSchema`,
для тестов и локальных запусков) и `OWNER_AUDIT_ACTIONS` в
`functions/platform/admin/validation.ts` двигаются вместе с 0031. Две
расходящиеся версии `CHECK` не допускаются; тест
`the audit log learns exactly two verbs and keeps its old ones` сверяет все три
источника.

Важно: `ensureOwnerAuditSchema` использует `CREATE TABLE IF NOT EXISTS` и на
production, где таблица уже есть, не делает ничего. Обновление зеркала **не**
чинит production — это делает только 0031. Именно поэтому порядок операторов в
батче погашения устроен так, что без 0031 выдача не проходит вовсе (см.
[BORMI_OWNER_TELEGRAM_BINDING_SECURITY.md](BORMI_OWNER_TELEGRAM_BINDING_SECURITY.md) §5).

### Границы транзакции

D1 не принимает явные `BEGIN`/`COMMIT` внутри файла миграции; атомарность
обеспечивает сам runner, выполняющий операторы файла одним пакетом. Проверка
результата — не внутри SQL, а после применения: количество строк, определения
индексов, `PRAGMA foreign_key_check`, `PRAGMA integrity_check` (см. §4).

## 3. Таблица challenge (0032)

Чисто аддитивная: одна новая таблица и один индекс, ни одной существующей
таблицы не касается. Детали схемы и обоснование — в документе по безопасности,
§4.

## 4. Локальная репетиция

`scripts/d1/rehearse-auth1.ts`. Строит SQLite в том состоянии, в котором
production находится сейчас — схема применена до 0030, ledger остановлен на
0025, шесть строк `owner_audit_events`, — и проходит всю последовательность.
Ничего удалённого не вызывается: в файле нет ни одного Cloudflare-binding, ни
account id, ни токена, `wrangler` не запускается.

```bash
npx tsx scripts/d1/rehearse-auth1.ts
```

Результат прогона 2026-08-03: **42/42 PASS**, remote D1 rows written: 0.

| # | проверка | итог |
|---|---|---|
| 01–02 | baseline `integrity_check`, `foreign_key_check` | PASS |
| 03 | baseline `owner_audit_events` = 6 строк | PASS |
| 04 | baseline 3 индекса (`actor`, `created`, `target`) | PASS |
| 05 | baseline ledger = 25 | PASS |
| 06–07 | реконсиляция пишет ровно 5 строк, имена 0026–0030 по порядку | PASS |
| 08 | повторный запуск идемпотентен | PASS |
| 09 | реконсиляция не тронула строки аудита | PASS |
| 10–11 | 0031 сохраняет все 6 строк, побайтово | PASS |
| 12–13 | 0031 восстанавливает 3 индекса с идентичными определениями | PASS |
| 14 | `owner_audit_events_new` не остался | PASS |
| 15–16 | `foreign_key_check`, `integrity_check` после 0031 | PASS |
| 17–18 | 0032 создаёт таблицу, строк не добавляет | PASS |
| 19–21 | выпуск: 1 строка, сырое значение в таблице отсутствует, второй выпуск отказан | PASS |
| 22–28 | погашение: 1 membership (owner/active), 1 audit, challenge погашен, ни org/store/onboarding, ответ без идентификаторов | PASS |
| 29–31 | replay отказан, второй membership и второй audit не появляются | PASS |
| 32–35 | **без 0031**: погашение падает, membership не выдан, аудит не тронут, challenge остаётся живым | PASS |
| 36–37 | отключённый membership отказывает и не реактивируется | PASS |
| 38–40 | откат одним `UPDATE`, запись аудита переживает откат | PASS |
| 41–42 | финальные `foreign_key_check`, `integrity_check` | PASS |

Синтетические личности: `identity_tg_synthetic` / external id `999000111`.
Реальный Telegram-аккаунт владельца в репетиции не участвует.

## 5. Точный список предлагаемых production-записей

Ничего из этого не выполнено.

| объект | операция | объём |
|---|---|---|
| `d1_migrations` | INSERT | ровно 5 строк (метаданные 0026–0030), при полном совпадении артефактов |
| `owner_audit_events` | пересборка таблицы | 6 существующих строк сохраняются, 3 индекса восстанавливаются |
| `seller_identity_binding_challenges` | CREATE TABLE + CREATE INDEX | 0 строк |
| `seller_identity_binding_challenges` | INSERT | 1 строка на выпуск challenge |
| `memberships` | INSERT | 1 строка: `role='owner'`, `status='active'` |
| `owner_audit_events` | INSERT | 1 строка: `action='seller.bind'` |
| `seller_identity_binding_challenges` | UPDATE | 1 строка: `redeemed_at` |
| `organizations`, `sotuvchi_stores`, `sotuvchi_onboardings`, `identities` | — | 0 |

## 6. Порядок применения (после одобрения владельца)

1. экспорт/бэкап production D1;
2. `wrangler d1 execute … --file=scripts/d1/reconcile-ledger-0026-0030.sql --remote`
   и проверка, что появилось ровно 5 строк с именами 0026–0030;
3. `wrangler d1 migrations apply … --remote` — должны примениться только 0031 и
   0032;
4. проверка: 6 строк аудита на месте, 3 индекса на месте,
   `foreign_key_check`/`integrity_check` чисты;
5. включить `MARKET_OWNER_TELEGRAM_BINDING_ENABLED=true`;
6. выпустить challenge, погасить из Telegram владельца;
7. проверить: 1 membership, 1 audit `seller.bind`, challenge погашен;
8. выключить флаг обратно.

Шаг 2 и шаг 3 разделены намеренно: пока ledger не приведён в порядок, runner
попытается переиграть 0026–0030 и упадёт на `ADD COLUMN`.
