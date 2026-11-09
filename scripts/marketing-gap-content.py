"""Authored November 9 marketing cohort. Run once against the verified predecessor.

No API calls, invented keyword volumes, client results or changes to URL ownership.
All tables and downloadable worksheets are editorial examples, not customer data.
"""
from pathlib import Path
import json, csv, io

ROOT = Path(__file__).resolve().parents[1]
DATE = '2026-11-09'
STAMP = DATE + 'T00:00:00.000Z'
PLAN = json.loads((ROOT.parent/'evidence/openseo-gap-20261109/20-pages.json').read_text(encoding='utf-8-sig'))
OUT = ROOT/'public/downloads/marketing-20261109'
OUT.mkdir(parents=True, exist_ok=True)
FILES = {}
CHANGES = {}
for folder in ['pages', 'blog']:
    for f in (ROOT/'content'/folder).rglob('*.json'):
        d = json.loads(f.read_text(encoding='utf-8-sig'))
        if 'url' in d: FILES[d['url']] = (f, d)

def write(f, data):
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def h(text, id): return {'type':'h2', 'text':text, 'id':id}
def p(text): return {'type':'p', 'text':text}
def li(*items): return {'type':'list', 'items':list(items)}
def table(headers, rows): return {'type':'table', 'headers':headers, 'rows':rows}
def link(text, target, anchor):
    return {'type':'linkp', 'text':text, 'links':[{'token':'link','target':target,'anchor':anchor}]}
def src(title,url,note=''):
    return {'title':title,'url':url, **({'note':note} if note else {})}
def csvfile(name, headers, rows):
    # BOM and semicolon allow Russian/Uzbek text to open correctly in Excel.
    s=io.StringIO(); w=csv.writer(s,delimiter=';',lineterminator='\n');w.writerow(headers);w.writerows(rows)
    (OUT/name).write_bytes(s.getvalue().encode('utf-8-sig'))
    return '/downloads/marketing-20261109/'+name
def touch(url, blocks, at=0):
    f,d=FILES[url];key='body' if '/blog/' in url else 'bodyBlocks'
    # Idempotence: the authored section id identifies this exact insertion.
    first=next((b.get('id') for b in blocks if b['type']=='h2'),None)
    if first and any(b.get('id')==first for b in d[key]): raise RuntimeError('Already applied '+url)
    d[key][at:at]=blocks;d['updatedAt']=STAMP
    if key=='body':d['dateModified']=DATE
    else:d['lastReviewedAt']=DATE
    write(f,d);CHANGES.setdefault(url,[]).append(first or 'contextual-link')
def addlink(url, target, anchor, sentence):
    f,d=FILES[url];key='body' if '/blog/' in url else 'bodyBlocks'
    if any(b.get('type')=='linkp' and any(x.get('target')==target for x in b.get('links',[])) for b in d[key]):return
    d[key].append(link(sentence,target,anchor));d['updatedAt']=STAMP
    if key=='body':d['dateModified']=DATE
    else:d['lastReviewedAt']=DATE
    write(f,d);CHANGES.setdefault(url,[]).append('link:'+target)
def article(slug, locale, title, desc, intro, keyword, hub, cluster, body, faq, sources=()):
    url=f'/{locale}/blog/{slug}/'
    if url in FILES: raise RuntimeError('Refusing duplicate '+url)
    d={'status':'published','locale':locale,'slug':slug,'url':url,'title':title,'h1':title,
       'description':desc,'intro':intro,'keywords':[keyword], 'topicCluster':cluster,'targetMoneyPage':hub,
       'body':body,'faq':[{'q':q,'a':a} for q,a in faq],
       'cta':{'label':'Обсудить задачу' if locale=='ru' else 'Vazifani muhokama qilish','href':hub},
       'internalLinks':[{'target':hub,'anchor':'Услуга и состав работ' if locale=='ru' else 'Xizmat tarkibi','locale':locale,'type':'contextual'}],
       'canonical':'https://gptbot.uz'+url,'robotsIndex':True,'robotsFollow':True,
       'author':'Борис Герасимов' if locale=='ru' else 'Boris Gerasimov','datePublished':DATE,'dateModified':DATE,
       'createdAt':STAMP,'updatedAt':STAMP,'schemaTypes':['Organization','WebSite','BreadcrumbList','Article','FAQPage'],
       'sources':list(sources)}
    f=ROOT/'content/blog'/locale/(slug+'.json');write(f,d);FILES[url]=(f,d);CHANGES[url]=['new']

# E01: distinguish the commercial deliverable from the existing definition/DIY pages.
accept_rows=[
 ['Taklif va til','Bitta kurs yoki xizmat, RU/UZ matnlar alohida tekshiriladi','Narx, jadval va manzil mijoz tomonidan tasdiqlangan'],
 ['Kampaniya','Maqsad, hudud, byudjet chegarasi va reklama manzili','Kabinet egasi mijoz; sarf limiti kelishilgan'],
 ['Kreativ','Turli g‘oya uchun alohida e’lon va aniq CTA','Har bir matn va rasm tasdiqlangan, yolg‘on va’da yo‘q'],
 ['Ariza yo‘li','Reklama → sahifa yoki Direct → mas’ul xodim','Test murojaati belgilangan joyga keladi, takrorlari ajratiladi'],
 ['Hisobot','Sarf, murojaatlar, mos murojaatlar, sotuv holati','Raqamlarning manbasi va hisoblash davri ko‘rsatiladi']]
accept=csvfile('target-qabul-cheklist.csv',['Bosqich','Topshiriladigan natija','Qabul mezoni'],accept_rows)
touch('/uz/instagram-target-yoqish/',[
 h('Target ishga tushganda qo‘lingizda nima qoladi?', 'qabul-mezonlari'),
 p('Misol: Toshkentdagi ingliz tili markazi kechki guruhga murojaat yig‘moqchi. Quyidagi jadval — ishni qabul qilish namunasi; bu mijozimizning natijasi yoki ariza soni va’dasi emas. Avval dars vaqti, haqiqiy narx, bo‘sh joy va javob beruvchi administrator aniqlanadi. Shundan keyin reklama shu bitta vazifaga quriladi.'),
 table(['Bosqich','Siz oladigan natija','Qanday tekshirasiz'],accept_rows),
 link('Ishni tekshirish uchun {link}. Jadvalni o‘z mahsulotingiz va mas’ul xodimlaringizga moslang.',accept,'qabul cheklistini CSV formatida yuklab oling'),
 p('Hisobotda klik va ariza bir narsa emas. Masalan, 20 ta murojaatdan 8 tasi kurs jadvaliga mos bo‘lsa, ikkala raqam alohida yoziladi. Bu shartli hisob misoli, kutiladigan natija emas. Sotuvni esa administrator tasdiqlaydi; reklama kabinetidagi konversiya o‘z-o‘zidan to‘lovni isbotlamaydi.'),
 link('Avval tushunchani bilmoqchi bo‘lsangiz, {link}. Bu sahifa esa sozlash xizmatining tarkibi, narxi va qabul qilishiga bag‘ishlangan.','/uz/blog/target-reklama-nima/','target reklama nima ekanini o‘qing')])

seo_check=csvfile('seo-birinchi-tekshiruv.csv',['Sahifa','Savol','Dalil','Masul','Keyingi qadam'],[
 ['Xizmat sahifasi','URL ochiladimi?','HTTP holati va telefon tekshiruvi','',''],
 ['Xizmat sahifasi','Google indekslaganmi?','Search Console URL Inspection','',''],
 ['Xizmat sahifasi','Mijoz savoliga javob bormi?','Narx sharti, tarkib, manzil, aloqa','',''],
 ['Xizmat sahifasi','Ichki havola bormi?','Mavzudosh maqola va xizmat bo‘limi','',''],
 ['Xizmat sahifasi','Murojaat ishlaydimi?','Test ariza qabul qilindi, takror yo‘q','','']])
article('seo-nima','uz','SEO nima? Saytni Google qidiruviga tayyorlash',
 'SEO nima, indekslash va reyting farqi: xizmat sahifasining oldin-keyin namunasi, 5 tekshiruvli jadval va Google Ads bilan taqqoslash.',
 'SEO — saytning organik qidiruvda topilishi, tushunarli bo‘lishi va foydalanuvchi vazifasini bajarishi uchun qilinadigan ishlar. Google’ga reklama uchun pul to‘lash SEO emas. Texnik kirish, foydali mazmun va sayt ichidagi bog‘lanish birga ishlaydi; ularning hech biri birinchi o‘rinni kafolatlamaydi.',
 'seo nima','/uz/seo-xizmati/','seo-uz',[
 h('Topish, indekslash va yuqori o‘rin — uchta alohida holat','uch-bosqich'),
 table(['Holat','Nimani bildiradi','Qanday tekshiriladi'],[
 ['Topish va skanerlash','Robot URL’ni biladi va mazmunni olib ko‘radi','Sitemap, havolalar, server javobi'],
 ['Indekslash','Qidiruv tizimi sahifani indeksga kiritgan','Search Console’dagi URL Inspection'],
 ['Reyting','Sahifa ma’lum so‘rov bo‘yicha qayerda ko‘rinadi','So‘rov, mamlakat va qurilma bo‘yicha hisobot']]),
 p('Sahifa ochilishi uning Google’da borligini anglatmaydi. Indeksga kirgani ham har bir so‘rovda ko‘rinishini anglatmaydi. Shuning uchun “saytim qidiruvda yo‘q” degan vazifani aniq URL va aniq so‘rov bilan boshlang. Xizmat nomini qidirayotgan odam bilan brend nomini biladigan odamning niyati farq qiladi.'),
 h('Bitta xizmat sahifasi: oldin va keyin','sahifa-misol'),
 p('Tahririy misol: konditsioner ustasining sahifasida faqat “Eng yaxshi sifat, arzon narx, bizga qo‘ng‘iroq qiling” yozilgan. Mijoz qaysi ishlar bajarilishi, qaysi tumanga borilishi yoki narx qanday aniqlanishini bilmaydi. Quyidagi o‘zgarishlar yangi fakt to‘qimaydi: haqiqiy ma’lumotlarni ko‘rsatadigan tuzilma beradi.'),
 table(['Element','Oldin','Yaxshilangan yondashuv'],[
 ['Sarlavha','Bosh sahifa','Toshkentda konditsioner tozalash — xizmat va buyurtma'],
 ['Mazmun','Faqat reklama iboralari','Tozalash tarkibi, mos qurilmalar, narxga ta’sir qiluvchi shartlar'],
 ['Dalil','Eng yaxshi deb yozish','O‘z ishidan ruxsatli fotosurat, ish tartibi va cheklovlar'],
 ['Amal','Ko‘rinmaydigan kontakt','Buyurtma tugmasi va ariza qabul bo‘lganini tekshirish'],
 ['Havola','Har joydan bosh sahifaga','Parvarish maqolasidan aynan tozalash xizmatiga havola']]),
 p('Title va H1’ni kalit so‘zlar ro‘yxatiga aylantirmang. Title natijani tanlashga, H1 esa sahifa mavzusini tushunishga yordam beradi. Tavsifni sahifadagi haqiqiy taklifga moslang. Bir xizmat uchun bir-birini takrorlaydigan o‘nlab shahar sahifalarini ochish o‘rniga, xizmatning mavjud hududi va shartlarini aniq yozing.'),
 h('SEO va Google Ads qachon kerak?','seo-ads'),
 table(['Savol','SEO','Google Ads'],[
 ['Ko‘rinish uchun to‘lov','Har bir organik klik uchun Google’ga to‘lanmaydi; ishning xarajati bor','Reklama joylashuvi uchun kampaniya byudjeti sarflanadi'],
 ['Boshlang‘ich vazifa','Mavjud sahifa va qidiruv talabini tekshirish','Taklif, reklama sahifasi va konversiyani tekshirish'],
 ['Nazorat','Indeks, so‘rovlar, organik murojaatlar','Sarf, so‘rovlar, reklama orqali murojaatlar']]),
 link('Mustaqil reklama uchun {link}. Organik va pullik natijalar hisobotini aralashtirmang.','/uz/blog/google-reklama-sozlash/','Google reklama sozlash yo‘riqnomasi'),
 h('Bugun bajariladigan besh tekshiruv','cheklist'),
 li('Bir dona asosiy xizmat URL’ini tanlang. Telefonda ochib, taklif va kontakt ko‘rinishini tekshiring.',
 'URL Inspection’da robots, indekslash va tanlangan canonical holatini ko‘ring. API natijasi Google’ning saqlangan holati bo‘lishi mumkin.',
 'Mijozning xariddan oldingi uch savoliga aniq javob qo‘shing. Yo‘q faktlarni o‘ylab topmang.',
 'Tegishli maqoladan xizmatga, xizmatdan esa foydali qo‘llanmaga oddiy HTML havola bering.',
 'Murojaat yo‘lini test qiling. Hisobotda ko‘rsatish, klik va tasdiqlangan murojaatni alohida saqlang.'),
 link('Natijani yozib borish uchun {link}. Tekshiruv sanasi va javobgarni kiriting.',seo_check,'SEO tekshiruv jadvalini yuklab oling'),
 h('Qachon mutaxassis yordami kerak?','mutaxassis'),
 p('Ko‘p URL’li sayt, bir necha til, doimiy noindex yoki canonical muammosi bo‘lsa, avval sabablar xaritasi kerak. Eski ishlayotgan URL’larni ko‘r-ko‘rona almashtirmang. Har o‘zgarish oldidan holatni saqlab, keyin sahifa va qidiruv ma’lumotlarini taqqoslang.'),
 link('Saytingiz bo‘yicha texnik va mazmun rejasini {link} sahifasida ko‘rishingiz mumkin.','/uz/seo-xizmati/','SEO xizmati tarkibi va narxi')],
 [('SEO bepulmi?','Organik klik uchun alohida reklama to‘lovi yo‘q. Lekin tadqiqot, mazmun, dasturlash va tekshirish vaqt yoki pul talab qiladi.'),('Natija qachon ko‘rinadi?','Yagona muddat yo‘q: avval sahifaning ochilishi va indeks holati, keyin so‘rovlar va murojaatlar tekshiriladi. Yuqori o‘rin kafolatlanmaydi.'),('Sitemap yuborsam yetarlimi?','Sitemap URL’ni topishga yordam beradi. Foydali mazmun, ichki havolalar va indekslashga ruxsat ham kerak; yuborish indeksga kirish isboti emas.')],
 [src('Google Search Central — SEO Starter Guide','https://developers.google.com/search/docs/fundamentals/seo-starter-guide')])

