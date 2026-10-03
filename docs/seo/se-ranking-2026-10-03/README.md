# GPTBot.uz: SEO candidate, 3 October 2026

## Scope and baseline

Prepared from production-matching commit `9a8b9ff0609c91835524d83d07b40e20d400dc1f` in branch `seo/gpt-evidence-20261003`. This is an isolated, unpublished candidate. The unrelated Agents Platform state and handoff are not advanced by this SEO work.

The 3–30 September GSC property totals were 1,338 clicks and 124,315 impressions worldwide; Uzbekistan contributed 1,109 clicks and 112,886 impressions. These observations predate this candidate. They cannot establish its effect. Query/page rows are an incomplete, differently aggregated view of the same property, not market search volumes.

GSC URL Inspection returned `PASS` and a self Google canonical for nine sampled URLs. The public audit found no critical indexing blocker in its initial 27-page sample. SE Ranking authentication works; its Uzbekistan domain/AI databases returned no usable metrics for this target. Missing provider coverage is not evidence of no demand. GA4 returned permission denied, so conversion results are unavailable.

## Changes

- RU and UZ AI-chat guides use the existing informational page renderer and Article factory instead of advertising the guide itself as a Service. Existing author, dates, URL, title, H1, language alternates and body remain intact. Commercial sticky-call UI is no longer inherited by these two guides.
- The existing RU article about chatting with AI now provides three practical prompt examples with verification steps, cites primary sources, removes unsupported comparative/free/speed claims, and links readers to the actual RU chat. The business-bot CTA remains in its dedicated section. The article URL, title, H1, publication date and intent ownership stay intact; description and modification date reflect the substantial update.
- The rendered-guide regression test checks Article semantics, author and date consistency, canonical, reciprocal language alternates, breadcrumbs and chat CTA. It is included in the default test command and can be run directly after a build.

There are no changes to payment, authentication, chat limits, provider routing, Telegram, data storage, prices, existing page ownership or the protected-ten baseline.

## Validation completed before commit

- `npx tsc -b` passed.
- `npm run build:fast` passed, including all public prerender outputs and 290 sitemap entries.
- Targeted tests: **62 passed, 0 failed, 0 skipped** across `ai-chat-guide-schema`, `seo-page-integrity`, `seo-content-guards`, `seo-link-graph`, `seo-intent-manifest`, `blog-related-links`, `chat-entry` and `seo-protection`.
- `npm run seo:audit`: no critical errors.
- `npx tsx scripts/seo-protection.ts check`: **10/10 unchanged**.
- ESLint for the new test and `git diff --check` passed; changed runtime/test inputs passed the repository secret scanner.
- Isolated Chrome rendering: three changed URLs at widths 390 and 1365, **6/6 passed**, one H1, no horizontal overflow, no page exceptions and no failed eager images. The article renders its three examples, primary sources and new modification date. External requests were blocked; no real chat, form or payment was submitted.

The production build must be run after committing its reviewed inputs so that the release stamp records this commit. The pre-commit production build correctly refused to stamp uncommitted runtime files. A successful stamp is not a deployment.

## Release and measurement handoff

After commit, run `npm run build:production`, then use the established guarded runner with `DR_ROOT` pointing at this worktree for `check`. Push/publication requires the owner's command under the repository's `AGENTS.md`; no raw Wrangler upload.

After any approved publication, verify the live release manifest, Article markup on both guides, the updated RU article, mobile rendering and the protected-ten contract. Keep the predecessor artifact/commit as the rollback reference; do not overwrite newer concurrent production changes.

The high-traffic login/download/chat pages already received intent changes on 30 September–1 October. Preserve those changes while evaluating comparable 14/28-day windows after crawl. For this article, compare its query/page/device results over a full post-indexing 28-day window with the current baseline (4 clicks, 405 impressions, 0.99% CTR, average position 11.63, all countries). Confirm conversion instrumentation and GA4 access before attributing business results.

## Local evidence

Private raw API responses, SE Ranking cost ledger, GSC exports, screenshots, full audit and strategy files are kept outside Git at `F:/Claude/gptbot-seo-evidence-20261003/`. This path is local to the owner's machine. Credentials and guest project links are not part of this candidate.
