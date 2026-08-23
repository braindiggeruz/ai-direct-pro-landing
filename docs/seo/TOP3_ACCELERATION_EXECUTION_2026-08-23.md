# GPTBOT TOP-3 SEO ACCELERATION — EXECUTION REPORT

**Date:** 2026-08-23 · **Branch:** `seo/top3-acceleration-20260823` · **Commit:** `ff6d519`
**Production before:** `6c19acc` (Pages deployment `4701d4b7`) → **after:** `ff6d519` (deployment `5b8c5e5f`)
**OpenSEO credits spent:** 288 of a 1,200 budget · **Live verification:** PASSED

---

## 1. Executive result

Ten content files changed, +202/−31. No code, no `wrangler.toml`, no URL, canonical or slug touched.

Three things shipped, and two planned things were cancelled by evidence.

**Shipped.** (a) The Russian SEO explainer now links to its money page from the body — the single
highest-confidence action available, because GSC shows the blog absorbing 51 of 56 impressions on
«seo продвижение сайтов» at position 72.5 while the money page sits at 22.0 on 5, and the money
page was reachable only from a bottom-of-page card. (b) Six new contextual donors rebalance Uzbek
internal authority toward the four Uzbek money pages, with `/uz/seo-xizmati/` — previously the
least-linked of all 17 money pages — the main beneficiary. (c) `/uz/smm-xizmatlari/` gains a launch
timeline and a clearly-labelled 30-day content-plan example, the two things the audit found missing
against a SERP where OLX holds ranks 1 and 5.

**Cancelled.** The Russian geo-frame reframe of `/ru/targetirovannaya-reklama-tashkent/` and
`/ru/kontekstnaya-reklama-tashkent/` was gated on live SERP evidence, and the evidence killed it.
Both «таргетированная реклама» and «контекстная реклама» return purely definitional results —
Yandex Practicum, Wikipedia, roistat, elama, cyberleninka, Instagram reels — with **zero commercial
service pages in either top 20**. Reframing would have traded a winnable commercial term for an
unwinnable educational one. This also revises the audit: the "ташкент" suffix is an intent filter
here, not a mistake.

**The measurement bug turned out to be configuration, not code.** `generate_lead` already exists and
is correctly implemented. GA4 reads zero because the three registered Key Events are `purchase`,
`qualify_lead` and `close_convert_lead` — and the code deliberately never emits the latter two,
while the one event it does emit is not registered. One owner action in GA4 Admin fixes it.

**Unexpected finding.** The pre-change baseline shows the Uzbek cluster is already ranking:
`marketing nima` 18, `smm nima` 21, `sayt yaratish` 26, `seo xizmati` 34, `smm xizmatlari` 36. The
audit recorded these as ">100" or "never tracked" only because the tracker had not been run since
those pages were created.

## 2. Live reconciliation

| | |
|---|---|
| Canonical repo | `F:\Claude\gptbot-repo-clean-20260801` (7 worktrees) |
| Remote | `https://github.com/braindiggeruz/ai-direct-pro-landing.git` |
| Execution worktree | `F:\Claude\gptbot-top3-20260823` (created clean from `origin/main`) |
| Branch | `seo/top3-acceleration-20260823` |
| BASE_SHA | `6c19accb3ed69373a64492c58dfe849f71c0bb4d` |
| PRODUCTION_SHA at start | `6c19acc` — identical to base, **zero drift** |
| PRODUCTION_SHA after | `ff6d519` |
| Pages project | `ai-direct-pro-landing`, deployment `5b8c5e5f-6f31-48a3-a404-be461ea97944` |

**Trap avoided:** `F:\Claude\gptbot-repo` presents as `main` and looks canonical, but it is a
**separate stale clone** whose `origin/main` is `d55edc0` (2026-07-31) and which does not even
contain the object `6c19acc`. Working there would have silently reverted three weeks of SEO work.
The real tree is a worktree of `gptbot-repo-clean-20260801`.

