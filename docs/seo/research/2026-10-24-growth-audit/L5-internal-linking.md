# L5 — внутренняя перелинковка

Ветка `seo/chat-snippets-translator-20261024`, прод `d54d5b61`; `dist/` этой папки — сборка прода. Аудит только читал: исходники, сборку и прод не трогал. Писал только в `docs/seo/research/2026-10-24-growth-audit/` (этот отчёт и `l5-data/`). Кредиты OpenSEO не тратил: `whoami` и GSC бесплатны, платных вызовов не было (лимит линзы — 0).

## 0. Источники и метод

| Что | Откуда | Файл |
|---|---|---|
| Граф ссылок | Офлайн-обход всех `index.html` в `dist/` (без `admin/`, `assets/`, `lead-radar/`): canonical, robots, каждая `<a href>` на gptbot.uz, нормализация пути, разрешение через `content/seo/redirects.json`, зона ссылки (header / footer / content) по landmark-тегам. BFS-глубина от `/`, внутренний PageRank (d = 0,85, 60 итераций, уникальные рёбра) | `l5-data/l5_link_graph.py` → `l5_pages.tsv`, `l5_edges.json`, `l5_anchors_in.json`, `l5_summary.json` |
| Типы входящих | `body` — абзацы, статьи, `main`; `related` — карточки «Смотрите также / Shuningdek o‘qing» и блоки статей; `list` — ссылки со списков `/`, `/uz/`, `/ru/blog/`, `/uz/blog/`; `nav` — header, footer, хлебные крошки, переключатель языка | `l5-data/l5_analyze.py` → `l5_inbound_by_type.tsv`, `l5_donors.tsv` |
| GSC по страницам, все страны, 28 дней (2026-09-24..10-21) | `get_search_console_performance`, dims [page], rowLimit 1000, 277 строк, hasMore false, resultId `7081b224-e5bf-4560-b04f-ac32f2a86aff` | `l5-data/gsc_page_28d_all.tsv` (сумма по страницам 1 592 клика / 219 906 показов; это сумма строк page, она не равна итогу ресурса 1 584 / 214 911) |
| GSC page+query, все страны, 28 дней | файлы линзы L1: resultId `64bd3f4c…` и `793506b0…` | `raw/gsc_page_query_28d_p0.json`, `p1.json` → `l5-data/l5_top_queries.json` |
| GSC по страницам, только Узбекистан | файл линзы L1: resultId `07277515…` (только видимые запросы, см. L1 §2) | `raw/gsc_page_28d_uzb.tsv` |
| Владельцы интентов и запреты на анкоры | `content/seo/intent-manifest.json` (pairs, clusters, architectureDecisions); `F:\Claude\MONEY_ROBOT_GPTBOT_2026\04_TARGET_URLS.csv` (Link policy, DO NOT LINK); `_work/cannibalization.md` | — |
| Проверка анкоров против `mustNotTarget` | все `internalLinks` и `linkp` опубликованных JSON | `l5-data/l5_anchor_check.py` |
| Спрос (Google Ads, loc 2860) | `content/seo/demand-policy.json` (approvedKeywords), заметки пар C41/C42/C44 | — |
| Защита и окна замеров | `scripts/seo-protection.ts` (`PROTECTED_PATHS`, история ревизий), `src/shared/site-chat-nav.ts:16-19` (окно П-CTR гайда по скачиванию, чтение ≈06–10.11), `docs/seo/research/2026-10-24-snippets-translator/implementation-map.md` G4/G6/G8 | — |
| План вставок в машинном виде | — | `l5-data/l5_link_plan.json` |

**Как считаю эффект.** Влияние внутренней ссылки на позицию на этих данных не измерить: собственная кривая CTR сайта на позициях 5–7 на 87–99 % состоит из одной страницы, и её форму определяет набор запросов, а не позиция (L1 §3). Поэтому в каждой возможности стоит `unknown` и **потолок**. Потолок по GSC = показы за 28 дней × 3,59 % − текущие клики. 3,59 % — CTR позиции 3 по кривой UZ без чатов (L1 §3.3, 9 018 показов в ячейке). Потолок по спросу = объём в месяц × 28/30,4 × 3,59 %. Потолок — это не прогноз, а верхняя граница для случая «страница в топ-3 по всем своим фразам».

## 1. Главный вывод

| Показатель | Значение | Источник |
|---|---|---|
| Обслуживаемых HTML-страниц | 300, все индексируемые (canonical на себя, без noindex), все 300 есть в `sitemap.xml` | `l5_summary.json` |
| Уникальных внутренних рёбер | 4 581; битых 0; через редирект 0; сирот 0 | там же |
| Глубина от `/` | 294 страницы на глубине 1, 4 на глубине 2 (`/ru/oferta/`, `/uz/oferta/`, `/ru/prezentatsiya-ai/`, `/uz/taqdimot-ai/`), 1 на глубине 3 (`/uz/tariflar/`) | `l5_pages.tsv` |
| Почему так мелко | Оболочка `/` перечисляет каждую опубликованную страницу и статью: у `/` 294 исходящих ссылки (`scripts/prerender-home.ts:111-135`) | `l5_pages.tsv` |
| Топ-20 по внутреннему PageRank без двух чатов | 18 URL, вместе **1 520 показов** за 28 дней; это списки, страницы автора и B2B-лендинги | `l5_inbound_by_type.tsv` |
| Где в этом рейтинге B2C-страницы со спросом | гайд по скачиванию — 37-е место (23 438 показов), гайд по входу — 53-е (11 707), сравнение GPT/ChatGPT — 88-е (2 334), оплата — 210-е (745), ChatGPT и Claude — 232-е (958) | там же |
| Страниц с ≥50 показами (без чатов и `/`) | 60; у **26** из них ≤2 входящих из текста; вместе 5 343 показа и 71 клик | там же |
| Связь спроса и входящих | Спирмен: показы ~ все входящие 0,30; показы ~ входящие из текста 0,33 | там же |

