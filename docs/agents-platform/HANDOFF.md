# HANDOFF — RU↔UZ translator pages (drafts) · 24.10.2026

## 1. Состояние
- Дата: 2026-10-24.
- Ветка: `seo/translator-ru-uz-20261024`, worktree `F:\Claude\gptbot-translator-20261024`, база `c0da2ecb` (прод `b5ad3d93` — её родитель).
- HEAD: коммит `feat(seo): draft RU-UZ translator pages with role preset and converter` (этот коммит, см. `git log -1`).
- Завершённый этап: две страницы переводчика подготовлены как черновики; роль чата задаётся страницей; конвертер латиница ↔ кириллица; набор для слепой проверки.
- Следующий этап: гейт владельца (слепая проверка ≥ 4/5, квота A–D, вычитка), затем отдельный релиз публикации.
- Рабочее дерево: чистое после коммита; `node_modules` четырёх пакетов — NTFS-junction на `F:\Claude\gptbot-codex-integration-20261007` (не в git). Не запушено, не задеплоено.

## 2. Что сделано
- `content/pages/ru/russko-uzbekskiy-perevodchik.json`, `content/pages/uz/rus-ozbek-tarjimon.json`: `status: "draft"`, `pageType: "gpt-chat"`, `chatRole: "translator"`, пара hreflang (x-default — UZ, как у пары чатов). Title/H1/description по `translator-market.md` (режим C), 6 FAQ, условия пробных ответов, телефон и e-mail, независимость, без фото/голоса/«лучше Google».
- Предустановка роли: `Page.chatRole` (закрытый список `CHAT_ROLE_PRESETS`), prerender пишет `data-chat-role`/`data-alt-href` и конвертер только при ней; чат стартует в роли «Переводчик/Tarjimon», ссылки на другой язык ведут на пару. `/api/gpt/chat` не менялся.
- Конвертер `src/shared/uz-translit.ts` (+ `src/uz-translit/main.ts`, вход Vite `uz-translit`, 3,4 кБ): правила официального алфавита, U+2018 для o‘/g‘, U+2019 для тутука; щ → sh, ы → i с пояснением; c/w остаются латиницей с пояснением.
- `PREVIEW_DRAFTS` (`scripts/preview-drafts.ts`): локальный предпросмотр черновиков с `noindex, nofollow`.
- Карта интентов: решение A8 (не пара: тесты требуют опубликованных URL); 4 замера спроса в `demand-policy.json`; запись в `docs/seo/CHANGE_LOG_2026-10.md`; решение `D-TRANSLATOR-20261024` в `DECISIONS.md`.
- Набор слепой проверки: `docs/seo/research/2026-10-24-translator-blind-check/` (20 + 20 текстов, лист оценок, ключ сборщика, `score.mjs`, инструкция).

## 3. Изменённые файлы
- Новые: две страницы; `src/shared/uz-translit.ts`, `src/uz-translit/main.ts`; `scripts/translator-page.ts` (атрибуты и разметка конвертера, '' без роли), `scripts/preview-drafts.ts`; `tests/uz-translit.test.ts` (90), `tests/translator-pages.test.ts` (12); набор слепой проверки.
- Изменённые: `src/shared/types.ts` (`chatRole`, `chatRolePreset`), `src/gpt-chat/types.ts` (`MountConfig.role/altHref`), `src/gpt-chat/main.tsx` (чтение по allowlist), `AiChatConsole.tsx` (стартовая роль, `{...altLink}` на трёх ссылках языка), `scripts/prerender.ts`, `scripts/vite-manifest.ts`, `vite.config.ts`, `content/seo/intent-manifest.json`, `content/seo/demand-policy.json`, `tests/seo-trial-product-truth.test.ts` (страницы переводчика в проверке раскрытия пробных ответов), `tests/gpt-chat-prerender-links.test.ts` (черновик в сборке предпросмотра обязан быть noindex), `docs/seo/CHANGE_LOG_2026-10.md`, `docs/agents-platform/DECISIONS.md`, этот файл, `STATE.json`.

## 4. Архитектурные решения
`D-TRANSLATOR-20261024`: страница gpt-chat может открыть чат в роли из закрытого списка; пустые строки без роли сохраняют HTML прочих страниц; конвертер детерминирован и не зовёт модель; черновики смотрятся через `PREVIEW_DRAFTS`. Серверный `mode:'translate'` с щитом от инъекций (AGENTS.md §5) не сделан — нужен до рекламы перевода, отдельным коммитом.

## 5. Что сознательно не сделано
Публикация, push, деплой, вызовы production API чата. Стартовые кнопки перевода в чате (гейт G5). Ссылки на черновики с опубликованных страниц, `APPROVED_STATIC_ROUTE_ADDITIONS`, ревизия защищённой `/`, страницы в `scripts/chat-layout-check.mjs` — всё это шаги релиза публикации (A8). Отдельная бесплатная квота (A/B) и `source: 'gpt_translator'` в `createSession` — решения владельца. `npm run check:chat-layout` не запускался (Chrome/Playwright; кадр защищённых чатов не менялся).

