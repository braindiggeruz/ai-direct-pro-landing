# SOTUVCHI — pilot runbook (P2.7)

Дата документа: 2026-07-28. Этап: P2.7 — Analytics и pilot readiness.

## R0.1 local source checkpoint

R0.1 локально закрыл React Router 7.x applicable advisories и GPT Chat
configured-secret/missing-token Turnstile bypass. Direct Railway chat ingress
также закрыт internal gateway secret. Это только source evidence:

- production не менялся и smoke не выполнялся;
- Fastify/Railway dependencies остаются R0.2;
- credential incident остаётся R0.3;
- CI/release preparation остаётся R0.4;
- rollout остаётся R1.

Поэтому release по этому runbook по-прежнему заблокирован.

> **Ни один шаг этого документа ещё не выполнен.** Документ описывает, что
> нужно будет сделать, когда владелец даст отдельное разрешение на release.
> На момент написания push, deploy, применение migrations и настройка webhook
> не выполнялись. Секреты, токены, пароли, chat ID и любые credential values в
> этот документ не переносятся и не должны переноситься.

---

## 1. Цель пилота

Проверить одну гипотезу на реальных продавцах:

> продавец собирает каталог в Telegram и получает заказы, оформленные ботом
> без его участия.

Пилот ограничен: 10–30 магазинов, ручное подключение, без онлайн-оплаты, без
Mini App, без CRM. Пилот считается результативным, если не менее пяти
магазинов получили хотя бы один авто-заказ в неделю.

## 2. Prerequisites

- Владелец дал явное разрешение на release-задачу (отдельно от P2.7).
- Закрыты security-блокеры из
  [`SOTUVCHI_PRODUCTION_READINESS.md`](./SOTUVCHI_PRODUCTION_READINESS.md).
- Зарегистрирован отдельный Telegram-бот Agents. Он **не** `@aidirectprobot`
  и **не** `@gptbot_javob_bot`.
- Есть доступ к Cloudflare Pages проекта и к D1 `GPTBOT_DRAFTS_DB`.
- Есть человек, отвечающий за инциденты пилота, и канал связи с продавцами.

## 3. Source commit requirements

- Ветка `main`, ancestry P2.6 → P2.7.
- P2.7 code commit присутствует в HEAD.
- Обязательный Agents baseline и полный repository baseline зелёные локально
  (числа — в `TEST_MATRIX.md`).
- Рабочее дерево tracked-clean; допустимы только два pre-existing untracked
  объекта: `apps/gpt-backend/package-lock.json` и `gptbot.uz-audit/`.
- Локальная ветка впереди `origin/main`; push выполняется отдельной командой
  владельца.

## 4. Security blockers

Release заблокирован, пока не закрыты:

1. tracked plaintext admin credential в `memory/test_credentials.md` —
   требуется ротация, удаление из дерева и согласованная очистка Git history;
2. уязвимые React Router и Fastify зависимости;
3. Turnstile fail-open в GPT Chat;
4. отсутствие secret-scan и dependency-audit гейтов в CI.

Ни один из этих пунктов не закрывается «заодно» внутри пилота.

## 5. Required environment variable names

Только имена. Значения задаются через
`wrangler pages secret put` и никогда не попадают в репозиторий, логи, чат или
этот документ.

- `TELEGRAM_AGENTS_BOT_TOKEN`
- `TELEGRAM_AGENTS_WEBHOOK_SECRET`
- `TELEGRAM_AGENTS_BOT_USERNAME`
- `SITE_URL` (по умолчанию `https://gptbot.uz`)

Публичный username бота дополнительно фиксируется в
`src/shared/sotuvchi-config.ts` (`SOTUVCHI_BOT_USERNAME`) — это build-time
значение для CTA лендинга. Пока оно `null`, CTA ведёт на секцию `#pilot`, а не
на чужой бот.

Проверка без раскрытия значений:

```bash
npx tsx scripts/sotuvchi-pilot-check.ts
```

## 6. Migration sequence

Применять строго по возрастанию и по одной:

