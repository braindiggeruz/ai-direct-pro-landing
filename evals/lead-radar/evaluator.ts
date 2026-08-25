import { canonicalJson, deterministicUnitInterval, sha256Canonical } from './canonical';
import { assertNoGoldenLeakage, assertPublicSafeSyntheticDataset, type LeakageGuardResult } from './dataset';
import {
  LEAD_RADAR_PREDICTIONS_SCHEMA_VERSION,
  LEAD_RADAR_REPORT_SCHEMA_VERSION,
  LEAD_RADAR_TELEGRAM_TYPES,
  type BootstrapInterval,
  type CompanyPrediction,
  type ExpandedGoldenDataset,
  type GateResult,
  type GoldenSplit,
  type LeadRadarCandidatePredictions,
  type LeadRadarGoldenReport,
  type PersonalCtaPrediction,
  type PersonEdgePrediction,
  type RankingPrediction,
  type ReleaseTarget,
  type TelegramEndpointType,
  type TelegramPrediction,
  type WilsonInterval,
} from './types';

const ONE_SIDED_95_Z = 1.644_853_626_951_472_2;
const BOOTSTRAP_ITERATIONS = 10_000;
const CONTACT_PREREQUISITE_KEYS = [
  'writtenCounselApproval',
  'dataFlowAndResidencyApproved',
  'personalVaultApproved',
  'retentionDsarDncGreen',
  'manualRoleApprovalEnforced',
  'channelPolicyApproved',
] as const;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Golden evaluation invariant failed: ${message}`);
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue * sorted.length) - 1));
  return sorted[rank];
}

export function wilsonOneSided95(successes: number, trials: number): WilsonInterval {
  invariant(Number.isInteger(successes) && successes >= 0, 'Wilson successes must be a non-negative integer');
  invariant(Number.isInteger(trials) && trials >= 0, 'Wilson trials must be a non-negative integer');
  invariant(successes <= trials, 'Wilson successes cannot exceed trials');
  if (trials === 0) {
    return { method: 'wilson-one-sided-95', successes, trials, value: null, lower: null, upper: null };
  }
  const probability = successes / trials;
  const zSquared = ONE_SIDED_95_Z ** 2;
  const denominator = 1 + zSquared / trials;
  const center = (probability + zSquared / (2 * trials)) / denominator;
  const margin = ONE_SIDED_95_Z
    * Math.sqrt((probability * (1 - probability)) / trials + zSquared / (4 * trials ** 2))
    / denominator;
  return {
    method: 'wilson-one-sided-95',
    successes,
    trials,
    value: round(probability),
    lower: round(Math.max(0, center - margin)),
    upper: round(Math.min(1, center + margin)),
  };
}

function normalizedPredictions(predictions: LeadRadarCandidatePredictions): unknown {
  return {
    ...predictions,
    companies: [...predictions.companies].sort((left, right) => left.caseId.localeCompare(right.caseId)),
    rankings: [...predictions.rankings].sort((left, right) => left.searchId.localeCompare(right.searchId)),
    telegram: [...predictions.telegram].sort((left, right) => left.caseId.localeCompare(right.caseId)),
    people: [...predictions.people].sort((left, right) => left.caseId.localeCompare(right.caseId)),
    personalCtaNegatives: [...predictions.personalCtaNegatives]
      .sort((left, right) => left.caseId.localeCompare(right.caseId)),
  };
}

function exactPredictionMap<T extends { caseId: string }>(
  label: string,
  expectedIds: string[],
  predictions: T[],
): Map<string, T> {
  invariant(Array.isArray(predictions), `${label} predictions must be an array`);
  const map = new Map<string, T>();
  for (const prediction of predictions) {
    invariant(prediction !== null && typeof prediction === 'object', `${label} prediction must be an object`);
    invariant(typeof prediction.caseId === 'string', `${label} caseId must be a string`);
    invariant(!map.has(prediction.caseId), `duplicate ${label} prediction ${prediction.caseId}`);
    map.set(prediction.caseId, prediction);
  }
  const expected = new Set(expectedIds);
  const missing = expectedIds.filter((id) => !map.has(id));
  const unknown = [...map.keys()].filter((id) => !expected.has(id));
  invariant(missing.length === 0, `${label} predictions omit ${missing.length} frozen cases`);
  invariant(unknown.length === 0, `${label} predictions contain ${unknown.length} unknown cases`);
  return map;
}

function exactRankingMap(
  dataset: ExpandedGoldenDataset,
  predictions: RankingPrediction[],
): Map<string, RankingPrediction> {
  invariant(Array.isArray(predictions), 'ranking predictions must be an array');
  const map = new Map<string, RankingPrediction>();
  const expected = new Map(dataset.rankings.map((search) => [search.id, search]));
  for (const prediction of predictions) {
    invariant(prediction !== null && typeof prediction === 'object', 'ranking prediction must be an object');
    invariant(typeof prediction.searchId === 'string', 'ranking searchId must be a string');
    invariant(!map.has(prediction.searchId), `duplicate ranking prediction ${prediction.searchId}`);
    const search = expected.get(prediction.searchId);
    invariant(search, `unknown ranking search ${prediction.searchId}`);
    invariant(Array.isArray(prediction.orderedCardIds), `orderedCardIds missing for ${prediction.searchId}`);
    invariant(
      prediction.orderedCardIds.length === dataset.manifest.blocks.rankings.evaluatedTopK,
      `${prediction.searchId} must provide exactly top-${dataset.manifest.blocks.rankings.evaluatedTopK}`,
    );
    invariant(
      new Set(prediction.orderedCardIds).size === prediction.orderedCardIds.length,
      `${prediction.searchId} contains duplicate ranked cards`,
    );
    const knownCards = new Set(search.cards.map((card) => card.id));
    invariant(
      prediction.orderedCardIds.every((id) => knownCards.has(id)),
      `${prediction.searchId} references an unknown ranked card`,
    );
    map.set(prediction.searchId, prediction);
  }
  const missing = dataset.rankings.filter((search) => !map.has(search.id));
  invariant(missing.length === 0, `ranking predictions omit ${missing.length} frozen searches`);
  return map;
}

function booleanField(value: unknown, label: string): asserts value is boolean {
  invariant(typeof value === 'boolean', `${label} must be boolean`);
}

function validateCandidate(
  dataset: ExpandedGoldenDataset,
  predictions: LeadRadarCandidatePredictions,
): {
  companies: Map<string, CompanyPrediction>;
  rankings: Map<string, RankingPrediction>;
  telegram: Map<string, TelegramPrediction>;
  people: Map<string, PersonEdgePrediction>;
  cta: Map<string, PersonalCtaPrediction>;
  predictionsSha256: string;
} {
  invariant(predictions.schemaVersion === LEAD_RADAR_PREDICTIONS_SCHEMA_VERSION, 'unsupported predictions schema');
  invariant(predictions.datasetVersion === dataset.manifest.datasetVersion, 'candidate targets a different dataset version');
  invariant(typeof predictions.candidateId === 'string' && predictions.candidateId.length > 0, 'candidateId is required');
  invariant(
    typeof predictions.candidateVersion === 'string' && predictions.candidateVersion.length > 0,
    'candidateVersion is required',
  );
  booleanField(predictions.contactSurfaceEnabled, 'contactSurfaceEnabled');
  invariant(
    predictions.contactPrerequisites !== null && typeof predictions.contactPrerequisites === 'object',
    'contactPrerequisites are required',
  );
  const prerequisiteKeys = Object.keys(predictions.contactPrerequisites).sort();
  invariant(
    canonicalJson(prerequisiteKeys) === canonicalJson([...CONTACT_PREREQUISITE_KEYS].sort()),
    'contactPrerequisites must contain exactly the six frozen keys',
  );
  for (const key of CONTACT_PREREQUISITE_KEYS) {
    booleanField(predictions.contactPrerequisites[key], `contactPrerequisites.${key}`);
  }
  const companies = exactPredictionMap('company', dataset.companies.map((entry) => entry.id), predictions.companies);
  for (const prediction of companies.values()) {
    booleanField(prediction.activeCompany, `${prediction.caseId}.activeCompany`);
    booleanField(prediction.nicheMatch, `${prediction.caseId}.nicheMatch`);
    booleanField(prediction.geoMatch, `${prediction.caseId}.geoMatch`);
    booleanField(prediction.officialSite, `${prediction.caseId}.officialSite`);
    booleanField(prediction.corporateRouteVerified, `${prediction.caseId}.corporateRouteVerified`);
    booleanField(prediction.retrievedWithinBoundedK, `${prediction.caseId}.retrievedWithinBoundedK`);
    booleanField(prediction.actionable, `${prediction.caseId}.actionable`);
  }
  const telegram = exactPredictionMap('Telegram', dataset.telegram.map((entry) => entry.id), predictions.telegram);
  for (const prediction of telegram.values()) {
    invariant(
      LEAD_RADAR_TELEGRAM_TYPES.includes(prediction.type),
      `${prediction.caseId}.type is not a frozen Telegram class`,
    );
  }
  const people = exactPredictionMap('person edge', dataset.people.map((entry) => entry.id), predictions.people);
  for (const prediction of people.values()) {
    booleanField(prediction.companyAffiliation, `${prediction.caseId}.companyAffiliation`);
    booleanField(prediction.contactBelongsToPerson, `${prediction.caseId}.contactBelongsToPerson`);
    booleanField(prediction.currentDecisionMaker, `${prediction.caseId}.currentDecisionMaker`);
  }
  const cta = exactPredictionMap(
    'personal CTA negative',
    dataset.personalCtaNegatives.map((entry) => entry.id),
    predictions.personalCtaNegatives,
  );
  for (const prediction of cta.values()) {
    booleanField(prediction.showPersonalCta, `${prediction.caseId}.showPersonalCta`);
  }
  const rankings = exactRankingMap(dataset, predictions.rankings);
  validateObservations(predictions.observations);
  return {
    companies,
    rankings,
    telegram,
    people,
    cta,
    predictionsSha256: sha256Canonical(normalizedPredictions(predictions)),
  };
}

function validateNumberArray(value: unknown, label: string): void {
  invariant(Array.isArray(value), `${label} must be an array`);
  invariant(
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0),
    `${label} must contain finite non-negative numbers`,
  );
}

function validateObservations(observations: LeadRadarCandidatePredictions['observations']): void {
  if (observations === undefined) return;
  invariant(observations !== null && typeof observations === 'object', 'observations must be an object');
  if (observations.timeToFirstActionableMs !== undefined) {
    validateNumberArray(observations.timeToFirstActionableMs, 'timeToFirstActionableMs');
  }
  if (observations.d1QueriesPerInvocation !== undefined) {
    validateNumberArray(observations.d1QueriesPerInvocation, 'd1QueriesPerInvocation');
  }
  if (observations.externalFetchesPerCompany !== undefined) {
    validateNumberArray(observations.externalFetchesPerCompany, 'externalFetchesPerCompany');
  }
  for (const key of ['totalCostUsd', 'incrementalActionableCount'] as const) {
    const value = observations[key];
    invariant(value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0), `${key} is invalid`);
  }
  invariant(
    observations.dailyQueueReserveExhausted === undefined || typeof observations.dailyQueueReserveExhausted === 'boolean',
    'dailyQueueReserveExhausted must be boolean',
  );
}

function precisionMetric<T>(
  cases: T[],
  predictionFor: (entry: T) => boolean,
  truthFor: (entry: T) => boolean,
): WilsonInterval {
  let trials = 0;
  let successes = 0;
  for (const entry of cases) {
    if (!predictionFor(entry)) continue;
    trials += 1;
    if (truthFor(entry)) successes += 1;
  }
  return wilsonOneSided95(successes, trials);
}

function coverageMetric<T>(
  cases: T[],
  eligible: (entry: T) => boolean,
  covered: (entry: T) => boolean,
): WilsonInterval {
  const eligibleCases = cases.filter(eligible);
  return wilsonOneSided95(eligibleCases.filter(covered).length, eligibleCases.length);
}

function telegramConfusion(
  dataset: ExpandedGoldenDataset,
  predictions: Map<string, TelegramPrediction>,
): {
  macroF1: number;
  perClass: Record<TelegramEndpointType, { precision: WilsonInterval; recall: WilsonInterval; f1: number }>;
  matrix: Record<TelegramEndpointType, Record<TelegramEndpointType, number>>;
} {
  const matrix = Object.fromEntries(
    LEAD_RADAR_TELEGRAM_TYPES.map((truth) => [
      truth,
      Object.fromEntries(LEAD_RADAR_TELEGRAM_TYPES.map((prediction) => [prediction, 0])),
    ]),
  ) as Record<TelegramEndpointType, Record<TelegramEndpointType, number>>;
  for (const entry of dataset.telegram) {
    const prediction = predictions.get(entry.id);
    invariant(prediction, `missing Telegram prediction ${entry.id}`);
    matrix[entry.truthType][prediction.type] += 1;
  }
  const perClass = Object.fromEntries(LEAD_RADAR_TELEGRAM_TYPES.map((type) => {
    const truePositive = matrix[type][type];
    const predictedPositive = LEAD_RADAR_TELEGRAM_TYPES.reduce((sum, truth) => sum + matrix[truth][type], 0);
    const actualPositive = LEAD_RADAR_TELEGRAM_TYPES.reduce((sum, predicted) => sum + matrix[type][predicted], 0);
    const precision = wilsonOneSided95(truePositive, predictedPositive);
    const recall = wilsonOneSided95(truePositive, actualPositive);
    const p = predictedPositive === 0 ? 0 : truePositive / predictedPositive;
    const r = actualPositive === 0 ? 0 : truePositive / actualPositive;
    const f1 = p + r === 0 ? 0 : (2 * p * r) / (p + r);
    return [type, { precision, recall, f1: round(f1) }];
  })) as Record<TelegramEndpointType, { precision: WilsonInterval; recall: WilsonInterval; f1: number }>;
  return {
    macroF1: round(mean(LEAD_RADAR_TELEGRAM_TYPES.map((type) => perClass[type].f1)) ?? 0),
    perClass,
    matrix,
  };
}

function macroF1FromMatrix(matrix: number[][]): number {
  let total = 0;
  for (let type = 0; type < LEAD_RADAR_TELEGRAM_TYPES.length; type += 1) {
    const truePositive = matrix[type][type];
    let predictedPositive = 0;
    let actualPositive = 0;
    for (let other = 0; other < LEAD_RADAR_TELEGRAM_TYPES.length; other += 1) {
      predictedPositive += matrix[other][type];
      actualPositive += matrix[type][other];
    }
    const precision = predictedPositive === 0 ? 0 : truePositive / predictedPositive;
    const recall = actualPositive === 0 ? 0 : truePositive / actualPositive;
    total += precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  }
  return total / LEAD_RADAR_TELEGRAM_TYPES.length;
}

function telegramBootstrap(
  dataset: ExpandedGoldenDataset,
  predictions: Map<string, TelegramPrediction>,
  seed: string,
  point: number,
): BootstrapInterval {
  const typeIndex = new Map(LEAD_RADAR_TELEGRAM_TYPES.map((type, index) => [type, index]));
  const strata = LEAD_RADAR_TELEGRAM_TYPES.map((truthType) => dataset.telegram
    .filter((entry) => entry.truthType === truthType)
    .map((entry) => {
      const predicted = predictions.get(entry.id);
      invariant(predicted, `missing Telegram prediction ${entry.id}`);
      const index = typeIndex.get(predicted.type);
      invariant(index !== undefined, `unknown Telegram prediction type ${predicted.type}`);
      return index;
    }));
  if (strata.some((entries) => entries.length === 0)) {
    return {
      method: 'deterministic-stratified-bootstrap-95',
      iterations: 0,
      value: point,
      lower: null,
      upper: null,
    };
  }
  const random = deterministicUnitInterval(seed);
  const samples: number[] = [];
  for (let iteration = 0; iteration < BOOTSTRAP_ITERATIONS; iteration += 1) {
    const matrix = Array.from({ length: LEAD_RADAR_TELEGRAM_TYPES.length }, () =>
      Array.from({ length: LEAD_RADAR_TELEGRAM_TYPES.length }, () => 0));
    for (let truth = 0; truth < strata.length; truth += 1) {
      const entries = strata[truth];
      for (let draw = 0; draw < entries.length; draw += 1) {
        const predicted = entries[Math.floor(random() * entries.length)];
        matrix[truth][predicted] += 1;
      }
    }
    samples.push(macroF1FromMatrix(matrix));
  }
  return {
    method: 'deterministic-stratified-bootstrap-95',
    iterations: BOOTSTRAP_ITERATIONS,
    value: round(point),
    lower: round(percentile(samples, 0.025) ?? 0),
    upper: round(percentile(samples, 0.975) ?? 0),
  };
}

function rankingMetrics(
  dataset: ExpandedGoldenDataset,
  predictions: Map<string, RankingPrediction>,
  seed: string,
): {
  aggregate: WilsonInterval;
  clusterBootstrap: BootstrapInterval;
  minimumCellPoint: number | null;
  cells: Record<string, { searches: number; point: number }>;
} {
  const topK = dataset.manifest.blocks.rankings.evaluatedTopK;
  const searchScores: number[] = [];
  const cellScores = new Map<string, number[]>();
  let actionableCards = 0;
  for (const search of dataset.rankings) {
    const prediction = predictions.get(search.id);
    invariant(prediction, `missing ranking prediction ${search.id}`);
    const truth = new Map(search.cards.map((card) => [card.id, card.actionable]));
    const actionable = prediction.orderedCardIds.filter((id) => truth.get(id) === true).length;
    actionableCards += actionable;
    const score = actionable / topK;
    searchScores.push(score);
    const cell = `${search.niche}:${search.language}`;
    const existing = cellScores.get(cell) ?? [];
    existing.push(score);
    cellScores.set(cell, existing);
  }
  const point = mean(searchScores);
  const random = deterministicUnitInterval(seed);
  const samples: number[] = [];
  if (searchScores.length > 0) {
    for (let iteration = 0; iteration < BOOTSTRAP_ITERATIONS; iteration += 1) {
      let total = 0;
      for (let draw = 0; draw < searchScores.length; draw += 1) {
        total += searchScores[Math.floor(random() * searchScores.length)];
      }
      samples.push(total / searchScores.length);
    }
  }
  const cells = Object.fromEntries([...cellScores.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([cell, scores]) => [cell, { searches: scores.length, point: round(mean(scores) ?? 0) }]));
  const cellPoints = Object.values(cells).map((entry) => entry.point);
  return {
    aggregate: wilsonOneSided95(actionableCards, searchScores.length * topK),
    clusterBootstrap: {
      method: 'deterministic-cluster-bootstrap-95',
      iterations: searchScores.length === 0 ? 0 : BOOTSTRAP_ITERATIONS,
      value: point === null ? null : round(point),
      lower: point === null ? null : round(percentile(samples, 0.025) ?? 0),
      upper: point === null ? null : round(percentile(samples, 0.975) ?? 0),
    },
    minimumCellPoint: cellPoints.length === 0 ? null : Math.min(...cellPoints),
    cells,
  };
}

function observationMetrics(observations: LeadRadarCandidatePredictions['observations']): Record<string, unknown> {
  if (!observations) {
    return {
      status: 'not_provided',
      timeToFirstActionable: null,
      cost: null,
      platformBudget: null,
    };
  }
  const timings = observations.timeToFirstActionableMs ?? [];
  const d1 = observations.d1QueriesPerInvocation ?? [];
  const fetches = observations.externalFetchesPerCompany ?? [];
  const totalCost = observations.totalCostUsd;
  const incremental = observations.incrementalActionableCount;
  return {
    status: 'provided',
    timeToFirstActionable: timings.length === 0 ? null : {
      samples: timings.length,
      p50Ms: round(percentile(timings, 0.5) ?? 0),
      p95Ms: round(percentile(timings, 0.95) ?? 0),
    },
    cost: totalCost === undefined ? null : {
      totalUsd: round(totalCost),
      incrementalActionableCount: incremental ?? null,
      usdPerIncrementalActionable: incremental && incremental > 0 ? round(totalCost / incremental) : null,
    },
    platformBudget: {
      d1Queries: d1.length === 0 ? null : {
        samples: d1.length,
        max: Math.max(...d1),
        p95: round(percentile(d1, 0.95) ?? 0),
      },
      externalFetchesPerCompany: fetches.length === 0 ? null : {
        samples: fetches.length,
        max: Math.max(...fetches),
        p95: round(percentile(fetches, 0.95) ?? 0),
      },
      dailyQueueReserveExhausted: observations.dailyQueueReserveExhausted ?? null,
    },
  };
}

function gate(
  id: string,
  required: boolean,
  passed: boolean,
  actual: GateResult['actual'],
  threshold: string,
  rationale: string,
): GateResult {
  return { id, required, passed, actual, threshold, rationale };
}

function lowerAtLeast(interval: WilsonInterval, threshold: number): boolean {
  return interval.lower !== null && interval.lower >= threshold;
}

export function evaluateGoldenDataset(input: {
  dataset: ExpandedGoldenDataset;
  counterpart: ExpandedGoldenDataset;
  predictions: LeadRadarCandidatePredictions;
  releaseTarget: ReleaseTarget;
}): LeadRadarGoldenReport {
  const { dataset, counterpart, predictions, releaseTarget } = input;
  assertPublicSafeSyntheticDataset(dataset);
  assertPublicSafeSyntheticDataset(counterpart);
  const leakageGuard: LeakageGuardResult = assertNoGoldenLeakage(dataset, counterpart);
  const candidate = validateCandidate(dataset, predictions);

  const companyPrediction = (id: string): CompanyPrediction => {
    const prediction = candidate.companies.get(id);
    invariant(prediction, `missing company prediction ${id}`);
    return prediction;
  };
  const activePrecision = precisionMetric(dataset.companies, (entry) => companyPrediction(entry.id).activeCompany,
    (entry) => entry.truth.activeCompany);
  const nichePrecision = precisionMetric(dataset.companies, (entry) => companyPrediction(entry.id).nicheMatch,
    (entry) => entry.truth.nicheMatch);
  const geoPrecision = precisionMetric(dataset.companies, (entry) => companyPrediction(entry.id).geoMatch,
    (entry) => entry.truth.geoMatch);
  const officialSitePrecision = precisionMetric(dataset.companies, (entry) => companyPrediction(entry.id).officialSite,
    (entry) => entry.truth.officialSite);
  const corporateContactPrecision = precisionMetric(
    dataset.companies,
    (entry) => companyPrediction(entry.id).corporateRouteVerified,
    (entry) => entry.truth.corporateRouteAvailable,
  );
  const actionablePrecision = precisionMetric(dataset.companies, (entry) => companyPrediction(entry.id).actionable,
    (entry) => entry.truth.actionable);
  const corporateRouteCoverage = coverageMetric(
    dataset.companies,
    (entry) => entry.truth.activeCompany && entry.truth.nicheMatch && entry.truth.geoMatch,
    (entry) => companyPrediction(entry.id).corporateRouteVerified && entry.truth.corporateRouteAvailable,
  );
  const boundedRecall = coverageMetric(
    dataset.companies,
    (entry) => entry.truth.activeCompany && entry.truth.nicheMatch && entry.truth.geoMatch
      && entry.truth.inPermittedCandidateUniverse,
    (entry) => companyPrediction(entry.id).retrievedWithinBoundedK,
  );

  const telegram = telegramConfusion(dataset, candidate.telegram);
  const telegramBootstrapInterval = telegramBootstrap(
    dataset,
    candidate.telegram,
    `${dataset.expandedSha256}|${candidate.predictionsSha256}|telegram`,
    telegram.macroF1,
  );

  const personPrediction = (id: string): PersonEdgePrediction => {
    const prediction = candidate.people.get(id);
    invariant(prediction, `missing person prediction ${id}`);
    return prediction;
  };
  const personCompanyPrecision = precisionMetric(
    dataset.people,
    (entry) => personPrediction(entry.id).companyAffiliation,
    (entry) => entry.truth.companyAffiliation,
  );
  const personContactPrecision = precisionMetric(
    dataset.people,
    (entry) => personPrediction(entry.id).contactBelongsToPerson,
    (entry) => entry.truth.contactBelongsToPerson,
  );
  const decisionMakerPrecision = precisionMetric(
    dataset.people,
    (entry) => personPrediction(entry.id).currentDecisionMaker,
    (entry) => entry.truth.currentDecisionMaker && entry.truth.manuallyApproved,
  );

  const falseCtaCount = dataset.personalCtaNegatives.filter((entry) => {
    const prediction = candidate.cta.get(entry.id);
    invariant(prediction, `missing CTA prediction ${entry.id}`);
    return prediction.showPersonalCta;
  }).length;
  const falsePersonalCta = wilsonOneSided95(falseCtaCount, dataset.personalCtaNegatives.length);
  const ranking = rankingMetrics(
    dataset,
    candidate.rankings,
    `${dataset.expandedSha256}|${candidate.predictionsSha256}|ranking`,
  );
  const observations = observationMetrics(predictions.observations);

  const contactRequired = releaseTarget === 'contact';
  const researchRequired = releaseTarget === 'research';
  const allContactPrerequisites = CONTACT_PREREQUISITE_KEYS
    .every((key) => predictions.contactPrerequisites[key] === true);
  const gates: GateResult[] = [
    gate('active_company_precision', true, lowerAtLeast(activePrecision, 0.95), activePrecision.lower,
      'one-sided Wilson 95% lower >= 0.95', 'Prevents inactive-company inflation.'),
    gate('niche_precision', true, lowerAtLeast(nichePrecision, 0.95), nichePrecision.lower,
      'one-sided Wilson 95% lower >= 0.95', 'Protects niche relevance.'),
    gate('geo_precision', true, lowerAtLeast(geoPrecision, 0.95), geoPrecision.lower,
      'one-sided Wilson 95% lower >= 0.95', 'Protects Tashkent branch relevance.'),
    gate('official_site_precision', true,
      officialSitePrecision.trials >= 149 && lowerAtLeast(officialSitePrecision, 0.98), officialSitePrecision.lower,
      'trials >= 149 and one-sided Wilson 95% lower >= 0.98', 'Shared, parked and unofficial domains are hard negatives.'),
    gate('telegram_macro_f1_point', true, telegram.macroF1 >= 0.95, telegram.macroF1,
      'macro-F1 >= 0.95', 'All six endpoint classes have equal weight.'),
    gate('telegram_macro_f1_bootstrap', true,
      telegramBootstrapInterval.lower !== null && telegramBootstrapInterval.lower >= 0.92,
      telegramBootstrapInterval.lower, 'stratified bootstrap lower >= 0.92', 'Guards classifier instability.'),
    gate('telegram_business_precision', contactRequired,
      lowerAtLeast(telegram.perClass.business.precision, 0.98), telegram.perClass.business.precision.lower,
      'one-sided Wilson 95% lower >= 0.98', 'Required before corporate Telegram routing in contact mode.'),
    gate('telegram_human_precision', contactRequired,
      lowerAtLeast(telegram.perClass.human.precision, 0.98), telegram.perClass.human.precision.lower,
      'one-sided Wilson 95% lower >= 0.98', 'Prevents business/human upgrades.'),
    gate('corporate_contact_precision', true, lowerAtLeast(corporateContactPrecision, 0.98),
      corporateContactPrecision.lower, 'one-sided Wilson 95% lower >= 0.98', 'Corporate routes remain evidence-bound.'),
    gate('corporate_route_coverage', true,
      corporateRouteCoverage.value !== null && corporateRouteCoverage.value >= 0.70, corporateRouteCoverage.value,
      'point >= 0.70 with Wilson interval reported', 'Coverage cannot be bought by relaxing precision.'),
    gate('bounded_recall', true, lowerAtLeast(boundedRecall, 0.70), boundedRecall.lower,
      'one-sided Wilson 95% lower >= 0.70', 'Recall is bounded to the frozen permitted universe.'),
    gate('actionable_p_at_10_point', true,
      ranking.clusterBootstrap.value !== null && ranking.clusterBootstrap.value >= 0.90,
      ranking.clusterBootstrap.value, 'cluster point >= 0.90', 'Measures useful first-screen ranking.'),
    gate('actionable_p_at_10_cluster_lower', true,
      ranking.clusterBootstrap.lower !== null && ranking.clusterBootstrap.lower >= 0.90,
      ranking.clusterBootstrap.lower, 'cluster bootstrap lower >= 0.90', 'Search—not card—is the sampling unit.'),
    gate('actionable_p_at_10_cell_floor', true,
      ranking.minimumCellPoint !== null && ranking.minimumCellPoint >= 0.80,
      ranking.minimumCellPoint, 'minimum niche x language cell point >= 0.80', 'Flags severe cell regression.'),
    gate('research_contact_surface_absent', researchRequired, !researchRequired || !predictions.contactSurfaceEnabled,
      !predictions.contactSurfaceEnabled, 'contactSurfaceEnabled == false', 'Research-only evaluation must expose no personal CTA.'),
    gate('person_company_precision', contactRequired,
      personCompanyPrecision.trials >= 299 && lowerAtLeast(personCompanyPrecision, 0.99), personCompanyPrecision.lower,
      'trials >= 299 and one-sided Wilson 95% lower >= 0.99', 'Person-company edges are independent gates.'),
    gate('person_contact_precision', contactRequired,
      personContactPrecision.trials >= 299 && lowerAtLeast(personContactPrecision, 0.99), personContactPrecision.lower,
      'trials >= 299 and one-sided Wilson 95% lower >= 0.99', 'Person-contact ownership is independently verified.'),
    gate('decision_maker_precision', contactRequired,
      decisionMakerPrecision.trials >= 149 && lowerAtLeast(decisionMakerPrecision, 0.98), decisionMakerPrecision.lower,
      'trials >= 149 and one-sided Wilson 95% lower >= 0.98', 'Current role and manual approval are both required.'),
    gate('false_personal_cta', contactRequired,
      falseCtaCount === 0 && falsePersonalCta.trials >= 600
        && falsePersonalCta.upper !== null && falsePersonalCta.upper < 0.005,
      falseCtaCount, '0 false events; trials >= 600; Wilson upper error < 0.005', 'Any false CTA is a stop/rollback event.'),
    gate('contact_external_prerequisites', contactRequired, allContactPrerequisites,
      allContactPrerequisites, 'all six legal/privacy/channel prerequisites == true',
      'Offline quality never substitutes for counsel, residency, vault, retention, DNC or channel approval.'),
  ].sort((left, right) => left.id.localeCompare(right.id));

  const failedRequiredGateIds = gates.filter((entry) => entry.required && !entry.passed).map((entry) => entry.id);
  const advisoryGateIds = gates.filter((entry) => !entry.required && !entry.passed).map((entry) => entry.id);
  const hardNegativeCounts = Object.fromEntries(dataset.manifest.blocks.companies.negativeKinds.map((kind) => [
    kind,
    dataset.companies.filter((entry) => entry.negativeKind === kind).length,
  ]));
  const ctaReasonCounts = Object.fromEntries(dataset.manifest.blocks.personalCtaNegatives.reasons.map((reason) => [
    reason,
    dataset.personalCtaNegatives.filter((entry) => entry.reason === reason).length,
  ]));

  return {
    schemaVersion: LEAD_RADAR_REPORT_SCHEMA_VERSION,
    reportVersion: '1.0.0',
    releaseTarget,
    candidate: {
      id: predictions.candidateId,
      version: predictions.candidateVersion,
      predictionsSha256: candidate.predictionsSha256,
    },
    dataset: {
      version: dataset.manifest.datasetVersion,
      split: dataset.manifest.split,
      frozenAt: dataset.manifest.freeze.frozenAt,
      generatorVersion: dataset.manifest.freeze.generatorVersion,
      manifestSha256: dataset.manifestSha256,
      expandedSha256: dataset.expandedSha256,
      counts: dataset.counts,
      leakageGuard,
    },
    metrics: {
      activeCompanyPrecision: activePrecision,
      nichePrecision,
      geoPrecision,
      officialSitePrecision,
      actionableCompanyPrecision: actionablePrecision,
      telegramMacroF1: {
        point: telegram.macroF1,
        stratifiedBootstrap: telegramBootstrapInterval,
        businessPrecision: telegram.perClass.business.precision,
        humanPrecision: telegram.perClass.human.precision,
      },
      corporateContactPrecision,
      personCompanyPrecision,
      personContactPrecision,
      decisionMakerPrecision,
      falsePersonalCta: {
        falseEvents: falseCtaCount,
        opportunityCount: dataset.personalCtaNegatives.length,
        errorInterval: falsePersonalCta,
      },
      corporateRouteCoverage,
      boundedRecall,
      actionablePrecisionAt10: {
        cardLevelWilson: ranking.aggregate,
        clusterBootstrap: ranking.clusterBootstrap,
      },
      operations: observations,
    },
    diagnostics: {
      niches: dataset.manifest.locale.niches,
      languages: dataset.manifest.locale.languages,
      city: dataset.manifest.locale.city,
      hardNegativeCounts,
      personalCtaNegativeReasonCounts: ctaReasonCounts,
      telegramPerClass: telegram.perClass,
      telegramConfusionMatrix: telegram.matrix,
      actionablePrecisionAt10Cells: ranking.cells,
      minimumActionablePrecisionAt10CellPoint: ranking.minimumCellPoint,
      candidateCanonicalByteLength: canonicalJson(normalizedPredictions(predictions)).length,
    },
    gates,
    verdict: {
      goldenEvaluationPassed: failedRequiredGateIds.length === 0,
      failedRequiredGateIds,
      advisoryGateIds,
      scope: 'offline-golden-evaluation-only',
      productionReleaseAuthorized: false,
    },
  };
}

export function datasetSplitLabel(split: GoldenSplit): string {
  return split === 'holdout' ? 'independently-frozen-holdout' : 'tuning-allowed-development-corpus';
}