content_examples=[
 ['O‘quv markazi','Savolga javob','Karrusel','Daraja testi nima uchun kerak? 3 ta vazifa bilan tushuntiring.','Test tartibini so‘rash'],
 ['O‘quv markazi','Ishonch','Qisqa video','Bir mashqni o‘qituvchi qanday tahlil qilishini ko‘rsating.','Sinov darsi shartlarini o‘qish'],
 ['Kafe','Tanlov','Foto va matn','Bir porsiya tarkibi va allergen ma’lumotini aniqlashtiring.','Menyuni ochish'],
 ['Kafe','Qulaylik','Stories','Bugungi ish vaqti va olib ketish yo‘lini ko‘rsating.','Buyurtma yo‘lini tanlash'],
 ['Usta','Jarayon','Foto ketma-ketligi','Tozalashdan oldin nimalar yopib qo‘yilishini tushuntiring.','Mos xizmatni so‘rash'],
 ['Usta','Cheklov','Savol-javob','Masofadan narx aytish uchun kerakli suratlarni sanang.','Qurilma ma’lumotini yuborish'],
 ['Do‘kon','Taqqoslash','Jadval','Ikki o‘lchamning farqini haqiqiy o‘lchovlar bilan bering.','O‘lchamni tanlash'],
 ['Do‘kon','Xavotirni kamaytirish','Qo‘llanma','Amaldagi almashtirish shartlari qayerda ekanini ko‘rsating.','Shartlarni tekshirish'],
 ['B2B xizmat','Vazifani aniqlash','Cheklist','Taklif olish uchun kerakli 5 boshlang‘ich ma’lumot.','Brifni tayyorlash'],
 ['B2B xizmat','Dalil','Jarayon tahlili','Ruxsatli misolda vazifa, bajarilgan ish va cheklovni ajrating.','O‘xshash vazifani muhokama qilish'],
 ['Mahalliy xizmat','Yo‘l topish','Video','Kiraverish va mo‘ljalni keluvchining ko‘zi bilan ko‘rsating.','Manzilni saqlash'],
 ['Mahalliy xizmat','Muloqot','So‘rov','Eng ko‘p tushunarsiz bo‘layotgan shartni so‘rang.','Savol qoldirish']]
contentcsv=csvfile('kontent-12-misol.csv',['Biznes','Maqsad','Format','Goya','Keyingi amal'],content_examples)
article('kontent-nima','uz','Kontent nima? Biznes uchun 12 ta amaliy misol',
 'Kontentning maqsadi, matn, video va rasm formatlari. 12 ta original biznes misoli, tahririy tekshiruv va yuklab olinadigan jadval.',
 'Kontent — auditoriya ko‘radigan, o‘qiydigan yoki tinglaydigan mazmun: matn, rasm, video, audio va foydali interaktiv vosita. Biznesda uning vazifasi shunchaki profilni to‘ldirish emas: savolga javob berish, tanlovni yengillashtirish yoki keyingi qadamni tushuntirish.',
 'kontent nima','/uz/smm-xizmatlari/','smm-uz',[
 h('Formatni emas, savolni birinchi tanlang','maqsad'),
 p('“Bugun nima joylaymiz?” o‘rniga “Mijoz nimani bilmayapti?” deb so‘rang. O‘quv markazi uchun darajani aniqlash, kafeda tarkib, ustada esa ish chegarasi muhim bo‘lishi mumkin. Bir savolga javob beradigan video ortiqcha shiorlardan foydaliroq. Format mazmunni ko‘rsatishga xizmat qiladi.'),
 table(['Format','Qachon mos','Tekshirish'],[['Matn','Shart, tushuntirish, qisqa ko‘rsatma','O‘qigan odam nima qilishi aniqmi?'],['Rasm yoki karrusel','Farqlar, bosqichlar, ro‘yxat','Matn telefonda o‘qiladimi?'],['Video','Harakat yoki jarayon','Ovozsiz ham asosiy fikr tushunarlimi?'],['Jadval yoki vosita','Hisob, tanlov, rejalash','Natijadan darhol foydalanish mumkinmi?']]),
 h('12 ta g‘oya: vazifadan keyingi qadamgacha','misollar'),
 p('Quyidagi misollar tahririyat tomonidan tuzilgan. Ular mijoz natijasi emas. Nashrdan oldin o‘z narxingiz, shartlaringiz, ish vaqtingiz va rasmga bo‘lgan huquqni tekshiring.'),
 table(['Biznes','Maqsad','Format','Mazmun g‘oyasi','Keyingi qadam'],content_examples),
 link('G‘oyalarni belgilang va moslashtiring: {link}.',contentcsv,'12 misolli CSV jadval'),
 h('Kontent, reklama va kontent-reja farqi','farq'),
 p('Kontent — materialning o‘zi. Reklama — uni pullik tarqatish usullaridan biri. Kontent-reja esa qaysi material, kim uchun, qachon va kim tomonidan tayyorlanishini belgilaydi. Bir material ham organik post, ham reklama kreativi bo‘lishi mumkin, lekin reklamada va’da, manzil va o‘lchash alohida tekshiriladi.'),
 link('Profil bilan tizimli ishlash haqida {link}.','/uz/blog/smm-nima/','SMM nima ekanini o‘qing'),
 h('Bir g‘oyani uch formatga moslashtirish','uch-format'),
 p('Masalan, mijoz “Darsga tayyorlanish kerakmi?” deb so‘raydi. Matnda kerakli buyumlar ro‘yxati beriladi. Videoda o‘qituvchi birinchi topshiriqni ko‘rsatadi. Stories’da esa kelishdan oldin javob beriladigan savol beriladi. Uchalasida ham bir xil dalil ishlaydi; matnni shunchaki kesib ko‘chirish shart emas.'),
 p('Asosiy materialni saqlang: tasdiqlangan fakt, ruxsatli foto va yangilanish sanasi. Narx o‘zgarsa, unga bog‘langan post va sahifalarni ham tekshiring. Bu eski va yangi ma’lumotning bir-biriga zid bo‘lishini kamaytiradi.'),
 h('Nashrdan oldingi tahririy tekshiruv','tekshiruv'),
 li('Bitta aniq auditoriya savoli bormi?', 'Fakt, misol va reklama va’dasi bir-biridan ajratilganmi?', 'Narx, jadval yoki natijani tasdiqlaydigan manba bormi?', 'Rasm va videodagi odamlar hamda materiallar uchun ruxsat tekshirilganmi?', 'Keyingi amal ishlaydimi va sahifadagi taklifga mosmi?', 'Materialni kim tasdiqlashi va kim javob berishi belgilanganmi?'),
 link('Matn uchun {link}; AI bergan variantni fakt, ohang va shartlar bo‘yicha muharrir tekshiradi.','/uz/gpt-telegram-instagram-ideya/','Telegram va Instagram g‘oyalar vositasi'),
 h('Natijani qanday baholash kerak?','natija'),
 p('Ko‘rishlar mazmun tarqalganini, saqlashlar qayta foydalanish ehtimolini, murojaatlar esa qiziqishning keyingi bosqichini ko‘rsatadi. Bular sotuv bilan teng emas. Bir davr va bir xil maqsadga xizmat qiladigan materiallarni taqqoslang. Savol-javob postini faqat xarid soni bilan baholash uning tushuntirish vazifasini yashirishi mumkin.')],
 [('Har kuni post kerakmi?','Majburiy universal son yo‘q. Material tayyorlash, tekshirish va kelgan savollarga javob berish imkoniyatiga mos jadval tanlang.'),('AI yozgan matn kontent bo‘ladimi?','Ha, lekin muallif faktlar, huquqlar va foydalilik uchun javob beradi. AI xatosini tekshirmasdan nashr qilmang.'),('Kontent-reja qayerdan boshlanadi?','Auditoriya savoli, biznes vazifasi va mavjud materiallardan. So‘ng format, muddat, mas’ul va tekshirish mezoni belgilanadi.')])

audrows=[
 ['Kechki ingliz tili','Ishdan keyin o‘qiydigan katta yoshli kishi','Ish uchrashuvida gapirish','Vaqt mos kelmaydi','Jadval va daraja testi tartibi','Suhbat + so‘rov','Gipoteza, tasdiqlash kerak'],
 ['Konditsioner tozalash','Kvartira egasi','Qurilmani parvarish qilish','Narx va uydagi tozalik','Ish tarkibi, narx shartlari, himoya jarayoni','Murojaatlar tahlili','Gipoteza, tasdiqlash kerak'],
 ['O‘z segmentingiz','','','','','','']]
