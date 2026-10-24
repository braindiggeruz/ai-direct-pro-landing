# tav

W2-03 is done: `F:\Claude\gptbot-snippets-translator-20261024\content\blog\uz\tavsifnoma-namuna.json` is written and its tests pass. One suite, `homepage-lists-frozen`, fails because the new article now enters the "/" list, which is the expected protected "/" revision for you. Nothing is staged, committed, built or deployed. I did not touch `intent-manifest.json`, `demand-policy.json`, protected pages or any other file.

**What the page has**
- Title «Tavsifnoma namunasi: o‘quvchi, talaba va xodim uchun (2026)» (59 chars). The H1 is exactly as specified. Description is 143 chars.
- Status `published`, URL `/uz/blog/tavsifnoma-namuna/`, self canonical, `topicCluster` `hujjat-va-xatlar`, `targetMoneyPage` `/uz/gpt-uzbek-tilida/`.
- Keywords: `tavsifnoma namuna`, `tavsifnoma namunasi`, `tavsifnoma`, `tavsifnoma yozish`. I added `tavsifnoma namunasi` because the title uses it; it is not in the backlog's list of three.
- Body is about 1 380 words (1 400 if `[F.I.Sh.]` counts as three words), with 9 unique H2s, 1 H3 and 6 FAQ.
- Sections:
  - tavsifnoma vs tavsiyanoma table
  - structure table
  - three placeholder samples (o‘quvchi, amaliyotchi talaba, xodim)
  - prompt table that tells the chat to use only the reader's facts, including turning a tavsifnoma into a tavsiyanoma
  - pre-signing checklist and a "mumkin emas" list
- The page states that requirements depend on the organisation, that the signer checks the text and answers for it, and that this is not legal advice.
- It says GPTBot.uz is independent and not OpenAI/ChatGPT. Trial wording: «jami 3 ta bepul sinov javobi … har kuni yangilanmaydi … AI paket».
- It says the chat gives text only: no .docx, letterhead, signature or stamp. It also tells readers to keep personal data out of the chat.
- Body links:
  - `/uz/gpt-uzbek-tilida/` with the brand anchor «GPTBot.uz AI chati», plus a CTA block and the `cta` field
  - `/uz/blog/tushuntirish-xati-va-ariza-yozish/` («tushuntirish xati va ariza yozish»)
  - `/uz/blog/rezyume-tayyorlash/` («rezyume tayyorlash qo‘llanmasi»)
  - `/uz/gpt-chat-qollanma/`
- `internalLinks` has four entries with different anchors. No anchor is in any `mustNotTarget` list, and none is «chatgpt kirish».
- Dates: `datePublished`/`dateModified` 2026-10-24, `createdAt`/`updatedAt` 2026-10-24T00:00:00.000Z. The schema has no `publishedAt` field.
- Author «Борис Герасимов» and schemaTypes copied from the sibling guides.
- No body image. `ogImage` reuses `chatgpt-uzbek-tilida-promptlar-1200.webp`, as the tushuntirish and rezyume guides do; it is a generic picture with no brand.
- No `toc` block: `scripts/prerender-blog.ts` has no `toc` case, so it would render nothing.
- Source: the OpenAI Help Center page the sibling guides cite, with their note checked 2026-10-05. I could not re-verify it today (HTTP 403).
- Encoding: UTF-8 without BOM, CRLF line endings like the other 62 UZ blog files. Every o‘/g‘ is U+2018 and every tutuq belgisi is U+2019; there are no ASCII apostrophes and no U+02BB/U+02BC.

**Tests** (in the worktree, NODE_OPTIONS=--max-old-space-size=1400, one file at a time)
- Pass: seo-content-guards 8/8, seo-page-integrity 17/17, seo-anchor-intent 4/4, seo-intent-manifest 5/5, seo-cluster-quality 19/19, seo-link-graph 17/17, blog-feed 7/7, chat-entry 6/6, seo-trial-product-truth 4/4, home-resources 4/4. `scripts/seo-audit.ts` reports no critical issues.
- `homepage-lists-frozen` fails 2/4. With my file present the message names `/uz/blog/tavsifnoma-namuna/`; with it moved aside it fails on `/uz/blog/rasmiy-xat-yozish/`. That is the "/" revision for you.
- `updates-feed` fails 1/4 with or without my file: `public/updates/atom.xml` needs regenerating for the new guides.
- I copied `content/` to a scratch folder and added the pair and demand rows below. With them, seo-intent-manifest 5/5, seo-anchor-intent 4/4, seo-demand-gate 8/8 and seo-cluster-quality 19/19 pass.

**Proposed intent-manifest pair** (renumber if W2-04 or W2-05 also took C49)
```json
{"id":"C49-uz-chat-vs-tavsifnoma-guide","commercial":{"url":"/uz/gpt-uzbek-tilida/","owns":"use the Uzbek AI chat itself; a reader may ask it to draft a reference (tavsifnoma) from their own facts, but the chat page does not answer «tavsifnoma» or «tavsifnoma namuna». The chat page does not link the guide (protected; manifest bookkeeping only, its HTML does not change)","mustNotTarget":["tavsifnoma","tavsifnoma namuna","tavsifnoma namunasi","tavsifnoma yozish"]},"informational":{"url":"/uz/blog/tavsifnoma-namuna/","owns":"how to write a reference (tavsifnoma) — «tavsifnoma namuna», «tavsifnoma namunasi», «tavsifnoma», «tavsifnoma yozish»: how it differs from a recommendation letter (tavsiyanoma), the structure, three conditional samples (pupil, intern student, employee) with placeholders only, prompts for a draft from the reader's own facts; says the requirements depend on the requesting organisation, the signer checks the final text and answers for it, it is not legal advice, the chat writes text only (no .docx, letterhead, signature or stamp) and personal data stays out of the chat; links the chat, the explanatory-letter/application guide and the résumé guide","mustNotTarget":["chatgpt uzbekcha","chatgpt uzbek tilida","tushuntirish xati","ariza namunasi","rezyume tayyorlash","rezyume namuna","xat yozish","rasmiy xat yozish"]},"gscNote":"New URL of the growth backlog W2-03 (owner order 2026-10-24), no Search Console history; no page of the site declared «tavsifnoma» before it (repository grep 2026-10-24) and GSC 2026-07-21..10-21 has no tavsifnoma rows. Demand (Google Ads, location 2860, growth audit L3-03): tavsifnoma namuna 1 600/mo (Oct 2025 1 900, May 2026 2 400, Aug 2026 390, Sep 2026 720), tavsifnoma 720/mo (Apr–May 2026 1 300, Aug 2026 210): school-year seasonal. «tavsifnoma yozish» and «tavsifnoma namunasi» were not measured separately (bookkeeping only). SERP 48e0cfbe (hl ru, desktop): one blog, Facebook videos, six Scribd PDFs and tag pages — the weakest SERP of the audit. Keywords are not printed in the HTML. «tavsiyanoma» is explained on the page but declared by no URL. Same 21-day read as C41.","evidence":"docs/seo/research/2026-10-24-growth-audit/L3-demand-gaps.md §4.1, §5 and L3-03; l3-data/kw2_metrics.json; l3-data/serp1_table.txt; backlog W2-03","decision":"KEEP_DIFFERENT_INTENT","decidedAt":"2026-10-24"}
```