The parent worktree carried 5 unrelated dirty `docs/agents-platform/*` files. They were never
touched: a fresh worktree was created instead. No `git reset`, no `git clean`, no force push, no
`git add .` — all 10 files staged by explicit path.

## 3. OpenSEO research performed

| tool | query | reason | credits |
|---|---|---|---|
| `whoami`, `list_projects`, `get_project_context`, `get_rank_tracker` | — | reuse existing project state | 0 |
| `get_google_analytics_measurement_health` | property 540129731 | find why keyEvents = 0 before touching analytics | 0 |
| `get_serp_results` (single, timed out) | «таргетированная реклама» | MCP timeout, charged anyway | 20 |
| `get_serp_results` (batch of 2) | «таргетированная реклама», «контекстная реклама» | **gate** for the Phase 10/11 reframe | 40 |
| `estimate_rank_tracker_cost` | +6 keywords | cost check before mutating | 0 |
| `add_rank_tracking_keywords` | 9 requested, 4 new | 5 were already tracked | 0 |
| `run_rank_tracker` | 33 keywords, mobile, loc 2860 | **pre-change baseline** | 228 |
| **Total** | | | **288** |

Nothing already measured on 2026-08-21/22 was re-bought. Budget was 1,200; 912 unspent.

## 4. AgriciDaniel skills used

Runtime `claude-seo` v2.2.4 — `doctor --json` green before work (mode manual, Python 3.12.10,
Chromium ready), no stale `claude-seo:*` duplicates present. Used directly: the bundled venv for the
content/link/render analysis and all verification scripts. Applied as analytical frames:
`seo-page`, `seo-content`, `seo-sxo`, `seo-cluster`, `seo-technical`, `seo-schema`, `seo-hreflang`,
`seo-google`, `seo-drift` (before/after snapshot), `seo-plan`. Not used: `seo-backlinks`,
`seo-local`, `seo-maps`, `seo-geo`, `seo-images`, `seo-sitemap` — nothing in this release touched
their surfaces, and running them would have produced findings with no action attached.

## 5. Specialist agents used

One adversarial release reviewer, run against the actual diff before commit. It returned
**SHIP WITH FIXES** with seven items. Its three load-bearing findings were verified independently
against the repo before acting, and all three were confirmed:

| finding | verified? | action |
|---|---|---|
| The Muddat table invented day ranges with no operational evidence | **confirmed** | fixed — see §9 |
| Those day ranges contradicted the hreflang pair `/ru/smm-prodvizhenie-tashkent/`, which publishes a **week** grid (week 4 = publication) and "План на 8-12 недель" | **confirmed** — RU bodyBlock 22 | fixed |
| `updatedAt`/`dateModified` unbumped, so 08-23 content would ship stamped 08-20 via JSON-LD | **confirmed** | fixed on all 10 files |
| `internalLinks` render as bottom-of-page cards, not in-body; `type:"contextual"` is read by nothing | confirmed | accepted and disclosed rather than hidden — see §8 |
| `/uz/sayt-uchun-ai-bot/` is a frozen-cluster donor | confirmed against `demand-policy.json` | donor dropped |
| Anchor `saytni qidiruvda ko‘tarish` used 3× | confirmed | varied |
| The two new SERPs were absent from the evidence pack | confirmed | recorded |

## 6. Analytics

**Existing implementation discovered — and kept.** `scripts/analytics-snippet.ts` already emits
`generate_lead`, and correctly: it fires only when the clicked `t.me` href matches the studio's own
contact handles (`XGame_changerx|GPTBot_support`); every other `t.me` click is tagged
`telegram_open_attempt` with `contact_kind: "product_bot"` and is explicitly not a lead. It carries
`page_path`, `locale`, `page_kind`, `service_slug`, `cta_text`, `cta_zone` (hero/body) and
`method: "telegram"`. `qualify_lead` and `close_convert_lead` are deliberately never emitted,
because the browser cannot observe them.

