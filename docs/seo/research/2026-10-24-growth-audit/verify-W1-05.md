# Проверка W1-05: ссылки на студию презентаций (состязательная)

Дата: 2026-10-24. Роль: опровергнуть пункт W1-05 из `BACKLOG.md` / `backlog.json`. Всё ниже перепроверено заново:
- GSC (бесплатные вызовы) и `inspect_urls`;
- GA4 page performance (бесплатно);
- собственный обход `dist/` этой ветки (скрипт `graph.py` в scratchpad, 301 страница);
- живой GET двух страниц;
- один платный SERP-вызов: 3 ключа, depth 50, mobile, loc 2860. Ушло 30 кредитов, `whoami` 23 172 → 23 142. Сводка: `verify-data/W1-05_serp_9d652680.json`.

**Вердикт: ОПРОВЕРГНУТ как пункт роста трафика.** Числа в пункте совпадают. Но из них не следует ни трафик, ни «путь к платной студии»:
- все три цели в индексе, две из них Google обошёл за последние 2 дня;
- по крупнейшим ключам студии gptbot.uz нет в топ-50;
- девять страниц-источников вместе приносят 20 органических кликов за 28 дней.

Одно утверждение в доказательствах ложное: спрос по A5/C40 **измерен** в L3 этого же аудита. Полезное ядро пункта — это гигиена, а не SEO: на `/ru/tarify-ai-chat/` путь `/uz/tariflar/` напечатан текстом без ссылки. Плюс 2–3 уместные ссылки там, где в тексте уже говорится о слайдах. Ниже — урезанное действие и оценка ≈0 кликов.

## 1. Числа: заявлено и перепроверено

| Утверждение пункта | Перепроверка | Источник | Итог |
|---|---|---|---|
| `/ru/prezentatsiya-ai/`: 2 входящих, глубина 2 | 2 (`/ru/gpt-dlya-ucheby/` из `<main>`, `/uz/taqdimot-ai/` из шапки/подвала), глубина 2 | обход `dist/` | ✔ |
| `/uz/taqdimot-ai/`: 5 входящих | 5: talabalar, referat, slayd-tayyorlash (из `<main>`), RU-студия, `/uz/tariflar/` (из шапки/подвала) | обход `dist/` | ✔ |
| `/uz/tariflar/`: 2 входящих, глубина 3 | 2 (обе страницы студии), глубина 3 | обход `dist/` | ✔ |
| RU-чат: 190 входящих | 190, но в `<main>` только 29. Остальные 161 — навигация | обход `dist/` | ✔ число верное, сравнение некорректное: студии нет в навигации |
| GSC 28 дн. (09-24..10-21): prezentatsiya-ai 0 / 4, поз. 30; taqdimot-ai 1 / 18, поз. 6,6 | 0 / 4 / 30; 1 / 18 / 6,6 | `0a883ca8-f592-4202-8aea-7f63862cbf49` | ✔ |
| `/uz/tariflar/` | 0 / 4, поз. 5 | `0eb8fd52-8de4-47d0-9cbc-6324e96c9c71` | ✔ |
| Запросы о презентациях за 3 мес.: 0–5 показов | «презентац» 0 строк, «slayd» 0, «prezentats» 0. «taqdimot» — 1 строка: «taqdimot uz», 5 показов, поз. 5, на taqdimot-ai | `3e668a1e`, `2195548b`, `50d44476`, `aaaff828` | ✔ |
| «Спрос по ключам A5/C40 не измерен» | **Неверно.** Объёмы в `l3-data` (loc 2860, Google Ads, среднее за 12 мес.): prezentatsiya ai 720, slayd ai 590, slayd yaratish 590, taqdimot yaratish 140, slayd yasash 140, ai prezentatsiya 40; ии для презентаций 480, нейросеть для презентаций 110. У «презентация ии», главного RU-ключа A5, строки нет | `l3-data/kw1_table.txt:102,103,109,151`; `kw2_table.txt:73,102,103,136` | ✘ ошибка в доказательствах |
| Источники не защищены | Ни один из 9 файлов не входит в `PROTECTED_PATHS` (`scripts/seo-protection.ts:145-154`) | grep | ✔ |
| Источники пока не ссылаются на студию | Ни один не ссылается. Но 4 UZ-источника (insho, A-4, kurs-ishi, qollanma) уже ведут на гайд `/uz/blog/slayd-tayyorlash/`, а гайд ведёт на инструмент | обход `dist/` | ✔ |
| Живой сайт = `dist` | `/ru/tarify-ai-chat/` и `/uz/blog/kurs-ishi-yozish/`: 200, ссылок на студию 0. Сырой текст «странице Studio /uz/tariflar/» есть, `href="/uz/tariflar/"` — 0 | живой GET 2026-10-24 | ✔ |

