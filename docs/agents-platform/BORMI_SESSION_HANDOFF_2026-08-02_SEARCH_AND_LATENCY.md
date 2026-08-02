# Bormi — maximum-detail session handoff, 2026-08-02

> **Read this first if you are picking up Bormi work.**
>
> This document covers everything that happened **after** commit `d47d998`.
> It does not replace `BORMI_MARKET_MAXIMUM_DETAIL_HANDOFF_2026-08-02.md` — that
> one is still the authority for everything up to and including the v8 fast-path
> release. This one continues from there and is authoritative for the current
> production state.
>
> Written at `main = 253c1b7`. Live root deployment `4740a652`, live static Mini
> App deployment `f91f2044`.

---

## 0. The thirty-second version

Voice search was verified, merged and released. Then three defects surfaced in
sequence during the owner's real-device canaries, each one exposing a deeper
problem than the last, and each was fixed and released:

1. Typed search did not reduce a sentence, so «Мне нужен блокнот» searched for
   all three words.
2. The reduction was a hand-written stop-word list, which **cannot** work in
   Russian or Uzbek — it missed filler and, worse, could never match «блокнотов»
   against a stored «Блокнот». Replaced with catalog-vocabulary grounding plus a
   catalog-constrained AI fallback.
3. The voice result put an editable transcript with an «Искать» button above the
   products, and pressing it discarded everything the voice pipeline understood.
   Demoted to a compact line with correction one tap away.

Then the owner reported the launch screen stalling. Diagnosed as three dependent
D1 round trips from Tashkent to a database in Chicago; fixed with Smart
Placement. **The saving is not yet measured.**

**Voice + AI search are confirmed working by the owner on a real device.**
The latency fix is not yet confirmed.

---

## 1. Where the code lives

### 1.1 Working copy

```text
F:\Claude\gptbot-bormi-api-fix        ← THE canonical worktree. Now on `main`.
F:\Claude\gptbot-repo-clean-20260801  ← lags. Do not start here.
F:\Claude\gptbot-main-baseline-20260801 ← detached a146413, scratch
```

`git worktree list` from any of them shows all three. GitHub remote is
`braindiggeruz/ai-direct-pro-landing`.

Before this session the canonical worktree sat on `fix/bormi-api-origin`. That
branch is merged and pushed; the worktree now tracks `main`.

### 1.2 Two traps in this worktree

**`node_modules` is a junction** into `gptbot-repo-clean-20260801`. That covers
the root, but **`apps/gpt-backend/node_modules` is not covered**. Until you run
`npm ci` in `apps/gpt-backend`, two suites abort on an unresolvable
`@supabase/supabase-js` and read as genuine failures:

```bash
cd apps/gpt-backend && npm ci
```

They pass 13/13 and 30/30 afterwards. It was already run in this session, but a
fresh clone will hit it again.

**PowerShell 5.1 writes a UTF-8 BOM.** `Set-Content -Encoding UTF8` and
`Out-File` prepend `EF BB BF`, which broke a test in this session by corrupting
`router.ts`. If you must rewrite a file from PowerShell, use
`[IO.File]::WriteAllText(path, text, (New-Object Text.UTF8Encoding($false)))`,
or just use the editor tools.

### 1.3 Toolchain

```text
node v24.13.0 · npm 11.6.2 · wrangler 4.103.0 · Windows PowerShell 5.1
```

Wrangler is already authenticated by OAuth as `braindigger.uz@gmail.com`,
account `14ce9e04574f2e6d825e56ee603e5cd5`. No `CLOUDFLARE_API_TOKEN` is needed
— run `wrangler whoami` before concluding a deploy is blocked. **Yarn is not
installed**; use npm or `node_modules/.bin`.

---

## 2. Production state right now

### 2.1 Deployments

| Project | Deployment | Source | Notes |
|---|---|---|---|
| `ai-direct-pro-landing` (root + BFF) | `4740a652-2737-478b-9833-def9f1363d7b` | `198170f` | aliased to `https://gptbot.uz` |
| `gptbot-market-mini-app` (static) | `f91f2044-97ac-449f-b823-960eea83f860` | `e4669b7` | branch `feature/gptbot-market-mini-app-synthetic-candidate` |

