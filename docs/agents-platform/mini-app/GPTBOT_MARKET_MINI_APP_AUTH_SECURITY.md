# GPTBot Market Mini App authentication and security

## Trust model

Telegram launch data authenticates a Telegram user. It does not authorize a
role, organization, store, order or handoff.

```text
raw initData
  -> integrity + freshness validation
  -> Telegram user id
  -> existing telegram identity
  -> server lookup of storefront session / active membership / store / pilot
  -> short-lived Mini App session
  -> authorization repeated by the domain service on every sensitive request
```

Client values such as `mode=seller`, `role`, `storeId`, route path,
`start_param`, query string or local state are untrusted navigation hints.

## Official protocol basis

The design uses only Telegram's official protocol documentation:

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps) defines launch
  methods, `initData`, theme/viewport APIs and server validation.
- [Telegram Bot API — WebAppInfo and File](https://core.telegram.org/bots/api#webappinfo)
  defines HTTPS Web App URLs and server-side file resolution.

Telegram explicitly warns that `initDataUnsafe` must not be trusted and that
raw `Telegram.WebApp.initData` must be validated on the bot server. Telegram
also recommends checking `auth_date` to reject old launch data.

## `initData` validation contract

The future server validator must:

1. accept only the raw query string from `Telegram.WebApp.initData`, bounded to
   8 KiB; never accept the parsed `initDataUnsafe` object as proof;
2. parse strict UTF-8 form/query encoding; reject missing/duplicate `hash`,
   missing `auth_date`, missing/malformed `user`, unsafe integers, duplicate
   keys and unexpected decoding failures;
3. remove `hash`, sort the remaining received `key=value` fields
   alphabetically and join with line feed (`0x0A`) exactly as Telegram
   documents;
4. derive `secret_key = HMAC-SHA-256(key="WebAppData",
   message=bot_token)`;
5. compute `HMAC-SHA-256(key=secret_key, message=data_check_string)`, encode as
   lower-case hex and compare with `hash` in constant time;
6. accept only the configured `@gptbot_market_bot` token/identity; test and
   production bot credentials are never interchangeable;
7. enforce `auth_date` not in the future beyond 30 seconds clock skew and no
   older than five minutes at exchange. Five minutes is a proposed risk bound,
   not a Telegram constant; it limits stolen-launch replay while tolerating a
   normal WebView start;
8. validate the decoded user id as a positive Telegram-safe integer string;
9. never log raw `initData`, its hash/signature, query id, Telegram id, profile
   fields or derived secret;
10. use fixed official/current captured test vectors, including the current
    optional `signature` field, before release. Any canonicalization ambiguity
    fails closed.

The Ed25519 third-party validation method documented by Telegram is not needed
for the first-party BFF because the BFF already owns the bot token. It can be
evaluated later for a separated auth service, never as an ad-hoc fallback.

## Session architecture

### Exchange

`POST /api/market/v1/session/exchange` validates launch data, resolves or
creates the existing `telegram` identity, treats `start_param` only as a
bounded route/store hint, then queries current storefront/membership/store and
cohort state.

It returns a signed, audience-bound bearer session:

- proposed lifetime: 10 minutes;
- claims: version, opaque identity id, issued/expiry times, random `jti`,
  audience `market-mini-app`, auth method and safe locale hint;
- no Telegram id, username, contact data, bot token, org/store authority or
  platform role in the token;
- signed with a dedicated server secret, not the bot token, webhook secret or
  current admin JWT secret;
- held in JavaScript memory only; never localStorage, URL, analytics or
  Telegram CloudStorage/SecureStorage.

Every request resolves current buyer storefront context. Every seller read or
mutation additionally rechecks active owner membership, organization/store
status and pilot/cohort state through existing services. A revoked owner loses
seller access on the next request even if the bearer token has time left.

### Refresh, reload and devices

- Refresh requires both a valid current bearer and fresh validated `initData`;
  it rotates `jti` and expiry.
- A WebView reload obtains the Telegram-provided raw `initData` again and
  exchanges it; authoritative checkout/order state is restored from D1.
- Multiple devices receive independent short sessions for the same durable
  identity. OCC and idempotency conflicts arbitrate simultaneous mutations.
- Logout deletes in-memory credentials and app cache. Server authorization
  remains short-lived and stateless; no false promise of global Telegram
  logout is made.
- A repeated valid launch exchange is authentication replay, not a business
  mutation. Short freshness, secret-free logs, TLS, CSP and command-level
  idempotency bound the risk. If the security gate requires strict one-time
  launch consumption for seller mutations, add a separately reviewed durable
  nonce design; do not overload Telegram update or login-lockout tables.

## Direct browser behavior

The static shell may load in a normal browser for a truthful explanation, but
all private data/API routes require validated Telegram launch data. There is
no demo identity, query-string bypass or client-selected seller mode.

The unsupported screen offers:

- open the official `t.me` Mini App/bot link;
- continue on the public trust/help page;
- no catalog/order data from a synthetic impersonation in production.

Synthetic development fixtures use an explicit local test harness compiled
out of production and never a production auth bypass.

## Web security controls

| Control | Required design |
| --- | --- |
| CORS | exact approved app origins; `Vary: Origin`; only required methods/headers; no `*`; unknown/null origin denied; preflight tested |
| CSRF | bearer in `Authorization`, no ambient auth cookie; JSON-only mutations; reject form/simple content types. Origin still validated as defense-in-depth |
| CSP | start with `default-src 'none'`; explicit `script-src 'self' https://telegram.org`; `connect-src` exact BFF; bounded `img-src`; no unsafe inline/eval; nonce/hash where needed; report-only rehearsal before enforce |
| Clickjacking | use CSP `frame-ancestors` compatible with verified Telegram Web origins; do not use unconditional `X-Frame-Options: DENY`; native and Telegram Web embedding must pass before enforcement |
| XSS | React text escaping, no raw HTML product descriptions, schema-bounded strings, sanitized/blocked external URLs, no token persistence, Trusted Types evaluation |
| Secrets | bot token, webhook secret, session secret and upstream file URLs are server-only; bundle and source-map secret scan |
| Cache | `no-store` for session, seller detail and orders; media handles never embed secrets; CDN keys exclude auth values |
| API errors | closed codes + request id; never thrown messages, SQL, PII or authorization detail |
| Rate limits | exchange by launch/IP hash; reads by identity/store; stricter seller detail/mutations; 429 with bounded retry, no raw identifiers persisted |
| Input | per-route schemas, body/field/array limits, positive numeric bounds, safe IDs, cursor integrity, Unicode/control-character policy |
| Output | DTO allowlists; buyer/seller list projections omit contact; seller detail `no-store` only after authorization |

Allowing Telegram Web as a frame ancestor is an engineering compatibility
requirement, not an official-origin guarantee. The exact directive must be
verified against current iOS, Android, Desktop and Telegram Web clients in
staging; a mismatch is a rollout stop.

## Threat model

| Attack | Asset / entry | Existing defense | New risk and required mitigation | Required test | Hard stop |
| --- | --- | --- | --- | --- | --- |
| Forged `initData` | identity/session exchange | none for Mini App | strict HMAC, constant-time compare, closed parse | modified user/auth/hash/key-order vectors | any forged vector accepted |
| Expired/future launch | session exchange | none | five-minute age + skew bound | boundary clock tests | stale launch accepted outside policy |
| Captured launch replay | exchange | TLS only | short age, no logs/storage, short session, idempotent exchange; consider durable nonce before high-risk cohort | repeat exchange then distinct/repeated commands | replay produces duplicate mutation or owner escalation |
| Forged `start_param`/store route | launch | bot route validation | treat as hint; resolve active route/store/pilot server-side | other-store/unknown/suspended code | access to another store |
| Client seller-role escalation | route/bootstrap | current bot context resolver | ignore role/mode claims; re-read owner membership | buyer opens `/seller`, tampers response/request | seller data/action visible to buyer |
| Cross-store IDOR | path IDs | tenant-scoped stores/services | server context + same closed not-found response | full resource matrix across two stores | any cross-tenant read/write |
| Revoked membership/stale token | seller API | active membership queries in services | recheck every seller request; short token | revoke between list/detail/mutation | mutation succeeds after revoke |
| Paused/suspended store | all commerce | catalog/checkout/pilot joins | bootstrap and domain fail closed; recovery to bot/support | pause mid-search/checkout/seller action | new order/mutation proceeds contrary to lifecycle |
| Double tap/two devices | checkout/seller commands | operation fingerprints, OCC, unique indexes | required idempotency key, disable pending UI, preserve conflict | concurrent identical/different keys | duplicate order, stock move or intent |
| Price/stock race | checkout confirm | server refresh/check | never accept client price/stock; present conflict | update between review and confirm | stale price silently placed / negative stock |
| Notification duplication | transition endpoint | outbox idempotency/unique rules | endpoint calls same service once; no client send | replay and dispatcher retry | more than one intent/delivery for one transition |
| Handoff ownership/content leak | handoff endpoints/logs | trusted sessions, TTL, bounded content | same service, no content analytics/logging, `no-store` | other buyer/seller, expiry, XSS text | foreign/expired content visible |
| XSS in catalog/question | rendered content | bot plain text | React escaping, no `dangerouslySetInnerHTML`, CSP | stored/reflected payload corpus | script execution/token access |
| CSRF | cross-origin mutation | not applicable to webhook | non-ambient bearer, exact Origin/CORS, JSON-only | malicious origin/simple form/preflight | foreign origin mutation succeeds |
| CORS wildcard/credential drift | all BFF | current global `*` middleware | path policy must override/remove wildcard; contract test headers | staging/prod/evil/null origins | authenticated response readable by foreign origin |
| Clickjacking | Telegram Web/direct browser | none | compatible frame allowlist + server auth; no destructive one-click actions | Telegram Web and hostile iframe | app works in hostile frame or fails in Telegram |
| Media token disclosure/SSRF | media proxy | opaque `file_id` validation | map handle to stored file id only; fixed Telegram host; never accept URL; bounded MIME/size | arbitrary URL/path/token scans | token/upstream URL exposed or arbitrary fetch |
| API enumeration | catalog/orders/seller detail | tenant IDs in SQL | opaque IDs, scoped lookup, uniform errors, limits | sequential/foreign IDs | existence or PII leak |
| Analytics/log PII | all requests | closed event payload and PII validator | new closed allowlist; never raw query/initData/contact | payload/log snapshot + secret scan | forbidden key/value persisted |
| Session secret/bot token in bundle | build | repo secret scan | env separation and output scan | compiled assets/source maps | any credential material found |
| Schema drift | BFF cold start | Telegram schema contract | shared fail-closed contract before handlers | missing table/column/index | handler continues on partial schema |
| Bot regression | shared services/deploy | current regression suite/fallback | contract tests and bot canary before Mini App cohort | full bot suite after BFF changes | current bot behavior/secret isolation fails |

## Privacy and retention

- Never log or analyze raw search, question/reply, initData, Telegram/chat IDs,
  username, phone, address, contact fields or consent text.
- Reuse the existing closed scalar event projection and PII validator.
- Buyer contact remains only in the order domain and authorized seller detail.
- Handoff content retains the existing bounded TTL and clearing behavior.
- Session/auth failure telemetry uses reason and latency buckets only.
- Define operational log retention before MA-2; logs contain request id and
  closed reason codes, not user identifiers.

## Security acceptance gate

No transactional cohort can open until forged/expired launch, cross-store
IDOR, role escalation, repeated mutations, CORS/CSP, media proxy, secret scan,
schema fail-closed and bot regression tests all pass with zero P0/P1 finding.
