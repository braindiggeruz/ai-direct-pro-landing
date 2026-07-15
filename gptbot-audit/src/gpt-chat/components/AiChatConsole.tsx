import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, MountConfig } from '../types';
import { strings } from '../i18n';
import { createSession, sendChat } from '../api';
import { loadHistory, saveHistory, loadSessionId, saveSessionId, clearSessionId, loadRemaining, saveRemaining } from '../storage';
import { track, trackOnce, EV } from '../analytics';
import { AiChatMessageList } from './AiChatMessageList';
import type { AnswerAction } from './AiChatMessageList';
import { AiChatInput } from './AiChatInput';
import { AiPromptChips } from './AiPromptChips';
import { AiQuickActions } from './AiQuickActions';
import { AiUsageBadge } from './AiUsageBadge';
import { AiPaywallCard } from './AiPaywallCard';
import { AiSafetyNotice } from './AiSafetyNotice';
import { AiChatLeadForm } from './AiChatLeadForm';
import { AiBusinessUpsell } from './AiBusinessUpsell';
import { AiToolTabs } from './AiToolTabs';
import { RoleSelector } from './RoleSelector';
import { PromptTemplateGrid } from './PromptTemplateGrid';
import { CreditBalance } from './CreditBalance';
import { ImagePromptTool } from './ImagePromptTool';
import { BusinessDemoLead } from './BusinessDemoLead';
import { applyRole, type RoleId } from '../roles';
import type { AiToolId, PromptTemplate } from '../templates';

const MAX_INPUT = 3000;
const B2B_AFTER = 3; // show B2B card after this many assistant answers

