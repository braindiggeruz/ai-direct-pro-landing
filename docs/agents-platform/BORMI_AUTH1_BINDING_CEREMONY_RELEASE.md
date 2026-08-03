# Bormi AUTH-1F — релиз церемонии привязки с выключенным флагом

Дата: 2026-08-03. Ветка `feature/bormi-quickpost`. Релизный коммит `3c8da0a`.

Обе поверхности в production. Привязка не выполнена: флаг выключен, ни одного
кода не выпущено, ни одной строки в D1 не записано.

---

## 1. Live reconciliation до кода

```
ACTUAL_BRANCH=feature/bormi-quickpost
ACTUAL_HEAD=ca10fd095196156d0b7629208fe66c85c1ac49b7  (совпадал с origin)
WORKTREE_CLEAN=YES   MERGE_REBASE_STATE=none   STASH_COUNT=0
AUTH1_COMMITS_PRESENT=bb361f6, 5763d14, 05d783b, c16af37, cb4579e — все пять
```

D1, read-only, до первой строки кода:

```
D1_LEDGER_LAST=0032_seller_identity_binding_challenge.sql  (32 строки)
PENDING_MIGRATIONS=нет
AUDIT_ROWS=6            SELLER_BIND_AUDIT_ROWS=0
CHALLENGE_TABLE_EXISTS=yes   CHALLENGE_ROWS=0
MEMBERSHIPS=1           TELEGRAM_MEMBERSHIPS=0
ORGANIZATIONS=1  STORES=1  ONBOARDINGS=0  PRODUCTS=48
ROWS_WRITTEN=0
```

Cloudflare: root `e1c24a99` (b9be438, `main`), static `a9372929` (c092353,
`feature/gptbot-market-mini-app-synthetic-candidate`), Smart Placement `smart`,
18 vars, service worker `bormi-shell-v13`. Всё совпало с задокументированным.

## 2. Что построено

| поверхность | файл |
|---|---|
| Owner Control Center | `src/admin/components/SellerBindingCard.tsx` на странице магазина |
| Owner API | `createSellerBindingChallenge()` без аргументов |
| Mini App | `apps/market-mini-app/src/screens/SellerBindingRedeem.tsx`, lazy |
| нормализация кода | `apps/market-mini-app/src/lib/binding-code.ts` |
| read-only проверка | `POST /identity/seller-binding/inspect` |
| presentation flag | `flags.ownerTelegramBinding` |

Протокол AUTH-1 не менялся. Обоснование inspect-варианта —
[BORMI_AUTH1_BINDING_CEREMONY_UI.md](BORMI_AUTH1_BINDING_CEREMONY_UI.md) §3.

## 3. Quality gates

| гейт | результат |
|---|---|
| TypeScript functions / root / Mini App | 0 / 0 / 0 |
| ESLint по изменённым файлам | 0 |
| market-owner-telegram-binding | 59/59 |
| Полный корпус | 1313/1316 |
| Root build | PASS |
| Mini App build | PASS |
| boundaries | OK |
| secret scan | clean, 3018 файлов |
| `git diff --check` | clean |
| local rehearsal | 42/42 |
| миграций | 32, новых нет |
| записей в D1 | 0 |

Унаследованные падения — те же три, ранее воспроизведённые на чистом `31e56f0`:
productization route baseline, sitemap 240≠234, sotuvchi-onboarding. Плюс
статический lint-долг в `src/admin` и `functions/` в файлах, которых релиз не
касается.

Три чужих ассерта пришлось обновить: два фиксировали `bormi-shell-v13` (тест
называется «the shell change carries a new cache name» — он и должен двигаться с
каждым shell-релизом), один фиксировал точную форму back-обработчика кабинета,
куда добавилась ветка для нового экрана.

## 4. Visual/runtime QA

Проведена на работающем dev-сервере с фикстурой (`?bind=1`), 320×720, RU и UZ,
light и dark. Скриншоты недоступны (панель браузера не композитит кадры), поэтому
зафиксированы DOM-геометрия, вычисленные стили и accessibility tree.

| проверка | результат |
|---|---|
| строка «Привязать магазин» при `ownerTelegramBinding=true` и без магазина | видна |
| после успеха строка исчезает, появляется «Магазин» | да, после refetch bootstrap |
| вставка `BBBBBBBB BBBBBBBB …` (верхний регистр + пробелы) | нормализуется, кнопка активна |
| подтверждение называет магазин | «Магазин: Bormi Demo», доступ из 4 пунктов |
| неверный код | «Код недействителен или истёк», `role="alert"`, `aria-invalid` |
| `localStorage` / `sessionStorage` на каждом шаге | кода нет |
| URL на каждом шаге | кода нет |
| horizontal scroll на 320 px | `scrollWidth = clientWidth = 320` |
| целей меньше 44 px | ноль |
| accessibility tree | `<label>` оборачивает поле, подсказка внутри, `status`/`alert` регионы, список доступа |
| UZ | `Do‘konni bog‘lash`, полная пара для всех 26 ключей |
| dark | поле `rgb(28,25,36)` на тексте `rgb(251,249,255)` |
| моноширинный шрифт кода | `ui-monospace, SFMono-Regular, …` |

## 5. Bundle

Измерено сборкой этого дерева против сборки `ca10fd0`.

