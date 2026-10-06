// Studio tariffs, deck shapes, step limits and the absolute worst case they
// allow (functions/lib/studio/plans.ts, pricing.ts; spec §2.2, §2.5).
// Run: node --import tsx --test tests/studio-plans.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DECK_SHAPES,
  STEP_LIMITS,
  STUDIO_FREE_DAILY,
  STUDIO_PLANS,
  TERMS_PLAN,
  deckParts,
  entitlementEndsAt,
  maxJobModelCalls,
  planFor,
  planOfVersion,
  planVatTiyin,
  type StudioPlan,
} from "../functions/lib/studio/plans";
import {
  COST_STOP_SHARE,
  FLUX_MICRO_PER_IMAGE,
  IMAGE_CHECK_PRICES,
  MODEL_PRICES,
  freeDaysInTerm,
  imageCheckMicro,
  microToUzs,
  modelPrice,
  netTiyin,
  tokenCostMicro,
  worstFreeDeckMicro,
  worstFullDeckMicro,
  worstPhotoMicro,
  worstPlanCase,
} from "../functions/lib/studio/pricing";
import { FREE_TEXT_FALLBACKS, IMAGE_CHECK_MODELS, TEXT_MODELS, VISION_MODELS } from "../functions/lib/studio/config";
import { includedVat } from "../functions/lib/gpt-chat/fiscal-config";

const V1 = STUDIO_PLANS["studio-2026-11-v1"];
const ALL_PLANS: Array<[string, string, StudioPlan]> = Object.entries(STUDIO_PLANS).flatMap(([version, plans]) =>
  Object.entries(plans).map(([id, plan]) => [version, id, plan] as [string, string, StudioPlan]));

test("prices are whole tiyin: Kunlik 5 900 and Oylik 39 900 so‘m", () => {
  assert.equal(V1.kunlik.amountTiyin, 5_900 * 100);
  assert.equal(V1.oylik.amountTiyin, 39_900 * 100);
  for (const [version, id, plan] of ALL_PLANS) {
    assert.ok(Number.isSafeInteger(plan.amountTiyin) && plan.amountTiyin > 0, `${version}.${id}`);
    // studio_orders CHECK(amount > 0 AND amount <= 100000000).
    assert.ok(plan.amountTiyin <= 100_000_000, `${version}.${id}`);
    assert.equal(plan.amountTiyin % 100, 0, `${version}.${id}: whole so‘m`);
  }
});

test("quotas of studio-2026-11-v1 are the roadmap's", () => {
  assert.deepEqual(
    { presentationFull: V1.kunlik.presentationFull, photoTask: V1.kunlik.photoTask, regen: V1.kunlik.regenPerUnit },
    { presentationFull: 1, photoTask: 5, regen: 1 },
  );
  assert.deepEqual(
    { presentationFull: V1.oylik.presentationFull, photoTask: V1.oylik.photoTask, regen: V1.oylik.regenPerUnit },
    { presentationFull: 10, photoTask: 40, regen: 1 },
  );
  assert.deepEqual(STUDIO_FREE_DAILY, { presentation_free: 1, photo_task: 2 });
});

test("VAT 12% inside the price: 63 214 and 427 500 tiyin", () => {
  assert.equal(planVatTiyin(V1.kunlik), 63_214);
  assert.equal(planVatTiyin(V1.oylik), 427_500);
  for (const [, , plan] of ALL_PLANS) assert.equal(planVatTiyin(plan), includedVat(plan.amountTiyin, 12));
});

test("receipt lines fit Click/OFD (≤ 63 characters), name the service and never the chat's brand words", () => {
  assert.equal(V1.kunlik.receiptName, "Studio Kunlik (xizmat, 24 soat)");
  assert.equal(V1.oylik.receiptName, "Studio Oylik (xizmat, 1 oy)");
  assert.equal(V1.kunlik.itemId, "studio_kunlik");
  assert.equal(V1.oylik.itemId, "studio_oylik");
  for (const [version, id, plan] of ALL_PLANS) {
    assert.ok([...plan.receiptName].length <= 63, `${version}.${id}`);
    // Not the chat's «AI paket …» line, and no forbidden tariff words (spec §1.3 item 11).
    assert.match(plan.receiptName, /^Studio /);
    assert.doesNotMatch(
      `${plan.receiptName} ${plan.itemId}`,
      /chatgpt|\bgpt\b|openai|cheksiz|безлимит|rasmiy|hammasi|to.liq|ai paket/i,
      `${version}.${id}`,
    );
  }
});

