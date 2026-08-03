# Bormi — Cabinet Home v2 (CAB-1) release

Дата: 2026-08-03 · Ветка: `feature/bormi-cabinet-home-v2` · База: `2f6d893`
Релизный коммит: `ae784f150fa6d5921e8b98487efb03997968f5fb`

---

## 1. Recovery note

Эта сессия приняла **незавершённый CAB-1** после исчерпания лимита токенов
предыдущего агента. Реализация с нуля не начиналась; незакоммиченный WIP не
откатывался и не переписывался.

Фактическое состояние, найденное на входе:

| Факт | Значение |
| --- | --- |
| Ветка | `feature/bormi-cabinet-home-v2` |
| HEAD | `2f6d893` (коммитов поверх базы **не было**) |
| `origin/main` | `253c1b7` (локальная `main` впереди на 12) |
| Рабочее дерево | грязное: 14 modified, 2 untracked |
| Stash | пусто |
| Незавершённый merge/rebase | нет |
| `git fsck` | только dangling-объекты, потерь нет |
| Процесс на :4187 | PID 4992, `vite --port 4187 --strictPort`, старт 08:33 — fixture предыдущего агента |

Два источника, названные в задании, **на диске отсутствуют** и не были созданы
предыдущим агентом:

* `BORMI_CABINET_UX_AUDIT_2026-08-03.md` — нет ни в репозитории, ни на диске;
* «Вставленный текст(19).txt» — нет на диске.

Аудит **не восстанавливался задним числом**: выдумывать продуктовый документ,
которого не было, хуже, чем зафиксировать его отсутствие. Продуктовым контрактом
для добивания служил owner prompt (разделы 7–13) плюс
`BORMI_MASTER_CHAT_PROJECT_HANDOFF_2026-08-03_0456_UZT.md` (рабочий стол) и
`docs/agents-platform/BORMI_HANDOFF_2026-08-02_SELLER_CABINET.md`.

### Страховка WIP

До первой правки снят внешний recovery snapshot (вне tracked tree):

```
F:\Claude\bormi-recovery\CAB-1-2026-08-03-1200\
  cab1-wip.patch        82 283 B   (git diff --binary)
  cab1-diff-stat.txt
  cab1-status.txt
  cab1-untracked.txt
  metadata.txt          branch / HEAD / origin-main
  untracked\apps\market-mini-app\src\lib\bot-link.ts
  untracked\tests\market-cabinet-home-v2.test.ts
```

Snapshot в Git не включён.

---

## 2. Owner decisions, применённые без переспрашивания

1. Нижняя вкладка — «Кабинет» / `Kabinet`.
2. Заказы покупателя — «Заказы» / `Buyurtmalarim`.
3. `so‘rov` освобождён под будущие запросы «Ищу»; ни одна строка орderной копии
   его больше не держит в заказной копии (проверяется тестом).
4. Общий счётчик заказов не показывается — truncation не доказан эндпоинтом
   `/orders?limit=5`.
5. CAB-2 не начат.
6. Seller authority не менялась.
7. Фиктивного onboarding нет.
8. Auto-provisioning частного продавца нет.
9. Migration ledger не тронут (0025 в D1, 30 файлов миграций в репозитории).
10. Пятая вкладка «Избранное» не добавлена.
11. Legacy SellerApp path при `cabinet=false` сохранён.
12. `bootstrap.navigation` — только presentation hint, никогда authority.

---

## 3. Что уже было сделано предыдущим агентом

Полный code review диффа показал, что WIP был **связным и почти полным**, а не
черновиком: оборванного JSX, заглушек, тупиковых TODO, hardcoded authority,
новых D1-эндпоинтов, миграций, raw Telegram ID и PII в логах — не найдено.

Готово до этой сессии: feature flag во всех четырёх слоях
(`wrangler.toml` → `Env` → оба bootstrap payload → `flags.cabinetHomeV2`),
Cabinet Home v2, identity row, attention-модель, разделы, «Настройки и помощь»,
перенос launch diagnostics, action sheet «Подать», обе ветки sell/wanted,
badge кабинета, локализация handoff reason/status, устранение декоративных нулей,
архив с подтверждением, разделение `.segmented` / `.segmented--choice`,
RU/UZ копия, bump service worker до v11, `bot-link.ts` и файл тестов
`tests/market-cabinet-home-v2.test.ts` (29 тестов).

