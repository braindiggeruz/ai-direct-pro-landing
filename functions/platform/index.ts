// Platform root barrel. Implementation modules (events bus, orgs, ai, …)
// appear here in their own stages; P0.1 exposes contracts only.
// NOTE (Cloudflare Pages safety): files under functions/ become routes ONLY
// via onRequest* exports; this module must never export such names — the
// boundary checker enforces it.
export * from './contracts';
export * from './events';
export * from './identity';
export * from './orgs';
export * from './ai';
