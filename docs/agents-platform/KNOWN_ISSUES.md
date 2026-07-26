# KNOWN_ISSUES — существовало ДО платформы (не чинить «заодно», только целевыми этапами)

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
