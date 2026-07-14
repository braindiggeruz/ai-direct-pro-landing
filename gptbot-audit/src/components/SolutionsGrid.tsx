import type { Dict } from '../i18n';
import type { Lang } from '../i18n';
import { track } from '../lib/cta';

// Popular solutions section — directly links to the Batch A money pages
// that are live in the sitemap and prerendered. RU set is the canonical
// list; UZ shows the localised slugs where they exist. We never link to
// a page that is currently a draft (would 200 to SPA shell but with no
// content). The order is by SEO priority for top-3 hunting.

type Solution = {
  ruUrl: string;
  uzUrl?: string;
  ruTitle: string;
  uzTitle: string;
  ruDesc: string;
  uzDesc: string;
  tag: string;
};

const SOLUTIONS: Solution[] = [
  {
    ruUrl: '/ru/ai-bot-dlya-biznesa/',
    uzUrl: '/uz/biznes-uchun-ai-bot/',
    ruTitle: 'AI-бот для бизнеса',
    uzTitle: 'Biznes uchun AI bot',
    ruDesc: 'AI/GPT-менеджер отвечает 24/7 в Telegram и Instagram, собирает имя и телефон и передаёт горячие заявки менеджеру.',
    uzDesc: "AI/GPT-menejer Telegram va Instagram'da 24/7 javob beradi, ism va telefonni yig'adi va issiq lidlarni menejerga uzatadi.",
    tag: 'AI',
  },
  {
    ruUrl: '/ru/gpt-bot-dlya-biznesa/',
    uzUrl: '/uz/gpt-bot-biznes-uchun/',
    ruTitle: 'GPT-бот для бизнеса',
    uzTitle: 'GPT-bot biznes uchun',
    ruDesc: 'Умный GPT-чатбот для нестандартных вопросов клиентов: понимает свободный текст и работает на русском и узбекском.',
    uzDesc: "Aqlli GPT-chatbot: erkin matnli savollarni tushunadi, rus va o'zbek tillarida ishlaydi.",
    tag: 'GPT',
  },
  {
    ruUrl: '/ru/telegram-bot-dlya-biznesa/',
    uzUrl: '/uz/telegram-bot-biznes-uchun/',
    ruTitle: 'Telegram-бот для бизнеса',
    uzTitle: 'Telegram bot biznes uchun',
    ruDesc: 'Приём заявок, каталог, рассылки и оплата в Telegram. Интеграция с CRM и AI-менеджером.',
    uzDesc: "Arizalar, katalog, xabarlar va to'lov Telegram'da. CRM va AI-menejer bilan integratsiya.",
    tag: 'Telegram',
  },
  {
    ruUrl: '/ru/instagram-direct-bot/',
    uzUrl: '/uz/instagram-bot-biznes-uchun/',
    ruTitle: 'Instagram Direct бот',
    uzTitle: 'Instagram Direct bot',
    ruDesc: 'Отвечает в Direct и комментариях, собирает контакты и передаёт горячих клиентов менеджеру.',
    uzDesc: "Direct va sharhlarga javob beradi, kontaktlarni yig'adi va issiq mijozlarni menejerga uzatadi.",
    tag: 'Direct',
  },
  {
    ruUrl: '/ru/chat-bot-dlya-biznesa/',
    uzUrl: undefined,
    ruTitle: 'Чат-бот для бизнеса',
    uzTitle: 'Biznes uchun chatbot',
    ruDesc: 'Классический чат-бот в Telegram и Instagram: FAQ, заказы, заявки, разгрузка менеджеров.',
    uzDesc: 'Telegram va Instagram uchun klassik chatbot: FAQ, buyurtmalar, arizalar.',
    tag: 'Bot',
  },
];

export default function SolutionsGrid({ lang }: { t: Dict; lang: Lang }) {
  const isUz = lang === 'uz';
  const heading = isUz ? 'Mashhur yechimlar' : 'Популярные решения';
  const sub = isUz
    ? 'Tayyor sahifalar — kerakli vazifani tanlang va batafsil ko\'ring.'
    : 'Готовые сценарии — выберите задачу и посмотрите подробности.';
  const readLabel = isUz ? "Batafsil" : 'Подробнее';

  return (
    <section id="solutions" data-testid="solutions-grid" className="relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl mb-10 sm:mb-14">
          <div className="text-xs uppercase tracking-[0.2em] text-brand-cyan/80 mb-3">
            {isUz ? 'YECHIMLAR' : 'РЕШЕНИЯ'}
          </div>
          <h2 data-testid="solutions-heading" className="font-display text-3xl sm:text-4xl lg:text-5xl text-white leading-tight">
            {heading}
          </h2>
          <p className="text-white/65 mt-4 text-base sm:text-lg">{sub}</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {SOLUTIONS.map((s) => {
            const url = (isUz && s.uzUrl) ? s.uzUrl : s.ruUrl;
            const title = isUz ? s.uzTitle : s.ruTitle;
            const desc = isUz ? s.uzDesc : s.ruDesc;
            return (
              <a
                key={s.ruUrl}
                data-testid={`solution-card-${s.ruUrl.replace(/[/]/g, '-')}`}
                href={url}
                onClick={() => track('click_solution_card', { url })}
                className="group block bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 hover:border-brand-cyan/40 rounded-2xl p-6 sm:p-7 transition-all duration-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs uppercase tracking-wider text-brand-cyan/80 px-2.5 py-1 rounded-full border border-brand-cyan/20 bg-brand-cyan/[0.05]">
                    {s.tag}
                  </span>
                  <span className="text-brand-cyan opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden>→</span>
                </div>
                <h3 className="font-display text-lg sm:text-xl text-white leading-snug mb-3 group-hover:text-brand-cyan transition-colors">
                  {title}
                </h3>
                <p className="text-sm text-white/60 leading-relaxed mb-4 line-clamp-3">{desc}</p>
                <span className="text-sm font-semibold text-brand-cyan inline-flex items-center gap-1.5">
                  {readLabel}
                  <span aria-hidden>→</span>
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
