# Журнал изменений для замеров — ноябрь 2026

Что и когда менялось на страницах gptbot.uz в ноябре 2026. Правила те же, что в `CHANGE_LOG_2026-10.md`: одно изменение на URL за окно наблюдения; эффект правки отсчитывается от `lastCrawlTime` конкретного URL (URL Inspection), а не от даты выкладки; несколько одновременных правок на одном URL читаются как одна связка.

Более ранние ноябрьские релизы (06.11, 07.11, 08.11 — pSEO-20, 09.11 — marketing-gap, 13.11 — target CRO, 14.11 — исправление потоков чата) описаны в своих отчётах в `reports/` и в `docs/agents-platform/STATE.json`. Этот файл начинается с релиза 16.11.

## SEO growth — ревизия `2026-11-16-seo-growth` (16.11.2026)

**Основание.** Поручение владельца в чате 16.11.2026 после аудита слепых зон: реализовать улучшения по SEO автономно и под ключ. Аудит, roadmap и доказательства лежат вне репозитория: `delivery/gptbot-seo-blindspots-20261116/` (AUDIT.md, ROADMAP-90D.md, MEASUREMENT.md, evidence/). Исследование спроса для этого релиза: `delivery/gptbot-seo-growth-20261116/research/` (OpenSEO, рынок 2860, 16.11.2026: 1 293 ключа с объёмами, 70 мобильных выдач).

**Главная мысль релиза.** Аудит показал, что 97,6 % видимых кликов Google — запросы с названием ChatGPT, а 250 страниц про ботов и маркетинг дают 3,3 % кликов. Релиз не трогает страницы, которые несут трафик, и добавляет формат «образец + файл» и готовые тексты там, где узбекская выдача слабая (scribd, soff.uz, словари, иноязычные результаты).

### Что сознательно не менялось

- Десять защищённых страниц (`scripts/seo-protection.ts`): оба чата, гайд скачивания, гайд входа и остальные — title, description, H1, canonical, hreflang, ссылки и текст побайтово в рамках прежнего контракта. Единственное исключение — списки на главной (см. ниже).
- Наблюдения R14 и R15 (до 21.12.2026): `/uz/blog/chatgptga-qanday-kirish-mumkin/`, title/description `/ru/gpt-chat/` и `/uz/gpt-uzbek-tilida/`.
- Оплата, боты, webhooks, рекламные пиксели, CSP, бюджет веса чата, структура URL и canonical.
- Когорты pSEO-20 и marketing-gap не расширялись: новые образцы — обычные статьи с блоками скачивания, без `PSEO_DOCUMENT_SLUGS`.

### Новые URL (10)

Объёмы — Google Ads через OpenSEO, сгруппированы, не суммируются и не являются прогнозом трафика. Выдача — один мобильный снимок 16.11.

| URL | Главный запрос и объём в месяц | Что было в выдаче | Формат |
|---|---|---|---|
| `/uz/blog/dars-tahlili-namuna/` | dars tahlili namuna 5 400; dars tahlili 18 100; dars tahlili daftari 9 900 | scribd, ilmiybaza, soff; чистого бланка с файлом нет | бланк, заполненный пример, страница журнала; DOCX/PDF |
| `/uz/blog/tilxat-namuna/` | tilxat namuna 1 000; tilxat yozish 6 600; «тилхат образец» 14 800 | общие советы, словари | два образца, блок кириллицей; DOCX/PDF |
| `/uz/blog/hisobot-namuna/` | hisobot namuna 2 900; hisobot yozish 6 600 | нерелевантно (правописание, бухотчётность) | недельный и месячный отчёт; DOCX/PDF |
| `/uz/blog/kafolat-xati-namuna/` | kafolat xati 1 300; kafolat xati namuna 720 | нерелевантно | оплата и приём на работу; DOCX/PDF |
| `/uz/blog/esse-yozish-tartibi/` | esse yozish tartibi 3 600; esse 4 400; esse namuna 2 900 | иноязычные результаты | структура, 7 шагов, 3 полных образца, темы |
| `/uz/blog/murakkab-reja-namuna/` | murakkab reja 4 400; insho rejasi 2 400 | у нас уже позиция 7,8 и 99 показов за 90 дней на общей статье про иншо | 14 готовых планов |
| `/uz/blog/yangi-yil-tabriklari/` | yangi yil tabriklari 1 600 + 1 300 + 1 300 | pinterest | 51 текст по адресатам, блок кириллицей; пик спроса в декабре |
| `/uz/blog/tugilgan-kun-tabriklari/` | tug‘ilgan kun tabriklari 6 600; кириллицей 8 100 | pinterest, сборники | 57 текстов по адресатам, блок кириллицей |
| `/ru/blog/kak-skachat-chatgpt-v-uzbekistane/` | «chatgpt скачать» 22 200; в собственном GSC 3 491 показ за 28 дней по кириллическим запросам «скачать / приложение / программа» | локального гайда нет; запросы попадали на `/ru/gpt-chat/` с CTR 0,77 % | гайд: официальные источники, признаки поддельного APK, вариант без установки |
| `/uz/hujjat-namunalari/` | собственного спроса почти нет (≈30) | — | хаб: 20 образцов по четырём группам |

Все образцы учебные: условные имена, пометка об учебном характере, без ссылок на непроверенные нормы. Узбекский текст писал не носитель языка — см. раздел «Что проверить человеку».

### Существующие страницы с изменениями (33) и их baseline

GSC, final, web, 18.10–14.11.2026 (28 дней). «Последний обход» — URL Inspection 16.11.2026. Колонка «Ссылки» — добавлено/убрано внутренних ссылок в HTML.

