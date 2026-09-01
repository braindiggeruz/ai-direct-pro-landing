# Lead Radar: бесплатный сбор корпоративных Telegram-контактов
Дата: 30 августа 2026. Production baseline: около 11:32–11:50 UTC.
Checkout: F:/Claude/gptbot-lead-radar-integration-20260827.
Базовый HEAD: f6628489d349a2807f98a550ea4793dea965ebd2.
Статус результата: аудит + локальные исправления; НЕ production-релиз.

## 1. Executive verdict

Самое важное: узкое место — не кнопка отправки, а поиск правильного контакта и доказательство, что он принадлежит компании. Покупка дополнительных поисковых кредитов сама по себе этого не исправит. Приоритет владельца — ноль платных API, корректные контакты и скорость.

Локально внедрено:

- Бесплатная граница в Worker: Firecrawl и Jina не вызываются даже при старых включённых флагах и сохранённых ключах.
- Вместо запрещённого robots-поиска top.uz — разрешённый раздел стоматологий, ограниченная постраничная обработка и сохранение страницы при сбоях.
- Исправлены блокировка пополнения очереди восстановленными бюджетными заданиями, ротация зависших поисков и возврат потерянного окна кандидатов.
- Подтверждение принадлежности применяется к одному выбранному контакту, повторно читает источник, исключает неподтверждённый тип и не повышает соседние ссылки до корпоративных.
- Неизвестная ниша, изменившаяся страница и недоступный источник не выдаются за доказанное отсутствие Telegram.

Это ещё не доказательство роста реальной выдачи. Новый каталог проверен по формату только для стоматологий; бесплатный поиск отсутствующих сайтов и дополнительные ниши остаются следующими этапами. Платные сервисы в действующем production пока включены: отключение запрошено отдельно, но в этой сессии не выполнено.

Под «бесплатно» здесь понимается отсутствие платных поисковых/парсинговых API и новых подписок. Бесплатный код не отменяет лимиты имеющегося хостинга, сети, компьютера и источников. При исчерпании бесплатной квоты нужен видимый останов/перенос, а не автоматическая покупка или платный fallback.

### Фактическая воронка

| Показатель baseline | Значение | Как понимать |
|---|---:|---|
| Поиски | 33 | 2 running, 7 ready, 18 partial, 4 insufficient_results, 2 failed |
| Строки компаний во всех поисках | 1010 | Это НЕ 1010 уникальных организаций |
| Различные canonical_key | 267 | Рабочий знаменатель для оценки покрытия; не независимая юридическая верификация |
| Уникальные ключи с сайтом | 23 / 267 = 8,6% | 109 строк с сайтом содержат повторы |
| Уникальные ключи с телефоном | 98 / 267 = 36,7% | 416 строк; телефон ещё не Telegram и не разрешение на рекламу |
| Уникальные ключи с telegram_url | 3 / 267 = 1,1% | 8 строк, из них 5 строк с bot-суффиксом |
| Contact-source enrichment | 217 | 181 исторически помечен бюджетными ограничениями |
| Company enrichment terminal | 1006 | Из них 834 no_website; нельзя все 1006 объяснять бюджетом |
| Contact checks | 9 | 1 regular_user_resolved уже несвежий; 2 ownership_unconfirmed; 6 privacy_or_missing |
| Свежие strict corporate contacts | 0 | Старый сохранённый corporate контакт не равен свежей проверке |
| Кампании / recipients / effects / authorizations | 0 / 0 / 0 / 0 | Отправка на живом получателе не проверена |

205 canonical_key повторяются между поисками. 901 строка без сайта соответствует 244 уникальным ключам без сайта, а не 901 независимой компании.

## 2. Version matrix и достоверность baseline

