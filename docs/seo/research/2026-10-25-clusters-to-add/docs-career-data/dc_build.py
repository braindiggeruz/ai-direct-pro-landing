"""Build docs-career.md and docs-career.json from dc_model.json (+ hand-written cluster notes below).
Run: py -3 -I dc_build.py
"""
import json, os, sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
M = json.load(open(os.path.join(HERE, 'dc_model.json'), encoding='utf-8'))
S = M['summary']
C = {c['id']: c for c in M['clusters']}
X = {c['id']: c for c in M['extra']}

def fi(n):
    return f"{int(round(n)):,}".replace(',', ' ')

def fd(x):
    return (f"{x:.1f}").replace('.', ',')

UZC = re.compile(r'[ўқғҳЎҚҒҲ]|намун|хати|ёзиш|нома|ариза|тилхат|кундалиги|тайёрлаш|ёрлиқ|шартнома|объективка|обьективка|баённома|далолат|хат$')
EN = re.compile(r'\b(cv|resume|letter|template|example|sample|format|builder|maker|how to|statement|recommendation|reference|interview|career|scholarship|questions|yourself|generator|online|for students|for job|in english|ai)\b', re.I)

def script(kw):
    if re.search(r'[а-яёА-ЯЁ]', kw):
        return 'UZ кириллица' if UZC.search(kw) else 'RU'
    if EN.search(kw) and not re.search(r"(namuna|yozish|yaratish|nima|tayyorlash|ingliz|uchun|yasash|o'zbek|uzbek)", kw):
        return 'EN'
    return 'UZ латиница'

def kwlines(c, top=18):
    rows = [r for r in c['keywords'] if r['counted'] and r['vol'] > 0]
    dups = {}
    for r in c['keywords']:
        if not r['counted']:
            dups.setdefault(r['same_bucket_as'], []).append(r['kw'])
    groups = {}
    for r in rows[:top]:
        t = f"{r['kw']} {fi(r['vol'])}"
        if r.get('jump'):
            t += f" (скачок, пол {fi(r['floor'])})"
        if r['kw'] in dups:
            t += ' (= ' + ', '.join(dups[r['kw']]) + ')'
        groups.setdefault(script(r['kw']), []).append(t)
    rest = len(rows) - min(len(rows), top)
    out = []
    for g in ['UZ латиница', 'UZ кириллица', 'RU', 'EN']:
        if g in groups:
            out.append(f"  - {g}: " + ', '.join(groups[g]))
    if rest > 0:
        out.append(f"  - и ещё ключей по 10–90: {rest} (полный список — `docs-career-data/dc_model.json`)")
    return out

def season_text(c):
    si = c['seasonality_index']
    items = sorted(si.items(), key=lambda kv: -(kv[1] or 0))
    mon = {'01': 'янв', '02': 'фев', '03': 'мар', '04': 'апр', '05': 'май', '06': 'июн', '07': 'июл', '08': 'авг',
           '09': 'сен', '10': 'окт', '11': 'ноя', '12': 'дек'}
    nm = lambda k: f"{mon[k[5:]]} {k[2:4]}"
    hi = ', '.join(f"{nm(k)} ×{str(v).replace('.', ',')}" for k, v in items[:3])
    lo = ', '.join(f"{nm(k)} ×{str(v).replace('.', ',')}" for k, v in items[-2:])
    return f"пики: {hi}; минимум: {lo}"

def ramp_text(c, extra=''):
    k = c['k1']
    def w(a, b):
        if a is None and b is None:
            return 'не достигает на поз. 6'
        if b is None:
            return f"{a} нед по Ads (по полу не достигает)"
        if a == b:
            return f"{a} нед"
        return f"{a} нед (по полу {b})"
    t = (f"K1 = {str(k).replace('.', ',')}; 1-й месяц ≈{fd(c['m1_visits_ads_mid'])} виз/день; ≥2 виз/день — {w(c['weeks_to_2_ads'], c['weeks_to_2_floor'])}; "
         f"≥5 — {w(c['weeks_to_5_ads'], c['weeks_to_5_floor'])}; полный прогноз поз. 6 через ≈{fd(c['months_to_full_pos6'])} мес")
    return t + (('. ' + extra) if extra else '')

def v6(c):
    a, f = c['visits_pos6_ads'], c['visits_pos6_floor']
    s = f"{fd(a[0])}–{fd(a[1])}"
    if f != a:
        s += f" (пол {fd(f[0])}–{fd(f[1])})"
    return s

def v3(c):
    s = fd(c['visits_pos3_ads'])
    if c['visits_pos3_floor'] != c['visits_pos3_ads']:
        s += f" (пол {fd(c['visits_pos3_floor'])})"
    return s

def dem(c):
    s = fi(c['demand_ads_core'])
    if c['demand_floor_core'] != c['demand_ads_core']:
        s += f" (пол {fi(c['demand_floor_core'])})"
    return s

