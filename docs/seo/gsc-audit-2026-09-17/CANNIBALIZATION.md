# Cannibalization — gptbot.uz (query × page, 17.06–14.09.2026)

Метод: по `query_page__last90` берутся запросы с ≥ 30 показами, у которых ≥ 2 URL держат ≥ 10% показов (и ≥ 5 показов). Для каждого случая: доля доминирующего URL, локали, тип страниц, доминирующий URL в последние 28 и предыдущие 28 дней. Полная таблица — `csv/cannibalization_candidates.csv` (37 кандидатов).

Вердикты: true_candidate 17, language_variant_not_cannibalization 15, minor_overlap 3, legacy_redirect_not_cannibalization 1, home_vs_landing_review 1.

## Не каннибализация (нормальное распределение)

**RU/UZ страницы чата по «uzbekcha/uz/uzbekistan»-запросам (15 случаев).** /ru/gpt-chat/ и /uz/gpt-uzbek-tilida/ связаны hreflang и оба релевантны: «chatgpt uz» (801 показ: RU 474 / UZ 326; клики 9 / 3), «chatgpt uzbekcha» (985: UZ 873 / RU 111), «chatgpt uzbekistan» (170: RU 96 / UZ 73). Это языковой выбор Google, а не конфликт. Проблема не в двух URL, а в том, что для чисто узбекских запросов («chatgpt uzbekcha online» 1 011 показов) выбирается русская страница — это задача усиления UZ-страницы и внутренней ссылки, не канонизации (см. QUICK_WINS T04).

**Legacy 301:** «разработка сайта под ключ» — /ru/razrabotka-saytov-tashkent/ и старый /ru/razrabotka-sayta-pod-klyuch/ (301). Google дочистит сам.

**Оба URL в топ-2:** «как оплатить чат gpt в узбекистане» — /ru/blog/kak-oplatit-chatgpt-v-uzbekistane/ (22 показа, поз. 1,8, 5 кликов) и /ru/blog/chatgpt-i-claude-v-uzbekistane/ (21, поз. 1,6, 0 кликов). Сайт занимает две верхние позиции; клики уходят на профильную статью. Не трогать.

**Незначительное перекрытие (доминант ≥ 85%):** «seo продвижение сайтов», «chatgpt скачать uzbek tilida», «instagram direct nima».

## Подтверждённая каннибализация (действовать)

### 1. Кластер «kirish / ochish» — три узбекские статьи

| Запрос | Показы 90д | URL и показы | Позиции | Клики | Доминант менялся |
|---|---|---|---|---|---|
| chatgpt ochish | 3 365 | login-статья 1 855; download-статья 1 287 | 5,9 / 6,5 | 11 / 10 | да (download → login) |
| chatgpt kirish uzbek tilida | 2 960 | /uz/gpt-uzbek-tilida/ 1 936; login-статья 959 | 5,9 / 9,8 | 7 / 1 | нет |
| chatgpt ochish uzbek tilida | 484 | login 322; download 112 | 6,1 / 6,3 | 0 / 1 | да |
| chatgpt online kirish | 146 | login 101; чат 28; VPNsiz-статья 17 | 5,2 / 5,9 / 6,9 | 0 | — |
| chatgpt ga kirish | 122 | login 95; VPNsiz 25 | 7,9 / 8,2 | 0 | — |
| chat gpt kirish | 43 | login 33; чат 10 | 7,8 / 9,2 | 0 | — |
| chatgpt 4 uzbek tilida | 112 | чат 90; VPNsiz 21 | 9,1 / 9,1 | 0 | — |
| chatgpt uzbek tilida skachat | 102 | чат 60; download 41 | 8,2 / 7,2 | 0 | — |

Причины: title VPNsiz-статьи начинается с «ChatGPT’ga kirish O‘zbekistonda», title/H1 login-статьи используют «login», а не «kirish/ochish»; download-статья имеет H2 «ChatGPTni yuklamasdan ishlatsa bo‘ladimi?» и внутренние блоки про вход. Интент у всех трёх запросов один (открыть/войти в ChatGPT) — конфликт настоящий.

Решение (без изменения canonical и URL):
- login-статья — единственный владелец «kirish / ochish / login»: title и H1 со словами «kirish» и «ochish», H2 «ChatGPT ochish: 3 qadam»;
- VPNsiz-статья — владелец «ishlaydimi / VPNsiz / rasman»: убрать «kirish» из title/H1, оставить ссылку на login-статью с якорем «ChatGPT’ga kirish»;
- download-статья — владелец «yuklab olish / skachat / ilova / kompyuter»: блок про вход сократить до 1–2 предложений со ссылкой на login-статью;
- узбекский чат — владелец «uzbek tilida / uzbekcha / online / bepul / kirish uzbek tilida» (интент «пользоваться на узбекском» отличается от «войти в OpenAI») — добавить «kirish» в title, но не превращать в инструкцию входа.
- Проверка: через 3–4 недели по `query_page` доля доминирующего URL по «chatgpt ochish» ≥ 80%, VPNsiz-статья исчезает из «kirish»-запросов, суммарные клики кластера не падают.

