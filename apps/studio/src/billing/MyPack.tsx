/** @jsxRuntime automatic @jsxImportSource react */
/**
 * «Mening paketim» / «Мой пакет» (spec §6 /me, DECISIONS §6(в), §8).
 *
 * What the browser's studio account holds: each running tariff with its end
 * (Tashkent time) and what is left, the newest order with its number and
 * state («To‘lov raqamini saqlang»: support restores a lost tariff by it),
 * and the links of printed receipts.
 *
 * It never asks the server on page load. It shows whatever /me any billing
 * part of the page read (runtime.ts watchMe): after a checkout, after the
 * page after payment, after a tariff section. A browser that bought here
 * before (a localStorage mark, flow.ts rememberPack) gets one button that
 * reads /me when pressed. Its first render is empty, as in the static page,
 * so hydration never differs.
 */
import { useEffect, useId, useState } from 'react';
import type { StudioLocale, StudioMe } from '../api';
import { packOf, packRemembered } from './flow';
import { billingRuntime, watchMe, type BillingRuntime } from './runtime';
import { BILLING_TEXTS, tashkentDateTime } from './texts';

export interface MyPackProps {
  readonly locale: StudioLocale;
  /** Tests pass their own. */
  readonly runtime?: BillingRuntime;
  /** Tests pass a /me answer to render directly. */
  readonly initial?: StudioMe | null;
}

const BOX = 'ym-hide-content st:mt-4 st:rounded-2xl st:border st:border-studio-line st:bg-studio-elevated st:p-4 st:text-sm st:text-studio-text';
const LINE = 'st:text-sm st:leading-snug st:text-studio-muted';

/** The pack panel for one /me answer; null when it holds nothing to show. */
export function PackPanel({ locale, me }: { readonly locale: StudioLocale; readonly me: StudioMe | null }) {
  const texts = BILLING_TEXTS[locale];
  const id = useId();
  const { running, latest } = packOf(me);
  const receipts = me?.receipts ?? [];
  if (!me?.account) return null;
  if (!running.length && !latest) {
    return (
      <section className={BOX} aria-labelledby={`${id}-pack`} data-studio-pack="empty">
        <h2 id={`${id}-pack`} className="st:text-base st:font-semibold">
          {texts.myPack}
        </h2>
        <p className={`st:mt-1 ${LINE}`}>{texts.myPackEmpty}</p>
      </section>
    );
  }
  return (
    <section className={BOX} aria-labelledby={`${id}-pack`} data-studio-pack="">
      <h2 id={`${id}-pack`} className="st:text-base st:font-semibold">
        {texts.myPack}
      </h2>
      {running.length ? (
        <ul className="st:mt-2 st:space-y-2">
          {running.map((tariff) => (
            <li key={tariff.id} data-studio-entitlement={tariff.plan}>
              <p>
                {texts.planName[tariff.plan]} — {texts.until(tashkentDateTime(tariff.endsAt))}
              </p>
              <p className={LINE}>{texts.left(tariff.presentationsLeft, tariff.photosLeft, tariff.photosLimit > 0)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`st:mt-1 ${LINE}`}>{texts.myPackEmpty}</p>
      )}
      {latest ? (
        <div className="st:mt-3 st:space-y-1" data-studio-latest-order={latest.state}>
          <p>
            {texts.orderNumber}: <span className="st:font-mono st:select-all">{latest.id}</span> · {texts.orderState[latest.state]}
          </p>
          {latest.paymentNumber ? (
            <p>
              {texts.paymentNumber}: <span className="st:font-mono st:select-all">{latest.paymentNumber}</span>
            </p>
          ) : null}
          {latest.state === 'paid' ? <p className={LINE}>{texts.keepNumber}</p> : null}
        </div>
      ) : null}
      {receipts.length ? (
        <p className="st:mt-2 st:space-x-3">
          {receipts.map((receipt) => (
            <a key={`${receipt.orderId}-${receipt.kind}`} className="st:text-studio-cyan st:underline" href={receipt.url} target="_blank" rel="noopener noreferrer">
              {texts.receipt}
              {receipt.kind === 'CANCEL' ? ' ↩' : ''}
            </a>
          ))}
        </p>
      ) : null}
    </section>
  );
}

export function MyPack({ locale, runtime, initial = null }: MyPackProps) {
  const texts = BILLING_TEXTS[locale];
  const [me, setMe] = useState<StudioMe | null>(initial);
  const [hinted, setHinted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHinted(packRemembered());
    return watchMe(setMe);
  }, []);

  const show = async () => {
    const { session } = runtime ?? billingRuntime();
    setLoading(true);
    session.refreshMe();
    const result = await session.me();
    setLoading(false);
    if (result.ok) setMe(result.data);
  };

  if (me?.account) return <PackPanel locale={locale} me={me} />;
  if (!hinted) return null;
  return (
    <div className="st:mt-4">
      <button
        type="button"
        className="st:rounded-xl st:border st:border-studio-line st:bg-studio-bg st:px-3 st:py-2 st:text-sm st:text-studio-text st:disabled:opacity-60"
        onClick={() => void show()}
        disabled={loading}
        data-studio-pack-button=""
      >
        {texts.myPackShow}
      </button>
    </div>
  );
}
