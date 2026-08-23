import type { Dict } from '../i18n';
import type { Lang } from '../i18n';
import type { CSSProperties } from 'react';
import { track } from '../lib/cta';

const ICONS = [
  // clinic
  'M12 3v18M3 12h18M7 7h10M7 17h10',
  // beauty
  'M12 2v6m0 0a4 4 0 100 8 4 4 0 000-8Zm0 8v12',
  // edu
  'M3 8l9-4 9 4-9 4-9-4Zm4 3v6c2.5 2 7.5 2 10 0v-6',
  // shop
  'M3 8h18l-2 11H5L3 8Zm5-3a4 4 0 018 0',
  // realestate
  'M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-6h-6v6H5a2 2 0 01-2-2v-9Z',
  // tourism
  'M2 22l10-19 10 19H2Zm10-19v19',
  // horeca
  'M4 21h16M6 11a6 6 0 0012 0V5H6v6Zm14-4h2v6h-2',
  // service
  'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4L15 12l-3-3 2.7-2.7Z',
];

// Map each niche slot (by position in t.niches.items) to a money page URL.
// Order matches the RU / UZ i18n items list. Pages that don't exist in this
// locale yet fall back to the RU page (better than null, lets crawlers
// surface the niche). For now only ru/* niche pages exist as drafts with
// content; once Batch B/C goes live they'll be served from prerender.
const NICHE_URLS: { ru: string; uz?: string }[] = [
  // 0 — Клиники
  { ru: '/ru/ai-bot-dlya-kliniki/', uz: '/uz/klinika-uchun-ai-bot/' },
  // 1 — Салоны красоты
  { ru: '/ru/ai-bot-dlya-salona-krasoty/', uz: '/uz/salon-uchun-ai-bot/' },
  // 2 — Учебные центры
  { ru: '/ru/ai-bot-dlya-uchebnogo-tsentra/', uz: '/uz/oquv-markazi-uchun-ai-bot/' },
  // 3 — Магазины техники / интернет-магазин
  { ru: '/ru/ai-bot-dlya-magazina/', uz: '/uz/dokon-uchun-ai-bot/' },
  // 4 — Недвижимость — fallback to AI for business
  { ru: '/ru/ai-bot-dlya-biznesa/', uz: '/uz/biznes-uchun-ai-bot/' },
  // 5 — Туризм — fallback to AI for business
  { ru: '/ru/ai-bot-dlya-biznesa/', uz: '/uz/biznes-uchun-ai-bot/' },
  // 6 — HoReCa
  { ru: '/ru/ai-bot-dlya-horeca/', uz: '/uz/biznes-uchun-ai-bot/' },
  // 7 — Сервисный — fallback to AI for business
  { ru: '/ru/ai-bot-dlya-biznesa/', uz: '/uz/biznes-uchun-ai-bot/' },
];

export default function Niches({ t, lang }: { t: Dict; lang: Lang }) {
  const isUz = lang === 'uz';
  return (
    <section id="niches" data-testid="niches" className="section-tone relative py-16 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5 lg:sticky lg:top-24 reveal">
            <h2 className="h-display text-3xl sm:text-4xl lg:text-5xl text-white">{t.niches.h}</h2>
            <p className="mt-4 text-white/65 max-w-md">{t.niches.sub}</p>
            <div className="mt-8 relative">
              <div className="absolute -inset-6 bg-brand-cyan/15 blur-3xl rounded-[40%]" />
              <div className="niche-system relative" role="img" aria-label={t.niches.h}>
                <div className="niche-system__head">
                  <span>GPTBot</span>
                  <span>{isUz ? 'Nisha modullari' : 'Модули для ниш'}</span>
                </div>
                <div className="niche-system__core">
                  <span className="niche-system__core-ring" aria-hidden="true" />
                  <strong>AI</strong>
                  <small>RU · UZ</small>
                </div>
                <div className="niche-system__modules">
                  {t.niches.items.slice(0, 4).map((item, index) => (
                    <span key={item} style={{ '--module-index': index } as CSSProperties}>
                      <i aria-hidden="true" />{item}
                    </span>
                  ))}
                </div>
                <div className="niche-system__footer">
                  <span>{isUz ? 'Bitta yadro' : 'Одно ядро'}</span>
                  <span>{isUz ? 'Har biznes uchun ssenariy' : 'Сценарий под бизнес'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 min-[360px]:grid-cols-2 gap-3 sm:gap-4">
            {t.niches.items.map((n, i) => {
              const map = NICHE_URLS[i % NICHE_URLS.length];
              const href = (isUz && map.uz) ? map.uz : map.ru;
              return (
                <a
                  key={i}
                  href={href}
                  onClick={() => track('click_niche_card', { idx: i, href })}
                  data-testid={`niche-${i}`}
                  className="glass card-hover p-4 sm:p-5 reveal block hover:border-brand-cyan/40"
                  style={{ transitionDelay: `${i * 40}ms`, background: 'linear-gradient(180deg, rgba(34,158,217,0.06), rgba(255,255,255,0.02))' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-grad-cta text-[#04101A] shadow-glow">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d={ICONS[i % ICONS.length]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="text-brand-cyan/70 group-hover:text-brand-cyan transition" aria-hidden>→</span>
                  </div>
                  <h3 className="mt-3.5 text-sm sm:text-lg font-semibold text-white leading-snug">{n}</h3>
                  <p className="mt-1.5 text-xs sm:text-sm text-white/70 leading-relaxed line-clamp-3 sm:line-clamp-none">{t.niches.sub}</p>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
