# Проверка W1-06: три контекстные UZ-ссылки (Direct, A-4, tushuntirish/ariza)

Роль: проверяющий, задача — опровергнуть. Всё перепроверено самостоятельно: бесплатные вызовы GSC (OpenSEO, `whoami` — 23 142 кредита, платных вызовов 0), `dist/` этой папки, живой GET трёх страниц-источников. Сырые ответы GSC: `verify-data/W1-06_gsc.json`. Окно GSC везде одно: 2026-09-24..2026-10-21, web.

**Вердикт: не опровергнуто, но с поправками.** Цифры и счётчики ссылок совпадают с L5. Действие честное и не нарушает `intent-manifest.json`. Защищённые страницы не задеты. Найдено два дефекта:
1. Текст W1-11 при вставке дословно даёт повтор фразы в одном предложении. Его нужно переписать.
2. Обоснование части A-4 не держится: все видимые запросы A-4 принадлежат UZ-чату, запросов про промпты у неё 0. Потолок L5 (+7) завышен примерно вдвое, ожидаемый эффект — ≈0–1 клика, а не 0–2.

## 1. Цифры: совпадают

| Цель | L5 (показы / клики / поз.) | Перепроверка | resultId |
|---|---|---|---|
| `/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/` | 94 / 1 / 5,4 | 94 / 1 / 5,4 | `692e32e9` |
| `/uz/gpt-uzbek-tilida-ai-chat/` (A-4) | 96 / 0 / 7,6 | 96 / 0 / 7,6 | `51bc9842` |
| `/uz/blog/tushuntirish-xati-va-ariza-yozish/` | 26 / 0 / 5,1 | 26 / 0 / 5,1 | `604d7c54` |

| Источник | Клики / показы / поз. | Защищён | resultId |
|---|---|---|---|
| `/uz/blog/target-reklama-nima/` | 2 / 185 / 6,8 | нет | `02e7cdb5` |
| `/uz/blog/insho-yozish-suniy-intellekt-bilan/` | 1 / 309 / 6,8 | нет | `02e7cdb5` |
| `/uz/blog/chatgpt-talabalar-uchun/` | 2 / 47 / 7,0 | нет | `02e7cdb5` |

Защиту проверил по `scripts/seo-protection.ts:145-154` (`PROTECTED_PATHS`): ни одного из трёх источников там нет. Защищённые `/`, `/uz/gpt-uzbek-tilida/` и promptlar печатают об этих статьях только заголовок или анкор, а не текст статьи (проверено по `dist/`). Значит, правка тела статьи не меняет контракт `assertSeoProtection`. `protected=false` — верно.

## 2. Входящие ссылки из текста: совпадают

Обошёл все `dist/**/index.html` и классифицировал ссылки вручную по контексту.

| Цель | Кто ссылается | Из текста | L5 |
|---|---|---|---|
| Direct | `/` (список), `/uz/blog/` (список), `/uz/instagram-bot-biznes-uchun/` — две ссылки, обе `link-card` и `related-article` | **0** | 0 ✔ |
| A-4 | `/uz/` и `/uz/gpt-telegram-instagram-ideya/` («O‘zbek tilida prompt yozish qo‘llanmasi»); talabalar, гайд по скачиванию, promptlar, UZ-чат — карточки и «Shuningdek o‘qing» | 2 | 2 ✔ |
| tushuntirish | `/uz/blog/rezyume-tayyorlash/` («ariza va tushuntirish xati yozish»), `/uz/gpt-chat-qollanma/`, `/uz/suniy-intellekt/` | 3 | 3 ✔ |

Живой GET трёх источников (Chrome UA, 0,6 с между запросами): все ответили 200, текст `<body>` совпадает с `dist/`. Ссылки на цель нет ни на живом сайте, ни в сборке. Вставка ничего не дублирует.

## 3. Честность текста и соответствие цели

| Вставка | Утверждение в тексте | Есть ли это на странице-цели | Итог |
|---|---|---|---|
| W1-12 (insho → A-4) | «rol, vazifa, kontekst, format va cheklov» | H2 «Yaxshi prompt qanday yoziladi: formula»: «rol + vazifa + kontekst + javob formati + cheklov» | честно |
| W1-11 (target → Direct) | Direct; javob tezligi; AI-bot qanday javob beradi | H2 «Instagram Direct nima»; «Direct’ning asosiy cheklovi — javob tezligi»; «AI-bot esa 24/7 darhol javob beradi» | честно |
| W1-13 (talabalar → tushuntirish) | ariza yoki tushuntirish xati | H2 «Tushuntirish xati tuzilmasi…», «Ariza: tuzilma va turlari» | честно |

Апострофы в `l5-data/l5_link_plan.json` проверены посимвольно: только U+2018 (o‘, g‘) и U+2019 (e’lon, Direct’ga, ta’sir). Других знаков (`'`, ʻ, ʼ) нет.

**Дефект 1. W1-11 нельзя вставлять дословно.** Ссылки в `linkp` выводятся без кавычек: в `dist/uz/blog/target-reklama-nima/index.html` «…bo‘linishi <a>SMM nima va targetdan farqi</a> maqolasida…». Поэтому из текста L5 получится: «…Instagram Direct nima va unga AI-bot qanday javob berishi **Instagram Direct nima va AI-bot qanday ishlaydi** maqolasida tushuntirilgan». Фраза «Instagram Direct nima» стоит в одном предложении дважды. Читается как переспам, и это ухудшает абзац. Исправленный текст (анкор и цель те же):
> «Agar e’lon Direct’ga yozishga chaqirsa, javob tezligi ham natijaga ta’sir qiladi — bu haqda {direct} maqolasida batafsil yozilgan.»

