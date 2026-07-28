# Production environment contract

This is a names-only contract. It deliberately contains no credential values,
value fragments, hashes of values, or provider-exported configuration.

The machine-readable authority is
`config/production-env.schema.json`. Every entry records:

| Field | Meaning |
|---|---|
| Name | Exact binding or environment-variable name |
| Runtime | Cloudflare Pages Functions, Railway backend, Vite build, or shared |
| Required | Whether R1 is blocked when it is absent |
| Secret | Whether the value must use a provider secret mechanism |
| Purpose | The sole approved consumer purpose |
| Validation | Presence/shape check that never echoes the value |
| Owner | Operational owner |

The contract covers Cloudflare Pages Functions and D1, GPT Chat, Turnstile,
the Railway gateway/backend, OpenRouter, admin authentication, Telegram Lead,
Javob/Tahlil and Agents/Sotuvchi flows, scheduled automation, payments,
analytics-adjacent build configuration, and optional SEO integrations.

## Automation runtime boundary

- `AUTOMATION_QUEUE` is a producer binding shared by authenticated Pages
  Functions and the dedicated automation Worker.
- `AUTOMATION_DLQ` is a Worker-only dead-letter Queue binding and must be
  distinct from the primary Queue.
- `FIRST_PARTY_AUTOMATION_ENABLED` is a closed `true`/`false` flag. Repository
  defaults are disabled; enabling it requires the controlled stage gates.
- `N8N_INGEST_ENABLED` is a closed optional legacy flag. Missing or `false`
  disables the endpoint. `true` is allowed only for a verified legacy
  ROTATED path.
- `N8N_INGEST_TOKEN`, `N8N_WEBHOOK_SECRET` and `CRON_SECRET` are optional
  legacy names after verified retirement. Their absence does not prove
  retirement; the external RETIRED evidence disposition does.

Bindings are validated by name and shape only. This document neither records
provider values nor claims that production Queue, DLQ, Worker, Cron or D1
migration resources exist.

## Identity boundaries

- Lead uses `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`.
- Javob uses `TELEGRAM_ASSISTANT_BOT_TOKEN` and its matching webhook secret.
- Tahlil is currently a separate transcript-analysis business flow inside the
  Javob transport; it is not represented as a fabricated fourth bot. Its model
  and retention controls remain distinct.
- Agents/Sotuvchi uses only `TELEGRAM_AGENTS_*` and the canonical start payload
  `agent_seller`.

Agents credentials must never equal or substitute for Lead or Assistant
credentials. A missing public Agents username blocks R1. It does not invalidate
the local R0.4 preparation.

## Validation

`scripts/release/env-contract.ts` validates the contract structure and accepts
an in-memory environment map for R1 checks. Reports contain only variable names,
presence state, and safe reasons. Placeholder markers, non-HTTPS URLs, invalid
Telegram usernames, non-boolean feature flags, a production `ADMIN_PASSWORD`,
and crossed Telegram identities fail closed.