Начальное состояние WIP по gates:

| Gate | На входе |
| --- | --- |
| TypeScript functions | 0 ошибок |
| TypeScript Mini App | 0 ошибок |
| ESLint (изменённая область) | **1 ошибка** |
| CAB-1 тесты | **26 / 29** |
| Mini App build | PASS |

---

## 4. Что оказалось сломано и что исправлено в чужом WIP

### 4.1. Продуктовые дефекты (исправлены)

**A. Событие внимания не называлось на экране.**
`rows` строился как `events.filter((event) => event !== primary)`, то есть самое
срочное событие исключалось из списка и оставалось только кнопкой. При
единственном незавершённом оформлении блок «Требует внимания» **не отрисовывался
вообще**, а под identity висела кнопка «Продолжить оформление» без единой строки,
объясняющей, что именно ждёт. Это прямо противоречит контракту («activeCheckout →
одна честная строка»).
Исправлено: `const rows = events.slice(0, 3);` — каждое событие названо строкой,
а primary остаётся ответом на строку прямо над ним.

**B. Счётчики не перечитывались, и главный экран CAB-1 не мог появиться.**
`POST /checkout`, `POST /checkout/cancel` и `POST /handoffs` не инвалидировали
`['bootstrap']`. Проверено вживую на фикстуре: заказ, брошенный на первом шаге,
**не давал** ни строки внимания, ни badge — они появлялись только со следующего
холодного старта. Исправлено: все три мутации инвалидируют `['bootstrap']`;
`resumeCheckout` делает то же самое, когда сервер отвечает «активного оформления
нет», чтобы устаревшая строка не осталась контролом, отвечающим пустотой.

### 4.2. Инженерные дефекты (исправлены)

**C. ESLint: `react-hooks/set-state-in-effect` в `CabinetApp.tsx:290`.**
Sell intent обрабатывался `setState` внутри эффекта. Переписано на штатный
приём React «adjust state during render» (`answeredIntent`), эффект оставлен
только для подтверждения флага шеллу — своего состояния он больше не ставит.
Побочный выигрыш: рабочее место рисуется сразу, а не через кадр после корня.

**D–F. Три ассерта в новом тест-файле были написаны неверно** и падали на
корректном коде. Ни один не ослаблен — все уточнены:

| Тест | Причина падения | Что стало |
| --- | --- | --- |
| «a buyer without seller commands…» | `\n\}\n` не совпадает при CRLF-checkout | `\r?\n\}\r?\n` |
| «an unfinished checkout…» | `/attentionCheckout/g` считал и `attentionCheckoutHint` | `/attentionCheckout'/g` |
| «the reported navigation is a hint…» | `navigation[\s\S]{0,60}sellerAvailable` ловил деструктуризацию пропсов | блок вывода подсказки проверяется на отсутствие любых seller-признаков + `navigation` читается ровно в двух местах |

Плюс добавлены ассерты, закрывающие новые инварианты: подтверждение sell intent
не ставит состояние, и каждое событие внимания рендерится строкой.

Ничего из работающего WIP не переписывалось «на всякий случай»; broad refactor не
делался; зависимости не добавлялись.

---

## 5. Scope

**Вошло:** Hybrid Cockpit Cabinet Home; identity row без ярлыка роли; «Требует
внимания» только на реальных данных, максимум три строки; одно контекстное
primary action; реальные разделы («Заказы», «Магазин» только при server-derived
`sellerRead`, «Настройки и помощь»); перенос launch diagnostics в Help; рабочий
action sheet «Подать» с обеими живыми ветками; badge только из `activeCheckout` и
`activeHandoff`; устранение декоративных нулей; локализация raw domain keys;
достижимый архив с подтверждением; исправление конфликтующего `.segmented`;
RU/UZ; light/dark; accessibility; feature flag; rollback.