## 2. Почему механизм «больше ссылок → клики» здесь не работает

| Проверка | Данные | Источник | Вывод |
|---|---|---|---|
| Обнаружение и индекс | taqdimot-ai: indexed, обход 10-08. prezentatsiya-ai: indexed, обход **10-22**. tariflar: indexed, обход **10-24**. Канонические совпадают | `inspect_urls` 2026-10-24 | Глубина 2–3 не мешает: Google находит страницы через `sitemap-updates.xml` |
| Где стоит студия по своим ключам | «slayd ai» (590), «prezentatsiya ai» (720), «ии для презентаций» (480): **gptbot.uz нет в топ-50** ни по одному. В топ-10 — chatslide, Canva, Microsoft, slidesgo, beautiful.ai, ppt.ai, presentations.ai; в RU — листинги habr, vc, tomoru. В каждой выдаче есть AI Overview | SERP `9d652680` | Студии нужно подняться на 40+ позиций. 3–5 ссылок с малопосещаемых страниц так её не сдвинут |
| Сколько посетителей у источников | GSC, 28 дн.: всего 20 кликов (sravnenie 12, gde-polzovatsya 6, insho 1, kurs-ishi 1, остальные 5 — по 0). GA4, все каналы: 47 просмотров (sravnenie 15, gde 6, na-russkom 5, insho 5, tarify 4, A-4 4, kurs-ishi 4, qollanma 4, **chto-takoe 0**) | GSC `b74d7559-e8b1-41e9-b180-18608b099433`; GA4 page_performance 09-24..10-21 | Переходить по ссылкам почти некому |
| Как работают уже существующие ссылки на студию | 3 ссылки в теле (talabalar 2 просмотра, referat 11, slayd 9 = 22) + 1 органический клик → у taqdimot-ai **2 просмотра** за 28 дней | GA4, та же выгрузка | Верхняя граница перехода ≈2 / 22 ≈ 9 %. Для 47 просмотров новых источников это ≤ ≈4, реально 0–1 переход в месяц. GA4 занижает визиты (порог загрузчика), так что это порядок величины, не точная цифра |
| Вред победителям | sravnenie (2 334 показа, 12 кликов) — в эксперименте W1-03, title и H1 не меняются. Одна ссылка в теле контракт защищённых страниц не меняет | `scripts/seo-protection.ts` | Вреда нет, но на sravnenie нет ни слова о презентациях: ссылка получилась бы искусственной |

## 3. Честность и `intent-manifest.json`

| Пункт действия | Проверка | Итог |
|---|---|---|
| UZ-анкоры «slayd AI», «taqdimot yaratish» → `/uz/taqdimot-ai/` | Оба входят в C40 commercial owns. В mustNotTarget источников их нет. Гайд C40 их не объявляет | ✔ |
| RU-анкоры «презентация ИИ», «нейросеть для презентаций» → `/ru/prezentatsiya-ai/` | Оба принадлежат A5. Но у «презентация ии» нет строки объёма, а «ии для презентаций» (480) — измеренный ключ A5 | Главным анкором взять «ИИ для презентаций» |
| `/uz/gpt-chat-qollanma/` → `/uz/tariflar/` | Анкор и текст **не указаны**. `/uz/tariflar/` — это тарифы **Studio** (title «Studio tariflari: taqdimot uchun Kunlik va Oylik»), а не чата. Ссылка из руководства по чату (C28: «ai chat limitlari», AI paket) без пояснения выдаст тарифы презентаций за тарифы чата | Только с явным текстом: «AI paket taqdimotlarni o‘z ichiga olmaydi», анкор «Studio tariflari (taqdimot uchun)» |
| «одна ссылка на источник» и qollanma в двух ролях | L4-05 ставит qollanma и в UZ → taqdimot-ai, и → tariflar. В backlog осталась только роль tariflar. Вносить в qollanma сразу две ссылки | Неоднозначно, уточнено ниже |
| Описание инструмента | Студия делает .pptx: бесплатный пример до 6 слайдов, полная презентация до 12 слайдов по тарифу Kunlik 5 900 / Oylik 39 900 сум. AI-пакет чата презентаций не включает (`content/studio/pages/*/…json` description; `tarify-ai-chat.json` блок «Studio: отдельные тарифы») | ✔ формулировка пункта честная |
| `/ru/blog/chat-gpt-online/` исключён | Совпадает с C23 | ✔ |

