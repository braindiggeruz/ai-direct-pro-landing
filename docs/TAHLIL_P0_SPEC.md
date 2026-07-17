# GPTBot Tahlil: Content Analysis P0

## Metadata

- **Status:** Approved
- **Owner:** GPTBot.uz release owner
- **Reviewer:** Product owner (user approval: "финальная киллер-фича — всё приступай")
- **Created:** 2026-07-17
- **Target:** Production validation P0
- **Related spec:** `docs/VOICE_TO_REPLY_P0_SPEC.md`
- **Public route:** existing Telegram webhook `/api/telegram/assistant`

## Context

GPTBot Javob already converts a forwarded Telegram voice or audio message into a transcript and a ready-to-send reply. The next validated user job is not to judge a speaker, but to understand the content of a negotiation: identify concrete claims, internal contradictions, vague promises, and useful follow-up questions. The feature is named GPTBot Tahlil and is an additive action under the existing voice result.

The product MUST NOT present itself as a lie detector, credibility score, emotion detector, or evidence system. Audio-only deception detection is not reliable enough for production decisions, and users may otherwise apply false confidence to employment, family, legal, or punitive decisions. P0 therefore analyzes the transcript only. It never labels a person truthful or deceptive, never outputs a probability of deception, and never recommends punishment or adverse action.

The existing voice pipeline already downloads audio in memory and discards it after transcription. Because the Tahlil action is clicked after the reply is delivered, timestamp segments MUST be captured during the original STT request and retained with the existing 24-hour voice item. The analysis action MUST reuse the retained transcript and timestamp segments; it MUST NOT download or retain audio again.

P0 is a seven-day validation product. It includes a one-time consent acknowledgement, one free analysis per UTC day, a structured basic report, verification questions, a non-functional Day Pass payment-intent screen, deletion, RU/Uzbek Latin support, and privacy-safe analytics. Acoustic analysis, diarization, authenticity detection, comparison mode, and real payments are explicitly deferred.

## Goals

- Add a safe `Analyze content` action to every eligible voice result without changing text Javob or the existing voice reply.
- Extract verifiable claims, concrete internal contradictions, and uncertain formulations from RU, Uzbek Latin, or mixed transcripts.
- Generate direct, neutral questions that help the user verify details themselves.
- Default to abstention when the transcript is too short, contains no claims, or the structured result is unsafe or invalid.
- Measure analysis demand, usefulness, repeat use, paywall interest, and harmful-use attempts without storing message text in analytics.
- Retain transcripts and reports for approximately 24 hours while never persisting audio.

## Functional Requirements

