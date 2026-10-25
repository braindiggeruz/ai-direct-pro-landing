# -*- coding: utf-8 -*-
"""Merge the four 2026-10-25 lens files, score clusters for lead value and
render ranked.json + AD_CLIENT_FUNNEL.md (from AD_CLIENT_FUNNEL.template.md).

Run from anywhere:  py -3 -I build_ranked.py
Reads only the lens JSON files next to this folder; writes ranked.json and
AD_CLIENT_FUNNEL.md one level up. No network, no repo writes.
"""
import json
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
LENS_FILES = {
    'P': 'ad-platform-pains.json',
    'T': 'prices-tools.json',
    'M': 'marketplaces-social-selling.json',
    'N': 'niche-playbooks.json',
}
LENS_NAME = {'P': 'ad-platform-pains', 'T': 'prices-tools', 'M': 'marketplaces-social-selling', 'N': 'niche-playbooks'}

lens = {}
for key, fname in LENS_FILES.items():
    data = json.loads((ROOT / fname).read_text(encoding='utf-8'))
    lens[key] = {c['id']: c for c in data['clusters']}

NUM = r'(\d+(?:[.,]\d+)?)'


def parse_range(text):
    m = re.search(NUM + r'\s*[–-]\s*' + NUM, str(text))
    if not m:
        raise ValueError(f'no range in {text!r}')
    return float(m.group(1).replace(',', '.')), float(m.group(2).replace(',', '.'))


def parse_cpc(c):
    w = c.get('cpc_weighted')
    if isinstance(w, (int, float)):
        return float(w)
    s = str(c.get('cpc_usd', ''))
    m = re.search(r'взвеш[^\d]*' + NUM, s)
    if m:
        return float(m.group(1).replace(',', '.'))
    m = re.match(r'\s*' + NUM, s)
    if m:
        return float(m.group(1).replace(',', '.'))
    return None


PRIOR_CPC = 1.30   # median weighted CPC of the 46 lens clusters
PRIOR_K = 2.0      # strength of the prior, in "queries with CPC"


def count_cpc_queries(lens_key, c):
    """How many distinct Google Ads buckets in the cluster carry a CPC."""
    if lens_key == 'N':
        s = str(c.get('cpc_usd', ''))
        m = re.search(r'\((\d+) з', s)
        if m:
            return int(m.group(1))
        if 'один запрос' in s or '1 запр' in s:
            return 1
        return 0
    rows = c.get('rows') or c.get('keyword_rows') or []
    seen = set()
    for r in rows:
        if r.get('cpc') is None:
            continue
        seen.add(r.get('bucket') or r.get('keyword'))
    return len(seen)


SERP = {'weak': 1.5, 'weak/mixed': 1.25, 'mixed': 1.0, 'mixed/strong': 0.8, 'strong': 0.6}
SERP_RU = {'weak': 'слабая', 'weak/mixed': 'слабая/смеш.', 'mixed': 'смешанная', 'mixed/strong': 'смеш./сильная', 'strong': 'сильная'}
EFFORT = {'S': 1.0, 'S+M': 1.5, 'M': 2.0, 'L': 3.0}
DIRECT_RU = {1.0: 'прямой', 0.6: 'средний', 0.3: 'косвенный', 0.15: 'слабый'}
CONV = {
    'price': (0.02, 0.05, 'цены, найм, ниша: 2–5 %'),
    'problem': (0.005, 0.02, 'проблема/DIY/инструмент: 0,5–2 %'),
    'mixed': (0.002, 0.005, 'смешанная аудитория (студенты, соискатели, частники): 0,2–0,5 %'),
}
CPC_FLOOR = 0.5  # no CPC in Google Ads data for the cluster: assume a low commercial floor
RISK_RU = {'low': 'низкий', 'medium': 'средний', 'high': 'высокий'}

FUNNELS = {
    'F1': '«Сам запущу рекламу» → «сделаем за вас»',
    'F2': 'Бесплатный AI-инструмент / калькулятор → результат → «запустим за вас»',
    'F3': 'Продавец: Uzum, онлайн-магазин, Telegram-канал, старт бизнеса',
    'F4': '«Моя ниша»: нишевые плейбуки → подбор канала',
    'F5': 'GEO: ассистент рекомендует агентство (цены, справочник проблем)',
}

