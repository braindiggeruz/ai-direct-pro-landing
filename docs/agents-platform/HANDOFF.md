# GPTBot Agents — Handoff

> Lead Radar-only release (2026-08-27): see `../lead-radar/TELEGRAM_RELEASE_20260827.md`.
> Source `3395a80` is live on Pages deployment `5ccd3d24-a06b-405a-a312-e7180fe71388`; gateway `361fd697-8316-4f5e-9539-206fb954041b` and Windows Bridge 1.2.0 are unchanged. HTTP, admin-boundary and SEO canaries pass; owner login/send canary remains pending.
> The explicit phone submit now waits for its bound Bridge challenge and submits exactly once instead of deadlocking on UI polling. No company message was sent during repair or deployment.
> The first owner attempt exposed a second candidate fix: browser input used the ten-minute ceremony expiry but Bridge input accepts at most 90 seconds, then gateway refused to ACK the safe local failure. A 60-second envelope plus gateway 1.2.1 terminal ACK is locally verified and not yet deployed.
> The Bormi stages and acceptance requirements below are unchanged.

> **Fresh Bormi operational handoff (2026-08-02):** before touching the Market
> Mini App, Telegram entry or production deployment, read
> `BORMI_MARKET_MAXIMUM_DETAIL_HANDOFF_2026-08-02.md`. It supersedes the Bormi
> deployment identifiers and incident status below. Current application source is
> `d47d998`; the v8 fast-path release is live and awaits an exact native owner
> canary in `@BormiMarketBot`.
>
> **Voice search (2026-08-02):** merged into `main` as `4367850` and **deployed**
> — root/BFF `76f59061-d25d-4679-aa62-65be3b3c2c43`, static Mini App
> `2af92899-46b6-4356-ae5d-573aa7455837`, both at exact source `4367850`.
> `MARKET_VOICE_SEARCH_ENABLED=true` is live in Pages production. Read
> `mini-app/implementation/BORMI_VOICE_SEARCH_RELEASE.md` before touching the
> Market search path. **The native Telegram voice canary (§11 of that record) is
> not done — do not describe voice search as confirmed working on a real device
> until the owner completes it.**

## 1. Состояние

- Дата: 2026-08-02.
- Ветка: `feature/gptbot-market-mini-app-synthetic-candidate`.
- Application HEAD: `5c9e004`;
  governance state commit: `HEAD`.
- Завершённый этап: owner-authorized Telegram Mini App review integration.
- Следующий этап: native Telegram owner review; Store Pilot #1 remains a
  separate owner input/authorization gate.
- Рабочее дерево: clean after the governance commit; `dist/` untracked/ignored.

### Bormi voice search — 2026-08-02 (deployed, native canary pending)

- Status: `BORMI_VOICE_SEARCH_DEPLOYED_AWAITING_NATIVE_OWNER_CANARY`.
- Base source: `d47d998`; worktree `F:\Claude\gptbot-bormi-api-fix`.
- Released source: merge commit `43678506ed4752f07e46004e22338d7890edf19c`
  (`--no-ff` merge of `fix/bormi-api-origin` into `main`, no conflicts).
- Root/BFF deployment `76f59061-d25d-4679-aa62-65be3b3c2c43`
  (`https://76f59061.ai-direct-pro-landing.pages.dev`, aliased to `gptbot.uz`);
  static Mini App deployment `2af92899-46b6-4356-ae5d-573aa7455837`
  (`https://2af92899.gptbot-market-mini-app.pages.dev`). Both carry the exact
  commit hash `4367850`. Rollback targets stay `41a3d4de` / `49111efd`
  (source `d47d998`).
- The buyer taps a microphone in the search field or on the home hero, speaks
  RU, Uzbek Latin or a mix, and gets the transcript, the understood constraints
  and grounded catalog products in one response.
- The catalog/search backend was **not** rewritten. `POST /voice/search` and
  `GET /catalog/products` share one `runCatalogSearch`;
  `searchPublishedProducts`, `rankCatalogProducts` and the shared UZS
  `parseBudget` are reused unchanged. No D1 migration, no schema change.
- Speech reuses the production Voice-to-Reply Groq Whisper stack through the
  platform AI facade's `transcribe` capability. No new provider, no new
  credential — `GROQ_API_KEY` and optional `OPENAI_API_KEY`.
- Interpretation is deterministic code, not a model: no model may name a
  product, price, availability or category. One clarification at most; a
  cueless number is never applied as a price.
- Audio never leaves request memory and is never persisted or logged; the
  transcript goes to the speaker only.
- `Permissions-Policy` is now `microphone=(self)`; CSP unchanged.
- Evidence: 21/21 voice tests, 152/152 Market+catalog, 83/83 platform, 15/15
  Mini App, boundaries OK, ESLint 0, secret scan clean 2,967 files, root and
  Mini App builds PASS, Functions bundle compiles.
