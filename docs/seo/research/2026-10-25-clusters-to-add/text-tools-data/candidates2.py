# Follow-up candidate list (call 2): no-apostrophe variants of null rows + sub-intents of the biggest clusters.
import json, os, glob
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = r"F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research"
G = {}
def add(g, *kws):
    for k in kws:
        k = k.strip().lower()
        if k and k not in G:
            G[k] = g

add("poems",
    "ona haqida sherlar", "onaga atalgan sherlar", "onaga sherlar", "ona haqida sherlar 4 qator", "ota haqida sher", "ota haqida sherlar",
    "ustoz haqida sherlar", "ustozga sherlar", "ustozlar kuniga sher", "ustozlar kuni sherlari", "ustozlarga sher",
    "kitob haqida sher", "kitob haqida sherlar", "bolalar uchun sher", "bolalar uchun qisqa sherlar", "bolalar uchun sherlar 4 qator",
    "qish haqida sher", "qish haqida sherlar", "kuz haqida sher", "kuz haqida sherlar", "bahor haqida sher", "bahor haqida sherlar",
    "yoz haqida sher", "dost haqida sher", "dostlik haqida sherlar", "maktab haqida sher", "maktab haqida sherlar", "navruz haqida sherlar",
    "mustaqillik haqida sher", "mustaqillik haqida sherlar", "til haqida sher", "ona tili haqida sher", "ona tili haqida sherlar",
    "ilm haqida sher", "ilm haqida sherlar", "yangi yil haqida sher", "yangi yilga sher", "tugilgan kunga sher", "tugilgan kun sherlari",
    "sevgi haqida sherlar", "hayot haqida sher", "hayot haqida sherlar", "vatan haqida sherlar", "vatan haqida sherlar 4 qator",
    "vatan haqida qisqa sher", "ozbekiston haqida sher", "ozbekiston haqida sherlar", "tabiat haqida sher", "gul haqida sher",
    "alisher navoiy sherlari", "navoiy gazallari", "bobur gazallari", "muhammad yusuf sherlari", "abdulla oripov sherlar",
    "gafur gulom sherlari", "cholpon sherlari", "zulfiya sherlari", "erkin vohidov sher", "mirtemir sherlari", "uygun sherlari",
    "ogahiy gazallari", "mashrab gazallari", "nodira sherlari", "uvaysiy gazallari", "shukur xolmirzayev", "sherlar 4 qator",
    "4 qatorli sherlar", "qisqa sherlar 4 qator", "sherlar qisqa", "sherlar sevgi", "sherlar ona", "sherlar yangi", "yangi sherlar",
    "ozbekcha sherlar", "uzbekcha sherlar", "sher yozish qoidalari", "sher qanday yoziladi", "sher tahlili", "gazal nima", "ruboiy nima",
    "шеърлар тўплами", "ватан ҳақида шеърлар", "устоз ҳақида шеърлар", "болалар учун шеърлар", "она ҳақида шеърлар", "янги йил шеърлари",
    "туғилган кун шеърлари", "қисқа шеърлар", "абдулла орипов шеърлари", "эркин воҳидов шеърлари", "муҳаммад юсуф шеърлари", "навоий ғазаллари",
    "стихи на узбекском про маму", "стихи про родину", "стихи о родине", "стихи про узбекистан", "стихи на 1 сентября", "стихи о дружбе")

