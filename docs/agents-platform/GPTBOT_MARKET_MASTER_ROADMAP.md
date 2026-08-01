# GPTBot Market — master roadmap

**Prepared:** 2026-08-01
**Status:** roadmap prepared; implementation not started
**Sequence:** Stage 0 → 10; a higher stage cannot override an unmet lower-stage gate

## How to use this roadmap

- Effort is relative (`XS`, `S`, `M`, `L`, `XL`), never a fabricated calendar estimate.
- `P0` blocks the current stage, `P1` blocks the next external cohort, `P2` improves credible scale, `P3` is evidence-triggered.
- “Deploy: yes” means a separate authorized release is required; this document does not authorize it.
- “Migration: no” is the default. Any later schema need requires a new design, forward/rollback evidence and explicit owner approval. Never re-apply remote migrations already physically present.
- Every item preserves tenant isolation, server-authorized seller identity, buyer non-promotion, idempotency/exactly-once, webhook authentication, schema fail-closed behavior, privacy and integer UZS.

## Critical path

`RM-000 → RM-001 → RM-010/RM-011 → RM-020/RM-021 → RM-030/RM-040 → RM-050 → RM-060 → RM-080 → RM-081 → RM-090 → RM-100`

Design research, trust policy, seller preparation and measurement design can run in parallel where marked, but no real seller activation or public claim change occurs without its gate.

---

## Stage 0 — Evidence closure and truth alignment

### RM-000 — Current-state evidence pack

- **Stage / priority / effort / risk:** 0 / P0 / M / medium.
- **Problem:** live Telegram and authenticated Owner experiences are not visually observed.
- **User / business impact:** buyer/seller confusion and operator errors can remain invisible; design decisions would rest on code assumptions.
- **Solution:** task-based, sanitized RU/UZ capture and comprehension audit on Telegram iOS/Android plus read-only Owner desktop/mobile.
- **Concrete deliverable:** evidence index, screen recordings/screenshots, task notes, issue register; no chat IDs, phone numbers, raw messages or tokens.
- **Surfaces / repo areas:** Telegram buyer/seller; Owner Center; `docs/agents-platform/evidence/**` only unless later fixes are separately authorized.
- **Dependencies:** authorized test accounts and read-only Owner session.
- **Security implications:** use synthetic identities/content; redact all provider/user identifiers; no authority change.
- **Analytics:** record task success manually; no new production event.
- **Acceptance / evidence:** `/start`, search, results, compare, request, orders, interest, invited/active/paused seller, error/empty/stale and Owner critical states captured in RU/UZ where applicable; evidence limitations documented.
- **Parallel eligibility:** yes, with RM-001.
- **Owner input:** authorize safe sessions and designate capturer/reviewer.
- **Real seller needed:** no.
- **Deploy / migration:** no / no.
- **Rollback:** remove/redact any capture that accidentally contains sensitive data; no product rollback.

### RM-001 — Truth, naming and claim contract

- **Stage / priority / effort / risk:** 0 / P0 / S / high.
- **Problem:** GPTBot, GPTBot Market and Sotuvchi conflict; site promises self-service, seven-day stats and model understanding not present in runtime.
- **User / business impact:** misleading conversion, failed seller expectations and trust loss.
- **Solution:** approve one name architecture, North Star, audience message map and claim-to-evidence matrix.
- **Concrete deliverable:** signed decision covering buyer/seller names, descriptor, CTA semantics, current limits, stats window, AI language and request-not-payment wording.
- **Surfaces / repo areas:** future `content/pages/{ru,uz}/sotuvchi.json`, BotFather metadata, bot copy, creative; decision recorded in audit follow-up, not HANDOFF as “implemented”.
- **Dependencies:** owner/legal/domain review; RM-000 findings inform final copy.
- **Security implications:** no deep link can grant seller authority; claims must not reveal operational secrets.
- **Analytics:** define one primary buyer and one seller activation event without raw text.
- **Acceptance / evidence:** every public assertion maps to A/B evidence; RU/UZ native review; no “marketplace/payment/self-service/AI” overclaim.
- **Parallel eligibility:** yes, with RM-000.
- **Owner input:** final naming and positioning approval.
- **Real seller needed:** helpful, not required.
- **Deploy / migration:** no / no.
- **Rollback:** decision can revert to current names before implementation; record supersession.

## Stage 1 — Foundation and positioning

### RM-010 — Product strategy and category wedge

