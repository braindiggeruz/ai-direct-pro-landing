import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonicalJson, sha256, sha256Canonical } from './canonical';
import {
  LEAD_RADAR_GENERATOR_VERSION,
  LEAD_RADAR_GOLDEN_SCHEMA_VERSION,
  LEAD_RADAR_LANGUAGES,
  LEAD_RADAR_NICHES,
  type CompanyGoldenCase,
  type CompanyNegativeKind,
  type ExpandedGoldenDataset,
  type GoldenDatasetCounts,
  type GoldenDatasetManifest,
  type PersonalCtaGoldenCase,
  type PersonEdgeGoldenCase,
  type RankingSearchGoldenCase,
  type SyntheticLabelEvidence,
  type TelegramGoldenCase,
} from './types';

export const GOLDEN_DEV_MANIFEST = 'dev.v1.json';
export const GOLDEN_HOLDOUT_MANIFEST = 'holdout.v1.json';

export interface DatasetFreezeValues {
  manifestSha256: string;
  expandedSha256: string;
}

export interface LeakageGuardResult {
  comparedWithDatasetVersion: string;
  entityFamilyOverlap: 0;
  evidenceDomainOverlap: 0;
  passed: true;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Golden dataset invariant failed: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateManifest(raw: unknown): GoldenDatasetManifest {
  invariant(isRecord(raw), 'manifest must be a JSON object');
  invariant(raw.schemaVersion === LEAD_RADAR_GOLDEN_SCHEMA_VERSION, 'unsupported schemaVersion');
  invariant(raw.split === 'dev' || raw.split === 'holdout', 'split must be dev or holdout');
  invariant(typeof raw.datasetVersion === 'string' && raw.datasetVersion.length > 0, 'datasetVersion is required');
  invariant(typeof raw.seed === 'string' && raw.seed.length >= 12, 'seed must be stable and non-trivial');
  invariant(isRecord(raw.locale), 'locale is required');
  invariant(raw.locale.city === 'Tashkent' && raw.locale.country === 'UZ', 'locale must be Tashkent, UZ');
  invariant(
    Array.isArray(raw.locale.languages)
      && canonicalJson(raw.locale.languages) === canonicalJson(LEAD_RADAR_LANGUAGES),
    'languages must be the frozen RU/UZ order',
  );
  invariant(
    Array.isArray(raw.locale.niches)
      && canonicalJson(raw.locale.niches) === canonicalJson(LEAD_RADAR_NICHES),
    'niches must match the frozen six-niche order',
  );
  invariant(isRecord(raw.namespace), 'namespace is required');
  invariant(
    typeof raw.namespace.entityPrefix === 'string' && /^[a-z0-9-]+$/.test(raw.namespace.entityPrefix),
    'entityPrefix must be lowercase and stable',
  );
  invariant(
    typeof raw.namespace.evidenceDomainSuffix === 'string'
      && raw.namespace.evidenceDomainSuffix.endsWith('.invalid'),
    'evidenceDomainSuffix must use the reserved .invalid TLD',
  );
  invariant(isRecord(raw.freeze), 'freeze metadata is required');
  invariant(raw.freeze.generatorVersion === LEAD_RADAR_GENERATOR_VERSION, 'generator version mismatch');
  invariant(raw.freeze.immutable === true, 'dataset must be immutable');
  invariant(raw.freeze.sourcePolicy === 'synthetic-public-safe-only', 'unsafe source policy');
  invariant(raw.freeze.containsRealPersonPii === false, 'real-person PII is forbidden');
  invariant(typeof raw.freeze.expectedManifestSha256 === 'string', 'manifest checksum is required');
  invariant(typeof raw.freeze.expectedExpandedSha256 === 'string', 'expanded checksum is required');
  invariant(isRecord(raw.blocks), 'blocks are required');
  invariant(isRecord(raw.blocks.companies), 'company block is required');
  invariant(isRecord(raw.blocks.rankings), 'ranking block is required');
  invariant(isRecord(raw.blocks.telegram), 'Telegram block is required');
  invariant(isRecord(raw.blocks.people), 'people block is required');
  invariant(isRecord(raw.blocks.personalCtaNegatives), 'CTA-negative block is required');
  invariant(isRecord(raw.expectedCounts), 'expectedCounts is required');
  return raw as unknown as GoldenDatasetManifest;
}

export function readGoldenManifest(path: string): GoldenDatasetManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Unable to read golden manifest ${path}: ${error instanceof Error ? error.message : 'unknown error'}`, {
      cause: error,
    });
  }
  return validateManifest(parsed);
}

function manifestFreezeMaterial(manifest: GoldenDatasetManifest): unknown {
  return {
    ...manifest,
    freeze: {
      ...manifest.freeze,
      expectedManifestSha256: '',
      expectedExpandedSha256: '',
    },
  };
}

function evidence(
  manifest: GoldenDatasetManifest,
  domain: string,
  path: string,
  rationaleCode: string,
): SyntheticLabelEvidence {
  const observedAt = manifest.freeze.frozenAt;
  return {
    url: `https://${domain}/${path}`,
    observedAt,
    contentSha256: sha256(`${manifest.seed}|${manifest.datasetVersion}|${domain}|${path}|${rationaleCode}|${observedAt}`),
    policyVersion: 'lead-radar-label-policy/1.0.0',
    rationaleCode,
    synthetic: true,
  };
}