The two are intentionally on different commits: `198170f` changed only the
Worker (placement + a Functions file), so the static bundle was not rebuilt or
redeployed.

**Rollback ladder** — each row is a working state you can revert to by promoting
the deployment in the Cloudflare dashboard:

```text
root                              static                            source
4740a652  (live)                  —                                 198170f  placement + media key
e3aa4b9a                          f91f2044  (live)                  e4669b7  compact voice summary
bae0eb14                          47497796                          127691d  catalog-grounded search
240523c3                          d57e05b1                          297c3bb  typed sentence reduction
76f59061                          2af92899                          4367850  voice search merge
41a3d4de                          49111efd                          d47d998  v8 fast path, pre-voice
```

### 2.2 Configuration live in production

```text
MARKET_VOICE_SEARCH_ENABLED = "true"
MARKET_AI_SEARCH_ENABLED    = "true"
placement                   = { mode: "smart" }      (production only)
30 secret_text variables, unchanged throughout
GROQ_API_KEY present · OPENAI_API_KEY absent (optional fallback, by design)
```

Verified through the Cloudflare API after each deploy, not assumed.

### 2.3 Things that are still OFF, and must stay off without explicit authorization

```text
real stores onboarded       0
payments                    NOT AUTHORIZED
public marketplace          NOT AUTHORIZED
Pages Git auto-deploy       deployments_enabled=false,
                            production_deployments_enabled=false,
                            preview_deployment_setting=none
```

Pushing `main` therefore creates **no** deployment. Every release in this session
was a manual `wrangler pages deploy` of the exact tree.

### 2.4 Data

D1 database `gptbot-ai-drafts`, id `97ef0372-d937-406f-8871-755368d9afff`,
binding `GPTBOT_DRAFTS_DB`. **Primary region ENAM, colo ORD (Chicago)** — this
matters, see §6.

Read-only probe, unchanged across every deploy in this session:

```text
stores 1 · products 48 · orders 1 · order items 1 · inventory moves 44
handoffs 1 · notifications 0 · storefront sessions 2 · agent routes 1
onboardings 0
changed_db=false   rows_written=0
```

No migration was applied and no Telegram Bot API call was made in this session.

---

## 3. Commit chain, in order

Everything below is on `main` and pushed.

```text
d47d998  perf(market): return catalog before secondary account data   ← base, was live
7b679f2  docs(market): add maximum-detail Bormi handoff
f45ff09  feat(market): add grounded voice search to Bormi              ← pre-existing, unpushed at session start
ca4dc99  docs(market): record the Bormi voice search release           ← pre-existing, unpushed
bbecfa6  docs(market): keep the voice API table out of the secret-scan gate
4367850  Merge branch 'fix/bormi-api-origin'                           ← --no-ff, no conflicts
1ea5493  docs(market): record the Bormi voice search release
297c3bb  feat(market): read a typed sentence the way voice already does
c65a89d  docs(market): record the typed-search reduction release
127691d  feat(market): understand the sentence instead of filtering it
8746b51  docs(market): record the catalog-grounded search release
e4669b7  feat(market): let speaking land on products, not on a transcript
9a39d85  docs(market): record the voice-lands-on-products release
198170f  perf(market): stop the launch waiting on another continent
253c1b7  docs(market): record the launch latency placement release
```

`origin/main` was `e2977d3` at session start. The merge brought in 37 commits
of already-built work; `main` had two content-only commits the branch lacked,
and they merged cleanly because the branch already carried the same content as
`bc2792b`.

---

## 4. The search pipeline as it stands

This is the part a future agent is most likely to touch. Understand it before
changing anything.

### 4.1 One path, two entry points

Both `GET /catalog/products` and `POST /voice/search` call **`runCatalogSearch`**
in `functions/market/router.ts`. There are exactly two call sites and a test
asserts that count. The invariant this protects: *voice can never return a
product that typed search would not return.*

### 4.2 What happens to a sentence

