# Актуальный master handoff

## R0.2 relay checkpoint (2026-07-28)

- Завершён этап **R0.2 — Backend Dependency Hardening**.
- Code commit: `a364b45dd9355c4ef432951c4c1e88ef8da3bc81`.
- Repository-sync merge (не commit этапа, D-023):
  `8f42081598e37bdaa5a072ed7ec8be53a4dc0d38`.
- Следующий разрешённый этап: **R0.3 — Credential Incident Response**. R0.4,
  R1 и P3 не начинались.

### Что было на входе

Фактический HEAD — `748de36`, remote `origin/main` — `1a68a12`, divergence
ahead 27 / behind 2. Два remote commit'а (`025a217`, `1a68a12`) оказались
публикациями SEO-кластеров от GPTBot SEO Bot: 45 файлов только в `content/`,
`public/assets/` и `reports/seo-clusters/`, +4562/−10. Ноль пересечений с
backend, `functions/`, `src/`, `migrations/`, governance и lockfiles; ноль
пересечений путей с 27 локальными commit'ами; `git merge-tree` — чистое дерево
без конфликтов; secret-скан чист. Признаны безопасными и самостоятельными.

### Синхронизация

Создана локальная safety branch `backup/pre-r0.2-748de36` (не запушена).
Remote интегрирован обычным `--no-ff` merge `8f42081`. Rebase, reset, restore,
checkout файлов, clean, stash, cherry-pick и любая переписка истории **не
выполнялись**: все 27 локальных stage SHA, включая R0.1 `6c0f723` и `748de36`,
остались неизменными. После merge — behind 0.

Post-sync baseline (до любых изменений R0.2) совпал с R0.1 ровно: полный
репозиторий 676/676 по 26 suites, required Agents 584/584, backend 18/18,
`tsc -b` и root build exit 0, backend typecheck/build exit 0, Functions ровно
27 legacy errors в тех же 6 файлах.

### Fastify 5

Railway backend переведён с Fastify 4.29.1 на **5.10.0** по официальному
migration guide. `npm audit --omit=dev` в `apps/gpt-backend`: **0 findings**
вместо прежних 6 High / 0 Critical. Закрыты `GHSA-q3j6-qgpj-74h6`,
`GHSA-v39h-62p7-jpjc`, `GHSA-v2hh-gcrm-f6hx`, `GHSA-4c8g-83qw-93j6` (fast-uri
2.4.0/3.1.3 → 3.1.4/4.1.1), `GHSA-c96f-x56v-gq3h` (find-my-way 8.2.2 → 9.7.0),
`GHSA-jx2c-rxcm-jvmq`, `GHSA-444r-cwp2-x5xf`, `GHSA-mrq3-vjjr-p77c`;
`fast-json-stringify` 5.16.1 → 7.0.1, `@fastify/ajv-compiler` 3.6.0 → 4.0.5,
`@fastify/fast-json-stringify-compiler` 4.3.0 → 5.1.0. Overrides не
использовались. Supabase, OpenRouter, jose, pino, zod, root и frontend не
трогались.

Поверхность миграции узкая, потому что валидация тела — на **zod**, а не на
route schema Fastify. Потребовалось ровно одно изменение типов
(`setErrorHandler` в v5 типизирует ошибку как `unknown`) плюс два осознанных
изменения:

1. Сборка приложения вынесена в новый `apps/gpt-backend/src/app.ts`
   (`buildApp()`), чтобы прогонять реальное приложение через `app.inject()` без
   открытия порта. `server.ts` остался единственным слушающим модулем.
2. v5 отклоняет `Content-Type: application/json` с пустым телом. CF-gateway
   ставит этот заголовок безусловно, поэтому `DELETE /v1/gpt/session/:id`
   начал бы отвечать 400 от парсера вместо 401 от auth-guard — подтверждено
   тестом до исправления. Контракт v4 восстановлен точечным content-type
   parser; malformed JSON по-прежнему fail-closed 400. Так как parser заменяет
   дефолтный на `secure-json-parse`, защита от prototype poisoning
   воспроизведена явно (`__proto__`/`constructor` отклоняются) и закрыта тестом.

