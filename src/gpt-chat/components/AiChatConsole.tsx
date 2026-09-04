import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, MountConfig } from '../types';
import { strings } from '../i18n';
import { createSession, fetchTurnstileConfig, sendChatStream } from '../api';
import type { ChatApiResponse } from '../types';
import {
  loadHistory, saveHistory, loadSessionId, saveSessionId, loadRemaining, saveRemaining,
  loadOfferDismissed, saveOfferDismissed,
} from '../storage';
import { track, trackOnce, EV } from '../analytics';
import { AiChatMessageList } from './AiChatMessageList';
import type { AnswerAction } from './AiChatMessageList';
import { AiChatInput } from './AiChatInput';
import { AiPromptChips } from './AiPromptChips';
import { AiUsageBadge } from './AiUsageBadge';
import { AiQuotaThread } from './AiQuotaThread';
import { AiOfferCard } from './AiOfferCard';
import { AiSidebar } from './AiSidebar';
import { PromptTemplateGrid } from './PromptTemplateGrid';
import { ImagePromptTool } from './ImagePromptTool';
import { TurnstileChallenge, type TurnstileChallengeHandle } from './TurnstileChallenge';
import { applyRole, type RoleId } from '../roles';
import type { AiToolId, PromptTemplate } from '../templates';
import type { PromptChip } from '../i18n';

const MAX_INPUT = 3000;
// Segments in the quota thread. Mirrors GPT_FREE_DAILY_LIMIT in wrangler.toml
// (the server reports what is left, never the size of the allowance). The
// thread hides itself rather than lying if the two drift apart.
const FREE_DAILY_SEGMENTS = 15;

const B2B_AFTER = 3; // show the commercial offer after this many assistant answers

/**
 * Which cap was hit. 'hourly' is a pause of at most an hour with the day's
 * allowance still unspent; 'daily' is over until tomorrow. The two must not be
 * confused: treating an hourly pause as a daily one locks a willing visitor
 * out for the rest of the day.
 */
type LimitReason = 'hourly' | 'daily';

