import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Select, StatTile } from '../../components/ui';
import {
  MutationDialog,
  OwnerErrorCard,
  OwnerHeader,
  OwnerLoadingCard,
  ReadOnlyNotice,
} from '../../components/OwnerControls';
import { ownerApi, type OwnerApiError, type OwnerMutationInput } from '../../lib/owner-api';
import type { OwnerAutomationJobRow } from '../../../shared/owner-control-center';

export default function OwnerAutomation() {
  const [jobs, setJobs] = useState<OwnerAutomationJobRow[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState('all');
  const [error, setError] = useState<OwnerApiError | null>(null);
  const [pending, setPending] = useState<OwnerAutomationJobRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    void ownerApi.automation({ status, limit: 50 })
      .then((r) => {
        setJobs(r.jobs);
        setTotals(r.totals);
        setEnabled(r.first_party_automation_enabled);
      })
      .catch((e: OwnerApiError) => setError(e))
      .finally(() => setLoading(false));
    void ownerApi.overview().then((r) => setRole(r.actor.role)).catch(() => undefined);
  }, [status]);

  useEffect(fetchData, [fetchData]);

  const refresh = () => {
    setError(null);
    setLoading(true);
    fetchData();
  };

  const replay = async (input: OwnerMutationInput) => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ownerApi.replayJob(pending.jobId, input);
      setToast(`replay: ${result.outcome}`);
      setPending(null);
      refresh();
    } catch (e) {
      setError(e as OwnerApiError);
    } finally {
      setBusy(false);
    }
  };

  const canMutate = role === 'platform_owner';

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="owner-automation">
      <OwnerHeader
        title="Автоматизация"
        subtitle="Журнал заданий в D1. Повтор из DLQ доступен только владельцу платформы."
        role={role}/>
      <ReadOnlyNotice role={role}/>
      <OwnerErrorCard error={error}/>
      {loading && <OwnerLoadingCard/>}
      {toast && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <div className="text-emerald-300 text-sm" data-testid="owner-toast">{toast}</div>
        </Card>
      )}

      {enabled === false && (
        <Card className="border-amber-500/40 bg-amber-500/10" data-testid="owner-automation-disabled">
          <div className="text-amber-200 text-sm">
            <code>FIRST_PARTY_AUTOMATION_ENABLED</code> не равен <code>true</code> на этом
            деплое: Cron и потребитель очереди простаивают, а повтор из DLQ отклоняется.
          </div>
        </Card>
      )}

      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label="В очереди" value={totals.queued ?? 0}/>
        <StatTile label="Ждут повтора" value={totals.retry_wait ?? 0} tone={(totals.retry_wait ?? 0) ? 'warning' : 'neutral'}/>
        <StatTile label="На проверке" value={totals.awaiting_review ?? 0} tone="info"/>
        <StatTile label="В DLQ" value={totals.dead_letter ?? 0} tone={(totals.dead_letter ?? 0) ? 'danger' : 'neutral'} testId="owner-automation-dlq"/>
        <StatTile label="Завершены" value={totals.completed ?? 0}/>
        <StatTile label="Отменены" value={totals.cancelled ?? 0}/>
      </div>

      <Card>
        <div className="text-white/40 text-xs mb-1">Статус</div>
        <Select value={status} onChange={(e) => {
          setError(null);
          setLoading(true);
          setStatus(e.target.value);
        }} data-testid="owner-automation-filter">
          <option value="all">все</option>
          <option value="queued">queued</option>
          <option value="retry_wait">retry_wait</option>
          <option value="awaiting_review">awaiting_review</option>
          <option value="dead_letter">dead_letter</option>
          <option value="completed">completed</option>
          <option value="cancelled">cancelled</option>
        </Select>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]" data-testid="owner-automation-table">
          <thead className="text-white/40 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left py-2">Задание</th>
              <th className="text-left py-2">Тип</th>
              <th className="text-left py-2">Статус</th>
              <th className="text-right py-2">Попытки</th>
              <th className="text-left py-2">Код ошибки</th>
              <th className="text-left py-2">Результат</th>
              <th className="text-right py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.jobId} className="border-t border-white/5" data-testid={`owner-job-${job.jobId}`}>
                <td className="py-2 text-white/50 text-xs">{job.jobId}</td>
                <td className="py-2 text-white/60">{job.jobType}</td>
                <td className="py-2">
                  <Badge tone={job.status === 'dead_letter' ? 'danger' : job.status === 'awaiting_review' ? 'info' : 'neutral'}>
                    {job.status}
                  </Badge>
                </td>
                <td className="py-2 text-right">{job.attemptCount}/{job.maxAttempts}</td>
                <td className="py-2 text-white/60">{job.lastErrorCode ?? '—'}</td>
                <td className="py-2 text-white/50 text-xs">{job.resultRef ?? '—'}</td>
                <td className="py-2 text-right">
                  {canMutate && job.status === 'dead_letter' && (
                    <Button variant="ghost" size="sm" onClick={() => setPending(job)}
                      data-testid={`owner-replay-${job.jobId}`}>
                      Повторить
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-white/40">Заданий нет</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {pending && (
        <MutationDialog
          action="automation.replay"
          title="Повторить задание из DLQ"
          targetId={pending.jobId}
          targetLabel={pending.jobId}
          effect="Задание вернётся в очередь со сброшенным счётчиком попыток. Повторный запрос с тем же ключом идемпотентности не создаст второе задание."
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={replay}/>
      )}
    </div>
  );
}
