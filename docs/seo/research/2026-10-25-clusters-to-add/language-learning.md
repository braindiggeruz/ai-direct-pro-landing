# Линза «Изучение языков»: какие кластеры добавить на gptbot.uz

Дата: 2026-10-25. Рынок: Google, Узбекистан (location 2860). Машиночитаемая версия: `language-learning.json`. Расчёт: `language-learning-data/ll_clusters.py` → `build_outputs.py` (`py -3 -I`). Сырые данные: `language-learning-data/ll_kw_metrics.json`, `ll_kw_metrics2.json`, таблицы `ll_table.txt`, `ll_table2.txt`.

## 0. Коротко

1. **Языковая тема — большой пласт спроса, но 1 000–2 000 визитов в день одна не даёт.** 12 кластеров ниже — это ≈365 155 запросов в месяц после дедупликации и весов. На позиции ~6 это ≈111–201 визитов в день, в топ-3 — ≈385 (с AIO-дисконтом; без него ≈655). Прошлая оценка всех AI-кластеров в топ-3 — ≈650–1 100 визитов в день, так что эта линза поднимает потолок ещё на ≈35–60%.
2. **Быстрее всего окупятся три инструмента на слабой выдаче:** таблица-тренажёр неправильных глаголов (24 тыс./мес; по UZ-запросу в топе Scribd ×4), калькулятор IELTS + Multilevel/CEFR (≈20 тыс.; для Multilevel калькулятора в выдаче нет вообще) и узбекский алфавит для русскоязычных (≈10 тыс.; конкуренты — новость, LiveJournal 2013 и Pinterest). Каждый — S по трудозатратам, первый трафик через 4–8 недель.
3. **Самый большой объём — грамматика английского:** времена (≈60 тыс.) и темы грамматики (≈52 тыс.). По «present simple» (12 100) в топе YouTube, слайдшер и пинтерест, текстовой страницы на узбекском нет. Но это статьи, разгон 8–16 недель, и AIO стоит на 1-м месте.
4. **Самая слабая выдача — Multilevel mock test:** Studocu #1, YouTube, затем шесть документов Scribd подряд. Оригинальные задания Speaking/Writing с AI-разбором в чате — прямое попадание в продукт. Listening не обслуживаем (нужно аудио), в спрос он не включён.
5. **Предупреждение о данных.** У многих UZ-латинских запросов ряд Google Ads вырос в 5–10 раз с конца 2025 года: «ingliz tili test» 1 900 → 22 200, «turkcha so‘zlar» 70 → 18 100, «yapon tilini o‘rganish» 90 → 27 100 (а у L3-ключа «imlo lug‘ati» 6 600 → 22 200). Это либо реальный рост, либо смена того, как Google Ads собирает узбекские запросы в корзины. Я везде беру среднее за 12 месяцев: если рост реален, текущий спрос кластеров 6 и 8 в 1,2–1,7 раза выше моей оценки; если это артефакт, честная нижняя граница — уровень осени 2025, в 3–6 раз ниже.
6. **Пересечение с параллельной линзой `education-practice.md`.** Грамматика, времена, тест уровня и IELTS/Multilevel writing там тоже посчитаны — при сложении линз их нельзя суммировать дважды. Без пересечений эта линза приносит кластеры 3, 7, 8, 10, 11: ≈144 855 запросов в месяц, ≈44–80 визитов в день на поз. ~6 и ≈155 в топ-3. Плюс Speaking/Reading-часть Multilevel и IELTS/Multilevel-калькулятор, которых у соседей нет.

## 1. Метод

- **Спрос:** Google Ads через OpenSEO, `search_volume` = среднее за 12 мес. (2025-10…2026-09). Новые замеры: `get_keyword_metrics` ×2 (419 + 284 ключа), `research_keywords` ×1 (сиды «ingliz tili», «английский язык»; по UZ вернулось 26 строк, по RU 216 — почти всё ≤50). Повторно использованы без покупки: `ingliz tili test`, `ingliz tili grammatika`, `inglizcha so‘zlar`, `ingliz tili mashqlar` из `2026-10-24-growth-audit/l3-data/kw1/kw2_metrics.json`.
- **Дедупликация:** одинаковый объём + одинаковый немонотонный ряд (объём ≥100) = одна корзина (так слились, например, «irregular verbs list» = «list of irregular verbs», «reported speech» = «indirect speech», «eps topik» = «eps-topik», «grammar checker» = «grammar check», «question tags» = «tag questions»). Строки `research_keywords` без ряда сливаются при равном объёме и письме («уровни английского языка» = «уровни английский язык»).
- **Веса:** 0,5 для частично навигационных или неоднозначных голов («pronouns», «grammar», «ielts score», «cefr», «multilevel», «topik», «eps topik», «vocabulary», «hafta kunlari», «как будет на узбекском» и т. п.), 0 для запросов, которые продукт не обслуживает (Listening). Совсем исключены: «milliy sertifikat» 18 100 (навигация к результатам uzbmb), «ielts» 27 100, «articles» 4 400 (неоднозначно), «alphabet» 3 600, словари RU↔UZ и «X o‘zbekcha lug‘at» (владеет ветка переводчика), школьные «rus tili 5/7 sinf» (ищут учебник/ответы).
- **Визиты в день** = спрос × CTR / 30 × 1,5. CTR из кривой сайта: поз. ~6 — 0,61–1,10% (без доп. дисконта, как в `demand-sizing`); поз. ~3 — 3,59% × 0,533 (AIO на 1-м месте) или × 0,655 (AIO ниже или выдача не снята).
- **Разгон:** новые страницы берут ≈4% прогноза в 1-й месяц (K≈0,04). «Первый заметный трафик» ниже = ≈25% от прогноза поз. ~6. Инструменты на слабой выдаче разгоняются быстрее статей.
- **SERP:** 4 вызова `get_serp_results` (16 запросов, hl=ru, desktop, depth 10), таблица — §3.

