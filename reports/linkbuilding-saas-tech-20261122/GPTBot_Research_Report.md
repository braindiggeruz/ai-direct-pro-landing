# GPTBot.uz — исследование площадок для размещения (SaaS / AI / Tech)

Дата проверки: **2026-11-22**. Все площадки проверены живыми HTTP-запросами, JS-страницы — в браузере (Chromium/Playwright). Метрики DA/DR/трафика не использовались (недоступны без платных сервисов → `N/A`).

## 1. Итог в цифрах

- **Принято в базу: 1566 уникальных корневых доменов** — из них **934 подтверждены полностью (VERIFIED)** и 632 частично (PARTIAL: площадка жива и тематична, но механизм не подтверждён до конца — нужен ручной шаг).
- Цель «1000 подтверждённых»: **не достигнута на 66** при строгом определении «подтверждено» (рабочая форма / раздел форума с разрешённой самопрезентацией / подтверждённая авторская программа). С учётом PARTIAL в базе 1566 площадок. Добирать до 1000 мусором или неподтверждёнными сайтами не стал — так требует ТЗ.
- TIER 1: **242**, TIER 2: **667**, TIER 3: **657**.
- В XRumer-файл попало **236** URL (строгий фильтр, см. §5). В ручной список — **1330** площадок + 352 сайтов «проверить в браузере».

| Показатель (из ТЗ) | Значение |
| --- | --- |
| Всего кандидатов найдено (строк из всех источников) | 5984 строк от 5 исследовательских потоков + 143 seed + 4302 хостов Discourse-скана + 3067 исходящих ссылок «снежного кома» + 165 из мета-каталогов |
| Уникальных корневых доменов проверено полным пайплайном | **5424** (5424 хостов); дополнительно 4302 Discourse-хостов прозвонены через JSON API |
| Площадок подтверждено (VERIFIED) | **934** |
| Частично подтверждено (PARTIAL, в базе) | 632 |
| Форумов (Technology Forum) | 419 (VERIFIED: 103) |
| SaaS-каталогов | 309 (VERIFIED: 231) |
| AI-каталогов | 699 (VERIFIED: 518) |
| Технологических сообществ / стартап-платформ | 139 (VERIFIED: 82) |
| TIER 1 / TIER 2 / TIER 3 | 242 / 667 / 657 |
| Исключено (REJECT) | 3797 доменов (в `GPTBot_Rejected.csv` перечислено 3310; ещё 438 шумовых — см. §6) + 61 только-платных вынесены в `GPTBot_Paid_Only.csv` |
| Дублей обнаружено | 1595 повторов при слиянии (одинаковый корневой домен из разных источников) + 24 дублей после редиректов |
| Потенциально совместимо с XRumer | POTENTIAL (классические движки форумов): 125; CUSTOM (нестандартная HTML-форма): 499; в XRumer-файл после строгих фильтров: 236 |
| Требуют ручного размещения | 1330 (MANUAL_ONLY: 917; с CAPTCHA: 497) + 352 «проверить в браузере» |

## 2. Важно до начала работы

