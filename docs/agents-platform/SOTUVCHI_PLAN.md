# GPTBot Sotuvchi — архитектурный аудит и план MVP
**Дата:** 2026-07-17 · **Статус:** аудит read-only, код не менялся · **База:** ветка main, коммит `5bf3d56`
**Легенда:** ✅ подтверждено кодом · 🔶 предположение · 💡 рекомендация · ⛔ внешний блокер

---

## 1. Executive summary

Sotuvchi — «цифровой продавец» для соло-торговцев в Telegram. Аудит показал: **~60–70% инфраструктурного фундамента уже есть в репозитории и подтверждено кодом** — Telegram-клиент с retry, webhook-паттерн с secret/dedup/waitUntil, D1 с ownership-дисциплиной, идемпотентный usage-ledger, RU/UZ i18n-паттерн, эвристический классификатор, анти-галлюцинационный валидатор чисел, событийная аналитика без сырых текстов. Чего нет совсем: multi-tenant слой (магазины/участники), каталог/товары/остатки, персистентные диалоговые состояния покупателя (текущий lead-бот держит state в памяти — для заказов неприемлемо), заказы, маршрутизация уведомлений продавцу, Mini App и его аутентификация, R2-хранилище файлов.

**Ключевые решения, которые предлагаю:**
1. **MVP на ОДНОМ общем боте** (`@gptbot_sotuvchi_bot` или витрины внутри существующей экосистемы) с deep-link-витринами `?start=shop_<code>` — не собирать токены продавцов через BotFather на старте. Персональные боты — платная фича Phase 6+.
2. **AI только там, где неизбежен**: понимание вопроса и сопоставление с товаром. Цены/остатки/варианты/оформление — детерминированные шаблоны и state-machine из БД. LLM физически не получает права писать цифры.
3. **Без Mini App в v0**: каталог продавец ведёт диалоговым мастером в том же боте (фото+подпись = товар). Mini App — Phase 5, когда ценность подтверждена.
4. **Фото товаров = Telegram file_id** (без R2 в v0). Это работает ТОЛЬКО при общем боте — ещё один аргумент против раздачи токенов в MVP.

**Самый маленький проверяемый продукт (2–4 недели):** общий бот, продавец за 10 минут создаёт магазин и ≤20 товаров пересылкой фото с подписью, получает ссылку-витрину, покупатель спрашивает «есть? почём? покажи» — бот отвечает строго из каталога, кнопка «Оформить» собирает имя/телефон/адрес детерминированным диалогом, заказ падает продавцу уведомлением, всё непонятное — handoff продавцу. Главная метрика: **заказы, оформленные ботом без участия продавца, на активный магазин в неделю**.

---

## 2. Что реально есть в репозитории (Этап 1, всё ✅ кодом)

