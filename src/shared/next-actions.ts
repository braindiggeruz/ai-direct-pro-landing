// Next Best Actions engine — central recommendation system for the
// GPTBot Admin SEO Mission Control.
//
// Goal: turn raw audit + draft + autopilot signals into a *ranked* list
// of operator actions, each carrying:
//   - clear title (what to do)
//   - reason (why it matters)
//   - affected entity (URL, draft id, job id)
//   - expected SEO/business effect (qualitative)
//   - risk level (low/medium/high)
//   - one action button (deep link into the right editor / queue)
//
// Priority is computed deterministically from a small impact weight per
// rule, so the cockpit shows the same top-3 across refreshes (which is
// what the operator expects). Nothing here mutates state — the action
// buttons in the UI navigate to the relevant page; the operator decides
// to act.

import type { CockpitStats, Page, BlogArticle } from './types';

export type ActionRisk = 'low' | 'medium' | 'high';

export interface NextBestAction {
  id: string;             // stable id so the UI can deduplicate / dismiss
  title: string;
  reason: string;
  effect: string;
  risk: ActionRisk;
  weight: number;         // higher = more urgent
  action_label: string;
  action_path: string;    // internal admin route
  affected_url?: string;
  affected_draft?: string;
  affected_job?: string;
  category: 'autopilot' | 'drafts' | 'content' | 'links' | 'index' | 'health' | 'config';
}

interface BuildInput {
  audit: (CockpitStats & {
    publishedBlog?: number; blogMissingFaq?: number; blogMissingTitle?: number; blogMissingDescription?: number; blogDuplicateTitle?: number;
  }) | null;
  content: { pages: Page[]; blog: BlogArticle[] } | null;
  drafts: { pending_review: number; needs_revision: number; last_pending_id: string | null; last_pending_admin_url: string | null; last_pending_title: string | null } | null;
  autopilot: { failed: number; in_flight: number; stale_swept: number; last_failed: { id: string; error_code: string | null; error_message: string | null } | null; n8n_webhook_secret_configured: boolean; schedule_mode: string } | null;
  health: {
    sitemap200Xml?: boolean; randomUrl404?: boolean; adminNoindex?: boolean;
    robots200?: boolean; faviconLive?: boolean; sampleImageLive?: boolean;
  } | null;
  sectionsFailed: string[];
}

// Convenience.
function action(a: Omit<NextBestAction, 'id'>, id: string): NextBestAction {
  return { id, ...a };
}

