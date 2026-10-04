# Журнал изменений для замеров — октябрь 2026

Что и когда менялось на страницах gptbot.uz в октябре 2026. Правила те же, что в `CHANGE_LOG_2026-09.md`. Шаблонные правки (`scripts/`, `src/`, `index.html`, `content/global/site.json`) меняют сразу много страниц, поэтому у каждого коммита они перечислены словами. **[P]** — одна из десяти защищённых страниц (`PROTECTED_PATHS` в `scripts/seo-protection.ts`).

## Выкаты

| Выкат (production) | Коммиты | Когда | Deployment | Файлов контента |
|---|---|---|---|---|
| **pending: релиз R3** | WP-09 (`6d69b68d`, `c097e937`), WP-10 (`d7ab468c`, `d39cece1`), WP-11 (`ea50bd9c`, `e11524f0`) и WP-12 (SHA — в `STATE.json` `paid_chat_prod_2026.commit`) ветки `paid-chat/prod-readiness` | не выкачен | — | WP-10: 0; WP-11: 108 страниц + `content/global/site.json`; WP-12: 2 страницы, 159 статей (6 защищённых), `site.json` |

## WP-10 — ленивые части AI-чата (релиз R3, не выкачен)

Контент, мета, текст и ссылки не менялись: `seo-protection check` — 10/10 без изменений. Меняется то, чего гейт защиты не видит (он удаляет `<script>` перед сравнением). Эти пункты WP-12 вносит в `reviewedChanges` новой ревизии.

| URL | Отметка | Что изменилось | Сниппет/H1 |
|---|---|---|---|
| `/ru/gpt-chat/` | **[P]** | `<script type="module" src>` — entry чата из манифеста Vite (`dist/.vite/manifest.json`), а не первый `gpt-chat-*.js` в каталоге. Стартовый JS 113 990 → 105 251 Б brotli. Окно пакета, карточка «Для бизнеса» и инструменты меню грузятся по требованию | нет |
| `/uz/gpt-uzbek-tilida/` | **[P]** | то же | нет |
| `/.vite/manifest.json` | — | новый публичный файл выкладки: карта собранных файлов Vite (имена из `/assets` и пути исходников, без секретов). Это не страница: ссылок на него нет, в sitemap его нет | — |

Остальные страницы: скрипт калькулятора и HTML-комментарий о бандле лендинга тоже берутся из манифеста. Имена файлов меняются, как при любой сборке, текст страниц — нет.

## WP-11 — незащищённые страницы: AI-пакет вместо Plus, без цен бота, без личного Telegram (релиз R3, не выкачен)

`seo-protection check` — 10/10 без изменений: контент защищённых страниц, их футеры, главная и шаблон блога не менялись. Решение владельца L14: рабочего Telegram нет, поэтому личный `t.me/XGame_changerx` убран со всех незащищённых страниц, остаются телефон, e-mail `ceo@gptbot.uz` и формы. Контакт студии задаётся одной настройкой `studioTelegram` в `content/global/site.json` (сейчас пустая). Если владелец назовёт рабочий аккаунт, одна строка вернёт Telegram в футер лендингов, в мобильную панель, в карточку контактов, в запасной вариант формы и в B2B-карточку чата.

