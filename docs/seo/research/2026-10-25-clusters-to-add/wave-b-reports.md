# quiz

Commit `205461eb` on `seo/chat-snippets-translator-20261024` adds the practice-quiz widget. It is not pushed and not deployed. All requested checks pass, and the schema.org `Quiz` JSON-LD went in, because the repo's `@graph` builder took it as one extra line.

**What a content page declares** (it must be a gpt-chat page with a `chatRole`):
```json
{
  "pageType": "gpt-chat",
  "chatRole": "teacher",
  "chatStarters": [ ... optional, as before ... ],
  "widgets": ["practice-quiz"],
  "quizSet": "uz-informatika"
}
```
- `widgets` must list `"practice-quiz"` and `quizSet` must be present; the build refuses either one alone. It can sit alongside other widgets, e.g. `["practice-quiz", "calculator"]`.
- The build also refuses a page if its set:
  - is not registered;
  - has a `locale` different from the page's;
  - breaks any set rule;
  - has a question whose chat request would be over 1500 characters.

**Data-module format.** One file per set in `src/tools/quiz/sets/<id>.ts`, registered in `src/tools/quiz/sets/index.ts`:
```ts
import type { QuizSet } from '../set';

export const uzInformatika: QuizSet = {
  id: 'uz-informatika',            // [a-z0-9-], ≤ 40; this is Page.quizSet
  locale: 'uz',                    // 'ru' | 'uz', must equal the page's locale
  subject: 'Informatika',          // ≤ 60
  title: 'Informatika bo‘yicha mashq testi',   // the widget's h2, ≤ 120
  questions: [
    {
      id: 'inf-7-01',              // unique in the set, [a-z0-9-], ≤ 40
      grade: 7,                    // optional, whole number 1–11
      topic: 'Axborot birliklari', // ≤ 60, one line
      q: '1 bayt necha bitga teng?',                 // ≤ 600, line breaks allowed
      options: ['4', '8', '16', '1024'],             // exactly 4, all different, one line, ≤ 200 each
      answer: 1,                                     // index of the correct option, 0–3
      explanation: 'Bayt 8 bitdan iborat. 1024 — kilobaytdagi baytlar soni.', // ≤ 1200
    },
  ],
};
```
```ts
// src/tools/quiz/sets/index.ts
import { uzInformatika } from './uz-informatika';
export const QUIZ_SETS: readonly QuizSet[] = [uzInformatika];
```
- Up to 120 questions per set, no unknown fields, and no duplicate question text.
- Markup in the text is allowed and printed escaped, so a question can be about an HTML tag. The only text refused is `</script` or `<!--`, because it would break the JSON-LD.

**What the page gets:**
- **Without JavaScript:** every question with its four options, and the answer and explanation inside a native `<details>`. The intro says the questions were written for the page and are neither official exam material nor real test answers.
- **With JavaScript:**
  - A pick is checked at once and only the first pick counts.
  - The explanation opens, the score updates, and the visitor can narrow by grade and topic or restart.
  - Each question gets an «AI bilan tushuntirish / Объяснить с AI» button. It puts the question, the four options, and (after a pick) the visitor's pick plus the page's answer into the chat box through `gptbot:prefill`. It never sends, and the widget makes no requests or model calls.
- The widget script is its own Vite entry, 1.7 kB compressed, loaded only on pages that list it.

**Other changes:**
- **Tailwind:** Tailwind no longer scans `src/tools/quiz/sets/**`, so words in the questions can't rename the shared stylesheet. I tested this with a probe file, and its words produced no new CSS when placed in that folder.
- **Repo docs:** following `AGENTS.md`, I rewrote `HANDOFF.md` for this stage, added a `practice_quiz_widget_20261025` block to `STATE.json`, and added decision D-PRACTICE-QUIZ-20261025. In `STATE.json` I also replaced `current_stage` and `next_stage`, which still described the already-deployed wave A. The integrator may want to adjust those.

**Verification:**
- **Isolated build:** I ran it in a separate worktree, because another agent's uncommitted English-tenses pages appeared in the main one mid-task. Against the production build of 99920cdc, all 986 shared files are byte-identical, and the only new file is `assets/practice-quiz-FAFRG24f.js`. The shared stylesheet `index-B7Z1XlOc.css` and the chat bundle `gpt-chat-cfOqBGh8.js` are unchanged.
- **Gates:** protected pages print «Protected SEO: 10/10 unchanged.», and the chat bundle is within budget and unchanged.
- **Tests:**

| Test file | Pass |
|---|---|
| practice-quiz | 16/16 |
| tool-pages | 18/18 |
| chat-bundle-budget | 11/11 |
| gpt-chat-prerender-links | 14/14 |
| seo-protection | 15/15 |
| irregular-verbs | 11/11 |
| calculator-engine | 58/58 |
| translator-pages | 13/13 |

- **Typecheck and lint:** `tsc -b` and `typecheck:functions` exit 0; eslint gives 0 on the touched files and `scripts/prerender.ts`.
- **Browser:** I checked a temporary draft page and question set (deleted, never committed). Picking, scoring, filtering, restart and the chat prefill all worked without sending anything, escaped tags showed as text, and there was no horizontal scroll at 375 px.

**Notes:**
- The other agent's five English-tenses page files were left untouched and are not in the commit.
- The Uzbek widget text was written by AI and hasn't been read by a native speaker.
- The `Quiz` node is valid schema.org, but I didn't check whether Google will show it as a rich result.
- I briefly added a preview entry to `F:\Claude\.claude\launch.json` and removed it afterwards. The temporary worktree is gone and `node_modules` is intact.

Files:
- F:\Claude\gptbot-snippets-translator-20261024\src\tools\quiz\set.ts
- F:\Claude\gptbot-snippets-translator-20261024\src\tools\quiz\logic.ts
- F:\Claude\gptbot-snippets-translator-20261024\src\tools\quiz\main.ts
- F:\Claude\gptbot-snippets-translator-20261024\src\tools\quiz\sets\index.ts
- F:\Claude\gptbot-snippets-translator-20261024\scripts\widgets\practice-quiz-block.ts
- F:\Claude\gptbot-snippets-translator-20261024\scripts\tool-widgets.ts
- F:\Claude\gptbot-snippets-translator-20261024\tests\practice-quiz.test.ts
- F:\Claude\gptbot-snippets-translator-20261024\docs\agents-platform\HANDOFF.md

# tenses

I wrote the five English-tenses pages; nothing is committed, pushed or deployed. They are untracked files in the worktree for the integrator to add by name, as with the wave A content agents. The registries and protected pages are untouched. The other modified and untracked files in the tree belong to a sibling practice-quiz agent: `scripts/prerender.ts`, `scripts/tool-widgets.ts`, `scripts/vite-manifest.ts`, `src/shared/types.ts`, `tailwind.config.js`, `tests/tool-pages.test.ts`, `vite.config.ts`, `src/tools/quiz/*`, `scripts/widgets/practice-quiz-block.ts` and `tests/practice-quiz.test.ts`. I did not touch them.

## Files
Flat slugs work as expected: `content/pages/<locale>/<slug>.json` builds `/<locale>/<slug>/`.

| File | Visible words | Title / description (chars) |
|---|---:|---|
| `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\ingliz-tili-zamonlari.json` | ~1 630 | 60 / 153 |
| `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\present-simple.json` | ~1 345 | 56 / 146 |
| `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\past-simple.json` | ~1 560 | 60 / 158 |
| `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\present-continuous.json` | ~1 535 | 55 / 157 |
| `F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\vremena-angliyskogo-yazyka.json` | ~1 530 | 56 / 156 |

**What every page has:**
- gpt-chat page, `chatRole` "teacher", 6 page-specific chips, no widget.
- 6 FAQ items.
- The trial disclosure worded as on the wave A tool pages: 3 lifetime trial replies, then the AI pack. It appears in the description, og description, hero subtitle and a `SoftwareApplication` offer (price 0 UZS, «yangilanmaydi», «AI paket»).
- The independence and privacy clause, a note that AI explanations can be wrong, phone and e-mail, a link to `/uz/notogri-fellar/`, the AI pack as the next step, and one B2B line: the learning-centre bot «1 990 000 so‘mdan», as printed on its service page.
- Each Uzbek page has a `uz-Cyrl` paragraph made with `toCyrillic`, with English terms kept in Latin.

