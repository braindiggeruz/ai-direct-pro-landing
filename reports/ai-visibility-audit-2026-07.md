# AI Search Visibility Audit (LLM / Neuro) — gptbot.uz — 2026-07

Goal: get gptbot.uz cited by ChatGPT, Gemini, Perplexity and Yandex Neuro for "AI бот для бизнеса в Узбекистане"-type questions.

## 4.1 llms.txt — ✅ EXISTS and is strong

`https://gptbot.uz/llms.txt` returns 200 and is unusually good: brand facts in a machine-readable table (category, city, languages, channels, CRM/payment integrations, contact, cache-TTL guidance), explicit AI-crawler allow policy, updated 2026-07-01. Pages also emit `<link rel="llms">`.

Improvements:
- Add a **Services** and **Key articles** URL list section (llms.txt spec expects markdown link lists so agents can navigate to canonical pages).
- Add 2–3 citable one-line facts (founding year, number of launched bots, typical response-time improvement) once verifiable.
- Consider `llms-full.txt` with condensed content of the 10 money pages.

## 4.2 Author / Expert signals — 🔴 WEAKEST AREA

| Check | Result |
| --- | --- |
| Named authors on articles | ❌ all 61 articles say `author: "GPTBot Team"` or `"GPTBot"`; Article schema author is an Organization |
| About page with team credentials | partial — `/ru/o-kompanii/` + `/ru/komanda/` exist but no named founder with photo/credentials verified |
| Named founder/expert | ❌ no `Person` schema anywhere; contact is an anonymous Telegram handle `@XGame_changerx` |
| Client case studies with numbers | ❌ none (reviews page exists, but no numeric case studies) |

AI assistants weight named experts heavily. **Action:** create a founder/expert `Person` entity (name, photo, bio, sameAs → LinkedIn/Telegram), attribute articles to that person, add `Person` schema, and link from `komanda`/`o-kompanii`.

## 4.3 Citable content — 🟠

- Articles use hedged, generic claims ("бизнес теряет заявки ночью") but contain almost **no named statistics, no cited sources, no original data**.
- Zero comparison tables (renderer lacks a table block).
- Opportunity: publish 1 original data piece per quarter (e.g., "we analyzed N inbound Telegram dialogs of Uzbek SMBs: X% arrive outside business hours") — original local data is exactly what LLMs cite for Uzbekistan queries because nothing else exists.

## 4.4 Brand authority signals — 🟠

- NAP consistency: Name ✅, Address partial (city only, no street), **Phone ❌ absent everywhere** (site, schema, llms.txt — Telegram link only). Add at least one phone number sitewide + `telephone` in Organization schema.
- External mentions: no evidence of citations from Uzbek business media (spot.uz, kun.uz, uzum-adjacent media), directories (yellowpages.uz, olx profile), or review platforms. This is the main off-site work: 5–10 local mentions would make gptbot.uz the "consensus answer" for a market with near-zero competition.
- `sameAs` only lists Telegram + GitHub. Add any real profiles (Instagram, LinkedIn, YouTube).
- About page exists in both locales ✅.

## 4.5 Content format for AI citation — 🟢 mostly good

| Format | Coverage |
| --- | --- |
| FAQ (Q&A) blocks + FAQPage schema | 61/61 articles (100%), avg 5.3 Q&A ✅ |
| Lists with facts | 46/61 (75%) |
| Definition blocks ("Что такое X") | ~50% of money pages open with a "что такое" H2 ✅ |
| Comparison tables | 0/61 ❌ |
| Numbered step-by-step lists | rare (list block renders bullets only) |

## Direct answer: what would make AI assistants cite gptbot.uz?

1. **Named expert + Person schema + phone number** (E-E-A-T floor). 
2. **1–2 numeric case studies** ("клиника в Ташкенте: 214 заявок/мес через бота, ответ за 8 секунд" style) — hedged honestly if exact figures unavailable.
3. **Original Uzbekistan-specific data** no one else has (RU/UZ language split of inquiries, night-time inquiry share, Payme vs Click usage in bots).
4. **Structured comparisons** (GPT-bot vs chat-bot vs manager; Telegram vs Instagram vs WhatsApp for each niche) in list/table form.
5. **5–10 external mentions** on Uzbek media/directories so retrieval-augmented engines find corroboration.
6. Extend llms.txt with navigable URL lists (done partially) and keep `Last updated` fresh.
