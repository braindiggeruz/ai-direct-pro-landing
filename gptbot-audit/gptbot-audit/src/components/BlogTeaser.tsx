import type { Dict } from '../i18n';
import { track } from '../lib/cta';

type Props = { t: Dict };

// 5 published RU blog articles. Static list — sourced from
// content/blog/ru/*.json and scripts/apply-blog.ts (PUBLISH_SLUGS).
// Kept hard-coded here to avoid runtime fetch on the SPA shell, which would
// add a network round-trip and break the first paint on slow connections.
const ARTICLES: { slug: string; title: string; excerpt: string }[] = [
  {
    slug: 'pochemu-biznes-teryaet-zayavki-iz-instagram-telegram',
    title: 'Почему бизнес теряет заявки из Instagram и Telegram',
    excerpt:
      'Где именно теряются обращения между рекламой и менеджером: задержка ответа, разные чаты, ночь и потерянный контакт.',
  },
  {
    slug: 'kak-ai-bot-pomogaet-ne-teryat-klientov-posle-reklamy',
    title: 'Как AI-бот помогает не терять клиентов после рекламы',
    excerpt:
      'Что делает AI-бот в первые секунды после клика по рекламе: квалификация, сбор контакта, передача менеджеру.',
  },
  {
    slug: 'ai-bot-dlya-biznesa-v-uzbekistane',
    title: 'AI-бот для бизнеса в Узбекистане: что выбрать и как запустить',
    excerpt:
      'Какой AI-бот реально нужен бизнесу в Ташкенте и регионах: каналы, языки, интеграции и адекватные ожидания.',
  },
  {
    slug: 'gpt-bot-vs-chat-bot',
    title: 'GPT-бот vs обычный чат-бот: что выбрать',
    excerpt:
      'Когда хватит скриптового чат-бота, а когда нужен GPT. Где гибрид работает лучше всего.',
  },
  {
    slug: 'telegram-bot-dlya-biznesa',
    title: 'Telegram-бот для бизнеса: что он реально умеет в 2026',
    excerpt:
      'Каталог, заявки, рассылки, оплата, аналитика и AI-консультант — что закладывать на старте.',
  },
];

export default function BlogTeaser({ t }: Props) {
  const isUz = (t.nav?.brand || '').toString().includes('GPTBot') && (t as unknown as { lang?: string }).lang === 'uz';
  const heading = isUz ? 'Foydali maqolalar' : 'Полезные материалы';
  const subhead = isUz
    ? "AI-bot, Direct va Telegram'da arizalar haqida amaliy maqolalar — uydirma keyslarsiz va top-3 va'dalarisiz."
    : 'Практические статьи об AI-ботах, заявках в Direct и Telegram — без выдуманных кейсов и обещаний топ-3.';
  const readLabel = isUz ? 'Oʻqish' : 'Читать';
  const allLabel = isUz ? 'Barcha maqolalar' : 'Все статьи';

  return (
    <section
      id="blog"
      data-testid="blog-teaser"
      className="relative py-20 sm:py-28 px-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10 sm:mb-14">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-brand-cyan/80 mb-3">
              {isUz ? 'BLOG' : 'БЛОГ'}
            </div>
            <h2
              data-testid="blog-teaser-heading"
              className="font-display text-3xl sm:text-4xl lg:text-5xl text-white leading-tight max-w-2xl"
            >
              {heading}
            </h2>
            <p className="text-white/65 mt-4 max-w-xl text-base sm:text-lg">{subhead}</p>
          </div>
          <a
            data-testid="blog-teaser-all"
            href="/ru/blog/"
            onClick={() => track('click_blog_all_homepage')}
            className="self-start sm:self-auto inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-brand-cyan transition border border-white/15 hover:border-brand-cyan/50 rounded-full px-5 py-2.5"
          >
            {allLabel}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {ARTICLES.slice(0, 3).map((a) => (
            <a
              key={a.slug}
              data-testid={`blog-teaser-card-${a.slug}`}
              href={`/ru/blog/${a.slug}/`}
              onClick={() => track('click_blog_card_homepage', { slug: a.slug })}
              className="group block bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 hover:border-brand-cyan/40 rounded-2xl p-6 sm:p-7 transition-all duration-200"
            >
              <div className="text-xs uppercase tracking-wider text-brand-cyan/80 mb-3">
                {isUz ? 'Maqola' : 'Статья'}
              </div>
              <h3 className="font-display text-lg sm:text-xl text-white leading-snug mb-3 group-hover:text-brand-cyan transition-colors">
                {a.title}
              </h3>
              <p className="text-sm text-white/65 leading-relaxed mb-5 line-clamp-3">{a.excerpt}</p>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-cyan">
                {readLabel}
                <span aria-hidden>→</span>
              </span>
            </a>
          ))}
        </div>

        {/* secondary row for the remaining 2 articles, more compact */}
        <div className="grid sm:grid-cols-2 gap-4 sm:gap-5 mt-5">
          {ARTICLES.slice(3).map((a) => (
            <a
              key={a.slug}
              data-testid={`blog-teaser-card-${a.slug}`}
              href={`/ru/blog/${a.slug}/`}
              onClick={() => track('click_blog_card_homepage', { slug: a.slug })}
              className="group flex items-start gap-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/10 hover:border-brand-cyan/40 rounded-2xl p-5 transition-all"
            >
              <div className="text-brand-cyan text-2xl mt-1" aria-hidden>→</div>
              <div className="min-w-0">
                <h3 className="font-display text-base sm:text-lg text-white leading-snug group-hover:text-brand-cyan transition-colors">
                  {a.title}
                </h3>
                <p className="text-sm text-white/55 leading-relaxed mt-1.5 line-clamp-2">{a.excerpt}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
