# Выпуск GPTBot.uz: 3 пробных ответа и Studio · 08.10.2026

Первый выпуск по прямой команде владельца: проверенная версия `edbf3d7385776ea7a06532c86e406e2759072013`. Предыдущий production — `c4cd8c701d383f1139486c91b30cd5c2bf7f46e2`. Artifact SHA256 `71c67c6f2e85a0854da69be1ac933e3a7e75fa31bc78afdd8b3f41210a3f578e`, 1002 файлов; guarded deploy и readback custom domain PASS. Изменения чата, Studio и owner-отчёта теперь на сайте, а не только локально.

## Финальный production выпуск

Актуальный сайт — `a80dfcbd13212246fb650daa877dd295044bc298`, Pages `https://12460835.ai-direct-pro-landing.pages.dev`, artifact `deeeeb0386102c40f5728ab3d1a0d40a4bbdc5891cf0eaf9a4e076d4119facf3`, 1002 файлов. Последняя правка legacy cache опубликована. Чистая production сборка, stamp, guard, exact readback, 48 unit regression, 29 release/SEO tests и built trial browser (3 случая RU/UZ 320/390/1366 px) PASS. Фактический Brotli бюджет проверен, пороги не подняты.

На финальном выпуске отдельный real browser подтвердил обе cached блокировки hourly/daily → доступная server trial, затем три настоящих ответа → 2/1/0 → баннер → fourth429. Reload/RU→UZ не сбрасывают trial и не открывают презентацию. Studio RU1366/UZ390 и 10 live SEO contracts снова PASS; просмотр тарифа создаёт 0 заказов/AIjobs, owner endpoint anonymous401. Initial и final квитанции разделены; прежние failures не удалены. Full paid purchase/refund/receipt и Merchant Click readback остаются внешней приёмкой.

## Лимит реально работает на сайте

В новом анонимном браузере получены **три реальных ответа Z.ai**: остаток 2 → 1 → 0. Баннер появляется после завершения третьего ответа, закрывается и оставляет историю доступной. Четвёртый POST `/api/gpt/chat` — **429**, `reason=trial`, `limits.lifetime=3`, `retryAt=null`. Перезагрузка и RU→UZ сохраняют использованные три ответа; обычный чат не превращается в презентацию. Ошибок JS не найдено. Cookie не сохранена в публичных отчётах.

Речь о **трёх ответах за всё время**, а не за час или сутки. Legacy поля `freeLimits.daily=15` / `hourly=5` могут оставаться в API для совместимости; действующий режим задают `lifetime=3` и `trial`. Сервер проверяет quota до AI. Старой уже открытой вкладке требуется обычная перезагрузка для загрузки нового JS; cookies очищать не нужно.

## БД и выпуск

Production binding `GPTBOT_DRAFTS_DB` сверена с `gptbot-ai-drafts`. Экспорт **40602168 bytes**, SHA256 `dd3bc556bf0823be022be427f68c4f34dfe5ff11cf2cc2d73e0bfd32a0d1836f`, сохранён приватно вне Git. Локальное восстановление подтвердило структурную целостность. У исторических строк `lead_radar_signal_posts` обнаружено старое нарушение CHECK; оно сохранено и не связано с trial. Миграция на фактической восстановленной копии не изменила количество заказов и записей чата и не добавила новых нарушений.

Применена **только** canonical миграция `0078_gpt_lifetime_trial.sql` через отдельный reviewed migrations_dir. Проверены регистрация, `trial_key`, `gpt_trial_usage`, trigger settlement. Остальные миграции не запускались. После deploy readback подтвердил `GPT_FREE_TRIAL_ENABLED=true`. Данные и оплаченные права не удалялись; probe не проводил оплату.

## Studio и SEO

Реальный browser RU/1366 и UZ/390 проверил встроенный draft, сравнение возможностей, Kunlik 5 900 / Oylik 39 900 сум, выбранный Kunlik в существующей кассе и пример SlideCanvas с тремя палитрами. Нет horizontal overflow или JS error. Просмотр/выбор тарифа не создал заказ и не вызвал AI. Реальный config показывает обе live кассы, free до 6 слайдов/2 картинок и full до 12/8, заметки и три палитры. Owner-only endpoint отклоняет анонимный запрос 401.

Все 10 защищённых live SEO contracts совпали с reviewed baseline после обратного декодирования только Cloudflare email protection. Baseline и пороги не менялись. Ранние ошибки probe сохранены приватно, их причины указаны в production.json. Локально дополнительно 47 regression тестов и trial browser прошли; предыдущие 233 regression / 446 layout / восемь presentation сценариев остаются в evidence реализации.

## Что остаётся открытым

Реальные покупка Studio, возврат и чек не подменяются fixtures или готовностью кассы. Старый Click fiscal случай `payment_id:click_-12` требует Merchant readback/подтверждения Click. Не объявлять чек исправленным и не делать повторный Submit вслепую. Окупаемость кампании ещё не измерена.

В служебный вывод случайно попала временная signed ссылка на экспорт. Она удалена из локального лога, в Git не попала, истекает `2026-10-08T06:43:04Z`. Права приватной папки ограничены текущим Windows-пользователем, SYSTEM, Administrators и рабочей группой Codex. Повторно URL и содержимое backup не выводить.

## Следующий шаг и rollback

Продолжать внешнюю денежную приёмку и сверку существующего чека Click. Не переimplementировать лимит/генератор. При regression сначала readback/логи; rollback UI/backend — прежний guarded artifact по команде владельца. Не удалять аддитивную таблицу/колонку/trigger trial и не обнулять использованный лимит. Полный restore D1 без сверки новых поступлений не выполнять.

Квитанция: `reports/chat-trial-production-20261008/production.json`, live browser и live Studio/SEO рядом. Backup SQL, credentials и raw private project metadata вне Git.

## Последняя правка для старых вкладок

После первого выпуска найден и исправлен legacy cache: карточки старого hourly/daily лимита больше не блокируют доступную пробу после получения авторитетного server account с `lifetime=3`. IP/busy ограничения сохранены; использованный trial остаётся закрытым. Проверки reducer: 48 PASS, root typecheck и scoped lint PASS. Built browser дополнительно начинает с сохранённой старой карточкой и проверяет доступную пробу, затем исчерпание трёх ответов, reload/язык и paid unlock. Финальный guarded выпуск и новая реальная проверка завершены; доказательства ниже.
