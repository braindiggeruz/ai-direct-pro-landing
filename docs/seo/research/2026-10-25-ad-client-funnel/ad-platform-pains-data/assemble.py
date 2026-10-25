# -*- coding: utf-8 -*-
"""Assembles ../ad-platform-pains.json from computed.json + qualitative review fields."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
comp = json.load(open(os.path.join(HERE, "computed.json"), encoding="utf-8"))

Q = [
 ("target-yoqish-diy-uz", dict(
   existing_url="/uz/instagram-target-yoqish/",
   serp_weakness="weak",
   serp="target yoqish: видео-блок + AIO; топ-5 = Instagram reel, olx.uz (250 объявлений таргетологов), ustoz.ai (курс), YouTube-урок, Instagram-тег; далее rivojuz.uz, YouTube, t.me/ustozai, olx, yuzinchi.uz («oyiga $200 dan»). Текстовой пошаговой инструкции на узбекском в топ-10 нет. gptbot.uz в топ-20 этого снимка нет; GSC 3 мес: хаб 1–8 показов на вариант при поз. 4,8–8.",
   page="Расширить хаб (не новый URL): блок «O‘zingiz yoqmoqchimisiz? 7 qadam» — Professional akkaunt → Facebook sahifa → Ads Manager / biznes portfel → to‘lov usuli → maqsad → auditoriya → kreativ → moderatsiya; скриншоты или 60–90 с видео; «qayerda ko‘pincha xato bo‘ladi»; CTA «yoki biz yoqib beramiz». Новый URL под этот интент = каннибализация хаба (intent-manifest, кластер target-uz).",
   lead_path="Таргет: запуск от 1 990 000 so‘m, ведение от 1 490 000 so‘m/oy (цены уже на хабе) → форма хаба.",
   effort="S", honesty_risk="low")),
 ("telegram-ads-diy", dict(
   existing_url="/ru/blog/telegram-ads-stoimost-i-zapusk-uzbekistan/ (+ хабы /ru/telegram-ads-uzbekistan/, /uz/telegram-reklama/)",
   serp_weakness="mixed",
   serp="telegram ads: реклама propellerads, видео, AIO; органика: ads.telegram.org #1, adsgram.ai, umnico.com (EN-гайд), newage.agency, carrotquest.io (RU-гайд 08.10.2026), telega.io, richads, ads.yandex.com, kokoc.com, elama. Ни одной узбекской или узбекистанской страницы. GSC 3 мес: RU-статья поз. 2,4 по «telegram ads стоимость» (34 показа, 1 клик), 3,3 по «минимальный бюджет»; RU-хаб поз. 46 по «telegram ads узбекистан».",
   page="RU: расширить статью, которой Google уже доверяет, разделом «пошагово из Узбекистана»: аккаунт на ads.telegram.org, пополнение в TON через Fragment (только официальный путь), модерация по Telegram Ads Guidelines, частые причины отказа, минимальный CPM 0,1 TON (цифра уже на сайте, сверить в день публикации). UZ: новая статья /uz/blog/telegram-ads-qanday-ishga-tushiriladi/ — hreflang-пара RU-статьи (у неё сейчас нет UZ-версии), спица кластера telegram-uz с primary «telegram ads»; хаб /uz/telegram-reklama/ остаётся владельцем «telegram reklama».",
   lead_path="Запуск Telegram Ads и посевов → /ru/telegram-ads-uzbekistan/, /uz/telegram-reklama/ (+ бот для приёма заявок после клика).",
   effort="M", honesty_risk="medium")),
 ("meta-ads-manager-guide", dict(
   existing_url="",
   serp_weakness="mixed",
   serp="meta ads: AIO, видео, PAA, реклама facebook.com; органика: help.instagram.com, coursera, linkedin (карточка продукта), marketinglabs.co.uk, Google Play, quora, metaads.team (однофамилец), adtribute, adintime, facebook.com/help. Ни RU-, ни UZ-гайда в топ-10. По «ads manager» и «meta business suite» SERP не снимался: ожидаемо официальные страницы Meta (отсюда доля 0,15).",
   page="Новая UZ-инструкция /uz/blog/meta-ads-manager-qollanma/: что такое Ads Manager, Business Suite и biznes portfel; как создать рекламный аккаунт, подключить Instagram и способ оплаты; роли и доступы («kabinet kimga tegishli»); где смотреть результат. Скриншоты с датой сверки интерфейса. Владеет интентом «инструмент/интерфейс»; хаб target-uz владеет «yoqish/buyurtma». RU-хвост закрывается в RU-кластере ru-instagram-ads-howto, отдельную RU-копию не делать.",
   lead_path="Таргет → /uz/instagram-target-yoqish/; вопрос «kabinet kimga tegishli» — мост к услуге.",
   effort="L", honesty_risk="low")),
 ("google-ads-from-uz", dict(
   existing_url="",
   serp_weakness="mixed",
   serp="Не снимался (лимит 4 SERP ушёл на более крупных кандидатов). По голове «google ads» ожидаемо ads.google.com и справка Google. Сайт по запросам с «google» за 3 мес в GSC: 1 показ («google ads and seo»).",
   page="Новая UZ-статья /uz/blog/google-reklama-qanday-beriladi/ + RU /ru/blog/kak-zapustit-google-ads-iz-uzbekistana/: аккаунт; способы оплаты для Узбекистана по справке Google «Payment options»; налоги нейтрально со ссылкой; первая поисковая кампания; YouTube-реклама через Google Ads; где новички сливают бюджет. Сравнение Google vs Яндекс не дублировать — ссылка на существующую статью.",
   lead_path="Контекстная реклама → /ru/kontekstnaya-reklama-tashkent/ (запуск от 1 990 000 сум, ведение от 1 490 000 сум/мес — цены уже на странице).",
   effort="M", honesty_risk="medium")),
 ("meta-troubleshooting", dict(
   existing_url="",
   serp_weakness="weak",
   serp="Не снимался: при ~10/мес на запрос SERP-кредиты не окупаются. Сигнал боли: в SERP «target yoqish» сниппет t.me/ustozai про лишние списания при оплате рекламы (факт не проверен). Первый SMM-лид (07.10) пришёл из chatgpt.com — кластер работает на AI-ответы, не на органику.",
   page="Одна страница-справочник RU + UZ «Проблемы с рекламой Meta / Meta reklama muammolari»: 12–15 вопросов с FAQPage. Каждый ответ: что значит статус, что проверить, официальный путь (Account Quality, запрос повторной проверки, Advertising Standards, Meta Business Help) со ссылкой. Отдельный раздел: Meta Pixel и лид-формы. Внизу — «нет времени разбираться: аудит кабинета».",
   lead_path="Аудит рекламы → /ru/marketingovyi-audit-tashkent/; таргет → /ru/targetirovannaya-reklama-tashkent/, /uz/instagram-target-yoqish/.",
   effort="M", honesty_risk="high")),
 ("ru-instagram-ads-howto", dict(
   existing_url="/ru/targetirovannaya-reklama-tashkent/ (услуга) и /ru/blog/pochemu-reklama-v-instagram-ne-prinosit-zayavki/ (диагностика); интент «запустить самому» свободен",
   serp_weakness="mixed",
   serp="Не снимался. По аналогии с «яндекс директ» и «telegram ads» ожидаются RU-агентства и глоссарии без узбекистанского угла (оплата, валюта, локальные ограничения). GSC: /ru/targetirovannaya-reklama-tashkent/ поз. 6–11 по «заказать таргет», 0 кликов.",
   page="Новая RU-статья /ru/blog/kak-zapustit-reklamu-v-instagram-iz-uzbekistana/ — RU-пара к DIY-блоку хаба и UZ-инструкции по Ads Manager: «Продвигать» в приложении против Ads Manager, кабинет, оплата (ссылка на ad-payment-uz), аудитории, модерация, первые 3 дня. CTA на услугу.",
   lead_path="Таргет → /ru/targetirovannaya-reklama-tashkent/.",
   effort="M", honesty_risk="low")),
 ("ad-payment-uz", dict(
   existing_url="",
   serp_weakness="mixed",
   serp="Не снимался. По карточным головам ожидаемо продуктовые страницы банков; по рекламному хвосту выдача почти пустая. Оплата упоминается только как Toncoin на /uz/telegram-reklama/ и в RU-статье про Telegram Ads.",
   page="Новая UZ + RU статья «Meta, Google va Telegram reklamasini O‘zbekistondan qanday to‘lash mumkin»: какие способы принимает каждая платформа (по их справкам); карты Visa/Mastercard узбекских банков, включая виртуальные (таблица с датой сверки и ссылками на официальные страницы банков, без партнёрок); частые причины отказа платежа и официальные решения; TON для Telegram Ads через Fragment; налоги нейтрально со ссылками. Схему «медиабюджет через агентство» не обещать, пока владелец не подтвердит, как это устроено в договоре.",
   lead_path="Таргет, контекст, Telegram Ads — «запустим под ключ, бюджет отдельно» (формулировка уже на сайте).",
   effort="M", honesty_risk="high")),
 ("yandex-direct-uz", dict(
   existing_url="/ru/blog/google-ads-ili-yandeks-direkt-uzbekistan/ (сравнение; how-to интент свободен)",
   serp_weakness="strong",
   serp="яндекс директ: AIO на 1-м месте; органика: b2b.yandex.ru, yandex.ru/support/direct (x2), sape, demis, new-point, cnews, trafficmall, yandex.ru/project, likeni; далее kwork, YouTube. Узбекистанского угла нет. GSC: статья-сравнение поз. 58 по «яндекс директ узбекистан».",
   page="Новая RU-статья /ru/blog/yandeks-direkt-v-uzbekistane/: можно ли рекламодателю из Узбекистана, валюта и оплата (только по справке Яндекса на дату публикации), гео «Узбекистан/Ташкент», когда Директ оправдан против Google. Цель — «яндекс директ узбекистан» и хвост, не голова «яндекс директ».",
   lead_path="Контекстная реклама → /ru/kontekstnaya-reklama-tashkent/.",
   effort="M", honesty_risk="medium")),
 ("telegram-channel-ads-diy", dict(
   existing_url="/uz/telegram-reklama/, /ru/telegram-ads-uzbekistan/, /ru/blog/telegram-ads-ili-posevy-v-kanalah/",
   serp_weakness="mixed",
   serp="Не снимался. GSC: /uz/telegram-reklama/ поз. 9 по «narxi telegram kanalda» (1 показ); RU-спица собирает украинские «біржа реклами телеграм» (поз. 22–90, нецелевая гео).",
   page="Без нового URL: в UZ-хаб и RU-спицу добавить DIY-чеклист «как выбрать канал»: охват и ER, признаки накрутки, какую статистику просить у админа, формат поста и UTM, оплата по договору или счёту. Без названий конкретных каналов.",
   lead_path="Посевы и Telegram Ads → /uz/telegram-reklama/, /ru/telegram-ads-uzbekistan/.",
   effort="S", honesty_risk="low")),
 ("target-nima-ctr-uz", dict(
   existing_url="/uz/blog/target-reklama-nima/",
   serp_weakness="mixed",
   serp="Не снимался. GSC 3 мес: «target nima» 69 показов поз. 8,4, «таргет нима» 74 показа поз. 7,3, 0 кликов. L2 (24.10) уже проверил: фраза есть в title, description и FAQ, кириллический FAQ есть.",
   page="Не править до конца CTR-окна (~05–07.11) и не ломать правку S3 от 07.10. После окна одна правка: ссылка из блока #ozingiz-yoki-mutaxassis на новый DIY-блок хаба, чтобы путь шёл «что это → как включить → закажите». Новых URL нет.",
   lead_path="Таргет → /uz/instagram-target-yoqish/.",
   effort="S", honesty_risk="low")),
 ("advertising-law-uz", dict(
   existing_url="",
   serp_weakness="strong",
   serp="Не снимался; ожидаемо lex.uz и правовые порталы с текстом закона.",
   page="Нейтральная UZ + RU статья «Reklama to‘g‘risidagi qonun: Instagram va Telegram reklamasi uchun nimani bilish kerak»: пересказ норм со ссылками на статьи закона на lex.uz и датой редакции; без правовых советов и без «как обойти». Мягкий CTA.",
   lead_path="SMM и таргет (слабо); основной эффект — доверие и AI-цитирование.",
   effort="M", honesty_risk="medium")),
 ("diy-learn-smm-target", dict(
   existing_url="",
   serp_weakness="mixed",
   serp="Не снимался; в SERP «target yoqish» уже стоят курсы (ustoz.ai) и уроки на YouTube. Аудитория в основном хочет профессию, а не подрядчика.",
   page="Низкий приоритет. Если делать — UZ-гайд «Biznes egasi uchun SMM va target: o‘zingiz boshlash uchun 30 kunlik reja» (бесплатно, не курс и не сертификат), ссылки на DIY-блок хаба, инструкцию Ads Manager и статью об оплате; CTA «vaqt yo‘q — topshiring».",
   lead_path="SMM → /uz/smm-xizmatlari/ (слабо).",
   effort="M", honesty_risk="low")),
]

KW = {
 "target-yoqish-diy-uz": "UZ лат.: target yoqish 260, instagramda target yoqish 140, instagram target 50, target ads 20, reklama qilish 20; по 10 — target qilish, instagramda target qilish, target reklama, instagramda reklama berish, instagramda reklama qilish (= instagram reklama qilish), reklama berish, instagram reklama, reklama instagram, facebook reklama (CPC 6,80). UZ кир.: таргет ёқиш, таргет созлаш = 0. Ноль: target sozlash, target qanday yoqiladi, instagram reklama berish, reklama kabinet ochish.",
 "telegram-ads-diy": "Лат./RU: telegram ads 6 600, ads telegram 1 000, ads telegram org 880 (навиг.), телеграм адс 110, telegram ads узбекистан 40, telegram ads platform 20 (= telegram ad platform); по 10 — telegram ads цена, стоимость, минимальный бюджет, как запустить, ton, uzbekistan, на русском, что это, это, телеграм ads. UZ: telegram ads narxi / qanday ishlaydi / o‘zbekistonda = 0 (узбекский спрос сидит в латинской голове). Исключены (не реклама): fragment telegram 1 600, toncoin 480, ton coin 260, ton narxi 210, ton sotib olish 50.",
 "meta-ads-manager-guide": "Лат./RU (навигационные): ads manager 9 900 (= adsmanager), meta business suite 3 600, facebook ads manager 1 300 (= ads manager facebook), facebook ads 1 000 (= ads fb, fac ads), business suite 880, meta ads manager 880, meta ads 720 (рост 480→1 300), meta business 390, business manager 320, business facebook com 320, адс менеджер 210, instagram ads 90; хвост: бизнес менеджер 40, instagram ads manager 40, адс менеджер фейсбук 30, мета адс 30, ads manager где находится 20, бизнес аккаунт инстаграм 20, по 10 — рекламный кабинет фейсбук / инстаграм, создание рекламного кабинета фейсбук, настройка ads manager, профессиональный аккаунт инстаграм. UZ: reklama kabinet, reklama kabinet ochish, biznes menejer, facebook biznes menejer = 0.",
 "google-ads-from-uz": "Навиг.: google ads 4 400, google ads вход 50, google ads account 30, google ads login 20. Инфо: гугл реклама 110, google реклама 70, youtube ads 40, google reklama 30; по 10 — реклама в гугл (= в гугле, CPC 4,83), реклама в гугл цена, google reklama berish, youtube reklama, youtube реклама, реклама на ютубе, реклама в поисковике гугл, реклама от google, товарная реклама гугл. Ноль: google ads o‘zbekistonda, google ads uzbekistan, оплата google ads, как оплатить google ads, googleda reklama berish.",
 "meta-troubleshooting": "RU, по 10: заблокировали рекламу в инстаграм, инстаграм заблокировал рекламу, инстаграм отклоняет рекламу, реклама на рассмотрении инстаграм, реклама отключена инстаграм, через сколько запускается реклама в инстаграм, реклама в инстаграм запрещена, рекламный аккаунт отключен, инстаграм заблокировал аккаунт (= заблокировали инстаграм, instagram bloklandi). Пиксель и лиды: meta pixel 20, лид форма 20, facebook pixel 10 (= facebook piksel), лид форма фейсбук 10, instagram lead form 10. Ноль: reklama kabinet bloklandi, akkaunt bloklandi, reklama rad etildi, piksel o‘rnatish, заблокировали рекламный кабинет / аккаунт, реклама отклонена, установка пикселя facebook.",
 "ru-instagram-ads-howto": "RU: таргетинг в инстаграм 628 (среднее за 12 мес; ряд 10→1 300, вероятно склеенный бакет, учтено x0,5), таргет в инстаграм 40, таргетированная реклама 40, таргетированной рекламой 40, реклама в инстаграм 30, таргет инстаграм 20 (= таргет инста); по 10 — как сделать / настроить / дать / запустить рекламу в инстаграм, как запустить / настроить таргет в инстаграм, настройка таргета в инстаграм (CPC 7,79), настроить таргет, запустить таргет в инстаграме, настройка рекламы инстаграм, таргет инстаграм как запустить, запуск таргета через фейсбук (CPC 12,17), продвижение публикации в инстаграм, реклама в инстаграм через фейсбук. Исключены: «таргет» 390 (неоднозначно), ценовые запросы (ценовая линза).",
 "ad-payment-uz": "Про рекламу (RU, по 10): как оплатить рекламу в инстаграм, оплата рекламы в инстаграм, оплата рекламы фейсбук. Смежные карточные (учтены x0,05, банковский интент): visa karta 1 000, visa karta ochish 880, virtual karta ochish 390, uzum visa 110, humo visa 90 (CPC 2,32), virtual karta 70, uzcard visa 50, виртуальная карта visa 40, по 20 — virtual visa karta, visa virtual karta, humo visa karta, visa карта узбекистан. Ноль: reklama to‘lovi, reklama uchun karta, оплата рекламы uzcard / humo, карта для оплаты рекламы, как оплатить рекламу в фейсбук из узбекистана.",
 "yandex-direct-uz": "RU/лат.: яндекс директ 590, yandex direct 390 (CPC 5,26), yandex reklama 70, яндекс директ узбекистан 40; по 10 — реклама в яндексе, реклама в яндекс директ, яндекс директ цена (CPC 6,65), direct яндекс, реклама в яндексе цена. Ноль: yandex direct uzbekistan, яндекс директ ташкент.",
 "telegram-channel-ads-diy": "UZ/RU: telegram reklama 70 (рост 40→140), реклама в телеграм 70 (CPC 4,65); по 10 — телеграм реклама, telegramda reklama berish, реклама в телеграм каналах, реклама в телеграм цена, реклама на телеграм канале, реклама телеграм (CPC 6,26), реклама в ботах телеграм, как запустить рекламу в телеграм. Ноль: telegram kanalda reklama, telegram kanalga reklama berish, telegram reklama narxi, как дать рекламу в телеграм канале.",
 "target-nima-ctr-uz": "UZ лат.: target nima 320 (CPC 2,80), targeting nima 50; UZ кир.: таргет нима 50.",
 "advertising-law-uz": "UZ: reklama to‘g‘risidagi qonun 530 (среднее за 12 мес, весной до 1 000); RU: закон о рекламе узбекистан 50; reklama qonuni 0.",
 "diy-learn-smm-target": "UZ: smm kurslari 140 (= smm kurs), smm o‘rganish 50 (CPC 12,03), target kursi 20, target kurs 10; RU по 10: таргетолог курсы, курсы таргетолога, обучение таргету, курсы smm ташкент. Ноль: target o‘rganish, targetolog kursi, курсы таргета ташкент.",
}


def fmt(a):
    return f"{a[0]:.2f}–{a[1]:.2f}".replace(".", ",")


clusters = []
for rank, (cid, q) in enumerate(Q, 1):
    c = comp[cid]
    n = lambda x: f"{x:.2f}".replace(".", ",")
    cpc = (f"взвешенный {n(c['cpc_weighted'])}; диапазон {n(c['cpc_range'][0])}–{n(c['cpc_range'][1])}"
           if c["cpc_weighted"] is not None else "нет данных (CPC у запросов отсутствует)")
    clusters.append(dict(
        priority=rank, id=cid, name=c["name"], keywords=KW[cid],
        demand_month=c["demand_effective"], demand_raw=c["demand_raw"],
        cpc_usd=cpc, cpc_weighted=c["cpc_weighted"], cpc_range=c["cpc_range"],
        visits_day_pos6=fmt(c["visits_day_pos6"]), visits_day_pos3=fmt(c["visits_day_pos3"]),
        **q, rows=c["rows"], excluded=c["excluded"],
    ))

doc = dict(
    lens="ad-platform-pains", date="2026-10-25", location=2860,
    method=dict(
        sources=["research_keywords x4 seeds (реклама в инстаграм, instagram reklama, telegram ads, facebook ads), resultLimit 500",
                 "get_keyword_metrics x1 (307 candidates)", "get_serp_results x1 (4 queries, depth 20)",
                 "get_search_console_performance (free, last 3 months 2026-07-22..2026-10-22)"],
        dedupe="one row per Google Ads bucket; close variants with identical volume+CPC+competition counted once (listed in shared_bucket)",
        info_share="0.15 pure navigational heads, 0.30 mixed SERP heads, 0.50 unverified bucket, 0.05 general card demand, 1.0 rest",
        visits="D_eff x CTR / 30 x 1.5 x AIO; CTR pos6 0.61-1.10 %, pos3 3.59 %; AIO 0.53-0.655 applied to all clusters",
        credits="own estimate ~508 of 700 (research ~384, metrics 104, SERP ~20); account 21 772 -> 20 816 incl. parallel lenses",
    ),
    totals=dict(demand_effective=sum(c["demand_month"] for c in clusters),
                visits_day_pos6="1,65–3,67", visits_day_pos3="9,69–11,97"),
    clusters=clusters,
)
json.dump(doc, open(os.path.join(os.path.dirname(HERE), "ad-platform-pains.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("written", len(clusters), "clusters; total eff", doc["totals"]["demand_effective"])
