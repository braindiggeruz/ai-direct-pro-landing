# Click fiscal incident — 2026-10-08

Status: code mitigation verified; Merchant API access and the actual receipt remain unresolved. No new payment, refund, fiscal POST, secret change or production D1 mutation was performed during diagnosis.

## Confirmed evidence

- Production D1 has one paid live chat order for 20,000 UZS, paid on 2026-10-07 Tashkent. Its receipt is queued, attempts=10, last_error=`payment_id:click_-12`.
- `payment_id`, `operation_id`, `submitted_at` and `receipt_url` are absent. The application has not submitted receipt items for this order. Whether Click itself created a receipt is UNKNOWN.
- Read-only GET `status_by_mti` using the existing owner Click profile for service 107654 returned HTTP 200, `error_code=-12`, `error_note="Неверные данные поставщика"`. The lookup fails before fiscal submission.
- Production secret presence was verified; Cloudflare does not expose its value. The direct GET uses the local owner profile, not a recovered production secret. Both show the same coarse error; byte equality of credentials is unverified.
- Historical `reports/studio-monetization-20261008/fiscal-readonly.json` already recorded the same error at 03:22 UTC, before the SEO deployment. This incident is not newly introduced by the SEO release.
- Click cabinet redirected to https://mc.click.uz/ and required login. Owner login requested. No authenticated settings were available to verify the specific wrong field or API permissions.

## Interpretation

`payment_id:click_-12` is a stage prefix plus a provider error, not a payment ID. Attempts count queue processing, not fiscal POSTs. The provider rejected the supplier identity/access. The exact cause (issued merchant user, service binding, key, or Merchant API enablement) cannot be distinguished from this response alone.

Current official [connection documentation](https://docs.click.uz/merchant-api/requests) specifies separate merchant_id, service_id, merchant_user_id and secret_key, and `Auth = merchant_user_id:sha1(timestamp+secret_key):timestamp` with Unix seconds. Current client matches this. The current [error page](https://docs.click.uz/merchant-api/errors) does not document -12; its meaning here comes from the live error_note.

## Code mitigation

1. Once `operation_id` reserves a Click submit, future processing only reads the receipt. A lost answer followed by delayed empty/404 reads cannot send another receipt. The same rule applies after a counter reset, process crash, or mode change. Unclear failures remain queued with backoff and alerts.
2. Atomic submit reservation checks organization, order, kind, current lease and absent prior reservation/acknowledgement. A stale worker cannot issue the first POST after losing its lease.
3. Owner alerts say confirmation is missing, explain supplier refusal at the lookup stage, and label attempts as queue processing. No raw provider text, credentials or order IDs enter alerts.
4. The operational runbook prohibits clearing the marker or changing policy to bypass unresolved provider state.

Validation: 99/99 targeted tests passed (Click fiscal and Studio Click, monetization, watchdog, operations, Uzum fiscal, Payme); app and Functions TypeScript passed; ESLint on all six changed TS files passed. Independent static review found no new P1/P2 issues. Test evidence is local tests.txt; no live fiscal transaction was used as a test. Build/deploy results are recorded separately in RELEASE.json when available.

## Remaining acceptance

1. Owner logs into Click cabinet; verify Merchant API access and issued tuple for service 107654. Do not substitute merchant_id for merchant_user_id or guess identities.
2. Re-run the read-only payment lookup with authoritative credentials. Before any receipt operation, inspect the existing receipt in Click/OFD.
3. If a receipt exists, normal queue reconciliation should save its verified OFD URL. If no receipt exists, resolve the provider's fiscalization policy before submitting. Do not manufacture success or silence the queued error.
4. Confirm the queued row is resolved and the buyer can open the correct receipt. Until then, fiscal business acceptance is blocked even if the code deploy succeeds.

No IndexNow/GSC resubmission is needed for this backend-only patch. Previous SEO release and its open measurement/browser tasks are preserved in STATE.seo_recovery_20261008.