**Не вошло:** CAB-2, URL/hash-навигация, History API, Telegram BackButton, deep
links, wanted-request domain, Bormi Match, conversations, messages, favorites,
saved searches, private seller provisioning, мутации seller authority,
membership/onboarding, D1 migration, платежи, редизайн checkout, BotFather,
webhook, performance optimization, Functions bundle split, Railway, n8n.

---

## 6. Feature flag

```
wrangler.toml   MARKET_CABINET_HOME_V2 = "true"
functions/_types.ts   MARKET_CABINET_HOME_V2?: string
functions/market/router.ts   cabinetHomeV2: marketFlag(env.MARKET_CABINET_HOME_V2)   ×2
apps/.../types.ts   Capabilities.cabinetHomeV2?: boolean   (additive, optional)
apps/.../App.tsx    const cabinetHomeV2 = cabinetEnabled && flags.cabinetHomeV2 === true
```

Свойства, закреплённые тестом: `marketFlag` пропускает только `true` в любом
регистре; флаг читают **ровно два** места в роутере и ни одно из них не
находится в seller read/command ветках; клиент читает его как layout, никогда как
capability; старый клиент не ломается (поле optional); при `false` возвращается
ровно тот кабинет, что был в проде, вместе со своим экраном «Скоро».

---

## 7. Поведение CAB-1

Корень: identity → «Требует внимания» (только если есть события) → одно primary
action → разделы → «Настройки и помощь». На корне нет hero-заголовка, ярлыка
роли, отдельной панели настроек, launch timings, нулей, raw-ключей, пустых и
будущих разделов. Тема и язык остаются в шапке; их копия живёт на один уровень
ниже, в «Настройках и помощи», и питается тем же состоянием.

**Источники внимания — только реальные:** `activeCheckout`, `activeHandoff`,
`storeAttentionTotal(/seller/overview)` при `sellerRead`. Ни непрочитанных
сообщений, ни совпадений, ни откликов, ни просмотров. Ноль → блока нет. У каждой
строки есть существующий destination.

**«Подать»** — настоящий `role="dialog" aria-modal="true"` поверх текущей
вкладки; вкладка сохраняет `aria-current`, кнопка несёт `aria-haspopup="dialog"`
и `aria-expanded`. «Продать» при `sellerCommands` открывает существующий
ProductEditor (через `startEditor`), без `sellerCommands` — реальную ссылку
`https://t.me/BormiMarketBot?start=agent_seller`, выведенную из того же модуля
`src/shared/sotuvchi-config`, который уже проверяется релизными тестами. «Ищу»
открывает существующий Search и ставит каретку в существующее поле; ничего не
создаётся и связь с продавцами не обещается.

**Честность:** `0 Подтверждён` и подобные KPI убраны — счётчик рендерится только
по truthiness; `order_question`, `open`, `answered` получили слова, неизвестное
значение резолвится в нейтральный локализованный fallback, доменные
идентификаторы не менялись; архив достижим фильтром и действием, необратимость
сказана прямо; Help — нажимаемая ссылка.

---

## 8. Файлы

```
apps/market-mini-app/public/sw.js               v10 → v11
apps/market-mini-app/src/App.tsx
apps/market-mini-app/src/components/ui.tsx      + ConfirmDialog, + icon "settings"
apps/market-mini-app/src/dev/synthetic.ts       фикстура: флаг, /checkout/active, /handoffs/active
apps/market-mini-app/src/lib/bot-link.ts        новый
apps/market-mini-app/src/lib/i18n.ts            + CAB-1 копия RU/UZ, labelForHandoff*
apps/market-mini-app/src/screens/BuyerApp.tsx   + CreateSheet, badge, hint, resume
apps/market-mini-app/src/screens/CabinetApp.tsx + Cabinet home v2
apps/market-mini-app/src/screens/SellerApp.tsx  + archive, метрики без нулей, слова вместо статусов
apps/market-mini-app/src/styles.css             + cabinet-identity / attention / create-list, .segmented--choice
apps/market-mini-app/src/types.ts               + cabinetHomeV2?
functions/_types.ts                             + MARKET_CABINET_HOME_V2?
functions/market/router.ts                      + флаг в оба payload
tests/market-cabinet-home-v2.test.ts            новый, 29 тестов
tests/market-cabinet-shell.test.ts              v10 → v11
wrangler.toml                                   + MARKET_CABINET_HOME_V2
```

