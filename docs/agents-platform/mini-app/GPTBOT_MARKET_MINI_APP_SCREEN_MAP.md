# GPTBot Market Mini App screen map

## Shared screen-state contract

Every data screen defines:

- **loading:** structural skeleton only, no fake values or layout shift;
- **empty:** the next valid task, not a generic dead end;
- **error:** closed explanation, preserved effort, retry and bot recovery;
- **stale:** previous data is labelled, mutation is blocked or revalidated;
- **analytics:** closed scalar event only, never raw query/content/contact;
- **authority:** the BFF and domain service decide; route visibility is not
  permission.

Acceptance for all screens: 320–430 px without horizontal overflow; 44 px
minimum targets with 8 px separation; visible keyboard focus; labels for
inputs/images/actions; logical screen-reader order; text scales to 200%; light
and dark contrast meet WCAG 2.2 AA; reduced motion; RU and Uzbek Latin reviewed.

## Buyer screens

| Screen | User job and required data | Existing capability / proposed API / mutation | Authority | Loading, empty, error and stale | Analytics / bot fallback / screen acceptance |
| --- | --- | --- | --- | --- | --- |
| Launch/loading | enter quickly; Telegram environment, auth state, build version | auth adapter; `POST /session/exchange`, `GET /bootstrap`; identity may be created/bound | validated launch only | branded skeleton; timeout shows retry and bot | `app_opened`, auth outcome bucket; `/start`; no content flash before auth |
| Auth failure | understand why access failed without leaked detail | new closed auth presenter; retry exchange | none | expired vs unavailable closed codes; never echo initData | `auth_failed` reason bucket; official bot link; no private API call |
| Unsupported environment | open correctly from a normal browser | environment adapter; no mutation | public shell only | concise instruction, trust/help link | `recovery_used`; `t.me` open; no demo authority |
| Buyer home | start search/category/order task; store identity, categories, recent context | catalog/session; `GET /catalog/home` | active storefront/pilot | category/product skeleton; empty store explains state; paused blocks commerce | `home_viewed`; `/catalog` or `/orders`; one dominant search action |
| Search entry/suggestions | describe need or choose safe suggestion; local input + server suggestions | buyer query vocabulary; local ephemeral suggestions, optional future endpoint | storefront | preserve text on retry; no raw query log | `qualified_search` only after bounded valid submit; text bot search; accessible labelled field |
| Clarification | resolve one high-value ambiguity/budget | existing parser/pending budget for bot; explicit Mini App filters | storefront | show understood constraints; preserve search | `clarification_requested`; conversational bot; one question only |
| Categories | scan categories/counts | `listBuyerCategories`; `GET /catalog/categories` | storefront/store scope | empty falls to all products; stale refresh | `category_opened` on select; `/catalog`; tiles wrap safely in RU/UZ |
| Category listing | browse products in one category | list published by category; category products API | storefront + scoped category | cursor skeleton; empty offers all/search; stale item marked | results event bucket; bot category action; no unpublished item |
| Filters | narrow by supported facts; category/availability/price | catalog query adapter; no authoritative local rule | storefront | unsupported combination explained; apply/reset preserves query | qualified-search scalars only; bot budget/category; controls labelled, no horizontal chip trap |
| Results | compare factual cards; product DTO page/cursor | buyer query/catalog; `GET /catalog/products` | storefront | stable cards; zero routes to zero-result; stale refresh before action | `results_shown` count bucket; bot results; card order deterministic |
| Zero result | recover without invented product | existing zero-result/handoff rules | storefront | preserved constraints; change one filter/category/human | `zero_results` closed reason; bot/handoff; no fake recommendation |
| Product detail | judge fit; gallery, facts, store, freshness | published product; `GET /catalog/products/:id`, media handles | storefront/product scope | image fallback; hidden/unpublished becomes unavailable; stale price refresh | `product_viewed`; bot product action; source/price/availability textual |
| Media fallback | continue when `file_id` proxy fails | media proxy + branded placeholder | same product access | aspect-ratio placeholder, retry once, no broken token URL | technical media error bucket; bot photo/text; facts remain usable without image |
| Compare tray | see selected 0–3 items | current comparison service; comparison APIs | buyer session | hidden at zero; disabled/full explanation | `comparison_used` on open, not every add; bot compare; does not cover CTA/content |
| Comparison | scan factual trade-offs | list comparison; `GET /comparison` | session/store scoped | missing facts explicitly “not specified”; removed product stale state | comparison event; bot text compare; no invented winner/score |
| Request review | verify selected product, current price and non-payment meaning | active checkout/start; `POST /checkout`, `GET /checkout/active` | buyer session | resume existing draft; other-draft choice; stale price label | `request_started`; bot checkout resumes same draft; edit/cancel available |
| Contact/fulfillment steps | supply quantity/name/phone/address/comment | checkout submit methods; quantity/contact/comment APIs | owns active draft | per-field pending; error preserves input; server state is truth after success | step events excluded unless decision-useful; bot workflow; labels and correct keyboards |
| Price changed | re-review refreshed server price | `confirmCheckout` outcome | owns draft | dominant “review again”; no silent confirm | closed recovery outcome; bot checkout; old/new price clear |
| Stale/no stock | understand request cannot proceed | checkout stock-unavailable outcome | owns draft | safe cancel/reselect; preserve contact where policy permits | zero/recovery reason; bot/catalog; no order placed or stock negative |
| Request success | know request is placed, not paid, and who acts next | placed order + notification intent | owns order | no fake delivery estimate; retry never places again | `request_completed`; bot confirmation/alerts; order number/status and next actor |
| Orders | find own history | buyer order query; `GET /orders` | buyer session-owned only | page skeleton; empty teaches first request; stale background refresh | `order_viewed` only on detail; `/orders`; cursor pagination |
| Order detail/status timeline | understand state and next action | order detail presenter; `GET /orders/:id` | buyer owns order | unknown/foreign uniform not-found; stale status re-fetch | `order_viewed` status bucket; bot order detail; plain-language timeline |
| Question/handoff | ask bounded question | handoff request; `POST /handoffs` | trusted buyer session | preserve draft; existing open conversation returned | `handoff_requested`; bot human action; who receives/retention expectation |
| Reply received | read attributed seller reply | active handoff/status API; current delivery still bot | buyer owns handoff | expired content truthfully cleared; unread state not invented | seller-responded existing event; bot alert/link; seller attribution clear |
| Store paused | know shopping is temporarily unavailable | store/pilot lifecycle | no active commerce | no catalog/checkout mutation; support/retry | recovery/fallback bucket; bot/support; reason category without internal detail |
| Offline/retry | preserve safe local effort | query cache/local form; no business mutation offline | prior session not proof while offline | labelled offline; disable confirm/seller actions; retry on online | technical error/recovery; bot link may also be unavailable; no optimistic order |
| General error | recover from bounded failure | shared error boundary/closed API errors | depends on last valid route | preserve route/form; request id; retry/bot | technical error code; bot; no stack/PII |
| Language/settings | choose RU/Uzbek Latin and inspect app info | existing stored storefront locale + client theme info | valid identity/session | save server preference; fallback Telegram language | `language_selected`; bot language action; change applies without losing draft |
| Trust/help | understand seller responsibility, request-not-payment, support | existing trust source/copy | public or valid session | static content available during API failure | no sensitive event; public trust/bot support; concise scannable text |
| Seller entry | open seller workspace or verification explanation | `GET /me/bootstrap` capabilities | server-derived owner only | buyer sees “seller/pilot info”, never disabled controls implying access | seller entry bucket; seller bot interest; verified owner goes `/seller` only after check |

