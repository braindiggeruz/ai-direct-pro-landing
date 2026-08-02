// Microphone capture for Bormi voice search.
//
// Telegram WebViews differ a lot: Android usually grants getUserMedia once the
// Telegram app itself holds RECORD_AUDIO, iOS records as audio/mp4, and
// Telegram Web runs the Mini App inside an iframe that may not carry the
// microphone permission at all. Every one of those cases has to degrade to
// typed search rather than to a broken button, so capability is probed before
// the microphone is ever offered and every failure resolves to a named reason.
//
// Audio never leaves this module except as the single blob handed to the BFF.
// Nothing is stored, cached or replayed.

export type VoiceCaptureFailure =
  | 'unsupported'
  | 'permission_denied'
  | 'no_microphone'
  | 'capture_failed'
  | 'too_short';

export class VoiceCaptureError extends Error {
  constructor(public readonly reason: VoiceCaptureFailure) {
    super(reason);
    this.name = 'VoiceCaptureError';
  }
}

export interface VoiceRecording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export const VOICE_CAPTURE_LIMITS = {
  maxDurationMs: 30_000,
  /** Below this a tap is a mis-tap, not speech. */
  minDurationMs: 400,
  countdownFromMs: 25_000,
  levelBars: 28,
  levelIntervalMs: 70,
} as const;

/** Ordered by transcription quality, then by WebView availability. */
const PREFERRED_TYPES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
] as const;

function supportedMimeType(): string | null {
  const recorder = globalThis.MediaRecorder;
  if (!recorder) return null;
  if (typeof recorder.isTypeSupported !== 'function') return '';
  for (const candidate of PREFERRED_TYPES) {
    if (recorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

export function voiceCaptureSupported(): boolean {
  const media = globalThis.navigator?.mediaDevices as
    | { getUserMedia?: unknown }
    | undefined;
  return Boolean(
    globalThis.MediaRecorder
    && typeof media?.getUserMedia === 'function'
    && globalThis.isSecureContext !== false,
  );
}

/** Strips codec parameters so the BFF receives a plain audio content type. */
export function baseMimeType(value: string): string {
  const base = value.split(';')[0]?.trim().toLowerCase();
  return base || 'audio/webm';
}

function captureFailure(error: unknown): VoiceCaptureError {
  const name = (error as { name?: unknown })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new VoiceCaptureError('permission_denied');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new VoiceCaptureError('no_microphone');
  }
  return new VoiceCaptureError('capture_failed');
}

export interface VoiceRecorderCallbacks {
  /** Rolling loudness history, newest last, each value 0..1. */
  onLevels?: (levels: readonly number[]) => void;
  onElapsed?: (milliseconds: number) => void;
  /** Fired when the hard duration cap stops the recording on its own. */
  onAutoStop?: () => void;
}

interface ActiveCapture {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  audioContext?: AudioContext;
  analyser?: AnalyserNode;
  meter?: ReturnType<typeof setInterval>;
  cap?: ReturnType<typeof setTimeout>;
  levels: number[];
}

/**
 * One recording at a time. `start` opens the microphone, `stop` resolves the
 * recording, and `cancel` tears everything down without producing audio.
 */
export class VoiceRecorder {
  private active: ActiveCapture | null = null;

  private cancelled = false;

  constructor(private readonly callbacks: VoiceRecorderCallbacks = {}) {}

  get recording(): boolean {
    return this.active !== null;
  }

  async start(): Promise<void> {
    if (this.active) return;
    if (!voiceCaptureSupported()) throw new VoiceCaptureError('unsupported');
    const mimeType = supportedMimeType();
    if (mimeType === null) throw new VoiceCaptureError('unsupported');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      throw captureFailure(error);
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      for (const track of stream.getTracks()) track.stop();
      throw new VoiceCaptureError('unsupported');
    }

    const capture: ActiveCapture = {
      stream,
      recorder,
      chunks: [],
      startedAt: Date.now(),
      levels: [],
    };
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) capture.chunks.push(event.data);
    });
    this.cancelled = false;
    this.active = capture;
    this.attachMeter(capture);
    capture.cap = setTimeout(() => {
      if (this.active === capture && capture.recorder.state === 'recording') {
        this.callbacks.onAutoStop?.();
      }
    }, VOICE_CAPTURE_LIMITS.maxDurationMs);
    recorder.start();
  }

  /** Resolves the captured audio and releases the microphone. */
  async stop(): Promise<VoiceRecording> {
    const capture = this.active;
    if (!capture) throw new VoiceCaptureError('capture_failed');
    const durationMs = Date.now() - capture.startedAt;
    const stopped = new Promise<void>((resolve) => {
      capture.recorder.addEventListener('stop', () => resolve(), { once: true });
    });
    try {
      if (capture.recorder.state !== 'inactive') capture.recorder.stop();
      await stopped;
    } catch {
      this.release(capture);
      throw new VoiceCaptureError('capture_failed');
    }
    const mimeType = baseMimeType(
      capture.recorder.mimeType || capture.chunks[0]?.type || 'audio/webm',
    );
    const blob = new Blob(capture.chunks, { type: mimeType });
    this.release(capture);
    if (this.cancelled) throw new VoiceCaptureError('capture_failed');
    if (durationMs < VOICE_CAPTURE_LIMITS.minDurationMs || blob.size === 0) {
      throw new VoiceCaptureError('too_short');
    }
    return {
      blob,
      mimeType,
      durationMs: Math.min(durationMs, VOICE_CAPTURE_LIMITS.maxDurationMs),
    };
  }

  cancel(): void {
    const capture = this.active;
    if (!capture) return;
    this.cancelled = true;
    try {
      if (capture.recorder.state !== 'inactive') capture.recorder.stop();
    } catch {
      // The stream is released below regardless of recorder state.
    }
    this.release(capture);
  }

  private attachMeter(capture: ActiveCapture): void {
    const AudioContextCtor = globalThis.AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor || !this.callbacks.onLevels) return;
    let context: AudioContext;
    try {
      context = new AudioContextCtor();
    } catch {
      return; // The meter is decorative; recording continues without it.
    }
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(capture.stream).connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);
    capture.audioContext = context;
    capture.analyser = analyser;
    capture.meter = setInterval(() => {
      if (this.active !== capture) return;
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (const sample of buffer) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const level = Math.min(1, Math.max(0.04, rms * 3.2));
      capture.levels = [...capture.levels, level]
        .slice(-VOICE_CAPTURE_LIMITS.levelBars);
      this.callbacks.onLevels?.(capture.levels);
      this.callbacks.onElapsed?.(Date.now() - capture.startedAt);
    }, VOICE_CAPTURE_LIMITS.levelIntervalMs);
  }

  private release(capture: ActiveCapture): void {
    if (capture.meter !== undefined) clearInterval(capture.meter);
    if (capture.cap !== undefined) clearTimeout(capture.cap);
    for (const track of capture.stream.getTracks()) track.stop();
    void capture.audioContext?.close().catch(() => undefined);
    if (this.active === capture) this.active = null;
  }
}

export function formatVoiceTimer(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
