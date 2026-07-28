# Актуальный master handoff

Полная фактическая карта repository, services, Agents Platform, Telegram,
Sotuvchi, migrations, API, environment, tests, security, PII, production
readiness и точные инструкции продолжения:

[`GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md`](./GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md)

Этот файл ниже сохраняет stage-specific handoff P2.6. При расхождении
операционных сведений сначала сверяйте Git tree и `STATE.json`, затем
используйте master handoff как актуальную карту системы.

---

# GPTBot Agents — Handoff

## 1. Состояние

- Дата: 2026-07-28.
- Ветка: `main`.
- Исходный HEAD / P2.5 relay:
  `593654efc22c14e8877ec83e2ebfe009103997ce`.
- P2.5 code commit:
  `0915f059027555665661a1bcb90e8719690bce0c`.
- P2.6 code commit:
  `8523d8d84c16b75d8132c88a5bd8ab2d1ecccb79`.
- HEAD после relay определяется последним metadata-only commit в `git log`;
  по D-006 `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA.
- Завершённый этап: **P2.6 — Durable Human Handoff Bridge**.
- Следующий этап: **P2.7 — Analytics и pilot readiness**.
- Рабочее дерево после relay: только два pre-existing untracked объекта —
  `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`.
- Push, deploy, webhook setup и применение migration не выполнялись.

## 2. Что сделано

1. Реализация P2.6 была начата предыдущим агентом и существовала только в
   рабочем дереве (untracked handoff/delivery/platform-channels, migration
   `0023`, suite, плюс изменения tracked-файлов). Она сохранена, доведена до
   зелёного состояния и закоммичена; заново не переписывалась.
2. Устранён реальный дефект `submitReply`: idempotent replay теперь
   разрешается **до** проверки состояния reply-сессии. Отправка ответа
   переводит сессию в `completed`, поэтому повторный Telegram update читал
   settled-сессию как отсутствующую цель и падал с `no_reply_session` вместо
   возврата сохранённого ответа.
3. Escalation только по явной просьбе покупателя (`позвать продавца`,
   `оператор`, `sotuvchini chaqir`, `odam bilan` и т.п.). Неизвестный вопрос
   по-прежнему получает safe help — теперь с подсказкой, как позвать человека.
   Автоэскалация запрещена: иначе в БД попал бы текст, который покупатель не
   собирался отправлять человеку.
4. Одна живая переписка на buyer-сессию: partial unique index
   `idx_sotuvchi_handoffs_active ON (buyer_session_id) WHERE status IN
   ('open','answered')`. Повторный запрос возвращает уже открытый handoff, а
   не создаёт второй — продавца нельзя завалить очередью.
5. Content и retention: bounded `question_text` и `reply_text` (≤1000) —
   единственные free-form колонки всего агента. Оба очищаются, когда проходит
   `expires_at` (7 дней), поэтому окно хранения обеспечивается данными, а не
   договорённостью. Строка остаётся как метаданные, статус становится
   `expired`, ответить уже нельзя. Sweep — opportunistic на каждом scoped
   чтении/записи (scheduler'а в платформе нет).
6. Reply-мост: следующее сообщение продавца привязывается ровно к одному
   handoff через durable `workflow_instances` (P1.2) плюс store-scoped
   `sotuvchi_seller_reply_sessions`. Привязка переживает isolate restart.
   Повторное нажатие кнопки «Ответить» ничего не меняет, второй ответ
   отклоняется, а ответ, проигравший гонку конкурентному ответу, никогда не
   перезаписывает первый.
7. Seller authority — только trusted Runtime `OrgContext.actorId` через
   существующий `catalog.resolveOwnerContext`; owner membership и active store
   дополнительно проверяются внутри каждого мутирующего SQL (`ownerGuard`).
   Ссылка на handoff сама по себе не даёт ничего.
8. Добавлен platform-модуль `functions/platform/channels`: таблица
   `channel_addresses` (`identity_id`, `channel`, `namespace`, `thread_ref`,
   `status`) отвечает только на вопрос «где достать эту identity». Это
   транспортная деталь, а не authority: membership, ownership и принадлежность
   переписки заново выводятся из домена перед каждой отправкой. `namespace`
   изолирует Agents-бота от Javob и lead-бота на том же канале.
9. Добавлен `functions/agents/sotuvchi/delivery` — opportunistic dispatcher.
   Он доставляет seller notice, buyer reply и **интенты заказов P2.5**, которые
   до этого этапа физически некуда было слать. Контракт: durable intent +
   at-least-once attempt при идемпотентных доменных эффектах.
10. Delivery state живёт на самом агрегате handoff: conditional UPDATE,
    штампующий `seller_notified_at` / `buyer_delivered_at`, и есть claim,
    поэтому один интент не сохраняется дважды, а дубликат push не создаёт
    второе доменное изменение. Второй outbox для handoff не заводился.
11. Неудачная доставка сохраняет ответ и повторяется позже; успешная доставка
    покупателю — это и есть закрытие переписки (`markBuyerDelivered` переводит
    в `closed`). Отсутствующий адрес покупателя не теряет ответ.
12. Pushed-сообщения проходят тот же strict grounding, что и turn-ответы:
    неподдерживаемое число не доставляется вообще. Ответ покупателю всегда
    несёт маркер авторства `Ответ продавца` / `Sotuvchining javobi`.
13. Seller notice сознательно не содержит текст вопроса: превью уведомления —
    самое лёгкое место для утечки текста покупателя на экран блокировки.
    Очередь тоже скрывает контент, detail показывает его владельцу.
14. Facts scalar и namespaced (`handoff.*`, `seller.handoff.*`,
    `seller.handoffs.<n>.*`); весь текст собирается deterministic composer'ом.
    Operation log хранит только шаг, SHA-256 fingerprint и target — никогда
    сам вопрос.
15. Добавлены пять closed-list tools: `handoff.request` (buyer),
    `seller.handoffs.list`, `seller.handoff.get`, `seller.handoff.reply`,
    `seller.handoff.close`. Manifest поднят до `1.5.0`, добавлена capability
    `handoff`, в меню продавца добавлен пункт «Вопросы»/«Savollar». AI
    selection остаётся disabled.
16. Добавлена additive migration `0023_sotuvchi_handoff.sql` и runtime
    bootstrap parity. Migration не применялась.
17. Создан offline suite `tests/sotuvchi-handoff.test.ts`: 40/40.

## 3. Изменённые файлы

- `functions/platform/channels/{types,errors,schema,store,service,index}.ts` —
  channel-neutral address book и `ChannelDeliveryPort`; platform не знает ни
  об агентах, ни о каналах.
- `functions/agents/sotuvchi/handoff/types.ts` — статусы, причины, состояния
  reply-сессии, агрегат и queue-проекция.
- `functions/agents/sotuvchi/handoff/validation.ts` — bounded plain-text
  question/reply, лимиты, TTL-хелперы, валидация payload workflow.
- `functions/agents/sotuvchi/handoff/schema.ts` — DDL и bootstrap, parity с
  migration `0023`.
- `functions/agents/sotuvchi/handoff/store.ts` — весь SQL агрегата: создание,
  ответ, закрытие, retention sweep, reply-сессии, claim/settle доставки.
- `functions/agents/sotuvchi/handoff/service.ts` — авторизация, idempotency,
  жизненный цикл, привязка reply-workflow, delivery surface.
- `functions/agents/sotuvchi/handoff/facts.ts` — scalar-only проекции и маркер
  авторства продавца.
- `functions/agents/sotuvchi/handoff/responses.ts` — RU/UZ composer, строящий
  текст только из Facts.
- `functions/agents/sotuvchi/handoff/{rules,tools,runtime,workflow,errors,
  index}.ts` — deterministic правила, closed-list tools, domain/workflow port,
  FSM `sotuvchi-seller-reply`, content-free errors, публичный экспорт.
- `functions/agents/sotuvchi/delivery/{dispatcher,index}.ts` — opportunistic
  flush seller notice, buyer reply и order intents через один адрес и один
  grounded send-путь.
- `functions/channels/telegram/addresses.ts` — inbound binder и
  Telegram-реализация `ChannelDeliveryPort`.
- `functions/channels/telegram/{webhook,render,index}.ts` — best-effort
  address binding на inbound, вынесенный `renderTelegramOutbound` для
  pushed-сообщений, реэкспорт.
- `functions/agents/sotuvchi/{manifest,rules,index}.ts` — регистрация handoff
  tools/rules/workflow, пункт меню, реэкспорт.
- `functions/agents/sotuvchi/buyer/responses.ts` — подсказка «позвать
  продавца» в help и в no-result.
- `functions/agents/sotuvchi/orders/service.ts` — явный тип default-параметра
  `limit` (требование functions typecheck при использовании из dispatcher).
- `functions/api/telegram/agents.ts` — handoff service, domain/workflow port,
  reply-workflow slot в seller-контексте, dispatcher и flush после turn'а.
- `migrations/0023_sotuvchi_handoff.sql` — additive migration с rollback notes.
- `tests/sotuvchi-handoff.test.ts` — новый suite.
- `tests/sotuvchi-{catalog,onboarding,orders-inventory}.test.ts` —
  manifest-scope assertions переведены с границы P2.5 на границу P2.6
  (payment/refund/cart по-прежнему запрещены).

## 4. Архитектурные решения

D-020 — Durable human handoff bridge, channel address book и opportunistic
dispatcher. Полный текст в `DECISIONS.md`.

## 5. Что сознательно не сделано

- Cron/scheduler. Retention sweep и flush остаются opportunistic; момент
  физической очистки не гарантируется, гарантируется лишь нечитаемость
  просроченного контента.
- Events по-прежнему не публикуются: atomic outbox policy платформы не
  согласована, имитировать exactly-once запрещено.
- CRM, ticketing, назначение оператору, SLA-таймер, staff-роли, вложения,
  голос, фото в handoff, история переписки для продавца.
- Auto-escalation неизвестного вопроса, AI-классификация причины, шаблоны
  быстрых ответов, рассылки.
- Payments, refunds, multi-item cart, Mini App, web dashboard, analytics.
- Migration `0023` не применялась ни локально, ни на production; webhook не
  настраивался, push и deploy не выполнялись.

## 6. Проверки

- `npx tsc -b` → exit 0.
- `node --import tsx --test tests/sotuvchi-handoff.test.ts` → 40/40.
- Обязательный Agents-набор file-by-file: handoff 40/40,
  orders/inventory 37/37, checkout 36/36, buyer Q&A 39/39, catalog 54/54,
  onboarding 28/28, Telegram Agents 41/41, runtime 49/49, workflow 39/39,
  knowledge 33/33, AI 15/15, tenancy 31/31, events 20/20, boundaries 10/10,
  compatibility 1/1, assistant 60/60, gpt-chat 15/15 → **548/548**.
- Остальные suites репозитория: canonical-url-redirects 4/4,
  direct-generator 13/13, gpt-backend 17/17, indexnow-engine 11/11,
  intent-guard 16/16, telegram-cost-calculator 6/6,
  yandex-research 11/11 → 78/78. Полный репозиторий **626/626**.
- `npx tsc -p tsconfig.functions.json --noEmit` → exit 2, ровно 27 legacy
  errors в тех же шести legacy-файлах; в
  `functions/{platform,agents,channels}` и endpoint — 0.
- `npx eslint functions/agents/sotuvchi functions/platform/channels
  functions/channels/telegram functions/api/telegram/agents.ts
  tests/sotuvchi-*.test.ts` → exit 0.
- Boundary checker: 10/10, 0 violations.
- Staged token/private-key/API-key/email/phone scan → 0 совпадений (единственное
  срабатывание — фикстурный литерал `fixture-handoff-webhook-secret`, тот же
  паттерн, что в уже закоммиченных suites);
  `git diff --cached --check` → clean.

## 7. Известные проблемы

- Существовали до этапа: `memory/test_credentials.md` в Git (critical,
  release blocker); global ESLint legacy-red; 27 legacy functions-typecheck
  errors; отсутствие cron/scheduler; migrations `0013–0023` не применены на
  remote D1; Agents webhook не настроен; origin/main всё ещё
  `93fab390733d3d5ffbf052e211d95b6038ee4bbd`, локальная ветка впереди.
- Появились в этапе: регрессий нет. Три manifest-scope assertions в suites
  P2.2/P2.1/P2.5 переведены с границы P2.5 на границу P2.6 — они запрещали
  именно то, что P2.6 обязан добавить.
- Внешние блокеры: Click/Payme merchant API, фискальные чеки, Instagram и
  WhatsApp Business API — без изменений.

## 8. Следующая задача

**P2.7 — Analytics и pilot readiness** после отдельного явного задания:
события этапа (§13 SOTUVCHI_PLAN), `/stats`, RU/UZ лендинги, setup-скрипт и
runbook. Без платёжных интеграций.

## 9. Acceptance criteria следующего этапа

1. События пишутся без PII и без сырых текстов.
2. `/stats` считает только детерминированные счётчики из БД.
3. Лендинги `/ru/sotuvchi/` и `/uz/sotuvchi/` проходят существующий
   seo-audit-гейт.
4. Runbook описывает применение migrations `0018–0023` и настройку webhook
   как отдельные одобряемые операции.
5. Обязательный baseline не опускается ниже 548/548, полный — ниже 626/626.
6. Functions typecheck — те же 27 legacy errors, 0 новых.
7. Scoped ESLint exit 0, boundaries 10/10.

## 10. Команды для старта

```powershell
cd F:\Claude\gptbot-repo
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\CURRENT_STATE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ARCHITECTURE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ROADMAP.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\TEST_MATRIX.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\KNOWN_ISSUES.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\DECISIONS.md
git status --short
git branch --show-current
git rev-parse HEAD
git log -15 --oneline
git diff
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b
node --import tsx --test tests/sotuvchi-handoff.test.ts
node --import tsx --test tests/sotuvchi-orders-inventory.test.ts
node --import tsx --test tests/sotuvchi-checkout.test.ts
node --import tsx --test tests/sotuvchi-buyer-qa.test.ts
node --import tsx --test tests/sotuvchi-catalog.test.ts
node --import tsx --test tests/sotuvchi-onboarding.test.ts
node --import tsx --test tests/telegram-agents-webhook.test.ts
node --import tsx --test tests/platform-runtime.test.ts
node --import tsx --test tests/platform-workflow.test.ts
node --import tsx --test tests/platform-knowledge.test.ts
node --import tsx --test tests/platform-ai.test.ts
node --import tsx --test tests/platform-tenancy.test.ts
node --import tsx --test tests/platform-events.test.ts
node --import tsx --test tests/agent-boundaries.test.ts
node --import tsx --test tests/telegram-channel-compat.test.ts
node --import tsx --test tests/telegram-assistant.test.ts
node --import tsx --test tests/gpt-chat.test.ts
npx tsc -p tsconfig.functions.json --noEmit
```

## 11. Риски

- Не ослаблять инварианты P2.6: одна живая переписка на buyer-сессию, ровно
  один финальный ответ продавца, replay раньше проверки состояния сессии,
  очистка контента по `expires_at`, payload-free seller notice.
- Не превращать `channel_addresses` в authority: адрес отвечает только на
  вопрос «куда слать», tenant/ownership всегда выводятся из домена.
- Не отправлять pushed-сообщения в обход grounding и без маркера авторства
  продавца.
- Не хранить transcript, вложения, профиль и chat id в домене handoff.
- Не ослаблять инварианты P2.5: одна decrement-запись на заказ, fail-closed
  inventory для `available`, запрет `confirmed → cancelled`.
- Не трогать `functions/api/telegram/webhook.ts`, Javob, lead-бот, gpt-chat,
  SEO и admin.
- Не добавлять `memory/test_credentials.md` в diff и не ротировать
  credentials без отдельного разрешения.

## 12. Rollback

1. Если P2.6 relay создан, `git revert <P2.6-relay-SHA>`.
2. Затем `git revert 8523d8d84c16b75d8132c88a5bd8ab2d1ecccb79`.
3. Migration `0023` не применялась. Если она будет применена отдельно,
   безопасный операционный rollback после отключения handoff traffic —
   удалить только её индексы и таблицы в обратном порядке
   (`idx_sotuvchi_seller_reply_sessions_expiry`,
   `idx_sotuvchi_handoff_operations_created`,
   `idx_sotuvchi_handoffs_expiry`, `idx_sotuvchi_handoffs_queue`,
   `idx_sotuvchi_handoffs_active`, `sotuvchi_seller_reply_sessions`,
   `sotuvchi_handoff_operations`, `sotuvchi_handoffs`,
   `idx_channel_addresses_lookup`, `channel_addresses`). Удаление
   `channel_addresses` также останавливает доставку notification-интентов
   P2.5 — интенты остаются pending и не теряются. Shared
   orders/checkout/catalog/store таблицы не удалять.
