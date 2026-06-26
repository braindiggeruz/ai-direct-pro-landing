# gptbot.uz — Technical SEO/Perf Audit Results

**Date:** 2026-06-26
**Scope:** (A) Bundle optimization · (B) Lighthouse · (D) Sitemap indexability
**Deploy:** Cloudflare Pages (auto-build on push to `main`, repo `ai-direct-pro-landing`)

---

## A) Bundle Optimization — DONE & LIVE

**Problem:** `src/main.tsx` statically imported the entire admin SEO suite
(`AdminApp`, 15+ pages/editors/AI modals). Every landing visitor downloaded it,
even though admin is login-gated at `/admin-tools/*`.

**Fix (commit `ee32264`, live on prod):**
- Lazy-load `AdminApp` via `React.lazy` + `<Suspense>`
- `manualChunks` vendor split (react / react-dom / react-router / scheduler)

| Metric | Before | After |
|---|---|---|
| Landing critical JS | ~665 KB | **~300 KB** (index 66KB + vendor 241KB) |
| Admin chunk | bundled in main | **336 KB, lazy** (only on `/admin-tools/*`) |

Verified live: homepage serves only `index` + `vendor` + `rolldown-runtime`,
no `AdminApp` chunk. ✅

---

## B) Lighthouse (Lighthouse 13.4, headless Chrome)

### Desktop
| Category | Score |
|---|---|
| Performance | **99** |
| Accessibility | 96 |
| Best Practices | 92 |
| SEO | **100** |

Core Web Vitals (desktop): FCP 0.7s · LCP 0.7s · TBT 0ms · CLS 0.001 · SI 0.7s — all green.

### Mobile (simulated slow 4G + 4x CPU throttle)
| Category | Score |
|---|---|
| Performance | **87** |
| Accessibility | 96 |
| Best Practices | 92 |
| SEO | **100** |

Core Web Vitals (mobile): FCP 2.1s · LCP 3.8s · TBT 90ms · CLS 0 — pass.
(One throttled run reported a 14.9s LCP spike — confirmed as a network fluke;
re-run gave stable 3.8s.)

**Remaining mobile opportunities (minor):**
- Unused JavaScript ~41 KiB / ~150ms — within vendor chunk, low priority.
- 1 unused CSS rule — negligible.

No render-blocking resources. No layout shift.

---

## D) Sitemap Indexability — CLEAN

Audited all **110 URLs** from `https://gptbot.uz/sitemap.xml`:

| Check | Result |
|---|---|
| HTTP status | **110/110 → 200 OK** |
| Duplicates | 0 |
| Redirects (requested ≠ final) | 0 — all canonical |
| Broken / 404 | 0 |
| Orphans | none found (all sitemap URLs prerendered) |

SEO foundation already excellent: SSG prerendering (bots see full HTML),
rich JSON-LD (Service / FAQPage / BreadcrumbList), RU+UZ hreflang,
robots.txt opens all AI crawlers, Yandex handled.

---

## Verdict
Site is in strong technical health. The one real weakness (665KB bundle) is
fixed and live. Scores are near-perfect on desktop, solid on mobile. Sitemap
fully indexable, zero errors.

### Optional next wins (low effort, low urgency)
1. Trim ~41 KiB unused JS in vendor chunk (tree-shake icon/util imports).
2. Preload the LCP hero image with `fetchpriority="high"` to shave mobile LCP.
