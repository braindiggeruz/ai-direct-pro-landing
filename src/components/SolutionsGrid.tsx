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
  const renderSolution = (s: Solution, compact = false) => {
    const url = (isUz && s.uzUrl) ? s.uzUrl : s.ruUrl;
    const title = isUz ? s.uzTitle : s.ruTitle;
    const desc = isUz ? s.uzDesc : s.ruDesc;
    return (
      <a
        key={s.ruUrl}
        data-testid={`solution-card-${s.ruUrl.replace(/[/]/g, '-')}`}
        href={url}
        onClick={() => track('click_solution_card', { url })}
        className={`pressable-card group block rounded-2xl border border-white/10 bg-white/[0.025] hover:border-brand-cyan/40 hover:bg-white/[0.045] ${compact ? 'p-4 sm:p-5' : 'p-5 sm:p-7'}`}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="rounded-full border border-brand-cyan/20 bg-brand-cyan/[0.05] px-2.5 py-1 text-xs uppercase tracking-wider text-brand-cyan/80">{s.tag}</span>
          <span className="text-brand-cyan transition-opacity duration-200 group-hover:opacity-100 sm:opacity-0" aria-hidden>→</span>
        </div>
        <h3 className="font-display text-lg leading-snug text-white transition-colors duration-200 group-hover:text-brand-cyan sm:text-xl">{title}</h3>
        {!compact && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-white/60">{desc}</p>}
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-cyan">{readLabel}<span aria-hidden>→</span></span>
      </a>
    );
  };

  return (
    <section id="solutions" data-testid="solutions-grid" className="relative py-16 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-8">
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

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          {SOLUTIONS.slice(0, 4).map((s) => renderSolution(s))}
        </div>
        <details className="editorial-disclosure mt-4">
          <summary>{isUz ? 'Barcha yechimlarni ko‘rsatish' : 'Показать все решения'}</summary>
          <div className="mt-3">{SOLUTIONS.slice(4).map((s) => renderSolution(s, true))}</div>
        </details>
      </div>
    </section>
  );
}
