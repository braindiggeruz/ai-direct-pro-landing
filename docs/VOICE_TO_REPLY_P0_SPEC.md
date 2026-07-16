# GPTBot Javob: Voice-to-Reply P0

## Metadata

- **Status:** Approved
- **Owner:** GPTBot.uz release owner
- **Reviewer:** Product owner (user approval: "давай реализуем")
- **Created:** 2026-07-16
- **Target:** Production P0
- **Related system:** Telegram assistant webhook `/api/telegram/assistant`

## Context

GPTBot Javob already turns forwarded or directly entered Telegram text into a concise, context-aware reply. A common real-world input is a voice message: the user must currently listen, transcribe mentally, and then write a response. The current bot treats a voice message as unsupported content and returns onboarding instead of completing the job.

P0 adds one complete job-to-be-done: forward a Telegram voice or audio message and receive a ready-to-send text reply. The feature must preserve the existing text experience, privacy boundary, quota model, RU/Uzbek Latin behavior, and safety validation.

Success means a user can forward a supported voice message, see an immediate processing acknowledgement, and receive a clean text reply with relevant one-tap modifiers. Audio bytes are processed only in memory and are never persisted by GPTBot Javob.

## Goals

### Goals

- Accept private-chat Telegram `voice` and `audio` messages with duration from 3 through 300 seconds.
- Download the media through the official Telegram Bot API, enforcing the 20 MB Bot API download limit before and after download.
- Transcribe multilingual RU/Uzbek speech with Groq Whisper as the primary provider and an optional OpenAI transcription fallback.
- Pass the transcript through the existing classifier, prompt, safety validator, quota, storage, and modifier pipeline.
- Produce a short deterministic situation summary followed by a clean copyable reply.
- Show voice-specific buttons: shorter, softer, more confident, and RU/UZ language switch.
- Keep text-message behavior byte-for-byte compatible at the public API level.
- Record privacy-safe operational events and latency buckets without raw audio or transcript data.

## User Stories

### US-1: Reply to a voice message

As a Telegram user, I want to forward a voice message and receive a suggested text reply so that I do not need to listen and compose manually.

### US-2: Reply to an audio attachment

As a Telegram user, I want an audio attachment to use the same flow when its type, size, and duration are supported.

### US-3: Keep the reply in the right language

As a Russian or Uzbek Latin speaker, I want the reply to follow the detected source language and my chosen modifier so that it is ready to send.

### US-4: Understand processing and failures

As a user, I want immediate, localized status and actionable error messages so that I know whether to retry or send a shorter message.

### US-5: Preserve privacy

As a privacy-conscious user, I want audio to be processed in memory and discarded so that the service does not build an audio archive.

## Functional Requirements

- FR-1: **Telegram input detection.**

The handler MUST recognize `message.voice` and `message.audio` in private chats. Existing `message.text` and callback behavior MUST remain unchanged. Unsupported media MUST continue to receive the normal onboarding/help response.

- FR-2: **Validation before transcription.**

The handler MUST reject media shorter than 3 seconds, longer than 300 seconds, or declared larger than 20 MB. It MUST check the user's existing daily main-generation quota before incurring transcription cost. The downloaded byte count MUST be checked again even when Telegram omits or misreports `file_size`.

- FR-3: **Immediate acknowledgement.**

For accepted media, the bot MUST immediately send a localized processing message containing the duration, for example `🎧 Слушаю… (0:47)` or `🎧 Eshitayapman… (0:47)`.

- FR-4: **Telegram file retrieval.**

The service MUST call Telegram `getFile`, require a non-empty `file_path`, and download from the official file endpoint using the assistant bot token. It MUST set a bounded timeout and MUST NOT log the token, complete file URL, or audio bytes.

- FR-5: **Speech-to-text providers.**

The primary provider MUST be Groq's OpenAI-compatible transcription endpoint, using `whisper-large-v3` by default. If the primary provider fails and `OPENAI_API_KEY` is configured, the service MUST try the OpenAI transcription endpoint once. Each attempt MUST have a bounded timeout. If no provider is configured or all attempts fail, the user MUST receive a localized retry message.

- FR-6: **In-memory processing.**

Audio MUST be held only in request memory as an `ArrayBuffer`/`Blob`. The application MUST NOT write it to D1, R2, KV, logs, analytics, or the filesystem.

- FR-7: **Transcript handling.**

An empty or whitespace-only transcript MUST be treated as unrecognized speech. A successful transcript MUST be normalized, bounded to the existing source-text limit, classified by the existing classifier, and stored as `source_text` under the same approximately 24-hour retention behavior as text inputs.

- FR-8: **Reply generation and validation.**

The transcript MUST use the existing validated Javob reply engine. When the transcription provider reports Russian or Uzbek, that language hint MUST be passed into classification and the reply prompt. Existing prompt-injection resistance, content safety, output validation, and fail-closed behavior MUST apply.

- FR-9: **Voice result UX.**

On initial success, the bot MUST send a separate short, escaped, deterministic situation summary and then the clean generated reply. The result keyboard MUST contain four voice-relevant actions: shorter, softer, more confident, and the opposite RU/UZ output language. The generic `Другой`/alternative button MUST be omitted for voice results.

