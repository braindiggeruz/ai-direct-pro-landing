import { useEffect, useState } from 'react';
import { Card, StatTile } from '../../components/ui';
import {
  MarketplacePlaceholder,
  OwnerErrorCard,
  OwnerHeader,
  OwnerLoadingCard,
  ReadOnlyNotice,
} from '../../components/OwnerControls';
import { ownerApi, type OwnerApiError } from '../../lib/owner-api';
import type { OwnerOverviewResponse } from '../../../shared/owner-control-center';

export default function OwnerOverview() {
  const [data, setData] = useState<OwnerOverviewResponse | null>(null);
  const [error, setError] = useState<OwnerApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ownerApi.overview()
      .then(setData)
      .catch((e: OwnerApiError) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  const o = data?.overview;

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="owner-overview">
      <OwnerHeader
        title="Обзор платформы"
        subtitle="Состояние магазинов, заказов, передач и автоматизации. Только чтение."
        role={data?.actor.role}/>
      <ReadOnlyNotice role={data?.actor.role}/>
      <OwnerErrorCard error={error}/>
      {loading && <OwnerLoadingCard/>}

      {o && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile label="Магазины" value={o.stores.total} testId="owner-stat-stores"/>
            <StatTile label="Активные" value={o.stores.active} tone="success"/>
            <StatTile label="Приостановлены" value={o.stores.suspended} tone={o.stores.suspended ? 'danger' : 'neutral'}/>
            <StatTile label="Продавцы" value={o.sellers}/>
            <StatTile label="Пилот активен" value={o.pilot.active} tone={o.pilot.active ? 'success' : 'neutral'}/>
            <StatTile label="Пилот на паузе" value={o.pilot.paused} tone={o.pilot.paused ? 'warning' : 'neutral'}/>
            <StatTile label="Товары опубликованы" value={`${o.products.published}/${o.products.total}`}/>
            <StatTile label="Черновики на проверке" value={o.drafts.pending_review} tone={o.drafts.pending_review ? 'info' : 'neutral'}/>
            <StatTile label="Заказы сегодня" value={o.orders.today} testId="owner-stat-orders-today"/>
            <StatTile label="Заказы за 7 дней" value={o.orders.last7d}/>
            <StatTile label="Открытые передачи" value={o.handoffs.open} tone={o.handoffs.open ? 'warning' : 'neutral'} testId="owner-stat-open-handoffs"/>
            <StatTile label="Записей аудита" value={o.audit_events}/>
          </div>

          <Card>
            <h2 className="font-display text-base text-white mb-3">Автоматизация</h2>
            <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatTile label="В очереди" value={o.automation.queued}/>
              <StatTile label="Выполняется" value={o.automation.running}/>
              <StatTile label="Ждут повтора" value={o.automation.retry_wait} tone={o.automation.retry_wait ? 'warning' : 'neutral'}/>
              <StatTile label="На проверке" value={o.automation.awaiting_review} tone="info"/>
              <StatTile label="В DLQ" value={o.automation.dead_letter} tone={o.automation.dead_letter ? 'danger' : 'neutral'} testId="owner-stat-dlq"/>
              <StatTile label="Завершены" value={o.automation.completed}/>
            </div>
            <p className="text-white/40 text-xs mt-3">
              Автоматизация может довести задание только до состояния
              <code className="mx-1">awaiting_review</code>. Публикация — отдельное действие
              администратора.
            </p>
          </Card>

          <Card data-testid="owner-runtime-policy">
            <h2 className="font-display text-base text-white mb-3">Политика выполнения</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div><span className="text-white/40">First-party automation:</span> <code>{data.runtime_policy.first_party_automation_enabled ? 'enabled' : 'disabled'}</code></div>
              <div><span className="text-white/40">Путь автоматизации:</span> <code>{data.runtime_policy.first_party_automation_path}</code></div>
              <div><span className="text-white/40">Автопубликация:</span> <code>{data.runtime_policy.auto_publication ? 'enabled' : 'disabled'}</code></div>
            </div>
          </Card>

          <MarketplacePlaceholder/>
        </>
      )}
    </div>
  );
}