## Seller screens

| Screen | User job and required data | Existing capability / proposed API / mutation | Authority | Loading, empty, error and stale | Analytics / bot fallback / screen acceptance |
| --- | --- | --- | --- | --- | --- |
| Seller invitation | understand invite/pilot requirement | current seller-interest/onboarding lookup | validated identity, no implied role | explanation and support; no self-upgrade | recovery/entry bucket; existing bot interest flow; verification reason clear |
| Verification explanation | know what grants access | membership/store policy projection | none beyond identity | no owner data; current status only | no sensitive event; bot/support; never asks for token/secret |
| Onboarding status | resume or see blocked/completed state | onboarding snapshot/workflow; read API later | invited/owned onboarding | explicit next owner-assisted step; no automatic store create in first program | onboarding event later; bot canonical; no Mini App mutation initially |
| Active dashboard | prioritize today’s exceptions | stats/orders/handoffs/store state; `GET /seller/dashboard` | active owner/store each request | skeleton by section; empty teaches next task; pause state replaces actions | `seller_dashboard_opened`; bot dashboard; orders/questions before vanity totals |
| New/aged orders | process queue | `GET /seller/orders` filters/cursor | owner/store | empty separates no orders from error; age is derived truth | queue viewed scalar; bot order list; urgency has text, not color only |
| Order detail | verify request/contact/stock/version | seller order detail API | owner/store/order; `no-store` | contact never in list/skeleton; stale version blocks action | no contact analytics; bot detail; PII not copied/sharable by default |
| Confirm order | accept and decrement stock once | `confirmOrder` command API | active owner/store/order | native/in-app confirmation; pending disables action; conflict reloads | `seller_task_completed` transition/outcome; bot confirm; exactly one move/intent |
| No stock/cancel | reject safely | cancel command; stock error reason | same | destructive explanation; repeated tap unchanged | seller task outcome; bot cancel; no stock decrement |
| Mark done | close fulfilled request | complete command | same | confirm next effect; version conflict reload | seller task; bot done; one buyer intent |
| Buyer question detail | read bounded question/context | handoff detail | owner/store/handoff unexpired | cleared/expired state; no content in list/log | no raw analytics; bot question; retention explained |
| Reply composer | send one bounded seller reply | direct handoff reply adapter | owner/store/handoff/version | draft local; closing confirmation; pending; conflict/expiry preserves safe explanation | seller task outcome; bot next-message reply; one buyer delivery intent |
| Handoff queue | triage questions by age/status | `GET /seller/handoffs` | owner/store | content-free skeleton/list; empty next task | queue bucket; bot handoffs; no question preview if privacy policy excludes it |
| Products | assess catalog and quality | seller product list | owner/store | draft/published/archived empty states; freshness truth | seller product view later; bot products; status labelled |
| Product detail | inspect/edit facts/version/stock | seller product detail | owner/store/product | stale version warning; media fallback | no raw content event; bot product; source/status explicit |
| Add/edit product | maintain catalog | catalog CRUD adapters | owner/store and separate self-service flag | **not MA-5**; field validation, local draft, conflict recovery | task outcome only; bot/owner-assisted; no publish by accident |
| Stock update | set absolute balance | `setInventory` API | owner/store/product/version | **MA-6 after order parity**; show current/entered/result; stale blocks | task/move type scalar; bot stock; exactly one movement |
| Categories | inspect/manage taxonomy | catalog category services | owner/store | reads MA-5; mutations later; conflict/empty | task scalar; bot categories; no orphan/unscoped product |
| Catalog quality | see missing media/spec/stock/freshness | new presenter over existing product data | owner/store | rules are transparent; no invented score | quality bucket later; bot/support; each issue has action |
| Rejected import | correct unsupported/invalid batch | no safe import exists currently | owner only after separate design | do not imply import in first version; list validation failures without raw secret/file | none initially; owner-assisted; no partial silent write |
| Freshness | prioritize stale facts | updated timestamps/inventory | owner/store | proposed thresholds must be owner-approved; labels not auto-truth | freshness bucket later; bot; no automatic hide without ADR |
| Today stats | see exact current window | stats service (`windowDays=1`) | owner/store | empty is zero, not unavailable; error distinct | existing `stats_viewed`; `/stats`; title always “today” |
| Notification failures | understand buyer/seller delivery issue | safe notification/automation projection | owner/store, no destination IDs | no resend button until domain command/audit exists; support path | technical bucket; bot/OCC support; no PII/destination |
| Paused store/pilot | know what is disabled and recovery owner | lifecycle/pilot state | verified owner, commerce denied | read-only explanation; no buyer/seller mutations | recovery; bot/support; exact disabled capabilities |
| Suspended store | understand stronger block | store status | verified owner if policy allows status view | no catalog/order action; owner/support recovery only | recovery; bot/support; internal reason not leaked |
| Support | recover operationally | configured support/bot link | verified session or public | works during backend partial failure | recovery used; bot; no platform-owner actions |
| Buyer mode | shop without changing authority | same shell route switch | buyer context bound to storefront; seller rights remain server-side | unfinished seller draft warns; state preserved | role navigation scalar only; bot buyer menu; label says destination, not role grant |
| Return to seller | return to last seller route | local navigation + fresh bootstrap | owner rechecked | revoked/paused routes to explanation | dashboard event on actual load; bot seller dashboard; no cached seller screen flash |

