/**
 * The command centre.
 *
 * Ten seconds is the budget: is anything wrong, what needs a person, how much
 * of the marketplace is real. Everything on this screen is counted from a table
 * in this database - there is no revenue here, no conversion, no view count and
 * no map, because Bormi does not measure those yet and a dashboard that draws
 * them anyway is one that stops being believed.
 *
 * The screen is arranged as three domains rather than one grid of tiles, and
 * the order is the order of the questions: what needs me, what is waiting in
 * moderation, and what the store side is doing. The bento composition is
 * useLayouts' (MIT, see THIRD_PARTY_NOTICES.md) - unequal cards, so the one
 * that matters is the one that looks like it matters.
 *
 * One label on this screen is doing careful work. `/api/admin/overview` counts
 * `sotuvchi_products` without joining stores, so its status counts include
 * private classified listings, while the activity table below joins stores and
 * cannot show them. Rather than split a number this endpoint does not split,
 * the catalogue block says out loud that it counts both scopes. Inventing the
 * separation would be the one thing this console must never do.
 */
import { adminApi } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { useQueueSummary } from '../lib/queues';
import {
  ATTENTION,
  AVAILABILITY,
  count,
  exactTime,
  label,
  LISTING_STATUS,
  MODERATION_STATE,
  money,
  ORDER_STATUS,
  plural,
  when,
} from '../lib/text';
import type { OverviewResponse, Severity } from '../lib/contracts';
import {
  Badge,
  Card,
  DataGap,
  EmptyState,
  ErrorState,
  Freshness,
  TableFrame,
  Td,
  Th,
} from '../components/ui';
import {
  Bento,
  BentoCard,
  BentoHead,
  DomainDivider,
  ScreenHeader,
  StackedList,
  StackedRow,
  TONE_SOFT,
  cn,
  type Tone,
} from '../components/premium';

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

/**
 * Where an attention item is dealt with.
 *
 * Only codes whose destination genuinely exists are listed. An unknown code
 * renders as a row without a link rather than a link to a screen that cannot
 * act on it - a dead end is worse than no door.
 */
const ATTENTION_ROUTE: Record<string, string> = {
  handoffs_open: '/operations',
  orders_open: '/operations',
  listings_without_photo: '/listings',
  listings_without_description: '/listings',
  listings_without_category: '/listings',
  listings_unavailable: '/listings',
  stores_suspended: '/access',
};

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
function verdict(data: OverviewResponse): { tone: Tone; title: string; detail: string; urgent: number } {
  const critical = data.attention.filter((item) => item.severity === 'critical');
  const warnings = data.attention.filter((item) => item.severity === 'warning');
  if (critical.length > 0) {
    return {
      tone: 'bad',
      title: `Требуется вмешательство: ${count(critical.length)} ${plural(critical.length, 'проблема', 'проблемы', 'проблем')}`,
      detail: critical.map((item) => ATTENTION[item.code]?.title ?? item.code).join(' · '),
      urgent: critical.length,
    };
  }
  if (warnings.length > 0) {
    return {
      tone: 'warn',
      title: `Стоит проверить: ${count(warnings.length)} ${plural(warnings.length, 'пункт', 'пункта', 'пунктов')}`,
      detail: warnings.map((item) => ATTENTION[item.code]?.title ?? item.code).join(' · '),
      urgent: warnings.length,
    };
  }
  return {
    tone: 'good',
    title: 'Ничего не требует вмешательства',
    detail: 'Нет приостановленных магазинов, открытых кодов привязки и вопросов без ответа.',
    urgent: 0,
  };
}

/** A number and what it counts, sized for the bento rather than for a tile row. */
function Figure({
  label: text,
  value,
  note,
  tone,
  href,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <p className="t-eyebrow">{text}</p>
      <p className={cn('t-metric mt-2', tone && tone !== 'neutral' && `text-[var(--admin-${tone === 'bad' ? 'danger' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'primary'})]`)}>
        {value}
      </p>
      {note ? <p className="t-meta mt-1.5">{note}</p> : null}
    </>
  );
  if (!href) return <div>{body}</div>;
  return (
    <a href={href} className="block rounded-[var(--admin-radius-sm)] focus-visible:outline-none">
      {body}
      <span className="t-meta mt-2 inline-flex items-center gap-1 text-[var(--admin-primary)]">
        Открыть
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </a>
  );
}

