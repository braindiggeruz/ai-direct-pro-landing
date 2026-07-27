# Актуальный master handoff

Полная фактическая карта repository, services, Agents Platform, Telegram,
Sotuvchi, migrations, API, environment, tests, security, PII, production
readiness и точные инструкции продолжения:

[`GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md`](./GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md)

Этот файл ниже сохраняет stage-specific handoff P2.3. При расхождении
операционных сведений сначала сверяйте Git tree и `STATE.json`, затем
используйте master handoff как актуальную карту системы.

---

# GPTBot Agents — Handoff

## 1. Состояние

- Дата: 2026-07-27.
- Ветка: `main`.
- Исходный HEAD / P2.2 relay:
  `f6eeb2cdf74a978c4fd35d0c0a13d1315cc5c76b`.
- P2.2 code commit:
  `9373af8d0910c360620139e0e6d8913beeefbd0e`.
- P2.3 code commit:
  `70bd1e05a7eb9ad47632933a052a63922c991978`.
- HEAD после relay определяется последним metadata-only commit в `git log`;
  по D-006 `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA.
- Завершённый этап: **P2.3 — Sotuvchi Buyer Q&A**.
- Следующий этап: **P2.4 — Checkout workflow**.
- После relay рабочее дерево должно содержать только два pre-existing untracked
  объекта: `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`.
- Push, deploy, webhook setup и применение migration не выполнялись.

## 2. Что реализовано

1. Добавлен полностью deterministic-first closed-list parser:
   `catalog.list`, `catalog.search`, `product.price`,
   `product.availability`, `product.details`, `catalog.filter_price`,
   `catalog.help`, `unknown`.
2. Порядок parser фиксирован: bounded/control validation → public Knowledge
   normalization → conservative typo repair → exact list/help → integer price
   extraction → safe contextual follow-up → RU/UZ/mixed patterns → explicit
   search → bounded plain product name → unknown.
3. RU покрывает list, «сколько стоит/какая цена», «есть ли/в наличии»,
   «расскажи/покажи», «до/дешевле» и один pronoun follow-up.
4. Uzbek Latin покрывает `nima bor`, `qancha turadi`, `narxi qancha`,
   `bormi/mavjudmi`, `haqida ayting/ko‘rsating`, `arzonroq/gacha`; варианты
   `o‘/o'/oʻ` нормализуются существующим Knowledge API.
5. Mixed покрывает `Samsung bormi`, `Samsung естьmi`, `narxi сколько`,
   `qancha стоит` и смешанные product names без транслитерации.
6. Product query очищается до normalized bounded string, максимум 120 символов
   и восемь unique tokens; raw полное сообщение в Catalog не передаётся.
   Empty/long/control-bearing input и unsafe цена fail-closed.
7. Price filter принимает только bounded non-negative integer UZS (`100000`,
   `100 000`), без float, отрицательных значений, валютной конверсии и
   предположений о USD. Сортировка: price asc → normalized name → opaque ID.
8. Buyer read path видит только published products active store с active
   category или без category. Draft, archived, inactive store/category и
   foreign tenant скрыты.
9. Добавлены channel-neutral `OutboundCard`/`ProductCard`: title, bounded
   description, localized price, availability, optional category и только
   разрешённые actions `Подробнее`, `Следующие товары`, `Назад к каталогу`.
10. Generic Telegram renderer переводит card в plain text и safe bounded inline
    buttons; HTML/Markdown и buyer business logic в adapter отсутствуют.
11. Manifest версии `1.2.0` использует existing capability `store.catalog`,
    четыре buyer tools `catalog.list`, `catalog.search`,
    `catalog.product.get`, `catalog.filter_price`; AI selection остаётся
    disabled.
12. Structured tool composer проходит generic Runtime validation до delivery.
    Card title/description/field values обязаны буквально присутствовать в
    scalar Facts; claims и все числа продолжают проходить strict grounding.
13. Facts namespaced по результату:
    `catalog.results.<n>.{id,name,price_minor,price_display,currency,
    availability,availability_display,description,category_name}` плюс
    `catalog.query.intent` и bounded result metadata. Raw product rows нет.
14. Unknown возвращает только безопасные примеры допустимых вопросов, без цены,
    наличия, найденного товара, checkout/order или handoff side effect.
15. Exact single result сохраняет минимальный follow-up state в существующей
    storefront session: opaque `last_product_id`, closed `last_intent`,
    trusted request key и timestamp. Raw query/message/profile не сохраняются.
16. «А он есть?», «сколько он стоит?» и «подробнее» повторно проверяют active
    route/store/category и published same-store product. Stale/foreign/missing
    reference даёт safe help/no-result, не cross-tenant lookup.
17. Session mutation идемпотентна по trusted request ID; повтор Telegram update
    дополнительно блокируется существующим at-most-once channel dedup.
18. Добавлена additive migration `0020_sotuvchi_buyer_qa.sql` и runtime
    bootstrap parity для четырёх nullable columns. Conversation table нет.
19. Events не добавлены до atomic outbox policy.
20. Создан новый offline suite `tests/sotuvchi-buyer-qa.test.ts`: 39/39.

## 3. Архитектурные границы

- Buyer business logic находится только в
  `functions/agents/sotuvchi/buyer/**`.
