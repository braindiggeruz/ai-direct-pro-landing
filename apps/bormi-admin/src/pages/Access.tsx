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
 *
 * One correction runs through the whole screen. The verdict used to read
 * «Кабинетом продавца никто не может пользоваться», which was true of exactly
 * one thing and read as true of the marketplace. Telegram binding grants the
 * *store* cabinet. A private classified seller gets their authority from the
 * verified Market identity and never needs a store membership at all, so a
 * marketplace with no binding at all can still be full of private sellers
 * working normally. Every sentence here now names the store it is about.
 */
import { adminApi } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { count, exactTime, label, plural, STORE_STATUS, when } from '../lib/text';
import type { OverviewResponse, StoresResponse } from '../lib/contracts';
import {
  Badge,
  Card,
  DataGap,
  EmptyState,
  ErrorState,
  Freshness,
  TableFrame,
  Td,
  Th,
} from '../components/ui';
import {
  Bento,
  BentoCard,
  BentoHead,
  DomainDivider,
  ScreenHeader,
  StatusRow,
  TONE_SOFT,
  cn,
  type Tone,
} from '../components/premium';

/** Above this many storefronts the cards stop being denser than a table. */
const TABLE_AT = 4;

export default function Access() {
  const overview = useQuery<OverviewResponse>(() => adminApi.overview(), []);
  const stores = useQuery<StoresResponse>(() => adminApi.stores(25, 0), []);

  if (overview.loading || stores.loading) {
    return (
      <>
        <ScreenHeader eyebrow="Продавцы" title="Магазины и доступы" />
        <div className="skeleton mb-4 h-36 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => <div key={index} className="skeleton h-28 w-full" />)}
        </div>
      </>
    );
  }
  if (overview.error || !overview.data) {
    return (
      <>
        <ScreenHeader eyebrow="Продавцы" title="Магазины и доступы" />
        <Card><ErrorState code={overview.error ?? 'unknown'} onRetry={overview.reload} /></Card>
      </>
    );
  }

  const access = overview.data.access;
  const binding = access.binding;
  const list = stores.data?.stores ?? [];
  // The screen is about store access, so the verdict names the store it is
  // about. With one storefront that is its name; with several it is a count,
  // because "GPTBot Market Test Store" in a sentence about four shops is worse
  // than no name at all.
  const storeName = list.length === 1 ? list[0].name : null;
  const storeSubject = storeName ?? (list.length === 0 ? 'магазина' : `магазинов (${list.length})`);

  const reachable = access.telegram_active > 0 && access.seller_read && access.seller_commands;

  const state: { tone: Tone; title: string; detail: string; scope: string } =
    binding.challenges_live > 0
      ? {
        tone: 'bad',
        title: 'Открыт код привязки',
        detail:
          'Церемония привязки Telegram сейчас активна. Код действует ограниченное время и срабатывает один раз.',
        scope: 'Пока код открыт, его нужно либо погасить, либо дождаться истечения.',
      }
      : reachable
        ? {
          tone: 'good',
          title: `Кабинет магазина доступен${storeName ? `: ${storeName}` : ''}`,
          detail: 'Есть активная привязка Telegram, чтение и команды продавца включены.',
          scope: 'Частные продавцы работают независимо от этой привязки.',
        }
        : {
          tone: 'warn',
          // Not «никто не может пользоваться». The thing without access is the
          // store cabinet, and naming it is the difference between a fact and
          // an alarm about the whole marketplace.
          title: `У ${storeName ? `магазина ${storeName}` : storeSubject} нет Telegram-доступа продавца`,
          detail: access.telegram_active === 0
            ? 'Ни один Telegram-аккаунт не привязан как владелец магазина, поэтому кабинет магазина в Mini App не открывается.'
            : 'Права продавца выключены на уровне конфигурации, поэтому кабинет магазина не отвечает на команды.',
          scope:
            'Частные продавцы работают независимо: их права выдаёт проверенная Market-идентичность, а не членство в магазине. Предупреждение относится только к кабинету магазина.',
        };

  return (
    <>
      <ScreenHeader
        eyebrow="Продавцы"
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

      {/*
        The summary. One card with the verdict and the mass to match it, and
        three narrower ones beside it - rather than the four identical tiles
        this screen used to open with, which gave a number nobody needed the
        same weight as the one thing that was wrong.
      */}
      <Bento>
        <BentoCard span={6} emphasis="lead" tone={state.tone} index={0}>
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={cn('mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full', TONE_SOFT[state.tone])}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {state.tone === 'good' ? <path d="M5 12.5l4.5 4.5L19 7" /> : <><path d="M12 8v5.5M12 17v.5" /><circle cx="12" cy="12" r="9" /></>}
              </svg>
            </span>
            <div className="min-w-0">
              <p className="t-eyebrow">Доступ к кабинету магазина</p>
              <h2 className="t-section mt-1">{state.title}</h2>
              <p className="t-meta mt-2">{state.detail}</p>
              {/* The sentence that keeps a private seller from being read as a
                  broken store seller. */}
              <p
                className={cn('mt-3 rounded-[var(--admin-radius-sm)] px-3 py-2 text-xs', TONE_SOFT.neutral)}
                data-testid="access-scope-note"
              >
                {state.scope}
              </p>
            </div>
          </div>
        </BentoCard>

        <BentoCard span={3} index={1}>
          <p className="t-eyebrow">Telegram-доступ</p>
          <p className={cn('t-metric mt-2', access.telegram_active === 0 ? 'text-[var(--admin-warn)]' : 'text-[var(--admin-good)]')}>
            {count(access.telegram_active)}
          </p>
          <p className="t-meta mt-1.5">
            {access.telegram_active === 0
              ? 'кабинет магазина в Mini App не открывается'
              : `${plural(access.telegram_active, 'аккаунт', 'аккаунта', 'аккаунтов')} с правами владельца`}
          </p>
          <p className="muted mt-3 border-t border-[var(--admin-border)] pt-3 text-xs">
            Активных владельцев: <span className="tabular-nums">{count(access.owners_active)}</span>
          </p>
        </BentoCard>

        <BentoCard span={3} index={2}>
          <p className="t-eyebrow">Коды привязки</p>
          <p className={cn('t-metric mt-2', binding.challenges_live > 0 ? 'text-[var(--admin-danger)]' : undefined)}>
            {count(binding.challenges_live)}
          </p>
          <p className="t-meta mt-1.5">
            {binding.challenges_live > 0 ? 'действует прямо сейчас' : 'открытых кодов нет'}
          </p>
          <p className="muted mt-3 border-t border-[var(--admin-border)] pt-3 text-xs">
            Выдано {count(binding.challenges_total)} · погашено {count(binding.challenges_redeemed)}
          </p>
        </BentoCard>
      </Bento>

      <DomainDivider
        title="Магазины"
        hint={list.length > 0 ? `${count(list.length)} ${plural(list.length, 'витрина', 'витрины', 'витрин')}` : undefined}
      />

      {stores.error || !stores.data ? (
        <Card><ErrorState code={stores.error ?? 'unknown'} onRetry={stores.reload} /></Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            title="Магазинов нет"
            hint="Ни одна организация ещё не открыла витрину. Частные объявления это не блокирует — они не привязаны к магазину."
          />
        </Card>
      ) : list.length < TABLE_AT ? (
        /*
          One or two storefronts do not need a table. A table of one row spends
          half the screen on a header for a single record and still says less
          about it than a card does - which is exactly what this page did
          before, with a grid of column titles above one shop.
        */
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((store, index) => (
            <BentoCard key={store.id} span={6} index={index} interactive>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="t-section truncate">{store.name}</h3>
                  {store.updated_at ? (
                    <p className="t-meta mt-1">изменён {when(store.updated_at)}</p>
                  ) : null}
                </div>
                <Badge tone={store.status === 'active' ? 'good' : 'bad'}>
                  {label(STORE_STATUS, store.status)}
                </Badge>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--admin-border)] pt-3">
                <div>
                  <dt className="t-eyebrow">Карточки</dt>
                  <dd className="t-metric-sm mt-1">
                    {store.published_count === undefined ? '—' : count(store.published_count)}
                    {store.product_count === undefined ? null : (
                      <span className="muted text-sm font-normal"> / {count(store.product_count)}</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="t-eyebrow">Заказы</dt>
                  <dd className="t-metric-sm mt-1">
                    {store.open_orders === undefined ? '—' : count(store.open_orders)}
                  </dd>
                </div>
                <div>
                  <dt className="t-eyebrow">Вопросы</dt>
                  <dd className="t-metric-sm mt-1">
                    {store.open_handoffs === undefined ? '—' : count(store.open_handoffs)}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--admin-border)] pt-3">
                <span className="t-meta">Доступ продавца</span>
                <Badge tone={reachable ? 'good' : 'warn'}>
                  {reachable ? 'Telegram привязан' : 'нет привязки'}
                </Badge>
              </div>
            </BentoCard>
          ))}
        </div>
      ) : (
        <Card>
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
              {list.map((store) => (
                <tr key={store.id} className="transition-colors hover:bg-[var(--admin-surface-subtle)]">
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
        </Card>
      )}

      <p className="muted mt-3 text-xs">
        Приостановка и восстановление магазина выполняются в{' '}
        <a className="underline" href="/admin-tools/agents/stores">существующем разделе магазинов</a> —
        там уже есть подтверждение, причина и запись в аудит.
      </p>

      <DomainDivider title="Права и церемония" hint="Сервер проверяет их заново при каждом вызове" />

      {/*
        The rights panel, as three groups of states rather than one column of
        12px prose. A person checking whether the console can remove a listing
        right now wants to scan a column, not read a paragraph and infer one.
      */}
      <Bento>
        <BentoCard span={4} index={0}>
          <BentoHead title="Чтение" hint="Что кабинет магазина может показать" />
          <ul className="divide-y divide-[var(--admin-border)]">
            <StatusRow
              tone={access.seller_read ? 'good' : 'bad'}
              title="Чтение кабинета"
              detail="sellerRead"
              value={<Badge tone={access.seller_read ? 'good' : 'neutral'}>{access.seller_read ? 'включено' : 'выключено'}</Badge>}
            />
            <StatusRow
              tone={access.memberships > 0 ? 'good' : 'neutral'}
              title="Членства"
              detail="строки не удаляются, а отключаются"
              value={<span className="tabular-nums">{count(access.memberships)}</span>}
            />
            <StatusRow
              tone={access.disabled > 0 ? 'warn' : 'neutral'}
              title="Отключённые доступы"
              detail="статус disabled"
              value={<span className="tabular-nums">{count(access.disabled)}</span>}
            />
          </ul>
        </BentoCard>

        <BentoCard span={4} index={1}>
          <BentoHead title="Команды" hint="Что кабинет магазина может изменить" />
          <ul className="divide-y divide-[var(--admin-border)]">
            <StatusRow
              tone={access.seller_commands ? 'good' : 'bad'}
              title="Команды продавца"
              detail="sellerCommands"
              value={<Badge tone={access.seller_commands ? 'good' : 'neutral'}>{access.seller_commands ? 'включено' : 'выключено'}</Badge>}
            />
            <StatusRow
              tone="neutral"
              title="Эта панель"
              detail="Access — экран только для чтения"
              value={<Badge>Только чтение</Badge>}
            />
          </ul>
          <p className="muted mt-3 text-xs">
            Флаг — это видимость, а не право. Каждый вызов заново проверяется на сервере.
          </p>
        </BentoCard>

        <BentoCard span={4} index={2}>
          <BentoHead title="Церемония привязки" hint="Состояние, но никогда не сам код" />
          <ul className="divide-y divide-[var(--admin-border)]">
            <StatusRow
              tone={binding.global_flag ? 'warn' : 'neutral'}
              title="Глобальный флаг"
              value={<Badge tone={binding.global_flag ? 'warn' : 'neutral'}>{binding.global_flag ? 'включён' : 'выключен'}</Badge>}
            />
            <StatusRow
              tone={binding.ceremony_open ? 'warn' : 'neutral'}
              title="Церемония открыта"
              value={<Badge tone={binding.ceremony_open ? 'warn' : 'neutral'}>{binding.ceremony_open ? 'да' : 'нет'}</Badge>}
            />
            <StatusRow
              tone={binding.challenges_live > 0 ? 'bad' : 'neutral'}
              title="Действующих кодов"
              value={(
                <span className={cn('tabular-nums', binding.challenges_live > 0 && 'text-[var(--admin-danger)]')}>
                  {count(binding.challenges_live)}
                </span>
              )}
            />
          </ul>

          {/*
            Where the action lives, rather than a button that would have to be
            disabled. This panel cannot open a ceremony - the command does not
            exist here - and drawing one that does nothing is how an operator
            learns during an incident that a control was decorative.
          */}
          <p className="muted mt-3 text-xs">
            {binding.global_flag
              ? 'Код выдаётся и погашается в '
              : 'Чтобы выдать код, сначала включите флаг привязки в конфигурации, затем откройте '}
            <a className="underline" href="/admin-tools/agents/stores">карточку магазина</a>
            {' '}и Mini App владельца.
          </p>
        </BentoCard>
      </Bento>

      <div className="mt-4">
        <DataGap
          what="Список людей с доступом не показан"
          why="Панель считает доступы, но не выводит идентичности: Telegram ID, username и телефон не запрашиваются."
        />
      </div>

      <p className="muted mt-4 text-xs">Данные на {exactTime(overview.data.generated_at)}</p>
    </>
  );
}
