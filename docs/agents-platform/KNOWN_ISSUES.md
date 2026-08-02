# KNOWN_ISSUES — существовало ДО платформы (не чинить «заодно», только целевыми этапами)

## Bormi voice search gates (2026-08-02)

Voice search is implemented and locally verified, not deployed and not
confirmed on a real device. Open items:

- No owner native canary. Nobody has spoken into `@BormiMarketBot` on a real
  Android or iOS Telegram client. Until that happens, do not describe voice
  search as live.
- No real speech-provider call was made in this stage. The transcription path
  is covered by unit tests against the AI contract and by the existing
  Voice-to-Reply implementation it reuses, not by a live Groq/OpenAI request.
- Telegram Web runs the Mini App in an iframe whose `allow` attribute Telegram
  controls. If it omits `microphone`, capture fails there and the buyer sees
  the unsupported state with typed search intact. Not reproducible locally.
- Voice is not separately measurable: it emits the existing
  `sotuvchi.search_results_shown` / `sotuvchi.zero_results` events and no new
  event type, so voice volume cannot be split from typed search in analytics.
- No axe run covers the new recording, clarification and error states. Contrast
  (6.05:1–20.08:1 in dark), 40×44 minimum targets and 320 px overflow were
  measured directly instead. No VoiceOver/TalkBack pass.
- The new RU/UZ voice copy has no native Uzbek sign-off.
- Attribute words (colour, size) rank but do not filter, because the catalog
  has no such field. This is disclosed through `unmatchedConstraints`, not
  hidden — but it is a real limitation of the answer.
- Speech round-trip latency on a real mobile link is unmeasured.
- The 21.dev catalog could not be queried live: the CLI is not signed in and
  `21st login` needs the owner's browser. Patterns were adapted from the skill
  documentation and the recorded Bormi pattern set instead.
- `GROQ_API_KEY` must exist in root Pages production before deploy. If it is
  absent the route fails closed with 503 and the microphone stays hidden, which
  is safe but means voice silently never appears.

## Mini App gates after Telegram review release (2026-08-02)

The static app, BFF and dedicated-bot launch path are live. The remaining gate
is human native Telegram verification on iOS/Android. Seller mode will not
appear for an identity without trusted active ownership; no review bypass is
allowed. Native Uzbek Latin sign-off, VoiceOver/TalkBack, stable p95, explicit
real seller/data/PII authority and public-cutover approval remain open. A
reviewer who submits checkout data creates a real request in production, so
test contact/address values must be used during review.

## GPTBot Market productization closeout (2026-08-01)

No owner-independent product, design, Telegram contract, web conversion,
creative, accessibility-automation, tenant, authorization, idempotency,
grounding, build or release blocker is open after deployment `68747046`.

Remaining evidence/business gates are explicit:

- VoiceOver and TalkBack have not been run by a human.
- Uzbek Latin has structural parity but no native-speaker sign-off.
- No real seller, real product, category proof, testimonial, delivery/payment
  agreement, seller SLA or pilot result exists.
- Product images accept Telegram `file_id`, not URLs. Pilot photos must arrive
  through the bot or the owner must approve a no-photo launch.
- Authenticated Owner Control Center screenshots remain owner evidence; no
  session or protected state was fabricated.
- The release environment did not expose a Telegram token, so fresh provider
  `getMe`/webhook/pending/error output remains part of the owner conversation
  canary. Public identity and webhook auth boundaries pass.
- Railway CLI/token was unavailable for a fresh control-plane read. No backend
  file changed and no Railway action/reconnect was performed; the last verified
  Git trigger state remains disconnected.
- `d1_migrations` still ends at 0025 while 0026–0030 are physically present.
  Never run `wrangler d1 migrations apply --remote` to reconcile this blindly.
- Public marketplace, payments and public launch remain unauthorized.

Store Pilot #1 is `READY_FOR_OWNER_INPUTS`, not started or accepted.

## R1.1 closeout update (2026-08-01)

No open R1.1 security, tenant, order, inventory or grounding defect is known.
The exact production source is `41ec9e3` in Pages deployment
`ede1d0f4-6a06-40e2-9b6c-dee2a7812c69`. The start-latency blocker is closed:
one owner `/start` on a cold isolate measured 2,564 ms of server-side
processing against a 12,451 ms newest baseline, with no business side effect.
Evidence: `release/R1_1_START_LATENCY_EVIDENCE.md`.

