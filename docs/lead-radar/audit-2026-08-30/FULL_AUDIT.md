# Lead Radar — полный аудит (2026-08-30)

Версия кода: HEAD `0ddce6c` (ветка `codex/lead-radar-main-integration-20260827`). Production-версии — см. PIPELINE_MAP.md §0.
Формат карточки: ID / Severity / Симптом / Причина / Файлы / Evidence / Влияние / Исправление / Regression-тест / Уверенность.

Шкала уверенности: **подтверждено кодом** (статический анализ, воспроизводимый путь), **вероятно** (механизм доказан, runtime-проявление не воспроизводилось), **не проверено**.
Метрики и D1-агрегаты production не запрашивались (нет авторизованной сессии) — это ограничение аудита, а не доказательство отсутствия проблемы.

---

## A. Очереди и фоновые процессы

### QR-1 · P1 · Contact-resolution job после dead letter не может быть пересоздан — молчаливая потеря компаний
- **Симптом**: часть компаний навсегда исчезает из воронки контактов без видимой ошибки; поиск завершается `partial`/`sources_exhausted` при живой компании.
- **Причина**: `ensureContactResolutionJob` создаёт job с idempotency-ключом `contact-resolve:{searchId}:{companyId}` через `ON CONFLICT ... DO NOTHING` (store.ts:450-461). `deadLetterJob` ключ не чистит (store.ts:1470-1486), а fanout пропускает компании в `enrichment_status='terminal'` (store.ts:995). Комментарий queue.ts:562-563 («a later enrichment cycle re-creates...») опирается на ложную предпосылку.
- **Триггеры dead letter**: любой catch в contact-check ветке трактуется как `pending` с окном 30 мин (queue.ts:547-552) — включая `waiting_for_account` (Telegram-аккаунт отключён >30 мин), `contact_checker_unavailable`, per-company budget.
- **Expected**: terminal company contact-check возобновляется (новая generation).
- **Actual**: строка dead_letter с этим ключом живёт вечно → повторное создание невозможно.
- **Исправление**: при dead-letter contact-resolution job либо удалять/пере-ключать строку с generation-суффиксом, либо `ensureContactResolutionJob` переписывать на `ON CONFLICT DO UPDATE` при `status='dead_letter' AND reason NOT terminal`. Новая миграция не нужна.
- **Regression**: тест «dead-lettered contact-resolve job → следующее завершение enrichment пересоздаёт job».
- **Уверенность**: подтверждено кодом. Присутствует и в production (~a044cf0), и в HEAD.

### QR-2 · P1 · Production: пул кандидатов заморожен за budget-parked job'ами (фикс существует только локально)
- **Симптом**: поиск висит `running` часами без прогресса; slot «≤2 running поиска» занят; «ищем» без движения.
- **Причина**: в деплоенной версии любой `retry_wait` enrichment-job с бюджетной причиной (`contact_sources_daily_budget_exhausted` и др.) попадает в `activeJobs`, а условие replenish/resume — `activeJobs.length === 0` → блок пропускается, пока job паркован (окно 36 ч, queue.ts:550-551). Плюс regex `blockedSources` матчит per-company код (`contact_sources_company_budget_exhausted`) и останавливает весь пул `provider_budget` **навсегда** (без 4c01c56).
- **Evidence**: `git show 4c01c56` — добавляет `blockingActiveJobs`-фильтр (store.ts:1950-1953), negative lookahead в regex (store.ts:1966) и регресс-тесты (tests/lead-radar-queue-reliability.test.ts:987-1089). Коммит датирован 2026-08-30 05:22 +0500; Worker деплоился 2026-08-29T01:28Z — фикс в production **отсутствует**.
- **Исправление**: деплой automation Worker с `4c01c56` (после прогона очередей тестов). Отдельное разрешение владельца на релиз Worker не требует внешних эффектов, но это production-деплой — по правилам задачи согласовать.
- **Уверенность**: подтверждено (кода + тайминги деплоя).

