export interface LeadAcknowledgement {
  ok?: unknown;
  id?: unknown;
  duplicate?: unknown;
  idempotent?: unknown;
  delivery?: unknown;
}

export interface LeadConversionScope {
  localStorage?: Pick<Storage, 'getItem' | 'setItem'>;
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem'>;
  __gptbotLeadConversions?: Record<string, number>;
}

/**
 * Browser-side counting only: acknowledgement still means UI success even
 * when this returns false. A contact duplicate is not a new lead; an
 * idempotent acknowledgement can recover the first response lost in transit.
 * Opaque receipt/request keys stay in a bounded local ledger, never analytics.
 * Self-contained so the prerendered form embeds exactly the same function.
 */
export function shouldTrackLead(
  result: LeadAcknowledgement,
  requestId: string,
  scope: LeadConversionScope = window,
): boolean {
  if (result.ok !== true || (result.duplicate === true && result.idempotent !== true)) return false;
  const key = typeof result.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(result.id)
    ? 'id:' + result.id
    : /^[A-Za-z0-9_-]{16,80}$/.test(requestId) ? 'request:' + requestId : '';
  if (!key) return false;
  const now = Date.now(), cutoff = now - 30 * 86400000;
  const ledger: Record<string, number> = {};
  const memory = scope.__gptbotLeadConversions || {};
  for (const item in memory) {
    if (memory[item] > cutoff && memory[item] <= now) ledger[item] = memory[item];
  }
  const stores: Array<Pick<Storage, 'getItem' | 'setItem'>> = [];
  for (const kind of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = scope[kind];
      if (!storage) continue;
      stores.push(storage);
      const raw = storage.getItem('gptbot_lead_conversions_v1');
      const saved: unknown = raw && JSON.parse(raw);
      if (!Array.isArray(saved)) continue;
      for (const row of saved.slice(-100)) {
        if (Array.isArray(row) && typeof row[0] === 'string' && /^(id|request):[A-Za-z0-9_-]{1,100}$/.test(row[0])
          && typeof row[1] === 'number' && row[1] > cutoff && row[1] <= now) ledger[row[0]] = row[1];
      }
    } catch { /* Blocked/malformed storage must never prevent lead intake. */ }
  }
  const seen = Object.prototype.hasOwnProperty.call(ledger, key);
  ledger[key] = now;
  const rows: Array<[string, number]> = [];
  for (const item of Object.keys(ledger).slice(-100)) rows.push([item, ledger[item]]);
  const bounded: Record<string, number> = {};
  for (const row of rows) bounded[row[0]] = row[1];
  scope.__gptbotLeadConversions = bounded;
  for (const storage of stores) {
    try { storage.setItem('gptbot_lead_conversions_v1', JSON.stringify(rows)); } catch { /* memory fallback */ }
  }
  return !seen;
}
