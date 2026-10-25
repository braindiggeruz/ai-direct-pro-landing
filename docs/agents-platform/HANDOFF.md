# HANDOFF — practice-quiz widget for AI test pages (code platform for the tests pilot) · 25.10.2026

## 1. Состояние
- Дата: 2026-10-25.
- Ветка: seo/chat-snippets-translator-20261024 (worktree F:/Claude/gptbot-snippets-translator-20261024).
- HEAD: the commit «feat(tools): practice-quiz widget for AI test pages» on top of 07fa6d36 (wave A deployed: deployment 8d4c8b4e from 99920cdc, reports/ai-tools-wave-a-20261025/RELEASE.md; the wave A handoff is 07fa6d36:docs/agents-platform/HANDOFF.md).
- Завершённый этап: practice-quiz widget (code only, no content page, no real question set). STATE.json block practice_quiz_widget_20261025 (committed_not_deployed).
- Следующий этап: AI tools wave B content on this platform (tests pilot informatika / fizika / matematika with original question sets; English tenses), integrated by the wave B integrator (STATE.json next_stage).
- Рабочее дерево: other wave B agents' uncommitted content files (English tenses pages under content/pages/) were in the tree during this stage; they are not part of this commit and were not touched. Not deployed, not pushed.

## 2. Что сделано
- New widget id `practice-quiz` in PAGE_WIDGETS and new field `Page.quizSet` (the id of a question set). The gate (scripts/tool-widgets.ts quizPageIssues, called by toolPageIssues/assertToolPage) refuses: quizSet without the widget, the widget without quizSet, an unregistered set, a set in another language than the page, an invalid set, a question whose request for the chat would exceed CHAT_PREFILL_MAX (1500), and quizSet on a page that is not an AI tool page.
- Question sets are typed data modules `src/tools/quiz/sets/<id>.ts` (type QuizSet, src/tools/quiz/set.ts) registered in `src/tools/quiz/sets/index.ts` (QUIZ_SETS, empty: real sets are written by the content agent). Rules (quizSetIssues): id and question ids `[a-z0-9-]`, ≤ 40; locale ru|uz; subject ≤ 60; title ≤ 120; 1–120 questions; grade optional whole 1–11; topic ≤ 60; q ≤ 600 and explanation ≤ 1200 (line breaks kept); exactly 4 different one-line options ≤ 200; answer 0–3; no duplicate question text; no «</script» or «<!--» (they would break the JSON-LD); no unknown fields. Markup is allowed (escaped).
- Prerender (scripts/widgets/practice-quiz-block.ts): crawlable HTML — the set's h2, an honest intro (original practice questions written for the page, not official exam material, not real test answers), the hidden-until-JS bar (grade and topic selects only when the set has more than one value, score, «Qaytadan boshlash / Начать заново»), every question with its number/grade/topic line, the question, four lettered options, and a native `<details>` «Javob va izoh / Ответ и разбор» with the key line and the explanation; the AI note (it spends a trial answer or the AI pack) and a noscript note. Everything escaped.
- JSON-LD: the repo's @graph builder took it cleanly — `graph.push(...toolJsonLd(page, fullUrl))` in scripts/prerender.ts buildJsonLd adds one schema.org `Quiz` (hasPart: Question, eduQuestionType «Multiple choice», acceptedAnswer with answerExplanation, suggestedAnswer for the other options, educationalLevel from the grade, about = subject/topic, isPartOf the #webpage); [] on every other page.
- Vite entry `practice-quiz` (src/tools/quiz/main.ts, 4.6 kB, 1.7 kB br, no shared chunk), loaded only where the widget is listed: options become buttons; a pick is checked at once (first pick counts, aria-disabled after), right/wrong marks, feedback line, the `<details>` opens; score over the questions shown; grade/topic choice; restart; per question «AI bilan tushuntirish / Объяснить с AI» puts the subject, question, four options and, after a pick, the pick and the page's key into the composer through `gptbot:prefill` (type-only import), never sends; before a pick it asks for the reasoning, not the answer. No request, no storage, no model call. Logic in src/tools/quiz/logic.ts (pure).
- Tailwind no longer scans src/tools/quiz/sets/** (`'!./src/tools/quiz/sets/**'` in tailwind.config.js): question words cannot add rules to the shared stylesheet. Verified: a probe with «contents grayscale sepia ordinal» in that folder leaves the Tailwind output byte-identical; the same probe elsewhere in src/ adds rules.

## 3. Изменённые файлы
- New: src/tools/quiz/set.ts (format, limits, quizSetIssues, findQuizSet), src/tools/quiz/logic.ts (picks, score, view, prefill text, templates), src/tools/quiz/main.ts (the entry), src/tools/quiz/sets/index.ts (registry, empty), scripts/widgets/practice-quiz-block.ts (copy RU/UZ, style, render, prefill check, JSON-LD), tests/practice-quiz.test.ts (16 tests; the two sample sets live only here).
- Changed: src/shared/types.ts (PAGE_WIDGETS + 'practice-quiz', Page.quizSet), scripts/tool-widgets.ts (WIDGET_ENTRY, RENDER, quizPageIssues, pageQuizSet, toolJsonLd; sets injectable for tests), scripts/vite-manifest.ts (ENTRIES.practiceQuiz), vite.config.ts (input 'practice-quiz'), scripts/prerender.ts (one graph.push line + import), tailwind.config.js (negated glob), tests/tool-pages.test.ts (widget list, scripts map, quizSet among the protected chats' absent fields).
- Docs: this file, STATE.json (block practice_quiz_widget_20261025, current_stage, next_stage), DECISIONS.md (D-PRACTICE-QUIZ-20261025).

## 4. Архитектурные решения
D-PRACTICE-QUIZ-20261025 (DECISIONS.md): sets are typed TS data modules registered by one import, read only by the build; the entry reads the questions back from the HTML (no set in any bundle); the key is in a native `<details>` so the page works and is crawlable without JS; the first pick counts; the AI request carries the page's key after a pick so the chat explains from the same answer; Tailwind ignores the sets folder.

## 5. Что сознательно не сделано
No real question set and no content page (content agent / integrator). No registry edits (intent-manifest, demand-policy, react-router-v8-migration routes, llms*.txt: integrator only). No separate «study-test» role: the pages use the existing `teacher` role and chips. No shuffling, no timer, no saving of picks (in memory only). No Google rich-result promise: the Quiz node is valid schema.org; eligibility for any Google feature was not checked. No deploy, no push.

## 6. Проверки
- npm run build:fast → exit 0 (in this tree and in an isolated worktree at 07fa6d36 + this change). dist vs the production build of 99920cdc: 986 of 986 common files byte-identical, the only new file is assets/practice-quiz-FAFRG24f.js; shared CSS index-B7Z1XlOc.css, chat gpt-chat-cfOqBGh8.js and gpt-chat-CNoiPl9O.css unchanged.
- npx tsx scripts/seo-protection.ts check → «Protected SEO: 10/10 unchanged.»; npx tsx scripts/chat-bundle-budget.ts → within budget (start unchanged).
- node --import tsx --test, file by file: practice-quiz 16/16, tool-pages 18/18, chat-bundle-budget 11/11, gpt-chat-prerender-links 14/14, seo-protection 15/15, irregular-verbs 11/11, calculator-engine 58/58, translator-pages 13/13.
- npx tsc -b → 0; npm run typecheck:functions → 0; npx eslint on the 13 touched TS/JS files and scripts/prerender.ts → 0.
- Browser (local static preview of a temporary draft page with a temporary 4-question Uzbek set, both deleted, never committed): a wrong pick marks red/green, opens the explanation, score «To‘g‘ri: 1 tadan 0 ta · javob berilgan: 4 tadan 1 ta.»; a second pick is ignored; grade 9 shows 2 questions; grade 9 + a topic without questions says so; «Barcha savollarga javob berildi» when all shown are answered; restart clears marks, details and score; «AI bilan tushuntirish» filled and focused the composer with the expected text and scrolled to the chat, nothing sent; escaped `<p>` and `<b>` in a question show as text; 375 px without horizontal scroll; no request from the widget.

## 7. Известные проблемы
- Before this stage: the pre-existing test failures listed in the wave A handoff (07fa6d36) are unchanged; this stage did not re-run all 61 files.
- From this stage: none known. The Uzbek copy of the widget was written by an AI agent, not read by a native speaker (simple phrases, mirrored on the calculator and verbs widgets).
- Content risk for the pilot (CLUSTERS_TO_ADD card 7): the ×10–100 demand jump since Dec 2025 may be people looking for answers during real tests; build the pilot (informatika/fizika/matematika) first, compare GSC impressions with Ads after 4–6 weeks, no «test javoblari» or DTM keys, no full bank without the pilot.

## 8. Следующая задача
Wave B content on this platform (integrator): a content agent writes original question sets (40–60 per subject, each with an explanation) as src/tools/quiz/sets/<id>.ts and registers them; pages declare `"widgets": ["practice-quiz"]` and `"quizSet": "<id>"`; the integrator adds manifest/demand/routes/llms rows and the protected revision if the homepage changes.

## 9. Acceptance criteria
For each quiz page: build passes the gate (no issue from toolPageIssues), the page HTML has one `data-practice-quiz` section with every question and a `<details>` per question, one `practice-quiz-*.js` script and one `"@type":"Quiz"` node; no other page carries them (tests/practice-quiz.test.ts «built» test); shared CSS name unchanged; chat budget unchanged; seo-protection 10/10 against the then-current baseline.

## 10. Команды для старта
git status --short; git log -3 --oneline. $env:NODE_OPTIONS='--max-old-space-size=1400'; npm run build:fast; npx tsx scripts/seo-protection.ts check; node --import tsx --test tests/practice-quiz.test.ts; node --import tsx --test tests/tool-pages.test.ts; node --import tsx --test tests/chat-bundle-budget.test.ts.

## 11. Риски
A set file outside src/tools/quiz/sets/ would be scanned by Tailwind and can rename the shared CSS. The entry must keep a type-only import of the bridge (a value import would share a chunk with the chat). Do not put the answer key outside the `<details>` and never auto-send. Questions must be original: no leaked exam answers, no claim of official material.

## 12. Rollback
git revert of this commit removes the widget, the field, the entry, the JSON-LD line and the Tailwind exclusion together; no page uses them yet, so every page's HTML stays as it is. No DB, config or backend change.
