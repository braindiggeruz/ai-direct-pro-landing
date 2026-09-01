# GPTBot.uz — organic contact and lead measurement contract

Date: 2026-08-31

Scope: public website browser events and the future CRM hand-off.
Production change: not included in this branch until a separate merge/deploy decision.

## Why this contract exists

A browser can observe a click on a Telegram URL. It cannot observe whether Telegram opened successfully, whether the visitor sent a message, whether GPTBot received it, whether the request was qualified or whether a sale occurred. Treating the click as `generate_lead` inflated the lead stage and made organic conversion reporting unreliable.

Google's recommended-event reference defines `generate_lead` for a lead that has been generated, for example through a form. Later lead stages such as `working_lead`, `qualify_lead` and `close_convert_lead` require corresponding business-state evidence.

Primary references:

- https://developers.google.com/analytics/devguides/collection/ga4/reference/events
- https://support.google.com/analytics/answer/14239696

## Event contract

| Event | Trigger | What it proves | What it does not prove | Source |
|---|---|---|---|---|
| `telegram_open_attempt` | Click on any `t.me` or `tg:` destination | A Telegram destination was activated | Successful app open, message, contact or lead | Browser |
| `contact_click` | Click on GPTBot's published contact handle | The official contact channel was activated | Message sent, request received, qualification or sale | Browser |
| `generate_lead` | Future acknowledged form, contact bridge or CRM intake | A lead record/request was actually generated | Qualification or sale | Server/bridge/CRM only |
| `working_lead` | Future CRM state showing a representative is working the request | The lead entered active handling | Qualification or sale | CRM only |
| `qualify_lead` | Future CRM state meeting the documented qualification rule | The request meets the qualification rule | Closed sale | CRM only |
| `close_convert_lead` | Future CRM state for a completed conversion | The documented conversion state was reached | Revenue unless separately reconciled | CRM only |

The current browser implementation emits only the first two events. It deliberately does not emit the four business-state events.

## Browser payload

`contact_click` carries only non-secret, non-input context:

- `page_path`;
- `locale`;
- `page_kind`;
- `service_slug`;
- truncated `cta_text`;
- `cta_zone`;
- public `target_url`;
- `contact_kind=contact`;
- `contact_method=telegram`.

It reads no form value, phone, email, message text, cookie value, localStorage value or visitor-supplied identifier. Product-bot links remain `telegram_open_attempt` with `contact_kind=product_bot` and never become `contact_click`.

## GA4 owner dependency

To report the custom parameters in standard reports or Explorations, an Editor/Administrator must create event-scoped custom dimensions for the parameters that are not already available as predefined dimensions. At minimum register `service_slug`, `contact_kind`, `locale`, `page_kind`, `target_url`, `cta_zone` and `contact_method`. Google notes that custom definitions are used to report custom event parameters and can take 24–48 hours to appear in reports.

Do not mark `contact_click` as a qualified-lead or revenue key event. A separate key-event decision may be made for contact starts, but reports and dashboards must name the stage truthfully. Reserve `generate_lead` for the future acknowledged intake event.

## Acceptance criteria

1. Clicking a GPTBot Telegram contact queues both `telegram_open_attempt` and `contact_click`.
2. Clicking a product bot queues `telegram_open_attempt` only.
3. No public-page click handler emits `generate_lead`.
4. `contact_click` includes `contact_method=telegram` and all commercial breakdown fields.
5. The prerendered snippet and `index.html` stay equivalent.
6. No analytics payload reads personal input.
7. Yandex Metrika's existing `telegram_cta_click` goal remains unchanged.
8. A future `generate_lead` implementation must have an acknowledgement source, idempotency rule and test fixture.
