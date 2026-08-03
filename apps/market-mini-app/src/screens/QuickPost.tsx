import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MarketApiError, compressImage, marketApi, uploadMedia } from '../lib/api';
import { t, type CopyKey } from '../lib/i18n';
import { haptic } from '../platform/telegram';
import { useBackStop } from '../platform/navigation';
import type { Category, Locale, Product, SellerProduct } from '../types';
import {
  AsyncImage,
  Button,
  Field,
  Icon,
  Modal,
  ProductCard,
} from '../components/ui';

/**
 * QuickPost — one page to put a thing up for sale.
 *
 * The seller cabinet already has a product editor. It is a shop's form: price in
 * minor units, a two-language label matrix for every specification, search terms
 * as a first-class field, stock movements. A person selling one thing gives up
 * on it, which is why the only way to publish today is to leave for the bot.
 *
 * This is the same domain reached differently. Nothing new is stored and no new
 * endpoint exists: photos go through the media upload the editor already uses,
 * the listing is created as a draft by the command that already creates
 * products, and publishing is the transition that already publishes them. What
 * changes is what the person is asked for, in what order, and how much of the
 * shop they have to understand first — which is none of it.
 *
 * QP-1A is the manual composer. There is no voice control on this screen,
 * because a control that cannot work yet is worse than one that is not there.
 */

const MAX_PHOTOS = 5;
const DRAFT_KEY = 'bormi.quickpost.draft';
const DRAFT_VERSION = 1;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTOSAVE_MS = 400;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 600;
/** The domain's own ceiling, in whole so'm rather than minor units. */
const PRICE_MAX = 1_000_000_000_000;

type Availability = Product['availability'];
type Mode = 'compose' | 'preview';

interface QuickPhoto {
  ref: string;
  /** Object URL for a photo picked in this session. Never persisted. */
  preview?: string;
  state: 'ready' | 'error';
}

interface QuickSpec { label: string; value: string }

/**
 * What survives a closed WebView.
 *
 * Refs only, never bytes: a base64 photo in localStorage is both a quota
 * problem and a copy of the person's picture living somewhere nobody cleans.
 * Nothing here identifies anyone — no session, no Telegram id, no phone.
 */
interface QuickDraft {
  version: number;
  createdAt: number;
  updatedAt: number;
  title: string;
  categoryId: string;
  priceInput: string;
  description: string;
  availability: Availability;
  specifications: QuickSpec[];
  mediaRefs: string[];
}

/** Digits only. A price is a number of so'm, not an expression. */
function digitsOf(value: string): string {
  return value.replace(/\D+/g, '').replace(/^0+(?=\d)/, '').slice(0, 15);
}

/** 350000 → "350 000". The same grouping the buyer card shows. */
function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function readDraft(): QuickDraft | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<QuickDraft>;
    // Fail closed on anything unexpected. A half-understood draft restored into
    // the form is worse than none: the person cannot tell which of their own
    // words survived.
    if (parsed?.version !== DRAFT_VERSION) throw new Error('version');
    if (typeof parsed.updatedAt !== 'number') throw new Error('shape');
    if (Date.now() - parsed.updatedAt > DRAFT_TTL_MS) throw new Error('expired');
    const media = Array.isArray(parsed.mediaRefs)
      ? parsed.mediaRefs.filter((ref): ref is string => typeof ref === 'string').slice(0, MAX_PHOTOS)
      : [];
    const specifications = Array.isArray(parsed.specifications)
      ? parsed.specifications
        .filter((row): row is QuickSpec => typeof row?.label === 'string' && typeof row?.value === 'string')
        .slice(0, 12)
      : [];
    return {
      version: DRAFT_VERSION,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : parsed.updatedAt,
      updatedAt: parsed.updatedAt,
      title: typeof parsed.title === 'string' ? parsed.title.slice(0, TITLE_MAX) : '',
      categoryId: typeof parsed.categoryId === 'string' ? parsed.categoryId : '',
      priceInput: typeof parsed.priceInput === 'string' ? digitsOf(parsed.priceInput) : '',
      description: typeof parsed.description === 'string' ? parsed.description.slice(0, DESCRIPTION_MAX) : '',
      availability: parsed.availability === 'preorder' || parsed.availability === 'unavailable'
        ? parsed.availability
        : 'available',
      specifications,
      mediaRefs: media,
    };
  } catch {
    discardDraft();
    return null;
  }
}

function discardDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // A private-mode WebView can refuse storage. The composer still works; only
    // recovery is lost, and nothing is reported as saved that was not.
  }
}

function draftAgeLabel(locale: Locale, updatedAt: number): string {
  // The cabinet's own age words, not a second set that would drift from them.
  const minutes = Math.max(1, Math.round((Date.now() - updatedAt) / 60_000));
  if (minutes < 60) return `${minutes} ${t(locale, 'ageMinutes')}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${t(locale, 'ageHours')}`;
  return `${Math.round(hours / 24)} ${t(locale, 'ageDays')}`;
}

function PhotoRow({
  photos, locale, busy, canUpload, error, onPick, onChange, onRetry,
}: {
  photos: QuickPhoto[];
  locale: Locale;
  busy: boolean;
  canUpload: boolean;
  error: string | null;
  onPick: (files: FileList | null) => void;
  onChange: (next: QuickPhoto[]) => void;
  onRetry: () => void;
}) {
  return <section className="qp-block">
    <h2 className="qp-block__title">{t(locale, 'qpPhotos')}</h2>
    {photos.length ? <ul className="qp-photos">
      {photos.map((photo, index) => <li className="qp-photo" key={photo.ref}>
        {photo.preview
          ? <img src={photo.preview} alt="" className="qp-photo__image" />
          : <AsyncImage handle={photo.ref} alt="" className="qp-photo__image" />}
        {index === 0 ? <span className="qp-photo__cover">{t(locale, 'coverPhoto')}</span> : null}
        <div className="qp-photo__actions">
          {index > 0 ? <button
            type="button" className="icon-button"
            aria-label={`${t(locale, 'makeCover')}: ${index + 1}`}
            onClick={() => onChange([photo, ...photos.filter((item) => item.ref !== photo.ref)])}
          ><Icon name="check" size={17} /></button> : null}
          <button
            type="button" className="icon-button"
            aria-label={`${t(locale, 'removeRow')}: ${index + 1}`}
            onClick={() => onChange(photos.filter((item) => item.ref !== photo.ref))}
          ><Icon name="close" size={17} /></button>
        </div>
      </li>)}
    </ul> : null}
    {/* Named states, never a fabricated percentage: the upload is a single
        request whose progress the browser does not report back to us. */}
    <p className="qp-status" role="status">
      {busy ? t(locale, 'qpPhotoUploading') : photos.length ? t(locale, 'qpPhotoReady') : ''}
    </p>
    {error ? <div className="qp-error" role="alert">
      <span>{error}</span>
      <Button variant="secondary" onClick={onRetry}>{t(locale, 'retry')}</Button>
    </div> : null}
    {!canUpload
      ? <div className="notice notice--muted"><Icon name="warning" size={19} /><span>{t(locale, 'photosLater')}</span></div>
      : photos.length < MAX_PHOTOS ? <label className="qp-picker">
        <input
          type="file" accept="image/jpeg,image/png,image/webp" multiple
          capture="environment"
          disabled={busy}
          onChange={(event) => { onPick(event.target.files); event.target.value = ''; }}
        />
        <span>
          {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="plus" size={20} />}
          {photos.length ? t(locale, 'qpAddMorePhotos') : t(locale, 'qpAddPhotos')}
        </span>
        <small>{t(locale, 'qpPhotosHint')}</small>
      </label> : null}
  </section>;
}

