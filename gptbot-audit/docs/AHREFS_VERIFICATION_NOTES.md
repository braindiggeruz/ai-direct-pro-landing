# Ahrefs verification notes

Use this checklist when Ahrefs Site Audit still reports an issue that we have
already fixed in the repo and deployed. Order matters — every item below has
once been the actual root cause of a "Ahrefs says it's broken but the live
HTML is clean" stand-off on this project.

## 1. Confirm code-side is correct

```bash
# from /app/repo
yarn build
npx tsx scripts/tech-audit.ts
```

`tech-audit.ts` mirrors every P0 check Ahrefs does. If it exits 0 with all
counters at zero, the code-side is good.

## 2. Confirm what Cloudflare actually serves

```bash
curl -sI https://gptbot.uz/                       # 200
curl -sI https://gptbot.uz/sitemap.xml            # 200
curl -sI https://gptbot.uz/admin-tools/login      # 200 + X-Robots-Tag: noindex, nofollow
curl -sI https://gptbot.uz/random-test-url-123    # 404
curl -s  https://gptbot.uz/sitemap.xml | grep -c '<url>'   # 48

# Tracking presence on public, absence on admin (raw HTML)
curl -sL https://gptbot.uz/ | grep -E "GTM-NLR4WFX8|analytics\.ahrefs\.com|G-V87YFL96C7"
curl -sL https://gptbot.uz/admin-tools/login | grep -E "GTM-NLR4WFX8|analytics\.ahrefs\.com|G-V87YFL96C7"   # should be empty
```

## 3. Common Ahrefs UI gotchas

1. **Stale crawl.** Ahrefs only re-scores after a new crawl. Open
   *Site Audit → gptbot.uz → ⋯ → New crawl* and wait. Health Score does not
   change until the new crawl completes.
2. **Project URL vs canonical URL mismatch.** If the Ahrefs project is set to
   `https://www.gptbot.uz` while every canonical we emit is `https://gptbot.uz`,
   Ahrefs will treat the two as separate sites. Fix in
   *Site Audit → Project settings → URL*.
3. **Ahrefs Web Analytics key not bound to this project.** Even with the
   `<script src="https://analytics.ahrefs.com/analytics.js" data-key="Nnyl6F9bFd2XBzhizTHSVg">`
   tag live, Ahrefs only counts events if that key is registered to the
   `gptbot.uz` property in *Web Analytics → Project settings*.
4. **Ahrefs verifies presence by raw HTML.** If you add tracking via
   client-side JS only, Ahrefs's verifier may not see it. The repo ships the
   tag as a raw `<script>` in `<head>` for exactly this reason.

## 4. If Ahrefs still flags an issue after a fresh crawl

- Capture the exact URL and the exact issue text from Ahrefs.
- `curl -sL <url>` and grep for the disputed feature (e.g. hreflang, JSON-LD,
  alt attribute).
- Compare with `dist/<path>/index.html` in the repo. If they match and the
  feature is present, the issue is most likely an Ahrefs UI-cache or a project
  scope misconfiguration — open a ticket with Ahrefs Support and attach the
  curl output.
- Do not rewrite the code without first proving via curl that the raw HTML
  served by Cloudflare is missing the feature.
