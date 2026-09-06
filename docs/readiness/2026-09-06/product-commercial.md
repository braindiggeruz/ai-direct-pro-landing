# Product, pricing, authentication and payment UX readiness

September 6, 2026. Read-only source assessment. Main checkout `F:/Claude/gptbot-chat-ui-release-20260905` is verified at `70a734c`; runtime `dd7c91d` is the main-agent release context, not independently fetched in this subtask. Premium candidate was read from the stale, dirty `F:/Claude/gptbot-top3-20260903`; it must not replace the current checkout or be deployed wholesale.

Scope: customer-facing account/payment/history flow, reuse opportunities, conversion semantics, RU/UZ and mobile accessibility. No backend implementation or merchant credentials were reviewed. No live payment, login, lead submission, browser test or fresh analytics pull was performed. Prior SEO/funnel findings are historical evidence, not newly measured revenue.

## Current product boundary

Main is a working **guest free-chat UI with a coming-soon Plus modal**. `src/gpt-chat/components/AiAccountPanel.tsx:34–56` deliberately makes no account API, authentication or checkout call. It accepts account-related props but does not invoke `onAccount`; `paid` therefore remains false through this component. These dormant types/hooks are not proof that paid access works.

Reusable current pieces:

- Dialog/card primitives, 44px send target, 16px input, safe-area padding and reduced-motion rules (`src/gpt-chat/premium.css:82–103,128–164`). Keep the current mobile/CSS release, including its stylesheet guard.
- RU/UZ input handling and IME safety: Enter sends only on non-coarse pointers and outside composition (`AiChatInput.tsx:15–23`). Mobile Enter can create a new line; a send button remains available.
- Existing nine article entries and independent-product distinctions. Keep current shared helpers/templates rather than copying the stale WIP console over the new article-entry work.
- Local current history plus up to ten archived conversations (`storage.ts:110–214`), safe degradation when storage is unavailable, current-session preservation on New Chat (`AiChatConsole.tsx:503–515`).
- Normalized chat/answer/error events and an allowlist that excludes prompt/response/contact fields (`analytics.ts:5–35,86–117`). Lead acknowledgement semantics are explicit in `trackLeadSubmitted` (`analytics.ts:119–132`).
- Business enquiry remains distinct from personal chat. Current B2B offer is gated by business tool plus successful conversation progress (`AiChatConsole.tsx:553–557,841–852`); the pricing page already has an explicit B2B contact and truthful upcoming Plus copy from the previous release.

## Priority work and acceptance

### P0 before paid launch — one server-derived product contract

**Evidence:** main `i18n.ts:145–156,289–300` and WIP `AiAccountPanel.tsx:185–201` hardcode 20,000 UZS, 300 answers/month, 20/hour and 50/day. Copy alternates “messages” and “answers”; response actions have a separate “one message” notice. The visible modal marks the plan upcoming, but other placements omit that state. Backend quota semantics and final commercial terms were not validated here.

**Task:** define a single UI plan view from the validated server configuration: availability, amount/currency, entitlement duration, manual renewal, quota unit, period and reset timestamps. Show a documented forthcoming state until launch readiness is true. Do not infer activation from returning to the browser, a local checkbox or a provider URL.

**Acceptance:** price/quota wording matches the backend-reviewed contract on RU/UZ modal, warning, pricing page and receipt; an unsupported or unavailable provider never yields an active button. A failed/stopped/retried request is described according to actual charging semantics. Expired entitlement never looks active because of cached UI state. No invented unlimited/failover-success promise.

### P0 before auth — isolate guest and account history on shared devices

**Evidence:** `storage.ts:10–12,110–153,156–214` keys current and archived messages only by locale, not identity. `AiChatConsole.tsx:111–124` reduces identity to order id or literal `account`/`guest`; it only changes quota state. WIP uses the same pattern (`AiChatConsole.tsx:108–121`) and logout (`AiAccountPanel.tsx:365–376`) refreshes account state without separating local history. Two free signed-in users collapse to one UI identity. This is a **future integration risk**, not evidence of leaked server-side history today.

