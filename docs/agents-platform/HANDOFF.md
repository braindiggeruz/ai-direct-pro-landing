# Передача GPTBot.uz: Payme опубликован, roadmap презентаций в чате подготовлен

## 1. Состояние
Production source 96d2b8b7e8ee49df575a61cb58266b50f82b802e, deployment https://ecaee3bc.ai-direct-pro-landing.pages.dev. Payme рядом с Click опубликован для чата и обоих тарифов Studio. Последний запрос владельца — архитектурный roadmap презентаций внутри основного чата; код этого нового направления не менялся.

## 2. Что сделано
Payme live в двух формах config; Studio click,payme. Проверены callback keys, суммы и фискальные параметры, один собственный pending chat invoice/idempotency/отрицательные проверки. Подготовлен CHAT_STUDIO_ROADMAP_20261007.md: shared engine, typed tool-card, lazy loading, история/identity, inline purchase/return, контекстная воронка, новый совместный пакет отдельным этапом.

## 3. Изменённые файлы
Source release: wrangler.toml и 3 config/readiness/parity tests, PAYME-RU runbook/документация. Финальная документация: PAYME_ACTIVATION_20261007.md, payme receipt, CHAT_STUDIO_ROADMAP_20261007.md, PROJECT_STATE.md, STATE.json и эта передача. Docs-only commit не требует нового deploy.

## 4. Архитектурные решения
Новый backend для встроенных презентаций не нужен. Переиспользовать Studio flow/API/ledger/Preview/PPTX. SSE чата и JSON flow Studio остаются разными. Сначала единая поверхность с существующими правами; объединённый SKU/аккаунт требует отдельного проверенного изменения. Старые покупки неизменны.

## 5. Что сознательно не сделано
Реальная карточная оплата/возврат/чек, фиктивный production PerformTransaction, создание новых Studio invoices или обход Turnstile. Код интеграции в чат, новые цены/состав,15 слайдов/фото не выпускались: пользователь сейчас попросил roadmap.

## 6. Проверки
166 targeted PASS,13 built/release PASS,4 исторических skip; full typecheck/scope lint/build/check/deploy0. Exact live manifest/JS probes совпали.984 dist files: изменился только marker. Public click,payme для обоих продуктов,20 000/5 900/39 900,12 slides/photo off/оферта v5. RU/UZ chat и Kunlik/Oylik UI при360×740; Payme выбирается. Chat pending: allow=true/detail корректны; неверная сумма -31001, test key для live-start -31050, auth -32504, ключи CheckTransaction -31003. Paid access=null/receipts=[].

## 7. Известные проблемы
Реальный платёж и фискальный чек требуют покупки владельца. Studio live checkout POST не проверен новым заказом; его локальные тесты и public UI/config проверены. Встроенной презентации ещё нет. JS start109155/110000 B br, page CSS 26947/27000, lazy limit12kB несовместим с тяжёлым PPTX без отдельного контракта. История чата пока текстовая; Studio payment return пока не включает chat URLs. Google Request indexing дневная квота исчерпана; прежний снимок25/31 indexed,6 unknown.

## 8. Следующая задача
Предложенный R0: typed карточка презентации и общий Studio flow adapter, lazy budget, история/identity и корректный return contract. Реализация пока не заказана; текущий запрос закончить roadmap. Не считать этот next_stage автоматическим разрешением менять тарифы/архитектуру. Независимо доступна совместная контрольная покупка Payme/Click.

## 9. Acceptance criteria
Для roadmap: все этапы имеют порядок, reuse, ограничения и проверяемый результат, текущие и будущие обещания разделены. Для будущей интеграции: генерация/preview/PPTX и покупка в том же диалоге; единые Studio counters; корректный callback/возврат; история и разные владельцы изолированы; стартовая скорость/SEO сохраняются. Детали в CHAT_STUDIO_ROADMAP_20261007.md.

## 10. Команды и evidence
Checkout F:/Claude/gptbot-codex-integration-20261007. Private B=F:/Claude/gptbot-tools/backups/codex-continuation-20261007-140534, E=B/payme-enable-20261007. Все logs/old dist/4 UI screenshots там. Публичная квитанция reports/payme-activation-receipts/2026-10-07-live-activation.json без секретов. DR_ROOT и NODE_OPTIONS1400; release только deploy_runner.py check/deploy после committed build:production.

## 11. Риски
Активированная касса/allow=true не доказывает денежный цикл и чек. Обновление UX нельзя свести к ссылке/iframe/статическому import Studio: вес, история, identity и return сломают пользовательский путь. Макет старых фото/15 слайдов не подтверждает действующий состав. Общий пакет не выдавать двумя callbacks с одной transaction ID.

## 12. Rollback
Payme: вернуть только mode=test в обоих местах и guarded release; Click сохранён, endpoint/production key доводят старые settlement/отмены. Ничего не удалять из заказов/прав. Будущий chat tool — отдельный feature flag, standalone Studio и оплата остаются доступными. Исходные dirty worktrees/архив Claude не трогать.
