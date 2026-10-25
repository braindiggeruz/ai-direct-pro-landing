# HANDOFF — AI tool pages platform (role presets, page chips, calculator and irregular-verbs widgets) · 25.10.2026

## 1. Состояние
- Дата: 2026-10-25.
- Ветка: seo/chat-snippets-translator-20261024 (worktree F:/Claude/gptbot-snippets-translator-20261024); production line, merge it into codex/continuation-20261007 before any deploy from there.
- HEAD: the commit «feat(chat): AI tool pages — role presets, page starters, calculator and irregular-verbs widgets» on top of 5a579414 (production 62d8fdb0, deployment 97f56ab5, plus research docs).
- Завершённый этап: AI tool pages platform (code only). STATE.json block chat_tool_platform_20261025 (committed_not_deployed).
- Следующий этап: AI tool content pages on this platform (STATE.json next_stage).
- Рабочее дерево: clean after the commit, except files that were untracked before this stage. Not deployed, not pushed.
- Resume note: a previous session (12:47–14:05) died before committing; its uncommitted work was reviewed, finished and committed here, not restarted.

## 2. Что сделано
Owner order 25.10: every new page is an AI tool of GPTBot.uz (a result from the AI chat or a free in-browser tool, then the AI chat / AI pack or the ad and bot services). This stage builds the platform; no content page uses the new fields yet.
- Role presets: CHAT_ROLE_PRESETS = translator, teacher, smm, marketer, business, writer. New role writer (RU «Автор текстов» / «Стихи, поздравления, подписи», UZ «Ijodkor» / «She’r, tabrik va matnlar»): original texts on request, no copying of known authors or archives, respectful, no political or religious judgements, Uzbek in Latin with o‘ g‘ ’.
- Page.chatStarters: up to 6 chips {label ≤ 40, prompt ≤ 400}, plain text. The build refuses invalid ones (scripts/tool-widgets.ts assertToolPage); prerender writes data-chat-starters (escaped JSON) only when set, plus the frame's labelled chips; the chat's lazy part chat-tool reads them only whole; the chat shows them instead of its four default tasks; a chip fills and focuses the composer and never sends.
- Page.widgets: uz-translit (the translator pages' converter, unchanged), calculator, irregular-verbs. Each is static prerendered HTML under the chat (text, table, noscript note) and its own Vite entry, loaded only on a page that lists it; no model call.
- calculator: tokenizer + recursive-descent parser (no eval / Function): + − × ÷ ^ % brackets, unary minus, decimals with . or ,, sqrt/√, sin cos tan with DEG/RAD, log, ln, pi, e, implicit multiplication, phone-style percent (200 + 10% = 220), error codes with RU/UZ messages, history of the last 10 (memory only), keyboard (Enter, Esc, digits on the keys).
- irregular-verbs: 163 verbs, standard V1/V2/V3 (be — was/were — been; get — got — got/gotten; learn — learned/learnt), RU and UZ translations; search by any form or translation, hide-a-column practice, a 10-question quiz with score and mistakes.
- AI bridge: window CustomEvent «gptbot:prefill» {text} (src/shared/chat-prefill.ts). Calculator «Объяснить с AI / AI bilan tushuntirish» prefills «Объясни по шагам: <expression> = <result>» (localized, with the angle unit when trig is used) and scrolls to the chat; verbs «Потренироваться с AI / AI bilan mashq qilish» prefills an exercise request (with the quiz mistakes when there are some). The chat listens only on pages with a role; nothing is auto-sent or sent to analytics.
- Bundle budget: the start had reached 110.1 kB br. The role picker's names and descriptions moved to src/gpt-chat/role-labels.ts (lazy part chat-role, which alone shows them); the chips' row CSS moved out of premium.css (held to 30 000 B by tests) into an inline <style> in the head of pages with chips only. Start now 109 790 B (HEAD 109 765, limit 110 000); start CSS and page CSS identical to HEAD.
- A variable named table in the verbs widget made Tailwind (it scans src/** and scripts/**) emit «.!table» and rename the shared index-*.css on every page; renamed, the shared CSS is index-B7Z1XlOc.css as in production.

## 3. Изменённые файлы
- New: scripts/tool-widgets.ts (content gate, widget blocks, scripts, chips frame, head preload + STARTERS_STYLE), scripts/widgets/{calculator-block,irregular-verbs-block,html}.ts (static HTML and RU/UZ copy), src/tools/calculator/{engine,main}.ts, src/tools/irregular-verbs/{data,quiz,main}.ts, src/shared/chat-starters.ts (type, caps, checks), src/shared/chat-prefill.ts (event), src/gpt-chat/parts/chat-tool.ts (lazy part: chips + bridge), src/gpt-chat/role-labels.ts (picker names), tests/tool-pages.test.ts, tests/calculator-engine.test.ts, tests/irregular-verbs.test.ts.
- Changed: src/shared/types.ts (presets, PAGE_WIDGETS, Page.chatStarters / widgets), src/gpt-chat/roles.ts (writer; instructions only), src/gpt-chat/components/RoleSelector.tsx and parts/chat-role.ts (names from role-labels), src/gpt-chat/main.tsx (loads chat-tool on role pages; waits for it when the page has chips), lazy-part.tsx (toolPart), components/AiChatConsole.tsx and AiPromptChips.tsx (page chips, up to 6, no icons), types.ts (MountConfig.starters), scripts/prerender.ts (widgets, chips frame, head), scripts/translator-page.ts (data-chat-starters; converter only with the widget), scripts/vite-manifest.ts (entries, dynamicChunk), vite.config.ts (two entries), src/uz-translit/main.ts (comment), content/pages/ru/russko-uzbekskiy-perevodchik.json and content/pages/uz/rus-ozbek-tarjimon.json (+ "widgets": ["uz-translit"], needed since the converter is now a widget; their HTML is byte-identical), tests/translator-pages, gpt-chat (8 roles, import), chat-bundle-budget (lazy-only lists), DECISIONS.md (D-AI-TOOL-PAGES-20261025), this file, STATE.json.

## 4. Архитектурные решения
D-AI-TOOL-PAGES-20261025 in DECISIONS.md: a gpt-chat page with a chatRole is an AI tool page; chatStarters and widgets only there, checked at build; widgets are static HTML + own entry, no model; the only tool → chat path is the gptbot:prefill event into the composer, never a send; role names live in the lazy picker part; the chips' style is inline on chip pages only. Backend unchanged.

## 5. Что сознательно не сделано
No content page (the next stage writes them from CLUSTERS_TO_ADD.md and AD_CLIENT_FUNNEL.md). No server-side role allowlist (roles stay a message prefix, as before). Out of scope by owner order: currency rates, calendar, PDF tools, QR. No protected page touched; no deploy, no push.

## 6. Проверки
- npx tsc -b → exit 0; npm run typecheck:functions → exit 0.
- npm run build:fast → exit 0 (126 pages, 173 articles, 305 sitemap entries).
- dist vs the HEAD build: 339 of 344 files byte-identical; /ru/gpt-chat/, /uz/gpt-uzbek-tilida/ and both translator pages differ only by the gpt-chat-*.js name.
- npx tsx scripts/seo-protection.ts check → «Protected SEO: 10/10 unchanged.»
- npx tsx scripts/chat-bundle-budget.ts → within budget: start 109 790 B br, start CSS 6 764 B, page CSS 26 919 B, chat-tool 941 B, chat-role 2 012 B.
- node --import tsx --test: tool-pages 18/18, calculator-engine 58/58, irregular-verbs 11/11, translator-pages 13/13, uz-translit 94/94, gpt-chat-prerender-links 14/14, seo-page-integrity 17/17, chat-bundle-budget 11/11, gpt-chat-lazy-part 10/10, gpt-chat-honesty 27/27, seo-protection 14/14, chat-entry 6/6. 33 chat/SEO files: 556 pass, 14 fail, all pre-existing (identical names on a clean HEAD worktree).
- npx eslint on the 33 touched TS/TSX files → 0. npx tsx scripts/seo-audit.ts → no critical issues.
- Browser (local static preview of two temporary draft pages, deleted): chips fill and focus the composer; calculator keys, Enter, division-by-zero message, 2^3^2 + sin 30 = 512.5; «Объяснить с AI» prefills and scrolls to the chat; verbs search, hide V2, quiz 6/10 with the mistakes prompt; 375 px without horizontal scroll.

## 7. Известные проблемы
- Pre-existing (same on HEAD): gpt-chat «chat first screen…», chat-ui-revision browser acceptance, gpt-chat-rev-design §5.3, gpt-chat-business-line, gpt-account-ui ×2, seo-push-revision R3-6/R3-9, react-router-v8-migration ×3, seo-revenue-claims (pricing free limits), studio-contact ×2, and the older list in the previous handoff.
- New in this stage: none known. Headroom is small: the chat start is 210 B under 110 kB and premium.css is close to its 30 000 B test cap; put tool-page-only code in the lazy part chat-tool and tool-page-only CSS in STARTERS_STYLE or a widget block.
- External: two deploy lanes share the Pages project (a deploy from another branch without this commit reverts it). Click Merchant -12 fiscal blocker unchanged.

## 8. Следующая задача
Write the AI tool content pages on this platform from docs/seo/research/2026-10-25-clusters-to-add/CLUSTERS_TO_ADD.md (section 3 cards, section 9 corrections) and docs/seo/research/2026-10-25-ad-client-funnel/AD_CLIENT_FUNNEL.md (sections 3, 5, corrected 11): each page sets pageType gpt-chat, chatRole, chatStarters and, where it fits, widgets ["calculator"] or ["irregular-verbs"]; intent-manifest ownership first; honest copy (independent service, trial of 3 replies then the AI pack, only tariff prices printed on the site); original samples labelled as AI-assisted and edited. Then a guarded release on owner command.

## 9. Acceptance criteria
A new tool page: build passes assertToolPage; its HTML has data-chat-role, data-chat-starters and the widget section(s) with one script per widget; the protected pages stay 10/10; the two main chats and the translator pages keep their HTML except asset names; chat-bundle-budget passes without raising a limit; tests/tool-pages.test.ts passes (its dist test checks every built tool page loads exactly its widgets' scripts).

## 10. Команды для старта
git status --short; git log -3 --oneline. $env:NODE_OPTIONS='--max-old-space-size=1400'; npx tsc -b; node --import tsx --test tests/tool-pages.test.ts tests/translator-pages.test.ts; npm run build:fast; npx tsx scripts/chat-bundle-budget.ts; npx tsx scripts/seo-protection.ts check. Local preview of a draft tool page: $env:PREVIEW_DRAFTS='/ru/<slug>/'; npx vite build; npx tsx scripts/prerender.ts; serve dist; clear the variable and rebuild before any release build.

## 11. Риски
Do not import src/shared/chat-starters.ts, chat-prefill.ts or parts/chat-tool.ts from the chat's start code (tests and the budget catch it). A widget entry must import the bridge as types only, or Vite shares a chunk with the chat. Identifiers like table/hidden next to «!» in src/** or scripts/** can make Tailwind emit a utility and rename the shared CSS on every page: compare index-*.css with production after a build. Chips and AI buttons only prefill; never add an auto-send. No ranking or traffic guarantee.

## 12. Rollback
git revert of this commit restores the previous chat, roles, prerender and the translator pages' converter path together (the translator JSON loses "widgets" with it). No DB, config or backend change.