Open release/operational items:

- The latency claim rests on one cold-isolate observation. It is enough to
  close the stage but not a stable p95; warm-path and repeated cold-start
  behaviour are unmeasured. Any stronger claim needs a fresh sample.
- Current telemetry records total `processing_ms`, not separate admission,
  context, Runtime and Telegram delivery durations. A future latency slice
  should add privacy-safe phase timing before changing delivery semantics.
  Known residual costs, all untouched: two sequential rate-limit D1 calls, the
  awaited channel address binding, the onboarding and stored storefront
  lookups, the bot-start analytics write and the pending-budget clear.
- Four repository tests fail on clean `origin/main` and are pre-existing SEO
  sprint debt, deliberately not absorbed into the latency slice:
  `react-router-v8-migration` expects a hard-coded 228 sitemap entries while
  the build now emits 232, and one route-pattern assertion reports `blocked`;
  `n8n-dependency-inventory` finds three new SEO release documents without an
  inventory classification; `release-preparation` fails one BotFather checklist
  assertion. Each needs its own targeted fix.
- `apps/gpt-backend/node_modules` must be installed before
  `gpt-backend-security` and `web-security-hardening` can run; without it they
  fail on a missing package, not on a defect. With dependencies installed they
  are 30/30 and 13/13.
- Cloudflare's D1 export places the existing unique store index after child
  inserts, so the untouched export fails a clean SQLite restore even though
  production foreign keys and the index are valid. The original backup is
  preserved. A derivative that moves only that existing index before child
  DDL passes `integrity_check=ok`, foreign-key checks and control counts:
  `F:\Claude\gptbot-r1.1-production-backups\20260731-092128\gptbot-ai-drafts-production.restore-ready.sql`.
- The controlled store contains 48 explicitly synthetic products. They are
  intentional pilot data, not real commercial offers. No real store may be
  onboarded until Store Pilot #1 business approval.
- The production `d1_migrations` ledger still ends at `0025` while `0026`–
  `0030` are physically applied, because they were executed file by file.
  `wrangler d1 migrations apply --remote` must not be run: it would replay
  non-idempotent `ALTER TABLE ADD COLUMN` statements.

Older statements below that say the dedicated Market bot, migrations or R1
release do not exist are historical and superseded by this section and
`CURRENT_STATE.md`.

## P3.1 release update (2026-07-30)

No open P3.1 correctness or security defect is known after the production
canary.

Open operational items:

- R1 requires owner/provider creation and ownership of a dedicated Telegram
  Agents bot, exact `getMe` verification and protected installation of its
  token plus a distinct webhook secret. No substitute bot was invented.
- The protected GitHub CLI credential available to `gh` is invalid; therefore
  the release used the authorized controlled local merge fallback. Normal Git
  fetch/push remains functional. No credential value was exposed and no
  credential file was deleted automatically.
- The automation Worker still has no owner-provided LLM provider secret and
  fails closed with `llm_provider_missing` for unattended generation. This
  does not block the Sotuvchi pilot or owner-triggered Pages generation.
- Pages production still has an unused secret variable named `___`; it is read
  by no code and was not deleted because that credential mutation was outside
  the release's reversible scope.
- The in-app browser webview did not attach during this release session. This
  is an evidence-tool limitation, not a production UI failure; route, asset,
  authorization and behavioral UI checks pass.

## R0.4 (2026-07-30) — что закрыто, что осталось

### Закрыто

- **n8n больше не является зависимостью.** Прежняя запись «n8n не выведен из
  эксплуатации» снята: disposition `RETIRED`, код удалён, endpoint `410`,
  секреты удалены из обоих окружений Cloudflare.
- **First-party automation больше не «подготовлен только локально»**: Worker,
  Queue, DLQ, Cron и ledger работают в production, canary 56/56.
- **LOGIN_ATTEMPTS больше не best-effort.** Биндинг объявлен в
  `wrangler.toml`; durability подтверждена реальным ключом в KV.

### Остаётся