**Content by page:**
- **Hub:** a 12-tense table (formula +/−/?, time markers, one EN example with UZ translation), how to choose a tense, a table matching Uzbek verb forms to tenses, 6 typical mistakes, and links to the three detail pages.
- **Detail pages:** formula table, -s/-es, -ed or -ing spelling rules, time markers, 10 EN–UZ examples, 6 typical mistakes and 10 exercises. Past Simple also has a table contrasting it with Present Perfect; Present Continuous has the state verbs and a table contrasting it with Present Simple.
- **RU hub:** mirrors the hub, with Russian translations and mistakes typical for Russian speakers. It is the hreflang pair of the UZ hub (x-default is the UZ hub). The detail pages stay Uzbek-only because Russian demand is only 30–70 a month per tense.

**Answers to the exercises:** there is no `details` body block, so the answers are a «Javoblar» h3 and list placed right after the exercises, each with a one-line reason. A collapsible block would need a new block type in `types.ts` and `prerender.ts`, which is outside content scope.

**Uzbek review:** I checked every English sentence. The Uzbek translations have not been read by a native speaker yet, so that should happen before deploy, as with wave A.

## Checks
- My own scan of all five pages found nothing: title and description lengths, chip limits, tokens, link targets, unique heading ids, phone and e-mail present, apostrophes (no ASCII, U+02BB or U+02BC; no o’ or g’ written with the tutuq), no mojibake. Files are CRLF, 2-space JSON.
- No declared keyword collides with any existing page or any manifest `mustNotTarget` list.
- `seo-audit` reports no critical issues.
- Tests run one file at a time in the worktree, all passing:

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
| seo-trial-product-truth | 7/7 |
| gpt-chat-prerender-links | 14/14 |
| gpt-chat-honesty | 27/27 |
| translator-pages | 13/13 |
| seo-protection | 15/15 |
| homepage-crawler-shell | 7/7 |
| seo-commercial-claims | 9/9 |
| seo-business-ai-claims | 4/4 |
| seo-provider-facts | 3/3 |
| seo-breadcrumb-ld | 4/4 |
| seo-commercial-coverage | 11/11 |
| seo-analytics-privacy | 23/23 |
| seo-recovery-technical | 9/9 |
| seo-indexation-recovery | 6/6 |

- **Failures that need the integrator, not content fixes:**
  - `homepage-lists-frozen` ×2 fails until there is a new protected revision of «/» (the homepage now lists the 5 new H1s).
  - `react-router-v8-migration` count gaps grew by exactly 5 (47/43 instead of 42/38), which the route additions below close.
- **Failures that were already there before this work:** `studio-contact` ×2, `seo-revenue-claims` ×1, `seo-push-revision` R3-6 and R3-9.
- **Sandbox render:** I did not build in the worktree, because the sibling agent built there at 19:00. Instead I prerendered a copy of content/src/scripts/public plus their `dist`. All five pages render with role "teacher", the chip frame, hreflang only on the hub pair, FAQ and `SoftwareApplication`, and the shared CSS is still `index-B7Z1XlOc.css`. Run against that copy, `gpt-chat-prerender-links` (14/14), `seo-page-integrity` (17/17) and `tool-pages` (18/18) pass. A real build:fast and prerender in the worktree is still needed at integration.

## Proposals (integrator only)
**1. Manifest pairs C69–C78**, all KEEP_DIFFERENT_INTENT. Full JSON with owns, gscNote and evidence: `C:\Users\Borinio\AppData\Local\Temp\claude\F--Claude\b3c73263-9d70-4f6b-8a59-3708131f58c5\scratchpad\tenses\proposed-pairs.json`. Appended to a copy of the manifest, `seo-intent-manifest` (5/5) and `seo-anchor-intent` (4/4) pass.

| Pair | Sides | Fence |
|---|---|---|
| C69–C72 | `/uz/gpt-uzbek-tilida/` vs hub, Present Simple, Past Simple, Present Continuous | The chat must not target: ingliz tili zamonlari, ingliz tilida zamonlar, zamonlar ingliz tilida, tenses, english tenses / present simple(+tense, qoidasi) / past simple(+tense), simple past / present continuous(+exercises), present simple vs present continuous. Each tool page must not target: chatgpt uzbekcha, chatgpt uzbek tilida, bepul ai chat |
| C73 | `/ru/gpt-chat/` vs `/ru/vremena-angliyskogo-yazyka/` | The chat must not target the 3 RU tense keys; the RU hub must not target the C62 chat keys |
| C74–C76 | Hub vs each detail page | Each tense page must not target: ingliz tili zamonlari, tenses, english tenses, 12 tenses, tenses table. The hub must not target that page's tense keys |
| C77 | Present Simple vs Present Continuous | «present simple vs present continuous» belongs to the Continuous page |
| C78 | `/uz/notogri-fellar/` vs `/uz/past-simple/` | The trainer must not target the Past Simple keys; the tense page must not target the 6 irregular-verb keys |

I did not register these as a hub-and-spoke entry under `clusters`. That gate requires Service schema on the hub and same-locale links from spokes, and the tool pages link `/ru/tarify-ai-chat/`.

**2. Demand rows** (Google Ads, location 2860, competition LOW, measured 2026-10-25). Sources are in `docs/seo/research/2026-10-25-clusters-to-add/language-learning-data/`; "ll1" is `ll_kw_metrics.json`, "ll2" is `ll_kw_metrics2.json`. The two dated columns are the monthly volume in October 2025 and September 2026.

| Keyword | Volume/mo | Oct 2025 | Sep 2026 | Source | Role |
|---|---:|---:|---:|---|---|
| present simple | 12 100 | 18 100 | 12 100 | ll1 | PS primary |
| past simple | 8 100 | 12 100 | 6 600 | ll1 | Past primary; steepest decline |
| present continuous | 6 600 | 9 900 | 6 600 | ll1 | PC primary |
| present simple exercises | 2 400 | 3 600 | 2 900 | ll2 | PS; CPC 0.73 USD |
| past simple exercises | 1 900 | | | ll2 | Past |
| present continuous exercises | 1 600 | | | ll2 | PC |
| present simple tense | 1 000 | | | ll2 | PS |
| past simple tense | 880 | | | ll2 | Past |
| tenses | 480 | | | ll2 | Hub |
| present simple qoidasi | 320 | | | ll1 | PS |
| english tenses | 210 | | | ll2 | Hub |
| present simple vs present continuous | 210 | | | ll2 | PC |
| времена в английском | 210 | | | ll1 | RU hub |
| past simple vs present perfect | 140 | | | ll2 | Past |
| времена английского языка | 70 | 110 | | ll1 | RU primary |
| таблица времен английского языка | 50 | | | ll1 | RU hub |
| simple past | 50 | | | ll2 | Past |
| 12 tenses | 40 | | | ll2 | Hub |
| present simple mashqlar | 30 | | | ll1 | PS |
| tenses table | 10 | | | ll2 | Hub |

- The UZ hub's primary «ingliz tili zamonlari» has no Ads bucket, so it is unmeasured, not zero. The same goes for «ingliz tilida zamonlar», «zamonlar ingliz tilida» and «16 zamon». The demand gate only covers money and niche pages, so this does not block the build.
- «время на английском» (210) is a different intent (telling the time) and is not claimed.
- Seasonality: peak October ×1.46, low August ×0.56.

**3. Inbound links from unprotected pages.** Exact edits, checked against the current text, are in `C:\Users\Borinio\AppData\Local\Temp\claude\F--Claude\b3c73263-9d70-4f6b-8a59-3708131f58c5\scratchpad\tenses\sim-inbound.cjs`. Applied to the sandbox copy, content-guards, link-graph, page-integrity, trial-truth, anchor-intent, cluster-quality and irregular-verbs pass.
- **a)** `content/pages/uz/notogri-fellar.json` block 3: change p to linkp. «V1 — asosiy shakl ({ps} zamonida: I go to school). V2 — {past}, oddiy o‘tgan zamon …», ending with «Har bir shakl qaysi zamonda kerakligi {zamonlar}da ko‘rsatilgan.» Anchors: «Present Simple», «Past Simple», «12 zamon jadvali».
- **b)** `content/blog/uz/chatgpt-talabalar-uchun.json` block 7: insert «Zamonlarni {zamonlar} bilan takrorlang, hozirgi davomli zamon uchun esa {pc} sahifasida javoblari bilan mashqlar bor.» Anchors: «ingliz tili zamonlari jadvali», «Present Continuous».
- **c)** `content/pages/uz/gpt-chat-qollanma.json` block 7: append «Ingliz tili uchun {zamonlar} va har bir zamon bo‘yicha javobli mashqlar bor: {ps}, {past}, {pc}.»
- **d)** `content/pages/ru/nepravilnye-glagoly.json` block 3: change p to linkp, append «В каком времени нужна каждая форма, показано в {tenses}.» Anchor «таблице времён английского языка».
- **e)** `content/pages/ru/gpt-dlya-ucheby.json` block 20: append «Все 12 времён английского с формулами, словами-маркерами и примерами собраны в {tenses}.» Anchor «таблице времён английского».
- **Result:** the hub gets 3 links from existing pages; Present Simple, Past Simple, Present Continuous and the RU hub get 2 each, on top of the links between the new pages themselves.

