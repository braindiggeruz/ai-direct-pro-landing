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

**Решение владельца, 2026-10-04:** «делай всё согласно роадмапу» → решения 1, 2, 3 и 5 (раздел 2.0 роадмапа) — да; 4 выполнено (жалоба на спам chatgpt.uz отправлена 04.10); 7 — нет; 6 — да при условиях роадмапа (данные из раздела 2.0, решение до 27.10). Роадмап: `gptbot.uz-audit/raw/seo-2026-10-04/ROADMAP-DETAILED-2026-10-04.md`, разделы 1(a), 1(d) п. 3, 1(e), 2.1 п. 1.4–1.8.

Ветка `seo/week1-20261004` от `9a8b9ff0`, два коммита: `8266af67` и правки по двум ревью 05.10 (SHA второго — в `STATE.json` → `seo_week1_20261004.commit`: коммит не может назвать свой SHA). Защищённые страницы [P] не менялись: `seo-protection check` — 10/10 на базе `2026-10-01-paid-chat-honesty`; побайтовое сравнение HTML всех десяти со сборкой `9a8b9ff0` — 0 отличий (включая `<head>`, JSON-LD, `<script>` и имена файлов). Имена файлов в `dist/assets`, `.vite/manifest.json` и стартовый бандл чата те же. HTML изменился у 20 незащищённых страниц из таблицы ниже, больше ни у одной; из остальных файлов `dist/` изменились только `llms.txt`, `llms-full.txt`, `sitemap.xml`, `sitemap-updates.xml` и штамп `gptbot-release.json`.

