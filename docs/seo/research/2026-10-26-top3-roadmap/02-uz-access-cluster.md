# 02. Узбекский кластер «доступ к ChatGPT»: какая страница отвечает на какой запрос и как выйти в ТОП-3

Срез на 26.10.2026. Только чтение: сайт, репозиторий и OpenSEO не менялись, кроме создания этого файла.
Вход — отчёт `docs/seo/research/2026-10-26-top3-striking/` (TOP3_STRIKING.md, pairs.csv, serp.json) и свежие данные ниже.

Обозначения источников: [GSC] — Search Console, только Узбекистан (`country = uzb`), если не сказано иное; P1 = 27.09–24.10, P0 = 30.08–26.09.
[SERP-R] — снимок из отчёта (mobile, глубина 30, 26.10). [SERP-M] и [SERP-D] — мои снимки 26.10 (mobile и desktop, глубина 20, `resultId 2ea5d241…`, `6364481f…`, `27cff22b…`).
[KM] — объём Google Ads, локация 2860, `languageCode ru`, с помесячной динамикой. [REPO путь:строка]. [WF] — WebFetch. **UNVERIFIED** — гипотеза без доказательства.

---

## 0. Коротко

1. **Узбекский чат `/uz/gpt-uzbek-tilida/` с 05.10 почти выпал из запросов «uzbek tilida / uzbekcha».** За 14.09–04.10 у него было 3 559 показов «chatgpt kirish uzbek tilida», 1 261 — «chatgpt uzbekcha», 875 — «chatgpt uzbekcha bepul», 1 175 — «chatgpt uzbek tilida online», 1 271 — «chatgpt uzbek tilida gaplashish» (позиции 3,9–5,7, CTR 0,8–2,6 %). За 12–25.10 от этого осталось 175 показов «kirish uzbek tilida», 37 — «gaplashish», остальные строки ниже 15 показов [GSC]. По дням обвал начинается 05–10.10 [GSC, date×page]. В этот же день (R-S1, 05.10) H1 сменился с «ChatGPT o‘zbek tilida online» на «O‘zbek tilida AI chat — ChatGPT’ga bepul muqobil» [REPO git `98f8eb8b` → `533eed03`]. Это самая сильная гипотеза причины, но не доказательство: в тот же день менялись title и текст.
2. **«chatgpt kirish uzbek tilida» сейчас забрал гайд по входу:** 2 055 показов, поз. 8,0, **0 кликов** за 12–25.10; чат — 175 показов на поз. 5,7 [GSC]. Это ровно то, что чинит запланированный W3-01 (≈21–25.11).
3. **ТОП-3 реален примерно для 10 запросов из 19.** Сейчас его держит только гайд по скачиванию: «chatgpt yuklab olish uzbek tilida», поз. 2,6, 4 335 показов и 149 кликов за 14 дней [GSC]. Рядом «chatgpt ilovasini yuklab olish» (поз. 4,1–4,3; в [SERP-M] №2). Вернуть можно семью «uzbekcha / uzbek tilida / online / gaplashish / kirish uzbek tilida»: до 05.10 мы стояли там на 3,9–5,7, а в ТОП-3 выдачи сейчас Instagram, YouTube, chatgpt.uz, textie.ai и дорвеи. Плюс «jaji piti online» и, возможно, «chatgpt yozish».
4. **ТОП-3 недостижим** для «chatgpt kirish» (33 100/мес), «jaji piti», «chati piti», «chachipiti» (18 100/мес, у нас почти 0 показов), «chatgpt bepul kirish», «chatgpt ochish», «chatgpt yuklab olish». Во всех трёх снимках первые места там у chatgpt.com, openai.com и Google Play. Цель для них — CTR своих показов, а не позиция.
5. **Снимки выдачи не годятся как мерило позиции.** «chatgpt ilovasini yuklab olish»: в [SERP-R] нас нет среди 22 строк, а в [SERP-M] в тот же день мы №2. «chatgpt yuklab olish uzbek tilida» (GSC 2,6): нас нет ни в одном из трёх снимков. ТОП-3 мерить по GSC (UZB, mobile, query×page), а вживую сверять раз в неделю с телефона в Ташкенте.
6. **Каннибал № 1 — наш же RU-чат** (пара hreflang с UZ-чатом). По «chatgpt bepul» у RU-чата 3 546 показов на поз. 5,8, у UZ-чата 73. По «chatgpt uzbekcha» в [SERP-D] стоит RU-чат №5 со старым русским title. По «chatgpt uzbek tilida online» за 12–25.10 у RU-чата 281 показ на поз. 8,9 [GSC]. Каннибал № 2 — статья promptlar: за 12–25.10 по «chatgpt uzbek tilida gaplashish» она главная (153 показа, поз. 8,5), у чата 37.
7. **Спрос сезонный и смещается.** В сентябре «chatgpt kirish» вырос до 90 500, «chatgpt yozish» — до 22 200, «chachipiti» — до 49 500. «chatgpt uzbekcha» упал с 9 900 (янв.) до 2 400 (сент.), «chatgpt uzbek tilida» — с 4 400 (окт. 2025) до 720 [KM]. Следующий пик по истории — январь–апрель. Всё, что даёт ТОП-3, должно быть в индексе до середины января 2027.
8. **Пять из шести страниц кластера защищены** (`scripts/seo-protection.ts:210-219`). Сейчас на них открыты три окна замера, поэтому до ≈21–25.11 на чате и гайде по входу меняем только то, что уже запланировано. Гайд по скачиванию получает R-S2 16.11. Сейчас можно делать только то, что не трогает HTML: скриншоты, видео, YouTube, ручные проверки, черновики ревизий.
9. **По медиа отстаём везде:** на всех трёх страницах-владельцах 0 скриншотов и 0 видео. В выдаче почти каждого запроса есть блок видео и YouTube в ТОП-10 (по «chatgpt kirish» — 4 ролика в ТОП-10 [SERP-R]). Свои узбекские ролики на YouTube — единственный способ занять «неофициальные» места в ТОП-3 навигационных выдач, не трогая защищённые страницы.
10. **Деньги.** Все оплаты AI-пакета пришли через главные чаты (`docs/monetization/2026-10-25-tariffs-roadmap/ROADMAP.md:147`). Студия (≥1 990 000 сум) из этого кластера идёт только через мостики «biznes uchun». Их сохраняем, но этот кластер — трафик и AI-пакет, а не сделки. Поэтому работы здесь дешёвые и привязаны к уже запланированным ревизиям.

