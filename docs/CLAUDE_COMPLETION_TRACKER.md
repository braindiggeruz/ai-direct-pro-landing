> Актуализация 07.10: one-tap опубликован (`e3e551af`, `71d2f0f3`), suite 1815/1815, браузер 18/18, layout 258/258, live SEO 10/10. Следующий приоритет владельца — **полноценная платная Studio**, включая тарифы и права; потом UI и внешние хвосты. Studio пока не выпущена.

# Реестр завершения Claude → Codex

07.10.2026. Дерево `F:/Claude/gptbot-codex-integration-20261007`, ветка `codex/continuation-20261007`. Интеграция и публикация — текущий Codex; источники не меняются. Исторический handoff: `C:/Users/Borinio/Desktop/seo-skills-main/docs/CLAUDE_TO_CODEX_HANDOFF.md`. Спецификации raw разрешаются от `C:/Users/Borinio/Desktop/seo-skills-main/gptbot.uz-audit/`.

Статусы: IN_PROGRESS / IMPLEMENTED_UNVERIFIED / VERIFIED_LOCAL / VERIFIED_PREVIEW / DEPLOYED_VERIFIED / BLOCKED_EXTERNAL / SUPERSEDED. SHA и публикация указаны отдельно в каждой строке. Историческая матрица ниже сохраняет исходные статусы аудита.

| Требование | Источник | Исходное дерево/SHA | Статус | Остаток, приёмка, блокер/публикация |
|---|---|---|---|---|
| База + SEO | wf_fb6725a4-281; TRAFFIC-PLAN; NOW-TASKS | production `5bbfc97b` + SEO `b757615b` → **`3173e366`** | **DEPLOYED_VERIFIED** | build/typecheck/lint/gates: exit 0; suite 1809/1809; layout 258/258; четыре новых URL 200; JS 3/3; protected 10/10 после декодирования Cloudflare email |
| One-tap | wf_ffb9b2d3-e9c | saved f6d5af18 → integration | VERIFIED_LOCAL | targeted 158/158, browser 18/18, typecheck/lint 0; финальный SHA/build/suite/layout/guard ещё впереди; реальные деньги отдельно |
| Payme / Uzum | wf_4b91c3e5-ad9 | production5bbfc97b | BLOCKED_EXTERNAL | Payme test / Uzum off; нужны подтверждение live и отдельное денежное E2E |
| Бесплатная Studio | wf_18d4b721-821; launch CHECKS/REHEARSAL | studio-launch0f26fc13 | IMPLEMENTED_UNVERIFIED | 6 findings; privacy/legal; реальные6PPTX и бюджетAI; public404 |
| Chat UI | wf_c56b415c-9f2; DESIGN-SPEC centered-mobile | chat-ui df264eb1 | IMPLEMENTED_UNVERIFIED | Объединить one-tap/Meta; RU/UZ360/390/768/1440; keyboard/stream/errors |
| Paid Studio A/B | wf_6c34b294-d08; paid BUILD-PLAN A/B | studio-paid9a05db03 | IMPLEMENTED_UNVERIFIED | Full deck; права/orders/account; migration0075; isolation/restore |
| Paid Studio C | BUILD-PLAN C | studio-paid9a05db03 +19 WIP файлов | IN_PROGRESS | Фото клиент/API, storage/privacy/лимиты/удаление |
| Paid Studio D/E/F | BUILD-PLAN D/E/F; DECISIONS | studio-paid9a05db03 | IN_PROGRESS | Payments/fiscal/ops/offer; paid dark до отдельного разрешения продаж |
| GitHub | wf_89ff25a8-723; wf_3537f163-31c | PR65/own/profile/5drafts | IMPLEMENTED_UNVERIFIED | Проверить URL и правила; prepared/submitted/accepted отдельно; без дублей |
| GSC N1 | gptbot-n1-family-a-check | Claude scheduled task10.10 10:00Karachi | IMPLEMENTED_UNVERIFIED | Scheduler/runtime/доступы/baseline; не переносить |
| Lead Radar | task_bc4f9153; lead-radar.test.ts | production5bb → SEO3173 | VERIFIED_LOCAL | Baseline 1804/1807, candidate 1809/1809; два TTL fixtures и Meta assertion исправлены. Chip не считается выполненной задачей |

## Покрытие исторической матрицы

Исторические статусы не означают новые проверки; R1–R7 повторно не разрабатываются.

## 7. Матрица существенных результатов

`IMPLEMENTED` означает подтверждённую реализацию указанного объёма; публикация указывается отдельно. `BROKEN` — воспроизводимая текущая неисправность проверки/артефакта, не диагноз всего сайта.

