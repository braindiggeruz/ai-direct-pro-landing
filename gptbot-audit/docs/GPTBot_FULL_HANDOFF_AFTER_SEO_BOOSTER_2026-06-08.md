# GPTBot — Full Handoff after SEO Booster Engine Deploy (2026-06-08)

> **Read this whole document before touching anything.**
> It contains the entire context the next agent needs to continue this project without re-discovering it. No real secrets are included. If you have not yet rotated the leaked credentials referenced in §19, do that **first** before any other action.

---

## 1. Executive Summary

**GPTBot / gptbot.uz** is a white-hat SEO-focused, conversion-driven marketing site selling AI/GPT-powered Telegram + Instagram-Direct bots to small/medium businesses in Tashkent / Uzbekistan. Languages: Russian and Uzbek Latin. The stack is **Cloudflare Pages + Pages Functions (TypeScript) + a single-tenant admin SPA** at `/admin-tools/`.

In the previous session we shipped the **SEO Booster Engine MVP** — a read-only Indexation Forge cockpit inside the admin with safe IndexNow submission, internal-link booster, cluster authority view, and cannibalization radar. PR #2 was squash-merged to `main` (commit `e64a4381…`), built locally, and deployed via `wrangler pages deploy dist` (Direct-Uploads project — no GitHub auto-deploy). All live smoke checks pass.

The site now has a working, white-hat indexation acceleration loop:

```
   Edit content/*.json  →  Booster re-scores  →  Operator selects top-priority pushable URLs
        →  Submit safely to IndexNow  →  Bing/Yandex/Seznam/Naver/Yep crawl
        →  (P2) GSC OAuth2 closes the feedback loop with coverageState
```

What is **NOT** built yet (P2):
- Google Search Console OAuth2 + URL Inspection + Search Analytics integration (designed only, prompt in `docs/seo-booster-engine.md` §12).
- Recrawl Pulse Queue (per-URL submission history + cooldown).
- Anchor diversity guard inside `/api/seo/suggest-links`.
- SERP Snippet Lab.

The biggest **near-term SEO win** is mechanical and already discovered by the Booster: fix the 29 orphan blog articles by linking each one back to its target money page and adding a "Related articles" block on every money page. Do this **before** spending time on P2.

---

## 2. Current Production State

| Property | Value |
| --- | --- |
| Production domain | `https://gptbot.uz` |
| WWW alias | `https://www.gptbot.uz` |
| Admin SPA | `https://gptbot.uz/admin-tools/` |
| SEO Booster | `https://gptbot.uz/admin-tools/seo-booster` |
| Latest production deploy | `dad7f77b-dfb6-4a98-99d4-10311c024b22` (short `dad7f77b`) |
| Deploy timestamp | 2026-06-08 |
| `main` HEAD | `e64a43816ee73e11594fdb5dc387dfbc7d92b8de` |
| Feature branch (preserved) | `feat/seo-booster-engine` |
| PR | https://github.com/braindiggeruz/ai-direct-pro-landing/pull/2 (squash-merged) |
| Cloudflare Pages project | `ai-direct-pro-landing` (Direct-Uploads source) |
| Cloudflare account | `14ce9e04…d5cd5` (masked) |
| Production branch (CF Pages) | `main` |
| `INDEXNOW_KEY` env (production) | **set** — public key file live at `/<key>.txt` returns HTTP 200 |

---

## 3. Infrastructure

```
                ┌────────────────────────────────────────────────┐
                │  Cloudflare DNS  (DO NOT TOUCH — out of scope) │
                └────────────────────────────────────────────────┘
                                       │
                                       ▼
              ┌──────────────────────────────────────────────────┐
              │  Cloudflare Pages — project ai-direct-pro-landing │
              │  Deploy mode: Direct Uploads (no Git auto-deploy) │
              │  Aliases: gptbot.uz, www.gptbot.uz                │
              └──────────────────────────────────────────────────┘
                  │ static dist/                ▲ Functions (TS)
                  ▼                              │
       prerendered HTML / sitemap.xml /          │
       robots.txt / _redirects / key.txt         │
                                                 │
                                  /functions/api/*  (Workers runtime)
                                  /functions/admin-tools/[[path]]
                                                 │
                                                 ▼
                                  GitHub Contents API
                                  repo: braindiggeruz/ai-direct-pro-landing
                                  branch: main
                                  reads/writes /content/{pages,blog,seo,global}/*.json
```

**Key facts:**
- The CF Pages project is **Direct Uploads** — `git push origin main` does **not** trigger any rebuild. Production releases must be done with `wrangler pages deploy dist --project-name=ai-direct-pro-landing --branch=main` (see `docs/CLOUDFLARE_DEPLOY_RUNBOOK.md`). Reconnecting to Git can only be done by the owner via the Cloudflare dashboard (the API refuses for Direct-Uploads projects).
- The site has **no traditional backend**. All "server" logic is Cloudflare Pages Functions in `/functions/api/**`. State lives in the GitHub repo (`/content/*.json`) and is read/written via the GitHub Contents API + GraphQL bulk-fetch.
- `/admin-tools/[[path]].ts` is a Pages Function that serves `dist/index.html` with `X-Robots-Tag: noindex, nofollow` for every `/admin-tools/...` request, including SPA sub-routes. **Do not remove this Function** — without it, deep admin URLs fall through to the static 404 and break the SPA.

