# GPTBot Agents Platform — полный master handoff

Дата фактического аудита: **2026-07-27**
Рабочая директория: `F:\Claude\gptbot-repo`
Ветка: `main`
Дата последнего обновления документа: **2026-07-27 (после P2.5)**
Аудированный source HEAD исходного аудита:
`fda702469f88d09768a56a53a7ebd8f41e34d506`
HEAD после документационного commit этого файла:
`eeece134bf373434dc4e8508c53be408c93b2d96`
P2.3 code commit: `70bd1e05a7eb9ad47632933a052a63922c991978`
P2.3 relay/current-state commit:
`fda702469f88d09768a56a53a7ebd8f41e34d506`
P2.4 code commit: `a418bcb2d9886fa1d9d42cfbcecd39c6f9ac18ea`
P2.4 relay commit: `32112657589983467d31888ad3ec106a8d96b227`
P2.5 code commit: `0915f059027555665661a1bcb90e8719690bce0c`
Удалённый `origin/main` (проверено повторно 2026-07-27):
`93fab390733d3d5ffbf052e211d95b6038ee4bbd`
Последний завершённый этап: **P2.5 — Sotuvchi Orders and Inventory**
Следующий разрешённый этап: **P2.6 — Human handoff**

> Этот документ — главный технический handoff проекта на указанную дату. Он
> фиксирует фактическое состояние кода, данных, тестов и production, но сам по
> себе не является разрешением на push, deploy, применение миграций, настройку
> webhook или создание секретов.

---

## 1. Executive summary и stop-line

### 1.1. Что готово

- В локальной ветке полностью реализованы и проверены этапы Agents Platform
  `P0.0–P2.5`.
- Platform построена как modular monolith с channel-neutral контрактами,
  tenant-scoped runtime, deterministic-first обработкой и строгим grounding.
- Telegram Agents transport изолирован от двух существующих production
  Telegram-ботов.
- Sotuvchi умеет:
  - регистрировать продавца и магазин;
  - создавать категории и товары;
  - публиковать каталог;
  - открывать buyer storefront по opaque deep link;
  - отвечать на ограниченный список RU/UZ/mixed запросов по каталогу;
  - выдавать grounded product cards;
  - безопасно продолжать один минимальный product follow-up;
  - вести persistent checkout одного товара (quantity, имя, телефон, адрес,
    явное подтверждение) и создавать один идемпотентный заказ-заявку;
  - показывать продавцу его заказы, подтверждать, отменять и закрывать их;
  - вести количественный inventory с append-only ledger и списывать остаток
    ровно один раз на заказ;
  - записывать durable notification intents для продавца и покупателя.
- Все 23 test suite прошли: **586/586** (обязательный Agents-набор 508/508).
- Root TypeScript, Railway backend typecheck и обе сборки прошли.
- Scoped Agents Platform lint и архитектурные boundary tests прошли.

### 1.2. Что не развернуто

- Локальная ветка до документационного commit была впереди `origin/main` на
  16 commits и не отставала от него; после документационного commit — 17,
  после P2.4 code+relay — 19, после P2.5 code+relay — 21.
- Production Cloudflare Pages на момент аудита использовал source
  `93fab39…`, то есть удалённый `origin/main`, а не локальный P2.3 relay.
- Удалённая D1 показывает migrations `0013–0020` как pending; `0021` и `0022`
  также не применялись.
- Agents Telegram webhook не настроен и Agents bot не должен считаться
  production-ready.
- Push, deploy, migration apply и webhook setup в ходе этого аудита не
  выполнялись.

### 1.3. Жёсткая граница следующей работы

P2.5 завершён в границах: seller order lifecycle
(`placed → confirmed | cancelled`, `confirmed → done`), количественный
inventory с append-only ledger, атомарное подтверждение с однократным
списанием и durable notification intents. Оплата, refunds, partial
fulfillment, мультикорзина, multi-warehouse, variant inventory, CRM, human
reply bridge, Mini App, внешняя доставка и фактическая отправка уведомлений
в Telegram в P2.5 не входили и не реализованы.

Следующий продуктовый этап — только **P2.6 Human handoff**: очередь,
уведомление продавцу, reply-мост «ответ продавца → покупателю», TTL текста
вопроса, закрытие и события. Платежи, CRM, Mini App и analytics остаются вне
этапа.

### 1.4. Критический security stop

В tracked-файле `memory/test_credentials.md` присутствуют записанные открытым
текстом admin credentials. Значения в этот handoff намеренно не перенесены.
Текущая действительность этих credentials не проверялась, но сам факт
нахождения секрета в Git делает проблему **critical**:

- до публичного release необходимо ротировать затронутые credentials;
- удалить credential material из текущего дерева;
- отдельно согласовать очистку Git history и downstream clones;
- после ротации проверить Cloudflare, admin login и все интеграции;
- не копировать значения из старого файла в issue, commit message, лог или чат.

Этот аудит не выполнял ротацию, потому что изменение production-секретов было
явно вне разрешённого scope.

---

## 2. Источник истины и правила продолжения

### 2.1. Приоритет источников

При конфликте сведений следующий агент должен использовать такой порядок:

1. фактический Git tree на конкретном commit;
2. `AGENTS.md`;
3. `docs/agents-platform/STATE.json`;
4. этот master handoff;
5. `ARCHITECTURE.md`, `DECISIONS.md`, `ROADMAP.md`, `TEST_MATRIX.md`,
   `KNOWN_ISSUES.md`, `CURRENT_STATE.md`;
6. stage handoff `HANDOFF.md`;
7. старые отчёты и документы вне `docs/agents-platform`.

Старые аудиты полезны как история, но не должны переопределять текущий код,
актуальные commit SHA или свежие результаты проверок.

### 2.2. Обязательные governance-файлы

- `AGENTS.md` — правила работы в репозитории.
- `docs/agents-platform/STATE.json` — machine-readable stage state.
- `docs/agents-platform/ARCHITECTURE.md` — архитектурные границы.
- `docs/agents-platform/DECISIONS.md` — принятые решения.
- `docs/agents-platform/ROADMAP.md` — последовательность этапов.
- `docs/agents-platform/CURRENT_STATE.md` — текущее состояние Platform.
- `docs/agents-platform/TEST_MATRIX.md` — обязательные проверки.
- `docs/agents-platform/KNOWN_ISSUES.md` — известный долг.
- `docs/agents-platform/SOTUVCHI_PLAN.md` — продуктовые границы Sotuvchi.
- `docs/agents-platform/HANDOFF.md` — короткий stage handoff и pointer сюда.

### 2.3. Законы работы

- Один этап за раз.
- Production-код и metadata relay не смешиваются без причины.
- Любая мутация должна быть tenant-scoped и fail-closed.
- `org_id`, `store_id`, route authority и capability нельзя принимать из
  пользовательского текста или tool input.
- AI не является источником фактов и не обходит Runtime validation.
- Telegram adapter не содержит бизнес-логику агента.
- Lead bot, Javob, Agents и GPT Chat должны оставаться изолированными.
- Секреты передаются только через environment/bindings; значения не
  коммитятся.
- Данные пользователя собираются только при явной необходимости и с
  определённой retention policy.
- Push, deploy, миграции и webhook setup требуют отдельного явного разрешения.

---

## 3. Git и репозитории

### 3.1. Авторитетный Git repository

- Авторитетный repository: `F:\Claude\gptbot-repo`.
- Git remote:
  `https://github.com/braindiggeruz/ai-direct-pro-landing.git`.
- Ветка: `main`.
- Source HEAD до документационного изменения:
  `fda702469f88d09768a56a53a7ebd8f41e34d506`.
- HEAD после документационного commit (вход в P2.4):
  `eeece134bf373434dc4e8508c53be408c93b2d96`.
- `origin/main` и `git ls-remote origin refs/heads/main`:
  `93fab390733d3d5ffbf052e211d95b6038ee4bbd`.
- Divergence до документационного commit: ahead 16, behind 0; после него —
  ahead 17, behind 0; после P2.4 code+relay — ahead 19, behind 0.
- Tracked paths: 2340 на момент исходного аудита.
- Замечание аудита P2.4: у P2.3 фактически три commit (code, relay и
  отдельный документационный `eeece134…`), что превышает лимит двух commit по
  D-006. Зафиксировано как факт истории; P2.4 использует ровно два commit.

### 3.2. Неавторитетные копии и артефакты

- `gptbot-audit/` — tracked duplicate source subtree, не отдельный Git
  repository. Внутри существует ещё один nested duplicate
  `gptbot-audit/gptbot-audit/`. Они исторические и не должны использоваться
  как источник для реализации.
- `gptbot.uz-audit/` — pre-existing untracked audit artifacts, не Git
  repository. В ходе работы не изменялись.
- `apps/gpt-backend/package-lock.json` — pre-existing untracked lockfile.
  В ходе работы не добавлялся в index и не изменялся намеренно.

### 3.3. Начальное и ожидаемое дерево

До документации tracked tree был clean. Единственные pre-existing untracked
объекты:

```text
apps/gpt-backend/package-lock.json
gptbot.uz-audit/
```