| Слой | Факт | Файлы |
|---|---|---|
| Frontend | Vite, 2 entry: landing SPA + gpt-chat island (React 19, без стейт-менеджеров/роутера в island); admin SPA lazy-чанком | `vite.config.ts`, `src/main.tsx`, `src/gpt-chat/main.tsx`, `src/admin/` |
| Prerender/SEO | ~183 статических страниц из JSON, sitemap 186, robots (runtime-override `functions/robots.txt.ts`), llms.txt | `scripts/prerender*.ts`, `content/**` |
| Backend | Только Cloudflare Pages Functions, file-routing; глобальный `_middleware.ts` | `functions/**` |
| БД | Единственная D1 `gptbot-ai-drafts` (binding `GPTBOT_DRAFTS_DB`), миграции 0001–0012 + runtime-bootstrap (`CREATE TABLE IF NOT EXISTS`, WeakMap-мемо) | `wrangler.toml`, `migrations/`, `functions/lib/{gpt-chat,telegram}/schema.ts` |
| Авторизация | Публичные продукты БЕЗ аккаунтов (hashed-IP + localStorage у веб-чата; Telegram-identity у ботов). Админка: PBKDF2 + JWT HS256 + KV-lockout + опц. Turnstile | `functions/api/auth/*`, `functions/lib/{jwt,password,lockout}.ts` |
| Telegram | ДВА бота: lead `@aidirectprobot` (`/api/telegram/webhook`, in-memory state) и Javob `@gptbot_javob_bot` (`/api/telegram/assistant`: secret-header, dedup по update_id, waitUntil-фон). Полный клиент: retry 429/5xx c retry_after, split >4096, plain-text для AI-вывода | `functions/api/telegram/*`, `functions/lib/telegram/client.ts` |
| AI | OpenRouter, цепочки моделей из env (free: nemotron→qwen3→deepseek), не-стрим `chatComplete` + SSE `chatStreamStart`; structured-JSON strict (Tahlil, `openai/gpt-4o-mini`, T=0.1); grounding-валидатор + fail-closed retry | `functions/lib/gpt-chat/openrouter-*.ts`, `functions/lib/telegram/{service,validator,analysis}.ts` |
| STT | Groq whisper-large-v3 (+сегменты) → OpenAI fallback, аудио только в памяти | `functions/lib/telegram/transcription.ts` |
| История | Веб-чат: gpt_messages в D1 + localStorage; Javob: items/results с TTL 24ч, БЕЗ долгой истории | `functions/lib/telegram/store.ts` |
| Лимиты/биллинг | Идемпотентный `usage_ledger` (UNIQUE idempotency_key) + entitlements + каталог plans (free/day_pass/plus активны); Click/Payme — **DisabledProvider**, протокол не выдуман | `functions/lib/telegram/billing.ts`, `migrations/0010` |
| RU/UZ | Полные словари-паттерн `Record<Locale,string>` + guessLanguage-эвристика | `functions/lib/telegram/i18n.ts`, `prompts.ts` |
| Admin | SEO Control Center: ai-drafts, autopilot, IndexNow, Yandex, Serper; контент коммитится в GitHub через Octokit | `functions/api/admin/**`, `functions/lib/github.ts` |
| Deployment | push main → CF Pages `build:cf` (seo-audit-гейт!) → live ~4 мин | `package.json` |
| Railway/Supabase | Код gateway + Fastify-бэкенда есть; прод живёт на D1-fallback; статус env не подтверждён | `functions/lib/gpt-chat/gateway.ts`, `apps/gpt-backend/` |
| Чего НЕТ (✅ проверено поиском) | R2/Durable Objects/Queues-биндингов; Mini App/initData-валидации; файлового стораджа для пользователей (upload = админ-коммит в GitHub, непригоден) | `wrangler.toml`, grep `initData|web_app`, `functions/api/images/upload.ts` |

## 3. Что переиспользуем напрямую
`TelegramClient` целиком · webhook-скелет assistant.ts (secret, dedup, waitUntil, dormant-gate) · схемо-bootstrap-паттерн · `pseudoUser`/logEvent (аналитика без PII) · `usage_ledger`/entitlements (позже — подписка продавца) · i18n-паттерн · `guessLanguage` + каркас classify.ts · идея validator.ts (числа ответа ⊆ числа источника → числа ответа ⊆ данные каталога) · setup-скрипт с guard'ом · prerender для лендинга `/ru/sotuvchi/` · тестовая инфраструктура (in-memory D1-фейк + fetch-мок, 40 готовых образцов тестов).

## 4. Что мешает / долг, влияющий на Sotuvchi
- **In-memory state lead-бота — антипаттерн для заказов** (isolate recycle = потерянный чекаут). Sotuvchi обязан хранить диалоговое состояние в D1. ✅
- Нет фонового cron (cleanup opportunistic) — для напоминаний о брошенных чекаутах позже понадобится Scheduled Worker. 🔶
- Файлы: без R2 продавец не получит веб-витрину с фото; для v0 закрыто file_id-подходом. ✅
- Один D1 на всё: при росте (>100 магазинов с трафиком) возможна конкуренция записей; для пилота 10–30 продавцов — достаточно. 🔶
- `npm run lint` красный от старых скриптов (не блокер, build не через lint). ✅