```text
"Слушай, мне нужны блокноты, можешь дать блокнотов"
        │
        ├─ 1. storefrontVocabulary(context)          functions/market/router.ts
        │     reads product names + seller searchTerms + category names
        │     cached per isolate, 60 s, max 32 storefronts
        │
        ├─ 2. groundQueryInCatalog(raw, vocabulary)  functions/market/search-intent.ts
        │     per token: exact hit → keep
        │                stem hit  → keep THE CATALOG'S FORM
        │                otherwise → drop (diagnostic only, never shown)
        │     → "блокнот"
        │
        ├─ 3. if nothing grounded AND MARKET_AI_SEARCH_ENABLED:
        │       resolveSearchIntentWithAi(...)       functions/market/search-ai.ts
        │       model is given the store's REAL terms + REAL category ids,
        │       its answer is intersected with them before any search
        │
        ├─ 4. if still empty: reduceSearchQuery(raw) functions/market/search-query.ts
        │     stop-word fallback → finds nothing → honest zero result
        │
        └─ 5. searchPublishedProducts(buyer, queryApplied, limit)   UNCHANGED
              rankCatalogProducts                                   UNCHANGED
```

### 4.3 Why the stem rule, and its exact numbers

The catalog stores «Блокнот». `rankCatalogProducts` matches by **substring**, so
the stored word is found inside «блокноты» but **not** inside «блокнотов». That
is why the shopper's own product word came back as an unmatched condition, and
why no filler list could ever have fixed it.

`sharesStem(spoken, catalogWord)` in `search-intent.ts`:

```text
MIN_STEM   = 4     shortest word worth stem-matching
STEM_RATIO = 0.75  shared prefix must cover this much of the shorter word

блокнотов / блокнот   prefix 7, shorter 7, need max(4, 6) → match
лампочка  / лампа     prefix 4, shorter 5, need max(4, 4) → match
колонка   / колонна   prefix 5, shorter 7, need max(4, 6) → NO match
дай       / дата      shorter 3 → below MIN_STEM, NO match
```

If you tune these, `tests/market-search-intent.test.ts` has the boundary cases.

### 4.4 The AI layer, and why it cannot hallucinate a product

`functions/market/search-ai.ts`:

- Facade: `createLegacyLlmStructuredDriver(env, { featureByTask: { intent: 'judge' } })`.
  `judge` is the existing light short-JSON route in `functions/lib/llm` — a
  small fast model with retry, circuit breaker and usage accounting already
  attached. Served by Mistral / OpenRouter / Gemini, all of which have keys in
  production. **No new credential was introduced.**
- Limits: `timeoutMs 4000`, `maxTerms 4`, `maxSentenceChars 240`.
- The prompt hands over `vocabulary.promptTerms` (≤120 real terms) and the real
  category ids, and asks for JSON only.
- **Every field is then validated against the live catalog**: terms are
  intersected with the vocabulary via `keepCatalogWords`, `categoryId` must be
  one of the real ids, price must be a positive safe integer within
  `CATALOG_LIMITS.priceMinor`, availability must be exactly `"available"`.
- Any failure — outage, timeout, malformed JSON, invented product — returns
  `null` and the deterministic result is used. Search never errors because of
  this.

This is recorded as **D-042**, which explicitly supersedes the D-040 clause
"the only model in the request path is speech-to-text". The invariant that
clause protected is now enforced by validation rather than by absence.

### 4.5 What the shopper sees

The old «Не нашли по условию: слушай, блокноты, можешь, дать, блокнотов» line is
**retired**. Listing failed words is only fair if you can tell a real condition
from filler, and that needs the list again. Replaced with the positive fact,
shown only when it differs from what was typed:

```text
Искали: блокнот          RU
Qidirdik: bloknot        UZ
```

A dropped «чёрная» is visible the same way — «Искали: наушники» says colour was
not used.

### 4.6 Voice result presentation

`VoiceSummary` in `apps/market-mini-app/src/components/VoiceSearch.tsx` is now
one compact line:

```text
🎤 блокнот                          [Изменить] [×]
   Распознано автоматически
```

- headline = `interpretation.productQuery || transcript` — what ran, not the raw
  sentence; the raw sentence appears only when nothing was understood
- the editable transcript and its «Искать» button live behind `editing`
- the automatic-recognition caption stays (the disclosure rule is unchanged)
- the removable budget/stock chips and the single clarification question are
  untouched — they are genuine forks, not confirmation steps
- `BuyerApp` suppresses the «Искали» line while a voice result is on screen