## 2. Кластеры по приоритету

| # | Кластер | Спрос/мес (дедуп) | Выдача | Тип | Усилия | Риск честности | Визитов/день поз. ~6 | поз. ~3 | Разгон, нед. |
|---:|---|---:|---|---|---|---|---:|---:|---|
| 1 | Ingliz tili zamonlari: Present/Past/Future + mashqlar | 59 600 | weak | a+b+c | M | low | 18,2–32,8 | 57,1 | 8–14 |
| 2 | Noto‘g‘ri fe’llar / irregular verbs / неправильные глаголы | 24 260 | weak | a+c | S | low | 7,4–13,3 | 23,2 | 4–8 |
| 3 | Alifbolar: ingliz, rus, arab, koreys, yapon (+transkripsiya, kartochkalar) | 47 360 | mixed | a+c | M | low | 14,4–26,0 | 45,3 | 6–10 |
| 4 | IELTS / CEFR (Multilevel) ball kalkulyatori | 19 640 | mixed | a | S | low | 6,0–10,8 | 23,1 | 4–8 |
| 5 | Multilevel / CEFR: mock-test (speaking, writing, reading) + gid | 22 170 | weak | a+b+c | M | medium | 6,8–12,2 | 26,1 | 6–10 |
| 6 | Ingliz tili darajasini aniqlash testi (placement / level test) | 25 040 | mixed | a+c | M | low | 7,6–13,8 | 29,4 | 8–12 |
| 7 | Mavzuli so‘zlar: «X ingliz tilida» / «X на английском» + kartochkalar | 22 985 | weak | a+c | M | low | 7,0–12,6 | 22,0 | 6–12 |
| 8 | Turk, yapon, xitoy, arab, nemis tillari: boshlang‘ich so‘zlar + AI til o‘qituvchisi | 46 830 | weak | b+c | L | medium | 14,3–25,8 | 55,1 | 8–14 |
| 9 | Ingliz tili grammatikasi: conditionals, passive, reported speech, pronouns, prepositions… | 51 510 | mixed | a+b+c | L | low | 15,7–28,3 | 49,3 | 10–16 |
| 10 | Узбекский для русскоязычных: алфавит (реформа 2026), разговорник, «как будет на узбекском» | 9 760 | weak | c | S | low | 3,0–5,4 | 11,5 | 4–8 |
| 11 | TOPIK / EPS-TOPIK: amaliy testlar + koreys tili asoslari | 17 920 | mixed | a+c | L | medium | 5,5–9,9 | 21,1 | 10–16 |
| 12 | IELTS Writing / Speaking: AI-tekshiruv va mavzular | 18 080 | strong | b+c | M | medium | 5,5–9,9 | 21,3 | 16–26+ |
| | **Итого 12 кластеров** | **365 155** | | | | | **111–201** | **385** | |

### 1. Ingliz tili zamonlari: Present/Past/Future + mashqlar

- **Ключи (объём/мес):** present simple 12 100; past simple 8 100; present continuous 6 600; present perfect 5 400; past continuous 2 900; present perfect continuous 2 400; past perfect 2 400; present simple exercises 2 400; future simple 1 900; past simple exercises 1 900.
- **Спрос:** 59 600/мес после дедупликации и весов (без весов 59 600). Сезонность: пик 2025-10 (×1,46), минимум 2026-08 (×0,56), сентябрь-2026 ×0,9 к среднему.
- **Выдача (weak):** «present simple»: AIO r1, картинки, PAA; YouTube #1 #3 #6, blog.bukischool-kz #2, slideshare #4, pinterest #5 — Голова — видео, слайдшеры и пинтерест; текстовой страницы на узбекском в топ-6 нет. AIO на 1-м месте.
- **Что умеет продукт:** (c) оригинальные объяснения + (a) детерминированный генератор упражнений (подстановка формы, проверка ответа) + (b) роль «ingliz tili o‘qituvchisi» в чате («объясни мою ошибку»).
- **Что построить:** Хаб /uz/ingliz-tili-zamonlari/ + 12 страниц /uz/ingliz-tili-zamonlari/present-simple/ … future-perfect-continuous/; RU-зеркало /ru/vremena-angliyskogo-yazyka/<time>/. На каждой: формула (+/−/?), маркеры времени, 10 примеров EN–UZ–RU, генератор 10 заданий с проверкой, кнопка «Chatda tushuntirish». Английские головы (present simple 12 100) берёт UZ-страница с английским H2.
- **Усилия / риск:** M / low. **Визиты:** поз. ~6 — 18,2–32,8 в день; поз. ~3 — 57,1 в день (AIO ×0,533: AIO r1 (present simple)).
- **Разгон:** 8–14 недель до первого заметного трафика (статьи; K≈0,04 в 1-й месяц, генератор упражнений ускоряет поведенческие сигналы).
- **Пересечение с education-practice:** полностью — их кластер «Ingliz tili grammatikasi o‘zbekcha + daraja testi».
- **Нет корзины в Google Ads (null):** ingliz tili zamonlari, ingliz tilida zamonlar, zamonlar ingliz tilida, 16 zamon.