test("Kunlik lasts 24 hours from Complete; Oylik one calendar month (31.01 → 28.02, 29.02 in a leap year)", () => {
  const complete = Date.UTC(2026, 10, 10, 9, 30);
  assert.equal(entitlementEndsAt(V1.kunlik, complete) - complete, 24 * 3_600_000);
  assert.equal(entitlementEndsAt(V1.oylik, complete), Date.UTC(2026, 11, 10, 9, 30));
  assert.equal(entitlementEndsAt(V1.oylik, Date.UTC(2027, 0, 31, 18)), Date.UTC(2027, 1, 28, 18));
  assert.equal(entitlementEndsAt(V1.oylik, Date.UTC(2028, 0, 31, 18)), Date.UTC(2028, 1, 29, 18));
  assert.equal(entitlementEndsAt(V1.oylik, Date.UTC(2026, 11, 31, 23, 59)), Date.UTC(2027, 0, 31, 23, 59));
});

test("only an offer edition in TERMS_PLAN sells: v3 maps to studio-2026-11-v1, the chat's v2 sells nothing", () => {
  assert.deepEqual(TERMS_PLAN, { "ai-paket-2026-10-v3": "studio-2026-11-v1" });
  for (const version of Object.values(TERMS_PLAN)) assert.ok(version in STUDIO_PLANS, version);
  assert.equal(planFor("ai-paket-2026-10-v3", "oylik"), V1.oylik);
  assert.equal(planFor("ai-paket-2026-10-v3", "kunlik"), V1.kunlik);
  // checkout answers 503 checkout_unavailable for these.
  assert.equal(planFor("ai-paket-2026-10-v2", "oylik"), null);
  assert.equal(planFor("", "oylik"), null);
  assert.equal(planFor("toString", "oylik"), null);
  assert.equal(planFor("ai-paket-2026-10-v3", "credit"), null);
  assert.equal(planFor("ai-paket-2026-10-v3", "constructor"), null);
  // A stored quota version keeps its own quotas.
  assert.equal(planOfVersion("studio-2026-11-v1", "kunlik"), V1.kunlik);
  assert.equal(planOfVersion("studio-2099-01-v9", "kunlik"), null);
});

test("deck shapes: free 4–6 slides, 2 pictures, no notes, 1 palette; full 6–15, 8 pictures, notes, 3 palettes", () => {
  assert.deepEqual(DECK_SHAPES.free, { minSlides: 4, maxSlides: 6, images: 2, imageRetries: 2, notes: false, palettes: 1 });
  assert.deepEqual(DECK_SHAPES.full, { minSlides: 6, maxSlides: 15, images: 8, imageRetries: 4, notes: true, palettes: 3 });
  assert.equal(deckParts(15), 4);
  assert.equal(deckParts(12), 3);
  assert.equal(deckParts(6), 2);
  // steps ≤ 2 + 2·P + 4 (spec §7.1); the free deck: its call and one spare.
  assert.equal(maxJobModelCalls("full", 15), 14);
  assert.equal(maxJobModelCalls("full", 12), 12);
  assert.equal(maxJobModelCalls("free", 6), 4);
  // Parts carry bits 1..4 of the ledger's parts_done.
  assert.ok(deckParts(DECK_SHAPES.full.maxSlides) <= 4);
});

test("step limits cover what the 30-topic measurement saw, with room for a 1.5× length retry", () => {
  // MEASURE-30 §3: output max 881 (outline), 843 (part), 709 (free); input max 961, 1 478, 955.
  const seen = { outline: { out: 881, in: 961 }, part: { out: 843, in: 1478 }, free: { out: 709, in: 955 } } as const;
  for (const step of ["outline", "part", "free"] as const) {
    const limit = STEP_LIMITS[step];
    assert.ok(limit.maxTokens >= seen[step].out * 1.4, step);
    assert.equal(limit.lengthRetryMaxTokens, limit.maxTokens * 1.5, step);
    assert.ok(limit.inputTokens > seen[step].in, step);
    assert.equal(limit.attempts, 2, step);
  }
  assert.deepEqual(STEP_LIMITS.photo, { maxTokens: 1500, attempts: 2, lengthRetries: 1, lengthRetryMaxTokens: 2500, inputTokens: 3200 });
  assert.equal(STEP_LIMITS.promptGuard.attempts, 1);
  assert.equal(STEP_LIMITS.imageCheck.attempts, 1);
});