# ---------------------------------------------------------------------------
# Merged and deduplicated cluster list. sources = (lens, cluster id).
# scale/add_demand/cpc override are the only manual changes to lens numbers
# and each one carries its reason in `adjust`.
# ---------------------------------------------------------------------------
SPEC = [
    # ---------------- F1 ----------------
    dict(id='hub-target-uz', funnel='F1', status='build', order=1,
         title='Хаб target-uz: блок «O‘zingiz yoqmoqchimisiz? 7 qadam» + раздел «Targetolog xizmati narxi»',
         sources=[('P', 'target-yoqish-diy-uz'), ('T', 'targetolog-narxi')],
         action='расширение', url='/uz/instagram-target-yoqish/ (+ RU-раздел на /ru/targetirovannaya-reklama-tashkent/)',
         page_type='расширение money-хаба: пошаговый DIY-блок + честное сравнение «фрилансер / сотрудник / агентство»',
         keywords='target yoqish 260 (CPC 1,55), instagramda target yoqish 140 (3,26), instagram target 50, targetolog 170 (2,47), таргетолог 140, targetolog kerak 40, таргетолог ташкент 40 (1,33)',
         directness=1.0, serp='weak/mixed', effort='S', conv='price', honesty='low',
         lead='Таргет: запуск от 1 990 000, ведение от 1 490 000 сум/мес (цены уже на хабе) → #lead-form хаба',
         conflicts='A7: «targetolog» только раздел и secondary, не primary. Сравнение моделей — ссылка на /uz/blog/agentlik-frilanser-yoki-birja-ozbekiston/, не дублировать.',
         geo=False),
    dict(id='tg-ads-howto', funnel='F1', status='build', order=2,
         title='Telegram Ads из Узбекистана: раздел «пошагово» в RU-статье (+ UZ-пара после пересмотра A2)',
         sources=[('P', 'telegram-ads-diy')],
         action='расширение (RU) → новая (UZ, условно)', url='/ru/blog/telegram-ads-stoimost-i-zapusk-uzbekistan/ (+ /uz/blog/telegram-ads-qanday-ishga-tushiriladi/)',
         page_type='how-to раздел в статье, которой Google уже доверяет (поз. 2,4 по «telegram ads стоимость»)',
         keywords='telegram ads 6 600 (инфо-доля ×0,3), ads telegram 1 000 (5,19), телеграм адс 110 (6,03), telegram ads узбекистан 40, telegram ads стоимость / минимальный бюджет 10',
         directness=0.6, serp='mixed', effort='S+M', conv='problem', honesty='medium',
         lead='Telegram Ads и посевы → /ru/telegram-ads-uzbekistan/, /uz/telegram-reklama/ (смета после брифа; агентской цены на сайте нет)',
         conflicts='A2 (seo-uz, 22.08): «telegram ads» отклонён как UZ-голова. UZ-статья — только хвосты «qanday ishga tushiriladi / o‘zbekistonda», после пересмотра решения владельцем (как A7 для таргета). Пополнение — только TON через Fragment.',
         geo=True),
    dict(id='tg-channel-checklist', funnel='F1', status='build', order=3,
         title='Чек-лист «как выбрать Telegram-канал для посева»: метрики TGStat/Telemetr, признаки накрутки, UTM, договор',
         sources=[('P', 'telegram-channel-ads-diy'), ('M', 'tg-kanal-statistika')],
         action='раздел', url='/uz/telegram-reklama/ + /ru/blog/telegram-ads-ili-posevy-v-kanalah/',
         page_type='раздел-чек-лист + шаблон для скачивания (без названий каналов)',
         keywords='telegram reklama 70, реклама в телеграм 70 (4,65), реклама телеграм 10 (6,26), tgstat 2 900 (×0,05), telemetr 590 (9,43, ×0,05), статистика телеграм канала 20',
         directness=0.6, serp='mixed/strong', effort='S', conv='problem', honesty='low',
         lead='Посевы под ключ и Telegram Ads → #lead-form на /uz/telegram-reklama/ и /ru/telegram-ads-uzbekistan/',
         conflicts='Владельцы интента есть (telegram-uz, telegram-ru) — новый URL не нужен.', geo=False),
    dict(id='kontekst-budget-calc', funnel='F1', status='build', order=4,
         title='Калькулятор бюджета контекста «CPC × клики → заявки → CPL» в ценовых статьях',
         sources=[('T', 'kontekst-narxi-kalkulyator')],
         action='расширение', url='/ru/blog/skolko-stoit-kontekstnaya-reklama-tashkent-2026/ + /uz/blog/kontekst-reklama-narxi-toshkent-2026/',
         page_type='встроенный калькулятор (движок growthTool cpl-calculator)',
         keywords='гугл адс 140 (6,87), контекстная реклама 110 (3,41), google adwords 70, яндекс реклама 70 (2,36), контекстная реклама цена 10 (сайт уже поз. 4)',
         directness=1.0, serp='mixed', effort='S', conv='price', honesty='low',
         lead='Контекст: запуск от 1 990 000, ведение от 1 490 000 сум/мес → /ru/kontekstnaya-reklama-tashkent/',
         conflicts='CPC вводит пользователь; «средних по рынку» от себя не давать.', geo=False),
    dict(id='meta-ads-manager-uz', funnel='F1', status='next',
         title='Meta Ads Manager / Business Suite: qo‘llanma на узбекском',
         sources=[('P', 'meta-ads-manager-guide')],
         action='новая', url='/uz/blog/meta-ads-manager-qollanma/',
         page_type='инструкция со скриншотами и датой сверки интерфейса',
         keywords='ads manager 9 900 (×0,15), meta business suite 3 600 (×0,15), facebook ads manager 1 300, meta ads 720, business manager 320',
         directness=0.6, serp='mixed', effort='L', conv='problem', honesty='low',
         lead='Таргет → /uz/instagram-target-yoqish/ (вопрос «kabinet kimga tegishli» — мост к услуге)',
         conflicts='Навигационный спрос: реальная доля кликов может быть ниже 0,15–0,3. Проверить по GSC через 6–8 недель.', geo=False),
    dict(id='ru-instagram-ads-howto', funnel='F1', status='next',
         title='Как запустить рекламу в Instagram из Узбекистана (RU)',
         sources=[('P', 'ru-instagram-ads-howto')],
         action='новая', url='/ru/blog/kak-zapustit-reklamu-v-instagram-iz-uzbekistana/',
         page_type='пошаговая статья: «Продвигать» против Ads Manager, кабинет, оплата, модерация, первые 3 дня',
         keywords='таргетинг в инстаграм 628 (×0,5, вероятно склеенный бакет), настройка таргета в инстаграм 10 (7,79), запуск таргета через фейсбук 10 (12,17)',
         directness=0.6, serp='mixed', effort='M', conv='problem', honesty='low',
         lead='Таргет → /ru/targetirovannaya-reklama-tashkent/', conflicts='Интент «запустить самому» свободен; услуга и диагностика остаются у своих владельцев.', geo=False),
    dict(id='google-ads-uz-ru', funnel='F1', status='next',
         title='Google Ads и YouTube из Узбекистана: аккаунт, оплата, первая кампания (UZ + RU)',
         sources=[('P', 'google-ads-from-uz')],
         action='новая', url='/uz/blog/google-reklama-qanday-beriladi/ + /ru/blog/kak-zapustit-google-ads-iz-uzbekistana/',
         page_type='how-to по справке Google «Payment options»', keywords='google ads 4 400 (×0,15–0,3), гугл реклама 110, google реклама 70 (4,13), google reklama 30 (3,55), youtube ads 40',
         directness=0.6, serp='mixed', effort='M', conv='problem', honesty='medium',
         lead='Контекст → /ru/kontekstnaya-reklama-tashkent/', conflicts='Сравнение Google vs Яндекс не дублировать (есть /ru/blog/google-ads-ili-yandeks-direkt-uzbekistan/).', geo=False),
    dict(id='yandex-direct-uz', funnel='F1', status='later',
         title='Яндекс Директ в Узбекистане: можно ли, оплата, гео (RU)',
         sources=[('P', 'yandex-direct-uz')],
         action='новая', url='/ru/blog/yandeks-direkt-v-uzbekistane/',
         page_type='how-to на хвост «яндекс директ узбекистан», факты только из справки Яндекса',
         keywords='яндекс директ 590, yandex direct 390 (5,26), яндекс директ узбекистан 40, яндекс директ цена 10 (6,65)',
         directness=0.6, serp='strong', effort='M', conv='problem', honesty='medium',
         lead='Контекст → /ru/kontekstnaya-reklama-tashkent/', conflicts='Голову держит Яндекс (4 из 5 мест + AIO); целиться только в хвост.', geo=False),
    dict(id='target-nima-link', funnel='F1', status='next',
         title='«Target nima»: одна ссылка на DIY-блок хаба после CTR-окна',
         sources=[('P', 'target-nima-ctr-uz')],
         action='расширение (1 ссылка)', url='/uz/blog/target-reklama-nima/',
         page_type='правка внутренней ссылки «что это → как включить → закажите»',
         keywords='target nima 320 (2,80), таргет нима 50, targeting nima 50 (сайт уже поз. 7–8, 0 кликов)',
         directness=0.6, serp='mixed', effort='S', conv='problem', honesty='low',
         lead='Таргет → /uz/instagram-target-yoqish/', conflicts='Не трогать до чтения окна R-S1 (~05–07.11).', geo=False),
    # ---------------- F2 ----------------
    dict(id='reklama-matni-ai', funnel='F2', status='build', order=5,
         title='Reklama matni yozish: AI-генератор + 7 правил (перенацелить пустые страницы)',
         sources=[('T', 'ai-reklama-matni')],
         action='перенацеливание', url='/uz/gpt-telegram-instagram-ideya/ + блок на /ru/gpt-v-marketinge-smm/',
         page_type='страница-инструмент: форма «товар, аудитория, выгода, длина» → шаблоны чата smm-telegram-ad / smm-instagram-post',
         keywords='reklama matni yozish 210 (0,77), reklama matni 70, reklama yozish 70, reklama uchun so‘zlar 20, caption generator 20',
         directness=0.6, serp='weak', effort='S', conv='problem', honesty='low',
         lead='Таргет (от 1 990 000) и SMM (от 2 490 000 сум/мес): CTA под результатом «Matn tayyor — reklamani biz yoqamiz» → форма',
         conflicts='Смена H1 = ревизия защищённой главной (она перечисляет H1 всех страниц). Записать нового владельца в intent-manifest.', geo=False),
    dict(id='marketing-calc', funnel='F2', status='next',
         title='Калькулятор маркетолога: ROMI, CPL, CPA, ДРР, бюджет под план заявок, CPM (UZ + RU)',
         sources=[('T', 'marketing-kalkulyator')],
         action='новая', url='/uz/marketing-kalkulyator/ + /ru/kalkulyator-romi-cpl/',
         page_type='страница-инструмент на движке cpl-calculator; тот же движок потом для калькулятора Uzum и CPM-модуля Telegram',
         keywords='romi 320, ltv 210, konversiya nima 140, cpl 110, drr 90, roi formula 90, roi calculator 10 (1,85)',
         directness=0.3, serp='mixed', effort='M', conv='mixed', honesty='low',
         lead='Экран результата → «media-reja tuzib beramiz» → аудит, контекст или таргет',
         conflicts='Не претендовать на «reklama byudjeti hisoblash» (/uz/blog/reklama-byudjeti-qancha-bolishi-kerak/) и «что такое roi/cpa/cpm» (/ru/blog/marketingovye-terminy-slovar/, /ru/blog/cpa-cpm-cpc-cpl-v-reklame/).', geo=False),
    dict(id='kontent-plan', funnel='F2', status='next',
         title='Контент-план: шаблон для скачивания + AI-генератор (RU; UZ — раздел на странице reklama matni)',
         sources=[('T', 'kontent-reja')],
         action='новая', url='/ru/kontent-plan-instagram-shablon/',
         page_type='шаблон (таблица) + запуск шаблона чата smm-plan', keywords='контент план 70, что выложить в инстаграм 40, content plan 20 (5,01), kontent plan 20 (1,46), контент план шаблон 20',
         directness=0.6, serp='mixed', effort='M', conv='problem', honesty='low',
         lead='SMM Start от 2 490 000 сум/мес: «План готов — ведение отдайте нам»', conflicts='У /ru/gpt-v-marketinge-smm/ убрать «AI контент-план» из secondaryKeywords.', geo=False),
    dict(id='biznes-nomi-ai', funnel='F2', status='later',
         title='Название и слоган для бизнеса: AI-генератор + чек-лист «товарный знак и домен .uz»',
         sources=[('T', 'biznes-nomi-shior')], add_demand=305, add_note='+ fast food nomlari 110 и brend nomlari 390 ×0,5 (передано линзой niche-playbooks; brend nomlari двусмысленный)',
         action='новая', url='/uz/biznes-nomi-generator/ + RU-пара',
         page_type='страница-инструмент: новый шаблон бизнес-инструмента чата (название + 5 слоганов)',
         keywords='firma nomlari 90, brend nomlari 390 (×0,5), fast food nomlari 110, kafe nomlari 70, kompaniya nomlari 70, business name generator 50',
         directness=0.3, serp='mixed', effort='S', conv='mixed', honesty='low',
         lead='Старт бизнеса → лендинг от 2 990 000 сум и SMM Start', conflicts='Не утверждать, что название свободно.', geo=False),
    dict(id='mobilograf', funnel='F2', status='later',
         title='Мобилограф и Reels для бизнеса: нанять, фрилансер или пакет агентства (UZ + RU)',
         sources=[('T', 'mobilograf-reels')],
         action='новая', url='/uz/blog/mobilograf-yollash-yoki-smm-agentlik/ + RU-пара',
         page_type='статья-сравнение моделей найма', keywords='мобилограф 880, mobilograf 590, mobilograf kerak 70, мобилограф ташкент 70 (1,01), video reklama 20 (1,47)',
         directness=0.3, serp='weak', effort='M', conv='mixed', honesty='medium',
         lead='SMM «Бизнес» от 4 490 000 (8 Reels), «Про» от 7 900 000 сум/мес (съёмочный день, 12 Reels)',
         conflicts='~87 % спроса — информационный или соискатели; заказной хвост ≈310/мес.', geo=False),
    dict(id='obunachi-halol', funnel='F2', status='later',
         title='Подписчики в Instagram и Telegram без накрутки + раздел «Nakrutka nega zarar»',
         sources=[('T', 'obunachi-halol'), ('M', 'nakrutka-xavfi')],
         action='новая', url='/uz/blog/instagram-obunachi-kopaytirish/',
         page_type='статья: органика, коллаборации, таргет и Telegram Ads как законный рост; накрутка — только как риск',
         keywords='instagram obunachi ko‘paytirish 260, instagramda obunachi ko‘paytirish 170, obunachi ko‘paytirish 90, instagram nakrutka 8 100 (×0,05), накрутка подписчиков инстаграм 720 (×0,05)',
         directness=0.3, serp='mixed/strong', effort='M', conv='mixed', honesty='medium',
         lead='Таргет, Telegram Ads, SMM', conflicts='Никаких ссылок на панели и «безопасной накрутки».', geo=False),
    dict(id='heshteg-bio-ai', funnel='F2', status='deferred',
         title='Хэштеги и bio для Instagram: AI-генератор',
         sources=[('T', 'heshteg-bio')],
         action='новая', url='/uz/instagram-bio-va-heshteg/ + RU', page_type='страница-инструмент (2 шаблона)',
         keywords='hashtag 480, instagram hashtag 320 (2,16), xeshteg 140, instagram bio 140',
         directness=0.15, serp='mixed', effort='S', conv='mixed', honesty='low',
         lead='Слабый: личные профили и подростки; польза — регистрации в чате', conflicts='Делать последним, если вообще.', geo=False),
    # ---------------- F3 ----------------
    dict(id='uzum-external-ads', funnel='F3', status='build', order=6,
         title='Реклама товара на Uzum: внутренняя реклама кабинета против внешнего трафика (Instagram, Telegram)',
         sources=[('M', 'marketplace-tashqi-reklama')], cpc=1.55, n_cpc=1, cpc_note='CPC нет; взят нижний прокси «target yoqish» 1,55 (считается как 1 запрос)',
         action='новая', url='/uz/blog/uzum-mahsulotiga-reklama/ + /ru/blog/reklama-tovara-na-uzum-market/',
         page_type='спица хаба target-uz: каналы, как мерить (промокод/SKU — атрибуция приблизительная), бюджет через ДРР',
         keywords='uzum market reklama 40, uzum reklama 20, реклама на маркетплейсах 10, внешняя реклама для маркетплейсов 10, реклама на wildberries 10',
         directness=1.0, serp='weak', effort='S', conv='price', honesty='low',
         lead='Прямой: таргет на карточку — запуск 1 990 000, ведение 1 490 000 сум/мес, бюджет отдельно → форма хаба',
         conflicts='Внутреннюю рекламу Uzum агентство не ведёт — так и написать.', geo=True),
    dict(id='uzum-seller-guide', funnel='F3', status='build', order=7,
         title='Uzum Market’da sotuvchi bo‘lish: регистрация, FBO/FBS, первые покупатели (UZ + RU)',
         sources=[('M', 'uzum-sotuvchi-start')],
         action='новая', url='/uz/blog/uzum-marketda-sotuvchi-bolish/ + /ru/blog/kak-stat-prodavcom-na-uzum-market/',
         page_type='пошаговый гайд со ссылками на официальный мануал seller.uzum.uz (текст и скриншоты не копировать)',
         keywords='uzumda savdo qilish 260 (1,22), uzum sotuvchi 70, uzum market sotuvchi bo‘lish 50 (1,72), seller uzum uz 12 100 (9,31, ×0,05), uzum seller 74 000 (×0,05), стать продавцом на узум 20 (3,64)',
         directness=0.3, serp='mixed', effort='M', conv='mixed', honesty='low',
         lead='Косвенный: «карточка есть, продаж нет» → спица uzum-external-ads → таргет; дальше SMM Start и бот магазина',
         conflicts='5 185 из 5 900 эффективного спроса — навигационные головы ×0,05; при доле 0,02 кластер ≈2 800. Услуги «ведение магазина на Uzum» на сайте нет.', geo=False),
    dict(id='uzum-calc', funnel='F3', status='next',
         title='Калькулятор продавца Uzum: комиссия (вводит пользователь), логистика, возвраты, ДРР → маржа',
         sources=[('M', 'uzum-kalkulyator')],
         action='новая', url='/uz/uzum-sotuvchi-kalkulyatori/ + /ru/kalkulyator-prodavca-uzum/',
         page_type='страница-инструмент (общий движок с калькулятором маркетолога)', keywords='комиссия узум маркет 70 (2,02), uzum market fbs 40, uzum komissiya 30, uzum fbs 30',
         directness=0.6, serp='weak', effort='M', conv='problem', honesty='medium',
         lead='Строка «реклама (ДРР)» → спица uzum-external-ads → таргет', conflicts='Ставки не хардкодить: ссылка на официальный тариф с датой.', geo=False),
    dict(id='kartochka-ai', funnel='F3', status='next',
         title='Генератор карточки товара (Uzum/WB) + чек-лист инфографики и фото',
         sources=[('M', 'kartochka-ai')], effort_note='M → S: шаблон чата business-uzum уже есть (src/gpt-chat/templates.ts)',
         action='новая', url='/uz/mahsulot-kartochkasi-generatori/ + /ru/generator-kartochki-tovara/',
         page_type='страница-инструмент поверх готового шаблона business-uzum', keywords='карточка товара 90 (×0,5), инфографика для маркетплейсов 70, дизайн карточек для маркетплейсов 20, предметная съемка 20 (0,69)',
         directness=0.6, serp='mixed', effort='S', conv='problem', honesty='medium',
         lead='SMM-контент (Start 2 490 000), таргет на карточку (запуск 1 990 000)', conflicts='Только введённые характеристики; без «№1/лучший».', geo=False),
    dict(id='marketplaces-compare', funnel='F3', status='next',
         title='Маркетплейсы Узбекистана для продавца: Uzum, Market Yandex Go, Wildberries, Ozon (+ якорные разделы)',
         sources=[('M', 'marketpleyslar-taqqoslash'), ('M', 'wb-ozon-ym-sotuvchi')],
         action='новая', url='/ru/blog/marketpleysy-uzbekistana-dlya-prodavca/ + /uz/blog/ozbekiston-marketpleyslari-sotuvchi-uchun/',
         page_type='сравнительная таблица по официальным источникам с датой (тарифы — ссылками)', keywords='marketplace uzbekistan 210 (1,01), маркетплейсы узбекистана 140 (1,23), маркетплейсы в узбекистане 70 (1,60), yandex market seller 1 000 (×0,15), wildberries seller 880 (×0,15)',
         directness=0.6, serp='mixed', effort='M', conv='problem', honesty='medium',
         lead='Таргет на карточки; для уходящих на свой канал — сайт-магазин от 14 900 000 сум', conflicts='Своих таблиц комиссий не делать.', geo=False),
    dict(id='onlayn-dokon-ochish', funnel='F3', status='later',
         title='Onlayn do‘kon ochish: Instagram, Telegram-бот, Uzum или сайт — с чего начать (UZ + RU)',
         sources=[('M', 'onlayn-dokon-ochish')],
         action='новая', url='/uz/blog/onlayn-dokon-ochish/ + /ru/blog/kak-otkryt-internet-magazin-v-uzbekistane/',
         page_type='гайд-развилка «4 пути»; цены — только ссылками на прайс-спицы', keywords='internet magazin 390 (×0,3), onlayn savdo 110 (×0,5), dropshipping 720 (×0,15), онлайн бизнес в узбекистане 10 (3,24)',
         directness=0.6, serp='mixed', effort='M', conv='problem', honesty='low',
         lead='Сайт: магазин от 14 900 000, лендинг от 2 990 000; AI-бот магазина Start 1 990 000 сум', conflicts='Прайс-спицы /uz/blog/internet-dokon-yaratish-narxi-toshkent/ и RU-пара не каннибализировать.', geo=True),
    dict(id='mahsulot-reklama', funnel='F3', status='later',
         title='Mahsulotni qanday reklama qilish / Реклама интернет-магазина: каналы, бюджеты, как мерить',
         sources=[('M', 'mahsulot-reklama-dokon')],
         action='новая', url='/uz/blog/mahsulotni-reklama-qilish/ + /ru/blog/reklama-internet-magazina/',
         page_type='практическая таблица «канал → когда работает → как мерить»', keywords='mahsulotni reklama qilish 170 (×0,5, школьная тема), реклама магазина 30, реклама для магазина 10 (0,64)',
         directness=0.6, serp='weak', effort='S', conv='problem', honesty='low',
         lead='Таргет, SMM Start, Telegram-реклама (смета)', conflicts='Хаб digital-paid-media-ru владеет «интернет реклама Ташкент», не этим интентом.', geo=False),
    dict(id='telegram-kanal-biznes', funnel='F3', status='later',
         title='Telegram-канал для бизнеса: создать и настроить (UZ + RU)',
         sources=[('M', 'telegram-kanal-biznes')],
         action='новая', url='/uz/blog/telegram-kanal-ochish-biznes-uchun/ + /ru/blog/kak-sozdat-telegram-kanal-dlya-biznesa/',
         page_type='пошаговая инструкция; рост — ссылкой на obunachi-halol', keywords='как создать канал в телеграм 480 (1,65), как создать телеграм канал 30, telegram kanal nomlari 30',
         directness=0.3, serp='strong', effort='S', conv='mixed', honesty='low',
         lead='Telegram Ads и посевы (смета), SMM-пакеты, бот для заявок', conflicts='Голова — общероссийский контент; UZ-варианты не сняты.', geo=False),
    dict(id='yatt-first-clients', funnel='F3', status='later',
         title='YaTT/ИП: открыть (только по soliq.uz, my.gov.uz, lex.uz) и найти первых клиентов',
         sources=[('N', 'yatt-ochish')],
         action='новая', url='/uz/blog/yatt-ochish-va-birinchi-mijozlar/ + /ru/blog/kak-otkryt-ip-v-uzbekistane-i-nayti-klientov/',
         page_type='статья: регистрация коротко и по источникам + первые 30 дней маркетинга', keywords='yatt ochish 1 600 (1,15), yakka tartibdagi tadbirkor 390, как открыть ип в узбекистане 210 (1,36), открыть ип в узбекистане 140 (1,71)',
         directness=0.3, serp='mixed', effort='L', conv='mixed', honesty='medium',
         lead='Стартовый пакет: сайт от 2 990 000, SMM Start, первый таргет', conflicts='E-E-A-T: агентство пишет о регистрации; без налоговых советов.', geo=False),
    dict(id='biznes-goyalar', funnel='F3', status='deferred',
         title='Biznes g‘oyalar / бизнес-идеи в Узбекистане с планом первых клиентов',
         sources=[('N', 'biznes-goyalar')],
         action='новая', url='/uz/blog/biznes-goyalar-ozbekiston/ + /ru/blog/biznes-idei-v-uzbekistane/',
         page_type='15–20 идей, у каждой — где первые клиенты; без цифр доходности', keywords='бизнес идеи 390 (0,80), biznes g‘oyalar 170 (0,86), kichik biznes g‘oyalar 90',
         directness=0.3, serp='mixed', effort='M', conv='mixed', honesty='medium',
         lead='Через нишевые плейбуки → стартовый пакет', conflicts='«biznes reja» не перетягивать (/uz/blog/biznes-reja-tuzish/).', geo=False),
    dict(id='olx-biznes', funnel='F3', status='deferred',
         title='OLX как бизнес-канал: объявления, TOP/VIP и когда нужен таргет',
         sources=[('M', 'olx-biznes')],
         action='новая', url='/uz/blog/olx-da-biznes-sifatida-sotish/', page_type='короткая инструкция',
         keywords='olx e’lon berish 170 (×0,5), как подать объявление на olx 140 (×0,5)',
         directness=0.15, serp='strong', effort='S', conv='mixed', honesty='low',
         lead='Слабый: таргет и сайт для переросших объявления', conflicts='Большинство ищущих — частные лица.', geo=False),
    # ---------------- F4 ----------------
    dict(id='stomatologiya-klinika', funnel='F4', status='build', order=8,
         title='Реклама стоматологии и клиники в Ташкенте (RU + UZ)',
         sources=[('N', 'stomatologiya-klinika-reklama')],
         action='новая', url='/ru/blog/reklama-stomatologii-i-kliniki-tashkent/ + /uz/blog/stomatologiya-va-klinika-reklamasi/',
         page_type='нишевой плейбук: поиск по услуге и району, карты, посадочная на услугу, запись, стоимость первичного пациента; нейтральный блок о законе (lex.uz)',
         keywords='стоматология реклама 40, реклама стоматологии 10 (6,68), маркетинг для клиники 10 (3,56), продвижение стоматологии 10 и ещё ~27 хвостов по 10',
         directness=1.0, serp='mixed', effort='M', conv='price', honesty='medium',
         lead='Контекст (/ru/kontekstnaya-reklama-tashkent/), таргет, локальное SEO; входящие ссылки с /ru/ai-bot-dlya-kliniki/ (73 показа)',
         conflicts='Медицинская реклама регулируется: без обещаний результата лечения и без юр. советов. Плейбук не класть в страницы AI-бота (кластер bot-services заморожен).', geo=True),
    dict(id='oquv-markazi', funnel='F4', status='build', order=9,
         title='O‘quv markazi reklamasi: как набрать учеников (UZ, RU-пара)',
         sources=[('N', 'oquv-markazi-reklama')],
         action='новая', url='/uz/blog/oquv-markazi-reklamasi/ + /ru/blog/reklama-uchebnogo-tsentra-tashkent/',
         page_type='нишевой плейбук: сезонность набора, таргет на родителей, районные Telegram-каналы, пробный урок, что считать',
         keywords='o‘quv markazi reklama 170 (= o‘quv markazlari reklama), реклама учебного центра 10, продвижение учебного центра 10, открыть учебный центр в ташкенте 10 (0,46)',
         directness=1.0, serp='weak', effort='M', conv='price', honesty='low',
         lead='Таргет и Telegram-реклама, затем AI-бот для ответов родителям; входящие с /uz/oquv-markazi-uchun-ai-bot/ (2 клика)',
         conflicts='CPC есть только у одного хвоста; голова 170 — реальный узбекский бакет со слабой выдачей.', geo=True),
    dict(id='salon', funnel='F4', status='build', order=10,
         title='Go‘zallik saloni va barbershop reklamasi (UZ + RU)',
         sources=[('N', 'salon-reklama')],
         action='новая', url='/uz/blog/gozallik-saloni-reklamasi/ + /ru/blog/reklama-salona-krasoty-tashkent/',
         page_type='нишевой плейбук: рилс «до/после», таргет 3–5 км, онлайн-запись, карточки на картах, акции без демпинга',
         keywords='go‘zallik saloni reklama 70, salon reklama 50, barbershop reklama 20, реклама салона красоты 10, таргет для салона красоты 10',
         directness=1.0, serp='weak', effort='M', conv='price', honesty='low',
         lead='Таргет + SMM, локальное SEO; входящие с /ru/ai-bot-dlya-salona-krasoty/ (155 показов — самая видимая нишевая страница)',
         conflicts='CPC нет ни у одного запроса — взята медиана 1,30.', geo=True),
    dict(id='restoran-kafe', funnel='F4', status='next',
         title='Реклама кафе, ресторана и fast food (RU + UZ)',
         sources=[('N', 'restoran-kafe-reklama')],
         action='новая', url='/ru/blog/reklama-kafe-i-restorana-tashkent/ + /uz/blog/restoran-va-kafe-reklamasi/',
         page_type='нишевой плейбук: рилс с едой, таргет по радиусу и времени, посевы, агрегаторы против своего канала',
         keywords='реклама кафе в инстаграм 40, fast food reklama 30, burger reklama 20, реклама ресторана 10 (2,90)',
         directness=1.0, serp='mixed', effort='M', conv='price', honesty='low',
         lead='Таргет и SMM, Telegram Ads, локальное SEO; входящие с /ru/ai-bot-dlya-horeca/ (60 показов)', conflicts='', geo=True),
    dict(id='nishalar-hub', funnel='F4', status='next',
         title='Хаб «Реклама по нишам»: таблица «ниша → канал → что считать» + фитнес, авто, юристы',
         sources=[('N', 'nishalar-hub')],
         action='новая', url='/ru/reklama-dlya-biznesa-po-nisham/ + /uz/biznes-uchun-reklama-nishalar-boyicha/',
         page_type='блог-хаб (не money) + форма «расскажите нишу — предложим канал»', keywords='как сделать рекламу 10 (1,28), бесплатная реклама 10 (1,41), продвижение бизнеса 10 (0,58), реклама фитнес клуба 10, реклама автосервиса 10, реклама юридических услуг 10',
         directness=1.0, serp='mixed', effort='M', conv='price', honesty='medium',
         lead='Все каналы через подбор канала под нишу', conflicts='Юристы/адвокаты — нейтральная оговорка о проф. ограничениях со ссылкой.', geo=True),
    dict(id='kiyim-mebel', funnel='F4', status='later',
         title='Реклама магазина одежды и мебели (2 RU + 1 UZ)',
         sources=[('N', 'kiyim-mebel-dokon-reklama')],
         action='новая', url='/ru/blog/reklama-magazina-odezhdy-tashkent/, /ru/blog/reklama-mebeli-tashkent/, /uz/blog/kiyim-va-mebel-dokoni-reklamasi/',
         page_type='нишевой плейбук (один шаблон)', keywords='реклама магазина одежды 10, как продвигать магазин одежды 10, реклама мебели 10, как продавать мебель 10 (0,41)',
         directness=1.0, serp='mixed', effort='M', conv='price', honesty='low',
         lead='Таргет по каталогу, SMM, сайт-каталог', conflicts='', geo=True),
    dict(id='kochmas-mulk', funnel='F4', status='later',
         title='Реклама недвижимости, ЖК и застройщика (RU)',
         sources=[('N', 'kochmas-mulk-reklama')],
         action='новая', url='/ru/blog/reklama-nedvizhimosti-i-zhk-tashkent/', page_type='нишевой плейбук: лид-формы, квиз, квалификация лида',
         keywords='реклама недвижимости 10, реклама жк 10, реклама застройщика 10, маркетинг недвижимости 10',
         directness=1.0, serp='mixed', effort='M', conv='price', honesty='low',
         lead='Таргет с лид-формами, лендинг ЖК; входящие с /ru/ai-bot-dlya-agentstva-nedvizhimosti/', conflicts='CPC нет — взята медиана 1,30.', geo=True),
    dict(id='turizm', funnel='F4', status='deferred',
         title='Реклама турагентства (RU + раздел в UZ-хабе)',
         sources=[('N', 'turizm-reklama')],
         action='новая', url='/ru/blog/reklama-turagentstva-tashkent/', page_type='нишевой плейбук', keywords='turizm marketing 20, реклама турагентства 10, маркетинг в туризме 10',
         directness=1.0, serp='mixed', effort='M', conv='price', honesty='low',
         lead='Таргет с лид-формами, Telegram, SMM', conflicts='Нет нишевой страницы AI-бота для внутренних ссылок.', geo=True),
    dict(id='marketing-plan-ru', funnel='F4', status='later',
         title='Пример маркетингового плана: расширение RU-статьи о digital-стратегии',
         sources=[('N', 'marketing-strategiya')], scale=200 / 460,
         adjust='UZ-часть (marketing strategiyasi 110, raqamli marketing 110, marketing strategiyasi nima/rejasi/reja 30, кир. маркетинг стратегияси 10) снята по A2 DO_NOT_BUILD; осталось RU 190 + «маркетинг стратегия» 10 = 200',
         action='расширение', url='/ru/blog/digital-strategiya-dlya-biznesa-v-uzbekistane/',
         page_type='блок «пример маркетингового плана на 1 страницу» (вымышленный пример помечен как вымышленный)',
         keywords='маркетинговая стратегия 30, маркетинговый план 20, стратегии маркетинга 10 (1,58), маркетинговый план пример 10',
         directness=0.6, serp='mixed', effort='S', conv='problem', honesty='low',
         lead='Маркетинговый аудит → /ru/marketingovyi-audit-tashkent/', conflicts='A2: ни одна страница не может претендовать на «marketing strategiyasi» — UZ-страница линзы niche-playbooks не делается.', geo=False),
    dict(id='sotuv-voronkasi', funnel='F4', status='later',
         title='Воронка продаж для малого бизнеса: от рекламы до оплаты (RU + UZ «sotuv voronkasi»)',
         sources=[('N', 'sotuv-voronkasi')], scale=590 / 710, cpc=0.57, n_cpc=3,
         adjust='Сняты biznesni rivojlantirish 70, biznes rivojlantirish 20, бизнесни ривожлантириш 30 (A2: выдачу держит Biznesni Rivojlantirish Banki); CPC пересчитан по оставшимся 3 запросам',
         action='новая', url='/ru/blog/voronka-prodazh-dlya-malogo-biznesa/ + /uz/blog/sotuv-voronkasi/',
         page_type='статья: этапы, где теряются заявки, скрипт первого ответа, что мерить', keywords='воронка продаж 210 (0,51), отдел продаж 70, sotuv bo‘limi 40, sotuv texnikasi 40, sotuv voronkasi 20, база клиентов 10 (1,74)',
         directness=0.6, serp='mixed/strong', effort='M', conv='problem', honesty='low',
         lead='Аудит, затем таргет/контекст; автоматизация заявок', conflicts='A2: «biznesni rivojlantirish» не использовать. Приор выдачи «воронка продаж» — блоги CRM.', geo=False),
    # ---------------- F5 ----------------
    dict(id='agency-prices-table', funnel='F5', status='build', order=0,
         title='Одна таблица всех опубликованных цен агентства (источник для ChatGPT/Perplexity)',
         sources=[('T', 'agency-narxlar')],
         action='новая', url='/uz/narxlar/ + /ru/ceny/',
         page_type='справочная страница цен со ссылками на каждую услугу и форму; Organization/Offer-разметка только по видимым ценам',
         keywords='smm цена / стоимость сайта (1,41) / реклама у блогера цена — по 10; influencer marketing 40; все UZ «… narxi» < 10',
         directness=1.0, serp='mixed', effort='S', conv='price', honesty='medium',
         lead='Все услуги; главный канал — переходы из ChatGPT (первый SMM-лид 07.10)',
         conflicts='Гейт: на /uz/sayt-yaratish/ таблица «Landing 3 500 000 – 7 000 000 … Internet do‘kon 15 000 000 – 35 000 000» противоречит title «2 990 000 so‘mdan» — исправить до публикации; спор 290 000 / 490 000 за поддержку — решение владельца.', geo=True),
    dict(id='ads-problems-reference', funnel='F5', status='next',
         title='Справочник «Проблемы с рекламой»: оплата, блокировки, модерация, пиксель (RU + UZ, FAQPage)',
         sources=[('P', 'meta-troubleshooting'), ('P', 'ad-payment-uz')],
         action='новая', url='/ru/blog/problemy-s-reklamoy-meta-oplata-blokirovka/ + /uz/blog/reklama-muammolari-tolov-bloklash/',
         page_type='12–20 вопросов с короткими ответами и ссылками на официальные справки (Account Quality, повторная проверка, Payment options, Fragment)',
         keywords='инстаграм отклоняет рекламу 10, рекламный аккаунт отключен 10, реклама на рассмотрении инстаграм 10, meta pixel 20 (0,99), как оплатить рекламу в инстаграм 10, visa karta ochish 880 (×0,05)',
         directness=0.6, serp='weak/mixed', effort='M', conv='problem', honesty='high',
         lead='Аудит кабинета → /ru/marketingovyi-audit-tashkent/; таргет, контекст, Telegram Ads «под ключ, бюджет отдельно»',
         conflicts='Только официальные пути. Запрещено: «разблокировка за деньги», аренда кабинетов, чужие карты, обменники, обещание вернуть кабинет. «Медиабюджет через агентство» — только после подтверждения владельцем.', geo=True),
    dict(id='advertising-law', funnel='F5', status='deferred',
         title='Закон «О рекламе» для онлайн-рекламы бизнеса: нейтральный пересказ с lex.uz',
         sources=[('P', 'advertising-law-uz')], cpc=0.3, n_cpc=2, cpc_note='CPC нет; пол 0,3 (ищут текст закона), вес как у 2 запросов',
         action='новая', url='/uz/blog/reklama-togrisidagi-qonun-onlayn/ + RU', page_type='нейтральный пересказ норм со ссылками на статьи и дату редакции',
         keywords='reklama to‘g‘risidagi qonun 530 (×0,3), закон о рекламе узбекистан 50',
         directness=0.15, serp='strong', effort='M', conv='mixed', honesty='medium',
         lead='Слабый: доверие и AI-цитирование', conflicts='Без правовых советов и «как обойти».', geo=True),
]

