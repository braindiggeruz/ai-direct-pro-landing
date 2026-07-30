# GPTBot Agents — Handoff

## 1. Состояние

- Дата: 2026-07-30.
- Ветка: `feature/p3.1-owner-control-center`.
- HEAD этапа: `5f3d64548adb180627e10599396122edb04b85bf` (последний code/test commit); metadata relay определяется как `HEAD` по D-006.
- Завершённый этап: P3.1 Owner Control Center — только в feature-ветке.
- Следующий этап: P3.1 code review and controlled merge planning.
- Ветка отправлена в `origin`; `main` не менялся и остался на `463730e2442203f346e6059357f1fe2fae5edb84`.
- Рабочее дерево после relay должно быть clean; перед продолжением это обязательно подтвердить `git status --short`.

## 2. Что сделано

Добавлен внутренний Owner Control Center под `/admin-tools/agents`: overview,
stores/onboarding, безопасная карточка магазина, PII-minimized orders,
handoffs без текста переписки, first-party automation/DLQ replay,
append-only audit и controlled-pilot roster.

Все owner API используют один fail-closed JWT guard. Роли:
`support_readonly` только читает, `platform_owner` читает и меняет,
существующая подписанная роль `admin` явно отображается в
`platform_owner`. Неизвестные роли, seller, неверный issuer/signature,
просроченные tokens и некорректный actor отклоняются.

High-impact mutations требуют закрытый reason, idempotency key и точное typed
confirmation целевого ID. Tenant/org определяются только на сервере.
Audit INSERT и domain transition выполняются одним условным D1 batch.
Повтор одной логической операции даёт один эффект и одну audit-запись;
повторное использование ключа для другой операции даёт
`409 idempotency_conflict`.

UI переиспользует существующую admin SPA. Публичных ссылок, marketplace,
payments, impersonation, n8n, GitHub publication path и auto-publication не
добавлено. Marketplace показан только disabled placeholder.

Созданы implementation record и отдельный подробный R1 controlled-pilot
runbook. Runbook является процедурой; бот, магазины и пилот не создавались и
не запускались.

## 3. Изменённые файлы

- `functions/platform/admin/*` — централизованные roles, validation, HTTP
  errors/headers, безопасные projections и атомарные audit/lifecycle/replay
  helpers.
- `functions/api/admin/agents/**` — 11 owner API handlers с server-side
  authorization и tenant scoping.
- `migrations/0025_owner_control_center_audit.sql` — additive/repeat-safe
  `owner_audit_events` и `owner_pilot_stores`, CHECK limits и indexes.
  Migration в production не применялась.
- `src/admin/**`, `src/shared/owner-control-center.ts` — восемь внутренних
  screens, routing, API client, modal confirmations, loading/empty/error
  states и role-aware controls. Клиент не является authority.
- `tests/owner-control-center.test.ts` — 66 behavioural tests через реальные
  handlers и реальные migrations в in-memory SQLite.
- `tests/react-router-v8-migration.test.ts`,
  `scripts/release/react-router-route-inventory.ts` — точный allowlist восьми
  новых protected routes; public/static delta равен нулю.
- `docs/agents-platform/DECISIONS.md` — D-028.
- `docs/agents-platform/release/P3_1_OWNER_CONTROL_CENTER.md` — scope,
  contracts, security, deployment prerequisites и rollback.
- `docs/agents-platform/release/R1_SOTUVCHI_CONTROLLED_PILOT_RUNBOOK.md` —
  selection, onboarding, daily operations, metrics, incidents, hard stops,
  backup и rollback для будущего отдельно разрешённого R1.

## 4. Архитектурные решения

D-028: owner audit и domain mutation — одна условная D1 transaction.
Idempotency описывает полный логический actor/action/target/org/reason
contract, а не только уникальную строку. Automation Queue send остаётся
внешним side effect после commit; committed `queued` job восстанавливается
first-party dispatcher. Audit schema не принимает raw bodies, secrets, buyer
contacts или handoff text и имеет лимит metadata 2 KiB в приложении и D1.

## 5. Что сознательно не сделано

- Feature не merged в `main`.
- Production deploy, Cloudflare Pages/Worker deploy и Railway deploy не
  выполнялись.
- Migration `0025` не применялась ни к production D1, ни к другому remote D1.
- Production env, secrets, bindings, queues, cron и scheduler не менялись.
- Telegram bot/webhook не создавался и не менялся.
- R1 pilot и onboarding реальных магазинов не запускались.
- Marketplace, payments, escrow, seller impersonation, n8n и
  auto-publication не включались.
- Legacy storage admin JWT в `localStorage` не перерабатывался в рамках
  ограниченного P3.1 scope; новый client переиспользует существующий механизм.

## 6. Проверки

- `corepack yarn install --frozen-lockfile --ignore-scripts` → exit 0.
- `npm ci --ignore-scripts` в `apps/gpt-backend` → exit 0.
- `node --import tsx --test tests/owner-control-center.test.ts` → 66/66,
  10 suites, fail 0.
- Все 36 root suites, file-by-file в четырёх bounded batches →
  922/922, fail 0.
