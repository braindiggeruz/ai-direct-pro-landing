# Черновики сниппетов для лидеров трафика — выкат 20.10.2026

> **Статус на 30.09.2026: черновики заменены релизом GSC-driven (решение 29.09, сборка 30.09; docs/seo/evidence/2026-09-30-gsc-driven/). Выкат 20.10 отменён.**
>
> Решение принято по свежим данным GSC (выгрузка 29.09, `dataState=all`) по поручению владельца от 29.09. Ревизия
> эталона названа по фактической дате сборки — 30.09. Что входит в релиз вместо черновиков — в
> `docs/seo/CHANGE_LOG_2026-09.md`, раздел «30.09 — релиз по свежим данным GSC»; владение запросами — пары
> C22, C18 и C11 в `content/seo/intent-manifest.json`. Итог по разделам:
>
> | § | Страница | Статус |
> |---|---|---|
> | 1 | `/uz/blog/chatgptga-qanday-kirish-mumkin/` | применён в изменённом виде: description и FAQ[0]; title не менялся |
> | 2 | `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` | применён частично: description и FAQ; title прежний |
> | 3 | `/uz/gpt-uzbek-tilida/` | отклонён |
> | 4 | `/ru/gpt-chat/` | отклонён |
> | 5 | `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/` | не применён |
>
> Ниже — исходный черновик от 29.09 без правок, со статусом в начале каждого раздела. **Не выкатывать §3 и §4:**
> по свежим данным они стоят кликов.

**Исходный статус (до 29.09): ЧЕРНОВИК. Не публиковать до 20.10.2026** (заморозка 10 защищённых страниц ради замера
волны 1 от 18.09 — `docs/seo/gsc-audit-2026-09-17/ROADMAP_2026-09-19_CONVICTION.md` §3).

Условие выката: 03.10.2026 прочитать тест формулы на трёх незащищённых страницах (роадмап §2.3).
Если CTR там не сдвинулся — сниппеты не выкатывать, вес уходит в видео (§4).

Данные: GSC 28 дней до 2026-09-14 (`docs/seo/gsc-audit-2026-09-17/csv/query_page_pairs.csv`).
Пять страниц ниже держат ~61 000 из ~61 300 показов защищённой десятки; остальные пять (`/`,
`chatgpt-i-claude`, `kak-oplatit`, `promptlar`, `ai-chat-nima`) по объёму не стоят риска — не трогать.

Формула (роадмап §2.3): точная фраза главного запроса — первой; число — в первых двух
предложениях; первый вопрос FAQ дословно повторяет запрос. Каждое число ниже взято из текста самой
страницы; ничего нового не обещается. Страницы AI-чата GPTBot.uz сохраняют оговорку «mustaqil
AI-xizmat / не продукт OpenAI».

---

## 1. `/uz/blog/chatgptga-qanday-kirish-mumkin/` — 24 771 показ/мес, CTR 0,36 %

> **Статус 30.09: применён в изменённом виде.** В релизе description «ChatGPT’ga kirish (login): rasmiy
> chatgpt.com, Log in yoki Sign up — 3 qadam, odatda VPNsiz. Kod kelmasa yoki sayt ochilmasa nima qilish.»
> (137 зн.; первый вариант релиза без слова «kirish» заменён при ревью: все запросы страницы содержат
> kirish/ochish) и FAQ[0] «ChatGPT’ga qanday kirish mumkin?». **Title не менялся** — остался «ChatGPT kirish (login):
> rasmiy sayt, ochish va ro‘yxatdan o‘tish». Title-черновик «ChatGPT kirish: chatgpt.com orqali 3 qadamda (2026)»
> отклонён: он спорит с UZ-чатом за голый «chatgpt kirish» (с 13.09 Google ведёт этот запрос в основном на
> `/uz/gpt-uzbek-tilida/`: 59 % показов 20–28.09, у статьи 28 %) и отвечает на навигационный запрос прямо в
> выдаче. Смена title на логин-хвост (кандидат «ChatGPT’ga kirish (login): kod kelmasa yoki sayt ochilmasa»)
> отложена до гейта этапа 2 в паре C22. CTR статьи по «chatgpt kirish» уже вырос: 0,29 % (04–17.09) → 0,41 %
> (20–29.09).

| Запрос | Показы | Позиция | CTR |
|---|---|---|---|
| chatgpt kirish | 21 142 | 7,2 | 0,35 % |
| chatgpt ochish | 1 855 | 5,9 | 0,59 % |
| chatgpt kirish uzbek tilida | 959 | 9,8 | 0,10 % |

