/**
 * Жалобы — what buyers reported, and what was done about it.
 *
 * The projection carries no reporter identity, no session reference and no
 * report note, so there is nothing on this screen that identifies the person
 * who filed. A moderator acts on what was reported, not on who reported it.
 *
 * Closing a report is deliberately not a verdict on the listing. Resolving one
 * records that it was handled; whether the listing is restricted or removed is
 * a separate, separately audited decision made where the photographs are.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { adminApi, AdminApiError, runReportResolution } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import {
  count,
  exactTime,
  label,
  MODERATION_ERROR,
  MODERATION_REASON,
  MODERATION_STATE,
  REPORT_MODERATION_ACTION,
  REPORT_REASON,
  REPORT_STATUS,
  when,
} from '../lib/text';
import type {
  ReportResolution,
  ReportRow,
  ReportsResponse,
} from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  Drawer,
  EmptyState,
  ErrorState,
  Freshness,
  PageHeader,
  StatusStrip,
  TableFrame,
  Td,
  Th,
} from '../components/ui';
import { DiscreteTabs, type TabOption } from '../components/premium';
import { moderationTone } from './Moderation';

const PAGE_SIZE = 25;

const RESOLUTIONS: {
  key: ReportResolution;
  label: string;
  question: string;
  detail: string;
  tone: 'accent' | 'bad';
}[] = [
  {
    key: 'resolve',
    label: 'Удовлетворить',
    question: 'Удовлетворить жалобу?',
    detail: 'Жалоба будет отмечена как обоснованная и закрыта. Само объявление это '
      + 'не меняет — ограничение или снятие принимается отдельно, в карточке объявления.',
    tone: 'accent',
  },
  {
    key: 'dismiss',
    label: 'Отклонить',
    question: 'Отклонить жалобу?',
    detail: 'Жалоба будет закрыта как необоснованная. Объявление остаётся в том '
      + 'состоянии, в котором находится сейчас.',
    tone: 'bad',
  },
];

/** The two states a report can still be moved out of. */
function isOpen(report: ReportRow): boolean {
  return report.status === 'open' || report.status === 'triaged';
}

