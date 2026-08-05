/**
 * Заказы и вопросы — whether the marketplace is answering its buyers.
 *
 * Two queues on one screen, because they are the same question asked twice:
 * somebody is waiting for a seller, and nobody outside the shop can see it.
 * The Command Center reports the totals; this is where the individual row that
 * has been sitting since yesterday becomes visible.
 *
 * Read-only, and read-only on purpose rather than for now. Confirming an order,
 * cancelling one, replying to a question or closing it are all acts performed
 * *as the seller* toward a buyer who chose that shop. An owner doing any of
 * them would be the platform speaking in a shop's voice to its own customer.
 * The owner's job here is to see the queue, and — where a seller has stopped
 * responding — to act on the shop, which the Магазины screen already allows.
 *
 * Nothing on this screen identifies a buyer. Not the name, not the phone, not
 * the address, not the words of a question. Those columns exist in the tables
 * and the server never selects them.
 */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { adminApi } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import {
  count,
  exactTime,
  HANDOFF_STATUS,
  HANDOFF_STATUS_KEYS,
  label,
  money,
  OPERATIONS_ATTENTION,
  ORDER_STAGE_KEYS,
  ORDER_STATUS,
  QUESTION_REASON,
  WAITING_SIDE,
  when,
} from '../lib/text';
import type {
  AttentionState,
  OrdersResponse,
  QuestionsResponse,
  WaitingSide,
} from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  FilterSelect,
  Freshness,
  Metric,
  PageHeader,
  TableFrame,
  Td,
  Th,
} from '../components/ui';

const PAGE_SIZE = 25;
type Tab = 'orders' | 'questions';

/**
 * `stalled` is the only tone that raises its voice. A queue where every open row
 * is red is a queue whose colour has stopped meaning anything.
 */
function attentionTone(state: AttentionState): 'bad' | 'warn' | 'neutral' {
  if (state === 'stalled') return 'bad';
  if (state === 'waiting') return 'warn';
  return 'neutral';
}

function waitingTone(side: WaitingSide): 'warn' | 'neutral' {
  return side === 'seller' ? 'warn' : 'neutral';
}

