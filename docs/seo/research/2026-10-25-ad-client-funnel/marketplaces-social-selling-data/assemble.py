# -*- coding: utf-8 -*-
"""Assemble marketplaces-social-selling.md + .json from computed.json and the narrative below.
Run: py -3 -I assemble.py  (from this folder; run compute_clusters.py first)
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
C = json.load(open(os.path.join(HERE, 'computed.json'), encoding='utf-8'))
BY = {c['id']: c for c in C['clusters']}

PRICE_TARGET = 'запуск 1 990 000 so‘m, ведение 1 490 000 so‘m/oy, бюджет отдельно (цены уже на /uz/instagram-target-yoqish/ и /ru/targetirovannaya-reklama-tashkent/)'
PRICE_SMM = 'SMM Start 2 490 000 so‘m/oy (Biznes 4 490 000, Pro 7 900 000 — /uz/smm-xizmatlari/, /ru/smm-prodvizhenie-tashkent/)'
PRICE_SITE = 'сайт: интернет-магазин от 14 900 000 so‘m, лендинг от 2 990 000 so‘m (/uz/sayt-yaratish/)'
PRICE_BOT = 'AI-бот магазина Start 1 990 000 so‘m, Biznes 3 900 000, Pro 6 900 000, поддержка 490 000 so‘m/oy (/uz/dokon-uchun-ai-bot/, /ru/ai-bot-dlya-magazina/)'
TG_NOTE = 'Telegram-реклама/посевы: агентской цены на страницах нет (только смета после брифа; 0,1 TON — минимальный CPM платформы, не наша цена)'

N = {
 'uzum-sotuvchi-start': dict(priority=1,
  name='Uzum Market’da sotuvchi bo‘lish: hujjatlar, ro‘yxatdan o‘tish, FBO/FBS, birinchi savdo (UZ + RU)',
  existing_url='нет (новые URL)',
  page='Новые URL: UZ /uz/blog/uzum-marketda-sotuvchi-bolish/ + RU /ru/blog/kak-stat-prodavcom-na-uzum-market/. Тип: пошаговый гайд со ссылками на официальный мануал seller.uzum.uz; его текст и скриншоты не копировать. Блоки: кто может продавать (YaTT / MChJ / o‘zini o‘zi band — по мануалу); регистрация в Uzum Sellers; FBO и FBS; требования к карточке (ссылка на C6); «откуда берутся первые покупатели»: поиск Uzum, внутренняя реклама в кабинете, внешний трафик (ссылка на C2). CTA стоит там, где продавцы обычно застревают: «Kartochka tayyor, lekin sotuv yo‘qmi? Tashqi trafikni biz yoqib beramiz». Доход не обещать. Ставки комиссий в тексте не называть: ссылка на официальный тариф с датой проверки (дальше калькулятор C12).',
  lead_path='Косвенный. После запуска продавцу нужен трафик, и тут продаётся Instagram-таргет на карточку: ' + PRICE_TARGET + '. Дальше ' + PRICE_SMM + ' и Telegram-бот магазина (Start 1 990 000 so‘m). Услуги «ведение магазина на Uzum» на сайте нет, обещать её нельзя.',
  serp='«uzum seller»: AIO; топ-5 органики — academy.uzum.uz ×2, пресс-центр uzum.com, гайд mertech.uz (вендор POS) на 4-м месте, YouTube. Дальше Uzum Nasiya, Google Play, канал Uzum Sellers, sellers.uzum.market, на 11-м месте olx.uz (услуги «uzum seller»-менеджеров), azma.uz на 12-м, свежие гайды dora.uz RU/EN (7 окт. 2026) на 15–16-м. «uzumda savdo qilish»: официальный мануал на 1-м месте, YouTube на 2-м, moysklad.uz на 3-м, seller.uzum.uz на 4-м, YouTube на 5-м, Instagram reel на 6-м, затем AIO. Агентских страниц нет; текстовых UZ-гайдов три (moysklad, azma, mertech).',
  serp_weakness='mixed', effort='M', honesty_risk='low',
  note='Из 5 900 эффективного спроса 5 185 дают навигационные головы ×0,05: uzum seller 74 000, seller uzum uz 12 100 (CPC 9,31), seller uzum 8 100 (CPC 5,81), узум селлер 5 400, uzum seller login 2 900, uzum market seller 880, uzum seller kabinet 320. При доле 0,02 кластер сжимается до ~2 800. Чистый DIY-хвост — 715. Высокий CPC навигационных голов значит, что за клик продавца Uzum уже кто-то платит (курсы, сервисы, банки).'),
 'marketplace-tashqi-reklama': dict(priority=2,
  name='Uzum’dagi mahsulotga reklama: ichki reklama va tashqi trafik — Instagram, Telegram (UZ + RU)',
  existing_url='нет (новая спица; хабы /uz/instagram-target-yoqish/ и /ru/targetirovannaya-reklama-tashkent/)',
  page='Новая спица под хабом target-uz: UZ /uz/blog/uzum-mahsulotiga-reklama/ + RU /ru/blog/reklama-tovara-na-uzum-market/; Wildberries — одним абзацем. Хаб не каннибализируется: он владеет «target yoqish», спица — «реклама товара на маркетплейсе». Блоки: (1) внутренняя реклама в кабинете продавца — как устроена, ссылка на официальный раздел; мы её не ведём. (2) Внешний трафик: Instagram-таргет на ссылку карточки, посевы в Telegram, блогеры. (3) Как мерить: UTM внутри маркетплейса не работает, поэтому промокод, отдельный SKU или всплеск заказов; честно сказать, что атрибуция приблизительная. (4) Бюджет через ДРР (калькулятор C12). CTA — форма хаба.',
  lead_path='Прямой: таргет на карточку — ' + PRICE_TARGET + '. Вторично — посевы через /uz/telegram-reklama/ (' + TG_NOTE + ').',
  serp='Не снималась: спрос 100 в месяц. Оценка по соседней выдаче «uzumda savdo qilish»: официальный мануал, YouTube, Instagram reel; ни одной агентской страницы и ни одной страницы о внешнем трафике на Uzum.',
  serp_weakness='weak', effort='S', honesty_risk='low',
  cpc_text='CPC в Google Ads нет: все строки в нижней корзине. Прокси — соседние «target yoqish» 1,55 и «instagramda target yoqish» 3,26 (линза ad-platform-pains)',
  note='Спрос мизерный, но это самая прямая продажа таргета во всей линзе. Сюда должны вести C1, C4, C10 и C12.'),
 'uzum-kalkulyator': dict(priority=3,
  name='Uzum sotuvchi kalkulyatori: komissiya, logistika, reklama (DRR) → sof foyda (UZ + RU)',
  existing_url='нет (новый инструмент; CPL-виджет на /ru/kontekstnaya-reklama-tashkent/ можно переиспользовать технически)',
  page='Новая страница-инструмент: UZ /uz/uzum-sotuvchi-kalkulyatori/ + RU /ru/kalkulyator-prodavca-uzum/. Поля: цена, себестоимость, комиссия % (вводит пользователь; рядом ссылка на официальный тариф seller.uzum.uz с датой проверки, ставки не хардкодить), логистика FBO/FBS, возвраты, доля рекламы (ДРР). Итог — маржа и точка безубыточности. Строка «реклама» ведёт на C2: «сколько можно тратить на внешний трафик». Движок общий с калькулятором маркетолога из линзы prices-tools (ROMI/CPL/ДРР).',
  lead_path='Таргет на карточки (' + PRICE_TARGET + ') через строку ДРР; SMM-контент.',
  serp='Не снималась. Сигнал спроса: в выдаче «uzumda savdo qilish» YouTube-ролик рекламирует «SUPER KALKULYATOR» для Uzum, а текстового калькулятора в топе нет.',
  serp_weakness='weak', effort='M', honesty_risk='medium',
  note='Риск: устаревшие или выдуманные ставки комиссий. Ставку вводит пользователь, рядом стоит официальный источник с датой.'),
 'mahsulot-reklama-dokon': dict(priority=4,
  name='Mahsulotni qanday reklama qilish: do‘kon va onlayn sotuvchi uchun kanallar (UZ) / Реклама интернет-магазина (RU)',
  existing_url='нет (новые спицы; хабы /uz/internet-reklama-toshkent/, /ru/internet-reklama-tashkent/)',
  page='Новые спицы: UZ /uz/blog/mahsulotni-reklama-qilish/ + RU /ru/blog/reklama-internet-magazina/. Хаб digital-paid-media-ru владеет «интернет реклама Ташкент», а не этим интентом. Тип: практический разбор каналов для товара, таблица «канал → когда работает → с какого бюджета начать → как мерить»: Instagram-таргет, Telegram Ads и посевы, блогеры, внутренняя реклама маркетплейса, Google/Яндекс для товаров с поисковым спросом. Нейтральный блок «что запрещено рекламировать» со ссылкой на lex.uz (закон «О рекламе», страница линзы ad-platform-pains). Выдача наполовину школьная, поэтому первый экран сразу отвечает бизнесу («do‘koningiz uchun»).',
  lead_path='Прямой: таргет (' + PRICE_TARGET + '), ' + PRICE_SMM + ', Telegram-реклама (' + TG_NOTE + ').',
  serp='«mahsulotni reklama qilish»: видео-блок и AIO. Топ-5: advice.uz (требования к рекламе товаров), uz.wikipedia, law.2gis.uz, edubaza.uz (урок информатики 8 класса), YouTube (школьный урок). Дальше блог агентства uznetix, SMS-реклама playmobile, scribd, soff.uz, billz.io (8 советов), lex.uz, kun.uz (2021). Практического гайда для бизнеса в топ-10 нет.',
  serp_weakness='weak', effort='S', honesty_risk='low',
  note='«mahsulotni reklama qilish» 170 учтён с долей 0,5: это тема школьного учебника. Ниша «магазин одежды» отдана линзе niche-playbooks.'),
 'onlayn-dokon-ochish': dict(priority=5,
  name='Onlayn do‘kon ochish: Instagram, Telegram, Uzum yoki sayt — qayerdan boshlash (UZ + RU)',
  existing_url='/uz/blog/internet-dokon-yaratish-narxi-toshkent/, /ru/blog/skolko-stoit-internet-magazin-tashkent-2026/ (прайс-спицы: ссылаться, не каннибализировать)',
  page='Новые URL: UZ /uz/blog/onlayn-dokon-ochish/ + RU /ru/blog/kak-otkryt-internet-magazin-v-uzbekistane/. Тип: гайд-развилка «4 пути»: магазин в Instagram или Telegram-канале; Telegram-бот или Mini App с каталогом и оплатой Payme/Click; маркетплейс (→ C1, C4); свой сайт. Для каждого пути: что нужно, сколько стоит (только ссылки на прайс-спицы), как приводить покупателей. Прайс-спицы и /ru/blog/lending-korporativnyy-sayt-ili-internet-magazin/ отвечают на «сколько стоит» и «какой тип сайта», эта страница — на «с какого канала начать». Регистрация бизнеса — нейтрально, со ссылкой на официальный портал.',
  lead_path=PRICE_SITE + '; ' + PRICE_BOT + '; таргет на запуск.',
  serp='Не снималась. GSC: RU-прайс-спица уже стоит на 19–20-м месте по «создание интернет-магазина в ташкенте» (3 показа за 3 месяца).',
  serp_weakness='mixed', effort='M', honesty_risk='low',
  note='Запросы про Instagram- и Telegram-магазины — по 10 в месяц. Эти вопросы задают в YouTube, Telegram и ChatGPT, поэтому страница нужна в первую очередь для AI-цитирования.'),
 'telegram-kanal-biznes': dict(priority=6,
  name='Telegram kanal ochish va yuritish biznes uchun (UZ) / Как создать Telegram-канал для бизнеса (RU)',
  existing_url='нет (новые URL)',
  page='Новые URL: UZ /uz/blog/telegram-kanal-ochish-biznes-uchun/ + RU /ru/blog/kak-sozdat-telegram-kanal-dlya-biznesa/. Тип: пошаговая инструкция — создать канал, публичная ссылка, описание, обсуждения, бот для заявок, закреп с прайсом. Раздел «первые подписчики законно» — ссылка на страницу obunachi-halol (линза prices-tools), без дублирования. Раздел интентов: создание и настройка — здесь, рост — у obunachi-halol.',
  lead_path='Telegram Ads и посевы (/uz/telegram-reklama/, /ru/telegram-ads-uzbekistan/; ' + TG_NOTE + '); ведение Telegram входит в SMM-пакеты (' + PRICE_SMM + '); Telegram-бот для заявок (/uz/telegram-bot-biznes-uchun/).',
  serp='«как создать канал в телеграм»: AIO, YouTube на 1-м месте, PAA, видео-блок, короткие видео. Текст: ppc.world, yandex.ru/q, blog.selfpub.ru, webolution.ru, vc.ru ×2, partnerkin, blackriver.agency. Это общероссийский контент; узбекских сайтов нет. UZ-варианты не снимались.',
  serp_weakness='strong', effort='S', honesty_risk='low',
  note='«telegramda kanal ochish» 74 000 — аномалия Google Ads: в 1 000 раз больше, чем «telegram kanal ochish» (70). Исключена.'),
 'marketpleyslar-taqqoslash': dict(priority=7,
  name='Маркетплейсы Узбекистана для продавца: Uzum, Market Yandex Go, Wildberries, Ozon — сравнение (RU + UZ)',
  existing_url='нет (новые URL)',
  page='Новые URL: RU /ru/blog/marketpleysy-uzbekistana-dlya-prodavca/ + UZ /uz/blog/ozbekiston-marketpleyslari-sotuvchi-uchun/. Тип: сравнительная таблица по официальным источникам с датой проверки: кто может продавать, модели FBO/FBS, где смотреть тарифы (ссылки, а не цифры), куда продаёт площадка (UZ или РФ+СНГ), что нужно от продавца (карточки, фото, реклама). Якорные разделы под C5. CTA: «на любой площадке трафик решает реклама — запустим таргет на ваши карточки».',
  lead_path='Таргет (' + PRICE_TARGET + '), SMM; для тех, кто уходит с маркетплейса на свой канал, — ' + PRICE_SITE + '.',
  serp='Не снималась. В выдаче «yandex market seller» (C5) официальные партнёрские страницы занимают топ-3; сравнительных статей по Узбекистану в снятых выдачах нет.',
  serp_weakness='mixed', effort='M', honesty_risk='medium',
  note='Риск: тарифы и условия меняются. Только ссылки на официальные страницы с датой, без собственных таблиц комиссий.'),
 'kartochka-ai': dict(priority=8,
  name='Mahsulot kartochkasi: tavsif generatori + infografika va rasm talablari (AI-rol, UZ + RU)',
  existing_url='роли чата src/gpt-chat/roles.ts («marketer», «seller», «smm»); /ru/gpt-v-marketinge-smm/',
  page='Новая страница-инструмент: UZ /uz/mahsulot-kartochkasi-generatori/ + RU /ru/generator-kartochki-tovara/. Шаблон поверх существующих ролей чата. Форма: название, характеристики, для кого. На выходе: заголовок с лимитом длины, 5 буллетов, описание UZ + RU, ключевые слова для поиска маркетплейса. Под формой — чек-лист инфографики и фото: без «№1/лучший» без доказательств, без выдуманных характеристик. С генератором рекламного текста из линзы prices-tools не пересекается (там объявление, здесь карточка); движок общий.',
  lead_path='SMM-контент (' + PRICE_SMM + '; тексты и дизайн постов, stories, reels в пакете); таргет на готовую карточку (запуск 1 990 000 so‘m); ' + PRICE_SITE + '.',
  serp='Не снималась: спрос от 10 до 90. «описание товара для маркетплейса» — 10 в месяц и уже учтено линзой prices-tools. Ценность — инструмент, который сохраняют, и AI-цитирование.',
  serp_weakness='mixed', effort='M', honesty_risk='medium',
  note='AI может выдумать характеристики. Шаблон берёт только введённые данные и предупреждает о правилах площадки. «infografika» 1 300 учтена с долей 0,05: это школьные задания и общий дизайн.'),
 'tg-kanal-statistika': dict(priority=9,
  name='Kanal statistikasi: TGStat va Telemetr — reklama joylashdan oldin tekshirish (расширение)',
  existing_url='/uz/telegram-reklama/, /ru/blog/telegram-ads-ili-posevy-v-kanalah/',
  page='Без нового URL: раздел в чек-листе «как выбрать канал», который линза ad-platform-pains (telegram-channel-ads-diy) уже ставит в /uz/telegram-reklama/ и /ru/blog/telegram-ads-ili-posevy-v-kanalah/. Добавить: какие метрики смотреть в TGStat и Telemetr (охват поста, ER/ERR, динамика подписчиков, признаки накрутки), как читать CPM. Конкретные каналы не называть. RU-спица уже собирает ~60 показов по украинским «біржа телеграм каналів» (места 31–54) — тема рядом.',
  lead_path='Посевы в Telegram под ключ и Telegram Ads (' + TG_NOTE + ').',
  serp='Не снималась. Головы tgstat и telemetr ведут на сами сервисы, это навигация. CPC telemetr 9,43 показывает, что за эту аудиторию платят.',
  serp_weakness='strong', effort='S', honesty_risk='low',
  note='Считаются только головы инструментов (×0,05) и «статистика телеграм канала»; спрос «реклама в телеграм» уже учтён у ad-platform-pains.'),
 'nakrutka-xavfi': dict(priority=10,
  name='Nakrutka: nima uchun obunachi sotib olish zarar (раздел страницы obunachi-halol)',
  existing_url='нет (страница /uz/blog/instagram-obunachi-kopaytirish/ предложена линзой prices-tools)',
  page='Без нового URL: раздел «Nakrutka nega zarar» на /uz/blog/instagram-obunachi-kopaytirish/ (там же Telegram). Содержание: как накрутка ломает охваты и статистику; как боты портят аудиторию таргета (похожие аудитории строятся по мусору); что правила Instagram говорят о неаутентичной активности, со ссылкой на официальный текст. Никаких ссылок на панели и никакого «как накрутить безопасно».',
  lead_path='SMM (' + PRICE_SMM + '); таргет как законный платный рост (запуск 1 990 000 so‘m).',
  serp='«instagram nakrutka»: AIO; топ — списки сервисов (webmart.by, dtf.ru, vc.ru ×4), объявления olx.uz «накрутка в Ташкенте», панели (cheatbot, likestorm, mrpopular, prmotion). О рисках пишут только dtf.ru и landpr.kz («чёрный метод»). Интент — покупка.',
  serp_weakness='strong', effort='S', honesty_risk='medium',
  note='18 310 сырого спроса взяты с долей 0,05: почти все ищущие хотят купить. Ранжироваться страница будет в хвосте «накрутка риски», а не в голове.'),
 'wb-ozon-ym-sotuvchi': dict(priority=11,
  name='Wildberries, Ozon, Market Yandex Go: как начать продавать из Узбекистана (разделы в C4)',
  existing_url='нет (якорные разделы страницы C4)',
  page='Отдельного URL на старте нет: якорные разделы внутри страницы C4 (#wildberries, #yandex-market, #ozon). Выносить в отдельную страницу, только если GSC покажет показы. Market Yandex Go вышел в Узбекистане недавно: официальная справка есть на yandex.uz/support, UZ-текстов почти нет. Это самый реальный из трёх разделов.',
  lead_path='Как у C4: таргет на карточки, SMM-контент, свой сайт.',
  serp='«yandex market seller»: AIO; топ-3 — официальные partner.market.yandex.uz, partner.market.yandex.ru, market.yandex.uz; дальше App Store, Google Play, YouTube и Instagram Яндекса, справка yandex.uz, mpstats, tochka, rb.ru. sellerlab.uz (агентство, ведёт магазины на YM в Ташкенте) — на 15-м месте.',
  serp_weakness='strong', effort='S', honesty_risk='low',
  note='Головы порталов продавцов учтены с долей 0,15; логин-названия (wb partners, seller wildberries ru) — с долей 0,05.'),
 'olx-biznes': dict(priority=12,
  name='OLX’da biznes sifatida sotish: e’lon, TOP/VIP, biznes paket va qachon target kerak (UZ)',
  existing_url='нет (новый URL)',
  page='Новая UZ-статья /uz/blog/olx-da-biznes-sifatida-sotish/; RU — абзацем позже. Тип: короткая инструкция плюс раздел «когда OLX перестаёт хватать». Тарифы OLX не цитировать, только ссылка на официальный раздел. Приоритет низкий: большинство ищущих — частные лица.',
  lead_path='Слабый: таргет и сайт для продавцов, которые переросли объявления.',
  serp='Не снималась. Ожидается справка самого OLX и YouTube.',
  serp_weakness='strong', effort='S', honesty_risk='low',
  note='Строки «e’lon berish / подать объявление» взяты с долей 0,5 (частники).'),
}


CMAP = {1: 1, 2: 2, 12: 3, 3: 4, 10: 5, 7: 6, 4: 7, 6: 8, 8: 9, 9: 10, 5: 11, 11: 12}


def rc(s):
    return re.sub(r'\bC(\d{1,2})\b', lambda m: '№%d' % CMAP[int(m.group(1))], s)


for _n in N.values():
    for _k, _v in list(_n.items()):
        if isinstance(_v, str):
            _n[_k] = rc(_v)


def lang(k):
    if re.search('[а-яё]', k, re.I):
        return 'UZ кир.' if re.search('[ўқғҳ]|очиш|сотиш|сотувчи', k, re.I) else 'RU'
    return 'лат.'


def fmt(n):
    return '{:,}'.format(int(n)).replace(',', ' ')


def fnum(x, d=2):
    return ('{:.%df}' % d).format(x).replace('.', ',')


def kw_text(c):
    groups = {}
    for r in c['rows']:
        if r['volume'] == 0:
            continue
        s = '%s %s' % (r['keyword'], fmt(r['volume']))
        if r['shared_bucket']:
            s = '%s (= %s) %s' % (r['keyword'], ', '.join(r['shared_bucket']), fmt(r['volume']))
        extra = []
        if r['cpc'] is not None:
            extra.append('CPC ' + fnum(r['cpc']))
        if r['info_share'] < 1:
            extra.append('×' + fnum(r['info_share'], 2).rstrip('0').rstrip(','))
        if r['source'] != 'm':
            extra.append('данные prices-tools')
        if extra:
            s += ' (' + ', '.join(extra) + ')'
        groups.setdefault(lang(r['keyword']), []).append(s)
    parts = ['%s: %s' % (g, '; '.join(v)) for g, v in groups.items()]
    return '. '.join(parts) + '.'


def cpc_text(c, n):
    if n.get('cpc_text'):
        return n['cpc_text']
    if c['cpc_weighted'] is None:
        return 'нет данных'
    lo, hi = c['cpc_range']
    if lo == hi:
        return '%s (одна строка с CPC)' % fnum(lo)
    return 'взвешенный %s; диапазон %s–%s' % (fnum(c['cpc_weighted']), fnum(lo), fnum(hi))


def vtxt(v):
    return '%s–%s' % (fnum(v[0]), fnum(v[1]))


clusters = []
for cid, n in sorted(N.items(), key=lambda kv: kv[1]['priority']):
    c = BY[cid]
    clusters.append(dict(
        priority=n['priority'], id=cid, name=n['name'], keywords=kw_text(c),
        demand_month=c['demand_eff'], demand_raw=c['demand_raw'],
        cpc_usd=cpc_text(c, n), cpc_weighted=c['cpc_weighted'], cpc_range=c['cpc_range'],
        serp=n['serp'], serp_weakness=n['serp_weakness'], existing_url=n['existing_url'], page=n['page'],
        lead_path=n['lead_path'], effort=n['effort'], honesty_risk=n['honesty_risk'],
        visits_day_pos6=vtxt(c['visits_day_pos6']), visits_day_pos3=vtxt(c['visits_day_pos3']),
        note=n['note'], rows=c['rows'], excluded=c['excluded']))

T = C['totals']
meta = dict(
    lens='marketplaces-social-selling', date='2026-10-25', location=2860,
    method=dict(
        sources=['research_keywords x1 (3 seeds: uzum market, telegram kanal, интернет магазин; resultLimit 500) — выдал почти только покупательскую навигацию, см. research1_note.json',
                 'get_keyword_metrics x1 (406 кандидатов вручную, 260 ненулевых) — kw_metrics_raw.json',
                 'get_serp_results x1 (6 запросов, depth 20): uzum seller, uzumda savdo qilish, yandex market seller, как создать канал в телеграм, mahsulotni reklama qilish, instagram nakrutka',
                 'get_search_console_performance x12 (бесплатно, 2026-07-22..2026-10-22, фильтры uzum/olx/маркетплейс/kon/obunachi/reels/kanal/канал/телеграм канал/магазин/instagram/инстаграм)',
                 'переиспользовано: prices-tools-data/research1_table.txt (реклама магазина 30, реклама для магазина 10)'],
        dedupe='Одна строка на бакет Google Ads: варианты порядка слов, множественного числа и апострофа с одинаковыми метриками считаются один раз (поле shared_bucket). Транслит (wildberries / вайлдберриз) считается отдельно. Строки, уже учтённые линзами prices-tools (obunachi-halol, ai-reklama-matni, mobilograf-reels, heshteg-bio, kontent-reja), ad-platform-pains (telegram-channel-ads-diy) и niche-playbooks (магазин одежды), не считаются. Скрипт падает при двойном учёте ключа между кластерами.',
        info_share='1,0 DIY/продавец; 0,5 двусмысленные (школьная тема, частники, смешанный смысл); 0,3 смешанные головы (покупатели + продавцы); 0,15 головы порталов продавцов со смешанной выдачей; 0,05 логин и чистая навигация, а также интент покупки (uzum seller, tgstat, nakrutka)',
        visits='D_eff × CTR / 30 × 1,5 × AIO; CTR 6-го места 0,61–1,10 %, 3-го места 3,59 %; AIO 0,53–0,655 применён ко всем кластерам, потому что AI Overview был во всех 6 снятых выдачах',
        prices='только цены, уже опубликованные на тарифных страницах сайта (таргет, SMM, сайт, AI-бот магазина); для Telegram-рекламы агентской цены нет',
        credits='собственная оценка ~420–460 из 600: research ~288 (3 × ~96, тариф стран с данными Google Ads), metrics 406 ключей ~104–140, SERP 6 × ~5 = ~30. Баланс аккаунта 20 700 → 18 950, включая параллельные линзы'),
    totals=dict(demand_effective=T['demand_eff'], visits_day_pos6=vtxt(T['visits_day_pos6']), visits_day_pos3=vtxt(T['visits_day_pos3']),
                uzum_share_note='№1 даёт 5 900 из 11 071 (53 %); без навигационных голов Uzum вся линза ≈ 5 900 эффективного спроса'),
    gsc='0 кликов и меньше 10 релевантных показов за 3 месяца по продавцам маркетплейсов и соцсетевой торговле: uzum/olx/маркетплейс/reels — 0 строк; «internet do‘kon yaratish» — 1 показ (31-е место); «narxi telegram kanalda» — 1 показ (9-е место); RU-спица про посевы — ~60 украинских показов «біржа телеграм каналів» (места 31–54). Подробности в marketplaces-social-selling-data/serp_gsc.json',
    clusters=clusters)
json.dump(meta, open(os.path.join(OUT, 'marketplaces-social-selling.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------------- markdown ----------------
L = []
A = L.append
A('# Линза «marketplaces-social-selling»: продавцы маркетплейсов и соцсетей, которым нужна реклама')
A('')
A('Дата: 2026-10-25. Рынок: Узбекистан (loc 2860; данные Google Ads, поэтому KD и intent недоступны).')
A('Машиночитаемая версия: `marketplaces-social-selling.json`. Сырые данные и скрипты: `marketplaces-social-selling-data/`.')
A('')
A('## Главное')
A('')
A('1. **Самый сильный денежный сигнал линзы — навигация продавцов Uzum.** Семейство «uzum seller / seller uzum uz / узум селлер / uzum seller login» даёт около 104 000 запросов в месяц. CPC доходит до $9,31 (seller uzum uz) и $5,81 (seller uzum): за клик продавца уже платят курсы, сервисы и банки. Если взять всего 5 % этих запросов как «как стать продавцом», это крупнейший эффективный кластер линзы: 5 900 в месяц, из них 715 — чистый DIY.')
A('2. **Соцсетевая торговля в Google почти не ищется.** «Instagram do‘kon ochish», «telegramda sotish», «reels g‘oyalar», «магазин в инстаграм», «olx biznes» — 0 или 10 запросов в месяц. Эти вопросы живут в YouTube, Telegram и ChatGPT. Для них страница нужна ради AI-цитирования: первый SMM-лид 07.10 пришёл из chatgpt.com, а не из Google.')
A('3. **Агентств в выдачах нет, а рынок услуг для продавцов есть.** В топе по Uzum стоят вендоры POS и учёта (mertech.uz на 4-м месте, moysklad.uz, azma.uz), официальная академия, YouTube и свежие гайды dora.uz (октябрь 2026). На olx.uz десятки объявлений «uzum seller»-менеджеров; sellerlab.uz ведёт магазины на Market Yandex Go. Услуги «ведение магазина на маркетплейсе» на сайте нет. Продавать надо то, что есть: таргет на карточку, SMM-контент, сайт и бот магазина.')
A('4. **Потолок трафика скромный.** Эффективный спрос 12 кластеров — %s в месяц. На 6-м месте это %s визита в день, на 3-м — %s. Больше половины даёт C1.' % (fmt(T['demand_eff']), vtxt(T['visits_day_pos6']), vtxt(T['visits_day_pos3'])))
A('5. **Сайт в этой теме сейчас невидим.** Search Console за 3 месяца: 0 кликов и меньше 10 релевантных показов. Любая страница отсюда — чистый прирост, каннибализации нет.')
A('')
A('## Хитрый угол: воронка продавца «гайд → калькулятор → внешний трафик»')
A('')
A('Продавец на Uzum проходит три этапа, и на каждом есть страница:')
A('')
A('1. **«Как стать продавцом» (C1).** Большой навигационный спрос и слабые текстовые гайды на узбекском. Человек приходит с проблемой «как начать».')
A('2. **«Сколько я заработаю» (C12, калькулятор).** Комиссия, логистика и **строка «реклама (ДРР)»**. Калькулятор сам подводит к вопросу, сколько можно потратить на трафик.')
A('3. **«Карточка есть, продаж нет» (C2).** Внутренняя реклама кабинета против внешнего трафика из Instagram и Telegram. Здесь честно продаётся то, что агентство уже делает: таргет на ссылку карточки (запуск 1 990 000 so‘m, ведение 1 490 000 so‘m/oy — цены с хаба).')
A('')
A('Вокруг воронки стоят магниты: генератор карточки товара на ролях чата (C6), сравнение маркетплейсов (C4 и C5), «onlayn do‘kon ochish» как развилка «Instagram / Telegram / Uzum / сайт» (C10, продаёт сайт и бота) и практический «mahsulotni reklama qilish» (C3). На каждой странице одна фраза в точке, где обычно застревают: «bu bosqichda ko‘pchilik to‘xtab qoladi — biz qilib beramiz». Дальше существующая форма хаба.')
A('')
A('## Кластеры')
A('')
A('| # | Кластер | Спрос эфф./мес (сырой) | CPC $ | Выдача | Страница | Усилие | Риск честности | Визиты/день, 6-е место | Визиты/день, 3-е место |')
A('|---|---|---|---|---|---|---|---|---|---|')
for c in clusters:
    short = c['page'].split('.')[0]
    A('| %d | %s | %s (%s) | %s | %s | %s | %s | %s | %s | %s |' % (
        c['priority'], c['name'], fmt(c['demand_month']), fmt(c['demand_raw']),
        ('%s (%s–%s)' % (fnum(c['cpc_weighted']), fnum(c['cpc_range'][0]), fnum(c['cpc_range'][1]))) if c['cpc_weighted'] is not None else 'нет (прокси 1,55–3,26)',
        c['serp_weakness'], short.replace('|', '/'), c['effort'], c['honesty_risk'], c['visits_day_pos6'], c['visits_day_pos3']))
A('| | **Итого** | **%s** | | | | | | **%s** | **%s** |' % (fmt(T['demand_eff']), vtxt(T['visits_day_pos6']), vtxt(T['visits_day_pos3'])))
A('')
for c in clusters:
    A('### %d. %s' % (c['priority'], c['name']))
    A('')
    A('- **Ключи:** %s' % c['keywords'])
    A('- **Спрос:** эффективный %s в месяц, сырой %s. **CPC:** %s.' % (fmt(c['demand_month']), fmt(c['demand_raw']), c['cpc_usd']))
    A('- **Выдача (%s):** %s' % (c['serp_weakness'], c['serp']))
    A('- **Существующий URL:** %s' % c['existing_url'])
    A('- **Страница:** %s' % c['page'])
    A('- **Путь к лиду:** %s' % c['lead_path'])
    A('- **Усилие:** %s. **Риск честности:** %s. **Визиты в день:** %s на 6-м месте, %s на 3-м.' % (c['effort'], c['honesty_risk'], c['visits_day_pos6'], c['visits_day_pos3']))
    A('- **Заметка:** %s' % c['note'])
    if c['excluded']:
        A('- **Исключено:** ' + '; '.join('%s — %s' % (e['keyword'], e['why']) for e in c['excluded']) + '.')
    A('')
A('## Честность: что нельзя делать на этих страницах')
A('')
A('- Не называть ставки комиссий и тарифы Uzum, WB, Ozon, Yandex и OLX своими цифрами. Только ссылки на официальные страницы с датой проверки; в калькуляторе ставку вводит пользователь.')
A('- Не обещать продажи и доход. Атрибуцию внешнего трафика на маркетплейс описывать как приблизительную: UTM внутри Uzum не работает.')
A('- Не продавать «ведение магазина на маркетплейсе»: такой услуги на сайте нет. Решение, добавлять ли её, за владельцем; её цену здесь не придумывать.')
A('- Накрутка — только как риск. Без ссылок на панели и без «безопасной накрутки».')
A('- AI-генератор карточки берёт только введённые характеристики и предупреждает о правилах площадки: без «№1/лучший» без доказательств.')
A('- Никаких выдуманных кейсов, отзывов и «наш клиент заработал X».')
A('')
A('## Метод и дедупликация')
A('')
for k in ('sources',):
    for s in meta['method'][k]:
        A('- ' + s)
A('- Дедуп: ' + meta['method']['dedupe'])
A('- Доля информационного спроса (info_share): ' + meta['method']['info_share'] + '.')
A('- Визиты: ' + meta['method']['visits'] + '.')
A('- Цены: ' + meta['method']['prices'] + '.')
A('- Кредиты: ' + meta['method']['credits'] + '.')
A('- Аномалия: «telegramda kanal ochish» = 74 000 при «telegram kanal ochish» = 70. Похоже на склейку с брендовым «telegram», поэтому строка исключена.')
A('- Не вошли (принадлежат другим линзам): мобилограф и reels (prices-tools / mobilograf-reels), Instagram bio и хэштеги (heshteg-bio), контент-план и идеи для рилс (kontent-reja), честный рост подписчиков (obunachi-halol), реклама магазина одежды (niche-playbooks).')
A('')
A('## Что проверить следующим шагом')
A('')
A('1. Снять выдачи «uzum market reklama», «комиссия узум маркет», «маркетплейсы узбекистана» (~15 кредитов). Это подтвердит оценки weak/mixed у C2, C12 и C4, которые сейчас выведены из соседних выдач.')
A('2. После публикации C1 и C2 посмотреть в GSC через 4–6 недель, какую долю навигационных голов «uzum seller» реально отдаёт Google. Это проверит допущение 5 %.')
A('3. Проверить, цитирует ли ChatGPT/Perplexity страницы C2 и C10 по запросам «Uzum’ga reklama qanday qilinadi» и «onlayn do‘kon ochish» (модуль AI-visibility OpenSEO).')
open(os.path.join(OUT, 'marketplaces-social-selling.md'), 'w', encoding='utf-8').write(rc('\n'.join(L)) + '\n')
print('ok', len(clusters), T)
