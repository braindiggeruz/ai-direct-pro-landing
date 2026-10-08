# HANDOFF — Click fiscal incident · 08.10.2026

## 1. Состояние
F:/Claude/gptbot-codex-integration-20261007; branch codex/continuation-20261007. Предыдущий production source 5de9e3850468e1915d99729e4930b8750adcf433. Код защиты чеков выкачен: source4e12c12c0a1180dcdc88889aed6c9b99bc01f4fd, deployment https://08260196.ai-direct-pro-landing.pages.dev. Exact live manifest PASS. Этот metadata relay не требует нового deployment.

## 2. Что сделано
Независимая SELECT-only проверка production D1 и GET-only проверка Click. Исправлены повторный submit после неясного ответа, атомарная резервация по lease и вводящие в заблуждение алерты. Очередь и backoff сохранены.

## 3. Файлы и доказательства
reports/click-fiscal-incident-20261008/: INCIDENT.md, fiscal-readonly.json, merchant-readonly.json, локальные test/typecheck/lint logs. functions/lib/gpt-chat/{fiscal-store,fiscal-health-store,alert-policy,billing-maintenance-store}.ts; tests/gpt-click-fiscal.test.ts, studio-monetization.test.ts. Runbook: docs/paid-chat/CLICK-FISCAL-RU.md.

## 4. Решения
Сохранённый operation_id навсегда блокирует автоматический повтор submit_items; даже 404/empty после потери ответа не доказывает отсутствие чека. Только сверка и эскалация. Stale lease не резервирует отправку. Никаких выдуманных успешных статусов.

## 5. Внешние действия
Guarded Pages deploy по ранее выданному разрешению, Functions bundle загружен. Диагностика — только SELECT и GET. Ни одного нового фискального POST, платежа, возврата, изменения credentials или production D1. Кабинет Click требует вход владельца. Никаких сообщений поддержке/покупателю не отправлено.

## 6. Проверки
99/99 targeted tests PASS; tsc-b и Functions typecheck PASS; ESLint шести изменённых TS PASS. Независимый статический review: новых P1/P2 нет. Build:production, guard, deploy и exact custom-domain manifest PASS: RELEASE.json. Static artifact SHA совпадает с предыдущим SEO release; postdeploy D1 всё ещё показывает один pending -12 без submit.

## 7. Ограничения
Один live chat заказ на 20 000 сум paid, fiscal queue attempts10, payment_id:click_-12. Нашего submit не было; чек у Click/OFD UNKNOWN. GET с локальным owner profile вернул «Неверные данные поставщика». Production secret opaque; равенство его локальному профилю не доказано. Нельзя назвать конкретный неверный реквизит без кабинета.

## 8. Следующий этап
Восстановить проверенный доступ Click Merchant API и сверить существующий чек. Вход владельца запрошен в открытом https://mc.click.uz/. Пароли и SMS не просить в чате. SEO browser/measurement задачи сохранены в STATE, повторный IndexNow/GSC для этого backend patch не нужен.

## 9. Acceptance
Authoritative реквизиты сервиса107654; успешный read-only lookup; сверка существующего чека; нормальная очередь сохраняет подтверждённую ссылку ОФД, покупатель открывает корректный чек. До этого business acceptance blocked.

## 10. Старт
STATE/HANDOFF, INCIDENT.md, git status/log и live gptbot-release.json. Для deployment npm run build:production; DR_ROOT задавать этому repo; только F:/Claude/gptbot-tools/deploy_runner.py check|deploy. После потери ответа сначала readback, не слепой повтор.

## 11. Риски
Не очищать operation_id/submitted_at, не менять статус на success/manual ради алерта. Не подменять merchant_user_id значением merchant_id; не угадывать реквизиты. Не трогать lead webhook/секреты/чужой WIP. API error -12 существовал до SEO release.

## 12. Rollback
Предыдущий production b50a8d04, artifact2693d3e182097ffc21916522ab1e140697523474e25e3a14806df96ca9e8244b. Адресный revert и guarded release только после оценки риска возврата повторного fiscal POST. D1/credentials не изменялись; их rollback не нужен. Без reset/clean/force push.