---

## 5. Gap analysis (Этап 2)

| Возможность | Уже есть | Переиспуем | Изменить | Создать |
|---|---|---|---|---|
| Multi-tenant (магазины) | — | ownership-паттерн store.ts | — | businesses, memberships, все FK business_id |
| Разделение продавцов | частично (per-user ownership) | да | — | store-слой, где КАЖДЫЙ запрос требует business_id |
| Каталог/товары/варианты | — | — | — | products (+variants как текст в v0) |
| Остатки | — | — | — | inventory-поле + декремент при заказе |
| Покупательские сессии | Javob items (TTL) | схему-паттерн | — | conversations + персистентный state |
| Заказы | gpt_leads (примитив) | нет (другая семантика) | — | orders/order_items |
| Бот каждого продавца | — | client.ts готов к любому токену | — | bot_connections (Phase 6+) |
| Хранение bot tokens | секреты только env | — | — | AES-GCM-шифрование в D1 мастер-ключом env (Phase 6+) |
| Mini App auth | — | — | — | initData HMAC-валидация (Phase 5) |
| Роли owner/staff | — | memberships-заготовка | — | v0: только owner |
| AI grounding | ✅ validator+fail-closed | да | адаптировать под каталог | catalog-answerer |
| Anti-hallucination | ✅ | да | — | правило «LLM не пишет цифры» |
| Human handoff | — | notify-паттерн lead-бота | — | handoffs + пересылка продавцу |
| Audit log | telegram_events | да | — | (достаточно событий в v0) |
| Rate limits | ledger/quota-паттерны | да | — | per-buyer msg-cap |
| Файлы/изображения | admin-GitHub (непригоден) | — | — | v0: tg file_id; Phase 5: R2 |
| Платежи | Disabled Click/Payme | интерфейс | — | ⛔ доки/мерчант; v0 — реквизиты текстом |
| Чеки | — | — | — | ⛔ my.soliq, вне MVP |
| Аналитика событий | ✅ telegram_events | да | — | новые event-имена |

---

## 6. Рекомендуемая архитектура (Этап 3)

### 6.1 Ключевой выбор: общий бот vs бот-на-продавца
**Вопросы риска (ответы):**
- Технически отдельный бот на продавца возможен? **Да**: продавец создаёт бота в BotFather, отдаёт токен, мы setWebhook на `https://gptbot.uz/api/telegram/shop/<connectionId>` со своим secret_token. Масштаб webhook'ов не проблема. 🔶 (стандартная практика Telegram, кодом у нас не реализовано)
- Как хранить токены? Только шифрованными в D1: AES-GCM (WebCrypto) с мастер-ключом `SHOP_BOT_TOKEN_KEY` из secrets; расшифровка только в момент вызова; в логи не попадает (дисциплина client.ts уже такая). 💡
- Можно ли общий бот с витринами? **Да**: `t.me/<bot>?start=shop_<code>` привязывает чат покупателя к магазину; переключение магазина — новым deep-link'ом или /shops.
- **Что для MVP: ОБЩИЙ БОТ.** Причины: (1) онбординг продавца 10 минут вместо «сходи в BotFather, скопируй токен» — для соло-продавца это стена; (2) не берём на себя хранение чужих токенов до того, как продукт доказан; (3) **file_id фотографий работает только внутри одного бота** — общий бот позволяет пересылать фото товара без файлового стораджа; (4) один webhook = вся существующая обвязка (dedup, secret, setup-скрипт) переиспользуется как есть. Минус (нет «своего бренда» у продавца) — осознанная жертва v0; персональный бот станет апселлом Plus/Pro.
- **Mini App нужен в v0? Нет.** Ценность («бот отвечает и принимает заказы вместо меня») проверяется без него. Каталог ведётся диалоговым мастером: продавец шлёт фото с подписью «Платье Лола / 250000 / 3 шт / размеры S-M-L» → бот парсит детерминированно, просит недостающее. Mini App (каталог-редактор) — Phase 5; auth через initData-HMAC (документированный алгоритм, внешних блокеров нет, но кода пока ноль).

