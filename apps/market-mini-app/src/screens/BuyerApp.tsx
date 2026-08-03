import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MarketApiError, marketApi, voiceSearch } from '../lib/api';
import { SELLER_START_URL } from '../lib/bot-link';
import { demoProductImage } from '../lib/demo-product-media';
import { formatPrice, labelForStatus, localizeCategory, t } from '../lib/i18n';
import {
  VoiceCaptureError,
  VoiceRecorder,
  voiceCaptureSupported,
  type VoiceRecording,
} from '../lib/voice';
import { haptic, type ThemePreference } from '../platform/telegram';
import type {
  CatalogHome,
  CheckoutSnapshot,
  Handoff,
  Locale,
  Product,
  VoiceSearchResult,
} from '../types';
import {
  AsyncImage,
  Badge,
  Button,
  ErrorView,
  Field,
  Icon,
  LoadingView,
  Modal,
  SectionHeader,
  SkeletonList,
  StateView,
} from '../components/ui';
import {
  VoiceSheet,
  VoiceSummary,
  type VoiceErrorKind,
  type VoiceStage,
} from '../components/VoiceSearch';
import { BuyerOrdersList } from './BuyerOrders';

const CabinetApp = lazy(() => import('./CabinetApp').then((module) => ({
  default: module.CabinetApp,
})));

type BuyerView = 'home' | 'search' | 'compare' | 'orders' | 'publish' | 'cabinet';

interface BuyerAppProps {
  locale: Locale;
  initialHome: CatalogHome;
  /** Server-reported voice capability; false hides the microphone entirely. */
  voiceEnabled: boolean;
  /**
   * Server-reported cabinet shell. False keeps the four-tab layout with its own
   * "Заказы" tab exactly as it shipped, so the switch is reversible from the
   * server without touching this build.
   */
  cabinetEnabled: boolean;
  /**
   * Server-reported cabinet root. With it on, "Подать" stops being a screen and
   * becomes a sheet over whichever tab the person was already looking at.
   */
  cabinetHomeV2: boolean;
  /**
   * The tab list the server reported for this shell. A presentation hint: it can
   * only reorder destinations this build already carries, it can never add one,
   * and it grants nothing. Anything unexpected falls back to the shipped order.
   */
  navigation: readonly string[];
  /** Server-granted seller authority; decides only whether the cabinet shows a store section. */
  sellerAvailable: boolean;
  sellerCommands: boolean;
  mediaUpload: boolean;
  userName: string;
  buildId: string;
  /** Server-reported: an order left half-filled and a question still open. */
  activeCheckout: boolean;
  activeHandoff: boolean;
  theme: ThemePreference;
  onTheme: (next: ThemePreference) => void;
  onLocale: (next: Locale) => void;
}

function voiceErrorFor(error: unknown): VoiceErrorKind {
  if (!(error instanceof MarketApiError)) return 'network';
  if (error.code === 'voice_unclear' || error.code === 'validation_failed') {
    return 'unclear';
  }
  if (error.code === 'voice_unavailable' || error.code === 'feature_disabled') {
    return 'unavailable';
  }
  if (error.code === 'rate_limited') return 'rate_limited';
  return 'network';
}

function availabilityTone(value: Product['availability']) {
  return value === 'available' ? 'positive' : value === 'preorder' ? 'warning' : 'negative';
}

function ProductCard({
  product,
  locale,
  onOpen,
  onCompare,
  comparePending,
  priority = false,
}: {
  product: Product;
  locale: Locale;
  onOpen: () => void;
  onCompare: () => void;
  comparePending?: boolean;
  priority?: boolean;
}) {
  const previewSrc = demoProductImage(product);
  return (
    <article className="product-card">
      <button className="product-card__visual" onClick={onOpen} aria-label={`${t(locale, 'details')}: ${product.name}`}>
        <AsyncImage className="product-card__media" handle={product.mediaHandles[0]} previewSrc={previewSrc} eager={priority} alt={product.name} />
        <span className="product-card__badge"><Badge tone={availabilityTone(product.availability)}>{labelForStatus(locale, product.availability)}</Badge></span>
      </button>
      <div className="product-card__body">
        <span className="product-card__store">{product.storeName}</span>
        <h3>{product.name}</h3>
        <span className="product-card__price">{formatPrice(product.priceMinor, locale)}</span>
        <div className="product-card__actions">
          <Button onClick={onOpen}>{t(locale, 'details')}</Button>
          <Button variant="secondary" onClick={onCompare} pending={comparePending} aria-label={`${t(locale, 'addCompare')}: ${product.name}`}>
            <Icon name="compare" size={19} /><span className="sr-only-mobile">{t(locale, 'addCompare')}</span>
          </Button>
        </div>
      </div>
    </article>
  );
}