```
0013_platform_events.sql
0014_platform_identity_orgs.sql
0015_platform_knowledge.sql
0016_platform_workflow.sql
0017_telegram_agents_transport.sql
0018_sotuvchi_store_onboarding.sql
0019_sotuvchi_catalog.sql
0020_sotuvchi_buyer_qa.sql
0021_sotuvchi_checkout.sql
0022_sotuvchi_orders_inventory.sql
0023_sotuvchi_handoff.sql
```

Все они additive. P2.7 новой migration не добавляет: аналитика пишется в
существующую таблицу `events` (migration `0013`), а отчёт `/stats` читает уже
существующие domain-таблицы.

## 7. Backup / export requirement

До первой применённой migration:

1. сделать export D1 `GPTBOT_DRAFTS_DB` и сохранить его вне репозитория;
2. записать точную дату/время export и ID последнего Pages deployment;
3. убедиться, что export читается (пробное восстановление в отдельную БД);
4. без подтверждённого backup migrations не применять.

## 8. Cloudflare deployment sequence

1. Владелец выполняет push `main` (это и есть триггер deploy).
2. Дождаться завершения сборки Pages (`build:cf`, включая seo-audit gate).
3. Проверить, что deployment собран из ожидаемого commit SHA.
4. Записать ID предыдущего deployment — это цель rollback.
5. Проверить, что публичные страницы `/ru/sotuvchi/` и `/uz/sotuvchi/`
   отдаются и попали в `sitemap.xml`.

## 9. Telegram webhook setup sequence

```bash
npx tsx scripts/telegram-agents-setup.ts identity
npx tsx scripts/telegram-agents-setup.ts status
npx tsx scripts/telegram-agents-setup.ts setup
npx tsx scripts/telegram-agents-setup.ts setup --apply
```

- `identity` обязателен первым: он проверяет `getMe` и точное совпадение с
  `TELEGRAM_AGENTS_BOT_USERNAME`, а также отказывает для lead- и Javob-бота.
- `setup` по умолчанию выполняет только dry-run; только явный `--apply`
  разрешает изменение команд и webhook.
- Скрипт никогда не печатает token и secret.

## 10. Smoke tests

1. `POST /api/telegram/agents` без корректного secret-заголовка → отказ.
2. Любой другой HTTP-метод → 405.
3. `status` показывает ожидаемый webhook URL и отсутствие последней ошибки.
4. Лендинги RU/UZ открываются, canonical и hreflang взаимны.
5. Lead-бот и Javob-бот отвечают как раньше (регрессии транспорта нет).

## 11. Seller onboarding

Продавец открывает бота по ссылке с payload `agent_seller` и проходит мастер:
название магазина → язык → доставка → оплата → подтверждение. На выходе он
получает ссылку-витрину. Один owner = один магазин (MVP-политика).

## 12. Создание тестового магазина

Перед первым реальным продавцом оператор создаёт собственный тестовый магазин
и проходит весь путь целиком. Тестовый магазин не удаляется до конца пилота —
он же используется для проверок после каждого изменения.

## 13. Добавление товара

Через seller-меню: «Добавить товар» → название, цена (целое число UZS),
наличие. Затем «Опубликовать товар». Проверить, что товар виден в витрине и
что скрытый товар в витрине не появляется.

## 14. Buyer storefront test

Открыть ссылку-витрину со **второго** Telegram-аккаунта. Убедиться, что:

- витрина открывается по deep link;
- покупатель видит только опубликованные товары этого магазина;
- покупатель не получает seller-меню и seller-команд.

## 15. Catalog Q&A test

Проверить минимум по три вопроса на каждом языке: «что есть», «сколько стоит»,
«есть ли в наличии», «расскажи подробнее», «дешевле 100000». Убедиться, что ни
одна цифра в ответе не отличается от каталога и что неизвестный товар даёт
честный «не нашёл», а не выдумку.

## 16. Checkout test

Оформить заказ: количество → имя → телефон → адрес → подтверждение. Проверить:

- заказ создан один раз;
- повтор того же обновления не создаёт второй заказ;
- заказ содержит ровно одну позицию;
- имя, телефон и адрес видны только владельцу магазина.

## 17. Order confirm / inventory test

