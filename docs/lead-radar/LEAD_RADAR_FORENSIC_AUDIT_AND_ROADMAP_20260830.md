# LEAD RADAR — FORENSIC AUDIT AND ROADMAP (2026-08-30, вечерняя сессия)

Режим: **AUDIT ONLY**. Ни одной отправки, ни одного деплоя, ни одной мутации production, D1, flags, секретов и сессий за этой сессией не выполнено. Изменения ограничены этим документом.

База аудита: HEAD `5845616` ветки `codex/lead-radar-main-integration-20260827` (≈ 11:26 +05, 30.08). Методы: чтение кода и тестов на HEAD; **свежий прогон** `typecheck:lead-radar` и тестовых сюит (348+105+106+98, все зелёные); read-only D1-агрегаты через Cloudflare API (07:28–07:30 UTC 30.08); read-only метаданные Pages/Workers (имена bindings, значения только не-секретных flags); read-only статус локального Bridge (`cli status`, задача планировщика); выверка утреннего аудита `docs/lead-radar/audit-2026-08-30/` (HEAD `0ddce6c`) и мастер-handoff 30.08; независимые субагенты-верификаторы по очередям/кампаниям и red-team проход.

Важно: между мастер-handoff (05:47) и этой сессией другой агент уже провёл read-only аудит и **задеплоил** серию исправлений (R0 `7ffacbb`, R1 `07b9398`, R4 `11b85f6`, Tier-1 `26229de`, QR-5 `4e64603`, watchdog `c7ff659`, manual pulse `bf32cff`/`b9da5ae`, QR-7/QR-9 `5845616`). Поэтому этот документ — не повтор утреннего аудита, а **проверка его дефект-листа на текущем HEAD + свежие измерения production + новые находки**.

---

# 1. Executive verdict (простыми словами)

Lead Radar сегодня не работает «до конца» не потому, что кнопка отправки сломана. Код отправки — самая защищённая часть системы: непроверенный контакт до отправки не доходит (тройная перепроверка), дубли закрыты (идемпотентный ключ + одна попытка + CAS-lease), квота 30/сутки и интервал 120 с считаются сервером, unknown-исход не ретраится вслепую. Всё это перепроверено на HEAD.

Система не работает потому, что **строгий send-ready набор пуст и воронка контактов задушена**:

1. **Ноль свежих проверенных контактов.** За всю историю — 7 Telegram-проверок, все истекли (TTL 24 ч, авто-перепроверки нет). Свежих `bridge_resolved_corporate` на момент замера: **0**. Корректная кампания не может быть собрана не из-за бага, а из-за честной пустоты.
2. **Воронка контактов задушена бюджетом и старыми парковками.** 1010 компаний, из них 1006 в terminal-обогащении. Из 217 enrichment-исходов **181 — бюджетные блокировки** (`budget_or_lease_blocked` 126, `search_budget_exhausted` 42, company 7, domain 6). Только 4 поиска дали кандидатов. Firecrawl-бюджет: 28.08 — 200/200 (потолок), 29.08 — 116, 30.08 — 27: код сегодня фактически живёт на бесплатном top.uz-пути. Дополнительно система работает в **research-only режиме** (`LEAD_RADAR_CONTACT_ENABLED=false` → `personalDataEnabled=false` вырезает human/decision-maker контакты при обогащении) — корпоративный send-ready это не сужает (личные всё равно исключаются), но каталог беднее, чем ожидает владелец.
3. **Операторский путь (R4) установлен, но ни разу не использован.** Кнопка «Я проверил источник: контакт компании» развернута, но в D1 нет ни одной `operator_confirmed`-записи. Ключевой человеческий шаг воронки простаивает.
4. **НОВОЕ: release gate красный на HEAD.** Полный functions-typecheck (`tsc -p tsconfig.functions.json`) падает на 2 type-ошибках, одна из которых — в коде, добавленном сегодня (`search-pulse.ts`). Guarded-деплой этот гейт не гоняет, поэтому production мог уйти вперёд «красного» состояния — это ровно тот класс процессов, который уже один раз уничтожал UI Lead Radar (26.08).
5. **Мелкая потеря компаний всё ещё возможна:** dead-lettered `contact-resolve:` job'ы не возрождаются для того же поиска (остаток QR-1, в D1 таких 7) — компании из этих поисков молча выпадают из воронки контактов.

Топ-5 критичных (по влиянию на «рассылка работает»): красный release gate; пустой verified-набор (TTL + бюджет + неиспользуемый R4); QR-1-остаток (молчаливая потеря); стагнация второго поиска при 42 подвижных задачах у первого (watchdog берёт 2 поиска/тик); CP-4 (UTF-16 vs code points — редкий, но фатальный для конкретного получателя mid-campaign reject).

**Bottleneck не в коде отправки, а в добыче и подтверждении контактов + в дисциплине релизного гейта.**

---

# 2. Current version matrix (замер 30.08, 07:28–07:35 UTC)

| Уровень | Состояние | Evidence |
|---|---|---|
| Repo | HEAD `5845616`, ветка `codex/lead-radar-main-integration-20260827`; 18 коммитов после `0ddce6c` | `git log` |
| Dirty/untracked | `M AGENTS.md`; untracked `HANDOFF.md`, `STATE.md`, `.kimi-code/`, `.serena/`, `.tmp-*`, `graphify-out/`, 2 roadmap-doc | `git status` (пользовательские, не трогать) |
| Pages production | canonical deployment `bee7bf81-…` (06:27:00 UTC), live manifest commit **= `5845616f…`** — расхождение из master-handoff устранено | manifest + CF API |
| Automation Worker | `gptbot-automation`, modified **30.08 06:26:12 UTC** — соответствует финальному коммиту `5845616`; bindings: D1+2 очереди+R2+service+secrets по имени | CF API |
| Gateway Worker | `gptbot-lead-radar-telegram-account`, modified **28.08 13:55 UTC**, version `1.5.1`, origin `…workers.dev` | CF API |
| Bridge | installed 1.5.0 (= source `pyproject` 1.5.0), `paired=true`, `vault_healthy=true`, `task_registered=true`, задача «Выполняется» | `cli status` + `schtasks` |
| D1 | последняя миграция `0055_bunzy…`; все schema-гейты в тестах зелёные; runtime schema check ≤4 prepare (см. §12) | migrations/ + тесты |
| Flags | Pages и Worker согласованы: `CAMPAIGN_ENABLED=true`, `AUTOSEND=true` (по-прежнему требует per-campaign approval), `ACCOUNT_ENABLED=true`, `CONTACT_ENABLED=false` (legacy plane), `TRANSPORT_MODE=local_bridge`, `ADMISSION/PROCESSING=true`, `MAX_DISPATCH_PER_TICK=5`, 30/120; `LEAD_RADAR_JINA_ENABLED` отсутствует (**Jina выключен**); Firecrawl: enabled/fallback, 200/100/14, org allowlist | CF API (значения не-секретных flags) |
| Тесты на HEAD | typecheck:lead-radar 0 ошибок; 348+105+106+98 тестов — все зелёные; **но** полный `tsconfig.functions.json` typecheck красный (см. §22, LR-F-1) | прогон в этой сессии |

