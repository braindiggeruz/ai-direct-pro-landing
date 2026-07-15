# SEO Admin Architecture Decision Record

**Date:** 2026-02-01  
**Status:** ✅ Implemented and shipping  
**Project:** [gptbot.uz](https://gptbot.uz) — AI/GPT bot for business in Uzbekistan

## Decision

We build a **Git-based content management system** with a **custom admin SPA**
mounted under `/admin-tools/`, served by **Cloudflare Pages + Pages Functions**,
backed by **JSON files committed directly to the GitHub repository** via the
**GitHub Contents / Git Data API**.

## Why not headless CMS / Sanity / Strapi?

| Need | Headless CMS | Git-based (chosen) |
|---|---|---|
| Marketer-friendly UI | ✅ | ✅ (we built it) |
| Versioned content, rollbacks | needs paid plan | ✅ free, every commit is a version |
| Portability away from vendor | ⚠️ migration headache | ✅ content is just JSON in the repo |
| Latency on render | needs build hook + API call | ✅ static prerendered HTML at the edge |
| Per-page custom JSON-LD, hreflang | possible but rigid schemas | ✅ free-form JSON per page |
| Cost at our scale (≤500 pages) | $39–199/mo | ✅ $0 — only Cloudflare Pages free tier |

## Why a custom admin instead of CMS-as-a-Service?

- The SEO operator (you) needs a **single pane of glass** with Cockpit, Per-page
  Editor, Redirects, Internal Links, Schema, hreflang, FAQ, and on-the-fly
  AI-assisted draft generation. No off-the-shelf CMS bundles all of this.
- We control build-time invariants (audit fails the build on duplicate titles,
  broken links, missing canonical) — impossible to enforce in a SaaS CMS.

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend SPA + Admin | Vite + React 19 + Tailwind | Existing repo stack |
| Routing | `react-router-dom` | SPA + nested admin routes |
| Build-time prerender | Custom `scripts/prerender.ts` | renders meta+JSON-LD per published page into static HTML files |
| Sitemap / robots / redirects | `scripts/generate-sitemap.ts`, `generate-robots.ts` | run after Vite build |
| Edge runtime API | Cloudflare Pages Functions (`functions/api/**`) | no servers, no DB, runs at the edge |
| Auth | JWT (HS256, `jose`) + PBKDF2 hashed password + IP lockout + optional Cloudflare Turnstile | works in Workers Web Crypto runtime |
| Content storage | GitHub repo JSON files | single source of truth, version-controlled |
| Dev mirror | FastAPI `backend/server.py` | local Emergent dev only — not deployed |
| AI assistant | Emergent universal LLM key (GPT-5.2) — strictly **review mode**, never auto-publishes | helps draft title/description/FAQ |

## Constraints honoured

- **No vendor lock-in.** Production stack = GitHub + Cloudflare Pages only.
  Anyone with the repo can deploy without Emergent.
- **No phantom indexable URLs.** Draft pages are excluded from the sitemap and
  return `410 Gone` via `_redirects` rules so search engines de-index them.
- **No fake SEO promises.** AI assistant's system prompt explicitly bans
  invented testimonials, statistics or top-3 ranking guarantees.
- **No secrets in repo.** `.gitignore` excludes `.env`, `backend/.env`,
  `frontend/.env`. Production secrets live in Cloudflare env vars only.

## Alternatives considered

1. **Switch to Next.js / Astro.** Rejected — too much rewrite for a working
   Vite SPA. Prerender script gives us static HTML where it matters (money +
   blog pages) without changing the runtime.
2. **MongoDB-backed admin.** Rejected — adds runtime dependency and creates
   non-portable content.
3. **GitHub Actions to commit content.** Considered but slower (10–30s feedback)
   than direct Contents API (~1s) and less elegant for the operator.

## Open questions / future work

- Multi-author audit log (P2).
- Visual diff before publish (P2).
- Cross-link suggestion engine (P1 — implemented Feb 2026).
- Image upload via Contents API (P1 — implemented Feb 2026).
- Cloudflare Turnstile on login (P1 — implemented Feb 2026).
- AI-fill draft generator (P1 — implemented Feb 2026).