Что из этого следует:
1. **Глубина и сироты — не проблема.** Каждая страница в одном клике от главной. Сайт ничего не выиграет, если будет «поднимать» страницы по глубине.
2. **Ссылочный вес распределён наоборот.** Шаблонные ссылки получают B2B-страницы: ссылки в футере «Услуги продвижения» (414 ссылок) и «Reklama xizmatlari» (188), site-nav, карточки «Решения». У `/ru/ai-bot-dlya-biznesa/` 114 входящих при 48 показах и позиции 31,3. У `/ru/blog/chatgpt-i-claude-v-uzbekistane/` 5 входящих при 958 показах и 38 кликах.
3. **Сильнейшие доноры заперты.** Из 9 страниц с ≥10 кликами 7 защищены. У трёх из них сейчас открыто окно замера. Незащищённых доноров два: `/ru/gpt-vs-chatgpt-sravnenie/` (12 кликов) и `/ru/blog/chat-gpt-online/` (20 кликов, но это кандидат на 301 по L2-06; ссылки с него не ставлю).
4. **Многие «слабые» страницы со спросом трогать нельзя.** Они конкурируют с владельцем интента: CGO, GCB, блог про AI-менеджера, пара Payme/Click, `chat-bot-dlya-sayta`, `/uz/gpt-bot-biznes-uchun/`. Ссылки на них усилили бы каннибализацию (§3).
5. **Потолок перелинковки в кликах GSC маленький.** Восемь целей первой волны: Claude (не оценить) + оплата (+4…+24) + 5 B2B-целей (+19) + 3 UZ-цели (+7). Итого **≈ +30…+50 кликов за 28 дней** даже в случае «все в топ-3». Самый большой рычаг — узбекские школьные гайды: у них большой измеренный спрос, но мало показов. Однако их доноры защищены, поэтому это волны 2–3 (§6).

## 2. Граф: доноры и PageRank

### 2.1 Топ-20 по внутреннему PageRank

| # | URL | Показы / клики 28 д | Входящих (всего / из текста / nav) | Исходящих |
|---|---|---|---|---|
| 1 | `/ru/gpt-chat/` | 94 001 / 280 | 190 / 23 / 188 | 17 |
| 2 | `/ru/blog/` | 43 / 0 | 185 / 0 / 184 | 115 |
| 3 | `/` | 320 / 6 | 187 / 3 / 186 | 294 |
| 4 | `/ru/avtor-boris-gerasimov/` | 5 / 0 | 180 / 177 / 1 | 16 |
| 5 | `/uz/gpt-uzbek-tilida/` | 74 002 / 489 | 118 / 24 / 110 | 27 |
| 6 | `/uz/blog/` | 3 / 0 | 107 / 0 / 104 | 59 |
| 7 | `/uz/` | 39 / 1 | 108 / 2 / 107 | 47 |
| 8 | `/uz/muallif-boris-gerasimov/` | 0 / 0 | 102 / 98 / 1 | 13 |
| 9 | `/ru/ai-bot-dlya-biznesa/` | 48 / 0 | 114 / 27 / 71 | 32 |
| 10 | `/ru/internet-reklama-tashkent/` | 25 / 1 | 92 / 14 / 70 | 36 |
| 11–20 | `/uz/biznes-uchun-ai-bot/`, `/ru/seo-prodvizhenie-saytov-tashkent/`, `/ru/stoimost-chat-bota/`, `/ru/telegram-ads-uzbekistan/`, `/ru/smm-prodvizhenie-tashkent/`, `/ru/targetirovannaya-reklama-tashkent/`, `/uz/chat-bot-narxi/`, `/uz/smm-xizmatlari/`, `/uz/seo-xizmati/`, `/ru/kontekstnaya-reklama-tashkent/` | от 4 до 500 показов, 0–1 клик | 60–87 / 4–30 / 47–75 | 18–30 |

### 2.2 Доноры (≥10 кликов за 28 дней)

