# Полный SEO-roadmap GPTBot.uz — 2026-09-18 → 2027-03

Основание: GSC-аудит 2026-09-17 (property `sc-domain:gptbot.uz`, данные 21.05–14.09.2026), краул 289 URL, 42 URL Inspection, срез emerging-запросов (EMERGING_KEYWORDS.md). Все задачи — рекомендации; deploy, изменения GSC, DNS и robots — только по команде владельца.

## Стратегическая рамка

Сайт имеет два разных SEO-актива с разной экономикой:

| Актив | Что есть сейчас (28 дн.) | Что даёт бизнесу | Стратегия |
|---|---|---|---|
| **A. Узбекский ChatGPT-кластер** (скачать / войти / онлайн / бесплатно / перевод / промпты) | 60 873 показа на позициях 4–10, 97% кликов, растёт ×1,4 в неделю | пользователи собственного AI-чата → будущая подписка Plus; косвенно — узнаваемость бренда | защитить, снять внутреннюю конкуренцию, поднять CTR, закрыть непокрытые интенты, довести до чата |
| **B. Коммерческие услуги** (боты, Telegram/Instagram, SMM, SEO, сайты, реклама) | 3 925 показов, 2 клика; из Узбекистана 927 показов; позиции 20–60 | заявки на разработку/маркетинг | одна сильная страница на кластер, локальные сигналы, кейсы и цены, без массового контента |

Правила на весь период: canonical/URL лидеров не менять; одна волна — один тип фактора на кластер; каждая правка защищённой страницы — с обновлением baseline; никаких городских дублей, покупных ссылок, массовой подачи на индексацию.

## Фаза 0 — неделя 1 (22–28 сентября): база и сниппеты кластера «kirish»

| ID | Задача | Владелец | Готово когда | KPI (28 дн. после краула) |
|---|---|---|---|---|
| M0 | Зафиксировать baseline: `csv/`, `summary.json`, `summary_emerging.json`; еженедельный запуск `gsc_pull.py` | Analyst | папка неизменна, cron/напоминание на пятницу | — |
| T01 | Сниппет статьи входа под «kirish / ochish» (патч готов) | Content + Dev | HTML с новым title/H1/description; baseline обновлён | CTR «chatgpt kirish» 0,32% → ≥ 0,6% |
| T02 | VPNsiz-статья без «kirish» в title/H1 (патч готов) | Content + Dev | title/H1 без «kirish»; ссылка на login-статью | доля login-статьи по «ochish/kirish» ≥ 80% |
| T03 | Узбекский чат: «kirish» + «uzbekcha» в title (патч готов) | Content + Dev | title ≤ 65, hreflang цел | CTR «chatgpt kirish uzbek tilida» ≥ 0,9%, «bepul kirish» ≥ 0,7% |
| T04 | RU-чат: ссылка на UZ-версию над чатом (патч готов) | Content + Dev | `<a href=/uz/gpt-uzbek-tilida/>` до чата | доля UZ-страницы по «chatgpt uzbekcha online», «jaji piti online» растёт |
| T05 | 301 для двух 404 (патч готов) | Dev | curl → 301 | 404 исчезают из GSC |
| R1 | Релиз волны 1 одним деплоем через release CLI | Owner | check-production зелёный | — |

## Фаза 1 — недели 2–4 (29 сентября – 19 октября): гигиена, индексация, ожидание данных

