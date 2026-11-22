import { useMemo, useState } from 'react';
import { Check, Download, Loader2, TriangleAlert } from 'lucide-react';
import type { LeadRadarLead } from '../../../shared/lead-radar';
import {
  EXPORT_EXCLUSION_COPY,
  type ExportSummaryWire,
} from '../../../shared/lead-radar-export-contacts';
import { recipientContactChoices } from '../../../shared/lead-radar-recipient-contacts';
import { api } from '../../lib/api';
import { Button } from '../ui';

/**
 * Outreach export.
 *
 * Turns a search — or every search of the same niche and city — into a clean
 * contact file: mobile numbers and Telegram usernames of the businesses
 * themselves. Bots, channels, groups, dead usernames, web-studio handles,
 * placeholder, foreign and shared numbers are left out, and the owner sees how
 * many and why. Usernames are written without `@`, which TG Sender imports.
 */
export function OutreachExport({ searchId, leads }: { searchId: string; leads: LeadRadarLead[] }) {
  const [busy, setBusy] = useState<'csv' | 'vcf' | null>(null);
  const [scope, setScope] = useState<'search' | 'niche'>('search');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [summary, setSummary] = useState<ExportSummaryWire | null>(null);

  const reachable = useMemo(
    () => leads.filter((lead) => recipientContactChoices(lead).selectable).length,
    [leads],
  );

  async function download(format: 'csv' | 'vcf'): Promise<void> {
    setBusy(format);
    setError(null);
    setDone(null);
    try {
      const result = await api.leadRadarExportContacts(searchId, format, scope);
      const url = URL.createObjectURL(result.blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = result.filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      setSummary(result.summary);
      const from = result.searches > 1 ? ` из ${result.searches} поисков` : '';
      setDone(`Готово: ${result.rows} ${plural(result.rows)}${from}`);
    } catch (cause) {
      setError(describeFailure(cause));
    } finally {
      setBusy(null);
    }
  }

  if (reachable === 0 && scope === 'search') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-white/55">
          В этом поиске пока нет компаний с телефоном или Telegram.
        </p>
        <button
          type="button"
          className="self-start text-xs text-sky-300 underline underline-offset-2"
          onClick={() => setScope('niche')}
        >
          Выгрузить все поиски этой ниши и города
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/60">
          С контактами в этом поиске: <strong className="font-semibold text-white">{reachable}</strong>
        </span>
        <div role="radiogroup" aria-label="Что выгрузить" className="inline-flex overflow-hidden rounded-md border border-white/15 text-xs">
          <ScopeOption current={scope} value="search" onSelect={setScope}>Этот поиск</ScopeOption>
          <ScopeOption current={scope} value="niche" onSelect={setScope}>Вся ниша + город</ScopeOption>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => { void download('csv'); }}
          className="min-h-11"
          aria-label="Скачать список контактов в CSV (для TG Sender и таблиц)"
        >
          {busy === 'csv'
            ? <Loader2 size={15} className="motion-safe:animate-spin" aria-hidden="true" />
            : <Download size={15} aria-hidden="true" />}
          CSV
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => { void download('vcf'); }}
          className="min-h-11"
          aria-label="Скачать контакты в формате vCard для телефонной книги"
        >
          {busy === 'vcf'
            ? <Loader2 size={15} className="motion-safe:animate-spin" aria-hidden="true" />
            : <Download size={15} aria-hidden="true" />}
          vCard
        </Button>
        <span aria-live="polite" className="min-h-5 text-xs">
          {error
            ? <span className="inline-flex items-center gap-1 text-amber-300"><TriangleAlert size={13} aria-hidden="true" />{error}</span>
            : done
              ? <span className="inline-flex items-center gap-1 text-emerald-300"><Check size={13} aria-hidden="true" />{done}</span>
              : busy
                ? <span className="text-white/55">Проверяем Telegram-контакты, до 20 секунд…</span>
                : null}
        </span>
      </div>
      {summary ? <ExportSummaryLine summary={summary} /> : null}
    </div>
  );
}

function ScopeOption({
  current, value, onSelect, children,
}: {
  current: 'search' | 'niche';
  value: 'search' | 'niche';
  onSelect: (value: 'search' | 'niche') => void;
  children: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => onSelect(value)}
      className={`min-h-11 px-3 ${active ? 'bg-white/15 font-semibold text-white' : 'text-white/65 hover:bg-white/5'}`}
    >
      {children}
    </button>
  );
}

function reasons(map: Partial<Record<string, number>>): string[] {
  return Object.entries(map)
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([key, count]) => `${EXPORT_EXCLUSION_COPY[key] ?? key} — ${count}`);
}

function ExportSummaryLine({ summary }: { summary: ExportSummaryWire }) {
  const telegram = reasons(summary.excludedTelegram);
  const phones = reasons(summary.excludedPhones);
  const leads = reasons(summary.excludedLeads);
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/70">
      <p>
        В файле <strong className="text-white">{summary.rows}</strong> из {summary.leads} компаний:
        {' '}мобильный — {summary.withMobile}, Telegram — {summary.withTelegram}
        {summary.withVerifiedTelegram ? ` (проверено ${summary.withVerifiedTelegram})` : ''},
        {' '}только городской — {summary.withLandline}.
        {summary.publicChecks ? ` Проверено в Telegram сейчас: ${summary.publicChecks}.` : ''}
      </p>
      {summary.unclassifiedTelegram ? (
        <p>Тип ещё не проверен у {summary.unclassifiedTelegram} Telegram — повторная выгрузка проверит следующих (до 40 за раз).</p>
      ) : null}
      {telegram.length ? <p>Отсеяно Telegram: {telegram.join(', ')}.</p> : null}
      {phones.length ? <p>Отсеяно телефонов: {phones.join(', ')}.</p> : null}
      {leads.length ? <p>Не попали компании: {leads.join(', ')}.</p> : null}
    </div>
  );
}

function plural(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'контакт';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'контакта';
  return 'контактов';
}

function describeFailure(cause: unknown): string {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause
    ? String((cause as { code: unknown }).code)
    : '';
  if (code === 'lead_radar_schema_unavailable') return 'База ещё обновляется, попробуйте через пару минут';
  if (code === 'UNAUTHENTICATED') return 'Сессия истекла, войдите снова';
  if (code === 'search_not_found') return 'Поиск не найден';
  return 'Не удалось выгрузить список, попробуйте снова';
}
