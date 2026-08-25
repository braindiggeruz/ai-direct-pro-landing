import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');
const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_SNAPSHOT_BYTES = 1024 * 1024;
const REQUIRED_LEAD_RADAR_FLAGS = [
  'LEAD_RADAR_ADMISSION_ENABLED',
  'LEAD_RADAR_CONTACT_ENABLED',
  'LEAD_RADAR_PROCESSING_ENABLED',
] as const;

type JsonScalar = boolean | number | string | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
type UnknownReason = 'explicit_unknown' | 'missing_snapshot';
type FileSnapshotKind = 'artifact-metadata' | 'config' | 'migration' | 'source';
type PiiPlane = 'audit' | 'cache' | 'log' | 'personal-vault' | 'queue' | 'research-d1' | 'unknown';
type PiiClass =
  | 'email'
  | 'ip_address'
  | 'message_content'
  | 'other_personal'
  | 'personal_name'
  | 'phone'
  | 'telegram_handle'
  | 'telegram_id';

export const RELEASE_MANIFEST_VERSION = 'lead-radar-release-manifest/v1' as const;

export const CAPTURE_IO_CONTRACT = Object.freeze({
  network: false,
  sql: false,
  external_writes: false,
  local_report_write: true,
});

export interface FileSnapshotInput {
  path: string;
  kind: FileSnapshotKind;
  text: string;
}

export interface PiiLocationInput {
  location: string;
  data_classes: PiiClass[];
  plane: PiiPlane;
  retention_policy: string | null;
  control_owner: string | null;
}

export interface ReleaseManifestInputV1 {
  schema_version: 1;
  captured_at: string;
  PROD: {
    pages: {
      artifact: string | null;
      routes: string[] | null;
      rollback_artifact: string | null;
    };
    worker: {
      artifact: string | null;
      rollback_artifact: string | null;
      bindings: Array<{
        name: string;
        type: string;
        target: string | null;
      }> | null;
      consumers: string[] | null;
      crons: string[] | null;
    };
    d1: {
      database_id: string | null;
      ledger: Array<{
        sequence: number | null;
        name: string;
        sha256: string | null;
      }> | null;
      physical_schema_snapshot: {
        format: string;
        text: string;
      } | null;
    };
    lead_radar: {
      old_sync_route: 'paused' | 'present' | 'unknown' | null;
      flags: Record<string, boolean | 'unknown'> | null;
    };
    pii_locations: PiiLocationInput[] | null;
  };
  HEAD: {
    revision: string | null;
    file_snapshots: FileSnapshotInput[] | null;
    pii_locations: PiiLocationInput[] | null;
  };
  WIP: {
    base_revision: string | null;
    dirty_paths: string[] | null;
    untracked_paths: string[] | null;
    file_snapshots: FileSnapshotInput[] | null;
    pii_locations: PiiLocationInput[] | null;
  };
}

export interface ReleaseManifestUnknown {
  state: 'HEAD' | 'PROD' | 'WIP';
  field: string;
  reason: UnknownReason;
  required_for_release: true;
}

interface HashedFileSnapshot {
  path: string;
  kind: FileSnapshotKind;
  sha256: string;
}

interface PiiLocationManifest {
  location: string;
  data_classes: PiiClass[];
  plane: PiiPlane;
  retention_policy: string | null;
  control_owner: string | null;
}

export interface LeadRadarReleaseManifestV1 {
  manifest_version: typeof RELEASE_MANIFEST_VERSION;
  captured_at: string;
  status: 'blocked' | 'ready';
  source_snapshot_sha256: string;
  capture_io: typeof CAPTURE_IO_CONTRACT;
  states: {
    PROD: {
      pages: {
        artifact: string | null;
        routes: string[] | null;
        rollback_artifact: string | null;
      };
      worker: {
        artifact: string | null;
        rollback_artifact: string | null;
        bindings: Array<{
          name: string;
          type: string;
          target_fingerprint: string | null;
        }> | null;
        consumers: string[] | null;
        crons: string[] | null;
      };
      d1: {
        database_fingerprint: string | null;
        ledger: Array<{
          sequence: number | null;
          name: string;
          sha256: string | null;
        }> | null;
        physical_schema: {
          format: string;
          sha256: string;
        } | null;
      };
      lead_radar: {
        old_sync_route: 'paused' | 'present' | 'unknown' | null;
        flags: Record<string, boolean | 'unknown'> | null;
      };
      pii_locations: PiiLocationManifest[] | null;
    };
    HEAD: {
      repo: {
        revision: string | null;
        files: HashedFileSnapshot[] | null;
        migration_hashes: Record<string, string> | null;
      };
      pii_locations: PiiLocationManifest[] | null;
    };
    WIP: {
      repo: {
        base_revision: string | null;
        dirty_paths: string[] | null;
        untracked_paths: string[] | null;
        files: HashedFileSnapshot[] | null;
        migration_hashes: Record<string, string> | null;
      };
      pii_locations: PiiLocationManifest[] | null;
    };
  };
  unknowns: ReleaseManifestUnknown[];
}

