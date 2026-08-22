# GA4 owner setup — GPTBot.uz, 2026-08-22

Ten minutes of clicking in the GA4 UI. Nothing here can be done from the
repository: the Admin API write scope is not connected to this workspace, and
every analytics tool available to it is read-only. The site-side work is
finished and deployed — this is the half that is not code.

Until this is done, **every commercial SEO number on this site reads zero**,
regardless of how much traffic the pages earn.

| | |
| --- | --- |
| Property | `properties/540129731` — "GPTBOTUZ" |
| Measurement ID | `G-V87YFL96C7` |
| Stream | `14999373353`, `https://gptbot.uz/` |
| State read at | 2026-08-22, `get_google_analytics_measurement_health` |
| Issues reported by GA4 | 0 — the property is healthy, it is just configured for a funnel this site does not have |

---

## 1. Current state, exactly as GA4 reports it

**Key events registered — all three, and none of them can ever fire:**

| Event | Created | Why it never fires |
| --- | --- | --- |
| `purchase` | 2026-06-03 | There is no checkout on gptbot.uz. Nothing emits it. |
| `qualify_lead` | 2026-06-03 | Deliberately never emitted. A browser cannot see whether an enquiry was qualified — that needs a CRM callback which does not exist. A test enforces that the site never claims it. |
| `close_convert_lead` | 2026-06-03 | Same. A closed deal is invisible to the browser. |

**`generate_lead` is not in that list.** It is emitted by the site, on every
public page, and has been verified firing on production — but GA4 treats it as
an ordinary event, so it appears in no conversion report.

**Custom dimensions registered: 0.** `service_slug`, `cta_zone`, `locale`,
`method` and `page_kind` are sent with every lead and are currently
unreportable — GA4 receives them and discards them at report time.

**Consequence:** organic sessions rose from 42 to 253 across the last two
28-day windows, and key events read 0 in both. That zero is a configuration
artefact, not a commercial fact.

---

## 2. What the site actually sends

Captured from production on 2026-08-22 by clicking the contact CTA on
`/uz/smm-xizmatlari/` with navigation suppressed, and reading `dataLayer`:

```
telegram_demo_click     { cta_text, page_path, page_title, target_url }
telegram_open_attempt   { contact_kind: "contact", cta_text, page_path, target_url }
generate_lead           { service_slug: "smm-xizmatlari", cta_zone: "hero",
                          locale: "uz", method: "telegram",
                          page_kind: "landing", cta_text, page_path }
```

`generate_lead` fires **only** on a click to `t.me/XGame_changerx` or
`t.me/GPTBot_support`. Clicks on the product bots (`BormiMarketBot`,
`gptbot_javob_bot`, `gptbotuz_bot`) emit `telegram_open_attempt` with
`contact_kind: "product_bot"` and are **not** counted as enquiries.

Every contact link is `target="_blank"`, so the click opens a new tab and the
page survives long enough for the queued event to reach gtag.js.

---

## 3. Do this — step 1, mark the real lead event

1. Open **Admin** (bottom-left gear) → under *Data display*, click **Events**.
2. Find `generate_lead` in the list. If it is not there yet, click the **Realtime**
   report, open <https://gptbot.uz/uz/smm-xizmatlari/> in another tab, click
   **"Bepul maslahat olish"**, and it will appear within about 30 seconds.
3. Toggle **"Mark as key event"** on for `generate_lead`.

Then open **Admin → Key events** and toggle **off**:

- `qualify_lead`
- `close_convert_lead`
- `purchase`

Leaving them on is not harmless: they make the property's conversion count
permanently zero and hide the one event that is real.

> Do **not** mark `telegram_open_attempt`, `telegram_demo_click`,
> `seo_landing_view` or `page_view` as key events. They fire on curiosity, not
> on intent, and marking them would make the lead number meaningless in the
> other direction.

## 4. Do this — step 2, register the five dimensions

**Admin → Custom definitions → Custom dimensions → Create custom dimension.**
All five are **event-scoped**. Type the parameter name exactly as shown.

| Dimension name | Scope | Event parameter | What it answers |
| --- | --- | --- | --- |
| Service | Event | `service_slug` | Which service page produced the enquiry |
| CTA zone | Event | `cta_zone` | Whether the hero or the body CTA converts |
| Locale | Event | `locale` | Uzbek vs Russian enquiry share — the central strategic question |
| Contact method | Event | `method` | Currently always `telegram`; keeps the report honest if that changes |
| Page kind | Event | `page_kind` | Money page vs article |

GA4 backfills nothing: dimensions only apply to data collected **after** they
are created, so this is worth doing in the same sitting as step 1.

---

## 5. Verify — same day

**Realtime.** Admin → Realtime. Open a money page in another tab, click the
Telegram CTA. Within ~30 s the event stream should show `generate_lead`.

**DebugView** (more detail, needs the GA Debugger extension or
`?_dbg=1`): Admin → DebugView shows the full parameter payload — confirm
`service_slug` and `cta_zone` are present on the event.

**Reports → Engagement → Events.** `generate_lead` should carry a
non-zero count and be flagged as a key event.

## 6. Expect after 24–48 h

- **Reports → Engagement → Conversions** lists `generate_lead` with a count.
- **Reports → Acquisition → Traffic acquisition** shows key events attributed to
  Organic Search, so SEO stops being unmeasurable.
- **Explore → Free form**, with *Service* as the row dimension and *Key events*
  as the metric, gives per-service enquiry counts — the first time this business
  can see which service page actually earns work.

If `generate_lead` still shows zero after 48 hours **and** GA4 Realtime showed it
during step 5, the problem is attribution, not collection — say so rather than
re-editing the site.

---

## 7. What is deliberately not requested here

`qualify_lead` and `close_convert_lead` are **not** to be re-created against a
browser event later. They are honest names for real stages, and the only truthful
source for them is the CRM or the person answering the Telegram chat. If that
callback is ever built, they become server-side events with a real source — until
then the site claims a started enquiry and nothing more.