Их нельзя случайно удалить, закоммитить или использовать для вывода о
production source.

### 3.4. Открытые pull requests

На момент аудита существовали пять открытых PR: `#32`, `#27`, `#20`, `#19`,
`#18`. Они не являются частью локального P0.0–P2.3 stage chain и не
изменялись. Перед merge любого из них требуется отдельный rebase/review
относительно текущей ветки.

---

## 4. Карта repository

| Область | Назначение |
|---|---|
| `src/` | Vite/React site, public GPT Chat UI и admin UI |
| `functions/api/` | Cloudflare Pages Functions API routes |
| `functions/platform/` | channel-neutral Agents Platform kernel |
| `functions/agents/` | agent manifests и Sotuvchi domain |
| `functions/channels/` | channel adapters, сейчас Telegram Agents |
| `functions/lib/telegram/` | существующий Javob transport/domain |
| `functions/api/telegram/webhook.ts` | существующий lead bot |
| `functions/api/telegram/assistant.ts` | Javob webhook |
| `functions/api/telegram/agents.ts` | Agents Platform webhook |
| `migrations/` | 22 additive D1 migration files |
| `supabase/migrations/` | Supabase schema для Railway GPT backend |
| `apps/gpt-backend/` | отдельный Fastify/Railway GPT backend |
| `scripts/` | build, SEO, setup, test и operations scripts |
| `tests/` | 21 Node test suite, helper и Javob eval fixture |
| `content/` | локализованный site/blog content |
| `public/` | статические assets, sitemap/robots/build outputs |
| `docs/agents-platform/` | governance и stage documentation |
| `.github/workflows/` | scheduled SEO automation |

Tracked path counts на source HEAD:

| Prefix | Paths |
|---|---:|
| `src/` | 117 |
| `functions/` | 270 |
| `scripts/` | 36 |
| `migrations/` | 20 |
| `tests/` | 23, включая 21 suite + helper + fixture |
| `content/` | 205 |
| `public/` | 339 |
| `docs/` | 47 |
| `apps/gpt-backend/` | 22 |
| `supabase/` | 2 |
| `.github/` | 1 |

---

## 5. Service и deployment topology

Для инвентаризации используются девять логических service groups. Только два
из них являются независимо deployable compute targets.

| № | Service group | Runtime/owner | Состояние |
|---:|---|---|---|
| 1 | Public website и React UI | Cloudflare Pages static build | Production active |
| 2 | Pages Functions API/Admin/SEO/Telegram | Cloudflare Pages Functions | Production active, но Agents source не deployed |
| 3 | Shared D1 data plane | Cloudflare D1 `GPTBOT_DRAFTS_DB` binding | Production active; `0013–0022` pending |
| 4 | Workers AI binding | Cloudflare Workers AI `AI` | Configured in source; live model status not fully verified |
| 5 | GPT backend | Railway/Fastify | Source present; current deployment/env not verified |
| 6 | GPT relational store | Supabase/Postgres | Schema present; live state not verified |
| 7 | Telegram platform | Three isolated bot webhooks | Lead/Javob live; Agents not deployed |
| 8 | GitHub automation/content | GitHub API + Actions | Source workflow present |
| 9 | External automation | n8n ingest/manager integration | Contract present; live workflow state not verified |

External AI/search/payment providers are integrations, а не отдельные
repository-owned services: OpenRouter, Workers AI, Gemini, Groq, Mistral,
xAI, Cerebras, OpenAI STT, Yandex Search, Serper, IndexNow, Paddle,
LemonSqueezy, FreedomPay и GlobalPay.

### 5.1. Cloudflare

- Pages project: `ai-direct-pro-landing`.
- Build output: `dist`.
- Functions routes include `/api/*`, `/admin-tools/*`, `/robots.txt`.
- D1 binding: `GPTBOT_DRAFTS_DB`.
- Workers AI binding: `AI`.
- Production deployment list на момент аудита показывал latest source
  `93fab39`, branch `main`.
- Live read-only smoke:
  - `/` — 200;
  - sitemap — 200;
  - robots — 200;
  - `/api/telegram/assistant` GET — 405;
  - `/api/telegram/webhook` GET — 200;
  - `/api/telegram/agents` GET — 404;
  - `/ru/gpt-chat/` — 200;
  - случайный неизвестный URL — 404.
- Source Agents endpoint на GET возвращал бы controlled 405. Live 404
  подтверждает, что этот endpoint ещё не deployed.

### 5.2. Railway backend

`apps/gpt-backend` — Fastify application, использующая Supabase и
OpenRouter. Cloudflare GPT endpoints предпочитают Railway при наличии
`RAILWAY_GPT_API_URL` и внутреннего секрета, иначе используют D1 fallback.
Наличие source-кода не доказывает, что Railway production deployment сейчас
актуален или правильно настроен.

### 5.3. GitHub Actions

В repository есть scheduled SEO workflow: запуск по понедельникам и четвергам
в 09:00 UTC. Он вызывает internal scheduled endpoint с `CRON_SECRET`.
Результат последнего live run в рамках этого аудита не проверялся.

---

## 6. Stage ledger и точные commit SHA

| Stage | Назначение | Code commit | Relay/state commit |
|---|---|---|---|
| P0.0 | contracts и skeleton | `50ff0ac62e75fdc4b05da95fc5939b1a86d36e34` | `c83728fee303d0d90b47fff539a00c6d811e24d5` |
| P0.1 | manifest/registry foundations | `abd8192f2f7475d34a87d464d041e5aa8e5126b8` | `954bf44dcb9a1ce7e1ebc19a7715f5ddd9a96078` |
| P0.2 | deterministic policy foundations | `1159226b5cec26176704d2da36e9dfaaa6407edc` | `46a4412f1b5c84f7bbcf5aeb1295ad8ae3dcdf5f` |
| P0.3 | events/outbox | `1776679fdbce570b83d7d372d3fe3d4c94528a89` | `7ffb4db13096a6983cb3f5febe8d9a33278ad619` |
| P0.4 | identity/org/contact tenancy | `1f683380078629f67c2fef16a6fe68fd8ba96840` | `4fcfab36ac5ce12bd75cb0054cdb4963dd21c938` |
| P0.5 | provider-neutral AI facade | `31021442c12fbc24a9c90f6a42422412c0d7cbb2` | `fc6b896d522c216839c7f82c2b7de6f1bb681127` |
| P1.1 | Knowledge engine | `c7dc64b61ffbff88e58f8ff96a1c4a9a2c81472e` | `efe1b2aaf85ebc6f1cf275fc8428e814cfcdbd4e` |
| P1.2 | persistent workflow FSM | `cc4484dc72604060068c016e307a8bc766c94cec` | `f554fe843946cf940537f27b8a905342c6894cb4` |
| P1.3 | Agent Runtime | `854a3cf63d860f8f930ad8f66fc1d3c87a132036` | `3e12d1c934a88fc15a69eac7f026438ae736b57a` |
| P1.4 | Telegram Agents transport | `539525410f086ef1c705c221950b29d808982899` | `c04ae463a403287e6d81d9eac8db116c721705a9` |
| P2.1 | Sotuvchi onboarding | `6b7f68e1a3c644dab7d762704332d636d321c133` | `2258aa5cc4889f2da6cb856fbc909dac664401ba` |
| P2.2 | Sotuvchi catalog | `9373af8d0910c360620139e0e6d8913beeefbd0e` | `f6eeb2cdf74a978c4fd35d0c0a13d1315cc5c76b` |
| P2.3 | Sotuvchi Buyer Q&A | `70bd1e05a7eb9ad47632933a052a63922c991978` | `fda702469f88d09768a56a53a7ebd8f41e34d506` |
| P2.4 | Sotuvchi checkout | `a418bcb2d9886fa1d9d42cfbcecd39c6f9ac18ea` | `32112657589983467d31888ad3ec106a8d96b227` |
| P2.5 | Sotuvchi orders/inventory | `0915f059027555665661a1bcb90e8719690bce0c` | relay HEAD |

`STATE.json` фактически содержит:

- `last_completed_stage = P2.5`;
- `current_stage = P2.5`;
- `next_stage = P2.6`;
- `blocked = false`;
- state commit следует D-006 и обозначает relay HEAD, а не хранит собственный
  SHA.

---

## 7. Agents Platform architecture

### 7.1. Modular monolith boundaries

Разрешённое направление зависимостей:

```text
Platform contracts/kernel
        ↑
Agents domain and manifests
        ↑
Channel adapters and endpoint composition
```

- `functions/platform/**` не импортирует `functions/agents/**` и
  `functions/channels/**`.
- `functions/agents/**` может импортировать public Platform contracts/API.
- `functions/channels/**` может импортировать public Platform contracts.
- Telegram endpoint только связывает transport, identity/context, agent
  service, Runtime и renderer.
- Legacy AI adapter изолирован и не превращает legacy Telegram/GPT code в
  dependency Platform.
- `tests/agent-boundaries.test.ts` подтверждает границы: 10/10.

### 7.2. Contracts и capabilities

Agent manifest использует closed capability list:

- `store.onboarding`;
- `store.catalog`;
- `knowledge.query`;
- `commerce.order`;
- `scheduling.book`;
- `handoff`.

Текущий Sotuvchi manifest использует только уже реализованные capability и не
должен объявлять checkout/order до P2.4.

Channel-neutral contracts:

- `InboundMessage`;
- `OutboundMessage`;
- `OutboundCard`/`ProductCard`;
- `OrgContext` с обязательным `orgId`;
- scalar-only `FactSheet`;
- tool definitions/results;
- deterministic rules;
- workflow definitions/actions.

### 7.3. Events P0.3

- Durable D1 outbox `events`.
- Ordered in-process event bus.
- Idempotency key.
- Payload PII guard.
- Sensitive key allow/deny policy.
- Максимальная payload depth: 5.
- Максимальный serialized payload: 8192 bytes.
- Catalog/Buyer mutations пока не публикуют новые domain events, потому что
  atomic outbox policy для них ещё не спроектирована.

### 7.4. Identity и tenancy P0.4

Provider-neutral сущности:

- identity;
- organization;
- membership;
- contact.

Основные инварианты:

- external provider identity не является организацией;
- membership связывает identity и organization;
- операции проверяют organization/membership server-side;
- tenant authority не принимается из model/tool/user input;
- D1 row-level security отсутствует, поэтому безопасность обеспечивается
  application-level composite predicates и тестами.

### 7.5. AI facade P0.5

- Provider-neutral request/response.
- Policy-based model/provider selection.
- Timeouts и fallback.
- Strict structured parsing.
- Ошибка/невалидная структура fail-closed.
- Sotuvchi manifest version `1.2.0` держит AI selection disabled.
- Buyer catalog facts всегда берутся из trusted storage, а не генерируются
  моделью.

### 7.6. Knowledge P1.1

- Tenant-scoped collections/items.
- Deterministic search/ranking.
- Numeric filters.
- Versioning.
- Public API не отдаёт raw store authority.
- Buyer path использует существующие Knowledge normalization contracts, но
  product source остаётся Sotuvchi Catalog.

### 7.7. Workflow P1.2

- Persistent FSM в D1.
- Pure guards.
- Trusted action registry.
- Idempotency.
- Optimistic versioning.
- Transition audit.
- Runtime schema bootstrap существует для локальной/first-run совместимости.

### 7.8. Runtime P1.3

Порядок обработки:

1. проверить agent/capability;
2. нормализовать bounded input;
3. выбрать deterministic rule/tool;
4. валидировать closed-list tool;
5. отклонить tenant override fields;
6. выполнить tool внутри trusted `OrgContext`;
7. собрать scalar Facts;
8. валидировать claims и числа against Facts;
9. вернуть channel-neutral output или controlled fallback.

Runtime не позволяет:

- вызывать незаявленный tool;
- подменять `org_id`/`store_id`;
- выводить число, отсутствующее в Facts;
- выдавать unsupported claim;
- считать AI-generated content фактом.

### 7.9. Registry

Production registry содержит только Sotuvchi. Demo agent mapping используется
только offline/diagnostic flow внутри Agents handler и не является вторым
production agent.

---

## 8. Telegram: четыре независимых продукта

### 8.1. Lead bot

- Endpoint: `/api/telegram/webhook`.
- Token: `TELEGRAM_BOT_TOKEN`.
- Отдельный webhook secret: `TELEGRAM_WEBHOOK_SECRET`.
- Пятишаговый lead form.
- State хранится in-memory и теряется при isolate restart.
- Собранные lead contact fields отправляются admin chat.
- Durable update dedup отсутствует.
- Этот endpoint нельзя репойнтить или переиспользовать для Agents.

### 8.2. Javob assistant

- Endpoint: `/api/telegram/assistant`.
- Отдельные token/secret/username.
- D1 persistence.
- Text и voice превращаются в transcript и рекомендуемый reply.
- Для voice сначала показывается расшифровка, затем ответ.
- Поддерживаются RU, Uzbek Latin и mixed speech.
- Есть tone actions/callback queries.
- Audio обрабатывается в памяти и не сохраняется.
- Transcript/result retention примерно 24 часа и управляется TTL settings.
- Billing paths присутствуют, но product flags по умолчанию не считаются
  включёнными без подтверждения environment.

### 8.3. Tahlil / Voice Credibility Radar

Это функция Javob, а не отдельный бот:

- анализирует только содержание transcript;
- выделяет проверяемые утверждения, внутренние противоречия, неясные обещания
  и вопросы для проверки;
- не называет результат lie detector;
- не присваивает deception score;
- требует consent v2;
- имеет free daily quota;
- cached report хранится около 24 часов;
- поддерживает явное удаление;
- audio не сохраняется;
- analytics должны быть content-free/safe.

### 8.4. Agents Telegram transport

- Endpoint: `/api/telegram/agents`.
- Отдельные `TELEGRAM_AGENTS_BOT_TOKEN`,
  `TELEGRAM_AGENTS_WEBHOOK_SECRET`,
  `TELEGRAM_AGENTS_BOT_USERNAME`.
- Secret проверяется в Telegram header.
- Максимальный body: 64 KiB.
- Принимаются private text/action updates.
- D1 dedup обеспечивает at-most-once обработку update.
- Pipeline:
  `verify → parse → dedup → identity → route/session → agent service →
  Runtime → generic Telegram renderer → send`.
- Endpoint явно возвращает 405 на неподдерживаемые HTTP methods в текущем
  source.
- Setup script содержит guards, не позволяющие использовать identities
  существующих lead и Javob bots.
- На момент аудита endpoint не deployed: live GET вернул 404.

---

## 9. Sotuvchi: состояние P2.1–P2.4

### 9.1. Manifest

- Agent: Sotuvchi.
- Manifest version: `1.3.0`.
- Locales: RU и Uzbek Latin.
- Реализованные capabilities: `store.onboarding`, `store.catalog`,
  `commerce.order`.
- Workflows: `sotuvchi-store-onboarding` v1, `sotuvchi-checkout` v1.
- Strict grounding включён.
- AI selection выключен.

### 9.2. P2.1 Seller onboarding

Seller deep link: `agent_seller`.

FSM:

```text
start
→ awaiting_name
→ awaiting_locale
→ awaiting_delivery
→ awaiting_payment
→ review
→ completed | cancelled
```

Успешное завершение создаёт:

- provider identity;
- organization;
- owner membership;
- Sotuvchi store;
- Telegram Agents route;
- opaque storefront code;
- buyer deep link вида `agent_<opaque-code>`.

Store authority восстанавливается только server-side по route. Opaque code не
является `org_id` или `store_id`.

### 9.3. P2.2 Seller catalog

Реализованы:

- category create/update/status;
- product create/update/status;
- draft/published/archived lifecycle;
- integer UZS price;
- availability allowlist;
- expected version;
- idempotent operation key;
- owner membership check;
- tenant-scoped conditional SQL.

Buyer видит только:

- active store;
- published product;
- active category либо product без category.

Draft, archived, inactive и foreign-tenant rows скрыты.

### 9.4. P2.3 Buyer Q&A

Closed intents:

- `catalog.list`;
- `catalog.search`;
- `product.price`;
- `product.availability`;
- `product.details`;
- `catalog.filter_price`;
- `catalog.help`;
- `unknown`.

Parser:

- deterministic-first;
- поддерживает RU, Uzbek Latin и ограниченную mixed речь;
- нормализует варианты Uzbek apostrophe;
- ограничивает product query до 120 символов и 8 unique tokens;
- не передаёт raw full message в Catalog;
- отклоняет control-bearing/oversized input;
- принимает только bounded non-negative integer UZS;
- не конвертирует валюты;
- не предполагает USD;
- не интерпретирует float/negative values.

Results:

- page size: до 5 cards;
- stable sort:
  `price asc → normalized name → opaque product id`;
- price display локализуется;
- availability только
  `available | unavailable | preorder`;
- card description bounded до 240 символов;
- buttons ограничены controlled actions;
- raw DB row, org/store authority, SKU/version и внутренние поля не
  показываются.

Grounding:

- каждый title/description/field value должен присутствовать в scalar Facts;
- все числа проверяются against Facts;
- unsupported claim приводит к Runtime rejection и controlled fallback;
- unknown не выдумывает продукт, цену, наличие, checkout или handoff.

Minimal follow-up state:

- `last_product_id`;
- `last_intent`;
- `selection_request_key`;
- `selected_at`.

Не сохраняются:

- raw buyer message;
- profile;
- transcript;
- свободная conversation history.

При follow-up store/product/route проверяются заново. Stale, foreign или
unpublished reference не приводит к cross-tenant lookup.

### 9.5. P2.4 Checkout

- Вход: trusted card action `buyer-checkout.<opaque productId>` на полной
  карточке orderable товара; свободный текст checkout не открывает.
- FSM `sotuvchi-checkout` v1:
  `idle → awaiting_quantity → awaiting_name → awaiting_phone →
  awaiting_address → awaiting_confirmation → completed`, плюс `cancelled`.
- Один активный draft на buyer session; ровно один item на заказ.
- Quantity `1..99`; имя `2..80`; телефон `+998` + девять цифр; адрес
  `5..240`.