**Proposed demand-policy `approvedKeywords` rows** (`tavsifnoma yozish` was never measured, so it gets no row)
```json
[{"keyword":"tavsifnoma namuna","volumePerMonth":1600,"competition":"LOW","source":"OpenSEO/DataForSEO (Google Ads) location 2860, growth audit 2026-10-24 (docs/seo/research/2026-10-24-growth-audit/l3-data/kw2_metrics.json)","measuredAt":"2026-10-24","note":"Google Ads competition index 0, no CPC returned; October 2025 1 900, May 2026 2 400 (peak), August 2026 390, September 2026 720: school-year seasonal. Owned by /uz/blog/tavsifnoma-namuna/ (growth backlog W2-03, pair C49). The SERP of 2026-10-24 (resultId 48e0cfbe, serp1_table.txt) is one blog, Facebook videos, six Scribd PDFs and tag pages; the guide gives a structure and three placeholder samples, says it is not legal advice and that the signer checks the final text."},
 {"keyword":"tavsifnoma","volumePerMonth":720,"competition":"LOW","source":"OpenSEO/DataForSEO (Google Ads) location 2860, growth audit 2026-10-24 (docs/seo/research/2026-10-24-growth-audit/l3-data/kw2_metrics.json)","measuredAt":"2026-10-24","note":"Google Ads competition index 0, no CPC returned; October 2025 1 000, April–May 2026 1 300, August 2026 210, September 2026 320: seasonal. Same owner as «tavsifnoma namuna». «tavsifnoma yozish» was not measured and is not recorded."}]
```
The same proposal as a file: `C:\Users\Borinio\AppData\Local\Temp\claude\F--Claude\b3c73263-9d70-4f6b-8a59-3708131f58c5\scratchpad\w2-03-proposal.json`.

**For your release**
- Nothing in content links to the new page yet; "/" and the blog index will once the build runs. The orphan test checks pages only, so it does not flag this.
- I suggest a reciprocal link from `/uz/blog/tushuntirish-xati-va-ariza-yozish/`, which W2-04 is already editing, and from `/uz/blog/rezyume-tayyorlash/`, which is not protected.
- `public/updates/atom.xml` and the "/" protected baseline (`homepage-lists-frozen`) need to be regenerated with the new guides.
- I edit the page only through a scratch script: `C:\Users\Borinio\AppData\Local\Temp\claude\F--Claude\b3c73263-9d70-4f6b-8a59-3708131f58c5\scratchpad\build_tavsifnoma.py`.

# xat

W2-04 is done: the new guide `content/blog/uz/rasmiy-xat-yozish.json` exists with status published, and the tushuntirish guide now links to it. Nothing is committed, built or deployed. Before release the integrator still needs to do the `/` revision, regenerate `dist`, and add the manifest and demand-policy rows proposed below.

**Files**
- `F:\Claude\gptbot-snippets-translator-20261024\content\blog\uz\rasmiy-xat-yozish.json` (new, CRLF, UTF-8 without BOM).
  - Title: «Rasmiy xat yozish: tuzilma, namuna va AI bilan qoralama» (55 chars).
  - H1: «Rasmiy xat yozish: rekvizitlar, xat turlari va shartli namunalar».
  - Description: 145 chars.
  - Keywords: rasmiy xat yozish, xat yozish, xizmat xati namuna, rasmiy xat namunasi, xat yozish namunasi.
  - Body is about 1,400 words. It has a structure table (rekvizitlar, sana and chiquvchi raqam, adresat, mavzu, murojaat, asosiy qism, ilovalar, imzo, ijrochi), a style list and a letter-types table (so‘rov, kafolat, da’vo, minnatdorchilik xati).
  - Each of the four letter types has a sample that uses only placeholders. There is also a note that this is not legal advice, that requirements depend on the organisation, and that the signer checks the final text.
  - It also has a sending section (paper, e-mail, state bodies), an AI prompt table, the GPTBot.uz note (independent, not OpenAI or ChatGPT; 3 lifetime trial replies, then the AI pack; text only, no blank or .docx), a privacy note, a checklist, a limits section and a CTA.
  - It has 7 FAQ items, one of which covers the school version of the «rasmiy xat yozish» assignment.
  - Links: the UZ chat with the brand anchor «GPTBot.uz AI chati» (also the CTA and internalLinks), «tushuntirish xati va ariza yozish» → `/uz/blog/tushuntirish-xati-va-ariza-yozish/`, and «AI chatdan foydalanish qo‘llanmasi» → `/uz/gpt-chat-qollanma/`. It never targets ariza or tushuntirish xati.
  - Dates are 2026-10-24 and the author is «Борис Герасимов», as in the sibling guides. topicCluster is «hujjat-va-xatlar».
  - ogImage reuses `chatgpt-uzbek-tilida-promptlar-1200.webp`, the same as the tushuntirish and rezyume guides; it shows office work with an AI chat, so it fits. There is no body image.
  - Apostrophes checked: no ASCII ', U+02BB or U+02BC.
