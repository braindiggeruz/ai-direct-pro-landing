# Реестр завершения Claude → Codex

Актуально 07.10.2026. Кандидат в `F:/Claude/gptbot-codex-integration-20261007`; последний проверенный production — `e3e551af`/`71d2f0f3`. Историческая матрица ниже сохранена как исходный аудит, её статусы не заменяют эту таблицу.

| Задача / источник | Результат и интеграция | Текущий статус | Доказательство / остаток |
|---|---|---|---|
| База, SEO wf_fb6725a4 | SEO + опубликованные Meta в одной линии | DEPLOYED_VERIFIED | 3173e366; 1809 tests, live protected10/10 |
| One-tap wf_ffb9b2d3 | Удалён отдельный шаг оферты, race/cookie guards | DEPLOYED_VERIFIED | e3e551af; 1815 tests; новые UI scenario18/18 |
| Free Studio wf_18d4b721 | Две страницы, API, quota, PPTX и картинки | VERIFIED_LOCAL | Реальные samples; финальный browser/release/readback в процессе |
| Paid A/B wf_6c34b294 | Full12, Kunlik/Oylik, rights/restore/account | VERIFIED_LOCAL | studio tests + real full PPTX, STUDIO_RELEASE_20261007.md |
| Paid C | Photo code сохранён, запуск заменён decks-only решением | SUPERSEDED | Фото off/draft; не продаётся как готовая функция |
| Paid D/E/F | Click shared, fiscal, ops/refund/report, terms v5 | VERIFIED_LOCAL | 100 shared Click tests; migration0077 applied; денежный E2E отдельно |
| Payme wf_4b91c3e5 | Ключи приватно сохранены; adapter готов | SUPERSEDED | Последняя команда владельца: пока не выводить Payme, оставить Click |
| Uzum | Код сохранён, live off | BLOCKED_EXTERNAL | Нет нового разрешения/подтверждения live |
| Chat UI wf_c56b415c | df264eb1 + one-tap/Meta, mobile drawer/math | VERIFIED_LOCAL | UI_ACCEPTANCE_20261007.md; полный layout gate выполняется |
| Conversion | Закрываемые тарифы после результата + retry | VERIFIED_LOCAL | 21/21 billing browser/unit tests; noauto, prices, dismiss/session |
| Lead Radar task_bc4f9153 | Schema fingerprint учитывает migration0059 | VERIFIED_LOCAL | RED2 → PASS47; scoped исключение, основной contract сохранён |
| GitHub wf_89ff25a8/wf_3537f163 | own/profile/Pages проверены; отправлены 2 issue | BLOCKED_EXTERNAL | PR65 OPEN, issues77/103 SUBMITTED; не accepted; EXTERNAL_TAILS_20261007.md |
| GSC N1 | Окна и completeness исправлены, self-test PASS | BLOCKED_EXTERNAL | NOT_DUE; scheduler registration не доказана, перенос не авторизован |

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
