// Studio tariffs, deck shapes, step limits and the absolute worst case they
// allow (functions/lib/studio/plans.ts, pricing.ts; spec §2.2, §2.5).
// Run: node --import tsx --test tests/studio-plans.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DECK_SHAPES,
  REFUND_WINDOW_MS,
  STEP_LIMITS,
  STUDIO_FREE_DAILY,
  STUDIO_ORDER_TTL_MS,
  STUDIO_PLANS,
  STUDIO_PROVIDERS,
  TERMS_PLAN,
  deckParts,
  entitlementEndsAt,
  maxJobModelCalls,
  planFor,
  planOfVersion,
  planVatTiyin,
  refundValueTiyin,
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
import { maxSteps, proofSteps } from "../functions/lib/studio/jobs";
import { includedVat } from "../functions/lib/gpt-chat/fiscal-config";

const V1 = STUDIO_PLANS["studio-2026-11-v1"];
const DECKS = STUDIO_PLANS["studio-2026-10-decks-v1"];
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

test("two quota versions: with photos (studio-2026-11-v1) and presentations only (studio-2026-10-decks-v1, DECISIONS §13 п. 2)", () => {
  assert.deepEqual(Object.keys(STUDIO_PLANS).sort(), ["studio-2026-10-decks-v1", "studio-2026-11-v1"]);
  assert.deepEqual(
    { kunlik: [DECKS.kunlik.presentationFull, DECKS.kunlik.photoTask], oylik: [DECKS.oylik.presentationFull, DECKS.oylik.photoTask] },
    { kunlik: [1, 0], oylik: [10, 0] },
  );
  // The same prices, terms, regenerations and receipt lines; only the photos go.
  for (const id of ["kunlik", "oylik"] as const) {
    const { photoTask: _photos, ...withoutPhotos } = DECKS[id];
    const { photoTask: _v1Photos, ...v1WithoutPhotos } = V1[id];
    assert.equal(_photos, 0);
    assert.ok(_v1Photos > 0);
    assert.deepEqual(withoutPhotos, v1WithoutPhotos, id);
  }
  assert.equal(planOfVersion("studio-2026-10-decks-v1", "oylik"), DECKS.oylik);
});

test("an order waits 12 hours for its payment; a refund may be asked for 14 days after it", () => {
  assert.equal(STUDIO_ORDER_TTL_MS, 12 * 3_600_000);
  assert.equal(REFUND_WINDOW_MS, 14 * 86_400_000);
  assert.deepEqual([...STUDIO_PROVIDERS], ["payme", "click"]);
});