function negativeTruth(kind: CompanyNegativeKind): CompanyGoldenCase['truth'] {
  const activeCompany = kind !== 'closed_company' && kind !== 'parked_domain';
  const nicheMatch = kind !== 'adjacent_niche' && kind !== 'namesake_company';
  const geoMatch = kind !== 'wrong_geo' && kind !== 'branch_collision';
  const officialSite = !['shared_domain', 'parked_domain', 'unverified_official_site', 'namesake_company'].includes(kind);
  return {
    activeCompany,
    nicheMatch,
    geoMatch,
    officialSite,
    corporateRouteAvailable: false,
    inPermittedCandidateUniverse: activeCompany && nicheMatch && geoMatch,
    actionable: activeCompany && nicheMatch && geoMatch && officialSite,
  };
}

function generateCompanies(manifest: GoldenDatasetManifest): CompanyGoldenCase[] {
  const result: CompanyGoldenCase[] = [];
  const block = manifest.blocks.companies;
  let globalPositiveIndex = 0;
  let cellIndex = 0;
  for (const niche of manifest.locale.niches) {
    for (const language of manifest.locale.languages) {
      const cell = `${niche}-${language}`;
      const sharedBranchFamily = `${manifest.namespace.entityPrefix}-branch-family-${cell}`;
      let firstPositiveDomain = '';
      for (let index = 0; index < block.positivesPerNicheLanguageCell; index += 1) {
        const id = `${manifest.namespace.entityPrefix}-company-${cell}-p${String(index).padStart(3, '0')}`;
        const domain = `${id}.${manifest.namespace.evidenceDomainSuffix}`;
        if (index === 0) firstPositiveDomain = domain;
        const routeAvailable = block.corporateRouteSlots.includes(globalPositiveIndex % block.corporateRouteModulo);
        result.push({
          id,
          entityFamilyId: `${manifest.namespace.entityPrefix}-entity-${cell}-p${String(index).padStart(3, '0')}`,
          branchFamilyId: index === 0 ? sharedBranchFamily : `${manifest.namespace.entityPrefix}-branch-${cell}-p${index}`,
          evidenceDomain: domain,
          niche,
          language,
          city: 'Tashkent',
          negativeKind: null,
          truth: {
            activeCompany: true,
            nicheMatch: true,
            geoMatch: true,
            officialSite: true,
            corporateRouteAvailable: routeAvailable,
            inPermittedCandidateUniverse: true,
            actionable: true,
          },
          evidence: evidence(manifest, domain, `company/${id}`, 'verified_target_company'),
        });
        globalPositiveIndex += 1;
      }
      for (let index = 0; index < block.hardNegativesPerNicheLanguageCell; index += 1) {
        const kind = block.negativeKinds[(index + cellIndex) % block.negativeKinds.length];
        const id = `${manifest.namespace.entityPrefix}-company-${cell}-n${String(index).padStart(3, '0')}`;
        const defaultDomain = `${id}.${manifest.namespace.evidenceDomainSuffix}`;
        const domain = kind === 'shared_domain' && firstPositiveDomain ? firstPositiveDomain : defaultDomain;
        result.push({
          id,
          entityFamilyId: `${manifest.namespace.entityPrefix}-entity-${cell}-n${String(index).padStart(3, '0')}`,
          branchFamilyId: kind === 'branch_collision'
            ? sharedBranchFamily
            : `${manifest.namespace.entityPrefix}-branch-${cell}-n${index}`,
          evidenceDomain: domain,
          niche,
          language,
          city: 'Tashkent',
          negativeKind: kind,
          truth: negativeTruth(kind),
          evidence: evidence(manifest, domain, `company/${id}`, kind),
        });
      }
      cellIndex += 1;
    }
  }
  return result;
}

