// Provider-neutral AI contracts. Provider wire formats, Cloudflare bindings,
// channel types and product prompts must stay behind driver adapters.

export type AiTask =
  | 'chat'
  | 'intent'
  | 'analysis'
  | 'structured'
  | 'transcription';

export type AiTier = 'default' | 'economy' | 'quality' | 'free' | 'paid';
export type AiMessageRole = 'system' | 'user' | 'assistant';
export type AiMetadataValue = string | number | boolean | null;

export interface AiMessage {
  role: AiMessageRole;
  content: string;
}

export interface AiCompletionRequest {
  messages: readonly AiMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, AiMetadataValue>>;
  signal?: AbortSignal;
}

export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface AiDriverRequest extends AiCompletionRequest {
  task: AiTask;
  model?: string;
}

export interface AiDriverTextResult {
  text: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  usage?: AiUsage;
  /** Internal provider attempts, when the wrapped implementation exposes it. */
  attempts?: number;
}

export interface TextCompletionDriver {
  complete(request: AiDriverRequest): Promise<AiDriverTextResult>;
}

export interface StructuredCompletionDriver {
  /** Must request JSON-capable output; facade performs final runtime validation. */
  structured(request: AiDriverRequest): Promise<AiDriverTextResult>;
}

export interface AiStreamEvent {
  delta?: string;
  done?: boolean;
  usage?: AiUsage;
}

export interface StreamingDriver {
  stream(request: AiDriverRequest): Promise<AsyncIterable<AiStreamEvent>>;
}

export interface AiAudioInput {
  bytes: ArrayBuffer;
  mimeType: string;
  fileName?: string;
  durationSeconds?: number;
}

export interface AiTranscriptionSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface AiTranscriptionResult {
  text: string;
  language?: 'ru' | 'uz' | 'other';
  provider?: string;
  model?: string;
  latencyMs?: number;
  segments?: readonly AiTranscriptionSegment[];
}

export interface TranscriptionDriver {
  transcribe(input: AiAudioInput, signal?: AbortSignal): Promise<AiTranscriptionResult>;
}

/** Capability registration: drivers implement only the operations they support. */
export interface AiDriverRegistration {
  id: string;
  complete?: TextCompletionDriver['complete'];
  structured?: StructuredCompletionDriver['structured'];
  stream?: StreamingDriver['stream'];
  transcribe?: TranscriptionDriver['transcribe'];
}

export interface AiAttempt {
  driver: string;
  model?: string;
  status: 'ok' | 'error';
  errorCode?: string;
  latencyMs: number;
}

export interface AiResultMetadata {
  driver: string;
  provider?: string;
  model?: string;
  latencyMs: number;
  usage?: AiUsage;
  attempts: readonly AiAttempt[];
}

export interface AiTextResult extends AiResultMetadata {
  text: string;
}

export interface AiStructuredResult<T> extends AiResultMetadata {
  value: T;
}

export interface AiTranscriptionOutcome extends AiResultMetadata {
  text: string;
  language?: 'ru' | 'uz' | 'other';
  segments?: readonly AiTranscriptionSegment[];
}

/** Validation-library-neutral runtime schema (zod/valibot/manual parsers fit). */
export interface AiRuntimeSchema<T> {
  parse(value: unknown): T;
}
