import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bot,
  Check,
  Database,
  Globe,
  Inbox,
  LoaderCircle,
  Megaphone,
  Palette,
  Plus,
  Radar,
  RefreshCw,
  Search,
  SearchX,
  Smartphone,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
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
  type SignalServiceId,
  type SignalTarget,
  type SignalTargetStatus,
} from '../../shared/signal-radar';

/**
 * Signal Radar — the demand side.
 *
 * The page follows the work, not the data model: new requests first (that is
 * what the operator is here for), then the sources that produce them. Three
 * actions per lead, one add-targets box, one refresh button — nothing else.
 * Everything dangerous lives in the worker.
 */

const MODE_LABELS: Record<string, string> = {
  off: 'Выключен',
  discover: 'Только поиск',
  channels: 'Поиск + чтение каналов',
  join: 'Поиск + вступление в группы',
};

const MODE_HINTS: Record<string, string> = {
  off: 'Ничего не ищем и не вступаем.',
  discover: 'Ищем и скорим каналы. Ноль вступлений, ноль риска.',
  channels: 'Читаем публичные каналы без вступления.',
  join: 'Вступаем в группы по квоте, с испытательным сроком.',
};

const STATE_TONES: Record<SignalLeadState, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  new: 'info',
  drafted: 'warning',
  approved: 'success',
  sent: 'success',
  dismissed: 'neutral',
  failed: 'danger',
};

const STATE_DOTS: Record<SignalLeadState, string> = {
  new: 'bg-brand-cyan',
  drafted: 'bg-amber-400',
  approved: 'bg-emerald-400',
  sent: 'bg-emerald-400',
  dismissed: 'bg-white/40',
  failed: 'bg-red-400',
};

const SERVICE_ICONS: Partial<Record<SignalServiceId, LucideIcon>> = {
  ads: Megaphone,
  seo: Search,
  bots: Bot,
  sites: Globe,
  apps: Smartphone,
  design: Palette,
  crm: Database,
};

function ServiceIcon({ service, size = 13 }: { service: SignalServiceId | null; size?: number }) {
  const Icon = service ? SERVICE_ICONS[service] : null;
  if (!Icon) return null;
  return <Icon size={size} className="text-brand-cyan/70" />;
}

/**
 * A curated starter list of verified-live Uzbek channels (checked 2026-09-02)
 * the operator can seed in one tap instead of pasting slugs by hand. Kept here
 * rather than in the shared module so the page stays self-contained.
 */
const STARTER_SLUGS = [
  'uzbekmarketing',
  'makonmarketing',
  'digitaluz',
  'itjobs',
  'vakansiya_elonlar',
  'uzjobsuz',
] as const;