export default function Overview() {
  const { data, error, loading, refreshing, fetchedAt, reload } = useQuery<OverviewResponse>(
    () => adminApi.overview(),
    [],
  );
  // The classifieds side of the marketplace, which the overview endpoint does
  // not report. It is *not* a second request from this screen: the shell
  // already read the moderation summary once to put badges on the rail, and it
  // hands the same numbers down. Two reads would mean the rail and the body
  // could disagree about how many listings are waiting.
  const summary = useQueueSummary();

  if (loading) {
    return (
      <>
        <ScreenHeader eyebrow="Обзор" title="Командный центр" />
        {/* The skeleton has the shape of the answer: a verdict, a queue and a
            row of figures. A spinner in the middle of an empty screen tells the
            reader nothing about what is coming. */}
        <div className="grid gap-3 lg:grid-cols-12 lg:gap-4">
          <div className="skeleton h-40 w-full lg:col-span-8" />
          <div className="skeleton h-40 w-full lg:col-span-4" />
          {[0, 1, 2, 3].map((index) => <div key={index} className="skeleton h-28 w-full lg:col-span-3" />)}
        </div>
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        <ScreenHeader eyebrow="Обзор" title="Командный центр" />
        <Card><ErrorState code={error ?? 'unknown'} onRetry={reload} /></Card>
      </>
    );
  }

  const { listings, stores, orders, handoffs, attention } = data;
  const state = verdict(data);
  const sorted = [...attention].sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
  );

  return (
    <>
      <ScreenHeader
        eyebrow="Обзор"
        title="Командный центр"
        subtitle={`Данные на ${exactTime(data.generated_at)} · окно ${data.window_days} ${plural(data.window_days, 'день', 'дня', 'дней')}`}
        actions={<Freshness fetchedAt={fetchedAt} refreshing={refreshing} onRefresh={reload} />}
      />

      {/*
        The verdict and the queue it is about, side by side. The queue is the
        card with the mass on this screen, because "what needs me" is the
        question the screen exists to answer and it used to be a panel of
        equal-weight tiles below four metrics that mostly do not change.
      */}
      <Bento>
        <BentoCard span={7} emphasis="lead" tone={state.tone} index={0}>
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={cn('mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full', TONE_SOFT[state.tone])}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {state.tone === 'good' ? <path d="M5 12.5l4.5 4.5L19 7" /> : <><path d="M12 8v5.5M12 17v.5" /><circle cx="12" cy="12" r="9" /></>}
              </svg>
            </span>
            <div className="min-w-0">
              <p className="t-eyebrow">Состояние площадки</p>
              <h2 className="t-section mt-1" data-testid="overview-verdict">{state.title}</h2>
              <p className="t-meta mt-2">{state.detail}</p>
            </div>
          </div>
        </BentoCard>

        {/*
          On the page only when it has something to say. A panel that is always
          there announcing "ничего" is one an operator stops seeing within a
          week, and it takes the real warnings down with it. The verdict card
          already carries the good news, so nothing is lost by its absence.
        */}
        {attention.length > 0 ? (
          <BentoCard span={5} index={1}>
            <BentoHead title="Требует внимания" hint="Пункт с нулём не показывается" />
            <StackedList>
              {sorted.map((item, index) => {
                const copy = ATTENTION[item.code] ?? { title: item.code, hint: '' };
                const route = ATTENTION_ROUTE[item.code];
                return (
                  <StackedRow
                    key={item.code}
                    index={index}
                    href={route ? `/admin${route}` : undefined}
                    title={copy.title}
                    subtitle={copy.hint || undefined}
                    trailing={(
                      <>
                        <Badge tone={SEVERITY_TONE[item.severity]}>{SEVERITY_WORD[item.severity]}</Badge>
                        <span className="t-metric-sm">{count(item.count)}</span>
                      </>
                    )}
                  />
                );
              })}
            </StackedList>
          </BentoCard>
        ) : null}
      </Bento>

      {/*
        Classifieds. Its own block because its lifecycle is moderation, and a
        pending listing has nothing to do with an open order - putting the two
        in one row of tiles is how an operator reads a marketplace as one queue
        when it is two.
      */}
      <DomainDivider title="Частные объявления" hint="Модерация и жалобы" />
      {/* `null` means the shell could not read the queue, which is not the same
          as an empty queue. Both figures render an em dash for it. */}
      <Bento>
          <BentoCard span={3} index={0} interactive>
            <Figure
              label="На модерации"
              value={summary === null ? '—' : count(summary.pending ?? 0)}
              note={summary === null ? 'очередь не прочитана' : 'ждут решения модератора'}
              tone={(summary?.pending ?? 0) > 0 ? 'warn' : 'neutral'}
              href="/admin/moderation"
            />
          </BentoCard>
          <BentoCard span={3} index={1} interactive>
            <Figure
              label="Жалобы"
              value={summary === null ? '—' : count(summary.open_reports ?? 0)}
              note={summary === null ? 'очередь не прочитана' : 'открытых обращений'}
              tone={(summary?.open_reports ?? 0) > 0 ? 'bad' : 'neutral'}
              href="/admin/reports"
            />
          </BentoCard>
          <BentoCard span={6} index={2}>
            <BentoHead title="Решения модерации" hint="Состояния, которые уже проставлены" />
            {summary === null ? (
              <p className="muted text-sm">Очередь модерации не прочитана в этом запросе.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {(['approved', 'rejected', 'restricted', 'removed'] as const).map((key) => (
                  <li key={key} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{label(MODERATION_STATE, key)}</span>
                    <span className="tabular-nums">{count(summary[key] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            )}
          </BentoCard>
      </Bento>

      {/*
        Store commerce. These four are genuinely store-scoped: stores, orders
        and handoffs all hang off a storefront, and none of them can be inflated
        by a private listing.
      */}
      <DomainDivider title="Магазины" hint="Витрины, заказы и вопросы покупателей" />
      <Bento>
        <BentoCard span={3} index={0} interactive>
          <Figure
            label="Активные магазины"
            value={count(stores.active)}
            tone={stores.suspended > 0 ? 'warn' : 'neutral'}
            note={stores.suspended > 0 ? `${count(stores.suspended)} приостановлено` : `всего ${count(stores.total)}`}
            href="/admin/access"
          />
        </BentoCard>
        <BentoCard span={3} index={1} interactive>
          <Figure
            label="Заказы в работе"
            value={count(orders.open)}
            note={orders.open === 0 && orders.last7d === 0
              ? 'за неделю заказов не было'
              : `${count(orders.today)} сегодня · ${count(orders.last7d)} за неделю`}
            href="/admin/operations"
          />
        </BentoCard>
        <BentoCard span={3} index={2} interactive>
          <Figure
            label="Вопросы без ответа"
            value={count(handoffs.open)}
            tone={handoffs.open > 0 ? 'warn' : 'neutral'}
            note="покупатель ждёт продавца магазина"
            href="/admin/operations"
          />
        </BentoCard>
        <BentoCard span={3} index={3}>
          <BentoHead title="Очередь заказов" />
          <ul className="space-y-1.5 text-sm">
            {Object.entries(orders.by_status).map(([status, value]) => (
              <li key={status} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{label(ORDER_STATUS, status)}</span>
                <span className="tabular-nums">{count(value)}</span>
              </li>
            ))}
          </ul>
        </BentoCard>
      </Bento>

      {/*
        The catalogue, counted across both scopes because that is what the
        endpoint returns. The note is not a disclaimer for its own sake: the
        table underneath joins stores, so without it the operator reads a
        published count that the list below cannot account for.
      */}
      <DomainDivider title="Каталог" hint="Все объявления: и магазинов, и частные" />
      <Bento>
        <BentoCard span={3} index={0}>
          <Figure
            label="Опубликовано"
            value={count(listings.published)}
            tone={listings.published === 0 ? 'warn' : 'neutral'}
            note={listings.published === 0
              ? 'витрина пуста для покупателя'
              : `${count(listings.touched_7d)} обновлено за неделю`}
          />
        </BentoCard>
        <BentoCard span={3} index={1}>
          <Figure
            label="Черновики"
            value={count(listings.draft)}
            note={listings.draft === 0 ? 'все карточки опубликованы' : `${count(listings.archived)} в архиве`}
          />
        </BentoCard>
        <BentoCard span={6} index={2}>
          <BentoHead title="Качество карточек" hint="Считается по опубликованным" />
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {([
              ['Без фото', listings.quality.no_photo],
              ['Без описания', listings.quality.no_description],
              ['Без категории', listings.quality.no_category],
              ['Нет в наличии', listings.quality.unavailable],
            ] as const).map(([text, value]) => (
              <li key={text} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{text}</span>
                <span className="tabular-nums">
                  {count(Number(value))}
                  <span className="muted"> из {count(listings.published)}</span>
                </span>
              </li>
            ))}
          </ul>
        </BentoCard>
      </Bento>

      <div className="mt-3 grid gap-3 lg:grid-cols-12 lg:gap-4">
        <div className="lg:col-span-8">
          <Card>
            <BentoHead title="Свежие объявления" hint="Последние изменения в каталоге магазинов" />
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
                    <tr key={row.id} className="transition-colors hover:bg-[var(--admin-surface-subtle)]">
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
        </div>

        <div className="grid gap-3 lg:col-span-4 lg:gap-4">
          <Card>
            <BentoHead title="Последние заказы" />
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
          </Card>

          <DataGap
            what="Просмотры, отклики и конверсия не показаны"
            why="Bormi пока не собирает эти события. Появятся вместе с телеметрией QuickPost и поиска."
          />
          <DataGap
            what="Каталог не разделён на магазины и частные объявления"
            why="Обзорный эндпоинт считает sotuvchi_products без join к магазинам, поэтому статусы выше включают оба вида. Таблица «Свежие объявления» показывает только карточки магазинов."
          />
        </div>
      </div>
    </>
  );
}