Дисциплинарная заметка: при наличии 15+ worktree того же репозитория деплой по-прежнему возможен «сырым» wrangler из чужого дерева — guard есть только у `npm run deploy:pages:production`. Механизма, делающего stale-overwrite **невозможным** (а не маловероятным), в проекте нет.

# 3. Что старые документы получили верно / неверно / устарело

**Master handoff 30.08 (05:47):** верно — архитектура, границы, правила секретов, Bunzy-503, предупреждение о worktree. Устарело к вечеру: «HEAD 0ddce6c не задеплоен», «Worker не содержит 4c01c56», «Jina-capable код не в production» — всё закрыто деплоями 06:26–06:27 UTC.

**Утренний аудит (07:53, HEAD 0ddce6c):** дефект-лист в основном точный (см. §22 переверификацию), но два P1 («production живёт на старых очередях», «Jina/DS-1») уже устранялись его же roadmap'ом в течение дня. Его D1-блank («агрегаты не запрашивались») в этой сессии закрыт (§5).

**Brief 27.08:** главная гипотеза («отправлять некому») подтвердилась и на текущих данных — 7 проверок, 0 свежих; при этом причины уже другие: не «0 извлечений», а «бюджет + TTL + неиспользованный ручной tier».

**Docx-хендофф 26.08 (P1.1–P1.9):** см. §12.

# 4. End-to-end pipeline (как он устроен фактически)

Подтверждено кодом на HEAD (файлы: `functions/platform/lead-radar/`):

```
Поиск (admission ≤2 running) → discovery (OSM/каталоги) → candidate pool (127/поиск, cursor/reserveBatch)
  → enrichment: собственный сайт бесплатно (Tier-0: контактные страницы + sitemap, budget 20)
      + Tier-1 top.uz бесплатно (≤5 листингов, robots fail-closed, identity-экстракция)
      + Firecrawl (fallback: search ≤9 каталогов+t.me, scrape) [бюджет 200/100/14, часто исчерпан]
      + Jina (только рендер уже найденного URL; флаг ВЫКЛ)
  → contact candidates (mobile OR username, ownership: company|unconfirmed|personal…)
  → contact-resolve job (регенерация 30 мин/48 ч, QR-1 fix) → Bridge resolve_contact (MTProto get_entity,
      боты/каналы/группы/удалённые/чужие имена отклоняются; resolve НЕ отправляет и НЕ импортирует)
  → contact_checks (TTL 24 ч, account_digest, proof_digest)
  → recipient directory (verified = bridge_resolved_corporate + fresh + current account)
  → audience (research ≤500) → authorization (contact_basis, reviewer) → campaign prepare
      (server preflight exact-списка) → approval (одноразовый, digest 10 мин) → create (approved)
  → dispatch: attempt CAS (attempt_count 0→1) + account lease CAS (CLAIM_LEASE_MS=180 с ≥ send 125 с)
      + Idempotency-Key=effect_id + random_id → gateway → mailbox DO → Bridge send_text (parse_mode=None,
      link_preview=False) → effect sent/failed/ambiguous; unknown → ambiguous, БЕЗ авто-ретрая
  → maintain() каждые 15 мин: реконсиляция sent/ambiguous-пар (CP-2 fix), завершение кампании
```

Ступени, которые нельзя схлопывать (и код их не схлопывает): found → contact-candidate → ownership → bridge-resolved → fresh+account-matched → authorized → preflighted → sent.

# 5. Real funnel numbers (D1, 07:28–07:30 UTC 30.08 — это текущий production, не fixtures)

| Ступень | Значение | Комментарий |
|---|---|---|
| Поиски всего | 33 | 18 partial, 7 ready, 4 insufficient, 2 failed, **2 running** |
| Компаний | 1010 | с сайтом 109, с телефоном 416, telegram_url 7 (5 — тот самый `stomaservice_bot`, 2 публичных) |
| Enrichment-статус | 4 enriched / **1006 terminal** | terminal = в основном бюджетные остановки |
| Исходы обогащений | **181 бюджетные** (126 budget_or_lease, 42 search_budget, 7 company, 6 domain), 22 no_match, 5 identity, 4 candidates, 3 expired, 2 unknown | бюджет — доминирующая причина |
| Contact checks (всего) | **7** | 5 privacy_or_missing, 1 regular_user_resolved, 1 username_exists_ownership_unconfirmed |
| Свежие (expires_at > now) | **0** | TTL 24 ч; «вчера были — сегодня пропали» воспроизводится измерением |
| Свежих bridge_resolved_corporate | **0** | strict send-ready пуст по определению |
| Evidence Telegram | 55 `web.telegram.unknown` (35 company_data / 25 model_inference) + 5 `web.telegram` | model_inference не может стать корп-фактом (by design) |
| `web.company_binding` | 6, **0 operator_confirmed** | R4-кнопка ни разу не нажата |
| Аккаунты | 1 connected (last_health **28.08 03:17Z**), 12 revoked | `last_health_at` пишется фактически **один раз при pairing** (см. §13) — для liveness бесполезен |
| Кампании / получатели / эффекты | **0 / 0 / 0** | за всю историю ни одной кампании |
| Авторизации / eligibility / company_chats / suppressions | 0 / 0 / 0 / 0 | legacy-плоскость пуста |
| Jobs | enrichment 453 done / **46 dead** (29 source_unavailable, 10 retry_exhausted, 7 company_budget) / 42 queued (все у search_0da32a…) / 6 retry_wait; discovery 40 done / 1 dead | 29×source_unavailable — эпоха до лестницы backoff |
| Firecrawl ledger | 28.08: 200 credits (потолок); 29.08: 116; 30.08: 27; всего completed 301, unknown 40, failed 12 | unknown не обнуляется в бюджет — корректно |
| Пулы двух running-поисков | 0da32a: cursor 60/127, обновлён **07:30 UTC** (живой); 90df2aa: cursor 10/127, замер с **29.08 16:15** (stalled) | watchdog-кандидат |

