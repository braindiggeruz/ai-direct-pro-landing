# Contact-first acquisition — 2026-08-28

## Scope and release status

Owner approved implementation of real corporate Telegram username discovery by niche. This is an additive improvement on the existing search, durable Queue, Bridge 1.4 and unified audiences. It does not reset pairing, authorize outreach, send messages, or promise a fixed number of contacts.

Implemented and deployed; original full suite **401/401 PASS**, main/admin builds, Worker dry-run, typecheck, lint and 3955-file secret scan passed. **Update:** owner subsequently approved activation and a 20-company/100-credit pilot. Firecrawl is now ON; live findings, fixes, limits and the 405-test follow-up release are documented in [FIRECRAWL_ACTIVATION_20260828.md](FIRECRAWL_ACTIVATION_20260828.md).

Code commit: `7ba7c7d3779e316961e0ba8ef57668a3a9f72484`.

- Pages production `5ad5f687-368f-4e0d-adb0-cccf56c923c2`, main, canonical deployment success on gptbot.uz.
- Automation Worker `7ad511fd-64ae-48a6-9737-de093d511145`.
- 0052 applied and ledgered AFTER both new runtimes; no historical tables rebuilt or records deleted.
- Post-release audit: base/campaign/contact/audience/contact-source schemas pass; source reports empty, directory two review-needed contacts, no active jobs/campaigns/effects.
- Smoke: login 200/no-store; private overview and contact directory 401/no-store without authentication; new AdminRoot asset 200 and SHA-256 matches local build.
- Authenticated owner clicks and a real paid acquisition run were not performed or claimed tested. Bridge/session and existing outbound gates unchanged; no messages sent.

## Causes fixed

- Plain `@username` and bare `t.me/name` were missed. Extraction now reads visible text, excludes email/script/attribute handles, and keeps local context. Personal staff links still use explicit adjacent name/role evidence, without borrowing it for corporate booking links.
- Human profiles outranked corporate booking accounts. Corporate accounts now have priority; unknown candidates outrank channels and bots.
- The resolver selected the first two candidates on every delivery and stopped after a failed one. Progress now comes from the existing account/source-bound check ledger, with one lookup per delivery. Fresh negatives are skipped; transient failures can be retried later; account-wide limits retain their delay.
- Companies without sites or with failed/blocked sites never reached contact lookup. Both Queue exits and the hidden `enrichment_status='enriched'` SQL predicate were fixed. Terminal site outcomes can create an independent contact job, including after retry exhaustion.
- Unknown legacy bots inflated the shared directory. Bot-like unverified handles and exact Bridge-rejected peers no longer count as recipients. Existing records are not deleted.
- Firecrawl was used mainly to find official websites. A separate contact-first source adapter now searches identity-anchored public business listings and Telegram public profiles.
- The seven-credit company budget was actually per job. It is now shared across all jobs for that company, so a second phase cannot silently double the budget.

## Runtime chain

1. Existing niche/city discovery produces companies and any published contacts. New UI default is a Telegram-contact goal (20 target, up to 100 candidates), not a promise of 20 results.
2. Direct website extraction remains available. When the new Firecrawl adapter is enabled, a company without its own site proceeds to contact discovery instead of spending its entire allowance searching for a site.
3. Contact discovery uses two bounded name/phone-anchored RU/UZ queries, up to three unique public pages, and the existing paid-request ledger. Search snippets are never proof. No provider AI extraction or automatic scrape of every search hit is enabled.
4. Source adapter accepts only allowlisted public business listings and single Telegram profile pages. A contact must occur in an identity-matched structured business entity, or one bounded main entity with matching name and public phone. Shared footer/navigation/sidebar contacts are excluded. Russian/Uzbek name normalization is used only for entity matching and search queries; usernames are never invented.
5. Public profile title and phone must match the company. Only published business links from its bio are candidates. No member/admin enumeration, private groups, contact imports or test messages.
6. Ordinary mobile numbers require corporate-source proof; fixed/ambiguous/service numbers do not enter Telegram lookup. A public unknown username may be checked for existence/type, but success does not establish company ownership.
7. Bridge resolves the candidate and rejects bots/groups/channels/deleted accounts. Only a regular user with a public username and current corporate proof is stored as `bridge_resolved_corporate`.
8. Shared directory, audiences and existing sender guards consume the result. Sender revalidates source, company identity, account, expiry, DNC and separate contact authorization. No-site proof is supported; no fake website is generated.

## Data and compatibility

- `0052_lead_radar_contact_sources.sql`: optional `lead_radar_contact_enrichments`, keyed by tenant/company, with identity digest, compact source/candidate evidence, reason/status and expiry. No Telegram session or credentials.
- Old `lead_radar_evidence.source_type` constraints are unchanged. A directory is not mislabeled `company_website` or `official_open_data`.
- Source writes require the current Queue lease/generation and unchanged company identity. Receipt reuse avoids rebilling across continuation. Cache expiry does not erase uncertain paid reservations.
- Source reader and sender reject changed identity, stale proof, wrong tenant or DNC. Retention clears expired/suppressed source payloads in bounded batches.
- Deploy Pages and automation Worker with the exact optional-table auditor exception BEFORE applying/ledgering 0052. Do not run all historical migrations or a global D1 integrity scan.

## Limits and validation

Existing limits remain: provider enable/mode/org gates, conservative ledger reservations, seven credits/company across jobs, configured search/day/domain limits, no replay of ambiguous paid requests, 200 Telegram check generations/org/day. Provider results and Bridge resolution use separate Queue deliveries; measured full contact-first deliveries were 26 and 30 D1 statements, plus 13 reserved for outer guards/account/heartbeats (39/50 and 43/50).

Tests cover plain handles, corporate priority, staff-link regression, misleading footer/sidebar links, identity/phone conflicts, RU/UZ names, non-public URLs, fixed vs mobile, disabled provider, idempotent paid receipt, cross-job cost cap, third-candidate success, unknown-user nonapproval, no-site sender proof, source mutation, DNC, legacy bots, and no-site/robots/retry-exhausted Queue handoff. Full final result and production audit below.

Pre-release read-only production audit: base/campaign/contact/audience schemas pass, 0052 not yet installed, no active jobs/campaigns/effects. New directory projection has two review-needed contacts after excluding the historical unknown bot; no records deleted. No paid calls, pairing reset, or messages were made.

## Operational acceptance still required

Fixture tests establish code behavior, not market coverage. Before claiming more real contacts: owner-approved capped pilot on companies with and without sites, manual validation of company ownership, measured found/rejected/verified counts and actual provider spending. Public sites may publish only the directory's channel or no Telegram at all. A successful phone lookup may still lack a public username. These must remain honest negative/review results, not fabricated recipients.

Primary references checked: [Firecrawl search](https://docs.firecrawl.dev/features/search), [Firecrawl scrape](https://docs.firecrawl.dev/api-reference/endpoint/scrape), [Telegram username resolution](https://core.telegram.org/method/contacts.resolveUsername).

Read-only release audit: `node --import tsx scripts/lead-radar/contact-release-audit.ts --audiences --contact-sources` with Cloudflare credentials in process environment only.
