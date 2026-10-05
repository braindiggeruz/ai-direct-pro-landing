// /admin-tools/ai-chat — the owner's view of the paid AI chat (paid-chat plan
// WP-19, D10): readiness, the weeks, models and alerts, payments and refunds,
// IP groups. Loaded lazily (AdminApp.tsx), owner only on the server
// (platform_owner). Read when opened and on «Обновить», never on a timer: the
// Workers Free plan has 100 000 requests a day for the whole site.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AiChatView, type AiChatViewProps } from '../components/ai-chat/AiChatView';
import { aiChatApi, type AiChatPaymentsFilter } from '../lib/ai-chat-api';
import type { OwnerApiError } from '../lib/owner-api';
import {
  AI_CHAT_VISITOR_DAYS,
  type AiChatOverview,
  type AiChatPayments,
  type AiChatVisitors,
} from '../../shared/ai-chat-admin';

export default function AiChat() {
  const [overview, setOverview] = useState<AiChatOverview | null>(null);
  const [payments, setPayments] = useState<AiChatPayments | null>(null);
  const [visitors, setVisitors] = useState<AiChatVisitors | null>(null);
  const [failures, setFailures] = useState<AiChatViewProps['failures']>([]);
  const [refreshing, setRefreshing] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<AiChatPaymentsFilter>({});
  const [days, setDays] = useState<number>(AI_CHAT_VISITOR_DAYS.default);
  // The newest list request wins: an answer to an older filter is dropped.
  const paymentsTicket = useRef(0);
  const visitorsTicket = useRef(0);

  const fail = useCallback((error: unknown) => {
    const { code = 'request_failed', requestId = null } = error as Partial<OwnerApiError>;
    setFailures((list) => [...list, { code, requestId }]);
  }, []);

  const loadPayments = useCallback(async (next: AiChatPaymentsFilter) => {
    const ticket = ++paymentsTicket.current;
    setPayments(null);
    try {
      const answer = await aiChatApi.payments(next);
      if (ticket === paymentsTicket.current) setPayments(answer);
    } catch (error) {
      if (ticket === paymentsTicket.current) fail(error);
    }
  }, [fail]);

  const loadVisitors = useCallback(async (n: number) => {
    const ticket = ++visitorsTicket.current;
    setVisitors(null);
    try {
      const answer = await aiChatApi.visitors(n);
      if (ticket === visitorsTicket.current) setVisitors(answer);
    } catch (error) {
      if (ticket === visitorsTicket.current) fail(error);
    }
  }, [fail]);

  const refresh = useCallback(async (current: { filter: AiChatPaymentsFilter; days: number }) => {
    setRefreshing(true);
    setFailures([]);
    await Promise.all([
      aiChatApi.overview().then(setOverview, fail),
      loadPayments(current.filter),
      loadVisitors(current.days),
    ]);
    setRefreshing(false);
  }, [fail, loadPayments, loadVisitors]);

  // Once when the page opens; after that only the button reads again.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void refresh({ filter: {}, days: AI_CHAT_VISITOR_DAYS.default });
  }, [refresh]);

  const more = async () => {
    const current = payments?.payments;
    if (!current?.ok || !current.data.next) return;
    const ticket = paymentsTicket.current;
    setLoadingMore(true);
    try {
      const answer = await aiChatApi.payments(filter, current.data.next);
      if (ticket === paymentsTicket.current) {
        const next = answer.payments;
        if (!next.ok) fail({ code: next.error, requestId: answer.request_id });
        else
          setPayments((prev) => (prev?.payments.ok
            ? {
                ...answer,
                payments: { ok: true, error: null, data: { rows: [...prev.payments.data.rows, ...next.data.rows], next: next.data.next } },
              }
            : answer));
      }
    } catch (error) {
      fail(error);
    }
    setLoadingMore(false);
  };

  return (
    <AiChatView
      overview={overview}
      payments={payments}
      visitors={visitors}
      failures={failures}
      refreshing={refreshing}
      filter={filter}
      days={days}
      loadingMore={loadingMore}
      onRefresh={() => void refresh({ filter, days })}
      onFilter={(next) => { setFilter(next); void loadPayments(next); }}
      onMore={() => void more()}
      onDays={(n) => { setDays(n); void loadVisitors(n); }}
      onRecordRefund={async (input) => {
        const result = await aiChatApi.recordRefund(input);
        void loadPayments(filter);
        return result;
      }}
      onOpenRehearsal={(account) => aiChatApi.openRehearsal(account)}
      onRestoreLink={(query) => aiChatApi.restoreLink(query)}
    />
  );
}
