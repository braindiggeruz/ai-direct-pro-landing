# Deployment dry-run

Status: local validation only. No deployment was triggered.

## Observed topology

- GitHub repository: `braindiggeruz/ai-direct-pro-landing`, production branch
  `main`.
- Cloudflare Pages project: `ai-direct-pro-landing`.
- Cloudflare build command: `corepack yarn build`.
- Cloudflare output directory: `dist`.
- Pages Functions routing: `public/_routes.json` includes `/api/*`,
  `/admin-tools/*`, and `/robots.txt`.
- D1 binding: `GPTBOT_DRAFTS_DB` → `gptbot-ai-drafts`.
- Railway production environment was reported by GitHub Deployments as
  `strong-exploration / production`.
- Railway backend root: `apps/gpt-backend`.
- Railway build/start: `npm install && npm run build` / `npm run start`.
- Railway health route: `/health`.
- Both Railway and Cloudflare Git integrations have produced deployments from
  `main`; they must remain paused throughout R0.3B.

## Validator

```powershell
npx tsx scripts/release/deployment-dry-run.ts
```

The validator reads repository configuration and build artifacts. It never
calls a provider deployment API, changes a Git integration, applies a D1
migration, pushes a ref, or mutates a webhook.

Before R1 approval, run the complete read-only preflight:

```powershell
npx tsx scripts/release-preflight.ts --deep
```

R0.4 local preparation can be checked independently while R0.3B remains
blocked:

```powershell
npx tsx scripts/release-preflight.ts --phase r0.4-prep
```