DROPPED = [
    ('Накрутка и SMM-панели как цель', 'nakrutka 8 100, top smm 1 300, накрутка 880, накрутка подписчиков 720, smm panel 260', 'Нарушает правила площадок. Только как раздел-антитезис на странице obunachi-halol.'),
    ('«Разблокировка кабинета», аренда/фермы аккаунтов, чужие карты, обменники', 'спрос 0–10', 'Серые схемы. Только официальные пути: Account Quality, повторная проверка, справки платформ.'),
    ('Logo yasash / создать логотип', '7 430 после дедупа, CPC $0,07–0,49', 'Логотипы агентство не продаёт; генерации изображений в чате нет (инструмент пишет только промпт) — страница обещала бы то, чего нет.'),
    ('Marketing strategiyasi / raqamli marketing (UZ-страница)', '110 + 110', 'A2 DO_NOT_BUILD (22.08): академическая выдача; «ни одна страница не может претендовать на marketing strategiyasi». Остаётся только RU-расширение.'),
    ('Biznesni rivojlantirish', '70 + 20 + 30', 'A2: выдачу держит Biznesni Rivojlantirish Banki.'),
    ('Reklama agentligi / рекламное и маркетинговое агентство (Ташкент)', '260 / 260 / 90 ($3,38) / 90 ($3,11) / 70 ($3,14)', 'Локальный блок; без Google Business Profile недостижимо (A1). Это решение владельца про GBP, не про контент.'),
    ('Targetolog как primary-ключ отдельной страницы', '170', 'A7: выдача — вакансии и курсы. Только раздел и secondary на хабе target-uz.'),
    ('Курсы и «научиться самому» (smm kurslari, smm o‘rganish, курсы таргетолога)', '260 эфф., CPC до $12,03', 'Ученики, а не клиенты; дорогой CPC — это реклама курсов. Отложено без срока.'),
    ('Ведение магазина на маркетплейсе как услуга', 'спрос виден (olx, sellerlab.uz)', 'Услуги нет на сайте — не обещать и цену не придумывать. Решение владельца.'),
    ('TON, toncoin, fragment telegram, ton narxi', '1 600 + 480 + 260 + 210', 'Крипто-интент, не реклама.'),
    ('TikTok Ads', '~180', 'Агентство площадку не продаёт; доступ в Узбекистане неясен.'),
    ('Dorixona reklama', '70', 'Реклама лекарств ограничена законом, интент неясен.'),
    ('Блогеры как люди (bloger, блогеры узбекистана)', '5 400 + 2 400 + …', 'Фанатский интент; «bloger reklama narxi» < 10.'),
    ('Наружная реклама, баннеры', '480 + 480 + 390', 'Агентство не продаёт.'),
    ('Покупательская навигация маркетплейсов (wildberries uz, yandex market uz, uzum business)', '~7 000 + 18 100', 'Покупатели и банк, не продавцы.'),
    ('«telegramda kanal ochish» 74 000', '74 000', 'Аномалия Google Ads (в 1 000 раз больше «telegram kanal ochish» 70) — исключена.'),
]

