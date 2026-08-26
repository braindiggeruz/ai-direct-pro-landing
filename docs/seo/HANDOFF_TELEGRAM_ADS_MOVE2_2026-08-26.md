# HANDOFF — Telegram advertising, Move 2

**You are picking this up cold. Read the whole file before touching anything.**
Everything below was measured on 2026-08-26. Nothing here is an assumption
unless it says so.

Your job: **write one Russian article, ship it to production, and verify it.**
Not a series. Not one page per keyword. One article.

---

## 0. Ten-second version

| | |
| --- | --- |
| Repo | `https://github.com/braindiggeruz/ai-direct-pro-landing` |
| Work here | `F:\Claude\gptbot-commercial-growth-20260825` (git worktree) |
| Branch | `seo/commercial-growth-2026-08-25b` — **already checked out, clean** |
| `origin/main` | `a3e37b7` — branch and main are the same commit |
| Production | deployment `8d6679fd`, source `010fd19` |
| Build for deploy | `npm run build:cf` — **never plain `npm run build`** |
| New URLs you create | exactly **1** |
| Credentials | `F:\Claude\cf-token.txt`, `F:\Claude\gh-token.txt` — see §7 |

The file to create: **`content/blog/ru/telegram-ads-ili-posevy-v-kanalah.json`**
→ serves at `https://gptbot.uz/ru/blog/telegram-ads-ili-posevy-v-kanalah/`

---

## 1. Why this article and not something else

`telegram ads` measures **6,600/mo** in Uzbekistan at competition 0.17,
`ads telegram` 1,000/mo, `telegram reklama` 70/mo at competition **0.08**,
`реклама в телеграм` 70/mo, `telegram ads узбекистан` 50/mo at CPC 1.61 —
roughly **7,900/mo** for the cluster. It is the only large digital-advertising
demand in this market: the 6,600/mo `реклама` head is outdoor and print
(billboards, banners, LED, lifts, metro), and `google ads` at 3,600/mo is
navigational to Google's own properties.

Two money pages already cover the **agency service** and the **cost** question
(rewritten and deployed 2026-08-26):

- `/ru/telegram-ads-uzbekistan/` — Russian hub
- `/uz/telegram-reklama/` — Uzbek hub

Discovery returned **85 advertising-relevant Russian tail phrases, nearly all at
10/mo**. They split into four intents. Your article owns exactly one of them:

**Buying placements — ~25 phrases, ~250/mo aggregate:**
`биржа рекламы телеграм`, `биржа рекламы в телеграм`, `биржа рекламы в телеграм
каналах`, `биржа рекламы тг`, `биржа телеграм реклама`, `биржа продажи рекламы в
телеграм`, `реклама в телеграм биржа`, `купить рекламу в телеграм`, `купить
рекламу телеграм`, `купить рекламу в телеграм канал`, `купить рекламу в телеграм
каналах`, `купить рекламу для телеграм канала`, `купить рекламу телеграм канала`,
`куплю рекламу в телеграм`, `реклама телеграм канала купить`, `реклама в телеграм
купить`, `закупка рекламы в телеграм`, `покупка рекламы в телеграм`, `покупка
рекламы телеграм`, `продажа рекламы в телеграм`, `продажа рекламы телеграм`,
`разместить рекламу в телеграм`, `официальная реклама в телеграм`, `официальная
реклама телеграм`, `встроенная реклама телеграм`.

**Why this is a separate article and not a section on the money page.** Someone
searching `биржа рекламы телеграм` wants to know **where and how to buy a post in
someone else's channel** — a market with exchanges, intermediaries and fraud.
Someone searching `telegram ads узбекистан` wants an agency. Putting both on one
page makes it answer two questions badly. This is the only reason a new URL is
justified here.

**Do not create a page per phrase.** Twenty-five pages at 10/mo is a doorway
farm. This site already carries a **frozen cluster of ~140 bot pages** built that
way, which `content/seo/demand-policy.json` marks FROZEN for earning zero clicks
in seventy days. Repeating it would be the worst possible outcome of this task.

### The SERP you are entering

`купить рекламу в телеграм`, measured 2026-08-26:

