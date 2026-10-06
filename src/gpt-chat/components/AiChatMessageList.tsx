import { useEffect, useState } from "react";
import { Message, MessageContent } from '@/components/ui/message';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { MessageScrollerContent, MessageScrollerItem } from '@/components/ui/message-scroller';
import type { AnswerAction, ChatMessage, Locale } from "../types";
import type { ChatStrings } from "../i18n";
import { LazyPart, PartFailed, answerPart } from "../lazy-part";

/** The error bubble's buttons: the retry and «change the question». */
const ERROR_ACTION =
  "min-h-11 inline-flex items-center gap-1.5 text-[13px] px-3.5 py-2 rounded-xl bg-white/[0.06] text-white hover:bg-white/[0.1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-40";
const ERROR_BUBBLE =
  "max-w-[92%] rounded-2xl px-4 py-3 text-[15px] break-words [overflow-wrap:anywhere] bg-red-500/[0.08] text-red-200";

/**
 * Which model produced an answer, shown verbatim minus the routing suffix.
 * The chain mixes vendors and they do not all answer alike — a person
 * comparing two answers deserves to know they came from different models.
 * Never renamed or prettified into something the provider did not call it.
 */
function modelLabel(model: string): string {
  return model.replace(/:free$/, "");
}

/**
 * «AI o‘ylayapti…», and after 8 s without a first word an honest line: it
 * takes longer than usual, and Stop is there (plan STREAM-01). The server
 * tries up to 3 models of about 12 s each for a first word, within 60 s;
 * the client waits 65 s for the stream to start (api.ts STREAM_HEADERS_MS)
 * and 30 s of silence once it has.
 */
export function PendingLine({ t, slow }: { t: ChatStrings; slow?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-white/60 text-sm">
      <span className="neural-typing" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {slow ? t.premium.slow : t.thinking}
    </span>
  );
}

/**
 * An answer's text before the lazy part chat-answer is here (or if it cannot
 * come): as written, without Markdown. The console fetches the part as soon
 * as a question is being written, and on load when a conversation is stored
 * (hasStoredHistory), so a returning visitor's thread does not show it either.
 */
function PlainAnswer({ content }: { content: string }) {
  return <div className="gpt-answer-body whitespace-pre-wrap" dir="auto">{content}</div>;
}

