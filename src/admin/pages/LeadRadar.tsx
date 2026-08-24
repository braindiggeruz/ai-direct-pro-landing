import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Database,
  ExternalLink,
  FileCheck2,
  Filter,
  Globe2,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Phone,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Button, Input, Label, Select, Textarea } from '../components/ui';
import type {
  LeadRadarLead,
  LeadRadarLifecycle,
  LeadRadarOverview,
  LeadRadarPriority,
  LeadRadarSearchInput,
  LeadRadarSearchResult,
  LeadRadarSearchSummary,
} from '../../shared/lead-radar';

const DEFAULT_INPUT: LeadRadarSearchInput = {
  niche: 'Стоматологии',
  city: 'Ташкент',
  country: 'UZ',
  offer: 'AI-бот для обработки заявок в Telegram и Instagram',
  desiredCount: 20,
  telegramRequired: false,
  languages: ['ru', 'uz'],
};

const LIFECYCLE_LABELS: Record<LeadRadarLifecycle, string> = {
  new: 'Новый',
  contacted: 'Связались',
  replied: 'Ответил',
  qualified: 'Квалифицирован',
  meeting: 'Встреча',
  won: 'Сделка',
  lost: 'Не подходит',
  do_not_contact: 'Не связываться',
};

const PRIORITY_COPY: Record<LeadRadarPriority, { title: string; body: string; tone: 'success' | 'info' | 'neutral' }> = {
  P1: { title: 'Активный сигнал', body: 'Обнаружен публичный intent-сигнал и сильные доказательства. Это не вероятность сделки.', tone: 'success' },
  P2: { title: 'Вероятная потребность', body: 'Компания подходит, но прямой запрос ещё не подтверждён.', tone: 'info' },
  P3: { title: 'Соответствует ICP', body: 'Нужно больше фактов перед первым контактом.', tone: 'neutral' },
};

const STATUS_COPY: Record<LeadRadarSearchSummary['status'], { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  running: { label: 'Выполняется', tone: 'neutral' },
  ready: { label: 'Готово', tone: 'success' },
  partial: { label: 'Частичный результат', tone: 'warning' },
  failed: { label: 'Не завершён', tone: 'danger' },
  insufficient_results: { label: 'Мало данных', tone: 'warning' },
};

