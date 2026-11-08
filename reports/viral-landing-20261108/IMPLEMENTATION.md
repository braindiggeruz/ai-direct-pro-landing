# Viral campaign landing · 2026-11-08

Owner-authorized creation and publication of `/ru/blog/ii-zahvatit-mir-nachnem-s-zayavok/`, plus five Meta creative concepts. Advertising launch/budget changes are outside this release.

## Implementation

- A static Russian campaign article, custom responsive ivory/charcoal/cyan layout, five original generated illustrations, lightweight WebP sizes and 1200×630 social image.
- Three fictional story acts lead to the existing local teaching demo, an accurately scoped AI-bot offer from 1,990,000 UZS for one channel, and the existing real lead intake form.
- The campaign renderer and form opt-in match one exact URL. Existing API, consent, attribution, idempotency, success-acknowledgement guard and outbox are reused. No backend, payment, webhook, schema migration or Meta configuration changed.
- Contact is requested only in the real form. The demo has predetermined answers, no network/PII collection, no AI-model invocation and no real booking. An administrator confirms requested time.
- All original 329 sitemap URLs remain. New total: 330. Only the homepage and RU blog listing gain the new entry; protected revision is immutable and points to its predecessor.
- Five concepts exported in 1080×1350 and 1080×1920, editable HTML/CSS, originals/prompts/fonts, contact sheet, copy and per-concept destination UTM URLs. Delivery ZIPs live in the workspace artifact directory.

## Validation before release

Web TypeScript build and scoped ESLint passed. Main, admin and Studio candidate builds passed. Existing lead/demo/conversion/related-link suites: 64 passed, zero skipped. SEO regression suites: 80 passed, zero skipped. New campaign contract tests: 4 passed. SEO audit has no critical/duplicate/broken-link/orphan findings; ten protected contracts pass. All 330 JSON-LD blocks parse.

Browser QA uses mocked intake and blocked external traffic. It verifies widths 320/390/1440, demo choices, error states, literal server acknowledgement, campaign attribution and conversion deduplication. All ten browser checks passed at 320/390/1440: no overflow, zero axe violations, five mocked requests and exactly one conversion event. Production receipts are recorded after completion in RELEASE.md; do not infer delivery from this candidate note.

## Maintenance and rollback

The article JSON owns metadata, FAQ, sources and story blocks. `scripts/viral-article.ts` owns campaign composition and concise hero/demo/offer copy; future changes must keep these consistent. Page-only styles are `public/assets/campaigns/ai-routine/landing.css`. No global CSS changes are intended.

Rollback uses a scoped revert reviewed against current live ancestry; never upload the predecessor artifact over unrelated later production changes. The verified predecessor is a52cc9420aafe582485921196af5317208f82878 / artifact b5df41ddbe4ca1778658a59a8315a791ecc8b81ac3996c5e0fc0c48b6d8ef207. Preserve prior immutable SEO revisions and introduce a reviewed successor if reversing the automatic homepage entry.

No real customer lead was submitted by QA. Successful local tests and a public release do not prove advertising conversions or revenue.
