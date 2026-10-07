import type { ChatStrings } from '../i18n';
import type { PackTerms, PaymentProvider } from '../types';

/** The providers' own names, in every language (also account/AccountDialog.tsx). */
const PROVIDER_NAMES: Record<PaymentProvider, string> = { click: 'Click', uzum: 'Uzum Bank', payme: 'Payme' };

/**
 * The pack on the limit card, paid in one tap (owner's order of 07.10): the
 * price and the pack's facts in one line, one big button per provider the
 * visitor may pay with (types.ts offeredProviders) and, under them, that
 * pressing «Оплатить» accepts the offer, one link away. A tap opens the pack
 * window with that provider: its lazy part creates the order and leaves for
 * the provider's page (AccountDialog autoPay), so no second screen, no box.
 * Without a provider to go to, or without the offer's link to accept, the
 * window's own button as before.
 */
export function AiLimitPay({
  t,
  pack,
  again,
  providers,
  termsUrl,
  onPay,
  onOpen,
}: {
  t: ChatStrings;
  pack: PackTerms;
  /** A spent pack: the button says a new one. */
  again: boolean;
  providers: PaymentProvider[];
  termsUrl: string | null;
  onPay: (provider: PaymentProvider) => void;
  onOpen: () => void;
}) {
  if (!providers.length || !termsUrl)
    return (
      <button type="button" className="gpt-primary" data-testid="limit-account" onClick={onOpen}>
        {t.limitBuy(pack, again)}
      </button>
    );
  const accept = t.premium.acceptByPay;
  return (
    <>
      <p className="gpt-limit-pay-line"><strong>{t.premium.sum(pack.priceUzs)}</strong> · {t.premium.packLine(pack)}</p>
      {providers.map((provider) => (
        <button type="button" className="gpt-primary" key={provider} data-testid="limit-pay" data-provider={provider} onClick={() => onPay(provider)}>
          {t.premium.payVia(PROVIDER_NAMES[provider])}<span aria-hidden="true">↗</span>
        </button>
      ))}
      <p className="gpt-limit-accept">
        {accept.before}<a href={termsUrl} target="_blank" rel="noopener noreferrer">{accept.link}</a>{accept.after}
      </p>
    </>
  );
}
