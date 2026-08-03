# Bormi — деплой AUTH-1 с выключенным флагом и owner gate перед канарейкой

Дата: 2026-08-03. Ветка: `feature/bormi-quickpost`. Коммит: `c16af37`.

Код привязки и обе миграции **загружены в production**. В D1 не выполнено
ничего: ни реконсиляции ledger, ни 0031, ни 0032, ни одной строки membership.

---

## 1. Живая сверка перед деплоем

`wrangler pages deployment list`, read-only:

| проект | было | стало |
|---|---|---|
| root `ai-direct-pro-landing` | `1471ba04-de13-44be-9fd4-858963d36f0d` (c092353, `main`) | **`6b3d80f1-8484-4a76-b547-4f83e1122556`** (c16af37, `main`) |
| static `gptbot-market-mini-app` | `a9372929-5d19-4248-ada5-0c8458a6e7ef` (c092353, `feature/gptbot-market-mini-app-synthetic-candidate`) | **без изменений** |

Базовая линия совпала с задокументированной до единого идентификатора.

## 2. Почему статик не передеплоен

AUTH-1 не трогает фронтенд. Диапазон `31e56f0..c16af37` содержит 16 файлов:
`functions/` (6), `migrations/` (2), `scripts/d1/` (2), `tests/` (3),
`docs/agents-platform/` (2), `wrangler.toml`. Под `apps/` — ноль файлов
(`git diff --name-only 31e56f0..HEAD -- apps/` пуст). Проект
`gptbot-market-mini-app` обслуживает сборку `apps/market-mini-app`, поэтому его
деплой не требуется и не выполнялся. Service worker остаётся `bormi-shell-v13`.

## 3. Команда

```bash
npm run build:fast
npx wrangler pages deploy dist --project-name=ai-direct-pro-landing --branch=main --commit-hash=c16af37
```

Сборка: 124 статьи пререндерены, 7 черновиков пропущены, sitemap 240 записей
(113 страниц + 124 статьи), robots, `_redirects` (12), `_headers`, 10 LLM
Markdown-двойников. Загружено: Functions bundle, `_routes.json`, `_headers`,
`_redirects`.

`wrangler pages deploy` переписывает биндинги и plain `[vars]` проекта тем, что
объявлено в `wrangler.toml`, — файл остаётся авторитетным источником. Секреты
Pages (`secret_text`) wrangler не трогает.

### Сохранено

Smart Placement, D1/KV/R2/AI-биндинги, все `[vars]`, счётчик секретов,
выключенный auto-deploy из Git, QP-0, CAB-1, flag-off бандл QuickPost.
Единственное изменение конфигурации — одна новая переменная со значением
`"false"`.

## 4. Состояние флагов в production

```
MARKET_NAV_BACK_ENABLED               = true
MARKET_CABINET_ENABLED                = true
MARKET_CABINET_HOME_V2                = true
MARKET_QUICKPOST_ENABLED              = false
MARKET_QUICKPOST_AI_ENABLED           = false
MARKET_OWNER_TELEGRAM_BINDING_ENABLED = false   ← новое
```

## 5. Проверка после деплоя

```
POST https://gptbot.uz/api/admin/seller-binding/challenge   →  401
GET  https://gptbot.uz/api/admin/seller-binding/challenge   →  405 (Allow: POST)
```

Без admin-токена маршрут недостижим: owner gate отвечает раньше, чем флаг вообще
читается. Аутентифицированный владелец при выключенном флаге получит `404`.
Маршрут погашения `/identity/seller-binding` при выключенном флаге возвращает
`null` из обработчика и попадает в общий `404 resource_not_found`.

## 6. Quality gates

| гейт | результат |
|---|---|
| TypeScript `functions` | 0 |
| TypeScript root (`tsc -b`) | 0 |
| TypeScript Mini App | 0 |
| ESLint по изменённым файлам | 0 |
| Целевые тесты привязки | 45/45 |
| `owner-control-center.test.ts` | 71/71 |
| Полный корпус `tests/` | 1299/1302 |
| Root build (`build:fast`) | PASS |
| agent-boundaries | OK |
| Secret scan | clean, 3007 файлов |
| `git diff --check` | clean |
| Локальная репетиция | 42/42 |
| Записей в production D1 | 0 |

### Три унаследованных падения

Проверены на чистом `31e56f0` во временном worktree — падают там же и так же,
к AUTH-1 отношения не имеют:

1. `the current productization baseline preserves every public and admin route pattern` — `'blocked' !== 'pass'`;
2. `sitemap generation retains all 234 static canonical entries` — генератор даёт 240; сайт вырос, базовая линия теста устарела;
3. `buyer storefront route resolves the store but never launches seller onboarding`.

Также 10 ошибок ESLint в `functions/` (SEO-каннибализация, payments, gpt-chat,
intent-guard) — идентичный набор на чистом HEAD, ни один файл AUTH-1 не трогает.

## 7. Что было исправлено в WIP предыдущего агента