function Resolver({
  report,
  onDone,
}: {
  report: ReportRow;
  onDone: () => void;
}) {
  const [open, setOpen] = useState<ReportResolution | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptKey, setAttemptKey] = useState('');

  const active = RESOLUTIONS.find((entry) => entry.key === open) ?? null;

  function start(resolution: ReportResolution): void {
    setOpen(resolution);
    setReason('');
    setError(null);
    // One key per logical attempt: a retry replays rather than closing twice.
    setAttemptKey(`rep-${report.id}-${resolution}-${report.version}-${crypto.randomUUID()}`);
  }

  async function run(): Promise<void> {
    if (!active || pending) return;
    setPending(true);
    setError(null);
    try {
      await runReportResolution(report.id, {
        resolution: active.key,
        reasonCode: reason || null,
        idempotencyKey: attemptKey,
        expectedVersion: report.version,
      });
      setOpen(null);
      // Re-read: the version moved, and so may the rest of the queue.
      onDone();
    } catch (failure) {
      setError(failure instanceof AdminApiError ? failure.code : 'network_error');
      if (failure instanceof AdminApiError && failure.status === 409) onDone();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {RESOLUTIONS.map((resolution) => (
          <button
            key={resolution.key}
            type="button"
            onClick={() => start(resolution.key)}
            className={`min-h-11 rounded-[var(--radius-control)] border px-3 text-sm ${
              resolution.tone === 'bad'
                ? 'border-[var(--tone-bad)] text-[var(--tone-bad)]'
                : 'border-[var(--border-line)]'
            }`}
          >
            {resolution.label}
          </button>
        ))}
      </div>

      {error && !active ? (
        <p className="mt-2 text-right text-xs text-[var(--tone-bad)]">
          {label(MODERATION_ERROR, error)}
        </p>
      ) : null}

      {active ? (
        <Drawer title={active.question} onClose={() => { setOpen(null); setPending(false); }}>
          <p className="text-sm">{active.detail}</p>

          <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--border-line)] p-3">
            <p className="muted text-xs">Жалоба</p>
            <p className="mt-1 text-sm">{label(REPORT_REASON, report.reason_code)}</p>
            <p className="muted mt-1 text-xs">
              На объявление «{report.listing_name}» · {when(report.created_at)}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-1">
            <label className="muted text-xs font-medium" htmlFor="report-reason">
              Причина решения (необязательно)
            </label>
            <select
              id="report-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] bg-[var(--surface-paper)] px-3 text-sm"
            >
              <option value="">Без причины</option>
              {Object.entries(MODERATION_REASON).map(([value, text]) => (
                <option key={value} value={value}>{text}</option>
              ))}
            </select>
            <p className="muted mt-1 text-xs">
              Причина попадает в аудит. Свободного текста нет — только закрытый список.
            </p>
          </div>

          <div className="mt-3 rounded-[var(--radius-control)] border border-[var(--border-line)] p-3">
            <p className="muted text-xs">Что изменится</p>
            <p className="mt-1 text-sm">
              {label(REPORT_STATUS, report.status)} →{' '}
              {label(REPORT_STATUS, active.key === 'resolve' ? 'resolved' : 'dismissed')}
            </p>
            <p className="muted mt-1 text-xs">
              Версия {count(report.version)} → {count(report.version + 1)} · состояние
              объявления не меняется
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void run(); }}
              disabled={pending}
              className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] px-4 text-sm disabled:opacity-40"
            >
              {pending ? 'Применяем…' : active.label}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(null); setPending(false); }}
              disabled={pending}
              className="min-h-11 rounded-[var(--radius-control)] px-4 text-sm underline disabled:opacity-40"
            >
              Отмена
            </button>
          </div>
          {error ? (
            <p className="mt-3 text-sm text-[var(--tone-bad)]">
              {label(MODERATION_ERROR, error)}
            </p>
          ) : null}
        </Drawer>
      ) : null}
    </>
  );
}

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const offset = Number(params.get('offset') ?? 0) || 0;

  const key = useMemo(() => `${status}:${offset}`, [status, offset]);
  const queue = useQuery<ReportsResponse>(
    () => adminApi.reports(PAGE_SIZE, offset, status),
    [key],
  );

  function setStatus(next: string): void {
    setParams((current) => {
      const params_ = new URLSearchParams(current);
      if (next && next !== 'open') params_.set('status', next); else params_.delete('status');
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
        <PageHeader title="Жалобы" />
        <div className="skeleton mb-4 h-20 w-full" />
        <div className="skeleton h-96 w-full" />
      </>
    );
  }
  if (queue.error || !queue.data) {
    return (
      <>
        <PageHeader title="Жалобы" />
        <Card><ErrorState code={queue.error ?? 'unknown'} onRetry={queue.reload} /></Card>
      </>
    );
  }

  const data = queue.data;
  const rows = data.reports;
  const shown = offset + rows.length;
  const readOnly = data.actor.role !== 'platform_owner';
  // The endpoint returns a page, not a total, so the next control is offered
  // when the page came back full rather than against a count nobody sent.
  const mayHaveMore = rows.length === PAGE_SIZE;

  return (
    <>
      <PageHeader
        eyebrow="Модерация"
        title="Жалобы"
        subtitle={readOnly
          ? 'Что покупатели сообщили об объявлениях. У вашей роли только чтение.'
          : 'Что покупатели сообщили об объявлениях. Закрытие жалобы не меняет объявление.'}
        actions={(
          <Freshness
            fetchedAt={queue.fetchedAt}
            refreshing={queue.refreshing}
            onRefresh={queue.reload}
          />
        )}
        /* The report states the server takes, plus `all`. No counts: the
           reports endpoint returns a page and a total for the state it was
           asked about, and it does not report the other states - a number
           invented for the tabs would be the one kind of lie this console
           does not tell. */
        filters={(
          <DiscreteTabs
            label="Фильтр по состоянию жалобы"
            controls="reports-queue"
            value={status}
            onChange={setStatus}
            options={[
              ...Object.entries(REPORT_STATUS).map(([value, text]): TabOption<string> => ({
                value,
                label: text,
              })),
              { value: 'all', label: 'Все' },
            ]}
          />
        )}
      />

      <StatusStrip
        tone="good"
        title="Кто подал жалобу — не показывается"
        detail="Ни личность подавшего, ни его текст не входят в этот ответ сервера. Модератор действует по причине из закрытого списка."
      />

      <Card>
        <div id="reports-queue" role="tabpanel" tabIndex={-1} aria-label="Очередь жалоб">
        <CardTitle hint={`Страница по ${PAGE_SIZE} жалоб. Порядок — от самых давних.`}>Очередь жалоб</CardTitle>

        {rows.length === 0 ? (
          status === 'open' ? (
            <EmptyState
              title="Открытых жалоб нет"
              hint="Покупатели ни на что не пожаловались. Это нормальное состояние, а не ошибка загрузки."
            />
          ) : (
            <EmptyState
              title="В этом состоянии жалоб нет"
              hint="Выберите другое состояние."
            />
          )
        ) : (
          <>
            <div className="hidden md:block">
              <TableFrame>
                <caption className="sr-only">
                  Жалобы покупателей: объявление, причина, состояние жалобы,
                  состояние объявления, дата и действия
                </caption>
                <thead>
                  <tr>
                    <Th><span className="block min-w-[14rem]">Объявление</span></Th>
                    <Th><span className="block min-w-[11rem]">Причина</span></Th>
                    <Th><span className="block min-w-[8rem]">Жалоба</span></Th>
                    <Th><span className="block min-w-[9rem]">Объявление</span></Th>
                    <Th align="right"><span className="block min-w-[7rem]">Подана</span></Th>
                    <Th align="right"><span className="block min-w-[12rem]">Действие</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((report) => (
                    <tr key={report.id}>
                      <Td>
                        <Link
                          to={`/moderation/${report.product_id}`}
                          className="font-medium underline"
                        >
                          {report.listing_name}
                        </Link>
                        {report.moderation_action && report.moderation_action !== 'none' ? (
                          <div className="muted text-xs">
                            {label(REPORT_MODERATION_ACTION, report.moderation_action)}
                          </div>
                        ) : null}
                      </Td>
                      <Td><span className="muted">{label(REPORT_REASON, report.reason_code)}</span></Td>
                      <Td>
                        <Badge tone={isOpen(report) ? 'warn' : 'neutral'}>
                          {label(REPORT_STATUS, report.status)}
                        </Badge>
                      </Td>
                      <Td>
                        {report.listing_state ? (
                          <Badge tone={moderationTone(report.listing_state)}>
                            {label(MODERATION_STATE, report.listing_state)}
                          </Badge>
                        ) : <span className="muted text-xs">—</span>}
                      </Td>
                      <Td align="right">
                        <span className="muted text-xs">{when(report.created_at)}</span>
                      </Td>
                      <Td align="right">
                        {readOnly || !isOpen(report) ? (
                          <span className="muted text-xs">
                            {readOnly ? 'только чтение' : 'закрыта'}
                          </span>
                        ) : (
                          <Resolver report={report} onDone={queue.reload} />
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
            </div>

            <ul className="space-y-3 md:hidden">
              {rows.map((report) => (
                <li
                  key={report.id}
                  className="rounded-[var(--radius-card)] border border-[var(--border-line)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to={`/moderation/${report.product_id}`}
                      className="min-w-0 text-sm font-medium underline"
                    >
                      {report.listing_name}
                    </Link>
                    <Badge tone={isOpen(report) ? 'warn' : 'neutral'}>
                      {label(REPORT_STATUS, report.status)}
                    </Badge>
                  </div>
                  <p className="muted mt-1 text-xs">{label(REPORT_REASON, report.reason_code)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {report.listing_state ? (
                      <Badge tone={moderationTone(report.listing_state)}>
                        {label(MODERATION_STATE, report.listing_state)}
                      </Badge>
                    ) : null}
                    <span className="muted text-xs">{when(report.created_at)}</span>
                  </div>
                  {readOnly || !isOpen(report) ? null : (
                    <div className="mt-3">
                      <Resolver report={report} onDone={queue.reload} />
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <nav
              className="mt-4 flex flex-wrap items-center justify-between gap-3"
              aria-label="Страницы жалоб"
            >
              <p className="muted text-xs" aria-live="polite">
                Показано {count(offset + 1)}–{count(shown)}
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
                  disabled={!mayHaveMore}
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