16 файлов, +1440 / −148.

---

## 9. Quality gates

| Gate | Результат |
| --- | --- |
| TypeScript functions (`tsc -p tsconfig.functions.json --noEmit`) | **0** |
| TypeScript Mini App (`tsc -b --force`) | **0** |
| ESLint (`functions/market functions/platform/market apps/market-mini-app/src`) | **0** |
| CAB-1 тесты (`tests/market-cabinet-home-v2.test.ts`) | **29 / 29 PASS** |
| Соседние market-тесты (shell + auth + contract) | **34 / 34 PASS** |
| Полный корпус (`tests/*.test.ts`) | **1220 / 1223**, 3 унаследованных |
| Mini App build | PASS |
| Root build (`npm run build`) | PASS |
| `npx tsx scripts/check-agent-boundaries.ts` | OK (no violations) |
| `npm run scan:secrets` | clean (2992 файла) |
| `git diff --check` | PASS |
| Миграции | 30 файлов, ни одной новой |
| D1 | схема не менялась; ledger 0025 |
| PII / новые секреты / новый launch request | нет |

**Три унаследованных падения** (точные имена из текущего прогона, существовали до
CAB-1 и не связаны с ним):

1. `the current productization baseline preserves every public and admin route pattern`
2. `sitemap generation retains all 234 static canonical entries`
3. `buyer storefront route resolves the store but never launches seller onboarding`

Новых необъяснённых падений нет.

---

## 10. Runtime и visual QA

Фикстура поднята на текущем WIP (`VITE_MARKET_DEV_MODE=fixture`, :4187, свой
процесс сессии, остановлен после QA). Скриншотов нет — Browser pane не
композитил кадры, поэтому доказательства сняты через DOM-геометрию, computed
styles и accessibility tree, а не заявлены как изображения.

Проверено при 390×844 и 320×720, RU и UZ, light и dark:

| Проверка | Результат |
| --- | --- |
| Горизонтальный скролл | `scrollWidth == clientWidth` на всех экранах (390 и 320) |
| Tap targets < 44 px | ни одного |
| Две нижние панели | нигде: в seller workspace ровно один `<nav>` |
| Экран «Скоро» | недостижим при флаге on; сохранён при флаге off |
| Raw domain keys на экране | нет |
| Декоративные нули | нет; «Сегодня» скрывает нулевые метрики целиком |
| Diagnostics на корне | нет; доступны в «Настройках и помощи» |
| `.segmented--choice` | внутри карточки: 31…359 при карточке 16…374; при 320 — 266 px в карточке 296 px |
| Focus trap | Tab с последнего элемента возвращается на первый |
| Focus return | после закрытия фокус вернулся ровно на открывшую кнопку |
| Scroll lock | `body.overflow` восстановлен после закрытия |
| Sheet и safe-area | контент заканчивается на 713 px при высоте 720; отступ снизу — штатный `--safe-bottom` |
| `E’lon` | не обрезается (`scrollWidth == clientWidth` у подписи) |
| UZ-апострофы | прямых ASCII-апострофов нет |

Состояния:

* **buyer empty** (`sellerRead:false`, вопрос закрыт) — блока внимания нет,
  badge нет (`aria-label` пуст), раздела «Магазин» нет, primary — «Подать
  объявление», внизу честная строка; **чанк SellerApp не запрошен вообще**
  (Resource Timing пуст).
* **activeCheckout** — критическая строка первой, badge = 2, primary
  «Продолжить оформление» переоткрывает наполовину заполненный заказ с именем
  товара и ценой из снимка.