- **Stage / priority / effort / risk:** 1 / P0 / M / high.
- **Problem:** no approved beachhead category, audience hierarchy, non-goals or commercial hypothesis.
- **User / business impact:** empty supply and scattered features; no interpretable pilot.
- **Solution:** choose one category/fulfillment pattern and define the smallest buyer/seller value loop.
- **Concrete deliverable:** strategy brief with ICP, job, category criteria, value propositions, exclusions, competitive frame and expansion trigger.
- **Surfaces / repo areas:** product docs only.
- **Dependencies:** RM-001; seller discovery interviews.
- **Security implications:** exclude regulated/high-risk goods until a dedicated policy exists.
- **Analytics:** North Star = useful grounded shortlist leading to a qualified next step; definitions and denominators included.
- **Acceptance / evidence:** owner signs one wedge and five explicit non-goals; at least several qualified seller conversations support feasibility.
- **Parallel eligibility:** yes, with RM-011.
- **Owner input:** category, geography/fulfillment boundary and strategic constraints.
- **Real seller needed:** discovery candidates yes; activation no.
- **Deploy / migration:** no / no.
- **Rollback:** replace strategy brief only through an evidence-backed decision.

### RM-011 — Pilot measurement and stop/expand contract

- **Stage / priority / effort / risk:** 1 / P0 / S / medium.
- **Problem:** existing funnel has no signed usefulness, outcome, service or commercial decision rules.
- **User / business impact:** activity can be mistaken for value; weak pilots continue indefinitely.
- **Solution:** define metrics, observation protocol and thresholds before recruitment.
- **Concrete deliverable:** dictionary for starts, qualified search, useful result, zero result, product view, request, handoff, response SLA, stock correction, buyer outcome, seller workload, continuation/WTP; stop/iterate/expand rules.
- **Surfaces / repo areas:** docs; future analytics changes only if gap analysis requires.
- **Dependencies:** RM-010 and current closed event catalog.
- **Security implications:** scalar/closed-list data only; no raw query/contact/conversation.
- **Analytics:** this item is the contract; exact Facts remain separate from best-effort funnel.
- **Acceptance / evidence:** each metric has owner, source, denominator, privacy class and decision use; seller cannot see another tenant.
- **Parallel eligibility:** yes.
- **Owner input:** target service standard and business decision tolerance.
- **Real seller needed:** no.
- **Deploy / migration:** no / no unless a later approved event gap is found.
- **Rollback:** version the dictionary; never silently redefine historical metrics.

## Stage 2 — Design and brand

### RM-020 — Direction B brand system

- **Stage / priority / effort / risk:** 2 / P1 / M / medium.
- **Problem:** generic AI visuals and two disconnected site styles do not convey local commerce trust.
- **User / business impact:** low recognition, desire and seller credibility.
- **Solution:** develop “Warm Market Signals” with a restrained operational subset.
- **Concrete deliverable:** approved wordmark/mark, color/type/spacing/imagery/icon/tone tokens, do/don’t examples, RU/UZ layout samples and accessibility specifications.
- **Surfaces / repo areas:** design source/assets; future web/Telegram/creative implementation paths defined after approval.
- **Dependencies:** RM-001; real category mood references.
- **Security implications:** no fake badges, store logos or testimonials; consent ledger for real media.
- **Analytics:** brand recall/comprehension research, not production telemetry.
- **Acceptance / evidence:** buyer/seller comprehension sessions distinguish product role; contrast and target specs pass; owner approves.
- **Parallel eligibility:** yes, with RM-021.
- **Owner input:** visual direction and legal/name approval.
- **Real seller needed:** useful for media authenticity.
- **Deploy / migration:** no / no.
- **Rollback:** retain current assets until complete system approved; do not partially rebrand.

### RM-021 — End-to-end prototypes and state contract