---

## 4. Repository / Branch / Deploy

- Repo: https://github.com/braindiggeruz/ai-direct-pro-landing
- Default / production branch: `main`
- Feature branches use the pattern `feat/<topic>`, `seo/<topic>`, `content/<topic>`, `fix/<topic>`.
- Backup branches `backup/pre-*-2026-06-03` exist on the remote — leave them, they are point-in-time anchors.
- Build pipeline (local, ahead of every deploy):
  ```
  yarn install
  yarn build                # runs seo-audit + tsc + vite + prerender + sitemap + robots + redirects
  yarn lint                 # baseline 41 errors expected
  yarn tsx scripts/test-booster.ts   # offline booster smoke
  ```
- Deploy:
  ```
  ./node_modules/.bin/wrangler pages deploy dist \
    --project-name=ai-direct-pro-landing \
    --branch=main \
    --commit-dirty=true \
    --commit-hash=$(git rev-parse HEAD) \
    --commit-message="$(git log -1 --pretty=%s)"
  ```
  Requires env vars `CLOUDFLARE_API_TOKEN` (Pages:Edit on the account) and `CLOUDFLARE_ACCOUNT_ID`. Wrangler v3.x works on Node 20+; wrangler v4 needs Node 22+.

---

## 5. Admin Panel

- Mounted at `/admin-tools/*`. Single-user JWT auth (`functions/api/auth/*`, `functions/lib/jwt.ts`).
- Hidden tracking: the catch-all Function strips Google Tag Manager / GA / Meta Pixel / Ahrefs from the admin HTML response, so the admin shell is never tracked.
- Routes (React Router, see `src/admin/AdminApp.tsx`):
  - `/admin-tools/`              → Cockpit (existing)
  - `/admin-tools/pages`         → PagesList / PageEditor
  - `/admin-tools/blog`          → BlogList / BlogEditor
  - `/admin-tools/internal-links` → InternalLinks (existing)
  - **`/admin-tools/seo-booster` → SEO Booster Engine (NEW, this session)**
  - `/admin-tools/redirects`     → Redirects
  - `/admin-tools/settings`      → Global SEO
- The admin "Publish to GitHub" button calls `POST /api/content/publish-to-github` to commit the local in-memory editor state. The Booster does **not** write anything — it is read-only with two safe operator-driven actions (IndexNow submit + Copy GSC manual queue).

---

## 6. SEO Booster Engine: What Was Built

**Branch:** `feat/seo-booster-engine` → squash-merged to `main` as PR #2.
**Files changed in this session (9):**

```
docs/seo-booster-engine.md         +238   engineering map, 12 sections, verified sources
src/shared/booster.ts              +520   pure scoring + filterSafeForIndexNow validator
src/admin/pages/SeoBooster.tsx     +405   /admin-tools/seo-booster 4-tab UI
functions/api/seo/booster.ts       +31    GET /api/seo/booster
functions/api/seo/indexnow.ts      +119   POST /api/seo/indexnow
scripts/test-booster.ts            +54    offline smoke test (yarn tsx scripts/test-booster.ts)
src/admin/lib/api.ts               +6     api.booster, api.indexnowSubmit
src/admin/AdminApp.tsx             +2     route
src/admin/components/Sidebar.tsx   +3/−1  nav item
```

**UI structure — `/admin-tools/seo-booster` has 4 tabs:**

1. **Indexation Forge** — filterable URL table with Indexation Priority, Quality, Money Power, Freshness, Incoming-links columns. Bulk-select → `Submit selected → IndexNow` or `Copy as GSC manual queue`. Quick selectors: Top 10 / Top 25 by priority.
2. **Internal Link Booster** — list of orphan pages + money pages with `<2` incoming. Each row deep-links into the page editor.
3. **Clusters** — per-cluster authority bar, completeness, gaps, RU↔UZ pair status.
4. **Cannibalization Radar** — pairwise risk table with suggested action (`merge` / `canonicalize` / `differentiate` / `noindex-weaker`).

All four tabs are **read-only views** of the in-memory `BoosterReport`. The only state-changing action is the IndexNow submit, which is triple-validated server-side.

---

## 7. API Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/seo/booster` | admin JWT | Returns full `BoosterReport` (items + clusters + cannibalization + summary). Read-only. One GitHub GraphQL subrequest. |
| POST | `/api/seo/indexnow` | admin JWT | Body `{ urls: string[] }`. Server re-fetches `content/*` to validate every URL is still pushable, then submits to `api.indexnow.org`. Returns `{ ok, submitted, safeUrls, rejected, upstreamStatus, upstreamBody, submittedAt }`. |
| GET | `/api/seo/suggest-links` | admin JWT | (existing) Per-page link suggestions used inside Page Editor. |
| GET | `/api/audit` | admin JWT | (existing) Feeds Cockpit. |
| GET/POST/DELETE | `/api/content` | admin JWT | (existing) Bulk content CRUD with mojibake publish guard. |
| POST | `/api/content/publish-to-github` | admin JWT | (existing) Commit in-memory state. |
| POST | `/api/auth/login`, GET `/api/auth/me`, GET `/api/auth/config` | mixed | (existing) JWT login + Turnstile + lockout. |
| GET | `/api/ai/fill` | admin JWT | (existing) OpenRouter AI-fill for SEO drafts. |

