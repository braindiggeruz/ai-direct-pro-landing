# L6 — Разрыв с конкурентами по головным запросам

Дата: 2026-10-24. Ветка `seo/chat-snippets-translator-20261024`, прод `d54d5b61`. `dist/` этой папки совпадает со сборкой прода. Аудит только читал. Записаны только этот отчёт и папка `l6-data/`.
Кредиты OpenSEO: `whoami` до работы показывал 23 235, после первого вызова SERP — 23 205, после второго — 23 185. Потрачено **50 из лимита 600**: два вызова `get_serp_results`, всего 10 ключей. Остальные вызовы (GSC, `whoami`) бесплатные.

## 1. Итог

1. **«чат гпт на русском» (1 600/мес): мы обещаем продукт, но на странице его нет.** По реестру интентов (`intent-manifest.json`, пара C10) этот кластер держит `/ru/gpt-na-russkom/` — «the product surface». Но это страница типа `niche`, и чата на ней нет: в HTML нет `gpt-chat-root`, есть 7 ссылок на `/ru/gpt-chat/`. Место №1 в мобильной и десктопной выдаче занимает ai.mitup.ru, где чат стоит прямо на странице (поле ввода есть уже в HTML, есть FAQ и инструкция к чату). В топ-20 ещё четыре независимых чата, остальные 12 мест — chatgpt.com и openai.com. Наша страница за 28 дней получила 95 показов, 0 кликов, позиция 16,2. Предлагаю перевести страницу на тип `gpt-chat` и поставить в title точную фразу (L6-01). Шаблон это уже умеет: в проде так сделаны 2 страницы, ещё 2 (переводчик, `status: draft`) лежат в content этой ветки.
2. **«sun’iy intellekt» (8 100/мес): выдача слабая, первое место занимает продукт.** В интерфейсе hl=uz №1 — salom-ai.uz. В HTML у него 10 слов, а title — «Sun'iy intellekt o'zbek tilida». Дальше идут Википедия (раздел «Tarixi»), новость minjusttraining на 723 слова и статья mohirdev на 768 слов. В интерфейсе hl=ru в топ-15 нет ни одной сильной статьи: 4 видео YouTube, тег mover.uz, prezi, gov.uz. Наша `/uz/suniy-intellekt/` (990 слов) стоит на позициях 58–77. По сравнению с конкурентами на ней нет раздела истории, таблицы популярных ИИ-сервисов и блока «попробуйте ИИ по-узбекски». Правки дополняют L3-02 и вносятся одной правкой с ней (L6-02).
3. **«chatgpt yuklab olish» (1 900/мес, сен-26 6 600): по тексту гайд уже на уровне конкурентов, отстаёт по наглядности.** Выдачу держат chatgpt.com/download, skillbox.ru (18 скриншотов шагов с подписями) и APK-каталоги со «справкой о приложении»: версия, требования, разработчик, дата. У нас 1 картинка на странице, требований к ОС и даты проверки данных из магазина нет. При hl=ru 13 из 18 органических мест занимают apkpure-клоны с чужими package name. Это прямой материал для раздела «как отличить подделку». Страница защищена и находится в своём окне П-CTR, поэтому правки идут в ревизию R-S2 (L6-03).
4. **Видео — общий пробел.** Видеоблок есть в 4 из 6 выдач. YouTube занимает 2, 4, 1, 0, 7 и 0 органических мест из топ-20 (hl=uz). При hl=ru по «sun’iy intellekt» — 4, по «telegram bot yaratish» — 6. На сайте нет ни одного видео и ни одного VideoObject. Шаблон блога умеет `figure` и `image`, а `video` не умеет (L6-04, нужен владелец).
5. **B2B: проигрываем не объёмом текста, а доказательствами.** Наш хаб `/ru/razrabotka-telegram-bota-tashkent/` — 4 310 слов и 22 FAQ, а у конкурентов коммерческие страницы на 635–1 585 слов. Зато у 5 из 7 B2B-конкурентов есть блок «Кейсы» или «Портфолио» либо отзывы. При этом у нас лежат два готовых кейса про Telegram-ботов в статусе `draft` (Deutschexperte и Haier Shop). На них нет ни одной входящей ссылки, и в sitemap их нет. Чтобы их опубликовать, владелец должен проверить факты и получить согласие клиентов (L6-05). Спрос на B2B-фразы почти нулевой (`demand-policy.json`, кластер `bot-services` заморожен), поэтому новых B2B-страниц не предлагаю. Предлагаю только правки существующих (L6-05, L6-06).
6. **По скорости мы впереди, и это надо сохранить.** Медианы: TTFB у нас 0,28 с, у конкурентов 0,57 с; HTML 70 КБ против 181 КБ; внешних скриптов 1 против 9; блокирующих скриптов в `<head>` 0 против 17 у skillbox. Видео встраивать только через «фасад» без iframe до клика.

## 2. Данные и метод

