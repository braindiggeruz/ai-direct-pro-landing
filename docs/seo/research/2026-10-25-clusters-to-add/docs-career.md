# Линза «документы и карьера»: какие кластеры добавить на gptbot.uz

Дата: 2026-10-25. Вопрос владельца: какие новые темы дадут 1 000–2 000 визитов в день как можно скорее. Эта линза — документы и карьера: obyektivka (ma’lumotnoma), rezyume/CV, motivatsion xat и cover letter, tavsiyanoma, ish suhbati, shartnoma, buyruq, xizmat xati, dalolatnoma, ishonchnoma, bildirishnoma, tarjimai hol, amaliyot hisoboti, а также русские «образец заявления / резюме / объяснительной / характеристики».

Машиночитаемая версия: `docs-career.json`. Расчёт: `docs-career-data/dc_model.py` → `dc_model.json` (вывод `dc_model_out.txt`), сборка: `dc_build.py`. Сырые замеры: `dc_kw1_metrics.json` (620 ключей), `dc_kw2_metrics.json` (77 ключей), `research1_raw.json` (сиды «namunasi», «образец»), `dc_serp_top.json` (12 выдач). Список кандидатов: `candidates1.py`; индекс уже снятых ключей: `known_index.py` → `known_all.json`. Репозиторий только читался; запись только в эту папку.

## 0. Коротко

| Сценарий (12 кластеров линзы) | Спрос/мес | Визитов в день |
|---|---:|---:|
| Ads-объёмы, все кластеры на поз. ~6 | 134 850 | **41–75** |
| То же, «пол» (ключи со скачком — по уровню окт–ноя 2025) | 87 395 | 27–48 |
| Ads-объёмы, все в топ-3, AIO-дисконт | 134 850 | **157** |
| «Пол», все в топ-3, AIO-дисконт | 87 395 | 101 |
| Без договоров (HOLD), топ-3 | 124 750 | 145 (пол 89) |
| Оптимистичная граница: Ads верны, топ-3, без AIO-дисконта | 134 850 | 242 |
| Аномалия «amaliyot kundaligi to‘ldirish» 110 000, если она реальна (поз. 6 / топ-3) | +110 000 | +34–61 / +129 |

1. **Документы и карьера сами по себе 1 000 визитов в день не дадут.** Все 12 кластеров даже в топ-3 — ≈101–157 визитов в день, на поз. ~6 — ≈27–75. Это прибавка к прежнему потолку (≈650–1 100 в топ-3, `demand-sizing.md`), а не замена ему. Спрос здесь широкий, но мелкий: 134 850 запросов в месяц по Ads размазаны по 313 ключам, и только у 31 из них объём от 1 000.
2. **Главный ход линзы — один хаб «Ish qog‘ozlari namunalari» с общим генератором.** Шесть кластеров (служебные документы, дневник и отчёт практики, obyektivka, tilxat/ishonchnoma, tarjimai hol, бланки грамот) строятся на одном движке «поля → текст латиницей и кириллицей → печать/.docx». Вместе это 92 680 в месяц по Ads (пол 51 580), 28,5–51,2 визитов в день на поз. 6 и ≈108 в топ-3 (по полу 60). Выдачи почти везде слабые: Scribd, платные файлы soff/doclab/diplomishi, словари, YouTube-уроки.
3. **Откуда спрос и почему он растёт.** Выдачи «bildirishnoma», «tarjimai hol», «tilxat yozish» состоят из уроков «Davlat tilida ish yuritish» и школьных вопросов про «ish qog‘ozlari» (ariza, bildirishnoma, tilxat, tushuntirish xati, bayonnoma, ishonchnoma). У запросов вида «X yozish / X namuna» с декабря 2025 рост в 5–50 раз и пики в апреле–мае. Значит, спрос идёт от учебной программы, а провал — в июле–августе. Страницы, запущенные до февраля, успеют разогнаться к пику 2027 года.
4. **Самое быстрое по разгону** (≥2 визитов в день на поз. 6 за 9–15 недель): служебные документы (10 нед), дневник практики (9 нед по Ads), tilxat (11 нед по Ads), obyektivka (14 нед). Кластеры 6–8 выходят на 2 визита в день только через 18–23 недели, а 9–11 без топ-3 не дают и этого.
5. **Не строить:** шаблоны договоров (ijara/mehnat/oldi-sotdi — в выдаче госпорталы soliq.uz и gov.uz и юристы, юридический YMYL). «shartnoma» 8 100 по сезонности похож на вузовские контракты (всплеск авг–сен, выдача не снята). Ish suhbati, staj/oylik-калькуляторы, buyruq/приказ и tijorat taklifi — меньше 2 000 в месяц каждый (§5).
6. **Быстрый выигрыш без новых страниц.** Действующие гайды не объявили близкие варианты своих ключей: «ariza» 4 400, «tushuntirish xati namuna» 2 400, «rezyume namunasi» 1 600, «rezyume yozish namunasi» 1 600, «o‘quvchiga tavsifnoma» 590 и др. (§4). Это не новый спрос, а донастройка уже живых страниц, и в итоги линзы он не входит.

## 1. Метод

**Спрос.** Google Ads через OpenSEO, location 2860, `search_volume` = среднее за 12 месяцев (окт 2025 … сен 2026). Уже снятые ключи взяты повторно и второй раз не оплачивались: `l3-data/kw1_metrics.json`, `kw2_metrics.json`, `roadmap-1000/data/kw3_metrics.json`, `kw4_metrics.json`, `education-practice-data/ep_kw1_metrics.json` и все остальные JSON в `docs/seo/research` (индекс `known_all.json`, 4 503 ключа). Новые ключи: два вызова `get_keyword_metrics` (620 + 77 ключей: UZ латиница, UZ кириллица, RU, EN).

**`research_keywords`.** Сид «namunasi» вернул 1 строку; сид «образец» — 500 строк, почти все про деловые бумаги РФ по 10–70 в месяц («автобиография образец» 390, «коммерческое предложение образец» 210, «гарантийное письмо» 110). Русские «образец X» в Узбекистане — мелочь. Поэтому основной поиск идей — ручной список (`candidates1.py`).

