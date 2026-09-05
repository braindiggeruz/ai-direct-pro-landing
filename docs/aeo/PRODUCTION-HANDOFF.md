> RELEASE UPDATE 2026-09-05: owner explicitly authorized commit/push/deploy. Migrations 0062/0063 applied after private backup. Live release verification is now the active stage; earlier authorization gates below are historical. See PRODUCTION-RELEASE-2026-09-05.md in docs/aeo.

# GPTBot AEO Studio — кандидат выпуска, 2026-09-05

## 1. Состояние

Реализовано в `F:/Claude/gptbot-aeo-20260905`, ветка `feature/aeo-production-20260905`, база `432eab906383b137474bb67bb95b57268aa93cca`. Работа ещё не закоммичена и не опубликована. Remote main и live manifest повторно совпали с этой базой 5 сентября. Локальный AEO: `F:/Claude/aeo-production-20260905`, база `031fd44e7535a9e80cdd72b4a207789b47c28640`.

Следующий этап — разрешение владельца на commit/push/release, затем выпуск проверенного кандидата и production canary. Исходный запрет «Не коммить и не пушь без отдельной инструкции владельца» сохранён. Build stamp ожидает разрешённого коммита; это не ошибка приложения и не повод обходить release gate.

Последняя UX-итерация, сравнение до трёх моделей, review API, миграция 0063 и оставшиеся проверки описаны в [UX-IMPLEMENTATION-2026-09-05.md](UX-IMPLEMENTATION-2026-09-05.md). Проверка main/live выше относится к этапу до UX-итерации; production после неё не перепроверялся.

## 2. Что сделано

Встроен защищённый `/admin-tools/aeo` в текущую админку GPTBot: RU/UZ, вопросы, анализ опубликованного контента, ссылки на исходные факты, editor deep link, экспорт, история, empty/loading/error/retry states. Экспорт импортируется локальным AEO в проверяемые предложения. Для заполненного FAQ предлагается отдельный раздел, исходный контент не меняется при анализе/импорте.

AI-наблюдения подготовлены, но выключены по умолчанию. Никаких реальных model calls в этой работе. Наблюдение API не называется выдачей ChatGPT или Google и всегда имеет verdict `insufficient`. Это внутренний рабочий кабинет, не готовая клиентская SaaS-регистрация.

## 3. Изменённые файлы

- `src/admin/pages/AeoWorkspace.tsx`, `aeo.css`: интерфейс, 44 px targets, focus, reduced motion, mobile layout.
- `src/admin/AdminApp.tsx`, `routes.ts`, `components/Sidebar.tsx`, `lib/api.ts`: существующая оболочка, маршрутизация и API client.
- `src/shared/aeo.ts`: типы анализа, предложений, observation и истории.
- `functions/api/admin/aeo/index.ts`: JWT boundary, server-owned org, body limits, idempotency и endpoint orchestration.
- `functions/platform/aeo/analysis.ts`: детерминированный выбор страницы и точных источников; project frozen policy; hash LF-normalized content.
- `functions/platform/aeo/observation.ts`: существующий AI facade с отдельной free policy/driver, фиксированный provider host, no redirects, 25 s, одна попытка, лимит ответа 200 KB; данные провайдера не превращаются в publishable copy.
- `functions/platform/aeo/store.ts`, `schema.ts`, `migrations/0062_aeo_workspace.sql`: org-scoped history, atomic caps, additive schema, timeout recovery и retention.
- `tests/aeo-workspace.test.ts`: негативные проверки, настоящий SQLite и API orchestration с подменой только GitHub/provider транспорта.
- `scripts/aeo-ui-evidence.ts`, `scripts/aeo-content-smoke.ts`, `docs/aeo/evidence/`: воспроизводимые локальные проверки.

## 4. Архитектура и настройка

Modular monolith сохранён. AEO использует существующие JWT, GitHub reader, AI facade и `GPTBOT_DRAFTS_DB`. Python writer остаётся локальным инструментом review/apply. Публикация работает через прежний процесс GPTBot.

GET и POST `/api/admin/aeo` требуют admin/platform owner. `support_readonly` и anonymous отклоняются. Org фиксирован сервером как `gptbot-internal`; клиентский org не принимается. Store принимает org первым параметром; тест org B не видит org A.

Запуск требует `Idempotency-Key` длиной 16–80 символов; повтор того же payload возвращает прежнюю операцию, другой payload с этим ключом — 409. Лимиты: analysis 100/day, measurement 30/day, UTC. Неуспешная попытка сохраняется в истории/квоте. Running старше 5 минут помечается failed при обновлении кабинета; история старше 90 дней удаляется для текущего org при чтении. Это lazy cleanup, cron не добавлялся.

