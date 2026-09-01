import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { i18n, type Lang } from './i18n';
import { buildCtaUrl, track } from './lib/cta';
import Header from './components/Header';
import Hero from './components/Hero';
import Pain from './components/Pain';

// Below-the-fold sections are code-split so the first paint only downloads
// Header + Hero + Pain. Everything else loads in parallel right after, inside
// a single Suspense boundary per group (neutral fallback keeps layout stable).
// The SEO prerender shell (scripts/prerender-home.ts) is independent of React
// and is unaffected by this split.
const Solution = lazy(() => import('./components/Solution'));
const SolutionsGrid = lazy(() => import('./components/SolutionsGrid'));
const DemoChat = lazy(() => import('./components/DemoChat'));
const Niches = lazy(() => import('./components/Niches'));
const Offer = lazy(() => import('./components/Offer'));
const BlogTeaser = lazy(() => import('./components/BlogTeaser'));
const FAQ = lazy(() => import('./components/FAQ'));
const FinalCTA = lazy(() => import('./components/FinalCTA'));
const Footer = lazy(() => import('./components/Footer'));
const StickyCTA = lazy(() => import('./components/StickyCTA'));

// Suspense has no "resolved" callback; this sentinel bumps a counter once the
// lazy chunks mount so the section observers below can (re)scan the DOM.
function MountSignal({ onMount }: { onMount: () => void }) {
  useEffect(() => {
    onMount();
  }, [onMount]);
  return null;
}

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
  // Bumped by MountSignal when a lazy below-the-fold boundary resolves.
  const [belowFoldVersion, setBelowFoldVersion] = useState(0);
  const signalBelowFold = useCallback(() => setBelowFoldVersion((v) => v + 1), []);
  // Survives effect re-runs so an already-tracked section never fires twice.
  const viewedSections = useRef(new Set<string>());

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
    const seen = viewedSections.current;
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
    // belowFoldVersion: lazy sections mount after first paint — rescan for them.
  }, [lang, belowFoldVersion]);

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
    // belowFoldVersion: pick up .reveal nodes added by lazy sections.
  }, [lang, belowFoldVersion]);

  const switchLang = (next: Lang) => {
    if (next === lang) return;
    setLang(next);
    track('switch_language', { lang: next });
  };

  return (
    <div className="relative overflow-x-clip">
      <a className="skip-link" href="#main-content">
        {lang === 'uz' ? 'Asosiy mazmunga o‘tish' : 'Перейти к основному содержанию'}
      </a>
      <Header t={t} lang={lang} onSwitchLang={switchLang} ctaUrl={ctaUrl} />
      <main id="main-content">
        <Hero t={t} ctaUrl={ctaUrl} />
        <Pain t={t} />
        <Suspense fallback={null}>
          <Solution t={t} ctaUrl={ctaUrl} />
          <SolutionsGrid t={t} lang={lang} />
          <DemoChat t={t} ctaUrl={ctaUrl} />
          <Niches t={t} lang={lang} />
          <Offer t={t} ctaUrl={ctaUrl} />
          <BlogTeaser t={t} lang={lang} />
          <FAQ t={t} />
          <FinalCTA t={t} ctaUrl={ctaUrl} />
          <MountSignal onMount={signalBelowFold} />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <Footer t={t} lang={lang} ctaUrl={ctaUrl} />
        <StickyCTA t={t} ctaUrl={ctaUrl} lang={lang} />
        <MountSignal onMount={signalBelowFold} />
      </Suspense>
    </div>
  );
}