test("refund value of unused units (DECISIONS §4 п. 2): 80/20 with photos, the whole price over presentations without", () => {
  // With photos: Kunlik presentation 4 720, photo 236 so‘m; Oylik 3 192 and 199,50 so‘m.
  assert.equal(refundValueTiyin("studio-2026-11-v1", "kunlik", 1, 0), 472_000);
  assert.equal(refundValueTiyin("studio-2026-11-v1", "kunlik", 0, 1), 23_600);
  assert.equal(refundValueTiyin("studio-2026-11-v1", "oylik", 1, 0), 319_200);
  assert.equal(refundValueTiyin("studio-2026-11-v1", "oylik", 0, 1), 19_950);
  // Nothing used: the whole price.
  assert.equal(refundValueTiyin("studio-2026-11-v1", "kunlik", 1, 5), 590_000);
  assert.equal(refundValueTiyin("studio-2026-11-v1", "oylik", 10, 40), 3_990_000);
  // Mixed: 7 presentations and 13 photos of Oylik = 22 344 + 2 593,50 so‘m.
  assert.equal(refundValueTiyin("studio-2026-11-v1", "oylik", 7, 13), 7 * 319_200 + 13 * 19_950);
  // Presentations only: Kunlik 5 900 for its one, Oylik 3 990 each.
  assert.equal(refundValueTiyin("studio-2026-10-decks-v1", "kunlik", 1, 0), 590_000);
  assert.equal(refundValueTiyin("studio-2026-10-decks-v1", "oylik", 1, 0), 399_000);
  assert.equal(refundValueTiyin("studio-2026-10-decks-v1", "oylik", 4, 0), 1_596_000);
  // Photos of an edition without photos are worth nothing.
  assert.equal(refundValueTiyin("studio-2026-10-decks-v1", "oylik", 0, 3), 0);
  // Never more than the price: units returned for a defect count as unused (§4 п. 6).
  assert.equal(refundValueTiyin("studio-2026-11-v1", "kunlik", 3, 9), 590_000);
  assert.equal(refundValueTiyin("studio-2026-10-decks-v1", "oylik", 12, 0), 3_990_000);
  // Nothing unused, nonsense counts or an unknown tariff: 0.
  assert.equal(refundValueTiyin("studio-2026-11-v1", "oylik", 0, 0), 0);
  assert.equal(refundValueTiyin("studio-2026-11-v1", "oylik", -2, -1), 0);
  assert.equal(refundValueTiyin("studio-2026-11-v1", "oylik", Number.NaN, 1.5), 19_950);
  assert.equal(refundValueTiyin("studio-2099-01-v9", "oylik", 1, 1), 0);
  assert.equal(refundValueTiyin("studio-2026-11-v1", "credit", 1, 1), 0);
  // Always whole tiyin, rounded down.
  for (const [version, plan] of [["studio-2026-11-v1", "kunlik"], ["studio-2026-11-v1", "oylik"], ["studio-2026-10-decks-v1", "oylik"]] as const)
    for (let p = 0; p <= 10; p++)
      for (let f = 0; f <= 40; f += 7) assert.ok(Number.isSafeInteger(refundValueTiyin(version, plan, p, f)), `${version} ${plan} ${p} ${f}`);
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

test("only an offer edition in TERMS_PLAN sells: v5 maps to the approved decks-only launch, the chat's v2 sells nothing", () => {
  assert.deepEqual(TERMS_PLAN, { "ai-paket-2026-10-v5": "studio-2026-10-decks-v1" });
  for (const version of Object.values(TERMS_PLAN)) assert.ok(version in STUDIO_PLANS, version);
  assert.equal(planFor("ai-paket-2026-10-v5", "oylik"), DECKS.oylik);
  assert.equal(planFor("ai-paket-2026-10-v5", "kunlik"), DECKS.kunlik);
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
  // The proofreading pass of a paid Uzbek deck: one more call a part; never for the free deck.
  assert.equal(maxJobModelCalls("full", 15, true), 14 + 4);
  assert.equal(maxJobModelCalls("full", 12, true), 12 + 3);
  assert.equal(maxJobModelCalls("free", 6, true), 4);
  // Parts carry bits 1..4 of the ledger's parts_done.
  assert.ok(deckParts(DECK_SHAPES.full.maxSlides) <= 4);
});

test("the job's step cap in jobs.ts is the one the worst case is priced with (maxSteps, + proofSteps for the pass)", () => {
  for (let slides = DECK_SHAPES.full.minSlides; slides <= DECK_SHAPES.full.maxSlides; slides++) {
    // The ledger's parts_total counts the outline's bit too.
    const job = { shape: "full" as const, partsTotal: deckParts(slides) + 1 };
    assert.equal(maxSteps(job), maxJobModelCalls("full", slides), `${slides}`);
    assert.equal(maxSteps(job) + proofSteps(job), maxJobModelCalls("full", slides, true), `${slides}`);
  }
  assert.equal(proofSteps({ shape: "free", partsTotal: 1 }), 0);
  assert.equal(proofSteps({ shape: "photo", partsTotal: 1 }), 0);
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
  // The proofreading pass (MEASURE-30 §6; DECISIONS §16): as long as a part, ONE call, never more room
  // (a cut, invalid or refused answer leaves the part as written); in: the part's text and PROOF_SYSTEM.
  assert.equal(STEP_LIMITS.proof.maxTokens, STEP_LIMITS.part.maxTokens);
  assert.equal(STEP_LIMITS.proof.attempts, 1);
  assert.equal(STEP_LIMITS.proof.lengthRetryMaxTokens, STEP_LIMITS.proof.maxTokens);
  assert.ok(STEP_LIMITS.proof.inputTokens >= STEP_LIMITS.part.lengthRetryMaxTokens + 150);
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
  const check = Math.max(...IMAGE_CHECK_MODELS.map(imageCheckMicro));
  assert.ok(worstFullDeckMicro() > 12 * FLUX_MICRO_PER_IMAGE + 12 * check);
  assert.equal(check, imageCheckMicro("@cf/google/gemma-4-26b-a4b-it"));
  // A quota edition that doubles Oylik's units is refused by the same rule.
  assert.ok(worstPlanCase({ ...V1.oylik, presentationFull: 20, photoTask: 80 }).share > COST_STOP_SHARE);
});

test("a paid deck is priced with its proofreading pass at the job's step cap, not at the pass's usual 4 calls (DECISIONS §16)", () => {
  // Every call at its ceiling with the dearest text model. The outline and the parts may make at most
  // maxJobModelCalls(full) calls; with the pass, all steps together at most maxJobModelCalls(full, …, true),
  // so a proofreading call may also take a step the outline and the parts left unused (two requests for
  // the same part at once both proofread it). The bound is the dearest mix under both caps.
  const glm = MODEL_PRICES["zai/glm-5.3-flash"];
  const call = (step: { readonly inputTokens: number }, output: number) => tokenCostMicro(glm, { input: step.inputTokens, output });
  const slides = DECK_SHAPES.full.maxSlides;
  const parts = deckParts(slides);
  const { outline, part, proof } = STEP_LIMITS;
  const shared = [
    call(outline, outline.maxTokens),
    ...Array<number>(outline.attempts - 1).fill(call(outline, outline.lengthRetryMaxTokens)),
    ...Array<number>(parts).fill(call(part, part.maxTokens)),
    ...Array<number>(parts * (part.attempts - 1) + 4).fill(call(part, part.lengthRetryMaxTokens)),
  ].sort((a, b) => b - a);
  assert.equal(shared.length, maxJobModelCalls("full", slides));
  const cap = maxJobModelCalls("full", slides, true);
  const proofCall = Math.max(call(proof, proof.maxTokens), call(proof, proof.lengthRetryMaxTokens));
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  let worst = 0;
  for (let n = 0; n <= shared.length; n++)
    for (let k = 0; k <= cap - n; k++) worst = Math.max(worst, sum(shared.slice(0, n)) + k * proofCall);
  // Without the pass the text is the outline and the parts at their cap; the pass adds the rest.
  assert.equal(worstFullDeckMicro(true) - worstFullDeckMicro(false), worst - sum(shared));
  // At least the usual pass (one call a part on top of everything else), and more: the cap allows it.
  assert.ok(worst - sum(shared) > parts * call(proof, proof.maxTokens));
  assert.equal(worstFullDeckMicro(), worstFullDeckMicro(true));
  // The free deck is never proofread.
  assert.ok(worstFreeDeckMicro() < worstFullDeckMicro(false));
});

test("with the pass, Oylik's worst term still stays under the stop share in both quota versions", (context) => {
  const withPhotos = worstPlanCase(V1.oylik);
  const decksOnly = worstPlanCase(DECKS.oylik);
  context.diagnostic(`Oylik worst term: with photos ${(withPhotos.share * 100).toFixed(1)}%, decks only ${(decksOnly.share * 100).toFixed(1)}%`);
  assert.ok(withPhotos.share < COST_STOP_SHARE);
  assert.ok(decksOnly.share < withPhotos.share);
  // Without the photos' 80 paid and 64 free photo runs the decks-only edition has room to spare.
  assert.ok(decksOnly.share < 0.4);
});
