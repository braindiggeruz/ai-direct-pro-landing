/** Reproduce the optional crawler schema fingerprint without touching any database. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizeSchemaSql } from '../../functions/platform/lead-radar/schema-sql';
const db = new DatabaseSync(':memory:');
try {
  db.exec('CREATE TABLE organizations(id TEXT PRIMARY KEY); CREATE TABLE lead_radar_companies(org_id TEXT,id TEXT,UNIQUE(org_id,id));');
  db.exec(readFileSync(new URL('../../migrations/0056_lead_radar_crawler.sql', import.meta.url), 'utf8'));
  const rows = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name LIKE 'lead_radar_crawler_%' ORDER BY name").all();
  console.log(createHash('sha256').update(JSON.stringify(rows.map(r => [r.type, r.name, r.tbl_name,
    typeof r.sql === 'string' ? normalizeSchemaSql(r.sql) : null]))).digest('hex'));
} finally { db.close(); }
