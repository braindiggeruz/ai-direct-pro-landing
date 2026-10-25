import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
D = 'F:/Claude/gptbot-snippets-translator-20261024/docs/seo/research/2026-10-25-clusters-to-add/education-practice-data/'
known = json.load(open(D + 'known_keywords.json', encoding='utf-8'))
C = []


def add(*xs):
    for x in xs:
        C.append(x.strip())


subj_uz = ['informatika', 'fizika', 'matematika', 'kimyo', 'biologiya', 'tarix', 'ona tili', 'adabiyot',
           'ingliz tili', 'geografiya', 'rus tili', 'huquq', 'algebra', 'geometriya', 'iqtisod']
for s in subj_uz:
    add(f'{s} test', f'{s} testlari', f'{s} test savollari', f'{s} online test', f'{s} fanidan test', f'{s} testlar')
for s in ['informatika', 'fizika', 'matematika', 'kimyo', 'biologiya', 'tarix', 'ona tili', 'ingliz tili']:
    add(f'{s} test javoblari bilan', f'{s} attestatsiya', f'{s} milliy sertifikat', f'{s} dtm test')
for g in [5, 6, 7, 9, 11]:
    for s in ['informatika', 'matematika', 'fizika', 'ona tili', 'ingliz tili']:
        add(f'{s} test {g} sinf')
# Uzbek Cyrillic
add('информатика тест', 'физика тест', 'математика тест', 'кимё тест', 'биология тест', 'тарих тест', 'она тили тест',
    'инглиз тили тест', 'адабиёт тест', 'география тест', 'тестлар', 'дтм тест', 'миллий сертификат', 'аттестация тест',
    'тест саволлари жавоблари билан')
# Russian
add('тест по информатике', 'тест по физике', 'тест по математике', 'тест по химии', 'тест по биологии',
    'тест по истории', 'тест по английскому', 'тест по английскому языку', 'тест по русскому языку',
    'тест по географии', 'тесты онлайн', 'онлайн тест', 'тест на уровень английского',
    'определить уровень английского', 'тест по истории узбекистана', 'тесты по информатике с ответами',
    'тест по физике с ответами', 'тест по математике с ответами')
# DTM / milliy sertifikat / attestatsiya
add('dtm', 'dtm testlari', 'dtm test 2026', 'dtm 2026', 'dtm test ishlash', 'dtm online test', 'dtm blok test',
    'dtm savollari', 'abituriyent', 'abituriyent test', 'abituriyentlar uchun test', 'kirish imtihoni',
    'milliy sertifikat test', 'milliy sertifikat testlari', 'milliy sertifikat matematika',
    'milliy sertifikat ona tili', 'milliy sertifikat ingliz tili', 'milliy sertifikat tarix',
    'milliy sertifikat biologiya', 'milliy sertifikat kimyo', 'milliy sertifikat fizika', 'milliy sertifikat ball',
    'milliy sertifikat 2026', 'milliy sertifikat namuna', 'milliy sertifikat savollari', 'attestatsiya',
    'attestatsiya testlari', 'attestatsiya test savollari', 'oqituvchilar attestatsiyasi', 'malaka toifa',
    'malaka toifa test', 'attestatsiya boshlangich sinf', 'boshlangich sinf test', 'maktabgacha talim test',
    'tarbiyachi test', 'prezident maktabi', 'prezident maktabi test', 'prezident maktabiga test',
    'prezident maktabi savollari', 'ixtisoslashtirilgan maktab test', 'al xorazmiy maktabi test', 'bsb test',
    'chsb test', 'bsb', 'chsb', 'dtm ball hisoblash', 'ball hisoblash', 'dtm kalkulyator', 'otish ballari',
    'otish ballari 2025', 'oliy talim test', 'test markazi', 'uzbmb')
# English exams
add('cefr', 'cefr test', 'multilevel', 'multilevel test', 'multi level test', 'ielts', 'ielts test', 'ielts writing',
    'ielts writing task 2', 'ielts writing checker', 'writing tekshirish', 'cefr writing', 'multilevel writing',
    'ingliz tili darajasini aniqlash', 'ingliz tili grammatika test', "noto'g'ri fe'llar", 'notogri feillar',
    'irregular verbs', 'неправильные глаголы', 'неправильные глаголы английского языка', 'ingliz tili zamonlari',
    'zamonlar ingliz tilida', 'present simple', 'present perfect', 'tenses', 'ingliz tili alifbosi',
    'ingliz tili sozlar', 'ingliz tilini organish', 'ingliz tili mashqlar', 'english test', 'english grammar test')
