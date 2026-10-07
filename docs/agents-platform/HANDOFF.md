# Передача GPTBot.uz: Google discovery и lastmod, 07.10.2026

## 1. Состояние
Production `ac68443c63740a56d32505ecfcd2fb7f262cd259`; deployment https://ba19f93c.ai-direct-pro-landing.pages.dev. Владелец поручил Google discovery: этап завершён. Платная Studio, Click-only, яркая покупка и градиент сохранены;302 HTML и71 JS/CSS совпадают с35974128. Полный live manifest и оба XML совпадают со сборкой;31/31 URL корректны.
## 2. Что сделано
Google принял две sitemap и два RSS; ошибочная RSS-заявка404 удалена из GSC. WebSub204/204.31 live URL корректны; URL Inspection25 indexed/6 unknown. Ручной Request indexing Studio отклонён дневной квотой. Исправлен устаревший updatedAt узбекского чата по содержательному Git-изменению06.10 и приоритет дат генератора sitemap.
## 3. Изменённые файлы
`scripts/generate-sitemap.ts`, `content/pages/uz/gpt-uzbek-tilida.json`, регрессионный сценарий в `tests/studio-sitemap.test.ts`; отчёт `docs/GOOGLE_DISCOVERY_20261007.md`, receipt Google/WebSub, эта передача, PROJECT_STATE и STATE.
## 4. Архитектурные решения
Существующие sitemap/RSS/GSC. Lastmod берётся из curated content dates: max(lastReviewedAt,updatedAt), createdAt только как fallback. Сборка не создаёт искусственную свежесть. Внешних новых сервисов нет.
## 5. Что сознательно не сделано
Не менять массово lastmod; не повторять IndexNow31 (уже принят17:52); не обходить дневную квоту Google. Payme hidden/test. Реальных платежей/заказов/списаний не создавали.
## 6. Проверки
40 targeted tests PASS/0 FAIL, typecheck/ESLint exit0, build:production exit0; SEO audit124 pages0 critical/orphans/broken intl links; freshness/SEO2/2 PASS.984 файлов сравнили с сохранённым dist: изменены только sitemap.xml, sitemap-updates.xml и marker;302 HTML и71 JS/CSS неизменны. Main300/updates94 URLs;9 исторических lastmod исправлены, в updates только UZ chat05→06.10. Guarded check exit0; upload completed; немедленный custom-domain guard exit1, позднее независимый полный live readback PASS. Cloudflare protection не менялась. После выпуска Google принял обе карты18:53 Asia/Karachi, errors0/pendingtrue. Private proofs в B/google-discovery-20261007, публичный отчёт GOOGLE_DISCOVERY_20261007.md.
## 7. Известные проблемы
Дневная квота Request indexing исчерпана;6 новых URL ещё неизвестны Google по снимку API. Sitemap pending сразу после submit ожидаем и не означает индексирование. Прежние ограничения реального Click E2E и native PPTX просмотра сохраняются.
## 8. Следующая задача
Совместная приёмка реального платежа Click: владелец оплачивает, затем проверить права продукта, генерацию/файл и фискальный чек. Google discovery завершён; после сброса квоты запросить индексацию6 новых URL по одному разу.
## 9. Acceptance criteria
Для следующего этапа: подтверждённый владельцем реальный Click-платёж, соответствующее право продукта, доступные презентация/PPTX и фискальный чек, корректная привязка заказа. Открытие checkout или sandbox это не доказывают.
## 10. Команды для старта
Рабочее дерево F:/Claude/gptbot-codex-integration-20261007. Backup B=F:/Claude/gptbot-tools/backups/codex-continuation-20261007-140534; google_discovery.py / google_gsc.py сохраняют фактические ответы. Production только npm run build:production, deploy_runner.py check/deploy с DR_ROOT на этот checkout.
## 11. Риски
Google сам определяет сроки обхода и индексацию. Не обещать рост позиций; old lastDownloaded не подтверждает чтение нового релиза. Защищённые SEO-страницы и права продуктов не меняются.
## 12. Rollback
Revert только commit исправления lastmod, затем штатные build/check/deploy. Прежний dist сохранён отдельно. Миграций и secrets нет; sitemap регистрацию можно снова подать штатным GSC API.
