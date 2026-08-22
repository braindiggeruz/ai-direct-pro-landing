# Client credit programme — GPTBot.uz, 2026-08-22

The anchor wording, the rotation rules and the reasoning are already written in
`docs/seo/AUTHORITY_PROGRAMME_2026-08-22.md` §2 and are **not repeated here**.
This file records the one correction that changes the size of the prize, and the
inventory table that has to be filled in before a single line of HTML is written.

---

## Correction — the gap is roughly eight times larger than recorded

`AUTHORITY_PROGRAMME_2026-08-22.md` §1 states oqila.uz has **57** referring
domains. That figure came from `get_backlinks_profile` with `one_per_domain` and
a 50-row page — it is one page of results, not a total.

Measured on 2026-08-22 with `get_backlinks_overview`, scope `domain`:

| | Referring domains | Backlinks | Domain rank |
| --- | ---: | ---: | ---: |
| oqila.uz | **463** | 10 578 | 53 |
| dora.uz | 41 | 1 919 | 43 |
| gptbot.uz | **8** | 23 | 18 |
| repid.uz | 1 | 1 | 0 |

The pattern is unchanged and now unmistakable. oqila's largest donors are client
sites carrying a sitewide footer credit — `navoiyazot.uz` 1 708 links,
`oqilaweb.com` 1 296, `petrochem.uz` 1 177, `metallasia.uz` 983,
`andijonnoma.uz` 871, `tiyin.uz` 606, `samagrocenter.com` 593, `nplm.uz` 477,
`uzovoz.uz` 420, `drilltime.uz` 406. dora.uz runs the identical model at smaller
scale: `kafil.uz` alone gives it 1 035 links, `karvontrade.uz` 263.

**Read the number correctly, though.** repid.uz holds **#1 on `seo xizmati`**
with one spam-score-30 referring domain. Referring domains are what the *Russian*
Tashkent SERPs and the local pack respond to; they are demonstrably not what
decides the Uzbek service queries. This programme is the right way to close the
Russian gap and to build the entity — it is not a prerequisite for the Uzbek
layer, and it should not be used as a reason to delay anything there.

---

## The precondition, restated because nothing has changed

Searched again on 2026-08-22 across `content/pages/**`, `content/blog/**` and
`docs/**`: there is **no portfolio page, no case-study page and no client-site
inventory** anywhere in the repository. `/ru/otzyvy/` publishes testimonials
attributed to first names and business types; it names no domain, and every one
describes a bot deployment rather than a website build.

So the yield of this programme is a number nobody in this session can see.

**Never modify a third-party or client site without the client's explicit
permission.** A footer credit added without asking is someone else's website
being edited for our benefit.

---

## Inventory — the owner fills this in

One row per site GPTBot or Boss Digital has delivered. A row with `BUILT: NO` or
`ACCESS: none` is still worth recording, because it stops the same site being
re-checked next quarter.

| # | Domain | Client | GPTBot built it? | Current access | Footer credit today | Permission | Recommended anchor | Target URL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | YES / NO / UNKNOWN | full / CMS only / none | yes / no | asked / granted / refused / not asked | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |

**Anchor and target selection** — the full rules are in
`AUTHORITY_PROGRAMME_2026-08-22.md` §2. In short: match the client site's
language, rotate the wording so no single phrase exceeds ~40% of the set, never
use a geo exact-match anchor, one link per site, and point SEO or SMM
engagements at their own service page rather than claiming a build that did not
happen.

## Sequence

1. Owner completes the inventory above.
2. Owner asks each client, once, for permission. A refusal closes that row.
3. Only then: implement one credit per granted site, with a rotated anchor.
4. Record the live URL of each credit back in this table.
5. Re-measure with `get_backlinks_overview` after 30 days, not sooner.

## Target and honest expectation

The project goal records 8 → 25 referring domains. If the inventory yields 15
sites and half grant permission, this programme alone reaches roughly 15 — most
of the distance, from an entirely white-hat, on-topic, editorially truthful
source.

It will **not** reach 463. oqila has been trading since well before 2023 and
those links accumulated over years of delivery. The right target is 25, and the
right timescale is quarters.
