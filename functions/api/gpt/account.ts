import {
  BILLING_ORG,
  billingMode,
  identityReady,
  providerReady,
  PAID_MESSAGES,
  termsUrl,
  termsVersion,
  type BillingEnv,
} from "../../lib/gpt-chat/billing-config";
import { BillingStore } from "../../lib/gpt-chat/billing-store";
import { ensureBillingSchema } from "../../lib/gpt-chat/billing-schema";
import { IdentityStore, sameOrigin, cookieValue } from "../../lib/gpt-chat/identity-store";
import { sha256Hex } from "../../lib/gpt-chat/hash";
import { json, fail, readJsonLimited } from "../../lib/gpt-chat/http";
import { TurnStore } from "../../lib/gpt-chat/turn-store";
import { resolveConfig } from "../../lib/gpt-chat/config";
import { maintainBilling } from "../../lib/gpt-chat/billing-maintenance-store";
export const onRequestGet: PagesFunction<BillingEnv> = async ({
  request,
  env,
}) => {
  const mode = billingMode(env);
  const base = {
    ok: true,
    loginAvailable: identityReady(env),
    mode,
    priceUzs: 20000,
    messageLimit: PAID_MESSAGES,
    termsVersion: termsVersion(env),
    providers: (["click", "payme"] as const).filter((p) =>
      providerReady(env, p),
    ),
    terms: {
      ru: termsUrl(env.GPT_BILLING_TERMS_RU),
      uz: termsUrl(env.GPT_BILLING_TERMS_UZ),
    },
  };
  if (!env.GPTBOT_DRAFTS_DB)
    return json({ ...base, loginAvailable: false, user: null });
  // Anonymous readiness checks need no schema bootstrap or account DB queries.
  if (!/^[a-f0-9]{64}$/.test(cookieValue(request, "__Host-gpt_account")))
    return json({ ...base, user: null });
  try {
    const db = env.GPTBOT_DRAFTS_DB;
    await ensureBillingSchema(db);
    const user = await new IdentityStore(db, BILLING_ORG).user(request);
    if (!user) return json({ ...base, user: null });
    const store = new BillingStore(db, BILLING_ORG);
    const access = await store.access(user, mode || "live");
    const latest = await store.latest(user, mode || "live");
    const scheduled = await store.nextAccess(user, mode || "live");
    const receipts = await store.receipts(user, mode || "live");
    const refundable = await store.refundable(user, mode || "live");
    const remaining = await new TurnStore(db, BILLING_ORG).remaining(
      user,
      access,
      resolveConfig(env),
    );
    return json({
      ...base,
      user: { signedIn: true, storageKey: await sha256Hex(`local-history:${BILLING_ORG}:${user}`) },
      remaining,
      scheduled,
      receipts,
      refundable,
      access: access
        ? {
            ...access,
            remaining,
            renewSoon: access.ends_at - Date.now() < 3 * 86400_000,
          }
        : null,
      payment: latest
        ? {
            id: latest.id,
            state:
              ["pending", "prepared"].includes(latest.state) &&
              latest.expires_at < Date.now()
                ? "cancelled"
                : latest.state,
            provider: latest.provider,
            createdAt: latest.created_at,
          }
        : null,
    });
  } catch {
    return fail("account_unavailable", "Try later", 503);
  }
};
export const onRequestPost: PagesFunction<BillingEnv> = async ({
  request,
  env,
  waitUntil,
}) => {
  if (!sameOrigin(request) || !env.GPTBOT_DRAFTS_DB)
    return fail("forbidden", "Forbidden", 403);
  const body = await readJsonLimited<{ action?: string; orderId?: string }>(
    request,
    2048,
  );
  if (
    !body.ok ||
    body.value?.action !== "refund_request" ||
    typeof body.value.orderId !== "string"
  )
    return fail("bad_request", "Invalid request");
  try {
    await ensureBillingSchema(env.GPTBOT_DRAFTS_DB);
    const user = await new IdentityStore(
      env.GPTBOT_DRAFTS_DB,
      BILLING_ORG,
    ).user(request);
    if (!user) return fail("login_required", "Login required", 401);
    const accepted = await new BillingStore(
      env.GPTBOT_DRAFTS_DB,
      BILLING_ORG,
    ).requestRefund(user, body.value.orderId);
    if (accepted)
      waitUntil(
        maintainBilling(env).catch(() =>
          console.warn("gpt_billing_delivery_failed"),
        ),
      );
    return accepted ? json({ ok: true }) : fail("not_found", "Not found", 404);
  } catch {
    return fail("account_unavailable", "Try later", 503);
  }
};
