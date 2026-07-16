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
import { AiSidebar } from './AiSidebar';
import { PromptTemplateGrid } from './PromptTemplateGrid';
import { ImagePromptTool } from './ImagePromptTool';
import { applyRole, type RoleId } from '../roles';
import type { AiToolId, PromptTemplate } from '../templates';
import type { PromptChip } from '../i18n';

const MAX_INPUT = 3000;
const B2B_AFTER = 3; // show the B2B line after this many assistant answers

export function AiChatConsole({ config }: { config: MountConfig }) {
  const t = strings(config.locale);
  const uz = config.locale === 'uz';
  const pricingHref = uz ? '/uz/chat-bot-narxi/' : '/ru/tarify-ai-chat/';
  const businessHref = uz ? '/uz/biznes-uchun-ai-bot/' : '/ru/gpt-dlya-biznesa/';
  const otherHref = uz ? '/ru/gpt-chat/' : '/uz/gpt-uzbek-tilida/';
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(config.locale));
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(() => loadSessionId(config.locale));
  const [remaining, setRemaining] = useState<number>(() => loadRemaining(config.locale));
  const [busy, setBusy] = useState(false);
  const [limitReached, setLimitReached] = useState(() => loadRemaining(config.locale) === 0);
  const [b2bDismissed, setB2bDismissed] = useState(false);
  const [activeTool, setActiveTool] = useState<AiToolId>('chat');
  const [role, setRole] = useState<RoleId>('general');
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
    // Keep the composer ready for the next message (spec: composer stays focused).
    focusInput();
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
    if (tool === 'business') track(EV.businessDemoStarted, { from: 'sidebar', status: 'opened' });
  };

  const onImagePrompt = (prompt: string, presetId: string) => {
    track(EV.generateImagePrompt, { presetId, tool: 'images', status: 'submitted' });
    void doSend(prompt, { templateId: `image-${presetId}`, tool: 'images' });
  };

  const onAnswerAction = (action: AnswerAction, content: string) => {
    const source = content.slice(0, 1900);
    const instructions: Record<AnswerAction, string> = uz
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
  const toolCopy: Record<Exclude<AiToolId, 'chat' | 'images'>, { title: string; body: string }> = uz
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

  const toolPanel = activeTool === 'images' ? (
    <div className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
      <ImagePromptTool locale={config.locale} onGenerate={onImagePrompt} disabled={busy || limitReached} />
    </div>
  ) : activeTool !== 'chat' ? (
    <div className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-white">{toolCopy[activeTool].title}</h2>
      <p className="mb-4 mt-1 text-sm leading-relaxed text-white/50">{toolCopy[activeTool].body}</p>
      <PromptTemplateGrid key={`${config.locale}-${activeTool}`} locale={config.locale} tool={activeTool} onPick={onTemplatePick} disabled={busy || limitReached} />
      {activeTool === 'business' && (
        <p className="mt-4 text-[13px] text-white/45">
          <a href={businessHref} onClick={() => track(EV.businessClicked, { from: 'business_tab' })} className="text-brand-cyan hover:underline underline-offset-4">{t.businessLink}</a>
        </p>
      )}
    </div>
  ) : null;

  return (
    <div className="flex h-full min-h-0 bg-bg-base text-white" data-testid="ai-console">
      <AiSidebar
        locale={config.locale}
        t={t}
        activeTool={activeTool}
        onToolChange={onToolChange}
        onNewChat={onNewChat}
        role={role}
        onRoleChange={onRoleChange}
        busy={busy}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={drawerOpen}
        onCloseMobile={() => setDrawerOpen(false)}
      />

      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* App header */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 sm:px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t.menuOpen}
            className="grid h-11 w-11 place-items-center rounded-xl text-white/60 hover:text-white hover:bg-white/[0.05] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan lg:hidden"
            data-testid="ai-menu-button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="font-display text-[15px] text-white lg:hidden">{t.brand}</span>
          <div className="ml-auto flex items-center gap-2">
            <AiUsageBadge remaining={remaining} t={t} />
            <div className="flex items-center overflow-hidden rounded-xl bg-white/[0.04] text-[11px]" role="group" aria-label={uz ? 'Til' : 'Язык'}>
              <span className={`grid min-h-11 min-w-11 place-items-center ${!uz ? 'bg-white/10 text-white' : 'text-white/45'}`}>RU</span>
              <a href={otherHref} className={`grid min-h-11 min-w-11 place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan ${uz ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/80'}`}>UZ</a>
            </div>
            <a
              href={pricingHref}
              onClick={() => { track(EV.upgradeClick, { from: 'topbar', status: 'pricing' }); track(EV.viewPricing, { from: 'topbar' }); track(EV.pricingClicked, { from: 'topbar' }); }}
              className="hidden sm:inline-flex min-h-11 items-center rounded-xl bg-brand-cyan/[0.08] px-3.5 py-2 text-[11px] font-semibold text-brand-cyan hover:bg-brand-cyan/[0.14] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              {t.pricingLink}
            </a>
          </div>
        </header>

        {/* Messages area */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-6">
            {toolPanel}
            {empty && activeTool === 'chat' ? (
              <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
                <h2 className="h-display mb-2 text-[22px] leading-tight text-white sm:text-[26px]">{t.emptyTitle}</h2>
                <p className="mb-6 max-w-sm text-[15px] leading-relaxed text-white/50">{t.emptyHint}</p>
                <div className="w-full max-w-md">
                  <AiPromptChips chips={t.chips} onPick={onChipPick} disabled={busy || limitReached} label={t.emptyPrompt} />
                </div>
              </div>
            ) : (
              <AiChatMessageList messages={messages} t={t} busy={busy} onRetry={onRetry} onAnswerAction={onAnswerAction} />
            )}
            {showB2B && (
              <p className="mt-6 flex items-center justify-center gap-2 text-center text-[13px] text-white/40" data-testid="ai-b2b-line">
                <a
                  href="https://t.me/XGame_changerx"
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  onClick={() => { track(EV.b2bCtaClicked, { from: 'chat_line' }); track(EV.telegramClicked, { from: 'chat_line' }); track(EV.telegramClick, { from: 'chat_line' }); }}
                  className="hover:text-brand-cyan underline underline-offset-4"
                >
                  {t.b2bLine}
                </a>
                <button type="button" onClick={() => setB2bDismissed(true)} aria-label="✕" title="✕" className="grid h-8 w-8 place-items-center rounded-lg text-white/30 hover:text-white hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">✕</button>
              </p>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0">
          <div className="mx-auto w-full max-w-[760px] px-4 pb-2 sm:px-6">
            {limitReached ? (
              <div className="py-3"><AiPaywallCard t={t} apiBase={config.apiBase} sessionId={sessionId} pricingHref={pricingHref} /></div>
            ) : (
              <>
                {remaining >= 0 && remaining <= 2 && (
                  <div className="mb-2 flex items-center gap-2 rounded-2xl bg-amber-300/[0.05] px-4 py-2.5 text-[12px] text-amber-200/80" role="status">
                    <span aria-hidden="true">⚡</span>
                    <span>{t.lowWarning(remaining)}</span>
                    <a href={pricingHref} onClick={() => { track(EV.viewPricing, { from: 'low_limit' }); track(EV.upgradeClick, { from: 'low_limit' }); track(EV.pricingClicked, { from: 'low_limit' }); }} className="ml-auto inline-flex min-h-11 items-center whitespace-nowrap text-brand-cyan hover:underline">{t.paywallCta}</a>
                  </div>
                )}
                <AiChatInput value={input} onChange={setInput} onSend={() => doSend(input)} disabled={busy} busy={busy} maxChars={MAX_INPUT} t={t} inputRef={inputRef} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
