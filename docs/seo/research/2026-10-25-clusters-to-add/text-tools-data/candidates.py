# Hand-built candidate list for the text & creative tools lens (2026-10-25).
# research_keywords for location 2860 returns only rows containing the seed (ep_research_note.txt),
# so discovery is mostly manual. Output: candidates.json = new keywords minus already-measured ones.
import json, glob, os

BASE = r"F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "candidates.json")

C = {}
def add(group, *kws):
    for k in kws:
        k = k.strip().lower()
        if k and k not in C:
            C[k] = group

# 1. She'rlar / poems (UZ Latin no-apostrophe + apostrophe, UZ Cyrillic, RU)
add("poems",
    "sherlar", "she'r", "sher yozish", "sherlar toplami", "she'rlar to'plami",
    "onaga sher", "onaga she'r", "ona haqida sher", "ona haqida she'r", "ona haqida she'rlar", "onaga bag'ishlangan she'rlar",
    "otaga sher", "ota haqida she'r", "ota haqida sherlar",
    "vatan haqida sher", "vatan haqida she'r", "vatan haqida she'rlar",
    "ustoz haqida sher", "ustoz haqida she'r", "ustozga sher", "ustozlarga she'rlar", "ustozlar kuni she'rlar",
    "bolalar sherlari", "bolalar uchun she'rlar", "bolalar uchun sherlar", "bolalar she'rlari",
    "tugilgan kun sher", "tug'ilgan kun she'r", "tug'ilgan kunga she'r", "tugilgan kunga sherlar",
    "yangi yil sherlari", "yangi yil she'rlari", "qish haqida she'r", "kuz haqida she'r", "bahor haqida she'r", "yoz haqida she'r",
    "dostlik haqida sher", "do'stlik haqida she'r", "kitob haqida she'r", "ilm haqida she'r", "til haqida she'r", "ona tili haqida she'r",
    "mustaqillik haqida she'r", "navro'z haqida she'r", "navruz haqida sher", "maktab haqida she'r", "sevgi haqida she'r", "sevgi sherlari",
    "sog'inch she'rlari", "soginch sherlari", "qisqa she'rlar", "qisqa sherlar", "ma'noli she'rlar", "manoli sherlar", "hazil she'rlar",
    "alisher navoiy she'rlari", "navoiy sherlari", "navoiy g'azallari", "bobur she'rlari", "bobur g'azallari", "cho'lpon she'rlari",
    "abdulla oripov she'rlari", "abdulla oripov sherlari", "erkin vohidov she'rlari", "erkin vohidov sherlari", "muhammad yusuf she'rlari",
    "muhammad yusuf sherlari", "halima xudoyberdiyeva she'rlari", "zulfiya she'rlari", "usmon azim she'rlari", "rauf parfi she'rlari",
    "hamid olimjon she'rlari", "g'afur g'ulom she'rlari", "ogahiy g'azallari", "mashrab she'rlari", "uvaysiy she'rlari",
    "g'azal", "gazal", "g'azallar", "ruboiy", "ruboiylar", "tuyuq", "barmoq vazni", "aruz vazni", "qofiya", "qofiya nima", "qofiyadosh so'zlar",
    "radif", "she'r tahlili", "sherlar ozbekcha", "o'zbek she'rlari", "uzbek sherlari", "uzbekcha sherlar",
    "шеърлар", "шеър", "севги шеърлари", "онага шеър", "она ҳақида шеър", "ватан ҳақида шеър", "устоз ҳақида шеър",
    "стихи", "стихи на узбекском", "стихи на узбекском языке", "узбекские стихи", "стихи маме", "стихи про маму", "стихи о маме",
    "стихи на день рождения", "стихи с днем рождения", "стихи о любви", "стихи про осень", "стихи про зиму", "стихи для детей",
    "стихи учителю", "стихи про учителя", "стихи на новый год", "короткие стихи", "стихи пушкина", "рифма", "рифма к слову",
    "подобрать рифму", "написать стих", "сочинить стих", "стих", "стихотворение", "генератор стихов онлайн",
    "she'r yozib ber", "sher yozib ber", "she'r yaratish ai", "ai she'r yozish")

