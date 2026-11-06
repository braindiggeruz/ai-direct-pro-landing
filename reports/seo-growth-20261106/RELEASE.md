# Growth pilot — 6 November 2026

Status: DEPLOYED AND VERIFIED. Production commit `3518a5d57cca33d666e8d8b31340e947b9f5a424`; deployment preview `https://d8996a5b.ai-direct-pro-landing.pages.dev`; guarded release completed at approximately 2026-11-06 10:03 UTC. Public acceptance: 48/48 paths plus the exact release manifest.

Owner authorized autonomous implementation of the 6 November growth roadmap. This is the first product/SEO pilot, not completion of the measurement-dependent 90-day plan. Source branch: `seo/uz-query-recovery-20261106`; predecessor production commit: `6531d35bf0d401e33587eea2d4c959c3e9793a1f`.

## Delivered

1. `/uz/kirill-lotin/` and `/ru/kirillica-v-latinicu/`: the existing local converter is before the chat. At 375px, input moved from 1,122px below the document top to 289px; output and copy fit on the first screen. Synthetic conversion and actual clipboard readback passed. No model call is needed.
2. `/uz/rus-ozbek-tarjimon/` and `/ru/russko-uzbekskiy-perevodchik/`: a compact form selects direction, Uzbek script and tone. The existing acknowledged chat bridge prefills a reviewable request. Preparing it does not send a message or consume an answer. Browser QA confirms zero `/api/` requests for preparation. Translation itself still uses the existing chat, its result/copy controls and three-total-answer trial; this is not a new unlimited translation service.
3. `/uz/taqdimot-ai/` and `/ru/prezentatsiya-ai/`: two editable six-slide examples and twelve actual PowerPoint-rendered previews. Both PPTX files opened in native PowerPoint; browser sample download succeeded. These are prepared examples, explicitly not client results or evidence of five live AI generations.
4. Three existing Uzbek articles (`rezyume-tayyorlash`, `rasmiy-xat-yozish`, `tavsifnoma-namuna`) now offer six files: three editable DOCX and matching PDFs. Each DOCX opened read-only in native Word as one page. PDFs rendered and were visually checked. Placeholders only; no personal data, signatures or claim of an official approved form.
5. Exact asset paths participate in internal-link validation; arbitrary missing downloads still fail. Document/example assets get `X-Robots-Tag: noindex`, while their HTML landing pages remain indexable. Dates change only on the nine substantively updated pages.

## Protection and validation

- Baseline is a verified copy of the actual predecessor production build, not an old source assumption.
- All 329 sitemap URLs and title/H1/description/robots/canonical/hreflang values remain unchanged. The ten protected HTML pages match predecessor bytes exactly.
- Shared chat, Studio and CSS assets are unchanged. Only the existing `uz-translit` entry changes. Its two other consumers (`ai-tabrik-generatori`, `gpt-telegram-instagram-ideya`) receive the new file reference and input privacy masking; their content and metadata are unchanged.
- Studio gallery styles are inline and scoped. They deliberately add no Tailwind utility candidates, because Studio CSS is also used by the chat presentation island.
- Mobile QA: 375/390px tools and document articles, 390px Studio, plus desktop 1365px; one H1, no horizontal page overflow, working form/prefill/copy/gallery. Form generation, tariffs, payment limits, backend, DB, webhooks and model routing are unchanged.
- Root web and Functions TypeScript checks pass; Studio TypeScript passes. Scoped ESLint passes. The 19-suite final integration run passed 296 tests with zero skips/failures; added download-renderer checks are recorded separately. Tests cover protected pages, link graph, trial claims, transliteration, Studio, feeds and bundle budget.
- Template checks: 30 artifact checks and 96 content/source-preservation checks. Native Word and PowerPoint evidence is retained with the report.
- Existing `translit_converted` was observed reaching Google Analytics with HTTP 204 and only route/language fields; synthetic source text was absent. This is transport acceptance, not proof of reporting or revenue. Direct GA4 reporting with the existing service account returns 403; no analytics permissions/settings were changed.

## Evidence

Integration logs, browser measurements/screenshots, baseline and live verifier: `F:/Claude/seo-growth-20261106/implementation/`.
Tracked evidence: `reports/seo-growth-20261106/qa/`, `studio/`, and `reports/growth-content-20261106/`.
Original approved roadmap and backlog: `F:/Claude/seo-growth-20261106/ROADMAP.md`, `BACKLOG.csv`.

