import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
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
import { mintRehearsal, REHEARSAL_COOKIE } from "../../functions/lib/gpt-chat/rehearsal";
import { onRequestPost as payme } from "../../functions/api/payments/payme";
import { onRequestPost as click } from "../../functions/api/payments/click";

/**
 * The settings every live checkout needs besides the provider's own
 * (billing-config.ts liveReadiness), with random secrets. The fiscal codes
 * are the public ones committed in wrangler.toml.
 */
export function liveSettings(): Partial<BillingEnv> {
  return {
    GPT_BILLING_LIVE_READY: "true",
    GPT_BILLING_TERMS_APPROVED_AT: "2026-09-30",
    GPT_FISCAL_IKPU: "10305008002000000",
    GPT_FISCAL_PACKAGE_CODE: "1514296",
    GPT_FISCAL_VAT_PERCENT: "12",
    GPT_FISCAL_TIN: "310618348",
    GPT_NOTIFY_BOT_TOKEN: randomBytes(32).toString("hex"),
    GPT_NOTIFY_CHAT_ID: "123456789",
    GPT_HASH_SALT: randomBytes(32).toString("hex"),
    GPT_HASH_SALT_SINCE: "2026-09-01T00:00:00Z",
    GPT_BILLING_MAINTENANCE_SECRET: randomBytes(32).toString("hex"),
  };
}

// Runtime-only random protocol fixtures, never real merchant credentials.
export async function billingFixture() {
  const db = new SqliteD1();
  const binding = db.asD1();
  await ensureSchema(binding);
  await ensureBillingSchema(binding);
  // Production from release R1 on: migrations/0065 (the Uzum table and the
  // cross-provider view the account panel and the outbox read) is applied as
  // `d1 migrations apply` does, not by the Uzum routes' runtime bootstrap.
  db.exec(
    readFileSync(
      new URL("../../migrations/0065_gpt_uzum_payments.sql", import.meta.url),
      "utf8",
    ),
  );
  const secret = () => randomBytes(32).toString("hex");
  const numeric = () => String(randomBytes(4).readUInt32BE(0));
  const env = {
    GPTBOT_DRAFTS_DB: binding,
    // Payme is off unless listed (decision L17); these tests exercise it.
    GPT_PAYMENT_PROVIDERS: "click,uzum,payme",
    GPT_BILLING_MODE: "test",
    GPT_BILLING_TERMS_VERSION: 'fixture-v1',
    GPT_BILLING_TERMS_RU: 'https://gptbot.uz/ru/terms/',
    GPT_BILLING_TERMS_UZ: 'https://gptbot.uz/uz/terms/',
    GPT_PAYME_TEST_KEY: secret(),
    GPT_CLICK_TEST_SECRET: secret(),
    GPT_CLICK_TEST_SERVICE_ID: numeric(),
    // A cash desk id has Payme's format: 24 hex.
    GPT_PAYME_MERCHANT_ID: randomBytes(12).toString("hex"),
    GPT_IDENTITY_SECRET: secret(),
    GPT_TELEGRAM_CLIENT_ID: numeric(),
    GPT_TELEGRAM_CLIENT_SECRET: secret(),
  } as BillingEnv;
  const store = new BillingStore(binding, BILLING_ORG);
  const identity = new IdentityStore(binding, BILLING_ORG);
  const token = await identity.login(secret());
  const cookie = `__Host-gpt_account=${token}`;
  // A rehearsal session (rehearsal.ts): the only context offered test providers.
  const rehearsal = `${REHEARSAL_COOKIE}=${(await mintRehearsal(env))!.token}`;
  const testCookie = `${cookie}; ${rehearsal}`;
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
    rehearsal,
    testCookie,
    ctx,
    rpc,
    clickCall,
    background,
  };
}
