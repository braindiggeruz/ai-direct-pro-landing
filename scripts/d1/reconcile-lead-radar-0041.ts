/**
 * Local-only reconciliation for a production-shaped database where the
 * physical Lead Radar 0041 schema exists but its D1 migration-ledger row does
 * not. This is deliberately not a numbered migration and never runs DDL.
 *
 * The CLI is a dry-run unless --execute is supplied. Even in execute mode it
 * invokes Wrangler with --local only and can issue exactly one fixed INSERT.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  assertLeadRadarAuditQueryIsReadOnly,
  auditLeadRadarSchema,
  type LeadRadarSchemaAuditReport,
  type LeadRadarSchemaReader,
} from '../../functions/platform/lead-radar/schema-contract';

export const LEAD_RADAR_0041_MIGRATION = '0041_lead_radar_search_leases.sql' as const;
export const LEAD_RADAR_0041_RECONCILIATION_VERSION =
  'lead-radar-0041-ledger-reconciliation-v1' as const;

export const LEAD_RADAR_0041_ELIGIBLE_LEDGER_TAIL = [
  { id: 40, name: '0040_classifieds_seller_lifecycle.sql' },
  { id: 41, name: '0036_lead_radar.sql' },
] as const;

export const LEAD_RADAR_0041_RECONCILED_LEDGER_TAIL = [
  ...LEAD_RADAR_0041_ELIGIBLE_LEDGER_TAIL,
  { id: 42, name: LEAD_RADAR_0041_MIGRATION },
] as const;

/**
 * The only mutation this artifact can submit. The SELECT yields at most one
 * row and repeats the exact ledger-tail guards atomically with the INSERT.
 */
export const LEAD_RADAR_0041_LEDGER_INSERT_SQL = `INSERT INTO d1_migrations (name)
SELECT '${LEAD_RADAR_0041_MIGRATION}'
WHERE (SELECT COUNT(*) FROM d1_migrations WHERE id >= 40) = 2
  AND (SELECT MAX(id) FROM d1_migrations) = 41
  AND EXISTS (
    SELECT 1 FROM d1_migrations
    WHERE id = 40 AND name = '0040_classifieds_seller_lifecycle.sql'
  )
  AND EXISTS (
    SELECT 1 FROM d1_migrations
    WHERE id = 41 AND name = '0036_lead_radar.sql'
  )
  AND NOT EXISTS (
    SELECT 1 FROM d1_migrations WHERE name = '${LEAD_RADAR_0041_MIGRATION}'
  );`;

const LEDGER_INSPECTION_SQL = `SELECT id, name FROM d1_migrations
WHERE id >= 40
   OR name IN ('0036_lead_radar.sql', '${LEAD_RADAR_0041_MIGRATION}')
ORDER BY id, name`;

const PHYSICAL_SCHEMA_FINGERPRINT_SQL = `SELECT type, name, tbl_name, COALESCE(sql, '') AS sql
FROM sqlite_schema
WHERE (name GLOB 'lead_radar_*' OR tbl_name GLOB 'lead_radar_*')
  AND name NOT GLOB 'sqlite_autoindex_*'
ORDER BY type, name, tbl_name, sql`;

const DATABASE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const INSERT_SHA256 = createHash('sha256').update(LEAD_RADAR_0041_LEDGER_INSERT_SQL).digest('hex');

type LedgerState = 'eligible' | 'reconciled' | 'mismatch' | 'unknown';
type ReconciliationStatus = 'eligible' | 'reconciled' | 'already_reconciled' | 'blocked';
type Blocker =
  | 'inspection_failed'
  | 'ledger_tail_mismatch'
  | 'physical_schema_mismatch'
  | 'preflight_changed'
  | 'mutation_not_applied'
  | 'postcondition_failed';

export interface LeadRadar0041LedgerWriter {
  execute(sql: string): Promise<{ changes: number }>;
}

export interface LeadRadar0041ReconciliationStore
  extends LeadRadarSchemaReader, LeadRadar0041LedgerWriter {}

