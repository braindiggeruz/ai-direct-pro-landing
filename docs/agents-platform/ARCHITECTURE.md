# GPTBot Agents — архитектура платформы следующего поколения
**Chief Software Architect · 2026-07-17 · база: main @ `5bf3d56` · предыдущий аудит Sotuvchi утверждён и является входом**

> Цель документа: через два года в GPTBot работает 15 AI-сотрудников (Sotuvchi, Operator, Clinic, Tutor, Realtor, Lawyer, Restaurant, Beauty, Delivery…), и добавление шестнадцатого не требует ни одной правки ядра. Всё строится ВНУТРИ существующего репозитория `ai-direct-pro-landing` на существующей инфраструктуре (Cloudflare Pages Functions + D1). Никакого второго проекта, форка, отдельного backend.

---

# ЧАСТЬ I. АРХИТЕКТУРА

## 1. Инварианты (что фиксируем как законы платформы)

1. **Один репозиторий, один deploy-конвейер, одна БД.** Modular monolith: границы — модули и интерфейсы, не сеть.
2. **Домены выше каналов и выше моделей.** Telegram — адаптер. OpenRouter — драйвер. Ни то, ни другое не встречается в доменном коде.
3. **Детерминизм выше LLM.** Точные операции (цены, остатки, слоты записи, статусы, деньги) выполняются кодом и БД. LLM применяется только для: понимания языка, выбора инструмента/сущности из закрытого списка, необязательной стилистической обёртки. Это генерализация уже доказанного в Javob/Sotuvchi-плане правила «LLM не пишет цифры».
4. **Fail-closed grounding — сервис платформы**, не фича агента (обобщение `functions/lib/telegram/validator.ts`).
5. **Tenant-изоляция в одном месте.** Ни один SQL вне repository-слоя; каждый repository-метод требует `orgId`.
6. **Идемпотентность по умолчанию.** Каждый внешний вход (webhook, платёж, команда) несёт idempotency-ключ; паттерн `usage_ledger`/`telegram_updates` (UNIQUE-ключи) становится общеплатформенным.
7. **События — единственный способ междоменной связи.** Синхронный in-process bus + durable outbox (см. §9); прямые импорты между доменами запрещены (только platform-контракты).
8. **Privacy by default.** Аналитика — псевдонимы и категории, никогда сырые тексты (паттерн `pseudoUser` + `SAFE_KEYS` — в ядро).
9. **Ничего из работающего не ломаем**: gpt-chat, Javob, lead-бот, SEO-фабрика живут без регрессий; миграция на платформу — опportunистическая (§14).

## 2. Карта доменов (domain-driven, сверху вниз)

