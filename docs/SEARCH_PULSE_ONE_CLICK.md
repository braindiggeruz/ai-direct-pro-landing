# Search Pulse: one-click discovery

`/admin-tools/seo-booster` contains one primary action:
**«Ускорить новые страницы»**.

It is a discovery assistant, not a ranking guarantee. Each click recomputes
the queue on the server and performs only supported white-hat actions.

## Eligibility gate

A URL is eligible when all conditions are true:

- content status is `published` and `robotsIndex !== false`;
- canonical, title and description exist;
- URL is not an admin/API/asset/query/fragment URL;
- no mojibake was detected;
- Booster quality score is at least 80/100;
- `lastModifiedAt` is valid and no older than 45 days;
- the current content version has not already succeeded in IndexNow.

If content changed after a successful IndexNow submission, it becomes
eligible again. A 24-hour cooldown prevents rapid repeat submissions.
One click is capped at 200 URLs and sorted by indexation priority.

## What the click does

1. Re-reads content from the canonical repository source.
2. Re-applies the quality and freshness gate server-side.
3. Sends eligible URLs through the existing resilient IndexNow engine.
4. Writes one append-only D1 audit row per URL.
5. Re-submits `https://gptbot.uz/sitemap.xml` through the Google Search
   Console Sitemap API when OAuth is configured.
6. If GSC OAuth is absent or unavailable, returns up to ten priority URLs
   as a copyable manual URL Inspection queue.

The implementation never uses Google's Indexing API for ordinary pages.
That API is restricted to `JobPosting` and live-stream
`BroadcastEvent` pages.

## Optional Google Search Console setup

Configure these server-only Cloudflare Pages secrets:

- `GSC_CLIENT_ID`
- `GSC_CLIENT_SECRET`
- `GSC_REFRESH_TOKEN`

Optional non-secret overrides:

- `GSC_SITE_PROPERTY` (default `sc-domain:gptbot.uz`)
- `GSC_SITEMAP_URL` (default `https://gptbot.uz/sitemap.xml`)

The OAuth identity needs access to the matching Search Console property.
Secrets are never returned to the browser or written to audit logs.

## Operator flow

1. Open `/admin-tools/seo-booster`.
2. Review the ready/cooldown/current counts.
3. Click **«Ускорить новые страницы»** and confirm.
4. Read the separate IndexNow and Google statuses.
5. If Google OAuth is not configured, copy the prepared Google queue and
   use URL Inspection manually.

Re-running with an empty queue is a no-op.
