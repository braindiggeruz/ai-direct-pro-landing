import { CHAT_BRIDGE_ENTRIES, chatEntryForArticle, chatEntryHref } from '../src/shared/chat-entry';

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
// five more articles lead into the chat of their language. They are not chat
// entries: their header, sticky and closing buttons keep leading where they
// did, and the block sits at an editorial place instead of after the second
// body element. Until release R-S1 the chat did not know their ids, so the
// link carried nothing and the article printed the sample question for the
// reader to copy. R-S1 (2026-10-12) adds the ids to CHAT_BRIDGE_ENTRIES in
// src/shared/chat-entry.ts, which the chat reads: the link now names the id
// (#entry=…, never text) and the chat fills in the same question the article
// prints. The question itself lives in that registry; this file keeps the
// block's place and title.
//
// `before` is an editorial position: the block closes the section that ends
// right before this heading (h2 or h3) of the article. A rule such as "after the
// first paragraph" split paragraphs that continue each other, so text about
// ChatGPT's own limits or sign-up read as if it were about GPTBot.uz.
const BRIDGE_PLACES = {
  'online-ru': { before: 'Как пользоваться чатом GPT онлайн', title: 'Задайте вопрос ИИ-чату на русском' },
  'russian-ru': { before: 'Плохой запрос и улучшенный запрос', title: 'Проверьте формулу запроса на своей задаче' },
  'analogs-ru': { before: 'Основные аналоги ChatGPT: краткий обзор', title: 'Сравните сами: задайте вопрос независимому ИИ-чату' },
  'talk-ru': { before: 'О чём помнить при общении с ИИ', title: 'Пообщайтесь с ИИ на русском' },
  reply: { before: 'AI biznesda qaysi vazifalarni bajaradi?', title: 'Mijozga javob matnini AI bilan tayyorlang' },
} as const satisfies Record<typeof CHAT_BRIDGE_ENTRIES[number]['id'], { before: string; title: string }>;

export const CHAT_BRIDGES = CHAT_BRIDGE_ENTRIES.map(entry => ({ ...entry, ...BRIDGE_PLACES[entry.id] }));

export type ChatBridge = typeof CHAT_BRIDGES[number];

export function chatBridgeArticleHref(bridge: ChatBridge): string {
  return `/${bridge.locale}/blog/${bridge.slug}/`;
}

export function chatBridgeForArticle(url: string): ChatBridge | undefined {
  return chatEntryForArticle(url) ? undefined : CHAT_BRIDGES.find(bridge => url === chatBridgeArticleHref(bridge));
}

/** The chat page with the bridge's fixed id: no question, no return address. */
export function chatBridgeHref(bridge: ChatBridge): string {
  return chatEntryHref(bridge);
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
    <small>Пример появится в чате — его можно изменить или написать свой вопрос. Вы отправляете его сами.</small>
  </aside>`;
  return `<aside class="article-chat-entry" aria-label="GPTBot.uz AI-chati" data-testid="article-chat-entry">
    <span class="article-chat-kicker">GPTBot.uz · O‘zbek tilida</span>
    <strong>${bridge.title}</strong>
    <p>GPTBot.uz — mustaqil AI-xizmat. O‘rnatish va ro‘yxatdan o‘tish shart emas. Bepul limit doirasida foydalaning.</p>
    <p>Savol namunasi: «${bridge.prompt}»</p>
    <a href="${chatBridgeHref(bridge)}" data-chat-entry="${bridge.id}" class="article-chat-button">AI-chatni ochish <span aria-hidden="true">↗</span></a>
    <small>Namuna chatda tayyor bo‘ladi: uni tahrirlang yoki o‘z savolingizni yozing, keyin o‘zingiz yuboring.</small>
  </aside>`;
}

// A normal link remains usable without JS. Event data comes only from our rendered attributes.
export const CHAT_ENTRY_TRACKING = `<script data-tag="chat-entry">document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-chat-entry]');if(!a)return;var p={source:location.pathname,intent:a.dataset.chatEntry,surface:'article',locale:document.documentElement.lang==='ru'?'ru':'uz'};if(typeof window.gtag==='function')window.gtag('event','article_chat_click',p);else(window.dataLayer=window.dataLayer||[]).push(Object.assign({event:'article_chat_click'},p));});</script>`;
