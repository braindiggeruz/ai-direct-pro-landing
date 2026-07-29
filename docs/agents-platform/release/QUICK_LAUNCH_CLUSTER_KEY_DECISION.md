# Quick-launch `cluster_key` — evidence audit and decision

**Status: `no_change_required`**

Read-only audit. No runtime, schema, content or test behaviour was changed by
this document.

## Question carried over

R0.4-RC2 removed a dead read: `functions/api/admin/seo/yandex/quick-launch.ts`
computed `body.cluster || fingerprint.entity || null`, but `IntentFingerprint`
has no `entity` member, so the middle term was always `undefined` and
`cluster_key` has only ever been `body.cluster || null`. The open question was
whether `primary_entity` *should* have been the fallback.

## Where each symbol is defined

| Symbol | Definition | Shape |
|---|---|---|
| `primary_entity` | `src/shared/intent-guard.ts:43`, produced by `buildFingerprint` in `functions/lib/intent-guard/fingerprint.ts:170` | bare token from a closed dictionary — `gpt-bot`, `ai-bot`, `telegram-bot`, …, or the literal `none` |
| `cluster_key` | column in `migrations/0004_intent_guard.sql:54` (`seo_topic_plan_items`) and `:89` (`seo_topic_reservations`); typed nullable at `functions/lib/intent-guard/plans.ts:36,60` and `reservations.ts:35` | nullable planner label |

## What the established `cluster_key` vocabulary actually is

The only code that *generates* a `cluster_key` is the topic planner:

`functions/lib/intent-guard/topic-suggester.ts` → `clusterFromSlot(slot)`

```text
industry:<industry> | audience:<audience> | channel:<channel> | modifier:<modifier>
```

The link planner derives the same namespaced shape from a fingerprint at read
time, `functions/lib/intent-guard/link-plan.ts:22` → `pickClusterKey(fp)`:

```text
industry → audience → channel → modifier → entity:<primary_entity>
```

Two facts follow directly:

1. Every generated cluster key is **namespaced** `prefix:value`. A bare
   `gpt-bot` is not a member of that vocabulary.
2. Where the entity axis *is* used for grouping, it is used **last**, only after
   industry, audience, channel and modifier all resolve to `none`, and it is
   still emitted as `entity:<value>` — never bare.

So the proposed fallback would have written a value that is malformed by the
repository's own convention, and for the common case where the Yandex query
resolves no entity it would have written the literal string `none`.

## Consumers of `cluster_key`

| Consumer | Line | Null handling |
|---|---|---|
| `functions/lib/intent-guard/plans.ts` | `:106`, `:160` | `item.cluster_key \|\| null` — persists null |
| `functions/lib/intent-guard/reservations.ts` | `:90` | `input.cluster_key \|\| null` |
| `functions/lib/seo-autopilot/automation.ts` | `:107` | `row.cluster_key ? String(row.cluster_key) : null` |
| `functions/lib/seo-autopilot/direct-launch.ts` | `:225` | `stringOrNull(parsed.cluster ?? parsed.cluster_key)` |
| `functions/api/admin/seo/topic-plans/[id]/items/[itemId]/launch.ts` | `:52`, `:96` | passes through, nullable |
| `functions/api/admin/seo/topic-plans/[id]/items/[itemId]/index.ts` | `:41` | `item.cluster_key \|\| undefined` |
| `functions/api/admin/seo/topic-plans/index.ts` | `:51` | pass-through |

Every consumer treats `null` as a first-class value. None branches on
`cluster_key` for correctness, and none fails, degrades or warns when it is
absent.

## Historical behaviour

The dead read predates R0.4-RC2 and has never executed. Both the plan item and
the reservation created by the Yandex quick-launch path have always stored
`cluster_key = NULL` unless the operator supplied `cluster` in the request body.
RC2 preserved that byte-for-byte and pinned it with two behavioural tests in
`tests/functions-type-safety.test.ts`:

- *quick launch: cluster_key comes from the request only — the fingerprint
  bucket never leaks in*
- *quick launch: an explicit cluster from the request is stored verbatim*

## Does the missing fallback create a defect?

No.

- **Grouping is not lost.** Quick-launch persists the complete fingerprint in
  `seo_topic_plan_items.fingerprint_json`. The link planner recomputes its
  grouping from that fingerprint through `pickClusterKey`, so entity-based
  grouping is still available downstream without a stored `cluster_key`.
- **No consumer degrades.** See the table above.
- **The planner path is unaffected.** Topic-plan items created by
  `topic-suggester` continue to receive a proper namespaced `cluster_key`; only
  the ad-hoc Yandex sandbox path leaves it null, which is exactly what an
  operator-driven one-off launch means.

## Would adding the fallback cause harm?

Yes, in two measurable ways.

1. **Vocabulary corruption.** `cluster_key` would start receiving bare tokens
   and, most often, the literal `none` — values no generator produces and no
   filter expects. `topic-suggester.matchesFilter` compares `filters.cluster`
   against slot-derived namespaced keys, so bare values would silently never
   match and would pollute any future grouping report.
2. **Silent regrouping of stored rows.** New reservations and plan items would
   be grouped differently from every historical row, with no migration and no
   operator-visible change.

It would **not** affect cannibalization or idempotency: the active-intent
uniqueness index is `uniq_active_intent ON seo_topic_reservations(locale,
intent_key)` (`migrations/0004_intent_guard.sql`), and `cluster_key` is not part
of it.

## Tests and documentation touching this

- `tests/functions-type-safety.test.ts` — two behavioural tests pinning the
  current semantics (listed above).
- `tests/intent-guard.test.ts` — exercises `IntentFingerprint` including
  `primary_entity`; contains no `cluster_key` expectation.
- `reports/release/functions-contract-{before,after}.json` — record
  `cluster_key_source: "request body 'cluster' only; absent means NULL"` on both
  sides of the RC2 diff.

## Decision

`no_change_required`.

The absence of a `primary_entity` fallback is correct, not an oversight:
`cluster_key` is a namespaced planner label, `primary_entity` is a bare
fingerprint axis, and the entity axis is already consulted — last, and
namespaced — by the component that actually needs entity grouping. Runtime is
left untouched. This item is closed and should not be re-opened as a
release blocker.
