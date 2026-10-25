# Calculators & utilities lens - demand and visits model (2026-10-25).
# Sources: cu_kw1_metrics.json, cu_kw2_metrics.json (this lens) + already-measured files (reused, not re-bought).
# visits/day = demand x CTR x discount / 30 x 1.5 ; CTR pos6 0.613-1.105 %, pos3 3.593 %.
# discount: 0.533 where an AI Overview at r1 or a Google answer box (currency box, timer, calculator) answers the query,
# 0.655 where AIO sits lower or SERP not taken. Applied to pos3 AND (unlike text-tools) to pos6 for answer-box SERPs,
# because the currency box / timer widget answers the query itself (zero-click).
# Ramp: share of pos6 forecast in month n = min(1, K1 * n^1.6) (same as education-practice / text-tools lenses).
import json, os, glob, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = r"F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research"

rows = {}
files = [os.path.join(HERE, 'cu_kw1_metrics.json'), os.path.join(HERE, 'cu_kw2_metrics.json')] + \
    glob.glob(BASE + r"\2026-10-24-growth-audit\l3-data\kw*_metrics.json") + \
    glob.glob(BASE + r"\2026-10-25-roadmap-1000\data\kw*_metrics.json") + \
    [f for f in glob.glob(BASE + r"\2026-10-25-clusters-to-add\*-data\*metrics*.json") if 'calculators-utility-data' not in f] + \
    glob.glob(BASE + r"\2026-10-25-ad-client-funnel\*-data\*metrics*.json")
for f in files:
    try:
        d = json.load(open(f, encoding='utf-8'))
    except Exception:
        continue
    for r in (d.get('keywords') if isinstance(d, dict) else d) or []:
        if isinstance(r, dict) and 'keyword' in r:
            rows.setdefault(r['keyword'].lower(), dict(r, src=os.path.basename(f)))

MONTHS = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
def series(k):
    r = rows.get(k)
    if not r or not r.get('monthly_searches'):
        return None
    m = {f"{x['year']}-{x['month']:02d}": x['search_volume'] for x in r['monthly_searches']}
    return [m.get(x, 0) or 0 for x in MONTHS]
def vol(k):
    r = rows.get(k)
    return (r or {}).get('search_volume') or 0
def floor_val(k):
    # jump-shaped (Jul-Sep 2026 >= 5x Oct-Nov 2025, vol >= 500) -> Oct-Nov 2025 floor; year-labelled phrases exempt
    s = series(k); v = vol(k)
    if not s or v < 500 or '2026' in k or '2027' in k:
        return v, False
    a = (s[0] + s[1]) / 2; b = (s[9] + s[10] + s[11]) / 3
    if a and b / a >= 5:
        return round(a), True
    return v, False
def sig(k):
    s = series(k)
    return (vol(k), tuple(s)) if s and vol(k) >= 100 else ('kw', k)

C = []
def cl(**kw):
    kw.setdefault('high_only', []); kw.setdefault('excluded', []); kw.setdefault('prior_counted', [])
    kw.setdefault('p6_disc', 1.0)
    C.append(kw)