export function AiChatConsole({ config }: { config: MountConfig }) {
  const t = strings(config.locale);
  const uz = config.locale === 'uz';
  const pricingHref = uz ? '/uz/chat-bot-narxi/' : '/ru/tarify-ai-chat/';
  const businessHref = uz ? '/uz/biznes-uchun-ai-bot/' : '/ru/gpt-dlya-biznesa/';
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(config.locale));
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(() => loadSessionId(config.locale));
  const [remaining, setRemaining] = useState<number>(() => loadRemaining(config.locale));
  const [busy, setBusy] = useState(false);
  const [limitReached, setLimitReached] = useState(() => loadRemaining(config.locale) === 0);
  // Only a daily cap is remembered across a reload: an hourly one is never
  // persisted, so a returning visitor is not walled for a limit that expired.
  const [limitReason, setLimitReason] = useState<LimitReason>('daily');
  const [offerDismissed, setOfferDismissed] = useState(() => loadOfferDismissed(config.locale));
  const [activeTool, setActiveTool] = useState<AiToolId>('chat');
  const [role, setRole] = useState<RoleId>('general');
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [turnstileConfig, setTurnstileConfig] = useState<{ required: boolean; siteKey: string | null } | null>(null);
  const [turnstileConfigError, setTurnstileConfigError] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileServerError, setTurnstileServerError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const retryFocusRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const turnstileRef = useRef<TurnstileChallengeHandle>(null);

  const focusInput = () => { inputRef.current?.focus(); };
  const onTurnstileTokenChange = useCallback((token: string | null) => {
    setTurnstileToken(token);
    if (token) {
      setTurnstileServerError(null);
    }
  }, []);

  useEffect(() => {
    trackOnce(EV.pageView, { locale: config.locale });
    trackOnce(EV.visitChat, { locale: config.locale });
    trackOnce(EV.chatOpened, { locale: config.locale, anonymous: true });
  }, [config.locale]);

  useEffect(() => {
    let cancelled = false;
    void fetchTurnstileConfig(config.apiBase)
      .then((next) => {
        if (cancelled) return;
        setTurnstileConfig(next);
        if (next.required && !next.siteKey) setTurnstileConfigError(true);
      })
      .catch(() => {
        if (!cancelled) setTurnstileConfigError(true);
      });
    return () => { cancelled = true; };
  }, [config.apiBase]);

  const assistantCount = useMemo(() => messages.filter((m) => m.role === 'assistant' && !m.pending && !m.error).length, [messages]);
  const empty = messages.length === 0;
  const turnstileReady = turnstileConfig?.required === false || !!turnstileToken;
  const sendDisabled = busy || limitReached || !turnstileReady;

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
    if (!trimmed || sendDisabled) return;
    setBusy(true);
    setInput('');
    setTurnstileServerError(null);
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

    const base = withUser.filter((m) => !m.pending);
    const handleJson = (res: ChatApiResponse) => {
      if (res.ok && res.answer) {
        if (typeof res.remaining === 'number' && res.remaining >= 0) { setRemaining(res.remaining); saveRemaining(res.remaining, config.locale); }
        if (res.sessionId && res.sessionId !== sid) { setSessionId(res.sessionId); saveSessionId(res.sessionId, config.locale); }
        persist([...base, { role: 'assistant', content: res.answer, model: res.modelUsed ?? null }]);
        track(EV.answerReceived, { model: res.modelUsed });
        track(EV.aiResponseSuccess, { model: res.modelUsed, messageNumber });
      } else if (res.code === 'limit_reached') {
        const reason: LimitReason = res.reason === 'hourly' ? 'hourly' : 'daily';
        setLimitReason(reason);
        setLimitReached(true);
        // An hourly pause is not the end of the day, so the day counter is
        // left alone — writing 0 here would wall the visitor until midnight.
        if (reason === 'daily') { setRemaining(0); saveRemaining(0, config.locale); }
        setMessages(base);
        track(EV.limitReached, { reason, status: 'blocked' });
        track(EV.limitReachedProduct, { reason, status: 'blocked' });
        track(EV.aiResponseError, { code: 'limit_reached', messageNumber });
      } else if (res.code === 'turnstile_failed' || res.code === 'turnstile_unavailable') {
        setMessages(history);
        setInput(trimmed);
        setTurnstileServerError(res.code === 'turnstile_failed' ? t.turnstileRetry : t.turnstileError);
        track(EV.aiResponseError, { code: res.code, messageNumber });
      } else {
        // Curated copy only — never surface raw backend/provider strings.
        const friendly = res.code === 'network' ? t.errorNetwork : t.errorGeneric;
        persist([...base, { role: 'assistant', content: friendly, error: true }]);
        track(EV.providerError, { code: res.code });
        track(EV.aiResponseError, { code: res.code, messageNumber });
      }
    };

    // Streaming-first: deltas render as they arrive. If the server (or the
    // Railway gateway) answers with plain JSON, handleJson takes over.
    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    // One React render per animation frame, not one per token. A fast model
    // emits deltas far quicker than a cheap phone can lay out markdown, and
    // rendering each one is how a stream turns into stutter.
    let frame = 0;
    const raf = typeof requestAnimationFrame === 'function';
    const paint = () => {
      frame = 0;
      setMessages([...base, { role: 'assistant', content: acc, streaming: true }]);
    };
    const stopPainting = () => {
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      frame = 0;
    };
    const outcome = await sendChatStream(
      config.apiBase,
      {
        sessionId: sid,
        message: requestMessage,
        locale: config.locale,
        history,
        turnstileToken: turnstileToken || undefined,
      },
      {
        onMeta: (m) => { if (m.sessionId && m.sessionId !== sid) { setSessionId(m.sessionId); saveSessionId(m.sessionId, config.locale); } },
        onDelta: (text) => {
          acc += text;
          if (!raf) { paint(); return; }
          if (!frame) frame = requestAnimationFrame(paint);
        },
      },
      controller.signal,
    );
    abortRef.current = null;
    // A frame queued by the last delta would otherwise land after the final
    // state below and put the message back into its streaming form.
    stopPainting();

    if (outcome.mode === 'json') {
      handleJson(outcome.res);
    } else if (outcome.ok) {
      if (typeof outcome.remaining === 'number' && outcome.remaining >= 0) { setRemaining(outcome.remaining); saveRemaining(outcome.remaining, config.locale); }
      persist([...base, { role: 'assistant', content: acc, model: outcome.modelUsed ?? null }]);
      track(EV.answerReceived, { model: outcome.modelUsed });
      track(EV.aiResponseSuccess, { model: outcome.modelUsed, messageNumber });
    } else if (outcome.aborted) {
      // User pressed Stop: keep whatever was generated, never an error state.
      if (acc) persist([...base, { role: 'assistant', content: acc, model: null }]);
      else setMessages(base);
      track(EV.generationStopped, { locale: config.locale, messageNumber });
    } else if (acc) {
      // Stream broke mid-answer — the partial text is still useful.
      persist([...base, { role: 'assistant', content: acc, model: null }]);
      track(EV.providerError, { code: outcome.code });
      track(EV.aiResponseError, { code: outcome.code, messageNumber });
    } else {
      const friendly = outcome.code === 'network' ? t.errorNetwork : t.errorGeneric;
      persist([...base, { role: 'assistant', content: friendly, error: true }]);
      track(EV.providerError, { code: outcome.code });
      track(EV.aiResponseError, { code: outcome.code, messageNumber });
    }
    if (turnstileConfig?.required) {
      turnstileRef.current?.reset();
    }
    setBusy(false);
    // Avoid stealing focus after the asynchronous challenge reset.
    if (!turnstileConfig?.required) focusInput();
  };

  const onStop = () => { abortRef.current?.abort(); };

  // Prompt chips always prefill the composer and focus — never auto-send.
  const onChipPick = (chip: PromptChip) => {
    if (busy || limitReached) return;
    setInput(chip.insert);
    track(EV.promptChipClicked, { chipId: chip.id, locale: config.locale });
    track(EV.useTemplate, { templateId: `chip_${chip.id}`, tool: 'chat', mode: 'prefill' });
    focusInput();
  };

  const onTemplatePick = (template: PromptTemplate, prompt: string) => {
    if (sendDisabled) return;
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
    if (sendDisabled) return;
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
    // A dismissed offer stays dismissed — "new chat" is not a fresh chance to
    // pitch the same person again.
    startedRef.current = false;
    track(EV.newChat, { status: 'cleared' });
    focusInput();
  };

  const onRetry = () => {
    if (sendDisabled) return;
    let lastUser = '';
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { lastUser = messages[i].content; break; } }
    if (lastUser) {
      track(EV.responseRegenerated, { locale: config.locale });
      void doSend(lastUser);
    }
  };

  const onDismissOffer = () => {
    setOfferDismissed(true);
    saveOfferDismissed(config.locale);
  };

  // The hourly window may already have passed while the card was on screen.
  // Nothing local can know when, so the honest move is to let the person try:
  // the server either answers or says 'limit_reached' again.
  const onLimitRetry = () => {
    retryFocusRef.current = true;
    setLimitReached(false);
  };

  // The composer does not exist yet at the moment of the click — it replaces
  // the cap card on the next render — so focus has to wait for it.
  useEffect(() => {
    if (limitReached || !retryFocusRef.current) return;
    retryFocusRef.current = false;
    inputRef.current?.focus();
  }, [limitReached]);

  const showOffer = assistantCount >= B2B_AFTER && !offerDismissed && !limitReached;
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
      <ImagePromptTool locale={config.locale} onGenerate={onImagePrompt} disabled={sendDisabled} />
    </div>
  ) : activeTool !== 'chat' ? (
    <div className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-white">{toolCopy[activeTool].title}</h2>
      <p className="mb-4 mt-1 text-sm leading-relaxed text-white/50">{toolCopy[activeTool].body}</p>
      <PromptTemplateGrid key={`${config.locale}-${activeTool}`} locale={config.locale} tool={activeTool} onPick={onTemplatePick} disabled={sendDisabled} />
      {activeTool === 'business' && (
        <p className="mt-4 text-[13px] text-white/45">
          <a href={businessHref} onClick={() => track(EV.businessClicked, { from: 'business_tab' })} className="text-brand-cyan hover:underline underline-offset-4">{t.businessLink}</a>
        </p>
      )}
    </div>
  ) : null;

  return (
    // ym-hide-content: Webvisor is enabled on counter 111312750. Everything the
    // console renders is a prompt, an answer or a saved conversation title, so
    // the whole console is masked in the session recording.
    // colorScheme dark: the console is a dark surface whatever the OS theme is,
    // and without this the UA paints checkboxes, scrollbars and autofill in
    // light-mode colours on top of it.
    <div
      className="flex h-full min-h-0 bg-bg-base text-white ym-hide-content"
      style={{ colorScheme: 'dark' }}
      data-testid="ai-console"
    >
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
          <span className="truncate whitespace-nowrap font-display text-[15px] text-white lg:hidden">{t.brand}</span>
          <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
            <AiUsageBadge remaining={remaining} t={t} />
            <nav className="flex items-center overflow-hidden rounded-xl bg-white/[0.04] text-[11px]" aria-label={uz ? 'Til' : 'Язык'}>
              {([
                { code: 'RU', href: '/ru/gpt-chat/', lang: 'ru', active: !uz },
                { code: 'UZ', href: '/uz/gpt-uzbek-tilida/', lang: 'uz', active: uz },
              ] as const).map((l) =>
                l.active ? (
                  <span key={l.code} aria-current="page" className="grid min-h-11 min-w-11 place-items-center bg-white/10 text-white">{l.code}</span>
                ) : (
                  <a key={l.code} href={l.href} hrefLang={l.lang} data-testid={`lang-${l.lang}`} className="grid min-h-11 min-w-11 place-items-center text-white/45 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cyan">{l.code}</a>
                ),
              )}
            </nav>
            <a
              href={pricingHref}
              onClick={() => { track(EV.upgradeClick, { from: 'topbar', status: 'pricing' }); track(EV.viewPricing, { from: 'topbar' }); track(EV.pricingClicked, { from: 'topbar' }); }}
              className="hidden sm:inline-flex min-h-11 items-center rounded-xl bg-brand-cyan/[0.08] px-3.5 py-2 text-[11px] font-semibold text-brand-cyan hover:bg-brand-cyan/[0.14] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              {t.pricingLink}
            </a>
          </div>
        </header>

        {/* The free allowance as a thread, so the cap is watched rather than
            sprung. FREE_DAILY_SEGMENTS mirrors GPT_FREE_DAILY_LIMIT; the
            component hides itself if the two ever drift apart. */}
        <AiQuotaThread remaining={remaining} total={FREE_DAILY_SEGMENTS} t={t} />

        {/* Messages area */}
        <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-6">
            {toolPanel}
            {empty && activeTool === 'chat' ? (
              // The resting screen is the first thing ~89% of this site's search
              // traffic sees. It used to centre a title, a hint and four chips
              // in 45vh of empty dark, which left the product looking like a
              // demo. The height is now what the content needs, and the space
              // under the chips carries the terms instead of nothing: free, no
              // signup, fifteen messages a day — stated once, before anyone
              // invests a question in it.
              <div className="flex min-h-[32vh] flex-col items-center justify-center py-6 text-center">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">{t.brand}</p>
                <h2 className="h-display mb-2 text-[22px] leading-tight text-white sm:text-[26px]">{t.emptyTitle}</h2>
                <p className="mb-6 max-w-sm text-[15px] leading-relaxed text-white/50">{t.emptyHint}</p>
                <div className="w-full max-w-md">
                  <AiPromptChips chips={t.chips} onPick={onChipPick} disabled={busy || limitReached} label={t.emptyPrompt} />
                </div>
                <p className="mt-6 text-[12px] leading-relaxed text-white/35">{t.emptyMeta}</p>
              </div>
            ) : (
              <AiChatMessageList messages={messages} t={t} busy={busy} onRetry={onRetry} onAnswerAction={onAnswerAction} scrollRef={viewportRef} />
            )}
            {/* Stage 2 of the funnel: one offer, after the chat has already
                been useful, closable and gone for the day once closed. */}
            {showOffer && (
              <AiOfferCard
                t={t}
                locale={config.locale}
                apiBase={config.apiBase}
                sessionId={sessionId}
                stage="b2b"
                pricingHref={pricingHref}
                onDismiss={onDismissOffer}
              />
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0">
          <div className="mx-auto w-full max-w-[760px] px-4 pb-2 sm:px-6">
            {limitReached ? (
              // Stages 3 and 4: the same card, told apart by which cap was hit.
              // Telegram leads, because it is a real continuation rather than
              // a consolation link.
              <div className="py-3">
                <AiOfferCard
                  t={t}
                  locale={config.locale}
                  apiBase={config.apiBase}
                  sessionId={sessionId}
                  stage={limitReason}
                  pricingHref={pricingHref}
                  onRetry={limitReason === 'hourly' ? onLimitRetry : undefined}
                />
              </div>
            ) : (
              <>
                {remaining >= 0 && remaining <= 2 && (
                  // Saffron, the one warm colour in this palette, and the same
                  // one the quota thread turns above — so the warning and the
                  // thread read as one fact stated twice, not two alerts. The
                  // emoji that used to sit here said nothing the colour and the
                  // sentence did not already say.
                  <div className="mb-2 flex items-center gap-2 rounded-2xl border border-brand-saffron/20 bg-brand-saffron/[0.06] px-4 py-2.5 text-[12px] text-brand-saffron" role="status">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-saffron" aria-hidden="true" />
                    <span>{t.lowWarning(remaining)}</span>
                    <a href={pricingHref} onClick={() => { track(EV.viewPricing, { from: 'low_limit' }); track(EV.upgradeClick, { from: 'low_limit' }); track(EV.pricingClicked, { from: 'low_limit' }); }} className="ml-auto inline-flex min-h-11 items-center whitespace-nowrap text-brand-cyan hover:underline">{t.paywallCta}</a>
                  </div>
                )}
                {turnstileConfig?.required && turnstileConfig.siteKey && (
                  <TurnstileChallenge
                    ref={turnstileRef}
                    siteKey={turnstileConfig.siteKey}
                    loadingText={t.turnstileLoading}
                    promptText={t.turnstilePrompt}
                    verifiedText={t.turnstileVerified}
                    errorText={t.turnstileError}
                    onTokenChange={onTurnstileTokenChange}
                  />
                )}
                {(!turnstileConfig || turnstileConfigError) && (
                  <p className={turnstileConfigError ? 'mb-2 text-center text-xs text-red-300' : 'mb-2 text-center text-xs text-white/45'} role="status" aria-live="polite">
                    {turnstileConfigError ? t.turnstileError : t.turnstileLoading}
                  </p>
                )}
                {turnstileServerError && (
                  <p className="mb-2 text-center text-xs text-red-300" role="alert">
                    {turnstileServerError}
                  </p>
                )}
                <AiChatInput value={input} onChange={setInput} onSend={() => doSend(input)} onStop={onStop} disabled={sendDisabled} busy={busy} maxChars={MAX_INPUT} t={t} inputRef={inputRef} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