| URL | Клики / показы | Защищена | Исходящих | Куда сейчас ведёт текст (body) | Окно / ограничение |
|---|---|---|---|---|---|
| `/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/` | 557 / 23 438 | да | 15 | UZ-чат, promptlar, VPN-статья, `/uz/biznes-uchun-ai-bot/`, `/uz/chat-bot-narxi/`, а также **не по теме** `/uz/sayt-yaratish/` («sayt yaratish»), `/uz/blog/marketing-nima/` («marketing»), `/uz/blog/smm-nima/` («SMM») — `body[28]–[30]` | П-CTR, чтение ≈06–10.11 (G8); ревизия R-S2 ≈16.11 (L2-04) |
| `/uz/gpt-uzbek-tilida/` | 489 / 74 002 | да | 27 | 18 целей, из школьных гайдов — insho, referat, rezyume, slayd, talabalar | 28-дневное чтение сниппетов с 24.10 |
| `/ru/gpt-chat/` | 280 / 94 001 | да | 17 | 14 целей; оплаты, Claude, аналогов нет | то же, ≈25.11 |
| `/uz/blog/chatgptga-qanday-kirish-mumkin/` | 50 / 11 707 | да | 12 | UZ-чат, qo‘llanma, VPN, скачивание, promptlar, 3 B2B | тело менялось 23.10 (G6) |
| `/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/` | 45 / 745 | да | 11 | `/ru/gpt-chat/`, UZ-чат, UZ-статья про VPN, B2B-сравнение | R-S1 ≈05–07.11 |
| `/ru/blog/chatgpt-i-claude-v-uzbekistane/` | 38 / 958 | да | 11 | только `/ru/gpt-chat/` и страница автора; на оплату не ведёт, хотя есть H2 «Как оплатить» | то же |
| `/ru/blog/chat-gpt-online/` | 20 / 1 966 | нет | 12 | `/ru/gpt-chat/`, `/ru/gpt-dlya-biznesa/`, `/ru/tarify-ai-chat/`, `/ru/telegram-ads-uzbekistan/` | кандидат на 301 (L2-06, C23) — донором не беру |
| `/uz/blog/chatgpt-uzbek-tilida-promptlar/` | 16 / 857 | да | 14 | UZ-чат, A-4, talabalar, B2B | R-S1 |
| `/ru/gpt-vs-chatgpt-sravnenie/` | 12 / 2 334 | нет | 21 | 9 RU-гайдов; оплаты и Claude нет | — |

Источник: `l5_donors.tsv`, `l5_edges.json`; окна — `scripts/seo-protection.ts:100-143`, `src/shared/site-chat-nav.ts:16-19`, L2 §4.

## 3. Спрос против входящих: 26 страниц с ≥50 показами и ≤2 ссылками из текста

| URL | Показы / клики / поз. | Из текста / related / всего | Решение |
|---|---|---|---|
| `/ru/blog/chat-gpt-online/` | 1 966 / 20 / 6,4 | 1 / 2 / 4 | **не ссылаться**: C23, cannibalization.md §0 п.3, L2-06 (301) |
| `/ru/blog/chatgpt-i-claude-v-uzbekistane/` | 958 / 38 / 4,1 | 2 / 1 / 5 | **цель** W1-02…05, W2-02, W3-05 |
| `/ru/blog/chto-takoe-lid-v-marketinge/` | 376 / 1 / 19,9 | 1 / 5 / 7 | **цель** W1-09 |
| `/ru/blog/gpt-chat-bot-na-russkom-i-uzbekskom-kak-rabotaet/` | 226 / 1 / 9,5 | 0 / 1 / 3 | **не ссылаться**: конкурирует с RU-чатом за «чат гпт на узбекском» (C38; 04_TARGET_URLS — DO NOT LINK) |
| `/ru/blog/chat-bot-dlya-sayta/` | 174 / 1 / 75,7 | 0 / 2 / 4 | **не ссылаться**: конкурирует с владельцем B-7 `/ru/ai-chat-dlya-sayta/` (04) |
| `/ru/blog/skolko-stoit-smm-i-vedenie-instagram-uzbekistan/` | 125 / 2 / 7,8 | 0 / 3 / 5 | **цель** W1-08 (спица smm-ru, у хаба только карточка) |
| `/ru/instagram-direct-bot/` | 115 / 0 / 9,7 | 2 / 28 / 30 | не слабая: 30 входящих |
| `/ru/blog/telegram-bot-s-oplatoy-payme-click/` | 105 / 1 / 7,3 | 0 / 3 / 5 | **не ссылаться**, пока владелец не решит: делит «payme telegram bot» 51/49 с `priem-oplaty-…` (cannibalization.md, строка 176) |
| `/ru/blog/chto-takoe-ai-menedzher-i-kak-on-rabotaet/` | 100 / 0 / 16,2 | 0 / 2 / 4 | **не ссылаться**: семейство «ai менеджер» отдано B-4 (K11; 04 DO NOT LINK) |
| `/uz/gpt-uzbek-tilida-ai-chat/` (A-4) | 96 / 0 / 7,6 | 2 / 4 / 7 | **цель** W1-12 |
| `/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/` | 94 / 1 / 5,4 | 0 / 1 / 3 | **цель** W1-11 (51 % показов видимых запросов — из Узбекистана) |
| `/ru/blog/telegram-ads-ili-posevy-v-kanalah/` | 93 / 0 / 34,6 | 2 / 8 / 11 | позиция 34,6 — дело в контенте, не в ссылках |
| `/ru/blog/ai-bot-uzbekskiy-yazyk-kak-rabotaet/` | 80 / 1 / 8,3 | 0 / 4 / 6 | резерв (видимые запросы мусорные: «ai68349» и подобные) |
| `/ru/blog/telegram-ads-stoimost-i-zapusk-uzbekistan/` | 80 / 3 / 3,8 | 1 / 3 / 5 | уже на 3,8; хаб ссылается из текста |
| `/ru/ai-bot-dlya-salona-krasoty/` | 78 / 0 / 7,6 | 1 / 8 / 10 | резерв |
| `/ru/blog/instagram-direct-bot-kak-rabotaet/` | 78 / 0 / 28,3 | 1 / 1 / 3 | позиция 28 — контент (C3) |
| `/ru/blog/ai-menedzher-dlya-instagram/` | 66 / 0 / 18,1 | 0 / 1 / 3 | **не ссылаться** (семейство K11) |
| `/uz/gpt-bot-biznes-uchun/` | 63 / 0 / 12,1 | 2 / 15 / 17 | **не ссылаться**: конкурирует с B-5 (04) |
| `/ru/blog/chto-takoe-smm-prodvizhenie/` | 62 / 0 / 15,2 | 0 / 5 / 7 | резерв |
| `/ru/ai-bot-dlya-yurista/` | 61 / 0 / 5,3 | 0 / 1 / 3 | **цель** W1-06 (PageRank: 294-е место из 300) |
| `/ru/blog/cpa-cpm-cpc-cpl-v-reklame/` | 61 / 0 / 9,9 | 1 / 3 / 5 | **цель** W1-10 |
| `/ru/blog/besplatnyy-chat-bot-chto-realno-besplatno/` | 60 / 0 / 7,4 | 1 / 2 / 4 | резерв |
| `/ru/blog/pochemu-reklama-v-instagram-ne-prinosit-zayavki/` | 60 / 1 / 8,5 | 2 / 9 / 11 | не слабая |
| `/ru/blog/telegram-mini-app-chto-eto/` | 60 / 0 / 11,0 | 2 / 3 / 5 | резерв |
| `/ru/ai-bot-dlya-horeca/` | 54 / 1 / 7,1 | 0 / 5 / 7 | резерв |
| `/ru/blog/kak-provesti-audit-digital-marketinga/` | 52 / 0 / 7,1 | 2 / 2 / 4 | резерв |

