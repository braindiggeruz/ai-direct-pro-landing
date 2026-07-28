# KNOWN_ISSUES — существовало ДО платформы (не чинить «заодно», только целевыми этапами)

## R0.1 checkpoint

Локально закрыты два исходных web release blockers:

- React Router 7.15.1 обновлён до 7.18.1. В production audit остаётся только
  `GHSA-qwww-vcr4-c8h2`: advisory относится к React Server Components mode,
  которого в текущем declarative BrowserRouter приложении нет. Major upgrade
  ради неприменимого пути в R0.1 не выполнялся.
- GPT Chat configured-secret/missing-token bypass закрыт. Turnstile идёт до
  Railway/quota/provider, проверяет action/hostname, fail-closed на
  invalid/replay/outage; direct Railway chat требует gateway secret.

Не закрыты и не входят в R0.1: Fastify/Railway dependency chain (R0.2),
credential incident и Git history (R0.3), CI/release preparation (R0.4),
production rollout (R1). Release остаётся заблокирован.

## Legacy lint-долг (`npx eslint .` = 84 problems, 71 errors) — файлы:
apps/gpt-backend/src/routes/{admin,chat}.ts · functions/api/admin/seo/cannibalization/{analyze,retarget}.ts ·
functions/api/payments/webhook.ts · functions/lib/ai-drafts/ctr-boost-runner.ts ·
functions/lib/gpt-chat/{payments,prompt}.ts · functions/lib/intent-guard/{inventory,retarget-client,serper-shortlist}.ts ·
scripts/{apply-research,seo-audit,tech-audit,test-control-center-sync}.ts (+unused eslint-disable warnings в src).
Характер: unused vars, no-useless-escape, prefer-const, no-this-alias. Продукт не ломают. НЕ относится к GPTBot Agents.

## Прочий подтверждённый долг
- `gptbot-audit/` + вложенный дубль — мусор Bolt в git; решение об удалении за владельцем.
- `.emergent/`, `memory/PRD.md`, `test_result.md`, `test_reports/` — скаффолдинг Emergent (июнь), мёртвый.
- Lead-бот: state в памяти isolate (заморожен; паттерн ЗАПРЕЩЁН для новых модулей).
- Retention-cleanup только opportunistic (нет cron). Cron-Worker появится этапом платформы (нужен Clinic; Sotuvchi v0 живёт без него).
- Railway-gateway: код есть, прод-env не подтверждён; прод живёт на D1-пути.
- Три параллельные AI-обвязки (lib/llm, lib/gpt-chat/openrouter-*, lib/telegram/service) — сливаются этапом P0.5, не раньше.
- `telegram_users.daily_usage_count` — legacy-счётчик; истина = usage_ledger.
- `npm run test` одним процессом может OOM'ить на машине владельца (среда, не код) — см. TEST_MATRIX.
- Chrome network-лог показывает ERR_ABORTED на SSE веб-чата — косметика закрытия соединения.
- Логотип: в repo только logo-sq.webp + favicon.svg; master-SVG-набора и 1024-аватара нет.

## Внешние блокеры (НЕ считать доступными)
Click/Payme merchant API (нет доков/credentials) · фискальные чеки/my.soliq · Instagram/WhatsApp Business API · Uzum/OLX.

## Обнаружено на P0.1 (существовало до платформы)
- tsconfig.functions.json НЕ входит в tsc -b (references = app+node only) — functions/** исторически без typecheck-гейта.
- `npx tsc -p tsconfig.functions.json --noEmit` = 27 ошибок в 6 legacy-файлах: api/admin/ai-drafts/[id]/status.ts, api/admin/cockpit.ts, api/admin/seo/yandex/quick-launch.ts, lib/seo-autopilot/normalise.ts, lib/telegram/analysis.ts, lib/telegram/handler.ts. Платформенные пространства обязаны держать 0 (D-007); глобальное подключение functions в tsc -b — отдельный будущий этап.