**Why this mattered:** pressing «Искать» re-runs the raw sentence as an ordinary
typed search and throws away the entire voice interpretation. An internal step
had been promoted to the interface.

---

## 5. Files this session created or changed

### 5.1 New

```text
functions/market/search-query.ts        stop-word vocabulary, reduceSearchQuery (fallback only)
functions/market/search-intent.ts       catalog vocabulary, stem grounding, isolate cache
functions/market/search-ai.ts           catalog-constrained intent resolution
tests/market-search-query.test.ts       10 tests
tests/market-search-intent.test.ts      15 tests
tests/market-launch-performance.test.ts  5 tests
docs/agents-platform/BORMI_SESSION_HANDOFF_2026-08-02_SEARCH_AND_LATENCY.md   this file
```

### 5.2 Changed

```text
functions/market/router.ts              runCatalogSearch grounds, falls back to AI, returns
                                        { results, queryApplied, rewrites, aiAssisted }
functions/market/voice/constraints.ts   imports the shared vocabulary instead of defining it
functions/agents/sotuvchi/catalog/service.ts   + listStorefrontVocabulary (additive, read-only)
functions/agents/sotuvchi/catalog/types.ts     + CatalogVocabularyEntry
functions/agents/sotuvchi/catalog/index.ts     export
functions/platform/market/media.ts      HMAC key memoized per isolate
functions/_types.ts                     + MARKET_AI_SEARCH_ENABLED
wrangler.toml                           + MARKET_AI_SEARCH_ENABLED, + [placement] mode = "smart"
apps/market-mini-app/src/components/VoiceSearch.tsx   compact summary
apps/market-mini-app/src/screens/BuyerApp.tsx         searchedFor line, seeds queryApplied
apps/market-mini-app/src/lib/i18n.ts    + searchedFor, + voiceEdit (RU and UZ)
apps/market-mini-app/src/styles.css     headline truncation
apps/market-mini-app/src/dev/synthetic.ts   fixture stem-matches its own words
apps/market-mini-app/test/voice-search.test.ts   18 tests now
docs/agents-platform/{STATE.json,TEST_MATRIX.md,DECISIONS.md,HANDOFF.md}
docs/agents-platform/mini-app/implementation/BORMI_VOICE_SEARCH_RELEASE.md  §13–§17
```

### 5.3 The single most important read

`docs/agents-platform/mini-app/implementation/BORMI_VOICE_SEARCH_RELEASE.md`.
Sections 13 through 17 are the full narrative of this session with every
measurement. Section 11 is the owner canary script.

---

## 6. The latency work — what is proven and what is not

### 6.1 Diagnosis (measured, not guessed)

The «Собираем витрину…» screen is `LoadingView`, rendered while exactly one
request is in flight: `POST /session/launch`.

The client is **not** at fault. v8 already fixed it: React mounts without a
prefetch gate, `initData` is read from Telegram's URL fragment so nothing waits
on the bridge script, and the request fires on mount.

```text
D1 primary                  ENAM / ORD (Chicago)   ← measured via read-only probe
buyer                       Tashkent
one D1 round trip           ≈ 250 ms

launch chain, each step needing the previous answer:
  verifyTelegramInitData    crypto only
  getOrCreateIdentity       D1
  bindMarketLaunch          D1   needs identity id
  catalogHomePayload        D1   needs store id      (its two queries already parallel)

endpoint latency, remote client, HMAC-rejection path only (no D1 work at all):
  731 ms cold · ~145 ms warm

Functions bundle: 2 086 296 bytes
```

Seller resolution is already skipped on the launch path
(`resolveMarketAccess(..., !includeLaunch)`).

### 6.2 What was changed

- `[placement] mode = "smart"` in `wrangler.toml`. The request crosses the ocean
  once; the dependent queries then run beside D1. Static assets and prerendered
  pages never enter the Worker, so only the API path moved.
  **Confirmed applied:** the Cloudflare API reports
  `deployment_configs.production.placement = {"mode":"smart"}`.
- `issueMediaHandle` memoized its imported HMAC key. One launch signs a handle
  per image per product on the home screen — up to sixty `importKey` calls for
  the same key from the same secret.

### 6.3 What was deliberately NOT done, and why

- **No caching of the home catalog.** It would remove two D1 queries. Rejected:
  that payload carries live price and availability, and Bormi's entire claim is
  that those are honest. A stale price is worse than a slow one.