- Подтверждение атомарно перечитывает published product, active store и
  category, availability и цену; изменение цены требует повторного
  подтверждения.
- Order number `S-XXXXXX`, unique в пределах store.
- Idempotency по trusted `requestId` канала; PII только в `sotuvchi_orders`.

### 9.6. P2.5 Seller orders и inventory

- Seller lifecycle не добавляет колонку статуса: SQLite не расширяет P2.4
  `CHECK` без table rebuild, поэтому добавлена additive
  `sotuvchi_orders.fulfillment_status IN ('none','confirmed','done')`, и
  фактический статус — пара `(status, fulfillment_status)`: `placed`,
  `confirmed`, `cancelled`, `done`.
- Разрешены только `placed → confirmed`, `placed → cancelled`,
  `confirmed → done`. `confirmed → cancelled` запрещён, поэтому компенсация
  склада не существует.
- Продавцу видны только заказы с `placed_at IS NOT NULL`.
- `sotuvchi_inventory` — integer `on_hand` `0..1 000 000`, optimistic
  `version`, PK `(org_id, store_id, product_id)`.
- `sotuvchi_inventory_moves` — append-only: `initial`, `manual_adjustment`,
  `order_confirmed`, с `delta`, `balance_after` и `idempotency_key`.
- Availability никогда не превращается в число: `available` требует строку
  баланса (иначе fail-closed) и `on_hand >= quantity`; `preorder`
  подтверждается без списания; `unavailable` подтвердить нельзя.
- Confirm — один D1 batch: decrement, movement, переход заказа, operation row
  и notification intent; guard'ы вложены так, что применяются все statements
  либо ни один.
- Двойное списание закрыто тремя барьерами: условие
  `fulfillment_status = 'none'`, условие inventory `version` и partial unique
  index `(order_id, type) WHERE order_id IS NOT NULL`.
- Idempotency — trusted `requestId` в общей `sotuvchi_order_operations`
  (operation + SHA-256 fingerprint без PII + target + версия).
- `sotuvchi_notifications` — durable outbox `order_placed` (seller),
  `order_confirmed`/`order_cancelled`/`order_done` (buyer),
  `UNIQUE (order_id, audience, type)`. Row не содержит payload; renderer
  заново читает trusted order.
- Delivery semantics: durable intent + at-least-once попытка + идемпотентные
  доменные эффекты; exactly-once не заявляется. Фактический Telegram-push не
  реализован — нужен durable mapping identity → chat reference.
- Seven closed-list tools: `seller.orders.list`, `seller.order.get`,
  `seller.order.confirm`, `seller.order.cancel`, `seller.order.done`,
  `seller.inventory.get`, `seller.inventory.set`.
- Seller authority — trusted `OrgContext.actorId` + active owner membership +
  active store; membership повторно проверяется внутри каждого мутирующего
  SQL.
- List не содержит имя/телефон/адрес; detail отдаёт их авторизованному
  владельцу, потому что он выполняет заказ.

### 9.7. Сознательно отсутствует

- cart и второй item;
- payment, refunds, partial fulfillment;
- multi-warehouse и variant inventory;
- compensation inventory и `confirmed → cancelled`;
- фактическая отправка уведомлений в Telegram;
- operator/CRM;
- human reply bridge;
- Mini App;
- profile recommendations;
- AI intent fallback;
- currency conversion;
- conversation table;
- timer/cron и состояние `expired`.

---

## 10. Data plane и migrations

### 10.1. D1 migrations

В repository 21 D1 migration file:

| Migration | Назначение | Основные таблицы/изменения |
|---|---|---|
| `0001_ai_drafts.sql` | AI drafts | `ai_drafts`, `ai_draft_audit` |
| `0002_seo_autopilot_jobs.sql` | SEO jobs | `seo_autopilot_jobs` |
| `0003_seo_autopilot_control_center.sql` | control settings | `system_settings` |
| `0004_intent_guard.sql` | topic planning/guard | 4 intent/topic tables |
| `0005_llm_router.sql` | LLM usage/health/idempotency | 3 LLM tables |
| `0006_yandex.sql` | Yandex cache | `yandex_serp_cache` |
| `0007_indexnow.sql` | IndexNow audit | `indexnow_submissions` |
| `0008_gpt_chat.sql` | D1 GPT Chat | 8 GPT/payment tables |
| `0009_telegram_assistant.sql` | Javob core | 5 Telegram tables |
| `0010_javob_billing.sql` | Javob billing | 8 billing/preference tables |
| `0011_telegram_voice_reply.sql` | voice-reply columns/indexes | additive changes |
| `0012_voice_analysis.sql` | Tahlil | `analysis_reports` |
| `0013_platform_events.sql` | Platform events | `events` |
| `0014_platform_identity_orgs.sql` | tenant identity | 4 platform tables |
| `0015_platform_knowledge.sql` | Knowledge | 2 tables |
| `0016_platform_workflow.sql` | workflow | 2 tables |
| `0017_telegram_agents_transport.sql` | update dedup | `telegram_agent_updates` |
| `0018_sotuvchi_store_onboarding.sql` | store onboarding/routes | 3 tables |
| `0019_sotuvchi_catalog.sql` | catalog/session | 4 tables |
| `0020_sotuvchi_buyer_qa.sql` | buyer follow-up | 4 nullable session columns |
| `0021_sotuvchi_checkout.sql` | checkout/orders | 3 tables, 5 indexes |
| `0022_sotuvchi_orders_inventory.sql` | seller orders/inventory/outbox | 3 tables, 5 indexes, 1 additive column |

Remote read-only command на 2026-07-27 показал, что migrations
`0013–0020` ожидают применения; добавленные в P2.4 `0021` и в P2.5 `0022`
также не применялись. Ни одна migration не применялась ни в ходе аудита, ни
в ходе P2.4, ни в ходе P2.5.

### 10.2. D1 tables

В 22 migration file определены 58 уникальных D1 tables (P2.4 добавила
`sotuvchi_orders`, `sotuvchi_order_items`, `sotuvchi_order_operations`;
P2.5 — `sotuvchi_inventory`, `sotuvchi_inventory_moves`,
`sotuvchi_notifications`):

```text
ai_draft_audit
ai_drafts
analysis_reports
contacts
entitlements
events
gpt_events
gpt_leads
gpt_messages
gpt_sessions
gpt_subscriptions
gpt_usage_daily
identities
indexnow_submissions
intent_guard_analyses
knowledge_collections
knowledge_items
llm_idempotency
llm_provider_health
llm_usage
memberships
organizations
payment_attempts
payment_orders
payment_transactions
plans
referrals
seo_autopilot_jobs
seo_topic_plan_items
seo_topic_plans
seo_topic_reservations
sotuvchi_catalog_operations
sotuvchi_categories
sotuvchi_onboardings
sotuvchi_order_items
sotuvchi_order_operations
sotuvchi_orders
sotuvchi_products
sotuvchi_storefront_sessions
sotuvchi_stores
subscriptions
system_settings
telegram_agent_routes
telegram_agent_updates
telegram_events
telegram_items
telegram_results
telegram_updates
telegram_users
usage_ledger
user_preferences
users
workflow_instances
workflow_transitions
yandex_serp_cache
```

### 10.3. Agents/Sotuvchi tables

Migrations `0013–0022` вводят 23 уникальных Agents-related tables:

```text
events
identities
organizations
memberships
contacts
knowledge_collections
knowledge_items
workflow_instances
workflow_transitions
telegram_agent_updates
sotuvchi_onboardings
sotuvchi_stores
telegram_agent_routes
sotuvchi_categories
sotuvchi_products
sotuvchi_catalog_operations
sotuvchi_storefront_sessions
sotuvchi_orders
sotuvchi_order_items
sotuvchi_order_operations
sotuvchi_inventory
sotuvchi_inventory_moves
sotuvchi_notifications
```

Sotuvchi непосредственно использует тринадцать таблиц, если route authority
считать частью домена:

```text
sotuvchi_onboardings
sotuvchi_stores
telegram_agent_routes
sotuvchi_categories
sotuvchi_products
sotuvchi_catalog_operations
sotuvchi_storefront_sessions
sotuvchi_orders
sotuvchi_order_items
sotuvchi_order_operations
sotuvchi_inventory
sotuvchi_inventory_moves
sotuvchi_notifications
```

### 10.4. Supabase

Supabase schema определяет 10 tables:

```text
profiles
gpt_sessions
gpt_messages
gpt_usage_daily
gpt_leads
gpt_subscriptions
payment_attempts
gpt_events
provider_errors
message_feedback
```

Состояние live Supabase schema и migrations этим аудитом не подтверждено.

### 10.5. Migration/runtime bootstrap mismatch

Platform и Sotuvchi stores имеют runtime schema bootstrap для локальной и
first-run совместимости. Для `0018/0019/0021` он создаёт недостающие таблицы,
а для `0020` runtime code выполняет additive `ALTER TABLE` и подавляет ошибку
duplicate column. P2.4 сознательно не расширяла этот паттерн: новый
`ensureSotuvchiCheckoutSchema` использует только `CREATE TABLE/INDEX IF NOT
EXISTS`, без `ALTER`.

