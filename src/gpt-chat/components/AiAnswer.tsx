// An answer's text and its action row: the lazy part chat-answer
// (parts/chat-answer.ts). The list around them (AiChatMessageList) is on the
// start bundle and shows the plain text until this part is here; the console
// fetches it as soon as a question is being written or a conversation is on
// screen, so it arrives before the first answer does.
import { useState } from "react";
import type { AnswerAction, Locale } from "../types";
import { answerStrings } from "../answer-strings";
import { frameLocale } from "../roles";
import { renderMarkdown } from "../markdown";
import { plainText } from "../plain-text";
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
 * The name is in the page's language. «Simpler» and «Continue» work on the
 * answer, so their instruction, and the lines around it (the third value),
 * are in the answer's language (`frame`, from frameLocale): a Russian answer
 * on the Uzbek page came back simpler in Uzbek. A translation names its
 * language: the page's.
 */
export function answerAsk(action: AnswerAction, content: string, locale: Locale, frame: Locale = locale): [text: string, request: string, frame: Locale] {
  const s = answerStrings(locale);
  const own = action === "shorter" || action === "continue" ? frame : locale;
  let body = content;
  if (action === "continue") body = content.slice(-1200);
  else if (content.length > 1900) {
    body = content.slice(0, 1900);
    const at = body.lastIndexOf("\n\n");
    if (at > 400) body = body.slice(0, at);
  }
  const text = { shorter: s.simpler, continue: s.continue, uzbek: s.toUzbek, russian: s.toRussian }[action];
  return [text, `${answerStrings(own).ask[action]}\n\n${body}`, own];
}

/**
 * Copies `text`: the clipboard, else a hidden textarea and execCommand,
 * which an Android WebView that refuses the clipboard still allows (as in
 * the calculator). False only when both fail.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = document.createElement("textarea");
    box.value = text;
    box.readOnly = true;
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      /* neither way */
    }
    box.remove();
    return copied;
  }
}

/** Under the shared text, by owner decision 3. */
export const SHARE_SIGNATURE = "\n\n— GPTBot.uz AI-chat";

/**
 * The t.me/share/url link for an answer: its plain text, cut at a paragraph
 * (else at a character) so the encoded text stays within 6000 characters,
 * with «…» where it was cut, the signature, and a link to this chat page.
 */
export function telegramShare(content: string, page: string): { href: string; cut: boolean } {
  const plain = plainText(content);
  const fits = (text: string) => encodeURIComponent(`${text}${SHARE_SIGNATURE}`).length <= 6000;
  let text = plain;
  if (!fits(text)) {
    text = "";
    for (const part of plain.split("\n\n")) {
      const next = text ? `${text}\n\n${part}` : part;
      if (!fits(`${next}\n\n…`)) break;
      text = next;
    }
    if (text) text += "\n\n…";
    else {
      // By characters, not UTF-16 units: half an emoji cannot be encoded.
      let chars = Array.from(plain).slice(0, 1500);
      while (!fits(`${chars.join("")}…`)) chars = chars.slice(0, -100);
      text = `${chars.join("")}…`;
    }
  }
  return {
    href: `https://t.me/share/url?url=${encodeURIComponent(`${page}?utm_source=telegram&utm_medium=share`)}&text=${encodeURIComponent(`${text}${SHARE_SIGNATURE}`)}`,
    cut: text !== plain,
  };
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
  /** `text` goes into the visitor's bubble, `request` to the model, framed in `frame`. */
  onAsk?: (action: AnswerAction, text: string, request: string, frame: Locale) => void;
}) {
  const s = answerStrings(locale);
  const frame = isLast ? frameLocale(content, locale) : locale;
  const [copyStatus, setCopyStatus] = useState<"idle" | "done" | "failed">(
    "idle",
  );
  const [shareCut, setShareCut] = useState(false);
  // On a phone the row is copy (and continue on a cut answer) plus «⋯»:
  // all six buttons took three lines, about 150px, under every last answer.
  const [open, setOpen] = useState(false);
  const short =
    isLast && !open && typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  // Plain text, so no ** or ### lands in Telegram or Instagram (M-08).
  const copy = async () => {
    if (await copyText(plainText(content))) {
      setCopyStatus("done");
      track(EV.messageCopied, { surface: "answer_actions" });
    } else setCopyStatus("failed");
  };
  // Telegram's own chat picker: Android's WebView has no Web Share, and the
  // button promises Telegram. Nothing of the answer leaves but this link.
  const share = () => {
    try {
      const { href, cut } = telegramShare(content, location.origin + location.pathname);
      window.open(href, "_blank", "noopener");
      setShareCut(cut);
      track(EV.answerShared, { method: "tme" });
    } catch {
      /* a malformed answer: nothing to send */
    }
  };
  const action = (kind: AnswerAction) => {
    const [text, request, own] = answerAsk(kind, content, locale, frame);
    return (
      <button type="button" className="gpt-action" disabled={locked} onClick={() => onAsk?.(kind, text, request, own)}>
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
        <button type="button" onClick={share} className="gpt-action" aria-label={s.shareLabel}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 2 11 13" />
            <path d="m22 2-7 20-4-9-9-4 20-7z" />
          </svg>
          {s.share}
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
      {shareCut && (
        <p role="status" className="gpt-partial">
          {s.shareCut}
        </p>
      )}
      {isLast && costNote && <p className="mt-2 text-[12px] text-white/35">{s.buttonCost}</p>}
    </>
  );
}
