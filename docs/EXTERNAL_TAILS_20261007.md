# Внешние остатки и Lead Radar — 07.10.2026

Проверка и исполнение по §9 пользовательского brief. Рабочий каталог: `F:/Claude/gptbot-codex-integration-20261007`; HEAD при завершении проверки: `c719494b1bf37d75e6fd8eb83adb5e4e154344aa`. Изменения этой задачи ещё не закоммичены и не опубликованы как код. Production D1, Worker, Telegram и платные исследовательские сервисы не вызывались.

## Публикации: submitted не означает accepted

| Материал | Статус на 07.10 | Доказательство |
|---|---|---|
| free-ai-tools-directory PR65 | SUBMITTED, OPEN; не merged | [PR65](https://github.com/ilovefree-com/free-ai-tools-directory/pull/65); комментариев 0; повторная заявка не создавалась |
| AI-Infinity | SUBMITTED, OPEN; принятие не подтверждено | [Issue77](https://github.com/meetpateltech/AI-Infinity/issues/77), создана `2026-10-07T10:54:31Z` от `braindiggeruz` |
| awesome-AI-tools | SUBMITTED, OPEN; принятие не подтверждено | [Issue103](https://github.com/sajadh76/awesome-AI-tools/issues/103), создана `2026-10-07T10:54:48Z` от `braindiggeruz` |
| Awesome Uzbek AI | PUBLISHED | [Репозиторий](https://github.com/braindiggeruz/awesome-uzbek-ai), remote main `d67ffdc95d440d923dc710a309df61187ac7ea87`; [Pages](https://braindiggeruz.github.io/awesome-uzbek-ai/) HTTP200, API status built, main/docs |
| Профиль | PUBLISHED | [Репозиторий профиля](https://github.com/braindiggeruz/braindiggeruz), remote main `b147d1a96dcd455b2db7a7e530d46ad42f540a2a` |
| ArshdeepGrover/ai-tools-manager | PREPARED, функциональная проверка не завершена | [Правила](https://github.com/ArshdeepGrover/ai-tools-manager/blob/master/docs/CONTRIBUTING.md), [template](https://github.com/ArshdeepGrover/ai-tools-manager/blob/master/.github/ISSUE_TEMPLATE/add-new-tool.md): требуется личный тест инструмента. Соответствующая галочка снята в подготовленной копии |
| Durgesh-Vaigandla/AI-tools-database | PREPARED, функциональная проверка не завершена | [Template](https://github.com/Durgesh-Vaigandla/AI-tools-database/blob/main/.github/ISSUE_TEMPLATE/tool-submission.md): требуется verified functional. Соответствующая галочка снята |
| elevasyncsolutions-jpg/ai-tools-directory | PREPARED, не отправлена | [Template](https://github.com/elevasyncsolutions-jpg/ai-tools-directory/blob/main/.github/ISSUE_TEMPLATE/suggest-tool.md) подходит; эта заявка не включена в ограниченную партию из двух публикаций |

Непосредственно перед отправкой выполнены GitHub search по issues/PRs всех состояний с `GPTBot` и code search с `gptbot.uz` в пяти целевых репозиториях: 0 результатов. Для двух адресатов повторный поиск перед записью также дал 0. Репозитории доступны, не архивированы, issues включены. Индекс поиска не даёт абсолютной гарантии полноты, поэтому повторная отправка запрещена: использовать реальные URL выше.

Актуальные правила двух отправленных заявок: [AI-Infinity Submit AI Tool](https://github.com/meetpateltech/AI-Infinity/blob/main/.github/ISSUE_TEMPLATE/submit-ai-tool.md), [awesome-AI-tools Issue Reporting](https://github.com/sajadh76/awesome-AI-tools#issue-reporting). Оба прямо принимают предложения через issue. В текстах: только существующий текстовый AI-чат UZ/RU, ограниченный бесплатный режим, раскрытие self-submission и независимости от OpenAI; Studio в разработке явно исключена. Удалены неподтверждённые сравнения с другими сервисами. После отправки обе issue прочитаны через API: URL, автор, OPEN и точное совпадение body с сохранённой копией подтверждены.

Подготовленные и отправленные тексты: `F:/Claude/gptbot-tools/backups/codex-continuation-20261007-140534/external-submissions/`. Сохранены пять файлов: `ai-infinity.md`, `arshdeep.md`, `durgesh.md`, `elevasync.md`, `sajadh76.md`. Исходные черновики Claude не изменялись.

Проверка доступности: обычный curl получил HTTP200 для обеих публичных страниц чата. Python urllib ранее получил 403; это различие клиентов, не доказанная недоступность сайта. Доступность страниц, ранее записанный account-readback и browser tests с управляемым API не доказывают живой генерационный E2E. Новая генерация не запускалась. Для двух неподанных заявок, требующих functional test, нужен проверенный живой бесплатный диалог и честная фиксация результата; только затем заполнять checklist и повторять duplicate check. SEO/GEO эффект ссылок и включение в чужие каталоги не подтверждены.

## N1: исправлен локальный расчёт, расписание не переносилось

Задача: `gptbot-n1-family-a-check`, исторический fireAt `2026-10-10T10:00:00+05:00` (05:00 UTC). Skill существует. В девяти найденных desktop `scheduled-tasks.json` task ID отсутствует; это может быть другое хранилище Cowork. Текущий блокер — **NO_VERIFIED_SCHEDULER_BINDING**: не найдена действующая регистрация исполнителя N1; это не доказательство удаления задачи во всех возможных хранилищах Claude. Новая задача и дубль в Codex не создавались. В текущей сессии read-only GSC sites.list подтвердил `sc-domain:gptbot.uz`, `siteFullUser`; значения credentials не выводились.

Повторный read-only контроль 07.10: каталог `C:/Users/Borinio/.claude/scheduled-tasks/gptbot-n1-family-a-check/` содержит только `SKILL.md`, без записи enabled/fireAt/runtime. Все девять `C:/Users/Borinio/AppData/Roaming/Claude/local-agent-mode-sessions/*/*/scheduled-tasks.json` имеют пустой `scheduledTasks`. В Windows Task Scheduler нет задачи по имени N1 или действия с `gptbot-n1`, `family-a-check`, `gsc_family_a_daily`; в `.claude/jobs`, `.claude/state`, `.claude/daemon` и `.codex/automations` ссылка на N1 также не найдена. Следовательно, отсутствует подтверждённый локальный executor, который запустит этот skill 10.10 в 10:00 Karachi. Для закрытия нужен фактический Claude task record с привязкой runtime, enabled и следующим запуском либо отдельно разрешённая регистрация; инструкция на диске не заменяет планировщик. Проверка не запускала GSC, не создавала расписаний и не меняла fireAt.

Исправлен файл:

`C:/Users/Borinio/Desktop/seo-skills-main/gptbot.uz-audit/raw/seo-compete-2026-10-06/02-raw/_scripts/gsc_family_a_daily.py`

Ранее он всегда запрашивал 08.09–05.10 и перезаписывал исторический baseline. Теперь обычный запуск выполняет именно N1: 06–08.10 против среднего 22–24.09 и 29.09–01.10, отдельно UZ и UZ+RU; position взвешивается impressions. Даты параметризованы через `--start`, `--end`, повторяемый `--baseline-window START:END`. Используется read-only scope и `dataState=final`; отдельная date-only выборка проверяет наличие final данных каждого дня. Неполнота → INCOMPLETE, недостаток данных позиции → INSUFFICIENT_DATA. Подтверждение: impressions меньше минимум на 50% и position хуже минимум на 1.5.

Результат пишется отдельно в `N1-family-a-check.json`. Запись поверх baseline запрещена. Сегодня запуск возвращает NOT_DUE до обращения к API и не создаёт преждевременный результат. Самопроверка `--self-test` проходит без сети: пороги, взвешенная position, UZ+RU, пропавшие даты и нулевые данные. Исторический baseline не менялся: SHA-256 до/после `a4fe70017d6ea757e5bfda136127fb9fec630e6df362bd9e4ef9f7630ef5ecee`. В отчёте расчёта сохраняется оговорка: baseline был собран ранее с dataState=all, query-level GSC не включает анонимизированные запросы.

Оригинал скрипта сохранён: `F:/Claude/gptbot-tools/backups/codex-continuation-20261007-140534/gsc_family_a_daily.before-n1.py`.

Команда на день проверки:

```powershell
py -3 C:/Users/Borinio/Desktop/seo-skills-main/gptbot.uz-audit/raw/seo-compete-2026-10-06/02-raw/_scripts/gsc_family_a_daily.py
```

Осталось проверить существующую задачу в её фактическом Claude scheduler: enabled, fireAt, исполнимость без ожидающего approval. Локальный SKILL.md этого не доказывает. Устаревающую фразу skill о готовности SEO release №3 нельзя использовать как разрешение на deploy без проверки актуального Git/release состояния.

## Lead Radar: локальная регрессия закрыта

Исторический `task_bc4f9153` был только pending chip, не подтверждённым запуском агента. Текущий дефект воспроизведён независимо: миграции 0059/0060 добавляют `lead_radar_signal_chats` и индексы, а company-centric contract ошибочно считает их неизвестными объектами.

Изменено только точное исключение `lead_radar_signal_chats` по `tbl_name` в `functions/platform/lead-radar/schema-contract.ts`; закреплённый fingerprint и остальные проверки не менялись. Исключение всего префикса не добавлялось.

В `tests/signal-radar-schema.test.ts` проверяется полный `SIGNAL_MIGRATIONS` 0057–0060, совместимость с crawler 0056, а затем неизвестная таблица `lead_radar_signal_unexpected` по-прежнему блокирует аудит. База без Signal Radar и прежние проверки сохранены. До исправления два новых сценария падали с schema_fingerprint_mismatch; после исправления **47 целевых тестов PASS**, eslint двух затронутых файлов — **exit0**, `git diff --check` — **exit0**.

```powershell
node --import tsx --test --test-reporter=dot tests/signal-radar-schema.test.ts tests/lead-radar-schema-audit.test.ts tests/lead-radar-crawler-contract.test.ts
npx eslint functions/platform/lead-radar/schema-contract.ts tests/signal-radar-schema.test.ts
```

Это локальное исправление. Worker отдельно не публиковался, remote D1 не проверялась и не изменялась; sender, очереди, Firecrawl и Telegram autosend не включались. Общие typecheck/full suite/build/deploy остаются ответственностью основного интеграционного прогона на окончательном кандидате.
