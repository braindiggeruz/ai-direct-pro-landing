import type { LeadRadarSearchInput } from '../../../src/shared/lead-radar';
import { OpenStreetMapLeadSource } from './sources';
import { mergeSourceYield, type SourceYieldMap } from './source-yield';
import { TwoGisLeadSource, type TwoGisEnvironment } from './two-gis-source';
import type { LeadRadarDiscoveryResult, LeadRadarGeocodeStore, LeadRadarSource, SourceCandidate } from './types';
import { normalizeCompanyKey } from './validation';

/** Everything the optional catalog sources read from the environment. A missing
 *  key is a normal state, not an error: the source then simply does not run. */
export type LeadRadarSourceEnvironment = TwoGisEnvironment;

/**
 * Sources that are actually usable with this environment.
 *
 * Order matters only for reporting: discovery fans out in parallel and merges
 * afterwards. 2GIS is appended rather than replacing OSM because it is an
 * *additional* catalog, not a better one — OSM carries the public business
 * record that the phone-ownership proof depends on, while 2GIS carries the
 * denser contact data. Losing either one costs leads.
 */
export function configuredLeadRadarSources(
  geocodeStore: LeadRadarGeocodeStore | undefined,
  env: LeadRadarSourceEnvironment,
): LeadRadarSource[] {
  const sources: LeadRadarSource[] = [new OpenStreetMapLeadSource(geocodeStore)];
  if (env.TWOGIS_API_KEY?.trim()) sources.push(new TwoGisLeadSource(env));
  return sources;
}

/** Two coordinates closer than this describe the same shopfront, not two
 *  businesses. Roughly one city block; chain branches sit further apart. */
const SAME_PLACE_METRES = 150;

function parseCoordinates(candidate: SourceCandidate): { lat: number; lon: number } | null {
  for (const item of candidate.evidence) {
    if (item.fieldPath !== 'locations.coordinates') continue;
    const match = /^(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(item.value);
    if (!match) continue;
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
  }
  return null;
}

/** Equirectangular distance in metres. At city scale the curvature error is
 *  metres, far below the 150 m threshold it is compared against. */
function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const meanLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dLat = (b.lat - a.lat) * 111_320;
  const dLon = (b.lon - a.lon) * 111_320 * Math.cos(meanLat);
  return Math.hypot(dLat, dLon);
}

/**
 * Identity key for cross-source merging.
 *
 * Two catalogs describing one company will disagree on almost every optional
 * field — 2GIS writes «Тошкент», OSM writes «Ташкент», one has the landline,
 * the other the mobile — so the key uses only what both must agree on: the
 * business name and the city. Same name in the same city but a different
 * street is a branch, and branches must stay separate; hence the place check
 * below rather than a name-only collapse.
 */
function identityKey(candidate: SourceCandidate): string {
  return `${normalizeCompanyKey(candidate.name)}:${normalizeCompanyKey(candidate.city)}`;
}

/** Same business? True when the address text matches, or when both rows carry
 *  coordinates within one block. A side missing both signals is treated as the
 *  same business: catalogs routinely omit the address, and splitting a company
 *  in two over a missing field is the worse error — it duplicates an outreach
 *  row, which the operator cannot undo from the lead list. */
function samePlace(a: SourceCandidate, b: SourceCandidate): boolean {
  const addressA = a.address ? normalizeCompanyKey(a.address) : null;
  const addressB = b.address ? normalizeCompanyKey(b.address) : null;
  if (addressA && addressB) return addressA === addressB;
  const pointA = parseCoordinates(a);
  const pointB = parseCoordinates(b);
  if (pointA && pointB) return metresBetween(pointA, pointB) <= SAME_PLACE_METRES;
  // One side has a place, the other has none: accept only if the weak side
  // still names the same street, or if it carries no place data at all.
  return !addressA && !addressB && !pointA && !pointB;
}

/** Evidence ids must stay unique inside a candidate, or the fail-closed
 *  evidence checks downstream see a row referencing an id twice. */
