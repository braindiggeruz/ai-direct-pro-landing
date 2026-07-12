import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, MountConfig } from '../types';
import { strings } from '../i18n';
import { createSession, sendChat } from '../api';
import { loadHistory, saveHistory, loadSessionId, saveSessionId, clearHistory } from '../storage';
import { track, EV } from '../analytics';
import { AiChatMessageList } from './AiChatMessageList';
import { AiChatInput } from './AiChatInput';
import { AiPromptChips } from './AiPromptChips';
import { AiQuickActions } from './AiQuickActions';
import { AiUsageBadge } from './AiUsageBadge';
import { AiPaywallCard } from './AiPaywallCard';
import { AiSafetyNotice } from './AiSafetyNotice';
import { AiChatLeadForm } from './AiChatLeadForm';
import { AiBusinessUpsell } from './AiBusinessUpsell';

const MAX_INPUT = 3000;
const B2B_AFTER = 3; // show B2B card after this many assistant answers

export function AiChatConsole({ config }: { config: MountConfig }) {
  const t = strings(config.locale);
  const pricingHref = '/ru/tarify-ai-chat/';
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(() => loadSessionId());
  const [remaining, setRemaining] = useState<number>(-1);
  const [busy, setBusy] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [plan, setPlan] = useState<string>('anonymous_free');
  const [b2bDismissed, setB2bDismissed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const startedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const focusInput = () => { inputRef.current?.focus(); };

  useEffect(() => { track(EV.pageView, { locale: config.locale }); }, [config.locale]);

  const assistantCount = useMemo(() => messages.filter((m) => m.role === 'assistant' && !m.pending && !m.error).length, [messages]);
  const empty = messages.length === 0;

  const ensureSession = async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    const id = await createSession(config.apiBase, config.locale);
    if (id) {
      setSessionId(id);
      saveSessionId(id);
      if (!startedRef.current) { startedRef.current = true; track(EV.sessionStarted, {}); }
    }
    return id;
  };

  const persist = (next: ChatMessage[]) => { setMessages(next); saveHistory(next); };

  const doSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy || limitReached) return;
    setBusy(true);
    setInput('');
    const sid = await ensureSession();
    const history = messages.filter((m) => !m.pending && !m.error);
    const withUser: ChatMessage[] = [...history, { role: 'user', content: trimmed }, { role: 'assistant', content: '', pending: true }];
    setMessages(withUser);
    track(EV.messageSent, {});

    const res = await sendChat(config.apiBase, { sessionId: sid, message: trimmed, locale: config.locale, history });
    const base = withUser.filter((m) => !m.pending);
    if (res.plan) setPlan(res.plan);
    if (res.ok && res.answer) {
      if (typeof res.remaining === 'number') setRemaining(res.remaining);
      if (res.sessionId && res.sessionId !== sid) { setSessionId(res.sessionId); saveSessionId(res.sessionId); }
      persist([...base, { role: 'assistant', content: res.answer, model: res.modelUsed ?? null }]);
      track(EV.answerReceived, { model: res.modelUsed });
    } else if (res.code === 'limit_reached') {
      setLimitReached(true); setRemaining(0); setMessages(base); track(EV.limitReached, { reason: res.reason });
    } else {
      persist([...base, { role: 'assistant', content: res.message || t.errorGeneric, error: true }]);
      track(EV.providerError, { code: res.code });
    }
    setBusy(false);
  };

  const onPick = (prompt: string) => {
    if (busy || limitReached) return;
    // Prompts ending with ":" expect user text → prefill the composer.
    if (prompt.trim().endsWith(':')) { setInput(prompt); focusInput(); return; }
    void doSend(prompt);
  };

  // Quick-action cards carry [placeholder] templates the user must fill →
  // always prefill the composer and focus, never auto-send.
  const onQuickPick = (prompt: string) => {
    if (busy || limitReached) return;
    setInput(prompt);
    focusInput();
  };

  const onNewChat = () => { clearHistory(); setMessages([]); setLimitReached(false); setB2bDismissed(false); };

  const onRetry = () => {
    if (busy || limitReached) return;
    let lastUser = '';
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { lastUser = messages[i].content; break; } }
    if (lastUser) void doSend(lastUser);
  };

  const showB2B = assistantCount >= B2B_AFTER && !b2bDismissed && !limitReached;
  const otherHref = config.locale === 'uz' ? '/ru/gpt-chat/' : '/uz/gpt-uzbek-tilida/';

  return (
    <div className="glass-strong rounded-[28px] overflow-hidden" style={{ boxShadow: '0 30px 80px -30px rgba(0,0,0,0.7), 0 0 0 1px rgba(47,230,209,0.08) inset' }} data-testid="ai-console">
      {/* ── Header bar — wraps into clean rows on mobile (no squeeze) ── */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3.5 sm:px-5 py-3 border-b border-white/8">
        {/* Row 1 group: brand + Online (takes the left, pushes rest right on desktop) */}
        <div className="flex items-center gap-2 mr-auto">
          <span className="grid place-items-center w-7 h-7 rounded-lg text-[#04101A] bg-grad-cta font-bold text-sm" aria-hidden="true">G</span>
          <span className="font-semibold text-white text-[15px]">{t.brand}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-300/90 ml-1">
            <span className="status-dot" aria-hidden="true" />{t.online}
          </span>
        </div>
        {/* Row 2 group: RU/UZ · plan · usage */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-full border border-white/10 overflow-hidden text-[11px]" role="group" aria-label="Язык">
            <span className={config.locale === 'ru' ? 'px-2 py-1 bg-white/10 text-white' : 'px-2 py-1 text-white/50'}>RU</span>
            <a href={otherHref} className={config.locale === 'uz' ? 'px-2 py-1 bg-white/10 text-white' : 'px-2 py-1 text-white/50 hover:text-white'}>UZ</a>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-full border border-brand-violet/40 text-brand-violet/90 whitespace-nowrap">{t.planBadge(plan)}</span>
          <AiUsageBadge remaining={remaining} t={t} />
        </div>
        {/* Row 3 group: actions */}
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setShowHistory((v) => !v)} aria-label={t.history} className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 text-white/60 hover:text-white hover:border-brand-cyan/40 transition-colors whitespace-nowrap">
            {t.history}
          </button>
          {!empty && (
            <button type="button" onClick={onNewChat} aria-label={t.newChat} className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 text-white/60 hover:text-white hover:border-brand-cyan/40 transition-colors whitespace-nowrap">
              {t.newChat}
            </button>
          )}
        </div>
      </div>

      {showHistory && (
        <div className="px-4 sm:px-5 py-3 border-b border-white/8 bg-white/[0.02] text-sm text-white/55" role="region" aria-label={t.history}>
          {t.loginToSave}
        </div>
      )}

      {/* ── Viewport ── */}
      <div className="neural-grid px-4 sm:px-6 py-5 min-h-[380px] max-h-[58vh] overflow-y-auto">
        {empty ? (
          <div className="relative z-[1] py-4">
            <h2 className="h-display text-2xl sm:text-[28px] text-white mb-2 max-w-xl"><span className="text-grad">{t.emptyTitle}</span></h2>
            <p className="text-white/55 text-sm mb-4 max-w-lg leading-relaxed">{t.emptyHint}</p>
            <button type="button" onClick={focusInput} className="btn-primary text-[14px] mb-6">{t.tryFree}</button>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-3">{t.emptyPrompt}</p>
            <div className="mb-5"><AiQuickActions actions={t.quickActions} onPick={onQuickPick} disabled={busy} /></div>
            <AiPromptChips categories={t.categories} onPick={onPick} disabled={busy} />
          </div>
        ) : (
          <AiChatMessageList messages={messages} t={t} onRetry={onRetry} />
        )}
      </div>

      {/* ── Composer + inline cards ── */}
      <div className="px-4 sm:px-6 pb-5 pt-1">
        {limitReached ? (
          <AiPaywallCard t={t} apiBase={config.apiBase} sessionId={sessionId} pricingHref={pricingHref} />
        ) : (
          <>
            {showB2B && <div className="mb-3"><AiBusinessUpsell t={t} onDismiss={() => setB2bDismissed(true)} /></div>}
            {remaining >= 0 && remaining <= 2 && (
              <div className="mb-2 flex items-center gap-2 text-[12px] text-amber-200/90 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-3 py-2" role="status">
                <span aria-hidden="true">⚡</span>
                <span>{t.lowWarning(remaining)}</span>
                <a href={pricingHref} className="ml-auto text-brand-cyan hover:underline whitespace-nowrap">{t.paywallCta}</a>
              </div>
            )}
            <AiChatInput value={input} onChange={setInput} onSend={() => doSend(input)} disabled={busy} busy={busy} maxChars={MAX_INPUT} t={t} inputRef={inputRef} />
          </>
        )}
        <div className="mt-3"><AiSafetyNotice t={t} /></div>
        <p className="mt-2 text-[11px] text-white/35 leading-relaxed">{t.disclaimer}</p>
      </div>

      {/* Lead form lives below the console — B2B capture without crowding chat. */}
      <div className="px-4 sm:px-6 pb-5">
        <AiChatLeadForm t={t} apiBase={config.apiBase} sessionId={sessionId} />
      </div>
    </div>
  );
}
