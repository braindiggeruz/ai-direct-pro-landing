# platform

The platform is committed as `af0446feae4b2bd20724daf618357722e72d05ff` on branch `seo/chat-snippets-translator-20261024`. It is not pushed and not deployed, and the worktree is clean.

I resumed the previous session's uncommitted work instead of starting over. I reviewed it and made these fixes:

- **Bundle budget:** the chat start bundle is now 109 790 B br. HEAD was 109 765 B, the limit is 110 000 B, and I did not raise the budget. The role picker's names and descriptions moved to `src/gpt-chat/role-labels.ts`, which loads with the picker's lazy part `chat-role`. What each role tells the model stays in `roles.ts`, because every question needs it.
- **Chip styles:** adding the chip row's CSS to `premium.css` broke two tests that cap that file at 30 000 B. That CSS (`STARTERS_STYLE`) is now an inline style in the head, only on pages that have chips. `premium.css` is unchanged from HEAD.
- **Shared stylesheet:** a variable named `table` in the verbs widget made Tailwind add one extra rule and rename the shared CSS file on every page. I renamed the variable, so the shared CSS is back to `index-B7Z1XlOc.css`, as in production.
- **Writer role:** the previous session had shortened its instructions, which broke the tests. I restored the full wording.
- **Translator JSON files:** each gained `"widgets": ["uz-translit"]`. This edit is needed, because the converter now only renders when a page lists it. Their HTML is byte-identical apart from the chat script's file name, so I kept the edit.
- I also updated `HANDOFF.md`, `STATE.json` (block `chat_tool_platform_20261025`) and `DECISIONS.md` in the same commit, as `AGENTS.md` requires.

**Page fields** (`src/shared/types.ts`):
- `chatRole`: one of `translator`, `teacher`, `smm`, `marketer`, `business`, `writer`. Setting it makes a gpt-chat page an AI tool page.
- `chatStarters`: up to 6 chips, each `{label, prompt}`, plain text, label ≤ 40 and prompt ≤ 400 characters. The build refuses anything else. Chips replace the chat's four default tasks; a click fills the composer and focuses it, never sends.
- `widgets`: any of `uz-translit`, `calculator`, `irregular-verbs`. Both new fields are only allowed on a gpt-chat page with a `chatRole`.

A content page uses them like this:
```json
{
  "pageType": "gpt-chat",
  "chatRole": "teacher",
  "chatStarters": [
    { "label": "Объяснить решение", "prompt": "Объясни по шагам, как решить: " },
    { "label": "Проверить ответ", "prompt": "Проверь мой ответ и объясни ошибку:\nЗадача: \nМой ответ: " }
  ],
  "widgets": ["calculator"]
}
```

**Widget ids:** `uz-translit`, `calculator` and `irregular-verbs`. The irregular-verbs widget has 163 verbs. Calculator and irregular-verbs pass text to the chat through the `gptbot:prefill` event with `{text}`. The chat only listens on pages with a role, and nothing is sent automatically.

**Test results:**
- **Typecheck and build:** `npx tsc -b` and `npm run typecheck:functions` exit 0; `npm run build:fast` exits 0.
- **HTML identity:** compared with the HEAD build, 339 of 344 files are byte-identical. The other four are the two main chats and the two translator pages, which differ only in the chat script's file name. The remaining two differences are files the earlier session's saved HEAD copy did not include (`manifest.json`, `_redirects`), not page changes.
- **Protected pages:** `npx tsx scripts/seo-protection.ts check` prints "Protected SEO: 10/10 unchanged."
- **Bundle budget:** within budget. Chat CSS 6 764 B and page CSS 26 919 B are the same as HEAD; the new lazy part `chat-tool` is 941 B.

| Test file | Pass |
|---|---|
| tool-pages | 18/18 |
| calculator-engine | 58/58 |
| irregular-verbs | 11/11 |
| translator-pages | 13/13 |
| uz-translit | 94/94 |
| gpt-chat-prerender-links | 14/14 |
| seo-page-integrity | 17/17 |
| chat-bundle-budget | 11/11 |
| gpt-chat-lazy-part | 10/10 |
| gpt-chat-honesty | 27/27 |
| seo-protection | 14/14 |

- **Wider check:** across 33 chat and SEO test files, 556 pass and 14 fail. Every failure has the same name on a clean HEAD worktree, so none are new.
- **Lint and audit:** `npx eslint` on all touched files gives 0 errors; `seo-audit` reports nothing critical.
- **Browser check:** I built two temporary draft pages, tested them in a local preview, then deleted them (not committed). Chips filled and focused the composer, the calculator gave correct results and error messages, and «Объяснить с AI» filled the chat and scrolled to it. The verbs search, column hiding, quiz and mistakes prompt worked, and a 375 px screen had no horizontal scroll.

The bundle is now only 210 B under its limit and `premium.css` is near its cap. Code for future tool pages should go in the lazy part `chat-tool`, and CSS in `STARTERS_STYLE` or a widget block.

# c1

I created both pages. Nothing is committed, pushed or deployed, and I didn't edit any protected page, `intent-manifest.json`, `demand-policy.json`, `llms*.txt` or the react-router test. Other agents are writing files into this same worktree, so I left my two files untracked for you to add by name.

The sample poems and greetings carry the label «AI yordamida yozilgan, jamoa tahriri», as the owner ordered. They are original and were written for these pages with AI; the text doesn't claim they were written in the GPTBot.uz chat. No human has edited them yet, so a native speaker must read them before deploy, otherwise the "jamoa tahriri" part isn't true yet.