Это расходится с операционным комментарием `0020`, где migration не должна
применяться application code. Риски:

- remote migration ledger может оставаться pending при фактически изменённой
  schema;
- schema drift трудно диагностировать;
- rollback и ownership миграций становятся неоднозначными.

Не исправлять это внутри P2.6 «заодно». Сначала требуется отдельное решение:
либо migrations являются единственным production owner, либо bootstrap
официально документируется и проверяется parity tooling.

---

## 11. API inventory

### 11.1. Cloudflare Pages Functions

В `functions/api` находятся **63 route modules** и **90 explicit
`onRequest*` export lines**, включая отдельные method-not-allowed handlers.

#### Admin AI drafts — 10 modules

```text
GET/POST/OPTIONS /api/admin/ai-drafts
GET/DELETE        /api/admin/ai-drafts/:id
POST              /api/admin/ai-drafts/:id/apply-links
POST              /api/admin/ai-drafts/:id/apply-optimization
POST              /api/admin/ai-drafts/:id/import
POST              /api/admin/ai-drafts/:id/optimize
POST              /api/admin/ai-drafts/:id/optimize-both
POST              /api/admin/ai-drafts/:id/status
POST              /api/admin/ai-drafts/:id/suggest-links
POST              /api/admin/ai-drafts/:id/translate-locale
```

#### Admin cockpit и IndexNow — 4 modules

```text
GET  /api/admin/cockpit
GET  /api/admin/indexnow/history
GET  /api/admin/indexnow/recent
POST /api/admin/indexnow/submit
```

#### Admin SEO — 12 modules

```text
POST      /api/admin/seo/cannibalization/analyze
POST      /api/admin/seo/cannibalization/apply-retarget
POST      /api/admin/seo/cannibalization/retarget
GET       /api/admin/seo/content-inventory
GET/POST  /api/admin/seo/topic-plans
GET/PATCH /api/admin/seo/topic-plans/:id
POST/DELETE /api/admin/seo/topic-plans/:id/items/:itemId
POST      /api/admin/seo/topic-plans/:id/items/:itemId/launch
POST      /api/admin/seo/yandex/quick-launch
POST      /api/admin/seo/yandex/research
POST      /api/admin/seo/yandex/serp
GET       /api/admin/seo/yandex/status
```

#### Admin SEO Autopilot — 3 modules

```text
GET      /api/admin/seo-autopilot/jobs
GET/POST /api/admin/seo-autopilot/run
GET/POST /api/admin/seo-autopilot/schedule
```

#### Auth, content, media и base — 9 modules

```text
POST            /api/ai/fill
GET             /api/audit
GET             /api/auth/config
POST            /api/auth/login
GET             /api/auth/me
GET/POST/DELETE /api/content
POST            /api/content/publish-to-github
POST            /api/images/upload
GET             /api/indexnow/key
```

#### GPT и payments — 6 modules

```text
POST /api/gpt/chat
GET  /api/gpt/history
POST /api/gpt/lead
POST /api/gpt/session
POST /api/gpt/subscribe
POST /api/payments/webhook
```

#### SEO public/protected utilities — 13 modules

```text
POST /api/seo/ai/apply-patch
GET  /api/seo/ai/logs
GET  /api/seo/ai/patch
GET  /api/seo/ai/provider-status
POST /api/seo/ai/validate-patch
GET  /api/seo/booster
POST /api/seo/indexnow
POST /api/seo/serper/analyze-url
POST /api/seo/serper/batch
GET  /api/seo/serper/logs
POST /api/seo/serper/query
GET  /api/seo/serper/status
GET  /api/seo/suggest-links
```

#### SEO Autopilot runtime/internal — 3 modules

```text
GET      /api/seo-autopilot/jobs/:id
GET/POST /api/seo-autopilot/run
GET/POST /api/internal/seo-autopilot/scheduled-run
```

`OPTIONS` handlers/CORS присутствуют там, где экспортированы, но в списке
показан основной application contract.

#### Telegram — 3 modules

```text
GET/POST /api/telegram/webhook
GET/POST /api/telegram/assistant
POST     /api/telegram/agents
```

Для Agents source дополнительно экспортирует controlled 405 handlers для
GET/PUT/DELETE/PATCH/HEAD/OPTIONS.

### 11.2. API trust zones

- `/api/admin/*` и mutation tooling должны считаться protected. Legacy
  модули используют не полностью единообразные admin guards; перед
  расширением требуется route-by-route auth review.
- `/api/internal/*` требует cron/internal secret.
- Telegram endpoints требуют каждый собственный webhook secret.
- Payment webhook требует provider webhook verification.
- GPT public routes используют session/JWT/rate-limit/Turnstile механизмы,
  но Turnstile enforcement имеет известный gap, описанный ниже.
- Capability/id, bearer token или random job id не должны считаться заменой
  полноценной authorization policy.

### 11.3. Railway backend — 13 route handlers

```text
GET    /health
POST   /session
POST   /chat
GET    /history
GET    /messages
PATCH  /messages/:id
DELETE /messages/:id
POST   /feedback
POST   /lead
POST   /subscribe
POST   /webhook
GET    /ping
GET    /admin/analytics
POST   /cleanup
```

Точные prefixes и internal auth определяются Fastify registration source.
Cloudflare↔Railway internal requests должны использовать
`GPTBOT_INTERNAL_API_SECRET`.

---

## 12. Environment, bindings и configuration

Статический inventory содержит **112 уникальных configuration identifiers**.
Это список имён, не доказательство наличия или корректности values в
production.

### 12.1. Cloudflare bindings и core runtime

```text
AI
ASSETS
GPTBOT_DRAFTS_DB
NODE_ENV
PORT
LOG_LEVEL
SITE_URL
GPTBOT_SITE_URL
VITE_SITE_URL
VITE_API_BASE
```

Классификация:

- `AI`, `ASSETS`, `GPTBOT_DRAFTS_DB` — bindings;
- URL/log/runtime fields — plain configuration;
- часть code-only bindings не отражена в общем `Env` interface, что создаёт
  type/config drift.

### 12.2. Admin/auth/security

```text
ADMIN_API_KEY
ADMIN_EMAIL
ADMIN_PASSWORD
ADMIN_PASSWORD_HASH
JWT_SECRET
LOGIN_ATTEMPTS
ALLOWED_ORIGINS
TURNSTILE_SECRET_KEY
TURNSTILE_SITE_KEY
GPT_HASH_SALT
GPTBOT_INTERNAL_API_SECRET
CRON_SECRET
```

Все password/hash/key/secret values являются secrets. Plaintext
`ADMIN_PASSWORD` — legacy fallback и должен быть unset после безопасного
перехода на hash.

### 12.3. Telegram

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_MANAGER_URL
TELEGRAM_ASSISTANT_BOT_TOKEN
TELEGRAM_ASSISTANT_BOT_USERNAME
TELEGRAM_ASSISTANT_WEBHOOK_SECRET
TELEGRAM_AGENTS_BOT_TOKEN
TELEGRAM_AGENTS_BOT_USERNAME
TELEGRAM_AGENTS_WEBHOOK_SECRET
VITE_TELEGRAM_BOT_USERNAME
TELEGRAM_FREE_DAILY_LIMIT
TELEGRAM_ITEM_TTL_HOURS
TELEGRAM_MAX_INPUT_CHARS
TELEGRAM_MAX_OUTPUT_CHARS
TELEGRAM_STT_TIMEOUT_MS
TELEGRAM_VOICE_MAX_BYTES
TELEGRAM_VOICE_MAX_SECONDS
TELEGRAM_VOICE_MAX_TRANSCRIPT_CHARS
TELEGRAM_VOICE_MIN_SECONDS
TELEGRAM_ANALYSIS_FREE_DAILY
TELEGRAM_ANALYSIS_TIMEOUT_MS
TELEGRAM_ANALYSIS_TTL_HOURS
```

Bot tokens и webhook secrets — secrets. Usernames, limits и TTL — plain
configuration. Lead/Javob/Agents values не взаимозаменяемы.

### 12.4. Javob product flags

```text
JAVOB_BILLING_ENABLED
JAVOB_CLICK_ENABLED
JAVOB_DAY_PASS_ENABLED
JAVOB_PAYME_ENABLED
JAVOB_PLUS_ENABLED
```

Эти flags optional. Их наличие в коде не означает включённый billing.

### 12.5. LLM/STT providers

```text
OPENAI_API_KEY
OPENAI_STT_MODEL
OPENROUTER_API_KEY
OPENROUTER_APP_TITLE
OPENROUTER_SITE_URL
OPENROUTER_TIMEOUT_MS
OPENROUTER_MODEL_ANALYSIS
OPENROUTER_MODEL_ARTICLE
OPENROUTER_MODEL_ECONOMY
OPENROUTER_MODEL_FREE
OPENROUTER_MODEL_FREE_FALLBACKS
OPENROUTER_MODEL_JUDGE
OPENROUTER_MODEL_OPTIMIZER
OPENROUTER_MODEL_PAID
OPENROUTER_MODEL_PAID_FALLBACKS
OPENROUTER_MODEL_QUALITY
OPENROUTER_MODEL_RETARGET
OPENROUTER_MODEL_UZ
AI_OPTIMIZER_MODEL
ALLOW_PAID_FALLBACK_FOR_FREE
CEREBRAS_API_KEY
CEREBRAS_MODEL
CF_AI_MODEL
GEMINI_API_KEY
GEMINI_MODEL
GEMINI_FALLBACK_MODEL
GROQ_API_KEY
GROQ_MODEL
GROQ_STT_MODEL
MISTRAL_API_KEY
MISTRAL_MODEL
XAI_API_KEY
XAI_MODEL
SEO_AUTOPILOT_USE_DIRECT_AI
```

All API keys are secrets. Models, titles, URLs, timeouts и flags — plain
configuration. Некоторые model identifiers являются legacy/scaffold и могут
не участвовать в текущем path.

### 12.6. GPT limits и Railway

```text
GPT_FREE_DAILY_LIMIT
GPT_FREE_HOURLY_LIMIT
GPT_PAID_MONTHLY_LIMIT
GPT_MAX_INPUT_CHARS
RAILWAY_GPT_API_URL
```

Limits и URL — plain configuration. Internal authorization задаётся
`GPTBOT_INTERNAL_API_SECRET`.

### 12.7. Supabase

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWKS_URL
```

