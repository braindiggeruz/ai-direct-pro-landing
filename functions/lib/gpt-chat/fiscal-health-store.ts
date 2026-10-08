export interface FiscalHealth { product: 'chat'|'studio'; provider: string; error: string; queued: number; attempts: number; oldestPaidAt: number }

/** Fixed explanations, never raw provider messages or payment identifiers. */
export function renderFiscalHealth(row: FiscalHealth): string {
  const reasons: Readonly<Record<string, string>> = {
    'payment_id:click_-12': 'Merchant API отклонил данные поставщика (-12): сверьте доступ и реквизиты сервиса Click; поиск платежа не выполнен',
    submit_unknown: 'ответ на отправку чека не подтверждён: выполняется только сверка с ОФД, автоматическая повторная отправка заблокирована',
    'submit:lease_lost': 'отправка не начата: обработку очереди уже забрал другой процесс',
  };
  const detail = row.provider === 'click' ? reasons[row.error] : undefined;
  return `${row.provider}/${row.product}: ожидают ${row.queued}; ${detail ?? row.error}; обработок очереди ${row.attempts}.`;
}

/** Read-only aggregate; no order/account/payment ids or provider messages leave storage. */
export class FiscalHealthStore {
  constructor(readonly db: D1Database) {}
  async pending(orgId: string): Promise<FiscalHealth[]> {
    const result = await this.db.prepare(`SELECT CASE WHEN f.order_id LIKE 'stu_%' THEN 'studio' ELSE 'chat' END AS product,
      f.provider,f.last_error AS error,COUNT(*) AS queued,MAX(f.attempts) AS attempts,
      MIN(COALESCE(s.perform_time,p.perform_time)) AS oldestPaidAt
      FROM gpt_fiscal_receipts f
      LEFT JOIN studio_orders_v2 s ON s.org_id=f.org_id AND s.id=f.order_id
      LEFT JOIN gpt_payment_orders p ON p.org_id=f.org_id AND p.id=f.order_id
      WHERE f.org_id=? AND f.status_code=-1 AND COALESCE(s.mode,p.mode)='live' AND COALESCE(s.state,p.state)='paid'
      GROUP BY product,f.provider,f.last_error LIMIT 50`).bind(orgId).all<FiscalHealth>();
    return (result.results??[]).map(row=>({...row,
      error: /^[a-zA-Z0-9_:.-]{1,80}$/.test(row.error??'') ? row.error : 'unknown',
      queued:Number(row.queued),attempts:Number(row.attempts),oldestPaidAt:Number(row.oldestPaidAt)}));
  }
}