export interface LeadRadar0041ReconciliationResult {
  status: ReconciliationStatus;
  mode: 'dry-run' | 'execute';
  localOnly: true;
  contractVersion: typeof LEAD_RADAR_0041_RECONCILIATION_VERSION;
  migration: typeof LEAD_RADAR_0041_MIGRATION;
  blockers: Blocker[];
  validation: {
    profile: 'production-preflight';
    audit: 'pass' | 'blocked' | 'not_run';
    auditIssueCodes: string[];
    integrityOk: boolean | null;
    foreignKeyViolations: number | null;
    ledgerState: LedgerState;
    schemaFingerprint: string | null;
    preflightUnchanged: boolean | null;
  };
  mutation: {
    attempted: boolean;
    rowsInserted: 0 | 1;
    statementSha256: string;
  };
}

export interface LeadRadar0041CliOptions {
  database: string;
  config: string | null;
  execute: boolean;
}

interface LedgerRow {
  id: number;
  name: string;
}

interface Snapshot {
  ok: boolean;
  ledgerState: LedgerState;
  ledgerRows: LedgerRow[];
  schemaFingerprint: string | null;
  audit: LeadRadarSchemaAuditReport | null;
  blocker: Blocker | null;
}

interface D1Envelope {
  success?: boolean;
  results?: Array<Record<string, unknown>>;
  meta?: { changes?: number };
}

function baseResult(mode: 'dry-run' | 'execute'): LeadRadar0041ReconciliationResult {
  return {
    status: 'blocked',
    mode,
    localOnly: true,
    contractVersion: LEAD_RADAR_0041_RECONCILIATION_VERSION,
    migration: LEAD_RADAR_0041_MIGRATION,
    blockers: [],
    validation: {
      profile: 'production-preflight',
      audit: 'not_run',
      auditIssueCodes: [],
      integrityOk: null,
      foreignKeyViolations: null,
      ledgerState: 'unknown',
      schemaFingerprint: null,
      preflightUnchanged: null,
    },
    mutation: {
      attempted: false,
      rowsInserted: 0,
      statementSha256: INSERT_SHA256,
    },
  };
}

function normalizeLedgerRows(rows: Array<Record<string, unknown>>): LedgerRow[] | null {
  const normalized: LedgerRow[] = [];
  for (const row of rows) {
    const id = typeof row.id === 'number' ? row.id : Number(row.id);
    if (!Number.isSafeInteger(id) || id < 1 || typeof row.name !== 'string') return null;
    normalized.push({ id, name: row.name });
  }
  return normalized;
}

function rowsEqual(
  actual: readonly LedgerRow[],
  expected: ReadonlyArray<{ readonly id: number; readonly name: string }>,
): boolean {
  return actual.length === expected.length
    && actual.every((row, index) => (
      row.id === expected[index]?.id && row.name === expected[index]?.name
    ));
}

function ledgerState(rows: readonly LedgerRow[]): LedgerState {
  if (rowsEqual(rows, LEAD_RADAR_0041_ELIGIBLE_LEDGER_TAIL)) return 'eligible';
  if (rowsEqual(rows, LEAD_RADAR_0041_RECONCILED_LEDGER_TAIL)) return 'reconciled';
  return 'mismatch';
}

