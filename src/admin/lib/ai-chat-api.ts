// API client of the admin section «AI-чат» (paid-chat plan WP-19). Owner only:
// the same Bearer call and closed error codes as the Owner Control Center.
// Nothing here polls; the page calls it when opened and on its refresh button.
import { ownerCall } from './owner-api';
import type {
  AiChatMode,
  AiChatOrderState,
  AiChatOverview,
  AiChatPayments,
  AiChatProvider,
  AiChatRefundRecordInput,
  AiChatRefundRecordResult,
  AiChatRehearsalResult,
  AiChatRestoreLinkResult,
  AiChatVisitors,
} from '../../shared/ai-chat-admin';

export interface AiChatPaymentsFilter {
  provider?: AiChatProvider | null;
  state?: AiChatOrderState | null;
  mode?: AiChatMode | null;
}

function search(params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

export const aiChatApi = {
  overview: (weeks?: number) =>
    ownerCall<AiChatOverview>('GET', `/api/admin/ai-chat/overview${search({ weeks })}`),

  payments: (filter: AiChatPaymentsFilter, cursor?: string | null) =>
    ownerCall<AiChatPayments>(
      'GET',
      `/api/admin/ai-chat/payments${search({ ...filter, cursor })}`,
    ),

  visitors: (days?: number) =>
    ownerCall<AiChatVisitors>('GET', `/api/admin/ai-chat/visitors${search({ days })}`),

  recordRefund: (input: AiChatRefundRecordInput) =>
    ownerCall<AiChatRefundRecordResult>('POST', '/api/admin/ai-chat/refund-record', input),

  restoreLink: (query: string) =>
    ownerCall<AiChatRestoreLinkResult>('POST', '/api/admin/ai-chat/restore-link', { query }),

  openRehearsal: (account: boolean) =>
    ownerCall<AiChatRehearsalResult>('POST', '/api/admin/ai-chat/rehearsal-session', { account }),
};
