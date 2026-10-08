# HANDOFF — production trial 3 / Studio · 08.10.2026

## 1. Состояние
Checkout `F:/Claude/gptbot-codex-integration-20261007`, branch `codex/continuation-20261007`. По прямой команде владельца production `edbf3d7385776ea7a06532c86e406e2759072013`, предыдущий `c4cd8c701d383f1139486c91b30cd5c2bf7f46e2`. `STATE.last_commit` — опубликованный SHA; metadata record определяется `state_commit=HEAD`, рекурсивно SHA не править.

## 2. Что сделано
Последняя runtime правка для legacy cache подготовлена: server-confirmed trial заменяет cached hourly/daily блокировки. Финальный выпуск этой правки пока pending.

Guarded deploy 1002 файлов, exact manifest readback. Реальная проба: 3 Z.ai ответа, баннер после третьего, четвёртый 429/trial, refresh/locale без сброса. Новые workspace/Studio offers/owner report опубликованы.

## 3. Изменённые файлы
Runtime: `src/gpt-chat/limit-state.ts`; regression: `tests/gpt-lifetime-trial.test.ts`, `tests/chat-trial-browser.test.ts`. Также операции D1/Pages, production report/скриншоты, STATE/HANDOFF/PROJECT_STATE/implementation/roadmap. Ранее code `662eab25`, trial `485ca4e7`, metadata release `edbf3d7385776ea7a06532c86e406e2759072013`. Protected webhook и secrets не переписывались.

## 4. Архитектурные решения
Прежний runtime/controller/billing/ledger. Серверный lifetime=3 важнее legacy freeLimits 15/5. Миграция 0078 строго отдельно от других migrations; backup до операций. Денежный paid/readback не заменяется клиентским событием.

## 5. Что не подтверждено
Реальная покупка Studio/возврат/receipt в этом probe не выполнялись. Click -12 и внешний чек остаются открытыми. Окупаемость не измерена. Preview-only вместо free PPTX не внедрён.

## 6. Проверки
Production build/stamp/guard были PASS; artifact `71c67c6f2e85a0854da69be1ac933e3a7e75fa31bc78afdd8b3f41210a3f578e` неизменен, 1002 файлов. Live browser real 3 replies + fourth 429, dismiss/reload/locale, 0 JS errors. Studio RU1366/UZ390 server config, selected plan, real canvas/palettes, no overflow, no AI/order on selection PASS. 10 live protected SEO PASS после декодирования CF email protection, исходный baseline не менялся. 47 local regression + trial browser PASS; предыдущие 233 regression / 446 layout / 8 presentation сценариев сохранены. Evidence `reports/chat-trial-production-20261008/`.

## 7. Известные проблемы
Click fiscal: прежний read-only snapshot одного live paid chat заказа с payment_id:click_-12, без собственного submit ack; нужен Merchant readback, не придумывать смысл кода. Backup содержит историческое CHECK предупреждение в lead_radar_signal_posts; migration не изменила его. Temporary export link случайно попала в служебный вывод, из локального лога удалена, не в Git; expires 06:43:04Z. Backup ACL restricted. Старые FAIL probe сохранены приватно; последние real PASS не fixtures.

## 8. Следующая задача
Сначала завершить cache fix: свежий built browser, guarded выпуск и real live readback. Затем —

Внешняя денежная приёмка: readback Click payment/существующего чека, затем реальная контрольная покупка Studio и доставка результата по действующему billing, с подтверждённым receipt.

## 9. Acceptance criteria
Провайдер paid → действующие права → один явный full job → PPTX; refund отдельно; receipt URL и ОФД readback. Нет повторной продажи/двойного чека. Нельзя объявлять это пройденным по готовности конфигурации.

## 10. Команды для старта
Git status/log, STATE/HANDOFF и production.json. Сайт current API: `/api/gpt/account`, `/api/studio/config`. Guard only `DR_ROOT=F:/Claude/gptbot-codex-integration-20261007` / `python F:/Claude/gptbot-tools/deploy_runner.py check|deploy`, по команде. Для нового release stamp требуется актуальный HEAD; не путать последующий metadata SHA с опубликованным.

## 11. Риски
Anonymous identity ограничена браузером/cookie, не человеком после очистки/другого устройства. Не очищать cookie для обновления UI. AI estimate не фактический счёт, ROI не доказан. Legacy backup CHECK не исправлять в этом этапе. Secret/backup URL/тексты пользователей не копировать в Git/вывод.

## 12. Rollback
Прежний runtime через guarded release по команде; сохранять used trial/0078. Не делать полный D1 restore без сверки поступлений после backup. Private backup SHA `dd3bc556bf0823be022be427f68c4f34dfe5ff11cf2cc2d73e0bfd32a0d1836f` проверен; файлы вне Git. Никакого reset/clean/force push и удаления чужой работы.
