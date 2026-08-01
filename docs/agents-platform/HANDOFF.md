# GPTBot Agents — Handoff

## 1. Состояние

- Дата: 2026-08-01.
- Канонический репозиторий: `F:\Claude\gptbot-repo-clean-20260801`.
- Ветка: `main`.
- Feature commit: `2291e8010b3b57a04103c6a7b77df3cb8e6f962b`.
- Merge/deployed code: `c670e4eebff79e2cc4b9027ffede865f0af813ab`.
- Production deployment: `d9ca163e-947b-40ba-856d-8143308c8402`.
- Immutable URL: `https://d9ca163e.ai-direct-pro-landing.pages.dev`.
- Immediate rollback: deployment `ede1d0f4-6a06-40e2-9b6c-dee2a7812c69`,
  source `41ec9e3401b3e974edf8d97480695e9845a4924f`.
- Завершённый этап: R1.1 role-aware Telegram Market UX release.
- Следующий этап: R1 Store Pilot #1 preparation, blocked only on owner
  business inputs.
- Рабочее дерево после governance commit должно быть clean; `state_commit` —
  metadata-only HEAD поверх deployed code.

Не использовать recovery repository `F:\Claude\gptbot-repo` как source и не
читать/индексировать его audit directory. Не выводить credential material.

## 2. Что сделано

- Выбрана hybrid-модель: adaptive authority-aware `/start` плюс buyer-first
  home с видимым входом «Я продавец».
- Buyer home сокращён до пяти действий; пустое сравнение и глобальный contact
  seller удалены, contextual comparison/handoff сохранены.
- Unknown seller получает invite-only explanation; кнопка и deep link не
  создают onboarding, organization, membership или store.
- Active verified owner получает owner-only dashboard с exact counts из
  trusted stats query.
- Paused pilot и suspended store получают отдельные честные состояния и
  support path.
- Seller может перейти в buyer mode и вернуться; server authority не меняется.
- Active checkout имеет приоритет над mode navigation и переживает `/start`.
- RU и Uzbek Latin имеют одинаковую action architecture.
- Manifest Sotuvchi поднят с `1.6.0` до `1.7.0`.
- Feature branch опубликована, merged в main и вручную deployed exact-SHA.
- HTTP, Telegram provider, Pages secret-name и production D1 canary пройдены.

## 3. Изменённые файлы

- `functions/agents/sotuvchi/experience/copy.ts` — новый buyer-first RU/UZ
  copy, compact home и invite-only seller copy.
- `functions/agents/sotuvchi/experience/rules.ts` — secondary menu, seller
  invitation/how-it-works; contextual `buyer-seller` оставлен для handoff.
- `functions/agents/sotuvchi/rules.ts` — seller mode navigation, more/support,
  paused/suspended/cancelled responses.
- `functions/agents/sotuvchi/stats/{facts,responses,rules,tools,index}.ts` —
  отдельный owner dashboard tool/composer на существующем exact stats service.
- `functions/agents/sotuvchi/{manifest,index}.ts` — wiring и manifest `1.7.0`.
- `functions/api/telegram/agents.ts` — trusted seller state routing, forged
  callback denial, safe seller deep-link invitation и checkout priority.
- `tests/sotuvchi-buyer-qa.test.ts` — compact home, RU/UZ parity, seller
  invitation и отсутствие global compare/contact.
- `tests/sotuvchi-checkout.test.ts` — `/start` сохраняет active checkout step.
- `tests/sotuvchi-onboarding.test.ts` — unknown/active/paused/suspended seller,
  mode return и forged-dashboard negatives.
- `tests/sotuvchi-pilot-readiness.test.ts` — grounded RU/UZ dashboard contract.
- `docs/agents-platform/{DECISIONS,TEST_MATRIX,HANDOFF}.md` и `STATE.json` —
  D-031 и фактические release evidence.

## 4. Архитектурные решения

- D-031: UX role определяется trusted server state, но никогда не является
  authorization. Model C отвечает за routing, Model B — за buyer-first entry;
  Model A mandatory chooser отклонён.
- Dashboard count claims допускаются только из exact FactSheet owner query.
- UX mode не сохраняется в новой таблице: это presentation state; authority
  по-прежнему membership/store-derived.
- Новых analytics event types нет: закрытый privacy-safe каталог не расширен.
- Новых migrations нет.

## 5. Что сознательно не сделано

- Не создан real store, real product, payment, cart или public marketplace.
- Не применялись migrations и не менялся D1 ledger.
- Не менялись webhook, BotFather metadata, bot token или legacy bot routes.
- Secret `___` не удалён и его value не читался; name-only check подтвердил,
  что secret остался encrypted.
- Live Telegram message/order canary не выполнялся: user chat target не был
  предоставлен. Provider/webhook status проверен read-only.
