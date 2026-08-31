/**
 * Canonical, read-only Lead Radar schema contract.
 *
 * The contract deliberately contains no migration or repair SQL. It is safe to
 * use from a request/queue runtime because every query emitted by the auditor
 * is a SELECT or PRAGMA and every result is limited to schema metadata,
 * integrity diagnostics, and the canonical Lead Radar migration ledger names.
 */

export type LeadRadarSchemaProfile = 'target' | 'production-preflight' | 'auto';
export type LeadRadarIntegrityPragma = 'integrity_check' | 'quick_check';
type MigrationStage = 36 | 41 | 42 | 43 | 44;

export interface LeadRadarSchemaIssue {
  code:
    | 'audit_query_failed'
    | 'missing_object'
    | 'extra_object'
    | 'object_type_mismatch'
    | 'table_sql_missing'
    | 'column_order_mismatch'
    | 'column_missing'
    | 'column_extra'
    | 'column_type_mismatch'
    | 'column_not_null_mismatch'
    | 'column_default_mismatch'
    | 'column_primary_key_mismatch'
    | 'check_missing'
    | 'check_count_mismatch'
    | 'unique_constraint_missing'
    | 'unique_constraint_count_mismatch'
    | 'index_uniqueness_mismatch'
    | 'index_partial_mismatch'
    | 'index_columns_mismatch'
    | 'index_sql_mismatch'
    | 'foreign_key_mismatch'
    | 'schema_fingerprint_mismatch'
    | 'integrity_check_failed'
    | 'foreign_key_check_failed'
    | 'migration_ledger_missing'
    | 'migration_ledger_mismatch';
  object: string;
  expected?: string;
  actual?: string;
}

export interface LeadRadarSchemaAuditReport {
  status: 'pass' | 'blocked';
  requestedProfile: LeadRadarSchemaProfile;
  matchedProfile: 'target' | 'production-preflight' | 'none';
  readOnly: true;
  contractVersion: 'lead-radar-schema-v2';
  issues: LeadRadarSchemaIssue[];
  integrity: {
    ok: boolean;
    foreignKeyViolations: number;
    scope?: 'lead_radar_tables' | 'database';
  };
  objects: {
    expected: number;
    observed: number;
  };
  migrationLedger: {
    present: boolean;
    leadRadarEntries: string[];
    migration0041: 'ledgered' | 'eligible_for_metadata_reconciliation' | 'blocked';
  };
  alternatives: {
    targetIssueCount: number;
    productionPreflightIssueCount: number;
  };
}

export interface LeadRadarSchemaReader {
  query(sql: string): Promise<Array<Record<string, unknown>>>;
}

interface ColumnContract {
  name: string;
  type: 'TEXT' | 'INTEGER' | 'REAL';
  notNull: 0 | 1;
  defaultValue: string | null;
  primaryKey: number;
  since: MigrationStage;
}

interface CheckContract {
  expression: string;
  since: MigrationStage;
}

interface ForeignKeyContract {
  columns: string[];
  targetTable: string;
  targetColumns: string[];
  onUpdate: 'NO ACTION';
  onDelete: 'CASCADE';
  match: 'NONE';
  since: MigrationStage;
}

interface TableContract {
  name: string;
  since: MigrationStage;
  columns: ColumnContract[];
  checks: CheckContract[];
  uniqueConstraints?: CheckContract[];
  foreignKeys: ForeignKeyContract[];
}

interface IndexContract {
  name: string;
  table: string;
  unique: 0 | 1;
  partial: 0 | 1;
  columns: Array<{ name: string; descending?: boolean }>;
  sql: string;
  since: MigrationStage;
}

const c = (
  name: string,
  type: ColumnContract['type'],
  notNull: 0 | 1,
  defaultValue: string | null,
  primaryKey: number,
  since: MigrationStage,
): ColumnContract => ({ name, type, notNull, defaultValue, primaryKey, since });

const k = (expression: string, since: MigrationStage): CheckContract => ({ expression, since });

const fk = (
  columns: string[],
  targetTable: string,
  targetColumns: string[],
  since: MigrationStage,
): ForeignKeyContract => ({
  columns,
  targetTable,
  targetColumns,
  onUpdate: 'NO ACTION',
  onDelete: 'CASCADE',
  match: 'NONE',
  since,
});

