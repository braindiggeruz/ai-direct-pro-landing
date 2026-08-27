# Telegram connection release — 2026-08-27

Scope: Lead Radar only. SEO/content/routes, bot webhook and campaign policy unchanged.
Baseline production: da3b93fcc1c9ae97294353f57ed9cd821bebcb5d / Pages e178b49e-81fc-4c89-8053-a7a301d94cab.

Root cause reproduced: Bridge's 600-second relay rejected by Pages' 95-second validator (502). All validators now share the relay TTL. Input/password/finalization commands no longer wait 70 seconds inside HTTP. Pending actions are explicit, D1 stays non-sendable until the Bridge confirms finalization. Read-only failed finalization probes can recover without repeating login or sends.

Bridge 1.2.0: HTTP off the Telegram event loop, bounded RPCs, no hidden FloodWait sleeping, 2-second auth polling (15-second idle, compatible with older clients), provider proof before custody finalization. Timeout is not reported as session revocation. Session remains in Windows DPAPI.

UI opens the number form immediately, preserves draft number while Bridge prepares, fences stale status responses and polls finalization. Code-request confirmation is shown only after provider acknowledgement.

Checks: 297 existing Lead Radar tests, 3 production-mailbox contract tests, 38 Python tests; app/Lead Radar/gateway TypeScript; production build and SEO audit (0 critical, sitemap 259). Full live login and real-send canary still need owner input in the website; no messages sent to companies during this repair. No database migration or secret rotation required.

Rollout: Bridge, then Pages (accepts old/new envelopes), then gateway. Preserve existing environment/bindings. Rollback uses the preceding artifacts; never drop safety ledgers or erase the vault. Bridge 1.2 remains compatible with the preceding gateway.

Next acceptance: owner logs in to admin, enters Telegram number/code/2FA on the site, checks masked identity, then explicitly approves one controlled recipient/message. Existing DNC, consent, 30/day, 120-second pacing, Pause/Stop and permanent no-repeat guards remain enabled. Public listings with no verified Telegram address cannot be sent messages automatically.