- FR-1: The existing voice reply keyboard MUST add one full-width `Analyze content` callback action and MUST preserve shorter, softer, confident, and RU/UZ modifier callbacks.
- FR-2: The analysis action MUST only operate on an owned, unexpired `telegram_items` row whose `source_type` is `voice`.
- FR-3: On the first analysis attempt, the system MUST show a localized consent notice stating that the result is not evidence of lying, that audio is not retained, that the tool must not be used for accusation/court/punishment, and that the user confirms a right to analyze the audio.
- FR-4: The consent notice MUST offer `Understand, continue` and `Cancel`; analysis MUST NOT start before affirmative consent, and affirmative consent MUST be stored with a version and timestamp in `user_preferences`.
- FR-5: A user with stored current-version consent MUST NOT be asked again unless the consent version changes.
- FR-6: A cancelled consent action MUST NOT call an LLM, consume quota, or create an analysis report.
- FR-7: Groq transcription requests MUST request segment timestamps with `response_format=verbose_json` and `timestamp_granularities[]=segment`; existing plain transcript and provider fallback behavior MUST remain compatible.
- FR-8: The transcription adapter MUST normalize only safe segment fields (`start`, `end`, `text`, optional quality metadata) and MUST NOT retain tokens, audio bytes, Telegram file identifiers, or protected URLs.
- FR-9: Successful voice items MUST store normalized timestamp segments with the same expiry as the existing transcript so a later callback can analyze content without audio.
- FR-10: The analysis action MUST reject voice items shorter than 10 seconds with localized copy and MUST NOT consume analysis quota.
- FR-11: The analysis action MUST use a quota separate from reply generations and allow one successful free analysis per user per UTC day.
- FR-12: Reopening an existing, unexpired report for the same item MUST return the cached report without a new LLM call or quota consumption.
- FR-13: Analysis quota MUST be consumed exactly once and only after a valid report is stored, using a unique idempotency key.
- FR-14: After consent and quota preflight, the bot MUST send a localized processing message containing the voice duration and a neutral description of the content checks.
- FR-15: The analysis provider MUST receive the transcript as untrusted data and return strict structured JSON containing a summary, claims, contradictions, hedging findings, questions, and a content-sufficiency assessment.
- FR-16: The default analysis model MUST be `openai/gpt-4o-mini` through the existing server-side OpenRouter key and MAY be overridden by `OPENROUTER_MODEL_ANALYSIS`.
- FR-17: The provider request MUST use JSON Schema structured output, low temperature, a bounded output size, a bounded timeout, and parameter-compatible provider routing.
- FR-18: The structured result MUST be parsed and validated locally; unknown fields, malformed arrays, unsupported confidence values, overlong strings, and unsafe content MUST be rejected or removed before persistence.
- FR-19: Low-confidence findings MUST NOT be displayed. The report MUST show no more than five total claim/contradiction/hedging markers and no more than five questions.
- FR-20: A contradiction MUST only be displayed when it references two concrete statements from the same transcript and has high confidence. Medium-confidence items MAY be displayed only as `unclear formulation`, never as contradiction.
- FR-21: Every report MUST contain a rule-based localized disclaimer that it is content analysis and not evidence of lying or deception.
- FR-22: LLM-generated report fields MUST NOT contain allegations of lying/deception, truth scores, deception probabilities, emotion-as-deception claims, adverse-action recommendations, or statements that a person is guilty/untrustworthy.
- FR-23: Unsafe LLM fields MUST be removed before report assembly. If sanitization leaves no meaningful structured content, the system MUST abstain instead of inventing a finding.
- FR-24: When no supported finding remains, the system MUST state that no substantive inconsistency was found and MUST clarify that this means insufficient evidence, not proof of truthfulness.
- FR-25: The report formatter MUST be deterministic, localized, plain-text safe, and split output using the existing Telegram message splitting behavior without interpolating HTML.
- FR-26: A completed report MUST provide callbacks for verification questions, details/paywall, and deletion.
- FR-27: The questions callback MUST return the stored questions for an owned, unexpired report and MUST NOT call the LLM again.
- FR-28: The details callback MUST show the proposed Day Pass price of 4,900 UZS, describe deferred extended-analysis features, and provide `Day Pass` and `Later` callbacks.
- FR-29: The Day Pass callback in P0 MUST only record `payment_intent` and explicitly state that online payment is being connected; it MUST NOT create an order, charge a user, or grant entitlement.
- FR-30: The delete callback MUST hard-delete the owned analysis report and timestamp segments and MUST clear the retained transcript for that voice item; it MUST NOT delete usage-ledger rows that enforce quota.
- FR-31: `/delete_me` MUST delete consent preferences and all owned analysis reports in addition to the existing Javob user data.
- FR-32: A direct text question asking whether someone is lying MUST receive a fixed localized scientific-boundary response and MUST NOT call the reply LLM.
- FR-33: Direct text requests explicitly seeking child interrogation, court evidence, firing/punishment, or proof of infidelity MUST receive a fixed refusal and emit `harmful_use_detected` without storing the request text in analytics.
- FR-34: The service MUST emit `analysis_requested`, `analysis_consent_shown`, `disclaimer_understood`, `analysis_cancelled`, `analysis_started`, `analysis_completed`, `analysis_failed`, `analysis_questions_opened`, `paywall_shown`, `payment_intent`, `analysis_deleted`, `analysis_limit_reached`, `analysis_rated_useful`, `analysis_rated_useless`, `harmful_use_detected`, and `lie_question_detected` as applicable.
- FR-35: Analysis event metadata MUST be allowlisted and MAY include locale, language, duration bucket, timeline quality, finding counts, model, and latency bucket; it MUST NOT include transcripts, quotes, questions, Telegram IDs, usernames, file IDs, or secrets.
- FR-36: Existing text replies, voice transcript/reply order, update deduplication, modifier quota, lead-capture webhook, and webhook authentication MUST remain backward compatible.
- FR-37: A displayed marker time MUST be recomputed locally from a quote matched to a normalized STT segment; model-suggested times MUST NOT be trusted. When STT provides no useful multi-segment timeline, marker times MUST be omitted and the report MUST explain that only coarse or unavailable timing was returned.
- FR-38: The basic report MUST surface up to two stored verification questions immediately, retain the callback for all stored questions, and provide owned `Useful`/`Not useful` feedback callbacks that emit content-free validation events without calling an LLM.

