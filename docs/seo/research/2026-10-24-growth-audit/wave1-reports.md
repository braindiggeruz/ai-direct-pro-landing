# ru

W1-01, W1-03, W1-04, the RU part of W1-05 and W1-10 are done. Nothing is staged, committed, built or deployed, and no protected-page content file was touched (`gpt-chat.json`, the 7 protected articles, `/`). No Uzbek text was added, and every edited file keeps CRLF, no BOM and valid JSON.

Checks run:
- These tests pass: seo-trial-product-truth (4/4), seo-intent-manifest (5/5), seo-content-guards, seo-cluster-quality, intent-guard, blog-related-links, seo-link-graph, studio-prerender, homepage-lists-frozen, seo-indexation-recovery and legal-oferta. I ran seo-link-graph and homepage-lists-frozen against the old dist, so the integrator should re-run them after the build.
- `npx tsc -b`: 0 errors. `npx eslint tests/seo-trial-product-truth.test.ts`: 0 errors. `npx tsx scripts/seo-audit.ts`: no critical issues.
- Two failures were there before my work; I left both alone:
  - seo-revenue-claims, "free limits on the pricing page". It expects `до {freeDailyLimit} сообщений в день и {freeHourlyLimit} в час` in tarify-ai-chat, and HEAD does not have that text either.
  - translator-pages, "blind-check kit". The CSV header comes back with a trailing `\r`.

**W1-01 (trial honesty), verifier-corrected version**
- `content/pages/ru/gde-polzovatsya-gpt-besplatno.json`
  - heroTrust → «3 пробных ответа без регистрации».
  - bodyBlocks[3]: «есть дневной и часовой лимит» → «бесплатно — 3 пробных ответа всего, они не обновляются, затем AI-пакет».
  - The «Как начать» paragraph, list item, summary item and FAQ :100 / :102 now give the 3-trial wording; «300 ответов на месяц за 20 000 сум, без автосписаний» is kept.
  - FAQ «Бесплатно — это без ограничений?» → «Можно ли пользоваться GPT бесплатно без ограничений?». The answer covers ChatGPT Free (chatgpt.com/pricing as of 24.10.2026, no model named) and GPTBot.uz (3 trial replies, then AI-пакет).
  - lastReviewedAt and updatedAt → 2026-10-24, as W1-04 asks.
- `content/pages/ru/gpt-chat-guide.json`: heroTrust «Бесплатный лимит» → «3 пробных ответа»; :104, :181, FAQ :199 and :203 now give the 3-trial wording, with the AI-пакет at 300 a month, up to 50 a day. Dates not changed.
- `content/pages/ru/promty-gpt-chatgpt-50-primerov.json` FAQ :175 → «Нет: в AI-чате GPTBot.uz без регистрации доступны 3 пробных ответа — всего, они не обновляются; затем нужен AI-пакет.» lastReviewedAt stays 2026-08-25, which a test pins.
- `content/blog/ru/chat-gpt-na-russkom.json`: body :452, the summary item :509 and FAQ :534 now give the 3-trial wording instead of «в рамках дневного лимита». Dates not changed.
- `content/blog/ru/chat-gpt-online.json`: the same fix at :280, :385 and :410. These are text only: no anchors, links, keywords or dates changed. The verifier included it because the C23 301 ships later.
- `tests/seo-trial-product-truth.test.ts`
  - The 5 RU files above are added to `trialFiles`. A comment says chat-gpt-online leaves the list when its C23 301 ships.
  - The forbidden regex now also catches `лимит сообщений в день|в рамках дневного лимита|[Бб]азов\S* (?:бесплатн\S* )?доступ`. A grep of content/pages/ru and content/blog/ru finds no matches.

**W1-03 (decoding GPT/ChatGPT and pair C46)**
- `content/pages/ru/gpt-vs-chatgpt-sravnenie.json`
  - heroSubtitle is now the verifier's text. It does not repeat the Russian phrase «генеративный предварительно обученный трансформер».
  - New TOC entry and new H2 `chatgpt-rasshifrovka` «Как расшифровывается ChatGPT» after the terms section. Its three paragraphs cover: Chat + GPT; the Russian spellings, mentioned in body text only and never as anchors; and «GPTBot.uz — не ChatGPT, а независимый ИИ-чат».
  - Two new FAQ: «Как расшифровывается ChatGPT?» and «GPT — это аббревиатура чего?». The second says the Transformer architecture was described by Google researchers in 2017.
  - lastReviewedAt and updatedAt → 2026-10-24. Title, H1, description and keywords unchanged.
