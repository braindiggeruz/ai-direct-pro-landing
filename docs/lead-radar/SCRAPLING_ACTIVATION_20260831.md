# Scrapling v2: isolated collection rollout

Current worktree: `F:\Claude\gptbot-lead-radar-integration-20260827`.
Base HEAD: `425dce778f9ad4482cab08dce0914706e96fcee2`.
User authorized the separate non-admin Windows runtime and normal UAC approval.
No message sending is part of this rollout.

## Current checkpoint (not a completion claim)

- v2 implementation passes 21 backend/cross-language + 10 UI tests.
- Collector/Windows preparation tests: 94 Python tests passed after the exact
  current-receipt ACK correction. The preceding frozen release gate passed all
  13 commands (582 TS, 51 Bridge, 88 collector, 16 scanner tests); a final gate
  must include this correction and the activation coordinator.
- Pinned standalone Python 3.12.11 + Scrapling 0.4.15 and Node 24.13.0 staged
  privately. The new acquisition-only secret is staged with private ACLs; its
  plaintext is never printed or included here.
- Missing Windows LocalAccounts module was handled by a fixed-user native helper.
  Initial installer9516 was interrupted before bootstrap/task provisioning.
  Reviewed elevated recovery18028 confirmed no profile/DPAPI/task and disabled
  only the new owned account SID ending1011 / installation
  `28af57a7-ddf3-481a-ad96-3250fc7d3e9a`; state is `failed_disabled`.
  Runtime and the original private bundle remain preserved. Guarded resume is
  being tested; it will reject any provisioned profile/credential/task.
  Isolation now removes traverse-bypass privilege from the collector process
  and checks its child; root deny changes are bounded, without recursive ACL
  propagation. Actual installed proofs remain required.
- The next approved resume15056 stopped safely before profile/config/DPAPI/task:
  both live directories reject MAXIMUM_ALLOWED handles with Win32 error32.
  Read-control/write-DACL handles succeed. The corrected path uses documented
  root-only SetFileSecurityW and pins the directory against rename; a busy
  temporary-directory regression verifies unchanged child ACLs. Account remains
  disabled. Installed runtime hash is now the first resumed bundle3c561d3e...,
  preserved exactly in private `bundle-resume1` before the next update.
- No production migrations, deployment, enrollment, feature enable, site crawl,
  Telegram check/send or audience modification has occurred at this checkpoint.

## Why v2

Canonical HTML parsing now runs in the protected local Node helper. Scrapling
Selector discovers contact links; existing TypeScript parsing retains the same
phone-conflict, company-name binding, named-person and footer exclusions.

The Pages API accepts at most 64 KiB: five page metadata records and 55 contact
observations. It independently checks token/org, current saved company identity,
lease generation/deadline, source origin/timestamps, allowed fields/formats and
current DNC/suppression rules. It creates deterministic evidence IDs and metadata;
contacts cannot set sender permissions or verification flags.

This is authenticated machine-observation trust, NOT remote attestation. The
server cannot independently recompute HTML hashes without receiving the HTML.
`extractorVersion` is compatibility metadata, not proof of honest execution.
Full HTML remains local in memory, never in v2 D1 or the immutable outbox.

Local benchmark (Node, not Cloudflare certification): 5 pages / 60 admitted facts,
16/128/512 KiB HTML gave approximately 7.4 KiB wire results and warm thread CPU
3.44/3.28/2.50 ms. Local extraction measured separately. Auth, D1, startup and
network are excluded. The required live canary remains pending.

## Corrections found before release

- Lead Radar owner scopes are not commerce `organizations` rows. Migration0056
  follows the existing owner-scoped model; tenant checks and composite FKs to
  Lead Radar companies/workers remain. Optional schema fingerprint:
  `2bbde4f8d40f001d7e9174ffbf422a221961ead0098965ad6cb79e0db65e7d8a`.
  The fingerprint uses the existing quote-aware SQL normalizer: real Wrangler
  removes inline comments, which invalidated the earlier raw-SQL pin. Exact
  literals and CHECK semantics remain protected (53 schema/crawler tests pass).
