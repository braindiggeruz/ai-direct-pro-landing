# SOTUVCHI — production readiness checklist (P2.7)

> R1.1 release note (2026-07-31): current implementation and release evidence
> are tracked in `release/R1_1_PRODUCT_AUDIT_20260731.md`; execution must follow
> `release/R1_1_MARKET_PILOT_RUNBOOK.md`. The historical sections below are not
> authority for the R1.1 migration, fixture or Telegram-metadata sequence.

> Current status: R1.1 source `e8b2bd7` is live in production deployment
> `226d65cc-5be9-4c5e-ba30-93af250b34df`. The bot identity, webhook, additive
> migrations, synthetic catalog and product flows are verified. Full tests are
> 981/981 and all release gates pass. The only remaining R1.1 closeout item is
> one post-fix owner latency request; no real store may be onboarded before it.

## Historical readiness update — 2026-07-30

The historical readiness sections below predate the completed R0.4 and P3.1
production releases. Current authority is
`release/R1_READINESS_20260730.md`, `release/R1_OWNER_CHECKLIST.md` and the
R1.1 production override above.

Technical production gates through P3.1 are complete. R1 has not started. Its
remaining owner/provider prerequisite is a dedicated Telegram Agents bot
created and owned in BotFather, verified with `getMe`, and installed through
the protected credential path with a distinct webhook secret. After that, R1
still requires separate authorization and selection of 1–3 verified stores.

Дата документа: 2026-07-28. Этап: P2.7 — Analytics и pilot readiness.

## R0.4 local preparation evidence — production всё ещё заблокирован

Code commit `27e7ddbe03695a859c9a7c11e7e93b450309946b` содержит names-only env
contract, checksum/order manifest migrations 0013–0023, clean/upgrade/rollback
и backup/restore rehearsals на synthetic/local data, deployment dry-run,
pre/post-deploy smoke separation и rollback/pilot runbooks. Полный локальный
baseline: **740/740** по 29 suites; R0.4 suite 20/20.

Это только `R0.4-prep: completed_locally`. R0.3B остаётся заблокирован внешней
установкой/валидацией/отзывом admin и n8n credentials, паузой Railway и
Cloudflare auto-deploy, отключением SEO scheduler/иных writers и последующим
live history rewrite. R0.4 не завершён, R1 не начат. Все checklist items ниже
остаются `[ ]`.

Root audit сохраняет `GHSA-qwww-vcr4-c8h2`; текущий declarative SPA не
использует затронутые unstable RSC APIs. Узкое warning-исключение разрешает
локальную подготовку и блокирует R1 до review к 2026-08-11.

Push, deploy, remote D1 migrations, production env/secret mutation, webhook
mutation и pilot не выполнялись.

## R0.1 local source evidence

Code commit `6c0f723ccda2725acfd91e76f05276e64fe2fbb4` содержит проверенное
локальное исправление React Router 7.x applicable advisories и GPT Chat
Turnstile configured-secret/missing-token bypass, включая private Railway chat
ingress. Это evidence для будущей human sign-off, но не production verification.

## R0.3 local source evidence (этап НЕ завершён)

Code commit `77d46d403cde210b5453214d61296ac261ca51e2` удаляет credential-файлы
из текущего дерева (все три живых пути) и добавляет репозиторный secret gate,
валидированный против реального инцидента: 22 из 23 исторических версий
блокируются при 0 ложных срабатываниях на 2463 файлах.

**Пункты раздела 1 ниже остаются `[ ]`.** Значения не ротированы, история не
переписана, материал по-прежнему достижим в публичном репозитории. Наличие
кода в ветке не закрывает ни одного пункта; закрыть их может только владелец
после ротации и rewrite.

## R0.2 local source evidence

Code commit `a364b45dd9355c4ef432951c4c1e88ef8da3bc81` переводит Railway
backend с Fastify 4.29.1 на 5.10.0 и закрывает всю подтверждённую цепочку:
`npm audit --omit=dev` в `apps/gpt-backend` даёт **0 findings** вместо прежних
6 High / 0 Critical. Закрыты `GHSA-q3j6-qgpj-74h6`, `GHSA-v39h-62p7-jpjc`,
`GHSA-v2hh-gcrm-f6hx`, `GHSA-4c8g-83qw-93j6` (fast-uri),
`GHSA-jx2c-rxcm-jvmq` (content-type tab bypass), `GHSA-444r-cwp2-x5xf`
(forwarded-header spoofing), `GHSA-c96f-x56v-gq3h` (find-my-way),
`GHSA-mrq3-vjjr-p77c`. Добавлен suite `tests/gpt-backend-security.test.ts`
(30/30), поднимающий реальное приложение без сети. `npm ci` в чистой
директории вне репозитория воспроизводит дерево, typecheck и build exit 0.

Это **local source evidence**, а не production verification: backend не
задеплоен, поэтому пункт «Fastify (Railway backend)» ниже остаётся `[ ]` до
фактического deploy и проверки человеком.

По правилу checklist пункты ниже остаются `[ ]`: deploy, production smoke,
credential response и CI release gates ещё не выполнены.

