import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { LeadRadarLead } from '../../../shared/lead-radar';
import { api } from '../../lib/api';
import { describeCampaignFailure } from '../../lib/campaign-diagnostics';
import { readContactCheckProgress, restartContactCheckProgress, runSelectedContactChecks, saveContactCheckProgress, selectedContactCheckJobs } from '../../lib/campaign-contact-checks';
import type { LeadRadarCampaignContactBasis, LeadRadarCampaignPreflight } from '../../lib/lead-radar-campaign';
import { Button } from '../ui';

const REASONS: Record<string, string> = {
  verified_corporate_authorized: 'Telegram и основание подтверждены', documented_basis_required: 'Нужно подтверждение реального основания',
  personal_contact_manual_only: 'Принадлежность компании не подтверждена', no_verified_corporate_endpoint: 'Нет проверенного корпоративного Telegram',
  corporate_endpoint_unverified: 'Нужна проверка Telegram и источника', do_not_contact: 'Не связываться', already_contacted: 'Уже связывались',
  previous_delivery_uncertain: 'Предыдущая доставка требует проверки', company_not_found: 'Компания недоступна',
  audience_contact_conflict: 'Конфликт контактов в общей аудитории — исключён',
  bot_not_messageable: 'Бот, не получатель', channel_not_messageable: 'Канал, не получатель', group_not_messageable: 'Группа, не получатель',
  bridge_offline: 'Запустите локальный Bridge', bridge_not_paired: 'Компьютер ещё не привязан', gateway_unavailable: 'Шлюз Telegram недоступен',
  campaign_paused: 'Кампании выключены на сервере', autosend_paused: 'Автоотправка выключена на сервере',
  account_not_connected: 'Telegram-аккаунт не подключён', account_binding_missing: 'Нет серверной привязки аккаунта',
  active_campaign_exists: 'Уже есть незавершённая кампания', daily_limit_exhausted: 'Дневной лимит исчерпан',
  account_safety_cooldown: 'Аккаунт ожидает окончания паузы Telegram', account_safety_restricted: 'Аккаунт ограничен Telegram',
  account_safety_review_required: 'Требуется сверка предыдущей доставки',
};

export interface CampaignReadinessHandle { prepare: () => Promise<LeadRadarCampaignPreflight | null>; cancel: () => void }