- Release verification on the merge commit: root and Functions TypeScript 0
  errors, Mini App typecheck 0; targeted Market/voice/platform corpus 107/107;
  Mini App 15/15; boundaries OK; secret scan clean over 2,975 files; root build
  113 pages / 124 articles / sitemap 240; Mini App bundle byte-identical to the
  pre-merge measurement.
- Live canaries after deploy: `gptbot.uz` root, RU and UZ Sotuvchi, the
  immutable root deployment, the canonical and immutable static Mini App and
  both hashed assets all 200; Agents webhook `GET` 405 and unauthorized `POST`
  401; `POST /api/market/v1/voice/search` without a session 401 (authentication
  is enforced before the feature flag); `GET /bootstrap` 401; malformed
  `POST /session/launch` 400. The deployed static site serves
  `Permissions-Policy: camera=(), microphone=(self), geolocation=(), payment=(),
  usb=()` with the CSP unchanged.
- Read-only D1 probe after deploy: stores 1, products 48, orders 1, order items
  1, inventory moves 44, handoffs 1, notifications 0, storefront sessions 2,
  agent routes 1, onboardings 0 — identical to the v8 baseline. `changed_db`
  false and `rows_written` 0. No migration, no schema change, no Telegram Bot
  API call.
- Next gate: the native Telegram voice canary in `@BormiMarketBot` (RU, UZ and
  one microphone-denied run) — §11 of the release record. Voice must not be
  called confirmed until the owner completes it on a real device.
- Record: `mini-app/implementation/BORMI_VOICE_SEARCH_RELEASE.md`.

### Bormi production rebrand — 2026-08-02

- Status: `BORMI_REBRAND_LIVE_FOR_TELEGRAM_REVIEW`.
- Public brand and mechanic: **Bormi**, **Bormi? — Bor.**
- Source: `5c9e004c1b21e13a1ff0913f1c6d54f99d367f10`.
- Static production: `2fc305fb-3a68-48c2-b7cf-adf218cd2a7a`;
  root/BFF production: `2625bbad-5899-4d51-967d-85347d6c8ecc`.
- The dedicated `@BormiMarketBot` now owns the verified webhook, Bormi profile,
  avatar, commands and native Mini App menu. Runtime sync first verifies the
  exact `getMe` username; the lead bot and its webhook/token are untouched.
- Twelve labelled synthetic WebPs total 232,770 bytes. Static first paint,
  preloads, cache-first assets and lazy seller code address launch perception.
- Buyer RU/UZ/dark and seller a11y: 0 violations/incomplete; responsive target,
  overflow and reduced-motion checks pass.
- A verified 10.8 MB D1 backup preceded the scoped update of two bot-username
  references. Domain counts remained identical and the final read probe wrote
  zero rows. No schema migration, real-store/catalog, payment, Railway/n8n or
  public-marketplace mutation occurred.
- Full evidence and rollback:
  `mini-app/implementation/BORMI_REBRAND_RELEASE.md`.

### Mini App Telegram review track — superseded baseline (2026-08-02)

- Статус: `TELEGRAM_REVIEW_LIVE`; реализация:
  `MA_0_THROUGH_MA_8_RELEASED_FOR_NATIVE_REVIEW`.
- Ветка: `feature/gptbot-market-mini-app-synthetic-candidate`.
- Пакет: `docs/agents-platform/mini-app/README.md` и связанные architecture,
  security, UX, migration, testing, risk, proposed ADR и master-roadmap docs.
- Static Pages: `a08d2d0f-ab72-4be2-a385-c482025833a5`; root Pages:
  `f64e7fee-3b3c-4914-9fc2-3d80e5e761db`; both source `fb3537a`.
- `@gptbot_market_bot` exposes the app through a native response button and
  TTL-limited menu sync. The lead bot/webhook is untouched.
- No D1 migration, Railway/n8n/payment, real-store or public marketplace
  action was performed.
- Запрошенный источник
  `GPTBOT_MARKETPLACE_MASTER_CHAT_HANDOFF_2026-08-01(1).md` не найден после
  проверки repository/docs/attachments; его статус зафиксирован как
  `SOURCE_MISSING`, без реконструкции отсутствующего содержания.

### Mini App release update — 2026-08-02

This update supersedes the local-candidate paragraph. The owner explicitly
authorized Telegram integration. Static hosting is isolated, while the BFF
and encrypted bot token remain in the existing production trust boundary. All
four Mini App flags are enabled for review, but seller authority is still
resolved from trusted server state on every request. Native Telegram review is
the next human acceptance gate; public marketplace launch is not claimed.

The subsequent performance update replaces the session/bootstrap/catalog
waterfall with one authenticated launch request, seeds first-page data,
defers the Telegram bridge and seller code appropriately, and displays eight
coherent, labelled synthetic product photos. The image set is 157,434 bytes;
protected media requests are skipped when a local demo preview exists. D1 was
read-only and identical before/after.

## 2. Что сделано