---

## 1. Новые факты сверх отчёта TOP3_STRIKING

### 1.1 UZ-чат потерял языковую семью, и она не перешла на соседей [GSC]

| запрос | 14.09–04.10 (21 дн.), UZ-чат: показы / клики / поз. | 12–25.10 (14 дн.), UZ-чат | 12–25.10, кто показывается вместо |
|---|---|---|---|
| chatgpt kirish uzbek tilida | 3 559 / 33 / 5,5 | 175 / 0 / 5,7 | гайд по входу 2 055 / 0 / 8,0 |
| chatgpt uzbekcha | 1 261 / 24 / 4,5 | < 15 показов | RU-чат 184 / 1 / 7,0 |
| chatgpt uzbekcha bepul | 875 / 23 / 3,9 | < 15 | RU-чат 90 / 0 / 6,4 |
| chatgpt uzbek tilida online | 1 175 / 12 / 5,3 | < 15 | RU-чат 281 / 0 / 8,9 |
| chatgpt uzbek tilida gaplashish | 1 271 / 10 / 5,7 | 37 / 0 / 6,6 | promptlar 153 / 0 / 8,5 |
| chatgpt uzbekcha online | 657 / 6 / 5,6 | < 15 | RU-чат 180 / 1 / 6,1 |

По дням (`query contains "uzbekcha"`): у UZ-чата было 93–166 показов в день на поз. 3,4–4,5 (26.09–04.10). Дальше 58 (05.10), 43 (07.10), 109 (08.10), 41 (09.10), а с 10.10 — 1–5 в день. RU-чат всё это время получает 5–150 показов в день (обычно 30–150) на поз. 4,8–7,2 при CTR около 0 [GSC, `resultId 591dbf16…`]. То же видно в `docs/seo/research/2026-10-24-snippets-translator/snippet-data.md:99-104`: семья «uzbek» у UZ-чата 7 988 показов → 701.

**Что поменялось 05.10 на UZ-чате** (`docs/seo/CHANGE_LOG_2026-10.md:894`):
- H1 «ChatGPT o‘zbek tilida online» → «O‘zbek tilida AI chat — ChatGPT’ga bepul muqobil»; H1 теперь в первом экране чата.
- title → «ChatGPT uzbekcha muqobili: AI chat, bepul kirish», с 06.10 — «ChatGPT o‘zbek tilida? Muqobil AI chat, bepul kirish», с 24.10 — «ChatGPT uzbekcha muqobili — bepul kirish, ro‘yxatsiz chat».
- первый абзац «без перечня запросов», ключи «chatgpt uz» сняты.

Гипотеза (**UNVERIFIED**): Google перестал считать UZ-чат ответом на «ChatGPT + язык». Точная фраза «ChatGPT o‘zbek tilida» ушла из H1, слово «online» пропало из видимого текста (сейчас 0 вхождений), а «uzbek tilida» без апострофа не встречается ни разу. Title Т-Б с 06.10 фразу вернул, но семья не вернулась. Значит, один title её не держит. Что даст title от 24.10, станет видно к ≈22–25.11.

### 1.2 Где мы есть в живой выдаче 26.10 (три снимка)

| запрос | [SERP-R] mobile d30 | [SERP-M] mobile d20 | [SERP-D] desktop d20 | GSC P1 |
|---|---|---|---|---|
| chatgpt ilovasini yuklab olish | нет среди 22 | **№2** гайд по скачиванию (сниппет с датой «30-iyl, 2026») | — | 4,1 |
| chatgpt yuklab olish uzbek tilida | нет среди 22 | нет среди 14 | нет среди 18 | 2,6 |
| chatgpt uzbekcha | нет среди 22 | нет среди 14 | **№5 RU-чат**, title старый «Аналог ChatGPT онлайн бесплатно…» | 4,0 (UZ-чат) |
| chatgpt uzbekcha скачать (ru) | №5 UZ-чат | — | — | 6,0 (RU-чат) |
| chatgpt uz | №1 `/ru/blog/chat-gpt-online/` | №1 он же | — | 5,0 (RU-чат) |
| остальные 15 запросов кластера | нет | нет | нет | 4,5–9,1 |

Вывод: снимок одного краулера дёргается от вызова к вызову; в нескольких выдачах половину ТОП-10 занимают дорвеи и чужие локали chatgpt.com. **UNVERIFIED:** часть наших показов в GSC может приходиться на ссылки внутри AI Overview: блок есть во всех 20 выдачах, а все ссылки в AI Overview получают одну позицию — позицию самого блока. Состав блока API не отдаёт (`ai_overview: url null`), проверить нельзя. Поэтому решения по ТОП-3 принимаем по GSC, а снимки используем только для того, чтобы видеть, **кто** конкурирует.

### 1.3 Спрос [KM]

