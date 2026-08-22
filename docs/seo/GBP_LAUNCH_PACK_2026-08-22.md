# Google Business Profile launch pack — GPTBot.uz, 2026-08-22

Execution checklist. The analysis behind it is in
`docs/seo/AUTHORITY_PROGRAMME_2026-08-22.md` §5 and
`docs/seo/LOCAL_CITATION_PACK_2026-08-21.md`; neither is repeated here.

**Status: no profile exists.** Verified 2026-08-22 with `search_local_businesses`,
30 km around central Tashkent, query "GPTBot Boss Digital" — zero results. Also
absent: Bing Places, Yandex Business, 2GIS. Nothing has been created or claimed,
because doing so requires facts that do not exist yet (see
`BUSINESS_FACTS_REQUIRED_2026-08-22.md`).

---

## 1. What the profile unlocks, measured

The local pack occupies **positions 3–8** on Russian agency-framed queries and
appears on **none** of the Uzbek-language ones. From the 25-keyword rank baseline
plus ten live SERPs:

**Pack present — unreachable without a profile at any content quality:**
`seo оптимизация ташкент` · `seo продвижение сайтов` · `seo ташкент` ·
`контекстная реклама ташкент` · `маркетинговое агентство ташкент` ·
`разработка сайтов ташкент` · `рекламное агентство ташкент` ·
`смм агентство ташкент` · `смм ташкент` · `создание сайта ташкент`

**Pack absent — winnable on content and links alone:** every Uzbek keyword
tracked, plus `таргетированная реклама ташкент`, `telegram ads узбекистан`,
`аудит digital маркетинга`, `продвижение сайта цена`, `стоимость продвижения`,
`цены на seo продвижение`, `заказать seo продвижение`.

The largest genuinely commercial Russian volume behind the pack is
«маркетинговое агентство» at 90/mo.

## 2. Blocking prerequisites

| Prerequisite | Status | Source |
| --- | --- | --- |
| Phone number | **Missing** — `site.json.phone` is `""` | Owner |
| Registration type — service-area vs physical address | **Undecided** | Owner |
| Business name as it will appear | Suggest `GPTBot.uz` (matches `organizationName`) | Owner confirms |
| Verification method | Google decides at registration (postcard, phone or video) | — |

A **service-area business** hides the street address and is the correct, honest
choice for a studio without a public office. It is not a weaker profile: it still
appears in the pack, and it avoids inventing an address.

## 3. Categories — verified against the live category list

Pulled 2026-08-22 with `list_business_categories`; the counts are how many
businesses worldwide use each slug, which is a proxy for how well-established the
category is.

| Role | Category | Businesses | Why |
| --- | --- | ---: | --- |
| **Primary** | `internet_marketing_service` | 367 929 | The closest honest fit for a studio selling SEO, SMM, paid media and bots. It is also how `fastbase.com` files oqila.uz. |
| Secondary | `website_designer` | 542 275 | Site development is a real, delivered service — `/uz/sayt-yaratish/` and `/ru/razrabotka-saytov-tashkent/` |
| Secondary | `advertising_agency` | 585 540 | Telegram Ads, contextual and paid social are all delivered |
| Secondary | `marketing_consultant` | 255 886 | Matches the audit service |

Do **not** pick `marketing_agency` as primary. It is the term the local pack
attaches to, which makes it tempting, but the primary category should describe
what is actually delivered rather than the query being chased.

## 4. Services to list

Use the published service pages, one profile service per money page, with the
page's own wording. Do not invent a service that has no page behind it.

| Service | Landing URL |
| --- | --- |
| SEO xizmati / SEO-продвижение | `/uz/seo-xizmati/` · `/ru/seo-prodvizhenie-saytov-tashkent/` |
| SMM xizmatlari / SMM-продвижение | `/uz/smm-xizmatlari/` · `/ru/smm-prodvizhenie-tashkent/` |
| Sayt yaratish / Разработка сайтов | `/uz/sayt-yaratish/` · `/ru/razrabotka-saytov-tashkent/` |
| Telegram reklama / Telegram Ads | `/uz/telegram-reklama/` · `/ru/telegram-ads-uzbekistan/` |
| Таргетированная реклама | `/ru/targetirovannaya-reklama-tashkent/` |
| Контекстная реклама | `/ru/kontekstnaya-reklama-tashkent/` |
| Маркетинговый аудит | `/ru/marketingovyi-audit-tashkent/` |
| AI-боты для бизнеса | `/ru/ai-bot-dlya-biznesa/` · `/uz/biznes-uchun-ai-bot/` |

## 5. Description

Derived from `site.json.organizationDescription`, trimmed to GBP's 750-character
limit, no claim that is not already published:

> GPTBot.uz — студия из Ташкента. Запускаем AI-ботов для Telegram, Instagram
> Direct и WhatsApp, которые отвечают клиентам на русском и узбекском, собирают
> заявку и передают её менеджеру. Также ведём SEO-продвижение, SMM, контекстную
> и таргетированную рекламу, Telegram Ads и разработку сайтов. Работаем по
> Узбекистану: Ташкент, Самарканд, Бухара. Консультация и первичный разбор —
> бесплатно. Мы не обещаем гарантированных позиций в поиске и гарантированных
> продаж.

The last sentence is deliberate. It is already published on every money page and
it is the position that separates this studio from the agencies promising top-1.

## 6. Website URL and UTM

Point the profile at the **homepage**, not a service page:
`https://gptbot.uz/?utm_source=google&utm_medium=organic&utm_campaign=gbp`

Per-service links in the Services section use the same pattern with
`utm_content=<service-slug>`. The Metrika tag already strips everything except
marketing parameters, so these survive into analytics cleanly.

## 7. Photos

Minimum ten, all real. **Do not use stock photography or generated images** — a
profile that looks synthetic loses the trust the profile exists to build.

- Logo (square, from `assets/landing/logo-sq.webp`)
- Cover image
- Team at work — real people, with their consent
- Screenshots of a delivered bot conversation, with client data removed
- Screenshots of a delivered site, with client permission

## 8. Reviews

**Do not buy, script, incentivise or write reviews.** Ask, once, at the point a
client says they are happy, with a direct link to the review form. Nothing else.
Review count is the single largest pack-ranking factor and also the single
easiest way to get a profile suspended.

## 9. Verification checklist

- [ ] Phone decided and written into `content/global/site.json`
- [ ] Service-area vs physical address decided
- [ ] Profile created at business.google.com with the primary category above
- [ ] Verification completed (postcard / phone / video)
- [ ] Services added, each pointing at its published page
- [ ] Description added
- [ ] Ten real photos uploaded
- [ ] Website URL with UTM set
- [ ] Bing Places and Yandex Business created with **identical** NAP
- [ ] `sameAs` in `site.json` extended with the profile URL, then redeployed

## 10. Post-launch tracking

| When | Check | Working |
| --- | --- | --- |
| +7 d | Profile verified and visible on Maps | Appears for a brand search |
| +14 d | `маркетинговое агентство ташкент`, `смм агентство ташкент` | Any pack impression at all |
| +30 d | GBP insights: calls, direction requests, site clicks | Non-zero site clicks |
| +30 d | GA4 with the `gbp` campaign filter | Sessions attributed to the profile |
| +60 d | Rank tracker re-run on the ten pack-gated keywords | Movement on any of them |
