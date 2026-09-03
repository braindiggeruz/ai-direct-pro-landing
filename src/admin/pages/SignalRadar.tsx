import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowUpRight,
  Ban,
  Bot,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Database,
  Globe,
  Inbox,
  LoaderCircle,
  Megaphone,
  MessagesSquare,
  Palette,
  Play,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  Search,
  SearchX,
  ShieldAlert,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Timer,
  Trash2,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Badge, Button, Card, Input, ScoreBadge, StatTile, Textarea } from '../components/ui';
import { api } from '../lib/api';
import {
  detectSignalLanguage,
  parseSignalSlugList,
  SIGNAL_AUTOJOIN_MODES,
  SIGNAL_CAN_WRITE_LABELS,
  SIGNAL_CHAT_ACTIVITY_LABELS,
  SIGNAL_CHAT_STATUS_LABELS,
  SIGNAL_LANGUAGE_LABELS,
  SIGNAL_LEAD_STATE_LABELS,
  SIGNAL_TARGET_KIND_LABELS,
  SIGNAL_TARGET_STATUS_LABELS,
  signalServiceLabel,
  signalTargetUrl,
  type SignalAutojoinMode,
  type SignalCanWrite,
  type SignalChat,
  type SignalChatsResponse,
  type SignalChatStatus,
  type SignalLead,
  type SignalLeadState,
  type SignalModeState,
  type SignalRadarOverview,
  type SignalRadarPost,
  type SignalScanStatus,
  type SignalServiceId,
  type SignalTarget,
  type SignalTargetStatus,
} from '../../shared/signal-radar';
import { signalHandoffFromLead, signalHandoffQuery } from '../../shared/signal-handoff';
import { pluralRu } from '../../shared/next-actions';

/**
 * Signal Radar — the demand side.
 *
 * The page follows the work, not the data model: new requests first (that is
 * what the operator is here for), then the sources that produce them. Three
 * actions per lead, one add-targets box, one refresh button — nothing else.
 * Everything dangerous lives in the worker.
 *
 * Layout rule, learned the hard way: the inbox comes before the controls. The
 * operator opens this page to answer people, and a setup panel that pushes the
 * only live request below the fold turns a working radar into a number on a
 * tile. Every stat that counts something also scrolls to it.
 */

/** Section anchors the stat tiles jump to. */
const ANCHOR = {
  inbox: 'signal-section-inbox',
  sources: 'signal-section-sources',
  chats: 'signal-section-chats',
} as const;

/** Scrolls to a section and marks it, so the eye lands on the right card. */
function scrollToSection(id: string) {
  const node = document.getElementById(id);
  if (!node) return;
  node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  node.classList.remove('ring-2', 'ring-brand-cyan/40');
  // Two frames: the class must be absent for a paint before it can animate in.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    node.classList.add('ring-2', 'ring-brand-cyan/40');
    window.setTimeout(() => node.classList.remove('ring-2', 'ring-brand-cyan/40'), 1400);
  }));
}

const MODE_LABELS: Record<SignalAutojoinMode, string> = {
  off: 'Выключен',
  discover: 'Поиск',
  channels: 'Каналы',
  join: 'Вступление',
};

const MODE_HINTS: Record<SignalAutojoinMode, string> = {
  off: 'Полный стоп: не ищем, не читаем, не вступаем. Всё делает оператор.',
  discover: 'Ищем новые каналы, скорим их и читаем. Ноль вступлений, ноль риска. Приоритет — разведка новых источников.',
  channels: 'То же, что «Поиск», но приоритет отдаётся уже отслеживаемым каналам: сначала дочитываем их, потом ищем новые.',
  join: 'Плюс вступление в группы — по квоте, только днём и с испытательным сроком. Самый рискованный режим.',
};