| запрос | объём/мес | сентябрь 2026 | год назад (окт. 2025) | вывод |
|---|---:|---:|---:|---|
| chatgpt kirish | 33 100 | 90 500 | 2 900 | растёт, пик к началу учёбы |
| chachipiti | 18 100 | 49 500 | 12 100 | большой, навигационный |
| chatgpt skachat | 12 100 | 5 400 | 27 100 | падает |
| chatgpt login | 9 900 | 8 100 | 12 100 | стабильно |
| jaji piti / chati piti | 6 600 / 6 600 | 14 800 / 14 800 | 5 400 / 2 900 | растут |
| chatgpt yuklab olish uzbek tilida | 6 600 | 12 100 | 1 600 | растёт |
| chatgpt uzbekcha | 4 400 | 2 400 | 5 400 (янв. 9 900) | падает |
| chatgpt yozish | 3 600 | 22 200 | 140 | новый, взрывной |
| chatgpt bepul kirish | 2 400 | 3 600 | 0 | новый |
| chatgpt uzbek tilida | 1 900 | 720 | 4 400 | падает в 6 раз |
| chatgpt ochish / yuklab olish | 1 900 / 1 900 | 6 600 / 6 600 | 1 000 / 1 000 | растут |
| chatgpt uzbekcha bepul / gaplashish / uz | 1 300 / 1 300 / 1 300 | 1 300 / 1 900 / 1 000 | 1 600 / 1 600 / 1 900 | ровно |
| chatgpt uzbekcha online / uzbek tilida online / jaji piti online | 1 000 / 880 / 880 | 1 600 / 1 600 / 2 400 | 480 / 480 / 110 | растут |
| chatgpt kirish uzbek tilida / ilovasini yuklab olish | 720 / 720 | 4 400 / 2 400 | 0 / 320 | растут |
| chatgpt ochish uzbek tilida | 480 | 880 | 90 | растёт |

Люди всё меньше пишут «uzbek tilida» и всё больше — «kirish», «yozish», «chachipiti». Поэтому возврат языковой семьи — это защита 5–8 тыс. запросов в месяц, а не главный рост. Главный рост — CTR на огромных навигационных запросах и «yozish».

---

## 2. Кто чем владеет: одна страница на запрос

Интенты: **чат** — «хочу писать прямо сейчас»; **вход** — «войти в свой аккаунт ChatGPT»; **скачать** — «поставить официальное приложение»; **справка** — «работает ли / что это».

| запрос | интент | страница-владелец | основание | каннибалы (P1 → 12–25.10) [GSC] | как развести |
|---|---|---|---|---|---|
| chatgpt kirish | вход (навигация) | та страница, куда ведёт Google: сейчас UZ-чат | C22 final, `content/seo/intent-manifest.json:748` | RU-чат 11 935 пок. (0,1 %), гайд по входу 6 246 (0,4 %) | ничего не тянуть: решение C22 окончательное. Голый анкор «ChatGPT kirish» запрещён тестом `tests/seo-anchor-intent.test.ts:200-204` |
| chatgpt kirish uzbek tilida | чат | UZ-чат | C22: этот запрос в mustNotTarget гайда | гайд по входу 3 060 → 2 055 пок., 0 кликов | W3-01: убрать с гайда узбекский раздел #uzbek, body[21..23] и faq[5]; брендовая ссылка «GPTBot.uz o‘zbekcha AI chati» → чат |
| chatgpt bepul kirish | чат | UZ-чат | C22 | почти нет (гайд 3 пок.) | ничего |
| chatgpt ochish | вход/скачать | гайд по скачиванию | C11 observedOwnerNote (принято 29.09) | гайд по входу 53 пок., UZ-чат 16 | R-S2 добавит точную фразу; анкоры «ochish» уже ведут на гайд |
| chatgpt ochish uzbek tilida | вход | гайд по входу | C22 informational | UZ-чат 137, гайд по скачиванию 5 | в W3-01 не удалять фразу «ochish … o‘zbek tilida» вместе с #uzbek: она нужна этому запросу |
| chatgpt yozish | чат | UZ-чат | C34 (запрос в mustNotTarget мануала) | RU-чат 1 111, гайд по входу 131, гайд по скачиванию 52, гид C6 7 | ничего не тянуть: доля UZ-чата 87 % |
| chatgpt yuklab olish (uzbek tilida), ilovasini yuklab olish, yuklash, skachat, o‘rnatish | скачать | гайд по скачиванию | C11 commercial | UZ-чат 2 239 пок. на 9,1 по «…uzbek tilida» | на UZ-чате оставить одну ссылку «ChatGPT’ni xavfsiz yuklash» (есть); нового «yuklab olish» на чат не добавлять |
| chatgpt uzbekcha скачать (ru) | скачать, читается как русский | гайд по скачиванию (по смыслу); фактически RU-чат | C11 note 06.10 | RU-чат 93 % показов | принять как есть; в R-S2 — FAQ с точной формой (уже есть FAQ «skachat (скачать)») |
| chatgpt uzbekcha, uzbekcha bepul, uzbekcha online, uzbek tilida, uzbek tilida online | чат | UZ-чат | C6, C22, C37, C39 | RU-чат забирает остаток (пара hreflang) | вернуть релевантность UZ-чату (раздел 4.1); RU-чат не менять под узбекские запросы (`snippet-data.md`, §6.3) |
| chatgpt uzbek tilida gaplashish | чат | UZ-чат | C22 family | promptlar 176 → 153 пок. (поз. 8,5) — сейчас главный | в манифесте: в mustNotTarget promptlar добавить «chatgpt uzbek tilida gaplashish»; на чате — лексика «gaplashish/suhbat/muloqot»; анкор с «gaplashish» → чат |
| chatgpt bepul (лат.) | чат | UZ-чат (есть H2 «ChatGPT bepul…») | C34 | RU-чат 3 546 пок. на 5,8, UZ-чат 73 | анкоры «ChatGPT bepul — o‘zbekcha muqobil» с незащищённых UZ-страниц; RU-чат не трогать |
| jaji piti, jaji piti online, jajipiti, chati piti, chaji piti, chachipiti | навигация (имя ChatGPT) / чат | UZ-чат, раздел #jaji-piti | C22 family; llms.txt | RU-чат 1 294 («jaji piti»), 747 («online»), 466 («chati piti») | ничего не тянуть, кроме «jaji piti online»: добавить «online» в #jaji-piti |
| chatgpt uz | навигация на чужой сайт chatgpt.uz | никто сознательно | ключ снят с чатов в R-S1 | RU-чат 387, UZ-чат 319, CGO-блог 40 (но №1 в снимках) | не целиться. Перед W3-02 (301 CGO → RU-чат) снять GSC CGO по «chatgpt uz»; если он даёт клики, записать это как ожидаемую потерю |

