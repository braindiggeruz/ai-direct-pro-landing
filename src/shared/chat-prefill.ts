// The bridge from an in-browser tool on an AI tool page (Page.widgets: the
// calculator, the irregular verbs) to the chat's composer: the tool
// dispatches one typed DOM event on window, the chat (on a page with a
// chatRole only) puts the text into its composer and focuses it. Nothing is
// sent: the visitor reads, edits and presses send. The text is never logged
// or put into an analytics event.
//
// The chat imports this module; a tool entry must import it as types only
// (`import type`): a value import would make Vite split it into a chunk the
// chat loads too, and the protected chat pages would gain a modulepreload.
// A tool writes the event name as the literal 'gptbot:prefill' typed
// ChatPrefillEventName, so the compiler keeps the two names the same.

export type ChatPrefillEventName = 'gptbot:prefill';
export const CHAT_PREFILL_EVENT: ChatPrefillEventName = 'gptbot:prefill';
/** The most a tool may put into the composer (the composer's own limit is higher). */
export const CHAT_PREFILL_MAX = 1500;

/**
 * The event's detail. The chat sets `accepted` when the text is in the
 * composer; a tool that finds it unset knows the chat is still loading or
 * busy with an answer, and says so instead of scrolling to nothing.
 */
export interface ChatPrefillDetail {
  text: string;
  accepted?: boolean;
}
export type ChatPrefillEvent = CustomEvent<ChatPrefillDetail>;

/**
 * The text an event carries, trimmed, or null when there is none or it is too
 * long. It only ever becomes the composer's value (text, never markup). Kept
 * this small on purpose: it is in the chat's start bundle.
 */
export function readChatPrefill(event: Event): string | null {
  const text = (event as Partial<ChatPrefillEvent>).detail?.text;
  const clean = typeof text === 'string' ? text.trim() : '';
  return clean && clean.length <= CHAT_PREFILL_MAX ? clean : null;
}
