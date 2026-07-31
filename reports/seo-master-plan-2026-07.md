# SEO Master Plan — gptbot.uz — 2026-07

Sources: `seo-technical-audit-2026-07.md`, `content-audit-2026-07.md`, `competitor-gap-2026-07.md`, `ai-visibility-audit-2026-07.md`.

## Answers to the three key questions

1. **#1 technical issue blocking top-3 right now:** there is no single technical blocker — the site is technically excellent (static prerender, fast, clean schema, valid sitemap). The closest thing is the **intent-mismatched `/ru/blog/razrabotka-ai-bota-v-tashkente-cena/`** (the highest-commercial-intent URL serves e-commerce content) plus the **`/blog/[slug]` 404** losing legacy/external link equity. What actually holds the site back is **authority + content depth** (thin ~600-word articles, no case studies, no named expert, no external mentions).
2. **3 content topics most likely to rank in 30 days:** (a) logistics/dispatcher AI-bot RU (UZ version exists, zero competition), (b) construction-company lead-processing bot (uncontested anywhere), (c) real-numbers bot case study (biggest competitor gap; Uzbek-specific = instant uniqueness). All three ship as drafts in this PR.
3. **What makes AI assistants cite gptbot.uz:** named expert + `Person` schema + phone in NAP, 1–2 numeric case studies, original Uzbekistan data points, structured comparisons, and 5–10 external Uzbek-media mentions. llms.txt is already in place — the missing layer is E-E-A-T and corroboration.

---

## CRITICAL (fix this week — blocks ranking)

1. **`/blog/[slug]` returns 404** → add `/blog/* /ru/blog/:splat 301` → `public/_redirects` (verify generate-robots/redirects script) → recovers all unprefixed link equity and stops 404s from AI-generated citations.
2. **Slug/content mismatch on `razrabotka-ai-bota-v-tashkente-cena`** → rewrite body to actually answer "разработка AI-бота в Ташкенте: цена" (price ranges, what affects cost, timeline) or 301 to `tsena-ai-bota-dlya-b2c-biznesa-v-uzbekistane` → `content/blog/ru/razrabotka-ai-bota-v-tashkente-cena.json` → unlocks the site's best commercial query.
3. **No `telephone` anywhere (schema, site, llms.txt)** → add phone to `Organization.contactPoint`, footer, and llms.txt → `content/seo`/`content/global` config + prerender scripts → NAP completeness for local pack + AI answers.
4. **Telegram-price cannibalization** (4 articles targeting ~the same query) → pick one canonical (`stoimost-telegram-bota-dlya-biznesa-v-uzbekistane`), differentiate or 301 the rest → `content/blog/ru/` → stops Google splitting relevance across 4 URLs.

## HIGH (fix this month — accelerates top-10 → top-3)

1. **Named expert / E-E-A-T layer** → create founder `Person` (bio, photo, sameAs), set as `author` on articles, emit `Person` schema → `content/pages/ru/komanda.json`, prerender-blog.ts author handling → biggest single AI-citation lever.
2. **Publish the 5 new draft articles in this PR** (construction, case-numbers, logistics RU, DIY scenario, e-commerce+Payme) after review → `content/blog/{ru,uz}/` → captures 3 uncontested topics + 2 high-demand gaps.
3. **Expand the 10 thinnest articles** (8-block bodies → 20+ blocks, esp. geo pages Tashkent/Samarkand and pricing) → `content/blog/` → moves borderline top-20 pages into top-10.
4. **Hand-link high-value articles from money pages** (48/61 articles not explicitly linked from any page `internalLinks`) → `content/pages/*/*.json` → hub-and-spoke completion.
5. **Niche coverage**: 6 of 10 niche money pages (restaurant, avto, jurist, nedvizhimost, fitnes, dostavka) have zero supporting articles → write 1 support article each → cluster credibility for "AI бот для [ниша]".
6. **UZ parity for top RU articles** (19 RU-only) → `content/blog/uz/` → ~50% of the market searches in Uzbek Latin.

## MEDIUM (2–3 months — compounds)

1. **Original data study** ("N inbound dialogs of Uzbek SMB bots analyzed: X% at night, Y% in Uzbek") → new article + llms.txt fact → the citation magnet for every AI engine.
2. **2 real case studies with numbers** (clinic, shop) + Review/CaseStudy markup → new pages → converts and gets cited.
3. **External mentions campaign**: 5–10 placements (spot.uz, kun.uz tech, vc.ru, local directories, olx business profile) → off-site → corroboration for RAG engines.
4. **Add `table` block type to blog renderer** + retrofit comparisons into top-10 articles → `src/shared/types.ts`, `scripts/prerender-blog.ts` (code change — out of scope for this PR per constraints).
5. **Voice/phone-bot and bot-testing-checklist content** (chatme.ai-dominated topics adapted to UZ market).
6. **Normalize `topicCluster` taxonomy** (37 ad-hoc values → ~8 canonical slugs) so related-article widgets and future audits work.

## QUICK WINS (< 1 hour each, do immediately)

1. Add `/blog/* → /ru/blog/:splat 301` redirect line (also listed in Critical — genuinely 5 minutes).
2. Remove `<link rel="canonical" href="https://gptbot.uz/">` from the 404 page template.
3. Fix or remove `/ru/hub/` (hub.json exists but URL 404s).
4. Add ≥5 keywords to the 11 articles with 3–4 keywords.
5. Add "Services" + "Key articles" link lists to `public/llms.txt`.
6. Add `telephone` (or contact URL) to `Organization.contactPoint` in the global SEO config.
7. Edge-cache HTML: set `Cache-Control: public, s-maxage=3600, stale-while-revalidate` for `/*` in `public/_headers`.
8. Trim Google Fonts weights (8 → 5) or self-host both families.
9. Publish the 4 existing "zadachi" drafts (clinic/salon/edu/shop) — they're written and flagged `draft`.
10. Add real `sameAs` profiles (Instagram/LinkedIn) to Organization schema.

## 30/60/90 expectations

- **30 days:** uncontested topics (logistics RU, construction, case study) reach top-10 in Google UZ; unprefixed-URL 404s eliminated; price-intent URL re-ranks.
- **60 days:** E-E-A-T layer + internal-link fixes push existing top-10 money queries («чат бот для бизнеса Ташкент», «Telegram бот цена») toward top-3; first AI-assistant citations via llms.txt + FAQ structure.
- **90 days:** external mentions + original data make gptbot.uz the default cited source for "AI бот Узбекистан" in Perplexity/ChatGPT-search; Yandex Neuro picks up geo pages.
