import { useEffect, useMemo, useRef, useState } from 'react';
import { i18n, type Lang } from './i18n';
import { buildCtaUrl, track } from './lib/cta';
import Header from './components/Header';
import Hero from './components/Hero';
import Pain from './components/Pain';
import Solution from './components/Solution';
import HowItWorks from './components/HowItWorks';
import DemoChat from './components/DemoChat';
import Niches from './components/Niches';
import Offer from './components/Offer';
import Trust from './components/Trust';
import FAQ from './components/FAQ';
import FinalCTA from './components/FinalCTA';
import Footer from './components/Footer';
import StickyCTA from './components/StickyCTA';
import BlogTeaser from './components/BlogTeaser';
import SolutionsGrid from './components/SolutionsGrid';

function getInitialLang(): Lang {
  if (typeof window === 'undefined') return 'ru';
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('lang');
  if (fromUrl === 'uz' || fromUrl === 'ru') return fromUrl;
  const stored = localStorage.getItem('lang');
  if (stored === 'uz' || stored === 'ru') return stored;
  return 'ru';
}

export default function App() {
  const [lang, setLang] = useState<Lang>(getInitialLang());
  const t = useMemo(() => i18n[lang], [lang]);
  const ctaUrl = useMemo(() => buildCtaUrl(), []);
  const scroll50Fired = useRef(false);

  // persist language + update <html lang>
  useEffect(() => {
    document.documentElement.lang = lang === 'uz' ? 'uz' : 'ru';
    document.title =
      lang === 'uz'
        ? 'GPTBot — O‘zbekistonda biznes uchun AI bot | Instagram va Telegram'
        : 'GPTBot — AI-бот для бизнеса в Узбекистане | Telegram';
    const desc = document.querySelector('meta[name="description"]');
    if (desc) {
      desc.setAttribute(
        'content',
        lang === 'uz'
          ? 'GPTBot Instagram va Telegram’da mijozlarga 24/7 javob beradi, kontaktlarni yig‘adi va issiq lidlarni menejerga yuboradi.'
          : 'GPTBot — AI/GPT-менеджер для Instagram и Telegram. Отвечает клиентам 24/7, собирает имя, телефон и передаёт горячие заявки менеджеру.',
      );
    }
    // Update OG title/description on language change
    const setMeta = (sel: string, value: string) => {
      const el = document.querySelector(sel);
      if (el) el.setAttribute('content', value);
    };
    if (lang === 'uz') {
      setMeta('meta[property="og:title"]', 'GPTBot — O‘zbekistonda biznes uchun AI bot');
      setMeta('meta[property="og:description"]', 'Instagram va Telegram uchun AI-menejer: 24/7 javob, kontakt yig‘ish va lidlarni menejerga yuborish.');
      setMeta('meta[property="og:locale"]', 'uz_UZ');
    } else {
      setMeta('meta[property="og:title"]', 'GPTBot — AI-бот для бизнеса в Узбекистане');
      setMeta('meta[property="og:description"]', 'AI-менеджер для Instagram и Telegram: отвечает 24/7, собирает контакты и передаёт горячие заявки.');
      setMeta('meta[property="og:locale"]', 'ru_RU');
    }
    localStorage.setItem('lang', lang);
  }, [lang]);

  // 50% scroll tracking
  useEffect(() => {
    const onScroll = () => {
      if (scroll50Fired.current) return;
      const h = document.documentElement;
      const scrolled = (h.scrollTop + window.innerHeight) / h.scrollHeight;
      if (scrolled >= 0.5) {
        scroll50Fired.current = true;
        track('scroll_50');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ViewContent events for key sections (Meta Pixel + dataLayer)
  useEffect(() => {
    const ids: { sel: string; name: string }[] = [
      { sel: '[data-testid="hero"]', name: 'hero' },
      { sel: '[data-testid="demo-chat"]', name: 'demo_chat' },
      { sel: '[data-testid="offer"]', name: 'offer' },
      { sel: '[data-testid="final-cta"]', name: 'final_cta' },
    ];
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const name = (e.target as HTMLElement).dataset.viewname;
          if (!name || seen.has(name)) continue;
          if (e.isIntersecting && e.intersectionRatio >= 0.35) {
            seen.add(name);
            track('view_section', { section: name });
          }
        }
      },
      { threshold: [0.35] },
    );
    for (const { sel, name } of ids) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) {
        el.dataset.viewname = name;
        io.observe(el);
      }
    }
    return () => io.disconnect();
  }, [lang]);

  // IntersectionObserver for .reveal
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.reveal');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [lang]);

  const switchLang = (next: Lang) => {
    if (next === lang) return;
    setLang(next);
    track('switch_language', { lang: next });
  };

  return (
    <div className="relative overflow-x-clip">
      <Header t={t} lang={lang} onSwitchLang={switchLang} ctaUrl={ctaUrl} />
      <main>
        <Hero t={t} ctaUrl={ctaUrl} />
        <Pain t={t} />
        <Solution t={t} ctaUrl={ctaUrl} />
        <SolutionsGrid t={t} lang={lang} />
        <HowItWorks t={t} />
        <DemoChat t={t} ctaUrl={ctaUrl} />
        <Niches t={t} lang={lang} />
        <BlogTeaser t={t} />
        <Offer t={t} ctaUrl={ctaUrl} />
        <Trust t={t} />
        <FAQ t={t} />
        <FinalCTA t={t} ctaUrl={ctaUrl} />
      </main>
      <Footer t={t} lang={lang} ctaUrl={ctaUrl} />
      <StickyCTA t={t} ctaUrl={ctaUrl} />
    </div>
  );
}
