import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';
import type { Locale } from "../types";
import type { ChatStrings } from "../i18n";
import { showsAccountPill, type AccountView } from "../types";
import { useAccount } from "../use-account";
import { accountPart, LazyPart, PartFailed, PartLoading } from "../lazy-part";
import { preloadsAccountWindow } from "../preload";
import type { AccountWindowMemory } from "./AiAccountWindow";
import { track, EV } from "../analytics";
import { loadBotLogin } from "../bot-login";
export type { AccountView } from "../types";

/** Which button opened the window: the GA4 `from` of `pack_viewed`. */
export type PackFrom = "header" | "limit_card" | "low_limit" | "after_10" | "account_check" | "login_failed" | "login_resume";
/** Ask the panel to open; a new `seq` is a new request. */
export interface PackOpenRequest {
  seq: number;
  from: PackFrom;
}

/**
 * The header pill and the pack window's frame. The account data (use-account.ts)
 * and this frame are on the chat's start bundle; the window's body is the lazy
 * part chat-account, fetched ahead of time when someone is about to need it.
 */
export function AiAccountPanel({
  t,
  locale,
  apiBase,
  onAccount,
  refreshKey,
  openRequest,
  remaining,
  limited,
}: {
  t: ChatStrings;
  locale: Locale;
  apiBase: string;
  onAccount: (account: AccountView | null) => void;
  refreshKey: number;
  openRequest?: PackOpenRequest;
  /** Free messages or pack answers left; -1 while unknown. */
  remaining: number;
  /** The server refused a turn and the limit stands. */
  limited: boolean;
}) {
  const account = useAccount(apiBase, onAccount, refreshKey);
  const { data } = account;
  const [open, setOpen] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const windowMemory = useRef<AccountWindowMemory>({ requestKeys: {}, refusedForTerms: null });
  const [payReturn] = useState(() => new URLSearchParams(window.location.search).get("pay") === "return");
  // One pack_viewed per opening, with the button that opened it.
  const openPack = useCallback((from: PackFrom) => {
    setOpen(true);
    track(EV.packViewed, { from, locale });
  }, [locale]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("login") === "failed") {
      setLoginFailed(true);
      track(EV.loginResult, { method: "telegram", status: "failed", locale });
      openPack("login_failed");
      url.searchParams.delete("login");
      window.history.replaceState(null, "", url.href);
    }
  }, [locale, openPack]);
  useEffect(() => {
    if (openRequest) openPack(openRequest.from);
  }, [openRequest, openPack]);
  // A sign-in through the bot this tab started is still running (the phone
  // may have reloaded the tab while Telegram was in front): back to it.
  useEffect(() => {
    if (loadBotLogin()) openPack("login_resume");
  }, [openPack]);
  const reachable = showsAccountPill(data);
  const paymentPending = !!data?.payment && ["pending", "prepared"].includes(data.payment.state);
  useEffect(() => {
    if (preloadsAccountWindow({ reachable, remaining, limited, payReturn, paymentPending })) accountPart.preload();
  }, [reachable, remaining, limited, payReturn, paymentPending]);
  const close = () => setOpen(false);
  return (
    // Opening goes through openPack (the pill, a request from the chat, a
    // failed login), so the Dialog itself only ever closes.
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      {reachable && (
        <DialogTrigger asChild>
        <Button variant="secondary"
          type="button"
          className="gpt-account-trigger"
          onClick={() => openPack("header")}
          data-testid="ai-account-trigger"
        >
          <Sparkles data-icon="inline-start" />
          <span className="gpt-account-label">{data?.access ? t.premium.accountActive : t.premium.account}</span>
        </Button>
        </DialogTrigger>
      )}
      <DialogContent
        showCloseButton={false}
        className="gpt-account-dialog ym-hide-content"
      >
        <div className="gpt-panel-top">
          <Badge variant="secondary"><Sparkles data-icon="inline-start" /> {t.brand}</Badge>
          <Button variant="ghost" size="icon-lg"
            type="button"
            className="gpt-icon-button"
            onClick={close}
            aria-label={t.premium.close}
          >
            <X data-icon="inline-start" />
          </Button>
        </div>
        <LazyPart
          part={accountPart}
          fallback={<><DialogTitle>{t.premium.account}</DialogTitle><PartLoading label={t.partLoading} className="gpt-part-loading-window" /></>}
          failed={<><DialogTitle>{t.premium.account}</DialogTitle><PartFailed message={t.partFailed} reload={t.partReload} /></>}
        >
          {({ AiAccountWindow }) => (
            <AiAccountWindow t={t} locale={locale} apiBase={apiBase} account={account} memoryRef={windowMemory} loginFailed={loginFailed} />
          )}
        </LazyPart>
      </DialogContent>
    </Dialog>
  );
}
