import { JOB_ID, type CreatedJob, type Deck, type DeckShapeName, type DeckTask, type StudioAudience, type StudioLocale } from '../api';

/** Local presentation data only. Never an authority for identity, paid rights or remaining units. */
export interface PresentationResult {
  readonly job: CreatedJob;
  readonly task: DeckTask;
  readonly deck: Deck;
  readonly aiLabel: boolean;
  readonly shape: DeckShapeName;
  readonly regenOf?: string;
}
export interface PresentationDraft {
  readonly topic: string;
  readonly audience: StudioAudience;
  readonly slides: number;
  readonly shape: DeckShapeName;
  readonly palette: number;
}
export type PresentationStatus =
  | { readonly kind: 'idle' | 'ready' | 'interrupted' }
  | { readonly kind: 'working' }
  | { readonly kind: 'message'; readonly code: string; readonly tone: 'limit' | 'error'; readonly resetsAt?: string; readonly full?: boolean };
export type SavedPicture = { readonly index: number; readonly status: 'none' | 'loading' } | { readonly index: number; readonly status: 'ready'; readonly blob: Blob };
export interface PresentationSnapshot {
  readonly version: 1;
  readonly locale: StudioLocale;
  readonly draft: PresentationDraft;
  readonly result: PresentationResult | null;
  readonly status: PresentationStatus;
  readonly pictures: readonly SavedPicture[];
}

export const ARTIFACT_LIMITS = { entries: 20, bytes: 32 * 1024 * 1024, entryBytes: 12 * 1024 * 1024, pictureBytes: 2 * 1024 * 1024, ageMs: 30 * 86_400_000 } as const;
const DB_NAME = 'gptbot-studio-artifacts-v1';
const STORE = 'presentations';
interface Stored { key: string; ownerKey: string; artifactId: string; updatedAt: number; bytes: number; snapshot: PresentationSnapshot }
const memory = new Map<string, Stored>();
const flushers = new Map<string, () => Promise<void>>();
let opened: Promise<IDBDatabase | null> | null = null;
let queue: Promise<unknown> = Promise.resolve();
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const integer = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const scope = (v: unknown): v is string => typeof v === 'string' && /^[\w:.-]{1,180}$/.test(v);
const keyOf = (ownerKey: string, artifactId: string): string => JSON.stringify([ownerKey, artifactId]);
const localeOf = (v: unknown): v is StudioLocale => v === 'ru' || v === 'uz';
const audienceOf = (v: unknown): v is StudioAudience => v === 'maktab' || v === 'talaba' || v === 'umumiy';
const shapeOf = (v: unknown): v is DeckShapeName => v === 'free' || v === 'full';

