import { chatEntryFromHash, chatEntryArticleHref } from '../../shared/chat-entry';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport, MessageScrollerButton, useMessageScroller } from '@/components/ui/message-scroller';
import { ArrowDown } from 'lucide-react';
import { billingOpen, type AnswerAction, type ChatMessage, type FreeLimits, type Locale, type MountConfig, type PackTerms } from "../types";
import { strings } from "../i18n";
import { createSession, loadTurnstileConfig, sendChatStream } from "../api";
import type { ChatApiResponse } from "../types";
import {
  loadHistory,
  saveHistory,
  loadSessionId,
  saveSessionId,
  loadRemaining,
  saveRemaining,
  loadOfferDismissed,
  saveOfferDismissed,
  loadDraft,
  saveDraft,
  loadBusinessLineShown,
  saveBusinessLineShown,
  onceThisSession,
  hasStoredHistory,
} from "../storage";
import { inApp, initMetaChatPixel, track, trackMetaChatEngaged, trackOnce, EV } from "../analytics";
import { reachYandexGoal, reachYandexGoalOnce, YANDEX_GOALS } from "../../lib/analytics/yandexMetrika";
import { AiChatMessageList } from "./AiChatMessageList";
import { AiChatInput, CLOCK } from "./AiChatInput";
import { AiPromptChips } from "./AiPromptChips";
import { BrandMark } from "./BrandMark";
import { usageLine } from "../usage-line";
import { limitCard } from "../limit-card";
import {
  LIMIT_TICK_MS,
  canSendNow,
  hourCountShown,
  limitCounts,
  limitReasonOf,
  loadLimit,
  reduceLimit,
  saveLimit,
} from "../limit-state";
import { AiSidebar } from "./AiSidebar";
import type { TurnstileChallengeHandle } from "./TurnstileChallenge";
import { loadTurnstile } from "../../shared/turnstile";
import { applyRole, frameLocale, maxRolePrefixLength, type RoleId } from "../roles";
import type { AiToolId, PromptTemplate } from "../templates";
import type { PromptChip } from "../i18n";
import { AiAccountPanel, type AccountView, type PackFrom, type PackOpenRequest } from "./AiAccountPanel";
import type { AccountCause } from "../use-account";
import { archiveChat, keepsComposer, keepsShownConversation, loadChats } from "../storage";
import { LazyPart, PartFailed, PartLoading, answerPart, leadPart, limitPart, rolePart, toolsPart, turnstilePart } from "../lazy-part";
import { preloadsBusinessCard } from "../preload";
import { businessLineTopic, type BusinessTopic } from "../business-intent";
import { useKeyboardOpen } from "../keyboard";

/** The server's GPT_MAX_INPUT_CHARS: the question with its role and language lines. */
const MAX_INPUT = 3000;
/** The limit card, which also describes the composer while a limit stands. */
const LIMIT_CARD_ID = "ai-limit-card";
/** A tick: the terms on the resting screen, a lifted limit. */
const TICK = "M5 12.5l4.5 4.5L19 7.5";

const B2B_AFTER = 3; // show the commercial offer after this many assistant answers
/** The free tier's rolling hour: warn while this many messages or fewer are left in it (after the 3rd of 5). */
const HOUR_WARNING_AT = 2;
/** The day: warn while this many or fewer are left (the header's count turns saffron at the same points). */
const DAY_WARNING_AT = 3;
/** A rolling-hour count says nothing an hour after the turn that reported it. */
const HOUR_WARNING_TTL_MS = 3_600_000;