| URL | Отметка | Что изменилось | Сниппет/H1 |
|---|---|---|---|
| `/ru/blog/chat-gpt-online/` | — | Ключи RU-чата убраны: «чат gpt онлайн», «chat gpt онлайн», «chatgpt онлайн», «чат гпт онлайн», «gpt онлайн», «gpt чат онлайн», «ai чат онлайн», «нейросеть онлайн», «искусственный интеллект онлайн»; ещё «чат с искусственным интеллектом» (ключ статьи chat-s-ii) и «ai-чат на русском» (`/ru/gpt-na-russkom/`). Остались «задать вопрос нейросети», «gptbot uz». Блок входа в чат закрывает первый раздел — стоит перед H2 «Как пользоваться чатом GPT онлайн» (пара C23) | нет; title и H1 — в релизе главной 19.10 (301 или «как пользоваться») |
| `/ru/blog/ii-chat-na-russkom-chto-eto-i-kakie-byvayut/` | — | Ключи: убраны голое «ии чат» (RU-чату), «ии чат на русском» (C10), «чат с ии» (статье chat-s-ii). Карточка «ИИ-чат онлайн» → `/ru/gpt-chat/` (пара C24) | нет |
| `/ru/blog/chat-s-ii-gde-poobshchatsya-s-iskusstvennym-intellektom/` | — | Ключ «ии чат бесплатно» убран (C25). Блок входа в чат закрывает раздел «Что выбрать под свою задачу» — стоит перед H2 «О чём помнить при общении с ИИ», а не внутри пункта «1. ChatGPT — сайт и приложение»; карточка «бесплатный ИИ-чат онлайн» → `/ru/gpt-chat/` | нет |
| `/ru/blog/chat-gpt-na-russkom/` | — | Блок входа в RU-чат закрывает вступление раздела «Формула точного запроса: 5 элементов» — стоит перед H3 «Плохой запрос и улучшенный запрос». В первом разделе по-прежнему одна кнопка в чат (прежний CTA) | нет |
| `/ru/blog/analogi-chatgpt-kotorye-rabotayut-v-uzbekistane/` | — | Блок входа в RU-чат закрывает первый раздел — стоит перед H2 «Основные аналоги ChatGPT: краткий обзор», после абзаца о подписке ChatGPT, а не перед ним | нет |
| `/uz/blog/chat-gpt-uzbek-biznes-uchun/` | — | Блок входа в UZ-чат закрывает раздел «Oddiy AI chat va biznes AI-bot o‘rtasidagi farq» — стоит перед H2 «AI biznesda qaysi vazifalarni bajaradi?». Абзац перед ним говорит о ChatGPT: «ChatGPT’ni sinab ko‘rish uchun … hisob ochish yetarli» (было «Oddiy AI chatni…», что спорило с «ro‘yxatdan o‘tish shart emas» в блоке). Анкор «ChatGPT’ga kirish» → «ChatGPT’ga kirish (login)» (ведёт на гайд по входу) | нет |
| `/uz/blog/chatgpt-talabalar-uchun/` | — | Анкор «ChatGPT’ga kirish» → «ChatGPT’ga kirish (login)». Блок входа уже был, его вывод тот же | нет |
| `/uz/blog/insho-yozish-suniy-intellekt-bilan/` | — | Карточка на гайд по входу: «ChatGPT kirish» → «ChatGPT’ga kirish (login)». Блок входа уже был | нет |
| `/ru/gde-polzovatsya-gpt-besplatno/` | — | Ключ «GPT онлайн бесплатно» убран (C27). Абзац до первого H2 с двумя ссылками на `/ru/gpt-chat/`: «ИИ-чат GPTBot.uz» и «откройте чат»; «есть дневной и часовой лимит» | нет |
| `/ru/gpt-dlya-ucheby/` | — | Абзац до первого H2 с двумя ссылками на `/ru/gpt-chat/` («ИИ-чате GPTBot.uz», «откройте чат») и примером вопроса | нет |
| `/ru/chto-takoe-gpt-i-kak-polzovatsya/` | — | Абзац до первого H2 с двумя ссылками на `/ru/gpt-chat/` («ИИ-чате GPTBot.uz», «Откройте чат») и примером вопроса | нет |
| `/ru/gpt-na-russkom/` | — | Абзац до первого H2 с двумя ссылками на RU-чат («бесплатный ИИ-чат GPTBot.uz», «задать в чате»), «есть дневной и часовой лимит». Новый раздел H2 «Чат GPT на русском: как писать и что умеет» (`#kak-pisat`): как писать вопрос по-русски; что чат умеет — черновики постов и писем, объяснение темы, план и конспект, варианты ответа клиенту (перевод не заявлен: только после слепой проверки ≥ 4/5, роадмап 3.3); чего не ждать — работает только с текстом, дневной и часовой лимит, может ошибаться, не заменяет медицинские, юридические и финансовые решения; написания «чат гпт на русском», «chat gpt na russkom» одной фразой; «чат жпт» и «чат джипити» — одна фраза со ссылкой на RU-чат (их владелец — `/ru/gpt-chat/`, C10). Без «официальный» и «без VPN». `lastReviewedAt`/`updatedAt` 2026-10-04 | нет; title и H1 те же |
| `/uz/` | — | Одна ссылка в теле после первого абзаца: «GPTBot.uz bepul AI chati» → `/uz/gpt-uzbek-tilida/`, с оговоркой, что бизнес-бот настраивается отдельно на данных компании (бесплатный чат — не пробная версия заказного бота). Блок в первом экране — вместе с R-S1. Карточки: «ChatGPT kirish» → «ChatGPT’ga kirish (login)»; «GPT o‘zbek tilida — AI-chat» → «O‘zbek tilida prompt yozish qo‘llanmasi» (ведёт на гайд C6) | нет |
| `/uz/suniy-intellekt/` | — | Абзац до первого H2 с двумя ссылками на UZ-чат («GPTBot.uz bepul AI chati», «o‘zbekcha AI chatni»). Карточка «ChatGPT kirish» → «ChatGPT’ga kirish (login)» | нет |
| `/uz/gpt-uzbek-tilida-ai-chat/` (гайд C6) | — | Ключи семьи A убраны: «chatgpt o‘zbek tilida», «chat gpt o‘zbek tilida», «gpt uzbekcha», «ai chat o‘zbek tilida» (владелец — UZ-чат). Абзац до первого H2 с двумя ссылками на UZ-чат. Ссылка и карточка «GPTBot.uz AI-chat qo‘llanmasi» → `/uz/gpt-chat-qollanma/` (пара C28) | нет |
| `/uz/gpt-chat-qollanma/` | — | Ключ «gpt uzbek tilida qollanma» убран (это фраза гайда C6). Второе предложение со ссылкой «o‘zbekcha AI chat» на UZ-чат до первого H2 (первая ссылка на чат там уже была) | нет |
| `/uz/gpt-telegram-instagram-ideya/` | — | Карточка на гайд C6: «GPT o‘zbek tilida AI chat» → «O‘zbek tilida prompt yozish qo‘llanmasi» | нет |
| `/uz/muallif-boris-gerasimov/` | — | Анкор ссылки на UZ-чат: «o‘zbek tilidagi AI-chat qo‘llanmasi» → «o‘zbek tilidagi AI chat» (ссылка ведёт на сам чат; анкоры с «qo‘llanma» — у гайда C6 и мануала C28) | нет |
| `/ru/seo-prodvizhenie-saytov-tashkent/` | — | title и og:title: «SEO-продвижение сайта в Ташкенте от 2 490 000 сум/мес \| GPTBot.uz» (65) → «SEO-продвижение сайтов в Ташкенте от 2 490 000 сум/мес» (54) | title |
| `/ru/stoimost-chat-bota/` | — | title и og:title: «Стоимость чат-бота в Узбекистане 2026: от 990 000 сум \| GPTBot.uz» (65) → «Стоимость чат-бота в Узбекистане 2026: от 990 000 сум» (53) | title |
| `/ru/gpt-chat-guide/` | — | Ключ «нейросеть онлайн бесплатно» убран (C26). HTML не изменился: ключи контентных страниц в HTML не выводятся | — |
| `/llms.txt` | — | Открывается двумя строками о двух направлениях (роадмап 1(d) п. 3): независимый текстовый AI-чат на узбекском и русском с бесплатным лимитом, не ChatGPT и не продукт OpenAI; студия AI-ботов для бизнеса. Раздел «Who GPTBot.uz is» с фактами о сущности. Без чисел лимита — они выходят 12.10 вместе с чат-страницами. Исправлено: `/` — русская главная, а не выбор языка; `/ru/` — постоянный редирект 301 на `/` (так в `_redirects`, записи `ru-hub-to-homepage` в `content/seo/redirects.json`); «chatgpt ochish» → гайд по скачиванию (C11). В «Recommended page for each intent» строки «chatgpt uzbek tilida / chatgpt uzbekcha» и «ии чат / чат гпт онлайн» ведут на наши чаты с пометкой «independent AI chat, an alternative to ChatGPT, not ChatGPT; ChatGPT itself is at chatgpt.com». Last updated 2026-10-04 | — |
| `/llms-full.txt` | — | Начало приведено к `llms.txt`: те же две строки; раздел «AI chat in Uzbek and Russian» (только текст, без регистрации, дневной и часовой лимит без чисел, не ChatGPT и не OpenAI; страницы обоих чатов, мануала C28, гайда C6 и `/ru/gpt-na-russkom/`); описания гайдов о ChatGPT — «ChatGPT’ga kirish (login)», «yuklab olish / ochish»; те же строки «по интенту» с пометкой «not ChatGPT». Last updated 2026-10-04 | — |