- `F:\Claude\gptbot-snippets-translator-20261024\content\blog\uz\tushuntirish-xati-va-ariza-yozish.json`: one new linkp (+11 lines) placed after the gov.uz linkp in the «Ariza» section, anchor «rasmiy xat yozish» → `/uz/blog/rasmiy-xat-yozish/`. I left its dates alone because only a link changed.

**Things I chose differently from the task text**
- **No toc block:** `scripts/prerender-blog.ts` has no `toc` case, so a toc block would never appear on the page. The two model files have none either.
- **One source, not re-checked:** I kept the single source the sibling guides use (OpenAI Help Center), worded to say it was checked on 2026-10-05. Fetching it today returned 403, so I could not check it again.

**Tests** (with `NODE_OPTIONS=--max-old-space-size=1400`)
- These pass: seo-content-guards, seo-anchor-intent, seo-page-integrity, seo-link-graph, blog-feed, seo-cluster-quality, seo-intent-manifest, chat-entry, translator-pages, home-resources, seo-protection and seo-trial-product-truth.
- `scripts/seo-audit.ts` reports 0 critical issues and 0 orphan pages.
- Three tests fail:
  - **homepage-lists-frozen (2 failures):** expected. A new published article changes the `/` lists, which is the integrator's `/` revision.
  - **updates-feed (1 failure):** `dist/updates/atom.xml` is out of date until the next build. The tavsifnoma file another agent added also contributes.
  - **seo-push-revision R3-6 and R3-9:** not caused by this work. They compare a dateModified of 2026-10-23 with an expected 2026-10-05, and my files are not involved.
- I did not run `npx tsc -b`: I changed no TypeScript and nothing imports the blog JSON.

**Proposed intent-manifest pairs** (IDs are only suggestions; the integrator assigns them)
```
{"id":"C50-uz-chat-vs-rasmiy-xat-guide","commercial":{"url":"/uz/gpt-uzbek-tilida/","owns":"use the Uzbek AI chat itself; a reader may ask it to draft an official letter from their own facts, but the chat page does not answer «rasmiy xat yozish» or «xizmat xati namuna». The chat page does not link the guide (protected; snippet window)","mustNotTarget":["xat yozish","rasmiy xat yozish","xizmat xati namuna","rasmiy xat namunasi"]},"informational":{"url":"/uz/blog/rasmiy-xat-yozish/","owns":"how to structure an official (business) letter — «rasmiy xat yozish», «xat yozish», «xizmat xati namuna», «rasmiy xat namunasi», «xat yozish namunasi»; four letter types (so‘rov, kafolat, da’vo, minnatdorchilik) with placeholder-only samples; says it is not legal advice, the organisation's blank and ish yuritish rules come first and the signer checks the final text; the chat writes text only (no blank, .docx, signature or sending); personal and commercial data stay out of the chat","mustNotTarget":["chatgpt uzbekcha","chatgpt uzbek tilida","tushuntirish xati","tushuntirish xati namunasi","ariza yozish","ariza namunasi","maktub yozish","do‘stga xat yozish"]},"decision":"KEEP_DIFFERENT_INTENT","decidedAt":"2026-10-24"}
{"id":"C51-uz-tushuntirish-ariza-vs-rasmiy-xat-guide","commercial":{"url":"/uz/blog/tushuntirish-xati-va-ariza-yozish/","owns":"the explanatory-letter and application how-to (see C41); one linkp in its «Ariza» section sends letters written on behalf of an organisation to the official-letter guide (anchor «rasmiy xat yozish»)","mustNotTarget":["rasmiy xat yozish","xizmat xati namuna","xat yozish"]},"informational":{"url":"/uz/blog/rasmiy-xat-yozish/","owns":"the official-letter how-to; it names ariza and tushuntirish xati only in one linkp and one FAQ that send readers to the C41 guide","mustNotTarget":["tushuntirish xati","ariza yozish","ariza namunasi"]},"decision":"DIFFERENTIATE","decidedAt":"2026-10-24"}
```

**Proposed demand-policy rows**
```
{"keyword":"xat yozish","volumePerMonth":3600,"competition":"LOW","source":"OpenSEO/DataForSEO Google Ads, location 2860, project language ru (docs/seo/research/2026-10-24-growth-audit/l3-data/kw1_metrics.json)","measuredAt":"2026-10-24","note":"Competition index 0, no CPC; Oct 2025 140, Nov 2025 210, Aug 2026 1 900, Sep 2026 6 600, 12-month max 9 900 (May 2026): school-season, growing. Owned by /uz/blog/rasmiy-xat-yozish/ (W2-04, L3-09). SERP 3b60d615 (l3-data/serp3_table.txt) is mixed: tests and slides on official correspondence, dictionaries, one AI letter generator at #9; the guide gives a structure and placeholder-only samples and says it is not legal advice."}
{"keyword":"xizmat xati namuna","volumePerMonth":10,"competition":"UNMEASURED","source":"OpenSEO/DataForSEO Google Ads, location 2860, project language ru (docs/seo/research/2026-10-24-growth-audit/l3-data/kw2_metrics.json)","measuredAt":"2026-10-24","note":"Secondary key of /uz/blog/rasmiy-xat-yozish/; 0–10/mo, no competition data. Recorded as a supporting key, not as positive demand."}
```
- The other keys have little or no measured demand: «rasmiy xat yozish» came back null in kw2, and «xat yozish namunasi» is 10/mo. Record them only as notes, not as demand rows.

**Left for the integrator**
- An entry in `public/llms.txt` and `public/llms-full.txt` for the new URL, if the release adds new pages there.
- Optional: an ARTICLE_ONLY_BRIDGES chat bridge in `scripts/chat-entry-cta.ts`. Not required; I did not touch scripts.

# tab

W2-05 is written: `F:\Claude\gptbot-snippets-translator-20261024\content\blog\uz\tabrik-yozish.json` (new, untracked, not committed). I touched no other file in the repo.

