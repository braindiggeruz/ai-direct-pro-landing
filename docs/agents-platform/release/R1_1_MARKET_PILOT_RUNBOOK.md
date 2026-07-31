# R1.1 Market controlled synthetic-pilot runbook

Status: pre-deployment procedure. No step below is evidence that it ran.

This runbook is the release authority for the R1.1 product-quality sprint. It
supersedes the historical P2.7/R1 procedures for this release only. R1.1 uses
the existing dedicated `@gptbot_market_bot` identity and the one approved
synthetic pilot store. It does not onboard a real store, use a real brand,
enable payment/delivery, publish a marketplace, reconnect Railway, restore
n8n, or enable automatic publication/deployment.

## 1. Release invariants

- Deploy only a reviewed commit reachable from `main`; record its full SHA.
- Cloudflare Pages remains a Direct Uploads project. A Git push alone does not
  deploy production.
- Apply only migrations `0026` through `0030`, in order, after proving
  migrations through `0025` and a fresh backup.
- Never place a bot token, webhook secret, account token, buyer contact,
  Telegram identifier or secret fingerprint in Git, logs or this document.
- `scripts/sotuvchi-pilot-check.ts`, metadata setup and fixture generation are
  read-only by default.
- The product fixture is append-only and synthetic. Existing products are not
  deleted, archived or rewritten.
- A production order is created only by the operator's explicit Telegram
  canary and uses synthetic contact/delivery values.
- Any tenant leak, invented product fact, duplicate logical order, double
  stock decrement, PII leak or protected-bot identity mismatch is a hard stop.

## 2. Required source gates

From the canonical repository:

```powershell
git status --short --branch
git fetch origin
git merge-base --is-ancestor origin/main HEAD
npm run market:fixture
npx tsx scripts/release/migration-rehearsal.ts
npx tsx scripts/check-agent-boundaries.ts
npx tsc -b
npx tsc -p tsconfig.functions.json --noEmit
npm run scan:secrets
git diff --check
```

Run the complete repository test corpus, production dependency audits, root
build, backend typecheck/build and Pages Functions compilation. Record exact
counts in `TEST_MATRIX.md`. The worktree must be clean before merge and again
before the production build.

An independent code/security review must cover:

- Telegram update reservation, rate limiting, retry and terminal-error paths;
- tenant/store authorization for catalog, comparison, checkout and handoff;
- order and inventory idempotency;
- analytics payload projection and Owner Control Center PII boundaries;
- additive migration safety and fixture SQL;
- absence of provider dependency in the deterministic buyer path.

## 3. Read-only production preflight

1. Verify `getMe` resolves exactly to `@gptbot_market_bot` and never to the
   protected Lead/Javob identities.
2. Verify the webhook URL is the fixed `/api/telegram/agents` endpoint and
   record only match/no-match, pending count and error presence.
3. Verify one active synthetic pilot store exists and capture its exact
   organization/store IDs in the protected operator log, not in Git.
4. Record counts for categories, published products, inventory, orders,
   notifications, handoffs and pilot-state rows.
5. Confirm no real store, real product/brand, real buyer data, live payment or
   live delivery exists.
6. Record the current production Pages deployment ID and exact source SHA as
   the rollback target.
7. Confirm Pages auto-deploy remains disabled, Railway remains disconnected,
   the legacy SEO draft-generation scheduler remains disabled, first-party
   automation remains the sole content-generation path and n8n remains
   retired. The Search Pulse workflow inherited from current `main` may submit
   only already-published eligible URLs; it must not create or publish content.

## 4. Backup and migration

Create a timestamped directory outside Git. Export the remote D1 database
before the first write, record its SHA-256 in the protected operator log and
prove the export is readable with `PRAGMA integrity_check`.

Use database name `gptbot-ai-drafts` from the reviewed `wrangler.toml`. Do not
infer or create another database.

Before each non-repeatable migration, inspect the target table:

- `0026`: the four buyer-session columns must all be absent;
- `0027`: `search_terms_json` and `specifications_json` must both be absent;
- `0028`: both comparison tables/indexes must be absent;
- `0029`: the order comment column must be absent;
- `0030`: its three reliability tables/indexes must be absent.

Apply exactly one file at a time with `wrangler d1 execute --remote --file`.
Stop immediately on an unexpected existing subset, checksum mismatch or
failed statement. Do not improvise a schema repair. Re-run read-only schema,
foreign-key and integrity checks after all five migrations.

The release manifest is
`docs/agents-platform/release/MIGRATION_MANIFEST.json`; it covers `0013` through
`0030` with exact normalized SHA-256 values and keeps
`production_apply_authorized=false` until this runbook reaches the write gate.

## 5. Synthetic catalog fixture

Validate locally:

```powershell
npm run market:fixture
```

Resolve the approved organization/store IDs from the protected operator log.
Generate SQL outside Git; the exact store ID must also be supplied as the
confirmation:

```powershell
npx tsx scripts/market-synthetic-fixture.ts sql `
  --org-id="$env:R11_PILOT_ORG_ID" `
  --store-id="$env:R11_PILOT_STORE_ID" `
  --confirmation="$env:R11_PILOT_STORE_ID" `
  --output="$env:R11_FIXTURE_SQL"
```

The output contains only guarded `INSERT OR IGNORE` writes and no
`UPDATE`, `DELETE`, `REPLACE`, archive or schema statement. It intentionally
omits explicit `BEGIN/COMMIT` because D1 file import manages execution. A
partially interrupted import is safely resumed by applying the exact same file
again.

