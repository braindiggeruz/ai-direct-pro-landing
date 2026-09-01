# Lead Radar: handoff по восстановлению зависших поисков и безопасной готовности Telegram

Дата handoff: 2026-09-01  
Проект: GPTBot.uz / Lead Radar  
Статус документа: технический handoff для немедленного продолжения новым агентом  
Язык оператора: русский

## 1. Короткий итог

В релизной ветке собран и полностью протестирован фикс, который устраняет бесконечное зависание поисков Lead Radar в `running`, прекращает цикл `retry_wait -> cron -> ACK -> retry_wait`, возвращает ручной кнопке обработки корректное поведение и усиливает fail-closed проверку Telegram перед подготовкой или запуском кампании.

Код исправления:

- fix-коммит: `418f77d0f7500670e54c818cd4f199f89c8955da`;
- live-база для слияния: `147a8dc3b1e0a382727e876978ebf97d0b5e821d`;
- итоговый merge-коммит релиза: `c2571faced019f5394bcadea73b038143fec6eca`;
- финальный production Pages/config-коммит: `bfdd53e3ad405f6d0b01c134d384fc2d8d3e30b6`;
- релизная ветка: `release/lead-radar-stuck-recovery-20260901`;
- канонический clean release worktree: `F:\Claude\gptbot-lead-radar-release-20260901`.

Полный локальный release-gate зелёный: 13/13 этапов, 607 основных тестов, 51 тест Windows Telegram Bridge и 126 проверок parser/crawler.

Важно: реальная Telegram-рассылка и даже одно тестовое сообщение не запускались. Этот релиз исправляет поиск, восстановление очереди, UI и проверки готовности. Фактическая отправка остаётся отдельным, явно подтверждаемым владельцем действием после live-проверки аккаунта, Bridge, адресата, основания для контакта и ограничений кампании.

## 2. Цель работы

Пользователь наблюдал два класса проблем:

1. поиск компаний со вчерашнего дня оставался в статусе «Выполняется», хотя сохранённые карточки уже были получены;
2. проверка контактов или ручная обработка останавливалась на временном ограничении источника и не переходила к остальным доступным контактам;
3. UI переставал автоматически обновлять длинный поиск и создавал впечатление, что система навсегда зависла;
4. старая запись `connected` в D1 могла визуально выглядеть как доказательство готовности Telegram, хотя текущий приватный маршрут аккаунта или локальный Bridge уже могли быть недоступны.

Цель релиза — гарантировать конечное состояние каждого поиска в пределах ограниченного SLA, сохранять уже найденные данные, не давать одной исчерпанной задаче блокировать новые поиски и не допускать подготовку/запуск кампании без свежей операционной аттестации Telegram.

## 3. Исходная production-картина до исправления

Read-only снимок D1 до релиза показал:

- поиски: `failed=2`, `insufficient=4`, `partial=18`, `ready=7`, `running=2`;
- задачи: `completed=495`, `dead_letter=40`, `queued=1`, `retry_wait=52`;
- Telegram campaigns: `0`;
- Telegram approvals: `0`.

Два старых поиска продолжали считаться активными:

- один находился в `running/enriching`, имел примерно `raw=186`, `candidate=10`, `processed=10`, `verified=10`;
- второй находился в `running/enriching`, имел примерно `raw=186`, `candidate=60`, `processed=60`, `verified=60`.

Среди активных `retry_wait` были задачи с `attempt_count=3` и `max_attempts=3`:

- `contact_sources_domain_budget_exhausted`: 6;
- `contact_sources_free_page_4_*`: 27;
- `contact_sources_free_page_5_*`: 19.

Это был не просто медленный внешний источник: задачи уже исчерпали формальный бюджет попыток, но продолжали оставаться частью активного хвоста поиска.

## 4. Root cause

### 4.1. Потеря attempt-бюджета для продолжений источника

`retryJob` уменьшал `attempt_count` только для достаточно молодых задач — старше примерно 30 минут сохранение attempt-бюджета уже не применялось. Продолжения проверки контактов живут дольше этого окна, особенно при provider rate limit и последовательном обходе бесплатных страниц.

В результате старая contact-resolution задача достигала `attempt_count=max_attempts`.

### 4.2. Consumer не мог повторно claim-ить такую запись

Когда cron заново делал задачу доступной, consumer видел `retry_wait`, но claim отклонялся из-за уже исчерпанного `max_attempts`. Сообщение при этом ACK-алось как необрабатываемое. Сама строка задачи оставалась в D1 активной.

