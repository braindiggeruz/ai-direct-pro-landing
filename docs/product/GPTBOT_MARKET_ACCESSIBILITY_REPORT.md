# GPTBot Market accessibility report

Status: `ACCESSIBILITY_AUTOMATED=PASS`, immutable production deployment
`68747046-8e1e-492a-8b81-dc4e4065916f`, 2026-08-01.

## Automated result

The exact production deployment was audited with axe-core 4.12.1 and
playwright-core against WCAG 2 A/AA, WCAG 2.1 A/AA and WCAG 2.2 AA tags.

| Check | Result |
| --- | ---: |
| Audited page/viewport cases | 7 |
| Automated violations | 0 |
| Incomplete results | 0 |
| Passed axe rule instances | 171 |
| RU/UZ overflow cases | 18 |
| Overflow failures | 0 |
| Sequential keyboard tab stops checked | 12 |
| Focus visibility failures | 0 |
| Reduced-motion failures | 0 |

Exact machine evidence:
`docs/agents-platform/evidence/gptbot-market-productization-2026-08-01/market-accessibility-automated.json`.
Reproduction: set `MARKET_BASE_URL` to the immutable deployment and run
`yarn market:a11y`. A different browser location can be supplied with
`MARKET_BROWSER_EXECUTABLE`.

## Fixes verified

- skip link and visible 3px focus indicator;
- 44px-or-larger audited header/CTA targets;
- semantic headings, nav, sections, tables and FAQ button/region pairs;
- scrollable comparison and Trust tables are labelled, focusable regions;
- generic `aria-label` containers have an explicit group role;
- coral index contrast raised to AA;
- header CTA collapses below 352px, removing 320px overflow;
- reduced motion collapses Market animations/transitions;
- 404 gradients replaced with measurable solid contrast and a focus ring;
- decorative product visual has empty alt while every material fact remains
  visible as text.

## Manual/browser review

The repository browser runner exposed 26 interactive elements in the RU page’s
accessibility tree, including the skip link, brand/navigation, buyer/seller
CTAs, eight FAQ buttons and footer support. Console errors: zero. Final captures
cover 320, 360, 390, 430, 768, 1024, 1280, 1440 and 1728 widths, Trust, 404,
focus, reduced motion and OG.

## Claims deliberately not made

- no VoiceOver/TalkBack pass;
- no native Uzbek language approval;
- no legal-review claim;
- no authenticated Owner Control Center a11y pass without owner credentials.

These are remaining human evidence gates, not automated failures.