## Non-Functional Requirements

### NFR-1: Scientific and harm safety

- The system MUST never output a binary truth/lie label or numeric credibility/deception score.
- The system MUST never infer deception from pitch, pauses, stress, tempo, energy, emotion, accent, gender, age, or health.
- All user-visible findings MUST describe content, not a person's character, intent, guilt, or trustworthiness.
- Fixed boundary/refusal responses MUST be generated from local copy, not an LLM.

### NFR-2: Privacy and authorization

- Audio MUST remain memory-only and become unreachable after the existing voice request completes.
- Every analysis/report/questions/delete callback MUST verify item ownership and expiry.
- Retained transcript segments and reports MUST expire with a default 24-hour TTL.
- Analytics and error logs MUST contain no raw content or identity.
- No user audio or transcript MAY be enrolled in training.

### NFR-3: Reliability

- Provider, parsing, validation, D1, and Telegram failures MUST return localized recoverable copy without consuming analysis quota.
- Duplicate Telegram callbacks MUST not create duplicate reports or duplicate usage.
- The original voice reply MUST remain available when analysis fails.
- Runtime schema bootstrap MUST remain idempotent, while migration `0012_voice_analysis.sql` remains the canonical production schema change.

### NFR-4: Performance

- Quota, ownership, duration, consent, and cached-report checks MUST occur before a new analysis provider call.
- The analysis provider timeout MUST be configurable and hard-capped at 15 seconds.
- During validation, analysis callback-to-report latency SHOULD remain below 20 seconds p95, excluding Telegram delivery delay; latency MUST be recorded only as coarse buckets.
- Report rendering and safety filtering MUST be synchronous local operations and SHOULD complete below 50 ms for permitted input sizes.

### NFR-5: Compatibility

- The implementation MUST use Cloudflare Workers-compatible Web APIs and MUST NOT use Node filesystem, native audio, or Python dependencies.
- Callback payloads MUST remain within Telegram's 64-byte `callback_data` limit.
- All D1 queries MUST be parameterized.

## Acceptance Criteria

### AC-1: Voice reply exposes analysis (FR-1, FR-36)
Given an eligible voice message completes the existing reply flow
When the ready reply is sent
Then its keyboard contains the four existing modifier/language actions
And a separate full-width `Analyze content` action
And the transcript and recommended reply order is unchanged.

### AC-2: First-use consent gate (FR-3, FR-4, FR-6)
Given an owner has never accepted the current Tahlil consent version
When they press `Analyze content`
Then the localized consent notice and two consent buttons are sent
And no OpenRouter analysis request, report row, or analysis usage row is created.

### AC-3: Consent acceptance (FR-4, FR-5)
Given the current consent notice is shown for an owned voice item
When the owner presses `Understand, continue`
Then the consent version and timestamp are stored
And analysis continues for that item
And a later owned item does not show the same consent again.

### AC-4: Consent cancellation (FR-6)
Given the consent notice is shown
When the owner presses `Cancel`
Then a localized cancellation message is sent
And no provider, report, or quota action occurs.

### AC-5: Timestamp capture without audio retention (FR-7, FR-8, FR-9)
Given Groq returns verbose transcription segments
When the existing voice request completes
Then normalized timestamp segments are stored on the voice item until its expiry
And audio bytes, token arrays, Telegram file identifiers, and protected URLs are absent from D1 and analytics.

### AC-6: Successful content analysis (FR-13, FR-14, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-21, FR-22, FR-23, FR-24, FR-25, FR-26)
Given an owned voice item of at least 10 seconds, current consent, available daily quota, and a safe structured provider result
When the user requests analysis
Then a processing message is sent
And a localized report with summary, at most five displayed findings, questions availability, and the mandatory disclaimer is delivered
And one report and one idempotent analysis usage row are stored.

### AC-7: Cached report (FR-2, FR-12, FR-13)
Given an unexpired report already exists for an owned item
When the user presses `Analyze content` again
Then the stored report is delivered
And no provider call or additional quota usage occurs.

### AC-8: Separate one-per-day quota (FR-11, FR-13)
Given a free user has completed one analysis on the current UTC day
When they request a new item analysis
Then the provider is not called
And `analysis_limit_reached` is emitted
And the existing reply-generation quota remains unchanged.