OWNER_DECISIONS = [
    'Исправить противоречие цен на /uz/sayt-yaratish/ (title «2 990 000 so‘mdan» против таблицы «3 500 000 – 35 000 000») и решить спор 290 000 / 490 000 за поддержку — до публикации таблицы цен: её будут цитировать ассистенты.',
    'Назвать рабочий Telegram студии: studioTelegram в content/global/site.json пуст, поэтому Telegram-CTA сейчас нет нигде (только форма, телефон +998 50 587 07 20 и e-mail). Одна настройка включает его на всех поверхностях.',
    'Пометить как key events в GA4: отправку #lead-form, клик по tel:, клик по строке студии в AI-чате (AiBusinessLine) и скачивание шаблонов. Сейчас key event только generate_lead (2 за 28 дней) — без этого воронку нельзя измерить.',
    'Пересмотреть A2 для «telegram ads» (как A7 для таргета) — только тогда делать UZ-пару статьи про Telegram Ads.',
    'Подтвердить или запретить формулировку «оплатим медиабюджет через агентство» — от неё зависит справочник оплаты.',
    'Решить, появится ли услуга «ведение магазина на маркетплейсе» (тогда F3 получает прямую продажу; сейчас — только таргет на карточку).',
    'Разрешить показ строки студии в чате после шаблонов smm-plan / smm-telegram-ad на страницах-инструментах: сейчас детектор намеренно считает «reklama matnini yoz» задачей, а не заказом (src/gpt-chat/business-intent.ts).',
    'Платный замер AI-видимости (OpenSEO AI visibility) по 10–15 промптам вроде «SMM agentlik Toshkent», «Toshkentda target qilib beradigan agentlik», «как рекламировать стоматологию в Ташкенте» — до и через 6 недель после релиза.',
]


