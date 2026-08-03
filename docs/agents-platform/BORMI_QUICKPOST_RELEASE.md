# Bormi QuickPost — release record

Ветка: `feature/bormi-quickpost` · База: `7fd74fc` (= выпущенный CAB-1)
Фаза в этом релизе: **QP-0 · back-gesture spine**
Статус деплоя: **не выпущено — ожидает owner gate**

---

## 1. Live reconciliation (перепроверено, не из отчёта)

```
ACTUAL_BRANCH=feature/bormi-quickpost   (создана от 7fd74fc)
ACTUAL_HEAD=8efedef                     (на момент feature-коммита)
ACTUAL_ORIGIN_MAIN=253c1b7
AHEAD_BEHIND=main ahead 12; ветка чистая, stash пуст, merge/rebase нет
PRODUCTION_ROOT_SOURCE=ae784f1   deployment eb2522e3-0f68-469d-9820-3525bcbc0384  branch main
PRODUCTION_STATIC_SOURCE=ae784f1 deployment c17cd97c-8958-499e-9407-8dc4338f95cf  branch feature/gptbot-market-mini-app-synthetic-candidate
SERVICE_WORKER=bormi-shell-v11
D1_LEDGER_STATE=25 · 0025_owner_control_center_audit.sql
ROWS_WRITTEN=0
```

Cloudflare: Smart Placement `smart` на обоих проектах; D1 `GPTBOT_DRAFTS_DB`,
KV `LOGIN_ATTEMPTS`, R2 `MARKET_MEDIA` на месте; root 14 plain-text vars и
**30 секретов**; static 14 vars и 0 секретов; git auto-deploy у root
`deployments_enabled: false`, `production_deployments_enabled: false`; у static
git-источника нет.

D1 (read-only): 1 организация, 1 магазин, 1 membership, 0 onboardings,
48 товаров, 0 черновиков, 7 категорий, 8 identities. `rows_written: 0`,
`changed_db: false` на каждом запросе.

---

## 2. Что выпущено в этой фазе

**QP-0 — back-gesture spine.** До него любой жест «назад» закрывал всё
приложение с любой глубины. Теперь back закрывает верхнее открытое, а
приложение закрывается только в корне.

Реализация: `apps/market-mini-app/src/platform/navigation.ts` — стек открытого,
не роутер. Три источника жеста сведены к одному правилу: Telegram BackButton
показывается ровно пока что-то открыто; одна history-запись держится как то, что
съедает аппаратная кнопка Android; видимые «Назад» дёргают тот же стек.

Уровни, зарегистрированные сегодня: диалог (`Modal`), секция кабинета,
рабочее место продавца, любая вкладка кроме «Главная».

Уровень может отказаться закрыться (`onBack() === false`) — это guard для
несохранённых изменений, который понадобится composer'у QP-1. Сейчас им никто
не пользуется.

Флаг `MARKET_NAV_BACK_ENABLED`, default `false`, объявлен в `wrangler.toml`,
`functions/_types.ts`, обоих bootstrap payload и `Capabilities.navBack?`.

---

## 3. Файлы

```
apps/market-mini-app/src/platform/navigation.ts   новый, 220 строк
apps/market-mini-app/src/App.tsx                  чтение флага + startNavigation
apps/market-mini-app/src/components/ui.tsx        Modal регистрирует уровень
apps/market-mini-app/src/screens/BuyerApp.tsx     вкладка != home — уровень
apps/market-mini-app/src/screens/CabinetApp.tsx   секция и workspace — уровень
apps/market-mini-app/src/types.ts                 navBack?: boolean
apps/market-mini-app/src/dev/synthetic.ts         фикстура включает флаг
functions/_types.ts                               MARKET_NAV_BACK_ENABLED?
functions/market/router.ts                        флаг в оба payload
wrangler.toml                                     MARKET_NAV_BACK_ENABLED = "false"
tests/market-quickpost.test.ts                    новый, 14 тестов
tests/market-cabinet-home-v2.test.ts              ассерт про navigation-hint уточнён
docs/agents-platform/BORMI_CABINET_HOME_V2_RELEASE.md  строка таблицы переформулирована под secret-scan
```

---

## 4. Quality gates

| Gate | Результат |
| --- | --- |
| TypeScript functions | **0** |
| TypeScript Mini App | **0** |
| ESLint (изменённая область) | **0** |
| QuickPost корпус — `market-quickpost` | **14 / 14 PASS** |
| Market-корпус (quickpost + cabinet-v2 + shell + auth + contract) | **77 / 77 PASS** |
| Полный корпус | **1234 / 1237**, 3 унаследованных |
| Mini App build | PASS |
| `check-agent-boundaries` | OK (no violations) |
| `scan:secrets` | clean (2995 файлов) |
| `git diff --check` | PASS |
| Миграции | 30 файлов, ни одной новой |
| D1 | схема не менялась, `rows_written: 0` |

Три унаследованных падения — те же, что и в CAB-1, поимённо:

1. `the current productization baseline preserves every public and admin route pattern`
2. `sitemap generation retains all 234 static canonical entries`
3. `buyer storefront route resolves the store but never launches seller onboarding`

Новых необъяснённых падений нет.

### Замечание по secret-scan

