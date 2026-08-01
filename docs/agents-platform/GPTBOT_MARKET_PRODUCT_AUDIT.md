# GPTBot Market — product audit

**Audit date:** 2026-08-01
**Mode:** AUDIT-ONLY; implementation has not started
**Canonical repository:** `F:\Claude\gptbot-repo-clean-20260801`
**Product surfaces:** GPTBot.uz → Sotuvchi landing → `@gptbot_market_bot` → protected Owner Control Center

## Executive verdict

GPTBot Market has an unusually strong transactional and security foundation for its commercial age, but it is not yet one coherent market product. The code can protect tenants, ground catalog facts, create an order request exactly once and route a human question safely. The market experience still lacks visual merchandise, real seller proof, a truthful acquisition path, a stable name architecture and the operating evidence required for trust.

**Overall commercial readiness: 41%.** This is not an average of the ratings below. The method is gate-based: a product cannot score above its weakest required launch layer. Engineering and deterministic correctness are strong; product proof, seller acquisition, real operations, visual trust and repeatable growth are gating. Synthetic catalog success cannot substitute for one consented real store completing a measured buyer → seller loop.

**Release recommendation:** do not open a public marketplace and do not market self-service seller onboarding. Proceed only to **Stage 0 — Evidence closure and truth alignment**, then a separately authorized Store Pilot #1.

## Evidence and confidence

### First-party evidence read in full

