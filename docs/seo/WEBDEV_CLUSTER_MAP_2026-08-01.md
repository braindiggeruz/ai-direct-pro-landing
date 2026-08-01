# Website-development cluster map — 2026-08-01

**Evidence:** Search Console `sc-domain:gptbot.uz` (2026-01-29 → 2026-07-29) plus one
paid Open SEO `research_keywords` call, seed `sayt yaratish`, location 2860
(Uzbekistan), Google Ads source, 26 keywords returned. Justification for the paid call
is in `PAID_CALL_JUSTIFICATION_2026-08-01.md`. Credits 120 → 4.

---

## 1. What the repository already had

The Russian supporting cluster **already exists and is already hub-and-spoke linked**:

| Article | Links to hub | Impressions, 6 months |
| ------- | ------------ | --------------------: |
| `/ru/blog/skolko-stoit-razrabotka-sayta-v-tashkente/` | yes | 0 |
| `/ru/blog/kak-vybrat-razrabotchika-sayta-v-tashkente/` | yes | 0 |
| `/ru/blog/lending-korporativnyy-sayt-ili-internet-magazin/` | yes | 0 |
| `/ru/blog/pochemu-sayt-ne-prinosit-zayavki/` | yes | 0 |

`/ru/razrabotka-saytov-tashkent/` links out to all four. Four of the six Russian topics
proposed for this sprint — pricing, site types, choosing a contractor, why a site fails
— are already published, already linked, and earn **zero impressions between them in six
months**.

The Uzbek side is the opposite: 31 Uzbek articles, **every one about bots, AI chat or
messengers**, and `/uz/sayt-yaratish/` with **no outbound blog links at all**. The page
carrying the strongest measured demand on the site had no supporting content.

That inverted the plan. The gap is Uzbek, not Russian.

## 2. Measured demand — `sayt yaratish` expansion, location 2860

### Head cluster → owned by `/uz/sayt-yaratish/`, no new page

| Keyword | Volume/mo | Competition | CPC |
| ------- | --------: | ----------- | --: |
| sayt yaratish | 1,300 | 0.14 | $1.43 |
| sayit yaratish | 1,300 | 0.14 | $1.43 |
| web sayt yaratish | **260** | 0.24 | $2.10 |
| veb sayt yaratish | 210 | 0.16 | $1.26 |
| sayt ochish | 30 | 0.31 | $1.25 |
| сайт яратиш (Cyrillic) | 30 | 0.60 | $1.60 |
| web site yaratish | 20 | 0.73 | $0.43 |
| веб сайт яратиш | 20 | 0.78 | $1.05 |
| sayt tuzish | 10 | 0.02 | — |
| sayt yaratish uz | 10 | 0.86 | — |
| web sayt ochish | 10 | 0.00 | — |

`sayit yaratish` is a close-variant grouping of the head term, not a separate query —
it must never get its own page. **`web sayt yaratish` (260) outranks `veb sayt
yaratish` (210)**, and the money page declared only the second spelling. Fixed.

### Supporting intents with recorded volume → article justified

| Intent | Keywords | Combined vol/mo | Distinct from money page? |
| ------ | -------- | --------------: | ------------------------- |
| Price formation | `sayt yaratish narxi` | 50 | Yes — asks *what drives the number*, not *who builds it* |
| Free vs commissioned | `bepul sayt yaratish` 70 · `sayt yaratish bepul` 20 · `bepul web sayt yaratish` 10 | 100 | Yes — a comparison decision that precedes hiring anyone |

### Intents with no recorded volume → no page

| Proposed topic | Measured | Action |
| -------------- | -------- | ------ |
| Toshkentda sayt buyurtma qilish | not returned | NO_PAGE_NEEDED |
| sayt qancha turadi | not returned | NO_PAGE_NEEDED — covered by the price article |
| internet do‘kon yaratish | not returned | NO_PAGE_NEEDED — site-types table on the money page |
| landing page yaratish | not returned | NO_PAGE_NEEDED — same table |
| biznes uchun sayt / kompaniya uchun sayt | not returned | NO_PAGE_NEEDED — money page owns it |
| sayt yaratuvchini qanday tanlash | not returned | NO_PAGE_NEEDED |
| sayt yaratish qancha vaqt oladi | not returned | NO_PAGE_NEEDED — money page has a timelines section |
| sayt buyurtma qilishdagi xatolar | not returned | NO_PAGE_NEEDED |

### Intents found but rejected

