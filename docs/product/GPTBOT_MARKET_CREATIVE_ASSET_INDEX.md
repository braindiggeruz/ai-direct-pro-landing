# GPTBot Market creative asset index

Status: owner-independent production kit ready, 2026-08-01. Publication and
paid distribution are not authorized.

## Source package

- Deterministic editable masters and exports:
  `public/assets/market/creative/`.
- Machine-readable production metadata:
  `public/assets/market/creative/asset-manifest.json`.
- Reproducible generator: `scripts/generate-market-assets.ts`.
- Every SVG includes `<title>` and `<desc>`; the manifest supplies a separate
  descriptive alt. PNG is the delivery export; SVG is the editable master.
- All concept art is visibly labelled `SYNTHETIC / TEMPLATE`.

The manifest records purpose, audience, funnel stage, CTA, evidence source,
truth status, locale, approval state, editable master and export for every
asset. This file is the human routing layer; the manifest is the exact index.

## Inventory

| Pack | Minimum delivered | IDs / notes |
| --- | ---: | --- |
| Brand | mark, wordmark, avatar, favicon, OG | `public/assets/market/`; dark, light and mono SVGs plus raster exports |
| Buyer static RU | 3 | find, catalog facts, request-not-payment |
| Buyer static UZ | 3 | matched Uzbek Latin drafts; native sign-off pending |
| Story/Reels RU | 3 | search, compare, human handoff storyboards |
| Story/Reels UZ | 3 | matched Uzbek Latin drafts; native sign-off pending |
| Short demo | 1 | truthful 20–30 second storyboard; video is not rendered |
| Buyer education | 3 | knows/does-not-know, comparison, zero-result honesty |
| Seller acquisition/onboarding | 11 | one-pager, qualification, prepare, import result, preview/sign-off, catalog quality, photo, verification, daily cockpit, SLA template, result template |
| Telegram public identity | 3 | buyer preview, seller preview, example prompt |
| Website explanation | 3 | facts diagram, request timeline, responsibility map |

The generated manifest contains at least 33 masters and the same number of PNG
exports. `creative-contact-sheet.webp` is review evidence, not a publishable ad.

## Image provenance

`market-synthetic-fallback.webp` is a synthetic product composition created
for the website demo. The generation prompt asked for a premium editorial
still life with generic unbranded objects, warm ivory, deep teal and a small
coral signal; it explicitly prohibited text, logos, brands, robots, brains,
carts, coins, Telegram, OpenAI and real-store identity. It is not a real
catalog product and is labelled adjacent to its use.

## Truth and approval rules

- “Ready” means production files exist; it does not authorize publication.
- Uzbek assets are prepared drafts, not native-reviewed copy.
- Seller SLA and pilot-result cards are templates with placeholders. They do
  not claim a response time or outcome.
- No testimonial, rating, merchant logo, sales claim, price/fee, pilot term or
  real catalog proof appears in the pack.
- Real seller photos must be approved by their rights owner and converted to a
  safe Telegram `file_id` through the controlled media path.

## Prohibited usage

Do not remove the synthetic/template label, present concept products as live
supply, substitute a URL for a Telegram media reference, publish Uzbek copy as
native-approved, or launch ads/outreach before owner authorization and source
tagging are confirmed.

