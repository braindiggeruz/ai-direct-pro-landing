# Bing / Yandex Indexing Plan — GPTBot

Bing and Yandex together cover ~30–40 % of Russian-speaking search
traffic in Uzbekistan. The Uzbek-language audience uses Yandex more
heavily than the global average, so this plan is not optional.

## Bing Webmaster Tools

1. Sign up / sign in at https://www.bing.com/webmasters using the same
   Google account verified in GSC — Bing supports "Import from GSC"
   which auto-verifies the domain in seconds. Use it.
2. After import, go to **Sitemaps** → confirm `sitemap.xml` is loaded.
   Re-submit manually if the import did not pull it.
3. **URL Inspection → Submit URLs** for the same Day-0 priority list as
   the GSC plan (Bing allows up to 10 000 URLs/day on verified domains).
4. **Crawl Control**: set the schedule to *Bing decides* unless you see
   crawl-rate complaints. Cloudflare zone has no rate-limit rule that
   would block Bingbot — leave it default.
5. **Backlinks** tab: monitor Uzbekistan-origin referring domains. Bing
   surfaces them faster than GSC, useful for the local link-building
   loop.
6. **Site Scan**: run once a week for the first month. Bing flags
   technical issues (missing alt, slow LCP, broken canonical) that
   GSC sometimes misses.

## Yandex Webmaster (Яндекс.Вебмастер)

1. Sign in at https://webmaster.yandex.com/ with a Yandex account.
   Verify `https://gptbot.uz` by uploading the verification HTML file
   to the repo (`public/yandex_<hash>.html`) — DNS TXT also works but
   keeping the file in repo means every redeploy retains verification.
2. **Indexing → Sitemap files**: add `https://gptbot.uz/sitemap.xml`.
3. **Indexing → Re-crawl pages**: queue the same priority list. Yandex
   allows ~20 URLs/day on a new verified domain, grows over time.
4. **Regions** (very important for ru.gptbot.uz / uz.gptbot.uz):
   - Site region: **Tashkent**.
   - Add geo-attributes "Uzbekistan", "Tashkent".
   - This is the single biggest local-SEO lever on Yandex — it changes
     ranking weights for queries from Uzbekistan IPs.
5. **Quality → Site quality index** (XИК): track weekly. Yandex
   penalises thin content faster than Google, so keep the existing
   bodyBlocks ≥ 4 paragraphs + 5 FAQ items rule.
6. **Search queries** tab: filter by region = Узбекистан. Track the
   same RU + UZ keyword set as GSC.

## IndexNow (Bing + Yandex shared protocol)

Both Bing and Yandex support IndexNow — a real-time push protocol that
notifies them of new/updated URLs without waiting for the next crawl.

- Key file (one-time): generate a 32-char hex key, save it at
  `public/<key>.txt` containing only the key string. Cloudflare deploys
  it as a static asset.
- After each content publish, hit
  `https://api.indexnow.org/IndexNow?url=<url>&key=<key>` from a build
  step or from the admin (cheap, no auth, fire-and-forget).
- Recommended: wire into `functions/api/content/index.ts` POST handler
  so every save automatically pings IndexNow once the GitHub commit
  succeeds. (Not done in this sprint — added to the backlog.)

## Do not
- Do not buy "bulk URL indexing" services for either engine. Both treat
  this as spam and can manually de-list the domain.
- Do not request indexing for noindex pages (`/admin-tools/*`,
  `/404.html`). They have correct `X-Robots-Tag` / meta and should stay
  out of all three engines.
- Do not change Yandex region after it is set — frequent changes
  trigger ranking churn for up to 60 days.
