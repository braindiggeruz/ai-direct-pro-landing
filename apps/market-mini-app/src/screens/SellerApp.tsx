import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { MarketApiError, marketApi } from '../lib/api';
import { formatDate, formatPrice, labelForStatus, t } from '../lib/i18n';
import type { CopyKey } from '../lib/i18n';
import { haptic } from '../platform/telegram';
import type {
  Category,
  Handoff,
  Inventory,
  Locale,
  OrderPage,
  ProductIssue,
  SellerOrder,
  SellerOverview,
  SellerProduct,
} from '../types';
import {
  Badge,
  Button,
  ErrorView,
  Field,
  Icon,
  Modal,
  SectionHeader,
  SkeletonList,
  StateView,
} from '../components/ui';

type SellerView = 'today' | 'orders' | 'products' | 'questions' | 'inventory';
type OrderFilter = 'all' | SellerOrder['status'];
type ProductFilter = 'published' | 'draft' | 'archived';

const ORDER_PAGE = 20;
const PRODUCT_PAGE = 50;

interface SellerAppProps {
  locale: Locale;
  commands: boolean;
  onBuyer: () => void;
}

function orderTone(status: SellerOrder['status']) {
  return status === 'done'
    ? 'positive'
    : status === 'cancelled'
      ? 'negative'
      : status === 'placed' ? 'warning' : 'info';
}

/**
 * Age in the largest unit that still reads as a duration.
 *
 * The seller triages by how long something has been waiting, so "3 ч" has to
 * survive the glance that "180 мин" loses.
 */