Гид `/uz/gpt-uzbek-tilida-ai-chat/` (C6, не защищён) в этом кластере почти не мешает: 7 показов «chatgpt yozish» на 10,1, 2 показа «chat gpt uzbek tilida». Трогать его ради кластера не нужно. Открытый вопрос C6: 8 ссылок с анкором «GPT o‘zbek tilida» ведут на чат, хотя это primaryKeyword гида. Его решать отдельно, не в этом кластере.

---

## 3. Главная таблица: запрос → владелец → позиция → разрывы → действия → самая ранняя дата

Позиция: P1 [GSC] / 12–25.10 [GSC]. «ТОП-3?» — можно ли туда встать честно, по составу выдачи [SERP-R/M/D].

| # | запрос, объём [KM] | владелец | позиция P1 / 12–25.10; CTR | ТОП-3 сейчас | ТОП-3? | разрывы (главное) | действия: контент / title / ссылки / медиа | самая ранняя дата |
|---|---|---|---|---|---|---|---|---|
| 1 | chatgpt yuklab olish uzbek tilida, 6 600 | гайд по скачиванию [P] | **2,6 / 2,6**; 3,7 % / 3,4 % | t-j.ru, Google Play, chatgpt.com/tr-TR/download | **держать, цель 1–2** | 0 скриншотов (у t-j.ru ~7, у Play 24); нет раздела «регистрация после установки» (есть у t-j.ru); нет видео при блоке видео в выдаче; в сниппете дата публикации «30-iyl, 2026», а не правки | контент: H2 о регистрации, таблица данных магазинов с датой проверки, H3 об APK-клонах. Title/H1/description **не трогать** (правило отката C11, `intent-manifest.json:499`). Медиа: 4–6 скриншотов с телефона, ролик 60–90 с + VideoObject. Обновить dateModified и видимую дату | **16.11 (R-S2)**; скриншоты и ролик — снять сейчас |
| 2 | chatgpt ilovasini yuklab olish, 720 | гайд по скачиванию [P] | **4,1 / 4,3**; 2,5 % / 2,1 % | softonic, pikabu, help.openai.com ([SERP-M]: chatgpt.com/ru-RU/download, **мы №2**, uptodown) | **да** | у pikabu ~1 700 слов, разделы APK / Samsung / вход; у softonic видео и 5 скриншотов; FAQ help.openai ~20 вопросов против наших 10 | то же, что в № 1, плюс 3–4 FAQ (требования к ОС, Samsung, Windows через Microsoft Store, «ilova inglizcha — o‘zbekcha qilsa bo‘ladimi») | **16.11** |
| 3 | chatgpt yuklab olish, 1 900 | гайд по скачиванию [P] | 7,6 / 7,9; 1,2 % / 1,1 % | Google Play, help.openai, Microsoft Store | нет (весь ТОП-10 официальный + uptodown) | то же | R-S2; цель — первая неофициальная строка, поз. ≤5 | 16.11 |
| 4 | chatgpt ochish, 1 900 | гайд по скачиванию [P] | 5,4 / 6,2; 0,5 % / 0,3 % | блок приложений, Google Play, chatgpt.com/atlas, open_in_desktop | нет | точной фразы «ChatGPT ochish» в заголовках нет (BACKLOG W2-02) | R-S2: H2 «ChatGPT ochish: telefonda, kompyuterda va brauzerda», FAQ «ochish / tortish / yuklash» | 16.11 |
| 5 | chatgpt kirish uzbek tilida, 720 (сент. 4 400) | **UZ-чат** [P] (сейчас его держит гайд по входу) | UZ-чат 4,9 / 5,7; гайд 8,1 / **8,0, 0 кликов** | Instagram /popular, chatgpt.com/mn, YouTube Shorts; дальше бенгальские видео и дорвеи | **да** | в H1 чата нет «ChatGPT … o‘zbek tilida»; гайд перетягивает запрос разделом #uzbek; у Instagram и YouTube видео, у нас нет | **гайд (W3-01):** убрать #uzbek, брендовая ссылка на чат, title «ChatGPT kirish (login): Google, telefon, kod kelmasa (2026)». **Чат:** H1 с точной честной фразой (решение владельца, §6), строка написаний в #jaji-piti. Ссылки: 3–4 анкора «ChatGPT o‘zbek tilida — mustaqil AI chat» с незащищённых UZ-страниц | **≈21–25.11** (после чтения UZ-чата и правки 23.10 ≈20.11) |
| 6 | chatgpt uzbekcha, 4 400 | UZ-чат [P] | 4,0 / **выпал** (< 15 пок.); RU-чат 7,0 | моб.: YouTube, chatgpt.uz/ai, chatgpt.com/kk; деск.: chatgpt.com, chatgpt.uz, textie.ai, … **RU-чат №5** | **да** (до 05.10 — 4,1–4,5) | у textie.ai 13 FAQ, 3 шага, отзывы, «suhbat» 33 раза, «muloqot» 10; у chatgpt.uz домен с точным совпадением и самоназвание «rasmiy sayti» (не копировать); у нас в H1 нет пары «ChatGPT + uzbekcha / o‘zbek tilida», нет видео | title 24.10 уже содержит «ChatGPT uzbekcha»: сначала прочитать окно. Чат: H1 (§6), H2 о разговоре (№ 9), ролик 30–60 с под чатом. Ссылки: 6–8 анкоров с честным «ChatGPT uzbekcha muqobil» | **≈21–25.11** |
| 7 | chatgpt uzbekcha bepul, 1 300 | UZ-чат [P] | **3,5** / выпал; RU-чат 6,4 | YouTube ×2, chatgpt.com/kk, YouTube, Instagram (деск. не снимался) | **да** | то же; «bepul» без условий у конкурентов — у нас честно «3 ta bepul javob» | в блоке условий одна фраза «ChatGPT uzbekcha bepul: ro‘yxatsiz 3 ta sinov javobi» | ≈21–25.11 |
| 8 | chatgpt uzbek tilida online 880; chatgpt uzbekcha online 1 000 | UZ-чат [P] | 4,4 и 5,0 / выпал; RU-чат 8,9 и 6,1 | 7 из 8 и 7 из 10 строк — дорвеи (.cyou, .click, .pw…), chatgpt.com | **да** | в видимом тексте чата слова «online» нет совсем (0 вхождений; heroTitle «… online» в статичный HTML не попадает) | «online» в первом абзаце или в подписи под H1: «O‘zbek tilida AI chat online — brauzerda, ilovasiz» | ≈21–25.11 |
| 9 | chatgpt uzbek tilida gaplashish, 1 300 | UZ-чат [P] | 5,1 / 6,6 (37 пок.); promptlar 8,6 / 8,5 (153) | моб.: uzbekdevs.uz/wiki (~900 слов, без даты и FAQ [WF]), texnoman.uz, видео Facebook; раньше chatgpt.uz, textie.ai | **да** | «gaplash» 1 раз, «muloqot» 0, «suhbat» 10 (у textie 33/10); нет честного ответа про голос: «gaplashish» часто значит голосовой разговор, а наш чат только текстовый | H2 «O‘zbek tilida AI bilan gaplashish: yozma suhbat» — 3–4 абзаца: у нас текст, голос — в официальном приложении ChatGPT (ссылка на гайд по скачиванию). Манифест: «chatgpt uzbek tilida gaplashish» → mustNotTarget promptlar. Анкор «o‘zbekcha AI bilan gaplashish» → чат | ≈21–25.11 |
| 10 | chatgpt yozish, 3 600 (сент. 22 200) | UZ-чат [P] | 7,1 / 7,0; 0,4 % / 0,3 % | неполная выдача (3 органические строки во всех снимках): справка OpenAI на сомали, chatgpt.com/g на амхарском, хинди-видео; блоки AI Overview, видео, картинки | **возможно** (ТОП-3 нерелевантен по языку), **UNVERIFIED** | H2 «ChatGPT’ga qanday yozish mumkin?» есть, но на странице 0 картинок при блоке картинок в выдаче; нет видео | 2–3 скриншота или GIF «как написать в чат» с alt по-узбекски; ролик 30–60 с; FAQ «ChatGPT’ga qanday yozaman?» с ответом в первой фразе | ≈21–25.11; снять материал сейчас |
| 11 | chatgpt bepul (лат.), 1 300 (сент. 4 400) | UZ-чат [P] | UZ-чат 5,7 (73 пок.); **RU-чат 5,8 (3 546)** / 6,2 (1 802) | chatgpt.com/ru-RU, **salom-ai.uz** (~300 слов, Article с датой), chat.openai.com | возможно (место №2 у слабой статьи) | показы уходят русской странице; у salom-ai дата в сниппете и тип Article | ссылки: 2–3 анкора «ChatGPT bepul — o‘zbekcha muqobil» на UZ-чат; на чате H2 уже есть | анкоры — ≥25.11 |
| 12 | jaji piti online, 880 | UZ-чат [P] | 4,5 / 5,0; RU-чат 4,8 | [SERP-M]: битый chat.openai.com, чужое приложение в Play, chatgpt.com/12, freegpt.ai | **да** | «online» на странице 0 раз | в #jaji-piti: «“jaji piti online” deb qidirsangiz…» — честная строка о том, где писать онлайн | ≈21–25.11 |
| 13 | chatgpt bepul kirish, 2 400 | UZ-чат [P] | 6,2 / 7,1; 0,8 % / 0,3 % | chatgpt.com ×2–3, YouTube 2023 («How To Login ChatGPT») | почти нет (оспорим только слот YouTube) | у нас нет видео | свой ролик «ChatGPT’ga bepul kirish: 2 yo‘l» на YouTube | ролик — сейчас; на странице ничего |
| 14 | chatgpt kirish, 33 100 (сент. 90 500) | UZ-чат по факту [P] | 7,2 / 7,3; 0,39 % / 0,42 % | только chatgpt.com / chat.openai.com во всех снимках, YouTube на 4–10 | **нет** | навигация в чужой аккаунт; ответить на неё мы не можем | страницу не трогать (C22 final + окно). Цель — CTR ≥0,5 % своих показов. Вне сайта: ролик «ChatGPT’ga kirish (O‘zbekistondan)» — YouTube держит №4 [SERP-R] | ролик — сейчас |
| 15 | jaji piti 6 600; chati piti 6 600 | UZ-чат [P] | 5,0 / 5,0 (CTR 0,3–0,4 %); chati piti 7,1 / 6,1 (CTR 2,0 %) | openai.com, chatgpt.com, chatgpt.uz / chatgpt.com ×2, chat.openai.com | **нет** | барьер — официальность и бренд, не контент | только сниппет (решится чтением окна 24.10) | — |
| 16 | chachipiti, 18 100 (сент. 49 500) | UZ-чат, #jaji-piti | показов почти нет (лучшие строки: «chachipiti oʻzbek tilida» 181 пок. на 6,3; «chachipiti online» 81 у RU-чата) | openai.com, chatgpt.com ×2; неофициальные только на 12–14 (chatx.ai, rutalkai, deepai) | **нет** | — | не гнаться; слово уже есть в H2 #jaji-piti | — |
| 17 | chatgpt ochish uzbek tilida, 480 | гайд по входу [P] | 7,4 / 6,6 | (не снимался) | возможно | — | в W3-01 оставить фразу; на чат не тянуть | ≈21–25.11 |
| 18 | chatgpt uzbekcha скачать (ru), 720 | гайд по скачиванию (по смыслу); фактически RU-чат [P] | RU-чат 6,0 / 6,0 | qna.habr, otvet.mail.ru, Google Play; **UZ-чат №5** [SERP-R] | возможно, но не нашей узбекской страницей | — | ничего сверх R-S2 (FAQ «skachat (скачать)» уже есть) | 16.11 |
| 19 | chatgpt uz, 1 300 | никто (навигация на chatgpt.uz) | RU-чат 5,0, UZ-чат 6,1, CGO 7,0 | **мы №1 (CGO)** в двух снимках, chatgpt.com, Instagram | уже есть, но не наша цель | — | перед W3-02 зафиксировать GSC CGO по запросу; 301 не отменять | ≈21–25.11 (проверка) |

