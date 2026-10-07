// Studio transactions share the authenticated Payme endpoint with chat.
// Settlement deliberately does not read the Studio sales/runtime switches.
import type { BillingEnv, BillingMode } from "../gpt-chat/billing-config";
import { fiscalParams } from "../gpt-chat/fiscal-config";
import { paymeCheck, paymeState } from "../gpt-chat/payment-protocol";
import { planOfVersion, STUDIO_ORDER_TTL_MS } from "./plans";
import { ensureStudioPaidSchema, StudioStore, StudioStoreError } from "./store";
import { ensureStudioPaymeOwnership, isPaymeOwnershipConflict } from "./payme-ownership";

type Reply = { ok(result: unknown): Response; error(id: number | null, code: number, data?: string | null): Response; id: number | null };
const txId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 128;

export async function studioPaymeStore(db: D1Database): Promise<StudioStore> {
  await ensureStudioPaidSchema(db);
  await ensureStudioPaymeOwnership(db);
  return new StudioStore(db);
}

export async function studioPaymeStart(db: D1Database, env: BillingEnv, mode: BillingMode, method: string, orderId: string, p: Record<string, unknown>, reply: Reply): Promise<Response> {
  const { ok, error, id } = reply;
  const store = await studioPaymeStore(db);
  const now = Date.now();
  let row = await store.byId(orderId);
  if (!row || row.provider !== "payme" || row.mode !== mode) return error(id, -31050, "order_id");
  if (!Number.isSafeInteger(p.amount) || p.amount !== row.amount || row.currency !== "UZS") return error(id, -31001);
  if (method === "CheckPerformTransaction") {
    if (!["pending", "prepared"].includes(row.state) || row.expires_at <= now) return error(id, -31050, "order_id");
    const plan = planOfVersion(row.plan_version, row.plan);
    const fiscal = fiscalParams(env);
    if (!plan || !fiscal || plan.amountTiyin !== row.amount) return error(id, -32400);
    return ok({ allow: true, detail: { receipt_type: 0, items: [{ title: plan.receiptName, price: row.amount, count: 1, code: fiscal.ikpu, package_code: fiscal.packageCode, vat_percent: fiscal.vatPercent }] } });
  }
  if (!txId(p.id) || !Number.isSafeInteger(p.time) || (p.time as number) <= 0 || (p.time as number) > now + 60_000) return error(id, -32600);
  const time = p.time as number;
  const existing = await store.byExternal("payme", mode, p.id);
  if (existing) {
    if (existing.id !== row.id || existing.provider_time !== time || existing.state !== "prepared") return error(id, -31008);
    if (now - time >= STUDIO_ORDER_TTL_MS) {
      await store.cancel(existing.id, { method: "timeout", reason: 4, from: ["prepared"], now });
      return error(id, -31008);
    }
    return ok({ create_time: existing.create_time, transaction: existing.id, state: 1 });
  }
  if (row.external_id) return error(id, -31008);
  if (row.state !== "pending" || row.expires_at <= now) return error(id, -31050, "order_id");
  if (now - time >= STUDIO_ORDER_TTL_MS) return error(id, -31008);
  try {
    row = await store.prepare(row.id, { externalId: p.id, providerTime: time, method, now });
    if (row.state !== "prepared" || row.external_id !== p.id) return error(id, -31008);
    return ok({ create_time: row.create_time, transaction: row.id, state: 1 });
  } catch (e) {
    if (isPaymeOwnershipConflict(e)) return error(id, -31008);
    if (e instanceof StudioStoreError && ["conflict", "state", "external_taken"].includes(e.code)) return error(id, -31008);
    throw e;
  }
}

export async function studioPaymeTransaction(db: D1Database, mode: BillingMode, method: string, p: Record<string, unknown>, reply: Reply): Promise<Response> {
  const { ok, error, id } = reply;
  const store = await studioPaymeStore(db);
  if (!txId(p.id)) return error(id, -32600);
  let row = await store.byExternal("payme", mode, p.id);
  if (!row) return error(id, -31003);
  const now = Date.now();
  if (row.state === "prepared" && now - Number(row.provider_time) >= STUDIO_ORDER_TTL_MS)
    row = await store.cancel(row.id, { method: "timeout", reason: 4, from: ["prepared"], now });
  if (method === "CheckTransaction") return ok(paymeCheck(row));
  if (method === "CancelTransaction") {
    if (!Number.isSafeInteger(p.reason) || ![1, 2, 3, 4, 5, 10].includes(p.reason as number)) return error(id, -32600);
    if (row.state === "paid") row = (await store.refundFull(row.id, { method: "payme_cancel", reference: p.id, reason: p.reason as number, now })).order;
    else if (row.state !== "refunded") row = await store.cancel(row.id, { method, reason: p.reason as number, now });
    return ok({ transaction: row.id, cancel_time: row.cancel_time, state: paymeState(row) });
  }
  if (row.state !== "prepared" && row.state !== "paid") return error(id, -31008);
  row = (await store.markPaid(row.id, { method, now })).order;
  return ok({ transaction: row.id, perform_time: row.perform_time, state: 2 });
}