# ---------- hand-written notes per cluster ----------
N = {
 'office_docs': dict(
   title="Ish qog‘ozlari: bildirishnoma, dalolatnoma, bayonnoma, kafolat xati, raport, e’lon",
   serp_weak='weak', fit='c + a (+ b)', effort='M', honesty='low',
   existing='/uz/blog/rasmiy-xat-yozish/ (kafolat xati там только раздел; ключ не объявлен)',
   serp=("Снято 2026-10-25. «bildirishnoma»: AIO r3; Scribd PDF, toolbase.uz и fmc.uz (словари), платные файлы kursishlari.uz/soff.uz, "
         "qnb.uz, урок YouTube «Ma’lumot-axborot hujjatlari». «dalolatnoma namuna» (L3, 24.10): soff, YouTube, Scribd ×5, arxiv.uz, "
         "lex.uz (акты ЗАГС) ×2, bss.uz. Своей страницы-шаблона с объяснением ни у кого нет. Слабая."),
   build=("Хаб `/uz/hujjatlar/` («Ish qog‘ozlari namunalari»: виды документов — tashkiliy, farmoyish, ma’lumot-axborot; rasmiy uslub; "
          "ссылки на все документные страницы сайта, включая действующие гайды) и 6 страниц-шаблонов "
          "`/uz/hujjatlar/{bildirishnoma,dalolatnoma,bayonnoma,kafolat-xati,raport,elon}-namuna/`. Тип страницы: статичный шаблон (c) — "
          "определение, реквизиты, 2–3 условных образца только с плейсхолдерами, тот же образец кириллицей прямо в HTML, FAQ — "
          "плюс общий браузерный генератор (a): поля → готовый текст латиницей и кириллицей (через уже существующий конвертер), "
          "копировать / печать / .docx на клиенте, ничего не уходит на сервер. Кнопка «AI bilan yozish» открывает пресет чата (b). "
          "Для kafolat xati: страница отдельная, а `/uz/blog/rasmiy-xat-yozish/` ссылается на неё (новая пара в intent-manifest)."),
   honesty_note="Только плейсхолдеры, без печатей и подписей; «не юридическая консультация»; первой идёт форма организации.",
   ramp_extra="Запустить до февраля 2027, чтобы страницы разогнались к пику апр–май"),
 'internship_reports': dict(
   title='Amaliyot kundaligi va hisoboti (talaba amaliyoti) + hisobot namunasi',
   serp_weak='weak', fit='c + a (+ b)', effort='S', honesty='medium', existing='',
   serp=("Снято 2026-10-25. «amaliyot kundaligi»: Scribd PDF ×3, платные doclab.uz, soff.uz (1 100 сум), diplomishi.uz (15 000 сум), "
         "arxiv.uz 2023, researchgate; AIO r2. «amaliyot kundaligi to‘ldirish»: то же самое (Scribd, soff, PDF методичек jdpu/buxdu, studocu), "
         "AIO r5 — намерение настоящее (шаблон и правила заполнения), не навигация в HEMIS или kundalik.com. «hisobot yozish»: soff "
         "«Hisobot, e’lonning yozilish tartibi», затем финансовая отчётность (sindex, unilibrary, t4data) — смешанная. Слабая."),
   build=("`/uz/hujjatlar/amaliyot-kundaligi/` — пустой шаблон дневника практики (таблица: sana / bajarilgan ish mazmuni / rahbar imzosi), "
          "правила заполнения по разделам, образец 3 строк только с плейсхолдерами; генератор (a): диапазон дат → пустая таблица на "
          "печать/.docx. `/uz/hujjatlar/amaliyot-hisoboti/` — структура отчёта о практике. «hisobot namunasi/yozish» — раздел про "
          "служебный отчёт на этой же странице или на хабе `/uz/hujjatlar/`."),
   honesty_note=("Без «готовых заполненных дневников для сдачи». AI-пресет помогает сформулировать то, что студент реально делал, "
                 "и прямо говорит не выдумывать дни практики."),
   ramp_extra=("Сначала пилот: страница дневника и через 4–6 недель сравнить показы GSC с Ads. Ряды выглядят странно: "
               "«amaliyot kundaligi» 260 (окт 25) → 60 500 (сен 26), а «…namuna» летом падает почти до нуля")),
 'obyektivka': dict(
   title='Obyektivka (ma’lumotnoma) — генератор и образец',
   serp_weak='mixed', fit='a + c', effort='M', honesty='medium',
   existing='/uz/blog/rezyume-tayyorlash/ (только раздел; «obyektivka namuna» уже в mustNotTarget у rezyume, C32)',
   serp=("L3 (24.10), «obyektivka namuna»: r1 tez-hujjat.uz (генератор), r2 resum.uz (генератор, RU/UZ), r3 v1.obyektivka.uz (генератор), "
         "дальше slideshare .docx, tsuos.uz, urdu.uz, soff, obyektivkalar.uz, Scribd, Pinterest; AIO r6. Тип страницы задан: генератор. "
         "Топ-3 занят специализированными сервисами, реалистичная цель — поз. 4–8."),
   build=("`/uz/hujjatlar/obyektivka-namuna/` — браузерный генератор (a): поля общепринятой формы (F.I.Sh., tug‘ilgan yili va joyi, "
          "ma’lumoti, mutaxassisligi, chet tillari, mehnat faoliyati, yaqin qarindoshlari jadvali), место под фото только локально, "
          "предпросмотр A4, печать/PDF/.docx, латиница и кириллица (запрос «объективка» — 1 600). Под формой — образец с "
          "плейсхолдерами и правила заполнения (c). Всё на клиенте, данные никуда не уходят."),
   honesty_note=("Решение владельца O-05 (BACKLOG) ещё не принято. Честно только при совпадении с ходовой формой и с пометкой "
                 "«сверьте с формой вашей организации». Персональные данные — только в браузере."),
   ramp_extra=''),
 'cv_builder': dict(
   title='Конструктор CV/rezyume (UZ/RU/EN) + RU-страница «образец резюме» + «CV nima»',
   serp_weak='mixed', fit='a + c (+ b)', effort='L', honesty='low',
   existing='/uz/blog/rezyume-tayyorlash/ (владеет rezyume tayyorlash/namuna, cv tayyorlash, cv namuna — не трогать)',
   serp=("Снято 2026-10-25. «резюме шаблон»: Canva r1, myresume.ru, obrazecv.ru, superjob.uz, resum.uz (местный конструктор, "
         "обновлён 08.2026), pgu.ru, Pinterest; AIO r4 — смешанная/сильная. «cv nima»: AIO r1, дальше Cambridge Dictionary (TR), "
         "азербайджанские YouTube, Instagram и техноблог, сербский сайт — ни одной узбекской страницы в топ-10, очень слабая."),
   build=("1) `/uz/rezyume-yaratish/` — конструктор (a): форма → 2–3 строгих шаблона, подписи на UZ/RU/EN, печать в PDF, без регистрации, "
          "всё на клиенте; цели: cv maker, resume maker, rezyume yaratish, cv template/example, rezyume namunasi pdf. "
          "2) `/ru/obrazets-rezyume/` — образец и шаблон резюме для Узбекистана, ссылка на конструктор (на RU-стороне такой страницы нет). "
          "3) `/uz/blog/cv-nima/` — CV, rezyume и obyektivka: в чём разница. Новая пара в intent-manifest, чтобы конструктор не "
          "забирал ключи гайда."),
   honesty_note='Не выдумывать опыт и навыки; AI-пресет только шлифует текст пользователя.',
   ramp_extra='«cv nima» на очень слабой выдаче разгонится быстрее, чем K1 для всего кластера'),
 'tarjimai_hol': dict(
   title='Tarjimai hol (avtobiografiya) — образец и бланк',
   serp_weak='weak', fit='c + a', effort='S', honesty='low', existing='',
   serp=("Снято 2026-10-25. «tarjimai hol»: AIO r2; oriftolib.uz (стихотворение «Tarjimayi hol» — литература), урок YouTube "
         "«Davlat tilida ish yuritish», Scribd ×4 (бланки), askinfo.uz 2018. Почти всё — документное намерение. Слабая."),
   build=("`/uz/hujjatlar/tarjimai-hol-namuna/`: что пишется и в каком порядке (поля «tarjimai hol blankasi»), два условных образца "
          "(talaba, xodim) с плейсхолдерами, кириллическая версия, тот же генератор, что у хаба; RU-блок «автобиография образец» "
          "(автобиография 1 300 и образец 390)."),
   honesty_note='Плейсхолдеры, без чужих биографий.', ramp_extra=''),
 'cyr_ru_mirrors': dict(
   title='Кириллица и RU для действующих гайдов: тушунтириш хати, ариза, тавсифнома + RU объяснительная, заявление, характеристика',
   serp_weak='mixed', fit='c (+ b)', effort='M', honesty='low',
   existing='/uz/blog/tushuntirish-xati-va-ariza-yozish/, /uz/blog/tavsifnoma-namuna/',
   serp="Не снят (лимит). Прокси: латинские версии этих же документов (tavsifnoma, dalolatnoma) — Scribd, Facebook, мелкие блоги.",
   build=("(а) Полные кириллические блоки образцов прямо в HTML трёх действующих гайдов — S, сразу; «тушунтириш хати» по Ads 2 900 "
          "(скачок, пол 655), «тавсифнома намуна» 720. (б) RU-страницы `/ru/obrazets-obyasnitelnoy/`, `/ru/obrazets-zayavleniya/` "
          "(увольнение, отпуск, приём), `/ru/obrazets-harakteristiki/` — с пометкой, где в Узбекистане нужен документ на госязыке. "
          "Голые «характеристика» 2 400 и «заявление» 720 неоднозначны — в расчёт не входят."),
   honesty_note='Как у действующих гайдов: плейсхолдеры, «не юридическая консультация».',
   ramp_extra=''),
 'tilxat_ishonchnoma': dict(
   title='Tilxat (расписка) и oddiy yozma ishonchnoma — образец + форма',
   serp_weak='mixed', fit='c + a', effort='S', honesty='medium', existing='',
   serp=("Снято 2026-10-25. «tilxat yozish»: soff.uz (платно), kalki.uz (онлайн-генератор tilxat в Word/PDF — прямой конкурент), "
         "YouTube «Tilxat qonuniy kuchga egami?», arxiv.uz 2019, yurxizmat.uz, znanija (школьный вопрос про стиль ish qog‘ozlari); AIO r3 — слабая. "
         "«тилхат»: digital.gov.uz, uzbekistan.uz/advice, gov.uz (страницы без описания), глоссарий, словарь uzdic — смешанная."),
   build=("`/uz/hujjatlar/tilxat-namuna/` — виды расписок (qarz, hujjat yoki pul qabul qilish, mehnat daftarchasini olish), обязательные "
          "реквизиты, образцы латиницей и кириллицей (кириллица — 8 100 по Ads), генератор. `/uz/hujjatlar/ishonchnoma-namuna/` — "
          "только простая письменная доверенность (получить зарплату или документы); для авто и недвижимости — прямой текст "
          "«нужен нотариус» и ссылка на gov.uz."),
   honesty_note=("YMYL рядом: нейтральный шаблон, без обещаний «юридической силы», без советов по долговым спорам; "
                 "не делать шаблоны доверенностей на авто и недвижимость."),
   ramp_extra='«tilxat yozish» и «тилхат» — со скачком; по полу кластер даёт ≈1,5–2,8 виз/день на поз. 6'),
 'certificates': dict(
   title='Faxriy yorliq, maqtov yorlig‘i, tashakkurnoma, sertifikat — генератор бланков для печати',
   serp_weak='weak', fit='a + c', effort='M', honesty='low', existing='',
   serp=("Снято 2026-10-25. «faxriy yorliq»: idum.uz (2024), YouTube «5 minutda… faxriy yorliq», Scribd, docx.uz, soff.uz, portfolio.uz, "
         "Pinterest, diplomishi.uz (платно); AIO r7. Только файлы и картинки, инструмента нет. Слабая."),
   build=("`/uz/faxriy-yorliq-yaratish/` — инструмент (a): 4–6 наших CSS/SVG-рамок A4, пресеты текста (faxriy yorliq, maqtov yorlig‘i, "
          "tashakkurnoma, sertifikat, minnatdorchilik xati), поля «kimga / nima uchun / tashkilot / sana», печать и PDF; "
          "UZ-латиница, кириллица, RU («благодарственное письмо»). Генерации изображений нет — только вёрстка."),
   honesty_note='Без госсимволики, гербов, печатей и «официальных» бланков ведомств.',
   ramp_extra='Сезон: май ×3,1 и дек ×1,8 — в мае поз. 6 даёт ≈6–11 виз/день; запуск не позже марта'),
 'recommendation': dict(
   title='Tavsiyanoma / recommendation letter (UZ/RU/EN)',
   serp_weak='mixed', fit='c + b', effort='S', honesty='low',
   existing='/uz/blog/tavsifnoma-namuna/ (объясняет отличие от tavsiyanoma; ключи tavsiyanoma не объявлены)',
   serp="Не снят. Прокси «tavsifnoma namuna» (L3): oriftolib, Facebook, Scribd ×5, kursishlari, uzoffice — слабая; англ. запросы — вероятно глобальные сайты.",
   build=("`/uz/hujjatlar/tavsiyanoma-namuna/`: для учёбы за рубежом и работы, структура, образец UZ и EN (recommendation letter sample), "
          "RU-блок, пресет чата «tavsiyanoma loyihasi» по фактам рекомендателя."),
   honesty_note='Подписывает и отвечает рекомендатель; черновик только из его фактов.', ramp_extra='Пик май ×2,45'),
 'motivation_cover': dict(
   title='Motivatsion xat, cover letter, personal statement',
   serp_weak='mixed', fit='b + c', effort='S', honesty='medium', existing='',
   serp="Не снят. Англоязычные ключи в UZ обычно занимают глобальные сайты (Indeed, Zety, Novoresume) — предположение, не проверено.",
   build=("`/uz/blog/motivatsion-xat-namuna/` — структура мотивационного письма для вуза, гранта и работы, 2 образца с плейсхолдерами "
          "(UZ + EN), чек-лист; пресет чата «motivation letter from my facts»."),
   honesty_note='Эссе на грант должно быть своим: AI — редактор, а не автор; прямо сказать на странице.',
   ramp_extra='Сезон подачи: дек–фев (×1,4–1,8)'),
 'career_test': dict(
   title='Kasb tanlash testi + kasblar ro‘yxati',
   serp_weak='mixed', fit='a + c', effort='M', honesty='low', existing='',
   serp="Не снят. «kasblar» (1 300) неоднозначен — английская лексика для детей тоже (линза language-learning), в расчёт не входит.",
   build=("`/uz/kasb-tanlash-testi/` — свой опросник интересов на 36–48 вопросов (модель типов интересов общедоступна, формулировки свои), "
          "результат → список профессий со ссылками; RU-зеркало `/ru/test-na-proforientatsiyu/`."),
   honesty_note='Не психологическая диагностика — дисклеймер.', ramp_extra='Сезон окт–апр, летом ×0,4'),
 'contracts_hold': dict(
   title='Shartnoma namunalari (mehnat, pudrat, oldi-sotdi, ijara) — HOLD',
   serp_weak='strong', fit='c (только нейтральное объяснение)', effort='M', honesty='high', existing='',
   serp=("Снято 2026-10-25. «ijara shartnomasi»: ijara.soliq.uz (договоры аренды регистрируются на портале налоговой), gov.uz/advice, "
         "e-ijara.uz, yurxizmat.uz (шаблоны юристов), lex.uz, Википедия, jet.bank.uz; AIO r5. Госнавигация и юристы. Сильная. "
         "«shartnoma» 8 100 — всплески в авг–сен (до 33 100). Похоже на контракты на обучение в вузах; выдача не снята, это вывод по сезонности."),
   build=("Не строить шаблоны договоров. Максимум — одна нейтральная статья «mehnat shartnomasi nima va unda nima bo‘ladi» со ссылками "
          "на официальные источники (lex.uz, gov.uz), без скачиваемого договора."),
   honesty_note='Юридический YMYL: готовый договор без юриста может навредить.', ramp_extra='HOLD'),
}
ORDER = ['office_docs', 'internship_reports', 'obyektivka', 'cv_builder', 'tilxat_ishonchnoma', 'tarjimai_hol', 'certificates',
         'cyr_ru_mirrors', 'recommendation', 'motivation_cover', 'career_test', 'contracts_hold']