[P] — страница из `PROTECTED_PATHS` (`scripts/seo-protection.ts:210-219`).

---

## 4. Страницы-владельцы против ТОП-3: что у них есть, а у нас нет

### 4.1 UZ-чат `/uz/gpt-uzbek-tilida/` (защищён)

Сравнение с неофициальными страницами из ТОП-3: chatgpt.uz и chatgpt.uz/ai [отчёт §6], textie.ai/uz/chat-gpt [WF], uzbekdevs.uz/wiki/chatgpt [WF], Instagram /popular и YouTube.

| измерение | у нас (живой HTML 26.10 + `content/pages/uz/gpt-uzbek-tilida.json`) | у конкурентов | разрыв и действие |
|---|---|---|---|
| title против запроса | «ChatGPT uzbekcha muqobili — bepul kirish, ro‘yxatsiz chat» (57) `:36` | chatgpt.uz: «ChatGPT Uzbek tilida - chatgpt.uz saytiga online va bepul kirish»; textie: «O'zbek tilida Chat GPT: Chat, Yozish va Yordam olish» | title уже с «ChatGPT uzbekcha» с 24.10, сейчас его меряют. Если к ≈22.11 CTR < 0,55 % или кликов < 12 в день — вернуться к форме P1–P2 «ChatGPT o‘zbek tilida (uzbekcha) — …» (тогда CTR в Узбекистане был 0,72–0,95 %, `snippet-data.md`, §4) |
| description | «…Ro‘yxatsiz 3 ta bepul sinov javobi, keyin AI paket… OpenAI emas» (155) | chatgpt.uz обещает «bepul» и «rasmiy» | честно и с числом — оставить |
| H1 | «O‘zbek tilida AI chat — ChatGPT’ga bepul muqobil» `:35` | textie: «O'zbek ChatGPT: sizning tilingizda…»; uzbekdevs: «ChatGPT» | **главный разрыв:** пары «ChatGPT + o‘zbek tilida» в H1 нет с 05.10. Вариант: «ChatGPT o‘zbek tilida? Mustaqil o‘zbekcha AI chat» — решение владельца (§6) |
| первый экран | H1, поле чата (рендерит JS; до него «AI-chat yuklanmoqda…»), дата «Yangilangan: 23.10.2026», абзац «…3 ta bepul sinov javobi… OpenAI’ning ChatGPT xizmati emas» | textie: макет поля ввода, CTA «bepul sinab ko‘ring», но нужна регистрация; chatgpt.uz: только интерфейс чата | наш сильнее: настоящее поле и честные условия. Добавить слово «online» и одну строку «gaplashing / yozing» |
| заголовки | 16 H2: 3 qadam, kirish, yozish, jaji piti, shartlari, bepul, interfeys tili, xato, maxfiylik, vazifalar, promptlar, farqi, aniqroq, talaba, biznes | textie: 11 H2 + 29 H3 (что это, что умеет, отрасли, интеграции, сравнение, FAQ) | не хватает H2 о разговоре («gaplashish / suhbat / muloqot») и ответа про голос |
| глубина | ≈1 920 слов тела + ≈450 в 13 FAQ [отчёт] | textie ~2 670; chatgpt.uz ~0 (только JS); uzbekdevs ~900 | хватает; рост не нужен |
| ответ в первой фразе | есть («Savolingizni … yozing … 3 ta bepul…») | — | ok |
| шаги и скриншоты | 3 шага текстом, 0 картинок (единственный `<img>` — пиксель Метрики) | textie: 3 шага; Instagram и YouTube — видео | 2–3 скриншота или GIF «как написать», alt по-узбекски |
| FAQ | 13 видимых + FAQPage | textie 13; chatgpt.uz 0 | ok; добавить «ChatGPT’ga qanday yozaman?» и «Ovozli gaplashsa bo‘ladimi?» |
| свежесть | «Yangilangan: 23.10.2026», WebPage dateModified 2026-10-23 | ни у textie, ни у uzbekdevs видимой даты нет | преимущество; держать честным |
| schema | WebPage, FAQPage, SoftwareApplication, Person, BreadcrumbList (Google видит «Unnamed item» [INSP 26.10]) | — | имя крошки — в той же ревизии (у незащищённых страниц уже исправлено, W1-14) |
| медиа | 0 картинок, 0 видео | Instagram, YouTube ×2–5 в ТОП-10; блоки видео и картинок в выдаче | ролик 30–60 с под чатом + VideoObject; в первую очередь — свой YouTube |
| E-E-A-T | дисклеймер «mustaqil servis, OpenAI emas» ×4; автора на странице не видно (Person только в JSON-LD) | textie: «отзывы» с англоязычными именами; chatgpt.uz называет себя «rasmiy» | строка «Tayyorlagan: Boris Gerasimov · tekshirilgan 23.10.2026» под FAQ; отзывы — только настоящие (`NEXT_RELEASES.md`, решения владельца, п. 5) |
| ссылки внутрь | 52 страницы; анкоры «o‘zbek tilidagi AI chat» ×26, «O‘zbek tilida AI chat» ×19, «GPTBot.uz AI chati» ×10 [REPO, подсчёт по content/] | — | ни одного анкора с «ChatGPT uzbekcha / o‘zbek tilida»; после окна сменить 6–8 анкоров на честные формы с «ChatGPT … muqobil» (правило N3 — один анкор на страницу) |
| ссылки наружу | 22: гайды по входу и скачиванию, promptlar, B2B | — | ok; мостик «biznes uchun» и CTA «AI-bot narxlari» оставить (деньги) |