> **Статус: RELEASE BLOCKED.** Ни один пункт этого списка не отмечен
> автоматически. `[ ]` означает «не выполнено», и таким пункт остаётся, пока
> ответственный человек не выполнит и не проверит его. Наличие кода в ветке не
> закрывает ни одного пункта. Секреты, токены, пароли и любые credential values
> в этот документ не переносятся.

Легенда: `[ ]` не выполнено · `[x]` выполнено и проверено · `[n/a]` не
применимо с обоснованием.

---

## 1. Security

- [ ] Инцидент: plaintext admin credential в tracked `memory/test_credentials.md`
      зафиксирован как incident, назначен владелец.
- [ ] Затронутые credentials ротированы.
- [ ] Credential material удалён из текущего дерева.
- [ ] Согласована и выполнена процедура очистки Git history.
- [ ] Владельцы downstream clone/fork уведомлены.
- [ ] React Router: уязвимость проверена и обновление выполнено.
- [ ] Fastify (Railway backend): уязвимости проверены и обновление выполнено.
- [ ] Turnstile fail-open в GPT Chat исправлен.
- [ ] Secret-scan gate добавлен в CI.
- [ ] Dependency-audit gate добавлен в CI.

## 2. Data

- [ ] Сделан и проверен export/backup D1 `GPTBOT_DRAFTS_DB`.
- [ ] Migrations `0013–0023` прочитаны и одобрены построчно.
- [ ] Принято решение по ownership схемы: migrations как единственный
      production owner либо документированный runtime bootstrap с parity-проверкой.
- [ ] Migrations `0013–0023` применены к remote D1 по порядку.
- [ ] Схема после применения верифицирована (таблицы, индексы, CHECK).
- [ ] Rollback-план для каждой применённой migration записан и согласован.
- [ ] Политика retention подтверждена: 7 дней для текста вопроса и ответа
      handoff, отсутствие истории переписки.
- [ ] Правила доступа к PII подтверждены: имя, телефон и адрес видны только
      владельцу магазина; в события и логи не попадают.

## 3. Deployment

- [ ] Владелец явно авторизовал push в `main`.
- [ ] Cloudflare Pages deploy выполнен из ожидаемого commit SHA.
- [ ] `POST /api/telegram/agents` отвечает; прочие методы дают 405.
- [ ] Env и secrets проверены по именам (значения не выводились).
- [ ] Agents bot identity подтверждена через `getMe` и отличается от
      `@aidirectprobot` и `@gptbot_javob_bot`.
- [ ] Webhook secret установлен и не совпадает с секретами других ботов.
- [ ] Webhook настроен на ожидаемый URL.
- [ ] Smoke tests раздела 10 runbook пройдены.
- [ ] Записан ID предыдущего deployment как цель rollback.

## 4. Product

- [ ] Seller onboarding пройден на реальном телефоне.
- [ ] Каталог: товар создан, опубликован, скрыт, виден корректно.
- [ ] Buyer Q&A: RU, Uzbek Latin и смешанные вопросы отвечены из каталога.
- [ ] Checkout: сквозной заказ создан, повтор update второго заказа не создал.
- [ ] Orders/inventory: подтверждение списало остаток ровно один раз.
- [ ] Handoff: вопрос доставлен продавцу, ответ доставлен покупателю с
      пометкой авторства.
- [ ] `/stats`: отчёт получает только владелец, числа совпадают с фактом.
- [ ] Лендинги `/ru/sotuvchi/` и `/uz/sotuvchi/` опубликованы, в sitemap,
      hreflang взаимен, CTA ведёт в нужный бот.
- [ ] Назначен ответственный за инциденты и поддержку пилота.
- [ ] Составлен список пилотных продавцов и согласован способ связи.

## 5. Что уже сделано в коде (не является release-готовностью)

Эти пункты описывают состояние ветки, а не production. Они не закрывают ни
одного пункта выше.

- Реализованы этапы P0.0–P2.7; обязательный Agents baseline и полный
  repository baseline зелёные локально.
- Migrations `0013–0023` добавлены в репозиторий и **не применены**.
- P2.7 не добавляет migration: аналитика использует существующую таблицу
  `events`, отчёт `/stats` читает существующие domain-таблицы.
- Публичный username Agents-бота ещё не зарегистрирован, поэтому
  `SOTUVCHI_BOT_USERNAME` в `src/shared/sotuvchi-config.ts` равен `null`, а CTA
  лендинга ведёт на секцию `#pilot`, а не на чужой бот.
- `scripts/sotuvchi-pilot-check.ts` — read-only проверка конфигурации; она не
  делает сетевых вызовов и не меняет webhook.

## 6. Явно вне scope до отдельного решения

Payments, refunds, фискальные чеки, CRM, staff-роли, рассылки, Mini App,
публичная веб-витрина, внешние службы доставки, cron/scheduler, история
переписки для продавца, вложения и голос в handoff, AI-генерация ответов
продавца.

## 7. Итоговый статус

**Production release: BLOCKED.** Разблокируется только после закрытия разделов
1–4 и отдельного явного разрешения владельца.