| # | Domain | What |
| --- | --- | --- |
| 1 | collaborator.pro | ad exchange |
| 3 | b2b.yandex.ru | Yandex guide |
| 5 | elama.ru | guide |
| **6** | **saytyaratish.uz** | **Uzbek competitor blog post — proof a .uz domain ranks here** |
| 7 | roistat.com | guide |
| 8 | ads.telegram.org | platform |
| 9 | telega.in | exchange |
| 11 | **spot.uz** | Uzbek media, cost of Telegram ads |
| 13 | adsell.io | exchange |
| 14 | unisender.com | *"10 бирж для рекламы"* |
| 15 | kwork.ru | freelance marketplace |
| 17 | secrets.tbank.ru | *"от 250 €"* |
| 18 | carrotquest.io | *"два способа: официальная платформа или посевы"* |
| 20 | topfacemedia.com | agency |

Mostly exchanges and Russian media guides. Two Uzbek domains rank. **Nobody
writes this for the Uzbekistan market** — that is the gap.

---

## 2. What the article must contain

Target length **1,800–2,400 words**. For calibration: `saytyaratish.uz` holds
rank 2 on `telegram reklama` with only **709 words**, so depth is not the lever —
being the only page written for this market is.

`h1`: `Telegram Ads или посевы в каналах: что выбрать бизнесу в Узбекистане`

Required sections, in this order:

1. **Решение за одну минуту** — a short list that resolves the choice before the
   reader scrolls. The site's articles open this way; keep the convention.
2. **Два механизма рядом** — official Telegram Ads vs direct channel deals
   (посевы). A table: who controls placement, how payment works, what is
   guaranteed, what is measurable, what happens if it fails.
3. **Как работают биржи** — collaborator.pro, telega.in, adsell.io as *examples of
   the mechanism*, not recommendations. What the intermediary actually does,
   what it charges for, escrow, and what it does not protect against. **Do not
   endorse or link any exchange as a partner.**
4. **Что можно проверить до покупки** — the fraud surface, with a concrete check
   for each: bought subscribers, dead channels, inflated ER, audience not in
   Uzbekistan, a channel that ran the same offer last week. This is the section
   the incumbents skip and the reason this page can rank.
5. **Что доступно бизнесу из Узбекистана сегодня** — the three entry routes and
   which minimum belongs to which cabinet (see §3 for the verified figures).
6. **Когда посевы лучше официальной платформы, и когда нет** — the honest
   comparison. Must contain real "do not do this" cases.
7. **Как считать результат** — what to measure for each mechanism and why
   subscriber count is not a business result.
8. **FAQ** — 4 to 6 questions drawn from the tail phrases above.

The tail phrases must appear **naturally inside prose and headings**. Do not
stuff. The head-term density gate is `< 2%`; you will be nowhere near it if you
write normally.

### Facts you may state, with attribution

All verified 2026-08-26. Keep the attribution and the date in the text.

| Fact | Source | How to phrase it |
| --- | --- | --- |
| Minimum CPM **0.1 Toncoin** | `ads.telegram.org/getting-started` | platform documentation |
| Ads show in public channels **from 1,000 subscribers** | same | platform documentation |
| Ad text limited to **160 characters** | `ads.telegram.org` | platform documentation |
| Budget can be increased any time, **cannot be decreased** on a submitted ad; unspent funds return to the balance | `ads.telegram.org/getting-started` | platform documentation |
| **Minimum bid 0.01 €** in Uzbekistan cabinets, lower than Russian ones; start budget **from 500 €** | `elama.ru/blog/zapuskayte-reklamu-telegram-ads-v-uzbekistane-s-elama/` | *reseller's published figure, not the platform's* |
| Entry via authorised reseller commonly quoted **from €250–2,000** | third-party publications | *what third parties publish; verify at launch* |
| Direct euro contract deposit quoted at **€2,000,000** | third-party publications | *belongs to the direct contract, not to the route a business here would take* |
| Telegram reach in Uzbekistan **25–27 million** | agency claims | *agency estimate, not a platform measurement* |

Put `ads.telegram.org/getting-started`, `ads.telegram.org` and the eLama page in
the article's `sources` array.

### Hard prohibitions

- **No invented GPTBot price.** No "от X сум", no package figures. Scope is
  agreed after the first conversation; the media budget is paid to the platform
  separately. This rule is absolute on this project.
- **Never write "официальный партнёр Telegram Ads".** Two ranking competitors
  (`tca-media.uz`, `meridians.uz`) say it about themselves. GPTBot is not one.