function formatAge(minutes: number, locale: Locale): string {
  if (minutes < 60) return `${minutes} ${t(locale, 'ageMinutes')}`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} ${t(locale, 'ageHours')}`;
  return `${Math.floor(minutes / (60 * 24))} ${t(locale, 'ageDays')}`;
}

const ISSUE_COPY: Record<ProductIssue, CopyKey> = {
  no_media: 'issueNoMedia',
  no_description: 'issueNoDescription',
  no_specifications: 'issueNoSpecifications',
  no_search_terms: 'issueNoSearchTerms',
};

function isConflict(error: unknown): boolean {
  return error instanceof MarketApiError && error.status === 409;
}

/**
 * Optimistic-locking recovery.
 *
 * A 409 means someone else moved the row while this screen held an older
 * version. Re-reading is the fix, so the banner does the re-read itself and
 * says what happened — the seller never has to guess that "конфликт версий"
 * means "нажмите обновить".
 */
function ConflictNotice({
  locale, onReload, pending,
}: { locale: Locale; onReload: () => void; pending?: boolean }) {
  return <div className="conflict-notice" role="alert">
    <Icon name="refresh" size={19} />
    <div>
      <strong>{t(locale, 'conflictTitle')}</strong>
      <p>{t(locale, 'conflictBody')}</p>
    </div>
    <Button variant="secondary" pending={pending} onClick={onReload}>
      {t(locale, 'conflictReload')}
    </Button>
  </div>;
}

function Segmented<T extends string>({
  value, options, onChange, label,
}: {
  value: T;
  options: readonly { id: T; label: string; count?: number }[];
  onChange: (next: T) => void;
  label: string;
}) {
  return <div className="segmented" role="tablist" aria-label={label}>
    {options.map((option) => <button
      key={option.id}
      role="tab"
      type="button"
      aria-selected={value === option.id}
      className={value === option.id ? 'segmented__item is-active' : 'segmented__item'}
      onClick={() => onChange(option.id)}
    >
      {option.label}
      {option.count === undefined ? null : <span className="segmented__count">{option.count}</span>}
    </button>)}
  </div>;
}

function AttentionCard({
  tone, title, count, truncated, locale, onOpen, children,
}: {
  tone: 'critical' | 'warning' | 'muted';
  title: string;
  count: number;
  truncated: boolean;
  locale: Locale;
  onOpen: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return <section className={`attention attention--${tone}`}>
    <header className="attention__header">
      <h2>{title}</h2>
      <span className="attention__count">{count}{truncated ? '+' : ''}</span>
    </header>
    {children}
    <button className="attention__open" type="button" onClick={onOpen}>
      {truncated ? t(locale, 'truncatedNote') : t(locale, 'openSection')}
      <Icon name="chevron" size={18} />
    </button>
  </section>;
}

function TodayScreen({
  locale, commands, onGo, onOrder, onQuestion, onProduct,
}: {
  locale: Locale;
  commands: boolean;
  onGo: (view: SellerView) => void;
  onOrder: (orderId: string) => void;
  onQuestion: (id: string) => void;
  onProduct: (productId: string) => void;
}) {
  const overview = useQuery<SellerOverview>({
    queryKey: ['seller-overview'],
    queryFn: ({ signal }) => marketApi.get('/seller/overview', signal),
    staleTime: 15_000,
  });
  if (overview.isLoading) return <SkeletonList count={3} />;
  if (overview.isError || !overview.data) {
    return <ErrorView locale={locale} retry={() => void overview.refetch()} />;
  }
  const { attention, stats, store } = overview.data;
  const quiet = attention.newOrders.count === 0
    && attention.agingOrders.count === 0
    && attention.openQuestions.count === 0
    && attention.outOfStock.count === 0
    && attention.drafts.count === 0
    && attention.weakProducts.count === 0;

  return <>
    <section className="hero hero--compact">
      <p className="eyebrow">Bormi · {t(locale, 'seller')}</p>
      <h1>{store.name}</h1>
    </section>
    {!commands ? <div className="notice"><Icon name="warning" size={19} /><span>{t(locale, 'commandsOff')}</span></div> : null}

    {quiet ? <StateView
      icon="check"
      title={t(locale, 'allClear')}
      body={t(locale, 'allClearBody')}
      action={commands ? <Button onClick={() => onGo('products')}><Icon name="plus" />{t(locale, 'addProduct')}</Button> : undefined}
    /> : null}

    <AttentionCard
      tone="critical" locale={locale}
      title={t(locale, 'attentionNewOrders')}
      count={attention.newOrders.count}
      truncated={attention.newOrders.truncated}
      onOpen={() => onGo('orders')}
    >
      <ul className="list list--tight">
        {attention.newOrders.items.map((order) => <li key={order.orderId}>
          <button className="list-item list-item--button" onClick={() => onOrder(order.orderId)}>
            <div className="row row--between">
              <strong>№ {order.orderNumber}</strong>
              <span className="age age--hot">{formatAge(order.ageMinutes, locale)}</span>
            </div>
            <span>{order.productName} · {order.quantity} ×</span>
            <strong>{formatPrice(order.totalMinor, locale)}</strong>
          </button>
        </li>)}
      </ul>
    </AttentionCard>

    <AttentionCard
      tone="warning" locale={locale}
      title={t(locale, 'attentionAging')}
      count={attention.agingOrders.count}
      truncated={attention.agingOrders.truncated}
      onOpen={() => onGo('orders')}
    >
      <ul className="list list--tight">
        {attention.agingOrders.items.map((order) => <li key={order.orderId}>
          <button className="list-item list-item--button" onClick={() => onOrder(order.orderId)}>
            <div className="row row--between">
              <strong>№ {order.orderNumber}</strong>
              <span className="age">{formatAge(order.ageMinutes, locale)}</span>
            </div>
            <span>{order.productName}</span>
          </button>
        </li>)}
      </ul>
    </AttentionCard>

    <AttentionCard
      tone="warning" locale={locale}
      title={t(locale, 'attentionQuestions')}
      count={attention.openQuestions.count}
      truncated={attention.openQuestions.truncated}
      onOpen={() => onGo('questions')}
    >
      <ul className="list list--tight">
        {attention.openQuestions.items.map((item) => <li key={item.id}>
          <button className="list-item list-item--button" onClick={() => onQuestion(item.id)}>
            <div className="row row--between">
              <strong>{item.reason}</strong>
              <span className="age">{formatAge(item.ageMinutes, locale)}</span>
            </div>
          </button>
        </li>)}
      </ul>
    </AttentionCard>

    <AttentionCard
      tone="warning" locale={locale}
      title={t(locale, 'attentionOutOfStock')}
      count={attention.outOfStock.count}
      truncated={attention.outOfStock.truncated}
      onOpen={() => onGo('inventory')}
    >
      <ul className="list list--tight">
        {attention.outOfStock.items.map((item) => <li className="list-item" key={item.productId}>
          <div className="row row--between">
            <span>{item.productName}</span>
            <Badge tone="negative">{t(locale, 'noStock')}</Badge>
          </div>
        </li>)}
      </ul>
    </AttentionCard>

    <AttentionCard
      tone="muted" locale={locale}
      title={t(locale, 'attentionDrafts')}
      count={attention.drafts.count}
      truncated={attention.drafts.truncated}
      onOpen={() => onGo('products')}
    >
      <ul className="list list--tight">
        {attention.drafts.items.map((item) => <li key={item.id}>
          <button className="list-item list-item--button" onClick={() => onProduct(item.id)}>
            <div className="row row--between">
              <span>{item.name}</span>
              <span className="muted">{formatPrice(item.priceMinor, locale)}</span>
            </div>
          </button>
        </li>)}
      </ul>
    </AttentionCard>

    <AttentionCard
      tone="muted" locale={locale}
      title={t(locale, 'attentionWeak')}
      count={attention.weakProducts.count}
      truncated={attention.weakProducts.truncated}
      onOpen={() => onGo('products')}
    >
      <p className="attention__body">{t(locale, 'attentionWeakBody')}</p>
      <ul className="list list--tight">
        {attention.weakProducts.items.map((item) => <li key={item.id}>
          <button className="list-item list-item--button" onClick={() => onProduct(item.id)}>
            <span>{item.name}</span>
            <span className="muted">
              {item.issues.map((issue) => t(locale, ISSUE_COPY[issue])).join(' · ')}
            </span>
          </button>
        </li>)}
      </ul>
    </AttentionCard>

    <section className="section">
      <SectionHeader title={t(locale, 'today')} />
      <div className="metric-grid">
        <div className="metric"><strong>{stats.exact.ordersPlaced}</strong><span>{t(locale, 'placedCount')}</span></div>
        <div className="metric"><strong>{stats.exact.ordersConfirmed}</strong><span>{t(locale, 'confirmed')}</span></div>
        <div className="metric"><strong>{stats.exact.productsPublished}</strong><span>{t(locale, 'published')}</span></div>
      </div>
    </section>
  </>;
}

function SellerOrderModal({
  orderId, locale, commands, onClose,
}: {
  orderId: string | null;
  locale: Locale;
  commands: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const detail = useQuery<SellerOrder>({
    queryKey: ['seller-order', orderId],
    queryFn: ({ signal }) => marketApi.get(`/seller/orders/${encodeURIComponent(orderId!)}`, signal),
    enabled: Boolean(orderId),
  });
  const command = useMutation({
    mutationFn: (action: 'confirm' | 'cancel' | 'done') => marketApi.post(
      `/seller/orders/${encodeURIComponent(orderId!)}/${action}`,
      { expectedVersion: detail.data?.version },
    ),
    onSuccess: () => {
      haptic('success');
      void client.invalidateQueries({ queryKey: ['seller-order', orderId] });
      void client.invalidateQueries({ queryKey: ['seller-orders'] });
      void client.invalidateQueries({ queryKey: ['seller-overview'] });
      void client.invalidateQueries({ queryKey: ['seller-inventory'] });
    },
    onError: (error) => {
      haptic('error');
      if (isConflict(error)) void detail.refetch();
    },
  });
  const order = detail.data;
  return <Modal
    open={Boolean(orderId)}
    title={order ? `№ ${order.orderNumber}` : t(locale, 'sellerOrders')}
    onClose={onClose}
    closeLabel={t(locale, 'close')}
    sheet
  >
    {detail.isLoading ? <SkeletonList count={1} /> : detail.isError || !order
      ? <ErrorView locale={locale} retry={() => void detail.refetch()} />
      : <div className="stack">
        <div className="row row--between">
          <h3>{order.productName}</h3>
          <Badge tone={orderTone(order.status)}>{labelForStatus(locale, order.status)}</Badge>
        </div>
        <dl className="spec-list">
          <div><dt>{t(locale, 'quantity')}</dt><dd>{order.quantity}</dd></div>
          <div><dt>{t(locale, 'total')}</dt><dd>{formatPrice(order.totalMinor, locale)}</dd></div>
          <div><dt>{t(locale, 'contact')}</dt><dd>{order.customerName}<br /><a href={`tel:${order.customerPhone}`}>{order.customerPhone}</a><br />{order.customerAddress}</dd></div>
          {order.customerComment ? <div><dt>{t(locale, 'comment')}</dt><dd>{order.customerComment}</dd></div> : null}
          {order.inventoryOnHand !== undefined && order.inventoryOnHand !== null
            ? <div>
              <dt>{t(locale, 'stock')}</dt>
              <dd>
                {order.inventoryOnHand}
                {order.status === 'placed'
                  ? <span className="muted"> → {Math.max(0, order.inventoryOnHand - order.quantity)}</span>
                  : null}
              </dd>
            </div>
            : null}
        </dl>
        {!commands ? <div className="notice"><Icon name="warning" size={19} /><span>{t(locale, 'commandsOff')}</span></div> : null}
        {command.isError && isConflict(command.error)
          ? <ConflictNotice
            locale={locale}
            pending={detail.isFetching}
            onReload={() => { command.reset(); void detail.refetch(); }}
          />
          : null}
        {commands && order.status === 'placed'
          ? <Button wide pending={command.isPending} onClick={() => command.mutate('confirm')}>{t(locale, 'confirmOrder')}</Button>
          : null}
        {commands && order.status === 'confirmed'
          ? <Button wide pending={command.isPending} onClick={() => command.mutate('done')}>{t(locale, 'doneOrder')}</Button>
          : null}
        {commands && (order.status === 'placed' || order.status === 'confirmed')
          ? <Button wide variant="danger" pending={command.isPending} onClick={() => command.mutate('cancel')}>{t(locale, 'cancelOrder')}</Button>
          : null}
        {command.isError && !isConflict(command.error)
          ? <p className="field__error" role="alert">{t(locale, 'errorBody')}</p>
          : null}
      </div>}
  </Modal>;
}

function OrdersScreen({
  locale, filter, onFilter, onOrder,
}: {
  locale: Locale;
  filter: OrderFilter;
  onFilter: (next: OrderFilter) => void;
  onOrder: (orderId: string) => void;
}) {
  const orders = useInfiniteQuery<OrderPage>({
    queryKey: ['seller-orders', filter],
    queryFn: ({ pageParam, signal }) => marketApi.get(
      `/seller/orders?limit=${ORDER_PAGE}`
      + (filter === 'all' ? '' : `&status=${filter}`)
      + (pageParam ? `&cursor=${encodeURIComponent(String(pageParam))}` : ''),
      signal,
    ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = orders.data?.pages.flatMap((page) => page.items) ?? [];
  return <>
    <section className="hero hero--compact"><h1>{t(locale, 'sellerOrders')}</h1></section>
    <Segmented
      label={t(locale, 'sellerOrders')}
      value={filter}
      onChange={onFilter}
      options={[
        { id: 'all', label: t(locale, 'statusAll') },
        { id: 'placed', label: t(locale, 'placed') },
        { id: 'confirmed', label: t(locale, 'confirmed') },
        { id: 'done', label: t(locale, 'done') },
        { id: 'cancelled', label: t(locale, 'cancelled') },
      ]}
    />
    {orders.isLoading ? <SkeletonList count={3} />
      : orders.isError ? <ErrorView locale={locale} retry={() => void orders.refetch()} />
        : items.length === 0 ? <StateView icon="orders" title={t(locale, 'noWork')} />
          : <>
            <ol className="list">
              {items.map((order) => <li key={order.orderId}>
                <button className="list-item list-item--button" onClick={() => onOrder(order.orderId)}>
                  <div className="row row--between">
                    <strong>№ {order.orderNumber}</strong>
                    <Badge tone={orderTone(order.status)}>{labelForStatus(locale, order.status)}</Badge>
                  </div>
                  <span>{order.productName} · {order.quantity} ×</span>
                  <div className="row row--between">
                    <strong>{formatPrice(order.totalMinor, locale)}</strong>
                    <small className="muted">{formatDate(order.placedAt, locale)}</small>
                  </div>
                </button>
              </li>)}
            </ol>
            {orders.hasNextPage ? <Button
              variant="secondary"
              wide
              pending={orders.isFetchingNextPage}
              onClick={() => void orders.fetchNextPage()}
            >{t(locale, 'loadMore')}</Button> : null}
          </>}
  </>;
}

function HandoffModal({
  id, locale, commands, onClose,
}: { id: string | null; locale: Locale; commands: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [reply, setReply] = useState('');
  const detail = useQuery<Handoff>({
    queryKey: ['seller-handoff', id],
    queryFn: ({ signal }) => marketApi.get(`/seller/handoffs/${encodeURIComponent(id!)}`, signal),
    enabled: Boolean(id),
  });
  const send = useMutation({
    mutationFn: () => marketApi.post(
      `/seller/handoffs/${encodeURIComponent(id!)}/reply`,
      { reply: reply.trim(), expectedVersion: detail.data?.version },
    ),
    onSuccess: () => {
      haptic('success');
      setReply('');
      void client.invalidateQueries({ queryKey: ['seller-handoffs'] });
      void client.invalidateQueries({ queryKey: ['seller-overview'] });
      void detail.refetch();
    },
    onError: (error) => {
      haptic('error');
      if (isConflict(error)) void detail.refetch();
    },
  });
  return <Modal open={Boolean(id)} title={t(locale, 'questions')} onClose={onClose} closeLabel={t(locale, 'close')} sheet>
    {detail.isLoading ? <SkeletonList count={1} /> : detail.isError || !detail.data
      ? <ErrorView locale={locale} retry={() => void detail.refetch()} />
      : <div className="stack">
        <Badge tone={detail.data.status === 'open' ? 'warning' : 'positive'}>{detail.data.status}</Badge>
        <blockquote className="question-quote">{detail.data.questionText ?? '—'}</blockquote>
        {detail.data.replyText ? <div className="notice"><Icon name="check" /><span>{detail.data.replyText}</span></div> : null}
        {!commands ? <div className="notice"><Icon name="warning" size={19} /><span>{t(locale, 'commandsOff')}</span></div> : null}
        {send.isError && isConflict(send.error)
          ? <ConflictNotice locale={locale} pending={detail.isFetching} onReload={() => { send.reset(); void detail.refetch(); }} />
          : null}
        {commands && detail.data.status === 'open' ? <form
          className="stack"
          onSubmit={(event) => { event.preventDefault(); if (reply.trim()) send.mutate(); }}
        >
          <Field label={t(locale, 'reply')}>
            <textarea
              required maxLength={500} placeholder={t(locale, 'replyPlaceholder')}
              value={reply} onChange={(event) => setReply(event.target.value)}
            />
          </Field>
          <Button wide type="submit" pending={send.isPending}>{t(locale, 'send')}</Button>
        </form> : null}
      </div>}
  </Modal>;
}

/**
 * Stable machine key for one specification row.
 *
 * The domain stores a `[a-z][a-z0-9_]*` key next to the human labels, and it is
 * what search matches on. Deriving it from the Russian label keeps two products
 * that both say «Цвет» on the same key without asking the seller to invent one.
 */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function specificationKey(label: string, index: number, taken: Set<string>): string {
  const base = [...label.toLowerCase()]
    .map((character) => TRANSLIT[character] ?? character)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
    .replace(/^[^a-z]+/, '');
  let candidate = base || `spec_${index + 1}`;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base || 'spec'}_${suffix}`.slice(0, 32);
    suffix += 1;
  }
  taken.add(candidate);
  return candidate;
}

