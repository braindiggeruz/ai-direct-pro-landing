import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { canonicalJson } from '../evals/lead-radar/canonical';
import {
  assertNoGoldenLeakage,
  assertPublicSafeSyntheticDataset,
  expandGoldenDataset,
  loadGoldenPair,
} from '../evals/lead-radar/dataset';
import {
  evaluateGoldenDataset,
  wilsonOneSided95,
} from '../evals/lead-radar/evaluator';
import {
  LEAD_RADAR_NICHES,
  LEAD_RADAR_TELEGRAM_TYPES,
  type GateResult,
  type LeadRadarCandidatePredictions,
  type LeadRadarGoldenReport,
} from '../evals/lead-radar/types';

const fixtures = resolve(process.cwd(), 'evals/lead-radar/fixtures');
const pair = loadGoldenPair(fixtures);

function gate(report: LeadRadarGoldenReport, id: string): GateResult {
  const result = report.gates.find((entry) => entry.id === id);
  assert.ok(result, `missing gate ${id}`);
  return result;
}

function reference(contactSurfaceEnabled = false): LeadRadarCandidatePredictions {
  return referenceFor(pair.holdout, contactSurfaceEnabled);
}

function referenceFor(dataset: typeof pair.holdout, contactSurfaceEnabled: boolean): LeadRadarCandidatePredictions {
  return {
    schemaVersion: 'lead-radar-candidate-predictions/v1',
    candidateId: 'test-only-reference-oracle',
    candidateVersion: '1.0.0',
    datasetVersion: dataset.manifest.datasetVersion,
    contactSurfaceEnabled,
    contactPrerequisites: {
      writtenCounselApproval: true,
      dataFlowAndResidencyApproved: true,
      personalVaultApproved: true,
      retentionDsarDncGreen: true,
      manualRoleApprovalEnforced: true,
      channelPolicyApproved: true,
    },
    companies: dataset.companies.map((entry) => ({
      caseId: entry.id,
      activeCompany: entry.truth.activeCompany,
      nicheMatch: entry.truth.nicheMatch,
      geoMatch: entry.truth.geoMatch,
      officialSite: entry.truth.officialSite,
      corporateRouteVerified: entry.truth.corporateRouteAvailable,
      retrievedWithinBoundedK: entry.truth.inPermittedCandidateUniverse,
      actionable: entry.truth.actionable,
    })),
    rankings: dataset.rankings.map((search) => ({
      searchId: search.id,
      orderedCardIds: [...search.cards]
        .sort((left, right) => Number(right.actionable) - Number(left.actionable) || left.id.localeCompare(right.id))
        .slice(0, dataset.manifest.blocks.rankings.evaluatedTopK)
        .map((entry) => entry.id),
    })),
    telegram: dataset.telegram.map((entry) => ({ caseId: entry.id, type: entry.truthType })),
    people: dataset.people.map((entry) => ({
      caseId: entry.id,
      companyAffiliation: entry.truth.companyAffiliation,
      contactBelongsToPerson: entry.truth.contactBelongsToPerson,
      currentDecisionMaker: entry.truth.currentDecisionMaker && entry.truth.manuallyApproved,
    })),
    personalCtaNegatives: dataset.personalCtaNegatives.map((entry) => ({
      caseId: entry.id,
      showPersonalCta: false,
    })),
  };
}

test('frozen datasets match the roadmap sample design and remain public-safe synthetic data', () => {
  assert.deepEqual(pair.dev.counts, {
    companies: 240,
    rankingSearches: 48,
    rankingCards: 576,
    telegramEndpoints: 120,
    personEdges: 60,
    personPredictedPositiveEligible: 40,
    personalCtaNegatives: 120,
  });
  assert.deepEqual(pair.holdout.counts, {
    companies: 960,
    rankingSearches: 240,
    rankingCards: 2880,
    telegramEndpoints: 900,
    personEdges: 419,
    personPredictedPositiveEligible: 299,
    personalCtaNegatives: 600,
  });
  assert.equal(pair.holdout.manifest.freeze.tuningAllowed, false);
  assert.equal(pair.holdout.manifest.freeze.independentlyLabelled, true);
  assert.equal(pair.holdout.manifest.freeze.containsRealPersonPii, false);
  assert.deepEqual(pair.holdout.manifest.locale.niches, [...LEAD_RADAR_NICHES]);
  assert.deepEqual(pair.holdout.manifest.locale.languages, ['ru', 'uz']);
  assert.equal(pair.holdout.manifest.locale.city, 'Tashkent');
  assertPublicSafeSyntheticDataset(pair.dev);
  assertPublicSafeSyntheticDataset(pair.holdout);

  const hardNegatives = new Set(pair.holdout.companies.map((entry) => entry.negativeKind).filter(Boolean));
  for (const required of [
    'closed_company',
    'wrong_geo',
    'adjacent_niche',
    'shared_domain',
    'branch_collision',
    'parked_domain',
    'unverified_official_site',
    'namesake_company',
  ]) assert.ok(hardNegatives.has(required as never), `missing ${required}`);
  assert.deepEqual(new Set(pair.holdout.telegram.map((entry) => entry.truthType)), new Set(LEAD_RADAR_TELEGRAM_TYPES));
  assert.ok(pair.holdout.people.some((entry) => entry.negativeAffiliation));
  assert.ok(pair.holdout.personalCtaNegatives.some((entry) => entry.reason === 'negative_affiliation'));
  assert.ok(pair.holdout.companies.some((entry) => entry.negativeKind === 'shared_domain'));
  assert.ok(pair.holdout.companies.some((entry) => entry.negativeKind === 'branch_collision'));
});

