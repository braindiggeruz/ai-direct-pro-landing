# GPTBot Market owner evidence script

Use only after production deployment. Do not send a bot token, user/chat ID,
phone number, private conversation, login credential or raw customer data.

## Telegram owner canary

1. Open `@gptbot_market_bot` on the device/locale being reviewed.
2. Send `/start`; capture the complete first screen.
3. Send `настольная лампа до 200 000 сум` (or the Uzbek Latin equivalent);
   capture one grounded result card plus its next-action controls.
4. Report in one sentence whether the purpose, source/freshness, price/stock
   and request-not-payment next step were clear.
5. State device, OS, Telegram client and selected locale. Crop or cover any
   personal header/avatar; do not expose IDs.

## Owner Control Center capture

Use the owner’s existing protected session. Never share the credential.

1. Login context: `/admin-tools/login`, no credentials visible.
2. Desktop overview: `/admin-tools/agents` at approximately 1440px.
3. Mobile overview: the same route at approximately 390px.
4. Populated synthetic: `/admin-tools/agents/stores` showing the controlled
   synthetic store.
5. Empty: `/admin-tools/agents/orders` and handoffs if empty.
6. Read-only: repeat overview with an existing `support_readonly` account, if
   one is already provisioned; do not create an account just for evidence.
7. Confirmation: open a store action confirmation but do not submit it.
8. Error: open an invalid store detail route and capture the bounded error.

Sanitize email, actor identifiers, request IDs and any contact fields. If a
read-only account is not available, record `not captured — account absent`.

## Store Pilot #1 owner inputs

Provide as one approved package outside public Git:

- one category and one verified seller;
- dated seller consent, including buyer-contact forwarding and no GPTBot
  payment processing;
- 10–30 products with integer UZS prices, stock baseline, approved photos sent
  through the bot or an explicit no-photo decision, SKU and verified specs;
- fulfillment and seller-handled payment methods;
- seller response SLA, support owner, incident lead and daily reviewer;
- cohort bounds, prohibited-category confirmation and escalation route;
- legal decision for the trust copy, native Uzbek sign-off, and explicit
  production authorization to onboard that one store.

Pilot duration and fee must be owner decisions; no default is inferred. This
package does not authorize payments, public marketplace or public launch.
