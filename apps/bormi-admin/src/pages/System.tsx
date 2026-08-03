/**
 * What the platform is running, as far as the platform can honestly tell.
 *
 * A Worker knows its own bindings, its own environment switches and the state
 * of the migration ledger it queries. It does not know which Pages deployment
 * serves it, what the service worker version is, or whether Smart Placement is
 * on - those are facts about the Cloudflare project, readable from the API and
 * the release notes, not from inside the request. So they are named as missing
 * with the reason, instead of being filled in with something plausible.
 *
 * Feature flags are read-only here. Turning one on is a configuration commit
 * and a deploy, and a panel that flips them from a browser would be a panel
 * that can change production without leaving a trace of what changed.
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
  Metric,
  PageHeader,
  Skeleton,
  Switchboard,
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

export default function System() {
  const { data, error, loading, reload } = useQuery<OverviewResponse>(() => adminApi.overview(), []);

  if (loading) {
    return (
      <>
        <PageHeader title="Состояние системы" />
        <Skeleton rows={4} />
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

  return (
    <>
      <PageHeader
        title="Состояние системы"
        subtitle="Только чтение. Флаги переключаются коммитом конфигурации и деплоем."
      />

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
          <CardTitle hint="Значения из окружения Worker на момент запроса.">Feature flags</CardTitle>
          <Switchboard
            items={Object.entries(flags).map(([key, on]) => ({
              label: FLAG_LABEL[key] ?? key,
              on,
            }))}
          />
          <p className="muted mt-3 text-xs">
            Изменение флага — это правка <span className="font-mono">wrangler.toml</span> и деплой
            root-проекта. Панель их не переключает.
          </p>
        </Card>

        <Card>
          <CardTitle hint="Что видно изнутри приложения, а что — нет.">Инфраструктура</CardTitle>
          <ul className="mb-4 space-y-2 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span>D1 — каталог и заказы</span>
              <Badge tone={system.bindings.d1 ? 'good' : 'bad'}>
                {system.bindings.d1 ? 'подключено' : 'нет'}
              </Badge>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>R2 — фотографии товаров</span>
              <Badge tone={system.bindings.r2_media ? 'good' : 'warn'}>
                {system.bindings.r2_media ? 'подключено' : 'нет'}
              </Badge>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Workers AI</span>
              <Badge tone={system.bindings.ai ? 'good' : 'neutral'}>
                {system.bindings.ai ? 'подключено' : 'нет'}
              </Badge>
            </li>
          </ul>
          <DataGap
            what="Номер деплоя, версия service worker и Smart Placement не показаны"
            why="Это свойства проекта Cloudflare Pages, а не приложения — изнутри запроса они не читаются. Смотрите Cloudflare dashboard и релизные заметки."
          />
        </Card>
      </div>

      <p className="muted mt-4 text-xs">Данные на {exactTime(data.generated_at)}</p>
    </>
  );
}
