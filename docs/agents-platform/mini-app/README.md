# GPTBot Market Telegram Mini App

Status: `TELEGRAM_REVIEW_LIVE`

Implementation status: `MA_0_THROUGH_MA_8_RELEASED_FOR_NATIVE_REVIEW`

Mode: `DEDICATED_BOT_REVIEW_WITH_SERVER_AUTHORITY`

Candidate source base: `08138b7b6928c35d929a951695af0a769255e2b8`

Date: 2026-08-02

This package contains the original staged design, the reversible synthetic
candidate and its owner-authorized Telegram review release. The implementation adds the
`apps/market-mini-app` frontend and `/api/market/v1/*` BFF, reusing the
existing Sotuvchi application/domain services. The static app, BFF flags and
dedicated-bot launch integration are now live. It did not change D1 schema,
the lead bot/webhook, Railway, n8n, payments or real stores.

## Implementation candidate

- [Implementation log](./implementation/GPTBOT_MARKET_MINI_APP_IMPLEMENTATION_LOG.md)
- [Candidate and rollback](./implementation/GPTBOT_MARKET_MINI_APP_CANDIDATE_AND_ROLLBACK.md)
- [Telegram review release](./implementation/GPTBOT_MARKET_MINI_APP_TELEGRAM_RELEASE.md)
- [Machine-readable evidence](./implementation/evidence/candidate-manifest.json)
- [Accessibility evidence](./implementation/evidence/a11y-report.json)

## Decision in one paragraph

The Mini App is a new presentation surface, not a new marketplace. A dedicated
frontend build and Cloudflare Pages project should be created from this
repository, while a versioned `/api/market/v1/*` BFF remains in the existing
Cloudflare backend and calls the existing Sotuvchi application/domain
services. Telegram remains the entry, conversational assistant, notification,
handoff and fallback channel. The current bot stays canonical until each Mini
App stage has measured parity and a tested feature-flag rollback.

## Documents

1. [Vision](./GPTBOT_MARKET_MINI_APP_VISION.md)
2. [Current architecture](./GPTBOT_MARKET_MINI_APP_CURRENT_ARCHITECTURE.md)
3. [Target architecture](./GPTBOT_MARKET_MINI_APP_TARGET_ARCHITECTURE.md)
4. [Backend reuse matrix](./GPTBOT_MARKET_MINI_APP_BACKEND_REUSE_MATRIX.md)
5. [API map](./GPTBOT_MARKET_MINI_APP_API_MAP.md)
6. [Buyer and seller screen map](./GPTBOT_MARKET_MINI_APP_SCREEN_MAP.md)
7. [Authentication, security and threat model](./GPTBOT_MARKET_MINI_APP_AUTH_SECURITY.md)
8. [Telegram platform matrix](./GPTBOT_MARKET_MINI_APP_TELEGRAM_PLATFORM_MATRIX.md)
9. [Data, state, analytics and performance](./GPTBOT_MARKET_MINI_APP_DATA_STATE_ANALYTICS_PERFORMANCE.md)
10. [Migration and coexistence strategy](./GPTBOT_MARKET_MINI_APP_MIGRATION_STRATEGY.md)
11. [Master roadmap](./GPTBOT_MARKET_MINI_APP_MASTER_ROADMAP.md)
12. [Test strategy](./GPTBOT_MARKET_MINI_APP_TEST_STRATEGY.md)
13. [Risk register](./GPTBOT_MARKET_MINI_APP_RISK_REGISTER.md)
14. [Owner and engineering gates](./GPTBOT_MARKET_MINI_APP_OWNER_GATES.md)
15. [Proposed ADRs](./GPTBOT_MARKET_MINI_APP_PROPOSED_ADRS.md)
16. [Consolidated audit report](./GPTBOT_MARKET_MINI_APP_CONSOLIDATED_REPORT.md)

## Source reconciliation

The repository versions of the following requested sources were read in full:

- `GPTBOT_MARKET_PRODUCT_AUDIT.md`;
- `GPTBOT_MARKET_DESIGN_AUDIT.md`;
- `GPTBOT_MARKET_MARKETING_AUDIT.md`;
- `GPTBOT_MARKET_PRODUCTION_READINESS_GAP.md`;
- `GPTBOT_MARKET_MASTER_ROADMAP.md`;
- `GPTBOT_MARKET_CREATIVE_MATRIX.md`;
- `GPTBOT_MARKET_OWNER_INPUTS.md`;
- `STATE.json`, `HANDOFF.md`, `ARCHITECTURE.md`, `ROADMAP.md`,
  `CURRENT_STATE.md`, `KNOWN_ISSUES.md`, `TEST_MATRIX.md`, `DECISIONS.md`;
- current Sotuvchi, product, release, accessibility, trust and operations docs.

`GPTBOT_MARKETPLACE_MASTER_CHAT_HANDOFF_2026-08-01(1).md` was not present in
the repository or supplied attachments. Its status is `SOURCE_MISSING`; no
content has been inferred from its filename. The remaining live repository,
Git, production and rollback evidence is sufficient for this planning package.

## Relationship to the existing roadmap

The root [ROADMAP](../ROADMAP.md) remains the authority for the live platform
program and Store Pilot #1. This package does not rewrite it. The Mini App
roadmap adds a separate `MA-*` track:

- it refines the historical “Mini App later” concept into reversible stages;
- it does not replace R1 Store Pilot #1 evidence or its business-input gates;
- MA-0 through MA-8 may use only synthetic cohorts unless separately
  authorized;
- MA-9 requires the same real-seller authority and owner inputs as Store Pilot
  #1, plus Mini App-specific gates;
- MA-10 cannot reduce bot callbacks until measured parity is recorded.

## Governance invariants

- Backend and D1 remain the only business truth.
- No frontend field grants buyer, seller or platform-owner authority.
- No Mini App code may import a D1 binding or bot secret.
- The current bot is never removed as part of this roadmap.
- Auto-deploy remains disabled; future releases are manual exact-SHA only.
- Railway stays disconnected; n8n stays retired; payments stay out of scope.
- Physical D1 schema and migration ledger must be reconciled before any future
  migration command. Blind remote migration apply is prohibited.