- `content/pages/ru/chto-takoe-gpt-i-kak-polzovatsya.json`: removed «расшифровка GPT», «Generative Pre-trained Transformer» and «GPT и ChatGPT разница» from secondaryKeywords. The body is not touched by W1-03.
- `content/seo/intent-manifest.json`: new pair C46-ru-gpt-decoding-vs-gpt-explainer (DIFFERENTIATE, 2026-10-24) with mutual mustNotTarget lists.
  - sravnenie owns the decoding, the abbreviation and the difference.
  - chto-takoe owns «что такое / что значит / что означает / как работает gpt» and «генеративный предварительно обученный трансформер».
  - gscNote records the 438 : 26 split for 10-07..10-21 and that keywords are not printed in the HTML. It also says the H2 about decoding on chto-takoe stays on purpose and names the measurement base: 10-07..10-21, 438 / 2, position 8.2.
  - No existing anchor to either page matches the other side's mustNotTarget.
- Skipped: the CHANGE_LOG entry. It is outside my file scope, so the integrator should add it using the base above.

**W1-04 (links to the payment guide and the Claude article)**
- sravnenie: new linkp right after the `dostup` paragraph, with «как оплатить ChatGPT Plus из Узбекистана» → payment guide and «ChatGPT и Claude в Узбекистане: доступ и регистрация» → Claude article. Text is word for word from the L5 plan.
- chto-takoe bodyBlocks[30]: sentence appended, with «ChatGPT и Claude в Узбекистане» → Claude article. Dates not changed.
- gde-polzovatsya bodyBlocks[7]: sentence appended, with «сравнение ChatGPT и Claude в Узбекистане» → Claude article. The existing {pay} link is kept and no second payment link was added.
- chat-gpt-na-russkom body[27]: the second sentence is rewritten with {claude} «руководстве по ChatGPT и Claude в Узбекистане». All 5 existing tokens are kept and body[4] is untouched. Dates not changed.
- Skipped, outside my scope: correcting the evidence in backlog.json / BACKLOG.md, the CHANGE_LOG «Выкаты» external-signal entry, and IndexNow for the 4 source pages.

**W1-05 (RU part only), UX hygiene as the verifier reclassified it**
- `content/pages/ru/tarify-ai-chat.json`: the Studio paragraph after the h2 «Studio: отдельные тарифы презентаций» is now a linkp.
  - The raw «/uz/tariflar/» becomes {studio_tariffs} «тарифов Studio», marked «(на узбекском)».
  - Added «Сам инструмент — {studio}: тема → черновик .pptx, бесплатный пример — 1 в сутки, до 6 слайдов.» Here {studio} is «ИИ для презентаций» → /ru/prezentatsiya-ai/; the facts come from the studio page itself.
  - The prices 5 900 / 39 900 and Kunlik/Oylik are unchanged.
- Skipped, as the verifier said: sravnenie, chto-takoe, chat-gpt-na-russkom and gde-polzovatsya get no studio link. The UZ parts belong to other agents.

**W1-10 (anchor H-3)**
- `content/blog/ru/zakazat-telegram-bota.json` internalLinks[7]: the anchor «Chat GPT на русском» is now «Как пользоваться AI-чатом на русском». The target is unchanged, H-4 / internalLinks[6] are left for W3-02, and the date is not changed.

**Vague trial wording I left alone**
Not on any item's list, so unchanged; worth a later pass:
- chto-takoe :48 «в пределах бесплатного лимита регистрация не нужна».
- tarify-ai-chat :93, :114 and FAQ :193, which refer to a «бесплатный лимит».
- gpt-dlya-biznesa :68 «с бесплатным лимитом».

# uz

All four items are done in the 9 UZ content files, except two parts outside my scope: the figure image and the `trialFiles` test entry. Nothing is committed, built or deployed. Every changed file is still valid JSON with CRLF and no BOM. The apostrophe scan of added lines found 0 ASCII `'`, U+02BB or U+02BC, and no U+2018 after a letter other than o/g. No protected page was touched.