- Новые role-choice analytics не добавлены, чтобы не обходить closed catalog.
- Screenshot из задания отсутствовал в attachments; UI выводы основаны на
  приложенном тексте, текущем `/start` и фактическом renderer/code.

## 6. Проверки

- Все `tests/*.test.ts` file-by-file: **1056/1060**, 46 suites; четыре failure
  в точности pre-existing baseline: три unclassified SEO release docs, route
  parity/sitemap `232 != 228`, BotFather checklist assertion (4 assertions в
  3 files), новых failure нет.
- Role-aware targeted corpus: **216/216**.
- Post-merge onboarding/readiness/webhook: **126/126**.
- `tsc -b`: exit 0.
- `tsc -p tsconfig.functions.json --noEmit`: exit 0.
- Scoped ESLint изменённых Functions/tests: exit 0.
- `scripts/check-agent-boundaries.ts`: 0 violations.
- `scripts/scan-secrets.ts`: clean, 2708 files.
- Root production build: exit 0; 111 pages, 118 articles, sitemap 232.
- `wrangler pages functions build`: compiled successfully.
- Backend typecheck/build: exit 0 / exit 0.
- Root/backend production audits: 0 / 0 vulnerabilities.
- HTTP: root/RU/UZ/RU+UZ Sotuvchi/immutable 200; webhook GET 405;
  unauthorized POST 401; unknown route 404.
- Telegram: exact `gptbot_market_bot`, exact webhook, pending 0, last error none.
- D1 read-only: stores 1, products 48, orders 0, handoffs 0, notifications 0,
  automation jobs 0, rows_written 0.

## 7. Известные проблемы

- Существовали до этапа: четыре assertions из full baseline остаются красными
  в `n8n-dependency-inventory`, `react-router-v8-migration` и
  `release-preparation`; они воспроизведены на clean origin/main и не связаны
  с Telegram UX.
- Появились в этапе: нет известных runtime, security или migration defects.
- Внешний blocker: Store Pilot #1 требует verified consenting seller, 10–30
  approved products, SLA/support/incident owners и явное разрешение onboarding.
- Stable production latency p95 всё ещё не доказан; единственный прежний cold
  sample 2564 ms нельзя превращать в p95 claim.

## 8. Следующая задача

R1 Store Pilot #1 preparation: после получения owner business inputs проверить
consent/product package и выполнить отдельный explicitly authorized onboarding
одного реального магазина. До получения inputs никаких real-data mutations.

## 9. Acceptance criteria следующего этапа

- Один verified consenting seller через заранее известный канал.
- Dated consent покрывает buyer-contact forwarding и отсутствие bot payments.
- 10–30 approved products: integer UZS price, availability, stock, RU/UZ search
  aliases и verified specs; photos через Telegram file_id либо решение без фото.
- Зафиксированы seller response SLA, support, incident и daily-review owners.
- Есть отдельное явное разрешение на real store onboarding.
- Canary доказывает owner/non-owner isolation, grounded catalog, idempotent order
  и inventory, handoff, privacy-safe analytics; cleanup/rollback готов.

## 10. Команды для старта

```powershell
Set-Location 'F:\Claude\gptbot-repo-clean-20260801'
git status --short --branch
git log -5 --oneline --decorate
git fetch origin main --prune
Get-Content -Encoding UTF8 docs/agents-platform/STATE.json
Get-Content -Encoding UTF8 docs/agents-platform/HANDOFF.md
Get-Content -Encoding UTF8 docs/agents-platform/ARCHITECTURE.md
Get-Content -Encoding UTF8 docs/agents-platform/ROADMAP.md
```

Затем targeted baseline: onboarding, buyer QA, checkout, orders/inventory,
handoff, pilot readiness, telegram webhook, Functions typecheck и secret scan.

## 11. Риски

- Не принимать callback/action/deep-link как seller authority.
- Не показывать dashboard paused/suspended seller.
- Не очищать active checkout при home/start/mode switch.
- Не возвращать empty comparison или global seller contact на buyer home.
- Не запускать `wrangler d1 migrations apply --remote`: production ledger
  заканчивается на 0025, хотя 0026–0030 физически применены.
- Не удалять secret `___`; не менять Railway trigger, scheduler или automation.
- Не трогать legacy bots/webhooks/routes/tokens.

## 12. Rollback

- Быстрый production rollback: переключить Pages на deployment
  `ede1d0f4-6a06-40e2-9b6c-dee2a7812c69` (source `41ec9e3`).
- Git rollback: `git revert -m 1 c670e4eebff79e2cc4b9027ffede865f0af813ab`,
  затем пройти Functions typecheck, targeted corpus, build и deploy нового
  exact-SHA.
- D1 rollback, migration rollback, webhook mutation и secret mutation не нужны:
  release не менял схему, данные или provider configuration.