* **отмена оформления** — строка и badge уходят сразу, без перезапуска.
* **activeHandoff** — строка + «Открыть вопрос» → экран «Мой вопрос продавцу» с
  «Вопрос по заказу» и «Ждёт ответа».
* **sellerRead:true** — раздел «Магазин» со счётчиком 4, строка внимания
  «Задачи магазина».
* **три события** — ровно три строки, cap соблюдён.
* **action sheet** — real dialog, обе ветки; при `sellerCommands:false` «Продать
  через бота» — `<a href="https://t.me/BormiMarketBot?start=agent_seller"
  target="_blank" rel="noreferrer">`.
* **«Ищу»** — sheet закрывается, вкладка «Поиск» получает `aria-current`,
  фокус на `input[type=search][aria-label="Поиск"]`.
* **архив** — кнопка на каждом неархивированном товаре, ConfirmDialog (не sheet),
  Esc закрывает, фильтр «Архив» / `Arxiv` с честным пустым состоянием.
* **flag=false** — корень возвращается к hero «Кабинет», ярлыку «Покупатель и
  продавец», собственной панели настроек и launch timings на корне, а «Подать»
  снова ведёт на экран «Скоро» с `aria-current`. Rollback доказан.

---

## 11. Performance

CAB-1 ничего не оптимизирует; замер — только before/after.

| Актив (gzip) | `2f6d893` | `ae784f1` | Δ |
| --- | ---: | ---: | ---: |
| `index.html` | 2.17 kB | 2.17 kB | 0 |
| `index-*.css` | 8.15 kB | 8.48 kB | +0.33 kB |
| `index-*.js` | 70.11 kB | 70.75 kB | +0.64 kB |
| `ui-*.js` | 24.98 kB | 26.36 kB | +1.38 kB |
| `BuyerOrders-*.js` | 1.36 kB | 1.54 kB | +0.18 kB |
| `CabinetApp-*.js` (lazy) | 1.57 kB | 2.91 kB | +1.34 kB |
| `SellerApp-*.js` (lazy) | 7.79 kB | 8.02 kB | +0.23 kB |

Стартовая поверхность: **106.77 → 109.30 kB gzip (+2.53 kB)**. Число активов не
изменилось (7). Бюджет соблюдён: 0 новых launch-запросов (`exchangeLaunch` не
трогает `handoffs` / `seller/overview` / `checkout` — закреплено тестом),
0 новых D1 round trips, SellerApp не грузится покупателю без прав, внешних
зависимостей и удалённых шрифтов нет, Server-Timing не менялся.

---

## 12. Deployment

Живое состояние **до** релиза (перепроверено в Cloudflare, не по памяти):

| | Deployment | Branch | Source |
| --- | --- | --- | --- |
| root `ai-direct-pro-landing` | `c6726904-6da6-49cd-ab5c-15f6243e9489` | `main` | `2f6d893` |
| static `gptbot-market-mini-app` | `95747883-7162-42a6-8377-477430b11a6d` | `feature/gptbot-market-mini-app-synthetic-candidate` | `2f6d893` |
| service worker | `bormi-shell-v10` | | |

Выпущено (порядок: exact build → root → static → verification):

| | Deployment | Branch | Source |
| --- | --- | --- | --- |
| root | **`eb2522e3-0f68-469d-9820-3525bcbc0384`** | `main` | `ae784f1` |
| static | **`c17cd97c-8958-499e-9407-8dc4338f95cf`** | `feature/gptbot-market-mini-app-synthetic-candidate` | `ae784f1` |

Live-доказательства после релиза:

* `https://gptbot-market-mini-app.pages.dev/sw.js` → `const CACHE = 'bormi-shell-v11'`;
  `activate` по-прежнему удаляет все прочие имена кэша;
* стартовый бандл — `index-BcusiQCi.js`; в живом коде найдены `cabinetHomeV2`,
  «Что хотите сделать?», «Требует внимания», «Настройки и помощь»,
  `Buyurtmalarim`, `E’tibor kerak`, `BormiMarketBot`, «Вернуть его из архива
  нельзя.», «Вопрос по заказу», и **сохранены** «Подача объявлений готовится» и
  «Покупатель и продавец» — путь отката физически лежит в том же бандле;
