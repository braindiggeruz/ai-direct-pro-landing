import { chatEntryForArticle, chatEntryHref } from '../src/shared/chat-entry';

// The block leads into the AI chat, whose header says «GPTBot.uz» (paid-chat
// plan WP-09), so its kicker names the same brand (AGENTS.md section 2): the
// bare «GPTBot» is also the name of OpenAI's crawler. Changed with the
// protected-pages revision 2026-10-01-paid-chat-honesty (WP-12): six of the
// articles that carry the block are protected.
export function renderChatEntry(url: string): string {
  const entry = chatEntryForArticle(url);
  if (!entry) return '';
  if (entry.locale === 'ru') return `<aside class="article-chat-entry" aria-label="AI-чат GPTBot.uz" data-testid="article-chat-entry">
    <span class="article-chat-kicker">GPTBot.uz · На русском</span>
    <strong>${entry.title}</strong>
    <p>GPTBot.uz — самостоятельный AI-сервис, не продукт OpenAI. Можно попробовать без установки и регистрации в пределах бесплатного лимита.</p>
    <a href="${chatEntryHref(entry)}" data-chat-entry="${entry.id}" class="article-chat-button">Открыть AI-чат <span aria-hidden="true">↗</span></a>
    <small>${entry.id === 'payment-ru' ? 'Это не подписка ChatGPT Plus и не способ её оплаты. ' : ''}Пример вопроса можно изменить. Вы отправляете его сами.</small>
  </aside>`;
  return `<aside class="article-chat-entry" aria-label="GPTBot.uz AI-chati" data-testid="article-chat-entry">
    <span class="article-chat-kicker">GPTBot.uz · O‘zbek tilida</span>
    <strong>${entry.title}</strong>
    <p>GPTBot.uz — mustaqil AI-xizmat. O‘rnatish va ro‘yxatdan o‘tish shart emas. Bepul limit doirasida foydalaning.</p>
    <a href="${chatEntryHref(entry)}" data-chat-entry="${entry.id}" class="article-chat-button">AI-chatni ochish <span aria-hidden="true">↗</span></a>
    <small>Savol namunasi tayyor bo‘ladi. Uni tahrirlab, o‘zingiz yuborasiz.</small>
  </aside>`;
}

// A normal link remains usable without JS. Event data comes only from our rendered attributes.
export const CHAT_ENTRY_TRACKING = `<script data-tag="chat-entry">document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-chat-entry]');if(!a)return;var p={source:location.pathname,intent:a.dataset.chatEntry,surface:'article',locale:document.documentElement.lang==='ru'?'ru':'uz'};if(typeof window.gtag==='function')window.gtag('event','article_chat_click',p);else(window.dataLayer=window.dataLayer||[]).push(Object.assign({event:'article_chat_click'},p));});</script>`;
