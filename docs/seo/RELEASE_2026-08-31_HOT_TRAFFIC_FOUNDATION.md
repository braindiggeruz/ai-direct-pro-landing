# GPTBot.uz — Hot Traffic SEO Foundation

Date: 2026-08-31  
Scope: commercial content, trust, pricing clarity, CRM reliability claims and regression gates.  
Deployment: **not included**. This release must be merged and deployed only after the checks below pass and the production marker is reconciled.

## Why this release exists

The live marketing surface had three conversion and trust risks:

1. The internet-advertising hub described Google, Meta and Telegram, but the buyer-facing body did not route each intent to its dedicated commercial owner.
2. The reviews pages showed named, dated five-star quotations while the FAQ described them as generalised cases.
3. Pricing and CRM pages mixed narrow starting prices with broader market ranges and used absolute outcome or reliability language.

The release strengthens existing URLs. It does not create another broad marketing page and does not merge pages with distinct intent.

## Changed commercial owners

- `/ru/internet-reklama-tashkent/`
- `/ru/kontekstnaya-reklama-tashkent/`
- `/ru/targetirovannaya-reklama-tashkent/`
- `/ru/telegram-ads-uzbekistan/`
- `/ru/performance-marketing-tashkent/`
- `/ru/smm-prodvizhenie-tashkent/`
- `/uz/internet-reklama-toshkent/`
- `/uz/telegram-reklama/`
- `/uz/smm-xizmatlari/`

The RU paid-media hub now links in visible body copy to contextual advertising, targeted advertising, Telegram Ads, performance marketing and the marketing audit. The estimate section separates service work, media spend, creative production, landing work, analytics/CRM and third-party costs.

Stale third-party price snapshots dated August 2026 are removed from the paid-media cluster. GPTBot's own tariffs are not changed by that cleanup.

## Trust correction

- `/ru/otzyvy/`
- `/uz/sharhlar/`

Both URLs now present anonymous composite implementation scenarios instead of named five-star reviews. Review and AggregateRating schema remain prohibited unless a source, client permission and visible matching content exist.

**Do not merge PR #32** until every review has a source-and-permission record and the structured-data type is validated against current Google eligibility rules.

## Pricing clarity

- `/ru/stoimost-chat-bota/`
- `/uz/chat-bot-narxi/`

The pages keep the published starting-price table but now explain that a price “from” applies only to the listed scope. They distinguish extra channels, CRM, payment, data migration, platform fees, AI usage and support. Payback is measured against a baseline and is not guaranteed.

## CRM reliability boundary

- `/ru/ai-bot-s-crm-amocrm-bitrix24/`
- `/uz/amocrm-bitrix24-bilan-ai-bot/`

The pages no longer promise zero lost leads or zero duplicates. A buyer-facing acceptance matrix now covers API acknowledgement, retry policy, idempotency, deduplication, monitoring and manual recovery.

## Permanent regression gate

`tests/seo-commercial-claims.test.ts` blocks unverified ratings, loss of paid-media body links, stale competitor-price snapshots, pricing without scope qualification and CRM pages without idempotency/recovery boundaries. It is included in `yarn test` and is also available as `yarn test:seo-commercial-claims`.

## Required checks before merge

```bash
yarn install --frozen-lockfile --ignore-scripts --non-interactive
yarn test
yarn seo:audit
yarn tsc -b
yarn build
yarn scan:secrets
```

## Verified implementation evidence

The final code-bearing commit `8fb700972f353a66224559b90e8cded06632654c` passed GitHub Actions run `33395158634` on 2026-08-31:

- complete repository suite: **336/336 tests passed**;
- SEO audit: passed;
- TypeScript project build: passed;
- complete site build and prerender: passed;
- tracked-content secret scan: passed;
- JSON parsing, whitespace and volatile-claim validation: passed.

The one-shot transformation scripts and workflows were deleted from the final branch after the verified content commit.

## Deployment and observation gate

Before deployment: record the exact merge SHA; build from that SHA; verify preferred-host redirects and canonicals; verify the new body links in rendered HTML; verify that the two scenario pages expose no star quotations or Review/AggregateRating nodes; and verify production content markers against the exact deployment.

After deployment, record the actual production date. Evaluate GSC query × page, CTR and qualified-organic-lead events after complete 28-, 56- and 90-day windows. Do not attribute results to this release before the corresponding data window ends.

## Final commercial-claim review

A second review removed residual “market price” headings, reseller-specific thresholds and deterministic CPL/loss claims that survived the first transformation. Every paid-media page now answers price intent through scope, ownership, media-budget separation and acceptance criteria.

The RU/UZ Telegram pages retain only the current primary-source boundary: Telegram's official Getting Started guide lists a minimum CPM of 0.1 Toncoin, while the Terms allow Telegram to change service parameters including minimum CPM. Reseller deposits, country-specific euro floors and third-party audience estimates are not presented as platform facts. Sources were checked on 2026-08-31.

The Uzbek internet-advertising hub now has visible body links to Telegram advertising, SMM, SEO, website creation and the AI-bot service. Its funnel copy distinguishes a contact, submitted request, qualified lead and sale.

## Contact and lead measurement correction

The public browser previously emitted GA4 `generate_lead` immediately when a visitor clicked GPTBot's Telegram contact. That click proves only that the contact channel was activated; it cannot prove a sent message or an accepted lead. The click handler now emits the custom `contact_click` event with `contact_method=telegram`, while `telegram_open_attempt` remains the diagnostic event for all Telegram destinations. `generate_lead` is reserved for a future acknowledged form, bridge or CRM intake.

The contract and owner dependencies are documented in `docs/seo/MEASUREMENT_CONTRACT_2026-08-31.md`. The existing Yandex Metrika `telegram_cta_click` goal is unchanged.