1. **Референсный файл `GPTBot-NEW_300_BATCH2_1122.txt` в сессию не попал** (папки загрузок пустые, в репозитории и ветках его нет, у коннектора Google Drive не хватает прав). Поэтому дедуп против него **не применён**. Пайплайн готов: положите файл и выполните команду из §9 — все 5 файлов пересоберутся без его доменов, а в Rejected появится причина `IN_REFERENCE`. Крупные известные площадки (Product Hunt, BetaList, SaaSHub и т.п.), вероятно, есть и в референсе — после дедупа число «новых» снизится.
2. **Cloudflare/anti-bot.** 352 живых сайтов отдают автоматическим клиентам проверку «Just a moment…» (в т.ч. официальному WebFetch). Обходить защиту не стал: они вынесены в конец `GPTBot_Manual_Submission.txt` как «проверить в обычном браузере» и **не считаются подтверждёнными**. Среди них известные площадки (Product Hunt, There's An AI For That, SaaSHub, Toolify и др.).
3. **CAPTCHA = ручной режим.** Площадки с reCAPTCHA/hCaptcha/Turnstile на форме или регистрации не включены в XRumer-файл: CAPTCHA — прямой сигнал площадки против автоматизации.
4. **Форумы.** Автопостинг почти везде запрещён правилами. Даже на форумах с разделом Showcase публикуйте вручную, от живого аккаунта, по правилам раздела.

## 3. Методология

**Сбор кандидатов** (реальные URL, у каждого записан источник):
- 5 параллельных исследовательских потоков (AI-каталоги, SaaS-каталоги, стартап/тех-сообщества, международные форумы, RU/СНГ/Центральная Азия/EU): веб-поиск по запросам из ТЗ + разбор крупных списков (GitHub awesome-lists, подборки «300+ AI directories», feedspot, findaforum и т.д.).
- Discourse-скан: 4302 хостов из публичного списка Discourse-сообществ (archiveteam) прозвонены через `/about.json` и `/categories.json` → отобраны 130 активных тех-сообществ с разделами Showcase/Show and tell.
- «Снежный ком»: бейджи «Featured on / Listed on» на страницах принятых каталогов (2 витка) → 710 кандидатов; мета-каталоги (списки площадок) → 165.
- 143 seed-кандидатов из знаний аналитика (RU/СНГ-форумы, Telegram-каталоги, Discourse-сообщества) — прошли ту же проверку; неразрешившиеся (50) не выдаются за находки.

**Проверка каждого домена** (скрипты в `scripts/`):
1. Главная по HTTPS (фолбэк HTTP): статус, редиректы (в т.ч. на чужой домен), парковка/продажа домена, заглушки, спам-сигналы, язык, движок (XenForo, phpBB, vBulletin, MyBB, SMF, Discourse, IPB, Flarum, NodeBB, Vanilla, Khoros, WordPress, Next.js…).
2. Поиск механизма: ссылки «Submit / Add tool / List your… / Добавить…», внешние формы (Tally, Typeform, Google Forms, Airtable…), типовые пути (`/submit`, `/add-tool`…).
3. Анализ страницы отправки: форма с полем URL, логин-стена/редирект на вход, CAPTCHA, цены/оплата/«free», soft-404. JS-формы — повторно в браузере (Playwright), без заполнения и отправки.
4. Форумы: регистрация (страница открыта/закрыта/платная, CAPTCHA), разделы для самопрезентации, страница правил (запреты/разрешения рекламы), активность (Discourse/Flarum/NodeBB — через JSON API).
5. Активность: дата последнего поста / даты на странице / `sitemap.xml lastmod` (источник указан в колонке `last_activity`; lastmod иногда генерируется автоматически).
6. Ручной просмотр TIER 1 и TIER 2: исключены продукты, сервисы платной рассылки по каталогам, нишевые каталоги не по профилю, сети однотипных каталогов (одинаковые формы/шаблоны заголовков).

**Оценка 0–100** (рубрика ТЗ): тематика 30 + качество площадки 25 + возможность размещения 25 + активность 10 + доступность 10. Качество — по проверяемым признакам (HTTPS, объём контента, структура, отсутствие спама, число независимых упоминаний в списках, для форумов — активные пользователи/посты). TIER 1 ≥ 85, TIER 2 70–84, TIER 3 55–69, < 55 — REJECT.

**Статусы:** `VERIFIED` — механизм подтверждён (форма с URL-полем / внешняя форма / вход в кабинет перед отправкой / раздел форума с разрешённой самопрезентацией / официальная авторская программа). `PARTIAL` — площадка жива и релевантна, но механизм подтверждён не полностью (JS-форма не отрисовалась, форма без URL-поля, только регистрация/профиль, «условный» showcase).

## 4. Форумы: что реально разрешено

- `yes` — найден раздел для самопрезентации (Showcase, Website Reviews, «Showcase your website», «Announce your software»…): **31**
- `conditional` — showcase вендорского сообщества (только проекты, сделанные на их продукте; уместно, если GPTBot реально его использует): **72**
- `possible` — есть «Introductions»/общие разделы, правила самопродвижения не подтверждены: **69**
- `unverified` — тематичный активный форум, но подходящего раздела нет (только профиль/подпись/участие в обсуждениях): **247**
- Движки форумов в базе: Discourse 258, XenForo 63, vBulletin 22, phpBB 18, Custom 15, Invision 9, MyBB 7, WordPress 7, NodeBB 5, SMF 3

| Форум | Балл | Движок | Раздел | Доказательство |
| --- | --- | --- | --- | --- |
| talkingcity.com | 84 | vBulletin | section: Easy Ways to Tell People About Your Website | https://www.talkingcity.com/ |
| webmastersun.com | 84 | XenForo | section: Showcase Your Website; Share your website; Showcase Your Website  | https://www.webmastersun.com/ |
| ziggit.dev | 78 | Discourse | section: Showcase | https://ziggit.dev/c/showcase/7 |
| bizwarriors.com | 77 | XenForo | section: Showcase; Getting Local Businesses To Sell Your Products? | https://bizwarriors.com/forum/ |
| freewebspace.net | 77 | XenForo | section: Review my webdesign | https://www.freewebspace.net/forums/index.php |
| htmlforums.net | 77 | XenForo | section: Website Reviews | https://htmlforums.net/ |
| techist.com | 77 | XenForo | section: Gallery: Your Workstation; Web Design and Development | Site Revi | https://www.techist.com/forums/ |
| businessforum.uk | 76 | XenForo | section: Request a Website Review | https://www.businessforum.uk/ |
| caddy.community | 76 | Discourse | section: Showcase | https://caddy.community/c/showcase/12 |
| chiefdelphi.com | 76 | Discourse | section: FIRST > Robot Showcase; Technical > Website Design/Showcase | https://www.chiefdelphi.com/c/robot-showcase/37 |
| html5gamedevs.com | 76 | Invision | section: Game Showcase | https://www.html5gamedevs.com/ |
| ifnotnil.com | 76 | Discourse | section: Show & Tell | https://ifnotnil.com/c/show-tell/12 |
| realestatewebmasters.com | 76 | Discourse | section: Websites > Website Reviews | https://www.realestatewebmasters.com/forums/c/website-reviews/38 |
| affilorama.com | 75 | phpBB | section: Alternatives to AdSense for monetizing your websites | https://www.affilorama.com/forum/ |
| donationcoder.com | 75 | SMF | section: Announce Your Software/Service/Product; School Showcase (2) | https://www.donationcoder.com/forum/ |
| namepros.com | 75 | XenForo | section: Website Reviews and Appraisals | https://www.namepros.com/ |
| speckle.community | 75 | Discourse | section: Showcase! | https://speckle.community/c/showcase/21 |
| webmasters.ru | 75 | vBulletin | section: Витрина ссылок | http://webmasters.ru/ |
| superhuman.com | 74 | Discourse | section: Marketplace > Requests and Gigs; Showcase & Tips; Showcase & Tips | https://connect.superhuman.com/c/requests-gigs/40 |
| androidforums.eu | 73 | phpBB | section: Marketing Your Apps | https://androidforums.eu/ |

## 5. Правила формирования файлов

- `GPTBot_SaaS_Tech_XRumer_1000.txt` — только URL; включены только `VERIFIED` + TIER 1–3 + XRumer `POTENTIAL`/`CUSTOM` + **без CAPTCHA** + не платные страницы (order/checkout/pricing исключены); для каталогов — страница отправки с HTML-формой (видна без JavaScript), для форумов — страница регистрации при подтверждённом разделе самопрезентации. Итого **236** строк — меньше 1000, потому что остальное требует ручного шага. **Совместимость с XRumer не подтверждена** — `POTENTIAL` означает лишь поддерживаемый тип движка, `CUSTOM` — нестандартную форму, которую нужно проверить отдельно.
- `GPTBot_SaaS_Tech_Research.csv` — полная база принятых площадок (22 колонки из ТЗ, UTF-8 с BOM для Excel).
- `GPTBot_Manual_Submission.txt` — всё, что требует ручной работы, по tier и категориям, с подсказками (аккаунт, CAPTCHA, бесплатность, частичная проверка) + список «проверить в браузере».
- `GPTBot_Rejected.csv` — домен, код и конкретная причина исключения.
- `GPTBot_Paid_Only.csv` — площадки, где размещение похоже на только платное (вынесены отдельно, как требует ТЗ).

## 6. Причины исключения

| Код | Количество | Значение |
| --- | --- | --- |
| NOT_A_PLATFORM | 1426 | продукт/компания/медиа, а не площадка для размещения |
| OFF_TOPIC | 457 | нет связи с AI/SaaS/технологиями |
| DEAD | 403 | домен не отвечает (DNS/соединение; перепроверено повторно) |
| NO_MECHANISM | 400 | живой сайт, но механизм размещения не найден |
| UNVERIFIABLE_BOT_PROTECTION | 352 | онлайн, но anti-bot (Cloudflare и т.п.) блокирует автоматическую проверку |
| HTTP_ERROR | 271 | главная отдаёт HTTP 4xx/5xx |
| LOW_SCORE | 162 | балл < 55 |
| NOT_SUITABLE | 110 | площадка не подходит под профиль GPTBot.uz (ниша, регион, тип объекта) |
| SPAM | 69 | сигналы спама (казино/фарма/adult) |
| NETWORK | 65 | сеть однотипных каталогов |
| PARKED | 29 | припаркован / продаётся |
| DUPLICATE | 24 | дубль корневого домена / редирект на уже учтённый |
| NOT_LIVE | 19 | заглушка сервера / не живой сайт |
| RULES_PROHIBIT | 7 | правила форума запрещают самопродвижение |
| PRIVATE | 3 | закрытый форум (контент только после входа) |

Не перечислены в Rejected CSV (шум): 50 seed-доменов, которые не разрешились, и 388 исходящих ссылок «снежного кома», оказавшихся продуктами/мёртвыми/не по теме.

## 7. Лучшие подтверждённые площадки (TIER 1, VERIFIED)

### AI Tools Directory

| Домен | Балл | Тип | Бесплатно | URL отправки |
| --- | --- | --- | --- | --- |
| postlaunchkit.com | 96 | SUBMIT_FORM | yes | https://postlaunchkit.com/directory/submit/ |
| swaplink.run | 96 | SUBMIT_FORM | yes | https://www.swaplink.run/submit |
| aitoptools.com | 94 | SUBMIT_FORM | yes | https://aitoptools.com/claim-your-tool/ |
| best-ai.org | 94 | SUBMIT_FORM | yes | https://best-ai.org/submit-tool |
| bigkr.com | 94 | SUBMIT_FORM | yes | https://bigkr.com/submit |
| deeplaunch.io | 94 | SUBMIT_FORM | yes | https://deeplaunch.io/submit |
| iuu.ai | 94 | SUBMIT_FORM | yes | https://iuu.ai/submit |
| toolsfine.com | 94 | SUBMIT_FORM | yes | https://toolsfine.com/submit-ai-tools-or-product |
| aicenter.ai | 93 | SUBMIT_FORM | freemium | https://aicenter.ai/submit-tools |
| ainave.com | 93 | SUBMIT_FORM | yes | https://ainave.com/submit/products |
| aiparabellum.com | 93 | SUBMIT_FORM | freemium | https://submit.aiparabellum.com/order?type=guest-post |
| aisotools.com | 93 | SUBMIT_FORM | freemium | https://aisotools.com/submit |
| aitoolly.com | 93 | SUBMIT_FORM | freemium | https://aitoolly.com/submit |
| creati.ai | 93 | SUBMIT_FORM | freemium | https://creati.ai/submit-ai/submit-your-ai/ |
| magicbox.tools | 93 | SUBMIT_FORM | yes | https://magicbox.tools/submit |

### SaaS Directory

| Домен | Балл | Тип | Бесплатно | URL отправки |
| --- | --- | --- | --- | --- |
| llmrelevance.com | 93 | SUBMIT_FORM | yes | https://www.llmrelevance.com/submit |
| saasrove.com | 93 | SUBMIT_FORM | freemium | https://saasrove.com/submit |
| justlaunched.fyi | 91 | SUBMIT_FORM | yes | https://justlaunched.fyi/submit |
| marketingdb.live | 91 | SUBMIT_FORM | unknown | https://marketingdb.live/submit |
| peerpush.com | 91 | SUBMIT_FORM | yes | https://peerpush.com/submit |
| circlesaasboard.com | 90 | SUBMIT_FORM | freemium | https://circlesaasboard.com/?selectTile=1 |
| saas.fyi | 90 | SUBMIT_FORM | freemium | https://www.saas.fyi/submit |
| saaspirate.com | 90 | SUBMIT_FORM | yes | https://saaspirate.com/submit-a-deal/ |
| tailkits.com | 90 | SUBMIT_FORM | freemium | https://tailkits.com/submit/ |
| conversiongems.com | 89 | SUBMIT_FORM | yes | https://www.conversiongems.com/submit-your-tool |
| listmaro.com | 89 | SUBMIT_FORM | yes | https://listmaro.com/submit |
| listyouridea.com | 89 | SUBMIT_FORM | yes | https://listyouridea.com/projects/submit |
| mydentify.com | 89 | SUBMIT_FORM | yes | https://mydentify.com/submit |
| microsaasexamples.com | 88 | SUBMIT_FORM | freemium | https://www.microsaasexamples.com/submit |
| yo.directory | 88 | SUBMIT_FORM | freemium | https://yo.directory/pricing |

### Startup & Tech Community

| Домен | Балл | Тип | Бесплатно | URL отправки |
| --- | --- | --- | --- | --- |
| feedough.com | 91 | SUBMIT_FORM | yes | https://www.feedough.com/submit-your-startup/ |
| aitoolsobserver.com | 87 | SUBMIT_FORM | unknown | https://aitoolsobserver.com/register/?redirect_to=/submit/ |
| marketing-tech.ru | 87 | SUBMIT_FORM | yes | https://marketing-tech.ru/brief/ |
| changelog.com | 86 | SUBMIT_FORM | unknown | https://changelog.com/news/submit |
| betalist.com | 85 | SUBMIT_FORM | unknown | https://betalist.com/submissions/new |
| huntscreens.com | 85 | SUBMIT_FORM | unknown | https://huntscreens.com/ru/products/submitsaas/claim |
| startupdope.com | 85 | SUBMIT_FORM | freemium | https://startupdope.com/submit/new |
| yourstory.com | 85 | SUBMIT_FORM | yes | https://yourstory.com/companies |

## 8. Русскоязычный сегмент, СНГ и Центральная Азия

В базе **52** площадок (ru-язык или домены RU/UZ/KZ/KG/BY/UA/…). Сегмент заметно меньше англоязычного: каталогов с открытой формой в Рунете мало, многие RU-форумы закрыты anti-bot или не имеют раздела для самопрезентации; часть ключевых площадок (vc.ru, Tproger) подтверждена вручную по официальным правилам.

| Домен | Балл | Tier | Категория | Тип | Статус |
| --- | --- | --- | --- | --- | --- |
| marketing-tech.ru | 87 | TIER 1 | Startup & Tech Community | SUBMIT_FORM | VERIFIED |
| otzyvmarketing.ru | 86 | TIER 1 | SaaS Directory | SUBMIT_FORM | VERIFIED |
| picktech.ru | 83 | TIER 2 | Startup & Tech Community | SUBMIT_FORM | VERIFIED |
| telegramzy.ru | 83 | TIER 2 | AI Tools Directory | SUBMIT_FORM | VERIFIED |
| vksaas.ru | 83 | TIER 2 | SaaS Directory | SUBMIT_FORM | VERIFIED |
| ailib.ru | 82 | TIER 2 | AI Tools Directory | MANUAL | PARTIAL |
| saaspa.ge | 82 | TIER 2 | SaaS Directory | SUBMIT_FORM | VERIFIED |
| tgreef.com | 81 | TIER 2 | AI Tools Directory | SUBMIT_FORM | VERIFIED |
| productradar.ru | 78 | TIER 2 | Startup & Tech Community | SUBMIT_FORM | VERIFIED |
| spark.ru | 78 | TIER 2 | Startup & Tech Community | SUBMIT_FORM | VERIFIED |
| tproger.ru | 75 | TIER 2 | Startup & Tech Community | ARTICLE | VERIFIED |
| webmasters.ru | 75 | TIER 2 | Technology Forum | FORUM | VERIFIED |
| add-groups.com | 74 | TIER 2 | AI Tools Directory | SUBMIT_FORM | VERIFIED |
| catalog-telegram.site | 74 | TIER 2 | AI Tools Directory | SUBMIT_FORM | VERIFIED |
| zismo.biz | 74 | TIER 2 | Technology Forum | MANUAL | PARTIAL |
| likeni.ru | 73 | TIER 2 | Startup & Tech Community | SUBMIT_FORM | VERIFIED |
| vc.ru | 72 | TIER 2 | Startup & Tech Community | ARTICLE | VERIFIED |
| ppc.world | 71 | TIER 2 | Startup & Tech Community | SUBMIT_FORM | VERIFIED |
| workspace.ru | 71 | TIER 2 | SaaS Directory | SUBMIT_FORM | VERIFIED |
| ru.net | 70 | TIER 2 | AI Tools Directory | SUBMIT_FORM | VERIFIED |
| toolfox.ru | 70 | TIER 2 | AI Tools Directory | MANUAL | PARTIAL |
| 15wmz.com | 69 | TIER 3 | AI Tools Directory | SUBMIT_FORM | VERIFIED |
| uztelegram.com | 69 | TIER 3 | AI Tools Directory | MANUAL | PARTIAL |
| 100wmz.com | 68 | TIER 3 | AI Tools Directory | MANUAL | PARTIAL |
| a2is.ru | 68 | TIER 3 | SaaS Directory | SUBMIT_FORM | VERIFIED |

Языки в базе: en 1484, ru 49, fr 10, de 8, zh 3, tr 3, es 2, it 2. Колонка `country` берётся из ccTLD; `INT` — международный gTLD (страна не определялась).

## 9. Как продолжить / пересобрать

**Дедуп по референсному файлу** (когда он появится) — одной командой прямо по готовым файлам:

```bash
python3 apply_reference.py GPTBot-NEW_300_BATCH2_1122.txt
```

Скрипт удалит домены референса из CSV, XRumer-TXT и Manual-TXT, допишет их в Rejected с причиной `IN_REFERENCE` и выведет, сколько новых площадок осталось. Кандидаты с источниками — `data/candidates_*.jsonl.gz`, ручные решения ревью — `data/manual_overrides.json`, скрипты пайплайна — `scripts/` (полная пересборка требует сырых фактов проверки, они остались во временной папке сессии из-за объёма).

## 10. Карточка GPTBot.uz для форм (из `public/llms.txt`, сверено 2026-11-22)

- **Name:** GPTBot.uz
- **Tagline (EN):** Independent AI chat in Uzbek & Russian + AI chatbots for Telegram, Instagram and WhatsApp
- **Short (EN, ≤160):** Independent AI chat in Uzbek and Russian (3 free replies, no sign-up) and a Tashkent studio building AI bots for Telegram, Instagram Direct and WhatsApp.
- **Кратко (RU):** Независимый AI-чат на узбекском и русском (3 бесплатных ответа без регистрации) и ташкентская студия: AI-боты для Telegram, Instagram Direct и WhatsApp, SMM, таргет, сайты, SEO.
- **Категории:** AI Chatbot, AI Assistant, Business Chatbots, Telegram Bots, Marketing Automation, Productivity.
- **Pricing:** Freemium (3 бесплатных ответа; платные пакеты AI-чата в UZS). Не указывайте, что оплата сейчас открыта: доступность оплаты определяется в самом чате.
- **Обязательно:** GPTBot.uz — не ChatGPT и не продукт OpenAI. Не используйте «ChatGPT» в названии/категории листинга; бренд пишется «GPTBot.uz».
- **Контакт:** ceo@gptbot.uz, Telegram @XGame_changerx. Страна: Uzbekistan, Ташкент. Языки: ru, uz.

## 11. Ограничения

- Проверка — снимок на 2026-11-22; каталоги быстро меняют условия (бесплатно → платно), формы и правила.
- «Бесплатно» определялось по тексту страницы отправки (`yes` / `freemium` / `unknown`); у многих каталогов бесплатная очередь медленная, а приоритет платный.
- dofollow/nofollow не проверялся (это видно только после публикации); в `notes` отмечено, если страница сама упоминает dofollow/nofollow.
- TIER 3 вручную не просматривался целиком; там больше шума, чем в TIER 1–2.
- `moderation_required: likely` — типичное поведение каталогов, а не подтверждённый факт; подтверждённые случаи помечены `yes (stated …)`.
