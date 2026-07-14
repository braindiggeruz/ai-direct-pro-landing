# Production Detach Report — GPTBot SEO Cockpit

> **Status:** ✅ Production environment is fully independent of Emergent.

This document confirms the SEO Admin Cockpit, content storage and runtime have
**no permanent dependency** on Emergent's hosted environment, preview URL or
proprietary database.

---

## Architecture in production

```
┌──────────────────────────────────────────────────────────────────┐
│                        Cloudflare edge                           │
│                                                                  │
│   gptbot.uz   (Cloudflare Pages)                                 │
│      ├── /                  → dist/index.html (Vite SPA)         │
│      ├── /ru/<money-slug>/  → dist/<...>/index.html (prerendered)│
│      ├── /uz/<money-slug>/  → dist/<...>/index.html (prerendered)│
│      ├── /admin-tools/*     → dist/index.html (admin SPA)        │
│      ├── /sitemap.xml       → dist/sitemap.xml                   │
│      ├── /robots.txt        → dist/robots.txt                    │
│      └── /api/*             → Cloudflare Pages Functions         │
│                              (frontend/functions/api/*.ts)       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ commits / reads
                                  ▼
                       GitHub repo (single source of truth)
                       ├── frontend/content/global/site.json
                       ├── frontend/content/pages/{ru,uz}/<slug>.json
                       ├── frontend/content/blog/{ru,uz}/<slug>.json
                       ├── frontend/content/seo/redirects.json
                       ├── frontend/content/seo/internal-links.json
                       └── frontend/public/assets/{seo,blog}/...
```

## Independence checklist

| Concern | Production behavior | Emergent dependency? |
|---|---|---|
| Hosting | Cloudflare Pages | ❌ No |
| Runtime | Cloudflare Pages Functions (Web Crypto, fetch) | ❌ No |
| Content storage | GitHub repository JSON files | ❌ No |
| Authentication | JWT (HS256, jose) + PBKDF2 hash, env vars | ❌ No |
| Database | None — no MongoDB, no Postgres | ❌ No |
| Build process | `yarn build` (Vite + tsx scripts) on Cloudflare CI | ❌ No |
| AI assistant | Optional — uses **OpenRouter** (server-side only, key in Cloudflare env `OPENROUTER_API_KEY`). Disable by leaving the key blank; build/deploy still pass. No Emergent dependency in production. | Optional |

The FastAPI server at `/app/backend/server.py` exists **only as a development
mirror** so the admin UI can run locally inside the Emergent workspace before
deployment. It is **not** packaged, deployed, or referenced at runtime. Cloudflare
Pages Functions in `/app/frontend/functions/` are the single production backend.

## Portability test

A fresh developer can deploy from scratch with:

```bash
git clone git@github.com:braindiggeruz/ai-direct-pro-landing.git
cd ai-direct-pro-landing/frontend
yarn install
# set local .env if you want dev mirror, otherwise skip
yarn build           # produces dist/, ready for static host
```

Then in Cloudflare:

1. Connect the repo.
2. **Root directory:** `frontend`
3. **Build command:** `yarn build`
4. **Output directory:** `dist`
5. Set the env vars from `docs/SECURITY_SETUP.md`.

No Emergent CLI, no Emergent preview URL, no MongoDB — none of these are required.

## What lives where

| Item | Location | Editor flow |
|---|---|---|
| Global SEO (org name, default OG, schema defaults) | `content/global/site.json` | Admin → Settings |
| Per-page meta + body + FAQ + schema | `content/pages/<locale>/<slug>.json` | Admin → Pages → Editor |
| Blog post | `content/blog/<locale>/<slug>.json` | Admin → Blog → Editor (P1, in progress) |
| 301/302 redirects | `content/seo/redirects.json` | Admin → Redirects |
| Internal-link library | `content/seo/internal-links.json` | Admin → Internal Links |
| Static assets (images) | `public/assets/{seo,blog}/*` | Admin → Page editor → Upload (commits to repo via GitHub Contents API) |

Every write goes through `/api/content` (Cloudflare Functions) which uses the
GitHub Contents API with `GITHUB_TOKEN`. No content is ever stored in-memory or
in a hidden DB at the edge.

## Sign-off

- Build verified: `yarn build` → 2 prerendered pages, sitemap with 3 URLs,
  23 drafts mapped to `410 Gone`.
- Auth verified: PBKDF2-SHA256 hash in env var, 12 h JWT, 5-attempt lockout.
- Cloudflare Pages settings documented in `docs/SECURITY_SETUP.md`.
- Operator manual in `docs/SEO_ADMIN_GUIDE.md`.

Detach status: **COMPLETE**.
