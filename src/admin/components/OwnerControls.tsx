// Shared controls for the P3.1 Owner Control Center.
//
// The mutation dialog is the single place a platform-owner action is confirmed,
// so the reason code and the typed confirmation cannot be forgotten on one
// screen and enforced on another. The server enforces both independently; this
// exists so the operator is never surprised by a rejection.
import { useMemo, useState } from 'react';
import { NavLink } from 'react-router';
import { Badge, Button, Card, Input, Label, Select } from './ui';
import {
  newOwnerIdempotencyKey,
  OWNER_REASON_CODES,
  OWNER_REASON_LABELS,
  requiresTypedConfirmation,
  type OwnerAuditAction,
  type OwnerReasonCode,
} from '../../shared/owner-control-center';
import type { OwnerMutationInput } from '../lib/owner-api';

const TABS: ReadonlyArray<{ to: string; label: string; end?: boolean }> = [
  { to: '/admin-tools/agents', label: 'Обзор', end: true },
  { to: '/admin-tools/agents/stores', label: 'Магазины' },
  { to: '/admin-tools/agents/orders', label: 'Заказы' },
  { to: '/admin-tools/agents/handoffs', label: 'Передачи' },
  { to: '/admin-tools/agents/automation', label: 'Автоматизация' },
  { to: '/admin-tools/agents/audit', label: 'Аудит' },
  { to: '/admin-tools/agents/pilot', label: 'Пилот' },
];

export function OwnerNav() {
  return (
    <nav className="flex flex-wrap gap-2" data-testid="owner-nav">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-full text-sm border transition ${
              isActive
                ? 'border-brand-cyan/50 text-brand-cyan bg-brand-cyan/10'
                : 'border-white/10 text-white/60 hover:text-white/80'
            }`}
          data-testid={`owner-nav-${tab.to.split('/').pop()}`}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function OwnerHeader({
  title,
  subtitle,
  role,
  children,
}: {
  title: string;
  subtitle?: string;
  role?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40">
            GPTBot Owner Control Center
          </div>
          <h1 className="font-display text-2xl text-white mt-1" data-testid="owner-heading">{title}</h1>
          {subtitle && <p className="text-white/50 text-sm mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {role && (
            <Badge tone={role === 'platform_owner' ? 'success' : 'info'}>
              <span data-testid="owner-role">{role}</span>
            </Badge>
          )}
          {children}
        </div>
      </div>
      <OwnerNav />
    </div>
  );
}

export function ReadOnlyNotice({ role }: { role?: string }) {
  if (role !== 'support_readonly') return null;
  return (
    <Card className="border-sky-500/30 bg-sky-500/5" data-testid="owner-readonly-notice">
      <div className="text-sky-200 text-sm">
        Роль <code>support_readonly</code>: доступно только чтение. Кнопки действий скрыты,
        и сервер отклонит любую попытку изменения.
      </div>
    </Card>
  );
}

export function OwnerLoadingCard({ label = 'Загрузка данных…' }: { label?: string }) {
  return (
    <Card className="border-white/10" data-testid="owner-loading" aria-live="polite">
      <div className="text-white/50 text-sm">{label}</div>
    </Card>
  );
}

export function OwnerErrorCard({ error }: { error: { code?: string; requestId?: string | null } | null }) {
  if (!error) return null;
  return (
    <Card className="border-red-500/30 bg-red-500/5" data-testid="owner-error">
      <div className="text-red-300 text-sm">
        Ошибка: <code data-testid="owner-error-code">{error.code ?? 'unknown'}</code>
        {error.requestId && <> · request_id <code>{error.requestId}</code></>}
      </div>
    </Card>
  );
}

export interface MutationDialogProps {
  action: OwnerAuditAction;
  title: string;
  targetId: string;
  targetLabel: string;
  /** What the operator is about to cause, in one plain sentence. */
  effect: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (input: OwnerMutationInput) => void;
}

/**
 * Reason code is mandatory. For high-impact actions the operator must also
 * retype the exact target id, so a mis-clicked row cannot be confirmed by
 * reflex.
 */
export function MutationDialog({
  action,
  title,
  targetId,
  targetLabel,
  effect,
  busy = false,
  onCancel,
  onConfirm,
}: MutationDialogProps) {
  const [reason, setReason] = useState<OwnerReasonCode | ''>('');
  const [typed, setTyped] = useState('');
  const needsTyped = requiresTypedConfirmation(action);
  const idempotencyKey = useMemo(
    () => newOwnerIdempotencyKey(action, targetId),
    [action, targetId],
  );
  const ready = reason !== '' && (!needsTyped || typed.trim() === targetId);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-dialog-title"
      data-testid="owner-mutation-dialog">
      <Card className="max-w-lg w-full space-y-4">
        <div>
          <h2 id="owner-dialog-title" className="font-display text-lg text-white">{title}</h2>
          <p className="text-white/60 text-sm mt-1">{effect}</p>
          <p className="text-white/40 text-xs mt-2">
            Цель: <code data-testid="owner-dialog-target">{targetLabel}</code>
          </p>
        </div>

        <div>
          <Label hint="Обязательно. Записывается в неизменяемый журнал аудита.">Причина</Label>
          <Select
            value={reason}
            onChange={(e) => setReason(e.target.value as OwnerReasonCode | '')}
            data-testid="owner-dialog-reason">
            <option value="">— выберите причину —</option>
            {OWNER_REASON_CODES.map((code) => (
              <option key={code} value={code}>{OWNER_REASON_LABELS[code]}</option>
            ))}
          </Select>
        </div>

        {needsTyped && (
          <div>
            <Label hint="Введите идентификатор цели точно, символ в символ.">
              Подтверждение
            </Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={targetId}
              data-testid="owner-dialog-confirmation"/>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel} data-testid="owner-dialog-cancel">
            Отмена
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!ready || busy}
            onClick={() => onConfirm({
              reasonCode: reason as OwnerReasonCode,
              idempotencyKey,
              ...(needsTyped ? { confirmation: typed.trim() } : {}),
            })}
            data-testid="owner-dialog-confirm">
            {busy ? 'Выполняется…' : 'Подтвердить'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function MarketplacePlaceholder() {
  return (
    <Card className="border-white/10" data-testid="owner-marketplace-placeholder">
      <h2 className="font-display text-base text-white mb-1">GPTBot AI Market</h2>
      <p className="text-white/50 text-sm">
        Публичный каталог отключён. Он появится в P3.2 вместе с opt-in проекцией
        и модерацией. В P3.1 публичных листингов нет и платежей нет.
      </p>
    </Card>
  );
}