Декомпозиция «где теряем компании» (по классам из брифа): A/B (не найден/потерян при экстракции) — 22 no_match + узкие запросы; **C/D — доминирует не потеря, а недобор из-за бюджета** (181); E (ownership) — 55 unknown-эвиденсов без operator-подтверждения; F/G — боты отсечены (5 bot-suffix в telegram_url не проходят); H — Bridge resolve исправен; I/J — TTL 24 ч обнуляет всё, что проверено; авторизаций 0.

# 6. Company discovery quality

- Intent/scoring/OSM-маппинг без регрессий в тестах; `verified_count` в поиске = identity-verified (поиск подтвердил имя/город), НЕ Telegram-verified. Это честно внутри, но оператору легко прочитать неверно (см. §18).
- Дедуп по `canonical_key` работает: 1010 компаний при 947+329+… сырых кандидатах; suppressed-дубли считаются в excluded. Позитив.
- Качество базы: `closed` 0, suppressed 0; бот-суффиксы в telegram_url отсекаются на eligibility, а не в базе (5 строк `stomaservice_bot` остаются историческим мусором в поле `telegram_url` — не send-ready).

# 7. Identity / dedup audit

- `canonical_key` + `name_city_key` + `phone_digits` + `domain` — разные ключи; false-merge замечен не был; `deadJobs>0 → partial` не даёт выдавать оборванный поиск за готовый (QR-8 partial fix).
- Ownership-модель строгая: `model_inference` не становится корп-фактом; generic-name stoplist отклоняет несвязанные сайты (_fixture-гоча «dent/klinika» зафиксирована в STATE).
- Позитив (переверифицировано): каталог→contact-key→UI использует один парсер (`recipientContactChoices`); strict verified считается одинаково в каталоге и в кампании.

# 8. Contact discovery audit

- Tier-0 (собственный сайт, бесплатно): контактные страницы ×4 + sitemap-fallback, bounded 512 КБ, robots-checked; 4 enriched-компании — результат этой ветки.
- Tier-1 top.uz (бесплатно, новое 30.08): 1 страница поиска + ≤5 листингов, robots fail-closed (`robotsFor` catch → запрет), safePublicHttpUrl на каждом URL, identity-экстракция та же; top.uz-спецкейс требует name/slug-совпадение + отсутствие конфликта телефона + один `#contacts`-блок + h1-совпадение; slug-only match даёт `unconfirmed` (ручной tier), не корп-факт. Позитив.
  - Мелочи: (a) при Firecrawl `mode=shadow` top.uz пропускается зря (`contact-source-worker.ts:103`); (b) на top.uz нет per-host throttle (объём мизерный, но неограниченный в принципе); (c) revive/watchdog-UPDATE не обёрнут индивидуальным try/catch в цикле (один сбойный поиск прерывает остальных на тик).
- Firecrawl: бюджет-модель корректна (reserved/completed/failed/unknown; unknown не считается бесплатным). Проблема не в коде, а в потолке 200/день при 1000+ компаний — см. §24.
- `tel:` с запятой по-прежнему отбрасывается целиком (DS-4, fail-closed by design); компенсируется текстовым извлечением.

# 9. Firecrawl / Jina / local crawler

- Firecrawl: включён, fallback, ключ в automation Worker (не в Pages — корректно). Лимиты — внутренние (200/100/14, company cap 7). За 30.08 израсходовано 27 — бюджет не исчерпан, но 42 queued-задачи стоят именно с `search_budget_exhausted` с 28.08 и разойдутся по лестнице backoff/пульсу.
- Jina: код в production (HEAD), но `LEAD_RADAR_JINA_ENABLED` отсутствует в конфиге — **выключен**. Даже при включении он только рендерит URL, найденные Firecrawl/top.uz; discovery им не заменяется. Писать «Jina работает бесплатно» нельзя.
- Scrapling/Crawl4AI: benchmark-venv'ы существуют, production-runner нет (JS-fixture не пройден исторически). В pipeline не интегрированы. R2-адаптер остаётся roadmap'ом.

# 10. Queue audit (текущее состояние, переверификация утренних находок)

