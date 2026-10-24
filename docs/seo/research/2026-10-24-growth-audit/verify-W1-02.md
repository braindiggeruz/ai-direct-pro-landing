# Проверка W1-02 — `/uz/suniy-intellekt/` (состязательная)

Дата: 2026-10-24. Роль: опровергнуть пункт W1-02 из `BACKLOG.md` / `backlog.json`. Всё ниже перепроверено заново: GSC (бесплатные вызовы), `dist/` этой ветки, живой GET, один платный SERP-вызов (13 кредитов, `whoami` 23 185 → 23 172).

**Вердикт: НЕ опровергнут, но в нынешнем виде выкатывать нельзя.** Цифры подтверждаются полностью. Действие честное и не спорит с `intent-manifest.json`. Защищённые страницы не задеты: на «/» страница выводится по H1, а title печатается только на самой странице и в `atom.xml`. В спецификации при этом четыре фактические ошибки: одна ломает тест, одна дублирует FAQ, одна дублирует блок продукта, и не закрыт интент «turlari». Оценка завышена примерно вдвое. Ниже — исправленное действие.

## 1. Числа: заявлено и перепроверено

| Утверждение пункта | Перепроверка | Источник | Итог |
|---|---|---|---|
| GSC 3 мес. (07-21..10-21): 32 показа, поз. 13,6, 0 кликов | 32 / 13,6 / 0 | `get_search_console_performance` page=equals, resultId `449cded1-42d2-4743-b9fa-cf61c3bd32f8` | ✔ |
| Запросы на поз. 58–77 | «ai sun iy intellekt» 1 показ, поз. 58; «suniy intellekt turlari» 1 / 62; «suniy intellekt haqida malumot» 1 / 77 | `5cea35e7-dea6-4669-8087-b19b0d0fdb1d` | ✔. Средняя 13,6 получается за счёт мусорных запросов «ai40177», «ai71273», «ai71778», «ai78117»: 17 показов на поз. 5–8,8. По настоящим ИИ-запросам за 3 месяца у страницы **3 показа** |
| GSC 28 дн.: 0 / 14, поз. 20,1 | 0 / 14 / 20,1 | `70221964-033c-4ea6-8d51-6af7181e6ed1` | ✔ |
| Других страниц сайта по «intellekt» / «suniy» нет | По «intellekt» есть только эта страница и один длинный запрос на промптах (11 показов, поз. 10,1). «suniy» — только эта страница. «intelekt» — 0 строк | `d0607271-…`, `9fa4d9bf-…`, `8f0a3106-…` | ✔ каннибализации нет |
| В индексе | «Submitted and indexed», googleCanonical = наш, последний обход 2026-10-11 (после правки от 10-07) | `inspect_urls` (этот сеанс) | ✔ |
| 7 входящих | 7 страниц: «/» 🔒, `/uz/`, `/uz/blog/chatgpt-uzbek-tilida-promptlar/` 🔒, insho, marketing-nima, slayd-tayyorlash (2 ссылки), seo-xizmati | `grep` по `dist/` | ✔ по числу. Но защищённых **две**, а не одна, как пишет L3-02. 5 из 8 анкоров — «sun’iy intellekt nima» |
| Спрос: suniy intellekt 8 100; sun’iy intellekt 6 600; сунъий интеллект 1 600; семья «nima» ≈4 290 | 8 100 / 6 600 / 1 600. 4 290 = 1 300 (suniy … nima) + 1 300 (сунъий … нима) + 1 000 (sun’iy … nima) + 480 (turlari) + 210 (haqida malumot) | `l3-data/kw1_table.txt:31,37,61,66,72,78`; `kw2_table.txt:79,91` | ✔. «Семья nima» на деле включает turlari и haqida malumot |
| ~990 слов, нет истории, нет таблицы сервисов, нет схемы | 961 слово в `<main>`, 1 005 в `<body>`. H2 — 9 штук, `<figure>` — 0. Истории и таблицы сервисов нет | `dist/uz/suniy-intellekt/index.html` = живой GET (sha текста body `145b8e19d3ee` совпадает) | ✔ |
| «нет входа в продукт» (L6-02) | **Неверно.** Hero-CTA «AI chatni o‘zbek tilida sinash» → `/uz/gpt-uzbek-tilida/`. Блок 2 (`linkp`) стоит сразу после вступления и даёт 2 ссылки в чат. Ещё одна ссылка с анкором «ChatGPT o‘rniga o‘zbekcha AI chat» и одна в `internalLinks` | `content/pages/uz/suniy-intellekt.json` bodyBlocks[2], ctaPrimary | ✘ ошибка в доказательствах |
| SERP: №1 salom-ai.uz, Википедия, 723/768 слов | Совпадает с `l6-data/serp_l6.json` (59a6e29e) и `serp_l6_hlru.json` (8a84033f) | файлы L6 | ✔ |

