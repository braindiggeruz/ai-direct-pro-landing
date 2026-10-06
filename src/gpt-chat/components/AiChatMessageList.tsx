import { useEffect, useState, type ReactNode } from "react";
import { MessageScrollerContent, MessageScrollerItem } from '@/components/ui/message-scroller';
import type { AnswerAction, ChatMessage, Locale } from "../types";
import type { ChatStrings } from "../i18n";
import { LazyPart, PartFailed, answerPart } from "../lazy-part";
import { BrandMark } from "./BrandMark";

/** The error bubble's buttons: the retry and «change the question» (chat design §5.8). */
const ERROR_ACTION = "gpt-outline-button";

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
    <span className="gpt-pending">
      <span className="gpt-dots" aria-hidden="true">
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
  onVersion,
  children,
}: {
  /** What ends the thread after the last message (the limit card, the low-allowance line): inside the scroller's content, before its spacer. */
  children?: ReactNode;
  messages: ChatMessage[];
  t: ChatStrings;
  locale?: Locale;
  busy?: boolean;
  /** Sending is paused (a turn, a limit, a check): the buttons that send are off. */
  locked?: boolean;
  /** Say once under the last answer which of its buttons cost a message (those that make the AI write) and which do not. */
  costNote?: boolean;
  /** The last question again, in place of its answer or error. */
  onRetry?: () => void;
  /** The last question back into the composer, out of the thread. */
  onEdit?: () => void;
  onAsk?: (action: AnswerAction, text: string, request: string, frame: Locale) => void;
  /** «‹ 1/2 ›»: show version `version` of the answer at `index` (REV-7). */
  onVersion?: (index: number, version: number) => void;
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
    <div className="gpt-error-actions">
      {resend && <button type="button" onClick={onRetry} disabled={locked} className={ERROR_ACTION}>
        <svg
          width="16"
          height="16"
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
        // The last answer's «⋯» menu draws outside its item: that item only
        // keeps no content-visibility (premium.css .gpt-item-menu).
        <MessageScrollerItem key={i} messageId={String(i)} scrollAnchor={m.role === "user"} className={i === lastAssistant ? "gpt-item-menu" : undefined}>
        {m.role === "user" ? (
          // dir="auto": an Arabic or mixed question aligns by its own first letters.
          <div className="gpt-user-message" dir="auto">{m.content}</div>
        ) : m.error ? (
          <div className="gpt-error-bubble">
            <span role="alert">{m.content}</span>
            {i === messages.length - 1 && errorActions}
          </div>
        ) : (
          <div
            className="gpt-answer"
            // A live region that re-reads the whole growing answer on every
            // frame is unusable with a screen reader. The answer is announced
            // once, when it is finished and this subtree stops being 'off'.
            aria-live={m.streaming ? "off" : undefined}
            aria-busy={m.streaming || undefined}
          >
            <div className="gpt-answer-head">
              <BrandMark />{t.brand}
            </div>
            {m.pending ? (
              <PendingLine t={t} slow={slow} />
            ) : (
              <>
                <LazyPart part={answerPart} fallback={<PlainAnswer content={m.content} />} failed={<PlainAnswer content={m.content} />}>
                  {({ AnswerBody }) => <AnswerBody content={m.content} locale={locale} streaming={!!m.streaming} />}
                </LazyPart>
                {m.streaming ? (
                  // While the answer is arriving: a caret instead of the action
                  // row. Mounting the buttons under text that grows every frame
                  // makes the answer jump under the reader's eyes on a slow
                  // phone — and none of them can be used yet anyway.
                  <p className="gpt-streaming">
                    <span aria-hidden="true" />
                    {t.writing}
                  </p>
                ) : (
                  <>
                    {/* Which model wrote it, above the row (chat design §5.6). */}
                    {m.model && (
                      <p className="gpt-model" title={m.model}>
                        {t.answeredBy}: {modelLabel(m.model)}
                      </p>
                    )}
                    {m.partial && (
                      <p className="gpt-notice" role="status">
                        {t.premium.partial}
                      </p>
                    )}
                    {/* Points at «Continue», which only the last answer has. */}
                    {m.truncated && i === lastAssistant && (
                      <p className="gpt-notice" role="status">
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
                          versions={m.versions?.length}
                          version={m.version}
                          onVersion={onVersion && ((v) => onVersion(i, v))}
                          onRetry={onRetry}
                          onAsk={onAsk}
                        />
                      )}
                    </LazyPart>
                  </>
                )}
              </>
            )}
          </div>
        )}
        </MessageScrollerItem>
      ))}
      {unanswered && (
        <MessageScrollerItem messageId="unanswered">
          <div className="gpt-error-bubble" data-testid="ai-unanswered">
            <span role="alert">
              {t.premium.unanswered}
            </span>
            {errorActions}
          </div>
        </MessageScrollerItem>
      )}
      {children}
      </MessageScrollerContent>
    </div>
  );
}