| Keyword | Vol | Why rejected |
| ------- | --: | ------------ |
| google sayt yaratish | 20 | Google Sites product intent — a different tool, not a service GPTBot sells |
| web dizayn yaratish | 20 | Design-only intent; no design-only offering exists |
| html sayt yaratish | 10 | DIY coding intent, not commercial |
| uz domenida sayt ochish | 10 | Real question, too thin for a page — folded into the money page instead |
| web sayt yaratish usullari | 10 | Overlaps the free-vs-commissioned article |
| web sayt yaratish texnologiyasi | 10 | Developer intent, no business value here |
| internetda sayt ochish / bepul hosting da sayt ochish | 10 each | Hosting-setup intent, outside the service |
| cms da veb sayt yaratish, internetda web sayt ochish, uz sayt yaratish | 0 | No volume |

## 3. Cluster map

| Cluster | Intent | Lang | Vol/mo | Competition | SERP type | GPTBot URL | Action |
| ------- | ------ | ---- | -----: | ----------- | --------- | ---------- | ------ |
| sayt yaratish (head) | commercial | UZ | 1,300 | LOW | service pages | `/uz/sayt-yaratish/` | IMPROVE_EXISTING |
| web/veb sayt yaratish | commercial | UZ | 470 | LOW | service pages | `/uz/sayt-yaratish/` | IMPROVE_EXISTING |
| sayt yaratish narxi | informational-commercial | UZ | 50 | 0.30 | guides + price pages | *new* `/uz/blog/sayt-yaratish-narxi-nimaga-bogliq/` | CREATE_ARTICLE |
| bepul sayt yaratish | informational | UZ | 100 | 0.28 | builders + comparisons | *new* `/uz/blog/bepul-sayt-yaratish-yoki-buyurtma/` | CREATE_ARTICLE |
| разработка сайтов Ташкент | commercial | RU | 1,050 | MED–HIGH | agency pages | `/ru/razrabotka-saytov-tashkent/` | IMPROVE_EXISTING |
| стоимость сайта | informational | RU | — | — | guides | `/ru/blog/skolko-stoit-razrabotka-sayta-v-tashkente/` | NO_PAGE_NEEDED (exists) |
| выбор разработчика | informational | RU | — | — | guides | `/ru/blog/kak-vybrat-razrabotchika-sayta-v-tashkente/` | NO_PAGE_NEEDED (exists) |
| типы сайтов | informational | RU | — | — | guides | `/ru/blog/lending-korporativnyy-sayt-ili-internet-magazin/` | NO_PAGE_NEEDED (exists) |
| сайт не приносит заявки | informational | RU | — | — | guides | `/ru/blog/pochemu-sayt-ne-prinosit-zayavki/` | NO_PAGE_NEEDED (exists) |
| ТЗ на сайт | informational | RU | not measured | — | — | none | INVESTIGATE — the only real Russian gap, but the four existing articles earn zero, so a fifth is not justified until they do |

**Outcome: 2 new Uzbek articles, 0 new Russian articles.** The brief allowed up to four
of each. Writing four Uzbek articles would have meant publishing two with no measured
demand, and any Russian article would have joined four that earn nothing — both are the
pattern the demand policy exists to stop.

## 4. Uzbek copy review

Both articles were written directly in Uzbek, not translated from a Russian draft. The
Russian cluster covers different sub-topics, so there is no parallel text to calque
from.

- Apostrophes: U+2018 throughout (`o‘`, `g‘`), matching the sibling Uzbek files.
- Head term repetition: `sayt yaratish` appears where it reads naturally; the rest uses
  `veb sayt`, `biznes sayti`, `korporativ sayt`, `internet do‘kon`, `loyiha narxi`,
  `ishlab chiqish jarayoni`, `sayt buyurtma qilish`.
- No Russian calques: no `zakaz qilish`, no `srok`, no `stoimost` transliterations.
- Business register: `taklif`, `smeta`, `texnik topshiriq`, `qo‘llab-quvvatlash` used
  as Uzbek business vocabulary rather than borrowed Russian forms.
- Encoding verified in the built HTML, not only in the JSON source.

## 5. Money-page changes

`/uz/sayt-yaratish/`

- `web sayt yaratish` added to secondary keywords — 260/mo, higher than the spelling
  the page already declared.
- `sayt ochish` and `sayt tuzish` added; both are real head-term variants.
- `Toshkentda sayt buyurtma qilish` **not** added: it returned no volume, and the brief
  conditioned it on Open SEO confirming relevance. It did not.
- Domain/hosting question added to the FAQ, absorbing the `uz domenida sayt ochish`
  intent without spending a URL on it.
- New "Buyurtma berishdan oldin" block linking both new articles — the page had no
  outbound blog links at all before this.

`/ru/razrabotka-saytov-tashkent/` — no change. It already links to all four Russian
supporting articles and its metadata already carries the geo cluster.
