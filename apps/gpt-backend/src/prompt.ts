// System prompt + message assembly + lead-intent detection. PURE.
export type Locale = 'ru' | 'uz';

export const SYSTEM_PROMPT =
  'Ты AI-помощник GPTBot.uz. Помогай с текстами, идеями, учёбой, маркетингом, Telegram, Instagram, продажами и бизнес-задачами. ' +
  'Отвечай на языке пользователя: русский или узбекский. Не утверждай, что ты официальный ChatGPT/OpenAI. ' +
  'Не проси пароли, банковские данные, документы или секретную информацию. ' +
  'Если пользователь спрашивает про внедрение AI в бизнес, мягко предложи GPTBot.uz: AI-чат для сайта, Telegram-бот, CRM и автоматизация заявок.';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function buildMessages(opts: {
  summary?: string | null;
  history: ChatMessage[];
  userMessage: string;
  maxTurns: number;
}): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (opts.summary && opts.summary.trim()) {
    msgs.push({ role: 'system', content: `Контекст предыдущего диалога (сводка): ${opts.summary.trim().slice(0, 2000)}` });
  }
  const trimmed = (opts.history || [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-opts.maxTurns * 2)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  msgs.push(...trimmed, { role: 'user', content: opts.userMessage });
  return msgs;
}

export type LeadIntent = 'site_chat' | 'telegram_bot' | 'crm' | 'subscription' | 'consultation' | 'unknown';

/** Heuristic intent detection from the user's last message. PURE, deterministic. */
export function detectIntent(text: string | undefined | null): LeadIntent {
  const t = (text || '').toLowerCase();
  if (!t) return 'unknown';
  if (/(crm|amocrm|amo crm|bitrix|битрикс)/.test(t)) return 'crm';
  if (/(телеграм|telegram|тг[\s-]?бот|tg bot)/.test(t)) return 'telegram_bot';
  if (/(на сайт|для сайта|виджет|website|sayt|на мой сайт|консультант на сайт)/.test(t)) return 'site_chat';
  if (/(подписк|тариф|plus|оплат|купить|subscri|obuna|tarif)/.test(t)) return 'subscription';
  if (/(консультац|созвон|обсуди|заказать|внедр|konsultatsiya|maslahat)/.test(t)) return 'consultation';
  return 'unknown';
}

/** Title from the first user message. Fallback per locale. */
export function sessionTitle(firstMessage: string | undefined | null, locale: Locale): string {
  const t = (firstMessage || '').trim().replace(/\s+/g, ' ');
  if (!t) return locale === 'uz' ? 'Yangi chat' : 'Новый чат';
  return t.length > 60 ? t.slice(0, 57) + '…' : t;
}