**Title change:** the specified title was 73 characters, so it is now «Tug‘ilgan kun tabriklari va yangi yil tabriklari: namunalar» (59). I kept both exact search phrases. «AI bilan shaxsiy» moved to the H1 and the description.

**What the page contains**
- **H1:** «Tabrik yozish: namunalar va AI bilan shaxsiy tabrik». Description is 146 characters.
- **Keywords:** tug‘ilgan kun tabriklari, tabriklar, yangi yil tabriklari, tabrik yozish, табриклар, tugilgan kun tabriklari. The last one is the spelling the keyword tool measured.
- **Format:** same schema as the rezyume and tushuntirish guides, with two-space indent, CRLF line endings, no BOM.
- **Dates:** 2026-10-24 for published, modified, created and updated.
- **Image and cluster:** og image reuses the prompts picture the other document guides use. The cluster label is a new one, `matn-yozish`.
- **No table of contents:** the blog page template does not render a `toc` block.
- **30 greetings, all written for this page:**
  - Birthday: onaga 4, otaga 3, do‘stga 4, hamkasbga 3, rahbarga 3, ustozga 3.
  - Yangi yil: 6 (oila, do‘st, hamkasblar, mijozlar, ustoz, short message).
  - 8-mart: 4.
  - Placeholders like [ism], [ism va otasining ismi], [Tashkilot nomi], [bo‘lim nomi], [necha], [Fan].
- **Other sections:** one short Cyrillic block for «табриклар»; a four-part structure plus a tone table; a section on asking the chat to personalise (who, occasion, one shared memory, tone) with five ready prompts; a checklist before sending.
- **Honesty lines:** GPTBot.uz is an independent service, not OpenAI or ChatGPT. The chat writes text only (no card, image or voice greeting). 3 lifetime trial replies, not renewed daily, then an AI pack. Do not type other people's personal data.
- **Size:** about 1,386 words of body and 7 FAQ answers.
- **Internal links:**
  - The UZ chat, with brand anchors «GPTBot.uz o‘zbekcha AI chati» and «GPTBot.uz AI chati».
  - The prompts guide and `/uz/gpt-chat-qollanma/`.
  - `/uz/blog/rasmiy-xat-yozish/`.
- **Language checks:** no ASCII apostrophe, U+02BB or U+02BC; o‘/g‘ use U+2018 and the tutuq belgisi uses U+2019; no word mixes Latin and Cyrillic letters.

**Checks run** (one file at a time, with the memory limit set)
- **Passing:** seo-content-guards, seo-anchor-intent, seo-page-integrity, seo-link-graph, seo-cluster-quality, seo-intent-manifest, blog-feed, seo-trial-product-truth, seo-demand-gate, home-resources, chat-entry, seo-protection. `scripts/seo-audit.ts` reports no critical issues.
- **`homepage-lists-frozen` fails 2 of 4.** That is expected: the new guides (this one, tavsifnoma, rasmiy xat) appear in the homepage list, so it needs the planned reviewed revision of «/».
- **`seo-push-revision` fails 2 (R3-6, R3-9).** The cause is dates on other pages (2026-10-23 found, 2026-10-05 expected), not this file.

**Dependency:** `body[14]` and `internalLinks[2]` link to `/uz/blog/rasmiy-xat-yozish/` (W2-04, not yet in git). If W2-04 does not ship in the same release, delete both, or the broken-link test fails.

Nothing links to the new page yet; the homepage and blog index lists will. Optional extra: a link from the rasmiy xat guide's minnatdorchilik section to `/uz/blog/tabrik-yozish/`, but that is not my file.

**Proposed manifest pair** (I used C51 assuming W2-03 and W2-04 take C49 and C50; renumber if not):
```json
{
  "id": "C51-uz-chat-vs-tabrik-guide",
  "commercial": {
    "url": "/uz/gpt-uzbek-tilida/",
    "owns": "use the Uzbek AI chat itself; a reader may ask it to personalise a greeting from their own facts, but the chat page does not answer «tug‘ilgan kun tabriklari», «yangi yil tabriklari» or «tabriklar». The chat page does not link the guide in this revision (protected)",
    "mustNotTarget": ["tug‘ilgan kun tabriklari", "tugilgan kun tabriklari", "tabriklar", "yangi yil tabriklari", "tabrik yozish", "табриклар"]
  },
  "informational": {
    "url": "/uz/blog/tabrik-yozish/",
    "owns": "how to write a greeting plus ready short greetings — «tug‘ilgan kun tabriklari» (leads the title), «tabriklar», «yangi yil tabriklari», «tabrik yozish», Cyrillic «табриклар» (one short uz-Cyrl block); 30 greetings written for the page (mother, father, friend, colleague, manager, teacher; New Year; 8 March) with placeholders only, none copied from archives; how to ask the chat to personalise a greeting (who, occasion, one shared memory, tone); states that the chat writes text only and makes no card, image or voice greeting",
    "mustNotTarget": ["chatgpt uzbekcha", "chatgpt uzbek tilida", "rasmiy xat yozish", "xat yozish"]
  },
  "gscNote": "New URL of the growth-backlog revision of «/» (W2-05, lens L3-08), no Search Console history; no content page declared a tabrik key before it (repository grep 2026-10-25). Demand (OpenSEO/DataForSEO Google Ads, loc 2860, 2026-10-24; l3-data/kw1_metrics.json, kw2_metrics.json): tugilgan kun tabriklari 1 300/mo (880–1 900, all year), tabriklar 1 000/mo, табриклар 590/mo, yangi yil tabriklari 880/mo average but 9 900 in December 2025 and 320 in January 2026, tabrik yozish 20/mo. SERP 2026-10-24 (resultId 7aa3bce8-96b9-4fc6-8b13-3e04a661a7f5): greeting archives on weak domains, Telegram, Instagram, Play apps, no AI site. Read like the other new UZ guides: at least 100 Uzbekistan impressions within 21 days of indexation means the page works; read «yangi yil tabriklari» again in December.",
  "evidence": "docs/seo/research/2026-10-24-growth-audit/L3-demand-gaps.md §5 and L3-08; backlog.json W2-05",
  "decision": "KEEP_DIFFERENT_INTENT",
  "decidedAt": "2026-10-24"
}
```