## Remaining roadmap gates

- G01/G14: complete event-to-order reconciliation, channel attribution and GA4 report acceptance when reporting access is available. No test purchase or fabricated revenue.
- G03: native-Uzbek review of 30–50 translated texts remains unperformed. The new form is accepted; model translation quality is not declared professionally certified.
- G04: five-topic live generation-to-export acceptance is a subsequent product QA step; this release validates two curated files, existing exporter tests and the sample download path.
- G05/G06/G07/G10/G16: keep protected intents/snippets stable until Google recrawls and enough full post-change observations exist. Measure fixed query/country/device cohorts over 28–56 days; do not claim immediate ranking or traffic uplift.
- G08: the existing irregular-verbs trainer and static tense exercises are retained. A new tense self-check and teacher review belong to the next educational pilot, not a silent rewrite in this one.
- G09: three sample document packs delivered; no professional legal/native language approval claimed.
- G11: real B2B client cases require source facts and permission. Existing demonstrations are not relabelled as client outcomes.
- G12: fresh visual/mobile behavior is verified; field CWV remains unverified. No claim based on a single lab load.
- G13: no purchased links, unsolicited outreach or third-party publication.
- G15: seasonal greeting/poetry starters already exist; avoid duplicating them or creating thin URLs.
- Click fiscal repair remains explicitly deferred by the owner.

## Release and rollback

Build only with `npm run build:production`, then `DR_ROOT=F:/Claude/gptbot-snippets-translator-20261024` and `python F:/Claude/gptbot-tools/deploy_runner.py check|deploy`. No raw Pages upload, no force-push. Verify manifest, exact allowed edge transformations, protected pages, new files/MIME/noindex and live browser behavior before calling the release complete.

If a regression occurs, use a targeted revert of this pilot and the same guarded build/release workflow after verifying current production ancestry. Do not reset the repository or overwrite another agent's release. Preserve the existing untracked `docs/seo/research/2026-10-28-new-pages-growth/`.


## Production acceptance completed

The guarded deploy checked predecessor ancestry and retained existing product features. Strict live verification passed all 48 paths: nine changed pages, ten protected pages, three derived pages, twenty sample files, five discovery resources and the new converter entry. Exact manifest and full dist hash match; only the pre-reviewed literal Cloudflare email-marker removal/Insights insertion is permitted. Negative controls reject unrelated HTML changes.

On actual HTTPS production, mobile converter conversion and clipboard readback pass, translation direction/script/tone prefill is acknowledged without automatic sending, all six expanded UZ gallery previews load, and both the PPTX sample and PDF template download to the browser's local Downloads folder.

DOCX limitation: the IAB download-event API did not confirm browser saving on either localhost or HTTPS. All three public DOCX URLs nevertheless return the exact verified bytes with the correct MIME and noindex header, and those bytes open in native Word. Browser DOCX save completion remains UNVERIFIED; no unsupported claim of cross-browser download acceptance is made.

Final follow-up renderer checks passed 40 tests (overlap with the earlier 296-test run; counts are not summed as unique tests). Additional live evidence and the native Office proof are in `qa/`.

Google: all four existing sitemap/feed submissions were accepted and confirmed by fresh lastSubmitted readback. The first request succeeded remotely but its local response callback used the wrong arity; it was reconciled from Google's timestamp within the recorded attempt window and was NOT resent. The remaining three were submitted once with the corrected callback. See the exact receipts rather than assuming four recorded HTTP responses. The existing WebSub deployment notifier also received204 for the changed Uzbek RSS and Atom feeds. This is discovery acceptance, not a completed Google recrawl/indexing or evidence of higher rankings.

Dependency audit: three pre-existing high package findings were triaged, not hidden. `image-size`/`pptxgenjs` parser risk is excluded from the current browser mapping and has no server import in this release; Vite findings concern development endpoints. Dependencies and deployed shared bundles are unchanged. A separately tested dependency upgrade remains security maintenance; no blind audit-fix or unsupported all-secure claim.

Next product cycle: measure the released tool cohort; obtain native-language review and GA4 reporting access; then validate five live Studio generations and a source-backed B2B case. Preserve the earlier SEO repair during its post-recrawl observation window. No automatic monitor or outreach was created.
