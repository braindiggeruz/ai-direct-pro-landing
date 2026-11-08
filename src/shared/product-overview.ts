// One visible product description for the homepage and its no-JavaScript shell.
export const PRODUCT_OVERVIEW = {
  ru: {
    text: 'GPTBot.uz объединяет самостоятельный AI-чат на русском и узбекском, Studio для подготовки презентаций и разработку ботов для бизнеса. Это отдельные продукты со своими условиями; GPTBot.uz не является ChatGPT и не связан с OpenAI.',
    links: [
      { href: '/ru/gpt-chat/', label: 'Открыть AI-чат' },
      { href: '/ru/prezentatsiya-ai/', label: 'Создать презентацию в Studio' },
      { href: '/ru/ai-bot-dlya-biznesa/', label: 'Внедрить бота для бизнеса' },
    ],
  },
  uz: {
    text: 'GPTBot.uz o‘zbek va rus tillaridagi mustaqil AI chat, taqdimot tayyorlash uchun Studio va biznes botlarini ishlab chiqishni birlashtiradi. Bular o‘z shartlariga ega alohida mahsulotlar; GPTBot.uz ChatGPT emas va OpenAI bilan bog‘liq emas.',
    links: [
      { href: '/uz/gpt-uzbek-tilida/', label: 'AI chatni ochish' },
      { href: '/uz/taqdimot-ai/', label: 'Studio’da taqdimot yaratish' },
      { href: '/uz/biznes-uchun-ai-bot/', label: 'Biznes uchun bot joriy etish' },
    ],
  },
} as const;