### QR-3 · P1 · Production: транзиентный сбой сайта (5xx/таймаут) делает компанию навсегда terminal
- **Причина**: в деплоенной версии `source_unavailable`/`source_timeout` идут через общий backoff 45/90/180 с → 3 попытки за ~5 минут → dead letter `retry_exhausted`. Локально `4c01c56` вводит лестницу 15 мин/1 ч/4 ч (queue.ts:268-274, 317-321).
- **Влияние**: во время случайного даунтайма сайта-компании весь её контактный потенциал теряется без повторной попытки.
- **Уверенность**: подтверждено кодом + diff. Чинится тем же деплоем, что QR-2.

### QR-4 · P2 · Потеря батча кандидатов при неудачном fanout
- reserveBatch атомарно двигает курсор пула **до** persistDiscoveryFanout (contact-discovery-store.ts:93-104); при провале CAS/исключении 10 кандидатов не становятся компаниями и не возвращаются в пул → фиктивный `sources_exhausted`.
- **Исправление**: резервировать батч после успешного fanout или возвращать `unreserve` при исключении.
- **Уверенность**: подтверждено кодом.

### QR-5 · P2 · Медленное восстановление expired-lease после падения Worker
- cron */15 поднимает только 2 expired-lease за тик (store.ts:1600-1607, queue.ts:809-819); при массовой потере lease восстановление растягивается на часы — поиск выглядит зависшим.
- **Исправление**: поднять recovery batch (например 10) — бюджет свободных D1-запросов cron это позволяет (dispatch и так 5).

### QR-6 · P2 · `message.retry({delaySeconds})` до 14400 с превышает лимит Cloudflare Queues (900 с)
- После 4c01c56 backoff 1 ч/4 ч уходит в `message.retry` (queue.ts:340) → Cloudflare отклоняет, ловится в automation-worker.ts:691-697 → ack + `lead_radar.worker_failure`. Работа не теряется (D1 `next_dispatch_at` + cron подхватит), но каждый длинный backoff — ошибка в логах и полная зависимость от cron.
- **Исправление**: клэмпить delaySeconds до ≤900 и оставлять остаток в `available_at` D1.

### QR-7 · P2 · Dead-letter discovery убивает всех живых детей и ломает повторный replenish
- `deadLetterDiscoveryChildren` (store.ts:1506-1531) терминирует ВСЕ queued/retry_wait enrichment (включая успешно идущие) и красит компании terminal; повторный `createJob('contact-pool:{searchId}:{cursor}')` упирается в мёртвую строку с тем же idem-ключом (store.ts:1992) → replenish возвращает мёртвый job.
- **Исправление**: не терминировать enrichment в `running`; суффикс generation в replenish-ключе.

### QR-8 · P2 · Candidate-режим: «готово» при нулевом качестве
- `ready` = `rows.length >= desiredCount` без учёта enrichment/terminal-компаний (store.ts:2002-2003); компании `no_website`/`robots_blocked` завершают свои jobs как `completed` (queue.ts:625-640). Пользователь видит «поиск завершён, N компаний», из которых контактного потенциала 0.
- **Исправление**: funnel-метка качества в статусе поиска (сколько компаний имеют хотя бы один lookup-eligible кандидат), как уже сделано в contact-режиме (`resolvedGoalCount`).

### QR-9 · P3 · DLQ-копия теряется при неудаче отправки в DLQ
- automation-worker.ts:683-697 — при неудаче `AUTOMATION_DLQ.send` доставка всё равно ack; комментарий queue.ts:709-713 утверждает обратное. D1-строка dead_letter сохраняется (потери работы нет, теряется только наблюдаемость).

### QR-10 · P3 · Осиротевший поиск чистится только UI-поллингом
- `failInterruptedSearches` вызывается лишь из service.run/get (service.ts:193, 299). Нет вкладки — нет `failed/search_interrupted`. Добавить вызов в cron.

### QR-11 · P2 · at-least-once для платных Firecrawl-запросов
- Декларировано (queue.ts:699-701): после lease expiry дубль доставки может повторить платный запрос; effect-ledger защищает D1-эффекты, но не деньги. Firecrawl preflight (`started`→`request_unknown`) частично страхует. Осознанный компромисс — документировать в бюджете, не «чинить» флагом.

