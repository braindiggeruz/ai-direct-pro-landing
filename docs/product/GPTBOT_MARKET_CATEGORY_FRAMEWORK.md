# GPTBot Market category framework

This is a reusable product layer, not an assertion that any category is live.
Every real category remains blocked until a verified seller supplies approved
items and category-specific rules.

## Universal product contract

Required per item:

- opaque store-scoped SKU/reference;
- product name and approved RU/Uzbek Latin aliases;
- integer UZS price;
- availability state and, when applicable, opening stock;
- category;
- seller-approved description;
- zero to five Telegram `file_id` media references;
- explicit freshness/correction owner;
- up to four buyer-visible verified specifications.

Rejected at import:

- missing or fractional price;
- non-UZS currency;
- negative stock;
- URL in a media-reference field;
- duplicate SKU in the same store;
- unknown category or uncontrolled status;
- unverifiable claim, discount, delivery promise, rating or review.

## Category configuration worksheet

| Field | Purpose | Example status |
| --- | --- | --- |
| buyer vocabulary | names, spelling variants and approved aliases | seller-supplied |
| filtering dimensions | 1–4 factual constraints useful to the category | category owner review |
| comparison dimensions | 2–3 dimensions that are safe to compare | catalog-backed only |
| freshness window | when price/stock needs re-verification | owner input required |
| prohibited claims | medical, legal, safety, performance or compatibility claims | fail closed |
| fulfillment note | what the store, not GPTBot, must explain | seller-owned |
| media standard | required angle, lighting, crop and consent | seller guide |
| human handoff triggers | questions the bot must not answer | closed list |

## Risk tiers

- Tier A, suitable for first pilot review: ordinary non-regulated retail with
  simple catalog facts and no safety-critical fit.
- Tier B, additional review: fit/compatibility, cosmetics, food, children’s
  goods or anything with health/safety implications.
- Tier C, not authorized: medicines, financial products, weapons, controlled
  substances, adult services, gambling, illegal goods, or categories requiring
  a license/policy that GPTBot has not approved.

Real photos, testimonials, delivery rules, category conversion metrics and
case results are category-dependent inputs. They must never be synthesized.
