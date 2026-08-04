# Buyer and seller journeys — Phase 5 checkpoint

Status: **buyer slice implemented behind closed production flags; public beta is not enabled**.

## Implemented and verified in this slice

- Global classifieds launch and `/bootstrap` no longer require a legacy pilot storefront when `MARKET_CLASSIFIEDS_DISCOVERY_ENABLED=true`. The fallback is restricted to `storefront_unavailable`; cohort and authorization errors still fail closed.
- Buyer discovery supports RU/Uz Latin copy, text and mixed-language voice input, category, district, condition, availability, seller type and price filters.
- Saved listings persist by proven identity only. No listing, seller or contact copy is stored in the favorites table.
- In-app inquiries persist by proven buyer identity, derive the seller from the approved listing server-side, reject self-contact, are idempotent, and have a D1-enforced limit of 10 per identity per 24 hours.
- Listing detail exposes bounded trust and contact facts, not raw identity or contact authority. Reporting remains private and rate-limited.
- Browser, hardware and Telegram back navigation share the existing navigation spine. A modal-to-modal sentinel race found by the synthetic walkthrough was fixed with coalesced React cleanup.
- The legacy store buyer/seller application remains the unchanged fallback while the classifieds flag is off.

## Evidence

- Classifieds service and HTTP boundary: 8/8 targeted tests.
- Isolated production-shaped restore rehearsal for migrations 0034–0039: PASS; legacy product/order/inventory aggregates and product values preserved, FK/integrity clean, journey indexes selected, idempotency constraints and inquiry trigger exercised.
- Synthetic 320 px walkthrough: no horizontal overflow, no undersized interactive targets, favorite/inquiry/back journeys pass, zero automated axe violations.
- One axe `color-contrast` result remains `incomplete` inside the animated detail sheet. It is not recorded as a pass and keeps the automated accessibility gate open pending a deterministic audit or owner visual review.

Synthetic screenshots and measurements live under
`evidence/classifieds-buyer-synthetic-phase5/`; they demonstrate UI behavior only and are not user, market, device or production proof.

## Still open

- Private seller autosave, edit, resubmit, unpublish/archive and seller inquiry handling.
- Admin moderation/report lifecycle UI and safe commands.
- Real Telegram identity-binding ceremony, native real-device QuickPost/voice/back tests, TalkBack/VoiceOver and native Uzbek review.
- Legal approval, real seller/buyer cohort and real credentials.
- Production D1 migrations, exact-SHA deployment, flags and canary. Production writes in this slice: **0**.

Therefore this checkpoint is not a `GO`, not 100%, and not public-beta completion.