| URL | Клики | Показы | Позиция | Последний обход | Ссылки | Метаданные |
|---|---:|---:|---:|---|---|---|
| `/ru/gpt-vs-chatgpt-sravnenie/` | 23 | 6036 | 6,8 | 2026-11-11 | +1 / −0 | — |
| `/ru/russko-uzbekskiy-perevodchik/` | 9 | 1486 | 8,8 | 2026-11-06 | +0 / −0 | — |
| `/uz/blog/referat-va-mustaqil-ish/` | 17 | 465 | 6,2 | 2026-11-13 | +3 / −0 | — |
| `/uz/blog/tabrik-yozish/` | 1 | 339 | 5,7 | 2026-11-09 | +2 / −0 | title, description |
| `/ru/chto-takoe-gpt-i-kak-polzovatsya/` | 0 | 318 | 7,8 | 2026-10-25 | +1 / −0 | — |
| `/` | 20 | 301 | 7,4 | 2026-11-16 | +10 / −0 | — |
| `/ru/gde-polzovatsya-gpt-besplatno/` | 10 | 279 | 8,3 | 2026-11-14 | +1 / −0 | — |
| `/uz/blog/insho-yozish-suniy-intellekt-bilan/` | 2 | 279 | 6,2 | 2026-11-05 | +2 / −0 | title, h1, description |
| `/uz/blog/tushuntirish-xati-va-ariza-yozish/` | 5 | 277 | 6,3 | 2026-11-07 | +7 / −0 | — |
| `/uz/blog/kurs-ishi-yozish/` | 7 | 197 | 7,9 | 2026-11-15 | +3 / −0 | — |
| `/uz/blog/chatgpt-talabalar-uchun/` | 1 | 174 | 6,4 | 2026-11-15 | +2 / −0 | — |
| `/uz/blog/rasmiy-xat-yozish/` | 1 | 142 | 5,7 | 2026-11-06 | +2 / −0 | — |
| `/uz/suniy-intellekt/` | 0 | 72 | 8,9 | 2026-11-06 | +2 / −1 | — |
| `/uz/blog/bildirishnoma-namuna/` | 1 | 64 | 8,5 | 2026-11-09 | +4 / −0 | title, h1, description |
| `/uz/blog/tavsifnoma-namuna/` | 0 | 61 | 7,9 | 2026-11-07 | +1 / −0 | — |
| `/ru/gpt-na-russkom/` | 0 | 44 | 5,7 | 2026-10-31 | +1 / −0 | — |
| `/ru/blog/analogi-chatgpt-kotorye-rabotayut-v-uzbekistane/` | 0 | 43 | 4,9 | 2026-11-08 | +1 / −0 | — |
| `/uz/blog/rezyume-tayyorlash/` | 0 | 42 | 9,0 | 2026-11-07 | +1 / −0 | — |
| `/uz/onlayn-testlar/` | 2 | 41 | 5,7 | 2026-10-27 | +10 / −0 | — |
| `/uz/` | 3 | 38 | 6,2 | 2026-11-05 | +6 / −0 | — |
| `/uz/blog/bayonnoma-namuna/` | 2 | 33 | 7,0 | 2026-11-09 | +1 / −0 | — |
| `/uz/blog/dalolatnoma-namuna/` | 4 | 31 | 8,3 | 2026-11-09 | +1 / −0 | — |
| `/uz/ai-tabrik-generatori/` | 3 | 26 | 4,3 | 2026-11-10 | +2 / −0 | — |
| `/uz/blog/tavsiyanoma-namuna/` | 1 | 19 | 7,5 | 2026-11-09 | +1 / −0 | — |
| `/ru/blog/` | 0 | 15 | 39,3 | 2026-11-14 | +1 / −0 | — |
| `/uz/blog/javob-xati-namuna/` | 1 | 14 | 5,1 | 2026-11-09 | +1 / −0 | — |
| `/uz/blog/tarjimai-hol-namuna/` | 0 | 10 | 9,6 | 2026-11-09 | +1 / −0 | — |
| `/uz/blog/amaliyot-kundaligi-namuna/` | 0 | 9 | 7,9 | 2026-11-09 | +2 / −0 | description |
| `/uz/ai-sher-yozish/` | 0 | 7 | 8,4 | 2026-10-27 | +2 / −0 | — |
| `/uz/blog/motivatsion-xat-namuna/` | 1 | 7 | 7,1 | 2026-11-09 | +1 / −0 | — |
| `/uz/blog/amaliyot-hisoboti-namuna/` | 0 | 6 | 5,3 | 2026-11-09 | +1 / −0 | — |
| `/uz/blog/obyektivka-namuna/` | 0 | 2 | 2,5 | 2026-11-09 | +1 / −0 | — |
| `/uz/blog/` | 0 | 0 | — | 2026-11-13 | +8 / −0 | — |

В сумме на изменённые существующие страницы приходилось 114 кликов и 10 877 показов за 28 дней — 5,7 % кликов сайта. Страницы-лидеры не затронуты.

Что именно изменено:

- **Файлы-образцы в трёх учебных гайдах** — `/uz/blog/tushuntirish-xati-va-ariza-yozish/` (объяснительная и набор из четырёх заявлений), `/uz/blog/kurs-ishi-yozish/`, `/uz/blog/referat-va-mustaqil-ish/`: блок скачивания DOCX/PDF после вступления и короткий раздел «как заполнить». Title, H1, description не менялись.
- **`/uz/blog/bildirishnoma-namuna/`** — title, H1, description теперь начинаются с «Bildirgi (bildirishnoma)»: в обиходе это один и тот же документ, а Google уже показывал эту страницу по «bildirgi namuna pdf» (34 показа, позиция 9,1), хотя слова на странице не было. Добавлены второй пример, реквизиты, второй файл. Отдельная страница под «bildirgi» не создавалась.
- **`/uz/blog/amaliyot-kundaligi-namuna/`** — раздел о педагогической практике и заметка для заочной формы; description дополнен, title прежний. Голова «amaliyot kundaligi» — 22 200, в выдаче четыре результата.
- **`/uz/blog/insho-yozish-suniy-intellekt-bilan/`** и **`/uz/blog/tabrik-yozish/`** — сборные статьи отдали головы новым страницам (эссе, сложный план, поздравления) и остались как «как писать». Title и description изменены под новую роль.
- **`/ru/russko-uzbekskiy-perevodchik/`** — блок «Перевод кириллицей» с тремя примерами и вопрос в FAQ; title/H1/description прежние. Запрос «переводчик с русского на узбекский кириллица»: 282 показа, позиция 9,9, 0 кликов за 28 дней.
- **`/uz/onlayn-testlar/`** — ссылки на семь учебных страниц, которые были на глубине 3–4 клика, и на эссе, планы и хаб документов.
- **`/uz/`** — блок ссылок на тесты, переводчик, кирилл-лотин, калькулятор, презентации и хаб документов.
- **Десять когортных образцов** — одна строка со ссылкой на хаб в блоке скачивания (шаблон `scripts/pseo-documents.ts`).
- Остальные — по одной-две контекстные ссылки на новые страницы.

### Владение интентами (`content/seo/intent-manifest.json`, 101 → 113 пар)

- C30, C51, C54, C55 обновлены; добавлены C88–C95: эссе и сложный план отделены от гайда про иншо, коллекции поздравлений — от гайда «tabrik yozish» и от генератора.
- C96, C97: русский гайд скачивания против `/ru/gpt-chat/` и против узбекского гайда скачивания (без hreflang-пары, решение A11).
- `PSEO20-bildirishnoma-namuna`: страница владеет и «bildirgi»-запросами.
- `DOCS20261116-hisobot-namuna`, `DOCS20261116-kafolat-xati-namuna`.
- Списки `mustNotTarget` защищённых чатов не ослаблялись.

### Код

- `scripts/lead-form.ts` — свои подсказки в поле задачи для таргета, SMM, Telegram Ads, контекста, сайтов и аудита (раньше везде был сценарий чат-бота); события `lead_form_view` и `lead_form_start` на всех формах, без значений полей. До этого события были только на `/uz/instagram-target-yoqish/`.
- `functions/lib/gpt-chat/prompt.ts` — узбекская кириллица в ответе допускается по прямой просьбе пользователя. Раньше системная инструкция запрещала кириллицу совсем, хотя форма переводчика предлагает «Кириллица».
- `src/shared/content-downloads.ts`, `public/_headers`, `scripts/generate-robots.ts` — 18 новых файлов в `/downloads/docs-20261116/`, `noindex` для каталога; генератор `scripts/docs-document-templates-20261116.py` (`--check`).
- `scripts/pseo-documents.ts` — ссылка на хаб в блоке скачивания.