| URL | Отметка | Что изменилось | Сниппет/H1 |
|---|---|---|---|
| `/ru/tarify-ai-chat/` | — | Страница переписана: бесплатно — 15 сообщений в день и 5 в час; AI-пакет — 300 ответов на месяц за 20 000 сум, до 50 в день, без автосписаний, Click или Uzum Bank, покупка в чате, когда оплата открыта. Plus и «подписка» убраны, в том числе из `secondaryKeywords`. B2B-кнопка ведёт на `/ru/gpt-dlya-biznesa/`. `lastReviewedAt` 2026-10-01 | title, description, og — новые; H1 тот же |
| `/ru/gpt-chat-guide/` | — | H2 «Бесплатно, AI-пакет и внедрение для бизнеса», абзац о тарифах, 3 FAQ (вопрос «Что входит в AI-пакет?»). Пункт Images без обещания «image credits» | нет |
| `/uz/gpt-chat-qollanma/` | — | То же на узбекском. Вторая кнопка «Tariflar» → «Biznes bot narxlari» (адрес тот же, `/uz/chat-bot-narxi/`). Ссылка из абзаца — на `/uz/chat-bot-narxi/` вместо русских тарифов | нет |
| `/ru/javob/`, `/uz/javob/` | — | Таблица цен бота (Day Pass, Plus) и «онлайн-оплата подключается» убраны. Вместо них лимиты: 10 ответов в день и до 100 в месяц, 1 анализ в день, `/plans`. Главная кнопка вела на `t.me/gptbot_javob_bot` (такого бота нет), теперь — на `@gptbotuz_bot` | нет |
| `/ru/gde-polzovatsya-gpt-besplatno/` | — | Без Plus и без обещания «истории»; AI-пакет; «регистрация не нужна» | нет |
| `/ru/gpt-na-russkom/` | — | Description без «тариф Plus», FAQ; кнопка «Тарифы» → «Возможности» (вела на раздел «Для чего нужен») | description |
| 26 страниц с формой заявки (`LEAD_FORM_PAGES`) | — | Кнопки, которые вели в личный Telegram, ведут на форму `#lead-form`. Надписи «…в Telegram» стали нейтральными. Мобильная панель: «Позвонить» и «Заявка» | нет |
| 74 страницы без формы (B2B, ниши, «О компании», авторы, политика конфиденциальности, `/uz/`, калькулятор) | — | Кнопки ведут на новую карточку `#contact` «Связаться с GPTBot.uz»: телефон, e-mail, часы. Надписи нейтральные. Тексты «напишите в Telegram» заменены на телефон, e-mail или форму. На `/ru/kalkulyator-stoimosti-telegram-bota/` вместо «Скопировать и открыть Telegram» кнопка «Отправить расчёт на e-mail» (письмо с расчётом) | нет |
| все лендинги (не чат, не Market) | — | Футер: телефон и `ceo@gptbot.uz` вместо ссылки «Telegram» | — |
| `/llms.txt`, `/llms-full.txt` | — | Контакт: телефон и e-mail вместо личного Telegram. «GPTBot Plus» → AI-пакет | — |

**Защищённым страницам [P] гейт этих изменений не видит. WP-12 вносит их в `reviewedChanges`:**
- `/uz/gpt-uzbek-tilida/index.html.md` и Markdown-копии 7 защищённых статей. Хвост «Консультация / Maslahat» теперь даёт телефон и e-mail, а не Telegram. Это отдельные URL с noindex, не HTML страниц.
- `/ru/gpt-chat/`, `/uz/gpt-uzbek-tilida/` (React). B2B-карточка чата без кнопки Telegram: путь — её форма заявки. После заявки и при ошибке форма предлагает телефон студии, а не бота. Ссылка в боковой панели по-прежнему ведёт на `@gptbotuz_bot`.
- Сервер `/api/gpt/lead`: сообщения об ошибке больше не говорят «напишите нам в Telegram».

**Осталось для WP-12** (шаблоны, общие с защищёнными страницами, — личная ссылка там пока есть): поле `telegram`, `sameAs`, `defaultCTA` в `site.json`; футер чат-страниц и `<noscript>` чата; главная (`prerender-home.ts`, `src/components/Footer.tsx`, `src/lib/cta.ts`); шаблон блога (футер, мобильная панель, кнопка в шапке); цель Метрики `telegram_cta_studio` и обработчик кликов в `<head>` (`analytics-snippet.ts`, `analytics-metrika.ts`, копия в `index.html`). Статьи блога этот WP не трогал: в 153 незащищённых статьях 261 ссылка на личный Telegram (кнопки и ссылки в тексте) и ещё 15 упоминаний в тексте.

**Ревью WP-11 (`fix(site): address WP-11 review findings`).** В тексте пяти незащищённых страниц осталось «напишите нам в Telegram», хотя Telegram на них больше не предлагается. `seo-protection check` — 10/10 без изменений.