### 6.2 Frontend
- v0: **ничего нового в вебе, кроме** лендинга `content/pages/{ru,uz}/sotuvchi.json` (обычный money-prerender) с deep-link CTA. Кабинет продавца = сам бот.
- Phase 5: Mini App как третий Vite-entry `src/sotuvchi-app/` (по образцу gpt-chat island), раздаётся как статическая страница `/sotuvchi/app/`, auth initData, RU/UZ через тот же словарный паттерн.

### 6.3 Backend (все — Pages Functions, продолжаем моно-инфраструктуру)
```
functions/api/telegram/sotuvchi.ts      — webhook общего бота (клон скелета assistant.ts,
                                          СВОИ секреты TELEGRAM_SOTUVCHI_BOT_TOKEN/_WEBHOOK_SECRET)
functions/lib/sotuvchi/
  config.ts        — лимиты: товаров ≤20, фото ≤1/товар, msg-caps, TTL
  schema.ts        — runtime DDL (паттерн telegram/schema.ts)
  store.ts         — ВЕСЬ D1-доступ; каждый метод принимает businessId (tenant-изоляция в одном месте)
  seller-flow.ts   — режим продавца: онбординг магазина, мастер добавления товара, /orders, /stock
  buyer-flow.ts    — режим покупателя: вопросы по каталогу, карточка товара, checkout-машина
  catalog.ts       — детерминированный поиск: normalize → LIKE/токены → скоринг; выдача фактов
  intent.ts        — правила (цена/наличие/фото/варианты/оформить/оператор) + LLM-fallback ТОЛЬКО
                     для «какой товар имеется в виду» (structured JSON: {productId|null, intent})
  answerer.ts      — сборка ответа ИЗ ШАБЛОНОВ i18n + данных БД; LLM в тексте ответа v0 НЕ участвует
  guard.ts         — пост-проверка: все цифры ответа ∈ {цена, остаток, id} из БД (адаптация validator.ts)
  handoff.ts       — создание handoff + уведомление продавцу + reply-мост «ответ продавца → покупателю»
  notify.ts        — сообщения продавцу (тот же бот, chat_id владельца)
  i18n.ts          — словари RU/UZ
scripts/sotuvchi-setup.ts               — регистрация бота (гард на aidirectprobot/javob-бота!)
```
Очередь фоновых задач: **не нужна в v0** (все операции короткие, waitUntil хватает). Файлы: file_id в D1. Логи/observability: события + CF-логи, как сейчас.