function generateRankings(manifest: GoldenDatasetManifest): RankingSearchGoldenCase[] {
  const result: RankingSearchGoldenCase[] = [];
  const block = manifest.blocks.rankings;
  for (const niche of manifest.locale.niches) {
    for (const language of manifest.locale.languages) {
      for (let searchIndex = 0; searchIndex < block.searchesPerNicheLanguageCell; searchIndex += 1) {
        const id = `${manifest.namespace.entityPrefix}-search-${niche}-${language}-${String(searchIndex).padStart(3, '0')}`;
        result.push({
          id,
          niche,
          language,
          city: 'Tashkent',
          cards: Array.from({ length: block.candidateCardsPerSearch }, (_, cardIndex) => ({
            id: `${id}-card-${String(cardIndex).padStart(2, '0')}`,
            entityFamilyId: `${manifest.namespace.entityPrefix}-rank-entity-${niche}-${language}-${searchIndex}-${cardIndex}`,
            actionable: cardIndex < block.actionableCardsPerSearch,
          })),
        });
      }
    }
  }
  return result;
}

function generateTelegram(manifest: GoldenDatasetManifest): TelegramGoldenCase[] {
  const result: TelegramGoldenCase[] = [];
  for (const type of manifest.blocks.telegram.types) {
    for (let index = 0; index < manifest.blocks.telegram.endpointsPerType; index += 1) {
      const id = `${manifest.namespace.entityPrefix}-telegram-${type}-${String(index).padStart(3, '0')}`;
      const domain = `${id}.${manifest.namespace.evidenceDomainSuffix}`;
      result.push({
        id,
        endpointFamilyId: `${manifest.namespace.entityPrefix}-tg-family-${type}-${index}`,
        evidenceDomain: domain,
        truthType: type,
        evidence: evidence(manifest, domain, `telegram/${id}`, `telegram_${type}`),
      });
    }
  }
  return result;
}

function generatePeople(manifest: GoldenDatasetManifest): PersonEdgeGoldenCase[] {
  const result: PersonEdgeGoldenCase[] = [];
  const positiveCount = manifest.blocks.people.predictedPositiveEligibleCount;
  const negativeCount = manifest.blocks.people.negativeAffiliationCount;
  for (let index = 0; index < positiveCount + negativeCount; index += 1) {
    const negative = index >= positiveCount;
    const localIndex = negative ? index - positiveCount : index;
    const kind = negative ? 'negative-affiliation' : 'verified-affiliation';
    const id = `${manifest.namespace.entityPrefix}-person-edge-${kind}-${String(localIndex).padStart(3, '0')}`;
    const domain = `${manifest.namespace.entityPrefix}-people-${String(index).padStart(3, '0')}.${manifest.namespace.evidenceDomainSuffix}`;
    result.push({
      id,
      personRef: `${manifest.namespace.entityPrefix}-opaque-person-${String(index).padStart(4, '0')}`,
      entityFamilyId: `${manifest.namespace.entityPrefix}-people-entity-${String(index).padStart(4, '0')}`,
      evidenceDomain: domain,
      negativeAffiliation: negative,
      truth: {
        companyAffiliation: !negative,
        contactBelongsToPerson: !negative,
        currentDecisionMaker: !negative,
        manuallyApproved: !negative,
      },
      evidence: evidence(manifest, domain, `people/${id}`, kind),
    });
  }
  return result;
}

