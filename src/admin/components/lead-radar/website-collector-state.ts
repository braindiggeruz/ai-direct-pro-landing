import type { LeadRadarCrawlerJobSummary, LeadRadarCrawlerStatus } from '../../../shared/lead-radar-crawler';

export const CRAWLER_STATUS_MAX_POLLS = 24;

export function crawlerJobIsActive(job: LeadRadarCrawlerJobSummary | null): boolean {
  return job?.status === 'queued' || job?.status === 'running' || job?.status === 'deferred';
}

export function latestCrawlerJob(status: LeadRadarCrawlerStatus | null, companyId: string): LeadRadarCrawlerJobSummary | null {
  return status?.jobs.filter((job) => job.companyId === companyId)
    .reduce<LeadRadarCrawlerJobSummary | null>((latest, job) => !latest || job.updatedAt > latest.updatedAt ? job : latest, null) ?? null;
}

export function crawlerPollDelay(status: LeadRadarCrawlerStatus, companyId: string, polls: number): number | null {
  const job = latestCrawlerJob(status, companyId);
  if (!status.enabled || !crawlerJobIsActive(job) || polls >= CRAWLER_STATUS_MAX_POLLS) return null;
  if (!status.worker?.online) return 30_000;
  return job?.status === 'deferred' ? 15_000 : 5_000;
}

export function crawlerReasonCopy(reason: string | null | undefined): string | null {
  switch (reason) {
    case 'crawler_not_configured': return 'Локальный сборщик ещё не подключён. Обычный поиск и сохранённые контакты работают независимо.';
    case 'crawler_schema_unavailable': return 'Серверная часть сборщика ещё не готова. Сохранённые данные не изменены.';
    case 'source_rate_limited':
    case 'host_cooldown': return 'Сайт ограничил частоту запросов. Сбор продолжится после разрешённой паузы.';
    case 'robots_unavailable':
    case 'robots_redirect': return 'Не удалось подтвердить правила доступа сайта. Сборщик не обходит это ограничение.';
    case 'robots_disallowed':
    case 'source_denied': return 'Сайт не разрешил автоматическое чтение. Уже найденные данные сохранены.';
    case 'source_unavailable':
    case 'source_timeout':
    case 'fetch_error':
    case 'tls_error': return 'Сайт временно не удалось прочитать. Это не означает, что у компании нет контактов.';
    case 'worker_unavailable': return 'Нет связи с компьютером сборщика. Сервер хранит состояние задания.';
    case 'identity_changed': return 'Карточка компании изменилась. Результат требует новой проверки.';
    case 'invalid_url':
    case 'non_public_address': return 'Адрес сайта не прошёл проверку безопасности.';
    case 'body_too_large':
    case 'page_limit':
    case 'deadline_exceeded': return 'Достигнут безопасный предел обработки. Принятые результаты сохранены.';
    case 'unsupported_content_type': return 'Источник вернул документ неподдерживаемого типа.';
    default: return null;
  }
}

export function crawlerJobCopy(status: LeadRadarCrawlerStatus, job: LeadRadarCrawlerJobSummary | null): { title: string; detail: string } {
  if (!status.ready) return { title: 'Сборщик ещё не готов', detail: crawlerReasonCopy(status.reason) ?? 'Подключение сборщика ещё не завершено. Остальные функции Lead Radar доступны.' };
  const reason = crawlerReasonCopy(job?.reason);
  switch (job?.status) {
    case 'queued': return status.worker?.online
      ? { title: 'Задание в очереди', detail: 'Сборщик получит его автоматически. Вкладку можно закрыть.' }
      : { title: 'Ожидаем компьютер', detail: 'Задание сохранено. Сбор начнётся, когда локальный сборщик подключится.' };
    case 'running': return status.worker?.online
      ? { title: 'Читаем сайт', detail: 'Проверяем опубликованные контакты. Ниже — только принятые сервером результаты.' }
      : { title: 'Нет связи со сборщиком', detail: 'Сервер хранит задание. Ждём подключения компьютера; это не завершённая проверка.' };
    case 'deferred': return { title: 'Ожидаем доступности сайта', detail: reason ?? 'Задание отложено. Принятые результаты сохранены, повтор запланирован сервером.' };
    case 'completed': return { title: 'Сбор завершён', detail: job.contactsFound > 0 ? 'Находки сохранены в карточке. Проверка Telegram и допуск к рассылке выполняются отдельно.' : 'Новые подходящие контакты не найдены. Это не доказывает их отсутствие у компании.' };
    case 'partial': return { title: 'Сохранён частичный результат', detail: reason ?? 'Не все страницы удалось проверить. Уже принятые находки доступны в карточке.' };
    case 'failed': return { title: 'Сбор не завершён', detail: reason ?? 'Не удалось завершить задание. Сохранённые ранее контакты не удалены.' };
    case 'cancelled': return { title: 'Сбор остановлен', detail: 'Новые страницы не принимаются. Ранее сохранённые результаты остаются в карточке.' };
    default: return { title: 'Контакты с сайта', detail: 'Проверим публичные страницы сайта компании и сохраним находки вместе с источниками.' };
  }
}

