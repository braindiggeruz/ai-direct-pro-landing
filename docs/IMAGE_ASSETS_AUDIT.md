# Image Assets Audit — 2026-06-03 emergency fix

Live check after deploy of commit `b888310` to Cloudflare Pages project
`ai-direct-pro-landing` (production alias `https://gptbot.uz`).

## Status

| Asset path                       | Used on                                         | Live status | In repo | In dist | Action |
|----------------------------------|-------------------------------------------------|-------------|---------|---------|--------|
| `/assets/landing/1.png`          | Hero (homepage)                                 | 200         | yes     | yes     | OK     |
| `/assets/landing/2.png`          | Header logo, Footer, DemoChat, Solution, Hero, favicon | 200  | yes     | yes     | OK     |
| `/assets/landing/3.png`          | Pain section                                    | 200         | yes     | yes     | OK     |
| `/assets/landing/4.png`          | Solution section                                | 200         | yes     | yes     | OK     |
| `/assets/landing/5.png`          | HowItWorks section (lazy)                       | 200         | yes     | yes     | OK     |
| `/assets/landing/6.png`          | Offer section (lazy)                            | 200         | yes     | yes     | OK     |
| `/assets/landing/7.png`          | Niches section (lazy)                           | 200         | yes     | yes     | OK     |
| `/assets/landing/8.png`          | FinalCTA section (lazy)                         | 200         | yes     | yes     | OK     |
| `/assets/blog/1.png`             | Blog ogImage (1 article)                        | 200         | yes     | yes     | RESTORED (was 404) |
| `/favicon.svg`                   | <link rel="icon">                               | 200         | yes     | yes     | RESTORED (was 404) |
| `/icons.svg`                     | Inline SVG sprite                               | 200         | yes     | yes     | RESTORED (was 404) |

## Findings

* Hero image, problem section image, AI manager/Solution image, FinalCTA
  image and all niche/offer visuals on the public homepage are intact.
* The owner-reported "картинки ушли" was caused entirely by the stale
  Cloudflare Pages deployment (commit `9b250b46`, an `ad_hoc` direct upload
  from 2026-06-01 that predated `0adcb47 chore(seo): upload image 1.png`
  and several other content commits). Re-deploying `main` shipped every
  referenced asset to `/dist/assets/*` and Cloudflare static handler.
* No image references in `content/*.json` point to deleted/orphan files.
* No reference to `frontend/public/...`, `preview.emergent`, or any old
  Emergent-runtime paths remains.

## No-action items

* Drag-and-drop uploads from the admin (`/api/images/upload`) write to
  `public/assets/blog/` and `public/assets/seo/` via the GitHub Contents
  API, then become live on the next deploy.
* The lazy-loaded screenshots (`5.png`–`8.png`) report 0×0 in a Playwright
  capture above-the-fold because `loading="lazy"` defers them until the
  user scrolls. They return 200 on direct HTTP fetch. Not a bug.

## Conclusion

GPTBOT IMAGE ASSETS: RESTORED. No image is broken, missing, or pointing to
a deleted path. Homepage visuals match the design that existed before the
stale ad_hoc deployment took over.
