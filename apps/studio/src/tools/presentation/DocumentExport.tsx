/** @jsxRuntime automatic @jsxImportSource react */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Deck, StudioLocale } from '../../api';
import { createDocumentAttempt, createDocumentReadGate, createDocumentsApi, documentActive, documentError, documentExpired, presentationDocument, saveDocument, type DocumentInput, type DocumentJob, type DocumentsApi, type DocumentStatus } from './document-api';

const studioApi = createDocumentsApi();
const BUTTON = 'st:min-h-11 st:rounded-xl st:border st:border-studio-line st:px-4 st:py-2.5 st:text-sm st:font-semibold st:text-studio-text st:disabled:opacity-50 st:focus-visible:outline-2 st:focus-visible:outline-offset-2 st:focus-visible:outline-studio-cyan';
export const documentStatusText: Record<StudioLocale, Record<DocumentStatus, string>> = {
  ru: { queued: 'В очереди', running: 'Создаём PDF', ready: 'PDF готов', failed: 'Не удалось создать PDF', cancelled: 'Отменено', expired: 'Срок хранения истёк' },
  uz: { queued: 'Navbatda', running: 'PDF yaratilmoqda', ready: 'PDF tayyor', failed: 'PDF yaratilmadi', cancelled: 'Bekor qilindi', expired: 'Saqlash muddati tugadi' },
};

/** Read-only restoration and polling; mutations happen only in explicit UI handlers. */
export function useDocumentJobs(api: DocumentsApi) {
  const [jobs, setJobs] = useState<DocumentJob[]>([]);
  const [availability, setAvailability] = useState<'checking' | 'available' | 'unavailable' | 'error'>('checking');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(false);
  const locked = useRef(false);
  const revision = useRef(0);
  const attempt = useRef(createDocumentAttempt());
  const reads = useRef(createDocumentReadGate());
  const refresh = useCallback(() => reads.current.run(async () => {
    const current = ++revision.current;
    if (mounted.current) setRefreshing(true);
    const answer = await api.list();
    if (!mounted.current || current !== revision.current) return;
    setRefreshing(false);
    if (answer.ok) { setJobs(answer.data); setAvailability('available'); setError(''); }
    else { setAvailability(answer.code === 'documents_unavailable' ? 'unavailable' : 'error'); setError(answer.code); }
  }), [api]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, [refresh]);
  useEffect(() => {
    if (!jobs.some(documentActive) || availability !== 'available') return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && !locked.current) void refresh(); }, 4_000);
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', resume);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [jobs, availability, refresh]);
  const update = (job: DocumentJob) => {
    revision.current++;
    setRefreshing(false);
    setJobs(previous => [job, ...previous.filter(item => item.id !== job.id)].sort((a, b) => b.createdAt - a.createdAt));
    setAvailability('available');
  };
  const create = async (input: DocumentInput) => {
    if (locked.current) return false;
    locked.current = true; setBusy('create'); setError('');
    const key = attempt.current.key(input);
    try {
      const answer = await api.create(input, key);
      if (answer.ok) attempt.current.accepted(key);
      if (!mounted.current) return answer.ok;
      if (answer.ok) update(answer.data);
      else { setError(answer.code); if (answer.code === 'documents_unavailable') setAvailability('unavailable'); }
      return answer.ok;
    } finally { locked.current = false; if (mounted.current) setBusy(null); }
  };
  const act = async (job: DocumentJob, action: 'cancel' | 'download') => {
    if (locked.current) return;
    locked.current = true; setBusy(job.id); setError('');
    try {
      if (action === 'download') {
        if (documentExpired(job)) { setError('expired'); void refresh(); return; }
        const answer = await api.download(job.id);
        if (!mounted.current) return;
        if (answer.ok) saveDocument(answer.data, job.id); else setError(answer.code);
      } else {
        const answer = await api.cancel(job.id);
        if (!mounted.current) return;
        if (answer.ok) update(answer.data); else setError(answer.code);
      }
    } finally { locked.current = false; if (mounted.current) setBusy(null); }
  };
  return { jobs, availability, error, busy, refreshing, refresh, create, act };
}