- No invented client count, project count, year founded, case study, review or
  rating. `content/global/site.json` has `"phone": ""` — there is no phone to
  publish.
- No guaranteed subscriber cost, lead cost or ranking.
- No `Offer`, `Review` or `AggregateRating` in `schemaTypes` — a gate fails on it.

---

## 3. Exact file format

Copy the shape from `content/blog/ru/telegram-bot-ili-mini-app.json`. Articles
are **directory-scanned** — creating the file is all the registration needed.

```jsonc
{
  "status": "published",
  "locale": "ru",
  "slug": "telegram-ads-ili-posevy-v-kanalah",
  "url": "/ru/blog/telegram-ads-ili-posevy-v-kanalah/",
  "title": "…",                         // unique across the site
  "description": "…",                   // unique, 120-160 chars
  "h1": "…",                            // exactly one H1, this field only
  "topicCluster": "telegram-ru",
  "targetMoneyPage": "/ru/telegram-ads-uzbekistan/",
  "keywords": ["купить рекламу в телеграм", "биржа рекламы телеграм", "закупка рекламы в телеграм", "посевы в телеграм каналах"],
  "intro": "…",
  "body": [ /* blocks, see below */ ],
  "faq": [ { "q": "…", "a": "…" } ],
  "cta": { "label": "…", "href": "https://t.me/XGame_changerx" },
  "internalLinks": [
    { "target": "/ru/telegram-ads-uzbekistan/", "anchor": "…", "locale": "ru", "type": "contextual" }
  ],
  "ogTitle": "…",
  "ogDescription": "…",
  "ogImage": "https://gptbot.uz/assets/blog/<existing-asset>-1200.webp",
  "canonical": "https://gptbot.uz/ru/blog/telegram-ads-ili-posevy-v-kanalah/",
  "hreflangRu": "/ru/blog/telegram-ads-ili-posevy-v-kanalah/",
  "robotsIndex": true,
  "robotsFollow": true,
  "author": "Борис Герасимов",
  "sources": [ { "title": "…", "url": "…", "note": "…" } ],
  "datePublished": "2026-08-26T00:00:00.000Z",
  "dateModified": "2026-08-26T00:00:00.000Z",
  "schemaTypes": ["Article", "FAQPage", "BreadcrumbList"],
  "createdAt": "2026-08-26T00:00:00.000Z",
  "updatedAt": "2026-08-26T00:00:00.000Z"
}
```

**`hreflangUz` must be absent.** There is no Uzbek counterpart. The renderer
emits `<link rel="alternate">` only when both sides exist — a single-locale
article is correct and a gate checks it.

### Body block types the renderer supports

Only these. Anything else is silently dropped.

`h2` · `h3` · `p` · `list` (`{"type":"list","items":[…]}`) · `table`
(`{"type":"table","headers":[…],"rows":[[…]]}`) · `quote` · `figure` · `image` ·
`toc` · `cta` (`{"type":"cta","text":"…","href":"…"}`) · `linkp`

`linkp` is the contextual-link block — **use it, not bare markdown links:**

```json
{"type": "linkp",
 "text": "Официальный маршрут и его пороги разобраны в {ads}. Если нужен сам запуск — {service}.",
 "links": [
   {"token": "ads", "target": "/ru/telegram-ads-uzbekistan/", "anchor": "материале про Telegram Ads в Узбекистане"},
   {"token": "service", "target": "/ru/telegram-ads-uzbekistan/", "anchor": "запуск под ключ"}
 ]}
```

`figure` is **optional** — 16 of 103 Russian articles have none. `ogImage` is
also optional (the audit only warns), but set it anyway: **reuse an existing
asset** from `public/assets/blog/`, do not generate images. If you use a
`figure`, every image needs a non-empty `alt` — a gate enforces it.

### Internal links — required, and bounded

- At least **2 outgoing** internal links (`too-few-internal-links` warns below 3).
- At least **1 incoming** link, or the article is an orphan. Add one `linkp` from
  `/ru/telegram-ads-uzbekistan/` pointing at the new article. **That is the only
  page you may edit to create an incoming link.**
