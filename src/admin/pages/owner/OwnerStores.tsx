import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Card, Select } from '../../components/ui';
import {
  MutationDialog,
  OwnerErrorCard,
  OwnerHeader,
  OwnerLoadingCard,
  ReadOnlyNotice,
} from '../../components/OwnerControls';
import { ownerApi, type OwnerApiError, type OwnerMutationInput } from '../../lib/owner-api';
import type { OwnerStoreSummary } from '../../../shared/owner-control-center';

type Pending = { store: OwnerStoreSummary; kind: 'suspend' | 'restore' } | null;

export default function OwnerStores() {
  const [stores, setStores] = useState<OwnerStoreSummary[]>([]);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState('all');
  const [pilotState, setPilotState] = useState('all');
  const [error, setError] = useState<OwnerApiError | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    void ownerApi.stores({ status, pilotState, limit: 50 })
      .then((r) => setStores(r.stores))
      .catch((e: OwnerApiError) => setError(e))
      .finally(() => setLoading(false));
    void ownerApi.overview().then((r) => setRole(r.actor.role)).catch(() => undefined);
  }, [status, pilotState]);

  useEffect(fetchData, [fetchData]);

  const refresh = () => {
    setError(null);
    setLoading(true);
    fetchData();
  };

  const apply = async (input: OwnerMutationInput) => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const fn = pending.kind === 'suspend' ? ownerApi.suspendStore : ownerApi.restoreStore;
      const result = await fn(pending.store.storeId, input);
      setToast(`${pending.kind}: ${result.outcome}`);
      setPending(null);
      refresh();
    } catch (e) {
      setError(e as OwnerApiError);
    } finally {
      setBusy(false);
    }
  };

  const canMutate = role === 'platform_owner';

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="owner-stores">
      <OwnerHeader
        title="Магазины и онбординг"
        subtitle="Владение, состояние, объёмы. Содержимое переписок здесь не показывается."
        role={role}/>
      <ReadOnlyNotice role={role}/>
      <OwnerErrorCard error={error}/>
      {loading && <OwnerLoadingCard/>}
      {toast && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <div className="text-emerald-300 text-sm" data-testid="owner-toast">{toast}</div>
        </Card>
      )}

      <Card>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <div className="text-white/40 text-xs mb-1">Состояние магазина</div>
            <Select value={status} onChange={(e) => {
              setError(null);
              setLoading(true);
              setStatus(e.target.value);
            }} data-testid="owner-filter-status">
              <option value="all">все</option>
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="draft">draft</option>
            </Select>
          </div>
          <div>
            <div className="text-white/40 text-xs mb-1">Пилот</div>
            <Select value={pilotState} onChange={(e) => {
              setError(null);
              setLoading(true);
              setPilotState(e.target.value);
            }} data-testid="owner-filter-pilot">
              <option value="all">все</option>
              <option value="inactive">inactive</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]" data-testid="owner-stores-table">
          <thead className="text-white/40 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left py-2">Магазин</th>
              <th className="text-left py-2">Состояние</th>
              <th className="text-left py-2">Онбординг</th>
              <th className="text-left py-2">Пилот</th>
              <th className="text-right py-2">Товары</th>
              <th className="text-right py-2">Заказы</th>
              <th className="text-right py-2">Передачи</th>
              <th className="text-right py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.storeId} className="border-t border-white/5" data-testid={`owner-store-${store.storeId}`}>
                <td className="py-2">
                  <Link to={`/admin-tools/agents/stores/${store.storeId}`} className="text-brand-cyan hover:underline">
                    {store.name}
                  </Link>
                  <div className="text-white/30 text-xs">{store.storeId}</div>
                  <div className="text-white/30 text-xs">
                    Активность: {new Date(store.lastActivityAt).toLocaleString('ru-RU')}
                  </div>
                </td>
                <td className="py-2">
                  <Badge tone={store.status === 'active' ? 'success' : store.status === 'suspended' ? 'danger' : 'neutral'}>
                    {store.status}
                  </Badge>
                </td>
                <td className="py-2">
                  <Badge tone="info">{store.onboardingStatus}</Badge>
                  <div className="text-white/30 text-xs mt-1">seller: {store.sellerStatus}</div>
                </td>
                <td className="py-2">
                  <Badge tone={store.pilotState === 'active' ? 'success' : store.pilotState === 'paused' ? 'warning' : 'neutral'}>
                    {store.pilotState}
                  </Badge>
                </td>
                <td className="py-2 text-right">
                  <div>{store.publishedProducts}/{store.products}</div>
                  <div className="text-white/30 text-xs">в наличии: {store.inStockProducts}</div>
                  <div className="text-white/30 text-xs">
                    каталог: {store.catalogUpdatedAt
                      ? new Date(store.catalogUpdatedAt).toLocaleDateString('ru-RU')
                      : 'нет данных'}
                  </div>
                </td>
                <td className="py-2 text-right">{store.orders}</td>
                <td className="py-2 text-right">
                  <div>{store.openHandoffs}</div>
                  <Badge tone={store.handoffSla === 'breached'
                    ? 'danger'
                    : store.handoffSla === 'due'
                      ? 'warning'
                      : 'neutral'}>
                    SLA: {store.handoffSla}
                  </Badge>
                </td>
                <td className="py-2 text-right">
                  {canMutate && store.status === 'active' && (
                    <Button variant="ghost" size="sm"
                      onClick={() => setPending({ store, kind: 'suspend' })}
                      data-testid={`owner-suspend-${store.storeId}`}>
                      Приостановить
                    </Button>
                  )}
                  {canMutate && store.status === 'suspended' && (
                    <Button variant="ghost" size="sm"
                      onClick={() => setPending({ store, kind: 'restore' })}
                      data-testid={`owner-restore-${store.storeId}`}>
                      Восстановить
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {stores.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-white/40" data-testid="owner-stores-empty">
                Магазинов нет
              </td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {pending && (
        <MutationDialog
          action={pending.kind === 'suspend' ? 'store.suspend' : 'store.restore'}
          title={pending.kind === 'suspend' ? 'Приостановить магазин' : 'Восстановить магазин'}
          targetId={pending.store.storeId}
          targetLabel={`${pending.store.name} (${pending.store.storeId})`}
          effect={pending.kind === 'suspend'
            ? 'Магазин перестанет обслуживать покупателей. Данные и заказы сохраняются.'
            : 'Магазин снова начнёт обслуживать покупателей.'}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={apply}/>
      )}
    </div>
  );
}