**Task:** use an opaque account-scoped storage namespace, with an explicit local guest-history policy on login/logout. Keep the guest session/quota protections. Do not silently migrate another user's visible conversation into a new account or imply that billing identity supplies cloud history.

**Acceptance:** account A → logout → account B on the same browser does not show A's account conversations; guest import is deliberate; RU/UZ switch follows the stated history policy; browser-back and a second tab cannot restore stale account UI. Subscription follows identity across devices only after actual authentication verification; history remains explicitly local unless separately implemented and tested.

### P0 before checkout — terms, pending state and recovery

**Reusable WIP:** `AiAccountPanel.tsx:58–97` fetches account state with timeout and stale-response protection, refreshes on focus, and supports manual refresh. `:125–148` retains a request ID per provider and allowlists HTTPS checkout hosts. `:206–255` shows entitlement, scheduled next period, receipts and pending/cancelled/refunded states. `:341–377` supports refund request and logout. These UI mechanisms can be ported selectively after root verifies the backend contract.

**Confirmed gaps:** `:312–332` renders plain terms text when the locale terms URL is absent, yet payment remains enabled after checking the box. `:52–57` has only generic error/busy flags; no explicit initial-loading or stale-account state. Provider types and labels allow only Click/Payme (`:13,55,125,326–337`), so Uzum is not implemented in this UI. Pending payment is status text with manual/focus refresh, not a timed settlement monitor. A closed/reopened modal retains consent state; contract/version changes are not represented.

**Task:** require a valid current localized terms reference/version before purchase. Distinguish loading, unavailable, authentication required, checkout pending, paid/active, paid/scheduled, failed/cancelled, expired and refund states. Use bounded pending refresh if needed; keep manual recovery, explain delayed provider confirmation and never ask someone to pay again merely because an update timed out. Add Uzum only when its validated backend descriptor/checkout contract exists.

**Acceptance:** missing terms or unavailable merchant disables payment with a clear reason; consent is unchecked for a changed offer; double click, provider switch, reload and browser return preserve one coherent purchase status. Interrupted checkout never falsely activates access. Delayed confirmation eventually updates via explicit check/focus/bounded refresh. Cancelled/refunded/scheduled purchases display the correct consequence. Receipt and terms destinations must follow the backend-reviewed URL policy. Unknown provider values fail closed in the UI.

### P1 now — remove stale upcoming-plan promises outside the modal

**Evidence:** main `AiChatConsole.tsx:853–869` shows `t.premium.offer` after ten answers; `:883–890` uses it as the daily-limit message. RU/UZ offer strings (`i18n.ts:145,289`) advertise a quantified paid plan without “coming soon”. The limit branch hides the composer and offers account/retry/Business; it does not actually render the older Telegram cap card despite the stale comment. `:780` displays `premium.historyNote`, which currently claims subscription access across devices even though the main account panel cannot sign in. `AiSidebar.tsx:52` and `AiChatConsole.tsx:62` send the Uzbek generic pricing action to `/uz/chat-bot-narxi/`, a B2B service-price destination.

**Task:** use state-specific current Free/coming-soon copy at every placement. Restore a useful supported continuation action on the actual cap UI if it is part of the validated product, or clearly explain retry availability; do not advertise upgrading as an immediate solution while checkout is unavailable. Label B2B service pricing separately from personal Plus.

**Acceptance:** fresh free visitor, ten-answer state, low quota, hourly cap, daily cap and archived-history state all agree that Plus is forthcoming. No inactive checkout is implied. “Pricing” destinations distinguish personal access from a commissioned bot. Existing B2B links and protected SEO metadata remain unchanged unless a deliberate reviewed content update is needed.

### P1 before billing pilot — complete conversion measurement without false revenue