# ---------------------------------------------------------------- currency (CBU official JSON)
cl(id='valyuta_kursi_kun', name='Valyuta kursi bugun (MB rasmiy kursi): dollar, rubl, yevro, tenge, yuan — kunlik sahifa',
   aio=0.533, p6_disc=0.533, k1=0.04, serp_weak='mixed',
   serp_src='снято 25.10 «dollar kursi»: currency_box r1; o1 ipotekabank, o2 kapitalbank, o3 depozit.uz, o4 investing USD/TRY (не та пара), o5 xb.uz, o6 anhor.uz (новость), o7 Play-приложение, o8 sravni.ru (курс ЦБ РФ), o9 YouTube, o10 bankxizmatlari.uz; o11 wise USD/TRY, o12 Instagram reel, o15 dollarkurs.uz (ровно наш тип: «CBU rasmiy»)',
   low=['dollar kursi', 'курс доллара', 'kurs dollar', 'dollar kurs', 'dollar kurslari', 'доллар курс', 'dollar kursi bugun', 'доллар курси бугун',
        'курс доллара к суму', 'курс доллара в узбекистане', 'курс доллара узбекистан', 'курс доллара ташкент', 'курс доллара на сегодня',
        'valyuta kursi', 'курс валют', 'kurs valyut', 'rubl kurs', 'курс рубля', 'rubl kursi', 'курс рубля к суму', 'kurs rubl', 'курс евро',
        'доллар курси', 'долар курси', 'bugungi dollar kursi', 'yevro kursi', 'evro kursi', 'курс евро к суму', 'курс юаня к суму', 'rubl kursi bugun',
        'валюта курси', 'markaziy bank dollar kursi', 'dollar kursi markaziy bank', 'курс цб руз', 'valyuta kurslari', 'markaziy bank kursi',
        'курс валют на сегодня', 'курс валют узбекистан', 'курс цб узбекистан', 'курс доллара сегодня узбекистан', 'cbu kurs', 'курс рубля к суму сегодня',
        'evro kurs', 'dollar kursi toshkent', 'valyuta kursi bugun', 'курс рубля в узбекистане', 'курс доллара сегодня', 'курс тенге',
        'долар курс', 'курс валют ташкент', 'tenge kursi', 'dollar narxi', 'бугунги доллар курси', 'курс доллара цб', 'курс юаня', 'yuan kursi',
        'курс доллара цб узбекистан', 'dollar kursi qancha', 'валюта курси бугун', 'valyuta kursi markaziy bank', 'курс рубля в ташкенте',
        'markaziy bank valyuta kursi', 'lira kursi', 'dollar qancha', 'курс сума', 'dollar kursi 2026', 'курс валют в узбекистане на сегодня',
        'bugungi valyuta kursi', 'курс воны к суму', 'курс тенге к суму'],
   high_only=['dollar', 'valyuta', 'валюта', 'доллар', 'kurs', 'курс', 'rubl'],
   excluded=['курс доллара на черном рынке (не измерялся, не строим)', 'прогноз курса (финансовый совет)', 'valyuta ayirboshlash (где обменять — банки)'])

cl(id='valyuta_konvertor', name='Valyuta konvertori: juftliklar USD/RUB/EUR/KZT/CNY ↔ UZS («100 usd to uzs», «тенге сум»)',
   aio=0.533, p6_disc=0.533, k1=0.04, serp_weak='mixed',
   serp_src='не снято отдельно; та же выдача, что «dollar kursi» (currency_box r1) + конвертеры xe.com, wise.com, vbr.uz, sravni.ru на o8–o18',
   low=['usd uzs', 'usd to uzs', 'доллар сум', '100 долларов в сумах', 'рубль сум', 'dollar to sum', 'тенге сум', '100 usd to uzs', 'rub to uzs',
        'uzs to usd', 'uzs usd', 'dollar sum', 'rub uzs', 'юань сум', 'конвертер валют', 'сум доллар', '1 usd to uzs', 'доллар к суму', 'евро сум',
        'сум к доллару', 'рубль к суму', 'сум рубль', 'kzt uzs', 'eur uzs', '1 рубль сколько сум', 'valyuta kalkulyator', 'валютный калькулятор',
        'cny uzs', 'dollar som', '1 доллар сколько сум', 'конвертер валют онлайн', 'курс сум доллар', '100 dollar necha som', '1 dollar necha som',
        'valyuta konvertor'])

# ---------------------------------------------------------------- PDF / photo tools (client-side)
cl(id='pdf_vositalar', name='PDF va rasm vositalari brauzerda: JPG→PDF, PDF birlashtirish, siqish, PDF→JPG, 3×4 rasm',
   aio=0.655, k1=0.04, serp_weak='strong',
   serp_src='не снято (лимит 4 SERP). Приор: глобальные бренды iLovePDF, Smallpdf, Adobe, PDF24, pdf2go держат топ по EN/RU; узбекские формулировки («rasmni pdf qilish», «pdf birlashtirish», «pdf siqish») не проверены',
   low=['jpg to pdf', 'pdf to jpg', 'объединить pdf', 'сжать pdf', 'pdf siqish', 'pdf birlashtirish', 'rasmni pdf qilish', 'png to pdf', 'pdf qilish',
        'фото в пдф', 'pdf merge', 'pdf converter', ('wordni pdf qilish', 0.5), 'сжать фото', '3x4 rasm', 'фото 3 на 4', 'сжать изображение',
        'фото в pdf', 'jpg в pdf', 'конвертер jpg в pdf', '3x4 фото', 'rasmni pdf ga aylantirish', 'rasm kesish'],
   high_only=['pdf to word', 'word to pdf', 'pdf', 'пдф'],
   excluded=['pdf to word 110 000 и word to pdf 49 500 — только в верхней оценке: в браузере без сервера макет не сохраняется, честно можно обещать лишь извлечение текста'])

