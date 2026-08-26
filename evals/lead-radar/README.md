# Lead Radar offline golden evaluation

This package is a deterministic, network-free quality gate for Lead Radar. It evaluates a candidate prediction export; it does not crawl sources, call runtime APIs, mutate a database, enable a feature flag, or authorize a release.

## Frozen corpora

The compact manifests in `fixtures/` expand deterministically into synthetic records. Every evidence URL uses the reserved `.invalid` TLD, people are represented by opaque references, and the manifests explicitly prohibit real-person PII.

| Split | Company cases | Ranking searches | Telegram endpoints | Person edges | CTA negatives | Policy |
|---|---:|---:|---:|---:|---:|---|
| `dev` | 240 | 48 | 120 | 60 | 120 | Threshold/feature tuning allowed |
| `holdout` | 960 | 240 | 900 | 419 (299 positive-eligible) | 600 | Independently frozen; tuning forbidden |

Both splits cover Tashkent, Russian and Uzbek, and dentistry, beauty salons, training centers, real estate, car services, and food delivery. The generated labels include closed companies, adjacent niches, wrong geography, shared/parked/unofficial domains, namesakes, branch collisions, all six Telegram endpoint classes, negative person affiliation, stale/shared/DNC/unknown personal-CTA opportunities, and corporate routes.

The manifest checksum freezes its parameters. The expanded checksum freezes every generated record and therefore detects generator-semantic drift. Entity-family IDs and evidence domains are independently namespaced; the evaluator refuses to run if either set overlaps across splits.

Changing a frozen manifest is not maintenance. Create a new version, new seed and namespace, independently review it, calculate new checksums, and retain the old version for reproducibility. Never update the holdout in response to a candidate's errors.

## Candidate input

The CLI accepts `lead-radar-candidate-predictions/v1`; its JSON Schema is in `schemas/candidate-predictions.v1.schema.json`. Coverage must be exact: missing, duplicated, or unknown company, ranking, Telegram, person, or CTA cases fail evaluation. This prevents precision inflation by omission.

Optional observations can include end-to-end time samples, total cost and incremental actionable count, D1 queries, external fetches, and Queue-reserve exhaustion. These values are reported but do not turn an offline corpus into a canary or capacity test.

Run freeze and leakage verification:

```powershell
npx tsx scripts/lead-radar/evaluate-golden.ts --verify-only
```

Evaluate an exported candidate:

```powershell
npx tsx scripts/lead-radar/evaluate-golden.ts `
  --dataset holdout `
  --target research `
  --predictions .\work\lead-radar-candidate.json
```

The report is written only to stdout. Exit codes are `0` for a green golden evaluation, `2` for valid input with failed required gates, and `1` for an invalid corpus/input or evaluator error. `--compact` emits canonical one-line JSON. There is deliberately no `--output`, live-source, URL, or network option.

## Metrics and gates

The report includes one-sided 95% Wilson intervals for active-company, niche, geo, official-site, corporate-route, person-edge, decision-maker, bounded-recall, and false-CTA proportions. Telegram macro-F1 uses a deterministic 10,000-draw stratified bootstrap plus per-class precision/recall. Actionable P@10 uses search-cluster—not card—bootstrap samples and reports niche × language cell floors.

Research mode requires active/niche/geo lower bounds of 95%, official-site and corporate-contact lower bounds of 98%, Telegram macro-F1 of 95% with a 92% bootstrap lower bound, corporate-route coverage of 70%, bounded-recall lower bound of 70%, and actionable P@10 point/lower bound of 90% with no cell below 80%. The personal contact surface must be absent.

Contact mode adds business/human lower precision of 98%, at least 299 predicted-positive person edges with a 99% lower bound, decision-maker lower precision of 98%, at least 600 negative CTA opportunities with zero false CTA and a Wilson upper error below 0.5%, plus all legal/privacy/vault/retention/DNC/manual-review/channel prerequisites. A single false CTA is a hard failure.

Even a green contact report says `productionReleaseAuthorized: false`. Deployment still requires schema, security, privacy, capacity, artifact, canary, and explicit owner approval gates outside this evaluator.

## Recommended root scripts

The package deliberately does not edit the root `package.json`. Add these scripts in the parent integration change:

```json
{
  "lead-radar:golden:verify": "tsx scripts/lead-radar/evaluate-golden.ts --verify-only",
  "lead-radar:golden:eval": "tsx scripts/lead-radar/evaluate-golden.ts",
  "test:lead-radar-golden": "node --import tsx --test tests/lead-radar-golden-eval.test.ts"
}
```