export class ReleaseManifestInputError extends Error {
  readonly code = 'invalid_input';

  constructor(field: string, reason: string) {
    super(`invalid release manifest input at ${field}: ${reason}`);
    this.name = 'ReleaseManifestInputError';
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareText)
        .map((key) => [key, normalizeJson(value[key])]),
    );
  }
  return value;
}

export function stableJson(value: JsonValue, pretty = false): string {
  return JSON.stringify(normalizeJson(value), null, pretty ? 2 : undefined);
}

export function canonicalizeLf(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function sha256Lf(text: string): string {
  return createHash('sha256').update(canonicalizeLf(text), 'utf8').digest('hex');
}

export function sha256CanonicalJson(value: JsonValue): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function objectAt(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new ReleaseManifestInputError(field, 'expected_object');
  return value;
}

function exactObject(
  value: unknown,
  field: string,
  keys: readonly string[],
): Record<string, unknown> {
  const object = objectAt(value, field);
  const actual = Object.keys(object).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ReleaseManifestInputError(field, 'unexpected_or_missing_field');
  }
  return object;
}

function requiredString(
  value: unknown,
  field: string,
  options: { max?: number; pattern?: RegExp; allowEmpty?: boolean } = {},
): string {
  if (typeof value !== 'string') throw new ReleaseManifestInputError(field, 'expected_string');
  const max = options.max ?? 512;
  if ((!options.allowEmpty && value.length === 0) || value.length > max) {
    throw new ReleaseManifestInputError(field, 'invalid_length');
  }
  if (value !== value.trim() || hasUnsafeControlCharacter(value)) {
    throw new ReleaseManifestInputError(field, 'unsafe_characters');
  }
  if (options.pattern && !options.pattern.test(value)) {
    throw new ReleaseManifestInputError(field, 'invalid_format');
  }
  return value;
}

function nullableString(
  value: unknown,
  field: string,
  options: { max?: number; pattern?: RegExp } = {},
): string | null {
  return value === null ? null : requiredString(value, field, options);
}

