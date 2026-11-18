# Uzbek queries got the Russian chat: evidence and release plan (2026-11-18)

Owner's report of 2026-11-18: Uzbek queries such as «gpt bepul» show GPTBot.uz with a Russian title and description. Decision A14 in `content/seo/intent-manifest.json`.

## Evidence

**Search Console, 2026-10-20 … 2026-11-16 (28 days).** The figures are for Uzbekistan and for queries with clearly Uzbek words (bepul, kirish, yozish, tilida, uzbekcha, …).

| Page | Impressions | Clicks | CTR |
|---|---|---|---|
| /ru/gpt-chat/ | 19 068 (22 %) | 98 | 0.51 % |
| /uz/gpt-uzbek-tilida/ | 69 166 (78 %) | 518 | 0.75 % |

- **Concentration.** Of 21 795 impressions of Uzbek queries on Russian pages of the whole site, 21 591 went to /ru/gpt-chat/. Every other Russian page got tens.
- **Steady, not a regression.** The weekly share of the Russian chat has been 11–34 % since the end of August.
- **Same query, same position, lower CTR for the Russian snippet:**
  - «chatgpt kirish»: 0.20 % at 6.3 (Russian) vs 0.55 % at 6.6 (Uzbek);
  - «chatgpt yozish»: 0.44 % at 6.0 vs 0.71 % at 6.2.
- **Ruled out:**
  - country: 96 % of these impressions come from Uzbekistan;
  - canonical clustering: URL Inspection shows each page as its own Google canonical;
  - device: the effect is on both (mobile 20 %, desktop 30 % Russian share).

**Live search, 2026-11-18, from Uzbekistan, «chatgpt bepul», gl=uz, pws=0:**
- under hl=uz, place 3 is /uz/gpt-uzbek-tilida/;
- under hl=ru, place 3 is /ru/gpt-chat/.

The URL flips with the interface language at the same place. Uzbek-language pages of other sites remain in the hl=ru results, so Google does not exclude Uzbek pages for Russian-interface searchers: it swaps the members of our declared pair. This is the mechanism decision A11 recorded as unverified on 2026-10-26.

**Not explained.** The Russian share differs by query: «chatgpt bepul» 96 %, «chatgpt bepul kirish» 0 %. The effect of the change is therefore measured, not predicted.

## Change

Both content files set `hreflangUnpaired: true`. The pages keep `hreflangRu` / `hreflangUz` and their plain cross-links in the text. The build emits no `<link rel="alternate" hreflang>` for them and no sitemap alternates. Every other page is unchanged. Guarded by `tests/seo-hreflang-guard.test.ts`; the hreflang field of both protected contracts changes through the reviewed revision `docs/seo/evidence/2026-11-18-uz-unpair/`.

## Release and measurement

- **Release.** Deployed on 2026-11-18 (production 655ce59a) on the owner's order, ahead of the first plan (after observation R15). R15 (titles and descriptions of the two chats) is therefore read on 2026-12-21 per query language, with 2026-11-18 marked as a change date.
- **After the deploy.** Use «Request indexing» for both URLs, then read Search Console at days 7, 14 and 28 after both are recrawled.
- **Success.** In Uzbekistan the Russian chat's share of Uzbek-worded impressions falls from 22 % to 5 % or less, and the pair's clicks on those queries grow. Russian-query impressions of the Russian chat fall no more than the site trend.
- **Rollback.** If within 14 days the pair's impressions on Uzbek-worded queries fall by more than 20 %, or its clicks fall, remove `hreflangUnpaired` from both files (one revision). Google takes days to weeks to re-read the pair.