### Защищённая главная

Оболочка главной перечисляет опубликованные страницы и статьи, поэтому она меняется при любом новом URL. Ревизия `docs/seo/evidence/2026-11-16-seo-growth/reviewed-protected-pages.json` записана после доказательства (`reports/seo-growth-20261116/review.ts`, сборка против сборки production `da97b1f5`): добавлены ссылки на 10 новых URL, у трёх существующих пунктов сменилась подпись (bildirgi, insho, tabrik), ни одна ссылка не убрана; обратная замена ровно этих пунктов восстанавливает прежний контракт. Остальные девять защищённых страниц — без изменений контракта.

### Как читать эффект

- **Baseline** — таблица выше и `delivery/gptbot-seo-blindspots-20261116/MEASUREMENT.md`.
- **Новые URL:** сначала индексация (URL Inspection), потом показы. Первое чтение — через 14 дней после подтверждённого обхода каждого URL, содержательное — через 28. Объёмы Ads не прогноз: недельные когортные страницы при слабой выдаче ещё не в топе.
- **Гайды с файлами (эксперимент E-3 из MEASUREMENT.md):** клики и CTR при сопоставимой позиции против учебных гайдов без правок; окно — 28 дней после переобхода страницы.
- **Сторожевой показатель:** когорта «chatgpt uzbekcha / uzbek tilida» на `/uz/gpt-uzbek-tilida/` — 17,9 клика в день на позиции 4,3 (08–14.11). Этот релиз чат-страницы не меняет; падение когорты нужно искать в другом месте.
- **Чего не утверждать:** рост 09–14.11 (+63 % кликов) произошёл до этого релиза; наблюдения R14/R15 читаются 21.12 и к этому релизу не относятся.
- **Новогодние поздравления:** сезонный пик в декабре; сравнивать с январём нельзя.

### Поправки к аудиту, найденные при внедрении

- **`lastmod`:** из 58 незащищённых страниц с заниженной датой Google уже переобошёл 54 после фактического изменения; оставшиеся четыре — страницы о ботах без спроса. Даты не правились.
- **`/uz/tariflar/`:** внутренние ссылки «AI chat tariflari» ведут на якорь `#ai-paket` (`chatPricingPath`), а не на начало страницы Studio. Перестройка страницы снята.
- **Файлы у гайдов:** у `rezyume-tayyorlash`, `rasmiy-xat-yozish`, `tavsifnoma-namuna` файлы были с 06.11.
- **«Bildirgi»:** это не отдельный документ, а обиходное название той же докладной.

### Не сделано и почему

- Блок ссылок на инструменты на двух чат-страницах и переход в чат на гайде скачивания — защищённые страницы, после 21.12.
- Схема пробы (3 ответа), незавершённые оплаты, пиксели, Вебвизор — решения владельца, не SEO-правки.
- Гайды про Gemini и Gamma — нужны проверенные факты о чужих продуктах.
- Новые тесты и IQ-тест — существующие тестовые страницы не получают показов.
- Доверенности, договоры, приказы — государственные порталы в выдаче и юридический риск.
- Rank tracker OpenSEO — один прогон до 4 650 кредитов; позиции читаются из Search Console.

### Что проверить человеку

- Носителю узбекского: терминология bildirgi / bildirishnoma / raport; форма анализа урока и журнала; формулы гарантийного письма и четырёх заявлений; тон и обращения в 108 поздравлениях; 18 кириллических текстов; три образца эссе и 14 планов.
- Числа в title (3 образца, 14 планов, 51 и 57 поздравлений) держать в синхроне с содержимым при правках.
- Живой ответ переводчика с выбором «Кириллица» после выкладки.

### После выкладки: обнаружение и синхронизация (16.11.2026, UTC)

Поручение владельца в чате 16.11: отправить изменения в `main` и сделать всё возможное, чтобы Google увидел их быстрее. Запрет на повторные отправки из прежнего плана наблюдения этим поручением снят только для данного релиза.

| Время | Действие | Результат |
|---|---|---|
| 17:04 | Выкладка `c907a6c4`, WebSub для трёх лент | ленты приняты (204); Google скачал их в 17:04–17:07 |
| 17:20 | IndexNow: 24 новых и изменённых URL | api.indexnow.org 200, Яндекс 202 |
| 17:20 | URL Inspection, 10 новых URL | 2 «Discovered», 8 неизвестны |
| 18:10 | `sitemap.xml` и `sitemap-updates.xml` поданы повторно через Search Console API | скачаны в 18:10:59 и 18:11:00, ошибок 0 |
| 18:15 | URL Inspection, 10 новых URL | 7 «Discovered — currently not indexed», 3 ещё неизвестны |
| 18:10 | `main` на GitHub перемотан вперёд от `7568f273` до линии релиза | история не переписывалась |

Не сделано: «Запросить индексирование» в интерфейсе Search Console — нужен вход владельца в Google; через API такого действия нет, а Indexing API предназначен только для вакансий и трансляций. Отсчёт эффекта по-прежнему ведётся от `lastCrawlTime` каждого URL.

Проверки GitHub на `main` после отправки: `secret-scan` — успешно (шесть тестовых заглушек помечены как заглушки); `Typecheck` падал из-за отсутствия зависимостей Studio в workflow (`pptxgenjs`), шаг установки добавлен; `Silent catch audit` и `Lead Radar release gate` падают на коде, написанном до этого релиза (шесть «тихих» catch в `functions/api/`: lead-radar, gpt auth, billing maintenance, model probe, studio identity) — не исправлялось, это код других продуктов.

## Релиз 17.11.2026: все волны roadmap

Поручение владельца в чате 17.11.2026: реализовать все волны roadmap (`delivery/gptbot-growth-roadmap-20261117/ROADMAP-RU.md`) сразу и выложить. Правило «одна правка на URL до конца окна наблюдения» для страниц когорт 25.10, 08.11 и 16.11 этим поручением сознательно прервано: правки ниже аддитивные, базовые значения записаны. Заморозка заголовков `/ru/gpt-chat/`, `/uz/gpt-uzbek-tilida/` и гайда по входу до 21.12.2026 сохранена: эти страницы не менялись.

Новых URL: 52. Изменённых существующих страниц: 11. Файлов для скачивания: 45 (`/downloads/docs-20261117/`). Пар в intent-manifest: 113 → 126.

### Изменённые существующие страницы и их база (Search Console, 28 дней до 14.11.2026: клики / показы / позиция)