| ID | Задача | Владелец | Готово когда | KPI |
|---|---|---|---|---|
| T06 | Sitemap: один источник правды (убрать/генерировать `sitemap-new.xml`, `sitemap-priority.xml`) | Dev + Owner | robots.txt объявляет только актуальные файлы; lastmod из контента | «sitemap per Google» у 10 ключевых URL через 4 нед. |
| T07 | Перекраул `/ru/telegram-bot-uzbekistan/` (Request indexing, ручное) | Owner | coverage ≠ 404 | — |
| T08 | Две RU-страницы «Crawled – not indexed» (`/ru/promty-gpt-chatgpt-50-primerov/`, `/ru/chto-takoe-gpt-i-kak-polzovatsya/`): уникализация, 2+ контекстные ссылки с `/ru/gpt-chat/` и `/ru/blog/chat-gpt-na-russkom/`, затем ручной запрос индексации | Content + Dev | ссылки в HTML | indexed через 3–4 нед. |
| T13 | Кластер главных `/`, `/ru/`, `/uz/`: решение по hreflang/canonical, правка `prerender-home.ts` и sitemap | Owner + Dev | hreflang согласован | бренд «gptbot» на одном URL |
| T14 | Длинные title (24) / description (32) — только у страниц с показами ≥ 20 | Content | ≤ 60 / ≤ 155 | — |
| E1 | Emerging: «chatgpt yozish» (243 показа, RU-чат) — раздел «O‘zbek tilida matn yozish» в UZ-чате + ссылка на insho-статью | Content | H2 в UZ-чате | «chatgpt yozish» → UZ-страница |
| C1 | Промежуточный взгляд на волну 1 через 14 дней (без решений) | Analyst | отчёт `checks/2026-10-1X.md` | — |

## Фаза 2 — месяц 2 (20 октября – 16 ноября): лидер, непокрытые интенты, коммерческий кластер

| ID | Задача | Владелец | Готово когда | KPI |
|---|---|---|---|---|
| C2 | Вердикт по волне 1 (28 полных дней) | Analyst | таблицы current/previous по кластеру | решение о T09 |
| T09 | «kompyuter» в title статьи о скачивании (только если волна 1 не ухудшила) | Content + Dev | baseline обновлён | CTR страницы 1,76% → ≥ 2,0% |
| T11 | Новая UZ-статья «ChatGPT bilan tarjima» (463 показа/28д без страницы) с входом в чат | Content | в sitemap, indexed, 2+ ссылки | показы «tarjima» на новой странице через 6–8 нед. |
| T12 | Расширить insho-статью до «insho, xat, post, referat yozish» | Content | H2 по типам | «chatgpt yozish» → UZ |
| E2 | Emerging «chatgpt bepul / bepul versiyasi / chatgpt 4 uzbek tilida» (≈ 370 показов): H2 «ChatGPT bepul reja va ChatGPT 4: shu sahifada nima bor» в UZ-чате | Content | H2 в HTML | клики по «chatgpt bepul» на UZ-странице |
| T10 | Единая страница «Разработка чат-ботов в Ташкенте» (`/ru/luchshie-razrabotchiki-chat-botov-tashkent/`): коммерческий title/H1, блок цен, 2 кейса, ссылки с 3 страниц | Content + Dev | одна цель в `query_page` | позиция «разработка чат ботов ташкент» из UZB 42,9 → ≤ 20 |
| E3 | Emerging UZ-коммерция: «savollarga javoblar beruvchi bot» (26, поз. 8,3), «telegram bot buyurtma o'zbekiston» (19, поз. 9,8) — формулировки в H2/FAQ `/uz/telegram-bot-biznes-uchun/` и `/uz/biznes-uchun-ai-bot/` | Content | H2/FAQ в HTML | клики по этим запросам (малая выборка) |
| P1 | Lighthouse mobile (лаборатория) для 4 лидеров | Dev | JSON-отчёты | LCP/INP/CLS зафиксированы |
| T19 | Скрипты аудита → `scripts/seo/gsc/`, npm-команды, еженедельный запуск | Dev | `probe` работает | — |

## Фаза 3 — месяц 3 (17 ноября – 20 декабря): масштабирование подтверждённого