| URL | Отметка | Что изменилось | Сниппет/H1 |
|---|---|---|---|
| `/ru/stoimost-chat-bota/` | — | «Вы пишете нам в Telegram» → «Вы оставляете заявку в форме на этой странице или звоните нам» (раздел «Как формируется смета»; форма на странице есть) | нет |
| `/uz/chat-bot-narxi/` | — | «Siz Telegram’ga yozasiz» → «Siz shu sahifadagi formada ariza qoldirasiz yoki bizga qo‘ng‘iroq qilasiz» (форма на странице есть) | нет |
| `/ru/kalkulyator-stoimosti-telegram-bota/` | — | Шаг «…или откройте Telegram» → «…или отправьте расчёт нам напрямую — кнопкой под итогом» (калькулятор теперь отправляет расчёт на e-mail) | нет |
| `/ru/avtor-boris-gerasimov/`, `/uz/muallif-boris-gerasimov/` | — | Сообщить об ошибке в материале: «Борису в Telegram» / «Borisga Telegram orqali» → на `ceo@gptbot.uz`, как уже в FAQ этих страниц | нет |
| `/llms.txt`, `/llms-full.txt` | — | Дата «Last updated» → 2026-10-01: контакты в них сменились в WP-11 | — |

## WP-12 — одна ревизия защищённых страниц (релиз R3, не выкачен)

Новая база гейта: `docs/seo/evidence/2026-10-01-paid-chat-honesty/reviewed-protected-pages.json` (`BASELINE` в `scripts/seo-protection.ts`). Предыдущая база `2026-09-30-gsc-driven` не тронута, её sha256 записан в новой (`previousRevisionSha256`) и проверяется тестом. На всех десяти страницах меняется одно поле — `bodyTextSha256`. Title, H1, description, robots, googlebot, canonical, hreflang и внутренние ссылки — те же, что в `2026-09-30-gsc-driven`. `seo-protection check` — 10/10 на новой базе.

Решение владельца L14: рабочий Telegram не назван, поэтому личный `t.me/XGame_changerx` уходит со всего сайта, кроме GPTBot Market. Остаются телефон, `ceo@gptbot.uz` и формы. Telegram студии — одна строка `studioTelegram` в `content/global/site.json`.

