import type { AeoRun, AeoReview } from "../../../src/shared/aeo";

interface Row {
  id: string;
  kind: AeoRun["kind"];
  status: AeoRun["status"];
  created_at: string;
  result_json: string | null;
  request_hash: string;
}
function decode(row: Row): AeoRun {
  const stored = row.result_json ? JSON.parse(row.result_json) : null;
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    created_at: row.created_at,
    result: stored?._failure ? null : stored,
    ...(stored?._failure ? { failure: stored._failure } : {}),
  };
}
export class AeoStore {
  constructor(private readonly db: D1Database) {}
  async run(orgId: string, id: string): Promise<AeoRun | null> {
    const row = await this.db
      .prepare("SELECT * FROM aeo_runs WHERE org_id=? AND id=?")
      .bind(orgId, id)
      .first<Row>();
    return row ? decode(row) : null;
  }
  async reviews(orgId: string, runId: string): Promise<AeoReview[]> {
    const rows = await this.db
      .prepare(
        "SELECT review_json FROM aeo_reviews WHERE org_id=? AND run_id=?",
      )
      .bind(orgId, runId)
      .all<{ review_json: string }>();
    return rows.results.map((row) => JSON.parse(row.review_json) as AeoReview);
  }
  async reviewCounts(orgId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .prepare(
        "SELECT run_id, COUNT(*) AS total FROM aeo_reviews WHERE org_id=? AND json_extract(review_json,'$.status') != 'unreviewed' GROUP BY run_id",
      )
      .bind(orgId)
      .all<{ run_id: string; total: number }>();
    return Object.fromEntries(
      rows.results.map((row) => [row.run_id, row.total]),
    );
  }
  async saveReview(
    orgId: string,
    review: AeoReview,
    expected: number,
    operation: string,
    hash: string,
  ): Promise<AeoReview | null> {
    const previous = await this.db
      .prepare(
        "SELECT operation_id,request_hash,review_json FROM aeo_reviews WHERE org_id=? AND run_id=? AND finding_id=?",
      )
      .bind(orgId, review.runId, review.findingId)
      .first<{
        operation_id: string;
        request_hash: string;
        review_json: string;
      }>();
    if (previous?.operation_id === operation)
      return previous.request_hash === hash
        ? (JSON.parse(previous.review_json) as AeoReview)
        : null;
    const result = await this.db
      .prepare(
        `INSERT INTO aeo_reviews (org_id,run_id,finding_id,revision,operation_id,request_hash,review_json,updated_at)
      SELECT ?,?,?,?,?,?,?,? WHERE (?=0 OR EXISTS(SELECT 1 FROM aeo_reviews WHERE org_id=? AND run_id=? AND finding_id=?))
      AND EXISTS(SELECT 1 FROM aeo_runs WHERE org_id=? AND id=? AND status='completed')
      ON CONFLICT(org_id,run_id,finding_id) DO UPDATE SET revision=excluded.revision,operation_id=excluded.operation_id,
      request_hash=excluded.request_hash,review_json=excluded.review_json,updated_at=excluded.updated_at WHERE aeo_reviews.revision=?`,
      )
      .bind(
        orgId,
        review.runId,
        review.findingId,
        expected + 1,
        operation,
        hash,
        JSON.stringify({ ...review, revision: expected + 1 }),
        review.updatedAt,
        expected,
        orgId,
        review.runId,
        review.findingId,
        orgId,
        review.runId,
        expected,
      )
      .run();
    return result.meta.changes ? { ...review, revision: expected + 1 } : null;
  }
  async list(orgId: string): Promise<AeoRun[]> {
    const rows = await this.db
      .prepare(
        "SELECT * FROM aeo_runs WHERE org_id=? ORDER BY created_at DESC LIMIT 50",
      )
      .bind(orgId)
      .all<Row>();
    return rows.results.map(decode);
  }
  async find(
    orgId: string,
    idempotencyKey: string,
  ): Promise<(AeoRun & { requestHash: string }) | null> {
    const row = await this.db
      .prepare("SELECT * FROM aeo_runs WHERE org_id=? AND idempotency_key=?")
      .bind(orgId, idempotencyKey)
      .first<Row>();
    return row ? { ...decode(row), requestHash: row.request_hash } : null;
  }
  async used(orgId: string, kind: AeoRun["kind"]): Promise<number> {
    const row = await this.db
      .prepare(
        "SELECT COUNT(*) AS total FROM aeo_runs WHERE org_id=? AND kind=? AND created_at>=?",
      )
      .bind(orgId, kind, new Date().toISOString().slice(0, 10))
      .first<{ total: number }>();
    return row?.total || 0;
  }
  async reserve(
    orgId: string,
    id: string,
    key: string,
    requestHash: string,
    kind: AeoRun["kind"],
    limit: number,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    // One atomic SQLite statement: concurrent requests cannot overspend the daily cap.
    const result = await this.db
      .prepare(
        `INSERT OR IGNORE INTO aeo_runs
      (org_id,id,idempotency_key,request_hash,kind,status,created_at,updated_at)
      SELECT ?,?,?,?,?,'running',?,? WHERE
      (SELECT COUNT(*) FROM aeo_runs WHERE org_id=? AND kind=? AND created_at>=?) < ?`,
      )
      .bind(
        orgId,
        id,
        key,
        requestHash,
        kind,
        now,
        now,
        orgId,
        kind,
        now.slice(0, 10),
        limit,
      )
      .run();
    return (result.meta.changes || 0) === 1;
  }
  async finish(
    orgId: string,
    id: string,
    result: AeoRun["result"],
    failed = false,
    failure?: AeoRun["failure"],
  ): Promise<void> {
    await this.db
      .prepare(
        "UPDATE aeo_runs SET status=?,result_json=?,updated_at=? WHERE org_id=? AND id=? AND status='running'",
      )
      .bind(
        failed ? "failed" : "completed",
        JSON.stringify(failure ? { _failure: failure } : result),
        new Date().toISOString(),
        orgId,
        id,
      )
      .run();
  }
  async expire(orgId: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE aeo_runs SET status='failed',updated_at=? WHERE org_id=? AND status='running' AND created_at<?",
      )
      .bind(
        new Date().toISOString(),
        orgId,
        new Date(Date.now() - 5 * 60_000).toISOString(),
      )
      .run();
    await this.db
      .prepare("DELETE FROM aeo_runs WHERE org_id=? AND created_at<?")
      .bind(orgId, new Date(Date.now() - 90 * 86400_000).toISOString())
      .run();
    await this.db
      .prepare(
        "DELETE FROM aeo_reviews WHERE org_id=? AND run_id NOT IN (SELECT id FROM aeo_runs WHERE org_id=?)",
      )
      .bind(orgId, orgId)
      .run();
  }
}