export const CampaignReadiness = forwardRef<CampaignReadinessHandle, {
  scope: string; leads: LeadRadarLead[]; excludedIds?: string[]; basis: LeadRadarCampaignContactBasis | '';
  canCheck: boolean; disabled: boolean; revision: number; onUpdated?: () => void;
  onSnapshot: (snapshot: LeadRadarCampaignPreflight | null) => void;
  onSelectReady: (ids: string[]) => void;
}>(function CampaignReadiness({ scope, leads, excludedIds = [], basis, canCheck, disabled, revision, onUpdated, onSnapshot, onSelectReady }, ref) {
  const jobs = useMemo(() => selectedContactCheckJobs(leads, excludedIds), [leads, excludedIds]);
  const [progress, setProgress] = useState(() => readContactCheckProgress(scope));
  const [busy, setBusy] = useState<'contacts' | 'snapshot' | null>(null);
  const [snapshot, setSnapshot] = useState<LeadRadarCampaignPreflight | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancel = useRef(false);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const signature = JSON.stringify([scope, leads.map((lead) => [lead.id, lead.telegramContact?.verifiedAt,
    lead.contactCandidates?.map((candidate) => [candidate.key, candidate.resolution])]), excludedIds, basis, revision]);
  const current = useRef({ onUpdated, onSnapshot, onSelectReady }); current.current = { onUpdated, onSnapshot, onSelectReady };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancel.current = true; }; }, []);
  useEffect(() => { generation.current += 1; cancel.current = true; setSnapshot(null); current.current.onSnapshot(null); }, [signature]);
  useEffect(() => { setProgress(readContactCheckProgress(scope)); }, [scope]);
  const remaining = jobs.filter((job) => !progress.completed.includes(job.companyId)).length;
  async function readSnapshot(version: number): Promise<LeadRadarCampaignPreflight | null> {
    const result: LeadRadarCampaignPreflight = { checkedAt: '', blockers: [], selection: { selected: 0, automatic: 0, manual: 0, excluded: 0, verified: 0, verifiedCompanyIds: [], automaticCompanyIds: [], items: [] } };
    const ids = [...new Set(leads.map((lead) => lead.id))];
    for (let i = 0; i < ids.length; i += 50) {
      const next = await api.leadRadarCampaignPreflight(ids.slice(i, i + 50), basis || null);
      if (!mounted.current || cancel.current || version !== generation.current) return null;
      result.checkedAt = next.checkedAt; result.blockers = [...new Set([...result.blockers, ...next.blockers])];
      // Aggregate limits across batches (audit CP-6): the strictest remaining
      // quota wins, and the latest next-dispatch moment governs the start.
      result.limits = result.limits && next.limits
        ? {
            ...next.limits,
            remainingToday: Math.min(result.limits.remainingToday, next.limits.remainingToday),
            nextDispatchAt: [result.limits.nextDispatchAt, next.limits.nextDispatchAt]
              .filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
          }
        : result.limits ?? next.limits;
      for (const key of ['selected', 'automatic', 'manual', 'excluded', 'verified'] as const) result.selection[key] += next.selection[key];
      result.selection.verifiedCompanyIds.push(...next.selection.verifiedCompanyIds);
      result.selection.automaticCompanyIds.push(...next.selection.automaticCompanyIds);
      result.selection.items.push(...next.selection.items);
    }
    // Directory-level conflict/DNC exclusions may only narrow the server snapshot.
    for (const item of result.selection.items) {
      if (!excludedIds.includes(item.companyId)) continue;
      result.selection[item.classification] -= 1;
      item.classification = 'excluded'; item.reasonCode = 'audience_contact_conflict'; item.authorization = null;
      result.selection.excluded += 1;
    }
    result.selection.automaticCompanyIds = result.selection.automaticCompanyIds.filter((id) => !excludedIds.includes(id));
    result.selection.verifiedCompanyIds = result.selection.verifiedCompanyIds.filter((id) => !excludedIds.includes(id));
    result.selection.verified = result.selection.verifiedCompanyIds.length;
    return result;
  }
  async function inspect() {
    if (busyRef.current || !leads.length) return;
    busyRef.current = true; cancel.current = false; setBusy('snapshot'); setNotice(null);
    const version = generation.current;
    try {
      const result = await readSnapshot(version);
      if (!result) return;
      setSnapshot(result); current.current.onSnapshot(result);
    } catch (error) { if (mounted.current) setNotice(describeCampaignFailure(error, 'Не удалось проверить готовность. Ничего не отправлено.')); }
    finally { busyRef.current = false; if (mounted.current) setBusy(null); }
  }
  // One no-send workflow. It never trims the audience or creates authorization.
  useImperativeHandle(ref, () => ({ cancel: () => { cancel.current = true; setNotice('Приостанавливаем после текущей проверки. Результаты сохраняются.'); }, prepare: async () => {
    if (busyRef.current || !leads.length) return null;
    busyRef.current = true; cancel.current = false; setBusy('contacts'); setNotice(null);
    setSnapshot(null); current.current.onSnapshot(null);
    const version = generation.current;
    try {
      if (canCheck && remaining > 0) {
        const next = await runSelectedContactChecks({ jobs, progress,
          cancelled: () => cancel.current || !mounted.current || version !== generation.current,
          resolve: (job, key) => api.leadRadarResolveContact(job.searchId, job.companyId, key),
          wait: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
          save: (value) => { saveContactCheckProgress(scope, value); if (mounted.current) setProgress(value); },
        });
        if (cancel.current || !mounted.current || version !== generation.current) return null;
        if (next.reason) setNotice(`Проверка контактов приостановлена: ${REASONS[next.reason] ?? next.reason}. Сохранённые результаты учтены; новые сообщения не отправлялись.`);
      }
      setBusy('snapshot');
      const result = await readSnapshot(version);
      if (result) { setSnapshot(result); current.current.onSnapshot(result); }
      return result;
    } catch (error) {
      if (mounted.current) setNotice(describeCampaignFailure(error, 'Не удалось закончить подготовку. Результаты проверок сохранены; сообщения не отправлялись.'));
      return null;
    } finally { busyRef.current = false; if (mounted.current) setBusy(null); }
  } }));
  async function checkContacts(recheck = false) {
    if (busyRef.current || !canCheck) return;
    busyRef.current = true; cancel.current = false; setBusy('contacts'); setNotice(null); setSnapshot(null); current.current.onSnapshot(null);
    const version = generation.current;
    try {
      const startingProgress = recheck ? restartContactCheckProgress(progress) : progress;
      if (recheck) { saveContactCheckProgress(scope, startingProgress); setProgress(startingProgress); }
      const next = await runSelectedContactChecks({ jobs, progress: startingProgress, cancelled: () => cancel.current || !mounted.current,
        resolve: (job, key) => api.leadRadarResolveContact(job.searchId, job.companyId, key),
        wait: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
        save: (value) => { saveContactCheckProgress(scope, value); if (mounted.current) setProgress(value); },
      });
      if (mounted.current) {
        if (!next.reason && !cancel.current) {
          const strict = await readSnapshot(version);
          if (strict) {
            setSnapshot(strict); current.current.onSnapshot(strict);
            setNotice(`Проверка завершена: подтверждены Telegram-контакты (${strict.selection.verified}). Состав аудитории сохранён. Сообщения не отправлялись.`);
          }
        } else setNotice(next.reason ? `Проверка приостановлена: ${REASONS[next.reason] ?? next.reason}.${next.pausedUntil > Date.now() ? ` Повторить не раньше ${new Date(next.pausedUntil).toLocaleTimeString('ru-RU')}.` : ''} Результаты сохранены.`
          : 'Проверка приостановлена. Можно продолжить с сохранённого места.');
        current.current.onUpdated?.();
      }
    } catch (error) { if (mounted.current) setNotice(describeCampaignFailure(error, 'Проверка прервана. Результаты сохранены; продолжите после восстановления соединения.')); }
    finally { busyRef.current = false; if (mounted.current) setBusy(null); }
  }
  return <section className="mt-4 space-y-3 rounded-xl border border-brand-cyan/20 p-3" aria-label="Проверка выбранных получателей">
    <h4 className="font-semibold text-white">Готовность выбранных контактов</h4>
    <p className="text-xs leading-5 text-white/70">Проверка Telegram не отправляет сообщения и не создаёт согласие. Стационарные и личные номера не проверяются. Лимиты Telegram и дневной бюджет сохраняются.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={disabled || busy === 'snapshot' || (!busy && (!canCheck || !remaining))}
        onClick={() => { if (busy === 'contacts') { cancel.current = true; setNotice('Останавливаем после текущей проверки…'); } else void checkContacts(); }} className="min-h-12">
        {busy === 'contacts' ? 'Приостановить проверку' : `Проверить контакты (${remaining})`}
      </Button>
      {remaining === 0 && jobs.length > 0 && <Button type="button" variant="secondary" className="min-h-12"
        disabled={disabled || busy !== null || !canCheck} onClick={() => void checkContacts(true)}>
        Перепроверить актуальность контактов ({jobs.length})
      </Button>}
      <Button type="button" variant="secondary" disabled={disabled || busy !== null || !leads.length} onClick={() => void inspect()} className="min-h-12">
        {busy === 'snapshot' ? 'Получаем причины…' : 'Показать готовность на сервере'}
      </Button>
    </div>
    <p role="status" className="text-xs leading-5 text-white/70">Проверено в этом списке: {jobs.filter((job) => progress.completed.includes(job.companyId)).length}/{jobs.length}. Осталось: {remaining}. После обновления страницы нажмите проверку снова — завершённые компании будут пропущены.</p>
    {notice && <p role="status" className="text-sm leading-6 text-amber-100">{notice}</p>}
    {snapshot && <div className="space-y-2 text-sm" aria-live="polite">
      <p>Telegram подтверждён Bridge: <strong>{snapshot.selection.verified}</strong> · Допущены для авто: {snapshot.selection.automatic} · Нужна проверка/основание: {snapshot.selection.manual} · Исключены: {snapshot.selection.excluded}.</p>
      {snapshot.limits && <p className="text-xs text-white/70">Осталось на текущие UTC-сутки: {snapshot.limits.remainingToday}/{snapshot.limits.dailyLimit}. Интервал: не менее {snapshot.limits.minimumIntervalSeconds} секунд.</p>}
      {snapshot.blockers.length > 0 && <p role="alert" className="text-amber-100">Запуск заблокирован: {snapshot.blockers.map((reason) => REASONS[reason] ?? reason).join('; ')}.</p>}
      {snapshot.selection.verified > 0 && <Button type="button" variant="secondary" className="min-h-12"
        disabled={disabled || busy !== null} onClick={() => onSelectReady(snapshot.selection.verifiedCompanyIds.slice(0, 50))}>
        Выбрать только подтверждённые Telegram ({Math.min(50, snapshot.selection.verified)})
      </Button>}
      <p className="text-xs text-white/60">Это снимок проверки, не запуск. Далее загрузите изображение (если нужно), проверьте точный текст и подтвердите кампанию.</p>
      <details><summary className="min-h-11 cursor-pointer py-3">Причины по каждой компании ({snapshot.selection.items.length})</summary>
        <ul className="max-h-64 space-y-2 overflow-y-auto">{snapshot.selection.items.map((item) => <li key={item.companyId} className="rounded-lg border border-white/10 p-2">
          <strong>{item.name ?? 'Компания недоступна'}</strong>: {REASONS[item.reasonCode] ?? item.reasonCode}
        </li>)}</ul>
      </details>
    </div>}
  </section>;
});