**Proposed demand-policy rows** (source for all five: OpenSEO/DataForSEO Google Ads, location 2860, project language ru; OpenSEO rejects the U+2018 spelling; measured 2026-10-24; competition LOW):
```json
[
  {"keyword": "tugilgan kun tabriklari", "volumePerMonth": 1300, "competition": "LOW", "source": "OpenSEO/DataForSEO Google Ads, location 2860, project language ru; OpenSEO rejects the U+2018 spelling (docs/seo/research/2026-10-24-growth-audit/l3-data/kw1_metrics.json)", "measuredAt": "2026-10-24", "note": "Google Ads competition index 0, no CPC; Oct 2025–Sep 2026 between 880 (Jul 2026) and 1 900 (Mar 2026): demand all year. The page declares «tug‘ilgan kun tabriklari» (site apostrophe convention) and keeps this spelling as a secondary; the ASCII-apostrophe spelling returned no Ads bucket, which means no separate measurement, not zero demand. Owned by /uz/blog/tabrik-yozish/ (W2-05, pair C51). SERP 2026-10-24 (resultId 7aa3bce8): greeting archives on weak domains, no AI site; the guide's 30 greetings are written for the page, not copied."},
  {"keyword": "tabriklar", "volumePerMonth": 1000, "competition": "LOW", "source": "OpenSEO/DataForSEO Google Ads, location 2860, project language ru (docs/seo/research/2026-10-24-growth-audit/l3-data/kw1_metrics.json)", "measuredAt": "2026-10-24", "note": "Google Ads competition index 0; Oct 2025–Feb 2026 1 300, Mar 2026 1 600, Sep 2026 590: falling. Same owner as «tugilgan kun tabriklari»."},
  {"keyword": "yangi yil tabriklari", "volumePerMonth": 880, "competition": "LOW", "source": "OpenSEO/DataForSEO Google Ads, location 2860, project language ru (docs/seo/research/2026-10-24-growth-audit/l3-data/kw2_metrics.json)", "measuredAt": "2026-10-24", "note": "Google Ads competition index 0; December 2025 9 900, January 2026 320, November 2025 90, other months 0–30: one-month seasonal peak, so the page must be indexed before mid-November. Same owner; the guide has a Yangi yil section with six greetings."},
  {"keyword": "табриклар", "volumePerMonth": 590, "competition": "LOW", "source": "OpenSEO/DataForSEO Google Ads, location 2860, project language ru (docs/seo/research/2026-10-24-growth-audit/l3-data/kw1_metrics.json)", "measuredAt": "2026-10-24", "note": "Google Ads competition index 0; 320–880 over 12 months. Uzbek Cyrillic spelling, answered by one short uz-Cyrl block of the same guide, no separate page."},
  {"keyword": "tabrik yozish", "volumePerMonth": 20, "competition": "LOW", "source": "OpenSEO/DataForSEO Google Ads, location 2860, project language ru (docs/seo/research/2026-10-24-growth-audit/l3-data/kw1_metrics.json)", "measuredAt": "2026-10-24", "note": "Google Ads competition index 0; December 2025 40. The H1 phrase of /uz/blog/tabrik-yozish/, recorded for completeness; demand is negligible."}
]
```

The page is built by a script in my scratch folder, so wording changes can be regenerated: `C:\Users\Borinio\AppData\Local\Temp\claude\F--Claude\b3c73263-9d70-4f6b-8a59-3708131f58c5\scratchpad\w205\gen.mjs`, with checks in `check.mjs` in the same folder.

# hub

I made the W2-06 change in `content/pages/uz/telegram-bot-biznes-uchun.json`, and `tests/seo-cluster-quality.test.ts` passes 19/19 without dist. But this test doesn't actually check this page. Changing the H1 will also change the protected home page "/", so the protection gate will stop the release unless "/" gets its own revision.

**Two things that will break the release if missed:**
1. **"/" changes.** `dist/index.html` prints this page's H1 (old text "Telegram bot biznes uchun: savdoni avtomatlashtirish"). The backlog marks W2-06 as `protected: true` for this reason. After prerender, the body-text fingerprint of "/" will differ, and `assertSeoProtection` in `scripts/seo-protection.ts` will fail. W2-06 can only ship with a new "/" revision and baseline. The backlog had planned that revision together with W2-03/04/05 after about 07.11; the owner order now says to publish now. I did not edit the home page's own content file.
2. **One test needs a rebuild.** `tests/updates-feed.test.ts` fails 1 of 4 because `dist/updates/atom.xml` is stale. The test now expects this page in the feed with the new 2026-10-25 date. It should pass after the build, but I haven't confirmed that.

**What changed in the file:**
- **H1** is now «Telegram bot yaratish biznes uchun: arizalarni avtomatlashtirish». I also changed `heroTitle` to the same text: it held a copy of the old H1 and isn't shown on the public page. Title, description, keywords and prices are unchanged.
- **New section** «O‘zingiz yaratasizmi yoki buyurtma qilasizmi: BotFather, konstruktor yoki dasturchi» (id `botfather-konstruktor-dasturchi`). It sits between «Telegram bot nimani uddalaydi» and «Telegram bot qancha turadi»:
  - An intro paragraph.
  - A 3-row table with columns Yo‘l / Qachon yetarli / Cheklovlar:
    - **BotFather:** free, only registers the bot; the bot can't reply until the token is connected to a constructor or a program.
    - **No-code constructor:** menus and FAQ; limited by the platform's blocks and plan; CRM and payment connections depend on the platform; data sits on its servers.
    - **Developer:** for CRM, payments, AI answers or two languages; usually costs more and takes longer up front, and needs hosting and ongoing support.
  - A paragraph saying plainly when building it yourself is enough.
  - A link to `/ru/blog/kak-sozdat-telegram-bota/`, which exists and is published. The anchor is «Как создать Telegram-бота» marked as Russian, and the text says the guide is in Russian.
  - A tip to keep the bot token private, like a password.
