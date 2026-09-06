# Commercial, content and conversion audit — 2026-09-06

Review of the current release checkout and eight public URLs. Following the review, the main agent delegated the two P1 content corrections below; those are now implemented locally in the two named source JSON files. No deployment or third-party contact was performed by this subtask. The owner-authorized SEO work overrides the older platform-stage scope; platform and payment work remain outside this review.

Implemented local candidate: truthful forthcoming Plus description/FAQ, removal of the conflicting $5 estimate and unsupported activation/request promise, clear existing Business Telegram CTA, plain-language image-prompt descriptions, and the Uzbek SEO starting-price clarification. Existing Free RU chat link remains. URL/title/H1/canonical and the published SEO package prices are unchanged. Review dates reflect these substantive corrections. `tests/seo-revenue-claims.test.ts` covers unavailable payment, distinct existing contact/free destinations and preserved package prices. Main agent owns build, final rendered inspection and release.

## Evidence and boundaries

- Read AGENTS.md, platform state/handoff/architecture/roadmap and relevant continuation documents, `content/seo/intent-manifest.json`, `content/seo/demand-policy.json`, and `docs/seo/SEO_FOUNDATION_2026-09-06.md`.
- Current HTTP reads used the installed SEO `render_page.py` with `mode='never'`, its existing URL safety validation and BeautifulSoup. All eight URLs returned HTTP 200. No browser interaction, message, checkout or lead submission was performed.
- The wrapper path advertised as `Codex-seo` is absent. The underlying renderer works, but trafilatura is unavailable (`extracted_text=null`). Counts below are transparent HTML main-content approximations, not trafilatura E-E-A-T calculations. The chat template places its indexable summary outside `<main>`; its 11–12-word app placeholder is **not** evidence of thin content.
- Fresh authenticated statistics are inherited from the foundation evidence, not reread in this subtask: August 7–September 3, 385 GSC clicks; top six contribute 316. RU comparison and payment articles contribute 36 and 28 respectively. This is traffic, not revenue or qualified leads.
- Keyword volumes in demand-policy are dated August measurements, not a fresh market forecast. Frozen bot-service clusters must not become a mass page expansion strategy. Existing chat/instruction intent ownership remains unchanged.

| Page | HTTP | Approx. main words | Approx. words/sentence | Finding |
| --- | --- | ---: | ---: | --- |
| `/uz/seo-xizmati/` | 200 | 1,761 | 19.8 | Price-list contradiction; detailed scope, process and case link already present |
| `/uz/sayt-yaratish/` | 200 | 2,264 | 17.6 | Published scope and generic integration exclusion can conflict |
| `/uz/smm-xizmatlari/` | 200 | 1,802 | 22.2 | Package inclusions versus extra-charge wording need clarity |
| `/ru/tarify-ai-chat/` | 200 | 400 | 15.4 | Inactive Plus is described as connectable; inconsistent planned price |
| `/ru/gpt-chat/` | 200 | n/a | n/a | App placeholder plus separate indexable summary; preserve protected page |
| `/uz/gpt-uzbek-tilida/` | 200 | n/a | n/a | Same architecture; preserve protected page |
| `/ru/blog/chatgpt-i-claude-v-uzbekistane/` | 200 | 1,444 | 17.6 | No direct RU chat link in main article |
| `/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/` | 200 | 991 | 12.9 | Alternative chat links point to Uzbek interface only |

Counts include tables and related blocks; sentence splitting on punctuation is a structural proxy, not a language-validated reading grade. English Flesch thresholds should not be applied to Russian or Uzbek. Service pages exceed the internal 800-word coverage floor. Articles under 1,500 words and pricing at 400 are review flags, **not** instructions to pad copy: word count is not a Google ranking factor.

## P1 — Repair truthful paid-product information first

**Confirmed:** `content/pages/ru/tarify-ai-chat.json:69–72` still offers a roughly $5 Plus price and says a request will lead to tariff connection. The same page explicitly says Plus payment/accounts have not launched. `src/gpt-chat/components/AiAccountPanel.tsx:43–54` correctly labels the plan as upcoming and unavailable; it renders the planned 20,000 UZS figure from `src/gpt-chat/i18n.ts:148,292`. The price page therefore disagrees with the actual product and with itself.

Minimal fix, outside the ten protected pages:

1. Replace the payment FAQ with a direct statement that Plus cannot currently be purchased or activated, Free remains available, and B2B implementation is discussed separately.
2. Remove the stale $5 estimate. Do not invent a launch date or silently reinterpret an unreleased price as a current offer. The final price and terms should be published when approved and available.
3. Replace claims that users can leave a Plus request unless there is an actual supported intake path. The inspected page has no main-content contact CTA or form; its explicit action currently leads back to Free chat. A global footer contact is not a waitlist.
4. Add an explicit **B2B** discussion CTA to the already-established `https://t.me/XGame_changerx`, with a short prompt to describe the company, task and current site/channel. Do not claim a form submission, message receipt, activation or waiting-list subscription from a click.
5. Remove implementation language such as `credits после backend-запуска` from customer-facing tables; use plain planned-feature wording without adding capability promises.

