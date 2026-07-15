# SEO Admin Guide — GPTBot Cockpit

A practical guide for the marketing operator. No code knowledge required.

> URL (production): `https://gptbot.uz/admin-tools/login`  
> URL (dev / Emergent): `${REACT_APP_BACKEND_URL}/admin-tools/login`  
> Credentials: see Cloudflare Pages env vars (`ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH`).
> Dev login: `admin@gptbot.uz` / `gptbot2026`.

## Quick tour

| Tab | Purpose |
|---|---|
| **Cockpit** | One-screen overview: total pages, published vs draft, sitemap count, low-score pages, mismatch warnings. |
| **Pages** | All money / homepage / niche / FAQ / legal pages. Filter, edit, publish/unpublish, copy URL, preview. |
| **Blog** | Blog posts (P1 — full editor coming, list view is live). |
| **Internal Links** | Library of recommended internal links and orphan-page report. |
| **Redirects** | 301/302 management; committed to `_redirects`. |
| **Settings** | Global SEO (site name, default OG image, schema org). |

## Golden rules

1. **Draft means NOT live.** A draft page is hidden from the sitemap and
   returns 410 Gone at the edge. To go live: switch status → **published**,
   make sure `robotsIndex` stays true, and Save.
2. **Two things must match on every money page:** primary keyword in title +
   primary keyword in H1. Cockpit will warn you if they don't.
3. **Every RU page must have a UZ pair (and vice versa).** The Cockpit shows
   missing pairs. Add them in the page editor under "hreflang".
4. **Score ≥ 80** before publishing. Cockpit shows the score per page.
5. **AI is an assistant, not an author.** Always read what AI generated and
   adjust to actual GPTBot capabilities before pressing Save. Never publish
   AI-generated text that invents cases, statistics or pricing.

## Daily workflow

### 1. Create or edit a page

1. Pages → click an existing URL or **+ New page**.
2. Fill in: locale, slug, primary keyword.
3. Click **Generate draft from primary keyword** in the AI panel.
4. Review each field. Click **Use** to apply individually, or edit by hand.
5. Add 3+ outgoing internal links — use **Suggest links** for ideas.
6. Set status:
   - **draft** → keep working, not live.
   - **published** → goes live on next build (auto on Cloudflare push).
   - **noindex** → page exists but won't be indexed.
7. **Save** (commits to the GitHub repo).

### 2. Upload OG image

1. In the page editor → OG section → **Upload**.
2. Pick PNG/JPG/WebP/SVG ≤ 4 MiB.
3. File is committed to `/public/assets/seo/<filename>` automatically.
4. The OG URL field auto-fills.

### 3. Internal link maintenance

1. Internal Links tab → see the orphan-page report.
2. On any page editor → "Outgoing internal links" → **Suggest links** picks 5
   relevant targets (sibling/parent money pages, under-linked targets).
3. Click **Add** on a suggestion → it's added with a default anchor.

### 4. Redirects

1. Redirects tab → **+ Add**.
2. From `/old-path/` → To `/new-path/` → Status code (301/302).
3. Save → committed to `content/seo/redirects.json` → generated to `_redirects`
   on next build.

### 5. Publish to production

The admin saves to a development mirror (Emergent). To publish to the live
site you have two options:

- **Cloudflare-attached repo** (recommended): every Save commits directly to
  GitHub → Cloudflare auto-builds and deploys in ~60 s.
- **Manual sync**: from the admin, top-right menu → "Publish to GitHub". This
  batch-commits all local content/* changes in one commit.

## Reading the Cockpit

| Section | Means |
|---|---|
| **Total / Published / Drafts / Noindex / Sitemap** tiles | Live counts. Drafts are NOT in the sitemap. |
| **Reality check** card | Per-page mismatch warnings (draft with high score = ready to publish; published with empty body; missing FAQ on money pages). |
| **Missing fields** | Counters for empty title/desc/H1/canonical/JSON-LD. |
| **Duplicates & links** | Duplicate titles (red = critical), orphan pages, broken internal links. |
| **RU / UZ pairing** | hreflang completeness. |
| **All pages** table | Per-page status badge, Live indicator, Sitemap yes/no, score, error/warning count. |

## Filters in Pages list

- **Published only** – sales-critical view.
- **Drafts only** – your editorial backlog.
- **In sitemap / Not in sitemap** – sanity check.
- **Score < 70** – fix-list.
- **Missing FAQ** – pages that need Q&A blocks.
- **Missing hreflang** – pages without a RU/UZ pair.
- **Orphan** – published pages with zero incoming internal links.

## Safety net

- The build pipeline runs `yarn seo:audit` before deploy. Critical issues
  (missing title/description/canonical, duplicates) fail the build.
- Drafts are tested too: `_redirects` returns `410 Gone` for every draft URL,
  so a leaked URL won't end up in Google's index as a duplicate landing page.
- Every change is a Git commit. Roll back instantly via GitHub UI if needed.

## FAQ for the operator

**Q: I clicked Publish. When does the page appear on the site?**  
A: Save commits to GitHub → Cloudflare Pages auto-builds (~60 s). Refresh
`https://gptbot.uz/<your-url>/` after the build finishes (see Cloudflare
Pages → Deployments).

**Q: AI gave me fake numbers / a fake client case. What do I do?**  
A: Delete that part. Replace with truthful copy. Never publish unverified
claims. The system prompt asks the model not to invent — but always
double-check.

**Q: I want to take a page offline immediately.**  
A: Change status from `published` to `draft` → Save. The next build will
remove it from the sitemap and the edge will start serving 410 for the URL.
For instant takedown without waiting for build: add a redirect from that URL
to `/` with status code 410.

**Q: How do I onboard a new operator?**  
A: Cloudflare Pages → Settings → Environment variables → update
`ADMIN_EMAIL` and run `yarn hash-password 'their-password'` → update
`ADMIN_PASSWORD_HASH`. They sign in. JWT_SECRET stays the same.

**Q: I want to rotate my password.**  
A: Run `yarn hash-password 'newpwd'` → paste output into Cloudflare → next
login uses the new password. To kill existing sessions: rotate `JWT_SECRET`.
