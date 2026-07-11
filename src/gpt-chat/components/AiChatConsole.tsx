import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, MountConfig } from '../types';
import { strings } from '../i18n';
import { createSession, sendChat } from '../api';
import { loadHistory, saveHistory, loadSessionId, saveSessionId, clearHistory } from '../storage';
import { track, EV } from '../analytics';
import { AiChatMessageList } from './AiChatMessageList';
import { AiChatInput } from './AiChatInput';
import { AiPromptChips } from './AiPromptChips';
import { AiUsageBadge } from './AiUsageBadge';
import { AiPaywallCard } from './AiPaywallCard';
import { AiSafetyNotice } from './AiSafetyNotice';
import { AiChatLeadForm } from './AiChatLeadForm';

const MAX_INPUT = 3000;

export function AiChatConsole({ config }: { config: MountConfig }) {
  const t = strings(config.locale);
  const pricingHref = '/ru/tarify-ai-chat/';
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(() => loadSessionId());
  const [remaining, setRemaining] = useState<number>(-1);
  const [busy, setBusy] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const startedRef = useRef(false);

  // One-time page-view + lazy session bootstrap.
  useEffect(() => {
    track(EV.pageView, { locale: config.locale });
  }, [config.locale]);

  const ensureSession = async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    const id = await createSession(config.apiBase, config.locale);
    if (id) {
      setSessionId(id);
      saveSessionId(id);
      if (!startedRef.current) {
        startedRef.current = true;
        track(EV.sessionStarted, {});
      }
    }
    return id;
  };

  const persist = (next: ChatMessage[]) => {
    setMessages(next);
    saveHistory(next);
  };

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

    const res = await sendChat(config.apiBase, {
      sessionId: sid,
      message: trimmed,
      locale: config.locale,
      history,
    });

    const base = withUser.filter((m) => !m.pending);
    if (res.ok && res.answer) {
      if (typeof res.remaining === 'number') setRemaining(res.remaining);
      if (res.sessionId && res.sessionId !== sid) {
        setSessionId(res.sessionId);
        saveSessionId(res.sessionId);
      }
      persist([...base, { role: 'assistant', content: res.answer, model: res.modelUsed ?? null }]);
      track(EV.answerReceived, { model: res.modelUsed });
    } else if (res.code === 'limit_reached') {
      setLimitReached(true);
      setRemaining(0);
      setMessages(base);
      track(EV.limitReached, { reason: res.reason });
    } else {
      persist([...base, { role: 'assistant', content: res.message || t.errorGeneric, error: true }]);
      track(EV.providerError, { code: res.code });
    }
    setBusy(false);
  };

  const onPickChip = (chip: string) => {
    if (busy || limitReached) return;
    void doSend(chip);
  };

  const onNewChat = () => {
    clearHistory();
    setMessages([]);
    setLimitReached(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <AiUsageBadge remaining={remaining} t={t} />
        {messages.length > 0 && (
          <button type="button" onClick={onNewChat} className="text-xs text-white/50 hover:text-white underline underline-offset-2">
            {t.newChat}
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-bg-base/60 p-4 sm:p-5 flex flex-col min-h-[360px] max-h-[560px] overflow-y-auto">
        <AiChatMessageList messages={messages} t={t} />
      </div>

      {limitReached ? (
        <AiPaywallCard t={t} pricingHref={pricingHref} onCta={() => track(EV.subscribeIntent, { from: 'paywall' })} />
      ) : (
        <>
          <AiChatInput value={input} onChange={setInput} onSend={() => doSend(input)} disabled={busy} maxChars={MAX_INPUT} t={t} />
          {messages.length === 0 && <AiPromptChips chips={t.promptChips} onPick={onPickChip} disabled={busy} />}
        </>
      )}

      <AiSafetyNotice t={t} />

      <div className="pt-2">
        <AiChatLeadForm t={t} apiBase={config.apiBase} sessionId={sessionId} />
      </div>
    </div>
  );
}
