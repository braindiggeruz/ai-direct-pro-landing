const MIGRATION = '0046_lead_radar_telegram_campaign_safety.sql';

const TABLE_COLUMNS = {
  lead_radar_tg_user_accounts: [
    'id', 'org_id', 'gateway_account_ref', 'gateway_account_ref_digest',
    'masked_label', 'status', 'auth_request_digest', 'request_idempotency_digest',
    'request_fingerprint', 'connected_at', 'last_health_at',
    'quota_day', 'daily_reserved_count', 'next_dispatch_at',
    'dispatch_lease_campaign_id', 'dispatch_lease_digest',
    'dispatch_lease_expires_at', 'revoked_at', 'created_at', 'updated_at',
    'state_version',
  ],
  lead_radar_tg_campaign_approvals: [
    'id', 'org_id', 'account_id', 'token_digest', 'idempotency_key_digest', 'selection_digest',
    'content_digest', 'request_fingerprint', 'operator_digest', 'contact_basis',
    'recipient_count', 'expires_at', 'consumed_at', 'consumed_campaign_id',
    'created_at',
  ],
  lead_radar_tg_campaigns: [
    'id', 'org_id', 'account_id', 'approval_id', 'idempotency_key_digest',
    'request_fingerprint', 'selection_digest', 'content_digest',
    'operator_digest', 'contact_basis', 'template_ciphertext', 'template_iv',
    'status', 'pause_reason', 'last_error_code', 'recipient_count', 'sent_count',
    'failed_count', 'ambiguous_count', 'skipped_count', 'min_interval_seconds',
    'next_send_at', 'approved_at', 'started_at', 'stopped_at', 'completed_at',
    'failed_at', 'created_at', 'updated_at', 'state_version',
  ],
  lead_radar_tg_campaign_recipients: [
    'id', 'org_id', 'campaign_id', 'company_id', 'sequence_no',
    'endpoint_ciphertext', 'endpoint_iv', 'endpoint_digest', 'payload_ciphertext',
    'payload_iv', 'rendered_content_digest', 'contact_fingerprint',
    'status', 'claim_digest', 'lease_expires_at', 'attempt_count',
    'provider_message_digest', 'last_error_code', 'claimed_at', 'dispatching_at',
    'sent_at', 'completed_at', 'created_at', 'updated_at',
  ],
  lead_radar_tg_campaign_effects: [
    'id', 'org_id', 'campaign_id', 'recipient_id', 'effect_key_digest',
    'payload_digest', 'status', 'provider_message_digest', 'created_at',
    'updated_at', 'completed_at',
  ],
  lead_radar_tg_campaign_operations: [
    'id', 'org_id', 'campaign_id', 'operation_digest', 'request_fingerprint',
    'operator_digest', 'action', 'result_status', 'created_at',
  ],
  lead_radar_tg_account_safety: [
    'account_id', 'org_id', 'state', 'reason_code', 'blocked_until',
    'created_at', 'updated_at',
  ],
  lead_radar_tg_campaign_safety: [
    'campaign_id', 'org_id', 'search_id', 'evidence_version',
    'created_at', 'updated_at',
  ],
  lead_radar_tg_contact_authorizations: [
    'id', 'org_id', 'company_id', 'endpoint_digest', 'contact_basis',
    'evidence_reference_digest', 'reviewer_digest', 'idempotency_key_digest',
    'request_fingerprint', 'evidence_version', 'verified_at', 'expires_at',
    'revoked_at', 'status', 'created_at', 'updated_at',
  ],
  lead_radar_tg_recipient_eligibility: [
    'recipient_id', 'org_id', 'campaign_id', 'authorization_id', 'contact_basis',
    'evidence_digest', 'reviewer_digest', 'evidence_version', 'verified_at', 'expires_at',
    'created_at', 'updated_at',
  ],
} as const;

