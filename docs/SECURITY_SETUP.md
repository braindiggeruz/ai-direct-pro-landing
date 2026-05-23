# Security Setup — GPTBot SEO Cockpit

## 1. Required environment variables (Cloudflare Pages)

Set these in **Cloudflare Pages → Settings → Environment variables**. The
production deployment **will not start** without `JWT_SECRET`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD_HASH` and the GitHub tuple.

| Variable | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | ✅ | PAT (classic) with `repo` scope. Used to commit content/images. |
| `GITHUB_OWNER` | ✅ | e.g. `braindiggeruz` |
| `GITHUB_REPO` | ✅ | e.g. `ai-direct-pro-landing` |
| `GITHUB_BRANCH` | ✅ | typically `main` |
| `JWT_SECRET` | ✅ | Random ≥ 32-char string. Rotate by changing this value (invalidates all sessions). |
| `ADMIN_EMAIL` | ✅ | single-admin email, e.g. `admin@gptbot.uz` |
| `ADMIN_PASSWORD_HASH` | ✅ (preferred) | `pbkdf2_sha256$…` produced by `yarn hash-password`. |
| `ADMIN_PASSWORD` | ⚠️ dev only | Plain password fallback. **Delete in production once HASH is set.** |
| `TURNSTILE_SITE_KEY` | optional | Public Turnstile key. If set, login UI renders the captcha. |
| `TURNSTILE_SECRET_KEY` | optional | Server-side Turnstile secret. If set, login verifies the captcha. |
| `OPENROUTER_API_KEY` | optional | OpenRouter key (server-side only — never reaches the browser). Enables AI-fill. Leave blank to disable AI-fill gracefully. |
| `OPENROUTER_MODEL_ECONOMY` | optional | Default model for AI-fill. Defaults to `openai/gpt-4o-mini` (~$0.15/$0.60 per 1M tok, 128k ctx, native JSON mode, strong RU). |
| `OPENROUTER_MODEL_QUALITY` | optional | Fallback / explicit-quality model. Defaults to `anthropic/claude-sonnet-4.5` (~$3/$15 per 1M tok, 1M ctx, best RU + Uzbek Latin). |
| `OPENROUTER_SITE_URL` | optional | Sent as `HTTP-Referer` for OpenRouter attribution. Defaults to `https://gptbot.uz`. |
| `OPENROUTER_APP_TITLE` | optional | Sent as `X-Title` for OpenRouter attribution. Defaults to `GPTBot SEO Cockpit`. |
| `LOGIN_ATTEMPTS` *(KV binding)* | optional | Cloudflare KV namespace bound under the same name. Provides durable cross-isolate lockout. Falls back to in-isolate memory if absent. |

## 2. Generating the password hash

Locally:

```bash
cd frontend
yarn hash-password 'your-strong-password-here'
# → ADMIN_PASSWORD_HASH=pbkdf2_sha256$210000$<salt>$<hash>
```

Paste the value (without the `ADMIN_PASSWORD_HASH=` prefix) into Cloudflare and
**delete** any `ADMIN_PASSWORD` variable. The hash algorithm (PBKDF2-SHA256,
210 000 iterations, 16-byte salt, 32-byte derived key) is identical between the
Cloudflare Worker (Web Crypto) and the Python dev mirror (hashlib).

## 3. Brute-force lockout

Implemented in `frontend/functions/lib/lockout.ts`:

- 5 failed login attempts per `(IP, email)` within 15 min → 15 min lockout.
- Storage: prefer Cloudflare KV namespace bound as `LOGIN_ATTEMPTS`. To create:
  1. Workers & Pages → KV → **Create namespace** → name it `LOGIN_ATTEMPTS`.
  2. In the Pages project → Settings → Functions → KV namespace bindings →
     **Add binding** → Variable name `LOGIN_ATTEMPTS`, choose the namespace.
- Without the binding the lockout falls back to in-isolate memory (still useful;
  resets only when the isolate restarts).

## 4. Cloudflare Turnstile (optional but recommended)

1. Dashboard → Turnstile → **Add site** for `gptbot.uz`.
2. Copy **Site key** → set as `TURNSTILE_SITE_KEY` (visible to browser).
3. Copy **Secret key** → set as `TURNSTILE_SECRET_KEY` (server only).
4. Redeploy. The login screen now renders the widget; the backend verifies the
   token on every login attempt. If either env var is missing the captcha is
   disabled gracefully.

## 5. GitHub token rotation (do this NOW — the old one was shared in chat)

1. Sign in to GitHub → **Settings → Developer settings → Personal access tokens
   → Tokens (classic)**.
2. **Revoke** the token starting with `ghp_RPI6JfiZ…`.
3. **Generate a new classic token**, scopes:
   - `repo` (Full control of private repositories)
   - (optional) `read:user`
   - expiry: 90 days; set a calendar reminder.
4. Paste it into Cloudflare Pages → Environment variables → `GITHUB_TOKEN`.
5. Trigger a redeploy or wait for the next auto-deploy.
6. Verify by signing in to `https://gptbot.uz/admin-tools/login`, opening any
   page in the editor and pressing **Save**. The admin returns "Saved ✅"
   meaning the new token committed successfully.

## 6. JWT secret rotation

1. Generate a new random ≥ 32-char string:
   ```bash
   openssl rand -base64 48
   ```
2. Replace `JWT_SECRET` in Cloudflare env. **All existing admin sessions are
   invalidated** — operators must sign in again.

## 7. Verifying secrets are NOT in the repo

```bash
git ls-files | xargs grep -l 'ghp_' || echo 'no tokens in tracked files'
git ls-files | grep -E '(^|/)\.env$' || echo 'no .env files tracked'
```

Both commands should print "no …".

`/app/.gitignore` explicitly ignores:

- `.env`
- `.env.*` (except `.env.example`)
- `backend/.env`
- `frontend/.env`
- `*token.json*`
- `*credentials.json*`

## 8. Security checklist (sign-off)

- [ ] `GITHUB_TOKEN` rotated; the legacy `ghp_RPI6JfiZ…` revoked on GitHub.
- [ ] `ADMIN_PASSWORD_HASH` set; `ADMIN_PASSWORD` deleted.
- [ ] `JWT_SECRET` is a random ≥ 32-char string.
- [ ] `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` configured (recommended).
- [ ] `LOGIN_ATTEMPTS` KV namespace bound (recommended).
- [ ] `OPENROUTER_API_KEY` set if AI-fill is wanted; left empty otherwise. Key never appears in client bundle.
- [ ] `/admin-tools/` is reachable but requires sign-in.
- [ ] `robots.txt` disallows `/admin-tools/` and `/api/`.
- [ ] Cloudflare Web Application Firewall enabled (default tier is fine).
- [ ] Test login fails 5 times → returns 429 / "locked for 15 min".

## 9. Incident response

If the production token is suspected leaked:

1. Revoke it on GitHub → Personal access tokens.
2. Set `JWT_SECRET` to a new value (kicks out everyone).
3. Rotate `ADMIN_PASSWORD_HASH` (regenerate via `yarn hash-password`).
4. Audit recent commits in the repo for unexpected content changes.
