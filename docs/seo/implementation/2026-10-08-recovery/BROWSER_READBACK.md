# Browser readback after release

Source release: `5de9e3850468e1915d99729e4930b8750adcf433`, 08.10.2026.

The existing RU chat tab was reloaded after deployment through the normal Chrome UI. Its visible accessibility tree showed the new 08.10.2026 update date, 3 lifetime trial replies with no daily reset, browser/account trial accounting, and the separate PPTX presentation mode and quotas. These changed statements were visible in the rendered page, not inferred from source. No message was sent and no AI, checkout or payment was invoked.

Following the visible GPTBot.uz link opened the rendered homepage and showed the hero, RU/UZ chat links and normal landing content. The next action to inspect below-the-fold resources was blocked by Chrome because another extension UI was open. Further actions on that page stopped. New-tab and localhost navigation had separately reported client blocking. No extension, security protection or browser permission was changed or bypassed.

Therefore the live 14-link HomeResources block after hydration, mobile/desktop computed layout and Studio offer after JS remain **NOT VERIFIED**. Source/SSR regression checks, compiled bundle presence and live HTTP verification passed, but do not replace this browser acceptance. The prior local-browser limitation is retained as evidence rather than reported as success.

GSC URL Inspection showed the UZ chat already in Google's index. After deployment, one manual Request indexing action started its live eligibility check and then returned **daily quota exceeded**. That new request was not accepted. No CAPTCHA was solved, no repeated submissions were attempted, and no indexing result was inferred from the pre-existing indexed status. The UI directed a retry tomorrow. Both sitemaps and both RSS submissions succeeded separately via the connector; see DISCOVERY_RECEIPTS.json.

The independent GA4 UI attempt and its distinct reporting scopes are in GA4_TODAY_UI.md.