# 2. Hikoyalar / ertaklar / stories
add("stories",
    "hikoyalar", "qisqa hikoyalar", "ibratli hikoyalar", "ibratli hikoya", "bolalar uchun hikoyalar", "hikoya o'qish",
    "o'zbek hikoyalari", "uzbek hikoyalari", "qiziqarli hikoyalar", "sevgi hikoyalari", "hayotiy hikoyalar", "hikoya nima",
    "ertak", "ertaklar", "ozbek xalq ertaklari", "o'zbek xalq ertaklari", "bolalar uchun ertaklar", "ertak o'qish", "ertaklar o'zbek tilida",
    "qisqa ertaklar", "uxlashdan oldin ertaklar", "ertak yozish", "ertak yozib ber", "ertak to'qish", "ertak nima",
    "эртаклар", "эртак", "ҳикоялар", "ҳикоя",
    "сказки", "узбекские народные сказки", "узбекские сказки", "сказки на ночь", "сказка на ночь", "короткие сказки",
    "сказки для детей", "сочинить сказку", "написать сказку", "придумать сказку", "рассказы", "рассказы для детей",
    "короткие рассказы", "генератор сказок", "сказка", "rivoyatlar", "rivoyat", "dostonlar", "alpomish dostoni", "masallar", "masal")

# 3. Maqollar / matallar / hikmatlar / aforizmlar
add("proverbs",
    "maqol", "maqollar va matallar", "matallar", "o'zbek xalq maqollari", "ozbek xalq maqollari", "xalq maqollari",
    "ona haqida maqollar", "vatan haqida maqollar", "mehnat haqida maqollar", "do'stlik haqida maqollar", "dostlik haqida maqollar",
    "bilim haqida maqollar", "ilm haqida maqollar", "kitob haqida maqollar", "til haqida maqollar", "odob haqida maqollar",
    "vaqt haqida maqollar", "sog'liq haqida maqollar", "tabiat haqida maqollar", "oila haqida maqollar", "hunar haqida maqollar",
    "maqollar ma'nosi", "maqol nima", "maqollar 3 sinf", "maqollar bolalar uchun",
    "hikmatli so'zlar", "hikmatli sozlar", "hikmatlar", "buyuklar hikmatlari", "aforizmlar", "navoiy hikmatlari", "ibratli so'zlar",
    "iboralar", "frazeologizmlar", "frazeologik birliklar", "tez aytishlar", "tez aytish",
    "мақоллар", "мақол", "ҳикматли сўзлар",
    "пословицы", "пословицы и поговорки", "узбекские пословицы", "узбекские пословицы с переводом", "пословицы о труде",
    "пословицы о дружбе", "пословицы о маме", "пословицы о родине", "поговорки", "афоризмы", "цитаты великих людей",
    "скороговорки", "фразеологизмы")

# 4. Topishmoqlar (overlap with education lens — measured only as RU/Cyrillic variants)
add("riddles",
    "topishmoqlar javobi bilan", "topishmoq", "bolalar uchun topishmoqlar", "topishmoqlar va javoblari", "qiyin topishmoqlar",
    "топишмоқлар", "загадки", "загадки для детей", "загадки с ответами", "сложные загадки")

# 5. Ismlar / names meanings
add("names",
    "ismlar", "ismlar manosi", "ism manosi", "ismning ma'nosi", "ismimning ma'nosi", "ismlar ma'nolari",
    "o'g'il bolalar ismlari", "ogil bolalar ismlari", "o'g'il bola ismlari", "ogil bola ismlari", "o'g'il bolalarga ismlar",
    "qiz bolalar ismlari", "qiz bola ismlari", "qizlar ismlari", "qiz bolalarga ismlar", "chiroyli ismlar", "chiroyli qiz ismlari",
    "chiroyli o'g'il bola ismlari", "zamonaviy ismlar", "zamonaviy qiz ismlari", "o'zbek ismlari", "ozbek ismlari", "o'zbekcha ismlar",
    "islomiy ismlar", "musulmon ismlari", "arabcha ismlar", "turkcha ismlar", "kam uchraydigan ismlar", "ismlar 2026", "yangi ismlar",
    "egizaklar uchun ismlar", "ism tanlash", "ism qo'yish", "bola ismi", "ismlar ro'yxati",
    "исмлар", "исмлар маъноси", "қиз болалар исмлари", "ўғил болалар исмлари",
    "узбекские имена", "узбекские имена для мальчиков", "узбекские имена для девочек", "узбекские мужские имена",
    "узбекские женские имена", "значение имени", "значение имени и судьба", "имена для мальчиков", "имена для девочек",
    "мусульманские имена", "мусульманские имена для мальчиков", "мусульманские имена для девочек", "красивые имена для девочек",
    "красивые имена", "что означает имя", "тюркские имена", "имя", "имена")

