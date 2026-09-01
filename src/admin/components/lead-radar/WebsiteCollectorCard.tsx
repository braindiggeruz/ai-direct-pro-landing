import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Check, Globe2, LoaderCircle, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui';
import type { LeadRadarCrawlerJobSummary, LeadRadarCrawlerStatus } from '../../../shared/lead-radar-crawler';
import {
  clearCrawlerCreateKey, createCrawlerResultRefresh, crawlerJobCopy, crawlerJobIsActive, ensureCrawlerCreateKey,
  latestCrawlerJob, readCrawlerCreateKey, startCrawlerStatusPolling,
} from './website-collector-state';

function tabStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}

function timeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
}

export function WebsiteCollectorCard({ companyId, website, onContactsUpdated }: {
  companyId: string;
  website: string | null;
  onContactsUpdated: () => void | Promise<void>;
}) {
  const headingId = useId();
  const [snapshot, setSnapshot] = useState<LeadRadarCrawlerStatus | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  const [pollingPaused, setPollingPaused] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resultError, setResultError] = useState(false);
  const [mutation, setMutation] = useState<'create' | 'cancel' | null>(null);
  const [pendingKey, setPendingKey] = useState(() => readCrawlerCreateKey(companyId, tabStorage()));
  const pendingKeyRef = useRef(pendingKey);
  const mutationController = useRef<AbortController | null>(null);
  const resultCallback = useRef(onContactsUpdated);
  const resultRefresh = useRef<ReturnType<typeof createCrawlerResultRefresh> | null>(null);
  const mounted = useRef(false);

  useEffect(() => { resultCallback.current = onContactsUpdated; }, [onContactsUpdated]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; mutationController.current?.abort(); };
  }, []);

  useEffect(() => {
    const updater = createCrawlerResultRefresh({ refresh: () => resultCallback.current(),
      onError: () => setResultError(true), onRecovered: () => setResultError(false) });
    resultRefresh.current = updater;
    return () => { updater.stop(); };
  }, []);
  const refreshResults = useCallback((job: LeadRadarCrawlerJobSummary) => resultRefresh.current?.accept(job), []);

  useEffect(() => startCrawlerStatusPolling({
    companyId,
    read: (signal) => api.leadRadarCrawlerStatus(companyId, signal),
    onStatus: (status) => {
      setSnapshot(status);
      setReadError(null);
      const next = latestCrawlerJob(status, companyId);
      if (next) refreshResults(next);
    },
    onError: () => setReadError('Не удалось обновить статус сборщика. Сохранённые контакты и остальные функции доступны.'),
    onPaused: setPollingPaused,
    onBusy: setRefreshing,
  }), [companyId, refreshVersion, refreshResults]);

  function acceptJob(next: LeadRadarCrawlerJobSummary): void {
    setSnapshot((current) => current ? { ...current, jobs: [next, ...current.jobs.filter((item) => item.id !== next.id)] } : current);
    refreshResults(next);
    setRefreshVersion((current) => current + 1);
  }

  async function createJob(): Promise<void> {
    if (mutationController.current || !snapshot?.ready || !website) return;
    const controller = new AbortController();
    mutationController.current = controller;
    const key = pendingKeyRef.current ?? ensureCrawlerCreateKey(companyId, tabStorage(), () => crypto.randomUUID());
    pendingKeyRef.current = key;
    setPendingKey(key);
    setMutation('create');
    setActionError(null);
    try {
      const result = await api.leadRadarCreateCrawlerJob(companyId, key, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      clearCrawlerCreateKey(companyId, tabStorage());
      pendingKeyRef.current = null;
      setPendingKey(null);
      acceptJob(result.job);
    } catch {
      if (mounted.current && !controller.signal.aborted) {
        setActionError('Создание задания пока не подтверждено. Уточнение результата использует тот же ключ и не создаёт дубликат.');
        setRefreshVersion((current) => current + 1);
      }
    } finally {
      if (mutationController.current === controller) mutationController.current = null;
      if (mounted.current) setMutation(null);
    }
  }

  async function cancelJob(jobId: string): Promise<void> {
    if (mutationController.current) return;
    const controller = new AbortController();
    mutationController.current = controller;
    setMutation('cancel');
    setActionError(null);
    try {
      const result = await api.leadRadarCancelCrawlerJob(jobId, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      acceptJob(result.job);
    } catch {
      if (mounted.current && !controller.signal.aborted) {
        setActionError('Остановка пока не подтверждена сервером. Обновите статус; если задание ещё активно, повторите остановку.');
        setRefreshVersion((current) => current + 1);
      }
    } finally {
      if (mutationController.current === controller) mutationController.current = null;
      if (mounted.current) setMutation(null);
    }
  }

  if (snapshot?.enabled === false) return null;
  // A disabled feature stays invisible; an initial read does not block the company card.
  if (!snapshot && !readError) return null;
  const job = latestCrawlerJob(snapshot, companyId);
  const active = crawlerJobIsActive(job);
  const copy = snapshot ? crawlerJobCopy(snapshot, job) : { title: 'Контакты с сайта', detail: 'Состояние сборщика пока не подтверждено.' };
  const retryAt = job?.status === 'deferred' ? timeLabel(job.availableAt) : null;
  const lastSeen = timeLabel(snapshot?.worker?.lastSeenAt);
  const canCreate = Boolean(snapshot?.enabled && snapshot.ready && website && (!active || pendingKey));
  const busy = mutation !== null;
  const icon = job?.status === 'running' && snapshot?.worker?.online
    ? <LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" />
    : job?.status === 'completed' ? <Check size={18} aria-hidden="true" /> : <Globe2 size={18} aria-hidden="true" />;

  return <section aria-labelledby={headingId} className="mt-4 rounded-2xl border border-brand-cyan/20 bg-brand-cyan/[0.04] p-4">
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-brand-cyan">{icon}</span>
      <div className="min-w-0 flex-1">
        <h4 id={headingId} className="text-base font-semibold text-white">{copy.title}</h4>
        <p className="mt-2 text-sm leading-6 text-white/80" role="status" aria-live="polite">{copy.detail}</p>
      </div>
    </div>
    {job && <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm">
      <div><dt className="text-white/75">Страниц принято</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-white">{job.pagesAccepted}</dd></div>
      <div><dt className="text-white/75">Контактов найдено</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-white">{job.contactsFound}</dd></div>
    </dl>}
    {retryAt && <p className="mt-3 text-sm leading-6 text-amber-100">Повтор источника — не раньше {retryAt}. Обновление статуса не сокращает эту паузу.</p>}
    {snapshot?.worker && !snapshot.worker.online && lastSeen && <p className="mt-3 text-sm text-white/75">Последняя связь с компьютером: {lastSeen}.</p>}
    {!website && snapshot?.enabled && <p className="mt-3 text-sm leading-6 text-white/80">В карточке нет сайта. Сбор доступен после добавления проверенного сайта компании.</p>}
    {pendingKey && !actionError && <p className="mt-3 text-sm leading-6 text-amber-100">Есть неподтверждённый запрос на сбор. Уточните его результат — повтор использует тот же ключ.</p>}
    {(readError || actionError) && <div role="alert" className="mt-3 flex items-start gap-2 text-sm leading-6 text-amber-100">
      <AlertTriangle size={16} className="mt-1 shrink-0" aria-hidden="true" /><div>{actionError && <p>{actionError}</p>}{readError && <p>{readError}</p>}</div>
    </div>}
    {resultError && <p role="alert" className="mt-3 text-sm leading-6 text-amber-100">Результат принят сервером, но карточка ещё не обновилась. Нажмите «Обновить статус», чтобы повторить загрузку контактов.</p>}
    {pollingPaused && active && !readError && <p className="mt-3 text-sm leading-6 text-white/80">Автообновление этой вкладки завершено. Серверное задание не остановлено — статус можно обновить вручную.</p>}
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {canCreate && <Button type="button" className="min-h-12" disabled={busy} onClick={() => { void createJob(); }}>
        {mutation === 'create' ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <Globe2 size={16} aria-hidden="true" />}
        {mutation === 'create' ? 'Сохраняем задание…' : pendingKey ? 'Уточнить результат запроса' : 'Собрать контакты с сайта'}
      </Button>}
      {active && job && <Button type="button" variant="secondary" className="min-h-12" disabled={busy} onClick={() => { void cancelJob(job.id); }}>
        {mutation === 'cancel' ? 'Останавливаем…' : 'Остановить сбор'}
      </Button>}
      <Button type="button" variant="ghost" className="min-h-12" disabled={refreshing || busy} onClick={() => setRefreshVersion((current) => current + 1)}>
        <RefreshCw size={16} className={refreshing ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />Обновить статус
      </Button>
    </div>
    <p className="mt-3 text-sm leading-6 text-white/75">Только сбор публичных данных. Проверка Telegram, разрешение на обращение и отправка сообщений — отдельные действия.</p>
  </section>;
}
