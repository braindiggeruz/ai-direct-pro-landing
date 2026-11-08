# Intent and content implementation — 2026-11-08

Scope: R13, R14, R16, R17 and the evidence-limit part of R18. Source baseline: `e6bafc4b32060dcdb6a04c4050589c18715ae221`. This report describes local changes, not a production deployment or measured search improvement. Other agents own product facts, schema, performance, analytics and release integration.

## R13: keep the existing intent boundaries

Read `content/seo/intent-manifest.json`, including commercial clusters, C11, C18, C22, C47, C48 and A11. No redirects, canonical changes, new URLs, keyword reassignment or hreflang changes are included.

| Intent | Current URL / rule | Decision for this release |
|---|---|---|
| Official ChatGPT account login, Log in versus Sign up, missing verification code | `/uz/blog/chatgptga-qanday-kirish-mumkin/` | Test the description only. Keep the existing official-login article. |
| Bare `chatgpt kirish` | Google currently routes the query among existing pages; C22 does not force ownership | Do not pull the query with redirects or bare-keyword anchors. Overlapping impressions are not proof of harmful cannibalization. |
| Use the independent Uzbek AI chat | `/uz/gpt-uzbek-tilida/` | Preserve product ownership; product-fact changes are a separate workstream, not a control group for the login test. |
| Use the independent Russian AI chat | `/ru/gpt-chat/` | Preserve product ownership; no chat snippet test is implemented by this content workstream. |
| Download the official ChatGPT app | `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` | Preserve the existing article. A11 keeps it and the login guide without a Russian hreflang pair. |
| Availability in Uzbekistan / VPN | `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/` | Preserve C18; do not turn it into another login page. |
| Russian–Uzbek translation | `/ru/russko-uzbekskiy-perevodchik/`, `/uz/rus-ozbek-tarjimon/` | Preserve C47/C48 and the distinction from general chat. |
| Commission a Telegram bot | `/ru/razrabotka-telegram-bota-tashkent/`, `/uz/telegram-bot-biznes-uchun/` | Explain the selected scope and handoff to a manager; do not imply automatic booking. |
| Bot price and estimate | `/ru/stoimost-chat-bota/` and its existing UZ price owner | Reuse the current price page; add a calculation method, not another price URL. |
| AI bot selection / SEO service | `/ru/ai-bot-dlya-biznesa/`, `/ru/seo-prodvizhenie-saytov-tashkent/` | Correct concrete scope and evidence gaps on the existing commercial pages. |

The completed audit's GSC window was 2026-10-09–2026-11-05. It reported 109,193 impressions / 276 clicks for RU chat and 90,037 / 574 for UZ chat. The bare `chatgpt kirish` was observed on UZ chat (49,178 / 249), RU chat (9,238 / 12) and the login article (2,169 / 8). These observations justify a careful test, not a conclusion that the descriptions caused low CTR. Query mix, position, navigation intent and Google's displayed snippet remain relevant.

The same audit reported weak service visibility: SEO service 407 impressions / 0 clicks, average position 31.1; Telegram development 26 / 0, position 39.8; AI bot 41 / 0, position 24.8. These are priorities chosen from the existing business roadmap, not a promise that copy alone will improve ranking.

## R14: one description-only experiment

File: `content/blog/uz/chatgptga-qanday-kirish-mumkin.json`.

Before:

> ChatGPT’ga kirish: chatgpt.com’ni oching, Log in yoki Sign up — 3 qadam, odatda VPNsiz. Kod kelmasa nima qilish. Muqobil: GPTBot.uz AI chati.

Variant from the audit:

> ChatGPT hisobiga qanday kirish va yangi hisob ochishni o‘rganing. Rasmiy havola, Log in va Sign up farqi, tasdiqlash kodi kelmaganda yechimlar.

The new description focuses on the job of this article without the alternative-chat promotion. A semantic comparison against Git HEAD confirms that `description` is the only changed JSON field: title, H1, body, FAQ, links, OG fields and all dates remain unchanged. Title remains `ChatGPT kirish (login): chatgpt.com, 3 qadam (2026)`.

Release and observation protocol:

1. Record release time and the previous description; verify the resulting canonical HTML and decoded meta description in production.
2. Record a confirmed Google recrawl separately. Deployment time and sitemap submission are not recrawl evidence.
3. Count the observation window from recrawl: 2–4 weeks with the same query, country and device segments; extend when data is sparse.
4. Compare clicks, impressions, CTR and position for the article's login query family; record displayed snippet rewrites if observed. Also inspect page-level useful actions and changes in query mix.
5. Record concurrent site/product changes. The intervention on this article is description-only, but the site-wide release is not a randomized controlled experiment. RU and UZ chat pages are not interchangeable controls.
6. Do not publish a win/loss claim until there is enough comparable data. No outcome, recrawl date or traffic gain is asserted here.

## R16: no mechanical shortening

Reviewed the source strings on `/uz/instagram-target-yoqish/` and `/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/`. Their subject is expressed near the beginning. The audit's 66/172-character counts alone do not establish a defect. Neither file was changed. A current, query-specific Google snippet crop was not captured in this implementation; this remains an observation item, not a completed proof that display is ideal or broken. Shorten only if actual display hides information needed to choose the result.

## R17: five targeted commercial pages