### 4.3. Cron воспроизводил цикл

Следующий cron снова находил ту же строку и пытался её переотправить. Получался устойчивый цикл:

`retry_wait (attempt=max) -> cron redispatch -> consumer refuses claim -> ACK -> retry_wait`.

Из-за активного хвоста поиск не переходил в терминальное состояние и занимал один из лимитов незавершённых поисков. Пользователь получал сообщение «другой поиск уже выполняется», хотя полезная работа фактически закончилась.

### 4.4. UI прекращал помогать после длинного ожидания

UI имел ограниченное окно polling примерно 15 минут. После остановки polling обычное открытие или refresh не всегда запускали цикл заново. Ручной pulse смотрел шире выбранного поиска и мог показывать устаревший pre-pulse snapshot вместо фактически записанного терминального состояния.

### 4.5. Telegram readiness полагалась на недостаточно свежий сигнал

Долговечная запись D1 `connected` — историческое состояние, но не доказательство текущей возможности отправки. Для настоящей готовности необходимо проверить именно привязанный приватный route аккаунта и получить одновременно:

- `account_status=connected`;
- `bridge_status=online`.

Для production BridgeMailbox `snapshot_present=false` является нормальной архитектурой: Telegram session остаётся локально под DPAPI и не должна публиковаться в Cloudflare. Поэтому отсутствие cloud snapshot нельзя трактовать как отсутствие аккаунта, но и одна D1-запись не может считаться текущей аттестацией.

## 5. Что реализовано в fix-коммите `418f77d`

Fix-коммит меняет 10 файлов: 1612 добавлений и 174 удаления.

### 5.1. `functions/platform/lead-radar/store.ts`

Добавлено централизованное и ограниченное восстановление deferred queue work:

- `retryJob` получил явный флаг сохранения attempt-бюджета; продолжение provider pagination больше не расходует failure-attempt как настоящая ошибка;
- добавлен сброс legacy max-attempt задач в контролируемое состояние;
- добавлена обработка задач, которые уже исчерпали попытки и не могут быть claim-нуты;
- добавлена терминализация хвоста старого contact search;
- при истечении часового окна поиск сохраняет найденные компании и переходит в `partial`, вместо вечного `running`;
- активные candidate pools закрываются с явной причиной, чтобы остаток не выглядел как ещё доступная работа;
- recovery-скан ограничен по количеству строк и может быть scoped конкретным `searchId`;
- `listExpiredJobs` умеет ограничиваться выбранным поиском;
- overview использует сохранённый `resolvedTelegramCount`, а не придумывает late-stage прогресс из косвенных счётчиков.

Ключевой принцип: recovery не удаляет найденные компании и не обнуляет полезный результат. Он завершает только невыполнимый хвост и освобождает admission для нового запуска.

### 5.2. `functions/platform/lead-radar/queue.ts`

Добавлена единая политика конечности очереди:

- provider continuations сохраняют attempt-бюджет независимо от возраста задачи;
- установлен предел обработки contact-resolution search: 1 час;
- перед обычной обработкой запускается bounded recovery старых deferred rows;
- legacy `attempt_count >= max_attempts` больше не зацикливаются между cron и consumer;
- expired search получает терминальное состояние, а не бесконечный redispatch;
- cron/consumer не должны бесконечно поддерживать активность отравленной строки.

Ограничения recovery намеренно малы: это защищает D1 и очередь от тяжёлого массового ремонта за один invocation.

### 5.3. `functions/platform/lead-radar/search-pulse.ts`

Ручной pulse теперь:

- работает только с выбранным `searchId`, а не со всеми активными поисками организации;
- сначала запускает scoped recovery;
- dispatch-ит только реально доступные задачи этого поиска;
- после изменений повторно читает committed state из D1;
- возвращает `remaining=0`, если поиск уже завершён или pool закрыт;
- сообщает пользователю о `partial` как о сохранённом частичном результате, а не предлагает бесконечно нажимать кнопку.

### 5.4. `functions/platform/lead-radar/telegram-account-service.ts`

Добавлен browser-safe operational projection `TelegramAccountRouteState` и чтение текущего `/v1/accounts/health` для точного приватного route аккаунта.

Проекция отделяет:

- наличие route;
- фактический account status;
- reason code/provider block;
- Bridge state;
- время свежей проверки.

В коде явно зафиксировано, что `snapshot_present=false` допустим для BridgeMailbox и сам по себе не блокирует отправку.

### 5.5. `functions/platform/lead-radar/telegram-campaign.ts`

Добавлены read-before-probe idempotency helpers:

- `getTelegramCampaignPreparationReplay`;
- `getTelegramCampaignTransitionReplay`.

Точный повтор ранее успешного `prepare`, `start` или `resume` возвращает уже сохранённый результат и не требует доступности gateway в данный момент. Новый запрос, напротив, обязан пройти свежую readiness-проверку.

Это предотвращает двойные campaign effects и повторную постановку отправки в очередь при сетевом retry клиента.

### 5.6. `functions/api/admin/lead-radar/telegram-campaign-control.ts`

Усилены API-гейты:

- GET состояния аккаунта сохраняет честную durable D1-модель даже при временном outage, вместо ложного отображения «не настроено»;
- preflight проверяет текущий keyed route и Bridge;
- новый `prepare` не создаёт approval, если аккаунт требует reauth, gateway недоступен или Bridge offline;
- `start` и `resume` не меняют состояние кампании и ничего не ставят в очередь без свежей operational attestation;
- idempotent replay проверяется до обращения к gateway;
- состояние `restricted`, `reauth_required`, `bridge_offline`, `gateway_unavailable` проектируется отдельными кодами;
- все новые ветки fail closed.

### 5.7. `src/admin/pages/LeadRadar.tsx`

Исправлена операторская логика:

- ручная кнопка «Обработать партию сейчас» защищена от двойного клика;
- результат pulse относится только к открытому поиску и текущей UI-операции;
- после pulse выполняется отложенное чтение сохранённого результата, а не только мгновенный старый snapshot;
- ручное «Обновить статус» заново запускает polling;
- polling revision отделяет новый цикл от старого остановленного цикла;
- переход между поисками не позволяет запоздалому ответу перезаписать другую карточку;
- late-stage counters и тексты больше не изображают незавершённую работу после фактической терминализации;
- rate-limit сообщение объясняет, что уже найденный результат не потерян.

### 5.8. Тесты

Обновлены или добавлены:

- `tests/lead-radar-stuck-search-recovery.test.ts` — bounded recovery, max-attempt legacy rows, часовой SLA, scoped pulse, сохранение partial результата, admission после восстановления;
- `tests/lead-radar-search-ui.test.ts` — copy, polling restart, stale-response protection, progress counters;
- `tests/lead-radar-telegram-campaign-api.test.ts` — fresh route/Bridge attestation, offline/reauth blockers, отсутствие мутаций при блокере, безопасные idempotent replays.

## 6. Merge с актуальным production-кодом

Во время подготовки релиза `origin/main` ушёл вперёд до `147a8dc3b1e0a382727e876978ebf97d0b5e821d`. Разворачивать старую ветку напрямую было нельзя: это могло затереть свежую GSC/indexation работу.

Поэтому создан clean release worktree и выполнено семантическое слияние:

```text
418f77d  fix(lead-radar): converge stalled searches safely
   +
147a8dc  current live/main GSC and crawler state
   =
c2571fa  merge: reconcile live GSC release with Lead Radar recovery
```

Решения при конфликтах:

- сохранена зрелая существующая реализация crawler/collector, а не упрощённая конфликтующая версия;
- сохранён `WebsiteCollectorCard`; несовместимый дублирующий `LeadRadarCrawlerCard` не включён;
- удалены дублирующиеся/недостижимые simplified crawler routes и API projections;
- включены свежие live GSC изменения: blog query cleanup, explicit `/ru/blog` и `/uz/blog` edge routes, redirect hygiene и content updates;
- `public/_routes.json` оставлен в совместимом с live виде: `/api/*`, `/ru/blog`, `/ru/blog/`, `/uz/blog`, `/uz/blog/`, `/admin-tools/*`, `/admin/*`, `/robots.txt`, с исключением `/admin/assets/*`;
- не возвращены article wildcards/webhook/sitemap routes, которые могли бы регрессировать GSC edge behavior;
- `package.json` объединяет полный crawler suite и текущий main contract без дублирующего script key;
- recipient directory сохранил строгую Telegram typed-evidence проверку и получил live performance caps: до 256 contact candidates и до 128 phone evidences на компанию, с кешированием parsed projection;
- добавлен/актуализирован `tests/lead-radar-crawler-contract.test.ts`.

Итоговый merge-коммит имеет родителей `418f77d` и `147a8dc` и является единственным кодовым кандидатом этого handoff для production.

## 7. Архитектура Lead Radar после релиза

### 7.1. Поиск и парсинг

