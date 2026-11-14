# GA4 ai_response_error investigation and terminal-stream fix

Date: 2026-11-14. Owner request: investigate and fix the GA4 anomaly on GPTBot.uz.
Production baseline: `d1eca4a681d83e46202203a7b60b44746b5c57a9` (manifest and Cloudflare canonical deployment independently read).

## Finding and reproduction

The screenshot reports 30 users for `ai_response_error` against an expected 0–19; its exact event date was not established. This is an application event, not evidence of a broken Analytics installation.

The browser consumed a valid answer and terminal `done`, but continued reading the stream. A subsequent transport failure replaced that successful result with `network`, causing the UI to send `ai_response_error`. The same defect existed between the server and AI provider: a literal `[DONE]` did not end consumption, and a later read failure replaced completion with `provider_error`.

Both defects were reproduced before fixing. The backend fixture returned an error with remaining allowance 15/5 after a complete response; the correct settled response is `done`, charged once, remaining 14/4. Synthetic tests use mocked providers and local SQLite, not real customer turns.

## Change

- Client: the first terminal `done` or `error` is authoritative; later data/transport failures cannot replace it.
- Server: stop after literal provider `[DONE]`, preserving preceding usage and finish reason. A finish reason alone is not treated as terminal.
- Reader cancellation and lock release are best effort and do not block settlement if cancellation never resolves.
- Real failures before completion remain errors; existing truncated-answer, Stop, usage and charging rules are preserved.

No analytics events were suppressed, renamed or disabled. No limits, budgets, model selection, payment configuration, bot webhooks, content, URL/canonical/hreflang, SEO metadata or campaign settings were changed. No database migrations.

## Evidence and limits

Read-only aggregate snapshot at 2026-11-14T10:23:41Z contains 1,041 reservations for November 1–14: 984 answered, 30 client_gone, 21 truncated, four server failures (all November 9) and two without settled outcomes. November 10–14 contains no recorded server failures. These aggregates do not include every pre-reservation or browser-only error.

The 30 client_gone turns over fourteen days must NOT be equated to the screenshot's 30 GA4 users. Turn counts and GA4 users have different denominators. Historical `code` was not registered as a GA4 custom dimension; the available service-account Data API access returned property permission denied. Exact attribution of all 30 users remains unproven.

Maximum recorded daily free_paid actual spend was $0.041990 against the source-configured $0.30 limit; the snapshot does not show exhausted budget or an active model cooldown. This does not prove every visitor succeeded.

## Validation

- Client stream suite: 20/20 passed, including late read failure, late tokens, terminal provider error, stalled cancellation, empty response, Stop and watchdog behavior.
- Backend settlement/budget/Z.ai suites: 53/53 passed, including both providers and stop/length combinations; genuine preterminal failure remains uncharged.
- Independent source review approved both changes, including settlement ordering and upstream/incoming abort signal separation.
- Web and Functions TypeScript checks and scoped ESLint passed.
- The final frontend bundle passed the unchanged 110,000-byte Brotli cap exactly. Small API deduplication preserved the request field whitelist and error outcomes; there is no remaining size headroom. The full production build must repeat this gate.
- Broader regression run: 140 tests, 137 passed, two pre-existing model-policy failures, one skipped because dist was initially absent. Both failures reproduce on unchanged live baseline (14 tests, 12 passed, two failed); no new model-policy behavior was introduced.
- Final build, bundle gates, post-build checks, guarded deployment and live parity receipts are stored outside the repository in the evidence folder below. Do not infer a completed release from this implementation document alone.

## Release and follow-up

Use only the existing `deploy_runner.py check` then `deploy`, with DR_ROOT pointing to this physical worktree. The artifact must be stamped from the reviewed committed source. Preserve the shared production lock and WebSub receipt state. Compare current manifest ancestry immediately before release, then exact served artifact and all production configuration hashes/secret names after release.

Evidence: `F:/_moved_from_C/Documents_ChatGPT/Easy Breezy/delivery/gptbot-chat-errors-20261114/evidence/`.

Monitor new `ai_response_error` users together with successful response events after release; the old GA4 anomaly card is historical and is not erased by a code fix. Remaining genuine network, Turnstile and provider errors need their own evidence. No claim of zero errors or measured post-release improvement is made.

Rollback: revert only this scoped commit on top of the then-current production lineage and use the guarded build/release procedure; never redeploy a stale worktree over newer work.
