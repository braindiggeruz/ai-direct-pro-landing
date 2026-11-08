# Production release: dark campaign, SEO links and isolated lead delivery

Status: DEPLOYED AND VERIFIED on 2026-11-08T07:33:07Z.

- Public URL: https://gptbot.uz/ru/blog/ii-zahvatit-mir-nachnem-s-zayavok/
- Runtime commit: `e85da915a070acc71b7d9b76b5a7a92b1ac08fe4`; Cloudflare Pages deployment `77085220`.
- Artifact SHA256: `a97d83bcec32d266eefe2122f8656f3441143f8bab1f28d4b210633d0d1878fd`; 1,084 files.
- Strict public readback: **464/464 PASS**, including all 330 sitemap HTML URLs, shared JS/CSS, 28 Markdown twins, robots, sitemap/feed/llms surfaces, and previous/new campaign illustrations. The custom-domain manifest exactly matches the guarded artifact.

## Brand and SEO

The article uses the existing dark palette, typography, gradient buttons, navigation and card treatment. Five illustrations and ten advertising PNGs were refreshed to the dark palette at new immutable URLs. Old assets and archives are preserved.

All 330 URL/title/description/H1/canonical/robots/hreflang contracts are preserved. Two relevant incoming links and one link back to the education-center service were added. Exactly three pages gain links; the other 327 SEO contracts remain unchanged. Their HTML differs only in three explicitly reviewed generated asset URLs; reversing just those exact URL pairs restores all 327 original hashes. Ten protected pages pass their unchanged reviewed baseline. No ranking, indexing or citation improvement is asserted from these technical checks.

## Lead delivery and preservation

The campaign's exact page_form/path/ai-bot combination uses only the new `GPT_CAMPAIGN_NOTIFY_BOT_TOKEN` and the existing explicit recipient. All other pages keep their existing routing. Missing campaign credentials block durable delivery instead of silently selecting another sender. The same outbox is used for immediate send and maintenance retries.

One clearly marked synthetic owner test was accepted. Its outbox changed from `sending` to `sent`, first attempt, with no error at `2026-11-08T07:31:41.905Z`. This confirms Telegram API acceptance through @gptbotuz_bot, not that the owner read the message. The labelled test row is retained as evidence. Failed preflight attempts used the same request ID and stored no lead.

Only one new server secret was installed. Existing notification and assistant secrets were preserved. Read-only getMe/getWebhookInfo confirmed bot identity and an unchanged webhook. No bot commands, webhook, global sender resolver, billing rules or automation Worker were changed.

## Publication recovery

The initial real canary exposed `503 store_unavailable`: Wrangler selected the parent Easy Breezy/wrangler.jsonc before the local TOML, leaving production native resources absent. D1 itself and its schema were healthy. Pages does not support --config; the first explicit-path attempt was rejected before upload.

The guarded publisher now creates an exclusive temporary local wrangler.json from the authoritative TOML inside the shared release lock, verifies exact parsed configuration and default discovery, then removes only its unchanged owned file. Existing files and the parent project are never overwritten. This final supported release restored all eight resource bindings, compatibility date/flags and both packed public runtime configurations, which match source. All 49 secret bindings remain present. The temporary config was removed. No schema or data repair was required.

## Validation and deliverables

Main/admin/Studio production builds, guarded check/deploy, scoped lint, web/Functions typechecks and SEO protection pass. Test groups: 50 SEO/link, 58 delivery/bridge/maintenance, 4 campaign and 18 release/config tests. Thirteen browser checks were repeated successfully against the final production bundle at 320/390/1440: no overflow, zero axe violations, anchors/demo/form errors/idempotency/UTM verified. Offline demo makes no requests; contact data is excluded from analytics. The real Pages CLI configuration test is network-blocked. Final shared CSS differs only by the 27-byte `.contents{display:contents}` utility (unused in static HTML); its two dependent JS files differ only in generated asset references. Campaign HTML SHA256 is `1e1d20ef08fdbc22d10603daa7361d8a66de09445b1b849a42f1d0ec43fd8c74`; campaign CSS SHA256 is `c3076b85bbdf43db507e625c2458a9f325f03a03eb56ca891c691420c6c8701a`.

- [Public readback](live-readback.json)
- [Restored production bindings](production-bindings.json)
- [One synthetic delivery receipt](lead-delivery-receipt.json)
- [Unchanged bot webhook](bot-postrelease-check.json)
- [SEO preservation](seo-review.json)
- [Final browser QA](browser-qa.json)
- [Exact generated asset review](asset-hash-review.json)
- [Implementation and guard](IMPLEMENTATION.md)

External artifact root: `C:/Users/Borinio/.codex/visualizations/2026/11/08/01a1b921-58ac-72f3-af9a-3684d2e788b4/gptbot-viral-dark-20261108`. `creatives/GPTBot-10-Creatives-Dark.zip` contains ten ready PNGs, OG/contact sheet/copy and destination links. `creatives/GPTBot-Creative-Sources-Dark.zip` contains editable originals, prompts, fonts/license and exports. Both archive CRC checks pass.

The release WebSub hook skipped all three unchanged feeds, retaining prior accepted receipts. No repeated discovery submission, Meta ad/account/budget change or GitHub push was performed. Rollback must be a scoped revert on current production ancestry; preserve the release configuration discovery fix, resource bindings, existing secrets and webhook. Never restore the old deployment with missing bindings.