`ANON/PUBLISHABLE` предназначены для ограниченного public use, но всё равно не
должны давать privileged access. `SECRET` и `SERVICE_ROLE` — критические
secrets. Live status не проверен.

### 12.8. GitHub/content

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
```

Token — secret. Owner/repo/branch — plain config.

### 12.9. Search/indexing

```text
INDEXNOW_KEY
SERPER_API_KEY
YANDEX_CLOUD_FOLDER_ID
YANDEX_SEARCH_API_KEY
```

Keys — secrets. Folder ID — identifier, не authentication secret.
`INDEXNOW_KEY` используется code path, но отсутствует в одном из canonical
Env type declarations — это config drift.

### 12.10. n8n

```text
N8N_INGEST_TOKEN
N8N_WEBHOOK_SECRET
EXTERNAL_AUTOPILOT_TRIGGER_ENABLED
```

Token/secret — secrets. Flag — optional plain configuration.

### 12.11. Payments

```text
PAYMENT_PROVIDER
PAYMENT_WEBHOOK_SECRET
PADDLE_API_KEY
LEMONSQUEEZY_API_KEY
FREEDOMPAY_API_KEY
GLOBALPAY_API_KEY
```

Provider — plain config. Остальные values — secrets. Их наличие в source
types не означает активный production provider.

### 12.12. Configuration drift

Canonical `functions/_types.ts` не охватывает все code-referenced fields.
Отдельно обнаружены:

- binding/code-only fields;
- Vite-only fields;
- backend-only env;
- legacy aliases;
- scaffolding для ещё не включённых providers.

Следующий config-hardening stage должен генерировать/валидировать schema из
одного источника, но это не входит в P2.4.

---

## 13. Test, typecheck, build и lint evidence

Все Node suites запускались последовательно, file-by-file, с:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=1400'
```

### 13.1. Обязательная Agents/P2.5 матрица

| Suite | Passed |
|---|---:|
| `sotuvchi-orders-inventory.test.ts` | 37 |
| `sotuvchi-checkout.test.ts` | 36 |
| `sotuvchi-buyer-qa.test.ts` | 39 |
| `sotuvchi-catalog.test.ts` | 54 |
| `sotuvchi-onboarding.test.ts` | 28 |
| `telegram-agents-webhook.test.ts` | 41 |
| `platform-runtime.test.ts` | 49 |
| `platform-workflow.test.ts` | 39 |
| `platform-knowledge.test.ts` | 33 |
| `platform-ai.test.ts` | 15 |
| `platform-tenancy.test.ts` | 31 |
| `platform-events.test.ts` | 20 |
| `agent-boundaries.test.ts` | 10 |
| `telegram-channel-compat.test.ts` | 1 |
| `telegram-assistant.test.ts` | 60 |
| `gpt-chat.test.ts` | 15 |
| **Subtotal** | **508** |

### 13.2. Дополнительные repository suites

| Suite | Passed |
|---|---:|
| `intent-guard.test.ts` | 16 |
| `direct-generator.test.ts` | 13 |
| `indexnow-engine.test.ts` | 11 |
| `yandex-research.test.ts` | 11 |
| `gpt-backend.test.ts` | 17 |
| `telegram-cost-calculator.test.ts` | 6 |
| `canonical-url-redirects.test.ts` | 4 |
| **Subtotal** | **78** |

Полный итог: **586/586** (22 P2.4-suite + новый orders/inventory suite).

Дополнительно Javob offline eval:

- RU: 20 cases;
- UZ: 20 cases;
- mixed: 20 cases;
- total: 60 cases.

### 13.3. Typecheck/build

| Проверка | Результат |
|---|---|
| `npx tsc -b` | pass |
| backend `npm run typecheck` | pass |
| backend `npm run build` | pass |
| root `corepack yarn build` | pass |
| `npx tsc -p tsconfig.functions.json --noEmit` | expected fail: 27 legacy errors |

Functions typecheck содержит ровно 27 errors в шести pre-existing legacy
files:

```text
functions/api/admin/ai-drafts/[id]/status.ts
functions/api/admin/cockpit.ts
functions/api/admin/seo/yandex/quick-launch.ts
functions/lib/seo-autopilot/normalise.ts
functions/lib/telegram/analysis.ts
functions/lib/telegram/handler.ts
```

Новых errors в `functions/platform`, `functions/agents`,
`functions/channels` и Agents endpoint нет.

### 13.4. Build SEO diagnostics

Root build обработал:

- 103 pages;
- 90 articles;
- sitemap с 196 URLs;
- 12 LLM twins.

Неблокирующий SEO debt:

- 27 missing hreflang;
- 46 broken international links;
- 25 missing locale pairs.

### 13.5. Lint и boundaries

- Scoped Agents Platform ESLint: pass.
- Boundary suite: 10/10, violations 0.
- Full repository ESLint: 82 problems:
  - 70 errors;
  - 12 warnings;
  - 38 files.
- `KNOWN_ISSUES.md` содержал устаревшее число 84/71/13; этот handoff
  фиксирует свежий результат, не переписывая production code.

---

## 14. Security audit

### 14.1. Метод и ограничения

Использованы:

- targeted regex secret scan без вывода values;
- Git history pattern scan;
- PII literal inventory;
- risky code pattern scan;
- architecture/tenant/security invariant review;
- `npm audit --omit=dev` в корне и Railway backend;
- tests/typecheck/build;
- read-only Cloudflare production/migration queries.

В окружении отсутствовали `gitleaks`, `trivy` и `semgrep`. Поэтому результат
не является заменой полноценному CI secret/SAST/container scan.

### 14.2. Secret findings

- Canonical source scan по token/private-key patterns: 0 matching files.
- Canonical Git history scan по common token patterns: 0 matching commits.
- Однако targeted credential inventory обнаружил tracked
  `memory/test_credentials.md` с plaintext admin credential record.
- Это critical finding даже при отсутствии совпадения с token regex:
  passwords часто не имеют узнаваемого prefix.

### 14.3. Dependency findings

Root production dependency audit:

- total vulnerable package nodes: 2;
- high: 1;
- moderate: 1;
- affected chain: direct `react-router-dom` → indirect `react-router`;
- advisories включают open redirect, XSS/RSC paths, constructor injection,
  inefficient route matching DoS и RSC CSRF paths;
- installed range уязвим до `react-router-dom 7.17.0`/совместимого router;
- рекомендуется отдельный verified upgrade минимум до исправленной версии,
  с UI/navigation regression tests.

Repository использует declarative BrowserRouter, поэтому часть server/RSC
advisories может быть unreachable, но open-redirect/navigation risk нельзя
автоматически списывать.

Railway backend production dependency audit:

- total vulnerable package nodes: 6;
- high: 6;
- direct affected package: Fastify;
- indirect chains:
  `@fastify/ajv-compiler`, `@fastify/fast-json-stringify-compiler`,
  `fast-json-stringify`, `fast-uri`, `find-my-way`;
- advisory classes включают path traversal/host confusion, body validation
  bypass, forwarded host/protocol spoofing, HTTP2/stream memory DoS.

Обновления dependencies не выполнялись, потому что задача была
documentation-only.

### 14.4. Risky pattern review

- Dynamic `eval`/`new Function`: 0 files.
- Node child-process usage в production source scopes: 0 files.
- `dangerouslySetInnerHTML`: один GPT Chat renderer.
  `renderMarkdown` сначала экранирует весь raw HTML и затем применяет
  маленький whitelist; проверенный path не показал прямого XSS.
- Второй `.innerHTML` очищает static no-JS fallback перед React mount.
- SQL template interpolation встречается в Platform/Sotuvchi stores, но
  интерполируемые fragments являются static column allowlists/trusted field
  sets; пользовательские values передаются через D1 `.bind`.
