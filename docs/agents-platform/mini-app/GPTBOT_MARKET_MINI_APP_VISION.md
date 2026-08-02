# GPTBot Market Mini App vision

## Product outcome

GPTBot Market becomes one connected commerce system with two complementary
interfaces:

- the Telegram bot is the voice, entry point, notification channel, human
  bridge and emergency fallback;
- the Mini App is the visual workspace for discovery, comparison, requests,
  order tracking and authorized seller operations.

The transition is a UI migration, not a domain rebuild. The product succeeds
when a user can switch surfaces without changing the meaning of price, stock,
order status, seller authority or notification state.

## Users and primary jobs

| User | Primary jobs | Appropriate surface |
| --- | --- | --- |
| Buyer | discover, filter, compare, submit a request, track it, ask seller | Mini App primary for visual work; bot for entry, text search, alerts and recovery |
| Verified seller owner | see exceptions, process orders, answer questions, maintain catalog/stock | one authority-aware Mini App shell; bot alerts and fallback |
| Unverified seller | understand verification and pilot process | informational Mini App state or bot interest flow; never seller controls |
| Platform owner/support | operate pilots, audit, replay automation, lifecycle control | existing protected Owner Control Center |

## Information architecture verdict

One Mini App shell should serve buyers and verified sellers. Authority-aware
navigation is derived by the server and changes destinations, never rights.
The seller workspace uses a separate `/seller/*` route group and entry link so
tasks are clear, but it is not a separate frontend or account system.

Buyer primary navigation after evidence-based simplification:

1. `Главная / Bosh sahifa` — search, categories and recent context;
2. `Сравнение / Taqqoslash` — shown only when a comparison exists;
3. `Заказы / Buyurtmalar` — durable buyer history;
4. `Магазин / Do‘kon` — only for a server-verified seller, otherwise a
   clearly labelled seller invitation/help entry.

Search results and product detail remain routes, not permanent tabs. Favorites
are excluded until pilot evidence proves a job that the existing comparison
and storefront session do not cover.

Seller primary navigation:

1. `Сегодня / Bugun` — exception-first dashboard;
2. `Заказы / Buyurtmalar`;
3. `Вопросы / Savollar`;
4. `Товары / Mahsulotlar`;
5. `Ещё / Yana` — categories, stats, store state, support and buyer mode.

## Surface responsibilities

### Bot remains responsible for

- `/start` and contextual entry;
- menu/inline launch links and safe deep-link routing;
- lightweight text catalog search when the app is unavailable;
- seller and buyer notifications;
- order updates and handoff replies;
- conversational clarification and recovery;
- emergency fallback while a Mini App flag is disabled.

### Mini App becomes responsible for

- visual home, category and product discovery;
- filters, product detail, comparison and media presentation;
- progressive request/checkout UI using the existing checkout workflow;
- order list, detail and status timeline;
- buyer question/handoff UI;
- verified seller dashboard, queues and carefully staged mutations;
- RU/Uzbek Latin, Telegram themes, safe areas and all UI states.

### Owner Control Center verdict

Keep the Owner Control Center as a separate protected web tool through Pilot
#1. It carries platform-wide authority, automation/DLQ and audit capabilities
that must never enter a public buyer/seller client. A private mobile owner view
is not justified by current evidence; reconsider only after observed operator
tasks demonstrate a mobile need.

## Design direction

Use the existing `Warm Market Signals` contract:

- warm ivory and paper surfaces;
- deep teal for trust and dominant actions;
- coral for one active signal, never generic decoration;
- Geist for Cyrillic and Latin, tabular UZS numerals;
- one dominant action per screen;
- mobile-first 320–430 px layouts, 44 px minimum targets, no horizontal
  overflow or critical icon-only actions;
- source, freshness, availability and store identity shown as facts;
- all loading, empty, error, stale, paused, suspended and offline states
  designed before rollout.

Reuse the semantic tokens and brand assets in
`docs/product/GPTBOT_MARKET_DESIGN_SYSTEM.md` and `public/assets/market/`.
Do not reuse public landing composition components: hero gradients, long-form
marketing sections, desktop navigation, SEO FAQ patterns and scroll animation
are not app UI.

## Success measures

The North Star remains completed requests/orders without seller intervention
per active store-week, interpreted with seller response and error guardrails.
Mini App adoption is not success by itself. Stage gates use:

- qualified search → results shown;
- product viewed → request started;
- request started → completed;
- order status viewed without support recovery;
- seller tasks completed within service window;
- fallback-to-bot rate and recovery success;
- technical error rate, crash-free sessions and latency;
- zero cross-tenant, duplicate-order, duplicate-stock or PII incidents.

## Explicit exclusions

Payments, refunds, fiscal receipts, public marketplace aggregation, CRM,
staff self-service expansion, separate seller bots, platform-owner Mini App,
real-store onboarding and public launch are outside the first Mini App program.
