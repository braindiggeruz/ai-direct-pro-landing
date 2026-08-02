import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { marketApi } from '../lib/api';
import { formatDate, formatPrice, t } from '../lib/i18n';
import { haptic } from '../platform/telegram';
import type {
  Category,
  Handoff,
  Inventory,
  Locale,
  Product,
  SellerOrder,
  Stats,
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
  labelForStatus,
} from '../components/ui';

type SellerView = 'dashboard' | 'orders' | 'questions' | 'products' | 'inventory';

interface SellerAppProps {
  locale: Locale;
  commands: boolean;
  onBuyer: () => void;
}

function orderTone(status: SellerOrder['status']) {
  return status === 'done' ? 'positive' : status === 'cancelled' ? 'negative' : status === 'placed' ? 'warning' : 'info';
}

function SellerOrderModal({
  orderId,
  locale,
  commands,
  onClose,
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
      void client.invalidateQueries({ queryKey: ['seller-dashboard'] });
    },
    onError: () => haptic('error'),
  });
  const order = detail.data;
  return <Modal open={Boolean(orderId)} title={order ? `№ ${order.orderNumber}` : t(locale, 'sellerOrders')} onClose={onClose} sheet>
    {detail.isLoading ? <SkeletonList count={1}/> : detail.isError || !order ? <ErrorView locale={locale} retry={() => void detail.refetch()} /> : <div className="stack">
      <div className="row row--between"><h3>{order.productName}</h3><Badge tone={orderTone(order.status)}>{labelForStatus(locale, order.status)}</Badge></div>
      <dl className="spec-list">
        <div><dt>{t(locale, 'quantity')}</dt><dd>{order.quantity}</dd></div>
        <div><dt>{t(locale, 'total')}</dt><dd>{formatPrice(order.totalMinor, locale)}</dd></div>
        <div><dt>{t(locale, 'contact')}</dt><dd>{order.customerName}<br/><a href={`tel:${order.customerPhone}`}>{order.customerPhone}</a><br/>{order.customerAddress}</dd></div>
        {order.customerComment ? <div><dt>{t(locale, 'comment')}</dt><dd>{order.customerComment}</dd></div> : null}
        {order.inventoryOnHand !== undefined ? <div><dt>{t(locale, 'stock')}</dt><dd>{order.inventoryOnHand ?? '—'}</dd></div> : null}
      </dl>
      {!commands ? <div className="notice"><Icon name="warning" size={19}/><span>{t(locale, 'commandsOff')}</span></div> : null}
      {commands && order.status === 'placed' ? <Button wide pending={command.isPending} onClick={() => command.mutate('confirm')}>{t(locale, 'confirmOrder')}</Button> : null}
      {commands && order.status === 'confirmed' ? <Button wide pending={command.isPending} onClick={() => command.mutate('done')}>{t(locale, 'doneOrder')}</Button> : null}
      {commands && (order.status === 'placed' || order.status === 'confirmed') ? <Button wide variant="danger" pending={command.isPending} onClick={() => command.mutate('cancel')}>{t(locale, 'cancelOrder')}</Button> : null}
      {command.isError ? <p className="field__error" role="alert">{t(locale, 'versionConflict')}</p> : null}
    </div>}
  </Modal>;
}