**Дедупликация.** Одинаковые объём и 12-месячный ряд (объём ≥100) — одна корзина Google Ads; считается один раз на всю линзу. Так слиты obyektivka namuna = obyektivka namunasi, ma’lumotnoma namuna = …namunasi = malumotnoma namuna = ma lumotnoma namuna, объективка = обьективка, tarjimai hol = tarjimayi hol, tilxat namuna = tilxat namunasi, hisobot namuna = hisobot namunasi, recommendation letter = letter of recommendation, и «тавсиянома намуна» = «тавсифнома намуна» (одна корзина; засчитана один раз в кластере 8).

**«Пол».** Ключ считается «со скачком», если среднее за июль–сентябрь 2026 хотя бы в 5 раз больше среднего за октябрь–ноябрь 2025 (при объёме ≥500). Для таких ключей «пол» = уровень октября–ноября 2025; у остальных «пол» равен Ads-среднему. Правило то же, что в линзе education-practice.

**Роли ключей.** core — в расчёте; head — голые или неоднозначные запросы (cv, resume, резюме, характеристика, заявление, доверенность, ma’lumotnoma, hisobot, kasblar, shartnoma), только верхняя граница; susp — аномальная корзина («amaliyot kundaligi to‘ldirish» 110 000), только верхняя граница; existing — ключи, которыми уже владеют живые гайды; в новый спрос они не входят.

**Визиты.** Визиты в день = спрос × CTR × дисконт / 30 × 1,5 (1 клик Google ≈ 1,5 визита, roadmap §1.1). CTR взяты по собственной кривой сайта:
- поз. ~6: 0,613–1,105%, без отдельного AIO-дисконта (кривая снята на выдачах с AIO);
- поз. ~3: 3,593% × 0,533, если AIO на r1 («cv nima», «tarjimai hol»), иначе × 0,655 (AIO ниже или выдача не снята).

**Разгон (допущение).** В месяц n страница получает min(1; K1 × n^1,6) от прогноза поз. 6. K1 = 0,04 — статья или выдача не снята (калибровка 7 школьных гайдов, K≈0,04 в первый месяц); 0,06 — коллекция шаблонов на снятой слабой выдаче; 0,08 — интерактивный инструмент на слабой выдаче. 0,06 и 0,08 не откалиброваны. Всё при условии, что поз. ~6 вообще достигнута; доменов-доноров у сайта ≈8–10.

**SERP.** Два вызова `get_serp_results` (desktop, hl=ru, depth 10): 10 запросов + 2 запроса. «obyektivka namuna», «tavsifnoma namuna», «dalolatnoma namuna» взяты из L3 (24.10) и второй раз не оплачивались.

**Кредиты.** Лимит линзы — 600. `whoami`: 20 700 до работы → 18 846 после (−1 854), но параллельно тратили другие линзы: между двумя моими замерами баланс падал на 476 при одном моём SERP-вызове. Моя оценка: research ≈192 (2 сида × ≈96), metrics 2 × 104 = 208, SERP ≈30–60, итого ≈430–460 из 600.

## 2. Две оговорки, которые меняют цифры

| Ключ | окт / ноя 2025 | сен 2026 | Ads (среднее 12 мес) | Статус |
|---|---:|---:|---:|---|
| amaliyot kundaligi | 260 / 720 | 60 500 | 18 100 | core, пол 490 |
| amaliyot kundaligi to‘ldirish | 30 / 1 900 | 165 000 (июн 246 000) | 110 000 | susp, вне расчёта |
| тилхат | 140 / 320 | 18 100 | 8 100 | core, пол 230 |
| tilxat yozish | 260 / 320 | 12 100 | 5 400 | core, пол 290 |
| hisobot yozish | 210 / 480 | 5 400 | 5 400 | core, пол 345 |
| cv nima | 260 / 320 | 5 400 | 4 400 | core, пол 290 |
| тушунтириш хати | 720 / 590 | 5 400 | 2 900 | core, пол 655 |
| bildirishnoma yozish | 170 / 210 | 2 400 | 1 900 | core, пол 190 |

- **Скачок.** Рост в десятки раз (у «amaliyot kundaligi» — до ×230) с декабря 2025 только у узбекских документных запросов вида «X yozish / X namuna / кириллица». У запросов без учебной привязки (cv maker, резюме шаблон, ishonchnoma, faxriy yorliq) ряды ровные. Самое правдоподобное объяснение — тема «ish qog‘ozlari» в школьной и вузовской программе: выдачи «tilxat yozish» и «bildirishnoma» состоят из уроков «Davlat tilida ish yuritish» и школьных вопросов. Подтвердить по данным нельзя.
- **«amaliyot kundaligi to‘ldirish» 110 000 в месяц.** Это больше, чем все остальные ключи линзы вместе. Выдача документная (Scribd, soff, методички вузов), то есть намерение настоящее, но масштаб неправдоподобен для страны, где студентов порядка миллиона. В расчёт не входит. Проверка дешёвая: одна страница `/uz/hujjatlar/amaliyot-kundaligi/` и через 4–6 недель сравнить показы GSC с Ads. Если при средней позиции ≤20 показы не дотягивают даже до 5–10% от Ads, правдив «пол».

## 3. Сводка кластеров (порядок = рекомендуемый приоритет)

