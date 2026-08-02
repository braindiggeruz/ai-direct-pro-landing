// Market voice search: audio in, grounded catalog results out.
//
// The pipeline is deliberately thin. Speech recognition is delegated to the
// platform AI facade (which reuses the production Voice-to-Reply stack);
// interpretation is deterministic; and the search itself is the same
// `searchPublishedProducts` call the typed search already makes. Nothing here
// can invent a product, a price or an availability state.
//
// Privacy: audio lives in request memory only, is never persisted and is never
// logged. The transcript is returned to the speaker and to nobody else.
import {
  AiPolicyResolver,
  AiUnavailableError,
  createAiFacade,
  createLegacyTranscriptionDriver,
  type AiFacade,
} from '../../platform/ai';
import { MarketHttpError, marketFlag } from '../../platform/market/http';
import type { Env } from '../../_types';
import type { BuyerCatalogCategory } from '../../agents/sotuvchi';
import { normalizeKnowledgeText } from '../../platform/knowledge';
import {
  interpretVoiceQuery,
  type VoiceInterpretation,
} from './constraints';

export const VOICE_AUDIO_LIMITS = Object.freeze({
  maxBytes: 400_000,
  maxDurationMs: 30_000,
  transcriptionTimeoutMs: 12_000,
});

const ALLOWED_AUDIO_TYPES: ReadonlySet<string> = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
  'application/octet-stream',
]);

const FILE_NAME_BY_TYPE: Readonly<Record<string, string>> = {
  'audio/webm': 'voice.webm',
  'audio/ogg': 'voice.ogg',
  'audio/mp4': 'voice.m4a',
  'audio/x-m4a': 'voice.m4a',
  'audio/mpeg': 'voice.mp3',
  'audio/wav': 'voice.wav',
  'audio/x-wav': 'voice.wav',
  'audio/aac': 'voice.m4a',
  'audio/flac': 'voice.flac',
};

export interface VoiceAudioPayload {
  bytes: ArrayBuffer;
  mimeType: string;
  fileName: string;
  durationSeconds?: number;
}

export interface VoiceSearchInterpretation extends VoiceInterpretation {
  /** Set only when the spoken words name a category that really exists. */
  category: { id: string; name: string } | null;
}

export interface VoiceTranscription {
  transcript: string;
  language: 'ru' | 'uz' | 'other';
  latencyMs: number;
}

/**
 * Voice is advertised only when it can actually run: the flag must be on and
 * at least one speech credential must be configured. Reporting the capability
 * honestly keeps the client from offering a microphone that would always fail.
 */
export function voiceSearchAvailable(env: Env): boolean {
  return marketFlag(env.MARKET_VOICE_SEARCH_ENABLED)
    && Boolean(env.GROQ_API_KEY || env.OPENAI_API_KEY);
}

export function assertVoiceSearchEnabled(env: Env): void {
  if (!marketFlag(env.MARKET_VOICE_SEARCH_ENABLED)) {
    throw new MarketHttpError('feature_disabled', 503);
  }
  if (!voiceSearchAvailable(env)) {
    throw new MarketHttpError('voice_unavailable', 503);
  }
}

function normalizedContentType(raw: string | null): string {
  return (raw ?? '').split(';')[0].trim().toLowerCase();
}

/** Reads the raw audio body under two independent size gates. */
export async function readVoiceAudio(request: Request): Promise<VoiceAudioPayload> {
  const mimeType = normalizedContentType(request.headers.get('Content-Type'));
  if (!ALLOWED_AUDIO_TYPES.has(mimeType)) {
    throw new MarketHttpError('validation_failed', 400);
  }
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > VOICE_AUDIO_LIMITS.maxBytes) {
    throw new MarketHttpError('validation_failed', 413);
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) throw new MarketHttpError('validation_failed', 400);
  if (bytes.byteLength > VOICE_AUDIO_LIMITS.maxBytes) {
    throw new MarketHttpError('validation_failed', 413);
  }
  const durationMs = Number(new URL(request.url).searchParams.get('durationMs') ?? '');
  const bounded = Number.isFinite(durationMs)
    && durationMs > 0
    && durationMs <= VOICE_AUDIO_LIMITS.maxDurationMs
    ? durationMs
    : null;
  return {
    bytes,
    mimeType,
    fileName: FILE_NAME_BY_TYPE[mimeType] ?? 'voice.ogg',
    ...(bounded === null ? {} : { durationSeconds: Math.round(bounded / 100) / 10 }),
  };
}

export function createMarketVoiceFacade(env: Env): AiFacade {
  const driver = createLegacyTranscriptionDriver(env, {
    timeoutMs: VOICE_AUDIO_LIMITS.transcriptionTimeoutMs,
  });
  return createAiFacade({
    drivers: [driver],
    policy: new AiPolicyResolver([{
      task: 'transcription',
      routes: [{ driver: driver.id }],
      timeoutMs: VOICE_AUDIO_LIMITS.transcriptionTimeoutMs,
    }]),
  });
}

/**
 * Transcribes one recording. Provider errors are collapsed into the two
 * client-facing voice codes so the UI can offer speech-off vs say-again
 * recovery without ever seeing provider internals.
 */
export async function transcribeVoiceSearch(
  facade: AiFacade,
  audio: VoiceAudioPayload,
): Promise<VoiceTranscription> {
  let outcome;
  try {
    outcome = await facade.transcribe({
      audio: {
        bytes: audio.bytes,
        mimeType: audio.mimeType,
        fileName: audio.fileName,
        ...(audio.durationSeconds === undefined
          ? {}
          : { durationSeconds: audio.durationSeconds }),
      },
    }, { task: 'transcription' });
  } catch (error) {
    throw new MarketHttpError(
      error instanceof AiUnavailableError ? 'voice_unavailable' : 'voice_unclear',
      error instanceof AiUnavailableError ? 503 : 400,
    );
  }
  const transcript = outcome.text.replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!transcript) throw new MarketHttpError('voice_unclear', 400);
  return {
    transcript,
    language: outcome.language ?? 'other',
    latencyMs: outcome.latencyMs,
  };
}

/**
 * Grounds the spoken words against categories that actually exist in the
 * connected storefront. A category is reported only when the buyer said its
 * real name; nothing is invented and no category is guessed by similarity.
 */
export function groundVoiceInterpretation(
  interpretation: VoiceInterpretation,
  categories: readonly BuyerCatalogCategory[],
): VoiceSearchInterpretation {
  const tokens = new Set(
    interpretation.productQuery.split(' ').filter(Boolean),
  );
  let matched: { id: string; name: string } | null = null;
  for (const candidate of categories) {
    const normalized = normalizeKnowledgeText(candidate.name);
    if (!normalized) continue;
    const parts = normalized.split(' ').filter(Boolean);
    if (parts.length > 0 && parts.every((part) => tokens.has(part))) {
      matched = { id: candidate.id, name: candidate.name };
      break;
    }
  }
  return {
    ...interpretation,
    category: matched,
    constraints: matched
      ? [...interpretation.constraints, { kind: 'category', value: matched.name }]
      : interpretation.constraints,
  };
}

export function interpretVoiceTranscript(
  transcript: string,
  categories: readonly BuyerCatalogCategory[],
): VoiceSearchInterpretation {
  return groundVoiceInterpretation(interpretVoiceQuery(transcript), categories);
}
