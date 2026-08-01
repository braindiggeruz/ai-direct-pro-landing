# Uzbek website-authority sprint — evidence and decisions, 2026-08-01

Fourth release of the day, and the first that adds no new commercial page.
It deepens the cluster around `/uz/sayt-yaratish/` instead.

Prior evidence this builds on, not repeats:
`DEMAND_REALITY_CHECK_2026-08-01.md` (volumes), `WEBDEV_CLUSTER_MAP_2026-08-01.md`
(the two original spokes), `RELEASE_2026-08-01_WEBDEV_CLUSTER.md` (what shipped).

## 1. The constraint this sprint had to work around

The paid keyword expansion earlier the same day measured the whole
`sayt yaratish` seed. It returned volume for exactly two supporting intents —
price and free-builder — both already published. **Six further Uzbek topics were
measured and returned no volume at all**: Tashkent ordering, timelines,
contractor choice, project preparation, site types, common mistakes.

That is the same shape as the ~140 bot-cluster pages that earn zero clicks, and
the demand policy exists to stop it. So the question for this sprint was not
"which topics have volume" — none of the remaining ones do — but "which topics
answer a real pre-purchase question well enough to earn a place in the cluster
on buyer-journey grounds alone."

Two consequences, both deliberate:

- **No new page has `pageType: money` or `niche`.** Everything added is a blog
  article, which the demand gate explicitly exempts (`scope.pageTypes`), because
  blog articles are not the failure mode the gate was built to prevent.
- **No new URL may ever own a hub keyword.** Enforced by test, not by intent.

Credits were 4 before this sprint and 4 after. Zero paid calls were made.

## 2. GSC evidence read (free tools only)

| Query | Window | Rows |
| ----- | ------ | ---: |
| query × page, whole property | 2026-04-29 → 2026-07-29 | 151 |
| page, `/uz/` only | 2026-01-29 → 2026-07-29 | 56 |
| query, `/uz/` only | 2026-01-29 → 2026-07-29 | 10 |

**No Uzbek web-development query appears anywhere in six months of data.** The
hub and its two spokes were published hours before this sprint and are still
unknown to Google. That is expected, and it is why no create/reject decision
below is justified by GSC — GSC is used here to establish what the Uzbek pages
already rank for, so the new articles could be attached to that strength.

What the Uzbek locale does earn (6 months, 56 URLs, 3 clicks total):

| Page | Impr | Avg pos |
| ---- | ---: | ------: |
| `/uz/arizalarni-avtomatlashtirish/` | 15 | **2.07** |
| `/uz/instagram-bot-biznes-uchun/` | 14 | 3.07 |
| `/uz/biznes-uchun-ai-bot/` | 38 | 4.45 |
| `/uz/chat-bot-biznes-uchun/` | 26 | 4.42 |
| `/uz/ai-sotuvchi/` | 22 | 6.32 |
| `/uz/instagram-uchun-ai-menejer/` | 29 | 8.93 (2 clicks) |

Every one of these is in the frozen bot cluster — strong positions against
queries almost nobody searches. Their value to this sprint is not their traffic;
it is that they are topically adjacent to "a website that collects enquiries"
and can pass internal links to the hub honestly.

## 3. Candidate topics — decisions

| # | Topic | Decision | Why |
| - | ----- | -------- | --- |
| A | What to prepare before ordering a site | **CREATE** | Distinct pre-purchase intent, no Uzbek equivalent, directly reduces the stalls that delay real projects. Absorbs G. |
| B | Which site type a business needs | **CREATE** | The hub's table says what we build; this answers how to choose. Mirrors the Russian cluster, which has the same split. |
| C | Domain and hosting, and who owns them | **CREATE** | Ownership is the single most consequential thing a first-time buyer gets wrong. The hub covers it in one FAQ line; it deserves depth. |
| D | Development process, stage by stage | **REJECT** | The hub's own `#jarayon` section owns this. A separate article would compete with the hub for the same explanation. |
| E | Pre-launch checklist | **REJECT** | Overlaps D and A. The useful half is now the checklist inside A. |
| F | Why a site produces no enquiries | **CREATE** | Distinct intent (existing site, not a new one), and it attaches to the locale's strongest asset — the `arizalar` pages at positions 2–4. |
| G | How to write a technical brief | **REJECT** | Fully contained in A. A standalone article would be A with a different title, which is the doorway pattern. |

Four created, three rejected. The brief allowed five; a fifth would have been D
or E, and both are the hub's own content under another URL.

## 4. Content inventory — Uzbek pages assessed as link sources

25 Uzbek URLs were reviewed. Seven received a contextual link to the hub; the
rest did not, because the hop would not help the reader.

| Source | Anchor | Why the link earns its place |
| ------ | ------ | ---------------------------- |
| `/uz/sayt-uchun-ai-bot/` | *(already linked)* | Site bot ⇢ the site itself |
| `/uz/arizalarni-avtomatlashtirish/` | ariza keltiradigan sayt | Automating enquiries assumes something produces them |
| `/uz/dokon-uchun-ai-bot/` | internet do‘kon yaratish | Shop bot readers often have no shop yet |
| `/uz/biznes-nega-arizalarni-yoqotadi/` | biznes uchun sayt | Lost-enquiry diagnosis leads to the channel |
| `/uz/savdoni-avtomatlashtirish/` | sayt buyurtma qilish | Sales automation needs an entry point |
| `/uz/biznes-uchun-ai-bot/` | professional sayt | Highest-impression Uzbek page; adjacent service |
| `/uz/blog/instagram-telegram-crm-bitta-ariza-voronkasi/` | loyiha uchun sayt | The funnel article is missing the web channel |
| `/uz/blog/biznes-instagram-telegramdan-kelgan-arizalarni-nega-yoqotadi/` | web sayt yaratish | Same reasoning, informational side |

