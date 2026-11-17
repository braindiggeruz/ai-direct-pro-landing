// What lazy part chat-pay (parts/chat-pay.ts) draws around the payment (chat CRO
// 2026-11-17), fetched from inside the window (account/pay-part.tsx) so the
// start bundle and the window's own part stay small.
//   P1  the checkout steps counted between the tap and the provider's page
//       (payEvent): a closed provider, a time bucket and a coarse client class
//       the browser works out for itself, never the user agent, an order or text;
//   P2  a message with a retry where the flow used to stop in silence (PayStall);
//   P4  «Попросить оплатить»: the payment link to send to someone else
//       (PayExtras opens it, PayShare shows it), and the return page that cannot
//       see the order's holder (PayHolderless);
//   P5  «Оплата не завершена»: one compact card with three ways on (PayUnpaid);
//   P6  one line on what happens next and the price of one answer (PayExtras);
//   P7  (roadmap №2, 17.11.2026) the question typed at the trial's wall, quoted
//       above the pay buttons (WallQuestion), and the seller's legal name as a
//       provider's page may show it (PayExtras).
// Every number comes from the account view; the only one written here is the
// order's life, PAYMENT_TTL_MS of functions/lib/gpt-chat/billing-config.ts
// (tests/gpt-pay-cro.test.ts keeps the two equal).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { Locale, PackTerms, PaymentProvider } from '../types';
import { recordUiEvent } from '../ui-events';
import { STUDIO_TELEGRAM_URL } from '../../shared/studio-contact';
// A named JSON import: the bundle keeps the seller's short name, not the requisites.
import { shortName } from '../../../content/global/legal-entity.json';
import { perAnswer, type PackOffer, type PackSku } from '../pack-offers';
import { packText } from '../pack-text';
import {
  ABORT_REASONS,
  type AbortReason,
  type CheckoutApp,
  type CheckoutBucket,
  type CheckoutOs,
  type CheckoutProvider,
  type ReturnOutcome,
} from '../../shared/checkout-events';
// The part's own styles come with it, as a separate request that fails quietly.
void import('./pay.css').catch(() => undefined);

/** An order is open this long after it was made (billing-config.ts PAYMENT_TTL_MS). */
export const ORDER_LIFETIME_MS = 43_200_000;
/** The visitor's tap on the survey's «Попросить оплатить» leaves this for the window (sessionStorage, one tab). */
export const ASK_KEY = 'gptchat_ask';

// ---------------------------------------------------------------- P1: events

/** In-app browser and system, from the user agent, as two words from closed lists. The user agent itself goes nowhere. */
export function clientClass(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent || '',
  touch: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints || 0,
  hasTelegram: boolean = typeof window !== 'undefined' && 'TelegramWebviewProxy' in window,
): { app: CheckoutApp; os: CheckoutOs } {
  const app: CheckoutApp = /Instagram/i.test(ua)
    ? 'instagram'
    : /FBAN|FBAV|FB_IAB|FBIOS/.test(ua)
      ? 'facebook'
      : /YaBrowser|YaApp_|YaSearchBrowser/.test(ua)
        ? 'yandex'
        : /Telegram/i.test(ua) || hasTelegram
          ? 'telegram'
          : 'none';
  const os: CheckoutOs = /Android/i.test(ua)
    ? 'android'
    : /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1)
      ? 'ios'
      : 'desktop';
  return { app, os };
}

/** Under 1 s, 1–3 s, 3–8 s, over 8 s. */
export function elapsedBucket(ms: number): CheckoutBucket {
  return ms < 1_000 ? 'lt1' : ms < 3_000 ? 's1_3' : ms < 8_000 ? 's3_8' : 'gt8';
}

/** A refusal's code as one word of the closed list. */
export function abortReason(code: string): AbortReason {
  if ((ABORT_REASONS as readonly string[]).includes(code)) return code as AbortReason;
  if (code === 'checkout_unavailable' || code === 'store_unavailable' || code === 'not_found') return 'unavailable';
  return 'other';
}

type Step = 'checkout_created' | 'checkout_probe_failed' | 'checkout_redirect' | 'checkout_aborted' | 'checkout_return_unpaid';

