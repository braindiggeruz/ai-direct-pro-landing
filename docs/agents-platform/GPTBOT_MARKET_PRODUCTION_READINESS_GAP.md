# GPTBot Market — production readiness gap

**Evidence date:** 2026-08-01
**Scope:** read-only production and release audit
**Conclusion:** engineering runtime is production-grade for a controlled pilot foundation; the product/service is not ready for a real pilot without business inputs and is not ready for public launch.

## Actual release state

### Git

- Canonical clone: `F:\Claude\gptbot-repo-clean-20260801`.
- `git fetch origin main --prune` completed read-only.
- Pre-audit `HEAD` and `origin/main`: `1994d92598398073d378b584cc644c2cbc6a506a`.
- Ahead/behind: `0/0`.
- Release history: documentation `1994d92`; role-aware merge `c670e4e`; feature `2291e80`; pilot/readiness `3a9d90f`; previous release fix `41ec9e3`.
- Audit documents/evidence are local working-tree additions at the time of this report; no push or history rewrite was performed.

### Cloudflare Pages production

Read-only `wrangler pages deployment list` confirmed:

| Item | Actual |
|---|---|
| Project | `ai-direct-pro-landing` |
| Latest production deployment | `d9ca163e-947b-40ba-856d-8143308c8402` |
| Source commit | `c670e4e` |
| Immutable URL | `https://d9ca163e.ai-direct-pro-landing.pages.dev` |
| Previous production | `ede1d0f4…`, source `41ec9e3` |
| Match to fresh HANDOFF | yes |

Wrangler reported a newer CLI version; no dependency update was performed.

### Production D1 — read-only counts

| Entity | Count |
|---|---:|
| Stores | 1 |
| Products | 48 |
| Orders | 0 |
| Handoffs | 0 |
| Notifications | 0 |
| Automation jobs | 0 |
| Automation jobs with `dead_letter` status | 0 |

All store/product records are documented synthetic fixtures. The query metadata reported zero rows written. No real seller, buyer transaction or fulfillment evidence exists.

The physical schema includes migrations through `0030`, while an older documentation ledger ends at `0025`. Current HANDOFF warns that `0026–0030` are already physically applied. **Do not run remote migration apply.** Reconcile documentation only after an owner-approved schema evidence procedure.

### HTTP canaries

| Probe | Status | Interpretation |
|---|---:|---|
| `https://gptbot.uz/` | 200 | root live |
| `/ru/sotuvchi/` | 200 | RU landing live |
| `/uz/sotuvchi/` | 200 | UZ landing live |
| immutable deployment `/ru/sotuvchi/` | 200 | deployed artifact reachable |
| unknown public path | 404 | fails as expected |
| GET `/api/telegram/agents` | 405 | method boundary closed |
| POST `{}` `/api/telegram/agents` | 401 | webhook secret boundary closed before business work |
| protected `/admin-tools/agents` with redirects | 200 login | route redirects to protected login, not Owner data |

The invalid webhook POST was side-effect-free by contract and did not include a secret. No valid production webhook call was made.

### Current regression evidence

Fresh local targeted run after audit-only documentation work:

```text
tests 433
suites 10
pass 433
fail 0
duration 16.8 s
```

Scope: buyer QA, catalog, checkout, handoff, onboarding, orders/inventory, pilot readiness, Telegram schema/webhook and Owner Control Center. An expected/non-fatal local admin diagnostic reported unavailable GitHub credentials during a legacy cockpit check; the suite still passed and no secret value was printed.

Fresh governance also records the broader release result as **1056/1060**, with exactly four inherited SEO/release assertions outstanding; role-aware targeted tests were 216/216, critical 126/126, build/type/security clean. This audit did not rerun the entire 1060 corpus because no product code changed.

## Governance truth and drift

Fresh authoritative documents are `HANDOFF.md`, `STATE.json` and `TEST_MATRIX.md`. `CURRENT_STATE.md`, the top of `KNOWN_ISSUES.md`, and one R1.1 section in `ROADMAP.md` still reference the prior `ede1d0f4` / `41ec9e3` release. The historical master explicitly points readers to newer governance. Drift is a documentation risk, not evidence of a runtime rollback.

This audit does not update HANDOFF or STATE: audit complete, roadmap prepared, implementation not started.

## Readiness gates

| Gate | Status | Why |
|---|---|---|
| Runtime correctness | PASS for controlled scope | deterministic and exactly-once contracts are well tested |
| Deployment identity | PASS | exact production release matches fresh governance |
| Tenant/role security | PASS in code/tests | buyer cannot self-promote; store and Owner access fail closed |
| Synthetic demonstration | PASS | one synthetic store and catalog available |
| Visual product QA | BLOCKED | in-chat RU/UZ buyer/seller and authenticated Owner states not observed |
| Real Store Pilot #1 | BLOCKED | no consented seller, approved products, stock baseline or staffed SLA |
| Operational readiness | BLOCKED | support/incident/daily-review owners and real drills absent |
| Commercial readiness | BLOCKED | no value, willingness-to-pay, COGS or retention evidence |
| Private beta | BLOCKED | Pilot #1 must succeed first |
| Public launch | BLOCKED | no liquidity, trust center, proof, support capacity or stable retention |

