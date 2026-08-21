# Handoff — Commercial SEO TOP-3 execution, 2026-08-21

Written at the end of the session that researched the Uzbek commercial search
market, built the Uzbek commercial layer, fixed lead measurement and shipped all
of it to production. Everything below is either measured, quoted from a tool
response, or explicitly labelled as inference.

Read sections 1, 6 and 11 before touching anything. Section 6 is the one that
will save you from repeating work that was already done or undoing a decision
that already has evidence behind it.

---

## 1. State at handoff

| | |
| --- | --- |
| Production | **LIVE** — deployed 2026-08-21 |
| `origin/main` | `d1d5a27` |
| Cloudflare deployment | `4bd14ab2.ai-direct-pro-landing.pages.dev` → `gptbot.uz`, `www.gptbot.uz` |
| Feature branch | `seo/commercial-top3-execution-20260821` (same SHA, kept for reference) |
| Base before this work | `a80cc3b` — "seo(content): implement OpenSEO growth sprint" |
| Worktree used | `F:\Claude\gptbot-seo-audit-20260821` |
| Working tree | clean |
| Smoke test | all green (section 9) |
| OpenSEO credits | 522 spent this session, **7154 remaining** |

Four commits, 17 files, +1189 / −5:

```
d1d5a27  docs(seo): local citation pack and Google Business Profile checklist    1 file,  +160
f1a5a0d  seo(ru): record four intent decisions, three hreflang pairs reciprocal  5 files, +77 -4
06444c4  seo(uz): open the Uzbek commercial layer for SMM and Telegram ads       9 files, +884
6bdcead  feat(analytics): emit generate_lead on the one contact action the site has  2 files, +68 -1
```

Nothing outside the SEO surface was touched. Bormi Mini App, marketplace, D1
migrations, Telegram Agents, Admin, auth and `wrangler.toml` are all untouched.

---

## 2. How to get this worktree running again

Two traps, both cost time the first round.

**No `node_modules`, and no `package-lock.json` in the repo.** `npm ci` is
therefore impossible. Instead of `npm install`, junction from a sibling worktree
that sits on the same commit:

```powershell
New-Item -ItemType Junction `
  -Path   "F:\Claude\gptbot-seo-audit-20260821\node_modules" `
  -Target "F:\Claude\gptbot-digital-paid-media-20260820\node_modules"
```

`node_modules/` is in `.gitignore`, so the junction never reaches the diff.
Check `git worktree list` first and pick a sibling on the same SHA.

**Node and wrangler.** Node v24.13.0, wrangler 4.118.0 (wrangler 4.x needs
Node ≥ 22). Wrangler already holds an OAuth session for
`braindigger.uz@gmail.com`, account `14ce9e04574f2e6d825e56ee603e5cd5` — no
`CLOUDFLARE_API_TOKEN` needed. Always run `wrangler whoami` before assuming a
deploy will work. A missing `challenge-widgets.write` scope warning is normal
and irrelevant to Pages.

**Preview.** `.claude/launch.json` inside the worktree is *not* what the browser
tooling reads; the workspace file `F:\Claude\.claude\launch.json` is. A config
named `gptbot-seo-exec-preview` on port 4188 was added there, pointing at this
worktree.

---

## 3. Data sources, and what is genuinely unavailable

| Source | Status | Notes |
| --- | --- | --- |
| Google Search Console | connected | property `sc-domain:gptbot.uz` |
| GA4 | connected | `properties/540129731` "GPTBOTUZ", stream `G-V87YFL96C7`, `issueCount: 0` |
| OpenSEO project | `7534113b-f748-4f98-ac39-9e3782d3d9e7` | domain gptbot.uz, loc 2860, lang ru |
| Site audit | `dd8fa667-c173-4d90-bf45-c62bdb74dc1d` | 2026-08-20, 200 pages, 9 issues all `info` |
| Keyword volume / CPC / competition | works | Google Ads data for location 2860 |
| **Keyword difficulty** | **NOT AVAILABLE** | `null` for all 199 keywords tested, RU and UZ |
| **Search intent** | **NOT AVAILABLE** | same cause |
| **Domain Analytics** | **NOT AVAILABLE** | `get_domain_overview`, `get_ranked_keywords`, `get_domain_keyword_suggestions`, `find_serp_competitors` are all DataForSEO Labs endpoints and do not serve location 2860 |
| Live SERP | works | `get_serp_results` — the only reliable competitor-discovery route for this market |
| Backlinks | works | `get_backlinks_overview` |
| Rank tracking | configured, never run | see section 10 |

