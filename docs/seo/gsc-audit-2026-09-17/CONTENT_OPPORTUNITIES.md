# Content Opportunities — gptbot.uz (по GSC 18.08–14.09.2026)

## Формула приоритизации (реализована в `scripts/analysis.py`, колонки в `csv/queries_quick_wins.csv`)

```
Opportunity Score = norm_impressions × top10_proximity × commercial_relevance × service_fit × improvement_probability ÷ difficulty × 100

norm_impressions        = log10(1 + показы_28д) / log10(1 + макс_показы_28д)
top10_proximity         = 1,0 при позиции 4–10; 0,7 при 11–15; 0,4 при 16–20; 0,15 при 21–30; 0,05 при >30; 0,5 при 1–3 (рост только через CTR)
commercial_relevance    = вес кластера для выручки: боты/Telegram/Instagram 1,0; лиды/SMM/Telegram Ads 0,9; SEO/сайты/реклама 0,8; chatgpt_online 0,6; download/login/payment 0,5; prompts/translate/vpn/alternatives 0,4; ai_general 0,3; other 0,1; нерелевантные 0
service_fit             = есть ли страница под тему: 1,0 (есть), 0,6–0,7 (только статья/частично), 0
improvement_probability = 0,8 если CTR < 50% медианы диапазона; 0,6 если < 100%; 0,4 иначе
difficulty              = 1 (сниппет на существующей странице, поз. ≤ 10 и CTR ниже медианы), 2 (расширение/перелинковка, поз. ≤ 20), 3 (новая страница / переработка)
```

Веса — экспертные и явные; при изменении пересчёт одной строкой.

## Какие темы Google уже связывает с сайтом

1. **ChatGPT на узбекском**: скачать / войти / открыть / онлайн / бесплатно / перевод / промпты / VPN / оплата — 60 873 показа на позициях 4–10. Это ядро.
2. **AI-чат на русском** для Узбекистана: «чат gpt на русском», «чат с ии», фонетические варианты — сотни показов, позиции 6–19.
3. **Услуги** (по убыванию показов): SEO-продвижение (в основном RU/UA география), автоматизация заявок/лиды (в основном глоссарий «лид это»), чат-боты для бизнеса, SMM, реклама, Instagram Direct, Telegram-боты, Telegram Ads, сайты.

## Где одна страница закрывает слишком много интентов

- /uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/ (2 034 слова, 14 H2): «работает ли», «VPN», «регистрация OpenAI», «оплата картой», «альтернативы», «чем отличается личный чат от бизнес-бота» — и получает «kirish»-запросы вместо login-статьи. Сузить до «работает ли в Узбекистане / VPNsiz / rasmiy», остальное — ссылками.
- /ru/gpt-chat/ (633 слова): русская страница чата принимает узбекские запросы («uzbekcha online», «jaji piti», «tarjima», «yozish») — интенты «перевести», «написать» не имеют своих узбекских страниц.

## Улучшить существующие страницы (не создавать новые)