1. Задать остаток товара (`Остаток: <id> | <n>`).
2. Подтвердить заказ и убедиться, что остаток уменьшился ровно один раз.
3. Повторить подтверждение — остаток не должен измениться снова.
4. Проверить, что подтверждённый заказ нельзя отменить.
5. Проверить, что товар `available` без заданного остатка подтвердить нельзя.

## 18. Handoff / reply test

1. Покупатель пишет «позвать продавца» и свой вопрос.
2. Продавец получает уведомление без текста вопроса и открывает «Вопросы».
3. Продавец нажимает «Ответить» и пишет ответ следующим сообщением.
4. Покупатель получает ответ с пометкой авторства продавца.
5. Второй ответ на тот же вопрос невозможен.

## 19. `/stats` test

Отправить боту `/stats` от владельца магазина. Проверить:

- отчёт приходит только владельцу; покупатель получает отказ;
- точные счётчики совпадают с фактическими данными тестового магазина;
- блок воронки явно помечен как приблизительный;
- в отчёте нет имён, телефонов, адресов и текстов вопросов.

## 20. Monitoring

- Cloudflare Pages Functions logs: смотреть только safe-коды (`tg.agents:*`),
  сырые update и secret в логи не пишутся.
- Ежедневно: число pending `sotuvchi_notifications` и число handoff в статусе
  `open` дольше суток.
- Еженедельно: метрики раздела 23 по каждому пилотному магазину.

## 21. Incident handling

1. Зафиксировать время, магазин (внутренний ID) и наблюдаемое поведение.
2. Не копировать в тикет тексты покупателей, телефоны и адреса.
3. Классифицировать: транспорт (webhook), домен (заказ/остаток/handoff),
   контент (лендинг), доставка сообщений.
4. При риске для данных — немедленно снять webhook
   (`telegram-agents-setup.ts` с явной командой) и уведомить владельца.
5. После устранения — повторить smoke tests раздела 10.

## 22. Rollback

- **Код:** `git revert <P2.7 relay SHA>`, затем `git revert <P2.7 code SHA>`.
  P2.7 не создаёт migration, поэтому откат кода не требует изменений схемы.
- **Deploy:** вернуть предыдущий Pages deployment по записанному ID.
- **Webhook:** снять webhook отдельной явной командой; входящие update
  перестанут поступать, домен при этом не изменяется.
- **Данные:** применённые additive migrations не откатываются автоматически.
  Порядок удаления объектов — только по rollback-заметкам в шапке
  соответствующего файла migration и только при выключенном трафике.

## 23. Pilot metrics

Главная продуктовая метрика:

> **заказы, оформленные через Sotuvchi, на активный магазин в неделю.**

Вспомогательные:

| Метрика | Источник | Точность |
|---|---|---|
| Активных магазинов | `sotuvchi_stores` | точная |
| Магазинов с ≥1 опубликованным товаром | `sotuvchi_products` | точная |
| Начатых оформлений | `sotuvchi_orders` (created_at) | точная |
| Заказов оформлено | `sotuvchi_orders` (placed_at) | точная |
| Подтверждено / отменено / выполнено | `sotuvchi_notifications` | точная |
| Открытых вопросов | `sotuvchi_handoffs` | точная |
| Вопросов отвечено | `sotuvchi_handoffs` (answered_at) | точная |
| Открытий витрины | `events` `sotuvchi.buyer_started` | best-effort |
| Ответов по каталогу | `events` `sotuvchi.catalog_answered` | best-effort |
| Без результата | `events` `sotuvchi.catalog_no_result` | best-effort |
| Доля отмен | производная от точных счётчиков | точная |

Сознательно **не** считаются в P2.7: выручка, прибыль, средний чек, conversion
rate и time-to-seller-reply. Текущая схема не позволяет посчитать их честно.

## 24. Stop conditions

Пилот останавливается немедленно, если:

- обнаружена утечка данных между магазинами;
- бот выдал цену или наличие, которых нет в каталоге;
- остаток списан дважды по одному заказу;
- подтверждённый заказ удалось отменить;
- ответ продавца доставлен не тому покупателю;
- в события, логи или уведомления попал текст покупателя или его контакты;
- затронуты lead-бот, Javob, GPT Chat, админка или SEO-фабрика;
- владелец не подтвердил очередной шаг release.