### 4.2 Гайд по скачиванию `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` (защищён, R-S2 16.11)

| измерение | у нас | ТОП-3 и соседи | действие в R-S2 |
|---|---|---|---|
| title / H1 / description | «ChatGPT yuklab olish o‘zbek tilida — 3 usul (2026)» / «ChatGPT yuklab olish: telefon va kompyuterga xavfsiz o‘rnatish» | t-j.ru «Как скачать ChatGPT на Android… 2026»; Play — название приложения | **не трогать** (правило отката C11 и BACKLOG W2-02) |
| первый экран | автор, даты, «Qisqa javob…», ссылки на Play, App Store и download; B2B-строка ×2 | Play: кнопка установки | ok; одну из двух B2B-строк можно убрать вниз, если она мешает ответу (решение владельца) |
| глубина | ≈820 слов + 10 FAQ | pikabu ~1 700, help.openai ~1 000 и ~20 вопросов | +300–500 слов: регистрация после установки, Samsung, Microsoft Store, требования к ОС, версия и дата проверки |
| скриншоты | 0 (одна обложка) | Play 24, t-j.ru ~7, skillbox 18 | 4–6 настоящих скриншотов (условие R-S2 — снять с реального устройства) |
| видео | 0 | блок видео в выдаче; softonic со встроенным роликом | ролик 60–90 с «Rasmiy ChatGPT ilovasini o‘rnatish» + VideoObject |
| свежесть | dateModified 2026-09-30, но Google показывает дату публикации «30-iyl, 2026» [SERP-M] | t-j.ru 18.01.26, skillbox 16.04.26 | новая дата правки в видимой строке и JSON-LD; таблица «tekshirildi: <дата>» |
| FAQ | 10 | help.openai ~20 | +4: ОС, Samsung, Windows, «ilova tili» |
| безопасность | список признаков фейка, APK как риск | pikabu объясняет установку APK | H3 «APK-klonlar: qanday aniqlash» (как в плане), без инструкции ставить APK |
| ссылки внутрь | 10 страниц, «ChatGPT yuklab olish» ×4, «ChatGPTni xavfsiz yuklash» ×4 | — | ok |