export function QuickPost({
  locale, categories, mediaUpload, storeName, onClose, onPublished,
}: {
  locale: Locale;
  categories: Category[];
  mediaUpload: boolean;
  storeName: string;
  onClose: () => void;
  /** Raised once, with the listing that now exists. */
  onPublished: (product: SellerProduct) => void;
}) {
  const client = useQueryClient();
  // Read once, on mount. `useRef(readDraft())` evaluates its argument on every
  // render, re-reading storage and re-parsing the JSON on each keystroke only to
  // throw the result away.
  const [restored, setRestored] = useState<QuickDraft | null>(readDraft);
  const [offerRestore, setOfferRestore] = useState(() => restored !== null);
  const [mode, setMode] = useState<Mode>('compose');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [description, setDescription] = useState('');
  const [availability, setAvailability] = useState<Availability>('available');
  const [specifications, setSpecifications] = useState<QuickSpec[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [photos, setPhotos] = useState<QuickPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, CopyKey>>({});
  const [askLeave, setAskLeave] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  /**
   * The listing this composer already created, if it did.
   *
   * A second press must never produce a second listing, so the id is kept and
   * reused: the first press creates the draft, every press after that publishes
   * the same one.
   */
  const createdId = useRef<string | null>(null);
  const createdVersion = useRef<number>(0);
  /**
   * The two command keys, minted once for this composer.
   *
   * Held rather than generated per call so a retry is provably the same command
   * to the server, which replays it instead of performing it twice.
   */
  const createKey = useRef<string>(crypto.randomUUID());
  const publishKey = useRef<string>(crypto.randomUUID());

  const price = Number(priceInput || '0');
  const dirty = Boolean(title || categoryId || priceInput || description || photos.length);
  const mediaRefs = photos.filter((photo) => photo.state === 'ready').map((photo) => photo.ref);

  // ── Draft ──────────────────────────────────────────────────────────────────
  /**
   * What is on the form right now, as one comparable value.
   *
   * `saved` is derived from this rather than kept as a flag, because a flag has
   * to be lowered by whoever changes the form and the one that forgets is the
   * one that loses work: the label would go on saying «Черновик сохранён» over
   * newer words, and the back guard reads that same claim before it lets a
   * person leave. Derived, the two cannot disagree with each other or with the
   * bytes in storage.
   */
  const signature = JSON.stringify([
    title, categoryId, priceInput, description, availability, specifications, mediaRefs,
  ]);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const saved = savedSignature === signature;

  /** The one write. Returns whether the words are actually somewhere now. */
  const writeDraft = (): boolean => {
    const draft: QuickDraft = {
      version: DRAFT_VERSION,
      createdAt: restored?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      title, categoryId, priceInput, description, availability,
      specifications,
      mediaRefs,
    };
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setSavedSignature(signature);
      return true;
    } catch {
      // A private-mode WebView can refuse storage. Nothing is claimed saved.
      return false;
    }
  };

  useEffect(() => {
    if (offerRestore || !dirty || saved) return undefined;
    const timer = globalThis.setTimeout(writeDraft, AUTOSAVE_MS);
    return () => globalThis.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerRestore, dirty, saved, signature]);

  const continueDraft = () => {
    const draft = restored;
    setOfferRestore(false);
    if (!draft) return;
    setTitle(draft.title);
    setCategoryId(categories.some((item) => item.id === draft.categoryId) ? draft.categoryId : '');
    setPriceInput(draft.priceInput);
    setDescription(draft.description);
    setAvailability(draft.availability);
    setSpecifications(draft.specifications);
    setPhotos(draft.mediaRefs.map((ref) => ({ ref, state: 'ready' as const })));
    setDetailsOpen(draft.specifications.length > 0);
  };

  const startOver = () => {
    discardDraft();
    setRestored(null);
    setOfferRestore(false);
  };

  /** Leaving with words that the debounce has not yet written. */
  const leaveSaving = () => {
    writeDraft();
    setAskLeave(false);
    onClose();
  };

  const leaveDiscarding = () => {
    discardDraft();
    setAskLeave(false);
    onClose();
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  //
  // Two levels, never both at once: the preview sits above the composer and the
  // composer above whatever opened it. A stop that accepts must also perform
  // the leaving — the spine only pops its own entry — or the screen would stay
  // on stage with nothing left to answer the next gesture, and that press would
  // close the whole app.
  useBackStop(mode === 'preview', 'quickpost:preview', () => setMode('compose'));
  useBackStop(mode === 'compose', 'quickpost:compose', () => {
    if (dirty && !saved) {
      setAskLeave(true);
      return false;
    }
    onClose();
    return undefined;
  });

  // ── Photos ─────────────────────────────────────────────────────────────────
  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setPhotoError(null);
    setUploading(true);
    const rejected: File[] = [];
    // Counted here rather than read back from state: `setPhotos` does not land
    // until the next render, so within this loop `photos` is the length it had
    // when the batch started. A file that failed took no slot.
    let taken = photos.length;
    try {
      for (const file of files) {
        if (taken >= MAX_PHOTOS) break;
        try {
          const blob = await compressImage(file);
          const { ref } = await uploadMedia(blob);
          taken += 1;
          setPhotos((current) => current.length >= MAX_PHOTOS ? current : [
            ...current,
            { ref, preview: URL.createObjectURL(blob), state: 'ready' as const },
          ]);
        } catch (error) {
          // One photo failing keeps the others. The failed ones are held so a
          // single retry re-sends exactly them.
          rejected.push(file);
          setPhotoError(t(
            locale,
            error instanceof MarketApiError && error.code === 'payload_too_large'
              ? 'photoTooLarge'
              : 'photoFailed',
          ));
          haptic('error');
        }
      }
    } finally {
      setUploading(false);
      setPendingFiles(rejected);
    }
  };

  const changePhotos = (next: QuickPhoto[]) => {
    for (const photo of photos) {
      if (next.some((item) => item.ref === photo.ref)) continue;
      if (photo.preview) URL.revokeObjectURL(photo.preview);
      void marketApi.delete(`/seller/media/${encodeURIComponent(photo.ref)}`).catch(() => undefined);
    }
    setPhotos(next);
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    // Keys, not sentences. A message resolved here would keep the language the
    // person was reading when they pressed, and stay in it after they switch.
    const next: Record<string, CopyKey> = {};
    if (!title.trim()) next.title = 'qpNeedTitle';
    if (!categoryId) next.category = 'qpNeedCategory';
    if (!priceInput || price <= 0) next.price = 'qpNeedPrice';
    else if (price > PRICE_MAX) next.price = 'qpPriceTooBig';
    setErrors(next);
    if (next.title) titleRef.current?.focus();
    else if (next.category) categoryRef.current?.focus();
    else if (next.price) priceRef.current?.focus();
    return Object.keys(next).length === 0;
  };

  // ── The listing, as the shopper would receive it ────────────────────────────
  const previewProduct: Product = useMemo(() => ({
    // Not the created id even once one exists: the card never shows it, and
    // reading a ref while rendering is a value that cannot make this update.
    id: 'quickpost-preview',
    categoryId: categoryId || null,
    categoryName: categories.find((item) => item.id === categoryId)?.name ?? null,
    sku: null,
    name: title.trim(),
    description: description.trim() || null,
    priceMinor: price,
    currency: 'UZS',
    availability,
    status: 'draft',
    mediaHandles: photos.filter((photo) => photo.state === 'ready').map((photo) => photo.ref),
    specifications: specifications
      .filter((row) => row.label.trim() && row.value.trim())
      .map((row, index) => ({ key: `s${index}`, label: row.label.trim(), value: row.value.trim() })),
    version: 0,
    updatedAt: new Date(0).toISOString(),
    storeName,
  }), [categoryId, categories, title, description, price, availability, photos, specifications, storeName]);

  // ── Publication ────────────────────────────────────────────────────────────
  const payload = () => {
    const taken = new Set<string>();
    const rows = specifications
      .filter((row) => row.label.trim() && row.value.trim())
      .map((row, index) => {
        let key = `spec_${index + 1}`;
        while (taken.has(key)) key = `${key}_x`;
        taken.add(key);
        // One label, shown in both languages: a person selling a jacket should
        // not have to translate the word "size" to get past this screen.
        const label = row.label.trim();
        return { key, labelRu: label, labelUz: label, value: row.value.trim() };
      });
    return {
      categoryId: categoryId || null,
      name: title.trim(),
      description: description.trim() || null,
      priceMinor: price,
      currency: 'UZS' as const,
      availability,
      mediaRefs,
      searchTerms: [],
      specifications: rows,
    };
  };

  /**
   * Recovers the listing's current version after a conflict.
   *
   * A fresh publish key comes with it: the old one is bound to the attempt that
   * lost, so replaying it would hand back that same failure rather than send the
   * new attempt.
   */
  const reread = async () => {
    if (!createdId.current) return;
    try {
      const current = await marketApi.get<{ product: SellerProduct }>(
        `/seller/products/${encodeURIComponent(createdId.current)}`,
      );
      createdVersion.current = current.product.version;
      publishKey.current = crypto.randomUUID();
      // It may have been the publish itself that landed and only the answer
      // that was lost. Then there is nothing left to do but say so.
      if (current.product.status === 'published') onPublished(current.product);
    } catch {
      // Leave the conflict notice standing; the person can try again.
    }
  };

  const publish = useMutation({
    mutationFn: async () => {
      // Create once, under a key that survives a retry.
      //
      // Two separate guards, because there are two ways one press becomes two
      // listings. The id catches the retry that follows a *reported* failure.
      // The key catches the one that follows silence — a create that timed out
      // on the way back leaves this side with no id and the server with a
      // product, and only a repeated Idempotency-Key makes the server hand that
      // same product back instead of making another.
      if (!createdId.current) {
        const created = await marketApi.post<SellerProduct>(
          '/seller/products',
          payload(),
          createKey.current,
        );
        createdId.current = created.id;
        createdVersion.current = created.version;
      }
      return marketApi.post<SellerProduct>(
        `/seller/products/${encodeURIComponent(createdId.current)}/publish`,
        { expectedVersion: createdVersion.current },
        publishKey.current,
      );
    },
    onSuccess: (product) => {
      haptic('success');
      discardDraft();
      void client.invalidateQueries({ queryKey: ['seller-products'] });
      void client.invalidateQueries({ queryKey: ['seller-overview'] });
      onPublished(product);
    },
    onError: (error) => {
      haptic('error');
      if (error instanceof MarketApiError && error.status === 409) {
        // Someone else moved the listing on. Re-read it rather than guess: the
        // version we hold is provably stale, and pressing again with it would
        // fail exactly the same way forever.
        void reread();
      }
    },
  });


  const conflict = publish.error instanceof MarketApiError && publish.error.status === 409;

  // ── Screens ────────────────────────────────────────────────────────────────
  if (offerRestore && restored) {
    return <main id="main-content" className="page qp-page">
      <div className="qp-restore">
        <Icon name="edit" size={28} />
        <strong>{t(locale, 'qpRestoreTitle')}</strong>
        <p>{t(locale, 'qpRestoreBody')} · {draftAgeLabel(locale, restored.updatedAt)}</p>
        <Button wide onClick={continueDraft}>{t(locale, 'qpRestoreContinue')}</Button>
        <Button wide variant="secondary" onClick={startOver}>{t(locale, 'qpRestoreFresh')}</Button>
      </div>
    </main>;
  }

  if (mode === 'preview') {
    return <main id="main-content" className="page qp-page">
      <div className="qp-bar">
        <button className="buyer-return" onClick={() => setMode('compose')}>
          <Icon name="back" size={17} />{t(locale, 'qpEdit')}
        </button>
      </div>
      <p className="qp-preview-note">{t(locale, 'qpPreviewNote')}</p>
      <div className="qp-preview">
        <ProductCard product={previewProduct} locale={locale} onOpen={() => undefined} />
      </div>
      {previewProduct.description ? <section className="section">
        <p>{previewProduct.description}</p>
      </section> : null}
      {previewProduct.specifications.length ? <section className="section">
        <dl className="spec-list">
          {previewProduct.specifications.map((row) => <div key={row.key}>
            <dt>{row.label}</dt><dd>{row.value}</dd>
          </div>)}
        </dl>
      </section> : null}
      {conflict ? <div className="notice" role="alert">
        <Icon name="warning" size={19} /><span>{t(locale, 'conflictBody')}</span>
      </div> : null}
      {publish.isError && !conflict ? <p className="field__error" role="alert">{t(locale, 'errorBody')}</p> : null}
      <div className="qp-cta">
        <Button wide pending={publish.isPending} disabled={publish.isPending} onClick={() => publish.mutate()}>
          {t(locale, 'qpPublish')}
        </Button>
        <Button wide variant="secondary" onClick={() => setMode('compose')}>{t(locale, 'qpEdit')}</Button>
      </div>
    </main>;
  }

  return <main id="main-content" className="page qp-page">
    <div className="qp-bar">
      <button className="buyer-return" onClick={() => {
        if (dirty && !saved) setAskLeave(true);
        else onClose();
      }}>
        <Icon name="back" size={17} />{t(locale, 'back')}
      </button>
      <span className="qp-bar__state" role="status">
        {saved ? t(locale, 'qpDraftSaved') : ''}
      </span>
    </div>

    <h1 className="qp-title">{t(locale, 'qpTitle')}</h1>

    <PhotoRow
      photos={photos}
      locale={locale}
      busy={uploading}
      canUpload={mediaUpload}
      error={photoError}
      onPick={(files) => void uploadFiles(files ? Array.from(files) : [])}
      onChange={changePhotos}
      onRetry={() => void uploadFiles(pendingFiles)}
    />

    <section className="qp-block">
      <Field label={t(locale, 'qpName')} error={errors.title && t(locale, errors.title)}>
        <input
          ref={titleRef}
          type="text"
          maxLength={TITLE_MAX}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t(locale, 'qpNamePlaceholder')}
        />
      </Field>

      <Field label={t(locale, 'qpCategory')} error={errors.category && t(locale, errors.category)}>
        <select
          ref={categoryRef}
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">{t(locale, 'qpCategoryPlaceholder')}</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </Field>

      <Field
        label={t(locale, 'qpPrice')}
        hint={priceInput ? `${groupDigits(priceInput)} ${t(locale, 'currency')}` : t(locale, 'qpPriceHint')}
        error={errors.price && t(locale, errors.price)}
      >
        <input
          ref={priceRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="qp-price"
          value={groupDigits(priceInput)}
          onChange={(event) => setPriceInput(digitsOf(event.target.value))}
          placeholder="0"
        />
      </Field>

      <Field label={t(locale, 'qpDescription')}>
        <textarea
          maxLength={DESCRIPTION_MAX}
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t(locale, 'qpDescriptionPlaceholder')}
        />
      </Field>
    </section>

    <section className="qp-block">
      <span className="cabinet-choice__label" id="qp-availability">{t(locale, 'qpAvailability')}</span>
      <div className="segmented segmented--choice" role="group" aria-labelledby="qp-availability">
        {(['available', 'preorder', 'unavailable'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={availability === value}
            onClick={() => setAvailability(value)}
          >{t(locale, value)}</button>
        ))}
      </div>
    </section>

    <section className="qp-block">
      <button
        type="button"
        className="qp-disclosure"
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen(!detailsOpen)}
      >
        <span>{t(locale, 'qpMoreDetails')}</span>
        <Icon name="chevron" size={18} />
      </button>
      {detailsOpen ? <div className="stack">
        {specifications.map((row, index) => <div className="qp-spec" key={index}>
          <input
            type="text"
            aria-label={t(locale, 'qpSpecLabel')}
            placeholder={t(locale, 'qpSpecLabel')}
            value={row.label}
            onChange={(event) => setSpecifications(specifications.map(
              (item, at) => at === index ? { ...item, label: event.target.value } : item,
            ))}
          />
          <input
            type="text"
            aria-label={t(locale, 'qpSpecValue')}
            placeholder={t(locale, 'qpSpecValue')}
            value={row.value}
            onChange={(event) => setSpecifications(specifications.map(
              (item, at) => at === index ? { ...item, value: event.target.value } : item,
            ))}
          />
          <button
            type="button" className="icon-button"
            aria-label={`${t(locale, 'removeRow')}: ${index + 1}`}
            onClick={() => setSpecifications(specifications.filter((_, at) => at !== index))}
          ><Icon name="close" size={17} /></button>
        </div>)}
        {specifications.length < 12 ? <Button
          variant="secondary"
          onClick={() => setSpecifications([...specifications, { label: '', value: '' }])}
        ><Icon name="plus" size={17} />{t(locale, 'qpAddSpec')}</Button> : null}
      </div> : null}
    </section>

    <div className="qp-cta">
      <Button wide onClick={() => { if (validate()) setMode('preview'); }}>
        {t(locale, 'qpCheck')}
      </Button>
    </div>

    {/* Three answers, because there are three: keep the words, drop the words,
        or go back to them. A two-button dialog would have to fold two of those
        together, and the one it would quietly pick is the one that loses work. */}
    <Modal
      open={askLeave}
      title={t(locale, 'qpLeaveTitle')}
      onClose={() => setAskLeave(false)}
      closeLabel={t(locale, 'qpLeaveStay')}
    >
      <div className="stack">
        <p className="muted">{t(locale, 'qpLeaveBody')}</p>
        <Button wide onClick={leaveSaving}>{t(locale, 'qpLeaveSave')}</Button>
        <Button wide variant="danger" onClick={leaveDiscarding}>{t(locale, 'qpLeaveDiscard')}</Button>
        <Button wide variant="secondary" onClick={() => setAskLeave(false)}>{t(locale, 'qpLeaveStay')}</Button>
      </div>
    </Modal>
  </main>;
}

/** What the seller sees the moment the listing exists. */
export function QuickPostDone({
  locale, product, onOpen, onCabinet, onAgain,
}: {
  locale: Locale;
  product: SellerProduct;
  /** Opens the listing itself. Real, because the listing is real by now. */
  onOpen: () => void;
  onCabinet: () => void;
  onAgain: () => void;
}) {
  return <main id="main-content" className="page qp-page">
    <div className="qp-done">
      <Icon name="check" size={30} />
      <strong>{t(locale, 'qpDoneTitle')}</strong>
      <p>{t(locale, 'qpDoneBody')}</p>
    </div>
    {/* The listing that now exists, drawn by the shopper's own component. A
        second hand-rolled card here would be the same lie the preview avoids. */}
    <div className="qp-preview">
      <ProductCard product={product} locale={locale} onOpen={onOpen} />
    </div>
    <div className="qp-cta">
      <Button wide onClick={onAgain}>{t(locale, 'qpDoneAgain')}</Button>
      <Button wide variant="secondary" onClick={onCabinet}>{t(locale, 'qpDoneCabinet')}</Button>
    </div>
  </main>;
}
