# GPTBot AEO incident repair — 2026-09-05

## 1. Current state

Runtime 2b440c8a07da26f8ae4694a92a2070596a943e8b is live in Pages deployment 72b29cf1-7f27-4025-b8c3-82a9570b4a3b; deploy exited 0, custom-domain manifest and AdminRoot-CdpxtJhP.js SHA match. Subject matching, explicit mode labels and legacy-analysis recheck are deployed. Authenticated content analysis and review persistence/undo were verified on the immediately preceding repair runtime; the latest analyzerVersion 2 and real-model owner canaries remain pending.

## 2. Confirmed root causes

GitHub PAT rejected with HTTP 401, breaking content loading and AEO analysis. The existing repository credential was validated through the exact GitHub GraphQL content query and rotated into Pages GITHUB_TOKEN through stdin, without printing or storing it. Workers rejects fetch redirect=error before any HTTP request; replaced with manual and explicit non-2xx refusal. A third defect matched cake queries to agency pages using only purchase and geography words. Subject matching now rejects that false association. Old persisted analyses need an explicit rerun to benefit from the fix.

## 3. Source and scope

Worktree F:/Claude/gptbot-aeo-20260905, branch feature/aeo-production-20260905. AEO functions/platform/aeo, functions/api/admin/aeo, shared types, workspace and review panel. Existing monolith, JWT, internal org and D1 retained. Original platform handoff remains docs/aeo/PREVIOUS-PLATFORM-HANDOFF.md. No unrelated platform work is authorized by this incident.

## 4. Delivered behavior

Cloudflare-compatible credential-safe provider transport. Failed analyses retain safe reasons and questions; persisted terminal outcomes let the next click start a fresh operation, while uncertain network outcomes retain the operation key. Content form explains its gptbot.uz-only scope. The deployed patch labels the tab Контент gptbot.uz, puts model answers next to the question, adds analyzerVersion=2 and a recheck action for old analyses. Old analyses remain readable; new acceptance/draft writes require reanalysis.

## 5. Production evidence

Run 992fbc15-30ae-42de-9740-3f9ccc77ca60 loaded 185 published RU pages, found the SEO-audit article, saved acceptance, restored it after browser reload and then undid the decision. Owner's subsequent 07:30:19 UTC analysis also completed. No public editor Save/Publish action occurred. The model runs at 07:10 UTC predate the transport repair and must not be used as post-repair availability evidence.

## 6. Validation

29 total tests: 18 AEO tests including real workerd outbound transport and redirect refusal, positive/negative cake-topic fixtures, D1 isolation/idempotency/CAS and stale source validation. Eleven Pages release/config tests passed. App/functions typechecks and scoped lint passed for runtime 3227e6d; the final patch passed both typechecks and scoped lint. Full local inventory: 185 RU and 100 UZ; cake query returns no_target and RU SEO-audit query selects /ru/blog/seo-audit-sayta-chek-list/. No model response is fabricated by those tests; external transports in tests are fixtures.

## 7. Live model verification boundary

Owner logged into IAB and approved continued work. After the owner's power interruption, this turn no longer has a callable browser-control tool. The owner was asked to launch free-model answers in the existing tab; D1 readback is available. No post-repair model operation has appeared yet. OPENROUTER_API_KEY remains secret and preserved; only three allowlisted :free models, max_price zero and no paid/search fallback are allowed. A 25-second timeout and complete-output validation remain in effect.

## 8. Next action

Deployment and domain readback are complete. Finish actual free-model canary and confirm the corrected cake analysis in production after refreshing the browser and clicking Проверить заново. Use the owner session if the browser tool becomes available; do not extract session tokens through filesystem or page evaluation. A real provider HTTP rejection must be diagnosed from its safe status, not hidden behind a generic completion claim.

## 9. Acceptance boundary

Content loading, saved decision readback and undo are verified live. Current remote model availability is still unverified. Do not claim 100 percent readiness or success for three providers until their real responses are stored. Model observations are labelled ungrounded and are not public business facts. Manual screen reader and human usability pilot remain unverified.

## 10. Reproduction

node --import tsx --test tests/aeo-workspace.test.ts tests/aeo-review.test.ts tests/aeo-workers.test.ts tests/pages-production-release.test.ts tests/pages-config-parity.test.ts; app/functions tsc; scoped eslint; npm run build:cf; scripts/release/pages-production.ts deploy. Private runner F:/Claude/aeo-production-20260905/_implementation/release-runner.py obtains Wrangler OAuth in process memory. Logs aeo-repair-build.log and aeo-repair-deploy.log. First domain check lagged after deploy; the separate verification passed.

## 11. Backup and mutation limits

No new migration in this incident. Existing migrations 0062/0063 and operational data remain. Private d1-before.sql SHA256 8c1ce37aa546171a4415217adae9c4a3a55f11e6b0145323b7821c6a27db5a0d; structural local restore passed only with ignore_check_constraints due to an export/SQLite excerpt-check discrepancy (live D1 invalid excerpt count zero). Never commit backups or credentials. Preserve the node_modules junction. No Telegram sends, paid models, financial operations or public content saves.

## 12. Release and rollback

Owner explicitly authorized commit/push/deploy and incident repair. Pages project ai-direct-pro-landing, account 14ce9e04574f2e6d825e56ee603e5cd5. Auto deployment is disabled; use guarded direct upload. Prior AEO runtime c123678 deployment 5f778f21 has the transport defect; rolling back to it reintroduces the incident. Prefer reverting only the new patch if needed. Do not revert the validated GitHub credential rotation or drop AEO tables. Baseline pre-AEO deployment 109137c6-6aae-4d08-bd27-a748ce863462 remains recorded for broader recovery.
