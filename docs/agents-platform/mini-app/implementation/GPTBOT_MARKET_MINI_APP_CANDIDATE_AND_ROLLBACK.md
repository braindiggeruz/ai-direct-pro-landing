# GPTBot Market Mini App synthetic candidate and rollback

Historical candidate record. It was superseded on 2026-08-02 by the
[Telegram review release](./GPTBOT_MARKET_MINI_APP_TELEGRAM_RELEASE.md). The
statements below describe the pre-release boundary at the time it was built.

Date: 2026-08-02.

Branch: `feature/gptbot-market-mini-app-synthetic-candidate`.

## Candidate boundary

- Separate static build: `apps/market-mini-app/dist`.
- Existing backend only: `/api/market/v1/*` Pages Functions BFF.
- Existing D1 binding and Sotuvchi application/domain services; no migration.
- Existing dedicated agents bot only; lead-capture webhook and token untouched.
- All four Market flags default off. No public URL, BotFather menu, DNS, D1,
  production secret, production deployment or public cutover was changed.
- Synthetic UI transport is development-only and rejected from the production
  bundle by the contract suite.

## Candidate checks

- Functions TypeScript check.
- Independent Mini App `npm ci`, unit tests, TypeScript and Vite production
  build.
- Telegram HMAC vectors, session tamper/expiry, signed media handles, origin,
  transport isolation and production-bypass contract tests.
- Axe WCAG 2.2 AA audit on buyer home and seller dashboard.
- 320 px, 390 px and 200% text overflow checks; interactive target geometry.
- Real browser synthetic journeys: product detail → checkout step and seller
  order detail → idempotent versioned confirmation.
- Root regression, import-boundary suite, secret scan and `git diff --check`.

Machine-readable evidence is in `implementation/evidence/`.

## Enablement order after owner gates

1. Provision a non-production bot/token and dedicated 32+ byte session secret.
2. Configure an exact preview origin in `MARKET_MINI_APP_ORIGINS`.
3. Deploy the static app and BFF revision to preview only.
4. Enable global + buyer flag for synthetic allowlisted identities.
5. Run native Telegram iOS/Android RU checks and native Uzbek sign-off.
6. Enable seller reads for a verified synthetic seller.
7. Enable seller commands last and verify notification/outbox parity.
8. Configure BotFather/DNS/public URL only after the release gate is signed.

## Rollback

Before public deployment, rollback is simply to leave all flags off and discard
the preview/candidate; the current landing and Telegram bot remain unchanged.

After a future preview deployment:

1. Set `MARKET_MINI_APP_SELLER_COMMANDS_ENABLED=false` first.
2. Set `MARKET_MINI_APP_SELLER_READS_ENABLED=false`, then buyer/global off.
3. Remove the Mini App menu URL in BotFather if it was configured.
4. Roll back the static Mini App Pages project to its prior deployment.
5. Roll back gptbot.uz Pages Functions to the recorded pre-Mini-App deployment.
6. Do not roll back D1: this candidate has no schema migration; domain writes
   remain valid bot-originated Sotuvchi records.
7. Verify `/api/telegram/agents` and the protected lead-capture webhook remain
   healthy, then record the rollback in the production change ledger.

A read-only re-query on 2026-08-02 confirmed production deployment
`68747046-8e1e-492a-8b81-dc4e4065916f` (source `08c2156`) and rollback
deployment `d9ca163e-947b-40ba-856d-8143308c8402` (source `c670e4e`). They must
still be re-queried immediately before any future production operation; this
candidate did not deploy or use them.
