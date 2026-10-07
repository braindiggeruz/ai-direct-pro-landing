# Передача GPTBot.uz: подключение Payme, 07.10.2026

## 1. Состояние
Production до этого этапа ac68443c (Google sitemap fix), deployment ba19f93c. Владелец подтвердил включение Payme рядом с Click для чата и обоих тарифов Studio. Конфигурация и166 targeted tests готовы; следующий шаг — штатный выпуск.
## 2. Что сделано
Mode Payme test→live в packed JSON/таблице; Studio providers click→click,payme. Проверены оба ключа на живом callback без денежных событий. Тарифы, фискальные коды, текущие права и Click сохранены. Старые pin-тесты hidden/test обновлены под новое прямое решение владельца.
## 3. Изменённые файлы
wrangler.toml, tests/gpt-live-readiness.test.ts, tests/pages-config-parity.test.ts, tests/studio-config.test.ts; актуальный PAYME-RU runbook, PAYME_ACTIVATION_20261007.md, PROJECT_STATE/STATE/эта передача.
## 4. Архитектурные решения
Существующий Merchant API и одна касса для3 продуктов. Нет нового backend/провайдера/таблиц. Денежные состояния и права определяет существующий ledger; Payme выдаёт фискальный чек по detail.
## 5. Что сознательно не сделано
Реальное списание/возврат, фиктивный production PerformTransaction, обход готовности/Turnstile, показ Uzum, изменение цен/лимитов, повторная отправка ключей.
## 6. Проверки
166 targeted PASS/0 FAIL (Payme, Click, fiscal, entitlements, guest checkout, config parity, offer). Оба ключа callback CheckTransaction неизвестного ID:HTTP200/-31003. Точный старый dist E/dist-before и wrangler-before.toml сохранены приватно. Typecheck/lint/build/deploy и live acceptance дополняются после завершения.
## 7. Известные проблемы
Настоящий платёж и чек ещё не проверены владельцем. Сообщение активации не доказывает реальную фискализацию. Google Request indexing квота исчерпана;25/31 indexed/6 unknown по прежнему снимку, sitemap/RSS приняты.
## 8. Следующая задача
Завершить публикацию Payme и live acceptance всех3 тарифов. Затем совместная приёмка реального платежа Payme/Click.
## 9. Acceptance criteria
Живые chat/Studio providers click,payme, все3 checkout идут в checkout.paycom.uz с верными тиынами/order_id/return URL. CheckPerform даёт правильный detail, без оплаты права не выдаются; старые test settlement доступны. UI RU/UZ mobile работает, SEO/бюджеты сохранены.
## 10. Команды для старта
F:/Claude/gptbot-codex-integration-20261007; B=F:/Claude/gptbot-tools/backups/codex-continuation-20261007-140534. Новый evidence B/payme-enable-20261007. Build:production и deploy_runner.py check/deploy через run_check.py с DR_ROOT этого checkout. Секреты приватны, не печатать значения.
## 11. Риски
Реальная касса/чек подтверждаются фактической оплатой. Открытые заказы нельзя бросить при откате. Если deploy post-upload guard не подтвердит домен, сначала readback exact manifest/asset, не повторять upload вслепую.
## 12. Rollback
Вернуть только Payme mode=test в обоих местах и guarded release. Payme перестаёт продаваться в обоих продуктах, Click сохранён; endpoint и production key оставляют начатые settlement и возвраты доступными. Заказы/права/секреты не удалять.