- **Two FAQs** («Telegram botni o‘zim bepul yarata olamanmi?», «Konstruktor qachon yetmaydi?») go after the price question, making 9 FAQs in total.
- `lastReviewedAt` and `updatedAt` are now 2026-10-25.

No new prices, no client claims, no named competitors. The `telegram-leads-uz` cluster's `hubKeywords` are untouched. Apostrophes were checked by script: o‘/g‘ use U+2018, tutuq belgisi uses U+2019, with no ASCII apostrophes or U+02BB/U+02BC. The file is still CRLF with the same 2-space indent and is valid JSON.

**Checks:**
- `seo-cluster-quality` passes 19/19. It only reads `manifest.clusters`, and this hub is listed under `commercialClusters`, so the test doesn't cover it.
- These pass and cover the page: seo-anchor-intent, seo-content-guards, seo-commercial-claims, seo-commercial-coverage, seo-page-integrity, commercial-seo-contract, advertising-seo-content, seo-intent-manifest, seo-link-graph, seo-trial-product-truth, seo-demand-gate.
- `npx tsx scripts/seo-audit.ts` exits 0 with no critical issues.
- I did not run vite, build or prerender, and did not stage anything. The other files changed in the worktree belong to other agents.

For W2-07: `scripts/llm-pages.ts` includes this page in the llms output, so the generated llms files will pick up the new H1.

# llm

W2-07 is done: `dist/llms-full.txt` is now built as a superset of `llms.txt`. The 7 tests in `tests/seo-trial-product-truth.test.ts` pass (4 old, 3 new). No commit, push, vite or deploy; only my three files are changed.

**What the build now produces** (`scripts/generate-llm-markdown.ts`)
- The script writes `dist/llms-full.txt` right after the 28 twins, overwriting the copy Vite made. The file has three parts:
  1. **Cluster notes** from `public/llms-full.txt`. The opening still says independent AI chat, "not ChatGPT and not an OpenAI product", "3 free trial replies".
  2. **All of `public/llms.txt`**, word for word.
  3. **A contents list of the 28 pages**, then each twin's full Markdown under a `URL: <canonical>` line.
- Line endings are LF. A test run of the script against a copy of dist gave 585,388 B, against 35,875 B for `llms.txt`; the old full file was 19,867 B.
- After writing, the script warns about any URL in the file that is missing from dist. In the test run it warned about nothing.
- The functions are now exported (`renderTwins`, `buildLlmsFull`, `siteUrlPaths`, `DESCRIBED_REDIRECTS`). The script only does its work when run directly, so tests can import it without writing to dist.
- **Bug fixed in a live twin:** the twin of the protected article `/uz/blog/ai-chat-nima-va-qanday-turlari-bor/` linked to the draft `/uz/blog/ai-bot-stsenariysini-1-kunda-qanday-yozish/`, which returns 404. Twins now drop links to unpublished articles, the same way the HTML pages do. The other 27 twins come out byte-identical.

**`public/llms-full.txt`** (CRLF kept, no BOM)
- I removed three sections that `llms.txt` already carries in full, so they no longer appear twice in the built file: "Recommended page for each intent", "Things assistants should NOT claim…" and "Canonical sources". Every removed intent line is present in `llms.txt`.
- I removed the sentence saying the ChatGPT guides "bring most of the site's organic traffic". It contradicted `llms.txt`'s own "this is not a claim about traffic share" once both are in one file. In its place: "independent explanations…, not OpenAI help pages".
- "Last updated" is now 2026-10-25 and says what the file contains. Phone and e-mail are still there, so `studio-contact` still finds them.

**New tests** (they build the file from `content/` and `public/`, no dist needed)
- **Superset:** `llms-full.txt` contains `llms.txt` word for word, is larger, opens with the cluster notes and has every twin's body. The notes may not repeat a section heading that `llms.txt` has.
- **Disclosure:** the opening states independent / not OpenAI / 3 trial replies, and the file states "3 successful lifetime trial replies … without daily renewal". It must not contain old daily or hourly limits, or "GPTBot.uz is official/authorised".
- **Served URLs:** every gptbot.uz URL in the file is a page or article the build writes, a studio page, a file in `public/`, a twin, or a feed. The only redirect allowed is `/ru/` → `/`, which `llms.txt` describes as a redirect.

**Other checks:** `npx tsc -b` passes. eslint finds no errors in my two code files. `seo-link-graph`, `gsc-indexation-hygiene` and `gpt-chat-prerender-links` pass. `studio-contact` has 2 failures (the `ai-bot-s-crm` lead form and the article count); those two are already listed as failing on a clean export of `1a773ee2` in `wave1-reports.md`, and they involve content I didn't touch.

**For the integrator**
1. **Recommended before deploy:** `llms-full.txt` now repeats the full text of 28 pages, including the protected ones, at a URL search engines can index. The twins carry `X-Robots-Tag: noindex, follow`; `/llms-full.txt` doesn't. I'd add the same header for it in `scripts/generate-robots.ts`. That file is outside my scope, so I left it unchanged.
2. Add intent lines for the new guides (tavsifnoma, rasmiy xat, tabrik) to `public/llms.txt` only. `llms-full.txt` picks them up automatically. The served-URL test will fail if a listed guide is still a draft.
3. `public/llms.txt` has three ASCII apostrophes: "to'lov" twice and "manager'ga". I left them because the file isn't mine.
4. The UZ Telegram twin in the built file will include the W2-06 changes still uncommitted in the shared worktree (`content/pages/uz/telegram-bot-biznes-uchun.json`).

Files:
- `F:\Claude\gptbot-snippets-translator-20261024\scripts\generate-llm-markdown.ts`
- `F:\Claude\gptbot-snippets-translator-20261024\public\llms-full.txt`
- `F:\Claude\gptbot-snippets-translator-20261024\tests\seo-trial-product-truth.test.ts`

# review

I made 31 small in-place fixes across the 4 files. All 4 are still valid JSON with CRLF line endings and no BOM, and the six tests I ran that read content without needing `dist` all pass. Nothing is staged, committed or built.

