# GPTBot Agents — Handoff

## 1. Состояние
- Дата: 2026-07-27
- Ветка: `main`
- Исходный HEAD P1.3:
  `f554fe843946cf940537f27b8a905342c6894cb4`
- Code commit P1.3:
  `854a3cf63d860f8f930ad8f66fc1d3c87a132036`
- HEAD после relay: последний metadata-only commit в `git log`; по D-006
  `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA.
- Завершённый этап: **P1.3 — Agent Runtime minimum**
- Следующий этап: **P1.4 — Telegram agent webhook**
- P1.2 подтверждён в ancestry: code
  `cc4484dc72604060068c016e307a8bc766c94cec`, relay/source
  `f554fe843946cf940537f27b8a905342c6894cb4`.
- Рабочее дерево после relay должно содержать только pre-existing untracked
  `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`; они не изменялись,
  не удалялись и не добавлялись в коммиты.
- `origin/main` во время P1.3 оставался
  `93fab390733d3d5ffbf052e211d95b6038ee4bbd`; push/deploy отсутствуют.

## 2. Что сделано
1. До изменений подтверждены STATE/git gate, source HEAD, P1.2 code/relay
   ancestry, два pre-existing untracked объекта и полный baseline.
2. Уточнены существующие `AgentManifest`, `Tool` и `Facts` contracts без
   параллельных несовместимых типов.
3. Добавлена strict runtime validation manifest: allowlisted keys, safe id,
   semver-like version, locales/capabilities/tools/rules/policies, optional
   workflow definitions и knowledge kinds.
4. Добавлен reusable `AgentRegistry` с controlled duplicate/unknown errors,
   deterministic list и explicit test reset. `functions/agents/registry.ts`
   остаётся единственной пустой production registration point.
5. Добавлен channel-neutral `RuntimeTurnInput` с обязательным tenant и strict
   rejection неизвестных/provider-specific полей.
6. Добавлен narrow `ToolContext`: org/request/locale и injected
   Knowledge/Workflow service ports без raw D1, channel clients, secrets или
   общего platform container.
7. Tool execution ограничено manifest closed-list, runtime schema и recursive
   tenant-override guard; exceptions нормализуются без input/upstream content.
8. Tool output проецируется в validated namespaced scalar-only `FactSheet`;
   arbitrary nested blobs и mismatched tool identity отклоняются.
9. Response строится deterministic locale template. Каждая подстановка Facts
   создаёт explicit exact claim.
10. Grounding fail-closed проверяет `claims ⊆ Facts` и все числа в
    text/choice labels against Fact values; failure не возвращает outbound.
11. Turn order реализован как active workflow port → sorted deterministic
    rules → optional AI closed-list selection → fallback. AI не вызывается
    первым и не генерирует финальный ответ.
12. Existing Platform AI façade используется одним runtime selection call;
    schema разрешает только `{tool, arguments}`, tool вне manifest и invalid
    args отклоняются.
13. Добавлен offline demo agent: trusted echo rule и один
    `knowledge.lookup` через narrow port с RU/UZ deterministic templates.
    Production registry demo не импортирует.
14. Добавлены 49 offline tests: manifests, registry, tools, grounding, routing,
    AI failures, workflow precedence, RU/UZ/mixed, restart, tenant isolation,
    provider boundary и content-free errors.
15. Никакая migration не требовалась; D1 и production behavior не менялись.

## 3. Изменённые файлы
- `functions/platform/contracts/{agent,tool,facts,runtime,index}.ts` —
  refined manifest/tool/Facts и channel-neutral runtime contracts.
- `functions/platform/runtime/errors.ts` — восемь compact controlled error
  classes с safe codes и без raw content.
- `functions/platform/runtime/manifest.ts` — strict runtime validation trusted
  manifests и declarations.
- `functions/platform/runtime/registry.ts` — reusable in-memory manifest
  registry без discovery/side effects.
- `functions/platform/runtime/tools.ts` — tool lookup/input validation,
  tenant-override rejection, execution normalization и FactSheet validation.
- `functions/platform/runtime/response.ts` — deterministic Facts templates и
  template-derived exact claims.
- `functions/platform/runtime/grounding.ts` — exact claim/numeric fail-closed
  grounding.
- `functions/platform/runtime/routing.ts` — input validation, sorted rules и
  AI closed-list selector.
- `functions/platform/runtime/runtime.ts` — единый turn orchestration и
  channel-neutral result.
- `functions/platform/runtime/{types,index}.ts`,
  `functions/platform/index.ts` — narrow ports, constructor/public exports.
- `functions/agents/registry.ts` — single empty production registry;
  `requireAgent` для controlled unknown.
- `functions/agents/{types,index}.ts` — compatibility/public types.
- `functions/agents/demo/{manifest,rules,tools,i18n,index}.ts` — offline-only
  echo + Knowledge fixture; не Sotuvchi.
- `tests/platform-runtime.test.ts` — 49 P1.3 tests.
- `tests/agent-boundaries.test.ts` — fixture приведена к strict manifest policy.
- `docs/agents-platform/{HANDOFF.md,STATE.json,CURRENT_STATE.md,TEST_MATRIX.md,DECISIONS.md}`
  — P1.3 relay и D-013.

## 4. Архитектурные решения
- **D-013:** один refined AgentManifest; declarations runtime-validatable,
  schema/rule/tool handlers — trusted code-only.
- Production registry — единственная явная registration point. Demo остаётся
  offline, dynamic filesystem loader отсутствует.
- Fixed order: caller-provided workflow port → deterministic priority →
  optional AI closed-list → fallback.
- AI выбирает только manifest tool и structured args; response не пишет.
- Tool capability минимальна; tenant приходит только из validated runtime
  input, а override keys в args запрещены.
- Facts — scalar namespaced projections. Tool output напрямую не рендерится.
- Grounding является механической гарантией exact claims/numbers, не NLP
  truth detector и не оценкой истинности свободного текста.
- Workflow boundary только injected port/stub; real D1 product integration
  отложена.
- Turn Events не добавлены без согласованной non-blocking publication policy.
  Conversation storage/history также отложены.

## 5. Что сознательно не сделано
- Не начат P1.4: нет Telegram agent route, webhook, secret-header, token,
  deep-link parser, dedup или renderer.
- Не начат Sotuvchi/P2: нет buyer/seller mode, product catalog, checkout,
  orders, inventory, handoff, payments, Mini App или product workflows.
- Demo не зарегистрирован production и не получает реальный D1 store.
- Не добавлены raw SQL/D1 access, channel clients, secrets, cron, event
  dispatcher, prompt registry, dynamic plugins или AI-generated code.
- Не добавлены turn Events, raw conversation storage/history или TTL.
- Не менялись Javob, lead bot, Telegram setup, gpt-chat, SEO, billing,
  Knowledge/Workflow storage behavior.
- Не исправлялись 27 legacy Functions TypeScript errors и global legacy lint.
- Push, deploy и production migration не выполнялись.

## 6. Проверки
- Pre-change `node ... tsc -b` → exit 0.
- Pre-change: Workflow 39/39, Knowledge 33/33, AI 15/15, tenancy 31/31,
  Events 20/20, boundaries 10/10, Telegram compatibility 1/1, Telegram
  assistant 60/60, gpt-chat 15/15.
- Post-change
  `node --max-old-space-size=256 --max-semi-space-size=4 --import tsx --test tests/platform-runtime.test.ts`
  → 49/49.
- Post-change Workflow 39/39, Knowledge 33/33, AI 15/15, tenancy 31/31,
  Events 20/20, boundaries 10/10, Telegram compatibility 1/1, Telegram
  assistant 60/60, gpt-chat 15/15.
- `node --max-old-space-size=512 --max-semi-space-size=4 node_modules/typescript/bin/tsc -b`
  → exit 0.
- Pre/post Functions typecheck → exit 2, ровно 27 legacy errors в 6 прежних
  файлах, 0 в `functions/{platform,agents,channels}`.
- Scoped P1.3 ESLint runtime/agents/contracts/tests/boundary script → exit 0.
- Boundary suite → 10/10; текущий tree имеет 0 violations.
- `git diff --cached --check` → clean.
- Staged credential/token/private-key/email/phone/`.env`/`.dev.vars` patterns
  → 0. Единственный provider ref — deliberate `chat_id` negative fixture.

## 7. Известные проблемы
- До P1.3: 27 Functions legacy errors, global legacy-red ESLint и OOM-риск;
  полный список — `KNOWN_ISSUES.md`.
- P1.3 grounding не является универсальным анализатором истинности natural
  language. Гарантируются explicit template claims и числа; trusted direct
  rules обязаны корректно объявлять claims.
- Workflow actions P1.2 всё ещё at-most-once, не durable-recoverable.
- Runtime Events отсутствуют до принятия best-effort/outbox policy.
- Production registry пуст до отдельной P1.4 registration/integration.
- Новых production blockers нет.
- Pre-existing untracked package-lock/audit artifacts намеренно не тронуты.

## 8. Следующая задача
Только **P1.4 — Telegram agent webhook**: создать отдельный route
`functions/api/telegram/agents.ts` (или `sotuvchi.ts`), использовать отдельные
`TELEGRAM_SOTUVCHI_*` token/secret, secret-header, dedup, `?start=` deep links,
нормализовать inbound/outbound через `channels/telegram` и провести demo agent
end-to-end. Не начинать Sotuvchi product behavior P2.

## 9. Acceptance criteria следующего этапа
1. Подтверждены `STATE.next_stage == "P1.4"`, source HEAD/tree и P1.3
   code/relay ancestry; pre-existing untracked не затронуты.
2. Новый Telegram agent endpoint полностью отделён от lead/Javob endpoints,
   tokens, webhook secrets, dedup keys и usernames.
3. Setup/identity guard доказывает username нового бота:
   `!= aidirectprobot` и `!= gptbot_javob_bot`.
4. Endpoint только POST, проверяет secret-header до parse/processing и
   fail-closed при missing/wrong secret.
5. Updates deduplicated tenant/channel-safe способом; повтор не создаёт второй
   runtime turn/outbound.
6. Telegram update нормализуется через `channels/telegram` в P1.3
   `RuntimeTurnInput`; core runtime не получает Telegram object/chat_id/token.
7. Runtime `Outbound` рендерится channel adapter'ом, без Telegram markup в
   platform runtime.
8. `?start=` deep-link payload strict, bounded и не может подменить org/agent
   вне разрешённого mapping.
9. Demo agent отвечает end-to-end через fake Telegram/runtime tests; production
   product/Sotuvchi catalog/checkout/orders не добавлены.
10. Runtime 49/49 и все P1.3 baseline suites не ниже TEST_MATRIX; Functions
    остаётся ровно 27 legacy errors и 0 platform/agents/channels; scoped lint
    и secret/PII scans зелёные.
11. Новые secrets только documented names, никогда не values; никакого
    push/deploy без отдельной явной команды.

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
git log -12 --oneline
git diff
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b
node --import tsx --test tests/platform-runtime.test.ts
node --import tsx --test tests/platform-workflow.test.ts
node --import tsx --test tests/platform-knowledge.test.ts
node --import tsx --test tests/platform-ai.test.ts
node --import tsx --test tests/platform-tenancy.test.ts
node --import tsx --test tests/platform-events.test.ts
node --import tsx --test tests/agent-boundaries.test.ts
node --import tsx --test tests/telegram-channel-compat.test.ts
node --import tsx --test tests/telegram-assistant.test.ts
node --import tsx --test tests/gpt-chat.test.ts
npx tsc -p tsconfig.functions.json --noEmit
```

## 11. Риски
- Не импортировать Telegram/channels/legacy в `platform/runtime` или concrete
  demo в runtime core.
- Не регистрировать demo/product agent до explicit P1.4 wiring и guards.
- Не передавать channel update, chat_id, token, secrets или raw D1 в runtime,
  manifest, rules или tools.
- Не разрешать deep link или AI arguments подменять `orgId`.
- Не обходить deterministic-first, tool schemas, closed-list и grounding.
- Не заявлять, что mechanical grounding определяет правду natural language.
- Не смешивать P1.4 transport integration с Sotuvchi product flows P2.
- Не трогать `aidirectprobot`, Javob, gpt-chat, SEO и существующие bot secrets.
- Не push/deploy без отдельной команды владельца.

## 12. Rollback
1. Если relay commit создан, сначала `git revert <P1.3-relay-SHA>`.
2. Затем `git revert 854a3cf63d860f8f930ad8f66fc1d3c87a132036`.
3. Migration/production writes на P1.3 отсутствуют, schema rollback не нужен.
4. Revert не должен затрагивать P1.2 commits, два pre-existing untracked
   объекта или unrelated production/legacy history.