| URL | База | Что изменилось в метаданных |
|---|---|---|
| `/uz/blog/amaliyot-kundaligi-namuna/` | 0 / 9 / 7.9 | title, H1 и description не менялись |
| `/uz/blog/bayonnoma-namuna/` | 2 / 33 / 7.0 | title, H1 и description не менялись |
| `/uz/blog/slayd-tayyorlash/` | нет показов в окне | description |
| `/uz/blog/tugilgan-kun-tabriklari/` | нет показов в окне | title, H1 и description не менялись |
| `/uz/blog/tushuntirish-xati-va-ariza-yozish/` | 5 / 277 / 6.3 | title, H1 и description не менялись |
| `/ru/kalkulyator/` | 3 / 101 / 7.9 | title, H1 и description не менялись |
| `/uz/ai-sher-yozish/` | 0 / 7 / 8.4 | title, description |
| `/uz/` | 3 / 38 / 6.2 | title, H1 и description не менялись |
| `/uz/hujjat-namunalari/` | нет показов в окне | title, H1 и description не менялись |
| `/uz/present-simple/` | 0 / 14 / 7.2 | description |
| `/uz/suniy-intellekt/` | 0 / 72 / 8.9 | title, h1, description |

### Новые URL

- `/ru/blog/claude-ai-v-uzbekistane-kak-polzovatsya/` — Клауд и Клод (Claude AI) в Узбекистане: как начать
- `/ru/blog/gamma-app-kak-sdelat-prezentaciyu/` — Гамма апп (Gamma App): как сделать презентацию с ИИ
- `/ru/blog/gemini-v-uzbekistane-kak-polzovatsya-i-skachat/` — Гемини (Gemini): как пользоваться и скачать | GPTBot.uz
- `/ru/blog/obektivka-obrazec/` — Объективка (маълумотнома): образец и бланк Word | GPTBot.uz
- `/ru/summa-propisyu/` — Сумма прописью в сумах: правила, таблицы и 30 примеров
- `/uz/ai-xizmatlar/` — AI xizmatlar: chat, slayd, rasm va video bo‘yicha katalog
- `/uz/blog/14-yanvar-tabriklari/` — 14-yanvar tabriklari: 36 ta tayyor tabrik va 10 ta she’r
- `/uz/blog/8-mart-sherlari/` — 8-mart uchun she’rlar: onaga, buviga, ustozga 36 ta she’r
- `/uz/blog/8-mart-tabriklari/` — 8-mart tabriklari: 40 ta tayyor tabrik, 20 tasi kirillda
- `/uz/blog/ayol-kishiga-tugilgan-kun-tabrigi/` — Ayol kishiga tug‘ilgan kun tabrigi: 48 ta tayyor matn
- `/uz/blog/chatgpt-5-nima/` — ChatGPT 5 nima: GPT-4, GPT-4o va GPT-5 farqi, 2026
- `/uz/blog/chatgptdan-qanday-foydalanish/` — ChatGPT’dan foydalanish: 10 qadam va 15 ta tayyor so‘rov
- `/uz/blog/claude-ai-ozbekistonda/` — Claude AI O‘zbekistonda: kirish va bepul reja | GPTBot.uz
- `/uz/blog/cv-nima/` — CV nima va CV yozish: namuna Word va PDF | GPTBot.uz
- `/uz/blog/deepseek-ozbek-tilida/` — DeepSeek o‘zbek tilida: rasmiy sayt, ilova va maxfiylik
- `/uz/blog/erkak-kishiga-tugilgan-kun-tabrigi/` — Erkak kishiga tug‘ilgan kun tabrigi: 48 ta tayyor matn
- `/uz/blog/faxriy-yorliq-matni/` — Faxriy yorliq matni: 32 ta tayyor namuna, Word/PDF
- `/uz/blog/gamma-app-slayd-tayyorlash/` — Gamma app: slayd tayyorlash qadamlari va eksport | GPTBot.uz
- `/uz/blog/gemini-ai-ozbek-tilida/` — Gemini AI o‘zbek tilida: kirish, ilova va rasm | GPTBot.uz
- `/uz/blog/google-flow-veo-qollanma/` — Google Flow va Veo 3: qo‘llanma, bepul kreditlar | GPTBot.uz
- `/uz/blog/hayit-tabriklari/` — Hayit muborak: 40 ta tabrik, Ramazon va Qurbon hayiti
- `/uz/blog/higgsfield-ai-nima/` — Higgsfield AI nima: bepul reja, video va promptlar | GPTBot.uz
- `/uz/blog/hikmatli-sozlar/` — Ma’noli gaplar va hikmatli so‘zlar: 100 ta qisqa matn
- `/uz/blog/ingliz-tilida-dialoglar/` — Dialog ingliz tilida: tarjimasi bilan 36 ta tayyor dialog
- `/uz/blog/inglizcha-statuslar/` — Inglizcha statuslar tarjimasi bilan: 100 ta qisqa gap
- `/uz/blog/konstitutsiya-haqida-sherlar/` — Konstitutsiya haqida she’rlar: 30 ta she’r va 10 ta tabrik
- `/uz/blog/logo-yasash/` — Logo yasash: 5 qadam va 12 ta AI so‘rov | GPTBot.uz
- `/uz/blog/mantiqiy-savollar/` — Mantiqiy savollar javobi bilan: 120 ta qiziqarli savol
- `/uz/blog/maqollar/` — Maqollar: 300 ta o‘zbek xalq maqoli mavzular bo‘yicha
- `/uz/blog/navroz-haqida-sherlar/` — Navroz haqida sher: 30 ta original she’r va 12 ta tabrik
- `/uz/blog/notebooklm-qollanma/` — NotebookLM (Gemini Notebook): talabaga qo‘llanma | GPTBot.uz
- `/uz/blog/psixologik-tavsifnoma-namuna/` — Psixologik tavsifnoma namuna: o‘quvchi va sinfga | GPTBot.uz
- `/uz/blog/sevgi-haqida-sherlar/` — Sevgi haqida she’rlar: 30 ta she’r va 20 ta sevgi so‘zi
- `/uz/blog/slayd-uchun-fonlar/` — Slayd uchun fon: 24 ta bepul fon, JPG va PPTX | GPTBot.uz
- `/uz/blog/taqriz-namuna/` — Taqriz namuna: dars ishlanma, maqola va BMIga | GPTBot.uz
- `/uz/blog/tezis-namuna/` — Tezis namuna: konferensiya uchun Word va PDF | GPTBot.uz
- `/uz/blog/topishmoqlar/` — Topishmoqlar javobi bilan: 200 ta qiziqarli topishmoq
- `/uz/blog/yangi-yil-sherlari/` — Yangi yil she’rlari: Qorbobo, archa va qish haqida 40 ta she’r
- `/uz/blog/zakovat-savollari/` — Zakovat savollari javoblari bilan: 100 ta savol va izoh
- `/uz/ekub-ekuk/` — EKUB va EKUK topish: 2 usul, 12 misol va 15 ta mashq
- `/uz/kalendar-2027/` — Kalendar 2027: bayram va dam olish kunlari, hafta raqamlari
- `/uz/matn-tuzish/` — Matn tuzish: 24 ta tayyor matn (kuz, Vatan, oila, maktab)
- `/uz/mendeleyev-jadvali/` — Mendeleyev jadvali: 118 element, davr, guruh va PDF
- `/uz/mental-arifmetika-misollar/` — Mental arifmetika misollar: 12 usul va 100 ta mashq
- `/uz/nik-yasash/` — Nik yasash: 14 xil chiroyli harf va 60 ta tayyor nik
- `/uz/ona-tili-test/` — Ona tili testlar: 80 ta savol, javoblar va PDF (5–9-sinf)
- `/uz/qisqa-kopaytirish-formulalari/` — Qisqa ko‘paytirish formulalari: 7 formula, 20 misol va mashq
- `/uz/rim-raqamlari/` — Rim raqamlari jadvali: 1 dan 100 gacha va 1000 gacha, qoidalar
- `/uz/sintaktik-tahlil/` — Sintaktik tahlil: tartibi, jadval va 20 ta tahlil qilingan gap
- `/uz/taklifnoma-yasash/` — Taklifnoma yasash: 24 ta tayyor matn va AI yordamchi
- `/uz/tenglamalar-sistemasi/` — Tenglamalar sistemasi: yechish usullari, 12 misol va mashqlar
- `/uz/tub-sonlar/` — Tub sonlar jadvali: 1 dan 100 va 1000 gacha, mashqlar