| Набор | Вызов / файл | resultId | Объём |
|---|---|---|---|
| SERP, 6 ключей, мобильная, hl по языку запроса | `get_serp_results`, loc 2860, depth 20 → `l6-data/serp_l6.json` | 59a6e29e-3439-464a-b7ca-b73958a3df85 | 6×20 строк |
| Контроль: 4 ключа с hl=ru (3 мобильных, 1 десктоп) | то же → `l6-data/serp_l6_hlru.json` | 8a84033f-3fe4-47a6-a8df-2b5b42a4deef | 4×20 |
| Ранее снятый SERP по chatgpt kirish / uzbekcha / o‘zbek tilida / чат гпт онлайн / чачи пити / чат gpt бесплатно | `../2026-10-24-snippets-translator/snippet-data.json` | c3897348-… | 6 ключей |
| Страницы конкурентов (26) и наши живые страницы (5): GET с UA Chrome на десктопе, пауза 0,7 с между запросами | `l6-data/l6_fetch.py`; ответы, заголовки и TTFB → `l6-data/fetch_index.json` | — | 31 URL, все 200 |
| Сигналы страниц: слова, H1–H3, FAQ, JSON-LD, даты, автор, формы, картинки, скрипты | `l6-data/l6_analyze.py` → `l6-data/pages_signals.json` (26 конкурентов + 5 живых + 13 наших из `dist/`) | — | 44 строки |
| GSC 28 дн. (2026-09-24..10-21), query+page по фильтрам «yuklab», «kirish», «intellekt», «на русском», «bot yarat», «бизнес» | `get_search_console_performance` | 64c9b0df, 4fdcee6b, 866eb0fe, ea8037ca, f69175e3, 1af82e58 | 15/42/4/19/10/34 строк |
| GSC «chatgpt yuklab olish»: по устройствам и по дням (10-01..10-23) | то же | e21ece02, 14f24c06 | 3 / 23 |
| GSC 3 мес., «telegram bot» | то же | 4e9ca0ce | 17 |
| GSC `/ru/gpt-na-russkom/`: запросы за 3 мес. и страница за 28 дн. | то же | 23554aa8, 31af0e35 | 17 / 1 |
| Спрос | `docs/seo/DEMAND_REALITY_CHECK_2026-08-01.md` §3 и строка 35; `l3-data/kw1_table.txt`, `l3-data/kw2_table.txt` | — | — |
| CTR по позиции | кривая сайта по запросам, без двух чатов (L1 §3.3): поз. 3 — 3,59%, 4 — 2,18%, 5 — 0,87%, 6 — 1,10%, 7 — 0,38%, 8 — 0,68% | — | — |

**Важная оговорка про SERP.** По GSC наши страницы стоят выше, чем видит DataForSEO. Гайд по скачиванию держит «chatgpt yuklab olish» на средней позиции 7,5 (мобильные 7,4, 22.10 — 4,8). А в обоих SERP (hl=uz и hl=ru) его нет в топ-20. Такое же расхождение есть в `snippet-data.json` по «chatgpt kirish». Поэтому SERP я использую только чтобы понять, **кто и с чем** стоит в выдаче. **Нашу позицию** беру из GSC.

**Как считаю эффект.** Клики за 28 дней = месячный спрос × 28/30,4 × CTR кривой сайта на целевой позиции, минус текущие клики. Это верхние оценки: позиция не гарантирована. Объёмы Google Ads склеивают близкие написания, поэтому соседние ряды не складываю.

## 3. Кто стоит выше gptbot.uz