function ProductDetail({
  product,
  locale,
  onClose,
  onCheckout,
  onQuestion,
  onCompare,
}: {
  product: Product | null;
  locale: Locale;
  onClose: () => void;
  onCheckout: (product: Product) => void;
  onQuestion: (product: Product) => void;
  onCompare: (product: Product) => void;
}) {
  return (
    <Modal open={Boolean(product)} title={product?.name ?? ''} onClose={onClose} closeLabel={t(locale, 'close')} sheet>
      {product ? <div className="stack product-detail">
        <div className="media-gallery">
          <AsyncImage handle={product.mediaHandles[0]} previewSrc={demoProductImage(product)} eager alt={product.name} />
        </div>
        <div className="row row--between">
          <span className="price-large">{formatPrice(product.priceMinor, locale)}</span>
          <Badge tone={availabilityTone(product.availability)}>{labelForStatus(locale, product.availability)}</Badge>
        </div>
        {product.description ? <p>{product.description}</p> : null}
        {product.specifications.length ? <dl className="spec-list">
          {product.specifications.map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
        </dl> : null}
        <div className="notice"><Icon name="warning" size={19} /><span>{t(locale, 'requestNotice')}</span></div>
        <div className="product-detail__actions">
          <Button wide disabled={product.availability === 'unavailable'} onClick={() => onCheckout(product)}>{t(locale, 'order')}</Button>
          <div className="row">
            <Button wide variant="secondary" onClick={() => onCompare(product)}><Icon name="compare" size={19} />{t(locale, 'addCompare')}</Button>
            <Button wide variant="ghost" onClick={() => onQuestion(product)}><Icon name="help" size={19} />{t(locale, 'askSeller')}</Button>
          </div>
        </div>
      </div> : null}
    </Modal>
  );
}

function CheckoutFlow({
  locale,
  product,
  initial,
  onClose,
}: {
  locale: Locale;
  product: Product | null;
  initial: CheckoutSnapshot | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<CheckoutSnapshot | null>(initial);
  const [value, setValue] = useState('');
  const mutation = useMutation({
    mutationFn: async (input: { path: string; body?: unknown }) =>
      marketApi.post<CheckoutSnapshot>(input.path, input.body),
    onSuccess: (next) => {
      setSnapshot(next);
      setValue('');
      haptic(next.outcome === 'placed' ? 'success' : 'tap');
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
    },
    onError: () => haptic('error'),
  });
  const cancel = useMutation({
    mutationFn: () => marketApi.post<{ checkout: CheckoutSnapshot | null }>('/checkout/cancel'),
    onSuccess: () => {
      // Nothing is waiting any more, so the cabinet must stop saying it is.
      void queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
      onClose();
    },
  });
  const state = snapshot?.state;
  const order = snapshot?.order;
  const checkoutStates = [
    'awaiting_quantity', 'awaiting_name', 'awaiting_phone',
    'awaiting_address', 'awaiting_comment', 'awaiting_confirmation',
  ];
  const progressStep = snapshot?.outcome === 'placed'
    ? checkoutStates.length
    : Math.max(0, checkoutStates.indexOf(state ?? ''));
  const progressPercent = Math.round(
    ((progressStep + (snapshot?.outcome === 'placed' ? 0 : 1)) / checkoutStates.length) * 100,
  );
  const step = useMemo(() => {
    if (state === 'awaiting_quantity') return { label: t(locale, 'quantity'), type: 'number', path: '/checkout/quantity', key: 'quantity' };
    if (state === 'awaiting_name') return { label: t(locale, 'name'), type: 'text', path: '/checkout/name', key: 'name' };
    if (state === 'awaiting_phone') return { label: t(locale, 'phone'), type: 'tel', path: '/checkout/phone', key: 'phone' };
    if (state === 'awaiting_address') return { label: t(locale, 'address'), type: 'text', path: '/checkout/address', key: 'address' };
    if (state === 'awaiting_comment') return { label: `${t(locale, 'comment')} (${t(locale, 'optional')})`, type: 'text', path: '/checkout/comment', key: 'comment' };
    return null;
  }, [locale, state]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!step || !value.trim()) return;
    const normalized = step.key === 'quantity' ? Number(value) : value.trim();
    mutation.mutate({ path: step.path, body: { [step.key]: normalized } });
  };
  return (
    <Modal open={Boolean(snapshot)} title={t(locale, 'checkout')} onClose={onClose} closeLabel={t(locale, 'close')} sheet>
      {snapshot?.outcome === 'placed' ? <StateView icon="check" title={t(locale, 'orderCreated')} body={t(locale, 'orderCreatedBody')} action={<Button onClick={onClose}>{t(locale, 'close')}</Button>} /> : <div className="stack">
        <div className="checkout-progress" role="progressbar" aria-label={t(locale, 'checkoutStep')} aria-valuemin={1} aria-valuemax={checkoutStates.length} aria-valuenow={progressStep + 1}>
          <div className="row row--between"><strong>{t(locale, 'checkoutStep')}</strong><span>{progressStep + 1}/{checkoutStates.length}</span></div>
          <span className="checkout-progress__track"><span style={{ width: `${progressPercent}%` }} /></span>
        </div>
        <div className="card"><div className="card__body row row--between"><div><strong>{order?.productNameSnapshot ?? product?.name}</strong><div className="muted">{formatPrice(order?.unitPriceMinor ?? product?.priceMinor ?? 0, locale)}</div></div>{order?.quantity ? <Badge>{order.quantity} ×</Badge> : null}</div></div>
        {snapshot?.priceChanged ? <div className="notice" role="alert"><Icon name="warning" size={19}/><span>{t(locale, 'priceChanged')}</span></div> : null}
        {step ? <form className="stack" onSubmit={submit}>
          <Field label={step.label}>
            <input required type={step.type} min={step.type === 'number' ? 1 : undefined} max={step.type === 'number' ? 99 : undefined} value={value} onChange={(event) => setValue(event.target.value)} autoComplete={step.key === 'name' ? 'name' : step.key === 'phone' ? 'tel' : step.key === 'address' ? 'street-address' : 'off'} />
          </Field>
          <Button wide type="submit" pending={mutation.isPending}>{t(locale, 'continue')}</Button>
          {state === 'awaiting_comment' ? <Button wide type="button" variant="secondary" pending={mutation.isPending} onClick={() => mutation.mutate({ path: '/checkout/comment/skip' })}>{t(locale, 'skip')}</Button> : null}
        </form> : null}
        {state === 'awaiting_confirmation' && order ? <div className="stack">
          <h3>{t(locale, 'summary')}</h3>
          <dl className="spec-list">
            <div><dt>{t(locale, 'quantity')}</dt><dd>{order.quantity}</dd></div>
            <div><dt>{t(locale, 'name')}</dt><dd>{order.buyerName}</dd></div>
            <div><dt>{t(locale, 'phone')}</dt><dd>{order.buyerPhone}</dd></div>
            <div><dt>{t(locale, 'address')}</dt><dd>{order.buyerAddress}</dd></div>
            <div><dt>{t(locale, 'total')}</dt><dd><strong>{formatPrice(order.totalMinor ?? 0, locale)}</strong></dd></div>
          </dl>
          <div className="notice"><Icon name="warning" size={19}/><span>{t(locale, 'requestNotice')}</span></div>
          <Button wide pending={mutation.isPending} onClick={() => mutation.mutate({ path: '/checkout/confirm' })}>{t(locale, 'confirm')}</Button>
        </div> : null}
        {mutation.isError ? <p className="field__error" role="alert">{t(locale, 'errorBody')}</p> : null}
        <Button variant="ghost" pending={cancel.isPending} onClick={() => cancel.mutate()}>{t(locale, 'cancel')}</Button>
      </div>}
    </Modal>
  );
}

function AskSeller({ product, locale, onClose }: { product: Product | null; locale: Locale; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState('');
  const mutation = useMutation({
    mutationFn: () => marketApi.post<{ handoff: Handoff }>('/handoffs', {
      reason: 'buyer_requested_human',
      question: `${product?.name}: ${question.trim()}`,
    }),
    onSuccess: () => {
      haptic('success');
      // The question is now open. Re-reading the counters is what puts it on the
      // cabinet in this session rather than in the next one.
      void queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
    },
  });
  return <Modal open={Boolean(product)} title={t(locale, 'askSeller')} onClose={onClose} closeLabel={t(locale, 'close')} sheet>
    {mutation.isSuccess ? <StateView icon="check" title={t(locale, 'handoffOpen')} action={<Button onClick={onClose}>{t(locale, 'close')}</Button>} /> : <form className="stack" onSubmit={(event) => { event.preventDefault(); if (question.trim()) mutation.mutate(); }}>
      <p className="muted">{product?.name}</p>
      <Field label={t(locale, 'question')}>
        <textarea required maxLength={500} value={question} onChange={(event) => setQuestion(event.target.value)} />
      </Field>
      <Button wide type="submit" pending={mutation.isPending}>{t(locale, 'send')}</Button>
      {mutation.isError ? <p className="field__error" role="alert">{t(locale, 'errorBody')}</p> : null}
    </form>}
  </Modal>;
}

/**
 * What "Подать" actually offers.
 *
 * Two branches, and neither is allowed to be a promise: selling opens the real
 * editor when the server has granted the commands and the real bot onboarding
 * when it has not, and "Ищу" opens the search that exists today rather than a
 * form for a request nothing can yet receive.
 */
function CreateSheet({
  open, locale, canCreateProduct, onClose, onSell, onWanted,
}: {
  open: boolean;
  locale: Locale;
  canCreateProduct: boolean;
  onClose: () => void;
  onSell: () => void;
  onWanted: () => void;
}) {
  return <Modal open={open} title={t(locale, 'createTitle')} onClose={onClose} closeLabel={t(locale, 'close')} sheet>
    <div className="create-list">
      {canCreateProduct ? <button type="button" className="create-option" onClick={onSell}>
        <span className="create-option__icon"><Icon name="products" size={22}/></span>
        <span className="create-option__text">
          <strong>{t(locale, 'createSell')}</strong>
          <small>{t(locale, 'createSellHint')}</small>
        </span>
        <Icon name="chevron" size={18}/>
      </button> : SELLER_START_URL ? <a
        className="create-option"
        href={SELLER_START_URL}
        target="_blank"
        rel="noreferrer"
        onClick={onClose}
      >
        <span className="create-option__icon"><Icon name="products" size={22}/></span>
        <span className="create-option__text">
          <strong>{t(locale, 'createSellViaBot')}</strong>
          <small>{t(locale, 'createSellViaBotHint')}</small>
        </span>
        <Icon name="chevron" size={18}/>
      </a> : null}
      <button type="button" className="create-option" onClick={onWanted}>
        <span className="create-option__icon"><Icon name="search" size={22}/></span>
        <span className="create-option__text">
          <strong>{t(locale, 'createWanted')}</strong>
          <small>{t(locale, 'createWantedHint')}</small>
        </span>
        <Icon name="chevron" size={18}/>
      </button>
    </div>
  </Modal>;
}

export function BuyerApp({
  locale,
  initialHome,
  voiceEnabled,
  cabinetEnabled,
  cabinetHomeV2,
  navigation,
  sellerAvailable,
  sellerCommands,
  mediaUpload,
  userName,
  buildId,
  activeCheckout,
  activeHandoff,
  theme,
  onTheme,
  onLocale,
}: BuyerAppProps) {
  const client = useQueryClient();
  const [view, setView] = useState<BuyerView>('home');
  const [selected, setSelected] = useState<Product | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);
  const [checkout, setCheckout] = useState<CheckoutSnapshot | null>(null);
  const [questionProduct, setQuestionProduct] = useState<Product | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [availability, setAvailability] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [comparisonActivated, setComparisonActivated] = useState(false);
  const [voiceStage, setVoiceStage] = useState<VoiceStage>('closed');
  const [voiceError, setVoiceError] = useState<VoiceErrorKind | null>(null);
  const [voiceLevels, setVoiceLevels] = useState<readonly number[]>([]);
  const [voiceElapsed, setVoiceElapsed] = useState(0);
  const [voiceResult, setVoiceResult] = useState<VoiceSearchResult | null>(null);
  const [voiceOffline, setVoiceOffline] = useState(false);
  // The seller workspace inside the cabinet brings its own bottom bar, so the
  // shell stands down rather than stacking a second one on the same edge.
  const [workspace, setWorkspace] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // Carried into the cabinet so "Продать" lands in the editor that already
  // exists rather than in a second copy of it.
  const [sellIntent, setSellIntent] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<VoiceRecorder | null>(null);

  // The microphone is offered only when the server says speech is configured,
  // the WebView can actually record, and speech has not already failed closed
  // in this session.
  const micAvailable = voiceEnabled && !voiceOffline && voiceCaptureSupported();

  const openSearch = () => {
    setView('search');
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const home = useQuery<CatalogHome>({ queryKey: ['catalog-home'], queryFn: ({ signal }) => marketApi.get('/catalog/home', signal), initialData: initialHome, staleTime: 60_000 });
  const search = useQuery<{ items: Product[]; queryApplied?: string | null }>({
    queryKey: ['products', query, availability, category, maxPrice],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (availability) params.set('availability', availability);
      // The category route ranks by category, not by text, and takes no price
      // ceiling; selecting a category therefore clears the budget instead of
      // silently dropping it.
      if (maxPrice !== null && !category) params.set('maxPriceMinor', String(maxPrice));
      params.set('limit', '20');
      const path = category
        ? `/catalog/categories/${encodeURIComponent(category)}/products?${params}`
        : `/catalog/products?${params}`;
      return marketApi.get(path, signal);
    },
    enabled: view === 'search',
    staleTime: 15_000,
  });
  const comparison = useQuery<{ items: Product[] }>({
    queryKey: ['comparison'],
    queryFn: ({ signal }) => marketApi.get('/comparison', signal),
    enabled: view === 'compare' || comparisonActivated,
  });
  const addCompare = useMutation<{ items: Product[] }, Error, string>({
    mutationFn: (productId: string) => marketApi.post('/comparison/items', { productId }),
    onSuccess: (next) => {
      haptic('success');
      setComparisonActivated(true);
      client.setQueryData(['comparison'], next);
    },
  });
  const clearCompare = useMutation({
    mutationFn: () => marketApi.delete('/comparison'),
    onSuccess: () => client.setQueryData(['comparison'], { items: [] }),
  });
  const removeCompare = useMutation<{ items: Product[] }, Error, string>({
    mutationFn: (id: string) => marketApi.delete(`/comparison/items/${encodeURIComponent(id)}`),
    onSuccess: (next) => client.setQueryData(['comparison'], next),
  });
  const startCheckout = useMutation({
    mutationFn: (product: Product) => marketApi.post<CheckoutSnapshot>('/checkout', { productId: product.id }),
    onSuccess: (snapshot, product) => {
      setSelected(null); setCheckoutProduct(product); setCheckout(snapshot);
      // An order now exists half-filled. The counters the cabinet reads were
      // answered at launch, so without this the row that offers to finish it
      // only appears on the next cold start.
      void client.invalidateQueries({ queryKey: ['bootstrap'] });
    },
  });
  // Reopening a half-filled order. The snapshot carries the product name and the
  // unit price it was started at, so the sheet has everything it needs without
  // the catalog row the first pass happened to come from.
  const resumeCheckout = useMutation({
    mutationFn: () => marketApi.get<{ checkout: CheckoutSnapshot | null }>('/checkout/active'),
    onSuccess: (result) => {
      if (!result.checkout) {
        // The counter that put the row on the cabinet came from the launch
        // payload and the order has been finished or cancelled since. Re-reading
        // the counters takes the row away instead of leaving a control that
        // answers a press with nothing.
        void client.invalidateQueries({ queryKey: ['bootstrap'] });
        return;
      }
      setCheckoutProduct(null);
      setCheckout(result.checkout);
    },
  });

  const voiceMutation = useMutation<VoiceSearchResult, Error, VoiceRecording>({
    mutationFn: (recording) => voiceSearch(recording),
    onSuccess: (result) => {
      haptic('success');
      setVoiceStage('closed');
      setVoiceResult(result);
      const next = result.interpretation;
      const nextAvailability = next.availability ?? '';
      setCategory(null);
      setQueryInput(next.productQuery);
      setQuery(next.productQuery);
      setAvailability(nextAvailability);
      setMaxPrice(next.maxPriceMinor);
      setView('search');
      // The launch already paid for this search; seeding the cache under the
      // exact key the search query uses avoids an immediate duplicate request.
      client.setQueryData(
        ['products', next.productQuery, nextAvailability, null, next.maxPriceMinor],
        { items: result.items, queryApplied: result.queryApplied },
      );
    },
    onError: (error) => {
      const kind = voiceErrorFor(error);
      if (kind === 'unavailable') setVoiceOffline(true);
      haptic('error');
      setVoiceError(kind);
      setVoiceStage('error');
    },
  });

  const releaseRecorder = () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
  };
  useEffect(() => releaseRecorder, []);

  const failVoice = (kind: VoiceErrorKind) => {
    haptic('error');
    setVoiceError(kind);
    setVoiceStage('error');
  };

  const finishRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder?.recording) return;
    setVoiceStage('processing');
    let recording: VoiceRecording;
    try {
      recording = await recorder.stop();
    } catch (error) {
      recorderRef.current = null;
      failVoice(
        error instanceof VoiceCaptureError && error.reason === 'too_short'
          ? 'too_short'
          : 'unclear',
      );
      return;
    }
    recorderRef.current = null;
    haptic('tap');
    voiceMutation.mutate(recording);
  };

  const beginRecording = async () => {
    releaseRecorder();
    setVoiceError(null);
    setVoiceLevels([]);
    setVoiceElapsed(0);
    setVoiceStage('requesting');
    const recorder = new VoiceRecorder({
      onLevels: (levels) => setVoiceLevels(levels.slice()),
      onElapsed: setVoiceElapsed,
      onAutoStop: () => void finishRecording(),
    });
    recorderRef.current = recorder;
    try {
      await recorder.start();
    } catch (error) {
      recorderRef.current = null;
      const reason = error instanceof VoiceCaptureError ? error.reason : 'capture_failed';
      // "Open this in Telegram" is only honest when the WebView genuinely
      // cannot record; a one-off capture failure gets a plain retry instead.
      failVoice(
        reason === 'permission_denied' || reason === 'no_microphone'
          ? 'denied'
          : reason === 'unsupported'
            ? 'unsupported'
            : 'network',
      );
      return;
    }
    haptic('tap');
    setVoiceStage('recording');
  };

  const openVoice = () => {
    if (!micAvailable) return;
    setVoiceError(null);
    setVoiceLevels([]);
    setVoiceElapsed(0);
    setView('search');
    setVoiceStage('intro');
  };

  const closeVoice = () => {
    releaseRecorder();
    setVoiceStage('closed');
  };

  const typeInstead = () => {
    closeVoice();
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const applyTranscript = (value: string) => {
    setQueryInput(value);
    setQuery(value);
  };

  const selectCategory = (id: string | null) => {
    setCategory(id);
    if (id) setMaxPrice(null);
  };

  const openCheckout = (product: Product) => startCheckout.mutate(product);
  const productList = (products: Product[], loading: boolean, error: boolean, retry: () => void) => {
    if (loading) return <SkeletonList />;
    if (error) return <ErrorView locale={locale} retry={retry} />;
    if (!products.length) return <StateView icon="search" title={t(locale, 'noProducts')} body={t(locale, 'noProductsBody')} />;
    return <div className="product-grid">{products.map((product, index) => <ProductCard key={product.id} product={product} locale={locale} priority={index < 2} onOpen={() => setSelected(product)} onCompare={() => addCompare.mutate(product.id)} comparePending={addCompare.isPending && addCompare.variables === product.id} />)}</div>;
  };

  const comparisonItems = comparison.data?.items ?? [];
  // What Bormi actually searched for, shown only when it differs from what the
  // shopper wrote.
  //
  // This replaces "Не нашли по условию: слушай, можешь, дать". Listing the
  // words that failed requires knowing which of them were ever meant as
  // conditions, and that needs a filler list nobody can finish. Since the query
  // now contains only words the catalog really has, the honest and useful thing
  // is the positive statement: «Искали: блокнот». A dropped «чёрная» is just as
  // visible — the shopper sees colour was not part of it.
  const searchedFor = useMemo(() => {
    // A voice result already states what Bormi understood, in its own compact
    // bar. Repeating it here would put two lines of chrome above the products.
    if (voiceResult) return null;
    const applied = search.data?.queryApplied ?? null;
    if (!applied || !query) return null;
    return applied.toLowerCase() === query.trim().toLowerCase() ? null : applied;
  }, [search.data, query, voiceResult]);

  // Four tabs as shipped, or the cabinet shell. Comparison leaves the bar in the
  // cabinet layout but keeps its screen: the tray that appears once something is
  // being compared is what opens it.
  const defaultTabs = cabinetEnabled
    ? ([
        ['home', 'home', 'home'], ['search', 'search', 'search'],
        ['publish', 'plus', 'postAd'], ['cabinet', 'cabinet', 'cabinet'],
      ] as const)
    : ([
        ['home', 'home', 'home'], ['search', 'search', 'search'],
        ['compare', 'compare', 'compare'], ['orders', 'orders', 'orders'],
      ] as const);
  // `bootstrap.navigation` was computed by the server and read by nobody. It is
  // honoured here as what it actually is — the order of the bar — and nothing
  // more: an entry this build does not know is dropped, and if what is left is
  // not the same set, the shipped order stands. It cannot add a destination and
  // it cannot grant one.
  const hinted = navigation
    .map((name) => defaultTabs.find((tab) => tab[0] === name))
    .filter((tab): tab is (typeof defaultTabs)[number] => Boolean(tab));
  const tabs = hinted.length === defaultTabs.length ? hinted : defaultTabs;

  // One badge for the whole bar, and only for the two things the server already
  // counts: an order left half-filled and a question still waiting. Nothing that
  // is merely housekeeping earns it.
  const waiting = (activeCheckout ? 1 : 0) + (activeHandoff ? 1 : 0);
  const badgeFor = (destination: BuyerView) =>
    destination === 'cabinet' && cabinetEnabled && waiting > 0 ? waiting : 0;

  const openCreate = () => {
    haptic('tap');
    setCreateOpen(true);
  };
  const goTab = (destination: BuyerView) => {
    // "Подать" is an action, not a place: the sheet opens over whatever the
    // person was reading and the current tab keeps its aria-current.
    if (destination === 'publish' && cabinetHomeV2) {
      openCreate();
      return;
    }
    setView(destination);
  };
  const sellFromSheet = () => {
    setCreateOpen(false);
    setSellIntent(true);
    setView('cabinet');
  };
  const wantedFromSheet = () => {
    setCreateOpen(false);
    setView('search');
    // The sheet hands focus back to whatever opened it as it unmounts, which
    // would take the caret straight out of the field again. The field is claimed
    // after that has happened, not before.
    globalThis.setTimeout(() => searchRef.current?.focus(), 0);
  };

  return <>
    <main id="main-content" className="page">
      {view === 'home' ? <>
        <section className="hero hero--brand">
          <span className="hero__orb" aria-hidden="true" />
          <p className="eyebrow"><Icon name="spark" size={15}/>{t(locale, 'brandTagline')}</p>
          <h1>{t(locale, 'brandPromise')}</h1>
          <p>{t(locale, 'heroBody')}</p>
          <div className="hero-search-row">
            <button className="hero-search" onClick={openSearch}>
              <Icon name="search" size={21}/><span>{t(locale, 'heroSearch')}</span><Icon name="chevron" size={18}/>
            </button>
            {micAvailable ? <button className="hero-mic" onClick={openVoice} aria-label={t(locale, 'voiceStart')}>
              <Icon name="mic" size={22}/>
            </button> : null}
          </div>
          <div className="hero__trust"><Icon name="check" size={16}/><span>{t(locale, 'catalogTruth')}</span></div>
        </section>
        <section className="section"><SectionHeader title={t(locale, 'categories')} />
          <div className="chip-row" role="group" aria-label={t(locale, 'categories')}>{home.data?.categories.map((item) => <button className="chip" key={item.id} aria-pressed={category === item.id} onClick={() => { selectCategory(item.id); setView('search'); }}><span>{localizeCategory(item.name, locale)}</span> <small>{item.productCount}</small></button>)}</div>
        </section>
        <section className="section"><SectionHeader title={t(locale, 'featured')} action={<Button variant="ghost" onClick={openSearch}>{t(locale, 'all')} <Icon name="chevron" size={18}/></Button>} />
          <div className="demo-disclosure" role="note">{t(locale, 'demoLabel')}</div>
          {productList(home.data?.products ?? [], home.isLoading, home.isError, () => void home.refetch())}
        </section>
      </> : null}

      {view === 'search' ? <>
        <section className="hero"><h1>{t(locale, 'search')}</h1></section>
        <form className="search-form" role="search" onSubmit={(event) => { event.preventDefault(); setQuery(queryInput.trim()); }}>
          <div className="search-field">
            <Icon name="search" size={20}/>
            <input ref={searchRef} type="search" enterKeyHint="search" aria-label={t(locale, 'search')} placeholder={t(locale, 'searchPlaceholder')} value={queryInput} onChange={(event) => setQueryInput(event.target.value)} />
            {queryInput ? <button type="button" className="search-field__clear" aria-label={t(locale, 'clear')} onClick={() => { setQueryInput(''); setQuery(''); searchRef.current?.focus(); }}><Icon name="close" size={18}/></button> : null}
            {micAvailable ? <button type="button" className="search-field__mic" aria-label={t(locale, 'voiceStart')} onClick={openVoice}><Icon name="mic" size={20}/></button> : null}
          </div>
          <Button type="submit" aria-label={t(locale, 'searchAction')}><Icon name="chevron" /></Button>
        </form>
        <div className="chip-row chip-row--filters">
          <button type="button" className="chip chip--action" onClick={() => setFiltersOpen(true)}>
            <Icon name="filter" size={16}/><span>{t(locale, 'filters')}</span>
          </button>
          {category ? <span className="chip chip--filter">
            {localizeCategory(home.data?.categories.find((item) => item.id === category)?.name ?? category, locale)}
            <button type="button" onClick={() => selectCategory(null)} aria-label={`${t(locale, 'clear')}: ${localizeCategory(home.data?.categories.find((item) => item.id === category)?.name ?? category, locale)}`}><Icon name="close" size={15}/></button>
          </span> : null}
        </div>
        {voiceResult ? <VoiceSummary
          key={voiceResult.transcript}
          locale={locale}
          transcript={voiceResult.transcript}
          interpretation={voiceResult.interpretation}
          activeMaxPrice={maxPrice}
          activeAvailability={availability}
          onSubmitTranscript={applyTranscript}
          onClearBudget={() => setMaxPrice(null)}
          onClearAvailability={() => setAvailability('')}
          onConfirmBudget={(accepted) => {
            const spoken = voiceResult.interpretation.ambiguousPriceMinor;
            setVoiceResult({
              ...voiceResult,
              interpretation: {
                ...voiceResult.interpretation,
                clarification: null,
                maxPriceMinor: accepted ? spoken : voiceResult.interpretation.maxPriceMinor,
              },
            });
            if (accepted && spoken !== null) setMaxPrice(spoken);
          }}
          onDismiss={() => setVoiceResult(null)}
        /> : null}
        {searchedFor ? <p className="search-note" role="status">
          {t(locale, 'searchedFor')}: {searchedFor}
        </p> : null}
        <section className="section">{productList(search.data?.items ?? [], search.isLoading, search.isError, () => void search.refetch())}</section>
      </> : null}

      {view === 'compare' ? <>
        <section className="hero"><div className="row row--between"><h1>{t(locale, 'compare')}</h1>{comparison.data?.items.length ? <Button variant="ghost" pending={clearCompare.isPending} onClick={() => clearCompare.mutate()}>{t(locale, 'clear')}</Button> : null}</div></section>
        {comparison.isLoading ? <SkeletonList count={3} /> : comparison.data?.items.length ? <div className="stack">{comparison.data.items.map((product) => <article className="card" key={product.id}><div className="card__body stack"><div className="row"><AsyncImage className="compare-thumb" handle={product.mediaHandles[0]} previewSrc={demoProductImage(product)} alt={product.name}/><div><h2>{product.name}</h2><strong>{formatPrice(product.priceMinor, locale)}</strong></div></div><Badge tone={availabilityTone(product.availability)}>{labelForStatus(locale, product.availability)}</Badge><dl className="spec-list">{product.specifications.map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><Button variant="secondary" pending={removeCompare.isPending} onClick={() => removeCompare.mutate(product.id)}>{t(locale, 'remove')}</Button></div></article>)}</div> : <StateView icon="compare" title={t(locale, 'compareEmpty')} action={<Button onClick={() => setView('search')}>{t(locale, 'search')}</Button>} />}
      </> : null}

      {view === 'orders' ? <>
        <section className="hero"><h1>{t(locale, 'orders')}</h1></section>
        <BuyerOrdersList locale={locale} onSearch={openSearch} />
      </> : null}

      {view === 'publish' && !cabinetHomeV2 ? <>
        <section className="hero"><h1>{t(locale, 'postAd')}</h1></section>
        <StateView
          icon="plus"
          title={t(locale, 'postAdSoon')}
          body={t(locale, 'postAdSoonBody')}
          action={<Button onClick={openSearch}>{t(locale, 'search')}</Button>}
        />
      </> : null}

      {view === 'cabinet' ? <Suspense fallback={<LoadingView locale={locale} />}>
        <CabinetApp
          locale={locale}
          userName={userName}
          buildId={buildId}
          sellerAvailable={sellerAvailable}
          sellerCommands={sellerCommands}
          mediaUpload={mediaUpload}
          homeV2={cabinetHomeV2}
          sellIntent={sellIntent}
          onSellIntentHandled={() => setSellIntent(false)}
          activeCheckout={activeCheckout}
          activeHandoff={activeHandoff}
          theme={theme}
          onSearch={openSearch}
          onCreate={openCreate}
          onResumeCheckout={() => resumeCheckout.mutate()}
          onTheme={onTheme}
          onLocale={onLocale}
          onWorkspace={setWorkspace}
        />
      </Suspense> : null}
    </main>

    {comparisonItems.length && view !== 'compare' ? <aside className="compare-tray" aria-label={t(locale, 'compare')}>
      <button onClick={() => setView('compare')}><span className="compare-tray__icon"><Icon name="compare" size={19}/></span><span><strong>{t(locale, 'comparisonReady')}</strong><small>{comparisonItems.length}/3</small></span><Icon name="chevron" size={18}/></button>
      <button className="icon-button" onClick={() => clearCompare.mutate()} aria-label={t(locale, 'clear')}><Icon name="close" size={18}/></button>
    </aside> : null}

    {workspace ? null : <nav className="bottom-nav" aria-label={t(locale, 'appName')}>
      {tabs.map(([destination, icon, label]) => {
        const badge = badgeFor(destination);
        const sheet = destination === 'publish' && cabinetHomeV2;
        return <button
          key={destination}
          className={destination === 'publish' ? 'bottom-nav__publish' : undefined}
          onClick={() => goTab(destination)}
          aria-haspopup={sheet ? 'dialog' : undefined}
          aria-expanded={sheet ? createOpen : undefined}
          aria-current={!sheet && view === destination ? 'page' : undefined}
          aria-label={badge ? `${t(locale, label)}: ${t(locale, 'attentionTitle')}, ${badge}` : undefined}
        >
          <span className="bottom-nav__icon">
            <Icon name={icon}/>
            {destination === 'compare' && comparisonItems.length ? <small>{comparisonItems.length}</small> : null}
            {badge ? <small>{badge > 9 ? '9+' : badge}</small> : null}
          </span>
          <span>{t(locale, label)}</span>
        </button>;
      })}
    </nav>}

    <ProductDetail product={selected} locale={locale} onClose={() => setSelected(null)} onCheckout={openCheckout} onQuestion={(product) => { setSelected(null); setQuestionProduct(product); }} onCompare={(product) => addCompare.mutate(product.id)} />
    <CheckoutFlow key={checkoutProduct?.id ?? checkout?.order.id ?? 'closed'} locale={locale} product={checkoutProduct} initial={checkout} onClose={() => { setCheckout(null); setCheckoutProduct(null); }} />
    <CreateSheet
      open={createOpen}
      locale={locale}
      canCreateProduct={sellerCommands}
      onClose={() => setCreateOpen(false)}
      onSell={sellFromSheet}
      onWanted={wantedFromSheet}
    />
    <AskSeller locale={locale} product={questionProduct} onClose={() => setQuestionProduct(null)} />
    <Modal open={filtersOpen} title={t(locale, 'filters')} onClose={() => setFiltersOpen(false)} closeLabel={t(locale, 'close')} sheet>
      <div className="stack">
        <Field label={t(locale, 'available')}>
          <select value={availability} onChange={(event) => setAvailability(event.target.value)}>
            <option value="">{t(locale, 'all')}</option>
            <option value="available">{t(locale, 'available')}</option>
            <option value="preorder">{t(locale, 'preorder')}</option>
            <option value="unavailable">{t(locale, 'unavailable')}</option>
          </select>
        </Field>
        <Field label={t(locale, 'priceUpTo')}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1000}
            value={maxPrice === null ? '' : String(maxPrice)}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              setMaxPrice(
                event.target.value && Number.isSafeInteger(parsed) && parsed > 0
                  ? parsed
                  : null,
              );
            }}
          />
        </Field>
        <Button wide onClick={() => setFiltersOpen(false)}>{t(locale, 'apply')}</Button>
        <Button wide variant="secondary" onClick={() => { setAvailability(''); setMaxPrice(null); selectCategory(null); }}>{t(locale, 'reset')}</Button>
      </div>
    </Modal>

    <VoiceSheet
      locale={locale}
      stage={voiceStage}
      error={voiceError}
      levels={voiceLevels}
      elapsedMs={voiceElapsed}
      onAllow={() => void beginRecording()}
      onStop={() => void finishRecording()}
      onCancel={closeVoice}
      onRetry={() => void beginRecording()}
      onTypeInstead={typeInstead}
    />
  </>;
}