# ---------------------------------------------------------------- calendar 2027
cl(id='kalendar_2027', name='Kalendar 2027 (O‘zbekiston): bayram va dam olish kunlari, ishlab chiqarish kalendari, «Yangi yilgacha necha kun»',
   aio=0.655, k1=0.06, serp_weak='weak',
   serp_src='снято 25.10 «kalendar 2026»: images r1; o1 kalender-365.de (хорватская страница), AIO r3; o2,o3,o6,o8–o16 одно и то же Play-приложение на разных hl (9 мест!), o4 Pinterest, o5 timeanddate (Uzbekistan), o7 calendar-365.com; ни одной узбекской веб-страницы с праздниками',
   low=['kalendar 2026', 'календарь 2026', 'производственный календарь 2026 узбекистан', 'календарь 2026 узбекистан', 'производственный календарь 2026',
        'выходные дни в узбекистане 2026', 'dam olish kunlari 2026', 'календарь 2026 год', 'праздничные дни в узбекистане 2026', 'kalendar 2026 yil',
        'праздники в узбекистане 2026', 'bayram kunlari 2026', '2026 yil kalendari', 'bayram kunlari', '2026 kalendari', '2026 kalendar',
        'календарь 2026 распечатать', 'производственный календарь', 'bayramlar', 'календарь на 2026 год', 'календарь 2026 скачать', 'milliy bayramlar',
        'праздники узбекистана', 'ish kunlari 2026', 'qurbon hayiti dam olish kunlari', 'выходные в узбекистане', 'норма рабочего времени 2026 узбекистан',
        '8 mart dam olish kunlari', 'выходные дни в узбекистане', 'производственный календарь узбекистан',
        ('kalendar', 0.5), ('календарь', 0.5), ('dam olish kunlari', 0.3),
        'сколько дней до нового года', 'сколько дней осталось до нового года', 'сколько осталось до нового года', 'до нового года осталось',
        'сколько до нового года'],
   high_only=['yangi yilga'],
   excluded=['taqvim 2026 (27 100) и 2026 yil taqvimi — пик в феврале-марте = Ramazon taqvimi (namoz/saharlik vaqtlari), религиозный график — не строим',
             'hijriy taqvim (1 000) — религиозный календарь', 'фразы «2027» сейчас малы (календарь 2027 — 170) и не суммируются с «2026»: 2026-фразы — прогноз цикла 2027'],
   note='Спрос по фразам «2026» = прогноз для страниц «2027» в цикле дек-2026…дек-2027; «2026»+«2027» не складываются.')

# ---------------------------------------------------------------- generic calculator
cl(id='kalkulyator', name='Onlayn kalkulyator (oddiy + ilmiy, tarix, klaviatura) — UZ/RU',
   aio=0.655, k1=0.04, serp_weak='mixed',
   serp_src='снято 25.10 «калькулятор»: o1 x-calculator.ru, o2 Play (Google Calculator), o3 calculator888.ru, o4 ipipip.ru, o5 desmos, o6 Play, o7 calcus.ru, o8 calc.ru, o9 calculator.apps.chrome, o10 Play; o12 Яндекс.Диск-файл. AIO нет, виджета калькулятора в разборе нет. Ни одной узбекской страницы',
   low=['калькулятор', 'kalkulyator', ('kalkulator', 0.5), ('kalkulyatr', 0.5), 'calculator', 'калькулятор онлайн', 'online calculator',
        'kalkulyator online', 'онлайн калькулятор', 'onlayn kalkulyator', 'scientific calculator', 'инженерный калькулятор', 'научный калькулятор',
        'ilmiy kalkulyator', 'калькулятор с дробями'],
   excluded=['калькулятор скачать 1 300, kalkulyator yuklab olish — намерение «скачать приложение»', 'калькулятор дробей — уже в кластере education-practice'],
   prior_counted=['калькулятор дробей'])

