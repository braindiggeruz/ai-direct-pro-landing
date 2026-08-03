# Bormi QP-0 — back-gesture spine · production release

Дата: 2026-08-03 · Ветка: `feature/bormi-quickpost`
Релизный коммит: `5e3695c90c11c8e55f235d155265f16c80abd1b7`
Статус: **выпущено · native canary PENDING**

---

## 1. Что изменилось для человека

До релиза любой жест «назад» — аппаратная кнопка Android, чевронка Telegram,
свайп — закрывал всё приложение с любой глубины. Три экрана внутри кабинета,
одно нажатие, и экран, скролл и всё набранное исчезали.

Теперь: back закрывает верхнее открытое. Приложение закрывается только в корне.

Уровни, зарегистрированные сегодня: диалог, секция кабинета, рабочее место
продавца, любая вкладка кроме «Главная».

---

## 2. Реализация

`apps/market-mini-app/src/platform/navigation.ts` — стек открытого, **не роутер**:
ни путей, ни URL, ни реестра экранов. Три источника жеста сведены к одному
правилу:

* Telegram `BackButton` показывается ровно пока что-то открыто;
* одна `history` запись-сентинел — то, что съедает аппаратная кнопка Android;
* видимые «Назад» дёргают тот же стек, поэтому разойтись они не могут.

Ровно одна history-запись существует одновременно: две потребовали бы двух
нажатий и приложение ощущалось бы застрявшим. Собственный `history.back()`
помечается, чтобы не быть принятым за жест. Кадр, отказавший в `pushState`,
сохраняет кнопку Telegram и видимые контролы.

Уровень может отказаться закрыться (`onBack() === false`). Сейчас этим никто не
пользуется — это guard для несохранённой работы composer'а QP-1.

Deep links, History-роутер и полный CAB-2 в этот релиз **не входят**.

---

## 3. Live reconciliation перед релизом

```
ACTUAL_BRANCH=feature/bormi-quickpost
ACTUAL_HEAD=5e3695c            ACTUAL_ORIGIN_MAIN=253c1b7
WORKTREE_CLEAN=yes             stash пуст · merge/rebase нет · git diff --check PASS
PRODUCTION_ROOT_SOURCE (до)=ae784f1   eb2522e3-0f68-469d-9820-3525bcbc0384
PRODUCTION_STATIC_SOURCE (до)=ae784f1 c17cd97c-8958-499e-9407-8dc4338f95cf
SERVICE_WORKER (до)=bormi-shell-v11
PLACEMENT=smart
BINDINGS=GPTBOT_DRAFTS_DB · LOGIN_ATTEMPTS · MARKET_MEDIA
VAR_COUNT=14 → 15   SECRET_COUNT=30 (root) / 0 (static) — не изменился
D1_LEDGER_LAST=0025_owner_control_center_audit.sql
ROWS_WRITTEN=0
```

Более позднего production-релиза не обнаружено — hard stop не сработал.

---

## 4. Gates

| Gate | Результат |
| --- | --- |
| TypeScript functions | **0** |
| TypeScript Mini App | **0** |
| ESLint (изменённая область) | **0** |
| QuickPost корпус | **14 / 14 PASS** |
| Market-корпус | **77 / 77 PASS** |
| Полный корпус | **1234 / 1237** |
| Mini App build | PASS |
| Root build | PASS |
| `check-agent-boundaries` | OK |
| `scan:secrets` | clean (3000 файлов) |
| `git diff --check` | PASS |
| Миграции | 30 файлов, ни одной новой |
| D1 после релиза | 48 товаров, 1 org, 1 store, 1 membership, ledger 25, `rows_written: 0` |

Три унаследованных падения, поимённо из фактического прогона:

1. `the current productization baseline preserves every public and admin route pattern`
2. `sitemap generation retains all 234 static canonical entries`
3. `buyer storefront route resolves the store but never launches seller onboarding`

Новых необъяснённых падений нет.

---

## 5. Deployments

| | Было | Стало |
| --- | --- | --- |
| root `ai-direct-pro-landing` | `eb2522e3-0f68-469d-9820-3525bcbc0384` (ae784f1) | **`fab5fd7f-c639-4152-9512-251a54f029f3`** (5e3695c, `main`) |
| static `gptbot-market-mini-app` | `c17cd97c-8958-499e-9407-8dc4338f95cf` (ae784f1) | **`39221b24-ed8f-4bf8-beb6-7d251fa07595`** (5e3695c, `feature/gptbot-market-mini-app-synthetic-candidate`) |
| service worker | `bormi-shell-v11` | **`bormi-shell-v12`** |