| URL | Отметка | Что изменилось | Сниппет/H1 |
|---|---|---|---|
| `/uz/gpt-uzbek-tilida/` | **[P]** | Блок под чатом. Список условий: «Bepul chat uchun ro‘yxatdan o‘tish… so‘ralmaydi»; «Bepul chatdan foydalanish uchun to‘lov shart emas. Pullik AI paket ixtiyoriy: u mavjud bo‘lganda, shartlari chatning o‘zida ko‘rsatiladi» вместо «To‘lovli tarif hali ishga tushirilmagan…»; «Savollar … serverimizga va xorijdagi AI-provayderlarga yuboriladi…» вместо «Suhbat tarixi brauzeringizda qoladi». Абзац о боте больше не обещает «suhbatni Telegramda davom ettirish»: «Telegramda GPTBot Javob boti ham bor: uning o‘z bepul limiti bor…». Строки связи: телефон и e-mail вместо Telegram, noscript — «bizga qo‘ng‘iroq qiling: +998 50 587 07 20». Навигация «Tariflar» → «Biznes bot narxlari» (адрес тот же). Футер: e-mail вместо Telegram. FAQ (только `.md`) — те же формулировки. `lastReviewedAt`/`updatedAt` 2026-10-01 | нет |
| `/ru/gpt-chat/` | **[P]** | То же по-русски: «Для бесплатного чата оплата не нужна. Платный AI-пакет — по желанию: когда он доступен, его условия показаны в самом чате»; «Вопросы отправляются на наш сервер и зарубежным AI-провайдерам…»; «В Telegram есть и бот GPTBot Javob…»; «Быстрый — позвонить нам или написать на ceo@gptbot.uz»; noscript «позвоните нам»; футер. `lastReviewedAt`/`updatedAt` 2026-10-01 | нет |
| `/` | **[P]** | Оболочка для краулеров: «Запустить демо в Telegram» → «Запустить демо» и «Запросить демо», обе ведут на новый раздел `#contact` (заголовок финального блока, «Позвонить: +998 50 587 07 20 · E-mail: ceo@gptbot.uz», «Отвечаем Пн–Сб 10:00–19:00.»). FAQ «Что будет после обращения? — Вы звоните или пишете на e-mail…». Футер: e-mail вместо Telegram. React-лендинг: все кнопки «демо» ведут на раздел контактов (`FinalCTA`, `id="contact"`), футер — телефон и e-mail, мобильная панель — только телефон | нет |
| `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` | **[P]** | Две строки «Qo‘ng‘iroq qilish yoki Telegram» → «… yoki e-mail yozish» (`mailto:`), блок входа в чат «GPTBot AI · …» → «GPTBot.uz · O‘zbek tilida», футер | нет |
| `/ru/blog/chatgpt-i-claude-v-uzbekistane/` | **[P]** | «Позвонить или написать на e-mail»; кнопка «Запросить демо AI-бота — на русском и узбекском»; вместо конечной кнопки «Запросить демо в Telegram» — карточка контактов; блок входа «GPTBot.uz · На русском»; футер | нет |
| `/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/` | **[P]** | Строка связи, блок входа «GPTBot.uz · На русском», футер | нет |
| `/uz/blog/chatgptga-qanday-kirish-mumkin/` | **[P]** | Строка связи, блок входа, футер. Упоминание «chatgpt.com» в «Rasmiy kirish sahifasi chatgpt.com domenida…» стало ссылкой на `https://chatgpt.com/` — видимый текст тот же, внешние ссылки гейт не видит | нет |
| `/uz/blog/chatgpt-uzbek-tilida-promptlar/` | **[P]** | Блок входа «GPTBot.uz · O‘zbek tilida», футер | нет |
| `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/` | **[P]** | Строка связи, блок входа, футер | нет |
| `/uz/blog/ai-chat-nima-va-qanday-turlari-bor/` | **[P]** | Кнопка в шапке «Telegramda demo ko‘rish» → «Demo so‘rash» (`#contact`), вместо конечной кнопки — карточка контактов, футер | нет |
| 153 незащищённые статьи и блог-индексы `/ru/blog/`, `/uz/blog/` | — | 259 кнопок, которые вели в личный Telegram, ведут на карточку контактов `#contact` (её шаблон блога рисует на месте конечной кнопки). Надписи «…в Telegram» нейтральные: «Запросить демо», «Demo so‘rash», «Обсудить задачу»; кнопки про Telegram-бота как продукт не менялись. 11 строк «{call} или {tg}» → e-mail, 15 текстов с адресом и 27 фраз «напишите в Telegram», «Telegram’da muhokama qilamiz» → телефон или e-mail. Футер и мобильная панель — как на лендингах; у блог-индексов — кнопка «Связаться с нами» и карточка. `dateModified` статей не менялся: их содержание то же | нет |
| все страницы | — | `<head>`: события `contact_click` (GA4) и цель `telegram_cta_studio` (Метрика) считают ссылку с меткой `data-contact="studio"`, а не личный ник; пока рабочего Telegram нет, ни то ни другое не срабатывает. JSON-LD: `Organization.email` и `ContactPoint.email` = `ceo@gptbot.uz`, в `Person.sameAs` нет личного Telegram. Копия блока Метрики в `index.html` — байт в байт | — |

**Что гейт не видит** (полный список — `invisibleToGate` в новой базе): экраны чата R1 (карточка лимита, честный 429, «Стоп»), WP-09 (бренд «GPTBot.uz», строка «не продукт OpenAI», лимиты 15/5, без «Plus»), WP-10 (скрипт из манифеста, ленивые части, `/.vite/manifest.json`), WP-11 (Markdown-копии, B2B-карточка чата, сообщения `/api/gpt/lead`), WP-12 (обработчики кликов в `<head>`, JSON-LD, React-лендинг главной, Meta Pixel: клик по кнопке «демо» больше не `Lead`, клик по телефону, e-mail или Telegram — `Contact`; ссылка на chatgpt.com; FAQ и даты чат-страниц; Markdown-копии).

**Замеры C22 и C11.** Ревизия трогает три их страницы (`/uz/gpt-uzbek-tilida/`, статьи о входе и о загрузке), но не их рычаги: title, description, H1, FAQ[0], раздел `#chatgpt-kirish` и ссылки в тексте те же. Выкат внутри окна чтения T0+14/T0+28 всё равно добавляет помеху. Дату R3 выбирает релиз; её нужно записать здесь, в строке «Выкаты». Первый экран чат-страниц ревизия не меняет: блок с текстом стоит под окном чата.

**Откат:** `git revert` коммита WP-12 возвращает шаблоны, контент и `BASELINE` вместе, затем guarded-деплой. Старые базы не редактируются.

## Выкладка №1 незащищённых страниц — неделя 1 SEO-роадмапа 04.10 (не выкачена)