export default function DocumentExport({ deck, locale }: { deck?: Deck; locale: StudioLocale }) {
  const state = useDocumentJobs(studioApi);
  const noteId = useId();
  const ru = locale === 'ru';
  if (state.availability === 'checking') return <p role="status" className="st:text-xs st:text-studio-muted">{ru ? 'Проверяем облачный PDF…' : 'Bulutdagi PDF tekshirilmoqda…'}</p>;
  if (state.availability === 'unavailable') return <p className="st:text-xs st:text-studio-muted" data-document-disabled="">{documentError('documents_unavailable', locale)}</p>;
  return <section className="ym-hide-content st:space-y-3 st:rounded-xl st:border st:border-studio-line st:p-3" aria-label={ru ? 'Облачные PDF' : 'Bulutdagi PDF'} data-document-export="">
    <div className="st:flex st:flex-wrap st:items-center st:justify-between st:gap-2">
      <span className="st:text-sm st:font-semibold st:text-studio-text">{deck ? (ru ? 'PDF с текстом презентации' : 'Taqdimot matnidan PDF') : (ru ? 'Мои облачные PDF' : 'Bulutdagi PDFlarim')}</span>
      <button type="button" className={BUTTON} disabled={!!state.busy || state.refreshing} onClick={() => void state.refresh()}>{state.refreshing ? (ru ? 'Обновляем…' : 'Yangilanmoqda…') : (ru ? 'Обновить статус' : 'Holatni yangilash')}</button>
    </div>
    <p id={noteId} className="st:text-xs st:leading-relaxed st:text-studio-muted">{deck ? (ru ? 'По нажатию текст слайдов и заметки отправятся на сервер для создания PDF без картинок. Текст и файл хранятся 24 часа. Баланс платного чата не расходуется.' : 'Tugma bosilgach, slayd matni va izohlar rasmsiz PDF yaratish uchun serverga yuboriladi. Matn va fayl 24 soat saqlanadi. Pullik chat balansidan yechilmaydi.') : (ru ? 'Здесь появятся отправленные вами задачи. Текст и файлы хранятся 24 часа.' : 'Bu yerda yuborgan vazifalaringiz ko‘rinadi. Matn va fayllar 24 soat saqlanadi.')}</p>
    {deck && state.availability === 'available' && <button type="button" className={`${BUTTON} st:w-full st:border-studio-cyan`} disabled={!!state.busy} aria-describedby={noteId} onClick={() => void state.create(presentationDocument(deck, locale))}>{state.busy === 'create' ? (ru ? 'Отправляем…' : 'Yuborilmoqda…') : (ru ? 'Создать PDF в облаке' : 'Bulutda PDF yaratish')}</button>}
    {state.error && <p role="alert" className="st:text-sm st:text-studio-danger">{documentError(state.error, locale)}</p>}
    {!deck && state.jobs.length === 0 && state.availability === 'available' && <p className="st:text-sm st:text-studio-muted">{ru ? 'Пока нет документов.' : 'Hozircha hujjatlar yo‘q.'}</p>}
    {state.jobs.length > 0 && <details open className="st:text-sm">
      <summary className="st:cursor-pointer st:font-medium st:text-studio-text">{ru ? 'История документов' : 'Hujjatlar tarixi'} ({state.jobs.length})</summary>
      <ul className="st:mt-2 st:space-y-2" aria-live="polite">
        {state.jobs.map(job => {
          const expired = documentExpired(job);
          return <li key={job.id} className="st:flex st:flex-wrap st:items-center st:justify-between st:gap-2 st:rounded-lg st:bg-studio-bg st:p-3" data-document-status={expired ? 'expired' : job.status}>
            <div className="st:min-w-0"><p className="st:text-studio-text">{documentStatusText[locale][expired ? 'expired' : job.status]}</p><p className="st:text-xs st:text-studio-muted">{new Date(job.createdAt).toLocaleString(ru ? 'ru-RU' : 'uz-UZ')} · {job.id.slice(-6)}</p></div>
            {job.status === 'ready' && !expired && <button type="button" className={BUTTON} disabled={!!state.busy} onClick={() => void state.act(job, 'download')}>{state.busy === job.id ? (ru ? 'Загрузка…' : 'Yuklanmoqda…') : (ru ? 'Скачать PDF' : 'PDFni yuklab olish')}</button>}
            {documentActive(job) && !expired && <button type="button" className={BUTTON} disabled={!!state.busy} onClick={() => void state.act(job, 'cancel')}>{state.busy === job.id ? (ru ? 'Отменяем…' : 'Bekor qilinmoqda…') : (ru ? 'Отменить' : 'Bekor qilish')}</button>}
          </li>;
        })}
      </ul>
    </details>}
  </section>;
}