### 2. «o'zbekistonda biznes uchun ai bot» — /uz/, блог и лендинг

66 показов/90д: /uz/ 12 (поз. 11,1), /uz/blog/biznes-uchun-ai-bot-nima-oddiy-tushuntirish/ 11 (12,1), /uz/biznes-uchun-ai-bot/ 9 (11,3); 0 кликов. Title /uz/ — «Biznes uchun AI botlar O‘zbekistonda», лендинга — «Biznes uchun AI bot Toshkentda — 1 990 000 so‘mdan». Главная UZ и лендинг целятся в одно. Решение: /uz/ описывает компанию/направления, лендинг /uz/biznes-uchun-ai-bot/ — единственная цель для «biznes uchun ai bot»; с /uz/ и из блога — ссылки с точным якорем. Объём мал, приоритет P2.

### 3. «бот для инстаграм директ» — лендинг vs статья

80 показов/90д: /ru/instagram-direct-bot/ 53 (поз. 26,2), /ru/blog/instagram-direct-bot-kak-rabotaet/ 27 (29,4); 0 кликов; 48 показов из России. Решение: статья ссылается на лендинг с якорем «бот для Instagram Direct», лендинг получает формулировку запроса в H1 («Бот для Instagram Direct для бизнеса в Узбекистане»). Приоритет P3 (география).

### 4. «разработка чат ботов ташкент» — три коммерческих URL

37 показов/90д: /ru/luchshie-razrabotchiki-chat-botov-tashkent/ 15 (17,9), /ru/stoimost-chat-bota/ 5 (73,4); в предыдущие 28 дней доминировал /ru/blog/razrabotka-chat-bota/. Плюс /ru/razrabotka-telegram-bota-tashkent/ по смежным запросам. Title «Разработка чат-ботов в Ташкенте — как выбрать студию 2026» — информационная рамка на коммерческий запрос. Решение: сделать /ru/luchshie-razrabotchiki-chat-botov-tashkent/ единственной страницей «Разработка чат-ботов в Ташкенте» (title/H1 без «как выбрать студию», блок цен со ссылкой на /ru/stoimost-chat-bota/, кейсы Cake City и Graver), остальные — ссылки на неё с точным якорем. P2.

### 5. «продвижение сайта» / «seo продвижение сайтов» — статья vs сервисная страница

Статья /ru/blog/chto-takoe-seo-prodvizhenie/ доминирует по показам (140 и 21) на позициях 62–64, сервисная /ru/seo-prodvizhenie-saytov-tashkent/ — 16 и 11 показов, но на позиции 13,8 по «продвижение сайта». Показы статьи в основном не из Узбекистана. Решение: статья ссылается на сервис с якорем «SEO-продвижение сайтов в Ташкенте»; сервисная страница закрывает локальные «seo ташкент» (30 показов, 38,3), «seo в ташкенте» (22, 45,6), «seo продвижение цена» (7, 12,4). Общий RU-запрос «seo продвижение» (228 показов, 60) не целевой — не преследовать. P3.

### 6. «автоматизация приема заявок» — лендинг vs инструкция

39 показов: /ru/avtomatizatsiya-zayavok/ 22 (40,2), /ru/blog/avtomatizatsiya-zayavok-instruktsiya/ 16 (59,7). Обе далеко; связать ссылкой, лендинг — цель. P3.

### 7. «gptbot» — / vs /ru/

30 показов: / 13 (поз. 1,4, 10 кликов), /ru/ 6 (2,7). Брендовый навигационный запрос; главная получает клики. Не вредно, но подсвечивает вопрос двух русских главных (/ и /ru/) — см. TECHNICAL_SEO.md (hreflang/canonical кластер главных).

## Проверка «настоящая ли»

- Одинаковый интент: да для кластера 1, 2, 3, 4, 6; для RU/UZ-пар — нет (язык).
- Меняются ли URL во времени: да для «chatgpt ochish», «chatgpt ochish uzbek tilida», «чат гпт на узбекском», «chat gpt uzbek tilida», «разработка чат ботов ташкент» (`dominant_url_changed = True`).
- Делят ли клики: заметно только «chatgpt ochish» (11/10); остальные случаи — показы без кликов.
- Языковые причины: 15 случаев — да.

Ограничение: измерение `date × query × page` не выгружалось; смена доминирующего URL оценена по двум окнам (28 / пред. 28), а не по дням.