def fmt(x, nd=2):
    s = f'{x:.{nd}f}'.replace('.', ',')
    return s


def fmt_int(x):
    return f'{int(round(x)):,}'.replace(',', ' ')


def fmt_range(lo, hi, nd=2):
    return f'{fmt(lo, nd)}–{fmt(hi, nd)}'


items = []
for spec in SPEC:
    srcs = [lens[l][cid] for l, cid in spec['sources']]
    demand = sum(float(c['demand_month']) for c in srcs)
    v6 = [0.0, 0.0]
    v3 = [0.0, 0.0]
    cpc_num = 0.0
    cpc_den = 0.0
    n_cpc = 0
    for (lk, _cid), c in zip(spec['sources'], srcs):
        n_cpc += count_cpc_queries(lk, c)
    for c in srcs:
        a, b = parse_range(c['visits_day_pos6'])
        v6[0] += a; v6[1] += b
        a, b = parse_range(c['visits_day_pos3'])
        v3[0] += a; v3[1] += b
        cp = parse_cpc(c)
        if cp is not None:
            cpc_num += cp * float(c['demand_month'])
            cpc_den += float(c['demand_month'])
    scale = spec.get('scale', 1.0)
    if 'add_demand' in spec:
        scale = (demand + spec['add_demand']) / demand
    demand *= scale
    v6 = [x * scale for x in v6]
    v3 = [x * scale for x in v3]
    if 'cpc' in spec:
        cpc = spec['cpc']; cpc_src = spec.get('cpc_note', 'пересчитан вручную')
        n_cpc = spec.get('n_cpc', n_cpc)
    elif cpc_den:
        cpc = cpc_num / cpc_den; cpc_src = 'взвешенный по спросу (линзы)'
    else:
        cpc = PRIOR_CPC; cpc_src = 'CPC нет — взята медиана 1,30'
    cpc_eff = (cpc * n_cpc + PRIOR_CPC * PRIOR_K) / (n_cpc + PRIOR_K) if n_cpc else PRIOR_CPC
    v3_mid = (v3[0] + v3[1]) / 2
    serp_f = SERP[spec['serp']]
    eff = EFFORT[spec['effort']]
    raw = v3_mid * cpc_eff * spec['directness'] * serp_f / eff
    clo, chi, clabel = CONV[spec['conv']]
    leads6 = (v6[0] * 30 * clo, v6[1] * 30 * chi)
    leads3 = (v3[0] * 30 * clo, v3[1] * 30 * chi)
    items.append(dict(
        id=spec['id'], title=spec['title'], funnel=spec['funnel'], funnel_name=FUNNELS[spec['funnel']],
        status=spec['status'], build_order=spec.get('order'),
        action=spec['action'], url=spec['url'], page_type=spec['page_type'],
        sources=[f'{LENS_NAME[l]}:{cid}' for l, cid in spec['sources']],
        keywords_primary=spec['keywords'],
        keywords_full={f'{LENS_NAME[l]}:{cid}': lens[l][cid]['keywords'] for l, cid in spec['sources']},
        demand_month=round(demand), cpc_usd=round(cpc, 2), cpc_source=cpc_src, cpc_queries=n_cpc, cpc_effective=round(cpc_eff, 2),
        directness=spec['directness'], directness_label=DIRECT_RU[spec['directness']],
        serp_weakness=spec['serp'], serp_factor=serp_f, effort=spec['effort'], effort_divisor=eff,
        honesty_risk=spec['honesty'],
        visits_day_pos6=[round(v6[0], 2), round(v6[1], 2)], visits_day_pos3=[round(v3[0], 2), round(v3[1], 2)],
        conversion_assumption=clabel, conversion_range=[clo, chi],
        leads_month_pos6=[round(leads6[0], 2), round(leads6[1], 2)],
        leads_month_pos3=[round(leads3[0], 2), round(leads3[1], 2)],
        score_raw=raw, lead_path=spec['lead'], conflicts=spec.get('conflicts', ''),
        adjustments='; '.join(x for x in [spec.get('adjust', ''), spec.get('add_note', ''), spec.get('effort_note', '')] if x),
        geo_role=spec['geo'],
    ))