- Buyer layer импортирует Platform contracts/Knowledge public APIs и Catalog
  public service/types; channel, Telegram API, legacy/Javob/lead/gpt-chat и raw
  platform stores не импортируются.
- Platform Runtime не импортирует Sotuvchi.
- Telegram endpoint только связывает catalog/domain/context/runtime; buyer SQL
  и parser в endpoint отсутствуют.
- Trusted authority остаётся:
  `agent_<opaque storefront code>` → server route lookup → durable session →
  server-side org/store context. User input не задаёт org/store/agent/code.
- Buyer tools read-only. Seller mutation tools сохранили owner membership,
  expected version и tenant-scoped conditional SQL.

## 4. Cards, Facts и grounding

- RU price: `100000 → 100 000 сум`; UZ: `100 000 so‘m`.
- Availability source allowlist:
  `available|unavailable|preorder`.
- RU labels: `В наличии|Нет в наличии|Под заказ`.
- UZ labels: `Mavjud|Mavjud emas|Buyurtma asosida`.
- До пяти cards на ответ; description не длиннее 240 символов.
- Opaque product ID используется только как bounded card/action ref и всегда
  повторно валидируется внутри trusted storefront. Org/store/SKU/version/media
  и raw DB fields пользователю не показываются.
- Unsupported price, status, card field или число без Facts отклоняет response.
  Telegram получает существующий controlled fallback при Runtime rejection.

## 5. Migration `0020`

Добавлены nullable columns к `sotuvchi_storefront_sessions`:

- `last_product_id`;
- `last_intent`;
- `selection_request_key`;
- `selected_at`.

Migration additive, destructive SQL отсутствует, raw messages и transcript
таблицы не создаются. Она не применялась local/production. Operational rollback:
сначала откатить code/relay; nullable columns безопасно оставить. Физическое
удаление columns в SQLite требует отдельного table rebuild change и не входит в
rollback P2.3.

## 6. Проверки

- Исходный baseline до изменений: прежние 396/396; `npx tsc -b` exit 0;
  Functions-config ровно 27 legacy errors в шести старых файлах.
- После изменений:
  - Buyer Q&A 39/39.
  - Catalog 54/54; Onboarding 28/28; Telegram Agents 41/41.
  - Runtime 49/49; Workflow 39/39; Knowledge 33/33; AI 15/15.
  - Tenancy 31/31; Events 20/20; Boundaries 10/10.
  - Telegram compatibility 1/1; assistant 60/60; gpt-chat 15/15.
  - Всего: **435/435**.
  - `npx tsc -b` exit 0.
  - Functions typecheck exit 2: ровно 27 legacy errors в прежних шести
    legacy-файлах; новых platform/agents/channels/endpoint errors 0.
  - Scoped ESLint exit 0; boundary violations 0.
  - Staged token/API key/private data/email/phone/env scan 0.
  - `git diff --cached --check` clean.
- Из-за общего Windows memory pressure один ранний параллельный launch не
  стартовал; обязательный gate затем выполнен file-by-file и полностью зелёный.

## 7. Что сознательно отсутствует

- Cart, checkout, quantity, contact collection, order/order items, delivery
  address, payment, inventory reservation/ledger, notification to seller,
  operator/CRM, human reply bridge, public storefront и Mini App.
- Кнопка «Купить» и эквивалент отсутствуют.
- Profile-based recommendations, AI intent fallback, AI-generated catalog
  claims, currency conversion и `100k/ming` shorthand отсутствуют.
- Catalog/Buyer events и Knowledge projection отсутствуют до atomic outbox.
- Migrations `0018/0019/0020`, webhook setup, push и deploy не выполнялись.
- Javob, lead bot, gpt-chat, SEO, billing и unrelated production paths не
  менялись.

## 8. Следующая задача

Только **P2.4 — Checkout workflow** после нового явного задания.

Следующий агент обязан:

1. Прочитать platform docs и проверить:
   `last_completed_stage == P2.3`, `next_stage == P2.4`,
   `last_commit == 70bd1e05a7eb9ad47632933a052a63922c991978`.
2. Проверить code/relay ancestry, clean tracked tree и два сохранённых untracked
   объекта; до изменений запустить полный 435-test baseline.
3. Спроектировать отдельный persistent checkout FSM поверх trusted storefront
   и выбранного published product, не превращая buyer parser/session в order
   storage.
4. Явно определить PII policy для имени/телефона/адреса, idempotent order
   creation и restart/concurrency semantics до добавления write path.
5. Не начинать P2.5 inventory/order seller operations, P2.6 human reply bridge,
   payments, CRM, Mini App, deploy или production migration.

## 9. Команды для старта P2.4

```powershell
cd F:\Claude\gptbot-repo
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ARCHITECTURE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ROADMAP.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\CURRENT_STATE.md
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

## 10. Rollback

1. Если P2.3 relay создан, `git revert <P2.3-relay-SHA>`.
2. Затем `git revert 70bd1e05a7eb9ad47632933a052a63922c991978`.
3. Migration `0020` не применялась. Если будет применена отдельно, безопасный
   rollback — оставить nullable columns после code revert; table rebuild только
   отдельным одобренным operations change.
