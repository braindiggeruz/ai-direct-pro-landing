import { useId, useState, type FormEvent } from 'react';
import { FileText, RefreshCw, Download, X } from 'lucide-react';
import { getToken } from '../lib/api';
import { createDocumentsApi, documentActive, documentError, documentExpired, type ProposalDocument } from '../../../apps/studio/src/tools/presentation/document-api';
import { documentStatusText, useDocumentJobs } from '../../../apps/studio/src/tools/presentation/DocumentExport';

const api = createDocumentsApi({ base: '/api/admin/documents', token: getToken });
const FIELD = 'mt-2 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-3 text-sm text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-50';
const BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-50';

export default function Documents() {
  const state = useDocumentJobs(api);
  const id = useId();
  const [locale, setLocale] = useState<'ru' | 'uz'>('ru');
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [objective, setObjective] = useState('');
  const [scope, setScope] = useState('');
  const [budgetTerms, setBudgetTerms] = useState('');
  const [validation, setValidation] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const lines = scope.split('\n').map(line => line.trim()).filter(Boolean);
    if (!company.trim() || !objective.trim()) { setValidation('Укажите компанию и цель проекта.'); return; }
    if (lines.length > 30 || lines.some(line => line.length > 1000)) { setValidation('В составе работ допускается до 30 строк, до 1000 символов в каждой.'); return; }
    setValidation('');
    const payload: ProposalDocument['payload'] = {
      locale, company: company.trim(), objective: objective.trim(), packageId: 'custom',
      ...(contact.trim() ? { contact: contact.trim() } : {}),
      ...(lines.length ? { scope: lines } : {}),
      ...(budgetTerms.trim() ? { budgetTerms: budgetTerms.trim() } : {}),
    };
    void state.create({ type: 'proposal_pdf', payload });
  };
  return <div className="ym-hide-content mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8" data-testid="documents-page">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-brand-cyan">GPTBot · Документы</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Коммерческое предложение</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">PDF-черновик на основе ваших условий. Проверьте содержание перед отправкой клиенту.</p></div>
      <button type="button" className={BUTTON} onClick={() => void state.refresh()} disabled={state.refreshing || !!state.busy}><RefreshCw size={16} aria-hidden="true" />{state.refreshing ? 'Обновляем…' : 'Обновить статус'}</button>
    </header>
    <div className="rounded-2xl border border-brand-cyan/20 bg-brand-cyan/5 p-4 text-sm leading-relaxed text-white/75" id={`${id}-privacy`}>После нажатия «Создать PDF-черновик» введённый текст отправится на сервер. Текст и PDF хранятся 24 часа, затем удаляются. Баланс платного чата не расходуется. Цены, сроки и результаты клиентов автоматически не добавляются.</div>
    {state.availability === 'checking' && <p role="status" className="text-sm text-white/60">Проверяем доступность документов…</p>}
    {state.availability === 'unavailable' && <p role="status" className="rounded-xl border border-white/10 p-4 text-white/70">Облачные документы пока недоступны. Включение сервиса ожидается.</p>}
    {state.error && state.availability !== 'unavailable' && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-200">{documentError(state.error, 'ru')}</p>}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
      <form onSubmit={submit} className="ym-disable-submit space-y-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-6" aria-describedby={`${id}-privacy`}>
        <div className="flex items-center gap-3"><span className="rounded-xl bg-brand-blue/15 p-3 text-brand-cyan"><FileText size={20} aria-hidden="true" /></span><div><h2 className="font-semibold">Исходные данные</h2><p className="text-xs text-white/50">Обязательны компания и цель проекта</p></div></div>
        <fieldset className="space-y-4" disabled={!!state.busy}>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
            <label htmlFor={`${id}-company`} className="block text-sm text-white/80">Компания *<input id={`${id}-company`} className={`ym-disable-keys ${FIELD}`} value={company} onChange={event => setCompany(event.target.value)} maxLength={200} required autoComplete="organization" placeholder="Название компании" /></label>
            <label htmlFor={`${id}-locale`} className="block text-sm text-white/80">Язык PDF<select id={`${id}-locale`} className={FIELD} value={locale} onChange={event => setLocale(event.target.value as 'ru' | 'uz')}><option value="ru">Русский</option><option value="uz">O‘zbekcha</option></select></label>
          </div>
          <label htmlFor={`${id}-contact`} className="block text-sm text-white/80">Контакт · необязательно<input id={`${id}-contact`} className={`ym-disable-keys ${FIELD}`} value={contact} onChange={event => setContact(event.target.value)} maxLength={300} placeholder="Имя или контакты для предложения" /></label>
          <label htmlFor={`${id}-objective`} className="block text-sm text-white/80">Цель проекта *<textarea id={`${id}-objective`} className={`ym-disable-keys ${FIELD} min-h-32 resize-y`} value={objective} onChange={event => setObjective(event.target.value)} maxLength={5000} required placeholder="Какую задачу нужно решить" /></label>
          <label htmlFor={`${id}-scope`} className="block text-sm text-white/80">Состав работ · необязательно<textarea id={`${id}-scope`} className={`ym-disable-keys ${FIELD} min-h-32 resize-y`} value={scope} onChange={event => setScope(event.target.value)} maxLength={30000} placeholder="Один пункт на строку" aria-describedby={`${id}-scope-hint`} /><span className="mt-1.5 block text-xs text-white/45" id={`${id}-scope-hint`}>До 30 пунктов. Текст переносится в PDF без генерации обещаний.</span></label>
          <label htmlFor={`${id}-terms`} className="block text-sm text-white/80">Бюджет и условия · необязательно<textarea id={`${id}-terms`} className={`ym-disable-keys ${FIELD} min-h-24 resize-y`} value={budgetTerms} onChange={event => setBudgetTerms(event.target.value)} maxLength={2000} placeholder="Только согласованные вами суммы, сроки и условия" /></label>
        </fieldset>
        {validation && <p role="alert" className="text-sm text-red-200">{validation}</p>}
        <button type="submit" className={`${BUTTON} w-full border-brand-cyan/40 bg-brand-blue/20 text-brand-cyan hover:bg-brand-blue/30`} disabled={state.availability !== 'available' || !!state.busy}>{state.busy === 'create' ? 'Отправляем…' : 'Создать PDF-черновик'}</button>
      </form>
      <section aria-labelledby={`${id}-history`} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2"><h2 id={`${id}-history`} className="font-semibold">История документов</h2><span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/60">{state.jobs.length}</span></div>
        <p className="mt-2 text-xs leading-relaxed text-white/50">Список восстанавливается с сервера после открытия страницы. Подготовка продолжается при закрытой вкладке.</p>
        {state.jobs.length === 0 && state.availability === 'available' && <div className="py-12 text-center"><FileText className="mx-auto text-white/20" size={32} aria-hidden="true"/><p className="mt-3 text-sm text-white/50">Пока нет документов</p></div>}
        <ul className="mt-4 space-y-3" aria-live="polite">
          {state.jobs.map(job => {
            const expired = documentExpired(job);
            return <li key={job.id} className="space-y-3 rounded-xl border border-white/10 bg-black/15 p-4" data-document-status={expired ? 'expired' : job.status}>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-medium">{job.type === 'proposal_pdf' ? 'Коммерческое предложение' : 'Презентация'}</p><p className="mt-1 text-xs text-white/45">{new Date(job.createdAt).toLocaleString('ru-RU')} · {job.id.slice(-6)}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-xs ${job.status === 'ready' && !expired ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/5 text-white/60'}`}>PDF</span></div>
              <p className={`text-sm ${job.status === 'failed' ? 'text-red-200' : 'text-white/75'}`}>{documentStatusText.ru[expired ? 'expired' : job.status]}</p>
              {job.status === 'ready' && !expired && <p className="text-xs text-white/45">Доступен до {new Date(job.expiresAt).toLocaleString('ru-RU')}</p>}
              {job.status === 'ready' && !expired && <button type="button" className={`${BUTTON} w-full`} disabled={!!state.busy} onClick={() => void state.act(job, 'download')}><Download size={15} aria-hidden="true" />{state.busy === job.id ? 'Загрузка…' : 'Скачать PDF'}</button>}
              {documentActive(job) && !expired && <button type="button" className={BUTTON} disabled={!!state.busy} onClick={() => void state.act(job, 'cancel')}><X size={15} aria-hidden="true" />{state.busy === job.id ? 'Отменяем…' : 'Отменить'}</button>}
            </li>;
          })}
        </ul>
      </section>
    </div>
  </div>;
}
