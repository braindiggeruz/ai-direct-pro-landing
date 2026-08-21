# Authority programme — GPTBot.uz, 2026-08-22

Supplement to `docs/seo/LOCAL_CITATION_PACK_2026-08-21.md`. That file still holds
the verified business data, the directory list and the Google Business Profile
checklist, and none of it is repeated here. This file adds what the second-pass
audit found on 2026-08-22 and could not have found before: a competitor's live
backlink profile, and the one link pattern in this market that GPTBot is
structurally able to reproduce.

Off-page remains the binding constraint. Every on-page change shipped in this
sprint is worth less than closing the gap below.

---

## 1. The gap, measured

| | gptbot.uz | oqila.uz |
| --- | ---: | ---: |
| Referring domains | **8** | **57** |
| Usable referring domains | 3 | most of them |

`gptbot.uz` figures carried from 2026-08-21 and deliberately not re-purchased —
one day had passed. `oqila.uz` measured with `get_backlinks_profile`,
`one_per_domain`, 50 rows sorted by domain rank, on 2026-08-22.

The project goal records a target of 25 referring domains. Section 2 alone would
close most of that distance, if the precondition in it holds.

---

## 2. Client credit links — the highest-leverage pattern, and its precondition

Roughly twenty of oqila.uz's fifty-seven referring domains are **credit links in
the footer of sites it built**. Verified examples from the live profile:

| Referring domain | Anchor | Target |
| --- | --- | --- |
| uzovoz.uz | Сайт яратувчи – OQILA | oqila.uz |
| magnitbuilding.uz | Создание сайтов - Oqila.uz | oqila.uz/ru/ |
| andijonnoma.uz | Веб сайт яратиш - Oqila | oqila.uz |
| tiyin.uz | Сайт очиш - Oqila | oqila.uz/s/sayt-yaratish |
| uzavtoyolbelgi.uz | Developed by Oqila.uz | oqila.uz |
| indigotex.uz | Website development | oqila.uz/ru/s/razrabotka-saytov |
| marble.uz | SEO продвижение — | oqila.uz/ru/s/seo-prodvijenie-saytov |
| megabaza.net | Web-sayt yaratish | oqila.uz/s/sayt-yaratish |

Plus image-anchor credits from atlant-f.uz, modernsystems.uz, navoiyazot.uz,
petrochem.uz, turon-eco.uz, drilltime.uz, emtb.uz, barvent.uz, anguzalagro.uz,
fortunabiznes.uz and varn.uz.

Notice the anchors: every one is different, several are in Uzbek, several in
Russian, several are image links with no anchor at all, and the destinations are
split between the homepage and the relevant service page. That variation is why
the pattern reads as natural rather than as a footer link scheme.

**GPTBot builds websites, so it can do exactly this.** It needs no directory
approval, no Google Business Profile, no price list and no outreach.

### The precondition — this is a blocker, not a task

The repository contains **no verifiable list of client websites**. Searched on
2026-08-22 across `content/pages/**` and `content/blog/**`: there is no portfolio
page, no case-study page and no client-site inventory. `/ru/otzyvy/` publishes
testimonials attributed to first names and business types, but it names no
domain, and every one of them describes a bot deployment rather than a website
build.

So the yield of this programme equals a number nobody in this session can see.
**The owner must supply the list of delivered sites that GPTBot or Boss Digital
still has deployment access to.** Nothing else here can proceed without it, and
no third-party site may be edited without that authorisation.

### Reusable credit snippet — specification, not deployed code

Place in the footer of a delivered site, once per site, single link, no `nofollow`
needed because the link is editorial and truthful.

Uzbek-language client sites:

```html
<a href="https://gptbot.uz/uz/sayt-yaratish/">Sayt GPTBot.uz tomonidan yaratilgan</a>
```

Alternatives to rotate — never ship the same one everywhere:

- `Veb sayt yaratish — GPTBot.uz`
- `Saytni ishlab chiquvchi: GPTBot.uz`
- `GPTBot.uz` (bare brand, on sites where a longer line would look out of place)

Russian-language client sites:

```html
<a href="https://gptbot.uz/ru/razrabotka-saytov-tashkent/">Разработка сайта — GPTBot.uz</a>
```

Alternatives to rotate:

- `Сайт разработан GPTBot.uz`
- `Создание сайта: GPTBot.uz`
- `GPTBot.uz`

Rules, and they matter more than the wording:

1. **Match the client site's language.** An Uzbek site gets the Uzbek anchor and
   the Uzbek destination; a Russian site gets the Russian pair.
2. **Never use a geo exact-match anchor** such as «создание сайтов Ташкент» or
   `sayt yaratish Toshkentda`. That is the one variant that reads as manipulation.
3. **Vary the anchor across sites.** No single wording above ~40% of the set.
4. Where the site was an SEO or SMM engagement rather than a build, point at
   `/uz/seo-xizmati/` or `/ru/smm-prodvizhenie-tashkent/` instead, and say so in
   the anchor. Do not claim a build that did not happen.
5. One link per site. Site-wide footers already appear on every page; a second
   link adds nothing and looks worse.

---

## 3. New citation targets — verified live on a competitor

Each of these currently carries an oqila.uz profile, which is direct evidence
that the directory accepts Uzbek marketing and web agencies. Add to the eleven
targets already listed in the 2026-08-21 pack; do not replace them.