| # | Кластер | Спрос Ads (пол) | SERP | Fit | Effort | Честность | Визиты/день поз. ~6 | поз. ~3 | ≥2 виз/день на поз. 6 |
|---|---|---:|---|---|---|---|---:|---:|---|
| 1 | Ish qog‘ozlari: bildirishnoma, dalolatnoma, bayonnoma, kafolat xati, raport, e’lon | 21 920 (пол 18 630) | weak | c + a (+ b) | M | low | 6,7–12,1 (пол 5,7–10,3) | 25,8 (пол 21,9) | 10 нед (пол 11) |
| 2 | Amaliyot kundaligi va hisoboti (talaba amaliyoti) + hisobot namunasi | 27 950 (пол 5 285) | weak | c + a (+ b) | S | medium | 8,6–15,4 (пол 1,6–2,9) | 32,9 (пол 6,2) | 9 нед (пол 24) |
| 3 | Obyektivka (ma’lumotnoma) — генератор и образец | 12 980 (пол 10 815) | mixed | a + c | M | medium | 4,0–7,2 (пол 3,3–6,0) | 15,3 (пол 12,7) | 14 нед (пол 15) |
| 4 | Конструктор CV/rezyume (UZ/RU/EN) + RU-страница «образец резюме» + «CV nima» | 16 280 (пол 12 170) | mixed | a + c (+ b) | L | low | 5,0–9,0 (пол 3,7–6,7) | 18,2 (пол 13,6) | 15 нед (пол 18) |
| 5 | Tilxat (расписка) и oddiy yozma ishonchnoma — образец + форма | 17 980 (пол 5 000) | mixed | c + a | S | medium | 5,5–9,9 (пол 1,5–2,8) | 21,2 (пол 5,9) | 11 нед (пол 25) |
| 6 | Tarjimai hol (avtobiografiya) — образец и бланк | 5 390 | weak | c + a | S | low | 1,7–3,0 | 5,2 | 23 нед |
| 7 | Faxriy yorliq, maqtov yorlig‘i, tashakkurnoma, sertifikat — генератор бланков для печати | 6 460 | weak | a + c | M | low | 2,0–3,6 | 7,6 | 18 нед |
| 8 | Кириллица и RU для действующих гайдов: тушунтириш хати, ариза, тавсифнома + RU объяснительная, заявление, характеристика | 8 290 (пол 6 045) | mixed | c (+ b) | M | low | 2,5–4,6 (пол 1,9–3,3) | 9,8 (пол 7,1) | 23 нед (пол 28) |
| 9 | Tavsiyanoma / recommendation letter (UZ/RU/EN) | 2 960 | mixed | c + b | S | low | 0,9–1,6 | 3,5 | — |
| 10 | Motivatsion xat, cover letter, personal statement | 2 630 | mixed | b + c | S | medium | 0,8–1,5 | 3,1 | — |
| 11 | Kasb tanlash testi + kasblar ro‘yxati | 1 910 | mixed | a + c | M | low | 0,6–1,1 | 2,2 | — |
| 12 | Shartnoma namunalari (mehnat, pudrat, oldi-sotdi, ijara) — HOLD | 10 100 | strong | c (только нейтральное объяснение) | M | high | 3,1–5,6 | 11,9 | 20 нед |
| | **Итого (12)** | **134 850 (87 395)** | | | | | **41–75 (27–48)** | **157 (101)** | |

## 4. Карточки кластеров

### 1. Ish qog‘ozlari: bildirishnoma, dalolatnoma, bayonnoma, kafolat xati, raport, e’lon

- **Ключи (Ads/мес):**
  - UZ латиница: bildirishnoma 4 400, bildirishnoma yozish 1 900 (скачок, пол 190), bayonnoma namunasi 1 900, dalolatnoma namuna 1 300 (= dalolatnoma namunasi), bildirishnoma namunasi 1 000 (= bildirishnoma namuna), kafolat xati 1 000, dalolatnoma 880, bayonnoma 880, kafolat xati namuna 720, farmoyish hujjatlari 720, tashkiliy hujjatlar 390, rasmiy uslub 390, e'lon yozish 390, e'lon yozish namunasi 320, dalolatnoma yozish 260
  - UZ кириллица: билдиришнома намуна 1 600 (скачок, пол 20), далолатнома намуна 480, далолатнома 260
  - и ещё ключей по 10–90: 37 (полный список — `docs-career-data/dc_model.json`)
- **Спрос:** 21 920 по Ads, пол 18 630.
- **Сезонность:** пики: май 26 ×1,78, апр 26 ×1,5, фев 26 ×1,21; минимум: июл 26 ×0,6, авг 26 ×0,46.
- **SERP (weak):** Снято 2026-10-25. «bildirishnoma»: AIO r3; Scribd PDF, toolbase.uz и fmc.uz (словари), платные файлы kursishlari.uz/soff.uz, qnb.uz, урок YouTube «Ma’lumot-axborot hujjatlari». «dalolatnoma namuna» (L3, 24.10): soff, YouTube, Scribd ×5, arxiv.uz, lex.uz (акты ЗАГС) ×2, bss.uz. Своей страницы-шаблона с объяснением ни у кого нет. Слабая.
- **Что строить:** Хаб `/uz/hujjatlar/` («Ish qog‘ozlari namunalari»: виды документов — tashkiliy, farmoyish, ma’lumot-axborot; rasmiy uslub; ссылки на все документные страницы сайта, включая действующие гайды) и 6 страниц-шаблонов `/uz/hujjatlar/{bildirishnoma,dalolatnoma,bayonnoma,kafolat-xati,raport,elon}-namuna/`. Тип страницы: статичный шаблон (c) — определение, реквизиты, 2–3 условных образца только с плейсхолдерами, тот же образец кириллицей прямо в HTML, FAQ — плюс общий браузерный генератор (a): поля → готовый текст латиницей и кириллицей (через уже существующий конвертер), копировать / печать / .docx на клиенте, ничего не уходит на сервер. Кнопка «AI bilan yozish» открывает пресет чата (b). Для kafolat xati: страница отдельная, а `/uz/blog/rasmiy-xat-yozish/` ссылается на неё (новая пара в intent-manifest).
- **Связь с живыми страницами:** /uz/blog/rasmiy-xat-yozish/ (kafolat xati там только раздел; ключ не объявлен).
- **Effort:** M. **Честность:** low — Только плейсхолдеры, без печатей и подписей; «не юридическая консультация»; первой идёт форма организации.
- **Визиты/день:** поз. 6 — 6,7–12,1 (пол 5,7–10,3); поз. 3 — 25,8 (пол 21,9); без AIO-дисконта — 39,4.
- **Разгон:** K1 = 0,06; 1-й месяц ≈0,6 виз/день; ≥2 виз/день — 10 нед (по полу 11); ≥5 — 17 нед (по полу 19); полный прогноз поз. 6 через ≈5,8 мес. Запустить до февраля 2027, чтобы страницы разогнались к пику апр–май.

### 2. Amaliyot kundaligi va hisoboti (talaba amaliyoti) + hisobot namunasi

- **Ключи (Ads/мес):**
  - UZ латиница: amaliyot kundaligi 18 100 (скачок, пол 490), hisobot yozish 5 400 (скачок, пол 345), hisobot namunasi 2 400 (= hisobot namuna), amaliyot kundaligi namuna 480, amaliyot hisoboti 480, amaliyot kundaligi yozish 390, amaliyot kundaligi pdf 210, malakaviy amaliyot hisoboti 140, yillik hisobot namunasi 90, amaliyot daftari 50, amaliyot hisobot namunasi 40, pedagogik amaliyot hisoboti 30, amaliyot hisoboti namuna 10, amaliyot hisoboti namunasi 10, o'quv amaliyoti hisoboti 10
  - UZ кириллица: амалиёт кундалиги 30
  - RU: отчет по практике 40, дневник практики 10
  - и ещё ключей по 10–90: 3 (полный список — `docs-career-data/dc_model.json`)
  - head (верхняя граница): hisobot 1 600
  - susp: amaliyot kundaligi to'ldirish 110 000
