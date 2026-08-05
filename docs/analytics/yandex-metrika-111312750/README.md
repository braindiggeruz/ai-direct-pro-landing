# Yandex Metrika — counter 111312750

The privacy contract referenced from `scripts/analytics-metrika.ts`. Everything
below is enforced by `tests/yandex-metrika.test.ts` (60 assertions); this file
explains *why* each rule exists and what an owner must decide before changing it.

Counter: **111312750**. The number is public — it ships in every page.

---

## 1. Where the tag lives

The tag is an **inline block in the document head**, not a React module, because
only the homepage and `/admin-tools/*` are React documents. The 115 money pages,
both blog indexes and all 133 articles are standalone prerendered HTML files that
never load `src/main.tsx`. A React-mounted counter would miss the entire indexed
surface.

| Surface | Source of the tag | Result |
| --- | --- | --- |
| `/` (homepage) | `index.html` → `vite build` → `scripts/prerender-home.ts` | tag present |
| 115 money pages, `/ru/gpt-chat/`, `/uz/…` | `scripts/prerender.ts` (`${METRIKA_HEAD}`) | tag present |
| Blog indexes + 133 articles | `scripts/prerender-blog.ts` (`${METRIKA_HEAD}`) | tag present |
| `/admin-tools/*` | `functions/admin-tools/[[path]].ts` strips `[data-tag="ym"]` | **no tag** |
| `/admin/*` (Bormi console) | `apps/bormi-admin/index.html` — never had it | **no tag** |
| Telegram Mini App | `apps/market-mini-app/index.html` — never had it | **no tag** |
| `public/404.html` | static file, carries no analytics at all | **no tag** — see §7 |

`METRIKA_HEAD` in `scripts/analytics-metrika.ts` is the single source of truth.
The copy in `index.html` is compared against it **byte for byte** by the test
suite, so the two cannot drift. That is also why the block in `index.html` is
unindented.

The `data-tag="ym"` attribute follows the contract the site already uses for GTM,
gtag and the Meta Pixel: one attribute the admin catch-all Function can remove
with a single `HTMLRewriter` selector.

---

## 2. Where it refuses to run

Two independent guards, both inside the tag:

**Hostname.** Only `gptbot.uz` and `www.gptbot.uz`. `localhost`, `127.0.0.1`,
every `*.pages.dev` preview and the Mini App host return before anything is
created — no `window.ym`, no `tag.js` request, no `__ymBooted`.

**Path prefix.** `/admin`, `/admin-tools`, `/api`, `/auth`, `/oauth`,
`/callback`, `/cabinet`, `/account`, `/reset-password`. Matching is exact-or-
followed-by-`/`, so a public money page whose slug merely starts with the same
letters (`/ru/administrirovanie-bota/`) is still measured. The check runs again
on every SPA navigation, so routing *into* a denied path reports nothing.

`/admin-tools/*` is covered twice on purpose: the client guard refuses to boot,
and the edge Function removes the block entirely so the admin shell never even
requests `mc.yandex.ru`.

---

## 3. What actually leaves the page

**Pageviews are manual.** `init` is called with `defer:true`, which suppresses
Metrika's own automatic first hit. Every pageview is then sent explicitly with a
URL this code rebuilt.

**URLs are rebuilt, never forwarded.** A hit URL is `origin + pathname` plus a
closed marketing allowlist — `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content`, `utm_term`, `yclid`, `gclid`. The fragment is dropped by
construction. Tokens, auth codes, `initData`, session ids, emails, phone numbers,
names, user ids, prompts, messages and search text can therefore never reach
Metrika even if they appear in the address bar.

**The referer gets the same treatment**, sanitised without a base URL so anything
that is not already absolute is dropped instead of being resolved against this
origin. An unparseable referer is omitted rather than guessed.

**Repeat suppression.** An identical normalised URL twice in a row is a rerender,
not a pageview. SPA hits are delayed 150 ms so the route can commit its
`document.title` first.

