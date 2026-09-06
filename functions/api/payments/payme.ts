import {
  BILLING_ORG,
  billingMode,
  providerKey,
  PAYMENT_TTL_MS,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import { BillingStore } from "../../lib/gpt-chat/billing-store";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { ensureSchema } from "../../lib/gpt-chat/schema";
import { json, readJsonLimited } from "../../lib/gpt-chat/http";
import {
  paymeCheck,
  paymeState,
  sameSecret,
} from "../../lib/gpt-chat/payment-protocol";
import {
  maintainBilling,
  recordServiceAlert,
} from "../../lib/gpt-chat/billing-maintenance-store";

export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  const mode = billingMode(env);
  const key = mode ? providerKey(env, "payme", mode) : "";
  const error = (id: unknown, code: number, data: string | null = null) =>
    json({
      id,
      error: {
        code,
        message: {
          ru: "Платёж не подтверждён. Проверьте статус или обратитесь в поддержку.",
          uz: "To‘lov tasdiqlanmadi. Holatini tekshiring yoki yordam xizmatiga murojaat qiling.",
          en: "Payment not confirmed. Check status or contact support.",
        },
        data,
      },
    });
  // Authentication precedes schema bootstrap and every database read.
  if (
    !key ||
    !sameSecret(
      request.headers.get("authorization") || "",
      `Basic ${btoa(`Paycom:${key}`)}`,
    )
  )
    return error(null, -32504);
  const body = await readJsonLimited<{
    id?: unknown;
    method?: unknown;
    params?: Record<string, unknown>;
  }>(request, 16_384);
  if (!body.ok) return error(null, -32700);
  const rpc = body.value;
  if (
    !rpc ||
    typeof rpc.method !== "string" ||
    !rpc.params ||
    typeof rpc.params !== "object" ||
    Array.isArray(rpc.params) ||
    !Number.isSafeInteger(rpc.id)
  )
    return error(null, -32600);
  const { id, method, params: p } = rpc;
  const ok = (result: unknown) => json({ id, result });
  if (!env.GPTBOT_DRAFTS_DB || !mode) return error(id, -32400);
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureSchema(db);
    await ensureBillingSchema(db);
    const store = new BillingStore(db, BILLING_ORG);
    const now = Date.now();
    if (method === "SetFiscalData") {
      const data = p.fiscal_data as
        { status_code?: unknown; qr_code_url?: unknown } | undefined;
      if (
        typeof p.id !== "string" ||
        !["PERFORM", "CANCEL"].includes(String(p.type)) ||
        !Number.isSafeInteger(data?.status_code)
      )
        return error(id, -32602);
      const row = await store.external("payme", mode, p.id);
      if (!row) return error(id, -32001);
      let receiptUrl: string | null = null;
      if (data?.status_code === 0) {
        try {
          const u = new URL(String(data.qr_code_url));
          if (
            u.protocol !== "https:" ||
            u.username ||
            u.password ||
            u.href.length > 2048
          )
            throw new Error();
          receiptUrl = u.href;
        } catch {
          return error(id, -32602);
        }
      }
      await store.fiscal(
        row.id,
        p.type as "PERFORM" | "CANCEL",
        Number(data?.status_code),
        receiptUrl,
      );
      if (data?.status_code !== 0)
        waitUntil(
          recordServiceAlert(env, "fiscalization_failed")
            .then(() => maintainBilling(env))
            .catch(() => console.warn("gpt_billing_delivery_failed")),
        );
      return ok({ success: true });
    }
    if (method === "GetStatement") {
      if (
        !Number.isSafeInteger(p.from) ||
        !Number.isSafeInteger(p.to) ||
        Number(p.from) < 0 ||
        Number(p.to) < Number(p.from)
      )
        return error(id, -32600);
      const rows = await store.statement(
        "payme",
        mode,
        Number(p.from),
        Number(p.to),
      );
      return ok({
        transactions: rows.map((r) => ({
          id: r.external_id,
          time: r.provider_time,
          amount: r.amount,
          account: { order_id: r.id },
          ...paymeCheck(r),
        })),
      });
    }
    if (
      method === "CheckPerformTransaction" ||
      method === "CreateTransaction"
    ) {
      const account = p.account as { order_id?: unknown } | undefined;
      if (typeof account?.order_id !== "string")
        return error(id, -31050, "order_id");
      let row = await store.order(account.order_id);
      if (!row || row.provider !== "payme" || row.mode !== mode)
        return error(id, -31050, "order_id");
      if (
        !Number.isSafeInteger(p.amount) ||
        p.amount !== row.amount ||
        row.currency !== "UZS"
      )
        return error(id, -31001);
      if (method === "CheckPerformTransaction") {
        if (
          !["pending", "prepared"].includes(row.state) ||
          row.expires_at <= now
        )
          return error(id, -31050, "order_id");
        return ok({ allow: true });
      }
      if (
        typeof p.id !== "string" ||
        !p.id ||
        p.id.length > 128 ||
        !Number.isSafeInteger(p.time) ||
        Number(p.time) > now + 60_000
      )
        return error(id, -32600);
      const existing = await store.external("payme", mode, p.id);
      if (
        existing &&
        (existing.id !== row.id || existing.provider_time !== p.time)
      )
        return error(id, -31008);
      if (row.external_id && row.external_id !== p.id) return error(id, -31008);
      if (existing && existing.state === "paid") return error(id, -31008);
      if (now - Number(p.time) >= PAYMENT_TTL_MS || row.expires_at <= now) {
        if (row.state === "prepared")
          await store.transition(row.id, "cancelled", "timeout", { reason: 4 });
        return error(id, -31008);
      }
      if (row.state === "pending")
        row = await store.transition(row.id, "prepared", method, {
          externalId: p.id,
          providerTime: Number(p.time),
        });
      if (row.state !== "prepared") return error(id, -31008);
      return ok({
        create_time: row.create_time,
        transaction: row.id,
        state: 1,
      });
    }
    if (
      !["PerformTransaction", "CancelTransaction", "CheckTransaction"].includes(
        method,
      )
    )
      return error(id, -32601, method);
    if (typeof p.id !== "string") return error(id, -32600);
    let row = await store.external("payme", mode, p.id);
    if (!row) return error(id, -31003);
    if (
      row.state === "prepared" &&
      now - Number(row.provider_time) >= PAYMENT_TTL_MS
    )
      row = await store.transition(row.id, "cancelled", "timeout", {
        reason: 4,
      });
    if (method === "CheckTransaction") return ok(paymeCheck(row));
    if (method === "CancelTransaction") {
      if (
        !Number.isInteger(p.reason) ||
        ![1, 2, 3, 4, 5, 10].includes(Number(p.reason))
      )
        return error(id, -32600);
      row = await store.transition(row.id, "cancelled", method, {
        reason: Number(p.reason),
      });
      waitUntil(
        maintainBilling(env).catch(() =>
          console.warn("gpt_billing_delivery_failed"),
        ),
      );
      return ok({
        transaction: row.id,
        cancel_time: row.cancel_time,
        state: paymeState(row),
      });
    }
    if (!["prepared", "paid"].includes(row.state)) return error(id, -31008);
    row = await store.transition(row.id, "paid", method);
    waitUntil(
      maintainBilling(env).catch(() =>
        console.warn("gpt_billing_delivery_failed"),
      ),
    );
    return ok({
      transaction: row.id,
      perform_time: row.perform_time,
      state: 2,
    });
  } catch (e) {
    waitUntil(
      recordServiceAlert(env, "payme_processing")
        .then(() => maintainBilling(env))
        .catch(() => console.warn("gpt_billing_delivery_failed")),
    );
    return error(
      id,
      e instanceof Error && ["conflict", "state"].includes(e.message)
        ? -31008
        : -32400,
    );
  }
};
export const onRequest: PagesFunction<BillingEnv> = async () =>
  json({ id: null, error: { code: -32300, message: "Use POST", data: null } });
