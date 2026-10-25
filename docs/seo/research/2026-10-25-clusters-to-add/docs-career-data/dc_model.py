"""Docs & career lens: cluster demand, dedupe, jump-floor, seasonality, visit potential, ramp.

Run: py -3 -I dc_model.py   (reads files only; writes dc_model.json next to this script)

Sources (first hit wins):
  dc_kw1_metrics.json  - get_keyword_metrics 2026-10-25, 620 new keywords (this lens)
  l3-data/kw1_metrics.json, kw2_metrics.json (2026-10-24), roadmap-1000/data/kw3_metrics.json, kw4_metrics.json,
  education-practice-data/ep_kw1_metrics.json (2026-10-25)
  research1_raw.json   - research_keywords seed 'образец' (volume only, no monthly series)
Model (roadmap 1.1 + demand-sizing 1, same as the education-practice lens):
  visits/day = demand/month x CTR x AIO-discount / 30 x 1.5
  pos ~6: CTR 0.613 .. 1.105 % (site's own curve, measured on AIO SERPs -> no extra discount)
  pos ~3: CTR 3.593 % x 0.533 (AIO at r1) or x0.655 (AIO lower / SERP not taken)
Dedupe: identical volume AND identical 12-month series (volume >= 100) = one Google Ads bucket, counted once per lens.
Jump floor: mean(Jul-Sep 2026) / mean(Oct-Nov 2025) >= 5 and volume >= 500 -> floor = mean(Oct-Nov 2025).
Ramp: share of the pos-6 forecast in month n = min(1, K1 * n**1.6); K1 0.04 article / unsnapped SERP,
  0.06 static template collection on a weak snapped SERP, 0.08 interactive tool on a weak snapped SERP (assumption).
"""
import json, os, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = [
    os.path.join(HERE, 'dc_kw1_metrics.json'),
    os.path.join(HERE, 'dc_kw2_metrics.json'),
    os.path.join(R, '2026-10-24-growth-audit', 'l3-data', 'kw1_metrics.json'),
    os.path.join(R, '2026-10-24-growth-audit', 'l3-data', 'kw2_metrics.json'),
    os.path.join(R, '2026-10-25-roadmap-1000', 'data', 'kw3_metrics.json'),
    os.path.join(R, '2026-10-25-roadmap-1000', 'data', 'kw4_metrics.json'),
    os.path.join(R, '2026-10-25-clusters-to-add', 'education-practice-data', 'ep_kw1_metrics.json'),
]
DB = {}
for f in SRC:
    d = json.load(open(f, encoding='utf-8'))
    for k in d['keywords']:
        kw = k['keyword']
        if kw in DB:
            continue
        ms = sorted(k.get('monthly_searches') or [], key=lambda m: (m['year'], m['month']))  # Oct-25 .. Sep-26
        DB[kw] = {'vol': k.get('search_volume') or 0, 'ser': [m['search_volume'] or 0 for m in ms],
                  'src': os.path.basename(f)}
res = json.load(open(os.path.join(HERE, 'research1_raw.json'), encoding='utf-8'))
for r in res['results']:
    for k in r.get('rows', []):
        if k['keyword'] not in DB:
            DB[k['keyword']] = {'vol': k.get('searchVolume') or 0, 'ser': [], 'src': 'research1_raw.json'}

CTR6 = (0.00613, 0.01105)
CTR3 = 0.03593
MULT = 1.5
MON = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
       '2026-07', '2026-08', '2026-09']