**Changes made: none.** Creating a second event would have been a duplicate conversion for the same
action. The mission's own rule and the code's own header comment agree.

**The actual defect is GA4 configuration.** `get_google_analytics_measurement_health` on property
540129731 returns exactly three registered Key Events:

| registered Key Event | emitted by the site? |
|---|---|
| `purchase` | no — no ecommerce |
| `qualify_lead` | **no — deliberately never emitted** |
| `close_convert_lead` | **no — deliberately never emitted** |
| `generate_lead` | **emitted, but NOT registered** |

That is the whole reason GA4 reports 0 key events across 275 organic sessions.

**Owner action required (GA4 Admin, ~2 minutes).** The OpenSEO GA4 surface is read-only, so this
cannot be done from here and no API workaround was invented.
1. GA4 → Admin → Property → **Key events** → *New key event* → name exactly `generate_lead`.
2. Optionally unregister `qualify_lead` and `close_convert_lead` — they can never fire and inflate
   the Key-events list with noise. Do **not** delete `purchase` if ecommerce is ever planned.
3. Optionally register custom dimensions for `service_slug`, `cta_zone`, `locale` and `page_kind`
   (Admin → Custom definitions) — the parameters are already being sent but are currently
   unreportable. `customDimensionCount` is 0 today.

Caveat worth stating plainly: at 8–13 marketing-cluster sessions per quarter, this instrument will
read near zero for some time. It is a prerequisite for judging the work, not a source of traffic.

## 7. CTA changes

**None — and that is a finding, not an omission.** All four click-earning blogs already carry a
Telegram CTA:

| URL | existing CTA | destination |
|---|---|---|
| `/ru/blog/dogovor-na-okazanie-smm-uslug-v-uzbekistane/` | «Обсудить условия работы» | `t.me/XGame_changerx` |
| `/ru/blog/chto-vhodit-v-uslugi-smm-specialista/` | «Заказать аудит текущего SMM» | `t.me/XGame_changerx` |
| `/ru/blog/prodvizhenie-sayta-v-google-uzbekistan/` | rich CTA block, «Обсудить SEO-продвижение» | `t.me/GPTBot_support` |
| `/uz/blog/bepul-sayt-yaratish-yoki-buyurtma/` | «Sayt bo‘yicha maslahat olish» | `t.me/XGame_changerx` |

All four are scoping-framed, not "buy now", and all four destinations are recognised as contact
handles by the `generate_lead` matcher. Adding a second CTA mid-article would have created
duplicate-CTA noise on pages that convert at an unmeasured rate. **Deferred, with the reason
recorded** — revisit once the Key Event is registered and there is a number to optimise against.

Note for the owner: `prodvizhenie-sayta-v-google-uzbekistan` points at `GPTBot_support` while the
other three point at `XGame_changerx`. Both are declared contact handles, so both count as leads.
Worth deciding which is canonical, but it is not a bug.

## 8. Internal-link changes

Seven links added, one link changed, one candidate rejected. **One link per donor, varied anchors.**

