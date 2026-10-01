// The public profile of Javob (@gptbotuz_bot): its command menu and
// descriptions, RU as the default and UZ for Uzbek clients. One source for
// both ways of applying it: POST /api/internal/javob-setup (server side, the
// token never leaves Pages) and `scripts/telegram-setup.ts setup`.
//
// No price, no paid plan, no payment wording (decision D11): /plans shows the
// free limit, so its menu entry says «лимит» / «limit».

export interface BotCommand {
  command: string;
  description: string;
}

export interface BotProfile {
  commands: readonly BotCommand[];
  shortDescription: string;
  description: string;
}

/** Telegram language_code of each profile; '' is the default for every other client. */
export type ProfileLanguage = '' | 'uz';

export const JAVOB_PROFILE: Readonly<Record<ProfileLanguage, BotProfile>> = {
  '': {
    commands: [
      { command: 'start', description: 'начать' },
      { command: 'new', description: 'новый запрос' },
      { command: 'lang', description: 'язык' },
      { command: 'plans', description: 'лимит' },
      { command: 'help', description: 'помощь' },
      { command: 'privacy', description: 'конфиденциальность' },
      { command: 'delete_me', description: 'удалить мои данные' },
    ],
    shortDescription: 'Перешлите текст или голосовое — получите готовый ответ и безопасный анализ содержания.',
    description: `GPTBot Javob — помощник для текста и голосовых в Telegram.

Перешлите текст или голосовое от клиента, коллеги или руководителя — бот покажет расшифровку и подготовит ответ. Для голосового доступен Tahlil: проверяемые утверждения, противоречия и вопросы для уточнения. Это не детектор лжи и не доказательство.

Поддерживает русский, Uzbek Latin и смешанную речь. Аудио не хранится.`,
  },
  uz: {
    commands: [
      { command: 'start', description: 'boshlash' },
      { command: 'new', description: 'yangi so‘rov' },
      { command: 'lang', description: 'til' },
      { command: 'plans', description: 'limit' },
      { command: 'help', description: 'yordam' },
      { command: 'privacy', description: 'maxfiylik' },
      { command: 'delete_me', description: 'ma’lumotlarimni o‘chirish' },
    ],
    shortDescription: 'Matn yoki ovozli xabar yuboring — tayyor javob va xavfsiz mazmun tahlilini oling.',
    description: `GPTBot Javob — Telegram matn va ovozli xabarlari uchun yordamchi.

Mijoz, hamkasb yoki rahbardan kelgan matn yoki ovozli xabarni yuboring — bot transkript va javob tayyorlaydi. Ovozli xabar uchun Tahlil bayonotlar, qarama-qarshiliklar va aniqlashtiruvchi savollarni ko‘rsatadi. Bu yolg‘on detektori ham, dalil ham emas.

Rus tili, Uzbek Latin va aralash nutqni qo‘llab-quvvatlaydi. Audio saqlanmaydi.`,
  },
};

export const PROFILE_LANGUAGES: readonly ProfileLanguage[] = ['', 'uz'];
