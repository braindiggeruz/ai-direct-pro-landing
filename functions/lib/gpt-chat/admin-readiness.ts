// The «Готовность» block of the admin section «AI-чат» (plan WP-19): what
// runs, in which mode, and what a live sale still lacks. Read from the
// environment only, never D1, so it answers even when D1 does not.
//
// Names and switches only. Every list of missing settings comes from
// liveReadiness() and its helpers, which return setting NAMES; a secret is
// reported as present or absent, never by its value or a hint of it. The
// terms URLs, the terms version and the model ids are public configuration.
import {
  liveReadiness,
  paymentProviders,
  PROVIDERS,
  providerConfigured,
  providerMode,
  providersInMode,
  termsUrl,
  termsVersion,
  uzumFlow,
  type BillingEnv,
} from "./billing-config";
import { resolveConfig } from "./config";
import { fiscalIssues } from "./fiscal-config";
import { activeSalt, resolveHashSalt } from "./hash";
import { webChatChain } from "./model-provider";
import { resolveOwnerNotify } from "./notify";
import { retentionDays } from "./retention-store";
import type { AiChatReadiness } from "../../../src/shared/ai-chat-admin";

/** GPT_IDENTITY_SECRET signs accounts and rehearsal cookies from this length on. */
const MIN_SECRET_LENGTH = 32;

/** The names of the three switches Z.ai still lacks (decision L10); empty = it answers first. */
function zaiMissing(env: BillingEnv, cfg: ReturnType<typeof resolveConfig>): string[] {
  return [
    ...(cfg.modelProvider === "zai" ? [] : ["GPT_MODEL_PROVIDER"]),
    ...(cfg.zaiEvalApproved ? [] : ["GPT_ZAI_EVAL_APPROVED"]),
    ...(env.ZAI_API_KEY ? [] : ["ZAI_API_KEY"]),
  ];
}

export function aiChatReadiness(env: BillingEnv, now = Date.now()): AiChatReadiness {
  const listed = paymentProviders(env);
  const salt = resolveHashSalt(env);
  const cfg = resolveConfig(env);
  const notify = resolveOwnerNotify(env);
  const identitySecret = (env.GPT_IDENTITY_SECRET?.length ?? 0) >= MIN_SECRET_LENGTH;
  const testProviders = providersInMode(env, "test");
  const approvedAt = env.GPT_BILLING_TERMS_APPROVED_AT || "";
  return {
    // Payme is off unless listed (decision L17): it is shown only then.
    providers: PROVIDERS.filter((provider) => provider !== "payme" || listed.includes(provider)).map(
      (provider) => {
        const mode = providerMode(env, provider);
        return {
          provider,
          listed: listed.includes(provider),
          mode,
          configured: mode ? providerConfigured(env, provider, mode) : false,
          flow: provider === "uzum" ? uzumFlow(env) : null,
          liveMissing: liveReadiness(env, provider, now),
        };
      },
    ),
    terms: {
      version: termsVersion(env),
      ru: termsUrl(env.GPT_BILLING_TERMS_RU),
      uz: termsUrl(env.GPT_BILLING_TERMS_UZ),
      approvedAt: /^\d{4}-\d{2}-\d{2}$/.test(approvedAt) ? approvedAt : null,
    },
    fiscalMissing: fiscalIssues(env, { tin: true }),
    salt: {
      set: !!salt.hashSalt,
      since: salt.hashSaltSince === null ? null : new Date(salt.hashSaltSince).toISOString(),
      active: activeSalt(salt, now) !== null,
    },
    identitySecret,
    alerts: { enabled: env.GPT_ALERTS_ENABLED !== "false", channel: notify.source },
    retentionDays: retentionDays(env),
    models: {
      provider: cfg.modelProvider,
      zaiMissing: zaiMissing(env, cfg),
      freeChain: webChatChain(cfg, env, "free"),
      paidChain: webChatChain(cfg, env, "paid"),
      freeTierPaidPrimary: cfg.freeTierPaidPrimary,
      freePaidDailyUsd: cfg.freePaidDailyUsd,
    },
    rehearsal: { testProviders, available: testProviders.length > 0 && identitySecret },
  };
}