const MODE_SOURCE_LABELS: Record<SignalModeState['source'], string> = {
  setting: 'задан из админки',
  env: 'из конфига деплоя',
  default: 'по умолчанию',
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

/**
 * Milliseconds left until `target`. Ticks once a second and only while there
 * is something to count down, so an idle page schedules no timers at all.
 */
function useCountdown(target: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  if (!target) return 0;
  const at = Date.parse(target);
  return Number.isFinite(at) ? Math.max(0, at - now) : 0;
}

/** 214000 -> "3:34". Used for the manual-scan cooldown. */
function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function SignalRadar() {
  const [data, setData] = useState<SignalRadarOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();

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
      // A rejected action must not leave a stale success message above it.
      setNotice(null);
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
              <span
                title={data.modeState
                  ? `${MODE_HINTS[data.modeState.mode]} (${MODE_SOURCE_LABELS[data.modeState.source]})`
                  : ''}
              >
                <Badge tone={data.modeState?.mode === 'off' ? 'warning' : 'info'}>
                  Режим: {MODE_LABELS[data.modeState?.mode ?? 'discover']}
                </Badge>
              </span>
              {!data.runtime.enabled && (
                <Badge tone="danger">Радар выключен в конфиге</Badge>
              )}
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

      {/* ── Success notice ─────────────────────────────────────────── */}
      {notice && !error && (
        <Card
          className="border-brand-cyan/25 bg-brand-cyan/[0.06] animate-fade-in"
          role="status"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 text-brand-cyan"><Check size={15} /></span>
            <p className="text-sm text-white/80">{notice}</p>
          </div>
        </Card>
      )}

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
              {
                label: 'Новых заявок',
                value: totals.leadsNew,
                tone: leadsNewTone,
                testId: 'signal-stat-leads-new',
                delay: 60,
                open: () => scrollToSection(ANCHOR.inbox),
                hint: totals.leadsNew > 0
                  ? `показать ${totals.leadsNew} ${pluralRu(totals.leadsNew, ['заявку', 'заявки', 'заявок'])}`
                  : 'к заявкам',
              },
              {
                label: 'Целей',
                value: totals.targets,
                tone: 'neutral',
                testId: 'signal-stat-targets',
                delay: 100,
                open: () => scrollToSection(ANCHOR.sources),
                hint: 'к источникам',
              },
              { label: 'Под наблюдением', value: totals.watching, tone: 'info', testId: undefined, delay: 140 },
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
                hint={'hint' in s ? s.hint : undefined}
                onOpen={'open' in s ? s.open : undefined}
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

      {/* ── Lead Inbox — first, because it is the reason anyone is here ─ */}
      <div id={ANCHOR.inbox} className="scroll-mt-6 rounded-2xl transition-shadow duration-300">
        <LeadInbox
          leads={data?.leads ?? []}
          busyId={busyId}
          onMutate={mutate}
          loading={loading}
          onHandoff={(lead) => navigate(
            `/admin-tools/lead-radar?${signalHandoffQuery(signalHandoffFromLead(lead))}`,
          )}
        />
      </div>

      {/* ── Chats — rooms we could actually write in ──────────────── */}
      <div id={ANCHOR.chats} className="scroll-mt-6 rounded-2xl transition-shadow duration-300">
        <Collapsible
          icon={MessagesSquare}
          title="Чаты"
          subtitle="группы, где можно написать — а не каналы"
          defaultOpen
        >
          <ChatsCard installed={data?.installed === true} />
        </Collapsible>
      </div>

      {/* ── Controls: mode switch + manual scan ────────────────────── */}
      <Collapsible
        icon={Zap}
        title="Управление"
        subtitle={`Режим «${MODE_LABELS[data?.modeState?.mode ?? 'discover']}» · крон каждые 15 минут`}
        defaultOpen
      >
        {data ? (
          <ControlCard
            modeState={data.modeState}
            scan={data.scan}
            runtime={data.runtime}
            busyId={busyId}
            onMutate={mutate}
            onNotice={setNotice}
          />
        ) : (
          <p className="text-sm text-white/45">Загружаем состояние радара…</p>
        )}
      </Collapsible>

      {/* ── Targets ────────────────────────────────────────────────── */}
      <div id={ANCHOR.sources} className="scroll-mt-6 rounded-2xl transition-shadow duration-300">
        <Collapsible
          icon={Radar}
          title="Источники"
          subtitle={data ? `${data.targets.length} в базе` : undefined}
        >
          <TargetsCard
            targets={data?.targets ?? []}
            busyId={busyId}
            onMutate={mutate}
          />
        </Collapsible>
      </div>
    </div>
  );
}

/* ============================================================ *
 * Collapsible — keeps setup out of the way of the work.
 *
 * The inbox is the product; the mode switch and the source table are
 * maintenance. They still have to be one click away, because a radar nobody
 * can retune is a radar nobody keeps.
 * ============================================================ */