| ID | Задача | Владелец | Готово когда | KPI |
|---|---|---|---|---|
| C3 | Вердикт по T09–T12, E1–E3 | Analyst | таблицы | — |
| T15 | SEO-сервис под локальные запросы («seo ташкент» 30, «seo продвижение цена» 7): FAQ с ценами выше, H2 «SEO Ташкент», ссылка из статьи | Content | FAQ/ссылка в HTML | позиция «seo ташкент» 38 → ≤ 20 |
| T16 | Instagram Direct: лендинг ↔ статья, H1 лендинга под формулировку | Content | одна цель | доля лендинга ≥ 80% |
| T17 | «instagram direct nima» — блок-определение в UZ-статье | Content | блок в HTML | клики (малая выборка) |
| T18 | «услуги смм специалиста» — description с ответом и ценой | Content | новый description | ≥ 1–2 клика/28д |
| E4 | Ревизия 7 проиндексированных страниц без спроса (`/ru/ai-bot-dlya-nishi/`, `/uz/biznes-nega-arizalarni-yoqotadi/`, `/uz/amocrm-bitrix24-bilan-ai-bot/`, `/ru/gpt-bot-ili-obychnyy-chat-bot/`, `/ru/blog/stoimost-lokalnogo-seo-v-tashkente/` и др.): обновить 2–3 с реальным спросом, остальные оставить | Content + Owner | решение по каждой | показы через 60 дн. |
| B1 | Кейсы на сервисных страницах (Cake City, Graver) как короткие блоки с цифрами | Content + Owner | блоки в HTML | — |
| B2 | Подготовка Plus-подписки в чате: воронка article_chat_click → chat_opened → message_sent (GA4), не SEO | Owner | события идут | доля сессий с первым ответом |

## Фаза 4 — месяцы 4–6 (январь – март 2027): удержание и второй эшелон

| Направление | Задачи | KPI |
|---|---|---|
| Узбекский ChatGPT-кластер | ежемесячная ревизия emerging-запросов (`emerging.py`); новые UZ-статьи только под подтверждённый спрос ≥ 200 показов/28д без владельца (кандидаты по данным: «chatgpt talabalar uchun», «chatgpt ilova» варианты, «chatgpt 4/5 uzbek tilida»); обновление дат по факту содержательной проверки | клики кластера ≥ +50% к базе при стабильной позиции; доля кликов в собственный чат |
| Коммерческий кластер | после T10/T15/T16 — вторая страница-цель (Telegram-бот или SMM) по тому же принципу; локальные упоминания (2ГИС, Google Business Profile — уже в roadmap 08/2026) | ≥ 10 кликов/28д по коммерческим запросам из UZB |
| Русскоязычный чат | «чат гпт на узбекском», «чатгпт онлайн», «джипичат»-фонетика: закрепить за `/ru/gpt-chat/` и `/ru/gpt-vs-chatgpt-sravnenie/` без новых страниц | CTR `/ru/gpt-vs-chatgpt-sravnenie/` 0,47% → ≥ 0,64% |
| Техника | ежеквартально: краул `site_crawl.py`, длины title/description, sitemap lastmod, редиректы; URL Inspection 20 URL/мес.; CWV после появления CrUX | 0 страниц с ошибками; sitemap per Google у всех ключевых URL |
| Измерение | еженедельный `gsc_pull.py` + `analysis.py` + `emerging.py`; месячный отчёт по MEASUREMENT_PLAN | — |

## Что не делаем

Городские дубли; RU-информационные темы «seo продвижение», «лид это» (география Россия/Украина); покупка ссылок; массовые title-правки; FAQ ради rich results; изменение canonical/URL лидеров; второй крупный рефакторинг до накопления данных по волне 1.

## Сводная очередь (приоритет → срок)

P1: T01, T02, T03, T04 (неделя 1). P2: T05, T06, T07, T08, T13, E1 (недели 1–4); T09, T10, T11, T12, E2, E3, T19 (месяц 2). P3: T14, T15, T16, T17, T18, E4, P1, B1 (месяцы 2–3). Продукт: B2.

Ссылки: задачи T — `IMPLEMENTATION_BACKLOG.md`, `csv/recommended_actions.csv`; патчи T01–T05 — `patches/`; emerging — `EMERGING_KEYWORDS.md`, `csv/queries_emerging.csv`; критерии успеха/отката — `QUICK_WINS.md`, `MEASUREMENT_PLAN.md`.