/**
 * Count one checkout step: provider, the time since `since` (epoch ms) as a
 * bucket, and the client class; `lead` is the reason of an abort or the
 * outcome of an unpaid return. Fire and forget, with keepalive, so a step
 * sent just before the browser leaves still arrives (recordUiEvent).
 */
export function payEvent(
  apiBase: string,
  type: Step,
  provider: PaymentProvider | null,
  since: number,
  lead?: AbortReason | ReturnOutcome,
): void {
  const { app, os } = clientClass();
  const named = provider ?? 'unknown';
  // The server's lists decide: a provider unknown to a step that cannot be unknown is refused there.
  const tail = `${named}.${elapsedBucket(Math.max(0, Date.now() - since))}.${app}.${os}`;
  recordUiEvent(apiBase, type as 'checkout_created', (lead ? `${lead}.${tail}` : tail) as `${CheckoutProvider}.${CheckoutBucket}.${CheckoutApp}.${CheckoutOs}`);
}

// ---------------------------------------------------------------- copy

const NAMES: Record<PaymentProvider, string> = { click: 'Click', payme: 'Payme', uzum: 'Uzum Bank' };
/** Groups of thousands as the window writes them (account-strings.ts groupDigits): «20 000». */
const sumOf = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export const TEXT = {
  ru: {
    retry: 'Повторить',
    stallOpen: (name: string) => `Страница ${name} не открылась. Деньги не списаны, повтор не создаёт второй счёт.`,
    stallFailed: (name: string) => `Не получилось создать оплату через ${name}. Деньги не списаны. Попробуйте ещё раз.`,
    next: (names: string) => `Карту вводите на странице ${names}: к нам она не попадает.`,
    seller: (name: string) => `Продавцом там может быть указано ${name} — это компания GPTBot.uz.`,
    saved: 'Ваш вопрос сохранён на час: ',
    savedThen: ' После оплаты вернитесь в чат и отправьте его.',
    per: (n: number) => `≈ ${n} сум за ответ`,
    ask: 'Попросить оплатить',
    askLink: 'Нет карты? Попросить оплатить',
    dismiss: 'Закрыть',
    askHint: 'Создадим ссылку на оплату, платить по ней может другой человек.',
    askFor: (name: string) => `Ссылка для ${name}`,
    accept: 'Создавая ссылку, вы принимаете ',
    offer: 'оферту',
    shareTitle: 'Попросить оплатить',
    shareLead: (name: string, sum: string) => `Отправьте ссылку тому, кто оплатит ${sum} сум на странице ${name}.`,
    tg: 'Отправить в Telegram',
    shareText: (sum: string) => `Помогите оплатить AI-пакет GPTBot.uz (${sum} сум):`,
    copy: 'Скопировать ссылку',
    copied: 'Ссылка скопирована',
    link: 'Ссылка на оплату',
    here: 'Пакет включится в ЭТОМ браузере после оплаты. Чат проверит это сам: ничего нажимать не нужно, только не очищайте данные сайта.',
    life: 'Ссылка действует 12 часов с создания.',
    expiredTitle: 'Ссылка больше не действует',
    expired: 'Счёт действует 12 часов, потом закрывается. Деньги по закрытому счёту не принимаются: создайте новую ссылку.',
    renew: 'Создать новую ссылку',
    payMyself: 'Оплатить самому',
    back: 'Назад',
    holderTitle: 'Оплата: что дальше',
    holder:
      'Оплата засчитывается, когда её подтверждает платёжная система (Click или Payme). Пакет включается в том браузере, где оплату запросили. Здесь этого заказа нет, поэтому в этом браузере пакет не появится.',
    unpaidTitle: 'Оплата не завершена',
    unpaidOpen: 'Счёт ещё не оплачен. Его можно продолжить по той же ссылке.',
    unpaidClosed: 'Прошлый счёт закрыт. Можно создать новый.',
    cont: 'Продолжить оплату',
    writeTg: 'Написать в Telegram',
    invoice: (ref: string) => `Счёт №${ref}`,
    helpText: (ref: string) => `Не получилось оплатить AI-пакет.${ref ? ` Счёт №${ref}` : ''}`,
    other: 'Другой способ',
  },
  uz: {
    retry: 'Qayta urinish',
    stallOpen: (name: string) => `${name} sahifasi ochilmadi. Pul yechilmadi, takroriy urinish ikkinchi hisob yaratmaydi.`,
    stallFailed: (name: string) => `${name} orqali to‘lovni yaratib bo‘lmadi. Pul yechilmadi. Yana urinib ko‘ring.`,
    next: (names: string) => `Kartani ${names} sahifasida kiriting: u bizga kelmaydi.`,
    seller: (name: string) => `U yerda sotuvchi ${name} deb ko‘rsatilishi mumkin — bu GPTBot.uz kompaniyasi.`,
    saved: 'Savolingiz bir soatga saqlandi: ',
    savedThen: ' To‘lovdan keyin chatga qaytib, uni yuboring.',
    per: (n: number) => `≈ ${n} so‘m — bitta javob`,
    ask: 'To‘lovni boshqadan so‘rash',
    askLink: 'Karta yo‘qmi? To‘lovni boshqadan so‘rash',
    dismiss: 'Yopish',
    askHint: 'To‘lov havolasini yaratamiz, uni boshqa odam to‘lashi mumkin.',
    askFor: (name: string) => `${name} uchun havola`,
    accept: 'Havola yaratib, ',
    offer: 'ofertani',
    shareTitle: 'To‘lovni boshqadan so‘rash',
    shareLead: (name: string, sum: string) => `Havolani ${name} sahifasida ${sum} so‘m to‘lovchi odamga yuboring.`,
    tg: 'Telegramga yuborish',
    shareText: (sum: string) => `GPTBot.uz AI paketini to‘lashga yordam bering (${sum} so‘m):`,
    copy: 'Havolani nusxalash',
    copied: 'Havola nusxalandi',
    link: 'To‘lov havolasi',
    here: 'Paket to‘lovdan keyin SHU brauzerda yoqiladi. Chat buni o‘zi tekshiradi: hech narsa bosish shart emas, faqat sayt ma’lumotlarini o‘chirmang.',
    life: 'Havola yaratilganidan 12 soat amal qiladi.',
    expiredTitle: 'Havola endi amal qilmaydi',
    expired: 'Hisob 12 soat amal qiladi, keyin yopiladi. Yopilgan hisob bo‘yicha to‘lov qabul qilinmaydi: yangi havola yarating.',
    renew: 'Yangi havola yaratish',
    payMyself: 'O‘zim to‘layman',
    back: 'Orqaga',
    holderTitle: 'To‘lov: keyin nima bo‘ladi',
    holder:
      'To‘lov to‘lov tizimi (Click yoki Payme) tasdiqlaganda hisobga olinadi. Paket to‘lov so‘ralgan brauzerda yoqiladi. Bu brauzerda ushbu buyurtma yo‘q, shuning uchun bu yerda paket paydo bo‘lmaydi.',
    unpaidTitle: 'To‘lov yakunlanmadi',
    unpaidOpen: 'Hisob hali to‘lanmagan. Uni o‘sha havola orqali davom ettirish mumkin.',
    unpaidClosed: 'Oldingi hisob yopilgan. Yangisini yaratish mumkin.',
    cont: 'To‘lovni davom ettirish',
    writeTg: 'Telegramga yozish',
    invoice: (ref: string) => `Hisob №${ref}`,
    helpText: (ref: string) => `AI paketni to‘lay olmadim.${ref ? ` Hisob №${ref}` : ''}`,
    other: 'Boshqa usul',
  },
} as const;