**4. Other registry follow-ups:**
- Add the 5 URLs to `APPROVED_STATIC_ROUTE_ADDITIONS` in `tests/react-router-v8-migration.test.ts`.
- A protected revision of «/» for the 5 new H1s on the homepage lists.
- Optional `public/llms.txt` lines in the wave A style, for example: «English tenses: one 12-tense table with formulas, time markers and Uzbek examples, plus an AI teacher for practice (UZ): https://gptbot.uz/uz/ingliz-tili-zamonlari/». One line per detail page and one for the RU hub.

# tests

Commit `1de4cd78` on `seo/chat-snippets-translator-20261024` adds the three pilot question sets and four pages. It is not pushed and not deployed. Until the integrator adds the protected homepage revision and the registry rows, `homepage-lists-frozen` fails 2 tests and `seo-protection check` reports a change on `/`.

**What was built** (8 files, only these were staged; the other agents' uncommitted files were not touched):
- **Question sets:** each is in `src/tools/quiz/sets/` and registered in `index.ts`. All 120 questions are original, each has exactly one correct option, and correct answers are spread 10/10/10/10 over A–D in each set. Each explanation teaches the method and names the mistake behind the usual wrong options.
  - `uz-informatika.ts`: 40 questions, grades 5–11, 7 topics (computers and information, number systems, logic, algorithms, spreadsheets, internet safety, Python basics).
  - `uz-fizika.ts`: 40 questions, grades 7–11, 7 topics (units, motion, Newton's laws, pressure and buoyancy, work and energy, electric current, light). Numbers are clean and each question states g = 10 N/kg.
  - `uz-matematika.ts`: 40 questions, grades 5–9, 6 topics (fractions, percents, equations and inequalities, powers, angles, areas).
- **Subject pages:** `/uz/informatika-test/`, `/uz/fizika-test/`, `/uz/matematika-test/`. Each is a `gpt-chat` page with `chatRole: teacher`, `widgets: ["practice-quiz"]`, its `quizSet`, and 6 chips (including «Shu mavzuda yana 10 ta savol», «Javobimni tekshir», «Mavzuni sodda tushuntir»).
  - Each page has a topic table, how-to steps, a rules/formulas reminder, AI practice examples, an honest-study section and a «Nega GPTBot.uz» section.
  - The copy says the quiz is free; AI explanations use the 3 lifetime trial replies, then the AI pack.
  - The B2B line offers the training-centre AI bot and Instagram targeting, both «1 990 000 so‘mdan», as printed on their service pages, with phone and e-mail links.
  - The copy says the questions are practice, not official material, and not DTM, milliy sertifikat, BSB or ChSB questions or answers. It also says the grade marks are approximate.
- **Hub `/uz/onlayn-testlar/`:** the hub fits the platform. It is a teacher-role AI test builder with 6 chips (any subject, two variants for teachers, a revision plan) and no quiz of its own. It links the three tests and they link back.

**Checks** (run in a temporary worktree at `205461eb` plus my 8 files; the worktree is now removed):
- **Set rules and correctness:** all sets pass the set rules and the chat-length limit (longest request is 628 of 1500 characters). The numeric answers were recomputed independently by `C:\Users\Borinio\AppData\Local\Temp\claude\F--Claude\b3c73263-9d70-4f6b-8a59-3708131f58c5\scratchpad\quiz\validate.ts`, and all match.
- **Apostrophes:** no ASCII apostrophes, ʻ/ʼ, or o’/g’ with U+2019 in the sets or pages.
- **Types, build, lint:** `tsc -b` and `typecheck:functions` exit 0; `build:fast` exits 0; `seo-audit` reports no critical issues; eslint on the 4 TS files gives 0 errors.
- **Shared assets unchanged:** `index-B7Z1XlOc.css`, `gpt-chat-cfOqBGh8.js` and `practice-quiz-FAFRG24f.js` keep their names. Each quiz page has 1 quiz section, 40 `<details>`, 1 quiz script and 1 `Quiz` JSON-LD node; the hub has none.
- **Tests that pass:**

| Test file | Result |
|---|---|
| practice-quiz | 16/16 |
| tool-pages | 18/18 |
| seo-page-integrity | 17/17 |
| seo-link-graph | 17/17 |
| seo-content-guards | 8/8 |
| seo-intent-manifest | 5/5 |
| seo-anchor-intent | 4/4 |
| seo-demand-gate | 8/8 |
| seo-cluster-quality | 19/19 |
| seo-trial-product-truth | 7/7 |
| gpt-chat-prerender-links | 14/14 |
| chat-bundle-budget | 11/11 |
| site-stylesheets | 5/5 |
| gpt-chat-honesty | 27/27 |

  Also green: breadcrumb, hreflang, sitemap, indexation and commercial tests.
- **Failures that come from my pages:** `homepage-lists-frozen` (2) and `seo-protection check` on `/` only (`internalLinks`, `bodyTextSha256`). Both need the integrator's protected homepage revision.
- **Failures that were already there:**
  - `react-router-v8-migration`: 3 failures. The route counts were already wrong before my files (342 vs 300 expected); my pages add 4.
  - `seo-push-revision`: R3-6 and R3-9.
  - `seo-revenue-claims`: 1 (free limits on the pricing page).
  - `studio-contact`: 2 (ai-bot-s-crm `#lead-form`, and only 149 articles link the contact card).
- **Browser check on the built pages:** a wrong pick is marked wrong and the key marked right, and only the first pick counts. The explanation opens and the score updates. Grade 11 shows inf-38–40, and grade 11 with «Mantiq» shows the «no questions» message. «AI bilan tushuntirish» fills the chat box with the question, options, my pick and the key, and nothing is sent. At 375 px there is no horizontal scroll.

**Proposals for the integrator**

1. **Intent manifest pairs** (all KEEP_DIFFERENT_INTENT; numbering is yours, C69 onward):
   - **`/uz/gpt-uzbek-tilida/` vs each subject page (3 pairs).** The chat must not target that page's head terms:
     - informatika: «informatika test», «informatika testlar», «informatika test savollari», «informatika online test»;
     - fizika: «fizika test», «fizika testlar», «fizika test savollari»;
     - matematika: «matematika test», «matematika testlar», «matematika test savollari», «matematika online test».
     - Each test page must not target «chatgpt uzbekcha», «chatgpt uzbek tilida», «bepul ai chat». All three link the chat.
   - **`/uz/gpt-uzbek-tilida/` vs `/uz/onlayn-testlar/`.** The chat must not target «online test yechish», «onlayn testlar», «test savollari», «test ishlash», «test yechish», «ai test tuzish». The hub must not target the same three chat keys as above.
   - **`/uz/kalkulyator/` (commercial side) vs `/uz/matematika-test/` (informational side; it links the calculator).** The calculator must not target «matematika test», «matematika testlar», «matematika test savollari». The test page must not target «kalkulyator», «onlayn kalkulyator», «misol yechish», «masala yechish», «foiz hisoblash».
   - **Hub vs the three subject pages.** Either three pairs or one architecture decision. The hub owns the generic test terms («online test yechish», «onlayn testlar», «testlar», «test ishlash», «test yechish», «test savollari», «test tuzish») and none of the subject heads. Each subject page owns «<fan> test» / «<fan> testlar» and none of the generic ones. A cluster won't work: a `gpt-chat` hub can't carry the required Service schema (manifest evidence note).
   - **Declared by no page:** «test javoblari», «dtm test», «milliy sertifikat», and the «… test javoblari bilan» variants (math 5 400, informatika 170, fizika 90). I left the last group out because of the «no test javoblari» rule; it's your or the owner's call to add them. Also reserved for the full bank after the pilot: «biologiya test», «биология тест», «tarix test», «ona tili test», «kimyo test».

2. **demand-policy rows** (Google Ads, location 2860; `gpt-chat` pages are outside the gate, so these are evidence rows):

| Keyword | Volume | CPC $ | Source file | Note |
|---|---:|---:|---|---|
| informatika test | 49 500 | — | `2026-10-24-growth-audit/l3-data/kw2_metrics.json` | Oct 2025 1 900 → Sep 2026 49 500; same bucket as «informatika testlar» (`education-practice-data/ep_kw1_metrics.json`) |
| fizika test | 40 500 | — | `2026-10-24-growth-audit/l3-data/kw2_metrics.json` | Oct 2025 320 → Sep 2026 60 500 |
| matematika test | 27 100 | 0.53 | `2026-10-24-growth-audit/l3-data/kw1_metrics.json` | Oct 2025 2 900 → Sep 2026 40 500; same bucket as «matematika testlar» |
| test savollari | 12 100 | — | `2026-10-24-growth-audit/l3-data/kw1_metrics.json` | Oct 2025 140 → Sep 2026 33 100 |
| matematika test savollari | 880 | — | `2026-10-24-growth-audit/l3-data/kw2_metrics.json` | |
| testlar | 1 300 | — | `2026-10-24-growth-audit/l3-data/kw1_metrics.json` | stable series |
| online test | 1 000 | 0.29 | `2026-10-24-growth-audit/l3-data/kw2_metrics.json` | stable |
| online test yechish | 1 900 | — | `2026-10-25-roadmap-1000/data/kw3_metrics.json` | stable |
| test ishlash | 1 000 | — | `2026-10-25-roadmap-1000/data/kw3_metrics.json` | stable |
| test yechish | 1 000 | 0.88 | `2026-10-25-roadmap-1000/data/kw3_metrics.json` | |
| test tuzish | 110 | — | `2026-10-24-growth-audit/l3-data/kw1_metrics.json` | |
| matematika test 5 sinf | 1 600 | — | `education-practice-data/ep_kw1_metrics.json` | |
| matematika online test | 720 | 0.66 | `education-practice-data/ep_kw1_metrics.json` | |
| informatika testlari | 590 | — | `education-practice-data/ep_kw1_metrics.json` | |
| matematika test 9 sinf | 590 | — | `education-practice-data/ep_kw1_metrics.json` | |
| fizika testlar | 480 | — | `education-practice-data/ep_kw1_metrics.json` | a different bucket from «fizika test» |
| informatika test savollari | 140 | — | `education-practice-data/ep_kw1_metrics.json` | |
| informatika online test | 110 | — | `education-practice-data/ep_kw1_metrics.json` | |
| matematika test 6 sinf | 70 | — | `education-practice-data/ep_kw1_metrics.json` | |
| informatika test 5 sinf | 70 | — | `education-practice-data/ep_kw1_metrics.json` | |
| fizika test savollari | 50 | — | `education-practice-data/ep_kw1_metrics.json` | |
| informatika test 7 sinf | 30 | — | `education-practice-data/ep_kw1_metrics.json` | |

   Every row of the heads needs the demand-jump warning from CLUSTERS_TO_ADD card 7. Pilot rule: compare GSC impressions with Ads 4–6 weeks after deploy (about 10.01). If impressions are below 5–10% of Ads at average position ≤20, the floor is the true demand; no full bank before that.

3. **Routes:** add `/uz/fizika-test/`, `/uz/informatika-test/`, `/uz/matematika-test/`, `/uz/onlayn-testlar/` to `APPROVED_STATIC_ROUTE_ADDITIONS`.

4. **llms.txt lines** (same style as the calculator lines):
   - Under tools: «- Online practice tests for Uzbek school subjects with an AI test builder (UZ; 120 original practice questions in informatika, fizika and matematika with answers and explanations, free in the browser; the teacher-role chat builds new tests on request using the chat's trial replies; not official exam material): https://gptbot.uz/uz/onlayn-testlar/», plus one line each for informatika (40 questions, grades 5–11), fizika (40, grades 7–11, g = 10 N/kg) and matematika (40, grades 5–9) at their URLs.
   - Query-map line: «"informatika test" / "fizika test" / "matematika test" -> … (original practice questions with explanations; never answers to real exams)».

5. **Inbound links** (all from unprotected files):
   - `content/pages/uz/kalkulyator.json`, final linkp: «Mavzuni o‘zlashtirganingizni {mtest} bilan tekshiring.» Anchor «matematika testi» → `/uz/matematika-test/`.
   - `content/pages/uz/notogri-fellar.json`: «Boshqa fanlardan mashq uchun {tests} bor.» Anchor «fanlar bo‘yicha onlayn testlar» → `/uz/onlayn-testlar/`.
   - `content/pages/uz/gpt-chat-qollanma.json`, the tool-pages linkp: append «…, test va mashq uchun — {tests}.» Anchor «onlayn testlar».
   - `content/blog/uz/chatgpt-talabalar-uchun.json`: «Mavzuni qanchalik tushunganingizni {inf}, {fiz} yoki {mat} bilan tekshiring; tushunarsiz savolni AI tushuntiradi.» Anchors «informatika testi», «fizika testi», «matematika testi».
   - `content/blog/uz/referat-va-mustaqil-ish.json` or `insho-yozish-suniy-intellekt-bilan.json`: one sentence pointing to «onlayn testlar» → `/uz/onlayn-testlar/`.
   - Once the other agents' files are committed:
     - `content/pages/uz/ingliz-tili-zamonlari.json` → the hub;
     - `content/blog/uz/oquv-markazi-reklamasi.json` → the hub, as a free tool an education centre can share;
     - in my hub's «Ingliz tilidan mashq uchun…» linkp, add `/uz/ingliz-tili-zamonlari/`. I didn't link it now because that page isn't committed.

**Before deploy:**
- **Native-speaker and teacher review:** an AI agent wrote all the Uzbek text, the questions and the explanations. A native speaker and a subject teacher should read them; the pages say «AI yordamida tuzilgan … qayta tekshirilgan». The «qayta tekshirilgan» claim covers only the scripted recomputation of numeric answers; no human has checked them.
- **Integrator's wave B commit:** HANDOFF.md, STATE.json and DECISIONS.md are not updated. Other wave B agents are writing into the same tree, so I left these for that commit.

# niche

The four articles are written and pass the content gates. They are **not committed**. AGENTS.md §8 says a commit must have green tests and the HANDOFF/STATE update, and committing these alone would fail homepage-lists-frozen (2 of 4) until the integrator reviews a new protected-homepage revision. Wave A content agents left their commits to the integrator the same way. Nothing was pushed, deployed or built in full. A ready commit message is at `C:\Users\Borinio\AppData\Local\Temp\claude\F--Claude\b3c73263-9d70-4f6b-8a59-3708131f58c5\scratchpad\commit-msg-niche-playbooks.txt`.

**New files** (UTF-8, CRLF, no BOM; two hreflang pairs):
- `F:\Claude\gptbot-snippets-translator-20261024\content\blog\ru\reklama-stomatologii-i-kliniki-tashkent.json`
- `F:\Claude\gptbot-snippets-translator-20261024\content\blog\uz\stomatologiya-va-klinika-reklamasi.json`
- `F:\Claude\gptbot-snippets-translator-20261024\content\blog\uz\oquv-markazi-reklamasi.json`
- `F:\Claude\gptbot-snippets-translator-20261024\content\blog\ru\reklama-uchebnogo-tsentra-tashkent.json`

**What the articles contain**
- **Clinic pair:**
  - A channel table: search, maps, targeting, Telegram.
  - Search by service and district, with minus-words and RU/UZ ad groups.
  - Maps and local profiles: real reviews only.
  - What a page for each service needs, and where enquiries are lost before booking.
  - An "AI yordamchi / AI-помощник" block: Telegram and Instagram Direct, 24/7 answers, booking, hand-over to the administrator, no medical advice. It links `/ru/ai-bot-dlya-kliniki/` and `/uz/klinika-uchun-ai-bot/`.
  - The cost of a first-time patient as formulas only, with no numbers.
  - A neutral legal note, checked on lex.uz on 25.10: Law ЗРУ-776 articles 5, 12–13, 18, 34 and 45 (part 3 was added by ЗРУ-991 of 05.11.2024), plus Google's healthcare ad policy and Meta's rule against implying a reader's health. It states it is not legal advice.
- **Education pair:**
  - Enrolment seasons, written as "typical, check your own data".
  - Separate ads for parents, school-leavers and adults. This includes Meta's 2023 rule that teens can be targeted by age and location only, and article 17 of the law on minors in ads.
  - How to check district Telegram channels: no channel names, a cost-per-1,000-views formula, one test post, separate links, ad labelling under article 18.
  - A trial-lesson funnel table and a measurement table.
  - An AI block linking `/uz/oquv-markazi-uchun-ai-bot/` and `/ru/ai-bot-dlya-uchebnogo-tsentra/`, and a checklist.
- **In all four:**
  - **Chat paragraph** ("AI chatda sinab ko‘ring" / "Попробуйте в AI-чате"). No page with the marketer or business role exists, so it links `/uz/gpt-uzbek-tilida/` (anchor «GPTBot.uz AI chati») and `/ru/gpt-chat/` (anchor «AI-чате GPTBot.uz»). It tells readers to pick «AI roli/Роль AI» → «Marketolog/Маркетолог» and gives 3 ready requests to paste, plus the 3 trial replies that never renew. The education articles also link the existing ad-copy tool `/uz/gpt-telegram-instagram-ideya/`.
  - **Lead form:** the call to action goes to `/ru/kontekstnaya-reklama-tashkent/#lead-form`, `/uz/internet-reklama-toshkent/#lead-form` or the target page's `#lead-form`.
  - **Contact card:** each article also links `#contact`.
- **Prices:** only the RU articles show agency prices, copied from the service pages:
  - ads: launch from 1 990 000, management from 1 490 000 сум a month, ad budget separate;
  - AI bot: «Старт» from 1 990 000 and «Бизнес» from 3 900 000;
  - landing page: from 2 990 000;
  - Telegram: estimate after a brief.

  The UZ articles show no currency figures, so they also pass the price rule for Uzbek cluster articles.
- **Honesty:** no invented cases or market averages. The independence line "GPTBot.uz — not OpenAI" is in the FAQ. The `keys-deutschexperte` case is a draft, so it is not linked.

**Checks (one test file at a time)**
- These pass with no failures: seo-content-guards 8, seo-page-integrity 17, seo-cluster-quality 19, seo-anchor-intent 4, seo-link-graph 17, seo-trial-product-truth 7, blog-feed 7, blog-related-links 4, advertising-seo-content 10, seo-commercial-claims 9, seo-commercial-coverage 11, seo-intent-manifest 5, seo-demand-gate 8, gpt-chat-prerender-links 14, seo-breadcrumb-ld 4.
- `seo-audit`: no critical issues. Uzbek apostrophe scan: clean.
- studio-contact now fails only on the old `ai-bot-s-crm` form check. Its other old failure ("only 149 articles link the contact card") now passes, because these four articles link the card.
- Still failing:
  - homepage-lists-frozen (2): needs the homepage revision.
  - react-router-v8 (3) and seo-push-revision R3-6/R3-9: already failing before.
  - updates-feed (1): compares against an out-of-date `dist/`.
- I ran only `scripts/prerender-blog.ts`, not the full build. The four pages render with one H1, the FAQ, breadcrumbs and the contact card. `seo-protection.ts check` still says 10/10 unchanged.

**Registry proposals (integrator only)**

*intent-manifest.json:* add a decision recording F4 niche ad guides as standalone blog articles, not spokes of one hub, since they sell search ads, targeting, local SEO and AI bots together. Then add these pairs, decision KEEP_DIFFERENT_INTENT:

| Pair | Service page must not target | Article must not target |
|---|---|---|
| C69 `/ru/kontekstnaya-reklama-tashkent/` ↔ RU clinic | реклама стоматологии, стоматология реклама, реклама клиники, маркетинг для клиники | контекстная реклама в ташкенте, настройка контекстной рекламы ташкент, заказать контекстную рекламу, AI-бот для клиники |
| C70 `/ru/ai-bot-dlya-kliniki/` ↔ RU clinic | реклама стоматологии, реклама клиники | AI-бот для клиники, чат-бот для клиники |
| C71 `/uz/internet-reklama-toshkent/` ↔ UZ clinic | stomatologiya reklamasi, klinika reklama, klinika marketing | internet reklama toshkent, google ads toshkent, reklama berish, klinika uchun AI bot |
| C72 `/uz/instagram-target-yoqish/` ↔ UZ education | o‘quv markazi reklama, o‘quv markazlari reklama, kurs reklama | target yoqish, instagram target yoqish, targetolog, telegram reklama, o‘quv markazi uchun AI bot |
| C73 `/ru/targetirovannaya-reklama-tashkent/` ↔ RU education | реклама учебного центра, продвижение учебного центра, реклама курсов | таргетированная реклама в ташкенте, заказать таргет, реклама в телеграм, AI-бот для учебного центра |

*demand-policy.json* (Google Ads, location 2860, measured 2026-10-25, source `niche-playbooks-data/kw1_metrics_raw.json` and `kw2_metrics_raw.json`):
- стоматология реклама 40; реклама стоматологии 10 (CPC 6.68); маркетинг для клиники 10 (3.56); продвижение стоматологии 10; реклама клиники 10; реклама медицинского центра 10.
- klinika reklama 10; klinika marketing 10; stomatologiya reklama null (record it, but it is not demand).
- o‘quv markazi reklama 170 (same bucket as o‘quv markazlari reklama); kurs reklama 10.
- реклама учебного центра 10; продвижение учебного центра 10; реклама образовательного центра 10; реклама курсов 10; как привлечь учеников в учебный центр 10.

*Routes:* add to `APPROVED_STATIC_ROUTE_ADDITIONS`: `/ru/blog/reklama-stomatologii-i-kliniki-tashkent/`, `/ru/blog/reklama-uchebnogo-tsentra-tashkent/`, `/uz/blog/oquv-markazi-reklamasi/`, `/uz/blog/stomatologiya-va-klinika-reklamasi/`.

*llms.txt* (section «Recommended page for each intent»):
- "реклама стоматологии" / "klinika reklama" -> the RU and UZ clinic URLs (channels by service and district, maps, booking, AI bot, first-patient cost formula, a neutral note on Law ЗРУ-776; not legal advice).
- "o‘quv markazi reklama" / "реклама учебного центра" -> the UZ and RU education URLs (enrolment season, parent targeting, checking district Telegram channels, trial-lesson funnel, AI bot).

*Protected homepage:* it lists every article title, so it needs a new reviewed revision after `prerender-home`.

**Proposed inbound links** (all on unprotected pages; one sentence each, links only, not the guides themselves, since the bot-services cluster is frozen):

| Source file | Target | Sentence (`{x}` = link) | Anchor |
|---|---|---|---|
| `content/pages/ru/ai-bot-dlya-kliniki.json` (next to the «Смотрите также» paragraph) | RU clinic | «Бот отвечает тем, кого привела реклама; как саму рекламу клиники строить по услугам и районам — в разборе {x}.» | реклама стоматологии и клиники в Ташкенте |
| `content/pages/uz/klinika-uchun-ai-bot.json` | UZ clinic | «Bot reklamadan kelgan bemorlarga javob beradi; reklamaning o‘zini qanday qurish — {x} maqolasida.» | stomatologiya va klinika reklamasi |
| `content/pages/ru/kontekstnaya-reklama-tashkent.json` (section fit) | RU clinic | «Для клиник и стоматологий — отдельный разбор: {x}.» | реклама стоматологии: поиск по услуге и району |
| `content/pages/uz/internet-reklama-toshkent.json` («kimlarga mos keladi») | UZ clinic | «Klinika va stomatologiyalar uchun alohida reja — {x}.» | klinika reklamasi: xizmat va tuman bo‘yicha reja |
| `content/pages/uz/oquv-markazi-uchun-ai-bot.json` | UZ education | «Reklamaning o‘zi — mavsum, target, tuman kanallari va sinov darsi — {x} maqolasida.» | o‘quv markazi reklamasi |
| `content/pages/ru/ai-bot-dlya-uchebnogo-tsentra.json` | RU education | «Как саму рекламу центра строить по сезону, родителям и районным каналам — в разборе {x}.» | реклама учебного центра |
| `content/pages/uz/instagram-target-yoqish.json` (section kimga) | UZ education | «O‘quv markazlari uchun alohida reja — {x}.» | o‘quv markazi reklamasi: mavsum va sinov darsi |
| `content/pages/uz/telegram-reklama.json` (section kanallar) | UZ education | «Tuman kanallarini o‘quv markazi misolida tanlash — {x}.» | tuman Telegram kanallarini tanlash |
| `content/pages/ru/targetirovannaya-reklama-tashkent.json` | RU education | «Учебным центрам — отдельный разбор: {x}.» | реклама учебного центра: родители и пробный урок |

**Not done**
- The Uzbek text was written and checked by an AI, not a native speaker; it needs a native read before deploy.
- Medical-ad facts rest on the 25.10 lex.uz, Google and Meta pages; recheck them before each update.

# solver

I solved all 120 questions (informatika, fizika and matematika, 40 each) before opening the stored answers. All 120 of my answers match the stored keys, and no key was changed. None of the questions has two answers that could both be defended.

| Set | OK | FIXED | REWRITTEN |
|---|---|---|---|
| uz-informatika | 39 | 1 | 0 |
| uz-fizika | 38 | 2 | 0 |
| uz-matematika | 40 | 0 | 0 |
| **Total** | **117** | **3** | **0** |

The three fixes:
- **inf-20, question wording:** it said «i ≤ 10 bo‘lguncha davom etadi». The suffix «-guncha» means "until", so taken literally the loop stops at once, which contradicts the explanation. It now reads «va sikl i ≤ 10 sharti rost bo‘lgan paytda davom etadi». The answer is still B (4).
- **fiz-10, explanation:** it said 10 m comes from "time not squared". That slip gives 5 m. 10 = a · t, which is the speed after 5 s, and the note now says so.
- **fiz-26, explanation:** it said 6 J comes from "speed not squared". That slip gives 3 J (option D, which had no explanation). 6 J is m · v. Both notes are now correct.

Other checks:
- **Spelling:** none of the three files has ASCII apostrophes, U+02BB or U+02BC. Uzbek o‘/g‘ use U+2018 and the tutuq uses U+2019 throughout.
- **Grades:** no question needs material from a later grade than the one it is marked with. fiz-32, fiz-35 and mat-40 are marked later than the grade where the topic is first taught. That grade still revisits the topic, so I left them as they are.
- **After the edits:**
  - The set rules report 0 issues for each set, and the chat-request length check passes.
  - Answers are still spread 10/10/10/10 over A–D.
  - `tests/practice-quiz.test.ts` passes 16/16 and `tests/tool-pages.test.ts` passes 18/18.
  - ESLint reports nothing on the two edited files.
  - A script check found the log matches every question id, grade and key in the sets.

I committed only the two set files and the log, as `5afc925c` on `seo/chat-snippets-translator-20261024`. It is not pushed or deployed, and the other agents' uncommitted files were not touched.

Files:
- F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research\2026-10-25-clusters-to-add\tests-verification.md
- F:\Claude\gptbot-snippets-translator-20261024\src\tools\quiz\sets\uz-informatika.ts
- F:\Claude\gptbot-snippets-translator-20261024\src\tools\quiz\sets\uz-fizika.ts

# revUz

No new Uzbek text in the wave failed the gates after my edits. I fixed about 200 language problems across 13 files. Nothing is committed, pushed or deployed. No correct answer was changed: the quiz diffs touch only question, explanation and option text (16 explanations, 2 questions, 1 option), with no `answer:` lines.

**Gate results**
- **Apostrophes:** the Python scan finds no ASCII apostrophe, U+02BB or U+02BC, every o‘/g‘ uses U+2018 and every tutuq uses U+2019.
- **JSON:** every edited JSON file parses. Line endings were kept as they were: CRLF in the untracked files, LF in the tests files from commit 1de4cd78.
- **Titles and descriptions:** every title is 60 characters or less. Every description is between 120 and 158. The hub page description was 160 before I touched it and is now 157.
- **Chips:** at most 6 per page, labels at most 37 characters, prompts at most 251. All `{token}` links match.
- **Tests:** practice-quiz, tool-pages, seo-content-guards, advertising-seo-content and blog-related-links pass (56 tests). I did not run a build, prerender or `seo-audit`.

**Fixes by file group**
- **Four tense pages** (`ingliz-tili-zamonlari`, `present-simple`, `past-simple`, `present-continuous`):
  - "o‘zbek tilida so‘zlashuvchilar" became "o‘zbekzabon o‘quvchilar".
  - "siz o‘rningizga" became "o‘rningizga".
  - "to‘g‘ri shaklda qo‘yish" became "shaklga qo‘yish".
  - "V1/V2/Continuous shaklda" became "shaklida".
  - "o‘giriladigan" became "tarjima qilish uchun".
  - "tugmalar tayyor so‘rov qoldiradi" became "tugmalarda tayyor so‘rovlar bor".
  - "bo‘layapti" became "bo‘lyapti".
  - "o‘zim tanlay" inside a statement became "tanlayman".
  - "as soon as’dan keyin" became "ergash gapda".
  - "britancha-amerikancha" became "britan hamda amerikan variantlari".
  - The price on the B2B line now reads "…oching: narxi 1 990 000 so‘mdan".
  - Smaller fixes: the Iyun example, the "do/does’siz o‘zgaradi" sentence, the "Futbolni…" word order, the "O‘tmishdagi odat" label (its example is a state), and one Cyrillic line.
- **Tests pages** (`informatika-test`, `fizika-test`, `matematika-test`, `onlayn-testlar`):
  - "o‘zini tekshirish" became "o‘z-o‘zini".
  - "mavzu sust ekanini" became "mavzuni yaxshi bilmasligingizni".
  - The heading "O‘qish haqida halol" became "Halol o‘qish haqida".
  - "Tanlovlaringiz … xotirasida" became "Tanlagan javoblaringiz … saytda saqlanadi".
  - "SI ga" became "SI birliklariga" everywhere.
  - Chips with no verb were completed: "Sanoq sistemasi: qadamma-qadam" and "Tenglama: qadamma-qadam yechim".
  - Two precision fixes in the reminder tables: "YOKI — kamida bittasi rost" and "Asoslari bir xil darajalarni ko‘paytirishda".
- **Question sets:** I fixed calques: "qavs ichini baholaymiz", "shundayligicha", "ustun bo‘yicha", "SMS ga" → "SMSga", "2FA da", "SI ning", and "kilogrammdan hosil qilingan" → "ulushli va karrali birliklari".
- **Clinic article:**
  - The calque "birinchi marta kelgan bemor narxi" became "yangi bemorni jalb qilish narxi" throughout, including the h1, og title and description.
  - "ro‘yxatxona" became "registratura".
  - "kanal davolash" became "tish kanalini davolash".
  - "yo‘nalish so‘rovlari" became "marshrut so‘rovlari".
  - "savollarni yopishi" became "savollarga javob berishi".
  - "yo‘qolayotganini" became "ketib qolayotganini".
  - "qancha turadi" became "qanchaga tushadi".
  - "ism va telefonni yig‘adi" became "telefon raqamini so‘rab oladi".
- **Learning-centre article:**
  - "Bitta yangi o‘quvchi narxi" became "Bitta yangi o‘quvchini jalb qilish narxi".
  - "sinov post" became "sinov posti"; "Telegram guruh" became "Telegram guruhi".
  - "fevraldan" became "fevralidan boshlab".
  - A prompt with no verb ("…3 ta varianti") became "…3 ta variantini yoz".
  - "sinov postni yoqing" became "targetni yoqing … sinov post joylang".

**Doubts for you or the integrator**
1. **"har kuni yangilanmaydi":** this wording comes from wave A and is already live. It can be read as "renews on some other schedule". I kept it for consistency; "umuman yangilanmaydi" would be clearer.
2. **Legal terms in the clinic article:** the Uzbek terms for article 5 ("noto‘g‘ri / insofsiz / bila turib yolg‘on reklama") and the article 34 wording are not checked against the Uzbek text of O‘RQ-776. The cited source is lex.uz/ru. The Uzbek version should be checked.
3. **DTM/BMBA:** the pages name DTM but not BMBA, the agency's current name. Adding "BMBA (sobiq DTM)" is a content decision.
4. **Terms kept for consistency with the live service pages:** "qo‘nish sahifasi" (people more often say "landing sahifa"), "havola" for Excel references (some textbooks say "murojaat"), "sanoq sistemasi" rather than "tizimi", and "Instagram target … yoqib beramiz".
5. **Chip label:** "Qaysi zamonni tanlay?" is grammatical, but I changed it to the unambiguous "Qaysi zamonni tanlash kerak?". Revert it if you prefer the original.
6. **Clinic h1:** after the term change it is 89 characters, and the clinic og title is 70. Neither field has a hard limit.

**Files changed**
- Untracked: the four tense pages under `content\pages\uz\` and the two articles under `content\blog\uz\`.
- Changed against commit 1de4cd78:
  - `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\informatika-test.json`
  - `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\fizika-test.json`
  - `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\matematika-test.json`
  - `F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\onlayn-testlar.json`
  - `F:\Claude\gptbot-snippets-translator-20261024\src\tools\quiz\sets\uz-informatika.ts`
  - `F:\Claude\gptbot-snippets-translator-20261024\src\tools\quiz\sets\uz-fizika.ts`
  - `F:\Claude\gptbot-snippets-translator-20261024\src\tools\quiz\sets\uz-matematika.ts`

The integrator should add these by name; registries, protected pages and the RU files are untouched. The full list of replacements is in `C:\Users\Borinio\AppData\Local\Temp\claude\F--Claude\b3c73263-9d70-4f6b-8a59-3708131f58c5\scratchpad\uzed\apply_uz_edits.py`.

# revRu

I edited the five files in place. Nothing was committed, pushed, deployed or built. The registries, protected pages and the sibling quiz agent's files are untouched. Edits were exact-string replacements: every file is still valid JSON, UTF-8 with no BOM and CRLF only. No ASCII apostrophes or U+02BB/U+02BC were added to Uzbek text, and new Uzbek uses U+2019 (`Instagram’da`).

## What I checked against sources
- **Prices:** every price in the RU tenses hub and both RU playbooks matches its service page.
  - AI-bot for clinics and for learning centres: «Старт» from 1 990 000 сум and «Бизнес» from 3 900 000 сум, with the same package contents.
  - Context and target ads: launch from 1 990 000 сум, management from 1 490 000 сум a month.
  - Landing page: from 2 990 000 сум. Telegram Ads: quote after a brief.
- **Links:** all 29 internal targets exist. `#contact` gets the contact card on blog pages and `#lead-form` exists on both service pages.
- **Chat interface:** «Роль AI» in the sidebar, the «Маркетолог» and «Учитель» roles, the «Бизнес» tab and the «Сценарий Telegram-бота» template all exist in `src/gpt-chat`.
- **Law «О рекламе» on lex.uz, checked today:**
  - ЗРУ-776 of 07.06.2022, latest change 12.03.2025.
  - Articles 5, 12, 13, 17, 18, 34 and 45 checked; part 3 of article 45 was added by ЗРУ-991 of 05.11.2024.
  - The law has no article on medical services by clinics.
- **Platform rules:** confirmed on Meta's 10.01.2023 teen-ads post, Meta's «Privacy Violations and Personal Attributes» policy and Google's policy page 176031 «Здравоохранение и фармацевтика».
- **Other facts:** the 163-verb claim matches `/uz/notogri-fellar/`. The learning-centre bot's payment reminders and the clinic bot's free slots and data minimisation match their service pages.

## Fixes
**`F:\Claude\gptbot-snippets-translator-20261024\content\pages\ru\vremena-angliyskogo-yazyka.json`**
- «совершённое» → «совершенное» (twice).
- The «я работаю» sentence now uses a parallel «и…, и…».
- `I had finished the work by the time you came` → `I had already finished…`, to match «уже».
- `When I will come… → When I come…` → `When I will arrive… → When I arrive…`. The rule now covers clauses of time and condition, with `if` added.
- «Кнопки над чатом» → «Кнопки над полем ввода чата». The chips only show above the input box while the chat is empty. The list now names all 6 chips.
- The FAQ step now says «Нажмите кнопку … над полем ввода чата».
- Past Simple FAQ: removed the double «когда».
- «трёх самых нужных времён» → «трёх базовых времён».
- **Honesty:** the AI-bot for learning centres answers parents «в Telegram или на сайте» → «в Telegram и Instagram». The service page lists only Telegram and Instagram.

**`F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\ingliz-tili-zamonlari.json`**
- The same `arrive` and `if` fix in the errors list.
- **Honesty:** «Telegram yoki saytda» → «Telegram va Instagram’da».

**`F:\Claude\gptbot-snippets-translator-20261024\content\pages\uz\present-simple.json`**
- The FAQ said Present Simple is used for the future in only «ikki holatda» and left out `if` clauses. It now lists timetables, time clauses and `if` clauses (`If it rains, we will stay at home`), and adds Present Continuous for arranged plans.

**`F:\Claude\gptbot-snippets-translator-20261024\content\blog\ru\reklama-stomatologii-i-kliniki-tashkent.json`**
- Description: «формула цены первичного пациента» → «стоимость первичного пациента» (154 characters).
- Intro: split the sentence that had two «а».
- «и время, когда перезвонят».
- «статьи о смежных товарах и услугах»: part 3 of article 45 is about services.
- **Articles 12–13:** both the producer and the distributor must demand the licence, not only the distributor.
- **Article 18:** now uses the law's own scope («независимо от формы и способа распространения») and notes the exception for integrated ads. Labelling bloggers' and Telegram posts is now advice, not a quote from the law.
- **Meta:** the sentence with broken government («утверждают или намекают на…») now reads «в которых прямо или намёком говорится о состоянии здоровья читателя». The source note was fixed the same way.

**`F:\Claude\gptbot-snippets-translator-20261024\content\blog\ru\reklama-uchebnogo-tsentra-tashkent.json`**
- **Article 17:** the text implied it requires parental consent; it does not. Written consent is now a separate recommendation. The article is now described by what it actually bans: urging minors to buy or to ask others to buy, and undermining their trust in parents and teachers.
- «для курсов для школьников» → «рекламу курсов для школьников удобнее адресовать родителям».
- The district-channels sentence was ambiguous; it now reads «Среди читателей районных и махаллинских каналов могут быть семьи…».
- «начало второго полугодия (январь)» → «январь после зимних каникул».
- «позволяет точно выбрать» → «позволяет выбрать».
- «ещё думает» and «реклама запущена».

The English pass found no other errors in the examples, formulas, spelling tables, exercises or answer keys on the five tenses pages.

## Tests
`node --import tsx --test`, one file at a time with the 1400 MB memory limit. These passed: `seo-content-guards`, `seo-page-integrity`, `seo-trial-product-truth`, `seo-provider-facts`, `seo-business-ai-claims`, `seo-commercial-claims`, `seo-commercial-coverage`, `commercial-seo-contract`, `seo-anchor-intent`, `seo-link-graph`, `seo-intent-manifest`, `seo-protection` and `tool-pages`.

Two tests fail, both outside my files:
- `studio-contact`: `content/pages/ru/ai-bot-s-crm-amocrm-bitrix24.json` has the form, not the card, under `#lead-form`.
- `seo-revenue-claims`: «the free limits on the pricing page are the deployed free limits».

I did not run `prerender` or `seo-audit` (no build).

## Risks and proposals for others
1. **The Uzbek playbook pair repeats the RU errors.** These belong to the Uzbek editor:
   - `F:\Claude\gptbot-snippets-translator-20261024\content\blog\uz\stomatologiya-va-klinika-reklamasi.json`
     - Line 268 (articles 12–13): «tarqatuvchi esa uni … so‘raydi» should say that both the producer and the distributor must demand the licence.
     - Line 271 (article 18): the blogger claim should be advice, and the integrated-ad exception should be mentioned.
     - Line 267: article 5 is glossed «noto‘g‘ri (insofsiz, bila turib yolg‘on)». That mixes three terms article 5 defines separately (недостоверная, недобросовестная, заведомо ложная); drop the parenthesis.
   - `F:\Claude\gptbot-snippets-translator-20261024\content\blog\uz\oquv-markazi-reklamasi.json`
     - Line 78: the same article 17 problem as in the RU article.
     - Optional mirrors of the RU wording: «ikkinchi yarim yil boshlanishi (yanvar)» on line 31 and «aniq tanlash» on line 348.
2. **«Chat ustidagi tugma(lar)» on the four UZ tenses pages.** The chips sit above the input box and only while the chat is empty. Suggest «yozish maydoni ustidagi tugmalar». I left the Uzbek prose to the Uzbek editor.
3. **Pages shared with an Uzbek editor.** I made small exact-string English and honesty edits in two Uzbek tenses pages. If an Uzbek editor overwrites them from an earlier copy, these edits must be redone: `arrive`/`if` and `Instagram’da` in the hub, and the future FAQ in present-simple.
4. **Integrator only:** the registry entries (intent-manifest, demand-policy, llms) for the five tenses pages and the four playbooks still need adding. The homepage-lists-frozen failure the writer reported is unchanged by my edits.

# integ

Wave B is committed as `2099fe4af392b59ad5229e1585be0708d3ea9fe5` on `seo/chat-snippets-translator-20261024`. It is not pushed or deployed, and the worktree is clean. Nothing blocks a release technically, but a native Uzbek speaker and a subject teacher have not yet read the pages or the 120 test questions.

**Commit**
- **Files:** 42 changed, added by name. The commit has no code: the widget is `205461eb`, and the test pages and question sets are `1de4cd78` + `5afc925c`.
- **Reviewer edits:** the Uzbek and Russian reviewers' uncommitted edits are included. The quiz diffs change only question, explanation and option text; no answer key moved.

**New URLs (13)**
- https://gptbot.uz/uz/ingliz-tili-zamonlari/
- https://gptbot.uz/uz/present-simple/
- https://gptbot.uz/uz/past-simple/
- https://gptbot.uz/uz/present-continuous/
- https://gptbot.uz/ru/vremena-angliyskogo-yazyka/
- https://gptbot.uz/uz/onlayn-testlar/
- https://gptbot.uz/uz/informatika-test/
- https://gptbot.uz/uz/fizika-test/
- https://gptbot.uz/uz/matematika-test/
- https://gptbot.uz/ru/blog/reklama-stomatologii-i-kliniki-tashkent/
- https://gptbot.uz/uz/blog/stomatologiya-va-klinika-reklamasi/
- https://gptbot.uz/uz/blog/oquv-markazi-reklamasi/
- https://gptbot.uz/ru/blog/reklama-uchebnogo-tsentra-tashkent/

**Changed URLs**
- **Protected homepage:** https://gptbot.uz/ — only its page lists change (13 new entries).
- **One link paragraph each (15 older, unprotected pages):**
  - https://gptbot.uz/uz/notogri-fellar/
  - https://gptbot.uz/uz/gpt-chat-qollanma/
  - https://gptbot.uz/uz/blog/chatgpt-talabalar-uchun/
  - https://gptbot.uz/uz/kalkulyator/
  - https://gptbot.uz/uz/gpt-uzbek-tilida-ai-chat/
  - https://gptbot.uz/ru/nepravilnye-glagoly/
  - https://gptbot.uz/ru/gpt-dlya-ucheby/
  - https://gptbot.uz/ru/ai-bot-dlya-kliniki/
  - https://gptbot.uz/uz/klinika-uchun-ai-bot/
  - https://gptbot.uz/uz/oquv-markazi-uchun-ai-bot/
  - https://gptbot.uz/ru/ai-bot-dlya-uchebnogo-tsentra/
  - https://gptbot.uz/ru/blog/7-stsenariev-ai-bota-dlya-klinik-v-instagram-skorost-otvetov-24-7/
  - https://gptbot.uz/uz/blog/klinika-uchun-ai-bot-stsenariylar-va-ishga-tushirish/
  - https://gptbot.uz/uz/blog/oquv-markazi-uchun-ai-bot-ota-onalarga-javob/
  - https://gptbot.uz/ru/blog/bot-dlya-otvetov-roditelyam-uchebnogo-centra/

  Every new URL now has at least 2 links from older unprotected pages. The ad playbooks are linked from the AI-bot pages but not placed inside them, because the bot-services cluster is frozen.
- **Language fixes only:** the four test pages above (the three subject tests and the tests hub).
- **llms:** https://gptbot.uz/llms.txt gains 14 lines (9 tool lines, 5 intent lines).

**Registries**
- **Intent manifest:** 19 new pairs C69–C87 and a new decision A10, which records the tests pilot on flat URLs:
  - the chats against the two tenses hubs and the tests hub;
  - the tenses hub against each tense page;
  - Present Simple against Present Continuous;
  - irregular verbs against Past Simple;
  - the tests hub against each subject test;
  - each playbook against its service page and its AI-bot page.

  A10 also says no further subject is added before the Search Console vs Ads comparison (≈10.01.2027), and the test pages take no "javoblari" (answer) or DTM keywords.
- **demand-policy.json:** 23 rows measured on 25.10. The Uzbek heads «ingliz tili zamonlari» and «stomatologiya reklamasi» returned no volume, so they have no row.
- **Routes:** 13 added to `APPROVED_STATIC_ROUTE_ADDITIONS`.

**Tests vs baseline**
- 61 test files run one by one: 851 passed and 12 failed before the protected revision. All 12 failures are on the known list, so there are no new failures. The 2 homepage-lists-frozen failures were the expected pre-revision ones and pass after it.
- **Known failures that remain:**
  - gpt-chat «chat first screen», gpt-chat-business-line and gpt-chat-rev-design §5.3;
  - seo-push-revision R3-6 and R3-9;
  - react-router-v8-migration ×3 (the count gaps stay at 42 and 38);
  - seo-revenue-claims «free limits on the pricing page»;
  - studio-contact ×1 (the ai-bot-s-crm `#lead-form` link). The other old studio-contact failure, «only 149 articles», now passes.
- **After the revision:**
  - **Protection and homepage:** seo-protection 16/16, homepage-lists-frozen 4/4.
  - **Quiz and tool pages:** practice-quiz 16/16, tool-pages 18/18.
  - **Registries:** seo-intent-manifest 5/5, seo-anchor-intent 4/4, seo-cluster-quality 19/19, seo-commercial-coverage 11/11, seo-demand-gate 8/8.
- `npm run build:fast` exit 0 (329 sitemap entries). The shared stylesheet is still `index-B7Z1XlOc.css`, and the chat and practice-quiz scripts kept their names.
- `tsc -b` and `typecheck:functions` 0; eslint on the changed TS files 0; seo-audit reports no critical issues.
- `scan:secrets` finds only the old `tests/telegram-assistant.test.ts:639`.
- The Uzbek apostrophe scan is clean.

**Protection result**
- Before the new revision, the check failed only on `/` (`internalLinks` and `bodyTextSha256`). After it: "Protected SEO: 10/10 unchanged".
- The new revision is `F:\Claude\gptbot-snippets-translator-20261024\docs\seo\evidence\2026-10-25-ai-tools-b\reviewed-protected-pages.json`, chained to the wave A revision.
- **Homepage:** links go from 311 to 324. The text differs only by the 13 new labels, and the HTML is otherwise byte-identical.
- **Chats and articles:** both chats and the seven protected articles are byte-identical to the wave A build.
- The generator is `F:\Claude\gptbot-snippets-translator-20261024\docs\seo\implementation\2026-10-25-ai-tools-b\review-candidate.ts`. The baseline in `scripts/seo-protection.ts` now points at the new revision, and a test was added to `tests/seo-protection.test.ts`.

**Not done**
- No production build, deploy, IndexNow or URL Inspection; no push.
- **Release gate:** recommended before deploy, a native Uzbek read of the tenses pages and playbooks, and a subject teacher's read of the 120 questions. Only AI agents have read them so far.
- **Tests pilot:** compare Search Console impressions with Ads around 10.01.2027 before adding any other subject.
- No links from the protected chats to the new pages; that needs its own reviewed revision after the chats' 28-day window (around 21–25.11).
- `scripts/chat-layout-check.mjs` was not run for the new pages (it needs a browser).

I also added the section «AI-инструменты, волна B 25.10» to `docs/seo/CHANGE_LOG_2026-10.md`, rewrote `docs/agents-platform/HANDOFF.md`, and added the `seo_ai_tools_wave_b_20261025` block (committed_not_deployed) to `docs/agents-platform/STATE.json`, with new current, last-completed and next stages.

Files are in F:\Claude\gptbot-snippets-translator-20261024:
- content\seo\intent-manifest.json
- content\seo\demand-policy.json
- docs\seo\CHANGE_LOG_2026-10.md
- docs\agents-platform\HANDOFF.md
- docs\agents-platform\STATE.json