Truth and naming were aligned to runtime. Warm Market Signals, RU/UZ Market and
Trust surfaces, buyer/seller Telegram polish, safe media cards, brand assets,
33-master creative kit, marketing/analytics/operations/pilot packages and
production accessibility evidence were implemented. The full baseline is
green, the feature was normally merged, and Pages deployment `68747046` was
uploaded manually from exact merge `08c2156`.

Production HTTP/auth/SEO and Mini App canaries pass. D1 stayed unchanged.
Auto-deploy, Railway, migrations, lead-bot provider metadata, real store,
payments and public marketplace were not mutated.

## 3. Изменённые файлы

- `content/pages/{ru,uz}/{sotuvchi,market-*}.json`: truthful Market/Trust copy.
- `scripts/market-page.ts`, `src/market/market.css`, `scripts/prerender.ts`:
  production conversion surface and responsive design system.
- `functions/agents/sotuvchi/**`, `functions/channels/telegram/**`: grounded
  media/freshness cards, compact actions/navigation, truthful seller/dashboard
  copy; authority and schema unchanged.
- `public/assets/market/**`: mark, wordmark, avatar, favicon, OG, fallback and
  33 SVG/PNG creative pairs.
- `docs/product/GPTBOT_MARKET_*.md`: truth, design, positioning, identity,
  creative, marketing, metric, operations, pilot, trust, a11y and visual QA.
- `docs/agents-platform/evidence/gptbot-market-productization-2026-08-01/**`:
  sanitized production visual and automated evidence.
- release/governance docs: exact deployment, rollback, owner capture and next
  gate. No PII or secret values are stored.

## 4. Архитектурные решения

D-032 naming/evidence-bound promise; D-033 Telegram `file_id` media contract;
D-034 labelled synthetic proof; D-035 automated a11y scope; D-036 exact-SHA,
data-neutral release.

## 5. Что сознательно не сделано

No remote D1 migration, real order/store/product import, payment, escrow,
logistics, public marketplace, public launch, advertising, outreach, BotFather
mutation, Railway deploy/reconnect, n8n restore or scheduler enablement. No
native Uzbek, VoiceOver/TalkBack, real seller acceptance or stable-p95 claim.

## 6. Проверки

- `node --import tsx --test --test-concurrency=1 tests/*.test.ts` → 1146/1146.
- catalog suite → 60/60; release/pilot/OCC corpus → 100/100.
- root and Functions TypeScript → exit 0; backend typecheck/build → exit 0.
- `yarn build` → exit 0, 113 pages + 118 articles, sitemap 234.
- `wrangler pages functions build` → compiled successfully.
- ESLint changed TS/TSX → 0; agent boundary checker + tests → 0 and 10/10.
- root/backend production audit → 0/0 findings.
- secret scan → clean 2,936 files; browser bundles → clean 14 files.
- migration/backup/pilot rehearsal → pass, local only.
- production a11y → 7 pages, 0 violations/incomplete, 171 passes; overflow,
  keyboard and reduced motion all pass.
- production HTTP → 200/404/405/401 contracts exact; canonical/hreflang/OG pass.
- D1 before/after → unchanged, `rows_written=0`.
- `git diff --check`, `git fsck --full` → pass/no corruption.

## 7. Известные проблемы

Предсуществовавшие: migration ledger 0025 vs physical 0026–0030; unused secret
name `___`; stable p95 not established. Этап не добавил correctness/security
defect. Внешние блокеры: owner Telegram/OCC evidence, legal/native Uzbek review,
one verified consenting seller, 10–30 real products and operating owners/SLA.

## 8. Следующая задача

Collect and validate the single owner package, then prepare a separately
authorized one-store activation. Do not infer authorization from the package.

## 9. Acceptance criteria следующего этапа

Verified seller identity and dated consent; category selected; 10–30 products
pass the import validator with integer UZS and stock; media via Telegram
`file_id` or explicit no-photo decision; fulfillment/payment-by-seller, SLA,
support, incident and daily-review owners recorded; legal/native Uzbek decision;
explicit activation and cohort bounds. Payments and public marketplace remain
off.

## 10. Команды для старта

Read `STATE.json`, this handoff and the owner evidence script; run `git fetch
--all --prune`, `git status --short`, `git rev-parse HEAD origin/main`, list
Pages deployments, run D1 aggregate read-only checks, and validate the filled
pilot import without applying a remote migration.

## 11. Риски

Never treat a role button as authority, accept URL media, replay remote
migrations, expose contact/query data in analytics, create a production order
for convenience, or describe synthetic evidence as seller success. Stop on
identity/webhook/schema/tenant/idempotency mismatch.

## 12. Rollback

Full pre-Mini-App rollback target is Pages deployment
`68747046-8e1e-492a-8b81-dc4e4065916f` at source `08c2156`; disable the four
flags and restore Telegram's default menu button first. No D1 rollback is
required or allowed. Repeat HTTP/auth and D1 read-only canaries after rollback
and retain the deployment evidence.
