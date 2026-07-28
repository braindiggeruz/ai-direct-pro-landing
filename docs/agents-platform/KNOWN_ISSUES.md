# KNOWN_ISSUES — существовало ДО платформы (не чинить «заодно», только целевыми этапами)

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