**Goals carry a name and nothing else.** There is no fourth argument to `ym()`
anywhere in this integration, so there is no slot a user value could occupy.

Never called: `setUserID`, `getClientID`, `userParams`, `firstPartyParams`,
`firstPartyParamsHashed`, `params()`. Adding any of them is an **owner decision**,
not a code change — they turn an anonymous counter into an identity system.

The tag never reads `.value`, `FormData`, `localStorage`, `sessionStorage`,
`document.cookie`, `innerText` or `textContent`.

---

## 4. Goal catalogue (closed)

| Goal | Fired from | When |
| --- | --- | --- |
| `telegram_cta_click` | head block, delegated click | any `t.me/` or `tg:` link |
| `gpt_chat_open` | head block, delegated click | `/gpt-chat/`, `/gpt-uzbek-tilida/` |
| `pricing_cta_click` | head block, delegated click | slug contains `tarify` or `narx` |
| `lead_form_submit_success` | `src/calculator/CalculatorApp.tsx` | **only after the server accepted the lead** |

The last one is why `src/lib/analytics/yandexMetrika.ts` exists: markup cannot
express "fire after the response came back ok". A submit *click* is not a lead,
so the goal sits behind the `throw new Error('lead rejected')` check — a test
asserts that ordering. The wrapper takes no parameters and is a no-op when `ym`
is missing, blocked or throwing.

Create these four goals in the Metrika interface as **JavaScript-event** goals
with exactly these identifiers. Nothing else in the code will fire.

---

## 5. Webvisor masking

Webvisor is on in the counter settings, so every surface that renders something a
visitor typed or that a model generated is masked in the markup:

| Class | Where |
| --- | --- |
| `ym-hide-content` | `#gpt-chat-root` mount point (`scripts/prerender.ts`), `AiChatConsole.tsx`, `AiChatMessageList.tsx` |
| `ym-disable-keys` | `AiChatInput.tsx` textarea, `ImagePromptTool.tsx` textarea, calculator name + contact fields |
| `ym-disable-submit` | calculator lead form, `ImagePromptTool.tsx` form |

The chat **mount point** carries `ym-hide-content`, not just the React root
inside it, so the masking survives React replacing the element's children.

`ym-record-keys` appears nowhere and must not be added — a test fails if it is.

---

## 6. CSP

Metrika contributes exactly one origin, `https://mc.yandex.ru`, to three
directives:

- `script-src` — `tag.js`
- `connect-src` — hits and Webvisor uploads
- `frame-src` — the counter's sync frame

The `noscript` pixel is already covered by the existing `img-src https:`. No
wildcard (`*.yandex.*`), no new `'unsafe-inline'` — the inline block reuses the
one GTM already required.

The policy is written in **two** places that must stay identical:
`public/_headers` (the fallback) and `scripts/generate-robots.ts` (which emits
`dist/_headers` at build time and is what production actually serves). The test
suite checks both.

---

## 7. Known, deliberate gaps

**`public/404.html` is not measured.** It is a static hand-written file that
carries no analytics at all — GTM, gtag and the Meta Pixel are absent from it
too. Metrika was not added there in order to keep that file's existing
convention. Adding it would give broken-link reporting in Metrika and carries no
privacy cost (a 404 URL is already public), but it is a separate decision and a
separate change.

**`ecommerce: 'dataLayer'`** is declared in `init` because GTM already owns
`window.dataLayer`, and the tag preserves whatever is in it rather than replacing
it. Nothing in this repository currently pushes an ecommerce event, so the
setting is inert until someone does.

---

## 8. How to verify

```bash
npm run test:metrika
```

For the edge behaviour (CSP headers and the admin strip), build and serve the
real output:

```bash
npm run build
npx wrangler pages dev dist --port 8788
```

Then a public page must return `Content-Security-Policy` containing
`https://mc.yandex.ru` and carry two `data-tag="ym"` occurrences, while
`/admin-tools/` must carry zero. On a non-production hostname the page must load
with `window.ym === undefined` and zero requests to `mc.yandex.ru`.