function HandoffModal({ id, locale, commands, onClose }: { id: string | null; locale: Locale; commands: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [reply, setReply] = useState('');
  const detail = useQuery<Handoff>({ queryKey: ['seller-handoff', id], queryFn: ({ signal }) => marketApi.get(`/seller/handoffs/${encodeURIComponent(id!)}`, signal), enabled: Boolean(id) });
  const send = useMutation({
    mutationFn: () => marketApi.post(`/seller/handoffs/${encodeURIComponent(id!)}/reply`, { reply: reply.trim(), expectedVersion: detail.data?.version }),
    onSuccess: () => { haptic('success'); setReply(''); void client.invalidateQueries({ queryKey: ['seller-handoffs'] }); void detail.refetch(); },
  });
  return <Modal open={Boolean(id)} title={t(locale, 'questions')} onClose={onClose} sheet>
    {detail.isLoading ? <SkeletonList count={1}/> : detail.isError || !detail.data ? <ErrorView locale={locale} retry={() => void detail.refetch()} /> : <div className="stack">
      <Badge tone={detail.data.status === 'open' ? 'warning' : 'positive'}>{detail.data.status}</Badge>
      <blockquote className="question-quote">{detail.data.questionText ?? '—'}</blockquote>
      {detail.data.replyText ? <div className="notice"><Icon name="check"/><span>{detail.data.replyText}</span></div> : null}
      {!commands ? <div className="notice"><Icon name="warning" size={19}/><span>{t(locale, 'commandsOff')}</span></div> : null}
      {commands && detail.data.status === 'open' ? <form className="stack" onSubmit={(event) => { event.preventDefault(); if (reply.trim()) send.mutate(); }}>
        <Field label={t(locale, 'reply')}><textarea required maxLength={500} placeholder={t(locale, 'replyPlaceholder')} value={reply} onChange={(event) => setReply(event.target.value)}/></Field>
        <Button wide type="submit" pending={send.isPending}>{t(locale, 'send')}</Button>
      </form> : null}
    </div>}
  </Modal>;
}

function ProductForm({
  open,
  locale,
  categories,
  product,
  onClose,
}: {
  open: boolean;
  locale: Locale;
  categories: Category[];
  product: Product | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.priceMinor) : '');
  const [availability, setAvailability] = useState<Product['availability']>(product?.availability ?? 'available');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        categoryId: categoryId || null,
        name: name.trim(),
        description: description.trim() || null,
        priceMinor: Number(price),
        currency: 'UZS',
        availability,
      };
      return product
        ? marketApi.patch(`/seller/products/${encodeURIComponent(product.id)}`, { expectedVersion: product.version, patch: input })
        : marketApi.post('/seller/products', input);
    },
    onSuccess: () => { haptic('success'); void client.invalidateQueries({ queryKey: ['seller-products'] }); onClose(); },
  });
  return <Modal open={open} title={product ? t(locale, 'edit') : t(locale, 'addProduct')} onClose={onClose} sheet>
    <form className="stack" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <Field label={locale === 'uz' ? 'Nomi' : 'Название'}><input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)}/></Field>
      <Field label={locale === 'uz' ? 'Tavsif' : 'Описание'}><textarea maxLength={600} value={description} onChange={(event) => setDescription(event.target.value)}/></Field>
      <Field label={locale === 'uz' ? 'Narx, so‘m' : 'Цена, сум'}><input required type="number" min="0" max="1000000000000" value={price} onChange={(event) => setPrice(event.target.value)}/></Field>
      <Field label={t(locale, 'categories')}><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">{t(locale, 'all')}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
      <Field label={t(locale, 'available')}><select value={availability} onChange={(event) => setAvailability(event.target.value as Product['availability'])}><option value="available">{t(locale, 'available')}</option><option value="preorder">{t(locale, 'preorder')}</option><option value="unavailable">{t(locale, 'unavailable')}</option></select></Field>
      <Button wide type="submit" pending={mutation.isPending}>{t(locale, 'save')}</Button>
      {mutation.isError ? <p className="field__error" role="alert">{t(locale, 'errorBody')}</p> : null}
    </form>
  </Modal>;
}

