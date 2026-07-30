# R1 Sotuvchi controlled pilot runbook

Status: PR-ready procedure only. The pilot has not been started.
Target: 1–3 verified real stores after P3.1 review, merge, migration, deployment,
and explicit rollout authorization.

This runbook does not authorize creating a Telegram bot identity, applying a
production migration, changing a webhook, deploying P3.1, or onboarding a real
seller.

## 1. Store selection

Every candidate must have:

- a verified legal/business owner and a verified owner contact;
- a stable, lawful product category with predictable questions;
- a catalog small enough to verify manually during onboarding;
- disciplined real inventory and a named person responsible for corrections;
- an agreed seller response SLA and escalation contact;
- willingness to participate, report mistakes, and pause immediately when
  requested.

Reject anonymous/private sellers, prohibited or high-risk goods, catalogs whose
price/stock cannot be verified, and owners who cannot meet the response SLA.

## 2. Prerequisites and evidence

Record pass/fail and reviewer for each item without placing credentials in the
runbook:

- [ ] P3.1 reviewed, merged, and separately authorized for production.
- [ ] Migration `0025` backed up, rehearsed, applied, and verified.
- [ ] Real Agents/Sotuvchi Telegram bot identity is owned in BotFather.
- [ ] Bot token is stored through the approved hidden local helper and then as
      the appropriate platform secret; it is never pasted into logs or Git.
- [ ] Webhook secret exists and the intended URL/username pair is exact.
- [ ] Seller Telegram identity is verified out of band.
- [ ] Store tenant and organization are created without a client-controlled
      tenant override.
- [ ] Verified seller is assigned the owner role for that store only.
- [ ] Initial categories and catalog are approved.
- [ ] Every price is an integer number of UZS minor units according to the
      existing Sotuvchi contract.
- [ ] Inventory baseline is counted, signed off, and recoverable.
- [ ] Backup reference, rollback owner, incident lead, and escalation contact
      are recorded in the protected operator log.
- [ ] n8n remains retired, auto-publication remains disabled, Railway remains
      disconnected, and production auto-deploy remains frozen.

Run the existing read-only pilot readiness helper before any webhook mutation.
A blocked result remains a blocker; do not invent bot usernames or secrets.

## 3. Onboarding sequence

Execute one store at a time. Preserve request IDs and safe event IDs in the
operator log.

1. Create the organization/store through the reviewed Sotuvchi path.
2. Assign the verified seller to that exact organization and store.
3. Create/import the approved categories.
4. Create/import products in manageable batches.
5. Reconcile each product name, description, integer UZS price, availability,
   and opening stock against the signed baseline.
6. Test a grounded product question whose answer exists in the catalog.
7. Test an unknown-product question; the agent must not invent a product,
   price, stock, policy, or delivery promise.
8. Place one synthetic order and verify the order belongs to the correct tenant.
9. Repeat the identical order operation and verify one logical order only.
10. Verify inventory decremented exactly once.
11. Trigger one handoff without exposing the raw buyer conversation in the
    Owner Control Center.
12. Verify the assigned seller receives and answers it, and the buyer receives
    the reply once.
13. Test pilot pause and store suspend/restore with reason, typed confirmation,
    request ID, and exactly one audit event.
14. Reconcile catalog, order, inventory, handoff, automation, and audit state.
15. Only after sign-off, activate that store in the R1 pilot.

Do not proceed to store 2 or 3 until the previous store has passed the full
sequence and the incident queue is empty.

## 4. Daily operations

At the start and end of every operating day:

- review orders and investigate any duplicate or unexpected state transition;
- reconcile high-risk inventory and all operator corrections;
- review open handoffs against the seller response SLA;
- review first-party automation `retry_wait`, leases, failures, and DLQ;
- replay a DLQ job only when its job type is allowlisted and the root cause is
  understood; supply reason and exact typed confirmation;
- review the immutable owner audit timeline and preserve relevant request IDs;
- confirm marketplace/public listings and auto-publication remain disabled;
- confirm the seller has access only to the assigned tenant;
- record seller complaints, buyer-impacting mistakes, and corrective actions.

Never use the Owner Control Center to impersonate a seller or read raw private
conversation content.

## 5. Incident and escalation procedure

1. Stop the affected store's pilot. Suspend the store if buyers could receive
   unsafe answers or place unsafe orders.
2. Stop all pilot stores for a tenant-isolation, authorization, PII, duplicate
   order, or double-decrement signal.
3. Preserve request IDs, safe audit event IDs, automation job IDs, timestamps,
   and affected tenant/store IDs. Do not copy tokens or raw conversations.
4. Notify the named incident lead and store owner through the protected contact
   channel.
5. Reconcile D1 state against the latest verified backup and domain invariants.
6. Roll back application code using the reviewed release procedure when code is
   implicated. Do not drop audit or pilot tables.
7. Rotate credentials only through the credential incident procedure if there
   is evidence of exposure.
8. Resume only after root cause, repair, regression test, data reconciliation,
   store-owner acceptance, and explicit incident-lead approval.

## 6. Success metrics

Measure per store and for the pilot:

- buyer request → relevant product match rate;
- grounded-answer rate and unknown-product safe-response rate;
- order conversion rate;
- median and p95 seller response time;
- handoff rate and handoff SLA breach rate;
- duplicate-order rate;
- inventory discrepancy and double-decrement rate;
- automation retry, failed-job, and DLQ counts;
- number and severity of seller complaints;
- pilot store retention.

Success never overrides a hard-stop invariant. Duplicate-order,
double-decrement, unauthorized access, or PII leakage targets are zero.

## 7. Hard-stop conditions

Immediately pause the affected store and escalate; pause the whole pilot where
cross-store impact is possible:

- any tenant isolation failure or cross-store data visibility;
- invented price, stock, product, policy, or delivery promise;
- duplicate logical order;
- double inventory decrement or unexplained stock change;
- unauthorized seller or support mutation;
- buyer PII or raw conversation leakage;
- uncontrolled publication, public marketplace listing, or GitHub writer;
- unresolved seller complaint with ongoing buyer impact;
- audit missing, duplicated, mutable, or containing sensitive material;
- n8n or another unreviewed automation path becoming active.

## 8. Backup and rollback checklist

- [ ] Latest pre-pilot D1 backup is verified and its protected reference logged.
- [ ] Catalog and inventory baseline can be reconstructed.
- [ ] Last reviewed application release SHA is recorded.
- [ ] Pilot pause and store suspend have been rehearsed.
- [ ] Queue/DLQ reconciliation owner is named.
- [ ] Audit evidence retention is confirmed.
- [ ] Rollback never uses destructive migration or deletes audit evidence.
- [ ] Post-rollback order and inventory reconciliation is complete.

## 9. Pilot closeout

At the end of R1, pause new onboarding, export only safe aggregate metrics,
reconcile every store, document incidents and seller feedback, and decide
separately whether to continue, redesign, or stop. P3.2 marketplace work is not
an automatic consequence of pilot success and requires its own opt-in
projection, moderation, privacy review, and authorization.