- **Спрос:** 27 950 по Ads, пол 5 285, верхняя граница 139 550.
- **Сезонность:** пики: сен 26 ×2,44, май 26 ×1,99, апр 26 ×1,78; минимум: ноя 25 ×0,11, окт 25 ×0,07.
- **SERP (weak):** Снято 2026-10-25. «amaliyot kundaligi»: Scribd PDF ×3, платные doclab.uz, soff.uz (1 100 сум), diplomishi.uz (15 000 сум), arxiv.uz 2023, researchgate; AIO r2. «amaliyot kundaligi to‘ldirish»: то же самое (Scribd, soff, PDF методичек jdpu/buxdu, studocu), AIO r5 — намерение настоящее (шаблон и правила заполнения), не навигация в HEMIS или kundalik.com. «hisobot yozish»: soff «Hisobot, e’lonning yozilish tartibi», затем финансовая отчётность (sindex, unilibrary, t4data) — смешанная. Слабая.
- **Что строить:** `/uz/hujjatlar/amaliyot-kundaligi/` — пустой шаблон дневника практики (таблица: sana / bajarilgan ish mazmuni / rahbar imzosi), правила заполнения по разделам, образец 3 строк только с плейсхолдерами; генератор (a): диапазон дат → пустая таблица на печать/.docx. `/uz/hujjatlar/amaliyot-hisoboti/` — структура отчёта о практике. «hisobot namunasi/yozish» — раздел про служебный отчёт на этой же странице или на хабе `/uz/hujjatlar/`.
- **Effort:** S. **Честность:** medium — Без «готовых заполненных дневников для сдачи». AI-пресет помогает сформулировать то, что студент реально делал, и прямо говорит не выдумывать дни практики.
- **Визиты/день:** поз. 6 — 8,6–15,4 (пол 1,6–2,9); поз. 3 — 32,9 (пол 6,2); без AIO-дисконта — 50,2.
- **Разгон:** K1 = 0,06; 1-й месяц ≈0,7 виз/день; ≥2 виз/день — 9 нед (по полу 24); ≥5 — 15 нед по Ads (по полу не достигает); полный прогноз поз. 6 через ≈5,8 мес. Сначала пилот: страница дневника и через 4–6 недель сравнить показы GSC с Ads. Ряды выглядят странно: «amaliyot kundaligi» 260 (окт 25) → 60 500 (сен 26), а «…namuna» летом падает почти до нуля.

### 3. Obyektivka (ma’lumotnoma) — генератор и образец

- **Ключи (Ads/мес):**
  - UZ латиница: obyektivka namuna 2 400 (= obyektivka namunasi), ma'lumotnoma yozish 2 400 (скачок, пол 235), ma'lumotnoma namuna 1 600 (= ma'lumotnoma namunasi, malumotnoma namuna, ma lumotnoma namuna), obyektivka tayyorlash 1 300, obyektivka 1 000, obektivka 720, obektivka namuna 590, obyektivka namuna pdf 110, obyektivka namuna word 90, obyektivka shablon 70, obyektivka nima 70, obyektivka word 40, obyektivka yuklab olish 40
  - UZ кириллица: объективка 1 600 (= обьективка), объективка намуна 320 (= объективка намунаси), справка объективка 320, маълумотнома намуна 170, объективка образец 40
  - и ещё ключей по 10–90: 6 (полный список — `docs-career-data/dc_model.json`)
  - head (верхняя граница): ma'lumotnoma 1 900, malumotnoma 1 900, маълумотнома 260, ish joyidan ma'lumotnoma 720
  - исключено: obyektivka uz (навигация на сайт-конкурент)
- **Спрос:** 12 980 по Ads, пол 10 815, верхняя граница 15 860.
- **Сезонность:** пики: сен 26 ×1,8, апр 26 ×1,13, июн 26 ×1,08; минимум: ноя 25 ×0,75, дек 25 ×0,64.
- **SERP (mixed):** L3 (24.10), «obyektivka namuna»: r1 tez-hujjat.uz (генератор), r2 resum.uz (генератор, RU/UZ), r3 v1.obyektivka.uz (генератор), дальше slideshare .docx, tsuos.uz, urdu.uz, soff, obyektivkalar.uz, Scribd, Pinterest; AIO r6. Тип страницы задан: генератор. Топ-3 занят специализированными сервисами, реалистичная цель — поз. 4–8.
- **Что строить:** `/uz/hujjatlar/obyektivka-namuna/` — браузерный генератор (a): поля общепринятой формы (F.I.Sh., tug‘ilgan yili va joyi, ma’lumoti, mutaxassisligi, chet tillari, mehnat faoliyati, yaqin qarindoshlari jadvali), место под фото только локально, предпросмотр A4, печать/PDF/.docx, латиница и кириллица (запрос «объективка» — 1 600). Под формой — образец с плейсхолдерами и правила заполнения (c). Всё на клиенте, данные никуда не уходят.
- **Связь с живыми страницами:** /uz/blog/rezyume-tayyorlash/ (только раздел; «obyektivka namuna» уже в mustNotTarget у rezyume, C32).
- **Effort:** M. **Честность:** medium — Решение владельца O-05 (BACKLOG) ещё не принято. Честно только при совпадении с ходовой формой и с пометкой «сверьте с формой вашей организации». Персональные данные — только в браузере.
- **Визиты/день:** поз. 6 — 4,0–7,2 (пол 3,3–6,0); поз. 3 — 15,3 (пол 12,7); без AIO-дисконта — 23,3.
- **Разгон:** K1 = 0,06; 1-й месяц ≈0,3 виз/день; ≥2 виз/день — 14 нед (по полу 15); ≥5 — 24 нед по Ads (по полу не достигает); полный прогноз поз. 6 через ≈5,8 мес.

### 4. Конструктор CV/rezyume (UZ/RU/EN) + RU-страница «образец резюме» + «CV nima»

- **Ключи (Ads/мес):**
  - UZ латиница: cv nima 4 400 (скачок, пол 290), rezyume namunasi pdf 390, resume namuna 320
  - RU: резюме шаблон 2 900, резюме образец 880, резюме онлайн 480, шаблон резюме 320, создать резюме 320, резюме бланк 260, образец резюме 210, резюме на работу 210
  - EN: cv maker 1 600, resume maker 590, cv example 590, cv template 390, resume template 260, cv sample 140, resume builder 140
  - и ещё ключей по 10–90: 38 (полный список — `docs-career-data/dc_model.json`)
  - head (верхняя граница): cv 3 600, resume 1 600, резюме 2 900
  - уже у живой страницы: rezyume tayyorlash 1 900, rezyume namuna 1 600, rezyume 1 600, rezyume shablon 1 300, rezyume shabloni 1 300, resume tayyorlash 390, rezyume nima 320, cv tayyorlash 210, rezyume to'ldirish 140, cv namuna 170, cv namunasi 170, rezyume namunasi 1 600, rezyume yozish namunasi 1 600, rezume 880, rezume namuna 590
- **Спрос:** 16 280 по Ads, пол 12 170, верхняя граница 24 380.
- **Сезонность:** пики: апр 26 ×1,27, июл 26 ×1,16, май 26 ×1,14; минимум: ноя 25 ×0,74, дек 25 ×0,7.
- **SERP (mixed):** Снято 2026-10-25. «резюме шаблон»: Canva r1, myresume.ru, obrazecv.ru, superjob.uz, resum.uz (местный конструктор, обновлён 08.2026), pgu.ru, Pinterest; AIO r4 — смешанная/сильная. «cv nima»: AIO r1, дальше Cambridge Dictionary (TR), азербайджанские YouTube, Instagram и техноблог, сербский сайт — ни одной узбекской страницы в топ-10, очень слабая.
- **Что строить:** 1) `/uz/rezyume-yaratish/` — конструктор (a): форма → 2–3 строгих шаблона, подписи на UZ/RU/EN, печать в PDF, без регистрации, всё на клиенте; цели: cv maker, resume maker, rezyume yaratish, cv template/example, rezyume namunasi pdf. 2) `/ru/obrazets-rezyume/` — образец и шаблон резюме для Узбекистана, ссылка на конструктор (на RU-стороне такой страницы нет). 3) `/uz/blog/cv-nima/` — CV, rezyume и obyektivka: в чём разница. Новая пара в intent-manifest, чтобы конструктор не забирал ключи гайда.
- **Связь с живыми страницами:** /uz/blog/rezyume-tayyorlash/ (владеет rezyume tayyorlash/namuna, cv tayyorlash, cv namuna — не трогать).
- **Effort:** L. **Честность:** low — Не выдумывать опыт и навыки; AI-пресет только шлифует текст пользователя.
- **Визиты/день:** поз. 6 — 5,0–9,0 (пол 3,7–6,7); поз. 3 — 18,2 (пол 13,6); без AIO-дисконта — 29,2.
- **Разгон:** K1 = 0,04; 1-й месяц ≈0,3 виз/день; ≥2 виз/день — 15 нед (по полу 18); ≥5 — 27 нед (по полу 32); полный прогноз поз. 6 через ≈7,5 мес. «cv nima» на очень слабой выдаче разгонится быстрее, чем K1 для всего кластера.

