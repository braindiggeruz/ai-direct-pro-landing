import { AlertTriangle, CheckCircle2, ExternalLink, LoaderCircle, MessageCircle, Send, ShieldAlert } from 'lucide-react';
import { useId } from 'react';
import { Badge, Button, Card } from '../ui';

export type TelegramEndpointKind = 'business' | 'human' | 'unknown' | 'bot' | 'channel' | 'group';
export type TelegramEndpointVerification = 'verified' | 'unverified';
export type TelegramEndpointOwnership = 'corporate' | 'personal' | 'unknown';
export type TelegramSendResult = 'idle' | 'queued' | 'sent' | 'error';

export interface TelegramOutreachEndpoint {
  kind: TelegramEndpointKind;
  verification: TelegramEndpointVerification;
  ownership: TelegramEndpointOwnership;
  doNotContact: boolean;
}

export interface TelegramOutreachActionsProps {
  endpoint: TelegramOutreachEndpoint;
  manualDraftUrl?: string | null;
  activeChatEligible: boolean;
  approvalConfirmed: boolean;
  onApprovalChange: (confirmed: boolean) => void;
  onSend: () => void;
  sendLoading?: boolean;
  sendResult?: TelegramSendResult;
}

export function isVerifiedCorporateBusinessEndpoint(endpoint: TelegramOutreachEndpoint): boolean {
  return endpoint.kind === 'business'
    && endpoint.verification === 'verified'
    && endpoint.ownership === 'corporate'
    && !endpoint.doNotContact;
}

export function isAutomatedTelegramSendEligible(
  endpoint: TelegramOutreachEndpoint,
  activeChatEligible: boolean,
): boolean {
  return isVerifiedCorporateBusinessEndpoint(endpoint) && activeChatEligible;
}

/** Telegram and the API count Unicode code points, not UTF-16 code units. */
export function boundTelegramDraftText(value: string): string {
  return [...value.replaceAll('\u0000', '')].slice(0, 4_096).join('');
}

export function isTelegramDraftTextReady(value: string): boolean {
  const length = [...value].length;
  return !value.includes('\u0000') && value.trim().length > 0 && length <= 4_096;
}

