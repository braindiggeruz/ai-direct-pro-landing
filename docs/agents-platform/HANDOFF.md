# GPTBot Agents — Handoff

## 1. Состояние
- Дата: 2026-07-26
- Ветка: `main`
- Исходный HEAD P0.4: `7ffb4db13096a6983cb3f5febe8d9a33278ad619`
- Code commit P0.4: `1f683380078629f67c2fef16a6fe68fd8ba96840`
- HEAD после relay: последний metadata-only commit в `git log`; по D-006 `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA
- Завершённый этап: **P0.4 — Identity/Orgs/Tenancy**
- Следующий этап: **P0.5 — Platform AI façade**
- Рабочее дерево после relay: только давний pre-existing untracked `apps/gpt-backend/package-lock.json`; файл не изменён, не удалён и не добавлен в коммиты

## 2. Что сделано
1. Проверены source HEAD, branch, STATE gate и baseline P0.3: platform events 20/20, boundaries 10/10, Telegram compatibility 1/1, Telegram assistant 60/60, gpt-chat 15/15, `tsc -b` 0, ровно 27 legacy functions errors и 0 platform-scope.
2. Проанализированы legacy `users`, `telegram_users`, gpt-chat/admin identity patterns. Они не мигрировались и не связывались с новым platform layer.
3. Добавлены provider-neutral `identities` с закрытым provider union `telegram|web|email|phone|api`, provider-specific normalization и idempotent/race-safe `(provider, external_id)` resolution.
4. Telegram external id хранится только строкой. Email lower-case нормализуется, phone приводится к минимальному E.164-подобному виду; значения не логируются и не отправляются в events.
5. Добавлены `organizations` как tenant roots с safe unique slug, status `active|suspended|archived` и locale `ru|uz`.
6. Добавлены memberships с ролями `owner|staff` и status `active|disabled`; duplicate create не меняет существующую роль и не может понизить owner до staff.
7. Добавлены PII-minimal contacts: identity link, tenant, locale и timestamps; phone/display name/raw profile отсутствуют.
8. Все membership/contact methods инкапсулированы factory store и принимают `orgId` первым бизнес-аргументом. Reads, lists и updates фильтруются по `org_id`; cross-tenant доступ маскируется как not found.
9. Создан `createOrganizationForOwner`: identity разрешается отдельно, organization+active owner membership записываются атомарным D1 `batch()`.
10. Добавлена additive migration `0014` и два idempotent runtime bootstraps. Foreign keys обеспечивают целостность, но tenant isolation доказана repository-запросами и негативными тестами.
11. Добавлен in-memory D1 suite из 31 теста, включая concurrent identity resolution, cross-org reads/lists/updates и rollback tenant batch.
12. Migration дважды успешно выполнена через локальный Wrangler D1; remote/production D1 не затрагивалась.

## 3. Изменённые файлы
- `migrations/0014_platform_identity_orgs.sql` — четыре additive таблицы, CHECK/UNIQUE/FK constraints, три дополнительных индекса и rollback notes.
- `functions/platform/identity/types.ts` — provider union и domain/create-result shapes.
- `functions/platform/identity/store.ts` — весь identity SQL, normalization/validation, idempotent race-safe repository.
- `functions/platform/identity/schema.ts` — retry-safe per-D1 runtime bootstrap.
- `functions/platform/identity/service.ts` — тонкая bootstrap-aware service surface.
- `functions/platform/identity/index.ts` — public identity exports.
- `functions/platform/orgs/types.ts` — organization/membership/contact unions и domain/input/result types.
- `functions/platform/orgs/store.ts` — весь organizations/memberships/contacts SQL, tenant-scoped API и atomic organization+owner batch.
- `functions/platform/orgs/schema.ts` — identity-first retry-safe runtime bootstrap.
- `functions/platform/orgs/service.ts` — `createOrganizationForOwner` orchestration без прямого SQL.
- `functions/platform/orgs/index.ts` — public organizations/tenancy exports.
- `functions/platform/index.ts` — экспорт identity/orgs modules; Pages handler exports не добавлены.
- `tests/platform-tenancy.test.ts` — 31 test на typed in-memory D1 fake с transactional batch rollback.
- `docs/agents-platform/{HANDOFF.md,STATE.json,TEST_MATRIX.md,CURRENT_STATE.md,DECISIONS.md}` — P0.4 relay и D-009.

## 4. Архитектурные решения
- **D-009:** отдельная `persons` на P0.4 не вводится. Identity достаточно для membership/contact linking; identity merge и linking UI отсутствуют, legacy users не backfill.
- Identity global и provider-scoped; `external_id` всегда string и может храниться только в identity table, но не в analytics/events/logs.
- Organization — tenant root. Workspace и permission matrix не добавлены.
- Contacts tenant-scoped и PII-minimal: без phone, display name и raw channel profile.
- Cross-tenant membership/contact read/update возвращает not found/null и не раскрывает существование строки другого tenant.
- Global identity создаётся/разрешается отдельно; organization+owner membership — единый transactional D1 batch. При batch failure обе tenant rows откатываются, identity остаётся независимой валидной записью.

## 5. Что сознательно не сделано
- Не введена `persons`, identity merge, OAuth, password auth, invitations или permissions engine.
- Не мигрированы и не backfill legacy `users`, `telegram_users`, admin JWT/identities или web-chat auth.
- В contacts не добавлены phone, display name, consent data или raw Telegram profile.
- Не реализованы organization delete, suspension behavior, dashboard, billing scope или contact UI.
- Не добавлены platform events P0.4 и не изменён Javob events bridge P0.3.
- Не начаты P0.5 AI façade, Knowledge, Workflow, Runtime, agent webhook, Sotuvchi, commerce, scheduling или handoff.
- Не исправлялись 27 legacy TypeScript errors и глобальный legacy lint.
- Production migration, push и deploy не выполнялись.

## 6. Проверки
- Baseline/post-change `npx tsc -b` → exit 0.
- Post-change `node --import tsx --test tests/platform-tenancy.test.ts` → 31/31.
- Baseline/post-change `node --import tsx --test tests/platform-events.test.ts` → 20/20.
- Baseline/post-change `node --import tsx --test tests/agent-boundaries.test.ts` → 10/10.
- Baseline/post-change `node --import tsx --test tests/telegram-channel-compat.test.ts` → 1/1.
- Baseline/post-change `node --import tsx --test tests/telegram-assistant.test.ts` → 60/60.
- Baseline/post-change `node --import tsx --test tests/gpt-chat.test.ts` → 15/15.
- Baseline/post-change `npx tsc -p tsconfig.functions.json --noEmit` → exit 2, ровно 27 legacy errors, 0 в `functions/{platform,agents,channels}`.
- `npx eslint functions/platform/identity functions/platform/orgs tests/platform-tenancy.test.ts functions/platform/index.ts` → exit 0.
- SQL outside new store/schema files → 0; forbidden platform imports → 0; production code/test `any` → 0.
- `npx wrangler d1 execute GPTBOT_DRAFTS_DB --local --file migrations/0014_platform_identity_orgs.sql` → 7/7 statements, exit 0; повторный запуск → 7/7, exit 0.
- Local `sqlite_master` verification → 4 tables, UNIQUE autoindexes и `idx_memberships_org_status`, `idx_memberships_identity_status`, `idx_contacts_identity`.
- Migration scan → 0 executable destructive statements; rollback notes present.
- Staged secret/PII scan → Telegram token 0, env/dev vars/secrets 0; только разрешённые фиктивные `100000001`, `test@example.invalid`, `+998000000000`; raw profile fields 0.
- `git diff --check` и staged `git diff --check` → exit 0.

## 7. Известные проблемы
- Существовали до P0.4: 27 functions-config legacy errors; global legacy-red ESLint; OOM-риск машины; остальные пункты `KNOWN_ISSUES.md`.
- Ограничение P0.4: identity — global independent record. Если transactional org+membership batch падает после создания новой identity, identity остаётся; это безопасная orphan-like запись без tenant data, а не частично созданная organization.
- Ограничение P0.4: person merge/linking и перенос legacy users отложены до доказанной необходимости.
- Ограничение P0.4: contacts сознательно не подходят для checkout PII до отдельной retention/consent модели.
- Новых блокеров и внешних зависимостей нет.
- Pre-existing untracked `apps/gpt-backend/package-lock.json` намеренно не тронут.

## 8. Следующая задача
Только **P0.5 — Platform AI façade**: создать provider-neutral contracts `complete`, `stream`, `structured`, `transcribe`, model/provider policy из config и тонкие adapters поверх существующих `lib/llm`, gpt-chat OpenRouter и Telegram AI implementations. Structured output обязан проходить strict runtime schema validation. Legacy consumers не переключать массово и не начинать P1.

## 9. Acceptance criteria следующего этапа
1. `STATE.json.next_stage == "P0.5"` и source HEAD/tree подтверждены; pre-existing package-lock не тронут.
2. `functions/platform/ai/**` не импортирует agents/channels и не создаёт Cloudflare route exports.
3. Public façade имеет закрытые typed request/result/error contracts для `complete`, `stream`, `structured`, `transcribe`; provider-specific wire formats остаются в adapters/drivers.
4. Model/provider chain выбирается конфигурацией/policy, а не агентским hardcode; secrets только из env и не попадают в errors/logs.
5. Structured response валидируется runtime schema и fail-closed; malformed provider output не проходит как domain value.
6. Existing AI implementations оборачиваются тонкими adapters или совместимыми shims; массовая миграция Javob/gpt-chat и изменение product behavior запрещены.
7. Streaming cancellation/error semantics и transcribe media limits явно определены и протестированы без реальных network calls.
8. Все прежние gates не ниже: tenancy 31/31, events 20/20, boundaries 10/10, compatibility 1/1, Telegram 60/60, gpt-chat 15/15, `tsc -b` 0, functions-config ≤27 legacy и 0 platform-scope; новые files ESLint 0.
9. Не начаты Knowledge, Workflow, Runtime, agent webhook, Sotuvchi или массовая legacy migration.
10. STATE/HANDOFF/TEST_MATRIX/CURRENT_STATE обновлены; максимум code+relay commits; push/deploy отсутствуют без отдельного разрешения.

## 10. Команды для старта
```powershell
cd F:\Claude\gptbot-repo
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ARCHITECTURE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ROADMAP.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\CURRENT_STATE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\TEST_MATRIX.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\KNOWN_ISSUES.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\DECISIONS.md
git status --short
git branch --show-current
git rev-parse HEAD
git log -8 --oneline
git diff
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b
node --import tsx --test tests/platform-tenancy.test.ts
node --import tsx --test tests/platform-events.test.ts
node --import tsx --test tests/agent-boundaries.test.ts
node --import tsx --test tests/telegram-channel-compat.test.ts
node --import tsx --test tests/telegram-assistant.test.ts
node --import tsx --test tests/gpt-chat.test.ts
npx tsc -p tsconfig.functions.json --noEmit
```

## 11. Риски
- Не превращать AI façade в P1 Runtime и не переносить три legacy implementations целиком одним большим refactor.
- Не ослаблять boundary checker; platform AI не должен зависеть от Telegram types, agents или product UI.
- Не менять Javob/gpt-chat prompts, model behavior, quotas, billing, auth, routes или SSE contract «заодно».
- Не логировать prompts, raw outputs, API keys, external identity ids или contact data.
- Не направлять P0.5 code к новым identity/org stores без явной необходимости: AI policy может принимать safe org/agent ids, но tenancy business logic не входит в этап.
- Lead-бот `aidirectprobot`, его route/token/webhook неприкосновенны.
- Не исправлять legacy errors, не добавлять package-lock/generated files и не выполнять push.

## 12. Rollback
- Отменить metadata relay P0.4: `git revert <последний metadata-only SHA из git log>`.
- Затем отменить code commit: `git revert 1f683380078629f67c2fef16a6fe68fd8ba96840`.
- Production D1 не изменялась. Локальная Wrangler state не отслеживается git и может быть удалена отдельно при необходимости.
- Если `0014` позже применят к remote D1 и следующие stages ещё не используют данные, вручную удалить `contacts`, затем `memberships`, `organizations`, `identities`; git revert D1 schema не откатывает.
- Не использовать `reset --hard` или `clean -fd`; pre-existing package-lock должен сохраниться.