**Why so much is missing:** Uzbekistan (location 2860) is served from Google Ads
data rather than the Labs dataset. Anything derived from Labs returns nothing.
Do not promise a KD number for this market — read difficulty off the live SERP
composition and the Google Ads competition index instead, which is what the
scoring in this session did.

**One more provider quirk:** `get_keyword_metrics` rejects `languageCode: "uz"`
with `Invalid Field: 'language_code'`. Uzbek keywords were queried with the
language omitted, falling back to the project default. Volumes are still valid —
keyword text plus location drives the lookup — but label the caveat when
reporting.

**A GA4 false alarm to remember:** an earlier preflight got
`ga4_not_connected` from `get_search_opportunities`. It was transient. Retry
before concluding GA4 is misconfigured; a second call the same day returned
`status: ok` with 121 candidate rows.

---

## 4. What the research found

Full research report is the artifact "Карта штурма TOP-3"
(`https://claude.ai/code/artifact/45401d9f-e2ed-4fb0-84d5-d8793315bc1d`).
The findings that drive every decision below:

### 4.1 Uzbek demand beats Russian, at a fraction of the competition

Google Ads, location 2860, pulled 2026-08-21. Competition is the Google Ads
index, 0 to 1.

| Uzbek | Vol/mo | CPC | Comp | Russian equivalent | Vol/mo | CPC | Comp |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| `sayt yaratish` | 1300 | $1.54 | 0.15 | создание сайта ташкент | 260 | $2.80 | 0.41 |
| `sayt yaratish xizmati` | 260 | $1.32 | 0.12 | разработка сайтов ташкент | 110 | $2.84 | 0.46 |
| `veb sayt yaratish` | 210 | $0.92 | 0.23 | — | | | |
| `smm xizmatlari` | 110 | **$3.66** | **0.06** | смм ташкент | 50 | $1.36 | 0.71 |
| `targetolog` | 170 | $0.29 | 0.05 | таргетолог ташкент | 40 | $1.72 | 0.73 |
| `telegram reklama` | 70 | $1.24 | 0.08 | telegram ads узбекистан | 50 | $1.61 | 0.51 |
| `sayt yaratish narxi` | 50 | $1.02 | 0.19 | — | | | |
| `smm nima` | 720 | $1.23 | 0.03 | — | | | |
| `target nima` | 390 | **$5.02** | 0.01 | — | | | |
| `reklama agentligi toshkent` | 30 | $1.53 | 0.52 | рекламное агентство ташкент | 90 | $1.95 | 0.78 |

Other measured Russian terms: `маркетинговое агентство ташкент` 70 at 0.87,
`смм агентство ташкент` 50 at $3.00 / 0.76, `seo ташкент` 50 at $3.47 / 0.43,
`seo оптимизация ташкент` 20 at $3.05 / **0.19**, `заказать seo продвижение` 10
at **$4.99** / 0.27, `контекстная реклама ташкент` 30 at $0.74 / 0.43,
`чат бот для инстаграм` 10 at **$7.30** / 0.86, `брендинг ташкент` 90 at $2.92.

**Non-obvious:** Cyrillic beats Latin in Russian-language Uzbek search —
`смм ташкент` 50/mo against `smm ташкент` 20/mo, `смм агентство ташкент` 50
against `smm агентство ташкент` 10. Write both, lead with Cyrillic.

### 4.2 Live SERP composition, 2026-08-21

