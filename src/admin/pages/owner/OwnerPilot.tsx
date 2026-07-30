import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '../../components/ui';
import {
  MarketplacePlaceholder,
  MutationDialog,
  OwnerErrorCard,
  OwnerHeader,
  OwnerLoadingCard,
  ReadOnlyNotice,
} from '../../components/OwnerControls';
import { ownerApi, type OwnerApiError, type OwnerMutationInput } from '../../lib/owner-api';
import type { OwnerPilotRecord, OwnerStoreSummary } from '../../../shared/owner-control-center';

type Pending = { store: OwnerStoreSummary; operation: 'activate' | 'pause' } | null;

export default function OwnerPilot() {
  const [records, setRecords] = useState<OwnerPilotRecord[]>([]);
  const [stores, setStores] = useState<OwnerStoreSummary[]>([]);
  const [target, setTarget] = useState('1-3 verified stores');
  const [role, setRole] = useState<string | undefined>(undefined);
  const [error, setError] = useState<OwnerApiError | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    void ownerApi.pilot({ limit: 50 })
      .then((r) => { setRecords(r.pilot); setTarget(r.r1_target_stores); })
      .catch((e: OwnerApiError) => setError(e))
      .finally(() => setLoading(false));
    void ownerApi.stores({ limit: 50 }).then((r) => setStores(r.stores)).catch(() => undefined);
    void ownerApi.overview().then((r) => setRole(r.actor.role)).catch(() => undefined);
  }, []);

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
      const result = await ownerApi.setPilot(pending.store.storeId, pending.operation, input);
      setToast(`pilot ${pending.operation}: ${result.outcome}`);
      setPending(null);
      refresh();
    } catch (e) {
      setError(e as OwnerApiError);
    } finally {
      setBusy(false);
    }
  };

  const canMutate = role === 'platform_owner';
  const stateOf = (storeId: string) =>
    records.find((r) => r.storeId === storeId)?.state ?? 'inactive';

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="owner-pilot">
      <OwnerHeader
        title="Пилот R1"
        subtitle={`Целевой размер: ${target}. Пилот запускается вручную, отдельным решением.`}
        role={role}/>
      <ReadOnlyNotice role={role}/>
      <OwnerErrorCard error={error}/>
      {loading && <OwnerLoadingCard/>}
      {toast && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <div className="text-emerald-300 text-sm" data-testid="owner-toast">{toast}</div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]" data-testid="owner-pilot-table">
          <thead className="text-white/40 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left py-2">Магазин</th>
              <th className="text-left py-2">Состояние магазина</th>
              <th className="text-left py-2">Пилот</th>
              <th className="text-right py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => {
              const state = stateOf(store.storeId);
              return (
                <tr key={store.storeId} className="border-t border-white/5" data-testid={`owner-pilot-${store.storeId}`}>
                  <td className="py-2">
                    {store.name}
                    <div className="text-white/30 text-xs">{store.storeId}</div>
                  </td>
                  <td className="py-2">
                    <Badge tone={store.status === 'active' ? 'success' : 'danger'}>{store.status}</Badge>
                  </td>
                  <td className="py-2">
                    <Badge tone={state === 'active' ? 'success' : state === 'paused' ? 'warning' : 'neutral'}>
                      {state}
                    </Badge>
                  </td>
                  <td className="py-2 text-right">
                    {canMutate && state !== 'active' && store.status === 'active' && (
                      <Button variant="ghost" size="sm"
                        onClick={() => setPending({ store, operation: 'activate' })}
                        data-testid={`owner-pilot-activate-${store.storeId}`}>
                        Активировать
                      </Button>
                    )}
                    {canMutate && state === 'active' && (
                      <Button variant="ghost" size="sm"
                        onClick={() => setPending({ store, operation: 'pause' })}
                        data-testid={`owner-pilot-pause-${store.storeId}`}>
                        Пауза
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {stores.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-white/40">Магазинов нет</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <MarketplacePlaceholder/>

      {pending && (
        <MutationDialog
          action={pending.operation === 'activate' ? 'pilot.activate' : 'pilot.pause'}
          title={pending.operation === 'activate' ? 'Активировать пилот' : 'Приостановить пилот'}
          targetId={pending.store.storeId}
          targetLabel={`${pending.store.name} (${pending.store.storeId})`}
          effect={pending.operation === 'activate'
            ? 'Магазин войдёт в пилот R1. Состояние самого магазина не меняется.'
            : 'Магазин выйдет из активного пилота. Магазин продолжит работать, если он активен.'}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={apply}/>
      )}
    </div>
  );
}