# ---------------------------------------------------------------- QR
cl(id='qr_kod', name='QR-kod generator (havola, Wi-Fi, telefon, vizitka; PNG/SVG) + skaner',
   aio=0.533, k1=0.06, serp_weak='mixed',
   serp_src='снято 25.10 «qr kod generator»: o1 stqr.ru, AIO r2, o2 orcascan, o3 websiteplanet, o4 qrcode-tiger (RU), o5 jotform, o6 Play, o7 barcodesinc, o8 generator-qr.com, o9 calcus.ru; o11 webiston.uz (EN). Ни одной страницы на узбекском',
   low=['qr code generator', 'qr код', ('qr code', 0.5), ('qr kod', 0.5), 'qr kod yaratish', 'qr code generator free', 'создать qr код', 'генератор qr кода',
        'qr код генератор', 'qr kod wifi', 'сгенерировать qr код', 'qr code create', 'qr code maker', 'создать qr код бесплатно', 'qr код онлайн',
        'qr kod yasash', 'qr kod yaratish online', 'qr code yaratish', 'qr kod olish', 'qr code generator online', 'сделать qr код', 'qr kod qilish',
        'qr kod tayyorlash', ('qr code scanner', 0.5), ('qr kod skaner', 0.5), ('сканер qr кода', 0.5)])

# ---------------------------------------------------------------- timer
cl(id='taymer', name='Taymer, sekundomer va Pomodoro (o‘qish/imtihon taymeri)',
   aio=0.533, p6_disc=0.533, k1=0.06, serp_weak='mixed',
   serp_src='не снято. Приор: Google показывает собственный виджет таймера/секундомера по «timer», «таймер», «секундомер» (zero-click) — поэтому ×0,533 и на поз. 6',
   low=[('timer', 0.5), 'sekundomer', 'таймер', 'секундомер', 'online timer', 'taymer', ('stopwatch', 0.5), ('pomodoro', 0.5), 'pomodoro timer',
        'секундомер онлайн', 'sekundomer online', 'таймер онлайн', 'taymer online', 'таймер 1 минута', 'будильник онлайн', 'онлайн таймер',
        'таймер на 1 минуту', 'таймер 10 минут', 'таймер 5 минут', 'таймер на 5 минут', 'таймер 30 минут', 'помодоро таймер', 'таймер обратного отсчета'],
   high_only=['budilnik'])

# ---------------------------------------------------------------- typing + Uzbek keyboard
cl(id='tez_yozish', name='Tez yozish trenajyori va tezlik testi (o‘zbek lotin matnlari, oʻ/gʻ) + o‘zbek klaviaturasi',
   aio=0.655, k1=0.06, serp_weak='mixed',
   serp_src='не снято. Приор: monkeytype, 10fastfingers, typing.com, ratatype (EN), klava.org/«Соло» (RU); узбекская «tez yozish» не проверена',
   low=['typing test', 'tez yozish', 'typing speed test', 'klaviaturada tez yozish', 'клавиатурный тренажер', ('typing master', 0.5), 'typing speed',
        'тест скорости печати', 'typing test online', 'печать вслепую', 'тренажер печати', 'скорость печати тест',
        'узбекская клавиатура', ("g' harfi", 0.5), 'uzbek klaviatura', 'uzbek keyboard'],
   high_only=['typing', 'tutuq belgisi'],
   excluded=['klaviatura 8 100 (HIGH competition — покупка клавиатуры)', 'tutuq belgisi 2 400 — грамматика, только верхняя оценка'])

