# Contact discovery release — 2026-08-28

## Scope and invariant

An ordinary phone number is not a verified Telegram recipient. This release separates company identity, phone line type, first-party ownership evidence, Telegram resolution, and outreach authorization. It never invents a username or imports scraped numbers as contacts. No real messages are part of the acceptance tests.

## Delivered code

- `src/shared/lead-radar-contacts.ts`: pinned libphonenumber-js/max metadata, E.164 normalization; mobile/fixed/ambiguous/service/invalid classification; multiple public numbers; username/phone/business Telegram links; reject invites/share links. Fixed, service, extension and ambiguous numbers remain visible but are excluded from automatic phone lookup.
- `contact-candidates.ts` + `sources.ts`: evidence-backed first-party corporate contacts, vendor/personal exclusions and multiple phone extraction. An OSM phone alone does not establish corporate Telegram ownership.
- `official-domain-discovery.ts` + Firecrawl integration: name/phone/address search anchors, retain result paths, one matched JSON-LD directory listing may identify an official website. Directory shared contacts do not become company contacts. First-party verification, robots/redirect checks, existing paid budgets/circuit and request ledger remain enforced.
- Optional `0050`: bounded candidate pool and tenant/company/account/source-bound contact checks, expiry, 200 lookup generations per organization per UTC day (cache polls are not new generations).
- Explicit `telegram_contacts` search goal, target5–50, candidate budget up to250, batches10, pool lifetime1hour. Stop on target, pool exhaustion, candidate cap or time cap, with partial results rather than a false guarantee.
- Worker/Queue performs enrichment and separate durable lookup jobs. Pending checks resume after15s without re-fetching websites; short Bridge cooldowns continue, long FloodWait stops the check. Queue lifetime30min; an individual gateway lookup expires within3min. Browser polling is not the scheduler or sender.
- Bridge/gateway1.4.0: encrypted, idempotent `resolve_contact`; first-party corporate public mobile/username/business link only; no send/import. Local3s gate, durable full FloodWait, reject bots/channels/groups/deleted accounts. Privacy-hidden vs missing phone cannot be distinguished.
- Resolution proofs bind current corporate evidence and current Telegram account. Sender revalidates these plus DNC, consent/basis, frozen text/media and duplicate guards. A resolution never grants consent. Late callbacks cannot replace a terminal result.
- UI shows found contact values, source links and exclusion reasons, with explicit lookup without sending. Switching company cancels old component polling. Search/company/Telegram/ready counters remain distinct.
- Campaign DB audit uses scoped quick_check/FK checks, avoiding the shared DB global quick_check memory failure without dropping fingerprint/ledger verification. Recovery errors no longer falsely claim that a previous campaign exists.

## Known limits (not production claims)

- Phone-resolved accounts **without a public username are not sendable in this release**. Supporting opaque peer handles would require a separate sender/custody contract; numeric values are never forged into usernames.
- No fixed niche or finite pool guarantees50 contacts. Public business numbers may not resolve due to Telegram privacy.
- Official-domain search is conservative. It does not cover every directory or bypass blocked/private sites. A listing fallback is used only if Search returns no official-domain candidates.
- Firecrawl remains OFF after the prior approved20-company pilot returned0 verified corporate contacts (65 actual credits spent). These new extraction paths have fixture/runtime tests, not a new paid quality acceptance run.
- Existing searches are not silently re-enriched. Use a new bounded search; no automatic paid history replay.
- No cold-message test or real campaign was sent. A first real message needs an approved recipient and exact content; keep existing sending gates.

## Verification

- Full Lead Radar suite:322/322.
- Targeted contacts/Firecrawl/mailbox suite passed (overlaps full suite).
- Python Bridge:48/48, including long FloodWait persistence and no send/import during lookup.
- Typecheck, ESLint, production web/admin builds, SEO audit passed.
- Worker and gateway dry-run bundles passed.
- D1 budget: background two-contact lookup + final aggregation29 statements, plus13 outer/account allowance =42/50. Pool discovery and existing four-page Firecrawl paths have separate budget regressions.
- Tests include tenant isolation, changed evidence, DNC/cache purge, no authorization by lookup, daily recheck cap, late callback fencing, duplicate queue delivery and browser-independent continuation.

## Release order

1. Confirm exact D1 `97ef0372-d937-406f-8871-755368d9afff`, Pages `ai-direct-pro-landing`, Worker `gptbot-automation`, gateway `gptbot-lead-radar-telegram-account`; no active campaigns/effects.
2. Deploy gateway, Worker and Pages with optional0050-aware schema auditing. Keep Firecrawl OFF. Never apply0050 before the new auditors are deployed.
3. Apply **only** `0050_lead_radar_contact_discovery.sql` and its ledger record. No blanket migrations, destructive schema changes or old quick_check.
4. Verify base/campaign scoped audits and0050 critical columns/constraints.
5. Upgrade the existing Windows package to1.4.0 with no dependency reinstall. Stop/start only `GPTBot Lead Radar Telegram Bridge`, preserve DPAPI vault and ledger. Backup previous package recoverably. Verify self-test, paired status and fresh heartbeat/version; no re-pair/login reset.
6. For live quality acceptance, agree a new capped Firecrawl pilot and measure sourced mobile/public Telegram/verified reachable/authorized counts separately. Keep campaign sending off until a deliberate reviewed launch.

## Recovery

Do not roll back to a schema auditor unaware of0050. Disable new contact-mode admission or deploy a forward fix if needed; retain base research and existing campaign safeguards. Do not clear uncertain Firecrawl reservations. Do not reset the Bridge vault to repair account status.