### 6.4 Data model (предварительно; миграция 0013, НЕ создаю сейчас)
```
users            — уже есть (telegram_id); расширяем использованием, не схемой
businesses       id PK, owner_telegram_id→users, name, slug UNIQUE(start-код витрины), locale,
                 currency='UZS', delivery_terms TEXT, payment_note TEXT, status, created_at
memberships      id, business_id→businesses, telegram_user_id, role('owner'|'staff'), created_at
                 (v0 пишем только owner; staff — потом)  UNIQUE(business_id, telegram_user_id)
bot_connections  id, business_id UNIQUE, mode('shared'|'custom'), bot_username, encrypted_token,
                 webhook_secret, status, created_at        (v0: одна строка mode=shared на магазин)
products         id PK, business_id→businesses(IDX), name, name_normalized(IDX, для поиска),
                 price_uzs INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0,
                 variants_note TEXT NULL (v0: свободный текст «S/M/L, красный-чёрный»),
                 photo_file_id TEXT NULL, description TEXT NULL, status('active'|'hidden'),
                 created_at, updated_at
product_variants (Phase 4+; v0 НЕ создаём) id, product_id, name, price_delta, stock
inventory        v0 = products.stock (+ декремент транзакцией при заказе);
                 отдельная таблица движений — Phase 4+ (inventory_moves: id, product_id, delta, reason, order_id)
customers        id, business_id(IDX), telegram_user_id, name, phone, created_at, last_seen_at
                 UNIQUE(business_id, telegram_user_id)  ← покупатель ИЗОЛИРОВАН per-магазин
conversations    id, business_id, customer_id, state('idle'|'checkout_name'|'checkout_phone'|
                 'checkout_address'|'checkout_confirm'|'handoff'), state_payload_json,
                 active_product_id NULL, updated_at   ← ПЕРСИСТЕНТНАЯ машина (не in-memory!)
messages         v0: НЕ храним тексты покупателя (privacy-паттерн Javob); только counters/события.
                 Если продавцу нужна история — Phase 4 решение, с retention.
orders           id PK, business_id(IDX), customer_id, status('new'|'confirmed'|'cancelled'|'done'),
                 total_uzs, buyer_name, buyer_phone, buyer_address, comment,
                 created_at, confirmed_at, idempotency_key UNIQUE
order_items      id, order_id→orders, product_id, product_name_snapshot, price_uzs_snapshot,
                 qty, variant_note
payments         Phase 6+ (реюз payment_orders/transactions-паттерна 0010) ⛔ доки Click/Payme
handoffs         id, business_id, conversation_id, question_text(TTL-очистка!), status('open'|'answered'),
                 seller_message_id NULL, created_at, answered_at
business_rules   v0 = поля delivery_terms/payment_note в businesses; отдельная таблица — потом
analytics_events реюз telegram_events (или сестринская sotuvchi_events с теми же полями)
```
Связи: businesses 1─N products/customers/conversations/orders/handoffs; orders 1─N order_items; conversations N─1 customers. Все чтения — `WHERE business_id=?` в store-слое (единственная точка, где живёт SQL).

### 6.5 AI-слой: безопасный конвейер ответа
```
1. update → sotuvchi.ts (secret, dedup) → контекст: чат покупателя какого магазина? (conversations)
2. ДЕТЕРМИНИРОВАННО: state-machine первична. Если state=checkout_* — НИКАКОГО AI,
   только сбор поля → следующий state.
3. intent.ts: правила (регексы RU/UZ: «есть», «почём/сколько/narxi/qancha», «фото/rasm»,
   «размер/цвет/razmer/rang», «оформить/заказ/buyurtma», «оператор/человек») + попытка
   найти товар по catalog.ts (нормализованный поиск).
4. Если правило+товар найдены → answerer.ts собирает ответ ИЗ ШАБЛОНА:
   «{name} — {price} сум. В наличии: {stock}. {variants_note}» (+sendPhoto(file_id)).
   LLM НЕ вызывается. Выдумать цену физически невозможно.
5. Если товар неоднозначен → ОДИН LLM-вызов (structured JSON strict, T=0):
   вход = вопрос + СПИСОК названий товаров (только имена+id, БЕЗ свободы творчества);
   выход = {productId|null, intent}. Модель выбирает из списка или null.
6. guard.ts: любые цифры финального текста ⊆ {price, stock} выбранного товара; нарушение
   теоретически невозможно (шаблоны), проверка — страховка на будущие фичи.
7. null-товар / вопрос вне каталога / «оператор» / 2 подряд непонимания →
   handoff: покупателю «передал продавцу, ответит скоро», продавцу — карточка вопроса
   с кнопкой «Ответить» (reply-мост шлёт текст продавца покупателю от имени бота, с пометкой).
8. Событ< в sotuvchi-аналитику (без текстов).
```
Где AI НЕ используется принципиально: цены, остатки, чекаут, статусы, подтверждения — всё детерминированно. Где используется: только семантическое сопоставление «вопрос → товар/интент» и (опционально, флагом, Phase 4) вежливая обёртка фраз.