| Компонент | Наблюдение |
|---|---|
| Pages | Живой gptbot-release.json: f6628489d349a2807f98a550ea4793dea965ebd2; artifactSHA a255813a528feab688f60b24bf6a2c506a2b8aa3077b341f25a70813461bd6de; 870 файлов |
| Pages deployment | fb52256a-2e8b-4b5a-85b3-73f0cdfb4bff, создан 2026-08-30T10:28:25.891041Z; metadata branch main, commit_dirty=true |
| Automation Worker | modified 2026-08-30T10:26:29.222671Z; active version 11299c49-66b9-4768-81eb-602f93995b61, 100%; cron */15 минут |
| Gateway | modified 2026-08-28T13:55:57.289391Z; active c19f008b-620d-4d13-bf09-caf0d428169d, 100%; runtime version 1.5.1 |
| Windows Bridge | Установленный пакет gptbot-lead-radar-telegram-bridge 1.5.0; CLI configured/installed/paired/vault_healthy=true; планировщик Running |
| D1 | Миграции Lead Radar присутствуют, ledger также содержит 0055; новых миграций не применялось |
| Flags | admission/processing/account/campaign/autosend включены; legacy CONTACT_ENABLED=false; local_bridge; 30/UTC-сутки, 120 секунд |
| Платные провайдеры | Firecrawl enabled/fallback, лимиты 200/day, 100/search, 14/domain, 7/company; Jina выключен |
| Локальный результат | Изменения поверх f6628489, не закоммичены и НЕ развёрнуты |

У Worker/gateway нет Git commit annotation: полный бинарный паритет с HEAD не доказан. Живой Worker прочитан в память; проверены конкретные признаки кода — cutoff revival, time_limit, updated_at ordering, auto-resume, старый top search и фильтр только retry_wait. Это подтверждает релевантные дефекты в deployed-коде, но не заменяет release manifest.

Разница 1.5.0 Bridge / 1.5.1 gateway сама по себе не доказательство несовместимости. Ошибка первоначального поиска Python distribution под неверным именем не была неисправностью Bridge. Содержимое vault, session и ledger не читалось.

## 3. Проверка регистра LR-F-1…22

Статус относится к baseline production/коду f6628489. «LOCAL FIX» не означает «выпущено».

| ID | Статус | Доказательство / остаток |
|---|---|---|
| LR-F-1 | FIXED для выявленных typing ошибок | search-pulse.ts импорт из types; bunzy/security.ts тип массива; обе проверки TypeScript проходят. Полный новый release gate на чистом checkout не запускался |
| LR-F-2 | FIXED | queue.ts watchdog: cutoff до 2026-08-30T00:00Z, reset created_at только при revival; 7 строк оживлены; тесты cutoff зелёные |
| LR-F-3 | FIXED в проверенной логике | telegram-campaign-store.ts:3892: auto-resume только после доказанного ремонта всех ambiguous-пар; истинная неопределённость остаётся paused |
| LR-F-4 | STILL OPEN частично | telegram-campaign.ts:42,365 и UI используют UTF-16; Bridge lead_radar_bridge/protocol.py:290 ещё len(code points). Верхние гейты защищают штатный маршрут, но локальная защита не унифицирована |
| LR-F-5 | STILL OPEN | contact-resolution.ts:102,111: TTL 24ч, нет авто-перепроверки перед prepare. privacy_or_missing также может кэшироваться 24ч, не 60 секунд |
| LR-F-6 | STILL OPEN | Бесплатный путь не восстанавливает отсутствующий официальный сайт. Новый каталог извлекает контакты, но не закрывает задачу website discovery |
| LR-F-7 | STILL OPEN → LOCAL FIX | queue.ts:364: обычный exhausted discovery теперь возвращает window; раньше unreserve был лишь в expired-lease ветке. Добавлен тест реального queue consumer |
| LR-F-8 | FIXED | campaign-template-draft.ts: tab-scoped sessionStorage, TTL и surrogate-safe пределы; компонент не нарушает storage-инвариант |
| LR-F-9 | STILL OPEN | recipient-directory.ts:40–41 LIMIT 5001; audiences.ts:145 отказ >200; нужна серверная пагинация |
| LR-F-10 | STILL OPEN | store.ts candidate-mode: ready по числу строк, не по качеству контактов |
| LR-F-11 | FIXED | automation-worker.ts scheduled вызывает failInterruptedSearches, не зависит только от открытой вкладки |
| LR-F-12 | FIXED | automation-worker.ts:708: неудачная DLQ.send ведёт к retry, а не ack |
| LR-F-13 | STILL OPEN → LOCAL FIX | ownership-confirmation.ts: детерминированные IDs, атомарные upsert; concurrent test допускает одну новую запись |
| LR-F-14 | FIXED, наблюдаемость требует улучшения | queue.ts: per-search try/catch существует; молчаливые catch пока плохо видны оператору |
| LR-F-15 | FIXED для новой runtime-связки | free-acquisition.ts + Worker: платный shadow больше не выключает бесплатный маршрут; старый provider API оставлен неактивным |
| LR-F-16 | STILL OPEN | telegram-campaign-store.ts updateAccountStatus: healthy=false у вызывающих; last_health_at не полноценный heartbeat; gateway без D1 |
| LR-F-17 | STILL OPEN частично | min remainingToday / max nextDispatchAt исправлены в CampaignReadiness; прочие UX/legacy-хвосты не закрыты |
| LR-F-18 | STILL OPEN | tools/lead-radar-crawler/README.md: benchmark runner без полного DNS pin/subresource isolation; не production-ready |
| LR-F-19 | STILL OPEN / часть выведена из маршрута | custom domain, proof digest/naming и прочие хвосты остаются; paid at-least-once не исправлялся, а исключён из нового free-only Worker |
| LR-F-20 | STILL OPEN → LOCAL FIX частично | store.ts:2005 учитывает queued budget jobs; queue.ts:906 touch в finally. Кап повторного revival детерминированно падающего discovery всё ещё отдельная задача |
| LR-F-21 | STILL OPEN → LOCAL FIX | ownership-confirmation.ts:16: точный endpoint, re-fetch, отказ inferred/unknown/personal/bot/channel/group; stale siblings не становятся fresh facts |
| LR-F-22 | STILL OPEN | maintain не сверяет неопределённый effect с read-only gateway ledger; нельзя заменять такую проверку повторным send |