Источник: `l5_inbound_by_type.tsv`; доля Узбекистана — `raw/gsc_page_28d_uzb.tsv`.

**Оговорка про аудиторию.** У RU-гайдов, которые служат источниками в волне 1, почти все показы видимых запросов приходят не из Узбекистана: sravnenie 2 % (52 из 2 334), chat-gpt-na-russkom 1 %, chto-takoe-gpt 7 %, gde-polzovatsya 18 %. У целей: оплата 25 %, Claude 8 %. Клики оттуда остаются кликами, но к B2B-заявкам из Узбекистана они имеют мало отношения (L1 §2 и S8).

## 4. Анкоры, которые уже противоречат карте интентов

`l5_anchor_check.py` сравнил все анкоры с `mustNotTarget` их цели. Найдено 23 совпадения. Ниже — реальные нарушения; остальные — ложные срабатывания на подстроку (например, «Что входит в услуги SMM-специалиста» содержит «услуги smm», но это собственная фраза цели).

| # | Где | Сейчас | Нарушает | Исправить на |
|---|---|---|---|---|
| H-1 | `content/blog/ru/chat-gpt-na-russkom.json` `internalLinks[1]` | → CGO «чат GPT онлайн» | C23: эту фразу CGO таргетировать нельзя; CGO не получает ссылок | удалить элемент |
| H-2 | `content/blog/ru/chat-gpt-online.json` `internalLinks[1]` | → `/ru/blog/chat-gpt-na-russkom/` «Chat GPT на русском» | C10, K6 | «Как пользоваться AI-чатом на русском» |
| H-3 | `content/blog/ru/zakazat-telegram-bota.json` `internalLinks[7]` | то же | C10, K6 | то же |
| H-4 | `content/blog/ru/zakazat-telegram-bota.json` `body[34]` (`chatgpt1`) и `internalLinks[6]` | → CGO «чат GPT онлайн» / «Чат GPT онлайн: как пользоваться» | C23 | `body[34]`: цель `/ru/gpt-chat/`, анкор «ИИ-чат GPTBot.uz» (фраза зовёт попробовать чат); `internalLinks[6]` удалить |
| H-5 | `content/blog/uz/chatgpt-uzbek-tilida-promptlar.json` `internalLinks` → insho | «insho va referat yozish» | C30: insho не таргетирует «referat yozish» | «insho va esse yozish» (страница защищена → вместе с W2-06) |

## 5. План: 24 вставки

Волна 1 — источники без защиты, можно выкатывать сейчас. Волна 2 — защищённые статьи после чтения окон (оплата, Claude и promptlar — после R-S1 ≈07.11; гайд по скачиванию — вместе с L2-04, R-S2 ≈16.11; гайд по входу — после чтения ревизии 23.10, ≈20.11). Волна 3 — оба чата после 28-дневного чтения сниппетов (≈25.11, та же дата, что у L2-06).

