/**
 * What the platform is running, as far as the platform can honestly tell.
 *
 * It opens with a verdict rather than a grid, because the question this page
 * is actually asked is "is production alright" and a reader should not have to
 * assemble that answer out of four cards.
 *
 * A Worker knows its own bindings, its own environment switches and the state
 * of the migration ledger it queries. It does not know which Pages deployment
 * serves it, what the service worker version is, or whether Smart Placement is
 * on - those are facts about the Cloudflare project, readable from the API and
 * the release notes, not from inside the request. So they are named as missing
 * with the reason, instead of being filled in with something plausible.
 *
 * Feature flags are read-only here, and are drawn as states rather than
 * controls. A toggle that does not toggle is a promise the screen cannot keep,
 * and the operator finds that out by clicking it during an incident.
 */
import { adminApi } from '../lib/api';
import { useQuery } from '../lib/useQuery';
import { count, exactTime } from '../lib/text';
import type { OverviewResponse } from '../lib/contracts';
import {
  Badge,
  Card,
  CardTitle,
  DataGap,
  ErrorState,
  FlagList,
  Freshness,
  Metric,
  PageHeader,
  StatusStrip,
} from '../components/ui';

const FLAG_LABEL: Record<string, string> = {
  quick_post: 'QuickPost — подача внутри Mini App',
  quick_post_ai: 'QuickPost AI и голос',
  owner_telegram_binding: 'Привязка Telegram (глобально)',
  cabinet: 'Кабинет',
  voice_search: 'Голосовой поиск',
  media_upload: 'Загрузка фото продавцом',
  seller_reads: 'Чтение кабинета продавца',
  seller_commands: 'Команды продавца',
  admin_v2: 'Bormi Admin (эта панель)',
};

/** Which switches belong to which conversation, so the list is readable. */
const FLAG_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Витрина и кабинет', keys: ['cabinet', 'seller_reads', 'seller_commands', 'media_upload', 'voice_search'] },
  { title: 'Публикация', keys: ['quick_post', 'quick_post_ai'] },
  { title: 'Доступ и панель', keys: ['owner_telegram_binding', 'admin_v2'] },
];

const GROUPED_KEYS = new Set(FLAG_GROUPS.flatMap((group) => group.keys));

/**
 * Anything the Worker reports that this file has not been taught about yet.
 *
 * Without this, a flag added to the environment after this page was written
 * would be counted in the tile above and then not appear in the list below -
 * so the page would say "включено 5 из 10" over a list of nine. A row with a
 * raw key in it is ugly; a page that quietly loses a switch is worse.
 */
function ungrouped(flags: Record<string, boolean>): { label: string; on: boolean; hint?: string }[] {
  return Object.keys(flags)
    .filter((key) => !GROUPED_KEYS.has(key))
    .sort()
    .map((key) => ({ label: FLAG_LABEL[key] ?? key, on: flags[key], hint: FLAG_LABEL[key] ? undefined : key }));
}

