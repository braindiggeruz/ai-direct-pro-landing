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
  const pill = 'px-2.5 py-1 rounded-full border border-white/10 text-white/55 hover:text-white hover:border-brand-cyan/40 transition-colors';
  return (
    <div className="flex flex-wrap items-center gap-2 mt-3 text-[12px]">
      <button type="button" onClick={copy} aria-label={t.copy} className={pill}>
        {copied ? t.copied : t.copy}
      </button>
      {isLast && onRetry && (
        <button type="button" onClick={onRetry} aria-label={t.retry} className={pill}>
          {t.retry}
        </button>
      )}
      {rating ? (
        <span className="px-2.5 py-1 text-brand-cyan/80">{t.feedbackThanks}</span>
      ) : (
        <>
          <button type="button" onClick={() => setRating('up')} aria-label={t.feedbackUp} className={pill}>
            {t.feedbackUp}
          </button>
          <button type="button" onClick={() => setRating('down')} aria-label={t.feedbackDown} className={pill}>
            {t.feedbackDown}
          </button>
        </>
      )}
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
                ? 'max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 sm:px-4 sm:py-3 text-white text-[15px] leading-relaxed break-words [overflow-wrap:anywhere]'
                : `max-w-[92%] rounded-2xl rounded-bl-md border px-3.5 py-3 sm:px-4 sm:py-3.5 text-[15px] break-words [overflow-wrap:anywhere] ${
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
                <div className="leading-relaxed break-words [overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
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
