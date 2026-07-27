# Актуальный master handoff

Полная фактическая карта repository, services, Agents Platform, Telegram,
Sotuvchi, migrations, API, environment, tests, security, PII, production
readiness и точные инструкции продолжения:

[`GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md`](./GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md)

Этот файл ниже сохраняет stage-specific handoff P2.4. При расхождении
операционных сведений сначала сверяйте Git tree и `STATE.json`, затем
используйте master handoff как актуальную карту системы.

---

# GPTBot Agents — Handoff

## 1. Состояние

- Дата: 2026-07-27.
- Ветка: `main`.
- Исходный HEAD этапа (документационный commit после P2.3 relay):
  `eeece134bf373434dc4e8508c53be408c93b2d96`.
- P2.3 code commit:
  `70bd1e05a7eb9ad47632933a052a63922c991978`.
- P2.3 relay commit:
  `fda702469f88d09768a56a53a7ebd8f41e34d506`.
- P2.4 code commit:
  `a418bcb2d9886fa1d9d42cfbcecd39c6f9ac18ea`.
- HEAD после relay определяется последним metadata-only commit в `git log`;
  по D-006 `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA.
- Завершённый этап: **P2.4 — Sotuvchi Checkout workflow**.
- Следующий этап: **P2.5 — Orders/inventory**.
- После relay рабочее дерево должно содержать только два pre-existing untracked
  объекта: `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`.
- Push, deploy, webhook setup и применение migration не выполнялись.

## 2. Что реализовано

1. Добавлен модуль `functions/agents/sotuvchi/checkout/**`: types, errors,
   validation, schema, store, workflow, service, facts, responses, runtime
   port, tools, rules, barrel.
2. Declarative FSM `sotuvchi-checkout` v1 на существующем P1.2 Workflow Engine:
   `idle → awaiting_quantity → awaiting_name → awaiting_phone →
   awaiting_address → awaiting_confirmation → completed`, плюс `cancelled` из
   любого нетерминального состояния. Таймеров и `expired` нет.
3. Workflow payload содержит только `{ orderId }`; buyer PII в
   `workflow_instances`/`workflow_transitions` не попадает.
4. Additive migration `0021_sotuvchi_checkout.sql` и структурно эквивалентный
   runtime bootstrap создают `sotuvchi_orders`, `sotuvchi_order_items`,
   `sotuvchi_order_operations` и пять индексов.
5. `idx_sotuvchi_order_items_single` (UNIQUE order_id) физически запрещает
   второй item; `idx_sotuvchi_orders_active_draft` (partial UNIQUE) — один
   активный draft на buyer session.
6. Table-level CHECK запрещает `placed` без имени, телефона, адреса, суммы и
   `placed_at`.
7. Checkout стартует только с trusted action `buyer-checkout.<productId>` на
   полной карточке orderable товара; свободный текст его не открывает.
8. Product eligibility проверяется на старте и повторно на подтверждении:
   published, active store, active или отсутствующая category, availability
   `available|preorder`. `unavailable`, draft, archived, чужой store и
   inactive category fail-closed.
9. Цена читается только из Catalog. На финальном подтверждении цена
   перечитывается; при изменении заказ остаётся draft, snapshot обновляется,
   покупатель получает пометку и подтверждает повторно.
10. Placement — один D1 batch: conditional UPDATE (`status='draft'`, версия,
    buyer session, непустые контакты, живой published product с той же ценой)
    плюс operation insert.
11. Валидация: quantity целое `1..99` (из текста только ASCII-цифры), имя
    `2..80` Unicode без control chars, телефон `+998` + девять цифр в E.164,
    адрес `5..240` символов.
12. Order number `S-` + шесть символов `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`,
    unique в пределах store, до пяти попыток, без org/store/user/row id.
13. Idempotency по trusted `requestId` канала в `sotuvchi_order_operations`;
    ключ проверяется раньше FSM-состояния, поэтому повтор возвращает
    сохранённый результат. Тот же ключ с другим fingerprint fail-closed.
    Fingerprint не содержит PII.
14. Manifest поднят до `1.3.0`, добавлены capability `commerce.order`, tool
    `checkout.start`, rule `buyer-checkout-start` (priority 105) и workflow
    `sotuvchi-checkout`.
15. Telegram endpoint резолвит active checkout сервером и подставляет
    `activeWorkflow`; composite workflow port направляет ход владельцу
    instance, composite domain port — checkout-операции.
16. Buyer-facing вывод строится из scalar Facts: имя и адрес не
    эхо-показываются, телефон только `+998 ** *** ** NN`.
17. Действия ограничены `Оформить`, `Продолжить`, `Подтвердить`, `Отменить`;
    оплаты, управления заказом, оператора и остатков нет.
18. Создан offline suite `tests/sotuvchi-checkout.test.ts`: 36/36.
19. Обновлены два stage-scoped assertion в P2.1/P2.2 suites (capabilities и
    закрытый список tools) — они прямо описывали отсутствие commerce и
    заменены на P2.4-реальность без ослабления проверки.
20. Events не добавлены до atomic outbox policy.

## 3. Изменённые файлы

- `functions/agents/sotuvchi/checkout/**` — новый домен checkout.
- `functions/agents/sotuvchi/manifest.ts` — версия, capability, tool, rule,
  workflow.
- `functions/agents/sotuvchi/index.ts` — реэкспорт checkout.
- `functions/agents/sotuvchi/buyer/responses.ts` — действие `Оформить` на
  полной карточке orderable товара.
- `functions/api/telegram/agents.ts` — checkout service, composite workflow и
  domain ports, серверный resolve active checkout.
- `migrations/0021_sotuvchi_checkout.sql` — additive migration.
- `tests/sotuvchi-checkout.test.ts` — новый suite.
- `tests/sotuvchi-catalog.test.ts`, `tests/sotuvchi-onboarding.test.ts` —
  обновлены только manifest-assertions.

## 4. Архитектурные решения

`D-018` в `DECISIONS.md`: single-product persistent checkout, immutable
Catalog snapshot и PII-minimal order placement.

## 5. Что сознательно не сделано

- Корзина и второй item, inventory reservation и списание остатка.
- Seller order management, уведомление продавцу, confirm/cancel/done
  продавцом.
- Payment link и провайдеры (Click/Payme), CRM, human handoff и reply bridge.
- Mini App, публичная веб-витрина, внешние службы доставки, рекомендации,
  свободный AI-commerce.
- Timer/cron и состояние `expired`, analytics events.
- Применение migrations, webhook setup, push и deploy.

## 6. Проверки

- `npx tsc -b` — exit 0 (до и после изменений).
- Обязательный набор: checkout 36/36 (new), buyer-qa 39/39, catalog 54/54,
  onboarding 28/28, telegram-agents-webhook 41/41, platform-runtime 49/49,
  platform-workflow 39/39, platform-knowledge 33/33, platform-ai 15/15,
  platform-tenancy 31/31, platform-events 20/20, agent-boundaries 10/10,
  telegram-channel-compat 1/1, telegram-assistant 60/60, gpt-chat 15/15 —
  **471/471**.
- Дополнительные repository suites: intent-guard 16, direct-generator 13,
  indexnow-engine 11, yandex-research 11, gpt-backend 17,
  telegram-cost-calculator 6, canonical-url-redirects 4 — 78/78.
  Полный итог **549/549**.
- `npx tsc -p tsconfig.functions.json --noEmit` — exit 2, ровно 27 legacy
  errors в шести прежних файлах; новых errors в platform/agents/channels/
  endpoint нет.
- `npx tsx scripts/check-agent-boundaries.ts` — 0 violations.
- Scoped ESLint по Sotuvchi/endpoint/channel/contracts/runtime/test — exit 0.
- `git diff --cached --check` — clean; staged secret/PII/env scan — 0;
  `memory/test_credentials.md` в staged changes отсутствует.

## 7. Известные проблемы

- Существовали до этапа: 27 legacy Functions errors, глобальный ESLint-долг,
  `gptbot-audit/` и Emergent-скаффолдинг, отсутствие cron, plaintext admin
  credential в tracked `memory/test_credentials.md` (critical, требует
  отдельной задачи ротации).
- Появились в этапе: не выявлено. Прерывание между domain write и workflow
  transition оставляет prompt на прежнем шаге; повтор того же значения
  идемпотентен и самовосстанавливается.
- Внешние блокеры: Click/Payme, фискальные чеки, remote D1 migrations
  `0013–0021` pending, Agents webhook не настроен.

## 8. Следующая задача

Только **P2.5 — Orders/inventory** после нового явного задания.

Следующий агент обязан:

1. Проверить `last_completed_stage == P2.4`, `next_stage == P2.5`,
   `last_commit == a418bcb2d9886fa1d9d42cfbcecd39c6f9ac18ea`.
2. Проверить ancestry code/relay, clean tracked tree и два сохранённых
   untracked объекта; до изменений выполнить baseline 471/471.
3. Строить inventory_moves и seller order management поверх существующих
   `sotuvchi_orders`/`sotuvchi_order_items`, не переписывая checkout FSM.
4. Заранее определить политику двойного списания остатка, atomic
   inventory+order write и уведомление продавцу.
5. Не начинать P2.6 human bridge, payments, CRM, Mini App, deploy или
   production migration.

## 9. Acceptance criteria следующего этапа

- Остаток не списывается дважды при повторном подтверждении и duplicate
  update.
- Продавец получает заказ и может подтвердить/отменить/завершить его в
  пределах своего org/store.
- Все P2.4 числа выше не уменьшены; новый suite зелёный.
- Functions gate — те же 27 legacy errors; scoped ESLint 0; boundary checker
  0 violations.

## 10. Команды для старта P2.5

```powershell
cd F:\Claude\gptbot-repo
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\CURRENT_STATE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\DECISIONS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\TEST_MATRIX.md
git status --short
git branch --show-current
git rev-parse HEAD
git log -15 --oneline
git diff
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b
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
npx tsx scripts/check-agent-boundaries.ts
```

## 11. Риски

- Нельзя ослаблять условный SQL подтверждения: он единственная атомарная
  защита от placement по устаревшей цене или недоступному товару.
- Нельзя переносить buyer PII в workflow payload, operation log, события или
  логи.
- Нельзя разрешать второй item или второй активный draft: это ломает
  инварианты P2.4 и будущие inventory-операции.
- Нельзя менять существующие storefront session и catalog контракты P2.2/P2.3.

## 12. Rollback

1. Если P2.4 relay создан, `git revert <P2.4-relay-SHA>`.
2. Затем `git revert a418bcb2d9886fa1d9d42cfbcecd39c6f9ac18ea`.
3. Migration `0021` не применялась. Если будет применена отдельно, безопасный
   rollback — отключить checkout traffic и удалить только пять её индексов и
   три таблицы в обратном порядке.