## 6. Проверки
- `npx tsc -b` → exit 0 (до и после); `npm run typecheck:functions` → exit 0.
- `npx eslint` на 16 своих файлах → exit 0.
- `npx tsx scripts/seo-audit.ts` → 0 критических, 124 опубликовано, 2 черновика, сирот 0.
- `npm run build:fast` → exit 0: 124 страницы, 2 черновика пропущены, sitemap 300 (как на базе), `_redirects` +2 строки 404 черновиков.
- `npx tsx scripts/seo-protection.ts check` → `Protected SEO: 10/10 unchanged.`
- Сборка ветки против сборки `c0da2ecb`: 298 из 301 файла побайтно равны; `/ru/gpt-chat/` и `/uz/gpt-uzbek-tilida/` отличаются только именем `gpt-chat-*.js`.
- `node --import tsx --test` по 28 файлам → 400 pass / 10 fail / 4 skip; все 10 падений те же (имена и тексты ошибок) на нетронутой базе: gpt-chat 1, studio-contact 2, seo-push-revision 2 (R3-6, R3-9), react-router-v8-migration 3, gpt-chat-rev-design 1, chat-ui-revision 1.
- Браузер (`vite preview`, 375 и 800 px): роль «Переводчик» выбрана, ссылки языка ведут на пару, конвертер работает в обе стороны, горизонтальной прокрутки нет, запросов к проду нет.

- Независимое ревью `d51fa925` (коммит `fix(seo): review fixes for translator draft`): FAQ «Сохраняются ли мои тексты?» на обеих страницах теперь говорит, что тексты вопросов и ответов хранятся на сервере до запроса на удаление (как в политике конфиденциальности); конвертер сохраняет кавычку после слова на g ('miting' → 'митинг'), оставляет латиницей целиком слова с c/w (WhatsApp, Coca-Cola) и не трогает ссылки и e-mail. `tests/uz-translit.test.ts` → 94/94.

## 7. Известные проблемы
- До этапа: 10 падений выше; `scripts/prerender.ts:941` TS18048 при строгой проверке скрипта (скрипты не входят в `tsc -b`).
- В этапе: у сборки с `PREVIEW_DRAFTS` черновики лежат в `dist` (noindex) — пересобрать без переменной до любого релиза. Переводчик и чат делят историю чатов одного языка (ключи localStorage по локали) и 3 пробных ответа. После оплаты/входа посетитель возвращается в основной чат, не на страницу переводчика.
- На вычитку носителю: ъ перед е в русских заимствованиях конвертер пишет тутуком (объект → Ob’yekt, съезд → s’yezd, обратимо); по правилам 1995 года, возможно, нужно obyekt / syezd.
- Внешние: слепой проверки нет; узбекский текст страниц вычитан не носителем; ветка не слита с `seo/chat-snippets-translator-20261024` (`d54d5b61`) — конфликты в HANDOFF/STATE/CHANGE_LOG.

## 8. Следующая задача
Гейт владельца для черновиков переводчика: слепая проверка роли носителями по `docs/seo/research/2026-10-24-translator-blind-check/README.md` (порог ≥ 4/5 в каждом направлении), решение по квоте (A–D, `translator-market.md` §4.3), вычитка обеих страниц. Открытым остаётся и замер GSC/лидов по релизу 2026-10-23.

## 9. Acceptance criteria
`score.mjs` по заполненному листу печатает `Gate: PASS in both directions.`; владелец записал выбор квоты; правки вычитки внесены. Для релиза публикации: `status` → published, A8 → пара/кластер, `APPROVED_STATIC_ROUTE_ADDITIONS`, новая ревизия защищённой `/` (только `/` меняется), ≥ 2 входящие ссылки с незащищённых страниц, `seo-protection check` 10/10 на новой базе, `check:chat-layout` с новыми страницами.

## 10. Команды для старта
`git status --short; git log -3 --oneline`; прочитать STATE и этот файл. `$env:NODE_OPTIONS='--max-old-space-size=1400'`; `npx tsc -b`; `node --import tsx --test tests/uz-translit.test.ts tests/translator-pages.test.ts`; `npm run build:fast`; `npx tsx scripts/seo-protection.ts check`. Предпросмотр: `$env:PREVIEW_DRAFTS='/ru/russko-uzbekskiy-perevodchik/,/uz/rus-ozbek-tarjimon/'; npm run build:fast; npx vite preview --port 4173`, затем `Remove-Item Env:PREVIEW_DRAFTS; npm run build:fast`.

## 11. Риски
Не давать `chatRole` защищённым чатам (их HTML сверяется гейтом). Не ссылаться на черновики с опубликованных страниц и не объявлять семью «chatgpt tarjima» (C6). Не рекламировать перевод до слепой проверки. Не выпускать `dist`, собранный с `PREVIEW_DRAFTS`. Тяжёлые сборки — по одной, при OOM (exit 134) повторить позже.

## 12. Rollback
Ничего не выкачено: откат — не сливать ветку или `git revert` этого коммита. Прод без изменений (`b5ad3d93`, артефакт `78b4b6c4…`). Миграций БД нет.