### QR-12 · P2 · Budget-parked job занимает слот running-поиска до 36 ч
- Даже после 4c01c56 паркованный job не даёт поиску финального статуса (store.ts:1999) и держит слот (store.ts:589-591). Исправление: считать паркованный budget-job неактивным для слота/финальности, но блокирующим только соответствующую фазу.

---

## B. Discovery и извлечение контактов

### DS-1 · P1 · Вся публичная контактная добыча зависит от Firecrawl; Jina не заменяет discovery (гипотеза ТЗ подтверждена)
- `createContactSourceQueueDependencies` без `firecrawlConfig` возвращает `{}` — никакой контактной работы (contact-source-worker.ts:13-14). URL ищет Firecrawl `search` с `includeDomains=[9 каталогов UZ + t.me/telegram.me]` (contact-source-worker.ts:68-77, firecrawl-client.ts:51-54). Jina — только скачивание уже найденного URL при `target_http_error`/`invalid_page` (contact-source-worker.ts:55-65, 118-122; флаг `LEAD_RADAR_JINA_ENABLED`, в production отсутствует).
- **Следствие**: исчерпание search-кредитов (search 140/поиск, daily 200 — firecrawl-client.ts:31-36) → публичные контакты перестают добываться при исправном коде. Плюс `LEAD_RADAR_FIRECRAWL_ALLOWED_ORGS` — контактная добыча привязана к org allowlist (firecrawl-client.ts:21-25).
- **Исправление**: см. ROADMAP C2 (разделить URL discovery и скачивание; добавить бесплатный discovery-путь: карта сайта самой компании, sitemap.xml, прямые /contact страницы — это без Firecrawl).
- **Уверенность**: подтверждено кодом.

### DS-2 · P1 · Цель «N проверенных контактов» достижима только через собственный сайт компании
- Lookup допускает type-only username из каталога (contact-resolution.ts:29-30), но при resolved и `ownership!=='company'` результат переписывается в `username_exists_ownership_unconfirmed` (contact-resolution.ts:110) и сохраняется с `type:'unknown', reason:'bridge_resolved_unconfirmed'` (contact-resolution.ts:122-126). `countResolvedCorporateContacts` требует `reason='bridge_resolved_corporate'` (contact-resolution.ts:63-68) → такие контакты **не считаются** в contactTarget и не входят в strict verified.
- Каталоги дают ownership='company' практически только через structured entity с независимым phone/address (public-contact-discovery.ts:73-81) или special-case top.uz (:85-103) — большинство выданных usernames остаются unconfirmed.
- **Это главная структурная причина низкого yield Telegram**: компания с Telegram только в каталоге не может закрыть цель, даже если Bridge подтвердил существование username. Решение — не ослабление, а явный ручной tier: «разрешён Bridge + каталог, требуется ручное подтверждение владения» с операторским review и отдельным основанием.
- **Уверенность**: подтверждено кодом.

### DS-3 · P2 · Тонкие источники: узкий каталог, ограниченные запросы
- Запросы: `"Имя" город`, `"E.164"`, латиница-вариант (public-contact-discovery.ts:21-34); ≤5 URL на запрос, ≤5 источников, ≤12 кандидатов, ≤4 сохранённых источников (contact-source-worker.ts:79, 128, 139). Компании без сайта и без совпадения в 9 каталогах не имеют пути к контакту вообще (кроме OSM-телефона в enrichment).
- Не является дефектом само по себе (precision-first), но должно быть видно пользователю как честный terminal status + знаменатель, а не «поиск завершён».

### DS-4 · P3 · tel: с несколькими номерами (запятая) отбрасывается целиком
- `assessLeadRadarPhone` отвергает строки с `,|/` (lead-radar-contacts.ts:70). В тексте спасает `findPhoneNumbersInText`, в `tel:+998..,+998..` — нет. Небольшая потеря реколла, безопасная по дизайну.

### DS-5 · P3 · Официальный домен без Firecrawl-бюджета не резолвится
- `resolveMissingWebsites: true` включён только в Firecrawl-зависимостях (firecrawl-enrichment.ts:121-122); identity-matched JSON-LD на каталоге (official-domain-discovery.ts:8-39) — бесплатный, но покрывает малую долю. Итог: компания без сайта + без бюджета = навсегда `no_website`.

