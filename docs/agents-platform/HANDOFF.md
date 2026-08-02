# GPTBot Agents — Handoff

## 1. Состояние

- Дата: 2026-08-02.
- Ветка: `feature/gptbot-market-mini-app-synthetic-candidate`.
- Application HEAD: `67b98a5`;
  governance state commit: `HEAD`.
- Завершённый этап: owner-authorized Telegram Mini App review integration.
- Следующий этап: native Telegram owner review; Store Pilot #1 remains a
  separate owner input/authorization gate.
- Рабочее дерево: clean after the governance commit; `dist/` untracked/ignored.

### Mini App Telegram review track — 2026-08-02

- Статус: `TELEGRAM_REVIEW_LIVE`; реализация:
  `MA_0_THROUGH_MA_8_RELEASED_FOR_NATIVE_REVIEW`.
- Ветка: `feature/gptbot-market-mini-app-synthetic-candidate`.
- Пакет: `docs/agents-platform/mini-app/README.md` и связанные architecture,
  security, UX, migration, testing, risk, proposed ADR и master-roadmap docs.
- Static Pages: `a7e0cfdc-c53e-4ddd-a9df-13023a6fbafc`; root Pages:
  `3af470f3-0666-4d4d-8eab-53c91a7cd9df`; both source `67b98a5`.
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

- `node --import tsx --test --test-concurrency=1 tests/*.test.ts` → 1076/1076.
- catalog suite → 60/60; release/pilot/OCC corpus → 100/100.
- root and Functions TypeScript → exit 0; backend typecheck/build → exit 0.
- `yarn build` → exit 0, 113 pages + 118 articles, sitemap 234.
- `wrangler pages functions build` → compiled successfully.
- ESLint changed TS/TSX → 0; agent boundary checker + tests → 0 and 10/10.
- root/backend production audit → 0/0 findings.
- secret scan → clean 2,868 files; browser bundles → clean 14 files.
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
