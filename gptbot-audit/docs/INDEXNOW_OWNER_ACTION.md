# IndexNow — Owner action

The IndexNow key file is **already published** at:

```
https://gptbot.uz/mrutks6jdnrob4r70zp8u7868a83lnim.txt
```

Content of the file is just the key itself:

```
mrutks6jdnrob4r70zp8u7868a83lnim
```

This satisfies the IndexNow ownership-verification step for **Bing, Yandex,
Seznam, Naver and Yep** (they all share the same IndexNow registry).

## To submit the current sitemap to IndexNow

The pinger script is opt-in and only runs when `INDEXNOW_KEY` is set. From a
machine with internet access:

```bash
cd /app/repo
yarn build
INDEXNOW_KEY=mrutks6jdnrob4r70zp8u7868a83lnim yarn tsx scripts/indexnow-ping.ts
```

Expected output:

```
[indexnow-ping] Pinging 48 URLs → https://api.indexnow.org/IndexNow
[indexnow-ping] HTTP 200 OK
[indexnow-ping] OK. Bing/Yandex/Seznam/Naver/Yep have been notified.
```

> **HTTP 202** is also a success per the spec — it means the URLs were
> accepted and queued for processing.

## When to re-run

- After every content publish (new money page or new blog article).
- After any URL change (slug rename — never silent, always via 301 redirect
  too).
- Once per month for refresh signals.

## Do NOT

- Rename the `mrutks6jdnrob4r70zp8u7868a83lnim.txt` file — it is the
  ownership token. Renaming it breaks IndexNow for every search engine that
  uses the IndexNow registry.
- Commit the key into any environment variable file — it is intentionally a
  public key (anyone can read it at `https://gptbot.uz/mrutks6jdnrob4r70zp8u7868a83lnim.txt`),
  but it should stay out of `.env` to avoid accidental rotation.
- Ping IndexNow for `/admin-tools/*`, `/api/*`, draft URLs, or 404 URLs. The
  pinger reads `dist/sitemap.xml`, so as long as the sitemap is clean (it is
  — verified by `scripts/tech-audit.ts`) this stays safe.