def top_kw_str(c, n=8):
    rows = [r for r in c['keywords'] if r['counted'] and r['vol'] > 0][:n]
    return '; '.join(f"{r['kw']} {fi(r['vol'])}" + (f" (пол {fi(r['floor'])})" if r.get('jump') else '') for r in rows)

hub_ids = ['office_docs', 'internship_reports', 'obyektivka', 'tilxat_ishonchnoma', 'tarjimai_hol', 'certificates']
hub = dict(ads=sum(C[i]['demand_ads_core'] for i in hub_ids), floor=sum(C[i]['demand_floor_core'] for i in hub_ids),
           p6=[sum(C[i]['visits_pos6_ads'][0] for i in hub_ids), sum(C[i]['visits_pos6_ads'][1] for i in hub_ids)],
           p6f=[sum(C[i]['visits_pos6_floor'][0] for i in hub_ids), sum(C[i]['visits_pos6_floor'][1] for i in hub_ids)],
           p3=sum(C[i]['visits_pos3_ads'] for i in hub_ids), p3f=sum(C[i]['visits_pos3_floor'] for i in hub_ids))
susp = C['internship_reports']['demand_susp_upper']
susp_p3 = susp * 0.03593 * 0.655 / 30 * 1.5
susp_p6 = [susp * 0.00613 / 30 * 1.5, susp * 0.01105 / 30 * 1.5]
ex = S['excl_contracts']