mx = max(i['score_raw'] for i in items)
for i in items:
    i['score'] = round(100 * i['score_raw'] / mx, 1)
items.sort(key=lambda i: -i['score_raw'])
for n, i in enumerate(items, 1):
    i['rank'] = n
    del i['score_raw']


def totals(sel):
    t = dict(n=len(sel), demand=sum(i['demand_month'] for i in sel))
    for k in ('visits_day_pos6', 'visits_day_pos3', 'leads_month_pos6', 'leads_month_pos3'):
        t[k] = [round(sum(i[k][0] for i in sel), 2), round(sum(i[k][1] for i in sel), 2)]
    return t


build = sorted([i for i in items if i['status'] == 'build'], key=lambda i: i['build_order'])
active = [i for i in items if i['status'] in ('build', 'next', 'later')]
tot_build = totals(build)
tot_active = totals(active)
tot_all = totals(items)

# ---------------------------------------------------------------------------
# Markdown tables
# ---------------------------------------------------------------------------
STATUS_RU = {'build': 'первые 10', 'next': 'следом', 'later': 'позже', 'deferred': 'отложено'}


def rank_table():
    rows = ['| # | Кластер | Воронка | Статус | Спрос/мес | CPC $ (линзы → эфф.) | Лид | SERP | Усилие | Риск | Визиты/день поз.6 | поз.3 | Лиды/мес поз.6 | поз.3 | Балл |',
            '|---:|---|:-:|---|---:|---:|---|---|:-:|---|---|---|---|---|---:|']
    for i in items:
        rows.append('| {rank} | {title} | {f} | {st} | {d} | {cpc} | {dl} | {serp} | {e} | {r} | {v6} | {v3} | {l6} | {l3} | {s} |'.format(
            rank=i['rank'], title=i['title'], f=i['funnel'], st=STATUS_RU[i['status']], d=fmt_int(i['demand_month']),
            cpc=fmt(i['cpc_usd']) + ' → ' + fmt(i['cpc_effective']), dl=i['directness_label'], serp=SERP_RU[i['serp_weakness']], e=i['effort'], r=RISK_RU[i['honesty_risk']],
            v6=fmt_range(*i['visits_day_pos6']), v3=fmt_range(*i['visits_day_pos3']),
            l6=fmt_range(*i['leads_month_pos6']), l3=fmt_range(*i['leads_month_pos3']), s=fmt(i['score'], 1)))
    return '\n'.join(rows)