const TABLES: TableContract[] = [
  {
    name: 'lead_radar_searches',
    since: 36,
    columns: [
      c('id', 'TEXT', 0, null, 1, 36),
      c('org_id', 'TEXT', 1, null, 0, 36),
      c('input_json', 'TEXT', 1, null, 0, 36),
      c('status', 'TEXT', 1, null, 0, 36),
      c('candidate_count', 'INTEGER', 1, '0', 0, 36),
      c('verified_count', 'INTEGER', 1, '0', 0, 36),
      c('p1_count', 'INTEGER', 1, '0', 0, 36),
      c('p2_count', 'INTEGER', 1, '0', 0, 36),
      c('p3_count', 'INTEGER', 1, '0', 0, 36),
      c('telegram_count', 'INTEGER', 1, '0', 0, 36),
      c('error_code', 'TEXT', 0, null, 0, 36),
      c('created_at', 'TEXT', 1, null, 0, 36),
      c('completed_at', 'TEXT', 0, null, 0, 36),
      c('phase', 'TEXT', 1, "'completed'", 0, 43),
      c('raw_discovered_count', 'INTEGER', 1, '0', 0, 43),
      c('processed_count', 'INTEGER', 1, '0', 0, 43),
      c('pending_count', 'INTEGER', 1, '0', 0, 43),
      c('website_count', 'INTEGER', 1, '0', 0, 43),
      c('enriched_count', 'INTEGER', 1, '0', 0, 43),
      c('decision_maker_count', 'INTEGER', 1, '0', 0, 43),
      c('company_telegram_count', 'INTEGER', 1, '0', 0, 43),
      c('personal_telegram_count', 'INTEGER', 1, '0', 0, 43),
      c('excluded_count', 'INTEGER', 1, '0', 0, 43),
      c('warnings_json', 'TEXT', 1, "'[]'", 0, 43),
      c('request_key', 'TEXT', 0, null, 0, 43),
      c('request_fingerprint', 'TEXT', 0, null, 0, 43),
      c('state_version', 'INTEGER', 1, '0', 0, 43),
    ],
    checks: [
      k('length(id) BETWEEN 1 AND 80', 36),
      k('length(org_id) BETWEEN 1 AND 80', 36),
      k("json_valid(input_json) AND json_type(input_json) = 'object'", 36),
      k("status IN ('running', 'ready', 'partial', 'failed', 'insufficient_results')", 36),
      k('candidate_count >= 0', 36),
      k('verified_count >= 0', 36),
      k('p1_count >= 0', 36),
      k('p2_count >= 0', 36),
      k('p3_count >= 0', 36),
      k('telegram_count >= 0', 36),
      k('error_code IS NULL OR length(error_code) BETWEEN 1 AND 80', 36),
      k('length(created_at) BETWEEN 1 AND 64', 36),
      k('completed_at IS NULL OR length(completed_at) BETWEEN 1 AND 64', 36),
      k("phase IN ('queued', 'discovering', 'enriching', 'finalizing', 'completed')", 43),
      k('raw_discovered_count >= 0', 43),
      k('processed_count >= 0', 43),
      k('pending_count >= 0', 43),
      k('website_count >= 0', 43),
      k('enriched_count >= 0', 43),
      k('decision_maker_count >= 0', 43),
      k('company_telegram_count >= 0', 43),
      k('personal_telegram_count >= 0', 43),
      k('excluded_count >= 0', 43),
      k("length(warnings_json) <= 32768 AND json_valid(warnings_json) AND json_type(warnings_json) = 'array'", 43),
      k('request_key IS NULL OR length(request_key) BETWEEN 1 AND 160', 43),
      k("(request_key IS NULL AND request_fingerprint IS NULL) OR (request_key IS NOT NULL AND length(request_fingerprint) = 64 AND request_fingerprint NOT GLOB '*[^0-9a-f]*')", 43),
      k('state_version >= 0', 43),
    ],
    foreignKeys: [],
  },
  {
    name: 'lead_radar_companies',
    since: 36,
    columns: [
      c('id', 'TEXT', 0, null, 1, 36),
      c('org_id', 'TEXT', 1, null, 0, 36),
      c('search_id', 'TEXT', 1, null, 0, 36),
      c('canonical_key', 'TEXT', 1, null, 0, 36),
      c('name', 'TEXT', 1, null, 0, 36),
      c('category', 'TEXT', 1, null, 0, 36),
      c('city', 'TEXT', 1, null, 0, 36),
      c('country', 'TEXT', 1, null, 0, 36),
      c('address', 'TEXT', 0, null, 0, 36),
      c('website', 'TEXT', 0, null, 0, 36),
      c('phone', 'TEXT', 0, null, 0, 36),
      c('generic_email', 'TEXT', 0, null, 0, 36),
      c('telegram_url', 'TEXT', 0, null, 0, 36),
      c('score', 'INTEGER', 1, null, 0, 36),
      c('confidence', 'REAL', 1, null, 0, 36),
      c('priority', 'TEXT', 1, null, 0, 36),
      c('lifecycle', 'TEXT', 1, "'new'", 0, 36),
      c('suppressed', 'INTEGER', 1, '0', 0, 36),
      c('score_components_json', 'TEXT', 1, null, 0, 36),
      c('signals_json', 'TEXT', 1, null, 0, 36),
      c('discovered_at', 'TEXT', 1, null, 0, 36),
      c('last_verified_at', 'TEXT', 1, null, 0, 36),
      c('updated_at', 'TEXT', 1, null, 0, 36),
      c('domain', 'TEXT', 0, null, 0, 41),
      c('phone_digits', 'TEXT', 0, null, 0, 41),
      c('name_city_key', 'TEXT', 0, null, 0, 41),
      c('telegram_contact_json', 'TEXT', 1, "'null'", 0, 42),
      c('decision_makers_json', 'TEXT', 1, "'[]'", 0, 42),
      c('enrichment_status', 'TEXT', 1, "'terminal'", 0, 43),
      c('enrichment_reason', 'TEXT', 0, null, 0, 43),
      c('enrichment_attempts', 'INTEGER', 1, '0', 0, 43),
    ],
    checks: [
      k('length(id) BETWEEN 1 AND 80', 36),
      k('length(org_id) BETWEEN 1 AND 80', 36),
      k('length(canonical_key) BETWEEN 1 AND 260', 36),
      k('length(name) BETWEEN 1 AND 240', 36),
      k('length(category) BETWEEN 1 AND 160', 36),
      k('length(city) BETWEEN 1 AND 120', 36),
      k('length(country) BETWEEN 1 AND 40', 36),
      k('address IS NULL OR length(address) <= 500', 36),
      k('website IS NULL OR length(website) <= 2048', 36),
      k('phone IS NULL OR length(phone) <= 40', 36),
      k('generic_email IS NULL OR length(generic_email) <= 254', 36),
      k('telegram_url IS NULL OR length(telegram_url) <= 2048', 36),
      k('score BETWEEN 0 AND 100', 36),
      k('confidence BETWEEN 0 AND 1', 36),
      k("priority IN ('P1', 'P2', 'P3')", 36),
      k("lifecycle IN ('new', 'contacted', 'replied', 'qualified', 'meeting', 'won', 'lost', 'do_not_contact')", 36),
      k('suppressed IN (0, 1)', 36),
      k("json_valid(score_components_json) AND json_type(score_components_json) = 'array'", 36),
      k("json_valid(signals_json) AND json_type(signals_json) = 'array'", 36),
      k('length(discovered_at) BETWEEN 1 AND 64', 36),
      k('length(last_verified_at) BETWEEN 1 AND 64', 36),
      k('length(updated_at) BETWEEN 1 AND 64', 36),
      k("length(telegram_contact_json) <= 8192 AND json_valid(telegram_contact_json) AND json_type(telegram_contact_json) IN ('object', 'null')", 42),
      k("length(decision_makers_json) <= 65536 AND json_valid(decision_makers_json) AND json_type(decision_makers_json) = 'array'", 42),
      k("enrichment_status IN ('pending', 'queued', 'processing', 'enriched', 'terminal')", 43),
      k("enrichment_reason IS NULL OR enrichment_reason IN ('no_website', 'enriched', 'no_relevant_evidence', 'robots_blocked', 'http_blocked', 'source_timeout', 'source_unavailable', 'invalid_website', 'payload_invalid', 'retry_exhausted', 'suppressed')", 43),
      k('enrichment_attempts BETWEEN 0 AND 5', 43),
    ],
    uniqueConstraints: [k('org_id, search_id, canonical_key', 36)],
    foreignKeys: [fk(['search_id'], 'lead_radar_searches', ['id'], 36)],
  },
  {
    name: 'lead_radar_evidence',
    since: 36,
    columns: [
      c('id', 'TEXT', 0, null, 1, 36),
      c('org_id', 'TEXT', 1, null, 0, 36),
      c('company_id', 'TEXT', 1, null, 0, 36),
      c('field_path', 'TEXT', 1, null, 0, 36),
      c('value', 'TEXT', 1, null, 0, 36),
      c('source_url', 'TEXT', 1, null, 0, 36),
      c('source_type', 'TEXT', 1, null, 0, 36),
      c('observed_at', 'TEXT', 1, null, 0, 36),
      c('confidence', 'REAL', 1, null, 0, 36),
      c('classification', 'TEXT', 1, null, 0, 36),
    ],
    checks: [
      k('length(id) BETWEEN 1 AND 80', 36),
      k('length(org_id) BETWEEN 1 AND 80', 36),
      k('length(field_path) BETWEEN 1 AND 160', 36),
      k('length(value) BETWEEN 1 AND 4096', 36),
      k('length(source_url) BETWEEN 1 AND 2048', 36),
      k("source_type IN ('openstreetmap', 'company_website', 'official_open_data')", 36),
      k('length(observed_at) BETWEEN 1 AND 64', 36),
      k('confidence BETWEEN 0 AND 1', 36),
      k("classification IN ('company_data', 'fact', 'model_inference')", 36),
    ],
    foreignKeys: [fk(['company_id'], 'lead_radar_companies', ['id'], 36)],
  },
  {
    name: 'lead_radar_search_leases',
    since: 41,
    columns: [
      c('org_id', 'TEXT', 0, null, 1, 41),
      c('lease_id', 'TEXT', 1, null, 0, 41),
      c('active_until', 'TEXT', 1, null, 0, 41),
      c('next_allowed_at', 'TEXT', 1, null, 0, 41),
      c('updated_at', 'TEXT', 1, null, 0, 41),
    ],
    checks: [],
    foreignKeys: [],
  },
  {
    name: 'lead_radar_geocode_cache',
    since: 41,
    columns: [
      c('cache_key', 'TEXT', 0, null, 1, 41),
      c('bounds_json', 'TEXT', 1, null, 0, 41),
      c('observed_at', 'TEXT', 1, null, 0, 41),
      c('expires_at', 'TEXT', 1, null, 0, 41),
    ],
    checks: [],
    foreignKeys: [],
  },
  {
    name: 'lead_radar_source_throttles',
    since: 41,
    columns: [
      c('source_key', 'TEXT', 0, null, 1, 41),
      c('next_allowed_at', 'TEXT', 1, null, 0, 41),
      c('updated_at', 'TEXT', 1, null, 0, 41),
    ],
    checks: [],
    foreignKeys: [],
  },
  {
    name: 'lead_radar_suppressions',
    since: 41,
    columns: [
      c('org_id', 'TEXT', 1, null, 1, 41),
      c('canonical_key', 'TEXT', 1, null, 2, 41),
      c('domain', 'TEXT', 0, null, 0, 41),
      c('phone_digits', 'TEXT', 0, null, 0, 41),
      c('name_city_key', 'TEXT', 0, null, 0, 41),
      c('suppressed_at', 'TEXT', 1, null, 0, 41),
      c('reason', 'TEXT', 1, "'do_not_contact'", 0, 41),
    ],
    checks: [],
    foreignKeys: [],
  },
  {
    name: 'lead_radar_jobs',
    since: 43,
    columns: [
      c('id', 'TEXT', 0, null, 1, 43),
      c('org_id', 'TEXT', 1, null, 0, 43),
      c('search_id', 'TEXT', 1, null, 0, 43),
      c('company_id', 'TEXT', 0, null, 0, 43),
      c('idempotency_key', 'TEXT', 1, null, 0, 43),
      c('stage', 'TEXT', 1, null, 0, 43),
      c('status', 'TEXT', 1, null, 0, 43),
      c('attempt_count', 'INTEGER', 1, '0', 0, 43),
      c('max_attempts', 'INTEGER', 1, '3', 0, 43),
      c('available_at', 'TEXT', 1, null, 0, 43),
      c('lease_owner', 'TEXT', 0, null, 0, 43),
      c('lease_expires_at', 'TEXT', 0, null, 0, 43),
      c('lease_generation', 'INTEGER', 1, '0', 0, 43),
      c('last_error_code', 'TEXT', 0, null, 0, 43),
      c('dispatch_status', 'TEXT', 1, "'pending'", 0, 43),
      c('dispatch_attempt_count', 'INTEGER', 1, '0', 0, 43),
      c('next_dispatch_at', 'TEXT', 0, null, 0, 43),
      c('dispatch_lease_owner', 'TEXT', 0, null, 0, 43),
      c('dispatch_lease_expires_at', 'TEXT', 0, null, 0, 43),
      c('dispatched_at', 'TEXT', 0, null, 0, 43),
      c('created_at', 'TEXT', 1, null, 0, 43),
      c('updated_at', 'TEXT', 1, null, 0, 43),
      c('completed_at', 'TEXT', 0, null, 0, 43),
    ],
    checks: [
      k("length(id) = 38 AND substr(id, 1, 6) = 'lrjob_' AND substr(id, 7) NOT GLOB '*[^0-9a-f]*'", 43),
      k('length(org_id) BETWEEN 1 AND 80', 43),
      k('length(search_id) BETWEEN 1 AND 80', 43),
      k('company_id IS NULL OR length(company_id) BETWEEN 1 AND 80', 43),
      k('length(idempotency_key) BETWEEN 1 AND 260', 43),
      k("stage IN ('discovery', 'enrichment')", 43),
      k("status IN ('queued', 'running', 'retry_wait', 'completed', 'dead_letter')", 43),
      k('attempt_count >= 0 AND attempt_count <= max_attempts', 43),
      k('max_attempts BETWEEN 1 AND 5', 43),
      k('length(available_at) BETWEEN 1 AND 64', 43),
      k('lease_owner IS NULL OR length(lease_owner) BETWEEN 1 AND 160', 43),
      k('lease_expires_at IS NULL OR length(lease_expires_at) BETWEEN 1 AND 64', 43),
      k('lease_generation >= 0', 43),
      k('last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 80', 43),
      k("dispatch_status IN ('pending', 'sent')", 43),
      k('dispatch_attempt_count >= 0', 43),
      k('next_dispatch_at IS NULL OR length(next_dispatch_at) BETWEEN 1 AND 64', 43),
      k('dispatch_lease_owner IS NULL OR length(dispatch_lease_owner) BETWEEN 1 AND 160', 43),
      k('dispatch_lease_expires_at IS NULL OR length(dispatch_lease_expires_at) BETWEEN 1 AND 64', 43),
      k('dispatched_at IS NULL OR length(dispatched_at) BETWEEN 1 AND 64', 43),
      k('length(created_at) BETWEEN 1 AND 64', 43),
      k('length(updated_at) BETWEEN 1 AND 64', 43),
      k('completed_at IS NULL OR length(completed_at) BETWEEN 1 AND 64', 43),
      k("(stage = 'discovery' AND company_id IS NULL) OR (stage = 'enrichment' AND company_id IS NOT NULL)", 43),
      k("(status = 'running' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL) OR (status <> 'running' AND lease_owner IS NULL AND lease_expires_at IS NULL)", 43),
      k('(dispatch_lease_owner IS NULL AND dispatch_lease_expires_at IS NULL) OR (dispatch_lease_owner IS NOT NULL AND dispatch_lease_expires_at IS NOT NULL)', 43),
      k("(status IN ('completed', 'dead_letter') AND completed_at IS NOT NULL) OR (status NOT IN ('completed', 'dead_letter') AND completed_at IS NULL)", 43),
      k("dispatch_status = 'pending' OR dispatched_at IS NOT NULL", 43),
    ],
    uniqueConstraints: [k('org_id, idempotency_key', 43)],
    foreignKeys: [
      fk(['org_id', 'search_id'], 'lead_radar_searches', ['org_id', 'id'], 43),
      fk(['org_id', 'company_id'], 'lead_radar_companies', ['org_id', 'id'], 43),
    ],
  },
  {
    name: 'lead_radar_job_effects',
    since: 43,
    columns: [
      c('org_id', 'TEXT', 1, null, 1, 43),
      c('job_id', 'TEXT', 1, null, 2, 43),
      c('effect_key', 'TEXT', 1, null, 3, 43),
      c('payload_digest', 'TEXT', 1, null, 0, 43),
      c('applied_at', 'TEXT', 1, null, 0, 43),
    ],
    checks: [
      k('length(org_id) BETWEEN 1 AND 80', 43),
      k('length(job_id) = 38', 43),
      k('length(effect_key) BETWEEN 1 AND 160', 43),
      k("length(payload_digest) = 64 AND payload_digest NOT GLOB '*[^0-9a-f]*'", 43),
      k('length(applied_at) BETWEEN 1 AND 64', 43),
    ],
    foreignKeys: [fk(['org_id', 'job_id'], 'lead_radar_jobs', ['org_id', 'id'], 43)],
  },
  {
    name: 'lead_radar_tg_connect_nonces',
    since: 44,
    columns: [
      c('id', 'TEXT', 0, null, 1, 44),
      c('org_id', 'TEXT', 1, null, 0, 44),
      c('lookup_key', 'TEXT', 1, null, 0, 44),
      c('nonce_hash', 'TEXT', 1, null, 0, 44),
      c('user_chat_digest', 'TEXT', 0, null, 0, 44),
      c('start_update_digest', 'TEXT', 0, null, 0, 44),
      c('expires_at', 'TEXT', 1, null, 0, 44),
      c('used_at', 'TEXT', 0, null, 0, 44),
      c('superseded_at', 'TEXT', 0, null, 0, 44),
      c('connection_bound_at', 'TEXT', 0, null, 0, 44),
      c('created_at', 'TEXT', 1, null, 0, 44),
      c('updated_at', 'TEXT', 1, null, 0, 44),
    ],
    checks: [
      k("length(id) = 38 AND substr(id, 1, 6) = 'lrtgn_' AND substr(id, 7) NOT GLOB '*[^0-9a-f]*'", 44),
      k('length(org_id) BETWEEN 1 AND 80', 44),
      k("length(lookup_key) = 16 AND lookup_key NOT GLOB '*[^0-9a-f]*'", 44),
      k("length(nonce_hash) = 64 AND nonce_hash NOT GLOB '*[^0-9a-f]*'", 44),
      k("user_chat_digest IS NULL OR (length(user_chat_digest) = 64 AND user_chat_digest NOT GLOB '*[^0-9a-f]*')", 44),
      k("start_update_digest IS NULL OR (length(start_update_digest) = 64 AND start_update_digest NOT GLOB '*[^0-9a-f]*')", 44),
      k('length(expires_at) BETWEEN 20 AND 64', 44),
      k('used_at IS NULL OR length(used_at) BETWEEN 20 AND 64', 44),
      k('superseded_at IS NULL OR length(superseded_at) BETWEEN 20 AND 64', 44),
      k('connection_bound_at IS NULL OR length(connection_bound_at) BETWEEN 20 AND 64', 44),
      k('length(created_at) BETWEEN 20 AND 64', 44),
      k('length(updated_at) BETWEEN 20 AND 64', 44),
      k('(used_at IS NULL AND user_chat_digest IS NULL AND start_update_digest IS NULL) OR (used_at IS NOT NULL AND user_chat_digest IS NOT NULL AND start_update_digest IS NOT NULL)', 44),
      k('connection_bound_at IS NULL OR used_at IS NOT NULL', 44),
    ],
    uniqueConstraints: [k('lookup_key', 44), k('org_id, nonce_hash', 44)],
    foreignKeys: [],
  },
  {
    name: 'lead_radar_tg_business_connections',
    since: 44,
    columns: [
      c('id', 'TEXT', 0, null, 1, 44),
      c('org_id', 'TEXT', 1, null, 0, 44),
      c('connection_digest', 'TEXT', 1, null, 0, 44),
      c('connection_ciphertext', 'TEXT', 1, null, 0, 44),
      c('connection_iv', 'TEXT', 1, null, 0, 44),
      c('user_chat_digest', 'TEXT', 1, null, 0, 44),
      c('user_chat_ciphertext', 'TEXT', 1, null, 0, 44),
      c('user_chat_iv', 'TEXT', 1, null, 0, 44),
      c('is_enabled', 'INTEGER', 1, null, 0, 44),
      c('can_reply', 'INTEGER', 1, null, 0, 44),
      c('connected_at', 'TEXT', 1, null, 0, 44),
      c('lifecycle_update_id', 'INTEGER', 1, null, 0, 44),
      c('lifecycle_event_at', 'TEXT', 1, null, 0, 44),
      c('updated_at', 'TEXT', 1, null, 0, 44),
      c('disabled_at', 'TEXT', 0, null, 0, 44),
    ],
    checks: [
      k("length(id) = 38 AND substr(id, 1, 6) = 'lrtgc_' AND substr(id, 7) NOT GLOB '*[^0-9a-f]*'", 44),
      k('length(org_id) BETWEEN 1 AND 80', 44),
      k("length(connection_digest) = 64 AND connection_digest NOT GLOB '*[^0-9a-f]*'", 44),
      k('length(connection_ciphertext) BETWEEN 23 AND 1024', 44),
      k("length(connection_iv) = 16 AND connection_iv NOT GLOB '*[^A-Za-z0-9_-]*'", 44),
      k("length(user_chat_digest) = 64 AND user_chat_digest NOT GLOB '*[^0-9a-f]*'", 44),
      k('length(user_chat_ciphertext) BETWEEN 23 AND 512', 44),
      k("length(user_chat_iv) = 16 AND user_chat_iv NOT GLOB '*[^A-Za-z0-9_-]*'", 44),
      k('is_enabled IN (0, 1)', 44),
      k('can_reply IN (0, 1)', 44),
      k('length(connected_at) BETWEEN 20 AND 64', 44),
      k('lifecycle_update_id > 0', 44),
      k('length(lifecycle_event_at) BETWEEN 20 AND 64', 44),
      k('length(updated_at) BETWEEN 20 AND 64', 44),
      k('disabled_at IS NULL OR length(disabled_at) BETWEEN 20 AND 64', 44),
      k('(is_enabled = 1 AND disabled_at IS NULL) OR (is_enabled = 0 AND disabled_at IS NOT NULL)', 44),
    ],
    uniqueConstraints: [
      k('org_id, id', 44),
      k('org_id, connection_digest', 44),
      k('org_id, user_chat_digest', 44),
    ],
    foreignKeys: [],
  },
  {
    name: 'lead_radar_tg_company_chats',
    since: 44,
    columns: [
      c('id', 'TEXT', 0, null, 1, 44),
      c('org_id', 'TEXT', 1, null, 0, 44),
      c('connection_id', 'TEXT', 1, null, 0, 44),
      c('company_id', 'TEXT', 1, null, 0, 44),
      c('chat_digest', 'TEXT', 1, null, 0, 44),
      c('chat_ciphertext', 'TEXT', 1, null, 0, 44),
      c('chat_iv', 'TEXT', 1, null, 0, 44),
      c('endpoint_digest', 'TEXT', 1, null, 0, 44),
      c('first_inbound_at', 'TEXT', 1, null, 0, 44),
      c('last_inbound_at', 'TEXT', 1, null, 0, 44),
      c('active_until', 'TEXT', 1, null, 0, 44),
      c('updated_at', 'TEXT', 1, null, 0, 44),
    ],
    checks: [
      k("length(id) = 38 AND substr(id, 1, 6) = 'lrtgb_' AND substr(id, 7) NOT GLOB '*[^0-9a-f]*'", 44),
      k('length(org_id) BETWEEN 1 AND 80', 44),
      k('length(connection_id) = 38', 44),
      k('length(company_id) BETWEEN 1 AND 80', 44),
      k("length(chat_digest) = 64 AND chat_digest NOT GLOB '*[^0-9a-f]*'", 44),
      k('length(chat_ciphertext) BETWEEN 23 AND 512', 44),
      k("length(chat_iv) = 16 AND chat_iv NOT GLOB '*[^A-Za-z0-9_-]*'", 44),
      k("length(endpoint_digest) = 64 AND endpoint_digest NOT GLOB '*[^0-9a-f]*'", 44),
      k('length(first_inbound_at) BETWEEN 20 AND 64', 44),
      k('length(last_inbound_at) BETWEEN 20 AND 64', 44),
      k('length(active_until) BETWEEN 20 AND 64', 44),
      k('length(updated_at) BETWEEN 20 AND 64', 44),
      k('last_inbound_at >= first_inbound_at', 44),
      k('active_until > last_inbound_at', 44),
    ],
    uniqueConstraints: [
      k('org_id, id', 44),
      k('org_id, connection_id, chat_digest', 44),
      k('org_id, connection_id, company_id', 44),
    ],
    foreignKeys: [
      fk(['org_id', 'connection_id'], 'lead_radar_tg_business_connections', ['org_id', 'id'], 44),
      fk(['org_id', 'company_id'], 'lead_radar_companies', ['org_id', 'id'], 44),
    ],
  },
  {
    name: 'lead_radar_tg_webhook_updates',
    since: 44,
    columns: [
      c('org_id', 'TEXT', 1, null, 1, 44),
      c('update_digest', 'TEXT', 1, null, 2, 44),
      c('update_kind', 'TEXT', 1, null, 0, 44),
      c('processed_at', 'TEXT', 1, null, 0, 44),
    ],
    checks: [
      k('length(org_id) BETWEEN 1 AND 80', 44),
      k("length(update_digest) = 64 AND update_digest NOT GLOB '*[^0-9a-f]*'", 44),
      k("update_kind IN ('start', 'business_connection', 'business_message')", 44),
      k('length(processed_at) BETWEEN 20 AND 64', 44),
    ],
    foreignKeys: [],
  },
  {
    name: 'lead_radar_tg_send_approvals',
    since: 44,
    columns: [
      c('id', 'TEXT', 0, null, 1, 44),
      c('org_id', 'TEXT', 1, null, 0, 44),
      c('company_id', 'TEXT', 1, null, 0, 44),
      c('binding_id', 'TEXT', 1, null, 0, 44),
      c('token_digest', 'TEXT', 1, null, 0, 44),
      c('payload_digest', 'TEXT', 1, null, 0, 44),
      c('operator_digest', 'TEXT', 1, null, 0, 44),
      c('expires_at', 'TEXT', 1, null, 0, 44),
      c('consumed_at', 'TEXT', 0, null, 0, 44),
      c('created_at', 'TEXT', 1, null, 0, 44),
    ],
    checks: [
      k("length(id) = 38 AND substr(id, 1, 6) = 'lrtga_' AND substr(id, 7) NOT GLOB '*[^0-9a-f]*'", 44),
      k('length(org_id) BETWEEN 1 AND 80', 44),
      k('length(company_id) BETWEEN 1 AND 80', 44),
      k('length(binding_id) = 38', 44),
      k("length(token_digest) = 64 AND token_digest NOT GLOB '*[^0-9a-f]*'", 44),
      k("length(payload_digest) = 64 AND payload_digest NOT GLOB '*[^0-9a-f]*'", 44),
      k("length(operator_digest) = 64 AND operator_digest NOT GLOB '*[^0-9a-f]*'", 44),
      k('length(expires_at) BETWEEN 20 AND 64', 44),
      k('consumed_at IS NULL OR length(consumed_at) BETWEEN 20 AND 64', 44),
      k('length(created_at) BETWEEN 20 AND 64', 44),
    ],
    uniqueConstraints: [k('org_id, id', 44), k('org_id, token_digest', 44)],
    foreignKeys: [
      fk(['org_id', 'binding_id'], 'lead_radar_tg_company_chats', ['org_id', 'id'], 44),
    ],
  },
  {
    name: 'lead_radar_tg_send_effects',
    since: 44,
    columns: [
      c('id', 'TEXT', 0, null, 1, 44),
      c('org_id', 'TEXT', 1, null, 0, 44),
      c('binding_id', 'TEXT', 1, null, 0, 44),
      c('approval_id', 'TEXT', 1, null, 0, 44),
      c('idempotency_key_digest', 'TEXT', 1, null, 0, 44),
      c('payload_digest', 'TEXT', 1, null, 0, 44),
      c('approval_digest', 'TEXT', 1, null, 0, 44),
      c('status', 'TEXT', 1, null, 0, 44),
      c('provider_message_digest', 'TEXT', 0, null, 0, 44),
      c('created_at', 'TEXT', 1, null, 0, 44),
      c('updated_at', 'TEXT', 1, null, 0, 44),
      c('sent_at', 'TEXT', 0, null, 0, 44),
    ],
    checks: [
      k("length(id) = 38 AND substr(id, 1, 6) = 'lrtgs_' AND substr(id, 7) NOT GLOB '*[^0-9a-f]*'", 44),
      k('length(org_id) BETWEEN 1 AND 80', 44),
      k('length(binding_id) = 38', 44),
      k('length(approval_id) = 38', 44),
      k("length(idempotency_key_digest) = 64 AND idempotency_key_digest NOT GLOB '*[^0-9a-f]*'", 44),
      k("length(payload_digest) = 64 AND payload_digest NOT GLOB '*[^0-9a-f]*'", 44),
      k("length(approval_digest) = 64 AND approval_digest NOT GLOB '*[^0-9a-f]*'", 44),
      k("status IN ('reserved', 'dispatching', 'sent', 'ambiguous', 'canceled')", 44),
      k("provider_message_digest IS NULL OR (length(provider_message_digest) = 64 AND provider_message_digest NOT GLOB '*[^0-9a-f]*')", 44),
      k('length(created_at) BETWEEN 20 AND 64', 44),
      k('length(updated_at) BETWEEN 20 AND 64', 44),
      k('sent_at IS NULL OR length(sent_at) BETWEEN 20 AND 64', 44),
      k("(status = 'sent' AND sent_at IS NOT NULL AND provider_message_digest IS NOT NULL) OR (status <> 'sent' AND sent_at IS NULL AND provider_message_digest IS NULL)", 44),
    ],
    uniqueConstraints: [
      k('org_id, idempotency_key_digest', 44),
      k('org_id, approval_id', 44),
    ],
    foreignKeys: [
      fk(['org_id', 'binding_id'], 'lead_radar_tg_company_chats', ['org_id', 'id'], 44),
      fk(['org_id', 'approval_id'], 'lead_radar_tg_send_approvals', ['org_id', 'id'], 44),
    ],
  },
];