/** Staggered fade-up delay for list items (ms). */
function staggerDelay(index: number, base = 50, step = 40, max = 400): number {
  return Math.min(base + index * step, max);
}

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
  const leadsNewTone = totals && totals.leadsNew > 0 ? 'success' : 'neutral';
  const quotaTone = totals && totals.joinQuotaLeft > 0 ? 'neutral' : 'danger';

  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="signal-radar">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header
        className="flex flex-wrap items-start justify-between gap-4 animate-fade-up"
        style={{ animationDelay: '0ms' }}
      >
        <div className="space-y-2.5">
          <div className="flex items-center gap-3">
            <span className="relative grid place-items-center w-10 h-10 rounded-xl bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/25 shadow-glow">
              <Radar size={20} />
            </span>
            <div className="flex items-baseline gap-2">
              <h1 className="font-display text-2xl text-white tracking-tight">Signal Radar</h1>
              <span className="text-xs text-white/40 font-normal">поиск по спросу</span>
            </div>
          </div>
          <p className="text-sm text-white/55 max-w-2xl leading-relaxed">
            Слушаем Telegram-каналы и группы Узбекистана и показываем людей,
            которые прямо сейчас ищут рекламу, сайт, бота или приложение.
          </p>
          {data && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Badge tone={data.installed ? 'success' : 'warning'}>
                {data.installed ? 'Модуль установлен' : 'Миграция 0057 не установлена'}
              </Badge>
              <span title={MODE_HINTS[data.mode] ?? ''}>
                <Badge tone="info">Режим: {MODE_LABELS[data.mode] ?? data.mode}</Badge>
              </span>
            </div>
          )}
        </div>
        <Button
          variant="secondary"
          onClick={() => void load()}
          disabled={loading}
          data-testid="signal-refresh"
          className="active:scale-95 transition-transform duration-150"
        >
          {loading
            ? <LoaderCircle size={15} className="animate-spin" />
            : <RefreshCw size={15} />}
          <span className="ml-1.5">{loading ? 'Обновляем…' : 'Обновить'}</span>
        </Button>
      </header>

      {/* ── Error banner ───────────────────────────────────────────── */}
      {error && (
        <Card
          className="border-red-500/30 bg-red-500/5 animate-fade-in"
          role="alert"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 text-red-400">
              <Sparkles size={15} />
            </span>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </Card>
      )}

      {/* ── Stats ──────────────────────────────────────────────────── */}
      {totals ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {(
            [
              { label: 'Целей', value: totals.targets, tone: 'neutral', testId: 'signal-stat-targets', delay: 60 },
              { label: 'Под наблюдением', value: totals.watching, tone: 'info', testId: undefined, delay: 100 },
              { label: 'Новых заявок', value: totals.leadsNew, tone: leadsNewTone, testId: 'signal-stat-leads-new', delay: 140 },
              { label: 'Отправлено', value: totals.leadsSent, tone: 'neutral', testId: undefined, delay: 180 },
              { label: 'Квота вступлений', value: totals.joinQuotaLeft, tone: quotaTone, testId: undefined, delay: 220 },
            ] as const
          ).map((s) => (
            <div
              key={s.label}
              className="animate-fade-up"
              style={{ animationDelay: `${s.delay}ms` }}
            >
              <StatTile
                label={s.label}
                value={s.value}
                tone={s.tone}
                testId={s.testId}
              />
            </div>
          ))}
        </div>
      ) : loading ? (
        <StatsSkeleton />
      ) : null}

      {/* ── Not installed notice ───────────────────────────────────── */}
      {!data?.installed && !loading && (
        <Card className="bg-gradient-to-b from-amber-500/5 to-transparent">
          <h2 className="font-display text-base text-white mb-2">Модуль ещё не установлен</h2>
          <p className="text-sm text-white/60">
            Примените миграцию <code className="text-brand-cyan">0057_lead_radar_signal.sql</code> —
            после этого страница начнёт показывать данные. Остальной Lead Radar
            при этом продолжает работать.
          </p>
        </Card>
      )}

      {/* ── Lead Inbox (primary focus) ────────────────────────────── */}
      <LeadInbox
        leads={data?.leads ?? []}
        busyId={busyId}
        onMutate={mutate}
        loading={loading}
      />

      {/* ── Targets ────────────────────────────────────────────────── */}
      <TargetsCard
        targets={data?.targets ?? []}
        busyId={busyId}
        onMutate={mutate}
      />
    </div>
  );
}

