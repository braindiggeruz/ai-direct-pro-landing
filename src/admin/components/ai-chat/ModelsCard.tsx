// «Модели и алерты»: which models answered, which cool down now, the free
// tier's spend today against its cap, and the alert codes of the week.
import { Badge, Card } from '../ui';
import { CardHead, count, dateTime, SectionGap, usd } from './format';
import type {
  AiChatAlerts,
  AiChatModelRow,
  AiChatModels,
  AiChatSection,
} from '../../../shared/ai-chat-admin';

function ModelTable({ title, rows, primary }: { title: string; rows: AiChatModelRow[]; primary: string | null }) {
  const answered = rows.reduce((sum, row) => sum + row.answered + row.truncated, 0);
  const head = primary ? rows.find((row) => row.model === primary) : undefined;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-sm text-white">{title}</h3>
        {primary && answered > 0 && (
          <span className="text-xs text-white/45">
            первая модель цепочки: {Math.round((100 * ((head?.answered ?? 0) + (head?.truncated ?? 0))) / answered)}% ответов
          </span>
        )}
      </div>
      {rows.length === 0 ? <p className="text-sm text-white/40">Ходов не было.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-white/45 text-xs">
                <th className="py-1.5 pr-3 font-medium">Модель</th>
                <th className="py-1.5 px-2 font-medium text-right">Ходы</th>
                <th className="py-1.5 px-2 font-medium text-right">Ответы</th>
                <th className="py-1.5 px-2 font-medium text-right">Обрезано</th>
                <th className="py-1.5 px-2 font-medium text-right">Сбои</th>
                <th className="py-1.5 px-2 font-medium text-right">1-й токен, мс</th>
                <th className="py-1.5 pl-2 font-medium text-right">Расход</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.model ?? '—'} className="border-t border-white/5">
                  <td className="py-1.5 pr-3 text-white/85">{row.model ?? 'модель не выбрана'}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{count(row.turns)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{count(row.answered)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{count(row.truncated)}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums ${row.failed ? 'text-red-300' : ''}`}>{count(row.failed)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{count(row.ttftAvgMs)}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{usd(row.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ModelsCard({
  models,
  alerts,
  primary,
}: {
  models: AiChatSection<AiChatModels>;
  alerts: AiChatSection<AiChatAlerts>;
  /** The first model of the free chain (from readiness), for its share of answers. */
  primary: string | null;
}) {
  return (
    <Card data-testid="ai-chat-models">
      <CardHead title="Модели и алерты" hint="Ходы с итогом (с релиза R1): какая модель ответила, сколько ждали первый токен и сколько это стоило по прайсу."/>
      {!models.ok ? <SectionGap error={models.error}/> : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <ModelTable title="За 24 часа" rows={models.data.last24h} primary={primary}/>
            <ModelTable title="За 7 дней" rows={models.data.last7d} primary={primary}/>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 mt-5 text-sm">
            <div>
              <div className="text-white/50 text-xs uppercase tracking-wide mb-1">На паузе сейчас</div>
              {models.data.blocked.length === 0 ? <span className="text-emerald-300">ни одной модели</span> : (
                <ul className="space-y-1">
                  {models.data.blocked.map((row) => (
                    <li key={row.model}>
                      <code className="text-amber-200">{row.model}</code>
                      <span className="text-white/50"> · {row.code} · до {dateTime(row.until)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-white/50 text-xs uppercase tracking-wide mb-1">Платные модели у бесплатных сегодня (UTC)</div>
              {models.data.spendToday
                ? <span>{usd(models.data.spendToday.usd)} из {usd(models.data.spendToday.capUsd)} · в резерве {usd(models.data.spendToday.reservedUsd)} · попыток {count(models.data.spendToday.attempts)}</span>
                : <span className="text-white/40">—</span>}
            </div>
          </div>
        </>
      )}
      <div className="mt-6" data-testid="ai-chat-alerts">
        <h3 className="text-sm text-white mb-2">Алерты за 7 дней</h3>
        {!alerts.ok ? <SectionGap error={alerts.error}/> : (
          <>
            <p className="text-xs text-white/45 mb-2">
              Сторож тишины: {dateTime(alerts.data.watchdogLastRun)} · проверка моделей: {dateTime(alerts.data.catalogueLastRun)}.
              Одна строка кода — один час (у дневных — сутки), в которые он случился.
            </p>
            {alerts.data.last7d.length === 0 ? <p className="text-sm text-emerald-300">Алертов не было.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-white/45 text-xs">
                      <th className="py-1.5 pr-3 font-medium">Код</th>
                      <th className="py-1.5 px-2 font-medium text-right">Часов</th>
                      <th className="py-1.5 px-2 font-medium text-right">Доставлено</th>
                      <th className="py-1.5 pl-2 font-medium">Последний</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.data.last7d.map((row) => (
                      <tr key={row.code} className="border-t border-white/5 align-top">
                        <td className="py-1.5 pr-3">
                          <code className="text-white/85">{row.code}</code>{' '}
                          {row.urgent && <Badge tone="danger">срочный</Badge>}
                          {row.text && <span className="block text-xs text-white/45">{row.text}</span>}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{count(row.n)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{row.urgent ? count(row.delivered) : 'фон'}</td>
                        <td className="py-1.5 pl-2 whitespace-nowrap text-white/70">{dateTime(row.lastAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
