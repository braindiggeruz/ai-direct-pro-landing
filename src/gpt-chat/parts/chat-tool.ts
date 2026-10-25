// Lazy part chat-tool: what an AI tool page (a gpt-chat page with a chatRole)
// adds to the chat, kept off the start bundle, which the two main chats load
// too. src/gpt-chat/main.tsx loads it only when the page has a role, and
// waits for it before mounting only when the page has chips (the frame shows
// them meanwhile). Loaded through lazy-part.tsx only.
//
//   - the page's chips (data-chat-starters, Page.chatStarters), checked whole
//     and turned into the resting screen's chips: they fill the composer and
//     never send, like the chat's own four;
//   - the bridge from the tools under the chat (Page.widgets): a
//     'gptbot:prefill' event (src/shared/chat-prefill.ts) puts its text into
//     the composer and focuses it. Nothing is sent, nothing reaches analytics.
import { chatStartersAttribute } from '../../shared/chat-starters';
import { CHAT_PREFILL_EVENT, readChatPrefill, type ChatPrefillEvent } from '../../shared/chat-prefill';
import type { PromptChip } from '../i18n';
import type { MountConfig } from '../types';

/** The page's chips as the resting screen shows them (ids starter-1…6), or undefined. */
export function pageChips(raw: string | undefined): PromptChip[] | undefined {
  return chatStartersAttribute(raw)?.map((starter, index) => ({ id: `starter-${index + 1}`, label: starter.label, insert: starter.prompt }));
}

/**
 * Puts a tool's text into the composer: the value goes through the
 * textarea's own setter and an input event, so the chat's state takes it as
 * typed text (React reads the change from the event). Refused while an
 * answer is arriving (the field's surface is aria-busy), while a presentation
 * holds the composer, or before the chat is on screen.
 */
export function fillComposer(root: HTMLElement, text: string): boolean {
  const app = root.querySelector<HTMLElement>('[data-testid="ai-console"]');
  const field = root.querySelector<HTMLTextAreaElement>('.gpt-composer textarea');
  if (!app || !field || app.dataset.presentation === 'active' || field.closest('[aria-busy="true"]')) return false;
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setValue) return false;
  setValue.call(field, field.maxLength > 0 ? text.slice(0, field.maxLength) : text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus({ preventScroll: true });
  field.setSelectionRange(field.value.length, field.value.length);
  return true;
}

/** Listens for the tools' prefill event on this page; returns the way to stop. */
export function listenForPrefill(root: HTMLElement): () => void {
  const onPrefill = (event: Event) => {
    const text = readChatPrefill(event);
    if (text !== null && fillComposer(root, text)) (event as ChatPrefillEvent).detail.accepted = true;
  };
  window.addEventListener(CHAT_PREFILL_EVENT, onPrefill);
  return () => window.removeEventListener(CHAT_PREFILL_EVENT, onPrefill);
}

/** The mount config of an AI tool page: its chips added, the bridge listening. */
export function toolPage(config: MountConfig, root: HTMLElement): MountConfig {
  listenForPrefill(root);
  const starters = pageChips(root.dataset.chatStarters);
  return starters ? { ...config, starters } : config;
}
