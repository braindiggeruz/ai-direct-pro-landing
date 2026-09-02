import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, ScoreBadge, StatTile, Textarea } from '../components/ui';
import { api } from '../lib/api';
import {
  parseSignalSlugList,
  SIGNAL_LEAD_STATE_LABELS,
  SIGNAL_TARGET_KIND_LABELS,
  SIGNAL_TARGET_STATUS_LABELS,
  signalServiceLabel,
  signalTargetUrl,
  type SignalLead,
  type SignalLeadState,
  type SignalRadarOverview,
  type SignalTarget,
  type SignalTargetStatus,
} from '../../shared/signal-radar';

/**
 * Signal Radar — the demand side.
 *
 * Layout follows the work, not the data model: new requests first (that is the
 * thing the operator is here for), then the sources that produce them. Three
 * actions and no settings panel — everything dangerous lives in the worker.
 */

const MODE_LABELS: Record<string, string> = {
  off: 'Выключен',
  discover: 'Только поиск',
  channels: 'Поиск + чтение каналов',
  join: 'Поиск + вступление в группы',
};

const STATE_TONES: Record<SignalLeadState, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  new: 'info',
  drafted: 'warning',
  approved: 'success',
  sent: 'success',
  dismissed: 'neutral',
  failed: 'danger',
};

export default function SignalRadar() {
  const [data, setData] = useState<SignalRadarOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.signalRadarOverview());
    } catch (e) {
      setError((e as Error).message || 'Не удалось загрузить Signal Radar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const mutate = useCallback(async (
    key: string,
    run: () => Promise<unknown>,
  ) => {
    setBusyId(key);
    setError(null);
    try {
      await run();
      await load();
    } catch (e) {
      setError((e as Error).message || 'Действие не выполнено');
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const totals = data?.totals;

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="signal-radar">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-white">Signal Radar</h1>
          <p className="text-sm text-white/55 mt-1 max-w-2xl">
            Слушаем Telegram-каналы и группы Узбекистана и показываем людей,
            которые прямо сейчас ищут рекламу, сайт, бота или приложение.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Badge tone={data?.installed ? 'success' : 'warning'}>
              {data?.installed ? 'Модуль установлен' : 'Миграция 0057 не установлена'}
            </Badge>
            {data && <Badge tone="info">Режим: {MODE_LABELS[data.mode] ?? data.mode}</Badge>}
          </div>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading} data-testid="signal-refresh">
          {loading ? 'Обновляем…' : 'Обновить'}
        </Button>
      </header>

      {error && (
        <Card className="border-red-500/30" role="alert">
          <p className="text-sm text-red-300">{error}</p>
        </Card>
      )}

      {totals && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatTile label="Целей" value={totals.targets} testId="signal-stat-targets"/>
          <StatTile label="Под наблюдением" value={totals.watching} tone="info"/>
          <StatTile label="Новых заявок" value={totals.leadsNew} tone={totals.leadsNew ? 'success' : 'neutral'} testId="signal-stat-leads-new"/>
          <StatTile label="Отправлено" value={totals.leadsSent}/>
          <StatTile label="Квота вступлений" value={totals.joinQuotaLeft} tone={totals.joinQuotaLeft ? 'neutral' : 'danger'}/>
        </div>
      )}

      {!data?.installed && !loading && (
        <Card>
          <h2 className="font-display text-base text-white mb-2">Модуль ещё не установлен</h2>
          <p className="text-sm text-white/60">
            Примените миграцию <code className="text-brand-cyan">0057_lead_radar_signal.sql</code> —
            после этого страница начнёт показывать данные. Остальной Lead Radar
            при этом продолжает работать.
          </p>
        </Card>
      )}

      <LeadInbox
        leads={data?.leads ?? []}
        busyId={busyId}
        onMutate={mutate}
        loading={loading}
      />

      <TargetsCard
        targets={data?.targets ?? []}
        busyId={busyId}
        onMutate={mutate}
      />
    </div>
  );
}

