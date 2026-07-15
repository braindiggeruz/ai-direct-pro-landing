// Generate an internal-link plan + orphan-risk plan for one planned topic.
//
// Outputs:
//   * outgoing: ≥ 2 contextual links to existing pages in the inventory
//                (always 1 to target money page when set).
//   * incoming_proposals: ≥ 2 existing pages where we recommend inserting
//                          a contextual anchor pointing at the planned topic.
//   * cluster: best-guess cluster key (industry/audience/channel/modifier).
//
// All proposals are advisory — they are written to plan_items.link_plan_json
// and surfaced to the reviewer. NOTHING is applied to other pages without
// explicit approval (handled outside this module).

import type { ContentInventory, ContentInventoryItem, IntentFingerprint } from '../../../src/shared/intent-guard';
import type { TopicPlanItem } from '../../../src/shared/intent-guard';
import { trigramSim, jaccard } from './deterministic';

function tokens(s: string | null | undefined): string[] {
  return (s || '').toLowerCase().split(/\W+/u).filter((w) => w.length > 2);
}

function pickClusterKey(fp: IntentFingerprint): string {
  // Order of fall-through: industry → audience → channel → modifier → entity
  if (fp.industry !== 'none') return `industry:${fp.industry}`;
  if (fp.audience !== 'none') return `audience:${fp.audience}`;
  if (fp.channel  !== 'none') return `channel:${fp.channel}`;
  if (fp.modifier !== 'none') return `modifier:${fp.modifier}`;
  return `entity:${fp.primary_entity}`;
}

function relevanceScore(
  topic: { fingerprint: IntentFingerprint; primary_keyword: string },
  item: ContentInventoryItem,
): number {
  let s = 0;
  if (item.fingerprint.industry === topic.fingerprint.industry && item.fingerprint.industry !== 'none') s += 25;
  if (item.fingerprint.audience === topic.fingerprint.audience && item.fingerprint.audience !== 'none') s += 18;
  if (item.fingerprint.channel  === topic.fingerprint.channel  && item.fingerprint.channel  !== 'none') s += 12;
  if (item.fingerprint.modifier === topic.fingerprint.modifier && item.fingerprint.modifier !== 'none') s += 10;
  s += jaccard(tokens(topic.primary_keyword), tokens(item.target_keyword)) * 20;
  s += trigramSim(topic.primary_keyword, item.title) * 15;
  return s;
}

export interface LinkPlan {
  outgoing: Array<{ target: string; anchor: string; reason: string }>;
  incoming_proposals: Array<{ source_url: string; anchor: string; reason: string }>;
  cluster: string;
}

export function buildLinkPlan(
  topic: Pick<TopicPlanItem, 'fingerprint' | 'primary_keyword' | 'target_money_page' | 'planned_title' | 'locale'>,
  inventory: ContentInventory,
): LinkPlan {
  const cluster = pickClusterKey(topic.fingerprint);
  const sameLocaleItems = inventory.items
    .filter((it) => it.locale === topic.locale && (it.source_type === 'money_page' || it.source_type === 'blog'))
    .map((it) => ({ it, score: relevanceScore({ fingerprint: topic.fingerprint, primary_keyword: topic.primary_keyword }, it) }))
    .sort((a, b) => b.score - a.score);

  const outgoing: LinkPlan['outgoing'] = [];
  // Always include the target money page first when set + present in inventory.
  if (topic.target_money_page) {
    const mp = sameLocaleItems.find((x) => x.it.source_type === 'money_page' && x.it.url === topic.target_money_page);
    if (mp) outgoing.push({ target: mp.it.url || topic.target_money_page, anchor: mp.it.title || topic.target_money_page, reason: 'основная money page' });
    else outgoing.push({ target: topic.target_money_page, anchor: topic.planned_title.split(/[—-]/)[0].trim() || topic.target_money_page, reason: 'основная money page' });
  }
  for (const cand of sameLocaleItems) {
    if (outgoing.length >= 4) break;
    if (outgoing.some((o) => o.target === cand.it.url)) continue;
    if (!cand.it.url) continue;
    outgoing.push({
      target: cand.it.url,
      anchor: cand.it.title,
      reason: cand.it.source_type === 'money_page' ? 'релевантная money page' : 'релевантная статья кластера',
    });
  }

  const incoming_proposals: LinkPlan['incoming_proposals'] = [];
  // Pick blog + money pages with highest relevance that DON'T already
  // link to anything matching planned title's slug-ish tokens.
  const topicTokens = new Set(tokens(topic.planned_title).concat(tokens(topic.primary_keyword)));
  for (const cand of sameLocaleItems) {
    if (incoming_proposals.length >= 3) break;
    if (!cand.it.url) continue;
    if (outgoing.some((o) => o.target === cand.it.url)) continue;
    // skip if the source already links to a URL containing topic tokens
    const alreadyLinks = (cand.it.internal_link_targets || []).some((t) => {
      const ttoks = tokens(t);
      return ttoks.some((x) => topicTokens.has(x));
    });
    if (alreadyLinks) continue;
    incoming_proposals.push({
      source_url: cand.it.url,
      anchor: topic.planned_title,
      reason: cand.it.source_type === 'money_page'
        ? 'усилит money page внутренней перелинковкой'
        : 'усилит тематический кластер',
    });
  }

  return { outgoing: outgoing.slice(0, 5), incoming_proposals: incoming_proposals.slice(0, 3), cluster };
}