# role: core = counted; head = broad / ambiguous / navigational-leaning (upper bound only);
#       existing = already owned by a live page (shown, not counted as new); excl = excluded.
CL = [
 dict(id='office_docs', k1=0.06, aio=0.655,
      name="Ish qog'ozlari: bildirishnoma, dalolatnoma, bayonnoma, kafolat xati, raport",
      core=['bildirishnoma', 'bildirishnoma yozish', 'bildirishnoma namunasi', 'bildirishnoma namuna', 'билдиришнома намуна',
            'билдиришнома', 'dalolatnoma namuna', 'dalolatnoma namunasi', 'dalolatnoma', 'далолатнома намуна', 'далолатнома',
            'dalolatnoma yozish', 'dalolatnoma shakli', 'dalolatnoma tuzish', 'dalolatnoma namunalari',
            'bajarilgan ishlar dalolatnomasi', 'bayonnoma namunasi', 'bayonnoma', 'majlis bayonnomasi', "yig'ilish bayonnomasi",
            'протокол собрания образец', 'kafolat xati', 'kafolat xati namuna', 'kafolat xati namunasi', 'гарантийное письмо',
            'гарантийное письмо образец', 'рапорт', 'рапорт образец', 'raport', 'raport yozish', 'служебная записка',
            'служебная записка образец', 'докладная записка', 'докладная записка образец', 'акт приема передачи образец',
            'акт выполненных работ образец', 'farmoyish hujjatlari', 'tashkiliy hujjatlar', 'rasmiy uslub', "ish qog'ozlari",
            'ish yuritish hujjatlari', 'rasmiy hujjatlar', 'ish yuritish', "e'lon yozish", "e'lon namunasi", "e'lon yozish namunasi",
            "e'lon namuna", 'bayonnoma yozish', 'баённома', 'bayonnoma nima', 'dalolatnoma nima', 'bildirishnoma nima',
            'bildirishnoma yozish namunasi', 'кафолат хати', 'kafolat xati yozish', 'hujjat namunalari', 'делопроизводство'],
      head=[], existing=['xizmat xati namuna', 'xizmat xati namunasi', 'xizmat xati'], excl=[]),
 dict(id='internship_reports', k1=0.06, aio=0.655,
      name='Amaliyot kundaligi va hisobot (talaba amaliyoti, ish hisoboti)',
      core=['amaliyot kundaligi', 'amaliyot kundaligi namuna', 'amaliyot hisoboti', 'malakaviy amaliyot hisoboti',
            'amaliyot daftari', 'amaliyot hisobot namunasi', 'отчет по практике', 'pedagogik amaliyot hisoboti',
            'amaliyot hisoboti namuna', 'amaliyot hisoboti namunasi', "o'quv amaliyoti hisoboti", 'дневник практики',
            'hisobot yozish', 'hisobot namunasi', 'hisobot namuna', 'yillik hisobot namunasi', 'amaliyot kundaligi yozish',
            'amaliyot kundaligi pdf', 'амалиёт кундалиги', "o'qituvchi hisoboti", 'sinf rahbar hisoboti', 'oylik hisobot'],
      susp=["amaliyot kundaligi to'ldirish"], head=['hisobot'], existing=[], excl=[]),
 dict(id='obyektivka', k1=0.06, aio=0.655,
      name="Obyektivka (ma'lumotnoma) generatori + namuna",
      core=['obyektivka namuna', 'obyektivka namunasi', 'obyektivka', "ma'lumotnoma namuna", "ma'lumotnoma namunasi",
            'malumotnoma namuna', 'ma lumotnoma namuna', "ma'lumotnoma yozish", 'объективка', 'обьективка',
            'obyektivka tayyorlash', 'obektivka', 'obektivka namuna', 'объективка намуна', 'объективка намунаси',
            'справка объективка', 'маълумотнома намуна', 'obyektivka namuna pdf', 'obyektivka namunasi pdf', 'obyektivka namuna word',
            'obyektivka shablon', 'obyektivka nima', 'obyektivka word', 'obyektivka yuklab olish', 'объективка образец',
            'объективка узбекистан', 'obyektivka yaratish', 'obyektivka yozish', "obyektivka to'ldirish",
            'личный листок по учету кадров'],
      head=["ma'lumotnoma", 'malumotnoma', 'маълумотнома', "ish joyidan ma'lumotnoma"], existing=[],
      excl=['obyektivka uz']),
 dict(id='cv_builder', k1=0.04, aio=0.655, aio_kw={'cv nima': 0.533},
      name='CV/rezyume konstruktori (UZ/RU/EN) + RU-страница «резюме» + «CV nima»',
      core=['cv nima', 'cv maker', 'resume maker', 'резюме шаблон', 'шаблон резюме', 'резюме образец', 'образец резюме',
            'резюме онлайн', 'создать резюме', 'резюме бланк', 'бланк резюме', 'cv template', 'resume template', 'cv example',
            'resume example', 'cv sample', 'cv format', 'resume format', 'resume builder', 'резюме на работу', 'резюме пример',
            'пример резюме', 'как составить резюме', 'как написать резюме', 'составить резюме', 'резюме образец узбекистан',
            'резюме ташкент', 'резюме на английском', 'резюме образец скачать', 'резюме образец word', 'резюме скачать',
            'резюме на работу образец', 'rezyume yaratish', 'cv yaratish', 'cv online', 'cv for students', 'резюме на узбекском',
            'resume namuna', 'cv yozish', 'how to write a cv', 'cv yozish namunasi', 'cv for job', 'конструктор резюме',
            'rezyume online', 'cv in english', 'резюме намуна', 'резюме тайёрлаш', 'rezyume namuna word', 'rezyume yuklab olish',
            'написать резюме', 'нейросеть для резюме', 'cv ai', 'ai resume', 'rezyume namunasi pdf', 'cv generator',
            'резюме генератор'],
      head=['cv', 'resume', 'резюме'],
      existing=['rezyume tayyorlash', 'rezyume namuna', 'rezyume', 'rezyume shablon', 'rezyume shabloni', 'resume tayyorlash',
                'rezyume nima', 'cv tayyorlash', "rezyume to'ldirish", 'cv namuna', 'cv namunasi', 'rezyume namunasi',
                'rezyume yozish namunasi', 'rezume', 'rezume namuna', 'rezyume yozish', 'rezyume qanday yoziladi'],
      excl=[]),
 dict(id='tarjimai_hol', k1=0.06, aio=0.533,
      name='Tarjimai hol (avtobiografiya) namunasi + to‘ldirish shakli',
      core=['tarjimai hol', 'tarjimayi hol', 'tarjimai hol yozish', 'автобиография', 'автобиография образец', 'avtobiografiya',
            'avtobiografiya namuna', 'tarjimai hol namunasi', 'tarjimai hol namuna', 'tarjimai xol', 'avtobiografiya yozish',
            'автобиография пример', 'автобиография намуна', 'автобиография бланк', 'автобиография образец на работу',
            'как написать автобиографию', 'таржимаи ҳол', 'таржимаи ҳол намуна', 'tarjimai hol blanka', 'tarjimai hol nima'],
      head=[], existing=[], excl=[]),
 dict(id='cyr_ru_mirrors', k1=0.04, aio=0.655,
      name='Кириллица и RU для действующих гайдов: тушунтириш хати, ариза, тавсифнома; RU объяснительная, заявление, характеристика',
      core=['тушунтириш хати', 'тушунтириш хати намуна', 'ариза', 'ариза намуна', 'ариза намунаси', 'ариза ёзиш',
            'тавсифнома намуна', 'тавсиянома намуна', 'тавсифнома', 'объяснительная', 'объяснительная в школу',
            'объяснительная образец', 'объяснительная записка', 'объяснительная записка образец', 'как написать объяснительную',
            'объяснительная за опоздание', 'заявление на увольнение', 'заявление на отпуск', 'заявление образец',
            'заявление на работу', 'заявление в школу', 'образец заявления', 'заявление о приеме на работу',
            'как написать заявление', 'заявление на увольнение по собственному желанию', 'характеристика образец',
            'характеристика на ученика', 'характеристика на сотрудника', 'характеристика с места работы', 'xarakteristika',
            'xarakteristika namuna', 'характеристика намуна'],
      head=['характеристика', 'заявление'],
      existing=['tushuntirish xati', 'tushuntirish xati namunasi', 'tushuntirish xati namuna', 'tushuntirish xati yozish',
                'ariza yozish', 'ariza namunasi', 'ariza yozish namunasi', 'ariza yozish namuna', 'ariza namuna', 'ariza',
                'ariza blanka', 'ariza qanday yoziladi', 'tavsifnoma namuna', 'tavsifnoma', "o'quvchiga tavsifnoma",
                'tavsifnoma namunasi word', 'tavsifnoma yozish namuna', 'ariza nima', 'tushuntirish xati nima'],
      excl=[]),
 dict(id='tilxat_ishonchnoma', k1=0.06, aio=0.655,
      name='Tilxat va oddiy yozma ishonchnoma (namuna + to‘ldirish shakli)',
      core=['tilxat yozish', 'tilxat', 'tilxat namuna', 'tilxat namunasi', 'ishonchnoma', 'ishonchnoma namunasi',
            'ishonchnoma namuna', 'ишончнома', 'ишончнома намуна', 'ishonchnoma yozish', 'расписка', 'расписка образец',
            'доверенность образец', 'avtomobil ishonchnoma', 'тилхат', 'тилхат намуна', 'tilxat nima',
            'tilxat qanday yoziladi', 'ishonchnoma nima'],
      head=['доверенность'], existing=[], excl=[]),
 dict(id='certificates', k1=0.08, aio=0.655,
      name='Faxriy yorliq, tashakkurnoma, minnatdorchilik xati — chop etiladigan blank generatori',
      core=['faxriy yorliq', 'faxriy yorliq namuna', 'tashakkurnoma', 'tashakkurnoma namunasi', 'minnatdorchilik xati',
            'благодарственное письмо', 'благодарственное письмо образец', 'rahmatnoma', 'faxriy yorliq shablon',
            'tashakkurnoma shablon', "maqtov yorlig'i", 'sertifikat namuna', 'фахрий ёрлиқ', 'sertifikat yaratish'],
      head=[], existing=[], excl=[]),
 dict(id='recommendation', k1=0.04, aio=0.655,
      name='Tavsiyanoma / recommendation letter (UZ/RU/EN)',
      core=['tavsiyanoma', 'tavsiyanoma namuna', 'tavsiyanoma namunasi', 'tavsiyanoma yozish', 'тавсиянома',
            'recommendation letter', 'letter of recommendation', 'recommendation letter sample', 'рекомендательное письмо',
            'reference letter', 'taqdimnoma', 'recommendation letter for student', 'рекомендательное письмо образец',
            'рекомендательное письмо студенту', 'rekomendatsiya', 'tavsiya xati', 'tavsiya xati namuna', 'taqdimnoma namuna'],
      head=[], existing=[], excl=[]),
 dict(id='motivation_cover', k1=0.04, aio=0.655,
      name='Motivatsion xat, cover letter, personal statement (o‘qish va ish uchun)',
      core=['motivation letter', 'motivation letter example', 'motivation letter sample', 'cover letter', 'сопроводительное письмо',
            'cover letter example', 'personal statement example', 'personal statement', 'how to write a cover letter',
            'мотивационное письмо', 'motivation letter for university', 'motivatsion xat', 'cover letter sample',
            'сопроводительное письмо к резюме', 'сопроводительное письмо пример', 'motivation letter for scholarship',
            'how to write motivation letter', 'motivatsion xat namunasi', 'motivatsion xat namuna', 'мотивационное письмо пример',
            'cover letter template', 'statement of purpose', 'cover letter for job', 'мотивационное письмо образец',
            'мотивационное письмо в университет образец'],
      head=[], existing=[], excl=[]),
 dict(id='career_test', k1=0.06, aio=0.655,
      name='Kasb tanlash testi (o‘z savollari) + kasblar ro‘yxati',
      core=["kasblar ro'yxati", 'kelajak kasblari', 'kasb tanlash', 'kasb tanlash testi', 'тест на профориентацию',
            'eng yaxshi kasblar', 'профориентация тест', 'тест на профессию', 'career test', "eng ko'p maosh oladigan kasblar",
            'kasb tanlash test', 'какая профессия мне подходит', 'профориентационный тест'],
      head=['kasblar'], existing=[], excl=[]),
 dict(id='contracts_hold', k1=0.04, aio=0.655,
      name='Shartnoma namunalari (mehnat, pudrat, oldi-sotdi, ijara) — HOLD',
      core=['ijara shartnomasi', 'ижара шартномаси', 'mehnat shartnomasi', 'pudrat shartnomasi', 'shartnoma namunasi',
            'oldi sotdi shartnomasi', 'трудовой договор', 'договор купли продажи', 'mehnat shartnomasi namunasi',
            'mehnat shartnomasi namuna', 'hadya shartnomasi', 'договор аренды', 'qarz shartnomasi', 'shartnoma namunalari',
            'договор аренды квартиры', 'ijara shartnomasi namunasi', 'ijara shartnomasi namuna', 'трудовой договор узбекистан',
            'qarz shartnomasi namunasi', 'договор займа', 'shartnoma tuzish', 'uy ijara shartnomasi', 'меҳнат шартномаси',
            'трудовой договор образец', 'договор на оказание услуг', 'shartnoma namuna'],
      head=['shartnoma', 'договор', 'шартнома'], existing=[], excl=[]),
]
# below the top-12, measured for transparency
EXTRA = [
 dict(id='business_proposal', k1=0.04, aio=0.655, name='Tijorat taklifi / коммерческое предложение',
      core=['коммерческое предложение', 'коммерческое предложение образец', 'коммерческое предложение образец word', 'tijorat taklifi',
            'tijorat taklifi namuna', 'образец коммерческого предложения', 'коммерческое предложение пример'],
      head=['biznes taklif', 'hisob faktura', 'счет фактура образец', 'счет на оплату образец', 'yuk xati namuna', 'накладная образец'],
      existing=[], excl=[]),
 dict(id='interview', k1=0.04, aio=0.655, name='Ish suhbati / собеседование',
      core=['собеседование', 'interview questions and answers', 'tell me about yourself', 'intervyu savollari', 'interview questions',
            'собеседование на английском', 'suhbat savollari', 'job interview questions', 'вопросы работодателю на собеседовании',
            'bank suhbat savollari', 'вопросы на собеседовании', 'interview in english'],
      head=['intervyu'], existing=[], excl=[]),
 dict(id='invitation_text', k1=0.04, aio=0.655, name='Taklifnoma matni (rasmiy taklifnoma)',
      core=['taklifnoma matni', 'taklifnoma namuna', "to'y taklifnoma matni"], head=['taklifnoma'], existing=[], excl=[]),
 dict(id='hr_calcs', k1=0.06, aio=0.655, name='Staj / oylik kalkulyatori',
      core=['стаж калькулятор', 'калькулятор стажа', 'staj kalkulyator', 'ish staji', 'staj hisoblash', 'oylik hisoblash',
            'ish haqi hisoblash', 'калькулятор зарплаты', 'oylik maosh hisoblash', 'калькулятор зарплаты узбекистан',
            "daromad solig'i hisoblash", 'soliq hisoblash', 'отпускные калькулятор'],
      head=[], existing=[], excl=[]),
 dict(id='hr_orders', k1=0.04, aio=0.655, name='Buyruq / приказ / lavozim yo‘riqnomasi',
      core=['buyruq', 'buyruq namunasi', 'buyruq namuna', 'приказ', 'буйруқ', 'должностная инструкция', 'farmoyish namunasi',
            'lavozim yo\'riqnomasi namunasi', 'shtat jadvali', "ishdan bo'shatish buyrug'i", 'приказ о приеме на работу',
            'приказ об увольнении', 'буйруқ намуна', 'buyruq namunalari', 'штатное расписание образец'],
      head=['mehnat daftarchasi'], existing=[], excl=[]),
]