def build_table():
    rows = ['| № | Неделя | Что | URL | Тип | Главные ключи (объём, CPC $) | Продаёт | Усилие | Визиты/день поз.6 / поз.3 | Лиды/мес поз.6 / поз.3 |',
            '|---:|---|---|---|---|---|---|:-:|---|---|']
    week = {1: 'нед. 1 (26.10–01.11)', 2: 'нед. 1', 3: 'нед. 1', 4: 'нед. 1', 5: 'релиз 2 (≈08–12.11)', 6: 'релиз 2', 7: 'релиз 2', 8: 'релиз 2', 9: 'релиз 3 (≈12–15.11)', 10: 'релиз 3'}
    for n, i in enumerate(build_display, 1):
        rows.append('| {n} | {w} | {t} | `{u}` | {p} | {k} | {l} | {e} | {v6} / {v3} | {l6} / {l3} |'.format(
            n=n, w=week[n], t=i['title'], u=i['url'], p=i['page_type'], k=i['keywords_primary'], l=i['lead_path'], e=i['effort'],
            v6=fmt_range(*i['visits_day_pos6']), v3=fmt_range(*i['visits_day_pos3']),
            l6=fmt_range(*i['leads_month_pos6']), l3=fmt_range(*i['leads_month_pos3'])))
    return '\n'.join(rows)