Deferred to P2 (designed in `docs/seo-booster-engine.md` §6 / §12):
- `GET /api/seo/gsc/auth/start` + `/callback`
- `GET /api/seo/gsc/inspect?url=…`
- `GET /api/seo/gsc/analytics`
- `POST /api/seo/gsc/sitemaps/submit`

---

## 8. Scoring Logic

All scoring lives in `src/shared/booster.ts` and runs identically in Workers and the browser (pure TS, no Node APIs). See the file's inline comments for the full math; the table below is the contract.

| Score | Range | Inputs | Behavior |
| --- | --- | --- | --- |
| **Indexation Priority** | 0..100 | pageType base + incoming-link boost + hreflang reciprocity + recency + missing-metadata penalty + orphan penalty | **Hard 0 if not pushable.** Used to rank "what to feed into IndexNow / GSC manual queue now". |
| **Money Page Power** | 0..100, `null` for non-money | incoming, FAQ count, schema, hreflang reciprocity, outgoing, description length | One number to spot weak money pages. |
| **Cluster Authority** | 0..100 | `0.5×completeness% + 0.3×min(avgIncoming/3,1)×100 + 0.2×hreflangPair%` | Spots clusters where the head is starved of supporting articles. |
| **Freshness** | 0..100 | days since `updatedAt`/`dateModified`/etc. Step function. Blog ages faster than money. | Surfaces stale content that needs **real** content refresh. Never used to fake `lastmod`. |
| **Cannibalization Risk** | 0..100 | title-Jaccard + H1-Jaccard + same primary keyword (+30) + similar keyword (+15) + blog/money type clash (+5) | Threshold ≥35 reported; ≥60 flagged "high". Reasons string explains every contribution. |
| **Quality** (compressed audit) | 0..100 | derived from existing audit rules (title/desc/h1/canonical/schema/FAQ/incoming/orphan/mojibake) | Sortable per-URL quality column in the Booster table. |

**Pushability** is a stricter filter than indexability. A URL is `pushable` only if **all** are true: status=published, robotsIndex=true, no mojibake, has title+description+canonical, URL is relative + on gptbot.uz, not under `/admin-tools` or `/api/`, no query/fragment.

---

## 9. IndexNow Flow

Spec: https://www.indexnow.org/documentation
Endpoint used: `https://api.indexnow.org/IndexNow`
Key file: `/<INDEXNOW_KEY>.txt` (32-character alphanumeric, served as text/plain). **Not committed to docs.** Cloudflare Pages serves it from `/public/<key>.txt`.

**Submission pipeline (operator-driven only — no auto-submit on publish):**

```
[Operator opens /admin-tools/seo-booster]
        │
        ▼  selects ≤1000 URLs (UI caps at 1000 to keep retries cheap)
        ▼
   confirm prompt ("Submit N URLs to IndexNow?")
        │
        ▼   POST /api/seo/indexnow  { urls: [...] }
        ▼
   server: requireAuth(JWT)            ── reject 401 if missing/expired
        ▼
   server: INDEXNOW_KEY present?       ── reject 400 if not configured
        ▼
   server: HEAD /<KEY>.txt             ── reject 400 if not HTTP 200
        ▼
   server: refetch /content/* (one GH GraphQL)
        ▼
   server: filterSafeForIndexNow(urls, currentItems)
        │   rejects: non-gptbot.uz host, /admin-tools/*, /api/*,
        │            draft, robotsIndex=false, mojibake, missing canonical,
        │            duplicate, fragment/query, not in content store
        ▼
   server: POST api.indexnow.org with { host, key, keyLocation, urlList }
        ▼
   response { ok, submitted, safeUrls, rejected[], upstreamStatus, upstreamBody, submittedAt }
        ▼
   UI: shows toast + list of rejected URLs with reasons
```

Bing's spec accepts 200 / 202 as success. Anything else is treated as an upstream failure (502 to the SPA).

---

## 10. GSC Status

**Status:** designed, not shipped. No OAuth tokens stored, no GSC endpoints implemented. Only the contract in `docs/seo-booster-engine.md` §6 + the final agent prompt in §12 exist today.

**Recommended path for the next agent:** OAuth2 user flow.

- Admin signs in with the Google account that already owns the `gptbot.uz` GSC property (no DNS work needed because verification was done previously).
- Store refresh token as a Cloudflare Pages **encrypted env var** (`GSC_REFRESH_TOKEN`). Also `GSC_CLIENT_ID` and `GSC_CLIENT_SECRET` from a Google Cloud OAuth client (Web application type).
- Never log, never echo, never expose to the SPA.
- Use `urlInspection.index.inspect` to surface `coverageState` (Indexed / Discovered – currently not indexed / Crawled – currently not indexed / Excluded) into each `BoosterItem`.
- Quotas: URL Inspection 2,000/day + 600/min; Search Analytics 25,000 rows/request.
- **DO NOT** use the Google Indexing API for blog/money — it is allowed only for `JobPosting` / `BroadcastEvent`.