| Поле | Сейчас | Черновик |
|---|---|---|
| title | ChatGPT kirish (login): rasmiy sayt, ochish va ro‘yxatdan o‘tish (64) | **ChatGPT kirish: chatgpt.com orqali 3 qadamda (2026)** |
| description | ChatGPT’ga kirish va ochish: rasmiy chatgpt.com, hisob ochish, kod kelmasa… (150) | **ChatGPT kirish — rasmiy chatgpt.com, Log in va hisobingiz: 3 qadam. Kod kelmasa nima qilish va soxta saytni rasmiysidan qanday ajratish.** |
| FAQ[0].q | ChatGPT kirish uchun qaysi sayt rasmiy? | **ChatGPT kirish qanday amalga oshiriladi?** (старый вопрос — вторым) |

«3 qadam» — из короткого ответа статьи: открыть chatgpt.com → Log in → войти в аккаунт.
Это главный рычаг файла: 21 тыс. показов при CTR 0,35 %; норма для позиции 7 — ~0,85 % по сайту и 2,5 %+ по рынку.

## 2. `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` — 18 086 показов/мес, CTR 1,69 %

> **Статус 30.09: применён частично.** В релизе description «ChatGPT yuklab olish o‘zbek tilida: Android, iPhone va
> kompyuterga — 3 usul, bepul. Rasmiy OpenAI ilovasini soxta APK’dan qanday ajratish.» (138 зн.) и FAQ[0]
> «ChatGPT’ni o‘zbek tilida qanday yuklab olish mumkin?», плюс формулировки двух H2 и вопрос «skachat (скачать)».
> **Title прежний:** он уже растёт — «chatgpt yuklab olish uzbek tilida» 2,07 % на поз. 4,2 (04–17.09) → 2,74 %
> на поз. 3,1 (20–29.09). «bepul» в title не подкреплён запросами. «3 daqiqada» убрано: в статье этого нет.

| Запрос | Показы | Позиция | CTR |
|---|---|---|---|
| chatgpt yuklab olish uzbek tilida | 9 601 | 4,7 | 1,81 % |
| chatgpt yuklab olish | 3 732 | 7,1 | 1,29 % |
| chatgpt ilovasini yuklab olish | 1 930 | 5,7 | 2,80 % |

| Поле | Сейчас | Черновик |
|---|---|---|
| title | ChatGPT yuklab olish o‘zbek tilida — 3 usul (2026) (50) | **ChatGPT yuklab olish o‘zbek tilida: 3 usul, bepul (2026)** |
| description | ChatGPT’ni telefonga va kompyuterga yuklab olish: … (177, обрезается) | **ChatGPT yuklab olish o‘zbek tilida: Play Market, App Store va kompyuter — 3 usul, bepul, 3 daqiqada. Rasmiy ilovani soxtasidan ajratish.** |
| FAQ[0].q | ChatGPTni kompyuterga yuklash shartmi? | **ChatGPT’ni o‘zbek tilida qanday yuklab olish mumkin?** |

Описание сейчас 177 символов и режется в выдаче — хвост с «xatolar yechimi» не виден.
Позиция 4,7 при CTR 1,8 % — над органикой стоит карусель видео и Play Store (роадмап §4).

## 3. `/uz/gpt-uzbek-tilida/` — 12 294 показа/мес, CTR 0,63 %

> **Статус 30.09: отклонён. Не выкатывать.** Черновик убирает «kirish», а на запросы с «kirish» у страницы
> приходится около 6 кликов в день (61 клик на 12 089 показов, 20–29.09): с 13.09 это главная страница Google
> по «chatgpt kirish». И черновик обещает «0 so‘m», чего страница не говорит (чат бесплатный, но с дневным и
> часовым лимитом). Вместо него в релизе раздел «ChatGPT kirish: rasmiy sayt yoki ro‘yxatsiz o‘zbekcha chat»
> первым блоком и description с оговоркой о независимости от OpenAI (пара C22).

| Запрос | Показы | Позиция | CTR |
|---|---|---|---|
| chatgpt bepul kirish | 2 205 | 8,4 | 0,50 % |
| chatgpt kirish uzbek tilida | 1 920 | 5,9 | 0,36 % |
| chatgpt kirish | 1 796 | 7,7 | 0,17 % |
| chatgpt uzbekcha bepul | 939 | 5,3 | 0,96 % |

Страница — собственный AI-чат GPTBot.uz, не вход в ChatGPT. «chatgpt kirish» здесь — каннибализация
со статьёй №1; сниппет уводим на «uzbekcha / bepul / online», где страница отвечает честно.

| Поле | Сейчас | Черновик |
|---|---|---|
| title | ChatGPT o‘zbek tilida (uzbekcha) — bepul kirish, ro‘yxatsiz chat (64) | **ChatGPT uzbekcha bepul — o‘zbek tilida AI-chat, ro‘yxatsiz** |
| description | ChatGPT uzbekcha online: bepul kirish, ro‘yxatdan o‘tmasdan, VPNsiz… (137) | **ChatGPT uzbekcha bepul online: 0 so‘m, ro‘yxatdan o‘tmasdan va VPNsiz. Javob o‘zbek yoki rus tilida. GPTBot.uz — mustaqil AI-xizmat, OpenAI emas.** |
| FAQ[0].q | AI-chatdan bepul foydalanish mumkinmi? | **ChatGPT uzbekcha bepul ishlaydimi?** (ответ — как сейчас: да, это AI-чат GPTBot.uz, не ChatGPT) |