def funnel_table():
    rows = ['| Воронка | Кластеров | Спрос/мес | Визиты/день поз.6 | поз.3 | Лиды/мес поз.6 | поз.3 |', '|---|---:|---:|---|---|---|---|']
    for code, name in FUNNELS.items():
        sel = [i for i in active if i['funnel'] == code]
        t = totals(sel)
        rows.append(f"| {code} {name} | {t['n']} | {fmt_int(t['demand'])} | {fmt_range(*t['visits_day_pos6'])} | {fmt_range(*t['visits_day_pos3'])} | {fmt_range(*t['leads_month_pos6'])} | {fmt_range(*t['leads_month_pos3'])} |")
    t = tot_active
    rows.append(f"| **Итого (без отложенных)** | **{t['n']}** | **{fmt_int(t['demand'])}** | **{fmt_range(*t['visits_day_pos6'])}** | **{fmt_range(*t['visits_day_pos3'])}** | **{fmt_range(*t['leads_month_pos6'])}** | **{fmt_range(*t['leads_month_pos3'])}** |")
    return '\n'.join(rows)


def drop_table():
    rows = ['| Тема | Спрос | Почему нет |', '|---|---|---|']
    for a, b, c in DROPPED:
        rows.append(f'| {a} | {b} | {c} |')
    return '\n'.join(rows)


def next_list():
    out = []
    sel = sorted([i for i in items if i['status'] == 'next'], key=lambda i: -i['score'])
    for n, i in enumerate(sel, 11):
        out.append(f"{n}. **{i['title']}** — `{i['url']}`; {i['action']}, усилие {i['effort']}; балл {fmt(i['score'], 1)}; визиты/день поз.3 {fmt_range(*i['visits_day_pos3'])}; продаёт: {i['lead_path']}.")
    return '\n'.join(out)


def later_list():
    sel = sorted([i for i in items if i['status'] == 'later'], key=lambda i: -i['score'])
    return '; '.join(f"{i['title']} (балл {fmt(i['score'], 1)})" for i in sel) + '.'


def deferred_list():
    sel = sorted([i for i in items if i['status'] == 'deferred'], key=lambda i: -i['score'])
    return '\n'.join(f"- **{i['title']}** (балл {fmt(i['score'], 1)}) — {i['conflicts'] or i['lead_path']}" for i in sel)


def conflicts_list():
    out = []
    for i in items:
        if i['conflicts'] and i['status'] in ('build', 'next'):
            out.append(f"- **{i['title']}** — {i['conflicts']}")
    return '\n'.join(out)


# build order: price table first in the list? It is gated on owner fixes, so it sits at 6.
order_map = {s['id']: s.get('order') for s in SPEC}
build_ids = ['hub-target-uz', 'tg-ads-howto', 'kontekst-budget-calc', 'tg-channel-checklist',
             'reklama-matni-ai', 'agency-prices-table', 'uzum-seller-guide', 'uzum-external-ads',
             'stomatologiya-klinika', 'oquv-markazi']
by_id = {i['id']: i for i in items}
build_display = [by_id[x] for x in build_ids]
for n, i in enumerate(build_display, 1):
    i['build_order'] = n
    i['status'] = 'build'
for i in items:
    if i['id'] not in build_ids and i['status'] == 'build':
        i['status'] = 'next'
        i['build_order'] = None
build = build_display
active = [i for i in items if i['status'] in ('build', 'next', 'later')]
tot_build = totals(build)
tot_active = totals(active)

subs = {
    '{{RANK_TABLE}}': rank_table(),
    '{{BUILD_TABLE}}': build_table(),
    '{{FUNNEL_TABLE}}': funnel_table(),
    '{{DROP_TABLE}}': drop_table(),
    '{{CONFLICTS}}': conflicts_list(),
    '{{NEXT_LIST}}': next_list(),
    '{{LATER_LIST}}': later_list(),
    '{{DEFERRED_LIST}}': deferred_list(),
    '{{B_N}}': str(tot_build['n']),
    '{{B_DEMAND}}': fmt_int(tot_build['demand']),
    '{{B_V6}}': fmt_range(*tot_build['visits_day_pos6'], nd=1),
    '{{B_V3}}': fmt_range(*tot_build['visits_day_pos3'], nd=1),
    '{{B_L6}}': fmt_range(*tot_build['leads_month_pos6'], nd=1),
    '{{B_L3}}': fmt_range(*tot_build['leads_month_pos3'], nd=1),
    '{{A_N}}': str(tot_active['n']),
    '{{A_DEMAND}}': fmt_int(tot_active['demand']),
    '{{A_V6}}': fmt_range(*tot_active['visits_day_pos6'], nd=1),
    '{{A_V3}}': fmt_range(*tot_active['visits_day_pos3'], nd=1),
    '{{A_L6}}': fmt_range(*tot_active['leads_month_pos6'], nd=1),
    '{{A_L3}}': fmt_range(*tot_active['leads_month_pos3'], nd=1),
    '{{ALL_N}}': str(len(items)),
    '{{OWNER}}': '\n'.join(f'{n}. {t}' for n, t in enumerate(OWNER_DECISIONS, 1)),
}

tpl = (HERE / 'AD_CLIENT_FUNNEL.template.md').read_text(encoding='utf-8')
for k, v in subs.items():
    tpl = tpl.replace(k, v)
left = re.findall(r'\{\{[A-Z0-9_]+\}\}', tpl)
if left:
    raise SystemExit(f'unfilled placeholders: {left}')
with open(ROOT / 'AD_CLIENT_FUNNEL.md', 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(tpl)

ranked = dict(
    date='2026-10-25', location=2860, inputs=[LENS_FILES[k] for k in 'PTMN'],
    method=dict(
        score='visits/day at pos ~3 (midpoint, from lens; already demand × CTR / 30 × 1.5 × AIO) × effective CPC USD × lead directness (1.0 / 0.6 / 0.3 / 0.15) × SERP weakness (weak 1.5, weak/mixed 1.25, mixed 1.0, mixed/strong 0.8, strong 0.6) / effort (S 1, S+M 1.5, M 2, L 3); normalised to 100',
        cpc='effective CPC = (lens demand-weighted CPC × n + 1.30 × 2) / (n + 2), n = number of Google Ads buckets in the cluster that carry a CPC; 1.30 = median of the lens clusters; no CPC at all = 1.30; stated proxies/floors are counted as the n given in the item',
        leads='visits/day × 30 × conversion assumption; pos6 range = low visits × low conv … high visits × high conv; same for pos3',
        conversion_assumptions={k: dict(low=v[0], high=v[1], label=v[2]) for k, v in CONV.items()},
        calibration='site now: generate_lead 2 per 28 days (entries / and /uz/smm-xizmatlari), agency pages 29 clicks / 3 136 impressions per 28 days (baseline.md §2, §7.3); AI Assistant channel 32 sessions / 1 key event, Organic Search 1 863 sessions / 1 key event (§7.1)',
        caveats=['Most counted phrases sit in the 10/mo Google Ads bucket (real 0-19); sums are upper bounds of a long tail',
                 'AI Overview discount applied to every cluster by the lenses',
                 'SERP measured for 18 queries across the four lenses; the rest is prior',
                 'New pages typically need 6-12 weeks to reach a stable position (roadmap-1000: best page plateaued at week 6-7)',
                 'AI-assistant referrals (the channel of the first SMM lead) are not modelled in visits or leads'],
    ),
    totals=dict(build_first10=tot_build, active_build_next_later=tot_active, all_including_deferred=totals(items)),
    funnels=FUNNELS,
    build_order=[dict(n=i['build_order'], id=i['id'], url=i['url'], effort=i['effort']) for i in build],
    clusters=items,
    dropped=[dict(topic=a, demand=b, reason=c) for a, b, c in DROPPED],
    owner_decisions=OWNER_DECISIONS,
)
with open(ROOT / 'ranked.json', 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(json.dumps(ranked, ensure_ascii=False, indent=2))

print('items', len(items))
for i in items:
    print(f"{i['rank']:>2} {i['score']:>6} {i['status']:<8} {i['id']:<24} D={i['demand_month']:>5} cpc={i['cpc_usd']:<5} v3={i['visits_day_pos3']} L3={i['leads_month_pos3']}")
print('BUILD', tot_build)
print('ACTIVE', tot_active)
