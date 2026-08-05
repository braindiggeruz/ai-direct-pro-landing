/**
 * На модерации — the queue that needs a person.
 *
 * `pending` is the default and the only state that is a queue rather than a
 * verdict; the other four are here so a decision can be looked up afterwards,
 * not so the screen can pretend they need attention.
 *
 * Every row carries the version it was read at, and the decision one level down
 * sends it back. That is what makes two moderators opening the same listing a
 * 409 rather than a second ruling on content somebody has already judged.
 *
 * Nothing on this screen mutates. The four decisions live in the detail, where
 * the photographs and the reports are — approving from a table row would be
 * approving a title.
 */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { adminApi } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import {
  ANY_MODERATION_REASON,
  count,
  exactTime,
  label,
  MODERATION_STATE,
  money,
  plural,
  SELLER_TYPE,
  when,
} from '../lib/text';
import type { ModerationQueueResponse } from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  // FilterSelect is gone from this screen: the state filter is the tab bar in
  // the header, and two controls writing one parameter can disagree on screen.
  Freshness,
  PageHeader,
  TableFrame,
  Td,
  Th,
} from '../components/ui';
import {
  Bento,
  BentoCard,
  DiscreteTabs,
  cn,
  type TabOption,
} from '../components/premium';

const PAGE_SIZE = 25;

/** Colour repeats the word. `pending` is work, not an alarm. */
export function moderationTone(state: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (state === 'approved') return 'good';
  if (state === 'pending' || state === 'restricted') return 'warn';
  if (state === 'rejected' || state === 'removed') return 'bad';
  return 'neutral';
}

