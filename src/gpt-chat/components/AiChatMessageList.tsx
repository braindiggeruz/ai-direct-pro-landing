import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types';
import type { ChatStrings } from '../i18n';
import { renderMarkdown } from '../markdown';

function MessageActions({ content, isLast, onRetry, t }: { content: string; isLast: boolean; onRetry?: () => void; t: ChatStrings }) {
  const [copied, setCopied] = useState(false);
  // Feedback is a UI scaffold: stored locally, aria-labelled. Wired to the
  // backend /feedback endpoint in a later pass (needs message id in response).
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };
  return (
    <div className="flex items-center gap-3 mt-2.5 text-xs text-white/40">
      <button type="button" onClick={copy} aria-label={t.copy} className="hover:text-brand-cyan transition-colors">
        {copied ? t.copied : t.copy}
      </button>
      {isLast && onRetry && (
        <button type="button" onClick={onRetry} aria-label={t.retry} className="hover:text-brand-cyan transition-colors">
          {t.retry}
        </button>
      )}
      <span className="w-px h-3 bg-white/10" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setRating('up')}
        aria-label={t.feedbackUp}
        aria-pressed={rating === 'up'}
        className={`transition-colors ${rating === 'up' ? 'text-brand-cyan' : 'hover:text-white/70'}`}
      >
        ▲
      </button>
      <button
        type="button"
        onClick={() => setRating('down')}
        aria-label={t.feedbackDown}
        aria-pressed={rating === 'down'}
        className={`transition-colors ${rating === 'down' ? 'text-red-300' : 'hover:text-white/70'}`}
      >
        ▼
      </button>
      {rating && <span className="text-white/30">{t.feedbackThanks}</span>}
    </div>
  );
}

export function AiChatMessageList({
  messages,
  t,
  onRetry,
}: {
  messages: ChatMessage[];
  t: ChatStrings;
  onRetry?: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastAssistant = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i;
    return -1;
  })();

  // Auto-scroll to the latest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <div className="relative z-[1] flex-1 space-y-4" data-testid="ai-chat-messages">
      {messages.map((m, i) => (
        <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
          <div
            className={
              m.role === 'user'
                ? 'max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-white text-[15px] leading-relaxed'
                : `max-w-[92%] rounded-2xl rounded-bl-md border px-4 py-3.5 text-[15px] ${
                    m.error ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-white/10 msg-in'
                  }`
            }
            style={
              m.role === 'user'
                ? { background: 'linear-gradient(135deg, rgba(34,158,217,0.22), rgba(47,230,209,0.12))', border: '1px solid rgba(47,230,209,0.22)' }
                : m.role === 'assistant' && !m.error
                  ? { background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015))' }
                  : undefined
            }
          >
            {m.pending ? (
              <span className="inline-flex items-center gap-2 text-white/60 text-sm">
                <span className="neural-typing" aria-hidden="true"><span /><span /><span /></span>
                {t.thinking}
              </span>
            ) : m.role === 'assistant' && !m.error ? (
              <>
                <div className="leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                <MessageActions content={m.content} isLast={i === lastAssistant} onRetry={onRetry} t={t} />
              </>
            ) : (
              <span className="whitespace-pre-wrap">{m.content}</span>
            )}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
