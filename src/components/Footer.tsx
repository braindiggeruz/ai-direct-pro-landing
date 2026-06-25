import type { Dict } from '../i18n';
import type { Lang } from '../i18n';
import { track } from '../lib/cta';

// Full footer with money pages (Batch A), niche pages, blog, contacts.
// Niche pages still link out even when they're drafts in this build — the
// SPA shell will render, and once Batch B/C lands these URLs will go from
// SPA-shell to fully prerendered without changing the footer markup.

const SOLUTION_LINKS = [
  { ru: '/ru/ai-bot-dlya-biznesa/', uz: '/uz/biznes-uchun-ai-bot/', ruLabel: 'AI-бот для бизнеса', uzLabel: 'Biznes uchun AI bot' },
  { ru: '/ru/gpt-bot-dlya-biznesa/', uz: '/uz/gpt-bot-biznes-uchun/', ruLabel: 'GPT-бот', uzLabel: 'GPT-bot' },
  { ru: '/ru/telegram-bot-dlya-biznesa/', uz: '/uz/telegram-bot-biznes-uchun/', ruLabel: 'Telegram-бот', uzLabel: 'Telegram bot' },
  { ru: '/ru/instagram-direct-bot/', uz: '/uz/instagram-bot-biznes-uchun/', ruLabel: 'Instagram Direct бот', uzLabel: 'Instagram Direct bot' },
  { ru: '/ru/chat-bot-dlya-biznesa/', uz: undefined, ruLabel: 'Чат-бот', uzLabel: 'Chatbot' },
  { ru: '/ru/avtomatizatsiya-zayavok/', uz: '/uz/arizalarni-avtomatlashtirish/', ruLabel: 'Автоматизация заявок', uzLabel: 'Arizalarni avtomatlashtirish' },
  { ru: '/ru/avtomatizatsiya-prodazh/', uz: '/uz/savdoni-avtomatlashtirish/', ruLabel: 'Автоматизация продаж', uzLabel: 'Savdoni avtomatlashtirish' },
];

const NICHE_LINKS = [
  { ru: '/ru/ai-bot-dlya-kliniki/', uz: '/uz/klinika-uchun-ai-bot/', ruLabel: 'Клиники', uzLabel: 'Klinika uchun' },
  { ru: '/ru/ai-bot-dlya-salona-krasoty/', uz: '/uz/salon-uchun-ai-bot/', ruLabel: 'Салоны красоты', uzLabel: 'Salon uchun' },
  { ru: '/ru/ai-bot-dlya-uchebnogo-tsentra/', uz: '/uz/oquv-markazi-uchun-ai-bot/', ruLabel: 'Учебные центры', uzLabel: 'O\'quv markazi' },
  { ru: '/ru/ai-bot-dlya-magazina/', uz: '/uz/dokon-uchun-ai-bot/', ruLabel: 'Интернет-магазин', uzLabel: 'Internet-do\'kon' },
  { ru: '/ru/ai-bot-dlya-horeca/', uz: undefined, ruLabel: 'HoReCa', uzLabel: 'HoReCa' },
];

export default function Footer({ t, lang, ctaUrl }: { t: Dict; lang: Lang; ctaUrl: string }) {
  const isUz = lang === 'uz';
  const lSolutions = isUz ? 'Yechimlar' : 'Решения';
  const lNiches = isUz ? 'Nishlar' : 'Ниши';
  const lResources = isUz ? 'Resurslar' : 'Ресурсы';
  const lContacts = isUz ? 'Kontaktlar' : 'Контакты';
  const lBlog = isUz ? 'Blog' : 'Блог';
  const lSitemap = 'Sitemap';
  const lDemo = t.nav.cta;
  return (
    <footer id="contacts" data-testid="site-footer" className="relative pt-16 pb-32 sm:pb-12 border-t border-white/5 bg-bg-base/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 md:gap-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-grad-cta">
                <img src="/assets/landing/2.webp" alt="Логотип GPTBot" className="h-7 w-7 rounded-lg" width={28} height={28} loading="lazy" />
              </span>
              <div>
                <div className="font-display font-extrabold text-white">{t.footer.brand}</div>
                <div className="text-xs text-white/55">{t.footer.city} · {t.footer.tag}</div>
              </div>
            </div>
            <p className="text-sm text-white/55 leading-relaxed mb-5 max-w-xs">
              {isUz
                ? "AI-bot Telegram va Instagram'da mijozlarga 24/7 javob beradi. O'zbekiston uchun moslab tuziladi."
                : 'AI-бот для бизнеса в Telegram и Instagram: отвечает 24/7, передаёт горячие заявки менеджеру.'}
            </p>
            <a
              data-testid="footer-cta"
              href={ctaUrl}
              target="_blank"
              rel="noopener"
              onClick={() => track('click_footer_cta')}
              className="btn-primary !py-2.5 !px-4 text-sm"
            >
              {lDemo}
            </a>
          </div>

          {/* Solutions column */}
          <div className="md:col-span-3" data-testid="footer-solutions">
            <h3 className="text-white font-semibold text-sm mb-4">{lSolutions}</h3>
            <ul className="space-y-2.5 text-sm">
              {SOLUTION_LINKS.map((l) => {
                const href = (isUz && l.uz) ? l.uz : l.ru;
                const label = isUz ? l.uzLabel : l.ruLabel;
                return (
                  <li key={l.ru}>
                    <a href={href} className="text-white/65 hover:text-brand-cyan transition" onClick={() => track('click_footer_link', { href })}>
                      {label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Niches column */}
          <div className="md:col-span-3" data-testid="footer-niches">
            <h3 className="text-white font-semibold text-sm mb-4">{lNiches}</h3>
            <ul className="space-y-2.5 text-sm">
              {NICHE_LINKS.map((l) => {
                const href = (isUz && l.uz) ? l.uz : l.ru;
                const label = isUz ? l.uzLabel : l.ruLabel;
                return (
                  <li key={l.ru}>
                    <a href={href} className="text-white/65 hover:text-brand-cyan transition" onClick={() => track('click_footer_link', { href })}>
                      {label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Resources + Contacts column */}
          <div className="md:col-span-2" data-testid="footer-resources">
            <h3 className="text-white font-semibold text-sm mb-4">{lResources}</h3>
            <ul className="space-y-2.5 text-sm mb-6">
              <li><a href="/ru/blog/" data-testid="footer-blog" className="text-white/65 hover:text-brand-cyan transition">{lBlog}</a></li>
              <li><a href="/sitemap.xml" data-testid="footer-sitemap" className="text-white/65 hover:text-brand-cyan transition">{lSitemap}</a></li>
              <li><a href="#faq" className="text-white/65 hover:text-brand-cyan transition">FAQ</a></li>
            </ul>
            <h3 className="text-white font-semibold text-sm mb-4">{lContacts}</h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="https://t.me/XGame_changerx" target="_blank" rel="noopener" data-testid="footer-telegram" className="text-white/65 hover:text-brand-cyan transition">
                  Telegram bot
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/5 flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between text-xs text-white/40">
          <span>© {new Date().getFullYear()} {t.footer.brand}. {t.footer.consent}</span>
          <a href="#" className="hover:text-white/70 transition">{t.footer.privacy}</a>
        </div>
      </div>
    </footer>
  );
}
