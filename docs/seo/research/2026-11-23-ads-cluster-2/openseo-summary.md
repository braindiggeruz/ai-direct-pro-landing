# OpenSEO demand research: advertising topics, Uzbekistan (23.11.2026)

Project GPTBot.uz (`7534113b-…`), market Uzbekistan (location 2860), language ru (project default). Source: OpenSEO, which serves Uzbekistan from Google Ads data. Site coverage was checked against `content/blog` and `content/pages` at HEAD `6ce621b3`. That HEAD includes advertising waves D1–D3, which were merged while this research ran.

Files: `openseo-keywords.tsv` has one row per unique keyword with volume ≥ 10 (686 rows). This file is the summary.

## Credits

| Call | Seeds / keywords | Credits |
|---|---|---|
| research_keywords #1 | реклама в тик ток, яндекс директ, реклама на ютубе, наружная реклама ташкент, продвижение телеграм канала | 520 |
| research_keywords #2 | реклама недвижимости, как стать таргетологом, оплата рекламы инстаграм, смс рассылка, бесплатная реклама | 520 |
| get_keyword_metrics | 276 candidate keywords (RU + UZ) | 104 |
| research_keywords #3 | tiktok reklama, reklama qilish, targetolog | 416 |
| **Total** | balance 6,787 → 5,227 | **1,560** |

The total is **60 credits over the 1,500 cap**. The brief assumed about 54 credits per seed. Uzbekistan is billed at the flat Google Ads rate instead, about 104 per seed, and the three Uzbek seeds cost about 139 each because of the obscure-seed fallback surcharge. To stay near the cap, two seeds were not run: “telegram kanal reklama” and “youtube reklama”. Their head terms and variants were measured with get_keyword_metrics instead: “telegram kanal reklama” returned null and “youtube reklama” 10. Both topics already have UZ articles.

## Method and caveats

- **Volumes** are monthly Google Ads averages in buckets. 10 is the floor, and most long-tail rows sit there, so a family made of many variants at 10 is weaker evidence than one keyword at 170.
- **Totals** are the sum of distinct volume clusters per family and language. Close variants that Google Ads groups are counted once: same word stems in any order, or identical volume + CPC + competition at 20 or more. Examples: “google ads” and “google adwords” are both 3,600; “яндекс директ” and “яндексд ирект” are both 590.
- **KD and intent are not returned** for Uzbekistan, a market served from Google Ads data. The `kd` column is blank. The `intent` column and the intent notes below are inferred by rules: navigational, commercial or informational.
- **Language:** ru = Cyrillic; uz = Uzbek in Latin script; **neutral** = brand or English Latin queries (19 rows, e.g. “google ads”, “uzum seller”, “eskiz sms”) that cannot be attributed to ru or uz.
- **Uzbek is under-sampled.** The Uzbek seeds returned 1–2 rows each, because Google Ads keyword ideas do not expand Uzbek Latin seeds under the ru language setting. Uzbek volumes are measured under that setting too and are probably undercounts.
- **Coverage:** *yes* = a page targets the family; *partly* = an adjacent page exists or the topic is only mentioned; *no* = nothing. Titles, H1s and keyword fields were matched, and bodies were scanned for mentions.
- Retrieved 1,064 unique keywords; 686 have volume ≥ 10. Of the 276 metrics candidates, 91 returned 0 or null (listed at the end).

## Families by total volume