Порядок: exact build → root → static → верификация.

### Live-доказательства

* стартовые чанки: `index-BpJd5dg3.js`, `ui-KeNoZz9i.js`, `BuyerOrders-CIWi8Uej.js`
  — совпадают с локальной сборкой;
* `sw.js` (обход кэша) → `const CACHE = 'bormi-shell-v12'`, `activate` по-прежнему
  удаляет все прочие имена кэша;
* в живом коде найдены `navBack`, `BackButton`, `bormiBack`;
* CAB-1 на месте, путь отката (`Подача объявлений готовится`) остался в бандле;
* кода QuickPost в бандле нет — QP-1 ещё не реализован.

**Замечание:** сразу после деплоя апекс минуту отдавал предыдущий бандл
(edge-cache), deployment-alias — уже новый. Проверять после короткой паузы.

### Сохранено

Production branch `main` / `feature/gptbot-market-mini-app-synthetic-candidate`;
Smart Placement `smart`; D1 `GPTBOT_DRAFTS_DB`; KV `LOGIN_ATTEMPTS`;
R2 `MARKET_MEDIA`; `MARKET_CABINET_ENABLED`, `MARKET_CABINET_HOME_V2`, voice,
media, seller-флаги без изменений; секретов 30 до и 30 после; git auto-deploy
`deployments_enabled: false`, `production_deployments_enabled: false`.

---

## 6. Performance

| Актив (gzip) | `ae784f1` | `5e3695c` | Δ |
| --- | ---: | ---: | ---: |
| `index-*.js` | 70.75 kB | 70.82 kB | +0.07 |
| `ui-*.js` | 26.36 kB | 26.74 kB | +0.38 |
| `CabinetApp-*.js` (lazy) | 2.91 kB | 2.95 kB | +0.04 |
| `BuyerOrders-*.js` | 1.54 kB | 1.55 kB | +0.01 |
| `SellerApp-*.js` (lazy) | 8.02 kB | 8.03 kB | +0.01 |
| `index-*.css` | 8.48 kB | 8.48 kB | 0 |

Стартовая поверхность **109.30 → 109.79 kB gzip (+0.49)**. Активов 7 = 7.
0 новых запросов, 0 новых D1 round trips, 0 новых зависимостей.

---

## 7. Runtime QA (фикстура, DOM-доказательства)

Скриншотов нет — Browser pane не композитил кадры.

| Проверка | Результат |
| --- | --- |
| Кабинет → «Настройки и помощь» → back | корень кабинета, приложение открыто |
| ещё back | «Главная», приложение открыто |
| history-записей на глубине 2 | **1** |
| в корне «Главная» | сентинела нет — жест проваливается в Telegram именно там |
| диалог «Подать» → back | закрыт только диалог, фокус вернулся на вкладку |
| «Поиск» + «Фильтры» → back | закрылись фильтры, вкладка осталась «Поиск» |
| рост истории за весь сценарий | 0 |

---

## 8. Native canary для владельца

1. Полностью закрыть Telegram WebView.
2. Свежий `/start` в @BormiMarketBot, открыть кнопку.
3. Кабинет → «Настройки и помощь».
4. Аппаратный Back → должен вернуть **в кабинет**, а не закрыть приложение.
5. Ещё Back → «Главная».
6. «Подать» → Back должен закрыть **только шторку**.
7. Поиск → Фильтры → Back закрывает фильтры, «Поиск» остаётся.
8. На корне «Главная» Back может закрыть приложение — это правильно.
9. Проверить Android и, если есть, desktop Telegram.

До ответа: `QP_0_NATIVE_CANARY=PENDING`, `QP_0_PRODUCTION_COMPLETE=NO`.

---

## 9. Rollback

Быстрый: `MARKET_NAV_BACK_ENABLED = "false"` + root deploy. Пересборка не нужна —
оба поведения в бандле.

Полный: root `eb2522e3-0f68-469d-9820-3525bcbc0384`,
static `c17cd97c-8958-499e-9407-8dc4338f95cf`.
D1 и R2 не трогать, Telegram не менять.

## 10. Что НЕ делалось

D1 write; миграции; изменение authority; deep links; History-роутер; полный
CAB-2; QuickPost composer; vision; изменение секретов, bindings и Smart
Placement; включение git auto-deploy; работа в `main`; force-push.
