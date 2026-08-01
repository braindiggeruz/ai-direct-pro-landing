# GPTBot Market Trust Center source

Status: public RU/UZ Trust Center implemented. Copy is product-reviewed, not
legal-reviewed.

Public routes:

- `/ru/market-doverie/`
- `/uz/market-ishonch/`

## Responsibility map

| Actor | Responsible for | Not responsible for |
| --- | --- | --- |
| GPTBot Market | showing grounded catalog facts, deterministic supported search, comparison, request routing and safe handoff | selling the product, taking money, guaranteeing stock/delivery or inventing missing facts |
| Connected store | product identity, price/stock source, confirmation, fulfillment, payment method and seller response | GPTBot platform security or global analytics |
| Buyer | describing a need, reviewing facts and confirming terms directly with the store | maintaining seller catalog data |

## Product facts and corrections

Price, availability, store and shown specifications come from the connected
catalog. The interface shows source and freshness where available. If a fact is
missing, GPTBot must expose the gap or route to the seller. Correction path:
buyer reports the card, support identifies the authorized catalog owner, the
store corrects its source, and the next grounded response uses the new fact.

## Request, payment and fulfillment

Checkout creates one idempotent request. It is not payment, escrow, reservation
or completion. GPTBot does not collect payment details. The connected store is
the next actor and confirms item, fulfillment and payment method directly.

## Verification, privacy and prohibited scope

Seller rights come only from trusted server-side identity/membership. A buyer
or role switch cannot self-promote. Global analytics excludes raw query,
message, Telegram/chat/user ID, username, phone, address, callback payload and
consent text. The pilot category must avoid regulated/high-risk goods; exact
prohibited categories require owner/legal policy before a real pilot.

## Support and legal gap

Use the published GPTBot.uz support path; do not put private contacts in source
control. Privacy complaint, wrong price/stock and seller silence follow the
operations kit. This Trust Center is an accurate product responsibility summary
but has not received legal counsel approval. Public terms, privacy notice,
retention schedule and prohibited-category policy remain owner/legal gates.