**Files (UTF-8 without BOM, CRLF, `JSON.stringify` 2-space format)**
- `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\ai-sher-yozish.json`
  - Primary keyword «ona haqida she’rlar»; title 60 characters, description 154.
  - About 1 100 words, 7 FAQ, 6 chips, no widget.
  - 14 original poems in six sections (ona, Yangi yil, bolalar, qish, do‘st, ustoz). They use the barmoq metre (7 or 8 syllables per line) with rhymes, and lines are separated by « / ».
  - The page also covers: how to ask, example requests, rhyme and metre basics, personalising, limits (text only, won't copy known authors, a school-work section that explains rather than writes it for you), "why GPTBot.uz", the next step for visitors (AI pack) and for businesses (SMM 2 490 000/month, AI-bot 1 990 000, both checked on their pages).
  - No Russian pair: `hreflangUz` and `hreflangXDefault` point to the page itself. Prerender emits no hreflang for a page without a pair.
- `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\ai-tabrik-generatori.json`
  - Primary keyword «tug‘ilgan kun tabrigi»; title 57 characters, description 155.
  - About 1 200 words, 7 FAQ, 6 chips, widget `uz-translit`.
  - 15 original greetings: 7 birthday, 3 New Year, plus 8-mart, to‘y and Ustozlar kuni. None repeats the guide's 30 samples.
  - A Cyrillic block of 6 paragraphs (`lang` uz-Cyrl), produced by running `toCyrillic` from `src/shared/uz-translit.ts` with tsx, not typed by hand.
  - Paired with `/ru/generator-pozdravleniy/`. x-default is the Uzbek page, to match what the Russian page (another agent's) already declares.
- To regenerate: run `python build_pages.py export`, then `npx tsx convert.ts cyr_in.json cyr_out.json`, then `python build_pages.py build`. Both scripts are in `C:\Users\Borinio\AppData\Local\Temp\claude\F--Claude\b3c73263-9d70-4f6b-8a59-3708131f58c5\scratchpad\`.

**Checks**
- **Apostrophe scan:** no ASCII apostrophe between letters, no ʻ ʼ or backtick, no o’/g’ with the tutuq.
- **Trial wording:** description, og description and hero subtitle all contain "3" and "sinov". The SoftwareApplication offer matches the trial-truth test (contains "yangilanmaydi" and "AI paket").
- **Keyword conflicts:** no keyword overlaps with the manifest or with any other page.
- **Tests:** I ran 19 test files one at a time with `node --import tsx --test`. 16 are fully green, including tool-pages 18/18. Three still fail, and none of the failures involve my pages:
  - `seo-link-graph` "no broken internal links" and `seo-page-integrity` hreflang: links to `/uz/kalkulyator/`, `/uz/kirill-lotin/` and `/uz/notogri-fellar/`, pages other agents haven't created yet.
  - `seo-revenue-claims` "free limits on the pricing page": already failing before I started.
- Adding my pages fixed two failures that were there before I started: `/ru/generator-pozdravleniy/` was an orphan and had broken links to `/uz/ai-tabrik-generatori/`.

**Proposed manifest pairs (all KEEP_DIFFERENT_INTENT)**
- **C53 uz-chat vs ai-sher-yozish**
  - Commercial side `/uz/gpt-uzbek-tilida/` must not target: ona haqida she’rlar, ona haqida sherlar, yangi yil sherlari, bolalar uchun sherlar, qish haqida sher, she’r yozish.
  - Informational side `/uz/ai-sher-yozish/` must not target: chatgpt uzbekcha, chatgpt uzbek tilida, bepul ai chat.
  - The sher page already links the chat.
- **C54 uz-chat vs ai-tabrik-generatori**
  - Commercial side `/uz/gpt-uzbek-tilida/` must not target: tug‘ilgan kun tabrigi, tugilgan kun tabrigi, туғилган кун табриги, tugilgan kunga tabrik, yangi yil tabrigi.
  - Informational side, the generator, must not target the same three chat keys as C53.
- **C55 ai-tabrik-generatori (commercial) vs /uz/blog/tabrik-yozish/ (informational)**
  - The generator must not target the guide's 11 keys: tug‘ilgan kun tabriklari, tugilgan kun tabriklari, tabriklar, yangi yil tabriklari, табриклар, табрик, onaga tabrik, tabrik yozish, tabrik matni, tabrik so‘zlari, ustozlar kuni tabrik, sms tabrik. To be safe it also leaves out their near-twins onamga tabrik and ustozlar kuniga tabrik.
  - The guide must not target: tug‘ilgan kun tabrigi, tugilgan kun tabrigi, туғилган кун табриги, tugilgan kunga tabrik, yangi yil tabrigi, янги йил табриклари, tabrik generatori.
  - The pair test requires the guide to link the generator, so that link (first one under "Inbound links" below) must go in the same commit.
  - Risk to note: «янги йил табриклари» is the Cyrillic form of the guide's «yangi yil tabriklari». The task assigned it to the generator anyway, and I followed that.
- **C56 ai-sher-yozish vs ai-tabrik-generatori**
  - Sher must not target: tug‘ilgan kun tabrigi, tugilgan kunga tabrik, yangi yil tabrigi.
  - The generator must not target: tugilgan kun sher, tabrik she’rlar, yangi yil sherlari, yangi yilga sher.
  - The two pages link each other.
- Reserved for later pages, declared by neither: sherlar / she’rlar (future `/uz/sherlar/` hub), vatan haqida sher, she’rlar to‘plami, author names (alisher navoiy sherlari, zulfiya sherlari and so on), and the converter keys lotin kirill and kirill lotin, which belong to `/uz/kirill-lotin/`.

**Demand rows** (Google Ads, location 2860; monthly volume, competition LOW)

Source folder: `docs/seo/research/2026-10-25-clusters-to-add/text-tools-data/`. File 1 is `tt_kw1_metrics.json`, file 2 is `tt_kw2_metrics.json`.

| Keyword | Volume | Source | Note |
|---|---:|---|---|
| ona haqida sherlar | 5 400 | file 2 | |
| yangi yil sherlari | 3 600 | file 1 | December 40 500 |
| bolalar uchun sherlar | 3 600 | file 1 | |
| qish haqida sher | 2 900 | file 2 | December 27 100 |
| yangi yilga sher | 1 900 | file 2 | December 22 200 |
| ustoz haqida sher | 9 900 | file 1 | September 74 000 |
| dost haqida sher | 1 000 | file 2 | |
| tugilgan kun sher | 880 | file 1 | |
| tabrik she'rlar | 390 | file 1 | |
| qisqa sherlar | 1 600 | file 1 | |
| sherlar 4 qator | 70 | file 2 | |
| она ҳақида шеърлар | 50 | file 2 | |
| sher yozish | 70 | `docs/seo/research/2026-10-24-growth-audit/l3-data/kw1_metrics.json` | |
| туғилган кун табриги | 9 900 | file 1 | |
| tugilgan kun tabrigi | 6 600 | file 1 | |
| tugilgan kunga tabrik | 4 400 | file 1 | same bucket as «tugilgan kun tabrik» |
| yangi yil tabrigi | 1 600 | file 1 | December 18 100 |
| янги йил табриклари | 1 300 | file 1 | December 14 800 |
| yangi yilingiz bilan | 880 | file 1 | |
| туғилган кунингиз билан | 1 000 | file 2 | |
| 8 mart tabriklari | 720 | file 1 | |
| 8 март табриклари | 1 900 | file 2 | |
| 8 mart tabrik | 590 | file 1 | |
| to'y tabriklari | 140 | file 1 | |
| ustozga tabrik | 320 | file 1 | |
| dugonamga tabrik | 320 | file 1 | |
| rahbarga tabrik | 20 | file 2 | |

Not measured (tool names, secondary keywords only): ai she’r yozish, tabrik generatori, ai tabrik generatori. The demand gate checks only money and niche pages, so these pages don't need a row to build.

**Inbound links from unprotected pages**
1. `content/blog/uz/tabrik-yozish.json`, block 34 (linkp), anchor «AI tabrik generatori». This one is required for C55. «Yuqoridagi so‘rovlardan birini nusxalab, {chat2}da sinab ko‘ring yoki tayyor tugmalar va kirill konvertori bor {gen} sahifasini oching. …»
2. `content/blog/uz/tabrik-yozish.json`, block 31 (turn the p into a linkp), anchor «AI she’r yozish». Append: «…ovoz chiqarib o‘qib ko‘ring; mavzular bo‘yicha she’r namunalari va qofiya bo‘yicha eslatma {sher} sahifasida.»
3. `content/pages/uz/gpt-chat-qollanma.json`, a new linkp after block 8, anchors «AI tabrik generatori», «AI she’r yozish» and «rus-o‘zbek tarjimon». «Ba’zi vazifalar uchun chat kerakli rol bilan ochiladigan alohida sahifalar bor: tabrik uchun — {tabrik}, she’r uchun — {sher}, tarjima uchun — {tarjimon}.»
4. `content/blog/uz/insho-yozish-suniy-intellekt-bilan.json`, block 32 (linkp), anchor «AI she’r yozish». Append: «…, she’r yozish va qofiyani tekshirish esa {sher} sahifasida.»

**Other notes for you**
- Both files pass every assertion in `tests/seo-trial-product-truth.test.ts`, so you can add them to its `translatorFiles`/`trialFiles` lists if you want them guarded.
- When `/uz/kirill-lotin/` lands, consider pointing the sher page's «kirill ↔ lotin konvertori» link there instead of `/uz/rus-ozbek-tarjimon/`.
- Each B2B line names one price per service (SMM 2 490 000/month, AI-bot 1 990 000, both checked on their pages). Phone and e-mail are copied from the translator page template.

# c2

STATUS: I wrote 4 Russian AI tool pages. They are untracked: not committed, not pushed, not deployed. HEAD is af0446fe and the worktree had no uncommitted changes at restart, so nothing from the previous session needed resuming. I did not touch intent-manifest.json, demand-policy.json, tests/react-router-v8-migration.test.ts, public/llms*.txt, protected pages, src/ or other content.

FILES (CRLF, 2-space JSON, same layout as the translator page):
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\generator-pozdravleniy.json
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\kalkulyator.json
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\nepravilnye-glagoly.json
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\kirillica-v-latinicu.json

WHAT EACH PAGE HAS:
- pageType gpt-chat, status published, canonical, hreflang pair with x-default set to the Uzbek page, 6 chips in Russian, and 6 FAQ.
- Trial terms ("3 … пробн") in description, ogDescription and heroSubtitle, plus "3 бесплатных пробных … не обновляются" in the body.
- A SoftwareApplication offer: price 0, UZS, "без ежедневного обновления", "AI-пакет".
- The independence clause, honest limits, a "Почему GPTBot.uz" section, and a next step: the AI pack, plus a business service where it fits.
- I avoided "подписк", "лучш", guarantees and model names, and quoted no AI-pack price (the pages say "показаны в чате", as the translator page does).
- Agency prices are copied from their own pages: SMM from 2 490 000 сум/мес (/ru/smm-prodvizhenie-tashkent/); AI-bot from 1 990 000 (/ru/stoimost-chat-bota/ and /ru/ai-bot-dlya-uchebnogo-tsentra/).
- Calculator results in the text were computed with src/tools/calculator/engine.ts. Verb groups only use verbs that are in data.ts (163 verbs, 10-question quiz).
- Uzbek text uses U+2018 for o‘/g‘ and U+2019 for the tutuq; the Python scan found no wrong apostrophes.

| page | role / widgets | title / desc length | body words |
|---|---|---|---|
| greetings | writer, no widget | 53 / 151 | 1068 |
| calculator | teacher, calculator | 55 / 155 | 738 |
| verbs | teacher, irregular-verbs | 52 / 154 | 678 |
| converter | teacher, uz-translit | 52 / 151 | 803 |

- **Greetings samples:** 18 original samples, labelled as written with the AI chat and edited by the team. They cover a man, a woman, a girlfriend, a colleague or boss, mom and dad, "своими словами", one quatrain, two New Year greetings, and two in Uzbek with translation. No cards or images are promised.
- **Converter role:** I chose teacher, not translator. The AI's job on this page is checking Latin spelling and explaining rules (o‘/g‘/’, e/ye, ц). It keeps the converter page away from the translation intent of A8/C47/C48: the page says "converter ≠ translation" and links /ru/russko-uzbekskiy-perevodchik/. It declares none of the translator's keywords.
- **Converter table:** 29 signs with Cyrillic and an example for each. Rules for Ё/Ю/Я, Е→ye, Ц→s/ts, Ъ→’, Щ/Ы. A manual-check section covers ц loanwords, й+о, c/w words, and no Russian transliteration.

TESTS (node --test, one file at a time):
- **Pass:** tool-pages 18/18, translator-pages 13/13, seo-trial-product-truth 7/7, seo-content-guards 8/8, seo-anchor-intent 4/4, seo-intent-manifest 5/5, seo-demand-gate 8/8, seo-cluster-quality 19/19, gpt-chat-honesty 27/27, gpt-chat-prerender-links 14/14, seo-commercial-coverage, seo-indexation-recovery, gsc-indexation-hygiene. toolPageIssues and chatStarterIssues return [] for all 4 pages.
- **Expected fails until the integrator acts:**
  - seo-page-integrity, hreflang test: the counterparts /uz/ai-tabrik-generatori/, /uz/kalkulyator/, /uz/notogri-fellar/ and /uz/kirill-lotin/ do not exist yet.
  - seo-link-graph: the only broken links are those same 4 Uzbek URLs. The only orphan is /ru/generator-pozdravleniy/.
  - homepage-lists-frozen (2 tests): new published pages enter the protected homepage list, so "/" needs a reviewed protected revision, as A8 did.
  - updates-feed: it compares against the old dist/ build.
- **Failures not caused by these pages:** seo-revenue-claims ("table row and summary") and seo-push-revision R3-6/R3-9. Their messages name none of the new pages.

STILL NEEDED FROM THE INTEGRATOR:
- Add the 4 URLs to APPROVED_STATIC_ROUTE_ADDITIONS and to llms.txt / llms-full.txt.
- Optionally add the 4 files to the trialFiles/translatorFiles lists in seo-trial-product-truth; they already comply.
- Add the chat-layout check for pages with chips.
- Make sure the Uzbek pages point their hreflang back with x-default set to themselves.
- Run the build and seo-audit; I did not run vite or the build.

MANIFEST ENTRIES (suggested as pairs in the C48 style: the tool page is the informational side and links /ru/gpt-chat/; commercial side /ru/gpt-chat/):
1. /ru/generator-pozdravleniy/
   - **Owns:** write a greeting now, in the chat (writer role), with original samples.
   - **Primary:** "поздравления с днем рождения".
   - **Secondary:**
     - поздравление с днем рождения мужчине
     - с днем рождения подруге
     - …своими словами
     - …подруге
     - …женщине
     - поздравление с новым годом
     - с днем рождения маме
     - …маме
     - …коллеге
     - …папе
     - с днем рождения поздравления
     - пожелания на день рождения
     - …в прозе
     - …на узбекском языке
     - с днем рождения на узбекском
     - генератор поздравлений (volume not measured)
   - **mustNotTarget:**
     - tug‘ilgan kun tabriklari, tugilgan kun tabriklari, tabriklar, yangi yil tabriklari, tabrik yozish, табриклар (owner /uz/blog/tabrik-yozish/, C51)
     - поздравление с 8 марта, поздравления с 8 марта (future page, research says publish by 01.02)
     - с днем рождения, поздравление (navigational or ambiguous heads)
     - открытки с днем рождения (no images)
     - ии чат, чат гпт онлайн, chatgpt онлайн
   - **gpt-chat mustNotTarget add:** the primary and the top 5 secondaries.
2. /ru/kalkulyator/
   - **Owns:** a free in-browser calculator plus step-by-step AI explanation (teacher).
   - **Primary:** "калькулятор онлайн".
   - **Secondary:** калькулятор, онлайн калькулятор, инженерный калькулятор, научный калькулятор.
   - **mustNotTarget:**
     - калькулятор стоимости telegram-бота, калькулятор стоимости чат-бота (owner /ru/kalkulyator-stoimosti-telegram-bota/, telegram-leads-ru)
     - калькулятор процентов, процентный калькулятор, ндс калькулятор, калькулятор ндс (cluster №39)
     - калькулятор дробей (cluster №9)
     - кредитный калькулятор, ипотечный калькулятор, имт калькулятор (rejected as YMYL)
     - валютный калькулятор (cluster №1, owner decision)
     - calculator, online calculator, scientific calculator, kalkulyator* (suggested owner: /uz/kalkulyator/)
     - ии чат, chatgpt онлайн
3. /ru/nepravilnye-glagoly/
   - **Owns:** a V1–V3 table, quiz and AI teacher for English irregular verbs, for Russian speakers.
   - **Primary:** "неправильные глаголы".
   - **Secondary:** таблица неправильных глаголов, неправильные глаголы английского языка.
   - **Decision for you:** I did not declare the English heads, to keep one owner per keyword. "irregular verbs" appears in the page body only. Suggested owner of irregular verbs, irregular verbs list, list of irregular verbs, irregular verbs table, irregular verbs test, past participle, v1 v2 v3, 3 forms of verbs and noto‘g‘ri fe’llar (jadvali) / notogri fellar is /uz/notogri-fellar/ (x-default). If you prefer the RU page to also declare "irregular verbs" as its hreflang alternate, add it.
   - **mustNotTarget:** the English heads above; present simple, past simple, времена английского языка (cluster №4); английский алфавит (cluster №13); ии чат.
4. /ru/kirillica-v-latinicu/
   - **Owns:** change the script of Uzbek text (not the language), plus the alphabet table and rules (teacher).
   - **Primary:** "кириллица в латиницу".
   - **Secondary:** латиница в кириллицу, перевод с кириллицы на латиницу, с кириллицы на латиницу, перевод с латиницы на кириллицу, с латиницы на кириллицу, узбекский алфавит латиница, узбекская кириллица, узбекский латинский алфавит, перевести на латиницу, конвертер кириллица латиница.
   - **mustNotTarget:**
     - The translator's keywords (C48/A8): переводчик с русского на узбекский, переводчик с русского на узбекский латиница, перевод с русского на узбекский, перевод с узбекского на русский, переводчик с узбекского на русский, русско узбекский переводчик, узбекско русский переводчик, перевод рус узбек, переводчик, tarjimon
     - транслит, транслитерация, транслитерация онлайн (Russian transliteration is not offered)
     - узбекский алфавит, узбекский алфавит кириллица, новый узбекский алфавит (cluster №29 / reform)
     - узбекская латиница кириллица бот (owner /ru/blog/ai-bot-uzbekskiy-yazyk-kak-rabotaet/)
     - lotin krill, lotin kirill, krill lotin, lotin alifbosi, o‘zbek alifbosi (suggested owner: /uz/kirill-lotin/)
   - **Translator pair:** its mustNotTarget could add кириллица в латиницу and латиница в кириллицу.

DEMAND ROWS (Google Ads, location 2860, 2026-10-25; paths relative to docs/seo/research/2026-10-25-clusters-to-add/):
- **Greetings:**
  - From text-tools-data/tt_kw1_metrics.json:
    - поздравления с днем рождения 18 100
    - поздравление с днем рождения мужчине 4 400
    - …своими словами 3 600
    - …подруге 2 400
    - …женщине 1 900
    - поздравление с новым годом 1 900
    - с днем рождения поздравления 880
    - …маме 480
    - …коллеге 320
    - …папе 170
  - From text-tools-data/tt_kw2_metrics.json: …в прозе 320, …на узбекском языке 210.
  - From the ru-audience-ai.json buckets (ru-audience-ai-data/computed.json): с днем рождения подруге 4 400, с днем рождения маме 1 900, пожелания на день рождения 880.
  - From calculators-utility-data/known_all.json: с днем рождения на узбекском 110 (moved to greetings by merge-data/verify.py).
- **Calculator** (calculators-utility-data/cu_kw1_metrics.json): калькулятор 74 000, калькулятор онлайн 3 600, онлайн калькулятор 1 600, инженерный калькулятор 90, научный калькулятор 50.
- **Verbs:**
  - From language-learning-data/ll_kw_metrics.json: неправильные глаголы 1 900, таблица неправильных глаголов 390, irregular verbs 12 100, irregular verbs list 2 900.
  - From ru-audience-ai-data/computed.json: неправильные глаголы английского языка 40.
- **Converter:**
  - From text-tools-data/tt_kw1_metrics.json: кириллица в латиницу 1 300, латиница в кириллицу 480, перевод с кириллицы на латиницу 390, перевод с латиницы на кириллицу 320, узбекский латинский алфавит 70.
  - From text-tools-data/tt_kw2_metrics.json: узбекская кириллица 70.
  - From the ru-audience-ai.json buckets (ru-audience-ai-data/computed.json): с кириллицы на латиницу 320, с латиницы на кириллицу 260, узбекский алфавит латиница 110, перевести на латиницу 50, конвертер кириллица латиница 10.

INBOUND LINKS (from unprotected published pages; anchors are not on any mustNotTarget list):
- **content/pages/ru/gpt-chat-guide.json** — new linkp after block 6 (section "AI-кабинет"), covering all 4 pages: «Для частых задач есть отдельные страницы, где чат уже открыт в нужной роли: {greet}, {calc}, {verbs} и {conv}.»
  - greet → /ru/generator-pozdravleniy/ «генератор поздравлений»
  - calc → /ru/kalkulyator/ «калькулятор с AI-объяснением»
  - verbs → /ru/nepravilnye-glagoly/ «тренажёр неправильных глаголов»
  - conv → /ru/kirillica-v-latinicu/ «конвертер кириллица ↔ латиница»
- **Greetings:**
  - (a) content/pages/ru/promty-gpt-chatgpt-50-primerov.json, after block 21 ("Тексты и копирайтинг"): «Для поздравлений есть отдельный инструмент — {greet}: чат там уже открыт в роли «Автор текстов», а на странице собраны примеры с днём рождения и Новым годом.» anchor «AI-генератор поздравлений».
  - (b) content/pages/ru/gpt-v-marketinge-smm.json, section "GPT для Instagram и Telegram": «Праздничный пост или поздравление клиентов с Новым годом удобно начать в {greet}: там есть готовые запросы и примеры.» anchor «генераторе поздравлений».
- **Calculator:**
  - (a) content/pages/ru/gpt-dlya-ucheby.json, after block 18: «Числа в ответе модели проверяйте сами: для этого есть {calc} — он считает в браузере без лимита, а кнопка «Объяснить с AI» поставит пример в поле чата.» anchor «онлайн-калькулятор с объяснением от AI».
  - (b) content/pages/ru/promty-gpt-chatgpt-50-primerov.json, after block 13: «Ответ на запрос 9 удобно проверить {calc}: он точно посчитает то, что предложила модель.» anchor «калькулятором онлайн».
- **Verbs:**
  - (a) content/pages/ru/gpt-dlya-ucheby.json, after block 22 ("Языки и перевод"): «Для английских неправильных глаголов есть {verbs}: таблица V1–V3, тест на 10 глаголов и AI-учитель на одной странице.» anchor «тренажёр неправильных глаголов».
  - (b) content/pages/ru/promty-gpt-chatgpt-50-primerov.json, after block 24: «Если учите английский, загляните в {verbs}: таблица и тест работают без AI, а упражнения на ваши ошибки даёт чат-учитель.» anchor «таблицу неправильных глаголов».
  - (c, optional) content/pages/ru/ai-bot-dlya-uchebnogo-tsentra.json: «Как AI-учитель объясняет материал ученику, можно посмотреть в нашем {verbs}.» anchor «тренажёре неправильных глаголов».
- **Converter:**
  - (a) content/pages/ru/russko-uzbekskiy-perevodchik.json, after block 10 ("Латиница или кириллица"): «Полная таблица букв и правила для е, ц и ъ — на странице {conv}.» anchor «кириллица в латиницу: таблица и правила».
  - (b) content/blog/ru/ai-bot-uzbekskiy-yazyk-kak-rabotaet.json, after body block 5: «Сменить алфавит своего узбекского текста можно {conv} — бесплатно и без отправки текста на сервер.» anchor «конвертером кириллица ↔ латиница».

# c3

Three Uzbek AI tool pages written; no commit, push or deploy. Intent-manifest, demand-policy, llms and the migration test are not touched.

**FILES** (new, untracked, UTF-8 LF, formatted like the template)
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\kalkulyator.json — /uz/kalkulyator/
  - teacher role, widgets ["calculator"], 6 chips
  - hreflang pair /ru/kalkulyator/, x-default is the UZ page
  - 897 body words, 6 FAQ
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\notogri-fellar.json — /uz/notogri-fellar/
  - teacher role, widgets ["irregular-verbs"], 6 chips
  - hreflang pair /ru/nepravilnye-glagoly/
  - 757 body words, 6 FAQ
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\kirill-lotin.json — /uz/kirill-lotin/
  - teacher role, widgets ["uz-translit"], 6 chips; the first chip is «Matnimdagi imlo xatolarini tekshir»
  - hreflang pair /ru/kirillica-v-latinicu/
  - 989 body words, 6 FAQ, full 29-row Latin↔Cyrillic table

**What every page has**
- Title 56–59 characters; description 153–157 characters.
- Trial terms: "3" plus "sinov" in description, ogDescription and heroSubtitle. The SoftwareApplication offer has price 0 UZS, «yangilanmaydi» and «AI paket».
- Sections: what the tool does, examples of good requests, honest limits, «Nega GPTBot.uz», a uz-Cyrl paragraph, the independence line (not OpenAI or ChatGPT) and a privacy line.
- Soft next step: AI chat tariflari (/ru/tarify-ai-chat/) for B2C. For B2B, /uz/biznes-uchun-ai-bot/ or /uz/oquv-markazi-uchun-ai-bot/, both «1 990 000 so‘mdan», which matches those pages.
- Calculator page: framed as «tushuntirib beradi», with an «O‘qish haqida halol» section that says it does not do homework for the pupil.
- Every calculator example was run through src/tools/calculator/engine.ts and gives the shown result.
- No invented clients, reviews or guarantees.

**CHECKS**
- Python scan of all three files: no ASCII apostrophe between letters, no U+02BB/U+02BC, no o/g followed by U+2019. Starter labels and prompts are within limits, no duplicates; H2s and ids are unique.
- `node --import tsx --test`: all of these pass:

| Test file | Pass |
|---|---|
| tool-pages | 18/18 |
| seo-page-integrity | 17/17 |
| seo-content-guards | 8/8 |
| seo-anchor-intent | 4/4 |
| seo-link-graph | 17/17 |
| seo-intent-manifest | 5/5 |
| seo-demand-gate | 8/8 |
| seo-cluster-quality | 19/19 |
| seo-commercial-claims | 9/9 |
| seo-business-ai-claims | 4/4 |
| seo-provider-facts | 3/3 |
| seo-breadcrumb-ld | 4/4 |
| translator-pages | 13/13 |
| seo-trial-product-truth | 7/7 |
| seo-commercial-coverage | 11/11 |
| seo-analytics-privacy | 23/23 |
| gpt-chat-prerender-links | 14/14 |
| gpt-chat-honesty | 27/27 |
| irregular-verbs | 11/11 |
| seo-recovery-technical | 9/9 |
| seo-indexation-recovery | 6/6 |

- seo-revenue-claims: 6 pass, 1 fail ("free limits on the pricing page"). It reads only the tariffs page, so these pages don't cause it.
- Not run: build, prerender, seo-audit (integrator's job).

---
**(1) /uz/kalkulyator/**

MANIFEST (new pair, placeholder id "C5x-uz-chat-vs-kalkulyator")
- Commercial side /uz/gpt-uzbek-tilida/ mustNotTarget: kalkulyator, onlayn kalkulyator, foiz hisoblash, misol yechish, masala yechish.
- Informational side /uz/kalkulyator/:
  - Owns: calculate now in the browser; the AI teacher explains the solution step by step.
  - Primary: «kalkulyator».
  - Secondary: onlayn kalkulyator, kalkulyator online, kalkulator, kalkulyatr, ilmiy kalkulyator, foiz hisoblash, foizni hisoblash, foiz kalkulyator, misol yechish, masala yechish.
  - mustNotTarget:
    - the chat's keys: chatgpt uzbekcha, chatgpt uzbek tilida, bepul ai chat, sun’iy intellekt chat
    - /ru/kalkulyator/'s keys: калькулятор, калькулятор онлайн, онлайн калькулятор, инженерный калькулятор
    - the studio photo draft /uz/rasmdan-yechim/: rasmdan masala yechish, rasmga olib misol yechish
    - honesty: uyga vazifa
- Decision for you, the integrator: misollar yechish 4 400 and tenglama yechish 1 900 are left unassigned.
  - The roadmap plans a "text solver on the teacher role" for stage 3 (L3-05). If you make that solver this page rather than a new URL, add both here.
  - Otherwise keep them reserved for the solver and add them to this page's mustNotTarget.
- English «calculator» 40 500 is also unassigned; I did not claim it.

DEMAND ROWS (keyword, volume per month, source file)

| Keyword | Volume | Source |
|---|---|---|
| kalkulyator | 40 500 | docs/seo/research/2026-10-25-ad-client-funnel/prices-tools-data/kw1_metrics.json (kw1_table.txt line 1); no monthly series (CLUSTERS_TO_ADD §9.1) |
| kalkulator | 40 500 (lens weight ×0.5) | docs/seo/research/2026-10-25-clusters-to-add/calculators-utility-data/cu_kw1_metrics.json |
| kalkulyatr | 40 500 (lens weight ×0.5; §9.5 calls it implausible for a typo) | same file |
| kalkulyator online | 1 600 | same file |
| onlayn kalkulyator | 390 | same file |
| ilmiy kalkulyator | 50 | same file |
| foiz hisoblash | 720 | docs/seo/research/2026-10-25-clusters-to-add/education-practice-data/ep_kw1_metrics.json |
| foiz kalkulyator | 260 | same file |
| foizni hisoblash | 50 | same file |
| misol yechish | 880 | docs/seo/research/2026-10-24-growth-audit/l3-data/kw1_table.txt line 88 (also roadmap-1000/demand-sizing.json, solver_misol_masala) |
| masala yechish | 880 | same, line 89 |

INBOUND LINKS (sources are unprotected)
- a) content/pages/uz/gpt-chat-qollanma.json, block 6 (linkp). Append: «Bepul vositalar ham bor: {calc}, {verbs} va {kirill} — ular brauzerda ishlaydi, natijani esa AI o‘qituvchiga tushuntirish uchun yuborish mumkin.» calc → /uz/kalkulyator/, anchor «AI tushuntiradigan onlayn kalkulyator».
- b) content/blog/uz/chatgpt-talabalar-uchun.json, block 17 (linkp). Append: «Matematikada hisobni {calc} bilan tekshiring, ingliz tilida esa fe’l shakllarini {verbs}da mashq qiling.» calc anchor «onlayn kalkulyator».
- c) content/pages/uz/suniy-intellekt.json, new linkp after list block 28: «Masalan, {calc} sahifasida misolni hisoblab, yechimini AI’dan bosqichma-bosqich tushuntirib berishni so‘rash mumkin.» Anchor «onlayn kalkulyator».

---
**(2) /uz/notogri-fellar/**

MANIFEST (placeholder id "C5x-uz-chat-vs-notogri-fellar")
- Commercial side /uz/gpt-uzbek-tilida/ mustNotTarget: noto‘g‘ri fe’llar jadvali, noto‘g‘ri fe’llar, irregular verbs, irregular verbs list.
- Informational side /uz/notogri-fellar/:
  - Owns: English irregular verbs table V1–V2–V3 with Uzbek translation, practice and quiz, plus AI teacher drills.
  - Primary: «noto‘g‘ri fe’llar jadvali».
  - Secondary: irregular verbs, irregular verbs list, list of irregular verbs, noto‘g‘ri fe’llar, notogri fellar, ingliz tili noto‘g‘ri fe’llar, irregular verbs table, irregular verbs test, past participle.
  - mustNotTarget:
    - the chat's keys: chatgpt uzbekcha, bepul ai chat
    - the RU page's keys: неправильные глаголы, таблица неправильных глаголов, неправильные глаголы английского языка
    - reserved for the future tenses cluster (CLUSTERS №4): ingliz tili zamonlari, present simple, past simple
- Note: «irregular verbs» (12 100) is the biggest key and is only a secondary, because the page is Uzbek. The RU page does not claim it.

DEMAND ROWS (source: docs/seo/research/2026-10-25-clusters-to-add/language-learning-data/ll_table.txt and ll_kw_metrics.json, unless stated)

| Keyword | Volume | Note |
|---|---|---|
| irregular verbs | 12 100 | |
| irregular verbs list | 2 900 | |
| list of irregular verbs | 2 900 | ll_table2.txt / ll_kw_metrics2.json; same monthly series as «irregular verbs list», so one bucket, not additive |
| noto'g'ri fe'llar jadvali | 2 400 | measured with ASCII apostrophes; the site spelling uses U+2018/U+2019 |
| noto'g'ri fe'llar | 1 000 | |
| notogri fellar | 720 | |
| past participle | 720 | ll_kw_metrics2.json |
| ingliz tili noto'g'ri fe'llar | 170 | |
| irregular verbs table | 170 | |
| irregular verbs test | 110 | |

- Seasonality: peak Oct ×1.4; index in September 2026 ≈ 0.8, a decline the research did not correct for (CLUSTERS_TO_ADD §9.5).

INBOUND LINKS
- a) content/pages/uz/gpt-chat-qollanma.json, block 6: same sentence as in (1)a. verbs → /uz/notogri-fellar/, anchor «noto‘g‘ri fe’llar jadvali va testi».
- b) content/blog/uz/chatgpt-talabalar-uchun.json, block 17: same sentence as in (1)b. verbs anchor «noto‘g‘ri fe’llar jadvali».
- c) content/pages/uz/oquv-markazi-uchun-ai-bot.json, new linkp after list block 18: «Til maktabi o‘quvchilari uchun bepul vosita ham bor: {verbs} — ingliz tilidagi 163 ta fe’l, test va AI o‘qituvchi bilan mashq.» Anchor «ingliz tilidagi noto‘g‘ri fe’llar».

---
**(3) /uz/kirill-lotin/**

The page does not cannibalise the translator:
- Its H1, title and FAQ say it changes the script, not the language.
- It links /uz/rus-ozbek-tarjimon/ with the anchor «rus-o‘zbek AI tarjimoni», which matches none of A8/C47's mustNotTarget phrases.
- It claims no tarjimon/tarjima phrase.

MANIFEST (new pair, placeholder id "C5x-uz-rus-ozbek-tarjimon-vs-kirill-lotin")
- Commercial side /uz/rus-ozbek-tarjimon/ mustNotTarget: kirill lotin, lotin kirill, lotin krill, krill lotin, лотин кирилл, кирилл лотин, lotin alifbosi, o‘zbek alifbosi, лотин алифбоси, kirildan lotinga.
- Informational side /uz/kirill-lotin/ (it links its counterpart):
  - Owns: convert Uzbek text between Cyrillic and Latin, plus the alphabet table and o‘ g‘ ’ rules; the AI teacher proofreads.
  - Primary: «kirill lotin».
  - Secondary: lotin krill, lotin kirill, krill lotin, lotin alifbosi, o‘zbek alifbosi, o‘zbek lotin alifbosi, kirill alifbosi, kirildan lotinga, lotindan kirilga, лотин кирилл, кирилл лотин, лотин алифбоси, ўзбек алифбоси.
  - mustNotTarget:
    - the translator's keys: rus o‘zbek tarjimon, rus uzbek tarjimon, ruschadan o‘zbekchaga tarjima, o‘zbekchadan ruschaga tarjima, русча узбекча таржимон, tarjimon, tarjima
    - /ru/kirillica-v-latinicu/'s keys: кириллица в латиницу, латиница в кириллицу, перевод с кириллицы на латиницу
    - navigational searches for imlo.uz: imlo.uz, imlo uz
- Integrator follow-ups:
  - Move the owners of demand-sizing.json cluster converter_cyr_lat (12 490/mo) from the translator pages to /uz/kirill-lotin/ and /ru/kirillica-v-latinicu/.
  - «kirill lotin tarjimon» 70 and «lotin kirill tarjimon» 70 are left unassigned on purpose, because of the tarjimon fence in A8.

DEMAND ROWS

| Keyword | Volume | Source / note |
|---|---|---|
| lotin krill | 4 400 | docs/seo/research/2026-10-25-clusters-to-add/text-tools-data/table1.txt (tt_kw1_metrics.json) |
| lotin alifbosi | 3 600 | same |
| lotin kirill | 1 900 | same |
| kirill lotin | 1 900 | same file and docs/seo/research/2026-10-24-snippets-translator/translator-market.json line 84; translator-market groups it with «lotin kirill», but the text-tools lens shows different monthly series, so count it once |
| o'zbek alifbosi | 1 600 | tt_kw1 |
| лотин алифбоси | 1 300 | tt_kw1 |
| krill lotin | 1 000 | tt_kw1 |
| kirill alifbosi | 590 | tt_kw1 |
| ўзбек алифбоси | 480 | tt_kw1 |
| лотин кирилл | 6 600 | translator-market.json line 109 |
| кирилл лотин | 3 600 | translator-market.json line 111 |
| kirildan lotinga | 260 | translator-market.json line 92; one bucket with «lotindan kirilga» |
| o‘zbek lotin alifbosi | — | no Ads bucket (null), so unmeasured, not zero |

INBOUND LINKS
- a) content/pages/uz/rus-ozbek-tarjimon.json, block 0 (linkp). Append: «Alifbo jadvali va o‘, g‘, ’ qoidalari alohida sahifada: {kirill}.» Anchor «Kirill-lotin o‘giruvchi va o‘zbek lotin alifbosi». Re-run translator-pages.test.ts after this edit.
- b) content/pages/uz/gpt-chat-qollanma.json, block 4 (linkp, which already mentions the converter). Append: «Faqat yozuvni almashtirish kerak bo‘lsa, {kirill} sahifasini oching.» Anchor «kirill-lotin o‘giruvchi». Alternatively, use the shared block-6 sentence from (1)a with the anchor «kirill-lotin o‘giruvchi».
- c) content/blog/uz/tabrik-yozish.json, new linkp after list block 36: «Tabrikni kirill yozuvida yubormoqchi bo‘lsangiz, tayyor lotin matnni {kirill} bilan bir zumda kirillga o‘giring.» Anchor «kirill-lotin o‘giruvchi».
- Optional: content/pages/uz/suniy-intellekt.json, block 42. Append: «Matnni bir yozuvdan ikkinchisiga {kirill}da o‘girish mumkin.»

---
**OTHER NOTES**
- Sibling agents created other files in the same worktree while I worked: content/pages/ru/{generator-pozdravleniy,kalkulyator,kirillica-v-latinicu,nepravilnye-glagoly}.json and content/pages/uz/{ai-sher-yozish,ai-tabrik-generatori}.json. I did not touch them. My hreflang values match the three RU pages.
- The «29 ta belgi» composition (24 letters + O‘ G‘ + Sh Ch + ’) follows the order and the RU page. I don't know whether the 1995 law lists «ng» as a separate letter combination; please check before publishing. The page avoids the question and only says that ng is written with two letters in both scripts.

# c4

The ad-client funnel work (items 1–6) is done in the working tree, but nothing is committed. I left the commit to the integrator: AGENTS.md wants HANDOFF.md and STATE.json updated in the same commit, and other agents are writing into this worktree at the same time. I also did not run the build or seo-audit, did not touch protected pages, and did not edit intent-manifest.json, demand-policy.json or llms*.txt.

**What needs the integrator before release**
- **Homepage revision.** The protected homepage lists every page's H1 and every article's title. Item 1 changes one H1 and item 2 adds two article titles, so `tests/homepage-lists-frozen` now fails 2/4 (it passes on a clean copy of 5a579414). The other agents' new pages will need the same revision.
- **Rebuild.** Six built-HTML checks fail (5 in gpt-chat-prerender-links, 1 in tool-pages) because `dist/` dates from 15:15 and still holds the old version of `/uz/gpt-telegram-instagram-ideya/`. I checked the page's chips, converter, starter frame and nav without building, and the content check reports no issues.
- **Failures that are not mine.** They also fail on the clean 5a579414 copy: studio-contact 2 (ai-bot-s-crm `#lead-form`, only 149 articles link the card), seo-push-revision R3-6 and R3-9, seo-revenue-claims 1. A third studio-contact failure comes from another agent's untracked `ru/generator-pozdravleniy.json` (no phone link).
- **Telegram currency name.** On 25.10 the Fragment top-up page names the currency "Gram", while the official Telegram Ads guide still says "0,1 Toncoin". I wrote both, dated, with "check before paying"; the "0,1 Toncoin" wording elsewhere on the site may need review later.

**Tests passing:** seo-page-integrity 17, seo-content-guards 8, advertising-seo-content 10, seo-cluster-quality 19, seo-intent-manifest 5, seo-commercial-claims 9, seo-commercial-coverage 11, lead-capture-templates 43, home-resources 4, translator-pages 13, seo-trial-product-truth 7, blog-feed 7, studio-sitemap 8. The apostrophe scan found no problems; all files are UTF-8, CRLF, no BOM, and every internal link target exists.

## Changes

1. **AI reklama matni tool page** — `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\gpt-telegram-instagram-ideya.json` (same URL; the research says retarget rather than create a new page)
   - Now a `gpt-chat` page with `chatRole: smm` and the `uz-translit` converter (the other agent's `/uz/kirill-lotin/` page owns the converter search intent; this page claims no converter keywords).
   - 6 chips: Telegram ad text, Instagram post, Uzum product description (from the three templates), plus 5 headlines, "check against 7 rules" and "Russian version".
   - Text covers: 3 steps, weak vs good requests (marked as made-up examples), 7 original rules, a platform table (Telegram Ads 160 characters and channel/bot links only, checked 25.10), honest limits (text only, no legal advice).
   - CTA «Matn tayyor — reklamani biz yoqamiz» → `/uz/instagram-target-yoqish/#lead-form` (that page renders the form). Also a "why GPTBot.uz" block in Latin, Cyrillic and Russian, the 3-trial terms, phone and e-mail, 7 FAQs.
   - New H1: «Reklama matni yozish: Telegram va Instagram uchun AI generator».
   - RU block — `F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\gpt-v-marketinge-smm.json`: new section «Рекламный текст с AI: 7 правил и запуск» and one FAQ. It tells readers exactly where to click in `/ru/gpt-chat/` (menu «SMM» or «Роль AI» → «SMM-специалист»; «Бизнес» → «Описание товара для Uzum»). It links the UZ tool and the RU Uzum guide, and its CTA goes to `/ru/targetirovannaya-reklama-tashkent/#lead-form`. H1 unchanged.

2. **Uzum seller guides** — `F:\Claude\gptbot-snippets-translator-20261024\content\blog\uz\uzum-marketda-sotuvchi-bolish.json` and `F:\Claude\gptbot-snippets-translator-20261024\content\blog\ru\kak-stat-prodavcom-na-uzum-market.json`, a reciprocal hreflang pair.
   - Facts checked 25.10 on seller.uzum.uz, its manual and Uzum's FBS press release: who can sell (YaTT / MChJ / self-employed) and their documents, 5 registration steps, FBO vs FBS, internal promotion tools.
   - Commission rates are not quoted; the guides link the official tariffs page. Nothing is copied from the manual.
   - UTM tool written as "per uz24.uz (22.05.2026), from 08.06.2026 in the cabinet, check in your cabinet".
   - "Karta bor, sotuv yo‘q" CTA → target page. They state plainly that we do not run Uzum's internal ads or offer store management.
   - The UZ guide prints no currency figures, so it can pass the spoke price rule.

3. **Target page** — `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\instagram-target-yoqish.json`: added «O‘zingiz yoqmoqchimisiz? 7 qadam» (official routes only) with the «ko‘pchilik to‘xtab qoladi» CTA, and «Targetolog xizmati narxi: frilanser, xodim yoki agentlik».
   - Only our own prices (1 990 000 / 1 490 000); freelancer and staff costs are "by agreement".
   - Links the agency/freelancer article, the AI tool and the Uzum guide; 2 new FAQs. H1 and the price table that tests check are unchanged.

4. **Telegram Ads article** — `F:\Claude\gptbot-snippets-translator-20261024\content\blog\ru\telegram-ads-stoimost-i-zapusk-uzbekistan.json`: added section `#poshagovo` (5 steps), common moderation-rejection reasons, a neutral note on crypto regulation (napp.uz, lex.uz; no P2P or informal exchangers), and a CTA to `/ru/telegram-ads-uzbekistan/#lead-form`.
   - Top-up is described as Fragment only. Minimum CPM stays "0,1 Toncoin"; 3 sources added; dateModified 2026-10-25.

5. **Price tables** — `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\boss-digital.json` (`#narxlar`) and `F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\boss-digital.json` (URL `/boss-digital/`, `#ceny`).
   - 8 services, only prices published on their service pages (re-checked); Telegram Ads shown as "no published price".
   - Links to all 8 service pages, a CTA to the page's own `#lead-form`, and one FAQ each.
   - Support prices are left out because of the open 290 000 / 490 000 owner decision.

6. **Website price contradiction** — `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\sayt-yaratish.json`: the second table now shows 2 990 000 / 6 900 000 / 14 900 000 dan and 7 / 14 / 30 kundan, matching the page's own tariff table and the RU site page.
   - I also removed two inclusion claims the tariff doesn't support ("hosting 1 yil", CRM in the shop row). Title and H1 unchanged.

## Manifest proposals

- **Item 1, pair: UZ chat vs tool.** Commercial `/uz/gpt-uzbek-tilida/` must not target: reklama matni yozish, reklama matni, reklama yozish, reklama uchun so‘zlar, telegram reklama matni. Tool `/uz/gpt-telegram-instagram-ideya/` owns primary «reklama matni yozish»; secondaries reklama matni/matnlari, reklama yozish, reklama uchun so‘zlar, telegram reklama matni, instagram post matni, ai/gpt reklama matni, caption generator. It must not target: chatgpt uzbekcha, chatgpt uzbek tilida, bepul ai chat, telegram reklama, telegram reklama narxi, target yoqish, instagram target, smm xizmatlari, mahsulot tavsifi generatori, описание товара для маркетплейса, генератор описания товара, kopirayting. The tool links the chat.
- **Item 1, second pair: Telegram hub vs tool.** `/uz/telegram-reklama/` must not target telegram reklama matni and reklama matni yozish; the tool must not target telegram reklama, telegramda reklama, telegram kanal reklama, telegram reklama narxi.
- **RU marketing page:** keeps «GPT в маркетинге». Optional secondaries «как написать рекламный текст» and «нейросеть для рекламы». Must not target: реклама в телеграм, таргетированная реклама в ташкенте, smm услуги.
- **Item 2, UZ guide:** register as a spoke of target-uz, primary «uzumda savdo qilish». It meets the gates: it links the hub, the hub now links back, no currency figures, Article and breadcrumb schema.
- **Item 2, RU guide:** record as a standalone architecture decision, primary «стать продавцом на узум». It cannot be a digital-paid-media-ru spoke because it doesn't link `/ru/internet-reklama-tashkent/`.
- **Both Uzum guides must not target:**
  - navigational heads as primary: uzum seller, seller uzum uz, uzum seller login, uzum seller kabinet, узум селлер;
  - other brands: uzum business, uzum academy;
  - reserved for future pages: uzum market reklama / реклама товара на uzum, комиссия узум маркет / uzum komissiya, маркетплейсы узбекистана;
  - service intents: target yoqish, таргетированная реклама.
- **Item 3, target-uz:** no new hub keywords; optional secondary «targetolog kerak». «targetolog» stays out as a primary keyword (decision A7).
- **Item 4, telegram-ru:** add `/ru/blog/telegram-ads-stoimost-i-zapusk-uzbekistan/` as a spoke (primary «telegram ads стоимость»; owns cost and do-it-yourself launch, while the hub keeps the turnkey launch). The hub already links it.
  - Suggested keyword split: «telegram ads запустить» → «как запустить telegram ads самостоятельно».
  - Decide which page owns «telegram ads цена»: the article ranks 2.2–3.3 for it, but the hub declares it. I did not change the keywords.
- **Item 5, boss-digital:** no change; it must not claim smm цена, прайс смм, стоимость сайта, sayt yaratish narxi, target yoqish narxi, smm xizmati narxi.
- **Item 6:** none.

## Demand rows

All are Google Ads, location 2860, measured 2026-10-25.

| Item | Keyword (volume, CPC $) | Source |
|---|---|---|
| 1 | reklama matni yozish 210 (0.77) | `docs/seo/research/2026-10-25-ad-client-funnel/prices-tools.md` §2 / `prices-tools.json` |
| 1 | reklama matni 70 (same bucket as reklama matnlari) | same |
| 1 | reklama yozish 70 | same |
| 1 | reklama uchun so‘zlar 20 | same |
| 1 | caption generator 20 | same |
| 2 UZ | uzumda savdo qilish 260 (1.22) | `marketplaces-social-selling.md` §1 + `marketplaces-social-selling-data/kw_metrics_raw.json` |
| 2 UZ | uzum sotuvchi 70 (1.01) | same |
| 2 UZ | uzum market sotuvchi bo‘lish 50 (1.72) | same |
| 2 UZ | uzum market sotuvchi 40 (1.32) | same |
| 2 UZ | uzumda sotuvchi bo‘lish 30 (0.38) | same |
| 2 UZ | uzum market ro‘yxatdan o‘tish 20 | same |
| 2 UZ | uzum seller 74 000 (secondary only) | same |
| 2 UZ | seller uzum uz 12 100 (9.31, secondary only) | same |
| 2 RU | стать продавцом на узум 20 (3.64) | same |
| 2 RU | uzum seller регистрация 30 (1.28) | same |
| 2 RU | uzum market продавец 40 | same |
| 2 RU | продавать на узум 10 (1.35) | same |
| 2 RU | как стать продавцом на узум 10 | same |
| 2 RU | узум селлер 5 400 (3.23, secondary only) | same |
| 3 | targetolog kerak 40 | `AD_CLIENT_FUNNEL.md` §5 row 1 |
| 3 | таргетолог ташкент 40 (1.33) | same |
| 3 | targetolog 170 (recorded, not targeted) | same |
| 4 | телеграм адс 110 (6.03) | `AD_CLIENT_FUNNEL.md` §5 row 2 / `ad-platform-pains.json` / `verify-data/verify_top10.json` |
| 4 | telegram ads узбекистан 40 (2.60) | same |
| 4 | telegram ads platform 20 (3.14) | same |
| 4 | telegram ads стоимость / цена / минимальный бюджет / как запустить / ton, 10 each | same |

«telegram ads» 6 600 stays "not a page target". Items 5 and 6 have no rows.

## Inbound links

**Already added, inside the files I own:**
- target page → tool page and UZ Uzum guide
- RU marketing page → tool page and RU Uzum guide
- tool page ↔ UZ Uzum guide

**Proposed, in files I did not touch (all unprotected):**

| Target | Source file | Sentence | Anchor |
|---|---|---|---|
| Tool page | `content/pages/uz/smm-xizmatlari.json` | «Post va reklama matnining birinchi qoralamasini {x} sahifasida o‘zingiz tayyorlab ko‘ring; sahifani muntazam yuritishni bizga topshiring.» | AI bilan reklama matni yozish |
| Tool page | `content/pages/uz/telegram-reklama.json` | «E’lon matnini 160 belgiga sig‘dirish uchun {x}dan foydalaning.» | reklama matni generatori |
| Tool page | `content/blog/uz/smm-nima.json` | (short sentence) | reklama matni yozish: AI generator |
| UZ Uzum guide | `content/pages/uz/telegram-reklama.json` | «Uzum’dagi kartochkangizga Telegram’dan xaridor olib kelmoqchi bo‘lsangiz, avval {x}ni ko‘ring.» | Uzum’da sotuvchi bo‘lish |
| UZ Uzum guide | `content/pages/uz/dokon-uchun-ai-bot.json` | (short sentence) | Uzum Market sotuvchilari uchun qo‘llanma |
| UZ Uzum guide | `content/blog/uz/internet-dokon-yaratish-narxi-toshkent.json` | (short sentence) | Uzumda savdo qilish: qo‘llanma |
| RU Uzum guide | `content/pages/ru/targetirovannaya-reklama-tashkent.json` | «Продаёте на маркетплейсе? Таргет можно вести на карточку Uzum; с чего начать — в разборе {x}.» | как стать продавцом на Uzum Market |
| RU Uzum guide | `content/pages/ru/ai-bot-dlya-magazina.json` | (short sentence) | продажи на Uzum Market: регистрация и FBO/FBS |
| RU Uzum guide | `content/pages/ru/internet-reklama-tashkent.json` | (short sentence) | гайд продавца Uzum |
| Telegram Ads article `#poshagovo` | `content/blog/ru/telegram-ads-ili-posevy-v-kanalah.json` | (short sentence) | пошаговый запуск Telegram Ads из Узбекистана |
| Target page `#targetolog-narxi` | `content/blog/uz/agentlik-frilanser-yoki-birja-ozbekiston.json` | (short sentence) | targetolog xizmati narxi |
| Target page `#7-qadam` | `/uz/blog/target-reklama-nima/` | only after the R-S1 click-through check (~05–07.11) | — |
| Price tables | `content/pages/uz/biz-haqimizda.json` → `#narxlar`, `content/pages/ru/o-kompanii.json` → `#ceny` | — | — |

**llms.txt:** add the tool page, both Uzum guides, and the price anchors `https://gptbot.uz/uz/boss-digital/#narxlar` and `https://gptbot.uz/boss-digital/#ceny`.

# revUz

I edited the wave's Uzbek text in place. All 10 JSON files still parse, line endings are unchanged and nothing is committed. Two things still need the integrator: a rebuild, and a human Uzbek reader before deploy (point 1 under remaining doubts).

**Checks run**
- The apostrophe scan finds no ASCII apostrophe between letters, no U+02BB/U+02BC and no backticks. It flags 5 spots, all on purpose: three are on the kirill-lotin page, which shows the bare ‘ mark as a teaching example, the fourth is the lone ’ cell in its alphabet table, and the fifth is `FBO’da` (a suffix after an acronym).
- Titles are 54–60 characters and descriptions 151–157 on the wave's new and rewritten pages. All chips are within label ≤40 and prompt ≤400.
- Tests, run one file at a time: seo-content-guards, seo-page-integrity, seo-trial-product-truth, seo-cluster-quality, gpt-chat-honesty, translator-pages, seo-commercial-claims, seo-commercial-coverage, advertising-seo-content, seo-intent-manifest, seo-anchor-intent, blog-feed and calculator-engine all pass. tool-pages fails 1 of 18 (`/uz/gpt-telegram-instagram-ideya/: uz-translit`). That check reads the old `dist/` build and was already failing before my edits.
- eslint on `calculator-block.ts`: 0 errors.

**Fixes by file**
- `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\ai-sher-yozish.json`
  - Three poems reworked (metre stays 7 syllables):
    - Mother poem, last line: «Yo‘limni yoritadi» → «Har qadamda qo‘llaydi». This gives a full -aydi rhyme and drops the "lamp on my path" image already used in poem 1.
    - Snowman poem: the repeated qo‘yib/qo‘ydik is gone; it now ends «Sabzidan burun qilib, / Atrofida o‘ynadik».
    - Friend's birthday poem: davrangga/senga → «uyingga / Baxt yor bo‘lsin o‘zingga».
  - Prose: «nima munosabat» → «qanday munosabat». The metre paragraph now reads «…bo‘g‘inli, kattalar she’rlarida esa … satrlar». «qaysi bayram uchun», and «{smm} doirasida jamoamiz».
  - The awkward limit sentence is replaced with «Aniqlashtirishga berilgan javob ham limitdan bitta javob sifatida hisoblanadi». Same fix in the tabrik and ideya pages.
  - None of the 14 poems looks like a known poem.
- `…\ai-tabrik-generatori.json`
  - heroSubtitle grammar; the wedding chip now ends «ularni qayerdan taniyman».
  - Greetings:
    - «o‘shandan beri sen mening eng yaqin maslahatchimsan»
    - «ishlash — katta omad»
    - «katta ibrat» instead of «saboq»
    - «ishona boshlaganman» instead of the Russian calque «ishonishni boshlaganman»
    - «bir-birimizning yonida»
    - «samimiy salomingiz»
    - «Rafiqamga»
    - «…kuni bilan tabriklaymiz!»
  - Also «yotoqxonada bir xonada», «hurmat bilan, betaraf ohangda», «Ilova o‘rnatish…», and the {sher} sentence.
  - I re-ran the site's converter on the 3 edited samples (Do‘stga, Ustozga, Oilaga) and replaced their Cyrillic versions. Onaga and Otaga already matched.
- `…\kalkulyator.json`
  - Chip renamed «Tenglama yechimini tushuntir», so it doesn't promise to solve homework; «toki…», «tekshirsa bo‘ladigan».
  - «Ketma-ket darajalar», «Qavssiz yozilgan funksiya o‘zidan keyingi songa qo‘llanadi», «natijasini», «tenglamasini».
  - «nazorat ishida qiynalmaysiz», «farzandingizning», «AI chatga…», «siz o‘rningizga yechib berish uchun…».
- `…\notogri-fellar.json`: «yuborishni esa doim o‘zingiz hal qilasiz», «siz o‘rningizga», «o‘quvchilarni kursga yozadigan».
- `…\kirill-lotin.json`
  - «yakka qo‘shtirnoqqa», «O‘ va g‘ harflarini tutuq belgisi bilan yozish xato…», and FAQ 1 rewritten.
  - The site's converter reproduces all 29 table rows and every inline example in both directions (0 mismatches).
- `…\gpt-telegram-instagram-ideya.json`
  - «Telegram posti», «Telegram kanalga post yoz», «Instagram’ga», and «Auditoriya — …» instead of the ambiguous «O‘quvchi».
  - «hech kimga ta’sir qilmaydi», «Birinchi qator diqqatni tortsin», «jadvalga qarang», and the 7-rules paragraph rephrased.
  - Telegram Ads row and FAQ now say «oshmasligi … olib borishi kerak», plus «joylashtirish vaqti», «talablar qo‘yadi» and the Russian-variant chip wording.
  - **Fact fix:** the Cyrillic paragraph told visitors to ask the chat for a Cyrillic answer. The chat's language rule forces Uzbek answers into Latin script, so it now points only to the converter.
- `…\instagram-target-yoqish.json` (new blocks only): «bosish narxini emas…», «kuchlilariga», the freelancer checklist cell («skrinshot emas, kabinetga ko‘rish huquqi bilan», «o‘rnini kim bosadi»), «…shartnomada yozilganmi», «ko‘rsatmaymiz».
- `…\boss-digital.json`: «Instagram va Telegram sahifalarini yuritish», «xizmat sahifalarida», CTA «Narx bo‘yicha savolingiz bormi? Ariza qoldiring». I spot-checked these prices on the SMM, AI-bot, Telegram-bot and SEO pages and they match.
- `…\content\blog\uz\uzum-marketda-sotuvchi-bolish.json`
  - Term changed everywhere to the official «o‘zini o‘zi band qilgan shaxs»; the description was reworded so it stays at 154 characters.
  - The FBO/FBS row now matches its question. Also «jalb qilish rejalashtiriladi», «tovar qaytarishlar», «narx belgilangan», and the scheme-change sentence.
  - **Honesty fix:** the text claimed the chat "does not add" unconfirmed features. It now says the prompt forbids adding them.
- `F:\Claude\gptbot-snippets-translator-20261024\scripts\widgets\calculator-block.ts` (Uzbek copy only)
  - The rules sentence matches the page; «Mavjudlari:», «Nolga bo‘lish mumkin emas.», and a clearer domain error.
  - This is a committed file, so it now shows as modified and the page needs a rebuild.
- `sayt-yaratish.json`, `roles.ts`, `role-labels.ts`, the translit and verbs widget labels: no changes needed.

**Remaining doubts**
1. I'm an AI, not the team. The «AI yordamida yozilgan, jamoa tahriri» label is only true once a native speaker has read the sher and tabrik samples.
2. «har kuni yangilanmaydi» is used site-wide, so I kept it. It suggests the trials might renew on some other schedule, but they never renew; a site-wide switch to «yangilanmaydi» would be clearer.
3. `content/pages/uz/rus-ozbek-tarjimon.json` is out of my scope and still has the old awkward limit sentence.
4. The sher page's Cyrillic links go to `/uz/rus-ozbek-tarjimon/`, not the new `/uz/kirill-lotin/`. Changing that is an intent-manifest decision for you.
5. The "Telegram Ads links only to channels/bots" claim comes from the other agent's 25.10 check; I didn't re-verify it.
6. The ideya page's ogTitle is 63 characters; no test limits it.
7. The writer role's Uzbek instruction says «post matnlari» where the Russian says «подписи». I left it because of the start-bundle size budget.
8. While I worked, another agent changed the instagram-target CTA to «Bu qadamlar murakkab tuyulsa — targetni biz yoqib beramiz». I reviewed it and it's fine. Re-diff before committing, because other agents are still writing into this worktree.

# revRu

I've finished the review and fixed the problems in place. Nothing is committed, pushed or deployed. HEAD is still af0446fe; I didn't touch protected pages, `src/`, `scripts/`, `intent-manifest.json`, `demand-policy.json` or `llms*.txt`.

**What I checked**
- **Prices:** every agency price on my pages and on the UZ funnel pages matches the service pages. That covers target and context ads, SMM, sites, AI-bot, Telegram-bot and SEO, and the boss-digital RU/UZ price tables. The UZ `sayt-yaratish` table now matches its own banner (2 990 000 / 6 900 000 / 14 900 000).
- **Calculator:** all 29 examples on the page give the same result in `src/tools/calculator/engine.ts`. The widget does what the page says: Enter/Esc, comma as decimal point, 10-example history kept only in the tab, the explain-with-AI button and the error messages.
- **Irregular verbs:** I checked all 163 rows in `src/tools/irregular-verbs/data.ts` against standard forms and found no errors. The verb groups, the 10-question quiz, search in both languages and «Потренироваться с AI» all match the page.
- **Converter:** I ran 36 examples through `src/shared/uz-translit.ts`. The ц/е/ъ rules, s’h → сҳ, links and e-mails left alone, the щ/ы warning, c/w words and apostrophe fixing all work as the page says.
- **Telegram Ads:** I checked against the official guide, rules and terms. The facts hold: 160 characters, channel or bot only, 0.1 Toncoin minimum, 1000+ subscriber channels, unspent balance not refundable (terms 4.3), and "Gram" on the platform pages.
- **Uzum:** I confirmed two facts at their sources: the October 2024 FBS press release and the uz24 article of 22.05.2026.
- **File format:** every file is valid UTF-8 JSON with CRLF and no BOM, every internal link target exists, and the apostrophe scan is clean. Titles are 43–60 characters and descriptions 130–158.

**Fixes**
- **Phone and e-mail on the 4 RU tool pages:** `generator-pozdravleniy`, `kalkulyator`, `nepravilnye-glagoly` and `kirillica-v-latinicu` had none, and the studio-contact test requires them on chat pages. Each page's business paragraph now ends with "Чтобы обсудить задачу, позвоните нам или напишите на ceo@gptbot.uz".
- **Greetings page:**
  - Two starter prompts assumed the writer's gender ("пишу я сама", "благодарен"); they are now neutral.
  - The page promised "правильные знаки в o‘ и g‘". It now says the chat is instructed to use them, and that the converter's apostrophe button fixes any mistake.
  - Smaller edits: the quatrain line now reads "как будто в двадцать два", and the sentence about the template example no longer reads backwards.
- **Calculator page:** "там цены из наших тарифов" about the bot calculator was not verified. It now says the calculator shows an estimated cost, timeline and monthly costs. I also smoothed two phrases.
- **Verbs page:** the text said every two-form pair is a British/American variant. That is wrong for borne/born, proved/proven and others, so I rewrote the body paragraph and the FAQ. I also fixed the "AI-чат GPTBot.uz, независимого сервиса" construction (same fix on the converter page) and softened two unproven learning claims.
- **`gpt-v-marketinge-smm`:** "самая частая задача, с которой приходят в AI-чат" was a made-up statistic; it is now "одна из типичных задач". I spelled out the Telegram Ads format: no line breaks, at most one link, ad points to a channel or bot.
- **Telegram Ads article:**
  - The language rule now says the ad must match both the channel it shows in and the channel it leads to.
  - The banned-topics list now follows the official rules.
  - "Мы не советуем" became "Не рекомендуем…; юридических консультаций мы не даём".
  - "чаще всего застревают" became "легко застрять".
- **Uzum article:**
  - "в любом банке страны" became "в банке Узбекистана", because I couldn't confirm "any bank".
  - "добавлениям в корзину" is not in the source; the text now names visits, orders and sales.
  - I added "проверьте в кабинете при регистрации" to the documents list and removed a "чаще всего" statistic claim.
  - I fixed the "руководство…руководства" repetition and cut the ogDescription from 166 to 143 characters.
- **UZ `instagram-target-yoqish`:** the button text "Shu bosqichda ko‘pchilik to‘xtab qoladi" was an unproven claim. It is now "Bu qadamlar murakkab tuyulsa — targetni biz yoqib beramiz".

**Tests (one file at a time):** these pass:
- translator-pages 13
- seo-trial-product-truth 7
- irregular-verbs 11
- seo-content-guards 8
- seo-page-integrity 17
- advertising-seo-content 10
- seo-commercial-claims 9
- seo-cluster-quality 19
- seo-intent-manifest 5
- blog-feed 7
- lead-capture-templates 43
- seo-commercial-coverage 11

Three test files still fail:
- **studio-contact (3 failures):** the RU pages now pass. The phone/e-mail check fails next on three UZ pages that also have no phone or e-mail link: `uz/kalkulyator.json`, `uz/kirill-lotin.json`, `uz/notogri-fellar.json`. The other two failures were already failing before today's work (`ai-bot-s-crm` lead form, and only 149 articles link the contact card).
- **tool-pages (1 failure):** the old `dist/` build; it should pass after a rebuild.
- **seo-revenue-claims (1 failure):** the free limits on the pricing page; it was already failing and has nothing to do with these files.

**Remaining risks**
- **Uzum facts unconfirmed:** I couldn't load seller.uzum.uz (JavaScript site, timed out), so the documents list and statuses rest on the previous agent's check of 25.10.
- **UZ phone/e-mail gap:** the three UZ pages above need phone and e-mail links from whoever owns the UZ text before release.
- **Verb widget text:** the widget intro in `scripts/widgets/irregular-verbs-block.ts` (RU and UZ) still says all other pairs are British/American variants. I didn't edit it because it isn't one of my files.
- **Old UZ length issue:** `uz/instagram-target-yoqish` has a 66-character title and a 159-character description. This was already there before today's work.
- **Not run:** the build, prerender and `seo-audit` are left for the integrator, along with the homepage-lists revision for the new H1s and titles.

Files changed:
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\generator-pozdravleniy.json
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\kalkulyator.json
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\nepravilnye-glagoly.json
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\kirillica-v-latinicu.json
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\gpt-v-marketinge-smm.json
- F:\Claude\gptbot-snippets-translator-20261024\content\blog\ru\telegram-ads-stoimost-i-zapusk-uzbekistan.json
- F:\Claude\gptbot-snippets-translator-20261024\content\blog\ru\kak-stat-prodavcom-na-uzum-market.json
- F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\instagram-target-yoqish.json

# integ

Wave A is committed as `ef51418264033768c2b61a9d1261d55de183a5d0` on `seo/chat-snippets-translator-20261024`. It is not pushed or deployed, and the worktree is clean. One thing blocks deploy: a native Uzbek speaker has not yet read the poems and greetings.

**Resume:** after the restart I found the content agents' files uncommitted and no integrator edits yet. I integrated on top of their files; nothing was redone or reverted.

**New URLs**
- https://gptbot.uz/uz/ai-sher-yozish/
- https://gptbot.uz/uz/ai-tabrik-generatori/
- https://gptbot.uz/ru/generator-pozdravleniy/
- https://gptbot.uz/uz/kalkulyator/
- https://gptbot.uz/ru/kalkulyator/
- https://gptbot.uz/uz/notogri-fellar/
- https://gptbot.uz/ru/nepravilnye-glagoly/
- https://gptbot.uz/uz/kirill-lotin/
- https://gptbot.uz/ru/kirillica-v-latinicu/
- https://gptbot.uz/uz/blog/uzum-marketda-sotuvchi-bolish/
- https://gptbot.uz/ru/blog/kak-stat-prodavcom-na-uzum-market/

**Retargeted (same URL):** https://gptbot.uz/uz/gpt-telegram-instagram-ideya/ now targets «reklama matni yozish» as a chat page with the SMM role, and has a new H1.

**Changed URLs**
- **Protected homepage:** https://gptbot.uz/ — only its page lists change.
- **Funnel sections:** https://gptbot.uz/uz/instagram-target-yoqish/, https://gptbot.uz/ru/gpt-v-marketinge-smm/, https://gptbot.uz/ru/blog/telegram-ads-stoimost-i-zapusk-uzbekistan/
- **Price tables:** https://gptbot.uz/uz/boss-digital/ and https://gptbot.uz/boss-digital/ (the Russian page lives at the root path, not under /ru/).
- **Package table fix:** https://gptbot.uz/uz/sayt-yaratish/ now matches its own title (2 990 000 / 6 900 000 / 14 900 000).
- **Anchor fix:** https://gptbot.uz/ru/razrabotka-telegram-bota-tashkent/ — «калькулятор» became «калькулятор стоимости бота».
- **Inbound links (one paragraph each, so every new page has at least 2 links from older unprotected pages):**
  - https://gptbot.uz/uz/blog/tabrik-yozish/
  - https://gptbot.uz/uz/gpt-chat-qollanma/
  - https://gptbot.uz/uz/blog/chatgpt-talabalar-uchun/
  - https://gptbot.uz/uz/rus-ozbek-tarjimon/
  - https://gptbot.uz/ru/russko-uzbekskiy-perevodchik/
  - https://gptbot.uz/ru/gpt-chat-guide/
  - https://gptbot.uz/ru/gpt-dlya-ucheby/
  - https://gptbot.uz/ru/promty-gpt-chatgpt-50-primerov/
  - https://gptbot.uz/ru/targetirovannaya-reklama-tashkent/
- **llms:** https://gptbot.uz/llms.txt gains 19 lines; llms-full follows automatically.

**Registries**
- **Intent manifest:** 16 new pairs C53–C68. Each tool is paired with its chat, plus:
  - the greeting guide vs the generator (plural vs singular keys);
  - poems vs greetings;
  - the general calculator vs the Telegram-bot cost calculator;
  - the translators vs the converters;
  - the UZ target hub vs the ad-copy tool;
  - both target hubs vs the Uzum guides.

  The Telegram Ads article is now the second spoke of the Russian Telegram cluster. The target-uz cluster note records the new DIY section. A new decision, A9, records the price table as a section on the two Boss Digital pages instead of a new URL.
- **demand-policy.json:** 18 rows measured on 25.10, each with its source file.
- **Routes:** 11 added to `APPROVED_STATIC_ROUTE_ADDITIONS`.

**Fixes I made during integration**
- The Russian greetings page said the samples were written "с помощью AI-чата GPTBot.uz". They were not written in the site's chat, so it now says "для этой страницы с помощью AI".
- The three Uzbek teacher pages (calculator, irregular verbs, converter) had no phone or e-mail link, which the contact test requires on every chat page. Each now has one line with both.
- The test for the site header (R3-10 in `tests/seo-push-revision.test.ts`) now treats every chat tool page like the chats: no site header.

**Protection result**
- Before the new revision, the check failed only on `/` (`internalLinks` and `bodyTextSha256`). After it: "Protected SEO: 10/10 unchanged".
- The new revision is `docs/seo/evidence/2026-10-25-ai-tools/reviewed-protected-pages.json`, chained to the wave-1b revision.
- **Homepage:** links go from 300 to 311. The text differs by 11 new labels and the retargeted H1 only, and the HTML is otherwise byte-identical.
- **Chats:** they differ only by the chat script name (`gpt-chat-qKkuHbSa.js` → `gpt-chat-cfOqBGh8.js`), which comes from the platform commit af0446fe. The generator puts the old name back and checks the old hash.
- **Articles:** the seven protected articles are byte-identical.
- The generator is `docs/seo/implementation/2026-10-25-ai-tools/review-candidate.ts`; the baseline in `scripts/seo-protection.ts` now points at the new revision, and a test was added to `tests/seo-protection.test.ts`.

**Tests vs baseline**
- 61 test files run one by one: no new failures. The only failures are the ones already listed in the previous handoff:
  - gpt-chat «chat first screen», gpt-chat-business-line and gpt-chat-rev-design §5.3;
  - seo-push-revision R3-6 and R3-9;
  - react-router-v8-migration ×3 (route counts; the gaps stay at 42 and 38, as before);
  - seo-revenue-claims «free limits on the pricing page»;
  - studio-contact ×2 (the ai-bot-s-crm form link, «only 149 articles»).
- seo-protection 15/15, homepage-lists-frozen 4/4, seo-intent-manifest 5/5, seo-anchor-intent 4/4, seo-cluster-quality 19/19, tool-pages 18/18.
- `npm run build:fast` exit 0 (316 sitemap entries; the shared stylesheet is still `index-B7Z1XlOc.css`).
- `tsc -b` and `typecheck:functions` 0; eslint on the changed TS files 0; seo-audit reports no critical issues.
- `scan:secrets` finds only the old `tests/telegram-assistant.test.ts:639`.
- The Uzbek apostrophe scan is clean; the only hit is the acronym suffix FBO’da.

**Not done**
- **Release gate:** a native Uzbek speaker must read the 14 poems and the Uzbek greetings before deploy. Until then the «jamoa tahriri» label is not true; only the AI reviewers have read them.
- No production build, deploy, IndexNow or URL Inspection; no push.
- **Calculator search results:** nobody has looked at the search results from Uzbekistan yet; Google may show its own calculator box above them. Check once before reading results.
- No links from the protected chats to the new tools; that needs its own reviewed revision after the chats' 28-day window (around 21–25.11).
- `scripts/chat-layout-check.mjs` was not run for the new pages (it needs a browser).
- **Telegram Ads currency:** Fragment's top-up page now says «Gram», while other pages on the site still say «0,1 Toncoin» and may need a later review.

I updated `docs/seo/CHANGE_LOG_2026-10.md` (section «AI-инструменты, волна A 25.10»), rewrote `docs/agents-platform/HANDOFF.md`, and added the `seo_ai_tools_wave_a_20261025` block (committed_not_deployed) to `docs/agents-platform/STATE.json`.

Files are in F:\Claude\gptbot-snippets-translator-20261024:
- content\seo\intent-manifest.json
- content\seo\demand-policy.json
- docs\seo\evidence\2026-10-25-ai-tools\reviewed-protected-pages.json
- docs\seo\implementation\2026-10-25-ai-tools\review-candidate.ts
- docs\agents-platform\HANDOFF.md