audcsv=csvfile('auditoriya-segmentlari.csv',['Taklif','Vaziyat','Vazifa','Xavotir','Kerakli dalil','Manba','Tekshiruv'],audrows)
article('maqsadli-auditoriya','uz','Maqsadli auditoriya: segment va portretni tuzish',
 'Maqsadli auditoriyani vazifa va xarid holatiga ko‘ra ajrating. Ikki to‘ldirilgan misol, suhbat savollari va bepul CSV shablon.',
 'Maqsadli auditoriya — taklifingiz muayyan vazifasini hal qilishi mumkin bo‘lgan odamlar guruhi. “18–65 yosh, Toshkent” reklama sozlamasi bo‘lishi mumkin, lekin mijoz portreti emas. Foydali portret ehtiyoj, vaziyat, qaror sababi va ishonch uchun kerakli dalilni tushuntiradi.',
 'maqsadli auditoriya','/uz/instagram-target-yoqish/','target-uz',[
 h('Segmentni yoshdan oldin vazifa bilan ajrating','segment'),
 p('Bitta ingliz tili kursiga imtihon uchun tayyorlanayotgan talaba va ish uchrashuvida gapirmoqchi bo‘lgan mutaxassis kelishi mumkin. Ular bir xil hududda yashasa ham, savollari va jadvali boshqa. Segment tanlash odam haqidagi taxminni haqiqat deb e’lon qilish emas: uni suhbat va murojaatlar bilan tekshirish kerak.'),
 table(['Savol','Zaif javob','Tekshirishga yaroqli javob'],[['Kim?','Hamma','Ishdan keyin darsga kelishi mumkin bo‘lgan yangi boshlovchi'],['Nega hozir?','Til o‘rganmoqchi','Yangi ishida uchrashuvlarga tayyorlanmoqda'],['Nima to‘sqinlik qiladi?','Pul','Jadval va darajasiga mos guruh borligini bilmaydi'],['Qanday dalil kerak?','Yaxshi reklama','Dars vaqti, test tartibi, shartlar']]),
 h('Ikki to‘ldirilgan portret va bo‘sh shablon','namuna'),
 p('Bu o‘quv misollari, haqiqiy mijozlar bazasi emas. “Manba” ustuniga suhbat sanasi yoki umumlashtirilgan kuzatuvni yozing. Ism, telefon va shaxsiy yozishmalarni umumiy marketing jadvaliga ko‘chirmang.'),
 table(['Taklif','Vaziyat','Vazifa','Xavotir','Dalil','Manba','Holat'],audrows[:2]),
 link('O‘z segmentingizni qo‘shish uchun {link}.',audcsv,'auditoriya jadvalini yuklab oling'),
 h('Suhbatda beriladigan savollar','savollar'),
 li('Bu xizmatni qidirishga nima sabab bo‘ldi?', 'Oxirgi marta shunga o‘xshash vazifani qanday hal qildingiz?', 'Tanlashda qaysi ma’lumot yetishmadi?', 'Qaysi variantni va nima sababdan rad etdingiz?', 'Buyurtma qilishdan oldin kim bilan maslahatlashasiz?', 'Siz uchun xizmat bajarilganini qanday natija ko‘rsatadi?'),
 p('“Bizning yaxshi taklifimizni olarmidingiz?” kabi yo‘naltiruvchi savol javobni buzishi mumkin. Odamning oxirgi haqiqiy tajribasi haqida so‘rang. Bir nechta suhbat boshlang‘ich gipoteza beradi, butun bozorning statistik tasviri emas. Qarshi misollarni ham yozing.'),
 h('Portretni reklama va sahifaga aylantirish','amal'),
 table(['Portretdagi kuzatuv','Reklamada','Sahifada'],[['Jadval muhim','Kechki dars haqida aniq g‘oya','Haqiqiy kun va soatlar'],['Narx noaniq','Narx shartlarini bilish CTA’si','Nima kiradi va nima alohida'],['Boshlang‘ich daraja','Moslikni aniqlash taklifi','Test yoki maslahatning tartibi']]),
 p('Bir kichik byudjetni ko‘p mayda auditoriyaga bo‘lib yuborish tekshirishni qiyinlashtiradi. Avval bitta muhim gipoteza, mos kreativ va o‘lchanadigan murojaat yo‘lini tanlang. Tor auditoriya har doim yaxshiroq degan qoida yo‘q; platforma imkoniyati va amaldagi natija asosida qaror qiling.'),
 link('Sozlash va qabul qilish mezonlari {link} sahifasida.','/uz/instagram-target-yoqish/','Instagram target yoqish xizmati'),
 h('Portret qachon yangilanadi?','yangilash'),
 p('Murojaatlar boshqa savol bilan kela boshlasa, taklif yoki narx o‘zgarsa, yangi hudud ochilsa, gipotezani qayta tekshiring. Har oy faqat demografiyani ko‘chirish o‘rniga, administrator rad etilgan va mos kelgan murojaatlarning umumiy sabablarini yozsin. Maxfiy ma’lumot va sezgir xususiyatlarni reklama nishoniga aylantirmang.')],
 [('Auditoriya portreti va reklama auditoriyasi bir xilmi?','Yo‘q. Portret ehtiyoj va vaziyatni tushuntiradi; reklama auditoriyasi esa platformadagi mavjud tanlash sozlamalaridir.'),('Mijozlar hali yo‘q bo‘lsa-chi?','Gipotezani ochiq belgilang. Potensial foydalanuvchilar bilan suhbat, qidiruv savollari va kichik tekshiruvdan boshlang.'),('Bitta mahsulotga bir nechta portret kerakmi?','Turli xarid vazifalari yoki qaror jarayonlari bo‘lsa kerak bo‘lishi mumkin. Faqat yosh farqi uchun alohida segment yaratish shart emas.')])

google_rows=[['1. Maqsad','Tasdiqlangan murojaat','Tugma bosilishi va haqiqiy ariza ajratilgan'],['2. Hudud va til','Xizmat ko‘rsatiladigan joy va RU/UZ matn','Keraksiz hududlarga sarf tekshirilgan'],['3. Guruh','Bitta xizmatga yaqin so‘rovlar','Har guruh mos sahifaga boradi'],['4. E’lon','Haqiqiy taklif, shart, keyingi qadam','Matn va sahifa bir-biriga mos'],['5. Byudjet','Kelishilgan limit va nazorat vaqti','To‘lov va sarf shartlari tekshirilgan'],['6. Test','Telefon orqali to‘liq ariza','Qabul bo‘ldi, takror hisoblanmadi']]
googlecsv=csvfile('google-search-start.csv',['Bosqich','Vazifa','Tekshiruv'],google_rows)
article('google-reklama-sozlash','uz','Google reklama sozlash: qidiruv kampaniyasi rejasi',
 'Google Search reklamasini boshlash uchun maqsad, kalit so‘z, hudud, e’lon va ariza tekshiruvi. Kichik kampaniya namunasi va CSV cheklist.',
 'Google qidiruv reklamasi foydalanuvchining so‘roviga mos e’lon ko‘rsatadi. Ishni “reklamani yoqish”dan emas, taklif, mos sahifa va tasdiqlangan murojaatni o‘lchashdan boshlang. Quyidagi reja Search kampaniyasi uchun; Performance Max yoki video kampaniya yo‘riqnomasi emas.',
 'google reklama','/uz/internet-reklama-toshkent/','internet-reklama',[
 h('Hisob ochishdan oldin tayyorlanadigan narsalar','tayyorgarlik'),
 li('Haqiqiy narx shartlari, xizmat hududi, aloqa va maxfiylik ma’lumoti bor sahifa.', 'Reklama hisobi egasi va to‘lov uchun mas’ul shaxs.', 'Test arizani tekshiradigan xodim va natijani qabul qilish mezoni.', 'Sarflash mumkin bo‘lgan byudjet, kuzatish davri va to‘xtatish sharti.'),
 p('Kabinetdagi yo‘l hisob holatiga qarab farqlanishi mumkin. Google’ning amaldagi yo‘riqnomasida yangi kampaniya yaratish, maqsad va Search turini tanlash, sozlamalar, guruhlar, e’lonlar va byudjet bosqichlari bor. Quyida tugma joylashuvidan ko‘ra har bosqichda tekshiriladigan qarorlar berilgan.'),
 h('Kichik kampaniya namunasi','tuzilma'),
 p('Tahririy misol: Toshkentda konditsioner tozalash. Bu tayyor import yoki daromad va’dasi emas. Faqat amalda bajariladigan xizmatlar qo‘shiladi; tozalash va o‘rnatish uchun bir xil va’da yozilmaydi.'),
 table(['Guruh','So‘rov g‘oyasi','Sahifa','E’lon g‘oyasi'],[['Tozalash UZ','konditsioner tozalash toshkent','Tozalash xizmati, UZ','Ish tarkibi va narx shartlarini bilish'],['Tozalash RU','чистка кондиционера ташкент','Tozalash xizmati, RU','Уточнить состав работ и стоимость']]),
 p('Bu kalit so‘zlar uchun hajm yoki CPC o‘lchanmagan. Ularni Planner va qidiruv natijasi bilan tekshiring. Til sozlamasi tarjima vazifasini bajarmaydi: e’lon va sahifaning matni o‘zi mos tilda bo‘lishi kerak.'),
 h('Hudud, so‘rov va chiqarib tashlashlar','nazorat'),
 p('Mahalliy xizmatda geografik qamrovni ayniqsa tekshiring. Google’da joylashuvga qiziqish va shu joyda bo‘lish tanlovlari mavjud; biznes vazifasiga mosini tanlang. Xizmat hududi tashqarisidan kelgan murojaatlarni alohida ko‘ring.'),
 p('“Usta vakansiya” kabi so‘rov ish qidirayotgan odamdan kelishi mumkin. Lekin “bepul konsultatsiya”ni ko‘r-ko‘rona chiqarib tashlash ham to‘g‘ri emas: siz shunday maslahat berishingiz mumkin. Har bir minus-so‘z qarori taklifga bog‘liq.'),
 link('Turlari va ehtiyot choralarini rus tilidagi {link} tushuntiradi.','/ru/blog/minus-slova-google-ads/','Google Ads minus-so‘zlar qo‘llanmasi'),
 h('Arizani o‘lchash va ishga tushirish cheklisti','ishga-tushirish'),
 table(['Bosqich','Nima tayyorlanadi','Qabul mezoni'],google_rows),
 p('Forma ochilishi, tugma bosilishi va muvaffaqiyatli yuborilgan ariza — uchta alohida hodisa. Texnik sinovda ariza qabul qilinishini va qayta yuborish takror natija bermasligini tekshiring. CRM’dagi sotuv bilan bog‘lash alohida sozlash va rozilik jarayonini talab qiladi.'),
 link('Kabinetni tekshirish uchun {link}.',googlecsv,'Search ishga tushirish jadvali'),
 link('Sahifaga trafik manbasini yozish uchun {link}. Google Ads avtomatik belgilash va Analytics ulanishi bilan mosligini ham tekshiring.','/ru/utm-generator/','UTM generator'),
 h('Ishga tushgandan keyin nima qilinadi?','keyin'),
 p('Avval sarf, xatolar va murojaat yo‘li kuzatiladi. So‘ng haqiqiy so‘rovlar va ariza sifati asosida keraksiz yo‘nalishlar ajratiladi. Kichik namuna asosida bir kunda hamma matn va auditoriyani almashtirmang: qaysi o‘zgarish ta’sir qilganini bilmay qolasiz.'),
 link('Bajarish tarkibi va kanal tanlovi {link} sahifasida.','/uz/internet-reklama-toshkent/','internet reklama xizmati')],
 [('Google reklamasi SEO o‘rnini bosadimi?','Yo‘q. Pullik kampaniya va organik qidiruvning ishlash va o‘lchash yo‘li boshqa. Bir xil foydali sahifa ikkalasiga xizmat qilishi mumkin.'),('Qancha byudjet yetadi?','Universal summa yo‘q. So‘rov narxi, konversiya, taklif va test vazifasi bo‘yicha hisoblang. Xizmat haqi va platforma sarfini alohida ko‘rsating.'),('Ariza yo‘q, lekin klik bor — nima tekshiriladi?','Mos so‘rov, hudud, sahifa tezligi va mazmuni, forma ishlashi hamda administrator javobi. Klikni avtomatik ravishda sifatli mijoz deb hisoblamang.')],
 [src('Google Ads — Create a Search campaign','https://support.google.com/google-ads/answer/9510373'),src('Google Ads — Location options','https://support.google.com/google-ads/answer/1722038')])