- **Stage / priority / effort / risk:** 2 / P0 / L / high.
- **Problem:** no validated buyer/seller/OCC visual design for small screens and failure states.
- **User / business impact:** the first real cohort bears basic interaction risk.
- **Solution:** prototype complete RU/UZ task flows using current authority and domain constraints.
- **Concrete deliverable:** buyer, seller and Owner prototypes covering happy, empty, loading, error, stale, stock conflict, paused/suspended and recovery; annotated content/state/component spec.
- **Surfaces / repo areas:** design artifacts plus mapping to `functions/agents/sotuvchi/**`, Telegram renderer, `src/admin/pages/owner/**`, landing content.
- **Dependencies:** RM-000, RM-020 and current code contracts.
- **Security implications:** callbacks cannot carry authority/tenant; PII only at necessary request steps; safe preview data.
- **Analytics:** annotate intended event at decision points, reusing closed event vocabulary where possible.
- **Acceptance / evidence:** five buyer and five seller tasks pass moderated review; 390 px, large text and keyboard/screen reader spec have no P0/P1 issue.
- **Parallel eligibility:** partial; buyer/seller streams can run together.
- **Owner input:** approve prototype and trade-offs.
- **Real seller needed:** one operator for seller validation strongly preferred.
- **Deploy / migration:** no / no.
- **Rollback:** prototype revision; no runtime impact.

## Stage 3 — Buyer experience

### RM-030 — Visual grounded product discovery

- **Stage / priority / effort / risk:** 3 / P0 / L / high.
- **Problem:** text-only cards do not support fast, desirable shopping decisions.
- **User / business impact:** low scanability, product confidence and request conversion.
- **Solution:** introduce safe product media/provenance and concise match explanation while keeping facts deterministic.
- **Concrete deliverable:** production-ready result/detail/compare rendering, media fallback, price/availability/store/freshness labels and bounded actions.
- **Surfaces / repo areas:** catalog schema/service only if existing media fields support it; buyer facts/responses; Telegram renderer; tests.
- **Dependencies:** RM-021, accepted real catalog/photo standard.
- **Security implications:** media URLs validated/allowlisted; no model-generated facts; integer UZS; tenant-scoped product lookup.
- **Analytics:** result shown, product view, compare and useful-result feedback as privacy-safe closed events.
- **Acceptance / evidence:** real catalog tasks render correctly RU/UZ on iOS/Android; unsupported values fail closed; no cross-store leakage; test and visual evidence.
- **Parallel eligibility:** yes, with RM-031 after shared spec.
- **Owner input:** approve catalog media policy.
- **Real seller needed:** yes for acceptance evidence.
- **Deploy / migration:** yes / expected no; if media persistence is missing, stop for separate schema proposal.
- **Rollback:** feature flag or renderer fallback to current text cards; preserve callbacks and request state.

### RM-031 — Buyer clarity and recovery

- **Stage / priority / effort / risk:** 3 / P1 / M / medium.
- **Problem:** long keyboards, ambiguous clarifications and unobserved recovery can create loops/resends.
- **User / business impact:** search abandonment and duplicate anxiety.
- **Solution:** compact action hierarchy, one-question clarification, preserved-query recovery and explicit next actor/status.
- **Concrete deliverable:** revised home/search/zero-result/error/stale/request/orders/handoff copy and action layout, RU/UZ reviewed.
- **Surfaces / repo areas:** experience copy/rules, buyer/checkout/orders/handoff responses, renderer and tests.
- **Dependencies:** RM-021; current exactly-once contracts.
- **Security implications:** recovery never bypasses auth, inventory check or idempotency; no private echo.
- **Analytics:** clarification requested/completed, recovery route and abandonment proxy; scalar only.
- **Acceptance / evidence:** no more than one unresolved question at a time; effort preserved after recoverable error; repeated callback/message remains repeat-safe.
- **Parallel eligibility:** yes.
- **Owner input:** tone and SLA language.
- **Real seller needed:** not for build; yes for end-to-end handoff acceptance.
- **Deploy / migration:** yes / no.
- **Rollback:** revert copy/action layout; state machine versions remain compatible.

## Stage 4 — Seller experience

### RM-040 — Truthful pilot intake and assisted onboarding

- **Stage / priority / effort / risk:** 4 / P0 / L / high.
- **Problem:** seller CTA implies self-service while verified onboarding is owner-controlled and fragmented across runbooks.
- **User / business impact:** seller drop-off, unsafe expectations and manual rework.
- **Solution:** package consent, qualification, verification, import, preview and acceptance as one assisted service.
- **Concrete deliverable:** pilot application receipt, qualification checklist, invite flow, resumable onboarding, catalog rejection reasons, seller preview and activation sign-off.
- **Surfaces / repo areas:** landing/Telegram seller-interest and onboarding responses; owner runbook/UI only as required; tests.
- **Dependencies:** RM-001, RM-010, owner business inputs and service roster.
- **Security implications:** interest never grants rights; only trusted identity + active membership; no sensitive intake in Git/analytics.
- **Analytics:** application source/qualified/invited/onboarding-step/activated as closed non-PII state events.
- **Acceptance / evidence:** unknown user remains buyer; invited verified seller completes/restarts safely; cross-tenant negatives; seller understands manual pilot.
- **Parallel eligibility:** yes with RM-041 design, activation waits on Stage 5.
- **Owner input:** eligibility, consent and verification authority.
- **Real seller needed:** yes for acceptance.
- **Deploy / migration:** yes / expected no.
- **Rollback:** disable seller acquisition CTA/route and return to manual contact; memberships unchanged.

