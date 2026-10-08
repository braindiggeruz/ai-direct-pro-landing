# HANDOFF — Studio: монетизация в основном чате, 08.10.2026

## 1. Состояние
Checkout `F:/Claude/gptbot-codex-integration-20261007`, branch `codex/continuation-20261007`, исходный HEAD `321f149b`. Владелец поручил реализовать `MONETIZATION_ROADMAP_20261008.md`. Код готовится локально; публикация и production migration в этом этапе не выполняются. Точный code SHA — `STATE.json.last_commit` после D-006 metadata relay.

## 2. Что сделано
В основной чат добавлено сравнение free/full из server config и предложение после бесплатного результата. Для одной задачи первым Kunlik; повторные документы, включая восстановленную историю, рекомендуют Oylik. Выбор сразу открывает существующий Checkout с нужным планом. Пример настоящей геометрии SlideCanvas с палитрами/заметками не вызывает AI. Бесплатный PPTX, правки, сохранение перед кассой и явное подтверждение полной генерации сохранены.
Owner-only отчёт показывает воронку, реальные платежи/возвраты, источники, генерации и оценку AI; расходы и курс вводит владелец. Диагностика очереди чеков и контекстные алерты добавлены без изменения фискальных статусов.

## 3. Изменённые файлы
`src/gpt-chat/parts/StudioOffer*`, `studio-offer*`, Workspace/Sheets/Host и небольшой Console/answer-part cleanup; `apps/studio/src/analytics.ts`, `api.ts`, `functions/lib/studio/events.ts`; `functions/lib/studio/monetization-store.ts`, `functions/api/admin/ai-chat/studio.ts`, `src/shared/studio-admin.ts`, admin AiChat/View/API/Card; `fiscal-health-store.ts`, alert-policy и billing-maintenance-store. Тесты, package scripts, документы и текущие безопасные отчёты. См. diff feature commit; защищённый Telegram webhook не менялся.

## 4. Архитектурные решения
Используются прежние controller, billing runtime, unit ledger, кассы и PPTX renderer. Цены/квоты определяет сервер. Дополнительный UI/CSS ленивый; caps не подняты. Необязательная классификация бизнес-предложения переиспользует lazy answer part и не задерживает AI-запрос. SQL только в store, с org isolation, без runtime schema mutation. Деньги по датам операции, источники по когорте создания; клик не подменяет paid или delivery. D-CHAT-006 фиксирует выбор тарифов и границы доказательств.

## 5. Что сознательно не сделано
Нет новой архитектуры, отдельного генератора, новой кассы, автопокупки/генерации, закрытия бесплатного PPTX или выдуманной скидки. Preview-only — отдельное невнедрённое решение. Production D1/secret/кассы не менялись, Submit/платёж/Telegram вручную не вызывались. Claude-реконструкция не повторялась. P4 не объявлена пройденной по offline fixtures.

## 6. Проверки
Актуальная точная квитанция — `reports/studio-monetization-20261008/verification.json`. Новые SQLite/API тесты проверяют auth, org isolation, фактическую сумму, даты возврата, test/owner-test, privacy, read-only/schema failure, parts delivery и расходы. Браузер — actual dist RU/UZ на 320/360/390/1366, реальные PPTX ZIP/notes, mocked Click/Payme, явные права/запуски, сохранённые правки и обычный чат после смены языка. Финальные typecheck/lint/secret/bundle/SEO/build/guard результаты сохраняются по выполнении. Pre-commit stamp с dirty runtime ожидаемо запрещён. Ранние FAIL относятся к найденным UI/source-contract/helper проблемам; evidence не удалять.

## 7. Известные проблемы
Read-only production доказал один live paid заказ **чата**, `payment_id:click_-12`, 8 попыток; нет payment/operation ID и submit acknowledgement. Это поиск платежа до собственного submit. Внешний чек Click остаётся UNKNOWN; значение `-12` без первичного Merchant ответа не интерпретировать. Secret values Cloudflare не возвращает, локальный Merchant read-профиль не найден. Поддержке Click подготовлен точный текст в implementation doc. Нельзя закрыть очередь или повторить чек вслепую. Старый редкий CLS риск сохраняется до актуальной проверки; старые FAIL не удалять.

## 8. Следующая задача
Продолжить только внешнюю приёмку: получить Merchant readback/подтверждение Click по платёжному ID, причине `-12` и существующему чеку. Затем исправить доказанную причину через прежнюю очередь и проверить ОФД. После команды выпуска — production сверка/backup/migration 0078/guarded deploy. Новую реализацию чата/Studio не повторять.

## 9. Acceptance criteria следующего этапа
0078 сверена и применена безопасно до нового runtime; действующие trial/account/paid права сохраняются. Live три пробных ответа и четвёртый без AI; реальные Click/Payme purchase → права → один явный full job → PPTX. Отдельно refund и настоящий receipt URL/readback. Денежный результат не доказывается HTTP200, health, браузерным event или mock.

## 10. Команды для старта
`git status --short`, `git log -5 --oneline`, STATE/HANDOFF и текущий verification.json. `npm run test:studio-monetization`; actual-build browser — `npm run test:studio-monetization:browser`. Browser report override `GPTBOT_BROWSER_REPORT_DIR` сохраняет предыдущие evidence. Для выпуска `NODE_OPTIONS=--max-old-space-size=1400`, `npm run build:production`; затем `DR_ROOT=F:/Claude/gptbot-codex-integration-20261007` и только `python F:/Claude/gptbot-tools/deploy_runner.py check|deploy` по команде. Тяжёлые build/tsc/browser выполнять последовательно.

## 11. Риски
Анонимная проба ограничена браузером/cookie, очищенный браузер и другое устройство не доказывают того же человека; fingerprint не добавлять. Месячная цена за единицу условна всеми 10, не фактическая скидка. Стоимость AI — оценка, комиссия/реклама неизвестны без ввода. Browser view не равен человеку или покупке. Реальная фискализация Click остаётся внешним незакрытым шагом. SEO/ROI/Google индексация не гарантируются по локальным тестам. Новые UI — lazy, budget gate обязателен.

## 12. Rollback
Отменять только собственный feature commit через `git revert` с сохранением чужой работы. Предыдущие trial `485ca4e7`, workspace `43260840`, исходный `321f149b` и опубликованный `c4cd8c70` сохранены в истории. Новые события не требуют DDL. Не удалять аддитивную trial table/column/trigger и не обнулять usage. Фискальные данные не менять при rollback UI; прежнюю production сборку восстанавливать только guarded release по команде.