const joinNames = (locale: Locale, providers: readonly PaymentProvider[]) =>
  providers.map((provider) => NAMES[provider]).join(locale === 'ru' ? ' или ' : ' yoki ');

// ---------------------------------------------------------------- P2

/** The flow stopped before the provider's page and said nothing: now it says so, with a retry (the order is reused). */
export function PayStall({ locale, provider, kind, busy, onRetry }: {
  locale: Locale; provider: PaymentProvider; kind: 'stale' | 'bad_url' | 'failed'; busy: boolean; onRetry: () => void;
}) {
  const s = TEXT[locale];
  return (
    <div role="alert" className="gpt-error gpt-pay-stall" data-testid="ai-pay-stall" data-kind={kind}>
      <p>{kind === 'failed' ? s.stallFailed(NAMES[provider]) : s.stallOpen(NAMES[provider])}</p>
      <button type="button" className="gpt-primary" disabled={busy} onClick={onRetry}>{s.retry}</button>
    </div>
  );
}

// ---------------------------------------------------------------- P7: the question at the wall

/**
 * The question typed with the trial spent. The composer keeps what is typed as
 * a draft for an hour (storage.ts) and the limit in sessionStorage
 * (limit-state.ts); both are read here by their keys, not through an export
 * the start bundle would have to carry. Empty unless the limit is the trial's
 * or an ended pack's ('monthly'): the two walls whose send button opens this window.
 */
