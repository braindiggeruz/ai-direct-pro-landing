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

`tests/seo-commercial-claims.test.ts` blocks unverified ratings, loss of paid-media body links, stale competitor-price snapshots, pricing without scope qualification and CRM pages without idempotency/recovery boundaries. It is included in `npm test` and available as `npm run test:seo-commercial-claims`.

## Required checks before merge

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run seo:audit
npm run test:seo-commercial-claims
npm run test:seo-links
npm run test:seo-demand
npm run test:seo-intent
npm run test:seo-cluster
npm run test:canonical
npx tsc -b
npm run build
npm run scan:secrets
```

## Deployment and observation gate

Before deployment: record the exact merge SHA; build from that SHA; verify preferred-host redirects and canonicals; verify the new body links in rendered HTML; verify that the two scenario pages expose no star quotations or Review/AggregateRating nodes; and verify production content markers against the exact deployment.

After deployment, record the actual production date. Evaluate GSC query × page, CTR and qualified-organic-lead events after complete 28-, 56- and 90-day windows. Do not attribute results to this release before the corresponding data window ends.
