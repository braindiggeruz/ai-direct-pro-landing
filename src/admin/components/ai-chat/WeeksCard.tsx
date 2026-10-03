// «Недели»: the last weeks (Monday 00:00 Tashkent) side by side. A dash means
// the metric was not written that week yet, never a calm zero.
import { Card } from '../ui';
import { CardHead, count, SectionGap, weekLabel } from './format';
import type { AiChatSection, AiChatWeek } from '../../../shared/ai-chat-admin';

interface Metric {
  label: string;
  hint?: string;
  value: (week: AiChatWeek) => string;
  /** Visually a sub-row of the metric above. */
  sub?: boolean;
  /** The value is not final yet: shown dimmed. */
  dim?: (week: AiChatWeek) => boolean;
}

function sum(record: Record<string, number> | null): number | null {
  return record ? Object.values(record).reduce((a, b) => a + b, 0) : null;
}

function share(part: number | null | undefined, whole: number): string {
  return part === null || part === undefined || !whole ? '—' : `${Math.round((100 * part) / whole)}%`;
}

const LIMIT_REASON: Readonly<Record<string, string>> = {
  hourly: 'час',
  daily: 'сутки',
  pack_daily: 'сутки пакета',
  monthly: 'пакет кончился',
  busy: 'занято',
  ip: 'частота с IP',
};

const METRICS: readonly Metric[] = [
  { label: 'Сессии RU / UZ', value: (w) => `${count(w.sessions.ru)} / ${count(w.sessions.uz)}` },
  { label: 'Ходы', value: (w) => count(w.turns) },
  { label: 'Ответы', hint: 'ответ дошёл и засчитан', value: (w) => count(w.answered) },
  {
    label: 'Без ответа',
    hint: 'сбой провайдера или нет модели, доля от ходов',
    value: (w) => (w.outcomes ? `${count(w.outcomes.failed)} · ${share(w.outcomes.failed, w.turns)}` : '—'),
  },
  {
    label: 'Обрезано по длине',
    hint: 'такой ответ не списывается',
    value: (w) => (w.outcomes ? `${count(w.outcomes.truncated)} · ${share(w.outcomes.truncated, w.turns)}` : '—'),
  },
  { label: '«Стоп» и уход', value: (w) => count(w.outcomes?.stopped) },
  { label: 'Зависшие резервы', value: (w) => count(w.stuck) },
  {
    label: 'Упоры в лимит (429)',
    value: (w) => count(sum(w.limitHits)),
  },
  ...Object.entries(LIMIT_REASON).map(([reason, label]) => ({
    label,
    sub: true,
    value: (w: AiChatWeek) => (w.limitHits ? count(w.limitHits[reason] ?? 0) : '—'),
  })),
  { label: 'Окно пакета открыто', value: (w) => count(w.funnel?.packViewed) },
  { label: 'Вход начат / успешен', value: (w) => (w.funnel ? `${count(w.funnel.loginStarted)} / ${count(w.funnel.loginDone)}` : '—') },
  { label: 'Оплата начата / прошла', value: (w) => (w.funnel ? `${count(w.funnel.checkoutStarted)} / ${count(w.funnel.checkoutPaid)}` : '—') },
  {
    label: 'Заказы live: созданы / оплачены / возврат',
    value: (w) => (w.orders ? `${count(w.orders.created)} / ${count(w.orders.paid)} / ${count(w.orders.refunded)}` : '—'),
  },
  { label: 'Заявки', value: (w) => count(sum(w.leads)) },
  {
    label: 'NS-1: вернулись / новых',
    hint: 'IP-группы, впервые пришедшие на неделе, которые получили ответы в 2+ разных дня за свои первые 7 дней',
    value: (w) =>
      w.northStar.entries
        ? `${count(w.northStar.returned)} / ${count(w.northStar.entries)} · ${w.northStar.per100 ?? '—'} на 100`
        : '0',
    dim: (w) => !w.northStar.readable,
  },
];

export function WeeksCard({ section, requestId }: { section: AiChatSection<AiChatWeek[]>; requestId?: string }) {
  return (
    <Card data-testid="ai-chat-weeks">
      <CardHead
        title="Недели"
        hint="Неделя — с понедельника 00:00 по Ташкенту. «—» значит, что метрика в ту неделю ещё не писалась. NS-1 серым — когорта ещё не дозрела (14 дней) или старше хранимой истории."
      />
      {!section.ok ? <SectionGap error={section.error} requestId={requestId}/> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-white/45 text-xs">
                <th className="py-2 pr-4 font-medium sticky left-0 bg-bg-surface">Неделя с</th>
                {section.data.map((w) => (
                  <th key={w.week} className="py-2 px-3 font-medium text-right">{weekLabel(w.week)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((metric) => (
                <tr key={metric.label} className="border-t border-white/5">
                  <th
                    scope="row"
                    title={metric.hint}
                    className={`py-1.5 pr-4 text-left font-normal sticky left-0 bg-bg-surface ${metric.sub ? 'pl-4 text-white/40 text-xs' : 'text-white/70'}`}
                  >
                    {metric.label}
                  </th>
                  {section.data.map((w) => (
                    <td
                      key={w.week}
                      className={`py-1.5 px-3 text-right tabular-nums ${metric.sub ? 'text-white/45 text-xs' : metric.dim?.(w) ? 'text-white/35' : 'text-white/85'}`}
                    >
                      {metric.value(w)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-white/5">
                <th scope="row" className="py-1.5 pr-4 text-left font-normal text-white/40 text-xs pl-4 sticky left-0 bg-bg-surface">заявки по источнику</th>
                {section.data.map((w) => (
                  <td key={w.week} className="py-1.5 px-3 text-right text-white/45 text-xs">
                    {Object.entries(w.leads).map(([source, n]) => `${source} ${n}`).join(', ') || '0'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
