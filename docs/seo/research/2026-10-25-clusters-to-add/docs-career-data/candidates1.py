"""Hand-built candidate list for the docs-career lens (location 2860 idea expansion only returns rows containing the seed,
so discovery is a hand list hydrated by one get_keyword_metrics call). Keywords already measured anywhere in
docs/seo/research or content/seo/demand-policy.json are skipped (known_all.json from known_index.py).
Writes candidates1.json {"tags": {kw: cluster}, "to_measure": [...]}.
Run: py -3 -I candidates1.py
"""
import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
known = json.load(open(os.path.join(HERE, 'known_all.json'), encoding='utf-8'))

C = {}
C['obyektivka'] = """obyektivka shakli|obyektivka blanka|obyektivka blanki|obyektivka word|obyektivka word formatda|obyektivka yuklab olish|
obyektivka tayyorlash|obyektivka to'ldirish|obyektivka toldirish|obyektivka namunasi word|obyektivka namunasi yuklab olish|obyektivka namuna word|
obyektivka 2026|obyektivka 2025|obyektivka online|obyektivka yaratish|obyektivka qilish|obyektivka shablon|obyektivka nima|obyektivka namunasi 2026|
obektivka|obektivka namuna|obyektiv namuna|ob'ektivka|ob'ektivka namuna|objektivka|obyektivka uz|obyektivka namunalari|obyektivka namuna pdf|
объективка|объективка образец|обьективка|обьективка намуна|объективка намуна|объективка намунаси|объективка шакли|объективка узбекистан|
маълумотнома|маълумотнома намуна|ma'lumotnoma|malumotnoma|malumotnoma namuna|ma lumotnoma namuna|ma'lumotnoma namunasi|ma'lumotnoma shakli|
ma'lumotnoma yozish|ish joyidan ma'lumotnoma|ish joyidan malumotnoma namuna|kadrlar hisobi varaqasi|личный листок по учету кадров|
личный листок по учету кадров образец|справка объективка|obyektivka rasm bilan|obyektivka qanday yoziladi|obyektivka to'ldirish namunasi"""
C['rezyume_cv'] = """rezyume namunasi|rezyume shablon|rezyume shabloni|rezyume yozish|rezyume yozish namunasi|rezyume qanday yoziladi|rezyume yaratish|
rezyume online|rezyume word|rezyume namuna word|rezyume namunasi word|rezyume yuklab olish|ishga rezyume|ishga kirish uchun rezyume|
rezyume namunasi ishga kirish uchun|rezyume uzbek tilida|rezyume o'zbek tilida|rezyume ozbek tilida|rezyume nima|rezume|rezume namuna|resume|
resume namuna|resume tayyorlash|rezyume bepul|cv|cv namuna|cv namunasi|cv tayyorlash|cv yozish|cv yaratish|cv nima|cv template|cv example|
cv format|cv in english|cv for job|cv sample|cv maker|cv online|cv yasash|resume template|resume example|resume format|resume builder|resume maker|
how to write a cv|how to write cv|cv for students|cv ingliz tilida|ingliz tilida rezyume|inglizcha rezyume|cv namuna ingliz tilida|резюме|резюме образец|
образец резюме|резюме пример|пример резюме|резюме шаблон|шаблон резюме|резюме на работу|резюме на работу образец|как написать резюме|
как составить резюме|составить резюме|создать резюме|резюме онлайн|конструктор резюме|резюме бланк|бланк резюме|резюме скачать|
резюме образец скачать|резюме word|резюме образец word|резюме образец узбекистан|резюме ташкент|резюме для студента|резюме без опыта работы|
о себе в резюме|навыки в резюме|личные качества в резюме|резюме на английском|резюме на узбекском|нейросеть резюме|rezyume ai|cv ai|ai resume|
резюме менеджера|резюме бухгалтера|резюме продавца|резюме учителя|резюме водителя|резюме программиста|o'qituvchi rezyume namunasi|
резюме намуна|резюме намунаси|резюме тайёрлаш|резюме ёзиш|o'zim haqimda|o'zim haqimda yozish|cv yozish namunasi|rezyume tuzish|rezyume to'ldirish"""
C['motivation_cover'] = """motivatsion xat|motivatsion xat namunasi|motivatsion xat namuna|motivatsion xat yozish|motivatsiya xati|motivatsion xat ingliz tilida|
motivation letter|motivation letter example|motivation letter sample|motivation letter for university|motivation letter for scholarship|
motivation letter for master|motivation letter for job|how to write motivation letter|мотивационное письмо|мотивационное письмо пример|
мотивационное письмо на английском|как написать мотивационное письмо|cover letter|cover letter example|cover letter sample|cover letter for job|
how to write a cover letter|cover letter template|сопроводительное письмо|сопроводительное письмо к резюме|как написать сопроводительное письмо|
personal statement|personal statement example|statement of purpose|essay for scholarship|scholarship essay|magistratura motivatsion xat|
magistraturaga motivatsion xat|el yurt umidi motivatsion xat|el yurt umidi esse|grant uchun esse|motivation letter namuna|мотивацион хат"""
C['recommendation'] = """recommendation letter|recommendation letter sample|recommendation letter for student|letter of recommendation|reference letter|
рекомендательное письмо|рекомендательное письмо пример|рекомендательное письмо от работодателя|рекомендательное письмо студенту|tavsiyanoma|
tavsiyanoma namuna|tavsiyanoma namunasi|tavsiyanoma yozish|tavsiya xati|tavsiya xati namuna|tavsiyanoma ingliz tilida|тавсиянома|тавсиянома намуна|
rekomendatsiya xati|rekomendatsiya|recommendation letter namuna|taqdimnoma|taqdimnoma namuna|taqdimnoma namunasi"""
C['interview'] = """ishga kirish suhbati|ishga kirish suhbati savollari|ish suhbati|ish suhbati savollari|suhbat savollari|intervyu savollari|intervyu|
ishga kirish savollari|ishga kirish uchun savollar|ish suhbatidan qanday o'tish|собеседование|вопросы на собеседовании|
вопросы на собеседовании и ответы|как пройти собеседование|вопросы работодателю на собеседовании|расскажите о себе собеседование|
почему вы хотите работать у нас|сильные и слабые стороны собеседование|собеседование вопросы и ответы|частые вопросы на собеседовании|
interview questions|job interview questions|interview questions and answers|tell me about yourself|tell me about yourself answer|
common interview questions|interview in english|ingliz tilida intervyu|собеседование на английском|собеседование в банк вопросы|
bank suhbat savollari|davlat xizmati test|davlat xizmatiga kirish test|davlat xizmatchilari test|davlat xizmatiga test savollari|
davlat xizmati test savollari|суҳбат саволлари|ish suhbati savol javob"""
C['shartnoma'] = """shartnoma|shartnoma namunasi|shartnoma tuzish|shartnoma yozish|ijara shartnomasi|ijara shartnomasi namunasi|ijara shartnomasi namuna|
uy ijara shartnomasi|oldi sotdi shartnomasi|oldi-sotdi shartnomasi namunasi|mehnat shartnomasi|mehnat shartnomasi namunasi|mehnat shartnomasi namuna|
qarz shartnomasi|qarz shartnomasi namunasi|xizmat ko'rsatish shartnomasi|xizmat ko'rsatish shartnomasi namunasi|pudrat shartnomasi|hadya shartnomasi|
avtomobil oldi sotdi shartnomasi|shartnoma bekor qilish|шартнома|шартнома намуна|ижара шартномаси|меҳнат шартномаси|договор|трудовой договор|
трудовой договор узбекистан|договор аренды|договор аренды квартиры|договор купли продажи|договор займа|договор займа образец|расписка|
расписка образец|расписка в получении денег|tilxat|tilxat namuna|tilxat namunasi|tilxat yozish|qarz tilxat|qarz tilxati namunasi|shartnoma namunalari|
mehnat shartnomasi namunasi word|ijara shartnomasi word"""
C['buyruq_hr'] = """buyruq|buyruq namunasi|buyruq namuna|buyruq yozish|buyruq shakli|ishga qabul qilish buyrug'i|ishga qabul qilish buyrugi namunasi|
ishdan bo'shatish buyrug'i|ishdan bo'shatish buyrugi namuna|ta'til buyrug'i|mehnat ta'tili buyrug'i|buyruq loyihasi|farmoyish namunasi|приказ|
приказ образец|приказ о приеме на работу|приказ об увольнении|приказ об отпуске|приказ о назначении|буйруқ|буйруқ намуна|kadrlar bo'limi hujjatlari|
lavozim yo'riqnomasi|lavozim yo'riqnomasi namunasi|lavozim yoriqnomasi|должностная инструкция|должностная инструкция образец|
ichki mehnat tartib qoidalari|mehnat daftarchasi|shtat jadvali|shtat jadvali namunasi|buyruq namunalari|kadrlar ishi"""
C['xizmat_hujjatlar'] = """xizmat xati|xizmat xati namunasi|bildirishnoma|bildirishnoma namunasi|bildirishnoma yozish|bildirishnoma xati|dalolatnoma|
dalolatnoma namunasi|dalolatnoma yozish|dalolatnoma shakli|qabul qilish topshirish dalolatnomasi|dalolatnoma tuzish|bajarilgan ishlar dalolatnomasi|
далолатнома|далолатнома намуна|билдиришнома|билдиришнома намуна|raport|raport namunasi|raport yozish|рапорт|рапорт образец|hisobot|hisobot namunasi|
hisobot yozish|oylik hisobot namunasi|ish hisoboti namunasi|yillik hisobot namunasi|служебная записка|служебная записка образец|докладная записка|
kafolat xati|kafolat xati namunasi|kafolat xati namuna|гарантийное письмо образец|minnatdorchilik xati|minnatdorchilik xati namunasi|rahmatnoma|
rahmatnoma namuna|tashakkurnoma|tashakkurnoma namunasi|благодарственное письмо|faxriy yorliq|faxriy yorliq namuna|bayonnoma|bayonnoma namunasi|
yig'ilish bayonnomasi|majlis bayonnomasi|протокол собрания образец|spravka namuna|справка с места работы образец|справка образец|
dalolatnoma namunalari|bildirishnoma namunalari|hisobot namunalari|xizmat xati yozish"""
C['ishonchnoma'] = """ishonchnoma|ishonchnoma namunasi|ishonchnoma yozish|ishonchnoma shakli|avtomobil ishonchnoma|mashina ishonchnoma|ishonchnoma notariussiz|
oddiy yozma ishonchnoma|ishonchnoma blanka|ишончнома|ишончнома намуна|доверенность|доверенность образец|доверенность на автомобиль|
доверенность от физического лица|доверенность на получение|доверенность узбекистан|ishonch xati|ishonchnoma namunalari"""
C['ariza_types'] = """ariza|ariza namuna|ariza yozish namuna|ariza shakli|ariza blanka|ishdan bo'shash uchun ariza|ishdan bo'shash ariza namunasi|
ishdan bo'shash arizasi|o'z xohishiga ko'ra ishdan bo'shash ariza|ta'til uchun ariza|ta'til arizasi namunasi|mehnat ta'tili ariza|ishga kirish uchun ariza|
ishga qabul qilish ariza namunasi|ishga ariza|o'qishga ariza|maktabga ariza|maktabga ariza namunasi|bog'chaga ariza|moddiy yordam ariza|
moddiy yordam so'rab ariza namunasi|hokimga ariza|hokimiyatga ariza|sudga ariza|ariza namunasi word|ariza qanday yoziladi|akademik ta'til ariza|
o'qishni ko'chirish ariza|javob xati|application letter|ариза|ариза намуна|ариза ёзиш|ариза намунаси|заявление|заявление образец|образец заявления|
заявление на отпуск|заявление на увольнение|заявление на увольнение по собственному желанию|заявление о приеме на работу|заявление на работу|
как написать заявление|заявление на материальную помощь|заявление на отгул|заявление в школу|заявление на имя директора|ariza namunalari|
ishdan bo'shash ariza|ishdan boshash ariza|ariza yozish ishdan bo'shash|ariza yozish ta'til"""
C['tushuntirish'] = """объяснительная|объяснительная записка|объяснительная образец|объяснительная записка образец|объяснительная на работу|
объяснительная за опоздание|объяснительная в школу|как написать объяснительную|тушунтириш хати|тушунтириш хати намуна|tushuntirish xati namuna|
tushuntirish xati ishga kechikkanlik|tushuntirish xati maktab|tushuntirish xati yozish namunasi|tushuntirish xati namunalari|tushuntirish xati maktabga"""
C['tavsifnoma'] = """характеристика|характеристика образец|характеристика на ученика|характеристика на ученика образец|характеристика с места работы|
характеристика с места работы образец|характеристика на сотрудника|характеристика на студента|характеристика на студента с практики|
характеристика учителя|характеристика на работника|производственная характеристика|характеристика для военкомата|xarakteristika|
характеристика намуна|тавсифнома|тавсифнома намуна|o'quvchiga tavsifnoma|o'quvchiga tavsifnoma namuna|talabaga tavsifnoma|ish joyidan tavsifnoma|
xodimga tavsifnoma|o'qituvchiga tavsifnoma|amaliyotdan tavsifnoma|tavsifnoma namunasi word|tavsifnoma namunalari|tavsifnoma yozish namuna"""
C['avtobiografiya'] = """avtobiografiya|avtobiografiya namuna|avtobiografiya namunasi|avtobiografiya yozish|tarjimai hol|tarjimai hol namunasi|tarjimai hol yozish|
tarjimai hol namuna|o'z tarjimai holi|автобиография|как написать автобиографию|автобиография пример|таржимаи ҳол|таржимаи ҳол намуна|автобиография намуна|
tarjimayi hol|tarjimai xol|tarjimai hol yozish namunasi"""
C['amaliyot_hisobot'] = """amaliyot hisoboti|amaliyot hisoboti namuna|amaliyot hisobot namunasi|o'quv amaliyoti hisoboti|malakaviy amaliyot hisoboti|
ishlab chiqarish amaliyoti hisoboti|pedagogik amaliyot hisoboti|amaliyot kundaligi|amaliyot kundaligi namuna|отчет по практике|отчет по практике образец|
дневник практики|дневник практики образец|amaliyot hisoboti namunasi|amaliyot daftari|malaka amaliyoti hisoboti|amaliyot hisoboti yozish"""
C['career_tools'] = """ish staji hisoblash|staj hisoblash|mehnat staji hisoblash|стаж калькулятор|калькулятор стажа|ish haqi hisoblash|oylik hisoblash|
oylik maosh hisoblash|zarplata kalkulyator|калькулятор зарплаты|калькулятор зарплаты узбекистан|ta'til puli hisoblash|ta'til kunlari hisoblash|
отпускные калькулятор|kasb tanlash|kasb tanlash test|kasb tanlash testi|kasbga yo'naltirish test|qaysi kasb menga mos|kasblar ro'yxati|
профориентация тест|тест на профориентацию|профориентационный тест|тест на профессию|какая профессия мне подходит|career test|kasblar|
kelajak kasblari|eng ko'p maosh oladigan kasblar|eng yaxshi kasblar|kasb tanlash testi online|ish staji|staj kalkulyator|soliq hisoblash|
daromad solig'i hisoblash|kasbiy test|psixologik test ishga kirish"""
C['business_docs'] = """tijorat taklifi|tijorat taklifi namuna|tijorat taklifi namunasi|коммерческое предложение|invoys namuna|invoice namuna|hisob faktura|
hisob faktura namuna|hisob-faktura namunasi|счет фактура образец|счет на оплату образец|yuk xati namuna|prays list namuna|tijorat taklifi yozish|
коммерческое предложение пример|biznes taklif|hamkorlik taklifi xati|hamkorlik shartnomasi"""
C['letters_misc'] = """biznes xat|elektron xat yozish|email yozish|ish xati|rasmiy email|formal letter|formal letter example|informal letter|how to write an email|
taklifnoma|taklifnoma matni|taklifnoma namuna|to'y taklifnoma matni|e'lon yozish|e'lon namunasi|vakansiya e'loni|объявление о вакансии пример|
shikoyat xati|shikoyat xati namunasi|kechirim xati|iltimos xati|so'rov xati|so'rov xati namunasi|xat namunalari|rasmiy xat namunasi|
ishga taklif xati|резюме сопроводительное письмо|uzr xati"""

tags, to_measure, skipped = {}, [], []
for cl, block in C.items():
    for kw in block.replace('\n', '').split('|'):
        kw = kw.strip()
        if not kw or kw in tags:
            continue
        tags[kw] = cl
        if kw in known and known[kw]['v'] is not None:
            skipped.append((kw, known[kw]['v'], known[kw]['src']))
        else:
            to_measure.append(kw)
print('candidates', len(tags), 'to measure', len(to_measure), 'skipped as known', len(skipped))
for s in skipped:
    print('  known:', s)
assert len(to_measure) <= 700, len(to_measure)
assert all(len(k) <= 80 for k in to_measure)
json.dump({'tags': tags, 'to_measure': to_measure, 'skipped_known': skipped},
          open(os.path.join(HERE, 'candidates1.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
