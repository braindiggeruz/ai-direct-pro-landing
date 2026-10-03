import type { ReactNode } from "react";
import type { AccountView, PackTerms } from "../types";
import type { AccountStrings } from "../account-strings";
import { safeAccountLink } from "../types";
import { STUDIO_EMAIL, STUDIO_PHONE, STUDIO_PHONE_DISPLAY } from "../../shared/studio-contact";

type Access = NonNullable<AccountView["access"]>;

/**
 * The running packs: "120 / 300", today's room under the day cap, until
 * when. Packs bought early run side by side: the answers of all of them
 * ("420 / 600"), the latest end, and which pack turns draw from first.
 */
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
  const packs = access.packs ?? 1;
  const size = access.totalLimit ?? access.message_limit ?? pack?.messageLimit;
  return (
    <div className="gpt-access-summary">
      <strong>
        {access.remaining}
        {size !== undefined && <span className="gpt-access-size"> / {size}</span>}
      </strong>
      <span>{packs > 1 ? copy.remainingPacks(packs) : copy.remaining}</span>
      {pack && access.dayRemaining !== undefined && <p>{copy.today(access.dayRemaining, pack.dailyLimit)}</p>}
      <p>{copy.until(date(access.paidThrough ?? access.ends_at))}</p>
      {packs > 1 && access.firstRemaining !== undefined && <p>{copy.firstPack(access.firstRemaining, date(access.ends_at))}</p>}
      {access.renewSoon && <p>{copy.renew}</p>}
    </div>
  );
}

/**
 * Where a payment problem goes (money taken twice, or a payment that started
 * no pack: the offer, section 8): the studio's e-mail and phone from
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
 * the running packs or what is left of the free day, the pay step (children),
 * fiscal receipts (ofd.soliq.uz and Uzum hosts only), where a payment problem
 * goes, and sign-out. A paid pack is not refundable (the offer, section 8,
 * WP-25): there is no refund request here. Money taken by mistake is
 * returned by the Seller, and its refund receipt shows up with the others.
 */
export function PackPanel({
  copy,
  data,
  busy,
  date,
  onLogout,
  children,
}: {
  copy: AccountStrings;
  data: AccountView;
  busy: boolean;
  date: (at: number) => string;
  onLogout: () => void;
  children: ReactNode;
}) {
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
      <SupportLine copy={copy} />
      <button type="button" className="gpt-text-button" disabled={busy} onClick={onLogout}>
        {copy.logout}
      </button>
    </>
  );
}
