/**
 * One order, read-only.
 *
 * The same projection as the list, which is the point: there is no "expand to
 * see the buyer". `sotuvchi_orders` holds a name, a phone number and a delivery
 * address and the server selects none of them, so no screen depth reveals them.
 *
 * What the owner gets instead is the shape of the problem — which store, which
 * product, what stage, and how long it has been sitting there — which is what
 * decides whether to talk to the seller or to act on the shop.
 */
import { Link, useLocation, useParams } from 'react-router';
import { adminApi } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import {
  AVAILABILITY,
  count,
  exactTime,
  label,
  money,
  OPERATIONS_ATTENTION,
  ORDER_STATUS,
  WAITING_SIDE,
  when,
} from '../lib/text';
import type { OrderDetailResponse } from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  DataGap,
  ErrorState,
  Field,
  Freshness,
  PageHeader,
} from '../components/ui';

export default function OrderDetail() {
  const { id = '' } = useParams();
  const location = useLocation();
  const back = { pathname: '/operations', search: location.search || '?tab=orders' };

  const detail = useQuery<OrderDetailResponse>(() => adminApi.order(id), [id]);

  if (detail.loading) {
    return (
      <>
        <PageHeader title="Заказ" />
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="skeleton h-72 w-full" />
          <div className="skeleton h-72 w-full" />
        </div>
      </>
    );
  }
  if (detail.error === 'order_not_found') {
    return (
      <>
        <PageHeader title="Заказ не найден" />
        <Card>
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">Такого заказа нет</p>
            <p className="muted mx-auto mt-1 max-w-md text-xs">
              Возможно, ссылка устарела.
            </p>
            <Link
              to={back}
              className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm"
            >
              Вернуться к очереди
            </Link>
          </div>
        </Card>
      </>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <>
        <PageHeader title="Заказ" />
        <Card><ErrorState code={detail.error ?? 'unknown'} onRetry={detail.reload} /></Card>
      </>
    );
  }

  const order = detail.data.order;

  return (
    <>
      <PageHeader
        title={`Заказ ${order.reference}`}
        subtitle="Только чтение. Подтверждает, отменяет и возвращает продавец."
        actions={(
          <Freshness
            fetchedAt={detail.fetchedAt}
            refreshing={detail.refreshing}
            onRefresh={detail.reload}
          />
        )}
      />

      <Link to={back} className="mb-4 inline-flex min-h-11 items-center text-sm underline">
        ← К очереди
      </Link>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Состояние</CardTitle>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge>{label(ORDER_STATUS, order.stage)}</Badge>
            <Badge tone={order.waiting_on === 'seller' ? 'warn' : 'neutral'}>
              {label(WAITING_SIDE, order.waiting_on)}
            </Badge>
            {order.attention !== 'none' ? (
              <Badge tone={order.attention === 'stalled' ? 'bad' : 'warn'}>
                {label(OPERATIONS_ATTENTION, order.attention)}
              </Badge>
            ) : null}
          </div>
          <dl>
            <Field label="Номер заказа" value={order.reference} />
            <Field label="Магазин" value={order.store_name} />
            <Field label="Сумма" value={money(order.total_minor)} />
            <Field label="Позиций" value={count(order.items)} />
            <Field label="Создан" value={`${when(order.created_at)} · ${exactTime(order.created_at)}`} />
            <Field
              label="Размещён"
              value={order.placed_at
                ? `${when(order.placed_at)} · ${exactTime(order.placed_at)}`
                : 'ещё не размещён'}
            />
          </dl>
        </Card>

        <Card>
          <CardTitle hint="Один заказ несёт ровно одну карточку — так устроен домен.">
            Товар
          </CardTitle>
          {order.item ? (
            <dl>
              <Field label="Название на момент заказа" value={order.item.name} />
              <Field label="Цена за единицу" value={money(order.item.unit_price_minor)} />
              <Field
                label="Количество"
                value={order.item.quantity === null ? '—' : count(order.item.quantity)}
              />
              <Field label="Сумма позиции" value={money(order.item.line_total_minor)} />
              <Field
                label="Наличие на момент заказа"
                value={label(AVAILABILITY, order.item.availability)}
              />
              <Field
                label="Карточка"
                value={(
                  <Link className="underline" to={`/listings/${order.item.product_id}`}>
                    Открыть объявление
                  </Link>
                )}
              />
            </dl>
          ) : (
            <DataGap
              what="Позиция ещё не добавлена"
              why="Черновик заказа создаётся до выбора товара; пока покупатель не выбрал карточку, показывать нечего."
            />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle>Покупатель</CardTitle>
        <DataGap
          what="Имя, телефон и адрес покупателя здесь недоступны"
          why="Сервер не выбирает эти столбцы ни для списка, ни для карточки заказа. Их видит только продавец магазина, с которым покупатель имел дело."
        />
      </Card>

      <details className="mt-4 rounded-[var(--radius-card)] border border-[var(--border-line)] p-4">
        <summary className="cursor-pointer text-sm font-medium">Технические поля</summary>
        <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <Field label="Идентификатор" value={<span className="font-mono text-xs">{order.id}</span>} />
          <Field label="Организация" value={<span className="font-mono text-xs">{order.org_id}</span>} />
          <Field label="Магазин" value={<span className="font-mono text-xs">{order.store_id}</span>} />
          <Field label="status" value={<span className="font-mono text-xs">{order.status}</span>} />
          <Field label="fulfillment_status" value={<span className="font-mono text-xs">{order.fulfillment}</span>} />
          <Field label="Обновлён" value={exactTime(order.updated_at)} />
        </div>
      </details>

      <p className="muted mt-4 text-xs">Данные на {exactTime(detail.data.generated_at)}</p>
    </>
  );
}
