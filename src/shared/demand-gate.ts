// Demand gate for new indexable commercial pages.
//
// The site accumulated ~140 indexable pages aimed at a keyword cluster that
// measures roughly 80 searches a month, while the clusters with four- and
// five-figure volume had two pages between them. Depth was added to pages that
// had nothing to rank for. This gate makes the demand explicit before a new
// page can ship: either the target keyword has a recorded volume, or the page
// stays a draft.
//
// Pages created before the policy's effectiveFrom are grandfathered — they are
// handled by the consolidation map, not by a build failure.
import type { Page } from './types';

export interface DemandPolicy {
  policyVersion: number;
  effectiveFrom: string;
  scope: { pageTypes: string[] };
  frozenClusters: { id: string; reason: string; keywordPatterns: string[] }[];
  approvedKeywords: { keyword: string; volumePerMonth: number }[];
}

export interface DemandViolation {
  url: string;
  primaryKeyword: string;
  rule: 'frozen-cluster' | 'unmeasured-keyword';
  detail: string;
}

export function evaluateDemandGate(pages: Page[], policy: DemandPolicy): DemandViolation[] {
  const approved = new Set(policy.approvedKeywords.map((k) => k.keyword.toLowerCase()));
  const scoped = new Set(policy.scope.pageTypes);
  const violations: DemandViolation[] = [];

  for (const page of pages) {
    if (page.status !== 'published' || page.robotsIndex === false) continue;
    if (!scoped.has(page.pageType)) continue;

    const created = (page.createdAt || '').slice(0, 10);
    if (!created || created < policy.effectiveFrom) continue;

    const keyword = (page.primaryKeyword || '').toLowerCase();
    const frozen = policy.frozenClusters.find((cluster) =>
      cluster.keywordPatterns.some((pattern) => new RegExp(pattern, 'i').test(keyword)),
    );

    if (frozen) {
      violations.push({
        url: page.url,
        primaryKeyword: page.primaryKeyword || '',
        rule: 'frozen-cluster',
        detail: `inside the frozen "${frozen.id}" cluster — ${frozen.reason}`,
      });
    } else if (!approved.has(keyword)) {
      violations.push({
        url: page.url,
        primaryKeyword: page.primaryKeyword || '',
        rule: 'unmeasured-keyword',
        detail: 'no recorded search volume — measure it and add it to content/seo/demand-policy.json, or ship the page as a draft',
      });
    }
  }

  return violations;
}