### DS-6 · P3 · Дедупликация компаний между поисками работает
- `canonical_key` группирует дублей в каталоге (recipient-directory.ts:63-64), подавленные дубликаты считаются в `excluded_count` (store.ts:1032-1047). Позитив.

---

## C. Телефонная нормализация

### PH-1 · позитив · Модель здоровья
- `libphonenumber-js/max` (metadata-библиотека, не ручная таблица префиксов): E.164, валидность, тип линии (lead-radar-contacts.ts:62-83). `mobileLookupCandidate` только для `MOBILE` без extension. `fixed_or_mobile`/`unknown` → `ambiguous_line_type`, НЕ lookup-кандидаты (требование ТЗ «unknown не должен автоматически становиться мобильным» выполнено).
- UZ-специфика: авто-`+998` (строки 68, 89); NBSP/URL-декод; лимит 180 симв/900 КБ текста/12-20 номеров; множественные номера в одной строке не берутся «наугад».
- Сохраняется исходное значение + нормализованное + источник + время (evidence `value/sourceUrl/observedAt`, lead-radar.ts) + причина отклонения (LEAD_RADAR_CONTACT_REASON_COPY, строки 101-111).
- **Ограничение**: определение типа у libphonenumber — данные ITU/операторов; `unknown` для части виртуальных номеров. Это ограничение источника, система корректно держит их вне lookup.

---

## D. Telegram resolution и каталог

### TG-1 · P2 · Строгое подтверждение живёт 24 ч — verified-набор ежедневно обнуляется
- TTL resolved-check = 86400 с (contact-resolution.ts:111-112); `verifiedResolvedCorporateCompanies` требует `expires_at > now` и текущий `account_digest` (contact-resolution.ts:148-175). Через сутки после проверки контакт формально ещё `bridge_resolved_corporate` в карточке, но strict-вычисление его не считает, пока не перечекать.
- Симптом владельца: «вчера были подтверждённые — сегодня пропали». Ожидаемое поведение по дизайну, но UI это не объясняет (в каталоге статус просто уходит в `review`).
- **Исправление**: мягкое авто-переподтверждение (batch re-check истекающих перед prepare кампании — уже частично есть как «Проверить и оставить подтверждённые», надо сделать предвестие за N часов) + понятная подпись TTL в UI.

### TG-2 · P2 · Re-enrichment может снять верификацию без реального изменения (вероятно)
- `proof()` включает enrichment.sources + evidence ids (contact-resolution.ts:44-53); id источника = `hash(value, expected, observedAt)` (public-contact-discovery.ts:119) — повторное обогащение с новым `observedAt`/другим порядком кандидатов меняет proof_digest → check больше не матчится → verified уходит. Это желаемое поведение при смене сайта/телефона, но ложное срабатывание при идентичной пере-выгрузке.
- **Исправление**: нормализовать proof (сортировка источников, исключить `observedAt` из identity-компонента id или сравнивать по content-hash). **Уверенность**: механизм подтверждён кодом; частота на живых данных не измерялась.

### TG-3 · P2 · Лимиты каталога упираются незаметно
- >5000 компаний → 422 `directory_scan_limit` (recipient-directory.ts:40-41); >200 потенциально-business для фильтра verified/review → 422 `directory_narrow_verification_filter` (audiences.ts:145). Ошибка показывается (TelegramContactDirectory.tsx:18-19), но массовый выбор и фильтры перестают работать без объяснения пути вперёд. С ростом базы владельца это станет ежедневной болью.
- **Исправление**: серверная пагинация до группировки / индекс по contact_keys / кэш строгой верификации.

### TG-4 · P2 · «Верхний каталог vs нижние списки»: историческое расхождение — причины и текущее состояние
- Корень прошлого расхождения: разные источники данных (каталог — все поиски + группировка по контактам; карточка поиска — компании одного поиска) и разные правила статусов. Сейчас: парсер контакт-ключей общий (`recipientContactChoices` — recipient-directory.ts:53 использует тот же модуль, что UI), строгий verified вычисляется одинаково (`strictVerifiedDirectoryCompanyIds` → `verifiedResolvedCorporateCompanies`; в кампаниях — campaign.ts:895). Остаточные различия: знаменатели (уникальные контакт-группы vs компании) и TTL-эффект TG-1. Существенный прогресс; полная унификация — единый endpoint вычисления статусов.

