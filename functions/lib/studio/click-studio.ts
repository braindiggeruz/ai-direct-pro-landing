import type { BillingEnv, BillingMode } from "../gpt-chat/billing-config";
import { providerMode } from "../gpt-chat/billing-config";
import { fail, json, readTextLimited } from "../gpt-chat/http";
import { clickSignature, parseClickAmount, sameSecret } from "../gpt-chat/payment-protocol";
import { fiscalizeDue } from "../gpt-chat/fiscal-store";
import { studioClickCredentials } from "./checkout";
import { ensureStudioPaidSchema, StudioStore, StudioStoreError } from "./store";
import { parseStudioConfig } from "./config";
import { ensureStudioClickOwnership, isClickOwnershipConflict } from "./click-ownership";

// The chosen Click service settles existing orders even with new sales off.
// Chat credentials are accepted only by the explicit shared-service mode.
export async function handleStudioClick(request: Request, env: BillingEnv, waitUntil: (task: Promise<unknown>) => void): Promise<Response> {
  const shared = parseStudioConfig(env.STUDIO_RUNTIME_CONFIG_JSON).clickUseChatService;
  const choices = (["live", "test"] as const).flatMap(mode => {
    if (shared && providerMode(env, "click") !== mode) return [];
    const credentials = studioClickCredentials(env, mode);
    return credentials ? [{ mode, credentials }] : [];
  });
  if (!choices.length) return fail("not_found", "Not found", 404);
  const error = (code: number) => json({ error: code, error_note: ({ [-1]: "SIGN CHECK FAILED!", [-2]: "Incorrect parameter amount", [-3]: "Action not found", [-4]: "Already paid", [-5]: "User does not exist", [-6]: "Transaction does not exist", [-7]: "Failed to update user", [-8]: "Error in request from click", [-9]: "Transaction cancelled" } as Record<number, string>)[code] });
  if (!request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) return error(-8);
  const raw = await readTextLimited(request, 8192);
  if (!raw.ok) return error(-8);
  const form = new URLSearchParams(raw.value);
  const p = Object.fromEntries(form);
  if ([...form.keys()].some(k => form.getAll(k).length !== 1)) return error(-8);
  if (p.action !== "0" && p.action !== "1") return error(-3);
  const required = ["click_trans_id", "click_paydoc_id", "service_id", "merchant_trans_id", "amount", "sign_time", "sign_string", "error", ...(p.action === "1" ? ["merchant_prepare_id"] : [])];
  if (required.some(k => !p[k]) || !/^\d+$/.test(p.click_trans_id) || !/^\d+$/.test(p.click_paydoc_id) || !Number.isSafeInteger(Number(p.click_trans_id)) || !/^-?\d+$/.test(p.error)) return error(-8);
  const matching = choices.filter(c => c.credentials.serviceId === p.service_id && sameSecret(p.sign_string.toLowerCase(), clickSignature(p, c.credentials.secretKey)));
  if (matching.length !== 1) return error(-1);
  const mode: BillingMode = matching[0].mode;
  if (!env.GPTBOT_DRAFTS_DB) return error(-7);
  try {
    await ensureStudioPaidSchema(env.GPTBOT_DRAFTS_DB);
    if (shared) await ensureStudioClickOwnership(env.GPTBOT_DRAFTS_DB);
    const store = new StudioStore(env.GPTBOT_DRAFTS_DB);
    let row = await store.byId(p.merchant_trans_id);
    if (!row || row.provider !== "click" || row.mode !== mode || row.service_id !== p.service_id) return error(-5);
    if (parseClickAmount(p.amount) !== row.amount || row.currency !== "UZS") return error(-2);
    if (row.external_id && row.external_id !== p.click_trans_id) return error(-4);
    const existing = await store.byExternal("click", mode, p.click_trans_id);
    if (existing && existing.id !== row.id) return error(-8);
    if (p.action === "1" && (String(row.seq) !== p.merchant_prepare_id || !row.external_id)) return error(-6);
    if (row.state === "paid") return error(-4);
    if (["cancelled", "refunded"].includes(row.state)) return error(-9);
    if (Number(p.error) < 0) {
      await store.cancel(row.id, { method: p.action === "0" ? "Prepare" : "Complete", reason: Number(p.error) });
      return error(-9);
    }
    if (Number(p.error) !== 0) return error(-8);
    if (p.action === "0") {
      if (row.expires_at <= Date.now()) return error(-5);
      row = await store.prepare(row.id, { externalId: p.click_trans_id, docId: p.click_paydoc_id, providerTime: Date.now(), method: "Prepare" });
    } else {
      row = (await store.markPaid(row.id, { method: "Complete" })).order;
      waitUntil(fiscalizeDue(env).catch(() => console.warn("studio_click_fiscal_failed")));
    }
    return json({ click_trans_id: Number(p.click_trans_id), merchant_trans_id: row.id, [p.action === "0" ? "merchant_prepare_id" : "merchant_confirm_id"]: row.seq, error: 0, error_note: "Success" });
  } catch (e) {
    if (isClickOwnershipConflict(e)) return error(-8);
    if (e instanceof StudioStoreError && e.code === "conflict") return error(-4);
    return error(-7);
  }
}