| Запрос (спрос/мес) | Наша позиция: SERP / GSC | Особые блоки | Кто выше (органика) |
|---|---|---|---|
| chatgpt yuklab olish (1 900; сен-26 6 600, kw2_table) | нет в топ-14 органики hl=uz и в топ-18 hl=ru / GSC 7,5, 57 кл. / 4 002 пок. (гайд) | app, AI Overview, video, PAS | hl=uz: chatgpt.com ×7 (download fa-IR №1, help.openai), skillbox.ru №3, softonic.ru №5, YouTube ×2, play.google, uptodown, download.it. hl=ru: softonic fr №1, apkpure ×13 |
| chatgpt kirish uzbek tilida (под «chatgpt kirish» 33 100, L3) | блог-гайд №6 и `/ru/gpt-chat/` №8 / GSC: UZ-чат 5,1 (24 кл. / 2 313), гайд 8,2 (4 / 2 533) | video, app, AI Overview, PAS | chatgpt.uz №1, chatgpt.com/en №2, textie.ai №3, chat.openai.com №4, YouTube «ro'yxatdan o'tish» №5 |
| sun’iy intellekt (8 100) | нет в топ-15 (оба hl) / GSC: страница на 58–77, по 1 показу | AI Overview, video, PAS | hl=uz: salom-ai.uz №1, uz.wikipedia №2, minjusttraining №3, mohirdev №4, infocom («Eng mashhur 4 ta sun'iy intellekt») №5, airi.uz, gov.uz. hl=ru: uzinfocom, YouTube ×4, prezi, iais, gov.uz ×2, review.uz (2022) |
| чат гпт на русском (1 600) | нет в топ-17 (моб.) и топ-18 (деск.) / GSC: 1 показ за 28 дн. (на блоге) | AI Overview, app, PAS | ai.mitup.ru №1 (оба устройства), deepai №3/№4, openai-gpt.ru №3 (деск.), дальше chatgpt.com ×12, tochkagpt, geekbot, talkchatgpt |
| telegram bot yaratish (ряд null; «bot yaratish» 480, сен-26 880) | нет в топ-18 (оба hl) / GSC: 0 показов за 3 мес. | video №1, AI Overview | dcamp.io (курс) №1, yoqubov.uz (Python, 2023) №2, YouTube ×7, soff.uz ×2, birbir.uz ×2, sayt-yaratish-xizmati.uz №10 (№7 hl=ru), alfalab №18 |
| чат бот для бизнеса ташкент (родитель «чат бот для бизнеса» 10) | блог `/ru/blog/chat-bot-dlya-biznesa-v-tashkente-kak-vybrat-kanal/` №17 / GSC: `/ru/chat-bot-dlya-biznesa/` 22,6 (15 пок.) | AI Overview, PAA | oe.uz №1, mediasolutions.uz №2, birbir №3, bothelp.io (ТОП-2026) №4, olx ×2, aisolution, uzneo №7, autofy, creato, innobek, alfalab |

## 4. Сравнение страниц (топ-3 конкурента и наша)

Данные — `l6-data/pages_signals.json`. Слова — видимый текст HTML без скриптов. «Инструмент» — поле ввода (`textarea`) или форма в статическом HTML.

### 4.1 chatgpt yuklab olish → `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` 🔒

| Страница | Слов | H2 | FAQ (JSON-LD Q) | Схема | Дата изменения | Картинки | Что есть, чего нет у нас |
|---|---|---|---|---|---|---|---|
| chatgpt.com/fa-IR/download/ | 300 | 0 | 0 | — | — | 4 | официальные кнопки скачивания под все ОС |
| skillbox.ru/…/kak-skachat-chatgpt-na-android/ | 1 612 | 3 | 0 | Article, Person | 2026-07-14 | 61 `<img>`, из них **18 скриншотов** с подписью «Скриншот: Google / Skillbox Media» | скриншоты шагов, 4 способа, регистрация, автор-редакция |
| chatgpt-chat-with-ai.softonic.ru/android | 2 197 | 19 | 0 | MobileApplication, AggregateRating 10/2 | 2026-10-09 | 56 | «Разрешения», «Безопасность данных», «Целостность файла», версия |
| chatgpt.uptodown.com/android | 1 263 | 15 | 0 | MobileApplication, AggregateRating 4.3/6532 | — | 161 | «Requisitos», «ChatGPT 1.2026.293», «Otras versiones» |
| **наш гайд** | 1 196 | 10 | 10 | BlogPosting, FAQPage, Person (#author) | 2026-09-30 | **1** (+пиксель) | `com.openai.chatgpt` упомянут 3 раза, раздел про подделки есть; **нет скриншотов, требований к ОС, Microsoft Store и даты проверки данных из магазина** |

### 4.2 chatgpt kirish uzbek tilida → `/uz/blog/chatgptga-qanday-kirish-mumkin/` 🔒 и `/uz/gpt-uzbek-tilida/` 🔒

| Страница | Слов | H2 | FAQ Q | Схема | Инструмент | Заметка |
|---|---|---|---|---|---|---|
| chatgpt.uz/ | **14** | 0 | 0 | — | нет в HTML (SPA) | домен точно совпадает с запросом, в description «chatgpt.uz rasmiy sayti» |
| textie.ai/uz/chat-gpt | 2 595 | 11 | 13 | WebApplication, AggregateRating 4.6/136 | textarea ×2 | «Textie va boshqa AI chatlarni solishtirish», «sohalar bo‘yicha» |
| giti.ai/uz | 1 085 | 4 | 0 | — | — | под нами (№7) |
| **UZ-чат** | 2 455 | 16 | 13 | SoftwareApplication, FAQPage | чат монтируется через JS | раздел «Shu sahifadagi chat va chatgpt.com: farqi» уже есть |
| **гайд по входу** | 1 607 | 11 | 8 | BlogPosting, FAQPage | — | «Log in va Sign up farqi», VPN, ошибки |

Вывод: по тексту и разметке мы на уровне или выше. Разрыв в другом: точный домен chatgpt.uz (закрыть нельзя) и видео «ro‘yxatdan o‘tish» на YouTube (№5, №13, №14). Обе наши страницы защищены и находятся в окне замера, поэтому правок текста здесь не предлагаю.

### 4.3 sun’iy intellekt → `/uz/suniy-intellekt/`

| Страница | Слов | H2 | FAQ Q | Схема | Дата | Ключевое содержание |
|---|---|---|---|---|---|---|
| salom-ai.uz | **10** (SPA) | 5 пустых | 5 | SoftwareApplication (AggregateRating 4.8/1200), Organization + PostalAddress | — | title «Sun'iy intellekt o'zbek tilida — Salom AI»; FAQ «Sun'iy intellekt nima?», «Suniy intellekt o'zbek tilida ishlaydimi?», «…ChatGPT'dan farqi» |
| uz.wikipedia.org/wiki/Sunʼiy_intellekt | 1 468 | 5 | 0 | Article | 2026-10-10 | «Tarixi», 3 таблицы, источники |
| minjusttraining.uz/news/… | 723 | 0 | 0 | — | 21.01.2026 (в тексте) | «kundalik hayotdagi ahamiyati» |
| mohirdev.uz/blog/SI-nima-… | 768 | 6 | 0 | BlogPosting, Person | 2026-10-23 | «Tyuring testi», «Data sayns va SI» |
| **наша** | 990 | 9 | 6 | Article, FAQPage | 2026-10-07 | как работает, типы, отличие от программы, в Узбекистане, **бизнес**, ограничения, работа. **Нет:** истории, таблицы популярных ИИ, блока «попробуйте по-узбекски», схемы-картинки |

### 4.4 чат гпт на русском → `/ru/gpt-na-russkom/`

| Страница | Слов | H2 | FAQ Q | Схема | Инструмент | Заметка |
|---|---|---|---|---|---|---|
| ai.mitup.ru/chatgpt-free | 984 | 5 | 5 | SoftwareApplication + WebApplication, QAPage, VideoObject, AggregateRating 4.9/3589 | **textarea ×2** | title «ChatGPT на русском онлайн — …бесплатно без регистрации»; H2 «Инструкция к чату», «Выбери подходящую модель», «Отзывы»; список моделей до «gpt-6.1» |
| deepai.org/chat/gpt-chat | 604 | 4 | 0 | WebApplication, Offer | **textarea ×2** | «GPT Chat is not affiliated with OpenAI» |
| geekbot.ru | 744 | 4 | 0 | BreadcrumbList | **textarea** | H2 «Чат GPT на русском доступен онлайн», «режимы GeekBot» |
| **наша** | 775 | 6 | 4 | SoftwareApplication, FAQPage | **нет** (`pageType: "niche"`, 0 `gpt-chat-root`) | title «AI-чат на русском — тексты, идеи, учёба и бизнес»; фраз «чат гпт» / «чат GPT» нет ни в title, ни в H1 |

### 4.5 telegram bot yaratish → `/uz/telegram-bot-biznes-uchun/`

| Страница | Слов | H2 | FAQ Q | Схема | Что важно |
|---|---|---|---|---|---|
| dcamp.io/telegram_bot | 541 | 5 | 0 | — | курс, форма записи |
| yoqubov.uz/…pythonda-telegrambot-yaratish.html | 765 | 0 | 0 | NewsArticle (2023-08-13), автор с телефоном | пошаговый код на Python, BotFather |
| soff.uz/service/telegram-bot-yaratish-7 | 355 | 3 | 0 | WebSite | фриланс-предложение, «Portfolio (1 ta)» |
| sayt-yaratish-xizmati.uz/telegram-bot-yaratish (№10 / №7 hl=ru) | 696 | 7 | 4 | Service, Offer, FAQPage | H1 «Telegram bot yaratish»; H2 **«Konstruktor yoki dasturlash»**, «Oddiy bot yoki Mini App»; «1,2 mln so‘mdan» |
| **наш хаб** | 1 212 | 13 | 7 | Service, Offer, FAQPage | title «Telegram bot yaratish Toshkentda — 990 000 so‘mdan», но **H1 без «yaratish»**; блока «сам или на заказ» нет; кейсов про Telegram — 0 (ссылка только на Cake City) |

### 4.6 чат бот для бизнеса ташкент → `/ru/chat-bot-dlya-biznesa/`, `/ru/razrabotka-telegram-bota-tashkent/`

| Страница | Слов | H2 (ключевые) | FAQ Q | Схема | Доказательства |
|---|---|---|---|---|---|
| oe.uz/razrabotka-botov-facebook-telegram/ | 645 | «Кейсы», «Цены и тарифы», «Расчет стоимости» (3 000 000 сум) | 0 | — | кейсы, калькулятор, телефон, адрес |
| mediasolutions.uz/telegram-bot/ | 675 | «Что входит…», «Почему выбирают» | 0 | Organization | обновлено 2025-05-15 |
| bothelp.io/ru/blog/luchshie-chat-boty-dlya-biznesa | 2 450 | «Кейсы…», «Сравнение ТОП… 2026», FAQ | 5 | Article, FAQPage | обновлено 2026-10-23 |
| uzneo.uz/…/telegram-bot-dlya-biznesa-tashkent | 1 585 | «Что говорят клиенты», «По районам, городам и нишам» | 4 | LocalBusiness, ProfessionalService, GeoCoordinates | отзывы |
| **`/ru/chat-bot-dlya-biznesa/`** | 815 | без «Ташкент» в title/H1 | 6 | Service, FAQPage | обновлено **2026-06-25**; 0 ссылок на кейсы, калькулятор и сравнение |
| **хаб razrabotka** | 4 310 | 28 H2 | 22 | Service, Offer | ссылки на калькулятор ×3 и сравнение ×2; из кейсов — только Cake City |

### 4.7 Скорость (сигналы сервера, не CWV)

| Метрика | Конкуренты (26): медиана, мин–макс | Наши живые (5) |
|---|---|---|
| TTFB, с | 0,57 (0,15–1,56) | 0,28 (0,28–0,32) |
| HTML, КБ | 180,6 (11,7–691,3) | 69,7 (58,7–205,9) |
| Внешних скриптов | 9 (0–44) | 1 |
| Блокирующих JS в `<head>` | 0 (0–17) | 0 |

## 5. Сквозные выводы

| Сигнал | У конкурентов | У нас | Закрываем честно? |
|---|---|---|---|
| Инструмент прямо на странице под «чат … на русском / o‘zbek tilida» | textie, mitup, deepai, geekbot | только на 2 страницах чатов. На `/ru/gpt-na-russkom/` (владелец кластера) чата нет | да, L6-01 |
| Видео (видеоблок / YouTube в органике) | 4 из 6 выдач; YouTube 2/4/1/0/7/0 мест (hl=uz) | 0 видео, нет VideoObject и блока `video` в шаблоне | да, нужен владелец, L6-04 |
| Скриншоты в how-to | skillbox — 18 подписанных скриншотов шагов (softonic и uptodown показывают скриншоты самого приложения) | 1 контентная картинка на гайдах | да, L6-03 |
| Справка о приложении (версия, требования, дата) | softonic, uptodown | нет | да, только с данными из магазинов и датой проверки, L6-03 |
| AggregateRating | 5 из 26 страниц (textie, salom-ai, mitup, softonic, uptodown) | нет | только по реальным оценкам пользователей, L6-07 |
| Кейсы / портфолио / отзывы (B2B) | 5 из 7 B2B-сайтов (oe.uz, soff.uz, uzneo, bothelp, alfalab) | 2 опубликованных кейса не про ботов + 2 черновика про Telegram-ботов | да, после проверки владельцем, L6-05 |
| Блок «сам или на заказ» | sayt-yaratish-xizmati.uz | нет | да, L6-06 |
| История и сравнение ИИ-сервисов (информационный «sun’iy intellekt») | wiki «Tarixi», mohirdev «Tyuring testi», infocom «Eng mashhur 4 ta» | нет | да, L6-02 |
| Скорость | медиана TTFB 0,57 с, 9 скриптов | 0,28 с, 1 скрипт | мы впереди; не испортить видео-iframe |

## 6. Возможности

### L6-01 — `/ru/gpt-na-russkom/`: поставить на страницу сам чат и точную фразу
- **Доказательства.** Владелец кластера «чат гпт на русском» по C10 — эта страница («the product surface»). Спрос 1 600/мес, LOW 0,14 (DEMAND_REALITY_CHECK §3). В GSC за 28 дней у страницы 95 показов, 0 кликов, позиция 16,2 (31af0e35). Самого запроса за 3 месяца в её строках нет (23554aa8). №1 в обеих выдачах — ai.mitup.ru, страница с работающим чатом (textarea в HTML), инструкцией, FAQ и выбором модели. У deepai (№3) и geekbot (№14) поле ввода тоже есть прямо в HTML. talkchatgpt (№17) и tochkagpt (№13) я не разбирал или они без поля ввода: tochkagpt ведёт в Telegram-бот. Наша страница — описание без чата: `pageType: "niche"`, `gpt-chat-root` нет, 7 ссылок «перейти в чат».
- **Правка** (`content/pages/ru/gpt-na-russkom.json`):
  1. `pageType: "niche"` → `"gpt-chat"`. Это обычная роль чата, без `chatRole`. Шаблон `renderGptChatMain` в `scripts/prerender.ts` уже рендерит так `/ru/gpt-chat/` и `/uz/gpt-uzbek-tilida/`, а в этой ветке к ним добавлены две страницы переводчика (`draft`). Текущие `bodyBlocks` и FAQ становятся видимой сводкой под чатом. Проверить, что `scripts/gpt-chat-nav.ts` подбирает ссылки сводки и для пятой страницы.
  2. `title`: «Чат ГПТ на русском — независимый AI-чат | GPTBot.uz» (51 знак).
  3. `h1` (он же `data-h1` экрана чата): «Чат ГПТ на русском: AI-чат без установки».
  4. `description`: «Пишите по-русски прямо здесь: тексты, учёба, работа. 3 бесплатных пробных ответа без регистрации, затем AI-пакет. GPTBot.uz — независимый сервис, не OpenAI.»
  5. В title и H1 **не ставить** «онлайн», «бесплатно», «аналог ChatGPT». Это головы `/ru/gpt-chat/`, а по ней идёт 28-дневный замер сниппетов. `mustNotTarget` C10 («чат жпт», «чат джипити») не нарушать.
  6. Добавить H2 «Режимы: чат, перевод RU↔UZ, презентации» со ссылками на `/ru/prezentatsiya-ai/` и, после релиза ветки переводчика, на `/ru/russko-uzbekskiy-perevodchik/`. Аналог у конкурентов — блок «режимы» у geekbot. Добавить FAQ «Чем этот чат отличается от официального ChatGPT?» с честным ответом про провайдера и лимиты (у mitup такой вопрос первый).
- **Оценка.** 1 600 × 28/30,4 = 1 474 показа за 28 дней. При позиции 6–8 × 0,38–1,10% ≈ **6–16 кликов**, при позиции 3–4 (как у mitup) × 2,18–3,59% ≈ 32–53. Сейчас 0. Уверенность низкая: 12 мест из 17 в выдаче занимают официальные URL.
- **Риск** средний. Пятая страница с чатом может забрать часть запросов «чат жпт на русском» у `/ru/gpt-chat/` во время замера. Объём мал: у `/ru/gpt-na-russkom/` всего 95 показов за 28 дней, и «на русском» до сих пор уходил в основном на блог. Варианты: выкатывать сейчас и записать изменение в журнал чтения R-S1 как параллельное, или дождаться конца чтения (≈21.11). Страница не в `PROTECTED_PATHS` → protected = false. Проверка: `npm run build:cf`, `node --test`, на живой странице один H1 и один `gpt-chat-root`.

### L6-02 — `/uz/suniy-intellekt/`: закрыть разрыв с топ-5 (вместе с L3-02)
- **Доказательства.** Спрос 8 100/мес, ключ утверждён в `demand-policy.json`. Позиции 58–77 (866eb0fe). В hl=uz топ-5: продукт salom-ai (FAQ «Sun'iy intellekt nima?» и «o'zbek tilida ishlaydimi?»), Википедия с «Tarixi», две короткие статьи (723 и 768 слов, обе свежие: 21.01.2026 и 2026-10-23), сравнение infocom «Eng mashhur 4 ta sun'iy intellekt». В hl=ru сильной статьи нет совсем (YouTube ×4, prezi, gov.uz). По тексту наша страница не короче (990 слов), но отвечает на один интент — «nima», с уклоном в бизнес. Истории, сравнения сервисов и входа в продукт на ней нет.
- **Правка** (`content/pages/uz/suniy-intellekt.json`; выкатывать одной правкой с L3-02: ключи, фраза о написании, блоки для школьника, ссылки):
  1. `title`: «Sun’iy intellekt nima: turlari, tarixi, o‘zbekcha misollar» (58 знаков). H1 оставить.
  2. Сразу после вступления — короткий блок H2 «Sun’iy intellekt bilan o‘zbekcha gaplashib ko‘ring». Текст: «GPTBot.uz — mustaqil o‘zbekcha AI chat: ro‘yxatsiz 3 ta bepul sinov javobi, keyin AI paket. OpenAI yoki ChatGPT’ning rasmiy mahsuloti emas.» Ссылка с анкором «sun’iy intellekt chat (o‘zbek tilida)» → `/uz/gpt-uzbek-tilida/`. Анкор совпадает с ключом, который чат уже объявил, поэтому релевантность уходит владельцу, а интент не дублируется.
  3. H2 «Sun’iy intellekt tarixi: Tyuring testidan ChatGPT’gacha» — список дат, каждая с источником в `sources`: 1950 — статья Алана Тьюринга и тест Тьюринга; 1956 — Дартмутский семинар и термин «artificial intelligence»; 1997 — Deep Blue и Каспаров; 2012 — AlexNet; 2017 — Transformer («Attention Is All You Need»); ноябрь 2022 — ChatGPT.
  4. H2 «Mashhur sun’iy intellekt xizmatlari: qaysi biri nimaga?» — таблица на 5 строк: ChatGPT (OpenAI), Gemini (Google), Claude (Anthropic), DeepSeek, GPTBot.uz (mustaqil). Колонки: разработчик, сильная сторона по официальному описанию, ссылка. Лимиты и цены не выдумывать, писать «rasmiy saytda tekshiring». Подробное сравнение — ссылка на существующую `/uz/blog/chatgpt-claude-gemini-ozbekistonda/`.
  5. Три FAQ из вопросов выдачи: «Sun’iy intellekt o‘zbek tilida ishlaydimi?», «Eng mashhur sun’iy intellekt xizmatlari qaysilar?», «Sun’iy intellektdan bepul foydalanish mumkinmi?».
  6. Один `figure`: схема «sun’iy intellekt → mashinali o‘rganish → chuqur o‘rganish → katta til modellari» с alt на узбекском (у Википедии 15 картинок, у нас 1).
- **Оценка.** Входит в диапазон L3-02 (≈15–155 кликов за 28 дней), **отдельно не суммировать**.
- protected = false. Ссылка с защищённой `/uz/blog/ai-chat-nima-va-qanday-turlari-bor/` — только отдельной ревизией.

### L6-03 — Гайд по скачиванию: скриншоты, справка о приложении, клоны APK (в ревизию R-S2)
- **Доказательства.** «chatgpt yuklab olish»: 57 кликов / 4 002 показа, CTR 1,42%, позиция 7,5 за 28 дней (64c9b0df). Мобильные: 3 219 показов, позиция 7,4 (e21ece02). Позиция колеблется 4,8–9,0 по дням (14f24c06). Спрос 1 900/мес в среднем за 12 месяцев, сен-26 6 600 (kw2_table). Конкуренты выше: skillbox (18 подписанных скриншотов шагов, Article + Person), softonic и uptodown (MobileApplication, версия, требования, разрешения, дата). При hl=ru 13 из 18 мест — apkpure-страницы приложений «Chat GPT» с чужими package name (`com.samlam.chatgpt`, `com.chatgpt.chatbot.hya` и т. п., `serp_l6_hlru.json`). На нашем гайде одна контентная картинка (hero). Требований к ОС, Microsoft Store и даты проверки нет. `com.openai.chatgpt` упомянут.
- **Правка** (`content/blog/uz/chatgpt-telefon-va-kompyuterga-yuklab-olish.json`; title, H1 и description не трогать — правило отката C11):
  1. Блок `table` «Rasmiy ChatGPT ilovasi: tekshirilgan ma’lumotlar (YYYY-MM-DD)». Строки: издатель в Google Play и App Store; package name `com.openai.chatgpt`; минимальная версия Android и iOS; ПК — Windows и macOS (ссылка chatgpt.com/download, Microsoft Store — только если это подтвердит официальная страница); цена «bepul, ixtiyoriy pullik tariflar». **Все значения копировать из магазинов в день правки и указывать дату проверки.** Номера версий не писать: они меняются каждую неделю.
  2. 4–6 блоков `figure` с настоящими скриншотами: карточка в Google Play с издателем «OpenAI», карточка в App Store, chatgpt.com/download, пример клона из APK-каталога с размытым названием. Alt на узбекском, WebP, `width`/`height`, `loading="lazy"`.
  3. В раздел «Soxta ChatGPT ilovasini qanday aniqlash mumkin?» добавить H3 «APK saytlaridagi “Chat GPT” ilovalari» с проверкой по package name и издателю.
- **Оценка.** Если средняя позиция по «chatgpt yuklab olish» поднимется до 3–4: 4 002 × 2,18–3,59% = 87–144 клика против 57 сейчас, то есть **до +30…+87 за 28 дней**. Если позиция не изменится — около 0. Растущий спрос (сен-26) в оценку не включён.
- **Когда.** После чтения П-CTR гайда (≈06–10.11, L1) — в ревизии R-S2 (2026-11-16, запись C11 в манифесте). protected = true: меняется `bodyTextSha256`, нужна проверенная ревизия `docs/seo/evidence/<date>-r-s2/` и новый BASELINE.

### L6-04 — Видео: 4 честных скринкаста и блок `video` в шаблоне
- **Доказательства.** Видеоблок есть в выдаче по «chatgpt yuklab olish», «chatgpt kirish uzbek tilida», «sun’iy intellekt», «telegram bot yaratish». YouTube в топ-20 органики (hl=uz): 2, 4, 1, 0, 7, 0. При hl=ru: «sun’iy intellekt» — 4, «telegram bot yaratish» — 6. Раньше в «chatgpt uzbekcha» было 4 видео в топ-10 (`snippet-data.json`). В `dist/` нет ни одного `youtube`/`<video>`/VideoObject. Блог-шаблон знает `figure`/`image`/`table`/`linkp`/`list`/`quote`/`cta`, но не `video` (`scripts/prerender-blog.ts`).
- **Правка.**
  1. Владелец записывает 4 коротких скринкаста (2–4 мин, узбекские субтитры или голос): «ChatGPT’ni telefonga yuklab olish va soxtasidan ajratish»; «ChatGPT’ga kirish va ro‘yxatdan o‘tish — 3 qadam»; «O‘zbek tilida AI chat: GPTBot.uz’da 3 ta bepul savol»; «Telegram bot yaratish: BotFather’da 5 daqiqada va qachon dasturchi kerak». Загружает их на канал GPTBot.uz на YouTube.
  2. Код: блок `video` в `scripts/prerender-blog.ts` и `scripts/prerender.ts`. Это фасад: превью `<img>` + кнопка, iframe `youtube-nocookie.com` только по клику, чтобы не потерять скорость (§4.7). Под видео — расшифровка. В JSON-LD — VideoObject (name, description, thumbnailUrl, uploadDate, duration, embedUrl, contentUrl).
  3. Порядок: сначала незащищённые страницы — `/uz/telegram-bot-biznes-uchun/` и `/uz/suniy-intellekt/`, на них проверить шаблон. Потом гайды 🔒 по скачиванию и входу — в их ревизиях.
- **Оценка.** Неизвестна. Видео может занять место в выдаче на youtube.com независимо от страниц сайта. Замер: показы и клики YouTube Studio по поиску Google, плюс GSC `searchAppearance` для страниц с видео.
- requires_owner = true (канал, запись, голос). protected = true для двух гайдов, для остальных страниц — нет.

### L6-05 — B2B: опубликовать 2 кейса про Telegram-ботов и показать доказательства на страницах услуг
- **Доказательства.** Блоки «Кейсы», «Портфолио» или отзывы видны в H2 у oe.uz (№1, «Кейсы»), alfalab (№13/№18, раздел «Loyihalar» / «Кейсы»), soff.uz («Portfolio (1 ta portfolio)»), uzneo («Что говорят клиенты») и bothelp («Кейсы использования…»). Это 5 из 7 B2B-сайтов, чьи страницы скачаны; у mediasolutions и sayt-yaratish-xizmati такого H2 нет. У нас `content/blog/ru/keys-deutschexperte-uchebnyy-tsentr-telegram-bot.json` и `keys-haier-shop-internet-magazin-telegram.json` в статусе `draft`, `robotsIndex: false`. Входящих ссылок 0, в `dist/sitemap.xml` их нет. В технической находке `docs/seo/gptbot.uz-audit/findings/technical.md` они названы непроверенными черновиками. `/ru/chat-bot-dlya-biznesa/` не ссылается ни на кейсы, ни на калькулятор, ни на сравнение. Обновлена 2026-06-25, у конкурентов — 2026-10-23. Хабы ссылаются только на кейс Cake City.
- **Правка.**
  1. Владелец проверяет каждый факт и цифру в двух черновиках и получает согласие клиентов. Про Haier: формулировку «официальный магазин» сверить со статусом клиента. После этого `status: "published"`, `robotsIndex: true`.
  2. Блок «Кейсы» с этими двумя кейсами и Cake City — на `/ru/razrabotka-telegram-bota-tashkent/`, `/ru/chat-bot-dlya-biznesa/`, `/ru/stoimost-chat-bota/`, `/uz/telegram-bot-biznes-uchun/`, `/uz/chat-bot-narxi/`. UZ-версии кейсов делать позже, по тем же проверенным фактам.
  3. На `/ru/chat-bot-dlya-biznesa/` добавить ссылки на `/ru/kalkulyator-stoimosti-telegram-bota/` и `/ru/luchshie-razrabotchiki-chat-botov-tashkent/` (форматы oe.uz и bothelp), в title добавить «в Ташкенте» и обновить дату.
- **Оценка.** По кликам — неизвестна, близка к нулю: «чат бот для бизнеса» — 10/мес, B2B — 63 клика за 28 дней на 219 страниц. Ценность в конверсии и E-E-A-T. requires_owner = true. protected = false. Риск низкий, если факты проверены, и высокий, если опубликовать без согласия клиентов.

### L6-06 — UZ-хаб Telegram: H1 с «yaratish» и блок «сам или на заказ»
- **Доказательства.** Выдача «telegram bot yaratish» в обоих hl — про обучение и «сделай сам»: YouTube ×7 / ×6, курс dcamp, урок Python от 2023 года на №2. Единственная коммерческая страница, которая держится в обеих выдачах (№10 / №7), — sayt-yaratish-xizmati.uz: H1 «Telegram bot yaratish» и H2 «Konstruktor yoki dasturlash», «Oddiy bot yoki Mini App». У нашего хаба почти такой же title, но H1 «Telegram bot biznes uchun: savdoni avtomatlashtirish», и блока «сам или на заказ» нет. В GSC за 3 месяца по «telegram bot yaratish» 0 показов. Единственный запрос хаба с «telegram bot» — «telegram bot buyurtma o'zbekiston»: 19 показов, позиция 9,8 (4e9ca0ce). Спрос: точный ряд null, «bot yaratish» 480/мес (сен-26 880), «telegram bot» 720 (kw1/kw2). Кластер `bot-services` заморожен для новых money/niche-страниц, поэтому только правка существующей.
- **Правка** (`content/pages/uz/telegram-bot-biznes-uchun.json`):
  1. `h1`: «Telegram bot yaratish biznes uchun: arizalarni avtomatlashtirish».
  2. Новый H2 «O‘zingiz yaratasizmi yoki buyurtma qilasizmi: BotFather, konstruktor yoki dasturchi». Таблица на 3 строки: BotFather + конструктор — меню и ответы, без CRM; ограничения конструкторов; заказ — заявки в CRM, оплата, AI. Честно указать, когда хватит своими силами. Ссылка на RU-гайд `/ru/blog/kak-sozdat-telegram-bota/`. Отдельную UZ-статью «сделай сам» сейчас не строить: спрос не измерен.
  3. 2 FAQ: «Telegram botni o‘zim bepul yarata olamanmi?», «Konstruktor qachon yetmaydi?».
- **Оценка.** 480 × 28/30,4 × 0,38–1,10% ≈ **2–5 кликов за 28 дней**, и то если хаб войдёт в топ-8 по вариантам «сделай сам». Точный ряд не измерен. Уверенность низкая.
- protected = false. Риск низкий. Смешение интентов умеренное, у конкурента та же схема работает.

### L6-07 — Настоящие оценки пользователей вместо пустого места под AggregateRating
- **Доказательства.** AggregateRating стоит у 5 из 26 страниц конкурентов, в том числе у трёх B2C-чатов выше нас: textie 4.6/136, salom-ai 4.8/1200, mitup 4.9/3589. У нас SoftwareApplication на трёх страницах чата без рейтинга. Выдумывать рейтинг нельзя.
- **Правка (продукт).** После 3-го ответа в чате спрашивать оценку 1–5, одну на сессию. Хранить на сервере вместе со счётчиком. Показывать на странице чата видимую строку «O‘rtacha baho X (N ta baho)». Только после этого добавить `aggregateRating` в существующий узел SoftwareApplication. Google не показывает звёзды для LocalBusiness и Organization, которые оценивают сами себя, поэтому только SoftwareApplication и только реальные оценки.
- **Оценка.** Неизвестна. Звёзды могут поднять CTR, но страницы чатов сейчас на замере сниппетов, так что не раньше ≈21.11. requires_owner = true (продуктовое решение, приватность, модерация). protected = true (чаты).

## 7. Что у конкурентов есть, но копировать нельзя

| Приём | У кого | Почему нет |
|---|---|---|
| «rasmiy sayti» в description | chatgpt.uz (№1 «chatgpt kirish uzbek tilida»), chatgpt.uz/ai/ | ложная претензия на официальность; у нас правило «не OpenAI» |
| Модели «GPT-5/6/6.1» в title и тексте | ai.mitup.ru, chatx.ai, openai-gpt.ru | наш чат работает на провайдере `zai` (L3); обещать модели нельзя |
| AggregateRating без видимых отзывов | salom-ai (SPA, 10 слов), textie | только реальные оценки (L6-07) |
| Каталоги клонов APK | apkpure, softonic | вредно пользователю; у нас — раздел о том, как их распознать (L6-03) |
| Домен, точно совпадающий с запросом | chatgpt.uz | не закрыть и не нужно |

## 8. Ограничения

- SERP DataForSEO для loc 2860 не видит наши страницы там, где GSC даёт позицию 5–8 (§2). Состав выдачи надёжен, наша позиция в нём — нет.
- Сигналы страниц взяты из статического HTML. У SPA (chatgpt.uz, salom-ai.uz) видимый после JS текст не учтён. Googlebot его видит.
- Оценки AI Overview (он есть во всех 6 выдачах) не делались: нужны платные вызовы видимости в ИИ.
- Объёмы — Google Ads через DataForSEO, близкие варианты склеены. «чат гпт на русском» 1 600 — замер 2026-08-01, в cannibalization.md тот же объём подтверждён 2026-10-24.
