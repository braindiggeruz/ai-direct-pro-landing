import { chatEntryForArticle, chatEntryHref } from '../src/shared/chat-entry';

// The block leads into the AI chat, whose header says «GPTBot.uz» (paid-chat
// plan WP-09), so its kicker names the same brand (AGENTS.md section 2): the
// bare «GPTBot» is also the name of OpenAI's crawler. Changed with the
// protected-pages revision 2026-10-01-paid-chat-honesty (WP-12): six of the
// articles that carry the block are protected.
export function renderChatEntry(url: string): string {
  const entry = chatEntryForArticle(url);
  if (!entry) return renderChatBridge(url);
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

// Chat bridges of the first unprotected roll-out (SEO roadmap 2026-10-04, Б6):
// five more articles lead into the chat of their language. The entries in
// src/shared/chat-entry.ts are also read by the chat itself (they fill in the
// sample question), so a new entry there changes the chat's script and with it
// the HTML of both protected chat pages. These bridges therefore live here,
// outside the chat's code: the link opens the chat with nothing in its address,
// and the sample question is printed in the article for the reader to copy.
// Once a reviewed chat release adds these ids to CHAT_ENTRIES (R-S1), the
// chat can fill the question in and the entries move there.
//
// `before` is an editorial position: the block closes the section that ends
// right before this heading (h2 or h3) of the article. A rule such as "after the
// first paragraph" split paragraphs that continue each other, so text about
// ChatGPT's own limits or sign-up read as if it were about GPTBot.uz.
export const CHAT_BRIDGES = [
  { locale: 'ru', id: 'online-ru', slug: 'chat-gpt-online', before: 'Как пользоваться чатом GPT онлайн', title: 'Задайте вопрос ИИ-чату на русском', prompt: 'Объясни простыми словами, чем ты можешь помочь в учёбе и работе. Приведи три примера запросов.' },
  { locale: 'ru', id: 'russian-ru', slug: 'chat-gpt-na-russkom', before: 'Плохой запрос и улучшенный запрос', title: 'Проверьте формулу запроса на своей задаче', prompt: 'Помоги составить точный запрос. Сначала спроси, какая у меня задача, для кого результат и в каком виде он нужен.' },
  { locale: 'ru', id: 'analogs-ru', slug: 'analogi-chatgpt-kotorye-rabotayut-v-uzbekistane', before: 'Основные аналоги ChatGPT: краткий обзор', title: 'Сравните сами: задайте вопрос независимому ИИ-чату', prompt: 'Ответь на мой вопрос по-русски, а в конце коротко перечисли, что в ответе стоит проверить. Сначала спроси, какой у меня вопрос.' },
  { locale: 'ru', id: 'talk-ru', slug: 'chat-s-ii-gde-poobshchatsya-s-iskusstvennym-intellektom', before: 'О чём помнить при общении с ИИ', title: 'Пообщайтесь с ИИ на русском', prompt: 'Давай пообщаемся. Спроси, что меня сейчас интересует, и предложи три темы для разговора.' },
  { locale: 'uz', id: 'reply', slug: 'chat-gpt-uzbek-biznes-uchun', before: 'AI biznesda qaysi vazifalarni bajaradi?', title: 'Mijozga javob matnini AI bilan tayyorlang', prompt: 'Mijozga xushmuomala javob matnini yozishga yordam ber. Avval vaziyatni va javob uslubini so‘ra.' },
] as const;

export type ChatBridge = typeof CHAT_BRIDGES[number];

export function chatBridgeArticleHref(bridge: ChatBridge): string {
  return `/${bridge.locale}/blog/${bridge.slug}/`;
}

export function chatBridgeForArticle(url: string): ChatBridge | undefined {
  return chatEntryForArticle(url) ? undefined : CHAT_BRIDGES.find(bridge => url === chatBridgeArticleHref(bridge));
}

/** The chat page itself: no entry id, no question, no return address. */
export function chatBridgeHref(bridge: ChatBridge): string {
  return bridge.locale === 'uz' ? '/uz/gpt-uzbek-tilida/' : '/ru/gpt-chat/';
}

/** Whether the article carries a chat block at all (a chat entry or a bridge). */
export function articleHasChatEntry(url: string): boolean {
  return Boolean(chatEntryForArticle(url) || chatBridgeForArticle(url));
}

type BodyLike = { type?: string; text?: string };

const isHeading = (part: BodyLike): boolean => part.type === 'h2' || part.type === 'h3';

/**
 * Index of the body element the block follows. Chat entries keep their place
 * after the second body element, as they always have (protected articles
 * included). A bridge closes the section that ends right before its `before`
 * heading; should that heading ever be renamed, it closes the first section
 * that has text instead. Either way the next element is a heading, so the
 * block never splits a paragraph from its continuation.
 */
export function chatEntryPosition(url: string, body: readonly BodyLike[]): number {
  const fallback = Math.min(1, body.length - 1);
  const bridge = chatBridgeForArticle(url);
  if (!bridge) return fallback;
  const heading = body.findIndex(part => isHeading(part) && part.text === bridge.before);
  if (heading > 1) return heading - 1;
  const firstText = body.findIndex((part, i) => i >= 1 && ['p', 'list'].includes(part.type || ''));
  if (firstText === -1) return fallback;
  const nextH2 = body.findIndex((part, i) => i > firstText && part.type === 'h2');
  return nextH2 === -1 ? body.length - 1 : nextH2 - 1;
}

function renderChatBridge(url: string): string {
  const bridge = chatBridgeForArticle(url);
  if (!bridge) return '';
  if (bridge.locale === 'ru') return `<aside class="article-chat-entry" aria-label="AI-чат GPTBot.uz" data-testid="article-chat-entry">
    <span class="article-chat-kicker">GPTBot.uz · На русском</span>
    <strong>${bridge.title}</strong>
    <p>GPTBot.uz — самостоятельный AI-сервис, не продукт OpenAI. Можно попробовать без установки и регистрации в пределах бесплатного лимита.</p>
    <p>Пример вопроса: «${bridge.prompt}»</p>
    <a href="${chatBridgeHref(bridge)}" data-chat-entry="${bridge.id}" class="article-chat-button">Открыть AI-чат <span aria-hidden="true">↗</span></a>
    <small>Скопируйте пример в чат или напишите свой вопрос. Вы отправляете его сами.</small>
  </aside>`;
  return `<aside class="article-chat-entry" aria-label="GPTBot.uz AI-chati" data-testid="article-chat-entry">
    <span class="article-chat-kicker">GPTBot.uz · O‘zbek tilida</span>
    <strong>${bridge.title}</strong>
    <p>GPTBot.uz — mustaqil AI-xizmat. O‘rnatish va ro‘yxatdan o‘tish shart emas. Bepul limit doirasida foydalaning.</p>
    <p>Savol namunasi: «${bridge.prompt}»</p>
    <a href="${chatBridgeHref(bridge)}" data-chat-entry="${bridge.id}" class="article-chat-button">AI-chatni ochish <span aria-hidden="true">↗</span></a>
    <small>Namunani chatga ko‘chiring yoki o‘z savolingizni yozing. Uni o‘zingiz yuborasiz.</small>
  </aside>`;
}

// A normal link remains usable without JS. Event data comes only from our rendered attributes.
export const CHAT_ENTRY_TRACKING = `<script data-tag="chat-entry">document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-chat-entry]');if(!a)return;var p={source:location.pathname,intent:a.dataset.chatEntry,surface:'article',locale:document.documentElement.lang==='ru'?'ru':'uz'};if(typeof window.gtag==='function')window.gtag('event','article_chat_click',p);else(window.dataLayer=window.dataLayer||[]).push(Object.assign({event:'article_chat_click'},p));});</script>`;