- **Anchor rule:** no single anchor may be more than **60%** of all internal
  anchors pointing at a hub. `/ru/telegram-ads-uzbekistan/` currently sits at
  **57%** for the exact phrase `Telegram Ads в Узбекистане` — it is already close
  to the cap. **Your anchors to that hub must be descriptive, never the exact
  phrase.** Check with the snippet in §5 before committing.
- Do **not** add links from unrelated pages, and do **not** touch
  `/uz/blog/chatgpt-…-yuklab-olish/` — its intent is "download the app".

### Register it as a spoke

Add to `content/seo/intent-manifest.json`, cluster `id: "telegram-ru"`, whose
`spokes` array is currently empty:

```json
{ "url": "/ru/blog/telegram-ads-ili-posevy-v-kanalah/",
  "ownsIntent": "buy an advertising placement inside someone else's Telegram channel, and tell that apart from the official ad platform",
  "primaryKeyword": "купить рекламу в телеграм" }
```

Registering it activates these gates automatically: the spoke must link to its
hub, **the hub must link back**, the spoke needs `Article` + `BreadcrumbList`
schema, a CTA, a self-referencing canonical, and a title and description unique
inside the cluster.

Then add the measured demand to `content/seo/demand-policy.json`
`approvedKeywords` — every row needs `keyword`, `volumePerMonth` (integer),
`source`, `measuredAt`, and a `note` if it carries `correctedAt`:

```json
{ "keyword": "купить рекламу в телеграм", "volumePerMonth": 10, "competition": "LOW",
  "source": "OpenSEO/DataForSEO location 2860, Telegram tail discovery 2026-08-26 (132 unique keywords, 8 live SERPs)",
  "measuredAt": "2026-08-26",
  "note": "10/mo alone. Recorded as the named entry point of a ~25-phrase buying-placements family aggregating ~250/mo; the article targets the family, not this phrase." }
```

The demand gate only scores `pageType` `money` and `niche`, so a blog article is
not blocked by it — but record the number anyway. Someone will ask later.

---

## 4. Uzbek — do not write one yet

`telegramda reklama`, `telegram kanal reklama` and `telegram reklama narxi` all
return **no measurable volume**. Only `telegram reklama` (70/mo) exists, and the
hub already owns it.

The trigger for an Uzbek article is **not** a keyword-tool number — it is Uzbek
tail queries appearing in Search Console around 2026-09-22, which the planner
cannot see. Do not pre-empt it.

**If you do write Uzbek text anywhere:** `o'` and `g'` use **U+2018** (`‘`),
tutuq belgisi uses **U+2019** (`’`), and an ASCII `'` between two letters **fails
a gate**. The four Uzbek money pages are held to this with no exemption.

---

## 5. Verify before you commit

Run from `F:\Claude\gptbot-commercial-growth-20260825`.

```bash
node --import tsx --test tests/seo-page-integrity.test.ts tests/seo-commercial-coverage.test.ts tests/seo-cluster-quality.test.ts tests/seo-intent-manifest.test.ts tests/seo-demand-gate.test.ts tests/seo-link-graph.test.ts
```

Then:

```bash
npx tsc -b && npx eslint . && npm test && npm run seo:audit && npm run scan:secrets
```

Expected before your change: `npm test` **346/346**, the six SEO files
**74/74**, `seo:audit` 0 critical with RU/UZ pairs 44 OK / 0 broken,
`scan:secrets` clean. Anything else means you broke something.

**Known pre-existing failure, not yours, do not fix:**
`tests/lead-radar-api.test.ts` — *"Telegram Business approval … 409 !== 201"*.
It fails in its own author's worktree too. Leave it.

Anchor-concentration check — run this **before** committing:

```bash
python -c "
import json,os
from collections import Counter
hub='/ru/telegram-ads-uzbekistan/'
a=[]
for base in ('content/pages','content/blog'):
    for r,_,fs in os.walk(base):
        for f in fs:
            if not f.endswith('.json'): continue
            d=json.load(open(os.path.join(r,f),encoding='utf-8'))
            for l in d.get('internalLinks',[]) or []:
                if l.get('target')==hub and l.get('anchor'): a.append(l['anchor'].strip().lower())
            for b in (d.get('bodyBlocks') or d.get('body') or []):
                for l in (b.get('links') or []):
                    if l.get('target')==hub and l.get('anchor'): a.append(l['anchor'].strip().lower())
c=Counter(a); top=c.most_common(1)[0]
print('n=%d top=%r share=%.0f%% (must stay <=60%%)'%(len(a),top[0],100*top[1]/len(a)))
"
```

