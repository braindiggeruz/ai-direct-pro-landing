# -*- coding: utf-8 -*-
"""Lens marketplaces-social-selling: build clusters from measured Google Ads rows (loc 2860).

Input : kw_metrics_raw.json (get_keyword_metrics, 406 candidates, 2026-10-25)
        + a few rows measured earlier by the prices-tools lens (source 'pt').
Output: computed.json
Run   : py -3 -I compute_clusters.py   (from this folder)
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
raw = json.load(open(os.path.join(HERE, 'kw_metrics_raw.json'), encoding='utf-8'))
M = {r['keyword']: r for r in raw['keywords']}

# rows measured by the prices-tools lens (prices-tools-data/research1_table.txt, seed «reklama»)
EXT = {
    'реклама магазина': {'search_volume': 30, 'cpc': None, 'competition': 0, 'src': 'pt'},
    'реклама для магазина': {'search_volume': 10, 'cpc': 0.64, 'competition': 0.29, 'src': 'pt'},
}

CTR6 = (0.0061, 0.0110)
CTR3 = 0.0359
AIO = (0.53, 0.655)  # every SERP pulled for this lens (6/6) carried an AI Overview

# info_share scheme (own, stated in the .md):
#  1.0  DIY / informational / seller-intent row
#  0.5  ambiguous row (school topic, private-person intent, mixed meaning)
#  0.3  mixed head (buyers + sellers, generic one-word term)
#  0.15 seller-portal head with a mixed SERP (wildberries seller, ozon seller, yandex market seller, marketplace)
#  0.05 login / pure-navigational head or purchase-intent head (uzum seller, tgstat, nakrutka)

CLUSTERS = [
 dict(id='uzum-sotuvchi-start', rows=[
   ('uzumda savdo qilish',1.0),('uzum sotuvchi',1.0),("uzum market sotuvchi bo'lish",1.0),('uzum market sotuvchi',1.0),
   ('uzum market продавец',1.0),("uzumda sotuvchi bo'lish",1.0),('uzum market biznes',0.5),('uzum seller регистрация',1.0),
   ('стать продавцом на узум',1.0),("uzum market ro'yxatdan o'tish",1.0),('uzum hamkor',0.5),('uzumda sotish',1.0),
   ('uzum marketda sotish',1.0),('uzum market partner',1.0),("uzumda do'kon ochish",1.0),('uzum продавец',1.0),
   ('узум продавец',1.0),('как стать продавцом на узум',1.0),('продавать на узум',1.0),('как продавать на uzum market',1.0),
   ('узум маркет для продавцов',1.0),('uzum market для продавцов',1.0),('uzum kurs',1.0),('uzum market kurslari',1.0),
   ('uzum seller',0.05),('seller uzum uz',0.05),('seller uzum',0.05),('узум селлер',0.05),('uzum seller login',0.05),
   ('uzum market seller',0.05),('uzum seller kabinet',0.05)],
   shared=[], excluded=[('uzum business',"Uzum Business — банк для бизнеса, не маркетплейс"),('uzum academy',"собственный курс Uzum, навигация"),
                        ('uzum menejer',"вакансия/найм менеджера, услуги такой нет на сайте")]),
 dict(id='marketplace-tashqi-reklama', rows=[
   ('uzum market reklama',1.0),('uzum reklama',1.0),('реклама на маркетплейсах',1.0),('внешняя реклама для маркетплейсов',1.0),
   ('продвижение товаров на маркетплейсах',1.0),('реклама на wildberries',1.0)],
   shared=[('реклама на wildberries',['wildberries реклама'])], excluded=[]),
 dict(id='mahsulot-reklama-dokon', rows=[
   ('mahsulotni reklama qilish',0.5),('mahsulot reklama',1.0),('mahsulot reklamasi',1.0),('реклама товаров в инстаграм',1.0),
   ('реклама магазина в инстаграм',1.0),('реклама интернет магазина',1.0),('продвижение интернет магазина',1.0),
   ('реклама магазина',0.5),('реклама для магазина',1.0)],
   shared=[('продвижение интернет магазина',['продвижение интернет магазинов']),('реклама магазина в инстаграм',['реклама инстаграм магазина (pt)'])],
   excluded=[('реклама магазина одежды / реклама одежды в инстаграм / магазин одежды реклама / kiyim do\'koni reklama',"ниша «магазин одежды» — линза niche-playbooks")]),
 dict(id='marketpleyslar-taqqoslash', rows=[
   ('marketplace uzbekistan',1.0),('маркетплейсы узбекистана',1.0),('маркетплейсы в узбекистане',1.0),('маркетплейс узбекистан',1.0),
   ('маркетплейс',0.3),('marketplace',0.15),('marketpleys',0.5),('маркетплейс что это',1.0),('как продавать на маркетплейсах',1.0),
   ('как начать продавать на маркетплейсах',1.0),('торговля на маркетплейсах',1.0),('бизнес на маркетплейсах',1.0),
   ('продажи на маркетплейсах',1.0),('что продавать на маркетплейсе',1.0)],
   shared=[], excluded=[('wildberries uzbekistan 1300, wildberries узбекистан 880, ozon узбекистан 880, yandex market uzbekistan 880, яндекс маркет узбекистан 1600, ozon uzbekistan 480, вайлдберриз узбекистан 480, wildberries ташкент 480',"покупатели (где купить), не продавцы"),
                        ('менеджер маркетплейсов 40 (= менеджер маркетплейса), курсы менеджера маркетплейсов 10, обучение маркетплейсам 10',"вакансия/курсы; услуги ведения магазина на сайте нет")]),
 dict(id='wb-ozon-ym-sotuvchi', rows=[
   ('yandex market seller',0.15),('wildberries seller',0.15),('seller wildberries',0.15),('ozon seller',0.15),('yandex market partner',0.15),
   ('wb partners',0.05),('wildberries partners',0.05),('seller wildberries ru',0.05),
   ('яндекс маркет продавец',1.0),('yandex market sotuvchi',1.0),('wildberries продавец',1.0),('вайлдберриз продавец',1.0),
   ('стать продавцом wildberries',1.0),('как стать продавцом на wildberries',1.0),('как стать продавцом на вайлдберриз',1.0),
   ('продавать на wildberries',1.0),('как продавать на wildberries',1.0),('поставщик wildberries',1.0),('wildberries для продавцов',1.0),
   ('вб продавец',1.0),('ozon продавец',1.0)],
   shared=[('wildberries продавец',['продавец wildberries'])],
   excluded=[('yandex market 40500, яндекс маркет 12100, wildberries uz 12100, yandex market uz 4400',"покупательская навигация")]),
 dict(id='kartochka-ai', rows=[
   ('инфографика для маркетплейсов',1.0),('карточка товара',0.5),('дизайн карточек для маркетплейсов',1.0),('дизайн карточек товаров',1.0),
   ('описание товара',1.0),('seo карточки товара',1.0),('фото для маркетплейсов',1.0),('фото товаров для маркетплейсов',1.0),
   ('предметная съемка',0.5),('infografika',0.05)],
   shared=[], excluded=[('описание товара для маркетплейса 10, генератор описания товара 10',"уже посчитаны линзой prices-tools (ai-reklama-matni)"),
                        ('mahsulot tavsifi, mahsulot rasmi, kartochka dizayn, infografika uzum, карточка товара узум',"0 в Google Ads")]),
 dict(id='telegram-kanal-biznes', rows=[
   ('как создать канал в телеграм',1.0),('как создать телеграм канал',1.0),('создать телеграм канал',1.0),('telegramda kanal yaratish',1.0),
   ('telegram kanal nomlari',1.0),("telegram kanalga odam qo'shish",1.0),('как раскрутить телеграм канал',1.0),('раскрутка телеграм канала',1.0),
   ('продвижение телеграм канала',1.0),('раскрутка телеграм канала ташкент',1.0),('как набрать подписчиков в телеграм канал',1.0),
   ('подписчики телеграм',1.0),('телеграм канал для бизнеса',1.0),('телеграм канал очиш',1.0)],
   shared=[('как создать канал в телеграм',['как создать канал в телеграме'])],
   excluded=[('telegramda kanal ochish 74000',"аномалия Google Ads: в 1000 раз больше «telegram kanal ochish» (70); вероятно склеено с брендовым «telegram»"),
             ("telegram kanal ochish 70, telegram kanalni rivojlantirish 10, telegram obunachi ko'paytirish 40","уже посчитаны линзой prices-tools (obunachi-halol)"),
             ('telegram kanal 5400, telegram kanallar 5400, телеграм канал 1900',"поиск каналов для чтения, не создателей")]),
 dict(id='tg-kanal-statistika', rows=[
   ('tgstat',0.05),('tgstat uz',0.05),('telemetr',0.05),('статистика телеграм канала',1.0),('телеграм каналы узбекистана',0.3),
   ('телеграм каналы ташкент',0.3)],
   shared=[], excluded=[]),
 dict(id='nakrutka-xavfi', rows=[
   ('instagram nakrutka',0.05),('nakrutka',0.05),('telegram nakrutka',0.05),('накрутка подписчиков инстаграм',0.05),
   ('накрутка инстаграм',0.05),('накрутка телеграм',0.05),('накрутка подписчиков телеграм',0.05)],
   shared=[], excluded=[("instagram obunachi ko'paytirish, obunachi ko'paytirish, instagram obunachi …","честный рост — уже кластер obunachi-halol линзы prices-tools")]),
 dict(id='onlayn-dokon-ochish', rows=[
   ('internet magazin',0.3),('onlayn savdo',0.5),("internet do'kon",0.5),("onlayn do'kon",0.5),("internet do'kon ochish",1.0),
   ('internet magazin ochish',1.0),('onlayn biznes',1.0),('onlayn biznes boshlash',1.0),('онлайн бизнес в узбекистане',1.0),
   ('открыть интернет магазин',1.0),('как открыть интернет магазин',1.0),('как открыть интернет магазин в узбекистане',1.0),
   ('создать интернет магазин',1.0),('бизнес в интернете',1.0),('e-commerce uzbekistan',1.0),('shopify uzbekistan',1.0),
   ('конструктор интернет магазина',1.0),('платформа для интернет магазина',1.0),
   ('instagram magazin',1.0),('интернет магазин в инстаграм',1.0),('как открыть магазин в инстаграм',1.0),('магазин в инстаграм',1.0),
   ('как продавать в инстаграм',1.0),('продажи в инстаграм',1.0),('продажи через инстаграм',1.0),('бизнес в инстаграм',1.0),
   ('instagram магазин',1.0),('телеграм магазин',1.0),('магазин в телеграм',1.0),('как создать магазин в телеграм',1.0),
   ('интернет магазин в телеграм',1.0),('telegram shop',1.0),
   ('dropshipping',0.15),('дропшиппинг',0.5),('товарка',0.3),('какой бизнес открыть в узбекистане',0.3),('электронная коммерция',0.05)],
   shared=[('магазин в инстаграм',['инстаграм магазин'])],
   excluded=[('создание интернет магазина, разработка интернет магазина (ташкент), интернет магазин под ключ — по 10',"коммерческий интент сайта: владельцы /ru/razrabotka-saytov-tashkent/ и прайс-спица"),
             ('интернет магазин 590, онлайн магазин 320',"покупательский интент (research seed)")]),
 dict(id='olx-biznes', rows=[
   ("olx e'lon berish",0.5),('как подать объявление на olx',0.5),("olxga e'lon berish",0.5),('разместить объявление на olx',0.5),
   ('подать объявление olx',0.5),('olx объявление',0.5),
   ('olx biznes',1.0),('olx business',1.0),('olx бизнес',1.0),('olx для бизнеса',1.0),('olx reklama',1.0),('реклама на olx',1.0),
   ('olx top',1.0),('olx vip',1.0),('olx магазин',1.0)],
   shared=[("olx e'lon berish",['olx elon berish'])], excluded=[('olx 246000 (= olx uz)',"навигация покупателей")]),
 dict(id='uzum-kalkulyator', rows=[
   ('комиссия узум маркет',1.0),('uzum komissiya',1.0),('uzum market комиссия',1.0),('uzum market fbs',1.0),('uzum fbs',1.0)],
   shared=[], excluded=[('uzum market komissiya, комиссия uzum market, uzum market fbo, uzum market ombor',"0 в Google Ads")]),
]


def look(k):
    if k in M:
        r = M[k]; return r.get('search_volume') or 0, r.get('cpc'), r.get('competition'), 'm'
    if k in EXT:
        r = EXT[k]; return r['search_volume'], r['cpc'], r['competition'], r['src']
    raise KeyError(k)


seen = {}
out = []
for c in CLUSTERS:
    rows = []
    sharedmap = {p: v for p, v in c['shared']}
    for k, share in c['rows']:
        if k in seen:
            raise SystemExit('double count: %s in %s and %s' % (k, seen[k], c['id']))
        seen[k] = c['id']
        vol, cpc, comp, src = look(k)
        rows.append(dict(keyword=k, volume=vol, cpc=cpc, competition=comp, source=src, info_share=share,
                         eff=round(vol * share, 1), shared_bucket=sharedmap.get(k, [])))
    raw_d = sum(r['volume'] for r in rows)
    eff = sum(r['eff'] for r in rows)
    wc = [r for r in rows if r['cpc'] is not None and r['eff'] > 0]
    cpc_w = round(sum(r['eff'] * r['cpc'] for r in wc) / sum(r['eff'] for r in wc), 2) if wc else None
    cpc_rng = [min(r['cpc'] for r in wc), max(r['cpc'] for r in wc)] if wc else None
    v6 = (eff * CTR6[0] / 30 * 1.5 * AIO[0], eff * CTR6[1] / 30 * 1.5 * AIO[1])
    v3 = (eff * CTR3 / 30 * 1.5 * AIO[0], eff * CTR3 / 30 * 1.5 * AIO[1])
    out.append(dict(id=c['id'], demand_raw=raw_d, demand_eff=round(eff), cpc_weighted=cpc_w, cpc_range=cpc_rng,
                    visits_day_pos6=[round(v6[0], 2), round(v6[1], 2)], visits_day_pos3=[round(v3[0], 2), round(v3[1], 2)],
                    rows=rows, excluded=[dict(keyword=k, why=w) for k, w in c['excluded']]))

tot_eff = sum(c['demand_eff'] for c in out)
tot = dict(demand_eff=tot_eff,
           visits_day_pos6=[round(sum(c['visits_day_pos6'][0] for c in out), 2), round(sum(c['visits_day_pos6'][1] for c in out), 2)],
           visits_day_pos3=[round(sum(c['visits_day_pos3'][0] for c in out), 2), round(sum(c['visits_day_pos3'][1] for c in out), 2)])
json.dump(dict(totals=tot, clusters=out), open(os.path.join(HERE, 'computed.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for c in out:
    print('%-28s raw=%6d eff=%5d cpc=%s %s v6=%s v3=%s' % (c['id'], c['demand_raw'], c['demand_eff'], c['cpc_weighted'], c['cpc_range'], c['visits_day_pos6'], c['visits_day_pos3']))
print('TOTAL', tot)