### TG-5 · позитив · `bridge_resolved_corporate` — что сохраняется и проверяется
- Сохраняется: url/username/peerRef (opaque), sourceKey (candidate key), type='business', confidence 0.9, verifiedAt, evidenceIds (contact-resolution.ts:122-136). Raw peer IDs не покидают Bridge (opaque lrpeer).
- Проверяется заново: prepare/create (candidate filter + Bridge-verified, campaign.ts:697-721, 788-798), dispatch (fresh verified draft link + endpoint/fingerprint/identity + authorization-снимок, campaign.ts:2092-2179). Прямой путь непроверенного контакта до send не найден.
- False-negative канал: TG-1/TG-2 — корректный контакт исключается из-за TTL/дайджеста, а не из-за реальной порчи. False-positive: не найден.

---

## E. Кампания и отправка

### CP-1 · P1 · Lease отправки короче бюджета запроса → ложный ambiguous и конкурентная отправка
- `CLAIM_LEASE_MS = 120 с` (telegram-campaign.ts:46) при внешнем таймауте send 125 с (telegram-account-service.ts:29-34) плюс время на decrypt/DNC/media. Если gateway отвечает 120-125 с, `recoverExpiredClaim` (вызывается началом следующего queue-сообщения — campaign.ts:2606-2609, и cron'ом) помечает ещё летящего получателя `ambiguous`, освобождает account lease, начинается следующий получатель → **два конкурентных запроса на один аккаунт**, реально доставленное сообщение теряет статус (sent записать нельзя — `markRecipientSent` требует `status='dispatching'`, store.ts:3160-3164), кампания паузится `ambiguous_delivery`.
- **Исправление**: CLAIM_LEASE_MS ≥ 180 с (выше worst-case 125 c + запас) ИЛИ продление lease перед отправкой. Тривиально.
- **Уверенность**: подтверждено кодом (окно узкое, но гарантированно достижимо при медленном Bridge/gateway).

### CP-2 · P2 · Неполная реконсиляция пары recipient='sent'/effect='ambiguous'
- Если в `markRecipientSent` recipient обновился, а effect-UPDATE не затронул строк (гонка/condition), функция возвращает false → dispatch трактует как ambiguous → `markRecipientAmbiguous` переводит effect в `ambiguous` (store.ts:3381-3385) → пара recipient='sent'/effect='ambiguous'. `maintain()` чинит только пары effect='dispatching' (store.ts:3685-3700) → несогласованность живёт до следующего терминального события; счётчик sent занижен.
- **Исправление**: расширить maintain() на пары sent/ambiguous с существующим message_id (effect уже имеет доказательство отправки) или перевести эффект в ambiguous только при recipient≠sent.

### CP-3 · P2 · Текст кампании не переживает reload; черновик «перетекает» между поисками
- Template нигде не персистится (только media-метаданные в sessionStorage — campaign-media-draft.ts:5-18); reload сбрасывает текст (panel:705). При смене searchId selection чистится, а template остаётся от прошлой выдачи (panel:1048-1090). Позитив: polling не перетирает текст (панель опрашивает только при running-кампании, panel:1016-1046), редактирование НЕ блокируется при недоступном backend (panel:2620 + подсказка :2631) — историческая жалоба решена наполовину.
- **Исправление**: sessionStorage/localStorage draft для template + очистка при смене выдачи.

### CP-4 · P2 · Лимит длины в code points вместо UTF-16 units
- Проверка 4096 по `[...value]` (campaign.ts:42-44, 2401-2404) vs подсчёт Telegram в UTF-16 code units: текст с многими астральными эмодзи проходит локальную проверку, но отклоняется провайдером как терминальный `provider_rejected` без retry, получатель = failed. Редко, но фатально для конкретного получателя.
- **Исправление**: считать `.length` (UTF-16) для лимита (caption 1024 аналогично).

### CP-5 · P3 · prepare при pending media-проверке отдаёт `telegram_campaign_media_not_found`
- control.ts:1535-1542: `isCampaignMediaActive=false` при pending → ошибка «not found» вместо «дождитесь проверки» (409 media_check_pending есть только в медиа-блоке). Вводит в заблуждение.

### CP-6 · P3 · Мелкие
- Dead-статус `draft` (store.ts:5-12, 1726-1732 — кампании всегда создаются approved).
- Dead code `validateTelegramCampaignMedia` (account-service.ts:1136-1169).
- `updateTemplate` молча теряет нажатия при `operationBusy` (panel:1525-1528).
- Preflight limits перезаписываются последним батчем (CampaignReadiness.tsx:49-53).
- `recoverExpiredClaim` LIMIT 1 за вызов (store.ts:3438-3442).
- sent с message_id >256 симв → ambiguous (campaign.ts:2401-2404, избыточно консервативно).

### CP-7 · P2 · Между prepare и dispatch Bridge-верификация не перепроверяется
- На dispatch проверяются authorization/evidence/DNC (campaign.ts:2092-2179), но не свежесть `lead_radar_contact_checks` (осознанный комментарий campaign.ts:128-129). В связке с TG-1: contact может разрешиться, устареть и отправиться по D1-authorization в течение одного запуска. Риск низкий (authorization всё равно отдельный гейт), но для строгого набора стоит повторно требовать `expires_at>now` в beginDispatch guard.

### Позитив кампании (проверено, важно не сломать)
- Непроверенный контакт до send не доходит: тройная перепроверка (evaluate → create → dispatch), automatic ⊆ verified (campaign.ts:697-721, 1484).
- Дубли отправки закрыты: attempt=1, lease CAS, Idempotency-Key=effect_id + `random_id`, unknown-исход → `ambiguous` без авто-повтора (campaign.ts:2398-2400, account-service.ts:1321-1329, 1337-1368).
- Preview совпадает с отправляемым текстом: одна подстановка `{company_name}` на сервере и клиенте (campaign.ts:378-384, control.ts:554-617, lead-radar-campaign.ts:625-627); payload фиксируется и шифруется при create, дайджест проверяется на dispatch.
- Квота 30/UTC-день и интервал ≥120 с считаются серверно в D1 (store.ts:2555-2564, campaign.ts:2298-2337); flood/privacy → корректная пауза, не обход.
- Approval одноразовый с digest списка/текста/media/аккаунта, TTL 10 мин; изменение после preflight невозможно (campaign.ts:1490-1505, 1664-1699).

---

## F. Pairing / auth (кратко; глубокий UX-аудит — по handoff §14)

- Surface: `createTelegramBridgePairing` / `getTelegramBridgeStatus` / `beginTelegramAccountConnection` → phone → `submitTelegramAccountAuthInput` → `submitTelegramAccountPassword` (2FA) → `pollTelegramAccountConnection` → `finalizeTelegramAccountConnection` / `adoptTelegramAccountConnection` (telegram-account-service.ts:651-1020); account.status: pending → connected / revoked; гейты `account_not_connected`, `account_binding_missing` в preflight (telegram-campaign-control.ts:1013-1014).
- Различение фактов (process running ≠ heartbeat ≠ authenticated ≠ confirmed) заложено в контракт (capabilities.ts:100-108 readiness blockers; UI readiness). Live-состояние сессии владельца в аудите не проверялось (запрещено трогать vault/session) — статус «Bridge Running» подтверждён только как процесс.
- Исторические UX-дефекты (исчезающий код, вставка, 2FA-неясность) описаны в handoff; в текущем коде низкоуровневых регрессий не найдено, но авторизованный end-to-end прогон pairing не выполнялся — вне scope read-only аудита.

---

## G. Безопасность и данные

- **SX-1 (позитив)** SSRF/URL-политика: `safePublicHttpUrl` блокирует localhost/private ranges/link-local/метаданные-хостнеймы/nip.io/sslip.io/credentialed URLs (validation.ts:80-123); Firecrawl вызовы — `redirect: 'manual'` (ключ не уходит на редирект, firecrawl-client.ts:146-148); robots-запреты и unsafe_redirect никогда не обходятся альтернативным провайдером (contact-source-worker.ts:115-117), Jina не обходит robots.
- **SX-2 (P3)** Остаточный DNS-rebinding: hostname проверяется строкой; прямые fetch сайтов идут из Workers egress (нет доступа к private сети), поэтому риск ограничен, но при будущем локальном crawler (Scrapling) станет критичным — требование из UPgrade ROADMAP остаётся в силе.
- **SX-3 (позитив)** Tenant isolation: `ownerOrgId(email)` + org_id во всех выборках; admin API под `withOwnerRole('platform_owner')`; аудитория/кампании/контакты всегда фильтруются по org. IDOR на чтении кода не найден.
- **SX-4 (позитив)** Секреты/PII: campaign payloads и endpoints шифруются в D1 (telegram-campaign-crypto), raw peer IDs только в Bridge DPAPI; личные контакты redact-ятся по capabilities и TTL 30 дней (capabilities.ts:157-209). Публичный сайт/SEO не зависят от Lead Radar bindings.
- **SX-5 (позитив)** Найденный контент — данные, не инструкции: HTML парсится структурно (JSON-LD/entity-границы), не исполняется; LLM-инференс помечается `classification='model_inference'` и не может стать corporate-фактом (contact-candidates.ts:10-16).
- **SX-6 (P3)** `directory_scan_limit` и 5001-строчный SELECT — защитный, но без пагинации на стороне SQL (см. TG-3).

---

## Сводная таблица

| ID | Sev | Кратко | Where | Уверенность |
|---|---|---|---|---|
| QR-1 | P1 | contact-resolve job невоссоздаваем после dead letter | store.ts:450-461,1470-1486; queue.ts:547-552 | подтверждено |
| QR-2 | P1 | prod: пул заморожен за бюджетной парковкой | store.ts:1950-1966 (до 4c01c56) | подтверждено |
| QR-3 | P1 | prod: transient сбой сайта = вечный terminal | queue.ts (до 4c01c56) | подтверждено |
| QR-4 | P2 | потеря батча кандидатов | contact-discovery-store.ts:93-104 | подтверждено |
| QR-5 | P2 | recovery 2 job / 15 мин | store.ts:1600-1607 | подтверждено |
| QR-6 | P2 | retry delay >900s → worker_failure | queue.ts:340; automation-worker.ts:301 | подтверждено |
| QR-7 | P2 | discovery dead letter убивает живых детей | store.ts:1506-1531, 1992 | подтверждено |
| QR-8 | P2 | ready при нулевом качестве (candidate mode) | store.ts:2002-2003 | подтверждено |
| QR-11 | P2 | double-spend Firecrawl (at-least-once) | queue.ts:699-701 | задекларировано |
| QR-12 | P2 | parked job держит слот поиска 36 ч | store.ts:589-591, 1999 | подтверждено |
| DS-1 | P1 | публичные контакты = Firecrawl-only discovery | contact-source-worker.ts:13-14, 68 | подтверждено |
| DS-2 | P1 | цель контактов достижима только с сайта компании | contact-resolution.ts:63-68, 110-126 | подтверждено |
| DS-3 | P2 | узкие источники без честного знаменателя | public-contact-discovery.ts | подтверждено |
| DS-5 | P3 | no_website без бюджета навсегда | firecrawl-enrichment.ts:121-122 | подтверждено |
| TG-1 | P2 | verified умирает за 24 ч | contact-resolution.ts:111-112, 158 | подтверждено |
| TG-2 | P2 | re-enrichment снимает verified | contact-resolution.ts:44-53, 119 | вероятно |
| TG-3 | P2 | каталог: 422 на 5000/200 лимитах | recipient-directory.ts:40-41; audiences.ts:145 | подтверждено |
| CP-1 | P1 | lease 120 c < send 125 c → ambiguous | telegram-campaign.ts:46; account-service.ts:33 | подтверждено |
| CP-2 | P2 | sent/ambiguous пара не реконсилируется | store.ts:3175-3186, 3685-3700 | подтверждено |
| CP-3 | P2 | текст не переживает reload | panel:705; campaign-media-draft.ts | подтверждено |
| CP-4 | P2 | 4096 code points vs UTF-16 | campaign.ts:42-44 | подтверждено |
| CP-7 | P2 | dispatch не перепроверяет TTL check | campaign.ts:128-129, 2092-2179 | подтверждено |