## Explicit `EVIDENCE_GAP`s

| Gap | Evidence needed | Roadmap owner |
|---|---|---|
| Live Telegram buyer/seller visuals | sanitized RU/UZ iOS and Android screenshot/recording pack for all key states | Product design + owner test account |
| Authenticated Owner UI | read-only desktop/mobile capture of loading/empty/populated/error/role/confirmation states | Platform owner |
| Bot API status | owner-executed redacted `getWebhookInfo` and BotFather identity/media export | Bot owner; never commit token |
| Stable latency | repeated production observations across warm/cold windows; p50/p95/p99 and failure rate | Engineering/operations |
| Real catalog correctness | consented seller baseline, import report, photo QA, stock correction log | Seller + pilot operator |
| Buyer usefulness | task-based sessions with real catalog and outcome coding | Product research |
| Seller operating value | response burden, qualified requests, SLA and continuation decision | Product/operations |
| Accessibility | keyboard, 200% zoom, NVDA/VoiceOver/TalkBack tasks | Design/QA |
| Native UZ quality | named native reviewer sign-off | Content owner |
| Incident recovery | tabletop plus observed safe pause/recovery | Incident lead |

## Missing-product backlog

Priority meanings: **Critical** blocks even a real Pilot #1; **High** blocks private beta; **Medium** blocks a credible public launch or efficient scale; **Later** is evidence-triggered expansion. “Good end” is an outcome, not implementation prescription.

| ID / priority | Problem | Evidence | Audience | Impact | Risk if ignored | Deliverable | Dependency | Good end |
|---|---|---|---|---|---|---|---|---|
| GAP-01 Critical | Public claims contradict runtime and invite-only entry | landing vs `aiSelection`, stats window and seller routing | buyers/sellers | trust, conversion | misleading acquisition and wrong pilot expectations | approved RU/UZ truth matrix and corrected surfaces | naming/owner approval | every claim maps to live behavior/evidence |
| GAP-02 Critical | No visual proof of the bot on real devices | `EVIDENCE_GAP` | all | usability, trust | hidden small-screen failures | sanitized current-state evidence pack and task findings | authorized test account | key RU/UZ tasks observed on iOS/Android |
| GAP-03 Critical | No consented real seller/store | D1 synthetic-only | both sides | product proof | synthetic readiness mistaken for demand | signed Pilot #1 business package outside Git | owner business inputs | verified seller/store/catalog ready for explicit activation |
| GAP-04 Critical | Catalog media and freshness standard absent | text cards; no real photos | buyers/sellers | relevance, desire, trust | stale/undesirable results | 10–30 SKU package, photo rules, source/freshness owner and accepted baseline | seller consent | catalog passes import, visual and stock QA |
| GAP-05 Critical | Pilot service ownership unstaffed | runbooks name required roles, none supplied | sellers/buyers | reliability | unanswered orders/incidents | SLA, support owner, incident lead, daily reviewer, protected contact path | owner inputs | rehearsal passes and coverage is explicit |
| GAP-06 Critical | Naming/product hierarchy unresolved | GPTBot/GPTBot Market/Sotuvchi | all | comprehension | fragmented recall and inconsistent copy | approved architecture and descriptor | owner/legal check | one name per audience/context |
| GAP-07 Critical | Pilot success/stop rules not signed | analytics exists but no business targets | owner/seller | decision quality | endless “pilot” without learning | metric dictionary, thresholds, observation plan, stop criteria | category and SLA | pilot can produce a stop/iterate/expand decision |
| GAP-08 High | Buyer product cards lack visual merchandise and provenance | renderer flattens cards | buyers | selection quality | low desire and trust | designed media-card contract with safe fallback | photos, Telegram QA | buyers can scan and explain selection |
| GAP-09 High | Seller intake is split and misleading | deep link vs personal Telegram | sellers | acquisition | qualified sellers drop or expect self-service | one truthful structured pilot application receipt | claim alignment | applicant knows next step and response time |
| GAP-10 High | Seller onboarding is not packaged as a service | code workflow + separate runbooks | seller/operator | activation | facilitator-dependent setup | service blueprint, checklist, preview and acceptance | real seller | seller completes setup with bounded assistance |
| GAP-11 High | Trust/service policy incomplete | strong code safety, weak public policy | buyers/sellers | trust and incident handling | unclear merchant/platform responsibility | trust center: request-not-payment, merchant role, prohibited goods, privacy, complaints, returns/support boundaries | legal/owner decisions | user knows who is responsible and how to recover |
| GAP-12 High | No observed performance SLO | one 2564 ms cold sample only | all | reliability | launch on anecdote | sampling plan/dashboard/alert and canary evidence | ops owner | p95/failure rate meet signed target over representative window |
| GAP-13 High | Outcome and usefulness analytics missing | funnel is event-based and synthetic | product/seller | learning/monetization | optimize clicks instead of value | privacy-safe outcome coding and pilot dashboard | metric dictionary | team can explain why a result/request was useful |
| GAP-14 High | Owner UI visual/accessibility state unverified | protected login + source only | operations | incident response | operator error under stress | authenticated read-only audit and remediations | authorized owner session | critical task and confirmation states pass |
| GAP-15 High | UZ copy has no native sign-off | structural parity only | UZ users | comprehension/trust | unnatural or ambiguous commerce copy | native product-language review | reviewer | zero critical ambiguity in tasks/policies |
| GAP-16 Medium | Website has weak evidence hierarchy | long generic text page | sellers/buyers | conversion | traffic does not understand/prove value | role-specific page with demo, proof, limits and one CTA | Pilot assets | qualified conversion increases without misleading copy |
| GAP-17 Medium | Seller daily freshness task is weak | dashboard has counts, not catalog quality loop | sellers | catalog reliability | gradual stale supply | exception-first freshness/report workflow | pilot learning | responsible operator resolves aged exceptions |
| GAP-18 Medium | Lifecycle/retention is undefined | no real cohort | both | growth | novelty starts do not repeat | cohort definitions and consent-safe lifecycle plan | Pilot #1 | measured qualified return and seller continuation |
| GAP-19 Medium | Pricing and unit economics unvalidated | no payment, no WTP/COGS | seller/owner | commercial | price disconnected from value/cost | interview findings, shadow cost and two offer tests | real pilot outcome | seller chooses a viable continuation offer |
| GAP-20 Medium | Governance release references drift | stale docs | team/ops | change safety | next operator uses wrong release facts | reconcile current state/known issues/roadmap references | audit acceptance | one current release truth across governance |
| GAP-21 Medium | Creative/OG/BotFather media pack missing | generic OG/public t.me | prospects | acquisition trust | low recognition and demo clarity | RU/UZ functional asset kit | design direction + real catalog | every acquisition surface shows truthful product use |
| GAP-22 Later | Multi-store discovery not proven | one synthetic store | buyers/sellers | network value | premature marketplace complexity | category liquidity experiment | 2–3 similar verified stores | cross-store selection beats single-store path |
| GAP-23 Later | Mini App threshold undefined | chat renderer constraints | buyers/sellers | task efficiency | expensive UI layer without need | decision record based on catalog/task complexity | real usage evidence | Mini App built only if chat fails measured tasks |
| GAP-24 Later | Payments/transaction economics absent | explicitly no payments | all | revenue/convenience | legal/security scope explosion | separate discovery, legal/provider design and authorization | public-value proof | only proceed with clear merchant-of-record and dispute model |