const REQUIRED_UNIQUE_COLUMN_SETS: Record<keyof typeof TABLE_COLUMNS, string[][]> = {
  lead_radar_tg_user_accounts: [
    ['org_id', 'id'],
    ['org_id', 'request_idempotency_digest'],
    ['org_id', 'gateway_account_ref_digest'],
  ],
  lead_radar_tg_campaign_approvals: [
    ['org_id', 'id'],
    ['org_id', 'token_digest'],
    ['org_id', 'idempotency_key_digest'],
  ],
  lead_radar_tg_campaigns: [
    ['org_id', 'id'],
    ['org_id', 'idempotency_key_digest'],
    ['org_id', 'approval_id'],
  ],
  lead_radar_tg_campaign_recipients: [
    ['org_id', 'id'],
    ['org_id', 'campaign_id', 'sequence_no'],
    ['org_id', 'campaign_id', 'company_id'],
  ],
  lead_radar_tg_campaign_effects: [
    ['org_id', 'id'],
    ['org_id', 'recipient_id'],
    ['org_id', 'effect_key_digest'],
  ],
  lead_radar_tg_campaign_operations: [
    ['org_id', 'id'],
    ['org_id', 'operation_digest'],
  ],
  lead_radar_tg_account_safety: [
    ['org_id', 'account_id'],
  ],
  lead_radar_tg_campaign_safety: [
    ['org_id', 'campaign_id'],
  ],
  lead_radar_tg_contact_authorizations: [
    ['org_id', 'id'],
    ['org_id', 'idempotency_key_digest'],
  ],
  lead_radar_tg_recipient_eligibility: [
    ['org_id', 'recipient_id'],
    ['org_id', 'campaign_id', 'recipient_id'],
  ],
};

const REQUIRED_FOREIGN_KEYS: Partial<Record<keyof typeof TABLE_COLUMNS, string[]>> = {
  lead_radar_tg_campaign_approvals: [
    'org_id,account_id->lead_radar_tg_user_accounts(org_id,id):CASCADE',
  ],
  lead_radar_tg_campaigns: [
    'org_id,account_id->lead_radar_tg_user_accounts(org_id,id):RESTRICT',
    'org_id,approval_id->lead_radar_tg_campaign_approvals(org_id,id):RESTRICT',
  ],
  lead_radar_tg_campaign_recipients: [
    'org_id,campaign_id->lead_radar_tg_campaigns(org_id,id):CASCADE',
    'org_id,company_id->lead_radar_companies(org_id,id):RESTRICT',
  ],
  lead_radar_tg_campaign_effects: [
    'org_id,campaign_id->lead_radar_tg_campaigns(org_id,id):CASCADE',
    'org_id,recipient_id->lead_radar_tg_campaign_recipients(org_id,id):CASCADE',
  ],
  lead_radar_tg_campaign_operations: [
    'org_id,campaign_id->lead_radar_tg_campaigns(org_id,id):CASCADE',
  ],
  lead_radar_tg_account_safety: [
    'org_id,account_id->lead_radar_tg_user_accounts(org_id,id):CASCADE',
  ],
  lead_radar_tg_campaign_safety: [
    'org_id,campaign_id->lead_radar_tg_campaigns(org_id,id):CASCADE',
  ],
  lead_radar_tg_contact_authorizations: [
    'org_id,company_id->lead_radar_companies(org_id,id):CASCADE',
  ],
  lead_radar_tg_recipient_eligibility: [
    'org_id,authorization_id->lead_radar_tg_contact_authorizations(org_id,id):RESTRICT',
    'org_id,campaign_id->lead_radar_tg_campaigns(org_id,id):CASCADE',
    'org_id,recipient_id->lead_radar_tg_campaign_recipients(org_id,id):CASCADE',
  ],
};

interface PragmaColumnRow {
  name: string;
}

interface PragmaIndexRow {
  name: string;
  unique: number;
  partial: number;
}

interface PragmaForeignKeyRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_delete: string;
}

export interface TelegramCampaignSchemaReport {
  status: 'pass' | 'blocked';
  readOnly: true;
  contractVersion: 'lead-radar-telegram-campaign-v2';
  issues: string[];
}