test("every model a setting may choose has a shadow price; photos and paid text never use a ':free' model", () => {
  for (const model of [...TEXT_MODELS, ...FREE_TEXT_FALLBACKS, ...VISION_MODELS]) assert.ok(modelPrice(model), model);
  for (const model of IMAGE_CHECK_MODELS) assert.ok(IMAGE_CHECK_PRICES[model], model);
  for (const model of [...TEXT_MODELS, ...VISION_MODELS]) assert.doesNotMatch(model, /:free$/);
  for (const model of FREE_TEXT_FALLBACKS) assert.match(model, /^openrouter:.+:free$/);
  assert.equal(modelPrice("zai/glm-4.7"), null);
  assert.equal(modelPrice("constructor"), null);
  assert.deepEqual(MODEL_PRICES["zai/glm-5.3-flash"], { input: 0.15, cachedInput: 0.03, output: 0.5 });
});

test("shadow cost of one call in micro-USD, rounded up; cached input at the cached price", () => {
  const glm = MODEL_PRICES["zai/glm-5.3-flash"];
  // 1M in + 1M out = $0.65.
  assert.equal(tokenCostMicro(glm, { input: 1_000_000, output: 1_000_000 }), 650_000);
  assert.equal(tokenCostMicro(glm, { input: 1_000_000, cachedInput: 1_000_000, output: 0 }), 30_000);
  // A measured outline: 846 in, 666 out = 459.9 micro-USD, rounded up.
  assert.equal(tokenCostMicro(glm, { input: 846, output: 666 }), 460);
  assert.equal(tokenCostMicro(glm, { input: 1, output: 0 }), 1);
  assert.equal(tokenCostMicro(glm, { input: 0, output: 0 }), 0);
  // More cached than input counts as all input cached; never negative.
  assert.equal(tokenCostMicro(glm, { input: 10, cachedInput: 50, output: 0 }), 1);
  assert.equal(tokenCostMicro(MODEL_PRICES["zai/glm-4.6v-flash"], { input: 5000, output: 5000 }), 0);
  // Flux 1024² at 4 steps ≈ 7.5 so‘m; the Gemma picture check ≈ 0.65 so‘m.
  assert.equal(FLUX_MICRO_PER_IMAGE, 634);
  assert.equal(Math.round(microToUzs(FLUX_MICRO_PER_IMAGE) * 10) / 10, 7.5);
  assert.equal(imageCheckMicro("@cf/google/gemma-4-26b-a4b-it"), 55);
  assert.throws(() => imageCheckMicro("@cf/unknown"), /no shadow price/);
});

test("net after VAT and Click 2.5%: 5 120.36 and 34 627.50 so‘m", () => {
  assert.equal(netTiyin(V1.kunlik.amountTiyin), 512_036);
  assert.equal(netTiyin(V1.oylik.amountTiyin), 3_462_750);
  assert.equal(freeDaysInTerm(V1.kunlik), 2);
  assert.equal(freeDaysInTerm(V1.oylik), 32);
});

test("the absolute worst case of every tariff stays under half of its net (spec §2.5)", (context) => {
  context.diagnostic(
    `worst unit, so‘m: full deck ${microToUzs(worstFullDeckMicro()).toFixed(1)}, free deck ${microToUzs(worstFreeDeckMicro()).toFixed(1)}, photo ${microToUzs(worstPhotoMicro()).toFixed(1)}`,
  );
  for (const [version, id, plan] of ALL_PLANS) {
    const worst = worstPlanCase(plan);
    context.diagnostic(`${version}.${id}: ${worst.uzs.toFixed(0)} of ${worst.netUzs} so‘m net = ${(worst.share * 100).toFixed(1)}%`);
    assert.ok(worst.share <= COST_STOP_SHARE, `${version}.${id}: ${(worst.share * 100).toFixed(1)}% of net`);
  }
  assert.equal(COST_STOP_SHARE, 0.5);
});

test("the worst case has teeth: it moves with every limit, and doubled quotas would fail it", () => {
  const oylik = worstPlanCase(V1.oylik);
  // Each component counts: a unit more of anything raises the bound.
  assert.ok(worstPlanCase({ ...V1.oylik, presentationFull: 11 }).micro > oylik.micro);
  assert.ok(worstPlanCase({ ...V1.oylik, photoTask: 41 }).micro > oylik.micro);
  assert.ok(worstPlanCase({ ...V1.oylik, regenPerUnit: 2 }).micro > oylik.micro);
  // The full deck bound includes the 4 spare part calls, the prompt check and 8 + 4 pictures.
  assert.ok(worstFullDeckMicro() > 12 * FLUX_MICRO_PER_IMAGE + 12 * imageCheckMicro("zai/glm-5.3-flash"));
  // A quota edition that doubles Oylik's units is refused by the same rule.
  assert.ok(worstPlanCase({ ...V1.oylik, presentationFull: 20, photoTask: 80 }).share > COST_STOP_SHARE);
});
