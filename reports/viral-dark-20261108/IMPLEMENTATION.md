# Brand consistency, SEO links and isolated lead delivery · 2026-11-08

Owner requested replacing the standalone light palette with the existing GPTBot.uz dark design, preserving SEO, and delivering this page's leads through @gptbotuz_bot without changing the bot's other uses.

## Implemented

- Existing #05070D background and radial effects, #08111F/#0C1828 surfaces, Geist font stack, blue→cyan CTA gradient, 16px action buttons, 12px inputs, glass cards. The normal desktop Blog/AI-chat links are visible again. Shared FAQ/related-card styles are reused.
- Five illustrations edited into midnight/graphite scenes. New /assets/campaigns/ai-routine/dark/ URLs and landing-dark.css avoid immutable-cache collisions. Old assets and creative archives remain intact. Five concepts exported in both 4:5 and 9:16, with copy/UTM/source archives.
- Two contextual incoming links from the education-center service and guide; one related link back to the service. All 330 URL/title/description/H1/canonical/robots/hreflang contracts remain. Exactly 3 pages gain one internal link each; other 327 HTML files and SEO contracts remain identical. Ten protected pages pass without changing their baseline.
- Only persisted page_form + exact campaign path + ai-bot service selects GPT_CAMPAIGN_NOTIFY_BOT_TOKEN and the existing explicit GPT_NOTIFY_CHAT_ID. No fallback on a missing pair. Immediate delivery, retries and Pages cron use the same durable outbox. No database migration, webhook/global notification resolver, billing, bot command or automation-worker change.

## Credential handling

The owner-supplied credential was entered through hidden process input and stored only as a new Pages secret using the official CLI. getMe confirmed the requested bot identity. Existing GPT_NOTIFY_CHAT_ID and TELEGRAM_ASSISTANT_BOT_TOKEN were not replaced. getWebhookInfo before/after confirmed an unchanged configured webhook. Values are not stored in source, documents or reports. The new secret is only needed on Pages: automation invokes the authenticated Pages maintenance endpoint, which uses Pages env.

## Validation

- Compared reference screenshots/computed styles from homepage, service and ordinary blog page.
- 50 SEO/link tests; 58 delivery/bridge/maintenance tests (including 5 new campaign-route tests); 4 campaign contract tests; 13 browser checks — pass.
- Widths 320/390/1440: no overflow, working anchors/navigation/controls, zero axe violations. Dark background and shared gradient verified from computed styles. Form errors, literal ACK, UTM and idempotency preserved; mocked delivery in browser.
- Web and Functions typechecks, scoped lint, SEO audit and protection pass. Final production build and public readback follow; see RELEASE.md for actual live state and the controlled real delivery test.

The new delivery test is registered in npm test. No ranking/revenue effect is claimed. A Telegram API acceptance is delivery evidence, not evidence the owner read the message. Rollback is a scoped revert against latest production ancestry; preserve existing secrets and webhook.
