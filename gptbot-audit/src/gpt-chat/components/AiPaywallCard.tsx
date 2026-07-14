import { useState } from 'react';
import type { ChatStrings } from '../i18n';
import { subscribe } from '../api';
import { track, EV } from '../analytics';

export function AiPaywallCard({
  t,
  apiBase,
  sessionId,
  pricingHref,
}: {
  t: ChatStrings;
  apiBase: string;
  sessionId: string | null;
  pricingHref: string;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'manual'>('idle');
  const [note, setNote] = useState('');

  const onPlus = async () => {
    setState('loading');
    track(EV.subscribeIntent, { from: 'paywall' });
    track(EV.upgradeClick, { from: 'paywall', plan: 'plus' });
    const r = await subscribe(apiBase, 'plus', sessionId);
    // Never fake active subscription — manual mode returns a note.
    setNote(r.message || t.plusManualNote);
    if (r.mode === 'checkout' && r.checkoutUrl) {
      window.location.href = r.checkoutUrl;
      return;
    }
    setState('manual');
  };

  return (
    <div
      className="glass-strong rounded-3xl p-6 sm:p-7 msg-in"
      style={{ boxShadow: '0 20px 60px -20px rgba(34,158,217,0.3)' }}
      data-testid="ai-paywall"
      role="alert"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="chip">{t.plusBadge}</span>
      </div>
      <h3 className="h-display text-2xl text-white mb-1.5">{t.paywallTitle}</h3>
      <p className="text-white/70 text-sm mb-4 leading-relaxed">{t.paywallBody}</p>
      <ul className="grid sm:grid-cols-2 gap-2 mb-5">
        {t.paywallBenefits.map((b) => (
          <li key={b} className="flex items-center gap-2 text-sm text-white/80">
            <span className="text-brand-cyan" aria-hidden="true">✓</span>
            {b}
          </li>
        ))}
      </ul>
      {state === 'manual' ? (
        <p className="text-sm text-brand-cyan/90 rounded-xl border border-brand-cyan/25 bg-brand-cyan/[0.06] px-4 py-3" role="status">
          {note}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={onPlus} disabled={state === 'loading'} className="btn-primary text-[14px] disabled:opacity-60">
            {t.paywallCta}
          </button>
          <a href={pricingHref} onClick={() => track(EV.viewPricing, { from: 'paywall' })} className="btn-secondary text-[14px]">
            {t.planBadge('plus')} · Business
          </a>
        </div>
      )}
    </div>
  );
}
