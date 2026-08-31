import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Globe2, LoaderCircle, RefreshCw, Square, Workflow } from 'lucide-react';
import type {
  LeadRadarCrawlerJobReadModel,
  LeadRadarCrawlerStatusResponse,
} from '../../../shared/lead-radar-crawler';
import { api } from '../../lib/api';
import { Badge, Button } from '../ui';

const ACTIVE = new Set(['queued', 'running', 'deferred']);
const JOB_COPY: Record<LeadRadarCrawlerJobReadModel['status'], string> = {
  queued: 'В очереди',
  running: 'Собирает',
  deferred: 'Ожидает повтор',
  completed: 'Готово',
  partial: 'Частично',
  failed: 'Ошибка',
  cancelled: 'Остановлено',
};
const REASON_COPY: Record<string, string> = {
  crawler_disabled: 'Сборщик выключен на сервере.',
  crawler_not_configured: 'Локальный worker ещё не привязан.',
  crawler_offline: 'Локальный worker сейчас не отвечает.',
  source_deferred: 'Источник попросил повторить проверку позже.',
  worker_lease_expired: 'Worker потерял соединение; задача возвращена в очередь.',
  owner_cancelled: 'Задача остановлена владельцем.',
  attempt_limit: 'Исчерпан безопасный лимит повторов.',
};

function formatDate(value: string | null): string {
  if (!value) return 'ещё не подключался';
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf())
    ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(parsed)
    : value;
}

export function LeadRadarCrawlerCard({
  companyId,
  website,
  onContactsUpdated,
}: {
  companyId: string;
  website: string | null;
  onContactsUpdated: () => void;
}) {
  const [status, setStatus] = useState<LeadRadarCrawlerStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notifiedJobs = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const next = await api.leadRadarCrawlerStatus(companyId);
      setStatus(next);
      setError(null);
      for (const job of next.jobs) {
        if ((job.status === 'completed' || job.status === 'partial') && !notifiedJobs.current.has(job.id)) {
          notifiedJobs.current.add(job.id);
          onContactsUpdated();
        }
      }
      return next;
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Не удалось проверить сборщик.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [companyId, onContactsUpdated]);

  useEffect(() => {
    notifiedJobs.current.clear();
    setLoading(true);
    void load();
  }, [load]);

  const active = status?.jobs.find((job) => ACTIVE.has(job.status)) ?? null;
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => { void load(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [active, load]);

  async function create(): Promise<void> {
    if (!website || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.leadRadarCreateCrawlerJob(companyId, `crawler-ui-${crypto.randomUUID()}`);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Не удалось запустить сборщик.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(jobId: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.leadRadarCancelCrawlerJob(jobId);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Не удалось остановить задачу.');
    } finally {
      setBusy(false);
    }
  }

  if (!loading && status?.enabled === false) return null;
  const latest = status?.jobs[0] ?? null;
  const ready = status?.ready === true;
  const reason = status?.reason ? REASON_COPY[status.reason] ?? status.reason : null;

  return (
    <section aria-labelledby={`crawler-title-${companyId}`} data-testid="lead-radar-crawler-card" className="mt-4 rounded-2xl border border-brand-cyan/20 bg-brand-cyan/[0.045] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">Публичный сайт компании</p>
          <h4 id={`crawler-title-${companyId}`} className="mt-1 flex items-center gap-2 text-sm font-semibold text-white"><Workflow size={16} aria-hidden="true" />Локальный сборщик</h4>
          <p className="mt-2 max-w-xl text-xs leading-5 text-white/65">Проверяет только публичные страницы указанного сайта, сохраняет источники и не разрешает отправку сообщений.</p>
        </div>
        <Badge tone={ready ? 'success' : status?.enabled ? 'warning' : 'neutral'}>
          <span className="inline-flex items-center gap-1.5"><Activity size={12} aria-hidden="true" />{ready ? 'Worker онлайн' : loading ? 'Проверяем…' : 'Не готов'}</span>
        </Badge>
      </div>

      {website ? <a href={website} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 text-xs text-brand-cyan hover:underline"><Globe2 size={14} aria-hidden="true" />{website}</a>
        : <p className="mt-3 text-xs text-amber-100">У компании нет подтверждённого сайта — запуск недоступен.</p>}
      {reason && <p className="mt-3 text-xs leading-5 text-amber-100">{reason}</p>}
      {error && <p role="alert" className="mt-3 text-xs leading-5 text-rose-200">{error}</p>}

      {latest && (
        <div className="mt-4 grid gap-2 rounded-xl border border-white/[0.08] bg-black/15 p-3 text-xs text-white/65 sm:grid-cols-4">
          <span><strong className="block text-white">{JOB_COPY[latest.status]}</strong>состояние</span>
          <span><strong className="block text-white">{latest.pagesAccepted}</strong>страниц принято</span>
          <span><strong className="block text-white">{latest.contactsFound}</strong>контактов найдено</span>
          <span><strong className="block text-white">{formatDate(latest.updatedAt)}</strong>обновлено</span>
        </div>
      )}
      {status?.worker && <p className="mt-2 text-[11px] text-white/50">Worker: {status.worker.name}; последний сигнал {formatDate(status.worker.lastSeenAt)}.</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {active ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void cancel(active.id)}>
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Square size={14} aria-hidden="true" />}
            Остановить
          </Button>
        ) : (
          <Button type="button" disabled={!website || !ready || busy} onClick={() => void create()}>
            {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Workflow size={15} aria-hidden="true" />}
            Собрать контакты с сайта
          </Button>
        )}
        <Button type="button" variant="secondary" disabled={loading || busy} onClick={() => void load()}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />Проверить статус
        </Button>
      </div>
    </section>
  );
}