### 5. Tilxat (расписка) и oddiy yozma ishonchnoma — образец + форма

- **Ключи (Ads/мес):**
  - UZ латиница: tilxat yozish 5 400 (скачок, пол 290), tilxat 1 000, tilxat namuna 1 000 (= tilxat namunasi), ishonchnoma 880, ishonchnoma namunasi 590 (= ishonchnoma namuna), tilxat nima 90, ishonchnoma nima 90, tilxat qanday yoziladi 50, ishonchnoma yozish 40, avtomobil ishonchnoma 10
  - UZ кириллица: тилхат 8 100 (скачок, пол 230), тилхат намуна 210, ишончнома 170, ишончнома намуна 90
  - RU: расписка 140, доверенность образец 70, расписка образец 50
  - head (верхняя граница): доверенность 1 900
- **Спрос:** 17 980 по Ads, пол 5 000, верхняя граница 19 880.
- **Сезонность:** пики: май 26 ×1,71, сен 26 ×1,68, апр 26 ×1,46; минимум: ноя 25 ×0,31, окт 25 ×0,26.
- **SERP (mixed):** Снято 2026-10-25. «tilxat yozish»: soff.uz (платно), kalki.uz (онлайн-генератор tilxat в Word/PDF — прямой конкурент), YouTube «Tilxat qonuniy kuchga egami?», arxiv.uz 2019, yurxizmat.uz, znanija (школьный вопрос про стиль ish qog‘ozlari); AIO r3 — слабая. «тилхат»: digital.gov.uz, uzbekistan.uz/advice, gov.uz (страницы без описания), глоссарий, словарь uzdic — смешанная.
- **Что строить:** `/uz/hujjatlar/tilxat-namuna/` — виды расписок (qarz, hujjat yoki pul qabul qilish, mehnat daftarchasini olish), обязательные реквизиты, образцы латиницей и кириллицей (кириллица — 8 100 по Ads), генератор. `/uz/hujjatlar/ishonchnoma-namuna/` — только простая письменная доверенность (получить зарплату или документы); для авто и недвижимости — прямой текст «нужен нотариус» и ссылка на gov.uz.
- **Effort:** S. **Честность:** medium — YMYL рядом: нейтральный шаблон, без обещаний «юридической силы», без советов по долговым спорам; не делать шаблоны доверенностей на авто и недвижимость.
- **Визиты/день:** поз. 6 — 5,5–9,9 (пол 1,5–2,8); поз. 3 — 21,2 (пол 5,9); без AIO-дисконта — 32,3.
- **Разгон:** K1 = 0,06; 1-й месяц ≈0,5 виз/день; ≥2 виз/день — 11 нед (по полу 25); ≥5 — 20 нед по Ads (по полу не достигает); полный прогноз поз. 6 через ≈5,8 мес. «tilxat yozish» и «тилхат» — со скачком; по полу кластер даёт ≈1,5–2,8 виз/день на поз. 6.

### 6. Tarjimai hol (avtobiografiya) — образец и бланк

