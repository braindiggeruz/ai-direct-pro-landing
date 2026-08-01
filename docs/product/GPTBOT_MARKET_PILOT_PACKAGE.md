# Store Pilot #1 — owner input package

Status: `READY_FOR_OWNER_INPUTS`; real store onboarding is `NOT_STARTED`.

## Owner-independent package complete

- truthful buyer/seller positioning and design system;
- synthetic website and Telegram demo;
- controlled catalog validator and dry-run rehearsal;
- import result and product preview/sign-off templates;
- seller qualification, prepare, catalog quality, photo, verification and
  daily cockpit guides;
- privacy-safe metrics and operations templates;
- release/rollback process without payment or public marketplace scope.

## One consolidated intake

Activation requires all of the following in one owner-approved record. Do not
store private contacts in Git.

1. one verified seller and explicit consent;
2. low-risk category selection;
3. 10–30 approved products with integer UZS prices;
4. opening stock baseline and source-of-truth owner;
5. approved photos with rights, or explicit no-photo decision;
6. fulfillment area/method and payment methods handled by the seller;
7. private seller contact supplied through an approved private channel;
8. role assignments: support owner, incident lead, daily reviewer, catalog
   owner and release owner;
9. response SLA and working window;
10. cohort bounds, pilot term and fee decision (blank is acceptable, invention
    is not);
11. native Uzbek sign-off or RU-only pilot decision;
12. explicit production authorization for store creation and activation.

## Intake and sign-off sequence

1. Qualification: verify category, owner and operational readiness.
2. Data dry run: validate shape, UZS, stock, SKU uniqueness and media refs.
3. Reject review: owner resolves missing price, invalid currency, duplicate
   SKU, unsafe media or missing stock.
4. Preview: render every approved card with source and freshness.
5. Owner sign-off: freeze the approved initial product set and operating roles.
6. Separate command: create/bind/activate the real store only after explicit
   authorization.
7. Controlled canary: no real order unless separately approved.

No self-service path, role switch, marketing CTA or deep link can substitute
for these steps.

## Acceptance boundaries

- `catalog accepted` means validation and owner sign-off passed; it does not
  mean sales readiness or merchant success.
- `pilot started` means the verified store is active under an explicit release
  authorization; that state is not reached now.
- “success” must be evaluated after real evidence using the metric dictionary.
  No guaranteed sales, SLA, conversion or continuation claim is allowed.

## Owner decision record template

```text
SELLER_VERIFIED=[yes/no]
CONSENT_RECORDED=[private evidence reference]
CATEGORY=[owner decision]
PRODUCT_COUNT=[10..30]
CATALOG_SOURCE_OWNER=[ROLE]
PHOTO_DECISION=[approved/no-photo]
FULFILLMENT=[owner input]
SELLER_HANDLED_PAYMENT_METHODS=[owner input]
SUPPORT_OWNER=[ROLE]
INCIDENT_LEAD=[ROLE]
DAILY_REVIEWER=[ROLE]
RESPONSE_SLA=[owner input]
PILOT_TERM=[owner input]
PILOT_FEE=[owner input or no-fee]
COHORT_BOUNDS=[owner input]
UZBEK_SIGN_OFF=[approved/pending/RU-only]
PRODUCTION_AUTHORIZATION=[exact command reference]
```

