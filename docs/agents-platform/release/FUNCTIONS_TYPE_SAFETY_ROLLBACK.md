# Rollback — Cloudflare Functions type safety (R0.4 Local RC2)

Scope: the local elimination of the 27 accepted legacy TypeScript errors in
`functions/`. This change is **local only**. Nothing was pushed, deployed,
migrated or mutated remotely, so there is no production state to reverse — a
rollback here restores a local Git tree, nothing more.

## 1. Previous known-good HEAD

```text
200d468dcd045a47b48bebcdb56005b502300aa9
chore(release-gate): close router advisory for local release candidate
```

That commit is the R0.4 Local RC1 tree. Its Functions baseline is
**exit 2 / 27 errors / 6 files** — reproducing that number is the proof a
rollback landed.

Offline evidence created before any modification:

```text
F:\Claude\gptbot-r0.4-rc2-backups\pre-200d468-<TIMESTAMP>\
  gptbot-repo-full-200d468-<TIMESTAMP>.bundle   (git bundle verify = complete, 64 refs)
  gptbot-repo-mirror.git                        (clone --mirror --no-hardlinks, git fsck --full clean)
```

Both live outside the repository, are not tracked by Git and were never
published. Do not delete them until R0.3B closes.

## 2. Changed files

Source (behaviour-preserving type work):

| File | Change |
|---|---|
| `functions/api/admin/ai-drafts/[id]/status.ts` | body read as `unknown`; closed-list `parseSettableStatus` |
| `functions/api/admin/cockpit.ts` | `PagesFunction<Env>` + `withErrorHandler<Env>` |
| `functions/api/admin/seo/yandex/quick-launch.ts` | dead `fingerprint.entity` read removed via a single `clusterKey` |
| `functions/lib/seo-autopilot/normalise.ts` | `NormalisedArticleCandidate` / `NormalisedDraftBundle`; cast replaced by a type-guard filter |
| `functions/lib/telegram/analysis.ts` | error codes split into `SanitizeErrorCode` / `AnalysisTransportErrorCode` / `AnalysisErrorCode` |
| `functions/lib/telegram/store.ts` | `TgOwnedItemRow` + `hasSourceText` predicate; `getOwnedItem` returns the narrowed row |
| `functions/lib/telegram/handler.ts` | `runAnalysis` / `runModifier` take `TgOwnedItemRow`; four non-null assertions deleted |

Tests and evidence:

| File | Change |
|---|---|
| `tests/functions-type-safety.test.ts` | new, 38 behavioural tests |
| `docs/agents-platform/release/FUNCTIONS_TYPE_ERROR_INVENTORY.json` | new |
| `docs/agents-platform/release/FUNCTIONS_TYPE_SAFETY_ROLLBACK.md` | this file |
| `reports/release/functions-contract-{before,after,diff}.json` | new |

No `tsconfig` was touched. No file was excluded from compilation. No
`any`, `as any`, `as unknown as T`, `@ts-ignore` or `@ts-expect-error` was added.

## 3. API contract comparison

`reports/release/functions-contract-diff.json`:

```text
breaking_changes        = 0
wire_observable_changes = 0
verdict                 = no unintended public contract changes
```

HTTP methods, status codes, JSON field names, nullable fields, error codes,
route paths, auth requirements, environment names, D1 table names, Telegram
reply markers and feature-flag defaults are unchanged. The three material diff
entries are additive internal TypeScript type exports plus one restatement of
an already-true runtime guarantee.

## 4. Database and schema assumptions

**No migration was added, changed or applied.** `migrations/0001`–`0024` are
byte-identical to RC1 and `0013`–`0024` remain unapplied on remote D1.

Assumptions the code now states in types, which a rollback does not invalidate:

- `telegram_items.source_text` is `TEXT` and therefore `string | null` from D1.
  `getOwnedItem` rejects the null case; `TgOwnedItemRow` only names that.
- `ai_drafts.status` holds one of `pending_review | needs_revision | imported |
  rejected`. An unrecognised value still fails closed (409) exactly as before.
- Cockpit aggregate reads stay `COUNT(*)`-shaped and tenant-free.

A rollback therefore needs **no** schema step in either direction.

## 5. Feature flags

Unchanged and unread by this work:

| Flag | Default | Meaning |
|---|---|---|
| `SEO_AUTOPILOT_USE_DIRECT_AI` | `true` | first-party direct path on; the n8n bridge only runs when explicitly `false`/`0`/`no` |
| `N8N_INGEST_ENABLED` | absent → off | legacy ingest stays disabled |
| `FIRST_PARTY_AUTOMATION_ENABLED` | absent → off | Worker prepared, not deployed |
| `EXTERNAL_AUTOPILOT_TRIGGER_ENABLED` | `false` | public bridge trigger off |
| `JAVOB_BILLING_ENABLED` and the Click/Payme flags | off | payments disabled |