Node runtime менять не потребовалось: Fastify 5 требует Node ≥ 20, backend уже
объявляет `engines.node: ">=20"`, deployment-файлы не трогались.

### Lockfile policy

`railway.json` собирает через `npm install`, значит npm — deployment package
manager. `apps/gpt-backend/package-lock.json` лежал untracked, но **не был
gitignored**; он соответствует manifest, без auth-материала, резолвится только
на `registry.npmjs.org`. Теперь tracked и authoritative. `npm ci` в чистой
директории **вне репозитория** воспроизводит дерево, typecheck и build — exit 0,
audit — 0 findings.

### Verification

`tests/gpt-backend-security.test.ts` — новый suite 30/30, поднимает реальное
приложение через `app.inject()` без сети (Supabase не сконфигурирован,
provider-ключа нет). Полный репозиторий **706/706** по 27 suites (676 post-sync
+ 30 новых); backend 18/18; R0.1 web-security 13/13; required Agents 584/584;
`tsc -b` и root build exit 0; backend typecheck/build exit 0; Functions ровно
27 прежних legacy errors в тех же 6 файлах; scoped ESLint exit 0; boundaries
10/10; `git diff --check` чист.

### Не выполнялось

Push, deploy, Railway deploy, применение migrations, настройка webhook,
изменение или ротация secrets, чтение credential-значений, переписка истории,
force push. `memory/test_credentials.md` не открывался — проверено только
tracked-наличие. Untracked `gptbot.uz-audit/` не изменялся и не staging'ился.

Ниже сохранён предыдущий R0.1 checkpoint. При расхождении
stage/commit/baseline приоритет имеют Git tree, `STATE.json` и этот R0.2
checkpoint.

---

## R0.1 relay checkpoint (2026-07-28)

- Завершён этап **R0.1 — Web Security Hardening**.
- Code commit: `6c0f723ccda2725acfd91e76f05276e64fe2fbb4`.
- Следующий разрешённый этап: **R0.2 — Backend Dependency Hardening**. R0.3, R0.4,
  R1 и P3 не начинались.
- GPT Chat теперь проверяет configured Turnstile до Railway, quota, hashing и
  provider work; missing/invalid/replayed/oversized token отклоняется, outage
  закрывается с 503, action и hostname проверяются.
- GPT Chat и admin login используют разные Turnstile actions (`gpt_chat` и
  `admin_login`); одноразовый token не передаётся в Railway и не сохраняется.
- Прямой Railway `/v1/gpt/chat` требует внутренний gateway secret.
- React Router обновлён с 7.15.1 до 7.18.1 без major migration. Оставшийся
  `GHSA-qwww-vcr4-c8h2` относится к RSC mode; приложение использует declarative
  `BrowserRouter` и не использует RSC.
- Verification: web-security 13/13, required Agents 584/584, весь repository
  676/676 (26 suites), `npx tsc -b` и root build exit 0, Railway backend
  typecheck/build exit 0, Functions ровно 27 прежних errors в тех же 6 legacy
  files и 0 в изменённых/platform/agents/channels, scoped ESLint exit 0,
  boundaries 10/10 и 0 violations.
- До начала работы фактический HEAD был
  `ebb07f5da86b36cba5df04658aedd3dc8df52bef`, `origin/main` и remote main —
  `93fab390733d3d5ffbf052e211d95b6038ee4bbd`, divergence 25/0.
- Push, deploy, migrations, webhook, secret rotation и любые другие
  production-операции не выполнялись. Известные pre-existing untracked
  `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/` не изменялись и не
  staging'овались.

Ниже сохранён подробный P2.7 handoff. При расхождении stage/commit/baseline
приоритет имеют Git tree, `STATE.json` и этот R0.1 checkpoint.

Полная фактическая карта repository, services, Agents Platform, Telegram,
Sotuvchi, migrations, API, environment, tests, security, PII, production
readiness и точные инструкции продолжения:

[`GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md`](./GPTBOT_AGENTS_MASTER_HANDOFF_2026-07-27.md)

Операционные документы пилота:

- [`SOTUVCHI_PILOT_RUNBOOK.md`](./SOTUVCHI_PILOT_RUNBOOK.md)
- [`SOTUVCHI_PRODUCTION_READINESS.md`](./SOTUVCHI_PRODUCTION_READINESS.md)

Этот файл ниже сохраняет stage-specific handoff P2.7. При расхождении
операционных сведений сначала сверяйте Git tree и `STATE.json`, затем
используйте master handoff как актуальную карту системы.

---

# GPTBot Agents — Handoff

## 1. Состояние

- Дата: 2026-07-28.
- Ветка: `main`.
- Исходный HEAD / P2.6 relay:
  `841836a7a3e81e7c2ecb49d86d31297474484c5d`.
- P2.6 code commit:
  `8523d8d84c16b75d8132c88a5bd8ab2d1ecccb79`.
- P2.7 code commit:
  `6dccec2095ba483779fbded77c08d8030eca5b4d`.
- HEAD после relay определяется последним metadata-only commit в `git log`;
  по D-006 `STATE.json.state_commit = "HEAD"` и не хранит собственный SHA.
- Завершённый этап: **P2.7 — Analytics и pilot readiness**.
- Следующий этап: **P3 — пилот** (операционный; см. §8 и governance gap).
- Рабочее дерево после relay: только два pre-existing untracked объекта —
  `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`.
- Push, deploy, webhook setup и применение migration не выполнялись.
- Новая migration в P2.7 **не создавалась**.

## 2. Что сделано

1. Добавлен минимальный канонический каталог событий Sotuvchi из четырёх имён:
   `sotuvchi.buyer_started`, `sotuvchi.catalog_answered`,
   `sotuvchi.catalog_no_result`, `sotuvchi.stats_viewed`.
2. Лифтсайкл-переходы (заказ, остаток, handoff) сознательно **не** продублированы
   событиями: их точный счёт уже принадлежит domain-таблицам, и второе,
   более слабое, «аналитическое» хранилище истины создавать запрещено.
3. События пишутся в существующий P0.3 outbox `events` (migration `0013`) через
   `PlatformEventsService`; PII-guard платформы не ослаблялся.
4. Payload содержит только closed-list токены, boolean и bounded счётчики:
   `locale`, `source`, `intent` (из закрытого buyer-списка), `result_bucket`,
   `full_card`, `window_days`. Вопрос покупателя, ответ продавца, имя, телефон,
   адрес, chat/thread ref, storefront code и произвольные строки отклоняются.
5. Idempotency key события — trusted channel `requestId`, поэтому повторный
   Telegram update не добавляет вторую строку и не вызывает второй emit.
6. Recorder best-effort: он выполняется **после** доменной записи, никогда её не
   повторяет и глушит собственные ошибки. Гарантия честно названа: аналитика
   может недосчитать, но не может продублировать доменный эффект.
7. Добавлен `withSotuvchiAnalytics` — декоратор domain-порта. Он читает уже
   произведённые scalar Facts buyer-операции и не может изменить, повторить или
   отменить доменный вызов.
8. `sotuvchi.buyer_started` пишется в endpoint при разрешении deep-link витрины,
   потому что повторные открытия витрины — единственный buyer-сигнал, которого
   нет ни в одной domain-таблице.
9. Добавлена owner-only команда `/stats` (плюс кнопка «Статистика»/«Statistika»
   и тексты `Статистика`/`statistika`). Buyer, чужой владелец, отключённое
   membership и другая identity в том же чате получают одинаковый content-free
   отказ.
10. Отчёт разделён на два блока. **Точные** счётчики читаются из таблиц-владельцев:
    опубликованные товары (`sotuvchi_products`), начатые оформления и
    оформленные заказы (`sotuvchi_orders`), подтверждено/отменено/выполнено
    (`sotuvchi_notifications` — одна строка на переход, пишется в том же D1
    batch), открытые и отвеченные вопросы (`sotuvchi_handoffs`).
