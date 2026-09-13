# AI-agent comparison article release — 2026-09-14

## Scope

- Publish `/ru/blog/ai-agent-ili-chat-bot/` as one informational comparison page.
- Preserve the transactional intent of `/ru/ai-bot-dlya-biznesa/`.
- Add contextual incoming links from two existing Russian articles.
- Add the canonical article URL to the stable priority sitemap without replacing the full sitemap.
- Keep all payment, account, Telegram, D1 and provider configuration unchanged.

## Reviewed protected change

The existing homepage automatically exposes every published Russian article through its prerendered blog link shell. The candidate therefore adds one homepage internal link and the corresponding visible title. `verify-candidate.mjs` confirms:

- all ten live protected contracts still match the previous reviewed baseline;
- nine candidate protected contracts are byte-equivalent at the SEO-contract level;
- `/` changes only `internalLinks` and `bodyTextSha256`;
- the only added link is `/ru/blog/ai-agent-ili-chat-bot/`;
- no internal link is removed;
- the only inserted homepage text is `AI-агент или чат-бот: что выбрать бизнесу в 2026`;
- title, H1, description, canonical, robots and hreflang remain unchanged.

Evidence: `candidate-verification.json`. Reviewed baseline: `../evidence/2026-09-14/reviewed-protected-pages.json`.

## Release state

Candidate reviewed and owner-authorized. Production deployment and live verification are pending.