- `node --import tsx --test tests/react-router-v8-migration.test.ts` →
  26/26; protected route delta +8, public/static delta 0; built-asset
  credential scan clean.
- `corepack yarn tsc --noEmit -p tsconfig.functions.json` → exit 0,
  errors 0.
- `corepack yarn tsc --noEmit -p tsconfig.app.json` → exit 0, errors 0.
- `corepack yarn build` → exit 0; critical SEO 0, orphan 0, 106 pages,
  98 articles, sitemap 207.
- `corepack yarn wrangler pages functions build` → exit 0, Worker compiled.
- `npm run typecheck` и `npm run build` в backend → exit 0.
- Scoped ESLint по всем изменённым TS/TSX-файлам → exit 0.
- `corepack yarn scan:secrets` → clean, 2523 files.
- Root production dependency audit → 0 vulnerabilities / 115 packages.
- Backend `npm audit --omit=dev` → 0 vulnerabilities.
- Architecture boundaries → 10/10.
- Release preparation → 20/20.
- Automation runtime + n8n retirement → 29/29.
- `git diff --check` → clean.
- `git fsck --full` → exit 0; только один недостижимый dangling commit,
  повреждений repository нет.

Security verdict: AUTHORIZATION PASS; TENANT_ISOLATION PASS; AUDIT_SAFETY
PASS; IDEMPOTENCY PASS; NO_IMPERSONATION PASS; NO_PUBLIC_MARKETPLACE PASS;
NO_N8N PASS; NO_AUTO_PUBLICATION PASS.

## 7. Известные проблемы

Существовали до P3.1:

- Шесть `no-explicit-any` lint errors в `src/admin/lib/api.ts`, не затронуты.
- Automation Worker без LLM-provider secret fail-closed отвечает
  `llm_provider_missing`; owner-triggered Pages generation работает отдельно.
- Pages production содержит неиспользуемую secret variable `___`.
- UI evidence выключенного внешнего n8n workflow отсутствует; GPTBot-side
  route удалён/410, bindings отсутствуют, n8n остаётся retired.
- Build сообщает 28 missing hreflang и 55 известных generated
  internal-link false positives; critical SEO и orphan равны нулю.
- Backend `npm test` в Windows не разворачивает glob и находит 0 tests;
  реальные backend suites включены в root corpus и проходят.

Появились в P3.1: известных дефектов нет.

Внешние блокеры: merge/deploy/migration/pilot требуют отдельного явного
разрешения и review. Публичный Agents bot не создан.

## 8. Следующая задача

Провести P3.1 code review и controlled merge planning: проверить remote
feature SHA, review contracts и D-028, подтвердить отсутствие scope creep и
сформировать отдельное решение владельца. Не merge, не deploy и не применять
migration без нового явного разрешения.

## 9. Acceptance criteria следующего этапа

- Review использует только canonical clean repository/feature branch.
- Remote feature содержит все шесть P3.1 commits и имеет ожидаемый SHA.
- `origin/main` не изменён P3.1 работой.
- Authorization, tenant isolation, PII projection и atomic audit/idempotency
  получают явный review verdict.
- Dedicated suite остаётся 66/66, полный corpus 922/922 либо документирует
  только доказанную внешнюю причину расхождения.
- Migration `0025` проверена как additive/repeat-safe, но не применяется.
- Merge/deploy/pilot остаются отдельными явно авторизуемыми решениями.

## 10. Команды для старта

```powershell
cd F:\Claude\gptbot-p3.1-worktree
git status --short
git branch --show-current
git log --oneline --decorate -8
git fetch origin main feature/p3.1-owner-control-center
git rev-parse HEAD
git rev-parse origin/main
git rev-parse origin/feature/p3.1-owner-control-center
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
node --import tsx --test tests/owner-control-center.test.ts
corepack yarn tsc --noEmit -p tsconfig.functions.json
```

Не читать и не использовать recovery-копию `F:\Claude\gptbot-repo` и её
`gptbot.uz-audit`.

## 11. Риски

- Ослабление role guard или доверие `org_id`/tenant из request body создаст
  BOLA/impersonation.
- Разделение audit и domain mutation создаст ghost audit или неаудируемый
  эффект.
- Повтор Queue send до/внутри transaction нарушит exactly-once API semantics.
- Расширение projections может раскрыть buyer contact или raw conversations.
- Автоматический deploy feature обойдёт обязательный migration/review gate.
- Pilot нельзя начинать до отдельной R1 authorization, backup и hard-stop
  readiness.

## 12. Rollback

До deployment отмена P3.1 — последовательный `git revert` шести P3.1
commits в feature/интеграционной ветке либо отказ от feature-ветки.
Никакой remote data rollback не нужен: migration `0025` не применялась.

После будущего отдельно разрешённого deployment приложение откатывается на
последний reviewed release, owner mutations и pilot ставятся на паузу, а
`owner_audit_events`/`owner_pilot_stores` сохраняются как evidence. Таблицы
не удалять; queued jobs reconciliate через first-party runtime по
request/event IDs.
