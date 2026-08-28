const MIGRATION = '0048_lead_radar_telegram_media_quota.sql';
const RUNTIME_MIGRATIONS = [
  '0045_lead_radar_telegram_campaigns.sql',
  '0046_lead_radar_telegram_campaign_safety.sql',
  '0047_lead_radar_telegram_campaign_media.sql',
  MIGRATION,
] as const;

// Generated from a fresh 0036+0041..0048 SQLite database by
// telegramCampaignSchemaFingerprint(). The release-time exhaustive auditor
// below remains authoritative; runtime uses this compact equivalent so a
// single Worker invocation stays below the D1 Free statement budget.
export const TELEGRAM_CAMPAIGN_SCHEMA_FINGERPRINT =
  '1ee9958cf30efcbfe5e52a4a0024d60936d230dc346d8d654a311f48c074da73';

const runtimeVerifiedBindings = new WeakSet<D1Database>();

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
  lead_radar_tg_account_finalizations: [
    'org_id', 'account_id', 'gateway_account_ref', 'gateway_account_ref_digest',
    'masked_label', 'provider_connected_at', 'account_state_version',
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
  lead_radar_tg_media_objects: [
    'org_id', 'media_id', 'media_digest', 'status', 'expires_at', 'created_at', 'updated_at',
  ],
  lead_radar_tg_media_quota_reservations: [
    'org_id', 'media_id', 'media_digest', 'size_bytes', 'status', 'expires_at',
    'created_at', 'updated_at',
  ],
  lead_radar_tg_campaign_approval_media: [
    'approval_id', 'org_id', 'media_id', 'media_digest',
  ],
  lead_radar_tg_campaign_media: [
    'campaign_id', 'org_id', 'media_id', 'media_digest',
  ],
  lead_radar_tg_recipient_business_identities: [
    'org_id', 'recipient_id', 'identity_kind', 'identity_digest',
  ],
  lead_radar_tg_contact_history: [
    'org_id', 'identity_type', 'identity_key', 'company_id', 'endpoint_digest', 'state', 'campaign_id',
    'recipient_id', 'effect_id', 'reservation_quota_day',
    'reservation_next_dispatch_at', 'created_at', 'updated_at',
  ],
  lead_radar_tg_data_key_state: [
    'org_id', 'key_fingerprint', 'established_at', 'created_at', 'updated_at',
  ],
  lead_radar_tg_routing_key_state: [
    'org_id', 'key_fingerprint', 'established_at', 'created_at', 'updated_at',
  ],
  lead_radar_tg_media_sweep_state: [
    'org_id', 'cursor', 'updated_at',
  ],
  lead_radar_tg_maintenance_state: [
    'scope', 'cursor', 'updated_at',
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
  lead_radar_tg_account_finalizations: [
    ['org_id', 'account_id'],
    ['org_id', 'gateway_account_ref_digest'],
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
  lead_radar_tg_media_objects: [
    ['org_id', 'media_id'],
    ['org_id', 'media_id', 'media_digest'],
  ],
  lead_radar_tg_media_quota_reservations: [
    ['org_id', 'media_id'],
  ],
  lead_radar_tg_campaign_approval_media: [
    ['org_id', 'approval_id'],
  ],
  lead_radar_tg_campaign_media: [
    ['org_id', 'campaign_id'],
  ],
  lead_radar_tg_recipient_business_identities: [
    ['org_id', 'recipient_id', 'identity_digest'],
    ['org_id', 'recipient_id', 'identity_kind'],
  ],
  lead_radar_tg_contact_history: [
    ['org_id', 'identity_type', 'identity_key'],
  ],
  lead_radar_tg_data_key_state: [
    ['org_id'],
  ],
  lead_radar_tg_routing_key_state: [
    ['org_id'],
  ],
  lead_radar_tg_media_sweep_state: [
    ['org_id'],
  ],
  lead_radar_tg_maintenance_state: [
    ['scope'],
  ],
};

const REQUIRED_FOREIGN_KEYS: Partial<Record<keyof typeof TABLE_COLUMNS, string[]>> = {
  lead_radar_tg_account_finalizations: [
    'org_id,account_id->lead_radar_tg_user_accounts(org_id,id):CASCADE',
  ],
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
  lead_radar_tg_campaign_approval_media: [
    'org_id,approval_id->lead_radar_tg_campaign_approvals(org_id,id):CASCADE',
    'org_id,media_id,media_digest->lead_radar_tg_media_objects(org_id,media_id,media_digest):RESTRICT',
  ],
  lead_radar_tg_campaign_media: [
    'org_id,campaign_id->lead_radar_tg_campaigns(org_id,id):CASCADE',
    'org_id,media_id,media_digest->lead_radar_tg_media_objects(org_id,media_id,media_digest):RESTRICT',
  ],
  lead_radar_tg_recipient_business_identities: [
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

interface SqliteSchemaRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string;
}

export interface TelegramCampaignSchemaReport {
  status: 'pass' | 'blocked';
  readOnly: true;
  contractVersion: 'lead-radar-telegram-campaign-v6';
  issues: string[];
}

function equal(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function stripSqlComments(sql: string): string {
  let normalized = '';
  let quote: "'" | '"' | '`' | '[' | null = null;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];
    if (quote !== null) {
      normalized += character;
      const closing = quote === '[' ? ']' : quote;
      if (character === closing) {
        if (next === closing) {
          normalized += next;
          index += 1;
        } else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === '`' || character === '[') {
      quote = character;
      normalized += character;
      continue;
    }
    if (character === '-' && next === '-') {
      index += 2;
      while (index < sql.length && sql[index] !== '\n') index += 1;
      if (index < sql.length) normalized += '\n';
      continue;
    }
    if (character === '/' && next === '*') {
      index += 2;
      while (index < sql.length && !(sql[index] === '*' && sql[index + 1] === '/')) index += 1;
      if (index < sql.length) index += 1;
      normalized += ' ';
      continue;
    }
    normalized += character;
  }
  return normalized;
}

function normalizeSql(sql: string): string {
  const source = stripSqlComments(sql);
  let normalized = '';
  let unquoted = '';
  let quote: "'" | '"' | '`' | '[' | null = null;
  const flushUnquoted = (): void => {
    normalized += unquoted
      .toLowerCase()
      .replace(/\bif\s+not\s+exists\b/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([(),=<>])\s*/g, '$1');
    unquoted = '';
  };
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (quote === null) {
      if (character === "'" || character === '"' || character === '`' || character === '[') {
        flushUnquoted();
        quote = character;
        normalized += character;
      } else unquoted += character;
      continue;
    }
    normalized += character;
    const closing = quote === '[' ? ']' : quote;
    if (character === closing) {
      if (next === closing) {
        normalized += next;
        index += 1;
      } else quote = null;
    }
  }
  flushUnquoted();
  return normalized.trim();
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const RUNTIME_TABLES = Object.keys(TABLE_COLUMNS);
const RUNTIME_TABLE_LIST = RUNTIME_TABLES.map(sqlLiteral).join(',');
// D1 shares this database with other products. Compiling all CHECK expressions
// in a global quick_check can exhaust memory even when campaign tables are sound.
// Keep integrity and foreign-key checks, scoped to the exact fingerprinted tables.
const CAMPAIGN_TABLE_FILTER = `s.type = 'table' AND s.name IN (${RUNTIME_TABLE_LIST})`;
const CAMPAIGN_QUICK_CHECK = `SELECT CASE WHEN COUNT(*) > 0
  AND MIN(q.quick_check) = 'ok' AND MAX(q.quick_check) = 'ok'
  THEN 'ok' ELSE 'failed' END AS quick_check
  FROM sqlite_schema AS s, pragma_quick_check(s.name) AS q
  WHERE ${CAMPAIGN_TABLE_FILTER}`;
const CAMPAIGN_FOREIGN_KEY_CHECK = `SELECT f.*
  FROM sqlite_schema AS s, pragma_foreign_key_check(s.name) AS f
  WHERE ${CAMPAIGN_TABLE_FILTER}`;
const RUNTIME_SCHEMA_QUERY = `SELECT type, name, tbl_name, sql FROM sqlite_schema
  WHERE sql IS NOT NULL AND type IN ('table', 'index')
    AND (name IN (${RUNTIME_TABLE_LIST}) OR tbl_name IN (${RUNTIME_TABLE_LIST}))
    AND name NOT GLOB 'sqlite_autoindex_*'
  ORDER BY type, name`;

export async function telegramCampaignSchemaFingerprint(db: D1Database): Promise<string> {
  const result = await db.prepare(RUNTIME_SCHEMA_QUERY).all<SqliteSchemaRow>();
  const rows = (result.results ?? []).sort((left, right) => {
    const leftKey = `${left.type}\u0000${left.name}`;
    const rightKey = `${right.type}\u0000${right.name}`;
    return leftKey.localeCompare(rightKey);
  });
  const canonical = rows.map((row) => [
    row.type,
    row.name,
    row.tbl_name,
    normalizeSql(row.sql),
  ].join('\u001f')).join('\u001e');
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

/** Four-query, fail-closed runtime contract for API, Queue and Cron paths. */
export async function hasRuntimeTelegramCampaignSchema(db: D1Database): Promise<boolean> {
  if (runtimeVerifiedBindings.has(db)) return true;
  try {
    const [fingerprint, ledger, integrity, violations] = await Promise.all([
      telegramCampaignSchemaFingerprint(db),
      db.prepare(`SELECT name FROM d1_migrations
        WHERE name IN (${RUNTIME_MIGRATIONS.map(sqlLiteral).join(',')}) ORDER BY name`)
        .all<{ name: string }>(),
      db.prepare(CAMPAIGN_QUICK_CHECK).all<{ quick_check: string }>(),
      db.prepare(CAMPAIGN_FOREIGN_KEY_CHECK).all<Record<string, unknown>>(),
    ]);
    const migrations = (ledger.results ?? []).map((row) => row.name).sort();
    const expectedMigrations = [...RUNTIME_MIGRATIONS].sort();
    const ready = fingerprint === TELEGRAM_CAMPAIGN_SCHEMA_FINGERPRINT
      && equal(migrations, expectedMigrations)
      && (integrity.results ?? []).map((row) => row.quick_check).join(',') === 'ok'
      && (violations.results ?? []).length === 0;
    if (ready) runtimeVerifiedBindings.add(db);
    return ready;
  } catch {
    return false;
  }
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
    if (ledger?.name !== MIGRATION) issues.push('migration_ledger:0048');
    const integrity = await db.prepare(CAMPAIGN_QUICK_CHECK).all<{ quick_check: string }>();
    if ((integrity.results ?? []).map((row) => row.quick_check).join(',') !== 'ok') {
      issues.push('quick_check');
    }
    const violations = await db.prepare(CAMPAIGN_FOREIGN_KEY_CHECK).all<Record<string, unknown>>();
    if ((violations.results ?? []).length > 0) issues.push('foreign_key_check');
  } catch {
    issues.push('audit_query_failed');
  }
  return {
    status: issues.length === 0 ? 'pass' : 'blocked',
    readOnly: true,
    contractVersion: 'lead-radar-telegram-campaign-v6',
    issues,
  };
}

export async function hasExactTelegramCampaignSchema(db: D1Database): Promise<boolean> {
  return (await auditTelegramCampaignSchema(db)).status === 'pass';
}