interface SpecRow { key: string | null; labelRu: string; labelUz: string; value: string }

function SpecificationEditor({
  rows, locale, onChange,
}: { rows: SpecRow[]; locale: Locale; onChange: (next: SpecRow[]) => void }) {
  return <fieldset className="editor-block">
    <legend>{t(locale, 'productSpecifications')}</legend>
    <p className="field__hint">{t(locale, 'specificationsHint')}</p>
    {rows.map((row, index) => <div className="spec-row" key={index}>
      <Field label={t(locale, 'specLabelRu')}>
        <input
          maxLength={40} value={row.labelRu}
          onChange={(event) => onChange(rows.map((item, position) =>
            position === index ? { ...item, labelRu: event.target.value } : item))}
        />
      </Field>
      <Field label={t(locale, 'specLabelUz')}>
        <input
          maxLength={40} value={row.labelUz}
          onChange={(event) => onChange(rows.map((item, position) =>
            position === index ? { ...item, labelUz: event.target.value } : item))}
        />
      </Field>
      <Field label={t(locale, 'specValue')}>
        <input
          maxLength={100} value={row.value}
          onChange={(event) => onChange(rows.map((item, position) =>
            position === index ? { ...item, value: event.target.value } : item))}
        />
      </Field>
      <button
        type="button" className="icon-button"
        aria-label={`${t(locale, 'removeRow')}: ${row.labelRu || index + 1}`}
        onClick={() => onChange(rows.filter((_, position) => position !== index))}
      ><Icon name="close" size={18} /></button>
    </div>)}
    {rows.length < 12 ? <Button
      variant="secondary" type="button"
      onClick={() => onChange([...rows, { key: null, labelRu: '', labelUz: '', value: '' }])}
    ><Icon name="plus" size={18} />{t(locale, 'addRow')}</Button> : null}
  </fieldset>;
}

