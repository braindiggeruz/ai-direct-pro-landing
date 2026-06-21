# AI Draft Inbox — n8n → GPTBot Integration

Connects the **GPTBot SEO Topic Hunter MVP** n8n workflow to the GPTBot
admin panel so generated RU/UZ article packages arrive in
`/admin-tools/ai-drafts` as **unpublished** drafts. A human reviewer
imports each side into the existing **Blog Editor** and publishes
manually via the existing **Publish to GitHub** flow.

> Nothing in this pipeline auto-publishes. The ingestion endpoint *forces*
> `status=pending_review`, `manual_approval_required=true`, and
> `ready_for_publish=false` regardless of what the upstream sends.

## Architecture

```
n8n SEO Autopilot
  └─ SEO Quality and Safety Validator - Code
       └─ Build GPTBot Draft Payload    (Code node)
       └─ Send Draft to GPTBot Admin   (HTTP Request node)
            POST https://gptbot.uz/api/admin/ai-drafts
            Authorization: Bearer N8N_INGEST_TOKEN
       └─ Check GPTBot Admin Response  (IF node, success=true)
       └─ Respond Success
```

```
GPTBot Cloudflare Pages
  └─ POST /api/admin/ai-drafts        (Bearer auth → D1 insert pending_review)
  └─ GET  /api/admin/ai-drafts        (JWT admin auth → list)
  └─ GET  /api/admin/ai-drafts/[id]   (JWT → detail + audit)
  └─ POST /api/admin/ai-drafts/[id]/status  (JWT → needs_revision|rejected|pending_review)
  └─ POST /api/admin/ai-drafts/[id]/import  (JWT → record per-locale import)
  └─ DELETE /api/admin/ai-drafts/[id] (JWT, only when not imported)

D1: gptbot-ai-drafts
  └─ table  ai_drafts        (one row per bundle)
  └─ table  ai_draft_audit   (append-only history)
```

## Cloudflare bindings

Configured on the `ai-direct-pro-landing` Pages project (production + preview).

| Binding | Type | Purpose |
| ------- | ---- | ------- |
| `GPTBOT_DRAFTS_DB` | D1 database | AI Draft Inbox storage |
| `LOGIN_ATTEMPTS` | KV namespace | Existing login lockout (unchanged) |

| Env var | Type | Purpose |
| ------- | ---- | ------- |
| `N8N_INGEST_TOKEN` | `secret_text` | Shared bearer secret between n8n and GPTBot |
| (all existing vars) | — | Unchanged |

The token is generated server-side, configured exclusively via the Pages
API + n8n Credentials, and never appears in the repository, logs, or
client bundle.

## Database schema

See [`/migrations/0001_ai_drafts.sql`](../migrations/0001_ai_drafts.sql).

Key fields:

* `id` — `draft_<32hex>` primary key.
* `bundle_id` — UNIQUE; idempotency key from n8n.
* `status` — `pending_review` | `needs_revision` | `imported` | `rejected`.
* `ru_article_json`, `uz_article_json` — full per-locale payload (nullable).
* `validation_passed`, `validation_issue_count` — pre-computed for fast filtering.
* `ru_imported_at`, `uz_imported_at` — per-locale import timestamps.
* `created_at`, `updated_at`, `imported_at`, `rejected_at` — lifecycle markers.

The companion table `ai_draft_audit` records every status change, import,
rejection, and deletion. Deletes write the audit row BEFORE the row is
removed (FK ON DELETE CASCADE, audit row is committed first).

## Ingestion contract (`POST /api/admin/ai-drafts`)

Request:

```http
POST /api/admin/ai-drafts HTTP/1.1
Host: gptbot.uz
Content-Type: application/json
Authorization: Bearer <N8N_INGEST_TOKEN>

{
  "schema_version": "gptbot.article-draft.v1",
  "source": "n8n-seo-autopilot",
  "bundle_id": "n8n-2026-06-21-<uuid>",
  "execution_id": "<n8n execution id>",
  "seo_brief": { ... },
  "validation": { "passed": true, "issues": [] },
  "articles": [
    {
      "locale": "ru",
      "slug": "ai-bot-dlya-restoranov-tashkent",
      "meta_title": "...",
      "meta_description": "...",
      "h1": "...",
      "excerpt": "...",
      "target_keyword": "AI-бот для ресторана",
      "target_money_page": "/ru/ai-bot-dlya-horeca/",
      "author": "GPTBot",
      "body_blocks": [{ "type": "p", "text": "..." }, ...],
      "faq": [{ "q": "...", "a": "..." }, ...],
      "internal_links": [
        { "target": "/ru/ai-bot-dlya-horeca/", "anchor": "AI-бот HoReCa",
          "locale": "ru", "type": "contextual" }
      ],
      "schemas": ["Article", "FAQPage", "BreadcrumbList"]
    },
    { "locale": "uz", ... }
  ]
}
```

Validation hard rules (all enforced server-side):

* `schema_version` must equal `gptbot.article-draft.v1`.
* `bundle_id` must match `/^[a-zA-Z0-9._:-]{4,128}$/`.
* `articles[].locale` ∈ {`ru`, `uz`}; duplicates rejected.
* `articles[].slug` must match `/^[a-z0-9-]{1,80}$/`.
* `articles[].target_money_page` must start with `/<locale>/`, no
  `?`, `#`, `/admin-tools`, `/api/`, `/draft/`, `/test/` prefixes.
* `body_blocks[].type` ∈ {`h2`,`h3`,`p`,`list`,`cta`,`image`,`quote`}.
* `faq[]` items require non-empty `q` + `a`; max 30.
* `internal_links[]` must have relative non-blocked target + non-empty anchor;
  max 30.
* Mojibake (replacement char, Ð/Â sequences) anywhere in title / description / h1
  / excerpt is rejected up front.
* Payload size ≤ 256 KB.

Response (HTTP 200):

```json
{
  "success": true,
  "draft_id": "draft_<hex>",
  "bundle_id": "<echoed bundle id>",
  "status": "pending_review",
  "admin_url": "/admin-tools/ai-drafts/draft_<hex>",
  "deduplicated": false
}
```

Idempotency: repeated POST with the same `bundle_id` returns
`deduplicated: true` and the existing `draft_id`. The endpoint never
mutates an existing record on a duplicate request — n8n retries are safe.

Error codes:

| Status | Meaning |
| ------ | ------- |
| 400 | Validation failed. `issues[]` lists field paths. |
| 401 | Missing or invalid bearer token. |
| 413 | Payload > 256 KB. |
| 415 | Content-Type is not `application/json`. |
| 503 | `N8N_INGEST_TOKEN` or `GPTBOT_DRAFTS_DB` not configured. |

## n8n delivery integration

Add these nodes **after** `SEO Quality and Safety Validator - Code`. Keep
the rest of the SEO Autopilot pipeline untouched.

### Node 1 — `Build GPTBot Draft Payload` (Code)

Type: **Code** (Run Once for All Items).