Ten SERPs pulled (5 RU, 5 UZ). What matters:

- **`smm xizmatlari` (UZ)** — only five of the top twenty are agency service
  pages (dora.uz, munamedia.me, royalmarketing.uz, kyoday.uz,
  innosoft-systems.uz). OLX holds ranks **1 and 5**. The rest is goldenpages,
  glotr, tovar, birbir, yellowpages, Instagram, YouTube, Wikipedia and a
  follower-selling service. Weakly defended, at the highest CPC measured.
- **`sayt yaratish` (UZ)** — mixed do-it-yourself intent: ulkan.uz (free
  builder) at 1, a YouTube tutorial at 2, site.pro at 5, SITE123 at 7,
  Wikipedia at 18. Only three or four genuine service pages.
- **`sayt yaratish xizmati` (UZ)** — entirely commercial: bitbyte, oqila,
  innosoft, webgo, websaytxizmat, mediadesign, mxmedia, eson, muvasayt,
  justyaviz, startapp. All small local studios, no authority domain.
  `saytyaratish.uz` owns the **knowledge graph** entity for both phrases.
- **`telegram reklama` (UZ)** — Telegram's own properties at 1, 8, 9; AI
  Overview at 3; local players only at 4-7 (saytyaratish blog, oqila,
  meridians.uz) and 17 (tg-reklama.uz).
- **`смм агентство ташкент` (RU)** — rank 1 is an **Instagram profile**
  (`@theagency.uz`), not a website. A weak top-1 a real service page can pass.
- **`таргетолог ташкент` (RU)** — roughly three quarters vacancies and courses
  (hh.uz, ishkop, olx, cloz, joobsi, skillbox, spbsot, kursi24). **This is not a
  hire-an-agency intent. Do not build a service page for it.**
- **local pack occupies positions 3–8** in four of the five Russian commercial
  SERPs. Without a Google Business Profile, half of each of those pages is
  structurally unreachable.

### 4.3 The site's actual position

- Real organic foothold is the **Uzbek ChatGPT cluster**, not digital services:
  `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` 2952 impressions at
  position 7.9 over three months, `/uz/gpt-uzbek-tilida/` 509 at 7.1.
  Commercially worth nothing directly, but it proves Google trusts the domain in
  Uzbek.
- Uzbek service pages already rank well: `/uz/arizalarni-avtomatlashtirish/`
  **2.59**, `/uz/instagram-bot-biznes-uchun/` 3.33, `/uz/salon-uchun-ai-bot/`
  3.58, `/uz/chat-bot-biznes-uchun/` 4.47. No Russian marketing service page
  comes close — the best is 15.25 on four impressions.
- Russian marketing pages sit at 45–92. `/ru/razrabotka-saytov-tashkent/` has
  the most impressions of any commercial page (128) at position 74.25.
- The **only** Russian marketing asset holding commercial positions is a blog
  article: `/ru/blog/stoimost-seo-prodvizheniya-v-tashkente/` at
  «стоимость продвижения» 4.0, «цены на seo продвижение» 5.0,
  «оптимизация сайта стоимость» 6.0, «продвижение сайта цена» 6.0,
  «seo продвижение интернет магазина цена» 7.0,
  «стоимость поискового продвижения сайта» 12.0, «seo аудит сайта цена» 14.0.
- **Backlinks: 23 links, 8 referring domains, rank 18.** Usable: pc.uz,
  sprav.uz, autocenter.uz. The rest is one off-topic domain at spam score 35 and
  three scraper domains. This is the binding constraint on every Russian page.
- **GA4: 199 organic sessions in 28 days (up from 40), 0 key events.**

---

## 5. What was built

### 5.1 Measurement — commit `6bdcead`

**Diagnosis.** GA4 marks `purchase`, `qualify_lead` and `close_convert_lead` as
key events. A grep across the whole repository finds none of the three. The site
emits `seo_landing_view`, `seo_article_view`, `seo_money_page_click`,
`service_cta_click`, `telegram_open_attempt`, `language_switch`,
`telegram_demo_click`. A vocabulary mismatch, not a broken tag.

