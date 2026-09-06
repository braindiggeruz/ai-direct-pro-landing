import { BILLING_ORG } from "./billing-config";
// Durable cooldowns are shared between isolates. KV's eventual consistency is
// suitable for a catalogue cache, not admission, money or this cooldown gate.
export async function availableModels(
  db: D1Database | undefined,
  chain: string[],
  now = Date.now(),
): Promise<string[]> {
  const unique = [...new Set(chain)].slice(0, 3);
  if (!db) return unique;
  const rows = await db
    .prepare(
      "SELECT model FROM gpt_model_health WHERE org_id=? AND blocked_until>?",
    )
    .bind(BILLING_ORG, now)
    .all<{ model: string }>();
  const blocked = new Set((rows.results || []).map((r) => r.model));
  return unique.filter((model) => !blocked.has(model) && !blocked.has("*"));
}
export async function modelFailed(
  db: D1Database | undefined,
  model: string,
  code: string,
  now = Date.now(),
) {
  if (!db) return;
  const until =
    now +
    (code === "model_unavailable"
      ? 3600_000
      : code === "rate_limit"
        ? 60_000
        : 30_000);
  try {
    await db
      .prepare(
        `INSERT INTO gpt_model_health(org_id,model,blocked_until,code) VALUES(?,?,?,?)
      ON CONFLICT(org_id,model) DO UPDATE SET blocked_until=MAX(blocked_until,excluded.blocked_until),code=excluded.code`,
      )
      .bind(BILLING_ORG, model, until, code)
      .run();
  } catch {
    console.warn("gpt_model_health_unavailable");
  }
}