seen_bucket = {}

def sig(kw):
    e = DB.get(kw)
    if not e:
        return None
    return (e['vol'], tuple(e['ser'])) if e['ser'] else (e['vol'], ('noseries', kw))

def floor_of(e):
    s = e['ser']
    if len(s) != 12 or e['vol'] < 500:
        return e['vol'], False
    on = (s[0] + s[1]) / 2
    js = (s[9] + s[10] + s[11]) / 3
    if on > 0 and js / on >= 5:
        return round(on), True
    if on == 0 and js >= 500:
        return 0, True
    return e['vol'], False

def visits(dem, aio):
    lo = dem * CTR6[0] / 30 * MULT
    hi = dem * CTR6[1] / 30 * MULT
    p3 = dem * CTR3 * aio / 30 * MULT
    return round(lo, 1), round(hi, 1), round(p3, 1)

def weeks_to(target, full, k1):
    if full <= 0:
        return None
    for w in range(1, 157):
        n = w / 4.345
        if full * min(1, k1 * n ** 1.6) >= target:
            return w
    return None

def run(c):
    rows, dem, flo, missing, dup = [], 0, 0, [], []
    season = [0] * 12
    p3sum = 0.0
    for kw in c['core']:
        e = DB.get(kw)
        if not e:
            missing.append(kw)
            continue
        sg = sig(kw)
        bucket_owner = None
        if e['vol'] >= 100 and e['ser'] and sg in seen_bucket:
            bucket_owner = seen_bucket[sg]
        if bucket_owner:
            dup.append((kw, bucket_owner))
            rows.append(dict(kw=kw, vol=e['vol'], counted=False, same_bucket_as=bucket_owner, src=e['src']))
            continue
        if e['vol'] >= 100 and e['ser']:
            seen_bucket[sg] = kw
        f, jump = floor_of(e)
        dem += e['vol']
        flo += f
        a = c.get('aio_kw', {}).get(kw, c['aio'])
        p3sum += e['vol'] * CTR3 * a / 30 * MULT
        if e['ser'] and len(e['ser']) == 12:
            for i in range(12):
                season[i] += e['ser'][i]
        rows.append(dict(kw=kw, vol=e['vol'], floor=f, jump=jump, counted=True, src=e['src'],
                         ser=e['ser'] if e['ser'] else None))
    susp = [(kw, DB[kw]['vol']) for kw in c.get('susp', []) if kw in DB]
    head = [(kw, DB[kw]['vol']) for kw in c['head'] if kw in DB]
    headsum = 0
    for kw, v in head:
        sg = sig(kw)
        if DB[kw]['ser'] and v >= 100 and sg in seen_bucket:
            continue
        if DB[kw]['ser'] and v >= 100:
            seen_bucket[sg] = kw
        headsum += v
    existing = [(kw, DB[kw]['vol']) for kw in c['existing'] if kw in DB]
    lo, hi, _ = visits(dem, c['aio'])
    flo_lo, flo_hi, _ = visits(flo, c['aio'])
    p3 = round(p3sum, 1)
    p3_floor = round(p3sum * (flo / dem), 1) if dem else 0
    mean = sum(season) / 12 if sum(season) else 0
    sidx = [round(x / mean, 2) if mean else None for x in season]
    mid = (lo + hi) / 2
    fmid = (flo_lo + flo_hi) / 2
    out = dict(id=c['id'], name=c['name'], k1=c['k1'], aio=c['aio'], demand_ads_core=dem, demand_floor_core=flo,
               demand_head_upper=headsum, demand_susp_upper=sum(v for _, v in susp), susp=susp, visits_pos6_ads=[lo, hi], visits_pos6_floor=[flo_lo, flo_hi],
               visits_pos3_ads=p3, visits_pos3_floor=p3_floor,
               pos3_no_aio_ads=round(dem * CTR3 / 30 * MULT, 1),
               m1_visits_ads_mid=round(mid * c['k1'], 2), m1_visits_floor_mid=round(fmid * c['k1'], 2),
               months_to_full_pos6=round((1 / c['k1']) ** (1 / 1.6), 1),
               weeks_to_2_ads=weeks_to(2, mid, c['k1']), weeks_to_2_floor=weeks_to(2, fmid, c['k1']),
               weeks_to_5_ads=weeks_to(5, mid, c['k1']), weeks_to_5_floor=weeks_to(5, fmid, c['k1']),
               weeks_to_10_ads=weeks_to(10, mid, c['k1']), weeks_to_10_floor=weeks_to(10, fmid, c['k1']),
               seasonality_index=dict(zip(MON, sidx)), keywords=sorted(rows, key=lambda r: -r['vol']),
               head=head, existing=existing, missing=missing, dedup=dup, excl=c['excl'])
    return out