const RAW_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const RAW_TELEGRAM_URL = /\b(?:https?:\/\/)?(?:t|telegram)\.me\/[A-Za-z0-9_]+/i;
const RAW_TELEGRAM_HANDLE = /(?:^|[\s("'=:])@[A-Za-z][A-Za-z0-9_]{4,}\b/m;
const RAW_PHONE = /\+(?:[\s().-]*\d){8,}/;
const RAW_IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const SECRET_MARKERS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAuthorization\s*:\s*Bearer\s+[^\s"']{12,}/i,
  /(?:^|[^A-Za-z0-9])(?:api[_-]?key|password|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_+/.=-]{16,}/i,
  /\b(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{20,}/,
  /\b\d{7,12}:[A-Za-z0-9_-]{30,}\b/,
] as const;

function hasUnsafeControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function assertNoRawPii(text: string, field: string): void {
  if (
    RAW_EMAIL.test(text)
    || RAW_TELEGRAM_URL.test(text)
    || RAW_TELEGRAM_HANDLE.test(text)
    || RAW_PHONE.test(text)
    || RAW_IPV4.test(text)
  ) {
    throw new ReleaseManifestInputError(field, 'raw_pii_forbidden');
  }
}

function assertNoSecret(text: string, field: string): void {
  if (SECRET_MARKERS.some((pattern) => pattern.test(text))) {
    throw new ReleaseManifestInputError(field, 'secret_material_forbidden');
  }
}

function safeMetadataString(
  value: unknown,
  field: string,
  options: { max?: number; pattern?: RegExp } = {},
): string {
  const result = requiredString(value, field, options);
  assertNoSecret(result, field);
  assertNoRawPii(result, field);
  return result;
}

function safeNullableMetadataString(
  value: unknown,
  field: string,
  options: { max?: number; pattern?: RegExp } = {},
): string | null {
  return value === null ? null : safeMetadataString(value, field, options);
}

function textSnapshot(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new ReleaseManifestInputError(field, 'expected_string');
  if (Buffer.byteLength(value, 'utf8') > MAX_TEXT_SNAPSHOT_BYTES) {
    throw new ReleaseManifestInputError(field, 'snapshot_too_large');
  }
  if (value.includes('\u0000')) throw new ReleaseManifestInputError(field, 'unsafe_characters');
  assertNoSecret(value, field);
  assertNoRawPii(value, field);
  return value;
}

function normalizedRepoPath(value: unknown, field: string): string {
  const raw = safeMetadataString(value, field, { max: 512 });
  const normalized = raw.replace(/\\/g, '/');
  if (
    path.posix.isAbsolute(normalized)
    || /^[A-Za-z]:\//.test(normalized)
    || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new ReleaseManifestInputError(field, 'path_must_be_repository_relative');
  }
  return normalized;
}

function sortedUniqueStrings(
  value: unknown,
  field: string,
  parse: (item: unknown, itemField: string) => string,
): string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) throw new ReleaseManifestInputError(field, 'expected_array_or_null');
  if (value.length > 2048) throw new ReleaseManifestInputError(field, 'too_many_items');
  const values = value.map((item, index) => parse(item, `${field}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new ReleaseManifestInputError(field, 'duplicate_item');
  }
  return values.sort(compareText);
}

function parsePiiLocations(value: unknown, field: string): PiiLocationManifest[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) throw new ReleaseManifestInputError(field, 'expected_array_or_null');
  if (value.length > 512) throw new ReleaseManifestInputError(field, 'too_many_items');
  const allowedClasses = new Set<PiiClass>([
    'email',
    'ip_address',
    'message_content',
    'other_personal',
    'personal_name',
    'phone',
    'telegram_handle',
    'telegram_id',
  ]);
  const allowedPlanes = new Set<PiiPlane>([
    'audit',
    'cache',
    'log',
    'personal-vault',
    'queue',
    'research-d1',
    'unknown',
  ]);
  const locations = value.map((raw, index): PiiLocationManifest => {
    const prefix = `${field}[${index}]`;
    const item = exactObject(raw, prefix, [
      'location',
      'data_classes',
      'plane',
      'retention_policy',
      'control_owner',
    ]);
    if (!Array.isArray(item.data_classes) || item.data_classes.length === 0) {
      throw new ReleaseManifestInputError(`${prefix}.data_classes`, 'expected_nonempty_array');
    }
    const classes = item.data_classes.map((candidate, classIndex) => {
      const parsed = requiredString(candidate, `${prefix}.data_classes[${classIndex}]`, { max: 64 });
      if (!allowedClasses.has(parsed as PiiClass)) {
        throw new ReleaseManifestInputError(`${prefix}.data_classes[${classIndex}]`, 'invalid_enum');
      }
      return parsed as PiiClass;
    }).sort(compareText);
    if (new Set(classes).size !== classes.length) {
      throw new ReleaseManifestInputError(`${prefix}.data_classes`, 'duplicate_item');
    }
    const plane = requiredString(item.plane, `${prefix}.plane`, { max: 64 }) as PiiPlane;
    if (!allowedPlanes.has(plane)) {
      throw new ReleaseManifestInputError(`${prefix}.plane`, 'invalid_enum');
    }
    return {
      location: safeMetadataString(item.location, `${prefix}.location`, { max: 512 }),
      data_classes: classes,
      plane,
      retention_policy: safeNullableMetadataString(
        item.retention_policy,
        `${prefix}.retention_policy`,
        { max: 256 },
      ),
      control_owner: safeNullableMetadataString(
        item.control_owner,
        `${prefix}.control_owner`,
        { max: 128 },
      ),
    };
  });
  locations.sort((left, right) => compareText(left.location, right.location));
  if (new Set(locations.map((item) => item.location)).size !== locations.length) {
    throw new ReleaseManifestInputError(field, 'duplicate_location');
  }
  return locations;
}

function parseFileSnapshots(value: unknown, field: string): HashedFileSnapshot[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) throw new ReleaseManifestInputError(field, 'expected_array_or_null');
  if (value.length > 2048) throw new ReleaseManifestInputError(field, 'too_many_items');
  const kinds = new Set<FileSnapshotKind>(['artifact-metadata', 'config', 'migration', 'source']);
  const files = value.map((raw, index): HashedFileSnapshot => {
    const prefix = `${field}[${index}]`;
    const item = exactObject(raw, prefix, ['path', 'kind', 'text']);
    const kind = requiredString(item.kind, `${prefix}.kind`, { max: 32 }) as FileSnapshotKind;
    if (!kinds.has(kind)) throw new ReleaseManifestInputError(`${prefix}.kind`, 'invalid_enum');
    return {
      path: normalizedRepoPath(item.path, `${prefix}.path`),
      kind,
      sha256: sha256Lf(textSnapshot(item.text, `${prefix}.text`)),
    };
  }).sort((left, right) => compareText(left.path, right.path));
  if (new Set(files.map((item) => item.path)).size !== files.length) {
    throw new ReleaseManifestInputError(field, 'duplicate_path');
  }
  return files;
}

function migrationHashes(files: HashedFileSnapshot[] | null): Record<string, string> | null {
  if (files === null) return null;
  return Object.fromEntries(
    files
      .filter((file) => file.kind === 'migration')
      .map((file) => [file.path, file.sha256]),
  );
}

function parseRevision(value: unknown, field: string): string | null {
  return nullableString(value, field, { pattern: /^[a-f0-9]{40,64}$/i, max: 64 });
}

function addUnknown(
  unknowns: ReleaseManifestUnknown[],
  state: ReleaseManifestUnknown['state'],
  field: string,
  reason: UnknownReason,
): void {
  unknowns.push({ state, field, reason, required_for_release: true });
}

function noteNullable(
  unknowns: ReleaseManifestUnknown[],
  state: ReleaseManifestUnknown['state'],
  field: string,
  value: unknown,
): void {
  if (value === null) addUnknown(unknowns, state, field, 'missing_snapshot');
}

function parseInput(value: unknown): {
  capturedAt: string;
  states: LeadRadarReleaseManifestV1['states'];
  unknowns: ReleaseManifestUnknown[];
} {
  const root = exactObject(value, '$', ['schema_version', 'captured_at', 'PROD', 'HEAD', 'WIP']);
  if (root.schema_version !== 1) {
    throw new ReleaseManifestInputError('schema_version', 'unsupported_version');
  }
  const capturedAt = requiredString(root.captured_at, 'captured_at', { max: 64 });
  let capturedDate: Date;
  try {
    capturedDate = new Date(capturedAt);
  } catch {
    throw new ReleaseManifestInputError('captured_at', 'invalid_iso8601_utc');
  }
  if (!Number.isFinite(capturedDate.getTime()) || capturedDate.toISOString() !== capturedAt) {
    throw new ReleaseManifestInputError('captured_at', 'invalid_iso8601_utc');
  }

  const unknowns: ReleaseManifestUnknown[] = [];
  const prod = exactObject(root.PROD, 'PROD', ['pages', 'worker', 'd1', 'lead_radar', 'pii_locations']);
  const pages = exactObject(prod.pages, 'PROD.pages', ['artifact', 'routes', 'rollback_artifact']);
  const pagesArtifact = safeNullableMetadataString(pages.artifact, 'PROD.pages.artifact');
  const pagesRollback = safeNullableMetadataString(
    pages.rollback_artifact,
    'PROD.pages.rollback_artifact',
  );
  const routes = sortedUniqueStrings(pages.routes, 'PROD.pages.routes', (item, field) => {
    const route = safeMetadataString(item, field, { max: 512 });
    if (!route.startsWith('/') || route.includes('?') || route.includes('#')) {
      throw new ReleaseManifestInputError(field, 'invalid_route');
    }
    return route;
  });
  noteNullable(unknowns, 'PROD', 'states.PROD.pages.artifact', pagesArtifact);
  noteNullable(unknowns, 'PROD', 'states.PROD.pages.rollback_artifact', pagesRollback);
  noteNullable(unknowns, 'PROD', 'states.PROD.pages.routes', routes);

  const worker = exactObject(prod.worker, 'PROD.worker', [
    'artifact',
    'rollback_artifact',
    'bindings',
    'consumers',
    'crons',
  ]);
  const workerArtifact = safeNullableMetadataString(worker.artifact, 'PROD.worker.artifact');
  const workerRollback = safeNullableMetadataString(
    worker.rollback_artifact,
    'PROD.worker.rollback_artifact',
  );
  let bindings: LeadRadarReleaseManifestV1['states']['PROD']['worker']['bindings'] = null;
  if (worker.bindings !== null) {
    if (!Array.isArray(worker.bindings)) {
      throw new ReleaseManifestInputError('PROD.worker.bindings', 'expected_array_or_null');
    }
    if (worker.bindings.length > 512) {
      throw new ReleaseManifestInputError('PROD.worker.bindings', 'too_many_items');
    }
    bindings = worker.bindings.map((raw, index) => {
      const prefix = `PROD.worker.bindings[${index}]`;
      const item = exactObject(raw, prefix, ['name', 'type', 'target']);
      const target = nullableString(item.target, `${prefix}.target`, { max: 512 });
      if (target !== null && hasUnsafeControlCharacter(target)) {
        throw new ReleaseManifestInputError(`${prefix}.target`, 'unsafe_characters');
      }
      return {
        name: safeMetadataString(item.name, `${prefix}.name`, {
          max: 128,
          pattern: /^[A-Za-z][A-Za-z0-9_-]*$/,
        }),
        type: safeMetadataString(item.type, `${prefix}.type`, {
          max: 64,
          pattern: /^[a-z][a-z0-9_-]*$/,
        }),
        target_fingerprint: target === null ? null : `sha256:${sha256Lf(target)}`,
      };
    }).sort((left, right) => compareText(`${left.name}\u0000${left.type}`, `${right.name}\u0000${right.type}`));
    if (new Set(bindings.map((item) => item.name)).size !== bindings.length) {
      throw new ReleaseManifestInputError('PROD.worker.bindings', 'duplicate_binding_name');
    }
    bindings.forEach((binding, index) => {
      if (binding.target_fingerprint === null) {
        addUnknown(unknowns, 'PROD', `states.PROD.worker.bindings[${index}].target_fingerprint`, 'missing_snapshot');
      }
    });
  }
  const consumers = sortedUniqueStrings(
    worker.consumers,
    'PROD.worker.consumers',
    (item, field) => safeMetadataString(item, field, { max: 512 }),
  );
  const crons = sortedUniqueStrings(
    worker.crons,
    'PROD.worker.crons',
    (item, field) => safeMetadataString(item, field, { max: 128 }),
  );
  noteNullable(unknowns, 'PROD', 'states.PROD.worker.artifact', workerArtifact);
  noteNullable(unknowns, 'PROD', 'states.PROD.worker.rollback_artifact', workerRollback);
  noteNullable(unknowns, 'PROD', 'states.PROD.worker.bindings', bindings);
  noteNullable(unknowns, 'PROD', 'states.PROD.worker.consumers', consumers);
  noteNullable(unknowns, 'PROD', 'states.PROD.worker.crons', crons);

  const d1 = exactObject(prod.d1, 'PROD.d1', ['database_id', 'ledger', 'physical_schema_snapshot']);
  const databaseId = nullableString(d1.database_id, 'PROD.d1.database_id', { max: 512 });
  let ledger: LeadRadarReleaseManifestV1['states']['PROD']['d1']['ledger'] = null;
  if (d1.ledger !== null) {
    if (!Array.isArray(d1.ledger)) {
      throw new ReleaseManifestInputError('PROD.d1.ledger', 'expected_array_or_null');
    }
    if (d1.ledger.length > 2048) {
      throw new ReleaseManifestInputError('PROD.d1.ledger', 'too_many_items');
    }
    ledger = d1.ledger.map((raw, index) => {
      const prefix = `PROD.d1.ledger[${index}]`;
      const item = exactObject(raw, prefix, ['sequence', 'name', 'sha256']);
      if (item.sequence !== null && (!Number.isSafeInteger(item.sequence) || Number(item.sequence) < 0)) {
        throw new ReleaseManifestInputError(`${prefix}.sequence`, 'expected_nonnegative_integer_or_null');
      }
      return {
        sequence: item.sequence as number | null,
        name: safeMetadataString(item.name, `${prefix}.name`, { max: 256 }),
        sha256: nullableString(item.sha256, `${prefix}.sha256`, {
          max: 64,
          pattern: /^[a-f0-9]{64}$/i,
        })?.toLowerCase() ?? null,
      };
    }).sort((left, right) => {
      const sequence = (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER);
      return sequence === 0 ? compareText(left.name, right.name) : sequence;
    });
    if (new Set(ledger.map((item) => item.name)).size !== ledger.length) {
      throw new ReleaseManifestInputError('PROD.d1.ledger', 'duplicate_migration_name');
    }
  }
  let physicalSchema: LeadRadarReleaseManifestV1['states']['PROD']['d1']['physical_schema'] = null;
  if (d1.physical_schema_snapshot !== null) {
    const schema = exactObject(
      d1.physical_schema_snapshot,
      'PROD.d1.physical_schema_snapshot',
      ['format', 'text'],
    );
    physicalSchema = {
      format: safeMetadataString(schema.format, 'PROD.d1.physical_schema_snapshot.format', {
        max: 128,
        pattern: /^[a-z0-9][a-z0-9._/-]*$/,
      }),
      sha256: sha256Lf(textSnapshot(schema.text, 'PROD.d1.physical_schema_snapshot.text')),
    };
  }
  noteNullable(unknowns, 'PROD', 'states.PROD.d1.database_fingerprint', databaseId);
  noteNullable(unknowns, 'PROD', 'states.PROD.d1.ledger', ledger);
  noteNullable(unknowns, 'PROD', 'states.PROD.d1.physical_schema', physicalSchema);

  const leadRadar = exactObject(prod.lead_radar, 'PROD.lead_radar', ['old_sync_route', 'flags']);
  const oldSync = leadRadar.old_sync_route;
  if (oldSync !== null && oldSync !== 'paused' && oldSync !== 'present' && oldSync !== 'unknown') {
    throw new ReleaseManifestInputError('PROD.lead_radar.old_sync_route', 'invalid_enum');
  }
  if (oldSync === null) {
    addUnknown(unknowns, 'PROD', 'states.PROD.lead_radar.old_sync_route', 'missing_snapshot');
  } else if (oldSync === 'unknown') {
    addUnknown(unknowns, 'PROD', 'states.PROD.lead_radar.old_sync_route', 'explicit_unknown');
  }
  let flags: Record<string, boolean | 'unknown'> | null = null;
  if (leadRadar.flags !== null) {
    const rawFlags = objectAt(leadRadar.flags, 'PROD.lead_radar.flags');
    if (Object.keys(rawFlags).length > 256) {
      throw new ReleaseManifestInputError('PROD.lead_radar.flags', 'too_many_items');
    }
    flags = {};
    for (const name of Object.keys(rawFlags).sort(compareText)) {
      if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(name)) {
        throw new ReleaseManifestInputError('PROD.lead_radar.flags', 'invalid_flag_name');
      }
      const flag = rawFlags[name];
      if (flag !== true && flag !== false && flag !== 'unknown') {
        throw new ReleaseManifestInputError(`PROD.lead_radar.flags.${name}`, 'invalid_flag_value');
      }
      flags[name] = flag;
      if (flag === 'unknown') {
        addUnknown(unknowns, 'PROD', `states.PROD.lead_radar.flags.${name}`, 'explicit_unknown');
      }
    }
    for (const requiredFlag of REQUIRED_LEAD_RADAR_FLAGS) {
      if (!(requiredFlag in flags)) {
        addUnknown(unknowns, 'PROD', `states.PROD.lead_radar.flags.${requiredFlag}`, 'missing_snapshot');
      }
    }
  } else {
    addUnknown(unknowns, 'PROD', 'states.PROD.lead_radar.flags', 'missing_snapshot');
  }
  const prodPii = parsePiiLocations(prod.pii_locations, 'PROD.pii_locations');
  noteNullable(unknowns, 'PROD', 'states.PROD.pii_locations', prodPii);
  prodPii?.forEach((location, index) => {
    if (location.plane === 'unknown') {
      addUnknown(unknowns, 'PROD', `states.PROD.pii_locations[${index}].plane`, 'explicit_unknown');
    }
    noteNullable(
      unknowns,
      'PROD',
      `states.PROD.pii_locations[${index}].retention_policy`,
      location.retention_policy,
    );
    noteNullable(
      unknowns,
      'PROD',
      `states.PROD.pii_locations[${index}].control_owner`,
      location.control_owner,
    );
  });

  const head = exactObject(root.HEAD, 'HEAD', ['revision', 'file_snapshots', 'pii_locations']);
  const headRevision = parseRevision(head.revision, 'HEAD.revision');
  const headFiles = parseFileSnapshots(head.file_snapshots, 'HEAD.file_snapshots');
  const headPii = parsePiiLocations(head.pii_locations, 'HEAD.pii_locations');
  noteNullable(unknowns, 'HEAD', 'states.HEAD.repo.revision', headRevision);
  noteNullable(unknowns, 'HEAD', 'states.HEAD.repo.files', headFiles);
  noteNullable(unknowns, 'HEAD', 'states.HEAD.pii_locations', headPii);

  const wip = exactObject(root.WIP, 'WIP', [
    'base_revision',
    'dirty_paths',
    'untracked_paths',
    'file_snapshots',
    'pii_locations',
  ]);
  const wipRevision = parseRevision(wip.base_revision, 'WIP.base_revision');
  const dirtyPaths = sortedUniqueStrings(wip.dirty_paths, 'WIP.dirty_paths', normalizedRepoPath);
  const untrackedPaths = sortedUniqueStrings(
    wip.untracked_paths,
    'WIP.untracked_paths',
    normalizedRepoPath,
  );
  const wipFiles = parseFileSnapshots(wip.file_snapshots, 'WIP.file_snapshots');
  const wipPii = parsePiiLocations(wip.pii_locations, 'WIP.pii_locations');
  noteNullable(unknowns, 'WIP', 'states.WIP.repo.base_revision', wipRevision);
  noteNullable(unknowns, 'WIP', 'states.WIP.repo.dirty_paths', dirtyPaths);
  noteNullable(unknowns, 'WIP', 'states.WIP.repo.untracked_paths', untrackedPaths);
  noteNullable(unknowns, 'WIP', 'states.WIP.repo.files', wipFiles);
  noteNullable(unknowns, 'WIP', 'states.WIP.pii_locations', wipPii);

  unknowns.sort((left, right) => compareText(
    `${left.state}\u0000${left.field}\u0000${left.reason}`,
    `${right.state}\u0000${right.field}\u0000${right.reason}`,
  ));

  return {
    capturedAt,
    states: {
      PROD: {
        pages: {
          artifact: pagesArtifact,
          routes,
          rollback_artifact: pagesRollback,
        },
        worker: {
          artifact: workerArtifact,
          rollback_artifact: workerRollback,
          bindings,
          consumers,
          crons,
        },
        d1: {
          database_fingerprint: databaseId === null ? null : `sha256:${sha256Lf(databaseId)}`,
          ledger,
          physical_schema: physicalSchema,
        },
        lead_radar: {
          old_sync_route: oldSync,
          flags,
        },
        pii_locations: prodPii,
      },
      HEAD: {
        repo: {
          revision: headRevision?.toLowerCase() ?? null,
          files: headFiles,
          migration_hashes: migrationHashes(headFiles),
        },
        pii_locations: headPii,
      },
      WIP: {
        repo: {
          base_revision: wipRevision?.toLowerCase() ?? null,
          dirty_paths: dirtyPaths,
          untracked_paths: untrackedPaths,
          files: wipFiles,
          migration_hashes: migrationHashes(wipFiles),
        },
        pii_locations: wipPii,
      },
    },
    unknowns,
  };
}

export function captureReleaseManifest(value: unknown): LeadRadarReleaseManifestV1 {
  const parsed = parseInput(value);
  const sourceSnapshot = {
    captured_at: parsed.capturedAt,
    states: parsed.states,
  } as unknown as JsonValue;
  return {
    manifest_version: RELEASE_MANIFEST_VERSION,
    captured_at: parsed.capturedAt,
    status: parsed.unknowns.length === 0 ? 'ready' : 'blocked',
    source_snapshot_sha256: sha256CanonicalJson(sourceSnapshot),
    capture_io: CAPTURE_IO_CONTRACT,
    states: parsed.states,
    unknowns: parsed.unknowns,
  };
}

export function serializeReleaseManifest(manifest: LeadRadarReleaseManifestV1): string {
  return `${stableJson(manifest as unknown as JsonValue, true)}\n`;
}

function isPathWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function writeManifestFile(
  requestedPath: string,
  serialized: string,
  repositoryRoot = REPOSITORY_ROOT,
): string {
  const root = path.resolve(repositoryRoot);
  const reportsRoot = path.join(root, 'reports');
  const allowedRoot = path.join(root, 'reports', 'lead-radar');
  const target = path.resolve(root, requestedPath);
  if (
    path.extname(target).toLowerCase() !== '.json'
    || path.dirname(target) !== allowedRoot
    || !isPathWithin(allowedRoot, target)
  ) {
    throw new ReleaseManifestInputError('--output', 'must_be_new_json_under_reports_lead_radar');
  }

  for (const directory of [reportsRoot, allowedRoot]) {
    if (fs.existsSync(directory)) {
      const stat = fs.lstatSync(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new ReleaseManifestInputError('--output', 'symlink_or_non_directory_forbidden');
      }
    } else {
      fs.mkdirSync(directory);
    }
  }
  const rootReal = fs.realpathSync(root);
  const allowedReal = fs.realpathSync(allowedRoot);
  const parentReal = fs.realpathSync(path.dirname(target));
  if (!isPathWithin(rootReal, allowedReal) || !isPathWithin(allowedReal, parentReal)) {
    throw new ReleaseManifestInputError('--output', 'symlink_escape_forbidden');
  }
  const realTarget = path.join(parentReal, path.basename(target));
  fs.writeFileSync(realTarget, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return realTarget;
}

function parseCliArguments(argv: string[]): {
  input: string;
  output: string | null;
  release: boolean;
} {
  let input: string | null = null;
  let output: string | null = null;
  let release = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--release') {
      if (release) throw new ReleaseManifestInputError('--release', 'duplicate_argument');
      release = true;
      continue;
    }
    if (argument === '--input' || argument === '--output') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        throw new ReleaseManifestInputError(argument, 'missing_value');
      }
      if (argument === '--input') {
        if (input !== null) throw new ReleaseManifestInputError('--input', 'duplicate_argument');
        input = next;
      } else {
        if (output !== null) throw new ReleaseManifestInputError('--output', 'duplicate_argument');
        output = next;
      }
      index += 1;
      continue;
    }
    throw new ReleaseManifestInputError('arguments', 'unknown_argument');
  }
  if (input === null) throw new ReleaseManifestInputError('--input', 'required');
  return { input, output, release };
}

export function runCli(argv: string[]): number {
  const arguments_ = parseCliArguments(argv);
  const inputPath = path.resolve(process.cwd(), arguments_.input);
  const stat = fs.statSync(inputPath);
  if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) {
    throw new ReleaseManifestInputError('--input', 'expected_bounded_json_file');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as unknown;
  } catch {
    throw new ReleaseManifestInputError('--input', 'invalid_json');
  }
  const manifest = captureReleaseManifest(raw);
  const serialized = serializeReleaseManifest(manifest);
  if (arguments_.output !== null) {
    writeManifestFile(arguments_.output, serialized);
  }
  process.stdout.write(serialized);
  return arguments_.release && manifest.status !== 'ready' ? 1 : 0;
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (direct) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    const code = error instanceof ReleaseManifestInputError ? error.code : 'capture_failed';
    process.stderr.write(`LEAD_RADAR_RELEASE_MANIFEST_ERROR=${code}\n`);
    process.exitCode = 2;
  }
}