| donor | target | anchor | why |
|---|---|---|---|
| `/uz/blog/smm-nima/` | `/uz/seo-xizmati/` | `qidiruvdan keladigan trafik` | 720/mo explainer; reader comparing channels |
| `/uz/blog/domen-va-hosting-qanday-tanlanadi/` | `/uz/seo-xizmati/` | `saytni qidiruv tizimlariga moslash` | domain/hosting → being found in search |
| `/uz/blog/biznes-uchun-qanday-sayt-kerak/` | `/uz/seo-xizmati/` | `SEO xizmati` | choosing a site type → search visibility |
| `/uz/blog/sayt-buyurtma-qilishdan-oldin-nimalar-kerak/` | `/uz/seo-xizmati/` | `qidiruv optimizatsiyasi` | pre-order prep checklist |
| `/uz/instagram-bot-biznes-uchun/` | `/uz/smm-xizmatlari/` | `Instagram sahifasini yuritish xizmati` | Direct automation → page management |
| `/uz/blog/instagram-telegram-crm-bitta-ariza-voronkasi/` | `/uz/telegram-reklama/` | `Telegram reklama xizmati` | funnel article → the paid channel |
| `/ru/blog/chto-takoe-seo-prodvizhenie/` | `/ru/seo-prodvizhenie-saytov-tashkent/` | `услуга SEO-продвижения` (**in body, ~90 words in**) | the cannibalisation fix |
| ~~`/uz/sayt-uchun-ai-bot/`~~ | ~~`/uz/seo-xizmati/`~~ | — | **rejected**: `bot-services` frozen cluster, weakest topical fit |

**Honest limitation.** `internalLinks` entries render as a bottom-of-page card grid
("Shuningdek o‘qing" / "Смотрите также"), not as in-body prose links — the `type: "contextual"`
field is metadata that the renderer does not read. So the six Uzbek additions are card links: real,
crawlable and counted by the audit's donor metric, but weaker than the in-body link placed on the
Russian donor. Only the Russian one is a true in-body contextual link. This is disclosed rather
than glossed, and it is the honest reason to expect a smaller effect on the Uzbek side.

`/uz/seo-xizmati/` content-file donors: **5 → 9**.

## 9. Uzbek money-page improvements

Only `/uz/smm-xizmatlari/` was edited. `/uz/sayt-yaratish/`, `/uz/telegram-reklama/` and
`/uz/seo-xizmati/` received inbound links but no content edits — inspection showed they already
carry deliverables, process, price logic, limits and FAQ, and the audit's proposed additions
(structure examples, scope estimator) need owner-supplied facts that do not exist yet.

**`/uz/smm-xizmatlari/` — two new sections, +138 lines.**

- **`Muddat`** (H2 `#muddat`) — a launch-stage table: `Bosqich` / `Ishga tushirish bosqichi` /
  `Sizdan nima kerak`. Six rows, 1-hafta → 4-hafta va keyin → 1-oy yakunida.
  **Timings mirror the week grid already published on the hreflang pair
  `/ru/smm-prodvizhenie-tashkent/`** (block 22: Неделя 1 audit → 4 publication). No new commitment
  was invented. The intro explicitly scopes the table to launch, not results, and defers to the
  page's existing statement that real results take `bir necha oy izchil ish`.
  *This section originally shipped invented day ranges (1–2 kun … 5–7 kun) implying publication in
  ~10–17 days. The red team caught it, the contradiction with the Russian pair was confirmed, and
  it was corrected before commit.*
- **`30 kunlik kontent reja — namuna`** (H2 `#kontent-reja-namuna`) — a 10-row example grid
  (Kun / Platforma / Format / Mavzu turi / Maqsad). Labelled `namuna` in the heading and stated in
  prose to be neither a real client plan nor a sellable template.
- Both entries added to the page TOC in the file's compact style.

Uzbek orthography verified by codepoint on every added string: **U+2018** for `o‘`/`g‘` as letters
(`ko‘rib`, `bog‘liq`, `yig‘ilgan`, `to‘plami`, `so‘rovnoma`, `ko‘tarish`, `bo‘yicha`), **U+2019** for
the tutuq belgisi (`ma’lumot`, `mas’ul`), zero ASCII apostrophes between letters.

## 10. Russian frame test

**Not run. Cancelled by evidence.**

