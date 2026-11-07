import type { Deck, StudioLocale } from '../../api';

export type DocumentStatus = 'queued' | 'running' | 'ready' | 'failed' | 'cancelled' | 'expired';
export interface DocumentJob {
  id: string;
  type: 'presentation_pdf' | 'proposal_pdf';
  status: DocumentStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  attempts: number;
  errorCode: string | null;
}
export interface PresentationDocument {
  type: 'presentation_pdf';
  payload: { locale: StudioLocale; title: string; slides: Array<{ title: string; bullets: string[]; notes?: string }> };
}
export interface ProposalDocument {
  type: 'proposal_pdf';
  payload: { locale: StudioLocale; company: string; objective: string; packageId: 'custom'; contact?: string; scope?: string[]; budgetTerms?: string };
}
export type DocumentInput = PresentationDocument | ProposalDocument;
export type DocumentResult<T> = { ok: true; data: T } | { ok: false; code: string; status: number };
export interface DocumentsApi {
  list(): Promise<DocumentResult<DocumentJob[]>>;
  get(id: string): Promise<DocumentResult<DocumentJob>>;
  create(input: DocumentInput, key: string): Promise<DocumentResult<DocumentJob>>;
  cancel(id: string): Promise<DocumentResult<DocumentJob>>;
  download(id: string): Promise<DocumentResult<Blob>>;
}

/** Preserve the cover, slide text and speaker notes. Images stay in the existing PPTX. */
export function presentationDocument(deck: Deck, locale: StudioLocale): PresentationDocument {
  return {
    type: 'presentation_pdf',
    payload: {
      locale,
      title: deck.title,
      slides: [
        { title: deck.title, bullets: deck.subtitle ? [deck.subtitle] : [] },
        ...deck.slides.map(slide => ({ title: slide.title, bullets: [...slide.bullets], ...(slide.notes ? { notes: slide.notes } : {}) })),
      ],
    },
  };
}

/** A lost response keeps the key: an explicit retry cannot enqueue a duplicate. No document text is persisted. */
export function createDocumentAttempt(newKey: () => string = () => crypto.randomUUID()) {
  let pending: { body: string; key: string } | null = null;
  return {
    key(input: DocumentInput): string {
      const body = JSON.stringify(input);
      if (!pending || pending.body !== body) pending = { body, key: newKey() };
      return pending.key;
    },
    accepted(key: string) { if (pending?.key === key) pending = null; },
  };
}

/** Polling and manual refresh share one read, even on a slow connection. */
export function createDocumentReadGate() {
  let pending: Promise<void> | null = null;
  return {
    run(read: () => Promise<void>): Promise<void> {
      if (!pending) pending = Promise.resolve().then(read).finally(() => { pending = null; });
      return pending;
    },
  };
}

const STATUSES = new Set<DocumentStatus>(['queued', 'running', 'ready', 'failed', 'cancelled', 'expired']);
const ID = /^[A-Za-z0-9_-]{6,128}$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const documentActive = (job: DocumentJob) => job.status === 'queued' || job.status === 'running';
export const documentExpired = (job: DocumentJob, now = Date.now()) => job.status === 'expired' || job.expiresAt <= now;

function isJob(value: unknown): value is DocumentJob {
  return record(value) && typeof value.id === 'string' && ID.test(value.id)
    && (value.type === 'presentation_pdf' || value.type === 'proposal_pdf')
    && STATUSES.has(value.status as DocumentStatus)
    && ['createdAt', 'updatedAt', 'expiresAt', 'attempts'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]))
    && (value.errorCode === null || typeof value.errorCode === 'string');
}

