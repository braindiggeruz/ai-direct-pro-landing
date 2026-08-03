/**
 * The owner audit trail, read-only by construction.
 *
 * The table upstream is append-only and there is no endpoint that edits or
 * deletes a row, so there is nothing here to leave out - this screen could not
 * mutate the trail if it wanted to. It is also deliberately separate from the
 * activity feed on the command centre: what the marketplace did and what an
 * operator did to it are different questions, and merging them produces a
 * stream nobody reads.
 *
 * The two filters are the two the endpoint narrows on, and they are sent to it.
 * Nothing is filtered in the browser: a control that sifts the twenty-five rows
 * already downloaded looks identical to one that queries the trail, and the
 * operator only discovers the difference when the event they were looking for
 * was on page two all along. There is no date range and no result filter here
 * because the server has no such column to match on.
 *
 * What is never rendered: request bodies, before/after payloads, idempotency
 * keys, request ids, target and organisation identifiers, and anything from
 * Telegram. Actor is the operator address the server already records against
 * each action, which is the one identity an audit trail exists to carry.
 */
import { useCallback, useState } from 'react';
import { adminApi } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import {
  ACTOR_ROLE,
  ACTOR_ROLE_KEYS,
  AUDIT_ACTION,
  AUDIT_ACTION_KEYS,
  AUDIT_TARGET,
  count,
  exactTime,
  label,
  plural,
  REASON_CODE,
  when,
} from '../lib/text';
import type { AuditEvent, AuditResponse } from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  DataGap,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FilterSelect,
  Freshness,
  PageHeader,
  TableFrame,
  Td,
  Th,
} from '../components/ui';

const ALL = 'all';
const PAGE_SIZE = 25;

/**
 * Actions that took something away. Every one of them has a counterpart that
 * gives it back, so this is not "dangerous" - it is the half of the trail an
 * operator scans for when a seller says they have lost access.
 *
 * The mark is a second signal, never the only one: the action is already
 * spelled out in words in the same cell.
 */
const RESTRICTIVE = new Set(['store.suspend', 'seller.unbind', 'pilot.pause']);