```javascript
// Build the gptbot.article-draft.v1 payload for /api/admin/ai-drafts.
// Reads the validator's package off the input item, normalises field
// names, and stamps a UUID-style bundle_id. We DO NOT trust upstream
// status fields — the GPTBot ingestion endpoint forces pending_review
// regardless, but we still send the safe values for traceability.

const SCHEMA_VERSION = 'gptbot.article-draft.v1';

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

function asStr(v, def = '') { return (typeof v === 'string' && v.trim()) ? v.trim() : def; }

function normalizeBody(blocks) {
  if (!Array.isArray(blocks)) return [];
  const allowed = new Set(['h2', 'h3', 'p', 'list', 'cta', 'image', 'quote']);
  return blocks
    .filter((b) => b && allowed.has(b.type))
    .map((b) => {
      const out = { type: b.type };
      if (typeof b.text === 'string') out.text = b.text;
      if (Array.isArray(b.items)) out.items = b.items.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
      if (typeof b.href === 'string') out.href = b.href;
      if (typeof b.src === 'string')  out.src  = b.src;
      if (typeof b.alt === 'string')  out.alt  = b.alt;
      return out;
    });
}

function normalizeFaq(faq) {
  if (!Array.isArray(faq)) return [];
  return faq
    .filter((f) => f && typeof f.q === 'string' && typeof f.a === 'string' && f.q.trim() && f.a.trim())
    .map((f) => ({ q: f.q.trim(), a: f.a.trim() }));
}

function normalizeLinks(links, locale) {
  if (!Array.isArray(links)) return [];
  return links
    .map((l) => {
      if (typeof l === 'string' && l.startsWith('/')) return { target: l, anchor: l, locale, type: 'contextual' };
      if (!isObj(l)) return null;
      const target = asStr(l.target);
      const anchor = asStr(l.anchor) || target;
      if (!target.startsWith('/')) return null;
      return { target, anchor, locale, type: asStr(l.type, 'contextual') };
    })
    .filter(Boolean);
}

function normalizeArticle(a) {
  if (!isObj(a)) return null;
  const locale = (a.locale === 'ru' || a.locale === 'uz') ? a.locale : null;
  if (!locale) return null;
  const slug = asStr(a.slug).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
  if (!slug) return null;
  return {
    locale,
    slug,
    meta_title:        asStr(a.meta_title || a.title),
    meta_description:  asStr(a.meta_description || a.description),
    h1:                asStr(a.h1),
    excerpt:           asStr(a.excerpt || a.intro),
    target_keyword:    asStr(a.target_keyword || a.primary_keyword),
    target_money_page: asStr(a.target_money_page || a.money_page),
    author:            asStr(a.author, 'GPTBot'),
    body_blocks:       normalizeBody(a.body_blocks || a.body),
    faq:               normalizeFaq(a.faq),
    internal_links:    normalizeLinks(a.internal_links || a.internalLinks, locale),
    schemas:           Array.isArray(a.schemas) ? a.schemas : ['Article', 'FAQPage', 'BreadcrumbList'],
    keywords:          Array.isArray(a.keywords) ? a.keywords.filter((k) => typeof k === 'string' && k.trim()) : [],
  };
}

function genId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const out = [];
for (const item of items) {
  const pkg = item.json || {};
  // The validator emits at least these fields. Fall back gracefully if missing.
  const ru = normalizeArticle(pkg.ru_article);
  const uz = normalizeArticle(pkg.uz_article);
  const articles = [ru, uz].filter(Boolean);
  if (articles.length === 0) {
    out.push({ json: { __skip: true, reason: 'no_normalisable_articles' } });
    continue;
  }
  const bundle_id = `n8n-${genId()}`;
  const execution_id = $execution?.id || pkg.execution_id || '';
  out.push({
    json: {
      schema_version: SCHEMA_VERSION,
      source: 'n8n-seo-autopilot',
      bundle_id,
      execution_id,
      status: 'pending_review',
      manual_approval_required: true,
      ready_for_publish: false,
      published: false,
      seo_brief: isObj(pkg.seo_brief) ? pkg.seo_brief : null,
      validation: isObj(pkg.validation) ? {
        passed: !!pkg.validation.passed,
        issues: Array.isArray(pkg.validation.issues) ? pkg.validation.issues.slice(0, 200) : [],
      } : { passed: true, issues: [] },
      articles,
    },
  });
}

return out;
```

### Node 2 — `Send Draft to GPTBot Admin` (HTTP Request)

* Method: `POST`
* URL: `https://gptbot.uz/api/admin/ai-drafts`
* Authentication: **None** at the HTTP node — we pass the bearer in
  the headers using an n8n **Header Auth Credential** named
  `GPTBot Ingest Bearer`. The credential stores the secret and the HTTP
  node references it; the secret never appears in the workflow JSON.
