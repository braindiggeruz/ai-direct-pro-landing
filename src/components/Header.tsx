import { useState } from 'react';
import type { Dict } from '../i18n';
import type { Lang } from '../i18n';
import { track } from '../lib/cta';

type Props = { t: Dict; lang: Lang; onSwitchLang: (l: Lang) => void; ctaUrl: string };

export default function Header({ t, lang, onSwitchLang, ctaUrl }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (typeof window !== 'undefined') {
    window.addEventListener(
      'scroll',
      () => setScrolled(window.scrollY > 8),
      { passive: true, once: false },
    );
  }

  const isUz = lang === 'uz';
  const navItems = [
    { href: '#solutions', testid: 'nav-solutions', label: isUz ? 'Yechimlar' : 'Решения' },
    { href: '#niches', testid: 'nav-niches', label: isUz ? 'Nishlar' : 'Ниши' },
    { href: '/ru/blog/', testid: 'header-blog-link', label: isUz ? 'Blog' : 'Блог' },
    { href: '#faq', testid: 'nav-faq', label: 'FAQ' },
    { href: '#contacts', testid: 'nav-contacts', label: isUz ? 'Kontaktlar' : 'Контакты' },
  ];

  return (
    <header
      data-testid="site-header"
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'backdrop-blur-xl bg-[#05070D]/80 border-b border-white/5' : ''
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        <a href="#top" data-testid="brand-logo" className="flex items-center gap-2.5 group shrink-0">
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl bg-grad-cta shadow-glow">
            <span className="absolute inset-0 rounded-xl bg-grad-cta opacity-60 blur-md group-hover:opacity-90 transition" />
            <img src="/assets/landing/logo-sq.webp" alt="Логотип GPTBot" className="relative h-7 w-7 rounded-lg object-cover" loading="eager" width={28} height={28} />
          </span>
          <span className="font-display font-extrabold tracking-tight text-white text-base sm:text-lg">
            {t.nav.brand}
          </span>
        </a>

        <nav data-testid="primary-nav" className="hidden lg:flex items-center gap-1 text-sm font-medium">
          {navItems.map((item) => (
            <a
              key={item.testid}
              data-testid={item.testid}
              href={item.href}
              onClick={() => track('click_nav', { item: item.testid })}
              className="px-3 py-1.5 rounded-full text-white/75 hover:text-white hover:bg-white/[0.04] transition"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div data-testid="lang-switcher" className="flex items-center rounded-full border border-white/10 bg-white/[0.04] p-0.5 text-xs font-semibold">
            <button data-testid="lang-ru" onClick={() => onSwitchLang('ru')} className={`px-3 py-1.5 rounded-full transition ${lang === 'ru' ? 'bg-grad-cta text-[#04101A]' : 'text-white/70 hover:text-white'}`}>RU</button>
            <button data-testid="lang-uz" onClick={() => onSwitchLang('uz')} className={`px-3 py-1.5 rounded-full transition ${lang === 'uz' ? 'bg-grad-cta text-[#04101A]' : 'text-white/70 hover:text-white'}`}>UZ</button>
          </div>

          <a
            data-testid="header-cta"
            href={ctaUrl}
            target="_blank"
            rel="noopener"
            onClick={() => track('click_header_cta')}
            className="btn-primary !py-2.5 !px-4 text-sm hidden sm:inline-flex"
          >
            {t.nav.cta}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>

          <button
            data-testid="nav-mobile-toggle"
            aria-label="Open menu"
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/80 hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              {mobileOpen ? (
                <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <nav data-testid="primary-nav-mobile" className="lg:hidden border-t border-white/5 bg-[#05070D]/95 backdrop-blur-xl">
          <ul className="mx-auto max-w-7xl px-4 py-3 flex flex-col text-sm font-medium">
            {navItems.map((item) => (
              <li key={item.testid}>
                <a
                  href={item.href}
                  data-testid={`${item.testid}-mobile`}
                  onClick={() => { setMobileOpen(false); track('click_nav_mobile', { item: item.testid }); }}
                  className="block py-2.5 text-white/85 hover:text-brand-cyan"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={ctaUrl}
                target="_blank"
                rel="noopener"
                data-testid="header-cta-mobile"
                onClick={() => { setMobileOpen(false); track('click_header_cta_mobile'); }}
                className="btn-primary mt-2 w-full justify-center"
              >
                {t.nav.cta}
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
