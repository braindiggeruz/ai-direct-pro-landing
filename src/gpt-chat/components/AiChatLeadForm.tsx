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
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.leadName}
        className="w-full rounded-lg bg-bg-base border border-white/10 px-3 py-2 text-white text-sm focus:border-brand-cyan/50 outline-none"
      />
      <input
        type="text"
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder={t.leadContact}
        required
        className="w-full rounded-lg bg-bg-base border border-white/10 px-3 py-2 text-white text-sm focus:border-brand-cyan/50 outline-none"
      />
      <label className="flex items-start gap-2 text-xs text-white/60 cursor-pointer">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span>{t.leadConsent}</span>
      </label>
      <button
        type="submit"
        disabled={state === 'sending'}
        className="w-full bg-grad-cta text-bg-base font-semibold px-6 py-3 rounded-full disabled:opacity-50"
      >
        {t.leadSubmit}
      </button>
    </form>
  );
}