### AC-9: Abstention (FR-10, FR-18, FR-23, FR-24)
Given a voice item is shorter than 10 seconds, has no factual claims, or yields only unsafe/low-confidence findings
When analysis is requested
Then the bot sends the appropriate localized abstention message
And does not store a completed report or consume quota.

### AC-10: Safety filter (FR-19, FR-20, FR-21, FR-22, FR-23, FR-24, NFR-1)
Given a provider result contains a lie allegation, deception probability, adverse-action recommendation, or low-confidence contradiction
When local validation runs
Then that content is never shown or persisted
And the report either contains remaining safe content or abstains.

### AC-11: Verification questions (FR-26, FR-27)
Given an owned unexpired report with stored questions
When the owner presses `Questions for verification`
Then the stored localized questions are sent without an LLM call
And `analysis_questions_opened` is emitted.

### AC-12: Details and payment intent (FR-28, FR-29)
Given an owned unexpired report
When the owner presses `Details`
Then the Day Pass 4,900 UZS validation paywall is shown
And pressing Day Pass records `payment_intent`
And no payment order, transaction, or entitlement is created.

### AC-13: Delete analysis data (FR-30)
Given an owned voice report exists
When the owner presses delete
Then the report, timestamp segments, and retained transcript are removed or cleared
And later report/modifier callbacks return the normal stale response
And the analysis usage row remains for quota integrity.

### AC-14: Full user erasure (FR-31)
Given a user has voice items, reports, consent, and usage
When `/delete_me` is processed
Then all user-owned rows including reports and preferences are deleted
And only content-free pseudonymous aggregate events may remain.

### AC-15: Lie question boundary (FR-32)
Given a private text message asks whether a person is lying
When the message is handled
Then the fixed scientific-boundary response is sent
And no item, reply LLM request, or main-generation usage is created.

### AC-16: Harmful-use refusal (FR-33)
Given a private text request explicitly seeks child interrogation, court evidence, firing/punishment, or proof of infidelity
When the request is handled
Then the fixed refusal is sent
And `harmful_use_detected` contains only an allowlisted category.

### AC-17: Failure isolation (FR-13, NFR-3)
Given OpenRouter times out, returns a non-2xx response, returns invalid JSON, or D1 report storage fails
When analysis runs
Then the user receives localized retry copy
And no analysis quota is consumed
And the original transcript and reply remain usable.

### AC-18: Regression and release gate (FR-34, FR-35, FR-36, NFR-5)
Given implementation is complete
When the Telegram suite, complete repository tests, TypeScript, scoped ESLint, spec validation, production build, remote migration, webhook smoke, and RU/UZ live voice checks run
Then all feature-scoped checks pass before production promotion
And the old lead webhook remains untouched.

### AC-19: Grounded timestamp display (FR-37)
Given the provider suggests marker times that do not come from useful STT segmentation
When the report is assembled
Then each time is replaced by the start of a quote-matching STT segment
And a single coarse segment or unmatched quote produces no displayed marker time instead of repeated `00:00`.

### AC-20: Action-first questions and validation feedback (FR-38)
Given a completed owned report contains verification questions
When the basic report is shown
Then up to two stored questions are visible without another tap
And owned useful/useless feedback records only a pseudonymous event and never transcript or question text.

## Edge Cases

- EC-1: Voice duration is 3-9 seconds → normal reply remains, analysis callback returns `too short`, no quota.
- EC-2: Existing historical voice item has no timestamp segments → analyze text without fabricated timestamps; report omits time labels.
- EC-3: Groq segment contains negative, reversed, non-finite, or out-of-duration times → drop the invalid segment.
- EC-4: OpenAI fallback returns text without segments → preserve reply flow and allow timestamp-free text analysis.
- EC-5: Provider returns malformed JSON or a schema refusal → fail safely, no report or quota.
- EC-6: Provider returns more than allowed findings/questions → sanitize, prioritize safe high-confidence contradictions, then claims, then medium-confidence hedging, and cap output.
- EC-7: Provider repeats transcript instructions or system text → treat as unsafe output and abstain if no safe content remains.
- EC-8: Transcript itself contains banned lie words as quoted speech → do not accuse; omit unsafe quote fields while allowing unrelated safe content findings.
- EC-9: Two callbacks request the same new item simultaneously → unique item report constraint and idempotent ledger prevent double completed usage; one stored report is returned.
- EC-10: Consent preference row predates new columns → idempotent runtime ALTERs add nullable fields without losing preferences.
- EC-11: User deletes report while another callback opens questions → ownership/report lookup fails closed with stale copy.
- EC-12: Report text exceeds one Telegram message → existing splitter sends safe chunks; keyboard appears on the final report message.
- EC-13: No questions are returned → questions callback sends localized `no questions` copy and never invents questions.
- EC-14: D1 is temporarily unavailable → Telegram webhook remains acknowledged; background processing logs a content-free error and does not charge usage.
- EC-15: STT returns one segment spanning the whole recording → analyze the transcript but hide per-finding `00:00` labels and disclose coarse timing.
- EC-16: Feedback callback is replayed → content-free duplicate events are acceptable for P0 validation, but it MUST NOT call a provider, charge quota, or expose report text.
- EC-17: Direct message contains the word `обман` as a customer complaint but does not ask for lie detection or punishment → normal Javob reply flow remains; safety interception requires explicit detector/adverse-action intent.
- EC-18: Expired item/report callback → normal stale response; no provider call.
- EC-19: A non-owner replays any analysis callback → normal stale response; no existence disclosure.
- EC-20: Payment-intent callback is replayed → analytics may dedupe by Telegram update; no financial state changes exist in P0.

