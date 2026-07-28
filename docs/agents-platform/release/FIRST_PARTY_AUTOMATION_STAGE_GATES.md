# First-party automation stage gates

These are parallel preparation gates, not a new product stage. R0.3 remains
current and blocked.

## Local preparation — satisfied

- [x] dependency inventory is machine-readable;
- [x] Cloudflare-first ADR compares three options;
- [x] D1 job/event schema is additive and checksummed;
- [x] Queue contract and job type are closed lists;
- [x] conditional leases, expiry, retry, cancellation and terminal guard exist;
- [x] DLQ replay requires owner/admin;
- [x] complete RU/UZ pair is required before Draft Inbox ingest;
- [x] runtime has no GitHub writer or auto-publish;
- [x] legacy ingest is disabled by default and fail-closed when enabled;
- [x] Worker descriptor passes Wrangler dry-run;
- [x] owner ROTATED/RETIRED evidence policy is prepared outside Git.

## External cutover — unsatisfied

- [ ] production D1 backup approved and verified;
- [ ] migration `0024` approved and applied;
- [ ] Queue and DLQ created;
- [ ] Worker and Cron deployed;
- [ ] Pages producer binding configured;
- [ ] first-party controlled validation passed;
- [ ] GitHub SEO scheduler disabled;
- [ ] all automation writers disabled;
- [ ] production n8n workflow disabled;
- [ ] old credential revoked and rejected;
- [ ] n8n retirement validation passed;
- [ ] Railway and Cloudflare deployment freeze passed;
- [ ] R0.3B completed.

No unchecked item is implied by repository code.