```text
Admin UI
  -> Lead Radar admin API
  -> LeadRadar service/store
  -> D1: search + candidate pool + jobs
  -> Cloudflare Queue: opaque job envelope
  -> automation worker/consumer
  -> free sources / website collector / optional Firecrawl / parser
  -> normalized company + evidence + contact candidates
  -> D1 committed counters and cards
  -> UI polling / manual scoped pulse
```

Принципы:

- D1 — источник истины по статусу поиска, задачам и сохранённым карточкам;
- Queue envelope не должен содержать чувствительные contact payloads;
- внешнее ограничение источника не должно удалять уже найденный результат;
- каждое продолжение имеет конечный search deadline;
- cron ремонтирует только ограниченную порцию строк;
- новый поиск не блокируется навсегда старым невыполнимым хвостом.

### 7.2. Website collector/crawler

Collector enrich-ит официальные сайты и публичные evidence-страницы, после чего parser извлекает нормализованные телефоны и публичные Telegram locators. Зрелый collector из release worktree сохранён при merge. Миграция `0056_lead_radar_crawler.sql` уже была применена до этого релиза; новых D1 migrations в рамках данного fix не создавалось и не применялось.

Наличие телефона или username ещё не делает компанию готовой к отправке. Дальше включается Telegram readiness pipeline.

### 7.3. Telegram readiness и кампания

```text
Public business contact evidence
  -> normalized recipient directory
  -> corporate ownership / personal-profile / bot filters
  -> strict Bridge verification
  -> documented contact basis and policy gates
  -> fresh keyed account route status
  -> Bridge online attestation
  -> read-only preflight
  -> immutable preparation + approval
  -> explicit start
  -> queue effect
  -> send worker with rate limits, DNC, receipts and idempotency
```

Обязательные различия:

- публичный телефон/username — кандидат, а не согласие;
- D1 `connected` — историческая durable запись, а не live readiness;
- `snapshot_present=false` — нормален для локальной DPAPI-сессии BridgeMailbox;
- готовность требует точного route `connected` и Bridge `online`;
- preflight read-only: он не создаёт approval и не отправляет сообщение;
- подготовка фиксирует точный текст/адресатов/основание;
- реальная отправка возможна только после отдельного start и всех серверных гейтов.

## 8. Локальная верификация

Авторитетный отчёт:

- файл: `F:\Claude\gptbot-lead-radar-release-20260901\reports\lead-radar-release-gate.json`;
- schema: `gptbot.lead-radar.release-gate.v2`;
- status: `green`;
- complete: `true`;
- input manifest SHA-256: `9d44f2f068c6946f23e21cfb2a9a749b70344e9f90cc8ad2344e92263d1599dd`.

Все 13 gate-команд завершились `pass`:

1. app typecheck;
2. functions typecheck без waiver;
3. Lead Radar API/worker/UI typecheck;
4. Telegram gateway typecheck;
5. Lead Radar lint;
6. Lead Radar test suite;
7. Windows Telegram Bridge tests;
8. website collector tests;
9. secret scan;
10. secret-scan self tests;
11. Cloudflare Pages build;
12. automation Worker dry-run;
13. Telegram gateway Worker dry-run.

Счётчики:

- 607/607 основных тестов;
- 51/51 Windows Telegram Bridge tests;
- 126/126 parser/crawler checks;
- 13/13 release gates;
- secret scan green;
- Pages и оба Worker bundles успешно построены в dry-run.

Для Windows Bridge понадобились зависимости из lock-файла:

```powershell
python3 -m pip install --require-hashes -r tools/lead-radar-telegram-bridge/requirements.lock
```

Это установка pinned зависимостей; она не выполняет Telegram login и не отправляет сообщения.

Безопасный повтор полного локального gate:

```powershell
Set-Location -LiteralPath 'F:\Claude\gptbot-lead-radar-release-20260901'
npm run release:lead-radar
```

По контракту отчёта этот gate не выполняет remote writes, deploy и migrations.

Быстрые целевые проверки:

```powershell
Set-Location -LiteralPath 'F:\Claude\gptbot-lead-radar-release-20260901'
npm run typecheck:lead-radar
node --import tsx --test tests/lead-radar-stuck-search-recovery.test.ts tests/lead-radar-search-ui.test.ts tests/lead-radar-telegram-campaign-api.test.ts tests/lead-radar-crawler-contract.test.ts tests/gsc-indexation-hygiene.test.ts
```

## 9. Git/worktree safety

### 9.1. Канонический clean release worktree

Работать дальше следует из:

```text
F:\Claude\gptbot-lead-radar-release-20260901
```

