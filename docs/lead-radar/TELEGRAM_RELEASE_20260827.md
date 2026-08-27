# Telegram connection release — 2026-08-27

Deployed source: `bf275e9048c7762ff86ca9728fc140f903e44489`.
Pages: `d4074317-daef-4f28-848e-febbfb848189` (canonical production, success).
Gateway: deployment `ef77f06b-4b79-4f93-b326-90edd5ecec6e`, Worker version `49d93788-8aec-4a4d-8f3d-b5049acb9c7b`, gateway version 1.2.1.
Windows Bridge: 1.2.0 installed and scheduled task restarted; existing vault preserved.
Owner login/send canary is still pending, not claimed as passed.

Scope: Lead Radar only. SEO/content/routes, bot webhook and campaign policy unchanged.
Baseline production: da3b93fcc1c9ae97294353f57ed9cd821bebcb5d / Pages e178b49e-81fc-4c89-8053-a7a301d94cab.

Root cause reproduced: Bridge's 600-second relay rejected by Pages' 95-second validator (502). All validators now share the relay TTL. Input/password/finalization commands no longer wait 70 seconds inside HTTP. Pending actions are explicit, D1 stays non-sendable until the Bridge confirms finalization. Read-only failed finalization probes can recover without repeating login or sends.

Bridge 1.2.0: HTTP off the Telegram event loop, bounded RPCs, no hidden FloodWait sleeping, 2-second auth polling (15-second idle, compatible with older clients), provider proof before custody finalization. Timeout is not reported as session revocation. Session remains in Windows DPAPI.

UI opens the number form immediately, preserves draft number while Bridge prepares, fences stale status responses and polls finalization. Code-request confirmation is shown only after provider acknowledgement.

Checks: 297 existing Lead Radar tests, 3 production-mailbox contract tests, 38 Python tests; app/Lead Radar/gateway TypeScript; production build and SEO audit (0 critical, sitemap 259). Full live login and real-send canary still need owner input in the website; no messages sent to companies during this repair. No database migration or secret rotation required.

Rollout executed: Pages (accepts old/new envelopes), gateway, Bridge. Existing environment/bindings preserved. The gateway kept old clients on compatible 15-second polling until Bridge updated. Rollback uses the preceding artifacts; never drop safety ledgers or erase the vault. Bridge 1.2 remains compatible with the preceding gateway.

Next acceptance: owner logs in to admin, enters Telegram number/code/2FA on the site, checks masked identity, then explicitly approves one controlled recipient/message. Existing DNC, consent, 30/day, 120-second pacing, Pause/Stop and permanent no-repeat guards remain enabled. Public listings with no verified Telegram address cannot be sent messages automatically.

## Phone readiness recovery candidate

After the 1.2.0 rollout, production evidence isolated one remaining browser deadlock: the Bridge accepted the connection and acknowledged `awaiting_phone`, but the page kept the explicit phone submit action disabled until a background status poll returned the input command. The local durable ledger contained no `awaiting_code` transition and no send effect, so Telegram had never received the number or produced a code.

The candidate makes the explicit button wait read-only for the bound tenant/device/auth challenge for at most 20 seconds, then encrypt and submit the phone exactly once. It never retries a Telegram code request, rejects stale or cross-bound challenges, cancels on unmount/session change, and keeps the HTTP deadline active while the response body is read. Authentication error copy now appears in the phone flow instead of the unrelated media flow.

Candidate checks: 304/304 permanent Lead Radar tests, both TypeScript projects, scoped ESLint, secret scan over 3,909 files, production build, Pages Functions compilation and SEO audit all pass. SEO remains unchanged: 0 critical findings, 120 published pages, sitemap 259, and no missing title, description, H1, canonical, hreflang or Open Graph metadata. No migration, secret rotation, webhook change or company message was performed. Deployment and the owner login/send canaries remain pending until the exact candidate commit is released.

Rollout result: source `3395a80e7af567468aaa7cdc2eff5a824baea85d` is the canonical production deployment `5ccd3d24-a06b-405a-a312-e7180fe71388` (`https://5ccd3d24.ai-direct-pro-landing.pages.dev`). Gateway `361fd697-8316-4f5e-9539-206fb954041b` and Windows Bridge 1.2.0 were not changed. Canonical and immutable root/RU/UZ/admin probes return 200; the new phone-readiness UI marker is present; unauthenticated Lead Radar API returns 401; admin remains `no-store`/`noindex`; the protected UZ SEO marker and Telegram article remain present; sitemap still contains 259 URLs. Owner login and one explicitly approved controlled send remain the only unpassed canaries; no message was sent during deployment.

## Auth input TTL and terminal ACK recovery candidate

The first owner attempt against `3395a80` proved the next cross-runtime defect without crossing Telegram's provider boundary. The Bridge durably acknowledged `awaiting_phone`, then recorded `local_validation_failed`; no `awaiting_code` or send effect exists. The browser bound the encrypted input to the ten-minute human ceremony expiry, while the Windows Bridge enforces a 90-second anti-replay ceiling for each individual input envelope. The otherwise valid phone was therefore rejected locally. The gateway then rejected that safe terminal result shape, leaving it unacknowledged and replaying while the UI waited.

The candidate caps each browser phone/code envelope at 60 seconds while retaining the ten-minute human ceremony. Gateway 1.2.1 accepts the exact empty `local_validation_failed` result, closes the one-use command as `bridge_input_rejected`, and requires a fresh explicit owner action; it never claims that Telegram was called and never retries a code request. Permanent tests cover both the ten-minute production challenge and the terminal ACK path. Full Lead Radar tests pass 304/304; both TypeScript projects and scoped ESLint pass.

Rollout result: gateway 1.2.1 was deployed first as deployment `ef77f06b-4b79-4f93-b326-90edd5ecec6e` / Worker version `49d93788-8aec-4a4d-8f3d-b5049acb9c7b`, followed by exact Pages source `bf275e9048c7762ff86ca9728fc140f903e44489` as canonical production deployment `d4074317-daef-4f28-848e-febbfb848189` (`https://d4074317.ai-direct-pro-landing.pages.dev`). Canonical root/RU/UZ/admin and immutable admin probes return 200; the live admin bundle contains the `bridge_input_rejected` and 60-second envelope markers; unauthenticated account and Bridge APIs return 401 with `no-store`; admin remains `no-store`/`noindex`; root canonical/hreflang metadata remains present; sitemap still contains 259 URLs. The scheduled Windows Bridge is running and its built-in status and self-test both pass with the existing DPAPI vault preserved. The historical locally rejected input predates this deployment and never crossed Telegram's provider boundary; its durable row remains inert for that closed command and does not affect fresh command IDs. Owner phone/code/2FA and one explicitly approved controlled send remain the only unpassed canaries. No company message, migration, webhook change or secret rotation occurred during this release.
