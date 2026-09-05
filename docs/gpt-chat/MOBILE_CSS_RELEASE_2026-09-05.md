# Public stylesheet repair — 2026-09-05

Owner authorized commit and publication after reviewing the local CSS fix. Release base: production `37706036171f28d1f7bd002c922ada87d5d3f9d7`, including the latest AEO changes. Checkout: `F:/Claude/gptbot-mobile-css-hotfix-20260905`.

Prerender previously selected the first CSS file in the asset directory, which was AdminRoot CSS. It now reads actual stylesheet links from Vite's generated entry, validates files and preserves cascade order. The Pages artifact guard rejects public RU/UZ pages missing those styles. No payment functionality is included.

Before release: 537 full baseline tests passed; 12 stylesheet/release tests passed again after advancing to current production. The built public artifact passed checks for 286 HTML documents and RU/UZ browser layout checks at 360, 393 and 1366 px. At 360x500 the menu and editable composer work. API calls in that local browser check were fixtures. Publication must use the full `build:cf` and existing guarded deployment; verify custom-domain manifest and mobile rendering afterwards. Runtime acceptance will be appended following deployment.