export function buildNextBestActions(input: BuildInput): NextBestAction[] {
  const out: NextBestAction[] = [];

  // 1. Failed cockpit sections show up FIRST as a triage hint.
  for (const sec of input.sectionsFailed) {
    out.push(action({
      title: `Cockpit "${sec}" section failed to load`,
      reason: `The ${sec} loader threw an error during the latest cockpit refresh.`,
      effect: `Some KPIs and queues will be empty until the upstream source recovers.`,
      risk: 'low',
      weight: 950,
      action_label: 'Retry section',
      action_path: '/admin-tools',
      category: 'health',
    }, `section-failed-${sec}`));
  }

  // 2. Autopilot config issues — block the whole one-click flow.
  if (input.autopilot && !input.autopilot.n8n_webhook_secret_configured) {
    out.push(action({
      title: 'N8N_WEBHOOK_SECRET is not configured',
      reason: 'The SEO Autopilot cannot call n8n without the shared webhook secret.',
      effect: 'No new AI drafts can be generated until this is set.',
      risk: 'high',
      weight: 920,
      action_label: 'Open Autopilot',
      action_path: '/admin-tools/seo-autopilot',
      category: 'config',
    }, 'config-n8n-secret'));
  }

  // 3. Last failed autopilot job — surface so the operator can retry.
  if (input.autopilot?.last_failed) {
    const f = input.autopilot.last_failed;
    out.push(action({
      title: `Last SEO Autopilot run failed (${f.error_code || 'error'})`,
      reason: f.error_message || 'See the job detail for the n8n excerpt.',
      effect: 'Retry to generate a fresh RU + UZ bundle; the existing draft inbox is unaffected.',
      risk: 'low',
      weight: 880,
      action_label: 'Open Autopilot',
      action_path: '/admin-tools/seo-autopilot',
      affected_job: f.id,
      category: 'autopilot',
    }, `autopilot-last-failed-${f.id}`));
  }

  // 4. Pending AI drafts — highest-value operator queue.
  if (input.drafts && input.drafts.pending_review > 0) {
    out.push(action({
      title: `${input.drafts.pending_review} AI draft${input.drafts.pending_review > 1 ? 's' : ''} awaiting your review`,
      reason: input.drafts.last_pending_title
        ? `Latest: "${input.drafts.last_pending_title}". RU + UZ packages stay unpublished until you approve them.`
        : 'RU + UZ packages stay unpublished until you approve them.',
      effect: 'Each approved draft adds one indexed article (~ +1 fresh URL in sitemap, +1 internal link target).',
      risk: 'low',
      weight: 870,
      action_label: input.drafts.last_pending_admin_url ? 'Open latest draft' : 'Open Inbox',
      action_path: input.drafts.last_pending_admin_url || '/admin-tools/ai-drafts',
      affected_draft: input.drafts.last_pending_id || undefined,
      category: 'drafts',
    }, `drafts-pending-${input.drafts.last_pending_id || 'any'}`));
  }
  if (input.drafts && input.drafts.needs_revision > 0) {
    out.push(action({
      title: `${input.drafts.needs_revision} draft${input.drafts.needs_revision > 1 ? 's' : ''} marked "needs revision"`,
      reason: 'You flagged these for changes. Editing or relaunching keeps the inbox actionable.',
      effect: 'Resolving revision queue frees the inbox for new Autopilot runs.',
      risk: 'low',
      weight: 700,
      action_label: 'Open Inbox',
      action_path: '/admin-tools/ai-drafts',
      category: 'drafts',
    }, 'drafts-needs-revision'));
  }

  // 5. Audit-driven content actions, sorted by SEO impact.
  if (input.audit) {
    const a = input.audit;

    if ((a.mojibakePages ?? 0) > 0) {
      out.push(action({
        title: `${a.mojibakePages} page${a.mojibakePages! > 1 ? 's' : ''} contain mojibake`,
        reason: 'Pages with corrupted encoding show as gibberish to users and crawlers; publishing is hard-blocked.',
        effect: 'Fixing restores ranking signals for affected URLs.',
        risk: 'medium',
        weight: 960,
        action_label: 'Open pages list',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-mojibake'));
    }

    if ((a.brokenInternalLinks ?? 0) > 0) {
      out.push(action({
        title: `${a.brokenInternalLinks} broken internal links across the site`,
        reason: 'Internal links pointing to missing pages waste crawl budget and confuse Google.',
        effect: 'Fixing every broken link recovers ~1–2% of crawl budget per fix and tightens topical clusters.',
        risk: 'low',
        weight: 820,
        action_label: 'Open Internal Links',
        action_path: '/admin-tools/internal-links',
        category: 'links',
      }, 'audit-broken-links'));
    }

    if ((a.duplicateTitle ?? 0) > 0) {
      out.push(action({
        title: `${a.duplicateTitle} duplicate <title> tag${a.duplicateTitle! > 1 ? 's' : ''}`,
        reason: 'Duplicate titles trigger Google rewrites and cannibalize between pages.',
        effect: 'Differentiating each title clarifies which URL ranks for which intent.',
        risk: 'low',
        weight: 750,
        action_label: 'Open pages list',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-duplicate-title'));
    }

    if ((a.duplicateDescription ?? 0) > 0) {
      out.push(action({
        title: `${a.duplicateDescription} duplicate meta description${a.duplicateDescription! > 1 ? 's' : ''}`,
        reason: 'Duplicate descriptions reduce CTR; Google often rewrites them with random body fragments.',
        effect: 'Unique meta descriptions can lift CTR by 5–15% on cannibal queries.',
        risk: 'low',
        weight: 700,
        action_label: 'Open pages list',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-duplicate-description'));
    }

    if ((a.orphanPages ?? 0) > 0) {
      out.push(action({
        title: `${a.orphanPages} orphan page${a.orphanPages! > 1 ? 's' : ''} (no incoming internal links)`,
        reason: 'Pages with no internal links rank poorly and may be silently dropped from the index.',
        effect: 'Each new link from a strong source page transfers PageRank and improves rankings.',
        risk: 'low',
        weight: 800,
        action_label: 'Open Internal Links',
        action_path: '/admin-tools/internal-links',
        category: 'links',
      }, 'audit-orphans'));
    }

    if ((a.missingFaq ?? 0) > 0) {
      out.push(action({
        title: `${a.missingFaq} money/blog page${a.missingFaq! > 1 ? 's' : ''} missing FAQ`,
        reason: 'FAQ blocks unlock FAQPage rich results and provide internal anchoring for long-tail keywords.',
        effect: 'Each money page with a 4+ FAQ block tends to rank for 10–30 extra long-tail queries.',
        risk: 'low',
        weight: 760,
        action_label: 'Open pages list',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-missing-faq'));
    }

    if ((a.missingTitle ?? 0) > 0 || (a.missingDescription ?? 0) > 0 || (a.missingH1 ?? 0) > 0) {
      const total = (a.missingTitle ?? 0) + (a.missingDescription ?? 0) + (a.missingH1 ?? 0);
      out.push(action({
        title: `${total} missing SEO field${total > 1 ? 's' : ''} (title/description/H1)`,
        reason: 'These pages cannot rank for any keyword without their core meta fields.',
        effect: 'Filling the missing fields unlocks indexing eligibility immediately.',
        risk: 'low',
        weight: 770,
        action_label: 'Open pages list',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-missing-fields'));
    }

    if ((a.missingCanonical ?? 0) > 0) {
      out.push(action({
        title: `${a.missingCanonical} page${a.missingCanonical! > 1 ? 's' : ''} without canonical URL`,
        reason: 'Missing canonical lets Google choose its own URL — often the wrong one.',
        effect: 'Adding canonical = one less ranking surprise per affected URL.',
        risk: 'low',
        weight: 650,
        action_label: 'Open pages list',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-missing-canonical'));
    }

    if ((a.ruUzPairsMissing ?? 0) > 0) {
      out.push(action({
        title: `${a.ruUzPairsMissing} RU↔UZ pair${a.ruUzPairsMissing! > 1 ? 's' : ''} incomplete`,
        reason: 'Without the locale pair, hreflang is broken and one of the two languages loses traffic.',
        effect: 'Restoring the pair lifts the weaker locale by 10–20% over a month.',
        risk: 'low',
        weight: 640,
        action_label: 'Open pages list',
        action_path: '/admin-tools/pages',
        category: 'content',
      }, 'audit-hreflang-pairs'));
    }

    if ((a.publishedPages ?? 0) > 0 && (a.pagesInSitemap ?? 0) < a.publishedPages) {
      out.push(action({
        title: `${a.publishedPages - a.pagesInSitemap} published page${a.publishedPages - a.pagesInSitemap > 1 ? 's' : ''} excluded from sitemap`,
        reason: 'Published but robotsIndex=false → not in sitemap.xml → Google may not crawl them.',
        effect: 'Restoring sitemap inclusion = back into the indexing queue.',
        risk: 'medium',
        weight: 780,
        action_label: 'Open pages list',
        action_path: '/admin-tools/pages',
        category: 'index',
      }, 'audit-sitemap-mismatch'));
    }
  }

  // 6. Live site health failures.
  if (input.health) {
    if (input.health.sitemap200Xml === false) {
      out.push(action({
        title: 'sitemap.xml not returning 200 + XML',
        reason: 'Google needs sitemap.xml to discover new URLs.',
        effect: 'Restoring it accelerates indexation of new drafts.',
        risk: 'high',
        weight: 930,
        action_label: 'Open Global SEO',
        action_path: '/admin-tools/settings',
        category: 'index',
      }, 'health-sitemap'));
    }
    if (input.health.robots200 === false) {
      out.push(action({
        title: 'robots.txt not returning 200',
        reason: 'Without robots.txt, crawl directives are ambiguous.',
        effect: 'Restoring it makes index behaviour predictable.',
        risk: 'medium',
        weight: 870,
        action_label: 'Open Global SEO',
        action_path: '/admin-tools/settings',
        category: 'index',
      }, 'health-robots'));
    }
    if (input.health.randomUrl404 === false) {
      out.push(action({
        title: 'Random unknown URL does not return 404',
        reason: 'Soft-404s waste crawl budget and confuse Google.',
        effect: 'Fixing improves crawl efficiency site-wide.',
        risk: 'medium',
        weight: 720,
        action_label: 'Open Redirects',
        action_path: '/admin-tools/redirects',
        category: 'health',
      }, 'health-soft-404'));
    }
    if (input.health.adminNoindex === false) {
      out.push(action({
        title: '/admin-tools/ is not noindex',
        reason: 'Admin pages should never be in the index.',
        effect: 'Privacy + crawl-budget protection.',
        risk: 'low',
        weight: 600,
        action_label: 'Open Global SEO',
        action_path: '/admin-tools/settings',
        category: 'health',
      }, 'health-admin-noindex'));
    }
  }

  // Sort by weight descending and cap at 7 to fit the cockpit panel.
  out.sort((a, b) => b.weight - a.weight);
  return out.slice(0, 7);
}