# ---------------------------------------------------------------- summa propisyu
cl(id='summa_propisyu', name='Summa so‘z bilan / «Сумма прописью» в сумах (RU + o‘zbek lotin + kirill) для счетов, актов, заявлений',
   aio=0.655, k1=0.06, serp_weak='mixed',
   serp_src='не снято. Приор (education-practice): сильные русские инструменты (summa-propisyu.ru, calc.ru), но без узбекского текста и без «so‘m/tiyin»',
   low=['сумма прописью', 'число прописью', 'сумма прописью онлайн', 'прописью', 'сумма прописью на узбекском', 'number to words',
        'сумма прописью на узбекском языке', 'сумма прописью в сумах', 'сумма прописью узбекский'],
   note='education-practice оставил «сумма прописью» только в верхней оценке («вне школьной линзы») — здесь считается впервые.')

# ---------------------------------------------------------------- BHM / MROT
cl(id='bhm_mrot', name='BHM va eng kam ish haqi 2027 + kalkulyator «N × BHM» (jarima, yig‘im, boj)',
   aio=0.655, k1=0.06, serp_weak='mixed',
   serp_src='не снято. Приор: lex.uz, norma.uz, buxgalter.uz, kun.uz/gazeta.uz (новости) — сильные источники, но ответ-страниц с калькулятором нет (не проверено)',
   low=['eng kam ish haqi 2026', 'eng kam ish haqi', 'bazaviy hisoblash miqdori', 'минимальная зарплата в узбекистане', 'bazaviy hisoblash miqdori 2026',
        'bhm 2026', 'бхм 2026', 'бхм', 'мрот узбекистан', 'bhm qancha', 'bhm nima', 'bazaviy hisoblash miqdori qancha', 'мрот в узбекистане 2026',
        'базовая расчетная величина узбекистан', 'бҳм', 'минимальная зарплата узбекистан'],
   note='Фразы «2026» — прогноз для «2027» (новые значения BHM/МРОТ обычно вводятся указом); цифры обязаны ссылаться на lex.uz.', cut=True)

# ---------------------------------------------------------------- BMI
cl(id='imt_bmi', name='IMT / BMI kalkulyatori (faqat formula + JSST toifalari, tibbiy maslahatsiz)',
   aio=0.533, k1=0.06, serp_weak='mixed',
   serp_src='не снято. Приор: медицинские и калькуляторные сайты (RU), AIO на health-запросах вероятен → ×0,533',
   low=['bmi calculator', 'имт калькулятор', 'индекс массы тела', 'bmi', 'tana vazni indeksi', 'imt', 'калькулятор имт', ('kaloriya hisoblash', 0.5),
        ('калькулятор калорий', 0.5), 'рассчитать индекс массы тела', 'индекс массы тела норма', ('kaloriya kalkulyator', 0.5), 'норма веса',
        'соотношение роста и веса', 'tana massasi indeksi', 'рост и вес', 'bmi hisoblash', 'imt hisoblash'],
   excluded=['homiladorlik kalkulyatori 3 600, калькулятор беременности 1 000, ovulyatsiya kalkulyator 720, пдр калькулятор — медицинский YMYL, не строим',
             'vazn 170 — неоднозначно'])

# ---------------------------------------------------------------- loans
cl(id='kredit', name='Kredit, ipoteka, avtokredit va omonat kalkulyatori (annuitet / differensial jadval, neytral matematika)',
   aio=0.655, k1=0.04, serp_weak='strong',
   serp_src='не снято. Приор: калькуляторы самих банков, bank.uz, depozit.uz, vbr.uz (по «dollar kursi» depozit.uz уже o3) — сильная выдача',
   low=['kredit kalkulyator', 'кредитный калькулятор', 'кредит калькулятор', 'omonat kalkulyator', 'калькулятор кредита', 'ипотечный калькулятор',
        'кредитный калькулятор онлайн', 'avtokredit kalkulyator', 'калькулятор вкладов', 'ipoteka kalkulyatori', 'калькулятор ипотеки',
        'avto kredit kalkulyator', 'kredit kalkulyatori', 'kredit hisoblash', 'автокредит калькулятор', 'депозитный калькулятор',
        'kredit hisoblash kalkulyatori', 'ипотечный калькулятор узбекистан', 'loan calculator', 'ipoteka kalkulyator', 'mikroqarz kalkulyator',
        'кредитный калькулятор узбекистан', 'kredit foizini hisoblash', 'калькулятор депозита', 'mortgage calculator', 'калькулятор кредита узбекистан',
        'depozit kalkulyator', 'депозит калькулятор', 'avtokredit hisoblash', 'annuitet formulasi'],
   high_only=['kredit', 'кредит', 'ipoteka', 'ипотека', 'omonat foizlari', 'kredit foizlari'],
   excluded=['omonat foizlari / kredit foizlari — сравнение ставок банков (нужны данные банков), только верхняя оценка'])