- **No bundle splitting.** 2.09 MB is real cold-start parse cost, but splitting
  the whole GPTBot Functions tree is separate work with real blast radius.

### 6.4 NOT VERIFIED — read this before claiming the fix worked

Smart Placement is a Cloudflare-side decision that relocates on **live traffic**,
not at deploy time. Immediately after the deploy the endpoint answered in
139–159 ms from a remote client on the HMAC-rejection path — unchanged, which is
expected, because that path touches no database.

**The saving has not been measured.** It must be observed on a real device, after
several launches, against the owner's own before/after impression. Do not write
"launch is now instant" anywhere until that happens.

---

## 7. Test state

Full repository corpus at `253c1b7`: **1143 of 1146**.

The three failures are **pre-existing** and were reproduced unchanged at
`d47d998` in a detached worktree, i.e. they were already failing on the
previously live source:

```text
react-router-v8-migration  the current productization baseline preserves every public and admin route pattern
react-router-v8-migration  sitemap generation retains all 234 static canonical entries   (240 are emitted)
sotuvchi-onboarding        buyer storefront route resolves the store but never launches seller onboarding
```

The third asserts on the **last** delivered Telegram message, and the buyer
greeting stopped being last at `04a8957`. All three are stale expectations, not
runtime defects. They should be re-baselined as their own change, not quietly
inside a release.

Other gates, all green at `253c1b7`:

```text
tsc -b                                   0 errors
tsc -p tsconfig.functions.json           0 errors
apps/market-mini-app tsc -b              0 errors
apps/market-mini-app tests               18/18
scripts/check-agent-boundaries.ts        OK
npm run scan:secrets                     clean, 2 981 files
eslint on every changed file             0 problems
npm run build                            113 pages, 124 articles, sitemap 240, 10 LLM twins
wrangler pages functions build           Compiled Worker successfully
```

### 7.1 How to run the full corpus on Windows

```bash
node --import tsx --test --test-concurrency=1 tests/*.test.ts
```

`--test-concurrency=1` matters — a parallel run can OOM on this machine. Set
`NODE_OPTIONS=--max-old-space-size=6144` if it still struggles.

---

## 8. Gotchas that cost time in this session

**The secret scanner flags prose.** `scripts/scan-secrets.ts` has a markdown-table
rule added after the R0.3 incident (the leaked file was written as a table). Any
table row where one cell holds a credential word — `bearer`, `token`, `secret`,
`password`, `api key`, `логин`, `парол` — and any cell holds a 24+ character
mixed alphanumeric run is a `high` finding. A long API path is enough. The
scanner's own instruction is to **reword the line**, never to widen
`EXEMPT_FILES`. This cost commit `bbecfa6`.

**A comment containing `select ` fails a test.** `tests/market-mini-app-contract.test.ts`
asserts `functions/market/router.ts` contains no raw SQL, with a case-insensitive
`/SELECT\s|INSERT\s|UPDATE\s|DELETE\s+FROM/`. A doc comment reading "it can
select from the catalog" tripped it. `selecting` is fine; `select ` is not.

**`wrangler pages deploy` rewrites the project's plain `[vars]`** from
`wrangler.toml` — that is how both feature flags and the placement setting
reached production. `secret_text` variables are preserved (all 30 survived every
upload), but a **dashboard-only binding is deleted by the next direct upload**.
This is the documented root cause of an earlier KV regression.

**The static Mini App project has no `wrangler.toml`.** Deploying from
`apps/market-mini-app` did not touch its nine plain variables or its KV/D1
bindings. Verified through the API rather than assumed.

**Never `--branch=main` for the static project.** Its production branch is
`feature/gptbot-market-mini-app-synthetic-candidate`; `main` would create a
Preview.

**The Browser pane composited no frames** during this session — screenshots timed
out and synthetic clicks did not register, though `read_page`, `get_page_text`
and `read_console_messages` worked. Two UI changes are therefore source-asserted
and type-checked but were never seen rendered.

---

## 9. Open items, ranked

### 9.1 The Telegram bot has the same weakness the Mini App just lost