**W1-02 — `/uz/suniy-intellekt/`** (`F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\suniy-intellekt.json`)
- **Keywords:** `primaryKeyword` and «sun’iy intellekt nima» now use U+2019. Added «suniy intellekt nima», «suniy intellekt turlari», «sun’iy intellekt haqida ma’lumot» and «сунъий интеллект нима».
- **Title:** now «Sun’iy intellekt nima: turlari, tarixi, o‘zbekcha misollar» (58 chars). H1, description and ogTitle are unchanged.
- **bodyBlocks[2] replaced, not duplicated:** new h2 «Sun’iy intellekt bilan o‘zbekcha gaplashib ko‘ring» plus a linkp with the trial terms («3 ta bepul sinov javobi, keyin AI paket; sinov javoblari yangilanmaydi») and the not-OpenAI line. One chat link, anchor «sun’iy intellekt chat (o‘zbek tilida)». The example prompt is kept.
- **#turlari:** short intro, then h3 + list for ANI/AGI/ASI and for the four functional types. The existing table now sits under h3 «Qo‘llanish bo‘yicha».
- **New h2 #tarixi:** table with 1950, 1955–1956, 1997, 2012, 2017 and 30.11.2022.
- **New h2 #xizmatlar:** 4-row table (ChatGPT, Gemini, Claude, DeepSeek), with descriptions taken from each official page. GPTBot.uz is a paragraph after the table, not a row. That paragraph links the comparison article with anchor «ChatGPT, Claude va Gemini taqqoslash».
- **#cheklovlar:** renamed «Sun’iy intellektning afzalliklari va xavflari»; a new pros list was added and the risks list kept.
- **New h2 «…esse yoki referat uchun reja»:** a 6-point sample plan, with links to insho «esse yozish tartibi», referat «referat yozish tartibi», slayd «slayd tayyorlash» and `/uz/taqdimot-ai/` «sun’iy intellekt slayd». Those three guide links moved here from the «O‘qish va ish» paragraph, so no link is duplicated; that paragraph now links only kurs, rezyume and ariza.
- **New h2 #kirill:** a Latin spelling note plus a `lang="uz-Cyrl"` paragraph. #biznes-uchun moved below #ish-or-ni.
- **FAQ:** faq[2] extended with the trial line, and 2 new FAQs added.
- **Sources:** 10 entries — 6 for the dates, 4 for the official service pages. The Turing DOI returned 403 to my script, so its note does not say «tekshirildi».
- **Dates:** `lastReviewedAt` set to 2026-10-24 and `updatedAt` to 2026-10-24T00:00:00.000Z; `createdAt` is unchanged.
- **Donor links**, one each:
  - `content\blog\uz\chatgpt-talabalar-uchun.json`: «sun’iy intellekt nima» (the fact-check paragraph became a linkp).
  - `content\pages\uz\gpt-chat-qollanma.json`: «sun’iy intellekt haqida ma’lumot».
  - `content\pages\uz\gpt-uzbek-tilida-ai-chat.json`: «sun’iy intellekt turlari».
  - `content\blog\uz\referat-va-mustaqil-ish.json`: «sun’iy intellekt tarixi», in a new linkp after the prompts table.
  - `content\blog\uz\chatgpt-claude-gemini-ozbekistonda.json`: «sun’iy intellekt nima va turlari».
- **Skipped or changed:**
  - **(a) Figure image not added.** It needs a new asset under `public/`, outside my allowed paths. I added a text list of the same nesting (SI ⊃ mashiniy o‘rganish ⊃ chuqur o‘rganish ⊃ LLM) under «qanday ishlaydi» instead.
  - **(b) `trialFiles` entry not added.** `tests/seo-trial-product-truth.test.ts` is outside my scope and is already being edited by the W1-01 agent. Someone needs to add `content/pages/uz/suniy-intellekt.json` to `trialFiles`; the file already passes all three regexes.
  - **(c) No «narx va limitlar» column in the services table.** A «Narx…» header would tag it as a pricing table and fire `pricing_view` analytics on this page. The «check the official site» note is in the paragraph above the table instead.

**W1-05, UZ parts only:**
- `content\blog\uz\kurs-ishi-yozish.json` («Himoya…» linkp): added the 6-slide free sample / separate Studio tariff sentence, link to `/uz/taqdimot-ai/`, anchor «taqdimot yaratish».
- `content\pages\uz\gpt-uzbek-tilida-ai-chat.json` (study-guides linkp): added the .pptx sentence, link to `/uz/taqdimot-ai/`, anchor «slayd AI». It also says Studio tariffs are separate from the AI paket.
- `content\pages\uz\gpt-chat-qollanma.json` (block «Bepul chat, AI paket…»): added «AI paket taqdimotlarni o‘z ichiga olmaydi: .pptx uchun alohida {studio} bor.», link to `/uz/tariflar/`, anchor «Studio tariflari (taqdimot uchun)».
- insho is not changed for W1-05, as the verifier said.

**W1-06:**
- `content\blog\uz\target-reklama-nima.json`: new linkp after body[30] with the verifier's rewritten text (no repeated phrase), link to the Direct article, anchor «Instagram Direct nima va AI-bot qanday ishlaydi».
- `content\blog\uz\insho-yozish-suniy-intellekt-bilan.json`: W1-12 verbatim, between the prompts table and the referat linkp, anchor «o‘zbek tilida prompt yozish formulasi» linking `/uz/gpt-uzbek-tilida-ai-chat/`.
- `content\blog\uz\chatgpt-talabalar-uchun.json`: W1-13 verbatim at the end of body[16], anchor «ariza va tushuntirish xati yozish».

**W1-08** (`content\blog\uz\insho-yozish-suniy-intellekt-bilan.json`):
- h3 «Murakkab reja namunasi: 3 ta mavzu» goes before the «Sodda reja faqat…» paragraph, which now says «Quyidagi namunalar».
- The table is rebuilt as Mavzu | Sodda reja | Murakkab reja, one row per topic. «Ona tabiatni asraylik» keeps its old text; the two new topics use the verifier's texts.
- `dateModified` set to 2026-10-24 and `updatedAt` to 2026-10-24T00:00:00.000Z. Keywords, topicCluster, title, H1 and description are unchanged.