function Collapsible({
  icon: Icon, title, subtitle, children, defaultOpen = false,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      data-testid={`signal-section-${title.toLowerCase()}`}
      className="rounded-2xl border border-white/10 bg-bg-surface/40 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/50"
      >
        <Icon size={16} className="text-brand-cyan/80 shrink-0" />
        <span className="font-display text-base text-white">{title}</span>
        {subtitle && <span className="text-xs text-white/40 truncate">{subtitle}</span>}
        <span className="ml-auto text-white/40 shrink-0">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

/* ============================================================ *
 * LeadInbox — the operator's primary work surface.
 * Every lead is a self-contained card with quote, draft, actions.
 * ============================================================ */

function LeadInbox({
  leads, busyId, onMutate, loading, onHandoff,
}: {
  leads: SignalLead[];
  busyId: string | null;
  onMutate: (key: string, run: () => Promise<unknown>) => void;
  loading: boolean;
  onHandoff: (lead: SignalLead) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (loading && leads.length === 0) {
    // The same test id as the loaded state: an element that vanishes while
    // loading is an element no test and no operator can rely on.
    return (
      <Card data-testid="signal-inbox">
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1.5">
        <SectionTitle icon={Inbox} title="Заявки" />
        <span className="text-xs text-white/40">
          {leads.length > 0
            ? `${leads.length} ${pluralRu(leads.length, ['активная', 'активные', 'активных'])}`
            : 'новые, черновики и одобренные'}
        </span>
      </div>
      {leads.length > 0 && (
        <p className="text-xs text-white/40 mb-4 leading-relaxed">
          «Подробнее» открывает весь пост и причины, по которым он попал сюда.
          «Найти компании» передаёт заявку в Lead Radar.
        </p>
      )}

      {leads.length === 0 ? (
        <EmptyState
          testId="signal-inbox-empty"
          icon={Inbox}
          title="Заявок пока нет"
          text="Добавьте каналы ниже — как только там появится запрос на услугу, он попадёт сюда. Каналы читаются без вступления, так что это ни к чему не обязывает."
        />
      ) : (
        <ul className="space-y-3">
          {leads.map((lead, i) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              index={i}
              busy={busyId === lead.id}
              draft={drafts[lead.id] ?? lead.draftText ?? ''}
              onDraft={(value) => setDrafts((prev) => ({ ...prev, [lead.id]: value }))}
              onMutate={onMutate}
              onHandoff={onHandoff}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ============================================================ *
 * LeadCard — one request, expandable in place.
 *
 * Collapsed it is a decision: service, score, quote, three buttons. Expanded
 * it is the evidence behind the decision — the whole post, why triage scored
 * it the way it did, and the link back to the source. The raw text is fetched
 * only when the operator asks, because the inbox itself must stay one query.
 * ============================================================ */

function LeadCard({
  lead, index, busy, draft, onDraft, onMutate, onHandoff,
}: {
  lead: SignalLead;
  index: number;
  busy: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onMutate: (key: string, run: () => Promise<unknown>) => void;
  onHandoff: (lead: SignalLead) => void;
}) {
  const [open, setOpen] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // `undefined` means "not asked yet"; `null` means "retention ate it".
  const [post, setPost] = useState<SignalRadarPost | null | undefined>(undefined);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (post !== undefined) return;
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const detail = await api.signalRadarLead(lead.id);
      setPost(detail.post);
    } catch (e) {
      setDetailError((e as Error).message || 'Не удалось загрузить текст заявки');
    } finally {
      setLoadingDetail(false);
    }
  };

  const author = lead.authorHandle ?? lead.authorLabel;
  const initial = author ? author.charAt(0).toUpperCase() : null;
  const language = detectSignalLanguage(lead.quote);

  return (
    <li
      data-testid="signal-lead"
      data-lead-state={lead.state}
      className={[
        'group rounded-2xl border bg-bg-elevated/50 p-4 transition-all duration-200 animate-fade-up',
        open
          ? 'border-brand-cyan/35 shadow-[0_0_40px_-12px_rgba(47,230,209,0.35)]'
          : 'border-white/10 hover:border-brand-cyan/30 hover:shadow-[0_0_30px_-8px_rgba(47,230,209,0.2)]',
      ].join(' ')}
      style={{ animationDelay: `${staggerDelay(index)}ms` }}
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
        {language !== 'unknown' && (
          // Derived from the text, not stored: there is no language column.
          <span
            className="text-[11px] text-white/40"
            title="Язык определён по тексту заявки — подсказка, на каком языке отвечать"
            data-testid="signal-lead-language"
          >
            {SIGNAL_LANGUAGE_LABELS[language]}
          </span>
        )}
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
        onChange={(event) => onDraft(event.target.value)}
        aria-label={`Черновик ответа по заявке ${lead.id}`}
        data-testid="signal-lead-draft-input"
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
          data-testid="signal-lead-save-draft"
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
        {lead.state !== 'new' && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            data-testid="signal-lead-reopen"
            className="active:scale-95 transition-transform duration-150"
            onClick={() => onMutate(lead.id, () => api.signalRadarPatchLead(lead.id, { state: 'new' }))}
          >
            <RotateCcw size={14} />
            <span className="ml-1.5">Вернуть в новые</span>
          </Button>
        )}
        {/* Handoff to Lead Radar. A URL and nothing else: no company is
            created and no message is sent by clicking this. */}
        <Button
          size="sm"
          variant="ghost"
          data-testid="signal-lead-handoff"
          title="Открыть Lead Radar с готовым оффером под эту услугу"
          className="active:scale-95 transition-transform duration-150"
          onClick={() => onHandoff(lead)}
        >
          <Building2 size={14} />
          <span className="ml-1.5">Найти компании</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          data-testid="signal-lead-expand"
          aria-expanded={open}
          className="ml-auto active:scale-95 transition-transform duration-150"
          onClick={() => void toggle()}
        >
          {loadingDetail
            ? <LoaderCircle size={14} className="animate-spin" />
            : open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span className="ml-1.5">{open ? 'Свернуть' : 'Подробнее'}</span>
        </Button>
      </div>

      {/* ── Expanded detail ── */}
      {open && (
        <div
          data-testid="signal-lead-detail"
          className="mt-4 pt-4 border-t border-white/10 space-y-3 animate-fade-in"
        >
          {loadingDetail && (
            <p className="text-xs text-white/45">Загружаем текст заявки…</p>
          )}
          {detailError && (
            <p className="text-xs text-red-300" role="alert">{detailError}</p>
          )}

          {post === null && !loadingDetail && !detailError && (
            // Retention deletes raw post text after seven days. Saying so is
            // better than an empty box the operator has to puzzle over.
            <p className="text-xs text-white/45 leading-relaxed">
              Полный текст уже удалён по сроку хранения (7 дней). Цитата выше
              остаётся в заявке навсегда.
            </p>
          )}

          {post && (
            <>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 mb-1.5">
                  Полный текст поста
                </p>
                <p
                  data-testid="signal-lead-fulltext"
                  className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed rounded-xl bg-white/[0.03] border border-white/[0.06] p-3"
                >
                  {post.excerpt}
                </p>
              </div>

              {post.reasons.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 mb-1.5">
                    Почему это заявка
                  </p>
                  <ul data-testid="signal-lead-reasons" className="flex flex-wrap gap-1.5">
                    {post.reasons.map((reason) => (
                      <li
                        key={reason}
                        className="text-[11px] text-white/60 bg-white/[0.05] border border-white/[0.07] rounded-md px-2 py-0.5"
                      >
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/40">
                <span>Опубликовано: {new Date(post.occurredAt).toLocaleString('ru-RU')}</span>
                {lead.targetSlug && (
                  <a
                    href={signalTargetUrl(lead.targetSlug)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-0.5 text-brand-cyan hover:text-brand-cyan/80 transition-colors"
                  >
                    источник: @{lead.targetSlug}
                    <ArrowUpRight size={10} className="opacity-60" />
                  </a>
                )}
              </div>
            </>
          )}

          {/* No history table exists, so this states what is actually known:
              when the row was created and when it last moved. */}
          <p className="text-[11px] text-white/35">
            Создано {new Date(lead.createdAt).toLocaleString('ru-RU')}
            {lead.updatedAt !== lead.createdAt
              ? ` · изменено ${new Date(lead.updatedAt).toLocaleString('ru-RU')} (${SIGNAL_LEAD_STATE_LABELS[lead.state]})`
              : ''}
          </p>
        </div>
      )}
    </li>
  );
}

/* ============================================================ *
 * ControlCard — the runtime switch and the manual scan.
 *
 * Everything here used to require a deploy. The mode is stored in
 * `system_settings` and read by the worker through the same resolver the UI
 * reads, so what is shown here is exactly what cron will do next.
 * ============================================================ */

function ControlCard({
  modeState, scan, runtime, busyId, onMutate, onNotice,
}: {
  modeState: SignalModeState | null;
  scan: SignalScanStatus | null;
  runtime: SignalRadarOverview['runtime'] | null;
  busyId: string | null;
  onMutate: (key: string, run: () => Promise<unknown>) => void;
  onNotice: (message: string | null) => void;
}) {
  // `join` is the only mode that can get a real account banned, so it takes
  // two deliberate clicks instead of one.
  const [confirmJoin, setConfirmJoin] = useState(false);
  const remaining = useCountdown(scan?.queued ? (scan?.nextAvailableAt ?? null) : null);
  const coolingDown = (scan?.queued ?? false) && remaining > 0;
  const busy = busyId === 'mode' || busyId === 'scan';

  const pick = (mode: SignalAutojoinMode) => {
    if (mode === 'join' && !confirmJoin) {
      setConfirmJoin(true);
      return;
    }
    setConfirmJoin(false);
    onNotice(null);
    onMutate('mode', async () => {
      await api.signalRadarSetMode(mode, mode === 'join' ? true : undefined);
      onNotice(mode === 'off'
        ? 'Режим «Выключен»: радар остановлен.'
        : `Режим «${MODE_LABELS[mode]}» включён.`);
    });
  };

  const reset = () => {
    setConfirmJoin(false);
    onNotice(null);
    onMutate('mode', async () => {
      await api.signalRadarSetMode(null);
      onNotice('Режим отдан обратно конфигу деплоя.');
    });
  };

  const scanNow = () => {
    onNotice(null);
    onMutate('scan', async () => {
      await api.signalRadarScan();
      onNotice('Скан поставлен в очередь. Результат появится на странице через минуту-две.');
    });
  };

  const scanBlocked = !runtime?.enabled
    ? 'Радар выключен в конфиге: LEAD_RADAR_SIGNAL_ENABLED не равен «true».'
    : !runtime?.queueReady
      ? 'Очередь автоматизации не подключена — ручной скан невозможен.'
      : modeState?.mode === 'off'
        ? 'Включите любой режим кроме «Выключен».'
        : null;

  return (
    <div data-testid="signal-controls" className="animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        {/* ── Mode switch ── */}
        <div className="min-w-0">
          <div
            className="mt-3 inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-bg-surface/70 p-1"
            role="group"
            aria-label="Режим автоматизации"
          >
            {SIGNAL_AUTOJOIN_MODES.map((mode) => {
              const active = modeState?.mode === mode;
              const danger = mode === 'join';
              return (
                <button
                  key={mode}
                  type="button"
                  data-testid={`signal-mode-${mode}`}
                  aria-pressed={active}
                  disabled={busy}
                  onClick={() => pick(mode)}
                  className={[
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    active
                      ? danger
                        ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
                        : 'bg-brand-cyan/15 text-brand-cyan ring-1 ring-brand-cyan/35 shadow-glow'
                      : 'text-white/55 hover:text-white/85 hover:bg-white/5',
                  ].join(' ')}
                >
                  {MODE_LABELS[mode]}
                </button>
              );
            })}
          </div>

          <p className="mt-2.5 text-xs text-white/55 max-w-xl leading-relaxed">
            {modeState ? MODE_HINTS[modeState.mode] : 'Режим загружается…'}
          </p>
          {modeState && (
            <p className="mt-1.5 text-[11px] text-white/35">
              Источник: {MODE_SOURCE_LABELS[modeState.source]}
              {modeState.updatedAt
                ? ` · изменён ${new Date(modeState.updatedAt).toLocaleString('ru-RU')}`
                : ''}
              {modeState.source === 'setting' && (
                <button
                  type="button"
                  onClick={reset}
                  disabled={busy}
                  data-testid="signal-mode-reset"
                  className="ml-2 inline-flex items-center gap-1 text-brand-cyan/80 hover:text-brand-cyan transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={10} />
                  как в конфиге
                </button>
              )}
            </p>
          )}
        </div>

        {/* ── Manual scan ── */}
        <div className="flex flex-col items-start sm:items-end gap-2">
          <Button
            onClick={scanNow}
            disabled={busy || coolingDown || Boolean(scanBlocked)}
            data-testid="signal-scan"
            title={scanBlocked ?? ''}
            className="active:scale-95 transition-transform duration-150"
          >
            {busyId === 'scan'
              ? <LoaderCircle size={15} className="animate-spin" />
              : coolingDown
                ? <Timer size={15} />
                : <Play size={15} />}
            <span className="ml-1.5">
              {busyId === 'scan'
                ? 'Ставим в очередь…'
                : coolingDown
                  ? `Доступно через ${mmss(remaining)}`
                  : 'Сканировать сейчас'}
            </span>
          </Button>
          <p className="text-[11px] text-white/35 max-w-[15rem] sm:text-right leading-relaxed">
            {scanBlocked ?? 'Читает каналы вне очереди крона. Не чаще раза в 5 минут.'}
          </p>
        </div>
      </div>

      {/* ── The one confirmation that matters ── */}
      {confirmJoin && (
        <div
          data-testid="signal-join-confirm"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-500/[0.07] px-3.5 py-3 animate-fade-in"
        >
          <span className="text-amber-300 shrink-0"><ShieldAlert size={16} /></span>
          <p className="text-xs text-white/75 flex-1 min-w-[16rem] leading-relaxed">
            Режим «Вступление» реально вступает в группы вашим аккаунтом: это
            видно посторонним и может стоить аккаунта. Ограничения уже стоят
            (не более 4 в сутки, только днём, испытательный срок 3 дня) —
            но решение за вами.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => pick('join')}
              data-testid="signal-join-confirm-yes"
              className="active:scale-95 transition-transform duration-150"
            >
              <Check size={13} />
              <span className="ml-1">Включаю</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmJoin(false)}
              data-testid="signal-join-confirm-no"
            >
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
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
    <div data-testid="signal-targets">
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
    </div>
  );
}

/* ============================================================ *
 * ChatsCard — rooms the operator could write in.
 *
 * This is a different question from the sources table below it. A channel is
 * a megaphone: a million readers, not one of whom can answer. A group is a
 * room. So this table does not rank rooms by what was said in them — it ranks
 * them by whether anyone is in the room and whether a stranger is allowed to
 * speak. That is the only thing that matters before the first message.
 *
 * It loads when the section is first opened, not with the page: the inbox is
 * why the operator is here, and a second request in front of it would be a
 * slow inbox.
 * ============================================================ */

const CHAT_STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'approved', label: 'Отобранные' },
  { value: 'rejected', label: 'Отсеянные' },
];

const CHAT_REJECT_LABELS: Record<string, string> = {
  'not-a-group': 'канал, а не чат',
  unresolved: 'не удалось прочитать',
  'too-small': 'мало участников',
  inactive: 'никого нет онлайн',
  junk: 'казино/крипта/такси',
  noise: 'бытовой шум',
  'promo-swamp': 'взаимный пиар',
  'wrong-city': 'другой город',
  'no-geo': 'без географии',
  'off-topic': 'не по теме',
  noindex: 'закрыт для индексации',
};

function rejectLabel(reason: string): string {
  // A per-row reason carries the term that decided it ("noise:щен"); the
  // breakdown under the table carries only the class ("noise"). Translate the
  // class, keep the term: "бытовой шум: щен" is how an operator discovers that
  // the word "щен" is inside "запрещено" without reading any code.
  const [code, detail] = reason.split(':');
  const label = CHAT_REJECT_LABELS[code] ?? code;
  return detail ? `${label}: ${detail}` : label;
}

/* 'new' is what everything is until someone acts on it, so it stays silent;
   the other four are decisions worth showing next to the name. */
const CHAT_STATUS_TONES: Record<Exclude<SignalChatStatus, 'new'>, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  approved: 'success',
  queued: 'info',
  joined: 'success',
  rejected: 'danger',
};

/* Flips the operator's own verdict. 'unknown' means nobody has looked yet,
   so the first click must land on a claim, not on 'no'. */
function nextCanWrite(chat: SignalChat): SignalCanWrite {
  return chat.canWrite === 'yes' ? 'no' : 'yes';
}

function ChatsCard({ installed }: { installed: boolean }) {
  const [data, setData] = useState<SignalChatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters are local and re-fetch; the server does the work so the table
  // never lies about how many rows matched.
  const [status, setStatus] = useState('');
  const [minMembers, setMinMembers] = useState('');
  const [minRelevance, setMinRelevance] = useState('');
  const [showRejected, setShowRejected] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keywords, setKeywords] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[] | null>(null);
  const [thresholds, setThresholds] = useState<{ minMembers: string; minOnline: string; minRelevance: string } | null>(null);
  const [localOnly, setLocalOnly] = useState<boolean | null>(null);

  const [raw, setRaw] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.signalRadarChats({
        status: status || undefined,
        minMembers: minMembers ? Number(minMembers) : undefined,
        minRelevance: minRelevance ? Number(minRelevance) : undefined,
        rejected: showRejected ? 1 : 0,
        limit: 200,
      }));
    } catch (e) {
      setError((e as Error).message || 'Не удалось загрузить чаты');
    } finally {
      setLoading(false);
    }
  }, [status, minMembers, minRelevance, showRejected]);

  useEffect(() => { void load(); }, [load]);

  // The editor mirrors the stored config the first time it is shown, and then
  // belongs to the operator: a half-typed threshold must not be overwritten by
  // a background reload.
  useEffect(() => {
    if (!data || keywords !== null) return;
    setKeywords(data.config.keywords.join('\n'));
    setTopics(data.config.topics);
    setThresholds({
      minMembers: String(data.config.minMembers),
      minOnline: String(data.config.minOnline),
      minRelevance: String(data.config.minRelevance),
    });
    setLocalOnly(data.config.localOnly);
  }, [data, keywords]);

  const run = async (key: string, action: () => Promise<unknown>, message?: string) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      if (message) setNotice(message);
      await load();
    } catch (e) {
      setNotice(null);
      setError((e as Error).message || 'Действие не выполнено');
    } finally {
      setBusy(null);
    }
  };

  const cooldown = useCountdown(data?.harvest.nextAvailableAt ?? null);
  const coolingDown = (data?.harvest.queued ?? false) && cooldown > 0;
  const topicLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const topic of data?.topics ?? []) map[topic.id] = topic.label;
    return map;
  }, [data]);

  const parsed = useMemo(() => parseSignalSlugList(raw), [raw]);
  const counts = data?.counts;

  const saveConfig = () => {
    const patch: Partial<SignalChatsResponse['config']> = {
      topics: topics ?? [],
      keywords: (keywords ?? '').split(/[\n,]+/).map((k) => k.trim()).filter(Boolean).slice(0, 40),
      localOnly: localOnly ?? true,
    };
    const members = Number(thresholds?.minMembers);
    const online = Number(thresholds?.minOnline);
    const relevance = Number(thresholds?.minRelevance);
    if (Number.isFinite(members)) patch.minMembers = members;
    if (Number.isFinite(online)) patch.minOnline = online;
    if (Number.isFinite(relevance)) patch.minRelevance = relevance;
    void run('config', () => api.signalRadarPatchChatConfig(patch), 'Настройки поиска сохранены');
  };

  const setChatStatus = (chat: SignalChat, next: SignalChatStatus) => (
    api.signalRadarPatchChat(chat.id, { status: next })
  );

  return (
    <div data-testid="signal-chats">
      {!installed && (
        <Card className="mb-4 bg-gradient-to-b from-amber-500/5 to-transparent">
          <p className="text-sm text-white/60">
            Примените миграцию <code className="text-brand-cyan">0059_lead_radar_signal_chats.sql</code> —
            таблица чатов появится после неё. Поиск по спросу при этом продолжает работать.
          </p>
        </Card>
      )}

      <p className="text-xs text-white/45 mb-4 leading-relaxed">
        Ищем <strong className="text-white/70">группы</strong>, а не каналы: в канале нельзя
        начать разговор. Источники — каталоги чатов и обход похожих комнат. Telegram отдаёт
        для группы только карточку: название, описание и «сколько сейчас онлайн». Что пишут
        внутри, видно лишь после вступления — поэтому здесь этого нет.
      </p>

      {/* ── Actions ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Button
          size="sm"
          disabled={!installed || coolingDown || busy !== null}
          data-testid="signal-chats-harvest"
          className="active:scale-95 transition-transform duration-150"
          onClick={() => void run('harvest', () => api.signalRadarHarvestChats(
            (keywords ?? '').split(/[\n,]+/).map((k) => k.trim()).filter(Boolean).slice(0, 40),
          ), 'Поиск запущен: результаты появятся в течение минуты')}
        >
          {busy === 'harvest'
            ? <LoaderCircle size={14} className="animate-spin" />
            : <Search size={14} />}
          <span className="ml-1.5">
            {busy === 'harvest'
              ? 'Ищем…'
              : coolingDown
                ? `Подождите ${mmss(cooldown)}`
                : 'Найти чаты'}
          </span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          data-testid="signal-chats-refresh"
          onClick={() => void load()}
        >
          <RefreshCw size={14} />
          <span className="ml-1.5">Обновить</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSettingsOpen((prev) => !prev)}
          data-testid="signal-chats-settings-toggle"
        >
          <SlidersHorizontal size={14} />
          <span className="ml-1.5">Темы и ключевые слова</span>
          {settingsOpen ? <ChevronUp size={13} className="ml-1" /> : <ChevronDown size={13} className="ml-1" />}
        </Button>
        {counts && (
          <span className="text-xs text-white/45">
            {counts.groups} чатов · {counts.writable} с открытой записью · {counts.new} новых
          </span>
        )}
        {notice && (
          <span className="inline-flex items-center gap-1 text-xs text-brand-cyan bg-brand-cyan/5 px-2 py-1 rounded-md">
            <Check size={12} />
            {notice}
          </span>
        )}
      </div>

      {/* ── Topic and keyword editor ── */}
      {settingsOpen && (
        <Card className="mb-4 space-y-4 animate-fade-in" data-testid="signal-chats-settings">
          <div>
            <p className="text-xs text-white/45 mb-2">
              Темы поиска. Если не выбрано ничего — ищем по всем.
            </p>
            <div className="flex flex-wrap gap-2">
              {(data?.topics ?? []).map((topic) => {
                const active = (topics ?? []).includes(topic.id);
                return (
                  <button
                    key={topic.id}
                    type="button"
                    data-testid={`signal-chat-topic-${topic.id}`}
                    onClick={() => setTopics((prev) => {
                      const current = prev ?? [];
                      return current.includes(topic.id)
                        ? current.filter((id) => id !== topic.id)
                        : [...current, topic.id];
                    })}
                    className={[
                      'px-2.5 py-1 rounded-lg text-xs border transition-colors',
                      active
                        ? 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30'
                        : 'bg-white/[0.03] text-white/50 border-white/10 hover:text-white/70',
                    ].join(' ')}
                  >
                    {topic.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs text-white/45 mb-2">
              Свои ключевые слова — по одному на строку. Они идут и в поиск каталогов,
              и в фильтр: комната, которой нет ни в одной теме, всё равно найдётся.
            </p>
            <Textarea
              rows={3}
              value={keywords ?? ''}
              onChange={(event) => setKeywords(event.target.value)}
              placeholder={'нужен бот\nразработка лендинга\ntargetolog'}
              aria-label="Ключевые слова"
              data-testid="signal-chats-keywords"
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-white/45">Минимум участников</span>
              <Input
                type="number"
                min={0}
                max={100000}
                value={thresholds?.minMembers ?? ''}
                onChange={(event) => setThresholds((prev) => ({ ...prev, minMembers: event.target.value } as never))}
                className="mt-1"
                data-testid="signal-chats-min-members"
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/45">Минимум онлайн</span>
              <Input
                type="number"
                min={0}
                max={10000}
                value={thresholds?.minOnline ?? ''}
                onChange={(event) => setThresholds((prev) => ({ ...prev, minOnline: event.target.value } as never))}
                className="mt-1"
                data-testid="signal-chats-min-online"
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/45">Порог релевантности</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={thresholds?.minRelevance ?? ''}
                onChange={(event) => setThresholds((prev) => ({ ...prev, minRelevance: event.target.value } as never))}
                className="mt-1"
                data-testid="signal-chats-min-relevance"
              />
            </label>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={localOnly ?? true}
              onChange={(event) => setLocalOnly(event.target.checked)}
              className="mt-0.5"
              data-testid="signal-chats-local-only"
            />
            <span className="text-xs text-white/55 leading-relaxed">
              Только Узбекистан. Без этой галочки в таблицу полезут московские
              чаты взаимного пиара — их в открытом вебе в несколько раз больше,
              и ни один из них не закажет сайт в Ташкенте.
            </span>
          </label>

          <Button
            size="sm"
            disabled={busy === 'config'}
            onClick={saveConfig}
            data-testid="signal-chats-save-config"
            className="active:scale-95 transition-transform duration-150"
          >
            {busy === 'config' ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
            <span className="ml-1.5">Сохранить</span>
          </Button>
        </Card>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          {CHAT_STATUS_FILTERS.map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              onClick={() => setStatus(option.value)}
              className={[
                'px-2.5 py-1 rounded-lg text-xs border transition-colors',
                status === option.value
                  ? 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30'
                  : 'bg-white/[0.03] text-white/50 border-white/10 hover:text-white/70',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-white/45">
          участников от
          <Input
            type="number"
            min={0}
            value={minMembers}
            onChange={(event) => setMinMembers(event.target.value)}
            className="w-20"
            placeholder="0"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-white/45">
          релевантность от
          <Input
            type="number"
            min={0}
            max={100}
            value={minRelevance}
            onChange={(event) => setMinRelevance(event.target.value)}
            className="w-20"
            placeholder="0"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-white/45 cursor-pointer">
          <input
            type="checkbox"
            checked={showRejected}
            onChange={(event) => setShowRejected(event.target.checked)}
            data-testid="signal-chats-show-rejected"
          />
          показать отсеянные
        </label>
      </div>

      {/* ── Manual add ── */}
      <div className="mb-4 space-y-2">
        <Textarea
          rows={2}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          placeholder="Уже знаете комнату? @tashkent_freelance — по одному на строку"
          aria-label="Ссылки на чаты"
          data-testid="signal-chats-add-input"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            disabled={parsed.length === 0 || busy !== null}
            onClick={() => void run('add', () => api.signalRadarAddChats(parsed), 'Добавлено, проверим на следующем тике').then(() => setRaw(''))}
            data-testid="signal-chats-add-submit"
            className="active:scale-95 transition-transform duration-150"
          >
            <Plus size={14} />
            <span className="ml-1.5">Добавить{parsed.length ? ` (${parsed.length})` : ''}</span>
          </Button>
          {parsed.length > 0 && (
            <span className="text-xs text-white/45">
              распознано: {parsed.map((s) => `@${s}`).join(', ')}
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-300 mb-3">{error}</p>
      )}

      {/* ── The table ── */}
      {loading && !data ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 animate-pulse" />
      ) : (data?.chats.length ?? 0) === 0 ? (
        <EmptyState
          testId="signal-chats-empty"
          icon={MessagesSquare}
          title="Чатов пока нет"
          text="Нажмите «Найти чаты»: обойдём каталоги и похожие комнаты, отсеем каналы и мусор, и покажем только группы, куда можно написать."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-white/40 border-b border-white/10 bg-bg-surface/80 backdrop-blur-sm">
                <th className="py-2.5 pr-3 pl-3 font-medium">Название</th>
                <th className="py-2.5 pr-3 font-medium">Ссылка</th>
                <th className="py-2.5 pr-3 font-medium">Тематика</th>
                <th className="py-2.5 pr-3 font-medium">Участников</th>
                <th className="py-2.5 pr-3 font-medium">Активность</th>
                <th className="py-2.5 pr-3 font-medium">Можно писать</th>
                <th className="py-2.5 pr-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {(data?.chats ?? []).map((chat, i) => {
                const busyRow = busy === chat.id;
                const writable = chat.canWrite === 'yes';
                return (
                  <tr
                    key={chat.id}
                    data-testid="signal-chat"
                    className="border-b border-white/5 transition-colors hover:bg-white/[0.04] even:bg-white/[0.015] animate-fade-up"
                    style={{ animationDelay: `${staggerDelay(i, 30, 25, 300)}ms` }}
                  >
                    <td className="py-2.5 pr-3 pl-3 max-w-[20rem]">
                      <div className="flex items-center gap-2">
                        <span className="text-white/85 truncate">{chat.title || `@${chat.slug}`}</span>
                        <ScoreBadge score={chat.relevance} />
                        {chat.status !== 'new' && (
                          <Badge tone={CHAT_STATUS_TONES[chat.status]}>
                            {SIGNAL_CHAT_STATUS_LABELS[chat.status]}
                          </Badge>
                        )}
                      </div>
                      {chat.about && (
                        <div className="text-xs text-white/40 truncate mt-0.5">{chat.about}</div>
                      )}
                      {chat.rejectReason && (
                        <div className="text-xs text-amber-300/70 mt-0.5">
                          отсеян: {rejectLabel(chat.rejectReason)}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <a
                        href={chat.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-0.5 text-brand-cyan hover:text-brand-cyan/80 transition-colors whitespace-nowrap"
                      >
                        @{chat.slug}
                        <ArrowUpRight size={11} className="opacity-50" />
                      </a>
                    </td>
                    <td className="py-2.5 pr-3 text-white/70 whitespace-nowrap">
                      {chat.topic ? topicLabels[chat.topic] ?? chat.topic : '—'}
                      {chat.topic && chat.confidence === 'tentative' && (
                        // The room used one word anyone might use — "сайт",
                        // "дизайн", "it" — and nothing else. It may be a studio
                        // that never describes itself. It may be a flower shop.
                        // Say so rather than letting the column imply more than
                        // the harvest actually knows.
                        <span
                          className="ml-1.5 text-[11px] text-amber-300/60"
                          title="Комната назвала одно слово из темы и больше ничего. Возможно, это студия, которая никак себя не описывает, — а возможно, цветочный магазин. Проверьте перед тем, как писать."
                        >
                          предположительно
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-white/70 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} className="text-white/30" />
                        {chat.members?.toLocaleString('ru-RU') ?? '—'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <Badge tone={chat.activity === 'live' ? 'success' : chat.activity === 'slow' ? 'warning' : 'neutral'}>
                        {SIGNAL_CHAT_ACTIVITY_LABELS[chat.activity]}
                      </Badge>
                      {chat.online !== null && (
                        <span className="text-xs text-white/40 ml-1.5">{chat.online} онлайн</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <Badge tone={writable ? 'success' : chat.canWrite === 'no' ? 'danger' : 'neutral'}>
                        {SIGNAL_CAN_WRITE_LABELS[chat.canWrite]}
                      </Badge>
                      {chat.canWriteBasis && (
                        <span className="text-[11px] text-white/30 ml-1.5">
                          {chat.canWriteBasis === 'api' ? 'проверено API'
                            : chat.canWriteBasis === 'operator' ? 'вы сами' : 'предположение'}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      {chat.status === 'rejected' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyRow}
                          data-testid="signal-chat-restore"
                          onClick={() => void run(chat.id, () => setChatStatus(chat, 'new'))}
                        >
                          Вернуть
                        </Button>
                      ) : (
                        <>
                          {chat.status !== 'approved' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busyRow}
                              data-testid="signal-chat-approve"
                              className="active:scale-95 transition-transform duration-150"
                              onClick={() => void run(chat.id, () => setChatStatus(chat, 'approved'))}
                            >
                              Отобрать
                            </Button>
                          )}
                          {chat.kind === 'group' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-2"
                              disabled={busyRow}
                              title={writable ? 'Отметить, что писать нельзя' : 'Отметить, что писать можно'}
                              data-testid="signal-chat-toggle-write"
                              onClick={() => void run(`${chat.id}:write`, () => api.signalRadarPatchChat(chat.id, {
                                canWrite: nextCanWrite(chat),
                              }))}
                            >
                              {writable ? <Ban size={13} /> : <Check size={13} />}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-2"
                            disabled={busyRow}
                            data-testid="signal-chat-reject"
                            onClick={() => void run(chat.id, () => setChatStatus(chat, 'rejected'))}
                          >
                            Отсеять
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reject breakdown: so the filter can be tuned, not just trusted ── */}
      {(data?.reasons.length ?? 0) > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/35">отсеяно по причинам:</span>
          {data?.reasons.map((row) => (
            <span
              key={row.reason}
              className="text-xs text-white/45 bg-white/[0.03] border border-white/10 px-2 py-0.5 rounded-md"
            >
              {rejectLabel(row.reason)} · {row.count}
            </span>
          ))}
        </div>
      )}
    </div>
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
