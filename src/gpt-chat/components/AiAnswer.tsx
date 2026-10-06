// An answer's text and its action row: the lazy part chat-answer
// (parts/chat-answer.ts). The list around them (AiChatMessageList) is on the
// start bundle and shows the plain text until this part is here; the console
// fetches it as soon as a question is being written or a conversation is on
// screen, so it arrives before the first answer does.
import { useState } from "react";
import type { AnswerAction, Locale } from "../types";
import { answerStrings } from "../answer-strings";
import { renderMarkdown } from "../markdown";
import { track, EV } from "../analytics";

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

/**
 * Which way a translation goes: Cyrillic text to Uzbek in Latin script,
 * anything else to Russian, on either page.
 */
export function translationOf(content: string): "uzbek" | "russian" {
  const cyrillic = (content.match(/[А-Яа-яЁёЎўҚқҒғҲҳ]/g) ?? []).length;
  const latin = (content.match(/[A-Za-z]/g) ?? []).length;
  return cyrillic > latin ? "uzbek" : "russian";
}

/**
 * What a button sends: its name for the visitor's bubble, and for the model
 * its instruction with the answer, or with the answer's last 1200
 * characters to continue from. A long answer goes back cut at a paragraph.
 */
export function answerAsk(action: AnswerAction, content: string, locale: Locale): [text: string, request: string] {
  const s = answerStrings(locale);
  let body = content;
  if (action === "continue") body = content.slice(-1200);
  else if (content.length > 1900) {
    body = content.slice(0, 1900);
    const at = body.lastIndexOf("\n\n");
    if (at > 400) body = body.slice(0, at);
  }
  const text = { shorter: s.simpler, continue: s.continue, uzbek: s.toUzbek, russian: s.toRussian }[action];
  return [text, `${s.ask[action]}\n\n${body}`];
}

export function MessageActions({
  content,
  locale,
  isLast,
  broken,
  locked,
  costNote,
  onRetry,
  onAsk,
}: {
  content: string;
  locale: Locale;
  isLast: boolean;
  /** Cut at the length limit or broken off: «Continue» stays in the short row. */
  broken?: boolean;
  /** Sending is paused (a turn under way, a limit, a check): every button that sends is off. */
  locked?: boolean;
  /** Say once that each button sends a message. */
  costNote?: boolean;
  onRetry?: () => void;
  /** `text` goes into the visitor's bubble, `request` to the model. */
  onAsk?: (action: AnswerAction, text: string, request: string) => void;
}) {
  const s = answerStrings(locale);
  const [copyStatus, setCopyStatus] = useState<"idle" | "done" | "failed">(
    "idle",
  );
  // On a phone the row is copy (and continue on a cut answer) plus «⋯»:
  // all six buttons took three lines, about 150px, under every last answer.
  const [open, setOpen] = useState(false);
  const short =
    isLast && !open && typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus("done");
      track(EV.messageCopied, { surface: "answer_actions" });
    } catch {
      setCopyStatus("failed");
    }
  };
  const action = (kind: AnswerAction) => {
    const [text, request] = answerAsk(kind, content, locale);
    return (
      <button type="button" className="gpt-action" disabled={locked} onClick={() => onAsk?.(kind, text, request)}>
        {text}
      </button>
    );
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
          {copyStatus === "done" ? s.copied : s.copy}
        </button>
        {isLast && onAsk && (short ? (
          <>
            {broken && action("continue")}
            <button type="button" className="gpt-action" aria-expanded={false} onClick={() => setOpen(true)}>
              {s.more}
            </button>
          </>
        ) : (
          <>
            {action("shorter")}
            {action(translationOf(content))}
            {action("continue")}
            {onRetry && (
              <button type="button" className="gpt-action" disabled={locked} onClick={onRetry}>
                {s.regenerate}
              </button>
            )}
          </>
        ))}
      </div>
      {copyStatus === "failed" && (
        <p role="status" className="gpt-partial">
          {s.copyFailed}
        </p>
      )}
      {isLast && costNote && <p className="mt-2 text-[12px] text-white/35">{s.buttonCost}</p>}
    </>
  );
}
