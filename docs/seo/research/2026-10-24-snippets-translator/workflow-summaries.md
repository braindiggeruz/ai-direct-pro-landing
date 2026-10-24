

# snippetData

Snippet evidence for /ru/gpt-chat/ and /uz/gpt-uzbek-tilida/ is written; the RU page's CTR drop is mostly an impressions effect, while the UZ page actually lost clicks.
Files: F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research\2026-10-24-snippets-translator\snippet-data.md (Russian) and snippet-data.json (top-60 rows per window, daily series, timeline, SERP). Nothing was deployed, pushed or edited outside that folder.
1. 28 days (24.09–21.10): RU 280 clicks / 94 001 impr / CTR 0.30% / pos 6.9; UZ 489 / 74 002 / 0.66% / 6.7. Uzbekistan only: RU 0.335%, UZ 0.54%.
2. RU by window: before R-S1 (21.09–04.10) 125 / 13 698 / 0.91% → R-S1, 05–07.10 0.225% → after 08.10 (09–21.10) 0.245%. Clicks/day went 8.8 → 14.7 → 10.7, so clicks did not fall.
3. UZ by window: 262 / 27 641 / 0.95% → 0.725% → 0.46%. Clicks/day went 24.8 (01–04.10) → 30.3 → 12.5, so this page really lost clicks.
4. What drives RU impressions: misspellings of "ChatGPT" (чачи/чати пити, джипити and similar) are 76.4% of top-60 impressions at CTR 0.155%. «чачи пити» alone is 33 732 impressions (35.9% of the page) at CTR 0.06%, and only 16.8% of them come from Uzbekistan.
5. RU geography: Kyrgyzstan + Kazakhstan + Tajikistan are 51.6% of impressions at CTR 0.10% and gave 49 of the 280 clicks. Before R-S1, 89.3% of the page's impressions came from Uzbekistan.
6. R-S1 also changed the RU page body: it added «чачи пити» ×2, «чати пити» ×1 and «джипити» ×4, and removed all 5 «в Узбекистане». «чачи пити» went from absent to 8 209 impressions in 3 days.
7. What drives UZ impressions: login-type queries are 62.6%. «chatgpt kirish» alone is 53.0% of the page at CTR 0.40%, and in the live SERP all 10 of its top results are chatgpt.com / openai login pages.
8. The UZ page lost its best-converting queries (Uzbek-language ones such as «chatgpt uzbekcha», CTR 1.2–1.4%). Queries containing "uzbek" fell from 7 988 impr at CTR 1.18% (21.09–04.10) to 701 at 0.43% (09–21.10). The daily drop starts 05.10, and the 06.10 title (the one now live) did not bring them back.
9. Low-CTR queries took a bigger share on the UZ page: «chatgpt yozish» went from 280 to 6 178 impr (CTR 0.32%) and «chatgpt kirish» from 44.9% to 55.2% of impressions.
10. Hypothesis 1, the R-S1 title + body change: strong on the RU page, mostly by bringing in non-Uzbek traffic. In Uzbekistan alone RU CTR still fell 0.46% → 0.31%; «chatgpt kirish» 0.38% → 0.11%; «chatgpt bepul» 0.97% → 0.64% while position slipped 5.4 → 6.3.
11. Hypothesis 2, the 08.10 description ("3 free replies, then AI pack"): not visible on RU (0.225% → 0.245%). On UZ it is plausible but unproven: Uzbekistan CTR 0.59% → 0.40%, but position also slipped 6.57 → 6.91, the 08.10 recrawl request hit the daily quota so the recrawl is not confirmed, and the comparison window is only 3 days.
12. Hypothesis 3, query mix and geography: the main cause on RU. Queries without misspellings went 0.61% → 0.48%, while misspellings went from 8.9% to 82.2% of impressions.
13. Snippet timeline (live dates, not commit dates): RU and UZ titles from 18.09 → R-S1 05.10 (recrawl 08:22 UTC) → current UZ title live 06.10 → description change live 08.10 ~13:56 UTC. Uzbekistan CTR per period: RU 0.75 / 0.46 / 0.31 / 0.29%; UZ 0.72 / 0.95 / 0.59 / 0.40%.
14. SERP, Uzbekistan, mobile (mobile is 71% of RU and 87% of UZ impressions): we do not appear in the top 12–16 for «chatgpt kirish», «chatgpt uzbekcha», «чат гпт онлайн», «чачи пити» or «чат gpt бесплатно». This is one snapshot from one crawler; Search Console averages are positions 5.4–7.5.
15. For «chat gpt o‘zbek tilida» the RU page ranks #6 with its Russian title. Google wrote that snippet from page text, not from our meta description, and the UZ page does not appear in the top 20.
16. Competitor snippets use: free/bepul, no registration, «Uzbek tilida» in the title, model names and years (GPT-4/5, 2025/2026), spoken spellings («Чат Жипити»). None of the Russian-language competitors offers «на русском и узбекском».
17. Requirements for both pages: title 50–58 characters (max 60) with the key phrase in the first ~40; description 140–158 (current RU 49/147, UZ 52/140). Promise only "3 free replies, no registration, in the browser, RU+UZ, independent service".
18. Do not promise: "free" without the number, unlimited, «Kunlik limit» (untrue since 08.10), being the official ChatGPT login, or GPT-4/5 (the chat runs on Z.ai glm-5.3-flash per wrangler.toml). Keep "tarjima/перевод" out of the chat snippets so they don't compete with the translator page («chatgpt tarjima»: 236 impr on the UZ page).
19. RU, your decision: target Uzbekistan by bringing back «Узбекистан» (costs some of the 17.5% of clicks from Kyrgyzstan/Kazakhstan/Tajikistan), or keep all of the CIS at about 0.1% CTR. Either way, lead with «онлайн / без регистрации» and «на русском и узбекском» rather than the bare «чачи пити».
20. UZ: put «ChatGPT uzbekcha / o‘zbek tilida» first in the title — the title used before R-S1 ran at 0.72–0.95% CTR in Uzbekistan. Answer «chatgpt kirish» honestly with «ro‘yxatsiz/akkauntsiz yozing»; use «yozing» to match «chatgpt yozish». Uzbek text uses U+2018 for o‘/g‘.
21. UZ, your decision: keep «keyin AI paket» in the description for full transparency, or move that condition to the page. The data does not settle this.
22. OpenSEO credits: 25 026 before, 24 243 after. I made one paid call (6 keywords, about 30 credits by the tool's pricing); I can't tell from here who used the rest — other sessions share the account.
23. Measure the new snippets over 28 days from a confirmed recrawl, reading Uzbekistan-only CTR, clicks/day and query-group shares separately.

# translatorMarket

1. Paid calls: 3 of 3 keyword calls (get_keyword_metrics ×2, research_keywords ×1 with 5 seeds) and 1 of 5 SERP calls (5 queries, depth 20). Credits went from 25 026 to 24 273, so 753 spent. Location 2860 comes from Google Ads data, so KD and intent are null for every keyword.
2. Main RU demand: «перевод/переводчик с русского на узбекский» 90 500 (one shared bucket, do not add them), «перевод с узбекского на русский» 60 500, «переводчик с узбекского на русский» 49 500, «узбекско русский переводчик» 27 100, «русско узбекский переводчик» 22 200. Competition is 0 and CPC is 0.19–0.37 USD.
3. Main UZ Latin demand: «rus uzbek tarjimon» 12 100 (same bucket as «uzbek rus tarjimon»), «rus ozbek tarjimon» 1 300, «tarjimon rus uzbek» 1 000, «ruschadan o‘zbekchaga tarjima» 480. Spellings with an apostrophe (rus o‘zbek tarjimon, rus tilidan o‘zbek tiliga tarjima…) returned no volume, which means no Google Ads bucket rather than zero demand.
4. UZ Cyrillic: «таржимон» 60 500, «русча узбекча таржима» 6 600, «узбекча русча таржима» 4 400, «русча узбекча таржимон» 2 900. «tarjimon» (1 220 000) and «таржимон» are people looking for Google or Yandex by name, so they are not realistic targets.
5. Almost nobody adds "AI" to the search: «ai tarjimon» 90, «ai переводчик» 90, «chatgpt tarjimon» 390. Latin↔Cyrillic conversion is its own cheap intent: «лотин кирилл» 6 600, «кирилл лотин» 3 600, «kirill lotin» 1 900.
6. There is demand for photo and voice translation («google tarjimon rasm orqali» 27 100, «…по фото» 2 900), but the chat cannot take images. `functions/api/gpt/chat.ts` has no image handling, so the page must not claim it.
7. SERP: an AI Overview appears on all 5 queries (rank 1 on 3). Google Translate is in the top 10 on all 5 and #1 on 3. The tool did not report a separate Google Translate box, so whether one takes clicks needs a manual check.
8. «перевод с русского на узбекский»: smaller independent sites hold 3 top-10 spots: tilmoch.ai/ru/ #2, sinonim.org/perevod_ru_uz #6, sahifa.tj/russko_uzbekskij.aspx #8.
9. «переводчик с узбекского на русский» is the most open result page: gosuslugi.uz #1, then 4 smaller independent sites: sahifa.tj #2, translation2.paralink.com #4, aibro.io/uzbek-russian/ #5 (pitched as "ИИ онлайн / чат GPT", same angle as ours) and from-to.uz/ru #8. Yandex ranks a Chinese–Russian page at #6.
10. «rus tilidan o‘zbek tiliga tarjima» is the weakest result page: 4 Play Store apps and 4 Instagram reels, and no Uzbek-language web tool apart from Google.
11. Almost every top-10 result is a tool page, the rest are dictionaries or apps, and there are no articles. Titles follow «Переводчик с русского на узбекский + онлайн/бесплатно/точный».
12. Search Console (last 3 months): gptbot.uz gets no impressions for RU↔UZ translator queries. Only the «chatgpt tarjima/tarjimon» family shows up: 853 impressions and 8 clicks, 836 of them on /uz/gpt-uzbek-tilida/ («chatgpt tarjima» 698 impressions, position 6.3). The intent-manifest already gives that family to the UZ chat (C6), so the new page must not target it.
13. Product limits confirmed in the code: FREE_TRIAL_LIMIT = 3 (trial-store.ts:2); the AI pack is 300 replies a month for 20 000 сум (gpt-chat.json:16); input is capped at 3 000 characters by default (config.ts:177, not overridden in wrangler.toml).
14. Why that hurts a translator page: every competitor snippet says «бесплатно». With 3 replies for life, a user hits the paywall after 3 translations and also uses up the chat trial.
15. Owner options:
    - A: a separate free translation quota, like the PPTX mode's separate limits.
    - B: short texts free, long texts go to the AI pack.
    - C: "AI-перевод с объяснением" that opens the chat, with the 3-reply terms stated honestly.
    - D: a free Latin↔Cyrillic converter that runs in the browser with no model call.
    - E: the Telegram bot. The config shows 10 free replies a day and 100 a month, but I have not checked that it is live or translates.
16. Recommendation: launch in mode C together with the D converter, and ask the owner to choose A or B for a dedicated quota.
17. URLs: RU `/ru/russko-uzbekskiy-perevodchik/` (alternative `/ru/perevodchik-s-russkogo-na-uzbekskiy/`) and UZ `/uz/rus-ozbek-tarjimon/`, linked both ways with hreflang. x-default points to UZ, as in the gpt-chat pair.
18. Main keywords: RU «переводчик с русского на узбекский»; UZ «rus o‘zbek tarjimon», with a Cyrillic block «Русча-ўзбекча таржимон».
19. RU title: «Переводчик с русского на узбекский и обратно — AI онлайн» (56 characters). H1: «Русско-узбекский AI-переводчик: перевод с пояснениями».
20. UZ title: «Rus-o‘zbek tarjimon onlayn — AI tarjima, lotin va kirill» (56 characters). H1: «Ruscha-o‘zbekcha AI tarjimon: izohli tarjima».
21. Descriptions come in two versions, one if A/B is chosen and one for mode C (142–153 characters). Both say the service is independent and not OpenAI, use U+2018 in Uzbek text, and make no claims about quality.
22. Page outline:
    - The tool block comes first: direction, Latin or Cyrillic output, formal or informal style (Siz/sen, вы/ты), an "explain tricky words" option, and a converter tab.
    - Then: how to translate in 3 steps, 3–4 examples checked by a native speaker, Latin vs Cyrillic, how it differs from Google, when you need a human translator, an FAQ with at least 4 questions, and calls to action into the chat.
23. Repo checks to pass when building it: record the volumes in demand-policy.json, add a cluster to intent-manifest.json with the chatgpt tarjima family excluded, no Offer/Review/AggregateRating, no ASCII apostrophes in Uzbek text, and no orphan page.
24. Nothing was deployed, pushed or edited outside the research folder. Every figure in the files comes from the tool calls above or a cited repo file.
25. Files:
    - F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research\2026-10-24-snippets-translator\translator-market.md
    - F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research\2026-10-24-snippets-translator\translator-market.json

# repoMap

I wrote the implementation map to `F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research\2026-10-24-snippets-translator\implementation-map.md`. Nothing else was edited, built, pushed or deployed. One thing blocks advertising the translator: the native-speaker blind check of translation quality (score of 4/5 or better) has never been run.

**Blockers and gates**
- **Translation gate is open.** The roadmap says the chat must not advertise translation until that check passes, and `tests/gpt-chat-prerender-links.test.ts:229-238` enforces it. The only translation scores in the repo are the agent's own on the old model `glm-4.7-flash` (`docs/paid-chat/eval/zai-check-2026-10-03-free.md`: UZ→RU 5/5/5, RU→UZ 4/4/5). The production model `glm-5.3-flash` has no translation scores.
- **Pre-existing test failures**, which I ran on `c0da2ecb`: `tests/seo-push-revision.test.ts` R3-6 and R3-9, and 4 of 26 in `tests/react-router-v8-migration.test.ts` (route baseline 297 vs 259). These are not caused by this work.
- **Deploy runner path.** `F:\Claude\gptbot-tools\deploy_runner.py` defaults to another checkout, so `DR_ROOT` must point at this worktree. Its `check` runs `release:pages:check` (protection gate, chat bundle budget, live gates, clean runtime, stamped artifact, production lineage).

**(A) New title and description on both chat pages**
1. In `content/pages/ru/gpt-chat.json` and `content/pages/uz/gpt-uzbek-tilida.json`, change only `title`, `ogTitle`, `description` and `ogDescription`.
2. Leave `updatedAt` and `lastReviewedAt` alone. The page shows that date as visible text, so bumping it also changes the protected body fingerprint.
3. The descriptions must still mention 3 trial replies (`3` plus «sinov»/«пробн»), per `tests/seo-trial-product-truth.test.ts`.
4. Run `npm run build:fast`, then `npx tsx scripts/seo-protection.ts check`. It must fail on exactly four lines: title and description of each chat. Anything else is an unintended change.
5. Generate the comparison by copying `docs/seo/implementation/2026-10-08-recovery/review-candidate.ts`. No reusable generator is committed; the 10-23 revision was assembled by hand.
6. Write a new `docs/seo/evidence/2026-10-24-chat-snippets/reviewed-protected-pages.json`. `reviewedChanges` lists both chats with fields `['description','title']`, and the 10 pages go in `PROTECTED_PATHS` order. `previousRevisionSha256` must be the hash with line endings normalised to LF: `3015dede49cbd454cb1c2ba63d383dbf915c002e587962fb2060d65a777ffed6`. A plain `sha256sum` on this Windows checkout gives a different, wrong value.
7. Point `BASELINE` in `scripts/seo-protection.ts:135` at the new file.
8. Fix the tests that read the current UZ title from the content file:
   - `tests/seo-protection.test.ts:239-241` will fail.
   - `tests/seo-push-revision.test.ts:170` is already failing.
   - Re-pin both against the old evidence file, then add a test for the new revision.

**(B) RU and UZ translator pages**
- **The chat can already translate.** A `translator` role exists (`src/gpt-chat/roles.ts`) and the send path handles it. What's missing is a way for a page to preselect it: the role defaults to `general` (`AiChatConsole.tsx:148`), and only presentation mode can be chosen by URL.
- **Minimal change, front end only, protected chats unchanged:**
  - Add `chatRole?: 'translator'` to the `Page` type.
  - In `scripts/prerender.ts:481`, emit `data-chat-role` and `data-alt-href` only when that field is set.
  - Read them in `main.tsx` against an allowlist, and start the role state from them.
  - Point the language-switch links at the paired translator page.
  - Translator-specific starter buttons only after the blind check passes.
- **Backend:** no change needed. `/api/gpt/chat` has no mode or system-prompt field; the role instruction travels inside the message. AGENTS.md §5 requires an injection shield (user text treated as data) that the current role lacks. I recommend adding it in a separate commit as an optional `mode:'translate'` field, which leaves the normal chat path byte-identical.
- **Trial limit:** shared. The same endpoint and host-wide cookie mean translator replies use the same 3 lifetime trial replies, then the AI pack (`trial-store.ts`, `chat.ts:270-300`). The page copy must say so. After paying or logging in, visitors land on the main chat, not the translator page.
- **Pages:** copy the chat JSON files as `status: "draft"` with `pageType: "gpt-chat"`, at least 4 FAQ entries, phone and e-mail links, and an architecture-decision entry in the intent manifest. Take at least 2 inbound links from unprotected pages and none from the download guide. Publishing adds both pages to the protected homepage list, so it needs its own revision for `/`. Ship (A) first, then (B), so the chats' CTR read covers a single change.

**(C) Verification order:** the full PowerShell sequence is section C of the map. It runs typecheck, targeted tests, `seo-audit`, `build:fast`, `seo-protection check`, the build-dependent tests and the chat layout check. Then commit, `build:production`, and `deploy_runner.py check` with `DR_ROOT` set. Deploy only on your explicit command.

The brief quotes the RU description slightly differently from the file; the map uses the file's text («3 бесплатных пробных ответа без регистрации»).

# drafts

Both recommended snippets are within the limits, and all 6 variants pass the checks. Counts come from Python `len()`, which counts Unicode code points, so U+2018 counts as 1. Nothing was deployed, pushed, or edited outside the research folder. No paid OpenSEO calls were made. I made 5 free GSC calls, mainly to check queries containing «аналог», «узбекистан», «без регистрации» and «uzbekcha».

**RU `/ru/gpt-chat/` — variant RU-A**
- Title (53): `Аналог ChatGPT онлайн в Узбекистане — без регистрации`
- Description (157): `ИИ-чат на русском и узбекском в браузере, без установки: 3 бесплатных пробных ответа, затем AI-пакет. GPTBot.uz — независимый сервис, не OpenAI и не ChatGPT.`

**UZ `/uz/gpt-uzbek-tilida/` — variant UZ-A**
- Title (57): `ChatGPT uzbekcha muqobili — bepul kirish, ro‘yxatsiz chat`
- Description (155): `O‘zbekcha yozing: matn, reja va g‘oyalar brauzerda, ilovasiz. Ro‘yxatsiz 3 ta bepul sinov javobi, keyin AI paket. GPTBot.uz — mustaqil servis, OpenAI emas.`

**Rationale**
1. RU, Uzbekistan only, 28 days: the "online / free / no registration", "download" and "language" queries are 31.4% of impressions but bring 81 of 118 clicks. Misspellings (35.8% at 0.14% CTR) and login queries (30.5% at 0.16%) are deliberately not targeted.
2. "в Узбекистане" is the only title element that moves with Uzbekistan CTR. With it the RU page had 0.66/0.75/0.46%, without it 0.31/0.29%. After R-S1 removed it, impressions outside Uzbekistan went from 421 in 4 days to 12 419 in 3 days.
3. "без регистрации" matches the highest-CTR RU query: «чат gpt онлайн без регистрации», 378 impressions at 3.70% CTR even at position 9.0. "Аналог" stays only for honesty; queries containing it had 17 impressions in 28 days.
4. The RU description opens with «на русском и узбекском», which no Russian competitor in the 24.10 SERP offers. «в браузере, без установки» is an honest answer to «chatgpt uzbekcha скачать» (2 044 impressions, 1.13% CTR).
5. UZ-A keeps the title shape from the page's best periods (P1/P2, Uzbekistan CTR 0.72% and 0.95%), adds «muqobili» for honesty, and fits in 57 characters; the old P1 title was 64.
6. «ChatGPT uzbekcha» is in the first 16 characters. Queries containing «uzbekcha» get 1.88% CTR on the UZ page.
7. «bepul kirish» keeps the "kirish" match for login queries, which are 62.2% of UZ impressions and 182 of 363 clicks. «yozing» covers «chatgpt yozish» (7 066 impressions), and «ilovasiz» covers «yuklab olish».
8. Both descriptions keep "3" with «пробн»/«sinov», the AI pack, and the exact independence clause. They contain no «официальн/rasmiy», GPT-4/5, «перевод/tarjima» (reserved for the translator page) or misspelling bait.
9. Success criterion, measured over 28 days from a recrawl confirmed with URL Inspection, against the 09.10–21.10 Uzbekistan baseline:
   - **RU:** CTR at least 0.40% (baseline 0.286%) and at least 5.0 clicks/day (baseline 4.3). As a guard, total clicks/day across all countries should stay at or above 9.6 (baseline 10.7).
   - **UZ:** CTR at least 0.55% (baseline 0.398%) and at least 12.0 clicks/day (baseline 10.2).
   - The CTR read only counts if the average position stays within ±0.5 of baseline.
10. Rollback, page by page, restoring the current strings verbatim:
    - At day 14, roll back if CTR is below 80% of baseline (RU under 0.23%, UZ under 0.32%) and clicks/day are below baseline.
    - At any time, roll back if Uzbekistan impressions/day drop more than 40% and position worsens by more than 1.0 for 7 days in a row.

**Caveats**
- The 10-23 release already changed the UZ page body, so the UZ result will mix two changes.
- The RU page body still contains the R-S1 misspellings, so the title alone won't remove the «чачи пити» impressions. That is why the target is Uzbekistan CTR, not total CTR.
- Google may rewrite either snippet. On 24.10 it already used page text instead of our description for one query.
- The thresholds in point 9 are my choice, anchored to past periods. They are not data.

**Decisions for you**
- **RU audience:** RU-A trades some Kyrgyzstan/Kazakhstan/Tajikistan clicks (about 2.6 a day) for Uzbekistan CTR. If you want to keep the whole CIS audience, use RU-B instead: «Аналог ChatGPT онлайн на русском и узбекском | GPTBot.uz».
- **Mentioning the AI pack in the UZ description:** UZ-C drops the AI pack mention from the description and only says «Jami 3 ta … sinov javobi». I don't recommend it, because the 08.10 decision was to show the pack and there's no proof that mentioning it hurt CTR.

Files are in `F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research\2026-10-24-snippets-translator\`:
- snippet-drafts.md
- snippet-drafts-count.py
- snippet-drafts-count.jsonl