Ожидаемая ветка:

```text
release/lead-radar-stuck-recovery-20260901
```

Развёрнутый code commit:

```text
c2571faced019f5394bcadea73b038143fec6eca
```

В clean worktree могут существовать ignored junctions для повторного использования зависимостей:

- root `node_modules`;
- crawler `.venv-scrapling`.

Не удалять их рекурсивной командой и не путать с исходными каталогами, на которые они указывают.

### 9.2. Original worktree грязный и принадлежит пользователю

Не использовать destructive reset/clean в:

```text
F:\Claude\gptbot-lead-radar-integration-20260827
```

Там до этой работы уже были пользовательские изменения и untracked материалы, включая:

- `AGENTS.md`;
- `STATE.md`;
- `docs/lead-radar/SCRAPLING_ACTIVATION_20260831.md`;
- `tests/lead-radar-queue-reliability.test.ts` с отличием только по окончаниям строк;
- `.kimi-code`, `.serena`, временные каталоги, старые handoff/docs и `graphify-out`.

Не делать `git reset --hard`, `git clean`, `checkout --` или массовое удаление. Fix-коммит `418f77d` уже существует; релиз собран отдельно именно для сохранения пользовательского WIP.

## 10. Production deployment record

### 10.1. Постоянные идентификаторы

- Cloudflare account: `14ce9e04574f2e6d825e56ee603e5cd5`;
- Pages project: `ai-direct-pro-landing`;
- automation Worker: `gptbot-automation`;
- D1 database: `gptbot-ai-drafts`;
- D1 database id: `97ef0372-d937-406f-8871-755368d9afff`;
- Lead Radar organization id: `owner_8ee98dc3040f160b308166b0`.

Не копировать в handoff токены или значения secrets. В production до deploy было 30 Worker bindings; после deploy необходимо сравнивать набор `type:name`, не раскрывая secret values.

### 10.2. Automation Worker

Предыдущая известная версия:

- version number: 54;
- version id: `110dcdf6-afd2-4548-a7bb-1add16768bb7`.

Новая версия с Lead Radar recovery:

- version number: 55;
- version id: `6bd239a5-d2f2-4bdc-a08e-e70d9948c9bd`;
- deployment id: `c469da9d-af59-4fba-9ea8-f28f39cc9511`;
- traffic: 100%;
- created at: `2026-09-01T01:14:40.429881Z`.

Доказательство bindings:

```text
Проверено 2026-09-01 через `wrangler versions view` для Worker version 54 и 55.
oldVersion=110dcdf6-afd2-4548-a7bb-1add16768bb7, oldNumber=54, oldBindingCount=30
newVersion=6bd239a5-d2f2-4bdc-a08e-e70d9948c9bd, newNumber=55, newBindingCount=30
sameBindingSet=true, diff=[]
```

### 10.3. Cloudflare Pages

Production Pages опубликован из уже построенного артефакта, stamped commit:

```text
bfdd53e3ad405f6d0b01c134d384fc2d8d3e30b6
```

Финальный readback:

```text
deployment id: 36b5b025-8d32-46d8-8870-17c8e1f2efa9
deployment url: https://36b5b025.ai-direct-pro-landing.pages.dev
environment: Production
branch: main
source: bfdd53e
build URL: https://dash.cloudflare.com/14ce9e04574f2e6d825e56ee603e5cd5/pages/view/ai-direct-pro-landing/36b5b025-8d32-46d8-8870-17c8e1f2efa9
live custom domain marker checked at: https://gptbot.uz/gptbot-release.json?verify=handoff-20260901-*
live marker commit: bfdd53e3ad405f6d0b01c134d384fc2d8d3e30b6
live marker artifactSha256: 246941d038d1757899850b896e615ce12965a91338831c40cc81b83d2e7c8972
live marker fileCount: 870
live marker features: audience_directory,mobile_username_selection,bridge_pairing,sending_readiness,campaign_preflight,async_media_check
```

Ожидаемый live marker для дальнейших проверок:

```text
https://gptbot.uz/gptbot-release.json
commit = bfdd53e3ad405f6d0b01c134d384fc2d8d3e30b6
files = 870
features = audience_directory,mobile_username_selection,bridge_pairing,sending_readiness,campaign_preflight,async_media_check
```

До Pages deploy guard подтвердил lineage: предыдущее production-состояние было на `147a8dc3b1e0a382727e876978ebf97d0b5e821d`, новый build является его superset через merge-коммит `c2571fa`. После первого deploy был найден и исправлен дублирующий `LEAD_RADAR_CRAWLER_ENABLED` в `wrangler.toml`; итоговый Pages deploy поэтому указывает на `bfdd53e`.

