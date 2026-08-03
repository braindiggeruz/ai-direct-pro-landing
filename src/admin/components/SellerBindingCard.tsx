// The owner half of the AUTH-1 binding ceremony.
//
// Two authorities have to meet before a Telegram account can act as the owner
// of a store: this card, which only an authenticated platform_owner can reach,
// and the Mini App, which only the holder of that Telegram account can open.
// This side mints one short-lived code; that side spends it.
//
// The code lives in React state and nowhere else. It is not written to
// localStorage, not put in a URL, not logged and not sent to anything: the
// server keeps only its SHA-256, so once this component unmounts the value is
// gone for good and a new one has to be minted. That is the point — a secret
// that can be recovered later is a secret that can leak later.
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card } from './ui';
import { ownerApi, type OwnerApiError } from '../lib/owner-api';

/**
 * 64 hex characters are unreadable as one run and easy to mis-transcribe. This
 * groups them for the eye only — the value copied to the clipboard is always the
 * original string, never this.
 */
function grouped(code: string): string {
  return (code.match(/.{1,8}/g) ?? []).join(' ');
}

function remaining(expiresAt: string, now: number): string {
  const left = Math.max(0, new Date(expiresAt).getTime() - now);
  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

type Phase = 'idle' | 'confirming' | 'creating' | 'issued';

/** Everything a caller could learn is folded into these four answers. */
function messageFor(code: string): string {
  switch (code) {
    case 'not_found':
      return 'Привязка Telegram сейчас выключена. Включите MARKET_OWNER_TELEGRAM_BINDING_ENABLED и повторите.';
    case 'challenge_exists':
      return 'Один код уже действует. Дождитесь, пока он истечёт, или используйте его.';
    case 'store_unavailable':
      return 'Активный магазин не найден.';
    case 'store_ambiguous':
      return 'Активных магазинов больше одного — код не выдан, чтобы не привязать доступ не к тому.';
    case 'rate_limited':
      return 'Слишком много попыток. Подождите несколько минут.';
    default:
      return 'Не удалось создать код. Попробуйте ещё раз.';
  }
}

export function SellerBindingCard() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [storeName, setStoreName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Set once the server has said the feature is off, so the action stops
  // offering something that cannot work. Server-reported, never assumed.
  const [disabled, setDisabled] = useState(false);
  const codeRef = useRef<HTMLElement | null>(null);

  const live = phase === 'issued' && new Date(expiresAt).getTime() > now;

  useEffect(() => {
    if (phase !== 'issued') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  // Focus moves to the code when it appears, so a screen reader announces the
  // thing the operator came here for rather than leaving them to hunt for it.
  useEffect(() => {
    if (phase === 'issued') codeRef.current?.focus();
  }, [phase]);

  const forget = () => {
    setCode('');
    setExpiresAt('');
    setStoreName('');
    setCopied(false);
    setPhase('idle');
  };

  const create = async () => {
    setPhase('creating');
    setError(null);
    try {
      const issued = await ownerApi.createSellerBindingChallenge();
      setCode(issued.challenge);
      setExpiresAt(issued.expiresAt);
      setStoreName(issued.storeName);
      setNow(Date.now());
      setPhase('issued');
    } catch (failure) {
      const apiError = failure as OwnerApiError;
      if (apiError.code === 'not_found') setDisabled(true);
      setError(messageFor(apiError.code));
      setPhase('idle');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission can be refused. The code is on screen and can be
      // selected by hand, so this is not worth an error state.
      setCopied(false);
    }
  };

  return (
    <Card data-testid="owner-seller-binding">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="font-display text-base text-white">Привязка Telegram</h2>
          <p className="text-white/40 text-xs mt-1 max-w-prose">
            Одноразовый код, который даёт вашему Telegram доступ владельца к товарам и
            заказам этого магазина. Действует 10 минут и срабатывает один раз.
          </p>
        </div>
        {live ? <Badge tone="warning">ожидает подтверждения</Badge> : null}
      </div>

      {error ? (
        <p className="text-red-300 text-sm mb-3" role="alert" data-testid="owner-seller-binding-error">
          {error}
        </p>
      ) : null}

      {phase === 'idle' ? (
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => setPhase('confirming')}
          data-testid="owner-seller-binding-start"
        >Создать одноразовый код</Button>
      ) : null}

      {phase === 'confirming' ? (
        <div className="space-y-3" data-testid="owner-seller-binding-confirm">
          <p className="text-sm text-white/80 max-w-prose">
            Код даст этому Telegram доступ владельца к товарам и заказам магазина.
            Не пересылайте его другим людям.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => void create()}>Создать код</Button>
            <Button variant="ghost" onClick={() => setPhase('idle')}>Отмена</Button>
          </div>
        </div>
      ) : null}

      {phase === 'creating' ? (
        <p className="text-white/60 text-sm" role="status">Создаём код…</p>
      ) : null}

      {phase === 'issued' ? (
        <div className="space-y-3" data-testid="owner-seller-binding-issued">
          <div className="text-sm text-white/60">
            Магазин: <span className="text-white">{storeName}</span>
          </div>
          {/* Grouping is presentational; `code` itself is what gets copied. */}
          <code
            ref={codeRef}
            tabIndex={-1}
            className="block font-mono text-sm sm:text-base text-white bg-bg-base border border-white/10 rounded-lg px-3 py-3 break-all select-all"
            data-testid="owner-seller-binding-code"
          >{grouped(code)}</code>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => void copy()} data-testid="owner-seller-binding-copy">
              {copied ? 'Код скопирован' : 'Скопировать код'}
            </Button>
            <Button variant="ghost" onClick={forget} data-testid="owner-seller-binding-close">
              Закрыть
            </Button>
            <span className="text-white/50 text-sm" role="status" data-testid="owner-seller-binding-ttl">
              {live ? `Действует ещё ${remaining(expiresAt, now)}` : 'Код истёк'}
            </span>
          </div>
          <ol className="text-white/50 text-xs space-y-1 list-decimal list-inside max-w-prose">
            <li>Откройте Bormi Mini App со своего Telegram-аккаунта.</li>
            <li>Кабинет → Настройки и помощь → Привязать магазин.</li>
            <li>Вставьте код и подтвердите привязку.</li>
          </ol>
          <p className="text-white/40 text-xs max-w-prose">
            Закрытие карточки стирает код без возможности восстановления — он нигде не
            сохраняется. Если он потерялся, создайте новый после истечения текущего.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