```
┌────────────────────────── PLATFORM CORE (существует РОВНО один раз) ─────────────────────────┐
│ Identity        Organizations   Knowledge      Conversation    Workflow       Agent Runtime  │
│ (кто)           (чей tenant)    (что знаем)    (диалог)        (процесс)      (исполнитель)  │
│ Grounding/AI    Handoff         Commerce       Scheduling      Notifications  Media          │
│ Localization    Billing         Analytics/Events  Permissions  Storage        Extensions     │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲ используют через типизированные контракты, НИКОГДА не копируют
┌─────── AGENTS (N штук, только декларации + доменные наполнения) ────────┐
│ sotuvchi/  operator/  clinic/  tutor/  realtor/  lawyer/  restaurant/…  │
│ каждый = manifest + knowledge schema + workflows + prompts + i18n + ui  │
└─────────────────────────────────────────────────────────────────────────┘
        ▲ входы/выходы нормализуются
┌─────── CHANNELS (адаптеры, взаимозаменяемы) ────────────────────────────┐
│ telegram/  webchat/  whatsapp*/  instagram*/  voice*/  email*/  api/    │   * = внешние блокеры API
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. Ядро платформы — полный список сервисов (один экземпляр каждого)

| Сервис | Ответственность | Из чего вырастает (код сегодня) |
|---|---|---|
| **Identity** | identities (канальные личности: telegram_user_id, позже phone/email), склейка в persons, псевдонимизация | `store.pseudoUser`, `telegram_users`, `users` |
| **Organizations** | orgs (tenant), членства+роли (owner/staff), настройки | membership-заготовка из плана Sotuvchi |
| **Permissions** | проверка роль×действие×org; политика агента | новый (тонкий), JWT-guard админки как образец |
| **Knowledge Engine** | типизированные коллекции знаний per-org per-agent, индексация, детерминированный поиск, версии | products-план Sotuvchi → обобщение (§6) |
| **Conversation Engine** | conversations/messages/participants, состояние, TTL/retention | `telegram_items/conversations`-паттерн (§7) |
| **Workflow Engine** | декларативные state-machines, персистентные instances, таймеры | checkout-машина Sotuvchi → обобщение (§8) |
| **Agent Runtime** | загрузка manifest'ов, маршрутизация conversation→agent, исполнение turn-цикла | новый (§5) |
| **AI Layer** | провайдеро-независимые capabilities: complete/stream/structured/transcribe; политика моделей | `lib/llm/router` + `gpt-chat/openrouter-*` + `telegram/service` — СЛИЯНИЕ (§10) |
| **Grounding Engine** | пред-фильтры (injection/harm), пост-валидация фактов, fail-closed | `validator.ts`, `analysis.ts`-санитайзер |
| **Handoff** | эскалация человеку: очередь, назначение, reply-мост, SLA-таймер | план Sotuvchi handoff → сервис |
| **Commerce** | orders/order_items/carts, инвентарные движения | план Sotuvchi orders |
| **Scheduling** | appointments/slots/calendars (Clinic, Beauty, Restaurant, Tutor) | новый; workflow-таймеры |
| **Billing** | plans/entitlements/usage_ledger со scope (person-продукт ИЛИ org-агент), провайдеры платежей | `lib/telegram/billing.ts` — почти готов, добавить scope |
| **Localization** | locale-packs per-agent, fallback-цепочки, языковая детекция | i18n-паттерн + `guessLanguage` |
| **Notifications** | доставка людям (владельцу/сотруднику/клиенту) через их канал | notify-паттерн lead-бота |
| **Media** | attachment-абстракция: channel-native ref (tg file_id) СЕЙЧАС, R2 позже, один интерфейс | file_id-решение Sotuvchi |
| **Storage** | repository-фабрики, транзакции, миграции, tenancy-enforcement | schema/store-паттерны |
| **Events/Analytics** | in-process bus + durable outbox + метрики | `telegram_events` → `events` (§9) |
| **State Machine primitives** | общий исполнитель FSM (использует Workflow, Handoff, Checkout) | новый, маленький |
| **Extensions/Channels** | контракт канала, регистрация, деградация возможностей | `telegram/client.ts` → драйвер |
| **Scheduler (cron)** | таймеры workflow, напоминания, retention-очистка | ⚠ нового типа: CF Pages не имеет cron → отдельный крошечный **Worker с cron-триггером**, бьющий в internal-endpoint (это НЕ второй backend — 20 строк в этом же repo; прецедент: GitHub-Actions-cron автопилота) |

## 4. Структура репозитория (целевая)

```
functions/
  platform/                    ← ЯДРО (границы = будущие extraction-точки)
    identity/  orgs/  knowledge/  conversation/  workflow/  runtime/
    ai/        grounding/  handoff/  commerce/  scheduling/
    billing/   i18n/  notifications/  media/  events/  storage/  http/
  agents/
    registry.ts                ← ЕДИНСТВЕННАЯ точка регистрации (1 строка на агента)
    sotuvchi/   {manifest,knowledge,workflows,prompts,i18n,tools?,ui?}.ts
    clinic/     …
  channels/
    telegram/   {api.ts(=нынешний client), webhook.ts, render.ts, ingest.ts}
    webchat/    (мост в существующий gpt-chat island)
    api/        (REST-канал для внешних интеграций)
  api/                         ← существующие endpoints; новые — тонкие обёртки над platform/*
  lib/                         ← legacy (gpt-chat, telegram=Javob, llm, seo…) — живёт, мигрирует постепенно
src/
  gpt-chat/                    ← как есть
  agents-app/                  ← будущий Mini App/Web кабинет (per-agent UI из manifest.ui)
```
Правило зависимости: `agents/* → platform/*` и `channels/* → platform/*`; `platform` не знает ни об агентах, ни о каналах (инверсия через контракты). `lib/*` может звать platform; platform НЕ зависит от lib (кроме временных shim'ов, помеченных `// LEGACY-SHIM`).

## 5. Agent Runtime — контракт агента

Агент = **данные + декларации, почти без кода**. TypeScript-манифест (типобезопасность > JSON):

```ts
// functions/agents/sotuvchi/manifest.ts
export const sotuvchi: AgentManifest = {
  id: 'sotuvchi', version: '1.0', locales: ['ru','uz'],
  capabilities: ['knowledge.query','commerce.order','handoff'],
  knowledge:  sotuvchiKnowledge,     // §6: схема коллекций
  workflows:  [catalogQA, checkout], // §8: декларативные FSM
  tools:      sotuvchiTools,         // §5.2: типизированные инструменты
  prompts:    sotuvchiPrompts,       // versioned, только интерпретация языка
  policies:   { grounding:'strict-numbers', handoffOn:['unknown_intent','tool_error'], piiRetention:'7d' },
  i18n:       sotuvchiLocales,       // locale-pack
  ui:         { onboarding: onboardingFlow, cards: productCard },  // channel-нейтральные описания
  channels:   { telegram: { commands:['tovar','orders','stats'] } } // опциональные тюнинги
};
```

**Turn-цикл Runtime (одинаков для всех агентов):**
```
inbound (канал нормализовал) → Runtime.resolve(conversation → org → agent)
 → Workflow.currentState? детерминированный переход, БЕЗ AI
 → иначе Intent: правила агента → AI(structured: {tool, argsRef} ИЗ closed-list манифеста)
 → Tool execution (только через platform-сервисы; результат = структурированные факты)
 → Response composition: шаблоны i18n + факты (LLM-обёртка — только если policy разрешает)
 → Grounding.validate(response, факты) → fail-closed
 → outbound через канал; события; billing.consume(idempotent)
```
**Критерий «ядро не меняется»:** новый агент затрагивает ТОЛЬКО свою папку + 1 строку в `agents/registry.ts`. Ни одного изменения в platform/ и channels/. Это проверяется CI-тестом: `import-graph` агента не должен содержать записей в platform.

### 5.2 Tools — единственный доступ агента к миру
```ts
type Tool<I,O> = { name; description; input: Schema<I>; run(ctx: OrgCtx, i: I): Promise<O>;
                  facts(o: O): Facts /* числа/строки, разрешённые в ответе */ }