function canonicalSchemaFingerprint(rows: Array<Record<string, unknown>>): string {
  const canonical = rows.map((row) => ({
    type: typeof row.type === 'string' ? row.type : '',
    name: typeof row.name === 'string' ? row.name : '',
    table: typeof row.tbl_name === 'string' ? row.tbl_name : '',
    sql: typeof row.sql === 'string' ? row.sql : '',
  }));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function auditReaderForLedgerState(
  reader: LeadRadarSchemaReader,
  state: LedgerState,
): LeadRadarSchemaReader {
  if (state !== 'reconciled') return reader;
  return {
    async query(sql) {
      const rows = await reader.query(sql);
      // The existing production-preflight contract intentionally expects 0041
      // to be physically present and unledgered. Once the exact post-state is
      // proven above, hide only that one row from the contract's ledger SELECT
      // so the same physical-schema/integrity checks can be reused on reruns.
      if (/FROM\s+d1_migrations\s+WHERE\s+name\s+IN\s*\(/i.test(sql)) {
        return rows.filter((row) => row.name !== LEAD_RADAR_0041_MIGRATION);
      }
      return rows;
    },
  };
}

async function takeSnapshot(reader: LeadRadarSchemaReader): Promise<Snapshot> {
  try {
    assertLeadRadarAuditQueryIsReadOnly(LEDGER_INSPECTION_SQL);
    assertLeadRadarAuditQueryIsReadOnly(PHYSICAL_SCHEMA_FINGERPRINT_SQL);
    const rawLedger = await reader.query(LEDGER_INSPECTION_SQL);
    const ledgerRows = normalizeLedgerRows(rawLedger);
    if (!ledgerRows) {
      return {
        ok: false,
        ledgerState: 'unknown',
        ledgerRows: [],
        schemaFingerprint: null,
        audit: null,
        blocker: 'inspection_failed',
      };
    }
    const state = ledgerState(ledgerRows);
    if (state === 'mismatch') {
      return {
        ok: false,
        ledgerState: state,
        ledgerRows,
        schemaFingerprint: null,
        audit: null,
        blocker: 'ledger_tail_mismatch',
      };
    }
    const audit = await auditLeadRadarSchema(
      auditReaderForLedgerState(reader, state),
      'production-preflight',
    );
    if (audit.status !== 'pass'
      || audit.matchedProfile !== 'production-preflight'
      || !audit.integrity.ok
      || audit.integrity.foreignKeyViolations !== 0) {
      return {
        ok: false,
        ledgerState: state,
        ledgerRows,
        schemaFingerprint: null,
        audit,
        blocker: 'physical_schema_mismatch',
      };
    }
    const schemaRows = await reader.query(PHYSICAL_SCHEMA_FINGERPRINT_SQL);
    return {
      ok: true,
      ledgerState: state,
      ledgerRows,
      schemaFingerprint: canonicalSchemaFingerprint(schemaRows),
      audit,
      blocker: null,
    };
  } catch {
    return {
      ok: false,
      ledgerState: 'unknown',
      ledgerRows: [],
      schemaFingerprint: null,
      audit: null,
      blocker: 'inspection_failed',
    };
  }
}

function applySnapshot(
  result: LeadRadar0041ReconciliationResult,
  snapshot: Snapshot,
): void {
  result.validation.ledgerState = snapshot.ledgerState;
  result.validation.schemaFingerprint = snapshot.schemaFingerprint;
  if (snapshot.audit) {
    result.validation.audit = snapshot.audit.status;
    result.validation.auditIssueCodes = [...new Set(
      snapshot.audit.issues.map((issue) => issue.code),
    )].sort();
    result.validation.integrityOk = snapshot.audit.integrity.ok;
    result.validation.foreignKeyViolations = snapshot.audit.integrity.foreignKeyViolations;
  }
  if (snapshot.blocker) result.blockers = [snapshot.blocker];
}

function snapshotsMatch(first: Snapshot, second: Snapshot): boolean {
  return first.ok
    && second.ok
    && first.ledgerState === 'eligible'
    && second.ledgerState === 'eligible'
    && first.schemaFingerprint === second.schemaFingerprint
    && JSON.stringify(first.ledgerRows) === JSON.stringify(second.ledgerRows)
    && JSON.stringify(first.audit) === JSON.stringify(second.audit);
}

/**
 * Reconciles metadata only. Callers cannot provide SQL; the fixed statement
 * above is the sole mutation path.
 */
export async function reconcileLeadRadar0041Ledger(
  store: LeadRadar0041ReconciliationStore,
  options: { execute?: boolean } = {},
): Promise<LeadRadar0041ReconciliationResult> {
  const mode = options.execute === true ? 'execute' : 'dry-run';
  const result = baseResult(mode);
  const first = await takeSnapshot(store);
  applySnapshot(result, first);
  if (!first.ok) return result;

  if (first.ledgerState === 'reconciled') {
    result.status = 'already_reconciled';
    return result;
  }
  if (mode === 'dry-run') {
    result.status = 'eligible';
    return result;
  }

  const second = await takeSnapshot(store);
  result.validation.preflightUnchanged = snapshotsMatch(first, second);
  if (!result.validation.preflightUnchanged) {
    result.blockers = ['preflight_changed'];
    return result;
  }

  result.mutation.attempted = true;
  let changes: number;
  try {
    const mutation = await store.execute(LEAD_RADAR_0041_LEDGER_INSERT_SQL);
    changes = mutation.changes;
  } catch {
    result.blockers = ['mutation_not_applied'];
    return result;
  }
  if (changes !== 1) {
    result.blockers = ['mutation_not_applied'];
    return result;
  }
  result.mutation.rowsInserted = 1;

  const postcondition = await takeSnapshot(store);
  if (!postcondition.ok
    || postcondition.ledgerState !== 'reconciled'
    || postcondition.schemaFingerprint !== first.schemaFingerprint) {
    applySnapshot(result, postcondition);
    result.blockers = ['postcondition_failed'];
    return result;
  }
  applySnapshot(result, postcondition);
  result.validation.preflightUnchanged = true;
  result.status = 'reconciled';
  result.blockers = [];
  return result;
}

export function parseLeadRadar0041Arguments(argv: string[]): LeadRadar0041CliOptions {
  let database: string | null = null;
  let config: string | null = null;
  let execute = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--database') {
      const value = argv[index + 1];
      if (!value || !DATABASE_NAME.test(value)) throw new Error('invalid_arguments');
      database = value;
      index += 1;
    } else if (argument === '--config') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('invalid_arguments');
      config = value;
      index += 1;
    } else if (argument === '--execute') {
      if (execute) throw new Error('invalid_arguments');
      execute = true;
    } else {
      // In particular, --remote is never an accepted argument.
      throw new Error('invalid_arguments');
    }
  }
  if (!database) throw new Error('invalid_arguments');
  return { database, config, execute };
}

