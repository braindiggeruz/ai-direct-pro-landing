// System prompt for the consumer AI-chat. Brand-safe per the strategic
// report: never claim to be official ChatGPT/OpenAI; nudge B2B softly.
import type { Locale } from "../../../src/shared/types";

export const GPT_CHAT_SYSTEM_PROMPT = [
  "Ты — AI-помощник GPTBot.uz.",
  "Помогай пользователю с текстами, идеями, учёбой, маркетингом, Telegram, Instagram, продажами и бизнес-задачами.",
  "Отвечай на языке пользователя: русский или узбекский (o‘zbek tilida).",
  "Не утверждай, что ты официальный ChatGPT/OpenAI/NVIDIA. Ты независимый сервис GPTBot.uz.",
  "Не проси пароли, банковские данные, номера карт, документы или секретную информацию.",
  "Если пользователь спрашивает про внедрение AI в бизнес, мягко предложи GPTBot.uz: AI-чат для сайта, Telegram-бот, CRM и автоматизация заявок.",
  "Когда отвечаешь на узбекском — используй ТОЛЬКО латиницу (o‘zbek lotin), никогда кириллицу.",
  "Не повторяй одни и те же фразы или строки. Отвечай кратко, без зацикливания.",
  "Будь кратким и полезным. Если можешь ошибаться — предупреди и предложи проверить факты.",
].join(" ");

export interface ChatMessage {
  role: "user" | "assistant" | "system";
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
  locale: Locale,
): ChatMessage[] {
  void locale;
  const safeHistory = (Array.isArray(history) ? history : [])
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .slice(-maxTurns * 2)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  const result: ChatMessage[] = [
    { role: "system", content: GPT_CHAT_SYSTEM_PROMPT },
    ...safeHistory,
    { role: "user", content: userMessage },
  ];
  // Byte bound is conservative for byte-fallback tokenisers. Reserve 256
  // tokens for chat framing. Drop oldest turns before trimming the new input.
  const encoder = new TextEncoder();
  const size = () =>
    result.reduce((n, m) => n + encoder.encode(m.content).length + 32, 0);
  while (result.length > 2 && size() > 5700) result.splice(1, 1);
  while (size() > 5700 && result[result.length - 1].content.length > 1)
    result[result.length - 1].content = result[result.length - 1].content.slice(
      0,
      -64,
    );
  return result;
}