---

## 6. Ship it

Commit style: imperative subject, a body that explains **why** with the measured
numbers, and this trailer:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Stage explicitly — **never `git add .`**. Do not commit `dist/`, exports,
screenshots or logs.

### The trap that will bite you

**Two branches deploy into one Cloudflare Pages project and silently overwrite
each other.** This already happened today: an SEO release was deployed, then the
Lead Radar author deployed a branch without those commits, and the entire SEO
release vanished from production. No error. It was caught only by fetching a
live page and grepping for a marker.

So the deploy is always: **`main` merged with the live Lead Radar tree.**

```bash
# 1. what is actually live right now
export CLOUDFLARE_API_TOKEN="$(tr -d ' \r\n' < /f/Claude/cf-token.txt)"
export CLOUDFLARE_ACCOUNT_ID=14ce9e04574f2e6d825e56ee603e5cd5
node_modules/.bin/wrangler pages deployment list --project-name ai-direct-pro-landing
```

Note the newest **Source** SHA and its **Id** — the Id is your rollback target,
write it into the release doc. The Lead Radar branch lives at
`F:\Claude\gptbot-ui-release-20260824` (`git log --oneline -1` there gives its
tip; it was `2eb9a2a` when this was written). **Never edit that worktree.**

```bash
# 2. integration = main + the live Lead Radar tree
git checkout tmp/seo-lead-radar-integration
git reset --hard main
git merge --no-ff -m "merge: integrate the live Lead Radar tree for deploy" <live-lead-radar-sha>

# 3. sanity: all 14 must be present or the deploy strips live config
grep -c "^LEAD_RADAR_" wrangler.toml     # expect 14

# 4. build — build:cf, never plain build
npm run build:cf
ls dist/admin                             # must exist, or the admin app is wiped

# 5. deploy the exact SHA
node_modules/.bin/wrangler pages deploy dist \
  --project-name=ai-direct-pro-landing --branch=main \
  --commit-hash="$(git rev-parse HEAD)"
```

`npm run build` alone omits `apps/bormi-admin`, leaving `dist/admin` missing —
deploying that removes the Owner Control Center and the Lead Radar admin UI from
production. `wrangler pages deploy` also rewrites the project's plain `[vars]`
from `wrangler.toml`, so a tree without the 14 `LEAD_RADAR_*` variables deletes
them live.

### After deploying

```bash
curl -s https://gptbot.uz/ru/blog/telegram-ads-ili-posevy-v-kanalah/ -o /dev/null -w "%{http_code}\n"
curl -s https://gptbot.uz/uz/sayt-yaratish/ | grep -c "Sayt yaratish xizmati nimalarni"   # 1 = SEO release intact
curl -s -o /dev/null -w "%{http_code}\n" https://gptbot.uz/admin/lead-radar               # 302 = Lead Radar intact
curl -s https://gptbot.uz/sitemap.xml | grep -c "telegram-ads-ili-posevy"                 # 1 = in the sitemap
```

Both marker checks must pass. A deployment id proves nothing about content.

Then speed up discovery:

```bash
INDEXNOW_KEY=mrutks6jdnrob4r70zp8u7868a83lnim npx tsx scripts/indexnow-ping.ts
```

That notifies Bing and Yandex — Yandex matters in Uzbekistan. **Google ignores
IndexNow**, so also request indexing manually in Search Console → URL Inspection
for the new article and for `/ru/telegram-ads-uzbekistan/` (the hub gains an
outgoing link and should be recrawled).

Finally append a dated section to
`docs/seo/RELEASE_2026-08-25_COMMERCIAL_GROWTH.md`: deployment id, immutable
`*.pages.dev` URL, source SHA, rollback target, and the canary result.

---

## 7. Credentials

- `F:\Claude\cf-token.txt` — Cloudflare API token, scope *Account → Cloudflare
  Pages → Edit*. It cannot list accounts, so **always export
  `CLOUDFLARE_ACCOUNT_ID=14ce9e04574f2e6d825e56ee603e5cd5`** or wrangler fails
  with *"Failed to automatically retrieve account IDs"*.
- `F:\Claude\gh-token.txt` — GitHub token. **`gh auth login --with-token` will
  reject it** for missing the `read:org` scope. Push with a one-shot credential
  helper instead:

```bash
cat > /tmp/cred.sh <<'EOF'
#!/bin/sh
[ "$1" = "get" ] || exit 0
printf 'protocol=https\nhost=github.com\nusername=braindiggeruz\npassword=%s\n' \
  "$(tr -d ' \r\n' < /f/Claude/gh-token.txt)"
EOF
chmod +x /tmp/cred.sh
git -c credential.helper= -c credential.helper='!sh /tmp/cred.sh' push origin main:main
```

Windows Credential Manager holds a token for a **different** account
(`cakecityuz-lab`) with no write access — a plain `git push` returns 403. The
empty `credential.helper=` in front is what clears it.

Never print a token, never write one into git config, never commit one. Both
files sit outside the repository on purpose.

---

## 8. Do not do these

1. Do not create more than one URL.
2. Do not create a page per tail phrase.
3. Do not touch `/uz/sayt-yaratish/`, `/uz/blog/marketing-nima/`,
   `/uz/blog/smm-nima/` or `/uz/gpt-uzbek-tilida/` — they are inside a
   measurement window that closes **2026-09-22**, and edits destroy the read.
4. Do not touch anything Lead Radar: `functions/platform/lead-radar/*`,
   `src/admin/**`, `tests/lead-radar-*`, `wrangler.toml` bindings, or the
   `F:\Claude\gptbot-ui-release-20260824` worktree.
5. Do not prune, noindex, merge or redirect any AI/ChatGPT page. There is no
   crawl-budget evidence and that cluster carries most of the site's traffic.
6. Do not expand the frozen Russian pages: `/ru/smm-prodvizhenie-tashkent/`,
   `/ru/kontekstnaya-reklama-tashkent/`, `/ru/digital-marketing-tashkent/`,
   `/ru/internet-reklama-tashkent/`, `/ru/marketingovyi-audit-tashkent/`,
   `/ru/lokalnoe-seo-tashkent/`.
7. Do not build for `google ads` (3,600/mo, navigational to Google's own
   properties), `konversiya nima` (140/mo — means linguistics and military
   conversion in Uzbek), `воронка продаж` (210/mo — Russian media wall, no .uz
   domain in the top 20) or `лидогенерация` (40/mo, same wall).
8. Do not re-buy OpenSEO research. Everything needed is in this file and in
   `docs/seo/TELEGRAM_ADS_ROADMAP_2026-08-26.md`. **968 credits remain**; a rank
   tracker run costs 228. Do not run the tracker before **2026-09-06**.
9. Do not force-push, rebase published history, or use `git stash` as the only
   copy of anything.
10. Do not enable Cloudflare Git auto-deploy, reconnect Railway, or restore n8n.

---

## 9. Done means

- One new file: `content/blog/ru/telegram-ads-ili-posevy-v-kanalah.json`.
- Registered as the `telegram-ru` spoke; the hub links to it and it links back.
- Anchor concentration on `/ru/telegram-ads-uzbekistan/` still **≤ 60%**.
- `npm test` 346/346, the six SEO files pass, `seo:audit` 0 critical,
  `scan:secrets` clean, `tsc -b` and `eslint .` clean.
- Committed, pushed to `origin/main`, deployed from an integration containing the
  live Lead Radar tree.
- Live checks: article 200 and in the sitemap; `/uz/sayt-yaratish/` marker still
  1; `/admin/lead-radar` still 302.
- IndexNow pinged; Search Console indexing requested for the article and the hub.
- Release doc updated with deployment id, source SHA and rollback target.

## 10. What happens after — and when to stop

**Signal:** impressions on any `биржа` / `купить рекламу в телеграм` phrase in
Search Console, country = Uzbekistan, within 7–14 days of recrawl.

**Kill rule — read at six weeks.** If the article has earned **zero impressions
on any phrase in that family**, the tail does not aggregate on this domain. Then:
do **not** write the planned follow-up
`/ru/blog/kak-vybrat-telegram-kanal-dlya-reklamy/`, and move the effort to §5 of
`docs/seo/TELEGRAM_ADS_ROADMAP_2026-08-26.md` — the OLX listing, the
`marketing.uz` pitch, and citations. Those are placements on pages that already
rank for the target query, and they do not depend on writing more.

Read the roadmap before deciding anything beyond this one article.
