# R1/R2: product truth repair

Дата: 08.10.2026. Изменения только локальные, без deployment и без запросов генерации или оплаты.

## Что исправлено

- Обе chat страницы: description, ogDescription, hero и условия согласованы с тремя успешными пробными ответами всего. Убраны старые ежедневные/почасовые обещания и ошибочное описание общего IP как основного trial quota. Указаны связь с браузером/аккаунтом, отсутствие обновления при смене дня, чата и языка и AI-пакет после trial.
- UZ manual: исправлены body и оба FAQ, а не только найденный ранее FAQ. Платные условия 300 ответов на месяц, до 50 в день и опубликованная цена не менялись.
- Referat и résumé: trial условия исправлены; отрицание экспорта файла ограничено конкретным документом Word/PDF/резюме, чтобы не отрицать существующий PPTX режим.
- Обе chat страницы и llms: обычные ответы остаются текстом; отдельный режим презентаций экспортирует PPTX и использует собственные лимиты и пакеты. Нет обещания, что каждый ответ чата создаёт файл или что chat pack включает Studio.
- SoftwareApplication Offer: нулевая цена сохранена для доступного бесплатного trial; name и description теперь явно раскрывают его объём и отсутствие ежедневного обновления. Schema совпадает с видимыми условиями.
- `intent-manifest.json`: исправлены только описания A5/C34. Сохранились URL, canonical, keyword ownership, решение A5 и C22 FINAL. Старая граница «чат не создаёт PPTX» заменена разделением обычного чата и режима презентаций.
- Из llms удалено недатированное утверждение, что перечисленные UZ статьи приносят большинство органического трафика. Это не текущий факт аналитики.

Title, H1, primary/secondary keywords, canonical/hreflang, internalLinks и ограничения backend не менялись. `lastReviewedAt` оставлен прежним: узкая проверка собственных продуктовых условий не означает полную повторную проверку всех внешних OpenAI утверждений. `updatedAt`/`dateModified` изменённых документов установлены на 08.10.2026. Родительская задача отвечает за новую reviewed SEO revision и общий build.

## Проверенное основание

- `functions/lib/gpt-chat/trial-store.ts`: FREE_TRIAL_LIMIT = 3, успешный settle учитывается один раз, resets = never, browser/account history.
- `functions/lib/gpt-chat/turn-store.ts`: lifetime allowance заменяет legacy 15/day и 5/hour; backend здесь не менялся.
- `src/gpt-chat/components/AiChatConsole.tsx`: presentation intent открывает отдельную рабочую область.
- `src/gpt-chat/parts/PresentationWorkspace.tsx`: генерация/скачивание PPTX и отдельные Studio offers.
- Предыдущий production audit подтвердил размещение нового trial/workspace; в рамках этих правок реальные платные операции не выполнялись.

## Проверки

`NODE_OPTIONS=--max-old-space-size=512 node --import tsx --test tests/seo-trial-product-truth.test.ts` — **3/3 PASS**.

`tests/seo-intent-manifest.test.ts` — **5/5 PASS**. `git diff --check` для назначенных content/llms/manifest файлов — без ошибок; Git только сообщил об ожидаемой нормализации LF/CRLF.

Guards проверяют реальные ошибки публикации: раскрытие лимита в snippets и нулевом Offer, отсутствие daily/hourly/shared-IP trial обещаний в двух чатах и трёх guides, отсутствие no-PPTX противоречий и явное разделение квот. Все изменённые JSON успешно разобраны при записи. Остальные интегрированные проверки выполняет основная задача по одному процессу из-за ограниченной RAM.

Исторический `tests/seo-push-revision.test.ts` содержит точное сравнение со старым «Kunlik limit bilan»; его обновление согласовано с родительской задачей, поскольку оно связано с reviewed revision, а не с текущим продуктовым поведением. Baselines и protection comparator этой веткой не изменялись.

## Приёмка и откат

До релиза: production build, raw/render/Markdown/FAQ/schema parity, отсутствие новых 404 и сохранение владельцев запросов, fresh/exhausted/paid fixtures без реальной генерации/оплаты. Обновлённые descriptions и schema двух protected chats должны попасть в новую reviewed revision с явным before/after.

Откат — только формулировки или оформление конкретной правки с сохранением правды о трёх trial ответах и PPTX; возврат старых ложных 15/day или no-PPTX обещаний недопустим. Изменений trial, billing, квот или Studio logic здесь нет.

Влияние на поиск пока не измерено. После отдельно разрешённого релиза нужны подтверждённый recrawl и завершённые окна 7/14/28 дней, CTR/позиции фиксированной когорты и полезные действия organic visitors. Рост или top-1 этой правкой не гарантируются.