test('manifest and expanded-record checksums freeze both corpora', () => {
  assert.equal(pair.dev.manifestSha256, 'a7e9253f1c2c849625f77ff3719d4151c60ceca7aae7f9274891805c7dd95a34');
  assert.equal(pair.dev.expandedSha256, '14c0011d75847afb118f12eb5d60c7da5ff35112dab962e152098b756d583031');
  assert.equal(pair.holdout.manifestSha256, 'e09e0208b2b11f4e84e5ea8b6061458515a1a9a306aa8e4a373e4c666b66279c');
  assert.equal(pair.holdout.expandedSha256, '4ca3578e28d83666f788fbbddb664bcf7ebc0e1d6e5ccd8b00e6cc72a3e23ba3');

  const tampered = structuredClone(pair.holdout.manifest);
  tampered.seed = `${tampered.seed}-tampered`;
  assert.throws(() => expandGoldenDataset(tampered), /manifest checksum mismatch/);
});

test('leakage guard rejects entity-family and evidence-domain crossover', () => {
  assert.deepEqual(assertNoGoldenLeakage(pair.dev, pair.holdout), {
    comparedWithDatasetVersion: pair.holdout.manifest.datasetVersion,
    entityFamilyOverlap: 0,
    evidenceDomainOverlap: 0,
    passed: true,
  });

  const familyLeak = structuredClone(pair.holdout);
  familyLeak.companies[0].entityFamilyId = pair.dev.companies[0].entityFamilyId;
  assert.throws(() => assertNoGoldenLeakage(pair.dev, familyLeak), /entity-family leakage detected/);

  const domainLeak = structuredClone(pair.holdout);
  domainLeak.telegram[0].evidenceDomain = pair.dev.telegram[0].evidenceDomain;
  assert.throws(() => assertNoGoldenLeakage(pair.dev, domainLeak), /evidence-domain leakage detected/);
});

test('one-sided Wilson intervals support the 600-negative zero-false CTA gate', () => {
  const interval = wilsonOneSided95(0, 600);
  assert.equal(interval.value, 0);
  assert.equal(interval.lower, 0);
  assert.equal(interval.upper, 0.004489);
  assert.ok((interval.upper ?? 1) < 0.005);
  assert.deepEqual(wilsonOneSided95(0, 0), {
    method: 'wilson-one-sided-95',
    successes: 0,
    trials: 0,
    value: null,
    lower: null,
    upper: null,
  });
});

test('reference holdout candidate passes research gates with contact surface absent', () => {
  const predictions = reference(false);
  predictions.observations = {
    timeToFirstActionableMs: [40_000, 60_000, 88_000, 120_000],
    totalCostUsd: 12,
    incrementalActionableCount: 24,
    d1QueriesPerInvocation: [18, 22, 27],
    externalFetchesPerCompany: [2, 4, 8],
    dailyQueueReserveExhausted: false,
  };
  const report = evaluateGoldenDataset({
    dataset: pair.holdout,
    counterpart: pair.dev,
    predictions,
    releaseTarget: 'research',
  });
  assert.equal(report.verdict.goldenEvaluationPassed, true);
  assert.deepEqual(report.verdict.failedRequiredGateIds, []);
  assert.equal(report.verdict.productionReleaseAuthorized, false);
  assert.equal(gate(report, 'research_contact_surface_absent').passed, true);
  assert.equal(gate(report, 'official_site_precision').passed, true);
  assert.equal(gate(report, 'actionable_p_at_10_cluster_lower').passed, true);
  assert.equal(report.dataset.leakageGuard.passed, true);

  const metrics = report.metrics as {
    operations: {
      timeToFirstActionable: { p50Ms: number; p95Ms: number };
      cost: { usdPerIncrementalActionable: number };
    };
  };
  assert.equal(metrics.operations.timeToFirstActionable.p50Ms, 60_000);
  assert.equal(metrics.operations.timeToFirstActionable.p95Ms, 120_000);
  assert.equal(metrics.operations.cost.usdPerIncrementalActionable, 0.5);
});