## 2. Новые данные, которых у пункта не было (SERP hl=uz, mobile, `dc9995f4`)

| Запрос (объём) | Топ органики | Чего это требует от страницы |
|---|---|---|
| suniy intellekt nima (1 300) | PDF inlibrary, YouTube «Namunaviy esse … Milliy sertifikat», platina, cyberleninka, jadid, infocom, YouTube ×2, scribd, slideshare (#10: «tushunchasi 1956-yilda»). **zukko.ai «Sunʼiy intellekt nima: taʼrifi va turlari» — только #12** | Выдача учебная: эссе, реферат, слайды. Это подтверждает блоки «esse/referat reja» (шаг 6). Сильного explainer-конкурента нет, но похожая статья ИИ-продукта стоит лишь на 12-м месте |
| suniy intellekt turlari (480) | infocom «**Eng mashhur 4 ta sun’iy intellekt**» #1, salom-ai blog «turlari (**ANI, AGI, ASI**)» #2, infocom turlari #3, mohirdev «**tor SI, umumiy SI, super SI**» #4, PDF «Tor (Narrow) SI» #5, PDF «**Reaktiv mashinalar**» #6, … zukko.ai #11 | Все лидеры дают классификацию **по возможностям (ANI/AGI/ASI)** и **по функциям** (reaktiv mashinalar, cheklangan xotira…). У нас «turlari» — таблица по применению (matn modellari, kompyuter ko‘rishi…). Пункт добавляет «turlari» в ключи, но эту классификацию **не добавляет**. №1 — список сервисов: это подтверждает шаг 5 |

## 3. Проверка действия по шагам

| Шаг | Проверка | Итог |
|---|---|---|
| 1. Апострофы primaryKeyword → U+2019 | `primaryKeyword` в HTML не выводится (ASCII «sun'iy» в `dist`: 0 вхождений, JSON-LD keywords нет). Demand-гейт (`src/shared/demand-gate.ts`) касается только `money`/`niche`, а страница — `blog`. Шаг убирает предупреждение `src/shared/audit.ts:207` («title не содержит ключ») | Безвредно. На трафик эффекта 0 |
| 2. Title, H1 не трогать | «/» печатает H1 (`dist/index.html`: «Sun’iy intellekt nima: oddiy tushuntirish, turlari va O‘zbekistonda qo‘llanishi»). Текущий title встречается только в `dist/uz/suniy-intellekt/index.html` и `dist/updates/atom.xml` | ✔ G4 выполняется, защищённый «/» не меняется |
| 3. H2 «…gaplashib ko‘ring» + ссылка «sun’iy intellekt chat (o‘zbek tilida)» | Анкор соответствует ключу чата (`gpt-uzbek-tilida.json:17` «sun’iy intellekt chat»). `tests/seo-content-guards.test.ts:48` проходит: анкор ≠ собственный ключ. **Но** блок 2 с двумя ссылками в чат уже существует, и в нём анкор «GPTBot.uz **bepul** AI chati» без раскрытия пробного доступа | Нужно **заменить** блок 2, а не добавлять второй |
| 4. История с источниками | 1950, 1997, 2012, 2017, 11.2022 — верно. По 1956: термин «artificial intelligence» появился в предложении Маккарти и др. от 31.08.1955, семинар прошёл летом 1956 | Формулировку уточнить |
| 5. Таблица сервисов | C37 (`intent-manifest.json` pairs[30]) отдаёт сравнение по доступности, цене и приватности статье `/uz/blog/chatgpt-claude-gemini-ozbekistonda/`. Таблица без цен и лимитов, со ссылкой на статью, с C37 не спорит. **Но** GPTBot.uz под заголовком «Mashhur…» выдаёт себя за известный сервис, а «разработчик» для GPTBot.uz неточен: чат работает на сторонних моделях (`wrangler.toml:444` `GPT_MODEL_PROVIDER = "zai"`; формулировка сайта — `gpt-chat-qollanma.json`: «uchinchi tomon modellari va API-provayderlaridan foydalanadi») | Строку GPTBot.uz отделить и подписать честно |
| 6. Школьные блоки, кириллица, бизнес ниже | Спрос на «suniy intellekt afzalliklari / referat / prezentatsiya / kelajagi» — null (`kw2_table.txt:191`). Опора — выдача (эссе, PDF), а не объём. H2 «cheklovlari» уже есть | «Afzalliklari va xavflari» сделать из «cheklovlari», а не отдельным блоком |
| 7. FAQ +3 | «Sun’iy intellekt o‘zbek tilida ishlaydimi?» **уже есть** (faq[2]) | Новых FAQ — 2. В faq[2] дописать про пробу |
| 8. figure-схема | `<figure>` на странице 0. Риска нет | ✔ |
| 9. 5 доноров | Ни один донор сейчас не ссылается на страницу (grep). Все незащищённые. GSC 28 дн.: talabalar 2/47, qollanma 0/17, A-4 0/96, referat 1/100, C37 1/81 (`d46dfab9-d4a2-46a7-aba2-d2ff6a9ba20f`). Победителей, которым можно навредить, нет. `l5_link_plan.json` целевых ссылок на эту страницу не содержит, конфликта нет | ✔. Анкоры разнообразить: «nima» уже 5 из 8 |
| 10. Файл в `trialFiles` | `tests/seo-trial-product-truth.test.ts:36-37` требует в исходнике `/3 ta (?:bepul )?sinov/` **и** `/yangilanmaydi|…/`. В тексте пункта «yangilanmaydi» нет, в текущем файле нет ни того, ни другого | ✘ Тест упадёт. Добавить «sinov javoblari yangilanmaydi» |

## 4. Оценка эффекта

Пункт: ≈1–6 клика = K 0,04 × диапазон L3-02 (15–155). Но K в `synth-data/calibration.py` считается к **нижней** оценке (спрос × 0,38% × 0,92). Умножать его на верхнюю оценку L3 (головы × 0,7%) — смешение методов.

Если считать тем же методом, что и калибровку:
- семья «nima»: 4 290 × 0,0038 × 0,92 = 15,0 → × 0,04 = **0,6**;
- с головами: 4 290 + 16 300 = 20 590 (верхняя граница, ряды Google Ads пересекаются) → 72,0 → × 0,04 = **2,9**.

**Исправленная оценка: ≈0–3 клика за первые 28 дней, уверенность низкая.** Две самопроверки: (а) у самой страницы сейчас K = 0 (14 показов / 0 кликов, `70221964`); (б) похожая статья ИИ-продукта zukko.ai стоит на organic #11–12 и по «nima», и по «turlari» (`dc9995f4`). Значит, позиции 6–9 за 28 дней маловероятны. Ценность пункта — в долгом горизонте: это крупнейшая узбекская голова про ИИ, а выдача по «nima» состоит из PDF и видео.

## 5. Исправленное действие (что именно делать)

`content/pages/uz/suniy-intellekt.json`:
1. `primaryKeyword` «sun’iy intellekt»; в `secondaryKeywords` «sun’iy intellekt nima» → U+2019; добавить «suniy intellekt nima», «suniy intellekt turlari», «sun’iy intellekt haqida ma’lumot», «сунъий интеллект нима».
2. `title` — «Sun’iy intellekt nima: turlari, tarixi, o‘zbekcha misollar». `h1` не трогать.
3. **Заменить** `bodyBlocks[2]` (linkp «…sinab ko‘rishingiz mumkin», анкор «GPTBot.uz bepul AI chati») на h2 «Sun’iy intellekt bilan o‘zbekcha gaplashib ko‘ring» + linkp: «GPTBot.uz — mustaqil o‘zbekcha AI chat: ro‘yxatsiz 3 ta bepul sinov javobi, keyin AI paket; sinov javoblari yangilanmaydi. OpenAI yoki ChatGPT’ning rasmiy mahsuloti emas.» Ссылка {chat} → `/uz/gpt-uzbek-tilida/`, анкор «sun’iy intellekt chat (o‘zbek tilida)». Сохранить пример промпта «Sun’iy intellekt nima? Uchta oddiy misol bilan tushuntir».
4. В H2 `#turlari` перед текущей таблицей добавить h3 и список «Imkoniyat bo‘yicha: tor SI (ANI) — bugun mavjud yagona tur; umumiy SI (AGI) va super SI (ASI) — hozircha nazariy» и «Funksiya bo‘yicha: reaktiv mashinalar, cheklangan xotira; ‘ong nazariyasi’ va ‘o‘zini anglash’ — gipotetik». Текущую таблицу оставить с подзаголовком «Qo‘llanish bo‘yicha».
5. H2 «Sun’iy intellekt tarixi: Tyuring testidan ChatGPT’gacha»: 1950 Тьюринг, «Computing Machinery and Intelligence»; 1955–1956 — предложение и Дартмутский семинар, термин «artificial intelligence»; 1997 Deep Blue — Каспаров; 2012 AlexNet; 2017 «Attention Is All You Need»; 30.11.2022 ChatGPT. У каждой даты источник в `sources`.
6. H2 «Mashhur sun’iy intellekt xizmatlari»: таблица из 4 строк — ChatGPT/OpenAI, Gemini/Google, Claude/Anthropic, DeepSeek. Колонки: разработчик, сильная сторона по официальному описанию, официальная ссылка, «narx va limitlar — rasmiy saytda tekshiring». GPTBot.uz — **не строкой таблицы**, а абзацем после неё: «Bu sahifa muallifi — GPTBot.uz: mustaqil o‘zbekcha servis, uchinchi tomon modellaridan foydalanadi, mashhur xizmatlar qatoriga kirmaydi». Ссылка на `/uz/blog/chatgpt-claude-gemini-ozbekistonda/` с анкором вроде «ChatGPT, Claude va Gemini taqqoslash». Из C37 не брать «chatgpt yoki gemini».
7. H2 `#cheklovlar` → «Afzalliklari va xavflari»: добавить список плюсов, текущий список оставить как «xavflari». Затем блок «Sun’iy intellekt haqida esse yoki referat uchun reja» со ссылками на insho / referat / slayd / `/uz/taqdimot-ai/` и абзац кириллицей «Сунъий интеллект нима?». Бизнес-H2 `#biznes-uchun` перенести ниже `#ish-or-ni`.
8. FAQ: дописать в faq[2] «…GPTBot.uz’da o‘zbekcha sinab ko‘rish mumkin: 3 ta bepul sinov javobi, keyin AI paket». Добавить 2 FAQ: «Eng mashhur sun’iy intellekt xizmatlari qaysilar?» и «Sun’iy intellektdan bepul foydalanish mumkinmi?». Во втором — бесплатные тарифы официальных сервисов («rasmiy saytda tekshiring») и 3 пробных ответа без обновления.
9. Один `figure`: SI ⊃ mashinali o‘rganish ⊃ chuqur o‘rganish ⊃ katta til modellari, `alt` на узбекском (U+2018/U+2019).
10. Обновить `updatedAt`/`lastReviewedAt`. `createdAt` не трогать: тест `ai-chat-guide-schema` сверяет datePublished с createdAt.

Доноры — по одной контекстной ссылке, анкоры разные: talabalar → «sun’iy intellekt nima», qollanma → «sun’iy intellekt haqida ma’lumot», A-4 → «sun’iy intellekt turlari», referat → «sun’iy intellekt tarixi» (слова «referat» в анкоре нет, как требует пункт), C37 → «sun’iy intellekt nima va turlari».

Тесты: файл добавить в `trialFiles` (`tests/seo-trial-product-truth.test.ts:13`). После `npm run build:fast` прогнать `node --import tsx --test tests/seo-trial-product-truth.test.ts tests/ai-chat-guide-schema.test.ts tests/seo-content-guards.test.ts tests/seo-protection.test.ts`. `assertSeoProtection(dist)` должен пройти с текущим BASELINE без изменений. `protected = false`.

## 6. Файлы проверки

- `verify-data/W1-02_serp_dc9995f4.json` — новый SERP (hl=uz, mobile).
- GSC resultId: `449cded1`, `5cea35e7`, `70221964`, `d0607271`, `09e55e75`, `9fa4d9bf`, `8f0a3106`, `d46dfab9`.