# ---------------------------------------------------------------- percent / VAT
cl(id='foiz_qqs', name='Foiz va QQS (12 %) kalkulyatori + «foiz chiqarish formulasi»',
   aio=0.655, k1=0.06, serp_weak='mixed',
   serp_src='не снято. Приор: RU-калькуляторы (calc.ru, calcus.ru) сильны по-русски; узбекские «foiz chiqarish», «qqs hisoblash» — вероятно YouTube/блоги',
   low=['ндс калькулятор', 'foiz chiqarish', 'калькулятор процентов', 'калькулятор ндс', ('foiz', 0.5), 'foiz chiqarish formulasi', 'foiz hisoblash',
        'процент от числа', ('процент', 0.5), 'percentage calculator', 'процент калькулятор', 'foiz kalkulyator', 'как посчитать процент',
        'процентный калькулятор', ('проценты', 0.5), 'процент от суммы', 'как найти процент от числа', ('foizlar', 0.5), 'qqs hisoblash',
        ('ндс в узбекистане', 0.5), ('qqs', 0.5), 'foiz hisoblash formulasi', 'выделить ндс', 'ндс узбекистан', 'nds hisoblash', 'foizni hisoblash',
        'foiz topish', 'foiz formulasi', 'вычислить процент', 'qqs hisoblash formulasi', 'калькулятор скидок', 'калькулятор процентов онлайн', 'qqs kalkulyator'],
   high_only=['ндс'],
   note='education-practice держал «калькулятор процентов» и «процент от числа» только в верхней оценке — здесь считаются в нижней.')

# ---------------------------------------------------------------- below the cut
cl(id='pochta_indeksi', name='Pochta indekslari (Toshkent va viloyatlar) + «Tashkent zip code»', aio=0.655, k1=0.06, serp_weak='mixed',
   serp_src='не снято', low=['pochta indeksi', 'tashkent zip code', 'почтовый индекс ташкент', 'индекс ташкент', 'toshkent pochta indeksi',
   'zip code uzbekistan', 'индекс ташкента', 'почтовый индекс узбекистан', 'pochta indeksi samarqand'], cut=True)
cl(id='muchal', name='Muchal kalkulyatori (12 yillik hayvon sikli) — jadval, prognozsiz', aio=0.655, k1=0.06, serp_weak='mixed', serp_src='не снято',
   low=['muchal yillari', 'muchallar', 'muchal', '2027 год какого животного', 'год лошади', 'muchal yili', '2026 qaysi muchal', 'восточный календарь',
        'год козы', 'muchal jadvali', '12 muchal'], high_only=['burjlar'], cut=True)
cl(id='sana_yosh', name='Sana va yosh kalkulyatori (kunlar orasida, yosh, hafta raqami, kabisa yili)', aio=0.655, k1=0.06, serp_weak='mixed', serp_src='не снято',
   low=['калькулятор дней', 'age calculator', 'сколько дней в году', 'days calculator', 'date calculator', 'kabisa yili', 'високосный год',
        'калькулятор времени', 'калькулятор дат', 'какая сейчас неделя', 'калькулятор возраста', 'сколько дней', 'калькулятор часов',
        'сколько дней прошло с даты', 'yoshni hisoblash', 'счетчик дней', 'yosh hisoblash', 'kun hisoblash', 'сколько дней между датами'], cut=True)