| ID | Источник (защита) | Файл → блок | Текст и анкор | Цель (показы / клики / поз.; из текста сейчас) |
|---|---|---|---|---|
| W1-01 | `/ru/gpt-vs-chatgpt-sravnenie/` (нет) | `content/pages/ru/gpt-vs-chatgpt-sravnenie.json` → новый `linkp` после `bodyBlocks[11]` (раздел id=dostup) | «Если понадобится платная версия самого ChatGPT, способы оплаты из Узбекистана и частые причины отказа карты разобраны в статье {pay}. Что известно о доступе к ChatGPT и Claude в регионе и как в них зарегистрироваться, — в материале {claude}.» pay = «как оплатить ChatGPT Plus из Узбекистана» | `/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/` (745 / 45 / 4,5; 4) |
| W1-02 | то же | тот же `linkp` | claude = «ChatGPT и Claude в Узбекистане: доступ и регистрация» | `/ru/blog/chatgpt-i-claude-v-uzbekistane/` (958 / 38 / 4,1; 2) |
| W1-03 | `/ru/chto-takoe-gpt-i-kak-polzovatsya/` (нет) | `…/chto-takoe-gpt-i-kak-polzovatsya.json` → `bodyBlocks[30]` | дописать: «Как сами ChatGPT и Claude работают для пользователей из Узбекистана, разобрано в статье {claude}.» claude = «ChatGPT и Claude в Узбекистане» | Claude |
| W1-04 | `/ru/gde-polzovatsya-gpt-besplatno/` (нет) | `…/gde-polzovatsya-gpt-besplatno.json` → `bodyBlocks[7]` | дописать: «Чем различаются бесплатные и платные тарифы ChatGPT и Claude для пользователей из Узбекистана, показывает {claude}.» claude = «сравнение ChatGPT и Claude в Узбекистане» | Claude |
| W1-05 | `/ru/blog/chat-gpt-na-russkom/` (нет) | `content/blog/ru/chat-gpt-na-russkom.json` → `body[27]` | второе предложение: «Какие ещё сервисы работают в Узбекистане, показывает {analogi}, а как зарегистрироваться в ChatGPT и Claude из Узбекистана, описано в {claude}; с чего начать разговор с ИИ по-русски и как проверить ответ, подскажет {talk}.» claude = «руководстве по ChatGPT и Claude в Узбекистане» | Claude |
| W1-06 | `/ru/ai-bot-dlya-biznesa/` (нет; PageRank — 9-е место) | `content/pages/ru/ai-bot-dlya-biznesa.json` → новый `linkp` после `bodyBlocks[12]` («Решения по нишам») + две записи `internalLinks` типа `niche` | «Отдельные сценарии описаны и для других ниш: {law} квалифицирует обращение и записывает на консультацию, а {food} ведёт клиента по меню, принимает заказ и сообщает его статус.» law = «AI-бот для юридической компании» | `/ru/ai-bot-dlya-yurista/` (61 / 0 / 5,3; 0) |
| W1-07 | то же | тот же `linkp` | food = «бот для службы доставки еды» | `/ru/ai-bot-dlya-dostavki-edy/` (31 / 1 / 5,2; 0) |
| W1-08 | `/ru/smm-prodvizhenie-tashkent/` (нет; хаб smm-ru) | `…/smm-prodvizhenie-tashkent.json` → `bodyBlocks[31]` | дописать: «Помесячная цена ведения Instagram по каждому пакету — в статье {insta}.» insta = «сколько стоит ведение Instagram в Узбекистане» | `/ru/blog/skolko-stoit-smm-i-vedenie-instagram-uzbekistan/` (125 / 2 / 7,8; 0) |
| W1-09 | `/ru/blog/cpa-cpm-cpc-cpl-v-reklame/` (нет) | `content/blog/ru/cpa-cpm-cpc-cpl-v-reklame.json` → новый `linkp` после `body[12]` (H2 «CPL и CPA») | «Что именно считать лидом, чем он отличается от клиента и как отсеивать нецелевые обращения, разобрано в статье {lead}.» lead = «что такое лид и какие лиды считать целевыми» | `/ru/blog/chto-takoe-lid-v-marketinge/` (376 / 1 / 19,9; 1) |
| W1-10 | `/ru/blog/chto-takoe-lid-v-marketinge/` (нет) | `content/blog/ru/chto-takoe-lid-v-marketinge.json` → новый `linkp` после `body[26]` (H2 «Как считать стоимость лида») | «Чем оплата за лид (CPL) отличается от оплаты за действие, клик и показы и когда какую модель выбирать, — в разборе {models}.» models = «моделей оплаты CPL, CPA, CPC и CPM» | `/ru/blog/cpa-cpm-cpc-cpl-v-reklame/` (61 / 0 / 9,9; 1) |
| W1-11 | `/uz/blog/target-reklama-nima/` (нет; 185 показов, 57 % — Узбекистан) | `content/blog/uz/target-reklama-nima.json` → новый `linkp` после `body[30]` | «Agar e’lon Direct’ga yozishga chaqirsa, javob tezligi ham natijaga ta’sir qiladi: Instagram Direct nima va unga AI-bot qanday javob berishi {direct} maqolasida tushuntirilgan.» direct = «Instagram Direct nima va AI-bot qanday ishlaydi» | `/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/` (94 / 1 / 5,4; 0) |
| W1-12 | `/uz/blog/insho-yozish-suniy-intellekt-bilan/` (нет; 309 показов, 43 % — Узбекистан) | `content/blog/uz/insho-yozish-suniy-intellekt-bilan.json` → новый `linkp` после `body[19]` | «So‘rovni o‘zingiz tuzmoqchi bo‘lsangiz, rol, vazifa, kontekst, format va cheklov qanday yozilishi {formula} qo‘llanmasida misollar bilan ko‘rsatilgan.» formula = «o‘zbek tilida prompt yozish formulasi» (по C28 эта фраза принадлежит A-4) | `/uz/gpt-uzbek-tilida-ai-chat/` (96 / 0 / 7,6; 2) |
| W1-13 | `/uz/blog/chatgpt-talabalar-uchun/` (нет) | `content/blog/uz/chatgpt-talabalar-uchun.json` → `body[16]`, последнее предложение | «Ishga yoki amaliyotga hujjat topshirayotgan bo‘lsangiz, {rezyume} tartibini o‘qing; ariza yoki tushuntirish xati kerak bo‘lsa — {ariza} qo‘llanmasiga qarang.» ariza = «ariza va tushuntirish xati yozish» | `/uz/blog/tushuntirish-xati-va-ariza-yozish/` (26 / 0 / 5,1; 3) |
| W2-01 | `/ru/blog/chatgpt-i-claude-v-uzbekistane/` (**да**) | `content/blog/ru/chatgpt-i-claude-v-uzbekistane.json` → новый `linkp` после `body[14]` (H2 «Как оплатить») | «Валюта списания, частые причины отказа карты и отмена подписки ChatGPT разобраны отдельно — в статье {pay}.» pay = «оплата ChatGPT из Узбекистана: карты и ошибки» | оплата |
| W2-02 | `/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/` (**да**) | `…/kak-oplatit-chatgpt-v-uzbekistane.json` → `body[24]`, новое второе предложение | «Что доступно в ChatGPT и Claude из Узбекистана и чем они отличаются, — в {claude}.» claude = «сравнении ChatGPT и Claude для пользователей из Узбекистана» | Claude |
| W2-03 | гайд по скачиванию (**да**, П-CTR) | `content/blog/uz/chatgpt-telefon-va-kompyuterga-yuklab-olish.json` → новый `linkp` после `body[27]` | «ChatGPT’ni o‘qishda halol ishlatish yo‘llari {students} maqolasida jamlangan; ariza yoki tushuntirish xati uchun tuzilma va shartli namuna — {ariza} qo‘llanmasida.» students = «talabalar uchun 20 ta usul» | `/uz/blog/chatgpt-talabalar-uchun/` (47 / 2 / 7,0) |
| W2-04 | то же | тот же `linkp` | ariza = «ariza va tushuntirish xatini qanday yozish». Опция владельца: убрать `body[28]–[30]` (sayt / marketing / SMM — не по теме гайда) | `/uz/blog/tushuntirish-xati-va-ariza-yozish/` |
| W2-05 | гайд по входу (**да**) | `content/blog/uz/chatgptga-qanday-kirish-mumkin.json` → `body[24]` | дописать: «…o‘qishda halol foydalanish usullari — {students} maqolasida.» students = «o‘qishda AI’dan halol foydalanish usullari» | talabalar |
| W2-06 | promptlar (**да**) | `content/blog/uz/chatgpt-uzbek-tilida-promptlar.json` → новый `linkp` после `body[9]` (H2 «Ish, rezyume va hujjatlar…») + H-5 | «Ariza yoki tushuntirish xatining o‘zi kerak bo‘lsa, tuzilma va shartli namunalar {ariza} qo‘llanmasida.» ariza = «ariza va tushuntirish xati namunasi». Ссылку на rezyume **не** ставить: C36 «the library does not link back» | `/uz/blog/tushuntirish-xati-va-ariza-yozish/` |
| W3-01 | `/uz/gpt-uzbek-tilida/` (**да**) | `content/pages/uz/gpt-uzbek-tilida.json` → `bodyBlocks[52]` | «O‘qish uchun alohida yo‘riqnomalar bor: {slayd} (…), {referat}, {kurs}, {esse} hamda ishga hujjat topshirish uchun {rezyume} va {ariza}. Biznes boshlayotgan bo‘lsangiz — {reja}.» kurs = «kurs ishi tuzilmasi va namunasi». Записи C41/C42 сами откладывают эту правку раздела «Talaba…» на будущую ревизию | `/uz/blog/kurs-ishi-yozish/` (19 / 1 / 7,1) |
| W3-02 | то же | тот же `linkp` | ariza = «ariza va tushuntirish xati» | `/uz/blog/tushuntirish-xati-va-ariza-yozish/` |
| W3-03 | то же | тот же `linkp` | reja = «biznes reja tuzish tartibi» | `/uz/blog/biznes-reja-tuzish/` (5 / 0 / 7,2) |
| W3-04 | `/ru/gpt-chat/` (**да**) | `content/pages/ru/gpt-chat.json` → `bodyBlocks[1]` | дописать: «Подписку ChatGPT оформляют в аккаунте OpenAI: как оплатить её из Узбекистана — {pay}; что доступно в ChatGPT и Claude в регионе — {claude}.» pay = «оплата подписки ChatGPT из Узбекистана» | оплата |
| W3-05 | то же | тот же `linkp` | claude = «доступ к ChatGPT и Claude из Узбекистана» | Claude |