| ID | Статус на HEAD | Evidence |
|---|---|---|
| QR-1 | **Частично** | Регенерация 30 мин/48 ч работает (`queue.ts:281-287,573-587`, `store.ts:1491-1510`); НО dead-строки `contact-resolve:*` не возрождаются для того же поиска: `ensureContactResolutionJob` `ON CONFLICT DO NOTHING` (`store.ts:453-461`), revival покрывает только `contact-pool:%` (`store.ts:2044-2050`, `queue.ts:874-881`). В D1 — 7 мёртвых contact-resolve. Комментарии `queue.ts:582-584` обещают несуществующее |
| QR-2 | Fixed + deployed | `blockingActiveJobs` `store.ts:1999-2001`; negative lookahead `store.ts:2015` |
| QR-3 | Fixed + deployed | лестница 15м/1ч/4ч `queue.ts:273-274` |
| QR-4 | **Open** | reserveBatch двигает курсор до fanout (`contact-discovery-store.ts:94-100`); retry того же job'а смягчает, dead-letter родителя теряет окно |
| QR-5 | Fixed | recovery 10 (`queue.ts:831`), dedup refresh ≤2 |
| QR-6 | Fixed | clamp 900 с (`automation-worker.ts:304`) |
| QR-7 | Fixed (2/3) | deadLetterDiscoveryChildren не убивает running; revive exact-ключа; **DLQ-копия при неудаче send всё же теряется** (`automation-worker.ts:691-705` — catch-ack); плюс у DLQ `gptbot-automation-dlq` нет консьюмера вообще — конверты копятся без мониторинга |
| QR-8 | Partial | candidate-mode ready всё ещё по количеству (`store.ts:2061`); contact-mode честный (resolvedGoalCount) |
| QR-9 | Partial | см. QR-7(c) — DLQ |
| QR-10 | **Open** | failInterruptedSearches не вызывается из cron (только service.run/get) |
| QR-11 | Open (documented) | at-least-once double-spend Firecrawl задекларирован (`queue.ts:719-721`) |
| QR-12 | Fixed (bounded) | parked-job не блокирует replenish; поиск worst-case ~48 ч, не вечно |
| Watchdog | Работает, но **liveness не ограничена** | 2 поиска/тик, revive contact-pool, schema-resilient; бюджет внутри Free-потолка. НО: revive dead `contact-pool:%` без счётчика неудач (`queue.ts:874-882`, `store.ts:2044-2052`) — поиск с детерминированно падающим discovery крутится dead→revive→dead каждый тик вечно, и, т.к. листинг `ORDER BY created_at LIMIT 2` (`store.ts:1638`), старейший «вечный» поиск занимает слот watchdog и морит голодом новые running-поиски `[RT]` |

Факт из D1: 46 dead enrichment (29 source_unavailable — до лестницы backoff; новые уже не должны так умирать), 42 queued у одного поиска — очередь живая, но перекошена.

# 11. D1 audit

- Схема: до `0055`; 5 schema-гейтов в тестах зелёные; ledger-конфликт 0036 закрыт исторически.
- **P1.1 (26.08) закрыт**: `hasRuntimeTelegramCampaignSchema` = compact fingerprint + bounded quick_check/foreign_key_check ≤4 prepare (`telegram-campaign-schema.ts:371-426`); worst-case бюджет охраняется тестом `FREE_D1_QUERIES_PER_INVOCATION=50` (`tests/lead-radar-d1-budget.test.ts`).
- Wide quick_check не используется; журнал/история не тронуты; агрегаты снимались только SELECT-ами count/группировка.

# 12. Old P1 regression matrix (docx 26.08 → сегодня)

| Старый P1 | Статус | Evidence |
|---|---|---|
| P1.1 D1 runtime schema budget | **FIXED** | compact check ≤4 prepare + budget-тесты (§11) |
| P1.2 DO alarm/cleanup starvation | **FIXED** | alarm-monotonicity `getAlarm()` (`bridge-mailbox.ts:343-344`); cleanup с курсорами startAfter + лимиты 128/256; terminal payload retention 24 ч; nonce TTL 5 мин; effect-ответы удаляются, tombstone остаётся (replay-защита) (`bridge-mailbox.ts:2554-2672`) |
| P1.3 PowerShell module path | **FIXED** | абсолютный System32 powershell + PSModulePath wrapper (`security.py:49-69`) |
| P1.4 Installer reproducibility | **Operational fixed** | установлен 1.5.0 (= source), self-test/pip-check исторически; wheel/lock-воспроизводимость сегодня не перепроверялась |
| P1.5 Gateway public route | **Partial** | workers.dev работает (HMAC 401 на unsigned); кастом-домен `lead-radar-bridge.gptbot.uz` по-прежнему не обслуживается (`PUBLIC_ORIGIN=workers.dev`) — осознанный отложенный switch |
| P1.6 Migrations 0047/0048 | **Closed** | давно применены; сейчас ledger до 0055, гейты зелёные |
| P1.7 Dirty tree / reproducible release | **Process guarded** | guarded deploy + stamped manifest + artifact hashes; dirty-файлы — пользовательские; scanner видит intended artifacts (release-gate тесты зелёные) |
| P1.8 Release gate completeness | **REGRESSED (новое)** | фильтры workflow теперь полные (вкл. `scripts/d1/**`, `src/shared/lead-radar-telegram-bridge.ts`), НО сам гейт **красный**: `functions_typecheck_no_waivers` (§22 LR-F-1) |
| P1.9 README/runtime boundary | **FIXED** | workflow-фильтры покрывают весь gateway-каталог; legacy container не в production-пути |

# 13. Bridge audit