export function AiChatConsole({ config }: { config: MountConfig }) {
  const t = strings(config.locale);
  const pricingHref = '/ru/tarify-ai-chat/';
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(config.locale));
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(() => loadSessionId(config.locale));
  const [remaining, setRemaining] = useState<number>(() => loadRemaining(config.locale));
  const [busy, setBusy] = useState(false);
  const [limitReached, setLimitReached] = useState(() => loadRemaining(config.locale) === 0);
  const [plan, setPlan] = useState<string>('anonymous_free');
  const [b2bDismissed, setB2bDismissed] = useState(false);
  const [activeTool, setActiveTool] = useState<AiToolId>('chat');
  const [role, setRole] = useState<RoleId>('general');
  const startedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const focusInput = () => { inputRef.current?.focus(); };

  useEffect(() => {
    trackOnce(EV.pageView, { locale: config.locale });
    trackOnce(EV.visitChat, { locale: config.locale });
  }, [config.locale]);

  const assistantCount = useMemo(() => messages.filter((m) => m.role === 'assistant' && !m.pending && !m.error).length, [messages]);
  const empty = messages.length === 0;

  const ensureSession = async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    const id = await createSession(config.apiBase, config.locale);
    if (id) {
      setSessionId(id);
      saveSessionId(id, config.locale);
      track(EV.sessionStarted, { status: 'created' });
    }
    return id;
  };

  const persist = (next: ChatMessage[]) => { setMessages(next); saveHistory(next, config.locale); };

  const doSend = async (text: string, meta: { templateId?: string; tool?: AiToolId; answerAction?: AnswerAction } = {}) => {
    const trimmed = text.trim();
    if (!trimmed || busy || limitReached) return;
    setBusy(true);
    setInput('');
    if (!startedRef.current) {
      startedRef.current = true;
      track(EV.startChat, { locale: config.locale, tool: meta.tool || activeTool, roleId: role });
    }
    const sid = await ensureSession();
    const history = messages.filter((m) => !m.pending && !m.error);
    const withUser: ChatMessage[] = [...history, { role: 'user', content: trimmed }, { role: 'assistant', content: '', pending: true }];
    setMessages(withUser);
    track(EV.messageSent, { source: meta.templateId ? 'template' : meta.answerAction ? 'answer_action' : 'composer' });

    const requestMessage = applyRole(trimmed, role, config.locale).slice(0, MAX_INPUT);
    track(EV.sendPrompt, { source: meta.templateId ? 'template' : meta.answerAction ? 'answer_action' : 'composer', tool: meta.tool || activeTool, roleId: role, templateId: meta.templateId || undefined });
    const res = await sendChat(config.apiBase, { sessionId: sid, message: requestMessage, locale: config.locale, history });
    const base = withUser.filter((m) => !m.pending);
    if (res.plan) setPlan(res.plan);
    if (res.ok && res.answer) {
      if (typeof res.remaining === 'number' && res.remaining >= 0) { setRemaining(res.remaining); saveRemaining(res.remaining, config.locale); }
      if (res.sessionId && res.sessionId !== sid) { setSessionId(res.sessionId); saveSessionId(res.sessionId, config.locale); }
      persist([...base, { role: 'assistant', content: res.answer, model: res.modelUsed ?? null }]);
      track(EV.answerReceived, { model: res.modelUsed });
    } else if (res.code === 'limit_reached') {
      setLimitReached(true); setRemaining(0); saveRemaining(0, config.locale); setMessages(base); track(EV.limitReached, { reason: res.reason, status: 'blocked' }); track(EV.limitReachedProduct, { reason: res.reason, status: 'blocked' });
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
    track(EV.useTemplate, { templateId: 'legacy_chip', tool: 'chat', mode: 'send' });
    void doSend(prompt, { tool: 'chat' });
  };

  // Quick-action cards carry [placeholder] templates the user must fill →
  // always prefill the composer and focus, never auto-send.
  const onQuickPick = (prompt: string) => {
    if (busy || limitReached) return;
    setInput(prompt);
    track(EV.useTemplate, { templateId: 'quick_action', tool: 'chat', mode: 'prefill' });
    focusInput();
  };

  const onTemplatePick = (template: PromptTemplate, prompt: string) => {
    if (busy || limitReached) return;
    track(EV.useTemplate, { templateId: template.id, tool: template.tool, mode: 'send' });
    void doSend(prompt, { templateId: template.id, tool: template.tool });
  };

  const onRoleChange = (nextRole: RoleId) => {
    setRole(nextRole);
    track(EV.selectRole, { roleId: nextRole, tool: activeTool });
  };

  const onToolChange = (tool: AiToolId) => {
    setActiveTool(tool);
    if (tool === 'business') track(EV.businessDemoStarted, { from: 'tool_tab', status: 'opened' });
  };

  const onImagePrompt = (prompt: string, presetId: string) => {
    track(EV.generateImagePrompt, { presetId, tool: 'images', status: 'submitted' });
    void doSend(prompt, { templateId: `image-${presetId}`, tool: 'images' });
  };

  const onAnswerAction = (action: AnswerAction, content: string) => {
    const source = content.slice(0, 1900);
    const instructions: Record<AnswerAction, string> = config.locale === 'uz'
      ? {
          shorter: 'Quyidagi javobni qisqartir, asosiy ma’noni saqla:',
          instagram: 'Quyidagi javobni Instagram posti uchun moslashtir. Sarlavha va yumshoq CTA qo‘sh:',
          uzbek: 'Quyidagi matnni tabiiy Uzbek Latin formatiga tarjima qil. Yangi fakt qo‘shma:',
          bot: 'Quyidagi g‘oya asosida Telegram-bot ssenariysini tuz: kirish, savollar, ariza va menejerga uzatish:',
        }
      : {
          shorter: 'Сделай следующий ответ короче, сохранив основную пользу:',
          instagram: 'Адаптируй следующий ответ для Instagram: добавь заголовок и мягкий CTA, не придумывай факты:',
          uzbek: 'Переведи следующий текст на естественный Uzbek Latin. Не добавляй новые факты:',
          bot: 'На основе следующей идеи составь сценарий Telegram-бота: вход, вопросы, заявка и передача менеджеру:',
        };
    void doSend(`${instructions[action]}\n\n${source}`, { answerAction: action, tool: activeTool });
  };

  const onRetry = () => {
    if (busy || limitReached) return;
    let lastUser = '';
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { lastUser = messages[i].content; break; } }
    if (lastUser) void doSend(lastUser);
  };

  const onClearChat = () => {
    setMessages([]);
    saveHistory([], config.locale);
    setSessionId(null);
    clearSessionId(config.locale);
    setLimitReached(false);
    startedRef.current = false;
    track(EV.startChat, { locale: config.locale, action: 'clear_chat' });
    focusInput();
  };

  const showB2B = assistantCount >= B2B_AFTER && !b2bDismissed && !limitReached;
  const otherHref = config.locale === 'uz' ? '/ru/gpt-chat/' : '/uz/gpt-uzbek-tilida/';
  const toolCopy: Record<Exclude<AiToolId, 'chat' | 'images'>, { title: string; body: string }> = config.locale === 'uz'
    ? {
        smm: { title: 'AI SMM kabinet', body: 'Instagram va Telegram uchun post, stories, reklama va kontent reja.' },
        business: { title: 'AI biznes vositalari', body: 'Mijoz javobi, FAQ, sotuv skripti va AI-bot pilot rejasi.' },
        study: { title: 'AI bilan o‘qish', body: 'Mavzuni tushunish, konspekt, test, tarjima va matn tekshirish.' },
      }
    : {
        smm: { title: 'AI SMM кабинет', body: 'Посты, сторис, реклама и контент-планы для Instagram и Telegram.' },
        business: { title: 'AI для бизнеса', body: 'Ответы клиентам, FAQ, продажи и пилотный план AI-бота.' },
        study: { title: 'AI для учёбы', body: 'Разобраться в теме, сделать конспект, тест, перевод или проверить текст.' },
      };

  const toolkit = activeTool === 'chat' ? (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-3">{t.emptyPrompt}</p>
      <div className="mb-5"><AiQuickActions actions={t.quickActions} onPick={onQuickPick} disabled={busy || limitReached} /></div>
      <AiPromptChips categories={t.categories} onPick={onPick} disabled={busy || limitReached} />
    </>
  ) : activeTool === 'images' ? (
    <ImagePromptTool locale={config.locale} onGenerate={onImagePrompt} disabled={busy || limitReached} />
  ) : (
    <div>
      <h3 className="text-xl font-semibold text-white">{toolCopy[activeTool].title}</h3>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-white/50">{toolCopy[activeTool].body}</p>
      <PromptTemplateGrid key={`${config.locale}-${activeTool}`} locale={config.locale} tool={activeTool} onPick={onTemplatePick} disabled={busy || limitReached} />
      {activeTool === 'business' && <BusinessDemoLead locale={config.locale} apiBase={config.apiBase} sessionId={sessionId} />}
    </div>
  );

  return (
    <div className="glass-strong rounded-[24px] sm:rounded-[32px] overflow-hidden" style={{ boxShadow: '0 40px 100px -30px rgba(0,0,0,0.6), 0 0 80px -20px rgba(34,158,217,0.15), 0 0 0 1px rgba(47,230,209,0.06) inset' }} data-testid="ai-console">
      {/* ── Top bar: brand + online | lang + plan + credits + upgrade ── */}
      <div className="flex items-center gap-2 px-4 sm:px-6 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5 mr-auto">
          <span className="grid place-items-center w-8 h-8 rounded-xl text-[#04101A] bg-grad-cta font-bold text-sm" aria-hidden="true">G</span>
          <span className="font-semibold text-white text-[15px] hidden sm:inline">{t.brand}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-300/80 ml-0.5">
            <span className="status-dot" aria-hidden="true" />{t.online}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClearChat} disabled={busy || messages.length === 0} aria-label={config.locale === 'uz' ? 'Chatni tozalash' : 'Очистить чат'} title={config.locale === 'uz' ? 'Chatni tozalash' : 'Очистить чат'} className="min-h-11 w-11 inline-flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
          <div className="flex items-center rounded-xl bg-white/[0.04] overflow-hidden text-[11px]" role="group" aria-label={config.locale === 'uz' ? 'Til' : 'Язык'}>
            <span className={`min-h-11 min-w-11 grid place-items-center ${config.locale === 'ru' ? 'bg-white/10 text-white' : 'text-white/45'}`}>RU</span>
            <a href={otherHref} className={`min-h-11 min-w-11 grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan ${config.locale === 'uz' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/80'}`}>UZ</a>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-full border border-brand-violet/25 bg-brand-violet/[0.06] text-brand-violet/80 whitespace-nowrap hidden sm:inline" title={config.locale === 'uz' ? 'Mehmon rejimi' : 'Гостевой режим'}>{t.planBadge(plan)}</span>
          <AiUsageBadge remaining={remaining} t={t} />
          <a href={pricingHref} onClick={() => { track(EV.upgradeClick, { from: 'topbar', status: 'pricing' }); track(EV.viewPricing, { from: 'topbar' }); }} className="min-h-11 inline-flex items-center gap-1 text-[11px] font-semibold px-3.5 py-2 rounded-xl bg-brand-cyan/[0.08] text-brand-cyan hover:bg-brand-cyan/[0.14] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">↑ Plus</a>
        </div>
      </div>

      <AiToolTabs locale={config.locale} active={activeTool} onChange={onToolChange} />

      {/* ── Viewport ── */}
      <div className="neural-grid px-4 sm:px-6 py-6 min-h-[460px] sm:min-h-[480px] max-h-[60vh] overflow-y-auto">
        {empty ? (
          <div id={`ai-tool-${activeTool}`} role="tabpanel" aria-labelledby={`ai-tool-tab-${activeTool}`} className="relative z-[1] py-4">
            <h2 className="h-display text-2xl sm:text-[32px] text-white mb-3 max-w-xl leading-tight"><span className="text-grad">{t.emptyTitle}</span></h2>
            <p className="text-white/50 text-[15px] mb-5 max-w-lg leading-relaxed">{t.emptyHint}</p>
            <button type="button" onClick={focusInput} className="btn-primary text-[14px] mb-8">{t.tryFree}</button>
            {toolkit}
          </div>
        ) : (
          <div id={`ai-tool-${activeTool}`} role="tabpanel" aria-labelledby={`ai-tool-tab-${activeTool}`} className="space-y-6">
            {activeTool !== 'chat' && <div className="rounded-2xl bg-white/[0.025] p-4 sm:p-5">{toolkit}</div>}
            <AiChatMessageList messages={messages} t={t} busy={busy} onRetry={onRetry} onAnswerAction={onAnswerAction} />
          </div>
        )}
      </div>

      {/* ── Role selector + credits (compact, inline above composer) ── */}
      <div className="flex items-start gap-3 px-4 sm:px-6 py-3.5 border-t border-white/[0.06]">
        <RoleSelector locale={config.locale} value={role} onChange={onRoleChange} disabled={busy} />
        <CreditBalance locale={config.locale} remaining={remaining} limitReached={limitReached} onUpgrade={() => { track(EV.upgradeClick, { from: 'credit_balance', status: 'pricing' }); track(EV.viewPricing, { from: 'credit_balance' }); window.location.href = pricingHref; }} />
      </div>

      {/* ── Composer + inline cards ── */}
      <div className="px-4 sm:px-6 pb-6 pt-1">
        {limitReached ? (
          <AiPaywallCard t={t} apiBase={config.apiBase} sessionId={sessionId} pricingHref={pricingHref} />
        ) : (
          <>
            {showB2B && <div className="mb-3"><AiBusinessUpsell t={t} onDismiss={() => setB2bDismissed(true)} /></div>}
            {remaining >= 0 && remaining <= 2 && (
              <div className="mb-3 flex items-center gap-2 text-[12px] text-amber-200/80 rounded-2xl bg-amber-300/[0.05] px-4 py-3" role="status">
                <span aria-hidden="true">⚡</span>
                <span>{t.lowWarning(remaining)}</span>
                <a href={pricingHref} onClick={() => { track(EV.viewPricing, { from: 'low_limit' }); track(EV.upgradeClick, { from: 'low_limit' }); }} className="ml-auto min-h-12 inline-flex items-center text-brand-cyan hover:underline whitespace-nowrap">{t.paywallCta}</a>
              </div>
            )}
            <AiChatInput value={input} onChange={setInput} onSend={() => doSend(input)} disabled={busy} busy={busy} maxChars={MAX_INPUT} t={t} inputRef={inputRef} />
          </>
        )}
        <div className="mt-4"><AiSafetyNotice t={t} /></div>
        <p className="mt-2 text-[11px] text-white/30 leading-relaxed text-center">{t.disclaimer}</p>
      </div>

      {/* Lead form lives below the console — B2B capture without crowding chat. */}
      <div className="px-4 sm:px-6 pb-6">
        {activeTool !== 'business' && <AiChatLeadForm t={t} apiBase={config.apiBase} sessionId={sessionId} />}
      </div>
    </div>
  );
}