Как проверено: ни одной пары «источник → цель» в графе ещё нет. У W1-08, W1-09 и W1-10 сейчас есть только карточка `related`, контекстной ссылки нет. Все цели обслуживаются. ASCII-апострофов в узбекском тексте нет (`l5_link_plan.json`, проверка в сессии). Ни один анкор не совпадает с `mustNotTarget` цели. Нет точных «chatgpt kirish» и «чат джипити». Не используются фразы, которые принадлежат RU-чату («чат gpt онлайн», «… бесплатно») и CGO.

## 6. Возможности

### L5-01. RU: оплата и «ChatGPT и Claude» — 5 ссылок с незащищённых гайдов *(волна 1)*
- **Факты.** У Claude 958 показов, 38 кликов, позиция 4,1, CTR 3,97 %. Ссылок из текста 2, место в PageRank — 232. У оплаты 745 / 45 / 4,5, CTR 6,04 % (высший среди страниц с ≥500 показами), ссылок из текста 4, место в PageRank — 210. Ни sravnenie (2 334 показа, 12 кликов), ни chto-takoe-gpt, ни gde-polzovatsya, ни chat-gpt-na-russkom не ведут на Claude. На оплату не ведёт sravnenie.
- **Что сделать.** W1-01…W1-05 (§5). Обновить `updatedAt`/`dateModified` правленых документов. Это сдвинет `lastmod` в sitemap (`scripts/generate-sitemap.ts:150`). Оболочка `/` не меняется: она сортирует по `datePublished` и выводит title (`scripts/prerender-home.ts:118-135`). Правки свести одним коммитом с L2-01 (sravnenie, chto-takoe) и L2-03 (gde-polzovatsya), чтобы не открывать новых окон замера.
- **Эффект.** unknown. Потолок по оплате: «chatgpt uzbekistan» 74 показа (поз. 5,8, 0 кликов) × CTR страницы 6,04 % ≈ **+4**. Если страница выйдет в топ-3 по «chatgpt plus» (720/мес, L3 §4.2): 720 × 28/30,4 × 3,59 % ≈ **+24**. По Claude не оценить: CTR уже выше ячейки позиции 3, а видимых запросов в page+query 80 показов из 958 (31 строка, 2 клика).
- **Трудоёмкость** S, **риск** низкий. Защищённых контрактов не меняет: цели защищены, но внутренние ссылки входят только в контракт источника.