L = []
A = L.append
A('# Линза «документы и карьера»: какие кластеры добавить на gptbot.uz')
A('')
A('Дата: 2026-10-25. Вопрос владельца: какие новые темы дадут 1 000–2 000 визитов в день как можно скорее. Эта линза — документы и карьера: '
  'obyektivka (ma’lumotnoma), rezyume/CV, motivatsion xat и cover letter, tavsiyanoma, ish suhbati, shartnoma, buyruq, xizmat xati, '
  'dalolatnoma, ishonchnoma, bildirishnoma, tarjimai hol, amaliyot hisoboti, а также русские «образец заявления / резюме / объяснительной / характеристики».')
A('')
A('Машиночитаемая версия: `docs-career.json`. Расчёт: `docs-career-data/dc_model.py` → `dc_model.json` (вывод `dc_model_out.txt`), сборка: '
  '`dc_build.py`. Сырые замеры: `dc_kw1_metrics.json` (620 ключей), `dc_kw2_metrics.json` (77 ключей), `research1_raw.json` (сиды «namunasi», «образец»), '
  '`dc_serp_top.json` (12 выдач). Список кандидатов: `candidates1.py`; индекс уже снятых ключей: `known_index.py` → `known_all.json`. '
  'Репозиторий только читался; запись только в эту папку.')
