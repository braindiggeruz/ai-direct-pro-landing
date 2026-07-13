import { useState } from 'react';
import type { ChatStrings } from '../i18n';
import { sendLead } from '../api';
import { track, EV } from '../analytics';

export function AiChatLeadForm({
  t,
  apiBase,
  sessionId,
}: {
  t: ChatStrings;
  apiBase: string;
  sessionId: string | null;
}) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact.trim() || !consent) {
      setState('error');
      return;
    }
    setState('sending');
    track(EV.leadIntent, {});
    track(EV.businessDemoStarted, { from: 'compact_lead' });
    const res = await sendLead(apiBase, {
      name: name.trim() || undefined,
      contactValue: contact.trim(),
      consent,
      sessionId,
      intent: 'b2b_chat',
      pageUrl: typeof location !== 'undefined' ? location.pathname : undefined,
    });
    if (res.ok) {
      setState('done');
      track(EV.leadSubmitted, {});
      track(EV.businessLeadSubmitted, { from: 'compact_lead' });
    } else {
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <div className="rounded-2xl border border-brand-cyan/30 bg-bg-elevated p-5 text-sm text-white/80" role="status">
        {t.leadSuccess}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-bg-surface p-5 space-y-3" data-testid="ai-lead-form">
      <p className="text-sm text-white/70">{t.leadIntro}</p>
      <label className="block text-xs text-white/65">{t.leadName}<input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.leadName}
          className="mt-1.5 w-full min-h-12 rounded-xl bg-bg-base border border-white/10 px-3 text-white text-sm focus-visible:ring-2 focus-visible:ring-brand-cyan outline-none"
        /></label>
      <label className="block text-xs text-white/65">{t.leadContact}<input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="+998… / @username"
          required
          className="mt-1.5 w-full min-h-12 rounded-xl bg-bg-base border border-white/10 px-3 text-white text-sm focus-visible:ring-2 focus-visible:ring-brand-cyan outline-none"
        /></label>
      <label className="flex min-h-12 items-start gap-3 rounded-xl p-2 text-xs text-white/60 cursor-pointer">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-cyan-400" />
        <span>{t.leadConsent}</span>
      </label>
      <button
        type="submit"
        disabled={state === 'sending'}
        className="w-full min-h-12 bg-grad-cta text-bg-base font-semibold px-6 py-3 rounded-full disabled:opacity-50"
      >
        {t.leadSubmit}
      </button>
    </form>
  );
}
