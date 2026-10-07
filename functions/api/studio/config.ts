// GET /api/studio/config — what the studio island may offer (spec §6).
//
// Open while STUDIO_API or STUDIO_PAID_SERVICE is on, on gptbot.uz only (or a
// local host under STUDIO_LOCAL_DEV); anywhere else, or with both off, 404
// before anything else is read. It reads no D1, no cookie and no secret: the
// answer is the same for every visitor, built from STUDIO_RUNTIME_CONFIG_JSON
// and plans.ts alone. The island asks for it on the first focus or submit of
// the form, never on page load.
//
// Prices appear only while payments are on, and only those of the offer
// edition in force (TERMS_PLAN): an edition with no quota version sells
// nothing, so `plans` is empty and checkout answers 503.
//
// `payments.providers` names the providers that sell now
// (lib/studio/checkout.ts readyProviders: STUDIO_PAYMENT_PROVIDERS, the
// cash desk's mode and the presence of its keys, never a value); an empty
// list with a mode means «To‘lov vaqtincha to‘xtatilgan».
import type { BillingEnv } from "../../lib/gpt-chat/billing-config";
import { publicPlans, readyProviders } from "../../lib/studio/checkout";
import { studioGate, studioRequestConfig, type StudioConfig } from "../../lib/studio/config";
import { FREE_RESETS_AT } from "../../lib/studio/free-usage";
import { fail, json } from "../../lib/studio/http";
import { DECK_SHAPES, STUDIO_FREE_DAILY } from "../../lib/studio/plans";

/** The tariffs of the edition in force, only while payments are on (checkout.ts publicPlans). */
function plansOf(config: StudioConfig) {
  return config.payments === "off" ? [] : publicPlans(config.terms.version);
}

/** The public answer of /config for these settings. */
function publicConfig(config: StudioConfig, env: BillingEnv) {
  return {
    ok: true,
    tools: {
      freeDeck: config.api && config.freeDeck,
      fullDeck: config.paidService && config.fullDeck,
      photo: config.photo && (config.api || config.paidService),
    },
    payments: { mode: config.payments === "off" ? null : config.payments, providers: readyProviders(env, config) },
    plans: plansOf(config),
    free: {
      presentation: STUDIO_FREE_DAILY.presentation_free,
      photo: STUDIO_FREE_DAILY.photo_task,
      resetsAt: FREE_RESETS_AT,
    },
    shapes: {
      free: DECK_SHAPES.free,
      full: {
        minSlides: DECK_SHAPES.full.minSlides,
        maxSlides: config.maxSlides,
        images: DECK_SHAPES.full.images,
        notes: DECK_SHAPES.full.notes,
        palettes: DECK_SHAPES.full.palettes,
      },
    },
    turnstileSiteKey: config.turnstileSiteKey || null,
    termsVersion: config.terms.version || null,
    terms: { ru: config.terms.ru || null, uz: config.terms.uz || null },
    aiLabel: config.aiLabel,
  };
}

export const onRequest: PagesFunction<BillingEnv> = async ({ request, env }) => {
  const closed = studioGate(request, env, "config");
  if (closed) return closed;
  if (request.method !== "GET" && request.method !== "HEAD") return fail("method_not_allowed", {}, { Allow: "GET" });
  return json(publicConfig(studioRequestConfig(request, env), env));
};
