# Ahrefs Web Analytics — install via Google Tag Manager (owner steps)

## Status on gptbot.uz (checked from production HTML)

- GTM container installed on site: **NO**
- GTM container ID found: **none** (no `GTM-XXXX`, no `googletagmanager.com/gtm.js`, no `<noscript>` `ns.html` iframe)
- Direct Google Analytics 4 (`gtag.js`, ID `G-V87YFL96C7`) is loaded, but **that is not GTM**.
- Direct Ahrefs `<script>` tag is currently present in `<head>` of public pages as a fallback (data-key `Nnyl6F9bFd2XBzhizTHSVg`). Leave it as-is until GTM tag is published and confirmed by Ahrefs.

**Action required from owner:** either
1. Provide the GTM container ID (`GTM-XXXXXXX`) so it can be added to the site, **or**
2. If a GTM container already exists for this property, give an Editor invite for the container so the Ahrefs tag can be created via the GTM UI, **or**
3. Follow the manual steps below yourself.

---

## Manual install steps in Google Tag Manager

### Prerequisite — GTM container must be on the site
If you have not installed a GTM container yet:
1. Go to https://tagmanager.google.com → Create Account → Container → Web.
2. Copy the two GTM snippets GTM gives you (`<script>` for `<head>` and `<noscript>` for `<body>`).
3. Send the GTM container ID (`GTM-XXXXXXX`) so it can be added to the repo's `index.html` and prerender templates. Direct Ahrefs `<script>` should then be removed to avoid double-counting.

Once the container is live on the site, continue below.

### Create the Ahrefs Custom HTML tag

1. Open https://tagmanager.google.com → select the `gptbot.uz` container.
2. **Tags → New**.
3. Tag name: `Ahrefs Web Analytics`.
4. **Tag Configuration → Custom HTML** → paste:
   ```html
   <script>
     var ahrefs_analytics_script = document.createElement('script');
     ahrefs_analytics_script.async = true;
     ahrefs_analytics_script.src = 'https://analytics.ahrefs.com/analytics.js';
     ahrefs_analytics_script.setAttribute('data-key', 'Nnyl6F9bFd2XBzhizTHSVg');
     document.getElementsByTagName('head')[0].appendChild(ahrefs_analytics_script);
   </script>
   ```
5. **Triggering → All Pages**.
6. Add an exception so admin pages are NOT tracked:
   - **Triggering → Add Exception → New Trigger**.
   - Trigger type: **Page View**.
   - Fire on **Some Page Views** where `Page Path` **starts with** `/admin-tools/`.
   - Save → assign as exception on the Ahrefs tag.
7. Save the tag.
8. **Submit → Publish** (give it a version name like `Add Ahrefs Web Analytics`).

### Verify
1. Open https://gptbot.uz/ in an incognito tab.
2. View source: should show the inline GTM Custom HTML snippet (or the loaded `analytics.ahrefs.com/analytics.js` request in DevTools → Network).
3. In Ahrefs Web Analytics → project settings → click **Recheck installation**.
4. Once Ahrefs reports verified, you may optionally ask the engineer to remove the direct `<script src="https://analytics.ahrefs.com/analytics.js" ...>` tag from `index.html` and `scripts/analytics-snippet.ts` so the script is only fired by GTM.

### Important
- Ahrefs `data-key` is `Nnyl6F9bFd2XBzhizTHSVg` (lowercase L between `Ny` and `6`). The variant `NnyI6F9bFd2XBzhizTHSVg` (capital I) is a typo and must not be used.
- Do NOT add the Ahrefs Custom HTML tag in GTM AND keep the direct `<script>` in `index.html` long-term — pick one source of truth once GTM is confirmed.
