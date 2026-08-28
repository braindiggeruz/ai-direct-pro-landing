# Unified Telegram contacts and campaign audiences — 2026-08-28

## Owner workflow

Lead Radar → **Все Telegram-контакты и кампании**. Create a named audience, select contacts from all saved searches, then open its campaign. Each membership change is saved server-side. Filters, pagination and reload do not reset that selection. A campaign requires the existing server preparation and explicit confirmation; creating/selecting an audience never starts messages.

One public corporate/unknown Telegram username is one directory row. Its source searches remain accessible. Ordinary phones (including unresolved mobiles), human accounts, bots, groups and channels are not converted into messageable Telegram recipients. Phone-resolved accounts currently still need a public username for the existing sender.

The directory distinguishes verified contacts, review-needed contacts, shared-contact identity conflicts, previously contacted/uncertain outcomes, and do-not-contact. **Verified is not consent or readiness to send.** Existing per-company documented authorization, freshness, account health, dedupe and suppression checks still apply.

The bulk button scans all pages matching company/username, exact category and city, selecting only verified, not-previously-contacted entries up to 50. The status filter is explicitly page-local. Up to 100 named audiences per organization; no automatic splitting into campaigns. Existing rate limits and one-active-campaign rules remain unchanged. This feature reuses saved results, does not collect new contacts, spend Firecrawl credits, or guarantee 50 usable contacts.

## Implementation

- Migration `0051_lead_radar_audiences.sql`: additive `lead_radar_audiences` (CAS version, member IDs) and `lead_radar_audience_campaigns` (immutable source/version/member snapshot). No message bodies or new contact values stored there.
- `functions/platform/lead-radar/audiences.ts`: tenant-scoped directory and global duplicate/suppression checks BEFORE niche filtering. Conflicting business identities on one Telegram are not silently merged or bulk-selected.
- Owner routes: `GET telegram-contacts`, `GET audiences`, `GET audiences/:id`, `POST audiences/:id`. Strict mutation bodies, organization derived from authorized owner context, no-store responses.
- Prepare/create accept **either** the legacy `searchId` **or** `audienceId` + `audienceVersion`, never mixed. Source binding is included in the cryptographic approval fingerprint. CAS edits invalidate approval. A version fence plus FK/NOT NULL constraints roll back the entire D1 transaction if the audience changes during approval consumption.
- Legacy `lead_radar_tg_campaign_safety.search_id` remains a REAL member's source search for provenance. It is NOT a synthetic combined search. Audience association is authoritative for recovery; old per-search recovery excludes audience campaigns.
- Frontend `TelegramContactDirectory.tsx` reuses `TelegramAccountCampaignPanel.tsx`. Audience selection is immutable in the composer; change it above and prepare again. Per-contact authorization still uses that company's original search.
- Delivery remains the existing Worker/Queue + local Bridge pipeline, not UI polling. Bridge pairing, credentials, Telegram session and Firecrawl settings are unchanged.

## Verification

- Full Lead Radar suite: 382/382 passed (includes SQLite audience/API/mixed-search campaign/rollback tests).
- Additional full owner-API chain passed: save mixed-search audience → reject mixed legacy/audience scope → prepare → create → recover, with zero Queue and gateway requests.
- 50-recipient audience: prepare 16, create 24 D1 statements, plus 15 reserved for API guards; below 50 each.
- Interactive local fixture: selection across pages, reload restoration, all-pages verified bulk selection, disabled exclusion states, opening the shared campaign composer, editable template and preview. Synthetic contacts only, network sending disabled.
- ESLint/typecheck, main/admin builds and secret scan are release gates. Fixture `tests/browser-fixtures/audience.html` is development-only and not a production entry point.
- Authenticated production owner workflow and real-message delivery require the owner; no fake cookies/JWTs or live recipients are used for tests.

## Release / rollback order

Deploy optional-table-aware Pages and automation Worker BEFORE applying 0051, then apply only that migration and ledger it. Run `node --import tsx scripts/lead-radar/contact-release-audit.ts --audiences` using environment credentials. It reads the actual production schemas, directory aggregate counts and active jobs/campaigns without returning contact values or mutating anything.

Do not roll back to an older schema auditor that rejects the two new optional tables. Do not drop audience data for rollback. A UI-only rollback must retain the additive-schema compatibility and the campaign snapshot/recovery logic. No data/session reset is needed.

Release identifiers and final production audit results are recorded after deployment in STATE.md and the release section below.

## Released

- Code: `f9f8738d4d368e7d9d02812161145c5cc1b098b7`.
- Pages production: `d9206ece-b9d3-44e8-bc18-f9630d0b574f` (gptbot.uz), deployment stage success and commit verified through Cloudflare readback.
- Automation Worker: `ac566699-4a87-47d7-8ead-051ccb3f3d98`.
- 0051 applied and ledgered after both code deployments (five successful SQL statements). Base/campaign/contact/audience schema audits all pass.
- Actual directory: **3 unique public contacts, all review-needed** at release. No active jobs, campaigns or effects; nothing sent and no paid collection started. Aggregation does not upgrade unverified contacts.
- Login HTTP200/no-store; unauthenticated directory/audience endpoints HTTP401/no-store; new `AdminRoot-D95vMfYD.js` asset HTTP200.
- Main/admin builds, full lint/typecheck, secret scan3946 files and Worker dry-run passed. Final campaign API regression subset29/29 passed including the new audience chain. Existing large admin-bundle build warning remains non-blocking.
- Local UI test server was stopped. Owner-authenticated production interaction and real recipient delivery were deliberately not represented as tested.