| Directory | Domain rank | Link type | What it is | Destination |
| --- | ---: | --- | --- | --- |
| ratingruneta.ru | 82 | dofollow | Agency rating registry with a per-agency profile and contacts page | https://gptbot.uz/ |
| workspace.ru | 80 | nofollow | Contractor marketplace. Nofollow, but it also ranks organically for audit and agency queries, so the listing is visibility as well as a citation | https://gptbot.uz/ |
| fastbase.com | 72 | dofollow | Country index — the relevant node is `/countryindex/Uzbekistan/I/Internet-marketing-service` | https://gptbot.uz/ |
| uz.tgstat.com | 63 | nofollow | Telegram channel directory. **GPTBot already runs Telegram channels and bots, so this is free and immediate** | https://gptbot.uz/ |
| konigle.com | 60 | nofollow | Curated listicle `/info/s/seo-agencies-tashkent` | https://gptbot.uz/uz/seo-xizmati/ |
| ppc4.com | — | dofollow | Directory node `/digital-marketing/uzbekistan/tashkent/` | https://gptbot.uz/ |
| topmarketingagency.uz | — | unknown | Uzbek agency ranking site, surfaced at rank 12 on `marketing agentligi` | https://gptbot.uz/ |
| ru.wadline.com | — | unknown | Agency directory, surfaced at rank 5 on «маркетинговое агентство» | https://gptbot.uz/ |

Priority order: **uz.tgstat.com** first (free, immediate, already qualifies),
then ratingruneta.ru and fastbase.com for domain rank, then the rest.

Use the business data table in the 2026-08-21 pack verbatim. The phone and street
address are still empty and must stay empty in every form.

---

## 4. Editorial prospects — real, not directories

| Prospect | Domain rank | Evidence it links out | Angle |
| --- | ---: | --- | --- |
| xabar.uz | 58 | Linked to oqila.uz from an article on why a website matters for business, anchor «интернет маркетинг агентлиги» | A genuine editorial placement in an Uzbek news outlet. Pitch a factual piece, not a promo. |
| billz.io | 30 | Links out to `oqila.uz/kpi-nima` from its own Uzbek blog | Retail SaaS that cites Uzbek explainer pages. `/uz/blog/marketing-nima/` and `/uz/blog/smm-nima/` are the equivalent assets. |

### The non-obvious one: Uzbek academic journals

Four scholarly publications cite oqila.uz explainer pages:

- `in-academy.uz` cites `oqila.uz/smm-nima`
- `universaljurnal.uz` cites `oqila.uz/suniy-intellekt`
- `scientific-jl.com` cites `oqila.uz/suniy-intellekt`
- `tadqiqot.uz` cites `oqila.uz/`

All four are dofollow. This is a real channel and it explains a finding that
looked like a dead end elsewhere: the `raqamli marketing` SERP is dominated by
Wikipedia and university journals, which makes it worthless as a commercial
target but tells you the Uzbek academic corpus around marketing and AI is large
and it links out.

**What earns these links is a clear, source-cited, Uzbek-language explainer of a
term.** GPTBot already has that shape in `/uz/blog/smm-nima/` and now
`/uz/blog/marketing-nima/`, plus a substantial Uzbek AI corpus. No outreach
template is needed — the citations happen because the page is the clearest
Uzbek-language answer available. The action is to keep authoring in that shape,
not to email anyone.

### What is not worth building

The first audit floated a marketing-budget calculator and an "SEO benchmark
Uzbekistan" study as linkable assets. Nothing in oqila.uz's fifty-seven referring
domains, and nothing in the twenty SERPs pulled across this and the previous
session, links to a tool or an original study. **This market does not link to
those formats yet.** Skip them.

---

## 5. Google Business Profile — status unchanged, still blocked

Checked on 2026-08-22 with `search_local_businesses`, 30 km around central
Tashkent, query "GPTBot Boss Digital": **zero results**. No profile exists.

`content/global/site.json` still carries `"phone": ""` and a city-level
`"address": "Tashkent, Uzbekistan"`. Nothing was invented and nothing changed.

### Why it now matters more than it did

The rank tracker baseline run on 2026-08-21 at 22:05 UTC recorded SERP features
for all 25 tracked keywords. The split is clean:

**Local pack present** — unreachable without a profile:
`seo оптимизация ташкент`, `seo продвижение сайтов`, `seo ташкент`,
`контекстная реклама ташкент`, `маркетинговое агентство ташкент`,
`разработка сайтов ташкент`, `рекламное агентство ташкент`,
`смм агентство ташкент`, `смм ташкент`, `создание сайта ташкент`.

**No local pack** — winnable on content alone:
`sayt yaratish`, `sayt yaratish narxi`, `sayt yaratish xizmati`, `smm nima`,
`smm xizmatlari`, `telegram reklama`, `veb sayt yaratish`, `targetolog`,
`telegram ads узбекистан`, `аудит digital маркетинга`, `продвижение сайта цена`,
`стоимость продвижения`, `таргетированная реклама ташкент`,
`цены на seo продвижение`, `заказать seo продвижение`.

Every Uzbek-language keyword in the set falls in the second group. Every
Russian-language geo-plus-agency keyword falls in the first. That is the
empirical basis for prioritising the Uzbek service layer this sprint, and it is
also the exact size of what a Google Business Profile would unlock.

### The owner action, in order

1. Decide whether the business publishes a **phone number**, and whether it
   registers as a service-area business (no street address shown) or a physical
   location. Both are legitimate; a service-area profile is the honest option for
   a studio without a public office.
2. Put the decided facts into `content/global/site.json` — `phone`, and
   `address`/`addressLocality` if they change. The schema output follows
   automatically.
3. Register the profile. Category: the closest honest fit is *Internet marketing
   service*, which is also how `fastbase.com` files oqila.
4. Then re-check «маркетинговое агентство» (90/mo, competition 0.73, three local
   pack slots) — it is the largest genuinely commercial Russian volume in the
   whole cluster and the only thing a profile unlocks.

**Do not invent a street address or a phone number to get past step 1.**