A('')
A('## 0. Коротко')
A('')
A('| Сценарий (12 кластеров линзы) | Спрос/мес | Визитов в день |')
A('|---|---:|---:|')
A(f"| Ads-объёмы, все кластеры на поз. ~6 | {fi(S['demand_ads'])} | **{S['pos6_ads'][0]}–{S['pos6_ads'][1]}** |")
A(f"| То же, «пол» (ключи со скачком — по уровню окт–ноя 2025) | {fi(S['demand_floor'])} | {S['pos6_floor'][0]}–{S['pos6_floor'][1]} |")
A(f"| Ads-объёмы, все в топ-3, AIO-дисконт | {fi(S['demand_ads'])} | **{S['pos3_ads']}** |")
A(f"| «Пол», все в топ-3, AIO-дисконт | {fi(S['demand_floor'])} | {S['pos3_floor']} |")
A(f"| Без договоров (HOLD), топ-3 | {fi(ex['demand_ads'])} | {ex['pos3_ads']} (пол {ex['pos3_floor']}) |")
A(f"| Оптимистичная граница: Ads верны, топ-3, без AIO-дисконта | {fi(S['demand_ads'])} | {S['pos3_no_aio_ads']} |")
A(f"| Аномалия «amaliyot kundaligi to‘ldirish» 110 000, если она реальна (поз. 6 / топ-3) | +{fi(susp)} | +{round(susp_p6[0])}–{round(susp_p6[1])} / +{round(susp_p3)} |")
A('')
A(f"1. **Документы и карьера сами по себе 1 000 визитов в день не дадут.** Все 12 кластеров даже в топ-3 — ≈{S['pos3_floor']}–{S['pos3_ads']} визитов в день, "
  f"на поз. ~6 — ≈{S['pos6_floor'][0]}–{S['pos6_ads'][1]}. Это прибавка к прежнему потолку (≈650–1 100 в топ-3, `demand-sizing.md`), а не замена ему. "
  f"Спрос здесь широкий, но мелкий: {fi(S['demand_ads'])} запросов в месяц по Ads размазаны по 313 ключам, и только у 31 из них объём от 1 000.")
A(f"2. **Главный ход линзы — один хаб «Ish qog‘ozlari namunalari» с общим генератором.** Шесть кластеров (служебные документы, дневник и отчёт практики, obyektivka, "
  f"tilxat/ishonchnoma, tarjimai hol, бланки грамот) строятся на одном движке «поля → текст латиницей и кириллицей → печать/.docx». "
  f"Вместе это {fi(hub['ads'])} в месяц по Ads (пол {fi(hub['floor'])}), {fd(hub['p6'][0])}–{fd(hub['p6'][1])} визитов в день на поз. 6 и ≈{round(hub['p3'])} в топ-3 "
  f"(по полу {round(hub['p3f'])}). Выдачи почти везде слабые: Scribd, платные файлы soff/doclab/diplomishi, словари, YouTube-уроки.")
A("3. **Откуда спрос и почему он растёт.** Выдачи «bildirishnoma», «tarjimai hol», «tilxat yozish» состоят из уроков «Davlat tilida ish yuritish» и школьных вопросов "
  "про «ish qog‘ozlari» (ariza, bildirishnoma, tilxat, tushuntirish xati, bayonnoma, ishonchnoma). У запросов вида «X yozish / X namuna» с декабря 2025 рост "
  "в 5–50 раз и пики в апреле–мае. Значит, спрос идёт от учебной программы, а провал — в июле–августе. Страницы, запущенные до февраля, успеют разогнаться к пику 2027 года.")
A(f"4. **Самое быстрое по разгону** (≥2 визитов в день на поз. 6 за 9–15 недель): служебные документы ({C['office_docs']['weeks_to_2_ads']} нед), дневник практики "
  f"({C['internship_reports']['weeks_to_2_ads']} нед по Ads), tilxat ({C['tilxat_ishonchnoma']['weeks_to_2_ads']} нед по Ads), obyektivka ({C['obyektivka']['weeks_to_2_ads']} нед). "
  "Кластеры 6–8 выходят на 2 визита в день только через 18–23 недели, а 9–11 без топ-3 не дают и этого.")
A("5. **Не строить:** шаблоны договоров (ijara/mehnat/oldi-sotdi — в выдаче госпорталы soliq.uz и gov.uz и юристы, юридический YMYL). «shartnoma» 8 100 "
  "по сезонности похож на вузовские контракты (всплеск авг–сен, выдача не снята). Ish suhbati, staj/oylik-калькуляторы, buyruq/приказ и tijorat taklifi — "
  "меньше 2 000 в месяц каждый (§5).")
A(f"6. **Быстрый выигрыш без новых страниц.** Действующие гайды не объявили близкие варианты своих ключей: «ariza» 4 400, «tushuntirish xati namuna» 2 400, "
  "«rezyume namunasi» 1 600, «rezyume yozish namunasi» 1 600, «o‘quvchiga tavsifnoma» 590 и др. (§4). Это не новый спрос, а донастройка уже живых страниц, "
  "и в итоги линзы он не входит.")
A('')
A('## 1. Метод')
A('')
A('**Спрос.** Google Ads через OpenSEO, location 2860, `search_volume` = среднее за 12 месяцев (окт 2025 … сен 2026). Уже снятые ключи взяты повторно и второй раз '
  'не оплачивались: `l3-data/kw1_metrics.json`, `kw2_metrics.json`, `roadmap-1000/data/kw3_metrics.json`, `kw4_metrics.json`, '
  '`education-practice-data/ep_kw1_metrics.json` и все остальные JSON в `docs/seo/research` (индекс `known_all.json`, 4 503 ключа). '
  'Новые ключи: два вызова `get_keyword_metrics` (620 + 77 ключей: UZ латиница, UZ кириллица, RU, EN).')
A('')
A('**`research_keywords`.** Сид «namunasi» вернул 1 строку; сид «образец» — 500 строк, почти все про деловые бумаги РФ по 10–70 в месяц '
  '(«автобиография образец» 390, «коммерческое предложение образец» 210, «гарантийное письмо» 110). Русские «образец X» в Узбекистане — мелочь. '
  'Поэтому основной поиск идей — ручной список (`candidates1.py`).')