**Checks:**
- Passing: seo-content-guards, seo-page-integrity, seo-cluster-quality, seo-link-graph, seo-intent-manifest, seo-trial-product-truth, homepage-lists-frozen, blog-related-links, home-resources, uzbek-login-journey, seo-protection, seo-demand-gate, seo-indexation-recovery, seo-recovery-technical, studio-release (4 of its tests skipped). `scripts/seo-audit.ts` reported no critical issues.
- Expected to fail until the rebuild: ai-chat-guide-schema for `/uz/suniy-intellekt/`. `dist/` still has dateModified 2026-10-07 against the new 2026-10-24.
- Failing, but not on my files:
  - seo-revenue-claims «free limits on the pricing page» is about `ru/tarify-ai-chat.json`; the phrase it looks for is missing at HEAD too.
  - seo-push-revision R3-6 and R3-9 trip on the 2026-10-23 dates of the protected UZ chat and the login guide.
- Not run: tsc and eslint, because no TS changed and eslint does not cover JSON. No build or prerender, as instructed.

# tech

**W1-11: done.** The new anchor test passes 4/4 on the current tree.
- **Files:** new `tests/seo-anchor-intent.test.ts`; `package.json` (one edit: two test paths appended to `scripts.test`).
- **Forbidden phrases:** the test builds a map from each target URL to the phrases it must not be targeted with. It takes both sides of every pair in `intent-manifest.json`, including C46 that another agent just added. It also takes `architectureDecisions[]` entries that have their own `mustNotTarget`, applied to both `url` and `counterpart` (today A8, the translator pages).
- **Links scanned:** every `{target, anchor}` object in published JSON under `content/blog`, `content/pages` and `content/studio/pages`: `internalLinks`, linkp `links[]` and the few other link arrays. That is 297 files and about 3,400 links.
- **Matching:** exact match only, no substring matching. Case, the apostrophe variants (ʻ ʼ ’ ' ` → ‘), NBSP and repeated spaces are normalised first. Targets drop `https://gptbot.uz`, `#…` and `?…`.
- **Allowlist:** exactly H-1 (`chat-gpt-na-russkom.json` `internalLinks[1]`), H-2 (`chat-gpt-online.json` `internalLinks[1]`) and H-4a (`zakazat-telegram-bota.json` `body[34]`). Each is keyed by (file, block, target, anchor) and commented with W3-02 ≈2026-11-25.
- **Stale entries fail:** if an allowlisted link no longer violates the rule, or matches more than one link, the test fails until the entry is deleted. If a content edit only shifts the block index, the failure message says to update the index.
- **Extra test:** no internal anchor may be exactly «ChatGPT kirish» or «чат джипити».
- **Sanity test:** checks the map and link counts, so the test cannot pass on empty data.
- **Skipped:**
  - H-3: W1-10 has already fixed it in the working tree.
  - H-4b and H-5: they only match as substrings, so the exact rule cannot see them.
  - The optional `doNotLink[]` migration: the verifier rejected it.
- **Checked by mutation:** with the allowlist emptied, the test fails on exactly H-1, H-2 and H-4a.

**W1-12: done.**
- **`src/shared/robots-policy.ts`:** new exported constant `YANDEX_CLEAN_PARAM`. `buildRobotsTxt` now emits it after `Sitemap:`, under the comment `# Yandex: strip tracking params (inter-sectional)`:
  `Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid&fbclid&ysclid`
  There is no separate `User-agent: Yandex` group.
- **Tests:**
  - `tests/bormi-admin-hardening.test.ts`: added the assertion the verifier asked for (the line exists exactly once, no Yandex group).
  - `tests/gsc-indexation-hygiene.test.ts`: same check added, because this file is in `npm test` and the bormi file is not.
- **Skipped:** `public/robots.txt`. It is an optional fallback that production does not serve.
- **After deploy:** check the live file with a cache-buster, because the edge caches robots.txt for 4 hours.

**W1-13: (b) and (c) done, (a) skipped.**
- **(b)** `scripts/generate-robots.ts`: added `  ! Cache-Control` before the Cache-Control line in the `/llms.txt`, `/llms-full.txt` and `/*.md` blocks.
- **(c)** `public/404.html`: title is now `404 — Страница не найдена | GPTBot.uz`.
- **Test:** `tests/gsc-indexation-hygiene.test.ts` now checks the detach line comes before the policy in all three blocks, and checks the 404 title.
- **(a) skipped (`/?lang=ru` single hop):** the verifier found the first redirect comes from a Cloudflare Page Rule on the zone, not from the repo. `functions/index.ts` never runs for `/`. The fix is to change that Page Rule's destination to `https://gptbot.uz/`. That is outside the repo deploy and needs the owner or zone API access. Also noted: `/ru/?lang=ru` takes three hops.

**W1-14: done in the verifier's "ship now" form.**
- **Files:** `scripts/jsonld-helpers.ts`, `content/pages/uz/hub.json`, new `tests/seo-breadcrumb-ld.test.ts`.
- **`name` property:** `buildBreadcrumbLd(items, name?)` now adds a top-level `name`, defaulting to the last crumb's name. The four call sites are unchanged.
- **Protected pages excluded:** the list is skipped when the last crumb's path is in `PROTECTED_PATHS`, imported from `scripts/seo-protection.ts`. The output for those pages is then key-for-key what it was before, so all 9 protected pages that carry a BreadcrumbList should stay byte-identical. That keeps the download guide's P-CTR freeze and the chats' 28-day window intact.
- **`/uz/`:** removed `"BreadcrumbList"` from `schemaTypes` in `hub.json`. `/uz/` is not a protected page, and `updatedAt` is unchanged.
- **New test:** covers the default name, the explicit name and the protected exclusion. It also checks `/uz/` has no BreadcrumbList, and, when `dist` exists, that the built protected pages carry no `name`.
- **Your note that JSON-LD is outside the gate is correct:** in `scripts/seo-protection.ts`, `seoContract()` strips every `<script>` before fingerprinting (line 171), so JSON-LD is not in the contract.
- **Why the exclusion anyway:** the verifier showed that a site-wide change would still alter the HTML of 9 of the 10 protected pages. So I followed its corrected action and kept them out rather than changing JSON-LD on every page.

**For the integrator:**
- After prerender, run `seo-protection check` (expect 10/10) and compare the download guide's HTML byte-for-byte with the d54d5b61 build.
- The verifier also asks for a CHANGE_LOG_2026-10 entry ("template JSON-LD change, protected pages untouched"). I did not edit that file because it is outside my list.
- After recrawl, run `inspect_urls` on 2–3 unprotected URLs to confirm the "Unnamed item" label is gone.
- The anchor test must be re-run after the RU/UZ content agents finish.

**Checks:**
- `npx tsc -b`: 0 errors.
- eslint on my changed scripts, `src` and test files: 0 errors (JSON and HTML were not linted).
- Passing test files: `seo-anchor-intent` 4/4, `seo-breadcrumb-ld` 4/4, `gsc-indexation-hygiene` 13/13, `seo-content-guards`, `studio-prerender`, `seo-cluster-quality`, `home-hreflang-cluster`, `seo-protection`, `seo-intent-manifest`, `legal-oferta`, `seo-recovery-technical`, `canonical-url-redirects`, `yandex-metrika`.
- Three tests fail for reasons outside my changes:
  - `bormi-admin-hardening`: "panel builds into dist/admin" expects an older `build:cf` script order. All its robots tests pass.
  - `translator-pages`: the blind-check CSV header now ends in `\r`, a line-ending issue in that file.
  - `ai-chat-guide-schema`: `/uz/suniy-intellekt/` has a stale `dateModified` in `dist`, because another agent edited that content. It should pass after the rebuild.

Nothing was committed, built, prerendered or deployed. I did not touch any protected content file.

Files changed:
- F:\Claude\gptbot-snippets-translator-20261024\tests\seo-anchor-intent.test.ts (new)
- F:\Claude\gptbot-snippets-translator-20261024\tests\seo-breadcrumb-ld.test.ts (new)
- F:\Claude\gptbot-snippets-translator-20261024\package.json
- F:\Claude\gptbot-snippets-translator-20261024\src\shared\robots-policy.ts
- F:\Claude\gptbot-snippets-translator-20261024\tests\bormi-admin-hardening.test.ts
- F:\Claude\gptbot-snippets-translator-20261024\tests\gsc-indexation-hygiene.test.ts
- F:\Claude\gptbot-snippets-translator-20261024\scripts\generate-robots.ts
- F:\Claude\gptbot-snippets-translator-20261024\public\404.html
- F:\Claude\gptbot-snippets-translator-20261024\scripts\jsonld-helpers.ts
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\hub.json

# tr

The RU↔UZ translator pages are ready to publish. The release still needs a new reviewed protected revision for `/`, which only you can write after the build. Both pages are now `status: published` with a visible beta note, and they get contextual links from 3 unprotected pages per language. The 4 required test files pass and `tsc -b` has 0 errors. Nothing is staged, committed, built or deployed, and no protected-page content file was touched.

**Blocking: protected revision for `/`.** The homepage lists every published page, so publishing these two pages changes its crawler shell. I checked from `content/`: exactly two homepage entries are added.
- `/ru/russko-uzbekskiy-perevodchik/`: «Русско-узбекский AI-переводчик: перевод с пояснениями» (RU money list)
- `/uz/rus-ozbek-tarjimon/`: «Ruscha-o‘zbekcha AI tarjimon: izohli tarjima» (UZ money list)

Expected effects until you write it:
- `seo-protection check` should fail on `/` for `internalLinks` and `bodyTextSha256` only.
- `homepage-lists-frozen` is red now (2/4) and stays red until the new baseline exists.
- To do: a new `docs/seo/evidence/2026-10-24-<name>/reviewed-protected-pages.json` built from dist, with `reviewedChanges [{'/', ['bodyTextSha256','internalLinks']}]`. Then point `BASELINE` in `scripts/seo-protection.ts` at it and add a test for exactly these two new links.

I did not write it, because it needs the built HTML and its hashes.

**Translator publication: files changed**
- **`content/pages/ru/russko-uzbekskiy-perevodchik.json`:** status → published. New `bodyBlocks[1]`: «AI-перевод на этой странице работает как бета. Важные и официальные тексты — документы, договоры, письма в госорганы — перед отправкой проверьте у человека, который хорошо знает оба языка, или у профессионального переводчика.»
- **`content/pages/uz/rus-ozbek-tarjimon.json`:** status → published. New `bodyBlocks[1]`: «Bu sahifadagi AI tarjima hozircha beta rejimida ishlaydi. Muhim va rasmiy matnlarni — hujjat, shartnoma, davlat idorasiga xatni — yuborishdan oldin ikkala tilni yaxshi biladigan odamga yoki professional tarjimonga ko‘rsating.»
- **Unchanged on both pages:** the trial terms, the converter as the first block, and `updatedAt`. Titles are 56/56 characters and descriptions 150/145.
- **`content/seo/intent-manifest.json`:**
  - New pair **C47** (`/uz/gpt-uzbek-tilida/` ↔ `/uz/rus-ozbek-tarjimon/`): the translator is fenced from «chatgpt tarjima/tarjimon», «chatgpt o‘zbekcha tarjima», «chatgpt uzbekcha tarjimon», «chatgpt uzbekcha», «chatgpt uzbek tilida», «bepul ai chat» and «sun’iy intellekt chat». The chat is fenced from the translator's keywords.
  - New pair **C48** (`/ru/gpt-chat/` ↔ `/ru/russko-uzbekskiy-perevodchik/`), fenced the same way in both directions.
  - **A8** stays as the record: decision `PUBLISHED_AS_PAIRS_C47_C48`, status published, `publishedAt`, `pairs[]`, and a new `publicationNote`. That note says the owner's order overrode the gate, that the blind check and native proofreading were not done, and that the quota is the shared 3 trial replies plus the free converter (options C+D). The old draft note is kept and labelled as the draft record. A8's own `mustNotTarget` still fences both URLs.
- **`content/seo/demand-policy.json`:** 4 notes changed from "draft owner" to "published 2026-10-24, pair C47/C48".
- **Route list:** both URLs added in sorted order to `APPROVED_STATIC_ROUTE_ADDITIONS` in `tests/react-router-v8-migration.test.ts`. I checked they appear in the route inventory diff.
- **`public/llms.txt`:** chat-product list entries, a "When to recommend" bullet (beta, shared trial, free converter, no photo or voice translation, official documents need a human), two query mappings, and "Last updated" set to 2026-10-24.
- **`public/llms-full.txt`:** a pages-list entry, two query mappings, and the same "Last updated" date.
- **`scripts/chat-layout-check.mjs`:** new `--translator` flag that checks the two translator pages, with its own default report `docs/seo/evidence/2026-10-24-translator-pages/layout-report.json`. The default run is unchanged.
- **Sitemap, hreflang and the Atom feed:** these pick the pages up from their published status; nothing to edit.

**Inbound links.** All are body links in unprotected pages; none is anchored «chatgpt tarjima» or a bare head term.

| Page | Edit | Anchor |
|---|---|---|
| `content/pages/ru/gpt-chat-guide.json` | block 2: p → linkp | «русско-узбекский AI-переводчик» |
| `content/pages/ru/gpt-dlya-ucheby.json` | new linkp in the «Языки и перевод» section | «AI-переводчик GPTBot.uz» |
| `content/pages/ru/promty-gpt-chatgpt-50-primerov.json` | new linkp after prompts 42–47 | «переводчик с русского на узбекский» |
| `content/pages/uz/gpt-uzbek-tilida-ai-chat.json` | «ChatGPT tarjima» section p → linkp | «Rus-o‘zbek tarjimon» |
| `content/pages/uz/gpt-chat-qollanma.json` | block 4: p → linkp | «ruscha-o‘zbekcha AI tarjimon» |
| `content/blog/uz/chatgpt-talabalar-uchun.json` | new linkp after block 5 (says «u ChatGPT emas» and that it is a beta) | «ruschadan o‘zbekchaga tarjima» |

**Tests**
- `tests/translator-pages.test.ts` (13/13):
  - Now checks: status published, title ≤60, description 120–158.
  - The beta note must be one of the first two blocks.
  - At least 2 body links per language from unprotected pages, and no protected page may link the translator.
  - Sitemap and built HTML are checked only once a post-publication build exists.
  - A8 must be published, with C47/C48 present.
  - The CRLF failure in the blind-check CSV header is fixed.
- `tests/seo-trial-product-truth.test.ts`: comment only (no longer says "drafts").

**Not changed**
- The converter files `src/shared/uz-translit.ts`, `src/uz-translit/main.ts` and `scripts/translator-page.ts` needed no changes.
- No `dateModified` or page `updatedAt` was bumped; only the two llms files' "Last updated" dates changed.
- Optional, not done: matching the Metrika `gpt_chat_open` goal to the translator paths, and Markdown twins.
- Known limitation, unchanged: after payment or login the visitor lands on the main chat, not the translator page.

**Checks run**
- **Required tests:** translator-pages 13/13, uz-translit 94/94, seo-intent-manifest 5/5, seo-page-integrity 17/17.
- **Also green:** seo-anchor-intent, seo-link-graph, seo-content-guards, seo-cluster-quality, gpt-chat-prerender-links, seo-trial-product-truth, seo-demand-gate, intent-guard, gsc-indexation-hygiene, blog-related-links, studio-prerender, seo-protection, seo-commercial-coverage, commercial-seo-contract, homepage-crawler-shell, home-hreflang-cluster, blog-feed and seo-breadcrumb-ld; studio-release passes with 4 skipped.
- **Other commands:** `npx tsc -b` 0 errors; eslint on my 4 test and script files 0 errors; `npx tsx scripts/seo-audit.ts` reports no critical issues (126 published, 0 drafts, 0 orphans). All edited files keep CRLF, no BOM and valid JSON. The scan of added Uzbek text found 0 ASCII apostrophes, U+02BB or U+02BC.
- **Already failing before my changes (I left them):**
  - react-router-v8-migration 3 tests (route count and router import).
  - studio-contact 2 tests (`ai-bot-s-crm` lead form).
  - seo-push-revision R3-6 and R3-9.
  - gpt-chat-rev-design §5.3 (`AiChatConsole` placeholder).
  - updates-feed: compares against the old `dist/`; clears after rebuild.
  - chat-ui-revision: stale layout report.

**For you, after the build**
1. Run `npm run check:chat-layout -- --translator`.
2. Re-run translator-pages: its built-HTML and sitemap tests then actually run.
3. Re-run homepage-lists-frozen, seo-protection and updates-feed.

# integ

Wave 1 is committed as `f97295b5225bf68e8f94d35265a161bfa56fdf47` on `seo/chat-snippets-translator-20261024` (base `1a773ee2`). Nothing is pushed or deployed: production is still `d54d5b61` (deployment `d0264730`). The protection check passes 10/10 against the new revision, and the only new test failure is fixed.

**URLs for IndexNow after deploy (23)**
https://gptbot.uz/
https://gptbot.uz/ru/russko-uzbekskiy-perevodchik/
https://gptbot.uz/uz/rus-ozbek-tarjimon/
https://gptbot.uz/uz/suniy-intellekt/
https://gptbot.uz/ru/gpt-vs-chatgpt-sravnenie/
https://gptbot.uz/ru/chto-takoe-gpt-i-kak-polzovatsya/
https://gptbot.uz/ru/gde-polzovatsya-gpt-besplatno/
https://gptbot.uz/ru/gpt-chat-guide/
https://gptbot.uz/ru/gpt-dlya-ucheby/
https://gptbot.uz/ru/promty-gpt-chatgpt-50-primerov/
https://gptbot.uz/ru/tarify-ai-chat/
https://gptbot.uz/ru/blog/chat-gpt-na-russkom/
https://gptbot.uz/ru/blog/chat-gpt-online/
https://gptbot.uz/ru/blog/zakazat-telegram-bota/
https://gptbot.uz/uz/
https://gptbot.uz/uz/gpt-chat-qollanma/
https://gptbot.uz/uz/gpt-uzbek-tilida-ai-chat/
https://gptbot.uz/uz/blog/chatgpt-claude-gemini-ozbekistonda/
https://gptbot.uz/uz/blog/chatgpt-talabalar-uchun/
https://gptbot.uz/uz/blog/insho-yozish-suniy-intellekt-bilan/
https://gptbot.uz/uz/blog/kurs-ishi-yozish/
https://gptbot.uz/uz/blog/referat-va-mustaqil-ish/
https://gptbot.uz/uz/blog/target-reklama-nima/

**Protection result**
- **Before the new revision:** the check failed only on `/` (`internalLinks` and `bodyTextSha256`), as expected.
- **New revision:** `docs/seo/evidence/2026-10-24-wave1/reviewed-protected-pages.json`, follows `2026-10-24-chat-snippets`. `BASELINE` in `scripts/seo-protection.ts` points to it, with a revision paragraph. A new test for it is in `tests/seo-protection.test.ts`.
- **What the generator enforces** (`docs/seo/implementation/2026-10-24-wave1/review-candidate.ts`). It refuses to write unless all of these hold:
  - `/` gains exactly the two translator links (295 → 297) and their two H1 labels, and its HTML is byte-identical to the previous version once those two list items are removed.
  - Both chats are byte-identical once the old chat script name is put back (`gpt-chat-DXmrgoYc.js` → `gpt-chat-qKkuHbSa.js`). That rename comes from the translator merge `1a773ee2`, not from wave 1.
  - The 7 protected articles are byte-identical to the `d54d5b61` build.
- **Not caught by the gate, listed in the revision instead:** breadcrumb names, the Yandex Clean-param line, the cache headers, and sitemap/llms entries.
- **Breadcrumb name (W1-14):** your brief asked for "all pages". The implementation follows the verifier and adds the name only on the 288 non-protected pages, so the 9 protected pages stay byte-identical during their measurement windows. The revision records it that way.

**Tests vs baseline**
- **Full suite** (`tests/*.test.ts`, run in 19 batches): 4548 tests, 31 failures.
  - **New (1):** "R3-10 on the build" in `seo-push-revision`. The published translator pages use the chat template, which has no site header. I fixed the test by treating them like the two chats.
  - **Pre-existing (30):** all the same names fail on a clean export of `1a773ee2`. This includes your known list (gpt-chat, studio-contact ×2, seo-push-revision R3-6/R3-9, react-router-v8-migration 3/26, gpt-chat-rev-design, chat-ui-revision). The rest are older failures in areas wave 1 did not touch:
    - chat and account UI: gpt-account-ui ×2, gpt-chat-business-line
    - billing and payments: gpt-click-fiscal, gpt-live-readiness, gpt-hash-salt, gpt-retention, gpt-zai-provider
    - platform: agent-boundaries, platform-ai, platform-runtime
    - leads and market: lead-attribution, lead-radar-api ×2, market-cabinet-shell
    - build and routing: bormi-admin-hardening, bunzy-webhook, studio-d1-budget
    - pricing page free limits: seo-revenue-claims
    - n8n-dependency-inventory, which lists only old tracked files outside this change.
- **After the fixes:** I re-ran 7 SEO files (seo-push-revision, seo-trial-product-truth, seo-protection, homepage-lists-frozen, translator-pages, seo-anchor-intent, seo-breadcrumb-ld): 51/53 pass; only R3-6/R3-9 fail, as before. The full suite was not re-run after these fixes.
- **Other checks:** `tsc -b` and `typecheck:functions` exit 0, eslint on 15 changed TS/JS files 0, `seo-audit` reports no critical issues.
- **Secret scan:** one new false positive in `verify-W1-14.md` (a table cell reading "GSC: PASS"); I reworded the cell. The only remaining finding is the old `tests/telegram-assistant.test.ts:639`.
- **Staged-diff checks:** the Telegram-token grep found nothing, and no dist or log files are included.
- **Uzbek apostrophes** in added lines: no ASCII, U+02BB or U+02BC, and no U+2019 used for o‘/g‘.

**Per item**
- **W1-01 (done):** 5 RU pages now state 3 lifetime trial replies, then the AI pack: `gde-polzovatsya-gpt-besplatno`, `gpt-chat-guide`, `promty-gpt-chatgpt-50-primerov`, `chat-gpt-na-russkom`, `chat-gpt-online`. `tests/seo-trial-product-truth.test.ts` covers them; I also added `suniy-intellekt.json` there.
- **W1-02 (done, except the figure):** `/uz/suniy-intellekt/` rework plus 5 donor links. The SI ⊃ ML ⊃ DL ⊃ LLM figure was not made; there is a nested list instead.
- **W1-03 (done):** ChatGPT decoding on the sravnenie page, explainer keywords trimmed, pair C46.
- **W1-04 (done):** 5 links. The verifier's backlog evidence correction exists only in the verify file.
- **W1-05 (done as UX hygiene, per the verifier):** 5 Studio links across `tarify-ai-chat`, `kurs-ishi-yozish`, `gpt-uzbek-tilida-ai-chat` and `gpt-chat-qollanma`.
- **W1-06 (done):** 3 UZ links.
- **W1-08 (done):** insho complex plan for 3 topics.
- **W1-10 (done):** anchor H-3.
- **W1-11 (done):** `tests/seo-anchor-intent.test.ts`.
- **W1-12 (done):** Yandex Clean-param line in robots.txt.
- **W1-13:** parts (b) and (c) done. Part (a) is not done: it is a Cloudflare zone Page Rule, not repo code.
- **W1-14 (done):** breadcrumb name on non-protected pages; the self-referencing breadcrumb on `/uz/` is removed.
- **Translator publication (done):** both pages published with a visible beta note. The native-speaker blind check and proofreading have **not** been done.
- **Skipped:** W1-07 and W1-09 (refuted; I did not add the optional W1-09 UX link). W1-15 is a post-deploy step.

**Docs:** new section «Волна 1 роста 24.10» in `docs/seo/CHANGE_LOG_2026-10.md` with the full URL table. `docs/agents-platform/HANDOFF.md` is rewritten in 12 sections. `docs/agents-platform/STATE.json` has an updated stage, a new `seo_wave1_20261024` block, and the translator block marked published. The commit also adds the growth-audit research folder. Report files that my test run regenerated were restored, not committed.

**Not done**
- `build:production`, the deploy, live readback, IndexNow and URL Inspection. These need your command; `HANDOFF.md` §8 lists the steps.
- `check:chat-layout --translator`, which needs a browser.
- `build:fast` does not build the Studio pages; `build:production` does.