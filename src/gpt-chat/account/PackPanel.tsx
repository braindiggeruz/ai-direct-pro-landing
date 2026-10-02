import { useState, type ReactNode } from "react";
import type { AccountView, PackTerms } from "../types";
import type { AccountStrings } from "../account-strings";
import { safeAccountLink } from "../types";
import { STUDIO_EMAIL, STUDIO_PHONE, STUDIO_PHONE_DISPLAY } from "../../shared/studio-contact";

type Access = NonNullable<AccountView["access"]>;

/** The running pack: "120 / 300", today's room under the day cap, until when. */
export function AccessSummary({
  copy,
  access,
  pack,
  date,
}: {
  copy: AccountStrings;
  access: Access;
  pack: PackTerms | undefined;
  date: (at: number) => string;
}) {
  const size = access.message_limit ?? pack?.messageLimit;
  return (
    <div className="gpt-access-summary">
      <strong>
        {access.remaining}
        {size !== undefined && <span className="gpt-access-size"> / {size}</span>}
      </strong>
      <span>{copy.remaining}</span>
      {pack && access.dayRemaining !== undefined && <p>{copy.today(access.dayRemaining, pack.dailyLimit)}</p>}
      <p>{copy.until(date(access.ends_at))}</p>
      {access.renewSoon && <p>{copy.renew}</p>}
    </div>
  );
}

/**
 * Where payment and refund questions go: the studio's e-mail and phone from
 * content/global/site.json (src/shared/studio-contact.ts), the one place
 * every page reads them from. Never a personal Telegram (decision L14).
 */
export function SupportLine({ copy }: { copy: AccountStrings }) {
  return (
    <p className="gpt-panel-note" data-testid="ai-pack-support">
      {copy.supportLabel} <a href={`mailto:${STUDIO_EMAIL}`}>{STUDIO_EMAIL}</a>
      {", "}
      <a href={`tel:${STUDIO_PHONE}`}>{STUDIO_PHONE_DISPLAY}</a>
    </p>
  );
}

/**
 * «Paketim» (plan WP-17, map 03 §3.6), the signed-in part of the pack window:
 * the running pack or what is left of the free day, the pay step (children),
 * fiscal receipts (ofd.soliq.uz and Uzum hosts only), refund requests with a
 * confirmation, where to ask, and sign-out.
 */
export function PackPanel({
  copy,
  data,
  busy,
  date,
  onRefund,
  onLogout,
  children,
}: {
  copy: AccountStrings;
  data: AccountView;
  busy: boolean;
  date: (at: number) => string;
  onRefund: (orderId: string) => Promise<void>;
  onLogout: () => void;
  children: ReactNode;
}) {
  // The pack whose refund waits for a second press.
  const [confirming, setConfirming] = useState<string | null>(null);
  const receipts = (data.receipts ?? []).flatMap((receipt) => {
    const href = safeAccountLink(receipt.receipt_url);
    return href ? [{ kind: receipt.kind, href }] : [];
  });
  return (
    <>
      {data.access ? (
        <AccessSummary copy={copy} access={data.access} pack={data.pack} date={date} />
      ) : (
        <p className="gpt-panel-note" data-testid="ai-pack-none">
          {copy.noPack}
          {data.remaining !== undefined && ` ${copy.freeLeft(data.remaining)}`}
        </p>
      )}
      {children}
      {receipts.map((receipt) => (
        <a key={receipt.href} className="gpt-text-button" href={receipt.href} target="_blank" rel="noopener noreferrer">
          {receipt.kind === "CANCEL" ? copy.refundReceipt : copy.receipt}
        </a>
      ))}
      {data.refundable?.map((period) =>
        period.refund_requested_at ? (
          <p key={period.order_id} className="gpt-panel-note" role="status">
            {copy.refundPending} · {date(period.starts_at)}
          </p>
        ) : confirming === period.order_id ? (
          <div key={period.order_id} className="gpt-refund-confirm" role="group">
            <p>{copy.refundConfirm(date(period.starts_at))}</p>
            <button
              type="button"
              className="gpt-primary"
              disabled={busy}
              onClick={() => void onRefund(period.order_id).finally(() => setConfirming(null))}
            >
              {copy.refundYes}
            </button>
            <button type="button" className="gpt-text-button" disabled={busy} onClick={() => setConfirming(null)}>
              {copy.refundNo}
            </button>
          </div>
        ) : (
          <button
            key={period.order_id}
            type="button"
            className="gpt-text-button"
            disabled={busy}
            onClick={() => setConfirming(period.order_id)}
          >
            {copy.refund} · {date(period.starts_at)}
          </button>
        ),
      )}
      <SupportLine copy={copy} />
      <button type="button" className="gpt-text-button" disabled={busy} onClick={onLogout}>
        {copy.logout}
      </button>
    </>
  );
}