function equal(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function indexColumnSets(
  db: D1Database,
  table: string,
): Promise<{ sets: string[][]; indexes: PragmaIndexRow[] }> {
  const listed = await db.prepare(`PRAGMA index_list('${table}')`).all<PragmaIndexRow>();
  const indexes = listed.results ?? [];
  const sets: string[][] = [];
  for (const index of indexes.filter((item) => Number(item.unique) === 1)) {
    const rows = await db.prepare(`PRAGMA index_info('${index.name}')`).all<{
      seqno: number;
      name: string;
    }>();
    sets.push((rows.results ?? [])
      .sort((left, right) => Number(left.seqno) - Number(right.seqno))
      .map((row) => row.name));
  }
  return { sets, indexes };
}

async function foreignKeys(db: D1Database, table: string): Promise<string[]> {
  const rows = await db.prepare(`PRAGMA foreign_key_list('${table}')`).all<PragmaForeignKeyRow>();
  const grouped = new Map<number, PragmaForeignKeyRow[]>();
  for (const row of rows.results ?? []) {
    const current = grouped.get(Number(row.id)) ?? [];
    current.push(row);
    grouped.set(Number(row.id), current);
  }
  return [...grouped.values()].map((group) => {
    const ordered = group.sort((left, right) => Number(left.seq) - Number(right.seq));
    const first = ordered[0];
    return `${ordered.map((row) => row.from).join(',')}->${first?.table ?? ''}(${ordered.map((row) => row.to).join(',')}):${String(first?.on_delete ?? '').toUpperCase()}`;
  }).sort();
}

/** Exact, read-only contract for the optional 0045+0046 campaign extension. */
export async function auditTelegramCampaignSchema(
  db: D1Database,
): Promise<TelegramCampaignSchemaReport> {
  const issues: string[] = [];
  try {
    for (const [table, expectedColumns] of Object.entries(TABLE_COLUMNS) as Array<[
      keyof typeof TABLE_COLUMNS,
      readonly string[],
    ]>) {
      const columns = await db.prepare(`PRAGMA table_info('${table}')`).all<PragmaColumnRow>();
      const actualColumns = (columns.results ?? []).map((row) => row.name);
      if (!equal(actualColumns, expectedColumns)) issues.push(`columns:${table}`);

      const { sets, indexes } = await indexColumnSets(db, table);
      for (const required of REQUIRED_UNIQUE_COLUMN_SETS[table]) {
        if (!sets.some((actual) => equal(actual, required))) {
          issues.push(`unique:${table}:${required.join(',')}`);
        }
      }
      if (table === 'lead_radar_tg_user_accounts') {
        const active = indexes.find((index) => index.name === 'idx_lead_radar_tg_user_accounts_active_org');
        if (!active || Number(active.unique) !== 1 || Number(active.partial) !== 1) {
          issues.push('unique_partial:lead_radar_tg_user_accounts');
        }
      }
      if (table === 'lead_radar_tg_campaigns') {
        const active = indexes.find((index) => (
          index.name === 'idx_lead_radar_tg_campaigns_one_non_terminal'
        ));
        if (!active || Number(active.unique) !== 1 || Number(active.partial) !== 1) {
          issues.push('unique_partial:lead_radar_tg_campaigns');
        }
      }

      const requiredForeignKeys = [...(REQUIRED_FOREIGN_KEYS[table] ?? [])].sort();
      if (!equal(await foreignKeys(db, table), requiredForeignKeys)) {
        issues.push(`foreign_keys:${table}`);
      }
    }
    const ledger = await db.prepare(`SELECT name FROM d1_migrations WHERE name = ? LIMIT 1`)
      .bind(MIGRATION)
      .first<{ name: string }>();
    if (ledger?.name !== MIGRATION) issues.push('migration_ledger:0046');
    const integrity = await db.prepare('PRAGMA quick_check').all<{ quick_check: string }>();
    if ((integrity.results ?? []).map((row) => row.quick_check).join(',') !== 'ok') {
      issues.push('quick_check');
    }
    const violations = await db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>();
    if ((violations.results ?? []).length > 0) issues.push('foreign_key_check');
  } catch {
    issues.push('audit_query_failed');
  }
  return {
    status: issues.length === 0 ? 'pass' : 'blocked',
    readOnly: true,
    contractVersion: 'lead-radar-telegram-campaign-v2',
    issues,
  };
}

export async function hasExactTelegramCampaignSchema(db: D1Database): Promise<boolean> {
  return (await auditTelegramCampaignSchema(db)).status === 'pass';
}