copyrows=[['O‘quv markazi','Eng zo‘r ingliz tili, natija kafolat!','Darajangizga mos ingliz tili guruhini tanlang. Jadval va o‘qish shartlarini bilish uchun yozing.','Isbotsiz ustunlik o‘rniga tekshiriladigan keyingi qadam'],['Kafe','Mazali taomlar, barchaga yoqadi!','Tushlik tanlayapsizmi? Menyudagi taom tarkibi va bugungi mavjud variantlarni ko‘ring.','Barchaga yoqish va’dasi o‘rniga tanlov uchun ma’lumot'],['B2B xizmat','Biznesingizni 10 baravar oshiramiz!','Murojaatlar qayerda yo‘qolayotganini tekshiramiz: forma, administratorga uzatish va qayta aloqa. Ish hajmini boshlang‘ich tekshiruvdan keyin kelishamiz.','Daromad kafolati o‘rniga aniq bajariladigan ish']]
copycsv=csvfile('kopirayting-brif.csv',['Savol','Javob','Dalil yoki tekshiruvchi'],[['Kim uchun?','',''],['Qanday vazifa?','',''],['Taklifga nima kiradi?','',''],['Qanday cheklov bor?','',''],['Qaysi dalil mavjud?','',''],['Keyingi amal nima?','',''],['Kim tasdiqlaydi?','','']])
article('kopirayting-nima','uz','Kopirayting nima? Matnni yaxshilashning 3 misoli',
 'Kopirayting vazifasi, uchta oldin-keyin matn, brif shabloni va tahririy cheklist. Faktlarni to‘qimasdan aniq reklama matni yozish.',
 'Kopirayting — o‘quvchiga taklifni tushunish va keyingi qadamni tanlashga yordam beradigan matn yozish. U post, reklama, sahifa yoki xat uchun kerak bo‘lishi mumkin. Yaxshi matn faqat kuchli ibora emas: kimga, nima taklif qilinishi, qaysi shartlarda va nima qilish kerakligini aniq aytadi.',
 'kopirayting nima','/uz/smm-xizmatlari/','smm-uz',[
 h('Kopirayter nima qiladi?','vazifa'),
 p('Kopirayter boshlang‘ich ma’lumotni yig‘adi, auditoriya savolini ajratadi, tuzilma va matn variantlarini tayyorlaydi. Muharrirlikda fakt, ortiqcha va’da, ohang va o‘qish qulayligi tekshiriladi. Faqat so‘z sonini ko‘paytirish yoki raqobatchining matnini sinonim bilan almashtirish vazifani bajarmaydi.'),
 table(['Ish','Natija','Qabul savoli'],[['Brif','Taklif, auditoriya, cheklov','Ma’lumot egasi tasdiqladimi?'],['Qoralama','Bitta asosiy fikr va CTA','O‘quvchi nimani tushunadi?'],['Tahrir','Aniq, tekshirilgan matn','Isbotsiz va’da qoldimi?'],['Nashr tekshiruvi','Mos sahifa yoki post','Havola va forma ishlaydimi?']]),
 h('Uchta oldin-keyin misol','misollar'),
 p('Quyidagi matnlar o‘quv namunalari. Haqiqiy brend nomi, narx yoki mijoz natijasi kiritilmagan. Ularni o‘z faktlaringizga moslashtirmasdan tayyor reklama sifatida yubormang.'),
 table(['Vazifa','Zaif matn','Aniqroq matn','Nima o‘zgardi'],copyrows),
 h('Matn yozishdan oldingi brif','brif'),
 li('Kim o‘qiydi va qanday vaziyatda?', 'O‘quvchi hozir nimani biladi, nimani bilmaydi?', 'Taklif tarkibi va xarajat shartlari qanday?', 'Qaysi da’voga tasdiqlangan dalil bor?', 'Nima kirmaydi va kim uchun mos emas?', 'O‘qigandan keyingi bitta asosiy amal nima?'),
 link('Javoblarni {link} ichiga yozing. Savol javobsiz qolsa, matnda taxminni fakt qilib yozmang.',copycsv,'kopirayting brifi'),
 h('Bir matnni Telegram va Instagram’ga moslashtirish','format'),
 p('Telegram’da matnning o‘zi ko‘proq yukni olishi mumkin: birinchi jumla vazifani, keyingi qismlar shartni tushuntiradi. Instagram’da rasm yoki video asosiy dalilni ko‘rsatsa, matn uni takrorlamasdan kontekst va keyingi qadamni beradi. Barcha kanalda narx va taklif bir xil tasdiqlangan manbadan olinishi kerak.'),
 p('O‘zbekcha matnni so‘zma-so‘z ruscha tuzilmada qoldirmang. Xizmat atamasi, apostroflar va murojaat ohangini tekshiring. O‘qib berib ko‘rish uzun va chalkash jumlalarni topishga yordam beradi. Brendning tanish atamalarini esa sun’iy almashtirish shart emas.'),
 h('AI bilan qoralama, odam bilan tekshirish','ai'),
 p('AI’ga faktlar va taqiqlangan va’dalarni bering: “Mana tasdiqlangan ma’lumotlar. Uchta qisqa variant yoz. Yetishmayotgan narx, muddat va natijani o‘ylab topma; savol sifatida belgilab qo‘y.” Shaxsiy mijoz ma’lumotlarini promptga kiritmang.'),
 link('Qoralama tayyorlash uchun {link}. Natijani nashrdan oldin brif va dalillar bilan solishtiring.','/uz/gpt-telegram-instagram-ideya/','reklama matni va post g‘oyalari vositasi'),
 h('Tayyor matnni tekshirish','tahrir'),
 li('Birinchi ikki jumlada vazifa va taklif tushunarlimi?', '“Eng yaxshi”, “kafolat”, “hamma” kabi so‘zlarning dalili bormi?', 'Narx yonida nima kirishi va alohida xarajatlar ko‘rsatilganmi?', 'Bitta asosiy CTA bormi va ishlaydimi?', 'Matn rasm, sahifa va administrator aytadigan shartlarga mosmi?')],
 [('Kopirayting va kontent farqi nima?','Kontent keng tushuncha: rasm, video, matn va vositalarni qamraydi. Kopirayting matn yaratish vazifasidir.'),('Qisqa matn doim yaxshimi?','Yo‘q. Qaror uchun kerakli ma’lumot yetarli bo‘lishi kerak. Takror va bezakni qisqartiring, muhim shartni emas.'),('AI kopirayter o‘rnini to‘liq bosadimi?','AI qoralama va variantlarga yordam beradi. Fakt, huquq, taklif shartlari va yakuniy nashr uchun inson tekshiruvi zarur.')])

# The second half adds Russian practical resources, tools and existing-page edits.
topics=[
 ('Как определить уровень','Карусель','Понять выбор группы','Схема диагностики','Узнать порядок тестирования'),
 ('Одна задача с объяснением','Видео','Показать метод','Разбор преподавателя','Попробовать решить'),
 ('Вопросы до записи','Пост','Подготовить обращение','Список данных','Сохранить чеклист'),
 ('Что проходит на первом занятии','Stories','Снять неопределённость','Реальная программа','Задать вопрос'),
 ('График доступных групп','Карточка','Проверить удобство','Подтверждённое расписание','Уточнить место'),
 ('Как повторять материал','Карусель','Помочь самостоятельно','Пример упражнения','Выполнить упражнение'),
 ('Ответы администратора','Stories','Собрать вопросы','Анонимные типовые вопросы','Оставить вопрос'),
 ('Знакомство с преподавателем','Видео','Показать подход','Согласованное интервью','Посмотреть объяснение'),
 ('Ошибки в одной теме','Карусель','Обучить','Три учебных примера','Проверить себя'),
 ('Что входит в оплату','Пост','Объяснить условия','Действующий договор','Прочитать условия'),
 ('Как добраться','Видео','Упростить визит','Маршрут и вход','Сохранить адрес'),
 ('Мини-тест','Stories','Вовлечь в практику','Задания с ответами','Сверить решение'),
 ('Работа с домашним заданием','Пост','Показать процесс','Пример обратной связи','Уточнить формат'),
 ('Разбор вопросов недели','Эфир или пост','Закрыть сомнения','Собранные вопросы','Выбрать следующий шаг'),
 ('Цель обучения','Карусель','Помочь поставить цель','Лист целей','Записать свою цель'),
 ('Демонстрация урока','Видео','Показать продукт','Согласованный фрагмент','Узнать условия посещения'),
 ('Кому курс не подойдёт','Пост','Уточнить соответствие','Требования программы','Проверить соответствие'),
 ('Самостоятельная практика','Stories','Поддержать обучение','Короткое упражнение','Отправить ответ'),
 ('Как измеряется прогресс','Карусель','Объяснить оценку','Критерии преподавателя','Задать вопрос о цели'),
 ('Ответ о пропусках','Пост','Объяснить правило','Действующие условия','Проверить правила'),
 ('Проверка расписания','Stories','Обновить информацию','Актуальные группы','Уточнить удобное время'),
 ('Учебная привычка','Пост','Помочь закреплению','Личный план практики','Составить план'),
 ('Словарь одной ситуации','Карусель','Дать полезный материал','Авторские примеры','Сохранить карточки'),
 ('Вопрос преподавателю','Видео','Показать объяснение','Согласованный вопрос','Предложить тему'),
 ('Что взять с собой','Чеклист','Подготовить визит','Реальный список','Сохранить список'),
 ('Путь от заявки до группы','Карусель','Объяснить процесс','Этапы записи','Начать консультацию'),
 ('Проверка ожиданий','Stories','Уточнить потребность','Один открытый вопрос','Описать задачу'),
 ('Повторный мини-тест','Пост','Помочь самопроверке','Новый набор заданий','Сверить ответы'),
 ('Итоги материалов месяца','Карусель','Упростить навигацию','Подборка ссылок','Открыть нужный материал'),
 ('Вопросы для следующего месяца','Stories','Выбрать темы','Ответы аудитории','Предложить вопрос')]
