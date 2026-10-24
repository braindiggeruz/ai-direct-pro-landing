# L3 — Спрос без страниц: какие новые страницы стоит строить

Дата: 2026-10-24. Прод `d54d5b61`. Страницы и ключи взяты из `dist/sitemap.xml` (300 URL) и из `content/pages|blog|studio/**/*.json` этой копии. Права: только чтение. Записаны только файлы этой линзы (`L3-demand-gaps.md` и `l3-data/`).
Кредиты OpenSEO: до работы `whoami` показывал 24 083, после — 23 235. Потрачено **848 из лимита 1 500**. Это верхняя граница: параллельные линзы могли списывать кредиты в то же время.

## 1. Итог

1. **Самый крупный честный пробел — перевод с английского на узбекский и обратно.** Ветка переводчика строит только пару RU↔UZ. Пара EN↔UZ даёт ядро ≈48,9 тыс. запросов в месяц, если брать 12-месячное среднее UZ-латиницы и RU: «английский узбекский переводчик» 18 100, «ingliz uzbek tarjimon» 12 100, «inglizcha tarjima» 8 100, «переводчик с английского на узбекский» 6 600 и др. Англоязычные запросы сюда не входят: корзина «english to uzbek» 135 000, «uzbek english translator» 49 500, «english uzbek translator» 40 500. В SERP есть слабые независимые сайты: verbly.uz (#5/#7), translatiz, selecttranslate, getmerlin, zemith. Чат уже переводит, в коде есть роль `translator` (`src/gpt-chat/roles.ts:17,26`), но только для пары RU↔UZ. Нужна вторая роль и две страницы на шаблоне ветки переводчика. Оценка: **≈100–500 кликов за 28 дней** при позиции 6–8 (L3-01).
2. **Самый крупный узбекский запрос про ИИ уже имеет владельца, но тот не работает.** Спрос: «suniy intellekt» 8 100 и «sun’iy intellekt» 6 600 (разные ряды), кириллица «сунъий интеллект» 1 600 и семья «… nima» ≈4 300. Страница `/uz/suniy-intellekt/` проиндексирована, но за 3 месяца получила 32 показа, позиция 13,6, 0 кликов. По своим запросам она стоит на позициях 58–77. Выдача слабая: видео, теговые страницы новостей и одна статья того же типа (zukko.ai, #9). Нужна доработка существующей страницы, новый URL не нужен (L3-02).
3. **Школьные документы — реальный и слабо занятый спрос.** «obyektivka namuna» 2 400 + «ma’lumotnoma namuna» 1 600 + «obyektivka» 1 000. «tavsifnoma namuna» 1 600 + «tavsifnoma» 720. Выдача «tavsifnoma namuna» — PDF на Scribd и мелкие блоги. Сейчас у сайта по этим словам ноль показов. Два новых гайда в паре с UZ-чатом (L3-03, L3-04).
4. **Математика — крупнейший школьный спрос, но продукта под него пока нет.** «matematika misollar» 18 100 (сен-26 49 500), «karra jadvali» 2 900, «misollar yechish» 4 400, «misol/masala yechish» по 880. Решатель по фото уже написан (`/api/studio/photo`, страница-черновик `rasmdan-yechim.json`), но выключен: `STUDIO_PHOTO:"false"` в `wrangler.toml:167`. Генератора примеров нет. Оба направления требуют решения владельца (L3-05, L3-06).
5. **Русскоязычных запросов «нейросеть для задачи» в Узбекистане почти нет.** «нейросеть для учебы», «нейросеть для текста», «нейросеть для реферата» и «нейросеть для кода» дают по 10 в месяц. «нейросеть онлайн бесплатно» — 30, «нейросеть для презентаций» — 110, «ии для презентаций» — 480 (эту фразу уже держит `/ru/prezentatsiya-ai/`). Русских страниц «нейросеть для X» не нужно.
6. **B2B подтверждает заморозку.** Коммерческие фразы вернули null: «telegram bot narxi», «telegram bot yaratish», «chat bot yaratish», «ai bot biznes uchun», «crm integratsiya», «bot yaratish narxi», «chat bot narxi», «amocrm narxi». Объём есть только у навигационных брендов CRM (amocrm 33 100, bitrix24 8 100). Новых B2B-страниц не предлагаю.
7. **Не строить:** страницы под бренды других ИИ (gemini 1,5 млн, claude ai 135 000, deepseek 90 500, chatgpt 5 60 500). Это навигация к официальным продуктам: в топ-20 по «deepseek» нет ни одной узбекской страницы. Обещать GPT-5 нельзя, потому что чат работает на провайдере `zai` (`wrangler.toml:444`). Генерация картинок, видео и голоса в продукте отсутствует. Также не строить: банки тестов, архивы стихов, загадок и пословиц, словари орфографии (см. §7).

## 2. Данные и метод

| Набор | Вызов | resultId / файл | Строк |
|---|---|---|---|
| Метрики, волна 1 (UZ-латиница, UZ-кириллица, RU, B2B; 330 отправлено) | `get_keyword_metrics`, loc 2860, trends | `l3-data/kw1_metrics.json`, таблица `kw1_table.txt` | 310 (58 null) |
| Поиск идей (deepseek, gemini, grok, suniy intellekt, chatgpt 5) | `research_keywords` | `l3-data/research1_note.txt` | 1–9 на сид; выдача почти пустая, повторно не вызывался |
| Метрики, волна 2 (хвосты брендов, документы, математика, EN-перевод, RU-задачи) | `get_keyword_metrics` | `l3-data/kw2_metrics.json`, `kw2_table.txt` | 251 (61 null) |
| SERP, 10 GAP | `get_serp_results` depth 20, desktop, hl ru | 48e0cfbe-f613-452b-afc9-b2bc503ca3f4, `serp1.json`, `serp1_table.txt` | 10 запросов |
| SERP, 8 запросов | то же | 7aa3bce8-96b9-4fc6-8b13-3e04a661a7f5, `serp2.json`, `serp2_table.txt` | 8 |
| SERP, 6 запросов | то же | 3b60d615-5f6f-49bb-bb53-3ce195dbc7af, `serp3_table.txt` | 6 |
| GSC 3 мес. (2026-07-21..10-21), запросы с «rasm», «нейросет», «intellekt», «deepseek», «gemini», «claude», «tarjim», «obyektivka», «prompt», «misol» | `get_search_console_performance` | 40244a09, 84304458, f64f7a59, cdb77bd5, 8f7a3f86, 5fbef2e6, 118d2679, 534b8a1d, b350fd61, 7518cd52 | — |
| GSC 3 мес., страницы `/uz/` и запросы `/uz/suniy-intellekt/` | то же | 94f1deab-9e4e-4bdb-9f09-1401865712e8, f02ac1b4-1b87-4298-8595-a6e96ed75b87 | 112 / 7 |
| Индексация 4 URL | `inspect_urls` | (вызов в этой сессии) | 4 |
| Карта ≥500 → URL | скрипт `l3-data/l3_map.py` | `l3-data/l3_map_table.md` | 181 ключ |

Оговорки:
- Для location 2860 данные идут из Google Ads. KD и intent во всех строках `null`, competition — индекс Google Ads от 0 до 1. «Объём» — это `search_volume` из API, то есть среднее за 12 месяцев. Колонка «окт-25 → сен-26» показывает сезонность.
- Google Ads склеивает близкие варианты. Одинаковый объём и одинаковый ряд значат одну корзину, складывать такие строки нельзя: «obyektivka namuna» = «obyektivka namunasi», «english to uzbek» = «english uzbek» = «uzbek to english», «sun’iy intellekt» = «sun iy intellekt». «suniy intellekt» (окт-25 1 000 → сен-26 8 100) и «sun’iy intellekt» (14 800 → 3 600) — разные ряды. Похоже, Google Ads перекладывает спрос между написаниями, поэтому их сумма — верхняя граница.
- OpenSEO не принимает U+2018/U+2019, поэтому в ключах стоит ASCII-апостроф. Null означает «нет отдельной корзины», а не «ноль спроса».
- SERP сняты с hl=ru на десктопе. Узбекоязычная мобильная выдача может отличаться.
- **Метод оценки кликов.** Объём в месяц × CTR из собственной кривой сайта по запросам (Узбекистан, без двух чатов; `L1-ctr.md` §3.3): поз. 3 — 3,59%, 4 — 2,18%, 5 — 0,87%, 6 — 1,10%, 7 — 0,38%, 8 — 0,68%, 9 — 0,75%. Затем × 0,92, чтобы перейти к 28 дням. Позицию задаю диапазоном по виду SERP. Это оценки, а не прогноз.

## 3. Что продукт честно умеет (проверено в коде)

| Возможность | Есть? | Где |
|---|---|---|
| Текстовый чат (UZ/RU), роли general/teacher/translator/… | да | `src/gpt-chat/roles.ts:3` |
| Переводчик | только RU ↔ узбекская латиница | `roles.ts:17,26` |
| Лимит ввода | 3 000 символов минус префикс роли | `functions/lib/gpt-chat/config.ts:177` (по `implementation-map.md` B1) |
| Бесплатный доступ | 3 пробных ответа на браузер и аккаунт, общие для всех страниц чата, дальше AI-пакет | `trial-store.ts:2` (по B2) |
| Презентация .pptx | да; картинки Flux только внутри слайдов | `functions/lib/studio/images.ts`, `content/studio/pages/*/` |
| Решение задачи по фото | код есть, **выключен** | `functions/api/studio/photo.ts`; `STUDIO_PHOTO:"false"` в `wrangler.toml:167`; `content/studio/pages/uz/rasmdan-yechim.json` в статусе `draft` |
| Генерация картинок, видео, голоса для пользователя | **нет** | в `functions/api/**` таких эндпоинтов нет; `functions/lib/telegram/transcription.ts` относится к боту Javob, а не к веб-чату |
| Модель | провайдер `zai` | `wrangler.toml:444`; GPT-5 обещать нельзя |

## 4. Карта спроса ≥500/мес → владелец или GAP

Всего 181 ключ с объёмом ≥500: GAP 38, владелец есть 33, владелец есть, но не работает 7, отклонено 103. Полная таблица — `l3-data/l3_map_table.md`.

### 4.1 GAP и «владелец есть, но не работает»

| Ключ | Объём/мес | окт-25 → сен-26 | Статус | Куда | Возм. |
|---|---:|---|---|---|---|
| english to uzbek (= english uzbek = uzbek to english) | 135 000 | 165 000 → 110 000 | GAP | — | L3-01 |
| uzbek english translator | 49 500 | 49 500 → 40 500 | GAP | — | L3-01 |
| english uzbek translator | 40 500 | 49 500 → 22 200 | GAP | — | L3-01 |
| английский узбекский переводчик | 18 100 | 27 100 → 12 100 | GAP | — | L3-01 |
| ingliz uzbek tarjimon | 12 100 | 33 100 → 3 600 | GAP | — | L3-01 |
| inglizcha tarjima | 8 100 | 8 100 → 4 400 | GAP | — | L3-01 |
| переводчик с английского на узбекский | 6 600 | 9 900 → 5 400 | GAP | — | L3-01 |
| ingliz tarjima | 2 400 | 2 900 → 1 300 | GAP | — | L3-01 |
| переводчик с узбекского на английский | 1 000 | 1 600 → 880 | GAP | — | L3-01 |
| inglizcha tarjimon | 590 | 880 → 480 | GAP | — | L3-01 |
| suniy intellekt | 8 100 | 1 000 → 8 100 | владелец не работает | `/uz/suniy-intellekt/` | L3-02 |
| sun’iy intellekt (= sun iy intellekt) | 6 600 | 14 800 → 3 600 | владелец не работает | `/uz/suniy-intellekt/` | L3-02 |
| сунъий интеллект | 1 600 | 590 → 1 300 | владелец не работает (кириллицы на странице нет) | `/uz/suniy-intellekt/` | L3-02 |
| suniy intellekt nima | 1 300 | 1 300 → 1 300 | владелец не работает | `/uz/suniy-intellekt/` | L3-02 |
| сунъий интеллект нима | 1 300 | 1 600 → 1 000 | владелец не работает | `/uz/suniy-intellekt/` | L3-02 |
| sun’iy intellekt nima | 1 000 | 1 900 → 390 | владелец не работает | `/uz/suniy-intellekt/` | L3-02 |
| tavsifnoma namuna | 1 600 | 1 900 → 720 | GAP | — | L3-03 |
| tavsifnoma | 720 | 1 000 → 320 | GAP | — | L3-03 |
| obyektivka namuna (= …namunasi) | 2 400 | 2 400 → 3 600 | GAP (раздел в rezyume, ключ не объявлен) | — | L3-04 |
| ma’lumotnoma namuna | 1 600 | 1 900 → 1 900 | GAP | — | L3-04 |
| obyektivka | 1 000 | 1 300 → 3 600 | GAP | — | L3-04 |
| misollar yechish | 4 400 | 3 600 → 6 600 | GAP (черновик rasmdan-yechim) | — | L3-05 |
| uyga vazifa | 1 300 | 2 900 → 1 600 | GAP | — | L3-05 |
| misol yechish / masala yechish / uy ishi | по 880 | — | GAP | — | L3-05 |
| matematika misollar yechish | 590 | 480 → 480 | GAP | — | L3-05 |
| matematika misollar | 18 100 | 480 → 49 500 | GAP (генератор, не ИИ) | — | L3-06 |
| karra jadvali | 2 900 | 2 900 → 2 900 | GAP | — | L3-06 |
| misollar | 1 600 | 1 600 → 1 600 | GAP | — | L3-06 |
| masalalar | 1 000 | 480 → 1 900 | GAP | — | L3-05/06 |
| ko‘paytirish jadvali | 720 | 880 → 720 | GAP | — | L3-06 |
| prompt nima | 720 | 140 → 260 (ноя-25 1 900) | GAP | → `/uz/gpt-uzbek-tilida-ai-chat/` | L3-07 |
| tugilgan kun tabriklari | 1 300 | 1 300 → 1 300 | GAP | — | L3-08 |
| tabriklar | 1 000 | 1 300 → 590 | GAP | — | L3-08 |
| yangi yil tabriklari | 880 | 30 → 10 (макс. 9 900, декабрь) | GAP | — | L3-08 |
| табриклар | 590 | 390 → 590 | GAP | — | L3-08 |
| xat yozish | 3 600 | 140 → 6 600 | GAP | сосед `/uz/blog/tushuntirish-xati-va-ariza-yozish/` | L3-09 |
| turkcha o‘zbekcha tarjimon | 880 | 1 300 → 320 | GAP | — | L3-10 |
| koreyscha o‘zbekcha tarjima | 720 | 1 000 → 390 | GAP | — | L3-10 |
| arabcha tarjima | 590 | 320 → 320 | GAP | — | L3-10 |

GSC подтверждает, что эти темы пусты. За 3 месяца нет ни одной строки по «obyektivka», «misol», «deepseek» и «gemini». По «tarjim» строки есть только у UZ-чата («chatgpt tarjima» — 698 показов). По «prompt» есть один запрос-вопрос из теста «prompt nima? …»: 11 показов, позиция 10,1 на защищённой библиотеке промптов.

### 4.2 Владелец есть и работает — новых страниц не нужно

chatgpt kirish 33 100, chatgpt uzbekcha 4 400, chatgpt 4 uzbek tilida 1 600 и chatgpt bepul 1 300 → `/uz/gpt-uzbek-tilida/`. ии онлайн 4 400, ии чат 1 900 и нейросеть/нейросети 1 300 → `/ru/gpt-chat/`. ai chat 3 600 → `/uz/blog/ai-chat-nima-…/`. Семья esse/insho (esse 4 400, esse yozish 2 900, esse namunalari 1 600, insho 1 300, insho yozish 880) → гайд insho. Семья referat/mustaqil ish (2 900, 2 900, 1 900, 1 000; RU «реферат» 1 900) → гайд referat. kurs ishi 1 300, rezyume 1 600, ariza yozish 2 900, ariza namunasi 590, tushuntirish xati 1 600 и biznes reja 1 000 → свои гайды. prezentatsiya 1 300, taqdimot 1 000, slayd ai 590, slayd yaratish 590 и prezentatsiya ai 720 → `/uz/taqdimot-ai/` и `/uz/blog/slayd-tayyorlash/`. chatgpt yuklab olish 1 900 → гайд по скачиванию. chatgpt plus 720 → гайд по оплате. ии для презентаций 480 → `/ru/prezentatsiya-ai/`.

## 5. Проверка SERP у топ-GAP (3 вызова, 24 запроса)

| Запрос (объём) | Что ранжируется в топ-10 | Слабые конкуренты | Вердикт |
|---|---|---|---|
| english uzbek translator (40 500) | AI Overview; Yandex, Google Translate, приложения Play, imtranslator, paralink, translatiz #6, getmerlin #9, glosbe | translatiz.com, getmerlin.in, all-translation | выдача из инструментов; страница с рабочим инструментом может войти |
| ingliz uzbek tarjimon (12 100) | Google Tarjima #1/#2, приложения Play, Yandex, **verbly.uz/tools/translate #5**, lingvanex #6 | verbly.uz (AI-переводчик на .uz), opentran #13 | **реально**: независимый .uz-инструмент стоит на #5 |
| inglizcha tarjima (8 100) | Google ×2, Play, Yandex, lingvanex, verbly.uz #7, opentran #14, glosbe | verbly.uz, opentran | реально |
| переводчик с английского на узбекский (6 600) | Google, Play, translate.ru, Yandex, webtran, onlinedoctranslator, lingua.direct; zemith (ИИ) #11, tilmoch.ai #13 | webtran, zemith, selecttranslate | реально |
| english to uzbek (135 000, корзина) | Yandex, freetranslations.org, Play, Bing, imtranslator, elearning.asc.edu.ag, selecttranslate, Google, getmerlin | freetranslations, selecttranslate, elearning.asc | англоязычный; возможен вход через EN-подзаголовок UZ-страницы, в оценку не включён |
| suniy intellekt (8 100) | AI Overview; видео Facebook/YouTube, yuz.uz, тег gazeta.uz, prezi, приложение, **zukko.ai «Sunʼiy intellekt nima» #9**, akam.uz, lex.uz, gov.uz, тег sputnik | все, кроме lex.uz и gov.uz | выдача раздроблена, сильной статьи-объяснения нет. Шанс у существующей страницы |
| tavsifnoma namuna (1 600) | oriftolib.uz, видео Facebook, Scribd ×6, kursishlari, uzoffice.uz, ilmboy.uz, toolbase.uz | почти все | **очень слабая** выдача |
| obyektivka namuna (2 400) | генераторы tez-hujjat.uz #1, obyektivka.uz #3; resum.uz #2; slideshare, soff.uz, Scribd, uzoffice | tsuos.uz, soff, kursishlari | вверху генераторы; гайд реально может встать на 5–10 |
| obyektivka (1 000) | tez-hujjat, obyektivka.uz, resum.uz, PDF, obyektivkalar.uz, kadrovik.uz, kadry.uz | PDF и YouTube | то же |
| misollar yechish (4 400) | видео; Math Formulas (Play), Scribd «yechuvchi ilovalar», aniq.uz (новость), khanacademy, Photomath (Play), arxiv.uz, daryo.uz (новость 2014) | Scribd, новости, слайды | ищут **инструмент-решатель**; конкуренты слабые |
| masala yechish (880) | robocontest.uz (олимпиадное программирование!), Scribd, PDF, darsli.uz, edubaza, aniq.uz; **uniwork.uz/tools/masala-yechish (ИИ) #13** | Scribd, PDF | намерение смешанное (математика + программирование) |
| matematika misollar (18 100) | Scribd, ustoz.ai, PDF книг, YouTube, arxiv.uz, soff.uz, mathnet.uz, Wikipedia, asaxiy (книга), baxtiyor.uz | почти все | ищут **листы с примерами**; конкуренты слабые |
| test savollari (12 100) | qnb.uz, test.ziyonet.uz, приложения Play, infotest.uz, dtm-test.uz, kep.uz | — | банки тестов; ИИ-генератор в это намерение не попадает → отклонено |
| tugilgan kun tabriklari (1 300) | askinfo.uz, bilimmarkazi.uz, Telegram, YouTube, Play, qogozcha.uz, Instagram, insho.uz, sherlari.ru | почти все | архивы, слабые домены; реально |
| xat yozish (3 600) | Scribd (тест по деловым письмам), prezi «Rasmiy yozishmalar qoidalari», soff.uz, YouTube Shorts «AI o'zbekcha», imlo.uz, izohli, **promli.com — ИИ-генератор официальных писем, #9** | почти все | смесь деловой переписки и школы; реально, уверенность средняя |
| prompt nima (720) | mohirdev, mediadesign.uz, prompter.uz, Instagram, najottalim, neuralwriter, ifazo.uz, ai-smm.uz | узбекские блоги | реально для раздела существующей страницы |
| imlo tekshirish (880) | словари imlo.uz, izoh.uz, savodxon.uz, PDF словаря, приложение Muharrir | — | словари → отклонено |
| maktub yozish (12 100) | обращения на hukumat.uz/uzbekistan.uz/digital.gov.uz, шаблон приглашения nixa.uz, азербайджанские страницы | — | чужое намерение → отклонено |
| xulosa yozish (8 100) | Wikipedia «Xulosa chiqarish», слайды по философии и логике | — | логика, не письмо → отклонено |
| matn yaratish (6 600) | Wikipedia, статьи по методике ona tili, matn.uz, textie.ai (ИИ) #9, homiwork | — | в основном методика; HOLD |
| deepseek (90 500) | deepseek.com, Play, Wikipedia, BBC, HuggingFace, GitHub… | — | навигационный → отклонено |
| chatgpt 5 (60 500) | YouTube, chatgpt.com, openai.com, Microsoft, Yahoo; gpt-chatbot.ru #9 | — | навигационный и англоязычный; GPT-5 обещать нельзя → отклонено |
| искусственный интеллект (6 600) | Wikipedia, tadviser, AWS, Habr, Practicum, SAP, Azure, UN | — | авторитетные домены → отклонено |
| dalolatnoma namuna (1 300) | soff, YouTube, Scribd ×6, акты гражданского состояния на lex.uz, bss.uz | Scribd | смешанное намерение → HOLD |

## 6. Возможности

### L3-01 — Переводчик EN↔UZ: две страницы на шаблоне ветки переводчика
- **Страницы.** Новые `/uz/ingliz-ozbek-tarjimon/` и `/ru/perevodchik-s-angliyskogo-na-uzbekskiy/`, hreflang-пара.
- **Код.** Без нового бэкенда, повторяется план `implementation-map.md` B1–B3:
  1. `src/gpt-chat/roles.ts`: новый `RoleId 'translator_en'`. UZ-инструкция: «Ingliz va o‘zbek tillari muharrir-tarjimoni sifatida ishlang: inglizcha matnni o‘zbek tiliga (faqat lotin yozuvida), o‘zbekchani ingliz tiliga tarjima qiling…». RU — аналогично.
  2. `src/shared/types.ts`: `chatRole?: 'translator' | 'translator_en'`.
  3. Allowlist в `scripts/prerender.ts` (`data-chat-role`) и в `src/gpt-chat/main.tsx`.
  4. Контент: `content/pages/uz/ingliz-ozbek-tarjimon.json` и `content/pages/ru/perevodchik-s-angliyskogo-na-uzbekskiy.json`. Поля: `pageType: "gpt-chat"`, `chatRole: "translator_en"`, schemaTypes `["Organization","WebSite","BreadcrumbList"]`, ≥4 FAQ.
- **Тексты.**
  - UZ: title «Ingliz-o‘zbek tarjimon onlayn — AI bilan matn tarjimasi | GPTBot.uz», H1 «Ingliz–o‘zbek tarjimon: matnni AI bilan tarjima qiling», подзаголовок «English ↔ Uzbek translator». Он нужен для англоязычных запросов, отдельной `/en/` локали нет.
  - RU: title «Переводчик с английского на узбекский онлайн — ИИ | GPTBot.uz», H1 «Переводчик с английского на узбекский и обратно».
- **Честность на странице.** Переводится только текст до лимита ввода. Фото, голос и файлы не переводятся (спрос на них есть: «google tarjimon rasm orqali» 27 100 из `translator-market.md`, но продукт этого не умеет). 3 пробных ответа общие с AI-чатом. Важные документы нужно проверять у переводчика. Сервис — не Google Translate.
- **Intent-manifest.** Запись `architectureDecisions` по образцу A5. Новые страницы владеют «ingliz uzbek tarjimon», «inglizcha tarjima», «ingliz tarjima», «english uzbek translator», «переводчик с английского на узбекский». `mustNotTarget`: ключи пары RU↔UZ и «chatgpt tarjima» (это ключ UZ-чата).
- **Входящие ссылки.** ≥2 со страниц без защиты: `/uz/gpt-chat-qollanma/`, `/ru/gpt-chat-guide/`, `/uz/blog/chatgpt-talabalar-uchun/`, `/ru/gpt-dlya-ucheby/`, плюс страницы RU↔UZ после их выхода. Защищённые чаты не трогать.
- **Порядок.** Выпускать после релиза RU↔UZ: общий шаблон, одна ревизия `/` на обе пары или следующая. Перед публикацией — проверка качества (G5): 30 пар EN↔UZ вручную.
- **Оценка.** Ядро UZ+RU: сен-26 28 160 (нижняя граница), 12-мес. среднее 48 900 (верхняя). × CTR 0,38–1,10% (поз. 6–8) × 0,92 ≈ **98–495 кликов за 28 дней**. При позиции 11–20 — около 0–30. Англоязычные корзины не включены.
- **Защита.** `/` перечисляет все страницы `content/pages|blog` (в `dist/index.html` 305 уникальных внутренних ссылок, из них 172 на блог; проверено: `/uz/blog/slayd-tayyorlash/` в списке есть), поэтому публикация требует проверенной ревизии `/`. **protected = true.**

### L3-02 — Довести `/uz/suniy-intellekt/` до спроса, который уже на неё назначен
- **Доказательства.** GSC за 3 месяца: 32 показа, позиция 13,6, 0 кликов (94f1deab). Запросы страницы «suniy intellekt turlari» и «… haqida malumot» стоят на позициях 62 и 77 (f02ac1b4). `inspect_urls`: «Submitted and indexed», последний обход 2026-10-11, referring URLs не указаны. В `dist` на неё ссылаются 7 страниц (`grep`), и одна из них защищена. Ключ «sun'iy intellekt 8100» утверждён в `demand-policy.json`, при этом в title и description есть уклон в бизнес.
- **Правки в `content/pages/uz/suniy-intellekt.json`.**
  1. В `secondaryKeywords` добавить «suniy intellekt nima», «suniy intellekt turlari», «suniy intellekt haqida ma’lumot» и «сунъий интеллект нима».
  2. В первый абзац добавить честную фразу о написании: «ko‘pincha apostrofsiz — «suniy intellekt» — deb ham yoziladi».
  3. Добавить блоки для школьника, которого видно в SERP (эссе, презентация): «Afzalliklari va xavflari»; «Sun’iy intellekt haqida esse yoki referat uchun reja» со ссылками на гайды insho, referat и slayd и на `/uz/taqdimot-ai/`; короткий абзац кириллицей «Сунъий интеллект нима?» (спрос 1 300 + 1 600).
  4. Бизнес-раздел оставить, но опустить ниже.
- **Ссылки.** Добавить со страниц без защиты: `/uz/blog/chatgpt-talabalar-uchun/`, `/uz/gpt-chat-qollanma/`, `/uz/gpt-uzbek-tilida-ai-chat/`, `/uz/blog/referat-va-mustaqil-ish/`, `/uz/blog/chatgpt-claude-gemini-ozbekistonda/`.
- **Оценка.** Семья «nima» 4 290/мес × 0,38–1,10% → 16–47. Головные запросы 16 300/мес (верхняя граница, ряды пересекаются) × ≈0,7% на поз. 8–9 → до ≈115. Итого **≈15–155 кликов за 28 дней**, сейчас 0. Уверенность низкая.
- protected = false (страница не в `PROTECTED_PATHS`). Ссылка с защищённой `/uz/blog/ai-chat-nima-va-qanday-turlari-bor/` возможна только отдельной ревизией. Возможно пересечение с линзой L2.

### L3-03 — Новый гайд «Tavsifnoma namunasi»
- **Страница.** `/uz/blog/tavsifnoma-namuna/`, `content/blog/uz/tavsifnoma-namuna.json`.
- **Тексты.** Title «Tavsifnoma namunasi: o‘quvchi, talaba va xodim uchun (2026)». H1 «Tavsifnoma qanday yoziladi: tuzilma, shartli namunalar va AI bilan qoralama».
- **Ключи.** tavsifnoma namuna, tavsifnoma, tavsifnoma yozish.
- **Содержание.**
  1. Чем tavsifnoma отличается от tavsiyanoma (в SERP есть видео «Tavsifnoma va tavsiyanoma»).
  2. Три шаблона-плейсхолдера (o‘quvchi, amaliyotchi talaba, xodim) с выдуманными данными.
  3. Как попросить чат составить черновик из своих фактов. Подписывающий проверяет текст сам; это не юридический документ.
  4. ≥4 FAQ и ссылки на `/uz/blog/tushuntirish-xati-va-ariza-yozish/`, `/uz/blog/rezyume-tayyorlash/` и чат.
- **Intent-manifest.** Пара по образцу C41/C42: коммерческая сторона — `/uz/gpt-uzbek-tilida/`, только запись в манифесте, HTML не меняется.
- **Оценка.** 2 320/мес. Поз. 3–4 → 2,18–3,59% → **47–77 кликов за 28 дней**. Поз. 6–8 → 8–23. Выдача самая слабая из проверенных.
- protected = true (меняется `/`).

### L3-04 — Новый гайд «Obyektivka (ma’lumotnoma) namunasi»
- **Страница.** `/uz/blog/obyektivka-namuna/`.
- **Тексты.** Title «Obyektivka (ma’lumotnoma) namunasi: to‘ldirish tartibi 2026». H1 «Obyektivka namunasi: ma’lumotnomani to‘g‘ri to‘ldirish».
- **Ключи.** obyektivka namuna, obyektivka, ma’lumotnoma namuna, obyektivka yozish.
- **Содержание.** Поля по порядку, фото 3×4, частые ошибки, кириллическая форма «Маълумотнома (объективка)», шаблон с выдуманными данными, как AI-чат помогает сформулировать раздел «mehnat faoliyati». Честно сказать, что сервис не делает файл .docx.
- **Пересмотр решения 2026-10-04.** `demand-policy.json` говорит, что «obyektivka namuna» сознательно не записан и obyektivka закрыта разделом в rezyume. Итог: `/uz/blog/rezyume-tayyorlash/` получил 14 показов за 3 месяца и ни одного запроса с «obyektivka» (534b8a1d). Нужно:
  - в разделе rezyume оставить абзац и поставить ссылку на новую страницу;
  - в C32 добавить «obyektivka namuna» в `mustNotTarget` у rezyume;
  - записать строку в `demand-policy.json`.
- **Оценка.** 5 000/мес. Вверху генераторы, поэтому позиция 6–8 → **17–51 клик за 28 дней**.
- protected = true.
- **Позже.** Клиентский генератор с печатью: данные не уходят на сервер. Решение отдельное.

### L3-05 — Решатель «misol va masala yechish»: перенацелить черновик и включить фото-режим
- **Файлы.**
  - `content/studio/pages/uz/rasmdan-yechim.json` (`status: draft`). Сменить `primaryKeyword` с «rasmdan masala yechish» (объёма нет) на «misollar yechish». `secondaryKeywords`: «misol yechish», «masala yechish», «matematika misollar yechish», «uyga vazifa».
  - Slug заменить на `/uz/misol-yechish/`: у черновика нет накопленной ценности URL.
  - Добавить текстовый путь: напечатать задачу → чат с ролью `teacher`, она уже есть в `roles.ts`.
  - Включить `STUDIO_PHOTO` в `STUDIO_RUNTIME_CONFIG_JSON` (`wrangler.toml:167`) после проверки лимитов (`STUDIO_FREE_ALERT_PHOTOS` 600, `STUDIO_IP_YOUNG_PHOTOS` 40).
- **Честность.** «Javobni tekshiring», «2 ta rasm kuniga bepul» (так в черновике), не ГДЗ.
- **Доказательства.** SERP «misollar yechish»: приложения, Scribd, новости, слайды. ИИ-решатель uniwork.uz стоит на #13 по «masala yechish». Спрос семьи — 8 930/мес.
- **Оценка.** Поз. 6–8 → **31–90 кликов за 28 дней**.
- **Нужен владелец:** расходы на vision-модели и запуск функции. protected = false: студийные страницы `/uz/taqdimot-ai/` и `/ru/prezentatsiya-ai/` в списке на `/` отсутствуют, проверено по `dist/index.html`.

### L3-06 — Генератор «Matematika misollar» (без ИИ)
- **Страница.** `/uz/matematika-misollar/`. Клиентский генератор примеров для 1–4 классов (qo‘shish, ayirish, ko‘paytirish, bo‘lish, karra jadvali), печать с ответами, ссылка «yechimni AI tushuntiradi» на L3-05 или чат.
- **Спрос.** matematika misollar 18 100 (сен-26 49 500), karra jadvali 2 900 (ровно весь год), misollar 1 600, ko‘paytirish jadvali 720. SERP — PDF, слайды, книги, конкуренты слабые.
- **Оценка.** 23 320/мес × 0,38–2,18% (поз. 4–8) → **82–468 кликов за 28 дней**. Разброс широкий, пик в сентябре–ноябре.
- **Риск.** Это не ИИ и вне ядра продукта, конверсия в чат не доказана. **Нужно решение владельца.** Effort M: остров JS и печать.
- protected = true, если делать через `content/pages`. Если делать как студийную страницу, `/` не меняется.

### L3-07 — «Prompt nima» в существующий гайд по промптам
- **Файл.** `content/pages/uz/gpt-uzbek-tilida-ai-chat.json`.
  - Добавить H2 «Prompt nima?»: определение в 2–3 предложения и пример «yomon → yaxshi prompt».
  - Добавить FAQ «Prompt nima va u nima uchun kerak?».
  - В `secondaryKeywords` добавить «prompt nima».
  - В C28 добавить «prompt nima» в `owns` информационной стороны.
- **Доказательства.** 720/мес, ноя-25 1 900: похоже на школьный тест, в GSC запрос-вопрос «prompt nima? …» — 11 показов, поз. 10,1 на защищённой библиотеке. SERP — узбекские блоги.
- **Оценка.** Поз. 3–4 → 2,18–3,59% → **2–24 клика за 28 дней**.
- protected = false. Effort S.

### L3-08 — Гайд «Tabrik yozish» (день рождения, Новый год)
- **Страница.** `/uz/blog/tabrik-yozish/`.
- **Тексты.** Title «Tug‘ilgan kun tabriklari va yangi yil tabriklari: AI bilan shaxsiy tabrik». H1 «Tabrik yozish: 30 ta namuna va AI bilan shaxsiy tabrik».
- **Ключи.** tug‘ilgan kun tabriklari, tabriklar, yangi yil tabriklari, табриклар.
- **Содержание.** Собственные примеры (не копии из архивов), как попросить чат сделать поздравление личным, ссылка на чат. Пара с UZ-чатом в манифесте.
- **Доказательства.** 3 770/мес; «yangi yil tabriklari» в декабре до 9 900. SERP — архивы на слабых доменах.
- **Оценка.** 13–38 кликов за 28 дней в среднем. В декабре только «yangi yil» даёт 9 900 × 0,38–1,10% ≈ 38–109. **Публиковать до ~15 ноября.**
- **Риск.** Средний: уход в развлекательный контент. protected = true.

### L3-09 — Гайд «Rasmiy xat yozish»
- **Страница.** `/uz/blog/rasmiy-xat-yozish/`.
- **Тексты.** Title «Rasmiy xat yozish: tuzilma, namuna va AI bilan qoralama».
- **Ключи.** xat yozish, rasmiy xat yozish, xizmat xati namuna.
- **Содержание.** Виды деловых писем (so‘rov, kafolat, da’vo xati), шаблон-плейсхолдер. Связь с `/uz/blog/tushuntirish-xati-va-ariza-yozish/` взаимная, пара с UZ-чатом.
- **Доказательства.** 3 600/мес (сен-26 6 600). В SERP есть prezi «Rasmiy yozishmalar qoidalari», ИИ-генератор promli.com #9 и Shorts «AI o'zbekcha». Намерение смешанное: школа и деловая переписка.
- **Оценка.** **13–36 кликов за 28 дней.** protected = true.

### L3-10 — Другие языковые пары после L3-01
- Расширить `translator_en` до параметризованной пары или добавить роли TR/KO/AR↔UZ. Страницы `/uz/turkcha-ozbekcha-tarjimon/` и т. п. строить только после 28-дневного замера L3-01.
- **Спрос.** turkcha o‘zbekcha tarjimon 880, koreyscha o‘zbekcha tarjima 720, arabcha tarjima 590.
- **Оценка.** 2 190 × 0,38–1,10% × 0,92 → **8–22 клика за 28 дней.** protected = true.

### Порядок внедрения
1. **Сразу, без защищённых правок:** L3-02 и L3-07.
2. **Одна проверенная ревизия `/`, все новые блог-страницы вместе:** L3-03, L3-04, L3-08 (успеть до середины ноября) и L3-09. Защищённые чаты и их ссылки не трогать: идёт 28-дневный замер сниппетов.
3. **После релиза RU↔UZ:** L3-01, затем L3-10 по данным.
4. **Решение владельца:** L3-05 (включение `STUDIO_PHOTO`) и L3-06 (страница вне ядра).

## 7. Что не строить и почему

| Группа | Примеры (объём/мес) | Причина |
|---|---|---|
| Бренды других ИИ | gemini 1 500 000, gemini ai 450 000, claude ai 135 000, deepseek 90 500, grok 74 000, chatgpt 4 74 000, chatgpt 5 60 500, copilot 22 200, perplexity 12 100, gemini скачать 8 100, deepseek chat 3 600 | Навигация к официальным продуктам. По «deepseek» в топ-20 нет ни одной узбекской страницы (serp2). Узбекские модификаторы бренда без объёма или 10–110 в месяц: «deepseek uzbek tilida» 10, «gemini uzbek tilida» 110, «grok uzbek» null. Писать про GPT-5 как про свою модель нельзя |
| Картинки, видео, голос | rasm chizish 22 200, rasmni tiniqlashtirish 1 000, logo yaratish 720, suniy intellekt rasm 480, matnni ovozga aylantirish 320, ai video yaratish 20 | В продукте этого нет (§3) |
| Тесты и экзамены | informatika test 49 500, fizika test 40 500, matematika test 27 100, dtm test 18 100, milliy sertifikat 18 100, test savollari 12 100 | В SERP банки тестов (qnb.uz, ziyonet, dtm-test). Сгенерированный ИИ тест с ошибками вредит пользователю. «test tuzish» 110 и «test yaratish» 70 — спрос учителей мал |
| Архивы контента | ertaklar 12 100, she’rlar 9 900, topishmoqlar 9 900, maqollar 8 100, hikoya 6 600, diktant 4 400, tush ta’biri 2 900, dissertatsiya 6 600 | Нет связи с продуктом |
| Орфография | imlo lug’ati 18 100, imlo 5 400, imlo tekshirish 880 | Нужен словарь. Сильный действующий игрок — imlo.uz, плюс izoh.uz, savodxon.uz и Muharrir |
| Чужое намерение | maktub yozish 12 100, xulosa yozish 8 100, masala (robocontest), kimyo masalalar 90 500 (всплеск: окт-25 20 → сен-26 165 000) | Выдача про другое или данные аномальны |
| RU-задачи и RU-общие | искусственный интеллект 6 600; «нейросеть для учебы/текста/реферата/кода» по 10; поздравление с днем рождения 18 100 | Авторитетная выдача или нет спроса в UZ |
| HOLD | matn yaratish 6 600, dalolatnoma namuna 1 300, bildirishnoma namuna 1 000, crm 3 600, crm система 1 000 | Намерение смешанное или SERP не снят. Пересмотреть после L3-03, L3-04 и L3-09 |
| B2B | telegram bot narxi, chat bot yaratish, ai bot biznes uchun, crm integratsiya — все null; amocrm 33 100 и bitrix24 8 100 — вендоры | Заморозка `bot-services` в `demand-policy.json` подтверждена |

## 8. Каннибализация и intent-manifest

- Ни одна новая страница не берёт ключи существующих владельцев из `content/seo/intent-manifest.json`. Проверено по индексу ключей всех 317 файлов `content/` (`page_keywords` в рабочей папке).
- Школьные гайды (L3-03, L3-04, L3-08, L3-09) оформляются парами с UZ-чатом, как C29–C32 и C41–C44 (решение A4 «PAIRS_NOT_CLUSTER»). Меняется только манифест, HTML защищённого чата не трогается.
- L3-04 требует правки C32 (`rezyume`): «obyektivka namuna» добавить в `mustNotTarget` у rezyume, а раздел rezyume должен ссылаться на новую страницу.
- L3-01: отдельная запись `architectureDecisions` рядом с записью переводчика RU↔UZ. Языковые пары не пересекаются.
- L3-07: «prompt nima» уходит гайду по промптам (C28). Защищённая библиотека этот ключ не объявляет. Риск — Google продолжит отдавать вопросный запрос библиотеке; это видно в GSC.

## 9. Файлы

- Отчёт: `docs/seo/research/2026-10-24-growth-audit/L3-demand-gaps.md`
- Сырые данные: `l3-data/kw1_metrics.json`, `kw1_table.txt`, `kw2_metrics.json`, `kw2_table.txt`, `research1_note.txt`, `serp1.json`, `serp1_table.txt`, `serp2.json`, `serp2_table.txt`, `serp3_table.txt`
- Карта ≥500: `l3-data/l3_map.py` → `l3-data/l3_map_table.md`
