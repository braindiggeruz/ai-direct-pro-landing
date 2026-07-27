# DECISIONS — журнал архитектурных решений (ADR-стиль, только принятые)

## D-011 (2026-07-27, P1.1) Две Knowledge tables, deterministic search и отложенные revisions/events
P1.1 создаёт только tenant-scoped `knowledge_collections`/`knowledge_items`: item дублирует `org_id` и защищён composite FK на collection, structured payload проходит agent-owned runtime schema и strict JSON-safe/size validation, а `search_text`/media/numeric projections вычисляются service до store. Поиск v1 — NFKC+lowercase+dash/punctuation/space normalization без transliteration/stemming, parameterized exact/prefix/`json_each` token candidates и fixed score `4000/3000/2000+n/1000+n` со stable `updated_at DESC, id ASC`; empty query fail-closed. Item payload/status writes используют optimistic `expectedVersion`. `knowledge_revisions` отложена: Sotuvchi v0 пока не требует audit/rollback, а фиктивная неатомарная история запрещена. Knowledge events также отложены до отдельной idempotency/best-effort dispatch policy; raw payload/search/media никогда не должны попадать в events. Media refs остаются opaque channel/store references, доставка вне Knowledge.

## D-010 (2026-07-27, P0.5) Capability AI façade, config policy и один exact legacy shim
P0.5 вводит provider-neutral `platform/ai` как capability-based слой: public façade сейчас реализует только безопасно объединённые `complete` и generic `structured`, а streaming/transcription остаются отдельными typed driver contracts до этапа, где можно сохранить их cancellation/media semantics. Task+tier policy задаёт ordered driver routes и limits; фактические production model chains, credentials и внутренние retries продолжают читать существующие env/config adapters. Structured output считается успешным только после strict JSON parse и runtime schema validation; ошибки content-free и fail-closed. Единственная platform→legacy зависимость находится в `functions/platform/ai/drivers/legacy.ts`, помечена `LEGACY-SHIM` и разрешена boundary checker только для exact path. Production Javob/gpt-chat/STT consumers не мигрированы, поэтому P0.5 не меняет их поведение.

## D-009 (2026-07-26, P0.4) Identity без persons, organization как tenant root и PII-minimal contacts
P0.4 вводит отдельный additive platform-слой `identities`/`organizations`/`memberships`/`contacts` без backfill или изменения legacy `users`/`telegram_users`. `persons` отложена: provider-scoped identity с внешним id в строке уже однозначно связывает owner/staff membership и отдельные per-org contacts; merge/linking пока не нужны. Organization — корень tenant; все membership/contact repository methods получают `orgId` первым бизнес-аргументом и маскируют cross-tenant доступ как not found. Contacts сознательно не содержат phone/display name/raw profile, только identity link, locale и timestamps. `createOrganizationForOwner` создаёт global identity отдельно, затем атомарно записывает organization+owner membership через transactional D1 `batch()`; ошибка второй записи откатывает весь tenant batch, при этом уже существующая/созданная identity остаётся валидной независимой записью.

## D-008 (2026-07-26, P0.3) События: durable-first, безопасный payload и точечный bridge
Канонический outbox платформы — additive D1-таблица `events`; envelope остаётся существующим `PlatformEvent` с nullable `orgId`/`agentId`, обязательным aggregate reference и рекурсивным `PiiSafePayload`. Один обязательный idempotency key создаёт максимум одну строку и duplicate не вызывает повторный emit. Сервис сначала валидирует runtime PII guard, затем сохраняет событие, затем последовательно вызывает in-process subscribers в порядке регистрации; bus запускает оставшихся subscribers после ошибки и в конце выбрасывает `EventDispatchError` с агрегированными причинами, не удаляя durable event. На P0.3 dual-write включён только для legacy `javob_message_received` direct-message потока: legacy `logEvent` выполняется первым, platform payload содержит только `channel/locale/language/sourceType`, а сбой bootstrap/outbox логируется без контента и не ломает ответ Javob. Остальные legacy-события, dispatcher, retries, queue и cron не мигрированы.

## D-006 (2026-07-17, P0.1-pre) Правило фиксации SHA этапа (устраняет рекурсию P0.0)
`STATE.json.last_commit` = SHA коммита С КОДОМ завершённого этапа. Если за ним следует
metadata-only коммит (обновление STATE/HANDOFF), он фиксируется в поле `state_commit`
значением `"HEAD"` — его фактический SHA определяется git-историей (последний коммит,
трогающий только docs/agents-platform после last_commit) и НЕ хранит сам себя.
Максимум 2 коммита на этап: код + relay-метаданные. Бесконечные цепочки «коммит ради SHA
предыдущего» запрещены. Для P0.0: last_commit=50ff0ac (код/доки этапа), state_commit=c83728f.

## D-001 (2026-07-17, P0.0) Платформа = modular monolith в этом репозитории
`functions/{platform,agents,channels}`; без микросервисов/форков/второго backend. Обоснование и полная модель — ARCHITECTURE.md.

## D-002 (2026-07-17, P0.0) Приоритет истины
Код → фактическая инфраструктура → ARCHITECTURE.md (2026-07-17) → старые handoff.

## D-003 (2026-07-17, P0.0) Эстафетная разработка
Один этап = одна сессия = один атомарный коммит (2–3 при явных частях). Состояние — STATE.json; передача — HANDOFF.md (полная перезапись по шаблону). Контекст агента — ограниченный ресурс: при исчерпании сначала целостность+тесты+коммит+handoff.

## D-004 (2026-07-17, P0.0) Baseline-политика
TEST_MATRIX фиксирует эталонные числа; этап не может их уменьшить. Глобальный eslint признан красным legacy-долгом (KNOWN_ISSUES); новые файлы — lint-чистые. Тесты на машине владельца гоняются file-by-file из-за RAM.

## D-005 (2026-07-17, P0.0) Push/deploy-политика этапов
Коммит — обязателен по завершении этапа. Push (=deploy через CF Pages) — только по явной команде владельца.

## Унаследованные продуктовые законы (из утверждённых документов, действуют всегда)
- LLM не пишет цифры; детерминизм для точных операций; grounding fail-closed (ARCHITECTURE §1, AGENTS.md §5).
- Tenant-изоляция через orgId в repository-слое; SQL вне store-слоя запрещён.
- Идемпотентность каждого внешнего входа (UNIQUE-ключи).
- PII не попадает в события/логи; псевдонимизация SHA-256+salt.
- Telegram = канал; OpenRouter = драйвер.
- aidirectprobot неприкосновенен; у Sotuvchi будет СВОЙ бот и СВОИ секреты (`TELEGRAM_SOTUVCHI_*`).
- Sotuvchi MVP: общий бот + витрины `?start=shop_<code>`; фото товаров = telegram file_id; чекаут-FSM в D1; без Mini App/оплат в v0 (SOTUVCHI_PLAN).

Новые решения добавляются сверху с номером, датой, этапом и одним абзацем обоснования.

## D-007 (2026-07-17, P0.1) Typecheck-гейт платформенных пространств
Официальный `tsc -b` не покрывает functions/** (исторически). Гейт платформы: `npx tsc -p tsconfig.functions.json --noEmit` с требованием 0 ошибок в functions/{platform,agents,channels}; 27 legacy-ошибок зафиксированы и не должны расти. Включение functions в tsc -b — отдельный этап после починки legacy.
