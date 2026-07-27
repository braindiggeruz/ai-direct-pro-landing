# CURRENT_STATE — фактическое состояние репозитория (2026-07-27, P2.3)

## Production boundary

- SEO-фабрика, web AI-chat, админка, Javob `@gptbot_javob_bot` и lead-бот
  `@aidirectprobot` не изменялись.
- Agents webhook, Sotuvchi migrations и setup не публиковались и не
  применялись. Push/deploy отсутствуют.
- Cloudflare Pages/Functions, D1 `GPTBOT_DRAFTS_DB`, Workers AI и KV остаются
  без инфраструктурных изменений.
- Добавлены, но не применены migrations `0018`, `0019`, `0020`.

## Sotuvchi manifest и routing

- Production manifest `sotuvchi` версии `1.2.0`; локали `ru`, `uz`;
  capabilities `store.onboarding`, `store.catalog`.
- AI selection disabled. Routing deterministic-first.
- Seller tools P2.2 сохранены. Buyer closed-list:
  `catalog.list`, `catalog.search`, `catalog.product.get`,
  `catalog.filter_price`.
- `agent_<opaque storefront code>` разрешается только trusted route lookup.
  Durable session связывает platform identity с org/store; follow-up не
  принимает tenant authority из текста/action.
- Endpoint orchestration-only; Platform не импортирует Sotuvchi; Telegram
  renderer не содержит buyer business logic.

## Buyer parser

Порядок:

1. type/length/control validation;
2. public Knowledge NFKC/lowercase/apostrophe/punctuation/space normalization;
3. conservative typo repair;
4. exact help/list;
5. integer price extraction;
6. one-product contextual follow-up;
7. RU, Uzbek Latin и mixed patterns;
8. explicit/bounded product-name search;
9. fail-closed `unknown`.

Closed intents:

- `catalog.list`;
- `catalog.search`;
- `product.price`;
- `product.availability`;
- `product.details`;
- `catalog.filter_price`;
- `catalog.help`;
- `unknown`.

Product query ограничен 120 символами и восемью unique tokens. Raw сообщение в
Catalog/DB/error не передаётся. Поддержаны:

- RU: list, «сколько стоит/какая цена», «есть ли/в наличии»,
  «расскажи/покажи», `до/дешевле`;
- UZ: `nima bor`, `qancha turadi`, `narxi qancha`, `bormi/mavjudmi`,
  `haqida ayting/ko‘rsating`, `arzonroq/gacha`, варианты апострофа;
- mixed: `Samsung bormi`, `Samsung естьmi`, `narxi сколько`,
  `qancha стоит`.

## Query и catalog invariants

- Category/product model, lifecycle, owner authorization, optimistic version,
  mutation idempotency и 20-product MVP limit P2.2 не ослаблены.
- Buyer видит только published product active store с active category или без
  category. Draft/archived/inactive/foreign rows скрыты.
- Catalog ranking: exact → prefix → all tokens → partial; stable normalized
  name/opaque ID tie-break.
- Price filter — только bounded non-negative integer UZS, без float, negative,
  currency conversion и USD assumptions. Stable order:
  price asc → normalized name → opaque ID.
- Search/list/filter выдают максимум пять cards за ответ. Exact strong result
  даёт одну полную card.

## Channel-neutral cards

- Platform `OutboundCard` содержит opaque ref, title, optional description,
  bounded fields и safe actions.
- Buyer card показывает только name, localized price, availability, bounded
  description и optional category.
- Не показывает org/store/SKU/version/media/raw row/storefront code.
- Допустимы только `Подробнее`, `Следующие товары`, `Назад к каталогу`.
  Buy/checkout/order actions отсутствуют.
- Telegram generic renderer создаёт plain text и safe callback buttons без
  HTML/Markdown.

## Facts и grounding

- Product Facts scalar-only и namespaced:
  `catalog.results.<n>.{id,name,price_minor,price_display,currency,
  availability,availability_display,description,category_name}`.
- Metadata: `catalog.query.intent`, result count/has-more/next-offset/full-card
  и safe result state.
- Exact card также получает singular `catalog.product.*`.
- RU price `100 000 сум`; UZ `100 000 so‘m`.
- Availability source:
  `available|unavailable|preorder`; localized display фиксирован кодом.
- Runtime structured composer валидирует message/card/action bounds. Card
  title, description и field values должны точно присутствовать в Facts;
  exact claims и числа проходят существующий strict grounding.
- Unsupported price/status/card field/number → rejected response; Telegram
  использует controlled channel fallback.
- Unknown/help не утверждает product/price/availability и показывает только
  допустимые примеры вопросов.

## Durable follow-up

- Migration/bootstrap `0020` добавляет только nullable:
  `last_product_id`, `last_intent`, `selection_request_key`, `selected_at`.
- Exact single-product result сохраняет opaque product ref и closed intent.
  Raw query/message/transcript/profile/contact/address не сохраняются.
- Session update идемпотентен по trusted request ID.
- Pronoun follow-up повторно проверяет route, store, category и published
  product в том же org/store. Missing/stale/foreign ref fail-closed.
- Conversation messages table и TTL/profile memory отсутствуют.

## Tenant, privacy и events

- Tenant source только Runtime `OrgContext` + stored session. Tool input с
  org/store override отклоняется общей Runtime guard.
- Buyer не имеет owner mutation authority; seller authorization остаётся
  membership/store-scoped.
- Product ref — server-generated opaque ID, bounded callback data и повторная
  same-store validation.
- Events P2.3 не добавлены до atomic outbox policy.
- Error classes content-free; tests используют только вымышленные fixtures.

## Migration и rollback

- `0020_sotuvchi_buyer_qa.sql` additive; runtime bootstrap повторяемый;
  destructive SQL отсутствует.
- Migration не применялась.
- Code rollback: relay revert, затем P2.3 code revert. Nullable columns можно
  безопасно оставить; физическое удаление требует отдельного SQLite table
  rebuild change.

## Проверенный baseline P2.3

- `npx tsc -b` — exit 0.
- Buyer Q&A 39/39; Catalog 54/54; Onboarding 28/28; Telegram Agents 41/41;
  Runtime 49/49; Workflow 39/39; Knowledge 33/33; AI 15/15; Tenancy 31/31;
  Events 20/20; Boundaries 10/10; compatibility 1/1; assistant 60/60;
  gpt-chat 15/15. Всего **435/435**.
- Functions typecheck: ровно 27 baseline legacy errors в шести старых файлах;
  новых platform/agents/channels/endpoint errors 0.
- Scoped ESLint exit 0; boundary violations 0; staged secret/PII/env scan 0;
  cached diff check clean.

## Сознательно отсутствует

- Cart, checkout, quantity, order/order items, inventory/reservation, buyer
  contact, address/delivery, payment, seller notification, operator/CRM,
  human handoff/reply bridge, analytics, public storefront и Mini App.
- AI fallback, recommendations by buyer profile, currency conversion,
  `100k/ming` parsing, catalog events и Knowledge product projection.

## Следующий этап

Только **P2.4 — Checkout workflow** после нового задания и проверки
`STATE.next_stage == "P2.4"`. P2.4 должен начинаться с PII/idempotency/FSM
design и полного 435-test baseline. Не начинать P2.5 inventory/seller order
operations, P2.6 human bridge, payments, CRM, deploy или production migration.

## Рабочая среда

Windows + PowerShell. Pre-existing untracked
`apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не изменять и не
добавлять в коммиты.
