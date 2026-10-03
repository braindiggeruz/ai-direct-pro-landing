// «IP-группы (не люди)»: the networks active last, as pseudonyms only.
import { Badge, Card, Select } from '../ui';
import { CardHead, count, day, SectionGap } from './format';
import type { AiChatSection, AiChatVisitorRow } from '../../../shared/ai-chat-admin';

const DAY_CHOICES = [1, 7, 14, 30] as const;

export function VisitorsCard({
  section,
  requestId,
  days,
  onDays,
}: {
  /** null while it loads. */
  section: AiChatSection<AiChatVisitorRow[]> | null;
  requestId?: string;
  days: number;
  onDays: (days: number) => void;
}) {
  return (
    <Card data-testid="ai-chat-visitors">
      <CardHead
        title="IP-группы (не люди)"
        hint="Одна строка — одна сеть (IP после соли). За общим IP оператора может быть много людей, а у одного человека — несколько строк. Тексты, IP и их хеши не показываются: только псевдоним."
      >
        <Select aria-label="Период" className="!w-auto text-sm" value={String(days)} onChange={(e) => onDays(Number(e.target.value))}>
          {DAY_CHOICES.map((n) => <option key={n} value={n}>{n === 1 ? 'за сутки' : `за ${n} дн.`}</option>)}
        </Select>
      </CardHead>
      {section === null ? <p className="text-sm text-white/40">Загрузка…</p>
        : !section.ok ? <SectionGap error={section.error} requestId={requestId}/>
        : section.data.length === 0 ? <p className="text-sm text-white/40">За этот период ходов не было.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-white/45 text-xs">
                  <th className="py-1.5 pr-3 font-medium">Псевдоним</th>
                  <th className="py-1.5 px-2 font-medium">Первый / последний день</th>
                  <th className="py-1.5 px-2 font-medium text-right">Дней</th>
                  <th className="py-1.5 px-2 font-medium text-right">Ходов</th>
                  <th className="py-1.5 px-2 font-medium text-right">Ответов</th>
                  <th className="py-1.5 px-2 font-medium text-right">Упоров</th>
                  <th className="py-1.5 pl-2 font-medium">Признаки</th>
                </tr>
              </thead>
              <tbody>
                {section.data.map((row) => (
                  <tr key={row.alias} className="border-t border-white/5" data-testid="ai-chat-visitor-row">
                    <td className="py-1.5 pr-3"><code className="text-white/85">{row.alias}</code></td>
                    <td className="py-1.5 px-2 text-white/70">{day(row.firstAt)} / {day(row.lastAt)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{count(row.days)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{count(row.turns)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{count(row.answered)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{count(row.limitHits)}</td>
                    <td className="py-1.5 pl-2 space-x-1">
                      {row.locale && <Badge>{row.locale.toUpperCase()}</Badge>}
                      {row.account && <Badge tone="info">аккаунт</Badge>}
                      {row.paid && <Badge tone="success">пакет</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Card>
  );
}