- **У automation Worker нет ключа LLM-провайдера.** Плановая генерация по Cron
  fail-closed падает с `llm_provider_missing` и ничего не пишет. Это
  единственный неизбежный owner-secret. Генерация по кнопке администратора не
  затронута.
- **Ловушка Cloudflare Pages, которую легко повторить:** `wrangler pages
  deploy` заменяет конфигурацию биндингов и plain-text переменных проекта тем,
  что объявлено в `wrangler.toml`. Биндинг, добавленный только в дашборде,
  будет удалён следующим деплоем. Именно так дважды терялся
  `LOGIN_ATTEMPTS`. Правило: всё несекретное объявлять в `wrangler.toml`;
  секреты Pages (`secret_text`) wrangler не трогает.
- **В Pages production есть переменная с именем `___`** (`secret_text`) —
  почти наверняка след инцидента с пустым именем KV-биндинга. Её не читает ни
  один код. Оставлена намеренно: R0.4 разрешал удалить только preview-артефакт
  `TEST_MERGE_PROBE`, а удаление непрочитанного секрета необратимо.
- **Owner-kit gate `N8N_INGEST_GATE=INCOMPLETE`** ровно из-за одного пункта —
  `workflow_disabled`, который требует evidence из UI n8n. На безопасность
  GPTBot это не влияет.
- **Telegram Agents bot отсутствует**, поэтому `/api/telegram/agents`
  честно отвечает `503`. Перенесено в R1.
- Шесть предсуществующих ошибок `no-explicit-any` в
  `src/admin/lib/api.ts:71` и `:76`. R0.4 их не касался; подтверждено
  линтом файла на предыдущем HEAD.


## Текущий release blocker relay (2026-07-28)

- First-party Cloudflare automation runtime подготовлен только локально:
  additive migration `0024`, D1 ledger, Queue/DLQ Worker, Cron, закрытые
  контракты и owner-gates. Production Queue/DLQ/Worker/bindings не создавались,
  migration не применялась, cutover не выполнялся.
- n8n не выведен из эксплуатации. Допустим только полный доказанный статус
  ROTATED или RETIRED; текущий owner status остаётся `pending`.
- Legacy ingest теперь выключен по умолчанию и fail-closed, но этот факт сам по
  себе не доказывает отключение live workflow, scheduler или credential.
- R0.3 остаётся `in_progress`, `blocked: true`; следующий этап — R0.3B.
- Замены admin credential и `N8N_INGEST_TOKEN` сгенерированы и защищены только
  во внешнем Windows DPAPI owner vault. Они не установлены в потребителях,
  consumers не перезапущены/проверены, старые значения не отозваны.
  `N8N_INGEST_TOKEN` консервативно считается потенциально раскрытым; прежнее
  утверждение ниже о незакрытой идентификации этим решением D-025 superseded.
- Railway auto-deploy, Cloudflare Pages auto-deploy и SEO scheduler/иные
  automation writers ещё не подтверждены как paused. Поэтому live rewrite и
  force-update remote refs запрещены.
- R0.4-prep завершён только локально в
  `27e7ddbe03695a859c9a7c11e7e93b450309946b`; R0.4 не завершён, R1 не начат,
  production заблокирован.
- React Router advisory `GHSA-qwww-vcr4-c8h2` is closed locally through the
  supported `8.3.0` migration; the exception is removed. The full Yarn audit
  separately reports unrelated tooling/dev dependency debt (1 low,
  2 moderate, 17 high across build/lint tooling). Production-only Yarn and
  npm cross-check audits are zero. Broad dependency modernization remains
  outside this sprint.
- Remote D1 migrations, deploy, production credentials/env, webhook и pilot не
  изменялись.

## R0.3 checkpoint — CREDENTIAL INCIDENT ОСТАЁТСЯ ОТКРЫТЫМ

Сделано (commit `77d46d4`):

- Credential-файл удалён из текущего дерева по всем трём живым путям
  (`memory/` + два дубликата в `gptbot-audit/`) и заблокирован `.gitignore`.
- Добавлен repository-local secret gate `scripts/scan-secrets.ts` +
  `tests/secret-scan.test.ts` (14) + CI workflow. Gate блокирует 22 из 23
  исторических версий файла инцидента при 0 находках на 2463 файлах.

**НЕ сделано и остаётся Critical:**

