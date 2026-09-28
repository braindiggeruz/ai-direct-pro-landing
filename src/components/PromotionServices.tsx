import type { Lang } from '../i18n';
import { track } from '../lib/cta';

type Props = { lang: Lang };
type Service = { href: string; title: string; text: string };

// Visible links from the strongest page of the site to the advertising and
// promotion landings (advertising audit 2026-09-28, B06). The rendered homepage
// linked only part of the Russian pages and none of the Uzbek ones, and footer
// links alone read as boilerplate. Static list: the SPA shell must not fetch.
const RU_SERVICES: Service[] = [
  { href: '/ru/internet-reklama-tashkent/', title: 'Интернет-реклама в Ташкенте', text: 'Каналы, бюджет, запуск и учёт заявок в одном плане.' },
  { href: '/ru/kontekstnaya-reklama-tashkent/', title: 'Контекстная реклама', text: 'Google Ads и Яндекс Директ для тех, кто уже ищет услугу.' },
  { href: '/ru/targetirovannaya-reklama-tashkent/', title: 'Таргетированная реклама', text: 'Instagram и Facebook: аудитории, креативы и путь до заявки.' },
  { href: '/ru/telegram-ads-uzbekistan/', title: 'Telegram Ads и посевы', text: 'Реклама в каналах Telegram, медиабюджет в смете отдельно.' },
  { href: '/ru/smm-prodvizhenie-tashkent/', title: 'SMM-продвижение', text: 'Контент, ведение Instagram и реклама в одном пакете.' },
  { href: '/ru/seo-prodvizhenie-saytov-tashkent/', title: 'SEO-продвижение сайтов', text: 'Структура, контент и техническое SEO под заявки из поиска.' },
  { href: '/ru/lokalnoe-seo-tashkent/', title: 'Локальное SEO', text: 'Карты, карточка компании и поиск по району в Ташкенте.' },
  { href: '/ru/marketingovyi-audit-tashkent/', title: 'Маркетинговый аудит', text: 'Находим, где реклама и воронка теряют заявки.' },
  { href: '/ru/performance-marketing-tashkent/', title: 'Performance-маркетинг', text: 'Решения по рекламе на данных о лидах и продажах.' },
  { href: '/ru/digital-marketing-tashkent/', title: 'Digital-маркетинг', text: 'Система привлечения заявок: каналы, сайт и аналитика.' },
  { href: '/ru/digital-strategiya-dlya-biznesa/', title: 'Digital-стратегия', text: 'Каналы, приоритеты и план роста до запуска рекламы.' },
];

const UZ_SERVICES: Service[] = [
  { href: '/uz/internet-reklama-toshkent/', title: 'Toshkentda internet reklama', text: 'Kanallar, byudjet, ishga tushirish va arizalar hisobi bitta rejada.' },
  { href: '/uz/internet-reklama-toshkent/#target', title: 'Target reklama', text: 'Instagram va Facebook: auditoriya, kreativ va arizagacha yo‘l.' },
  { href: '/uz/internet-reklama-toshkent/#kontekst', title: 'Kontekst reklama', text: 'Google va Yandex: xizmatni qidirayotgan odamlarga e’lon.' },
  { href: '/uz/telegram-reklama/', title: 'Telegram reklama', text: 'Telegram Ads va kanallarda post, media byudjet smetada alohida.' },
  { href: '/uz/smm-xizmatlari/', title: 'SMM xizmatlari', text: 'Kontent, Instagram yuritish va reklama bitta paketda.' },
  { href: '/uz/seo-xizmati/', title: 'SEO xizmati', text: 'Qidiruvdan ariza olish uchun tuzilma, kontent va texnik SEO.' },
  { href: '/uz/sayt-yaratish/', title: 'Sayt yaratish', text: 'Ariza keltiradigan sayt va qo‘nish sahifalari.' },
];

// The homepage switches language on the client, so each mode also links the
// other language's pages as plain, crawlable anchors.
const OTHER_LANG = {
  ru: { title: 'O‘zbek tilida', hreflang: 'uz', services: UZ_SERVICES.filter((s) => !s.href.includes('#')).slice(0, 5) },
  uz: { title: 'На русском', hreflang: 'ru', services: RU_SERVICES.slice(0, 5) },
} as const;

export default function PromotionServices({ lang }: Props) {
  const isUz = lang === 'uz';
  const services = isUz ? UZ_SERVICES : RU_SERVICES;
  const other = OTHER_LANG[isUz ? 'uz' : 'ru'];

  return (
    <section
      id="promotion-services"
      data-testid="promotion-services"
      aria-labelledby="promotion-services-heading"
      className="relative py-16 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 sm:mb-14 max-w-3xl">
          <div className="text-xs uppercase tracking-[0.2em] text-brand-cyan/80 mb-3">
            {isUz ? 'XIZMATLAR' : 'УСЛУГИ'}
          </div>
          <h2
            id="promotion-services-heading"
            className="font-display text-3xl sm:text-4xl lg:text-5xl text-white leading-tight"
          >
            {isUz ? 'Reklama va targ‘ibot — arizalar uchun' : 'Реклама и продвижение под заявки'}
          </h2>
          <p className="text-white/65 mt-4 text-base sm:text-lg">
            {isUz
              ? 'Reklama, SEO va SMM: kanal tanlashdan murojaat narxi bo‘yicha hisobotgacha. Media byudjet jamoa ishidan alohida hisoblanadi.'
              : 'Реклама, SEO и SMM: от выбора канала до отчёта о стоимости обращения. Медиабюджет считается отдельно от работы команды.'}
          </p>
        </div>

        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-5">
          {services.map((s) => (
            <li key={s.href}>
              <a
                href={s.href}
                onClick={() => track('click_promotion_service_homepage', { href: s.href })}
                className="pressable-card group block h-full bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 hover:border-brand-cyan/40 rounded-2xl px-4 py-3.5 sm:p-6"
              >
                <h3 className="font-display text-base sm:text-xl text-white leading-snug sm:mb-2 group-hover:text-brand-cyan transition-colors">
                  {s.title}
                </h3>
                <p className="hidden sm:block text-sm text-white/65 leading-relaxed">{s.text}</p>
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" lang={other.hreflang}>
          <span className="text-white/45 uppercase tracking-wider text-xs">{other.title}</span>
          {other.services.map((s) => (
            <a
              key={s.href}
              href={s.href}
              hrefLang={other.hreflang}
              onClick={() => track('click_promotion_service_homepage', { href: s.href })}
              className="text-white/70 hover:text-brand-cyan underline-offset-4 hover:underline transition-colors"
            >
              {s.title}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
