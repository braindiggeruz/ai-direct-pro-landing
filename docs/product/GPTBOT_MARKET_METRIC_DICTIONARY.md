# GPTBot Market metric dictionary

Status: definition layer complete. It reuses the closed privacy-safe event
catalog; it does not add production event names.

North Star: **a useful grounded shortlist that leads to a qualified next
step**. “Useful” and “qualified” require evidence from allowed funnel events,
not raw messages or subjective AI scoring.

## Privacy contract

Never write raw query/message, Telegram/chat/user ID, username, phone, address,
callback payload, consent text or product free text to global analytics.
Tenant-scoped operational records remain subject to their domain retention and
authorization rules. Analytics dimensions are closed scalar allowlists.

## Buyer metrics

| Metric | Definition / denominator | Source | Privacy | Owner / decision | Limitation |
| --- | --- | --- | --- | --- | --- |
| Tagged start | allowed buyer-start event with approved source / all starts | closed event catalog | aggregate | growth owner / channel quality | deep link is not seller identity |
| Qualified search | supported catalog search / buyer starts | `searches` | aggregate | product owner / activation | no raw query retained |
| Useful result proxy | result shown followed by product view, compare, request start or handoff / results shown | existing funnel events | aggregate | product owner / shortlist quality | proxy, not satisfaction claim |
| Zero-result rate | zero results / searches | `zero_results`, `searches` | aggregate | catalog owner / coverage | reason taxonomy is bounded, no raw query |
| Product view rate | product views / results shown | `product_views` | aggregate | product owner / card clarity | repeated views may be same user |
| Compare rate | comparisons / results shown | `comparisons` | aggregate | product owner / decision support | does not prove purchase intent |
| Request start | checkout starts / useful result proxy | exact stats + allowed funnel | aggregate | product owner / conversion friction | request is not payment |
| Request completion | placed requests / checkout starts | exact order counters | tenant aggregate | seller/pilot owner / completion | no revenue meaning |
| Handoff | human handoff opened / results shown | exact handoff counter | tenant aggregate | support owner / missing facts | content stays out of global analytics |
| Seller response | answered handoffs / opened handoffs | exact counters | tenant aggregate | seller owner / service | SLA requires owner window |
| Qualified return | repeated qualified session within approved cohort / eligible participants | future cohort analysis over allowed events | aggregate | product owner / retention | not currently proven |

## Seller lifecycle metrics

| Metric | Definition | Source / privacy | Decision use / limitation |
| --- | --- | --- | --- |
| Application | owner-recorded interest receipt | private intake reference, no contact in Git | volume only after intake exists |
| Qualified | all pilot qualification gates pass | owner decision record | not store activation |
| Invited | server-issued invitation | trusted onboarding records | invitation is not authorization |
| Onboarding progress | completed controlled steps / required steps | onboarding state enum | no free-text analytics |
| Catalog accepted | validator pass plus catalog-owner sign-off | import evidence | no quality/sales guarantee |
| Product freshness | products within owner-approved freshness rule / published products | catalog timestamps | rule not yet selected; do not publish a value |
| Operational task completion | reviewed tasks / assigned tasks | pilot evidence log | workflow must be defined first |
| Response SLA | eligible seller responses within approved working window / eligible questions | handoff timestamps | owner must define clock/window |
| Stock corrections | approved stock corrections / reviewed stock alerts | inventory evidence | alert policy not yet selected |
| Continuation / WTP | explicit post-pilot owner decision | private owner review | never infer from usage alone |

## Guardrails

Wrong price, stale stock, duplicate effect, failed notification, seller timeout,
privacy incident, cross-tenant denial, schema failure and user support rate are
release guardrails. Current runtime has exact duplicate/idempotency, notification,
authorization and schema tests. Wrong-price, freshness and timeout publication
waits for owner-approved policies; absence of a number is not treated as zero.

The exact implemented event names and allowed scalar fields remain governed by
the existing Sotuvchi analytics catalog and its tests. This dictionary changes
interpretation, not the production allowlist.