export function SellerApp({ locale, commands, onBuyer }: SellerAppProps) {
  const client = useQueryClient();
  const [view, setView] = useState<SellerView>('dashboard');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [handoffId, setHandoffId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null });

  const dashboard = useQuery<{ store: { name: string }; stats: Stats; orders: SellerOrder[]; handoffs: Handoff[] }>({ queryKey: ['seller-dashboard'], queryFn: ({ signal }) => marketApi.get('/seller/dashboard', signal), enabled: view === 'dashboard', staleTime: 15_000 });
  const orders = useQuery<{ items: SellerOrder[] }>({ queryKey: ['seller-orders'], queryFn: ({ signal }) => marketApi.get('/seller/orders?limit=5', signal), enabled: view === 'orders' });
  const handoffs = useQuery<{ items: Handoff[] }>({ queryKey: ['seller-handoffs'], queryFn: ({ signal }) => marketApi.get('/seller/handoffs?limit=20', signal), enabled: view === 'questions' });
  const products = useQuery<{ items: Product[] }>({ queryKey: ['seller-products'], queryFn: ({ signal }) => marketApi.get('/seller/products?limit=20', signal), enabled: view === 'products' });
  const categories = useQuery<{ items: Category[] }>({ queryKey: ['seller-categories'], queryFn: ({ signal }) => marketApi.get('/seller/categories', signal), enabled: view === 'products' || productForm.open });
  const inventory = useQuery<{ items: Inventory[] }>({ queryKey: ['seller-inventory'], queryFn: ({ signal }) => marketApi.get('/seller/inventory?limit=20', signal), enabled: view === 'inventory' });
  const productTransition = useMutation({
    mutationFn: ({ product, action }: { product: Product; action: 'publish' | 'unpublish' | 'archive' }) => marketApi.post(`/seller/products/${encodeURIComponent(product.id)}/${action}`, { expectedVersion: product.version }),
    onSuccess: () => { haptic('success'); void client.invalidateQueries({ queryKey: ['seller-products'] }); },
  });
  const stock = useMutation({
    mutationFn: ({ item, onHand }: { item: Inventory; onHand: number }) => marketApi.put(`/seller/inventory/${encodeURIComponent(item.productId)}`, { onHand, expectedVersion: item.version }),
    onSuccess: () => { haptic('success'); void client.invalidateQueries({ queryKey: ['seller-inventory'] }); },
  });

  const renderOrderList = (items: SellerOrder[]) => items.length ? <ol className="list">{items.map((order) => <li key={order.orderId}><button className="list-item list-item--button" onClick={() => setOrderId(order.orderId)}><div className="row row--between"><strong>№ {order.orderNumber}</strong><Badge tone={orderTone(order.status)}>{labelForStatus(locale, order.status)}</Badge></div><span>{order.productName} · {order.quantity} ×</span><div className="row row--between"><strong>{formatPrice(order.totalMinor, locale)}</strong><small className="muted">{formatDate(order.placedAt, locale)}</small></div></button></li>)}</ol> : <StateView icon="orders" title={t(locale, 'noWork')} />;

  return <>
    <main id="main-content" className="page">
      {view === 'dashboard' ? <>
        <section className="hero"><p className="eyebrow">{t(locale, 'seller')}</p><h1>{dashboard.data?.store.name ?? t(locale, 'sellerDashboard')}</h1><p>{t(locale, 'today')}</p></section>
        {!commands ? <div className="notice"><Icon name="warning" size={19}/><span>{t(locale, 'commandsOff')}</span></div> : null}
        {dashboard.isLoading ? <SkeletonList count={3}/> : dashboard.isError ? <ErrorView locale={locale} retry={() => void dashboard.refetch()} /> : dashboard.data ? <>
          <section className="metric-grid" aria-label={t(locale, 'today')}>
            <div className="metric"><strong>{dashboard.data.stats.exact.ordersPlaced}</strong><span>{t(locale, 'placedCount')}</span></div>
            <div className="metric"><strong>{dashboard.data.stats.exact.handoffsOpen}</strong><span>{t(locale, 'openQuestions')}</span></div>
            <div className="metric"><strong>{dashboard.data.stats.exact.productsPublished}</strong><span>{t(locale, 'published')}</span></div>
          </section>
          <section className="section"><SectionHeader title={t(locale, 'sellerOrders')} action={<Button variant="ghost" onClick={() => setView('orders')}>{t(locale, 'all')}<Icon name="chevron" size={18}/></Button>} />{renderOrderList(dashboard.data.orders)}</section>
          {dashboard.data.handoffs.length ? <section className="section"><SectionHeader title={t(locale, 'questions')} action={<Button variant="ghost" onClick={() => setView('questions')}>{t(locale, 'all')}<Icon name="chevron" size={18}/></Button>} /><ul className="list">{dashboard.data.handoffs.map((item) => <li key={item.id}><button className="list-item list-item--button" onClick={() => setHandoffId(item.id)}><div className="row row--between"><strong>{item.reason}</strong><Badge tone={item.status === 'open' ? 'warning' : 'positive'}>{item.status}</Badge></div><small className="muted">{formatDate(item.createdAt, locale)}</small></button></li>)}</ul></section> : null}
        </> : null}
      </> : null}

      {view === 'orders' ? <><section className="hero"><h1>{t(locale, 'sellerOrders')}</h1></section>{orders.isLoading ? <SkeletonList count={3}/> : orders.isError ? <ErrorView locale={locale} retry={() => void orders.refetch()}/> : renderOrderList(orders.data?.items ?? [])}</> : null}

      {view === 'questions' ? <><section className="hero"><h1>{t(locale, 'questions')}</h1></section>{handoffs.isLoading ? <SkeletonList count={3}/> : handoffs.isError ? <ErrorView locale={locale} retry={() => void handoffs.refetch()}/> : handoffs.data?.items.length ? <ul className="list">{handoffs.data.items.map((item) => <li key={item.id}><button className="list-item list-item--button" onClick={() => setHandoffId(item.id)}><div className="row row--between"><strong>{item.reason}</strong><Badge tone={item.status === 'open' ? 'warning' : 'positive'}>{item.status}</Badge></div><small className="muted">{formatDate(item.createdAt, locale)}</small></button></li>)}</ul> : <StateView icon="help" title={t(locale, 'noWork')}/>}</> : null}

      {view === 'products' ? <><section className="hero"><div className="row row--between"><h1>{t(locale, 'products')}</h1>{commands ? <Button onClick={() => setProductForm({ open: true, product: null })}><Icon name="plus"/>{t(locale, 'addProduct')}</Button> : null}</div></section>{!commands ? <div className="notice"><Icon name="warning" size={19}/><span>{t(locale, 'commandsOff')}</span></div> : null}{products.isLoading ? <SkeletonList/> : products.isError ? <ErrorView locale={locale} retry={() => void products.refetch()}/> : products.data?.items.length ? <ul className="list">{products.data.items.map((product) => <li className="list-item" key={product.id}><div className="row row--between"><div><strong>{product.name}</strong><div className="muted">{formatPrice(product.priceMinor, locale)}</div></div><Badge tone={product.status === 'published' ? 'positive' : product.status === 'archived' ? 'negative' : 'neutral'}>{labelForStatus(locale, product.status)}</Badge></div>{commands ? <div className="cluster"><Button variant="secondary" onClick={() => setProductForm({ open: true, product })}><Icon name="edit" size={18}/>{t(locale, 'edit')}</Button>{product.status === 'draft' ? <Button pending={productTransition.isPending} onClick={() => productTransition.mutate({ product, action: 'publish' })}>{t(locale, 'publish')}</Button> : product.status === 'published' ? <Button variant="secondary" pending={productTransition.isPending} onClick={() => productTransition.mutate({ product, action: 'unpublish' })}>{t(locale, 'unpublish')}</Button> : null}</div> : null}</li>)}</ul> : <StateView icon="products" title={t(locale, 'noWork')}/>}</> : null}

      {view === 'inventory' ? <><section className="hero"><h1>{t(locale, 'inventory')}</h1></section>{!commands ? <div className="notice"><Icon name="warning" size={19}/><span>{t(locale, 'commandsOff')}</span></div> : null}{inventory.isLoading ? <SkeletonList count={3}/> : inventory.isError ? <ErrorView locale={locale} retry={() => void inventory.refetch()}/> : inventory.data?.items.length ? <ul className="list">{inventory.data.items.map((item) => <InventoryRow key={item.productId} item={item} locale={locale} commands={commands} pending={stock.isPending && stock.variables?.item.productId === item.productId} onSave={(onHand) => stock.mutate({ item, onHand })}/>)}</ul> : <StateView icon="inventory" title={t(locale, 'noWork')}/>}</> : null}
    </main>

    <nav className="bottom-nav bottom-nav--seller" aria-label={t(locale, 'seller')}>
      {([
        ['dashboard', 'home', 'overview'], ['orders', 'orders', 'sellerOrders'], ['questions', 'help', 'questions'], ['products', 'products', 'products'], ['inventory', 'inventory', 'inventory'],
      ] as const).map(([destination, icon, label]) => <button key={destination} onClick={() => setView(destination)} aria-current={view === destination ? 'page' : undefined}><Icon name={icon}/><span>{t(locale, label)}</span></button>)}
    </nav>
    <SellerOrderModal orderId={orderId} locale={locale} commands={commands} onClose={() => setOrderId(null)}/>
    <HandoffModal id={handoffId} locale={locale} commands={commands} onClose={() => setHandoffId(null)}/>
    <ProductForm key={`${productForm.product?.id ?? 'new'}:${productForm.open}`} open={productForm.open} product={productForm.product} categories={categories.data?.items ?? []} locale={locale} onClose={() => setProductForm({ open: false, product: null })}/>
  </>;
}

function InventoryRow({ item, locale, commands, pending, onSave }: { item: Inventory; locale: Locale; commands: boolean; pending: boolean; onSave: (onHand: number) => void }) {
  const [value, setValue] = useState(String(item.onHand));
  return <li className="list-item"><form className="row row--between inventory-form" onSubmit={(event: FormEvent) => { event.preventDefault(); onSave(Number(value)); }}><label><strong>{item.productName}</strong><span className="field__label">{t(locale, 'stock')}</span></label><input aria-label={`${t(locale, 'stock')}: ${item.productName}`} type="number" min="0" max="1000000" disabled={!commands} value={value} onChange={(event) => setValue(event.target.value)}/>{commands ? <Button type="submit" pending={pending}>{t(locale, 'save')}</Button> : null}</form></li>;
}
