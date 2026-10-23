# Browser QA — 2026-10-23

Completed against the freshly built local `dist`, using system Google Chrome through the existing `playwright-core` dependency. One browser ran sequentially; no dependencies were installed. Every API request was intercepted and mocked, all external requests were blocked, and the local server rejected non-GET/HEAD requests. No production submissions, external messages, AI calls or payments occurred.

## Results

- `browser-qa.json`: **21/21 page checks passed** across widths 320, 390 and 1280; **2/2 real browser lead workflows passed**.
- `browser-qa-chat-trial.json`: **3/3 supplemental chat checks passed** at the same widths with a synthetic lifetime allowance of three answers and the live-mode purchase controls visible. No purchase was attempted.
- All checked pages have exactly one H1 matching current content, the expected canonical URL, a visible and enabled relevant control, no document-level horizontal overflow, no uncaught page errors and no missing local resources.
- Articles contain horizontally scrollable tables on narrow viewports; descendant table bounds can extend past the viewport inside their scroll containers, while the document itself remains within the viewport.

## Pages

1. `/ru/razrabotka-telegram-bota-tashkent/`
2. `/uz/chat-bot-narxi/`
3. `/ru/blog/skolko-stoit-sozdat-sayt-tashkent-2026/`
4. `/uz/blog/sayt-yaratish-narxi-toshkent-2026/`
5. `/uz/gpt-uzbek-tilida/`
6. `/uz/blog/chatgptga-qanday-kirish-mumkin/`
7. `/ru/kalkulyator-stoimosti-telegram-bota/`

## Lead workflows

The static Telegram-service form and the calculator were exercised in the browser at 390px. Each workflow:

- Simulated a lost network response; the UI explicitly stated that the outcome was uncertain.
- Retried without changing input and sent the same request ID; a mocked idempotent acknowledgement then showed success.
- Simulated another lost response and changed the name; the next request had a different ID.
- Returned contact-duplicate acknowledgements; the UI explained that the earlier lead existed but new details had not been added, and kept the entered fields visible.
- Changed budget (static form) or volume/estimate inputs (calculator); the next request again had a different ID.
- Preserved the calculator's copy-summary control.

These checks verify browser behavior against controlled response fixtures. They do not establish real CRM/Telegram delivery or production analytics ingestion. Those remain separate business acceptance checks.

## Screenshots reviewed

Files are in `browser-screenshots/`. Visual inspection covered `ru-telegram-service-320.png`, `uz-chat-320.png`, `uz-bot-price-390.png`, `ru-site-price-article-390.png`, `lead-page-duplicate-390.png` and `lead-calculator-duplicate-390.png`. Text, controls and duplicate-state messages were readable, with no document-level horizontal overflow. Chat screenshots were refreshed by the lifetime-trial supplemental run; their account state is synthetic.

## Test-harness correction

The initial run concatenated the domain onto canonical values even when the content already contained an absolute canonical. Actual rendered canonical URLs were correct. This test-harness defect was fixed using `new URL(value, origin)` and the complete page run was repeated successfully. Initial evidence is retained explicitly as `browser-qa-initial-fixture-error.json`; its 15 canonical failures are not site defects.

## Re-run

```text
node reports/seo-recovery-20261023/browser-qa.mjs
node reports/seo-recovery-20261023/browser-qa.mjs --only=uz-chat --skip-leads --evidence=browser-qa-chat-trial.json
```

Run only after the final prerender/build has finished. The script saves structured evidence and viewport screenshots; it exits nonzero on any failed check.
