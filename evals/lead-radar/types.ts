export const LEAD_RADAR_GOLDEN_SCHEMA_VERSION = 'lead-radar-golden-manifest/v1' as const;
export const LEAD_RADAR_PREDICTIONS_SCHEMA_VERSION = 'lead-radar-candidate-predictions/v1' as const;
export const LEAD_RADAR_REPORT_SCHEMA_VERSION = 'lead-radar-golden-report/v1' as const;
export const LEAD_RADAR_GENERATOR_VERSION = 'lead-radar-synthetic-generator/1.0.0' as const;

export const LEAD_RADAR_NICHES = [
  'dentistry',
  'beauty_salons',
  'training_centers',
  'real_estate',
  'car_services',
  'food_delivery',
] as const;

export const LEAD_RADAR_LANGUAGES = ['ru', 'uz'] as const;
export const LEAD_RADAR_TELEGRAM_TYPES = ['business', 'human', 'bot', 'channel', 'group', 'unknown'] as const;

export type LeadRadarNiche = (typeof LEAD_RADAR_NICHES)[number];
export type LeadRadarLanguage = (typeof LEAD_RADAR_LANGUAGES)[number];
export type TelegramEndpointType = (typeof LEAD_RADAR_TELEGRAM_TYPES)[number];
export type GoldenSplit = 'dev' | 'holdout';
export type ReleaseTarget = 'research' | 'contact';

export type CompanyNegativeKind =
  | 'closed_company'
  | 'wrong_geo'
  | 'adjacent_niche'
  | 'shared_domain'
  | 'branch_collision'
  | 'parked_domain'
  | 'unverified_official_site'
  | 'namesake_company';

export type PersonalCtaNegativeReason =
  | 'wrong_company'
  | 'stale_role'
  | 'shared_contact_card'
  | 'missing_consent_or_gate'
  | 'dnc_suppressed'
  | 'unknown_identity'
  | 'negative_affiliation'
  | 'channel_not_approved';

export interface GoldenDatasetManifest {
  schemaVersion: typeof LEAD_RADAR_GOLDEN_SCHEMA_VERSION;
  datasetVersion: string;
  split: GoldenSplit;
  seed: string;
  locale: {
    city: 'Tashkent';
    country: 'UZ';
    languages: LeadRadarLanguage[];
    niches: LeadRadarNiche[];
  };
  namespace: {
    entityPrefix: string;
    evidenceDomainSuffix: string;
  };
  freeze: {
    frozenAt: string;
    generatorVersion: typeof LEAD_RADAR_GENERATOR_VERSION;
    immutable: true;
    tuningAllowed: boolean;
    independentlyLabelled: boolean;
    sourcePolicy: 'synthetic-public-safe-only';
    containsRealPersonPii: false;
    expectedManifestSha256: string;
    expectedExpandedSha256: string;
  };
  blocks: {
    companies: {
      positivesPerNicheLanguageCell: number;
      hardNegativesPerNicheLanguageCell: number;
      negativeKinds: CompanyNegativeKind[];
      corporateRouteModulo: number;
      corporateRouteSlots: number[];
    };
    rankings: {
      searchesPerNicheLanguageCell: number;
      candidateCardsPerSearch: number;
      actionableCardsPerSearch: number;
      evaluatedTopK: 10;
    };
    telegram: {
      endpointsPerType: number;
      types: TelegramEndpointType[];
    };
    people: {
      predictedPositiveEligibleCount: number;
      negativeAffiliationCount: number;
    };
    personalCtaNegatives: {
      count: number;
      reasons: PersonalCtaNegativeReason[];
    };
  };
  expectedCounts: GoldenDatasetCounts;
}

export interface GoldenDatasetCounts {
  companies: number;
  rankingSearches: number;
  rankingCards: number;
  telegramEndpoints: number;
  personEdges: number;
  personPredictedPositiveEligible: number;
  personalCtaNegatives: number;
}

export interface SyntheticLabelEvidence {
  url: string;
  observedAt: string;
  contentSha256: string;
  policyVersion: 'lead-radar-label-policy/1.0.0';
  rationaleCode: string;
  synthetic: true;
}

export interface CompanyGoldenCase {
  id: string;
  entityFamilyId: string;
  branchFamilyId: string;
  evidenceDomain: string;
  niche: LeadRadarNiche;
  language: LeadRadarLanguage;
  city: 'Tashkent';
  negativeKind: CompanyNegativeKind | null;
  truth: {
    activeCompany: boolean;
    nicheMatch: boolean;
    geoMatch: boolean;
    officialSite: boolean;
    corporateRouteAvailable: boolean;
    inPermittedCandidateUniverse: boolean;
    actionable: boolean;
  };
  evidence: SyntheticLabelEvidence;
}

export interface RankingCardGoldenCase {
  id: string;
  entityFamilyId: string;
  actionable: boolean;
}