# math generators / formulas / calculators
add('formulalar', 'matematika formulalar', 'matematika formulalari', 'fizika formulalar', 'fizika formulalari',
    'kimyo formulalar', 'algebra formulalari', 'geometriya formulalari', 'trigonometriya formulalari',
    'qisqa kopaytirish formulalari', 'kvadrat tenglama', 'diskriminant', 'kvadrat tenglama yechish', 'logarifm',
    'hosila', 'integral', 'limit', 'kasrlar', 'kasrlar bilan misollar', 'kasr kalkulyator', 'foiz hisoblash',
    'foiz kalkulyator', 'foizni hisoblash', 'ekuk ekub', 'ekub va ekuk', 'ekuk topish', 'tub sonlar',
    'kvadratlar jadvali', 'pifagor teoremasi', 'uchburchak yuzi', 'doira yuzi', 'aylana uzunligi',
    'tenglamalar sistemasi', 'tengsizliklar', 'progressiya', 'matematika masalalar', 'matematika masalalar yechish',
    'mantiqiy masalalar', 'boshqotirma', 'boshqotirmalar', 'mantiqiy savollar', 'matematika 1 sinf',
    'matematika 2 sinf', 'matematika 3 sinf', 'matematika 4 sinf', 'matematika 5 sinf', 'matematika 6 sinf',
    'misollar 1 sinf', 'misollar 2 sinf', 'ustun usulida misollar', 'ustunda kopaytirish', 'ustunda bolish',
    'bolish jadvali', 'qoshish va ayirish misollar', 'формулы по физике', 'формулы по математике',
    'квадратное уравнение', 'дискриминант', 'таблица квадратов', 'калькулятор дробей', 'процент от числа',
    'калькулятор процентов', 'нод и нок', 'примеры для 1 класса', 'примеры для 2 класса', 'примеры по математике',
    'таблица умножения', 'тренажер таблица умножения', 'математика 1 класс', 'математика 2 класс', 'римские цифры',
    'rim raqamlari', 'sanoq sistemasi', 'sanoq sistemalari', 'ikkilik sanoq sistemasi', 'перевод в двоичную систему',
    'двоичная система счисления', 'перевод чисел', 'sonni soz bilan yozish', 'raqamni soz bilan', 'сумма прописью',
    'gpa hisoblash', 'gpa calculator', 'gpa kalkulyator')
# chemistry / physics / biology / geography reference
add('mendeleyev jadvali', 'mendeleev jadvali', 'kimyoviy elementlar jadvali', 'менделеев жадвали',
    'таблица менделеева', 'молярная масса', 'molyar massa', 'kimyoviy reaksiyalar', 'reaksiya tenglamalari',
    'kimyoviy tenglama', 'valentlik', 'oksidlanish darajasi', 'уравнять реакцию', 'fizika masalalar',
    'fizika masalalar yechimi bilan', 'birliklar', 'olchov birliklari', 'birliklarni otkazish', 'конвертер величин',
    'hujayra', 'biologiya atamalari', 'davlatlar va poytaxtlar', 'poytaxtlar', 'dunyo davlatlari', 'materiklar',
    'tarixiy sanalar', 'amir temur haqida', 'amir temur haqida malumot', 'ozbekiston tarixi', 'jahon tarixi',
    'ozbekiston tarixi test')
# ona tili grammar
add('imlo qoidalari', 'ona tili qoidalari', 'tinish belgilari', 'soz turkumlari', 'gap bolaklari', 'kelishiklar',
    'kelishik qoshimchalari', 'fel', 'ot soz turkumi', 'sifat', 'olmosh', 'ravish', 'sinonimlar', 'antonimlar',
    'omonimlar', 'frazeologizmlar', 'manodosh sozlar', 'qarama qarshi manoli sozlar', 'fonetika', 'morfologiya',
    'sintaksis', 'qoshma gap', 'diktant matnlari', 'diktant 4 sinf', 'diktant 6 sinf', 'bayon matnlari',
    'ona tili mashqlar', 'ona tili 5 sinf', 'ona tili darslik', 'ozbek tili grammatikasi', 'ozbek tili qoidalari')
# literature summaries
add('otkan kunlar', 'otkan kunlar qisqacha mazmuni', 'asarlar qisqacha mazmuni', 'qisqacha mazmuni',
    'mehrobdan chayon qisqacha mazmuni', 'shum bola qisqacha mazmuni', 'kecha va kunduz qisqacha mazmuni',
    'sariq devni minib qisqacha mazmuni', 'ikki eshik orasi qisqacha mazmuni', 'asar tahlili', 'sher tahlili',
    'adabiyot 5 sinf', 'adabiyot 7 sinf', 'adabiyot 9 sinf', 'alisher navoiy asarlari', 'alisher navoiy haqida')
# topic lists
add('referat mavzulari', 'kurs ishi mavzulari', 'diplom ishi mavzulari', 'bitiruv malakaviy ishi mavzulari',
    'magistrlik dissertatsiya mavzulari', 'dissertatsiya mavzulari', 'esse mavzulari', 'loyiha mavzulari',
    'mustaqil ish mavzulari', 'taqdimot mavzulari', 'ilmiy maqola mavzulari', 'темы для курсовой',
    'темы для курсовой работы', 'темы для проекта', 'темы для эссе', 'темы рефератов', 'темы для презентации',
    'темы для индивидуального проекта', 'темы для диплома', 'мавзулар')
# olympiad / quizzes
add('olimpiada', 'olimpiada savollari', 'olimpiada masalalari', 'fan olimpiadasi', 'matematika olimpiada',
    'matematika olimpiada masalalari', 'informatika olimpiada', 'олимпиада по математике', 'олимпиадные задачи',
    'zakovat savollari', 'zakovat', 'viktorina savollari', 'viktorina', 'qiziqarli savollar', 'savol javob', 'iq test',
    'iq test uzbek tilida', 'тест iq', 'kasb tanlash testi', 'профориентация тест', 'umumiy bilim test',
    'mantiqiy test')
# homework
add('uy vazifasi bajarish', 'uy vazifasi yordam', 'домашнее задание', 'решение домашнего задания',
    'помощь с домашним заданием', 'uyga vazifalar')
# driving theory test (adjacent)
add('avtotest', 'avto test', 'prava test', 'yhq test', 'yol harakati qoidalari test', 'pdd test', 'пдд тест',
    'автотест')

out = []
seen = set()
skipped = []
for x in C:
    k = x.lower()
    if k in seen:
        continue
    seen.add(k)
    if k in known:
        skipped.append(k)
        continue
    if len(k) > 80:
        continue
    out.append(k)
print(len(out), 'new;', len(skipped), 'already known:', skipped)
json.dump(out, open(D + 'candidates1.json', 'w', encoding='utf-8'), ensure_ascii=False)