Not linked, and why: the 18 vertical bot pages (clinic, salon, fitness, legal,
logistics, delivery, education, real-estate, HoReCa, Samarkand, car dealership),
the GPT-product pages, and the legal/team pages. A link from every Uzbek page to
the hub is exactly the sitewide exact-match pattern the anchor test guards
against, and none of those readers is closer to needing a website than average.

## 5. Anchor distribution pointing at the hub

Measured across every link surface (`internalLinks` plus in-body `linkp`):

| | Value |
| --- | --- |
| Links targeting `/uz/sayt-yaratish/` | 22 |
| Distinct anchors | 15 |
| Largest single anchor | `sayt yaratish` — 3 of 22 (**13.6%**) |
| Test threshold | fails above 60% |

The exact-match head term is the largest anchor, which is expected for a
commercial hub, but it carries barely an eighth of the links. The remaining
14 anchors are descriptive variants: `biznes uchun sayt yaratish`,
`veb sayt xizmatlari`, `professional sayt xizmati`, `sayt bo‘yicha maslahat`,
`sayt yaratish xizmatini ko‘rish`, `sayt buyurtma qilish`, `loyiha uchun sayt`,
`ariza keltiradigan sayt`, `internet do‘kon yaratish`, `web sayt yaratish`,
`professional sayt`, `biznes uchun sayt`, `sayt yaratish xizmati`,
`sayt yaratish xizmatini buyurtma qilish`.

Counts above include a link reached from both the body text and the related-links
card on the same page — one visible destination, two surfaces.

## 6. Intent ownership after this sprint

Hub `/uz/sayt-yaratish/` keeps the entire head cluster: `sayt yaratish`,
`web sayt yaratish`, `veb sayt yaratish`, `sayt ochish`, `sayt tuzish`,
`biznes uchun sayt`, `kompaniya uchun sayt`.

| Supporting intent | Owner |
| ----------------- | ----- |
| sayt yaratish narxi | `/uz/blog/sayt-yaratish-narxi-nimaga-bogliq/` |
| bepul sayt yaratish | `/uz/blog/bepul-sayt-yaratish-yoki-buyurtma/` |
| sayt buyurtma qilish | `/uz/blog/sayt-buyurtma-qilishdan-oldin-nimalar-kerak/` |
| biznes uchun qanday sayt kerak | `/uz/blog/biznes-uchun-qanday-sayt-kerak/` |
| domen va hosting | `/uz/blog/domen-va-hosting-qanday-tanlanadi/` |
| sayt ariza olmayapti | `/uz/blog/biznes-sayti-koproq-ariza-olishi-uchun/` |

No two URLs claim the same primary intent; asserted by test.

## 7. Hub changes

- **133 ASCII apostrophes corrected.** The hub was written with `'` where Uzbek
  needs `o‘`/`g‘` (U+2018) and the tutuq belgisi `’` (U+2019). Its own two spokes
  already used the correct characters, so the hub was the odd one out and the
  error was visible in the rendered page. Formatting was preserved; only the
  apostrophe characters changed.
- New `Sayt buyurtma qilishdan oldin o‘qing` section linking all six spokes,
  plus a TOC entry.
- Two FAQ entries added: what is needed to start, and Telegram/CRM integration.
  Both were named in the brief and neither was answered on the page.

Nothing else on the hub was rewritten. The structure, schema and offer are
unchanged.

## 8. What was deliberately not done

- No new commercial or niche page — the demand gate would have been right to
  reject one, and nothing measured justifies it.
- No `/uz/web-sayt-yaratish/`, `/uz/veb-sayt-yaratish/`, `/uz/sayt-ochish/`,
  `/uz/sayt-tuzish/` or `/uz/toshkentda-sayt-yaratish/`. These are the head
  cluster and belong to the hub.
- No paid Open SEO call. Balance unchanged at 4.
- **No sitewide apostrophe fix.** Roughly 100 further Uzbek files carry the same
  ASCII-apostrophe error, some with 200+ occurrences. Fixing them is correct but
  it is a large unrelated diff and belongs in its own change, so this sprint
  fixed only the file it was already rewriting. The new cluster test covers
  cluster documents, so the defect cannot come back here.

## 9. Honest limits

The four new articles have **no measured search volume**. They are justified by
the buyer journey, not by demand, and that distinction is recorded here so a
later reader does not mistake them for a volume bet. If they earn no impressions
by Day 56, the correct conclusion is that Uzbek web-development long-tail is
thinner than the head term suggests — not that they need to be longer.

The hub's real constraint remains unchanged and is not addressable by content:
the domain has no backlink profile, and the Russian cluster's four spokes have
earned zero impressions in six months. `AUTHORITY_PACKAGE_2026-08.md` P0 items
are still the highest-value remaining action.