**Решение владельца, 2026-10-04:** «делай всё согласно роадмапу» → решения 1, 2, 3 и 5 (раздел 2.0 роадмапа) — да; 4 выполнено (жалоба на спам chatgpt.uz отправлена 04.10); 7 — нет; 6 — да при условиях роадмапа (данные из раздела 2.0, решение до 27.10). Роадмап: `gptbot.uz-audit/raw/seo-2026-10-04/ROADMAP-DETAILED-2026-10-04.md`, разделы 1(a), 1(e), 2.1 п. 1.4–1.8.

Ветка `seo/week1-20261004` от `9a8b9ff0`. Защищённые страницы [P] не менялись: `seo-protection check` — 10/10 на базе `2026-10-01-paid-chat-honesty`, побайтовое сравнение HTML всех десяти со сборкой `9a8b9ff0` — 0 отличий (включая `<head>`, JSON-LD, `<script>` и имена файлов). Имена файлов в `dist/assets` и стартовый бандл чата те же. HTML изменился у 19 незащищённых страниц из таблицы ниже, больше ни у одной.

| URL | Отметка | Что изменилось | Сниппет/H1 |
|---|---|---|---|
| `/ru/blog/chat-gpt-online/` | — | Ключи RU-чата убраны: «чат gpt онлайн», «chat gpt онлайн», «chatgpt онлайн», «чат гпт онлайн», «gpt онлайн», «gpt чат онлайн», «ai чат онлайн», «нейросеть онлайн», «искусственный интеллект онлайн»; ещё «чат с искусственным интеллектом» (ключ статьи chat-s-ii) и «ai-чат на русском» (`/ru/gpt-na-russkom/`). Остались «задать вопрос нейросети», «gptbot uz». Блок входа в чат после первого абзаца (пара C23) | нет; title и H1 — в релизе главной 19.10 (301 или «как пользоваться») |
| `/ru/blog/ii-chat-na-russkom-chto-eto-i-kakie-byvayut/` | — | Ключи: убраны голое «ии чат» (RU-чату), «ии чат на русском» (C10), «чат с ии» (статье chat-s-ii). Карточка «ИИ-чат онлайн» → `/ru/gpt-chat/` (пара C24) | нет |
| `/ru/blog/chat-s-ii-gde-poobshchatsya-s-iskusstvennym-intellektom/` | — | Ключ «ии чат бесплатно» убран (C25). Блок входа в чат; карточка «бесплатный ИИ-чат онлайн» → `/ru/gpt-chat/` | нет |
| `/ru/blog/chat-gpt-na-russkom/`, `/ru/blog/analogi-chatgpt-kotorye-rabotayut-v-uzbekistane/` | — | Блок входа в RU-чат после первого абзаца | нет |
| `/uz/blog/chat-gpt-uzbek-biznes-uchun/` | — | Блок входа в UZ-чат; анкор «ChatGPT’ga kirish» → «ChatGPT’ga kirish (login)» (ведёт на гайд по входу) | нет |
| `/uz/blog/chatgpt-talabalar-uchun/` | — | Анкор «ChatGPT’ga kirish» → «ChatGPT’ga kirish (login)». Блок входа уже был, его вывод тот же | нет |
| `/uz/blog/insho-yozish-suniy-intellekt-bilan/` | — | Карточка на гайд по входу: «ChatGPT kirish» → «ChatGPT’ga kirish (login)». Блок входа уже был | нет |
| `/ru/gde-polzovatsya-gpt-besplatno/` | — | Ключ «GPT онлайн бесплатно» убран (C27). Абзац до первого H2 с двумя ссылками на `/ru/gpt-chat/` («ИИ-чат GPTBot.uz», «бесплатный ИИ-чат онлайн») | нет |
| `/ru/gpt-dlya-ucheby/`, `/ru/chto-takoe-gpt-i-kak-polzovatsya/` | — | Абзац до первого H2 с двумя ссылками на `/ru/gpt-chat/` и примером вопроса | нет |
| `/ru/gpt-na-russkom/` | — | Абзац до первого H2 с двумя ссылками на RU-чат. Новый раздел H2 «Чат GPT на русском: как писать и что умеет» (`#kak-pisat`): как писать вопрос по-русски, что чат умеет и чего от него не ждать (работает с текстом, дневной и часовой лимит, может ошибаться), написания «чат гпт на русском», «chat gpt na russkom» одной фразой; «чат жпт» и «чат джипити» — одна фраза со ссылкой на RU-чат (их владелец — `/ru/gpt-chat/`, C10). Без «официальный» и «без VPN». `lastReviewedAt`/`updatedAt` 2026-10-04 | нет; title и H1 те же |
| `/uz/` | — | Одна ссылка в теле после первого абзаца: «GPTBot.uz bepul AI chati» → `/uz/gpt-uzbek-tilida/`. Блок в первом экране — вместе с R-S1. Карточки: «ChatGPT kirish» → «ChatGPT’ga kirish (login)»; «GPT o‘zbek tilida — AI-chat» → «O‘zbek tilida prompt yozish qo‘llanmasi» (ведёт на гайд C6) | нет |
| `/uz/suniy-intellekt/` | — | Абзац до первого H2 с двумя ссылками на UZ-чат («GPTBot.uz bepul AI chati», «o‘zbekcha AI chatni»). Карточка «ChatGPT kirish» → «ChatGPT’ga kirish (login)» | нет |
| `/uz/gpt-uzbek-tilida-ai-chat/` (гайд C6) | — | Ключи семьи A убраны: «chatgpt o‘zbek tilida», «chat gpt o‘zbek tilida», «gpt uzbekcha», «ai chat o‘zbek tilida» (владелец — UZ-чат). Абзац до первого H2 с двумя ссылками на UZ-чат. Ссылка и карточка «GPTBot.uz AI-chat qo‘llanmasi» → `/uz/gpt-chat-qollanma/` (пара C28) | нет |
| `/uz/gpt-chat-qollanma/` | — | Ключ «gpt uzbek tilida qollanma» убран (это фраза гайда C6). Второе предложение со ссылкой «o‘zbekcha AI chat» на UZ-чат до первого H2 | нет |
| `/uz/gpt-telegram-instagram-ideya/` | — | Карточка на гайд C6: «GPT o‘zbek tilida AI chat» → «O‘zbek tilida prompt yozish qo‘llanmasi» | нет |
| `/ru/seo-prodvizhenie-saytov-tashkent/` | — | title и og:title: «SEO-продвижение сайта в Ташкенте от 2 490 000 сум/мес \| GPTBot.uz» (65) → «SEO-продвижение сайтов в Ташкенте от 2 490 000 сум/мес» (54) | title |
| `/ru/stoimost-chat-bota/` | — | title и og:title: «Стоимость чат-бота в Узбекистане 2026: от 990 000 сум \| GPTBot.uz» (65) → «Стоимость чат-бота в Узбекистане 2026: от 990 000 сум» (53) | title |
| `/ru/gpt-chat-guide/` | — | Ключ «нейросеть онлайн бесплатно» убран (C26). HTML не изменился: ключи страниц в HTML не выводятся | — |
| `/llms.txt` | — | Открывается двумя направлениями: AI-чат на узбекском и русском (только текст, бесплатный лимит, без регистрации, независимый, не ChatGPT и не OpenAI) и AI-боты для бизнеса. Новый раздел «Who GPTBot.uz is» с фактами о сущности. Без чисел лимита — они выходят 12.10 вместе с чат-страницами. Исправлено: `/` — русская главная, а не выбор языка; `/ru/` указан как старый адрес с canonical на `/`; «chatgpt ochish» → гайд по скачиванию (C11), «ии чат / чат гпт онлайн» → RU-чат. Last updated 2026-10-04 | — |

