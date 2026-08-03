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
 * What is never rendered: request bodies, before/after payloads, tokens,
 * challenge codes and anything from Telegram. Actor is shown as the operator
 * address the server already records against each action.
 */
import { adminApi } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { AUDIT_ACTION, AUDIT_TARGET, exactTime, label, REASON_CODE, when } from '../lib/text';
import type { AuditResponse } from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  TableFrame,
  Td,
  Th,
} from '../components/ui';

export default function Audit() {
  const { data, error, loading, reload } = useQuery<AuditResponse>(() => adminApi.audit(25, 0), []);

  return (
    <>
      <PageHeader
        title="Аудит"
        subtitle="Действия владельца и операторов. Запись только добавляется — изменить или удалить событие нельзя."
      />
      <Card>
        <CardTitle hint="Последние 25 событий, новые сверху.">Журнал действий</CardTitle>
        {loading ? <Skeleton rows={5} /> : null}
        {!loading && (error || !data) ? <ErrorState code={error ?? 'unknown'} onRetry={reload} /> : null}
        {!loading && data && data.events.length === 0 ? (
          <EmptyState
            title="Событий нет"
            hint="Ни одного действия владельца ещё не записано."
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
                    <Td><span className="font-medium">{label(AUDIT_ACTION, event.action)}</span></Td>
                    <Td><span className="muted">{label(AUDIT_TARGET, event.target_type)}</span></Td>
                    <Td>
                      <div className="max-w-[14rem] truncate text-sm">{event.actor_email}</div>
                      <Badge>{event.actor_role}</Badge>
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
              Всего событий: {data.total}. Журнал доступен только для чтения.
            </p>
          </>
        ) : null}
      </Card>
    </>
  );
}