---

## 7. Сценарии продавца (v0)
1. `/start` (или deep-link с лендинга) → «Создать магазин» → имя магазина → условия доставки (текст) → способ оплаты (текст, напр. «карта 8600…/наличные») → готово, выдан линк витрины `t.me/<bot>?start=shop_<code>` + QR-текст для профиля Instagram.
2. Добавление товара: продавец шлёт **фото с подписью** `Название / цена / остаток / (варианты)` → бот парсит, показывает карточку, «Сохранить/Исправить». Без фото — текстом тем же форматом. ≤20 товаров (конфиг).
3. `/tovar` — список товаров с кнопками: остаток ±, скрыть, удалить, фото.
4. `/orders` — новые заказы; кнопки «Подтвердить/Отменить» (двигают статус, уведомляют покупателя).
5. Handoff-уведомление: вопрос покупателя + «Ответить» (следующее сообщение продавца улетает покупателю) / «Это есть в каталоге» (подсказать товар).
6. `/stats` — за неделю: диалоги, авто-ответы, заказы (v0 — просто счётчики).

## 8. Сценарии покупателя (v0)
1. Открыл `?start=shop_<code>` → приветствие магазина + 3–6 последних товаров кнопками.
2. «Платье есть?» → карточка товара (фото+цена+остаток+варианты) + кнопки [Оформить] [Ещё фото?] .
3. «Почём…», «Какие размеры/цвета» → шаблонные ответы из полей.
4. «Покажи всё/каталог» → пагинированный список.
5. [Оформить] → имя → телефон (валид.) → адрес/самовывоз → подтверждение с суммой → заказ создан, продавец уведомлён, покупателю — реквизиты оплаты из payment_note (⛔ без онлайн-оплаты).
6. Непонятный вопрос («а оно тянется?», торг, жалоба) → мгновенный handoff.
7. Языки: RU / Uzbek Latin / mix — intent-правила на оба, ответы на языке покупателя (шаблоны двухъязычные).

---

## 9. Варианты Telegram-архитектуры — сводка
| Вариант | Онбординг | Токены | file_id фото | Брендинг | Вердикт |
|---|---|---|---|---|---|
| A. Общий бот + витрины | 10 мин, ноль техшагов | наш один | ✅ работает | слабый | **MVP v0** |
| B. Бот продавца (BotFather) | продавец создаёт бота, копирует токен | шифрохранилище, ротация, поддержка | ❌ file_id не переносится → нужен R2 | сильный | Phase 6+, апселл |
| C. Гибрид | A по умолчанию, B за деньги | — | — | — | целевое состояние |

## 10. MVP v0 — состав (жёстко)
Общий бот · магазин (имя+доставка+оплата) · ≤20 товаров (имя, цена, остаток, фото-file_id, варианты-текстом) · buyer-интенты: наличие/цена/варианты/фото/каталог/оформить/оператор · checkout state-machine в D1 · заказы + уведомление + подтверждение · handoff с reply-мостом · RU/UZ · события аналитики · лендинг /ru/sotuvchi/ (+uz) · лимит: бот бесплатен на пилот (монетизация после).

## 11. Сознательно исключено из v0
Mini App · персональные боты и хранение чужих токенов · product_variants с независимыми остатками · корзина (>1 позиции; v0 = 1 товар × qty) · R2/веб-витрина · Click/Payme ⛔ · фискальные чеки ⛔ (my.soliq) · Instagram/OLX/Uzum ⛔ · доставка-интеграции · staff-роли · история переписки для продавца · рассылки · импорт Excel · голос покупателя (STT дорог; хотя pipeline есть — отложено) · оплата подписки продавца (plans-каталог готов, включим после пилота).

