# `generate_lead` — what the history actually contains

Retrieved from GA4 property 540129731 on 2026-08-25, key-event report,
breakdown by event and landing page, **channel = all** (not only organic), over
2026-07-01 .. 2026-08-24.

## The whole result

| Event | Host | Landing page | Key events | Users |
| --- | --- | --- | --- | --- |
| `generate_lead` | gptbot.uz | `/` | 2 | 1 |

One row. Nothing else in the window, on any channel.

## What that means, and what it does not

**Earliest observed event:** 2026-08-24.
**Organic?** No. Both events are on `channel = all` and do not appear under
`organic_search`. Landing page is the SPA homepage `/`, not a money page.
**Does it predate Key Event registration?** No — registration happened the same
day, 2026-08-24.
**Is the measurement reliable for a before/after comparison?** No.

The instrumentation timeline:

| Date | What happened |
| --- | --- |
| 2026-08-21 | `generate_lead` first appears in `scripts/analytics-snippet.ts` |
| 2026-08-22 | the same block is added to `index.html`, so the homepage starts firing it |
| 2026-08-24 | the event is marked a **Key Event** in the GA4 admin |
| 2026-08-24 | first and only observed firing: 2 events, 1 user, landing `/` |

Key Event marking is **not retroactive**. Any period before 2026-08-24 has zero
key events because there was no key event defined, not because there were no
enquiries. A "0 → 2" comparison across that boundary measures the installation
of the instrument.

**Correct statement of the finding:**

> The lead instrument was verified working on 2026-08-24: two `generate_lead`
> events from one user on the homepage, from a non-organic channel. No organic
> lead has been observed. There is no measurable history before 2026-08-24, so
> no before/after comparison is possible and none should be reported.

**Statements that must not be made:**

- "leads went from 0 to 2"
- "SEO produced 2 leads"
- any conversion rate computed against a pre-2026-08-24 denominator

## The measurement caveat that survives

`gtag` is deferred by 30–34 seconds behind first interaction
(`setTimeout(idleLoad, 30000/32000/34000)`), which drops short mobile sessions
entirely. GA4 also reports ~55% more "Organic Search" sessions than Search
Console reports Google clicks, because GA4's Organic Search is not Google-only.
Two errors of unknown size in opposite directions: use GA4 for behaviour, Search
Console for demand, and never present a GA4 percentage as a search result.

## Why the six custom dimensions matter right now

`customDimensionCount = 0` on this property. The parameters below are **already
being sent** with every `generate_lead` and every `telegram_open_attempt`, and
are unreadable in every GA4 report until someone registers them. Registration is
not retroactive: each day that passes is a day of data that can never be broken
down.

`service_slug`, `contact_kind`, `locale`, `page_kind`, `target_url`, `cta_zone`.

`contact_kind` is the one that matters most. `telegram_open_attempt` fires for
**every** `t.me` link including the product bots; only `contact_kind: 'contact'`
separates a service enquiry from someone opening the AI chat bot. Until it is
registered, `telegram_open_attempt` must never be promoted to a key event — it
would count AI-chat traffic as commercial leads.

Owner steps are in `docs/seo/GA4_OWNER_SETUP_2026-08-22.md`. This release adds
the two things the repository could do on its own: both events now carry all six
dimensions, and `tests/seo-analytics-privacy.test.ts` fails if either one stops.