## Security and operational invariants

Every roadmap/design decision must preserve:

1. Tenant isolation on every store/product/order/handoff/analytics query.
2. Seller authority from server-trusted identity, active membership and store lifecycle—not client text, callback, role switch or deep link.
3. Buyer cannot self-promote; an unknown seller-interest action grants no authority.
4. Order, inventory movement, notification and webhook processing remain exactly-once/repeat-safe with deduplication and idempotency.
5. Webhook authentication and schema contract fail closed before body reservation/business work.
6. No secret, token, raw phone, chat ID, raw query/conversation or stack trace in Git, analytics or Owner projection.
7. Catalog/FactSheet grounding for price, availability, status, store and counts; unsupported numbers are rejected.
8. Money stays integer UZS at domain boundaries.
9. Support/Owner reads remain PII-minimized; seller contact visibility remains task-bound.
10. No automated publication, marketplace exposure, payment, migration or deployment without separate explicit authorization and rollback evidence.

## Incident and service prerequisites

Before a real pilot, document outside Git where sensitive:

- service hours and seller response SLA;
- support owner, incident lead, daily reviewer and escalation path;
- severity definitions and pause/suspend authority;
- buyer/seller status message templates;
- stock discrepancy and wrong-price recovery;
- notification failure/DLQ review and retry ownership;
- privacy request, complaint and retention procedure;
- backup/export reference and rollback decision owner;
- consented contact path for the real seller;
- daily evidence log with IDs/aggregates only, no raw PII.

## Operations explicitly not performed

- no real store, seller, product, catalog import, buyer, order, handoff or notification created;
- no payment, Click, Payme, custody, escrow, refund, dispute or public marketplace surface added;
- no Telegram message sent and no valid webhook update replayed;
- no BotFather metadata, token, webhook or environment variable changed;
- no D1 mutation or migration executed;
- no Cloudflare Pages or Railway deployment, auto-deploy or configuration mutation;
- no n8n workflow created or enabled;
- no dependency update;
- no legacy bot change;
- no force push, history rewrite, destructive Git operation or production rollback;
- no HANDOFF/STATE claim that implementation is complete.

## Exact next gate

Proceed to **Stage 0 — Evidence closure and truth alignment** from `GPTBOT_MARKET_MASTER_ROADMAP.md`. Store Pilot #1 remains separately authorized and blocked on `GPTBOT_MARKET_OWNER_INPUTS.md`.
