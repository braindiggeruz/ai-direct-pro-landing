# Synthetic document canary

Run only from the root's existing authenticated Cloudflare/R2 process, after the new migration, Pages routes, private R2 binding and Railway worker are deployed and the document feature is enabled. This helper never loads credentials or performs network calls itself. Do not mint owner/Studio identities or JWTs for this test.

1. Generate a fresh plan immediately before execution:

   `python reports/railway-documents-20261107/canary/document_canary.py plan --out reports/railway-documents-20261107/canary/run-plan.json`

2. Import `document_canary.py` in the secure process. Inject authenticated adapters and call `run_canary(plan, d1_query, r2_get, r2_delete, r2_list, report_path, artifact_dir=...)`. Adapter contracts are documented in the function. `d1_query` must send the exact SQL and parameter array to the intended D1 database. Every R2 callback must target the dedicated `DOCUMENT_ARTIFACTS` bucket, never an existing media or backup bucket. `r2_list` must collect every page for the exact supplied prefix; other prefixes must not be included. A confirmed missing object returns `None`; authentication/network failures must raise.

3. The plan inserts exactly two synthetic queued rows in org `gptbot-documents`, subject `canary:railway-20261107`: a Russian custom proposal without prices and an Uzbek presentation. IDs and idempotency keys are unique per run. The creation timestamp is actual execution time; expiry is exactly creation +24h. `payloadHash` is SHA-256 of the UTF-8 `JSON.stringify({type,payload})` shape after server validation, not the hash of payload alone. The sibling local test verifies Python serialization against the actual TypeScript validator and Node SHA-256.

4. Wait for the actual Railway worker to claim, render and upload. The helper never claims or completes jobs. It polls only the two exact rows, then verifies ready state, attempts1..3, payload removal, PDF byte count, `%PDF-` header, `%%EOF` trailer and private authenticated R2 read. Downloaded synthetic PDFs may be saved locally for native/visual RU/UZ inspection. Binary checks alone do not prove typography or semantic text quality; the report explicitly marks that check unperformed.

5. Cleanup runs in `finally`, on success and failure. It first invalidates both exact canary leases, then deletes only validated `documents/<exact-canary-id>/<uuid>.pdf` keys and verifies R2 absence. It deletes a D1 row only with matching org, subject, ID, idempotency key, input hash and cancelled state. The report proves row/object absence. A failed cleanup retains cancelled rows and reports failure; rerun `cleanup(the_same_plan, ...)`, never broaden the SQL predicate. If the worker was mid-upload during a failure, repeat cleanup after its120s lease window to sweep any late orphan upload; normal server completion also deletes the losing upload. The service's24h orphan sweep remains the fallback.

Acceptance: both locales ready via the actual deployed worker, private PDFs verified, saved artifacts reviewed where available, tagged remote rows and objects absent. The canary bypasses browser authentication by explicit synthetic D1 insertion and does **not** prove owner login, Studio account UI, payment processing or real customer acceptance. No customer data, tariff changes or billing writes are involved.

All exact INSERT/SELECT/freeze/DELETE statements and parameter arrays are written into the generated plan. Keep that plan until cleanup readback succeeds; it contains synthetic content only, never secrets.