11. **Приблизительный** блок воронки (открытия витрины, ответы по каталогу, без
    результата) читается из `events` и в тексте явно помечен как оценка,
    которая может быть занижена.
12. Revenue, прибыль, средний чек, conversion rate и time-to-seller-reply
    сознательно не считаются: текущая схема не позволяет сделать это честно.
13. Stats-запросы tenant-scoped, ограничены по времени, параметризованы и
    возвращают только `COUNT(*)`; PII и контент не читаются вовсе.
14. Числа отчёта проходят существующий strict grounding: неподдерживаемое число
    отклоняет ответ.
15. Добавлены product landing pages `/ru/sotuvchi/` и `/uz/sotuvchi/` по
    существующему content/prerender-паттерну: взаимный hreflang, canonical,
    sitemap, FAQ, внутренние ссылки в обе стороны.
16. Публичный username Agents-бота ещё не существует, поэтому
    `src/shared/sotuvchi-config.ts` держит `SOTUVCHI_BOT_USERNAME = null`, а CTA
    лендинга ведёт на секцию `#pilot`. Хелпер отказывает для `aidirectprobot` и
    `gptbot_javob_bot` и умеет собрать `?start=agent_seller`, когда username
    появится.
17. Добавлен `scripts/sotuvchi-pilot-check.ts` — offline read-only проверка: без
    сетевых вызовов, без вывода значений секретов, без мутации webhook.
18. Добавлены `SOTUVCHI_PILOT_RUNBOOK.md` и
    `SOTUVCHI_PRODUCTION_READINESS.md`. Все пункты checklist остаются `[ ]`.
19. Создан offline suite `tests/sotuvchi-pilot-readiness.test.ts`: 36/36.

## 3. Изменённые файлы

- `functions/agents/sotuvchi/analytics/{types,recorder,domain,index}.ts` —
  закрытый каталог событий, best-effort recorder с idempotency и
  domain-декоратор воронки.
- `functions/agents/sotuvchi/stats/{types,errors,store,service,facts,responses,
  rules,tools,index}.ts` — owner-only отчёт: bounded tenant-scoped запросы,
  scalar Facts, RU/UZ composer, deterministic правила и closed-list tool.
- `functions/platform/events/{store,index}.ts` — добавлен tenant-scoped
  bounded aggregate read `countEventsByType` (только COUNT, только по
  `org_id` + closed-list types + нижняя граница времени).
- `functions/agents/sotuvchi/{manifest,rules,index}.ts` — регистрация stats
  tool/rules, пункт меню «Статистика», реэкспорт; manifest поднят до `1.6.0`.
- `functions/api/telegram/agents.ts` — analytics и stats service, композиция
  domain-портов, событие открытия витрины.
- `src/shared/sotuvchi-config.ts` — единый публичный источник ссылки на
  Agents-бота и guard на чужие боты.
- `content/pages/{ru,uz}/sotuvchi.json` — новые landing pages.
- `content/pages/ru/ai-bot-dlya-magazina.json`,
  `content/pages/uz/dokon-uchun-ai-bot.json` — по одной входящей внутренней
  ссылке, чтобы новые страницы не остались orphan.
- `scripts/sotuvchi-pilot-check.ts` — read-only pilot verification.
- `docs/agents-platform/SOTUVCHI_PILOT_RUNBOOK.md`,
  `docs/agents-platform/SOTUVCHI_PRODUCTION_READINESS.md` — операционные
  документы пилота.
- `tests/sotuvchi-pilot-readiness.test.ts` — новый suite.

## 4. Архитектурные решения

D-021 — Domain tables как source-of-truth для точных stats, content-free
best-effort события, owner-only `/stats` и единый public bot namespace. Полный
текст в `DECISIONS.md`.

## 5. Что сознательно не сделано