## API Contracts

### Existing POST /api/telegram/assistant

The public Telegram webhook request and immediate `200 ok` response remain unchanged. New behavior is expressed only through callback data inside existing Telegram updates.

```ts
type TahlilCallbackData =
  | `analyze:${string}`
  | `analysis_consent:accept:${string}`
  | `analysis_consent:cancel:${string}`
  | `analysis_questions:${string}`
  | `analysis_feedback:useful:${string}`
  | `analysis_feedback:useless:${string}`
  | `analysis_details:${string}`
  | `analysis_pay_intent:${string}`
  | `analysis_later:${string}`
  | `analysis_delete:${string}`;
```

### Timestamp segment

```ts
interface TranscriptSegment {
  start: number;          // seconds, >= 0
  end: number;            // seconds, >= start
  text: string;           // normalized, bounded
  avgLogprob?: number;    // retained only for internal quality gating
  noSpeechProb?: number;  // retained only for internal quality gating
}
```

### Structured analysis result

```ts
type FindingConfidence = 'high' | 'medium' | 'low';

interface AnalysisClaim {
  timeSec: number | null;
  quote: string;
  kind: 'fact' | 'promise' | 'price' | 'date' | 'availability' | 'other';
  explanation: string;
  confidence: FindingConfidence;
}

interface AnalysisContradiction {
  firstTimeSec: number | null;
  firstQuote: string;
  secondTimeSec: number | null;
  secondQuote: string;
  explanation: string;
  confidence: FindingConfidence;
}

interface AnalysisHedging {
  timeSec: number | null;
  quote: string;
  explanation: string;
  confidence: FindingConfidence;
}

interface TranscriptAnalysis {
  sufficient: boolean;
  insufficiencyReason: 'none' | 'no_claims' | 'unclear_transcript' | 'unsafe_request';
  summary: string;
  claims: AnalysisClaim[];
  contradictions: AnalysisContradiction[];
  hedging: AnalysisHedging[];
  questions: string[];
}

interface AnalysisProviderResult {
  ok: boolean;
  analysis?: TranscriptAnalysis;
  model?: string;
  provider: 'openrouter';
  latencyMs: number;
  errorCode?: 'no_key' | 'timeout' | 'provider_error' | 'invalid_json' | 'unsafe_output' | 'insufficient_content';
}
```

### Environment additions

```ts
interface Env {
  OPENROUTER_MODEL_ANALYSIS?: string;       // default openai/gpt-4o-mini
  TELEGRAM_ANALYSIS_TIMEOUT_MS?: string;    // default 12000, hard max 15000
  TELEGRAM_ANALYSIS_TTL_HOURS?: string;     // default/max 24
  TELEGRAM_ANALYSIS_FREE_DAILY?: string;    // default/max 1 for P0
}
```

## Data Models

### Migration `0012_voice_analysis.sql`

#### `telegram_items` additions

| Field | Type | Constraints |
|---|---|---|
| `transcript_segments_json` | TEXT | Nullable JSON; safe timestamp segments only; cleared on expiry/delete |

#### `user_preferences` additions

| Field | Type | Constraints |
|---|---|---|
| `analysis_consent_version` | TEXT | Nullable; exact current policy version |
| `analysis_consent_at` | TEXT | Nullable ISO-8601 UTC |

#### `analysis_reports`