**Мостики в чат ([RM] Б6, роадмап 1(e) п. 1).** Все 16 страниц, ни одна не защищена. Статьи (8): у `chatgpt-talabalar-uchun`, `insho-yozish-suniy-intellekt-bilan` и `chatgpt-claude-gemini-ozbekistonda` блок уже был, пять получили мостик. Контентные страницы (8): у семи — две ссылки на чат своего языка до первого H2 (первая — с брендом, вторая — простым действием вроде «откройте чат», без повтора точного ключа «ИИ-чат онлайн»); у `/uz/` — одна ссылка в теле. Вопрос посетителя в адрес не попадает: ссылки ведут на `/ru/gpt-chat/` и `/uz/gpt-uzbek-tilida/` без `#entry` и без query, скрипт клика отправляет только `location.pathname` и id мостика.

**Шаблон блога (меняет только незащищённые статьи).** `scripts/chat-entry-cta.ts`: мостики `CHAT_BRIDGES` для пяти статей. Реестр `src/shared/chat-entry.ts` читает сам чат (он подставляет пример вопроса), поэтому новая запись там изменила бы скрипт чата и HTML обеих защищённых чат-страниц. Мостик ведёт на страницу чата без `#entry` и без вопроса в адресе, а пример вопроса напечатан в статье. Клик считается тем же событием `article_chat_click` (поле `intent` = id мостика). Место блока: у мостика есть поле `before` — заголовок статьи (H2 или H3); блок закрывает раздел, который кончается прямо перед этим заголовком, поэтому не разрывает абзац и его продолжение, и текст о лимитах, подписке или регистрации ChatGPT не читается как текст о GPTBot.uz. Если заголовок переименуют, блок закрывает первый раздел с текстом. `tests/chat-entry.test.ts` проверяет: заголовок `before` есть ровно один, перед блоком текст, сразу после блока — этот заголовок, в разделе с блоком нет второй кнопки в тот же чат. `scripts/prerender-blog.ts` берёт место из `chatEntryPosition`; у статей с записью в реестре место прежнее (после второго элемента), вывод блока на шести защищённых статьях и на трёх незащищённых, где он уже был, не изменился.

