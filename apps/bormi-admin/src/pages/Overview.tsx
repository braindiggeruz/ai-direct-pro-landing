/**
 * The command centre.
 *
 * Ten seconds is the budget: is anything wrong, what needs a person, how much
 * of the marketplace is real. Everything on this screen is counted from a table
 * in this database - there is no revenue here, no conversion, no view count and
 * no map, because Bormi does not measure those yet and a dashboard that draws
 * them anyway is one that stops being believed.
 */
import { adminApi, FIXTURE_MODE } from '../lib/api';
import { SYNTHETIC_NOTICE } from '../lib/fixtures';
import { useQuery } from '../lib/useQuery';
import {
  ATTENTION,
  AVAILABILITY,
  count,
  exactTime,
  label,
  LISTING_STATUS,
  money,
  ORDER_STATUS,
  plural,
  when,
} from '../lib/text';
import type { OverviewResponse, Severity } from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  DataGap,
  EmptyState,
  ErrorState,
  Metric,
  PageHeader,
  Skeleton,
  TableFrame,
  Td,
  Th,
  type Tone,
} from '../components/ui';

const SEVERITY_TONE: Record<Severity, Tone> = {
  critical: 'bad',
  warning: 'warn',
  info: 'neutral',
};

const SEVERITY_WORD: Record<Severity, string> = {
  critical: 'срочно',
  warning: 'важно',
  info: 'к сведению',
};

function statusTone(status: string): Tone {
  if (status === 'published') return 'good';
  if (status === 'archived') return 'neutral';
  return 'warn';
}

export default function Overview() {
  const { data, error, loading, reload } = useQuery<OverviewResponse>(() => adminApi.overview(), []);

  if (loading) {
    return (
      <>
        <PageHeader title="Командный центр" />
        <Skeleton rows={6} />
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        <PageHeader title="Командный центр" />
        <Card><ErrorState code={error ?? 'unknown'} onRetry={reload} /></Card>
      </>
    );
  }

  const { listings, stores, orders, handoffs, attention } = data;

  return (
    <>
      <PageHeader
        title="Командный центр"
        subtitle={`Данные на ${exactTime(data.generated_at)} · окно ${data.window_days} ${plural(data.window_days, 'день', 'дня', 'дней')}`}
      />

      {FIXTURE_MODE ? (
        <p className="mb-4 rounded-[var(--radius-control)] border border-dashed border-[var(--tone-warn)] px-3 py-2 text-xs" role="status">
          {SYNTHETIC_NOTICE}
        </p>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Опубликовано"
          value={count(listings.published)}
          note={`${count(listings.touched_7d)} обновлено за неделю`}
        />
        <Metric label="Черновики" value={count(listings.draft)} note={`${count(listings.archived)} в архиве`} />
        <Metric
          label="Активные магазины"
          value={count(stores.active)}
          tone={stores.suspended > 0 ? 'warn' : 'neutral'}
          note={stores.suspended > 0 ? `${count(stores.suspended)} приостановлено` : undefined}
        />
        <Metric
          label="Заказы в работе"
          value={count(orders.open)}
          note={`${count(orders.today)} сегодня · ${count(orders.last7d)} за неделю`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle hint="Только то, где нужно действие. Пункт с нулём не показывается.">
            Требует внимания
          </CardTitle>
          {attention.length === 0 ? (
            <EmptyState
              title="Ничего не требует внимания"
              hint="Нет открытых вопросов, приостановленных магазинов и карточек с проблемами."
            />
          ) : (
            <ul className="space-y-2">
              {attention.map((item) => {
                const copy = ATTENTION[item.code] ?? { title: item.code, hint: '' };
                return (
                  <li
                    key={item.code}
                    className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{copy.title}</span>
                        <Badge tone={SEVERITY_TONE[item.severity]}>{SEVERITY_WORD[item.severity]}</Badge>
                      </div>
                      {copy.hint ? <p className="muted mt-1 text-xs">{copy.hint}</p> : null}
                    </div>
                    <span className="text-lg font-semibold tabular-nums">{count(item.count)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle hint="Считается по опубликованным карточкам.">Качество карточек</CardTitle>
          <ul className="space-y-2 text-sm">
            {[
              ['Без фото', listings.quality.no_photo],
              ['Без описания', listings.quality.no_description],
              ['Без категории', listings.quality.no_category],
              ['Нет в наличии', listings.quality.unavailable],
            ].map(([text, value]) => (
              <li key={String(text)} className="flex items-center justify-between gap-3">
                <span>{text}</span>
                <span className="tabular-nums">
                  {count(Number(value))}
                  <span className="muted"> из {count(listings.published)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <DataGap
              what="Просмотры, отклики и конверсия не показаны"
              why="Bormi пока не собирает эти события. Появятся вместе с телеметрией QuickPost и поиска."
            />
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardTitle hint="Последние изменения в каталоге.">Свежие объявления</CardTitle>
          {data.activity.listings.length === 0 ? (
            <EmptyState title="Каталог пуст" hint="Ни одной карточки ещё не создано." />
          ) : (
            <TableFrame>
              <thead>
                <tr>
                  <Th>Объявление</Th>
                  <Th>Магазин</Th>
                  <Th>Статус</Th>
                  <Th align="right">Цена</Th>
                  <Th align="right">Обновлено</Th>
                </tr>
              </thead>
              <tbody>
                {data.activity.listings.map((row) => (
                  <tr key={row.id}>
                    <Td>
                      <div className="max-w-[18rem] truncate font-medium">{row.name}</div>
                      <div className="muted text-xs">
                        {row.media_count === 0 ? 'без фото · ' : `${row.media_count} фото · `}
                        {label(AVAILABILITY, row.availability)}
                      </div>
                    </Td>
                    <Td><span className="muted">{row.store_name}</span></Td>
                    <Td><Badge tone={statusTone(row.status)}>{label(LISTING_STATUS, row.status)}</Badge></Td>
                    <Td align="right">{money(row.price_minor)}</Td>
                    <Td align="right"><span className="muted text-xs">{when(row.updated_at)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
        </Card>

        <Card>
          <CardTitle hint="Заказы и вопросы покупателей.">Операции</CardTitle>
          <ul className="mb-4 space-y-2 text-sm">
            {Object.entries(orders.by_status).map(([status, value]) => (
              <li key={status} className="flex items-center justify-between gap-3">
                <span>{label(ORDER_STATUS, status)}</span>
                <span className="tabular-nums">{count(value)}</span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 border-t border-[var(--border-line)] pt-2">
              <span>Вопросы без ответа</span>
              <span className={`tabular-nums ${handoffs.open > 0 ? 'text-[var(--tone-warn)]' : ''}`}>
                {count(handoffs.open)}
              </span>
            </li>
          </ul>
          {data.activity.orders.length === 0 ? (
            <EmptyState title="Заказов пока нет" />
          ) : (
            <ul className="space-y-2">
              {data.activity.orders.map((row) => (
                <li key={row.reference} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-mono text-xs">{row.reference}</span>
                  <Badge>{label(ORDER_STATUS, row.fulfillment === 'none' ? row.status : row.fulfillment)}</Badge>
                  <span className="tabular-nums">{money(row.total_minor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
