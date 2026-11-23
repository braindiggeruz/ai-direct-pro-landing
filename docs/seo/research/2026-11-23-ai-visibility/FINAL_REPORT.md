# Итоговый отчёт: видимость gptbot.uz в ответах ChatGPT и других ИИ (23.11.2026)

ТЗ владельца от 23.11.2026, анализ — `ANALYSIS.md`, сверка с продом — `VERIFICATION.md` (строки 1–24). Все волны выпущены по схеме «ветка → PR → тесты → merge → деплой → проверка прода → IndexNow».

## Что опубликовано

| URL | Язык | Главный вопрос | Тип | PR |
|---|---|---|---|---|
| — (`llms.txt`: блок цен услуг, быстрые ответы; скрипт `check-entity-consistency.ts`) | EN | Сколько стоят услуги, как связаться | Данные для ИИ | [#85](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/85) |
| `/ru/oferta/`, `/uz/oferta/` (редакция v7: адрес в футере) | RU, UZ | Один адрес на всех страницах | Правка | [#86](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/86) |
| `/uz/blog/ozbekcha-ai-chatlar-taqqoslash/` | UZ | O‘zbek tilida bepul AI chat qaysi? | Сравнение с датой | [#87](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/87) |
| `/ru/blog/sravnenie-ai-chatov-na-uzbekskom/` | RU | Какой ИИ-чат понимает узбекский? | Сравнение с датой | [#87](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/87) |
| `/en/` | EN | What is GPTBot.uz? | О компании | [#88](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/88) |
| `/en/uzbek-ai-chat/` | EN | Free Uzbek AI chat without registration? | Гайд | [#88](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/88) |
| `/en/ai-presentation-maker/` | EN | AI presentation maker in Uzbek? | Гайд | [#88](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/88) |
| `/en/ai-chatbot-development-tashkent/` | EN | AI chatbot development in Tashkent — prices? | Услуга (обзор) | [#88](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/88) |
| `/en/pay-for-chatgpt-in-uzbekistan/` | EN | How to pay for ChatGPT Plus in Uzbekistan? | Гайд с источниками | [#88](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/88) |
| `/en/uzbek-ai-chats-compared/` | EN | Which AI chat understands Uzbek best? | Сравнение | [#88](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/88) |
| `/uz/blog/himoya-uchun-taqdimot/` · `/ru/blog/prezentatsiya-dlya-zashchity/` | UZ · RU | Презентация для защиты курсовой и диплома | Гайд (пара) | [#89](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/89) |
| `/uz/blog/biznes-reja-taqdimoti/` · `/ru/blog/prezentatsiya-biznes-plana/` | UZ · RU | 10 слайдов бизнес-плана | Гайд (пара) | [#89](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/89) |
| `/uz/blog/slayd-dizayni-qoidalari/` · `/ru/blog/pravila-oformleniya-slaydov/` | UZ · RU | Шрифт, цвет, контраст слайдов | Гайд (пара) | [#89](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/89) |
| `/uz/blog/ai-taqdimot-vositalari/` · `/ru/blog/prezentatsiya-s-ii-besplatno/` | UZ · RU | Какой ИИ делает презентации (на узбекском, бесплатно)? | Сравнение с датой (пара) | [#89](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/89) |
| `/ru/blog/kak-sdelat-prezentatsiyu/` | RU | Как сделать презентацию? | Гайд | [#89](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/89) |
| `/uz/blog/chatgpt-plus-tolov/` | UZ | ChatGPT Plus va Go’ga qanday to‘lash mumkin? | Гайд с источниками | [#90](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/90) |
| `/uz/blog/ai-obunalarga-tolov/` · `/ru/blog/oplata-ii-podpisok-iz-uzbekistana/` | UZ · RU | Как оплатить Claude Pro, Google AI Pro, Midjourney? | Гайд с источниками (пара) | [#90](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/90) |
| `/uz/blog/toshkentda-ai-bot-pudratchisini-tanlash/` | UZ | Как выбрать подрядчика на AI-бота? | Нейтральный чек-лист | [#91](https://github.com/braindiggeruz/ai-direct-pro-landing/pull/91) |

Итого 21 новый URL: 6 EN, 8 UZ, 7 RU. Sitemap: 427 → 448. Hreflang `en` добавлен трём незащищённым парам RU/UZ.

**Прод.** Последняя волна выложена 23.11.2026 в 07:02Z (`b72ac03c`). `check-entity-consistency` на проде: все 448 URL отвечают 200, адрес один, бренд пишется одинаково, hreflang взаимные. IndexNow отвечал 200 после волн 1c, 2a, 2b и 3.

## Расхождения анализа с реальностью (главное, полностью — `VERIFICATION.md`)

- `ANALYSIS.md` в репозитории не было — перенесён из docx.
- Адрес расходился только на двух офертах (из-за заморозки редакции v6) — исправлено редакцией v7.
- В `llms.txt` Studio и цены AI-пакетов уже были; не было цен AI-ботов, сайтов, SEO и ссылки на фид — добавлено управляемым блоком из тех же таблиц, что и фид.
- Хаб презентаций не нужен: `/uz/blog/slayd-tayyorlash/` уже владеет «slayd tayyorlash» (5 400 запросов в месяц) и закреплён тестами Studio.
- Узкие темы презентаций и «как оплатить …» почти без поиска в Google (≤10/мес), спрос — на названиях продуктов (gamma app 90 500, midjourney 9 900, gemini pro 4 400, chatgpt plus 720).
- Узбекский гайд «Instagram/Telegram → CRM» и русский чек-лист выбора подрядчика на сайте уже есть.
- Шаблон блога не выводит поле `intro` — ответ-первым абзац в новых статьях стоит первым блоком тела.
- Узбекского нет в списке языков Microsoft Copilot.

## Что не сделано и почему

- **Узбекская страница тарифов AI-чата** — demand-policy: у ключей вида «ai chat narxi» нет замеренной частотности; новые платные срезы ключей — с 21–22.12.2026. Тарифы по-узбекски есть на `/uz/tariflar/#ai-paket`.
- **Страница «какие карты работают: Uzcard, Humo, Visa»** — нет первоисточника о международном приёме Uzcard/Humo на их сайтах.
- **Список AI-чатов с оплатой Click/Payme** — по проверке это только GPTBot.uz; страница была бы рекламой.
- **Библиотека промптов** — интент принадлежит защищённой `/uz/blog/chatgpt-uzbek-tilida-promptlar/`.
- **Обновление гайдов Gemini/Claude/DeepSeek** — нужна отдельная сверка фактов; сайт DeepSeek 23.11 не открылся для проверки.
- **Кейсы** — только шаблон (`CASES_TEMPLATE.md`): задач, результатов и сроков от владельца пока нет.
- **Защищённые страницы, которые цитирует Copilot** (гайд скачивания, `/uz/gpt-uzbek-tilida/`, две RU-статьи об оплате и Claude) — не трогали: идут окна замера.

## TODO владельца

1. Факты по кейсам cakecity.uz, mirac.uz, deutschexrepte.com, bekcorp.uz — по форме из `CASES_TEMPLATE.md`.
2. Разместить профили из `OFFSITE.md` (Google Business Profile, 2GIS, LinkedIn, каталоги разработчиков) и прислать ссылки — добавлю их в `businessProfiles` (`sameAs`).
3. Telegram-канал компании для `sameAs` (личный @XGame_changerx в `sameAs` склеивает компанию и человека — решение L14).
4. ChatGPT Business Hub: название бренда «GPTBot.uz»; фид — `https://gptbot.uz/openai-product-feed.jsonl.gz`.
5. Cloudflare: для фида Browser Cache TTL → «Respect Existing Headers» (сейчас max-age 14400).
6. Опубликовать три статьи в медиа по темам из `OFFSITE.md` (публикует владелец).

## Что проверить не удалось

- Цифры Business Hub, Bing AI Performance и Search Console — кабинеты владельца; взяты из анализа как база.
- Файлы `TOP50_SEO_SITES_20261122.*` — на компьютере владельца; `OFFSITE.md` не сверен с ними.
- Canva: экспорт в PPTX и поддержка узбекского — справка закрыта для автоматической проверки (в сравнении — «не проверено»).
- Midjourney: список стран не приводится в проверенных статьях.
- Google AI Pro: цена для Узбекистана (страница тарифов отдаёт американский вариант).
- Uzcard/Humo за рубежом — первоисточника нет.

## Даты контрольных замеров

- **30.11.2026** — плановый прогон трекера OpenSEO (46 вопросов, из них 14 новых по темам волн; база: бренд в 5 из 32 ответов 23.11).
- **07.12.2026** (14 дней) и **21.12.2026** (28 дней) после деплоя всех волн 23.11: Business Hub — упоминания, клики, доли тем «презентации» (база 23,2%) и «платежи и карты» (2,8%); Bing AI Performance — новые процитированные URL (`/en/`, презентации, оплата); трекер — нейтральные ответы с брендом и цитирования.
