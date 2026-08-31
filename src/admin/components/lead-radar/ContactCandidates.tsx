import { useEffect, useRef, useState } from 'react';
import type { LeadRadarContactCandidate } from '../../../shared/lead-radar-contacts';
import { LEAD_RADAR_CONTACT_REASON_COPY } from '../../../shared/lead-radar-contacts';
import type { TelegramContactResolution } from '../../../shared/lead-radar-contact-resolution';
import type { LeadRadarContactEnrichment } from '../../../shared/lead-radar-contact-sources';
import { api } from '../../lib/api';
import { contactResolutionCopy, ownershipConfirmationCopy } from '../../lib/contact-candidate-feedback';

/** Source evidence, line type and Telegram reachability are deliberately separate. */
export function ContactCandidates({ candidates = [], enrichment, searchId, companyId, canCheck, onResolved }: {
  candidates?: LeadRadarContactCandidate[]; enrichment?: LeadRadarContactEnrichment; searchId: string; companyId: string; canCheck: boolean; onResolved: () => void;
}) {
  const [results, setResults] = useState<Record<string, TelegramContactResolution>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function lookup(candidateKey: string) {
    const deadline = Date.now() + 125_000;
    while (mounted.current) {
      const result = await api.leadRadarResolveContact(searchId, companyId, candidateKey);
      if (!mounted.current) return;
      setResults((current) => ({ ...current, [candidateKey]: result }));
      if (result.status !== 'pending') { if (result.status === 'resolved') onResolved(); break; }
      if (Date.now() >= deadline) { setError('Bridge ещё не ответил. Проверка сохранена; нажмите «Проверить Telegram» позже, повторной отправки сообщений не будет.'); break; }
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
    }
  }
  async function check(candidateKey: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(candidateKey); setError(null); setNotice(null);
    try {
      await lookup(candidateKey);
    } catch { if (mounted.current) setError('Не удалось получить результат. Проверьте состояние аккаунта и соединение.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(null); }
  }
  async function confirmOwnership(candidateKey: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy('ownership'); setError(null); setNotice(null);
    let sourceConfirmed = false;
    try {
      const result = await api.leadRadarConfirmOwnership(companyId, candidateKey);
      if (!mounted.current) return;
      if (!result.confirmed && result.reason !== 'already_confirmed') {
        setError(ownershipConfirmationCopy(result.reason)); return;
      }
      sourceConfirmed = true;
      setNotice(ownershipConfirmationCopy(result.reason));
      onResolved();
      if (canCheck) { setBusy(candidateKey); await lookup(candidateKey); }
      else setNotice(`${ownershipConfirmationCopy(result.reason)} Подключите Bridge, затем нажмите «Проверить Telegram».`);
    } catch { if (mounted.current) setError(sourceConfirmed
      ? 'Источник подтверждён, но ответ проверки Telegram не получен. Подтверждать источник заново не нужно; повторите проверку Telegram позже.'
      : 'Ответ на подтверждение источника не получен. Обновите карточку для сверки; сообщения не отправлялись.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(null); }
  }
  if (!candidates.length && !enrichment) return null;
  return <details className="mt-3 rounded-xl border border-white/10 p-3 text-xs text-white/70">
    <summary className="cursor-pointer py-1 font-medium">Найденные контакты и причины исключения ({candidates.length})</summary>
    {enrichment && <p className="mt-2 leading-5">Поиск публичных контактов: {enrichment.reason==='public_contact_candidates' ? 'найдены контакты в карточках бизнеса; тип аккаунта проверяется через Bridge'
      : /^free_catalog_page_\d+$/.test(enrichment.reason) ? `бесплатный каталог: продолжаем со страницы ${enrichment.reason.split('_').pop()}; сообщения не отправляются`
        : enrichment.reason==='free_catalog_niche_not_supported' ? 'для этой ниши пока проверяются собственные сайты; бесплатный каталог ещё не подключён'
      : enrichment.status==='limited' ? `${({daily_budget_exhausted:'исчерпан дневной лимит Firecrawl',search_budget_exhausted:'исчерпан лимит этого поиска',company_budget_exhausted:'исчерпан лимит проверки этой компании',domain_budget_exhausted:'исчерпан лимит источника',credits_exhausted:'закончились кредиты Firecrawl'} as Record<string,string>)[enrichment.reason] ?? 'остановлен по лимиту расходов'}; результат не означает отсутствие Telegram`
        : enrichment.status==='unavailable' ? 'источник недоступен; отсутствие контакта не подтверждено'
          : enrichment.reason==='shadow_only' ? 'тестовый режим без добавления контактов' : 'в проверенных источниках подходящих контактов не найдено'}.</p>}
    <ul className="mt-3 space-y-3">
      {candidates.map((candidate) => <li key={candidate.key}>
        <p className="break-all font-mono text-white/90">{candidate.value}</p>
        <p className="mt-1 leading-5">{LEAD_RADAR_CONTACT_REASON_COPY[candidate.reason] ?? 'Нужна проверка контакта'}</p>
        {candidate.lookupEligible && candidate.ownership==='unconfirmed' && <p className="leading-5">Проверим только существование и тип аккаунта. Принадлежность компании этим не подтверждается.</p>}
        {candidate.lookupEligible && candidate.kind==='telegram' && candidate.ownership==='unconfirmed' && <button type="button" disabled={busy !== null} onClick={() => void confirmOwnership(candidate.key)} className="mr-2 mt-2 min-h-11 rounded-lg border border-white/20 px-3 text-white/80 disabled:opacity-50">
          {busy === 'ownership' ? 'Проверяем сайт…' : 'Источник проверен — подтвердить и проверить Telegram'}
        </button>}
        {candidate.lookupEligible && <button type="button" disabled={!canCheck || busy !== null} onClick={() => void check(candidate.key)} className="mt-2 min-h-11 rounded-lg border border-brand-cyan/30 px-3 text-brand-cyan disabled:opacity-50">
          {busy === candidate.key ? 'Проверяем без отправки…' : 'Проверить Telegram'}
        </button>}
        {results[candidate.key] && <p role="status" className="mt-2 leading-5">{contactResolutionCopy(results[candidate.key])}</p>}
        {candidate.resolution && <p>Проверка Telegram: {candidate.resolution === 'resolved' ? 'аккаунт найден; разрешение на отправку проверяется отдельно' : candidate.resolution === 'pending' ? 'ожидает Bridge' : 'результат не подтверждён'}</p>}
        {candidate.sourceUrl && <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center text-brand-cyan underline">Источник контакта</a>}
      </li>)}
    </ul>
    {error && <p role="alert" className="mt-3 text-amber-200">{error}</p>}
    {notice && <p role="status" className="mt-3 text-white/80">{notice}</p>}
    <p className="mt-3 leading-5 text-white/50">Мобильный номер не доказывает наличие Telegram. Стационарные, служебные и неоднозначные номера остаются в карточке, но не попадают в автоматическую проверку номеров.</p>
  </details>;
}