- `Math.random` используется в legacy ID/backoff/SEO paths. Для authority и
  secret generation должны использоваться cryptographic APIs; отдельный
  review нужен перед расширением этих legacy paths.

### 14.5. Auth и abuse-control findings

1. `functions/api/gpt/chat.ts` запускает Turnstile verification только если
   одновременно присутствуют secret и token. При configured secret, но
   отсутствующем client token запрос может обойти Turnstile. Это
   abuse-control gap.
2. Plaintext `ADMIN_PASSWORD` fallback существует. Production должен
   использовать hash и удалить fallback после ротации.
3. Некоторые legacy admin/SEO routes используют разные auth helpers.
   Необходим единый route matrix.
4. Public capability-based SEO job status может раскрыть status тому, кто
   знает random job id. Cryptographic identifier снижает вероятность, но не
   заменяет authorization.
5. Telegram Agents header equality не constant-time. Риск небольшой для
   remote webhook, но hardening допустим отдельным security change.
6. Shared D1 binding для SEO, GPT, Javob и Agents увеличивает blast radius.

---

## 15. PII, retention и privacy map

### 15.1. Literal scan

Email-like literals найдены в 13 canonical files. Большинство — документация,
tests, admin UI placeholders и public support/contact text. Отдельное
исключение — `memory/test_credentials.md`, содержащее credential material.

Uzbek phone-like literals найдены в семи files:

- public business/NAP content;
- two test fixtures.

Они не были автоматически удалены, потому что часть номеров является
намеренно опубликованными business contacts, а часть — test data.

### 15.2. Data classes

| Product/domain | PII/content | Storage | Retention/status |
|---|---|---|---|
| Lead bot | name/contact/lead answers | isolate memory + admin Telegram message | memory lost on restart; downstream retention undefined |
| Javob | Telegram id, text/transcript, replies | D1 | approximately 24h TTL |
| Javob audio | voice bytes | memory only | not persisted |
| Tahlil | transcript-derived analysis | D1 `analysis_reports` | approximately 24h, user delete supported |
| Agents identity | external Telegram id | D1 `identities` | stable identifier; deletion policy undefined |
| Agents update dedup | update metadata | D1 | content-minimized; retention policy undefined |
| Platform events | bounded scalar payload | D1 | PII guard; retention policy undefined |
| Sotuvchi seller | identity/store/config | D1 | durable; deletion/export flow undefined |
| Sotuvchi buyer P2.3 | route/session, last opaque product/intent | D1 | no raw messages; retention policy undefined |
| GPT Chat D1 | users, sessions, messages, leads, payments | D1 | retention policy not explicit |
| GPT Railway | profiles/messages/leads/subscriptions/events | Supabase | live retention not verified |
| SEO/admin | job/draft/audit payload | D1/GitHub | mostly business content; retention undefined |

### 15.3. P2.4 privacy requirements

До реализации checkout требуется зафиксировать:

- purpose limitation для name/phone/address;
- явный consent/notice;
- encryption/secret handling assumptions;
- минимальный набор полей;
- normalized phone policy без вывода raw value в events/logs;
- retention и deletion;
- кто из seller members может читать order PII;
- export/access audit;
- no PII in idempotency key, event payload, analytics и error text;
- webhook retry/replay semantics;
- test fixtures только synthetic.

### 15.4. P2.5 privacy decisions

Реализовано и зафиксировано:

- seller list не содержит имя, телефон и адрес покупателя;
- seller detail отдаёт их только авторизованному владельцу магазина,
  потому что именно он выполняет доставку — это purpose limitation, а не
  общий доступ;
- `sotuvchi_notifications` не хранит payload вообще; renderer заново читает
  trusted order, поэтому PII в outbox физически отсутствует;
- `sotuvchi_inventory` и `sotuvchi_inventory_moves` не содержат ни одного
  поля покупателя;
- idempotency fingerprint покрывает только имя операции и opaque
  order/product ref;
- error classes content-free; в логи и события PII не попадает;
- test fixtures только synthetic.

Остаётся открытым (переходит в release task): retention/deletion policy для
`sotuvchi_orders`, export/access audit и явный consent/notice покупателю.

---

## 16. Known issues и debt register

### Critical

1. Tracked plaintext admin credential record в
   `memory/test_credentials.md`; нужна ротация и history cleanup.

### High

1. Railway/Fastify dependency audit: 6 high vulnerable nodes.
2. Root React Router chain: 1 high + 1 moderate vulnerable nodes.
3. Agents migrations `0013–0022` не применены remote; source нельзя считать
   production-deployed.
4. Runtime schema bootstrap и migration ownership расходятся.
5. Turnstile missing-token bypass в GPT Chat.

### Medium

1. Lead bot state in-memory и не имеет durable dedup.
2. Shared D1 binding увеличивает blast radius.
3. Stable external Telegram IDs являются PII, deletion policy отсутствует.
4. GPT message/lead retention не определён.
5. Legacy admin auth неоднороден.
6. Railway/Supabase/n8n live state не подтверждён.
7. Full Functions typecheck: 27 legacy errors.
8. Full lint: 70 errors и 12 warnings.
9. SEO international-link debt: 27/46/25.
10. Config schema drift между Env declarations, bindings, Vite и backend.
11. Public SEO job status использует possession of identifier как capability.

### Low/Hardening

1. Telegram Agents secret comparison не constant-time.
2. Некоторые legacy paths используют `Math.random` для non-secret IDs.
3. Нет автоматизированного gitleaks/Semgrep/Trivy gate.
4. Open PRs могут конфликтовать с local stage chain.

---

## 17. Readiness assessment

| Gate | Статус | Обоснование |
|---|---|---|
| P2.5 source completeness | Ready | code commit present, 586 tests pass |
| Architecture boundaries | Ready | 10/10, checker 0 violations, scoped lint pass |
| Local build/typecheck | Ready with legacy debt | root/backend pass; 27 legacy Functions errors |
| Security release | **Blocked** | tracked credential + dependency vulnerabilities |
| D1 migration readiness | Review required | `0013–0022` pending; bootstrap ownership mismatch |
| Cloudflare production | Not current | production source is `93fab39`, not local P2.5 |
| Agents webhook | Not ready | live route absent; no setup performed |
| P2.6 design start | Conditionally ready | only after source gate; identity→chat mapping and TTL policy first |
| Production deploy | **Not authorized** | requires explicit release task and blockers resolution |

Коротко: **P2.5 локально source-ready, но production/release не ready**.

---

## 18. Exact continuation instructions для следующего агента

### 18.1. Source gate

1. Открыть этот master handoff и governance docs.
2. Проверить authoritative repository и branch.
3. Зафиксировать текущий HEAD и `origin/main`.
4. Убедиться, что source commit P2.3 и relay являются ancestors.
5. Сохранить pre-existing untracked objects.
6. Проверить, что нет неожиданного production diff.
7. Повторить обязательный baseline file-by-file.

### 18.2. Security gate до release

Не публиковать release, пока не создана отдельно одобренная security task,
которая:

1. ротирует credential, записанный в `memory/test_credentials.md`;
2. удаляет credential material из tree;
3. очищает Git history безопасной согласованной процедурой;
4. уведомляет владельцев downstream clones/forks;
5. обновляет React Router;
6. обновляет Fastify dependency chain;
7. исправляет Turnstile fail-open;
8. добавляет secret/SAST/dependency gates;
9. повторяет тесты и production smoke.

Не выполнять ротацию «молча» в feature commit.

### 18.3. Реализованный P2.5 (справочно)

- Seller lifecycle — пара `(status, fulfillment_status)`: `placed`,
  `confirmed`, `cancelled`, `done`. Разрешены `placed → confirmed`,
  `placed → cancelled`, `confirmed → done`; `confirmed → cancelled`
  запрещён, поэтому компенсирующих движений склада не существует.
- `sotuvchi_inventory` — integer balance с optimistic version;
  `sotuvchi_inventory_moves` — append-only ledger.
- `available` требует строку баланса (fail-closed) и достаточный остаток;
  `preorder` не списывает; `unavailable` подтвердить нельзя.
- Confirm — один D1 batch (decrement + movement + переход + operation +
  notification intent) с вложенными guard'ами.
- Двойное списание закрыто conditional `fulfillment_status`, conditional
  inventory `version` и partial unique index `(order_id, type)`.
- Idempotency — trusted `requestId` в общей `sotuvchi_order_operations`.
- `sotuvchi_notifications` — payload-free durable outbox; renderer заново
  читает trusted order; delivery — at-least-once, exactly-once не
  заявляется; фактический Telegram-push не реализован.
- Seven closed-list seller tools; авторитет только из
  `OrgContext.actorId` + active owner membership + active store.
- Список заказов без контактов; detail отдаёт контакты владельцу магазина.

### 18.4. Реализованный P2.4 (справочно)

- FSM `sotuvchi-checkout` v1:
  `idle → awaiting_quantity → awaiting_name → awaiting_phone →
  awaiting_address → awaiting_confirmation → completed`, плюс `cancelled`.
  Состояние `expired` сознательно не добавлено: scheduler отсутствует.