**Карта интентов (`content/seo/intent-manifest.json`).** C22: пометка PROVISIONAL снята, этапа 2 не будет; владелец голого «chatgpt kirish» — тот наш URL, куда его ведёт Google, ни один URL к нему не тянем; голый «ChatGPT kirish» анкором не используется. Замеры T0+14/T0+28, пороги, этап 2 и набор отката релиза 30.09 оставлены как история с пометкой «HISTORICAL — void since 2026-10-04»; шаг 3 этапа 2 помечен устаревшим (три голых анкора «ChatGPT kirish» 04.10 стали «ChatGPT’ga kirish (login)» и ведут на гайд по входу). Единственное правило отката — П-CTR. C18: текст «owns» согласован с C22. C10: «чат жпт / чат джипити» в `mustNotTarget` страницы `/ru/gpt-na-russkom/`. C6: гайд владеет «как писать промпты на узбекском», ключи семьи A — в его `mustNotTarget`; кто владеет голым «gpt o‘zbek tilida», не решено (см. «Не вошло»). Новые пары: C23–C27 — RU-чат владеет голым «ии чат», «чат гпт онлайн», «… онлайн бесплатно», «чат … бесплатно», а пять русских страниц держат «что это / какие бывают / где пообщаться / как пользоваться / где бесплатно»; C28 — `/uz/gpt-chat-qollanma/` (возможности, лимиты и безопасность нашего чата) против гайда C6 (как писать промпты). У мануала свой H1; с H1 гайда совпадает только его primaryKeyword «AI chatdan qanday foydalanish». Сами ключи RU-чата (защищённой страницы) меняет только R-S1.

**Чат перед выкатом: «без ответа» (D1).** Роадмап (раздел «Уже решено ведущим по данным», последний пункт) снял дату 07–08.10 из [RM] Б6: надёжность после перехода на Z.ai замерена 04.10, мостики можно выпускать сразу. Замер 05.10 в 05:47 по Ташкенту — тот же запрос, что в `execution/KPI-BASELINE-2026-10-04.md` §5 (`python F:/Claude/gptbot-tools/wr.py -- d1 execute gptbot-ai-drafts --remote --json --command "SELECT …"`, только чтение, тексты переписки не читались), окно — с перехода на Z.ai (03.10 05:09 UTC):

| Сутки по Ташкенту | Ходов | С ответом | Без ответа | % |
|---|---|---|---|---|
| 03.10 с 10:09 | 73 | 70 | 3 (1 отпущен, 2 не завершились) | 4,1% |
| 04.10 | 75 | 72 | 3 (2 отпущены, 1 не завершился) | 4,0% |
| 05.10 до 01:19 (неполные сутки) | 4 | 3 | 1 (отпущен) | — |
| **С перехода на Z.ai** | **152** | **145** | **7** | **4,6%** |

Порог 10% не превышен, выкладку можно выпускать.