/** Only explicit Telegram deep links may leave the admin UI. */
export function normalizeTelegramDraftUrl(value?: string | null): string | null {
  if (!value || value.trim() !== value || value.length > 65_536) return null;

  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.port || parsed.hash) return null;
    const textValues = parsed.searchParams.getAll('text');
    if (textValues.length !== 1 || !isTelegramDraftTextReady(textValues[0] ?? '')) return null;
    if ([...parsed.searchParams.keys()].some((key) => key !== 'text' && key !== 'domain')) return null;

    if (parsed.protocol === 'https:') {
      const host = parsed.hostname.toLowerCase();
      if ((host === 't.me' || host === 'telegram.me')
        && /^\/[A-Za-z0-9_]{5,32}$/u.test(parsed.pathname)
        && !parsed.searchParams.has('domain')) return parsed.toString();
      return null;
    }

    const domainValues = parsed.searchParams.getAll('domain');
    if (parsed.protocol === 'tg:'
      && parsed.hostname === 'resolve'
      && parsed.pathname === ''
      && domainValues.length === 1
      && /^[A-Za-z0-9_]{5,32}$/u.test(domainValues[0] ?? '')) {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

const RESULT_COPY = {
  idle: null,
  queued: {
    label: 'Принято в обработку',
    detail: 'Запрос сохранён. Итоговый статус появится после подтверждения Telegram.',
    icon: LoaderCircle,
  },
  sent: {
    label: 'Отправлено',
    detail: 'Telegram подтвердил отправку сообщения в активный чат компании.',
    icon: CheckCircle2,
  },
  error: {
    label: 'Не отправлено',
    detail: 'Telegram не подтвердил отправку. Проверьте окно чата и повторите вручную.',
    icon: AlertTriangle,
  },
};

function unavailableReason(endpoint: TelegramOutreachEndpoint): string {
  if (endpoint.doNotContact) return 'Для компании включён запрет на контакт (DNC). Любые действия отправки скрыты.';
  if (endpoint.kind !== 'business') return 'Telegram endpoint не является корпоративным Business контактом. Отправка скрыта.';
  if (endpoint.verification !== 'verified') return 'Корпоративный Telegram endpoint ещё не подтверждён. Отправка скрыта.';
  return 'Принадлежность Telegram endpoint компании не подтверждена. Отправка скрыта.';
}

export function TelegramOutreachActions({
  endpoint,
  manualDraftUrl,
  activeChatEligible,
  approvalConfirmed,
  onApprovalChange,
  onSend,
  sendLoading = false,
  sendResult = 'idle',
}: TelegramOutreachActionsProps) {
  const approvalId = useId();
  const headingId = useId();
  const safeEndpoint = isVerifiedCorporateBusinessEndpoint(endpoint);
  const automatedSendEligible = isAutomatedTelegramSendEligible(endpoint, activeChatEligible);
  const safeDraftUrl = normalizeTelegramDraftUrl(manualDraftUrl);
  const resultCopy = RESULT_COPY[sendResult];
  const ResultIcon = resultCopy?.icon;

  if (!safeEndpoint) {
    return (
      <section aria-labelledby={headingId}>
        <Card className="border-amber-300/15 bg-amber-300/[0.035]">
          <div role="status" aria-live="polite" className="flex items-start gap-3">
            <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
            <div>
              <h2 id={headingId} className="text-base font-semibold text-white">
                Отправка в Telegram недоступна
              </h2>
              <p className="mt-1 text-sm leading-6 text-white/65">{unavailableReason(endpoint)}</p>
              <p className="mt-2 text-xs leading-5 text-amber-50/80">
                Публичный endpoint не означает согласия на обращение; массовая рассылка запрещена.
              </p>
            </div>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <Card className="border-white/[0.1] bg-[#08111f]/80">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-cyan/80">Контакт с компанией</p>
            <h2 id={headingId} className="mt-1 text-base font-semibold text-white">
              Telegram Business
            </h2>
          </div>
          <Badge tone="success">Подтверждённый корпоративный endpoint</Badge>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <MessageCircle size={18} className="mt-0.5 shrink-0 text-brand-cyan" aria-hidden="true" />
          <div className="text-sm leading-6 text-white/65">
            {automatedSendEligible ? (
              <>
                <p className="font-medium text-white">Активный чат: автоматический ответ разрешён</p>
                <p>Входящая активность компании укладывается в 24-часовое окно Business API.</p>
              </>
            ) : (
              <>
                <p className="font-medium text-white">Холодный контакт: только ручная отправка</p>
                <p>Лид Радар откроет Telegram с готовым черновиком. Проверьте адресата и нажмите отправку сами.</p>
              </>
            )}
          </div>
        </div>

        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-50/75">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
          <span>Публичный endpoint не означает согласия. Холодный черновик отправляйте вручную только при законном основании и без массовой рассылки; Business-автоответ доступен лишь в активном 24-часовом чате.</span>
        </p>

        {automatedSendEligible && (
          <label
            htmlFor={approvalId}
            className="mt-4 flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-white/[0.1] p-3 text-sm leading-5 text-white/80 transition-colors hover:bg-white/[0.025]"
          >
            <input
              id={approvalId}
              type="checkbox"
              checked={approvalConfirmed}
              disabled={sendLoading}
              onChange={(event) => onApprovalChange(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#2fe6d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            />
            <span>
              <span className="block font-medium text-white">Подтверждаю автоматическую отправку</span>
              Я проверил компанию, Telegram endpoint и точный текст сообщения. Контакт не находится в DNC.
            </span>
          </label>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {automatedSendEligible && (
            <Button
              type="button"
              size="lg"
              disabled={!approvalConfirmed || sendLoading}
              aria-busy={sendLoading}
              onClick={onSend}
              className="min-h-12 w-full"
            >
              {sendLoading
                ? <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" />
                : <Send size={17} aria-hidden="true" />}
              {sendLoading ? 'Отправляем…' : 'Отправить в активный чат'}
            </Button>
          )}

          {safeDraftUrl ? (
            <a
              href={safeDraftUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.15] bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            >
              <ExternalLink size={17} aria-hidden="true" />
              Открыть черновик в Telegram
            </a>
          ) : (
            <div role="status" className="flex min-h-12 items-center rounded-xl border border-amber-300/15 px-4 text-sm text-amber-50/70">
              Безопасная ссылка на черновик недоступна
            </div>
          )}
        </div>

        <div role="status" aria-live="polite" aria-atomic="true" className="mt-4 min-h-6">
          {resultCopy && ResultIcon && (
            <div className="flex items-start gap-2 text-sm text-white/70">
              <ResultIcon size={17} className="mt-0.5 shrink-0 text-brand-cyan" aria-hidden="true" />
              <p>
                <span className="font-medium text-white">{resultCopy.label}.</span>{' '}
                {resultCopy.detail}
              </p>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
