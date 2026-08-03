/**
 * The command centre.
 *
 * Ten seconds is the budget: is anything wrong, what needs a person, how much
 * of the marketplace is real. Everything on this screen is counted from a table
 * in this database - there is no revenue here, no conversion, no view count and
 * no map, because Bormi does not measure those yet and a dashboard that draws
 * them anyway is one that stops being believed.
 */
import { adminApi } from '../lib/api';
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
  Freshness,
  Metric,
  PageHeader,
  StatusStrip,
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

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

function statusTone(status: string): Tone {
  if (status === 'published') return 'good';
  if (status === 'archived') return 'neutral';
  return 'warn';
}

/**
 * The verdict, computed from the same counts the page goes on to show.
 *
 * It can only say things the numbers support: one critical item makes it red,
 * anything else outstanding makes it amber, and nothing outstanding makes it
 * green. There is no health score and no uptime figure, because nothing here
 * measures either.
 */
function verdict(data: OverviewResponse): { tone: 'good' | 'warn' | 'bad'; title: string; detail: string } {
  const critical = data.attention.filter((item) => item.severity === 'critical');
  const warnings = data.attention.filter((item) => item.severity === 'warning');
  if (critical.length > 0) {
    return {
      tone: 'bad',
      title: `Требуется вмешательство: ${count(critical.length)} ${plural(critical.length, 'проблема', 'проблемы', 'проблем')}`,
      detail: critical.map((item) => ATTENTION[item.code]?.title ?? item.code).join(' · '),
    };
  }
  if (warnings.length > 0) {
    return {
      tone: 'warn',
      title: `Стоит проверить: ${count(warnings.length)} ${plural(warnings.length, 'пункт', 'пункта', 'пунктов')}`,
      detail: warnings.map((item) => ATTENTION[item.code]?.title ?? item.code).join(' · '),
    };
  }
  return {
    tone: 'good',
    title: 'Ничего не требует вмешательства',
    detail: 'Нет приостановленных магазинов, открытых кодов привязки и вопросов без ответа.',
  };
}

export default function Overview() {
  const { data, error, loading, refreshing, fetchedAt, reload } = useQuery<OverviewResponse>(
    () => adminApi.overview(),
    [],
  );

  if (loading) {
    return (
      <>
        <PageHeader title="Командный центр" />
        {/* The skeleton has the shape of the answer: a verdict strip, four
            metrics and two panels. A spinner in the middle of an empty screen
            tells the reader nothing about what is coming. */}
        <div className="skeleton mb-5 h-20 w-full" />
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => <div key={index} className="skeleton h-24 w-full" />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="skeleton h-64 w-full xl:col-span-2" />
          <div className="skeleton h-64 w-full" />
        </div>
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
  const state = verdict(data);

  return (
    <>
      <PageHeader
        title="Командный центр"
        subtitle={`Данные на ${exactTime(data.generated_at)} · окно ${data.window_days} ${plural(data.window_days, 'день', 'дня', 'дней')}`}
        actions={<Freshness fetchedAt={fetchedAt} refreshing={refreshing} onRefresh={reload} />}
      />

      <StatusStrip tone={state.tone} title={state.title} detail={state.detail} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* A zero is only worth a tile if it is told what it means. */}
        <Metric
          label="Опубликовано"
          value={count(listings.published)}
          tone={listings.published === 0 ? 'warn' : 'neutral'}
          note={listings.published === 0
            ? 'витрина пуста для покупателя'
            : `${count(listings.touched_7d)} обновлено за неделю`}
        />
        <Metric
          label="Черновики"
          value={count(listings.draft)}
          note={listings.draft === 0 ? 'все карточки опубликованы' : `${count(listings.archived)} в архиве`}
        />
        <Metric
          label="Активные магазины"
          value={count(stores.active)}
          tone={stores.suspended > 0 ? 'warn' : 'neutral'}
          note={stores.suspended > 0
            ? `${count(stores.suspended)} приостановлено`
            : `всего ${count(stores.total)}`}
        />
        <Metric
          label="Заказы в работе"
          value={count(orders.open)}
          note={orders.open === 0 && orders.last7d === 0
            ? 'за неделю заказов не было'
            : `${count(orders.today)} сегодня · ${count(orders.last7d)} за неделю`}
        />
      </div>

      {/*
        On the page only when it has something to say. A panel that is always
        there announcing "ничего" is one an operator stops seeing within a week,
        and it takes the real warnings down with it. The verdict strip above
        already carries the good news, so there is nothing lost by its absence.
        Critical first, then warnings.
      */}
      {attention.length > 0 ? (
        <Card className="mb-4">
          <CardTitle hint="Только то, где нужно действие. Пункт с нулём не показывается.">
            Требует внимания
          </CardTitle>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[...attention]
              .sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity])
              .map((item) => {
                const copy = ATTENTION[item.code] ?? { title: item.code, hint: '' };
                const accent = item.severity === 'critical'
                  ? 'border-l-[var(--tone-bad)]'
                  : item.severity === 'warning'
                    ? 'border-l-[var(--tone-warn)]'
                    : 'border-l-[var(--border-line)]';
                return (
                  <li
                    key={item.code}
                    className={`flex min-w-0 items-start justify-between gap-3 rounded-[var(--radius-control)] border border-l-4 border-[var(--border-line)] px-3 py-3 ${accent}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{copy.title}</span>
                        <Badge tone={SEVERITY_TONE[item.severity]}>{SEVERITY_WORD[item.severity]}</Badge>
                      </div>
                      {copy.hint ? <p className="muted mt-1 text-xs">{copy.hint}</p> : null}
                    </div>
                    <span className="shrink-0 text-lg font-semibold tabular-nums">{count(item.count)}</span>
                  </li>
                );
              })}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
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

        {/* The full width of the second row, split in two: what the pipeline
            holds, and which orders moved. Neither half is worth a narrow
            column, and together they fill the row that the table above leaves. */}
        <Card className="xl:col-span-3">
          <CardTitle hint="Заказы и вопросы покупателей.">Операции</CardTitle>
          <div className="grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
            <div className="min-w-0">
              <h3 className="muted mb-2 text-[11px] font-medium tracking-wide uppercase">Очередь</h3>
              <ul className="space-y-2 text-sm">
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
            </div>

            <div className="min-w-0">
              <h3 className="muted mb-2 text-[11px] font-medium tracking-wide uppercase">Последние заказы</h3>
              {data.activity.orders.length === 0 ? (
                <EmptyState
                  title="Заказов пока нет"
                  hint="Здесь появятся последние заказы, как только покупатель оформит первый."
                />
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
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
