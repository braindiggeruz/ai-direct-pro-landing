# pSEO20: useful Uzbek document and practice cohort

Owner authorization: implement and publish the best 20 candidates, preserve existing SEO. Candidate verification completed 2026-11-08; production acceptance is recorded separately in RELEASE.md.

## Delivered scope

- Ten original Uzbek document guides, each with a complete explicitly fictional example, an editable blank, four practical FAQs and DOCX/PDF downloads. Files are free without an account; they are educational examples, not universal official forms.
- Ten Uzbek educational pages with 120 original questions, correct answers, explanations, worked examples and primary sources. Grades 1–3 have genuinely different exercises. Chemistry concepts and calculation practice have separate intents.
- A complete multiplication table and exact rational linear-equation solver work locally. No model request, input telemetry, private-data collection or new backend is introduced by these tools.
- Useful content appears before the AI chat. The shared brand palette is dark with cyan/blue accents. Document download cards appear above the author block. Responsive behavior was tested at 320, 390 and 1440 pixels.
- Twenty ownership pairs and architectural decision A12 in the existing intent manifest. Eight existing guides/hubs gain 21 relevant incoming links; new materials link to their parent and useful siblings. The existing commercial demand freeze is unchanged.

## SEO preservation

`review-release.ts` compares every URL against the preserved, verified predecessor artifact at commit `e85da915a070acc71b7d9b76b5a7a92b1ac08fe4`.

- Sitemap: **330 → 350**, exactly the approved twenty additions; no removal or URL migration.
- Existing titles, descriptions, H1, canonical, robots and hreflang: **330/330 retained**.
- Complete previous content/link contracts: **320/330 unchanged**. Only eight parent guides and the homepage/Uzbek blog lists change.
- No previous internal link is removed. Removing the twenty exact homepage entries restores the entire previous homepage contract. The other nine protected pages retain their contracts.
- A new reviewed protected baseline references the immutable previous revision. No redirect, canonical reassignment, keyword transfer or fabricated language equivalent was used.
- New files have `X-Robots-Tag: noindex` so the useful HTML guides remain the search destinations. Twenty paths join the exact existing download allowlist; the six previous downloads remain intact.
- All new pages have one visible H1, self-canonical, indexable HTML, valid JSON-LD and working internal targets. New recommendations do not automatically displace existing protected-chat article links.

## Validation

- Content review: all 120 answer keys independently checked; four scientific/wording findings corrected; no remaining content blocker. See CONTENT_REVIEW.md.
- Document generation: **150/150** checks, deterministic DOCX/PDF, ZIP/XML, complete extracted text, embedded fonts, no external relationships/macros; six PDF pages visually reviewed. All ten PDFs have two pages.
- Browser QA: **74/74 PASS**, three widths, all twenty pages, downloads, right/wrong/restart behavior, local solver, multiplication selection, no-JS answers and mobile keyboard on new/ordinary chat pages. API calls mocked and off-origin traffic blocked; no real lead or paid AI request sent.
- Engineering review: **1,500/1,500** independent equation cases; no open P0/P1/P2. Found and corrected malformed numeric whitespace, no-JS toolbar visibility, output masking and keyboard scroll position. See ENGINEERING_REVIEW.md.
- Targeted regression set: 185 distinct checks. Initial run: 184 PASS and one pre-existing stale placeholder assertion; unchanged HEAD already included the active-presentation guard. Updated that assertion without changing the console and reran its suite: **25/25 PASS**. All distinct checks now pass, with no skip.
- Web TypeScript, scoped ESLint and SEO audit pass. SEO audit reports no critical issue, orphan page or broken internal link. Compressed chat start is **109,968 bytes**, within its unchanged 110,000-byte limit; the keyboard fix adds eight bytes versus the predecessor. Main/admin/Studio candidate builds succeed; stamping waits for the reviewed baseline and clean implementation commit.

## Architecture and safeguards

`src/shared/pseo20.ts` is an exact cohort registry; no blanket route opt-in. Build-time renderers reuse the established article/quiz infrastructure. `practice.js` is a small bounded parser and local UI, without `eval` or network/storage calls. User-entered results use text nodes, and both input and output are masked for Webvisor.

The only shared chat behavior change scrolls to the actual chat top when the mobile keyboard opens. On ordinary chat pages that remains the document top; on pages with exercises above it, the composer remains visible. A browser regression covers both. No chat prompt, billing, bot routing, webhook, secret, queue, database or API change is part of this cohort.

## Release, measurement and rollback

Use only `npm run build:production` followed by `F:/Claude/gptbot-tools/deploy_runner.py check` and `deploy`, with DR_ROOT pointing to this physical worktree. Preserve the guarded local Wrangler config-discovery fix. After upload, compare exact public HTML/assets, all twenty files, indexation headers, native resource bindings and secret-name fingerprint.

New page indexing, rankings, citations and revenue remain unmeasured. Existing measurement is retained; no new subscription, paid research batch, Meta change or automated publishing queue was created. Review GSC query→URL distribution and usefulness after confirmed recrawl, including parent overlap, before expanding this cohort. Do not interpret zero early traffic as a reason to mass-publish more pages.

Rollback must be a scoped revert on current ancestry and a new guarded build. Do not redeploy an old artifact over unrelated later work, remove existing URLs blindly or discard the prior binding/config fix. Downloads and shared assets use versioned cohort paths.

External evidence: `C:/Users/Borinio/.codex/visualizations/2026/11/08/01a1b921-58ac-72f3-af9a-3684d2e788b4/gptbot-pseo20-20261108`.

Related: [candidate evidence](CANDIDATES.md), [all twenty URLs](URLS.txt), [artifact comparison](artifact-review.json), [content review](CONTENT_REVIEW.md), [engineering review](ENGINEERING_REVIEW.md).