**Evidence:** WIP `AiAccountPanel.tsx` contains no `track` calls. Main logs `anonymous: true` in `AiChatConsole.tsx:139,224–229` regardless of future account state. Only some open-price triggers emit pricing events (`:937–940`), while the header account trigger and repeated offer/limit opens have no uniform event. Custom field `source` remains in the analytics allowlist and article context (`analytics.ts:6`, `AiChatConsole.tsx:70,217,236`); its earlier possible GA4 attribution effect remains unproven.

**Task:** instrument a single account-open action and distinct login-start/result, checkout-start/result, pending-resolution and entitlement-confirmed events after their actual transitions. Main/backend decides authoritative purchase reporting and deduplication; this frontend must not report revenue on click. Replace hardcoded anonymity with an observed coarse auth state. Preserve old event continuity where required and do not send transaction receipts, email, names, user messages or payment URLs as analytics parameters.

**Acceptance:** one explicit gesture produces one intended event; retry/reload does not duplicate a purchase; a server-rejected lead never becomes `generate_lead`; checkout abandonment is distinguishable from provider failure; RU/UZ and source surface are measurable without PII. Query/source attribution is investigated before renaming a GA field by assumption. Report paid conversions separately from chat usage and B2B contact clicks.

### P1/P2 — local history usability and retention

**Evidence:** every archived reopen first calls `archiveChat(messages, locale)` (`AiChatConsole.tsx:770–777`), which generates a fresh ID unconditionally (`storage.ts:202–209`). Repeated switching can produce duplicates and evict distinct conversations from the ten-item list. No delete-chat/delete-all action is present in the inspected history UI. Quota cache is day-scoped UTC (`storage.ts:42–72`), not a server reset timestamp or a paid-period namespace.

**Task:** preserve a conversation identity when reopening, update its archive instead of adding duplicate copies, and provide localized removal actions. Explicitly describe local-only retention. Reconcile cached counts against server account/quota state; avoid interpreting a cached paid-period balance as today's free allowance.

**Acceptance:** open A/B repeatedly without duplicate entries; editing A updates A; deleting an archive removes only that archive; clearing history does not reset paid/free quota. Storage-disabled mode keeps chat usable and reports inability to persist when relevant. Unknown quota is shown as unknown/loading rather than negative remaining. Test midnight, active entitlement, expiry and logout against backend reset semantics.

### P2 — targeted mobile/accessibility verification

Keep current primitives rather than redoing the design. Main Dialog defaults to an English “Close” label (`src/components/ui/dialog.tsx:72–84`), and the coming-soon panel uses that default (`AiAccountPanel.tsx:45`). WIP supplies its own localized close button (`:160–182`) and scrollable panel class. WIP consent checkboxes are correctly nested in labels, and errors/statuses use roles; these are reusable basics.

**Acceptance matrix:** RU/UZ at 320/360/393px and a short landscape viewport; enlarged text; keyboard opening/closing/focus return; screen-reader localized dialog title, close, consent, price and pending status; no clipped receipt/refund controls; mobile keyboard cannot cover the purchase/continue control. Verify auth redirect cancellation/back preserves the draft. Respect reduced motion. No accessibility pass is claimed from source presence alone.

## Recommended order and completion boundary

1. Correct main's current-state copy and classify pricing/Business actions; no billing activation required.
2. Root finalizes authentication/entitlement/quota/merchant contract. Port only the WIP account UI portions matching that contract into current main.
3. Implement identity-safe history and terms-gated checkout states before any paid pilot.
4. Run a synthetic state matrix plus mobile/locale checks, then a separately controlled real provider confirmation/receipt/refund check once merchant prerequisites exist.
5. Declare paid access ready only when an authenticated user can pay, return, receive confirmed entitlement, consume the documented quota and recover across devices without misleading history or billing state.

No new feature implementation was performed in this subtask. The report is the only written artifact. Backend/payment routing, revenue economics and provider failover are intentionally assigned to the root review, not inferred from marketing strings.