### 2. Noto‘g‘ri fe’llar / irregular verbs / неправильные глаголы

- **Ключи (объём/мес):** irregular verbs 12 100; irregular verbs list = list of irregular verbs 2 900; noto'g'ri fe'llar jadvali 2 400; неправильные глаголы 1 900; noto'g'ri fe'llar 1 000; notogri fellar 720; past participle 720; regular verbs 590; regular and irregular verbs 590; таблица неправильных глаголов 390.
- **Спрос:** 24 260/мес после дедупликации и весов (без весов 24 260). Сезонность: пик 2025-10 (×1,4), минимум 2026-08 (×0,53), сентябрь-2026 ×0,81 к среднему.
- **Выдача (weak):** «irregular verbs»: AIO r1; esl-lounge, athabascau.ca, pearson PDF, helpingwithverbs, woodwardenglish, YouTube, engvid PDF, scribd | «noto'g'ri fe'llar jadvali»: AIO r1; scribd #1 #2 #4 #8, insho.uz #3, Play-приложение #5, studocu #6, ok.ru #7, soff.uz (платный файл) #9 — По UZ-запросу топ — Scribd ×4, Studocu, ok.ru, Play-приложение, платный файл soff.uz; живая страница одна (insho.uz #3). По английскому — ESL-сайты и PDF, интерактивного тренажёра нет.
- **Что умеет продукт:** (a) детерминированный инструмент: таблица V1–V2–V3 с поиском и переводом UZ/RU + тренажёр «скрыть колонку» + печать (c).
- **Что построить:** /uz/notogri-fellar/ (H1 «Noto‘g‘ri fe’llar jadvali — irregular verbs V1 V2 V3») и /ru/nepravilnye-glagoly/. 150–200 глаголов, фильтр «топ-50/100», режим теста (10 случайных глаголов, ввод V2/V3, счёт), версия для печати вместо PDF.
- **Усилия / риск:** S / low. **Визиты:** поз. ~6 — 7,4–13,3 в день; поз. ~3 — 23,2 в день (AIO ×0,533: AIO r1 в обеих снятых выдачах).
- **Разгон:** 4–8 недель до первого заметного трафика (инструмент против Scribd/PDF — быстрый разгон).
- **Пересечение с education-practice:** частично — «irregular verbs» упомянут в их грамматическом кластере.
- **Нет корзины в Google Ads (null):** irregular verbs ingliz tili, fe'lning 3 shakli, notog'ri fe'llar.

### 3. Alifbolar: ingliz, rus, arab, koreys, yapon (+transkripsiya, kartochkalar)

- **Ключи (объём/мес):** arab alifbosi 8 100; русский алфавит 6 600; english alphabet 5 400; английский алфавит 3 600; арабский алфавит 2 900; алфавит английский 2 400; rus alifbosi 2 400; ingliz alifbosi 1 600; корейский алфавит 1 600; arab tili alifbosi 1 300.
- **Спрос:** 47 360/мес после дедупликации и весов (без весов 47 360). Сезонность: пик 2025-10 (×1,26), минимум 2026-08 (×0,67), сентябрь-2026 ×1,12 к среднему.
- **Не посчитано:** «alphabet» — 3 600 — неоднозначно (детские песни/Alphabet Inc.), не считаю.
- **Выдача (mixed):** «английский алфавит»: AIO r1; ru.wikipedia #1, lingust.ru, yandex-видео, eng.skillbox.ru, pinterest, cambridge.ua, puzzle-english | «arab alifbosi»: видео r1, AIO r2; scribd #1 #5, YouTube #2 #3 #4 #7, arabic.uz PDF #6 — EN: Википедия #1 и блоги школ (lingust, skillbox, puzzle-english), узбекской страницы нет. Арабский: Scribd и YouTube, живых страниц нет.
- **Что умеет продукт:** (c) таблицы букв (название, транскрипция IPA + узбекское/русское приближение, пример слова) + (a) карточки-квиз «узнай букву». Аудио нет — это честно указать (продукт не синтезирует голос).
- **Что построить:** /uz/alifbo/ingliz/, /uz/alifbo/rus/, /uz/alifbo/arab/, /uz/alifbo/koreys/ (hangul), /uz/alifbo/yapon/ (hiragana+katakana), /uz/alifbo/turk/; RU: /ru/angliyskiy-alfavit/, /ru/arabskiy-alfavit/, /ru/koreyskiy-alfavit/. Арабский — только лингвистика (буквы, формы, огласовки), без религиозных толкований.
- **Усилия / риск:** M / low. **Визиты:** поз. ~6 — 14,4–26,0 в день; поз. ~3 — 45,3 в день (AIO ×0,533: AIO r1 (английский алфавит), r2 (arab alifbosi)).
- **Разгон:** 6–10 недель до первого заметного трафика (статичные страницы на слабой выдаче).

### 4. IELTS / CEFR (Multilevel) ball kalkulyatori