**Checks:**
- **Apostrophes:** the Python scan finds no ASCII apostrophe, backtick, U+02BB or U+02BC. U+2018 appears only after o/g, U+2019 appears only as tutuq belgisi, and no word mixes Latin and Cyrillic letters.
- **Missing apostrophes:** the remaining hits are false positives: ids like `namuna-oquvchi`, `ota-ona`, the token name `qollanma`, `bosh buxgalter`, `tort` meaning cake, and the measured keyword `tugilgan kun tabriklari`.
- **Tests:** seo-cluster-quality 19/19, seo-page-integrity 17/17, seo-content-guards 8/8, seo-trial-product-truth 7/7, seo-business-ai-claims 4/4, seo-anchor-intent 4/4, seo-provider-facts 3/3.

**Title and description lengths (characters):**

| File | Title | Description |
|---|---|---|
| `F:\Claude\gptbot-snippets-translator-20261024\content\blog\uz\tavsifnoma-namuna.json` | 59 | 143 |
| `F:\Claude\gptbot-snippets-translator-20261024\content\blog\uz\rasmiy-xat-yozish.json` | 55 | 145 |
| `F:\Claude\gptbot-snippets-translator-20261024\content\blog\uz\tabrik-yozish.json` | 59 | 150 |

**Fixes in tavsifnoma-namuna.json (6):**
1. Intro: moved the trailing clause «odatda boshqa tashkilotga taqdim etish uchun» to the front of the sentence (it read like a word-for-word Russian clause).
2. «tavsiya qilishda» → «tavsiya qilinganda».
3. and 4. In the pupil and employee samples, «[tug‘ilgan yili] yilda tug‘ilgan» → «[yil]-yilda tug‘ilgan», the correct ordinal year form.
5. «Ichki tartibga» → «Ichki mehnat tartibiga».
6. «baribir qayta yozadi» → «baribir qayta yozishi mumkin», so the page does not predict what the signer will do.

**Fixes in rasmiy-xat-yozish.json (13):**
1. and 2. «xotirjam ohang» → «vazmin ohang» in two places, because «xotirjam» describes a person's mood, not a tone.
3. «…haqida dalil bo‘lib qoladi» → «…ko‘rsatuvchi yozma iz bo‘lib qoladi», which removes the implied legal-evidence claim.
4. «telefoni va e-mail» → «telefoni va e-mail manzili».
5. «nima sababdan yozilyapti» (colloquial) → «yozilayotgani».
6. to 10. «[Ism Otasining ismi]» → «[Ism va otasining ismi]» in all 5 places, so it matches the tabrik guide.
11. «Shu kungacha … yetkazib berilmadi» → «Bugungi kungacha … yetkazib berilmagan».
12. The sending paragraph: «skaner nusxasi» → «skanerlangan nusxasi»; «xabar sarlavhasiga» → «xabarning «Mavzu» qatoriga»; the sentence about state bodies is rephrased.
13. «Shaxsiy va tijorat ma’lumotini» → «Shaxsiy ma’lumot va tijorat ma’lumotlarini».

**Fixes in tabrik-yozish.json (15):**
1. Title: «yangi yil» → «Yangi yil», because it is the name of a holiday. The title is still 59 characters.
2. Description: «hamkasb, rahbar va ustozga» → «hamkasbga, rahbarga va ustozga».
3. to 6. The Russian-style «Tug‘ilgan kuning(iz) bilan!» now ends with «…bilan tabriklayman!» in the onaga, otaga, do‘stga and ustozga greetings.
7. «Bir-birimizni bilganimizga» (calque) → «Tanishganimizga».
8. «hazilingizni yo‘qotmaysiz» (calque) → «hazil bilan kayfiyatimizni ko‘tarasiz».
9. «Bu yil ham» in a New Year wish → «Yangi yilda ham».
10. «Omading chopsin» → «Omad senga yor bo‘lsin».
11. «O‘tgan yil davomida», which on 31 December would mean the previous year → «Shu yil davomida».
12. 8-mart H2: «hamkasblar» → «hamkasblarga».
13. In the four-part structure list, «Yangi yilingiz bilan» → «Yangi yil bilan tabriklayman».
14. Table: «Samimiy, lekin ehtiyotkor» → «Samimiy, lekin me’yorida».
15. Two clarifications:
    - The sentence linking to the rasmiy xat guide now says «bunday xatning umumiy tuzilmasi», because that guide has no tabrik-letter type.
    - The Cyrillic block now says to add the instruction to the prompt, and «Масалан:» became «Кирилл ёзувидаги намуна:».

The 30 greetings check out at 20 + 6 + 4; the Cyrillic sample is an extra. They read as original, with only common set phrases and no archive-style texts.

**Fixes in telegram-bot-biznes-uchun.json (3), only inside the new section and FAQ:**
1. «kichik oqim uchun» (calque) → «G‘oyani sinash uchun yoki arizalar kam bo‘lsa».
2. «bunday joyda xatolik yo‘qotilgan mijozga aylanishi mumkin» → «bunday hollarda bitta xato mijozni yo‘qotishga olib kelishi mumkin».
3. FAQ: «oqimingizga» → «arizalaringiz hajmiga».

**Remaining doubts:**
1. **Hub H1 word order.** «Telegram bot yaratish biznes uchun: arizalarni avtomatlashtirish» is the backlog's exact wording, so I kept it. «Biznes uchun Telegram bot yaratish: …» would be more natural Uzbek and still contains «telegram bot yaratish». Either way, «/» needs its revision.
2. **«Da’vo xati» as a term.** In Uzbek legal usage the formal word for a claim letter is «talabnoma» (pretenziya). Adding «talabnoma» as a synonym is a content decision for the owner. The page makes no legal-procedure claims.
3. **Source-check date.** All three guides say the OpenAI help page was checked on 2026-10-05, a date carried over from the sibling guides. Re-check it and set the date to today, or keep it if that check is acceptable.
4. **Sample prompt figures.** The prompt example in rasmiy-xat (200 door handles, a 10-day deadline) uses made-up numbers but no names. I left it; replace it with placeholders if you want everything strictly bracketed.
5. **Over-limit lengths outside my edits.** The tushuntirish description is 161 characters, over the 158 limit; it was already like that and not my file. The hub title is 62 characters including « | GPTBot.uz»; it is unchanged.
6. **New cluster label.** Tabrik uses the new cluster `matn-yozish`. The integrator should confirm the intent-manifest and demand-policy rows accept it.
7. **Formulaic wishes.** Phrases like «sog‘-salomat bo‘ling» and «umringiz uzoq bo‘lsin» appear in all Uzbek greetings. They are not copied texts, but a SERP spot-check before the December peak would confirm there is no accidental exact-match sentence.

