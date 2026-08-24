export const ADMIN_ROUTE_PATHS = {
  login: 'login',
  pages: 'pages',
  pageNew: 'pages/new',
  pageEdit: 'pages/:locale/:slug',
  blog: 'blog',
  blogNew: 'blog/new',
  blogEdit: 'blog/:locale/:slug',
  drafts: 'ai-drafts',
  draftDetail: 'ai-drafts/:id',
  seoAutopilot: 'seo-autopilot',
  leadRadar: 'lead-radar',
  internalLinks: 'internal-links',
  seoBooster: 'seo-booster',
  indexNow: 'indexnow',
  redirects: 'redirects',
  settings: 'settings',
  // P3.1 Owner Control Center. Platform-owner operations live under a distinct
  // prefix so the SEO admin surface and the platform surface never share a
  // route or an authorization decision.
  ownerOverview: 'agents',
  ownerStores: 'agents/stores',
  ownerStoreDetail: 'agents/stores/:storeId',
  ownerOrders: 'agents/orders',
  ownerHandoffs: 'agents/handoffs',
  ownerAutomation: 'agents/automation',
  ownerAudit: 'agents/audit',
  ownerPilot: 'agents/pilot',
  fallback: '*',
} as const;

export const ADMIN_HOME = '/admin-tools';