Exactly-once цепь проверена как защита от повторного эффекта: attempt CAS, lease CAS, stable Idempotency-Key, 180-секундная lease при 125-секундном request budget, unknown → ambiguous, отсутствие автоматической повторной отправки при неизвестном результате. Тесты replay/concurrency/Pause/Stop проходят. Это НЕ математическая гарантия доставки ровно одного внешнего сообщения при любом сбое сети.

## 4. Новые и уточнённые находки

| ID / severity | Причина и evidence | Действие |
|---|---|---|
| CY-01 P2 | Нельзя доказать полный Worker↔Git паритет только modified_on; commit annotations отсутствуют | Следующий релиз — build fingerprint/manifest для каждого компонента; не объявлять весь production «100%» |
| CY-02 P1 | top.uz robots запрещает */search/. Старый free adapter соблюдает отказ, но caller пишет complete/no_matching_public_contact. Реальный category HTML 655474 байта > старых 450000 | top-uz-discovery.ts:46; разрешённый category path, max 900000 для индекса, максимум 2 карточки за доставку; unavailable отдельно от no-match |
| CY-03 P1 | requeueContactResolutionJob переводит retry_wait → queued, сохраняя budget reason; store.ts:2005 раньше игнорировал только retry_wait. 42 queued search-budget задания; 2 pool time_limit застыли | Фильтровать оба parked-состояния; touch watchdog даже при skipped/failed refresh. Локальный A/B regression воспроизводил дефект |
| CY-04 P2 | «Search стоит 100 кредитов» — неверно. firecrawl-store.ts:91 считает search=2; 100 — lifetime budget конкретного Lead Radar search, без UTC-сброса | Уточнены метрики; платный fallback удалён из production dependency wiring |
| CY-05 P2 | Старое R4 одним companyId превращало до 3 старых inferred unknown-ссылок в новые business facts | Точный candidateKey, fresh source, классификация и atomic company/DNC guard. Старые данные не переписывались |
| CY-06 P2 | 1010 строк и 267 canonical keys смешивались; contact-source limits смешивались с no_website company terminal | Воронка считает уникальные ключи отдельно; показатели не названы «новыми компаниями» |
| CY-07 P2 | Нет per-adapter attempt ledger; source snapshots обновляются/истекают | Нельзя вычислить настоящий historical yield top.uz или приписать все его записи бесплатному адаптеру; требуется пилотная телеметрия |

