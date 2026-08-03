/**
 * Who can sell, and through which door.
 *
 * This screen reads. Suspending a store, disabling a membership and running a
 * binding ceremony are commands that already exist behind confirmations and an
 * audit trail in the previous console, and moving them here without their
 * confirmations would be the whole point of those confirmations lost. So the
 * screen shows state and links to the surface that owns each action.
 *
 * Nothing on it identifies a person: memberships are counted, never listed by
 * identity, and no Telegram id, username or phone number is fetched or shown.
 */
import { adminApi } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { count, exactTime, label, plural, STORE_STATUS, when } from '../lib/text';
import type { OverviewResponse, StoresResponse } from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  DataGap,
  EmptyState,
  ErrorState,
  FlagList,
  Freshness,
  Metric,
  PageHeader,
  StatusStrip,
  TableFrame,
  Td,
  Th,
} from '../components/ui';

export default function Access() {
  const overview = useQuery<OverviewResponse>(() => adminApi.overview(), []);
  const stores = useQuery<StoresResponse>(() => adminApi.stores(25, 0), []);

  if (overview.loading || stores.loading) {
    return (
      <>
        <PageHeader title="Магазины и доступы" />
        <div className="skeleton mb-5 h-20 w-full" />
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => <div key={index} className="skeleton h-24 w-full" />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="skeleton h-64 w-full xl:col-span-2" />
          <div className="skeleton h-64 w-full" />
        </div>
      </>
    );
  }
  if (overview.error || !overview.data) {
    return (
      <>
        <PageHeader title="Магазины и доступы" />
        <Card><ErrorState code={overview.error ?? 'unknown'} onRetry={overview.reload} /></Card>
      </>
    );
  }

  const access = overview.data.access;
  const binding = access.binding;
  // The question this page is asked: can anybody actually run the shop from
  // the app. Zero Telegram memberships means the answer is no, whatever the
  // switches say, and that deserves the top of the screen rather than a tile.
  const reachable = access.telegram_active > 0 && access.seller_read && access.seller_commands;
  const state = binding.challenges_live > 0
    ? {
      tone: 'bad' as const,
      title: 'Открыт код привязки',
      detail: 'Церемония привязки Telegram сейчас активна. Код действует ограниченное время и срабатывает один раз.',
    }
    : reachable
      ? {
        tone: 'good' as const,
        title: 'Кабинет продавца доступен',
        detail: 'Есть активная привязка Telegram, чтение и команды продавца включены.',
      }
      : {
        tone: 'warn' as const,
        title: 'Кабинетом продавца никто не может пользоваться',
        detail: access.telegram_active === 0
          ? 'Ни один Telegram-аккаунт не имеет доступа владельца — привязка не выполнена.'
          : 'Права продавца выключены на уровне конфигурации.',
      };

  return (
    <>
      <PageHeader
        title="Магазины и доступы"
        subtitle="Кто имеет права продавца и каким способом они выданы"
        actions={(
          <Freshness
            fetchedAt={overview.fetchedAt}
            refreshing={overview.refreshing}
            onRefresh={() => { overview.reload(); stores.reload(); }}
          />
        )}
      />

      <StatusStrip tone={state.tone} title={state.title} detail={state.detail} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Активных владельцев" value={count(access.owners_active)} />
        <Metric
          label="Telegram с доступом"
          value={count(access.telegram_active)}
          tone={access.telegram_active === 0 ? 'warn' : 'good'}
          note={access.telegram_active === 0 ? 'кабинет в Mini App недоступен' : undefined}
        />
        <Metric
          label="Отключённые доступы"
          value={count(access.disabled)}
          note="статус disabled, строки не удаляются"
        />
        <Metric
          label="Кодов привязки выдано"
          value={count(binding.challenges_total)}
          note={`${count(binding.challenges_redeemed)} ${plural(binding.challenges_redeemed, 'погашен', 'погашено', 'погашено')}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle hint="Данные из существующего Owner Control Center.">Магазины</CardTitle>
          {stores.error || !stores.data ? (
            <ErrorState code={stores.error ?? 'unknown'} onRetry={stores.reload} />
          ) : stores.data.stores.length === 0 ? (
            <EmptyState title="Магазинов нет" hint="Ни одна организация ещё не открыла витрину." />
          ) : (
            <TableFrame>
              <thead>
                <tr>
                  <Th>Магазин</Th>
                  <Th>Статус</Th>
                  <Th align="right">Карточек</Th>
                  <Th align="right">Заказы</Th>
                  <Th align="right">Вопросы</Th>
                </tr>
              </thead>
              <tbody>
                {stores.data.stores.map((store) => (
                  <tr key={store.id}>
                    <Td>
                      <div className="font-medium">{store.name}</div>
                      {store.updated_at ? (
                        <div className="muted text-xs">изменён {when(store.updated_at)}</div>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={store.status === 'active' ? 'good' : 'bad'}>
                        {label(STORE_STATUS, store.status)}
                      </Badge>
                    </Td>
                    <Td align="right">
                      {store.published_count === undefined ? '—' : count(store.published_count)}
                      {store.product_count === undefined ? null : (
                        <span className="muted"> / {count(store.product_count)}</span>
                      )}
                    </Td>
                    <Td align="right">{store.open_orders === undefined ? '—' : count(store.open_orders)}</Td>
                    <Td align="right">{store.open_handoffs === undefined ? '—' : count(store.open_handoffs)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
          <p className="muted mt-4 text-xs">
            Приостановка и восстановление магазина выполняются в{' '}
            <a className="underline" href="/admin-tools/agents/stores">существующем разделе магазинов</a> —
            там уже есть подтверждение, причина и запись в аудит.
          </p>
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Права продавца</h2>
              <p className="muted mt-1 text-xs">Права проверяет сервер при каждом вызове.</p>
            </div>
            <Badge>Только чтение</Badge>
          </div>
          <FlagList
            items={[
              { label: 'Чтение кабинета', on: access.seller_read, hint: 'sellerRead' },
              { label: 'Команды продавца', on: access.seller_commands, hint: 'sellerCommands' },
            ]}
          />

          <h3 className="mt-5 mb-2 text-sm font-semibold">Привязка Telegram</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span>Глобальный флаг</span>
              <Badge tone={binding.global_flag ? 'warn' : 'neutral'}>
                {binding.global_flag ? 'включён' : 'выключен'}
              </Badge>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Церемония открыта</span>
              <Badge tone={binding.ceremony_open ? 'warn' : 'neutral'}>
                {binding.ceremony_open ? 'да' : 'нет'}
              </Badge>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Действующих кодов</span>
              <span className={`tabular-nums ${binding.challenges_live > 0 ? 'text-[var(--tone-bad)]' : ''}`}>
                {count(binding.challenges_live)}
              </span>
            </li>
          </ul>
          <p className="muted mt-3 text-xs">
            Код выдаётся и погашается только в{' '}
            <a className="underline" href="/admin-tools/agents/stores">карточке магазина</a> и в Mini App
            владельца. Панель показывает состояние и никогда не сам код.
          </p>

          <div className="mt-4">
            <DataGap
              what="Список людей с доступом не показан"
              why="Панель считает доступы, но не выводит идентичности: Telegram ID, username и телефон не запрашиваются."
            />
          </div>
        </Card>
      </div>

      <p className="muted mt-4 text-xs">Данные на {exactTime(overview.data.generated_at)}</p>
    </>
  );
}
