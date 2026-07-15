# SEO Booster Engine — Indexation Forge for GPTBot

**Status:** MVP shipped in `/admin-tools/seo-booster`. Read-only by default. White-hat only.
**Scope:** technical SEO + indexation acceleration via sitemap hygiene, internal links, IndexNow, GSC-ready queues, clusters, cannibalization radar, and publish quality gate.
**What this is NOT:** doorway pages, hidden text, fake schema, mass AI-generated junk, paid links, fake reviews, behaviour-bot stuffing, cloaking, Google Indexing API misuse, or anything that risks Google manual actions.

---

## 1. Why this engine exists

GPTBot already has a SEO Cockpit (page-level audit, mojibake guard, broken-link checker). The Booster goes one level deeper:

- It looks at the **whole index graph** (pages + blog + sitemap + hreflang + internal links + freshness + clusters + cannibalization) in one place.
- It converts the data into **actionable priority queues**: which URLs to nudge into Bing/Yandex via IndexNow now, which to queue for **manual** GSC URL Inspection, which money pages are starved of internal links, and which clusters are incomplete.
- It enforces a hard **publish/push gate** so noindex, draft, mojibake, `/admin-tools/*` and `/api/*` URLs **cannot** be submitted, no matter what the operator clicks.

The whole module is additive — it does not change any existing route, sitemap, robots, or admin behaviour.

---

## 2. What is OFF-LIMITS (and why)

| Black-hat / risky                                                | Why we refuse                                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Mass auto-generation of thin AI pages                            | Google's "helpful, people-first content" policy + spam policies                                                              |
| Doorway pages per city / per long-tail keyword                   | Explicitly listed as spam: <https://developers.google.com/search/docs/essentials/spam-policies#doorways>                     |
| Fake schema (e.g. `Review`/`AggregateRating` without real data)  | Manual action risk: <https://developers.google.com/search/docs/appearance/structured-data/sd-policies>                       |
| Hidden text / cloaking                                           | Manual action                                                                                                                |
| Submitting blog/money URLs to **Google Indexing API**            | Indexing API is **only** for `JobPosting` + `BroadcastEvent`: <https://developers.google.com/search/apis/indexing-api/v3/quickstart> |
| Pinging IndexNow on every page load or on unchanged content      | Bing throttles spammy keys                                                                                                   |
| Fake `lastmod` to force recrawl                                  | Google explicitly ignores fake-stamped sitemaps and may reduce trust                                                         |
| Buying spam links / link wheels                                  | Manual action                                                                                                                |
| Behavioural CTR bots                                             | Manual action + analytics fraud                                                                                              |

---

## 3. Research findings (verified sources)

1. **Sitemaps** — Google recommends `<lastmod>` only when truly accurate; `<priority>` and `<changefreq>` are ignored. One URL per locale; alternates via `xhtml:link rel="alternate" hreflang=…`.
   Source: <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>
2. **Robots / X-Robots-Tag** — Robots disallow does **not** equal noindex. To deindex, use `noindex` meta or `X-Robots-Tag: noindex` (we already do this for `/admin-tools/*` and `/api/*`).
   Source: <https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag>
3. **GSC URL Inspection API** — 2,000 inspections per property per day; 600 per minute. Read-only, no submission.
   Source: <https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect>
4. **GSC Search Analytics API** — queries / impressions / clicks / CTR / position; 25k row limit per request; can be paginated.
   Source: <https://developers.google.com/webmaster-tools/v1/searchanalytics/query>
5. **IndexNow protocol** — POST JSON `{ host, key, keyLocation, urlList }`; up to 10,000 URLs per submission; 200/202 = accepted, 4xx = rejected. Key file must be served on host root.
   Source: <https://www.indexnow.org/documentation>
6. **Hreflang reciprocity** — required to be respected. Self + bidirectional pair.
   Source: <https://developers.google.com/search/docs/specialty/international/localized-versions>
7. **Helpful, people-first content** + spam policies (auto-generated content, doorways, hidden text, cloaking).
   Sources: <https://developers.google.com/search/docs/fundamentals/creating-helpful-content>, <https://developers.google.com/search/docs/essentials/spam-policies>