function SearchTermsEditor({
  terms, locale, onChange,
}: { terms: string[]; locale: Locale; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim().replace(/\s+/g, ' ');
    if (!value || terms.length >= 12) return;
    if (!terms.some((term) => term.toLowerCase() === value.toLowerCase())) {
      onChange([...terms, value.slice(0, 60)]);
    }
    setDraft('');
  };
  return <fieldset className="editor-block">
    <legend>{t(locale, 'productSearchTerms')}</legend>
    <p className="field__hint">{t(locale, 'searchTermsHint')}</p>
    {terms.length ? <ul className="chip-row chip-row--wrap">
      {terms.map((term) => <li key={term}>
        <button
          type="button" className="chip"
          aria-label={`${t(locale, 'removeRow')}: ${term}`}
          onClick={() => onChange(terms.filter((item) => item !== term))}
        >{term}<Icon name="close" size={15} /></button>
      </li>)}
    </ul> : null}
    {terms.length < 12 ? <div className="row row--tight">
      <Field label={t(locale, 'addRow')}>
        <input
          maxLength={60} value={draft} placeholder={t(locale, 'termPlaceholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
        />
      </Field>
      <Button variant="secondary" type="button" onClick={add}><Icon name="plus" size={18} /></Button>
    </div> : null}
  </fieldset>;
}

function ProductEditor({
  open, locale, categories, product, onClose,
}: {
  open: boolean;
  locale: Locale;
  categories: Category[];
  product: SellerProduct | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.priceMinor) : '');
  const [availability, setAvailability] = useState<SellerProduct['availability']>(
    product?.availability ?? 'available',
  );
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [terms, setTerms] = useState<string[]>(product?.owner?.searchTerms ?? []);
  const [specifications, setSpecifications] = useState<SpecRow[]>(
    (product?.owner?.specifications ?? []).map((item) => ({ ...item })),
  );
  const [version, setVersion] = useState(product?.version ?? 0);

  const priceNumber = Number(price);
  const priceValid = Number.isInteger(priceNumber) && priceNumber >= 0;

  const payload = () => {
    const taken = new Set<string>();
    const rows = specifications
      .filter((row) => row.labelRu.trim() && row.labelUz.trim() && row.value.trim())
      .map((row, index) => ({
        key: row.key ?? specificationKey(row.labelRu, index, taken),
        labelRu: row.labelRu.trim(),
        labelUz: row.labelUz.trim(),
        value: row.value.trim(),
      }));
    for (const row of rows) taken.add(row.key);
    return {
      categoryId: categoryId || null,
      name: name.trim(),
      description: description.trim() || null,
      priceMinor: priceNumber,
      currency: 'UZS' as const,
      availability,
      searchTerms: terms,
      specifications: rows,
    };
  };

  const reload = useQuery<{ product: SellerProduct }>({
    queryKey: ['seller-product', product?.id],
    queryFn: ({ signal }) => marketApi.get(`/seller/products/${encodeURIComponent(product!.id)}`, signal),
    enabled: false,
  });

  const save = useMutation({
    mutationFn: () => (product
      ? marketApi.patch<SellerProduct>(
        `/seller/products/${encodeURIComponent(product.id)}`,
        { expectedVersion: version, patch: payload() },
      )
      : marketApi.post<SellerProduct>('/seller/products', payload())),
    onSuccess: () => {
      haptic('success');
      void client.invalidateQueries({ queryKey: ['seller-products'] });
      void client.invalidateQueries({ queryKey: ['seller-overview'] });
      onClose();
    },
    onError: () => haptic('error'),
  });

  /** Re-read after a conflict, keeping everything the seller has typed. */
  const resync = async () => {
    const fresh = await reload.refetch();
    if (fresh.data?.product) setVersion(fresh.data.product.version);
    save.reset();
  };

  return <Modal
    open={open}
    title={product ? t(locale, 'edit') : t(locale, 'addProduct')}
    onClose={onClose}
    closeLabel={t(locale, 'close')}
    sheet
  >
    <form className="stack" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <Field label={t(locale, 'productName')}>
        <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label={t(locale, 'productDescription')}>
        <textarea maxLength={600} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <Field
        label={t(locale, 'productPrice')}
        hint={priceValid && price !== '' ? `${formatPrice(priceNumber, locale)} · ${t(locale, 'priceHint')}` : undefined}
      >
        <input
          required type="number" inputMode="numeric" min="0" max="1000000000000"
          value={price} onChange={(event) => setPrice(event.target.value)}
        />
      </Field>
      <Field label={t(locale, 'categories')}>
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">{t(locale, 'all')}</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </Field>
      <Field label={t(locale, 'available')}>
        <select
          value={availability}
          onChange={(event) => setAvailability(event.target.value as SellerProduct['availability'])}
        >
          <option value="available">{t(locale, 'available')}</option>
          <option value="preorder">{t(locale, 'preorder')}</option>
          <option value="unavailable">{t(locale, 'unavailable')}</option>
        </select>
      </Field>

      <SpecificationEditor rows={specifications} locale={locale} onChange={setSpecifications} />
      <SearchTermsEditor terms={terms} locale={locale} onChange={setTerms} />

      <div className="notice notice--muted"><Icon name="warning" size={19} /><span>{t(locale, 'photosLater')}</span></div>

      <section className="preview-card" aria-label={t(locale, 'preview')}>
        <span className="eyebrow">{t(locale, 'preview')}</span>
        <strong>{name.trim() || '—'}</strong>
        <span className="preview-card__price">
          {priceValid && price !== '' ? formatPrice(priceNumber, locale) : '—'}
        </span>
        {description.trim() ? <p>{description.trim()}</p> : null}
        {specifications.filter((row) => row.value.trim()).length ? <dl className="spec-list">
          {specifications.filter((row) => row.value.trim()).map((row, index) => <div key={index}>
            <dt>{locale === 'uz' ? row.labelUz || row.labelRu : row.labelRu}</dt>
            <dd>{row.value}</dd>
          </div>)}
        </dl> : null}
      </section>

      {save.isError && isConflict(save.error)
        ? <ConflictNotice locale={locale} pending={reload.isFetching} onReload={() => void resync()} />
        : null}
      <Button wide type="submit" pending={save.isPending} disabled={!priceValid}>
        {t(locale, 'save')}
      </Button>
      {save.isError && !isConflict(save.error)
        ? <p className="field__error" role="alert">{t(locale, 'errorBody')}</p>
        : null}
    </form>
  </Modal>;
}

function ProductsScreen({
  locale, commands, filter, onFilter, onEdit,
}: {
  locale: Locale;
  commands: boolean;
  filter: ProductFilter;
  onFilter: (next: ProductFilter) => void;
  onEdit: (product: SellerProduct | null) => void;
}) {
  const client = useQueryClient();
  const [term, setTerm] = useState('');
  const products = useQuery<{ items: SellerProduct[] }>({
    queryKey: ['seller-products', filter],
    queryFn: ({ signal }) => marketApi.get(
      `/seller/products?limit=${PRODUCT_PAGE}&status=${filter}`,
      signal,
    ),
  });
  const transition = useMutation({
    mutationFn: ({ product, action }: {
      product: SellerProduct;
      action: 'publish' | 'unpublish' | 'archive';
    }) => marketApi.post(
      `/seller/products/${encodeURIComponent(product.id)}/${action}`,
      { expectedVersion: product.version },
    ),
    onSuccess: () => {
      haptic('success');
      void client.invalidateQueries({ queryKey: ['seller-products'] });
      void client.invalidateQueries({ queryKey: ['seller-overview'] });
    },
    onError: (error) => {
      haptic('error');
      if (isConflict(error)) void products.refetch();
    },
  });
  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const items = products.data?.items ?? [];
    return needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
  }, [products.data, term]);

  return <>
    <section className="hero hero--compact">
      <div className="row row--between">
        <h1>{t(locale, 'products')}</h1>
        {commands ? <Button onClick={() => onEdit(null)}><Icon name="plus" />{t(locale, 'addProduct')}</Button> : null}
      </div>
    </section>
    <Segmented
      label={t(locale, 'products')}
      value={filter}
      onChange={onFilter}
      options={[
        { id: 'published', label: t(locale, 'publishedStatus') },
        { id: 'draft', label: t(locale, 'draft') },
        { id: 'archived', label: t(locale, 'archived') },
      ]}
    />
    <Field label={t(locale, 'searchProducts')}>
      <input type="search" value={term} onChange={(event) => setTerm(event.target.value)} />
    </Field>
    {!commands ? <div className="notice"><Icon name="warning" size={19} /><span>{t(locale, 'commandsOff')}</span></div> : null}
    {transition.isError && isConflict(transition.error)
      ? <ConflictNotice locale={locale} pending={products.isFetching} onReload={() => { transition.reset(); void products.refetch(); }} />
      : null}
    {products.isLoading ? <SkeletonList />
      : products.isError ? <ErrorView locale={locale} retry={() => void products.refetch()} />
        : visible.length === 0
          ? <StateView icon="products" title={term ? t(locale, 'nothingFound') : t(locale, 'noWork')} />
          : <ul className="list">
            {visible.map((product) => {
              const weak = !product.description
                || (product.owner?.specifications.length ?? 0) === 0
                || (product.owner?.searchTerms.length ?? 0) === 0;
              return <li className="list-item" key={product.id}>
                <div className="row row--between">
                  <div>
                    <strong>{product.name}</strong>
                    <div className="muted">{formatPrice(product.priceMinor, locale)}</div>
                  </div>
                  <Badge tone={product.status === 'published' ? 'positive' : product.status === 'archived' ? 'negative' : 'neutral'}>
                    {labelForStatus(locale, product.status)}
                  </Badge>
                </div>
                {weak && product.status === 'published'
                  ? <span className="weak-flag"><Icon name="warning" size={15} />{t(locale, 'weakBadge')}</span>
                  : null}
                {commands ? <div className="cluster">
                  <Button variant="secondary" onClick={() => onEdit(product)}>
                    <Icon name="edit" size={18} />{t(locale, 'edit')}
                  </Button>
                  {product.status === 'draft' ? <Button
                    pending={transition.isPending && transition.variables?.product.id === product.id}
                    onClick={() => transition.mutate({ product, action: 'publish' })}
                  >{t(locale, 'publish')}</Button>
                    : product.status === 'published' ? <Button
                      variant="secondary"
                      pending={transition.isPending && transition.variables?.product.id === product.id}
                      onClick={() => transition.mutate({ product, action: 'unpublish' })}
                    >{t(locale, 'unpublish')}</Button>
                      : null}
                </div> : null}
              </li>;
            })}
          </ul>}
  </>;
}

