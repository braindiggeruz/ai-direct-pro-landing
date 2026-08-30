import type { AudienceDetail, LeadRadarAudience } from '../../shared/lead-radar-audiences';

export type AudienceSaveInput = Pick<LeadRadarAudience, 'id' | 'name' | 'version' | 'companyIds'>;
export interface AudienceSaveResult {
  audience: LeadRadarAudience;
  detail: AudienceDetail | null;
  refreshPending: boolean;
  recovered: boolean;
}

function sameSelection(actual: LeadRadarAudience, input: AudienceSaveInput): boolean {
  return actual.id === input.id && actual.name === input.name.trim()
    && (actual.version === input.version || actual.version === input.version + 1)
    && JSON.stringify([...actual.companyIds].sort()) === JSON.stringify([...input.companyIds].sort());
}

/** A failed read must not turn an acknowledged write into an alleged failed write.
 * Unknown write outcomes are reconciled by reading; never blindly POST again.
 */
export async function saveAudienceWithRecovery(input: AudienceSaveInput, dependencies: {
  save: (input: AudienceSaveInput) => Promise<LeadRadarAudience>;
  read: (id: string) => Promise<AudienceDetail>;
}): Promise<AudienceSaveResult> {
  let saved: LeadRadarAudience;
  try { saved = await dependencies.save(input); }
  catch (failure) {
    const error = failure as { status?: number; code?: string };
    if ((error?.status && error.status >= 400 && error.status < 500) || error?.code === 'UNAUTHENTICATED'
      || error?.code === 'audience_version_conflict') throw failure;
    try {
      const detail = await dependencies.read(input.id);
      if (sameSelection(detail.audience, input)) return { audience: detail.audience, detail, refreshPending: false, recovered: true };
    } catch { /* Preserve the original write outcome; don't replace it with a read failure. */ }
    throw Object.assign(new Error('audience_save_unconfirmed'), {
      code: 'audience_save_unconfirmed', requestId: (failure as {requestId?: string})?.requestId,
    });
  }
  try {
    const detail = await dependencies.read(saved.id);
    if (detail.audience.version === saved.version && sameSelection(detail.audience, { ...input, version: saved.version })) {
      return { audience: saved, detail, refreshPending: false, recovered: false };
    }
  } catch { /* The confirmed version is still saved; only hydration is unavailable. */ }
  return { audience: saved, detail: null, refreshPending: true, recovered: false };
}

export function audienceFailureMessage(failure: unknown): string {
  const error = failure as {code?: string; status?: number; requestId?: string};
  const copy: Record<string, string> = {
    audience_save_unconfirmed: 'Ответ о сохранении не получен. Выбор пока не подтверждён — обновите аудиторию для сверки. Повторная запись автоматически не выполнялась.',
    audience_unavailable: 'Сервис аудитории временно недоступен. Ваш черновик сохранён в этой вкладке; повторите обновление статусов.',
    UNAUTHENTICATED: 'Сессия входа закончилась. Войдите снова, затем продолжите с сохранённого черновика.',
  };
  const message = copy[error?.code ?? ''] ?? (error?.status === 429
    ? 'Слишком много запросов. Подождите немного и обновите статусы; черновик не удалён.'
    : error?.status === 403 ? 'Нет доступа к этому действию. Проверьте вход в аккаунт владельца.'
      : 'Не удалось обновить данные аудитории. Сохранённый список не изменён; повторите обновление.');
  const requestId = error?.requestId;
  return requestId && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId) ? `${message} Код проверки: ${requestId}.` : message;
}
