# Publisher identity correction — 2026-11-07

## Decision and scope

The owner's 2026-11-07 instruction to proceed with the SEO improvements authorizes this narrow technical metadata correction. The shared `https://gptbot.uz/#org` publisher now reads `content/global/site.json` on `/ru/oferta/` and `/uz/oferta/`, just as it does on the other site pages.

This intentionally supersedes **only the Organization address/geo and contact-schema freeze** recorded by commit `cd83c654fb2317a68ff48fc9c3bc53b7619e8f88` and the earlier contact change. Those historical records remain unchanged. This is not a new legal approval or an edition of the offer.

## Three separate facts

- Current studio/publisher: Kichik Xalqa Yo‘li 57; coordinates 41.3364, 69.2723; the current public Telegram and email; no public telephone in `#org`. The existing global source records the owner's 2026-10-26 address/contact decision; no new business fact is inferred here.
- Historical approved offer document: its visible card, footer, phone/email and Yahyo Gulyamov ko‘chasi 35 address remain unchanged through `pageContact` and `pageNap`.
- Seller's registered address: Matonat in `content/global/legal-entity.json`; the seller/requisites source is unchanged. The historical studio address is not the seller's registered address.

`content/pages/{ru,uz}/oferta.json`, `content/global/legal-entity.json`, all clauses, prices, billing behavior, `termsVersion: ai-paket-2026-10-v5` and `legalReviewedAt: 2026-10-07` are outside this change. No `dateModified` or legal review date is advanced.

## Implementation and regression evidence

The single runtime edit is `buildOrganizationLd(global)` in `scripts/prerender.ts`. Historical visible contact rendering remains intact. Helper comments and the studio-contact tests now distinguish document contacts from the site's current publisher.

`tests/publisher-schema.test.ts` checks the built RU/UZ offers for exactly one `#org` equal to the global publisher, retained historical visible contacts and the existing edition marker. With `SEO_PUBLISHER_BASELINE_DIST` set to the pre-change artifact directory, it also compares complete HTML bytes after removing only JSON-LD and the two exact retired GTM blocks. All non-publisher JSON-LD nodes must remain identical. A negative-control test ensures visible edits, unrelated script edits and a different GTM loader cannot be hidden by that normalization.

The artifact tests require the coordinated build and immutable baseline. Source/unit tests alone are not proof of the built output or a public deployment. No build, commit or deployment is performed by this subtask.

Initial pre-build run of `publisher-schema`, `studio-contact` and `legal-oferta`: 44 passed, 13 skipped because `dist/` is absent, and one existing live-gate assertion failed solely because both offer artifacts and their sitemap entries are absent. Rerun the same suites after the coordinated build; do not treat this pre-build result as a passed artifact gate.

## Rollback

Restore the one `buildOrganizationLd(pageNap(page, global), pageContact(page))` call and its previous tests/comments if the metadata decision is withdrawn. No billing, content, data or provider rollback is required.
