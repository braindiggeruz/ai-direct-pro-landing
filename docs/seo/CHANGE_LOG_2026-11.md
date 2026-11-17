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