### 4.3 Гайд по входу `/uz/blog/chatgptga-qanday-kirish-mumkin/` (защищён, W3-01 ≈21–25.11)

| измерение | у нас | выдача | действие |
|---|---|---|---|
| title / H1 | «ChatGPT kirish (login): chatgpt.com, 3 qadam (2026)» / «ChatGPT kirish va ochish: chatgpt.com, ro‘yxatdan o‘tish va xatolar» | официальные страницы входа + YouTube «How to login» | W3-01: title «ChatGPT kirish (login): Google, telefon, kod kelmasa (2026)» и description L1-02 |
| интент | смешан: вход + раздел «o‘zbek tilida ishlatish» (#uzbek) | — | убрать #uzbek (body[21..23], faq[5]) — так запрос «kirish uzbek tilida» уйдёт к чату; фразу «chatgpt ochish uzbek tilida» сохранить в шагах |
| шаги и скриншоты | 3 шага текстом, 1 иллюстрация, 0 скриншотов | YouTube показывает экран входа | 3–4 скриншота chatgpt.com: Log in / Sign up / Continue with Google / телефон |
| E-E-A-T | автор, 8 первичных источников OpenAI с датами проверки (`content/blog/uz/chatgptga-qanday-kirish-mumkin.json:453-499`) | — | сильная сторона, сохранить |
| медиа | 0 видео | 4 YouTube в ТОП-10 «chatgpt kirish» | ролик «ChatGPT’ga kirish: 3 qadam» на YouTube и встроить сюда |

### 4.4 Остальные три страницы

- **promptlar** `/uz/blog/chatgpt-uzbek-tilida-promptlar/` [P]: по «gaplashish» и «uzbek tilida» её показывают чаще, чем чат. В R-S1b (≈08.11) уже идёт ссылка promptlar → ariza. Анкор «o‘zbekcha AI bilan gaplashish» → чат добавлять **после** чтения окна UZ-чата (≈21–25.11), вместе с W3-04. Автор «GPTBot Team» — заменить на настоящего автора в той же ревизии.
- **VPN-статья** `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/` [P]: в кластере почти не участвует (6 показов «chatgpt kirish»). Последний обход — 10.10 [INSP]. Ничего не делать.
- **гид C6** `/uz/gpt-uzbek-tilida-ai-chat/` (не защищён): каннибализации нет (7 + 2 показа). Ничего не делать в рамках кластера.

---

## 5. Календарь: что и когда можно

Окна замера, которые нельзя ломать:
- сниппеты чатов от 24.10: UZ-чат переобойдён 25.10 20:56 UTC [INSP]; проверка отката ≈07–10.11, итог ≈21–25.11 (`docs/seo/CHANGE_LOG_2026-10.md:239-260`, `NEXT_RELEASES.md:7`);
- П-CTR R-S1 для гайда по входу и promptlar: ≈05–07.11;
- П-CTR гайда по скачиванию: ≈06–10.11;
- правка 23.10 гайда по входу и тела UZ-чата: ≈20.11 (BACKLOG §3).

| когда | что | страницы | условие |
|---|---|---|---|
| **сейчас – 06.11** | 1) снять на реальном телефоне 4–6 скриншотов установки (Android, iPhone, Windows/Microsoft Store) и 3–4 скриншота входа на chatgpt.com; 2) записать 3–4 коротких узбекских ролика: «ChatGPT’ga kirish», «ChatGPT yuklab olish», «O‘zbek tilida AI chatga yozish», «Jaji piti nima» — на YouTube, ссылки на гайды; 3) раз в неделю ручная проверка выдачи с телефона в Ташкенте (инкогнито, 10 запросов из §3) — записывать в журнал; 4) черновики ревизий R-S2, W3-01 и UZ-чата | ни одна страница не меняется | — |
| ≈07–10.11 | проверка отката сниппетов чатов (UZ: откат, если CTR < 0,318 % и кликов в день < 10,2) | UZ-чат | GSC, только UZB |
| ≈08.11 | R-S1b, как запланировано; в этом кластере ничего нового | promptlar и др. | П-CTR прочитан |
| **16.11** | **R-S2 гайда по скачиванию** + пункты §4.2 (скриншоты, ролик, регистрация, таблица магазинов с датой, H2 «ChatGPT ochish», +4 FAQ, APK-клоны, новая дата) | гайд по скачиванию | П-CTR прочитан; title/H1/description не трогать |
| **≈21–25.11** | **W3-01** + §4.3 (скриншоты входа); **ревизия UZ-чата** (одна, вместе с денежными правками из `docs/monetization/2026-10-25-tariffs-roadmap/ROADMAP.md:306`): H1 по решению §6, «online», H2 о разговоре, строка написаний в #jaji-piti, «uzbekcha bepul», 2–3 скриншота, ролик + VideoObject, имя хлебной крошки, видимый автор; манифест: «chatgpt uzbek tilida gaplashish» → mustNotTarget promptlar; W3-02 с проверкой «chatgpt uz» | UZ-чат, гайд по входу, CGO | 28-дневное окно UZ-чата прочитано; откат не понадобился |
| ≈25.11 – 05.12 | волна анкоров: 6–8 из 52 ссылок на UZ-чат — на честные формы с «ChatGPT uzbekcha / o‘zbek tilida … muqobil», 2–3 — «ChatGPT bepul — o‘zbekcha muqobil», 1–2 — «o‘zbekcha AI bilan gaplashish». Не больше одного анкора на страницу; тест `seo-anchor-intent` | незащищённые UZ-страницы | после выката ревизии UZ-чата (чтобы не смешать два эффекта в один день) |
| ≈20–25.12 | первое чтение 28 дней после ревизий 21–25.11: позиции №5–12 из §3 | — | — |
| до 15.01.2027 | всё, что дало рост, — в индексе до сезонного пика (январь–апрель по [KM]) | — | — |