clusters = [run(c) for c in CL]
extra = [run(c) for c in EXTRA]
tot = lambda key, arr: round(sum(x[key] if not isinstance(x[key], list) else 0 for x in arr), 1)
summary = dict(
    demand_ads=sum(c['demand_ads_core'] for c in clusters),
    demand_floor=sum(c['demand_floor_core'] for c in clusters),
    demand_head=sum(c['demand_head_upper'] for c in clusters),
    demand_susp=sum(c['demand_susp_upper'] for c in clusters),
    pos6_ads=[round(sum(c['visits_pos6_ads'][0] for c in clusters)), round(sum(c['visits_pos6_ads'][1] for c in clusters))],
    pos6_floor=[round(sum(c['visits_pos6_floor'][0] for c in clusters)), round(sum(c['visits_pos6_floor'][1] for c in clusters))],
    pos3_ads=round(sum(c['visits_pos3_ads'] for c in clusters)),
    pos3_floor=round(sum(c['visits_pos3_floor'] for c in clusters)),
    pos3_no_aio_ads=round(sum(c['pos3_no_aio_ads'] for c in clusters)),
    excl_contracts=dict(
        demand_ads=sum(c['demand_ads_core'] for c in clusters if c['id'] != 'contracts_hold'),
        demand_floor=sum(c['demand_floor_core'] for c in clusters if c['id'] != 'contracts_hold'),
        pos6_ads=[round(sum(c['visits_pos6_ads'][0] for c in clusters if c['id'] != 'contracts_hold')),
                  round(sum(c['visits_pos6_ads'][1] for c in clusters if c['id'] != 'contracts_hold'))],
        pos6_floor=[round(sum(c['visits_pos6_floor'][0] for c in clusters if c['id'] != 'contracts_hold')),
                    round(sum(c['visits_pos6_floor'][1] for c in clusters if c['id'] != 'contracts_hold'))],
        pos3_ads=round(sum(c['visits_pos3_ads'] for c in clusters if c['id'] != 'contracts_hold')),
        pos3_floor=round(sum(c['visits_pos3_floor'] for c in clusters if c['id'] != 'contracts_hold'))),
    existing_pages_undeclared=sorted({kw: v for c in clusters for kw, v in c['existing']}.items(), key=lambda x: -x[1]),
)
json.dump(dict(summary=summary, clusters=clusters, extra=extra), open(os.path.join(HERE, 'dc_model.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
for c in clusters + extra:
    jumps = [r['kw'] for r in c['keywords'] if r.get('jump')]
    print(f"{c['id']:<20} ads {c['demand_ads_core']:>6} floor {c['demand_floor_core']:>6} head {c['demand_head_upper']:>6} | "
          f"p6 {c['visits_pos6_ads']} (floor {c['visits_pos6_floor']}) p3 {c['visits_pos3_ads']} (floor {c['visits_pos3_floor']}) | "
          f"m1 {c['m1_visits_ads_mid']} w5 {c['weeks_to_5_ads']}/{c['weeks_to_5_floor']} w10 {c['weeks_to_10_ads']}/{c['weeks_to_10_floor']} "
          f"full {c['months_to_full_pos6']}mo")
    if c['missing']: print('   MISSING', c['missing'])
    if c['dedup']: print('   DEDUP', c['dedup'])
    if jumps: print('   JUMP', jumps)
    si = c['seasonality_index']
    print('   SEASON', ' '.join(f"{k[2:]}:{v}" for k, v in si.items()))
print('SUMMARY', json.dumps(summary, ensure_ascii=False)[:2000])