## Authorized frontend implementation follow-up

After the roadmap, the root explicitly assigned a bounded implementation. The preceding sections describe the initial read-only findings; the following is the **local implemented candidate**, pending the root's full build/browser/release checks.

- Selectively ported the WIP account panel into current main while preserving current article-entry/empty/stream/mobile changes. Account GET must pass structural validation; signed-in users need the opaque server storageKey. Initial or failed account identification cannot display another scope's local history or permit chat submission. A validated guest response remains fully usable when login/payment is unconfigured.
- History, archives, session references and cached allowance now accept a separate opaque account namespace. Guest legacy storage remains supported only for guests; there is no silent guest-to-account import. Identity changes abort the old request and suppress late stream/session callbacks. Auth identity changes start with a fresh server session reference; New Chat continues to preserve server session and quota. This is browser-local separation, not cloud synchronization or encryption.
- Checkout requires an available configured provider, signed-in identity, the current localized HTTPS `gptbot.uz` terms link, nonblank termsVersion and explicit checkbox. Subscribe sends `acceptTerms:true` and that termsVersion. Terms acknowledgement resets when identity/version/URL changes.
- Pending/prepared state blocks creation through another provider. A separate localized **Continue this payment** action uses the server's existing payment.provider, current terms and backend pending-order reuse. It is tracked as checkout_resumed, not a new purchase. HTTP 409 terms_changed disables resuming that invoice and directs the user to status checking. A new payment is never inferred from returning to the browser.
- Pending state gets at most six automatic checks at five-second intervals; focus and explicit status checks remain available. Initial-loading, unavailable, failed, terms-changed, cancelled/refunded/scheduled and receipt UI are retained or improved. Checkout redirects allow only the existing HTTPS merchant hosts and no embedded credentials. Receipt URLs reject unsafe schemes. All actual financial state still comes from backend responses.
- No purchase/revenue event is emitted by account GET. Added coarse account-open/login-start/login-failure/logout/action-failure and checkout-start/resume events through the existing analytics allowlist. Chat's anonymous flag now follows a validated account response instead of always being true. No storageKey, order id, contact, prompt, answer or checkout URL is emitted.
- Quantified Plus offers are shown only when billing is available; the unavailable cap message states that payment is not connected. Local-history descriptions no longer promise active cloud/device synchronization. Successful paid-answer charging copy matches the root-confirmed completed-answer contract; stopped/failed/partial replies are not described as spent answers. Uzbek sidebar pricing is explicitly labelled as business-bot pricing.

Files changed by this subtask:

- `src/gpt-chat/components/AiAccountPanel.tsx`
- `src/gpt-chat/components/AiChatConsole.tsx`
- `src/gpt-chat/components/AiSidebar.tsx` (pricing label only)
- `src/gpt-chat/types.ts`, `storage.ts`, `i18n.ts`
- New `tests/gpt-account-ui.test.ts`, `tests/gpt-account-storage.test.ts`
- Existing `tests/chat-entry.test.ts`: obsolete blanket API ban replaced with AST inspection that effects cannot initiate checkout/login, plus New Chat preservation checks; original article-entry/privacy tests remain.

Validation: **11/11 targeted tests pass**, scoped ESLint has no errors/warnings, `tsc --noEmit -p tsconfig.app.json` passes, diff-check has no whitespace errors. Tests exercise identity/locale isolation, guest legacy boundaries, denied storage, malformed server state, terms/version/merchant gates, pending resumption and unsafe URL rejection. They do not substitute for a real merchant payment or browser state matrix. Root owns adding the new files to the standard test command, full build and final browser checks. No commit/deploy performed by this subtask.

Remaining beyond this bounded implementation: archive identity/deduplication and delete controls, any cross-device history synchronization, Uzum UI/backend contract, draft persistence across external navigation, and real authenticated/merchant acceptance. No claim is made that those remaining items or paid production access are complete.
