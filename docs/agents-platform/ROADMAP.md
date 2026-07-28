# GPTBot Agents — карта этапов (один этап = одна сессия агента)

Источник направления: ARCHITECTURE.md (утв. 2026-07-17) + SOTUVCHI_PLAN.md (утв. аудит MVP).
Текущий этап — всегда `STATE.json.next_stage`. Не выполняй больше одного этапа за сессию.

## P0 — фундамент
- **P0.0 Baseline и эстафета** — AGENTS.md, docs/agents-platform, STATE.json, baseline-проверки, handoff-протокол. Без кода платформы.
- **P0.1 Границы модулей** — scaffold `functions/{platform,agents,channels}`, минимальные contracts (типы), import-boundary проверка (lint-правило или тест на import-graph). Без продуктовой логики.
- **P0.2 Telegram channel extraction** — move `functions/lib/telegram/client.ts` → `functions/channels/telegram/api.ts` + re-export shim на старом пути; нулевое изменение поведения; полный legacy-suite зелёный.
- **P0.3 Events foundation** — in-process bus (`platform/events`), durable outbox (миграция: таблица `events`: id, org_id NULL, agent_id NULL, type, aggregate, payload_json БЕЗ PII, created_at, processed_at NULL), мост из ОДНОГО существующего потока (Javob logEvent дублирует в events), idempotency-тесты.
- **P0.4 Identity/Orgs/Tenancy** — миграция: identities, organizations, memberships, contacts (persons — только если реально нужно); repository-слой `platform/{identity,orgs}/store.ts`; негативные тесты изоляции.
- **P0.5 Platform AI façade** — `platform/ai`: интерфейс complete/stream/structured/transcribe + адаптеры поверх существующих реализаций (lib/llm, gpt-chat/openrouter-*, telegram/service); модельная политика из конфига; legacy НЕ переключаем массово; structured-выход валидируется схемой.

## P1 — движки
- **P1.1 Knowledge Engine minimum** — knowledge_collections/items (+search_text, numeric-индексы), schema-валидация payload, детерминированный поиск (normalize+LIKE+скоринг), tenant-тесты. Ревизии — только если нужны Sotuvchi.
- **P1.2 Workflow Engine minimum** — декларативные FSM, persistent `workflow_instances` (переживают isolate), идемпотентные actions, restart-тест. Без cron (таймеры не нужны Sotuvchi v0).
- **P1.3 Agent Runtime minimum** — AgentManifest-типы, `agents/registry.ts`, tools с Facts-контрактом, deterministic-first turn-цикл, grounding fail-closed, demo-агент (echo+1 knowledge-вопрос).
- **P1.4 Telegram agent webhook** — `functions/api/telegram/agents.ts` (или sotuvchi.ts): свой токен/секрет (`TELEGRAM_SOTUVCHI_*`), secret-header, dedup, `?start=`-deep-links, нормализация inbound/outbound через channels/telegram; demo-агент отвечает end-to-end. ГАРД: username ≠ aidirectprobot ≠ gptbot_javob_bot.

## P2 — Sotuvchi (критерии из SOTUVCHI_PLAN.md §18)
- **P2.1 Onboarding магазина** — org+owner membership, имя/язык/доставка/оплата, storefront-код.
- **P2.2 Каталог** — ≤20 товаров, фото=tg file_id, цена/остаток/варианты-текст, редактирование/скрытие, изоляция.
- **P2.3 Buyer Q&A** — deep-link, RU/UZ/mix intents, детерминированный lookup, карточки, цена/наличие только из facts, fail-closed, handoff при неопределённости.
- **P2.4 Checkout workflow** — 1 товар × qty, имя/телефон/адрес/подтверждение, персистентное состояние, идемпотентное создание заказа.
- **P2.5 Orders/inventory** — orders/order_items/inventory_moves, уведомление продавцу, confirm/cancel/done, защита от двойного списания.
- **P2.6 Human handoff** — очередь, уведомление, reply-мост, TTL текста вопроса, закрытие, события.
- **P2.7 Analytics/pilot readiness** — события (§13 SOTUVCHI_PLAN), /stats, RU/UZ лендинги, setup-скрипт, runbook. Без платёжных интеграций.