### RM-041 — Seller daily operating cockpit

- **Stage / priority / effort / risk:** 4 / P1 / M / medium.
- **Problem:** exact counts exist, but catalog freshness, aged orders/questions and next actions are not one daily loop.
- **User / business impact:** slow replies and stale supply erase buyer trust.
- **Solution:** exception-first “Today” cockpit with task priority and safe detail actions.
- **Concrete deliverable:** published/freshness, new/aged requests, open/aged questions, notification failures and exact today metrics; unambiguous paused/suspended views.
- **Surfaces / repo areas:** seller dashboard responses/tools; catalog/order/handoff facts; tests.
- **Dependencies:** RM-011, RM-021 and agreed SLA/freshness policy.
- **Security implications:** only active verified owner/store; contact stays detail-bound; role switch grants nothing.
- **Analytics:** task opened/completed and service timing; no content.
- **Acceptance / evidence:** counts match FactSheet; forged dashboard/store/window fails closed; operator completes daily review unaided.
- **Parallel eligibility:** yes.
- **Owner input:** priority/SLA/freshness thresholds.
- **Real seller needed:** yes for task validation.
- **Deploy / migration:** yes / no expected.
- **Rollback:** fall back to current exact dashboard; no domain-state rollback.

## Stage 5 — Trust, safety and operations

### RM-050 — Trust center and merchant/service policy

- **Stage / priority / effort / risk:** 5 / P0 / M / high.
- **Problem:** code safety is stronger than public responsibility, freshness, complaints and prohibited-goods policy.
- **User / business impact:** uncertainty during mistakes; legal and reputational exposure.
- **Solution:** define and publish plain-language buyer/seller responsibilities and recovery paths.
- **Concrete deliverable:** RU/UZ trust center covering connected catalogs, request-not-payment, merchant responsibility, price/stock correction, prohibited goods, privacy/retention, complaints, returns/support boundary and platform pause rights.
- **Surfaces / repo areas:** future public content and bot links; policy source documents.
- **Dependencies:** owner/legal decisions, RM-010.
- **Security implications:** no guarantee beyond evidence; minimal data; high-risk categories excluded.
- **Analytics:** trust/support link opens and complaint categories only; no complaint text.
- **Acceptance / evidence:** legal/owner/native-language sign-off; five users correctly explain who sells, pays, delivers and fixes an error.
- **Parallel eligibility:** yes with RM-051.
- **Owner input:** legal entity/responsibility, retention, prohibited goods and support boundary.
- **Real seller needed:** seller acceptance required.
- **Deploy / migration:** yes for publication / no.
- **Rollback:** unpublish/restore prior truthful minimum if policy defect found; pause acquisition if responsibility unclear.

### RM-051 — Staffed operations and recovery rehearsal

- **Stage / priority / effort / risk:** 5 / P0 / M / high.
- **Problem:** runbooks exist but no named real coverage or observed recovery.
- **User / business impact:** orders/questions/incidents can age without an accountable responder.
- **Solution:** staff and rehearse the service blueprint before activation.
- **Concrete deliverable:** service hours, seller SLA, support owner, incident lead, daily reviewer, escalation, stock/wrong-price/notification scripts, pause/resume checklist and redacted evidence log.
- **Surfaces / repo areas:** operational docs and protected owner records outside Git where sensitive.
- **Dependencies:** owner inputs, Pilot #1 seller, existing OCC/runbooks.
- **Security implications:** least privilege; support read-only; no seller impersonation or raw-content surveillance.
- **Analytics:** SLA aging, notification failures/retries and incident categories.
- **Acceptance / evidence:** tabletop covers stale stock, wrong price, seller silence, notification failure and suspension; owners sign; rollback contacts available.
- **Parallel eligibility:** yes.
- **Owner input:** names/coverage/contact paths outside Git.
- **Real seller needed:** yes.
- **Deploy / migration:** no / no.
- **Rollback:** pause pilot/store with audited existing control; preserve evidence and follow restart criteria.