function parseWranglerEnvelope(stdout: string): D1Envelope {
  const parsed = JSON.parse(stdout) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error('invalid_envelope');
  const envelope = parsed[0] as D1Envelope;
  if (envelope.success !== true || !Array.isArray(envelope.results)) throw new Error('invalid_envelope');
  return envelope;
}

function localWranglerStore(options: LeadRadar0041CliOptions): LeadRadar0041ReconciliationStore {
  const require = createRequire(import.meta.url);
  const wranglerCli = require.resolve('wrangler');
  const invoke = (sql: string): D1Envelope => {
    const args = [
      wranglerCli,
      'd1',
      'execute',
      options.database,
      '--local',
      '--command',
      sql,
      '--json',
    ];
    if (options.config) args.push('--config', options.config);
    const command = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    // Never relay Wrangler output: even local metadata can contain account- or
    // workstation-scoped paths and identifiers.
    if (command.status !== 0 || command.error) throw new Error('wrangler_failed');
    return parseWranglerEnvelope(command.stdout);
  };
  return {
    async query(sql) {
      assertLeadRadarAuditQueryIsReadOnly(sql);
      return invoke(sql).results ?? [];
    },
    async execute(sql) {
      if (sql !== LEAD_RADAR_0041_LEDGER_INSERT_SQL) throw new Error('mutation_rejected');
      const envelope = invoke(sql);
      const changes = envelope.meta?.changes;
      if (changes !== 0 && changes !== 1) throw new Error('invalid_change_count');
      return { changes };
    },
  };
}

async function main(): Promise<void> {
  const mode = process.argv.includes('--execute') ? 'execute' : 'dry-run';
  let options: LeadRadar0041CliOptions;
  try {
    options = parseLeadRadar0041Arguments(process.argv.slice(2));
  } catch {
    const result = baseResult(mode);
    result.blockers = ['inspection_failed'];
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2;
    return;
  }
  const result = await reconcileLeadRadar0041Ledger(localWranglerStore(options), {
    execute: options.execute,
  });
  console.log(JSON.stringify({
    ...result,
    scope: { database: options.database, location: 'local' as const },
  }, null, 2));
  if (result.status === 'blocked') process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';
const modulePath = path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invokedPath === modulePath) await main();