**Constraint.** There is no contact form, no `tel:` and no `mailto:` anywhere in
`src`. All 416 `t.me` links in content point at `XGame_changerx`; the others are
own product bots (`BormiMarketBot`, `gptbot_javob_bot`, `gptbotuz_bot`,
`GPTBot_support`). The only observable lead is a click on the contact handle.

**Change** in `scripts/analytics-snippet.ts`:

- `generate_lead` fires only on `t.me/XGame_changerx` and `t.me/GPTBot_support`,
  carrying `locale`, `page_kind`, `service_slug`, `cta_zone` (hero/body),
  `cta_text` (truncated), `method: telegram`. All derived from the URL and
  element geometry — nothing a person typed.
- `telegram_open_attempt` gained `contact_kind`: `contact` vs `product_bot`.
- `qualify_lead` and `close_convert_lead` are **deliberately never emitted** and
  a test enforces that. The browser cannot see whether a conversation was
  answered or won. They need a CRM callback that does not exist.

**Proof, from a live preview click on `/uz/smm-xizmatlari/`:**

```
telegram_open_attempt  contact_kind: "contact"
generate_lead          service_slug: "smm-xizmatlari", locale: "uz",
                       cta_zone: "hero", method: "telegram", page_kind: "landing"
```

An internal-link click on the same page produced no lead event. On
`/uz/blog/smm-nima/` a click through to the hub produced `seo_money_page_click`.

Two new tests in `tests/seo-analytics-privacy.test.ts`: the contact handle is
pinned against `content/global/site.json`, and no unobservable lead stage may be
emitted.

### 5.2 Uzbek commercial layer — commit `06444c4`

| File | What it is |
| --- | --- |
| `content/pages/uz/smm-xizmatlari.json` | commercial hub, 15 H2, 8 FAQ, cluster `smm-uz` |
| `content/pages/uz/telegram-reklama.json` | commercial page, 12 H2, 8 FAQ |
| `content/blog/uz/smm-nima.json` | the single supporting article |

Content rules honoured throughout: no price (scope drives the number,
consultation is free — wording reused from the already published
`/uz/sayt-yaratish/`), no cases, no client counts, no ratings, no reviews, and
an explicit statement on both pages that guaranteed sales and guaranteed
follower growth are not promised. Uzbek orthography uses U+2018 for o‘/g‘ and
U+2019 for the tutuq belgisi.

Differentiator carried by both pages, and absent from every competitor page
reviewed: advertising or organic reach → AI handling of the incoming Direct
message → Telegram automation → handover into the business process.

`/uz/sayt-yaratish/` also claimed `sayt yaratish xizmati` rather than a second
URL being created — see section 6.

New keywords recorded in `content/seo/demand-policy.json` with source and
measurement date. Without that the build gate refuses a new commercial page.

### 5.3 Russian intent hygiene — commit `f1a5a0d`

One real overlap corrected: `/ru/marketingovyi-audit-tashkent/` declared
«аудит digital маркетинга» and «аудит интернет маркетинга» while earning zero
impressions in three months, and
`/ru/blog/kak-provesti-audit-digital-marketinga/` holds position 18.1 on the
first. Both phrases moved to the article. Money page keeps ordering language.

Three hreflang pairs made reciprocal. `/uz/sayt-yaratish/` had pointed at
`/ru/razrabotka-saytov-tashkent/` since 2026-08-01 without the Russian page
pointing back, which Google ignores.

Four decisions recorded in `content/seo/intent-manifest.json` as pairs
`C13`, `C14`, `C15` plus notes on the `webdev-ru` and `webdev-uz` clusters.

### 5.4 Internal link graph

New edges, all rendering as real `<a href>` in prerendered HTML:

```
/uz/                              → /uz/smm-xizmatlari/ , /uz/telegram-reklama/
/uz/instagram-uchun-ai-menejer/   → /uz/smm-xizmatlari/
/uz/telegram-bot-biznes-uchun/    → /uz/telegram-reklama/
/uz/gpt-telegram-instagram-ideya/ → /uz/smm-xizmatlari/ , /uz/telegram-reklama/
/uz/smm-xizmatlari/               → /uz/blog/smm-nima/ , /uz/telegram-reklama/ + 6 more
/uz/blog/smm-nima/                → /uz/smm-xizmatlari/ + 3 more
```

`/uz/gpt-telegram-instagram-ideya/` was chosen as the bridge from the Uzbek AI
traffic on purpose: it is the "GPT for post ideas and ad copy" page, so a reader
there genuinely wants social content. Exact-match links were **not** bolted onto
the ChatGPT download articles, which would have been stuffing.

---

## 6. Decisions reversed by evidence — read before repeating them

The research artifact recommended four changes that were **not** made, because
re-checking the live repository and Search Console before mutating showed they
were wrong or already done. Do not reinstate them without new evidence.

**1. Merging the three Russian website pages — dropped.**
`/ru/razrabotka-sayta-pod-klyuch/` looked like a live competitor: 50 impressions
and seven long-tail positions between 12 and 26. It is not a page. It has been a
301 source since 2026-08-01 (`content/seo/redirects.json`, id
`cannib-2026-08-m2-pod-klyuch`) with no content file. Those are decayed index
data. The hub keeps «разработка сайта под ключ» and should absorb the tail.

**2. Merging `/ru/sozdanie-sayta-dlya-biznesa/` — dropped.**
Search Console page×query over 2026-05-18..2026-08-18 shows **zero shared
queries** with the hub. It earns its 28 impressions on «сайт для бизнеса» (17 at
position 27.4), «создание сайта для бизнеса» and «сайт для компании»; the hub
earns its 128 on geo-qualified development terms. Recorded as `C13`.

**3. Adding the article ↔ money-page links for SEO and for the audit — already
existed.** Both directions were already in place, in the body and in
`internalLinks`, for both pairs. The 60-position gap on the SEO pair is
authority and local signals, not internal linking. Recorded as `C14`.

**4. Splitting `/uz/sayt-yaratish/` into a separate `/uz/sayt-yaratish-xizmati/`
— dropped.** `content/seo/intent-manifest.json` already declared that URL as the
`webdev-uz` commercial hub with six spokes and a documented architecture
decision from 2026-08-01. Creating a rival URL would have fought its own hub and
broken the cluster tests. Instead the hub claimed `sayt yaratish xizmati`
alongside the head term, which is honest because the page is already commercial.

**Also not created:** `/uz/target-reklama-xizmati/`. `targetolog` measures
170/mo, but the Russian SERP for the equivalent is vacancies and courses and the
Uzbek SERP was never pulled. Building for an unverified intent would be a
doorway page. **If you want this, pull the live SERP for `targetolog`,
`target reklama` and `target reklama xizmati` first.**

---

## 7. Repository gates that constrain any future SEO work

These are enforced by tests and by the build. Learn them before authoring
content or you will fight them.

**`content/seo/intent-manifest.json`** — records which URL owns which intent.
Read it before retargeting anything. It already holds six clusters
(`webdev-uz`, `webdev-ru`, `telegram-mini-app-ru`, `local-seo-ru`, `smm-ru`,
`digital-paid-media-ru`, `smm-uz`) and nine documented pairs with evidence.

**`content/seo/demand-policy.json`** — a build gate. A new `money` or `niche`
page whose `primaryKeyword` has no recorded volume fails `npm run seo:audit`,
which `npm run build` runs first. Add the measurement with its source and date.
There is also a `frozenClusters` list — the bot-services keyword patterns are
frozen because that cluster has no measurable demand.