/** A closed, bounded projection of untrusted browser storage. URLs, tokens and unknown fields are discarded. */
export function validateSnapshot(value: unknown): PresentationSnapshot | null {
  if (!object(value) || value.version !== 1 || !localeOf(value.locale) || !object(value.draft)) return null;
  const d = value.draft;
  if (!text(d.topic, 500) || !audienceOf(d.audience) || !integer(d.slides, 4, 15) || !shapeOf(d.shape) || !integer(d.palette, 1, 3)) return null;
  const draft: PresentationDraft = { topic: d.topic, audience: d.audience, slides: d.slides, shape: d.shape, palette: d.palette };
  let result: PresentationResult | null = null;
  if (value.result !== null) {
    const r = value.result;
    if (!object(r) || !object(r.job) || !object(r.task) || !object(r.deck) || !shapeOf(r.shape) || typeof r.aiLabel !== 'boolean') return null;
    const j = r.job, t = r.task, deck = r.deck, s = j.shape;
    if (!text(j.jobId, 40) || !JOB_ID.test(j.jobId) || !text(j.source, 32) || !object(s) || !integer(s.slides, 4, 15) || !integer(s.images, 0, 8) || typeof s.notes !== 'boolean' || !integer(s.palette, 1, 3) || !integer(s.parts, 1, 8) || (j.next !== 'slides' && j.next !== 'outline') || !text(j.expiresAt, 40) || !Number.isFinite(Date.parse(j.expiresAt))) return null;
    if (!text(t.topic, 500) || t.locale !== value.locale || !audienceOf(t.audience) || t.slides !== s.slides || t.palette !== s.palette) return null;
    if (!text(deck.title, 500) || !text(deck.subtitle, 1000) || !Array.isArray(deck.slides) || deck.slides.length !== s.slides) return null;
    const slides: Deck['slides'][number][] = [];
    for (let i = 0; i < deck.slides.length; i++) {
      const slide: unknown = deck.slides[i];
      if (!object(slide) || slide.index !== i + 1 || !text(slide.title, 500) || !Array.isArray(slide.bullets) || slide.bullets.length > 10 || !slide.bullets.every((b: unknown) => text(b, 2000)) || !['title-bullets', 'image-right', 'image-full', 'two-columns'].includes(String(slide.layout)) || (slide.notes !== undefined && !text(slide.notes, 8000))) return null;
      slides.push({ index: i + 1, title: slide.title, bullets: [...slide.bullets] as string[], layout: slide.layout as Deck['slides'][number]['layout'], ...(typeof slide.notes === 'string' ? { notes: slide.notes } : {}) });
    }
    if (r.regenOf !== undefined && (typeof r.regenOf !== 'string' || !JOB_ID.test(r.regenOf))) return null;
    result = {
      job: { jobId: j.jobId, source: j.source, shape: { slides: s.slides, images: s.images, notes: s.notes, palette: s.palette, parts: s.parts }, next: j.next, expiresAt: j.expiresAt },
      task: { topic: t.topic, locale: value.locale, audience: t.audience, slides: s.slides, palette: s.palette },
      deck: { title: deck.title, subtitle: deck.subtitle, slides }, shape: r.shape, aiLabel: r.aiLabel,
      ...(typeof r.regenOf === 'string' ? { regenOf: r.regenOf } : {}),
    };
  }
  if (!object(value.status)) return null;
  const st = value.status;
  let status: PresentationStatus;
  if (st.kind === 'idle' || st.kind === 'ready' || st.kind === 'working' || st.kind === 'interrupted') status = { kind: st.kind };
  else if (st.kind === 'message' && typeof st.code === 'string' && /^[a-z][a-z0-9_]{1,40}$/.test(st.code) && (st.tone === 'error' || st.tone === 'limit') && (st.resetsAt === undefined || (text(st.resetsAt, 40) && Number.isFinite(Date.parse(st.resetsAt))))) {
    status = { kind: 'message', code: st.code, tone: st.tone, ...(typeof st.resetsAt === 'string' ? { resetsAt: st.resetsAt } : {}), ...(st.full === true ? { full: true } : {}) };
  } else return null;
  if (!Array.isArray(value.pictures) || value.pictures.length > 8 || (!result && value.pictures.length)) return null;
  const seen = new Set<number>();
  const pictures: SavedPicture[] = [];
  for (const p of value.pictures) {
    if (!object(p) || !integer(p.index, 1, result?.deck.slides.length ?? 0) || seen.has(p.index)) return null;
    seen.add(p.index);
    if (p.status === 'ready') {
      if (!(p.blob instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(p.blob.type) || p.blob.size === 0 || p.blob.size > ARTIFACT_LIMITS.pictureBytes) return null;
      pictures.push({ index: p.index, status: 'ready', blob: p.blob });
    } else if (p.status === 'loading' || p.status === 'none') pictures.push({ index: p.index, status: p.status });
    else return null;
  }
  const snapshot: PresentationSnapshot = { version: 1, locale: value.locale, draft, result, status, pictures };
  return sizeOf(snapshot) <= ARTIFACT_LIMITS.entryBytes ? snapshot : null;
}

function sizeOf(snapshot: PresentationSnapshot): number {
  return new Blob([JSON.stringify(snapshot)]).size + snapshot.pictures.reduce((n, p) => n + (p.status === 'ready' ? p.blob.size : 0), 0);
}
function prune(rows: Stored[], now = Date.now()): Set<string> {
  let bytes = 0, count = 0;
  const drop = new Set<string>();
  for (const row of rows.sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (!Number.isFinite(row.updatedAt) || !Number.isFinite(row.bytes) || row.bytes < 0 || row.updatedAt < now - ARTIFACT_LIMITS.ageMs || ++count > ARTIFACT_LIMITS.entries || (bytes += row.bytes) > ARTIFACT_LIMITS.bytes) drop.add(row.key);
  }
  return drop;
}
function trimMemory() { for (const key of prune([...memory.values()])) memory.delete(key); }
function db(): Promise<IDBDatabase | null> {
  if (opened) return opened;
  opened = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      let settled = false;
      const finish = (database: IDBDatabase | null) => { if (settled) { database?.close(); return; } settled = true; clearTimeout(timer); resolve(database); };
      const timer = setTimeout(() => finish(null), 2000);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opened = null; }; finish(request.result); };
    } catch { resolve(null); }
  });
  return opened;
}
function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work); queue = next.catch(() => undefined); return next;
}