## R0 — release security gates

- **R0.1 Web Security Hardening — completed locally.** React Router 7.x
  hardening; GPT Chat/admin Turnstile enforcement, action/hostname isolation
  and fail-closed client states; private Railway chat ingress. Без deploy,
  migrations, webhook и secret operations.
- **R0.2 Backend Dependency Hardening — completed locally.** Railway backend
  переведён с Fastify 4.29.1 на 5.10.0 (SemVer-major по официальному migration
  guide); production audit backend: 0 findings вместо 6 High; npm закреплён как
  deployment package manager и `apps/gpt-backend/package-lock.json` стал tracked
  и authoritative; добавлен suite `tests/gpt-backend-security.test.ts` (30).
  Без deploy, migrations, webhook и secret operations.
- **R0.3 Credential Incident Response — начат, НЕ завершён.**
  - *R0.3A (готово)* — assessment + rewrite rehearsal: инцидент найден по пяти
    путям, 409/459 commits под перезапись, репетиция подтвердила 706/706.
  - *R0.3C (готово, commit `77d46d4`)* — credential-файлы удалены из дерева,
    добавлен репозиторный secret gate (22/23 на реальном инциденте, 0 ложных).
  - *R0.3B (НЕ выполнен, блокер)* — ротация, отзыв, rewrite истории и
    force-update 38 remote-веток и 5 тегов. Ротация требует доступа к сервисам,
    которого нет в окружении; rewrite до ротации запрещён. Действие владельца.
- **R0.4 Release Preparation — этап НЕ завершён; local prep completed in
  parallel while R0.3B is blocked.** Code commit
  `27e7ddbe03695a859c9a7c11e7e93b450309946b` добавляет redacted env contract,
  checksummed migration manifest, clean/upgrade/rollback и backup/restore
  rehearsals, deployment dry-run, smoke/rollback/pilot runbooks и release
  preflight. Результат: `R0.4-prep: completed_locally`, 740/740 по 29 suites.
  Root advisory `GHSA-qwww-vcr4-c8h2` ограничен неиспользуемым RSC-путём:
  warning разрешён только для local prep, R1 блокируется до review к
  2026-08-11. Применение remote migration, deploy, env/secrets, webhook и
  pilot остаются запрещены до завершения R0.3B и отдельной авторизации R1.
- **Parallel automation preparation — prepared locally, not a new stage.**
  n8n dependency inventory and retirement runbook, Cloudflare-first ADR,
  D1 `automation_jobs` ledger, Queue/DLQ Worker, Cron, closed contracts and
  fail-closed ingest tests are prepared. n8n retirement is
  `prepared_not_executed`; R0.3 remains current, R0.3B blocked, R0.4
  incomplete and R1 not started.

## R1 — Production Rollout

Только после R0.1–R0.4: отдельная авторизация на push/deploy, migrations,
environment/secrets, webhook setup, production smoke и rollback evidence.

## P3 — пилот (без симуляции рынка в коде)
Onboarding runbook, pilot dashboard, feedback-форма, incident handling, weekly metrics.

## Критерий готовности MVP (15 пунктов)
1 магазин с телефона · 2 пять товаров ≤10 мин · 3 deep-link входа · 4 цена/наличие только из БД ·
5 неизвестный вопрос ≠ выдумка · 6 checkout переживает isolate-restart · 7 повторный update ≠ второй заказ ·
8 остаток не списывается дважды · 9 продавец получает заказ · 10 handoff в обе стороны ·
11 изоляция магазинов · 12 legacy без регрессий · 13 события без PII · 14 tests+build зелёные ·
15 актуальный HANDOFF.md.
