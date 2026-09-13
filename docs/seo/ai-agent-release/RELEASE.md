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

Deployed and live-verified on 2026-09-14.

- Runtime commit: `bb931b955aedf232a05bebdcf8c3c70492bf0e75`.
- Cloudflare Pages deployment: `ec5e4911-9e1e-4a9b-b7ee-6864e1ba3fe7`.
- Release artifact: 918 files, SHA-256 `95703b896e9c0032e6c001005c096776388cbbe8aef5b940491b99999ee06b48`.
- Full suite: 602/602; application, Functions and Lead Radar typechecks pass; secret scan is clean.
- Protected SEO contracts: 10/10 unchanged against the reviewed 2026-09-14 baseline.
- The article, canonical, Article and FAQPage schemas, homepage link, three responsive WebP assets, both sitemaps, robots.txt and admin cache/indexing headers passed custom-domain readback.
- The full sitemap contains 289 canonical URLs; the additive priority sitemap contains 18 and includes the new article.
- Payment configuration remains absent from the public auth contract. No migration, provider call, payment action or Telegram send occurred.

The first direct upload attempt exposed a pre-existing Workers Free limit breach: 56 public text settings plus 35 secrets exceeded Cloudflare's 64-variable ceiling. Public settings are now delivered as one 2,565-byte text JSON binding and hydrated through an explicit 56-key allowlist. The final project has 36 variables (35 unchanged secrets plus one public config binding). D1, KV, both R2 buckets, Service, Queue, AI and Smart Placement are byte-equivalent to the pre-release configuration. A live CORS/auth canary returned the expected 204 preflight and 401 unauthenticated response.

Evidence: `live-verification.json`. The private pre/post Cloudflare configuration snapshots remain outside Git. Publication and sitemap inclusion do not guarantee Google indexing; submit the priority sitemap and inspect the article URL in Google Search Console.