type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const pendingStorageKey = (companyId: string) => `gptbot:lead-radar:crawler:create:${companyId}`;

export function readCrawlerCreateKey(companyId: string, storage: PendingStorage | null): string | null {
  try {
    const key = storage?.getItem(pendingStorageKey(companyId));
    return key && /^lr-crawler-ui-[a-f0-9-]{36}$/.test(key) ? key : null;
  } catch { return null; }
}

export function ensureCrawlerCreateKey(companyId: string, storage: PendingStorage | null, createId: () => string): string {
  const key = readCrawlerCreateKey(companyId, storage) ?? `lr-crawler-ui-${createId()}`;
  try { storage?.setItem(pendingStorageKey(companyId), key); } catch { /* A ref still preserves this attempt in the current tab. */ }
  return key;
}

export function clearCrawlerCreateKey(companyId: string, storage: PendingStorage | null): void {
  try { storage?.removeItem(pendingStorageKey(companyId)); } catch { /* Replaying an acknowledged key is safe. */ }
}

/** Coalesces findings without losing a terminal update that arrives during a slow read. */
export function createCrawlerResultRefresh(options: {
  refresh: () => void | Promise<void>;
  onError: () => void;
  onRecovered: () => void;
}): { accept: (job: LeadRadarCrawlerJobSummary) => void; stop: () => void } {
  const accepted = new Map<string, number>();
  const pending = new Map<string, LeadRadarCrawlerJobSummary>();
  let stopped = false;
  let draining = false;
  async function drain(): Promise<void> {
    if (draining || stopped) return;
    draining = true;
    try {
      while (!stopped && pending.size > 0) {
        const job = pending.values().next().value!;
        try { await options.refresh(); }
        catch { if (!stopped) options.onError(); break; }
        if (stopped) return;
        accepted.set(job.id, job.pagesAccepted);
        if (pending.get(job.id)?.pagesAccepted === job.pagesAccepted) pending.delete(job.id);
        options.onRecovered();
      }
    } finally { draining = false; }
  }
  return {
    accept: (job) => {
      if (stopped || job.pagesAccepted <= (accepted.get(job.id) ?? 0)) return;
      if (job.pagesAccepted >= (pending.get(job.id)?.pagesAccepted ?? 0)) pending.set(job.id, job);
      void drain();
    },
    stop: () => { stopped = true; pending.clear(); },
  };
}

/** Polls server state only. A timer never creates jobs or retries a source itself. */
export function startCrawlerStatusPolling(options: {
  companyId: string;
  read: (signal: AbortSignal) => Promise<LeadRadarCrawlerStatus>;
  onStatus: (status: LeadRadarCrawlerStatus) => void;
  onError: (error: unknown) => void;
  onPaused: (paused: boolean) => void;
  onBusy: (busy: boolean) => void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clear?: (timer: ReturnType<typeof setTimeout>) => void;
}): () => void {
  let stopped = false;
  let polls = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const schedule = options.schedule ?? setTimeout;
  const clear = options.clear ?? clearTimeout;
  async function read(): Promise<void> {
    if (stopped) return;
    options.onBusy(true);
    try {
      const status = await options.read(controller.signal);
      if (stopped) return;
      options.onStatus(status);
      const delay = crawlerPollDelay(status, options.companyId, polls);
      options.onPaused(delay === null && status.enabled && crawlerJobIsActive(latestCrawlerJob(status, options.companyId)));
      if (delay !== null) timer = schedule(() => { polls += 1; void read(); }, delay);
    } catch (error) {
      if (!stopped) { options.onError(error); options.onPaused(true); }
    } finally {
      if (!stopped) options.onBusy(false);
    }
  }
  void read();
  return () => {
    stopped = true;
    controller.abort();
    if (timer !== undefined) clear(timer);
  };
}