Do not apply the generated SQL yet. Keep it outside Git until the exact
application SHA is deployed in section 6; this prevents the previous
product-flooding `/start` behavior from seeing the expanded fixture.

After the exact application SHA is deployed and its endpoint health passes,
apply the fixture:

```powershell
npx wrangler d1 execute gptbot-ai-drafts `
  --remote --file="$env:R11_FIXTURE_SQL" --yes
```

Postconditions:

- all 36 `r11-product-*` products and six `r11-cat-*` categories exist once;
- 32 fixture inventory rows and 32 initial movements exist once;
- every fixture description includes the RU/UZ synthetic disclosure;
- 29,999 / 30,000 / 30,001 budget boundaries are present;
- no order, notification or handoff was created by the import;
- pre-existing synthetic rows and their state are unchanged;
- a second apply produces identical counts.

## 6. Merge, build and Pages deployment

1. Fetch `origin/main` and integrate it before the final gate.
2. Merge the reviewed feature branch to local `main`; do not rewrite history.
3. Run the complete gates again on the exact merge SHA.
4. Push the exact merge SHA to `origin/main`.
5. Build from the clean pushed SHA.
6. Deploy the exact `dist` with `wrangler pages deploy`, project
   `ai-direct-pro-landing`, branch `main`, and the full commit hash.
7. Verify the returned deployment is production, record its ID/immutable URL,
   and verify its source hash matches the pushed SHA.

Do not rely on GitHub auto-deployment and do not create a second Pages project.

## 7. Telegram metadata and webhook

The code-owned metadata advertises only implemented commands:
`/start`, `/catalog`, `/orders`, `/help`, `/language`.

Run identity/status and dry-runs first:

```powershell
npx tsx scripts/telegram-agents-setup.ts identity
npx tsx scripts/telegram-agents-setup.ts status
npx tsx scripts/telegram-agents-setup.ts metadata
npx tsx scripts/telegram-agents-setup.ts setup
```

Only after exact identity, deployed endpoint and secret-name checks pass:

```powershell
npx tsx scripts/telegram-agents-setup.ts setup --apply
```

The apply sets default/Russian/Uzbek commands, full descriptions and short
descriptions, then the fixed webhook. Avatar setup is a manual BotFather
action and is not a code-release blocker.

## 8. Production canary

Use only the operator's test identities and clearly synthetic values.

Before the walkthrough, record the privacy-safe aggregate
`telegram_agent_update_metrics.processing_ms` baseline. After deployment,
send one ordinary text search and compare the newest completed metric. Do not
query or copy raw Telegram identifiers or messages. A typing action is only
feedback; measure completion separately and record whether the first result
felt faster.

1. `/start` returns one concise home message, not a product flood.
2. Open the catalog, traverse category/product/back/home and switch RU/UZ.
3. Search by Russian title and Uzbek Latin alias.
4. Test no-result and ambiguous requests; neither may invent a product.
5. Enter a 30,000 UZS budget and verify 29,999 and 30,000 qualify while
   30,001 does not.
6. Compare two products; only verified fields may be displayed and missing
   specifications must remain explicitly unknown.
7. Create one synthetic order, replay the identical update and verify one
   logical order and one seller notification.
8. Confirm it once and verify inventory decrements exactly once; replay must
   not decrement again.
9. Test buyer `/orders`, seller status action and one handoff/reply.
10. Verify analytics/OCC aggregates, Telegram latency/errors, seller SLA,
    catalog freshness and retry state without raw buyer content.
11. Exercise a bounded rate limit with a dedicated canary scope and verify at
    most one localized notice for its window.
12. Re-run Lead/Javob isolation and public-site health checks.

For the R1.1 latency remediation, verify that the first result page has three
grounded cards, `Показать ещё` remains available when more products exist,
text input shows bounded typing feedback, and callback buttons clear without
waiting for the full Runtime result. Do not parallelize independent product
`sendMessage` calls during incident response because their arrival order is
not guaranteed.

Keep the synthetic order as canary evidence unless the data-retention owner
explicitly authorizes exact-ID cleanup. Never use a broad delete.

## 9. Rollback and hard stops

For application failure, redeploy the recorded prior immutable source build
and pause the synthetic pilot store. Do not reverse additive schema blindly.
For data corruption, stop traffic and use the verified D1 backup/Time Travel
under incident control. Fixture rows are removed only by a separately
reviewed exact-ID script; this release has no delete path.

Immediately stop on:

- identity/webhook mismatch or a missing protected secret;
- migration drift, failed integrity/foreign-key check or unexpected table
  subset;
- cross-tenant visibility or mutation;
- fabricated price, stock, product, policy, payment or delivery claim;
- duplicate order/notification/handoff or double inventory decrement;
- raw Telegram ID, contact, message or credential in analytics/logs/OCC;
- uncontrolled deployment, publication, scheduler, Railway or n8n activity.

## 10. Closeout evidence

Update `STATE.json`, `CURRENT_STATE.md`, `HANDOFF.md`, `DECISIONS.md`,
`TEST_MATRIX.md`, `KNOWN_ISSUES.md` and the R1.1 audit with:

- exact merge and deployed SHA;
- Pages deployment ID and immutable URL;
- backup reference and checksum without secret material;
- migrations applied and verified;
- pre/post fixture and canary counts;
- local/full/production gate results;
- incidents, deviations and rollback target;
- explicit confirmation that no real stores, brands, customers, payment or
  delivery were introduced.