calendar=[]
for i,(topic,fmt,goal,material,cta) in enumerate(topics,1):
    calendar.append([str(i),'Будущий ученик / родитель: уточнить для своей программы',goal,topic,fmt,material,cta,'Сохранения / вопросы / подходящие обращения: выбрать по цели','Редактор + преподаватель','Черновик'])
calcsv=csvfile('kontent-plan-uchebnyi-tsentr-30-dney.csv',['День','Аудитория','Цель','Тема','Формат','Материал','CTA','Показатель','Ответственный','Статус'],calendar)
posttexts=[
 ('Как выбрать группу по уровню','Одинаковое название уровня не всегда означает одинаковую подготовку. Перед записью расскажите, что уже изучали, где используете язык и какую задачу хотите решить. Уточните у центра, как проходит диагностика и кто объясняет её результат. Спросите не только название группы, но и её текущую тему. Сохраните эти вопросы и возьмите их на консультацию.'),
 ('Не знаете, что спросить до записи?','Начните с пяти вопросов: какие дни и время занятий, сколько длится курс, что входит в оплату, как проверяется прогресс и какие правила действуют при пропуске. Неудобное расписание не исправить красивой программой. Сначала проверьте условия, затем выбирайте группу. Напишите администратору свою цель и подходящее время — так разговор будет предметнее.'),
 ('Одна ошибка в английском','Как сказать «я согласен»? Вариант I am agree неверен: agree здесь уже глагол. Используйте I agree. Сравните: I am ready — «я готов», но I agree — «я согласен». Попробуйте дополнить фразу: I agree with … . Это маленькая практика, а не определение вашего уровня. Для выбора программы нужна более полная диагностика.'),
 ('Почему «учу язык» — слишком широкая цель','Попробуйте назвать ситуацию: представить свой проект, понять вопрос клиента или прочитать рабочее письмо. Затем опишите, что именно сейчас не получается. С таким описанием проще выбрать упражнения и проверять прогресс. Запишите одну ситуацию и один наблюдаемый результат. На консультации покажите их преподавателю вместо обещания «выучить всё быстро».'),
 ('Как повторить материал после урока','Выберите один небольшой фрагмент, попробуйте воспроизвести его без подсказки, затем сравните с материалом урока. Отметьте, где ошиблись, и задайте точный вопрос преподавателю. Перечитывание всего конспекта не показывает, что вы можете сделать самостоятельно. Попробуйте сегодня объяснить одну тему своими словами и запишите место, где понадобилась помощь.'),
 ('Что означает пробел в знаниях','Один неверный ответ не описывает все ваши способности. Полезнее найти, на каком шаге появилась ошибка: не поняли условие, забыли правило или не смогли применить его. Сохраните свою попытку решения, а не только итог. Преподавателю будет проще дать обратную связь. Возьмите один сложный пример и подпишите, что именно в нём непонятно.'),
 ('Что проверить в стоимости курса','Сравнивайте одинаковый состав: продолжительность занятия, число занятий, материалы, диагностику и правила переноса. Низкая цена за месяц может включать меньше учебного времени. Попросите условия письменно и уточните отдельные платежи. Этот чеклист помогает сравнить варианты; окончательную цену и действующие условия подтверждает выбранный учебный центр.'),
 ('Как подготовиться к первой консультации','Запишите цель, текущий опыт, доступные дни и вопрос, который волнует больше всего. Если есть пример задания, с которым не справились, возьмите его с собой. Не отправляйте в открытые комментарии телефон ребёнка, документы или другие личные данные. Контакты передавайте только через предусмотренный центром канал. Начните разговор с задачи, которую хотите решить.')]
article('kontent-plan-dlya-uchebnogo-tsentra','ru','Контент-план для учебного центра на 30 дней',
 'Редактируемый календарь на 30 дней: цели, материалы, CTA и ответственные. Восемь готовых текстов, порядок согласования и оценка обращений.',
 'Контент-план учебного центра связывает вопросы будущего ученика с материалами, которые помогают выбрать программу. Ниже — календарь на 30 дней, восемь авторских текстов и рабочая таблица без регистрации. Это редакционный пример, а не отчёт клиента и не обещание набора группы.',
 'контент план для учебного центра','/ru/smm-prodvizhenie-tashkent/','smm-ru',[
 h('Как адаптировать план к вашему центру','adaptatsiya'),
 p('Выберите одну программу и одну аудиторию. Курс английского для взрослых и подготовка школьников требуют разных вопросов, примеров и согласований. Подставьте реальное расписание, условия оплаты и доступные материалы. День в таблице означает слот: ежедневная публикация не обязательна. Если команда может качественно делать три материала в неделю, растяните календарь.'),
 link('Откройте {link}: в нём уже есть цель, аудитория, материал, CTA, показатель, ответственный и статус.',calcsv,'CSV-календарь на 30 дней'),
 h('Календарь: от первого знакомства до записи','calendar'),
 table(['День','Тема','Формат','Задача','Следующий шаг'],[[str(i),t[0],t[1],t[2],t[4]] for i,t in enumerate(topics,1)]),
 h('Восемь текстов для адаптации','teksty'),
 p('Тексты не содержат выдуманных отзывов, цены или обещаний результата. Проверьте соответствие вашей программе и отредактируйте обращение к аудитории. Пример по английскому предназначен для языкового центра; в другой нише замените его разбором своего предмета.'),
 *[b for title,text in posttexts for b in [{'type':'h3','text':title},p(text)]],
 h('Согласование без задержек и подмены фактов','soglasovanie'),
 table(['Шаг','Ответственный','Что проверяет'],[['Бриф','Администратор','Актуальное расписание, правила и наличие мест'],['Материал','Преподаватель','Точность объяснения и учебных примеров'],['Редактура','Контент-редактор','Один смысл, понятный текст, корректный CTA'],['Публикация','SMM-специалист','Формат, ссылка, мобильный вид'],['Обратная связь','Администратор','Вопросы и соответствие обращения программе']]),
 p('Съёмка учеников, публикация переписок и отзывов требуют отдельного согласования и проверки прав. Для демонстрации метода достаточно преподавателя, доски и авторского задания. Заполненный календарь не заменяет подтверждение расписания перед публикацией.'),
 h('Как понять, что план помогает','izmerenie'),
 p('Отмечайте не только охват, но и вопрос, который снял материал. Для чеклиста подходят сохранения и переходы; для приглашения — обращения и их соответствие программе. Запись на курс подтверждается в учётной системе. Сохраняйте одинаковый период сравнения и не приписывайте все продажи последнему посту.'),
 link('Для ссылок на сайт используйте {link}; метка источника сама по себе не подтверждает оплату.','/ru/utm-generator/','генератор UTM'),
 link('Если нужен выпуск и сопровождение материалов, посмотрите {link}.','/ru/smm-prodvizhenie-tashkent/','состав SMM-услуг')],
 [('Можно использовать план бесплатно?','Да, календарь и тексты доступны без регистрации. Адаптируйте факты, программу и условия перед публикацией.'),('Нужно ли публиковать каждый день?','Нет. Тридцать слотов можно распределить на удобный срок. Согласование и качество ответа важнее заполнения календаря.'),('Включена ли реклама?','Это план контента. Настройка рекламы, бюджет размещения и съёмка обсуждаются отдельно; не считайте их автоматически включёнными.')])

negrows=[['работа','Широкое','Кандидаты в сотрудники','Ремонтные работы — полезный запрос','Не применять без просмотра запросов'],['вакансии','Широкое','Поиск работы','Если сайт сам продаёт подбор персонала','Проверить предложение'],['своими руками','Фразовое','Самостоятельное выполнение','Может быть этапом выбора подрядчика','Решить по цели кампании'],['скачать бесплатно','Фразовое','Поиск бесплатного файла','Если бесплатный материал часть воронки','Не блокировать автоматически'],['kurs ishi','Фразовое','Поиск курсовой работы','Курсы и курсовая — разные задачи','Проверить фактический запрос'],['ish o‘rinlari','Фразовое','Поиск вакансий','Кадровое агентство может обслуживать этот спрос','Проверить варианты написания'],['[образец резюме]','Точное','Конкретный информационный запрос','Если вы продвигаете сервис резюме','Снять скобки из значения при импорте через отдельную колонку типа']]
negcsv=csvfile('minus-slova-review.csv',['Кандидат','Тип','Возможная причина','Риск блокировки','Решение до применения'],negrows)
article('minus-slova-google-ads','ru','Минус-слова Google Ads: как исключать лишние запросы',
 'Широкие, фразовые и точные минус-слова для поиска Google. Примеры блокировок, RU/UZ список для проверки и безопасный порядок применения.',
 'Минус-слова ограничивают показ по нежелательным поисковым запросам. Их выбирают по смыслу конкретного предложения: слово «бесплатно» может быть лишним для платного товара и полезным для бесплатной консультации. Здесь — рабочий лист для проверки, а не универсальный список для загрузки во все кампании.',
 'минус слова google ads','/ru/kontekstnaya-reklama-tashkent/','context-ru',[
 h('Три типа: что именно будет исключено','tipy'),
 table(['Тип','Минус-слово','Пример блокировки','Пример, который этим правилом не блокируется'],[['Широкое','красные кроссовки','купить кроссовки красные','купить кроссовки'],['Фразовое','"красные кроссовки"','купить красные кроссовки','кроссовки красные купить'],['Точное','[красные кроссовки]','красные кроссовки','купить красные кроссовки']]),
 p('Таблица описывает только это отрицательное правило для поисковой кампании. Фактический показ зависит и от остальных настроек. Минус-слова не работают как положительное широкое соответствие: синонимы и формы единственного/множественного числа требуют проверки. По актуальной справке Google регистр и опечатки учитываются автоматически. Для контекстно-медийных и видеокампаний действуют другие правила.'),
 h('RU/UZ кандидаты: решение принимается после проверки','spisok'),
 table(['Кандидат','Тип','Возможная причина','Что можно случайно потерять','Действие'],negrows),
 link('Сохраните {link}. Это таблица для ручного рассмотрения, не готовый файл импорта.',negcsv,'CSV со списком и рисками'),
 p('В узбекских запросах встречаются разные апострофы, латиница и кириллица. Сохраняйте фактическое написание из отчёта, проверяйте варианты отдельно и не считайте все написания одним уже исключённым словом. Названия населённых пунктов также не стоит добавлять в минус-список без проверки: человек может искать услугу для другого места.'),
 h('Как не отрезать хороший спрос','oshibki'),
 table(['Ситуация','Опасное действие','Более точное решение'],[['Ремонт техники','Исключить слово «работа»','Разобрать запросы о вакансии отдельно от ремонтных работ'],['Продажа курса','Исключить «бесплатно» везде','Проверить, предлагается ли бесплатный вводный материал'],['Клиент сравнивает','Исключить все слова «отзывы» и «сравнение»','Оценить соответствующую страницу и качество обращений'],['Два языка','Скопировать русский список в UZ','Проверить значение и реальные запросы на каждом языке']]),
 h('Порядок изменения рабочего аккаунта','process'),
 li('Сохраните текущие списки и привязки: на каком уровне действует каждое правило.', 'Отберите фактические запросы за сопоставимый период и добавьте причину исключения.', 'Проверьте каждое правило на примерах нужных и ненужных запросов.', 'Выберите область действия: один набор объявлений, кампания или общий список. Не расширяйте её автоматически.', 'Внесите небольшую понятную группу изменений, зафиксируйте дату и наблюдайте расход, запросы и качество обращений.', 'Если полезный спрос исчез, откатите конкретное правило и перепроверьте причину.'),
 p('Падение кликов само по себе не доказывает улучшение. Смотрите, сократился ли ненужный расход и сохранились ли подходящие обращения. При малом объёме данных результат может быть неопределённым; это лучше, чем объявить победу по двум кликам.'),
 link('Общий процесс запуска описан на странице {link}.','/ru/kontekstnaya-reklama-tashkent/','контекстной рекламы в Ташкенте')],
 [('Нужно ли добавлять все словоформы?','Не считайте близкие варианты автоматически исключёнными. Проверьте формы и синонимы по справке Google и реальным запросам. Регистр и опечатки рассматриваются иначе.'),('Можно использовать один список везде?','Только если каждый пункт действительно лишний для всех затрагиваемых предложений. Иначе общий список может блокировать нужный спрос.'),('Этот файл готов к импорту?','Нет. Это лист проверки с причинами и рисками. После решения подготовьте отдельный импорт под формат выбранного инструмента.')],
 [src('Google Ads — About negative keywords','https://support.google.com/google-ads/answer/2453972','Правила для поисковых кампаний; проверено 09.11.2026.')])

