import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, MountConfig } from '../types';
import { strings } from '../i18n';
import { createSession, sendChat } from '../api';
import { loadHistory, saveHistory, loadSessionId, saveSessionId, loadRemaining, saveRemaining } from '../storage';
import { track, trackOnce, EV } from '../analytics';
import { AiChatMessageList } from './AiChatMessageList';
import type { AnswerAction } from './AiChatMessageList';
import { AiChatInput } from './AiChatInput';
import { AiPromptChips } from './AiPromptChips';
import { AiUsageBadge } from './AiUsageBadge';
import { AiPaywallCard } from './AiPaywallCard';
import { AiBusinessUpsell } from './AiBusinessUpsell';
import { AiToolTabs } from './AiToolTabs';
import { RoleSelector } from './RoleSelector';
import { PromptTemplateGrid } from './PromptTemplateGrid';
import { CreditBalance } from './CreditBalance';
import { ImagePromptTool } from './ImagePromptTool';
import { BusinessDemoLead } from './BusinessDemoLead';
import { applyRole, type RoleId } from '../roles';
import type { AiToolId, PromptTemplate } from '../templates';
import type { PromptChip } from '../i18n';

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
    trackOnce(EV.chatOpened, { locale: config.locale, anonymous: true });
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
    const messageNumber = history.filter((m) => m.role === 'user').length + 1;
    track(EV.messageSentN, { messageNumber, locale: config.locale, anonymous: true });

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
      track(EV.aiResponseSuccess, { model: res.modelUsed, messageNumber });
    } else if (res.code === 'limit_reached') {
      setLimitReached(true); setRemaining(0); saveRemaining(0, config.locale); setMessages(base); track(EV.limitReached, { reason: res.reason, status: 'blocked' }); track(EV.limitReachedProduct, { reason: res.reason, status: 'blocked' });
      track(EV.aiResponseError, { code: 'limit_reached', messageNumber });
    } else {
      // Curated copy only — never surface raw backend/provider strings.
      const friendly = res.code === 'network' ? t.errorNetwork : t.errorGeneric;
      persist([...base, { role: 'assistant', content: friendly, error: true }]);
      track(EV.providerError, { code: res.code });
      track(EV.aiResponseError, { code: res.code, messageNumber });
    }
    setBusy(false);
  };

  // Prompt chips always prefill the composer and focus — never auto-send.
  const onChipPick = (chip: PromptChip) => {
    if (busy || limitReached) return;
    setInput(chip.insert);
    track(EV.promptChipClicked, { chipId: chip.id, locale: config.locale });
    track(EV.useTemplate, { templateId: `chip_${chip.id}`, tool: 'chat', mode: 'prefill' });
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

  // "New chat": clears the visible conversation + stored history, but keeps
  // the server session and remaining quota — limits must survive a reset.
  const onNewChat = () => {
    if (busy) return;
    persist([]);
    setInput('');
    setB2bDismissed(false);
    startedRef.current = false;
    track(EV.newChat, { status: 'cleared' });
    focusInput();
  };

  const onRetry = () => {
    if (busy || limitReached) return;
    let lastUser = '';
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { lastUser = messages[i].content; break; } }
    if (lastUser) {
      track(EV.responseRegenerated, { locale: config.locale });
      void doSend(lastUser);
    }
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
    <AiPromptChips chips={t.chips} onPick={onChipPick} disabled={busy || limitReached} label={t.emptyPrompt} />
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
          <div className="flex items-center rounded-xl bg-white/[0.04] overflow-hidden text-[11px]" role="group" aria-label={config.locale === 'uz' ? 'Til' : 'Язык'}>
            <span className={`min-h-11 min-w-11 grid place-items-center ${config.locale === 'ru' ? 'bg-white/10 text-white' : 'text-white/45'}`}>RU</span>
            <a href={otherHref} className={`min-h-11 min-w-11 grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan ${config.locale === 'uz' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/80'}`}>UZ</a>
          </div>
          {!empty && (
            <button type="button" onClick={onNewChat} disabled={busy} title={t.newChat} className="min-h-11 inline-flex items-center gap-1 text-[11px] px-3 py-2 rounded-xl bg-white/[0.04] text-white/55 hover:text-white hover:bg-white/[0.08] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-50" data-testid="ai-new-chat">
              <span aria-hidden="true">+</span> {t.newChat}
            </button>
          )}
          <span className="text-[11px] px-2.5 py-1 rounded-full border border-brand-violet/25 bg-brand-violet/[0.06] text-brand-violet/80 whitespace-nowrap hidden sm:inline" title={config.locale === 'uz' ? 'Mehmon rejimi' : 'Гостевой режим'}>{t.planBadge(plan)}</span>
          <AiUsageBadge remaining={remaining} t={t} />
          <a href={pricingHref} onClick={() => { track(EV.upgradeClick, { from: 'topbar', status: 'pricing' }); track(EV.viewPricing, { from: 'topbar' }); track(EV.pricingClicked, { from: 'topbar' }); }} className="min-h-11 inline-flex items-center gap-1 text-[11px] font-semibold px-3.5 py-2 rounded-xl bg-brand-cyan/[0.08] text-brand-cyan hover:bg-brand-cyan/[0.14] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">{t.pricingLink}</a>
        </div>
      </div>

      <AiToolTabs locale={config.locale} active={activeTool} onChange={onToolChange} />

      {/* ── Viewport ── */}
      <div className="neural-grid px-4 sm:px-6 py-6 min-h-[420px] sm:min-h-[480px] max-h-[60vh] overflow-y-auto" style={{ maxHeight: '62dvh' }}>
        {empty ? (
          <div id={`ai-tool-${activeTool}`} role="tabpanel" aria-labelledby={`ai-tool-tab-${activeTool}`} className="relative z-[1] py-4">
            <h2 className="h-display text-[22px] sm:text-[26px] text-white mb-2 max-w-xl leading-tight">{t.emptyTitle}</h2>
            <p className="text-white/50 text-[15px] mb-6 max-w-lg leading-relaxed">{t.emptyHint}</p>
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
      </div>
    </div>
  );
}