A('')
A('**Дедупликация.** Одинаковые объём и 12-месячный ряд (объём ≥100) — одна корзина Google Ads; считается один раз на всю линзу. Так слиты obyektivka namuna = '
  'obyektivka namunasi, ma’lumotnoma namuna = …namunasi = malumotnoma namuna = ma lumotnoma namuna, объективка = обьективка, tarjimai hol = tarjimayi hol, '
  'tilxat namuna = tilxat namunasi, hisobot namuna = hisobot namunasi, recommendation letter = letter of recommendation, и «тавсиянома намуна» = «тавсифнома намуна» '
  '(одна корзина; засчитана один раз в кластере 8).')
A('')
A('**«Пол».** Ключ считается «со скачком», если среднее за июль–сентябрь 2026 хотя бы в 5 раз больше среднего за октябрь–ноябрь 2025 (при объёме ≥500). '
  'Для таких ключей «пол» = уровень октября–ноября 2025; у остальных «пол» равен Ads-среднему. Правило то же, что в линзе education-practice.')
A('')
A('**Роли ключей.** core — в расчёте; head — голые или неоднозначные запросы (cv, resume, резюме, характеристика, заявление, доверенность, ma’lumotnoma, hisobot, '
  'kasblar, shartnoma), только верхняя граница; susp — аномальная корзина («amaliyot kundaligi to‘ldirish» 110 000), только верхняя граница; existing — ключи, '
  'которыми уже владеют живые гайды; в новый спрос они не входят.')
A('')
A('**Визиты.** Визиты в день = спрос × CTR × дисконт / 30 × 1,5 (1 клик Google ≈ 1,5 визита, roadmap §1.1). CTR взяты по собственной кривой сайта:')
A('- поз. ~6: 0,613–1,105%, без отдельного AIO-дисконта (кривая снята на выдачах с AIO);')
A('- поз. ~3: 3,593% × 0,533, если AIO на r1 («cv nima», «tarjimai hol»), иначе × 0,655 (AIO ниже или выдача не снята).')
A('')
A('**Разгон (допущение).** В месяц n страница получает min(1; K1 × n^1,6) от прогноза поз. 6. K1 = 0,04 — статья или выдача не снята '
  '(калибровка 7 школьных гайдов, K≈0,04 в первый месяц); 0,06 — коллекция шаблонов на снятой слабой выдаче; 0,08 — интерактивный инструмент на слабой '
  'выдаче. 0,06 и 0,08 не откалиброваны. Всё при условии, что поз. ~6 вообще достигнута; доменов-доноров у сайта ≈8–10.')
A('')
A('**SERP.** Два вызова `get_serp_results` (desktop, hl=ru, depth 10): 10 запросов + 2 запроса. «obyektivka namuna», «tavsifnoma namuna», «dalolatnoma namuna» '
  'взяты из L3 (24.10) и второй раз не оплачивались.')
A('')
A('**Кредиты.** Лимит линзы — 600. `whoami`: 20 700 до работы → 18 846 после (−1 854), но параллельно тратили другие линзы: между двумя моими замерами '
  'баланс падал на 476 при одном моём SERP-вызове. Моя оценка: research ≈192 (2 сида × ≈96), metrics 2 × 104 = 208, SERP ≈30–60, итого ≈430–460 из 600.')
A('')
A('## 2. Две оговорки, которые меняют цифры')
A('')
A('| Ключ | окт / ноя 2025 | сен 2026 | Ads (среднее 12 мес) | Статус |')
A('|---|---:|---:|---:|---|')
def rowser(kw, status):
    r = None
    for c in M['clusters']:
        for k in c['keywords']:
            if k['kw'] == kw:
                r = k
    if r is None:
        return
    s = r.get('ser') or []
    A(f"| {kw} | {fi(s[0])} / {fi(s[1])} | {fi(s[11])} | {fi(r['vol'])} | {status} |")
rowser('amaliyot kundaligi', 'core, пол 490')
A("| amaliyot kundaligi to‘ldirish | 30 / 1 900 | 165 000 (июн 246 000) | 110 000 | susp, вне расчёта |")
rowser('тилхат', 'core, пол 230')
rowser('tilxat yozish', 'core, пол 290')
rowser('hisobot yozish', 'core, пол 345')
rowser('cv nima', 'core, пол 290')
rowser('тушунтириш хати', 'core, пол 655')
rowser('bildirishnoma yozish', 'core, пол 190')
A('')
A('- **Скачок.** Рост в десятки раз (у «amaliyot kundaligi» — до ×230) с декабря 2025 только у узбекских документных запросов вида «X yozish / X namuna / кириллица». У запросов без учебной привязки '
  '(cv maker, резюме шаблон, ishonchnoma, faxriy yorliq) ряды ровные. Самое правдоподобное объяснение — тема «ish qog‘ozlari» в школьной и вузовской программе: '
  'выдачи «tilxat yozish» и «bildirishnoma» состоят из уроков «Davlat tilida ish yuritish» и школьных вопросов. Подтвердить по данным нельзя.')
A('- **«amaliyot kundaligi to‘ldirish» 110 000 в месяц.** Это больше, чем все остальные ключи линзы вместе. Выдача документная (Scribd, soff, методички вузов), '
  'то есть намерение настоящее, но масштаб неправдоподобен для страны, где студентов порядка миллиона. В расчёт не входит. Проверка дешёвая: одна страница '
  '`/uz/hujjatlar/amaliyot-kundaligi/` и через 4–6 недель сравнить показы GSC с Ads. Если при средней позиции ≤20 показы не дотягивают даже до 5–10% от Ads, '
  'правдив «пол».')