semrows=[
 ['seo nima','UZ','Информация','/uz/blog/seo-nima/','50','Google Ads через OpenSEO, UZ 2860, параметр языка ru','2026-11-09','Отдельный ответ; не услуга'],
 ['kontent nima','UZ','Информация','/uz/blog/kontent-nima/','390','Google Ads через OpenSEO, UZ 2860, параметр языка ru','2026-11-09','Не смешивать с контент-планом'],
 ['maqsadli auditoriya','UZ','Практическая информация','/uz/blog/maqsadli-auditoriya/','30','Google Ads через OpenSEO, UZ 2860, параметр языка ru','2026-11-09','Портрет и сегментация'],
 ['генератор utm меток','RU','Использовать инструмент','/ru/utm-generator/','10','Google Ads через OpenSEO, UZ 2860, параметр языка ru','2026-11-09','Нужен работающий генератор'],
 ['минус слова google ads','RU','Практическая информация','/ru/blog/minus-slova-google-ads/','10','Google Ads через OpenSEO, UZ 2860, параметр языка ru','2026-11-09','Спрос нерегулярен; небольшой пилот'],
 ["o‘quv markazi / o'quv markazi / oʻquv markazi",'UZ','Проверить выдачу','Не назначен','Не измерено','Редакционный пример вариантов','2026-11-09','Не создавать страницу на каждый апостроф']]
semcsv=csvfile('semantika-ru-uz.csv',['Запрос или варианты','Язык текста','Намерение','URL-владелец','Средний объём за месяц','Источник и рынок','Дата','Решение'],semrows)
article('semanticheskoe-yadro-ru-uz','ru','Семантическое ядро RU/UZ: запросы и страницы сайта',
 'Как собрать запросы на русском и узбекском без дублей страниц. Заполненная карта намерений, источники частотности и CSV-шаблон.',
 'Семантическое ядро — карта запросов, пользовательских задач и страниц, которые на них отвечают. Для двуязычного сайта недостаточно перевести список: нужно проверить формулировки и выдачу, назначить владельца намерения и отличить перевод страницы от материала с другой задачей.',
 'семантическое ядро','/ru/seo-prodvizhenie-saytov-tashkent/','seo-ru',[
 h('Сначала задача пользователя, затем ключевые слова','intent'),
 p('«SEO nima» просит объяснение. Запрос услуги SEO предполагает состав работ и условия. «Генератор UTM» требует работающего инструмента. Если все три задачи закрывает одинаковый рекламный текст, проблема не в количестве повторений ключа. Разделять страницы нужно по полезному результату для человека, а не по каждому варианту написания.'),
 h('Заполненный фрагмент ядра','primer'),
 table(['Запрос','Язык','Намерение','Владелец','Среднее/мес.','Решение'],[[r[0],r[1],r[2],r[3],r[4],r[7]] for r in semrows]),
 p('Числа проверены 9 ноября 2026 года в OpenSEO по данным Google Ads для Узбекистана, location 2860, с параметром языка ru. Узбекские запросы передавались буквально. Это не отдельная оценка только узбекоязычной аудитории. Средние относятся к доступному годовому ряду октябрь 2025 — сентябрь 2026; не равны будущим кликам и не суммируются без проверки пересечения. Для вариантов апострофа объём не измерялся.'),
 link('Скачайте {link}: в файле есть рынок, дата, источник и решение по каждому запросу.',semcsv,'заполненную CSV-карту RU/UZ'),
 h('Где брать запросы','istochniki'),
 li('Search Console: фактические запросы и URL вашего сайта. Сохраняйте период, страну, устройство и тип поиска.', 'Keyword Planner или поставщик метрик: идеи и оценки спроса с указанием рынка, языка и даты.', 'Живая выдача: тип результата, задача страницы и состав конкурентов. Один снимок не гарантирует устойчивость.', 'Обращения клиентов: формулировки вопросов без переноса персональных данных.', 'Внутренний поиск сайта, если он существует: неудовлетворённые задачи, а не автоматическое разрешение создавать страницу.'),
 h('Апострофы, кириллица и перевод','yazyki'),
 p('Сохраните исходное написание и отдельную нормализованную колонку для анализа. o‘, oʻ и o\' могут обозначать близкую форму, но нельзя просто суммировать все объёмы. Узбекскую кириллицу и латиницу проверяйте по смыслу и выдаче. Совпадение темы не означает, что русская и узбекская страницы — полные эквиваленты.'),
 p('Обычная межъязыковая ссылка уместна на полезный материал. Hreflang обозначает альтернативные языковые версии; не связывайте им, например, русскую коммерческую услугу и узбекский словарь. Существующий работающий URL сохраняйте, если нет подтверждённой причины миграции.'),
 h('Решение: усилить, объединить или создать','reshenie'),
 table(['Наблюдение','Действие','Что сохранить'],[['Одна задача уже есть на сайте','Усилить текущий URL','Историю, ссылки и основной поисковый смысл'],['Варианты слов ведут к одинаковой задаче','Одна страница, естественные формулировки','Не создавать копии под написания'],['Задача отличается и есть полезный материал','Создать отдельную страницу','Контекстную связь с услугой'],['Два URL делят запросы','Проверить выдачу и конверсии до объединения','Без автоматического 301 по сходству темы']]),
 h('Как проверить результат после публикации','kontrol'),
 p('Зафиксируйте исходные показы и URL, дождитесь повторного обхода, затем сравните одинаковые периоды. Смотрите, получает ли новый материал свои запросы и не теряет ли основной URL коммерческие обращения. Отсутствие показов на новой странице в первые дни не доказывает ни провал, ни отсутствие спроса. Не расширяйте пилот автоматически.'),
 link('Техническую проверку и карту работ можно заказать через {link}.','/ru/seo-prodvizhenie-saytov-tashkent/','SEO-продвижение сайта'),
 link('Краткое объяснение для узбекской команды — {link}.','/uz/blog/seo-nima/','SEO nima')],
 [('Можно сложить объёмы всех похожих запросов?','Без проверки нельзя: близкие варианты могут пересекаться, а источники агрегируют их по-разному. Это оценка спроса, не прогноз трафика.'),('Для каждого ключа нужна страница?','Нет. Одна страница должна отвечать на самостоятельную задачу и может покрывать несколько близких формулировок.'),('Нулевой или неизвестный объём запрещает материал?','Нет, но нужно честно отметить отсутствие оценки, объяснить пользу и ограничить пилот. Не заменяйте неизвестное выдуманной частотностью.')],
 [src('Google Ads — Refine keywords in Keyword Planner','https://support.google.com/google-ads/answer/6325025'),src('Google Search Central — Localized versions','https://developers.google.com/search/docs/specialty/international/localized-versions')])

def tool(slug,title,desc,keyword,hub,body,faq):
    url='/ru/'+slug+'/'
    if url in FILES:raise RuntimeError('Existing tool '+url)
    d={'status':'published','locale':'ru','url':url,'slug':slug,'pageType':'tool','primaryKeyword':keyword,'secondaryKeywords':[],
       'searchIntent':'informational','title':title,'h1':title,'description':desc,'heroSubtitle':desc,
       'canonical':'https://gptbot.uz'+url,'robotsIndex':True,'robotsFollow':True,
       'bodyBlocks':body,'faq':[{'q':q,'a':a} for q,a in faq],
       'internalLinks':[{'target':hub,'anchor':'Помощь с рекламой и измерением','locale':'ru','type':'contextual'}],
       'schemaTypes':['Organization','WebSite','BreadcrumbList','WebPage','FAQPage'],
       'extraJsonLd':[{'@type':'WebApplication','@id':'https://gptbot.uz'+url+'#tool','name':title,'url':'https://gptbot.uz'+url,'applicationCategory':'BusinessApplication','operatingSystem':'Any','browserRequirements':'JavaScript','isAccessibleForFree':True,'inLanguage':'ru','description':desc}],
       'sources':[], 'createdAt':STAMP,'updatedAt':STAMP,'lastReviewedAt':DATE}
    f=ROOT/'content/pages/ru'/(slug+'.json');write(f,d);FILES[url]=(f,d);CHANGES[url]=['new']

tool('utm-generator','Генератор UTM-меток для рекламных ссылок',
 'Создайте ссылку с UTM для Meta, Google или Telegram-размещений. Бесплатно, без регистрации: параметры обрабатываются в браузере.',
 'генератор utm меток','/ru/kontekstnaya-reklama-tashkent/',[
 h('Как пользоваться генератором','instruction'),
 li('Вставьте полный адрес страницы, начинающийся с https:// или http://.', 'Укажите источник, тип трафика и название кампании. Для вариантов объявления используйте utm_content.', 'Выберите, заменить ли существующие UTM. Прочие параметры и якорь сохраняются.', 'Создайте и скопируйте ссылку. Проверьте конечный адрес, загрузку страницы и сохранение меток после переходов.'),
 h('Поля и примеры для каналов','parameters'),
 table(['Поле','Что хранит','Пример'],[['utm_source','Источник','facebook / google / telegram'],['utm_medium','Тип трафика','paid_social / cpc / paid_placement'],['utm_campaign','Кампания','english_evening_nov'],['utm_content','Вариант объявления','video_teacher_a'],['utm_term','Ключевое слово при необходимости','english_course']]),
 p('Названия чувствительны к регистру. Выберите единую систему и не меняйте её посреди сравнения. paid_placement в примере — собственная метка; для нужной группировки каналов проверьте правила Analytics. Не записывайте в метки телефон, e-mail, имя клиента, пароль или токен: URL может попасть в историю, журналы и аналитику.'),
 h('Готовые схемы разметки','channel-examples'),
 table(['Размещение','source','medium','content','Что проверить'],[['Meta','facebook','paid_social','image_offer_a','Место назначения и события сайта'],['Google Search','google','cpc','search_service_a','Автоматическое тегирование и связь Ads/Analytics'],['Пост в Telegram-канале','telegram','paid_placement','channel_demo_post_1','Переход именно на ваш сайт']]),
 p('Для ссылки непосредственно на t.me обычные UTM не создают аналитику вашего сайта и не доказывают подписку или запуск бота. Для бота нужен поддерживаемый им start-параметр и обработка события на стороне бота. Этот генератор не меняет настройки бота и не создаёт такую интеграцию.'),
 h('Проверка результата в аналитике','analytics'),
 p('UTM описывают источник перехода, но не гарантируют запись события: на неё влияют настройка аналитики, согласие посетителя, блокировки и редиректы. Отправьте тестовый переход, затем проверьте данные в своей системе. Не используйте UTM для обычных внутренних ссылок между страницами сайта: они нужны для внешних кампаний.'),
 p('Инструмент не сокращает URL, не открывает введённую ссылку и не передаёт содержимое полей на сервер. При сохранении старых меток ваши новые значения добавятся только в отсутствующие поля. При замене очищаются стандартные UTM-поля этой формы, в том числе оставленные пустыми term и content; остальные параметры сохраняются.'),
 link('Экономику полученных заказов можно оценить через {link}.','/ru/roas-kalkulyator/','калькулятор ROAS')],
 [('Ссылка заменяет настройку конверсий?','Нет. Она помечает источник. Подтверждённую заявку, оплату и связь с CRM нужно настраивать отдельно.'),('Можно использовать кириллицу?','Да. Генератор кодирует значения для URL. Для удобства командной работы часто выбирают короткие единообразные имена латиницей.'),('Сохраняется ли введённый адрес?','Внутри генератора нет отправки или хранения введённых значений. Скопированная ссылка остаётся под вашим контролем.')])