function InventoryRow({
  item, locale, commands, pending, onSave,
}: {
  item: Inventory;
  locale: Locale;
  commands: boolean;
  pending: boolean;
  onSave: (onHand: number) => void;
}) {
  const [value, setValue] = useState(String(item.onHand));
  const parsed = Number(value);
  const dirty = String(item.onHand) !== value;
  return <li className="list-item">
    <form
      className="row row--between inventory-form"
      onSubmit={(event: FormEvent) => { event.preventDefault(); onSave(parsed); }}
    >
      <label>
        <strong>{item.productName}</strong>
        <span className="field__label">{t(locale, 'stock')}</span>
      </label>
      <input
        aria-label={`${t(locale, 'stock')}: ${item.productName}`}
        type="number" inputMode="numeric" min="0" max="1000000"
        disabled={!commands} value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {commands ? <Button
        type="submit"
        pending={pending}
        disabled={!dirty || !Number.isInteger(parsed) || parsed < 0}
      >{t(locale, 'save')}</Button> : null}
    </form>
  </li>;
}

export function SellerApp({ locale, commands, onBuyer }: SellerAppProps) {
  const client = useQueryClient();
  const [view, setView] = useState<SellerView>('today');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [productFilter, setProductFilter] = useState<ProductFilter>('published');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [handoffId, setHandoffId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; product: SellerProduct | null }>({
    open: false, product: null,
  });

  const handoffs = useQuery<{ items: Handoff[] }>({
    queryKey: ['seller-handoffs'],
    queryFn: ({ signal }) => marketApi.get('/seller/handoffs?limit=50', signal),
    enabled: view === 'questions',
  });
  const categories = useQuery<{ items: Category[] }>({
    queryKey: ['seller-categories'],
    queryFn: ({ signal }) => marketApi.get('/seller/categories', signal),
    enabled: view === 'products' || editor.open,
  });
  const inventory = useQuery<{ items: Inventory[] }>({
    queryKey: ['seller-inventory'],
    queryFn: ({ signal }) => marketApi.get('/seller/inventory?limit=50', signal),
    enabled: view === 'inventory',
  });
  const stock = useMutation({
    mutationFn: ({ item, onHand }: { item: Inventory; onHand: number }) => marketApi.put(
      `/seller/inventory/${encodeURIComponent(item.productId)}`,
      { onHand, expectedVersion: item.version },
    ),
    onSuccess: () => {
      haptic('success');
      void client.invalidateQueries({ queryKey: ['seller-inventory'] });
      void client.invalidateQueries({ queryKey: ['seller-overview'] });
    },
    onError: (error) => {
      haptic('error');
      if (isConflict(error)) void inventory.refetch();
    },
  });

  const openProduct = async (productId: string) => {
    const detail = await client.fetchQuery<{ product: SellerProduct }>({
      queryKey: ['seller-product', productId],
      queryFn: ({ signal }) => marketApi.get(`/seller/products/${encodeURIComponent(productId)}`, signal),
    });
    setEditor({ open: true, product: detail.product });
  };

  return <>
    <main id="main-content" className="page">
      <button className="buyer-return" onClick={onBuyer}>
        <Icon name="back" size={17} />{t(locale, 'buyer')}
      </button>

      {view === 'today' ? <TodayScreen
        locale={locale}
        commands={commands}
        onGo={setView}
        onOrder={setOrderId}
        onQuestion={setHandoffId}
        onProduct={(productId) => void openProduct(productId)}
      /> : null}

      {view === 'orders' ? <OrdersScreen
        locale={locale}
        filter={orderFilter}
        onFilter={setOrderFilter}
        onOrder={setOrderId}
      /> : null}

      {view === 'products' ? <ProductsScreen
        locale={locale}
        commands={commands}
        filter={productFilter}
        onFilter={setProductFilter}
        onEdit={(product) => setEditor({ open: true, product })}
      /> : null}

      {view === 'questions' ? <>
        <section className="hero hero--compact"><h1>{t(locale, 'questions')}</h1></section>
        {handoffs.isLoading ? <SkeletonList count={3} />
          : handoffs.isError ? <ErrorView locale={locale} retry={() => void handoffs.refetch()} />
            : handoffs.data?.items.length
              ? <ul className="list">
                {handoffs.data.items.map((item) => <li key={item.id}>
                  <button className="list-item list-item--button" onClick={() => setHandoffId(item.id)}>
                    <div className="row row--between">
                      <strong>{item.reason}</strong>
                      <Badge tone={item.status === 'open' ? 'warning' : 'positive'}>{item.status}</Badge>
                    </div>
                    <small className="muted">{formatDate(item.createdAt, locale)}</small>
                  </button>
                </li>)}
              </ul>
              : <StateView icon="help" title={t(locale, 'noWork')} />}
      </> : null}

      {view === 'inventory' ? <>
        <section className="hero hero--compact"><h1>{t(locale, 'inventory')}</h1></section>
        {!commands ? <div className="notice"><Icon name="warning" size={19} /><span>{t(locale, 'commandsOff')}</span></div> : null}
        {stock.isError && isConflict(stock.error)
          ? <ConflictNotice locale={locale} pending={inventory.isFetching} onReload={() => { stock.reset(); void inventory.refetch(); }} />
          : null}
        {inventory.isLoading ? <SkeletonList count={3} />
          : inventory.isError ? <ErrorView locale={locale} retry={() => void inventory.refetch()} />
            : inventory.data?.items.length
              ? <ul className="list">
                {inventory.data.items.map((item) => <InventoryRow
                  key={item.productId}
                  item={item}
                  locale={locale}
                  commands={commands}
                  pending={stock.isPending && stock.variables?.item.productId === item.productId}
                  onSave={(onHand) => stock.mutate({ item, onHand })}
                />)}
              </ul>
              : <StateView icon="inventory" title={t(locale, 'noWork')} />}
      </> : null}
    </main>

    <nav className="bottom-nav bottom-nav--seller" aria-label={t(locale, 'seller')}>
      {([
        ['today', 'home', 'cabinetToday'],
        ['orders', 'orders', 'sellerOrders'],
        ['products', 'products', 'products'],
        ['questions', 'help', 'questions'],
        ['inventory', 'inventory', 'inventory'],
      ] as const).map(([destination, icon, label]) => <button
        key={destination}
        onClick={() => setView(destination)}
        aria-current={view === destination ? 'page' : undefined}
      >
        <Icon name={icon} /><span>{t(locale, label)}</span>
      </button>)}
    </nav>

    <SellerOrderModal orderId={orderId} locale={locale} commands={commands} onClose={() => setOrderId(null)} />
    <HandoffModal id={handoffId} locale={locale} commands={commands} onClose={() => setHandoffId(null)} />
    <ProductEditor
      key={`${editor.product?.id ?? 'new'}:${editor.product?.version ?? 0}:${editor.open}`}
      open={editor.open}
      product={editor.product}
      categories={categories.data?.items ?? []}
      locale={locale}
      onClose={() => setEditor({ open: false, product: null })}
    />
  </>;
}