```
Платформенные tools (бесплатно каждому агенту): `knowledge.search/get`, `commerce.createOrder`, `scheduling.book/slots`, `handoff.escalate`, `conversation.remember`. Агентские tools — только композиция платформенных (пример: `sotuvchi.checkStock` = knowledge.get + формат). Grounding сверяет ответ с `facts()` вызванных tools — механическая невозможность галлюцинации.

## 6. Knowledge Engine
Одна модель для товаров/врачей/меню/уроков/инструкций:
```
knowledge_collections(id, org_id, agent_id, kind, schema_version)
knowledge_items(id, collection_id, org_id, status, payload_json,        ← типизирован схемой агента
               search_text(IDX, нормализованный), numeric1..3(IDX),    ← промоутируемые поля
               media_refs_json, updated_at, version)
knowledge_revisions(item_id, version, payload_json, author, at)         ← аудит изменений
```
Схема агента (`knowledge.ts`) описывает: поля payload, какие промоутируются в search_text/numeric-индексы, карточку отображения, правила валидации ввода (мастер «фото+подпись» Sotuvchi = универсальный ingest-flow: parse→validate→preview→save). Поиск v1 — детерминированный (normalize+LIKE+скоринг токенов); embeddings/Vectorize — расширение за флагом, НЕ зависимость ядра. Clinic: kind='doctor'|'service'|'slot-template'; Restaurant: 'dish'; Operator: 'instruction' (+полнотекст). Ни одна из этих специализаций не трогает движок.

## 7. Conversation Engine
```
conversations(id, org_id, agent_id, channel, channel_thread_ref, contact_id,
              state('active'|'handoff'|'closed'), workflow_instance_id NULL, locale, updated_at)
conversation_messages(id, conversation_id, direction, kind(text|media|action), content_ref,
              created_at)   ← content с retention-политикой агента (policies.piiRetention)