**Шаблон блога (меняет только незащищённые статьи).** `scripts/chat-entry-cta.ts`: мостики `CHAT_BRIDGES` для пяти статей. Реестр `src/shared/chat-entry.ts` читает сам чат (он подставляет пример вопроса), поэтому новая запись там изменила бы скрипт чата и HTML обеих защищённых чат-страниц. Мостик ведёт на страницу чата без `#entry` и без вопроса в адресе, а пример вопроса напечатан в статье. Клик считается тем же событием `article_chat_click` (поле `intent` = id мостика). `scripts/prerender-blog.ts`: блок мостика стоит после первого обычного абзаца, у статей с записью в реестре место прежнее. Вывод блока на шести защищённых статьях и на трёх незащищённых, где он уже был (`chatgpt-talabalar-uchun`, `insho-yozish-suniy-intellekt-bilan`, `chatgpt-claude-gemini-ozbekistonda`), не изменился.

**Карта интентов (`content/seo/intent-manifest.json`).** C22: пометка PROVISIONAL снята, этапа 2 не будет; владелец голого «chatgpt kirish» — тот наш URL, куда его ведёт Google, ни один URL к нему не тянем; голый «ChatGPT kirish» анкором не используется. Окна T0+14/T0+28 — история, единственное правило отката — П-CTR. C18: текст «owns» согласован с C22. C10: «чат жпт / чат джипити» в `mustNotTarget` страницы `/ru/gpt-na-russkom/`. C6: гайд владеет «как писать промпты на узбекском», ключи семьи A — в его `mustNotTarget`. Новые пары: C23–C27 — RU-чат владеет голым «ии чат», «чат гпт онлайн», «… онлайн бесплатно», «чат … бесплатно», а пять русских страниц держат «что это / какие бывают / где пообщаться / как пользоваться / где бесплатно»; C28 — `/uz/gpt-chat-qollanma/` (возможности, лимиты и безопасность нашего чата) против гайда C6 (как писать промпты). Сами ключи RU-чата (защищённой страницы) меняет только R-S1.