export default function Audit() {
  const [action, setAction] = useState(ALL);
  const [role, setRole] = useState(ALL);
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const { data, error, loading, refreshing, fetchedAt, reload } = useQuery<AuditResponse>(
    () => adminApi.audit(PAGE_SIZE, 0, {
      action: action === ALL ? undefined : action,
      actorRole: role === ALL ? undefined : role,
    }),
    [action, role],
  );

  // A stable identity, or the drawer re-runs its focus effect on every render
  // of this page and drags the caret back to its close button mid-read.
  const closeDrawer = useCallback(() => setSelected(null), []);

  const filtered = action !== ALL || role !== ALL;

  return (
    <>
      <PageHeader
        title="Аудит"
        subtitle="Действия владельца и операторов. Запись только добавляется — изменить или удалить событие нельзя."
        actions={<Freshness fetchedAt={fetchedAt} refreshing={refreshing} onRefresh={reload} />}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label="Действие"
            value={action}
            onChange={setAction}
            options={[
              { value: ALL, label: 'Все действия' },
              ...AUDIT_ACTION_KEYS.map((key) => ({ value: key, label: AUDIT_ACTION[key] })),
            ]}
          />
          <FilterSelect
            label="Кто действовал"
            value={role}
            onChange={setRole}
            options={[
              { value: ALL, label: 'Любая роль' },
              ...ACTOR_ROLE_KEYS.map((key) => ({ value: key, label: ACTOR_ROLE[key] })),
            ]}
          />
          {filtered ? (
            <button
              type="button"
              onClick={() => { setAction(ALL); setRole(ALL); }}
              className="min-h-11 rounded-[var(--radius-control)] border border-[var(--border-line)] px-3 text-sm"
            >
              Сбросить фильтр
            </button>
          ) : null}
        </div>
        <p className="muted mt-3 text-xs">
          Фильтрует сервер. Других полей у журнала нет — период и результат не хранятся,
          поэтому и фильтров по ним здесь нет.
        </p>
      </Card>

      <Card>
        {/*
          The hint names the control that actually opens the drawer. Saying
          "нажмите строку" would point at the one part of the row that is
          deliberately not interactive — see the button below.
        */}
        <CardTitle hint={`Последние ${PAGE_SIZE} событий, новые сверху. Нажмите действие, чтобы раскрыть.`}>
          Журнал действий
        </CardTitle>

        {/* The shape of the answer, not a spinner in an empty box. */}
        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            <div className="skeleton h-8 w-full" />
            {[0, 1, 2, 3, 4].map((index) => <div key={index} className="skeleton h-14 w-full" />)}
          </div>
        ) : null}

        {!loading && (error || !data) ? <ErrorState code={error ?? 'unknown'} onRetry={reload} /> : null}

        {!loading && data && data.events.length === 0 ? (
          <EmptyState
            title={filtered ? 'Под фильтр ничего не попало' : 'Событий нет'}
            hint={filtered
              ? 'Таких действий в журнале ещё не было. Снимите фильтр, чтобы увидеть весь журнал.'
              : 'Ни одного действия владельца ещё не записано.'}
          />
        ) : null}

        {!loading && data && data.events.length > 0 ? (
          <>
            <TableFrame>
              <thead>
                <tr>
                  <Th>Когда</Th>
                  <Th>Действие</Th>
                  <Th>Объект</Th>
                  <Th>Кто</Th>
                  <Th>Причина</Th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((event) => (
                  <tr key={event.event_id}>
                    <Td>
                      <div className="text-sm">{when(event.created_at)}</div>
                      <div className="muted text-xs">{exactTime(event.created_at)}</div>
                    </Td>
                    <Td>
                      {/*
                        The row opens through a button rather than a click
                        handler on the <tr>. A row is not an interactive
                        element: it takes no focus, answers no Enter and is
                        announced as nothing in particular.
                      */}
                      <button
                        type="button"
                        onClick={() => setSelected(event)}
                        className="inline-flex min-h-11 items-center gap-2 text-left text-sm font-medium underline decoration-[var(--border-line)] underline-offset-4"
                      >
                        <span
                          aria-hidden="true"
                          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background: RESTRICTIVE.has(event.action)
                              ? 'var(--tone-bad)'
                              : 'var(--border-line)',
                          }}
                        />
                        {label(AUDIT_ACTION, event.action)}
                      </button>
                    </Td>
                    <Td><span className="muted">{label(AUDIT_TARGET, event.target_type)}</span></Td>
                    <Td>
                      <div className="max-w-[14rem] truncate text-sm">{event.actor_email}</div>
                      <Badge>{label(ACTOR_ROLE, event.actor_role)}</Badge>
                    </Td>
                    <Td>
                      <span className="muted text-sm">
                        {event.reason_code ? label(REASON_CODE, event.reason_code) : '—'}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
            <p className="muted mt-4 text-xs">
              {filtered ? 'По фильтру: ' : 'Всего '}
              {count(data.total)} {plural(data.total, 'событие', 'события', 'событий')}
              {data.total > data.events.length
                ? ` · показаны последние ${count(data.events.length)}`
                : ''}
              . Журнал доступен только для чтения.
            </p>
          </>
        ) : null}
      </Card>

      {selected ? (
        <Drawer title={label(AUDIT_ACTION, selected.action)} onClose={closeDrawer}>
          <dl>
            <Field label="Когда" value={exactTime(selected.created_at)} />
            <Field label="Действие" value={label(AUDIT_ACTION, selected.action)} />
            <Field label="Объект" value={label(AUDIT_TARGET, selected.target_type)} />
            <Field label="Кто" value={selected.actor_email} />
            <Field label="Роль" value={label(ACTOR_ROLE, selected.actor_role)} />
            <Field
              label="Причина"
              value={selected.reason_code ? label(REASON_CODE, selected.reason_code) : 'не указана'}
            />
          </dl>
          <div className="mt-4">
            <DataGap
              what="Идентификаторы и содержимое запроса не показаны"
              why="Строка журнала хранит ещё и идентификатор объекта, ключ идемпотентности и снимок до/после. Панель их не выводит: этого достаточно для расследования в базе и слишком много для экрана."
            />
          </div>
          <p className="muted mt-4 text-xs">
            Событие изменить или удалить нельзя — журнал только дописывается.
          </p>
        </Drawer>
      ) : null}
    </>
  );
}
