# Bormi QP-1A — production bundle с выключенными флагами · release

Дата: 2026-08-03 · Ветка: `feature/bormi-quickpost`
Релизный коммит: `c092353326cc971b8a90ef3f3fc3b4b2aced055e`
Статус: **выпущено · QuickPost выключен · native canary PENDING**

---

## 1. Что поехало

Код QuickPost теперь в production-бандле, но недоступен людям:
`MARKET_QUICKPOST_ENABLED=false`, `MARKET_QUICKPOST_AI_ENABLED=false`.
Смысл релиза в том, чтобы бандл приземлился раньше экрана: включение станет
одной строкой конфигурации, а не выкаткой нового кода в момент, когда его
впервые увидят.

Вместе с ним поехала правка публичной формулировки, которая касается
**всех** — потому что сегодня, при выключенном флаге, её видит каждый.

---

## 2. Формулировка

| | Было | Стало |
| --- | --- | --- |
| RU заголовок | Продать через бота | **Продать** |
| RU подпись | Магазин создаётся в чате с Bormi | **Публикация пока доступна через Bormi-бота** |
| UZ заголовок | Bot orqali sotish | **Sotish** |
| UZ подпись | Do‘kon Bormi bilan suhbatda ochiladi | **E’lon joylash hozircha Bormi-bot orqali** |

Человек с одной курткой не открывает бизнес. Старая подпись отвечала на
вопрос про создание магазина, которого он не задавал, а глагол зависел от
нашей внутренней кухни. Теперь глагол одинаковый на обеих ветках — меняется
только то, где публикация происходит сегодня, и это сказано в подписи.

Кнопка ведёт ровно туда же, куда вела: `SELLER_START_URL`,
`?start=agent_seller`. Новых Telegram-URL не появилось, bot flow не тронут.

### Вёрстка

На 320 px колонка текста в шите составляла 126 px — меньше 40 % экрана, из-за
чего короткая фраза разваливалась на три строки. Хром вернул место: меньше
padding, меньше иконка и без хвостового шеврона на этой ширине, где вся строка
и так является целью, а ведущая иконка уже говорит, что это.

Замерено: 320 px → колонка 172 px, подпись **2 строки**, заголовок 1 строка,
tap-target 82 px, горизонтальный скролл 0. RU и UZ. На 390 px шеврон на месте.

---

## 3. Гейты

| Гейт | Результат |
| --- | --- |
| TypeScript root / Mini App | 0 / 0 |
| ESLint по изменённым файлам | 0 |
| `market-quickpost.test.ts` | 34/34 |
| Все `market*` тесты | 185/185 |
| Полный корпус | 1254/1257 |
| Mini App build / root build | PASS / PASS |
| SEO-гейт root-сборки | PASS (no critical issues) |
| Secret scan | 14/14 |
| `git diff --check` | PASS |
| Миграции | 30, ни одной новой |
| D1 `rows_written` | **0** |

Унаследованные падения, воспроизведённые на `fe8f259` до правок:
`preserves every public and admin route pattern`,
`sitemap generation retains all 234 static canonical entries`,
`buyer storefront route resolves the store but never launches seller onboarding`.
Новых падений нет.

---

## 4. Деплой

| | Было | Стало |
| --- | --- | --- |
| root `ai-direct-pro-landing` | `fab5fd7f-c639-4152-9512-251a54f029f3` (5e3695c) | **`1471ba04-de13-44be-9fd4-858963d36f0d`** (c092353, `main`) |
| static `gptbot-market-mini-app` | `39221b24-ed8f-4bf8-beb6-7d251fa07595` (5e3695c) | **`a9372929-5d19-4248-ada5-0c8458a6e7ef`** (c092353, `feature/gptbot-market-mini-app-synthetic-candidate`) |
| service worker | `bormi-shell-v12` | **`bormi-shell-v13`** |

Порядок: точная сборка релизного коммита → commit → push → root → static →
верификация. Метод — `wrangler pages deploy`, Direct Upload, существующая
OAuth-сессия. Git auto-deploy остался выключен
(`deployments_enabled: false`).

### Откат

root → `fab5fd7f-c639-4152-9512-251a54f029f3`,
static → `39221b24-ed8f-4bf8-beb6-7d251fa07595`.
Оба на месте. D1 не откатывать, R2 не удалять, Telegram не менять.

---

## 5. Сохранено

Production-ветки `main` и `feature/gptbot-market-mini-app-synthetic-candidate`;
Smart Placement `smart` на обоих проектах; D1 `GPTBOT_DRAFTS_DB`;
KV `LOGIN_ATTEMPTS`; R2 `MARKET_MEDIA`; AI-биндинг.
Секретов 30 до и 30 после. Обычных переменных 15 → 17: добавились ровно два
флага QuickPost и ничего больше.

Живые значения после деплоя:

```
MARKET_NAV_BACK_ENABLED       = true
MARKET_CABINET_ENABLED        = true
MARKET_CABINET_HOME_V2        = true
MARKET_QUICKPOST_ENABLED      = false
MARKET_QUICKPOST_AI_ENABLED   = false
MARKET_MINI_APP_SELLER_COMMANDS_ENABLED = true
```

---

## 6. Живые доказательства

* `sw.js` (обход кэша) → `const CACHE = 'bormi-shell-v13'`, `activate`
  по-прежнему удаляет все прочие имена кэша;
* главный чанк `index-Bs44d9TR.js` — тот же хэш, что и в локальной сборке
  релизного коммита, то есть в production лежит именно собранный бандл;
* главный чанк ссылается на `QuickPost-D3jQqybg.js`, `SellerApp-…`,
  `CabinetApp-…` по имени — то есть QuickPost выделен в ленивый чанк и при
  обычном запуске покупателя не загружается;
* `/assets/QuickPost-D3jQqybg.js` → 200, 13 789 байт, содержит маркеры
  композера;
* старой формулировки в бандле **0 вхождений**; новая присутствует;
* `https://gptbot.uz/` → 200, `sitemap.xml` → 200.

Наличие файла в бандле **не** означает, что QuickPost готов к работе с людьми:
primary path не активирован, и включение остаётся отдельным решением владельца.

---

## 7. D1

До и после деплоя, одинаково: memberships 1, identities 8, organizations 1,
stores 1, products 48, onboardings 0, ledger MAX(id) 25.
Каждый запрос — `rows_written: 0`, `changed_db: false`.
Миграции не выполнялись, схема не менялась, полномочия не менялись.

---

## 8. Что остаётся владельцу

1. Комбинированный native canary QP-0 + flag-off (чеклист в отчёте сессии).
2. Решение по AUTH-1 — см.
   `BORMI_OWNER_TELEGRAM_SELLER_BINDING_RUNBOOK.md`.
3. Отдельное разрешение на `MARKET_QUICKPOST_ENABLED=true`.

До этих решений: `QP_1A_ENABLED_PRODUCTION=NO`, `AUTH_1_APPLIED=NO`,
QP-1B не начат.