`functions/agents/sotuvchi/buyer/parser.ts` falls through to the raw normalized
message when it is short enough, so «мне нужен блокнот» reaches
`rankCatalogProducts` with the intent words attached — exactly what the Mini App
no longer does.

It was left alone **deliberately**: the shared vocabulary lives in the Market
layer and `scripts/check-agent-boundaries.ts` forbids the agent layer from
importing it. Closing this is a boundary decision — move the vocabulary to
`functions/platform`, or give the parser its own — not a copy-paste. Do not
change Telegram behaviour quietly inside a Mini App release.

### 9.2 Functions bundle cold start

2.09 MB, because the whole GPTBot Functions tree compiles into one Worker. This
is the next lever if the launch is still not instant after Smart Placement has
had traffic to relocate on.

### 9.3 The AI search call has never run against a live provider

It has real credentials and it fails closed, but the first sentence containing
no catalog word will be the first real proof. Note also that a call exceeding
the 4 s budget is abandoned by the facade rather than aborted upstream, so a
slow provider costs the request nothing but may leave the upstream fetch
running.

### 9.4 Owner canary items still outstanding

From the release record §11 — the Uzbek voice run and the microphone-denied run.
The Russian run passed on 2026-08-02.

### 9.5 Older, unchanged

- `automation-llm-key` (medium) — the automation Worker has no LLM key
- `pages-var-triple-underscore` (low) — a production secret literally named `___`
- `n8n-workflow-disabled-evidence` (low)
- R1 Store Pilot #1 is blocked on **owner evidence**, not engineering: one
  consented verified seller, 10–30 approved products with integer UZS prices,
  photos or an explicit decision to launch without them, legal and native Uzbek
  sign-off, SLA and incident ownership, and explicit one-store authorization.

---

## 10. How to release, exactly

The sequence used five times in this session, in order:

```bash
cd F:\Claude\gptbot-bormi-api-fix
```

```bash
npm run scan:secrets
```

```bash
npx tsc -b && npx tsc -p tsconfig.functions.json --noEmit
```

```bash
node --import tsx --test --test-concurrency=1 tests/*.test.ts
```

```bash
npm run build
```

Then, only with explicit owner authorization, deploy root:

```bash
npx wrangler pages deploy dist --project-name=ai-direct-pro-landing --branch=main --commit-hash=<sha>
```

And the static Mini App, from `apps/market-mini-app` after `npm run build`:

```bash
npx wrangler pages deploy dist --project-name=gptbot-market-mini-app --branch=feature/gptbot-market-mini-app-synthetic-candidate --commit-hash=<sha>
```

Then verify — do not assume:

- read the project through the Cloudflare API and confirm the deployment id,
  the commit hash, the flags, the placement and that the `secret_text` count is
  still 30
- HTTP canaries: root / RU / UZ Sotuvchi 200, immutable deployment 200, static
  canonical and hashed assets 200, Agents webhook `GET` 405 and unauthorized
  `POST` 401, unauthenticated `POST /voice/search` 401, malformed
  `POST /session/launch` 400
- read-only D1 probe, and confirm `changed_db=false` and `rows_written=0`
- record the deployment ids, the exact SHA and the canary results in
  `STATE.json`, `TEST_MATRIX.md` and the release record **before** calling it
  done

---

## 11. What to say and what not to say

This project's governance is unusually strict about claims, and the owner reads
the records. Hold the line:

- «deployed and enabled» ≠ «working». Only an owner canary on a real device
  moves something into «working».
- Never call a canary passed that you did not run.
- If a gate fails for an environment reason, say so and say what fixed it —
  do not quietly re-run until green.
- Pre-existing failures must be **proven** pre-existing by reproducing them at
  the previously deployed SHA in a detached worktree, not asserted.
- No real store, payment or public marketplace action without explicit,
  specific owner authorization for that action.

---

## 12. Decision records to read before changing search

- **D-042** (this session) — search is grounded in the catalog's own words; the
  model may select from them but never add to them. Supersedes the D-040 clause
  about speech-to-text being the only model in the request path.
- **D-040** — voice reuses the production speech stack behind the platform AI
  contract. Still authoritative for everything except that one clause.
- **D-041**, **D-036**, **D-035**, **D-033** — release shape, accessibility
  evidence limits, and the media `file_id` contract.

All in `docs/agents-platform/DECISIONS.md`.
