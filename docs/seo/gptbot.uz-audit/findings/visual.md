# Visual acceptance — 2026-09-06

Scope: built candidate served at `http://localhost:4178`, not production. Browser control used only CUA in-app browser. No external messages, real payments or prompt submissions were made.

## Method and evidence boundary

The documented browser `viewport` capability was used:

```js
const browser = await agent.browsers.get('1');
const viewport = await browser.capabilities.get('viewport');
await viewport.set({ width: 1920, height: 1080 });
await viewport.set({ width: 375, height: 812 });
await viewport.reset();
```

Screenshots were captured with CUA `tab.getScreenshot()` and visually inspected at both sizes. Images are present in the tool conversation; no local PNG files were exported. DOM-backed read-only inspection checked headings, canonicals, link destinations, target attributes, editable draft values and width. This is desktop browser viewport emulation, not a physical iPhone or Android keyboard test. No field Core Web Vitals measurement is implied.

## Accepted scenarios

| Entry page | Verified destination | Result |
| --- | --- | --- |
| `/ru/blog/chatgpt-i-claude-v-uzbekistane/` | `/ru/gpt-chat/#entry=compare-ru` | Same-tab header link; Russian editable draft; correct return link; no automatic submission |
| `/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/` | `/ru/gpt-chat/#entry=payment-ru` | Same-tab header link; Russian editable draft; correct return link; no automatic submission |
| `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` | `/uz/gpt-uzbek-tilida/#entry=download` | Existing Uzbek scenario preserved; Uzbek editable draft and return link; no automatic submission |
| `/ru/tarify-ai-chat/` | Free chat and separate Business Telegram link | Free available; Plus explicitly forthcoming; no purchase/activation promise; Business link has `_blank` with `nofollow noopener noreferrer` |

Verified draft values:

- compare-ru: `Помоги понять, как AI может помочь с моей задачей. Сначала спроси, что я хочу сделать.`
- payment-ru: `Помоги составить короткий деловой текст. Сначала спроси, для кого он нужен и что я хочу сказать.`
- download: `O‘zbek tilida nimalarda yordam bera olasan? Uchta misol keltir.`

## Above the fold and mobile

- All three article H1s and header chat CTAs are visible at 1920×1080 and 375×812; hero images render correctly. On mobile, the sticky chat CTA is also visible and 48 px high.
- Article inline CTA follows opening content; its lower placement does not remove the header/sticky entry path. Article text remains readable and the optional chat path does not automatically navigate the reader away.
- Russian and Uzbek chats show the composer and Send button within the 375×812 viewport. Input font is 16 px. Long drafts remain editable in the scrollable input; no user/assistant message was created by entry navigation.
- At mobile viewport width 375, document scrollWidth was 360 for the inspected pages (browser scrollbar accounted for); no page-wide horizontal overflow was observed.
- The pricing comparison table uses a labelled horizontal scrolling region (326 px client width, 544 px scroll width); the page itself remains within the viewport.
- Pricing first screen clearly states that Plus is preparing to launch and exposes the Free chat CTA. Business discussion is separately described lower down.
- No stylesheet loss, broken hero image, gross text overlap or off-screen composer was seen in the captured states. Final inspected tab error log was empty; this is not a comprehensive network/performance audit.

## Issue found and resolved during acceptance

The payment article's existing bottom CTA initially read `Открыть AI-чат на узбекском` after its destination changed to the Russian chat. Reported to the parent engineer, corrected in rendering, then verified after fresh navigation: the final label is `Открыть AI-чат на русском` and target `/ru/gpt-chat/#entry=payment-ru`, with no `_blank`.

## Remaining observations from the initially inspected candidate

- Low-priority existing mobile header crowding: on the Uzbek download article, the long CTA leaves almost no visual separation between GPTBot and Blog. The prominent sticky entry works; a separate compact header treatment would improve polish.
- Header article CTA measured 36 px high on the Russian comparison article; the sticky/inline CTA is 48 px. A later accessibility pass can enlarge compact header targets without changing article content.
- Chat's SEO H1 appears in the document below the app shell; the visible first-screen welcome heading is H2. This observation is not a recommendation to reorder or rewrite protected SEO headings.
- Existing comparison article contains factual statements about shared subscriptions, universal bank acceptance and payment methods that merit separately sourced editorial review. They were not fact-checked or modified by this visual acceptance pass.

## Final rebuild follow-up

The parent engineer reports a rebuilt candidate with smaller mobile branding, a navigation gap and a 44 px header CTA, plus intentional sourced corrections to comparison-article provider facts. A requested bounded 375×812 recheck could not run: the previously selected CUA browser returned `Browser is not available: 1`; discovery returned `{"apps":[],"browsers":[]}`; an attempt to open the known local candidate with `cua.createBrowserTab('iab', ...)` also returned browser unavailable. The header observations above describe the earlier inspected build and must not be presented as current confirmed defects or as visually verified fixes. Final rebuilt header layout, overflow and unchanged entry targets await browser reconnection. No unsupported alternate browser automation was used.

## Structured findings

```json
{
  "category": "Visual",
  "environment": "local-candidate",
  "viewports": [{"width":1920,"height":1080},{"width":375,"height":812}],
  "screenshotsCapturedAndInspected": true,
  "screenshotsSavedToFiles": false,
  "scenariosPassed": ["compare-ru", "payment-ru", "download", "ru-pricing"],
  "resolvedIssues": [{"id":"payment-cta-language","severity":"medium","status":"fixed-and-rechecked"}],
  "openIssues": [
    {"id":"uz-mobile-header-crowding","severity":"low","location":"UZ download article header","status":"parent-reports-fixed-final-visual-recheck-blocked"},
    {"id":"compact-header-touch-target","severity":"low","location":"RU article header CTA","previousHeightPx":36,"parentReportedNewHeightPx":44,"status":"parent-reports-fixed-final-visual-recheck-blocked"}
  ],
  "limits": ["No physical-device keyboard test", "No field performance measurement", "No production acceptance yet"],
  "viewportOverrideReset": true,
  "finalRebuildRecheck": {"status":"blocked","reason":"CUA browser unavailable; discovery returned no browsers"}
}
```

## Final main-session acceptance after recovery and publication

The main CUA session recovered although the specialist session remained unavailable. Main inspected final preview UZ download and RU comparison screenshots and measured both primary header controls at 44px. At viewport 375 by 812, document scrollWidth was 360 (vertical scrollbar), with no horizontal overflow. Production payment/comparison/download links were clicked and the correct Russian/Russian/Uzbek curated drafts and return URLs were observed without automatic submission. Main also inspected the live mobile UZ article and chat screenshots. One fresh Russian canary returned 4 and showed minimax/minimax-m3. A prior UZ answer visible in history was not counted as a new canary. Temporary viewport override was reset. Structured evidence: ../browser-acceptance.json. These main-session observations supersede the temporary availability limitation above; no exported PNG or new desktop run is claimed.