* при запуске подтягиваются `index`, `ui`, `BuyerOrders`; `CabinetApp` и
  `SellerApp` остаются ленивыми.

Сохранено на root-проекте (проверено через Cloudflare API после деплоя):

| | |
| --- | --- |
| Production branch | `main` |
| Smart Placement | `mode: smart` |
| D1 | `GPTBOT_DRAFTS_DB` |
| KV | `LOGIN_ATTEMPTS` |
| R2 | `MARKET_MEDIA` |
| Plain-text vars | 14 |
| Secrets | **30 до и 30 после** |
| `MARKET_CABINET_ENABLED` | `true` |
| `MARKET_CABINET_HOME_V2` | `true` |
| Git auto-deploy | `deployments_enabled: false`, `production_deployments_enabled: false` |

Static-проект: production branch `feature/gptbot-market-mini-app-synthetic-candidate`
(не `main`), git-источник не подключён, секретов 0.

**D1**: запись не производилась. Read-only проверка вернула
`rows_written: 0, changes: 0, changed_db: false`; 74 таблицы, 213 индексов,
объектов со словом `cabinet` — 0; ledger `0025_owner_control_center_audit.sql`,
как и требовало решение владельца.

---

## 13. Rollback

Быстрый (секунды, без пересборки — оба корня лежат в одном бандле):

```
wrangler.toml → MARKET_CABINET_HOME_V2 = "false"
wrangler pages deploy dist --project-name=ai-direct-pro-landing --branch=main
```

Полный:

```
root   → c6726904-6da6-49cd-ab5c-15f6243e9489
static → 95747883-7162-42a6-8377-477430b11a6d
```

D1 и R2 не откатывать. Telegram не трогать. После отката проверить: Mini App
открывается, поиск, голос, заказы, checkout, магазин при authority, webhook,
D1 `rows_written` не изменился.

Резервная ветка `backup/bormi-cabinet-slice-1-2026-08-03` сохранена.

---

## 14. Owner native canary

До ответа владельца **CAB_1_PRODUCTION_COMPLETE = NO**. Чек-лист — в финальном
отчёте сессии: полное закрытие WebView, свежий `/start` в @BormiMarketBot,
проверка четырёх вкладок, sheet «Подать», корня кабинета, «Настроек и помощи»,
RU/UZ, light/dark, магазина только при authority, отсутствия второй нижней
панели и пять чисел скорости запуска для первого и повторного открытия.

---

## 15. Известные ограничения

* Ключ `ordersTruncated` присутствует в обеих локалях, но не выводится: эндпоинт
  `/orders?limit=5` не сообщает общего числа, поэтому truncation не доказан.
  Копия ждёт данных, а не наоборот.
* «Продать» без `sellerCommands` уводит в чат с ботом — это реальный путь, но
  всё же выход из Mini App. Внутреннего провижининга нет и не будет до ADR.
* Экран вопроса показывает один активный handoff (`/handoffs/active`), истории
  вопросов нет.
* Неизвестный `status` handoff резолвится в «Закрыт»; домен объявляет ровно
  `open | answered | closed | expired`, так что ветка недостижима.
* Скриншотов в этом релизе нет — только DOM-геометрия и accessibility tree.

## 16. Следующий шаг — CAB-2 (не начат)

Ровно то, что было отложено: URL/hash-навигация и History API, Telegram
BackButton, deep links, домен wanted-запросов и приём «Ищу» как заявки,
conversations/messages, favorites и saved searches. Ничего из этого в CAB-1 не
вошло и не подготавливалось кодом «на будущее».

## 17. Операции, которые НЕ выполнялись

D1 write, миграции, изменение seller authority, membership/onboarding,
provisioning продавцов, BotFather, webhook, изменение Telegram, правки Railway и
n8n, изменение секретов, изменение bindings, изменение Smart Placement,
включение git auto-deploy, force-push, rebase, reset, stash, clean, откат чужого
WIP, начало CAB-2.