cl(id='birliklar', name='Birlik konvertori: sotix/gektar/ar, dyuym, funt, fut, Farengeyt', aio=0.533, p6_disc=0.533, k1=0.06, serp_weak='mixed',
   serp_src='не снято; Google-виджет конвертера по стандартным единицам (сотка/sotix он не знает)',
   low=['1 gektar necha metr', 'metr', 'дюймы в сантиметры', 'фут', 'фунты в кг', '1 gektar necha sotix', 'santimetr', 'funt kg', 'гектар', 'dyuym',
        '1 sotix necha metr', 'gektar', 'дюйм в см', 'фаренгейт в цельсий', 'фунт', '1 миля в км', 'olchov birliklari', '1 сотка сколько квадратных метров',
        '1 гектар сколько метров', '1 фунт в кг', 'унция', '1 фут в см', 'футы в метры', 'мили в км', 'kilometr', '1 дюйм в см', 'унция в граммах',
        'галлон', '55 дюймов в см', 'sotix hisoblash', 'kvadrat metr hisoblash', 'фаренгейт', '43 дюйма в см', 'sotix', 'сотка', 'миля'], cut=True)
cl(id='parol', name='Parol generatori', aio=0.655, k1=0.06, serp_weak='mixed', serp_src='не снято',
   low=['password generator', 'генератор паролей', 'генератор пароля', 'parol yaratish', 'parol generator'], high_only=['parol'], cut=True)
cl(id='vaqt', name='Toshkent vaqti / vaqt farqi (Moskva, Seul)', aio=0.533, p6_disc=0.533, k1=0.06, serp_weak='strong',
   serp_src='не снято; Google отвечает виджетом времени (zero-click)',
   low=['время в москве', 'время в ташкенте', 'точное время ташкент', 'toshkent vaqti', 'ташкент время', 'время в корее', 'точное время',
        'moskva vaqti', 'время в ташкенте сейчас', 'время в сеуле', 'часовой пояс узбекистан', 'hozirgi vaqt'], high_only=['soat', 'время', 'vaqt'], cut=True)
cl(id='oylik_soliq', name='Oylik / NDFL / pensiya kalkulyatori (формула, YMYL)', aio=0.655, k1=0.04, serp_weak='mixed', serp_src='не снято',
   low=['pensiya hisoblash', 'oylik hisoblash', 'ish haqi hisoblash formulasi', 'ндфл узбекистан', 'калькулятор ндфл', 'стаж калькулятор', 'калькулятор стажа',
        'staj kalkulyator', 'ish haqi hisoblash', 'калькулятор зарплаты', 'daromad solig\'i hisoblash', 'soliq kalkulyatori', 'soliq hisoblash',
        'rastamojka'], cut=True)


def weeks_to(target, full, k1):
    if full <= 0:
        return None
    for w in range(1, 157):
        n = w / 4.345
        if full * min(1, k1 * n ** 1.6) >= target:
            return w
    return None

