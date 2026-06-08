# AI SEO Autopilot — Free LLM MVP

White-hat assistant inside `/admin-tools/seo-booster`. Generates **draft patches** for orphan/weak SEO assets, validates them server-side, and lets the admin approve fields one at a time. **Never auto-publishes.**

## Providers

| Provider | Where | Key required | Notes |
|----------|-------|--------------|-------|
| **Puter Free LLM** | browser (Puter.js v2) | none | primary; loaded only on `/admin-tools/*` |
| **Mock**           | browser              | none | deterministic; for tests / offline |
| **Gemini Free**    | backend              | `GEMINI_API_KEY` (Cloudflare Pages env) | optional P1 fallback |
| ~~OpenRouter~~     | —                    | —    | **not used** |

## Routes

- `GET  /api/seo/ai/provider-status` — provider availability + Serper config status (admin JWT)
- `POST /api/seo/ai/validate-patch`  — validates a candidate against current `content/*` (admin JWT)
- `POST /api/seo/ai/apply-patch`     — appends approved fields to `content/seo/ai-runs.json` (admin JWT)
- `GET  /api/seo/ai/logs`            — returns ledger of past runs (admin JWT)
- `GET  /api/seo/ai/patch?runId=…`   — Editor Bridge: returns approved-field snapshot for a single run so the Page/Blog editor can prefill local draft state (admin JWT)
- `GET  /api/seo/serper/status`      — Serper provider status (configured / cached snapshots / queriesToday)
- `POST /api/seo/serper/query`       — raw query with cache-first + 7d TTL
- `POST /api/seo/serper/analyze-url` — analyze a GPTBot URL → SerpDigest
- `POST /api/seo/serper/batch`       — up to 5 URLs sequentially
- `GET  /api/seo/serper/logs`        — SerpRunLog ledger (last 200 entries)

## SERP Intelligence (P1)

Backend-only Serper client (`functions/lib/serper/*`). Compact SerpDigest is
forwarded to AI Autopilot as inspirational context — **never** copied verbatim
and the API key never reaches the browser.

Hard limits:
- cache-first, 7-day TTL keyed by `locale|gl|hl|location|query`
- top 10 organic only, title trimmed to 140 chars, snippet to 220
- digest payload ≤ 4 KB
- max batch = 5
- no auto-query on tab open; manual buttons only
- `SERPER_API_KEY` missing → status reports `configured=false` and the rest
  of SEO Booster keeps working unchanged

UI: new **SERP Intelligence** tab in `/admin-tools/seo-booster`. Pick a URL,
click **Run SERP Snapshot** (or **Force refresh**), review competitors / FAQ
ideas / content gaps / rank spot-check, click **Generate AI patch from SERP
context** to hand off to AI Autopilot with the digest pre-loaded.

## Editor Bridge (P0)

After an admin approves AI fields and `apply-patch` records them in
`content/seo/ai-runs.json`, the **Send to Page/Blog Editor** button hands the
approved snapshot off to the existing PageEditor / BlogEditor:

1. AI Autopilot detects the target editor from the patch URL
   (`parseEditorRoute` in `src/shared/ai-seo-bridge.ts`).
2. Approved field snapshot is mirrored into `sessionStorage` (key
   `aiSeoDraft:<runId>`) as an offline fallback.
3. Navigation goes to `/admin-tools/pages/:locale/:slug?aiPatch=<runId>` (or
   `/admin-tools/blog/:locale/:slug?aiPatch=<runId>`).
4. The editor’s `useAiDraftBridge` hook fetches the snapshot via
   `GET /api/seo/ai/patch?runId=…` (source of truth) and falls back to
   sessionStorage if the backend call fails.
5. A safety filter (`mapApprovedFieldsToEditorDraft`) strips any field that is
   not in `P0_BRIDGE_FIELDS[target]` — slug, canonical, status, robotsIndex,
   robotsFollow, hreflang*, and unsupported keys are **never** applied.
6. The editor shows a banner: _“AI SEO draft loaded. Review changes before
   saving. Nothing is published yet.”_  with a list of fields that will be
   prefilled. The admin clicks **Apply to draft** and the local form state is
   updated. **No auto-save. No auto-publish.** Existing **Save** and
   **Publish to GitHub** stay manual.

P0 forwardable fields:

- `page`: `title`, `description`, `h1`, `heroSubtitle`, `ogTitle`,
  `ogDescription`, `faq`, `internalLinks`
- `blog`: `title`, `description`, `h1`, `intro`, `ogTitle`, `ogDescription`,
  `faq`, `internalLinks`, `topicCluster`, `targetMoneyPage`, `keywords`

All endpoints require an admin Bearer token. Unauthenticated requests → `401`.

## Flow

1. Admin opens `/admin-tools/seo-booster` → **AI Autopilot** tab.
2. Picks a URL (orphans listed first), an action (Fix orphan, Improve SEO, Add internal links, Backfill topicCluster), and a provider (default: Auto-Free → Puter, falls back to Mock).
3. **Browser** builds a compact context and calls the chosen provider for strict-JSON output.
4. Frontend POSTs the raw candidate to `/api/seo/ai/validate-patch`.
5. Backend re-reads `content/*` via GraphQL and validates each field:
   - slug / canonical immutable
   - title 40–70 chars, description 110–165 chars
   - no fake claims (`%`/`гарантируем`/`top-3`/numeric review counts)
   - internal targets exist in content store, no `/admin-tools`, `/api`, `/draft`, `/test`, `/random`
   - locale lock (RU=Cyrillic, UZ=Uzbek Latin)
   - mojibake detector
   - duplicate FAQ
   - duplicate / self-loop internal links
6. UI renders before/after diff with per-field **Approve / Reject** buttons; blocked fields cannot be approved.
7. Admin clicks **Apply approved fields** → backend appends a single entry to `content/seo/ai-runs.json` (the *AI ledger*). Live pages under `content/pages/**` and `content/blog/**` are **never modified** by this flow.

`Publish to GitHub` and `IndexNow submit` stay as the existing manual actions.

## Safety properties

- Puter.js is injected only by `AiAutopilotTab.tsx` once it actually mounts under `/admin-tools/*`. The script is **not** present in public landing pages.
- All provider output is treated as untrusted text. Even the Mock provider goes through the same validator.
- The backend re-reads content on every `apply-patch` so a page going `draft` between generate and apply causes the patch to be rejected (409).
- `content/seo/ai-runs.json` is capped at 200 entries (newest first).

## Tests

```bash
yarn tsx scripts/test-booster.ts
yarn tsx scripts/test-ai-seo-patch.ts
```

Covers: safe patch accepted, slug change blocked, fake-claim blocked, admin/api link blocked, non-existing internal link blocked, cross-locale leak blocked, mojibake blocked, duplicate FAQ blocked, mock provider produces valid JSON.

## P1 follow-ups

- Gemini Free backend endpoint (`POST /api/seo/ai/gemini/analyze`) — only if `GEMINI_API_KEY` is set.
- SERP Intelligence layer (Serper API) — separate branch.
- Page/Blog editor banner that surfaces queued AI suggestions from the ledger and lets the operator apply them into the live JSON with one click (still going through the normal save → publish → IndexNow flow).
- Cannibalization-fix / freshness-refresh / add-related-to-money-page action templates.