export default function Moderation() {
  const [params, setParams] = useSearchParams();
  // The state lives in the URL so Back from a listing returns to the same
  // queue, and a link to "everything I rejected" is a link somebody else can
  // open. `all` is the server's own word for no filter.
  const state = params.get('state') ?? 'pending';
  const offset = Number(params.get('offset') ?? 0) || 0;

  const key = useMemo(() => `${state}:${offset}`, [state, offset]);
  const queue = useQuery<ModerationQueueResponse>(
    () => adminApi.moderationQueue(PAGE_SIZE, offset, state),
    [key],
  );

  function setState(next: string): void {
    setParams((current) => {
      const params_ = new URLSearchParams(current);
      if (next && next !== 'pending') params_.set('state', next); else params_.delete('state');
      // A different question starts at its own first page: staying on page four
      // shows an empty screen that reads as "nothing found" when it means
      // "no fourth page".
      params_.delete('offset');
      return params_;
    });
  }

  function move(next: number): void {
    setParams((current) => {
      const params_ = new URLSearchParams(current);
      if (next > 0) params_.set('offset', String(next)); else params_.delete('offset');
      return params_;
    });
  }

  if (queue.loading) {
    return (
      <>
        <PageHeader title="На модерации" />
        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => <div key={index} className="skeleton h-24 w-full" />)}
        </div>
        <div className="skeleton h-96 w-full" />
      </>
    );
  }
  if (queue.error || !queue.data) {
    return (
      <>
        <PageHeader title="На модерации" />
        <Card><ErrorState code={queue.error ?? 'unknown'} onRetry={queue.reload} /></Card>
      </>
    );
  }

  const data = queue.data;
  const rows = data.listings;
  const shown = offset + rows.length;
  const summary = data.summary;
  const readOnly = data.actor.role !== 'platform_owner';

  return (
    <>
      <PageHeader
        eyebrow="Модерация"
        title="На модерации"
        subtitle={readOnly
          ? 'Очередь объявлений частных продавцов. У вашей роли только чтение.'
          : 'Очередь объявлений частных продавцов. Решение принимается в карточке.'}
        actions={(
          <Freshness
            fetchedAt={queue.fetchedAt}
            refreshing={queue.refreshing}
            onRefresh={queue.reload}
          />
        )}
        /*
          The five moderation states as tabs, each carrying the count the server
          reported. This replaces a dropdown whose option labels had the counts
          glued on - a filter whose values you had to open a menu to compare.
          Every value here is one the server takes, plus `all`, which it reads
          as no filter.
        */
        filters={(
          <DiscreteTabs
            label="Фильтр по состоянию"
            controls="moderation-queue"
            value={state}
            onChange={setState}
            options={[
              ...Object.entries(MODERATION_STATE).map(([value, text]): TabOption<string> => ({
                value,
                label: text,
                count: summary[value] ?? 0,
              })),
              { value: 'all', label: 'Все' },
            ]}
          />
        )}
      />

      {summary.pending > 0 ? (
        <Bento className="mb-4">
          <BentoCard span={12} tone={summary.open_reports > 0 ? 'warn' : 'good'} index={0}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="t-eyebrow">Очередь</p>
                <h2 className="t-section mt-1">Ждут решения: {count(summary.pending)}</h2>
                <p className="t-meta mt-1">
                  Порядок — от самых давних: объявление, поданное первым, ждёт дольше всех.
                </p>
              </div>
              <div className="text-right">
                <p className="t-eyebrow">Открытых жалоб</p>
                <p className={cn('t-metric mt-1', summary.open_reports > 0 && 'text-[var(--admin-danger)]')}>
                  {count(summary.open_reports ?? 0)}
                </p>
              </div>
            </div>
          </BentoCard>
        </Bento>
      ) : null}

      {/* The region the state tabs point at. */}
      <Card>
        <div id="moderation-queue" role="tabpanel" tabIndex={-1} aria-label="Очередь модерации">
        <CardTitle hint={`Страница по ${PAGE_SIZE} объявлений. Нажмите «Открыть», чтобы принять решение.`}>
          Очередь
        </CardTitle>

        {rows.length === 0 ? (
          state === 'pending' ? (
            <EmptyState
              title="Очередь пуста"
              hint="Ни одно объявление не ждёт решения. Это нормальное состояние, а не ошибка загрузки."
            />
          ) : (
            <EmptyState
              title="В этом состоянии объявлений нет"
              hint="Выберите другое состояние — в очереди есть объявления, просто не эти."
            />
          )
        ) : (
          <>
            {/* Desktop: the full table. */}
            <div className="hidden md:block">
              <TableFrame>
                <caption className="sr-only">
                  Объявления на модерации: название, продавец, категория, район, цена,
                  состояние, жалобы и дата подачи
                </caption>
                <thead>
                  <tr>
                    <Th><span className="block min-w-[14rem]">Объявление</span></Th>
                    <Th><span className="block min-w-[10rem]">Продавец</span></Th>
                    <Th><span className="block min-w-[9rem]">Категория</span></Th>
                    <Th><span className="block min-w-[9rem]">Район</span></Th>
                    <Th align="right"><span className="block min-w-[7rem]">Цена</span></Th>
                    <Th><span className="block min-w-[8rem]">Состояние</span></Th>
                    <Th align="right"><span className="block min-w-[5rem]">Жалобы</span></Th>
                    <Th align="right"><span className="block min-w-[7rem]">Подано</span></Th>
                    <Th align="right"><span className="block min-w-[5rem]">Действие</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.listing_id}>
                      <Td>
                        <div className="font-medium">{row.name}</div>
                        <div className="muted text-xs">
                          {row.media_count === 0
                            ? 'без фотографий'
                            : `${count(row.media_count)} ${plural(row.media_count, 'фото', 'фото', 'фото')}`}
                        </div>
                      </Td>
                      <Td>
                        <div className="text-sm">{row.seller_display_name ?? '—'}</div>
                        <div className="muted text-xs">
                          {label(SELLER_TYPE, row.seller_type ?? '')}
                        </div>
                      </Td>
                      <Td><span className="muted">{row.category_name_ru ?? '—'}</span></Td>
                      <Td><span className="muted">{row.district_name_ru ?? '—'}</span></Td>
                      <Td align="right">
                        <span className="whitespace-nowrap">{money(row.price_minor)}</span>
                      </Td>
                      <Td>
                        <Badge tone={moderationTone(row.state)}>
                          {label(MODERATION_STATE, row.state)}
                        </Badge>
                        {row.reason_code ? (
                          <div className="muted mt-1 text-xs">
                            {label(ANY_MODERATION_REASON, row.reason_code)}
                          </div>
                        ) : null}
                      </Td>
                      <Td align="right">
                        {row.open_reports > 0
                          ? <Badge tone="bad">{count(row.open_reports)}</Badge>
                          : <span className="muted text-xs">нет</span>}
                      </Td>
                      <Td align="right">
                        <span className="muted text-xs">{when(row.submitted_at)}</span>
                      </Td>
                      <Td align="right">
                        <Link
                          to={{
                            pathname: `/moderation/${row.listing_id}`,
                            search: params.toString(),
                          }}
                          className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-2 underline"
                        >
                          Открыть
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
            </div>

            {/* Phone: cards. A nine-column table at 320px is a table nobody reads. */}
            <ul className="space-y-3 md:hidden">
              {rows.map((row) => (
                <li
                  key={row.listing_id}
                  className="rounded-[var(--radius-card)] border border-[var(--border-line)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium">{row.name}</p>
                    <Badge tone={moderationTone(row.state)}>
                      {label(MODERATION_STATE, row.state)}
                    </Badge>
                  </div>
                  <p className="muted mt-1 text-xs">
                    {row.seller_display_name ?? '—'} · {label(SELLER_TYPE, row.seller_type ?? '')}
                  </p>
                  <p className="muted mt-1 text-xs">
                    {row.category_name_ru ?? '—'} · {row.district_name_ru ?? '—'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm tabular-nums">{money(row.price_minor)}</span>
                    {row.open_reports > 0 ? (
                      <Badge tone="bad">
                        {count(row.open_reports)} {plural(row.open_reports, 'жалоба', 'жалобы', 'жалоб')}
                      </Badge>
                    ) : null}
                    {row.media_count === 0 ? <Badge tone="warn">Без фото</Badge> : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="muted text-xs">{when(row.submitted_at)}</span>
                    <Link
                      to={{
                        pathname: `/moderation/${row.listing_id}`,
                        search: params.toString(),
                      }}
                      className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm"
                    >
                      Открыть
                    </Link>
                  </div>
                </li>
              ))}
            </ul>

            <nav
              className="mt-4 flex flex-wrap items-center justify-between gap-3"
              aria-label="Страницы очереди"
            >
              <p className="muted text-xs" aria-live="polite">
                Показано {count(offset + 1)}–{count(shown)} из {count(data.total)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => move(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm disabled:opacity-40"
                >
                  Назад
                </button>
                <button
                  type="button"
                  onClick={() => move(offset + PAGE_SIZE)}
                  disabled={shown >= data.total}
                  className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm disabled:opacity-40"
                >
                  Дальше
                </button>
              </div>
            </nav>
          </>
        )}
        </div>
      </Card>

      <p className="muted mt-4 text-xs">Данные на {exactTime(data.generated_at)}</p>
    </>
  );
}
