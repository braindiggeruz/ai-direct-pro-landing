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
