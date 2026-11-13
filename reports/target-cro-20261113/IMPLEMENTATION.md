# GPTBot.uz target landing CRO — 13 November 2026

Owner requested an autonomous in-place conversion redesign of `/uz/instagram-target-yoqish/`, keeping the ad destination and budget. Source baseline was the live production commit `28dfc6339b4aba5fb7556957137bde3bd22de224`. This release does not write to Meta.

## Changes

- Isolated static renderer and stylesheet for this exact route. Clear launch offer, two generated conceptual images, verified historical EasyBreezy native-form case with period and limits, package contents, early compact enquiry form, process and original FAQ/SEO article.
- Existing title, H1, canonical, hreflang, indexability, body blocks and linked resources remain. No new URL, redirects, backend or database changes.
- Contact and consent remain required. Optional name/task/budget are grouped in an expandable section. Existing acknowledgement, idempotency, duplicate suppression and backend service routing stay intact.
- Diagnostic CTA/form-view/form-start events contain no contact values. Lead remains accepted-response only; repeat receipts do not create another conversion. Source UTM/fbclid are preserved, with bounded numeric Meta object IDs and a landing variant added to the existing metadata contract.
- Generated artwork is labelled as an illustration, not a real client dashboard. Four responsive WebP variants total approximately 154 KB. Prompts and provenance are in `image-provenance.json`.

## Validation before release

- TypeScript project build and scoped ESLint passed.
- Final targeted tests: 9/9 target CRO/Pixel regressions and 57/57 existing lead conversion/form-template tests passed. Scoped events are documented in `EVENT-MAP.md`.
- Broader regression run: 147/149 initially passed. The intended target-only placeholder expectation was updated and its suite passed again. One unrelated legacy test remains failing: `lead-attribution.test.ts` expects the old calculator `requestId: requestIdRef.current` source string. The same failure was reproduced on the unchanged production predecessor; calculator runtime was not modified.
- SEO audit: no critical errors, broken links, or missing hreflang. Ten protected pages unchanged.
- Browser checks at 320, 390 and 1440 px: no overflow, JavaScript errors or missing assets. Form position at 390 px improved from about 14,043 to 1,768 px. Hero and form visually inspected.
- Mocked accepted/error/duplicate/reload scenarios passed. Attribution and tracking were inspected with all API/analytics writes intercepted; no synthetic real lead or Telegram message was sent. These checks do not assert new CRM delivery or conversion uplift.
- Real official Meta SDK serialized all seven intended events with a normal-browser user-agent fixture; every transport was captured and aborted. Its headless-bot filter explains the initial empty transport test. Actual SDK testing also found and fixed automatic extra PageViews on same-document navigation; initial load, form anchor and back/forward now produce one PageView and one accepted Lead.
- Full production build and guarded deployment are mandatory after this commit. Delivery evidence lives in the parent `qa/`, build/check/deploy logs and final release receipt.

## Release and recovery

Use `NODE_OPTIONS=--max-old-space-size=1400`, `npm run build:production`, then `DR_ROOT` pointing to this worktree with `F:/Claude/gptbot-tools/deploy_runner.py check` and `deploy`. Do not use raw Wrangler deployment. Recheck production ancestry before release.

Predecessor Pages deployment: `b90bc6fe-f315-47f8-8019-852ee7d2b162` in `ai-direct-pro-landing`. For recovery, use a guarded rollback/revert based on the then-current production state; do not overwrite intervening releases. No ad restart is needed because the destination URL stays unchanged.

## Measurement

Observe this fixed page cohort using `landing_variant=target_cro_20261113`, separating accepted website enquiries from native forms, qualified leads and sales. Compare landing views to accepted enquiries and qualified outcomes after sufficient new traffic; the prior small sample cannot establish an uplift.