- `web.website` anchors retain canonical `fact` classification and origin value;
  contact observations remain `company_data`, preserving candidate eligibility.
- Delayed immutable deferred results are accepted after their Retry-After has
  elapsed, while still fencing the lease. Existing later source deadlines are
  never shortened. Empty completed/partial and nonempty failed are rejected.
- Opaque Telegram Business m-links ending in `bot` are not misclassified as bot
  usernames. Known bot usernames still cannot become business contacts.
- A drained outbox is not an ACK: quarantined results also leave no pending row.
  Local completion now requires the exact current receipt to be durably
  acknowledged; missing/rejected receipts return a nonzero process exit.
- Live-side26paths are reconciled: newer15SEOJSON and related tests/analytics/docs
  are retained alongside newer Lead Radar/Bunzy code. The campaign schema also
  retains the live locale-free sort. The full gate completed13/13, with249input
  hashes and870built files matching; Windows root-access corrections require a
  final refreshed gate before publication.

## Live preflight observations

After the pause, read-only inspection found production Pages deployment
`83b965f7-d6a7-4f41-a872-0d4bc5da578d` at
`e81f65e6c4757f77ed2991ef12b599d956185e55`, NOT the base HEAD above.
Release is held for source reconciliation: preserve its newer SEO work and
campaign locale-free schema sorting alongside our newer Lead Radar/Bunzy fixes.
Crawler feature is absent. Refresh the full binding comparison before deployment.
No collector tables or migration0056 exist yet. Owner scope has 1,010 companies,
109 with a website. Existing audience `aud_de8f4addb1094394831f92241897bf6b`
remains 28 companies / version1 / selection28/version1.

Pre-change D1 recovery bookmark (read-only capture; NOT a restore):
`00000fc5-00000000-000050d8-e229ca92bfb0707cf5acb4952c56ded6`.
Database `97ef0372-d937-406f-8871-755368d9afff`, Pages `ai-direct-pro-landing`.
Time Travel restore overwrites the entire shared database and needs separate
incident approval. Ordinary rollback is disable collector and its feature flag,
preserving acquired evidence and the compatibility-aware server code.

IMPORTANT RELEASE ORDER: the old Pages AND automation Worker schema guards do
not exclude the new crawler tables. Deploy compatible code to both services
BEFORE applying0056; otherwise old code can reject the enlarged schema. The
optional crawler API remains unavailable until its own schema is present.
After0056, do NOT blindly roll either service back to its old binary: retain the
new table exclusions even when disabling collection. Verify schema acceptance
on both services and keep existing variables, bindings and sender gates.

## Activation acceptance still required

1. Successful ValidateOnly + approved UAC install into fixed ProgramData root.
2. Actual non-admin SID, deny-handle probes, CurrentUser DPAPI roundtrip, relocated
   Python/Node offline fixture. Task initially disabled, no API call during install.
3. Frozen full gate, matching input hashes, complete production config comparison.
4. Compatible Pages + automation Worker deployment, then additive migration and
   token-hash enrollment. Rollback must retain schema compatibility as above.
5. One bounded existing-company source job, real receipt/evidence readback, no sends.
6. Task polling/startup definition and user-facing result/blocked-source statuses.

Chrome UI acceptance is currently unavailable: the requested ordinary Chrome is
running, but its Codex extension and native host are missing. User was informed;
no alternative browser, profile/session extraction or hidden authentication was
used. Server and runtime checks are independent, not substitutes for UI proof.

Only official-site HTTP enrichment is implemented in this slice. New catalogue
discovery, browser rendering, bulk audience enrichment and outbound campaign
readiness are distinct later work; a found contact is not permission to send.