const INDEXES: IndexContract[] = [
  {
    name: 'idx_lead_radar_searches_org_recent', table: 'lead_radar_searches', unique: 0, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'created_at', descending: true }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_searches_org_recent ON lead_radar_searches (org_id, created_at DESC, id)', since: 36,
  },
  {
    name: 'idx_lead_radar_companies_search_priority', table: 'lead_radar_companies', unique: 0, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'search_id' }, { name: 'priority' }, { name: 'score', descending: true }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_companies_search_priority ON lead_radar_companies (org_id, search_id, priority, score DESC, id)', since: 36,
  },
  {
    name: 'idx_lead_radar_companies_pipeline', table: 'lead_radar_companies', unique: 0, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'lifecycle' }, { name: 'suppressed' }, { name: 'updated_at', descending: true }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_companies_pipeline ON lead_radar_companies (org_id, lifecycle, suppressed, updated_at DESC, id)', since: 36,
  },
  {
    name: 'idx_lead_radar_evidence_company', table: 'lead_radar_evidence', unique: 0, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'company_id' }, { name: 'field_path' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_evidence_company ON lead_radar_evidence (org_id, company_id, field_path, id)', since: 36,
  },
  ...[
    ['idx_lead_radar_companies_domain', 'lead_radar_companies', ['org_id', 'domain']],
    ['idx_lead_radar_companies_phone', 'lead_radar_companies', ['org_id', 'phone_digits']],
    ['idx_lead_radar_companies_name_city', 'lead_radar_companies', ['org_id', 'name_city_key']],
    ['idx_lead_radar_suppressions_domain', 'lead_radar_suppressions', ['org_id', 'domain']],
    ['idx_lead_radar_suppressions_phone', 'lead_radar_suppressions', ['org_id', 'phone_digits']],
    ['idx_lead_radar_suppressions_name_city', 'lead_radar_suppressions', ['org_id', 'name_city_key']],
  ].map(([name, table, columns]) => ({
    name: name as string,
    table: table as string,
    unique: 0 as const,
    partial: 0 as const,
    columns: (columns as string[]).map((column) => ({ name: column })),
    sql: `CREATE INDEX ${String(name)} ON ${String(table)} (${(columns as string[]).join(', ')})`,
    since: 41 as const,
  })),
  {
    name: 'idx_lead_radar_searches_org_id', table: 'lead_radar_searches', unique: 1, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'id' }],
    sql: 'CREATE UNIQUE INDEX idx_lead_radar_searches_org_id ON lead_radar_searches (org_id, id)', since: 43,
  },
  {
    name: 'idx_lead_radar_companies_org_id', table: 'lead_radar_companies', unique: 1, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'id' }],
    sql: 'CREATE UNIQUE INDEX idx_lead_radar_companies_org_id ON lead_radar_companies (org_id, id)', since: 43,
  },
  {
    name: 'idx_lead_radar_searches_org_request_key', table: 'lead_radar_searches', unique: 1, partial: 1,
    columns: [{ name: 'org_id' }, { name: 'request_key' }],
    sql: 'CREATE UNIQUE INDEX idx_lead_radar_searches_org_request_key ON lead_radar_searches (org_id, request_key) WHERE request_key IS NOT NULL', since: 43,
  },
  {
    name: 'idx_lead_radar_jobs_org_id', table: 'lead_radar_jobs', unique: 1, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'id' }],
    sql: 'CREATE UNIQUE INDEX idx_lead_radar_jobs_org_id ON lead_radar_jobs (org_id, id)', since: 43,
  },
  {
    name: 'idx_lead_radar_jobs_due', table: 'lead_radar_jobs', unique: 0, partial: 0,
    columns: [{ name: 'status' }, { name: 'stage' }, { name: 'available_at' }, { name: 'org_id' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_jobs_due ON lead_radar_jobs (status, stage, available_at, org_id, id)', since: 43,
  },
  {
    name: 'idx_lead_radar_jobs_search', table: 'lead_radar_jobs', unique: 0, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'search_id' }, { name: 'stage' }, { name: 'status' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_jobs_search ON lead_radar_jobs (org_id, search_id, stage, status, id)', since: 43,
  },
  {
    name: 'idx_lead_radar_jobs_dispatch_due', table: 'lead_radar_jobs', unique: 0, partial: 0,
    columns: [{ name: 'dispatch_status' }, { name: 'stage' }, { name: 'next_dispatch_at' }, { name: 'org_id' }, { name: 'dispatch_attempt_count' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_jobs_dispatch_due ON lead_radar_jobs (dispatch_status, stage, next_dispatch_at, org_id, dispatch_attempt_count, id)', since: 43,
  },
  {
    name: 'idx_lead_radar_jobs_dispatch_lease', table: 'lead_radar_jobs', unique: 0, partial: 0,
    columns: [{ name: 'dispatch_status' }, { name: 'dispatch_lease_expires_at' }, { name: 'org_id' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_jobs_dispatch_lease ON lead_radar_jobs (dispatch_status, dispatch_lease_expires_at, org_id, id)', since: 43,
  },
  {
    name: 'idx_lead_radar_tg_nonces_expiry', table: 'lead_radar_tg_connect_nonces', unique: 0, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'connection_bound_at' }, { name: 'superseded_at' }, { name: 'expires_at' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_tg_nonces_expiry ON lead_radar_tg_connect_nonces (org_id, connection_bound_at, superseded_at, expires_at, id)', since: 44,
  },
  {
    name: 'idx_lead_radar_tg_nonces_active_org', table: 'lead_radar_tg_connect_nonces', unique: 1, partial: 1,
    columns: [{ name: 'org_id' }],
    sql: 'CREATE UNIQUE INDEX idx_lead_radar_tg_nonces_active_org ON lead_radar_tg_connect_nonces (org_id) WHERE connection_bound_at IS NULL AND superseded_at IS NULL', since: 44,
  },
  {
    name: 'idx_lead_radar_tg_nonces_user_pending', table: 'lead_radar_tg_connect_nonces', unique: 0, partial: 0,
    columns: [{ name: 'user_chat_digest' }, { name: 'connection_bound_at' }, { name: 'superseded_at' }, { name: 'expires_at' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_tg_nonces_user_pending ON lead_radar_tg_connect_nonces (user_chat_digest, connection_bound_at, superseded_at, expires_at, id)', since: 44,
  },
  {
    name: 'idx_lead_radar_tg_connections_digest', table: 'lead_radar_tg_business_connections', unique: 0, partial: 0,
    columns: [{ name: 'connection_digest' }, { name: 'org_id' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_tg_connections_digest ON lead_radar_tg_business_connections (connection_digest, org_id, id)', since: 44,
  },
  {
    name: 'idx_lead_radar_tg_connections_status', table: 'lead_radar_tg_business_connections', unique: 0, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'is_enabled' }, { name: 'can_reply' }, { name: 'updated_at' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_tg_connections_status ON lead_radar_tg_business_connections (org_id, is_enabled, can_reply, updated_at, id)', since: 44,
  },
  {
    name: 'idx_lead_radar_tg_bindings_chat', table: 'lead_radar_tg_company_chats', unique: 0, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'connection_id' }, { name: 'chat_digest' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_tg_bindings_chat ON lead_radar_tg_company_chats (org_id, connection_id, chat_digest, id)', since: 44,
  },
  {
    name: 'idx_lead_radar_tg_bindings_active', table: 'lead_radar_tg_company_chats', unique: 0, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'company_id' }, { name: 'active_until' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_tg_bindings_active ON lead_radar_tg_company_chats (org_id, company_id, active_until, id)', since: 44,
  },
  {
    name: 'idx_lead_radar_tg_updates_recent', table: 'lead_radar_tg_webhook_updates', unique: 0, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'processed_at' }, { name: 'update_digest' }],
    sql: 'CREATE INDEX idx_lead_radar_tg_updates_recent ON lead_radar_tg_webhook_updates (org_id, processed_at, update_digest)', since: 44,
  },
  {
    name: 'idx_lead_radar_tg_approvals_expiry', table: 'lead_radar_tg_send_approvals', unique: 0, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'expires_at' }, { name: 'consumed_at' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_tg_approvals_expiry ON lead_radar_tg_send_approvals (org_id, expires_at, consumed_at, id)', since: 44,
  },
  {
    name: 'idx_lead_radar_tg_send_status', table: 'lead_radar_tg_send_effects', unique: 0, partial: 0,
    columns: [{ name: 'org_id' }, { name: 'status' }, { name: 'updated_at' }, { name: 'id' }],
    sql: 'CREATE INDEX idx_lead_radar_tg_send_status ON lead_radar_tg_send_effects (org_id, status, updated_at, id)', since: 44,
  },
];

export const LEAD_RADAR_MIGRATIONS = [
  '0036_lead_radar.sql',
  '0041_lead_radar_search_leases.sql',
  '0042_lead_radar_decision_makers.sql',
  '0043_lead_radar_async_funnel.sql',
  '0044_lead_radar_telegram_business.sql',
] as const;

export const LEAD_RADAR_SCHEMA_CONTRACT = {
  version: 'lead-radar-schema-v2' as const,
  tables: TABLES,
  indexes: INDEXES,
  migrations: LEAD_RADAR_MIGRATIONS,
};

// SHA-256 of the normalized, sorted target Lead Radar rows in sqlite_schema.
// The exact full auditor below proves the same structure field-by-field during
// release. Runtime uses this equivalent compact assertion so a cold Worker
// stays inside D1's 50-query invocation budget. The target fingerprint was
// independently verified byte-for-byte against remote D1 before rollout.
export const LEAD_RADAR_TARGET_SCHEMA_FINGERPRINT =
  'd8f67c6efb71c8bf711cebf555dbde38a8d17dc8f883dea68c6dc6366d4a74b2';

function stageFor(profile: Exclude<LeadRadarSchemaProfile, 'auto'>): MigrationStage {
  return profile === 'target' ? 44 : 41;
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
        } else {
          quote = null;
        }
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
      // SQLite line comments end at LF. A preceding CR belongs to the comment,
      // including in CRLF input, and must not expose trailing SQL early.
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
  // D1 strips comments from some CREATE TABLE statements while local SQLite
  // preserves them. Comments are not schema semantics, but comment markers in
  // quoted SQL values are, so remove them with a quote-aware scanner.
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
      } else {
        unquoted += character;
      }
      continue;
    }
    normalized += character;
    const closing = quote === '[' ? ']' : quote;
    if (character === closing) {
      if (next === closing) {
        normalized += next;
        index += 1;
      } else {
        quote = null;
      }
    }
  }
  flushUnquoted();
  return normalized.trim();
}

function normalizeDefault(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let normalized = String(value).trim();
  while (normalized.startsWith('(') && normalized.endsWith(')')) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalizeSql(normalized);
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function unionPragmaQueries(
  functionName: 'pragma_table_xinfo' | 'pragma_index_list' | 'pragma_index_xinfo' | 'pragma_foreign_key_list',
  names: string[],
  projection: string,
): string[] {
  // Remote D1 rejects both large compound SELECTs and correlated arguments to
  // table-valued PRAGMAs. Four literal contract objects per statement is the
  // largest shape supported consistently by local SQLite and remote D1.
  const queries: string[] = [];
  for (let offset = 0; offset < names.length; offset += 4) {
    queries.push(names.slice(offset, offset + 4).map((name) => (
      `SELECT ${sqlLiteral(name)} AS object_name, ${projection}
        FROM ${functionName}(${sqlLiteral(name)}) AS metadata`
    )).join('\nUNION ALL\n'));
  }
  return queries;
}

const ALL_TABLE_NAMES = TABLES.map((table) => table.name);
const ALL_INDEX_NAMES = INDEXES.map((index) => index.name);
const SCOPED_TABLE_FILTER = `s.type = 'table' AND s.name IN (${ALL_TABLE_NAMES.map(sqlLiteral).join(', ')})`;

const AUDIT_QUERIES = {
  schema: `SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE name = 'd1_migrations'
      OR (
        (name GLOB 'lead_radar_*' OR tbl_name GLOB 'lead_radar_*')
        AND name NOT GLOB 'sqlite_autoindex_*'
      )
    ORDER BY type, name`,
  columns: unionPragmaQueries(
    'pragma_table_xinfo',
    ALL_TABLE_NAMES,
    'metadata.cid, metadata.name, metadata.type, metadata.[notnull] AS not_null, metadata.dflt_value, metadata.pk, metadata.hidden',
  ),
  indexLists: unionPragmaQueries(
    'pragma_index_list',
    ALL_TABLE_NAMES,
    'metadata.seq, metadata.name, metadata.[unique] AS is_unique, metadata.origin, metadata.partial',
  ),
  indexColumns: unionPragmaQueries(
    'pragma_index_xinfo',
    ALL_INDEX_NAMES,
    'metadata.seqno, metadata.cid, metadata.name, metadata.[desc] AS descending, metadata.coll, metadata.key',
  ),
  foreignKeys: unionPragmaQueries(
    'pragma_foreign_key_list',
    ALL_TABLE_NAMES,
    'metadata.id, metadata.seq, metadata.[table] AS target_table, metadata.[from] AS from_column, metadata.[to] AS to_column, metadata.on_update, metadata.on_delete, metadata.match',
  ),
  integrityCheck: 'PRAGMA integrity_check',
  // Whole-database quick_check compiles every product's CHECK expressions and
  // exceeded D1 memory after an unrelated additive migration (SQLITE_NOMEM).
  // Correlated table-valued pragmas check only this contract, one table at a
  // time, while preserving the four-statement runtime budget. Exact DDL and
  // ledger checks below still reject missing/changed Lead Radar objects.
  quickCheck: `SELECT CASE WHEN COUNT(*) > 0 AND MIN(q.quick_check) = 'ok'
      AND MAX(q.quick_check) = 'ok' THEN 'ok' ELSE 'failed' END AS quick_check
    FROM sqlite_schema AS s, pragma_quick_check(s.name) AS q
    WHERE ${SCOPED_TABLE_FILTER}`,
  foreignKeyCheck: `SELECT f.* FROM sqlite_schema AS s, pragma_foreign_key_check(s.name) AS f
    WHERE ${SCOPED_TABLE_FILTER}`,
  ledger: `SELECT name FROM d1_migrations WHERE name IN (
    '0036_lead_radar.sql', '0041_lead_radar_search_leases.sql',
    '0042_lead_radar_decision_makers.sql', '0043_lead_radar_async_funnel.sql',
    '0044_lead_radar_telegram_business.sql'
  ) ORDER BY name`,
} as const;

/** Rejects any accidental write before a query reaches D1 or the CLI. */
export function assertLeadRadarAuditQueryIsReadOnly(sql: string): void {
  const withoutLiterals = sql
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/--[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  const statements = withoutLiterals.split(';').map((part) => part.trim()).filter(Boolean);
  if (statements.length !== 1 || !/^(?:SELECT|PRAGMA)\b/i.test(statements[0] ?? '')) {
    throw new Error('lead_radar_schema_audit_non_read_only_query');
  }
  if (/^PRAGMA\b/i.test(statements[0] ?? '')
    && !/^PRAGMA\s+(?:integrity_check|quick_check|foreign_key_check)\s*$/i.test(statements[0] ?? '')) {
    throw new Error('lead_radar_schema_audit_non_read_only_query');
  }
  if (/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK)\b/i.test(withoutLiterals)) {
    throw new Error('lead_radar_schema_audit_non_read_only_query');
  }
}

interface Inspection {
  schema: Array<Record<string, unknown>>;
  columns: Array<Record<string, unknown>>;
  indexLists: Array<Record<string, unknown>>;
  indexColumns: Array<Record<string, unknown>>;
  foreignKeys: Array<Record<string, unknown>>;
  integrity: Array<Record<string, unknown>>;
  integrityPragma: LeadRadarIntegrityPragma;
  foreignKeyCheck: Array<Record<string, unknown>>;
  ledger: Array<Record<string, unknown>>;
  ledgerPresent: boolean;
}

async function inspect(
  reader: LeadRadarSchemaReader,
  integrityPragma: LeadRadarIntegrityPragma,
): Promise<Inspection> {
  const queryMany = async (queries: readonly string[]): Promise<Array<Record<string, unknown>>> => {
    const batches = await Promise.all(queries.map((sql) => reader.query(sql)));
    return batches.flat();
  };
  for (const value of Object.values(AUDIT_QUERIES)) {
    for (const sql of Array.isArray(value) ? value : [value]) {
      assertLeadRadarAuditQueryIsReadOnly(sql);
    }
  }
  const [schema, columns, indexLists, indexColumns, foreignKeys, integrity, foreignKeyCheck] = await Promise.all([
    reader.query(AUDIT_QUERIES.schema),
    queryMany(AUDIT_QUERIES.columns),
    queryMany(AUDIT_QUERIES.indexLists),
    queryMany(AUDIT_QUERIES.indexColumns),
    queryMany(AUDIT_QUERIES.foreignKeys),
    reader.query(integrityPragma === 'quick_check'
      ? AUDIT_QUERIES.quickCheck
      : AUDIT_QUERIES.integrityCheck),
    reader.query(AUDIT_QUERIES.foreignKeyCheck),
  ]);
  const ledgerPresent = schema.some((row) => row.type === 'table' && row.name === 'd1_migrations');
  const ledger = ledgerPresent ? await reader.query(AUDIT_QUERIES.ledger) : [];
  return {
    schema,
    columns,
    indexLists,
    indexColumns,
    foreignKeys,
    integrity,
    integrityPragma,
    foreignKeyCheck,
    ledger,
    ledgerPresent,
  };
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function integer(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

// Schema fingerprints are byte contracts, not human-language ordering. Using
// localeCompare on a cold Worker initializes locale/ICU state and adds startup
// work without changing the intended ASCII key order. Keep this comparator
// deterministic and locale-free across Node, workerd and D1.
function compareSchemaText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function expectedTables(stage: MigrationStage): TableContract[] {
  return TABLES.filter((table) => table.since <= stage);
}

function expectedIndexes(stage: MigrationStage): IndexContract[] {
  return INDEXES.filter((index) => index.since <= stage);
}

function issue(
  code: LeadRadarSchemaIssue['code'],
  object: string,
  expected?: string,
  actual?: string,
): LeadRadarSchemaIssue {
  return { code, object, ...(expected === undefined ? {} : { expected }), ...(actual === undefined ? {} : { actual }) };
}

function isLeadRadarSchemaRow(row: Record<string, unknown>): boolean {
  const name = text(row.name);
  const tableName = text(row.tbl_name);
  // Migrations 0045-0047 are an independently gated campaign extension. Keeping it
  // outside the research-funnel v2 contract permits a rolling, additive
  // migration without taking ordinary Lead Radar reads offline. The campaign
  // module owns a separate exact read-only contract and refuses every account
  // or campaign operation until that extension matches in full.
  const campaignExtension = (value: string) => (
    value === 'lead_radar_tg_user_accounts'
    || value === 'lead_radar_tg_campaigns'
    || value.startsWith('lead_radar_tg_campaign_')
    || value.startsWith('lead_radar_tg_account_')
    || value.startsWith('lead_radar_tg_recipient_')
    || value.startsWith('lead_radar_tg_contact_')
    || value.startsWith('lead_radar_tg_data_')
    || value.startsWith('lead_radar_tg_routing_')
    || value.startsWith('lead_radar_tg_maintenance_')
    || value.startsWith('lead_radar_tg_media_')
    || value.startsWith('idx_lead_radar_tg_user_accounts_')
    || value.startsWith('idx_lead_radar_tg_campaigns_')
    || value.startsWith('idx_lead_radar_tg_campaign_')
    || value.startsWith('idx_lead_radar_tg_media_')
  );
  return name !== 'd1_migrations'
    && !campaignExtension(name)
    && !campaignExtension(tableName)
    // Optional provider tables have their own activation guard. Installing 0049
    // must not invalidate the stable discovery/sender schema fingerprint.
    && !['lead_radar_firecrawl_requests', 'lead_radar_firecrawl_control', 'lead_radar_firecrawl_reports',
      'lead_radar_candidate_pools', 'lead_radar_contact_checks',
      'lead_radar_audiences', 'lead_radar_audience_campaigns', 'lead_radar_contact_enrichments'].includes(tableName)
    && (name.startsWith('lead_radar_') || tableName.startsWith('lead_radar_'));
}

function evaluateStructure(inspection: Inspection, stage: MigrationStage): LeadRadarSchemaIssue[] {
  const issues: LeadRadarSchemaIssue[] = [];
  const tables = expectedTables(stage);
  const indexes = expectedIndexes(stage);
  const expectedObjects = new Map<string, 'table' | 'index'>([
    ...tables.map((table) => [table.name, 'table'] as const),
    ...indexes.map((index) => [index.name, 'index'] as const),
  ]);
  const actualObjects = inspection.schema.filter(isLeadRadarSchemaRow);
  const actualByName = new Map(actualObjects.map((row) => [text(row.name), row]));

  for (const [name, type] of expectedObjects) {
    const actual = actualByName.get(name);
    if (!actual) issues.push(issue('missing_object', name, type, 'missing'));
    else if (actual.type !== type) issues.push(issue('object_type_mismatch', name, type, text(actual.type)));
  }
  for (const actual of actualObjects) {
    const name = text(actual.name);
    if (!expectedObjects.has(name)) issues.push(issue('extra_object', name, 'absent', text(actual.type)));
  }

  for (const table of tables) {
    const schemaRow = actualByName.get(table.name);
    const tableSql = text(schemaRow?.sql);
    if (!tableSql) {
      issues.push(issue('table_sql_missing', table.name));
      continue;
    }
    const expectedColumns = table.columns.filter((column) => column.since <= stage);
    const actualColumns = inspection.columns
      .filter((row) => row.object_name === table.name && integer(row.hidden) === 0)
      .sort((a, b) => integer(a.cid) - integer(b.cid));
    const expectedOrder = expectedColumns.map((column) => column.name);
    const actualOrder = actualColumns.map((column) => text(column.name));
    if (expectedOrder.join('|') !== actualOrder.join('|')) {
      issues.push(issue('column_order_mismatch', table.name, expectedOrder.join(','), actualOrder.join(',')));
    }
    const expectedByName = new Map(expectedColumns.map((column) => [column.name, column]));
    const actualColumnsByName = new Map(actualColumns.map((column) => [text(column.name), column]));
    for (const column of expectedColumns) {
      const actual = actualColumnsByName.get(column.name);
      const object = `${table.name}.${column.name}`;
      if (!actual) {
        issues.push(issue('column_missing', object));
        continue;
      }
      if (text(actual.type).toUpperCase() !== column.type) {
        issues.push(issue('column_type_mismatch', object, column.type, text(actual.type)));
      }
      if (integer(actual.not_null) !== column.notNull) {
        issues.push(issue('column_not_null_mismatch', object, String(column.notNull), String(actual.not_null)));
      }
      const actualDefault = normalizeDefault(actual.dflt_value);
      if (actualDefault !== normalizeDefault(column.defaultValue)) {
        issues.push(issue('column_default_mismatch', object, text(column.defaultValue), text(actual.dflt_value)));
      }
      if (integer(actual.pk) !== column.primaryKey) {
        issues.push(issue('column_primary_key_mismatch', object, String(column.primaryKey), String(actual.pk)));
      }
    }
    for (const actual of actualColumns) {
      const name = text(actual.name);
      if (!expectedByName.has(name)) issues.push(issue('column_extra', `${table.name}.${name}`));
    }

    const normalizedTableSql = normalizeSql(tableSql);
    const checks = table.checks.filter((check) => check.since <= stage);
    for (const check of checks) {
      const expectedCheck = `check(${normalizeSql(check.expression)})`;
      if (!normalizedTableSql.includes(expectedCheck)) {
        issues.push(issue('check_missing', table.name, normalizeSql(check.expression)));
      }
    }
    const actualCheckCount = normalizedTableSql.match(/\bcheck\(/g)?.length ?? 0;
    if (actualCheckCount !== checks.length) {
      issues.push(issue('check_count_mismatch', table.name, String(checks.length), String(actualCheckCount)));
    }
    const uniqueConstraints = (table.uniqueConstraints ?? []).filter((constraint) => constraint.since <= stage);
    for (const constraint of uniqueConstraints) {
      const expectedUnique = `unique(${normalizeSql(constraint.expression)})`;
      if (!normalizedTableSql.includes(expectedUnique)) {
        issues.push(issue('unique_constraint_missing', table.name, normalizeSql(constraint.expression)));
      }
    }
    const actualUniqueCount = normalizedTableSql.match(/\bunique\(/g)?.length ?? 0;
    if (actualUniqueCount !== uniqueConstraints.length) {
      issues.push(issue('unique_constraint_count_mismatch', table.name, String(uniqueConstraints.length), String(actualUniqueCount)));
    }
  }

  const indexListByName = new Map(inspection.indexLists.map((row) => [text(row.name), row]));
  for (const index of indexes) {
    const metadata = indexListByName.get(index.name);
    if (!metadata) continue;
    if (integer(metadata.is_unique) !== index.unique) {
      issues.push(issue('index_uniqueness_mismatch', index.name, String(index.unique), String(metadata.is_unique)));
    }
    if (integer(metadata.partial) !== index.partial) {
      issues.push(issue('index_partial_mismatch', index.name, String(index.partial), String(metadata.partial)));
    }
    const columns = inspection.indexColumns
      .filter((row) => row.object_name === index.name && integer(row.key) === 1)
      .sort((a, b) => integer(a.seqno) - integer(b.seqno))
      .map((row) => `${text(row.name)}:${integer(row.descending) === 1 ? 'desc' : 'asc'}:${text(row.coll).toLowerCase()}`);
    const expected = index.columns.map((column) => `${column.name}:${column.descending ? 'desc' : 'asc'}:binary`);
    if (columns.join('|') !== expected.join('|')) {
      issues.push(issue('index_columns_mismatch', index.name, expected.join(','), columns.join(',')));
    }
    const schemaRow = actualByName.get(index.name);
    const actualSql = text(schemaRow?.sql);
    if (actualSql && normalizeSql(actualSql) !== normalizeSql(index.sql)) {
      issues.push(issue('index_sql_mismatch', index.name, normalizeSql(index.sql), normalizeSql(actualSql)));
    }
  }

  for (const table of tables) {
    const expected = table.foreignKeys
      .filter((item) => item.since <= stage)
      .map((item) => `${item.columns.join(',')}->${item.targetTable}(${item.targetColumns.join(',')}):${item.onUpdate}:${item.onDelete}:${item.match}`)
      .sort();
    const grouped = new Map<number, Array<Record<string, unknown>>>();
    for (const row of inspection.foreignKeys.filter((item) => item.object_name === table.name)) {
      const id = integer(row.id);
      const rows = grouped.get(id) ?? [];
      rows.push(row);
      grouped.set(id, rows);
    }
    const actual = [...grouped.values()].map((rows) => {
      const ordered = rows.sort((a, b) => integer(a.seq) - integer(b.seq));
      const first = ordered[0] ?? {};
      return `${ordered.map((row) => text(row.from_column)).join(',')}->${text(first.target_table)}(${ordered.map((row) => text(row.to_column)).join(',')}):${text(first.on_update).toUpperCase()}:${text(first.on_delete).toUpperCase()}:${text(first.match).toUpperCase()}`;
    }).sort();
    if (expected.join('|') !== actual.join('|')) {
      issues.push(issue('foreign_key_mismatch', table.name, expected.join(';'), actual.join(';')));
    }
  }
  return issues;
}

function ledgerNames(inspection: Inspection): string[] {
  return inspection.ledger.map((row) => text(row.name)).filter(Boolean).sort();
}

function ledgerIssues(
  inspection: Inspection,
  profile: Exclude<LeadRadarSchemaProfile, 'auto'>,
): LeadRadarSchemaIssue[] {
  if (!inspection.ledgerPresent) return [issue('migration_ledger_missing', 'd1_migrations')];
  const actual = new Set(ledgerNames(inspection));
  const required = profile === 'target'
    ? [...LEAD_RADAR_MIGRATIONS]
    : ['0036_lead_radar.sql'];
  const forbidden = profile === 'production-preflight'
    ? [
      '0041_lead_radar_search_leases.sql',
      '0042_lead_radar_decision_makers.sql',
      '0043_lead_radar_async_funnel.sql',
      '0044_lead_radar_telegram_business.sql',
    ]
    : [];
  const missing = required.filter((name) => !actual.has(name));
  const unexpected = forbidden.filter((name) => actual.has(name));
  return missing.length === 0 && unexpected.length === 0
    ? []
    : [issue('migration_ledger_mismatch', 'd1_migrations', `required=${required.join(',')};forbidden=${forbidden.join(',')}`, [...actual].join(','))];
}

function integrityIssues(inspection: Inspection): LeadRadarSchemaIssue[] {
  const issues: LeadRadarSchemaIssue[] = [];
  const values = inspection.integrity.map((row) => text(row[inspection.integrityPragma]));
  if (values.length !== 1 || values[0] !== 'ok') {
    issues.push(issue(
      'integrity_check_failed',
      `PRAGMA ${inspection.integrityPragma}`,
      'ok',
      values.join(','),
    ));
  }
  if (inspection.foreignKeyCheck.length !== 0) {
    issues.push(issue('foreign_key_check_failed', 'PRAGMA foreign_key_check', '0', String(inspection.foreignKeyCheck.length)));
  }
  return issues;
}

function evaluate(
  inspection: Inspection,
  profile: Exclude<LeadRadarSchemaProfile, 'auto'>,
): LeadRadarSchemaIssue[] {
  return [
    ...evaluateStructure(inspection, stageFor(profile)),
    ...ledgerIssues(inspection, profile),
    ...integrityIssues(inspection),
  ];
}

function queryFailureReport(requestedProfile: LeadRadarSchemaProfile): LeadRadarSchemaAuditReport {
  return {
    status: 'blocked',
    requestedProfile,
    matchedProfile: 'none',
    readOnly: true,
    contractVersion: 'lead-radar-schema-v2',
    issues: [issue('audit_query_failed', 'lead_radar_schema')],
    integrity: { ok: false, foreignKeyViolations: -1 },
    objects: { expected: TABLES.length + INDEXES.length, observed: 0 },
    migrationLedger: { present: false, leadRadarEntries: [], migration0041: 'blocked' },
    alternatives: { targetIssueCount: 1, productionPreflightIssueCount: 1 },
  };
}

export async function auditLeadRadarSchema(
  reader: LeadRadarSchemaReader,
  requestedProfile: LeadRadarSchemaProfile = 'target',
  integrityPragma: LeadRadarIntegrityPragma = 'integrity_check',
): Promise<LeadRadarSchemaAuditReport> {
  let inspection: Inspection;
  try {
    inspection = await inspect(reader, integrityPragma);
  } catch {
    return queryFailureReport(requestedProfile);
  }

  const targetIssues = evaluate(inspection, 'target');
  const preflightIssues = evaluate(inspection, 'production-preflight');
  const targetPass = targetIssues.length === 0;
  const preflightPass = preflightIssues.length === 0;
  const matchedProfile = requestedProfile === 'target'
    ? (targetPass ? 'target' : 'none')
    : requestedProfile === 'production-preflight'
      ? (preflightPass ? 'production-preflight' : 'none')
      : targetPass
        ? 'target'
        : preflightPass
          ? 'production-preflight'
          : 'none';
  const issues = requestedProfile === 'target'
    ? targetIssues
    : requestedProfile === 'production-preflight'
      ? preflightIssues
      : matchedProfile === 'target'
        ? targetIssues
        : preflightIssues;
  const leadRadarEntries = ledgerNames(inspection);
  const physical0041Issues = evaluateStructure(inspection, 41);
  const migration0041 = leadRadarEntries.includes('0041_lead_radar_search_leases.sql')
    ? 'ledgered'
    : physical0041Issues.length === 0
      && inspection.ledgerPresent
      && leadRadarEntries.includes('0036_lead_radar.sql')
      && !leadRadarEntries.includes('0042_lead_radar_decision_makers.sql')
      && !leadRadarEntries.includes('0043_lead_radar_async_funnel.sql')
      && !leadRadarEntries.includes('0044_lead_radar_telegram_business.sql')
      ? 'eligible_for_metadata_reconciliation'
      : 'blocked';
  const stage = matchedProfile === 'production-preflight' ? 41 : 44;
  const observedObjects = inspection.schema.filter(isLeadRadarSchemaRow).length;
  return {
    status: matchedProfile === 'none' ? 'blocked' : 'pass',
    requestedProfile,
    matchedProfile,
    readOnly: true,
    contractVersion: 'lead-radar-schema-v2',
    issues,
    integrity: {
      ok: integrityIssues(inspection).length === 0,
      foreignKeyViolations: inspection.foreignKeyCheck.length,
      scope: inspection.integrityPragma === 'quick_check' ? 'lead_radar_tables' : 'database',
    },
    objects: {
      expected: expectedTables(stage).length + expectedIndexes(stage).length,
      observed: observedObjects,
    },
    migrationLedger: {
      present: inspection.ledgerPresent,
      leadRadarEntries,
      migration0041,
    },
    alternatives: {
      targetIssueCount: targetIssues.length,
      productionPreflightIssueCount: preflightIssues.length,
    },
  };
}

export async function auditLeadRadarD1Schema(
  db: D1Database,
  requestedProfile: LeadRadarSchemaProfile = 'target',
): Promise<LeadRadarSchemaAuditReport> {
  // Only the target contract is used on request/queue/cron boundaries. Keep
  // non-target diagnostics on the full auditor for tooling callers.
  const reader: LeadRadarSchemaReader = {
    async query(sql) {
      assertLeadRadarAuditQueryIsReadOnly(sql);
      const result = await db.prepare(sql).all<Record<string, unknown>>();
      if (!result.success) throw new Error('lead_radar_schema_audit_query_failed');
      return result.results ?? [];
    },
  };
  if (requestedProfile !== 'target') {
    return auditLeadRadarSchema(reader, requestedProfile, 'quick_check');
  }

  let schema: Array<Record<string, unknown>>;
  let integrity: Array<Record<string, unknown>>;
  let foreignKeyCheck: Array<Record<string, unknown>>;
  let ledger: Array<Record<string, unknown>>;
  try {
    [schema, integrity, foreignKeyCheck, ledger] = await Promise.all([
      reader.query(AUDIT_QUERIES.schema),
      reader.query(AUDIT_QUERIES.quickCheck),
      reader.query(AUDIT_QUERIES.foreignKeyCheck),
      reader.query(AUDIT_QUERIES.ledger),
    ]);
  } catch {
    return queryFailureReport(requestedProfile);
  }

  const schemaRows = schema.filter(isLeadRadarSchemaRow).sort((left, right) => {
    const leftKey = `${text(left.type)}\u0000${text(left.name)}`;
    const rightKey = `${text(right.type)}\u0000${text(right.name)}`;
    return compareSchemaText(leftKey, rightKey);
  });
  const canonical = schemaRows.map((row) => [
    text(row.type),
    text(row.name),
    text(row.tbl_name),
    // Canonicalize only SQL's non-semantic lexical surface. Quoted values and
    // identifiers stay byte-exact, while D1's omitted comments cannot drift it.
    normalizeSql(text(row.sql)),
  ].join('\u001f')).join('\u001e');
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  const fingerprint = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const issues: LeadRadarSchemaIssue[] = [];
  if (schemaRows.length !== TABLES.length + INDEXES.length
    || fingerprint !== LEAD_RADAR_TARGET_SCHEMA_FINGERPRINT) {
    issues.push(issue(
      'schema_fingerprint_mismatch',
      'lead_radar_schema',
      LEAD_RADAR_TARGET_SCHEMA_FINGERPRINT,
      fingerprint,
    ));
  }
  const integrityValues = integrity.map((row) => text(row.quick_check));
  if (integrityValues.length !== 1 || integrityValues[0] !== 'ok') {
    issues.push(issue('integrity_check_failed', 'PRAGMA quick_check', 'ok', integrityValues.join(',')));
  }
  if (foreignKeyCheck.length !== 0) {
    issues.push(issue(
      'foreign_key_check_failed',
      'PRAGMA foreign_key_check',
      '0',
      String(foreignKeyCheck.length),
    ));
  }
  const entries = ledger.map((row) => text(row.name)).filter(Boolean).sort();
  const expectedEntries = [...LEAD_RADAR_MIGRATIONS].sort();
  if (entries.length !== expectedEntries.length
    || entries.some((name, index) => name !== expectedEntries[index])) {
    issues.push(issue(
      'migration_ledger_mismatch',
      'd1_migrations',
      expectedEntries.join(','),
      entries.join(','),
    ));
  }
  const pass = issues.length === 0;
  return {
    status: pass ? 'pass' : 'blocked',
    requestedProfile,
    matchedProfile: pass ? 'target' : 'none',
    readOnly: true,
    contractVersion: 'lead-radar-schema-v2',
    issues,
    integrity: {
      ok: integrityValues.length === 1
        && integrityValues[0] === 'ok'
        && foreignKeyCheck.length === 0,
      foreignKeyViolations: foreignKeyCheck.length,
      scope: 'lead_radar_tables',
    },
    objects: { expected: TABLES.length + INDEXES.length, observed: schemaRows.length },
    migrationLedger: {
      present: schema.some((row) => row.type === 'table' && row.name === 'd1_migrations'),
      leadRadarEntries: entries,
      migration0041: entries.includes('0041_lead_radar_search_leases.sql') ? 'ledgered' : 'blocked',
    },
    alternatives: {
      targetIssueCount: issues.length,
      productionPreflightIssueCount: issues.length,
    },
  };
}