A('')
A('## 3. Сводка кластеров (порядок = рекомендуемый приоритет)')
A('')
A('| # | Кластер | Спрос Ads (пол) | SERP | Fit | Effort | Честность | Визиты/день поз. ~6 | поз. ~3 | ≥2 виз/день на поз. 6 |')
A('|---|---|---:|---|---|---|---|---:|---:|---|')
for i, cid in enumerate(ORDER, 1):
    c, n = C[cid], N[cid]
    w2 = c['weeks_to_2_ads']
    w2t = '—' if w2 is None else (f"{w2} нед" + ('' if c['weeks_to_2_floor'] == w2 else (f" (пол {c['weeks_to_2_floor']})" if c['weeks_to_2_floor'] else ' (пол —)')))
    A(f"| {i} | {n['title']} | {dem(c)} | {n['serp_weak']} | {n['fit']} | {n['effort']} | {n['honesty']} | {v6(c)} | {v3(c)} | {w2t} |")
A(f"| | **Итого (12)** | **{fi(S['demand_ads'])} ({fi(S['demand_floor'])})** | | | | | **{S['pos6_ads'][0]}–{S['pos6_ads'][1]} ({S['pos6_floor'][0]}–{S['pos6_floor'][1]})** | **{S['pos3_ads']} ({S['pos3_floor']})** | |")
A('')
A('## 4. Карточки кластеров')
for i, cid in enumerate(ORDER, 1):
    c, n = C[cid], N[cid]
    A('')
    A(f"### {i}. {n['title']}")
    A('')
    A('- **Ключи (Ads/мес):**')
    for ln in kwlines(c):
        A(ln)
    extra = []
    if c['head']:
        extra.append('head (верхняя граница): ' + ', '.join(f"{k} {fi(v)}" for k, v in c['head']))
    if c.get('susp'):
        extra.append('susp: ' + ', '.join(f"{k} {fi(v)}" for k, v in c['susp']))
    ex_big = [(k, v) for k, v in c['existing'] if v >= 100]
    if ex_big:
        extra.append('уже у живой страницы: ' + ', '.join(f"{k} {fi(v)}" for k, v in ex_big))
    if c['excl']:
        extra.append('исключено: ' + ', '.join(c['excl']) + ' (навигация на сайт-конкурент)')
    for e in extra:
        A(f"  - {e}")
    hs = c['demand_head_upper'] + c.get('demand_susp_upper', 0)
    A(f"- **Спрос:** {fi(c['demand_ads_core'])} по Ads" + (f", пол {fi(c['demand_floor_core'])}" if c['demand_floor_core'] != c['demand_ads_core'] else '')
      + (f", верхняя граница {fi(c['demand_ads_core'] + hs)}" if hs else '') + '.')
    A(f"- **Сезонность:** {season_text(c)}.")
    A(f"- **SERP ({n['serp_weak']}):** {n['serp']}")
    A(f"- **Что строить:** {n['build']}")
    if n.get('existing'):
        A(f"- **Связь с живыми страницами:** {n['existing']}.")
    A(f"- **Effort:** {n['effort']}. **Честность:** {n['honesty']} — {n['honesty_note']}")
    A(f"- **Визиты/день:** поз. 6 — {v6(c)}; поз. 3 — {v3(c)}; без AIO-дисконта — {fd(c['pos3_no_aio_ads'])}.")
    A(f"- **Разгон:** {ramp_text(c, n['ramp_extra'])}.")
A('')
A('## 5. Проверено и ниже порога (в топ-12 не вошло)')
A('')
A('| Кластер | Спрос Ads (core) | Верхняя граница | Поз. ~3, виз/день | Почему ниже |')
A('|---|---:|---:|---:|---|')
why = {'business_proposal': '«biznes taklif» 3 600 — смысл не проверен (возможно, бизнес-идеи; CPC 9,41); счета-фактуры в Узбекистане выписываются в электронной системе, шаблон не нужен',
       'interview': 'узбекские «ish suhbati savollari», «ishga kirish suhbati» — 0; «intervyu» 880 неоднозначен (вероятно, интервью в СМИ; не проверено)',
       'invitation_text': '«taklifnoma» 2 900 — конструкторы свадебных приглашений (mytaklif, taklifiy, e-taklif) и Pinterest; текстовая часть мала',
       'hr_calcs': 'стаж и зарплата — 760 в сумме; налоговые расчёты близки к YMYL',
       'hr_orders': 'buyruq 720, приказ 210; кадровые приказы — для кадровиков, мелко'}
for cid, c in X.items():
    A(f"| {c['name']} | {fi(c['demand_ads_core'])} | {fi(c['demand_ads_core'] + c['demand_head_upper'])} | {fd(c['visits_pos3_ads'])} | {why[cid]} |")
A('')
A('Нулевой спрос (Ads 0 или пусто): все узбекские варианты «ishdan bo‘shash uchun ariza», «ta’til uchun ariza», «ishga kirish uchun ariza», «ish suhbati savollari», '
  '«motivatsion xat yozish», «el yurt umidi motivatsion xat», «cv ingliz tilida», «ingliz tilida rezyume», «obyektivka shakli/blanka/2026», «davlat tilida ish yuritish», '
  '«ish qog‘ozlari namunalari», «obyektivka generator», «rezyume generator», «kasbga yo‘naltirish test». Полный список — `docs-career-data/dc_kw1_table.txt` (156 нулевых в первом вызове) и `dc_kw2_metrics.json` (28 пустых во втором).')
A('')
A('## 6. Порядок запуска')
A('')
A('1. **Недели 1–3.** Хаб `/uz/hujjatlar/` + общий генератор + 4 страницы на слабых выдачах: bildirishnoma, dalolatnoma, bayonnoma, tilxat. '
  'Плюс кириллические блоки в трёх живых гайдах и объявление недостающих вариантов ключей (§0 п. 6) в intent-manifest и demand-policy.')
A('2. **Недели 3–5.** Пилот `/uz/hujjatlar/amaliyot-kundaligi/` (проверка аномалии §2), tarjimai hol, kafolat xati, raport, e’lon.')
A('3. **Недели 5–8.** Генератор obyektivka (после решения O-05) и бланки грамот (успеть к маю).')
A('4. **Дальше.** Конструктор CV + RU «образец резюме» + «CV nima»; RU-страницы объяснительной, заявления, характеристики; tavsiyanoma, motivatsion xat, kasb tanlash testi.')
A('5. **Не делать:** шаблоны договоров и доверенностей на авто/недвижимость.')
A('')
A('Через 6–8 недель — сверка показов GSC с Ads по ключам со скачком. Если подтверждается «пол», линза даёт ≈'
  f"{S['pos6_floor'][0]}–{S['pos6_floor'][1]} визитов в день на поз. 6 и ≈{S['pos3_floor']} в топ-3.")