export function createDocumentsApi(options: {
  base?: '/api/studio/documents' | '/api/admin/documents';
  token?: () => string | null;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  timeout?: number;
} = {}): DocumentsApi {
  const base = options.base ?? '/api/studio/documents';
  const fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
  async function call<T>(path: string, method: 'GET' | 'POST', accept: (data: unknown) => T | null, input?: DocumentInput, key?: string, binary = false): Promise<DocumentResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout ?? 25_000);
    try {
      const token = options.token?.();
      const response = await fetchImpl(base + path, {
        method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { Accept: binary ? 'application/pdf' : 'application/json',
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
        ...(input ? { body: JSON.stringify(input) } : {}),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const code = record(body) && typeof body.error === 'string' && /^[a-z][a-z0-9_]{1,60}$/.test(body.error)
          ? body.error : response.status === 401 ? 'unauthenticated' : response.status === 403 ? 'forbidden' : response.status === 429 ? 'quota_exceeded' : 'request_failed';
        return { ok: false, status: response.status, code };
      }
      let data: unknown;
      if (binary) {
        if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf') return { ok: false, status: response.status, code: 'invalid_response' };
        const blob = await response.blob();
        if (!blob.size || !new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer()).startsWith('%PDF-')) return { ok: false, status: response.status, code: 'invalid_response' };
        data = blob;
      } else data = await response.json().catch(() => null);
      const accepted = accept(data);
      return accepted === null ? { ok: false, status: response.status, code: 'invalid_response' } : { ok: true, data: accepted };
    } catch {
      return { ok: false, status: 0, code: controller.signal.aborted ? 'timeout' : 'network' };
    } finally { clearTimeout(timer); }
  }
  const job = (data: unknown) => record(data) && data.ok === true && isJob(data.job) ? data.job : null;
  const badId = <T>(): Promise<DocumentResult<T>> => Promise.resolve({ ok: false, code: 'invalid_id', status: 0 });
  return {
    list: () => call('', 'GET', data => record(data) && data.ok === true && Array.isArray(data.jobs) && data.jobs.every(isJob) ? data.jobs : null),
    get: id => ID.test(id) ? call(`/${id}`, 'GET', job) : badId(),
    create: (input, key) => /^[A-Za-z0-9_-]{16,128}$/.test(key) ? call('', 'POST', job, input, key) : Promise.resolve({ ok: false, code: 'invalid_idempotency_key', status: 0 }),
    cancel: id => ID.test(id) ? call(`/${id}/cancel`, 'POST', job) : badId(),
    download: id => ID.test(id) ? call(`/${id}/download`, 'GET', data => data instanceof Blob ? data : null, undefined, undefined, true) : badId(),
  };
}

export function documentError(code: string, locale: StudioLocale): string {
  const ru = locale === 'ru';
  if (code === 'documents_unavailable') return ru ? 'Облачный PDF пока недоступен.' : 'Bulutdagi PDF hozircha mavjud emas.';
  if (['unauthenticated', 'unauthorized', 'auth_required', 'identity_required', 'invalid_token', 'missing_token'].includes(code)) return ru ? 'Войдите в аккаунт, чтобы открыть документы.' : 'Hujjatlarni ochish uchun hisobingizga kiring.';
  if (code === 'forbidden') return ru ? 'Документы доступны только владельцу.' : 'Hujjatlar faqat egasiga ochiq.';
  if (/quota|limit/.test(code)) return ru ? 'Достигнут лимит документов. Попробуйте позже.' : 'Hujjatlar limiti tugadi. Keyinroq urinib ko‘ring.';
  if (/expired/.test(code)) return ru ? 'Срок хранения истёк. Создайте новый PDF.' : 'Saqlash muddati tugadi. Yangi PDF yarating.';
  if (code === 'invalid_payload') return ru ? 'Проверьте длину текста и количество слайдов.' : 'Matn uzunligi va slaydlar sonini tekshiring.';
  if (/network|timeout|invalid_response/.test(code)) return ru ? 'Ответ не получен. Обновите статус. Повторная отправка без перезагрузки страницы не создаст вторую задачу.' : 'Javob olinmadi. Holatni yangilang. Sahifani qayta yuklamasdan takroriy yuborish ikkinchi vazifa yaratmaydi.';
  return ru ? 'Не удалось выполнить запрос. Обновите статус и попробуйте снова.' : 'So‘rov bajarilmadi. Holatni yangilab, qayta urinib ko‘ring.';
}

export function saveDocument(blob: Blob, id: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `gptbot-${id}.pdf`; anchor.rel = 'noopener';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
