# Public stylesheet repair — 2026-09-05

## Verified public release

Published runtime: `ed473b193bfc77f4b078eff9d31d15fd4a9ef50b`, Pages deployment `3c4c3059-4903-41c6-a853-0e51e3f393e5`. The guard detected a concurrent AEO release during preparation. Its runtime `f9a8457b13ee313f769290ac1df59826c1d14f78` and documentation `d186b11` were merged before rebuilding; no released AEO work was overwritten.

The final `npm run build:cf` passed and stamped all 914 artifact files. Typecheck and 12 CSS/release tests passed on the merged source; 13 AEO tests passed during reconciliation. Guarded deploy and custom-domain manifest verification succeeded. Existing production bindings and environment variable names/types/plain values were compared before/after and preserved. Existing Wrangler authentication was used in process memory without printing credentials.

Public homepage, RU/UZ chat, blog, an article, admin and auth config returned HTTP 200. Public pages now reference `/assets/index-CbmAZsTW.css`, served as HTTP 200 `text/css; charset=utf-8`. Playwright checked the actual gptbot.uz RU/UZ chat at 360, 393 and 1366 px: no horizontal overflow, composer inside viewport and no JavaScript page errors. The UZ 393 px screenshot was visually inspected. No AI prompt, payment, lead or Telegram message was submitted. Third-party analytics were blocked in browser verification; physical Android keyboard behavior remains outside this check.

Evidence: `mobile-css-deployment.json`, `mobile-css-live-http.json`, `evidence/live-browser.json`, `evidence/live-{uz|ru}-{360|393|1366}.png`. These documentation updates do not require another runtime deployment.

## Preparation history

Owner authorized commit and publication after reviewing the local CSS fix. Release base: production `37706036171f28d1f7bd002c922ada87d5d3f9d7`, including the latest AEO changes. Checkout: `F:/Claude/gptbot-mobile-css-hotfix-20260905`.

Prerender previously selected the first CSS file in the asset directory, which was AdminRoot CSS. It now reads actual stylesheet links from Vite's generated entry, validates files and preserves cascade order. The Pages artifact guard rejects public RU/UZ pages missing those styles. No payment functionality is included.

Before release: 537 full baseline tests passed; 12 stylesheet/release tests passed again after advancing to current production. The built public artifact passed checks for 286 HTML documents and RU/UZ browser layout checks at 360, 393 and 1366 px. At 360x500 the menu and editable composer work. API calls in that local browser check were fixtures. Publication must use the full `build:cf` and existing guarded deployment; verify custom-domain manifest and mobile rendering afterwards. Runtime acceptance will be appended following deployment.