open(os.path.join(OUT, 'docs-career.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')

# ---------- JSON ----------
def ramp_short(c, n):
    def w(a, b):
        if a is None and b is None:
            return 'не достигает'
        if b is None:
            return f"{a} нед (пол: не достигает)"
        return f"{a} нед" if a == b else f"{a} нед (пол {b})"
    return (f"K1={c['k1']}; ≥2 виз/день: {w(c['weeks_to_2_ads'], c['weeks_to_2_floor'])}; ≥5: {w(c['weeks_to_5_ads'], c['weeks_to_5_floor'])}"
            + (f"; {n['ramp_extra']}" if n['ramp_extra'] else ''))

clusters_json = []
for i, cid in enumerate(ORDER, 1):
    c, n = C[cid], N[cid]
    clusters_json.append(dict(
        rank=i, id=cid, name=n['title'], keywords_top=top_kw_str(c, 10),
        keywords=[dict(kw=r['kw'], vol=r['vol'], counted=r['counted'], floor=r.get('floor'), jump=r.get('jump'),
                       same_bucket_as=r.get('same_bucket_as'), script=script(r['kw'])) for r in c['keywords']],
        head=c['head'], susp=c.get('susp', []), existing_page_keys=c['existing'],
        demand_month_ads=c['demand_ads_core'], demand_month_floor=c['demand_floor_core'],
        demand_upper=c['demand_ads_core'] + c['demand_head_upper'] + c.get('demand_susp_upper', 0),
        seasonality_index=c['seasonality_index'], seasonality=season_text(c),
        serp=n['serp'], serp_weakness=n['serp_weak'], fit=n['fit'], build=n['build'], existing_url=n['existing'],
        effort=n['effort'], honesty_risk=n['honesty'], honesty_note=n['honesty_note'],
        visits_day_pos6=v6(c), visits_day_pos3=v3(c), visits_pos6_ads=c['visits_pos6_ads'], visits_pos6_floor=c['visits_pos6_floor'],
        visits_pos3_ads=c['visits_pos3_ads'], visits_pos3_floor=c['visits_pos3_floor'], pos3_no_aio_ads=c['pos3_no_aio_ads'],
        aio_factor=c['aio'], k1=c['k1'], ramp=ramp_short(c, n),
        weeks_to_2=[c['weeks_to_2_ads'], c['weeks_to_2_floor']], weeks_to_5=[c['weeks_to_5_ads'], c['weeks_to_5_floor']]))
out = dict(
    lens='docs-career', date='2026-10-25', location=2860,
    method=dict(model='visits/day = demand x CTR x AIO / 30 x 1.5; pos6 CTR 0.613-1.105%; pos3 3.593% x 0.533 (AIO r1) / 0.655',
                floor='mean(Jul-Sep 2026)/mean(Oct-Nov 2025) >= 5 and vol >= 500 -> floor = mean(Oct-Nov 2025)',
                dedupe='identical volume + 12-month series (vol >= 100) = one bucket, counted once per lens',
                ramp='share of pos-6 forecast in month n = min(1, K1*n^1.6); K1 0.04 article/unsnapped, 0.06 templates on weak snapped SERP, 0.08 tool on weak snapped SERP',
                credits='cap 600; own estimate ~430-460 (research 2 seeds ~192, metrics 2x104, SERP 12 queries depth 10 ~30-60); account 20 700 -> 18 846 incl. parallel lenses'),
    summary=dict(demand_ads=S['demand_ads'], demand_floor=S['demand_floor'], demand_head_upper=S['demand_head'], demand_susp_upper=S['demand_susp'],
                 visits_pos6_ads=S['pos6_ads'], visits_pos6_floor=S['pos6_floor'], visits_pos3_ads=S['pos3_ads'], visits_pos3_floor=S['pos3_floor'],
                 visits_pos3_no_aio=S['pos3_no_aio_ads'], excl_contracts=ex,
                 hub_six_clusters=dict(ids=hub_ids, demand_ads=hub['ads'], demand_floor=hub['floor'], pos6_ads=[round(hub['p6'][0], 1), round(hub['p6'][1], 1)],
                                       pos6_floor=[round(hub['p6f'][0], 1), round(hub['p6f'][1], 1)], pos3_ads=round(hub['p3'], 1), pos3_floor=round(hub['p3f'], 1)),
                 anomaly=dict(keyword="amaliyot kundaligi to'ldirish", ads=susp, pos6=[round(susp_p6[0]), round(susp_p6[1])], pos3=round(susp_p3)),
                 existing_page_keys=dict(note='keys owned by or natural variants of live guides (rezyume-tayyorlash, tushuntirish-xati-va-ariza-yozish, tavsifnoma-namuna, rasmiy-xat-yozish); not counted as new demand. Not declared in intent-manifest owns: ariza, tushuntirish xati namuna, rezyume namunasi, rezyume yozish namunasi, o\'quvchiga tavsifnoma, ariza blanka, tavsifnoma namunasi word, rezume/rezume namuna',
                                         keys=S['existing_pages_undeclared'])),
    clusters=clusters_json,
    below_threshold=[dict(id=cid, name=c['name'], demand_ads=c['demand_ads_core'], demand_upper=c['demand_ads_core'] + c['demand_head_upper'],
                          visits_pos3_ads=c['visits_pos3_ads'], why=why[cid]) for cid, c in X.items()],
    serp_file='docs-career-data/dc_serp_top.json')
json.dump(out, open(os.path.join(OUT, 'docs-career.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('written', os.path.join(OUT, 'docs-career.md'), os.path.join(OUT, 'docs-career.json'))
for cj in clusters_json:
    print(cj['rank'], cj['id'], cj['demand_month_ads'], cj['visits_day_pos6'], cj['visits_day_pos3'], cj['ramp'])