| чанк | до | после | дельта |
|---|---|---|---|
| entry `index` | 231.93 kB / 70.92 gzip | 232.09 kB / 70.98 | +0.16 / +0.06 |
| `ui` (общий) | 82.74 kB / 28.05 | 85.36 kB / 28.82 | +2.62 / +0.77 |
| `CabinetApp` (lazy) | 11.38 kB / 2.94 | 12.04 kB / 3.08 | +0.66 / +0.14 |
| `SellerBindingRedeem` (lazy) | — | **3.82 kB / 1.38** | новый |
| `QuickPost` (lazy) | 13.81 kB | 13.81 kB | 0 |
| `SellerApp` (lazy) | 31.44 kB | 31.44 kB | 0 |

Начальный JS вырос на **+2.78 kB raw / +0.83 kB gzip** — это строки локализации,
которые живут в общем чанке. Экран привязки грузится только при открытии;
покупатель не тянет ни его, ни QuickPost. Ни одной новой зависимости, ни
удалённых шрифтов, ни анимационного фреймворка.

Живая проверка после деплоя: entry не ссылается на чанк привязки; на него
ссылается только `CabinetApp`, и он отдаётся 200 / 3829 байт. В самом чанке нет
`localStorage`, `sessionStorage`, `console.log`, `identityId`, `telegramId`.

## 6. Деплой

```
PREVIOUS_ROOT_DEPLOYMENT=e1c24a99-64ed-4742-8741-9b79578a9310  (b9be438)
PREVIOUS_STATIC_DEPLOYMENT=a9372929-5d19-4248-ada5-0c8458a6e7ef (c092353)

NEW_ROOT_DEPLOYMENT=8995170f-92a4-4a3b-8e04-f22bbb140d2d       (3c8da0a, main)
NEW_STATIC_DEPLOYMENT=6e570fd0-84df-4ada-8f4f-9d90c9428446     (3c8da0a,
                       feature/gptbot-market-mini-app-synthetic-candidate)

SERVICE_WORKER=bormi-shell-v14  (проверен на живом /sw.js)
```

Статик задеплоен, потому что фронтенд изменился; root — потому что изменились
Functions и bootstrap. Ветка статика та же историческая. Smart Placement,
биндинги, vars, секреты и выключенный auto-deploy сохранены: единственное
изменение конфигурации в этом релизе — отсутствует, `wrangler.toml` не менялся.

### Флаги после деплоя

```
MARKET_OWNER_TELEGRAM_BINDING_ENABLED = false
MARKET_QUICKPOST_ENABLED              = false
MARKET_QUICKPOST_AI_ENABLED           = false
```

### Проверка fail-closed на production

```
POST /api/admin/seller-binding/challenge            → 401
POST /api/market/v1/identity/seller-binding         → 401
POST /api/market/v1/identity/seller-binding/inspect → 401
```

Ни одна из трёх дверей не открыта анонимно. При выключенном флаге
аутентифицированный владелец получит 404, а маршруты Mini App вернут общий
`resource_not_found`.

### D1 после деплоя

```
ledger 32 · audit 6 · seller.bind 0 · challenges 0 · memberships 1
telegram memberships 0 · orgs 1 · stores 1 · onboardings 0 · products 48
rows_written 0
```

## 7. Откат

- UI: previous root `e1c24a99` и previous static `a9372929`;
- церемония: `MARKET_OWNER_TELEGRAM_BINDING_ENABLED=false` (уже так);
- после привязки: `memberships.status='disabled'`, никогда DELETE; аудит
  append-only, погашенный challenge остаётся погашенным;
- QuickPost: `MARKET_QUICKPOST_ENABLED=false` + root deploy.

Не откатываются: ledger repair, миграции 0031 и 0032, история аудита. Таблица
challenge не удаляется.

## 8. Owner apply gate

```
BINDING_OWNER_UI_IMPLEMENTED=YES
BINDING_MINI_APP_UI_IMPLEMENTED=YES
BINDING_UI_TESTED=YES
BINDING_UI_DEPLOYED_FLAG_OFF=YES

BINDING_FLAG=false   QUICKPOST_FLAG=false   AI_FLAG=false
```

Требуется владелец:

1. свежий post-migration pre-binding backup;
2. включить binding flag + root deploy;
3. Owner Control Center → магазин → «Привязка Telegram»;
4. создать один код;
5. скопировать;
6. открыть Mini App со своего Telegram;
7. Кабинет → Настройки и помощь → Привязать магазин, вставить код;
8. проверить имя магазина и подтвердить;
9. проверить: 1 membership, 1 audit `seller.bind`, 1 погашенный challenge;
10. выключить binding flag + root deploy;
11. проверить sellerRead/sellerCommands;
12. включить QuickPost + root deploy;
13. ручная QuickPost canary.

Не выполняется до точного сообщения:

```
AUTH-1F APPLY APPROVED.
ENABLE THE BINDING CEREMONY FOR ONE OWNER SESSION.
```

## 9. Что не выполнялось

Флаг привязки не включался. Ни одного кода не выпущено и не погашено. Ни одной
строки `memberships`, ни одного audit-события привязки, ни одной строки
challenge. QuickPost не включён, AI и vision не трогались. Организации,
магазины, onboarding, identities и существующая API-owner membership не
изменялись. Новых миграций нет. BotFather, webhook, Railway, n8n не трогались.
QP-1B, QP-2, voice, transcription, vision, condition/location, private seller
model не начинались.