add("greetings",
    "tugilgan kun tabriklari qisqa", "tugilgan kun tabriklari sherlar", "tugilgan kun tabriklari onaga", "onaga tugilgan kun tabrik",
    "tugilgan kun tabrigi onaga", "tugilgan kun tabrigi dugonaga", "tugilgan kun tabrigi dadaga", "tugilgan kun tabrigi akaga",
    "tugilgan kun tabrigi opaga", "tugilgan kun tabrigi dostga", "tugilgan kun tabrigi sevgilimga", "tugilgan kun tabrigi ustozga",
    "tugilgan kun tabrigi qizimga", "tugilgan kun tabrigi oglimga", "tugilgan kun tabrigi erimga", "tugilgan kun tabrigi ayolimga",
    "tugilgan kun tabrigi singlimga", "tugilgan kun tabrigi ukamga", "tugilgan kun tabrigi kelinga", "tugilgan kun tabrigi kuyovga",
    "tugilgan kun tabrigi hamkasbga", "tugilgan kun tabrigi rahbarga", "tugilgan kun tabrigi buvimga", "tugilgan kun tabrigi bobomga",
    "tugilgan kuningiz bilan", "tugilgan kuning bilan tabriklayman", "tugilgan kuningiz bilan tabriklayman", "tugilgan kun tabrik sozlari",
    "tugilgan kun tilaklari", "tugilgan kun uchun tabrik", "tugilgan kun bilan tabriklash", "dugonaga tabrik", "dostimga tabrik",
    "oglimga tabrik", "singlimga tabrik", "kelinga tabrik", "rahbarga tabrik", "hamkasbga tabrik", "yangi yil tabriklari 2027",
    "yangi yil tabriklari sms", "yangi yil tabrigi qisqa", "yangi yil tabriklari sherlar", "yangi yilga tabrik", "ustozlar kuni tabrigi",
    "ustozlar kuniga tabriklar", "ustoz tabrik", "8 mart tabrigi", "8 mart tabriklari onaga", "8 mart tabriklari ustozga",
    "navruz tabrigi", "navruz bayrami tabriklari", "toy tabrigi", "toyga tabrik sozlari", "nikoh tabrigi", "yubiley tabrigi",
    "туғилган кунинг билан", "туғилган кунингиз билан", "туғилган кун табриклари онага", "онамга табрик", "дугонамга табрик",
    "янги йил табриги", "8 март табриклари", "устозлар куни табриги", "навруз табриклари", "туғилган кун тилаклари",
    "поздравление с днем рождения на узбекском языке", "поздравления на узбекском", "с днем рождения по узбекски",
    "поздравление с днем рождения коротко", "поздравление с днем рождения в прозе", "поздравления с днем рождения в стихах",
    "поздравление с днем рождения бабушке", "поздравление с днем рождения дедушке", "поздравление с днем рождения начальнику",
    "поздравление с днем рождения учителю", "поздравление с днем рождения тете", "поздравление с днем рождения мужу",
    "поздравление с днем рождения жене", "поздравление с днем рождения девушке", "поздравление с днем рождения парню",
    "поздравление с днем рождения внучке", "поздравление с днем рождения внуку", "поздравление с днем рождения племяннице",
    "поздравление с днем рождения ребенку", "поздравление с днем рождения 1 год", "поздравление с днем рождения сотруднице",
    "поздравление с юбилеем женщине", "поздравление с юбилеем мужчине", "поздравление с 55 летием", "поздравление с 60 летием",
    "поздравление с днем учителя в прозе", "поздравление с новым годом коллегам", "поздравление с новым годом 2027",
    "пожелания на день рождения", "пожелания с днем рождения", "что пожелать на день рождения", "текст поздравления с днем рождения")

add("proverbs",
    "ona haqida maqol", "mehnat haqida maqol", "vatan haqida maqol", "dostlik haqida maqol", "bilim haqida maqol", "kitob haqida maqol",
    "odob haqida maqol", "ilm haqida maqol", "tabiat haqida maqol", "oila haqida maqol", "vaqt haqida maqol", "til haqida maqol",
    "sogliq haqida maqol", "hunar haqida maqol", "dostlik haqida maqollar", "odob haqida maqollar", "mehnat haqida maqollar",
    "vatan haqida maqollar", "ona haqida maqollar", "bilim haqida maqollar", "kitob haqida maqollar", "ilm haqida maqollar",
    "maqol va matal", "maqollar va matallar", "maqollar va ularning manosi", "maqollar manosi", "maqollar ozbek tilida",
    "ozbek maqollari", "maqollar toplami", "qisqa maqollar", "maqol topish", "tez aytishlar bolalar uchun", "tez aytish bolalar uchun",
    "iboralar va ularning manosi", "iboralar manosi", "frazeologik iboralar", "hikmatli sozlar ona haqida", "buyuklar hikmatlari",
    "aforizmlar ozbekcha", "navoiy hikmatli sozlari", "мақоллар тўплами", "она ҳақида мақоллар", "ватан ҳақида мақоллар",
    "меҳнат ҳақида мақоллар", "дўстлик ҳақида мақоллар", "тез айтишлар", "иборалар", "пословицы на узбекском", "узбекские поговорки",
    "пословицы для детей", "пословицы о семье", "пословицы о знаниях", "пословицы о добре", "пословицы о книге")

add("names",
    "ugil bolalar ismlari", "ogil bolalarga ismlar", "ogil ismlari", "ogil bola ismlari 2026", "qiz ismlari", "qiz bolalar ismlari 2026",
    "qiz bola ismlari manosi bilan", "ogil bola ismlari manosi bilan", "ismlar manosi qizlar", "ismlar manosi ogil bolalar",
    "ismlar manosi qiz bolalar", "chiroyli qiz ismlari", "chiroyli ogil bola ismlari", "zamonaviy qiz ismlari", "zamonaviy ogil bola ismlari",
    "musulmon ismlari", "islomiy qiz ismlari", "islomiy ogil bola ismlari", "arabcha qiz ismlari", "turkcha qiz ismlari",
    "kam uchraydigan qiz ismlari", "ism manolari", "ismimni manosi", "ismning manosi", "ism manosi qanday", "ism.uz", "ismlar uz",
    "исмлар маъноси қизлар", "қиз исмлари", "ўғил бола исмлари", "чиройли исмлар", "значение узбекских имен", "узбекские имена и их значение",
    "значение имени мальчика", "значение имени девочки", "мусульманские имена и их значение", "редкие имена для девочек")

