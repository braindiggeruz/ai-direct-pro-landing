# GPTBot Market truth matrix

Status: productized contract, 2026-08-01. This matrix governs website, Telegram,
seller materials, creative and operator copy. A claim not listed as allowed
requires a new code/data proof before publication.

| Topic | Allowed statement | Source of truth | Forbidden shortcut |
| --- | --- | --- | --- |
| Master brand | GPTBot | product architecture | treating Sotuvchi as a separate company |
| Buyer product | GPTBot Market | public Telegram identity and buyer experience | abruptly renaming the existing bot identity |
| Seller product | Sotuvchi by GPTBot; a verified seller mode/program | trusted membership and store state | implying that “Я продавец” grants authority |
| Company/support | GPTBot.uz | site and support channel | implying affiliation with Telegram or OpenAI |
| Buyer promise RU | “Напишите, что Вам нужно, — GPTBot найдёт подходящие товары в каталогах подключённых магазинов.” | deterministic catalog search | “finds anything on the market” |
| Buyer promise UZ | “Nima kerakligini yozing — GPTBot ulangan do‘konlar katalogidan mos mahsulotlarni topadi.” | prepared Uzbek Latin copy | claiming native-speaker sign-off |
| Catalog scope | connected, server-authorized store catalogs | `sotuvchi_stores`, `sotuvchi_products` | public marketplace or web-wide search |
| Price/stock/specs/store | exact values from catalog/inventory facts | D1 catalog/inventory | model-written or marketer-invented facts |
| Language understanding | names, categories, verified aliases, budget and supported constraints | deterministic rules and query parser | “AI understands any question” |
| AI state | AI selection is disabled for Sotuvchi production | manifest `policies.aiSelection = disabled` | calling the current response generator generative AI |
| Comparison | 2–3 products on available factual dimensions | grounded comparison facts | ratings, reviews or “best” winner without data |
| Request | an intent forwarded to one store after confirmation | checkout/order contract | payment, purchase completion, reservation or delivery promise |
| Payment | not supported or processed by GPTBot Market | release scope | Click, Payme, escrow, custody or stored payment details |
| Seller access | owner-assisted verification and server binding | membership/store route | self-service store creation or role switching as authorization |
| Statistics | exact operational counters for today/current open state | stats service | “last 7 days”, revenue, profit, stable conversion or p95 |
| Pilot | Store Pilot #1 is ready for owner inputs and not started | governance and D1 state | seller, duration, fee, SLA, result or case study |
| Production catalog | one controlled synthetic store, 48 synthetic products at preflight | production D1 read-only count | describing it as a real merchant assortment |
| Media | Telegram `file_id` only when supplied and validated; otherwise no image/fallback in synthetic website demo | catalog validator/media contract | inventing a `file_id` or adding URL media without migration |
| Availability state | paused/suspended stores accept no new requests | trusted store state | showing a working seller dashboard or checkout when blocked |
| Evidence | architecture, sanitized synthetic demos, tests and canaries | repository/release evidence | real customer logos, testimonials, ratings or performance claims |

## Copy release check

Before any public copy ships:

1. identify the row above and its source;
2. verify locale parity without asserting native Uzbek review;
3. label synthetic data adjacent to the visual, not only in a footnote;
4. make buyer and seller CTA outcomes explicit;
5. confirm that “request” is never styled or described as payment;
6. stop publication when a store, product, price, stock or result is not sourced.