FILES['/ru/utm-generator/'][1]['sources']=[src('Google Analytics — URL builders','https://support.google.com/analytics/answer/10917952')]
write(*FILES['/ru/utm-generator/'])
tool('roas-kalkulyator','Калькулятор ROAS и порога окупаемости рекламы',
 'Рассчитайте выручку на каждый сум рекламных расходов, ROAS в процентах и порог при заданной марже. Бесплатный расчёт в браузере.',
 'калькулятор roas','/ru/performance-marketing-tashkent/',[
 h('Формулы без подмены выручки прибылью','formula'),
 p('ROAS = выручка, отнесённая к рекламе ÷ расходы на размещение. Для процентов умножьте результат на 100. Например, 6 000 000 сум выручки и 2 000 000 сум расходов дают 3×, или 300%. Это выручка на расход, а не прибыль 300%.'),
 p('Если m — доля выручки, остающаяся после переменных затрат до рекламы, то порог покрытия только рекламного расхода равен 1 ÷ m. При 40% это 2,5×, или 250%. Маржа 40% не равна наценке 40%. При нулевой марже положительную стоимость рекламы такой моделью покрыть нельзя.'),
 table(['Выручка, сум','Реклама, сум','ROAS','Маржа до рекламы','После переменных затрат и рекламы'],[['6 000 000','2 000 000','3× / 300%','40%','400 000 сум'],['3 000 000','1 000 000','3× / 300%','20%','−400 000 сум'],['2 500 000','1 000 000','2,5× / 250%','40%','0 сум']]),
 h('Что включать в исходные числа','inputs'),
 li('Используйте одну валюту и один сопоставимый период. Не смешивайте доллары расхода и сумы выручки без пересчёта.', 'Выручку берите по согласованной модели атрибуции. Заявка, обещание оплатить и оплаченный заказ различаются.', 'Возвраты и отмены учитывайте последовательно. Если отчёт уже за вычетом возвратов, не вычитайте их второй раз.', 'В расход ROAS здесь входит размещение. Гонорар команды, производство, налоги и постоянные расходы учитывайте отдельно или последовательно включайте в свою расширенную модель.'),
 h('Ограничения расчёта','limits'),
 p('Результат после переменных затрат и рекламы не является чистой прибылью. Он не учитывает постоянные расходы, комиссии, налоги и оплату команды, если они ещё не включены в выбранную маржу. Повторные покупки и задержка оплаты могут менять картину. Платформы могут приписывать себе одну продажу одновременно — не складывайте их выручку без сверки.'),
 p('Для услуг с длинным циклом сделки сначала учитывают подходящие обращения и подтверждённые продажи. Высокий ROAS на нескольких заказах не гарантирует такой же результат при увеличении бюджета. Калькулятор проверяет арифметику, а не качество исходных данных.'),
 link('Для разметки внешних переходов используйте {link}.','/ru/utm-generator/','генератор UTM-меток'),
 link('Если пока известны только расходы и заявки, начните с {link}.','/ru/kontekstnaya-reklama-tashkent/','CPL-калькулятора на странице контекстной рекламы')],
 [('Какой ROAS хороший?','Универсального значения нет. Сначала рассчитайте маржу, остальные расходы и требования бизнеса. Один и тот же 3× может оставлять положительный или отрицательный остаток.'),('Чем ROAS отличается от ROMI?','ROAS сопоставляет выручку с рекламным расходом. Для ROMI обычно используют прибыль или маржинальный доход и более широкий маркетинговый расход; всегда уточняйте формулу.'),('Можно считать при нулевом расходе?','Деление на ноль не определено. Генератор просит расход больше нуля и не показывает бесконечную эффективность.')])

# Strengthen the ten existing owners; keep title, H1, description, canonical,
# hreflang, published prices, forms and current tools unchanged.
touch('/uz/blog/target-reklama-nima/',[
 h('Bitta vazifa uch bosqichda','amaliy-namuna'),
 p('O‘quv markazi misoli: e’lon kechki darsga qiziqqan odamga taklifni ko‘rsatadi; sahifa yoki yozishma jadval va shartni tushuntiradi; administrator daraja va qulay vaqtni aniqlaydi. Ko‘rish, murojaat va yozilish alohida natijalardir. Targetolog reklama yo‘lini sozlaydi, lekin kurs mosligini va sotuvni markaz xodimi tasdiqlaydi.'),
 table(['Vazifa','Natija','Mas’ul'],[['Taklifni tayyorlash','Haqiqiy shart va material','Biznes + marketing'],['Reklamani sozlash','Maqsad, auditoriya, kreativ, o‘lchash','Targetolog'],['Arizani qabul qilish','Moslik va keyingi qadam','Administrator']]),
 link('Boshlang‘ich segmentni {link} yordamida aniqlang.','/uz/blog/maqsadli-auditoriya/','maqsadli auditoriya jadvali')],at=3)
# Remove unsupported universal tactical advice inside the existing article.
f,d=FILES['/uz/blog/target-reklama-nima/']
for b in d['body']:
 if b['type']=='list':
  b['items']=[('Auditoriya torligi o‘z-o‘zidan yaxshi natija bermaydi. Byudjet va tekshiriladigan gipotezaga mos qamrovni tanlab, ariza sifatini kuzating.' if 'tor segmentdan boshlab' in t else 'Bir testda bitta asosiy farazni tekshiring; kichik byudjetni ortiqcha ko‘p segmentga bo‘lmang.' if 'Bitta kampaniyada bitta auditoriya' in t else t) for t in b['items']]
write(f,d)
touch('/ru/targetirovannaya-reklama-tashkent/',[
 h('Как принять настройку: пример для учебного центра','acceptance-example'),
 p('Учебный пример, не кейс клиента: задача — обращения на вечернюю программу. До запуска подтверждаем расписание, стоимость, свободные места и ответственного администратора. Кампания готова к приёмке, когда выполнены пункты ниже; число продаж не подменяет проверку настройки.'),
 table(['Что передаём','Как проверить'],[['Карта цели и аудитории','Один понятный сценарий и критерии подходящего обращения'],['Согласованные объявления','Факты совпадают с программой и страницей'],['Настройки и доступы','Кабинет клиента, география и лимиты согласованы'],['Путь заявки','Тест доходит до ответственного; дубль не считается новой заявкой'],['Отчёт','Расход, обращения, подходящие обращения и продажи разделены']]),
 link('Разметьте внешние ссылки через {link} и проверьте их до публикации объявления.','/ru/utm-generator/','генератор UTM')],at=2)
touch('/ru/blog/chto-takoe-smm-prodvizhenie/',[
 h('Кто отвечает за результат каждого этапа','smm-responsibility'),
 table(['Задача','Проверяемый результат','Ответственный'],[['Контент','Материал отвечает на реальный вопрос и согласован','Редактор + эксперт бизнеса'],['Публикация','Пост вышел, ссылка работает','SMM-специалист'],['Платное привлечение','Кампания и расход доступны в отчёте','Специалист по рекламе'],['Обращение','Вопрос принят и обработан','Администратор или продажи']]),
 p('SMM может включать координацию этих работ, но договор должен явно называть состав. Охват не означает заявку, заявка — оплату. Отчёт полезен, когда понятно, какой этап изменился и кто отвечает за следующий шаг.'),
 link('Посмотрите прикладной {link}: календарь и восемь текстов можно адаптировать.','/ru/blog/kontent-plan-dlya-uchebnogo-tsentra/','контент-план учебного центра')],at=2)
touch('/ru/blog/telegram-ads-stoimost-i-zapusk-uzbekistan/',[
 h('Проверка сметы перед оплатой размещения','smeta-check'),
 table(['Строка','Что уточнить','Что получите'],[['Бюджет платформы','Валюта, доступный способ пополнения и правила выбранного кабинета','Подтверждение средств на рекламу'],['Посредник, если нужен','Комиссия, условия возврата и подтверждающие документы','Отдельные условия посредника'],['Работа команды','Подготовка, запуск, ведение, правки','Согласованный перечень работ'],['Материалы и аналитика','Кто готовит текст, канал, бот и измерение','Рабочий путь до обращения']]),
 p('Не переносите минимальный депозит, способы оплаты или доступные адреса из чужого кабинета на свой. В официальной инструкции ads.telegram.org описаны ссылки на Telegram-канал или бот; возможности других кабинетов нужно подтверждать отдельно до оплаты. Условия проверьте в используемом интерфейсе и договоре.'),
 p('Для расчёта подготовьте тему и язык канала, предложение, адрес назначения, желаемую географию, допустимый расход и ответственного за обращения. Укажите, нужен ли запуск в официальной платформе или публикация у владельцев каналов: это разные способы покупки рекламы.'),
 link('Если публикация ведёт на сайт, источник можно отметить через {link}. Метки на t.me не подтверждают запуск бота или подписку.','/ru/utm-generator/','генератор UTM')],at=2)
f,d=FILES['/ru/blog/telegram-ads-stoimost-i-zapusk-uzbekistan/'];d['intro']=d['intro'].replace('Обновлено 25 октября 2026 года: добавлен пошаговый запуск из Узбекистана.','Проверено 9 ноября 2026 года: добавлены проверка сметы и границы измерения.')
d.setdefault('sources',[]).append(src('Telegram Ads — Getting Started','https://ads.telegram.org/getting-started','Проверка официального способа запуска 09.11.2026.'));write(f,d)
touch('/ru/blog/skolko-stoit-smm-i-vedenie-instagram-uzbekistan/',[
 h('Как сравнить два предложения по одинаковому объёму','smeta-scope'),
 p('Запишите объём, единицу результата и ответственного. Например, «4 Reels» может означать четыре готовых ролика со съёмкой или только четыре монтажных задания из материалов клиента. Это разные работы; количество публикаций без состава не даёт сопоставимой цены.'),
 table(['Строка сметы','Что зафиксировать'],[['Контент','Число и формат материалов, тексты, адаптации RU/UZ'],['Съёмка','Продолжительность, место, участники и права'],['Правки','Этап согласования и включённый объём'],['Реклама','Работа специалиста отдельно от бюджета размещения'],['Обращения','Время ответа и кто квалифицирует заявку'],['Отчёт','Период, источники, расходы и результат']]),
 p('Указанные на сайте пакеты — предложения GPTBot.uz, а не средняя цена всего рынка. Итоговая смета зависит от подтверждённого состава. Если таблица пакета включает конкретные работы, они сохраняются; дополнения согласуются до начала.'),
 link('Для оценки материалов используйте {link}; это пример рабочей структуры, а не дополнительный тариф.','/ru/blog/kontent-plan-dlya-uchebnogo-tsentra/','календарь учебного центра')],at=2)