Acceptance: visible FAQ and generated FAQPage agree; no claim of active paid chat; both Free and Business next steps resolve; no new credentials, checkout, payment calls or PII analytics.

## P1 — Correct one contradictory SEO pricing sentence

**Confirmed:** `content/pages/uz/seo-xizmati.json:443` says there is no ready price list immediately before an existing table with four packages, starting prices and scope. Current HTML contains both. This can undermine a commercial enquiry even though the table itself is useful.

Minimal replacement meaning: “Published prices are starting prices for the listed scope; the final estimate depends on the site and agreed work.” Preserve the existing numbers, package rows, URL, title, H1, canonical and intent. No new service or promise is needed.

Acceptance: introductory pricing paragraph agrees with the tariff table and its qualifier; existing SEO guard passes without any baseline update.

## P2 — Clarify inclusions before charging for integrations

`content/pages/uz/sayt-yaratish.json:296–316` includes Telegram/CRM integration in a package and then broadly lists CRM/payment work as separately costed. `content/pages/uz/smm-xizmatlari.json:488–508` similarly includes AI replies/CRM in package rows but uses a generic exclusion. The qualifier begins by limiting the base price to the listed scope, which helps, but its next sentence is broad enough to contradict inclusions.

Minimal fix: explicitly distinguish **work outside the selected package** and ongoing third-party fees from work already included. Preserve published prices. Do not expand the package or assert a specific integration is live without evidence. This is a clarification of the existing offer, not a new commercial commitment.

Acceptance: no included item is simultaneously excluded in an unconditional sentence; all quoted amounts unchanged; source tables and visible HTML match.

## P2 — Useful Russian article-to-chat entry, with protected intent

Confirmed current main-content links contain zero `/ru/gpt-chat/` targets on both RU leaders. The comparison article’s CTA asks for a Telegram demo. The payment guide already offers an independent chat, but only in Uzbek. This is a language/next-step opportunity, not an absent internal-link system across the site.

Causes:

- `src/shared/chat-entry.ts:2–22` is a seven-entry Uzbek-only allowlist; `chatEntryForArticle` constructs `/uz/blog/…`, and `chatEntryHref` always returns the Uzbek chat.
- `scripts/chat-entry-cta.ts` hardcodes Uzbek wording and event locale.
- `scripts/prerender-blog.ts:312–325` only enables its contextual chat sticky path for selected Uzbek clusters.
- `AiChatConsole.tsx` only restores curated article entry data for locale `uz`.

Small reviewed candidate: add two locale-aware curated entries, an optional Russian inline link to independent GPTBot and an editable example prompt. For the payment article, explicitly say that this alternative **does not purchase or activate ChatGPT Plus**. Retain official payment instructions, existing links and B2B CTA. Never redirect the article to chat, change canonical to chat, auto-send a question or require the chat to read the article.

These two articles are protected. Adding content/internal links necessarily changes their contract. Main agent should record an explicit additive diff and a deliberate narrow baseline adjustment only if choosing this improvement; do not refresh the baseline wholesale to obtain a pass. Safer first release is the unprotected pricing fixes above.

Acceptance: two RU paths and all seven UZ paths work; no cross-language prompt leakage; no automatic API send; return-to-article link uses the correct fixed path; title/H1/canonical/robots/original article blocks remain byte-equivalent; analytics contain only curated metadata, no user text.

## Quality and trust assessment

Content quality score: **not assigned**. E-E-A-T numeric factors and AI citation-readiness score: **not assigned**, because the required boilerplate-stripped extraction is unavailable and this is a bounded conversion review, not a complete external reputation audit. Numeric scoring under these conditions would imply precision not supported by the evidence.

Qualitative evidence:

- **Experience:** SEO and website services already link to a named published Graver Studio case. Do not invent a second case, client result or testimonial. SMM has a concrete sample content plan, correctly presented as a sample rather than a client outcome.
- **Expertise:** Service pages explain deliverables, ownership, process and measurement; live service bylines link to Boris Gerasimov. This is stronger than author absence. External credentials were not independently audited.
- **Authority:** Case and author links exist; external reputation and referring domains were not measured here. No authority score inferred from internal links alone.
- **Trust:** Independent-service disclosures and the free/upcoming distinction are already present. The tariff FAQ contradiction is the clearest trust defect. Existing phone/Telegram contacts should be reused; no invented company details.
- **Citation readiness:** Tables and specific scoped statements are useful citation units. Contradictory pricing and generic unsupported absolutes weaken quotability. Correct those before adding schema or lengthy text. Accurate FAQ markup alone does not guarantee a rich result.
- **Freshness:** Service pages have recent review signals, while the tariff file carries July 11 and the payment article July 30. Update dates only when substantive reviewed changes happen; do not stamp every URL with today merely for appearance.
- **AI-content markers:** Repeated generic integration disclaimers across different service types produce scope ambiguity. The SEO text also contains overly absolute explanatory statements about one page answering multiple queries and implied acquisition-cost reduction; review later using official references, without a wholesale rewrite of successful URLs.