- **Ключи (Ads/мес):**
  - UZ латиница: tarjimai hol 1 600 (= tarjimayi hol), tarjimai hol yozish 880, avtobiografiya 260, avtobiografiya namuna 210, tarjimai hol namunasi 210 (= tarjimai hol namuna), tarjimai hol blanka 170, tarjimai xol 70, avtobiografiya yozish 70, tarjimai hol nima 50
  - UZ кириллица: автобиография намуна 30, таржимаи ҳол 20, таржимаи ҳол намуна 20
  - RU: автобиография 1 300, автобиография образец 390, автобиография пример 30, автобиография бланк 30, автобиография образец на работу 30, как написать автобиографию 20
- **Спрос:** 5 390 по Ads.
- **Сезонность:** пики: фев 26 ×1,64, окт 25 ×1,42, янв 26 ×1,36; минимум: авг 26 ×0,54, июл 26 ×0,46.
- **SERP (weak):** Снято 2026-10-25. «tarjimai hol»: AIO r2; oriftolib.uz (стихотворение «Tarjimayi hol» — литература), урок YouTube «Davlat tilida ish yuritish», Scribd ×4 (бланки), askinfo.uz 2018. Почти всё — документное намерение. Слабая.
- **Что строить:** `/uz/hujjatlar/tarjimai-hol-namuna/`: что пишется и в каком порядке (поля «tarjimai hol blankasi»), два условных образца (talaba, xodim) с плейсхолдерами, кириллическая версия, тот же генератор, что у хаба; RU-блок «автобиография образец» (автобиография 1 300 и образец 390).
- **Effort:** S. **Честность:** low — Плейсхолдеры, без чужих биографий.
- **Визиты/день:** поз. 6 — 1,7–3,0; поз. 3 — 5,2; без AIO-дисконта — 9,7.
- **Разгон:** K1 = 0,06; 1-й месяц ≈0,1 виз/день; ≥2 виз/день — 23 нед; ≥5 — не достигает на поз. 6; полный прогноз поз. 6 через ≈5,8 мес.

### 7. Faxriy yorliq, maqtov yorlig‘i, tashakkurnoma, sertifikat — генератор бланков для печати

- **Ключи (Ads/мес):**
  - UZ латиница: faxriy yorliq 1 600, tashakkurnoma 1 300, faxriy yorliq namuna 880, faxriy yorliq shablon 720, tashakkurnoma shablon 720, maqtov yorlig'i 480, tashakkurnoma namunasi 260, sertifikat namuna 210, minnatdorchilik xati 90, rahmatnoma 20, sertifikat yaratish 10
  - UZ кириллица: фахрий ёрлиқ 70
  - RU: благодарственное письмо 90, благодарственное письмо образец 10
- **Спрос:** 6 460 по Ads.
- **Сезонность:** пики: май 26 ×3,08, дек 25 ×1,8, мар 26 ×1,11; минимум: авг 26 ×0,35, июл 26 ×0,31.
- **SERP (weak):** Снято 2026-10-25. «faxriy yorliq»: idum.uz (2024), YouTube «5 minutda… faxriy yorliq», Scribd, docx.uz, soff.uz, portfolio.uz, Pinterest, diplomishi.uz (платно); AIO r7. Только файлы и картинки, инструмента нет. Слабая.
- **Что строить:** `/uz/faxriy-yorliq-yaratish/` — инструмент (a): 4–6 наших CSS/SVG-рамок A4, пресеты текста (faxriy yorliq, maqtov yorlig‘i, tashakkurnoma, sertifikat, minnatdorchilik xati), поля «kimga / nima uchun / tashkilot / sana», печать и PDF; UZ-латиница, кириллица, RU («благодарственное письмо»). Генерации изображений нет — только вёрстка.
- **Effort:** M. **Честность:** low — Без госсимволики, гербов, печатей и «официальных» бланков ведомств.
- **Визиты/день:** поз. 6 — 2,0–3,6; поз. 3 — 7,6; без AIO-дисконта — 11,6.
- **Разгон:** K1 = 0,08; 1-й месяц ≈0,2 виз/день; ≥2 виз/день — 18 нед; ≥5 — не достигает на поз. 6; полный прогноз поз. 6 через ≈4,8 мес. Сезон: май ×3,1 и дек ×1,8 — в мае поз. 6 даёт ≈6–11 виз/день; запуск не позже марта.

### 8. Кириллица и RU для действующих гайдов: тушунтириш хати, ариза, тавсифнома + RU объяснительная, заявление, характеристика

- **Ключи (Ads/мес):**
  - UZ кириллица: тушунтириш хати 2 900 (скачок, пол 655), тавсифнома намуна 720 (= тавсиянома намуна), ариза 480, тушунтириш хати намуна 390, ариза намуна 390 (= ариза намунаси), тавсифнома 140, ариза ёзиш 110
  - RU: объяснительная 880, объяснительная в школу 390, объяснительная образец 320, заявление на увольнение 320, заявление на отпуск 260, характеристика образец 110, заявление образец 90, заявление на работу 90, заявление в школу 90, образец заявления 70, характеристика на ученика 70
  - и ещё ключей по 10–90: 12 (полный список — `docs-career-data/dc_model.json`)
  - head (верхняя граница): характеристика 2 400, заявление 720
  - уже у живой страницы: tushuntirish xati 1 600, tushuntirish xati namunasi 140, tushuntirish xati namuna 2 400, tushuntirish xati yozish 170, ariza yozish 2 900, ariza namunasi 590, ariza yozish namunasi 2 400, ariza yozish namuna 2 400, ariza namuna 1 300, ariza 4 400, ariza blanka 320, ariza qanday yoziladi 210, tavsifnoma namuna 1 600, tavsifnoma 720, o'quvchiga tavsifnoma 590, tavsifnoma namunasi word 320, tavsifnoma yozish namuna 260
