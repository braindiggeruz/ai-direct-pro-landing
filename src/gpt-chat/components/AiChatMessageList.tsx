import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types';
import type { ChatStrings } from '../i18n';
import { renderMarkdown } from '../markdown';

function MessageActions({ content, isLast, onRetry, t }: { content: string; isLast: boolean; onRetry?: () => void; t: ChatStrings }) {
  const [copied, setCopied] = useState(false);
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
    <div className="flex gap-3 mt-2 text-xs text-white/40">
      <button type="button" onClick={copy} className="hover:text-brand-cyan transition-colors">
        {copied ? t.copied : t.copy}
      </button>
      {isLast && onRetry && (
        <button type="button" onClick={onRetry} className="hover:text-brand-cyan transition-colors">
          {t.retry}
        </button>
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

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4" data-testid="ai-chat-empty">
        <div className="font-display text-xl text-white mb-2">{t.emptyTitle}</div>
        <p className="text-white/55 text-sm max-w-md">{t.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4" data-testid="ai-chat-messages">
      {messages.map((m, i) => (
        <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
          <div
            className={
              m.role === 'user'
                ? 'max-w-[85%] rounded-2xl rounded-br-md bg-brand-blue/20 border border-brand-blue/30 px-4 py-3 text-white text-sm'
                : `max-w-[90%] rounded-2xl rounded-bl-md border px-4 py-3 text-sm ${
                    m.error ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-white/10 bg-bg-surface text-white/90'
                  }`
            }
          >
            {m.pending ? (
              <span className="inline-flex items-center gap-1 text-white/60">
                <span className="animate-pulse">●</span> {t.thinking}
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