function wallQuestion(): string {
  try {
    const limit = JSON.parse(sessionStorage.getItem('gptchat_limit') || 'null') as { reason?: unknown } | null;
    if (limit?.reason !== 'trial' && limit?.reason !== 'monthly') return '';
    const draft = JSON.parse(localStorage.getItem('gptchat_draft') || 'null') as { text?: unknown; savedAt?: unknown } | null;
    return typeof draft?.text === 'string' && typeof draft.savedAt === 'number' && Date.now() - draft.savedAt < 3_600_000 ? draft.text.trim() : '';
  } catch {
    return '';
  }
}

/**
 * Above the pay buttons: the visitor's own question and what happens to it. The
 * window is masked in the session recording (ym-hide-content on the dialog),
 * and the text goes nowhere: no event carries it.
 */
function WallQuestion({ locale }: { locale: Locale }) {
  const [question] = useState(wallQuestion);
  const s = TEXT[locale];
  return question ? (
    <p className="gpt-pay-question" data-testid="ai-pay-question">
      {s.saved}«<span>{question.length > 90 ? `${question.slice(0, 90)}…` : question}</span>».{s.savedThen}
    </p>
  ) : null;
}

// ---------------------------------------------------------------- P6 + P4 entry

/**
 * In the pay step, under the provider buttons: what happens next and the price
 * of one answer (P6), and «Попросить оплатить» (P4): the first tap opens the
 * line that says creating the link accepts the offer, the second creates it.
 */