Firecrawl ledger: 28.08 reserved 200; 29.08 116; 30.08 на последнем baseline 38. Reserved не равен оплаченной сумме провайдера. Его billing API не вызывался. Lifetime cap объясняет, почему некоторые задания не оживают на следующий день; 181 budget-labelled snapshot не означает 181 отказ именно сегодня.

## 5. Инвентарь источников

Robots — лишь один технический барьер. Разрешённый robots путь не подтверждает лицензию на повторное использование и не означает согласия на рекламу. Условия источников нужно проверить до масштабирования.

| Источник | Проверено | Yield и решение |
|---|---|---|
| Собственный сайт компании | Действующий robots/DNS-aware reader, контакты + sitemap fallback; корпоративная привязка | Первый приоритет. 23 уникальных ключа имеют сайт; реальный incremental Telegram yield не измерен |
| OSM | Действующий discovery; website/phone/name/address как community data | 23 ключа с сайтом, 98 с телефоном — полезная база идентификации, не подтверждение corporate Telegram. Сохранять attribution |
| top.uz | robots 200: search запрещён; стоматологический category и company routes не запрещены. Пять content запросов суммарно, включая sitemap и повтор чтения category | В D1 1 сохранённый source/1 company с corporate mobile, 0 Telegram candidates. Две просмотренные карточки — телефоны и служебный бот каталога, не Telegram компании |
| clinics.uz | Только сохранённые D1 source snapshots; новый live формат не проверен | 2 source/2 company, телефоны, 0 TG candidates; приоритет следующей bounded проверки |
| yellowpages.uz | robots redirect на www, 200; ограничения query key/pagesize/user/account и др.; формат новых карточек не проверен | D1 2 source/1 company с телефонами, 0 TG. Не подключать угадываемый search route |
| goldenpages.uz | robots www 200; ограничения /search/*, *.html, person/anketa и отдельных ботов | Нет измеренного yield. Нужны разрешённый конкретный маршрут, условия и fixture |
| orginfo.uz | robots 200, requests paths запрещены | Контактный формат не проверен. Потенциально identity source, не доказанный TG-source |
| tilted.uz, torg.uz | DNS/timeout на проверке | Недоступны; не заменять домен догадкой и не обещать покрытие |
| OLX.uz | robots ограничивает contact reveal/ajax/account/chat/search и некоторые API | Не обходить раскрытие скрытых контактов; частное объявление не corporate ownership |
| data.egov.uz | robots 200 с закрытыми служебными разделами | Реестр для юридической идентичности; TG-поля/лицензия конкретного dataset не установлены |
| 2GIS | Официально demo ограничен сроком и квотами | Не подходит как основа постоянного «абсолютно бесплатно» |
| SearXNG self-host | Официальный search API существует; JSON зависит от конфигурации | Опционален только при имеющейся бесплатной инфраструктуре и допустимых upstream engines. Не развёрнут |
| Scrapling / Crawl4AI | Локальный benchmark, safety-аудит не пройден | Не нужен для проверенных статических карточек. Не использовать для обхода robots/403/CAPTCHA |
| Firecrawl / Jina | Исторический код сохранён; новая runtime-связка не использует | Ноль новых вызовов в этой сессии; Firecrawl production ещё требует отключения |
| Telegram по телефону | Bridge реально использует ResolvePhoneRequest, а не импорт адресной книги | Только публичный корпоративный мобильный с evidence; приватность может запретить resolution |

Контрольный публичный просмотр исчерпан: sitemap (1), category через старый ограниченный reader (1), category с увеличенным безопасным пределом (1), две карточки (2). HTML и реальные номера в репозиторий не сохранялись. Старый slug одной карточки отличался от текущего названия компании: slug — только retrieval hint, не identity proof.

Первичные источники: [top.uz robots](https://top.uz/robots.txt), [Golden Pages robots](https://www.goldenpages.uz/robots.txt), [Yellow Pages robots](https://www.yellowpages.uz/robots.txt), [Orginfo robots](https://orginfo.uz/robots.txt), [OLX robots](https://www.olx.uz/robots.txt), [госданные robots](https://data.egov.uz/robots.txt), [OSM website tags](https://wiki.openstreetmap.org/wiki/Contact%3Awebsite_/_website_/_url), [OSM attribution](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines).

[Telegram resolvePhone](https://core.telegram.org/method/contacts.resolvePhone) зависит от privacy; рекомендуется ограничивать вызовы максимум одним за 3 секунды. [Telegram privacy](https://core.telegram.org/api/privacy) не позволяет обещать разрешение любого номера. Текущий Bridge отвергает bot/deleted/non-user; может вернуть непрозрачный lrpeer handle вместо публичного username, TTL 24ч, cache bound 500. Нельзя отличить приватно скрытый номер от отсутствующего с гарантией.

[SearXNG API](https://docs.searxng.org/dev/search_api.html), [движки SearXNG](https://docs.searxng.org/dev/engines/engine_overview.html), [2GIS ключи и подписки](https://docs.2gis.com/en/platform-manager/subscription/keys), [Firecrawl search](https://docs.firecrawl.dev/api-reference/endpoint/search).

## 6. Ранжирование бесплатных связок

1. **OSM identity → собственный сайт → exact corporate Telegram/mobile → Bridge.** Максимальный приоритет точности; код собственных сайтов уже имеется. Без нового платного API. Наличие сайта сейчас 8,6 на 100 уникальных ключей; это не прогноз числа TG.
2. **Разрешённый нишевой каталог → точное совпадение компании и телефона/адреса → corporate mobile/TG → Bridge.** Основной путь для компаний без сайта. Начать со стоматологий top.uz, затем проверить clinics/yellowpages. Сохранённые пять source records четырёх company rows дали телефоны, ноль TG candidates; выборка слишком мала и не показывает число попыток.
3. **Собственный SearXNG → кандидат официального сайта → повторная проверка identity → путь 1.** Только если есть бесплатный ресурс для хостинга и допустимые upstream. Пока проект, не готовая интеграция. Не опираться на случайный public instance.

Ожидаемый corporate_verified/100 для каждой связки сейчас **неизвестен**. Единственный честный текущий общий показатель — 0 свежих strict / 267 ключей на baseline. Числа «20–40 Telegram на 100» не подтверждены и не используются.

Денежная стоимость нового provider route: $0 API. Полная себестоимость инфраструктуры и скорость не измерены. CPU парсера, бесплатные квоты Workers/D1, per-domain pacing и холодный кэш должны пройти пилот.

## 7. Bounded-пилот без отправок

После отдельного разрешения: 10–20 уникальных компаний одной выбранной ниши/города, без кампаний и сообщений. Предложение стартового сегмента — стоматологии Ташкента; владелец подтверждает приоритет.

До запуска фиксируются список ключей, разрешённые URL, robots/terms, максимальное число страниц, время и нулевой бюджет API. Утверждение пилота НЕ разрешает обход защиты или скрытые contact-reveal endpoints.

На каждом ключе записать обезличенные события:
found → identity_matched → public_source → candidate → company_ownership → bridge_resolved → fresh_corporate_verified.
Дополнительно: тип номера, причина исключения, requests/bytes, время первой находки, итоговая длительность, cache-hit, retries, D1 statements, provider_calls.

Не выбирать только уже успешные компании; отдельно стратифицировать «с сайтом», «только телефон», «без контактов». Один ключ — один знаменатель. Успехом считать fresh account-bound strict contact, не найденный username.

Acceptance:

- 0 платных вызовов и резервирований; 0 сообщений, кампаний и обходов robots.
- 0 неверных ownership в ручной проверке небольшой выборки (это проверка выборки, не гарантия глобальной precision 100%).
- Replay/restart не сбрасывает cursor и не дублирует evidence.
- Каждый отказ объясним; отсутствующий/закрытый TG не превращается в корпоративный.
- Измерить p50/p95 до первого контакта и до завершения; целевые SLO согласовать по замеру, не придумывать скорость заранее.
- Если один источник не даёт прироста verified, не расширять его обход ради красивого found count.

## 8. Дизайн интеграции и локальные проверки

Файлы реализации:

- functions/platform/lead-radar/free-acquisition.ts: единая жёсткая zero-paid граница, ключи Firecrawl/Jina не передаются в acquisition.
- workers/automation-worker.ts:684: free dependency вместо paid enrichment; остальные продукты/рассылка не переподключались.
- functions/platform/lead-radar/top-uz-discovery.ts: проверенный dentistry adapter, одна страница за доставку, максимум 40 страниц, до двух matching cards; URL/name index cache 15 минут, максимум 64 записи.
- functions/platform/lead-radar/contact-source-worker.ts:34: cached partial usable evidence пропускается в Bridge; unsupported/page-limit не удерживают resolver 48 часов; unavailable остаётся отдельным исходом.
- functions/platform/lead-radar/sources.ts:1548: default 450000 bytes, opt-in max 900000; DNS/URL checks сохранены; новые evidence callers запрещают redirects, чтобы не читать путь с непроверенной robots-политикой.
- functions/platform/lead-radar/store.ts:2005: queued и retry_wait budget-blocked jobs не блокируют refill.
- functions/platform/lead-radar/queue.ts:364,906: unreserve на ordinary failure, schema guard и watchdog touch вне горячего refreshSearchFunnel.
- functions/platform/lead-radar/ownership-confirmation.ts:16: endpoint-specific re-fetch, classification, deterministic upsert, current website/DNC check; повторный реальный review может освежить timestamp.
- functions/api/admin/lead-radar/audience-control.ts:35, src/admin/lib/api.ts:858, ContactCandidates.tsx:49: единый candidateKey от кнопки до сервера.

Новые миграции, production flags, binding и secrets не менялись. Старый paid-код/ledger не удалялся. Новая free-only политика намеренно не включается обратно старым env-флагом.

Ограничения реализации: кэш лишь внутри Worker isolate, не глобальный; глобальный domain throttle/дневная квота и общий индекс категорий пока не добавлены. Cold scans разных компаний могут повторяться; 40 страниц — ограничение, а не гарантия полного покрытия. Для других ниш нужна проверенная mapping/fixture. Восстановление отсутствующего website не реализовано.

Проверено локально:

| Проверка | Результат |
|---|---|
| TypeScript Lead Radar и полный functions config | PASS |
| Основная suite Lead Radar | 349 PASS |
| Campaign/audiences | 107 PASS |
| Исторические provider/reliability suites, только mocks | 103 PASS |
| Contacts до регистрации новых тестов | 106 PASS |
| Целевая выборка free acquisition / ownership / hardening / own-site / synthetic e2e / audit regressions | 27 PASS |
| ESLint всех изменённых runtime/test файлов | PASS |
| Основной Vite build + отдельный admin build | PASS; остаётся warning большого AdminRoot chunk |
| Contacts после регистрации новых тестов | 119 PASS |
| Secret scan | CLEAN, 4033 файла; финальный повтор после документации отражён в STATE |

Новый test:lead-radar-contacts включает free acquisition, free catalog и ownership tests. Suites пересекаются; складывать числа и называть сумму количеством уникальных тестов нельзя. Синтетический e2e с заглушкой отправки не означает реального Telegram canary.

Полный release gate/production acceptance не выполнялись. Рабочее дерево содержит предшествующие пользовательские изменения, поэтому «проверено на чистом checkout» не заявляется.

## 9. Роадмап по зависимостям

### A. Зафиксировать zero-paid релиз и снять остаток очереди — S/M

Цель: не тратить API-кредиты и не терять кандидатов. Root cause: legacy paid wiring, queued budget barriers, неполная ротация. Файлы: free-acquisition, contact-source-worker, top-uz-discovery, queue/store, ownership API/UI. Локальные изменения описаны выше.
Миграции: нет. Flags: не включать платные fallback; отдельно отключить текущий production Firecrawl после OK.
Тесты/local acceptance: типы, 27 targeted, D1 budget, общие suites, build, secret scan.
Production acceptance: после разрешённого выпуска сверить Pages manifest и Worker fingerprint; read-only проверить отсутствие роста paid ledger, старые stalled pools и reasons. Метрика: paid_calls=0, discovery cursor движется либо объяснимо завершён.
Rollback: согласованный известный артефакт; paid flag должен оставаться OFF даже при возврате старого кода. Риск: реальная yield/latency ещё не измерена. Owner input: разрешение Pages+Worker release и выключения Firecrawl. Зависимость: зелёная финальная локальная проверка.

### B. Измерить бесплатную контактную стратегию — M

Цель: получить реальные corporate contacts в нужной нише. Проблема: мало first-party evidence и неизвестен yield каталогов.
Файлы: top-uz-discovery.ts, public-contact-discovery.ts, contact-source-worker.ts; небольшой adapter-attempt журнал/агрегаты отдельно от горячего fanout.
Изменения: пилот §7; общий индекс/пейсинг по домену; bounded cursor; затем один проверенный дополнительный источник. Не добавлять все каталоги вслепую.
Миграции: не нужны для текущего cursor; новая telemetry schema — только после оценки бюджета и отдельного согласования production migration. Flags: default OFF для непроверенных адаптеров.
Тесты/local: fixtures изменённого DOM, robots denial, телефонный конфликт, bot footer, ретраи, квоты, restart. Production: только согласованный пилот, без отправок.
Метрики: verified/100, precision выборки, p50/p95, requests/company, free quotas. Rollback: выключить один адаптер, сохранить evidence/audit. Риск: низкое покрытие/лимиты источника. Owner input: ниша, город и лимит публичных страниц. Зависимость: A.

### C. Устранить потери из-за отсутствующих сайтов и TTL — M/L

Цель: контакты не исчезают неожиданно и компании без сайта получают шанс. Root cause: no_website и отсутствие управляемого refresh.
Файлы: official-domain-discovery.ts, sources.ts, contact-resolution.ts, contact-resolution-worker.ts, telegram-campaign.ts prepare, ownership UI.
Изменения: бесплатные website hints из подтверждённых entities → независимая domain/company binding; TTL recheck перед prepare, dedup per account/candidate, privacy-negative cooldown; ясные FOUND/VERIFIED/SEND READY.
Миграции: сначала использовать существующие jobs/checks; новые индексы только по плану query budget. Flags: bounded opt-in rollout.
Тесты: no_website→verified site, чужой домен, устаревший контакт, смена аккаунта, DNC, дневные лимиты. Local: никакое hint не становится fact без проверки. Production: pilot fresh contacts после TTL пересчитываются, не обходят consent.
Метрики: site coverage, expired count, strict count, false ownership. Rollback: отключить refresh/discovery без удаления checks. Риск: лишние Telegram lookup и утрата precision при слабой identity. Owner input: только ручные R4 review, когда автоматических доказательств недостаточно. Зависимость: B.

### D. Масштаб и наблюдаемость — M/L

Цель: предсказуемая работа при росте базы. Причины: LIMIT 5001/200, write-once health, silent catches, missing read-only effect reconciliation, unlimited repeated revival.
Файлы: recipient-directory.ts, audiences.ts, queue.ts, telegram-campaign-store.ts, gateway read-only ledger API, Bridge protocol.py.
Изменения: keyset pagination; cap/backoff детерминированных failures; heartbeat через read-only endpoint; UTF-16 в Bridge; сверка ambiguous без вызова send.
Миграции: возможны индексы/счётчики, отдельно согласовать. Flags: по одному feature gate.
Тесты/local: >5000 rows, multi-tenant paging, missing migration, exhausted free quota, gateway offline, ambiguous unknown, UTF-16 astral characters. Production: страницы не падают 422, статус offline честный, uncertain send не повторяется.
Метрики: D1 statements, queue oldest age, stale health, ambiguous age. Rollback: отключение отдельного gate, сохранение safety barriers. Риск: миграции и согласованность нескольких компонентов. Owner input: разрешение соответствующего релиза, не автоматическая отправка. Зависимость: A; pagination/telemetry полезны параллельно B/C.

### E. Контролируемый delivery canary — S, только после отдельного OK

Цель: проверить внешний эффект, а не увеличить рассылку. Сейчас отправок в этой сессии нет.
Файлы: существующие authorization/preflight/dispatch/Bridge цепочки; не переписывать безопасность.
Миграции: нет. Flags/limits: действующие 30/UTC-сутки и ≥120 секунд не повышать.
Тест/local: replay/concurrency/Pause/Stop зелёные. Production: сначала один согласованный получатель, допустимое основание и текст; отдельно проверить отсутствие дубля и ledger settlement.
Метрики: один ожидаемый provider effect, отсутствие повторов, объяснимый результат. Дальнейшие 3→10→30 — только после дополнительной приёмки, не автоматическое разрешение из этого документа.
Rollback: Stop/Pause без reset ledger. Риск: нежелательное реальное сообщение. Owner input: адресат, основание, текст и явное разрешение. Зависимости: свежий strict набор и A–C.

## 10. Definition of Done

- [x] Baseline сверён без чтения персональных строк и секретов.
- [x] Причины остановки очереди и ошибочного source outcome воспроизведены.
- [x] Локальный acquisition исключает платные provider calls.
- [x] Локальные tests сохраняют ownership, DNC, replay/Pause/Stop и D1 budget.
- [x] R4 не подтверждает inferred/unknown/чужие соседние endpoints.
- [ ] Реальные компании каждой нужной ниши/города проверены в пилоте.
- [ ] Измерены corporate_verified/100, precision и скорость по источникам.
- [ ] Есть доказанный управляемый refresh TTL.
- [ ] Missing website resolution и масштабная пагинация закрыты.
- [ ] Проверки выполнены на чистом релизном checkout; полный release gate зелёный.
- [ ] Production соответствует новому audited artifact и paid calls остановлены.
- [ ] Один внешний canary выполнен с отдельного разрешения.

«100%» не означает Telegram у каждой компании. Это воспроизводимая система, которая не включает непроверенные контакты в send-ready и честно объясняет отсутствие результата. В этой сессии полный DoD ещё не достигнут.

## 11. Действия только владельца

1. Разрешить выключение текущего Firecrawl в production — это отдельный шаг от локальной free-only защиты.
2. Разрешить выпуск проверенных изменений Pages + automation Worker. Gateway/Bridge обновление и миграции для этой партии не нужны.
3. Указать приоритетную нишу/город и разрешить bounded pilot с явным пределом страниц. Старый лимит в 5 запросов уже исчерпан.
4. При необходимости подтвердить конкретный корпоративный endpoint в карточке после просмотра источника. Это не разрешение на рекламу.
5. Canary — отдельное решение с конкретным получателем и основанием; сейчас не выполнять.

## 12. Что не трогать и как продолжать

Не отправлять сообщения, не создавать кампании, не импортировать телефонную книгу, не обходить privacy/robots/CAPTCHA, не очищать ledger/vault/history, не менять сессию и не увеличивать лимиты рассылки. Не применять миграции и не включать paid fallback автоматически.

Не выкладывать benchmark Scrapling runner как production-ready. Не запускать сохранённый live-look.ts повторно без нового разрешения; он дополнительно требует явный CLI guard. Не выполнять release:lead-radar как безобидную диагностику: сценарий содержит --execute.

Предшествующие изменения AGENTS.md, STATE.md, HANDOFF.md, .kimi-code, .serena и других пользовательских файлов сохранены. Публичная SEO-часть сайта не редактировалась. Старые optimistic checkpoints в STATE исторические; актуальные измерения этого отчёта имеют приоритет.

Следующий безопасный шаг — разрешённый zero-paid release, затем небольшой измеримый пилот. До этого нельзя обещать ни рост production-выдачи, ни «всё уже работает бесплатно».
