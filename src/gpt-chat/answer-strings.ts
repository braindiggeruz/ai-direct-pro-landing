// The copy of an answer's action row, the lazy part chat-answer
// (components/AiAnswer.tsx): its buttons, what each asks the model, and the
// lines under the row. The visitor's bubble shows a button's name, never the
// instruction (plan ACT-02). Uzbek in Latin script with ‘ (U+2018).
import type { Locale } from "./types";

export interface AnswerStrings {
  copy: string;
  copied: string;
  /** Neither the clipboard nor the fallback copy worked. */
  copyFailed: string;
  simpler: string;
  continue: string;
  /** A new answer in place of the last one: a new call of the model, so it costs a message. */
  regenerate: string;
  /** On a phone: the rest of the row. */
  more: string;
  /** The translation goes the other way from the answer's script. */
  toRussian: string;
  toUzbek: string;
  /** Under the row once a session while few messages are left. */
  buttonCost: string;
  /** What each button asks the model, followed by the answer (or its end). */
  ask: { shorter: string; continue: string; russian: string; uzbek: string };
}

const RU: AnswerStrings = {
  copy: "Копировать",
  copied: "Скопировано",
  copyFailed: "Копирование недоступно. Выделите текст и скопируйте вручную.",
  simpler: "Объяснить проще",
  continue: "Продолжить",
  regenerate: "Другой ответ",
  more: "⋯ Ещё",
  toRussian: "Перевести на русский",
  toUzbek: "Перевести на узбекский",
  buttonCost: "Каждая кнопка — 1 сообщение.",
  ask: {
    shorter: "Объясни следующий ответ проще, добавь один понятный бытовой пример:",
    continue: "Продолжи свой ответ ровно с этого места, не повторяя написанное. Конец ответа:",
    russian: "Переведи следующий текст на естественный русский язык. Не добавляй новые факты:",
    uzbek: "Переведи следующий текст на естественный Uzbek Latin. Не добавляй новые факты:",
  },
};

const UZ: AnswerStrings = {
  copy: "Nusxalash",
  copied: "Nusxalandi",
  copyFailed: "Nusxalab bo‘lmadi. Matnni belgilab, qo‘lda nusxalang.",
  simpler: "Oddiyroq tushuntir",
  continue: "Davom ettir",
  regenerate: "Qayta yozish",
  more: "⋯ Yana",
  toRussian: "Rus tiliga tarjima",
  toUzbek: "O‘zbekchaga tarjima",
  buttonCost: "Har bir tugma — 1 ta xabar.",
  ask: {
    shorter: "Quyidagi javobni oddiyroq tushuntir. Kundalik hayotdan misol keltir:",
    continue: "Javobingni aynan shu joydan davom ettir, takrorlama. Oxirgi qismi:",
    russian: "Quyidagi matnni rus tiliga tarjima qil. Yangi fakt qo‘shma:",
    uzbek: "Quyidagi matnni o‘zbek tiliga (lotin yozuvida) tarjima qil. Yangi fakt qo‘shma:",
  },
};

export function answerStrings(locale: Locale): AnswerStrings {
  return locale === "uz" ? UZ : RU;
}