**`tests/seo-cluster-quality.test.ts`** enforces:
- hub carries `Service` + `FAQPage` + `BreadcrumbList` and at least 4 visible FAQ
- spokes carry `Article` + `BreadcrumbList`, self-referential canonical, and a CTA
- no `Offer`, `Review` or `AggregateRating` in `schemaTypes` anywhere
- Uzbek text: no ASCII apostrophe between two letters
- no `kafolat*` without a negation within 160 characters
- **no single anchor may exceed 60% of all anchors pointing at a hub** — this
  failed at 83% on the first attempt and had to be varied
- `/uz/blog/` spokes may not contain a bare currency figure
- titles and descriptions unique within a cluster
- no cluster link crosses locale, and no link points at a redirect source

**`tests/seo-link-graph.test.ts`** enforces zero orphans, zero broken internal
links, zero links through a redirect, and that no redirect source is still
published as a page.

**`tests/seo-analytics-privacy.test.ts`** forbids the analytics block from
containing `.value`, `input`, `FormData`, `localStorage`, `sessionStorage` or
`document.cookie` as substrings. Watch that when editing the snippet.

**`tests/canonical-url-redirects.test.ts`** pins the `?lang=` → locale-path 301
and the www → apex rule.

Useful commands:

```
npm run seo:audit        # the gate that blocks the build
npm run test:seo-cluster
npm run test:seo-links
npm run test:seo-analytics
npm test                 # 293 tests, 19 suites
npm run scan:secrets
```

---

## 8. Deploy procedure — including the trap that nearly wiped the admin panel

The Cloudflare Pages project is **Direct Uploads**, so `git push origin main`
deploys nothing. Every production change is a manual wrangler upload.
`docs/CLOUDFLARE_DEPLOY_RUNBOOK.md` is the source of truth.

> **`npm run build` does not produce `dist/admin`.** Only `build:cf` does — it
> runs `build:admin`, which builds `apps/bormi-admin` into `../../dist/admin`
> with `emptyOutDir`. `wrangler pages deploy dist` uploads the whole directory,
> so deploying a plain `npm run build` artifact **deletes the Bormi Admin panel
> from production**. Always build with `build:cf` and verify
> `dist/admin/index.html` exists before uploading.

Full sequence used this session:

```powershell
cd F:\Claude\gptbot-seo-audit-20260821
npm run build:cf                       # audit + tsc + vite + prerender + sitemap + admin

# verify the artifact BEFORE uploading
Test-Path dist\admin\index.html        # must be True
Test-Path dist\uz\smm-xizmatlari\index.html
Select-String dist\_redirects -Pattern '^\s*/\*\s'   # must find nothing

.\node_modules\.bin\wrangler.cmd whoami
$sha = git rev-parse HEAD; $msg = git log -1 --pretty=%s
.\node_modules\.bin\wrangler.cmd pages deploy dist `
  --project-name=ai-direct-pro-landing --branch=main `
  --commit-hash=$sha --commit-message=$msg
```

`--branch=main` makes it production and reassigns the `gptbot.uz` aliases.

**`wrangler.toml` is authoritative** — `pages deploy` replaces the project's
bindings and plain-text vars with whatever is in that file. A binding that
exists only in the dashboard is deleted by the next deploy. Cloudflare *secrets*
survive untouched. This session did not modify `wrangler.toml`, so production
vars are unchanged.

**Post-deploy indexing.** The IndexNow key is the public file
`public/mrutks6jdnrob4r70zp8u7868a83lnim.txt` — filename equals key, served at
the site root. Run:

```powershell
$env:INDEXNOW_KEY='mrutks6jdnrob4r70zp8u7868a83lnim'
npx tsx scripts/indexnow-ping.ts
```

It submits every sitemap URL to Bing, Yandex, Seznam, Naver and Yep. Returned
HTTP 200 for 257 URLs this session. Google has no equivalent API — manual
"Request indexing" in Search Console only.

---

## 9. Production verification actually performed

Smoke test against live `gptbot.uz` after deploy:

| Check | Result |
| --- | --- |
| `/` · `/sitemap.xml` | 200 · 200, 257 locs |
| `/uz/smm-xizmatlari/` · `/uz/telegram-reklama/` · `/uz/blog/smm-nima/` | 200 · 200 · 200 |
| `/admin/` | 200, `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` — panel intact |
| `/admin-tools/` | 200, noindex |
| random URL | 404 — no SPA fallback |
| `POST /api/content` | 401 — auth intact |
| `/?lang=uz` | 301 → `https://gptbot.uz/uz/` |
| `www.gptbot.uz` | 301 → apex |

Live HTML of `/uz/smm-xizmatlari/`: one H1, self-referential canonical,
hreflang `ru`/`uz`/`x-default`, `robots: index, follow`, `Service` schema,
`generate_lead` present. Reciprocal hreflang confirmed on
`/ru/smm-prodvizhenie-tashkent/` and `/ru/razrabotka-saytov-tashkent/`.

Browser checks were done through the DOM, the console and the `dataLayer` on a
local preview at 1280px and 375px: no console errors, no horizontal overflow,
tables wrapped in overflow containers. **Screenshots could not be captured** —
the browser pane was not displayed in that session, so there is no visual
evidence, only structural.

GSC URL Inspection on the three new URLs returns `URL is unknown to Google`,
which is expected for pages hours old. They are in the sitemap and linked from
`/uz/`.

---

## 10. Open items — owner actions, not code

1. **GA4 UI.** Mark `generate_lead` as a Key Event. Unmark `qualify_lead`,
   `close_convert_lead` and `purchase` — they will never fire. Until this is
   done, conversions still read zero in GA4 even though the event is live in
   production.
2. **Rank tracker.** Tracker `3d4e261b-282e-4d6c-8da0-bb56ee68ccc7` exists with
   25 keywords, `serpDepth: 100`, mobile, **schedule manual** so it cannot spend
   on its own. One live run costs **500 credits** (~$0.50), estimated in advance.
   It was **not** run: the tool contract requires showing the estimate and
   getting explicit approval. A baseline taken now is the last chance to capture
   pre-change positions.
3. **Google Business Profile.** Checklist in
   `docs/seo/LOCAL_CITATION_PACK_2026-08-21.md`. Blocked on honesty: `site.json`
   has an empty phone and a city-level address only. Decide those facts, add
   them to `content/global/site.json`, then register. Do not invent them.
4. **Directory citations.** Eleven targets in the same file. Priority
   goldenpages.uz, yellowpages.uz, marketing.uz, olx.uz. Eight referring domains
   is what holds the Russian pages at 60–90.
5. **Reindexing.** Ten URLs were prioritised for Search Console manual
   submission — the three new pages plus `/uz/`, then the three pages carrying
   new outbound links, then the three with new hreflang. Note that
   `/ru/marketingovyi-audit-tashkent/` and `/uz/sayt-yaratish/` are **not** on
   that list: `secondaryKeywords` do not render into HTML, so their markup did
   not change and a recrawl would achieve nothing.
6. **Observation, not a defect.** `OpeningHoursSpecification` in the
   Organization schema declares 00:00–23:59 seven days on all 120 pages. It
   predates this work. Defensible for an online business, but it is a factual
   claim — decide whether it matches reality before someone treats it as one.

---

## 11. What to do next, in order

**Wait first.** The Uzbek pages went live hours ago. Do not judge them, rewrite
them or add siblings before Search Console shows impressions. Realistic
timeline: impressions in 1–3 weeks, top-20 entry on `smm xizmatlari` and
`sayt yaratish xizmati` in 6–8 weeks, and only if citations and the business
profile move in parallel.

**Then, in priority order:**

1. **Confirm measurement works.** Once `generate_lead` is a key event, check
   GA4 for non-zero key events and confirm `service_slug` and `cta_zone` arrive.
   Without this nothing downstream can be judged.
2. **Off-page.** This is the binding constraint, and no amount of on-page work
   substitutes. Target: 8 referring domains → 25.
3. **Verify the Uzbek target intent** before building `/uz/target-reklama-xizmati/`.
   `targetolog` is 170/mo at competition 0.05, which is attractive, but the
   Russian analogue is a jobs SERP. Pull `get_serp_results` for `targetolog`,
   `target reklama` and `target reklama xizmati` at location 2860 first.