add("converter",
    "kirill lotin tarjima", "lotin krill tarjima", "lotin kirill tarjima", "kirilchadan lotinchaga", "lotinchadan kirilchaga",
    "kirilcha lotincha", "krill lotin tarjima", "kirildan lotinga", "lotindan kirillga", "lotin krill alifbosi", "lotin kirill alifbosi",
    "yangi alifbo 2026", "yangi alifbo konvertor", "yangi alifbo harflari", "yangi o'zbek lotin alifbosi", "lotin alifbosi harflari",
    "ozbek lotin alifbosi harflari", "alifbo harflari", "ozbek alifbosi harflari", "lotin alifbosi 29 harf", "lotin.uz",
    "кирилл лотин таржима", "лотин кирилл таржима", "lotin yozuvi", "kirill yozuvi", "lotin yozuvida", "kirill alifbo",
    "кириллица латиница узбекский", "перевод на латиницу", "латиница", "кириллица", "узбекская кириллица")

add("text-gen",
    "krossvord tuzish namuna", "krossvord tuzib berish", "krossvord savollari", "krossvord javoblari", "krossvord tuzish dasturi",
    "krossvord yasash", "krossvord online", "кроссворд для детей", "кроссворд с ответами", "составить кроссворд онлайн",
    "создать кроссворд", "кроссворд генератор", "кроссворд по биологии", "кроссворд по истории", "кроссворд по информатике",
    "филворд онлайн", "составить филворд", "генератор филвордов",
    "красивые буквы", "генератор шрифтов", "красивый текст", "красивые надписи", "шрифт для инстаграма", "красивые шрифты для ника",
    "шрифты для ников", "ники для игр", "ники для пубг", "ники для фф", "ники для free fire", "pubg nik", "free fire nik",
    "chiroyli nik", "nik yozish", "chiroyli nik yozish", "nik uchun shrift", "shrift yozish", "chiroyli yozuvlar",
    "рандомайзер чисел", "рандомайзер имен", "колесо фортуны онлайн", "колесо рандома", "крутить колесо", "колесо удачи",
    "spin the wheel", "random name picker", "random number generator", "random number", "tasodifiy tanlash", "omadli gildirak",
    "жеребьевка", "жеребьевка онлайн", "бросить кубик", "монетка", "подбросить монетку",
    "count words", "character count", "letter counter", "word counter online", "счетчик знаков", "количество знаков",
    "посчитать буквы", "сколько символов в тексте", "сколько знаков в тексте", "belgilar sanash", "sozlarni sanash")

add("stories",
    "ertaklar oqish", "bolalar uchun ertak", "bolalar uchun ertaklar ozbek tilida", "ertak ozbekcha", "ertaklar ozbekcha",
    "rus xalq ertaklari", "jahon xalq ertaklari", "qisqa ertak", "ertaklar bolalar uchun", "ibratli ertaklar", "uxlashdan oldin ertak",
    "sehrli ertaklar", "hayvonlar haqida ertak", "ertak toqish", "ertak yozish 3 sinf", "ertak yozib berish", "ozbek xalq ertagi",
    "ibratli hikoyalar qisqa", "qisqa hikoya", "hikoya yozish namuna", "bolalar uchun hikoya", "ibratli rivoyatlar", "dinoz ertak",
    "ertaklar toplami", "ertaklar matni", "masallar bolalar uchun", "ezop masallari", "krilov masallari", "эртаклар ўқиш",
    "болалар учун эртаклар", "ўзбек халқ эртаклари", "қисқа эртаклар", "ибратли ҳикоялар", "сказки на узбекском", "сказки на узбекском языке",
    "сказка для детей на ночь", "сказки для детей на ночь", "короткие сказки на ночь", "сказки на ночь для детей", "узбекская народная сказка")

add("status",
    "statuslar ozbekcha", "status uchun sozlar qisqa", "manoli statuslar qisqa", "sevgi haqida statuslar", "hayot haqida manoli sozlar",
    "ona haqida sozlar", "ota haqida sozlar", "dost haqida sozlar", "chiroyli sozlar sevgilimga", "sevgilimga sozlar", "statuslar sevgi",
    "afandi latifalari ozbekcha", "kulgili latifalar ozbekcha", "latifalar ozbekcha", "nasriddin afandi", "afandi",
    "статусы на узбекском", "цитаты на узбекском", "taziya sozlari", "taziya bildirish")

def load_known():
    known = set()
    files = [os.path.join(HERE, 'tt_kw1_metrics.json')] + glob.glob(BASE + r"\2026-10-24-growth-audit\l3-data\kw*_metrics.json") + glob.glob(BASE + r"\2026-10-25-roadmap-1000\data\kw*_metrics.json") + [f for f in glob.glob(BASE + r"\2026-10-25-clusters-to-add\*-data\*metrics*.json") if 'text-tools-data' not in f]
    for f in files:
        try:
            for r in json.load(open(f, encoding='utf-8')).get('keywords', []):
                known.add(r['keyword'].lower())
        except Exception:
            pass
    return known

known = load_known()
new = [k for k in G if k not in known]
json.dump({"new": new, "groups": G}, open(os.path.join(HERE, 'candidates2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(new, open(os.path.join(HERE, 'call2_keywords.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('cand2', len(G), 'new', len(new))