| дефект | последствие | исправление |
|---|---|---|
| Порядок операторов в батче: membership → audit | На базе без 0031 `INSERT OR IGNORE` молча глотает нарушение `CHECK`, membership фиксируется **без аудита** | Аудит первым, membership под `EXISTS(event_id)` |
| Guard аудита не перечитывал challenge | Гонка двух погашений одного challenge связывала **два** аккаунта | В guard добавлено `redeemed_at IS NULL AND expires_at > ?` |
| Роль существующего membership не проверялась | Активный `staff` → непрозрачный 500 после записи аудита о несостоявшейся выдаче | Явный `membership_conflict` до батча |
| Провайдер личности не проверялся заранее | Не-telegram личность падала внутри guard как `persistence_failed` | Явный `identity_unsupported` |
| Выпуск брал первый активный магазин | При двух активных магазинах — молчаливый выбор, то есть cross-tenant ошибка | `store_ambiguous`, отказ вместо догадки |
| Нет лимита на выпуск challenge | Перебор со стороны владельца ничем не ограничен | Собственный лимит сервиса: 5 попыток / 10 мин на обе половины |
| Коды ошибок утекали в ответ | Перебирающий узнавал, какие коды существовали | Все отказы по challenge → один `validation_failed` |
| Зеркальный DDL 0032 без внешних ключей | Тесты доказывали не то, что едет в production | Зеркало приведено к миграции, добавлен тест сравнения |
| Тесты — только regex по исходникам | Ни одно поведенческое свойство не проверялось | 22 поведенческих теста на реальной SQLite из реальных миграций |

Компенсирующий `DELETE` из `owner_audit_events`, добавленный в ходе
исправления, был снят: он нарушал инвариант append-only, который проверяет
`no source file issues an UPDATE or DELETE against the audit table`, и при новом
порядке батча недостижим.

## 8. Откат деплоя

Rollback на `1471ba04-de13-44be-9fd4-858963d36f0d` через Cloudflare Pages.
Поскольку миграции не применены, а флаг выключен, откат кода ничего не
восстанавливает и ничего не ломает — новый код в production не активен.

## 9. Owner apply gate

```
AUTH_1_CODE_IMPLEMENTED        = YES
AUTH_1_TESTED                  = YES
AUTH_1_DEPLOYED_FLAG_OFF       = YES
AUTH_1_APPLIED                 = NO

LEDGER_RECONCILIATION_REHEARSAL = PASS
AUDIT_MIGRATION_REHEARSAL       = PASS
CHALLENGE_MIGRATION_REHEARSAL   = PASS
BINDING_REHEARSAL               = PASS
```

Требуется явное одобрение владельца на каждый пункт:

1. бэкап/экспорт production D1;
2. реконсиляция ledger (5 строк метаданных);
3. миграция 0031 (пересборка таблицы аудита, 6 строк сохраняются);
4. миграция 0032 (создание таблицы challenge);
5. включение `MARKET_OWNER_TELEGRAM_BINDING_ENABLED`;
6. выпуск challenge;
7. погашение из Telegram владельца;
8. одна строка `memberships`;
9. включение QuickPost.

Ничего из этого не выполняется до точного сообщения:

```
AUTH-1 APPLY APPROVED.
APPLY AUDITED BINDING AND ENABLE QUICKPOST CANARY.
```

## 10. Статус после owner approval (2026-08-03)

Owner approval получен, схемная часть применена. Подробности —
[BORMI_AUTH1_PRODUCTION_APPLY.md](BORMI_AUTH1_PRODUCTION_APPLY.md).

```
PRODUCTION_BACKUP=PASS
LEDGER_REPAIRED_PRODUCTION=YES          (25 → 30)
AUDIT_MIGRATION_APPLIED_PRODUCTION=YES  (6 строк сохранены, отпечаток совпал)
CHALLENGE_MIGRATION_APPLIED_PRODUCTION=YES
AUTH_1_CHALLENGE_CREATED=NO             ← требует admin-сессии владельца
AUTH_1_MEMBERSHIP_WRITTEN=NO
MARKET_OWNER_TELEGRAM_BINDING_ENABLED=true   (временное окно)
MARKET_QUICKPOST_ENABLED=false
```

Root deployment: `fc22fdc8-12ff-4df3-8141-23f470c0c951` (d0e3a73).

### Доказательство static bundle для QuickPost

Проверено до включения флага, чтобы включение было одним деплоем root:

```
https://gptbot-market-mini-app.pages.dev/            → 200
  entry  /assets/index-Bs44d9TR.js                   → 200, 316 959 B
  lazy   ./QuickPost-D3jQqybg.js                     → 200, 13 789 B
```

Entry-бандл содержит `React.lazy(() => import('./QuickPost-D3jQqybg.js'))` для
`QuickPost` и `QuickPostDone`. В самом чанке присутствуют draft, preview,
category, price, photo и отсутствуют любые маркеры voice, transcription, AI
draft и vision. Источник статика — `c092353`, то есть релиз QP-1A, к которому и
относятся тесты `market-quickpost.test.ts`.

Вывод: включение QuickPost — это изменение одного server-side флага и один root
deploy. Передеплой статика не требуется, service worker не бампается.

## 11. Что не сделано

Ни `wrangler d1 migrations apply --remote`, ни `wrangler d1 execute --remote`,
ни одной записи в production D1, ни одного challenge, ни одной привязки.
QuickPost не включён. QP-1B, voice, transcription, AI structured draft, vision,
QP-2 buyer discovery, condition/location, private seller ownership и переход к
публичному маркетплейсу не начаты.