const FAILURE_COPY: Record<string, { title: string; body: string }> = {
  city_not_found: {
    title: 'Не удалось определить город',
    body: 'Уточните название города и повторите поиск. Компании ещё не проверялись.',
  },
  geocoder_unavailable: {
    title: 'География временно недоступна',
    body: 'Сервис определения города не ответил. Поля поиска сохранены — попробуйте снова через минуту.',
  },
  discovery_source_unavailable: {
    title: 'Источник компаний временно недоступен',
    body: 'Список компаний получить не удалось. Это не означает, что компаний нет; запрос можно безопасно повторить.',
  },
  source_timeout: {
    title: 'Источник не успел ответить',
    body: 'Ожидание превысило безопасный лимит. Запрос сохранён и готов к повтору.',
  },
  upstream_payload_invalid: {
    title: 'Источник вернул некорректные данные',
    body: 'Мы отклонили непроверяемый ответ и не добавили сомнительные компании. Попробуйте ещё раз.',
  },
  search_interrupted: {
    title: 'Предыдущий запуск прервался',
    body: 'Соединение завершилось до сохранения результата. Параметры не потеряны — поиск можно безопасно повторить.',
  },
  discovery_failed: {
    title: 'Поиск не завершён',
    body: 'Компании не проверялись из-за технического сбоя. Попробуйте повторить запрос.',
  },
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function errorCopy(error: unknown): string {
  const code = (error as Error & { code?: string })?.code;
  if (code === 'search_rate_limited') return 'Другой поиск уже выполняется или только что завершился. Дождитесь обновления статуса и повторите.';
  if (code === 'payload_too_large' || code === 'invalid_search') return 'Проверьте заполненные поля и повторите попытку.';
  if (code === 'UNAUTHENTICATED') return 'Сессия завершилась. Войдите в панель снова.';
  return 'Операция не завершилась. Повторите попытку; если ошибка вернётся, сообщите время запуска.';
}

function leadMessage(lead: LeadRadarLead, offer: string): string {
  const factSignal = lead.signals.find((signal) => signal.classification === 'fact' && signal.type !== 'active_website');
  const evidenceLine = factSignal
    ? `В открытых материалах вашей компании увидел сигнал «${factSignal.label}».`
    : `Посмотрел открытые материалы компании «${lead.name}».`;
  return [
    'Здравствуйте!',
    evidenceLine,
    `Мы внедряем ${offer.toLocaleLowerCase('ru-RU')} и помогаем не терять обращения вне рабочего времени.`,
    'Могу бесплатно показать короткий сценарий именно под вашу нишу — без обязательств. Актуально обсудить?',
  ].join('\n\n');
}

function ScoreRing({ value }: { value: number }) {
  return (
    <div
      className="grid h-16 w-16 shrink-0 place-items-center rounded-full p-[5px]"
      style={{ background: `conic-gradient(#2fe6d1 ${value * 3.6}deg, rgba(255,255,255,.08) 0deg)` }}
      role="img"
      aria-label={`Оценка ${value} из 100`}
    >
      <div className="grid h-full w-full place-items-center rounded-full bg-[#08111f] text-sm font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, accent = false }: {
  icon: typeof Radar;
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-xs text-white/45">
        <Icon size={14} className={accent ? 'text-brand-cyan' : 'text-white/40'} aria-hidden="true" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-white tabular-nums">{value}</div>
    </div>
  );
}

function SearchHistory({ searches, activeId, onOpen }: {
  searches: LeadRadarSearchSummary[];
  activeId?: string;
  onOpen: (id: string) => void;
}) {
  if (searches.length === 0) return null;
  return (
    <section aria-labelledby="history-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">История</p>
          <h2 id="history-title" className="mt-1 text-base font-semibold text-white">Последние запуски</h2>
        </div>
      </div>
      <div className="grid gap-2">
        {searches.slice(0, 5).map((search) => (
          <button
            key={search.id}
            type="button"
            onClick={() => onOpen(search.id)}
            aria-current={activeId === search.id ? 'true' : undefined}
            className={`group min-h-16 rounded-2xl border px-4 py-3 text-left transition-colors ${
              activeId === search.id
                ? 'border-brand-cyan/35 bg-brand-cyan/[0.08]'
                : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{search.input.niche}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-white/40">
                  <span>{search.input.city}</span><span aria-hidden="true">·</span><span>{formatDate(search.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_COPY[search.status].tone}>{STATUS_COPY[search.status].label}</Badge>
                <span className="text-xs tabular-nums text-white/55">{search.verifiedCount}</span>
                <ChevronRight size={15} className="text-white/25 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function SearchOutcome({
  title,
  body,
  detail,
  danger = false,
  primary,
  secondary,
}: {
  title: string;
  body: string;
  detail?: string;
  danger?: boolean;
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <section
      role={danger ? 'alert' : 'status'}
      className={`grid min-h-64 place-items-center rounded-[1.75rem] border p-6 text-center ${
        danger ? 'border-rose-400/20 bg-rose-400/[0.045]' : 'border-white/[0.09] bg-[#08111f]/65'
      }`}
    >
      <div className="max-w-xl">
        <div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl border ${
          danger ? 'border-rose-300/25 bg-rose-400/[0.08] text-rose-200' : 'border-brand-cyan/20 bg-brand-cyan/[0.07] text-brand-cyan'
        }`}>
          {danger ? <AlertTriangle size={24} aria-hidden="true" /> : <Radar size={24} aria-hidden="true" />}
        </div>
        <h2 className="mt-5 text-xl font-semibold text-white">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/65">{body}</p>
        {detail && <p className="mt-2 text-xs text-white/50">{detail}</p>}
        {(primary || secondary) && (
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {primary && <Button type="button" size="lg" onClick={primary.onClick} className="min-h-12">{primary.label}</Button>}
            {secondary && <Button type="button" size="lg" variant="secondary" onClick={secondary.onClick} className="min-h-12">{secondary.label}</Button>}
          </div>
        )}
      </div>
    </section>
  );
}

function LeadListItem({ lead, selected, onSelect }: {
  lead: LeadRadarLead;
  selected: boolean;
  onSelect: () => void;
}) {
  const priority = PRIORITY_COPY[lead.priority];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${
        selected
          ? 'border-brand-cyan/35 bg-brand-cyan/[0.07] shadow-[0_18px_55px_-35px_rgba(47,230,209,.75)]'
          : 'border-white/[0.07] bg-white/[0.018] hover:border-white/15 hover:bg-white/[0.04]'
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-3">
        <ScoreRing value={lead.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={priority.tone}>{lead.priority}</Badge>
            {lead.telegramUrl && <Badge tone="success">Telegram</Badge>}
            {lead.lifecycle !== 'new' && <Badge tone="neutral">{LIFECYCLE_LABELS[lead.lifecycle]}</Badge>}
          </div>
          <h3 className="mt-2 truncate text-base font-semibold text-white">{lead.name}</h3>
          <p className="mt-1 truncate text-xs text-white/45">{lead.category} · {lead.city}</p>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-white/40">
            <FileCheck2 size={13} className="text-brand-cyan" aria-hidden="true" />
            {lead.evidence.length} доказательств
            <span aria-hidden="true">·</span>
            достоверность {Math.round(lead.confidence * 100)}%
          </div>
        </div>
      </div>
    </button>
  );
}

function LeadDetail({ lead, offer, onLifecycle, busy }: {
  lead: LeadRadarLead;
  offer: string;
  onLifecycle: (lifecycle: LeadRadarLifecycle) => void;
  busy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const priority = PRIORITY_COPY[lead.priority];
  const message = leadMessage(lead, offer);

  async function copyMessage(): Promise<void> {
    if (lead.suppressed) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopyError(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  return (
    <article className="min-w-0 overflow-hidden rounded-[1.75rem] border border-white/[0.09] bg-[#08111f]/90 shadow-[0_30px_100px_-55px_rgba(34,158,217,.65)]">
      <div className="border-b border-white/[0.07] bg-[radial-gradient(circle_at_85%_0%,rgba(47,230,209,.12),transparent_35%)] p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={priority.tone}>{lead.priority} · {priority.title}</Badge>
              {lead.suppressed && <Badge tone="danger">Не контактировать</Badge>}
              <span className="text-xs text-white/35">проверено {formatDate(lead.lastVerifiedAt)}</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl">{lead.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/50">
              <span className="flex items-center gap-1.5"><BriefcaseBusiness size={14} aria-hidden="true" />{lead.category}</span>
              <span className="flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" />{lead.city}</span>
            </div>
          </div>
          <ScoreRing value={lead.score} />
        </div>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-white/60">{priority.body}</p>
        {!lead.suppressed && <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {lead.telegramUrl ? (
            <a
              href={lead.telegramUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-grad-cta px-4 text-sm font-semibold text-[#04101a] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            >
              <MessageCircle size={17} aria-hidden="true" />Открыть Telegram<ExternalLink size={14} aria-hidden="true" />
            </a>
          ) : (
            <div className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 text-sm text-white/45">
              <CircleHelp size={16} aria-hidden="true" />Telegram не подтверждён
            </div>
          )}
          <button
            type="button"
            onClick={copyMessage}
            disabled={lead.suppressed}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.045] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? <Check size={17} className="text-emerald-300" aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
            {copied ? 'Сообщение скопировано' : 'Скопировать сообщение'}
          </button>
        </div>}
        <p className="sr-only" role="status" aria-live="polite">
          {copied ? 'Сообщение скопировано' : copyError ? 'Не удалось скопировать сообщение' : ''}
        </p>
        {lead.suppressed && <p className="mt-3 text-xs leading-5 text-rose-200/80">Контактные каналы и черновик скрыты: для компании установлен постоянный запрет на обращение. Доказательства оставлены только для аудита.</p>}
        {copyError && <p className="mt-3 text-xs leading-5 text-amber-200/80">Браузер запретил доступ к буферу обмена. Разрешите копирование и повторите.</p>}
      </div>

      <div className="grid gap-0">
        <div className="space-y-6 border-b border-white/[0.07] p-5 sm:p-6">
          <section aria-labelledby="why-fit">
            <div className="flex items-center justify-between gap-3">
              <h3 id="why-fit" className="text-sm font-semibold text-white">Почему компания в выдаче</h3>
              <span className="text-xs text-white/35">Score ≠ вероятность сделки</span>
            </div>
            <div className="mt-4 space-y-4">
              {lead.scoreComponents.map((component) => (
                <div key={component.key}>
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <span className="text-white/65">{component.label}</span>
                    <span className="font-medium tabular-nums text-white">{component.score}/{component.max}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan"
                      style={{ width: `${Math.round(component.score / component.max * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-white/40">{component.reason}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="signals-title">
            <h3 id="signals-title" className="text-sm font-semibold text-white">Подтверждённые сигналы</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {lead.signals.length > 0 ? lead.signals.map((signal) => (
                <span key={`${signal.type}-${signal.label}`} className="inline-flex items-center gap-1.5 rounded-full border border-brand-cyan/15 bg-brand-cyan/[0.06] px-3 py-2 text-xs text-white/65">
                  <Activity size={13} className="text-brand-cyan" aria-hidden="true" />{signal.label}
                </span>
              )) : <span className="text-sm text-white/40">Активные intent-сигналы ещё не подтверждены.</span>}
            </div>
          </section>

          {!lead.suppressed && <section aria-labelledby="contacts-title">
            <h3 id="contacts-title" className="text-sm font-semibold text-white">Корпоративные контакты</h3>
            <div className="mt-3 grid gap-2 text-sm">
              {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.07] px-3 text-white/60 hover:bg-white/[0.03] hover:text-white"><Globe2 size={15} className="text-brand-cyan" aria-hidden="true" /><span className="truncate">{lead.website}</span></a>}
              {lead.phone && <a href={`tel:${lead.phone}`} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.07] px-3 text-white/60 hover:bg-white/[0.03] hover:text-white"><Phone size={15} className="text-brand-cyan" aria-hidden="true" />{lead.phone}</a>}
              {lead.genericEmail && <a href={`mailto:${lead.genericEmail}`} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.07] px-3 text-white/60 hover:bg-white/[0.03] hover:text-white"><MessageCircle size={15} className="text-brand-cyan" aria-hidden="true" />{lead.genericEmail}</a>}
              {!lead.website && !lead.phone && !lead.genericEmail && !lead.telegramUrl && <p className="text-sm text-white/40">Проверенный корпоративный контакт пока не найден.</p>}
            </div>
          </section>}
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <section aria-labelledby="evidence-title">
            <div className="flex items-center justify-between gap-3">
              <h3 id="evidence-title" className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck size={16} className="text-brand-cyan" aria-hidden="true" />Доказательства</h3>
              <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs tabular-nums text-white/50">{lead.evidence.length}</span>
            </div>
            <div className="mt-3 max-h-[24rem] space-y-2 overflow-y-auto pr-1">
              {lead.evidence.map((item) => (
                <a
                  key={item.id}
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-white/[0.07] bg-white/[0.018] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.035]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">{item.fieldPath}</div>
                      <div className="mt-1 truncate text-xs text-white/70">{item.value}</div>
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-brand-cyan">{Math.round(item.confidence * 100)}%</span>
                  </div>
                </a>
              ))}
            </div>
          </section>

          <section aria-labelledby="pipeline-title">
            <h3 id="pipeline-title" className="text-sm font-semibold text-white">Статус в продажах</h3>
            <Label htmlFor={`lead-lifecycle-${lead.id}`}>Следующий шаг</Label>
            <Select
              id={`lead-lifecycle-${lead.id}`}
              value={lead.lifecycle}
              disabled={busy || lead.suppressed}
              onChange={(event) => onLifecycle(event.target.value as LeadRadarLifecycle)}
              className="min-h-12"
              aria-label="Статус лида"
            >
              {Object.entries(LIFECYCLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <p className="mt-2 text-xs leading-5 text-white/35">«Не связываться» навсегда поднимает suppression-флаг для этой записи.</p>
          </section>

          {!lead.suppressed && <section aria-labelledby="draft-title">
            <h3 id="draft-title" className="text-sm font-semibold text-white">Черновик первого сообщения</h3>
            <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white/[0.07] bg-[#05070d] p-4 text-xs leading-5 text-white/55">{message}</div>
          </section>}
        </div>
      </div>
    </article>
  );
}

export default function LeadRadarPage() {
  const [input, setInput] = useState<LeadRadarSearchInput>(DEFAULT_INPUT);
  const [overview, setOverview] = useState<LeadRadarOverview | null>(null);
  const [result, setResult] = useState<LeadRadarSearchResult | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<'all' | LeadRadarPriority>('all');
  const [telegramOnly, setTelegramOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const requestSequence = useRef(0);

  async function loadOverview(): Promise<void> {
    try {
      setOverview(await api.leadRadarOverview());
      setOverviewError(false);
    } catch {
      setOverviewError(true);
    } finally {
      setOverviewLoading(false);
    }
  }

  useEffect(() => { void loadOverview(); }, []);

  useEffect(() => {
    const searchId = result?.search.id;
    if (!searchId || result.search.status !== 'running') return undefined;
    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;
    const poll = async (): Promise<void> => {
      attempts += 1;
      try {
        const next = await api.leadRadarSearchResult(searchId);
        if (cancelled) return;
        setResult(next);
        setSelectedLeadId(next.leads[0]?.id ?? null);
        if (next.search.status !== 'running') {
          void loadOverview();
          return;
        }
      } catch {
        if (cancelled) return;
      }
      if (attempts < 8) timer = window.setTimeout(() => { void poll(); }, Math.min(10_000, 2_000 + attempts * 1_000));
    };
    timer = window.setTimeout(() => { void poll(); }, 2_000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [result?.search.id, result?.search.status]);

  const visibleLeads = useMemo(() => (result?.leads ?? []).filter((lead) => (
    (priorityFilter === 'all' || lead.priority === priorityFilter)
    && (!telegramOnly || Boolean(lead.telegramUrl))
  )), [priorityFilter, result, telegramOnly]);
  const selectedLead = visibleLeads.find((lead) => lead.id === selectedLeadId) ?? visibleLeads[0] ?? null;
  const failedCopy = result?.search.status === 'failed'
    ? FAILURE_COPY[result.search.errorCode ?? 'discovery_failed'] ?? FAILURE_COPY.discovery_failed
    : null;
  const strictTelegramEmpty = Boolean(
    result
    && result.search.status === 'insufficient_results'
    && result.search.candidateCount > 0
    && result.search.input.telegramRequired,
  );

  async function runSearch(searchInput: LeadRadarSearchInput = input): Promise<void> {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    const snapshot = { ...searchInput, languages: [...searchInput.languages] };
    setInput(snapshot);
    setLoading(true);
    setError(null);
    try {
      const next = await api.leadRadarSearch(snapshot);
      if (requestSequence.current !== sequence) return;
      setResult(next);
      setSelectedLeadId(next.leads[0]?.id ?? null);
      setPriorityFilter('all');
      setTelegramOnly(false);
      void loadOverview();
    } catch (searchError) {
      if (requestSequence.current !== sequence) return;
      setError(errorCopy(searchError));
    } finally {
      if (requestSequence.current === sequence) setLoading(false);
    }
  }

  async function openSearch(id: string): Promise<void> {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setLoading(true);
    setError(null);
    try {
      const next = await api.leadRadarSearchResult(id);
      if (requestSequence.current !== sequence) return;
      setResult(next);
      setSelectedLeadId(next.leads[0]?.id ?? null);
      setPriorityFilter('all');
      setTelegramOnly(false);
    } catch (loadError) {
      if (requestSequence.current !== sequence) return;
      setError(errorCopy(loadError));
    } finally {
      if (requestSequence.current === sequence) setLoading(false);
    }
  }

  async function updateLifecycle(lifecycle: LeadRadarLifecycle): Promise<void> {
    if (!selectedLead || statusBusy) return;
    if (selectedLead.suppressed) return;
    if (lifecycle === 'do_not_contact' && !window.confirm('Навсегда скрыть контакты и отключить обращение к этой компании?')) return;
    setStatusBusy(true);
    setError(null);
    try {
      await api.leadRadarSetLifecycle(selectedLead.id, lifecycle);
      setResult((current) => current ? {
        ...current,
        leads: current.leads.map((lead) => lead.id === selectedLead.id
          ? {
            ...lead,
            lifecycle,
            suppressed: lifecycle === 'do_not_contact' || lead.suppressed,
            phone: lifecycle === 'do_not_contact' ? null : lead.phone,
            genericEmail: lifecycle === 'do_not_contact' ? null : lead.genericEmail,
            telegramUrl: lifecycle === 'do_not_contact' ? null : lead.telegramUrl,
            evidence: lifecycle === 'do_not_contact'
              ? lead.evidence.filter((item) => !['company_contacts.phone', 'company_contacts.generic_email', 'web.telegram'].includes(item.fieldPath))
              : lead.evidence,
          }
          : lead),
      } : current);
      void loadOverview();
    } catch (lifecycleError) {
      setError(errorCopy(lifecycleError));
    } finally {
      setStatusBusy(false);
    }
  }

  const totals = overview?.totals ?? { searches: 0, leads: 0, p1: 0, telegram: 0, replies: 0, qualified: 0 };
  const sourceStatuses = overview?.sourceHealth
    .filter((source) => source.source !== 'Открытые реестры')
    .map((source) => source.status) ?? [];
  const sourceBadge = overviewLoading
    ? { label: 'Проверяем источники…', className: 'border-white/[0.1] bg-white/[0.035] text-white/60' }
    : overviewError || sourceStatuses.length === 0
      ? { label: 'Статус источников неизвестен', className: 'border-white/[0.1] bg-white/[0.035] text-white/60' }
    : sourceStatuses.includes('blocked')
      ? { label: 'Источники недоступны', className: 'border-rose-400/25 bg-rose-400/[0.08] text-rose-200' }
      : sourceStatuses.includes('limited')
        ? { label: 'Источники работают частично', className: 'border-amber-300/25 bg-amber-300/[0.07] text-amber-100' }
        : { label: 'Открытые источники доступны', className: 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200' };

  return (
    <div className="min-h-screen overflow-hidden bg-[#05070d] text-white" data-testid="lead-radar-page">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_78%_5%,rgba(34,158,217,.12),transparent_28%),radial-gradient(circle_at_18%_30%,rgba(110,59,255,.09),transparent_30%)]" />
      <div className="relative mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 xl:p-8">
        <header className="flex flex-col gap-5 border-b border-white/[0.06] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-cyan">
              <Radar size={14} aria-hidden="true" />GPTBot Intelligence
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
              Lead Radar
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
              Ищет реальные компании, проверяет публичные факты и собирает очередь для продаж. Никаких выдуманных контактов и магических процентов.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 ${sourceBadge.className}`}>
              <Activity size={14} aria-hidden="true" />{sourceBadge.label}
            </span>
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 text-white/60"><ShieldCheck size={13} aria-hidden="true" />Только проверяемые факты</span>
          </div>
        </header>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-4 text-sm text-rose-100">
            <CircleHelp size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1">{error}</div>
            <button type="button" onClick={() => setError(null)} className="min-h-11 px-2 text-xs text-rose-100/70">Закрыть</button>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="space-y-6">
            <section aria-labelledby="search-title" className="overflow-hidden rounded-[1.75rem] border border-white/[0.09] bg-[#08111f]/90 shadow-[0_30px_80px_-50px_rgba(34,158,217,.75)]">
              <div className="border-b border-white/[0.07] bg-[linear-gradient(135deg,rgba(34,158,217,.11),rgba(47,230,209,.04))] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-cyan">Новый поиск</p>
                    <h2 id="search-title" className="mt-1 text-lg font-semibold text-white">Опишите идеального клиента</h2>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-xl border border-brand-cyan/20 bg-brand-cyan/[0.07]"><Target size={18} className="text-brand-cyan" aria-hidden="true" /></div>
                </div>
              </div>
              <form className="space-y-4 p-5" aria-busy={loading} onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
                <div>
                  <Label htmlFor="lead-radar-niche">Ниша</Label>
                  <Input id="lead-radar-niche" disabled={loading} value={input.niche} onChange={(event) => setInput({ ...input, niche: event.target.value })} className="min-h-12" placeholder="Например, стоматологии" required />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
                  <div>
                    <Label htmlFor="lead-radar-city">Город</Label>
                    <Input id="lead-radar-city" disabled={loading} value={input.city} onChange={(event) => setInput({ ...input, city: event.target.value })} className="min-h-12" required />
                  </div>
                  <div>
                    <Label htmlFor="lead-radar-count">Количество</Label>
                    <Select id="lead-radar-count" disabled={loading} value={input.desiredCount} onChange={(event) => setInput({ ...input, desiredCount: Number(event.target.value) })} className="min-h-12">
                      {[10, 20, 30, 40, 50].map((count) => <option key={count} value={count}>{count} компаний</option>)}
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="lead-radar-offer">Что предлагаем</Label>
                  <Textarea id="lead-radar-offer" disabled={loading} value={input.offer} onChange={(event) => setInput({ ...input, offer: event.target.value })} className="min-h-20 resize-y" rows={2} required />
                </div>
                <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                  <span>
                    <span className="block text-sm font-medium text-white/80">Только с Telegram</span>
                    <span className="mt-0.5 block text-xs text-white/35">Сокращает выборку, но ускоряет контакт</span>
                  </span>
                  <input type="checkbox" disabled={loading} checked={input.telegramRequired} onChange={(event) => setInput({ ...input, telegramRequired: event.target.checked })} className="h-5 w-5 accent-[#2fe6d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan" />
                </label>
                <Button type="submit" size="lg" disabled={loading} className="min-h-14 w-full text-sm font-semibold">
                  {loading ? <><LoaderCircle size={18} className="animate-spin" aria-hidden="true" />Проверяем источники…</> : <><Search size={18} aria-hidden="true" />Найти компании<ArrowRight size={16} aria-hidden="true" /></>}
                </Button>
                <p className="text-center text-[11px] leading-4 text-white/30">Обычно 15–45 секунд. Число результатов может быть меньше цели — система не додумывает компании.</p>
              </form>
            </section>

            <SearchHistory searches={overview?.searches ?? []} activeId={result?.search.id} onOpen={(id) => { void openSearch(id); }} />

            <section aria-labelledby="sources-title" className="rounded-[1.5rem] border border-white/[0.07] bg-white/[0.018] p-4">
              <h2 id="sources-title" className="flex items-center gap-2 text-sm font-semibold text-white"><Database size={15} className="text-brand-cyan" aria-hidden="true" />Источники</h2>
              {overviewError && <p className="mt-2 text-xs leading-5 text-amber-100/80">Статус источников не обновился. Поиск остаётся доступен.</p>}
              <div className="mt-3 space-y-3">
                {(overview?.sourceHealth ?? []).map((source) => (
                  <div key={source.source} className="flex items-start gap-3">
                    <Activity size={14} className={`mt-0.5 shrink-0 ${source.status === 'ready' ? 'text-emerald-300' : source.status === 'blocked' ? 'text-rose-300' : 'text-amber-300'}`} aria-hidden="true" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-white/75">
                        {source.source}
                        <span className="text-[10px] font-normal text-white/55">{source.status === 'ready' ? 'доступен' : source.status === 'blocked' ? 'недоступен' : 'ограниченно'}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] leading-4 text-white/50">{source.note}</div>
                    </div>
                  </div>
                ))}
              </div>
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center text-[11px] text-white/55 underline decoration-white/20 underline-offset-4 hover:text-white">
                © OpenStreetMap contributors · ODbL
              </a>
            </section>
          </aside>

          <main className="min-w-0 space-y-6">
            <section aria-label="Метрики Lead Radar" className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
              <Metric icon={Radar} label="Запусков" value={overviewLoading ? '—' : totals.searches} />
              <Metric icon={Building2} label="Компаний" value={overviewLoading ? '—' : totals.leads} />
              <Metric icon={Sparkles} label="P1-сигнал" value={overviewLoading ? '—' : totals.p1} accent />
              <Metric icon={MessageCircle} label="С Telegram" value={overviewLoading ? '—' : totals.telegram} accent />
              <Metric icon={UserRoundCheck} label="Ответили" value={overviewLoading ? '—' : totals.replies} />
              <Metric icon={Check} label="Квалифицированы" value={overviewLoading ? '—' : totals.qualified} />
            </section>

            {!result && !loading && (
              <section className="grid min-h-[32rem] place-items-center overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[radial-gradient(circle_at_50%_40%,rgba(34,158,217,.1),transparent_34%),rgba(8,17,31,.58)] p-6 text-center">
                <div className="max-w-xl">
                  <div className="mx-auto grid h-20 w-20 place-items-center rounded-[1.5rem] border border-brand-cyan/20 bg-brand-cyan/[0.06] shadow-[0_0_70px_-25px_rgba(47,230,209,.8)]">
                    <Radar size={34} className="text-brand-cyan" aria-hidden="true" />
                  </div>
                  <h2 className="mt-6 text-2xl font-semibold tracking-tight text-white">Не база контактов. Радар возможностей.</h2>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/45">Введите нишу и город. Lead Radar соберёт только проверяемые компании и объяснит, почему каждой из них может быть актуально ваше предложение.</p>
                  <div className="mt-7 grid gap-3 text-left sm:grid-cols-3">
                    {[['01', 'Находит'], ['02', 'Проверяет'], ['03', 'Приоритизирует']].map(([step, label]) => (
                      <div key={step} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-[10px] font-semibold tracking-[0.2em] text-brand-cyan">{step}</div><div className="mt-2 text-sm font-medium text-white/75">{label}</div></div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {loading && (
              <section aria-live="polite" className="grid min-h-[28rem] place-items-center rounded-[2rem] border border-white/[0.08] bg-[#08111f]/70 p-6 text-center">
                <div>
                  <div className="relative mx-auto h-24 w-24">
                    <div className="absolute inset-0 rounded-full border border-brand-cyan/20 motion-safe:animate-ping" />
                    <div className="absolute inset-4 rounded-full border border-brand-cyan/30 motion-safe:animate-pulse" />
                    <div className="absolute inset-0 grid place-items-center"><Radar size={28} className="text-brand-cyan" aria-hidden="true" /></div>
                  </div>
                  <h2 className="mt-6 text-xl font-semibold text-white">Сканируем открытые источники</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-white/45">География → компании → сайты → контакты → доказательства → score. Не закрывайте вкладку.</p>
                </div>
              </section>
            )}

            {result && !loading && (
              <>
                <section className="rounded-[1.75rem] border border-white/[0.08] bg-[#08111f]/75 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-white">{result.search.input.niche} · {result.search.input.city}</h2>
                        <Badge tone={STATUS_COPY[result.search.status].tone}>{STATUS_COPY[result.search.status].label}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-white/55">
                        {result.search.status === 'running'
                          ? 'Поиск начат — проверяем источники и кандидатов.'
                          : result.search.status === 'failed'
                            ? 'Компании не проверялись: источник не завершил запуск.'
                            : `Проверено ${result.search.verifiedCount} из ${result.search.candidateCount} кандидатов · ${result.search.telegramCount} с Telegram`}
                      </p>
                    </div>
                    {result.leads.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Фильтры выдачи">
                        <Filter size={14} className="text-white/55" aria-hidden="true" />
                        {(['all', 'P1', 'P2', 'P3'] as const).map((filter) => (
                          <button key={filter} type="button" onClick={() => setPriorityFilter(filter)} aria-pressed={priorityFilter === filter} className={`min-h-11 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${priorityFilter === filter ? 'border-brand-cyan/30 bg-brand-cyan/[0.09] text-brand-cyan' : 'border-white/[0.08] text-white/60 hover:text-white'}`}>{filter === 'all' ? 'Все' : filter}</button>
                        ))}
                        <button type="button" onClick={() => setTelegramOnly((current) => !current)} aria-pressed={telegramOnly} className={`min-h-11 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${telegramOnly ? 'border-brand-cyan/30 bg-brand-cyan/[0.09] text-brand-cyan' : 'border-white/[0.08] text-white/60 hover:text-white'}`}>Telegram</button>
                        <button type="button" onClick={() => { void runSearch(result.search.input); }} aria-label="Повторить поиск и заново проверить источники" className="grid h-11 w-11 place-items-center rounded-full border border-white/[0.08] text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"><RefreshCw size={15} aria-hidden="true" /></button>
                      </div>
                    ) : result.search.status !== 'failed' && result.search.status !== 'running' ? (
                      <Button type="button" variant="secondary" onClick={() => { void runSearch(result.search.input); }} className="min-h-11"><RefreshCw size={15} aria-hidden="true" />Повторить</Button>
                    ) : null}
                  </div>
                </section>

                {result.search.status === 'running' ? (
                  <SearchOutcome
                    title="Поиск продолжается"
                    body="Запуск уже принят. Статус обновится автоматически; новый поиск создавать не нужно."
                    primary={{ label: 'Проверить статус', onClick: () => { void openSearch(result.search.id); } }}
                    secondary={{ label: 'Вернуться к параметрам', onClick: () => document.getElementById('lead-radar-niche')?.focus() }}
                  />
                ) : result.search.status === 'failed' && failedCopy ? (
                  <SearchOutcome
                    danger
                    title={failedCopy.title}
                    body={failedCopy.body}
                    detail={`Код: ${result.search.errorCode ?? 'discovery_failed'} · запуск ${result.search.id.slice(-8)}`}
                    primary={{ label: 'Повторить поиск', onClick: () => { void runSearch(result.search.input); } }}
                    secondary={{ label: 'Изменить параметры', onClick: () => document.getElementById('lead-radar-niche')?.focus() }}
                  />
                ) : strictTelegramEmpty && result ? (
                  <SearchOutcome
                    title="Telegram не подтверждён"
                    body={`Найдено ${result.search.candidateCount} кандидатов, но ни у одного в проверенных источниках не подтверждён Telegram. Можно показать сайты и корпоративные телефоны.`}
                    primary={{ label: 'Показать без Telegram', onClick: () => { void runSearch({ ...result.search.input, telegramRequired: false }); } }}
                    secondary={{ label: 'Изменить нишу', onClick: () => document.getElementById('lead-radar-niche')?.focus() }}
                  />
                ) : result.leads.length === 0 ? (
                  <SearchOutcome
                    title="В доступных источниках ничего не найдено"
                    body="Попробуйте более широкое название ниши. Этот результат не доказывает отсутствие компаний в городе."
                    primary={{ label: 'Изменить запрос', onClick: () => document.getElementById('lead-radar-niche')?.focus() }}
                  />
                ) : visibleLeads.length > 0 ? (
                  <div className="grid min-w-0 gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
                    <section aria-label="Список компаний" className="space-y-3 xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto xl:pr-1">
                      {visibleLeads.map((lead) => <LeadListItem key={lead.id} lead={lead} selected={selectedLead?.id === lead.id} onSelect={() => setSelectedLeadId(lead.id)} />)}
                    </section>
                    {selectedLead && <LeadDetail key={selectedLead.id} lead={selectedLead} offer={result.search.input.offer} onLifecycle={(lifecycle) => { void updateLifecycle(lifecycle); }} busy={statusBusy} />}
                  </div>
                ) : (
                  <SearchOutcome
                    title={`Фильтры скрыли ${result.leads.length} компаний`}
                    body="Сбросьте приоритет и локальный Telegram-фильтр, чтобы вернуть всю проверенную выдачу."
                    primary={{ label: 'Сбросить фильтры', onClick: () => { setPriorityFilter('all'); setTelegramOnly(false); } }}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