| # | Family | Lang | Vol/mo | Top 5 keywords (vol) | Covered | Intent |
|---|---|---|---|---|---|---|
| 1 | Uzum Market: seller portal & selling | neutral | 90,500 | uzum seller 90,500 | yes: /ru/blog/kak-stat-prodavcom-na-uzum-market/ and /uz/blog/uzum-marketda-sotuvchi-bolish/ both target “uzum seller” | navigational: seller-portal login |
| 2 | Follower boosting (nakrutka), grey-hat | uz | 8,100 | instagram nakrutka 8,100 | no (only the /uz/smm-xizmatlari/ service page mentions nakrutka) | commercial/transactional: people want to buy followers |
| 3 | Maps & business listings (2GIS, Yandex Business, Google Business Profile) | ru | 5,230 | 2гис 4,400; яндекс бизнес 720; гугл мой бизнес 50; 2гис для бизнеса 20; реклама в 2гис 10 | yes: /ru/blog/google-maps-yandex-2gis-dlya-biznesa/, /ru/blog/audit-kartochki-kompanii-na-kartah/ | navigational head (2GIS app; Yandex Business, CPC $5.95); “add organisation” tail informational |
| 4 | Google Ads (account, setup, cost) | neutral | 3,600 | google ads 3,600 | partly: /uz/blog/google-reklama-sozlash/; no RU setup guide | navigational (Google Ads login) |
| 5 | Yandex Direct / Yandex ads | ru | 2,070 | яндекс директ 590; директе 210; рся 210; яндекс реклама 70; яндекс кампании 70 | yes: /ru/blog/yandeks-direkt-v-uzbekistane/ | mixed: brand head, informational setup tail, commercial “заказать” |
| 6 | Outdoor ads: billboards, banners, LED screens, signage | uz | 920 | tashqi reklama 590; banner reklama 320; bilbord reklama 10 | yes for “tashqi reklama”: /uz/blog/tashqi-reklama-toshkentda/; “banner reklama” (320) is not mentioned there | commercial |
| 7 | Paying for ads from Uzbekistan (cards, Visa, failed payments) | uz | 900 | visa karta ochish 880; virtual visa karta 20 | partly: /uz/blog/reklama-uchun-tolov/ explains Visa but does not target “visa karta ochish” | informational/banking: opening a (virtual) Visa card |
| 8 | Follower boosting (nakrutka), grey-hat | ru | 830 | накрутка подписчиков инстаграм 720; накрутка подписчиков телеграм 110 | partly: warnings inside /ru/blog/telegram-kanal-prodvizhenie/ and SMM/agency articles | commercial/transactional |
| 9 | Maps & business listings (2GIS, Yandex Business, Google Business Profile) | neutral | 720 | google business profile 720 | yes: /ru/blog/audit-kartochki-kompanii-na-kartah/ | navigational |
| 10 | SMS marketing (bulk SMS, SMS gateways) | ru | 550 | смс рассылка 40; смс рассылка узбекистан 40; сервис смс рассылок 10; массовая рассылка смс 10; рассылка смс клиентам 10 | yes: /ru/blog/sms-rassylka-v-uzbekistane/ | commercial (services, prices) + informational |
| 11 | Ad agency / advertising services in Tashkent | uz | 480 | reklama agentligi 260; reklama xizmati 170; marketing agentligi 30; reklama agentligi toshkent 20 | partly: /uz/internet-reklama-toshkent/ (service page); no UZ “how to choose an agency” article | commercial |
| 12 | Yandex Direct / Yandex ads | neutral | 440 | yandex direct 390; yandex direct ru 10; yandex adwords 10; direct commander 10; yandex direct api 10 | yes: /uz/blog/yandex-direct-ozbekistonda/, /ru/blog/yandeks-direkt-v-uzbekistane/ | navigational |
| 13 | Outdoor ads: billboards, banners, LED screens, signage | ru | 370 | наружная реклама в ташкенте 170; реклама баннер ташкент 50; led экраны ташкент 40; вывески ташкент 30; неоновые вывески ташкент 20 | yes: /ru/blog/naruzhnaya-reklama-v-tashkente/ (permits); banners, LED screens, prices not covered | commercial (local placement) |
| 14 | Targetologist: profession, courses, salary, hiring | ru | 370 | таргетолог это 210; таргетолог ташкент 40; кто такой таргетолог 30; таргетолог вакансии 20; таргетолог обучение 20 | yes: /ru/blog/kak-stat-targetologom/ (+ /ru/blog/kak-vybrat-targetologa-v-tashkente/) | informational (“таргетолог это” 210) + hiring |
| 15 | Messenger mailing (Telegram / WhatsApp / Viber broadcasts) | ru | 370 | вайбер рассылка 70; рассылку 70; telegram рассылка 10; рассылку whatsapp 10; рекламная рассылка 10 | partly: /ru/telegram-bot-dlya-biznesa/ mentions broadcasts; no Viber/WhatsApp/Telegram mailing guide | commercial/informational |
| 16 | Google Ads (account, setup, cost) | ru | 320 | гугл адс 140; гугл реклама 110; google ads кабинет 10; реклама в гугл цена 10; настройка google ads 10 | partly: /ru/blog/google-ads-ili-yandeks-direkt-uzbekistan/, /ru/blog/minus-slova-google-ads/; no RU setup guide | navigational head + informational setup + commercial price |
| 17 | Ad agency / advertising services in Tashkent | ru | 250 | рекламное агентство ташкент 90; маркетинговое агентство ташкент 70; реклама в ташкенте 30; smm агентство ташкент 10; smm специалист ташкент 10 | yes: /ru/blog/kak-vybrat-digital-agentstvo-v-tashkente/, /ru/digital-marketing-tashkent/ | commercial |
| 18 | Real estate & new-build ads | ru | 250 | реклама продажи недвижимости 50; реклама агентств недвижимости 10; продажа квартир реклама 10; реклама циан 10; реклама недвижимости 10 | yes: /ru/blog/reklama-nedvizhimosti-i-novostroek/ | informational |
| 19 | Targetologist: profession, courses, salary, hiring | uz | 230 | targetolog 170; targetolog kim 40; target kurslari 20 | yes: /uz/blog/targetolog-bolish/ (+ /uz/blog/toshkentda-targetolog-tanlash/) | informational + hiring |
| 20 | Paying for ads from Uzbekistan (cards, Visa, failed payments) | ru | 220 | виртуальная карта visa 30; как оплатить рекламу в инсте 10; инстаграм оплата рекламы 10; оплата google ads 10; как оплатить рекламу в тик ток 10 | yes: /ru/blog/sposoby-oplaty-reklamy-iz-uzbekistana/ | informational (how to pay, failed payments) |
| 21 | Free advertising methods | ru | 210 | гугл реклама бесплатно 10; бесплатная реклама в тг 10; реклама бесплатно 10; реклама сайта бесплатно 10; таргет инстаграм бесплатно 10 | no | informational (32 variants, all at the 10/mo floor) |
| 22 | Telegram channel growth & ads in channels | ru | 200 | раскрутка тг 10; продвижение тг канала 10; раскрутка тг канала 10; реклама канала телеграм 10; продвижение телеграм 10 | yes: /ru/blog/telegram-kanal-prodvizhenie/ | informational + commercial |
| 23 | SMS marketing (bulk SMS, SMS gateways) | neutral | 200 | eskiz sms 170; ums sms 10; epochta sms 10; playmobile sms 10 | partly: the SMS articles never name gateways | navigational (Eskiz, Playmobile) |
| 24 | Ad basics in Uzbek (reklama nima / qilish / berish) | uz | 200 | reklama nima 170; reklama qilish 20; reklama berish 10 | partly: /uz/blog/reklama-turlari/ (types, not a definition) | informational (definition) |
| 25 | YouTube ads & video promotion | ru | 180 | реклама ютуб 10; реклама видео ютуб 10; гугл реклама ютуб 10; раскрутка видео youtube 10; стоимость рекламы на ютуб 10 | yes: /ru/blog/reklama-na-youtube-v-uzbekistane/ | informational/commercial |
| 26 | OLX & classifieds: posting & promoting listings | uz | 180 | olx e'lon berish 170; olx reklama 10 | no (OLX only mentioned inside real-estate/car articles) | informational: how to post a listing |
| 27 | Instagram organic growth (followers, Reels, algorithm) | uz | 180 | instagramda obunachi ko'paytirish 170; instagram rivojlantirish 10 | no | informational: grow followers without ads |
| 28 | Telegram channel growth & ads in channels | uz | 160 | telegram reklama 90; telegram kanal ochish 70 | yes: /uz/blog/telegram-kanalni-rivojlantirish/, /uz/telegram-reklama/ | commercial + informational |
| 29 | SMM / ads courses & training | uz | 140 | smm kurslari 140 | no | commercial: course seekers |
| 30 | TikTok ads & promotion | ru | 130 | реклама в тик ток 40; тикток таргет 10; рекламный кабинет тикток 10; реклама в тик ток цена 10; реклама тик ток аккаунта 10 | yes: /ru/blog/reklama-v-tiktok-iz-uzbekistana/ | informational |
| 31 | SMM / ads courses & training | ru | 110 | сертификат яндекс директ 10; обучение контекстной рекламе бесплатно 10; курсы smm 10; google ads курсы 10; smm курсы ташкент 10 | no | commercial (Google Ads / Yandex / SMM courses) |
| 32 | TikTok ads & promotion | neutral | 110 | tiktok ads 70; tiktok ads manager 40 | yes: /ru/blog/reklama-v-tiktok-iz-uzbekistana/, /uz/blog/tiktok-reklama-ozbekistonda/ | informational/navigational |
| 33 | Email & push marketing | ru | 90 | push уведомления 40; push рассылку 10; email рассылка 10; tilda рассылка 10; email маркетинг 10 | no (glossary mention only) | informational |
| 34 | Instagram organic growth (followers, Reels, algorithm) | ru | 90 | как набрать подписчиков в инстаграм 20; продвижение рилс 10; алгоритмы инстаграм 10; раскрутка инстаграм 10; продвижение в инстаграм 10 | partly: /ru/blog/chto-takoe-smm-prodvizhenie/ | informational |
| 35 | Pharmacy, medicines & supplements ads (restricted) | uz | 70 | dorixona reklama 70 | partly: medicines row in /uz/blog/reklama-togrisidagi-qonun/ | commercial/informational; restricted category |
| 36 | Ad copy in Uzbek (reklama matni) | uz | 70 | reklama matni 70 | partly: /uz/blog/kopirayting-nima/, /uz/blog/reklama-kreativlari/ | informational: ad-text examples |
| 37 | Instagram / Meta ads (launch, target) | uz | 70 | instagram target 50; instagram reklama 10; instagramda reklama berish 10 | yes: /uz/instagram-target-yoqish/ | commercial |
| 38 | Transit & broadcast ads: metro, taxi, buses, radio, TV | ru | 70 | реклама в метро ташкент 20; реклама в метро 10; реклама на радио 10; реклама на такси 10; реклама в яндекс такси 10 | no | commercial: metro/taxi/bus/radio placement |
| 39 | Blogger / influencer ads & ad exchanges | ru | 60 | реклама у блогеров ютуб 10; биржа рекламы ютуб 10; биржа тик ток 10; рекламодатели тик ток 10; биржа блогеров ютуб 10 | yes: /ru/blog/reklama-u-blogerov-v-uzbekistane/ | commercial (ad exchanges) |
| 40 | Construction & renovation ads | ru | 50 | реклама ремонта квартир 10; реклама стройматериалов 10; реклама строительной компании 10; продвижение строительной компании 10; эффективная реклама по ремонту квартир 10 | no | informational |
| 41 | Yandex Direct / Yandex ads | uz | 50 | yandex reklama 50 | yes: /uz/blog/yandex-direct-ozbekistonda/ | commercial |
| 42 | Uzum Market: seller portal & selling | uz | 50 | uzum market sotuvchi 40; uzumda sotish 10 | yes: /uz/blog/uzum-marketda-sotuvchi-bolish/ | navigational/informational |
| 43 | Uzum Market ads (internal promotion) | uz | 50 | uzum market reklama 30; uzum reklama 20 | partly: /uz/blog/mahsulotni-reklama-qilish/ | informational |
| 44 | Telegram bot promotion | ru | 40 | реклама телеграм бота 10; раскрутка телеграм бота 10; рассылка в телеграм боте 10; продвижение телеграм бота 10 | no | informational |
| 45 | OLX & classifieds: posting & promoting listings | ru | 40 | olx реклама 10; olx бизнес аккаунт 10; как продавать на olx 10; реклама доски объявлений 10 | no | informational/commercial |
| 46 | YouTube ads & video promotion | neutral | 40 | youtube ads 40 | yes: /ru/blog/reklama-na-youtube-v-uzbekistane/ | informational |
| 47 | Google Ads (account, setup, cost) | uz | 40 | google reklama 30; google reklama berish 10 | yes: /uz/blog/google-reklama-sozlash/ | commercial |
| 48 | SMS marketing (bulk SMS, SMS gateways) | uz | 40 | sms yuborish 30; sms reklama 10 | yes: /uz/blog/sms-reklama/ | informational/commercial |
| 49 | Transit & broadcast ads: metro, taxi, buses, radio, TV | uz | 40 | metro reklama 20; tv reklama 10; radio reklama 10 | no | commercial |
| 50 | Online school & course ads | ru | 40 | реклама курсов 10; реклама онлайн школы 10; реклама онлайн курсов 10; продвижение онлайн курсов 10 | yes: /ru/blog/reklama-onlayn-shkoly/ | informational/commercial |
| 51 | Restaurant, cafe & food delivery ads | ru | 40 | реклама ресторана 10; маркетинг ресторана 10; реклама доставки еды 10; продвижение ресторана 10 | yes: /ru/blog/reklama-kafe-i-restorana-tashkent/ (delivery only partly) | informational |
| 52 | Kindergarten & kids centre ads | ru | 40 | реклама детского сада 10; реклама детского центра 10; продвижение детского сада 10; реклама частного детского сада 10 | no | informational |
| 53 | Google Ads vs Yandex Direct (comparison) | ru | 30 | реклама в яндекс и гугл 10; google ads и яндекс директ 10; контекстная реклама яндекс и гугл 10 | yes: /ru/blog/google-ads-ili-yandeks-direkt-uzbekistan/ | informational |
| 54 | Car dealer & auto service ads | ru | 30 | реклама автосалона 10; реклама автомобилей 10; реклама автосервиса 10 | yes: /ru/blog/reklama-avtosalona/ | informational |
| 55 | Fitness club / gym ads | ru | 30 | реклама спортзала 10; реклама фитнес клуба 10; продвижение фитнес клуба 10 | no (bot page /ru/ai-bot-dlya-fitnes-kluba/ only) | informational |
| 56 | Travel agency ads | ru | 30 | реклама туров 10; реклама турагентства 10; продвижение турагентства 10 | no | informational/commercial |
| 57 | Furniture store ads | ru | 30 | реклама мебели 10; реклама мебели в инстаграм 10; реклама мебельного магазина 10 | no | informational |
| 58 | Pharmacy, medicines & supplements ads (restricted) | ru | 30 | реклама бад 10; реклама аптеки 10; реклама лекарств 10 | partly: medicines row in /ru/blog/zakon-o-reklame-v-uzbekistane/ | informational; restricted category |
| 59 | Medical centre / clinic ads | ru | 30 | реклама медицинских услуг 10; реклама медицинского центра 10; продвижение медицинского центра 10 | yes: /ru/blog/reklama-stomatologii-i-kliniki-tashkent/ | informational |
| 60 | Hotel ads | ru | 30 | реклама отеля 10; продвижение отеля 10; реклама гостиницы 10 | no | informational |
| 61 | Pay-for-results ads (CPA) | ru | 10 | реклама с оплатой за результат 10 | yes: /ru/blog/cpa-cpm-cpc-cpl-v-reklame/ | informational |
| 62 | Instagram / Meta ads (launch, target) | ru | 10 | платная реклама в инстаграм 10 | yes: /ru/blog/zapusk-reklamy-v-instagram-iz-uzbekistana/ | commercial |
| 63 | TikTok ads & promotion | uz | 10 | tiktok reklama 10 | yes: /uz/blog/tiktok-reklama-ozbekistonda/ | commercial |
| 64 | Online school & course ads | uz | 10 | kurs reklama 10 | yes: /uz/blog/onlayn-maktab-reklamasi/ | commercial |
| 65 | Medical centre / clinic ads | uz | 10 | klinika reklama 10 | yes: /uz/blog/stomatologiya-va-klinika-reklamasi/ | commercial |
| 66 | Restaurant, cafe & food delivery ads | uz | 10 | kafe reklama 10 | yes: /uz/blog/restoran-va-kafe-reklamasi/ | commercial |
| 67 | YouTube ads & video promotion | uz | 10 | youtube reklama 10 | yes: /uz/blog/youtube-reklama/ | commercial |
| 68 | Ad market & internet statistics (Uzbekistan) | ru | 10 | сколько пользователей телеграм в узбекистане 10 | no | informational |