- `docs/agents-platform/HANDOFF.md`, `STATE.json`, `ARCHITECTURE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `KNOWN_ISSUES.md`, `TEST_MATRIX.md`, `DECISIONS.md` and `GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md`.
- Current implementation under `functions/agents/sotuvchi/**`, `functions/api/telegram/agents.ts`, `functions/lib/telegram/renderer.ts`, `src/admin/pages/owner/**` and RU/UZ landing JSON.
- Public production screenshots in [`evidence/gptbot-market-audit-2026-08-01/`](./evidence/gptbot-market-audit-2026-08-01/README.md).
- Read-only Git, Cloudflare Pages, D1 and HTTP canaries. Exact evidence is recorded in `GPTBOT_MARKET_PRODUCTION_READINESS_GAP.md`.

### Evidence grades

| Grade | Meaning | Used for |
|---|---|---|
| A | Live, independently observed | public website, t.me identity, HTTP behavior, deployment/Git/D1 state |
| B | Current code plus passing automated tests | bot state machines, authorization, grounding, idempotency, Owner capabilities |
| C | Governance or owner report | prior Telegram walkthrough and one cold-isolate latency sample |
| `EVIDENCE_GAP` | Not visually or operationally observed | live chat screens, authenticated Owner UI, real seller/buyer behavior, repeatable p95 |

Code/test evidence proves behavior contracts; it does **not** prove that an iOS or Android user understands, trusts or enjoys the experience.

## Four readiness layers

| Layer | Status | Evidence | Verdict |
|---|---|---|---|
| 1. Code works | Strong | grounded catalog; buyer/seller authority; inventory/order/handoff idempotency; role-aware release; targeted and release suites | `pilot-capable foundation` |
| 2. People understand it | Uneven | buyer home is direct, but GPTBot/GPTBot Market/Sotuvchi promises conflict and seller CTA does not do what it implies | not ready |
| 3. People trust and desire it | Weak | no visible product media, seller proof, buyer proof, service standard or complete Telegram visual evidence | not ready |
| 4. Packaged, operated and growing | Absent/early | no real stores, orders, support roster, retention baseline, acquisition loop or validated monetization | not ready |

## North Star

Recommended canonical promise:

> **«Напишите, что Вам нужно, — GPTBot найдёт подходящие товары в каталогах подключённых магазинов.»**

This is deliberately narrower than “marketplace”, “AI seller” or “shop in a bot”. It says what the buyer does, what GPTBot does, and where facts come from.

### Ten North Star questions

| Question | Current answer | Decision / proof required |
|---|---|---|
| 1. Whose urgent problem is solved first? | Buyer who knows the need but not the exact SKU | Validate in Pilot #1 interviews and search sessions. |
| 2. What is the unit of value? | A grounded shortlist that advances a decision | Track useful-result rate, product-view rate and decision outcome. |
| 3. Why Telegram? | Existing habit and immediate conversation | Prove the audience prefers it; do not assume universal fit. |
| 4. Why not search each store? | One natural-language request across connected catalogs | This is the strategic wedge; today production has only one synthetic store. |
| 5. Why should the buyer trust a result? | Catalog-grounded price/availability and honest zero-result | Add source/store/freshness signals and correction route. |
| 6. What does the seller buy? | Qualified demand plus fewer repetitive catalog questions | Measure incremental qualified requests and response load. |
| 7. Who is the merchant of record? | The seller; GPTBot currently creates a request, not payment | Must be explicit in terms, order copy and support ownership. |
| 8. What is deliberately not solved? | Public marketplace, payments, escrow, logistics, broad-web search | Keep out of Pilot #1 scope. |
| 9. What creates a defensible loop? | Better catalog quality → better matches → more buyer trust → more seller value | Requires real catalog freshness discipline and category focus. |
| 10. What kills the product? | Stale inventory, slow seller response, unclear responsibility, empty supply | These are launch gates, not backlog polish. |

### Value propositions

**Buyer:** “Describe the need in your own words and get a small, explainable selection from connected local store catalogs—without invented prices or stock.”

**Seller:** “Connect a verified catalog, receive higher-intent requests and answer only the questions the catalog cannot safely answer.”

## Current product truth

- Public bot: **GPTBot Market**, `@gptbot_market_bot`; public description says it is a safe test store with a synthetic catalog.
- Buyer home supports free text, search, catalog, orders, seller interest and more. Product results are grounded and first-page output is intentionally bounded.
- Checkout is explicitly an order **request**, not payment (`functions/agents/sotuvchi/checkout/responses.ts:51-53`).
- Unknown users cannot self-promote to seller. A seller link records interest and keeps buyer authority; active verified owners receive seller tools.
- Seller dashboard provides exact published-products, today’s orders and open-question counts.
- `STATS_WINDOW_DAYS = 1` (`functions/agents/sotuvchi/stats/types.ts:1`), while the landing promises seven days.
- `aiSelection: 'disabled'` (`functions/agents/sotuvchi/manifest.ts:76`), while the landing says a language model understands the question.
- Telegram cards are rendered as text; actions become one button per row. No product photography/media experience is currently proven.
- Production data is synthetic: 1 store, 48 products, 0 orders, 0 handoffs, 0 notifications, 0 automation jobs at audit time.

## Product gap audit A–P

Maturity vocabulary: `отсутствует` → `черновик` → `функционально` → `pilot-ready` → `production-ready` → `market-ready`.

| Area | Score | Maturity | Evidence | Main gaps and impact | Required for 10/10 |
|---|---:|---|---|---|---|
| A. Product strategy | 5.0 | черновик | strong technical roadmap; multiple public propositions | Marketplace, assistant and seller-tool identities compete; no category beachhead or verified economic loop | one audience hierarchy, category wedge, explicit non-goals, North Star metric and quarterly evidence gates |
| B. Brand / identity | 3.0 | черновик | GPTBot.uz, GPTBot Market and Sotuvchi all live | unclear parent/product/mode relationship; trust and recall fragment | approved architecture, naming rules, descriptor, tone, trademark/domain check, RU/UZ system |
| C. Visual system | 3.5 | черновик | two competent dark website styles | generic AI cyan, inconsistent product identities, no commerce imagery or reusable Telegram asset grammar | tokens, type, color, imagery, product-card system, states, accessibility QA and asset library |
| D. Buyer Telegram | 5.5 | функционально | search/catalog/compare/request/orders/handoff code and tests | no live visual proof, no photos, tall keyboards, limited explainability/freshness | RU/UZ device capture, real catalog task success, media cards, compact choice architecture, measured recovery |
| E. Seller Telegram | 4.5 | функционально | verified-owner routing, dashboard, orders, questions, stats | website implies self-service; no real seller evidence; weak catalog maintenance story | truthful acquisition, invite/onboarding service blueprint, daily operating loop, SLA, real seller acceptance |
| F. Website / conversion | 3.5 | черновик | RU/UZ pages are live, fast in single observations, valid canonical metadata | material claim mismatches, generic long text, split CTAs, little proof, small header controls | one promise, truthful CTA, demo/proof, role-specific path, analytics and accessibility pass |
| G. Onboarding | 4.0 | функционально | persistent verified onboarding exists | unknown seller cannot enter it; owner-led steps and prerequisites are not one coherent service | consent/intake → verification → import → QA → training → activation with owner/seller checkpoints |
| H. Trust / safety | 6.0 | pilot-ready | grounding, authorization, tenant isolation, privacy patterns, request-not-payment copy | freshness, merchant responsibility, prohibited goods, complaints, returns and service recovery incomplete | public trust center, seller standards, moderation policy, incident/SLA ownership, traceable correction loop |
| I. Content / copy | 4.0 | черновик | RU/UZ coverage and honest bot copy | website/runtime contradictions; some technical language; no native UZ sign-off | canonical message map, truth matrix, native review, state copy and legal/support copy |
| J. Creatives | 1.5 | отсутствует | generic site OG and public t.me entry | no demo, product media, category kit, social proof, ad variants or Telegram previews | approved system plus complete production matrix and pilot-derived proof assets |
| K. Growth / marketing | 2.5 | черновик | SEO landing and personal Telegram contact | no category launch, channel economics, acquisition baseline, referral or lifecycle loop | seller pilot playbook, buyer seeding, attribution, case-study engine and retention program |
| L. Monetization strategy | 2.5 | черновик | no payment in product; external service pricing elsewhere on GPTBot.uz | payer/value metric/price/COGS unvalidated; marketplace take rate would be premature | interviews, willingness-to-pay tests, service cost baseline, pilot offer and clear pricing hypothesis |
| M. Analytics / experimentation | 5.0 | функционально | privacy-safe event catalog, exact facts, Owner funnel | only synthetic traffic, `/stats` window mismatch, no decision/outcome metric or experiment governance | event QA in real pilot, funnel definitions, cohorts, usefulness/response metrics, experiment register |
| N. Operations / support | 4.0 | черновик | runbooks, pause/suspend, OCC, audit, automation safety | no named real support/incident/daily-review owners or real SLA evidence | staffed service blueprint, queues, hours, escalation, recovery scripts, retention/privacy routine |
| O. Engineering production | 8.0 | production-ready | clean release, exact deployment, strong tests and fail-closed invariants | stable p95 not proven; four inherited SEO assertions; governance drift; independent webhook state gap | repeatable SLO evidence, doc reconciliation, observed recovery drills and pilot production canary |
| P. Launch readiness | 3.0 | черновик | synthetic demo and controlled-pilot runbooks | no real store, buyer demand, proof, support coverage, legal/commercial approval | pass Stage 0–9 gates; public launch only after real cohort retention and incident readiness |

## Buyer journey map

| Step | Expectation | Current state | Gap / emotion | Drop risk | Improvement | Metric |
|---|---|---|---|---|---|---|
| Discover | “This finds products for me.” | GPTBot/Sotuvchi/Market messages vary | uncertainty: “Is this an AI agency or a store?” | high | one promise and one buyer CTA | landing→bot start rate |
| `/start` | instant orientation and safe next action | clear buyer-first home in code; live UI unobserved | `EVIDENCE_GAP` | medium | device evidence; 1-line promise + example prompt | first useful action rate |
| Describe need | speak naturally | bounded deterministic parser and ambiguity recovery | may feel rigid when query is nuanced | medium | disclose supported constraints; ask one useful clarification | search completion rate |
| See results | visual, current, relevant products | text cards, price/availability/specs; synthetic stock | low desire and weak scannability | high | real photos, store/freshness, “why this matches” | useful-result, product-view rates |
| Compare | side-by-side trade-offs | 2–3 text comparisons | long Telegram messages | medium | concise comparison dimensions; keep facts source-bound | compare→selection rate |
| Request order | clear commitment and responsibility | quantity/name/phone/fulfillment/comment; “not payment” | good honesty; delivery expectation still thin | medium | merchant/SLA/next-step confirmation | completion and abandonment |
| Track | know what happens next | order list/status flow | no real fulfillment evidence | medium | status definitions, expected response time, support action | seller response and status aging |
| Ask seller | human help without repeating context | structured handoff, reply attribution | real response quality unknown | high | visible SLA and safe summary | time to first seller reply |
| Recover | fix stale/no-result/error | honest zero-result/out-of-stock paths | no service recovery proof | high | correction/report flow and proactive alternatives | recovery success rate |
| Return | resume and trust saved context | orders and storefront session exist | no retention proposition | medium | saved preference/reorder only after consent and evidence | 7/30-day qualified return |

## Seller journey map

| Step | Expectation | Current state | Gap / emotion | Drop risk | Improvement | Metric |
|---|---|---|---|---|---|---|
| Discover | understand incremental business value | page says create a store in Telegram | CTA actually opens invite-only interest state | very high | “Apply for verified pilot” truth and criteria | qualified application rate |
| Apply | short, credible intake | personal Telegram is actual path; bot CTA is not application | split context and manual ambiguity | high | one structured non-secret intake, explicit reply expectation | application completion |
| Verify | know why verification exists | owner-led invite and active membership required | no customer-facing service blueprint | medium | checklist, roles, data/privacy consent | verification lead time |
| Import catalog | easy and accurate setup | validated pilot package/import path exists | no real seller usability proof; media gap | high | assisted 10–30 SKU template, photo standard, reject reasons | first-pass import acceptance |
| QA and activate | see buyer view before going live | OCC/runbook support review and activation | authenticated visual proof missing | medium | seller preview and signed baseline | activation without rework |
| Operate daily | see orders/questions/stock exceptions | exact dashboard and queues in bot | counts are today, site promises seven days; maintenance flow weak | high | “today” cockpit, catalog freshness task, SLA timers | daily active seller / task completion |
| Respond | answer safely and once | handoff ownership and notifications | no real workload/SLA evidence | high | reply templates, escalation, notification recovery | median/p90 response time |
| Learn | know what value was created | privacy-safe funnel and exact counts | no commercial outcome or cohort context | medium | qualified request/outcome review | qualified requests/store/week |
| Renew | pay because value is clear | no validated pricing or contract | value-to-price unknown | high | pilot outcome review + pricing interview | renewal intent / WTP |
| Exit/pause | retain control | pause/suspend and audit exist | public expectation not explained | low | data export/retention/offboarding policy | clean offboarding rate |

## Brand and naming decision

Recommended architecture:

- **GPTBot** — master brand.
- **GPTBot Market** — buyer-facing product and public bot.
- **Sotuvchi by GPTBot** — seller program / operating mode, not a separate consumer product.
- **GPTBot.uz** — company and trust domain.

Do not alternate all three names in a single journey. Buyer copy says “GPTBot Market”; seller acquisition says “Sotuvchi by GPTBot”; legal/support surfaces say “GPTBot.uz”. Final naming still requires owner approval and a legal/domain check.

## External benchmark principles

External facts are linked; the “adaptation” column is an internal inference.

| Benchmark | External fact | Adopt | Do not copy | Uzbekistan / GPTBot adaptation |
|---|---|---|---|---|
| [Telegram Mini Apps](https://core.telegram.org/bots/webapps) | Telegram supports multiple launches, theme/safe-area integration and multilingual profile media previews | high-quality RU/UZ bot previews; Mini App only for genuinely complex input/visual browsing | Mini App as a maturity badge; payments before merchant/legal readiness | keep chat-first Pilot #1; define a Mini App threshold based on catalog/task complexity |
| [Uzum Market](https://uzum.uz/ru) / [seller manual](https://seller.uzum.uz/manual/) | familiar local marketplace separates buyer catalog and seller entry; automated visual access was challenge-blocked during audit | local language familiarity, category/store trust cues, explicit seller entry | nationwide logistics, installments, breadth and guarantees GPTBot does not own | one category/one city or fulfillment pattern first; label merchant responsibility |
| [OLX Business Uzbekistan](https://business.olx.uz/) | seller landing leads with earning, simple start, assisted manager path and qualification questions | human-assisted pilot intake and seller segmentation | volume claims or classifieds density without evidence | qualify catalog size, current channel, response readiness and intent before invite |
| [Shopify product media](https://help.shopify.com/en/manual/products/product-media), [inventory](https://help.shopify.com/en/manual/products/inventory), [orders](https://help.shopify.com/en/manual/fulfillment/managing-orders) | merchant trust depends on media and explicit inventory/order states | photo standard, stock history/adjustment ownership, filterable operational queues | general-purpose commerce admin before category proof | assisted catalog QA and exception-first Telegram cockpit |
| [Stripe Dashboard](https://docs.stripe.com/dashboard/basics) | dashboard surfaces business health, unresolved exceptions, search and role-specific access | exception-first Owner/seller views, auditable action | financial/payment complexity before payments exist | keep current request-not-payment truth; show what needs attention now |
| [Apple onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/) | onboarding should be brief/contextual; interfaces must remain perceivable and adaptable | learn-by-doing prompt, accessible web controls, scalable text | tutorial walls and aesthetic-only “Apple-level” claims | one example query on first use; RU/UZ native review and AA audit |
| [Linear Method](https://linear.app/method) | direction, blocker prioritization, problem verification and building with users are explicit practices | evidence gates, scoped stages, pilot feedback | shipping broad roadmaps without verified problems | Stage 0 closes truth/evidence before design implementation |
| [OpenAI product discovery](https://openai.com/index/powering-product-discovery-in-chatgpt/) / [shopping research](https://openai.com/index/chatgpt-shopping-research/) | current assistant patterns are visual, constraint-aware, conversational and comparison-led; sources may still be wrong | visual shortlist, clarifying constraints, trade-offs, freshness and correction | broad-web coverage or model-generated catalog facts | only connected catalogs; label source and last verified state |

## Twelve readiness ratings

| Dimension | /10 | Stage | Evidence | Main blocker | Next condition |
|---|---:|---|---|---|---|
| ENGINEERING | 8.0 | production-ready foundation | current production release, tests, fail-closed invariants | repeatable SLO and live pilot recovery not proven | multi-run SLO + canary + recovery drill |
| BUYER_UX | 5.5 | функционально | coherent code paths and honest request copy | no real/device visual proof and no product media | sanitized device pack + real-task usefulness |
| SELLER_UX | 4.5 | функционально | verified dashboard/orders/handoff flows | acquisition/onboarding truth and real daily use missing | one verified seller completes setup/operation acceptance |
| VISUAL_DESIGN | 3.5 | черновик | clean responsive dark landing | generic AI style, no commerce visual grammar | approved direction + tested components/media |
| BRAND | 3.0 | черновик | three recognizable names | architecture and promise conflict | owner-approved naming/message system |
| MARKETING | 2.5 | черновик | SEO landing and contact route | no segment/channel/proof loop | category pilot offer and attribution |
| CREATIVE | 1.5 | отсутствует | generic OG/site visuals only | no functional asset system | produce approved pilot creative kit |
| TRUST | 6.0 | pilot-ready foundation | grounding, isolation, privacy patterns | merchant standards, freshness and recovery incomplete | trust center + signed seller/service standards |
| OPERATIONS | 4.0 | черновик | runbooks/OCC/pause/audit | real owners, shifts and SLA unstaffed | named operating roster + rehearsal |
| PILOT | 4.0 | черновик | synthetic store and controlled runbook | no consented real store/business inputs | Stage 0 gates + Store Pilot #1 authorization |
| PUBLIC_LAUNCH | 2.0 | отсутствует | public pages exist | no real proof, supply, support or retention | private beta exit criteria passed |
| COMMERCIAL | 2.5 | черновик | plausible two-sided value | payer, price, outcome and COGS unvalidated | WTP interviews + measured seller outcome |

## Strong parts, false readiness and immediate priorities

### What is genuinely strong

1. Tenant and seller authority is explicit and fail-closed.
2. Catalog facts, integers in UZS and status claims are grounded rather than generated.
3. Order/inventory/notification and webhook replay defenses are materially ahead of the product packaging.
4. Human handoff preserves ownership and does not expose the buyer question in the notification preview.
5. The system can pause/suspend stores and gives the Owner exact operational facts without raw-content surveillance.

### What creates false readiness

- A polished landing says a seller can create a store in Telegram, while an unknown seller can only express interest.
- “AI service” and language-model understanding are marketed while runtime selection is disabled.
- Seven-day seller stats are promised while the bot’s seller report is today-only.
- Forty-eight synthetic products make the catalog look populated but prove no demand, catalog freshness or seller behavior.
- Test counts prove deterministic contracts, not comprehension, desirability, operational staffing or commercial value.

### What the first buyer will notice

The experience is text-heavy and visually unlike shopping: product photos, merchant proof, freshness and a clear “why this item” layer are missing. If results are relevant, the honesty will feel good; if not, the product will feel like a menu-driven test bot.

### What the first seller will notice

The public promise implies easy self-service, but entry is manually controlled. Once verified, exact operational tools exist; before verification, the application, expectations, data package and service responsibility are not packaged as one journey.

### Top five actions

1. Align every public claim with actual invite-only behavior, today-only stats and deterministic runtime.
2. Close Telegram/Owner visual evidence gaps with sanitized RU/UZ device captures and task-based review.
3. Approve the GPTBot / GPTBot Market / Sotuvchi architecture and one canonical North Star.
4. Prepare one real, consented, category-focused seller with photo-quality catalog, signed stock baseline and named SLA/support owners.
5. Run Store Pilot #1 as an evidence program: useful result, order-request completion, response time, stock correction and seller-value review.

**Exact next implementation stage:** `Stage 0 — Evidence closure and truth alignment`. No feature implementation should begin before its owner decisions and acceptance gates are signed.

## 46-point final report index

| # | Required item | Audit answer / canonical location |
|---:|---|---|
| 1 | Handoff read | Read fully; current HANDOFF/STATE take precedence over historical master. |
| 2 | Git | `1994d925…`, equal to `origin/main`, 0/0 before audit files; readiness-gap doc. |
| 3 | Production deployment | `d9ca163e…`, source `c670e4e`; readiness-gap doc. |
| 4 | Surfaces | website, public t.me, code-level bot states, protected Owner entry; design audit. |
| 5 | Screenshots | evidence directory and README. |
| 6 | Evidence gaps | explicit in evidence README and all audits. |
| 7 | North Star | this document, “North Star”. |
| 8 | Buyer VP | this document. |
| 9 | Seller VP | this document. |
| 10 | Positioning | product and marketing audits. |
| 11 | Naming | recommended architecture above. |
| 12 | Brand | A–P B and design audit. |
| 13 | Visual | A–P C and design audit. |
| 14 | Website | A–P F and design audit. |
| 15 | Telegram buyer | journey + design audit. |
| 16 | Telegram seller | journey + design audit. |
| 17 | Onboarding | A–P G, seller journey, roadmap. |
| 18 | Trust | A–P H and readiness gap. |
| 19 | Content | A–P I and design/marketing audits. |
| 20 | Creative | A–P J and creative matrix. |
| 21 | Marketing | A–P K and marketing audit. |
| 22 | Analytics | A–P M and roadmap. |
| 23 | Operations | A–P N and readiness gap. |
| 24 | Engineering | A–P O and readiness gap. |
| 25 | Pilot | rating plus roadmap Stage 8. |
| 26 | Public launch | rating plus roadmap Stage 10. |
| 27 | Commercial | rating plus monetization validation. |
| 28 | Buyer gaps | buyer journey. |
| 29 | Seller gaps | seller journey. |
| 30 | Missing assets | design audit and creative matrix. |
| 31 | Missing flows | journeys and backlog. |
| 32 | Missing business inputs | Owner inputs document. |
| 33 | Competitive principles | benchmark table above. |
| 34 | Design direction | design audit, selected Direction B. |
| 35 | Creative matrix | separate matrix document. |
| 36 | Growth summary | marketing audit. |
| 37 | Monetization validation | marketing audit. |
| 38 | P0–P3 backlog | readiness-gap doc. |
| 39 | Staged roadmap | separate master roadmap. |
| 40 | Dependencies | roadmap item fields. |
| 41 | Owner inputs | separate document, max ten blocks. |
| 42 | Security | readiness-gap doc and roadmap guardrails. |
| 43 | Not performed | readiness-gap doc. |
| 44 | Overall % | 41%, gate-based method above. |
| 45 | Top five | immediately above. |
| 46 | Exact next stage | Stage 0 — Evidence closure and truth alignment. |
