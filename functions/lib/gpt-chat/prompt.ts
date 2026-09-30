// System prompt for the consumer AI-chat. Brand-safe per the strategic
// report: never claim to be official ChatGPT/OpenAI. No sales nudges: the
// assistant answers the question it was asked (decision D9).
import type { Locale } from "../../../src/shared/types";

export const GPT_CHAT_SYSTEM_PROMPT = [
  "Ты — AI-помощник GPTBot.uz.",
  "Помогай пользователю с текстами, идеями, учёбой, маркетингом, Telegram, Instagram, продажами и бизнес-задачами.",
  "Отвечай на языке пользователя: русский или узбекский (o‘zbek tilida).",
  "Не утверждай, что ты официальный ChatGPT/OpenAI/NVIDIA/Google. Ты независимый сервис GPTBot.uz.",
  "Не проси пароли, банковские данные, номера карт, документы или секретную информацию.",
  "Когда отвечаешь на узбекском — используй ТОЛЬКО латиницу (o‘zbek lotin), никогда кириллицу.",
  "Не повторяй одни и те же фразы или строки. Отвечай кратко, без зацикливания.",
  "Будь кратким и полезным. Если можешь ошибаться — предупреди и предложи проверить факты.",
  "Если ответ длинный, сначала дай суть, а последнюю фразу всегда заканчивай полностью.",
].join(" ");

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** buildMessages keeps promptBytes() of its result at or below this. */
const PROMPT_BYTE_BUDGET = 5700;
/** Tokens reserved for the chat template around the messages. */
const FRAMING_TOKENS = 256;
const encoder = new TextEncoder();

/**
 * UTF-8 bytes of the messages plus 32 per message for its role markers. The
 * byte count bounds the tokens: a byte-fallback tokeniser never emits more
 * tokens than bytes.
 */
function promptBytes(messages: ChatMessage[]): number {
  return messages.reduce((n, m) => n + encoder.encode(m.content).length + 32, 0);
}

/**
 * The most prompt tokens `messages` can cost: promptBytes plus the template
 * reserve. The free tier's daily budget reserves by it (model-spend-store.ts).
 */
export function promptTokenBound(messages: ChatMessage[]): number {
  return promptBytes(messages) + FRAMING_TOKENS;
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
  // Byte bound is conservative for byte-fallback tokenisers; FRAMING_TOKENS
  // stay reserved on top. Drop oldest turns before trimming the new input.
  const size = () => promptBytes(result);
  while (result.length > 2 && size() > PROMPT_BYTE_BUDGET) result.splice(1, 1);
  while (size() > PROMPT_BYTE_BUDGET && result[result.length - 1].content.length > 1)
    result[result.length - 1].content = result[result.length - 1].content.slice(
      0,
      -64,
    );
  return result;
}
