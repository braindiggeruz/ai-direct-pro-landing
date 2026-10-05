# SEO implementation and release handoff — 2026-10-03

The owner explicitly authorized implementation and immediate production deployment after the research. Release through the repository's guarded Pages runner after a clean committed build, browser acceptance and the production lineage check. This note records the candidate; the live deployment receipt belongs in the external evidence directory.

## What this increment changes

- The existing RU GPT explainer gains two verifiable exercises, primary sources, a direct chat entry and a clear distinction between GPT, ChatGPT and GPTBot.uz. See `gpt-explainer.md`.
- The existing RU Telegram development pricing article answers the price question with the published service packages and a separate monthly support figure. No new prices are introduced. See `pricing-content.md`.
- `/uz/suniy-intellekt/` now uses the informational renderer and an Article entity, with the existing author and original dates. Its educational body, URL and metadata remain. It has no RU counterpart, so no language pair is invented.
- The existing Cake City trust label on `/ru/razrabotka-telegram-bota-tashkent/` becomes a native link to the already published case study. Other trust chips retain their exact markup. The small renderer accepts only internal RU/UZ content paths and escapes labels; invalid links fall back to text. Price extraction still reads the unchanged string chips.
- The calculator sends `generate_lead` only after a literal successful server acknowledgement. The shared CTA helper uses the installed Google tag and preserves its dataLayer fallback and Meta event routing. The calculator's new event also follows the existing Meta custom-event route; it is not mapped to a standard Meta Lead. No personal input enters its payload. See `calculator-analytics.md`.

The earlier guide/article and static service-form corrections remain part of this branch. Details are in `README.md` and `analytics-fix.md`.

## Boundaries and checks

No page is added and no protected-ten source is edited. Preserve the current keyword ownership, canonicals, publication dates and URL structure. No backend, database, payment, authentication or model configuration changes are included.

Source tests and independent engineering/content review precede the release. Final gates: TypeScript, changed-file lint, secret scan, fresh public/admin build and stamp, rendered SEO contracts, acknowledgement-only lead browser cases, protected-ten comparison, release guard and post-deploy live readback. Browser QA intercepts the lead endpoint locally and blocks third-party traffic; it must not submit a real enquiry or fake an analytics conversion.

Baseline production commit: `9a8b9ff0609c91835524d83d07b40e20d400dc1f`. Recheck the live manifest and remote main before deploying. Never replace an unrelated newer release. Record the deployed SHA, artifact hash, deployment ID and checks in `F:/Claude/gptbot-seo-evidence-20261003/SEO-DEPLOY-RU.md` only after verification.

After a verified deployment, submit the changed content URLs through existing crawl-notification facilities and retain receipts. Acceptance of a sitemap or notification is not proof of indexing. Compare GSC query/page/device results over the existing 14/28-day observation windows; a successful release does not establish ranking or revenue growth.