export default function Operations() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'questions' ? 'questions' : 'orders';
  const offset = Number(params.get('offset') ?? 0) || 0;
  const stage = params.get('stage') ?? '';
  const status = params.get('status') ?? '';

  // Both queues are read, not just the visible one: the counts in the header
  // describe the marketplace rather than the tab, and a number that changed
  // when the reader switched tabs would be a number they stopped trusting.
  const ordersKey = JSON.stringify({ stage, offset: tab === 'orders' ? offset : 0 });
  const questionsKey = JSON.stringify({ status, offset: tab === 'questions' ? offset : 0 });
  const orders = useQuery<OrdersResponse>(
    () => adminApi.orders(PAGE_SIZE, tab === 'orders' ? offset : 0, stage ? { stage } : {}),
    [ordersKey],
  );
  const questions = useQuery<QuestionsResponse>(
    () => adminApi.questions(
      PAGE_SIZE,
      tab === 'questions' ? offset : 0,
      status ? { status } : {},
    ),
    [questionsKey],
  );

  const active = tab === 'orders' ? orders : questions;
  const summary = orders.data?.summary ?? questions.data?.summary ?? null;

  const stageOptions = useMemo(() => [
    { value: '', label: 'Все заказы' },
    ...ORDER_STAGE_KEYS.map((key) => ({ value: key, label: label(ORDER_STATUS, key) })),
  ], []);
  const statusOptions = useMemo(() => [
    { value: '', label: 'Все вопросы' },
    ...HANDOFF_STATUS_KEYS.map((key) => ({ value: key, label: label(HANDOFF_STATUS, key) })),
  ], []);

  function switchTab(next: Tab): void {
    setParams((current) => {
      const search = new URLSearchParams(current);
      search.set('tab', next);
      // The other tab's filter and page belong to a question nobody is asking
      // any more; carrying them across would show "nothing found" for a filter
      // the reader cannot see.
      search.delete('offset');
      search.delete(next === 'orders' ? 'status' : 'stage');
      return search;
    });
  }

  function setFilter(name: string, value: string): void {
    setParams((current) => {
      const search = new URLSearchParams(current);
      if (value) search.set(name, value); else search.delete(name);
      search.delete('offset');
      return search;
    });
  }

  function move(next: number): void {
    setParams((current) => {
      const search = new URLSearchParams(current);
      if (next > 0) search.set('offset', String(next)); else search.delete('offset');
      return search;
    });
  }

  const tabs: { key: Tab; label: string; badge: number | null }[] = [
    { key: 'orders', label: 'Заказы', badge: summary?.orders_awaiting_seller ?? null },
    { key: 'questions', label: 'Вопросы', badge: summary?.questions_open ?? null },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Операции"
        title="Заказы и вопросы"
        subtitle="Только чтение. Подтверждает заказ и отвечает покупателю продавец."
        actions={(
          <Freshness
            fetchedAt={active.fetchedAt}
            refreshing={active.refreshing}
            onRefresh={active.reload}
          />
        )}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Заказов всего" value={summary ? count(summary.orders_total) : null} />
        <Metric
          label="Ждут продавца"
          value={summary ? count(summary.orders_awaiting_seller) : null}
          tone={(summary?.orders_awaiting_seller ?? 0) > 0 ? 'warn' : 'good'}
          note={(summary?.orders_awaiting_seller ?? 0) > 0 ? 'заказ размещён, но не подтверждён' : undefined}
        />
        <Metric label="Вопросов всего" value={summary ? count(summary.questions_total) : null} />
        <Metric
          label="Без ответа"
          value={summary ? count(summary.questions_open) : null}
          tone={(summary?.questions_open ?? 0) > 0 ? 'warn' : 'good'}
          note={(summary?.questions_open ?? 0) > 0 ? 'покупатель ждёт' : undefined}
        />
      </div>

      {/* Two queues, one screen. Tabs rather than two menu items because the
          reader's question — «кто-то ждёт?» — is answered by both together. */}
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Очереди операций">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            id={`operations-tab-${entry.key}`}
            aria-selected={tab === entry.key}
            aria-controls={`operations-panel-${entry.key}`}
            onClick={() => switchTab(entry.key)}
            className={`min-h-11 rounded-[var(--radius-control)] border px-4 text-sm ${
              tab === entry.key
                ? 'border-[var(--text-primary)] font-medium'
                : 'border-[var(--border-line)]'
            }`}
          >
            {entry.label}
            {entry.badge !== null && entry.badge > 0 ? (
              <span className="muted ml-2 text-xs tabular-nums">{count(entry.badge)}</span>
            ) : null}
          </button>
        ))}
      </div>

      {active.loading ? <div className="skeleton h-96 w-full" /> : null}
      {!active.loading && (active.error || !active.data) ? (
        <Card><ErrorState code={active.error ?? 'unknown'} onRetry={active.reload} /></Card>
      ) : null}

      {!active.loading && !active.error && tab === 'orders' && orders.data ? (
        <section
          role="tabpanel"
          id="operations-panel-orders"
          aria-labelledby="operations-tab-orders"
        >
          <Card>
            <CardTitle hint="Сортировка одна: сначала новые. Фильтр применяет сервер.">
              Заказы
            </CardTitle>

            <div className="mb-4">
              <FilterSelect
                label="Состояние"
                value={stage}
                options={stageOptions}
                onChange={(value) => setFilter('stage', value)}
              />
            </div>

            {orders.data.orders.length === 0 ? (
              <EmptyState
                title={stage ? 'По этому фильтру заказов нет' : 'Заказов пока нет'}
                hint={stage
                  ? 'Снимите фильтр — в очереди есть заказы, просто не в этом состоянии.'
                  : 'Ни один покупатель ещё не оформил заказ.'}
              />
            ) : (
              <>
                <div className="hidden md:block">
                  <TableFrame>
                    <caption className="sr-only">
                      Заказы: номер и магазин, состав, сумма, состояние вместе с тем, кто его ждёт,
                      дата создания и ссылка на карточку
                    </caption>
                    {/*
                      Six columns, not eight. The store moved under the
                      reference and the three badges share one column, because
                      eight minimum widths pushed «Открыть» past the right edge
                      at 1280px: the one control on the row ended up behind a
                      horizontal scroll, which is the same as not being there.
                      `rowActionsClipped` in the evidence measurements is what
                      caught it and what keeps it caught.
                    */}
                    <thead>
                      <tr>
                        <Th><span className="block min-w-[8rem]">Заказ</span></Th>
                        <Th><span className="block min-w-[9rem]">Состав</span></Th>
                        <Th align="right"><span className="block min-w-[7rem]">Сумма</span></Th>
                        <Th><span className="block min-w-[10rem]">Состояние</span></Th>
                        <Th align="right"><span className="block min-w-[6rem]">Создан</span></Th>
                        <Th align="right"><span className="block min-w-[5rem]">Действие</span></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.data.orders.map((row) => (
                        <tr key={row.id}>
                          <Td>
                            <div className="font-medium">{row.reference}</div>
                            <div className="muted text-xs">{row.store_name}</div>
                          </Td>
                          <Td>
                            {row.item_name
                              ? <span className="muted">{row.item_name}</span>
                              : <span className="muted">— ({count(row.items)})</span>}
                          </Td>
                          <Td align="right">
                            <span className="whitespace-nowrap">{money(row.total_minor)}</span>
                          </Td>
                          <Td>
                            <div className="flex flex-wrap gap-1">
                              <Badge>{label(ORDER_STATUS, row.stage)}</Badge>
                              {/* «Ожидание завершено» on every finished row is
                                  noise: the stage already says so. The badge
                                  appears only while somebody is still waiting. */}
                              {row.waiting_on !== 'nobody' ? (
                                <Badge tone={waitingTone(row.waiting_on)}>
                                  {label(WAITING_SIDE, row.waiting_on)}
                                </Badge>
                              ) : null}
                              {row.attention !== 'none' ? (
                                <Badge tone={attentionTone(row.attention)}>
                                  {label(OPERATIONS_ATTENTION, row.attention)}
                                </Badge>
                              ) : null}
                            </div>
                          </Td>
                          <Td align="right">
                            <span className="muted text-xs">{when(row.created_at)}</span>
                          </Td>
                          <Td align="right">
                            <Link
                              to={{ pathname: `/operations/orders/${row.id}`, search: params.toString() }}
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

                <ul className="space-y-3 md:hidden">
                  {orders.data.orders.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-[var(--radius-card)] border border-[var(--border-line)] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{row.reference}</p>
                        <Badge>{label(ORDER_STATUS, row.stage)}</Badge>
                      </div>
                      <p className="muted mt-1 text-xs">
                        {row.store_name}{row.item_name ? ` · ${row.item_name}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="tabular-nums text-sm">{money(row.total_minor)}</span>
                        <Badge tone={waitingTone(row.waiting_on)}>
                          {label(WAITING_SIDE, row.waiting_on)}
                        </Badge>
                        {row.attention !== 'none' ? (
                          <Badge tone={attentionTone(row.attention)}>
                            {label(OPERATIONS_ATTENTION, row.attention)}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="muted text-xs">{when(row.created_at)}</span>
                        <Link
                          to={{ pathname: `/operations/orders/${row.id}`, search: params.toString() }}
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
                  aria-label="Страницы заказов"
                >
                  <p className="muted text-xs" aria-live="polite">
                    Показано {count(offset + 1)}–{count(offset + orders.data.orders.length)} из{' '}
                    {count(orders.data.total)}
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
                      disabled={offset + orders.data.orders.length >= orders.data.total}
                      className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm disabled:opacity-40"
                    >
                      Дальше
                    </button>
                  </div>
                </nav>
              </>
            )}

            <p className="muted mt-4 text-xs">
              Имя, телефон и адрес покупателя здесь не показываются и не запрашиваются:
              сервер их не выбирает. Подтверждение, отмена и возврат выполняются продавцом.
            </p>
          </Card>
          <p className="muted mt-4 text-xs">Данные на {exactTime(orders.data.generated_at)}</p>
        </section>
      ) : null}

      {!active.loading && !active.error && tab === 'questions' && questions.data ? (
        <section
          role="tabpanel"
          id="operations-panel-questions"
          aria-labelledby="operations-tab-questions"
        >
          <Card>
            <CardTitle hint="Текст вопроса и ответа остаётся между покупателем и продавцом.">
              Вопросы покупателей
            </CardTitle>

            <div className="mb-4">
              <FilterSelect
                label="Состояние"
                value={status}
                options={statusOptions}
                onChange={(value) => setFilter('status', value)}
              />
            </div>

            {questions.data.questions.length === 0 ? (
              <EmptyState
                title={status ? 'По этому фильтру вопросов нет' : 'Вопросов пока нет'}
                hint={status
                  ? 'Снимите фильтр — в очереди есть вопросы, просто не в этом состоянии.'
                  : 'Агент отвечал сам: ни один разговор не потребовал человека.'}
              />
            ) : (
              <>
                <div className="hidden md:block">
                  <TableFrame>
                    <caption className="sr-only">
                      Вопросы: ссылка и магазин, причина обращения, состояние, кто ждёт и когда создан
                    </caption>
                    {/* Same reason as the orders table: the store moved into the
                        first cell so «Открыть» stays on screen at 1280px. */}
                    <thead>
                      <tr>
                        <Th><span className="block min-w-[11rem]">Обращение</span></Th>
                        <Th><span className="block min-w-[10rem]">Причина</span></Th>
                        <Th><span className="block min-w-[7rem]">Состояние</span></Th>
                        <Th><span className="block min-w-[9rem]">Ожидание</span></Th>
                        <Th align="right"><span className="block min-w-[6rem]">Создан</span></Th>
                        <Th align="right"><span className="block min-w-[5rem]">Действие</span></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.data.questions.map((row) => (
                        <tr key={row.id}>
                          <Td>
                            <div className="font-mono text-xs">{row.id}</div>
                            <div className="muted text-xs">
                              {row.store_name} ·{' '}
                              {row.has_reply
                                ? 'вопрос и ответ есть'
                                : (row.has_question ? 'вопрос есть, ответа нет' : 'текст очищен')}
                            </div>
                          </Td>
                          <Td><span className="muted">{label(QUESTION_REASON, row.reason)}</span></Td>
                          <Td><Badge>{label(HANDOFF_STATUS, row.status)}</Badge></Td>
                          <Td>
                            {row.waiting_on !== 'nobody' ? (
                              <Badge tone={waitingTone(row.waiting_on)}>
                                {label(WAITING_SIDE, row.waiting_on)}
                              </Badge>
                            ) : <span className="muted text-xs">—</span>}
                            {row.attention !== 'none' ? (
                              <div className="mt-1">
                                <Badge tone={attentionTone(row.attention)}>
                                  {label(OPERATIONS_ATTENTION, row.attention)}
                                </Badge>
                              </div>
                            ) : null}
                          </Td>
                          <Td align="right">
                            <span className="muted text-xs">{when(row.created_at)}</span>
                          </Td>
                          <Td align="right">
                            <Link
                              to={{ pathname: `/operations/questions/${row.id}`, search: params.toString() }}
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

                <ul className="space-y-3 md:hidden">
                  {questions.data.questions.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-[var(--radius-card)] border border-[var(--border-line)] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-mono text-xs break-all">{row.id}</p>
                        <Badge>{label(HANDOFF_STATUS, row.status)}</Badge>
                      </div>
                      <p className="muted mt-1 text-xs">
                        {row.store_name} · {label(QUESTION_REASON, row.reason)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {row.waiting_on !== 'nobody' ? (
                          <Badge tone={waitingTone(row.waiting_on)}>
                            {label(WAITING_SIDE, row.waiting_on)}
                          </Badge>
                        ) : null}
                        {row.attention !== 'none' ? (
                          <Badge tone={attentionTone(row.attention)}>
                            {label(OPERATIONS_ATTENTION, row.attention)}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="muted text-xs">{when(row.created_at)}</span>
                        <Link
                          to={{ pathname: `/operations/questions/${row.id}`, search: params.toString() }}
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
                  aria-label="Страницы вопросов"
                >
                  <p className="muted text-xs" aria-live="polite">
                    Показано {count(offset + 1)}–{count(offset + questions.data.questions.length)} из{' '}
                    {count(questions.data.total)}
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
                      disabled={offset + questions.data.questions.length >= questions.data.total}
                      className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm disabled:opacity-40"
                    >
                      Дальше
                    </button>
                  </div>
                </nav>
              </>
            )}

            <p className="muted mt-4 text-xs">
              Текст вопроса и ответа не показывается и не запрашивается: сервер выбирает
              только признак их наличия. Отвечает и закрывает обращение продавец.
            </p>
          </Card>
          <p className="muted mt-4 text-xs">Данные на {exactTime(questions.data.generated_at)}</p>
        </section>
      ) : null}
    </>
  );
}
