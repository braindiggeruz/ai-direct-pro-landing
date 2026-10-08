import type { Lang } from '../i18n';
import { track } from '../lib/cta';

type Resource = { href: string; label: string };
type ResourceGroup = { id: string; lang: Lang; title: string; links: Resource[] };

// A short, visible set of routes for people choosing a chat or a guide. Keep
// both languages available in either homepage mode: switching the interface
// language must not remove the only rendered home link to a useful guide.
const GROUPS: ResourceGroup[] = [
  {
    id: 'uz-chat',
    lang: 'uz',
    title: 'O‘zbekcha AI chat va qo‘llanmalar',
    links: [
      { href: '/uz/gpt-uzbek-tilida/', label: 'GPTBot.uz — o‘zbek tilida AI chat' },
      { href: '/uz/gpt-chat-qollanma/', label: 'GPTBot chatidan foydalanish' },
      { href: '/uz/blog/chatgptga-qanday-kirish-mumkin/', label: 'Rasmiy ChatGPT’ga kirish' },
      { href: '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/', label: 'ChatGPT ilovasini yuklab olish' },
      { href: '/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/', label: 'ChatGPT O‘zbekistonda VPNsiz ishlaydimi?' },
      { href: '/uz/blog/chatgpt-uzbek-tilida-promptlar/', label: 'O‘zbek tilida prompt namunalari' },
      { href: '/uz/blog/ai-chat-nima-va-qanday-turlari-bor/', label: 'AI chat turlari va farqlari' },
    ],
  },
  {
    id: 'uz-study',
    lang: 'uz',
    title: 'O‘qish va hujjatlar',
    links: [
      { href: '/uz/blog/kurs-ishi-yozish/', label: 'Kurs ishi: reja va manbalar' },
      { href: '/uz/blog/tushuntirish-xati-va-ariza-yozish/', label: 'Tushuntirish xati va ariza namunalari' },
      { href: '/uz/blog/biznes-reja-tuzish/', label: 'Biznes-reja tuzish bosqichlari' },
    ],
  },
  {
    id: 'ru-guides',
    lang: 'ru',
    title: 'На русском: AI и бизнес',
    links: [
      { href: '/ru/gpt-chat/', label: 'GPTBot.uz — AI-чат на русском' },
      { href: '/ru/blog/chatgpt-i-claude-v-uzbekistane/', label: 'ChatGPT и Claude в Узбекистане' },
      { href: '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/', label: 'Оплата ChatGPT в Узбекистане' },
      { href: '/ru/kak-sdelat-ai-bota-telegram-instagram/', label: 'Как создать AI-бота для Telegram и Instagram' },
    ],
  },
];

export default function HomeResources({ lang }: { lang: Lang }) {
  const isUz = lang === 'uz';

  return (
    <section
      id="home-resources"
      data-testid="home-resources"
      aria-labelledby="home-resources-heading"
      className="relative py-16 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 sm:mb-14 max-w-3xl">
          <h2 id="home-resources-heading" className="font-display text-3xl sm:text-4xl lg:text-5xl text-white leading-tight">
            {isUz ? 'AI chatlar va amaliy qo‘llanmalar' : 'AI-чаты и практические руководства'}
          </h2>
          <p className="text-white/65 mt-4 text-base sm:text-lg">
            {isUz
              ? 'GPTBot.uz chatini oching yoki vazifangizga mos qo‘llanmani tanlang. Rasmiy ChatGPT bo‘yicha yo‘riqnomalar alohida berilgan.'
              : 'Откройте чат GPTBot.uz или выберите руководство под свою задачу. Инструкции по официальному ChatGPT вынесены отдельно.'}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-5">
          {GROUPS.map((group) => (
            <div key={group.id} lang={group.lang} className="min-w-0 bg-white/[0.03] border border-white/10 rounded-2xl p-5 sm:p-7">
              <h3 id={`home-resources-${group.id}`} className="font-display text-lg sm:text-xl text-white leading-snug mb-3">
                {group.title}
              </h3>
              <ul aria-labelledby={`home-resources-${group.id}`} className="space-y-1">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      hrefLang={group.lang}
                      onClick={() => track('click_home_resource', { href: link.href, locale: lang })}
                      className="flex min-h-11 items-center py-2 text-sm text-white/80 hover:text-brand-cyan underline underline-offset-4 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