**Не вошло — перенесено:**
- Подстановка примера вопроса в чат для пяти новых мостиков: id нужно добавить в `CHAT_ENTRIES`, это меняет скрипт чата → релиз R-S1 (12.10).
- Блок «O‘zbekcha bepul AI chat» в первом экране `/uz/` и строка на оба чата на `/` (решение 3 = да) → R-S1.
- Title и H1 `/ru/blog/chat-gpt-online/`, H1 `/uz/gpt-chat-qollanma/` и гайда C6: оба H1 и заголовки статей выводятся на `/` → релиз главной 19.10.
- Анкоры на защищённых страницах: на `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/` «ChatGPT kirish yo‘riqnomasi» и карточка «ChatGPT’ga kirish» (лучше «ChatGPT’ga kirish (login) …»); ключи «chatgpt uz», «chat gpt uz» и русский «чат gpt онлайн» в полях UZ-чата и RU-чата → R-S1.
- Числа лимита («15 в день, 5 в час») в `llms.txt` → 12.10.

**Проверка:** `seo-protection check` 10/10; побайтовый diff HTML 10 защищённых = 0; `seo:audit` — 0 critical; бюджет бандла чата пройден; `npm test` зелёный; все новые и изменённые внутренние ссылки ведут на существующие страницы. В `sitemap.xml` у `/` и `/ru/gpt-na-russkom/` lastmod 2026-10-04: lastmod главной в карте — самая свежая дата сайта, HTML главной не менялся.

**После выкатки (владелец):** «Запросить индексирование» в GSC для 17 URL: 16 страниц с мостиками (среди них `/ru/gpt-na-russkom/`) и `/ru/gpt-vs-chatgpt-sravnenie/` — по 8–9 URL в день из-за квоты; обычная кнопка, не Indexing API.

## Выкаты

- **2026-10-01, R2+R3 в проде** (`26b058e5`, затем `0ca0a699`): ревизия `2026-10-01-paid-chat-honesty` вживую 10/10 после снятия обфускации e-mail Cloudflare (сама обфускация меняет HTML у всех страниц с адресом). IndexNow — 288 URL (HTTP 200), в GSC переотправлены `sitemap.xml`, `sitemap-updates.xml` и обе RSS. Окна C22/C11 гейтами больше не служат (решение roadmap v2); этот выкат — отметка для недельного сравнения «до/после».
- **2026-10-03, R4 в проде** (`6502224c`): публичная оферта RU/UZ и политики; оплата выключена. IndexNow 5 URL, sitemaps переотправлены.
- **2026-10-03, Z.ai** (`7d35a803`, затем `a69ab2c0`): ответы чата — Z.ai GLM-5.3-Flash из предоплаченного пакета владельца; защищённые 10/10.
- **2026-10-03, R5–R7 в проде** (`58265bf2`, тёмная репетиция `93b1ee27`, итог `b69f953e`): оферта v2 (без возврата), политики, формы с бюджетом на 4 B2B-страницах и общей форме (ещё 26 страниц), админка «AI-чат». Защищённые 10/10 вживую. IndexNow 9 URL, sitemaps переотправлены. Метка для недельного сравнения «до/после» по B2B-страницам.
