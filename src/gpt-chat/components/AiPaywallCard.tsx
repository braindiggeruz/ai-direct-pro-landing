import type { ChatStrings } from '../i18n';

export function AiPaywallCard({ t, pricingHref, onCta }: { t: ChatStrings; pricingHref: string; onCta?: () => void }) {
  return (
    <div
      className="rounded-2xl border border-brand-cyan/30 bg-bg-elevated p-6 shadow-glow/20"
      data-testid="ai-paywall"
      role="alert"
    >
      <h3 className="font-display text-xl text-white mb-2">{t.paywallTitle}</h3>
      <p className="text-white/70 text-sm mb-4 leading-relaxed">{t.paywallBody}</p>
      <a
        href={pricingHref}
        onClick={onCta}
        className="inline-flex items-center justify-center bg-grad-cta text-bg-base font-semibold px-6 py-3 rounded-full hover:scale-[1.03] transition-transform"
      >
        {t.paywallCta}
      </a>
    </div>
  );
}