test('reference holdout candidate passes contact-quality gates without authorizing production', () => {
  const report = evaluateGoldenDataset({
    dataset: pair.holdout,
    counterpart: pair.dev,
    predictions: reference(true),
    releaseTarget: 'contact',
  });
  assert.equal(report.verdict.goldenEvaluationPassed, true);
  assert.equal(report.verdict.productionReleaseAuthorized, false);
  assert.equal(gate(report, 'person_company_precision').passed, true);
  assert.equal(gate(report, 'person_contact_precision').passed, true);
  assert.equal(gate(report, 'decision_maker_precision').passed, true);
  assert.equal(gate(report, 'telegram_business_precision').passed, true);
  assert.equal(gate(report, 'telegram_human_precision').passed, true);
  assert.equal(gate(report, 'false_personal_cta').passed, true);
  assert.equal(gate(report, 'contact_external_prerequisites').passed, true);
});

test('development corpus cannot be mistaken for contact-release evidence', () => {
  const report = evaluateGoldenDataset({
    dataset: pair.dev,
    counterpart: pair.holdout,
    predictions: referenceFor(pair.dev, true),
    releaseTarget: 'contact',
  });
  assert.equal(report.verdict.goldenEvaluationPassed, false);
  assert.equal(gate(report, 'person_company_precision').passed, false);
  assert.equal(gate(report, 'person_contact_precision').passed, false);
  assert.equal(gate(report, 'false_personal_cta').passed, false);
});

test('one false personal CTA fails contact mode even when every aggregate metric is perfect', () => {
  const predictions = reference(true);
  predictions.personalCtaNegatives[0].showPersonalCta = true;
  const report = evaluateGoldenDataset({
    dataset: pair.holdout,
    counterpart: pair.dev,
    predictions,
    releaseTarget: 'contact',
  });
  assert.equal(report.verdict.goldenEvaluationPassed, false);
  assert.equal(gate(report, 'false_personal_cta').passed, false);
  assert.ok(report.verdict.failedRequiredGateIds.includes('false_personal_cta'));
});

test('adversarial predictions fail company, Telegram, people, ranking, CTA and prerequisite gates', () => {
  const predictions = reference(true);
  for (const company of predictions.companies) {
    company.activeCompany = true;
    company.nicheMatch = true;
    company.geoMatch = true;
    company.officialSite = true;
    company.corporateRouteVerified = true;
    company.retrievedWithinBoundedK = false;
    company.actionable = true;
  }
  for (const endpoint of predictions.telegram) endpoint.type = 'human';
  for (const person of predictions.people) {
    person.companyAffiliation = true;
    person.contactBelongsToPerson = true;
    person.currentDecisionMaker = true;
  }
  predictions.personalCtaNegatives[0].showPersonalCta = true;
  for (const ranking of predictions.rankings) {
    const search = pair.holdout.rankings.find((entry) => entry.id === ranking.searchId);
    assert.ok(search);
    ranking.orderedCardIds = [...search.cards].reverse().slice(0, 10).map((entry) => entry.id);
  }
  for (const key of Object.keys(predictions.contactPrerequisites) as Array<keyof typeof predictions.contactPrerequisites>) {
    predictions.contactPrerequisites[key] = false;
  }
  const report = evaluateGoldenDataset({
    dataset: pair.holdout,
    counterpart: pair.dev,
    predictions,
    releaseTarget: 'contact',
  });
  assert.equal(report.verdict.goldenEvaluationPassed, false);
  for (const id of [
    'active_company_precision',
    'official_site_precision',
    'telegram_macro_f1_point',
    'telegram_business_precision',
    'telegram_human_precision',
    'person_company_precision',
    'person_contact_precision',
    'decision_maker_precision',
    'bounded_recall',
    'actionable_p_at_10_cluster_lower',
    'false_personal_cta',
    'contact_external_prerequisites',
  ]) {
    assert.equal(gate(report, id).passed, false, `${id} unexpectedly passed`);
  }
});

test('evaluation is byte-deterministic and rejects cherry-picked prediction coverage', () => {
  const predictions = reference(false);
  const first = evaluateGoldenDataset({
    dataset: pair.holdout,
    counterpart: pair.dev,
    predictions,
    releaseTarget: 'research',
  });
  const second = evaluateGoldenDataset({
    dataset: pair.holdout,
    counterpart: pair.dev,
    predictions: structuredClone(predictions),
    releaseTarget: 'research',
  });
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.match(first.candidate.predictionsSha256, /^[a-f0-9]{64}$/);

  const incomplete = structuredClone(predictions);
  incomplete.companies.pop();
  assert.throws(() => evaluateGoldenDataset({
    dataset: pair.holdout,
    counterpart: pair.dev,
    predictions: incomplete,
    releaseTarget: 'research',
  }), /company predictions omit 1 frozen cases/);

  const malformedPrerequisites = structuredClone(predictions);
  const prerequisiteRecord = malformedPrerequisites.contactPrerequisites as unknown as Record<string, boolean>;
  delete prerequisiteRecord.writtenCounselApproval;
  prerequisiteRecord.unreviewedShortcut = true;
  assert.throws(() => evaluateGoldenDataset({
    dataset: pair.holdout,
    counterpart: pair.dev,
    predictions: malformedPrerequisites,
    releaseTarget: 'contact',
  }), /contactPrerequisites must contain exactly the six frozen keys/);
});
