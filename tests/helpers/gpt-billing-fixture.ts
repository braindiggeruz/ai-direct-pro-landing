import { randomBytes } from "node:crypto";
import { SqliteD1 } from "./sqlite-d1";
import { ensureSchema } from "../../functions/lib/gpt-chat/schema";
import { ensureBillingSchema } from "../../functions/lib/gpt-chat/billing-schema";
import { BillingStore } from "../../functions/lib/gpt-chat/billing-store";
import { IdentityStore } from "../../functions/lib/gpt-chat/identity-store";
import {
  BILLING_ORG,
  type BillingEnv,
} from "../../functions/lib/gpt-chat/billing-config";
import { clickSignature } from "../../functions/lib/gpt-chat/payment-protocol";
import { onRequestPost as payme } from "../../functions/api/payments/payme";
import { onRequestPost as click } from "../../functions/api/payments/click";

// Runtime-only random protocol fixtures, never real merchant credentials.
export async function billingFixture() {
  const db = new SqliteD1();
  const binding = db.asD1();
  await ensureSchema(binding);
  await ensureBillingSchema(binding);
  const secret = () => randomBytes(32).toString("hex");
  const numeric = () => String(randomBytes(4).readUInt32BE(0));
  const env = {
    GPTBOT_DRAFTS_DB: binding,
    GPT_BILLING_MODE: "test",
    GPT_BILLING_TERMS_VERSION: 'fixture-v1',
    GPT_BILLING_TERMS_RU: 'https://gptbot.uz/ru/terms/',
    GPT_BILLING_TERMS_UZ: 'https://gptbot.uz/uz/terms/',
    GPT_PAYME_TEST_KEY: secret(),
    GPT_CLICK_TEST_SECRET: secret(),
    GPT_CLICK_TEST_SERVICE_ID: numeric(),
    GPT_PAYME_MERCHANT_ID: numeric(),
    GPT_IDENTITY_SECRET: secret(),
    GPT_TELEGRAM_CLIENT_ID: numeric(),
    GPT_TELEGRAM_CLIENT_SECRET: secret(),
  } as BillingEnv;
  const store = new BillingStore(binding, BILLING_ORG);
  const identity = new IdentityStore(binding, BILLING_ORG);
  const token = await identity.login(secret());
  const cookie = `__Host-gpt_account=${token}`;
  const user = (await identity.user(
    new Request("https://gpt.test", { headers: { cookie } }),
  ))!;
  const background: Promise<unknown>[] = [];
  const ctx = (request: Request) =>
    ({
      request,
      env,
      waitUntil: (task: Promise<unknown>) => background.push(task),
    }) as unknown as Parameters<typeof payme>[0];
  const rpc = async (
    method: string,
    params: Record<string, unknown>,
    key = env.GPT_PAYME_TEST_KEY,
  ) => {
    const response = await payme(
      ctx(
        new Request("https://gpt.test/api/payments/payme", {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`Paycom:${key}`)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: 1, method, params }),
        }),
      ),
    );
    return response.json();
  };
  const clickCall = async (
    order: string,
    action: "0" | "1",
    extra: Record<string, string> = {},
  ) => {
    const p = {
      click_trans_id: numeric(),
      click_paydoc_id: numeric(),
      service_id: env.GPT_CLICK_TEST_SERVICE_ID!,
      merchant_trans_id: order,
      amount: "20000.00",
      action,
      sign_time: "2026-09-05 12:00:00",
      error: "0",
      ...extra,
    };
    const body = new URLSearchParams({
      ...p,
      sign_string: clickSignature(p, env.GPT_CLICK_TEST_SECRET!),
    });
    return (
      await click(
        ctx(
          new Request("https://gpt.test/api/payments/click", {
            method: "POST",
            body,
          }),
        ),
      )
    ).json();
  };
  return {
    db,
    binding,
    env,
    store,
    identity,
    user,
    token,
    cookie,
    ctx,
    rpc,
    clickCall,
    background,
  };
}
