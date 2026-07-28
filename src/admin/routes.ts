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
  internalLinks: 'internal-links',
  seoBooster: 'seo-booster',
  indexNow: 'indexnow',
  redirects: 'redirects',
  settings: 'settings',
  fallback: '*',
} as const;

export const ADMIN_HOME = '/admin-tools';