- Workflow payload — только `{ orderId }`; PII живёт в `sotuvchi_orders`.
- Order aggregate — `sotuvchi_orders` + один `sotuvchi_order_items`
  (`UNIQUE(order_id)`), operations log `sotuvchi_order_operations`.
- Quantity `1..99`, имя `2..80`, телефон `+998`+9 цифр, адрес `5..240`.
- Idempotency по trusted `requestId` канала, ключ проверяется раньше
  FSM-состояния; чужой fingerprint fail-closed.
- Подтверждение атомарно перечитывает published product и цену, иначе
  fail-closed; при изменившейся цене требуется повторное подтверждение.
- Order number `S-XXXXXX`, unique в пределах store, opaque.
- Buyer-facing текст строится только из scalar Facts; имя и адрес не
  показываются, телефон маскируется.

### 18.5. P2.6 design gate

Перед кодом оформить:

- модель handoff-очереди и её связь с buyer session и storefront;
- durable mapping identity → chat reference, необходимый и для reply-моста,
  и для фактической доставки P2.5 notification intents;
- уведомление продавцу и его idempotency;
- reply-мост «ответ продавца → покупателю» и пометку авторства;
- TTL текста вопроса и удаление по истечении;
- поведение при duplicate Telegram update (второй handoff и второй ответ
  запрещены);
- политику событий/outbox (всё ещё открыта);
- RU и Uzbek Latin copy;
- отсутствие payments/CRM/analytics в scope.

### 18.6. Что не менять в P2.6

- Lead webhook.
- Javob webhook и Tahlil.
- GPT Chat/Railway.
- SEO/admin.
- Payments.
- Existing bot identities.
- Реализованный P2.4 checkout FSM и его инварианты.
- Реализованные P2.5 инварианты: однократное списание, fail-closed
  inventory для `available`, запрет `confirmed → cancelled`, payload-free
  notification row.
- `sotuvchi_orders.status` CHECK — расширение требует полного SQLite table
  rebuild отдельным одобренным change.
- Production migrations/webhooks без отдельного release task.
- P2.7+ features.

---

## 19. Команды для воспроизводимого старта

### 19.1. Source и governance

```powershell
cd F:\Claude\gptbot-repo
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ARCHITECTURE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\DECISIONS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ROADMAP.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\CURRENT_STATE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\TEST_MATRIX.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\KNOWN_ISSUES.md
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git rev-list --left-right --count origin/main...HEAD
git log -20 --oneline --decorate
```

### 19.2. Tests file-by-file

```powershell
$env:NODE_OPTIONS='--max-old-space-size=1400'
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
node --import tsx --test tests/intent-guard.test.ts
node --import tsx --test tests/direct-generator.test.ts
node --import tsx --test tests/indexnow-engine.test.ts
node --import tsx --test tests/yandex-research.test.ts
node --import tsx --test tests/gpt-backend.test.ts
node --import tsx --test tests/telegram-cost-calculator.test.ts
node --import tsx --test tests/canonical-url-redirects.test.ts
corepack yarn javob:eval
```

### 19.3. Typecheck/build/lint

```powershell
npx tsc -b
npx tsc -p tsconfig.functions.json --noEmit
corepack yarn build
Push-Location apps\gpt-backend
npm run typecheck
npm run build
Pop-Location
node --import tsx --test tests/agent-boundaries.test.ts
```

Functions typecheck ожидаемо не green до отдельной legacy cleanup task.
Следующий агент должен проверить, что error count/files не выросли.

### 19.4. Read-only production checks

Только при действующей Cloudflare authentication и без изменения state:

```powershell
npx wrangler d1 migrations list gptbot-ai-drafts --remote
npx wrangler pages deployment list --project-name ai-direct-pro-landing
```

Не запускать `d1 migrations apply`, `pages deploy`, `pages secret put` или
Telegram setup без отдельного явного разрешения.

### 19.5. Dependency audit

```powershell
npm audit --omit=dev
Push-Location apps\gpt-backend
npm audit --omit=dev
Pop-Location
```

Не использовать `npm audit fix --force` без review lockfile, breaking changes
и полной regression matrix.

---

## 20. Rollback и recovery

### 20.1. Source rollback P2.3

Если P2.3 ещё не deployed:

1. revert relay:
   `git revert fda702469f88d09768a56a53a7ebd8f41e34d506`;
2. revert code:
   `git revert 70bd1e05a7eb9ad47632933a052a63922c991978`;
3. не удалять nullable columns автоматически.

Перед любым revert проверить, не появились ли более новые commits, и не
использовать `reset --hard` в shared/user worktree.

### 20.2. Migration rollback

- `0013–0022` remote pending.
- Для additive `0020` безопасный operational rollback после применения —
  сначала code revert, nullable columns оставить.
- Для additive `0021` — сначала отключить checkout traffic и code revert,
  затем при необходимости удалить только пять её индексов и три таблицы
  (`sotuvchi_order_operations`, `sotuvchi_order_items`, `sotuvchi_orders`) в
  обратном порядке; shared store/catalog/session/workflow таблицы не трогать.
- Для additive `0022` — сначала отключить seller traffic и code revert, затем
  при необходимости удалить только её индексы и три таблицы
  (`sotuvchi_notifications`, `sotuvchi_inventory_moves`,
  `sotuvchi_inventory`) в обратном порядке. Колонку
  `sotuvchi_orders.fulfillment_status` оставить: её физическое удаление
  требует отдельного одобренного table rebuild.
- Физическое удаление columns в SQLite/D1 требует отдельного approved table
  rebuild migration.
- Для tables `0013–0019` destructive rollback не должен выполняться без backup,
  export и impact assessment.

### 20.3. Credential incident recovery

Поскольку credential уже tracked, простое удаление файла не завершает
recovery:

1. ротировать credential;
2. проверить audit logs;
3. удалить current material;
4. переписать history согласованным инструментом;
5. force-update remote только по incident runbook;
6. уведомить clone/fork owners;
7. invalidировать старые sessions/tokens при необходимости;
8. повторить secret scan.

### 20.4. Production rollback

Ни один deploy в ходе этого handoff не выполнялся, поэтому rollback этого
документа — обычный `git revert` documentation commit. Для будущего Agents
release rollback должен включать:

- exact previous Pages deployment;
- code/source commit;
- migration status;
- bot webhook target;
- bot secret versions;
- D1 backup/export;
- smoke tests каждого из трёх Telegram endpoints.

---

## 21. Фактическая audit attestation

На 2026-07-27 (обновлено после P2.5) подтверждено:

- 1 authoritative Git repository;
- 9 logical service groups;
- 2 independently deployable compute targets;
- 3 изолированных Telegram webhook products;
- 22 D1 migration file;
- 58 D1 tables;
- 10 Supabase tables;
- 23 Agents-related D1 tables;
- 13 Sotuvchi-related D1 tables с route authority;
- 63 Cloudflare API route modules;
- 90 explicit Cloudflare handler exports;
- 13 Railway route handlers;
- 112 configuration identifiers;
- 23 automated Node test suites;
- 586/586 test assertions passed (обязательный Agents-набор 508/508);
- 60-case Javob offline eval;
- `0013–0022` remote migrations pending;
- production Pages source не содержит локальные P2.4 и P2.5;
- production code, secrets, webhook, infra и migrations в ходе аудита, P2.4 и
  P2.5 не изменялись;
- push/deploy не выполнялись.

---

## 22. Copy-paste brief для следующего агента

> Продолжай GPTBot Agents Platform только из
> `F:\Claude\gptbot-repo`, сначала прочитай
> `docs/agents-platform/GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md`,
> `AGENTS.md` и весь governance-набор, проверь текущий HEAD, ancestry P2.5
> code `0915f059…`, P2.4 code `a418bcb2…`/relay `32112657…`, divergence с
> `origin/main` `93fab390733d3d5f…` и сохрани pre-existing untracked
> `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`; локально
> завершён P2.5 и 586/586 тестов зелёные (обязательный набор 508/508), но
> production всё ещё на `93fab39…`, D1 migrations `0013–0022` pending и
> Agents webhook не deployed; следующий продуктовый этап — только P2.6
> Human handoff: очередь, уведомление продавцу, reply-мост «ответ продавца →
> покупателю», TTL текста вопроса, закрытие и события, без payments, CRM,
> analytics и Mini App; спроектируй durable mapping identity → chat
> reference — он нужен и для reply-моста, и для фактической доставки P2.5
> notification intents; не переписывай checkout FSM и его инварианты (один
> item, один активный draft, atomic conditional placement, PII только в
> `sotuvchi_orders`) и инварианты P2.5 (однократное списание, fail-closed
> inventory для `available`, запрет `confirmed → cancelled`, payload-free
> notification row); до release обязательно вынеси в отдельную одобренную
> security task ротацию и history cleanup plaintext admin credential из
> `memory/test_credentials.md`, обновление уязвимых React Router/Fastify
> chains и исправление Turnstile fail-open; не трогай
> Lead/Javob/Tahlil/GPT/SEO/payment paths, не применяй migrations, не
> настраивай webhook, не deploy и не push без отдельного явного разрешения.
