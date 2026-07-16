// Voice-to-Reply transport and speech-to-text adapters.
// Audio is held only in request memory. Never log protected Telegram file
// URLs, provider bodies, file identifiers, transcripts, or audio bytes.
import type { Env } from '../../_types';
import { guessLanguage } from './prompts';

export type VoiceErrorCode =
  | 'download_failed'
  | 'too_large'
  | 'stt_unavailable'
  | 'stt_failed'
  | 'empty_transcript';

export class VoicePipelineError extends Error {
  constructor(public readonly code: VoiceErrorCode) {
    super(code);
    this.name = 'VoicePipelineError';
  }
}

export interface DownloadedAudio {
  bytes: ArrayBuffer;
  mimeType: string;
}

export interface TranscriptionResult {
  text: string;
  language: 'ru' | 'uz' | 'other';
  provider: 'groq' | 'openai';
  model: string;
  latencyMs: number;
}

interface TranscriptionOptions {
  mimeType?: string;
  fileName?: string;
  timeoutMs: number;
}

function withTimeout(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/** Download once from Telegram's protected file endpoint, with two size gates. */
export async function downloadTelegramFile(
  token: string,
  filePath: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<DownloadedAudio> {
  if (!token || !filePath) throw new VoicePipelineError('download_failed');
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const timer = withTimeout(timeoutMs);
  try {
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${encodedPath}`, {
      signal: timer.signal,
      headers: { accept: 'audio/*,application/octet-stream' },
    });
    if (!response.ok) throw new VoicePipelineError('download_failed');
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new VoicePipelineError('too_large');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes) throw new VoicePipelineError('too_large');
    return {
      bytes,
      mimeType: (response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim(),
    };
  } catch (error) {
    if (error instanceof VoicePipelineError) throw error;
    throw new VoicePipelineError('download_failed');
  } finally {
    timer.clear();
  }
}

function safeAudioFilename(mimeType: string, supplied?: string): string {
  const mimeExtension: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/opus': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
    'audio/flac': 'flac',
  };
  const suppliedExtension = supplied?.split(/[\\/]/).pop()?.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  const allowed = new Set(['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm']);
  const extension = (suppliedExtension && allowed.has(suppliedExtension) ? suppliedExtension : null)
    || mimeExtension[mimeType]
    || 'ogg';
  return `voice.${extension}`;
}

function normalizedLanguage(raw: unknown, text: string): 'ru' | 'uz' | 'other' {
  const language = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (language === 'ru' || language.startsWith('russian') || language.startsWith('рус')) return 'ru';
  if (language === 'uz' || language.startsWith('uzbek') || language.startsWith('o‘zbek') || language.startsWith("o'zbek")) return 'uz';
  return guessLanguage(text);
}

async function transcribeWithProvider(
  provider: 'groq' | 'openai',
  apiKey: string,
  model: string,
  endpoint: string,
  audio: ArrayBuffer,
  options: TranscriptionOptions,
): Promise<TranscriptionResult> {
  const startedAt = Date.now();
  const mimeType = options.mimeType || 'application/octet-stream';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mimeType }), safeAudioFilename(mimeType, options.fileName));
  form.append('model', model);
  form.append('response_format', provider === 'groq' ? 'verbose_json' : 'json');
  form.append('temperature', '0');

  const timer = withTimeout(options.timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: timer.signal,
    });
    if (!response.ok) throw new Error('provider_failed');
    const data = await response.json() as { text?: unknown; language?: unknown };
    const text = typeof data.text === 'string' ? data.text.replace(/\s+/g, ' ').trim() : '';
    if (!text) throw new VoicePipelineError('empty_transcript');
    return {
      text,
      language: normalizedLanguage(data.language, text),
      provider,
      model,
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    timer.clear();
  }
}

/** Groq Whisper first; optional OpenAI fallback, reusing the same memory blob. */
export async function transcribeAudio(
  env: Env,
  audio: ArrayBuffer,
  options: TranscriptionOptions,
): Promise<TranscriptionResult> {
  const providers: Array<{
    provider: 'groq' | 'openai';
    key: string;
    model: string;
    endpoint: string;
  }> = [];
  if (env.GROQ_API_KEY) {
    providers.push({
      provider: 'groq', key: env.GROQ_API_KEY,
      model: env.GROQ_STT_MODEL || 'whisper-large-v3',
      endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    });
  }
  if (env.OPENAI_API_KEY) {
    providers.push({
      provider: 'openai', key: env.OPENAI_API_KEY,
      model: env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe',
      endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    });
  }
  if (providers.length === 0) throw new VoicePipelineError('stt_unavailable');

  let sawEmptyTranscript = false;
  const perProviderTimeoutMs = Math.max(3_000, Math.floor(options.timeoutMs / providers.length));
  for (const candidate of providers) {
    try {
      return await transcribeWithProvider(
        candidate.provider, candidate.key, candidate.model, candidate.endpoint, audio,
        { ...options, timeoutMs: perProviderTimeoutMs },
      );
    } catch (error) {
      if (error instanceof VoicePipelineError && error.code === 'empty_transcript') sawEmptyTranscript = true;
      // Try only the next configured provider; never surface/log provider data.
    }
  }
  throw new VoicePipelineError(sawEmptyTranscript ? 'empty_transcript' : 'stt_failed');
}