### L5-02. RU: перекрёстные ссылки оплата ↔ Claude и ссылки с RU-чата *(волны 2–3, защищено)*
- **Факты.** В статье про Claude есть H2 «Как оплатить: пошагово» (`body[13]`), но ссылки на гайд по оплате нет. Гайд по оплате для RU-читателя отправляет к UZ-статье про VPN (`body[24]`) и не ведёт на Claude. У RU-чата 94 001 показ и 14 целей в тексте. Ни оплаты, ни Claude среди них нет.
- **Что сделать.** W2-01 и W2-02 — в одной проверенной ревизии после чтения R-S1 (≈07.11). W3-04 и W3-05 — после 28-дневного чтения сниппетов RU-чата (≈25.11), вместе с L2-06.
- **Эффект.** unknown; потолок общий с L5-01 и не складывается с ним.
- **Трудоёмкость** M (ревизия базы `reviewed-protected-pages.json`), **риск** средний (смешение замеров, если выйти раньше окон).

### L5-03. UZ: школьные гайды получают ссылки от сильнейших UZ-доноров *(волны 2–3, защищено)*
- **Факты.** Гайд по скачиванию (557 кликов, 23 438 показов), гайд по входу (50 / 11 707) и promptlar (16 / 857) не ведут ни на один из гайдов tushuntirish-xati, kurs-ishi, biznes-reja. Не ведут на них и UZ-чат с его 74 002 показами: в `bodyBlocks[52]` есть только slayd, referat, esse, rezyume. На talabalar ссылок с гайдов по скачиванию и входу тоже нет. Показы гайдов за 28 дней: tushuntirish-xati 26 (поз. 5,1), kurs-ishi 19 (7,1), biznes-reja 5 (7,2). Измеренный спрос (`demand-policy.json`, loc 2860): tushuntirish xati 1 600, ariza yozish 3 600, ariza namunasi 590, kurs ishi 1 300 + kurs ishi namuna 1 900 (C42), biznes reja 1 000 + tuzish 260 + namuna 90 (C44).
- **Что сделать.** W2-03…W2-06 (скачивание → talabalar и tushuntirish-xati; вход → talabalar; promptlar → tushuntirish-xati + H-5) и W3-01…W3-03 (UZ-чат → kurs-ishi, tushuntirish-xati, biznes-reja). Гайд по скачиванию — одной ревизией с L2-04 (R-S2 ≈16.11). Тогда окно П-CTR перезапускается один раз, а не дважды. Опция владельца: удалить там же `body[28]–[30]` («sayt yaratish», «marketing», «SMM» — не по теме гайда; «sayt yaratish» — точный анкор хаба webdev-uz).
- **Эффект.** unknown. Потолок по GSC ≈ +0,5 (97 показов × 3,59 % − 3 клика). Потолок по спросу (все фразы трёх гайдов в топ-3): 10 340/мес × 28/30,4 × 3,59 % ≈ **342 клика за 28 дней**. Это верхняя граница, не прогноз.
- **Трудоёмкость** M, **риск** средний. Не ставить rezyume со страницы promptlar (C36).

### L5-04. UZ: три ссылки с незащищённых страниц *(волна 1)*
- **Факты.** На `/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/` нет ни одной ссылки из текста (94 показа, поз. 5,4; «instagram direct nima» 25, «direct nima degani» 14/1). На A-4 ведут из текста 2 страницы, одна из них защищена (96 показов, поз. 7,6). На tushuntirish-xati — 3 (26 показов, поз. 5,1).
- **Что сделать.** W1-11 (target nima → Direct), W1-12 (insho → A-4), W1-13 (talabalar → tushuntirish-xati).
- **Эффект.** unknown. Потолок по GSC: 94 × 3,59 % − 1 ≈ +2; 96 × 3,59 % ≈ +3; 26 × 3,59 % ≈ +1. Итого **≈ +7**. Спрос tushuntirish-xati учтён в L5-03.
- **Трудоёмкость** S, **риск** низкий.

### L5-05. RU B2B: ниши, спица SMM и пара «лид ↔ CPL» *(волна 1)*
- **Факты.** На yurista нет ссылок из текста: 61 показ, поз. 5,3, 3 входящих, PageRank — 294-е место из 300. Ни `/ru/ai-bot-dlya-biznesa/`, ни хаб `/ru/ai-bot-dlya-nishi/` на неё не ведут. Dostavki-edy: 31 / 1 / 5,2, 0 из текста. Спица smm-ru `skolko-stoit-smm-…`: 125 / 2 / 7,8, 0 из текста, у хаба только карточка. `chto-takoe-lid`: 376 / 1 / 19,9, 1 из текста. `cpa-cpm-…`: 61 / 0 / 9,9, 1 из текста. Друг на друга они ссылаются только карточками.
- **Что сделать.** W1-06…W1-10. Не обязательно и не считается в 24: в хабе `/ru/ai-bot-dlya-nishi/` добавить в `internalLinks` (и строкой в список `bodyBlocks[3]`) yurista, dostavki-edy, fitnes-kluba — их там нет.
- **Эффект.** unknown. Потолок по GSC: 2 + 0 + 2 + 12 + 2 ≈ **+19**. Доля Узбекистана в видимых запросах у целей низкая (лид 5 %, cpa 0 %, yurista 0 %).
- **Трудоёмкость** S, **риск** низкий.