**Страховка после выката.** Агент каждое утро повторяет этот запрос по полным суткам Ташкента. Если доля «без ответа» больше 10% за любые 3 дня подряд (сумма ходов трёх полных суток), мостики и ссылки в чат из тела страниц откатываются: `git revert` коммитов выкладки (сначала второго, потом `8266af67`), затем guarded-деплой (`npm run build:production` в основной LF-копии и `deploy_runner.py check|deploy`) и строка в этом журнале. Остальные правки выкладки (ключи, карта интентов, анкоры, раздел `/ru/gpt-na-russkom/`, `llms.txt`) после разбора возвращаются отдельным коммитом без мостиков.

**Не вошло — перенесено:**
- Подстановка примера вопроса в чат для пяти новых мостиков: id нужно добавить в `CHAT_ENTRIES`, это меняет скрипт чата → релиз R-S1 (12.10).
- Блок «O‘zbekcha bepul AI chat» в первом экране `/uz/` и строка на оба чата на `/` (решение 3 = да) → R-S1.
- Title и H1 `/ru/blog/chat-gpt-online/`, H1 `/uz/gpt-chat-qollanma/` и гайда C6: оба H1 и заголовки статей выводятся на `/` → релиз главной 19.10.
- Голое «gpt o‘zbek tilida» / «gpt uzbek tilida» — кандидат к решению в релизе главной 19.10 по данным того дня: отдать его UZ-чату и тогда же вместе сменить primaryKeyword и H1 гайда C6 (H1 выводится на `/`). Факты 04.10: в keyword universe фраза в семье «uzbek-language chat» с интентом use-online-now; в GSC за 28 дней строк нет; все анкоры «GPT o‘zbek tilida» ведут на `/uz/gpt-uzbek-tilida/`. До решения фраза остаётся у гайда и в `mustNotTarget` не входит.
- Анкоры и ключи на защищённых страницах → R-S1: на `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/` анкор «ChatGPT kirish yo‘riqnomasi» и карточка «ChatGPT’ga kirish» (лучше «ChatGPT’ga kirish (login) …»), а в ключах — «ChatGPT o‘zbek tilida» и «AI chat o‘zbekcha» (семья A, владелец — UZ-чат); у `/uz/blog/ai-chat-nima-va-qanday-turlari-bor/` ключ «ai chat o‘zbek tilida» (семья A); ключи «chatgpt uz», «chat gpt uz» и русский «чат gpt онлайн» в полях UZ-чата и RU-чата. Ключи статей блога выводятся в JSON-LD, поэтому это HTML защищённых страниц.
- Числа лимита («15 в день, 5 в час») в `llms.txt` → 12.10.
- Когда R-S1 добавит на `/ru/gpt-chat/` блок народных названий ChatGPT, ссылку «ИИ-чат GPTBot.uz» с фразы «чат жпт / чат джипити» на `/ru/gpt-na-russkom/` направить на его якорь.
- «переводы» в списке «Учёба: конспекты, объяснения, переводы» на `/ru/gpt-na-russkom/` (текст до 04.10) — пересмотреть по итогу слепой проверки перевода (роадмап 3.3, 15–23.10): ниже 4/5 — убрать.

**Проверка (05.10):**
- `npm run build:production` — сборка и штамп выпуска; в штампе — `seo-protection` 10/10 и бюджет бандла чата: старт 108 162 Б brotli (+354 Б к записи `d85d3303`; столько же у сборки `9a8b9ff0` — рост пришёл из `9a8b9ff0`), ленивые части те же.
- Побайтовый diff HTML 10 защищённых со сборкой `9a8b9ff0` = 0, имена файлов `dist/assets` те же — в двух копиях, каждая против базы с теми же концами строк: CRLF-копия ветки против снимка `F:/Claude/gptbot-tools/tmp/week1-baseline-dist/`, LF-копия против LF-сборки `9a8b9ff0` (`F:/Claude/gptbot-tools/tmp/week1-baseline-dist-lf/`). В обеих изменились одни и те же 20 HTML-страниц.
- `seo:audit` — 0 critical; `tsc -b` — 0 ошибок; eslint изменённых TS-файлов — 0.
- `npm test` в LF-копии (с `apps/gpt-backend/node_modules`): 1250 из 1252. Два падения — в `tests/lead-radar.test.ts` («manual approval is fail-closed…», «store enforces tenant isolation…»); на `9a8b9ff0` они падают так же, выкладка lead-radar не трогает. В CRLF-копии ветки к ним добавляются падения окружения: `chat-bundle-budget` «the gate runs where a release is built» (регэксп `\n {4}manifest: true,\n` против CRLF в `vite.config.ts`) и файлы `gpt-backend-security`, `web-security-hardening` (в копии нет `apps/gpt-backend/node_modules`).
- Ссылки: все 537 внутренних ссылок `<a>` на 20 изменённых страницах ведут на существующие страницы; новые цели — только `/ru/gpt-chat/`, `/uz/gpt-uzbek-tilida/` и `/uz/gpt-chat-qollanma/`; ни у одной ссылки в чат нет query.
- В `sitemap.xml` у `/` и `/ru/gpt-na-russkom/` lastmod 2026-10-04: lastmod главной в карте — самая свежая дата сайта, HTML главной не менялся.