# integ

Commit `62d8fdb0071364a3b6a1687fafcb9bd5142e0ed2` on `seo/chat-snippets-translator-20261024`, base 13d2da1f. The protection check is 10/10 against the new revision, and the SEO tests show no new failures. Nothing is pushed or deployed; production is still f97295b5.

**Changed URLs**
- https://gptbot.uz/ — protected; only its list changes (three new guide links, new hub label).
- https://gptbot.uz/uz/blog/tavsifnoma-namuna/ — new (W2-03, pair C49).
- https://gptbot.uz/uz/blog/rasmiy-xat-yozish/ — new (W2-04, pairs C50 and C52).
- https://gptbot.uz/uz/blog/tabrik-yozish/ — new (W2-05, pair C51).
- https://gptbot.uz/uz/telegram-bot-biznes-uchun/ — new H1, BotFather / no-code constructor / developer section, 2 FAQ (W2-06).
- https://gptbot.uz/uz/blog/tushuntirish-xati-va-ariza-yozish/ — one new paragraph linking the rasmiy xat guide.
- https://gptbot.uz/llms-full.txt — now a superset of llms.txt (about 586 KB) (W2-07).
- https://gptbot.uz/llms.txt — three intent lines for the new guides, "Last updated" set to 2026-10-25.

**What I added**
- **Intent manifest:**
  - C49, C50 and C51 pair each guide with `/uz/gpt-uzbek-tilida/`, following C41/C42. These are manifest records only; the chat page does not change.
  - C52 (DIFFERENTIATE) separates the tushuntirish/ariza guide from the rasmiy xat guide. The ariza and tushuntirish keys are reserved away from the new guide, the rasmiy xat keys away from the old one, and the tavsifnoma keys away from both.
- **Demand policy:** 11 rows from `l3-data`, citing `kw1_metrics.json`/`kw2_metrics.json` (Google Ads, location 2860). «rasmiy xat yozish» is recorded as 0 / UNMEASURED because Ads returned no bucket for it.
- **Routes:** the three guides are added to the approved list in `tests/react-router-v8-migration.test.ts`.
- **Fix to the llm-markdown script:** I renamed a variable called `contents` in `scripts/generate-llm-markdown.ts`. Tailwind scans `scripts/**` and was adding a new CSS rule because of that word, which renamed the shared stylesheet on every page, all 10 protected pages included. After the rename the shared CSS is `index-B7Z1XlOc.css` again, the same as production.

**Protection**
- Before the new revision, the check failed only on "/" for `internalLinks` and `bodyTextSha256`, as expected.
- The new revision is `docs/seo/evidence/2026-10-24-wave1b/reviewed-protected-pages.json`. Its previous revision is `2026-10-24-wave1`.
- It was written by `docs/seo/implementation/2026-10-24-wave1b/review-candidate.ts`. The generator refuses to write unless:
  - "/" has exactly three new links (297 → 300) and none removed;
  - the only text changes on "/" are the three guide titles and the hub's new H1;
  - the HTML of "/" matches the previous one byte for byte once those entries are removed;
  - the other 9 protected pages, both chats included, are byte-identical.
- `BASELINE` in `scripts/seo-protection.ts` points to the new revision, with a revision paragraph, and there is a new test in `tests/seo-protection.test.ts`.
- After a final rebuild the check is 10/10, and the built protected pages match the revision exactly.

**Tests compared with the known failures**
- I ran 33 files: `seo-*`, `blog-*`, `homepage-*`, translator-pages, uz-translit, gsc-indexation-hygiene, updates-feed, react-router-v8-migration, studio-prerender, intent-guard, home-resources and home-hreflang-cluster.
- No new failures. Only the known ones fail:
  - seo-push-revision R3-6 and R3-9
  - react-router-v8-migration, 3 of 26
  - seo-revenue-claims, "free limits on the pricing page"
- `tsc -b` and `typecheck:functions` exit 0, eslint on the changed TS files reports 0, and `seo-audit` reports no critical issues.
- `scan:secrets` finds only the known `tests/telegram-assistant.test.ts:639`.
- No ASCII, U+02BB or U+02BC apostrophes in the five content files.

**Not done**
- `build:production`, the deploy, live readback, IndexNow and URL Inspection were not run. `build:fast` warns that `/uz/taqdimot-ai/` is not in `dist`; that is a studio page only `build:production` builds.
- The full `tests/*.test.ts` suite was not re-run.
- The protected UZ chat does not link the new guides yet. That needs its own reviewed revision after the chat's 28-day window.
- The new guides have no ready-question chat buttons in `scripts/chat-entry-cta.ts`.
- The tushuntirish guide keeps `dateModified` 2026-10-08 even though it gained a paragraph.
- `docs/seo/research/2026-10-24-growth-audit/NEXT_RELEASES.md` is untracked and was written outside this step, so I left it out of the commit.
- Docs updated: a «Волна 1b 24.10» section in `docs/seo/CHANGE_LOG_2026-10.md`, HANDOFF.md sections 1, 2, 3, 5, 6, 8, 9 and 12, and a `seo_wave1b_20261024` block in STATE.json (status `committed_not_deployed`).

Files are in F:\Claude\gptbot-snippets-translator-20261024:
- content\blog\uz\tavsifnoma-namuna.json
- content\blog\uz\rasmiy-xat-yozish.json
- content\blog\uz\tabrik-yozish.json
- docs\seo\evidence\2026-10-24-wave1b\reviewed-protected-pages.json
- docs\seo\implementation\2026-10-24-wave1b\review-candidate.ts