## Revenue-oriented measurement after fixes

Measure separate cohorts: organic service visitors → pricing view → contact click → actual qualified enquiry → agreed project. Chat users and successful responses are a separate product funnel until paid consumer access exists. Neither a Telegram click nor an AI answer proves revenue. Current GA4 key-event configuration and historical event counts are documented in the foundation; do not reconfigure or claim causal uplift from this audit.

No new pages, bulk outreach, link purchases, fake reviews, rank guarantees or broad retargeting are recommended in this first wave. The smallest measurable commercial improvements are truthful tariff information and a clear existing contact path.

## Follow-up: confirmed provider-fact corrections on the protected RU comparison

The visual review exposed additional factual defects that the initial conversion-focused pass did not fully validate. Main agent explicitly delegated targeted corrections in `content/blog/ru/chatgpt-i-claude-v-uzbekistane.json`, including two misleading H2 headings. This is a documented factual correction to protected text, not an automatic baseline refresh.

Local candidate verified against HEAD: **URL, title, H1, description, canonical, hreflang, robots remain identical**. Body has the same 35 blocks in the same type/order. Exactly two heading changes were authorized:

- `Регистрация: 2 минуты, номер +998 подходит` → `Регистрация: способы входа и проверка аккаунта`.
- `Тарифы 2026 в сумах: полная таблица` → `Тарифы 2026: как проверить цену и сумму в сумах`.

Changes and current primary-source evidence (checked September 6):

| Old claim | Correction | Primary evidence |
| --- | --- | --- |
| Go can be shared by six family/team members | Individual account; others need their own account | [OpenAI account sharing](https://help.openai.com/en/articles/10471989-openai-account-sharing-policy) |
| Go is $5 / 61,000 UZS for 89 countries | Go supports all supported ChatGPT countries; current account checkout determines price | [Go](https://help.openai.com/en/articles/11989085-what-is-chatgpt-go), [ChatGPT plans](https://chatgpt.com/pricing/) |
| Any Uzbek bank card will work | Card, bank, region and authentication can affect acceptance | [OpenAI payment failures](https://help.openai.com/en/articles/7232916-why-was-my-credit-card-declined), [Claude billing](https://support.claude.com/en/articles/8325618-paid-plan-billing-faqs) |
| Both services require +998 verification; signup takes two minutes | OpenAI phone verification is not required for ChatGPT; Claude follows its current registration checks, no time promise | [OpenAI verification](https://help.openai.com/en/articles/8983040-what-does-phone-verification-look-like), [Claude signup](https://support.claude.com/en/articles/8325609-how-do-i-sign-up-for-the-pro-plan) |
| USD-only billing and fixed UZS conversions | Currency, region, tax and bank conversion determine actual amount | [OpenAI currencies](https://help.openai.com/en/articles/10421635-multi-currency-billing), [Claude Pro regional pricing](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan) |
| Google Play topup through Payme/Uzum in one click; app price always 10–15% higher | No universal wallet-topup confirmation; use country-specific supported methods and compare actual totals | [Google Play methods](https://support.google.com/googleplay/answer/2651410?hl=en), [Claude app billing](https://support.claude.com/en/articles/8325618-paid-plan-billing-faqs) |
| Access in Uzbekistan implies every function and payment works | Country supported, but network/function/payment checks remain separate | [ChatGPT countries](https://help.openai.com/en/articles/7947663-chatgpt-supported-countries), [Claude countries](https://support.claude.com/en/articles/8461763-where-can-i-access-claude), [Gemini web countries](https://support.google.com/gemini/answer/13575153?hl=en) |
| “Full limits”, best-model rankings and fixed cost-saving bundle | Limits persist; individual comparisons are editorial guidance, not a benchmark; choose current plans for actual tasks | [Claude plans](https://support.claude.com/en/articles/11049762-choose-a-claude-plan), [ChatGPT plans](https://chatgpt.com/pricing/), [Google AI plans](https://one.google.com/about/google-ai-plans/) |

Removed unsupported fixed exchange rate, reseller markups, proportions of supposedly irrelevant guides, bank issuance timing, a 300,000 UZS multi-account budget, salary percentage, service-market price ranges and the 2–3x productivity claim. No substitute statistic was invented. Original visible source list cited API models and local payment developer docs, which did not substantiate those claims. Fifteen relevant official links now support the revised article and carry an actual review date. App/checkout prices were not personally purchased or verified, hence the guide explicitly avoids pretending to know a local final quote.

Business integration wording now distinguishes a separately configured project from a personal provider subscription; payment to independent GPTBot does not activate ChatGPT Plus. Existing business CTA destinations remain unchanged. `ogDescription` no longer promises unconditional bank acceptance. General comparison intent and all other headings remain intact.

Validation: 12/12 provider-fact plus existing commercial tests pass, scoped ESLint passes and diff-check has no whitespace errors. New test: `tests/seo-provider-facts.test.ts`; main agent must include it in the standard suite and perform final build/rendered source validation and the explicitly reviewed protected-baseline update. No commit, push or deployment by this subtask.
