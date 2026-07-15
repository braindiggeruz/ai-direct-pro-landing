import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types';
import type { ChatStrings } from '../i18n';
import { renderMarkdown } from '../markdown';
import { track, EV } from '../analytics';

export type AnswerAction = 'shorter' | 'instagram' | 'uzbek' | 'bot';

function MessageActions({ content, isLast, busy, onRetry, onAnswerAction, t }: { content: string; isLast: boolean; busy?: boolean; onRetry?: () => void; onAnswerAction?: (action: AnswerAction, content: string) => void; t: ChatStrings }) {
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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
  const iconBtn = 'min-h-11 w-11 inline-flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-30 disabled:pointer-events-none';
  return (
    <div className="mt-2.5 text-[12px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={copy} aria-label={t.copy} title={t.copy} className={iconBtn}>
          {copied ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#2FE6D1" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>}
        </button>
        {isLast && onRetry && <button type="button" onClick={onRetry} disabled={busy} aria-label={t.retry} title={t.retry} className={iconBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>
        </button>}
        {isLast && onAnswerAction && <button type="button" onClick={() => onAnswerAction('shorter', content)} disabled={busy} aria-label={t.shorter} title={t.shorter} className={iconBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/></svg>
        </button>}
        {isLast && onAnswerAction && <button type="button" onClick={() => setMoreOpen((current) => !current)} aria-expanded={moreOpen} aria-label={t.moreActions} title={t.moreActions} className={iconBtn}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
        </button>}
      </div>
      {isLast && onAnswerAction && moreOpen && (
        <div className="mt-2 flex flex-wrap gap-1.5 rounded-2xl bg-white/[0.03] p-2">
          <button type="button" onClick={() => onAnswerAction('instagram', content)} disabled={busy} aria-label={t.forInstagram} className={`${iconBtn} w-auto px-3 gap-1.5`}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg><span className="text-[12px]">{t.forInstagram}</span></button>
          <button type="button" onClick={() => onAnswerAction('uzbek', content)} disabled={busy} aria-label={t.toUzbekLatin} className={`${iconBtn} w-auto px-3 gap-1.5`}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M8 7v10m8-10v10M4 17h16"/></svg><span className="text-[12px]">{t.toUzbekLatin}</span></button>
          <button type="button" onClick={() => onAnswerAction('bot', content)} disabled={busy} aria-label={t.botScenario} className={`${iconBtn} w-auto px-3 gap-1.5`}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M9 8V5h6v3"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/></svg><span className="text-[12px]">{t.botScenario}</span></button>
          <a href="https://t.me/XGame_changerx" onClick={() => { track(EV.telegramClick, { from: 'answer_actions' }); track(EV.leadIntent, { from: 'answer_actions' }); }} rel="nofollow noopener noreferrer" target="_blank" className={`${iconBtn} w-auto px-3 gap-1.5`}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 4L2 11l6 2 2 6 3-4 5 4 4-15z"/></svg><span className="text-[12px]">{t.implementBot}</span></a>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/[0.04] pt-3" aria-label={t.feedbackQuestion}>
        <span className="text-white/45 text-[12px] mr-1">{t.feedbackQuestion}</span>
        {rating ? <span className="text-brand-cyan/85" role="status">{t.feedbackThanks}</span> : <>
          <button type="button" onClick={() => setRating('up')} aria-label={t.feedbackUp} title={t.feedbackUp} className={iconBtn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11M7 10l4-7a2 2 0 0 1 4 0v5h5a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7"/></svg>
          </button>
          <button type="button" onClick={() => setRating('down')} aria-label={t.feedbackDown} title={t.feedbackDown} className={iconBtn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V3M17 14l-4 7a2 2 0 0 1-4 0v-5H4a2 2 0 0 1-2-2l2-8a2 2 0 0 1 2-2h11"/></svg>
          </button>
        </>}
      </div>
    </div>
  );
}

function ScrollToBottomButton({ t, onClick }: { t: ChatStrings; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t.scrollToBottom || '↓'}
      title={t.scrollToBottom || '↓'}
      className="sticky bottom-2 left-1/2 -translate-x-1/2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 border border-white/15 text-white/70 hover:text-white hover:bg-white/20 transition-colors backdrop-blur-sm"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
    </button>
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const lastAssistant = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i;
    return -1;
  })();

  // Auto-scroll to the latest message when near the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom || messages.length <= 1) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setShowScrollBtn(!isNearBottom && messages.length > 2);
  };

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setShowScrollBtn(false);
  };

  return (
    <div ref={scrollRef} onScroll={onScroll} className="relative z-[1] flex-1 space-y-4 overflow-y-auto" data-testid="ai-chat-messages">
      {messages.map((m, i) => (
        <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
          <div
            className={
              m.role === 'user'
                ? 'max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 sm:px-5 sm:py-3 text-white text-[15px] leading-relaxed break-words [overflow-wrap:anywhere]'
                : `max-w-[92%] rounded-2xl rounded-bl-md px-4 py-3 sm:px-5 sm:py-3.5 text-[15px] break-words [overflow-wrap:anywhere] ${
                    m.error ? 'bg-red-500/[0.08] text-red-200' : 'msg-in'
                  }`
            }
            style={
              m.role === 'user'
                ? { background: 'linear-gradient(135deg, rgba(34,158,217,0.18), rgba(47,230,209,0.10))' }
                : m.role === 'assistant' && !m.error
                  ? { background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01))' }
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
      {showScrollBtn && <ScrollToBottomButton t={t} onClick={scrollToBottom} />}
    </div>
  );
}