Отсчёт эффекта — от `lastCrawlTime` каждого URL; правило проверки показами описано в roadmap, раздел 6. Тексты на узбекском написаны без вычитки носителем языка; часть страниц написана моделью Sonnet после исчерпания лимита основной модели.

## Релиз 17.11.2026: AI-пакет на 3 дня в продаже, оферта ai-paket-2026-11-v6

Поручение владельца в чате 17.11.2026: второй пакет AI-чата, 5 000 сум за 30 ответов на 3 дня. Текст оферты владелец прочитал и согласовал в чате 17.11.2026, без проверки юристом (так же согласованы редакции от 07.10.2026).

Новых URL нет. Изменены четыре существующие страницы. Ни одна защищённая страница и ни одна страница под наблюдением до 21.12.2026 не менялась; title и H1 всех четырёх страниц прежние.

| URL | Что изменилось |
|---|---|
| `/ru/oferta/` | Редакция `ai-paket-2026-11-v6` от 17.11.2026. Разделы 1, 3 и 5 описывают два пакета: на месяц (20 000 сум, 300 ответов) и на 3 дня (5 000 сум, 30 ответов, 72 часа), у каждого своя цена, НДС, срок и название в чеке. Description называет оба пакета (164 → 157 знаков). |
| `/uz/oferta/` | То же на узбекском. Description называет оба пакета (159 → 154 знака). |
| `/ru/tarify-ai-chat/` | В таблице сравнения отдельные колонки «AI-пакет на 3 дня» и «AI-пакет на месяц», новая строка «Цена одного ответа» (около 167 и около 67 сум), абзац о пакете на 3 дня, пункты в «Что выбрать» и «Коротко о главном», новый вопрос в FAQ. Description и подзаголовок называют оба пакета. |
| `/uz/tariflar/` | Раздел `#ai-paket`: заголовок «AI paket: oylik va 3 kunlik (AI chat uchun)», цена и срок пакета на 3 дня, ответ в FAQ. Title, H1 и description прежние. |

Также изменены `llms.txt` (блок фактов о продукте называет оба пакета; даты «Last updated» — 17.11.2026) и `llms-full.txt` (дата). Разметка `Offer` (JSON-LD) и блок условий на `/ru/gpt-chat/` и `/uz/gpt-uzbek-tilida/` не менялись: они по-прежнему описывают пакет на месяц.

Отдельного окна наблюдения для этих страниц нет: правка продуктовая. База для сравнения показов — та же, что в релизе волн 17.11.2026 (Search Console, 28 дней до 14.11.2026).

## Релиз «здесь и сейчас» (20.11.2026, в проде с 02:34 UTC)

**Основание.** Владелец в чате 20.11.2026: «мне нужен роад мап чтобы получить первые места здесь и сейчас!!». Это решение снимает заморозку до 21.12 для двух чатов и гайда скачивания:
- чистое чтение R15 (сниппеты обоих чатов) пропадает;
- A14 читается вместе с этим релизом;
- R14 (гайд входа) не трогается.

План и предохранители — `docs/seo/research/2026-11-20-uz-top1-roadmap/NOW.md`, исследование — `ROADMAP.md` там же. Защищённые ревизии:
- `docs/seo/evidence/2026-11-20-uz-now/` — доказательство `reports/uz-now-20261120/review.ts`, сборка против сборки базы `0dca0df`;
- `docs/seo/evidence/2026-11-20-uz-now-b/` (шаг «b», ниже) — доказательство `reports/uz-now-20261120/review-b.ts`, сборка против сборки `a17451a`.

Оба шага ушли одной выкладкой.