## 6. Rollback commands

Local `main` moved by fast-forward only, so the reverse is a branch reset to the
recorded SHA — no history is rewritten and no remote ref is touched.

```bash
git -C F:/Claude/gptbot-repo status --porcelain
```

```bash
git -C F:/Claude/gptbot-repo branch backup/pre-rc2-rollback-$(git -C F:/Claude/gptbot-repo rev-parse --short HEAD)
```

```bash
git -C F:/Claude/gptbot-repo checkout main
```

```bash
git -C F:/Claude/gptbot-repo reset --keep 200d468dcd045a47b48bebcdb56005b502300aa9
```

`--keep` is deliberate: it refuses to run rather than discard uncommitted work,
unlike `reset --hard`, which this project forbids.

Preferred alternative when the commits must stay in history — revert instead of
reset, newest first:

```bash
git -C F:/Claude/gptbot-repo revert --no-edit <rc2-governance-sha> <rc2-fix-sha>
```

### Verification after rollback

```bash
git -C F:/Claude/gptbot-repo rev-parse HEAD
```

```bash
npx tsc -p tsconfig.functions.json --noEmit
```

Expected: **exit 2, exactly 27 errors in 6 files** — the RC1 baseline.

```bash
npx tsc -b
```

```bash
corepack yarn build
```

Expected: exit 0; 106 pages, 98 articles, 207 sitemap entries.

```bash
npx tsx scripts/seo-audit.ts
```

Expected: 0 critical, orphan 0.

```bash
npx tsx scripts/scan-secrets.ts
```

Expected: clean.

```bash
git -C F:/Claude/gptbot-repo fsck --full
```

Full suite after rollback: **788/788 across 33 suites**
(`tests/functions-type-safety.test.ts` is gone with the change).

If the tree is unrecoverable, restore from the offline bundle into a **new**
directory and compare — never clone over the working repository:

```bash
git clone F:/Claude/gptbot-r0.4-rc2-backups/pre-200d468-<TIMESTAMP>/gptbot-repo-full-200d468-<TIMESTAMP>.bundle F:/Claude/gptbot-restore-check
```

## 7. Rollback vs forward-fix

| Symptom | Decision |
|---|---|
| Functions typecheck regressed to a non-zero exit | forward-fix — the failing file is named in the compiler output and the change set is seven files |
| A behavioural test in `tests/functions-type-safety.test.ts` fails | forward-fix — the test names the boundary; do not weaken the test |
| A pre-existing suite regressed | forward-fix if it maps to one of the seven files; roll back if the cause is unclear after one pass |
| `functions-contract-diff.json` shows a wire-observable change | **roll back** — a public contract change is out of scope for this sprint |
| A draft reached `imported` or `published` without the import endpoint | **roll back immediately**, then investigate |
| A purged Telegram transcript became resumable | **roll back immediately** — this is the retention boundary |
| A cross-endpoint behaviour changed that no test covers | roll back, then reland with the missing test first |

Forward-fix is the default because the change set is small, isolated and fully
covered. Roll back whenever a safety invariant — no auto-publish, retention,
idempotency, tenant neutrality — is in question.

## 8. Prohibited during rollback

Never, under any rollback path:

- `git push`, `git push --force`, `--force-with-lease`, or any remote ref update
- remote history rewrite; `git rebase`; `git reset --hard`
- production deploy (Cloudflare Pages or Railway), or unpausing auto-deploy
- production D1 migrations, or creating any Cloudflare resource
  (D1, KV, R2, Queue, DLQ, Worker, Cron)
- webhook creation, mutation or removal
- credential, env-var or secret mutation or rotation
- n8n workflow or scheduler mutation
- deleting the offline bundle, the mirror, `refs/stash`, dangling objects,
  or any backup branch
- touching the untracked `gptbot.uz-audit/` directory

## 9. Rehearsal result

Rehearsed in a disposable worktree created from the RC2 tip and reset to
`200d468`, with the main repository untouched. Recorded outcome:

- `git status --porcelain` empty after the reset
- `git diff 200d468 --stat` empty — the tree matches the previous HEAD exactly
- `npx tsc -p tsconfig.functions.json --noEmit` reproduced **exit 2, 27 errors,
  6 files**, byte-identical to the RC1 baseline
- the disposable worktree was removed afterwards; no ref outside it changed