## Stage 6 — Website and conversion

### RM-060 — Truthful role-specific RU/UZ conversion surface

- **Stage / priority / effort / risk:** 6 / P0 / M / medium.
- **Problem:** current page is long, generic and materially mismatched to runtime.
- **User / business impact:** wrong prospects start; qualified users lack proof.
- **Solution:** implement approved buyer and seller paths with one promise, real demo, limits, trust and pilot CTA.
- **Concrete deliverable:** revised RU/UZ page, correct metadata/OG, buyer example, seller pilot criteria, product screenshots, service limits and one application/contact path.
- **Surfaces / repo areas:** `content/pages/{ru,uz}/sotuvchi.json`, page components/styles/assets, sitemap/internal links/tests.
- **Dependencies:** RM-001, RM-020, RM-050 and real/sanitized media.
- **Security implications:** deep links bounded; no authority claim; no PII in URLs/analytics.
- **Analytics:** locale/role CTA source, qualified start/application; consent-safe.
- **Acceptance / evidence:** all claims pass truth matrix; native UZ, responsive, canonical/hreflang, 404, no console error and screenshot review.
- **Parallel eligibility:** yes after content contract.
- **Owner input:** final copy/CTA/media approval.
- **Real seller needed:** real proof optional for first truthful page; required before case claims.
- **Deploy / migration:** yes / no.
- **Rollback:** redeploy last known-good Pages artifact; remove affected CTA if bot path unavailable.

### RM-061 — Website accessibility and performance gate

- **Stage / priority / effort / risk:** 6 / P1 / S / medium.
- **Problem:** small header controls and non-semantic FAQ; no stable performance/accessibility evidence.
- **User / business impact:** exclusion, failed interaction and SEO/conversion loss.
- **Solution:** correct semantics/targets/contrast/motion and measure representative performance.
- **Concrete deliverable:** native FAQ buttons, ≥44 px targets, focus/reduced motion/200% zoom support, AA contrast report and sampled CWV/SLO evidence.
- **Surfaces / repo areas:** header, FAQ, root/landing styles/components, tests.
- **Dependencies:** RM-060 design.
- **Security implications:** none beyond safe links and no analytics PII.
- **Analytics:** performance and error aggregates only.
- **Acceptance / evidence:** keyboard/NVDA/VoiceOver spot tasks pass; contrast and zoom pass; representative performance target signed.
- **Parallel eligibility:** yes during RM-060 implementation.
- **Owner input:** performance target tolerance.
- **Real seller needed:** no.
- **Deploy / migration:** yes / no.
- **Rollback:** restore last known-good front end; accessibility fixes should remain independently reversible.

## Stage 7 — Creative production readiness

### RM-070 — Functional RU/UZ creative kit

- **Stage / priority / effort / risk:** 7 / P1 / L / medium.
- **Problem:** no coherent demo, product media, BotFather previews, seller kit or campaign variants.
- **User / business impact:** weak recognition and acquisition trust.
- **Solution:** produce the approved matrix using real/sanitized product evidence.
- **Concrete deliverable:** brand/Telegram/web/buyer/seller/onboarding/education/pilot asset groups listed in `GPTBOT_MARKET_CREATIVE_MATRIX.md`, source/consent register and editable masters.
- **Surfaces / repo areas:** approved public assets only; source production files in owner-designated storage.
- **Dependencies:** RM-020, RM-030, RM-060 and owner approvals.
- **Security implications:** no raw chat/contact/store data; consent and claim source recorded.
- **Analytics:** tagged asset/channel/locale and success metric.
- **Acceptance / evidence:** each asset has purpose, CTA, source, RU/UZ review and accessibility check; no decorative filler counted complete.
- **Parallel eligibility:** yes by asset group.
- **Owner input:** brand/media/case approvals.
- **Real seller needed:** required for proof assets; synthetic-only assets must be labeled demo.
- **Deploy / migration:** web/BotFather publication separately authorized / no.
- **Rollback:** unpublish asset or restore prior metadata; keep source/consent log.

## Stage 8 — Store Pilot #1

### RM-080 — Pilot readiness and controlled activation

