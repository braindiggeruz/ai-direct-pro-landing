# Cloudflare Pages Deploy Runbook — GPTBot

## Current state (2026-06-03)
- Project: `ai-direct-pro-landing`
- Account: `14ce9e04574f2e6d825e56ee603e5cd5`
- Production aliases: `https://gptbot.uz`, `https://www.gptbot.uz`
- **Project source: empty / Direct Uploads**.
  `GET /accounts/<acc>/pages/projects/ai-direct-pro-landing` returns `source: {}`.
  `PATCH … {source:{type:'github', ...}}` returns
  `8000069: You cannot update the source object in a Direct Uploads project.`
- Practical consequence: `git push origin main` does **not** trigger any
  Cloudflare Pages build. Every production change must be deployed
  manually via `wrangler pages deploy dist`.

## Option A — Connect GitHub auto-deploy (owner action, ~3 min, no DNS)

Cloudflare does not allow API-level conversion of a Direct-Uploads
project to a Git-connected one. To enable auto-deploy you must do this
once via the dashboard. **DNS and the existing project name stay
exactly as-is — only `source` is changed.**

1. Sign in to Cloudflare dashboard → Account `14ce9e04…` → Pages →
   `ai-direct-pro-landing`.
2. **Settings → Builds & deployments → Source**.
3. Click **Connect to Git**. Pick **GitHub**, authorize the Cloudflare
   Pages GitHub App on the `braindiggeruz` account if not yet
   authorized.
4. Select repository `braindiggeruz/ai-direct-pro-landing`, production
   branch `main`.
5. Build configuration:
   - Framework preset: **None** (custom)
   - Build command: `yarn install && yarn build`
   - Build output directory: `dist`
   - Root directory: `/` (leave empty)
   - Environment variables: copy from `Production` env (already set,
     do not change). Make sure `GITHUB_TOKEN`, `GITHUB_OWNER`,
     `GITHUB_REPO`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`
     are all present.
   - Node version: `22` (set via `NODE_VERSION=22` env var if needed).
6. Save & deploy. Cloudflare will run the first GitHub-triggered build
   automatically. Verify it succeeds in **Deployments** tab.
7. Subsequent `git push origin main` → automatic production rebuild.

After step 6 the manual `wrangler` deploy path below stays available as
a fallback for emergency hotfixes.

## Option B — Manual wrangler deploy (current default)

Used in all 2026-06-03 emergency sessions; works without any dashboard
action and respects the existing Direct-Uploads project.

```bash
cd /app/repo
yarn install
yarn build
# Wrangler 4.x requires Node ≥ 22
node --version  # should be v22.x
export CLOUDFLARE_API_TOKEN="<token with Pages:Edit on account>"
export CLOUDFLARE_ACCOUNT_ID="14ce9e04574f2e6d825e56ee603e5cd5"
./node_modules/.bin/wrangler pages deploy dist \
  --project-name=ai-direct-pro-landing \
  --branch=main \
  --commit-dirty=true \
  --commit-hash=$(git rev-parse HEAD) \
  --commit-message="$(git log -1 --pretty=%s)"
```

The deployment is **production** when `--branch=main`. Aliases
`gptbot.uz` and `www.gptbot.uz` are reassigned automatically.

## Smoke test after every deploy
```bash
curl -sI https://gptbot.uz/ | head -1                     # 200
curl -sI https://gptbot.uz/sitemap.xml | head -1          # 200
curl -sI https://gptbot.uz/admin-tools/ | grep -i robots  # X-Robots-Tag: noindex, nofollow
curl -s  -o /dev/null -w "%{http_code}\n" https://gptbot.uz/random-test-url-$(date +%s)/  # 404
curl -s  -o /dev/null -w "%{http_code}\n" -X POST https://gptbot.uz/api/content  # 401
```

## Hard rules
- Never create a second Cloudflare Pages project for the same domain.
- Never touch DNS / zone settings here. They are managed separately.
- Never re-introduce a global `/*` SPA fallback in `_redirects` /
  `_routes.json`; random URLs must stay 404 + noindex.
- Never commit secrets. Cloudflare env owns `GITHUB_TOKEN`,
  `JWT_SECRET`, `ADMIN_PASSWORD_HASH`.