- **Спрос:** 8 290 по Ads, пол 6 045, верхняя граница 11 410.
- **Сезонность:** пики: апр 26 ×1,32, сен 26 ×1,21, май 26 ×1,15; минимум: авг 26 ×0,83, дек 25 ×0,81.
- **SERP (mixed):** Не снят (лимит). Прокси: латинские версии этих же документов (tavsifnoma, dalolatnoma) — Scribd, Facebook, мелкие блоги.
- **Что строить:** (а) Полные кириллические блоки образцов прямо в HTML трёх действующих гайдов — S, сразу; «тушунтириш хати» по Ads 2 900 (скачок, пол 655), «тавсифнома намуна» 720. (б) RU-страницы `/ru/obrazets-obyasnitelnoy/`, `/ru/obrazets-zayavleniya/` (увольнение, отпуск, приём), `/ru/obrazets-harakteristiki/` — с пометкой, где в Узбекистане нужен документ на госязыке. Голые «характеристика» 2 400 и «заявление» 720 неоднозначны — в расчёт не входят.
- **Связь с живыми страницами:** /uz/blog/tushuntirish-xati-va-ariza-yozish/, /uz/blog/tavsifnoma-namuna/.
- **Effort:** M. **Честность:** low — Как у действующих гайдов: плейсхолдеры, «не юридическая консультация».
- **Визиты/день:** поз. 6 — 2,5–4,6 (пол 1,9–3,3); поз. 3 — 9,8 (пол 7,1); без AIO-дисконта — 14,9.
- **Разгон:** K1 = 0,04; 1-й месяц ≈0,1 виз/день; ≥2 виз/день — 23 нед (по полу 28); ≥5 — не достигает на поз. 6; полный прогноз поз. 6 через ≈7,5 мес.

### 9. Tavsiyanoma / recommendation letter (UZ/RU/EN)

- **Ключи (Ads/мес):**
  - UZ латиница: tavsiyanoma 880, tavsiyanoma namuna 390 (= tavsiyanoma namunasi), tavsiyanoma yozish 320, taqdimnoma 70, rekomendatsiya 20, tavsiya xati 10, tavsiya xati namuna 10, taqdimnoma namuna 10
  - UZ кириллица: тавсиянома 110
  - RU: рекомендательное письмо 170, рекомендательное письмо образец 40, рекомендательное письмо студенту 20
  - EN: recommendation letter 480 (= letter of recommendation), recommendation letter sample 320, reference letter 70, recommendation letter for student 40
- **Спрос:** 2 960 по Ads.
- **Сезонность:** пики: май 26 ×2,45, окт 25 ×1,16, апр 26 ×1,11; минимум: июл 26 ×0,48, авг 26 ×0,43.
- **SERP (mixed):** Не снят. Прокси «tavsifnoma namuna» (L3): oriftolib, Facebook, Scribd ×5, kursishlari, uzoffice — слабая; англ. запросы — вероятно глобальные сайты.
- **Что строить:** `/uz/hujjatlar/tavsiyanoma-namuna/`: для учёбы за рубежом и работы, структура, образец UZ и EN (recommendation letter sample), RU-блок, пресет чата «tavsiyanoma loyihasi» по фактам рекомендателя.
- **Связь с живыми страницами:** /uz/blog/tavsifnoma-namuna/ (объясняет отличие от tavsiyanoma; ключи tavsiyanoma не объявлены).
- **Effort:** S. **Честность:** low — Подписывает и отвечает рекомендатель; черновик только из его фактов.
- **Визиты/день:** поз. 6 — 0,9–1,6; поз. 3 — 3,5; без AIO-дисконта — 5,3.
- **Разгон:** K1 = 0,04; 1-й месяц ≈0,1 виз/день; ≥2 виз/день — не достигает на поз. 6; ≥5 — не достигает на поз. 6; полный прогноз поз. 6 через ≈7,5 мес. Пик май ×2,45.

### 10. Motivatsion xat, cover letter, personal statement

- **Ключи (Ads/мес):**
  - UZ латиница: motivatsion xat 50, motivatsion xat namunasi 30, motivatsion xat namuna 30
  - RU: сопроводительное письмо 260, мотивационное письмо 90, сопроводительное письмо к резюме 50, сопроводительное письмо пример 50
  - EN: motivation letter 480, motivation letter example 320 (= motivation letter sample), cover letter 320, cover letter example 210, personal statement example 170, personal statement 140, how to write a cover letter 110, motivation letter for university 70, cover letter sample 50, motivation letter for scholarship 40, how to write motivation letter 40
  - и ещё ключей по 10–90: 6 (полный список — `docs-career-data/dc_model.json`)
- **Спрос:** 2 630 по Ads.
- **Сезонность:** пики: дек 25 ×1,76, фев 26 ×1,44, янв 26 ×1,36; минимум: авг 26 ×0,62, июл 26 ×0,6.
- **SERP (mixed):** Не снят. Англоязычные ключи в UZ обычно занимают глобальные сайты (Indeed, Zety, Novoresume) — предположение, не проверено.
- **Что строить:** `/uz/blog/motivatsion-xat-namuna/` — структура мотивационного письма для вуза, гранта и работы, 2 образца с плейсхолдерами (UZ + EN), чек-лист; пресет чата «motivation letter from my facts».
- **Effort:** S. **Честность:** medium — Эссе на грант должно быть своим: AI — редактор, а не автор; прямо сказать на странице.
- **Визиты/день:** поз. 6 — 0,8–1,5; поз. 3 — 3,1; без AIO-дисконта — 4,7.
- **Разгон:** K1 = 0,04; 1-й месяц ≈0,1 виз/день; ≥2 виз/день — не достигает на поз. 6; ≥5 — не достигает на поз. 6; полный прогноз поз. 6 через ≈7,5 мес. Сезон подачи: дек–фев (×1,4–1,8).

### 11. Kasb tanlash testi + kasblar ro‘yxati

- **Ключи (Ads/мес):**
  - UZ латиница: kasblar ro'yxati 480, kelajak kasblari 480, kasb tanlash 210, kasb tanlash testi 170, eng yaxshi kasblar 110, eng ko'p maosh oladigan kasblar 30, kasb tanlash test 20
  - RU: тест на профориентацию 170, профориентация тест 90, тест на профессию 90, какая профессия мне подходит 20, профориентационный тест 10
  - EN: career test 30
  - head (верхняя граница): kasblar 1 300