/* ============================================================ *
 * LeadInbox — the operator's primary work surface.
 * Every lead is a self-contained card with quote, draft, actions.
 * ============================================================ */

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
        <SectionTitle icon={Inbox} title="Заявки" />
        <InboxSkeleton />
      </Card>
    );
  }

  return (
    <Card
      data-testid="signal-inbox"
      className="bg-gradient-to-b from-white/[0.03] to-transparent"
    >
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <SectionTitle icon={Inbox} title="Заявки" />
        <span className="text-xs text-white/40">
          {leads.length > 0 ? `${leads.length} активных` : 'новые, черновики и одобренные'}
        </span>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          testId="signal-inbox-empty"
          icon={Inbox}
          title="Заявок пока нет"
          text="Добавьте каналы ниже — как только там появится запрос на услугу, он попадёт сюда. Каналы читаются без вступления, так что это ни к чему не обязывает."
        />
      ) : (
        <ul className="space-y-3">
          {leads.map((lead, i) => {
            const draft = drafts[lead.id] ?? lead.draftText ?? '';
            const busy = busyId === lead.id;
            const author = lead.authorHandle ?? lead.authorLabel;
            const initial = author ? author.charAt(0).toUpperCase() : null;
            return (
              <li
                key={lead.id}
                data-testid="signal-lead"
                className="group rounded-2xl border border-white/10 bg-bg-elevated/50 p-4 transition-all duration-200 hover:border-brand-cyan/30 hover:shadow-[0_0_30px_-8px_rgba(47,230,209,0.2)] animate-fade-up"
                style={{ animationDelay: `${staggerDelay(i)}ms` }}
              >
                {/* ── Meta row ── */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge tone="info">
                    <span className="flex items-center gap-1">
                      <ServiceIcon service={lead.service} />
                      {signalServiceLabel(lead.service)}
                    </span>
                  </Badge>
                  <ScoreBadge score={lead.score} />
                  <Badge tone={STATE_TONES[lead.state]}>
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATE_DOTS[lead.state]}`} />
                      {SIGNAL_LEAD_STATE_LABELS[lead.state]}
                    </span>
                  </Badge>
                  {lead.targetSlug && (
                    <a
                      href={signalTargetUrl(lead.targetSlug)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-0.5 text-xs text-brand-cyan hover:text-brand-cyan/80 transition-colors"
                    >
                      {lead.targetTitle ?? lead.targetSlug}
                      <ArrowUpRight size={11} className="opacity-60" />
                    </a>
                  )}
                  <span className="text-xs text-white/35 ml-auto">
                    {new Date(lead.createdAt).toLocaleString('ru-RU')}
                  </span>
                </div>

                {/* ── Quote ── */}
                <blockquote className="text-sm text-white/90 border-l-2 border-brand-cyan/60 pl-3 mb-3 whitespace-pre-wrap bg-brand-blue/5 py-2 pr-3 rounded-r-lg italic leading-relaxed">
                  {lead.quote}
                </blockquote>

                {/* ── Author ── */}
                <div className="flex items-center gap-2 text-xs text-white/50 mb-3">
                  {initial && (
                    <span className="grid place-items-center w-5 h-5 rounded-full bg-brand-violet/15 text-brand-violet text-[10px] font-semibold">
                      {initial}
                    </span>
                  )}
                  <span>
                    {lead.authorHandle ? `@${lead.authorHandle}` : lead.authorLabel ?? 'не указан'}
                  </span>
                </div>

                {/* ── Draft ── */}
                <Textarea
                  rows={3}
                  value={draft}
                  placeholder="Ответ клиенту своими словами…"
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [lead.id]: event.target.value }))}
                  aria-label={`Черновик ответа по заявке ${lead.id}`}
                />

                {/* ── Actions ── */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    size="sm"
                    disabled={busy}
                    data-testid="signal-lead-approve"
                    className="active:scale-95 transition-transform duration-150"
                    onClick={() => onMutate(lead.id, async () => {
                      if (draft.trim()) await api.signalRadarPatchLead(lead.id, { draftText: draft });
                      await api.signalRadarPatchLead(lead.id, { state: 'approved' });
                    })}
                  >
                    <Check size={14} />
                    <span className="ml-1.5">Одобрить</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !draft.trim()}
                    data-testid="signal-lead-draft"
                    className="active:scale-95 transition-transform duration-150"
                    onClick={() => onMutate(lead.id, () => api.signalRadarPatchLead(lead.id, { draftText: draft }))}
                  >
                    Сохранить черновик
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    data-testid="signal-lead-dismiss"
                    className="active:scale-95 transition-transform duration-150"
                    onClick={() => onMutate(lead.id, () => api.signalRadarPatchLead(lead.id, { state: 'dismissed' }))}
                  >
                    <Trash2 size={14} />
                    <span className="ml-1.5">Отклонить</span>
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

/* ============================================================ *
 * TargetsCard — source management (channels & groups).
 * ============================================================ */

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

  const add = async (slugs: string[]) => {
    setNotice(null);
    const result = await api.signalRadarAddTargets(slugs, 'manual');
    setNotice(`Добавлено ${result.added}${result.skipped ? `, уже было ${result.skipped}` : ''}`);
  };

  const onAddParsed = () => {
    if (fresh.length === 0) return;
    void onMutate('add', () => add(fresh).then(() => setRaw('')));
  };

  const onAddStarter = () => {
    const slugs = STARTER_SLUGS.filter((s) => !known.has(s.toLowerCase()));
    if (slugs.length === 0) {
      setNotice('Все стартовые каналы уже добавлены.');
      return;
    }
    void onMutate('add', () => add(slugs));
  };

  return (
    <Card
      data-testid="signal-targets"
      className="bg-gradient-to-b from-white/[0.03] to-transparent"
    >
      <SectionTitle icon={Radar} title="Источники" />
      <p className="text-xs text-white/45 mb-4 leading-relaxed">
        Каналы читаются без вступления. Группы требуют вступления и расходуют
        квоту — в режиме «Только поиск» система их не трогает.
      </p>

      {/* ── Add targets box ── */}
      <div className="mb-4 space-y-2">
        <Textarea
          rows={2}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          placeholder="@tashkent_web, https://t.me/uzb_freelance — по одному на строку или через запятую"
          aria-label="Ссылки на каналы и группы"
          data-testid="signal-add-input"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            disabled={fresh.length === 0 || busyId === 'add'}
            onClick={onAddParsed}
            data-testid="signal-add-submit"
            className="active:scale-95 transition-transform duration-150"
          >
            {busyId === 'add' ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}
            <span className="ml-1.5">
              {busyId === 'add' ? 'Добавляем…' : `Добавить${fresh.length ? ` (${fresh.length})` : ''}`}
            </span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busyId === 'add'}
            onClick={onAddStarter}
            className="active:scale-95 transition-transform duration-150"
          >
            Узбекские каналы (стартовый набор)
          </Button>
          {parsed.length > 0 && (
            <span className="text-xs text-white/45" data-testid="signal-add-parsed">
              распознано: {parsed.map((s) => `@${s}`).join(', ')}
            </span>
          )}
          {notice && (
            <span className="inline-flex items-center gap-1 text-xs text-brand-cyan bg-brand-cyan/5 px-2 py-1 rounded-md">
              <Check size={12} />
              {notice}
            </span>
          )}
        </div>
      </div>

      {/* ── Targets table ── */}
      {targets.length === 0 ? (
        <EmptyState
          testId="signal-targets-empty"
          icon={SearchX}
          title="Источников пока нет"
          text="Вставьте ссылки выше или нажмите «Узбекские каналы» — стартовый набор уже проверен и читается без вступления."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-white/40 border-b border-white/10 bg-bg-surface/80 backdrop-blur-sm">
                <th className="py-2.5 pr-3 pl-3 font-medium">Источник</th>
                <th className="py-2.5 pr-3 font-medium">Тип</th>
                <th className="py-2.5 pr-3 font-medium">Статус</th>
                <th className="py-2.5 pr-3 font-medium">Оценка</th>
                <th className="py-2.5 pr-3 font-medium">Участников</th>
                <th className="py-2.5 pr-3 font-medium">Заявок</th>
                <th className="py-2.5 pr-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {targets.map((target, i) => {
                const busy = busyId === target.id;
                const canWatch = ACTIVE_STATUSES.includes(target.status)
                  && target.status !== 'watching';
                return (
                  <tr
                    key={target.id}
                    data-testid="signal-target"
                    className="border-b border-white/5 transition-colors hover:bg-white/[0.04] even:bg-white/[0.015] animate-fade-up"
                    style={{ animationDelay: `${staggerDelay(i, 30, 25, 300)}ms` }}
                  >
                    <td className="py-2.5 pr-3 pl-3">
                      <a
                        href={target.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-0.5 text-brand-cyan hover:text-brand-cyan/80 transition-colors"
                      >
                        @{target.slug}
                        <ArrowUpRight size={11} className="opacity-50" />
                      </a>
                      {target.title && (
                        <div className="text-xs text-white/40 truncate max-w-[22rem] mt-0.5">
                          {target.title}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-white/70">{SIGNAL_TARGET_KIND_LABELS[target.kind]}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={target.status === 'active' ? 'success' : target.status === 'ignored' ? 'neutral' : 'info'}>
                        {SIGNAL_TARGET_STATUS_LABELS[target.status]}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3"><ScoreBadge score={target.score} /></td>
                    <td className="py-2.5 pr-3 text-white/70">{target.members?.toLocaleString('ru-RU') ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-white/70">{target.leadsSeen}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      {canWatch && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          data-testid="signal-target-watch"
                          className="active:scale-95 transition-transform duration-150"
                          onClick={() => onMutate(target.id, () => api.signalRadarPatchTarget(target.id, { status: 'watching' }))}
                        >
                          Следить
                        </Button>
                      )}
                      {target.status !== 'ignored' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-2 active:scale-95 transition-transform duration-150"
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

/* ============================================================ *
 * Helper components
 * ============================================================ */

/** A small section heading with an icon, kept on one line. */
function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <h2 className="font-display text-base text-white flex items-center gap-2">
      <Icon size={16} className="text-brand-cyan/80" />
      {title}
    </h2>
  );
}

/** A calm, helpful empty state with an icon, instead of a bare one-liner. */
function EmptyState({
  testId, title, text, icon: Icon,
}: {
  testId: string;
  title: string;
  text: string;
  icon?: LucideIcon;
}) {
  return (
    <div
      className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center bg-white/[0.01] bg-gradient-to-b from-white/[0.02] to-transparent"
      data-testid={testId}
    >
      {Icon && (
        <div className="flex justify-center mb-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-white/5 text-white/30">
            <Icon size={20} />
          </span>
        </div>
      )}
      <p className="text-sm font-medium text-white/70">{title}</p>
      <p className="text-xs text-white/50 mt-1 max-w-md mx-auto leading-relaxed">{text}</p>
    </div>
  );
}

/** Skeleton placeholder for stats while loading. */
function StatsSkeleton() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/10 bg-bg-surface p-4 animate-pulse">
          <div className="h-3 w-20 rounded bg-white/10 mb-2" />
          <div className="h-8 w-12 rounded bg-white/10" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton placeholder for inbox while loading. */
function InboxSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 animate-pulse">
          <div className="flex gap-2 mb-3">
            <div className="h-5 w-24 rounded-md bg-white/10" />
            <div className="h-5 w-12 rounded-md bg-white/10" />
            <div className="h-5 w-16 rounded-md bg-white/10" />
          </div>
          <div className="h-4 w-full rounded bg-white/10 mb-2" />
          <div className="h-4 w-2/3 rounded bg-white/10 mb-4" />
          <div className="h-16 w-full rounded-lg bg-white/5" />
        </div>
      ))}
    </div>
  );
}
