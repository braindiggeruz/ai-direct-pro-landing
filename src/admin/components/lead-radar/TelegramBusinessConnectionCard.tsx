import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Link2,
  MessageCircle,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useId } from 'react';
import { Badge, Button, Card } from '../ui';

export type TelegramBusinessConnectionStatus =
  | 'unconfigured'
  | 'configured'
  | 'pending'
  | 'connected'
  | 'paused'
  | 'error';

export interface TelegramBusinessConnectionCardProps {
  status: TelegramBusinessConnectionStatus;
  canReply: boolean;
  connectedAt?: string | null;
  activeCompanyChats: number;
  onConnect: () => void;
  onRetry?: () => void;
  actionLoading?: boolean;
  actionDisabled?: boolean;
}

const STATUS_COPY = {
  unconfigured: {
    label: 'Нужна серверная настройка',
    detail: 'Выделенный Telegram Business бот ещё не настроен администратором. Отправка закрыта.',
    tone: 'warning' as const,
    icon: AlertTriangle,
  },
  configured: {
    label: 'Настроен',
    detail: 'Параметры сохранены. Завершите подтверждение аккаунта в Telegram.',
    tone: 'info' as const,
    icon: ShieldCheck,
  },
  pending: {
    label: 'Подключение',
    detail: 'Telegram подтверждает подключение. Дождитесь результата перед отправкой.',
    tone: 'warning' as const,
    icon: Clock3,
  },
  connected: {
    label: 'Подключён',
    detail: 'Аккаунт подтверждён. Доступность ответа проверяется отдельно для каждого чата.',
    tone: 'success' as const,
    icon: CheckCircle2,
  },
  paused: {
    label: 'Приостановлен',
    detail: 'Отправка остановлена. Черновики остаются доступны для ручной проверки.',
    tone: 'warning' as const,
    icon: PauseCircle,
  },
  error: {
    label: 'Нужна проверка',
    detail: 'Подключение не подтверждено. Проверьте аккаунт и повторите попытку.',
    tone: 'danger' as const,
    icon: AlertTriangle,
  },
} satisfies Record<TelegramBusinessConnectionStatus, {
  label: string;
  detail: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  icon: typeof Link2;
}>;

function formatConnectedAt(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

export function TelegramBusinessConnectionCard({
  status,
  canReply,
  connectedAt,
  activeCompanyChats,
  onConnect,
  onRetry,
  actionLoading = false,
  actionDisabled = false,
}: TelegramBusinessConnectionCardProps) {
  const headingId = useId();
  const statusCopy = STATUS_COPY[status];
  const StatusIcon = statusCopy.icon;
  const connectedAtLabel = formatConnectedAt(connectedAt);
  const chatCount = Number.isFinite(activeCompanyChats)
    ? Math.max(0, Math.trunc(activeCompanyChats))
    : 0;
  const replyAvailable = status === 'connected' && canReply;
  const pending = status === 'pending' || actionLoading;
  const retry = status === 'paused' || status === 'error' || (status === 'connected' && !replyAvailable);
  const showAction = status !== 'unconfigured' && (status !== 'connected' || !replyAvailable);
  const action = retry ? (onRetry ?? onConnect) : onConnect;
  const actionLabel = pending
    ? 'Подключаем…'
    : actionDisabled
      ? 'Контактный режим выключен'
      : retry
        ? 'Повторить подключение'
        : status === 'configured'
          ? 'Завершить подключение'
          : 'Подключить Telegram Business';

  return (
    <section aria-labelledby={headingId}>
      <Card className="border-brand-blue/20 bg-[#08111f]/80">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-cyan/80">
              Канал связи
            </p>
            <h2 id={headingId} className="mt-1 text-lg font-semibold text-white">
              Telegram Business
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              Подключение даёт Лид Радару управляемый канал ответа. Токены и данные авторизации
              в этой карточке не показываются и не сохраняются в браузере.
            </p>
          </div>

          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="flex max-w-sm items-start gap-3 rounded-xl border border-white/[0.09] bg-white/[0.025] p-3"
          >
            <StatusIcon size={18} className="mt-0.5 shrink-0 text-brand-cyan" aria-hidden="true" />
            <div>
              <Badge tone={statusCopy.tone}>{statusCopy.label}</Badge>
              <p className="mt-1.5 text-xs leading-5 text-white/60">{statusCopy.detail}</p>
            </div>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.018] p-4">
            <dt className="text-xs uppercase tracking-wide text-white/65">Ответ через Business API</dt>
            <dd className="mt-2 flex items-start gap-2 text-sm text-white/80">
              {replyAvailable
                ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />
                : <PauseCircle size={17} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />}
              <span>{replyAvailable ? 'Разрешён подключением' : 'Сейчас недоступен'}</span>
            </dd>
            {connectedAtLabel && (status === 'connected' || status === 'paused') && (
              <dd className="mt-1 text-xs text-white/65">Подтверждено: {connectedAtLabel}</dd>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.018] p-4">
            <dt className="text-xs uppercase tracking-wide text-white/65">Активные чаты компаний</dt>
            <dd className="mt-2 flex items-center gap-2 text-sm text-white/80">
              <MessageCircle size={17} className="shrink-0 text-brand-cyan" aria-hidden="true" />
              <span><span className="font-semibold tabular-nums text-white">{chatCount}</span> доступно для проверки</span>
            </dd>
          </div>
        </dl>

        <div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-4 text-sm leading-6 text-amber-50/80">
          <p className="font-medium text-amber-50">Граница автоматической отправки</p>
          <p className="mt-1">
            Business API может автоматически отправить сообщение только в чат компании, где
            входящая активность была в последние 24 часа. Для холодного контакта Лид Радар
            откроет черновик Telegram: текст проверяет и отправляет человек.
          </p>
        </div>

        {showAction && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              size="lg"
              variant={retry ? 'secondary' : 'primary'}
              disabled={pending || actionDisabled}
              aria-busy={pending}
              onClick={action}
              className="min-h-12 w-full sm:w-auto"
            >
              {retry && <RefreshCw size={17} aria-hidden="true" />}
              {actionLabel}
            </Button>
            <p className="text-xs leading-5 text-white/65">
              Подключение не запускает рассылку: каждое действие остаётся под явным контролем.
            </p>
          </div>
        )}
      </Card>
    </section>
  );
}