## Seller mutation verdict

Safe first Mini App mutations in MA-6, after read-only proof:

1. order confirm/cancel/done;
2. direct handoff reply;
3. absolute stock update only after order-transition concurrency evidence.

These already have strong server authorization, idempotency, OCC and
notification invariants. Category/product create/edit/publish follows in a
separate sub-cohort because media, validation, long-form input and accidental
publication add UX risk. Onboarding, store lifecycle, pilot control,
notification replay and platform automation stay bot/Owner-assisted.

## Mini App component and token ownership

| Reuse from current Market system | Extract/share | Mini-App specific | Do not reuse |
| --- | --- | --- | --- |
| semantic colors, Geist, 8 px rhythm, radii, focus token, market mark/assets, price/status semantics | framework-neutral token file, locale keys, DTO enums, factual card field order | safe-area shell, bottom nav, page headers, search/filter controls, gallery, compare grid, checkout form/timeline, operational badges, stock editor, skeleton/offline states | landing Hero/StickyCTA/FAQ/scroll sections, glossy parent-site visuals, admin tables/sidebar, Telegram button-row renderer |

Component states are `default`, `pressed`, `focus-visible`, `disabled`,
`loading`, `success`, `warning`, `error` and `stale` where meaningful. A state
is never represented by opacity or color alone.