- Новая migration. Аналитика использует существующую `events`, отчёт — уже
  существующие domain-таблицы. `0024` не создавалась.
- Daily aggregate table: точные счётчики получаются bounded-запросами.
- Web dashboard, внешняя аналитика, экспорт, user profiling.
- Revenue, прибыль, средний чек, conversion rate, time-to-seller-reply.
- События lifecycle заказа/остатка/handoff как отдельная истина.
- Payments, CRM, staff-роли, рассылки, Mini App, полная история переписки,
  вложения и голос в handoff, AI-генерация ответов продавца.
- Cron/scheduler по-прежнему отсутствует.
- Push, deploy, применение migrations, настройка webhook, изменение secrets.

## 6. Проверки

- `npx tsc -b` → exit 0.
- `npm run build` → exit 0 (seo-audit gate, vite build, prerender, sitemap,
  robots, llm-markdown). В `dist/` созданы `ru/sotuvchi/index.html` и
  `uz/sotuvchi/index.html`; sitemap содержит обе с взаимным hreflang.
- `npx tsx scripts/seo-audit.ts` → 0 critical, 105 published pages, orphan 0.
- `node --import tsx --test tests/sotuvchi-pilot-readiness.test.ts` → 36/36.
- Обязательный Agents-набор file-by-file: pilot-readiness 36/36, handoff 40/40,
  orders/inventory 37/37, checkout 36/36, buyer Q&A 39/39, catalog 54/54,
  onboarding 28/28, Telegram Agents 41/41, runtime 49/49, workflow 39/39,
  knowledge 33/33, AI 15/15, tenancy 31/31, events 20/20, boundaries 10/10,
  compatibility 1/1, assistant 60/60, gpt-chat 15/15 → **584/584**.
- Остальные suites репозитория: intent-guard 16/16, direct-generator 13/13,
  indexnow-engine 11/11, yandex-research 11/11, gpt-backend 17/17,
  telegram-cost-calculator 6/6, canonical-url-redirects 4/4 → 78/78.
  Полный репозиторий **662/662**.
- `npx tsc -p tsconfig.functions.json --noEmit` → exit 2, ровно 27 legacy
  errors в тех же шести legacy-файлах; в
  `functions/{platform,agents,channels}` и endpoint — 0.
- `npx eslint functions/agents/sotuvchi functions/platform/events
  functions/api/telegram/agents.ts src/shared/sotuvchi-config.ts
  scripts/sotuvchi-pilot-check.ts tests/sotuvchi-pilot-readiness.test.ts`
  → exit 0.
- Boundary checker: 10/10, 0 violations.
- Secret/PII scan staged diff → только фикстурные литералы теста
  (`fixture-token`, `never-printed-token`, вымышленный номер в списке
  отклоняемых значений); `git diff --cached --check` clean.
- `npx tsx scripts/sotuvchi-pilot-check.ts` → `blocked` (ожидаемо: бот ещё не
  зарегистрирован, env не заданы). Скрипт сетевых вызовов не делает.

## 7. Известные проблемы

- Существовали до этапа: `memory/test_credentials.md` в Git (critical,
  release blocker); global ESLint legacy-red; 27 legacy functions-typecheck
  errors; 46 broken international links в старом контенте; отсутствие
  cron/scheduler; migrations `0013–0023` не применены на remote D1; Agents
  webhook не настроен; `origin/main` всё ещё
  `93fab390733d3d5ffbf052e211d95b6038ee4bbd`.
- Появились в этапе: регрессий нет; ни одно число baseline не уменьшилось.
- Новое ограничение, зафиксированное явно: воронка в `/stats` best-effort и
  может недосчитать; точный блок отчёта от неё отделён.
- Governance gap: в ROADMAP между P2.7 и P3 нет security/release-фазы, хотя
  release фактически заблокирован. Фаза должна быть определена и одобрена
  владельцем до старта P3.
- Внешние блокеры: Click/Payme merchant API, фискальные чеки, Instagram и
  WhatsApp Business API — без изменений.