Service-Account path is documented in §6 of `seo-booster-engine.md` but is **not recommended** for MVP because OAuth2 covers the same surface with zero DNS work.

---

## 11. Live Smoke Results (2026-06-08 after deploy `dad7f77b`)

| URL / endpoint | Expected | Got |
| --- | --- | --- |
| `https://gptbot.uz/` | 200 | **200** ✅ |
| `https://gptbot.uz/admin-tools/` | 200 + `X-Robots-Tag: noindex, nofollow` + `cache-control: no-store` | ✅ all three |
| `https://gptbot.uz/admin-tools/seo-booster` | 200 + noindex | ✅ |
| `https://gptbot.uz/sitemap.xml` | 200 + `application/xml` + 62 URLs + 0 admin/api/random | ✅ all |
| `https://gptbot.uz/robots.txt` | 200 + at least one `Sitemap:` line | ✅ |
| `https://gptbot.uz/random-test-url-<ts>/` | 404 | ✅ |
| `GET /api/seo/booster` (unauth) | 401 `{"error":"Missing token"}` | ✅ |
| `POST /api/seo/indexnow` (unauth) | 401 `{"error":"Missing token"}` | ✅ |
| `GET /api/audit` (unauth, regression) | 401 | ✅ |
| `https://gptbot.uz/<INDEXNOW_KEY>.txt` | 200 text/plain | ✅ |
| Cloudflare env binding `INDEXNOW_KEY` (production) | set | ✅ (PATCH 200, no errors) |

Build & lint baseline:
- `yarn tsc -b` — green
- `yarn build` — green; 30 pages + 29 articles prerendered; sitemap 62 entries
- `yarn lint` — 41 errors (baseline was 42 before this branch; **net −1**, no new violations introduced)
- `yarn tsx scripts/test-booster.ts` — green; report generated for 59 URLs

---

## 12. Current SEO Findings (live, from this deploy)

From `yarn tsx scripts/test-booster.ts` on the real `/content/*.json`:

- **59 URLs** analysed (30 pages + 29 blog).
- **59 pushable** — 0 URLs blocked by the safety filter (no drafts/noindex/mojibake in published set).
- **avg Indexation Priority = 44** (decent; will rise as orphans are fixed).
- **Cluster Authority avg = 100** — but that number is misleading because legacy blog articles lack the `topicCluster` field, so the supporting-article count is currently 0 across all clusters. Backfill `topicCluster` to make this metric meaningful (P1 below).
- **29 orphan blog articles** — published blog posts with 0 incoming internal links. **This is the single biggest near-term SEO win.**
- **2 money pages with `<2` incoming internal links** — visible in Internal Link Booster tab.
- **0 high-risk cannibalization pairs (risk ≥60).**
- **5 medium-risk cannibalization pairs (risk 35..55)** — see §13.

---

## 13. Cannibalization Details

| # | Pair | Locale | Risk | Suggested action |
| --- | --- | --- | --- | --- |
| 1 | `/ru/ai-bot-dlya-biznesa/` ⇄ `/ru/telegram-bot-dlya-biznesa/` | ru | 55 | **differentiate** — keep `/ru/ai-bot-dlya-biznesa/` as the general "AI/GPT bot for any business" entry; rewrite `/ru/telegram-bot-dlya-biznesa/` to be strictly channel-specific (Telegram lead handling, bot UX, Telegram CRM, prices in Telegram context). Update H1, title, primaryKeyword, FAQ. |
| 2 | `/ru/ai-prodavec/` ⇄ `/ru/blog/ai-prodavec-i-otdel-prodazh/` | ru | 35 | **canonicalize** blog → money. Add `canonical: https://gptbot.uz/ru/ai-prodavec/` to the blog frontmatter, or merge the blog content into the money page as a section, or noindex the blog if duplicate. |
| 3 | `/ru/avtomatizatsiya-zayavok/` ⇄ `/ru/blog/avtomatizatsiya-zayavok-instruktsiya/` | ru | 35 | **canonicalize** blog → money. |
| 4 | `/ru/instagram-direct-bot/` ⇄ `/ru/blog/instagram-direct-bot-kak-rabotaet/` | ru | 35 | **canonicalize** blog → money. |
| 5 | `/ru/telegram-bot-dlya-biznesa/` ⇄ `/ru/blog/telegram-bot-dlya-biznesa/` | ru | 35 | **canonicalize** blog → money. |

For pairs 2–5, the cleanest fix is to keep the blog post as a genuine *supporting* article (different intent: "how it works", "how we set it up", "case study") rather than a competitor for the money keyword. Change H1 + title + primaryKeyword of the blog post so it no longer competes, then add 2–3 internal links from the blog to the money page.

---

## 14. Orphan Pages / Internal Link Strategy