- **Ключи (объём/мес):** ielts calculator 8 100; ielts score 6 600 (вес 0,5); ielts score calculator 2 400; cefr ballari 1 900; ielts band score 1 600; ielts listening band score 880; ielts reading band score 480; ielts band score calculator 390; cefr calculator 110; multilevel ballari 110.
- **Спрос:** 19 640/мес после дедупликации и весов (без весов 22 940). Сезонность: пик 2026-06 (×1,21), минимум 2026-09 (×0,69), сентябрь-2026 ×0,69 к среднему.
- **Выдача (mixed):** «ielts calculator»: AIO r5; leapscholar, ielts.idp.com, aehelp, edify.pk, facebook-видео, lumetest, gurully, uptodown (APK) | «cefr ballari»: AIO r4; uzbmb.uz PDF, testmakon.uz, world.uz, britishcouncil.uz, hasanboy.uz (2021), oliygoh.uz (2023), grantlar.uz (2018), my.gov.uz — IELTS: зарубежные калькуляторы (leapscholar, IDP, aehelp, edify.pk), есть facebook-видео и APK; AIO только на 5-м месте. CEFR/Multilevel: PDF uzbmb, тонкие узбекские блоги 2018–2023 и my.gov.uz — калькулятора нет вообще.
- **Что умеет продукт:** (a) детерминированный калькулятор: IELTS — сырые баллы Listening/Reading → band по опубликованным таблицам + официальное правило округления overall; Multilevel/CEFR — 4 навыка → балл и уровень B1/B2/C1 по шкале uzbmb.
- **Что построить:** /uz/ielts-ball-kalkulyator/ и /uz/cefr-multilevel-ball-hisoblash/; RU: /ru/kalkulyator-ballov-ielts/. Таблицы перевода сырых баллов помечены «taxminiy / ориентировочно»; ссылка на источник шкалы (uzbmb PDF). Ниже — «Qaysi bo‘limni ko‘tarish kerak» (что подтянуть до целевого балла).
- **Усилия / риск:** S / low. **Визиты:** поз. ~6 — 6,0–10,8 в день; поз. ~3 — 23,1 в день (AIO ×0,655: AIO r5 (ielts calculator), r4 (cefr ballari)).
- **Разгон:** 4–8 недель до первого заметного трафика (инструмент; для Multilevel конкурентов-инструментов нет).
- **Пересечение с education-practice:** частично — у них «ball kalkulyatori» для DTM/Milliy sertifikat; IELTS/Multilevel-калькулятор — только здесь.

### 5. Multilevel / CEFR: mock-test (speaking, writing, reading) + gid

- **Ключи (объём/мес):** cefr 6 600 (вес 0,5); multilevel 5 400 (вес 0,5); multilevel mock test 2 400; multilevel speaking 1 600; multilevel reading 1 600; cefr mock test 1 300; cefr sertifikat 1 300; cefr test 880; cefr speaking 880; multilevel writing 590.
- **Спрос:** 22 170/мес после дедупликации и весов (без весов 29 980). Сезонность: пик 2026-04 (×1,38), минимум 2025-10 (×0,73), сентябрь-2026 ×1,1 к среднему.
- **Не посчитано:** «milliy sertifikat» — 18 100 — навигационный (результаты/регистрация uzbmb), не считаю; «multilevel listening / cefr listening» — вес 0: нужен аудиоконтент, продукт его не делает.
- **Выдача (weak):** «multilevel mock test»: AIO r2; studocu #1, YouTube #2, scribd #3 #4 #5 #6 #7 #8 — Самая слабая выдача линзы: Studocu #1, YouTube, затем шесть документов Scribd подряд. Живого тренажёра нет.
- **Что умеет продукт:** (c) оригинальные задания Speaking (part 1/2/3) и Writing (task 1 письмо, task 2 эссе) + (a) таймер и счётчик слов + (b) роль «Multilevel examiner»: разбор написанного ответа по критериям. Listening не обслуживаем (нужно аудио) — вес 0.
- **Что построить:** Хаб /uz/multilevel-mock-test/ → /speaking/ (банк ≥100 оригинальных вопросов, таймер 30/60/120 с, ответ текстом → AI-разбор), /writing/ (темы писем и эссе, лимит слов, AI-разбор), /reading/ (оригинальные тексты с вопросами — этап 2) + гид /uz/cefr-multilevel-nima/ (формат, шкала, уровни). Нельзя: реальные экзаменационные материалы и «ответы».
- **Усилия / риск:** M / medium. **Визиты:** поз. ~6 — 6,8–12,2 в день; поз. ~3 — 26,1 в день (AIO ×0,655: AIO r2 (multilevel mock test)).
- **Разгон:** 6–10 недель до первого заметного трафика (speaking/writing — первыми; reading — по мере наполнения).
- **Пересечение с education-practice:** writing и mock — частично (тот же кластер); speaking и reading — только здесь.
- **Нет корзины в Google Ads (null):** multilevel essay.

### 6. Ingliz tili darajasini aniqlash testi (placement / level test)