- **Статус:** installed 1.5.0 = source; paired; vault healthy; задача Running; uri-handler зарегистрирован.
- **resolve_contact не отправляет и не импортирует контакты** — подтверждено: DO требует connected-аккаунт+online device+bridge ≥1.4, ставит command `resolve_contact` TTL 120 с; adapter использует только `get_entity` со строгими проверками (bot/deleted/username mismatch/lrpeer-binding → `PeerNotRegularUserError`); send — отдельный `send_text` (parse_mode=None, link_preview=False, valid_text 4096). Позитив.
- **Семантика last_health_at (исправлено по результатам red-team):** поле пишется только `completeAccountConnection` (finalize pairing, `telegram-campaign-store.ts:542`) и `updateAccountStatus` при `healthy=true` (`:684`) — но **ни один вызывающий не передаёт `healthy=true`** (все три вызова в control.ts и error-путь worker'а передают `healthy=false`); UI GET-роут наличие DO-роута проверяет, но не персистит; cron не пишет; у gateway Worker вообще нет D1-binding. Итог: `last_health_at` в deployed-коде **write-once при pairing** — значение 28.08 03:17Z это дата привязки, а не последнего контакта. Вывод аудита «stale health ≠ offline Bridge» верен и усилен: колонка бесполезна для liveness, живость Bridge надо проверять через gateway `/v1/bridge` status. Живой heartbeat владельца в этой сессии не проверялся (запрещено трогать сессию/vault).
- Pairing/auth: TTL pairing 15 мин, auth 10 мин; OTP/2FA пути в DO; известные UX-проблемы handoff §14 в текущем коде низкоуровнево не воспроизводились (вне read-only scope), browser-fixtures исторически зелёные.
- Windows-специфика: P1.3 закрыт; single-instance/URI-handler зарегистрированы.

# 14. Telegram resolution audit

- resolve→check→store: TTL 24 ч (`contact-resolution.ts:102,112`), account_digest+proof_digest привязки; `regular_user_resolved`/`username_exists_ownership_unconfirmed` — честные не-корпоративные исходы.
- **TG-1 подтверждён измерением:** 0 свежих проверок при 7 исторических. Auto-recheck/preview перед prepare нет — только ручное «Проверить и оставить подтверждённые».
- TG-2 (proof-дайджест может меняться при ре-обогащении) — механизм по-прежнему правдоподобен, частота на живых данных не измерена.
- lrpeer: binding TTL, account-bound, id-match; raw peer id не покидает Bridge. Позитив.

# 15. Recipient eligibility audit

- Strict set = `bridge_resolved_corporate` + fresh + current account + peer/username валиден; исключения (стационарные, боты/каналы/группы, личные, stale, DNC, source-only) — в коде; dispatch-time recheck `eligibility_expires_at` (`telegram-campaign.ts:2161-2162`) закрывает «протух между prepare и send».
- «Добавить все» не превращает мусор в send-ready: research-выбор ≠ verified (сервер пересчитывает).
- Max 50/campaign; audiences ≤500 research; сохранение/восстановление — в тестах.
- R4 (ownership-confirmation): фильтры не дают переклассифицировать bot/channel/group/personal (только `web.telegram.business` на same-origin при `source_type=company_website`); org-scoped; idempotent (мелкая гонка check-then-insert без unique index — P3). **Не использован ни разу (0 operator_confirmed).**

# 16. Campaign audit

- **CP-1 fixed** (lease 180 c ≥ 125 c бюджет + запас; `telegram-campaign.ts:46-49`).
- **CP-2 fixed**: maintain() реконсиляция 4 пар, включая sent/ambiguous с message_id (`telegram-campaign-store.ts:3686-3746`); вызов из cron каждые 15 мин (`automation-worker.ts:505-508`).
- **Открытые:** CP-3 (template не переживает reload; черновик не персистится), CP-4 (см. §22; тот же code-points-подсчёт и в `telegram-business.ts:1349` для draft-link), CP-5 (prepare при pending/expired media даёт вводящий в заблуждение `telegram_campaign_media_not_found`), CP-6 (мелочь: dead `draft`, dead validator, preflight-limits перезапись последним батчем, recover LIMIT 1/тик — медленный слив backlog'а, >256 message_id → ambiguous fail-closed).
- **Новое (нашлось при верификации CP-2):** maintain() чинит sent/ambiguous-пару, но **не снимает `pause_reason='ambiguous_delivery'`** — кампания остаётся на паузе до ручного resume (P2, UX/operational).
- `[RT]` **Ambiguous никогда не сверяется с effect-ledger gateway:** DO хранит replayable definitive-ответ, но ничто не реконсилирует ambiguous-строки против него — доставленное, но записанное как ambiguous сообщение остаётся ambiguous до ручного вмешательства (см. LR-F-22). Safety не нарушена (ретрая нет), это accounting/UX.
- Exactly-once (см. §17) — цел.

# 17. Exactly-once audit

Построить дублирующий provider-call на HEAD не удалось ни по одной из траекторий: attempt CAS `attempt_count=0→1` с claim_digest (`store.ts:2637-2646`); account lease CAS + rollback при частичном сбое (`store.ts:1984-2056`); Idempotency-Key=effect_id + random_id в gateway; unknown → `ambiguous` без ретрая (`telegram-campaign.ts:2392-2394`, `account-service.ts:1368-1370`); `markRecipientSent` требует `dispatching`+claim_digest; DO-эффекты хранят tombstone навсегда, response-шифротекст 24 ч. At-least-once остаётся задекларированным для платных Firecrawl-вызовов (QR-11) — деньги, не сообщения.

# 18. UI truthfulness audit

- Инвариант «N найдено ≠ N можно отправить» соблюдён: каталог разделяет review/conflict/verified; strict-фильтры серверные; excluded-причины показываются; диагностика readiness/preflight — серверные.
- Риск неверного прочтения: `verified_count` в карточке поиска = identity-verified, не Telegram-verified; `company_telegram_count=1` в D1 легко прочитать как «1 готовый получатель». Рекомендация: переименовать/подписать (см. roadmap).
- Composer: текст редактируем при offline-сервере; polling не перетирает; но reload теряет текст (CP-3).

# 19. Observability

- Причины исключений/терминальные коды есть почти везде (reason-code taxonomy). Дыры: (1) server-side health аккаунта не обновляется без UI/dispatch (§13); (2) DLQ-копия при неудаче send теряется (§10 QR-7c); (3) QR-10 — interrupted-поиск не финализируется без открытой вкладки; (4) «K of ~19»/busy-прогресс — известные UI-фоллоу-апы из STATE.
- PII-логирование: причина-коды, а не сырые номера; redaction/capabilities/TTL 30 дней — в коде; нарушений не найдено.

# 20. Release / deployment safety

- Guarded deploy (stamped manifest + source/build/prod-проверка + shared lock) — работает: три деплоя сегодня с верификацией.
- **Но:** полный release gate красный (§22 LR-F-1), а `deploy:pages:production` гейт не гоняет — гейт и деплой разошлись по статусу. Плюс raw-wrangler обход остаётся (процессное ограничение).
- Gateway/Bridge не пересобирались с 28.08 — согласовано с их релизными циклами; версии (1.5.1/1.5.0) зафиксированы.

# 21. Test coverage

- Свежий прогон этой сессии: `typecheck:lead-radar` — 0 ошибок; 348 + 105 + 106 + 98 — все зелёные (включая d1-budget, queue-reliability, free-catalog-discovery, ownership-confirmation, e2e hot-lead, release-manifest/gate-тесты).
- e2e hot-lead: реальная цепочка admission→pool→enrichment→Bridge-resolve→directory→audience→authorize→prepare/approve→start→dispatch с **ровно одной** отправкой и no-dup на redelivery, maintain settlement. Stub'ы: discovery/enrich/sender/Bridge-граница; HTTP-слой не покрыт.
- **Не покрыто тестами:** полный `tsconfig.functions.json` typecheck в npm-сюитах (этим и объясняется красный гейт при зелёных сюитах); stress >256 записей DO-cleanup; Windows-специфика installer при upgrade; browser-полиграфия pairing.

# 22. Defect register P0–P3 (текущее состояние HEAD + production)

**P0 — нет.** Ничего, что позволяет неправильную/дублированную отправку, потерю данных или утечку секретов, не найдено.

| ID | Sev | Area | Суть | Root cause | Evidence | Влияние | Fix | Тест |
|---|---|---|---|---|---|---|---|---|
| LR-F-1 | **P1** | Release | Release gate красный на HEAD: `functions_typecheck_no_waivers` | (a) `functions/platform/lead-radar/search-pulse.ts:3` — `import type { LeadRadarQueueSender } from './queue'`, но тип экспортирован из `./types` (`types.ts:111`), а `queue.ts` его только импортирует; (b) `functions/platform/bunzy/security.ts:27` TS2769 — декларированный возврат `Uint8Array \| null` (`security.ts:3`) под TS 5.7 расширяется до `ArrayBufferLike`; рантайм корректен (массив ArrayBuffer-бэд) | воспроизведено: `npx tsc -p tsconfig.functions.json --noEmit` → ровно 2 ошибки; report `reports/lead-radar-release-gate.json` (05:51, status=red) `[RT]` | Guarded-деплой не гоняет гейт → production может уходить вперёд красного гейта; повтор класса инцидента 26.08 | (a) импорт из `'./types'` (1 строка); (b) аннотация `Uint8Array<ArrayBuffer> \| null` в security.ts | включить functions-typecheck в npm-сюиту, чтобы гейт и сюиты не расходились |
| LR-F-2 | P2 | Queue | Мёртвые `contact-resolve:` job'ы блокируют пересоздание в том же поиске | `ON CONFLICT DO NOTHING` + revival только для `contact-pool:%`; комментарии обещают регенерацию, которой не будет (enrichment job одной попытки уже completed) | `store.ts:453-461,2044-2050`; `queue.ts:874-881`; D1: 7 dead contact-resolve | Молчаливая потеря компаний в 2 поисках | добавить `contact-resolve:%` в revival (гвардить terminal-причины) | регресс-тест «dead contact-resolve → revival → queued» |
| LR-F-3 | P2 | Campaign | После CP-2-реконсиляции кампания остаётся на паузе `ambiguous_delivery` | maintain() чинит пару и пересчитывает, но не снимает pause_reason/не авторезюмит | `telegram-campaign-store.ts:3686-3746,3825-3880` | Оператор обязан вручную ресамить после каждого отремонтированного ambiguous | снимать pause_reason при успешной реконсиляции (или явный owner-контроль resume) | тест «repair → auto-resume» |
| LR-F-4 | P2 | Campaign | CP-4: лимит 4096 в code points, Telegram считает UTF-16 | `[...value].length` в валидации и UI | `telegram-campaign.ts:42-44,367-368`; panel:1325 | emoji-тяжёлый текст проходит локально → терминальный provider_rejected mid-campaign | считать UTF-16 `.length` (template и caption) | фикс-тест на астральные эмодзи |
| LR-F-5 | P2 | Contacts | TG-1: TTL 24 ч без авто-перепроверки | expires_at жёсткий; проверок всего 7, свежих 0 | `contact-resolution.ts:102,112`; D1 §5 | verified-набор ежедневно пустеет; оператор не понимает, почему | batch re-check истекающих перед prepare + подпись TTL в UI | тест на re-check флоу |
| LR-F-6 | P2 | Discovery | DS-5: free-путь не резолвит отсутствующие сайты | resolveMissingWebsites только в Firecrawl-ветке (`firecrawl-enrichment.ts:119-125`) | company без сайта → terminal no_website навсегда | Часть воронки недостижима без платного бюджета | бесплатный website-discovery (OSM website-поле, top.uz-карточка) | тест на no_website→resolved |
| LR-F-7 | P2 | Queue | QR-4: потеря окна кандидатов при dead-letter родителя | reserveBatch до fanout, unreserve нет | `contact-discovery-store.ts:94-100` | До ~10 кандидатов на инцидент | unreserve/reorder | тест «fanout fail → window не потерян» |
| LR-F-8 | P2 | UX/Data | CP-3: template теряется при reload | не персистится (sessionStorage только для media) | panel:705; campaign-media-draft.ts | Владельцу приходится переписывать текст | localStorage draft + очистка при смене выдачи | ui-тест reload |
| LR-F-9 | P2 | Directory | TG-3: hard 422 на 5000 компаний/200 фильтров | LIMIT 5001 + potential>200 без пагинации глубже | `recipient-directory.ts:40-41`; `audiences.ts:145` | При росте базы выбор/фильтры ломаются | server-side pagination/индексы | нагрузочный тест |
| LR-F-10 | P3 | Queue | QR-8: candidate-mode ready без метрики качества | ready=rows≥desired | `store.ts:2061` | «Готово» при нулевом контактном потенциале | funnel-метка как в contact-mode | тест |
| LR-F-11 | P3 | Queue | QR-10: interrupted-поиск финализируется только UI-поллингом | failInterruptedSearches вне cron | service.ts:193,299 | Зависшие failed-статусы без вкладки | вызов из cron | тест |
| LR-F-12 | P3 | Worker | DLQ-копия теряется при неудаче send в DLQ | catch-ack после throw | `automation-worker.ts:691-705` vs `queue.ts:730-732` | Потеря наблюдаемости (работа остаётся в D1) | не ack при неудаче DLQ.send | тест |
| LR-F-13 | P3 | Ownership | Гонка check-then-insert в confirm-ownership | нет unique index | `ownership-confirmation.ts:58-80` | Возможен дубль operator_confirmed | unique index / ON CONFLICT | тест |
| LR-F-14 | P3 | Worker | Watchdog: revive-UPDATE без индивидуального try/catch | один сбой прерывает остальных на тик | `queue.ts:874-881` | Задержка оживления | try/catch в цикле | тест |
| LR-F-15 | P3 | Discovery | Tier-1 пропускается в shadow-режиме | `config?.mode!=='shadow'` | `contact-source-worker.ts:103` | shadow-tenant теряет бесплатный путь | убрать условие | тест |
| LR-F-16 | P3 | Observability | `last_health_at` бесполезен для liveness: write-once при pairing | UI-роут не персистит health; все `updateAccountStatus` вызовы передают `healthy=false`; cron не пишет; у gateway нет D1-binding `[RT]` | `telegram-campaign-store.ts:542,684`; control.ts:935/1139/1202 | «Bridge онлайн?» нельзя ответить из D1 | cron-проба gateway `/v1/bridge` status с персистом через service bearer ИЛИ убрать колонку из UI-карточки | тест |
| LR-F-17 | P3 | Misc | CP-5/CP-6: misleading media error; dead `draft`/validator; preflight-limits перезапись; recover LIMIT 1; >256 message_id → ambiguous; fallback-маппинг verifiedCount→processed/enriched в карточке поиска | исторические мелочи | §16; LeadRadar.tsx:608-611 `[RT]` | UX/операционные мелочи | пакетная зачистка | точечные тесты |
| LR-F-20 | P2 | Queue | Watchdog-голодание: вечный dead→revive цикл поиска с детерминированно падающим discovery; oldest-first LIMIT 2 занимает слоты и морит новые поиски; + расход dispatch-слота каждый тик | revive без счётчика неудач, попытка сбрасывается в 0 | `queue.ts:874-882`; `store.ts:2044-2052,1638` `[RT]` | Stalled-поиски_new не получают оживление; лишняя нагрузка | failure-counter/кап на revive на поиск + terminal после N | регресс-тест вечного цикла |
| LR-F-21 | P3 | Ownership | R4 повышает `web.telegram.unknown`-эвиденс до business при подтверждении оператора | фильтр отсекает только human/bot/channel/group, но `unknown` проходит; промоушен без re-fetch сайта | `ownership-confirmation.ts:52-65`; sources.ts:607 `[RT]` | Неверно классифицированная личная ссылка может стать «business» после ручного клика; send-гейты при этом остаются целы | требовать classification≠unknown для промоушена ИЛИ re-fetch + перегнать классификатор | тест на unknown-промоушен |
| LR-F-22 | P3 | Campaign | Delivered-but-ambiguous никогда не сверяется с effect-ledger gateway | ledger replay есть в DO, но не консультируется при реконсиляции | idempotency.ts:20-40; store:3434-3468 `[RT]` | Кампания висит на паузе до оператора; счётчик sent занижен | при maintain() запросить effect по effect_key для ambiguous | тест |
| LR-F-18 | P3 | Security | Остаточный DNS-rebinding строкой hostname (до будущего локального crawler) | нет DNS-pin в JS-пути | `validation.ts:80-123` | Риск ограничен (Workers egress), критично для будущего Scrapling-runner | DNS-пин при локальном runner | — |
| LR-F-19 | P3 | Known | Кастом-домен Bridge не переключён; Jina выключен; QR-11 at-least-once платных вызовов; TG-2 proof-дайджест; DS-4 tel:-запятая; «verified_count»-нейминг | известные осознанные | §9,13,14,18 | Документированные ограничения | решения по мере необходимости | — |

# 23. Current bottleneck

**Воронка контактов**: бюджет (181 блокировка) + TTL 24 ч (0 свежих) + неиспользуемый R4 + «42 queued у одного поиска при замерзшем втором». Код отправки готов; строгая воронка честно пуста. Второй по важности bottleneck — процесс: красный гейт при рабочем guarded-деплое.

# 24. Roadmap по зависимостям (обновлённая последовательность)

- **PHASE G · Gate hygiene (S, без owner-input):** LR-F-1(a) импорт из `'./types'`; (b) bunzy typing-фикс; перегнать release gate на чистом checkout до зелёного отчёта; включить functions-typecheck в регулярную npm-сюиту, чтобы сюиты и гейт не расходились. Критерий: `reports/lead-radar-release-gate.json` status=green на HEAD.
- **PHASE 1 · Queue drain & revival (M):** LR-F-2 (revive `contact-resolve:%` с terminal-гвардом), LR-F-20 (failure-counter/кап revive + terminal после N), LR-F-7, LR-F-10, LR-F-11, LR-F-14; прогнать queue-сюиты + d1-budget; деплой automation Worker guarded-командой. Критерий: dead enrichment не растёт; stalled-поиск 90df2aa возобновляется (или честно финализируется).
- **PHASE 2 · Yield (M/L, часть — owner):** (a) владелец использует R4-подтверждение на 5–10 кандидатах из top.uz/собственных сайтов → появление первых свежих verified; (b) LR-F-5 авто-перепроверка истекающих перед prepare; (c) LR-F-6 бесплатный website-discovery; (d) решение по бюджету Firecrawl (увеличить 200/день — платное, owner) ИЛИ добавить Tier-1 адаптеры по другим каталогам (нужен один bounded live-проба на каталог — owner-OK).
- **PHASE 3 · Campaign polish (M):** LR-F-3 (auto-resume после ремонта), LR-F-22 (реконсиляция ambiguous против effect-ledger), LR-F-4 (UTF-16), LR-F-8 (draft persist), LR-F-17. Критерий: mocked e2e с emoji-текстом и reload проходит.
- **PHASE 4 · Acceptance canary (owner-gated):** 1 согласованный получатель → точный текст/медиа → replay без дубля → 3 → 10 → 30/день, ≥120 с. Только после отдельного разрешения владельца.
- **PHASE 5 · Hardening (L, параллельно):** LR-F-9 пагинация каталога; LR-F-16 cron-проба gateway-status; LR-F-12/13/15/21; F6 (инкрементальный refreshSearchFunnel на росте); Scrapling-runner с SSRF/DNS-пином (отдельная линия).

# 25. Definition of Done («100%»)

Система не включает непроверенное в strict send-ready и end-to-end воспроизводим. Текущее состояние по чек-листу брифа:

- [x] Строгая eligibility и тройная перепроверка (код+тесты) · [x] Exactly-once цепочка (CAS/idempotency/ambiguous) · [x] Preflight сервером, approval-digest · [x] Media async/idempotent · [x] Unknown → ambiguous, не ретрай · [x] robots/SSRF/redirect-политики (включая новые Tier-0/1) · [x] Bridge resolve ≠ send · [x] DNC/suppression гейты · [x] e2e hot-lead тест
- [ ] Свежие verified-контакты существуют и переживают день (LR-F-5) — **нет, 0 свежих**
- [ ] Первая контролируемая live-отправка (canary) — **нет, owner-gated**
- [ ] Release gate зелёный на HEAD (LR-F-1) — **нет, красный**
- [ ] R4-операторский путь реально использован — **нет, 0 подтверждений**
- [ ] UI-нейминг «verified_count» не вводит в заблуждение — частично
- [ ] Пагинация каталога при росте базы — нет

# 26. Owner-only actions

1. Разрешить и определить **одного тестового получателя + текст** для canary (PHASE 4). Без этого «первая проверенная рассылка» невозможна по определению.
2. Решение по **Firecrawl-бюджету** (увеличение — платное) или по расширению бесплатных каталогов (нужно разрешение на 1 bounded live-пробу на каталог).
3. Использовать кнопку **R4-подтверждения** на проверенных вручную источниках — без оператора воронка не закрынет DS-2.
4. Решения по отложенным пунктам: переключение `lead-radar-bridge.gptbot.uz`, включение Jina (проверив актуальные условия), полное удаление dormant Bunzy-кода, Scrapling-runner.
5. Подписка Bunzy по-прежнему не отменена (код dormant, endpoint 503 — ожидаемо).

# 27. What NOT to touch

`vault.dpapi`, `bridge-ledger.sqlite3` (+WAL/SHM), Telegram-сессии, финансовые/credit-леджеры, D1-история и миграционный ledger, dirty `AGENTS.md` и untracked-файлы пользователя, чужие worktree, dormant Bunzy-код/таблицы, значения секретов (в документах только имена), production flags — без отдельной задачи.

# 28. Red-team findings

Отдельный red-team субагент атаковал черновик аудита по 10 векторам (typecheck, QR-1, CP-4, TG-1, health-семантика, альтернативные причины yield, exactly-once траектории, watchdog-петли, R4-байпасы, пропуски). Итог:

**Подтверждено аудит-заявление:**
1. Release gate red — ровно 2 ошибки на HEAD; фикс импорта из `./types` корректен (`types.ts:111`); корень bunzy-ошибки — `Uint8Array<ArrayBufferLike>` под TS 5.7, рантайм цел.
2. QR-1-остаток — пути оживления dead `contact-resolve:*` внутри того же поиска не существует (`DELETE FROM lead_radar_jobs` вообще отсутствует в коде/миграциях); комментарий `queue.ts:582-584` ложен.
3. CP-4 подтверждён в коде (включая `telegram-business.ts:1349`); поведение Telegram (UTF-16) внешне не верифицировалось — UNVERIFIED.
4. TG-1 подтверждён; путь «протухший check → отправка» не построен: dispatch-gate + `verifiedResolvedCorporateCompanies` требуют `expires_at > now` + current account digest. Нюанс: first-party evidence на сайте компании авторизует отправку с evidence до ~30 дней — ограниченное окно staleness на независимом первом источнике; вывод «UX/yield, не safety» устоял.
7. Exactly-once подтверждён: дуаль-гонки recovery/markRecipientSent сходятся к ровно одному терминальному состоянию (оба CAS на `dispatching`+claim_digest); crash-окна дают либо чистое освобождение, либо ambiguous.

**Опровергнуто/уточнено в черновике (инкорпорировано):**
5. `last_health_at` — не «sync при UI/dispatch», а **write-once при pairing** (ни один вызывающий не передаёт `healthy=true`; UI не персистит; у gateway нет D1-binding). Вывод аудита устоял и усилен (LR-F-16).
6. Причины yield дополнены: research-only режим (`CONTACT_ENABLED=false` → стриппинг human/decision-maker контактов), strict own-site same-origin фильтр корп-кандидатов, 48h-жизнь contact-resolve job в связке с QR-1. Кап 200 checks/день — не фактор (всего 7).
8. Watchdog: resurrection/admission безопасны, но «bounded» — нет: вечный dead→revive цикл + starvation старейшим поиском (LR-F-20).
9. R4: фильтры верны, но `web.telegram.unknown` проходит фильтр и повышается до business по клику оператора без re-fetch (LR-F-21); send-гейты при этом остаются целы.

**Дополнительные находки red-team:** F4 — fallback-маппинг `verifiedCount→processedCount/enrichedCount` в карточке поиска (LeadRadar.tsx:608-611) смешивает метрики (лейбл «Подтверждено фактами» при этом честен); F5 — DLQ без консьюмера; F6 — `refreshSearchFunnel` полно-сканит ~1k строк на каждый completion/pulse/watchdog-тик — на текущем масштабе терпимо, на росте станет D1-фактором; F7 — Tier-1 top.uz скрапер и логи worker'а чистые (bounded, robots, без PII).

**Ограничения red-team:** D1-цифры, deployed-версии и поведение Telegram изнутри субагента не проверялись (read-only per-инструкции) — они верифицированы основной сессией (§2, §5).

# 29. SINGLE NEXT ENGINEERING PHASE

**PHASE G: вернуть release gate в зелёный на HEAD.** Два точечных исправления — `functions/platform/lead-radar/search-pulse.ts:3` импортировать `LeadRadarQueueSender` из `'./types'` вместо `'./queue'`; typing-фикс в `functions/platform/bunzy/security.ts:27`; затем `npm run release:lead-radar` (или минимальный набор чеков гейта) на чистом состоянии до зелёного отчёта. Без зелёного гейта любые следующие деплои (PHASE 1 и далее) воспроизводят главный исторический риск проекта — расхождение «код ↔ production», уже однажды уничтожавшее UI Lead Radar.

---
*Аудит подготовлен read-only сессией 30.08.2026 (вечер). Все D1-цифры — агрегаты без персональных данных; секреты не печатались; production не изменялся.*