* Body Content Type: `JSON`
* Body: `JSON / Expression` → `={{ $json }}`
* Send Headers: enable
  * `Content-Type` → `application/json`
  * `Authorization` → `=Bearer {{$credentials["GPTBot Ingest Bearer"].token}}`
    (or use the Header Auth credential's `name=Authorization, value=Bearer <token>`)
* Options → Timeout: `15000`
* Continue on Fail: `false` (let the workflow surface the error)
* Response → Response Format: `JSON`

Header Auth credential setup (one-time, in n8n UI):

1. **Credentials → New → Header Auth**.
2. Name: `GPTBot Ingest Bearer`.
3. Header Name: `Authorization`.
4. Header Value: `Bearer <paste-token-here>`.
5. Save. Reference from the HTTP Request node via "Authentication → Header Auth".

### Node 3 — `Check GPTBot Admin Response` (IF)

Condition (boolean): `={{ $json.success === true && !!$json.draft_id && $json.status === "pending_review" && !!$json.admin_url }}`.

Pipe **true** → `Respond Success`. Pipe **false** → an error branch
that logs the response body verbatim (no secret leakage since the
endpoint never echoes the bearer token).

### Node 4 — `Respond Success` (existing)

Augment the final response so downstream systems can observe the
ingestion result:

```json
{
  "validation_status": "{{ $node['SEO Quality and Safety Validator - Code'].json.status }}",
  "gptbot_ingestion": "success",
  "draft_id": "{{ $node['Send Draft to GPTBot Admin'].json.draft_id }}",
  "bundle_id": "{{ $node['Send Draft to GPTBot Admin'].json.bundle_id }}",
  "admin_url": "{{ $node['Send Draft to GPTBot Admin'].json.admin_url }}",
  "manual_approval_required": true,
  "ready_for_publish": false
}
```

## Smoke test

```bash
TOKEN="$(read -s -p 'paste N8N_INGEST_TOKEN: ' t; echo $t)"
curl -i -X POST https://gptbot.uz/api/admin/ai-drafts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --data @docs/AI_DRAFT_INBOX/smoke-payload.json
```

Expected HTTP 200 with:

```json
{"success":true,"draft_id":"draft_…","bundle_id":"…","status":"pending_review","admin_url":"/admin-tools/ai-drafts/draft_…","deduplicated":false}
```

A second POST with the **same** `bundle_id` returns
`"deduplicated":true` and the existing `draft_id`. No second row is
created.

## Reviewer flow (manual)

1. Open <https://gptbot.uz/admin-tools/ai-drafts>.
2. Pick the bundle (filter `status=pending_review`).
3. Inspect RU and UZ tabs side by side.
4. Click **Import RU to Blog Editor** → Blog Editor opens at
   `/admin-tools/blog/new` pre-filled with the RU article as a draft.
5. Adjust the slug if a duplicate-slug warning shows.
6. Click **Save draft** to commit the draft JSON file. **No publish yet.**
7. Repeat for UZ.
8. When both sides are ready, open each saved draft and click
   **Publish** (or use the global **Publish to GitHub** button as
   you already do).

## Rollback

If anything misbehaves:

1. Revert this branch (`git revert <commit>`), push, redeploy.
2. The D1 database `gptbot-ai-drafts` can stay; it does not affect any
   other code path. Drop it manually if desired:
   `wrangler d1 delete gptbot-ai-drafts`.
3. Remove the `N8N_INGEST_TOKEN` env var and `GPTBOT_DRAFTS_DB` binding
   from the Cloudflare Pages project to disable the endpoint.

## Hard safety guarantees

* Ingest never writes to `/content/blog/**` and never commits to GitHub.
* Ingest never calls IndexNow.
* Ingest never triggers a Cloudflare Pages deployment.
* Status flag overrides from n8n are ignored — every row lands as
  `pending_review` and `manual_approval_required=true`.
* The bearer token is verified with a constant-time compare and never
  logged. The endpoint refuses any non-JSON payload, any payload >256 KB,
  and any request without the bearer.
* The existing `_routes.json` (which scopes Functions to `/api/*` and
  `/admin-tools/*`) ensures the ingestion endpoint cannot accidentally
  proxy through other paths.