- **Спрос:** 1 910 по Ads, верхняя граница 3 210.
- **Сезонность:** пики: апр 26 ×1,52, окт 25 ×1,51, ноя 25 ×1,36; минимум: июн 26 ×0,44, июл 26 ×0,39.
- **SERP (mixed):** Не снят. «kasblar» (1 300) неоднозначен — английская лексика для детей тоже (линза language-learning), в расчёт не входит.
- **Что строить:** `/uz/kasb-tanlash-testi/` — свой опросник интересов на 36–48 вопросов (модель типов интересов общедоступна, формулировки свои), результат → список профессий со ссылками; RU-зеркало `/ru/test-na-proforientatsiyu/`.
- **Effort:** M. **Честность:** low — Не психологическая диагностика — дисклеймер.
- **Визиты/день:** поз. 6 — 0,6–1,1; поз. 3 — 2,2; без AIO-дисконта — 3,4.
- **Разгон:** K1 = 0,06; 1-й месяц ≈0,1 виз/день; ≥2 виз/день — не достигает на поз. 6; ≥5 — не достигает на поз. 6; полный прогноз поз. 6 через ≈5,8 мес. Сезон окт–апр, летом ×0,4.

### 12. Shartnoma namunalari (mehnat, pudrat, oldi-sotdi, ijara) — HOLD

- **Ключи (Ads/мес):**
  - UZ латиница: ijara shartnomasi 2 400, mehnat shartnomasi 1 600, pudrat shartnomasi 880, shartnoma namunasi 390, oldi sotdi shartnomasi 320, mehnat shartnomasi namunasi 170 (= mehnat shartnomasi namuna), hadya shartnomasi 140, qarz shartnomasi 110, shartnoma namunalari 90, ijara shartnomasi namunasi 50, ijara shartnomasi namuna 50, shartnoma tuzish 50
  - UZ кириллица: ижара шартномаси 2 900
  - RU: трудовой договор 210, договор купли продажи 210, договор аренды 140, договор аренды квартиры 70, трудовой договор узбекистан 50
  - и ещё ключей по 10–90: 7 (полный список — `docs-career-data/dc_model.json`)
  - head (верхняя граница): shartnoma 8 100, договор 1 300, шартнома 260
- **Спрос:** 10 100 по Ads, верхняя граница 19 760.
- **Сезонность:** пики: сен 26 ×2,03, фев 26 ×1,16, апр 26 ×1,15; минимум: ноя 25 ×0,75, авг 26 ×0,67.
- **SERP (strong):** Снято 2026-10-25. «ijara shartnomasi»: ijara.soliq.uz (договоры аренды регистрируются на портале налоговой), gov.uz/advice, e-ijara.uz, yurxizmat.uz (шаблоны юристов), lex.uz, Википедия, jet.bank.uz; AIO r5. Госнавигация и юристы. Сильная. «shartnoma» 8 100 — всплески в авг–сен (до 33 100). Похоже на контракты на обучение в вузах; выдача не снята, это вывод по сезонности.
- **Что строить:** Не строить шаблоны договоров. Максимум — одна нейтральная статья «mehnat shartnomasi nima va unda nima bo‘ladi» со ссылками на официальные источники (lex.uz, gov.uz), без скачиваемого договора.
- **Effort:** M. **Честность:** high — Юридический YMYL: готовый договор без юриста может навредить.
- **Визиты/день:** поз. 6 — 3,1–5,6; поз. 3 — 11,9; без AIO-дисконта — 18,1.
- **Разгон:** K1 = 0,04; 1-й месяц ≈0,2 виз/день; ≥2 виз/день — 20 нед; ≥5 — не достигает на поз. 6; полный прогноз поз. 6 через ≈7,5 мес. HOLD.

## 5. Проверено и ниже порога (в топ-12 не вошло)

| Кластер | Спрос Ads (core) | Верхняя граница | Поз. ~3, виз/день | Почему ниже |
|---|---:|---:|---:|---|
| Tijorat taklifi / коммерческое предложение | 1 360 | 5 350 | 1,6 | «biznes taklif» 3 600 — смысл не проверен (возможно, бизнес-идеи; CPC 9,41); счета-фактуры в Узбекистане выписываются в электронной системе, шаблон не нужен |
| Ish suhbati / собеседование | 780 | 1 660 | 0,9 | узбекские «ish suhbati savollari», «ishga kirish suhbati» — 0; «intervyu» 880 неоднозначен (вероятно, интервью в СМИ; не проверено) |
| Taklifnoma matni (rasmiy taklifnoma) | 190 | 3 090 | 0,2 | «taklifnoma» 2 900 — конструкторы свадебных приглашений (mytaklif, taklifiy, e-taklif) и Pinterest; текстовая часть мала |
| Staj / oylik kalkulyatori | 760 | 760 | 0,9 | стаж и зарплата — 760 в сумме; налоговые расчёты близки к YMYL |
| Buyruq / приказ / lavozim yo‘riqnomasi | 1 690 | 2 690 | 2,0 | buyruq 720, приказ 210; кадровые приказы — для кадровиков, мелко |

Нулевой спрос (Ads 0 или пусто): все узбекские варианты «ishdan bo‘shash uchun ariza», «ta’til uchun ariza», «ishga kirish uchun ariza», «ish suhbati savollari», «motivatsion xat yozish», «el yurt umidi motivatsion xat», «cv ingliz tilida», «ingliz tilida rezyume», «obyektivka shakli/blanka/2026», «davlat tilida ish yuritish», «ish qog‘ozlari namunalari», «obyektivka generator», «rezyume generator», «kasbga yo‘naltirish test». Полный список — `docs-career-data/dc_kw1_table.txt` (156 нулевых в первом вызове) и `dc_kw2_metrics.json` (28 пустых во втором).

## 6. Порядок запуска

1. **Недели 1–3.** Хаб `/uz/hujjatlar/` + общий генератор + 4 страницы на слабых выдачах: bildirishnoma, dalolatnoma, bayonnoma, tilxat. Плюс кириллические блоки в трёх живых гайдах и объявление недостающих вариантов ключей (§0 п. 6) в intent-manifest и demand-policy.
2. **Недели 3–5.** Пилот `/uz/hujjatlar/amaliyot-kundaligi/` (проверка аномалии §2), tarjimai hol, kafolat xati, raport, e’lon.
3. **Недели 5–8.** Генератор obyektivka (после решения O-05) и бланки грамот (успеть к маю).
4. **Дальше.** Конструктор CV + RU «образец резюме» + «CV nima»; RU-страницы объяснительной, заявления, характеристики; tavsiyanoma, motivatsion xat, kasb tanlash testi.
5. **Не делать:** шаблоны договоров и доверенностей на авто/недвижимость.

Через 6–8 недель — сверка показов GSC с Ads по ключам со скачком. Если подтверждается «пол», линза даёт ≈27–48 визитов в день на поз. 6 и ≈101 в топ-3.
