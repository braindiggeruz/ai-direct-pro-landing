// An answer's text and its action row: the lazy part chat-answer
// (parts/chat-answer.ts). The list around them (AiChatMessageList) is on the
// start bundle and shows the plain text until this part is here; the console
// fetches it as soon as a question is being written or a conversation is on
// screen, so it arrives before the first answer does.
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AnswerAction, Locale } from "../types";
import { answerStrings } from "../answer-strings";
import { frameLocale } from "../roles";
import { renderMarkdown } from "../markdown";
import { plainText } from "../plain-text";
import { track, EV } from "../analytics";

/**
 * The answer as the chat renders it: escaped first, then our own Markdown
 * (markdown.ts). Memoized on its text: a finished answer is not parsed again
 * on every frame of the one arriving, or on every key typed. A code block's
 * own button copies that block (REV-6), through one listener here.
 */
export const AnswerBody = memo(function AnswerBody({ content, locale = "ru" }: { content: string; locale?: Locale }) {
  const s = answerStrings(locale);
  return (
    <div
      className="gpt-answer-body"
      dir="auto"
      onClick={(event) => {
        const button = (event.target as HTMLElement).closest?.("[data-copy-code]");
        const code = button?.parentElement?.querySelector("code")?.textContent;
        if (!button || code == null) return;
        void copyText(code).then((ok) => {
          button.textContent = ok ? s.copied : s.copyFailed;
          window.setTimeout(() => { button.textContent = s.copy; }, 2_000);
        });
      }}
      dangerouslySetInnerHTML={{
        __html: renderMarkdown(content, s.copy),
      }}
    />
  );
});

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

/** The row's icons (chat design §5.6), one path each, 18px. */
const ICON = {
  copy: "M9 9h11v11H9zM5 15V5a2 2 0 0 1 2-2h10",
  copied: "M5 12.5l4.5 4.5L19 7.5",
  share: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
};
const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export function MessageActions({
  content,
  locale,
  isLast,
  broken,
  locked,
  costNote,
  versions = 1,
  version = versions - 1,
  onVersion,
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
  /** Say once that the buttons that make the AI write cost a message, and copy and Telegram do not. */
  costNote?: boolean;
  /** How many versions «Qayta yozish» has made of this answer, and which one shows (REV-7). */
  versions?: number;
  version?: number;
  /** Show another version: no message is spent, the thread goes on from the one shown. */
  onVersion?: (index: number) => void;
  onRetry?: () => void;
  /** `text` goes into the visitor's bubble, `request` to the model, framed in `frame`. */
  onAsk?: (action: AnswerAction, text: string, request: string, frame: Locale) => void;
}) {
  const s = answerStrings(locale);
  const frame = isLast ? frameLocale(content, locale) : locale;
  const [copyStatus, setCopyStatus] = useState<"idle" | "done" | "failed">(
    "idle",
  );
  // «Nusxalandi» with a tick for 2 s, then the button is itself again.
  useEffect(() => {
    if (copyStatus !== "done") return;
    const timer = window.setTimeout(() => setCopyStatus("idle"), 2_000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);
  const [shareCut, setShareCut] = useState(false);
  // On a phone the row is copy, Telegram, «continue» on a cut answer and «⋯»
  // (REV-7): all six buttons took three lines, about 150px, under every last
  // answer. «⋯» opens the rest as a menu above the row, under a caption that
  // says each item costs a message (chat design §5.6).
  const [open, setOpen] = useState(false);
  // Below when above would cross the top of the thread.
  const [below, setBelow] = useState(false);
  const phone = isLast && typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
  // The menu takes the focus to its first item, so a screen reader says where
  // it is; Escape and a tap outside close it, and a second tap on the same
  // spot within 350 ms sends nothing.
  const firstRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);
  useLayoutEffect(() => {
    if (!open) return setBelow(false);
    const top = menuRef.current?.getBoundingClientRect().top ?? 0;
    const edge = rowRef.current?.closest(".gpt-viewport")?.getBoundingClientRect().top ?? 0;
    setBelow(top < edge);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const away = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key !== "Escape" : rowRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      // Escape gives the focus back to «⋯».
      if (event.type === "keydown") moreRef.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", away);
    };
  }, [open]);
  const settled = () => Date.now() - openedAt.current > 350;
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
  // Keyed, so React never turns one button into another when the menu opens.
  const action = (kind: AnswerAction, first?: boolean) => {
    const [text, request, own] = answerAsk(kind, content, locale, frame);
    return (
      <button key={kind} ref={first ? firstRef : undefined} type="button" className="gpt-action" disabled={locked} onClick={() => settled() && onAsk?.(kind, text, request, own)}>
        {text}
      </button>
    );
  };
  const rest = [
    action("shorter", true),
    action(translationOf(content)),
    !phone && action("continue"),
    onRetry && (
      <button key="regenerate" type="button" className="gpt-action" disabled={locked} onClick={() => settled() && onRetry()}>
        {s.regenerate}
      </button>
    ),
  ];
  return (
    <>
      {/* «‹ 2/2 ›» at the right end of the answer's head (REV-7). */}
      {versions > 1 && onVersion && (
        <div className="gpt-versions" role="group" aria-label={s.versions}>
          <button type="button" disabled={locked || version < 1} onClick={() => onVersion(version - 1)} aria-label={s.versionBack}>‹</button>
          <span>{version + 1}/{versions}</span>
          <button type="button" disabled={locked || version >= versions - 1} onClick={() => onVersion(version + 1)} aria-label={s.versionNext}>›</button>
        </div>
      )}
      <div className="gpt-action-row" ref={rowRef}>
        <button type="button" onClick={copy} className="gpt-action">
          <Icon d={copyStatus === "done" ? ICON.copied : ICON.copy} />
          <span className="gpt-action-label">{copyStatus === "done" ? s.copied : s.copy}</span>
        </button>
        <button type="button" onClick={share} className="gpt-action" aria-label={s.shareLabel}>
          <Icon d={ICON.share} />
          <span className="gpt-action-label">{s.share}</span>
        </button>
        {isLast && onAsk && (phone ? [
          broken && action("continue"),
          <button
            key="more"
            ref={moreRef}
            type="button"
            className="gpt-action gpt-action-more"
            aria-expanded={open}
            aria-label={s.more}
            disabled={locked}
            onClick={() => {
              openedAt.current = Date.now();
              setOpen(!open);
            }}
          >
            <span aria-hidden="true">⋯</span>
          </button>,
          open && (
            <div key="menu" ref={menuRef} className="gpt-action-menu" data-below={below || undefined} onClick={() => setOpen(false)}>
              <p className="gpt-menu-cost">{s.menuCost}</p>
              {rest}
            </div>
          ),
        ] : [
          // The ones that cost a message after a divider.
          <span key="divider" className="gpt-action-divider" aria-hidden="true" />,
          ...rest,
        ])}
      </div>
      {copyStatus === "failed" && (
        <p role="status" className="gpt-notice">
          {s.copyFailed}
        </p>
      )}
      {shareCut && (
        <p role="status" className="gpt-notice">
          {s.shareCut}
        </p>
      )}
      {/* With a mouse, under the whole row; on a phone the menu's caption says it. */}
      {isLast && costNote && onAsk && !phone && <p className="gpt-cost-note">{s.buttonCost}</p>}
    </>
  );
}