## 12. План реализации по фазам
**Phase 0 — подготовка (0.5 дня).** Секреты-имена, регистрация бота владельцем, `scripts/sotuvchi-setup.ts` (клон telegram-setup c гардом), решение по username. Файлы: новые script/env-доки. Риск: нет. Приёмка: getMe ok,웹hook dormant-live.
**Phase 1 — БД и tenancy (1–2 дня).** `migrations/0013_sotuvchi.sql` + `lib/sotuvchi/{schema,store}.ts`. Тесты store-изоляции (D1-фейк). Приёмка: все store-методы требуют business_id; тест «продавец Б не видит товар А».
**Phase 2 — каталог продавца (2–3 дня).** seller-flow: онбординг, мастер товара (парсер подписи), /tovar. Риск: парсинг подписи → строгий формат + примеры + пере-спрос. Приёмка: магазин+5 товаров создаются с телефона за ≤10 мин без инструкции.
**Phase 3 — buyer bot (3–4 дня).** intent+catalog+answerer+guard, витрина по start-коду, карточки, LLM-матчер (structured, из списка). Тесты: 20+ RU/UZ вопросов, «цена не из БД невозможна». Приёмка: 8/10 типовых вопросов закрываются без продавца.
**Phase 4 — заказы и handoff (2–3 дня).** checkout-машина (персистентная!), orders/order_items, декремент stock транзакционно, уведомления, /orders, reply-мост. Тесты: idempotency заказа, isolate-restart посреди чекаута не теряет состояние. Приёмка: сквозной заказ на реальном телефоне.
**Phase 5 — Mini App (после пилота, 1–2 нед).** initData-auth, entry `src/sotuvchi-app/`, каталог-CRUD, R2 для фото.
**Phase 6 — аналитика+пилот (параллельно 3–4).** События (§13), /stats, лендинг, ручной онбординг 10–30 продавцов, недельные метрики. Приёмка пилота: ≥5 магазинов с ≥1 заказом/нед через бота.
Оценка v0 (Phases 0–4+6): **~2–3 недели чистой разработки**.

## 13. Аналитика и главная метрика
События (в telegram_events-паттерне, pseudo-user, без текстов): seller_registered, store_created, product_created, buyer_started(shop), buyer_message_received, intent_matched{intent}, answer_sent{auto|template}, fallback_triggered, human_handoff{reason}, handoff_answered, checkout_started, checkout_abandoned{step}, order_created, order_confirmed, seller_returned(d1/d7), weekly_active_seller.
**Главная метрика MVP: `orders_created_auto` — заказы, оформленные ботом без единого handoff в диалоге, на активный магазин в неделю.** Она напрямую измеряет «бот сделал работу продавца до конца». Вспомогательная (качество): auto-resolution rate = доля покупательских диалогов без handoff (цель ≥70%); guard-метрика честности: жалобы/отменённые заказы.

## 14. Риски и блокеры
| Риск | Класс | Митигция |
|---|---|---|
| Click/Payme, чеки, my.soliq | ⛔ внешний | v0 без онлайн-оплаты; реквизиты текстом |
| Продавцы не заполнят каталог | продуктовый | мастер «фото+подпись», ≤20 товаров, ручной онбординг пилота |
| Утечка между продавцами | техн. | store-слой с обязательным business_id + тесты изоляции |
| LLM выдумает цену | техн. | LLM не пишет ответы: только выбор товара из списка; шаблоны+guard |
| Потеря чекаута (isolate) | техн. | state в D1 (урок lead-бота) |
| Один бот заспамлен | техн. | per-buyer msg-cap, per-shop caps из ledger-паттерна |
| Скоуп-крип (Mini App, оплаты, Instagram) | процесс | список §11 = «нет» до пилотных данных |
| D1-контеншн при росте | масштаб | не для 30 магазинов; Phase 7 — шардирование/DO при необходимости |