export function AiChatMessageList({
  messages,
  t,
  locale = "ru",
  busy,
  locked = busy,
  costNote,
  onRetry,
  onEdit,
  onAsk,
}: {
  messages: ChatMessage[];
  t: ChatStrings;
  locale?: Locale;
  busy?: boolean;
  /** Sending is paused (a turn, a limit, a check): the buttons that send are off. */
  locked?: boolean;
  /** Say once under the last answer that each of its buttons sends a message. */
  costNote?: boolean;
  /** The last question again, in place of its answer or error. */
  onRetry?: () => void;
  /** The last question back into the composer, out of the thread. */
  onEdit?: () => void;
  onAsk?: (action: AnswerAction, text: string, request: string, frame: Locale) => void;
}) {
  const lastAssistant = (() => {
    for (let i = messages.length - 1; i >= 0; i--)
      if (messages[i].role === "assistant") return i;
    return -1;
  })();
  // The last question has no answer and none is on its way: the tab was
  // closed or unloaded mid-turn, or the turn failed before a reload. Shown,
  // never stored; it does not say whether a message was spent.
  const unanswered = !busy && messages[messages.length - 1]?.role === "user";
  // 8 s without a first word: the line under the question and the status a
  // screen reader hears say it together, once (WCAG 4.1.3).
  const waiting = messages.some((m) => m.pending);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!waiting) return;
    const timer = window.setTimeout(() => setSlow(true), 8_000);
    return () => window.clearTimeout(timer);
  }, [waiting]);
  // Too long for the server: sending it again fails the same way, so only
  // «change the question» is offered.
  const resend = messages[messages.length - 1]?.content !== t.premium.contextTooLarge;
  const errorActions = onRetry && (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {resend && <button type="button" onClick={onRetry} disabled={locked} className={ERROR_ACTION}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
        </svg>
        {t.retry}
      </button>}
      {onEdit && (
        <button type="button" onClick={onEdit} disabled={busy} className={ERROR_ACTION}>
          {t.premium.editQuestion}
        </button>
      )}
    </div>
  );

  return (
    // ym-hide-content: the transcript is user prompts and model answers. It is
    // masked here as well as on the console, so the class survives if the list
    // is ever mounted somewhere else.
    <div
      className="ym-hide-content"
      data-testid="ai-chat-messages"
      aria-live="off"
    >
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {busy
          ? messages.some((m) => m.streaming)
            ? t.writing
            : slow
              ? t.premium.slow
              : t.thinking
          : messages.length
            ? t.premium.answerReady
            : ""}
      </span>
      <MessageScrollerContent className="gpt-message-content" aria-live="off">
      {messages.map((m, i) => (
        <MessageScrollerItem key={i} messageId={String(i)} scrollAnchor={m.role === "user"}>
        <Message align={m.role === "user" ? "end" : "start"}>
        <MessageContent>
        <Bubble variant={m.role === "user" ? "muted" : m.error ? "destructive" : "ghost"} align={m.role === "user" ? "end" : "start"} className={m.role === "user" ? "gpt-user-bubble" : "gpt-answer-bubble"}>
          <BubbleContent
            // A live region that re-reads the whole growing answer on every
            // frame is unusable with a screen reader. The answer is announced
            // once, when it is finished and this subtree stops being 'off'.
            aria-live={m.streaming ? "off" : undefined}
            aria-busy={m.streaming || undefined}
            className={
              m.role === "user"
                ? "gpt-user-message max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-white text-[15px] leading-relaxed break-words [overflow-wrap:anywhere] bg-white/[0.06]"
                : m.error
                  ? ERROR_BUBBLE
                  : // Answers are the only long-form reading on this surface, so
                    // they get reading type rather than UI type: a larger size, a
                    // looser line, and a measure capped near 68 characters. At the
                    // container's full 760px an answer ran to about 95 characters
                    // per line, which is where the eye starts losing its place on
                    // the return sweep.
                    "gpt-answer w-full max-w-[68ch] text-[16.5px] leading-[1.62] break-words [overflow-wrap:anywhere]"
            }
          >
            {m.pending ? (
              <PendingLine t={t} slow={slow} />
            ) : m.role === "assistant" && !m.error ? (
              <>
                <div className="gpt-answer-head">
                  <span aria-hidden="true">✦</span>{t.brand}
                </div>
                <LazyPart part={answerPart} fallback={<PlainAnswer content={m.content} />} failed={<PlainAnswer content={m.content} />}>
                  {({ AnswerBody }) => <AnswerBody content={m.content} />}
                </LazyPart>
                {m.streaming ? (
                  // While the answer is arriving: a caret instead of the action
                  // row. Mounting six buttons under text that grows every frame
                  // makes the answer jump under the reader's eyes on a slow
                  // phone — and none of them can be used yet anyway.
                  <p className="mt-2 flex items-center gap-2 text-[12px] text-white/35">
                    <span
                      className="inline-block h-3.5 w-[2px] rounded-full bg-brand-cyan motion-safe:animate-pulse"
                      aria-hidden="true"
                    />
                    {t.writing}
                  </p>
                ) : (
                  <>
                    {m.partial && (
                      <p className="gpt-partial" role="status">
                        {t.premium.partial}
                      </p>
                    )}
                    {/* Points at «Continue», which only the last answer has. */}
                    {m.truncated && i === lastAssistant && (
                      <p className="gpt-partial" role="status">
                        {t.truncated}
                      </p>
                    )}
                    {/* If the part cannot load (a dropped 3G request, a release that
                        removed its file), the buttons are gone for this page view:
                        said once, under the last answer, with the way back. */}
                    <LazyPart part={answerPart} fallback={null} failed={i === lastAssistant ? <PartFailed message={t.partFailed} reload={t.partReload} /> : null}>
                      {({ MessageActions }) => (
                        <MessageActions
                          content={m.content}
                          locale={locale}
                          isLast={i === lastAssistant}
                          broken={m.truncated || m.partial}
                          locked={locked}
                          costNote={costNote}
                          onRetry={onRetry}
                          onAsk={onAsk}
                        />
                      )}
                    </LazyPart>
                    {m.model && (
                      <p className="gpt-model" title={m.model}>
                        {t.answeredBy}: {modelLabel(m.model)}
                      </p>
                    )}
                  </>
                )}
              </>
            ) : m.role === "assistant" && m.error ? (
              <>
                <span className="whitespace-pre-wrap" role="alert">
                  {m.content}
                </span>
                {i === messages.length - 1 && errorActions}
              </>
            ) : (
              // dir="auto": an Arabic or mixed question aligns by its own first letters.
              <span className="whitespace-pre-wrap" dir="auto">{m.content}</span>
            )}
          </BubbleContent>
        </Bubble>
        </MessageContent>
        </Message>
        </MessageScrollerItem>
      ))}
      {unanswered && (
        <MessageScrollerItem messageId="unanswered">
        <Message align="start">
        <MessageContent>
        <Bubble variant="destructive" align="start" className="gpt-answer-bubble">
          <BubbleContent className={ERROR_BUBBLE} data-testid="ai-unanswered">
            <span className="whitespace-pre-wrap" role="alert">
              {t.premium.unanswered}
            </span>
            {errorActions}
          </BubbleContent>
        </Bubble>
        </MessageContent>
        </Message>
        </MessageScrollerItem>
      )}
      </MessageScrollerContent>
    </div>
  );
}
