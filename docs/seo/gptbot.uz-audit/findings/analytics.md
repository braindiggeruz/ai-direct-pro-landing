# Analytics and conversion audit — 2026-09-06

Initial read-only inspection followed by the explicitly assigned local fix recorded below. No GA4 configuration, provider requests, paid API calls, deployment or external messages were made by this audit. Public Google documentation and the public gtag.js asset were inspected. GA4 observations below were supplied by the coordinating audit, not independently re-exported here.

## P1 — Empty streaming response can count as a successful answer (confirmed)

- `src/gpt-chat/api.ts:121` accepts a `done` SSE event as `ok: true` without requiring answer text.
- `src/gpt-chat/components/AiChatConsole.tsx:374` handles that outcome as a completed answer, stores an empty assistant message and emits `ai_response_success` at line 384. The JSON branch already checks `res.answer`.
- Offline reproduction on the real imported `sendChatStream` function, replacing `fetch` with an in-memory `Response`:

| Fixture | Actual result | Text |
| --- | --- | --- |
| `data: {"type":"done"}\n\n` | `{"mode":"stream","ok":true,"gotText":false}` | empty |
| `data: {"type":"delta","text":"Hello"}\n\ndata: {"type":"done"}\n\n` | `{"mode":"stream","ok":true,"gotText":true}` | Hello |

Impact: a malformed or empty upstream completion can produce a blank answer and inflate successful-answer analytics. This reproduction establishes a frontend defect; it does not establish that historical production events contained empty answers.

Smallest safe fix: require meaningful non-whitespace response text before returning successful completion. A terminal event with no usable text should return a bounded error code and take the existing error path. Preserve successful text responses, partial-error behavior and intentional Stop behavior. Add offline regression cases for empty done, whitespace-only text plus done, valid text plus done, partial text plus error, and user abort. No SEO content changes are needed.

## P2 — Acquisition source anomaly remains unproven as a code root cause

The coordinator observed `composer / (not set)` with 8 sessions for Aug 30–Sep 5. The code sends `source: 'composer'` on `GPTChatMessageSent` and `SendPrompt` (`AiChatConsole.tsx:216–245`), `source: 'site_uz'|'site_ru'` in sidebar events, and article paths in chat-entry events. `analytics.ts:6` allows these values.

Google's [gtag configuration reference](https://developers.google.com/analytics/devguides/collection/ga4/reference/config) documents `campaign_source` and legacy `campaign.source` as campaign overrides. The public gtag asset fetched during this audit maps `campaign_source` to transport field `cs`. This inspection did **not** establish that a top-level custom `source` parameter is promoted to session attribution. The [Measurement Protocol campaign_details reference](https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference/events#campaign_details) gives `source` campaign meaning for that specific event, which the inspected chat code does not emit.

Do not report attribution as repaired or rename dimensions just on this evidence. Next proof must establish the affected event's outgoing fields and account-side processing/mapping, then compare new acquisition records. Existing custom dimensions may depend on `source`.

## Funnel semantics and counting rules

| Stage | Current event | Interpretation / limit |
| --- | --- | --- |
| Article to chat | `article_chat_click` | Navigation intent only; seven selected Uzbek entry articles. |
| Open chat | `chat_opened` | `trackOnce` per route/language within the loaded module, not unique people. |
| Attempt message | `message_sent` | Fired when an allowed send begins; `messageNumber` counts user messages in current conversation. |
| Receive answer | `ai_response_success` | Terminal answer result; fix empty streaming completion above. |
| Error | `ai_response_error` | Includes provider/network/quota outcomes after send; unavailable Turnstile configuration prevents send before this event. |
| Stop | `generation_stopped` | Explicit user action, correctly separate from provider error. |
| Form open / failure | `lead_form_opened`, `lead_form_failed` | Reopen can count again. Turnstile challenge responses currently return before failure event; not all blocked form attempts appear here. |
| Acknowledged enquiry | `generate_lead` | Emitted only after `sendLead` returns `ok: true`; backend storage acknowledgement, not qualified lead or revenue. |

- Legacy PascalCase events deliberately coexist with normalized events. A send emits `GPTChatMessageSent`, `message_sent`, and `SendPrompt`; successful response emits `GPTChatAnswerReceived` and `ai_response_success`; confirmed enquiry emits `generate_lead` and `GPTChatLeadSubmitted`. Do **not** add twins together as separate actions.
- `track()` calls either gtag **or** the dataLayer fallback, avoiding direct double dispatch into both paths. This is already correct.
- `messageNumber = 1` is the first message of a current conversation, not the first-ever message by a visitor. New chat resets conversation history, and regeneration creates another attempt. Use a user/session funnel for conversion rates instead of treating event counts as unique visitors.
- `AiLeadForm.tsx:99–101` gates `generate_lead` on success. `sendLead` checks `ok === true`, and retries reuse an idempotency request ID. The coordinator has already verified `generate_lead` is a GA4 key event; no account change is needed here.
- No prompt, generated answer, contact value or lead request ID is permitted by the chat analytics allowlist. Preserve that boundary in new tracking.

## Diagnostic-traffic limits

`scripts/analytics-snippet.ts:36–38` excludes localhost/local addresses, `/api/` and `/admin-tools/`. A non-local preview hostname is not excluded by this block, and the chat helper has no separate production-only guard. Therefore a Pages preview can load the production measurement ID. No observed preview-session count or production contamination percentage was established. The actual deployed preview domains and other analytics entrypoints should be checked before adding a hostname policy.

Real production browser smoke tests can legitimately create page views and chat events. Direct HTTP API canaries do not execute browser GA4 code. Historical counts should not be labelled visitor-only without excluding known diagnostic sessions.

## Recommended immediate action

Fix and test empty streaming completion first. Keep current event names, SEO pages and campaign attribution behavior intact. Report successful replies, acknowledged enquiries and later qualified leads separately; no sale or revenue is established by the inspected analytics code.

## Local implementation and verification

Implemented in `src/gpt-chat/api.ts`: a streaming `done` event is successful only after non-whitespace answer text. Empty and whitespace-only completions return `empty_response`. The existing `gotText` indicator remains about received deltas so partial/error/abort behavior stays compatible. No event names or `source` parameters were changed.

Added `tests/gpt-chat-stream.test.ts` with six offline cases: empty completion; whitespace-only completion; Unicode text split across individual UTF-8 bytes with metadata; partial response plus provider error; explicit stop after partial text; and JSON compatibility. All six passed with `node --import tsx --test tests/gpt-chat-stream.test.ts`. Scoped ESLint on the two files passed. Fetch is replaced in every test; no provider is contacted.

Integration note sent to the coordinator: the UI's existing `else if (acc)` partial-failure branch accepts whitespace. Changing that condition to `acc.trim()` would show the normal friendly error for whitespace-only failures. The coordinator owns that UI file. This subtask did not commit, push or deploy.
