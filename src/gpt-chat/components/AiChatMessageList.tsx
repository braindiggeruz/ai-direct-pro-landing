import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types';
import type { ChatStrings } from '../i18n';
import { renderMarkdown } from '../markdown';
import { track, EV } from '../analytics';

export type AnswerAction = 'shorter' | 'instagram' | 'uzbek' | 'bot';

function MessageActions({ content, isLast, busy, onRetry, onAnswerAction, t }: { content: string; isLast: boolean; busy?: boolean; onRetry?: () => void; onAnswerAction?: (action: AnswerAction, content: string) => void; t: ChatStrings }) {
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Feedback is a UI scaffold: stored locally, aria-labelled. Wired to the
  // backend /feedback endpoint in a later pass (needs message id in response).
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      track(EV.copyAnswer, { surface: 'answer_actions' });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };
  const pill = 'min-h-12 inline-flex items-center justify-center px-3 py-2 rounded-xl border border-white/10 text-white/65 hover:text-white hover:border-brand-cyan/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-45 disabled:pointer-events-none';
  return (
    <div className="mt-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} aria-label={t.copy} className={pill}>{copied ? t.copied : t.copy}</button>
        {isLast && onRetry && <button type="button" onClick={onRetry} disabled={busy} aria-label={t.retry} className={pill}>{t.retry}</button>}
        {isLast && onAnswerAction && <button type="button" onClick={() => onAnswerAction('shorter', content)} disabled={busy} aria-label={t.shorter} className={pill}>{busy ? t.actionRunning : t.shorter}</button>}
        {isLast && onAnswerAction && <button type="button" onClick={() => setMoreOpen((current) => !current)} aria-expanded={moreOpen} className={pill}>{moreOpen ? t.lessActions : t.moreActions}</button>}
      </div>
      {isLast && onAnswerAction && moreOpen && (
        <div className="mt-2 flex flex-wrap gap-2 rounded-2xl border border-white/8 bg-black/10 p-2">
          <button type="button" onClick={() => onAnswerAction('instagram', content)} disabled={busy} aria-label={t.forInstagram} className={pill}>{t.forInstagram}</button>
          <button type="button" onClick={() => onAnswerAction('uzbek', content)} disabled={busy} aria-label={t.toUzbekLatin} className={pill}>{t.toUzbekLatin}</button>
          <button type="button" onClick={() => onAnswerAction('bot', content)} disabled={busy} aria-label={t.botScenario} className={pill}>{t.botScenario}</button>
          <a href="https://t.me/XGame_changerx" onClick={() => { track(EV.telegramClick, { from: 'answer_actions' }); track(EV.leadIntent, { from: 'answer_actions' }); }} rel="nofollow noopener" target="_blank" className={pill}>{t.implementBot}</a>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3" aria-label={t.feedbackQuestion}>
        <span className="text-white/45">{t.feedbackQuestion}</span>
        {rating ? <span className="text-brand-cyan/85" role="status">{t.feedbackThanks}</span> : <>
          <button type="button" onClick={() => setRating('up')} aria-label={t.feedbackUp} className={pill}>{t.feedbackUp}</button>
          <button type="button" onClick={() => setRating('down')} aria-label={t.feedbackDown} className={pill}>{t.feedbackDown}</button>
        </>}
      </div>
    </div>
  );
}

export function AiChatMessageList({
  messages,
  t,
  busy,
  onRetry,
  onAnswerAction,
}: {
  messages: ChatMessage[];
  t: ChatStrings;
  busy?: boolean;
  onRetry?: () => void;
  onAnswerAction?: (action: AnswerAction, content: string) => void;
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
                <MessageActions content={m.content} isLast={i === lastAssistant} busy={busy} onRetry={onRetry} onAnswerAction={onAnswerAction} t={t} />
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