Для включения AI нужны серверный secret `OPENROUTER_API_KEY`, `AEO_MEASUREMENTS_ENABLED=true` и `AEO_MEASUREMENT_MODELS` — список до трёх разрешённых `provider/model:free` через запятую. `AEO_MEASUREMENT_MODEL` остаётся legacy fallback. Браузер выбирает только из серверного allowlist. Доступность зависит от аккаунта и актуального каталога; модели пока не подключены. Provider routing: `allow_fallbacks=false`, нулевые `max_price` prompt/completion/request, `plugins=[]`; см. [OpenRouter provider selection](https://openrouter.ai/docs/guides/routing/provider-selection).

## 5. Границы выполненного

Production D1, Pages settings, credentials, live content, Telegram, Railway и webhooks не менялись. Локальные UI/API fixtures не доказывают live-auth, D1 binding или доступность OpenRouter. Автоматическая WCAG-проверка не заменяет ручную проверку screen reader. Семантическая релевантность — эвристика с источниками и review, не гарантия полного ответа.

Полный список 22 исправлений локального движка: `F:/Claude/aeo-production-20260905/seo-audit/PRODUCTION-READINESS-2026-09-05.md`.

## 6. Проверки

- `node --import tsx --test tests/aeo-workspace.test.ts tests/aeo-review.test.ts` — 16/16 pass.
- `npx tsc -b --pretty false` — pass; `npx tsc -p tsconfig.functions.json --noEmit --pretty false` — pass.
- Scoped ESLint для всех изменённых TS/TSX файлов — pass.
- `node --import tsx scripts/aeo-ui-evidence.ts` — 1440/1366/1024/768/390/320 px; 0 overflow, 0 page errors, 0 axe violations в AEO scope. Решение/reload/undo/бриф/editor round trip и два ответа; дополнительные failure/retry сценарии — в UX-отчёте.
- `node --import tsx scripts/aeo-content-smoke.ts` — 185 RU и 100 UZ опубликованных страниц, пять вопросов. Сайт и чат-бот не смешиваются при поиске цен; intro и URL вне языкового префикса обрабатываются.
- RU export → Python import → dry run на двух настоящих статьях с 8 FAQ — pass; вопрос без фактов пропущен; content diff пустой.
- `npm run build:cf` — SEO audit, Vite, все prerender/generation и Bormi admin pass. В конце exit 1: `Uncommitted runtime files: commit the reviewed build inputs before production deployment.` Stamp не получен, deployment artifact не считается готовым.
- Worker compile и secret scan проверяются отдельно; сводные результаты в `evidence/validation.json`.

Логи команд находятся локально в `F:/Claude/aeo-production-20260905/*.log` и не добавляются в Git. Скриншоты содержат только синтетические fixture-данные. Артефакт `current-content-analysis.json` содержит анализ публичного локального контента, не live-provider data.

## 7. Известные проблемы и внешние gates

Известных воспроизводимых ошибок в проверенных сценариях AEO после исправлений нет. Это не утверждение об отсутствии всех ошибок во всём GPTBot. Общий legacy lint и не затронутые продуктовые suites не объявляются зелёными.

Release gate: исходное разрешение не включает commit/push/deploy; production stamp требует чистого закоммиченного runtime дерева. AI model/account availability и реальный authenticated canary пока не проверены. Старые отчёты не конвертируются автоматически в валидный эксперимент.

## 8. Следующая задача

После явного разрешения владельца выпустить этот кандидат и провести production canary с проверкой readback. До разрешения доступны review и локальные проверки; не запускать remote migrations и provider canary.

## 9. Acceptance выпуска

1. Сверить live manifest и origin/main, сохранить актуальные WIP других worktree. При новой базе согласовать/слить изменения и повторить затронутые проверки.
2. Сделать адресные коммиты только перечисленных AEO/GPTBot изменений, обновив handoff/state с фактическими SHA. Не добавлять node_modules, runtime state, secrets и dist.
3. Перед изменением D1 получить разрешённый backup с проверкой целостности. Не запускать все pending migrations вслепую. Таблицы 0062 и 0063 аддитивные, bootstrap идемпотентен; ledger согласовать с реальной схемой.
4. `npm run build:cf` должен завершиться exit 0 со stamp. Выпускать штатным release script и авторитетным `wrangler.toml` в проект `ai-direct-pro-landing`, не старым `build:fast`.
5. Live `gptbot-release.json` соответствует выпущенному SHA; `/admin-tools/aeo` открывается после штатной авторизации; anonymous API получает 401, support — 403.
6. Один контролируемый analysis возвращает актуальные RU/UZ источники, сохраняется в D1 history; повтор с тем же ключом не создаёт второй запуск. Проверить editor link, export и mobile.
7. При разрешённом включении модели один AI-canary: bounded request, понятный error либо observation, расход квоты один, ключ не попадает в клиент/логи, цитаты безопасно отображаются. Недоступность модели не мешает content analysis.
8. Read-only canary основных GPTBot/админки/Bormi и сохранность существующих release features. Не выполнять Telegram send/бизнес-транзакции.

## 10. Команды для старта

```powershell
cd F:\Claude\gptbot-aeo-20260905
git status --short
git log -1 --oneline
git ls-remote origin refs/heads/main
$env:NODE_OPTIONS='--max-old-space-size=1400'
node --import tsx --test tests/aeo-workspace.test.ts
npx tsc -b
npx tsc -p tsconfig.functions.json --noEmit --pretty false
```

## 11. Риски

Не публиковать устаревший checkout поверх новой production-версии. Не включать paid/web-search модели и не выдавать model API evidence за AIO. Не обещать рост позиций/выручки. Не обходить frozen policy и provenance. Не удалять junction `node_modules` рекурсивно: он связан с исходным worktree.

## 12. Rollback

До выпуска достаточно оставить кандидат в отдельной ветке; исходные checkout сохранены. После разрешённого выпуска вернуть предыдущий проверенный Pages deployment или revert только AEO-коммит и выпустить штатно. Сначала выключить `AEO_MEASUREMENTS_ENABLED`; новую D1 таблицу сохранить, не делать DROP и не терять историю. Контентные apply выполняются отдельно и откатываются локальным checksum-guarded `python -m aeo recover --id ID --rollback --apply`, если файл не менялся независимо.