| Field | Type | Constraints |
|---|---|---|
| `id` | TEXT | Primary key |
| `telegram_user_id` | INTEGER | Not null; owner |
| `item_id` | TEXT | Not null; unique; owned voice item |
| `language` | TEXT | `ru`, `uz`, or `other` |
| `summary` | TEXT | Sanitized, bounded |
| `transcript_with_timestamps` | TEXT | Nullable JSON/text derived from safe segments |
| `claims_json` | TEXT | Sanitized JSON array |
| `contradictions_json` | TEXT | Sanitized JSON array |
| `hedging_json` | TEXT | Sanitized JSON array |
| `questions_json` | TEXT | Sanitized JSON array |
| `quality_assessment` | TEXT | `granular_timestamps`, `coarse_timestamps`, or `transcript_only` |
| `provider` | TEXT | `openrouter` |
| `model` | TEXT | Nullable provider model ID |
| `prompt_version` | TEXT | Not null |
| `latency_ms` | INTEGER | Non-negative, internal |
| `created_at` | TEXT | ISO-8601 UTC |
| `expires_at` | TEXT | ISO-8601 UTC, default 24 hours |

Indexes:

- unique index on `analysis_reports(item_id)`;
- index on `analysis_reports(telegram_user_id, expires_at)`;
- index on `analysis_reports(expires_at)`.

Deletion:

- `analysis_delete` removes the report and clears transcript/segments on the owned item;
- `/delete_me` removes all report rows and consent preferences;
- opportunistic cleanup removes expired reports and clears/deletes expired parent items under existing retention behavior.

### Usage ledger extension

`usage_ledger.usage_type` accepts the additional logical value `analysis`. Existing schema is TEXT and requires no column migration. P0 usage decisions count successful `analysis` rows since UTC day start. Ledger rows are retained for quota integrity until `/delete_me`.

## Out of Scope

- OS-1: Any lie detector, truth score, credibility percentage, guilt label, or deception classification — scientifically invalid and harmful.
- OS-2: Acoustic emotion, stress, pitch, jitter, shimmer, tempo, energy, or change-point analysis — not needed for P0 and MUST NOT be used as a deception proxy.
- OS-3: Speaker diarization or multi-speaker attribution — requires a separate Python/inference architecture and evaluation.
- OS-4: Audio authenticity, deepfake, splice, or codec-forensics detection — separate P2 product with its own evaluation set.
- OS-5: Comparison of two recordings or comparison with previous recordings — deferred P1; no cross-item content retrieval in P0.
- OS-6: Personal speaker baseline, voice fingerprinting, or biometric enrollment — privacy review and explicit opt-in required.
- OS-7: Real Click/Payme checkout, payment webhooks, or entitlement grants — current P0 only records payment intent.
- OS-8: Extended paid timeline, claim certainty UI, and paid report unlock — shown as proposed value, not generated or sold in P0.
- OS-9: Public report sharing, export, PDF, legal report, or evidence package — abuse and privacy risk.
- OS-10: Automatic actions against a person, automatic message sending, employment decisions, court use, punishment, surveillance, or child interrogation.
- OS-11: Training or fine-tuning on user audio/transcripts — no opt-in and no approved dataset.
- OS-12: A guaranteed 20-second SLA — P0 measures a p95 target under external-provider constraints.

## Verification Plan and Traceability

| Requirement group | Verification |
|---|---|
| FR-1..FR-10 | Telegram keyboard, consent, timestamp adapter, ownership, and duration tests |
| FR-11..FR-13 | Separate daily quota, idempotency, cached report, and failure-no-charge tests |
| FR-14..FR-25 | Mocked structured OpenRouter response, parser, sanitizer, formatter, caps, disclaimer, and abstention tests |
| FR-26..FR-31 | Questions, paywall intent, deletion, expiry, and `/delete_me` tests |
| FR-32..FR-35 | Fixed lie-question/refusal copy and content-free analytics assertions |
| FR-36, NFR-3..5 | Existing full suite, TypeScript, scoped ESLint, build, migration, and production smoke |
| FR-37 | Unit and integration tests for local quote-to-segment grounding, coarse-segment omission, and cached-report re-grounding |
| FR-38 | Integration tests for inline top questions and owned useful/useless feedback without provider or quota use |

Production promotion requires: migration 0012 applied remotely; no pending migrations; RU and Uzbek voice reply regression; first-use consent; one successful Tahlil report; cached reopen; questions; deletion; second-item daily-limit path; unauthenticated webhook still 401; old lead webhook unchanged; and aggregate events inspected without raw content.