| query | vol/mo | SERP composition (measured 2026-08-23) | verdict |
|---|---|---|---|
| «таргетированная реклама» | 50 | AI Overview at 1; practicum.yandex, Wikipedia, Instagram reels, roistat, elama, unisender, kyoday.uz (blog), netpeak, carrotquest, convertmonster, ingate, kokoc, demis, maed, cyberleninka | **BAD INTENT / AUTHORITY-LOCKED** |
| «контекстная реклама» | 110 | AI Overview at 1; practicum.yandex, elama, kokoc, Wikipedia, ppc.world, convertmonster, calltouch, easy-direct, woodlimegroup.uz (blog), ingate, wunder-digital.uz (2020 blog), seo.ru, ag.marketing, ringostat | **BAD INTENT / AUTHORITY-LOCKED** |

Zero commercial service pages in either top 20. The only `.uz` results are blog explainers.

**Before = after: both pages untouched.** `/ru/targetirovannaya-reklama-tashkent/` keeps its title,
H1 and primary keyword and remains at tracker position **16**;
`/ru/kontekstnaya-reklama-tashkent/` remains at **56**.

**This revises audit §5c.** The geo suffix does collapse volume, but the volume it removes is
*educational*. The geo variants isolate commercial intent, and GPTBot already ranks 16 and 56 on
them. Keep the geo framing. **Rollback rule is moot — nothing was changed.** If the frame test is
ever revisited, the trigger would be a future SERP pull showing commercial service pages entering
the non-geo top 20, not keyword volume alone.

## 11. Technical hygiene

- Removed a `bodyBlocks` h2 that duplicated **both** the renderer's own FAQ heading and its
  `id="faq"` (`scripts/prerender.ts:254` always emits `<section id="faq">` when `page.faq` exists).
  Affected `/ru/lokalnoe-seo-tashkent/` and `/ru/razrabotka-telegram-mini-app-tashkent/`. A sitewide
  sweep of the build now finds **0 pages with a duplicate `id="faq"`**. TOC anchors still resolve,
  because the renderer's section carries the id.
- Restored the `| GPTBot.uz` title suffix on `/ru/lokalnoe-seo-tashkent/` (59 chars).
- `updatedAt` / `lastReviewedAt` / `dateModified` bumped to `2026-08-23` on all 10 files.

**Not done, deliberately:** the missing `alt` attribute. Every `<img>` in `prerender.ts`,
`prerender-blog.ts` and `prerender-home.ts` already emits `alt`; the alt-less image lives in the
global shell and fixing it means touching the shared layout for zero ranking effect. Also not done:
the CI build assertions and the `alternates.length < 2` hreflang guard — both are code changes with
no ranking impact, and the mission's instruction was not to let hygiene expand into a rewrite.

## 12. Rankings baseline

Captured **before** deploy. Tracker `3d4e261b`, run `9d4ce1e4`, 2026-08-23T13:50:59Z, loc 2860,
language ru, **mobile**, SERP depth 100, 33 keywords, 228 credits.
Run completed with `8 keyword(s) could not be checked` — a null below may be a failed check, not
proof of absence.

