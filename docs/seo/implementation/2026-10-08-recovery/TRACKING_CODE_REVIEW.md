# Tracking pipeline — независимая проверка кода

8 октября 2026. Read-only review существующего кода и истории, без вызовов реальной аналитики, редактирования GTM/GA4, synthetic hits в production или изменения рекламных кабинетов. Данные GA4, прочитанные другими участниками, здесь не выдаются за собственный API readback.

## Что подтверждено до исправления analytics boundary

1. `src/gpt-chat/analytics.ts`: whitelist допускал bare `source`; scalar value без преобразования передавалось в `gtag('event', …)` либо в `dataLayer`. `AiChatConsole.tsx` передаёт в него `composer`, `template`, `retry`, `answer_action`. Это контекст интерфейса, а не источник привлечения. Следовательно, такой параметр следует переименовать на границе GA4, сохранив backend domain field и caller contract.
2. `scripts/chat-entry-cta.ts` использовал bare `source` для пути исходной статьи. Это такая же семантическая коллизия; корректное отдельное имя — `entry_path`.
3. Такой же риск есть в `src/lib/cta.ts`: произвольный `data` forwarding в Google route; React компоненты передают `source: offer/demo_block/solution`. `apps/studio/src/analytics.ts` допускает `source`, а `resultReady` использует `free/paid`. Это также продуктовая metadata, а не traffic source.
4. Google route в chat, Studio и homepage helpers выбирает `gtag` **или** `dataLayer`, не оба одновременно. Случай «один helper шлёт две Google copies одного event» в текущем коде не подтверждён. Наличие GTM и отдельного gtag loader на homepage ещё не доказывает отсутствие/наличие второго Google tag внутри опубликованного GTM container.

Это подтверждённые проблемы именования и изоляции параметров. Без network payload, GTM mapping и согласованной GA4 выборки нельзя заявить, что одна из них доказанно создала **Cross-network**, либо что rename исправит уже записанную историю.

## URL campaign parameters и first/last touch

| Код | Фактическое поведение | Значение для диагноза |
|---|---|---|
| `scripts/analytics-snippet.ts`, inline gtag в `index.html` | `gtag('config', 'G-V87YFL96C7')`; нет явного `campaign_source`/`campaign_medium` override | В этих bootstrap blocks не найдено назначения органике рекламного источника |
| `scripts/attribution-snippet.ts` и его homepage copy | Один first-touch в localStorage: UTM + gclid/yclid/fbclid, без network и без перезаписи уже сохранённого first-touch | Этот record сам не отправляет acquisition в GA4; отсутствие gbraid/wbraid здесь — отдельное ограничение lead attribution |
| `apps/studio/src/attribution.ts` | gclid/gbraid/wbraid/yclid считываются из настоящего URL; paid medium тоже принимается. Last touch хранится 90 дней и передаётся с deliberate checkout | Не создаёт click ID, не пишет gtag/config, не доказывает покупку рекламы владельцем |
| `scripts/analytics-metrika.ts` | Sanitized URL с UTM/gclid/yclid передаётся только в Metrika; не заменяет адресную строку | Не обнаружено удаления Google parameters до чтения gtag |
| `functions/index.ts`, existing `?lang` branch в middleware | При `?lang` canonical redirect собирается без прочих query parameters | Может терять campaign tags на таких старых URL; механизм старый, не объясняет появление Cross-network и в текущей задаче не менялся |

Поиск по `src`, `scripts`, `apps/studio/src` и `functions` не выявил присваивания `campaign_source`, `campaign_medium`, `campaign_name` либо строки `cross-network` в telemetry pipeline. Это ограниченная проверка репозитория: remote GTM container, GA4 event modifications, linked accounts, импорт данных и внешние Measurement Protocol senders в неё не входят.

Из истории: bare `source` в chat analytics существовал и до ревизии `6d69b68d` от 1 октября; та ревизия переименовала/расширила whitelist, а не впервые ввела все такие параметры. Последующие изменения 7–8 октября добавляли Meta tracking/workspace. Только совпадением дат нельзя приписать этим изменениям историческую классификацию канала.

## Что нужно для точного вывода о Cross-network

Сверить **одинаковый scope**: `sessionDefaultChannelGroup` против `sessionPrimaryChannelGroup`, `sessionSourceMedium`, `sessionSourcePlatform`, campaign и доступный Google Ads ad network/campaign type, hostname, даты. Если пользователь показывает primary/custom channel group, его правила не равны штатному default channel group. Проверить текущий опубликованный GTM container и GA4 event modifications read-only; account-level изменения без отдельного поручения не выполнять.

[Google описывает default Cross-network через source platform и ad network/campaign type](https://support.google.com/analytics/answer/9756891?hl=en), а [custom/primary channel groups могут иметь собственные правила](https://support.google.com/analytics/answer/13051316?hl=en). Эти документы объясняют классификатор, но **не доказывают, что владелец запускал рекламу**. Кодом не подтверждено преобразование organic visits в Cross-network. Различие UA/GA4 channel label и факт трафика из поиска необходимо проверять по GSC и acquisition data отдельно.

После исправления проверять исходящие synthetic event payloads: `ui_source`/`entry_path` есть, bare `source` отсутствует; backend order/lead source и настоящие UTM/click IDs сохранены; event names и paid consent/order semantics прежние. После публикации — наблюдать только новые события и созревшие окна, не обещать перепись исторической GA4 атрибуции.

## Review подготовленного исправления

Независимо прочитан diff `src/gpt-chat/analytics.ts`, `scripts/chat-entry-cta.ts`, `apps/studio/src/analytics.ts`, `src/lib/cta.ts` и новый `tests/ga4-attribution-boundary.test.ts`. Блокирующих замечаний к изменению границы не найдено: chat/Studio legacy source принимает прежний caller, но Google output получает `ui_source`; article output использует только `location.pathname` в `entry_path`; homepage преобразует копию Google payload, сохраняя оригинальные данные для Meta. Backend поля source, event names и URL campaign values не редактируются.

Существующие whitelist, scalar и Studio length limits сохранены. В обеих ветках `gtag`/`dataLayer` продолжается ровно одна отправка. Проверка не означает readback события из настоящего GA4 и не закрывает вопрос о причине исторического Cross-network. Исполненные tests и интеграционная сборка фиксируются владельцем analytics patch и основной задачей.