All five keep their URLs, title, H1, canonical and published price tables. Existing FAQ, tables, briefs and case links were read and reused. The release creates no new landing pages and adds no competitor pricing, market-share statistics, customer results or guaranteed conversion claims.

| File under `content/pages/` | Concrete problem / gap | Change |
|---|---|---|
| `ru/ai-bot-dlya-biznesa.json` | Instant replies and sales/staff outcomes were stated categorically; niche examples implied booking without explaining the source of availability; the meta bundled CRM with the starting price | Bounded definition with existing starting price, human handoff and data-source requirements; illustrative niche scenarios; description and OG description aligned to one-channel scope; no automatic CRM promise. |
| Same AI-bot page | Decision between a simple bot and AI was a list of near-synonyms; acceptance evidence was missing | In-body links to commissioned Telegram development and the CRM integration owner, with the task each solves. Added four illustrative acceptance cases: known price, missing knowledge, booking request without a calendar, repeat/failure when CRM is connected. Added the missing `how` anchor for the existing secondary CTA. |
| Same AI-bot page | A case link could be read as proof of AI quality or sales growth; package boundary paragraph could double-count included channels/CRM | Label existing case studies as related implementation examples. Explain that already-included package components are not added again and third-party operating costs remain separate. |
| `ru/razrabotka-telegram-bota-tashkent.json` | The inclusion list implied any baseline included CRM and ongoing support, despite the more precise published package boundaries | Make CRM/table conditional on the chosen package and estimate; distinguish defect terms from separately agreed support. Replace a generic testing sentence with a clearly labelled example and expected evidence. Correct one visible brand anchor to GPTBot.uz. |
| `ru/stoimost-chat-bota.json` | The page separated one-off and regular costs but did not give a reproducible comparison formula | Add an estimate-comparison method over a chosen period. The 12-month illustration explicitly requires unchanged tariffs/load, and usage-based AI/messages need quantities. No new quote or ROI forecast. |
| `ru/seo-prodvizhenie-saytov-tashkent.json` | Bot boilerplate under SEO pricing referred to a second channel, CRM, payments and AI models | Replace with SEO-specific audit/implementation, URL/language/content/development/placement boundaries. Remove a duplicate link to the same SEO-price article. Explain deployment versus recrawl versus result and contact clicks versus qualified leads. |
| `uz/telegram-bot-biznes-uchun.json` | Existing acceptance list was strong but did not specify what evidence to retain | Add one item: input, expected result and recorded application/error evidence using test data. No duplicate FAQ/table or changed tariff. |

`lastReviewedAt`/`updatedAt` were advanced only on these five edited commercial pages. These are editorial dates, not proof that business outcomes or external integrations were tested today.

Current external pages were checked as examples of how providers explain buying decisions:

- [Innosoft: Telegram bot development](https://innosoft.uz/ru/uslugi/razrabotka-telegram-botov) — scope and scenario factors are exposed on the service page.
- [DigiCore: Telegram bot development](https://digicore.uz/ru/services/telegram-bot-development) — separates scope, timing, external payment conditions and operator handoff.
- [DigiCore: SEO promotion](https://digicore.uz/ru/services/seo-promotion) — separates an audit, monthly work and collaboration with the client's developer.

Read on 2026-11-08. These primary-provider pages inform the decision topics, not GPTBot.uz's deliverables or proof of rank. Search was not a location-controlled Google SERP capture. Competitor prices and claims were not copied. The attempted NDC page fetch failed and is not used as evidence.

## R18: evidence limits rather than invented results

File: `content/blog/ru/keys-cake-city-platforma-kondirterskoy.json`.

The existing case already contains components, architecture and a metric/source table, but no numeric before/after results. Added a small methodology/limitations subsection requiring periods, definitions, sample size, channel attribution, exclusion of tests/repeats and notes on seasonality or advertising changes before publishing comparisons. It explicitly says this is a requirement for future measurement publication, not a completed experiment.

The added text separates the public website and architecture description from revenue growth, error-free operation and client acceptance. No new roles, screenshots, technical implementation claims, clients, ROI numbers, acceptance claims, personal data or access details were added. Existing substantive business claims were not expanded. `dateModified`/`updatedAt` reflect this editorial clarification; they do not constitute a fresh operational audit of Cake City.

The separate external-drafts package already preserves the existing 24-task RU/UZ evaluation set. No new model evaluation was executed here; costs, authorized data, actual answers and scorers must be established before publishing results. This part of R18 remains pending those inputs.

## Verification

- Parsed all seven modified JSON files and compared their identity fields with Git HEAD: title, H1, URL, canonical, publication/creation dates preserved.
- Login article comparison: exactly one changed field, `description`.
- Existing RU commercial price tables compared unchanged. UZ price table is untouched by the one-item acceptance edit.
- `git diff --check`: passed at the content checkpoint; unrelated LF/CRLF warning on another agent's `public/llms.txt` was informational.
- Existing tests: `node --import tsx --test tests/seo-commercial-claims.test.ts tests/seo-intent-manifest.test.ts tests/seo-anchor-intent.test.ts tests/commercial-lead-demo.test.ts` — 22 passed, 0 failed. Includes browser checks for the existing teaching demo at 320px/desktop and without JavaScript; no form was submitted.
- Full build, prerender, schema review, protected-revision integration and production smoke belong to the release coordinator. This workstream did not commit, deploy or claim a production result.