Перед выкатом сверить с актуальными тарифами чата: «0 so‘m» верно только пока бесплатный режим включён.

## 4. `/ru/gpt-chat/` — 4 134 показа/мес, CTR 1,28 %

> **Статус 30.09: отклонён. Не выкатывать.** По «на русском» у сайта 5 показов за 28 дней (02–29.09), а страница
> собирает около 5 кликов в день, в основном по узбекским запросам (55 кликов 20–29.09). «0 сум» и «без VPN»
> на странице нет. Вместо него в релизе двуязычный description («пишите по-русски или по-узбекски (uzbekcha)»,
> «не OpenAI»), видимый абзац о входе на chatgpt.com и ссылка на Telegram-бот для бизнеса вместо Telegram Ads.
> Title прежний. Повторный тест RU-title — только по условию из CHANGE_LOG (раздел 30.09).

Русская страница берёт узбекские запросы («chatgpt uzbekcha online» 1 011, «jaji piti online» 612) и
теряет клики: узбек видит русский сниппет (роадмап §3.3 «развести RU и UZ»).

| Поле | Сейчас | Черновик |
|---|---|---|
| title | ChatGPT онлайн бесплатно в Узбекистане — без регистрации | **ChatGPT на русском онлайн бесплатно — без VPN и регистрации** |
| description | ChatGPT онлайн в Узбекистане без регистрации и VPN… (158) | **ChatGPT на русском онлайн: 0 сум, без регистрации и VPN, ответ прямо в браузере. Нужен узбекский — есть версия «ChatGPT o‘zbek tilida».** |
| FAQ[0].q | Можно ли использовать AI-чат бесплатно? | **Можно ли пользоваться ChatGPT на русском бесплатно?** |

Вместе с этим — в первом абзаце заметная ссылка на `/uz/gpt-uzbek-tilida/` (уже есть `{uzchat}` в
`bodyBlocks[0]`; проверить, что она выше первого экрана на мобильном).

## 5. `/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/` — 2 065 показов/мес, CTR 0,24 %

> **Статус 30.09: не применён.** Измеримого спроса на интент страницы нет: запросов с «vpn», «впн» или
> «ishlaydimi» с 01.08 по 29.09 — 0 показов. Показы статьи идут по чужим интентам («chatgpt kirish», «chatgpt
> ochish»). Слияние с 301 на статью о входе — пересмотреть 27.10.

«chatgpt kirish» (1 714 показов) — каннибализация со статьёй №1. Сниппет уводим на свой интент.

| Поле | Сейчас | Черновик |
|---|---|---|
| title | ChatGPT O‘zbekistonda ishlaydimi? VPNsiz va rasmiy usul (2026) | **ChatGPT O‘zbekistonda ishlaydimi? Ha, VPNsiz (2026)** |
| description | ChatGPT O‘zbekistonda rasman ishlaydimi, VPN kerakmi… (161) | **ChatGPT O‘zbekistonda ishlaydimi: ha, rasmiy chatgpt.com VPNsiz ochiladi. 3 savolga javob — VPN, OpenAI ro‘yxati va kartadan to‘lov — manbalar bilan.** |
| FAQ[0].q | ChatGPT nima? | **ChatGPT O‘zbekistonda ishlaydimi?** (старый — ниже) |

Плюс одна контекстная ссылка из первого экрана на статью №1 с анкором «ChatGPT kirish», чтобы
Google отдавал запрос «chatgpt kirish» одной странице.

---

## Как выкатывать 20.10

> **Отменено 30.09** — см. статус в начале файла. Порядок ниже оставлен для истории.

1. Прочитать итог 03.10 (тест формулы) и свежие 28 дней GSC по этим пяти URL; обновить числа выше.
2. Правки — только поля `title`, `description` (+ `ogTitle`/`ogDescription`, если они совпадали),
   порядок `faq`, одна ссылка в статье №5. Тексты статей не переписывать.
3. `npm run build:fast` → `scripts/seo-protection.ts check` покажет ровно эти поля → новая ревизия
   `docs/seo/evidence/2026-10-20-snippets/reviewed-protected-pages.json` с перечнем изменений.
4. `build:production` → `deploy:pages:production` → GSC «Запросить индексирование» для пяти URL
   (квота 10/день) → IndexNow.
5. Замер: 28 дней после переобхода, CTR по тем же запросам против таблиц выше.