## 8. Следующая задача

**P3 — пилот** по ROADMAP: onboarding runbook, pilot dashboard, feedback-форма,
incident handling, weekly metrics.

P3 операционный: он требует push, deploy, применённых migrations и
настроенного webhook. Всё это остаётся заблокированным до отдельной
одобренной владельцем release/security-задачи, которая закрывает разделы 1–4
`SOTUVCHI_PRODUCTION_READINESS.md`. Не начинать P3 и не изобретать скрытую
feature-фазу вместо неё.

## 9. Acceptance criteria следующего этапа

1. Существует отдельная одобренная release/security-задача, и её пункты
   закрыты в `SOTUVCHI_PRODUCTION_READINESS.md`.
2. Push, deploy, migrations `0013–0023` и webhook выполнены по runbook с
   явного разрешения владельца.
3. Smoke tests runbook (§10) пройдены на production.
4. Обязательный baseline не опускается ниже 584/584, полный — ниже 662/662.
5. Functions typecheck — те же 27 legacy errors, 0 новых.
6. Scoped ESLint exit 0, boundaries 10/10.

## 10. Команды для старта

```powershell
cd F:\Claude\gptbot-repo
Get-Content -Raw -Encoding utf8 AGENTS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\STATE.json
Get-Content -Raw -Encoding utf8 docs\agents-platform\HANDOFF.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\CURRENT_STATE.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\ROADMAP.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\TEST_MATRIX.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\KNOWN_ISSUES.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\DECISIONS.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\SOTUVCHI_PILOT_RUNBOOK.md
Get-Content -Raw -Encoding utf8 docs\agents-platform\SOTUVCHI_PRODUCTION_READINESS.md
git status --short
git rev-parse HEAD
git log -15 --oneline
$env:NODE_OPTIONS='--max-old-space-size=1400'
npx tsc -b
npx tsx scripts/sotuvchi-pilot-check.ts
node --import tsx --test tests/sotuvchi-pilot-readiness.test.ts
node --import tsx --test tests/sotuvchi-handoff.test.ts
node --import tsx --test tests/sotuvchi-orders-inventory.test.ts
node --import tsx --test tests/sotuvchi-checkout.test.ts
node --import tsx --test tests/sotuvchi-buyer-qa.test.ts
node --import tsx --test tests/sotuvchi-catalog.test.ts
node --import tsx --test tests/sotuvchi-onboarding.test.ts
node --import tsx --test tests/telegram-agents-webhook.test.ts
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

- Не превращать события в источник истины для статуса заказа, остатка,
  состояния handoff или прав продавца.
- Не показывать event-derived число как точное и не смешивать два блока
  отчёта.
- Не считать revenue/AOV/conversion, пока схема не позволяет сделать это
  честно.
- Не давать `/stats` покупателю и не принимать org/store/window из ввода.
- Не публиковать landing CTA с угаданным username бота и не смешивать
  Agents-бота с lead-ботом и Javob.
- Не ослаблять инварианты P2.4–P2.6: один item в заказе, однократное списание,
  запрет `confirmed → cancelled`, одна живая переписка на buyer-сессию, ровно
  один финальный ответ продавца.
- Не трогать `functions/api/telegram/webhook.ts`, Javob, lead-бот, gpt-chat,
  SEO и admin.
- Не добавлять `memory/test_credentials.md` в diff и не ротировать
  credentials без отдельного разрешения.

## 12. Rollback

1. Если P2.7 relay создан, `git revert <P2.7-relay-SHA>`.
2. Затем `git revert 6dccec2095ba483779fbded77c08d8030eca5b4d`.
3. **Новая migration в P2.7 не создавалась**, поэтому откат кода не требует
   изменений схемы БД. Ранее добавленные additive migrations `0013–0023`
   остаются как были и по-прежнему не применены.
4. Откат также убирает две landing pages из `content/`; пересборка вернёт
   sitemap к прежнему составу. Deploy не выполнялся, поэтому production
   откатывать нечего.
