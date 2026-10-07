# Передача GPTBot.uz: презентации в чате подготовлены локально

## 1. Состояние
Владелец одобрил roadmap и локальную реализацию, запретил push/deploy до новой команды. После зависания работа продолжена в F:/Claude/gptbot-codex-integration-20261007, ветка codex/continuation-20261007. Предыдущая публикация Payme: source96d2b8b7, deployment https://ecaee3bc.ai-direct-pro-landing.pages.dev. Этот этап не публиковался.

## 2. Что сделано
R0–R3: презентация в RU/UZ диалоге; существующие Studio free/full flow, preview/PPTX/regen; typed history/архивы и IndexedDB с namespace владельца; inline Kunlik/Oylik; durable сохранение перед оплатой; возврат Click/Payme в ту же карточку; актуальный остаток через watchMe; три контекстных предложения тарифов. Рекламные ссылки ?tool=presentation открывают черновик без автоматического создания.

## 3. Изменённые файлы
src/gpt-chat: типы/storage/LLM filtering/lazy host/плитка/компактная кнопка в поле/return. apps/studio/src/embedded: адаптер и проверенное хранилище; Form/Preview: embedding/restore/async guards/useId. Checkout/Tariffs и functions/lib/studio/checkout.ts: beforeNavigate, повтор того же заказа, allowlisted chat return. Vite: отдельный Tailwind4 compiler, React dedupe. ensure-studio-deps.ts/package scripts/bundle gate, targeted и browser tests. Полный отчёт CHAT_STUDIO_IMPLEMENTATION_20261007.md.

## 4. Архитектурные решения
Один backend/ledger и действующие тарифы. Browser storage не выдаёт прав; /api/studio/me остаётся источником остатка. Карточки исключены из запросов текстовой модели и счётчика ответов. Обычный чат не скачивает Studio/PPTX. Прерванная генерация после reload не повторяется. Оплата требует durable snapshot; ошибка удерживает тот же invoice. Return reference ограничен владельцем, вкладкой и24 часами.

## 5. Что сознательно не сделано
Push/deploy, реальные покупки/списания, миграции, новые кассы/цены, совместный SKU R4, фото R5 и облачная синхронизация. Действующие цены20 000/5 900/39 900; full max12, photo off. Общий SKU требует экономики и нового финансового контракта.

## 6. Проверки
191 targeted tests PASS, включая настоящий built chat в8 RU/UZ/ширина-сценариях с offline API, генерацией/PPTX/reload/Click+Payme return/deep links; после последней компоновки40 регрессий PASS. Root/functions/lead-radar и Studio typecheck0, scoped lint0, scoped secret scan0. Полный secret scanner отметил один старый тестовый IDENTITY_SECRET в tests/telegram-assistant.test.ts:639; файл побайтно совпадает с HEAD после нормализации CRLF, в этом этапе не изменялся. Start JS109996 B Brotli, CSS чата6741 B, весь CSS страницы26947 B: бюджеты PASS; PPTX112910 B только при экспорте. Финальный quick layout:52 сценария, ok=true,0 переполнений/перекрытий/контрастных дефектов/ошибок перехода; LCP2.168–2.280с на контрольных размерах. Кнопка встроена в поле ввода и не меняет его вертикальную позицию. Точная production сборка локального коммита дополняется после завершения.

## 7. Ограничения
Локальный файл не переносится между браузерами; скачать PPTX до очистки данных. При отказе IndexedDB переход к оплате удерживается с сообщением и повтором того же заказа. История/результаты владельцев разделены, но права чата и Studio прежние и раздельные. Browser paid fixtures не доказывают реальные деньги или чек.

## 8. Следующая задача
По новой команде владельца — guarded выпуск подготовленного изменения и live readback. До команды завершить проверки, локальный коммит и точную production сборку. Не повторять реконструкцию Claude, не менять старые dirty worktrees. После публикации контрольная покупка владельца: деньги → права → генерация/PPTX → чек.

## 9. Acceptance criteria
Презентации в диалоге RU/UZ; free/full используют действующие права; скачивание и reload; разные владельцы/карточки изолированы; inline тарифы/Click+Payme return в задачу; баланс только серверный; предложение после результата можно скрыть; обычный чат/SEO/budgets сохранены. Реальный денежный цикл — отдельная приёмка после публикации.

## 10. Команды и evidence
npm run test:chat-presentation после build; npm run typecheck; npm --prefix apps/studio run typecheck; scoped eslint; npm run check:chat-layout -- --quick; npm run build:production. NODE_OPTIONS=--max-old-space-size=1400. Логи F:/Claude/gptbot-tools/chat-embedded-*.log; browser receipt reports/chat-studio-local/browser.json; скриншоты F:/Claude/gptbot-tools/chat-embedded-shots/. Release только через F:/Claude/gptbot-tools/deploy_runner.py check/deploy по команде владельца.

## 11. Риски
Минимальный запас стартового JS/CSS: новые зависимости только через проверяемые lazy imports. Нельзя объявлять39 900 совместным пакетом чата/презентаций, обещать15 слайдов/фото из старого макета или считать тестовый callback реальной оплатой. Feature flag действует при сборке.

## 12. Rollback
VITE_CHAT_PRESENTATIONS=false при сборке отключает новый host, сохраняет standalone Studio и callbacks старых заказов. Возврат frontend к прежнему коммиту только guarded выпуском. Не удалять invoices/права/таблицы/чужие незакоммиченные изменения. Production этим локальным этапом не изменялся.