- **Ключи (объём/мес):** ingliz tili test 14 800; english test 3 600; english level test 2 400; уровни английского 880; english grammar test 880; уровни английского языка = уровни английский язык 480; тест на уровень английского 480; уровни англ 390; level test 210; placement test 210.
- **Спрос:** 25 040/мес после дедупликации и весов (без весов 25 040). Сезонность: пик 2026-05 (×1,5), минимум 2025-11 (×0,4), сентябрь-2026 ×1,23 к среднему.
- **Выдача (mixed):** SERP не снят (лимит кредитов). L3 (24.10) отклонил «ingliz tili test» как «банки тестов» — по правилам этой задачи оригинальный тест с объяснениями разрешён. Заголовок предварительный.
- **Что умеет продукт:** (a) детерминированный тест уровня: 40–50 оригинальных заданий (грамматика, лексика, чтение), подсчёт и оценка A1–C1 + (c) разбор каждой ошибки + ссылки на страницы времён/грамматики.
- **Что построить:** /uz/ingliz-tili-darajasini-aniqlash-testi/ (H1 «Ingliz tili test: darajangizni 15 daqiqada aniqlang») и /ru/test-na-uroven-angliyskogo/ + /ru/urovni-angliyskogo/ (таблица A1–C2 ↔ IELTS ↔ Multilevel).
- **Усилия / риск:** M / low. **Визиты:** поз. ~6 — 7,6–13,8 в день; поз. ~3 — 29,4 в день (AIO ×0,655: SERP не снят (кредиты); приор AIO).
- **Разгон:** 8–12 недель до первого заметного трафика (SERP не проверен; «ingliz tili test» сильно растёт и пикует в мае).
- **Пересечение с education-practice:** полностью — «daraja testi» в том же кластере; «ingliz tili test» есть и в их «Fanlar bo‘yicha amaliy testlar».
- **Нет корзины в Google Ads (null):** ingliz tili darajasini aniqlash, ingliz tili test savollari.

### 7. Mavzuli so‘zlar: «X ingliz tilida» / «X на английском» + kartochkalar

- **Ключи (объём/мес):** дни недели на английском 1 900; vocabulary 3 600 (вес 0,5); mevalar ingliz tilida 1 000; inglizcha so'zlar 1 000; collocations 1 000; привет на английском 720; flashcards 720; hafta kunlari 1 300 (вес 0,5); synonyms 1 300 (вес 0,5); месяцы на английском 590.
- **Спрос:** 22 985/мес после дедупликации и весов (без весов 27 380). Сезонность: пик 2025-10 (×1,22), минимум 2026-08 (×0,64), сентябрь-2026 ×1,15 к среднему.
- **Выдача (weak):** «дни недели на английском»: AIO r1, картинки; online-london (блог), YouTube Shorts, tetran.ru, crazylink, rutube, YouTube, личный блог — Блоги школ, YouTube/Rutube, личные сайты; AIO на 1-м месте отвечает на простые запросы сам («Monday…») — CTR будет ниже кривой.
- **Что умеет продукт:** (c) тематические списки EN–UZ–RU с транскрипцией и примером + (a) карточки и мини-тест на каждой странице.
- **Что построить:** /uz/inglizcha-sozlar/ хаб + 30–40 тем: hafta-kunlari, oylar, ranglar, mevalar, sabzavotlar, sonlar, kasblar, tana-azolari, fasllar, hayvonlar, kiyimlar, salomlashish, oila…; RU-зеркала /ru/angliyskie-slova/dni-nedeli/, mesyatsy/, tsifry/, privet-i-privetstviya/… Плюс тексты «My family / About myself» как шаблоны с плейсхолдерами.
- **Усилия / риск:** M / low. **Визиты:** поз. ~6 — 7,0–12,6 в день; поз. ~3 — 22,0 в день (AIO ×0,533: AIO r1 (дни недели на английском)).
- **Разгон:** 6–12 недель до первого заметного трафика (много мелких страниц; AIO съедает часть кликов).

### 8. Turk, yapon, xitoy, arab, nemis tillari: boshlang‘ich so‘zlar + AI til o‘qituvchisi

- **Ключи (объём/мес):** turkcha so'zlar 12 100; yapon tilini o'rganish 12 100; xitoy tili 6 600; arabcha so'zlar 1 900; turk tili 1 300; arab tili 1 300; nemis tili 1 300; hsk 1 000; turk tilini o'rganish 880; turkcha 720.
- **Спрос:** 46 830/мес после дедупликации и весов (без весов 46 830). Сезонность: пик 2026-09 (×1,71), минимум 2025-10 (×0,28), сентябрь-2026 ×1,71 к среднему.
- **Не посчитано:** «turkcha/koreyscha/arabcha/nemischa o‘zbekcha lug‘at» — словари — ветка переводчика.
- **Выдача (weak):** «turkcha so'zlar»: видео r1, AIO r2; lingvanex (переводчик), gulhide.tr (лугат), YouTube #3 #7 #8, scribd #4 #5, lingohut | «yapon tilini o'rganish»: видео r1; prep.uz (2020), YouTube #2 #6 #8, uz.wikipedia, talkpal.ai (AI-репетитор), jac-skill, tcj-education; AIO r10 — Переводчик lingvanex, лугат gulhide.tr, Scribd, YouTube, старый блог prep.uz (2020); уже есть AI-репетитор talkpal.ai — ниша для AI-роли подтверждена.
- **Что умеет продукт:** (c) стартовые страницы: алфавит/письменность, 300–500 частотных слов и фраз с переводом + (b) роль «til o‘qituvchisi» (выбор языка) в чате.
- **Что построить:** /uz/turk-tili/ (turkcha so‘zlar va gaplar), /uz/yapon-tili/ (hiragana + boshlang‘ich), /uz/xitoy-tili/ (pinyin + HSK 1 so‘zlari), /uz/arab-tili/ (arabcha so‘zlar), /uz/nemis-tili/ (der/die/das + A1). Списки — только после проверки носителем; словари (lug‘at) не делаем — это ветка переводчика.
- **Усилия / риск:** L / medium. **Визиты:** поз. ~6 — 14,3–25,8 в день; поз. ~3 — 55,1 в день (AIO ×0,655: AIO r2 (turkcha so‘zlar), r10 (yapon tilini o‘rganish)).
- **Разгон:** 8–14 недель до первого заметного трафика (рост головы подозрительный (×6 за год) — см. §4).