| keyword | 08-21 | **08-23 baseline** | ranking URL |
|---|---|---|---|
| аудит digital маркетинга | 1 | **1** | /ru/blog/kak-provesti-audit-digital-marketinga/ |
| таргетированная реклама ташкент | 17 | **16** | /ru/targetirovannaya-reklama-tashkent/ |
| marketing nima | never checked | **18** | /uz/blog/marketing-nima/ |
| smm nima | >100 | **21** | /uz/blog/smm-nima/ |
| sayt yaratish | >100 | **26** | /uz/sayt-yaratish/ |
| seo продвижение сайтов | 26 | **26** | /ru/seo-prodvizhenie-saytov-tashkent/ |
| seo xizmati | never checked | **34** | /uz/seo-xizmati/ |
| стоимость продвижения | 33 | 35 | /ru/blog/stoimost-digital-marketinga-v-tashkente/ |
| smm xizmatlari | >100 | **36** | /uz/smm-xizmatlari/ |
| smm mutaxassisi | new | **42** | /uz/blog/smm-nima/ |
| telegram ads узбекистан | 51 | **46** | /ru/telegram-ads-uzbekistan/ |
| smm xizmati | new | **46** | /uz/smm-xizmatlari/ |
| smm услуги | never checked | **46** | /ru/blog/chto-vhodit-v-uslugi-smm-specialista/ |
| seo оптимизация ташкент | >100 | **52** | /ru/seo-prodvizhenie-saytov-tashkent/ |
| контекстная реклама ташкент | 57 | 56 | /ru/kontekstnaya-reklama-tashkent/ |
| разработка сайтов ташкент | >100 | **56** | /ru/razrabotka-saytov-tashkent/ |
| продвижение сайта цена | 59 | 60 | /ru/blog/stoimost-seo-prodvizheniya-v-tashkente/ |
| цены на seo продвижение | 60 | 66 | /ru/blog/stoimost-seo-prodvizheniya-v-tashkente/ |
| sayt yaratish xizmati | 69 | 68 | /uz/sayt-yaratish/ |
| смм ташкент | 72 | 73 | /ru/smm-prodvizhenie-tashkent/ |
| смм агентство ташкент | 79 | 79 | /ru/smm-prodvizhenie-tashkent/ |

Not in top 100 or check failed: sayt yaratish narxi, veb sayt yaratish, telegram reklama,
targetolog, seo ташкент, создание сайта ташкент, рекламное агентство ташкент, маркетинговое
агентство ташкент, заказать seo продвижение, реклама в телеграм, seo optimizatsiya, smm agentligi.

**Two audit claims are now falsified:** `/uz/seo-xizmati/` is not unmeasured (it is at 34), and the
audit red team's "zero Uzbek commercial rows exist at any position" is false. Also, the `seo xizmati`
SERP now shows `knowledge_graph` + `google_reviews`, so the manifest's "20 organic results, zero
SERP features" description no longer holds.

## 13. Files changed

```
content/blog/ru/chto-takoe-seo-prodvizhenie.json                       +15 −4
content/blog/uz/biznes-uchun-qanday-sayt-kerak.json                    +10 −2
content/blog/uz/domen-va-hosting-qanday-tanlanadi.json                 +10 −2
content/blog/uz/instagram-telegram-crm-bitta-ariza-voronkasi.json      +10 −2
content/blog/uz/sayt-buyurtma-qilishdan-oldin-nimalar-kerak.json       +10 −2
content/blog/uz/smm-nima.json                                          +10 −2
content/pages/ru/lokalnoe-seo-tashkent.json                            +11 −6
content/pages/ru/razrabotka-telegram-mini-app-tashkent.json             +9 −5
content/pages/uz/instagram-bot-biznes-uchun.json                       +10 −2
content/pages/uz/smm-xizmatlari.json                                  +138 −4
10 files changed, 202 insertions(+), 31 deletions(-)
```

## 14. Tests

| command | result |
|---|---|
| `npm test` | **297 passed, 0 failed** (19 suites, incl. `seo-link-graph`, `seo-demand-gate`, `seo-intent-manifest`, `seo-cluster-quality`, `seo-analytics-privacy`) |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build:cf` | exit 0 |
| `npm run seo:audit` | OK — 0 missing title/desc/H1/canonical, 0 duplicates, 0 mojibake, 0 orphans, 0 broken internal links, 0 redirect links, RU/UZ pairs 43 ok / 0 broken, avg money score 97/100 |
| secret scan over the diff | clean |
| `git diff --check` | clean |
| dist sweep for duplicate `id="faq"` | 0 pages |
| mobile render (375×812) | no page overflow; the 5-column grid scrolls inside its own `overflow-x:auto` container |

All gates were re-run **after** the red-team fixes, not only before.

## 15. Production verification

Deployment `5b8c5e5f-6f31-48a3-a404-be461ea97944`, Environment **Production**, branch `main`,
source `ff6d519`. 11 files uploaded, 818 reused.

20 live URLs checked on `https://gptbot.uz` — **all HTTP 200, exactly one H1, correct
self-referencing canonical, `index, follow, max-image-preview:large`, at most one `id="faq"`,
`generate_lead` present, only declared `t.me` handles**. Verified specifically:

- `/ru/blog/chto-takoe-seo-prodvizhenie/` — in-body money-page link live, non-exact anchor
  «услуга SEO-продвижения» live, `dateModified 2026-08-23` live
- `/uz/smm-xizmatlari/` — `#muddat` live, week grid live (`1-hafta` … `4-hafta va keyin`,
  `1-oy yakunida`), launch-scoping clause live, defers to `bir necha oy izchil ish kerak`,
  `#kontent-reja-namuna` live, **invented day ranges absent from the live HTML**
- `/ru/lokalnoe-seo-tashkent/` — `| GPTBot.uz` suffix live, single `id="faq"`
- All six Uzbek donor links live
- Untouched controls confirmed unchanged: `/ru/seo-prodvizhenie-saytov-tashkent/`,
  `/ru/targetirovannaya-reklama-tashkent/`, `/ru/kontekstnaya-reklama-tashkent/`,
  `/uz/seo-xizmati/`, `/uz/sayt-yaratish/`, `/uz/telegram-reklama/`, and the four CTA blogs

## 16. Deferred items

| item | why |
|---|---|
| Second/mid-article CTAs on the four click-earning blogs | all four already have scoping CTAs; a second would duplicate. Revisit once the Key Event is registered |
| `/uz/sayt-yaratish/` structure examples + scope estimator | needs owner-supplied project structures; the page already has `Muddat`, price logic and 14 FAQ |
| `/uz/telegram-reklama/` expansion | thinnest UZ asset but already covers deliverables, workflow, budget, measurement; `telegram reklama` is not yet in the top 100, so content is not the proven constraint |
| `/uz/seo-xizmati/` first-party proof block | link rebalance first; measure at 4–8 weeks before adding copy |
| `alt` on the shell image, CI build assertions, hreflang `<2` guard | code changes, zero ranking effect |
| Directory listings (olx.uz, topmarketingagency.uz) | on-site mission; needs owner decision on listing content |
| Jurisdictional Uzbek spokes (SMM contract, deliverable spec) | brief only — no new page without SERP evidence and a clean hub relationship |
| `/ru/kontekstnaya-reklama-tashkent/` reframe | cancelled by SERP evidence, not deferred |

## 17. Owner-only blockers

1. **Register `generate_lead` as a Key Event in GA4** (see §6). Until this is done, nothing in this
   release — or any future release — can be judged on leads.
2. **Is `t.me/XGame_changerx` a bot or a personal account?** Bot → `?start=<token>` gives page-level
   lead attribution. Personal → only `?text=` pre-fill, cluster-level at best.
3. **How many Telegram enquiries arrived in the last 90 days, in which language, for which service?**
   Zero-cost, and it either confirms or falsifies the whole "no leads" premise.
4. **One countable, substantiable proof number** (projects, launches, years). This is the single
   thing that would let the Uzbek money pages match `repid.uz`'s "24 loyiha natijasi" pattern.
5. **Will a Google Business Profile ever exist?** It alone unlocks ~480/mo of pack-gated Russian
   demand. Requires a real street address and a reachable phone at registration.
6. Which Telegram handle is canonical for contact — `XGame_changerx` or `GPTBot_support`.

## 18. 7-day checkpoint (by 2026-08-30)

- GSC → Pages: do the 10 changed URLs show crawl activity? Confirm no indexing regression.
- GSC → «seo продвижение сайтов», dimension query+page: has the money page's share of the
  56-impression base started moving off 5/56?
- Confirm `/ru/lokalnoe-seo-tashkent/` and `/ru/razrabotka-telegram-mini-app-tashkent/` still
  return one `id="faq"` and correct titles after recrawl.
