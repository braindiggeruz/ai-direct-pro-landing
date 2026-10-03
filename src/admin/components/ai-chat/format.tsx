// Shared bits of the «AI-чат» section's cards: Tashkent dates, numbers, the
// closed-list labels and the honest «нет данных» states.
import {
  AI_CHAT_ADMIN_TZ,
  type AiChatMode,
  type AiChatOrderState,
  type AiChatProvider,
  type AiChatSectionError,
} from '../../../shared/ai-chat-admin';

const DATE_TIME = new Intl.DateTimeFormat('ru-RU', {
  timeZone: AI_CHAT_ADMIN_TZ,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const DATE = new Intl.DateTimeFormat('ru-RU', {
  timeZone: AI_CHAT_ADMIN_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** A moment in Tashkent time, «03.10, 14:05»; «—» for none. */
export function dateTime(ms: number | null): string {
  return ms ? DATE_TIME.format(ms) : '—';
}

/** A Tashkent calendar day, «03.10.2026». */
export function day(ms: number | null): string {
  return ms ? DATE.format(ms) : '—';
}

/** A week label YYYY-MM-DD (Monday) as «22.09». */
export function weekLabel(week: string): string {
  return `${week.slice(8, 10)}.${week.slice(5, 7)}`;
}

export function count(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toLocaleString('ru-RU');
}

export function usd(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `$${n.toFixed(n < 1 ? 3 : 2)}`;
}

export const PROVIDER_LABEL: Readonly<Record<AiChatProvider, string>> = {
  click: 'Click',
  uzum: 'Uzum',
  payme: 'Payme',
};

export const STATE_LABEL: Readonly<Record<AiChatOrderState, string>> = {
  pending: 'создан',
  prepared: 'ждёт оплаты',
  paid: 'оплачен',
  cancelled: 'закрыт',
  refunded: 'возврат',
};

export function modeLabel(mode: AiChatMode | null): string {
  return mode === 'live' ? 'live' : mode === 'test' ? 'тест' : 'выключен';
}

const SECTION_ERROR: Readonly<Record<AiChatSectionError, string>> = {
  schema_pending: 'Таблицы для этого блока ещё нет в D1: нужна миграция. Остальные блоки работают.',
  query_failed: 'D1 не ответила на запрос этого блока. Нажмите «Обновить» позже.',
  salt_missing: 'Псевдонимы считаются с солью GPT_HASH_SALT. Пока её нет, список не показывается.',
};

/** The card body of a section that has no data, with the request id for the log. */
export function SectionGap({ error, requestId }: { error: AiChatSectionError; requestId?: string }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200" data-testid={`ai-chat-gap-${error}`}>
      {SECTION_ERROR[error]}
      {requestId && <span className="block text-xs text-amber-200/60 mt-1">Запрос: {requestId}</span>}
    </div>
  );
}

/** A card title with an optional line under it. */
export function CardHead({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="font-display text-base text-white">{title}</h2>
        {hint && <p className="text-white/45 text-xs mt-1 max-w-3xl">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