## 4. Оценка эффекта

Пункт: «0–2 клика, спрос не измерен». Метода нет.

Перепроверенный метод:
- **органика студии:** по трём главным ключам её нет в топ-50 (`9d652680`), показы по ключам A5/C40 за 3 месяца — 0 (`3e668a1e`, `2195548b`, `50d44476`). Рост до топ-10 за 28 дней из-за 3–5 внутренних ссылок с малопосещаемых страниц неправдоподобен → **0 кликов**;
- **переходы внутри сайта:** ≤ ≈4, реально 0–1 переход в студию за 28 дней (§2). Это не органические клики.

**Исправленная оценка: 0 органических кликов за 28 дней, уверенность высокая. Ценность — только UX и честность (сырой URL на тарифной странице).**

## 5. Что оставить (урезанное действие, ≈20 минут, в тех же проходах по файлам)

1. `content/pages/ru/tarify-ai-chat.json`, блок `p` после h2 «Studio: отдельные тарифы презентаций». Превратить его в `linkp`. Сырой «/uz/tariflar/» заменить на `{studio_tariffs}` → `/uz/tariflar/`, анкор «тарифы Studio». В том же абзаце `{studio}` → `/ru/prezentatsiya-ai/`, анкор «ИИ для презентаций». Пример текста: «…приведены на странице {studio_tariffs} и в публичной оферте. Сам инструмент — {studio}: тема → черновик .pptx, бесплатный пример до 6 слайдов.» Это исправляет единственный реальный дефект.
2. `content/blog/uz/kurs-ishi-yozish.json`, `linkp` в секции «Himoya uchun slayd va ma’ruza». После «…{slayd} qo‘llanmasida.» добавить: «Tayyor .pptx qoralama kerak bo‘lsa, {taqdimot} sahifasida mavzudan 6 slaydgacha bepul namuna olish mumkin; to‘liq taqdimot — alohida Studio tarifida.» `{taqdimot}` → `/uz/taqdimot-ai/`, анкор «taqdimot yaratish».
3. `content/pages/uz/gpt-uzbek-tilida-ai-chat.json`, `linkp` «O‘qish vazifalari uchun alohida qo‘llanmalar bor: {slayd}, {referat} va {insho}…». Дописать: «Tayyor .pptx fayl uchun — {taqdimot}.» Анкор «slayd AI». Тот же проход, что W1-02 и W1-07.
4. `content/pages/uz/gpt-chat-qollanma.json`, блок «Bepul chat, AI paket va biznes uchun bot» (linkp около строки 204). Дописать: «AI paket taqdimotlarni o‘z ichiga olmaydi: .pptx uchun alohida {studio} bor.» `{studio}` → `/uz/tariflar/`, анкор «Studio tariflari (taqdimot uchun)». Без этой оговорки ссылку не ставить.
5. **Не делать:** sravnenie, chto-takoe, chat-gpt-na-russkom, gde-polzovatsya, insho.
   - Причины: в тексте нет контекста презентаций (на sravnenie — ни слова); у chto-takoe 0 просмотров в GA4; на sravnenie идёт замер W1-03.
   - insho уже ведёт на гайд по слайдам, а гайд — на инструмент.
6. В `backlog.json` исправить evidence: спрос измерен (`l3-data`), студии нет в топ-50 (`9d652680`), цели в индексе. `impact_clicks_28d` → 0, тип — UX и честность.

После правки: prerender, `seo-audit`, тесты `seo-link-graph`, `seo-content-guards`, `seo-cluster-quality`. Апострофы — U+2018 для o‘/g‘, U+2019 для тутук.
