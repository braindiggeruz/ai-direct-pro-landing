/**
 * The Telegram half of the AUTH-1 binding ceremony.
 *
 * The owner minted a one-time code in the Owner Control Center; this is where it
 * is spent. What makes the ceremony worth anything is that neither half works
 * alone: the code proves the owner authorised a binding, and this session —
 * built from `initData` Telegram itself signed — proves who is claiming it. The
 * identity that gets bound is whoever authenticated this request. Nothing typed
 * on this screen names a person, an organization or a store.
 *
 * The code never leaves React state. It is not written to localStorage, not put
 * in the URL, not logged, and it is dropped when the screen closes. A code that
 * can be recovered from a device later is a code that can leak later.
 */
import { useEffect, useRef, useState } from 'react';
import { MarketApiError, marketApi } from '../lib/api';
import {
  BINDING_CODE_LENGTH,
  isBindingCode,
  normalizeBindingCode,
} from '../lib/binding-code';
import { t } from '../lib/i18n';
import { useBackStop } from '../platform/navigation';
import type { Locale } from '../types';
import { Button, Field, Icon } from '../components/ui';

type Step = 'entry' | 'checking' | 'confirm' | 'binding' | 'done';

interface RedeemResult {
  sellerRead: boolean;
  sellerCommands: boolean;
  storeName: string;
  alreadyBound: boolean;
}

type MessageKey =
  | 'bindInvalid'
  | 'bindBlocked'
  | 'bindStoreUnavailable'
  | 'bindRateLimited'
  | 'bindFailed';

/**
 * The server's closed error vocabulary, mapped to something a person can act
 * on. Every challenge outcome — unknown, expired, already spent — arrives as one
 * `validation_failed`, and it stays one message here: telling them apart would
 * hand somebody grinding codes the only feedback they lack.
 */
function messageKey(error: unknown): MessageKey {
  if (!(error instanceof MarketApiError)) return 'bindFailed';
  switch (error.code) {
    case 'validation_failed':
      return 'bindInvalid';
    case 'state_conflict':
      return 'bindBlocked';
    case 'storefront_unavailable':
      return 'bindStoreUnavailable';
    case 'rate_limited':
      return 'bindRateLimited';
    default:
      return 'bindFailed';
  }
}

export function SellerBindingRedeem({
  locale,
  onClose,
  onBound,
}: {
  locale: Locale;
  onClose: () => void;
  /** Raised after a successful binding so the shell re-reads its own authority. */
  onBound: () => Promise<void> | void;
}) {
  const [step, setStep] = useState<Step>('entry');
  const [code, setCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [alreadyBound, setAlreadyBound] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);

  const normalized = normalizeBindingCode(code);
  const ready = isBindingCode(normalized);
  const busy = step === 'checking' || step === 'binding';

  const close = (): void => {
    // The code is dropped before the screen is: nothing outlives this view.
    setCode('');
    setStoreName('');
    setError(null);
    onClose();
  };

  // Back steps out of the confirmation first and off the screen second, so
  // somebody who opened the confirmation by accident does not lose what they
  // pasted. It never closes the Mini App from here.
  useBackStop(true, 'seller-binding', () => {
    if (busy) return false;
    if (step === 'confirm') {
      setStep('entry');
      return false;
    }
    close();
    return false;
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // A failure or a confirmation is announced, not merely drawn.
  useEffect(() => {
    if (error || step === 'confirm') statusRef.current?.focus();
  }, [error, step]);

  async function check(): Promise<void> {
    if (!ready || busy) return;
    setStep('checking');
    setError(null);
    try {
      // Reads only. Somebody who then decides not to go ahead still holds an
      // unspent code.
      const seen = await marketApi.post<{ storeName: string }>(
        '/identity/seller-binding/inspect',
        { challenge: normalized },
      );
      setStoreName(seen.storeName);
      setStep('confirm');
    } catch (failure) {
      setError(messageKey(failure));
      setStep('entry');
    }
  }

  async function confirm(): Promise<void> {
    if (busy) return;
    setStep('binding');
    setError(null);
    try {
      const result = await marketApi.post<RedeemResult>(
        '/identity/seller-binding',
        { challenge: normalized },
      );
      setAlreadyBound(result.alreadyBound);
      setStoreName(result.storeName);
      // Spent. Dropped before anything else is drawn.
      setCode('');
      setStep('done');
      // Authority is whatever the server says on the next read, never what this
      // response let the client assume.
      await onBound();
    } catch (failure) {
      setError(messageKey(failure));
      setStep('entry');
    }
  }

  if (step === 'done') {
    return <section className="section stack" data-testid="binding-done">
      <div className="notice">
        <Icon name="check" size={19} />
        <span>{t(locale, alreadyBound ? 'bindAlready' : 'bindSuccessTitle')}</span>
      </div>
      {storeName
        ? <p className="cabinet-note">{t(locale, 'bindStoreLabel')}: {storeName}</p>
        : null}
      <p className="cabinet-note">{t(locale, 'bindSuccessBody')}</p>
      <Button variant="primary" wide onClick={close}>{t(locale, 'bindDone')}</Button>
    </section>;
  }

  return <section className="section stack" data-testid="binding-screen">
    <p className="cabinet-note">{t(locale, 'bindIntro')}</p>

    <Field label={t(locale, 'bindCodeLabel')} hint={t(locale, 'bindWarning')}>
      <input
        ref={inputRef}
        className="binding-code"
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={BINDING_CODE_LENGTH * 2}
        disabled={busy}
        aria-invalid={error ? true : undefined}
        placeholder={t(locale, 'bindCodePlaceholder')}
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
          setError(null);
        }}
      />
    </Field>

    {code ? <Button
      variant="ghost"
      disabled={busy}
      onClick={() => { setCode(''); setError(null); inputRef.current?.focus(); }}
      data-testid="binding-clear"
    >{t(locale, 'bindClear')}</Button> : null}

    <p
      className="cabinet-note"
      ref={statusRef}
      tabIndex={-1}
      role={error ? 'alert' : 'status'}
      data-testid="binding-status"
    >{error ? t(locale, error) : step === 'checking' ? t(locale, 'bindChecking') : ''}</p>

    {/* The confirmation stays on screen while the binding runs, so the pending
        state belongs to the button the person actually pressed. */}
    {step === 'confirm' || step === 'binding'
      ? <div className="stack" data-testid="binding-confirm">
          <div className="row row--between">
            <span className="cabinet-note">{t(locale, 'bindStoreLabel')}</span>
            <strong>{storeName}</strong>
          </div>
          <div>
            <span className="cabinet-note">{t(locale, 'bindAccessTitle')}</span>
            <ul className="binding-access">
              <li>{t(locale, 'bindAccessProducts')}</li>
              <li>{t(locale, 'bindAccessOrders')}</li>
              <li>{t(locale, 'bindAccessQuestions')}</li>
              <li>{t(locale, 'bindAccessStock')}</li>
            </ul>
          </div>
          <Button
            variant="primary"
            wide
            pending={step === 'binding'}
            onClick={() => void confirm()}
            data-testid="binding-confirm-action"
          >{t(locale, 'bindConfirm')}</Button>
          <Button variant="secondary" wide disabled={busy} onClick={() => setStep('entry')}>
            {t(locale, 'cancel')}
          </Button>
        </div>
      : <Button
          variant="primary"
          wide
          pending={step === 'checking'}
          disabled={!ready}
          onClick={() => void check()}
          data-testid="binding-check"
        >{t(locale, 'bindCheck')}</Button>}
  </section>;
}