**Сборка выпуска.** Собирать и выкатывать только из основной LF-копии `F:/Claude/gptbot-gsc-audit-20260917` после слияния ветки (fast-forward от `9a8b9ff0`), как ждёт `deploy_runner`. Рабочая копия ветки выписана с CRLF (`core.autocrlf=true`): её `dist/llms.txt` и другие текстовые файлы получают CR, и сравнивать сборки можно только с базой из копии с теми же концами строк.

**После выкатки (владелец):** «Запросить индексирование» в GSC для 17 URL, по 8–9 в день из-за квоты, обычной кнопкой, не Indexing API. Порядок: `/ru/gpt-vs-chatgpt-sravnenie/`, `/ru/blog/chat-s-ii-gde-poobshchatsya-s-iskusstvennym-intellektom/`, `/ru/blog/chat-gpt-na-russkom/`, `/ru/gde-polzovatsya-gpt-besplatno/`, `/ru/blog/chat-gpt-online/`, `/uz/gpt-uzbek-tilida-ai-chat/`, `/ru/gpt-na-russkom/`, `/ru/blog/analogi-chatgpt-kotorye-rabotayut-v-uzbekistane/` (день 1); `/uz/blog/chatgpt-talabalar-uchun/`, `/uz/`, `/uz/suniy-intellekt/`, `/ru/gpt-dlya-ucheby/`, `/uz/blog/chat-gpt-uzbek-biznes-uchun/`, `/uz/blog/insho-yozish-suniy-intellekt-bilan/`, `/uz/gpt-chat-qollanma/`, `/ru/chto-takoe-gpt-i-kak-polzovatsya/`, `/uz/blog/chatgpt-claude-gemini-ozbekistonda/` (день 2; у последней HTML не менялся).

## Выкаты

- **2026-10-01, R2+R3 в проде** (`26b058e5`, затем `0ca0a699`): ревизия `2026-10-01-paid-chat-honesty` вживую 10/10 после снятия обфускации e-mail Cloudflare (сама обфускация меняет HTML у всех страниц с адресом). IndexNow — 288 URL (HTTP 200), в GSC переотправлены `sitemap.xml`, `sitemap-updates.xml` и обе RSS. Окна C22/C11 гейтами больше не служат (решение roadmap v2); этот выкат — отметка для недельного сравнения «до/после».
- **2026-10-03, R4 в проде** (`6502224c`): публичная оферта RU/UZ и политики; оплата выключена. IndexNow 5 URL, sitemaps переотправлены.
- **2026-10-03, Z.ai** (`7d35a803`, затем `a69ab2c0`): ответы чата — Z.ai GLM-5.3-Flash из предоплаченного пакета владельца; защищённые 10/10.
- **2026-10-03, R5–R7 в проде** (`58265bf2`, тёмная репетиция `93b1ee27`, итог `b69f953e`): оферта v2 (без возврата), политики, формы с бюджетом на 4 B2B-страницах и общей форме (ещё 26 страниц), админка «AI-чат». Защищённые 10/10 вживую. IndexNow 9 URL, sitemaps переотправлены. Метка для недельного сравнения «до/после» по B2B-страницам.