---

## 4. Architecture

```
       ┌──────────────────────────────────────────────────────────┐
       │             Admin SPA  (existing React app)              │
       │  /admin-tools/seo-booster   (NEW page, this MVP)         │
       └──────────────────────────────────────────────────────────┘
                              │
                              ▼ same-origin fetch
       ┌──────────────────────────────────────────────────────────┐
       │  Cloudflare Pages Functions (existing /functions/api)    │
       │                                                          │
       │   GET  /api/seo/booster    (NEW, read-only)              │
       │   POST /api/seo/indexnow   (NEW, safe submit)            │
       │   GET  /api/seo/suggest-links  (existing)                │
       │   GET  /api/audit              (existing cockpit feed)   │
       └──────────────────────────────────────────────────────────┘
                              │
                              ▼ existing readContentBulk()
       ┌──────────────────────────────────────────────────────────┐
       │   GitHub Contents API → /content/{pages,blog,seo}/*.json │
       └──────────────────────────────────────────────────────────┘

   Optional, deferred to P2:
       /api/seo/gsc/oauth/start, /callback, /inspect, /analytics
       /api/seo/gsc/sitemaps/submit
```

- **No new infrastructure.** No new Pages project. No DNS write.
- **Same auth** — `requireAuth(...)` on every booster endpoint.
- **Same content store** — booster reads the bulk-fetched repo tree once, computes everything in-memory.
- **One source of truth** — all scoring lives in `src/shared/booster.ts`, importable both by Workers and by the admin UI for live filtering without a round-trip.

---

## 5. Data model (additive, no schema migrations)

The Booster does not write any new field to existing JSON; it derives everything at request time from `content/pages/*.json` + `content/blog/*.json` + `content/seo/internal-links.json`.

```ts
type BoosterItem = {
  kind: 'page' | 'blog';
  url: string;
  pageType: 'homepage' | 'money' | 'niche' | 'blog' | 'faq' | 'legal';
  // … live audit flags …
  scores: {
    indexationPriority: 0..100;
    moneyPower: 0..100 | null;     // null for non-money
    freshness: 0..100;
    quality: 0..100;
  };
  flags: { pushable: boolean; pushReasons: string[]; ... };
};
type ClusterReport = { /* per-cluster authority, gaps, supporting articles */ };
type CannibalizationPair = { a, b, risk, reasons, suggestion };
type BoosterSummary = { kpis... };
```

---

