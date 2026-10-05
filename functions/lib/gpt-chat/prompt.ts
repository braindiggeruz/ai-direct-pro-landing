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

/**
 * buildMessages keeps promptBytes() of its result at or below this, or at
 * what the system prompt and a new message within MESSAGE_BYTE_CEILING take
 * when that is more: the history makes room, the message is never cut.
 */
const PROMPT_BYTE_BUDGET = 5700;
/**
 * The most a new message may take whole: GPT_MAX_INPUT_CHARS' 3000
 * characters at 3 UTF-8 bytes per UTF-16 unit, the most one takes (Cyrillic
 * takes 2, the Uzbek ‘ and ’ take 3, an emoji's pair 4). A longer message
 * (a raised GPT_MAX_INPUT_CHARS) is still cut, and the chat refuses it.
 */
const MESSAGE_BYTE_CEILING = 3 * 3000;
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
  // stay reserved on top. Drop oldest turns before trimming the new input,
  // which only a message past MESSAGE_BYTE_CEILING ever needs. Before, a
  // Russian message past ≈4 400 bytes (2 200–2 700 characters) was cut, and
  // the chat refused it as context_too_large.
  const budget = Math.max(
    PROMPT_BYTE_BUDGET,
    promptBytes([result[0]]) +
      Math.min(encoder.encode(userMessage).length, MESSAGE_BYTE_CEILING) +
      32,
  );
  const size = () => promptBytes(result);
  while (result.length > 2 && size() > budget) result.splice(1, 1);
  while (size() > budget && result[result.length - 1].content.length > 1)
    result[result.length - 1].content = result[result.length - 1].content.slice(
      0,
      -64,
    );
  return result;
}