`scan:secrets` начал помечать строку таблицы в релизе CAB-1
(`… (tests/market-…​.test.ts) | 29 / 29 PASS`) как
`generic_secret_in_credential_context`: длинный путь рядом со словом-триггером.
Значение не печаталось, секрета нет. Строка переформулирована так, чтобы быть
однозначной, вместо расширения `EXEMPT_FILES` — как и советует сам сканер.

---

## 5. Runtime QA (фикстура, DOM-доказательства)

Скриншотов нет — Browser pane не композитит кадры; доказательства сняты через
DOM, `history.state` и accessibility tree.

| Проверка | Результат |
| --- | --- |
| Кабинет → «Настройки и помощь» → back | вернулся на корень кабинета, приложение открыто |
| ещё один back | вернулся на «Главная», приложение открыто |
| Глубина 2, history-записей | **1** (`historyDelta: 1` на обоих уровнях) |
| В корне «Главная» | `history.state.bormiBack` отсутствует — жест проваливается в Telegram, и приложение закрывается именно там |
| Диалог «Подать» открыт | `history.state.bormiBack === true`, длина истории не выросла (`delta: 0`) |
| back над диалогом | диалог закрыт, приложение открыто, фокус вернулся на вкладку |
| Вкладка «Поиск» + диалог «Фильтры», back | закрылся только диалог, вкладка осталась «Поиск» |
| ещё back | «Главная», приложение открыто |
| Рост истории за весь сценарий | 0 |

---

## 6. Performance

| Актив (gzip) | `ae784f1` | QP-0 | Δ |
| --- | ---: | ---: | ---: |
| `index-*.js` | 70.75 kB | 70.82 kB | +0.07 kB |
| `ui-*.js` | 26.36 kB | 26.74 kB | +0.38 kB |
| `CabinetApp-*.js` (lazy) | 2.91 kB | 2.95 kB | +0.04 kB |
| `BuyerOrders-*.js` | 1.54 kB | 1.55 kB | +0.01 kB |
| `SellerApp-*.js` (lazy) | 8.02 kB | 8.03 kB | +0.01 kB |
| `index-*.css` | 8.48 kB | 8.48 kB | 0 |

Стартовая поверхность **109.30 → 109.79 kB gzip (+0.49)**. Число активов не
изменилось (7). Ноль новых launch-запросов, ноль новых D1 round trips, ноль
внешних зависимостей, ноль анимационных фреймворков.

---

## 7. Accessibility

Спина не рисует ни одного элемента, поэтому новых целей касания и новых
фокус-ловушек нет. Что она гарантирует: жест «назад» ведёт туда же, куда
видимая кнопка «Назад» и `Escape` — три пути не расходятся; фокус после
закрытия диалога возвращается на открывший его элемент (проверено); Telegram
BackButton не дублирует видимую «Назад», потому что показывается по тому же
условию.

---

## 8. Коммиты

```
8efedef  feat(market): let a back gesture close a screen instead of the app
<docs>   docs(market): specify QuickPost and rule out the invisible private storefront
```

---

## 9. Deployment — НЕ ВЫПОЛНЕН

Все gates пройдены, но деплой не производился: явной авторизации на production
deploy для QuickPost не давалось, а QP-0 сам по себе невидим (флаг `false`).
Разумно выпускать его вместе с QP-1 либо отдельным решением владельца.

Готовая последовательность, если владелец разрешит:

```
npm run build                                   # root, exact SHA
npx wrangler pages deploy dist --project-name=ai-direct-pro-landing --branch=main --commit-hash=<sha>
cd apps/market-mini-app && npx vite build
npx wrangler pages deploy apps/market-mini-app/dist --project-name=gptbot-market-mini-app --branch=feature/gptbot-market-mini-app-synthetic-candidate --commit-hash=<sha>
```

Service worker: production сейчас `bormi-shell-v11`; при выпуске поднять на
`v12`. Static production branch — `feature/gptbot-market-mini-app-synthetic-candidate`,
не `main`; иная ветка — hard stop.

**Откат за секунды:** `MARKET_NAV_BACK_ENABLED = "false"` + root deploy.
**Полный откат:** root `eb2522e3-0f68-469d-9820-3525bcbc0384`,
static `c17cd97c-8958-499e-9407-8dc4338f95cf`. D1 и R2 не трогать.

---

## 10. Owner gate — что требуется решить

1. **QP-2 / private seller.** ADR отклонил Model A по данным: покупательская
   сессия привязана к одной витрине, поэтому объявление в собственной витрине
   частника не увидит никто. Целевая Model B требует миграции и переписанного
   покупательского чтения. Нужны: подтверждение курса на доску объявлений,
   разрешение на сверку ledger `0025` против физических `0026–0030`, backup и
   rehearsal, решение по колонкам `condition`/`location`.
2. **Deploy.** Разрешение на production deploy QP-0 (и позже QP-1).
3. **QP-3 / vision.** Расширение LLM-контракта до частей сообщения — отдельный
   бюджет и privacy review.

## 11. Что НЕ делалось

Deploy; D1 write; миграции; изменение authority; создание organizations, stores
или memberships; провижининг частных продавцов; расширение AI-контракта до
vision; изменение секретов, bindings и Smart Placement; включение git
auto-deploy; работа в `main`; force-push; rebase; reset; stash; clean; начало
QP-2 и QP-3.
