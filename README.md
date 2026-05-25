# GPTBot SEO Cockpit — gptbot.uz

AI/GPT bot for business in Uzbekistan that replies to clients in Telegram/Instagram 24/7,
collects name + phone + need and forwards leads to a manager.

This repository powers **both** the public landing pages and the SEO admin /
content-management UI mounted at `/admin-tools/`.

## Stack
- **Vite + React 19 + TypeScript** (SPA + admin panel)
- **Tailwind CSS** for styling
- **Cloudflare Pages** for hosting (static + Functions)
- **Cloudflare Pages Functions** for the `/api/*` backend (Web Crypto JWT, GitHub Contents API)
- **GitHub-backed content** — every page / blog / redirect / SEO setting lives as a JSON file in this repo

## Local development

```bash
yarn install
yarn dev        # Vite dev server on 3000
```

For the admin to work locally you also need the FastAPI mirror (see `/app/backend/server.py` in the Emergent workspace).

## Build for production

```bash
yarn build
# runs: seo:audit → tsc → vite build → prerender → sitemap → robots+redirects
```

Outputs to `dist/`. Deploy with `wrangler pages deploy dist --project-name=ai-direct-pro-landing`.

## Documentation
- [`docs/SEO_ADMIN_DECISION.md`](docs/SEO_ADMIN_DECISION.md) — architecture decision record
- [`docs/SEO_ADMIN_GUIDE.md`](docs/SEO_ADMIN_GUIDE.md) — operator manual
- [`docs/PRODUCTION_DETACH_REPORT.md`](docs/PRODUCTION_DETACH_REPORT.md) — confirms zero vendor lock-in
- [`docs/SECURITY_SETUP.md`](docs/SECURITY_SETUP.md) — env vars, password rotation, KV bindings
- [`docs/PAGE_STATUS_AUDIT.md`](docs/PAGE_STATUS_AUDIT.md) — current published/draft status of all pages

## Required Cloudflare Pages env vars (set in dashboard)

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | ✅ | PAT with `repo` scope |
| `GITHUB_OWNER` | ✅ | `braindiggeruz` |
| `GITHUB_REPO` | ✅ | `ai-direct-pro-landing` |
| `GITHUB_BRANCH` | ✅ | `main` |
| `ADMIN_EMAIL` | ✅ | `admin@gptbot.uz` |
| `ADMIN_PASSWORD_HASH` | ✅ | Generate via `yarn hash-password "<password>"` |
| `JWT_SECRET` | ✅ | random ≥ 32-char |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | optional | enables captcha on login |
| `OPENROUTER_API_KEY` | optional | enables AI-fill in editor (OpenRouter, server-side only) |
| KV binding `LOGIN_ATTEMPTS` | optional | durable brute-force lockout |
