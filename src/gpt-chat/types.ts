// Shared types for the AI-chat island.
export type Locale = 'ru' | 'uz';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
  /** transient UI state for the pending assistant turn */
  pending?: boolean;
  error?: boolean;
}

export interface MountConfig {
  locale: Locale;
  /** absolute or root-relative API base; defaults to same origin */
  apiBase: string;
  turnstileSiteKey?: string;
}

export interface ChatApiResponse {
  ok: boolean;
  answer?: string;
  remaining?: number;
  modelUsed?: string;
  sessionId?: string;
  code?: string;
  message?: string;
  reason?: string;
  plan?: string;
  leadHint?: string;
}