function generatePersonalCtaNegatives(manifest: GoldenDatasetManifest): PersonalCtaGoldenCase[] {
  const result: PersonalCtaGoldenCase[] = [];
  const block = manifest.blocks.personalCtaNegatives;
  for (let index = 0; index < block.count; index += 1) {
    const reason = block.reasons[index % block.reasons.length];
    const id = `${manifest.namespace.entityPrefix}-cta-negative-${String(index).padStart(4, '0')}`;
    const domain = `${manifest.namespace.entityPrefix}-cta-${String(index).padStart(4, '0')}.${manifest.namespace.evidenceDomainSuffix}`;
    result.push({
      id,
      personRef: `${manifest.namespace.entityPrefix}-opaque-cta-person-${String(index).padStart(4, '0')}`,
      entityFamilyId: `${manifest.namespace.entityPrefix}-cta-entity-${String(index).padStart(4, '0')}`,
      evidenceDomain: domain,
      reason,
      personalCtaAllowed: false,
      evidence: evidence(manifest, domain, `cta/${id}`, reason),
    });
  }
  return result;
}

function countDataset(
  companies: CompanyGoldenCase[],
  rankings: RankingSearchGoldenCase[],
  telegram: TelegramGoldenCase[],
  people: PersonEdgeGoldenCase[],
  personalCtaNegatives: PersonalCtaGoldenCase[],
): GoldenDatasetCounts {
  return {
    companies: companies.length,
    rankingSearches: rankings.length,
    rankingCards: rankings.reduce((sum, search) => sum + search.cards.length, 0),
    telegramEndpoints: telegram.length,
    personEdges: people.length,
    personPredictedPositiveEligible: people.filter((entry) => !entry.negativeAffiliation).length,
    personalCtaNegatives: personalCtaNegatives.length,
  };
}

function expandedFreezeMaterial(dataset: Omit<ExpandedGoldenDataset, 'expandedSha256' | 'manifestSha256'>): unknown {
  return {
    datasetVersion: dataset.manifest.datasetVersion,
    split: dataset.manifest.split,
    generatorVersion: dataset.manifest.freeze.generatorVersion,
    counts: dataset.counts,
    companies: dataset.companies,
    rankings: dataset.rankings,
    telegram: dataset.telegram,
    people: dataset.people,
    personalCtaNegatives: dataset.personalCtaNegatives,
  };
}

function assertCounts(actual: GoldenDatasetCounts, expected: GoldenDatasetCounts): void {
  for (const key of Object.keys(expected) as Array<keyof GoldenDatasetCounts>) {
    invariant(actual[key] === expected[key], `${key} count ${actual[key]} does not match frozen ${expected[key]}`);
  }
}

export function computeDatasetFreeze(manifest: GoldenDatasetManifest): DatasetFreezeValues {
  const companies = generateCompanies(manifest);
  const rankings = generateRankings(manifest);
  const telegram = generateTelegram(manifest);
  const people = generatePeople(manifest);
  const personalCtaNegatives = generatePersonalCtaNegatives(manifest);
  const counts = countDataset(companies, rankings, telegram, people, personalCtaNegatives);
  assertCounts(counts, manifest.expectedCounts);
  const partial = { manifest, counts, companies, rankings, telegram, people, personalCtaNegatives };
  return {
    manifestSha256: sha256Canonical(manifestFreezeMaterial(manifest)),
    expandedSha256: sha256Canonical(expandedFreezeMaterial(partial)),
  };
}

export function expandGoldenDataset(
  manifest: GoldenDatasetManifest,
  options: { verifyFreeze?: boolean } = {},
): ExpandedGoldenDataset {
  const companies = generateCompanies(manifest);
  const rankings = generateRankings(manifest);
  const telegram = generateTelegram(manifest);
  const people = generatePeople(manifest);
  const personalCtaNegatives = generatePersonalCtaNegatives(manifest);
  const counts = countDataset(companies, rankings, telegram, people, personalCtaNegatives);
  assertCounts(counts, manifest.expectedCounts);
  const partial = { manifest, counts, companies, rankings, telegram, people, personalCtaNegatives };
  const manifestSha256 = sha256Canonical(manifestFreezeMaterial(manifest));
  const expandedSha256 = sha256Canonical(expandedFreezeMaterial(partial));
  if (options.verifyFreeze !== false) {
    invariant(
      manifest.freeze.expectedManifestSha256 === manifestSha256,
      `manifest checksum mismatch for ${manifest.datasetVersion}`,
    );
    invariant(
      manifest.freeze.expectedExpandedSha256 === expandedSha256,
      `expanded checksum mismatch for ${manifest.datasetVersion}`,
    );
  }
  return { ...partial, manifestSha256, expandedSha256 };
}