- FR-10: **Quota and modifiers.**

One accepted voice-to-reply generation MUST consume exactly one existing `main_generation` unit after successful reply generation. Failed validation, download, transcription, or generation MUST NOT consume quota. Shorter, softer, confident, and language modifiers MUST remain free under the existing per-item modifier limit.

- FR-11: **Persistence.**

Voice-created `telegram_items` rows MUST use `source_type = 'voice'` and store `voice_duration_sec` as an integer. No audio identifier, Telegram `file_path`, provider request body, or audio content may be persisted.

- FR-12: **Analytics.**

The service MUST emit `voice_received`, `stt_started`, `stt_completed`, `stt_failed`, and `voice_reply_generated` as applicable. Metadata MAY include duration bucket, size bucket, provider name, detected language, and latency bucket. It MUST NOT include transcript text, file ID/path, usernames, bot tokens, or audio bytes.

- FR-13: **Onboarding and Telegram profile copy.**

The `/start` message and bot description configuration MUST explain that both text and voice messages can produce a ready reply. Copy MUST not claim a guaranteed completion time.

- FR-14: **Configuration.**

`GROQ_API_KEY` remains the primary required speech-to-text secret. `OPENAI_API_KEY` is optional. Model names, limits, and timeout MAY be overridden by environment variables but MUST have safe defaults.

## Non-Functional Requirements

### NFR-1: Security and privacy

- Secrets MUST be accessed only from Worker environment bindings.
- Error output and analytics MUST be allowlisted and must not interpolate provider bodies or protected Telegram URLs.
- All user-visible transcript-derived HTML MUST be escaped.
- Audio bytes MUST become unreachable after the handler completes.

### NFR-2: Reliability

- Telegram webhook acknowledgement MUST remain immediate; processing continues through the existing `waitUntil` path.
- Telegram download and each transcription request MUST be abortable with bounded timeouts.
- A single provider failure MUST be isolated and MUST not break later text requests.
- Database migration MUST be additive and compatible with already-deployed rows.

### NFR-3: Performance

- Preflight validation MUST avoid media download and STT calls for ineligible inputs.
- The download MUST be streamed/loaded only once and reused for fallback transcription.
- Operational timing MUST be measured in coarse buckets. P0 aims for a fast response but publishes no fixed latency guarantee.

### NFR-4: Compatibility

- The public Telegram webhook route, secret-header verification, update deduplication, lead webhook, and existing text response keyboards MUST remain compatible.
- The implementation MUST run in Cloudflare Workers without Node-only filesystem APIs.

### NFR-5: Observability

- Every terminal voice path MUST have an event or existing error log sufficient to distinguish validation, download, STT, generation, and success failures without sensitive payloads.

## API Contracts

### POST /api/telegram/assistant

The existing webhook accepts Telegram updates and continues to acknowledge valid, authenticated updates immediately. The public request and response schema is unchanged; voice and audio are optional fields inside Telegram's existing `message` object.

### Telegram inbound message extension

```ts
interface TgMedia {
  file_id: string;
  file_unique_id?: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
}

interface TgMessage {
  voice?: TgMedia;
  audio?: TgMedia;
}
```

### Telegram `getFile` result

```ts
interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}
```

### Internal transcription result

```ts
interface TranscriptionResult {
  text: string;
  language: 'ru' | 'uz' | 'other';
  provider: 'groq' | 'openai';
  model: string;
  latencyMs: number;
}
```

### Environment additions

```ts
OPENAI_API_KEY?: string;
GROQ_STT_MODEL?: string;       // default whisper-large-v3
OPENAI_STT_MODEL?: string;     // default gpt-4o-mini-transcribe
TELEGRAM_STT_TIMEOUT_MS?: string;
TELEGRAM_VOICE_MIN_SECONDS?: string;
TELEGRAM_VOICE_MAX_SECONDS?: string;
TELEGRAM_VOICE_MAX_BYTES?: string;
```

## Data Models

### D1 migration

```sql
ALTER TABLE telegram_items ADD COLUMN voice_duration_sec INTEGER;
```

`voice_duration_sec` is nullable for all historical and text-created rows.

| Field | Type | Constraints |
|---|---|---|
| `telegram_items.source_type` | TEXT | Existing field; `voice` for this flow |
| `telegram_items.source_text` | TEXT | Normalized transcript; existing retention applies |
| `telegram_items.source_language` | TEXT | `ru`, `uz`, or `other` |
| `telegram_items.voice_duration_sec` | INTEGER | Nullable; 3 through 300 for accepted voice/audio |

## Edge Cases