**Выкладка.** 20.11.2026 в 02:34 UTC:
- прод — `ae4b1f22` (слияние PR #63);
- выложено workflow «Pages production deploy», запуск 44661601843: сборка, все проверки `pages-production.ts`, `deployed_and_verified`;
- живая проверка — 8 страниц из 8;
- WebSub принят для трёх лент;
- IndexNow принял 10 изменённых адресов: api.indexnow.org — 200, Yandex — 202;
- «Запросить индексирование» в Google — у владельца.

Отсчёт чтений — от `lastCrawlTime` каждого URL после 02:34 UTC 20.11.

**Первый ролик.** 20.11.2026 опубликован Shorts «Chachipiti nima? ChatGPT o‘zbek tilida (jaji piti, chati piti)»:
- адрес: https://www.youtube.com/shorts/I-wJo2LGLg8, канал «Brain Digger»;
- 1080×1920, 26,6 с, сценарий — ролик 1 из `NOW.md` §2;
- кадр с чатом укрупнён, загружены узбекские субтитры с таймкодами, стоит метка ИИ;
- на сайт не встроен: Google показывает видео в выдаче только для страниц, где видео — главное содержание, а UZ-чат — страница-инструмент.

При срезах смотреть, появился ли ролик в выдаче по «chachipiti» (блок коротких видео).

### Что изменено

| URL | Изменение | Почему |
|---|---|---|
| `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` | Title «ChatGPT yuklab olish (skachat) o‘zbek tilida — 3 usul (2026)»; H1 «ChatGPT yuklab olish (skachat): telefon va kompyuterga xavfsiz o‘rnatish»; фраза о «skachat» в первом абзаце; строка «20.11.2026 kuni qayta tekshirildi» у официальных ссылок (Google Play, App Store и chatgpt.com/download отвечали 200 и называли OpenAI); H3 и абзац о каталогах «Chat GPT APK»; два вопроса в FAQ; ключи «chatgpt skachat», «chat gpt skachat», «chatgpt skachat qilish»; dateModified 2026-11-20. Description прежний | «chatgpt skachat» (Ads 12 100 в месяц) и «chat gpt skachat» (4 400) — 0 показов у любого нашего URL (GSC 21.10–17.11); в выдаче по «chatgpt skachat» APK-каталоги |
| `/uz/gpt-uzbek-tilida/` | Title «ChatGPT uzbekcha muqobili: bepul kirish, ro‘yxatsiz chat» (двоеточие вместо тире); H1 «ChatGPT’ga o‘zbekcha muqobil — 3 ta bepul sinov javobi»; H2 «Chachipiti, jaji piti, chati piti — bu ChatGPT’mi?»; дата 20.11.2026. Description, ссылки и текст прежние | Title в 7 снимках из 11 Google показывал как «bepul kirish, ro'yxatsiz chat»; на первом экране не было «ChatGPT»; «chachipiti» (22 200 в месяц, 49 500 в октябре) — 15 показов за 28 дней |
| `/ru/gpt-chat/` | Title «Аналог ChatGPT онлайн: на русском и узбекском, без регистрации»; дата 20.11.2026. H1, description, ссылки и текст прежние | Кириллические «чачи пити» и «чати пити» — 49 тыс. показов за 28 дней при CTR 0,16 % |
| `/` | Две подписи в списках: H1 UZ-чата и title гайда скачивания | Главная перечисляет страницы по H1 или title |
| `/uz/blog/` | Гайд скачивания попал в список недавно обновлённых | dateModified; у страницы 0 показов за 28 дней |
| `content/seo/intent-manifest.json` | C97: гайд скачивания владеет голыми «chatgpt skachat» и «chat gpt skachat»; русский гайд их не целевает | — |

Остальные 418 страниц сборки совпадают байт в байт. В sitemap сдвинулся `lastmod` пяти URL: трёх правленых, `/` и `/uz/blog/`.

### База для замера (Search Console, 20.10–16.11.2026, 28 дней; обход — URL Inspection 20.11)

| URL | Клики | Показы | CTR | Позиция | Последний обход |
|---|---:|---:|---:|---:|---|
| `/uz/gpt-uzbek-tilida/` | 911 | 107 044 | 0,85 % | 6,1 | 2026-11-17T22:58:19Z |
| `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` | 497 | 22 646 | 2,19 % | 4,9 | 2026-11-17T20:28:08Z |
| `/ru/gpt-chat/` | 315 | 87 522 | 0,36 % | 6,3 | 2026-11-19T02:03:25Z |

Ключевые запросы на те же 28 дней:
- «chatgpt yuklab olish uzbek tilida» — гайд 240 / 7 133 / 3,36 % / 2,5;
- «chatgpt skachat» и «chat gpt skachat» — 0 показов;
- «chachipiti» — 15 показов на позиции 8,6 (21.10–17.11);
- кириллица «чачи пити» и «чати пити» на RU-чате — 37 кликов, 36 тыс. показов;
- A14 (Узбекистан, 01–18.11) — доля RU-чата: kirish 15,9 %, piti 20,7 %.

### Как читать
- Отсчёт от `lastCrawlTime` каждого URL после выкладки. Сразу после выкладки — «Запросить индексирование» для трёх URL.
- Чтения на 7-й, 14-й и 28-й день.
- CTR сравнивать при сопоставимой позиции, отдельно по языку запроса.

**Откат** (NOW.md §1):

| URL | Порог | Что вернуть |
|---|---|---|
| Гайд скачивания | CTR «chatgpt yuklab olish uzbek tilida» при позиции ≤ 3,5 в 14-дневном окне ниже 2,0 % или клики гайда упали больше чем на 20 % при сопоставимых показах | title |
| UZ-чат | Клики семей kirish и uzbekcha за 7 дней упали больше чем на 20 % при тех же показах | title и H1 |
| RU-чат | То же по кириллическим запросам | title |

Откат — `git revert` правки конкретной страницы, новая защищённая ревизия и выкладка.

### Шаг «b» (20.11.2026, тот же релиз)

**Основание.** Владелец в чате 20.11.2026: «сделай сейчас всё автономно! все твои предложения которые потенциально усилят сео и повысят позиции!». Взяты правки, которые честны, не задевают R14 и доказуемо меняют только то, что указано.

| URL | Изменение | Почему |
|---|---|---|
| `/uz/gpt-uzbek-tilida/` | H2 «ChatGPT bilan o‘zbek tilida gaplashish: yozma va ovozli suhbat» и абзац: чат GPTBot.uz письменный, голосовой режим есть в приложении ChatGPT от OpenAI (ссылка на гайд скачивания — та же цель, что уже была на странице). Вопрос в FAQ «ChatGPT bilan ovozli gaplashsa bo‘ladimi?». Ключ «chatgpt uzbek tilida gaplashish». Title, H1, description, ссылки прежние | «chatgpt uzbek tilida gaplashish» — 1 300 в месяц, 1 600 в октябре (Ads). GSC за 28 дней: 8 кликов, 758 показов, позиция 6,9; 36 % показов уходили на гайд промптов при CTR 0 % (позиция 9,3), UZ-чат — 64 % при CTR 1,65 % |
| `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` | Две фразы шага 20.11 без слова «rasmiy»: «Google Play, App Store yoki chatgpt.com/download», «OpenAI’ning ChatGPT ilovasi emas», «Asl ChatGPT ilovasining ishlab chiquvchisi — OpenAI». Первая фраза — в первом абзаце, который выводится только в Markdown-двойнике и llms-full.txt | Правило брифа: новый текст сайта не пишет «rasmiy» |
| `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/`, `/uz/gpt-uzbek-tilida/`, `/ru/gpt-chat/` | BreadcrumbList получает имя страницы, как на всех остальных страницах (вне контракта защиты) | Search Console подписывает цепочку этих трёх URL «Unnamed item» — это подпись, не ошибка (аудит 24.10, `docs/seo/research/2026-10-24-growth-audit/L4-technical.md` §5); имена были отложены до ревизии этих страниц (`BREADCRUMB_NAME_HELD`). Гайд входа остаётся без имени до чтения R14. На позиции не влияет |
| `/uz/blog/chat-gpt-uzbek-biznes-uchun/`, `/uz/informatika-test/`, `/uz/ingliz-tili-zamonlari/`, `/uz/past-simple/`, `/uz/present-continuous/` | В каждой по одной ссылке на UZ-чат: анкор «o‘zbek tilidagi AI chat» → честный вариант с «ChatGPT … muqobil / o‘rniga», везде разный | Семья «uzbekcha / uzbek tilida» на первой странице только в 36–47 % поисков; анкоры внутренних ссылок не называли запрос, по которому страница отвечает |
| `content/seo/intent-manifest.json` | C36: гайд промптов не целевает «chatgpt uzbek tilida gaplashish» | Один интент — один URL |

Остальные страницы сборки совпадают байт в байт; sitemap не меняется. Из других файлов меняются только `llms-full.txt` и Markdown-двойники UZ-чата и гайда скачивания. На защищённых страницах контракт меняется только в `bodyTextSha256` у UZ-чата и гайда скачивания.

**Как читать шаг «b».** Отдельно не читается: выходит одной выкладкой с первым шагом. Дополнительно к срезам первого шага смотреть:
- долю показов «chatgpt uzbek tilida gaplashish» у UZ-чата (база 64 %) и CTR запроса;
- Search Console → «Навигационная цепочка»: «Unnamed item» у трёх URL должен уйти после обхода.

Ожидаемый эффект шага «b» небольшой: по «gaplashish» 0…+10 кликов за 28 дней; анкоры отдельно не измеряются. Откат — `git revert` коммита шага, новая ревизия и выкладка.

### Не сделано
- Скриншоты с реального устройства и ролики — у владельца, сценарии в `NOW.md` §2.
- Гайд входа (R14) и перенаправление `/ru/blog/chat-gpt-online/` (C23) — после 21.12.
- Скорость чатов (TBT): правка кода чата с риском для конверсии, ждёт отдельного окна.

## Упоминания в ChatGPT (23.11.2026)

**Основание.** Владелец 23.11: «реализуй всё автономно максимально… чтобы GPT цитировал меня как можно больше».

**База:**
- ChatGPT Business Hub: 239 упоминаний за 7 дней (−17 %), 54 клика на сайт.
- GA4, 25.10–22.11: chatgpt.com прислал 310 визитов, это 4-й источник; вовлечённость 82 %.
- OpenSEO, ChatGPT, Узбекистан, 23.11, 18 вопросов:
  - брендовые вопросы — 2 из 2 с упоминанием и ссылкой;
  - обычные вопросы — 0 из 16 упоминаний, 1 ссылка (кейс Cake City);
  - chatgpt.uz упомянут в 12 из 18 ответов, всегда без ссылки, то есть «по памяти».
- ChatGPT цитирует подборки «ИИ-чат без регистрации» (neuromayak.com, neiroskop.ru, inqreon.com), чужие страницы тарифов (okai.uz, osonai.uz), список braindiggeruz/awesome-uzbek-ai.
- Bing по запросу «GPTBot.uz» показывает страницы про робота OpenAI GPTBot, а не сайт.

**Сделано:**

| Что | Где |
|---|---|
| Таблица «Ro‘yxatsiz va so‘mda to‘lanadigan o‘zbekcha variant» (3 пробных ответа, языки, пакеты 5 000 / 20 000 сум, Click или Payme, «не OpenAI»), ссылка на тарифы, 2 вопроса в FAQ («Click yoki Payme…», «Ro‘yxatdan o‘tmasdan…») | `/uz/blog/chatgpt-claude-gemini-ozbekistonda/` (не защищённая), dateModified 2026-11-23 |
| Блок «Quick answers to common questions» на те же вопросы | `public/llms.txt` (и llms-full) |
| IndexNow: все 427 адресов sitemap | api.indexnow.org 200, bing.com/indexnow 200, Yandex 202 |
| Еженедельный автозамер ChatGPT по 32 вопросам, тема «ChatGPT discovery» (+8 вопросов) | OpenSEO, понедельник 09:17 Ташкент, ≈36 кредитов в неделю |
| Промпт для Claude в Chrome владельца: Business Hub (имя «GPTBot.uz», описание, 4 продукта, правила агента) и Bing Webmaster (импорт из GSC, sitemap) | передан владельцу |

**Как читать:** еженедельный срез OpenSEO (обычные вопросы с GPTBot.uz, база 0 из 16) и упоминания в Hub (база 239 за 7 дней).


## Релиз 22.11.2026: коммерческие бот-запросы («заказать / разработка телеграм-бота»)

**Основание.** Владелец в чате 22.11.2026: «приступай и делай автономно комплексно улучшения согласно твоему роад мапу!». Срез OpenSEO и roadmap лежат вне репозитория: `F:/Claude/gptbot_seo/roadmap-commercial-top3-20261122.md`, данные — в папке `roadmap-commercial-top3-20261122/data/` рядом. Правило «одна правка на URL за окно наблюдения» для хаба, страницы цен и UZ-хаба (когорта 08.11) этим поручением сознательно прервано: при 9–51 показе в месяц окно статистически почти ничего не даёт. База записана ниже.

Защищённая ревизия: `docs/seo/evidence/2026-11-22-commercial-bots/`. Доказательство — `reports/commercial-bots-20261122/review.ts`, сборка против сборки базы `9ae12dda`. Главная меняется только списками: одна новая запись (гайд) и две подписи (H1 хаба и `/uz/chat-bot-narxi/`). Остальные девять защищённых страниц не меняются.

**Выкладка.** 22.11.2026, около 05:04 UTC: коммит `284de52a`, слияние `166db6f5` (PR #67), запуск 44987697999 «Pages production deploy», деплой https://6ac7818d.ai-direct-pro-landing.pages.dev. Живая проверка: 8 изменённых URL отдают новые title, H1 и разделы; гайд отвечает 200, есть в sitemap и на главной; задержки загрузчика аналитики — как в прошлой сборке. IndexNow: HTTP 200 на 13 URL. Дни 14 и 28 считать от повторного обхода каждой страницы.

### Что изменено

| URL | Изменение | Почему |
|---|---|---|
| `/ru/razrabotka-telegram-bota-tashkent/` | 151 → 63 блока, FAQ 22 → 10, ≈4 330 → ≈2 200 слов. Title «Разработка Telegram-ботов на заказ в Ташкенте — от 990 000 сум», H1 «Разработка и создание телеграм-ботов на заказ в Ташкенте», новый description. Первый абзац с ценами и сроком, блок «Как заказать телеграм-бота: этапы работы», ссылки на пять нишевых страниц, FAQ «Как заказать телеграм-бота в Ташкенте?» | В Узбекистане 31 показ за 3 месяца на 36–96-х местах при 80 входящих внутренних ссылках. Страница дублировала цены, «Telegram-бот для бизнеса» и страницу разработчиков; у конкурентов из ТОП-3 — 200–2 000 слов на одну тему |
| `/uz/chat-bot-narxi/` | primaryKeyword «telegram bot yaratish narxi»; title «Telegram bot yaratish narxi 2026 — 990 000 so‘mdan \| GPTBot.uz»; H1 «Telegram bot yaratish narxi va chat-bot narxlari O‘zbekistonda»; первый абзац с ценами, заголовок таблицы, FAQ «Telegram bot yaratish narxi qancha?» | Манифест закрепил фразу за страницей, а на странице её не было ни разу. 20 поисков в месяц; в ТОП-3 — страница о Самарканде и две английские |
| `/ru/stoimost-chat-bota/` | H2 «Сколько стоит телеграм-бот и чат-бот для бизнеса», абзац с ценами Telegram-пакетов (кириллическое «телеграм-бот»), ссылка на страницу разработчиков. Title и H1 прежние | GSC: 1-е место по хвостам «телеграм бот цена» (единичные показы); «сколько стоит бот» — 20,7 |
| `/ru/blog/skolko-stoit-razrabotka-telegram-bota-v-tashkente/` | В первом экране — продающий блок и кнопка «Получить смету на Telegram-бота» (на форму хаба), ссылки на хаб, цены и страницу разработчиков. Title прежний | В снимке выдачи № 2 по «разработка телеграм ботов ташкент» (в GSC у запроса 0 показов); формы на обычных статьях нет |
| `/uz/telegram-bot-biznes-uchun/` | H2 «Telegram bot buyurtma qilish: 4 qadam», список шагов и ссылка «Telegram bot yaratish narxi»; ссылка на инструкцию ведёт на новый узбекский гайд вместо русского. H1 прежний (его печатает главная) | 19 показов на 9,8 по «telegram bot buyurtma o'zbekiston» (3 месяца) |
| `/ru/ai-bot-dlya-salona-krasoty/` | H2 «Бот для записи на маникюр в Telegram и Instagram» с абзацем; FAQ «Можно ли сделать бота для записи на маникюр?» | 17 показов на 7,3 за 09–21.11 |
| `/ru/chat-bot-dlya-biznesa/`, `/ru/chat-bot-po-uzbekistanu/`, `/ru/stoimost-chat-bota/`, статья о стоимости | По одной ссылке на `/ru/luchshie-razrabotchiki-chat-botov-tashkent/` («чат-бот на заказ…») | Тест 1: по «чат бот на заказ ташкент» Google показал 13 наших URL, по «разработка чат ботов ташкент» — 12 |
| `/ru/telegram-bot-dlya-biznesa/` | Ссылка на хаб «разработка Telegram-ботов на заказ в Ташкенте» | Развести с хабом; title и H1 и так без «разработки в Ташкенте» |
| `/uz/blog/telegram-bot-yaratish/` (новый URL) | Одноязычный гайд: BotFather, токен, конструктор, код или AI, хостинг, Payme/Click, проверка, «самому или заказать». Без hreflang-пары (A15) | «bot yaratish» — 590 поисков в месяц (в октябре 1 900), «telegram bot yasash» — 70; узбекского гайда не было |
| `/uz/blog/telegram-botda-payme-click-humo-tolovlarini-qabul-qilish/`, `/ru/blog/kak-sozdat-telegram-bota/` | Ссылка на новый гайд | Обнаружение нового URL |
| `content/seo/intent-manifest.json` | telegram-leads-ru: роль страницы разработчиков записана («чат-бот на заказ», решение К5), +2 hubKeywords; C7: «бот для записи на маникюр»; пара W20261122-01 (гайд ↔ UZ-хаб); A15 | — |
| `content/seo/demand-policy.json` | approvedKeywords: «bot yaratish» (590), «telegram bot yaratish narxi» (20). Кластер bot-services остаётся замороженным для новых коммерческих страниц | — |

### База для замера (Search Console, Узбекистан, 19.08–19.11.2026; обход — URL Inspection 22.11)

| URL | Показы | Клики | Позиция | Свежее окно (09–21.11) | Последний обход |
|---|---:|---:|---:|---|---|
| `/ru/razrabotka-telegram-bota-tashkent/` | 31 | 0 | 74,8 | 9 показов, 47,0 (28.10–21.11) | 2026-11-16 |
| `/ru/luchshie-razrabotchiki-chat-botov-tashkent/` | 79 | 0 | 26,2 | «чат бот на заказ ташкент» 4 / 9,0 | 2026-11-11 |
| `/ru/stoimost-chat-bota/` | 51 | 0 | 35,4 | «телеграмм бот цена» 2 / 1,0 | 2026-11-17 |
| `/uz/telegram-bot-biznes-uchun/` | 26 | 0 | 24,1 | — | 2026-11-05 |
| `/uz/chat-bot-narxi/` | 4 | 0 | 102,3 | — | 2026-11-07 |
| `/ru/ai-bot-dlya-salona-krasoty/` | 34 | 0 | 14,1 | «бот для записи на маникюр» 17 / 7,3 | — |
| `/ru/blog/skolko-stoit-razrabotka-telegram-bota-v-tashkente/` | 14 | 0 | 58,9 | «сколько стоит разработка телеграм бота» 2 / 5,5 | 2026-11-17 |
| `/ru/telegram-bot-dlya-biznesa/` | 17 | 0 | 10,4 | — | 2026-11-13 |

Индекс распыления за 3 месяца: «чат бот на заказ ташкент» — 13 наших URL, «разработка чат ботов ташкент» — 12.

### Как читать
- Отсчёт — от `lastCrawlTime` каждого URL. Сразу после выкладки — «Запросить индексирование» для хаба, `/uz/chat-bot-narxi/`, UZ-хаба (не обходился с 05.11) и нового гайда; IndexNow.
- Чтения на 14-й и 28-й день. При таких объёмах одна неделя ничего не доказывает.
- Тест 1 (внутренние ссылки). Ссылки добавлены только к странице разработчиков; контроль — ценовые запросы (К3). Если через 28 дней число наших URL по «чат бот на заказ ташкент» не упало ниже 13, а позиция выросла не сильнее, чем у контроля, ссылки здесь не рычаг.
- Тест 2 (форма страницы). Через 4 недели после обхода хаб должен появиться по ≥ 3 запросам «разработка / создание / заказать телеграм-бота» с позицией < 20.

### Откат
- Хаб: если показы в Узбекистане ниже базы (31 за 3 месяца; 9 за 28.10–21.11) или средняя позиция хуже — `git revert` коммита контента, пересборка, новая проверенная ревизия через review-скрипт (не возвращать BASELINE на старую ревизию), выкладка.
- Остальные правки аддитивные (блоки, ссылки, FAQ) и откатываются тем же revert.

### Не сделано
- Форма заявки на статье о стоимости: обычные статьи форму не рендерят (только кампанийная статья из `LEAD_FORM_ARTICLES` со своим шаблоном). Вместо формы — кнопка на форму хаба.
- hreflang-пара русского и узбекского гайдов — нет (A15). Разрыв пары `/ru/stoimost-chat-bota/ ↔ /uz/chat-bot-narxi/` по образцу A14 — гипотеза, не проверена.
- Площадки (OLX, birbir, dowork, goldenpages), отзывы и фото карточки «Boss Digital», скриншоты выдачи в режиме инкогнито — действия владельца. Тексты: `F:/Claude/gptbot_seo/owner-kit-commercial-bots-20261122.md`.
- Узбекские тексты (гайд и блоки на узбекских страницах) написаны агентом, носителем языка не вычитаны.

## OpenAI product feed (23.11.2026, ветка `feat/openai-product-feed`)

**Что.** Новый файл `https://gptbot.uz/openai-product-feed.jsonl` — 33 позиции (AI-чат, 2 AI-пакета, 2 тарифа Studio, 28 пакетов услуг) для ChatGPT Business Hub → Products → Hosted URL. Цены читаются при каждой сборке: AI-пакеты из `functions/lib/gpt-chat/packs.ts`, Studio из `functions/lib/studio/plans.ts`, услуги из таблицы пакетов на странице услуги. Решение — D-OPENAI-FEED-20261123.

**Страницы не менялись.** Ни один title, description, H1, текст или URL; меняются только `dist/_headers` (блок для фида) и сам файл фида.

**Как читать эффект.** С даты, когда владелец вставит Hosted URL в Business Hub: упоминания и клики из Hub (база 23.11: 239 упоминаний за 7 дней, 54 клика на сайт), сессии `chatgpt.com` в GA4 по страницам услуг.

## OpenAI feed v2 (23.11.2026, ветка `feat/openai-feed-gzip`)

Business Hub не принял несжатый `.jsonl`. Добавлены `https://gptbot.uz/openai-product-feed.jsonl.gz` (основной Hosted URL) и `https://gptbot.uz/openai-product-feed.tsv` (резерв); у 12 позиций с WebP-картинкой (5 изображений) в фиде теперь JPEG-копии из `/assets/feed/`. Страницы, их тексты и картинки не менялись. Решение — D-OPENAI-FEED-GZIP-20261123.