touch('/ru/seo-prodvizhenie-saytov-tashkent/',[
 h('Что проверяем в результате SEO-аудита','audit-deliverable'),
 table(['Находка','Какой документ получает клиент','Критерий приёмки'],[['Индексация','Список URL, состояния и доказательства','Отделены запрет, выбор canonical и решение поисковика'],['Спрос','Запрос → намерение → текущий URL','Не создаётся дубль уже работающего владельца'],['Исправления','Задача, приоритет, ответственный и проверка','Изменение можно воспроизвести и проверить'],['Измерение','Исходный период, страницы и обращения','Сравниваются одинаковые условия']]),
 p('Пример задания: исправить внутреннюю ссылку на существующую страницу, затем проверить HTML, ответ сервера и отсутствие редиректной цепочки. Приёмка такого задания не равна росту позиции. Результат поиска оценивается отдельно после повторного обхода и накопления данных.'),
 link('Структура карты запросов показана в {link}.','/ru/blog/semanticheskoe-yadro-ru-uz/','семантическом ядре RU/UZ')],at=2)
touch('/ru/blog/skolko-stoit-seo-prodvizhenie-uzbekistan-2026/',[
 h('Как разложить SEO-смету по проверяемым работам','smeta-primer'),
 p('Ниже — структура оценки, а не новый тариф и не средняя цена рынка. Она помогает сравнить предложения с разным количеством страниц и разной сложностью разработки. Стоимость рассчитывается после проверки сайта; опубликованные цены GPTBot.uz остаются в таблице этой статьи.'),
 table(['Работа','Единица объёма','Что меняет стоимость'],[['Техническая диагностика','Проверенные шаблоны и URL','Доступы, JavaScript, число языков'],['Исправления','Согласованные задачи разработки','CMS, интеграции, тестирование'],['Семантика','Кластеры с назначенным URL','Языки, неоднозначная выдача'],['Контент','Готовые страницы и полезные материалы','Экспертные факты, примеры, редактура'],['Контроль','Периодический отчёт и проверки','Набор событий и состояние аналитики']]),
 p('Сравнивайте итоговую сумму вместе с тем, кто внедряет рекомендации. Аудит без разработки и сопровождение с внедрением — разные объёмы. Внешние сервисы, производство материалов и дополнительные интеграции должны быть отдельными согласованными строками.'),
 link('Пример запроса и страницы-владельца — в {link}.','/ru/blog/semanticheskoe-yadro-ru-uz/','карте семантического ядра')],at=2)
touch('/ru/smm-prodvizhenie-tashkent/',[
 h('Как материал проходит от брифа до обращения','content-acceptance'),
 table(['Этап','Что принимаем','Кто подтверждает'],[['Бриф','Аудитория, цель, факты и CTA','Бизнес'],['Материал','Текст, визуал, формат и права','Редактор + эксперт клиента'],['Согласование','Актуальные условия и допустимые обещания','Назначенный представитель'],['Публикация','Дата, ссылка, мобильный вид','SMM-специалист'],['Обращения','Вопросы, соответствие предложению, следующий шаг','Администратор']]),
 p('Демонстрационный пример: материал о выборе группы ведёт на условия обучения, а администратор уточняет уровень и время. В отчёте можно связать публикацию, переход и обращение, если это позволяет настроенное измерение. Охват и подписки не объявляются продажами.'),
 link('Можно проверить структуру на {link}: таблица и тексты доступны без заявки.','/ru/blog/kontent-plan-dlya-uchebnogo-tsentra/','контент-плане для учебного центра')],at=2)
touch('/ru/kontekstnaya-reklama-tashkent/',[
 h('Проверка поисковой кампании перед запуском','search-acceptance'),
 table(['Уровень','Пример для услуги','Что проверить'],[['Кампания','Одна задача и согласованный рынок','Цель, география, бюджет и доступы'],['Группа','Близкие запросы о конкретной услуге','Соответствие намерения и посадочной страницы'],['Объявление','Реальный состав и понятный следующий шаг','Нет неподтверждённых обещаний'],['Заявка','Успешная отправка и получение','Не подменяется кликом; дубли исключаются']]),
 p('Это схема приёмки, а не прогноз стоимости клиента. Настройки и тестовые обращения проверяем до расхода; качество заявок — после появления реальных данных. Существующий калькулятор CPL выше помогает сопоставить затраты и обращения, но не заменяет проверку продаж.'),
 link('Для внешних ссылок используйте {link}.','/ru/utm-generator/','генератор UTM-меток'),
 link('Ненужные запросы разбирайте через {link}, проверяя риск потери полезного спроса.','/ru/blog/minus-slova-google-ads/','лист минус-слов Google Ads')],at=2)

# Contextual inbound links: preserve existing hrefs, no site-wide footer changes.
edges=[
 ('/uz/seo-xizmati/','/uz/blog/seo-nima/','SEO nima','Asosiy tushuncha va birinchi tekshiruvlar: {link}.'),
 ('/uz/blog/marketing-nima/','/uz/blog/seo-nima/','SEO nima','Organik qidiruvning vazifasi haqida {link} materialini o‘qing.'),
 ('/uz/blog/marketing-nima/','/uz/blog/maqsadli-auditoriya/','maqsadli auditoriya jadvali','Taklifdan oldin segmentni aniqlash uchun {link} yordam beradi.'),
 ('/uz/blog/smm-nima/','/uz/blog/kontent-nima/','kontent turlari va 12 misol','Material tanlash uchun {link} bilan tanishing.'),
 ('/uz/blog/smm-nima/','/uz/blog/kopirayting-nima/','kopirayting misollari','Matnni aniqlashtirish uchun {link}dan foydalaning.'),
 ('/uz/smm-xizmatlari/','/uz/blog/kontent-nima/','kontent nima va amaliy misollar','Materialga vazifa qo‘yish: {link}.'),
 ('/uz/gpt-telegram-instagram-ideya/','/uz/blog/kopirayting-nima/','kopirayting brifi','AI’ga aniq vazifa berish uchun {link}ni tayyorlang.'),
 ('/uz/gpt-telegram-instagram-ideya/','/uz/blog/kontent-nima/','12 ta kontent misoli','Format tanlashga {link} yordam beradi.'),
 ('/uz/instagram-target-yoqish/','/uz/blog/maqsadli-auditoriya/','auditoriya portreti shabloni','Brif uchun {link}ni to‘ldiring.'),
 ('/uz/internet-reklama-toshkent/','/uz/blog/google-reklama-sozlash/','Google Search sozlash cheklisti','Mustaqil tayyorgarlik uchun {link}.'),
 ('/uz/blog/kontekst-reklama-narxi-toshkent-2026/','/uz/blog/google-reklama-sozlash/','Google reklama sozlash rejasi','Byudjetdan oldin {link} orqali tayyorgarlikni tekshiring.'),
 ('/ru/performance-marketing-tashkent/','/ru/utm-generator/','UTM-генератор','Разметку внешних ссылок подготовит {link}.'),
 ('/ru/performance-marketing-tashkent/','/ru/roas-kalkulyator/','калькулятор ROAS','Выручку и расход сопоставит {link}; учитывайте маржу и прочие затраты.'),
 ('/ru/gpt-v-marketinge-smm/','/ru/blog/kontent-plan-dlya-uchebnogo-tsentra/','контент-план учебного центра','Пример редакционного задания и календаря — {link}.'),
 ('/ru/blog/cpa-cpm-cpc-cpl-v-reklame/','/ru/roas-kalkulyator/','калькулятор ROAS','Для расчёта выручки на рекламный расход используйте {link}.'),
 ('/ru/blog/marketingovye-terminy-slovar/','/ru/roas-kalkulyator/','калькулятор ROAS','Проверить формулу на своих числах поможет {link}.'),
 ('/uz/blog/kontent-nima/','/uz/blog/kopirayting-nima/','kopirayting bo‘yicha uch misol','Matnni tahrirlash uchun {link}ni ko‘ring.')]
for a,b,c,d in edges:addlink(a,b,c,d)

# Assign ownership in the existing registry. Retain every historical decision.
manifest_path=ROOT/'content/seo/intent-manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8-sig'))
for cluster in manifest['clusters']:
    for a in PLAN['pages']:
        if not a['id'].startswith('N') or '/blog/' not in a['path']:continue
        f,d=FILES[a['path']]
        if cluster['hub']==d['targetMoneyPage']:
            if not any(x['url']==a['path'] for x in cluster['spokes']):cluster['spokes'].append({'url':a['path'],'ownsIntent':a.get('action',a['asset']),'primaryKeyword':a['keyword']})
manifest.setdefault('commercialClusters',[]).append({'id':'marketing-tools-20261109','hub':'/ru/performance-marketing-tashkent/','hubIntent':'existing performance marketing service; retain commercial owner','hubKeywords':[], 'spokes':[{'url':'/ru/utm-generator/','ownsIntent':'generate a URL locally; not tracking installation','primaryKeyword':'генератор utm меток'},{'url':'/ru/roas-kalkulyator/','ownsIntent':'calculate ROAS and margin threshold locally; not general marketing glossary','primaryKeyword':'калькулятор roas'}],'evidence':'reports/marketing-gap-20261109/PLAN.json','note':'Owner-authorized bounded pilot; search estimates are not a traffic forecast.'})
manifest['architectureDecisions'].append({'id':'A13-marketing-gap-20261109','decision':'Publish ten distinct practical resources and improve ten existing marketing owners','decidedAt':DATE,'pages':[a['path'] for a in PLAN['pages']], 'evidence':'reports/marketing-gap-20261109/PLAN.json; explicit implementation request', 'note':'Ten new pages and ten existing owners improved. No URL migration, new equivalence hreflang, price owner reassignment or automatic merge. UZ target has no proven technical exclusion; improve deliverable clarity, re-inspect after recrawl. New tools are local, isolated from chat bundle. Small demand and unknown KD remain explicit in plan.'})
write(manifest_path,manifest)
policy_path=ROOT/'content/seo/demand-policy.json';policy=json.loads(policy_path.read_text(encoding='utf-8-sig'))
for a in PLAN['pages']:
    if a['id'].startswith('N') and not any(x['keyword']==a['keyword'] for x in policy['approvedKeywords']):
        policy['approvedKeywords'].append({'keyword':a['keyword'],'volumePerMonth':a['metrics']['search_volume'],'source':'OpenSEO Google Ads, Uzbekistan 2860, language parameter ru; exact text','measuredAt':DATE,'note':'Owner-authorized limited marketing cohort. KD unavailable; volume is an estimate, not traffic. See reports/marketing-gap-20261109/PLAN.json.'})
write(policy_path,policy)
write(ROOT/'reports/marketing-gap-20261109/PLAN.json',PLAN)
write(ROOT/'reports/marketing-gap-20261109/content-changes.json',CHANGES)
write(ROOT/'reports/marketing-gap-20261109/downloads.json',['/downloads/marketing-20261109/'+p.name for p in sorted(OUT.glob('*.csv'))])
print(json.dumps({'new':sum(v==['new'] for v in CHANGES.values()),'changed':len(CHANGES),'downloads':len(list(OUT.glob('*.csv')))},ensure_ascii=False))
