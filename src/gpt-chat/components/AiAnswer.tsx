// An answer's text and its action row: the lazy part chat-answer
// (parts/chat-answer.ts). The list around them (AiChatMessageList) is on the
// start bundle and shows the plain text until this part is here; the console
// fetches it as soon as a question is being written or a conversation is on
// screen, so it arrives before the first answer does.
import { useState } from "react";
import type { ChatStrings } from "../i18n";
import { renderMarkdown } from "../markdown";
import { track, EV } from "../analytics";
import type { AnswerAction } from "./AiChatMessageList";

/** The answer as the chat renders it: escaped first, then our own Markdown (markdown.ts). */
export function AnswerBody({ content }: { content: string }) {
  return (
    <div
      className="gpt-answer-body"
      dir="auto"
      dangerouslySetInnerHTML={{
        __html: renderMarkdown(content),
      }}
    />
  );
}

export function MessageActions({
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
    </>
  );
}
