# Independent engineering review — pSEO20, 2026-11-08

Reviewer scope: `scripts/pseo-learning.ts`, `scripts/pseo-documents.ts`, `public/assets/pseo-20261108/practice.js`, `pseo.css`, shared renderer changes in `prerender.ts`, `prerender-blog.ts`, `tool-first.ts`, `practice-quiz-block.ts`, and `src/shared/content-downloads.ts`. Also inspected the existing keyboard hook and Metrika contract where the new layout integrates with them.

No source changes, builds, deployments, API submissions or external data requests were made by this review. The only authored repository file is this report. Browser reproduction used headless Edge with all requests fulfilled from the existing local `dist/`; external origins were aborted and `/api/` returned a synthetic offline response. Consequently it does not establish production behavior or real-device keyboard behavior.

## Findings identified and closed

### P1 — opening the mobile keyboard scrolls the AI chat off-screen

**Location:** new tool-first integration in `scripts/pseo-learning.ts:50`, `scripts/prerender.ts:562`; existing `src/gpt-chat/keyboard.ts:43`.

The new pages put a complete 12-question quiz before `#main`, which contains the chat. On a coarse-pointer device, the existing `useKeyboardOpen` hook detects keyboard opening, reduces the chat height, then calls `window.scrollTo(0, 0)`. That scroll target assumes the chat begins at the document top. On the new pages it instead returns the visitor to the quiz, leaving the focused composer thousands of pixels below the viewport.

**Reproduction against the actual built chat bundle:** `/uz/tenglama-yechish/`, mobile viewport 390×844, touch enabled; focus the mounted chat textarea, then dispatch a visualViewport resize from height 844 to 500. The viewport object is controlled by the test so no physical keyboard is required.

| State | scrollY | #main viewport top | #main height | Active element | data-keyboard |
|---|---:|---:|---:|---|---|
| Before | 7246 | −365.97 | 844 | TEXTAREA | absent |
| After | 0 | 6880.03 | 500 | TEXTAREA | open |

**Minimal fix:** scroll to the chat's actual document offset (`window.scrollTo(0, main.offsetTop)`) rather than zero, or equivalently align `#main` to the viewport. For ordinary chat pages whose `#main` starts at zero, this preserves the old result. Confirm the very tight `chat-start` Brotli budget after changing the shared hook. This is an existing assumption exposed by the new layout, not an arithmetic-tool defect.

**Status: CLOSED.** Root changed the scroll target to `main.offsetTop`. Repeated the same browser reproduction against rebuilt `gpt-chat-DfSqotbQ.js`: `scrollY=6880`, `#main.top=0.03125`, height 500, active TEXTAREA and `data-keyboard=open`. The composer now stays in the chat viewport rather than jumping to the quiz. Exactly one H1 remains.

### P2 — no-JavaScript quiz controls are visibly active because CSS overrides `hidden`

**Location:** `scripts/widgets/practice-quiz-block.ts:123` and `:221`; new cohort CSS in `public/assets/pseo-20261108/pseo.css`.

The quiz toolbar carries the HTML `hidden` attribute until its module binds. Its inline rule `#practice-quiz .pq-bar { display:grid }` has greater specificity than the shared Tailwind `[hidden] { display:none }`. Therefore a no-JavaScript visitor sees an empty score and a Restart button that cannot work. The shared inline CSS occurs later in the document than the new stylesheet; merely adding a low-specificity `[hidden]` rule in that stylesheet is insufficient.

**Browser evidence:** with JavaScript disabled on the actual built equation page, `bar.hidden === true` while `getComputedStyle(bar).display === 'grid'`. Restart had a visible 157.44×44 rectangle at x=46, y=1433.63. Native answer `<details>` remained available, and page width did not overflow.

**Minimal scoped fix:** `.ps-learning #practice-quiz [hidden]{display:none!important}` in the cohort stylesheet, or another deliberately stronger exact-cohort rule. Check the initial toolbar remains hidden without JS and appears normally after binding. The base defect also exists in the older quiz widget, but a cohort-scoped fix avoids unnecessary old-page output changes.

**Status: CLOSED.** Root added the scoped `hidden!important` rule. Browser recheck against final local `dist/` with JavaScript disabled: `bar.hidden=true`, computed display `none`, Restart height 0; all 12 native answer details remain present, and there is no horizontal body overflow. With JavaScript enabled the toolbar binds and displays as `grid`.

### P2 — malformed numbers silently become a different equation