# 6. Tabrik sub-intents (UZ Latin, Cyrillic, RU)
add("greetings",
    "tabrik", "tug'ilgan kun tabriklari", "tug'ilgan kun tabrigi", "tugilgan kun tabrigi", "tugilgan kunga tabrik", "tugilgan kun tabrik",
    "tug'ilgan kuning bilan", "tugilgan kuning bilan", "tug'ilgan kuningiz bilan", "tug'ilgan kun bilan tabriklayman", "tugilgan kun bilan",
    "tug'ilgan kun tabriklari sms", "tugilgan kun sms", "tug'ilgan kun tabriklari she'r", "tugilgan kun tabriklari qisqa",
    "onamga tabrik", "onamni tug'ilgan kuni bilan tabriklash", "onaga tug'ilgan kun tabrik", "dadamga tabrik", "dadaga tabrik", "otaga tabrik",
    "opamga tabrik", "opaga tabrik", "akamga tabrik", "akaga tabrik", "ukamga tabrik", "singlimga tabrik", "dugonamga tabrik",
    "do'stimga tabrik", "dostga tabrik", "sevgilimga tabrik", "erimga tabrik", "ayolimga tabrik", "xotinimga tabrik", "qizimga tabrik",
    "o'g'limga tabrik", "ogilga tabrik", "ustozga tabrik", "ustozlar kuni tabriklari", "ustozlar kuniga tabrik", "o'qituvchilar kuni tabrik",
    "8 mart tabriklari", "8 martga tabrik", "8 mart tabrik", "xotin qizlar bayrami tabrik", "navro'z tabriklari", "navruz tabriklari",
    "navro'z bayrami tabrik", "mustaqillik kuni tabrik", "mustaqillik bayrami tabriklari", "hayit tabriklari", "ramazon hayit tabriklari",
    "qurbon hayit tabriklari", "hayit muborak tabrik", "yangi yil tabrigi", "yangi yil bilan tabriklash", "yangi yilingiz bilan",
    "to'y tabriklari", "toy tabriklari", "to'yga tabrik", "nikoh to'yi tabrik", "farzand tug'ilishi tabrik", "chaqaloq tabrik",
    "yubiley tabrik", "50 yosh tabrik", "60 yosh tabrik", "70 yosh tabrik", "bitiruv tabriklari", "oxirgi qo'ng'iroq tabrik",
    "bilimlar kuni tabrik", "1 sentabr tabrik", "armiya kuni tabrik", "14 yanvar tabrik", "vatan himoyachilari kuni tabrik",
    "tabriklar ozbekcha", "tabriklar o'zbek tilida", "tabrik sms", "sms tabriklar", "qisqa tabriklar", "chiroyli tabriklar",
    "she'riy tabriklar", "tabrik she'rlar", "tabrik so'zlar", "tabrik xati",
    "туғилган кун табриклари", "туғилган кун табриги", "табриклар туғилган кун", "янги йил табриклари", "онага табрик",
    "поздравления с днем рождения", "с днем рождения", "поздравление с днём рождения", "с днем рождения поздравления",
    "поздравление маме с днем рождения", "поздравление с днем рождения маме", "поздравление с днем рождения подруге",
    "поздравление с днем рождения мужчине", "поздравление с днем рождения женщине", "поздравление с днем рождения сестре",
    "поздравление с днем рождения брату", "поздравление с днем рождения папе", "поздравление с днем рождения дочери",
    "поздравление с днем рождения сыну", "поздравление с днем рождения коллеге", "поздравление с днем рождения другу",
    "поздравление с днем рождения своими словами", "короткие поздравления с днем рождения", "красивые поздравления с днем рождения",
    "с днем рождения на узбекском", "с днем рождения на узбекском языке", "поздравление на узбекском языке",
    "поздравление с днем рождения на узбекском", "как поздравить на узбекском",
    "поздравление с новым годом", "поздравления с новым годом", "поздравление с 8 марта", "поздравления с 8 марта",
    "поздравление с днем учителя", "поздравление учителю", "поздравление с юбилеем", "поздравление с днем свадьбы",
    "поздравление на свадьбу", "поздравление с рождением ребенка", "поздравление с навруз", "поздравление с рамазан хайит",
    "поздравление с курбан хайит", "тосты", "тост на свадьбу", "тост на день рождения", "поздравление", "поздравления",
    "открытки с днем рождения", "смс поздравления")

