# Lead Radar cold schema-sort recovery — 2026-08-31

Production deployment `edc0edea-a38b-4fcf-81d7-e7de9be0e0cd` reported an unpushed dirty source commit `425dce778f9ad4482cab08dce0914706e96fcee2` with the message `fix(lead-radar): avoid cold locale initialization in schema guard`. The deployed artifact could be fingerprinted, but Cloudflare Pages does not expose the original source diff and the commit was absent from GitHub.

This recovery preserves the documented intent in the two runtime schema fingerprint paths: `auditLeadRadarD1Schema` and `telegramCampaignSchemaFingerprint`. Both now use deterministic code-unit comparison instead of `localeCompare`. Schema fingerprints are byte contracts over ASCII object keys; human-language collation is neither required nor desirable. Regression tests replace `String.prototype.localeCompare` with a throwing implementation and prove that both cold guards remain valid and order-stable.

No schema, migration, binding, feature flag, contact permission, campaign permission or sending gate changes in this recovery. Deployment remains blocked unless the current Cloudflare production identity and captured live artifact fingerprint still match the inspected deployment.