### 9. Ingliz tili grammatikasi: conditionals, passive, reported speech, pronouns, prepositions…

- **Ключи (объём/мес):** pronouns 14 800 (вес 0,5); passive voice 3 600; conditionals 2 400; reported speech = indirect speech 2 400; ingliz tili grammatikasi = ingliz tili grammatika 2 400; modal verbs 1 900; there is there are 1 900; prepositions of place 1 900; relative clauses 1 900; second conditional 1 600.
- **Спрос:** 51 510/мес после дедупликации и весов (без весов 63 860). Сезонность: пик 2025-10 (×1,35), минимум 2026-08 (×0,6), сентябрь-2026 ×0,79 к среднему.
- **Не посчитано:** «articles» — неоднозначно (4 400, CPC 6.62 — «статьи» вообще), не считаю.
- **Выдача (mixed):** «pronouns»: AIO r1; merriam-webster, wordvice, en.wikipedia, British Council Kids, BBC Bitesize, wsu.edu, perfect-english-grammar — «pronouns» — Merriam-Webster, Wikipedia, BBC, British Council: сильно. Остальные темы не снимались; по аналогии с «present simple» RU/UZ-выдачи слабее.
- **Что умеет продукт:** (c) объяснения + (a) генератор упражнений + (b) AI-разбор, как у времён.
- **Что построить:** /uz/ingliz-tili-grammatikasi/ хаб + ~25 тем: passive-voice, conditionals (0/1/2/3/mixed), reported-speech, modal-verbs, there-is-there-are, some-any-much-many, comparatives, prepositions (time/place), pronouns, articles, gerund-infinitive, relative-clauses, question-tags, countable-uncountable, phrasal-verbs; RU-зеркала по топ-10 темам.
- **Усилия / риск:** L / low. **Визиты:** поз. ~6 — 15,7–28,3 в день; поз. ~3 — 49,3 в день (AIO ×0,533: AIO r1 (pronouns)).
- **Разгон:** 10–16 недель до первого заметного трафика (сильные англоязычные головы растут медленно, начинать с тем, где выдача видео/блоги).
- **Пересечение с education-practice:** полностью — тот же кластер education-practice.
- **Нет корзины в Google Ads (null):** ingliz tili qoidalari, ingliz tili grammatika mashqlar.

### 10. Узбекский для русскоязычных: алфавит (реформа 2026), разговорник, «как будет на узбекском»

- **Ключи (объём/мес):** узбекский алфавит 2 900; узбекский язык 1 300; дни недели на узбекском 1 000; uzbek language 720; как будет на узбекском 1 300 (вес 0,5); uzbek alphabet 480; по узбекски 480 (вес 0,5); узбекский алфавит кириллица 210; как по узбекски 390 (вес 0,5); на узбекском языке 390 (вес 0,5).
- **Спрос:** 9 760/мес после дедупликации и весов (без весов 11 170). Сезонность: пик 2025-10 (×1,38), минимум 2026-06 (×0,69), сентябрь-2026 ×1,25 к среднему.
- **Не посчитано:** «русско узбекский словарь / узбекско русский словарь» — 3 600 / 1 000 — владеет ветка переводчика RU↔UZ.
- **Выдача (weak):** «узбекский алфавит»: AIO нет; картинки, Shorts, видео; zamin.uz (новость о реформе 2026), livejournal (2013), pinterest, yep.uz (2018), YouTube, kci.go.kr — Новость zamin.uz о реформе, LiveJournal 2013, Pinterest, yep.uz 2018 — живой справочной страницы нет. Реформа алфавита 2026 (28 букв) даёт свежий повод.
- **Что умеет продукт:** (c) алфавит латиница ↔ кириллица с отметкой изменений реформы + разговорник; связка с конвертером Cyrillic↔Latin и переводчиком RU↔UZ.
- **Что построить:** /ru/uzbekskiy-alfavit/ (таблица лат/кир, произношение для русскоязычных, блок «что меняет реформа» с датой и источником, виджет конвертера), /ru/uzbekskiy-razgovornik/ (привет, спасибо, как дела, числа, дни недели, месяцы — с латиницей и кириллицей), /ru/uzbekskiy-yazyk-dlya-nachinayushchih/ + роль чата «учитель узбекского».
- **Усилия / риск:** S / low. **Визиты:** поз. ~6 — 3,0–5,4 в день; поз. ~3 — 11,5 в день (AIO ×0,655: AIO в топ-10 нет (картинки, видео, PAA); дисконт оставлен консервативно).
- **Разгон:** 4–8 недель до первого заметного трафика (очень слабая выдача, тематически ближе всего к сайту).

### 11. TOPIK / EPS-TOPIK: amaliy testlar + koreys tili asoslari

