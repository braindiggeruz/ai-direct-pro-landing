# Cross-network: что произошло и что исправлено

Проверка 08.10.2026, данные сохранены к 18:12 Asia/Karachi. Владелец уточнил, что видел Cross-network и без запущенной рекламы. Мы не считаем этот ярлык доказательством рекламного источника и не делаем вывод об остановке Google Ads.

## Основной вывод

**В текущем экспорте вчерашние 178 Cross-network sessions имеют точную комбинацию служебных значений: source/medium = `(data not available)`, campaign = `(cross-network)`.** Google использует такую комбинацию, когда атрибуция недоступна или ещё не обработана при наличии рекламного идентификатора либо любого UTM-параметра. UTM бывает у нерекламных ссылок. Поэтому падение этой строки до нуля само по себе не доказывает исчезновение посетителей или органического трафика. [Объяснение Google](https://support.google.com/analytics/answer/15509398?hl=en).

Это сильное объяснение **природы наблюдаемой строки**, но не полный ответ о динамике пользователей сегодня. По скриншоту владельца за неполный день показаны 72 новых пользователя: Paid Social 47, Organic Search 20, Direct 4, Paid Other 1. Свежий API не воспроизводит этот срез: OpenSEO не допускает текущий день, а first-user channel/hour в доступной схеме отсутствуют. Подменять этот скриншот вчерашними session-метриками нельзя.

**Отдельно найден и локально исправлен реальный риск загрязнения атрибуции:** в GA4 источники уже содержат внутренние значения интерфейса `composer`, `answer_action` и пути собственных статей. В коде эти же значения отправлялись как параметр `source`. Теперь на границе Google analytics они называются `ui_source` и `entry_path`. Это не заявлено доказанной причиной Cross-network = 0 и не превращает пропавший канал в органику задним числом.

## Источник и покрытие

- OpenSEO project: `7534113b-f748-4f98-ac39-9e3782d3d9e7`, domain `gptbot.uz`.
- Независимо прочитан GA4 Admin: property `540129731` / GPTBOTUZ, web stream `14999373353`, measurement ID `G-V87YFL96C7`, URI `https://gptbot.uz/`. Создание stream — 03.06.2026.
- Reporting timezone GA4: **Asia/Tashkent (UTC+5)**, тот же текущий сдвиг, что Asia/Karachi. Это не Pacific calendar GSC.
- Проверены session channel, session source/medium, session campaign, new/returning, настройки web stream/key events; история с 03.06 по 07.10, отдельные дневные channel-запросы 25.09–07.10.
- Во всех успешных acquisition ответах: `hasMore=false`, rowCount равен totalRowCount, sampling пустой, subjectToThresholding=false. Нулевые строки отсутствующего канала в таблице ниже означают отсутствие строки в полном отчёте, не отсутствие всех посетителей.
- Запрос 08.10→08.10 отвергнут: `The resolved startDate is after the last complete Analytics day`. Запрос до 08.10 автоматически ограничен 07.10. Фраза инструмента «complete day» означает разрешённый календарный день, не гарантированную зрелость всей атрибуции.
- GSC Wizard видит саму GA4 property, но текущий аккаунт connector не связал её со `sc-domain:gptbot.uz`: `notConfigured/no_property`. Настройки не менялись.
- Эти GA4/Admin чтения по схемам OpenSEO **не расходуют credits**. Платного keyword/competitor research в этой ветке не было.
- [Полный журнал 31 вызова](RAW/ga4-tool-ledger.json): 28 успешных, 1 отказ инструмента на текущую дату, 2 ответа Wizard `no_property`. Записаны фактические arguments, row counts, pagination, returned quota/metadata и время сохранения ответа. Точное время каждого вызова, creditsCharged и runId сервер не вернул; они не выдуманы.

## Завершённая календарная история, session scope

| Период | Cross-network sessions | Organic Search sessions | Значение |
|---|---:|---:|---|
| 03–30.06 | 1 | 9 | Единственная историческая строка тоже имеет placeholder source/campaign |
| 01–31.07 | 0 | 80 | Cross-network строки нет |
| 01–31.08 | 0 | 438 | Cross-network строки нет |
| 01–24.09 | 0 | 1 284 | Cross-network строки нет |
| 25.09–06.10 | 0 | 797 | Cross-network строки нет во всех 12 дневных ответах |
| 07.10 | 178 | 27 | Очень свежая attribution; Cross-network 176 active users, 0 engaged sessions |

Источники: [сводка и ограничения](RAW/ga4-analysis.json), [дневные channels CSV](RAW/ga4-daily-channels.csv), [история 03.06–24.09](RAW/ga4-history-channel.json), [июнь](RAW/ga4-june.json), [июль](RAW/ga4-july.json), [август](RAW/ga4-august.json), [сентябрь](RAW/ga4-september-early.json), [25.09–06.10](RAW/ga4-traffic-mature-channel.json), [07.10](RAW/ga4-traffic-yesterday-channel.json).

Текущее обработанное session-распределение не воспроизводит прежнее наблюдение «больше половины». Это **не опровергает** наблюдение владельца: прежний отчёт мог иметь другой scope, свежесть и диапазон. Старый снимок first-user/intraday распределения этим API не восстанавливается. Нельзя придумывать, что предыдущая половина была PMax или что владелец смотрел другой сайт.

За 07.10 есть и 196 Unassigned sessions при 1 engaged session; Organic Search — 27 sessions при 1 engaged. За 06.10 Organic Search = 83 sessions / 50 engaged. Столь свежий однодневный провал engagement сразу во многих каналах — причина проверить обработку и события, а не доказательство SEO-падения. Числа new/returning также не равны `newUsers × firstUserDefaultChannelGroup`: инструмент вернул `activeUsers` по `newVsReturning`.

Google допускает обработку в течение 24–48 часов и различия между intraday/daily отчётами. При этом позднее перераспределение event-level не означает обещания переписать user/session-level placeholders. Не обещаем, что именно эти 178 сессий завтра автоматически станут Organic Search или Paid Social. [Свежесть данных](https://support.google.com/analytics/answer/11198161?hl=en), [scope источников](https://support.google.com/analytics/answer/11080067?hl=en), [placeholder caveat](https://support.google.com/analytics/answer/15509398?hl=en).

## Подтверждённая проблема именования telemetry

В [session source/medium за 25.09–07.10](RAW/ga4-traffic-window-source.json):

| Внутреннее значение в источнике трафика | Sessions |
|---|---:|
| `composer / (not set)` | 30 |
| `composer / ` | 11 |
| `composer / (none)` | 5 |
| `answer_action / (not set)` | 1 |
| Пути собственных RU/UZ статей с пустым medium | 6 |
| **Сумма этих строк** | **53** |

Похожие значения есть ещё в истории до 25.09, поэтому дефект не следует автоматически приписывать релизу trial/PPTX 08.10. В коде `AiChatConsole` передаёт `source: composer/template/retry/answer_action`, а `CHAT_ENTRY_TRACKING` передавал `source: location.pathname`. Chat helper разрешал `source` без переименования. Полный network-level replay отправки в GA4 не выполнялся; причинный механизм именно переатрибуции не заявлен лабораторно доказанным. Однако внутренние значения уже наблюдаются в атрибуционных dimensions и не должны использовать одно имя с источником трафика.

### Локальная правка

| Файл | Изменение | Что сохранено |
|---|---|---|
| `src/gpt-chat/analytics.ts` | Принимает legacy `source`, отправляет в GA4/dataLayer как `ui_source` | Caller/API/backend payload, event names, privacy allowlist, once semantics |
| `scripts/chat-entry-cta.ts` | Путь статьи отправляется как `entry_path` | intent, surface, locale, один event, отсутствие query/PII |
| `apps/studio/src/analytics.ts` | Free/paid `source` → `ui_source` только в Google cleaner | Server funnel detail и Metrika goal; ограничение строк/скаляров |
| `src/lib/cta.ts` | Google получает копию с `ui_source` | Meta получает исходные данные; UTM/gclid в исходном потоке не удаляются |

Никакие GA4 settings, Google Ads links/budgets, campaign states, cookies, consent, backend attribution storage, платежи или реальные leads не изменялись. Релиз не выполнен. Backend first-touch собирает UTM/gclid отдельно; эта правка его не касается. Реальные marketing identifiers не переименованы в UI labels.

Проверки: `tests/ga4-attribution-boundary.test.ts` **5/5**, `tests/cta-analytics.test.ts` **7/7**, `tests/studio-analytics.test.ts` **10/10**. Проверяются оба пути gtag/dataLayer, один event, отсутствие `source`, сохранение UTM/gclid и Meta оригинала, backend `studio_result_ready/detail=free`, фильтрация private/нестандартных данных. В существующем chat honesty test ожидаемое выходное имя заменено на `ui_source`. Независимый code review технического агента не нашёл блокирующих замечаний. Интегрированный build/typecheck выполняет основная задача.

## Что требуется для окончательного ответа про сегодня

1. В GA4 UI либо Data API с произвольными dimensions прочитать **тот же** `newUsers × firstUserDefaultChannelGroup` и `sessions × sessionDefaultChannelGroup` за 08.10, раздельно. Добавить first/session source/medium и campaign; не смешивать метрики между таблицами.
2. Сопоставить 08.10 и 07.10 по одинаковому часовому cutoff в Asia/Tashkent. Текущие OpenSEO инструменты не принимают hour; сегодняшнее число не сравнивать с полным вчерашним днём.
3. Проверить landing pages и source для placeholder-посетителей через один совместимый отчёт, а не склеивать несвязанные aggregate строки. Нужен referrer/page_location в безопасном агрегированном виде, без пользовательских запросов и идентификаторов.
4. Через 24–48 часов заново прочитать 07–08.10 и отдельно последние зрелые 7/14 дней. Это план верификации, не созданная автоматизация и не обещание изменения уже записанных session values.
5. После разрешённого релиза доказать в офлайн/заблокированном collect fixture, что UI events больше не отправляют `source`; затем проверить уменьшение новых `composer`/article-path строк. Историю этим кодом не переписать. Нельзя вручную переименовать весь Cross-network в Organic Search.

GA4 measurement health нашёл 1 web stream, 4 key events и 0 issues в **своём ограниченном покрытии**. Это не проверка рекламных links, event modification rules, фильтров, одинакового user_id у всех посетителей или полного delivery pipeline. Ads связь, first-user scope, сегодняшние почасовые данные и реальная величина потери посетителей пока остаются неизвестными.

Откат кода: отдельный analytics patch; предпочтительна правка dashboard/mapping под новые безопасные имена. Возврат `source` для внутренних UI labels восстановит риск загрязнения. Эта техническая правка не является SEO-экспериментом и не гарантирует рост трафика.
