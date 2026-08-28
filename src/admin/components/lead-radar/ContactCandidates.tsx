import { useEffect, useRef, useState } from 'react';
import type { LeadRadarContactCandidate } from '../../../shared/lead-radar-contacts';
import { LEAD_RADAR_CONTACT_REASON_COPY } from '../../../shared/lead-radar-contacts';
import type { TelegramContactResolution } from '../../../shared/lead-radar-contact-resolution';
import { api } from '../../lib/api';

function resolutionCopy(result: TelegramContactResolution): string {
  if (result.status === 'resolved') return `Telegram найден: @${result.username}. Отправка не запускалась; основание для контакта проверяется отдельно.`;
  if (result.status === 'pending') return 'Ждём ответ Bridge. Ничего не отправляем.';
  if (result.reason === 'bridge_update_required') return 'Нужно обновить локальный Bridge до 1.4.0.';
  if (result.reason === 'bridge_offline') return 'Bridge не в сети. Запустите программу на компьютере.';
  if (result.reason === 'no_public_username') return 'Аккаунт найден, но у него нет публичного username. Автоматическая отправка по этому номеру пока недоступна.';
  if (result.status === 'limited') return `Telegram ограничил проверки. Пауза: ${result.retryAfterSeconds ?? 60} сек. Автоповтора нет.`;
  if (result.reason === 'privacy_or_missing') return 'Проверка не дала результата: номер может быть скрыт настройками приватности или не зарегистрирован. Отправка закрыта.';
  if (result.reason === 'not_regular_user') return 'Это не обычный аккаунт: бот, группа или канал исключены.';
  if (result.reason === 'corporate_source_required') return 'Нет свежего подтверждения принадлежности контакта компании.';
  return 'Результат не подтверждён. Проверьте подключение и повторите позже; сообщения не отправлялись.';
}

/** Source evidence, line type and Telegram reachability are deliberately separate. */
export function ContactCandidates({ candidates = [], searchId, companyId, canCheck, onResolved }: {
  candidates?: LeadRadarContactCandidate[]; searchId: string; companyId: string; canCheck: boolean; onResolved: () => void;
}) {
  const [results, setResults] = useState<Record<string, TelegramContactResolution>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function check(candidateKey: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(candidateKey); setError(null);
    const deadline = Date.now() + 125_000;
    try {
      while (mounted.current) {
        const result = await api.leadRadarResolveContact(searchId, companyId, candidateKey);
        if (!mounted.current) return;
        setResults((current) => ({ ...current, [candidateKey]: result }));
        if (result.status !== 'pending') { if (result.status === 'resolved') onResolved(); break; }
        if (Date.now() >= deadline) { setError('Bridge ещё не ответил. Проверка сохранена; нажмите «Проверить Telegram» позже, повторной отправки сообщений не будет.'); break; }
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
      }
    } catch { if (mounted.current) setError('Не удалось получить результат. Проверьте состояние аккаунта и соединение.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(null); }
  }
  if (!candidates.length) return null;
  return <details className="mt-3 rounded-xl border border-white/10 p-3 text-xs text-white/70">
    <summary className="cursor-pointer py-1 font-medium">Найденные контакты и причины исключения ({candidates.length})</summary>
    <ul className="mt-3 space-y-3">
      {candidates.map((candidate) => <li key={candidate.key}>
        <p className="break-all font-mono text-white/90">{candidate.value}</p>
        <p className="mt-1 leading-5">{LEAD_RADAR_CONTACT_REASON_COPY[candidate.reason] ?? 'Нужна проверка контакта'}</p>
        {candidate.lookupEligible && <button type="button" disabled={!canCheck || busy !== null} onClick={() => void check(candidate.key)} className="mt-2 min-h-11 rounded-lg border border-brand-cyan/30 px-3 text-brand-cyan disabled:opacity-50">
          {busy === candidate.key ? 'Проверяем без отправки…' : 'Проверить Telegram'}
        </button>}
        {results[candidate.key] && <p role="status" className="mt-2 leading-5">{resolutionCopy(results[candidate.key])}</p>}
        {candidate.resolution && <p>Проверка Telegram: {candidate.resolution === 'resolved' ? 'аккаунт найден; разрешение на отправку проверяется отдельно' : candidate.resolution === 'pending' ? 'ожидает Bridge' : 'результат не подтверждён'}</p>}
        {candidate.sourceUrl && <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center text-brand-cyan underline">Источник контакта</a>}
      </li>)}
    </ul>
    {error && <p role="alert" className="mt-3 text-amber-200">{error}</p>}
    <p className="mt-3 leading-5 text-white/50">Мобильный номер не доказывает наличие Telegram. Стационарные, служебные и неоднозначные номера остаются в карточке, но не попадают в автоматическую проверку номеров.</p>
  </details>;
}