- **Ключи (объём/мес):** topik 14 800 (вес 0,5); topik test 3 600; eps topik 4 400 (вес 0,5); eps topik test 1 600; koreys tili 590; koreys tilini o'rganish 480; topik test online 390; topik 1 320; корейский язык 320; topik 2 170.
- **Спрос:** 17 920/мес после дедупликации и весов (без весов 27 520). Сезонность: пик 2026-02 (×1,43), минимум 2025-11 (×0,49), сентябрь-2026 ×0,82 к среднему.
- **Выдача (mixed):** «topik test»: AIO r3; topikguide #1 #2, thinkbigtopik, Play, onlinetestpad, learning-korean, topik.go.kr, scribd — Нишевые зарубежные сайты (topikguide, thinkbigtopik, learning-korean), Play, onlinetestpad, официальный topik.go.kr; узбекских страниц нет. «topik»/«eps topik» частично навигационные (регистрация, результаты) — вес 0,5.
- **Что умеет продукт:** (c) оригинальные задания чтения и лексики формата EPS-TOPIK с объяснениями на узбекском + (a) тест с подсчётом; аудирование не обслуживаем.
- **Что построить:** /uz/eps-topik-test/ (оригинальные вопросы, разбор, таймер), /uz/topik-test/, /uz/koreys-tili/ (hangul → /uz/alifbo/koreys/, 300 слов для работы). Официальные прошлые варианты не копировать (авторские права NIIED).
- **Усилия / риск:** L / medium. **Визиты:** поз. ~6 — 5,5–9,9 в день; поз. ~3 — 21,1 в день (AIO ×0,655: AIO r3 (topik test)).
- **Разгон:** 10–16 недель до первого заметного трафика (контент на корейском требует проверки носителем).

### 12. IELTS Writing / Speaking: AI-tekshiruv va mavzular

- **Ключи (объём/мес):** ielts writing task 1 2 900; ielts speaking questions 1 600; ielts speaking 1 300; ielts writing task 2 1 300; grammar checker = grammar check 1 900 (вес 0,5); ielts speaking topics 720; ielts writing 720; ielts writing checker 720; ielts writing task 2 topics 590; linking words 590.
- **Спрос:** 18 080/мес после дедупликации и весов (без весов 19 030). Сезонность: пик 2026-01 (×1,15), минимум 2026-08 (×0,79), сентябрь-2026 ×0,81 к среднему.
- **Не посчитано:** «ielts» — 27 100 — общий/навигационный (регистрация, IDP/BC); «ielts listening/reading/mock/practice test» — ≈13 300 — нужны аудио и лицензированные тексты; SERP у ielts.org/IDP.
- **Выдача (strong):** «ielts writing task 1»: AIO r2; ielts.idp.com, kanan.co, ielts.org, eng.skillbox.ru, ieltsmaterial, global-exam, ieltsbuddy, ielts.com.au, wordwall — IDP, ielts.org, ielts.com.au, kanan, ieltsmaterial, ieltsbuddy, skillbox — сильные бренды. Шанс есть только у подзапросов-инструментов («ielts writing checker» 720, «ielts essay checker» 210).
- **Что умеет продукт:** (b) роль «IELTS examiner» в чате: оценка эссе/ответа по 4 критериям с пометкой «неофициально» + (c) банк тем Speaking/Writing и шаблоны структуры.
- **Что построить:** /uz/ielts-writing-checker/ (вставить эссе → AI-разбор по Task Response / Coherence / Lexical / Grammar, ориентировочный band) и /uz/ielts-speaking-savollari/ (банк тем part 1/2/3, ответ текстом → AI-разбор). Без «официального балла».
- **Усилия / риск:** M / medium. **Визиты:** поз. ~6 — 5,5–9,9 в день; поз. ~3 — 21,3 в день (AIO ×0,655: AIO r2 (ielts writing task 1)).
- **Разгон:** 16–26+ недель до первого заметного трафика (сильная выдача; топ-3 по головам маловероятен).
- **Пересечение с education-practice:** writing — полностью («IELTS / CEFR / Multilevel writing (AI) + mock»); speaking — только здесь.
- **Нет корзины в Google Ads (null):** essay, essay writing.

### Ниже отсечки

- **Rus tili o‘zbeklar uchun: kelishiklar, sonlar, so‘zlar + AI o‘qituvchi** — 9 830/мес (rus tili 3 600; падежи русского языка 1 900; rus tilini o'rganish 1 600; ruscha 1 300 (вес 0,5); rus tili lug'at 720 (вес 0,5); ruscha sonlar 320). Поз. ~6: 3,0–5,4 в день, поз. ~3: 11,6. Выдача по «rus tilini o‘rganish»: YouTube ×5, Play ×2 — запрос видео-интентный, текстовая страница возьмёт мало. Имеет смысл как продолжение роли «o‘qituvchi» после кластера 10.
- **Смежное, но не моя линза:** «inglizcha statuslar» 2 400 (растёт), «inglizcha gaplar» 1 600, «hikmatli so‘zlar» — это тексты/поздравления; «grammar checker» 1 900 посчитан в кластере 12 с весом 0,5 — полноценный «проверщик текста» лучше оценивать в линзе текстовых инструментов.

## 3. Снятые выдачи (2026-10-25, hl=ru, desktop, топ-10)

