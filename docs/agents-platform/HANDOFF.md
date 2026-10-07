# Передача GPTBot.uz: Google discovery и lastmod, 07.10.2026

## 1. Состояние
Production до исправления3597412854df3a4aab03285db873830d6da0b36f, deployment https://4ddbdbf0.ai-direct-pro-landing.pages.dev. Платная Studio, Click-only, яркая покупка и градиент опубликованы и проверены ранее. Текущий этап прямо назначен владельцем: ускорить обнаружение обновлений Google. Точечное исправление lastmod проверено, требуется штатный выпуск и readback.
## 2. Что сделано
Google принял две sitemap и два RSS; ошибочная RSS-заявка404 удалена из GSC. WebSub204/204.31 live URL корректны; URL Inspection25 indexed/6 unknown. Ручной Request indexing Studio отклонён дневной квотой. Исправлен устаревший updatedAt узбекского чата по содержательному Git-изменению06.10 и приоритет дат генератора sitemap.
## 3. Изменённые файлы
`scripts/generate-sitemap.ts`, `content/pages/uz/gpt-uzbek-tilida.json`, регрессионный сценарий в `tests/studio-sitemap.test.ts`; отчёт `docs/GOOGLE_DISCOVERY_20261007.md`, receipt Google/WebSub, эта передача, PROJECT_STATE и STATE.
## 4. Архитектурные решения
Существующие sitemap/RSS/GSC. Lastmod берётся из curated content dates: max(lastReviewedAt,updatedAt), createdAt только как fallback. Сборка не создаёт искусственную свежесть. Внешних новых сервисов нет.
## 5. Что сознательно не сделано
Не менять массово lastmod; не повторять IndexNow31 (уже принят17:52); не обходить дневную квоту Google. Payme hidden/test. Реальных платежей/заказов/списаний не создавали.
## 6. Проверки
40 targeted tests PASS/0 FAIL, typecheck и scoped ESLint exit0. Live300/94 sitemap,31/31 canonical/indexable. Перед сборкой точная копия прежнего dist сохранена в private backup google-discovery-20261007/dist-before-lastmod. После сборки проверить, что HTML/JS/CSS и SEO contracts byte-identical, изменены только sitemap и release marker; затем guarded check/deploy и повторная GSC submit/readback.
## 7. Известные проблемы
Дневная квота Request indexing исчерпана;6 новых URL ещё неизвестны Google по снимку API. Sitemap pending сразу после submit ожидаем и не означает индексирование. Прежние ограничения реального Click E2E и native PPTX просмотра сохраняются.
## 8. Следующая задача
Завершить штатный выпуск исправленного sitemap и подтвердить production/GSC. После этого — совместная приёмка реального платежа Click.
## 9. Acceptance criteria
Live lastmod узбекского чата06.10 в обеих картах,300/94 entries и31/31 URL сохранены;0 sitemap/GSC ошибок; HTML/JS/CSS прежние; production marker совпадает с новым source; приём уведомления явно отделён от индексации.
## 10. Команды для старта
Рабочее дерево F:/Claude/gptbot-codex-integration-20261007. Backup B=F:/Claude/gptbot-tools/backups/codex-continuation-20261007-140534; google_discovery.py / google_gsc.py сохраняют фактические ответы. Production только npm run build:production, deploy_runner.py check/deploy с DR_ROOT на этот checkout.
## 11. Риски
Google сам определяет сроки обхода и индексацию. Не обещать рост позиций; old lastDownloaded не подтверждает чтение нового релиза. Защищённые SEO-страницы и права продуктов не меняются.
## 12. Rollback
Revert только commit исправления lastmod, затем штатные build/check/deploy. Прежний dist сохранён отдельно. Миграций и secrets нет; sitemap регистрацию можно снова подать штатным GSC API.
