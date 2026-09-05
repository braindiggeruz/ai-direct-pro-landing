import { useState } from "react";
import { Message, MessageContent } from '@/components/ui/message';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { MessageScrollerContent, MessageScrollerItem } from '@/components/ui/message-scroller';
import type { ChatMessage } from "../types";
import type { ChatStrings } from "../i18n";
import { renderMarkdown } from "../markdown";
import { track, EV } from "../analytics";

export type AnswerAction =
  "shorter" | "instagram" | "uzbek" | "bot" | "continue";

/**
 * Which model produced an answer, shown verbatim minus the routing suffix.
 * The chain mixes vendors and they do not all answer alike — a person
 * comparing two answers deserves to know they came from different models.
 * Never renamed or prettified into something the provider did not call it.
 */
function modelLabel(model: string): string {
  return model.replace(/:free$/, "");
}

function MessageActions({
  content,
  isLast,
  busy,
  onRetry,
  onAnswerAction,
  t,
}: {
  content: string;
  isLast: boolean;
  busy?: boolean;
  onRetry?: () => void;
  onAnswerAction?: (action: AnswerAction, content: string) => void;
  t: ChatStrings;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "done" | "failed">(
    "idle",
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus("done");
      track(EV.copyAnswer, { surface: "answer_actions" });
      track(EV.messageCopied, { surface: "answer_actions" });
    } catch {
      setCopyStatus("failed");
    }
  };
  return (
    <>
      <div className="gpt-action-row">
        <button type="button" onClick={copy} className="gpt-action">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          {copyStatus === "done" ? t.copied : t.copy}
        </button>
        {isLast && onAnswerAction && (
          <>
            <button
              type="button"
              className="gpt-action"
              disabled={busy}
              onClick={() => onAnswerAction("shorter", content)}
            >
              {t.premium.simpler}
            </button>
            <button
              type="button"
              className="gpt-action"
              disabled={busy}
              onClick={() => onAnswerAction("uzbek", content)}
            >
              {t.premium.translate}
            </button>
            <button
              type="button"
              className="gpt-action"
              disabled={busy}
              onClick={() => onAnswerAction("continue", content)}
            >
              {t.premium.continue}
            </button>
          </>
        )}
        {isLast && onRetry && (
          <button
            type="button"
            className="gpt-action"
            disabled={busy}
            onClick={onRetry}
          >
            {t.regenerate}
          </button>
        )}
      </div>
      {copyStatus === "failed" && (
        <p role="status" className="gpt-partial">
          {t.premium.copyFailed}
        </p>
      )}
      {isLast && <p className="gpt-model">{t.premium.actionCost}</p>}
    </>
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
  const lastAssistant = (() => {
    for (let i = messages.length - 1; i >= 0; i--)
      if (messages[i].role === "assistant") return i;
    return -1;
  })();

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
                  ? "max-w-[92%] rounded-2xl px-4 py-3 text-[15px] break-words [overflow-wrap:anywhere] bg-red-500/[0.08] text-red-200"
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
              <span className="inline-flex items-center gap-2 text-white/60 text-sm">
                <span className="neural-typing" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                {t.thinking}
              </span>
            ) : m.role === "assistant" && !m.error ? (
              <>
                <div className="gpt-answer-head">
                  <span aria-hidden="true">✦</span>GPTBot
                </div>
                <div
                  className="gpt-answer-body"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(m.content),
                  }}
                />
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
                    <MessageActions
                      content={m.content}
                      isLast={i === lastAssistant}
                      busy={busy}
                      onRetry={onRetry}
                      onAnswerAction={onAnswerAction}
                      t={t}
                    />
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
                {i === messages.length - 1 && onRetry && (
                  <div className="mt-2.5">
                    <button
                      type="button"
                      onClick={onRetry}
                      disabled={busy}
                      className="min-h-11 inline-flex items-center gap-1.5 text-[13px] px-3.5 py-2 rounded-xl bg-white/[0.06] text-white hover:bg-white/[0.1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-40"
                    >
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
                    </button>
                  </div>
                )}
              </>
            ) : (
              <span className="whitespace-pre-wrap">{m.content}</span>
            )}
          </BubbleContent>
        </Bubble>
        </MessageContent>
        </Message>
        </MessageScrollerItem>
      ))}
      </MessageScrollerContent>
    </div>
  );
}