# 7. Spellcheck / grammar (UZ + RU)
add("spellcheck",
    "imlo tekshirish onlayn", "imlo tekshirish online", "imlo xatolarni tekshirish", "imlo xatolarini tuzatish", "imloni tekshirish",
    "o'zbek tili imlo tekshirish", "ozbek tili imlo tekshirish", "orfografiya tekshirish", "grammatika tekshirish", "matn tekshirish",
    "matndagi xatolarni tekshirish", "xatolarni tekshirish", "xatolarni tuzatish", "imlo xatolar tekshirish", "imlo dasturi", "imlo uz",
    "imlo.uz", "o'zbek tili imlo", "ozbek tili imlo qoidalari", "tinish belgilarini tekshirish", "vergul qo'yish",
    "имло текшириш", "имло",
    "проверка орфографии и пунктуации", "проверка пунктуации", "проверка пунктуации онлайн", "проверка запятых", "где ставить запятые",
    "орфография", "проверить орфографию", "проверка правописания", "проверка текста", "проверить текст на ошибки",
    "проверка грамматики", "орфографическая ошибка", "проверка ошибок", "проверить ошибки", "орфо", "проверка текста онлайн",
    "grammar check", "grammarly", "spell check", "spelling check")

# 8. Paraphrase / summarize / rewrite
add("rewrite",
    "matnni qisqartirish", "matnni o'zgartirish", "matnni boshqacha yozish", "parafraz", "matnni qayta yozish", "qisqacha mazmuni",
    "xulosa yozish", "matndan xulosa", "konspekt", "konspekt qilish", "matnni tahrirlash", "sinonimlar", "sinonim", "sinonim so'zlar",
    "sinonimlar lug'ati", "antonimlar", "antonim", "omonim", "o'tkan kunlar qisqacha mazmuni", "asar qisqacha mazmuni",
    "перефразировать", "перефразировать предложение", "рерайт", "рерайт онлайн", "переписать текст", "переписать текст своими словами",
    "пересказ", "сократить текст онлайн", "краткое содержание", "краткий пересказ", "суммаризация текста", "изложение",
    "синоним", "синонимы", "синоним к слову", "синонимы к слову", "антоним", "антонимы", "уникальность текста онлайн",
    "антиплагиат", "проверка на плагиат", "antiplagiat", "plagiat tekshirish", "plagiatga tekshirish", "antiplagiat tekshirish",
    "paraphrase", "paraphrasing tool", "quillbot", "summarize")

# 9. Counters
add("counters",
    "so'z sanash", "soz sanash", "so'zlar soni", "sozlar soni", "belgilar soni", "belgilarni sanash", "harflar soni", "harf sanash",
    "matndagi so'zlar soni", "so'z sanagich", "подсчет символов", "посчитать символы", "количество символов", "количество символов в тексте",
    "посчитать количество символов", "подсчет слов", "количество слов", "количество слов в тексте", "посчитать слова", "счетчик слов",
    "счетчик символов", "сколько символов", "сколько слов в тексте", "word counter", "character counter", "word count",
    "katta harf", "katta harflarga o'tkazish", "регистр текста", "заглавные буквы", "изменить регистр", "перевернуть текст",
    "текст наоборот", "зеркальный текст")

# 10. Alphabet / converter (existing block; new-alphabet sub-intent)
add("converter",
    "lotin kirill", "kirill lotin", "krill lotin", "lotin krill", "lotindan kirilga", "kirildan lotinga o'girish", "kirill lotin o'girish",
    "kirill lotin konvertor", "lotin kirill tarjimon", "kirill lotin online", "lotin kirill online", "kirilcha lotincha",
    "латиница кириллица", "кириллица в латиницу", "латиница в кириллицу", "транслитерация", "транслитерация онлайн",
    "транслит", "перевод с кириллицы на латиницу", "перевод с латиницы на кириллицу", "узбекский латиница кириллица",
    "yangi alifbo", "yangi o'zbek alifbosi", "yangi ozbek alifbosi", "o'zbek alifbosi", "ozbek alifbosi", "lotin alifbosi",
    "o'zbek lotin alifbosi", "ozbek lotin alifbosi", "yangi lotin alifbosi", "alifbo", "alifbo harflari", "o'zbek alifbosi harflari",
    "kirill alifbosi", "ўзбек алифбоси", "лотин алифбоси", "лотин", "кирилл", "kirill", "lotin", "lotincha", "lotinchaga",
    "новый узбекский алфавит", "узбекский латинский алфавит")