Ожидание (**UNVERIFIED**, грубо). Если вернуть семью «uzbekcha / uzbek tilida / online / gaplashish / kirish uzbek tilida» на поз. 3–5 с CTR 1–2,5 %, как было до 05.10, выйдет примерно +80…+150 кликов за 28 дней. До 05.10 эти запросы давали ≈110 кликов за 21 день. R-S2 по плану даёт ≈10–30 кликов, W3-01 — ≈12–30 (`NEXT_RELEASES.md`). Видео на YouTube в эту оценку не входит: его эффект не измерить через GSC сайта.

---

## 6. Решения владельца

1. **H1 UZ-чата.** Вернуть пару «ChatGPT + o‘zbek tilida» честной формулировкой, например «ChatGPT o‘zbek tilida? Mustaqil o‘zbekcha AI chat» (рядом остаётся дисклеймер «OpenAI emas»). Или оставить «muqobil» и принять потерю семьи. Данные: до 05.10 семья давала ≈110 кликов за 21 день, после — около 0. Это корреляция: в тот же день менялись title и текст.
2. **Видео и скриншоты:** кто снимает и когда. Для R-S2 скриншоты обязательны к 16.11 (условие в `NEXT_RELEASES.md:9`). В `docs/seo/research/2026-10-25-roadmap-1000/ROADMAP.md:213` на 4 скринкаста заложено 8–12 часов.
3. **YouTube-канал GPTBot.uz** — да или нет. Это единственный способ занять неофициальные места в ТОП-3 «chatgpt kirish», «chatgpt bepul kirish», «chatgpt uzbekcha», где стоят YouTube и Instagram.
4. **Принять, что «chatgpt kirish», «jaji piti», «chati piti», «chachipiti» в ТОП-3 не встанут:** первые места там у официальных сайтов. Мерило для них — CTR своих показов.
5. **B2B-строки на гайде по скачиванию** (сейчас две подряд в первом экране) — оставить обе или одну перенести ниже ответа.

---

## 7. Как мерить ТОП-3

- Основное мерило: GSC, только Узбекистан, mobile, query×page, 28 дней; цель — позиция ≤ 3,0 **на странице-владельце**, и у неё ≥ 80 % показов запроса.
- Дополнительно: клики в день и CTR по каждой строке §3; для навигационных запросов (№ 13–16) — только CTR.
- Снимки выдачи — раз в неделю вручную с телефона в Ташкенте. Платный снимок — только чтобы узнать, кто конкурент, а не какая у нас позиция.
- Даты выката и переобхода (URL Inspection) каждой ревизии записывать в `docs/seo/CHANGE_LOG_2026-10.md` / `-11.md`.

---

## 8. Источники, расходы, ограничения

- GSC (бесплатно): query×page UZB 12–25.10 (`resultId a35b08f0…`); query UZ-чата 12–25.10 (`2f143d4f…`) и 14.09–04.10 (`b0ea59f0…`); date×page «uzbekcha» 26.09–25.10 (`591dbf16…`); query×page «piti» P1 (`eda1ef05…`). inspect_urls для 3 URL (26.10).
- Платные: `get_serp_results` — 3 вызова, 20 ключевых слов (лимит 4 вызова); `get_keyword_metrics` — 1 вызов, 50 ключей, 46 с данными (лимит 2). Без данных: «chatgpt google orqali kirish», «chatgpt rasmiy sayti», «chatgpt kompyuterga yuklab olish», «chatgpt telefonga yuklab olish».
- WebFetch: uzbekdevs.uz/wiki/chatgpt, textie.ai/uz/chat-gpt. curl живого HTML трёх страниц-владельцев и гида C6 (26.10).
- Репозиторий: `scripts/seo-protection.ts:210-219`; `content/pages/uz/gpt-uzbek-tilida.json:7,35-37`; `content/seo/intent-manifest.json:476,499,640,748,779`; `docs/seo/CHANGE_LOG_2026-10.md:239-260,894`; `docs/seo/research/2026-10-24-growth-audit/NEXT_RELEASES.md:7-12`, `BACKLOG.md` §3, W2-02, W3-01; `docs/seo/research/2026-10-24-snippets-translator/snippet-data.md:99-104`; `tests/seo-anchor-intent.test.ts:200-204`; `docs/monetization/2026-10-25-tariffs-roadmap/ROADMAP.md:147,306,350`; git-история `content/pages/uz/gpt-uzbek-tilida.json` (`98f8eb8b` → `533eed03`).
- Ограничения: последние 3 дня GSC неполные. Строки ниже 15 показов GSC не отдаёт, поэтому «выпал» значит «< 15 показов за 14 дней». Состав AI Overview недоступен. Объёмы для узбекских запросов — из Google Ads с `languageCode ru`, KD и интента нет.
