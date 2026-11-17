// Saved AI readings and the free slots of the natal chart pages
// (migrations/0086_natal_readings.sql; this DDL is the runtime bootstrap).
// Every query carries org_id (AGENTS.md §3). A reading is kept under the
// browser's trial identity and the chart's fingerprint, so reopening shows
// the same text (roadmap T10); birth data is never stored, only the reading.

export const NATAL_DDL = [
  `CREATE TABLE IF NOT EXISTS natal_readings (
    org_id TEXT NOT NULL, id TEXT NOT NULL, identity_key TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('natal','pair')), fingerprint TEXT NOT NULL,
    locale TEXT NOT NULL CHECK(locale IN ('uz','ru')), sections TEXT NOT NULL, model TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (org_id, id),
    UNIQUE (org_id, identity_key, fingerprint, locale)
  )`,
  `CREATE TABLE IF NOT EXISTS natal_free (
    org_id TEXT NOT NULL, identity_key TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('natal','pair')),
    fingerprint TEXT NOT NULL, edits INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (org_id, identity_key, kind)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_natal_readings_created ON natal_readings (org_id, created_at)`,
];

export interface FreeSlot { fingerprint: string; edits: number; createdAt: number }

/** What a request may do with the free slot of its kind. */
export type SlotDecision = 'claim' | 'same' | 'edit' | 'paid';

/** Corrections of a free reading that keep it free (roadmap §5): three, within a day of the first. */
export const FREE_EDITS = 3;
export const FREE_EDIT_WINDOW_MS = 24 * 3_600_000;

export function decideSlot(slot: FreeSlot | null, fingerprint: string, now: number): SlotDecision {
  if (!slot) return 'claim';
  if (slot.fingerprint === fingerprint) return 'same';
  if (slot.edits < FREE_EDITS && now - slot.createdAt < FREE_EDIT_WINDOW_MS) return 'edit';
  return 'paid';
}

export class NatalStore {
  constructor(readonly db: D1Database, readonly org: string) {}

  async ensure(): Promise<void> {
    await this.db.batch(NATAL_DDL.map((sql) => this.db.prepare(sql)));
  }

  async reading(identity: string, fingerprint: string, locale: string): Promise<{ sections: string; model: string | null } | null> {
    return this.db
      .prepare('SELECT sections, model FROM natal_readings WHERE org_id=? AND identity_key=? AND fingerprint=? AND locale=?')
      .bind(this.org, identity, fingerprint, locale)
      .first<{ sections: string; model: string | null }>();
  }

  async slot(identity: string, kind: string): Promise<FreeSlot | null> {
    const row = await this.db
      .prepare('SELECT fingerprint, edits, created_at AS createdAt FROM natal_free WHERE org_id=? AND identity_key=? AND kind=?')
      .bind(this.org, identity, kind)
      .first<FreeSlot>();
    return row ?? null;
  }

  /** The reading and, for a free one, its slot, in one batch. */
  async save(input: {
    id: string; identity: string; kind: string; fingerprint: string; locale: string; sections: string; model: string | null; now: number; decision: SlotDecision;
  }): Promise<void> {
    const statements = [
      this.db
        .prepare('INSERT OR IGNORE INTO natal_readings (org_id, id, identity_key, kind, fingerprint, locale, sections, model, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(this.org, input.id, input.identity, input.kind, input.fingerprint, input.locale, input.sections, input.model, input.now),
    ];
    if (input.decision === 'claim') {
      statements.push(this.db
        .prepare('INSERT OR IGNORE INTO natal_free (org_id, identity_key, kind, fingerprint, edits, created_at, updated_at) VALUES (?,?,?,?,0,?,?)')
        .bind(this.org, input.identity, input.kind, input.fingerprint, input.now, input.now));
    } else if (input.decision === 'edit') {
      statements.push(this.db
        .prepare('UPDATE natal_free SET fingerprint=?, edits=edits+1, updated_at=? WHERE org_id=? AND identity_key=? AND kind=? AND edits<?')
        .bind(input.fingerprint, input.now, this.org, input.identity, input.kind, FREE_EDITS));
    }
    await this.db.batch(statements);
  }
}
