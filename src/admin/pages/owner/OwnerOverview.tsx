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

          <Card data-testid="owner-market-funnel">
            <h2 className="font-display text-base text-white mb-3">Воронка GPTBot Market — сегодня</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="Запуски бота" value={o.funnel.bot_starts}/>
              <StatTile label="Поиски" value={o.funnel.searches}/>
              <StatTile label="Показаны результаты" value={o.funnel.results_shown}/>
              <StatTile label="Без результатов" value={o.funnel.zero_results} tone={o.funnel.zero_results ? 'warning' : 'neutral'}/>
              <StatTile label="Просмотры товаров" value={o.funnel.product_views}/>
              <StatTile label="Начаты заказы" value={o.funnel.order_starts}/>
              <StatTile label="Созданы заказы" value={o.funnel.orders_created}/>
              <StatTile label="Запрошен продавец" value={o.funnel.handoffs_requested}/>
            </div>
          </Card>

          <Card data-testid="owner-telegram-health">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="font-display text-base text-white">Telegram и ответы продавцов</h2>
                <p className="text-white/40 text-xs mt-1">
                  @{data.telegram_bot.username ?? 'не настроен'} · {data.telegram_bot.webhook_endpoint} · {data.telegram_bot.configuration_status}
                </p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="Обновления сегодня" value={o.telegram.updates_today}/>
              <StatTile label="Завершены" value={o.telegram.completed_today}/>
              <StatTile label="Ошибки" value={o.telegram.failed_today + o.telegram.errors_today}
                tone={o.telegram.failed_today + o.telegram.errors_today ? 'danger' : 'neutral'}/>
              <StatTile label="Дубликаты" value={o.telegram.duplicate_updates}/>
              <StatTile label="В обработке" value={o.telegram.pending} tone={o.telegram.pending ? 'warning' : 'neutral'}/>
              <StatTile label="Задержка" value={o.telegram.processing_latency}/>
              <StatTile label="Ответы продавцов" value={o.seller_service.responses_today}/>
              <StatTile label="SLA ответа" value={o.seller_service.response_time}
                tone={o.seller_service.open_over_15m ? 'warning' : 'neutral'}/>
              <StatTile label="Открыты >15 мин" value={o.seller_service.open_over_15m}
                tone={o.seller_service.open_over_15m ? 'danger' : 'neutral'}/>
              <StatTile label="Сбои уведомлений" value={o.seller_service.notification_failures}
                tone={o.seller_service.notification_failures ? 'danger' : 'neutral'}/>
              <StatTile label="Повторы уведомлений" value={o.seller_service.notification_retries}
                tone={o.seller_service.notification_retries ? 'warning' : 'neutral'}/>
            </div>
          </Card>

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