- **Stage / priority / effort / risk:** 8 / P0 / L / very high.
- **Problem:** no verified real store, signed inventory baseline or staffed service.
- **User / business impact:** product value cannot be proven; unsafe launch could harm a real merchant/customer.
- **Solution:** execute the existing controlled runbook only after Stages 0–7 gates pass and owner explicitly authorizes.
- **Concrete deliverable:** verified org/owner/store, accepted 10–30 SKU catalog, opening stock/photo baseline, fulfillment terms, SLA/owners, test canary, activation record and rollback reference.
- **Surfaces / repo areas:** production store/onboarding/catalog/OCC; evidence docs updated only with redacted facts.
- **Dependencies:** RM-030/040/050/051/060/070; full owner input package.
- **Security implications:** tenant boundary and membership canaries; no public marketplace/payment; synthetic and real cohorts separated.
- **Analytics:** baseline and pilot funnel enabled with closed scalar events; exact counts reconciled.
- **Acceptance / evidence:** buyer, seller, non-owner and replay canaries pass; seller accepts view; support/incident coverage live; explicit activation sign-off.
- **Parallel eligibility:** preparation streams yes; activation single-threaded.
- **Owner input:** explicit authorization and all Pilot #1 business inputs.
- **Real seller needed:** yes.
- **Deploy / migration:** possibly configuration/content release; no migration expected; each separately approved.
- **Rollback:** suspend/pause store/pilot using audited controls, restore last release if code-related, preserve order/inventory integrity.

### RM-081 — Pilot operation, research and decision

- **Stage / priority / effort / risk:** 8 / P0 / L / high.
- **Problem:** technical activation alone does not prove usefulness or service viability.
- **User / business impact:** false success and premature scale.
- **Solution:** run a bounded, observed cohort and make an evidence-based stop/iterate/expand decision.
- **Concrete deliverable:** daily redacted log, task observations, metric dashboard, incidents/corrections, seller workload/WTP interview, buyer feedback and decision memo.
- **Surfaces / repo areas:** analytics/OCC/read-only evidence; roadmap/backlog updates.
- **Dependencies:** RM-080 and RM-011.
- **Security implications:** consent; no raw private content in Git; incident data minimized.
- **Analytics:** full agreed pilot dictionary with denominators and locale/store split.
- **Acceptance / evidence:** owner and seller sign decision; no unresolved P0; metric limitations disclosed; expansion only on threshold pass.
- **Parallel eligibility:** operations/research/analytics parallel under one incident owner.
- **Owner input:** cohort bounds and final decision.
- **Real seller needed:** yes.
- **Deploy / migration:** only for separately approved P0 fixes / none by default.
- **Rollback:** stop recruitment, pause pilot/store, revert defective release and maintain buyer/seller communication.

## Stage 9 — Private beta

### RM-090 — Controlled category expansion

- **Stage / priority / effort / risk:** 9 / P1 / XL / very high.
- **Problem:** one store cannot prove multi-store discovery, operational scalability or retention.
- **User / business impact:** weak network value and concentration risk.
- **Solution:** add a small number of comparable verified stores and a consented private buyer cohort.
- **Concrete deliverable:** repeatable seller onboarding package, category normalization, capacity plan, cohort invitations, support coverage and cross-store task evaluation.
- **Surfaces / repo areas:** catalog/search/onboarding/OCC/analytics as evidence requires.
- **Dependencies:** RM-081 expand decision; no unresolved security/ops blocker.
- **Security implications:** strict store isolation despite cross-store buyer discovery; opt-in projection only; conflict/duplicate policy.
- **Analytics:** cohort/store/category retention, useful results, supply coverage, SLA and incident rate.
- **Acceptance / evidence:** each store passes same baseline; buyer discovery improves without leakage; operations meet capacity/SLO; seller continuation evidence.
- **Parallel eligibility:** seller preparation parallel; activation controlled.
- **Owner input:** beta roster, capacity and commercial offer.
- **Real seller needed:** 2–3+ verified stores.
- **Deploy / migration:** likely releases; migration only through new approved design.
- **Rollback:** suspend affected store/category, preserve other tenants, revert release/feature flag.

### RM-091 — Retention and monetization validation

