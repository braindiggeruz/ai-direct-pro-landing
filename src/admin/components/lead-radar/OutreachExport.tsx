import { useMemo, useState } from 'react';
import { Check, Download, Loader2, TriangleAlert } from 'lucide-react';
import type { LeadRadarLead } from '../../../shared/lead-radar';
import { recipientContactChoices } from '../../../shared/lead-radar-recipient-contacts';
import { api } from '../../lib/api';
import { Button } from '../ui';

/**
 * Outreach export.
 *
 * The Telegram campaign needs a connected account and a resolved corporate
 * endpoint, which most discovered businesses never get. Those leads are still
 * real businesses with real phone numbers, so this turns them into a contact
 * list the owner can import into a phone book, a dialer or WhatsApp and use
 * today instead of waiting on Telegram verification.
 */
export function OutreachExport({ searchId, leads }: { searchId: string; leads: LeadRadarLead[] }) {
  const [busy, setBusy] = useState<'csv' | 'vcf' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reachable = useMemo(
    () => leads.filter((lead) => recipientContactChoices(lead).selectable).length,
    [leads],
  );

  async function download(format: 'csv' | 'vcf'): Promise<void> {
    setBusy(format);
    setError(null);
    setDone(null);
    try {
      const { blob, filename, rows } = await api.leadRadarExportContacts(searchId, format);
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      setDone(`Готово: ${rows} ${plural(rows)}`);
    } catch (cause) {
      setError(describeFailure(cause));
    } finally {
      setBusy(null);
    }
  }

  if (reachable === 0) {
    return (
      <p className="text-xs text-white/55">
        Экспорт появится, когда у компаний будут телефон или Telegram.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-white/60">
        Готово к рассылке: <strong className="font-semibold text-white">{reachable}</strong>
      </span>
      <Button
        type="button"
        variant="secondary"
        disabled={busy !== null}
        onClick={() => { void download('csv'); }}
        className="min-h-11"
        aria-label="Скачать список контактов в CSV"
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
            : null}
      </span>
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