function dedupeEvidence(candidates: SourceCandidate[]): SourceCandidate['evidence'] {
  const seen = new Set<string>();
  const merged: SourceCandidate['evidence'] = [];
  for (const candidate of candidates) {
    for (const item of candidate.evidence) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

function firstPresent<T>(pick: (candidate: SourceCandidate) => T | null, candidates: SourceCandidate[]): T | null {
  for (const candidate of candidates) {
    const value = pick(candidate);
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

/**
 * Merge the same company as seen by two catalogs into one row.
 *
 * Why this exists: without it, 2GIS and OSM each produce a candidate for the
 * same business with different phone numbers, so `sourceCandidateCanonicalKey`
 * — which keys on the phone when no verified website exists — files them as two
 * companies. The operator then sees one business twice and may message it
 * twice. Merging first means the union of both catalogs lands on a single row.
 *
 * Field precedence is by evidence count, not by source: the row that knows more
 * about the company is the better description of it. Contacts are the
 * exception — every distinct phone, messenger and email is kept as evidence,
 * because `contactCandidatesForLead` reads them from the evidence array and a
 * second number is a second chance at reaching the business.
 */
export function mergeCrossSourceCandidates(candidates: readonly SourceCandidate[]): SourceCandidate[] {
  const groups = new Map<string, SourceCandidate[]>();
  for (const candidate of candidates) {
    const key = identityKey(candidate);
    const bucket = groups.get(key);
    if (bucket) bucket.push(candidate);
    else groups.set(key, [candidate]);
  }

  const merged: SourceCandidate[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      merged.push(bucket[0]!);
      continue;
    }
    // Split into distinct places: same name + city can still be two branches.
    const places: SourceCandidate[][] = [];
    for (const candidate of bucket) {
      const slot = places.find((group) => group.some((member) => samePlace(member, candidate)));
      if (slot) slot.push(candidate);
      else places.push([candidate]);
    }
    for (const group of places) {
      if (group.length === 1) {
        merged.push(group[0]!);
        continue;
      }
      const ranked = [...group].sort((a, b) => b.evidence.length - a.evidence.length);
      const primary = ranked[0]!;
      const website = firstPresent((candidate) => candidate.website, ranked);
      // Prefer a Telegram contact that names a username: it is the only one
      // that can be looked up. `mergeTelegram` keeps the better of the two.
      const telegram = ranked
        .map((candidate) => candidate.telegramContact)
        .filter((item): item is NonNullable<SourceCandidate['telegramContact']> => Boolean(item))
        .sort((a, b) => b.confidence - a.confidence || Number(Boolean(b.username)) - Number(Boolean(a.username)))[0]
        ?? null;
      merged.push({
        sourceId: primary.sourceId,
        sourceUrl: firstPresent((c) => c.sourceUrl, ranked) ?? primary.sourceUrl,
        name: primary.name,
        category: firstPresent((c) => (c.category && c.category !== c.name ? c.category : null), ranked) ?? primary.category,
        city: primary.city,
        country: primary.country,
        address: firstPresent((c) => c.address, ranked),
        website,
        phone: firstPresent((c) => c.phone, ranked),
        genericEmail: firstPresent((c) => c.genericEmail, ranked),
        telegramUrl: telegram && (telegram.type === 'human' || telegram.type === 'business')
          ? telegram.url
          : firstPresent((c) => c.telegramUrl, ranked),
        telegramContact: telegram,
        decisionMakers: ranked.flatMap((candidate) => candidate.decisionMakers),
        // Enrichment follows the merged row, not the winning side: a company
        // whose website only 2GIS knows about still has to be crawled, even
        // though the OSM row that won the merge had no site at all. Already
        // enriched work is never re-queued.
        enrichmentStatus: website !== null && primary.enrichmentStatus !== 'enriched'
          ? 'pending'
          : primary.enrichmentStatus,
        enrichmentReason: website !== null && primary.enrichmentStatus !== 'enriched'
          ? null
          : primary.enrichmentReason ?? null,
        enrichmentAttempts: Math.min(...group.map((candidate) => candidate.enrichmentAttempts ?? 0)),
        evidence: dedupeEvidence(ranked),
        signals: dedupeEvidence(ranked).length === 0
          ? []
          : ranked.flatMap((candidate) => candidate.signals).filter((signal, index, all) => (
            all.findIndex((other) => other.type === signal.type && other.label === signal.label) === index
          )),
      });
    }
  }
  return merged;
}

/** Fan out to every source in parallel. One catalog failing must never hide the
 *  others — a 2GIS outage still leaves a complete OSM result, and the operator
 *  learns about the outage from the warning instead of from missing leads. */
export async function fanOutDiscovery(
  sources: readonly LeadRadarSource[],
  input: LeadRadarSearchInput,
): Promise<{
  candidates: SourceCandidate[];
  warnings: string[];
  /** Rejection reasons, in source order. Kept so the caller can surface the
   *  real cause instead of a generic `discovery_failed`. */
  errors: unknown[];
  failures: number;
  yieldBySource: SourceYieldMap | undefined;
}> {
  const results = await Promise.allSettled(sources.map((source) => source.discover(input)));
  const fulfilled = results.filter((result): result is PromiseFulfilledResult<LeadRadarDiscoveryResult> => result.status === 'fulfilled');
  const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
  const warnings = fulfilled.flatMap((result) => result.value.sourceWarnings);
  const perSource = fulfilled.map((result) => result.value.candidates);
  // Merging is a cross-catalog operation and only makes sense as one. With a
  // single source it could only ever remove rows: two businesses sharing a name
  // in one city, neither carrying an address or a coordinate, would collapse
  // into one lead. Guarding here keeps a one-source run bit-identical to the
  // behaviour that shipped before 2GIS existed.
  const candidates = perSource.length > 1
    ? mergeCrossSourceCandidates(perSource.flat())
    : (perSource[0] ?? []);
  const yieldMaps = fulfilled
    .map((result) => result.value.sourceYield)
    .filter((map): map is SourceYieldMap => Boolean(map));
  return {
    candidates,
    warnings,
    errors,
    failures: errors.length,
    yieldBySource: yieldMaps.length > 0 ? mergeSourceYield(...yieldMaps) : undefined,
  };
}
