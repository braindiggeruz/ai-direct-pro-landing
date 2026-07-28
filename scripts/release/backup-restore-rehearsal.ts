import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { createIsolatedMigratedDatabase } from './migration-rehearsal';

export interface BackupRestoreReport {
  status: 'pass' | 'blocked';
  mode: 'isolated-local-synthetic';
  checks: Record<string, boolean>;
}

function checksum(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fingerprint(file: string): string {
  const database = new DatabaseSync(file);
  try {
    const objects = database.prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
    ).all();
    const rows = database.prepare(
      `SELECT tenant_id, label, quantity FROM release_restore_probe
       ORDER BY tenant_id, label`,
    ).all();
    const integrity = database.prepare('PRAGMA integrity_check').get();
    return createHash('sha256')
      .update(JSON.stringify({ objects, rows, integrity }))
      .digest('hex');
  } finally {
    database.close();
  }
}

export function runBackupRestoreRehearsal(): BackupRestoreReport {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gptbot-r04-restore-'));
  const source = path.join(tempRoot, 'synthetic-source.sqlite');
  const backup = path.join(tempRoot, 'synthetic-backup.sqlite');
  const checks: Record<string, boolean> = {
    synthetic_data_only: true,
    export_created: false,
    export_checksum: false,
    local_mutation_changed_integrity: false,
    restore_integrity: false,
  };
  try {
    createIsolatedMigratedDatabase(source);
    let database = new DatabaseSync(source);
    try {
      database.exec(`
        CREATE TABLE release_restore_probe (
          tenant_id TEXT NOT NULL,
          label TEXT NOT NULL,
          quantity INTEGER NOT NULL CHECK (quantity >= 0),
          PRIMARY KEY (tenant_id, label)
        );
        INSERT INTO release_restore_probe(tenant_id, label, quantity)
        VALUES
          ('synthetic-tenant-a', 'fixture-a', 2),
          ('synthetic-tenant-b', 'fixture-b', 5);
      `);
    } finally {
      database.close();
    }
    const expected = fingerprint(source);
    fs.copyFileSync(source, backup);
    checks.export_created = fs.existsSync(backup) && fs.statSync(backup).size > 0;
    checks.export_checksum = checksum(source) === checksum(backup);

    database = new DatabaseSync(source);
    try {
      database.exec(`
        DELETE FROM release_restore_probe;
        INSERT INTO release_restore_probe(tenant_id, label, quantity)
        VALUES ('synthetic-mutated', 'fixture-mutated', 99);
      `);
    } finally {
      database.close();
    }
    checks.local_mutation_changed_integrity = fingerprint(source) !== expected;

    fs.copyFileSync(backup, source);
    checks.restore_integrity = fingerprint(source) === expected;
    return {
      status: Object.values(checks).every(Boolean) ? 'pass' : 'blocked',
      mode: 'isolated-local-synthetic',
      checks,
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const direct = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (direct) {
  const report = runBackupRestoreRehearsal();
  for (const [name, ok] of Object.entries(report.checks)) {
    console.log(`${name.toUpperCase()}=${ok ? 'PASS' : 'FAIL'}`);
  }
  console.log(`BACKUP_RESTORE=${report.status.toUpperCase()}`);
  if (report.status !== 'pass') process.exitCode = 1;
}
