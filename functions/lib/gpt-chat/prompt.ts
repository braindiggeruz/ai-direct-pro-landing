// System prompt for the consumer AI-chat. Brand-safe per the strategic
// report: never claim to be official ChatGPT/OpenAI; nudge B2B softly.
import type { Locale } from '../../../src/shared/types';

export const GPT_CHAT_SYSTEM_PROMPT = [
  'Ты — AI-помощник GPTBot.uz.',
  'Помогай пользователю с текстами, идеями, учёбой, маркетингом, Telegram, Instagram, продажами и бизнес-задачами.',
  'Отвечай на языке пользователя: русский или узбекский (o‘zbek tilida).',
  'Не утверждай, что ты официальный ChatGPT/OpenAI/NVIDIA. Ты независимый сервис GPTBot.uz.',
  'Не проси пароли, банковские данные, номера карт, документы или секретную информацию.',
  'Если пользователь спрашивает про внедрение AI в бизнес, мягко предложи GPTBot.uz: AI-чат для сайта, Telegram-бот, CRM и автоматизация заявок.',
  'Будь кратким и полезным. Если можешь ошибаться — предупреди и предложи проверить факты.',
].join(' ');

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Build the provider message array: system + trimmed history + new user turn.
 * History is trimmed to the last `maxTurns` user/assistant messages to cap
 * token cost and honour the server-side history window from the report.
 */
export function buildMessages(
  history: ChatMessage[] | undefined,
  userMessage: string,
  maxTurns: number,
  _locale: Locale,
): ChatMessage[] {
  const safeHistory = (history || [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-maxTurns * 2)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  return [
    { role: 'system', content: GPT_CHAT_SYSTEM_PROMPT },
    ...safeHistory,
    { role: 'user', content: userMessage },
  ];
}