| Запрос | Кто в топе | Слабые сигналы |
|---|---|---|
| irregular verbs | AIO r1; esl-lounge, athabascau.ca, pearson PDF, helpingwithverbs, woodwardenglish, YouTube, engvid PDF, scribd | PDF ×2, Scribd, YouTube; нет тренажёра |
| noto'g'ri fe'llar jadvali | AIO r1; scribd #1 #2 #4 #8, insho.uz #3, Play-приложение #5, studocu #6, ok.ru #7, soff.uz (платный файл) #9 | Scribd ×4, Studocu, ok.ru, платный файл |
| present simple | AIO r1, картинки, PAA; YouTube #1 #3 #6, blog.bukischool-kz #2, slideshare #4, pinterest #5 | YouTube ×3, slideshare, pinterest |
| pronouns | AIO r1; merriam-webster, wordvice, en.wikipedia, British Council Kids, BBC Bitesize, wsu.edu, perfect-english-grammar | — (сильные словари/BBC) |
| ielts calculator | AIO r5; leapscholar, ielts.idp.com, aehelp, edify.pk, facebook-видео, lumetest, gurully, uptodown (APK) | facebook-видео, APK; зарубежные мелкие тулзы |
| cefr ballari | AIO r4; uzbmb.uz PDF, testmakon.uz, world.uz, britishcouncil.uz, hasanboy.uz (2021), oliygoh.uz (2023), grantlar.uz (2018), my.gov.uz | PDF, блоги 2018–2023 |
| multilevel mock test | AIO r2; studocu #1, YouTube #2, scribd #3 #4 #5 #6 #7 #8 | Scribd ×6, Studocu |
| ielts writing task 1 | AIO r2; ielts.idp.com, kanan.co, ielts.org, eng.skillbox.ru, ieltsmaterial, global-exam, ieltsbuddy, ielts.com.au, wordwall | — (сильные бренды) |
| английский алфавит | AIO r1; ru.wikipedia #1, lingust.ru, yandex-видео, eng.skillbox.ru, pinterest, cambridge.ua, puzzle-english | pinterest, yandex-видео |
| arab alifbosi | видео r1, AIO r2; scribd #1 #5, YouTube #2 #3 #4 #7, arabic.uz PDF #6 | Scribd ×2, YouTube ×4, PDF |
| дни недели на английском | AIO r1, картинки; online-london (блог), YouTube Shorts, tetran.ru, crazylink, rutube, YouTube, личный блог | Shorts, rutube, личные блоги |
| узбекский алфавит | AIO нет; картинки, Shorts, видео; zamin.uz (новость о реформе 2026), livejournal (2013), pinterest, yep.uz (2018), YouTube, kci.go.kr | LiveJournal 2013, pinterest, yep.uz 2018 |
| turkcha so'zlar | видео r1, AIO r2; lingvanex (переводчик), gulhide.tr (лугат), YouTube #3 #7 #8, scribd #4 #5, lingohut | Scribd ×2, YouTube ×3 |
| yapon tilini o'rganish | видео r1; prep.uz (2020), YouTube #2 #6 #8, uz.wikipedia, talkpal.ai (AI-репетитор), jac-skill, tcj-education; AIO r10 | YouTube ×3, блог 2020 |
| topik test | AIO r3; topikguide #1 #2, thinkbigtopik, Play, onlinetestpad, learning-korean, topik.go.kr, scribd | Scribd, Play, onlinetestpad |
| rus tilini o'rganish | Shorts r1, AIO r3; YouTube #1 #2 #3 #5 #7, Play #4 #6, yandex-видео | видео-интент (YouTube ×5) |

AI Overview найден в 14 из 16 выдач (нет в «узбекский алфавит»; в «yapon tilini o‘rganish» — только на 10-м месте).

## 4. Риски и допущения

- **Позиция не гарантирована.** У сайта ≈8 доменов-доноров. Языковая тема для него новая: хаб `/uz/ingliz-tili/` надо связать с чатом (роль «o‘qituvchi» уже есть — `src/gpt-chat/roles.ts:16,25`) и со школьными гайдами, иначе тематического веса не будет.
- **Рост UZ-латинских рядов** (см. §0 п. 5) сильнее всего затрагивает кластеры 6 («ingliz tili test») и 8 (turk/yapon/xitoy/arab), слабее — отдельные UZ-ключи кластера 7 («inglizcha so‘zlar»). Поэтому их место в приоритете держится на слабой выдаче, а не на объёме; перед большой контентной работой по кластеру 8 стоит дождаться ещё 2–3 месяцев ряда.
- **AIO на простых вопросах** («дни недели на английском», «английский алфавит») отвечает сам; CTR там, вероятно, ниже кривой сайта. Интерактив (квиз, карточки, генератор) — единственный аргумент кликнуть.
- **Честность.** Только оригинальные задания; никаких реальных вариантов экзаменов, «javoblar», копий Scribd/учебников. AI-оценки (IELTS band, Multilevel) — с пометкой «taxminiy, rasmiy emas». Таблицы перевода сырых баллов IELTS — с источником и пометкой «ориентировочно». Аудио продукт не делает — в Listening не заходим. Арабский — только алфавит и лексика, без религиозных толкований.
- **Пересечения с другими ветками.** Словари RU↔UZ и «X o‘zbekcha lug‘at» — у переводчика; «как будет на узбекском» отдан с весом 0,5 разговорнику, но может уйти на страницу переводчика. Для новых страниц нужны записи в `intent-manifest` и, по L3, ревизия защищённой главной `/`.
- **Кредиты OpenSEO.** Лимит линзы — 700. `whoami`: 22 672 → 21 772 (−900). Это верхняя граница: на том же аккаунте одновременно работали параллельные линзы. Например, 4 SERP-вызова (16 запросов, depth 10) по прайсу стоят ≈40–80, а баланс за это время упал на 380. Собственная оценка — ≈450–500. Когда я увидел расхождение, остановил платные вызовы, поэтому SERP для «ingliz tili test» не снят.
