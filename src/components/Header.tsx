import { useState } from 'react';
import type { Dict } from '../i18n';
import type { Lang } from '../i18n';
import { track } from '../lib/cta';

type Props = { t: Dict; lang: Lang; onSwitchLang: (l: Lang) => void; ctaUrl: string };

export default function Header({ t, lang, onSwitchLang, ctaUrl }: Props) {
  const [scrolled, setScrolled] = useState(false);

  if (typeof window !== 'undefined') {
    window.addEventListener(
      'scroll',
      () => setScrolled(window.scrollY > 8),
      { passive: true, once: false },
    );
  }

  return (
    <header
      data-testid="site-header"
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'backdrop-blur-xl bg-[#05070D]/70 border-b border-white/5' : ''
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        <a href="#top" data-testid="brand-logo" className="flex items-center gap-2.5 group">
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl bg-grad-cta shadow-glow">
            <span className="absolute inset-0 rounded-xl bg-grad-cta opacity-60 blur-md group-hover:opacity-90 transition" />
            <img
              src="/assets/landing/2.png"
              alt=""
              className="relative h-7 w-7 rounded-lg object-cover"
              loading="eager"
              width={28}
              height={28}
            />
          </span>
          <span className="font-display font-extrabold tracking-tight text-white text-base sm:text-lg">
            {t.nav.brand}
          </span>
        </a>

        <div className="flex items-center gap-2 sm:gap-3">
          <a
            data-testid="header-blog-link"
            href="/ru/blog/"
            onClick={() => track('click_header_blog')}
            className="text-sm font-semibold text-white/80 hover:text-brand-cyan transition px-2 sm:px-3"
          >
            Блог
          </a>

          <div
            data-testid="lang-switcher"
            className="flex items-center rounded-full border border-white/10 bg-white/[0.04] p-0.5 text-xs font-semibold"
          >
            <button
              data-testid="lang-ru"
              onClick={() => onSwitchLang('ru')}
              className={`px-3 py-1.5 rounded-full transition ${
                lang === 'ru' ? 'bg-grad-cta text-[#04101A]' : 'text-white/70 hover:text-white'
              }`}
            >
              RU
            </button>
            <button
              data-testid="lang-uz"
              onClick={() => onSwitchLang('uz')}
              className={`px-3 py-1.5 rounded-full transition ${
                lang === 'uz' ? 'bg-grad-cta text-[#04101A]' : 'text-white/70 hover:text-white'
              }`}
            >
              UZ
            </button>
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
        </div>
      </div>
    </header>
  );
}