29 published blog articles currently have **zero** incoming internal links. Every single one will benefit from at least one inbound link.

**Recommended fix flow:**

1. Open `/admin-tools/seo-booster` → tab **Internal Link Booster**.
2. For each orphan blog article:
   - Find its **target money page** (use `topicCluster` field after you backfill it, or fall back to keyword matching).
   - In the **money page** editor, add a `Related articles` block that points to this blog article (anchor = the article's H1 or a curated phrase from `src/shared/site-config.ts → ANCHORS`).
   - In the **blog article** editor, ensure there are ≥2 `internalLinks` pointing to the target money page + 1 sibling blog article.
3. After each batch of 5–10 edits, run `Publish to GitHub` from the admin sidebar, then deploy via wrangler.
4. After deploy, return to SEO Booster, select the top 25 URLs by Indexation Priority, and submit them to IndexNow.

**Anchor hygiene rules:**

- Do **not** reuse the exact same anchor more than 2–3 times across the site (anchor diversity guard is on the P1 backlog).
- Use curated anchors from `src/shared/site-config.ts → ANCHORS.ru` / `ANCHORS.uz`.
- Avoid generic anchors like "тут", "click here", "узнать больше" as the **only** anchor.

---

## 15. Content / Blog / Money Pages Strategy

- 30 money/niche pages exist across RU + UZ; the canonical RU list is in `src/shared/site-config.ts → MONEY_PAGES.ru` and the UZ list in `MONEY_PAGES.uz`. The `HREFLANG_PAIRS` array tracks the RU↔UZ pairing.
- Blog: 29 articles total (21 RU + 8 UZ). RU has more breadth; UZ has 8 translated/localized articles that are heavily under-linked.
- Recommended cluster head per market priority:
  1. `ai-bot-business` (AI/GPT bot for business — the top-of-funnel)
  2. `telegram-bot` (highest-search Telegram bot intent)
  3. `instagram-direct` (Instagram-Direct + AI manager)
  4. `lead-processing` (заявки, прод. воронка)
  5. niche pages (clinic, beauty, edu, shop, HoReCa)
- Every new money page **must** have: title 45–65 chars, description 120–160 chars, ≥4 FAQ items, ≥3 outgoing internal links, schema (`Service`/`FAQPage`/`BreadcrumbList`), valid `hreflang` pair, RU↔UZ counterpart.
- Every new blog article **must** have: ≥3 FAQ items, ≥2 internal links pointing back to its cluster's money page, a `topicCluster` value matching one of the cluster ids in `src/shared/booster.ts → CLUSTERS`.
- The mojibake publish guard inside `POST /api/content` will reject any save with `status=published` if it detects double-encoded UTF-8 characters (`Ã`, `Ñ`, `Â`, `Ð`, `Ò`, U+FFFD). Do not bypass it.

---

## 16. Google Ads Context

- Existing artefacts: `docs/GOOGLE_ADS_NEGATIVE_KEYWORDS_NOTES.md` (read-only record of the curated negative-keyword list for the Tashkent Search campaign).
- No change in this session. Treat as out of scope for the SEO Booster work — but **do not regenerate** negatives without owner approval.

---

## 17. Telegram Ads / Bot Context

- Existing artefacts: `docs/telegram-ads-copy.md`. `functions/api/telegram/*` exists for the demo bot.
- Not touched in this session.

---

## 18. Analytics / GTM / GA / Ahrefs Context

- Public pages carry GTM + GA + Meta Pixel + Ahrefs (all tagged with `data-tag="..."` for surgical removal).
- The admin SPA strips all of them on the fly via `functions/admin-tools/[[path]].ts`'s `HTMLRewriter` — so `/admin-tools/*` is **never** tracked.
- Existing docs: `docs/AHREFS_GTM_INSTALL.md`, `docs/AHREFS_VERIFICATION_NOTES.md`.
- Not changed in this session.

---

## 19. Security / Secrets / Rotation Required

### 19.1 Compromised secrets — Rotation REQUIRED

In the chat transcript that produced this session, two categories of credentials were pasted in plain text:

| Credential type | Where it lives in transcript | Required action |
| --- | --- | --- |
| **GitHub PAT** | (masked example: `ghp_***wE`) | **Revoke immediately** at https://github.com/settings/tokens, then issue a new fine-scoped PAT (only `repo` + `contents:read/write` on `braindiggeruz/ai-direct-pro-landing`). |
| **Cloudflare API Tokens** (two of them) | (masked examples: `cfut_***07dd`, `cfut_***e5bf7`) | **Roll both** at https://dash.cloudflare.com/profile/api-tokens. Re-issue one token with scopes `Account.Cloudflare Pages:Edit` and `Account Settings:Read` for the relevant account only. |
| **Cloudflare Account ID** | (masked example: `14ce9e04…d5cd5`) | Account IDs are not strictly secret, but do not paste them in public artefacts. |

These three values **must be rotated before another agent is given access**, otherwise an attacker who has the transcript can push to the repo or redeploy the production site. None of them were committed to the repo (`grep -rn 'ghp_' / 'cfut_'` against tracked files confirms only the existing detector regex and historical mentions in `docs/SECURITY_SETUP.md`).

### 19.2 Environment variables (Cloudflare Pages → Settings → Environment)

The next agent should review the production env and confirm the following bindings exist. **Never** echo their values, never copy them into any document.

| Variable | Storage | Purpose | Status |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | CF Pages env (encrypted) | Repo read+write for the Functions GitHub Contents API client | set (pre-existing) — **rotate after PAT compromise above** |
| `GITHUB_OWNER` | CF Pages env | `braindiggeruz` | set |
| `GITHUB_REPO` | CF Pages env | `ai-direct-pro-landing` | set |
| `GITHUB_BRANCH` | CF Pages env | `main` | set |
| `JWT_SECRET` | CF Pages env (encrypted) | HS256 admin JWT signing key, ≥32 chars | set (pre-existing) — consider rotation as part of post-incident hygiene |
| `ADMIN_EMAIL` | CF Pages env | single-user admin email | set |
| `ADMIN_PASSWORD_HASH` | CF Pages env (encrypted) | PBKDF2-SHA256 PHC hash | set |
| `ADMIN_PASSWORD` | CF Pages env | **must remain unset in production** (dev-only fallback) | should be missing |
| `TURNSTILE_SECRET_KEY` / `TURNSTILE_SITE_KEY` | CF Pages env | Optional Cloudflare Turnstile for the admin login | optional |
| `OPENROUTER_API_KEY` | CF Pages env (encrypted) | OpenRouter LLM for AI-fill | optional |
| **`INDEXNOW_KEY`** | **CF Pages env (production), plain_text** | **Must match the public file at `/<key>.txt`. Set in this session.** | **set** |
| `LOGIN_ATTEMPTS` | KV namespace binding | Durable lockout counter for the admin login | optional, recommended |

`INDEXNOW_KEY` content note: **do not** paste the key value in any document. It is a 32-character lowercase alphanumeric string that also exists as a public file at `https://gptbot.uz/<key>.txt`. The Function `/api/seo/indexnow` HEAD-probes that file before each submission to ensure it returns 200.

### 19.3 Repo-side secret hygiene

- Never commit any `.env` file. The project uses `.env` only locally and it is gitignored.
- `scripts/tech-audit.ts` contains a regex (`/(github_pat_…|ghp_…|sk-or-v1-…|CLOUDFLARE_API_TOKEN|ADMIN_PASSWORD_HASH|JWT_SECRET\s*=)/`) that will catch most accidental secret commits during CI.
- `docs/SECURITY_SETUP.md` references **already-revoked** historical tokens by their first few characters as a paper trail. Leave it untouched.

---

## 20. Absolute Do-Not-Break Rules

These rules are non-negotiable. Breaking any of them creates an immediate SEO regression or a security incident.

1. **Do not** touch DNS at the registrar or in Cloudflare.
2. **Do not** create a new Cloudflare Pages project. Use only `ai-direct-pro-landing`.
3. **Do not** restore a global `/* /index.html 200` fallback. Random URLs **must** return 404.
4. **Do not** alter `functions/admin-tools/[[path]].ts` in a way that drops the `X-Robots-Tag: noindex, nofollow` header on admin responses.
5. **Do not** add `/api/*` URLs to the sitemap. Do not remove the `<loc>` filter logic from `scripts/generate-sitemap.ts`.
6. **Do not** print, log, commit, or expose any secret. Use Cloudflare Pages env bindings.
7. **Do not** change slugs without adding a 301 in `content/seo/redirects.json`.
8. **Do not** delete a published URL without adding a 301.
9. **Do not** fake `lastmod`, schema, reviews, ratings. **Do not** add hidden text, doorway pages, cloaking, or mass-generated thin content.
10. **Do not** call the **Google Indexing API** for regular blog/money pages. It is only valid for `JobPosting` / `BroadcastEvent` per Google's official spec.
11. **Do not** auto-submit to IndexNow on every publish. The submitter is **operator-driven** by design.
12. **Do not** weaken the safety filter in `filterSafeForIndexNow`. If you change it, only make it **stricter**.
13. **Do not** push code that fails `yarn tsc -b`, fails `yarn build`, or adds new `yarn lint` errors above the current baseline.
14. **Do not** bypass the mojibake publish guard in `POST /api/content`.

---

## 21. Step-by-Step Next Agent Plan

### Sprint 1 — Internal linking + cannibalization fixes (the P0 win, no new code)

1. Visit `https://gptbot.uz/admin-tools/seo-booster`, log in.
2. Open the **Internal Link Booster** tab. Capture screenshots of the orphan list (29 articles) and the money-low-incoming list.
3. For each orphan article, in the **page editor**:
   - Add at minimum: 1 link to its cluster's money page, 1 link to a sibling blog article, 1 link to the homepage or a niche page.
   - Use anchors from `src/shared/site-config.ts → ANCHORS`. No anchor should repeat more than twice.
4. For each of the 5 cannibalization pairs from §13:
   - Pair 1 (`ai-bot-dlya-biznesa` ⇄ `telegram-bot-dlya-biznesa`): rewrite H1 + title + description + primaryKeyword + at least 3 H2s of `telegram-bot-dlya-biznesa` to be strictly Telegram-channel-specific.
   - Pairs 2–5: in each blog editor, either add a self-referencing canonical to the corresponding money page, or rewrite intent (e.g. "how it works" / "case study" / "setup walkthrough") so the blog no longer competes for the money keyword.
5. `Publish to GitHub` from the admin sidebar.
6. Locally run `yarn build && wrangler pages deploy dist …` (or wait for the owner to do it).
7. Re-open the Booster, sort by Indexation Priority, click **Top 25 by priority**, then **Submit selected → IndexNow**. Verify `upstreamStatus = 200` or `202`.
8. Capture the response and save it under `docs/INDEXNOW_ARTICLES_SUBMISSION_REPORT.md` (the project already has prior reports in that file pattern).

### Sprint 2 — Cluster integrity (P1, small code change)

1. Add a `topicCluster` field to every legacy blog article in `content/blog/**/*.json`. Use the cluster ids from `src/shared/booster.ts → CLUSTERS` (e.g. `ai-bot-business`, `telegram-bot`, `instagram-direct`, `lead-processing`, `sales-automation`, `niche-clinic`, `niche-beauty`, `niche-edu`, `niche-shop`, `niche-horeca`).
2. Optionally script this via a one-off `scripts/backfill-topic-cluster.ts` that does keyword matching + writes back. **Do not** auto-publish — set the cluster only on already-published articles.
3. Verify with `yarn tsx scripts/test-booster.ts` that "Supporting articles" in Clusters tab is no longer 0.

### Sprint 3 — Recrawl Pulse Queue (P1, new file)

1. Persist IndexNow submissions to `content/seo/indexnow-log.json` with shape `{ url, submittedAt, status, batchId }[]`. Append-only.
2. Add `/api/seo/indexnow-log` (GET) that returns the last 90 days.
3. Add a 5th tab in `src/admin/pages/SeoBooster.tsx` — **Recrawl Pulse** — with a weekly bar chart + cooldown indicator (do not allow submitting a URL twice within 24h unless `force=true`).

### Sprint 4 — Anchor Diversity Guard (P1)

1. Extend `functions/api/seo/suggest-links.ts`: refuse to suggest an anchor that already appears ≥3 times across the site.
2. Add a small UI badge in the per-page editor showing each anchor's site-wide usage count.

### Sprint 5 — GSC OAuth2 + URL Inspection (P2, see `docs/seo-booster-engine.md` §12 for the agent prompt)

1. Implement `functions/api/seo/gsc/oauth/start.ts`, `callback.ts`.
2. Implement `functions/api/seo/gsc/inspect.ts` (per-URL coverage state).
3. Implement `functions/api/seo/gsc/analytics.ts` (impressions/clicks/CTR/position).
4. Surface coverage state per `BoosterItem` in the dashboard.
5. Stay within quotas (URL Inspection 2,000/day, Search Analytics 25,000 rows/request).

### Sprint 6 — SERP Snippet Lab (P2)

1. Add an admin tool to preview title/description as Google would render them, with character-width estimation.
2. Optional A/B variant store (2 candidates per URL) — pick one before publishing.

---

## 22. Commands for Verification

```bash
# 0. Clone fresh
git clone https://github.com/braindiggeruz/ai-direct-pro-landing.git
cd ai-direct-pro-landing

# 1. Install
yarn install

# 2. Type-check the whole repo (TS + Functions + admin SPA)
yarn tsc -b

# 3. Full production build (includes SEO audit, prerender, sitemap, robots, redirects)
yarn build
# Faster iterative build that skips seo-audit:
yarn build:fast

# 4. Lint (current baseline = 41 errors; do not exceed)
yarn lint

# 5. Offline booster smoke test (no GitHub round-trip, reads content/ on disk)
yarn tsx scripts/test-booster.ts

# 6. Deploy production (Direct-Uploads project — no git auto-deploy)
export CLOUDFLARE_API_TOKEN=...   # never print this
export CLOUDFLARE_ACCOUNT_ID=...
./node_modules/.bin/wrangler pages deploy dist \
  --project-name=ai-direct-pro-landing \
  --branch=main \
  --commit-dirty=true \
  --commit-hash=$(git rev-parse HEAD) \
  --commit-message="$(git log -1 --pretty=%s)"

# 7. Live smoke (run after every deploy)
curl -sI https://gptbot.uz/                          # 200
curl -sI https://gptbot.uz/admin-tools/              # 200 + X-Robots-Tag: noindex, nofollow
curl -sI https://gptbot.uz/admin-tools/seo-booster   # 200 + noindex
curl -sI https://gptbot.uz/sitemap.xml               # 200 + application/xml
curl -sI https://gptbot.uz/robots.txt                # 200 + text/plain
curl -sI https://gptbot.uz/random-test-url-$(date +%s)/   # 404
curl -s  -o /dev/null -w "%{http_code}\n" https://gptbot.uz/api/seo/booster   # 401
curl -s  -o /dev/null -w "%{http_code}\n" -X POST https://gptbot.uz/api/seo/indexnow   # 401
curl -s  -o /dev/null -w "%{http_code}\n" https://gptbot.uz/api/audit                 # 401

# 8. Sitemap safety (must be 0 admin / api / random / draft URLs)
curl -s https://gptbot.uz/sitemap.xml | grep -c "<url>"             # 62 expected
curl -s https://gptbot.uz/sitemap.xml | grep -c "/admin-tools/"     # 0
curl -s https://gptbot.uz/sitemap.xml | grep -c "<loc>https://gptbot.uz/api/"   # 0

# 9. Secret grep — must be clean before any commit
grep -rEn "(ghp_[A-Za-z0-9]{30,}|cfut_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" \
  src functions scripts public content
# Expected: clean (only false positives in scripts/tech-audit.ts regex + docs/SECURITY_SETUP.md)
```

---

## 23. Final QA Checklist (run before declaring success on any deploy)

- [ ] `yarn tsc -b` exits 0
- [ ] `yarn build` exits 0 and `dist/sitemap.xml` contains exactly the expected number of `<url>` entries
- [ ] `yarn lint` does not exceed the baseline (currently 41 errors)
- [ ] `yarn tsx scripts/test-booster.ts` exits 0
- [ ] Secret grep across `src/ functions/ scripts/ public/ content/` is clean
- [ ] Mojibake grep on `content/` is clean (`grep -rn -P "Ã.|Ñ.|Â.|Ð.|Ò.|\uFFFD" content/`)
- [ ] No new file under `public/` accidentally contains a secret
- [ ] Live smoke (§22 step 7) — every URL returns the expected status + headers
- [ ] Sitemap safety (§22 step 8) — no admin / api / random / draft
- [ ] After every deploy, log the deploy short id, commit hash, and the time into `test_result.md` or a session report
- [ ] If anything fails, **roll back via `wrangler pages deployment` or redeploy a prior known-good `dist/`** rather than hot-patching

---

## 24. Copy-Paste Prompt for Next Developer Agent

> You are continuing the GPTBot SEO Booster Engine (`braindiggeruz/ai-direct-pro-landing`, Cloudflare Pages, TypeScript, site `gptbot.uz`).
>
> The MVP read-only Indexation Forge + IndexNow safe submitter is already deployed (commit `e64a4381…`, CF deploy `dad7f77b`). Your task is to deliver the next sprint from `docs/GPTBot_FULL_HANDOFF_AFTER_SEO_BOOSTER_2026-06-08.md` §21 (Sprint 1 first; do **not** skip to GSC).
>
> Hard rules from §20 are non-negotiable. Do **not** touch DNS, do **not** create a new CF Pages project, do **not** restore `/*` fallback, do **not** add `/api/*` to sitemap, do **not** print or commit secrets, do **not** call Google Indexing API for blog/money, do **not** auto-submit IndexNow on publish, do **not** weaken `filterSafeForIndexNow`.
>
> Before any code change: read `docs/seo-booster-engine.md` (engineering map) + this handoff + `docs/CLOUDFLARE_DEPLOY_RUNBOOK.md`. Run the verification commands in §22 to confirm current state. Then start the sprint, run the QA checklist in §23 before declaring success, and produce a final report with deploy id, commit hash, files changed, smoke results, and updated SEO findings.
>
> Acceptance: `yarn tsc -b` green, `yarn build` green, `yarn lint` baseline ≤41, `yarn tsx scripts/test-booster.ts` green, all live smoke endpoints return expected statuses + headers, sitemap safe, no new secret in repo, no DNS change.

---

## NEXT AGENT START HERE

1. **Read** §19 and confirm with the project owner that the leaked Cloudflare API tokens and GitHub PAT have been **revoked + rotated**. Do not proceed if they are still active.
2. **Clone** `https://github.com/braindiggeruz/ai-direct-pro-landing`. Run `yarn install`.
3. **Read** these three files in order: `docs/GPTBot_FULL_HANDOFF_AFTER_SEO_BOOSTER_2026-06-08.md` (this file), `docs/seo-booster-engine.md`, `docs/CLOUDFLARE_DEPLOY_RUNBOOK.md`.
4. **Smoke** the live site with §22 step 7 + 8. If anything regresses, stop and reproduce locally before changing code.
5. **Open** `https://gptbot.uz/admin-tools/seo-booster`. Look at all 4 tabs. Capture the current orphan/cannib counts as your before-baseline.
6. **Start Sprint 1** in §21 — internal-link + cannibalization fixes. This is the largest near-term SEO win and requires **no new code**, only content edits via the admin.
7. **Do NOT** touch: DNS, sitemap.xml generator, robots.txt generator, `_redirects`, `functions/admin-tools/[[path]].ts`, the `filterSafeForIndexNow` function, the cluster definitions in `src/shared/booster.ts`, or any of the project's hard rules in §20.
8. **Do NOT** start GSC integration (Sprint 5) until at least Sprints 1–2 are merged and live.

---

GPTBOT HANDOFF AFTER SEO BOOSTER DEPLOY COMPLETE — NO SECRETS INCLUDED
