import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, MountConfig } from '../types';
import { strings } from '../i18n';
import { createSession, sendChat } from '../api';
import { loadHistory, saveHistory, loadSessionId, saveSessionId, clearHistory } from '../storage';
import { track, EV } from '../analytics';
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
  const [remaining, setRemaining] = useState<number>(-1);
  const [busy, setBusy] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [plan, setPlan] = useState<string>('anonymous_free');
  const [b2bDismissed, setB2bDismissed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTool, setActiveTool] = useState<AiToolId>('chat');
  const [role, setRole] = useState<RoleId>('general');
  const startedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const focusInput = () => { inputRef.current?.focus(); };

  useEffect(() => {
    track(EV.pageView, { locale: config.locale });
    track(EV.visitChat, { locale: config.locale });
  }, [config.locale]);

  const assistantCount = useMemo(() => messages.filter((m) => m.role === 'assistant' && !m.pending && !m.error).length, [messages]);
  const empty = messages.length === 0;

  const ensureSession = async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    const id = await createSession(config.apiBase, config.locale);
    if (id) {
      setSessionId(id);
      saveSessionId(id, config.locale);
      track(EV.sessionStarted, {});
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
      track(EV.startChat, { locale: config.locale });
    }
    const sid = await ensureSession();
    const history = messages.filter((m) => !m.pending && !m.error);
    const withUser: ChatMessage[] = [...history, { role: 'user', content: trimmed }, { role: 'assistant', content: '', pending: true }];
    setMessages(withUser);
    track(EV.messageSent, {});

    const requestMessage = applyRole(trimmed, role, config.locale).slice(0, MAX_INPUT);
    track(EV.sendPrompt, { source: meta.templateId ? 'template' : meta.answerAction ? 'answer_action' : 'composer', tool: meta.tool || activeTool, role });
    const res = await sendChat(config.apiBase, { sessionId: sid, message: requestMessage, locale: config.locale, history });
    const base = withUser.filter((m) => !m.pending);
    if (res.plan) setPlan(res.plan);
    if (res.ok && res.answer) {
      if (typeof res.remaining === 'number') setRemaining(res.remaining);
      if (res.sessionId && res.sessionId !== sid) { setSessionId(res.sessionId); saveSessionId(res.sessionId, config.locale); }
      persist([...base, { role: 'assistant', content: res.answer, model: res.modelUsed ?? null }]);
      track(EV.answerReceived, { model: res.modelUsed });
    } else if (res.code === 'limit_reached') {
      setLimitReached(true); setRemaining(0); setMessages(base); track(EV.limitReached, { reason: res.reason }); track(EV.limitReachedProduct, { reason: res.reason });
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
    track(EV.useTemplate, { template: 'legacy_chip', tool: 'chat' });
    void doSend(prompt, { tool: 'chat' });
  };

  // Quick-action cards carry [placeholder] templates the user must fill →
  // always prefill the composer and focus, never auto-send.
  const onQuickPick = (prompt: string) => {
    if (busy || limitReached) return;
    setInput(prompt);
    track(EV.useTemplate, { template: 'quick_action', tool: 'chat', mode: 'prefill' });
    focusInput();
  };

  const onTemplatePick = (template: PromptTemplate, prompt: string) => {
    if (busy || limitReached) return;
    track(EV.useTemplate, { template: template.id, tool: template.tool, mode: 'send' });
    void doSend(prompt, { templateId: template.id, tool: template.tool });
  };

  const onRoleChange = (nextRole: RoleId) => {
    setRole(nextRole);
    track(EV.selectRole, { role: nextRole });
  };

  const onToolChange = (tool: AiToolId) => {
    setActiveTool(tool);
    if (tool === 'business') track(EV.businessDemoStarted, { from: 'tool_tab' });
  };

  const onImagePrompt = (prompt: string, presetId: string) => {
    track(EV.generateImagePrompt, { preset: presetId });
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

  const onNewChat = () => { clearHistory(config.locale); setMessages([]); setLimitReached(false); setB2bDismissed(false); };

  const onRetry = () => {
    if (busy || limitReached) return;
    let lastUser = '';
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { lastUser = messages[i].content; break; } }
    if (lastUser) void doSend(lastUser);
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
      <PromptTemplateGrid locale={config.locale} tool={activeTool} onPick={onTemplatePick} disabled={busy || limitReached} />
      {activeTool === 'business' && <BusinessDemoLead locale={config.locale} apiBase={config.apiBase} sessionId={sessionId} />}
    </div>
  );

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
          <div className="flex items-center rounded-xl border border-white/10 overflow-hidden text-[11px]" role="group" aria-label={config.locale === 'uz' ? 'Til' : 'Язык'}>
            <span className={`min-h-11 min-w-11 grid place-items-center ${config.locale === 'ru' ? 'bg-white/10 text-white' : 'text-white/50'}`}>RU</span>
            <a href={otherHref} className={`min-h-11 min-w-11 grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan ${config.locale === 'uz' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}>UZ</a>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-full border border-brand-violet/40 text-brand-violet/90 whitespace-nowrap">{t.planBadge(plan)}</span>
          <AiUsageBadge remaining={remaining} t={t} />
        </div>
        {/* Row 3 group: actions */}
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setShowHistory((v) => !v)} aria-label={t.history} className="min-h-11 text-[11px] px-3 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-brand-cyan/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan transition-colors whitespace-nowrap">
            {t.history}
          </button>
          {!empty && (
            <button type="button" onClick={onNewChat} aria-label={t.newChat} className="min-h-11 text-[11px] px-3 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-brand-cyan/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan transition-colors whitespace-nowrap">
              {t.newChat}
            </button>
          )}
        </div>
      </div>

      <AiToolTabs locale={config.locale} active={activeTool} onChange={onToolChange} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 sm:px-6 py-4 border-b border-white/8 bg-white/[0.015]">
        <RoleSelector locale={config.locale} value={role} onChange={onRoleChange} disabled={busy} />
        <CreditBalance locale={config.locale} remaining={remaining} onUpgrade={() => { track(EV.upgradeClick, { from: 'credit_balance' }); track(EV.viewPricing, { from: 'credit_balance' }); window.location.href = pricingHref; }} />
      </div>

      {showHistory && (
        <div className="px-4 sm:px-5 py-3 border-b border-white/8 bg-white/[0.02] text-sm text-white/55" role="region" aria-label={t.history}>
          {t.loginToSave}
        </div>
      )}

      {/* ── Viewport ── */}
      <div className="neural-grid px-4 sm:px-6 py-5 min-h-[380px] max-h-[58vh] overflow-y-auto">
        {empty ? (
          <div id={`ai-tool-${activeTool}`} role="tabpanel" className="relative z-[1] py-4">
            <h2 className="h-display text-2xl sm:text-[28px] text-white mb-2 max-w-xl"><span className="text-grad">{t.emptyTitle}</span></h2>
            <p className="text-white/55 text-sm mb-4 max-w-lg leading-relaxed">{t.emptyHint}</p>
            <button type="button" onClick={focusInput} className="btn-primary text-[14px] mb-6">{t.tryFree}</button>
            {toolkit}
          </div>
        ) : (
          <div id={`ai-tool-${activeTool}`} role="tabpanel" className="space-y-5">
            {activeTool !== 'chat' && <div className="rounded-2xl border border-white/8 bg-black/10 p-3 sm:p-4">{toolkit}</div>}
            <AiChatMessageList messages={messages} t={t} onRetry={onRetry} onAnswerAction={onAnswerAction} />
          </div>
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
                <a href={pricingHref} onClick={() => { track(EV.viewPricing, { from: 'low_limit' }); track(EV.upgradeClick, { from: 'low_limit' }); }} className="ml-auto min-h-11 inline-flex items-center text-brand-cyan hover:underline whitespace-nowrap">{t.paywallCta}</a>
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
        {activeTool !== 'business' && <AiChatLeadForm t={t} apiBase={config.apiBase} sessionId={sessionId} />}
      </div>
    </div>
  );
}
