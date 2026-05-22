import type { Dict } from '../i18n';

export default function Footer({ t }: { t: Dict }) {
  return (
    <footer data-testid="site-footer" className="relative pt-12 pb-32 sm:pb-12 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-grad-cta">
              <img src="/assets/landing/2.png" alt="" className="h-7 w-7 rounded-lg" width={28} height={28} loading="lazy" />
            </span>
            <div>
              <div className="font-display font-extrabold text-white">{t.footer.brand}</div>
              <div className="text-xs text-white/55">{t.footer.city} · {t.footer.tag}</div>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-2 text-xs text-white/50">
            <a href="#" className="hover:text-white transition">{t.footer.privacy}</a>
            <span>{t.footer.consent}</span>
            <span className="text-white/30">© {new Date().getFullYear()} {t.footer.brand}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