| Работа | Статус | Код / Git / артефакт | Публикация и ограничения |
|---|---|---|---|
| Критика, экономика и roadmap v2 | IMPLEMENTED | `ROADMAP-V2-CRITIQUE-2026-09-30.md`, raw/v2 | Документы готовы; ранние сроки/заморозки заменены |
| Production-план WP, R1–R7 | IMPLEMENTED | raw/prod/10-PROD-PLAN; история текущего origin/main; billing/admin/tests | Реализованы основные пакеты; выражение «100%» не подтверждает бизнес-приёмку |
| Z.ai primary, fallback, лимиты и списания | IMPLEMENTED | `functions/lib/gpt-chat/`, runtime config, тесты | Текущий код содержит; реальные платные вызовы сейчас не выполнялись |
| Click server/fiscal/live | IMPLEMENTED | API, `billing-config.ts`, `9fd5523c`, `4909211c` — предки текущей базы | Live-конфигурация и архивный smoke; успешный реальный платёж сейчас не проверен |
| Uzum | PARTIALLY_IMPLEMENTED | Обработчики и тесты в текущей базе | Режим off, запуск не подтверждён |
| Payme API и sandbox | IMPLEMENTED | `d13f9629`, `0ff5898f`, `f8d8a3e5`, `b220f075` | Тестовый режим; live касса дала ошибку |
| Click guest checkout + Telegram chain fixes | IMPLEMENTED | `2ed9e812`, `GPT_GUEST_CHECKOUT=true` | Входит в текущий production-коммит |
| Оплата одним касанием | PARTIALLY_IMPLEMENTED | 25 изменённых файлов + `AiLimitPay.tsx` в onetap | Не закоммичена, review/gate оборваны |
| Админка AI-чата и эксплуатационные проверки | IMPLEMENTED | `functions/api/admin`, UI, тесты; feature `ai_chat_admin` в live marker | Marker и JS доступны; это не полная проверка всех админских действий |
| SEO audit/OpenSEO/keyword wave2 | IMPLEMENTED | raw/seo-2026-10-04 и workflows | Числа — снимки за даты исследований; нового платного исследования не делалось |
| SEO week1 / R-S1 / referat / rezyume | IMPLEMENTED | `284b0c67`, `be2d2955`, `4765c560` — в ancestry production | Не создавать эти страницы повторно |
| Bundle UX и дизайн 06.10 | IMPLEMENTED | `0f983c1c`, `20229600` в ancestry | Позднейший дизайн 07.10 ещё отдельный |
| SMM 06.10 | IMPLEMENTED | `44074e0f`, live `/uz/smm-xizmatlari/` 200 | Наличие заявки подтверждает лид, не выручку и не причинный эффект этого релиза |
| SEO-push по Uzbek GPT | IMPLEMENTED | `5ad00a6c`, `3e9e9eb1` в ancestry | Прошлая публикация; current UZ title подтверждён HTTP |
| Traffic 07.10: таргет + 3 статьи + GEO/SMM | PARTIALLY_IMPLEMENTED | Чистая ветка `b757615b`, reviewed revision `2026-10-07-seo-traffic` | Код и старый dist готовы; на сайте новая target-страница и проверенная новая статья 404 |
| Новая главная в traffic revision | PARTIALLY_IMPLEMENTED | baseline/comparison + SEO-protection | Требуется объединение с опубликованной аналитикой и новая сборка |
| Studio scaffold/free generator | IMPLEMENTED | `192ff31b`, `apps/studio`, API, PPTX builder | В production dark, это не public launch |
| Public launch бесплатной Studio | BROKEN | `0f26fc13`; failing `studio-island`; dist `1b41bdcb` | 6 подтверждённых review findings; gate null; live страницы/API 404 |
| Новый интерфейс чата 07.10 | PARTIALLY_IMPLEMENTED | `df264eb1`, DESIGN-SPEC, концепты | checkpoint без финального review/gate; не в production |
| Paid Studio A: полная презентация | PARTIALLY_IMPLEMENTED | `e620e8f1`, измерения FULL-DECK-MEASURE | Компонент реализован; не принят в составе полного платного продукта |
| Paid Studio B: заказы/права/кабинет | PARTIALLY_IMPLEMENTED | `e2f358b8`, `998150ff`, `699561f0`, `b0cbc751`, migration 0075 | Локальный chain-test есть; provider/операционная интеграция не закончена |
| Paid Studio C: фото | PARTIALLY_IMPLEMENTED | `9a05db03` + незакоммиченный frontend/schema WIP | Server есть, остаток клиента и проверки не завершены |
| Paid Studio D/E/F и общий E2E | PLANNED | BUILD-PLAN; соответствующие этапы workflow завершились error | Нельзя считать реализованным по названиям файлов или общему completed |
| GitHub-каталоги | PARTIALLY_IMPLEMENTED | Один PR #65 в архиве; квалификация кандидатов | Массовый submit не состоялся, приём PR модератором не проверен |
| Awesome Uzbek AI + профиль | IMPLEMENTED | Локальные Git `d67ffdc`, `b147d1a`, origin/main совпадают; publish report | Архивный readback публикации есть; текущий GitHub readback отдельно не выполнялся |
| Пять issue-заявок | PLANNED | `scratchpad/gh-own/issues/*.md`; последний transcript issues-агента | Черновики есть; отправка не подтверждена |
| Lead Radar schema fix в новой сессии | UNCLEAR | `task_bc4f9153` — chip-предложение | Нельзя считать запущенным/выполненным отдельным заданием; результат не установлен |
| Проверка N1 10.10 | PLANNED | `gptbot-n1-family-a-check`, файл scheduled task существует | В архиве создана на 10.10 10:00 Asia/Karachi. Состояние планировщика сейчас не проверялось; новый дубликат не создавать |
