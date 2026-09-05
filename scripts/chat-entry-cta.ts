import { chatEntryForArticle, chatEntryHref } from '../src/shared/chat-entry';

export function renderChatEntry(url: string): string {
  const entry = chatEntryForArticle(url);
  if (!entry) return '';
  return `<aside class="article-chat-entry" aria-label="GPTBot AI-chat" data-testid="article-chat-entry">
    <span class="article-chat-kicker">GPTBot AI · O‘zbek tilida</span>
    <strong>${entry.title}</strong>
    <p>GPTBot — mustaqil AI-xizmat. O‘rnatish va ro‘yxatdan o‘tish shart emas. Bepul limit doirasida foydalaning.</p>
    <a href="${chatEntryHref(entry)}" data-chat-entry="${entry.id}" class="article-chat-button">AI-chatni ochish <span aria-hidden="true">↗</span></a>
    <small>Savol namunasi tayyor bo‘ladi. Uni tahrirlab, o‘zingiz yuborasiz.</small>
  </aside>`;
}

// A normal link remains usable without JS. Event data comes only from our rendered attributes.
export const CHAT_ENTRY_TRACKING = `<script data-tag="chat-entry">document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-chat-entry]');if(!a)return;var p={source:location.pathname,intent:a.dataset.chatEntry,surface:'article',locale:'uz'};if(typeof window.gtag==='function')window.gtag('event','article_chat_click',p);else(window.dataLayer=window.dataLayer||[]).push(Object.assign({event:'article_chat_click'},p));});</script>`;