| Страница | Спрос (запросы, показы 28д, позиция) | Что добавить/изменить | Оценка |
|---|---|---|---|
| /uz/blog/chatgptga-qanday-kirish-mumkin/ | chatgpt kirish 24 641 (7,4); chatgpt ochish 3 237 (6,1); chatgpt online kirish 136 (5,3); chatgpt ga kirish 122 (8,0) | title/H1/description с «kirish»+«ochish» (сохранить «login» как синоним); H2 «ChatGPT ochish: 3 qadam»; краткий ответ в первом абзаце; сохранить блок «rasmiy sayt» и вход в чат GPTBot | P1, сложность 1 |
| /uz/gpt-uzbek-tilida/ | chatgpt bepul kirish 2 206 (8,4); chatgpt kirish uzbek tilida 2 014 (5,9); chatgpt uzbekcha 984; chatgpt uzbekcha bepul 967; chatgpt 4 uzbek tilida 112 (0 кликов); chatgpt uzbek 102 | title с «kirish» и вариантом «uzbekcha»; первый абзац с написаниями «uzbekcha / o‘zbekcha / ChatGPT uzbek tilida»; H2 про «ChatGPT 4 / bepul» условия; не превращать в инструкцию входа в OpenAI | P1, сложность 1 |
| /uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/ | chatgpt yuklab olish kompyuter uchun 132 (7,2, 0 кликов); chatgpt uzbek tilida skachat 100 (7,7); chatgpt yuklash apk 65 (4,6%); chatgpt o'rnatish 69 | «kompyuter» в title; H2 «Kompyuter uchun ChatGPT (Windows/macOS)»; блок APK-безопасности — уже есть; ссылка на login-статью вместо собственного раздела про вход | P2 (лидер; после T01/T03), сложность 1 |
| /uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/ | chatgpt ga kirish 25; chatgpt 4 uzbek tilida 21 (делит с чатом) | убрать «kirish» из title/H1: «ChatGPT O‘zbekistonda ishlaydimi? VPNsiz va rasmiy usul (2026)»; сократить разделы про регистрацию и оплату до ссылок | P1 (снятие каннибализации), сложность 1 |
| /ru/gpt-chat/ | 25 узбекских запросов, 3 199 показов | над первым экраном ссылка «ChatGPT o‘zbek tilida — o‘zbekcha versiya» на /uz/gpt-uzbek-tilida/; не добавлять узбекский текст на русскую страницу | P1, сложность 1 |
| /ru/luchshie-razrabotchiki-chat-botov-tashkent/ | разработка чат ботов ташкент 23 из UZ (42,9); чат бот на заказ ташкент 25 (45,4); toshkentda chat bot yaratish 7 | коммерческая рамка title/H1 («Разработка чат-ботов в Ташкенте: Telegram, Instagram, AI»), цены (ссылка на /ru/stoimost-chat-bota/), кейсы Cake City/Graver, форма/Telegram CTA; ссылки с /ru/stoimost-chat-bota/, /ru/razrabotka-telegram-bota-tashkent/, /ru/blog/razrabotka-chat-bota/ | P2, сложность 2 |
| /ru/seo-prodvizhenie-saytov-tashkent/ (3 050 слов) | seo ташкент 30 (38,3); seo в ташкенте 22 (45,6); seo продвижение цена 7 (12,4); продвижение сайта 11 (13,8) | FAQ «Сколько стоит SEO в Ташкенте» с фактическими тарифами (уже есть — вынести выше), H2 «SEO Ташкент: локальные факторы»; ссылка из /ru/blog/chto-takoe-seo-prodvizhenie/ | P3, сложность 2 |
| /ru/promty-gpt-chatgpt-50-primerov/ | не индексируется; UZ-пара 478 показов | уникальные RU-промпты с примерами ответов, перелинковка с /ru/gpt-chat/ и /ru/blog/chat-gpt-na-russkom/; после — запрос индексации | P2, сложность 2 |
| /ru/blog/chto-vhodit-v-uslugi-smm-specialista/ | услуги смм специалиста 78 (9,2, 0 кликов) | description с прямым ответом (состав работ, цена «от»), ссылка на /ru/smm-prodvizhenie-tashkent/ | P3, сложность 1 |

## Нужна отдельная страница (подтверждённый спрос, нет владельца)

| Тема | Доказательство | Формат | Обоснование |
|---|---|---|---|
| ChatGPT bilan tarjima (перевод на узбекском) | chatgpt tarjima 337 (6,5); chatgpt uzbekcha tarjimon 57 (4,7); chatgpt tarjimon 17 — всего 463 показа/28д, 5 кликов, приземляются на /ru/gpt-chat/ | UZ how-to статья с примерами промптов перевода uz↔ru↔en и входом в чат | интент «перевести» не покрыт ни одной страницей; P2 |
| ChatGPT’da o‘zbek tilida yozish (тексты) | chatgpt yozish 243 (8,9) на /ru/gpt-chat/; есть /uz/blog/insho-yozish-suniy-intellekt-bilan/ (только сочинения) | расширить insho-статью до «matn, xat, post, referat yozish» или отдельный гайд | P2 |
| «savollarga javoblar beruvchi bot» (UZ, 26 показов, 8,3) и «telegram bot buyurtma o'zbekiston» (19, 9,8) | узбекские коммерческие формулировки без точной страницы | усилить /uz/telegram-bot-biznes-uchun/ и /uz/biznes-uchun-ai-bot/ формулировками «savollarga javob beruvchi bot», «buyurtma» — без новой страницы | P3 |

## Кейсы и доверие

Коммерческие страницы (/ru/ai-bot-dlya-biznesa/, /ru/stoimost-chat-bota/, /uz/chat-bot-narxi/) содержат цены и FAQ, но кейсы живут в блоге (/ru/blog/keys-cake-city-…, /ru/blog/keys-graver-studio-…). Добавить короткие блоки «Кейс» с цифрами и ссылкой на сервисных страницах, а не создавать новые страницы кейсов.

## Что создавать НЕ нужно

- Общие RU-запросы «seo продвижение», «продвижение сайтов», «что такое сео» (≈ 1 750 показов на позициях 50–70, преимущественно Россия/Украина): не целевая география, высокая конкуренция, нулевая конверсия в услуги в Ташкенте.
- Глоссарий «лид / лид это / что такое лид» (881 показ, позиции 24–30, из UZ — 8 показов): информационный, нецелевой.
- Городские дубли («чат-бот в Самарканде» и т. п.): спрос в GSC — единицы показов.
- Страница «ChatGPT login» на русском: RU-спрос «вход в чат гпт» в данных отсутствует.
- Переписывание всех 24 длинных title разом: у этих страниц 20–90 показов; править по мере работы с кластером.
- FAQ ради rich results: Google не показывает FAQ-расширения для коммерческих сайтов; FAQ оставлять только как контент.
