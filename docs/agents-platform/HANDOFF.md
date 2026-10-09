# HANDOFF — Google discovery feeds · 09.10.2026

## 1. Состояние
Owner approved implementation of the Google recrawl roadmap; prior deployment authorization remains active. Checkout F:/Claude/gptbot-codex-integration-20261007, branch codex/continuation-20261007. Baseline HEAD21dca8fc, live source63e9cee3. Implementation locally verified; guarded production build/deploy and discovery readback are the next step.

## 2. Что сделано
RSS selects by authored modification date; new200entry Atom includes canonical services and articles. Short cache overrides, post-deploy WebSub with live bytes/manifest gate, durable hash dedupe and bounded retry. Three real article improvements and contextual links.

## 3. Файлы и доказательства
scripts/feed-data.ts, generate-feed.ts, generate-updates-feed.ts, generate-robots.ts, websub-ping.ts, release/pages-production.ts. Three articles listed in reports/google-recrawl-implementation-20261009/content-changes.json. Report IMPLEMENTATION.md, tests, cache-local.json, browser-local.json and original research.

## 4. Решения
Deterministic source dates; no Indexing API for unsupported content. WebSub ledger in shared Git directory, accepted hashes skipped, ambiguous outcomes not retried. Release readback retries GET only, never a second upload. Existing release guards retained.

## 5. Внешние действия
Read-only production/GSC and local tests so far. No live leads/messages, schema/credentials/webhook changes or Git push. Prior commercial/fiscal work preserved. Follow-up real Google crawl and business measurements remain separate from notification acceptance.

## 6. Проверки
73/73 targeted tests, final discovery subset10/10, app/functions/scripts TypeScript, scoped lint, build:fast, SEO audit PASS; protected10/10. Browser3/3 at320/1280 no document overflow or pageerrors. Full artifact check waits for production build (build:fast intentionally omits Studio/admin).

## 7. Проблемы
Existing Click Merchant -12/receipt UNKNOWN blocker untouched. Actual ranking/lead/revenue effect unmeasured. Durable WebSub state is local to the shared Git repository on this release host.

## 8. Следующая задача
Commit reviewed runtime, build:production, guarded check/deploy, exact live readback, submit Atom to GSC and record receipts.

## 9. Acceptance
Three canonical feeds match local bytes and correct cache/media type; Atom200entries all indexable sitemap members;7previously excludedRU articles restored;6core service pages have crawlable donor paths;10protected unchanged. Google crawl time must be evaluated separately.

## 10. Команды
NODE_OPTIONS=--max-old-space-size=1400; npm run build:production; DR_ROOT=this checkout; python F:/Claude/gptbot-tools/deploy_runner.py check then deploy. Never repeat unknown deployment writes without readback. npm run websub:ping independently verifies stamped/live release and shared state.

## 11. Риски
A hub acknowledgement is not a Google crawl. Do not clear pending/unknown state or a lock without reconciliation. Never use fake JobPosting/BroadcastEvent or bump all dates during a build. Preserve protected10, commercial lead contract and fiscal safety.

## 12. Rollback
Targeted revert of this stage then guarded release. Previous live source63e9cee37c9a6acf45356c3494c511bb98f8b22f, deployment3958a695, artifact47d71f3eef4a5ae0126cfaa55d42d188104222d7e7d5220fde3d010322a7e51c. No DB migration. Keep unknown notification evidence.
