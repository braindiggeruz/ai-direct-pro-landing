# RU GPT explainer refresh — 2026-10-03

## Scope and reason

Updated only `content/pages/ru/chto-takoe-gpt-i-kak-polzovatsya.json` and this note. The existing article already explained tokens, context and transformer architecture. Its gaps were the missing distinction between GPTBot.uz and OpenAI, examples without an explicit verification step, and a link described as a Russian chat interface that led to another information page.

The demand map assigns this URL the GPT explanation intent. The broad `gpt` provider volume is a research signal, not a traffic forecast or evidence that the page should target every AI definition. No new URL or general AI encyclopedia was created.

## Result

- Clarified GPT as a model family from OpenAI, ChatGPT as an OpenAI product, and GPTBot.uz as an independent service. Kept the text-generation explanation scoped to text dialogue; no model or product feature list was added.
- Added two original exercises: extracting stated facts while identifying missing details, and explaining a simple proportional calculation. Each includes an independent verification method. The data is explicitly educational; these are not recorded model answers or customer outcomes.
- Linked the Russian practice step directly to `/ru/gpt-chat/` and the next learning step to the existing `/ru/gpt-chat-guide/`. Existing comparison and prompt links remain.
- Updated the matching FAQ and added one question distinguishing GPTBot.uz from official ChatGPT. Preserved the Article/FAQPage template contract.
- Preserved URL, canonical, H1, title, description, OG title/description, keyword ownership, indexability, publication date and the existing Uzbek example. Set `lastReviewedAt` and `updatedAt` to 2026-10-03 for this substantive review. The existing prerenderer derives Article `dateModified` from those fields.

## Primary sources checked on 2026-10-03

| Source | Use |
| --- | --- |
| [OpenAI: Improving language understanding with unsupervised learning](https://openai.com/index/language-unsupervised/) | Origin of the GPT work and the distinction between pretraining and later adaptation. No historical benchmark figures copied. |
| [Attention Is All You Need](https://arxiv.org/abs/1706.03762) | Existing transformer explanation; primary research paper. |
| [GPT-4 Technical Report](https://arxiv.org/abs/2303.08774) | Existing next-token explanation and limitations; no current GPTBot.uz model identity inferred. |
| [OpenAI: Understanding and counting tokens](https://help.openai.com/en/articles/4936856-understanding-and-counting-tokens) | Tokens differ from words; language/encoding and context limits matter. Uses the current destination after the old token article URL redirects. |
| [Official ChatGPT overview](https://chatgpt.com/overview/) | Product identity. Its tools and availability are not attributed to GPTBot.uz. |
| [OpenAI: Does ChatGPT tell the truth?](https://help.openai.com/en/articles/8313428-does-chatgpt-tell-the-truth) | Confident errors, fabricated citations and verification; search is a tool rather than an inherent guarantee of text generation. |

GPTBot.uz identity is also supported by current local product copy in `content/pages/ru/gpt-chat.json` and `src/gpt-chat/i18n.ts`: independent service, third-party models. No current limits, prices, registration rules or fixed model names were copied into the explainer. The older “What is ChatGPT?” Help Center entry was inspected but not used for current product claims because it still contains legacy GPT-3.5 and internet-access wording.

## Verification

- `node --import tsx --test tests/seo-content-guards.test.ts tests/seo-intent-manifest.test.ts`: **12 passed, 0 failed, 0 skipped**.
- Source checks: JSON parses; metadata/URL/keyword contract matches HEAD; all 13 internal link occurrences resolve to published content; all TOC anchors resolve to unique section IDs; all `linkp` tokens have matching targets; the example calculation independently yields 60.
- `git diff --check`: passed for the owned files.

No model request, form submission or production mutation was used to validate the exercises. Build, prerender, full SEO audit, typecheck and rendered HTML/FAQ checks belong to the coordinating release pass; this note does not claim those checks ran for this new content revision yet.
