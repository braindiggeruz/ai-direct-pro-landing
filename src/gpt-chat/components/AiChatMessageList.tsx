import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ChatMessage } from '../types';
import type { ChatStrings } from '../i18n';
import { renderMarkdown } from '../markdown';
import { track, EV } from '../analytics';

export type AnswerAction = 'shorter' | 'instagram' | 'uzbek' | 'bot';

/**
 * Which model produced an answer, shown verbatim minus the routing suffix.
 * The chain mixes vendors and they do not all answer alike — a person
 * comparing two answers deserves to know they came from different models.
 * Never renamed or prettified into something the provider did not call it.
 */
function modelLabel(model: string): string {
  return model.replace(/:free$/, '');
}

function MessageActions({ content, isLast, busy, onRetry, onAnswerAction, t }: { content: string; isLast: boolean; busy?: boolean; onRetry?: () => void; onAnswerAction?: (action: AnswerAction, content: string) => void; t: ChatStrings }) {
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      track(EV.copyAnswer, { surface: 'answer_actions' });
      track(EV.messageCopied, { surface: 'answer_actions' });
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
        {isLast && onRetry && <button type="button" onClick={onRetry} disabled={busy} aria-label={t.regenerate} title={t.regenerate} className={iconBtn}>
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

export function AiChatMessageList({
  messages,
  t,
  busy,
  onRetry,
  onAnswerAction,
  scrollRef,
}: {
  messages: ChatMessage[];
  t: ChatStrings;
  busy?: boolean;
  onRetry?: () => void;
  onAnswerAction?: (action: AnswerAction, content: string) => void;
  /** The scrolling viewport, so following the stream can be stopped when the
   *  reader has scrolled up to re-read something. */
  scrollRef?: RefObject<HTMLElement | null>;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastAssistant = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i;
    return -1;
  })();

  // Whether the reader is parked at the bottom. Deliberately updated from the
  // scroll event and NOT from the content change: appending text grows
  // scrollHeight without moving the reader, so measuring after a render would
  // read as "scrolled up" and the view would stop following its own stream.
  const stickRef = useRef(true);
  useEffect(() => {
    const viewport = scrollRef?.current;
    if (!viewport) return;
    const onScroll = () => {
      stickRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 160;
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  // Follow the newest message — but never yank the viewport back down while
  // someone has scrolled up to re-read an answer. Instant, not smooth: a
  // smooth scroll restarted on every frame of arriving text never lands, and
  // on a low-end phone that reads as stutter.
  useEffect(() => {
    if (scrollRef?.current && !stickRef.current) return;
    endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [messages, scrollRef]);

  return (
    // ym-hide-content: the transcript is user prompts and model answers. It is
    // masked here as well as on the console, so the class survives if the list
    // is ever mounted somewhere else.
    <div className="relative z-[1] flex-1 space-y-6 ym-hide-content" data-testid="ai-chat-messages" aria-live="polite">
      {messages.map((m, i) => (
        <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
          <div
            // A live region that re-reads the whole growing answer on every
            // frame is unusable with a screen reader. The answer is announced
            // once, when it is finished and this subtree stops being 'off'.
            aria-live={m.streaming ? 'off' : undefined}
            aria-busy={m.streaming || undefined}
            className={
              m.role === 'user'
                ? 'max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-white text-[15px] leading-relaxed break-words [overflow-wrap:anywhere] bg-white/[0.06]'
                : m.error
                  ? 'max-w-[92%] rounded-2xl px-4 py-3 text-[15px] break-words [overflow-wrap:anywhere] bg-red-500/[0.08] text-red-200'
                    // Answers are the only long-form reading on this surface, so
                  // they get reading type rather than UI type: a larger size, a
                  // looser line, and a measure capped near 68 characters. At the
                  // container's full 760px an answer ran to about 95 characters
                  // per line, which is where the eye starts losing its place on
                  // the return sweep.
                  : 'w-full max-w-[68ch] text-[16.5px] leading-[1.62] break-words [overflow-wrap:anywhere]'
            }
          >
            {m.pending ? (
              <span className="inline-flex items-center gap-2 text-white/60 text-sm">
                <span className="neural-typing" aria-hidden="true"><span /><span /><span /></span>
                {t.thinking}
              </span>
            ) : m.role === 'assistant' && !m.error ? (
              <>
                <div className="leading-[1.62] break-words [overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                {m.streaming ? (
                  // While the answer is arriving: a caret instead of the action
                  // row. Mounting six buttons under text that grows every frame
                  // makes the answer jump under the reader's eyes on a slow
                  // phone — and none of them can be used yet anyway.
                  <p className="mt-2 flex items-center gap-2 text-[12px] text-white/35">
                    <span className="inline-block h-3.5 w-[2px] rounded-full bg-brand-cyan motion-safe:animate-pulse" aria-hidden="true" />
                    {t.writing}
                  </p>
                ) : (
                  <>
                    <MessageActions content={m.content} isLast={i === lastAssistant} busy={busy} onRetry={onRetry} onAnswerAction={onAnswerAction} t={t} />
                    {m.model && (
                      <p className="mt-1.5 truncate text-[11px] text-white/25" title={m.model}>
                        {t.answeredBy}: {modelLabel(m.model)}
                      </p>
                    )}
                  </>
                )}
              </>
            ) : m.role === 'assistant' && m.error ? (
              <>
                <span className="whitespace-pre-wrap" role="alert">{m.content}</span>
                {i === messages.length - 1 && onRetry && (
                  <div className="mt-2.5">
                    <button type="button" onClick={onRetry} disabled={busy} className="min-h-11 inline-flex items-center gap-1.5 text-[13px] px-3.5 py-2 rounded-xl bg-white/[0.06] text-white hover:bg-white/[0.1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-40">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>
                      {t.retry}
                    </button>
                  </div>
                )}
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