**Location:** `public/assets/pseo-20261108/practice.js`, `solveLinearEquation` normalization.

Originally every whitespace character was removed before tokenization. This merges separate numeric tokens rather than reporting invalid input:

- `1 2x=24` returned `x = 2`, after treating the coefficient as 12.
- `1 2=12` returned the all-solutions result, after treating the left side as 12.

This is an educational correctness issue: the solver validates and explains an equation different from what was entered. It is not code execution; no `eval` is used.

Root added a pre-normalization guard while this review was in progress. The first guard covers digits and decimal points, but also needs the supported decimal comma: `x=1 , 2` must not silently become `x=1.2`. Preserve valid spacing between a coefficient and `x`, and around operators, e.g. `2 x + 3 = 7`.

**Status: CLOSED.** Root's final guard is `/[\d.,]\s+[\d.,]/`. Direct execution of the rebuilt `dist/assets/pseo-20261108/practice.js` rejected all five regressions: `1 2x=24`, `1 2=12`, `1 .2x=12`, `0. 1x=1`, `x=1 , 2`. Valid `2 x + 3 = 7` still yields 2; `0,1x + 0,2 = 0,3` still yields 1. `tests/pseo-tools.test.ts` passes 3/3, including the new refusal cases.

## Closed during the review

### P2 — equation output lacked the existing Webvisor privacy mask

The input had `ym-hide-content`, but the dynamically rendered answer, coefficients and verification steps were initially outside any mask. `scripts/analytics-metrika.ts:169` enables Webvisor and its documented contract requires user-derived content to be masked. Therefore the tool's own lack of fetch/storage calls was not sufficient to keep entered equation values out of session recording.

Root added `class="ym-hide-content"` to the `data-equation-output` container in `scripts/pseo-learning.ts:44`. Source recheck confirms that the mask remains on the container when `replaceChildren()` updates its children. No actual third-party collection was attempted or observed.

**Status: CLOSED.** Source fix and rebuilt-browser DOM verified: both the equation input and result container have `ym-hide-content`. No actual third-party collection was attempted or observed.

## Checks passed

- Exact cohort selection: practice pages require one of ten URLs, Uzbek locale, `gpt-chat`, teacher role, the expected quiz set, and exactly the practice-quiz widget. Document styling/download blocks require exact Uzbek article URLs. No broad URL-prefix opt-in was found.
- Existing pages do not gain the new tool-first branch or cohort stylesheet. Related-article filtering explicitly prevents the new documents from displacing existing protected-chat recommendations.
- All 20 existing built cohort pages have exactly one H1 and no duplicate HTML IDs. The mounted equation page also retained exactly one H1 after chat hydration; empty `data-h1` prevents a second chat heading.
- The solver uses bounded input, exact BigInt fractions and arithmetic operations, with no source evaluation. An independent oracle checked **1,500** deterministic equations with positive/negative integer coefficients, unique solutions, identities and contradictions: **1,500 passed**. Additional decimal, negative, fractional, zero-coefficient and rejected-expression examples behaved correctly apart from the whitespace issue above.
- Every result insertion uses `textContent` and DOM creation; no user-input `innerHTML`, fetch, storage or model request appears in the local solver script.
- The multiplication table is server-rendered with 100 correct cells, caption, row/column headers, a labelled keyboard-focusable horizontal scroll region, and a live result. Its controls remain hidden without JS; the complete table remains readable.
- The equation tool retains a static worked example and a disabled submit button without JS. Its label, description and live result are present. Unsupported input sets `aria-invalid` and produces a textual error.
- The quiz statically includes all questions, options, keys and explanations. Native `<details>` makes explanations accessible without scripting. Correct/incorrect styling and text are both present; no color-only feedback dependency was found.
- The new external CSS is scoped to `ps-*` classes or `.ps-learning #practice-quiz` selectors. The shared widget's later inline rules were inspected for specificity, which produced the toolbar finding above. No additional harmful style leakage was found.
- Document downloads use exact allowlisted paths, escaped authored text and static files. No private-data collection, invented translation partner, auto-send or new runtime API was introduced by their rendering.

## Review result and release acceptance

**PASS for the reviewed engineering scope. No open P0/P1/P2 findings remain after independent rebuilt-artifact rechecks.** The root agent still owns the full protected SEO comparison, compressed-bundle budgets, normal release checks and deployment. This review neither ran a build nor modified the fixes, and does not claim a full production audit, physical-device keyboard testing or business acceptance.
