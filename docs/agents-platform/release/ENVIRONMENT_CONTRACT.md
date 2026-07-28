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
Telegram usernames, a production `ADMIN_PASSWORD`, and crossed Telegram
identities fail closed.
