# Calculator and React CTA: GA4 delivery

2026-10-03. Base inspected: `fd86abb6a3f7afe4991c4ac143ff7a4eb611696b`. This note covers the local patch; deployment and browser acceptance belong to the release owner.

## Problem and change

`src/lib/cta.ts` previously pushed plain event objects to `dataLayer`. The captured public GTM container had no tags/rules, so these objects had no configured route to GA4. The shared helper now calls the installed `gtag('event', name, data)` when available. Since gtag already queues into dataLayer, it does not also push a plain object. Without gtag, the previous dataLayer fallback remains.

Meta retains its current mapping: `click_contact` → `Contact`, `view_section` → `ViewContent`, other names → `trackCustom`. A failing Google tag cannot prevent the independent Meta call. An ambiguously failing gtag call is not retried through a second route, avoiding possible duplicate delivery. Ordinary clicks are not converted to `generate_lead` or Meta `Lead`.

`src/calculator/CalculatorApp.tsx` keeps its existing `calculator_lead_submitted` diagnostic event. After the existing literal `body.ok === true` acceptance gate, it additionally emits one standard `generate_lead` with:

```json
{
  "lead_source": "calculator",
  "service_slug": "telegram-bot",
  "page_path": "/ru/kalkulyator-stoimosti-telegram-bota/"
}
```

`page_path` comes from `location.pathname`; query strings, typed name/contact, estimate text, attribution identifiers and requestId are not included. Parameter names match the existing service-form event. Backend request/response, deduplication, contact consent and Yandex goals are unchanged.

The standard event means the server acknowledged this action; an acknowledgement can also be an existing/deduplicated lead. It does not prove a new unique lead, notification delivery, qualification or sale. The old custom event remains diagnostic and should not be added to generate_lead as a second lead count.

## Verification

- `tests/cta-analytics.test.ts`: 7 runtime tests execute the real helper. They cover the inline gtag Arguments queue before library load, exactly one Google route, fallback creation/append, existing Meta standard/custom events, no leads from ordinary clicks, and unavailable providers.
- With `tests/studio-contact.test.ts` and `tests/telegram-cost-calculator.test.ts`: **31 passed / 0 failed**. The calculator tests cover pricing and summary, not form delivery. The built-site contact assertion uses the prior local build; the release owner rebuilds before production.
- `npx eslint src/lib/cta.ts src/calculator/CalculatorApp.tsx tests/cta-analytics.test.ts`: exit 0. `npx tsc -b --pretty false`: exit 0. `git diff --check`: no whitespace errors. No live form was sent by this change's author.

Required browser acceptance by the release owner: local mocked success creates one generate_lead only after `ok:true`; pending repeat submit, network failure and rejected/malformed acknowledgement create none; diagnostic and Meta events keep their names; payload contains no typed fields. After authorised deployment, verify the new bundle/readback and GA4 delivery separately. Unit tests do not prove `/g/collect` delivery or appearance in property `540129731`.

The currently confirmed routing defect does not establish the cause or number of missing September leads. Keep the historical GA4 aggregate and this current code finding separate.