- EC-1: Telegram omits `file_size`: proceed only after validating duration, then enforce actual downloaded byte length.
- EC-2: Telegram reports a valid size but returns more than the limit: abort before STT and show the localized size error.
- EC-3: `getFile` succeeds without `file_path`: treat as a retriable download failure without exposing Telegram's response.
- EC-4: The voice has music, silence, or only noise: empty/whitespace STT output follows the unrecognized-speech path.
- EC-5: Provider language is missing or unfamiliar: fall back to the existing text language guesser and the user's locale.
- EC-6: The user exhausts quota between preflight and generation: the existing atomic quota path rejects generation without double charging.
- EC-7: Groq times out after receiving audio: reuse the in-memory blob once for optional OpenAI fallback; never redownload or persist it.
- EC-8: Telegram retries the same update: existing update deduplication prevents duplicate STT cost and replies.
- EC-9: A modifier callback is retried: existing callback answer and item ownership rules apply; no new main generation is consumed.
- EC-10: HTML-like content appears in the transcript: summary text is escaped and the generated reply continues through existing output validation.

## Acceptance Criteria

### AC-1: Voice success (FR-1, FR-3, FR-4, FR-5, FR-8, FR-9)

Given an eligible private-chat `voice` update and working Groq, when the update is handled, then the bot acknowledges processing, sends a summary and validated reply, and shows the four voice buttons.

### AC-2: Audio success (FR-1, FR-4, FR-5)

Given an eligible `audio` update, when the update is handled, then the same pipeline runs with a safe filename and MIME type.

### AC-3: Text regression (FR-1)

Given a normal text update or existing callback, when it is handled, then behavior and public contracts remain unchanged.

### AC-4: Boundaries and quota preflight (FR-2, FR-10)

Given input below 3 seconds, above 300 seconds, above 20 MB, or a user without quota, when it is handled, then it is rejected before paid transcription/generation and no quota is consumed.

### AC-5: Provider fallback (FR-5, FR-14)

Given Groq fails and OpenAI is configured, when transcription runs, then OpenAI is attempted once and its successful transcript continues through the normal flow.

### AC-6: Safe transcription failure (FR-5, FR-7, FR-10)

Given all providers fail or return empty text, when transcription ends, then a localized retry message and `stt_failed` event are produced without item creation or quota use.

### AC-7: Language hints (FR-7, FR-8)

Given a Russian or Uzbek provider language hint, when classification and generation run, then the hint overrides ambiguous guessing and constrains the reply language.

### AC-8: Privacy and analytics (FR-6, FR-12)

Given any terminal voice path, when storage, analytics, and logs are inspected, then no audio, transcript, Telegram file identifier/path, protected URL, or secret is present outside the retained item transcript allowed by FR-7.

### AC-9: Persistence and modifiers (FR-9, FR-10, FR-11)

Given a successful voice item, when it is stored and modified, then it has `source_type=voice`, its duration, no alternative button, and free modifiers update the same owned item.

### AC-10: Product copy (FR-13)

Given `/start` and bot profile copy, when a user reads them, then both text and voice are advertised without a guaranteed-time claim.

### AC-11: Additive migration (FR-11)

Given the production schema with historical rows, when migration 0011 applies, then existing rows remain valid and the runtime store can read and write nullable voice durations.

### AC-12: Release gate (FR-1, FR-2, FR-4, FR-5, FR-7, FR-8, FR-9, FR-10, FR-12, FR-14)

Given the implementation is complete, when unit/integration tests, TypeScript, lint, build, migration, and production smoke checks run, then every check passes before promotion.

## Out of Scope

- OS-1: Recording or composing voice replies.
- OS-2: Video, video-note, screenshot, document, or OCR ingestion.
- OS-3: Speaker diarization, word-level timestamps, or a full verbatim transcript UI.
- OS-4: Team workspaces, CRM integrations, auto-send, or autonomous replies.
- OS-5: New payment rails, peer-to-peer payments, or enabling paid plans.
- OS-6: A guaranteed 15-second end-to-end SLA; external providers and the Workers execution window make this a measured target, not a promise.
- OS-7: Durable background processing with Queues. This is a later reliability upgrade if production timings require it.

## Verification Plan and Traceability

| Requirement | Verification |
|---|---|
| FR-1, AC-1..3 | Telegram handler tests with voice, audio, text, and callback fixtures |
| FR-2, AC-4 | Boundary tests for duration, declared size, downloaded size, and preflight quota |
| FR-4..6, AC-5..8 | Mocked `fetch` tests for getFile, download, timeouts, provider fallback, and memory-only contracts |
| FR-7..10, AC-1, AC-6, AC-7, AC-9 | Handler/service tests for empty STT, language override, summary, reply keyboard, modifiers, and quota |
| FR-11, AC-11 | Local schema test plus remote D1 migration apply/list before production release |
| FR-12, AC-8 | Analytics assertion tests using allowlisted metadata only |
| FR-13, AC-10 | Copy snapshot/string assertions and Telegram setup dry checks |
| NFR-2..4, AC-3, AC-12 | Existing full suite, `tsc --noEmit`, ESLint, production build, and webhook smoke tests |

Production release gate: apply migration, configure existing `GROQ_API_KEY`, deploy, verify webhook status, send one short RU voice and one short Uzbek voice, exercise one modifier, confirm no webhook error, and confirm text-forward regression. If production timing regularly exceeds the Workers lifecycle, pause the voice flag and move processing to a Queue before broad promotion.
