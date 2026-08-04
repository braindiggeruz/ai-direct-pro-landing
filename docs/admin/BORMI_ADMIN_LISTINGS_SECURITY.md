# Bormi Admin · ADMIN-3A security

Date: 2026-08-04
Branch: `feature/bormi-admin-listings`
Surface: `GET /api/admin/listings`, `GET /api/admin/listings/:id`,
`GET /api/admin/listings/:id/media/:index`, `GET /api/admin/categories`

## 1. Authority

Every route is `withOwnerRole('platform_owner', …)`. The role is resolved before
the handler body runs, by the same `requirePlatformRole` the rest of the Owner
Control Center uses. `support_readonly` is **not** admitted: the catalogue
carries seller product copy, and read-only support does not need it.

The rollout flag is not authority. `BORMI_ADMIN_V2_ENABLED` decides whether the
panel renders; no server file in this stage reads it, and a client that flipped
it in its own storage would reach exactly the same 401 or 403. A test asserts
the flag name appears in none of the server files.

## 2. No write path

There is no `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER` or `DROP` anywhere
in the read model or the four routes, and a test enumerates those verbs. Every
non-GET method returns `405` with an `Allow: GET` header rather than `404`, so a
caller learns the route exists and refuses.

No screen renders a publish, archive, unpublish, edit, delete or save control.
Not disabled ones either — the test asserts absence of the words, and of
`disabled={true}`.

D1 writes during the whole of this stage: **0**, verified on every production
statement run (`rows_written: 0`).

## 3. Input validation

| Input | Bound |
|---|---|
| `limit` | clamped to 1…100 by the shared `parsePagination` |
| `offset` | clamped to 0…100 000 |
| `status`, `availability`, `media`, `quality`, `sort` | closed list; an unrecognised value throws `invalid_<param>`, never widens to "all" |
| `store`, `category` | `requireIdentifier` — `^[A-Za-z0-9][A-Za-z0-9:._-]*$`, ≤120 chars |
| `q` | normalised through the catalogue's own `normalizedProductName`, then bounded to 80 chars; under 2 characters it is dropped, not run |
| `:id` | `requireIdentifier` |
| `:index` | `^\d{1,2}$` and `< 10` |

Every value that reaches SQL is bound. The only text interpolated into a
statement is a fragment from a frozen constant in the read model — the quality
expressions and the two `ORDER BY` clauses — and none of it derives from a
caller. `LIKE` wildcards are escaped with an explicit `ESCAPE '\'` even though
normalisation already strips them.

## 4. Privacy

Not selected, not rendered, and asserted absent by test across all nine source
files: `telegram_id`, `username`, `phone`, `buyer_name`, `buyer_phone`,
`buyer_address`, `initData`, `identity_id`, `session_secret`.

The catalogue does carry free text a seller wrote — product name, description,
specifications. That is user content and the platform owner may read it. It is
never logged, never sent anywhere, and never placed in a URL. No server file in
this stage calls `console.log`, `console.warn` or `console.error`, and a test
holds that: the search term in particular is never written to a log line.

Nothing this surface produces goes into analytics. There is no analytics call in
the admin app at all.

## 5. Media

The reference stored in `media_refs_json` never leaves the server. A client
receives `{index, kind}` and asks for bytes by index.

The R2 object key is built server-side from the product's own `org_id` and
`store_id` through the existing `mediaObjectKey`, so a request can only ever
address an object inside the store that owns the product it named. There is no
path in which a caller-supplied string reaches a key. The bucket is never
listed. Bytes are served through the existing `storedMediaResponse`: private
cache, `noindex`, no scripting, and a content type the stored metadata proved
rather than one a caller asked for.

Telegram-hosted images are refused with `media_not_stored_here` (409) rather than
proxied. The admin console does not become a second Telegram client.

**Why a new route rather than the Mini App's.** `/market/media/:handle` sits
inside the buyer branch of the market router: it resolves the caller through
`claims.sub` and a `MarketAccessContext`. Using it from the admin would have
meant minting a buyer session for the owner console — a second front door to a
different building. The new route uses the authority the console already has and
nothing else.

**Why the bytes are fetched rather than `<img src>`.** This console
authenticates with a bearer header, and a browser attaches no headers to an
image request; an `<img>` at the media route would be unauthenticated and would
401 every time. The alternative — signing a capability into the URL, as the Mini
App does for buyers — would put a credential in an address that lands in browser
history and in any referrer. So the image is fetched through the same guarded
`fetch` and handed to the DOM as an object URL, which the component revokes.

## 6. Errors

Every failure is a closed-list token plus a request id, produced by the shared
`withOwnerRole` wrapper. No message derived from a thrown value reaches a
caller. The client renders the code and a retry, never a backend payload.

Tokens this surface can return: `invalid_status`, `invalid_availability`,
`invalid_media`, `invalid_quality`, `invalid_sort`, `invalid_store`,
`invalid_category`, `invalid_query`, `invalid_listing_id`,
`invalid_media_index`, `listing_not_found`, `media_not_found`,
`media_not_stored_here`, `storage_unavailable`, `internal_error`.

## 7. Denial of service

Every query is bounded by `LIMIT` and every filter is validated before it
reaches SQL. The most expensive shape this surface can be asked for is a
covering-index scan of the products index with a temp B-tree sort — measured, and
recorded in the data contract. The two shapes that would have been a full table
scan (`ORDER BY updated_at`, and an updated-at range filter) were removed rather
than bounded, because bounding a scan still scans.

There is no user-controllable `LIKE '%…'`, no user-controllable `ORDER BY`, no
user-controllable column list and no user-controllable table.

## 8. Fixtures

`FIXTURE_MODE` is `import.meta.env.DEV && VITE_ADMIN_FIXTURES === '1'`, which
folds to `false` in any production build, so the fixture module is dropped from
the bundle. Every synthetic call site sits behind that flag, and a test counts
the guards against the call sites. Fixture products are named "синтетический",
addresses are `example.invalid`, and the media fetch returns `null` under
fixtures rather than reaching for a server that is not there.

## 9. Untouched

| | |
|---|---|
| `BORMI_ADMIN_V2_ENABLED` | `"false"` |
| `MARKET_OWNER_TELEGRAM_BINDING_ENABLED` | `"false"` — AUTH-1F still idle |
| `MARKET_QUICKPOST_ENABLED` / `_AI_ENABLED` | `"false"` |
| Unused binding challenges in production | 0 (all challenges ever issued: 0) |
| D1 migrations | 32, unchanged |
| D1 rows written | 0 |
| Legacy `/admin-tools/*` | untouched |
| Mini App | untouched — imported from, never written to |