## 6. API surface

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/seo/booster` | admin JWT | Returns full `BoosterReport` (items + clusters + cannibalization + summary). Read-only. |
| POST | `/api/seo/indexnow` | admin JWT | Submits a **filtered, validated** URL list to `api.indexnow.org`. Body: `{ urls: string[] }`. Filters in `filterSafeForIndexNow()` reject anything not in `content/`, not pushable, not on `gptbot.uz`. |
| GET | `/api/seo/suggest-links` | admin JWT | Already exists. Used by the Internal Links tab. |
| GET | `/api/audit` | admin JWT | Already exists. Used by the existing Cockpit. |

Deferred (P2):
| GET | `/api/seo/gsc/auth/start` | admin JWT | Returns OAuth2 consent URL. Token stored as Pages env secret (manual rotate). |
| GET | `/api/seo/gsc/inspect?url=…` | admin JWT | Calls GSC URL Inspection API. |
| GET | `/api/seo/gsc/analytics` | admin JWT | Calls GSC Search Analytics API. |
| POST | `/api/seo/gsc/sitemaps/submit` | admin JWT | Submits sitemap URL via GSC Sitemap API. |

---

## 7. Scoring formulas (in `src/shared/booster.ts`)

| Score | Definition | Why |
| --- | --- | --- |
| **Indexation Priority** | base by pageType + incoming-links boost + hreflang reciprocity boost + recency boost − missing-metadata penalty − orphan penalty. Hard 0 if not pushable. | Ranks what to feed into IndexNow & GSC priority queue. |
| **Money Page Power** | 25 incoming + 20 FAQ + 20 schema + 15 hreflang + 10 outgoing + 10 description length. | Single number for an SEO operator to spot weak money pages. |
| **Cluster Authority** | 0.5 × completeness% + 0.3 × min(avgIncoming/3,1)×100 + 0.2 × hreflang pair %. | Spots clusters where the head is starved of supporting articles. |
| **Freshness** | Step function: ≤30d → 100, ≤90d → 70–85, ≤180d → 50–70, ≤365d → 30–55, else 20. Blog ages faster than money. | Surfaces stale content needing real refresh (FAQ expansion, examples, prices, screenshots). |
| **Cannibalization Risk** | title-Jaccard + H1-Jaccard + same primary keyword + type mismatch (blog vs money). Threshold ≥35 reported, ≥60 critical. | Spots URLs competing for the same intent. |

---

## 8. Automation flows

### Publish flow (no change to existing publish endpoint — gate is at API layer)
1. Admin edits/creates page → `POST /api/content` already runs `detectMojibake` + status guard.
2. **No automatic IndexNow on publish** — operator must explicitly press **Submit selected → IndexNow** in the Booster UI. (Avoids accidental spam-pinging on every save.)
3. After deploy to Cloudflare Pages, sitemap regenerates via existing `scripts/generate-sitemap.ts`.

### Update flow (freshness)
1. Booster shows `daysSinceUpdate` + freshness score per URL.
2. Operator does **real** content updates (FAQ, examples, local context, screenshots, internal links).
3. `updatedAt` is touched **only** if `content/pages/<slug>.json` was actually changed (existing `putFile` does this via commit-on-change).
4. Operator selects the changed URLs in the Booster table → **Submit to IndexNow**.

### Indexation flow
1. Booster computes Indexation Priority Score for every URL.
2. Top N pushable URLs appear pre-checked in the "Indexation queue" tab.
3. **Submit to IndexNow** → `POST /api/seo/indexnow` → validator → `api.indexnow.org` with existing key file `mrutks6jdnrob4r70zp8u7868a83lnim.txt`.
4. "Manual GSC queue" tab lists the same URLs as a copy-paste list — operator pastes them into GSC URL Inspection (no API call until the optional GSC OAuth flow is wired in P2).

### Internal-linking flow
1. Booster lists orphan pages + money pages with `<2` incoming + low-quality anchors.
2. Operator opens the Page Editor → uses the existing `suggestLinks` endpoint to add 2–5 contextual links with curated anchors (`src/shared/site-config.ts → ANCHORS`).
3. No automatic insertion — operator confirms each suggestion.

### GSC review flow (P2, designed not built)
- **Recommended path:** **OAuth2 user grant.** Admin starts at `/api/seo/gsc/auth/start`, signs in with Google account that already owns the `gptbot.uz` GSC property, refresh token stored as a Cloudflare Pages **encrypted env var** (manual paste, never logged, never printed in UI). No DNS change needed because the property is already verified.
- **Service Account path (optional, advanced):** would require either (a) adding the service-account email as a delegated owner inside GSC (no DNS), or (b) the `google-site-verification` DNS TXT route (we deliberately did not touch DNS in this MVP, since OAuth covers the same use case with zero DNS work).

---

## 9. UI screens

`/admin-tools/seo-booster` — single page, 4 tabs:

1. **Indexation Forge** — KPI tiles + sortable URL table (URL · Type · Quality · IP score · Money power · Freshness · Incoming · Status · Pushable). Bulk-select → "Submit selected → IndexNow" / "Copy as GSC manual queue".
2. **Internal Link Booster** — orphans table + money pages with `<2` incoming + a "Get suggestions" jump into the existing `/admin-tools/pages/:locale/:slug` editor.
3. **Clusters** — per-cluster authority bar, completeness, gaps, hreflang pair status.
4. **Cannibalization Radar** — pairwise risk table with suggested action.

All tabs are read-only; **only two state-changing actions exist** in MVP: (a) "Submit to IndexNow" (validated by `filterSafeForIndexNow`), (b) "Copy GSC queue" (clipboard only, zero server effect).

---

## 10. MVP backlog with P0/P1/P2

| Pri | Feature | Status |
| --- | --- | --- |
| P0 | Read-only Booster dashboard with all scores | ✅ shipped |
| P0 | URL safety filter (excludes admin/api/draft/noindex/mojibake) | ✅ shipped |
| P0 | Orphan + low-incoming detection | ✅ shipped |
| P0 | Sitemap / canonical / hreflang / schema / robots checks | ✅ shipped (re-uses audit) |
| P0 | Publish guard (existing) | ✅ unchanged |
| P1 | IndexNow submit endpoint with validator + log | ✅ shipped |
| P1 | Internal link suggestion engine | ✅ reuses existing endpoint |
| P1 | Cluster authority & gaps | ✅ shipped |
| P1 | Cannibalization radar | ✅ shipped |
| P2 | GSC OAuth2 + URL Inspection + Search Analytics | 📝 designed (this doc) |
| P2 | GSC Sitemap submit API | 📝 designed |
| P2 | Auto-suggested anchors with diversity guard | 📝 designed |
| P2 | "Recrawl Pulse Queue" — track which URLs were pinged when | 📝 designed |
| P2 | "SERP Snippet Lab" — test alternative titles/descriptions before publishing | 📝 designed |

---

## 11. Acceptance checklist

- [x] No new Cloudflare Pages project created
- [x] No DNS change
- [x] `/admin-tools/*` still returns `200` + `X-Robots-Tag: noindex,nofollow`
- [x] `/api/*` still excluded from sitemap
- [x] Random URLs still return 404
- [x] No `/*` global fallback added
- [x] No secrets committed (no GitHub PAT, no Cloudflare API token, no Google OAuth secret in repo)
- [x] No `lastmod` is set fake — only via real content edit + commit
- [x] All Booster endpoints require admin JWT
- [x] IndexNow submitter rejects: non-`gptbot.uz` URLs, draft, noindex, admin/api, mojibake, duplicates, non-published, missing canonical
- [x] No `Google Indexing API` calls for regular blog/money pages
- [x] Build green: `yarn build:fast` + `tsc -b`
- [x] No new lint errors

---

## 12. Final agent prompt (for the next implementer continuing this work)

> You are continuing the SEO Booster Engine for GPTBot (`braindiggeruz/ai-direct-pro-landing`, Cloudflare Pages, TypeScript). MVP P0/P1 is already shipped on branch `feat/seo-booster-engine`. Your task is **P2**:
>
> 1. Implement `functions/api/seo/gsc/*` using **OAuth2 user flow** (the GSC property is already verified for the admin's Google account).
> 2. Store refresh-token as encrypted Cloudflare Pages env var `GSC_REFRESH_TOKEN`. Add `GSC_CLIENT_ID` + `GSC_CLIENT_SECRET`. **Never log, never echo, never expose** to the SPA.
> 3. Wire `GET /api/seo/gsc/inspect?url=…` to `urlInspection.index.inspect` and surface the `coverageState` (`Indexed` / `Discovered – currently not indexed` / `Crawled – currently not indexed` / `Excluded` etc.) into the Booster items.
> 4. Wire `GET /api/seo/gsc/analytics?range=28d` to `searchanalytics.query` and surface impressions, clicks, CTR, position per URL.
> 5. Stay within GSC quotas (URL Inspection 2,000/day; Search Analytics 25,000 rows/request).
> 6. Do **NOT** call Google Indexing API for any URL — it is only allowed for `JobPosting` / `BroadcastEvent`.
> 7. Do **NOT** add a global `/*` fallback. Do **NOT** alter robots/sitemap/admin behaviour. Do **NOT** ping IndexNow automatically on publish — keep it operator-driven.
> 8. Acceptance: `yarn build:fast` green, `tsc -b` green, no new lint errors, all GSC endpoints behind `requireAuth`, no secret in repo, no secret in client bundle.
