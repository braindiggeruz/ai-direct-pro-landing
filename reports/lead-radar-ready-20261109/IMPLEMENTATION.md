# Lead Radar operational readiness — 2026-11-09

Owner request: prepare the system so the owner can send a campaign. This release does not dispatch any company message.

## Verified incident
- Public production baseline: 07685df5417c5ce6056b30e59b9d8457467b73a8; Pages 55b8f74f-8c8c-4928-8ae5-e3f6865fe11d.
- Authenticated account state reported connected with blocked readiness/tg_sender_unavailable; the record still referred to the historical Bridge.
- Independently authenticated TG Sender status and explicit provider probe succeeded; identical configured client passed outside the Pages runtime. The production routing failure was not yet isolated conclusively.
- Автомойка incorrectly resolved to the general automotive niche, producing dealerships and repair businesses. Existing results/history remain intact.

## Changes
- Exact car-wash intent and amenity=car_wash source filter, without changing the existing automotive category.
- Private same-account TG Sender service binding in both Pages and automation. Exact origin, allowed route, scoped bearer, account pinning and response proofs remain mandatory; no silent network fallback after a private binding failure.
- Owner-only explicit session refresh; passive status does not call Telegram, replace an account or create campaigns.
- Truthful blocked account badge and server-mode instructions. Existing explicit Bridge-to-TG Sender cutover remains guarded by active-campaign/uncertain-send checks.
- Readiness diagnostics expose only a fixed stage enum; no tokens, contacts or response bodies.

## Validation and release
See local protected operational evidence in F:/Claude/gptbot-tools/lead-radar-help-20261109. Source checks run before commit; full production build and guarded release follow. Production readiness is not claimed until authenticated UI readback succeeds.

## Unchanged
No D1 schema migration. SEO content, URLs, public assets, chat, payments, bot webhooks, provider keys and budgets remain unchanged. Contact verification, opt-outs, immutable approval, deduplication, 30/day limit and 120-second minimum pacing remain enforced.

## Remaining owner workflow
Verify the masked sender, review genuine corporate contact sources, prepare exact recipients and message, then let the owner perform the final send confirmation. Public-source contact review is not proof of consent. No real delivery is asserted by this release.

## Confirmed runtime cause
Cloudflare Workers does not implement Request.redirect=error. The original Node-only tests accepted this mode, while workerd threw before sending either public or private requests. Reproduced using the production compatibility date/flags. Both client and transport now use manual redirects; the existing non-2xx rejection still denies every redirect. A real Miniflare/workerd test covers a successful scoped session probe and a rejected 302. Official reference: https://developers.cloudflare.com/workers/runtime-apis/request/ .