**Off-topic noise, kept in the TSV but excluded from ranking:** consumer messaging / phone SMS / bank SMS alerts (ru, 840); consumer messaging / phone SMS / bank SMS alerts (uz, 110); YouTube ad blocking (viewer side) (ru, 80); misc (fuel via Yandex, site metrics) (ru, 20). The SMS seed mostly pulled in consumer queries such as “отправка сообщения” 260 and “спам сообщения в whatsapp” 260, plus the bank card alert “sms xabarnoma” 110. The YouTube seed pulled in viewers looking to block ads.

## Top 15 uncovered families worth a new article

Ordered by addressable volume (ru + uz combined, deduplicated). “Fit” is how well the topic serves an agency that sells ads, sites and bots.

1. **Follower boosting (“nakrutka”)**: uz **8,100** (“instagram nakrutka”) + ru 830 (“накрутка подписчиков инстаграм” 720, “…телеграм” 110). Coverage: ru partly (warnings inside other articles), uz none. Angle: “what nakrutka does to reach and ad accounts, and what works instead”, ru + uz. Fit: medium. Most searchers want to buy followers, so expect impressions rather than leads. It can be combined with #7 in uz.
2. **Opening a (virtual) Visa card to pay for ads**: uz **900** (“visa karta ochish” 880, “virtual visa karta” 20) + ru 40 (“виртуальная карта visa”). Coverage: partly (/uz/blog/reklama-uchun-tolov/). Angle: uz explainer “Visa karta ochish: reklama va onlayn to‘lov uchun”. Fit: medium-low (banking intent, bank products change quickly). Extending the existing UZ payments article is an alternative.
3. **Choosing an ad agency, in Uzbek** *(already in progress: wave D4)*: uz **480** (“reklama agentligi” 260, “reklama xizmati” 170, “marketing agentligi” 30, “reklama agentligi toshkent” 20). Coverage: partly (UZ service page only). The RU twin `/ru/blog/kak-vybrat-digital-agentstvo-v-tashkente/` has no UZ pair. Fit: high (commercial).
4. **Banner ads** *(already in progress: wave D4)*: uz **320** (“banner reklama”) + ru 50 (“реклама баннер ташкент” and variants) = 370. Coverage: partly. The outdoor articles cover permits and never mention banners. Angle: banner types, sizes and placement in Tashkent. Fit: medium.
5. **Messenger mailings (Telegram / WhatsApp / Viber)**: ru **370** (“вайбер рассылка” 70, “рассылку” 70, plus 28 Telegram/WhatsApp/mass-mailing variants at 10). Coverage: partly (bot page). Angle: how to send mailings without bans and within consent rules; links to the SMS law article and the bot pages. Fit: high.
6. **Google Ads setup guide in Russian**: ru **320** (“гугл адс” 140, “гугл реклама” 110 with its variant “google реклама” 70 counted once, and the setup/price tail at 10), plus the navigational “google ads / adwords” 3,600. Coverage: partly. UZ has `/uz/blog/google-reklama-sozlash/`, but RU has only the comparison and minus-words articles. Fit: high (contextual-ads money page).
7. **Instagram follower growth without ads**: uz **180** (“instagramda obunachi ko‘paytirish” 170) + ru 90 (“как набрать подписчиков в инстаграм” 20, Reels/algorithm variants) = 270. Coverage: uz none, ru partly (SMM explainer). Fit: medium-high.
8. **SMM and ads courses**: uz **140** (“smm kurslari”) + ru 110 (Google Ads, Yandex and SMM courses at 10 each) = 250. Coverage: none. The targetologist articles mention free courses. Fit: medium-low (the site is not a school).
9. **OLX listings and promotion** *(already in progress: wave D4)*: uz **170** (“olx e'lon berish”) + uz/ru 50 (“olx reklama”, “olx бизнес аккаунт”, “как продавать на olx”) = 220. Coverage: none (OLX is only mentioned in real-estate and car articles). Fit: medium.
10. **Free advertising methods**: ru **210** (32 variants: “бесплатная реклама для бизнеса”, “…в телеграм / инстаграм / гугл”, “подать объявление в гугл бесплатно”). Coverage: none. Fit: good as top of funnel. The UZ variant was not measured.
11. **Niche playbooks still missing**: ru **210** in total: construction/renovation 50, kindergartens 40, fitness 30, travel agencies 30, furniture 30, hotels 30. Every row is at the 10 floor, and the Uzbek variants returned null. Coverage: none. A roundup or later short articles would fit. Fit: medium.
12. **“Reklama nima” (ad basics in Uzbek)**: uz **200** (“reklama nima” 170, “reklama qilish” 20, “reklama berish” 10). Coverage: partly (`/uz/blog/reklama-turlari/` covers types, not the definition). Angle: a short explainer, or a definition H2 and FAQ in reklama-turlari. Fit: medium.
13. **Metro, taxi, bus, radio and TV ads**: ru **70** (“реклама в метро ташкент” 20, taxi/Yandex Taxi/bus/radio at 10) + uz 40 (“metro reklama” 20, “radio reklama”, “tv reklama”) = 110. Coverage: none (the law articles only mention radio). Fit: medium (offline, same pattern as the D2 outdoor wave).
14. **Pharmacy, medicines and supplements ads (restricted)**: uz **70** (“dorixona reklama”) + ru 30 (“реклама аптеки”, “реклама лекарств”, “реклама бад”) = 100. Coverage: partly (one table row in each law article). Angle: what the advertising law (ZRU-776) allows for pharmacies and supplements, ru + uz. Fit: good, using the law angle of waves D2–D3.
15. **Email and push marketing**: ru **90** (“push уведомления” 40, “email маркетинг”, “email рассылка”, “tilda рассылка”, “массовая рассылка на почту”). Coverage: none (glossary mention only). Fit: medium.

**Wave D4 is already in progress.** At 14:01 an untracked `tests/ads-gpt-wave-d4.test.ts` appeared in the repo; no content files existed yet. It lists:
- `/uz/blog/reklama-agentligi/` (UZ only);
- `/ru/blog/reklamnyy-banner/` + `/uz/blog/reklama-banner/`;
- `/ru/blog/prodvizhenie-obyavleniy-na-olx/` + `/uz/blog/olx-elon-berish/`;
- marketer career (`marketolog-kto-eto` / `marketolog-kim`) and sales funnel (`voronka-prodazh` / `sotuv-voronkasi`), which this research did not measure.

Excluding items 3, 4 and 9, the next batch would be items 1, 2, 5, 6, 7, 8 and 10–15.

Next in line: “reklama matni” 70 (partly: kopirayting-nima, reklama-kreativlari; RU “рекламный текст” was not measured), Uzum in-app ads 50 (partly: mahsulotni-reklama-qilish), Telegram bot promotion 40 (none). SMS gateways (“eskiz sms” 170, navigational) and Yandex Business (720, navigational) are better served by sections in the existing SMS and maps articles than by new pages.

## Already covered (no new article needed)

Most of the 15 brief seeds are now covered by waves D1–D3:
- **D1:** TikTok, Yandex Direct, YouTube, ad payments.
- **D2:** Telegram channel promotion, targetologist career, SMS, outdoor.
- **D3:** real estate, car dealers, online schools.

Also covered: clinics, cafés, blogger ads and the Google vs Yandex comparison. Within those families, the remaining gaps are sub-intents:
- RU outdoor: LED screens, signage and prices.
- “таргетолог это” 210: a definition, partly answered by kak-stat-targetologom.
- Food-delivery ads: only partly covered by the café article.

## Candidates with no measurable Google demand (0 or null, 91 of 276)

No measurable Google demand does not rule a topic out. Decision D-ADS-GPT-20261123 accepts AI-prompt demand as evidence for informational articles. Notable groups:

- Uzbek niche variants: “ko'chmas mulk / avtosalon / mebel / restoran / mehmonxona / bog'cha / qurilish / turagentlik reklama”.
- Uzbek price and how-to variants: “youtube reklama narxi”, “tiktokda reklama berish”, “reklama qilish narxi”, “internetda reklama”, “reklama toshkent”.
- Maps in Uzbek: “2gis / yandex xaritaga / google xaritaga qo'shish”.
- Uzum ads in Russian: “реклама на uzum market”, “uzum ads”.
- Billboard rent and prices: “аренда билборда ташкент”, “стоимость билборда в ташкенте”.
- Radio and TV in Tashkent.
- Ad market and social-media statistics: “рынок рекламы узбекистан”, “статистика соцсетей узбекистан”.
- Other channels: “telegram kanal reklama”, “google ads узбекистан”.

Full list: маркетинг в недвижимости; продвижение недвижимости; продвижение агентства недвижимости; таргет для недвижимости; лиды на недвижимость; ko'chmas mulk reklama; kochmas mulk reklama; uy sotish reklama; продвижение автосалона; avtosalon reklama; mashina reklama; avtoservis reklama; fitnes klub reklama; sport zal reklama; продвижение онлайн школы; как продвигать онлайн курс; onlayn kurs reklama; turagentlik reklama; продвижение мебельного магазина; mebel reklama; mebel reklama matni; qurilish reklama; remont reklama; tibbiy markaz reklama; продвижение доставки еды; restoran reklama; yetkazib berish reklama; bog'cha reklama; bogcha reklama; mehmonxona reklama; реклама в гугл ташкент; google ads узбекистан; googleda reklama berish; google ads sozlash; реклама в яндексе ташкент; реклама на ютубе узбекистан; youtube reklama narxi; youtubeda reklama berish; youtube kanalga reklama; youtube reklamasiz; реклама в тик ток узбекистан; реклама в тик ток ташкент; tiktokda reklama; tiktok reklama narxi; tiktokda reklama berish; добавить компанию в google maps; как добавить организацию на карту; 2gis ga qo'shish; yandex xaritaga qo'shish; google xaritaga qo'shish; google maps ga qo'shish; продвижение на olx; olxda reklama; uzum реклама; реклама на uzum market; продвижение на uzum market; uzum ads; продвижение товара на uzum; реклама на экранах ташкент; аренда билборда ташкент; стоимость билборда в ташкенте; изготовление вывесок ташкент; led ekran reklama; реклама на радио ташкент; реклама на тв ташкент; реклама на телевидении узбекистан; telegram kanal reklama; telegram kanalga reklama; telegram kanal rivojlantirish; telegram kanalga obunachi; telegram bot reklama; продвижение в инстаграм без рекламы; рынок рекламы узбекистан; рекламный рынок узбекистана; статистика интернета в узбекистане; статистика соцсетей узбекистан; сколько пользователей инстаграм в узбекистане; reklama bozori; оплата рекламы фейсбук; как оплатить рекламу в фейсбук из узбекистана; как оплатить google ads; виртуальная карта для оплаты рекламы; reklama to'lash; instagram reklama to'lash; курсы таргетолога ташкент; таргетолог узбекистан; targetolog kursi; reklama qilish narxi; reklama berish narxi; internetda reklama; reklama toshkent.