export interface RankingSearchGoldenCase {
  id: string;
  niche: LeadRadarNiche;
  language: LeadRadarLanguage;
  city: 'Tashkent';
  cards: RankingCardGoldenCase[];
}

export interface TelegramGoldenCase {
  id: string;
  endpointFamilyId: string;
  evidenceDomain: string;
  truthType: TelegramEndpointType;
  evidence: SyntheticLabelEvidence;
}

export interface PersonEdgeGoldenCase {
  id: string;
  personRef: string;
  entityFamilyId: string;
  evidenceDomain: string;
  negativeAffiliation: boolean;
  truth: {
    companyAffiliation: boolean;
    contactBelongsToPerson: boolean;
    currentDecisionMaker: boolean;
    manuallyApproved: boolean;
  };
  evidence: SyntheticLabelEvidence;
}

export interface PersonalCtaGoldenCase {
  id: string;
  personRef: string;
  entityFamilyId: string;
  evidenceDomain: string;
  reason: PersonalCtaNegativeReason;
  personalCtaAllowed: false;
  evidence: SyntheticLabelEvidence;
}

export interface ExpandedGoldenDataset {
  manifest: GoldenDatasetManifest;
  manifestSha256: string;
  expandedSha256: string;
  counts: GoldenDatasetCounts;
  companies: CompanyGoldenCase[];
  rankings: RankingSearchGoldenCase[];
  telegram: TelegramGoldenCase[];
  people: PersonEdgeGoldenCase[];
  personalCtaNegatives: PersonalCtaGoldenCase[];
}

export interface CompanyPrediction {
  caseId: string;
  activeCompany: boolean;
  nicheMatch: boolean;
  geoMatch: boolean;
  officialSite: boolean;
  corporateRouteVerified: boolean;
  retrievedWithinBoundedK: boolean;
  actionable: boolean;
}

export interface TelegramPrediction {
  caseId: string;
  type: TelegramEndpointType;
}

export interface PersonEdgePrediction {
  caseId: string;
  companyAffiliation: boolean;
  contactBelongsToPerson: boolean;
  currentDecisionMaker: boolean;
}

export interface PersonalCtaPrediction {
  caseId: string;
  showPersonalCta: boolean;
}

export interface RankingPrediction {
  searchId: string;
  orderedCardIds: string[];
}

export interface ContactPrerequisites {
  writtenCounselApproval: boolean;
  dataFlowAndResidencyApproved: boolean;
  personalVaultApproved: boolean;
  retentionDsarDncGreen: boolean;
  manualRoleApprovalEnforced: boolean;
  channelPolicyApproved: boolean;
}

export interface EvaluationObservations {
  timeToFirstActionableMs?: number[];
  totalCostUsd?: number;
  incrementalActionableCount?: number;
  d1QueriesPerInvocation?: number[];
  externalFetchesPerCompany?: number[];
  dailyQueueReserveExhausted?: boolean;
}

export interface LeadRadarCandidatePredictions {
  schemaVersion: typeof LEAD_RADAR_PREDICTIONS_SCHEMA_VERSION;
  candidateId: string;
  candidateVersion: string;
  datasetVersion: string;
  contactSurfaceEnabled: boolean;
  contactPrerequisites: ContactPrerequisites;
  companies: CompanyPrediction[];
  rankings: RankingPrediction[];
  telegram: TelegramPrediction[];
  people: PersonEdgePrediction[];
  personalCtaNegatives: PersonalCtaPrediction[];
  observations?: EvaluationObservations;
}

export interface WilsonInterval {
  method: 'wilson-one-sided-95';
  successes: number;
  trials: number;
  value: number | null;
  lower: number | null;
  upper: number | null;
}

export interface BootstrapInterval {
  method: 'deterministic-cluster-bootstrap-95' | 'deterministic-stratified-bootstrap-95';
  iterations: number;
  value: number | null;
  lower: number | null;
  upper: number | null;
}

export interface GateResult {
  id: string;
  required: boolean;
  passed: boolean;
  actual: number | boolean | string | null;
  threshold: string;
  rationale: string;
}

export interface LeadRadarGoldenReport {
  schemaVersion: typeof LEAD_RADAR_REPORT_SCHEMA_VERSION;
  reportVersion: '1.0.0';
  releaseTarget: ReleaseTarget;
  candidate: {
    id: string;
    version: string;
    predictionsSha256: string;
  };
  dataset: {
    version: string;
    split: GoldenSplit;
    frozenAt: string;
    generatorVersion: string;
    manifestSha256: string;
    expandedSha256: string;
    counts: GoldenDatasetCounts;
    leakageGuard: {
      comparedWithDatasetVersion: string;
      entityFamilyOverlap: 0;
      evidenceDomainOverlap: 0;
      passed: true;
    };
  };
  metrics: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  gates: GateResult[];
  verdict: {
    goldenEvaluationPassed: boolean;
    failedRequiredGateIds: string[];
    advisoryGateIds: string[];
    scope: 'offline-golden-evaluation-only';
    productionReleaseAuthorized: false;
  };
}