### L5-06. Анкоры против C10/C23/C30 *(H-1…H-4 — волна 1; H-5 — с W2-06)*
- **Факты.** §4: 4 анкора на незащищённых страницах отдают CGO фразу RU-чата «чат GPT онлайн» и отдают chat-gpt-na-russkom запрещённую ему «Chat GPT на русском». Это прямо противоречит C23, C10, K6 и решению «CGO не получает ссылок» (cannibalization.md §0 п.3). Ещё 1 анкор на защищённой promptlar противоречит C30.
- **Что сделать.** H-1…H-4 сейчас. Если L2-06 выкатит 301 CGO, этот шаг уже сделан. H-5 — в ревизии W2-06.
- **Эффект.** unknown: убирает внутренние сигналы, которые тянут CGO на голову RU-чата (у CGO 95 % показов «чат gpt онлайн бесплатно», cannibalization.md §0 п.3).
- **Трудоёмкость** S, **риск** низкий.

### L5-07. Тест-ограждение для анкоров и списка «не ссылаться»
- **Факты.** Нарушения из §4 прошли все текущие тесты. `tests/seo-content-guards.test.ts:48` проверяет только `primaryKeyword` источника, а `tests/seo-cluster-quality.test.ts:173` — только долю одного анкора на хабе.
- **Что сделать.** Новый тест, например `tests/seo-anchor-intent.test.ts`, по логике `l5-data/l5_anchor_check.py`: 1) точный анкор (нормализованный регистр и апострофы) не равен фразе из `mustNotTarget` цели; 2) новые ссылки не ведут на URL со статусом DO NOT LINK из карты владельцев. Список стоит перенести в `intent-manifest.json`, а не держать его во внешнем CSV.
- **Эффект.** unknown — защищает от регресса.
- **Трудоёмкость** S, **риск** низкий.

## 7. Что сознательно не предлагается

- **Ссылки на CGO, GCB, блоги про AI-менеджера и AI-продавца, пару Payme/Click, `chat-bot-dlya-sayta`, `/uz/gpt-bot-biznes-uchun/`, `/ru/chat-bot-dlya-biznesa/`.** Эти страницы конкурируют с владельцами (§3; `04_TARGET_URLS.csv`).
- **Правки `/`.** Глубина и так 1. Главная защищена, а оболочка перечисляет всё.
- **Ссылки на гайд по входу и UZ-чат с анкорами kirish / login / ochish / yuklab.** Запрещено cannibalization.md §0 п.1 и п.5.
- **Студия презентаций.** Это уже L4-05 (L4 §8). Не дублирую.
- **Замена B2B-навигации в футере 13 B2C-страниц `pageType: 'blog'` на «ИИ-чат и гайды»** (`scripts/prerender.ts:1098-1113`). Ссылки шаблонные, эти страницы уже связаны карточками «Смотрите также», выгоду не измерить. Отложить.
- **Удаление B2B-ссылок с доноров как самостоятельная мера.** По A1 «removing links has no proven upside». Предлагается только как опция внутри ревизии гайда по скачиванию (W2-03/04).

## 8. Проверки перед выкатом

1. `node --import tsx --test tests/seo-link-graph.test.ts tests/seo-cluster-quality.test.ts tests/seo-content-guards.test.ts tests/seo-page-integrity.test.ts tests/blog-related-links.test.ts`. Ожидаемо: нет битых ссылок и ссылок через редирект. Ссылки кластеров smm-ru и target-uz остаются в своей локали. Узбекские апострофы корректны. Падения на `c0da2ecb`, которые уже были до этой работы, — см. G7 implementation-map.
2. Волна 1: `assertSeoProtection(dist)` должен пройти без изменения базы. Если упал — значит, задета защищённая страница, остановиться.
3. Волны 2–3: новая проверенная ревизия `docs/seo/evidence/…/reviewed-protected-pages.json` с хешем предшественника (G2). Меняются `internalLinks` и `bodyTextSha256` источников, title/H1/description — нет.
4. После выката: `submit_indexnow_urls` для правленых URL (бесплатно). Через 28 дней сравнить равные окна GSC по целям; в Узбекистане и вне его — раздельно.

## 9. Ограничения

- Граф построен по пререндеренному HTML. Ссылки, которые React добавляет после гидрации, не видны. Для статей и лендингов пререндер полный (G4, L4 §2).
- Срез по Узбекистану содержит только видимые запросы. Доли Узбекистана в §3 занижены для страниц с длинным анонимизированным хвостом (L1 §2).
- PageRank считается по уникальным рёбрам без весов позиции в блоке. Это ориентир распределения, а не то, как считает Google.
- Объёмы спроса — Google Ads (DataForSEO) из `demand-policy.json` с датами замеров 2026-10-04 и 2026-10-07. Новых замеров эта линза не делала (лимит кредитов 0).
- Внешних ссылок (backlinks) линза не видела. «Донор» здесь определён по кликам GSC, как требует задача.
