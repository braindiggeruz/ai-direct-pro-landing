# GPTBot AEO video incident closure — 2026-09-05

## Public CSS hotfix — owner-authorized release

The owner authorized committing and publishing the mobile CSS repair on 2026-09-05. The release checkout `F:/Claude/gptbot-mobile-css-hotfix-20260905` includes production `37706036171f28d1f7bd002c922ada87d5d3f9d7` and changes only public stylesheet selection and its release guard/tests. Prerender now follows Vite entry styles instead of alphabetically selecting AdminRoot CSS. The previous baseline passed 537 full tests and built-artifact mobile checks; the current production lineage is being rebuilt and checked before guarded publication. New premium chat/billing WIP is excluded. AEO acceptance boundaries below remain unchanged. See `docs/gpt-chat/MOBILE_CSS_RELEASE_2026-09-05.md` for release verification.

## 1. Current state

Owner-authorized incident repair. Three real free models completed successfully in the authenticated owner browser; D1 confirms final stop, nonempty answers and zero reasoning tokens. Latest verified runtime f9a8457b13ee313f769290ac1df59826c1d14f78, deployment be459480-0b03-4430-ba55-c730487adcf8. Current checkpoint: complete. The final UI-only polish does not alter the provider request path.

## 2. Confirmed defects and fixes

Invalid server GitHub PAT caused content/audit HTTP 401; validated existing repository credential rotated through stdin. Workers rejected redirect=error before outbound HTTP; manual redirect plus explicit refusal fixes transport. Matching purchase/geography words produced a false cake-to-agency recommendation; analyzerVersion 2 requires subject evidence and returns no_target. Legacy recommendation panels are hidden pending recheck. The video showed NVIDIA/Dots incomplete responses: 4096-token budget, optional reasoning disabled for the three verified models and 35-second timeout now produce complete real responses. Historical provider finish reasons were unavailable, so their exact truncation cause is not asserted.

## 3. Source and scope

F:/Claude/gptbot-aeo-20260905, branch feature/aeo-production-20260905. Existing monolith, JWT, internal org and D1. Core functions/platform/aeo, functions/api/admin/aeo, src/admin/pages/AeoWorkspace.tsx, components/AeoAnswers.tsx, shared types. Historical platform context is preserved in docs/aeo/PREVIOUS-PLATFORM-HANDOFF.md. No unrelated platform changes.

## 4. Delivered UX

Explicit Content gptbot.uz versus model-answer modes. Wide single-answer reading with per-model status selectors, optional comparison, natural page scrolling. Exact source text remains available; safe Markdown display uses escaped React nodes, no raw HTML. History identifies each model. Loading models no longer shows a false configuration failure. Partial final answers remain explicitly incomplete; reasoning text is never displayed or persisted. Errors have safe causes and bounded manual retry.

## 5. Live evidence

docs/aeo/evidence/owner-canary-2026-09-05.json contains exact run IDs. MiniMax 1437 characters, NVIDIA 2922, Dots 1459: completed, finishReason stop, reasoningTokens 0. Analysis 1ecbe668-bc78-4396-a1ef-bca20a9ecf8f loads 185 RU pages: cake has no target, SEO selects the SEO-audit checklist. Prior run 992fbc15-30ae-42de-9740-3f9ccc77ca60 confirms accepted decision survives reload and undo. History restores all three answers; old 12:30 analysis shows only recheck notice. No public Save/Publish.

## 6. Validation

29 AEO and Pages release/config tests passed; actual workerd test verifies outbound transport and redirect refusal. App/functions typechecks and scoped lint passed. Production build includes main and admin and 914-file stamp. Release receipt records manifest, asset SHA, routes and preserved bindings. Browser read/compare and model switching passed at 390 and 1440 px without horizontal overflow. Latest UI-only changes receive app typecheck, scoped lint and the same targeted suites before release.

## 7. Provider contract

Only minimax/minimax-m3:free, nvidia/nemotron-3-super-120b-a12b:free and dots-studio/dots-3-note-preview:free are configured. Max price zero, plugins empty, paid fallback disabled, one attempt, 35 seconds. Optional reasoning disabled only for these verified models. OPENROUTER_API_KEY remains private. API observations are ungrounded and can contain inaccurate businesses/addresses; UI explicitly labels that distinction. Real success is point-in-time, not an availability guarantee.

## 8. Next action

No required incident work remains after final release verification. Human usability feedback is optional follow-up. Do not reintroduce the historical unavailable-browser blocker: official bundled node_repl runtime and authenticated owner session are working.

## 9. Acceptance boundary

Analysis, saved review/reload/undo, all three real model answers and responsive reading are verified. Manual screen-reader audit, exhaustive human usability pilot and continuous external-provider availability are not claimed. Free API answers are not the consumer ChatGPT/Gemini search interface. This service never automatically publishes observations or briefs.

## 10. Reproduction

node --import tsx --test tests/aeo-workspace.test.ts tests/aeo-review.test.ts tests/aeo-workers.test.ts tests/pages-production-release.test.ts tests/pages-config-parity.test.ts; app/functions tsc; scoped eslint; npm run build:cf; guarded scripts/release/pages-production.ts deploy. Private helper F:/Claude/aeo-production-20260905/_implementation/release-runner.py obtains existing Wrangler OAuth in memory. Browser session access only via the bundled browser runtime; no token extraction.

## 11. Backup and mutation boundary

No new migration in this repair. Existing additive migrations 0062/0063 retained. Private d1-before.sql SHA256 8c1ce37aa546171a4415217adae9c4a3a55f11e6b0145323b7821c6a27db5a0d. Local structural restore requires ignoring an excerpt CHECK due to export/SQLite discrepancy; live invalid excerpt count zero. Never commit backup/credentials. Preserve node_modules junction. No paid calls, Telegram sends, financial operations or public content saves.

## 12. Release and rollback

Owner explicitly authorized push/deploy. Pages ai-direct-pro-landing; auto deploy disabled. Use guarded upload, preserve production vars and D1/KV/R2/service/queue/AI bindings. Rollback UI polish to 3770603 / 909e5d1f if needed; this baseline has all three successful provider canaries. Do not revert the validated GitHub credential or drop AEO tables. Older c123678 reintroduces the provider transport defect.
