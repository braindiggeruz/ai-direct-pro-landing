# Quick Wins — gptbot.uz (данные 18.08–14.09.2026)

Критерии: показы ≥ 60 за 28 дней, позиция 4–20, кластер релевантен сайту, правка на существующей странице без искусственного контента, низкий риск. Полный список — `csv/queries_quick_wins.csv` (49 запросов) и `csv/pages_quick_wins.csv` (10 страниц). Ожидаемый CTR = медиана сайта в диапазоне позиций (4–6: 1,56%; 7–10: 0,85%). Рост не гарантируется; «потенциал» — арифметика при текущих показах и позиции.

## QW-1. «chatgpt kirish» — сниппет статьи входа (P1)

- URL: /uz/blog/chatgptga-qanday-kirish-mumkin/ (защищённая страница)
- Кластер: chatgpt kirish 24 641 показ / 80 кликов / CTR 0,32% / поз. 7,4; chatgpt ochish 3 237 / 22 / 0,68% / 6,1; chatgpt online kirish 136 / 0 / 5,3; chatgpt ga kirish 122 / 0 / 8,0; chatgpt ochish uzbek tilida 471 / 1 / 6,2. Страница: 25 244 показа, 95 кликов, CTR 0,38%.
- Проблема: title «ChatGPT login: rasmiy sayt, ro‘yxatdan o‘tish va xatolar», H1 «ChatGPT login va ro‘yxatdan o‘tish…», description начинается с «ChatGPT login va Sign up» — слово запроса «kirish» отсутствует в title и в начале description, «ochish» отсутствует везде.
- Изменение: title `ChatGPT kirish (login): rasmiy sayt, ochish va ro‘yxatdan o‘tish` (64 символа); description `ChatGPT’ga kirish va ochish: rasmiy chatgpt.com, hisob ochish, kod kelmasa nima qilish, klon saytlardan saqlanish. O‘zbekiston uchun qo‘llanma.`; H1 `ChatGPT kirish va ochish: rasmiy sayt, ro‘yxatdan o‘tish va xatolar`; первый абзац — прямой ответ «ChatGPT’ga kirish uchun chatgpt.com → Log in …» в 2 предложениях; H2 «ChatGPT ochish: 3 qadam».
- Механизм: совпадение слов запроса со сниппетом; навигационный интент ограничивает потолок, ориентир — медиана сайта 0,85% → ≈ +130 кликов/28д.
- Сложность 1 (2 файла) · Риск низкий-средний (лидер по показам; менять только сниппет и первый абзац, не структуру) · Проверка: CTR запроса «chatgpt kirish» и страницы за 28 дней после индексации изменения (≥ 0,6% — успех; < 0,3% при той же позиции — откат title).

## QW-2. Развести «VPNsiz»-статью и статью входа (P1)

- URL: /uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/ (защищённая): 2 246 показов, 7 кликов, CTR 0,31%, поз. 8,4; делит «chatgpt ga kirish» (25 показов), «chatgpt online kirish» (17), «chatgpt 4 uzbek tilida» (21) с login-статьёй и чатом.
- Проблема: title «ChatGPT’ga kirish O‘zbekistonda: 4 qadamda, VPNsiz» — тот же интент, что у login-статьи.
- Изменение: title `ChatGPT O‘zbekistonda ishlaydimi? VPNsiz va rasmiy usul (2026)`; H1 `ChatGPT O‘zbekistonda: ishlaydimi, VPN kerakmi, rasmiy usul`; в теле раздел «ChatGPT’ga kirish: 4 qadam» заменить на 2 предложения + ссылка на login-статью с якорем «ChatGPT’ga kirish»; разделы про оплату картой и альтернативы — ссылки на /uz/blog/chatgpt-claude-gemini-ozbekistonda/ и RU-статью об оплате.
- Механизм: один URL на интент «войти»; VPNsiz-статья остаётся владельцем «ishlaydimi / vpn» (запросы «chatgpt ozbekistonda ishlaydimi», «vpn» — в данных единичны, но статья и так их держит).
- Сложность 1 · Риск низкий (CTR уже 0,31%) · Проверка: через 3–4 недели доля login-статьи по «chatgpt ochish / kirish»-запросам ≥ 80% (`query_page`), суммарные клики кластера не ниже базовых.

## QW-3. Узбекский чат: «kirish» и написания «uzbekcha» в title (P1)

- URL: /uz/gpt-uzbek-tilida/ (защищённая): 14 130 показов, 119 кликов, CTR 0,84%, поз. 6,8.
- Запросы: chatgpt bepul kirish 2 206 / 11 / 0,50% / 8,4; chatgpt kirish uzbek tilida 2 014 / 8 / 0,40% / 5,9; chatgpt uzbekcha 984 / 6 / 0,61%; chatgpt uzbekcha bepul 967 / 9 / 0,93%; chatgpt uzbek tilida 284 / 1 / 0,35%; chatgpt 4 uzbek tilida 112 / 0; chatgpt uzbek 102 / 0; chachipiti oʻzbek tilida 161 / 0.
- Проблема: title «ChatGPT o‘zbek tilida online — bepul, ro‘yxatsiz, VPNsiz» без «kirish» и без «uzbekcha».
- Изменение: title `ChatGPT o‘zbek tilida (uzbekcha) — bepul kirish, ro‘yxatsiz chat` (64 символа); description: `ChatGPT uzbekcha online: bepul kirish, ro‘yxatdan o‘tmasdan, VPNsiz. Savol bering — javob o‘zbek tilida, telefon va kompyuterda.`; первый абзац с написаниями «ChatGPT uzbekcha / o‘zbekcha / chachipiti» один раз, естественно; H2 «ChatGPT 4 va bepul reja: shu sahifada nima bor».
- Механизм: слова запроса в сниппете; закрепление UZ-страницы за узбекскими написаниями (снимает часть перетока на /ru/gpt-chat/).
- Сложность 1 · Риск низкий-средний (лидер) · Проверка: CTR «chatgpt kirish uzbek tilida» ≥ 0,9%, «chatgpt bepul kirish» ≥ 0,7%; доля UZ-страницы по «chatgpt uzbekcha online» растёт.