# 11. Free text writing / generators / names for business / fonts / crosswords
add("text-gen",
    "matn yozib berish", "matn yozish dasturi", "matn yaratish ai", "matn generator", "matn yozuvchi", "post yozish", "post yozib berish",
    "reklama matni", "reklama matni yozish", "reklama matnlari", "e'lon matni", "e'lon yozish", "elon matni", "tavsif yozish",
    "biografiya yozish", "o'zim haqimda", "o'zi haqida ma'lumot", "xat yozish", "xat namunasi", "maktub", "sevgi maktubi",
    "написать текст", "написать пост", "текст для поста", "рекламный текст", "написать рекламный текст", "продающий текст",
    "текст объявления", "написать объявление", "генератор текстов", "сгенерировать текст", "написать письмо", "текст песни",
    "do'kon nomlari", "dokon uchun nom", "kafe nomlari", "kanal uchun nom", "telegram kanal nomlari", "biznes nomi", "brend nomi",
    "название для магазина", "название компании", "генератор названий", "название для канала", "название для бизнеса",
    "nik", "niklar", "chiroyli niklar", "nik uchun", "ник", "ники", "красивые ники", "генератор ников", "никнейм",
    "shriftlar", "chiroyli shriftlar", "chiroyli yozuv", "chiroyli harflar", "шрифты", "красивые шрифты", "красивый шрифт",
    "шрифт для ника", "шрифты для инстаграм", "fancy text", "imzo", "chiroyli imzo", "imzo yasash", "подпись", "красивая подпись",
    "krossvord", "krossvordlar", "krossvord tuzish", "krossvord yaratish", "кроссворд", "кроссворды", "составить кроссворд",
    "кроссворд онлайн", "сделать кроссворд", "филворд", "ребусы", "rebuslar", "rebus", "anagramma", "so'z o'yini", "so'z topish",
    "random", "рандом", "рандомайзер", "рандом число", "случайное число", "генератор случайных чисел", "жребий", "колесо фортуны",
    "tasodifiy son", "random son", "wheel of names", "g'ildirak")

# 12. Statuses / quotes / love words / jokes / sms
add("status",
    "statuslar", "status", "status uchun so'zlar", "status uchun sozlar", "status uchun", "ma'noli statuslar", "manoli statuslar",
    "qisqa statuslar", "hayot haqida statuslar", "sevgi statuslari", "status sevgi", "status uchun qisqa so'zlar", "statuslar 2026",
    "ma'noli so'zlar", "manoli sozlar", "hayot haqida so'zlar", "hayot haqida ma'noli so'zlar", "chiroyli so'zlar", "chiroyli sozlar",
    "sevgi so'zlari", "sevgi sozlari", "sevgi haqida so'zlar", "sevgilimga so'zlar", "sevgilimga chiroyli so'zlar", "sevgi sms",
    "ona haqida so'zlar", "do'stlik haqida so'zlar", "dostlik haqida sozlar", "ota haqida so'zlar", "tunlaringiz osuda",
    "xayrli tun", "xayrli tong", "xayrli tun tilaklari", "xayrli tong tilaklari", "tilaklar", "yaxshi tilaklar",
    "статусы", "статусы со смыслом", "статусы про жизнь", "статусы для ватсапа", "статусы для whatsapp", "статусы про любовь",
    "цитаты", "цитаты со смыслом", "цитаты про жизнь", "цитаты про любовь", "красивые слова", "красивые слова девушке",
    "доброе утро", "спокойной ночи", "пожелания спокойной ночи", "пожелания доброго утра",
    "latifalar", "latifa", "nasriddin afandi latifalari", "afandi latifalari", "kulgili latifalar", "anekdotlar", "anekdot", "hazillar",
    "kulgili hazillar", "лятифалар", "латифалар", "анекдоты", "анекдот", "смешные анекдоты", "шутки", "приколы",
    "ta'ziya so'zlari", "taziya sozlari", "ta'ziya", "соболезнования", "слова соболезнования",
    "сочинение на узбекском", "insho yozib ber", "esse generator", "insho generator")

def load_known():
    known = {}
    pats = [BASE + r"\2026-10-24-growth-audit\l3-data\kw*_metrics.json",
            BASE + r"\2026-10-25-roadmap-1000\data\kw*_metrics.json",
            BASE + r"\2026-10-25-clusters-to-add\*-data\*metrics*.json"]
    for p in pats:
        for f in glob.glob(p):
            if "text-tools-data" in f:
                continue
            try:
                d = json.load(open(f, encoding="utf-8"))
            except Exception:
                continue
            for k in (d.get("keywords", []) if isinstance(d, dict) else []):
                if isinstance(k, dict) and k.get("keyword"):
                    known[k["keyword"].lower()] = os.path.basename(f)
    return known

if __name__ == "__main__":
    known = load_known()
    new = [k for k in C if k not in known]
    reused = [k for k in C if k in known]
    json.dump({"new": new, "reused": reused, "groups": C}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("candidates", len(C), "new", len(new), "reused", len(reused), "known pool", len(known))