export async function loadArtifact(ownerKey: string, artifactId: string): Promise<PresentationSnapshot | null> {
  if (!scope(ownerKey) || !scope(artifactId)) return null;
  await queue;
  trimMemory();
  const key = keyOf(ownerKey, artifactId);
  let row = memory.get(key);
  if (!row) {
    const database = await db();
    if (database) row = await new Promise<Stored | undefined>((resolve) => {
      try {
        const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        request.onsuccess = () => resolve(request.result as Stored | undefined); request.onerror = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
  }
  if (!row || row.key !== key || row.ownerKey !== ownerKey || row.artifactId !== artifactId || !Number.isFinite(row.updatedAt) || row.updatedAt < Date.now() - ARTIFACT_LIMITS.ageMs || row.updatedAt > Date.now() + 60_000) return null;
  return validateSnapshot(row.snapshot);
}

/** persistent=false means the current tab retained the data, but a page reload may lose it. */
export function saveArtifact(ownerKey: string, artifactId: string, value: PresentationSnapshot): Promise<{ persistent: boolean }> {
  const snapshot = validateSnapshot(value);
  if (!scope(ownerKey) || !scope(artifactId) || !snapshot) return Promise.reject(new Error('invalid_artifact'));
  const row: Stored = { key: keyOf(ownerKey, artifactId), ownerKey, artifactId, updatedAt: Date.now(), bytes: sizeOf(snapshot), snapshot };
  memory.set(row.key, row); trimMemory();
  return enqueue(async () => {
    const database = await db();
    if (!database) return { persistent: false };
    return new Promise<{ persistent: boolean }>((resolve) => {
      try {
        const tx = database.transaction(STORE, 'readwrite');
        const table = tx.objectStore(STORE);
        table.put(row);
        const rows: Stored[] = [];
        const cursor = table.openCursor();
        cursor.onsuccess = () => {
          const next = cursor.result;
          if (next) { rows.push(next.value as Stored); next.continue(); }
          else for (const key of prune(rows)) table.delete(key);
        };
        tx.oncomplete = () => resolve({ persistent: true });
        tx.onerror = tx.onabort = () => resolve({ persistent: false });
      } catch { resolve({ persistent: false }); }
    });
  });
}

export function clearOwnerArtifacts(ownerKey: string): Promise<void> {
  if (!scope(ownerKey)) return Promise.resolve();
  for (const [key, row] of memory) if (row.ownerKey === ownerKey) memory.delete(key);
  return enqueue(async () => {
    const database = await db();
    if (!database) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = database.transaction(STORE, 'readwrite');
        const cursor = tx.objectStore(STORE).openCursor();
        cursor.onsuccess = () => { const next = cursor.result; if (next) { if ((next.value as Stored).ownerKey === ownerKey) next.delete(); next.continue(); } };
        tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => resolve();
      } catch { resolve(); }
    });
  });
}

/** The billing host awaits this before leaving for Click/Payme. No generation or network calls. */
export async function flushSnapshot(ownerKey?: string, artifactId?: string): Promise<void> {
  if (ownerKey !== undefined && artifactId !== undefined && !flushers.has(keyOf(ownerKey, artifactId))) throw new Error('studio_draft_not_ready');
  for (const [key, flush] of flushers) {
    const [owner, artifact] = JSON.parse(key) as [string, string];
    if ((ownerKey === undefined || ownerKey === owner) && (artifactId === undefined || artifactId === artifact)) await flush();
  }
  await queue;
}
export function registerSnapshotFlusher(ownerKey: string, artifactId: string, flush: () => Promise<void>): () => void {
  const key = keyOf(ownerKey, artifactId);
  flushers.set(key, flush);
  return () => { if (flushers.get(key) === flush) flushers.delete(key); };
}