### 10.4. Production D1 после cron convergence

Read-only снимок после deploy:

```text
Проверено 2026-09-01 helper-ом `Read-LeadRadarProduction.cjs`, только SELECT, rows_written=0.

Search counts:
failed=2
insufficient_results=4
partial=20
ready=7
running=1

Job counts:
completed=508
dead_letter=93
retry_wait=4

Current active running search:
id=search_c650a4d7c9a7443eb371efd7dba629eb
status=running
phase=enriching
candidate_count=10
raw_discovered_count=186
processed_count=6
verified_count=10
completed_at=null

Active queued/retry_wait/running job rows:
status=retry_wait
stage=enrichment
attempt_count=2
max_attempts=3
last_error_code=source_unavailable
total=4

Telegram campaigns=0
Telegram approvals=0
Contact checks: failed=2, limited=2, resolved=3, unresolved=29
Latest account row: status=connected, connected_at=2026-08-28T03:17:21.217Z, last_health_at=2026-08-28T03:17:31.755Z
Account finalizations query returned no rows.
```

Ожидание:

- старые `running` searches старше часового окна больше не активны;
- они завершены как `partial` с сохранёнными карточками, если результат был;
- текущий live-state уже не показывает старую max-attempt петлю: активные `retry_wait` имеют `attempt_count=2`, `max_attempts=3`;
- `campaigns=0` и `approvals=0` остаются без изменений, пока владелец явно не готовит кампанию;
- никакие Telegram sends/effects не должны появиться от самого recovery deploy.

## 11. Безопасная production-диагностика

### 11.1. Read-only D1 snapshot helper

Временный helper хранит Cloudflare credential только в памяти, не печатает и не записывает его:

```powershell
node 'F:\Claude\.lead-radar-collector-stage-20c7a43e2b514ca19990f314ae26e6cc\Read-LeadRadarProduction.cjs' summary
node 'F:\Claude\.lead-radar-collector-stage-20c7a43e2b514ca19990f314ae26e6cc\Read-LeadRadarProduction.cjs' stuck
node 'F:\Claude\.lead-radar-collector-stage-20c7a43e2b514ca19990f314ae26e6cc\Read-LeadRadarProduction.cjs' telegram
```

Helper выполняет только SELECT. Его cwd/auth source сейчас указывает на original worktree, поэтому не редактировать helper вслепую и не запускать его из окружения без настроенной native Wrangler auth.

### 11.2. Git/read-only checks

```powershell
Set-Location -LiteralPath 'F:\Claude\gptbot-lead-radar-release-20260901'
git status --short
git show --no-patch --pretty=raw c2571faced019f5394bcadea73b038143fec6eca
git merge-base --is-ancestor 147a8dc3b1e0a382727e876978ebf97d0b5e821d c2571faced019f5394bcadea73b038143fec6eca
git merge-base --is-ancestor 418f77d0f7500670e54c818cd4f199f89c8955da c2571faced019f5394bcadea73b038143fec6eca
```

Обе `merge-base` команды должны завершаться с exit code 0.

### 11.3. Live marker без административной сессии

```powershell
$uri = 'https://gptbot.uz/gptbot-release.json?verify=20260901-stuck-recovery'
Invoke-RestMethod -Uri $uri -Method Get
```

Проверять нужно поле commit, а не только HTTP 200: здоровый старый deploy тоже может возвращать 200.

### 11.4. Authenticated UI acceptance

В обычном Chrome после Pages readback:

1. открыть `https://gptbot.uz/admin-tools/lead-radar`;
2. открыть старый зависший поиск;
3. нажать «Обновить статус» и убедиться, что polling возобновился;
4. при наличии активной задачи нажать «Обработать партию сейчас» один раз;
5. убедиться, что кнопка не создаёт второй параллельный pulse;
6. убедиться, что завершённый поиск показывает сохранённый `partial/ready`, а не вечное «Выполняется»;
7. создать новый поиск в безопасной нише и проверить, что admission больше не блокируется старым хвостом;
8. открыть Telegram preflight, но не нажимать финальный start и не отправлять сообщение;
9. при offline/reauth Bridge UI должен показать конкретный blocker без создания approval/campaign effect.

Результат authenticated UI acceptance:

```text
Не выполнено этим агентом: нет управляемой авторизованной Chrome-сессии в текущем turn.
Что уже проверено вместо этого: live marker на custom domain, Worker deployment/readback,
Worker bindings, production D1 SELECT snapshot, локальные tests/build/release gate.
Следующему агенту нужно выполнить Chrome acceptance вручную или через доступный browser connector.
```

## 12. Acceptance criteria

Релиз считается полностью подтверждённым только при одновременном выполнении всех пунктов.

### 12.1. Build/release

- release-gate `green`, 13/13;
- live Pages marker указывает на `bfdd53e...`;
- automation Worker version 55 получает 100% traffic;
- bindings set новой Worker-версии идентичен baseline по `type:name`;
- не потеряны live GSC/blog edge изменения из `147a8dc`.

### 12.2. Recovery/search

- нет поисков старше 1 часа, остающихся `running` только из-за contact tail;
- нет активных max-attempt задач, зацикленных между cron и consumer;
- старые найденные компании сохранены;
- terminal/partial search не показывает фиктивный остаток;
- ручной pulse dispatch-ит только выбранный search;
- ручной refresh возобновляет polling;
- новый поиск принимается после освобождения admission;
- provider rate limit оставляет понятный deferred/partial результат и не замораживает систему навсегда.

### 12.3. Parser/crawler

- crawler contract tests зелёные;
- parser checks 126/126;
- реальный поиск сохраняет нормализованные карточки и публичные evidence links;
- телефоны/username не теряются из-за UI progress projection;
- duplicate contacts объединяются, а personal profiles/bots/stationary numbers не превращаются автоматически в sendable recipients.

### 12.4. Telegram safety/readiness

- preflight не создаёт approval, campaign или send effect;
- stale D1 `connected` без live route не считается готовностью;
- `bridge_offline` и `reauth_required` блокируют prepare/start/resume;
- exact idempotent replay не создаёт второй effect;
- при live route `connected` + Bridge `online` всё равно проверяются recipient proof, основание, DNC/history, limits и точный frozen text;
- до отдельного разрешения владельца не отправлено ни одного реального сообщения.

## 13. Ограничения и честные границы проверки

- Локальные тесты доказывают кодовые контракты, но не доказывают доступность конкретного Telegram аккаунта прямо сейчас.
- D1 `last_health_at` может быть историческим. Актуальное состояние подтверждает только свежий keyed `/v1/accounts/health` через private service binding.
- `snapshot_present=false` не ошибка для BridgeMailbox; session хранится локально.
- Наличие мобильного номера не означает, что он зарегистрирован в Telegram, является корпоративным и имеет допустимое основание для исходящего контакта.
- Provider limits и исчерпание бесплатных источников всё ещё возможны. Исправление гарантирует сохранение частичного результата и конечность, а не магическую доступность любого внешнего источника.
- «100% работает» нельзя заявлять до live marker, Worker binding readback, D1 convergence и authenticated UI acceptance.
- Реальная рассылка намеренно не была частью проверки.

## 14. Rollback plan

Rollback выполнять только при подтверждённой live-регрессии: рост 5xx, поломка admin UI, повреждение search state или несовместимость bindings.

### 14.1. Worker rollback

Известная предыдущая версия Worker: version 54, id `110dcdf6-afd2-4548-a7bb-1add16768bb7`.

Безопасный порядок:

1. сохранить read-only snapshot текущей версии/deployment и D1 counts;
2. в Cloudflare Versioning выбрать существующую version 54 и направить на неё 100% traffic;
3. не пересоздавать Worker и не загружать старый bundle поверх текущих vars/secrets;
4. после переключения сравнить все bindings по `type:name`;
5. проверить Worker errors, D1 counts и UI;
6. не откатывать D1: этот релиз не применял migration.

Команда CLI для rollback здесь намеренно не зафиксирована без локальной проверки синтаксиса конкретной версии Wrangler. Если нужен CLI, сначала выполнить read-only `wrangler versions deploy --help`, сверить синтаксис установленной версии и только затем записать фактическую команду в incident log.

### 14.2. Pages rollback

Предыдущий известный production code commit: `147a8dc3b1e0a382727e876978ebf97d0b5e821d`.

Безопасный порядок:

1. определить точный last-known-good Pages deployment в Cloudflare по commit metadata;
2. выбрать именно существующий production deployment, не собирать старый source tree из грязного worktree;
3. после rollback проверить `gptbot-release.json`, `/admin-tools/lead-radar`, `/ru/blog`, `/uz/blog` и blog query cleanup;
4. не считать HTTP 200 достаточным доказательством — сверить commit marker и ключевые live routes.

Предыдущий известный production Pages deployment перед этим релизом:

```text
id=f133bfa0-432b-45cc-a802-99fd06ed05bb
source=147a8dc
url=https://f133bfa0.ai-direct-pro-landing.pages.dev
```

## 15. Немедленный чеклист следующему агенту

1. Работай только из `F:\Claude\gptbot-lead-radar-release-20260901`.
2. Проверь `git status`, текущую ветку и наличие `c2571f` в истории.
3. Не очищай original dirty worktree.
4. Заполни Worker binding readback; должно быть 30 совместимых bindings.
5. Заполни Pages deployment id/URL/time и live marker.
6. После scheduled cron выполни три read-only D1 snapshot режима: `summary`, `stuck`, `telegram`.
7. Если старые max-attempt rows всё ещё активны, сначала проверь, действительно ли Worker version 55 получает 100% traffic и прошёл ли cron; не меняй D1 вручную без отдельного плана.
8. Проведи authenticated UI acceptance в обычном Chrome.
9. Создай один новый безопасный поиск и дождись terminal state; не создавай параллельные поиски для «ускорения».
10. Проверь сохранённые карточки, evidence links, нормализованные телефоны/username и отсутствие фиктивного остатка.
11. Выполни только read-only Telegram preflight. Не запускай реальную отправку.
12. Сверь, что preflight при offline/reauth не создал approvals/campaigns/effects.
13. Заполни все placeholders этого документа фактическими данными с timestamp.
14. Если ветка ещё не опубликована, зафиксируй её remote ref без force push:

```text
На момент handoff ветка локальная: release/lead-radar-stuck-recovery-20260901.
Remote push этого handoff-коммита нужно выполнить отдельно, если требуется передача через Git:
git push -u origin release/lead-radar-stuck-recovery-20260901
```

15. В итоговом отчёте раздели: локально доказано, production readback доказано, UI доказано и ещё не проверено.

## 16. Запрещённые shortcut-действия

- не делать `git reset --hard` или `git clean` в original worktree;
- не выполнять ручные UPDATE/DELETE в production D1 для «быстрого исправления» без отдельного backup/rollback плана;
- не считать Worker upload доказательством, пока не проверены live version traffic и bindings;
- не считать Pages deployment metadata доказательством, пока canonical domain marker не совпал;
- не трактовать D1 `connected` как живой Telegram аккаунт;
- не обходить Bridge, consent/contact basis, DNC, rate limits или approval;
- не отправлять реальное сообщение ради smoke test без явного разрешения владельца;
- не включать credentials, phone numbers, session material или secret values в handoff/commit/log.

## 17. Что ещё нужно доказать следующему агенту

Все production/read-only placeholders этого документа заполнены. Остаются только две практические проверки:

1. authenticated UI acceptance в обычном Chrome под аккаунтом владельца;
2. Git push локальной release-ветки, если нужно передать состояние через remote branch.

Реальную Telegram-отправку не выполнять как smoke test без отдельного явного разрешения владельца.

## 18. Авторитетные файлы для продолжения

- `reports/lead-radar-release-gate.json` — полный release-gate и хеши артефактов;
- `docs/LEAD_RADAR_PRODUCTION_RUNBOOK.md` — production runbook;
- `docs/LEAD_RADAR_TELEGRAM_CAMPAIGNS_ADR.md` — архитектурные и safety решения кампаний;
- `functions/platform/lead-radar/store.ts` — D1 state/recovery;
- `functions/platform/lead-radar/queue.ts` — consumer/cron/retry policy;
- `functions/platform/lead-radar/search-pulse.ts` — scoped manual recovery;
- `functions/api/admin/lead-radar/telegram-campaign-control.ts` — API readiness gates;
- `functions/platform/lead-radar/telegram-account-service.ts` — exact route/Bridge health projection;
- `functions/platform/lead-radar/telegram-campaign.ts` — preparation/transition/idempotency;
- `src/admin/pages/LeadRadar.tsx` — search UI and polling;
- `tests/lead-radar-stuck-search-recovery.test.ts` — основной регрессионный контракт зависаний;
- `tests/lead-radar-telegram-campaign-api.test.ts` — Telegram fail-closed/idempotency contract;
- `tests/lead-radar-crawler-contract.test.ts` — crawler integration contract.

---

Главное для следующего агента: не переделывать архитектуру заново. Сначала закончить production readback и заполнить placeholders. Кодовый recovery уже проходит полный gate; оставшаяся работа — доказать live convergence, UI-поведение и фактическую готовность конкретного Telegram route без реальной отправки.
