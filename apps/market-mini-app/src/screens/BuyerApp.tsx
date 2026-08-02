import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { marketApi } from '../lib/api';
import { demoProductImage } from '../lib/demo-product-media';
import { formatDate, formatPrice, t } from '../lib/i18n';
import { haptic } from '../platform/telegram';
import type {
  BuyerOrder,
  CatalogHome,
  CheckoutSnapshot,
  Handoff,
  Locale,
  Product,
} from '../types';
import {
  AsyncImage,
  Badge,
  Button,
  ErrorView,
  Field,
  Icon,
  Modal,
  SectionHeader,
  SkeletonList,
  StateView,
  labelForStatus,
} from '../components/ui';

type BuyerView = 'home' | 'search' | 'compare' | 'orders';

interface BuyerAppProps {
  locale: Locale;
  onLocale: (locale: Locale) => void;
  sellerAvailable: boolean;
  onSeller: () => void;
  initialHome: CatalogHome;
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
      <AsyncImage className="product-card__media" handle={product.mediaHandles[0]} previewSrc={previewSrc} eager={priority} alt={product.name} />
      <div className="product-card__body">
        <Badge tone={availabilityTone(product.availability)}>{labelForStatus(locale, product.availability)}</Badge>
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
    <Modal open={Boolean(product)} title={product?.name ?? ''} onClose={onClose} sheet>
      {product ? <div className="stack">
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
        <Button wide disabled={product.availability === 'unavailable'} onClick={() => onCheckout(product)}>{t(locale, 'order')}</Button>
        <div className="row">
          <Button wide variant="secondary" onClick={() => onCompare(product)}><Icon name="compare" size={19} />{t(locale, 'addCompare')}</Button>
          <Button wide variant="ghost" onClick={() => onQuestion(product)}><Icon name="help" size={19} />{t(locale, 'askSeller')}</Button>
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
  useEffect(() => setSnapshot(initial), [initial]);
  const cancel = useMutation({
    mutationFn: () => marketApi.post<{ checkout: CheckoutSnapshot | null }>('/checkout/cancel'),
    onSuccess: () => onClose(),
  });
  const state = snapshot?.state;
  const order = snapshot?.order;
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
    <Modal open={Boolean(product && snapshot)} title={t(locale, 'checkout')} onClose={onClose} sheet>
      {snapshot?.outcome === 'placed' ? <StateView icon="check" title={t(locale, 'orderCreated')} body={t(locale, 'orderCreatedBody')} action={<Button onClick={onClose}>{t(locale, 'close')}</Button>} /> : <div className="stack">
        <div className="card"><div className="card__body row row--between"><div><strong>{order?.productNameSnapshot ?? product?.name}</strong><div className="muted">{formatPrice(order?.unitPriceMinor ?? product?.priceMinor ?? 0, locale)}</div></div>{order?.quantity ? <Badge>{order.quantity} ×</Badge> : null}</div></div>
        {snapshot?.priceChanged ? <div className="notice" role="alert"><Icon name="warning" size={19}/><span>{t(locale, 'priceChanged')}</span></div> : null}
        {step ? <form className="stack" onSubmit={submit}>
          <Field label={step.label}>
            <input autoFocus required type={step.type} min={step.type === 'number' ? 1 : undefined} max={step.type === 'number' ? 99 : undefined} value={value} onChange={(event) => setValue(event.target.value)} autoComplete={step.key === 'name' ? 'name' : step.key === 'phone' ? 'tel' : step.key === 'address' ? 'street-address' : 'off'} />
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
  const [question, setQuestion] = useState('');
  const mutation = useMutation({
    mutationFn: () => marketApi.post<{ handoff: Handoff }>('/handoffs', {
      reason: 'buyer_requested_human',
      question: `${product?.name}: ${question.trim()}`,
    }),
    onSuccess: () => haptic('success'),
  });
  return <Modal open={Boolean(product)} title={t(locale, 'askSeller')} onClose={onClose} sheet>
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

export function BuyerApp({ locale, onLocale, sellerAvailable, onSeller, initialHome }: BuyerAppProps) {
  const client = useQueryClient();
  const [view, setView] = useState<BuyerView>('home');
  const [selected, setSelected] = useState<Product | null>(null);
  const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);
  const [checkout, setCheckout] = useState<CheckoutSnapshot | null>(null);
  const [questionProduct, setQuestionProduct] = useState<Product | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [availability, setAvailability] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);

  const home = useQuery<CatalogHome>({ queryKey: ['catalog-home'], queryFn: ({ signal }) => marketApi.get('/catalog/home', signal), initialData: initialHome, staleTime: 60_000 });
  const search = useQuery<{ items: Product[] }>({
    queryKey: ['products', query, availability, category],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (availability) params.set('availability', availability);
      params.set('limit', '20');
      const path = category
        ? `/catalog/categories/${encodeURIComponent(category)}/products?${params}`
        : `/catalog/products?${params}`;
      return marketApi.get(path, signal);
    },
    enabled: view === 'search',
    staleTime: 15_000,
  });
  const comparison = useQuery<{ items: Product[] }>({ queryKey: ['comparison'], queryFn: ({ signal }) => marketApi.get('/comparison', signal), enabled: view === 'compare' });
  const orders = useQuery<{ items: BuyerOrder[] }>({ queryKey: ['orders'], queryFn: ({ signal }) => marketApi.get('/orders?limit=5', signal), enabled: view === 'orders' });
  const addCompare = useMutation({
    mutationFn: (productId: string) => marketApi.post('/comparison/items', { productId }),
    onSuccess: () => { haptic('success'); void client.invalidateQueries({ queryKey: ['comparison'] }); },
  });
  const clearCompare = useMutation({ mutationFn: () => marketApi.delete('/comparison'), onSuccess: () => void client.invalidateQueries({ queryKey: ['comparison'] }) });
  const removeCompare = useMutation({ mutationFn: (id: string) => marketApi.delete(`/comparison/items/${encodeURIComponent(id)}`), onSuccess: () => void client.invalidateQueries({ queryKey: ['comparison'] }) });
  const startCheckout = useMutation({
    mutationFn: (product: Product) => marketApi.post<CheckoutSnapshot>('/checkout', { productId: product.id }),
    onSuccess: (snapshot, product) => { setSelected(null); setCheckoutProduct(product); setCheckout(snapshot); },
  });

  const openCheckout = (product: Product) => startCheckout.mutate(product);
  const productList = (products: Product[], loading: boolean, error: boolean, retry: () => void) => {
    if (loading) return <SkeletonList />;
    if (error) return <ErrorView locale={locale} retry={retry} />;
    if (!products.length) return <StateView icon="search" title={t(locale, 'noProducts')} body={t(locale, 'noProductsBody')} />;
    return <div className="product-grid">{products.map((product, index) => <ProductCard key={product.id} product={product} locale={locale} priority={index < 4} onOpen={() => setSelected(product)} onCompare={() => addCompare.mutate(product.id)} comparePending={addCompare.isPending && addCompare.variables === product.id} />)}</div>;
  };

  return <>
    <main id="main-content" className="page">
      {view === 'home' ? <>
        <section className="hero"><p className="eyebrow">{t(locale, 'appName')}</p><h1>{home.data?.products[0]?.storeName ?? t(locale, 'featured')}</h1><p>{t(locale, 'requestNotice')}</p></section>
        <section className="section"><SectionHeader title={t(locale, 'categories')} />
          <div className="chip-row" role="group" aria-label={t(locale, 'categories')}>{home.data?.categories.map((item) => <button className="chip" key={item.id} onClick={() => { setCategory(item.id); setView('search'); }}><span>{item.name}</span> <small>{item.productCount}</small></button>)}</div>
        </section>
        <section className="section"><SectionHeader title={t(locale, 'featured')} action={<Button variant="ghost" onClick={() => setView('search')}>{t(locale, 'all')} <Icon name="chevron" size={18}/></Button>} />
          <div className="demo-disclosure" role="note">{locale === 'ru' ? 'Демо-фото · синтетический каталог' : 'Demo suratlar · sintetik katalog'}</div>
          {productList(home.data?.products ?? [], home.isLoading, home.isError, () => void home.refetch())}
        </section>
      </> : null}

      {view === 'search' ? <>
        <section className="hero"><h1>{t(locale, 'search')}</h1></section>
        <form className="search-form" role="search" onSubmit={(event) => { event.preventDefault(); setQuery(queryInput.trim()); }}>
          <input aria-label={t(locale, 'search')} placeholder={t(locale, 'searchPlaceholder')} value={queryInput} onChange={(event) => setQueryInput(event.target.value)} />
          <Button type="submit" aria-label={t(locale, 'searchAction')}><Icon name="search" /></Button>
          <Button type="button" variant="secondary" aria-label={t(locale, 'filters')} onClick={() => setFiltersOpen(true)}><Icon name="filter" /></Button>
        </form>
        {category ? <div className="cluster section"><Badge tone="info">{home.data?.categories.find((item) => item.id === category)?.name ?? category}</Badge><Button variant="ghost" onClick={() => setCategory(null)}>{t(locale, 'clear')}</Button></div> : null}
        <section className="section">{productList(search.data?.items ?? [], search.isLoading, search.isError, () => void search.refetch())}</section>
      </> : null}

      {view === 'compare' ? <>
        <section className="hero"><div className="row row--between"><h1>{t(locale, 'compare')}</h1>{comparison.data?.items.length ? <Button variant="ghost" pending={clearCompare.isPending} onClick={() => clearCompare.mutate()}>{t(locale, 'clear')}</Button> : null}</div></section>
        {comparison.isLoading ? <SkeletonList count={3} /> : comparison.data?.items.length ? <div className="stack">{comparison.data.items.map((product) => <article className="card" key={product.id}><div className="card__body stack"><div className="row"><AsyncImage className="compare-thumb" handle={product.mediaHandles[0]} previewSrc={demoProductImage(product)} alt={product.name}/><div><h2>{product.name}</h2><strong>{formatPrice(product.priceMinor, locale)}</strong></div></div><Badge tone={availabilityTone(product.availability)}>{labelForStatus(locale, product.availability)}</Badge><dl className="spec-list">{product.specifications.map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><Button variant="secondary" pending={removeCompare.isPending} onClick={() => removeCompare.mutate(product.id)}>{t(locale, 'remove')}</Button></div></article>)}</div> : <StateView icon="compare" title={t(locale, 'compareEmpty')} action={<Button onClick={() => setView('search')}>{t(locale, 'search')}</Button>} />}
      </> : null}

      {view === 'orders' ? <>
        <section className="hero"><h1>{t(locale, 'orders')}</h1></section>
        {orders.isLoading ? <SkeletonList count={3}/> : orders.isError ? <ErrorView locale={locale} retry={() => void orders.refetch()} /> : orders.data?.items.length ? <ol className="list">{orders.data.items.map((order) => <li className="list-item" key={order.orderId}><div className="row row--between"><strong>№ {order.orderNumber}</strong><Badge tone={order.status === 'done' ? 'positive' : order.status === 'cancelled' ? 'negative' : 'info'}>{labelForStatus(locale, order.status)}</Badge></div><span>{order.productName} · {order.quantity} ×</span><div className="row row--between"><strong>{formatPrice(order.totalMinor, locale)}</strong><small className="muted">{formatDate(order.placedAt, locale)}</small></div></li>)}</ol> : <StateView icon="orders" title={t(locale, 'ordersEmpty')} />}
      </> : null}
    </main>

    <nav className="bottom-nav" aria-label="Market">
      {([
        ['home', 'home', 'home'], ['search', 'search', 'search'], ['compare', 'compare', 'compare'], ['orders', 'orders', 'orders'],
      ] as const).map(([destination, icon, label]) => <button key={destination} onClick={() => setView(destination)} aria-current={view === destination ? 'page' : undefined}><Icon name={icon}/><span>{t(locale, label)}</span></button>)}
    </nav>

    <ProductDetail product={selected} locale={locale} onClose={() => setSelected(null)} onCheckout={openCheckout} onQuestion={(product) => { setSelected(null); setQuestionProduct(product); }} onCompare={(product) => addCompare.mutate(product.id)} />
    <CheckoutFlow locale={locale} product={checkoutProduct} initial={checkout} onClose={() => { setCheckout(null); setCheckoutProduct(null); }} />
    <AskSeller locale={locale} product={questionProduct} onClose={() => setQuestionProduct(null)} />
    <Modal open={filtersOpen} title={t(locale, 'filters')} onClose={() => setFiltersOpen(false)} sheet>
      <div className="stack">
        <Field label={t(locale, 'available')}>
          <select value={availability} onChange={(event) => setAvailability(event.target.value)}>
            <option value="">{t(locale, 'all')}</option>
            <option value="available">{t(locale, 'available')}</option>
            <option value="preorder">{t(locale, 'preorder')}</option>
            <option value="unavailable">{t(locale, 'unavailable')}</option>
          </select>
        </Field>
        <Button wide onClick={() => setFiltersOpen(false)}>{t(locale, 'apply')}</Button>
        <Button wide variant="secondary" onClick={() => { setAvailability(''); setCategory(null); }}>{t(locale, 'reset')}</Button>
      </div>
    </Modal>

  </>;
}