export function PayExtras({ locale, pack, offers, providers, busy, termsUrl, onAsk }: {
  locale: Locale; pack: PackTerms;
  /** The packs on offer, in the order of their rows; one: the window of one pack, as it always was. */
  offers: PackOffer[];
  providers: readonly PaymentProvider[]; busy: boolean; termsUrl: string | null;
  onAsk: (provider: PaymentProvider, sku: PackSku) => void;
}) {
  const s = TEXT[locale];
  const two = offers.length > 1;
  const links = providers.filter((provider) => provider === 'click' || provider === 'payme');
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem(ASK_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.removeItem(ASK_KEY); } catch { /* nothing to clear */ }
  }, []);
  const per = pack.messageLimit > 0 ? Math.round(pack.priceUzs / pack.messageLimit) : 0;
  return (
    <div className="gpt-pay-extras" data-testid="ai-pay-extras">
      {!two && <WallQuestion locale={locale} />}
      {links.length > 0 && links.length === providers.length && (
        <p className="gpt-pay-next">{s.next(joinNames(locale, links))} <span data-testid="ai-pay-seller">{s.seller(shortName[locale])}</span></p>
      )}
      {per > 0 && !two && <p className="gpt-pay-per" data-testid="ai-pay-per">{s.per(per)}</p>}
      {links.length > 0 && (open ? (
        <div className="gpt-pay-ask" data-testid="ai-pay-ask-box">
          <p>{s.askHint}</p>
          <div className="gpt-pay-ask-buttons">
            {(two ? offers : offers.slice(0, 1)).flatMap((offer) => links.map((provider) => (
              <button type="button" className="gpt-text-button" key={`${offer.sku}:${provider}`} data-provider={provider} data-sku={offer.sku} disabled={busy} onClick={() => onAsk(provider, offer.sku)}>
                {two ? packText(locale).link(offer, NAMES[provider]) : s.askFor(NAMES[provider])}
              </button>
            )))}
          </div>
          <p className="gpt-pay-ask-accept">
            {s.accept}
            {termsUrl ? <a href={termsUrl} target="_blank" rel="noopener noreferrer">{s.offer}</a> : s.offer}
            {locale === 'ru' ? '.' : ' qabul qilasiz.'}
          </p>
        </div>
      ) : (
        <button type="button" className="gpt-text-button gpt-pay-ask-open" data-testid="ai-pay-ask" disabled={busy} onClick={() => setOpen(true)}>
          {s.askLink}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- two packs

/**
 * Two packs on offer (the 3-day pack beside the monthly one): a row each, with
 * its sum, what it holds, the price of one answer and its own pay buttons, so
 * one tap still pays. Nothing is preselected. Every number is the server's.
 */
export function PayPacks({ locale, offers, providers, busy, onPay }: {
  locale: Locale; offers: PackOffer[]; providers: readonly PaymentProvider[]; busy: boolean;
  onPay: (provider: PaymentProvider, sku: PackSku) => void;
}) {
  const s = packText(locale);
  const best = Math.min(...offers.map(perAnswer));
  return (
    <div className="gpt-pay-packs" data-testid="ai-pay-packs">
      <WallQuestion locale={locale} />
      {offers.map((offer) => (
        <section className="gpt-pay-pack" key={offer.sku} data-sku={offer.sku} aria-label={`${s.name(offer)}: ${s.sum(offer)}`}>
          <div className="gpt-pay-pack-head">
            <strong>{s.name(offer)}{perAnswer(offer) === best && <em>{s.best}</em>}</strong>
            <b>{s.sum(offer)}</b>
          </div>
          <p>{s.facts(offer)} · {s.per(perAnswer(offer))}</p>
          <div className="gpt-pay-pack-buttons">
            {/* The word the acceptance line names, once; then a button per provider. Uzum sells the monthly pack only. */}
            <span aria-hidden="true">{s.via}</span>
            {providers.filter((provider) => offer.sku === 'month' || provider !== 'uzum').map((provider) => (
              <button
                type="button"
                className="gpt-primary"
                key={provider}
                data-provider={provider}
                data-sku={offer.sku}
                disabled={busy}
                aria-label={s.pay(offer, NAMES[provider])}
                onClick={() => onPay(provider, offer.sku)}
              >
                {NAMES[provider]}<span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- P4

/** The payment link to send on, with the sentence that the pack turns on in this browser. */
export function PayShare({ locale, provider, url, at, orderState, priceUzs, busy, onCheck, onNew, onPayMyself, onBack }: {
  locale: Locale; provider: PaymentProvider; url: string; at: number;
  /** The account view's state of this order (pending, prepared, cancelled, refunded…), or null while unknown. */
  orderState: string | null;
  priceUzs: number; busy: boolean;
  onCheck: () => void; onNew: () => void; onPayMyself: () => void; onBack: () => void;
}) {
  const s = TEXT[locale];
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const check = useRef(onCheck);
  check.current = onCheck;
  // The tab stays open: look every 15 s while it is in view (a focus reads at once, use-account.ts).
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') check.current();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const expired = Date.now() - at >= ORDER_LIFETIME_MS || (orderState !== null && !['pending', 'prepared'].includes(orderState));
  const sum = sumOf(priceUzs);
  const name = NAMES[provider];
  if (expired)
    return (
      <>
        <DialogTitle>{s.expiredTitle}</DialogTitle>
        <DialogDescription asChild>
          <p role="status" className="gpt-notice" data-testid="ai-pay-share-expired">{s.expired}</p>
        </DialogDescription>
        <button type="button" className="gpt-primary" disabled={busy} onClick={onNew}>{s.renew}</button>
        <button type="button" className="gpt-text-button" onClick={onBack}>{s.back}</button>
      </>
    );
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(s.shareText(sum))}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      input.current?.focus();
      input.current?.select();
    }
  };
  return (
    <>
      <DialogTitle>{s.shareTitle}</DialogTitle>
      <DialogDescription asChild>
        <p className="gpt-panel-note" data-testid="ai-pay-share">{s.shareLead(name, sum)}</p>
      </DialogDescription>
      <a className="gpt-primary" href={share} target="_blank" rel="noopener noreferrer" data-testid="ai-pay-share-telegram">{s.tg}</a>
      <button type="button" className="gpt-text-button gpt-pay-copy" data-testid="ai-pay-share-copy" onClick={() => void copy()}>
        {copied ? s.copied : s.copy}
      </button>
      <input ref={input} className="gpt-pay-link" readOnly value={url} aria-label={s.link} onFocus={(event) => event.currentTarget.select()} />
      <p className="gpt-panel-note" data-testid="ai-pay-share-here">{s.here}</p>
      <p className="gpt-panel-note">{s.life}</p>
      <button type="button" className="gpt-text-button" disabled={busy} onClick={onPayMyself}>{s.payMyself}</button>
      <button type="button" className="gpt-text-button" onClick={onBack}>{s.back}</button>
    </>
  );
}

/** The return page cannot see the order's holder: what is true for the payer. `children`: the support line and the way back. */
export function PayHolderless({ locale, children }: { locale: Locale; children?: ReactNode }) {
  const s = TEXT[locale];
  return (
    <>
      <DialogTitle>{s.holderTitle}</DialogTitle>
      <DialogDescription asChild>
        <p role="status" className="gpt-notice" data-testid="ai-pay-result" data-result="holderless">{s.holder}</p>
      </DialogDescription>
      {children}
    </>
  );
}

// ---------------------------------------------------------------- P5

/** «Оплата не завершена»: continue, another way, ask someone to pay. Counts itself once. */
/** The order's short public reference: the last six characters of the id the client already holds, upper case; '' without one. */
export function orderRef(id: string | null | undefined): string {
  return typeof id === 'string' ? id.slice(-6).toUpperCase() : '';
}

export function PayUnpaid({ heading, top, children, orderId, locale, apiBase, provider, since, closed, busy, onContinue, onOther, onAsk, cheaper = null }: {
  /** The card is the window's whole screen: its title is the window's, `top` follows it and `children` close it. */
  heading: boolean; top?: ReactNode; children?: ReactNode;
  /** The order the client holds (account view or watch), or null. */
  orderId: string | null;
  locale: Locale; apiBase: string; provider: PaymentProvider | null; since: number;
  /** The order is closed (cancelled or past its time): continuing makes a new one. */
  closed: boolean; busy: boolean;
  onContinue: () => void; onOther: () => void; onAsk: (() => void) | null;
  /** The smaller pack, for a monthly order left unpaid: one tap with the same provider. */
  cheaper?: { offer: PackOffer; onPay: () => void } | null;
}) {
  const s = TEXT[locale];
  const ref = orderRef(orderId);
  const help = `${STUDIO_TELEGRAM_URL}?text=${encodeURIComponent(s.helpText(ref))}`;
  const [gone, setGone] = useState(false);
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    payEvent(apiBase, 'checkout_return_unpaid', provider, since, closed ? 'cancelled' : 'none');
  }, [apiBase, provider, since, closed]);
  if (gone) return null;
  return (
    <>
    {heading && <DialogTitle>{s.unpaidTitle}</DialogTitle>}
    {top}
    <section className="gpt-pay-unpaid" data-testid="ai-pay-unpaid" data-closed={closed || undefined} aria-label={s.unpaidTitle}>
      {!heading && (
        <div className="gpt-pay-unpaid-head">
          <strong>{s.unpaidTitle}</strong>
          <button type="button" className="gpt-pay-unpaid-close" aria-label={s.dismiss} onClick={() => setGone(true)}>×</button>
        </div>
      )}
      <p>{closed ? s.unpaidClosed : s.unpaidOpen}</p>
      {ref && <p className="gpt-pay-ref" data-testid="ai-pay-ref">{s.invoice(ref)}</p>}
      {provider && <button type="button" className="gpt-primary" disabled={busy} onClick={onContinue}>{s.cont} · {NAMES[provider]}</button>}
      {cheaper && provider && (
        <button type="button" className="gpt-pay-cheaper" data-testid="ai-pay-cheaper" disabled={busy} onClick={cheaper.onPay}>
          {packText(locale).cheaper(cheaper.offer)} · {NAMES[provider]}
        </button>
      )}
      <div className="gpt-pay-unpaid-more">
        <button type="button" className="gpt-text-button" disabled={busy} onClick={onOther}>{s.other}</button>
        {onAsk && <button type="button" className="gpt-text-button" disabled={busy} onClick={onAsk}>{s.ask}</button>}
        <a className="gpt-text-button" data-contact="studio" data-testid="ai-pay-write" href={help} target="_blank" rel="noopener noreferrer">{s.writeTg}</a>
      </div>
    </section>
    {children}
    </>
  );
}
