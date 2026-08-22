# Owner actions — GPTBot.uz, 2026-08-22

Only things an agent cannot honestly do. Everything engineering could finish is
finished and deployed; nothing below is waiting on code.

Seven items. Ordered by how much they unblock, not by effort.

---

## 1. Mark `generate_lead` as a Key Event in GA4 — 5 minutes

**What I need:** two toggles in the GA4 UI.

**Why:** the site emits `generate_lead` on every contact click and this was
verified firing on production. GA4's registered key events are `purchase`,
`qualify_lead` and `close_convert_lead` — **none of which can ever fire**. So
every conversion report reads zero while 253 organic sessions arrive per month.

**Exact steps:** GA4 → Admin → Events → toggle *Mark as key event* on
`generate_lead`. Then Admin → Key events → toggle **off** `qualify_lead`,
`close_convert_lead` and `purchase`. Full walkthrough with verification:
`docs/seo/GA4_OWNER_SETUP_2026-08-22.md`.

**What I do once it is done:** nothing — it starts working immediately. At the
2026-09-21 checkpoint the enquiry count becomes readable for the first time.

**Expected effect:** commercial SEO becomes measurable. Without it, nothing else
in this plan can be judged.

---

## 2. Register five custom dimensions in GA4 — 5 minutes

**What I need:** five event-scoped custom dimensions created:
`service_slug`, `cta_zone`, `locale`, `method`, `page_kind`.

**Why:** the site already sends all five with every lead. The property has **zero**
custom dimensions, so GA4 receives them and discards them. Without this you can
see *that* an enquiry happened but never *which service page* produced it — which
is the only question that decides where to spend next.

**Exact steps:** Admin → Custom definitions → Custom dimensions → Create. Names
and parameters are tabulated in `GA4_OWNER_SETUP_2026-08-22.md` §4.

**Note:** GA4 backfills nothing. Data before the dimension exists is lost, so
this is worth doing in the same sitting as item 1.

---

## 3. Decide the phone number, and the address question — one decision

**What I need:**

```
REAL PHONE:
REAL PUBLIC ADDRESS OR SERVICE AREA:
```

**Why:** `content/global/site.json` publishes `"phone": ""` and a city-level
`"address": "Tashkent, Uzbekistan"`. This single blank blocks the Google Business
Profile **and** eight of the eleven directory listings. The local pack holds
positions 3–8 on every Russian agency query; without a profile, half of each of
those SERPs is unreachable at any content quality.

A **service-area business** — no street address shown — is a legitimate,
fully-featured profile type and the honest option for a studio without a public
office. It is not a compromise.

**What I do once provided:** write it into `site.json`; the `ContactPoint` and
`Organization` schema on all 121 pages follow automatically, and the directory
forms become completable.

**Do not invent an address to get past this.**

---

## 4. Decide four starting prices — the largest ranking-relevant gap

**What I need:**

```
SEO STARTING PRICE:
SMM STARTING PRICE:
WEBSITE STARTING PRICE:
TELEGRAM ADS SERVICE STARTING PRICE:
```

A floor you will honour. `2 000 000 so'mdan`, not a range.

**Why:** every page holding a top-3 slot in this market publishes a countable
fact. For `sayt yaratish narxi`, **all ten** top-ten results carry a figure;
GPTBot's fourteen money pages carry none. A page with no number cannot satisfy a
price query however well it is written.

**What I do once provided:** add the figure beside the existing honest sentence —
scope drives the number, consultation is free — on each money page and in its
meta description. No `Offer` schema (the cluster test forbids it, correctly: a
floor is not an offer). Full per-page model, including which pages should *not*
get a price, in `docs/seo/BUSINESS_FACTS_REQUIRED_2026-08-22.md`.

**Expected effect:** the strongest available on-site move toward top 3 on the
Uzbek commercial queries.

---

## 5. Supply the list of client sites GPTBot built — the only link route that scales

**What I need:** the inventory table in
`docs/seo/CLIENT_CREDIT_PROGRAMME_2026-08-22.md` filled in — domain, client,
whether GPTBot built it, whether there is still deployment access.

**Why:** oqila.uz has **463 referring domains** against GPTBot's 8, and its
largest donors are its own client sites carrying a footer credit. GPTBot builds
websites, so it can do exactly this — on-topic, editorially truthful, no
outreach, no directory approval, no payment. The repository contains no
portfolio, no case studies and no client-site list, so the size of this
opportunity is currently invisible.

**What I do once provided:** one rotated, language-matched credit line per site
where permission is granted, pointing at the relevant service page.

**Permission is required per client. Never edit a client's site without it.**

---

## 6. Decide whether to publish a project or client count — optional, high value

**What I need:**

```
FOUNDING YEAR:
VERIFIABLE PROJECT COUNT:
VERIFIABLE CLIENT COUNT:
```

**Why:** `repid.uz` holds **#1 on `seo xizmati`** with one spam-score-30 backlink
and a domain rank of 0. What it has instead is in its title:
*"SEO xizmati Toshkent — 24 loyiha natijasi"*. `saytyaratish.uz` uses
*"300+ saytlar · Bozorda 2015 yildan"*. These are the cheapest competitive
signals in the market and GPTBot publishes none of them.

Only supply a number you can defend. A count that cannot be evidenced is worse
than no count.

---

## 7. Start the four citations that need no phone number — 30 minutes

**What I need:** an account created and a listing submitted on four directories
that do not require a phone: **uz.tgstat.com** (GPTBot already runs qualifying
Telegram channels), **fastbase.com**, **konigle.com**, **ppc4.com**.

**Why:** these four can be done today, before item 3 is decided. The other seven
directories — including goldenpages.uz, yellowpages.uz, glotr.uz, tovar.uz,
birbir.uz and olx.uz, several of which *rank inside the SERPs being targeted* —
need the phone number from item 3.

**Exact data to paste into each form:**
`docs/seo/CITATION_EXECUTION_PACK_2026-08-22.md`.

**What I do once live:** add each listing URL to `sameAs` in `site.json` and
redeploy, which is what ties the citation back to the entity.

---

## Not on this list, deliberately

- **Reviews.** Ask a happy client once, with a direct link. Never buy, script or
  incentivise them. That is the fastest way to lose a profile.
- **`qualify_lead` / `close_convert_lead`.** These stay unimplemented until a CRM
  can report them. The browser cannot see whether a conversation was answered or
  won, and emitting them would make the funnel a lie.
- **More Uzbek pages.** Five shipped in the last 48 hours and none has an
  impression yet. The 2026-09-15 checkpoint decides whether that layer works
  before anything is added to it.