global_seen = {}
out = []
for c in C:
    kws, season, missing = [], [0.0] * 12, []
    local_seen = {}
    for item in c['low']:
        k, w = (item if isinstance(item, tuple) else (item, 1.0))
        k = k.lower()
        if k not in rows or not vol(k):
            missing.append(k); continue
        s = sig(k)
        if s in local_seen:
            local_seen[s]['same_bucket_as'].append(k); continue
        if s in global_seen:
            missing.append(f"{k} (bucket already in {global_seen[s]})"); continue
        v_low, jumped = floor_val(k)
        v_high = vol(k)
        e = {'keyword': k, 'volume': v_high, 'weight': w, 'low_value': round(v_low * w), 'jump_floor': jumped, 'same_bucket_as': [],
             'src': rows[k]['src']}
        local_seen[s] = e; global_seen[s] = c['id']; kws.append(e)
        ser = series(k)
        if ser and v_high:
            scale = (v_low * w) / v_high
            for i in range(12):
                season[i] += ser[i] * scale
    hi_extra = []
    for k in c['high_only']:
        if k in rows and vol(k):
            s = sig(k)
            if s in local_seen or s in global_seen:
                continue
            hi_extra.append({'keyword': k, 'volume': vol(k)})
            local_seen[s] = {'same_bucket_as': []}
    d_low = sum(e['low_value'] for e in kws)
    d_high = sum(e['volume'] for e in kws) + sum(e['volume'] for e in hi_extra)
    avg = sum(season) / 12 if sum(season) else 0
    sidx = {MONTHS[i]: round(season[i] / avg, 2) for i in range(12)} if avg else {}
    peaks = sorted(sidx.items(), key=lambda x: -x[1])[:3]
    troughs = sorted(sidx.items(), key=lambda x: x[1])[:2]
    pd = c['p6_disc']
    p6 = [round(d_low * 0.00613 * pd / 30 * 1.5), round(d_low * 0.01105 * pd / 30 * 1.5)]
    p6_hi = [round(d_high * 0.00613 * pd / 30 * 1.5), round(d_high * 0.01105 * pd / 30 * 1.5)]
    p3 = round(d_low * 0.03593 * c['aio'] / 30 * 1.5)
    p3_hi = round(d_high * 0.03593 * c['aio'] / 30 * 1.5)
    mid = sum(p6) / 2
    r = {'id': c['id'], 'name': c['name'], 'cut': c.get('cut', False), 'demand_month_low': d_low, 'demand_month_high': d_high,
         'keywords': sorted(kws, key=lambda e: -e['low_value']), 'high_only': hi_extra, 'excluded': c['excluded'],
         'prior_counted_excluded': c['prior_counted'], 'missing_or_shared': missing, 'seasonality_index': sidx,
         'seasonality': ('пики: ' + ', '.join(f"{m} ×{v}" for m, v in peaks) + '; провалы: ' + ', '.join(f"{m} ×{v}" for m, v in troughs)) if sidx else 'нет ряда',
         'serp_source': c['serp_src'], 'serp_weakness': c['serp_weak'], 'aio_discount_top3': c['aio'], 'answer_box_discount_pos6': pd,
         'note': c.get('note', ''),
         'visits_day_pos6': p6, 'visits_day_pos6_high_demand': p6_hi, 'visits_day_pos3': p3, 'visits_day_pos3_high_demand': p3_hi,
         'visits_day_pos3_no_aio': round(d_low * 0.03593 / 30 * 1.5),
         'ramp': {'k1': c['k1'], 'months_to_full_pos6': round((1 / c['k1']) ** (1 / 1.6), 1), 'm1_visits_mid': round(mid * c['k1'], 1),
                  'weeks_to_5': weeks_to(5, mid, c['k1']), 'weeks_to_10': weeks_to(10, mid, c['k1']), 'weeks_to_50': weeks_to(50, mid, c['k1'])}}
    out.append(r)
    print(f"{c['id']:<18} low {d_low:>8} high {d_high:>8} pos6 {p6} pos3 {p3} (hi {p3_hi}) r5 {r['ramp']['weeks_to_5']}w r10 {r['ramp']['weeks_to_10']}w r50 {r['ramp']['weeks_to_50']}w")
    print('    ', r['seasonality'], '| missing/shared:', missing)
top = [r for r in out if not r['cut']]
tot = {'demand_month_low': sum(r['demand_month_low'] for r in top), 'demand_month_high': sum(r['demand_month_high'] for r in top),
       'visits_day_pos6': [sum(r['visits_day_pos6'][0] for r in top), sum(r['visits_day_pos6'][1] for r in top)],
       'visits_day_pos3': sum(r['visits_day_pos3'] for r in top), 'visits_day_pos3_high_demand': sum(r['visits_day_pos3_high_demand'] for r in top),
       'visits_day_pos3_no_aio': sum(r['visits_day_pos3_no_aio'] for r in top)}
nocur = [r for r in top if not r['id'].startswith('valyuta')]
tot_nocur = {'demand_month_low': sum(r['demand_month_low'] for r in nocur),
             'visits_day_pos6': [sum(r['visits_day_pos6'][0] for r in nocur), sum(r['visits_day_pos6'][1] for r in nocur)],
             'visits_day_pos3': sum(r['visits_day_pos3'] for r in nocur)}
print('TOP', tot)
print('TOP without currency', tot_nocur)
json.dump({'clusters': out, 'totals_top': tot, 'totals_top_without_currency': tot_nocur},
          open(os.path.join(HERE, 'cu_model.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