4. **Consider a second Uzbek spoke only when GSC proves a distinct intent.** The
   `smm-uz` cluster note says exactly this. `target nima` (390/mo, CPC $5.02,
   competition 0.01) is the obvious candidate — but it belongs to whichever hub
   ends up owning paid social, so decide item 3 first.
5. **Re-check the Russian near-misses after the citations land.**
   `seo оптимизация ташкент` (20/mo, CPC $3.05, competition **0.19**) and
   `заказать seo продвижение` (10/mo, CPC **$4.99**, competition 0.27) are the
   two lowest-competition Russian commercial terms measured and the most likely
   first Russian wins.
6. **Do not re-buy research before 2026-09-20.** The research log entry in the
   OpenSEO project context records what was purchased and what it returned.

---

## 12. Traps for the next agent

- **Read `intent-manifest.json` before proposing any merge, redirect or
  retarget.** Three of four proposals from a fresh audit were already decided or
  already done. The manifest is where that memory lives.
- **A URL with impressions in GSC is not proof it is a live page.** Check
  `content/seo/redirects.json` and whether a content file exists. Decayed index
  data looks exactly like a live competitor.
- **`secondaryKeywords` are internal targeting metadata and never render.**
  Changing them changes nothing Google can see. Useful for intent ownership,
  useless for a recrawl.
- **`build` vs `build:cf`** — section 8. This is the one that can break
  production.
- **Anchor variety is enforced at 60%.** Plan varied anchors when adding links
  to a hub, or the cluster test fails after you have written everything.
- **Never write a price, a case, a client count, a rating or a guarantee.**
  There is no published price list, no phone and no street address. The honest
  construction is already published on `/uz/sayt-yaratish/`: scope drives the
  number, consultation and initial scoping are free.
- **Uzbek apostrophes** — U+2018 for o‘/g‘, U+2019 for the tutuq belgisi. A test
  fails the build on an ASCII apostrophe between two letters in Uzbek text.
  English JavaScript comments in the analytics block are exempt in practice
  because the test reads content JSON, not rendered HTML.

---

## 13. Reference — where things live

| What | Where |
| --- | --- |
| Research report (artifact) | `https://claude.ai/code/artifact/45401d9f-e2ed-4fb0-84d5-d8793315bc1d` |
| Citation pack + GBP checklist | `docs/seo/LOCAL_CITATION_PACK_2026-08-21.md` |
| Deploy runbook | `docs/CLOUDFLARE_DEPLOY_RUNBOOK.md` |
| Intent ownership | `content/seo/intent-manifest.json` |
| Demand gate | `content/seo/demand-policy.json` |
| Redirect table | `content/seo/redirects.json` |
| Business facts | `content/global/site.json` |
| Analytics block | `scripts/analytics-snippet.ts` (mirrored, simplified, in `index.html`) |
| Prior cannibalisation map | `docs/seo/CANNIBALIZATION_AND_MIGRATION_MAP_2026-08-01.md` |
| Prior demand check | `docs/seo/DEMAND_REALITY_CHECK_2026-08-01.md` |
| OpenSEO project context | `https://app.openseo.so/p/7534113b-f748-4f98-ac39-9e3782d3d9e7/settings/context` |
| Rank tracker | `https://app.openseo.so/p/7534113b-f748-4f98-ac39-9e3782d3d9e7/rank-tracking/3d4e261b-282e-4d6c-8da0-bb56ee68ccc7` |

The OpenSEO project context was filled this session and is the fastest way for a
new agent to load the business: `business_overview`, `current_goal`,
`positioning`, `writing_preferences`, ten competitors with their weaknesses, ten
key pages, and the research log.

---

*Session ended with production live and green. Nothing is left half-applied: the
working tree is clean, `origin/main` equals the deployed commit, and every claim
in this file is traceable to a tool response from 2026-08-21.*
