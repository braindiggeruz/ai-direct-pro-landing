# GPTBot Market operations kit

Status: controlled-pilot templates ready; role placeholders require owner
assignment. Never place private contacts or PII in Git.

## Daily review

1. Check store state; paused/suspended means no new requests.
2. Review open buyer questions before aggregate counts.
3. Review new and unresolved requests without exposing buyer PII outside the
   authorized seller view.
4. Confirm notification failures from exact delivery records.
5. Review catalog changes and owner-approved stock/freshness rules.
6. Record decisions, evidence references and next owner by role.

The current seller dashboard truthfully shows open questions, today’s placed
requests and published products. It explicitly does not display notification
or stale-stock zeros until their operational rules are configured.

## Incident severity

| Severity | Example | Immediate action | Release action |
| --- | --- | --- | --- |
| SEV-0 | secret/PII leak, auth bypass, cross-tenant access, duplicate order/inventory, destructive migration | stop production mutation; preserve evidence; notify `[INCIDENT_LEAD]` | rollback exact SHA where applicable; no resume without owner |
| SEV-1 | wrong price/stock reaches buyer, lost/duplicate notification, webhook mismatch, store accepts while paused | pause affected store/path; verify D1 and provider facts | fix, regression test, controlled canary |
| SEV-2 | seller silence, broken CTA, card media failure with text fallback | route to `[SUPPORT_OWNER]`; keep honest recovery | bounded fix in next safe release |
| SEV-3 | visual defect or non-blocking copy issue | log sanitized evidence | batch with product polish |

## Scenario playbooks

- Seller silence: do not promise a response time; show the buyer that the
  seller is next, allow recovery/support, escalate under the owner-defined SLA.
- Wrong price: pause affected product/store, verify catalog source, correct via
  authorized catalog owner, record exact before/after evidence, retest.
- Stale stock: do not infer zero; apply only an owner-approved freshness rule,
  pause or label affected products, request refresh.
- Notification failure: preserve exactly-once keys, inspect delivery record,
  retry only through the supported idempotent path, never create a second order.
- Duplicate fear: query idempotency/order-operation evidence read-only before
  any replay; explain the exact result without exposing contact data.
- Privacy complaint: stop unnecessary processing, route to `[PRIVACY_OWNER]`,
  preserve a minimal evidence reference, never paste raw conversation into Git.
- Pause/resume: only trusted authorized owner flow may change store state;
  verify checkout denial/availability before resume.
- Rollback: deploy recorded immutable previous source; do not apply remote D1
  migrations as a rollback shortcut.

## Status templates

Buyer: “Сейчас этот магазин не принимает новые заявки. Каталог можно
посмотреть, но оформление недоступно. Возобновить работу может владелец
магазина.”

Seller: “Магазин приостановлен. Новые заявки недоступны. Для возобновления
нужна авторизованная команда владельца; переключение режима не меняет права.”

Incident: “Мы приостановили затронутый путь и проверяем подтверждённые данные.
Не публикуем срок восстановления до верификации. Следующее обновление даёт
`[ROLE]` через согласованный канал.”

## Weekly review and evidence log

Review North Star proxy, zero results, request completion, handoffs, exact
failures and support themes without raw text. Every production decision log
must contain timestamp, release SHA/deployment, affected bounded scope, role
owner, sanitized evidence link, action, result and rollback decision.