- **Stage / priority / effort / risk:** 9 / P1 / M / high.
- **Problem:** payer, price, value metric and repeat behavior remain hypotheses.
- **User / business impact:** scaling may destroy margin or seller trust.
- **Solution:** combine cohort outcomes, COGS and concrete continuation offers.
- **Concrete deliverable:** seller cost/value report, two package concepts, WTP/renewal decisions, qualified buyer return analysis and pricing decision record.
- **Surfaces / repo areas:** commercial docs; no payment feature.
- **Dependencies:** RM-090 observation window and consent.
- **Security implications:** aggregated economics; no buyer identity or cross-seller data disclosure.
- **Analytics:** activation, continuation, qualified return, service COGS and margin scenarios.
- **Acceptance / evidence:** repeatable seller value correlates with proposed metric; offer covers service cost; owner approves or rejects monetization.
- **Parallel eligibility:** yes with beta operations.
- **Owner input:** cost data and commercial boundaries.
- **Real seller needed:** yes.
- **Deploy / migration:** no / no.
- **Rollback:** withdraw offer concept; no customer charge taken.

## Stage 10 — Public launch

### RM-100 — Public launch gate and release plan

- **Stage / priority / effort / risk:** 10 / P0 / XL / very high.
- **Problem:** public acquisition magnifies liquidity, trust, security and service failures.
- **User / business impact:** reputation, seller harm, buyer harm and operational overload.
- **Solution:** run a cross-functional launch review with hard no-go authority.
- **Concrete deliverable:** signed go/no-go checklist for supply liquidity, useful results, retention, SLO, security, privacy/legal, trust center, support capacity, commercial terms, creative, incident/rollback and public status communication.
- **Surfaces / repo areas:** all product surfaces and release evidence.
- **Dependencies:** Stage 9 exit; independent security/accessibility/release review.
- **Security implications:** full invariant regression, threat review, secret/provider ownership, abuse and prohibited-goods readiness.
- **Analytics:** launch dashboards, alerts, source/capacity limits and stop thresholds.
- **Acceptance / evidence:** all P0/P1 closed; private cohort thresholds sustained; rollback rehearsal; owner/legal/incident/product sign-off.
- **Parallel eligibility:** review streams parallel; go/no-go is a single decision.
- **Owner input:** explicit public-launch authorization and risk acceptance.
- **Real seller needed:** multiple retained, responsive stores.
- **Deploy / migration:** yes, controlled; migration only if separately proven and scheduled.
- **Rollback:** immutable last-known-good release, store/category/pilot pause, acquisition kill switch, incident communication and data reconciliation.

### RM-101 — Launch observation and controlled expansion

- **Stage / priority / effort / risk:** 10 / P0 / L / very high.
- **Problem:** launch is a state change, not proof of sustained health.
- **User / business impact:** undetected degradation as traffic/supply grows.
- **Solution:** capacity-bounded rollout with daily launch review and automatic/manual stop criteria.
- **Concrete deliverable:** staged audience/seller caps, live service review, incident log, seller capacity checks, buyer trust monitoring and post-launch decision memo.
- **Surfaces / repo areas:** operations/analytics/OCC and any separately approved fixes.
- **Dependencies:** RM-100 go decision.
- **Security implications:** no emergency bypass of auth/idempotency/schema; least-privilege incident actions.
- **Analytics:** SLO, useful results, zero results, request/reply SLA, catalog freshness, incidents, retention and seller capacity.
- **Acceptance / evidence:** stable metrics within approved bounds; no unresolved P0/P1; expansion decisions reference evidence.
- **Parallel eligibility:** monitoring/ops/research parallel under incident command.
- **Owner input:** audience caps and expansion authority.
- **Real seller needed:** yes.
- **Deploy / migration:** only controlled releases / no default migration.
- **Rollback:** freeze acquisition/expansion, pause affected scopes, restore last-known-good and communicate status.

## Stage exit summary

| Stage | Exit condition |
|---:|---|
| 0 | complete sanitized current-state evidence and signed truth/naming contract |
| 1 | one category strategy plus metric/decision contract |
| 2 | approved accessible brand and validated full-state prototypes |
| 3 | real-device buyer discovery/recovery passes with real catalog media |
| 4 | verified seller completes truthful assisted onboarding and daily tasks |
| 5 | trust policy is understood and staffed recovery rehearsal passes |
| 6 | truthful accessible RU/UZ conversion surface is released with evidence |
| 7 | functional creative kit is approved, sourced and tagged |
| 8 | Pilot #1 yields a signed stop/iterate/expand decision |
| 9 | private category cohort demonstrates repeat value, service capacity and viable offer |
| 10 | public go/no-go passes; rollout remains within monitored thresholds |

**Exact next stage:** Stage 0. No roadmap item is marked complete merely because this audit specified it.
