import { useEffect, useState } from 'react';
import { Badge, Button, Card, Input, Select } from '../../components/ui';
import { OwnerErrorCard, OwnerHeader, OwnerLoadingCard } from '../../components/OwnerControls';
import { ownerApi, type OwnerApiError } from '../../lib/owner-api';
import {
  OWNER_AUDIT_ACTIONS,
  type OwnerAuditAction,
  type OwnerAuditEvent,
} from '../../../shared/owner-control-center';

export default function OwnerAudit() {
  const [events, setEvents] = useState<OwnerAuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState<OwnerAuditAction | 'all'>('all');
  const [actorRole, setActorRole] = useState('all');
  const [actorEmail, setActorEmail] = useState('');
  const [targetId, setTargetId] = useState('');
  const [appliedText, setAppliedText] = useState({ actorEmail: '', targetId: '' });
  const [error, setError] = useState<OwnerApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ownerApi.audit({
      limit: 100,
      ...(action === 'all' ? {} : { action }),
      ...(actorRole === 'all' ? {} : { actorRole }),
      ...(appliedText.actorEmail ? { actorEmail: appliedText.actorEmail } : {}),
      ...(appliedText.targetId ? { targetId: appliedText.targetId } : {}),
    })
      .then((r) => { setEvents(r.events); setTotal(r.total); })
      .catch((e: OwnerApiError) => setError(e))
      .finally(() => setLoading(false));
  }, [action, actorRole, appliedText]);

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="owner-audit">
      <OwnerHeader
        title="Журнал действий владельца"
        subtitle={`Только добавление. Всего записей: ${total}.`}/>
      <OwnerErrorCard error={error}/>
      {loading && <OwnerLoadingCard/>}

      <Card>
        <form
          className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setLoading(true);
            setAppliedText({ actorEmail: actorEmail.trim(), targetId: targetId.trim() });
          }}>
          <div>
            <div className="text-white/40 text-xs mb-1">Действие</div>
            <Select
              value={action}
              onChange={(e) => {
                setError(null);
                setLoading(true);
                setAction(e.target.value as OwnerAuditAction | 'all');
              }}
              data-testid="owner-audit-filter">
              <option value="all">все</option>
              {OWNER_AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </div>
          <div>
            <div className="text-white/40 text-xs mb-1">Роль</div>
            <Select value={actorRole} onChange={(e) => {
              setError(null);
              setLoading(true);
              setActorRole(e.target.value);
            }}>
              <option value="all">все</option>
              <option value="platform_owner">platform_owner</option>
              <option value="support_readonly">support_readonly</option>
            </Select>
          </div>
          <div>
            <div className="text-white/40 text-xs mb-1">Actor email</div>
            <Input value={actorEmail} onChange={(e) => setActorEmail(e.target.value)} placeholder="owner@example.com"/>
          </div>
          <div>
            <div className="text-white/40 text-xs mb-1">Target ID</div>
            <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="store_…"/>
          </div>
          <Button type="submit" variant="ghost" size="sm">Применить</Button>
        </form>
      </Card>

      <Card>
        <ol className="space-y-3 text-sm" data-testid="owner-audit-timeline">
          {events.map((event) => (
            <li key={event.eventId} className="border-l-2 border-white/10 pl-3">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-brand-cyan">{event.action}</code>
                <Badge tone={event.actorRole === 'platform_owner' ? 'success' : 'info'}>
                  {event.actorRole}
                </Badge>
                <span className="text-white/60">{event.reasonCode}</span>
              </div>
              <div className="text-white/40 text-xs mt-1">
                {event.createdAt} · {event.actorEmail} · {event.targetType} {event.targetId}
                {event.orgId && <> · org {event.orgId}</>} · request_id {event.requestId}
              </div>
              {(event.before !== null || event.after !== null) && (
                <pre className="text-white/50 text-[11px] mt-1 whitespace-pre-wrap break-all">
                  {JSON.stringify({ before: event.before, after: event.after })}
                </pre>
              )}
            </li>
          ))}
          {events.length === 0 && <li className="text-white/40">Записей нет</li>}
        </ol>
      </Card>
    </div>
  );
}