## 15. Вопросы владельцу (нужны решения ДО Phase 0)
1. Username общего бота (создать нового, например `@gptbot_sotuvchi_bot`) — Javob-бот НЕ трогаем?
2. Пилот платный или бесплатный? (рекомендую бесплатный 4–6 недель, plans-каталог подключим после)
3. Языки онбординга продавца: UZ-first или RU-first по умолчанию?
4. Хранить ли ТЕКСТ вопроса покупателя в handoff (нужен продавцу) с TTL 7 дней — ок по privacy-политике?
5. Лимит 20 товаров/1 фото — подтверждаем?
6. Кто набирает 10–30 пилотных продавцов и как (личная сеть/таргет)?

## 16. Затрагиваемые директории (оценка)
НОВОЕ: `functions/lib/sotuvchi/` (~10 файлов), `functions/api/telegram/sotuvchi.ts`, `migrations/0013_sotuvchi.sql`, `scripts/sotuvchi-setup.ts`, `tests/sotuvchi.test.ts`, `content/pages/{ru,uz}/sotuvchi.json`; Phase 5: `src/sotuvchi-app/`.
ПРАВКИ: `functions/_types.ts` (+env: TELEGRAM_SOTUVCHI_BOT_TOKEN/_WEBHOOK_SECRET/_BOT_USERNAME, SOTUVCHI_* лимиты), `package.json` (скрипты), `vite.config.ts` (только Phase 5).
НЕ ТРОГАЕМ: gpt-chat, javob-модули, lead-бот, prerender-ядро, SEO.

## 17. Последовательность будущих коммитов (предложение)
1. `feat(sotuvchi): schema 0013 + tenant store + tests` → 2. `feat(sotuvchi): shared-bot webhook + setup script (guarded)` → 3. `feat(sotuvchi): seller onboarding + product wizard` → 4. `feat(sotuvchi): buyer intents + catalog answers (deterministic, guarded)` → 5. `feat(sotuvchi): checkout state machine + orders + seller notifications` → 6. `feat(sotuvchi): human handoff + reply bridge` → 7. `feat(sotuvchi): analytics events + /stats + landing pages` → 8+ Mini App/R2/пер-бот/биллинг.

## 18. Критерии готовности MVP
1) Продавец с телефона без инструкции создаёт магазин+5 товаров ≤10 мин. 2) 8/10 типовых вопросов (RU и UZ) закрыты авто-ответом строго из каталога. 3) Ни один авто-ответ не содержит числа вне БД (тест+guard). 4) Сквозной заказ: чекаут→заказ→уведомление→подтверждение→остаток-1. 5) Чекаут переживает рестарт isolate. 6) Handoff доставляет вопрос и возвращает ответ продавца ≤1 мин. 7) Изоляция магазинов доказана тестами. 8) События пишутся без текстов/PII. 9) Существующие продукты (чат, Javob, lead-бот, SEO) — без регрессий (полный suite зелёный). 10) 5+ пилотных магазинов получили ≥1 авто-заказ.

---

## ОТВЕТ НА ГЛАВНЫЙ ВОПРОС
**Самый маленький продукт:** один общий Telegram-бот-витрина. Продавец за 10 минут диалогом создаёт магазин и до 20 товаров (фото с подписью «название/цена/остаток»), получает ссылку `t.me/<bot>?start=shop_…` и ставит её в шапку Instagram/статус. Покупатель по этой ссылке спрашивает «есть? почём? какие цвета? покажи фото» — бот отвечает шаблонами строго из каталога (LLM лишь сопоставляет вопрос с товаром и не имеет права писать цифры), кнопка «Оформить» детерминированно собирает имя/телефон/адрес, создаёт заказ, уменьшает остаток и уведомляет продавца; всё нестандартное мгновенно передаётся продавцу с мостом для ответа. Без Mini App, без чужих токенов, без онлайн-оплаты, без вариантных остатков. Это строится за 2–3 недели на существующем фундаменте (webhook-скелет, TelegramClient, D1-паттерны, RU/UZ, guard) и за неделю пилота на 10–30 продавцах отвечает на вопрос гипотезы метрикой: **сколько заказов в неделю бот оформил без участия продавца**.
