# Chat UI and article entry release — 2026-09-05

Status: reviewed locally, owner-authorized production release pending guarded upload and live readback.

## Scope

Based on origin/main 68410c2, including deployed AEO runtime 2e4458c. Carries the reviewed shadcn chat UI from gptbot-top3-20260903. Official @shadcn/react 0.3.1 and ten local UI primitives; graphite, mint and violet theme, responsive composer, accessible Radix dialogs and message scrolling, local archived conversations, safe Markdown.

Consumer billing is deliberately not activated. The Plus dialog clearly says upcoming and makes no account, authentication or payment request. Premium backend WIP and its migration remain in the source worktree. This release changes no functions, migrations, wrangler variables/bindings or lead bot. The existing free session and quota survive new-chat and history actions.

## Article to chat

Seven curated Uzbek articles (download, login, access, prompts, students, essay, comparison) gain an inline contextual CTA after the opening material, plus a mobile bottom CTA and matching header link. Business articles retain their business funnel. Links are ordinary same-tab anchors into the single Uzbek chat URL, using fixed entry IDs in the fragment. No redirect, new indexable URL or heavy chat bundle is added to articles.

A fixed example is editable on arrival; nothing is automatically sent. Existing chat history remains, and a local return-to-article link appears above the composer. Arbitrary prompts and return URLs are never read from URL parameters. Analytics records article_chat_click, and source/intent on chat_opened, message_sent and ai_response_success; it never sends question or answer text. Production analytics ingestion/conversion lift are not claimed by local event checks.

## Verification

- Full suite: 540/540; Pages release/config suite: 12/12.
- App TypeScript and scoped ESLint pass; git diff whitespace check clean.
- Public Vite + prerender and admin builds pass. Final build stamp/upload occur after reviewed commit.
- Built RU/UZ browser checks at 360, 393 and 1440 px: no horizontal overflow, visible composer, menu focus return, Plus dialog, prompt editing and synthetic answer/compact viewport.
- Nine article -> chat -> article browser flows: canonical intact, fixed prompt, no automatic request, correct source metadata and return link.
- Seven public pages compared to pre-release production: exact Title, description, H1, canonical, robots, structured data and article body preserved (apart from the added CTA).
- Evidence: docs/gpt-chat/evidence/*.json and screenshots. Synthetic answer tests are not real payment/provider verification.

## SEO acceptance

The owner's screenshot shows page views, not search queries or proof of organic conversions. Indexable content remains in initial HTML. Keep page intent ownership and self-canonicals. Measure GSC clicks/impressions on the same seven URLs and article-to-chat/first-response conversions after release; rankings and conversion gains cannot be guaranteed. No automatic search submissions or changes to the search strategy are included.

## Rollback and continuation

Use the guarded Pages release flow; preserve the latest production ancestry and full public/admin artifact. Revert only this runtime commit on top of the then-current main and rebuild to roll back. Never deploy the older premium worktree wholesale. Payment integration remains a separate release after merchant configuration and schema reconciliation.