## QW-4. Русский чат: явная ссылка на узбекскую версию (P1)

- URL: /ru/gpt-chat/: 25 узбекских запросов → 3 199 показов, 35 кликов (chatgpt uzbekcha online 1 011 / 7 / 0,7%; jaji piti online 612 / 4; chatgpt uzbekcha скачать 243 / 2; chatgpt yozish 209 / 1; chatgpt ozbekcha 137 / 0; chatgpt узбекча 99 / 0).
- Изменение: в первом экране (до чата) текстовая ссылка `ChatGPT o‘zbek tilida — o‘zbekcha versiya →` на /uz/gpt-uzbek-tilida/; в description RU-страницы убрать обещание «узбекский AI-чат» как основное (оставить упоминание). Canonical и hreflang не трогать.
- Механизм: пользователь с узбекским запросом, попавший на RU-страницу, переходит в UZ-версию (снижает отказ), а Google получает явный сигнал, какая страница узбекская.
- Сложность 1 · Риск низкий · Проверка: рост доли /uz/gpt-uzbek-tilida/ в парах по узбекским запросам; клики кластера не падают.

## QW-5. Статья о скачивании: «kompyuter» в title (P2, после QW-1..3)

- URL: /uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/ (защищённая, лидер: 337 кликов, 19 110 показов, CTR 1,76%, поз. 5,6; медиана страниц диапазона 2,12%).
- Запросы без кликов: chatgpt yuklab olish kompyuter uchun 132 / 7,2; chatgpt uzbek tilida skachat 100 / 7,7; chatgpt o'rnatish 69 / 6,5.
- Изменение: title `ChatGPT yuklab olish o‘zbek tilida — telefon va kompyuter uchun (2026)`; description добавить «Windows/macOS»; блок про вход сократить и сослаться на login-статью.
- Сложность 1 · Риск средний (это 40% всех кликов; менять один элемент, после подтверждения QW-1..3) · Проверка: CTR страницы ≥ 2,0% при той же позиции.

## QW-6. Два 404 с показами → 301 (P2)

- /ru/gpt-vs-chatgpt-sravnesie/ → /ru/gpt-vs-chatgpt-sravnenie/ (1 клик, «URL is unknown to Google», источник — внешний). /uz/blog/chatgpt-telefon-va-kompyuter-ga-yuklab-olish/ → …kompyuterga-yuklab-olish/ (1 показ). Файл `content/seo/redirects.json`. Сложность 0,5 · Риск нулевой · Проверка: HTTP 301 после релиза.

## QW-7. «услуги смм специалиста» (P3)

- /ru/blog/chto-vhodit-v-uslugi-smm-specialista/: 78 показов, поз. 9,2, 0 кликов (страница 176 показов, поз. 15,8). Изменение: description с ответом «состав работ + цена от 2 490 000 сум/мес», ссылка на /ru/smm-prodvizhenie-tashkent/. Сложность 1 · Риск нулевой · Проверка: ≥ 1–2 клика/28д (малая выборка, только направление).

## QW-8. «instagram direct nima» (P3)

- /uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/ 38 показов (7,8) + /uz/instagram-uchun-ai-menejer/ 5 — запрос «что такое Direct». Добавить в статью краткий блок-определение «Instagram Direct nima?» в первом экране; лендинг не трогать. Сложность 1 · Риск нулевой.

## Сводная таблица

| ID | URL | Запрос/кластер | Клики | Показы | CTR | Поз. | Тип | Сложн. | Риск | Приор. |
|---|---|---|---|---|---|---|---|---|---|---|
| QW-1 | /uz/blog/chatgptga-qanday-kirish-mumkin/ | chatgpt kirish + ochish | 95 | 25 244 | 0,38% | 7,2 | ctr_gap | 1 | низк.-средн. | P1 |
| QW-2 | /uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/ | kirish-переток | 7 | 2 246 | 0,31% | 8,4 | каннибализация | 1 | низкий | P1 |
| QW-3 | /uz/gpt-uzbek-tilida/ | kirish uzbek tilida, bepul kirish, uzbekcha | 119 | 14 130 | 0,84% | 6,8 | ctr_gap/volume | 1 | низк.-средн. | P1 |
| QW-4 | /ru/gpt-chat/ | uz-запросы на RU-странице | 35 (uz) | 3 199 | 1,1% | 5–9 | язык | 1 | низкий | P1 |
| QW-5 | /uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/ | kompyuter uchun, skachat | 337 | 19 110 | 1,76% | 5,6 | volume | 1 | средний | P2 |
| QW-6 | 2 × 404 | — | 1 | 2 | — | — | гигиена | 0,5 | нулевой | P2 |
| QW-7 | /ru/blog/chto-vhodit-v-uslugi-smm-specialista/ | услуги смм специалиста | 0 | 78 | 0 | 9,2 | ctr_gap | 1 | нулевой | P3 |
| QW-8 | /uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/ | instagram direct nima | 0 | 38 | 0 | 7,8 | интент | 1 | нулевой | P3 |

Правило запуска: QW-1, QW-2, QW-3, QW-4 — одной волной (это один кластер, эффект измеряется по кластеру); QW-5 — отдельной волной через 3 недели; QW-6 — с любым релизом.