Утверждение «bu haqda» верно: в статье есть фраза «Direct’ning asosiy cheklovi — javob tezligi».

Тексты W1-12 и W1-13 читаются нормально. В W1-13 «ariza yoki tushuntirish xati… — ariza va tushuntirish xati yozish qo‘llanmasiga» повторяется, но предложение остаётся естественным.

## 4. Карта интентов и политика анкоров

| Анкор → цель | Правило | Совпадения с mustNotTarget | Итог |
|---|---|---|---|
| «o‘zbek tilida prompt yozish formulasi» → A-4 | C6: A-4 владеет «prompt formula», mustNotTarget — семья A + tarjima. C28: «o‘zbek tilida prompt yozish» и «prompt formulasi» запрещены мануалу, значит принадлежат A-4. cannibalization.md K8: рекомендуемый анкор «o‘zbek tilida prompt yozish qo‘llanmasi», «A-4 только по промпт-интенту». 04_TARGET_URLS: A-4 = LINK | нет | соответствует |
| «Instagram Direct nima va AI-bot qanday ishlaydi» → UZ Direct-блог | Пары в манифесте нет. RU-аналог C3: блог владеет «как работает», денежная страница — «заказать/подключить». Видимые запросы цели — информационные «direct nima» | нет; коммерческих слов нет | соответствует |
| «ariza va tushuntirish xati yozish» → tushuntirish | C41: гайд владеет «tushuntirish xati», «ariza yozish»; его mustNotTarget — chatgpt uzbekcha/uzbek tilida, rezyume | нет | соответствует |

## 5. Обоснование A-4 не держится (дефект 2)

| Факт | Значение | resultId |
|---|---|---|
| Видимые запросы A-4 | 14 из 96 показов: «chat gpt uzbek tilida» 2 (поз. 9), «chatgpt oʻzbek tilida» 1, «chatgpt uzbek» 1, «chatgpt yozish» 7 (поз. 10,1), «чат gpt узбек тилида» 1, ещё 2 мусорных | `e70f3980` |
| Чьи это запросы | Семья A и «chatgpt yozish»: по C6 они в mustNotTarget A-4, по C34 закреплены за UZ-чатом | intent-manifest C6, C34 |
| Запросы с «prompt» по всему сайту | 3 строки, все у promptlar (A-5): «chatgpt uchun prompt» 16 / поз. 8,4 и др.; у A-4 — **0** | `2a4c534b` |
| Пересечение с победителем | «chat gpt uzbek tilida»: UZ-чат 37 показов, поз. 5,8; A-4 — 2, поз. 9 | `8c63f62f` |

Из этого следует:
- 96 показов A-4 не доказывают спрос на промпты. Всё, что видно, — запросы владельца, UZ-чата (защищён, 489 кликов, идёт 28-дневное чтение сниппетов). Часть потолка «96 × 3,59 % ≈ +3» считает клики, которые A-4 брать не должна. Если A-4 их наберёт, это каннибализация UZ-чата, а не рост.
- Риск для чата при этом пренебрежимо мал. Анкор узко промптовый: он усиливает отличающий интент A-4, а не семью A. Донор слабый (insho: 309 показов, 1 клик). Поэтому действие для A-4 оставляю. Это подготовка к W1-07 («Prompt nima» на A-4; спрос «prompt» 2 900/мес., «prompt nima» 720/мес., `l3-data/kw*_table.txt`), а не источник кликов сейчас.

## 6. Оценка эффекта

Метод тот же, что в бэклоге: `backlog.json → estimationRules.internalLinks` = 10–20 % потолка L5, где потолок = показы × 3,59 % − клики. В самом правиле записано: «no site evidence for link effect».

| Цель | Потолок L5 | Пересчёт | Комментарий |
|---|---|---|---|
| Direct | 94 × 3,59 % − 1 = **+2,4** | +2,4 | видимые запросы — информационные «direct nima» (49 показов, 48 из Узбекистана, `815b8603`); к B2B-заявкам почти не относятся |
| A-4 | 96 × 3,59 % = **+3,4** | **≈0** | видимые запросы принадлежат UZ-чату (§5) |
| tushuntirish | 26 × 3,59 % = **+0,9** | +0,9 | все 26 показов анонимизированы; спрос по demand-policy (1 600 + 3 600 + 590) учтён в L5-03 |
| **Итого** | **≈ +7** | **≈ +3,3** | |
| × 10–20 % | 0,7–1,4 → в бэклоге «≈0–2» | **0,3–0,7 → «≈0–1»** | уверенность низкая |

Доноры слабые: 185, 309 и 47 показов, 1–2 клика. Все уже на глубине 1 от `/` (`l5_pages.tsv`). Одна дополнительная исходящая ссылка мало меняет внутренний PageRank цели.

## 7. Итог для исполнителя

- **Делать** в волне 1, `protected=false`, риск низкий, трудозатраты S.
- W1-12 и W1-13 — дословно из `l5-data/l5_link_plan.json`.
- W1-11 — с исправленным текстом из §3.
- Insho правится одним проходом вместе с W1-05 и W1-08. Новый `linkp` ставить между `body[19]` (таблица промптов) и `body[20]` (`linkp` про referat).
- Ожидание записать как «≈0–1 клика за 28 дней». Часть A-4 — подготовка к W1-07, а не источник кликов.