/** Smooth, unless the visitor asked for less motion. */
const smooth = (): ScrollBehavior => (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/**
 * The thread goes to the limit card when a limit is set (its last item), and
 * again when the keyboard opens over it. Through the scroller, inside its
 * provider: scrollToEnd drops the spacer left by the refused question (which
 * giveBack() took out of the thread) and follows the bottom from then on.
 */
function LimitScroll({ since, keyboard }: { since: number | null; keyboard: boolean }) {
  const { scrollToEnd } = useMessageScroller();
  useEffect(() => {
    if (since !== null) scrollToEnd({ behavior: smooth() });
  }, [since, keyboard, scrollToEnd]);
  return null;
}

export function AiChatConsole({ config }: { config: MountConfig }) {
  const t = strings(config.locale);
  const uz = config.locale === "uz";
  // Present on the Russian chat only: most of its search impressions are
  // Uzbek-language queries, and the only switch used to be an 11px «UZ».
  const uzEntry = uz ? undefined : t.uzEntry;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [storageScope, setStorageScope] = useState<string | undefined>();
  // 'unknown': the account view failed even after a retry. The chat still
  // answers, as a guest whose history is neither loaded nor written (F11);
  // a conversation already on screen stays there (plan M-01).
  const [accountState, setAccountState] = useState<"loading" | "ready" | "unknown">("loading");
  const accountReady = accountState === "ready";
  const [freeLimits, setFreeLimits] = useState<FreeLimits | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [billingAvailable, setBillingAvailable] = useState(false);
  const [packTerms, setPackTerms] = useState<PackTerms | null>(null);
  const [botHandoff, setBotHandoff] = useState(false);
  const identityGeneration = useRef(0);
  const [entry] = useState(() => chatEntryFromHash(window.location.hash, config.locale));
  // Which article sent the visitor here: a fixed slug, never prompt text.
  const entryMeta = entry ? { entry: entry.id } : {};
  const [input, setInput] = useState(() => entry?.prompt || loadDraft());
  const [savedChats, setSavedChats] = useState<ReturnType<typeof loadChats>>([]);
  const [paid, setPaid] = useState(false);
  const [accountRefresh, setAccountRefresh] = useState(0);
  const [accountOpen, setAccountOpen] = useState<PackOpenRequest | undefined>();
  const openAccount = (from: PackFrom) => setAccountOpen((last) => ({ seq: (last?.seq ?? 0) + 1, from }));
  const accountIdentityRef = useRef<string | null>(null);
  const establishedIdentityRef = useRef<string | null>(null);
  // Reads failed after someone was known; the next view that names them again stores the screen.
  const unstableRef = useRef(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(-1);
  // Free messages left in the rolling hour, from the last answered turn.
  const [hourLeft, setHourLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Set and lifted by the server only (limit-state.ts); the clock just says
  // when the send button comes back.
  const [limit, dispatchLimit] = useReducer(reduceLimit, null, () => loadLimit(Date.now()));
  const [clock, setClock] = useState(() => Date.now());
  const [offerDismissed, setOfferDismissed] = useState(() =>
    loadOfferDismissed(config.locale),
  );
  // The business line under a first answer (plan WP-20); `open` once its form is.
  const [businessLine, setBusinessLine] = useState<{ topic: BusinessTopic; open: boolean } | null>(null);
  const [activeTool, setActiveTool] = useState<AiToolId>("chat");
  const [role, setRole] = useState<RoleId>("general");
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [turnstileConfig, setTurnstileConfig] = useState<{
    required: boolean;
    siteKey: string | null;
  } | null>(null);
  const [turnstileConfigError, setTurnstileConfigError] = useState(false);
  // Bumped to ask for the config again after the server refused a check.
  const [configRead, setConfigRead] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileServerError, setTurnstileServerError] = useState<
    string | null
  >(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const keyboard = useKeyboardOpen(inputRef);
  const abortRef = useRef<AbortController | null>(null);
  const turnstileRef = useRef<TurnstileChallengeHandle>(null);
  // What the screen holds, for onAccount, which outlives the render it was made in.
  const shownRef = useRef<{ messages: ChatMessage[]; busy: boolean }>({ messages: [], busy: false });
  useEffect(() => {
    shownRef.current = { messages, busy };
  }, [messages, busy]);
  // Whether a turn may store, and under which scope: read when it stores, not
  // when it began. A question sent before the account view answers (NOW-02)
  // is stored once the view says who is asking, in the middle of the turn too.
  const storeRef = useRef<{ ready: boolean; scope?: string }>({ ready: false });
  // The session on screen, for onAccount, which keeps it with the conversation.
  const sessionIdRef = useRef<string | null>(null);
  // The build does not run the React Compiler; this lint check reads the
  // composer's setter (a stable useState setter) into this callback's scope.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const onAccount = useCallback((account: AccountView | null, cause: AccountCause) => {
    // A read that failed once someone is known (a flaky network after an
    // answer, a tab shown again offline) says nothing about who is asking:
    // the conversation, the counters and the pack button stay as they are,
    // and nothing is stored until the account answers again (F11, plan M-01).
    if (account === null && cause === "unreachable" && establishedIdentityRef.current !== null) {
      unstableRef.current = true;
      storeRef.current = { ready: false, scope: storeRef.current.scope };
      setAccountState("unknown");
      return;
    }
    // A guest's pack (guest checkout) is this browser's: its chats stay
    // where they were before paying, and signing in later keeps the composer.
    const scope = account?.user?.guest ? undefined : account?.user?.storageKey;
    const identity = account ? (scope || "guest") : null;
    // The same visitor answers again: what was said meanwhile is stored now.
    if (account && unstableRef.current && accountIdentityRef.current === identity)
      saveHistory(shownRef.current.messages.filter((m) => !m.streaming), config.locale, scope);
    if (account) unstableRef.current = false;
    if (accountIdentityRef.current !== identity) {
      const shown = shownRef.current;
      if (
        identity !== null &&
        keepsShownConversation(
          accountIdentityRef.current,
          establishedIdentityRef.current,
          identity,
          shown.busy || shown.messages.length > 0,
        )
      ) {
        // The account answers for the first time, or again after failed
        // reads (F11), and the chat was answering this visitor meanwhile:
        // what was said, an answer still arriving and the session stay. It
        // becomes the stored conversation; the one stored before moves to the
        // saved chats, as "New chat" would do. The turn in flight stores its
        // answer here itself when it ends (storeRef).
        setSavedChats(archiveChat(loadHistory(config.locale, scope), config.locale, scope));
        saveHistory(shown.messages.filter((m) => !m.streaming), config.locale, scope);
        if (sessionIdRef.current) saveSessionId(sessionIdRef.current, config.locale, scope);
      } else {
        identityGeneration.current++;
        abortRef.current?.abort();
        setBusy(false);
        setBusinessLine(null);
        setMessages(account ? loadHistory(config.locale, scope) : []);
        setSavedChats(account ? loadChats(config.locale, scope) : []);
        // Auth redirects revoke session cookies. Never restore an old account's
        // session reference on a new identity; quota stays authoritative on server.
        const firstGuest = identity === 'guest' && establishedIdentityRef.current === null;
        sessionIdRef.current = firstGuest ? loadSessionId(config.locale) : null;
        setSessionId(sessionIdRef.current);
      }
      // A failed account read says nothing about who is asking, so the
      // composer (and a question a limit put back into it) stays, and so it
      // does when a guest signs in to buy a pack. Another known identity —
      // signing out, another account — starts empty.
      if (identity !== null && establishedIdentityRef.current !== null && !keepsComposer(establishedIdentityRef.current, identity)) setInput("");
      if (account) establishedIdentityRef.current = identity;
      setOfferDismissed(account ? loadOfferDismissed(config.locale, scope) : false);
      accountIdentityRef.current = identity;
    }
    // Here, not in an effect: a turn can end before the next render.
    storeRef.current = account ? { ready: true, scope } : { ready: false, scope: storeRef.current.scope };
    setStorageScope(scope);
    setAccountState(account ? "ready" : "unknown");
    setSignedIn(!!account?.user);
    setPaid(!!account?.access && account.access.ends_at > Date.now());
    setBillingAvailable(billingOpen(account));
    setPackTerms(account?.pack ?? null);
    setBotHandoff(account?.botHandoff === true);
    setFreeLimits(account?.freeLimits ?? null);
    setRemaining(account?.remaining ?? account?.access?.remaining ?? (account && !account.user ? loadRemaining() : -1));
    // The view refreshes after every turn and on every focus, and knows
    // nothing of a guest's allowance: it never lifts a free-tier limit a 429
    // set (F1). It only reports a pack that has just arrived (or is gone,
    // taking its day cap along), or a signed-in visitor's free day that the
    // server counted to the end.
    if (account)
      dispatchLimit({
        type: "account",
        freeRemaining: account.user && !account.access ? (account.remaining ?? null) : null,
        packRemaining: account.access?.remaining ?? null,
        freeLimits: account.freeLimits ?? null,
        now: Date.now(),
      });
  }, [config.locale]);

  // The way to a payment page and back (plan WP-17): the question in the
  // composer waits there (DRAFT_TTL_MS), limit or not.
  const keepDraft = useCallback(() => saveDraft(inputRef.current?.value ?? ""), []);

  const focusInput = () => {
    inputRef.current?.focus();
  };
  const onTurnstileTokenChange = useCallback((token: string | null) => {
    setTurnstileToken(token);
    if (token) {
      setTurnstileServerError(null);
    }
  }, []);

  // Back online: read the account at once rather than at the next turn or focus.
  useEffect(() => {
    const online = () => setAccountRefresh((n) => n + 1);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);

  // On mount, once per page view: a visitor whose account view never
  // answers has still opened the chat (F18). Whether they are signed in is
  // not known yet; message_sent carries that.
  useEffect(() => {
    initMetaChatPixel();
    trackOnce(EV.chatOpened, { locale: config.locale, ...entryMeta, in_app: inApp() });
    reachYandexGoalOnce(YANDEX_GOALS.chatOpened);
  // Entry is fixed for this navigation; no prompt text enters analytics.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.locale]);

  useEffect(() => {
    let cancelled = false;
    void loadTurnstileConfig(config.apiBase).then((next) => {
      if (cancelled) return;
      setTurnstileConfig(next);
      // Said only when the server asks for a check it cannot show.
      setTurnstileConfigError(next.required && !next.siteKey);
      // Cloudflare's script loads while the lazy part chat-turnstile does.
      if (next.required && next.siteKey) void loadTurnstile().catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [config.apiBase, configRead]);

  const assistantCount = useMemo(
    () =>
      messages.filter((m) => m.role === "assistant" && !m.pending && !m.error)
        .length,
    [messages],
  );
  const empty = messages.length === 0;
  // How an answer reads (the lazy part chat-answer) is fetched once a
  // question is being written or a conversation is on screen, and at once
  // when one is stored, beside the account view that loads it: it is here
  // before the answers are, which show as plain text until then.
  const writing = !empty || !!input.trim();
  useEffect(() => {
    if (writing || hasStoredHistory(config.locale)) answerPart.preload();
  }, [writing, config.locale]);
  // The page H1 heads the resting screen (roadmap R-S1, owner decision 2), as
  // a quiet kicker above the greeting (chat design §5.2). Its text comes from
  // data-h1 on the mount point, so it is not in this bundle.
  const h1 = config.h1 || "";
  const resting = empty && activeTool === "chat";
  // The example question in the empty field only where it fits on one line:
  // the field never grows on the first key (chat design §5.3).
  const [wide] = useState(() => !!window.matchMedia?.("(min-width: 420px)").matches);
  // The resting screen opens at the top and does not follow the bottom, so the
  // H1 stays in the first screen of a small phone. With the first message the
  // scroller follows the answer as before; emptying the thread (New chat)
  // remounts it, so the resting screen opens at the top again.
  const [rest, setRest] = useState({ empty, key: 0 });
  if (rest.empty !== empty) setRest({ empty, key: rest.key + (empty ? 1 : 0) });
  const turnstileKey = turnstileConfig?.required ? turnstileConfig.siteKey : null;
  // Sending waits for nothing it does not need: not the account view (F11
  // covers a guest who writes before it answers) and not a config still on
  // its way. Only a check the server asked for holds it until its token.
  const turnstileReady =
    turnstileConfig === null || !turnstileConfig.required || !!turnstileToken;
  const limitBlocked = !canSendNow(limit, clock);
  // The header counts 0 while the hourly limit stands, not the day's rest,
  // and the day's rest once it has lifted.
  const hourBlocked = limit?.reason === "hourly" && limitBlocked;
  const hourShown = hourCountShown(limit, hourLeft, clock);
  const sendDisabled = busy || limitBlocked || !turnstileReady;

  // Once a session, while few messages are left: the buttons under an answer
  // that make the AI write a new one cost one each (map 03 §3.6). Gone with
  // the next message.
  const fewLeft = !paid && ((remaining >= 0 && remaining <= 3) || (hourShown !== null && hourShown <= 2));
  const [costNote, setCostNote] = useState(false);
  useEffect(() => {
    if (fewLeft && onceThisSession("gptchat_cost_note")) setCostNote(true);
  }, [fewLeft]);

  // The limit outlives a reload and a trip to the payment page.
  useEffect(() => {
    saveLimit(limit);
  }, [limit]);

  // While a limit waits, re-read the clock every LIMIT_TICK_MS, when the tab
  // is shown again and at the moment it lifts: "N min" counts down and the
  // send button comes back on time. The server still decides.
  const retryAt = limit?.retryAt ?? null;
  useEffect(() => {
    if (retryAt === null) return;
    const tick = () => setClock(Date.now());
    tick();
    const left = retryAt - Date.now();
    if (left <= 0) return;
    const timer = window.setInterval(tick, LIMIT_TICK_MS);
    const lift = window.setTimeout(() => {
      window.clearInterval(timer);
      tick();
    }, left + 50);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(lift);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [retryAt]);

  // What is typed waits in the browser for an hour (DRAFT_TTL_MS), limit or
  // not: a phone that unloads the tab, a reload or the payment page does not
  // lose it (F2, PERSIST-01). An article's question, untouched, is not a
  // draft; sending empties the composer, and so the draft.
  const limited = limit !== null;
  useEffect(() => {
    if (input === entry?.prompt) return;
    const timer = window.setTimeout(() => saveDraft(input), 500);
    return () => window.clearTimeout(timer);
  }, [input, entry]);

  // A phone that hides or unloads the tab mid-answer: what has arrived is
  // stored at once (doSend sets what to store while a turn runs).
  const flushRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const flush = (event: Event) => {
      if (event.type === "pagehide" || document.visibilityState === "hidden") flushRef.current?.();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  // A rolling-hour count is dropped an hour after the turn that reported it.
  useEffect(() => {
    if (hourLeft === null) return;
    const timer = window.setTimeout(() => setHourLeft(null), HOUR_WARNING_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [hourLeft]);

  // Nothing is stored while the account view has not answered: who is
  // asking, and so the storage scope, is unknown (F11). Asked at the moment
  // of storing, so a turn under way stores once the view has answered.
  const store = (save: (scope?: string) => void) => {
    const s = storeRef.current;
    if (s.ready) save(s.scope);
  };
  const keepSession = (id: string) => {
    sessionIdRef.current = id;
    setSessionId(id);
    store((scope) => saveSessionId(id, config.locale, scope));
  };
  const keepRemaining = (n: number) => {
    setRemaining(n);
    store((scope) => saveRemaining(n, scope));
  };
  const ensureSession = async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    const generation = identityGeneration.current;
    const id = await createSession(config.apiBase, config.locale);
    if (generation !== identityGeneration.current) return null;
    if (id) keepSession(id);
    return id;
  };

  const persist = (next: ChatMessage[]) => {
    setMessages(next);
    store((scope) => saveHistory(next, config.locale, scope));
  };

  const doSend = async (
    text: string,
    meta: {
      templateId?: string;
      tool?: AiToolId;
      answerAction?: AnswerAction;
      retry?: boolean;
      /** The thread before this question (a retry drops the old answer); else what is on screen. */
      base?: ChatMessage[];
      /** What the model gets instead of `text` (an answer button's instruction). */
      request?: string;
      /** The language of the lines around `request`: the answer's for «simpler» and «continue». */
      frame?: Locale;
      /** «Qayta yozish»: the answer the new one replaces, kept as a version (REV-7). */
      prior?: ChatMessage;
    } = {},
  ) => {
    const trimmed = text.trim();
    if (!trimmed || sendDisabled) return;
    // A typed question gets its lines in its own language when its letters
    // say so (frameLocale); a button's in the language answerAsk chose (the
    // answer's for «simpler» and «continue», the page's for a translation);
    // the translator's in the page's, which says which way to go. A
    // translation, a button's or the translator's, gets no «answer in the
    // language of the question» line: it would undo the translation.
    const requestMessage = applyRole(
      meta.request ?? trimmed,
      role,
      meta.request ? meta.frame ?? config.locale : role === "translator" ? config.locale : frameLocale(trimmed, config.locale),
      { guard: role !== "translator" && meta.answerAction !== "uzbek" && meta.answerAction !== "russian" },
    );
    // Over the server's limit (a role with longer lines after a long paste, an
    // older draft, a retry under another role): nothing is sent, so nothing
    // fails the same way on every retry. The text waits in the composer,
    // whose line says by how much it is too long.
    if (requestMessage.length > MAX_INPUT) {
      if (meta.base && !meta.request) setInput(trimmed);
      track(EV.aiResponseError, { code: "too_long" });
      focusInput();
      return;
    }
    setBusy(true);
    setInput("");
    // At once, not after the draft's 500 ms: the question is in the thread now.
    saveDraft("");
    setCostNote(false);
    // The business line was an offer for the first answer: a next message
    // takes it away, unless its form is open.
    setBusinessLine((line) => (line?.open ? line : null));
    setTurnstileServerError(null);
    // The question and «AI o‘ylayapti…» show at the tap, before the session
    // request: on 3G the composer used to empty half a second before them.
    const history = (meta.base ?? messages).filter((m) => !m.pending && !m.error);
    const ask = meta.answerAction && meta.request ? { request: meta.request, action: meta.answerAction, frame: meta.frame } : undefined;
    const withUser: ChatMessage[] = [
      ...history,
      { role: "user", content: trimmed, ask },
      { role: "assistant", content: "", pending: true },
    ];
    setMessages(withUser);
    // Stored at once (the pending bubble is not): an answer takes 11-22 s,
    // and a tab unloaded meanwhile used to come back without the question.
    store((scope) => saveHistory(withUser, config.locale, scope));
    const generation = identityGeneration.current;
    const sid = await ensureSession();
    if (generation !== identityGeneration.current) return;
    const messageNumber = history.filter((m) => m.role === "user").length + 1;
    // Read here, in the browser, and never sent: only the topic is counted,
    // and only once the line shows (AiBusinessLine).
    const lineTopic = businessLineTopic({
      text: trimmed,
      messageNumber,
      tool: meta.tool || activeTool,
      typed: !meta.templateId && !meta.answerAction && !meta.retry,
      spent: offerDismissed || loadBusinessLineShown(),
    });
    if (lineTopic) leadPart.preload();
    // Once the answer is complete, never during the stream; once per browser session.
    const revealLine = () => {
      if (!lineTopic) return;
      saveBusinessLineShown();
      setBusinessLine({ topic: lineTopic, open: false });
    };
    track(EV.messageSent, {
      ...entryMeta,
      source: meta.templateId
        ? "template"
        : meta.retry
          ? "retry"
          : meta.answerAction
            ? "answer_action"
            : "composer",
      // Which answer button: shorter | continue | russian | uzbek.
      mode: meta.answerAction,
      message_number: messageNumber,
      tool: meta.tool || activeTool,
      role_id: role,
      template_id: meta.templateId,
      locale: config.locale,
      anonymous: !signedIn,
      in_app: inApp(),
    });

    const base = withUser.filter((m) => !m.pending);
    // A refused or stopped turn: the thread as it was before the tap, and a
    // typed question back in the composer. A retry or an answer button gave
    // up no text to give back, and its old answer stays where it was.
    const before = meta.base ? messages : history;
    const giveBack = () => {
      setMessages(before);
      if (!meta.base && !meta.answerAction) setInput(trimmed);
      store((scope) => saveHistory(before, config.locale, scope));
    };
    // What a failed or broken-off turn adds to: a new answer that did not
    // come («Qayta yozish», a retry) leaves the old one where it was; only a
    // finished answer replaces it.
    const held = meta.base ? before.filter((m) => !m.error) : base;
    // A finished answer in place of an old one keeps the old one as a version,
    // the last 3 in all (REV-7).
    const answered = (answer: ChatMessage): ChatMessage => {
      const prior = meta.prior;
      if (!prior) return answer;
      const versions = [...(prior.versions ?? [{ content: prior.content, model: prior.model ?? null, truncated: prior.truncated }]), { content: answer.content, model: answer.model ?? null, truncated: answer.truncated }].slice(-3);
      return { ...answer, versions, version: versions.length - 1 };
    };
    const handleJson = (res: ChatApiResponse) => {
      if (generation !== identityGeneration.current) return;
      // Any answer but a limit refusal or a failed check means no limit stands.
      if (
        res.code !== "limit_reached" &&
        res.code !== "turnstile_failed" &&
        res.code !== "turnstile_unavailable"
      )
        dispatchLimit({ type: "admitted" });
      if (res.ok && res.answer) {
        if (typeof res.remaining === "number" && res.remaining >= 0) keepRemaining(res.remaining);
        setHourLeft(typeof res.hourRemaining === "number" ? res.hourRemaining : null);
        if (res.sessionId && res.sessionId !== sid) keepSession(res.sessionId);
        persist([
          ...base,
          answered({
            role: "assistant",
            content: res.answer,
            model: res.modelUsed ?? null,
            truncated: res.truncated === true,
          }),
        ]);
        revealLine();
        track(EV.aiResponseSuccess, { ...entryMeta, model: res.modelUsed, message_number: messageNumber, finish: res.truncated === true ? "length" : "stop" });
        trackMetaChatEngaged(config.locale);
      } else if (res.code === "limit_reached") {
        const reason = limitReasonOf(res.reason);
        // The count an answered turn reported is stale now: 0 while the limit
        // stands (hourBlocked), the day's once it lifts.
        if (reason === "hourly") setHourLeft(null);
        dispatchLimit({
          type: "blocked",
          reason,
          retryAfterSec: res.retryAfterSec ?? null,
          limits: limitCounts(res.limits),
          now: Date.now(),
        });
        // What is left today (or in the pack): an hourly pause leaves the
        // day's count as it is.
        if (typeof res.remaining === "number" && res.remaining >= 0) keepRemaining(res.remaining);
        // The question goes back into the composer (and, while the limit
        // stands, into the draft) instead of a bubble that gets no answer.
        giveBack();
        // One event per refusal; the Metrika goal once per reason per view.
        track(EV.limitHit, { reason, locale: config.locale });
        reachYandexGoalOnce(YANDEX_GOALS.chatLimitHit, reason);
      } else if (
        res.code === "turnstile_failed" ||
        res.code === "turnstile_unavailable"
      ) {
        giveBack();
        setTurnstileServerError(
          res.code === "turnstile_failed" ? t.turnstileRetry : t.turnstileError,
        );
        // The server wanted a check: the config may say so now.
        setConfigRead((n) => n + 1);
        track(EV.aiResponseError, { code: res.code, message_number: messageNumber });
      } else {
        // Curated copy only — never surface raw backend/provider strings. A
        // message the server finds too long (invalid_message: it never gets
        // an empty one) is said so, not «the service is down».
        const friendly =
          res.code === "context_too_large" || res.code === "invalid_message"
            ? t.premium.contextTooLarge
            : res.code === "network"
              ? t.errorNetwork
              : t.errorGeneric;
        persist([
          ...held,
          { role: "assistant", content: friendly, error: true },
        ]);
        track(EV.aiResponseError, { code: res.code, message_number: messageNumber });
      }
    };

    // Streaming-first: deltas render as they arrive. If the server (or the
    // Railway gateway) answers with plain JSON, handleJson takes over.
    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";
    let answeringModel: string | null = null;
    // One React render per animation frame, not one per token. A fast model
    // emits deltas far quicker than a cheap phone can lay out markdown, and
    // rendering each one is how a stream turns into stutter.
    let frame = 0;
    const raf = typeof requestAnimationFrame === "function";
    // What has arrived, stored as a broken-off answer every 2 s and when the
    // tab is hidden: after an unload the question and that part are there,
    // with the «Javob uzilib qoldi» note. The end of the turn overwrites it.
    let storedAt = 0;
    const keep = () => {
      if (!acc || generation !== identityGeneration.current) return;
      storedAt = Date.now();
      store((scope) => saveHistory([...held, { role: "assistant", content: acc, model: answeringModel, partial: true }], config.locale, scope));
    };
    flushRef.current = keep;
    const paint = () => {
      if (generation !== identityGeneration.current) return;
      frame = 0;
      setMessages([
        ...base,
        {
          role: "assistant",
          content: acc,
          streaming: true,
          model: answeringModel,
        },
      ]);
    };
    const stopPainting = () => {
      if (frame && typeof cancelAnimationFrame === "function")
        cancelAnimationFrame(frame);
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
        onMeta: (m) => {
          if (generation !== identityGeneration.current) return;
          // The stream opens only once the server has admitted the turn.
          dispatchLimit({ type: "admitted" });
          answeringModel = m.model || null;
          if (m.sessionId && m.sessionId !== sid) keepSession(m.sessionId);
        },
        onDelta: (text) => {
          if (generation !== identityGeneration.current) return;
          acc += text;
          // Here, not in paint(): a hidden tab paints no frames.
          if (Date.now() - storedAt >= 2_000) keep();
          if (!raf) {
            paint();
            return;
          }
          if (!frame) frame = requestAnimationFrame(paint);
        },
      },
      controller.signal,
    );
    if (flushRef.current === keep) flushRef.current = null;
    if (generation !== identityGeneration.current) { stopPainting(); return; }
    abortRef.current = null;
    // A frame queued by the last delta would otherwise land after the final
    // state below and put the message back into its streaming form.
    stopPainting();

    if (outcome.mode === "json") {
      handleJson(outcome.res);
    } else if (outcome.ok) {
      if (typeof outcome.remaining === "number" && outcome.remaining >= 0) keepRemaining(outcome.remaining);
      setHourLeft(outcome.hourRemaining ?? null);
      persist([
        ...base,
        answered({
          role: "assistant",
          content: acc,
          model: outcome.modelUsed ?? null,
          truncated: outcome.truncated === true,
        }),
      ]);
      revealLine();
      track(EV.aiResponseSuccess, { ...entryMeta, model: outcome.modelUsed, message_number: messageNumber, finish: outcome.truncated === true ? "length" : "stop" });
      trackMetaChatEngaged(config.locale);
    } else if (outcome.aborted) {
      // User pressed Stop: keep whatever was generated, never an error state.
      if (acc)
        persist([
          ...held,
          { role: "assistant", content: acc, model: answeringModel },
        ]);
      // Stopped before the first word, most likely to reword it (STOP-01).
      else giveBack();
      track(EV.generationStopped, { locale: config.locale, message_number: messageNumber });
    } else if (acc.trim()) {
      // Stream broke mid-answer — the partial text is still useful.
      persist([
        ...held,
        {
          role: "assistant",
          content: acc,
          model: answeringModel,
          partial: true,
        },
      ]);
      track(EV.aiResponseError, { code: outcome.code, message_number: messageNumber });
    } else {
      const friendly =
        outcome.code === "network" ? t.errorNetwork : t.errorGeneric;
      persist([...held, { role: "assistant", content: friendly, error: true }]);
      track(EV.aiResponseError, { code: outcome.code, message_number: messageNumber });
    }
    if (turnstileConfig?.required) {
      turnstileRef.current?.reset();
    }
    setBusy(false);
    setAccountRefresh((n) => n + 1);
    // Avoid stealing focus after the asynchronous challenge reset.
    if (
      !turnstileConfig?.required &&
      !window.matchMedia("(pointer: coarse)").matches
    )
      focusInput();
  };

  const onStop = () => {
    abortRef.current?.abort();
  };

  // Prompt chips always prefill the composer and focus — never auto-send.
  const onChipPick = (chip: PromptChip) => {
    if (busy || limitBlocked) return;
    setInput(chip.insert);
    track(EV.promptChipClicked, { chip_id: chip.id, locale: config.locale });
    focusInput();
  };

  const onTemplatePick = (template: PromptTemplate, prompt: string) => {
    if (sendDisabled) return;
    track(EV.templateUsed, { template_id: template.id, tool: template.tool });
    void doSend(prompt, { templateId: template.id, tool: template.tool });
  };

  const onRoleChange = (nextRole: RoleId) => {
    setRole(nextRole);
    track(EV.roleSelected, { role_id: nextRole, tool: activeTool });
  };

  const onToolChange = (tool: AiToolId) => {
    setActiveTool(tool);
    track(EV.toolOpened, { tool, from: "sidebar" });
  };
  // The business offer (chat-lead) shows only in the business tool and not
  // once closed for the day: fetch it while the visitor is there, before the
  // third answer calls for it.
  useEffect(() => {
    if (preloadsBusinessCard({ tool: activeTool, dismissed: offerDismissed })) leadPart.preload();
  }, [activeTool, offerDismissed]);

  const onImagePrompt = (prompt: string, presetId: string) => {
    if (sendDisabled) return;
    track(EV.imagePromptGenerated, { preset_id: presetId, tool: "images" });
    void doSend(prompt, { templateId: `image-${presetId}`, tool: "images" });
  };

  // A button under the last answer: its name goes into the bubble, and its
  // instruction with the answer (or its end) to the model (plan ACT-02).
  const onAsk = (action: AnswerAction, text: string, request: string, frame: Locale) => {
    void doSend(text, { answerAction: action, request, frame, tool: activeTool });
  };

  // "New chat": clears the visible conversation + stored history, but keeps
  // the server session and remaining quota — limits must survive a reset.
  const onNewChat = () => {
    if (busy || !accountReady) return;
    setSavedChats(archiveChat(messages, config.locale, storageScope));
    persist([]);
    // The limit card says the refused question waits in the composer: it does.
    if (!limited) setInput("");
    setBusinessLine(null);
    // A dismissed offer stays dismissed — "new chat" is not a fresh chance to
    // pitch the same person again; neither is the business line, which shows
    // once per browser session.
    track(EV.newChat, { status: "cleared" });
    focusInput();
  };

  // The last question again, in place of its answer or error: the thread and
  // the history sent hold it once (plan ACT-01). A new call of the model, so
  // it costs a message like any other.
  const lastQuestion = () => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return i;
    return -1;
  };
  const onRetry = () => {
    const idx = lastQuestion();
    if (sendDisabled || idx < 0) return;
    const { content, ask } = messages[idx];
    const prior = messages[idx + 1]?.role === "assistant" && !messages[idx + 1].error ? messages[idx + 1] : undefined;
    void doSend(content, { retry: true, base: messages.slice(0, idx), request: ask?.request, answerAction: ask?.action, frame: ask?.frame, prior });
  };
  // «‹ 1/2 ›»: another version of an answer is shown, and the thread goes on from it.
  const onVersion = (index: number, version: number) => {
    const m = messages[index];
    const shown = m?.versions?.[version];
    if (busy || !shown) return;
    persist(messages.map((x, i) => (i === index ? { ...x, ...shown, version } : x)));
  };
  // Under an error: the question back into the composer, out of the thread.
  const onEdit = () => {
    const idx = lastQuestion();
    if (busy || idx < 0) return;
    setInput(messages[idx].content);
    persist(messages.slice(0, idx));
    focusInput();
  };

  // Closing the business card or the business line closes both for the day:
  // one "no, thanks" to the studio's offer is enough.
  const onDismissOffer = () => {
    setBusinessLine(null);
    setOfferDismissed(true);
    saveOfferDismissed(config.locale, storageScope);
  };

  // Routing: the chatgpt.com line (in the menu since the chat design release)
  // and the switch to the Uzbek chat. Both carry a goal name and UI metadata only.
  const onOfficialClick = () => {
    reachYandexGoal(YANDEX_GOALS.officialChatgptClick);
    track(EV.officialLinkClicked, { surface: "menu" });
  };
  const onLocaleSwitch = (surface: "header" | "empty") => {
    reachYandexGoal(YANDEX_GOALS.chatLocaleSwitch);
    track(EV.localeSwitched, { from: "ru", surface });
  };
  // The text under the chat (the prerendered summary, #seo-summary): from the
  // resting screen and from the menu, which closes first so its scroll lock
  // does not hold the page (REV-5).
  const toSummary = (event: { preventDefault: () => void }) => {
    const summary = document.getElementById("seo-summary");
    if (!summary) return;
    event.preventDefault();
    setDrawerOpen(false);
    window.setTimeout(() => summary.scrollIntoView({ behavior: smooth() }), 60);
  };

  // Limit card only: a package that can really be bought leads; the Telegram
  // bot follows, or leads, while the server enables it (GPT_BOT_HANDOFF_ENABLED).
  const card =
    limit && limitCard(config.locale, limit, { billingAvailable, paid, botHandoff, remaining, pack: packTerms }, clock);
  // The card is short (map 01 M-03, M-12: 235px left no thread above an open
  // keyboard): its title, when a turn fits again and the one way on. Why,
  // the pack's value and the second way are behind «Batafsil», for this reason.
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const details = !!limit && detailsFor === limit.reason;
  const bodyShown = !!card && (!card.title || !card.wait);
  // «Batafsil» ends the card's last line of text instead of taking a 44px
  // row of its own (an inline link in a sentence).
  const moreButton = !!card && !!limit && (!bodyShown || !!card.offer || (card.account && !!card.bot)) && (
    <button
      type="button"
      className="gpt-text-button"
      // A 44px tap target in the line's own height: 12 + 19.5 + 13 px of
      // padding, taken back by the margins (an inline-block's margin box
      // sets the line), so the card does not grow.
      style={{ minHeight: 0, display: "inline-block", padding: "12px 0 13px 6px", margin: "-12px 0 -13px" }}
      aria-expanded={details}
      onClick={() => setDetailsFor(details ? null : limit.reason)}
    >
      {t.limitMore}
    </button>
  );
  // The slim bar under the wait: how much of the hour has passed (chat design §5.10).
  const waited = limit && limit.reason === "hourly" && limit.retryAt !== null && limit.retryAt > limit.since
    ? Math.min(1, Math.max(0, (clock - limit.since) / (limit.retryAt - limit.since)))
    : null;
  // The thread goes to the card when a limit is set (LimitScroll): it is the thread's last item.
  const limitSince = limit?.since ?? null;

  // The limit card: the last item of the thread, or in the tasks' place on
  // the resting screen (chat design §5.10). The composer keeps the refused
  // question and its send button shows a clock until the time the server
  // gave (F1–F3). Its exits: the pack window only while a pack can really be
  // bought, the Telegram bot only while the server says botHandoff, and never
  // a personal Telegram account (AiLimitTelegram). A retry button is gone:
  // the send button comes back when the limit lifts.
  const limitCardEl = limit && card && (
    <div
      id={LIMIT_CARD_ID}
      className="gpt-limit-card"
      role="status"
      data-testid="ai-limit-card"
      data-reason={limit.reason}
      data-ready={card.ready ? "true" : undefined}
    >
      {/* With the keyboard open, or on a screen 460px high, the card is this
          one line (REV-13): it left the thread no room. A screen reader
          still hears why. */}
      <p className="gpt-limit-short">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={CLOCK} /></svg>
        <span>
          <span className="sr-only">{card.title} {card.body} </span>
          {/* Not announced on every minute's tick; the line that replaces it once the limit lifts is. */}
          <span key={card.ready ? "ready" : "wait"} aria-live={card.ready ? undefined : "off"}>{card.short}</span>
          {moreButton && <> · {moreButton}</>}
        </span>
      </p>
      <div className="gpt-limit-full">
        {card.title && (
          <p className="gpt-limit-head">
            <span className="gpt-limit-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={card.ready ? TICK : CLOCK} /></svg>
            </span>
            {card.title}
          </p>
        )}
        {/* Without a title (a pack's cap, a busy server) the body is the card. */}
        {!card.title && (
          <p className="gpt-limit-body">
            {card.body}
            {card.wait ? null : moreButton}
          </p>
        )}
        {/* The wait, said once: the time, or the day's cap's own sentence. */}
        {(card.wait || card.title) && (
          // The countdown is not announced on every tick; the line that
          // replaces it once the limit lifts is.
          <p
            key={card.ready ? "ready" : "wait"}
            className="gpt-limit-wait"
            aria-live={card.ready ? undefined : "off"}
          >
            {card.wait ?? card.body}
            {moreButton}
          </p>
        )}
        {waited !== null && !card.ready && (
          <span className="gpt-limit-progress" aria-hidden="true"><span style={{ transform: `scaleX(${waited})` }} /></span>
        )}
        {/* Why, under «Batafsil»; the composer's aria-describedby points
            here, so a screen reader hears it though the eye sees the time. */}
        {!!card.title && !!card.wait && (bodyShown || details ? (
          <p className="gpt-limit-body">{card.body}</p>
        ) : (
          <span className="sr-only">{card.body}</span>
        ))}
        {card.offer && details && (
          <p className="gpt-limit-body" data-testid="limit-offer">
            {card.offer}
          </p>
        )}
        {(card.account || card.bot) && (
          <div className="gpt-limit-exits">
            {card.account && (
              <button
                type="button"
                className="gpt-primary"
                data-testid="limit-account"
                onClick={() => openAccount("limit_card")}
              >
                {card.cta}
              </button>
            )}
            {card.bot && (!card.account || details) && (
              // The lazy part chat-limit: only while the server
              // enables the bot; a route that cannot load is not shown.
              <LazyPart part={limitPart} fallback={null} failed={null}>
                {({ AiLimitTelegram }) => (
                  <AiLimitTelegram
                    t={t}
                    locale={config.locale}
                    apiBase={config.apiBase}
                    sessionId={sessionId}
                    reason={card.bot!}
                    variant={card.account ? "secondary" : "primary"}
                  />
                )}
              </LazyPart>
            )}
          </div>
        )}
        {/* Said only while the refused question is back in the composer. */}
        {!!input.trim() && (
          <p className="gpt-limit-draft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14m-6-6 6 6 6-6" /></svg>
            {t.limitDraftKept}
          </p>
        )}
      </div>
    </div>
  );

  const showOffer =
    activeTool === "business" &&
    assistantCount >= B2B_AFTER &&
    !offerDismissed &&
    !limit;
  // The tools behind the menu are the lazy part chat-tools; the frame stays,
  // so the screen keeps its place while the templates arrive.
  const tool = activeTool === "chat" ? null : activeTool;
  const toolPanel = tool && (
    <div className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
      <LazyPart
        part={toolsPart}
        fallback={<PartLoading label={t.partLoading} className="gpt-part-loading-tool" />}
        failed={<PartFailed message={t.partFailed} reload={t.partReload} />}
      >
        {({ AiToolPanel }) => (
          <AiToolPanel
            t={t}
            locale={config.locale}
            tool={tool}
            disabled={sendDisabled}
            onTemplatePick={onTemplatePick}
            onImagePrompt={onImagePrompt}
          />
        )}
      </LazyPart>
    </div>
  );

  // What premium.css lays out (chat design §2): the resting screen, a
  // conversation, or a limit that stands; and a phone's keyboard, open.
  const state = limitBlocked ? "limit" : resting ? "empty" : "chat";
  // The header's second line says one fact at a time (chat design §5.1): who
  // we are on the resting screen, the count in a conversation, the wait in a
  // limit (the clock first: the card says the rest), the pack's answers while
  // one is active. It is one line beside the language switch and «new chat»,
  // so a conversation says the honest line short until the server has counted,
  // and below 340px (premium.css) the resting screen does too.
  const usage = paid ? null : usageLine(remaining, hourShown, hourBlocked, t);
  const sub: { text: string; short?: string; tone?: string } = paid
    ? { text: t.premium.activeShort(remaining), tone: "pack" }
    : limitBlocked && card
      ? { text: card.header, tone: "warn" }
      : !resting && usage
        ? { text: usage.short, tone: usage.low ? "warn" : undefined }
        : resting
          ? { text: t.brandSub, short: t.brandSubShort }
          : { text: t.brandSubShort };
  // What a screen reader hears of it, when it changes: the count, or a pack's answers left.
  const srStatus = paid ? t.premium.activeLine(remaining) : usage?.text;

  return (
    // ym-hide-content: Webvisor is enabled on counter 111312750. Everything the
    // console renders is a prompt, an answer or a saved conversation title, so
    // the whole console is masked in the session recording.
    // colorScheme dark: the console is a dark surface whatever the OS theme is,
    // and without this the UA paints checkboxes, scrollbars and autofill in
    // light-mode colours on top of it.
    <div
      className="gpt-premium gpt-app ym-hide-content"
      style={{ colorScheme: "dark" }}
      data-testid="ai-console"
      data-state={state}
      data-keyboard={keyboard ? "open" : undefined}
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
        onAbout={toSummary}
        onOfficial={onOfficialClick}
      />

      <div className="gpt-main">
        {/* The app's header: opaque, one row; nothing of the page passes under it. */}
        <header className="gpt-header">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            onPointerDown={rolePart.preload}
            aria-label={t.menuOpen}
            className="gpt-header-button gpt-menu-button"
            data-testid="ai-menu-button"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="gpt-header-brand" data-testid="ai-header-brand">
            <BrandMark />
            <span className="gpt-brand-text">
              <span>{t.brand}</span>
              <span className="gpt-header-sub" data-tone={sub.tone} aria-hidden="true">
                {sub.short ? <><span className="gpt-sub-full">{sub.text}</span><span className="gpt-sub-short">{sub.short}</span></> : sub.text}
              </span>
            </span>
            {/* The count (or a pack's answers) for a screen reader, said when it changes. */}
            {srStatus && <span className="sr-only" role="status">{srStatus}</span>}
          </div>
          {/* The other language's chat, on every screen. On the Russian chat the
              word, not the code: most of its search impressions are Uzbek
              queries. Below 375px (390px while the pack button shows) the
              header has no room for it, so the code comes back and the resting
              screen's «O‘zbekcha sahifa →» carries the word (premium.css). */}
          {uzEntry ? (
            <a
              href="/uz/gpt-uzbek-tilida/"
              hrefLang="uz"
              lang="uz"
              data-testid="lang-uz"
              onClick={() => onLocaleSwitch("header")}
              className="gpt-header-button gpt-lang-switch min-h-11 min-w-11"
            >
              <span className="gpt-lang-full">{uzEntry.nav}</span>
              <span className="gpt-lang-short">UZ</span>
            </a>
          ) : (
            <a
              href="/ru/gpt-chat/"
              hrefLang="ru"
              lang="ru"
              data-testid="lang-ru"
              className="gpt-header-button gpt-lang-switch min-h-11 min-w-11"
            >
              RU
            </a>
          )}
          <AiAccountPanel
            t={t}
            locale={config.locale}
            apiBase={config.apiBase}
            onAccount={onAccount}
            refreshKey={accountRefresh}
            openRequest={accountOpen}
            remaining={remaining}
            limited={limited}
            onLeave={keepDraft}
          />
          {!empty && (
            <button
              type="button"
              onClick={onNewChat}
              disabled={busy}
              aria-label={t.newChat}
              title={t.newChat}
              className="gpt-header-button gpt-new-chat"
              data-testid="ai-header-new-chat"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
              </svg>
            </button>
          )}
        </header>

        {/* Off the resting screen the H1 stays in the page for readers of the
            outline, out of sight. */}
        {h1 && !resting && <h1 className="sr-only">{h1}</h1>}
        <MessageScrollerProvider key={rest.key} autoScroll={!empty} defaultScrollPosition={empty ? "start" : "end"}>
          <LimitScroll since={resting ? null : limitSince} keyboard={keyboard} />
        <MessageScroller className="gpt-thread-scroll">
        <MessageScrollerViewport className="gpt-viewport" aria-label={uz ? "Suhbat" : "Переписка"}>
          <div className="gpt-column">
            {!!savedChats.length && (
              <details className="gpt-history">
                <summary>
                  {t.premium.savedChats} · {savedChats.length}
                </summary>
                {savedChats.map((chat) => (
                  <button
                    type="button"
                    key={chat.id}
                    disabled={busy}
                    onClick={() => {
                      setSavedChats(archiveChat(messages, config.locale, storageScope));
                      persist(chat.messages);
                      setInput("");
                      setBusinessLine(null);
                    }}
                  >
                    {chat.title}
                  </button>
                ))}
                <p className="gpt-panel-note">{t.premium.historyNote}</p>
              </details>
            )}
            {toolPanel}
            {resting ? (
              // The resting screen is the first thing ~89% of this site's search
              // traffic sees: one idea per block (chat design §5.2). The H1 as a
              // kicker, a two-line greeting, the terms with the server's daily
              // and hourly allowance, four tasks and the link to the text under
              // the chat. On a tall phone the greeting centres in the free space
              // and the tasks sit above the composer, in the thumb's reach.
              <div className="gpt-empty">
                <div className="gpt-hello">
                  {h1 && <h1 className="gpt-kicker" data-testid="chat-h1">{h1}</h1>}
                  {/* One block of text, as the frame draws it before the chat
                      mounts (premium.css): the largest text of the first
                      screen is there from the first paint. */}
                  <p className="gpt-greet">
                    {t.premium.welcome}
                    <br />
                    <span>{t.premium.welcomeAccent}</span>
                  </p>
                  <p className="gpt-meta">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={TICK} /></svg>
                    <span>{paid ? t.premium.manual : t.emptyMeta(freeLimits)}</span>
                  </p>
                </div>
                {/* A returning visitor whose hour is spent: the card in the tasks' place. */}
                {limitCardEl || (
                  <AiPromptChips
                    chips={t.chips}
                    onPick={onChipPick}
                    disabled={busy || limitBlocked}
                    label={t.emptyPrompt}
                  />
                )}
                <p className="gpt-empty-links">
                  <a href="#seo-summary" onClick={toSummary}>{t.aboutChat}</a>
                  {uzEntry && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <a
                        href="/uz/gpt-uzbek-tilida/"
                        hrefLang="uz"
                        lang="uz"
                        data-testid="gpt-uz-entry"
                        onClick={() => onLocaleSwitch("empty")}
                      >
                        {uzEntry.page}
                      </a>
                    </>
                  )}
                </p>
              </div>
            ) : (
              <AiChatMessageList
                messages={messages}
                t={t}
                locale={config.locale}
                busy={busy}
                locked={sendDisabled}
                costNote={costNote}
                onRetry={onRetry}
                onEdit={onEdit}
                onAsk={onAsk}
                onVersion={onVersion}
              >
                {/* The business line: under the first answer to a question about a
                    bot, a site, ads or a CRM, once per browser session (WP-20). */}
                {businessLine && !limit && activeTool !== "business" && (
                  // The lazy part chat-lead; a line that cannot load is not shown.
                  <LazyPart part={leadPart} fallback={null} failed={null}>
                    {({ AiBusinessLine }) => (
                      <AiBusinessLine
                        t={t}
                        locale={config.locale}
                        apiBase={config.apiBase}
                        sessionId={sessionId}
                        topic={businessLine.topic}
                        open={businessLine.open}
                        onOpen={() => setBusinessLine((line) => line && { ...line, open: true })}
                        onDismiss={onDismissOffer}
                      />
                    )}
                  </LazyPart>
                )}
                {/* Stage 2 of the funnel: one offer, after the chat has already
                    been useful, closable and gone for the day once closed. */}
                {showOffer && (
                  // The lazy part chat-lead; a card that cannot load is not shown.
                  <LazyPart part={leadPart} fallback={null} failed={null}>
                    {({ AiOfferCard }) => (
                      <AiOfferCard
                        t={t}
                        locale={config.locale}
                        apiBase={config.apiBase}
                        sessionId={sessionId}
                        onDismiss={onDismissOffer}
                      />
                    )}
                  </LazyPart>
                )}
                {!paid &&
                  billingAvailable &&
                  !limit &&
                  assistantCount >= 10 &&
                  remaining > 2 && (
                    <div className="gpt-notice">
                      <p>{t.premium.offer}</p>
                      <button
                        type="button"
                        className="gpt-text-button"
                        onClick={() => openAccount("after_10")}
                      >
                        {t.premium.account}
                      </button>
                    </div>
                  )}
                {/* The free allowance running low, at the end of the thread: one
                    saffron line, the one warm colour of this palette, the same one
                    the header's count turns. */}
                {!limit && !paid && remaining >= 0 && remaining <= DAY_WARNING_AT && (
                  <div className="gpt-low-line" role="status">
                    <span>{t.lowWarning(remaining)}</span>
                    {/* The pack only while it can really be bought (F6). */}
                    {billingAvailable && (
                      <button
                        type="button"
                        onClick={() => openAccount("low_limit")}
                        className="gpt-text-button"
                      >
                        {t.premium.account}
                      </button>
                    )}
                  </div>
                )}
                {!limit && !paid && !(remaining >= 0 && remaining <= DAY_WARNING_AT) &&
                  hourShown !== null && hourShown > 0 && hourShown <= HOUR_WARNING_AT && (
                  // The hourly cap is the one people meet (about twice a day):
                  // said before the refusal, in the same quiet line.
                  <div className="gpt-low-line" role="status" data-testid="ai-hour-warning">
                    <span>{t.hourWarning(hourShown)}</span>
                  </div>
                )}
                {limitCardEl}
              </AiChatMessageList>
            )}
          </div>
        </MessageScrollerViewport>
        <MessageScrollerButton behavior={smooth()} className="gpt-jump-latest" aria-label={uz ? 'Oxirgi xabarga' : 'К последнему сообщению'}>
          <ArrowDown data-icon="inline-start" />
        </MessageScrollerButton>
        </MessageScroller>
        </MessageScrollerProvider>

        {/* The composer: in the app's column, on an opaque surface. The thread
            ends at its top edge, so no text passes under it (chat design §0). */}
        <div className="gpt-composer">
          <div className="gpt-composer-inner">
            {/* A guest's button only reads the account again; an account's opens its window too. */}
            {accountState === "unknown" && <p role="status" className="gpt-dock-note">{t.premium.accountUnstable} <button type="button" className="gpt-text-button" onClick={() => { if (signedIn) openAccount("account_check"); setAccountRefresh(n => n + 1); }}>{t.premium.recheck}</button></p>}
            {turnstileKey && (
              // The lazy part chat-turnstile: only a page whose server asks
              // for the check downloads it. Sending waits for its token.
              <LazyPart
                part={turnstilePart}
                fallback={<p className="gpt-dock-note" role="status">{t.turnstileLoading}</p>}
                failed={<p className="gpt-dock-note" data-tone="error" role="status">{t.turnstileError}</p>}
              >
                {({ TurnstileChallenge }) => (
                  <TurnstileChallenge
                    ref={turnstileRef}
                    siteKey={turnstileKey}
                    loadingText={t.turnstileLoading}
                    promptText={t.turnstilePrompt}
                    verifiedText={t.turnstileVerified}
                    errorText={t.turnstileError}
                    onTokenChange={onTurnstileTokenChange}
                  />
                )}
              </LazyPart>
            )}
            {turnstileConfigError && (
              <p className="gpt-dock-note" data-tone="error" role="status" aria-live="polite">
                {t.turnstileError}
              </p>
            )}
            {turnstileServerError && (
              <p className="gpt-dock-note" data-tone="error" role="alert">
                {turnstileServerError}
              </p>
            )}
            {entry && <div className="gpt-entry-context"><a href={chatEntryArticleHref(entry)}>{entry.locale === 'ru' ? '← Вернуться к статье' : '← Maqolaga qaytish'}</a><span>{entry.locale === 'ru' ? 'Измените вопрос и отправьте' : 'Savolni tahrirlab yuboring'}</span></div>}
            <AiChatInput
              value={input}
              onChange={setInput}
              onSend={() => doSend(input)}
              onStop={onStop}
              disabled={sendDisabled}
              busy={busy}
              limited={limitBlocked}
              maxChars={MAX_INPUT - maxRolePrefixLength(role)}
              t={t}
              inputRef={inputRef}
              describedBy={limit ? LIMIT_CARD_ID : undefined}
              placeholder={resting && wide ? t.inputExample : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