- **Значения не ротированы.** Материал по-прежнему достижим в Git-истории
  публичного репозитория и должен считаться скомпрометированным.
  Ротация — действие владельца: в окружении нет CLI/токенов Cloudflare,
  Railway, Supabase и n8n, а проверять доступ самими скомпрометированными
  значениями запрещено.
- **История не переписана.** 409 из 459 commits, 38/42 remote-веток, 5/5
  тегов и обе записи stash остаются заражёнными. Rewrite намеренно не
  запускался до ротации: иначе след инцидента исчезнет, а значения останутся
  действующими.
- **5 открытых PR** построены на заражённых ветках и станут невалидными после
  rewrite.
- **Идентификация значений не закрыта.** Redacted-анализ указывает на админ-
  пароль и `N8N_INGEST_TOKEN`, но текст самого документа утверждает, что этот
  токен в репозиторий не писался. Противоречие снимает только владелец.
- **GitHub secret scanning бесполезен для этого класса.** Он и push protection
  включены и не дали ни одного алерта за пять недель, потому что значения
  generic. `secret_scanning_non_provider_patterns` через API на текущем плане
  не включается — PATCH принимается, статус остаётся `disabled`. Нужен GHAS
  либо репозиторный gate (последнее уже сделано).
- `gptbot-audit/` целиком (мусор Bolt с дубликатами дерева) — решение об
  удалении по-прежнему за владельцем; в R0.3 удалены только credential-файлы.

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

## R0.2 checkpoint

Закрыт backend dependency blocker:

- Railway backend переведён с Fastify 4.29.1 на 5.10.0. `npm audit --omit=dev`
  в `apps/gpt-backend` даёт **0 findings** вместо прежних 6 High / 0 Critical.
  Закрыты `GHSA-q3j6-qgpj-74h6`, `GHSA-v39h-62p7-jpjc`, `GHSA-v2hh-gcrm-f6hx`,
  `GHSA-4c8g-83qw-93j6` (fast-uri), `GHSA-jx2c-rxcm-jvmq` (content-type tab
  bypass), `GHSA-444r-cwp2-x5xf` (X-Forwarded-Proto/Host spoofing),
  `GHSA-c96f-x56v-gq3h` (find-my-way HTTP/2) и `GHSA-mrq3-vjjr-p77c`.
  Overrides не использовались — всё пришло через поддерживаемый Fastify 5 граф.
- `apps/gpt-backend/package-lock.json` больше не untracked: npm подтверждён как
  deployment package manager (`railway.json` собирает через `npm install`),
  lockfile соответствует manifest и воспроизводится `npm ci`.

Остаётся открытым и НЕ входило в R0.2:

- **`memory/test_credentials.md` в Git — critical release blocker.** Этап R0.3.
- Web-side `GHSA-qwww-vcr4-c8h2` (React Router): относится к RSC mode, которого
  в declarative BrowserRouter приложении нет. Не применимо, major upgrade ради
  этого не выполнялся.
- `trustProxy: true` на Railway остаётся как было. Fastify 5.10.0 закрывает сам
  парсинг forwarded-заголовков, а авторизация backend не зависит от
  `req.ip`/`req.protocol`/`req.hostname` вообще (доказано тестами: подменённые
  X-Forwarded-Host/Proto и произвольный Host не дают доступа). Но `clientIp()`
  читает `cf-connecting-ip`/`x-forwarded-for` напрямую, поэтому подмена этих
  заголовков при прямом обращении к Railway по-прежнему позволяет обойти
  **quota-счётчик** (не авторизацию). Это app-level вопрос, а не advisory;
  сужение доверия к прокси — отдельное решение владельца.
- Redact-пути `req.headers[...]` в `logger.ts` фактически не срабатывают:
  дефолтный request-сериализатор Fastify вообще не пишет заголовки. Секрет в
  логи не попадает (проверено тестом), так что это не уязвимость, но конфиг
  выглядит защитнее, чем работает. Оставлен как defence-in-depth.
- 2 legacy `no-explicit-any` в `apps/gpt-backend/src/routes/admin.ts` не
  трогались — часть общего lint-долга ниже.
- Migrations `0013–0023` не применены, Agents webhook не настроен, production
  не задеплоен. Release остаётся заблокирован.

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