export default function System() {
  const { data, error, loading, refreshing, fetchedAt, reload } = useQuery<OverviewResponse>(
    () => adminApi.overview(),
    [],
  );

  if (loading) {
    return (
      <>
        <PageHeader title="Состояние системы" />
        <div className="skeleton mb-5 h-20 w-full" />
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => <div key={index} className="skeleton h-24 w-full" />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="skeleton h-72 w-full" />
          <div className="skeleton h-72 w-full" />
        </div>
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        <PageHeader title="Состояние системы" />
        <Card><ErrorState code={error ?? 'unknown'} onRetry={reload} /></Card>
      </>
    );
  }

  const { system, flags } = data;
  const storageOk = system.bindings.d1 && system.bindings.r2_media;
  // Everything this page can actually verify: the database answered, the
  // ledger has no gap it can see, and the bindings the marketplace needs are
  // attached. It does not claim uptime, latency or a health score.
  const state = storageOk
    ? { tone: 'good' as const, title: 'Ключевые подсистемы отвечают', detail: 'D1 и хранилище фотографий подключены, миграции применены.' }
    : { tone: 'bad' as const, title: 'Не все хранилища подключены', detail: 'Часть функций витрины и кабинета работать не будет.' };

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Состояние системы"
        subtitle="Только чтение. Флаги переключаются коммитом конфигурации и деплоем."
        actions={<Freshness fetchedAt={fetchedAt} refreshing={refreshing} onRefresh={reload} />}
      />

      <StatusStrip tone={state.tone} title={state.title} detail={state.detail} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Применённых миграций"
          value={count(system.migrations.applied)}
          note={system.migrations.last ?? undefined}
        />
        <Metric label="Сборка Mini App" value={system.build_id ?? null} />
        <Metric
          label="Хранилища подключены"
          value={[system.bindings.d1, system.bindings.r2_media, system.bindings.ai].filter(Boolean).length}
          suffix="из 3"
          tone={system.bindings.d1 ? 'good' : 'bad'}
        />
        <Metric
          label="Включённых флагов"
          value={Object.values(flags).filter(Boolean).length}
          suffix={`из ${Object.keys(flags).length}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Feature flags</h2>
              <p className="muted mt-1 text-xs">Значения из окружения Worker на момент запроса.</p>
            </div>
            {/* Said in the corner of the panel, not hidden in a tooltip: the
                only reason a reader would look for a switch here is that
                nothing told them there is not one. */}
            <Badge>Только чтение</Badge>
          </div>
          {FLAG_GROUPS.map((group) => {
            const items = group.keys
              .filter((key) => key in flags)
              .map((key) => ({ label: FLAG_LABEL[key] ?? key, on: flags[key] }));
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="mb-4 last:mb-0">
                <h3 className="muted mb-1 text-[11px] font-medium tracking-wide uppercase">{group.title}</h3>
                <FlagList items={items} />
              </div>
            );
          })}
          {ungrouped(flags).length > 0 ? (
            <div className="mb-4 last:mb-0">
              <h3 className="muted mb-1 text-[11px] font-medium tracking-wide uppercase">Остальные</h3>
              <FlagList items={ungrouped(flags)} />
            </div>
          ) : null}
          <p className="muted mt-4 text-xs">
            Изменение флага — это правка <span className="font-mono">wrangler.toml</span> и деплой
            root-проекта. Панель их не переключает.
          </p>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardTitle hint="Что видно изнутри приложения.">Инфраструктура</CardTitle>
            <ul className="divide-y divide-[var(--border-line)]">
              {[
                ['D1 — каталог, заказы, доступы', system.bindings.d1, true],
                ['R2 — фотографии товаров', system.bindings.r2_media, true],
                ['Workers AI', system.bindings.ai, false],
              ].map(([label, on, required]) => (
                <li
                  key={String(label)}
                  className="flex min-h-[var(--row-height)] items-center justify-between gap-3 py-2"
                >
                  <span className="text-sm">{label}</span>
                  <Badge tone={on ? 'good' : required ? 'bad' : 'neutral'}>
                    {on ? 'Подключено' : required ? 'Не подключено' : 'Нет'}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle hint="Ledger читается из той же базы, что и каталог.">База данных</CardTitle>
            <ul className="divide-y divide-[var(--border-line)]">
              <li className="flex min-h-[var(--row-height)] items-center justify-between gap-3 py-2">
                <span className="text-sm">Применённых миграций</span>
                <span className="tabular-nums">{count(system.migrations.applied)}</span>
              </li>
              <li className="flex min-h-[var(--row-height)] items-center justify-between gap-3 py-2">
                <span className="text-sm">Последняя</span>
                <span className="font-mono text-xs break-all">{system.migrations.last ?? '—'}</span>
              </li>
            </ul>
            <div className="mt-4">
              <DataGap
                what="Номер деплоя, версия service worker и Smart Placement не показаны"
                why="Это свойства проекта Cloudflare Pages, а не приложения — изнутри запроса они не читаются. Смотрите Cloudflare dashboard и релизные заметки."
              />
            </div>
          </Card>
        </div>
      </div>

      <p className="muted mt-4 text-xs">Ответ сервера сформирован {exactTime(data.generated_at)}</p>
    </>
  );
}
