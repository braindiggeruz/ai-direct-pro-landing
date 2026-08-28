import { useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../ui';
import { FIRECRAWL_STATUS_LABELS, type LeadRadarEnrichmentDiagnostics } from '../../../shared/lead-radar-enrichment';

/** Read-only diagnostics: opening this panel cannot enqueue or pay for a crawl. */
export function FirecrawlDiagnostics({ searchId, companies }: { searchId: string; companies: Array<{ id: string; name: string }> }) {
  const [result, setResult] = useState<LeadRadarEnrichmentDiagnostics | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setPending(true); setError('');
    try { setResult(await api.leadRadarEnrichmentDiagnostics(searchId)); }
    catch { setError('Не удалось получить диагностику. Данные поиска не изменены.'); }
    finally { setPending(false); }
  }
  return <details className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
    <summary className="cursor-pointer text-sm font-medium text-white/70">Обогащение сайтов · Firecrawl</summary>
    <p className="mt-3 text-sm text-white/60">Проверка статуса не запускает платные запросы. Контакт на сайте не означает разрешение на рассылку.</p>
    <Button type="button" variant="secondary" className="mt-3" disabled={pending} onClick={() => { void load(); }}>
      {pending ? 'Загружаем статус…' : 'Показать диагностику'}
    </Button>
    {error && <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p>}
    {result && <div className="mt-3 space-y-3 text-sm" aria-live="polite">
      {!result.schemaReady ? <p>Серверный этап Firecrawl ещё не развёрнут. Обычный поиск работает независимо.</p>
        : result.reports.length === 0 ? <p>В этом поиске нет обработок Firecrawl. Провайдер выключен, ещё не запускался или обычного чтения было достаточно.</p>
          : <>
            <p>Зарезервировано: {result.usage?.reserved_credits ?? 0} кредитов. Это верхняя оценка, не счёт Firecrawl.</p>
            {!!result.usage?.uncertain_requests && <p className="text-amber-200">Запросов с неподтверждённым результатом: {result.usage.uncertain_requests}. Их бюджет не освобождён.</p>}
            <ul className="space-y-3">{result.reports.map((report) => <li key={report.company_id} className="rounded-xl border border-white/10 p-3">
              <p className="font-medium">{companies.find((company) => company.id === report.company_id)?.name ?? 'Компания из поиска'}</p>
              <p className="mt-1 text-white/70">{FIRECRAWL_STATUS_LABELS[report.status] ?? 'Обработка завершена; требуется проверка диагностики'}</p>
              <p className="mt-1 text-xs text-white/50">Страниц: {report.pages} · корпоративных Telegram: {report.contacts} · {report.mode === 'shadow' ? 'сравнение без изменения карточки' : 'дополнительное обогащение'}</p>
            </li>)}</ul>
          </>}
    </div>}
  </details>;
}
