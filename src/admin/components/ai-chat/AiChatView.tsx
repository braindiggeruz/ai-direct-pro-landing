// The «AI-чат» page without its requests: what the page renders and what tests
// render with fixed data (src/admin/pages/AiChat.tsx owns the requests).
import { RefreshCw } from 'lucide-react';
import { Button, Card } from '../ui';
import { ReadinessCard } from './ReadinessCard';
import { WeeksCard } from './WeeksCard';
import { ModelsCard } from './ModelsCard';
import { PaymentsCard } from './PaymentsCard';
import { VisitorsCard } from './VisitorsCard';
import { dateTime } from './format';
import type { AiChatPaymentsFilter } from '../../lib/ai-chat-api';
import type { OwnerApiError } from '../../lib/owner-api';
import type {
  AiChatOverview,
  AiChatPayments,
  AiChatRefundRecordInput,
  AiChatRefundRecordResult,
  AiChatRehearsalResult,
  AiChatVisitors,
} from '../../../shared/ai-chat-admin';

export interface AiChatViewProps {
  overview: AiChatOverview | null;
  /** The last answers of the lists (null while they load); a failed query shows their request id. */
  payments: AiChatPayments | null;
  visitors: AiChatVisitors | null;
  /** Requests that failed as a whole (no access, network): code and request id. */
  failures: Array<Pick<OwnerApiError, 'code' | 'requestId'>>;
  refreshing: boolean;
  filter: AiChatPaymentsFilter;
  days: number;
  loadingMore: boolean;
  onRefresh: () => void;
  onFilter: (filter: AiChatPaymentsFilter) => void;
  onMore: () => void;
  onDays: (days: number) => void;
  onRecordRefund: (input: AiChatRefundRecordInput) => Promise<AiChatRefundRecordResult>;
  onOpenRehearsal: (account: boolean) => Promise<AiChatRehearsalResult>;
}

export function AiChatView(props: AiChatViewProps) {
  const { overview } = props;
  const primary = overview?.readiness.ok ? overview.readiness.data.models.freeChain[0] ?? null : null;
  return (
    <div className="p-6 sm:p-8 space-y-6" data-testid="ai-chat-page">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-white">AI-чат</h1>
          <p className="text-white/50 text-sm mt-1 max-w-3xl">
            Готовность оплаты, недели, модели и алерты, оплаты и IP-группы. Только для владельца.
            Без текстов разговоров, IP и Telegram: только счётчики, имена настроек и псевдонимы.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overview && <span className="text-xs text-white/40">Обновлено {dateTime(overview.generatedAt)}</span>}
          <Button variant="secondary" size="sm" onClick={props.onRefresh} disabled={props.refreshing} data-testid="ai-chat-refresh">
            <RefreshCw size={14} className={props.refreshing ? 'animate-spin motion-reduce:animate-none' : ''}/>
            {props.refreshing ? 'Обновляем…' : 'Обновить'}
          </Button>
        </div>
      </header>
      {props.failures.map((failure, index) => (
        <Card key={index} className="!p-4 border-red-500/30" role="alert">
          <p className="text-sm text-red-300">
            Запрос не прошёл: <code>{failure.code}</code>
            {failure.requestId && <span className="text-white/40"> · {failure.requestId}</span>}
          </p>
        </Card>
      ))}
      {!overview ? (
        <Card><p className="text-sm text-white/40">{props.refreshing ? 'Загрузка…' : 'Нет данных.'}</p></Card>
      ) : (
        <>
          <ReadinessCard section={overview.readiness} requestId={overview.request_id} onOpenRehearsal={props.onOpenRehearsal}/>
          <WeeksCard section={overview.weeks} requestId={overview.request_id}/>
          <ModelsCard models={overview.models} alerts={overview.alerts} primary={primary} requestId={overview.request_id}/>
        </>
      )}
      <PaymentsCard
        page={props.payments?.payments ?? null}
        requestId={props.payments?.request_id}
        filter={props.filter}
        loadingMore={props.loadingMore}
        onFilter={props.onFilter}
        onMore={props.onMore}
        onRecord={props.onRecordRefund}
      />
      <VisitorsCard section={props.visitors?.visitors ?? null} requestId={props.visitors?.request_id} days={props.days} onDays={props.onDays}/>
    </div>
  );
}