- If the Key Event was registered: confirm `generate_lead` appears in GA4 Realtime at all.
- **Anomaly watch:** any of the 21 baseline positions dropping more than 10 places.

## 19. 30-day checkpoint (by 2026-09-22)

Re-run the tracker (~230 credits) and compare against §12.

**Success looks like:** money-page impression share on «seo продвижение сайтов» above 50%;
`/uz/seo-xizmati/` improving from 34; `/uz/smm-xizmatlari/` improving from 36; first GSC impressions
on `/uz/seo-xizmati/` and `/uz/telegram-reklama/`.

**Failure looks like:** `seo xizmati` and `smm xizmatlari` flat within ±3 despite the donor
increase. That would mean internal linking is not the Uzbek constraint, and the next hypothesis is
off-page authority (8 referring domains, DR 18) — **do not respond by building more Uzbek pages.**

Note the research lock: do not re-buy keyword metrics or SERPs covered on 2026-08-21/22 before
2026-09-20.

## 20. 60/90-day decision rules

- **60 days.** If the Uzbek cluster is trending up, invest content in `/uz/smm-xizmatlari/` and
  `/uz/sayt-yaratish/` — the two highest CPC-weighted UZ pages ($403 and $343/mo), *not*
  `/uz/seo-xizmati/`, which is last of four on that measure despite being the cheapest to improve.
- **60 days.** If `telegram reklama` is still outside the top 100, the Telegram page needs content,
  not links — it is the thinnest UZ asset against 70/mo of measured demand.
- **90 days.** Re-measure backlinks (locked until 2026-09-20). Expect 10–12 referring domains and
  **no** tracked-position change; that outcome is the empirical proof that links were never the
  binding constraint. Record it either way.
- **90 days.** Scale-or-kill on any cluster only once it has ≥10 recorded Telegram clicks. Below
  that the sample cannot distinguish clusters.
- **Any time.** If a future SERP pull shows commercial service pages entering the non-geo top 20 for
  «контекстная реклама» or «таргетированная реклама», reopen the frame test — one page at a time.

## 21. Rollback plan

The release is a single commit touching only content JSON. Nothing structural to unwind.

```bash
# full rollback
cd F:/Claude/gptbot-top3-20260823
git revert --no-edit ff6d519
npm run build:cf
./node_modules/.bin/wrangler pages deploy dist --project-name=ai-direct-pro-landing --branch=main
```

```bash
# or redeploy the previous production build without touching git
./node_modules/.bin/wrangler pages deployment list --project-name ai-direct-pro-landing
# roll back to deployment 4701d4b7-f623-40d4-9e0f-a02697af3dfe (source 6c19acc) from the dashboard
```

Per-file rollback is also clean — each of the 10 files can be restored with
`git checkout 6c19acc -- <path>`. Before/after facts for all changed pages are stored in
`scratchpad/snapshot.json`; the rank baseline is in §12.

**Rollback triggers:** a tracked position dropping more than 10 places and holding for two
consecutive tracker runs; or the SEO money page's position on «seo продвижение сайтов» degrading
below 26 while the blog's share rises (that would mean the consolidation over-corrected — in which
case revert only the `chto-takoe-seo-prodvizhenie` link, not the whole commit).

## 22. Single next best move

**Register `generate_lead` as a Key Event in GA4 Admin.**

It takes about two minutes, needs no code, no deploy and no credits — and it is the only remaining
action that converts this entire release from unfalsifiable to measurable. Every ranking change
shipped today will be judged on positions and impressions until it is done, and positions are a
proxy for the thing the business actually needs. The event already fires, with the right semantics
and the right dimensions, on every page in this release. GA4 simply is not counting it.

Pair it with the single question worth more than the instrument: *how many Telegram enquiries
arrived in the last 90 days, in which language, for which service?*