contacts(id, org_id, identity_id, display_name, phone?, consent_flags, last_seen)
```
Участник — всегда `contact` (покупатель=пациент=ученик). Канал даёт только `channel_thread_ref`. Retention — политика из манифеста, очистка Scheduler'ом (обобщение TTL-паттерна Javob).

## 8. Workflow Engine
Декларативные персистентные FSM:
```ts
type Workflow = { id; version; initial; states: Record<State,{
  onEnter?: Action[];                              // tool-вызовы, сообщения-шаблоны
  transitions: { on: Trigger; to: State; guard?; actions?: Action[] }[]
  timeout?: { after: Duration; to: State }         // ← Clinic-напоминания, брошенный чекаут
}>}
```
`workflow_instances(id, org_id, conversation_id, workflow_id, version, state, payload_json, wake_at NULL(IDX), updated_at)` — переживает isolate (урок lead-бота), `wake_at` обслуживает cron-Worker. Триггеры: intent, событие платформы, кнопка, таймер, ответ человека (handoff). Checkout Sotuvchi и запись Clinic — просто разные декларации на одном исполнителе.

## 9. Events — event-driven на реальной инфраструктуре
Без Kafka-фантазий. Двухслойно:
1. **In-process bus** (синхронный, в рамках запроса): `events.emit(type, payload)` → подписчики ядра (billing, analytics, notifications) выполняются в waitUntil. Подписки агентов — декларативно в манифесте.
2. **Durable outbox**: `events(id, org_id, agent_id?, type, aggregate('conversation:..'|'order:..'), payload_json БЕЗ PII, created_at, processed_at NULL)` — источник аналитики, ретро-обработки, будущей выгрузки в очередь (extraction-точка: заменить диспетчер на Cloudflare Queues без смены contract'а).

Каталог (namespace.verb, прошедшее время): `conversation.started/escalated/closed`, `message.received/sent`, `knowledge.item_created/updated`, `workflow.started/advanced/finished/timed_out`, `handoff.created/answered/expired`, `order.created/confirmed/cancelled`, `appointment.booked/reminded/completed`, `tool.executed/failed`, `agent.turn_completed`, `billing.consumed/limit_reached`, `channel.connected`. `telegram_events`/`gpt_events` — legacy-читатели, новые записи идут в `events`.

## 10. AI Abstraction Layer
Слить три существующих реализации (`lib/llm/router`+providers, `lib/gpt-chat/openrouter-*`, `lib/telegram/service+analysis`) в `platform/ai`:
```ts
ai.complete(req, policy) · ai.stream(req, policy) · ai.structured(req, schema, policy) · ai.transcribe(audio, policy)
policy = { task:'intent'|'reply'|'analysis'|'stt'|…, agentId, tier } → model-chain из КОНФИГА (env/D1),
providers = драйверы (openrouter, groq, openai, gemini, workers-ai) с circuit-breaker (уже есть в lib/llm)
```
Смена модели/провайдера = конфигурация, ноль кода агентов. Grounding НЕ внутри ai (ai не знает про домены) — отдельный `platform/grounding`, вызывается Runtime'ом.

## 11. Storage — границы сущностей (tenant-модель)
- **Organization** = tenant = «бизнес» (магазин, клиника). Для соло-сегмента org == business, но схема разделяет сразу (перекраска дешевле миграции).
- **Workspace** — НЕ вводим (лишний слой для нашего сегмента); резервируем org.parent_id для сетей (франшиза клиник) — nullable, не используется.
- **Person/Identity**: identities (канал+внешний id) → persons; contact = person-в-контексте-org. Продавец и покупатель — обе роли через membership/contact.
- Aggregate-границы (транзакции не пересекают): Org-контур (org+members+settings) · Knowledge-контур (collections+items+revisions) · Conversation-контур (conversation+messages+workflow_instance) · Commerce-контур (order+items+inventory_moves) · Scheduling-контур (appointment+slot) · Billing-контур (entitlements+ledger) · Events (append-only). Один D1 сегодня; каждый контур = кандидат на вынос (по org-шардированию) завтра — ЭТО и есть смысл границ.
- Attachment: `{channel:'telegram', ref:file_id}` | `{store:'r2', key}` — единый тип, драйверы в Media.

## 12. Channels — контракт
```ts
type ChannelAdapter = {
  id: 'telegram'|'webchat'|'whatsapp'|…
  ingest(raw): Inbound | null           // нормализация: text/media/action(button)/command
  render(out: Outbound, caps): RawSend  // Outbound = text+facts+choices+card+media (channel-нейтрально)
  capabilities: { buttons, media, streaming, voice… }  // Runtime деградирует UI по caps
  identity(raw): IdentityRef
}
```
Telegram-адаптер оборачивает существующий `client.ts` (переезжает в `channels/telegram/api.ts` как есть). Webchat-адаптер = мост к gpt-chat island (даёт Web-канал агентам почти бесплатно). WhatsApp/Instagram/Voice — ⛔ внешние API/договоры, контракт готов, реализация после доступа. UI-слой (Mini App/Web-кабинет) читает `manifest.ui` — интерфейс не зашит в агента.

## 13. Developer Experience: «GPTBot Dentist за день»
Разработчик пишет РОВНО: `agents/dentist/{manifest.ts, knowledge.ts, workflows.ts, prompts.ts, i18n.ts}` (+опц. tools.ts, ui.ts) + 1 строка в registry. Всё остальное — платформа: webhook, диалог, поиск, чекаут/запись, handoff, лимиты, аналитика, RU/UZ-инфраструктура, гварды. CI-guard: тест «агент не импортирует ничего, кроме platform-контрактов» + golden-тест манифеста (schema-валидация). Цель: ≤7 файлов, 0 правок ядра — закреплена как acceptance-критерий платформы.

---

# ЧАСТЬ II. АНАЛИЗ ДОЛГА И ПЛАНЫ

## 14. Что из текущего кода придётся переписать через год — меняем СЕЙЧАС
| Решение сегодня | Проблема через год | Решение платформы |
|---|---|---|
| `telegram/handler.ts` 33KB — маршрутизация+домен+UI в одном | каждый агент повторит этот монолит | Runtime turn-цикл + декларации (§5) |
| i18n одним 27KB-файлом на бота | 15 агентов × 2 языка = неуправляемо | locale-packs per-agent + platform/i18n loader |
| события в per-домен таблицах (telegram_events, gpt_events) | нет сквозной аналитики платформы | единая `events` + legacy-view |
| три AI-реализации | четвёртая появится в первом же новом агенте | platform/ai (§10) |
| lead-бот: state в памяти | уже признано неприемлемым | Workflow instances в D1; lead-бот не трогаем, но паттерн запрещаем |
| `daily_usage_count` в telegram_users | двойная бухгалтерия | ledger — единственная истина (уже так; колонку пометить deprecated) |
| tokens/лимиты Javob в TelegramConfig | конфиг платформы размажется | platform config-realm per-agent |
| нет cron | Clinic-напоминания невозможны | cron-Worker (§3, Scheduler) — делать РАНО, а не потом |
| validator заточен на «источник→ответ» | у агентов источник = tool-facts | Grounding поверх Facts-контракта (§5.2) |
| upload только в GitHub | фото пользователей некуда класть при Mini App | Media-абстракция сейчас, R2-драйвер при первом веб-UI |

Что НЕ трогаем (не долг): SEO-фабрика, gpt-chat island, prerender, billing-ledger (уже платформенный), guard aidirectprobot.

## 15. Рефакторинг директорий (до первой строки нового кода)
- **Создать**: `functions/platform/**`, `functions/agents/{registry.ts,sotuvchi/}`, `functions/channels/telegram/`.
- **Переместить (без переписывания)**: `lib/telegram/client.ts` → `channels/telegram/api.ts` (Javob импортирует по новому пути — единственная правка Javob); `lib/llm/*` → `platform/ai/drivers/*`; `lib/gpt-chat/http.ts` → `platform/http`; `hash.ts` → `platform/identity/pseudo.ts` (реэкспорт-shim'ы на старых путях, чтобы Javob/чат не менять массово).
- **Объединить**: три AI-обвязки → platform/ai (Javob/чат переключаются на неё во вторую очередь, через shim).
- **Разделить**: `lib/telegram/*` остаётся ТОЛЬКО Javob-доменом (переименовать в `lib/javob/` — отложить до спокойного окна, сейчас алиасом).
- **Удалить**: ничего работающего; кандидаты в отдельный janitor-коммит: `gptbot-audit/**`, `.emergent/`, `memory/PRD.md`, `test_result.md`, мёртвые Smart-Forward экспорты.
- **Оставить как есть**: scripts/, content/, src/gpt-chat/, api/ (существующие).

## 16. План миграции (существующие продукты → платформа)
Стратегия — **strangler**: платформа доказывается на Sotuvchi (первый нативный агент), legacy подключается позже адаптерами. Javob = «agent #0»: этап M1 — его события дублируются в `events`; M2 — его AI-вызовы через platform/ai; M3 (опционально) — манифест-обёртка. Веб-чат: получает webchat-канал платформы, когда появится второй веб-агент; до тех пор не трогаем. Lead-бот: замораживаем навсегда, God willing выключим после Sotuvchi-лидогенерации. БД: новые таблицы платформы addom (0013+); legacy-таблицы не мигрируем, читатели-адаптеры.

## 17. План реализации
**P0 «Скелет платформы» (3–5 дн):** platform/{events,storage,identity,orgs,i18n,http,grounding-каркас} + agents/registry + channels/telegram(api-move+webhook-каркас с secret/dedup/waitUntil из assistant-паттерна) + cron-Worker заготовка. Критерий: пустой echo-агент отвечает в тестовом боте; suite legacy зелёный.
**P1 «Runtime+Knowledge+Workflow» (5–8 дн):** turn-цикл, tools-контракт, knowledge-таблицы+ingest-мастер, FSM-исполнитель+instances+wake_at. Критерий: demo-агент с 3 знаниями и 1 workflow проходит golden-сценарий.
**P2 «Sotuvchi на платформе» (7–10 дн):** manifest+knowledge(товары)+workflows(QA, checkout)+commerce(orders)+handoff-сервис+notifications. Критерий = критерии MVP из утверждённого аудита (10 пунктов), но реализованные декларативно.
**P3 «Пилот+DX-закалка» (параллельно):** аналитика на events, /stats, лендинги, CI-guard изоляции агентов, DENTIST-тест (фиктивный агент за ≤1 день силами «нового разработчика» = меня по чек-листу).
**P4+:** Scheduling-домен (Clinic), Mini App (agents-app, initData), R2-media, WhatsApp по доступности API, per-org боты (bot_connections+шифрование), биллинг org-scope.

## 18. Последовательность коммитов (P0–P2)
1 `chore(platform): scaffold platform/agents/channels namespaces + import-boundary lint` · 2 `refactor(channels): move telegram client to channels/telegram (shims, zero behavior change)` · 3 `feat(platform): events bus + durable outbox + analytics bridge` · 4 `feat(platform): identity+orgs+memberships (migration 0013) + repo layer + isolation tests` · 5 `feat(platform): ai layer merging llm-router/openrouter drivers (legacy via shim)` · 6 `feat(platform): knowledge engine + ingest wizard framework` · 7 `feat(platform): workflow engine + persistent instances + cron worker` · 8 `feat(platform): agent runtime + tools + grounding facts-contract` · 9 `feat(agents): sotuvchi manifest/knowledge/workflows/i18n` · 10 `feat(platform): handoff service + notifications` · 11 `feat(platform): commerce orders + inventory moves` · 12 `feat(agents/sotuvchi): checkout + orders + seller flows` · 13 `feat(analytics): events dashboards + /stats + landings`. Каждый коммит: полный legacy-suite зелёный + новые тесты.

## 19. Риски
| Риск | Митигция |
|---|---|
| Over-engineering ядра до первого агента | P0/P1 строятся ТОЛЬКО в объёме, потребном Sotuvchi; всё «на будущее» — интерфейс, не реализация |
| Большой рефакторинг сломает Javob/чат | move-only коммиты с shim'ами; suite 123+ как ворота каждого шага |
| CF Pages лимиты (CPU-время turn'а, D1-конкуренция) | turn-цикл ≤2 AI-вызова; замеры latency в events; extraction-точки готовы (Queues/DO) |
| Cron-Worker = «второй сервис» психологически | тот же repo, тот же deploy-принцип, 1 файл; без него Clinic невозможен |
| Декларативный Workflow окажется тесен | Action = произвольная tool-функция — эскейп-хетч без ломки модели |
| Разъезд схемы знаний по агентам | schema_version + ревизии + миграторы коллекций в контракте с первого дня |

## 20. Что можно строить УЖЕ СЕЙЧАС без риска переделки (одобрено архитектурой)
1. `events` outbox + мост из Javob (только добавляет записи).
2. Move `client.ts` → channels/telegram + shim (нулевое поведение).
3. Import-boundary lint + registry-каркас.
4. Migration 0013: orgs/memberships/identities/contacts (никем не используется до P2 — безопасно).
5. Cron-Worker skeleton (пинг internal-endpoint, пока no-op).
6. platform/ai интерфейс поверх существующих реализаций (shim-режим).
7. Janitor: удаление gptbot-audit/.emergent мусора (отдельный коммит, по твоей отмашке).

---
**Резюме CTO:** платформа = существующий монолит, которому мы даём внутренние границы: домены-сервисы в `platform/`, агенты-декларации в `agents/`, каналы-адаптеры в `channels/`. Sotuvchi строится сразу НА платформе и тем самым её доказывает; Javob и чат мигрируют strangler'ом без остановки. Через год Dentist — это 5–7 файлов и одна строка в registry.