function LeadInbox({
  leads, busyId, onMutate, loading,
}: {
  leads: SignalLead[];
  busyId: string | null;
  onMutate: (key: string, run: () => Promise<unknown>) => void;
  loading: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (loading && leads.length === 0) {
    return (
      <Card>
        <h2 className="font-display text-base text-white mb-2">Заявки</h2>
        <p className="text-sm text-white/50">Загружаем…</p>
      </Card>
    );
  }

  return (
    <Card data-testid="signal-inbox">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="font-display text-base text-white">Заявки</h2>
        <span className="text-xs text-white/40">новые, черновики и одобренные</span>
      </div>

      {leads.length === 0 ? (
        <p className="text-sm text-white/50" data-testid="signal-inbox-empty">
          Пока ничего. Добавьте каналы ниже — как только там появится запрос на
          услугу, он попадёт сюда.
        </p>
      ) : (
        <ul className="space-y-3">
          {leads.map((lead) => {
            const draft = drafts[lead.id] ?? lead.draftText ?? '';
            const busy = busyId === lead.id;
            return (
              <li
                key={lead.id}
                data-testid="signal-lead"
                className="border border-white/10 rounded-xl p-4 bg-white/[0.02]"
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge tone="info">{signalServiceLabel(lead.service)}</Badge>
                  <ScoreBadge score={lead.score}/>
                  <Badge tone={STATE_TONES[lead.state]}>{SIGNAL_LEAD_STATE_LABELS[lead.state]}</Badge>
                  {lead.targetSlug && (
                    <a
                      href={signalTargetUrl(lead.targetSlug)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-brand-cyan hover:underline"
                    >
                      {lead.targetTitle ?? lead.targetSlug}
                    </a>
                  )}
                  <span className="text-xs text-white/35 ml-auto">
                    {new Date(lead.createdAt).toLocaleString('ru-RU')}
                  </span>
                </div>

                <blockquote className="text-sm text-white/85 border-l-2 border-brand-cyan/50 pl-3 mb-3 whitespace-pre-wrap">
                  {lead.quote}
                </blockquote>

                <div className="text-xs text-white/45 mb-3">
                  Автор: {lead.authorHandle ? `@${lead.authorHandle}` : lead.authorLabel ?? 'не указан'}
                </div>

                <Textarea
                  rows={3}
                  value={draft}
                  placeholder="Ответ клиенту своими словами…"
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [lead.id]: event.target.value }))}
                  aria-label={`Черновик ответа по заявке ${lead.id}`}
                />

                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !draft.trim()}
                    data-testid="signal-lead-draft"
                    onClick={() => onMutate(lead.id, () => api.signalRadarPatchLead(lead.id, { draftText: draft }))}
                  >
                    Сохранить черновик
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    data-testid="signal-lead-approve"
                    onClick={() => onMutate(lead.id, async () => {
                      if (draft.trim()) await api.signalRadarPatchLead(lead.id, { draftText: draft });
                      await api.signalRadarPatchLead(lead.id, { state: 'approved' });
                    })}
                  >
                    Одобрить
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    data-testid="signal-lead-dismiss"
                    onClick={() => onMutate(lead.id, () => api.signalRadarPatchLead(lead.id, { state: 'dismissed' }))}
                  >
                    Отклонить
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const ACTIVE_STATUSES: SignalTargetStatus[] = ['candidate', 'watching', 'probation', 'active'];

function TargetsCard({
  targets, busyId, onMutate,
}: {
  targets: SignalTarget[];
  busyId: string | null;
  onMutate: (key: string, run: () => Promise<unknown>) => void;
}) {
  const [raw, setRaw] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const parsed = useMemo(() => parseSignalSlugList(raw), [raw]);
  const known = useMemo(() => new Set(targets.map((t) => t.slug.toLowerCase())), [targets]);
  const fresh = parsed.filter((slug) => !known.has(slug.toLowerCase()));

  // Routed through onMutate so the button owns its loading state and a failure
  // surfaces in the page-level alert instead of a second, quieter notice.
  const add = async () => {
    setNotice(null);
    const result = await api.signalRadarAddTargets(fresh, 'manual');
    setNotice(`Добавлено ${result.added}${result.skipped ? `, уже было ${result.skipped}` : ''}`);
    setRaw('');
  };

  return (
    <Card data-testid="signal-targets">
      <h2 className="font-display text-base text-white mb-1">Источники</h2>
      <p className="text-xs text-white/45 mb-4">
        Каналы читаются без вступления. Группы требуют вступления и расходуют
        квоту — в режиме «Только поиск» система их не трогает.
      </p>

      <div className="mb-4">
        <Textarea
          rows={2}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          placeholder="@tashkent_web, https://t.me/uzb_freelance — по одному на строку или через запятую"
          aria-label="Ссылки на каналы и группы"
          data-testid="signal-add-input"
        />
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <Button
            size="sm"
            disabled={fresh.length === 0 || busyId === 'add'}
            onClick={() => void onMutate('add', add)}
            data-testid="signal-add-submit"
          >
            {busyId === 'add' ? 'Добавляем…' : `Добавить${fresh.length ? ` (${fresh.length})` : ''}`}
          </Button>
          {parsed.length > 0 && (
            <span className="text-xs text-white/45" data-testid="signal-add-parsed">
              распознано: {parsed.map((s) => `@${s}`).join(', ')}
            </span>
          )}
          {notice && <span className="text-xs text-brand-cyan">{notice}</span>}
        </div>
      </div>

      {targets.length === 0 ? (
        <p className="text-sm text-white/50" data-testid="signal-targets-empty">
          Источников пока нет. Вставьте ссылки выше.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-white/40 border-b border-white/10">
                <th className="py-2 pr-3 font-medium">Источник</th>
                <th className="py-2 pr-3 font-medium">Тип</th>
                <th className="py-2 pr-3 font-medium">Статус</th>
                <th className="py-2 pr-3 font-medium">Оценка</th>
                <th className="py-2 pr-3 font-medium">Участников</th>
                <th className="py-2 pr-3 font-medium">Заявок</th>
                <th className="py-2 font-medium"/>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => {
                const busy = busyId === target.id;
                const canWatch = ACTIVE_STATUSES.includes(target.status)
                  && target.status !== 'watching';
                return (
                  <tr key={target.id} data-testid="signal-target" className="border-b border-white/5">
                    <td className="py-2.5 pr-3">
                      <a
                        href={target.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-brand-cyan hover:underline"
                      >
                        @{target.slug}
                      </a>
                      {target.title && <div className="text-xs text-white/40 truncate max-w-[22rem]">{target.title}</div>}
                    </td>
                    <td className="py-2.5 pr-3 text-white/70">{SIGNAL_TARGET_KIND_LABELS[target.kind]}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={target.status === 'active' ? 'success' : target.status === 'ignored' ? 'neutral' : 'info'}>
                        {SIGNAL_TARGET_STATUS_LABELS[target.status]}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3"><ScoreBadge score={target.score}/></td>
                    <td className="py-2.5 pr-3 text-white/70">{target.members?.toLocaleString('ru-RU') ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-white/70">{target.leadsSeen}</td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {canWatch && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          data-testid="signal-target-watch"
                          onClick={() => onMutate(target.id, () => api.signalRadarPatchTarget(target.id, { status: 'watching' }))}
                        >
                          Следить
                        </Button>
                      )}
                      {target.status !== 'ignored' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-2"
                          disabled={busy}
                          data-testid="signal-target-ignore"
                          onClick={() => onMutate(target.id, () => api.signalRadarPatchTarget(target.id, { status: 'ignored' }))}
                        >
                          Пропустить
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