export function loadGoldenDataset(path: string): ExpandedGoldenDataset {
  return expandGoldenDataset(readGoldenManifest(path));
}

export function loadGoldenPair(directory: string): { dev: ExpandedGoldenDataset; holdout: ExpandedGoldenDataset } {
  const dev = loadGoldenDataset(resolve(directory, GOLDEN_DEV_MANIFEST));
  const holdout = loadGoldenDataset(resolve(directory, GOLDEN_HOLDOUT_MANIFEST));
  invariant(dev.manifest.split === 'dev', `${GOLDEN_DEV_MANIFEST} must declare the dev split`);
  invariant(holdout.manifest.split === 'holdout', `${GOLDEN_HOLDOUT_MANIFEST} must declare the holdout split`);
  invariant(holdout.manifest.freeze.tuningAllowed === false, 'holdout must prohibit tuning');
  invariant(holdout.manifest.freeze.independentlyLabelled === true, 'holdout must be independently labelled');
  assertNoGoldenLeakage(dev, holdout);
  return { dev, holdout };
}

function entityFamilies(dataset: ExpandedGoldenDataset): Set<string> {
  return new Set([
    ...dataset.companies.map((entry) => entry.entityFamilyId),
    ...dataset.companies.map((entry) => entry.branchFamilyId),
    ...dataset.rankings.flatMap((search) => search.cards.map((entry) => entry.entityFamilyId)),
    ...dataset.telegram.map((entry) => entry.endpointFamilyId),
    ...dataset.people.map((entry) => entry.entityFamilyId),
    ...dataset.personalCtaNegatives.map((entry) => entry.entityFamilyId),
  ]);
}

function evidenceDomains(dataset: ExpandedGoldenDataset): Set<string> {
  return new Set([
    ...dataset.companies.map((entry) => entry.evidenceDomain),
    ...dataset.telegram.map((entry) => entry.evidenceDomain),
    ...dataset.people.map((entry) => entry.evidenceDomain),
    ...dataset.personalCtaNegatives.map((entry) => entry.evidenceDomain),
  ]);
}

function overlap(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((entry) => right.has(entry)).sort();
}

export function assertNoGoldenLeakage(
  selected: ExpandedGoldenDataset,
  counterpart: ExpandedGoldenDataset,
): LeakageGuardResult {
  invariant(selected.manifest.split !== counterpart.manifest.split, 'leakage comparison requires different splits');
  const familyOverlap = overlap(entityFamilies(selected), entityFamilies(counterpart));
  const domainOverlap = overlap(evidenceDomains(selected), evidenceDomains(counterpart));
  invariant(familyOverlap.length === 0, `entity-family leakage detected (${familyOverlap.length} overlaps)`);
  invariant(domainOverlap.length === 0, `evidence-domain leakage detected (${domainOverlap.length} overlaps)`);
  return {
    comparedWithDatasetVersion: counterpart.manifest.datasetVersion,
    entityFamilyOverlap: 0,
    evidenceDomainOverlap: 0,
    passed: true,
  };
}

export function assertPublicSafeSyntheticDataset(dataset: ExpandedGoldenDataset): void {
  invariant(dataset.manifest.freeze.containsRealPersonPii === false, 'manifest must prohibit real-person PII');
  invariant(dataset.manifest.freeze.sourcePolicy === 'synthetic-public-safe-only', 'manifest source policy is unsafe');
  for (const domain of evidenceDomains(dataset)) {
    invariant(domain.endsWith('.invalid'), `non-reserved evidence domain found: ${domain}`);
  }
  const allEvidence = [
    ...dataset.companies.map((entry) => entry.evidence),
    ...dataset.telegram.map((entry) => entry.evidence),
    ...dataset.people.map((entry) => entry.evidence),
    ...dataset.personalCtaNegatives.map((entry) => entry.evidence),
  ];
  invariant(allEvidence.every((entry) => entry.synthetic === true), 'all evidence must be marked synthetic');
}
