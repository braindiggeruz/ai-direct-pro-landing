"""Build four original Uzbek document kits (DOCX + PDF) for the 2026-11-17 guides, part A.

Kits: a psychological characterisation of a pupil and of a class (psixologik
tavsifnoma), a review (taqriz), a conference thesis (tezis) and a CV. Each kit
has an editable blank and separately labelled conditional examples that start
on their own page. No user input, network, macros, real people, real
organisations or actual signatures.

Same document libraries, font strategy and checks as
docs-document-templates-20261116.py; that script and the earlier download
folders are not touched. Requires python-docx, reportlab and pypdf (available
in the desktop bundled Python).

Differences from the 2026-11-16 script, all needed by the longer kits:
- an example page may carry sub-headings ({'heading': ...}) between examples;
- a table may give column ratios ({'ratios': [...]});
- a paragraph is never split across two pages; a blank section and an example
  stay on one page when they fit there; the page limit is 2-6.

--check validates the committed files and their deterministic regeneration in
the same font environment; it never rewrites downloads. Optional --report saves
the QA result as JSON.
"""
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape
import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
import zipfile

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/downloads/docs-20261117'
FIXED = datetime(2026, 11, 17, tzinfo=timezone.utc)
STAMP = 'GPTBot.uz · O‘quv namunasi · 17.11.2026'
NOTE = 'Tahrirlanadigan qism. Kvadrat qavslarni o‘z ma’lumotingiz bilan almashtiring; keraksiz bandlarni o‘chiring. Qabul qiluvchi bergan shakl bo‘lsa, o‘sha shakldan foydalaning.'
EXAMPLE = 'TO‘LDIRILGAN O‘QUV MISOLLARI'
EXAMPLE_NOTE = 'Quyidagi matnlar tuzilmani ko‘rsatish uchun yozilgan. Ulardagi odamlar, tashkilotlar, raqamlar va voqealar to‘qima. Ularni haqiqiy hujjat sifatida topshirmang.'
MAX_PAGES = 6
TEXT_WIDTH_MM = 170

REVIEW_FOCUS = {
    'headers': ['Ish turi', 'Asosiy savollar'],
    'ratios': [0.28, 0.72],
    'rows': [
        ['Dars ishlanmasi', 'Maqsad o‘lchanadigan natija ko‘rinishidami? Bosqichlar va vaqt taqsimoti mantiqlimi? Usul va topshiriqlar sinf darajasiga mosmi? Baholash mezoni bormi?'],
        ['Maqola yoki tezis', 'Mavzu va maqsad aniqmi? Usul va dalillar tushunarli bayon qilinganmi? Xulosalar natijalardan kelib chiqadimi? Manbalar to‘g‘ri ko‘rsatilganmi?'],
        ['Bitiruv malakaviy ishi', 'Mavzu dolzarbmi? Ish mustaqil bajarilganmi? Maqsad va natijalar bir-biriga mosmi? Xulosa va takliflar asoslanganmi? Ish talab bo‘yicha rasmiylashtirilganmi?'],
        ['Kitob yoki o‘quv qo‘llanma', 'Mazmun o‘quv dasturiga mosmi? Mavzular izchil joylashganmi? Til o‘quvchi yoshiga mosmi? Mashq va javoblarda xato yo‘qmi?'],
    ],
}
THESIS_RULES = {
    'headers': ['Talab', 'Axborot xatida yozilgani'],
    'ratios': [0.32, 0.68],
    'rows': [
        ['Hajm', '[necha bet]'],
        ['Shrift va o‘lcham', '[masalan, Times New Roman, 12 yoki 14]'],
        ['Qator oralig‘i', '[1,0 yoki 1,5]'],
        ['Hoshiyalar', '[yuqori, past, chap, o‘ng — sm]'],
        ['Til va fayl', '[tezis tili; .doc yoki .docx; fayl nomi qanday yoziladi]'],
        ['Muddat va manzil', '[oxirgi sana; e-mail yoki havola]'],
        ['Asliylik va to‘lov', '[antiplagiat talabi; tashkiliy badal — bo‘lsa]'],
    ],
}
ENGLISH_CV = {
    'headers': ['CV matni (ingliz tilida)', 'Izoh'],
    'ratios': [0.56, 0.44],
    'rows': [
        ['NAMUNA MISOLOVA · Tashkent, Uzbekistan · +998 00 000 00 00 · namuna@example.com',
         'Ism va aloqa. Ism-familiyani pasportdagi lotin yozuvi bilan bir xil yozing. Uy manzili shart emas: shahar va mamlakat yetadi.'],
        ['PROFILE. Third-year Economics student with a strong interest in data analysis. Seeking a summer internship in finance.',
         'Profil — 2–3 gap. Gap «I» (men) so‘zisiz boshlanadi; maqsad aniq aytiladi.'],
        ['EDUCATION. BSc in Economics, Namuna University (fictional), Tashkent, 2024–present. Key courses: Statistics, Microeconomics, Accounting.',
         'Ta’lim. Daraja inglizcha qisqartmada yoziladi: BSc, BA, MSc, MA. Eng oxirgi o‘qish joyi birinchi turadi.'],
        ['EXPERIENCE. Accounting Intern, Namuna-1 LLC (fictional), June–July 2026. Entered 120 source documents into the register. Updated the monthly expense sheet in Excel.',
         'Tajriba. Har bir band o‘tgan zamondagi fe’l bilan boshlanadi: entered, updated, prepared. Raqam bo‘lsa, yozing.'],
        ['PROJECT. Measuring queue time in the student canteen, course project, 2026. Collected data for 5 days and presented the results in charts.',
         'Loyiha. Ish tajribasi kam bo‘lsa, o‘quv loyihasi ham yoziladi.'],
        ['LANGUAGES. Uzbek (native), Russian (fluent), English (B2).',
         'Tillar. Daraja: native, fluent yoki CEFR shkalasi bo‘yicha A1–C2.'],
        ['SKILLS. Excel (formulas, pivot tables), Word, PowerPoint; teamwork, presentations.',
         'Ko‘nikmalar. Aniq dastur va vositalarni yozing; umumiy so‘zlarni kamaytiring.'],
        ['REFERENCES. Available upon request.',
         'Tavsiya beruvchilar. Bu ibora «so‘rov bo‘yicha taqdim etiladi» degani. Ism va aloqa faqat ularning roziligi bilan yoziladi.'],
    ],
}

TEMPLATES = [
    {
        'slug': 'psixologik-tavsifnoma',
        'article': '/uz/blog/psixologik-tavsifnoma-namuna/',
        'title': 'PSIXOLOGIK TAVSIFNOMA',
        'subtitle': 'O‘quvchiga va sinfga psixologik tavsifnoma: tahrirlanadigan blankalar, kirillcha variant va ikki shartli o‘quv misoli',
        'sections': [
            {'heading': 'O‘quvchiga psixologik tavsifnoma', 'lines': [
                'PSIXOLOGIK TAVSIFNOMA — alohida qatorda, sahifa o‘rtasida',
                '[Maktab nomi] [sinf]-sinf o‘quvchisi [F.I.Sh.]ga · Kuzatuv davri: [sana] — [sana]',
                'Umumiy ma’lumot: [yoshi; shu maktabda qachondan beri o‘qishi; tavsifnoma kimning so‘rovi bilan va nima maqsadda yozilgani].',
                'Ma’lumot manbalari: [dars va tanaffusdagi kuzatuvlar soni; o‘qituvchilar bilan suhbat; o‘quv ishlari; o‘tkazilgan metodika nomi — bo‘lsa].',
                'O‘quv faoliyati: [qaysi fanlarda faol; topshiriqni qanday boshlaydi va yakunlaydi; qayerda yordam kerak bo‘ladi].',
                'Diqqat, xotira va fikrlash: [kuzatilgan holat va aniq misol].',
                'Hissiy holat va o‘zini tutish: [dars, tanaffus va nazorat ishi paytida kuzatilgani].',
                'Muloqot: [sinfdoshlar va kattalar bilan munosabati; guruh ishidagi o‘rni].',
                'Qiziqishlar va kuchli jihatlar: [to‘garak, sevimli mashg‘ulot, yaxshi bajaradigan ishi].',
                'Xulosa: [2–3 gap: kuchli jihatlar va qo‘llab-quvvatlash kerak bo‘lgan jihatlar].',
                'Tavsiyalar: o‘qituvchilarga — [aniq harakat]; ota-onaga — [aniq harakat]; o‘quvchiga — [aniq harakat]. Qayta kuzatuv: [muddat].',
                'Tuzuvchi: [lavozim: psixolog, sinf rahbari yoki amaliyotchi talaba] [imzo] [F.I.Sh.] · [kun.oy.yil]',
            ]},
            {'heading': 'Sinfga psixologik tavsifnoma', 'lines': [
                '[Maktab nomi] [sinf]-sinf jamoasiga · Kuzatuv davri: [sana] — [sana]',
                'Umumiy ma’lumot: [o‘quvchilar soni; o‘g‘il va qizlar soni; jamoa shu tarkibda qachondan beri; sinf rahbari].',
                'Ma’lumot manbalari: [dars va tanaffusdagi kuzatuvlar; o‘qituvchilar bilan suhbat; so‘rov yoki sotsiometriya — o‘tkazilgan bo‘lsa].',
                'O‘quv faoliyati: [umumiy o‘zlashtirish; qaysi ish shakli yaxshi natija beradi; qayerda qiynaladi].',
                'Intizom va dars tartibi: [darsga tayyorgarlik, davomat, qoidalarga rioya qilish — kuzatuv bo‘yicha].',
                'Jamoadagi munosabatlar: [ahillik, o‘zaro yordam, kichik guruhlar, yangi o‘quvchilarning qabul qilinishi].',
                'Faollar va tashabbus: [tadbirlarni kim tashkil qiladi; qolganlar qanday qatnashadi].',
                'Qiziqishlar: [to‘garaklar, tanlovlar, sinfning umumiy mashg‘ulotlari].',
                'Xulosa: [2–3 gap: jamoaning kuchli jihatlari va e’tibor talab qiladigan jihatlar].',
                'Tavsiyalar: sinf rahbariga — [aniq harakat]; fan o‘qituvchilariga — [aniq harakat]; ota-onalar yig‘ilishi uchun — [mavzu]. Qayta kuzatuv: [muddat].',
                'Tuzuvchi: [lavozim] [imzo] [F.I.Sh.] · [kun.oy.yil]',
            ]},
            {'heading': 'Кирилл ёзувида: ўқувчига психологик тавсифнома', 'lines': [
                'ПСИХОЛОГИК ТАВСИФНОМА',
                '[Мактаб номи] [синф]-синф ўқувчиси [Ф.И.Ш.]га · Кузатув даври: [сана] — [сана]',
                'Ўқув фаолияти: [қайси фанларда фаол; топшириқни қандай бажаради; қаерда ёрдам керак бўлади].',
                'Диққат, хотира ва фикрлаш: [кузатилган ҳолат ва аниқ мисол].',
                'Ҳиссий ҳолат ва мулоқот: [дарс ва танаффусда кузатилгани; синфдошлари билан муносабати].',
                'Хулоса ва тавсиялар: [кучли жиҳатлар; ўқитувчилар ва ота-онага аниқ тавсиялар].',
                'Тузувчи: [лавозим] [имзо] [Ф.И.Ш.] · [кун.ой.йил]',
            ]},
        ],
        'check': 'Bu tasdiqlangan rasmiy shakl emas va tibbiy yoki klinik xulosa emas: unda tashxis qo‘yilmaydi, faqat maktabda kuzatilgan o‘qish, xulq va muloqot tasvirlanadi. Muassasangiz yoki kafedrangiz bergan shakl bo‘lsa, o‘shandan foydalaning. Tavsifnomadagi ma’lumot maxfiy: uni faqat tegishli mutaxassislar va ota-ona ko‘radi.',
        'preview': [
            {'heading': '1-misol. O‘quvchiga psixologik tavsifnoma'},
            'PSIXOLOGIK TAVSIFNOMA · shartli maktabning 6-sinf o‘quvchisi A ga · Kuzatuv davri: 2026-yil 14-sentabr — 6-noyabr',
            'Umumiy ma’lumot: A 12 yoshda, shu maktabda birinchi sinfdan beri o‘qiydi. Tavsifnoma sinf rahbarining so‘rovi bilan, o‘qishda qo‘llab-quvvatlash rejasini tuzish uchun yozildi.',
            'Ma’lumot manbalari: matematika, ona tili va tarix darslaridagi 6 ta kuzatuv, sinf rahbari va ikki fan o‘qituvchisi bilan suhbat, o‘quvchining daftarlari.',
            'O‘quv faoliyati: A tabiiy fanlar va texnologiya darslarida faol, tajriba va amaliy ishlarni qiziqib bajaradi. Yozma topshiriqni boshqalardan kechroq boshlaydi; topshiriq 2–3 qadamga bo‘lib berilganda uni oxiriga yetkazadi.',
            'Diqqat, xotira va fikrlash: dars boshida diqqatini topshiriqda ushlab turadi, 25–30 daqiqadan keyin tez-tez chalg‘iydi. Chizma yoki jadval bilan berilgan materialni yaxshi eslab qoladi; og‘zaki aytilgan qoidani takrorlashda qiynaladi.',
            'Hissiy holat va o‘zini tutish: darsda osoyishta. Nazorat ishi oldidan xavotirlanadi: topshiriq shartini qayta-qayta so‘raydi. Xatosi ko‘rsatilganda jim bo‘lib qoladi, dalda berilganda ishni davom ettiradi.',
            'Muloqot: sinfda ikki yaqin do‘sti bor. Guruh ishida ko‘proq ijrochi bo‘ladi, fikri so‘ralganda aytadi. Kattalar bilan hurmat bilan gaplashadi.',
            'Qiziqishlar va kuchli jihatlar: robototexnika to‘garagiga qatnaydi, konstruktor yig‘ishni yaxshi ko‘radi; boshlagan amaliy ishini puxta bajaradi.',
            'Xulosa: A amaliy va ko‘rgazmali ishlarda yaxshi natija ko‘rsatadi. Uzoq yozma ishda va og‘zaki javobda unga qo‘shimcha yordam kerak. Bu kuzatuvga asoslangan tavsif, tibbiy xulosa emas.',
            'Tavsiyalar: o‘qituvchilarga — yozma topshiriqni qadamlarga bo‘lib berish, og‘zaki javobdan oldin 1–2 daqiqa tayyorlanishga vaqt ajratish; ota-onaga — uy vazifasini qisqa tanaffuslar bilan bajarishiga yordam berish; o‘quvchiga — qoidani chizma yoki jadval ko‘rinishida yozib olish. Qayta kuzatuv: 2027-yil yanvar.',
            'Tuzuvchi: maktab psixologi B · 09.11.2026; haqiqiy imzo qo‘yilmagan.',
            {'heading': '2-misol. Sinfga psixologik tavsifnoma'},
            'PSIXOLOGIK TAVSIFNOMA · shartli maktabning 7-«D» sinfi jamoasiga · Kuzatuv davri: 2026-yil 14-sentabr — 6-noyabr',
            'Umumiy ma’lumot: sinfda 28 o‘quvchi bor: 15 o‘g‘il va 13 qiz. Jamoaning asosiy qismi 5-sinfdan beri birga o‘qiydi; 2026-yil sentabrda 2 nafar yangi o‘quvchi qo‘shildi.',
            'Ma’lumot manbalari: 8 ta dars va 4 ta tanaffusdagi kuzatuv, sinf rahbari va to‘rt fan o‘qituvchisi bilan suhbat, «Kim bilan bir guruhda ishlashni xohlaysan?» degan bitta savolli so‘rov.',
            'O‘quv faoliyati: sinf juftlik va guruh ishlarida faol, loyiha topshiriqlarini muddatida topshiradi. Yakka yozma ishda natija pastroq: so‘nggi ikki nazorat ishida 28 o‘quvchidan 9 nafari ishni oxiriga yetkazmadi.',
            'Intizom va dars tartibi: darslar o‘z vaqtida boshlanadi. Oxirgi soatlarda shovqin ko‘payadi; o‘qituvchi ish turini almashtirganda tartib tiklanadi.',
            'Jamoadagi munosabatlar: sinfda 4–5 kishilik uchta barqaror guruh bor, ular o‘rtasida ochiq nizo kuzatilmadi. Yangi kelgan ikki o‘quvchi hozircha asosan bir-biri bilan muloqot qiladi; so‘rovda ularni 3 nafar sinfdosh tanladi.',
            'Faollar va tashabbus: tadbirlarni asosan 5–6 nafar faol o‘quvchi tashkil qiladi; qolganlar topshiriq berilganda qatnashadi.',
            'Qiziqishlar: sport musobaqalari va viktorinalar; 11 o‘quvchi to‘garaklarga qatnaydi.',
            'Xulosa: jamoa ahil, hamkorlikdagi ishda kuchli. Yakka mustaqil ish ko‘nikmasi va yangi o‘quvchilarning jamoaga qo‘shilishi e’tibor talab qiladi.',
            'Tavsiyalar: sinf rahbariga — guruhlar tarkibini har oy almashtirish va yangi o‘quvchilarga tadbirlarda aniq vazifa berish; fan o‘qituvchilariga — har darsda 5–7 daqiqalik yakka ish berish; ota-onalar yig‘ilishi uchun mavzu — uy vazifasini mustaqil bajarish. Qayta kuzatuv: 2027-yil fevral.',
            'Tuzuvchilar: maktab psixologi B va sinf rahbari E · 09.11.2026; haqiqiy imzolar qo‘yilmagan.',
        ],
    },
    {
        'slug': 'taqriz',
        'article': '/uz/blog/taqriz-namuna/',
        'title': 'TAQRIZ',
        'subtitle': 'Dars ishlanmasi, maqola, bitiruv malakaviy ishi va kitobga taqriz: tahrirlanadigan blanka va to‘rt shartli o‘quv misoli',
        'sections': [
            {'heading': 'Sarlavha qismi', 'lines': [
                '[Muallifning lavozimi yoki kursi, F.I.Sh.]ning «[ish nomi]» mavzusidagi [ish turi: dars ishlanmasi, maqola, bitiruv malakaviy ishi, o‘quv qo‘llanma]ga',
                'TAQRIZ — alohida qatorda, sahifa o‘rtasida',
            ]},
            {'heading': 'Kirish', 'lines': [
                'Ish haqida: [hajmi va tuzilishi — necha bet, nechta bob yoki bosqich; kimga mo‘ljallangani].',
                'Mavzuning dolzarbligi: [mavzu nega muhim — 1–2 gap].',
            ]},
            {'heading': 'Mazmun tahlili', 'lines': [
                'Mazmuni: [qismlar bo‘yicha qisqa bayon — nima yoritilgan].',
                'Yutuqlari: 1) [aniq misol — bet, bob yoki bosqich bilan]; 2) [aniq misol]; 3) [aniq misol].',
                'Kamchilik va takliflar: 1) [nima yetishmaydi va qanday tuzatish mumkin]; 2) [taklif].',
            ]},
            {'heading': 'Xulosa', 'lines': [
                'Umumiy baho: ko‘rsatilgan kamchiliklar [ishning qiymatini pasaytirmaydi yoki ishni qayta ko‘rib chiqishni talab qiladi].',
                'Ish [qaysi talablarga] javob beradi va uni [nashrga, himoyaga yoki amaliyotda qo‘llashga] tavsiya etaman.',
            ]},
            {'heading': 'Taqrizchi', 'lines': [
                'Taqrizchi: [lavozim, ilmiy daraja yoki malaka toifasi] [imzo] [F.I.Sh.] · [kun.oy.yil]',
                'Imzo tasdig‘i: [taqriz so‘ragan tashkilot talab qilsa].',
            ]},
            {'heading': 'Ish turiga qarab nimaga e’tibor beriladi', 'lines': [
                'Jadvaldagi savollarga javob yozsangiz, taqrizning asosiy qismi tayyor bo‘ladi.',
            ], 'table': REVIEW_FOCUS},
        ],
        'check': 'Bu tasdiqlangan rasmiy shakl emas. Taqriz so‘ragan tashkilot — nashriyot, jurnal tahririyati, kafedra yoki metodika xizmati — o‘z shakli va mezonlarini bergan bo‘lsa, o‘shandan foydalaning. Taqrizni ishni to‘liq o‘qib chiqqan mutaxassis o‘z nomidan yozadi va imzolaydi; misollardagi baholarni o‘z ishingizga ko‘chirmang.',
        'preview': [
            {'heading': '1-misol. Dars ishlanmasiga taqriz'},
            'Shartli maktabning matematika o‘qituvchisi A ning 6-sinf uchun «Maxraji har xil kasrlarni qo‘shish» mavzusidagi dars ishlanmasiga TAQRIZ',
            'Dars ishlanmasi 45 daqiqalik yangi bilim berish darsiga mo‘ljallangan va besh bosqichdan iborat. Mavzu o‘quv dasturiga mos: kasrlar ustidagi amallar keyingi mavzular uchun tayanch bo‘ladi.',
            'Yutuqlari: 1) dars maqsadi o‘lchanadigan natija ko‘rinishida yozilgan: «o‘quvchi maxraji har xil ikki kasrni qo‘sha oladi»; 2) har bir bosqich uchun vaqt ko‘rsatilgan; 3) mustahkamlash uchun uch darajadagi topshiriqlar berilgan.',
            'Kamchilik va takliflar: 1) juftlikda ishlash bosqichida baholash mezoni yo‘q — uni qo‘shish kerak; 2) dars yakuniga 5 daqiqalik qisqa test kiritish foydali; 3) ko‘rgazma sifatida kasr doiralaridan foydalanish mumkin.',
            'Xulosa: ishlanma metodik talablarga javob beradi. Takliflar hisobga olingach, uni dars jarayonida qo‘llashga va metodbirlashmada muhokama qilishga tavsiya etaman.',
            'Taqrizchi: metodbirlashma rahbari B · 12.11.2026; haqiqiy imzo qo‘yilmagan.',
            {'heading': '2-misol. Maqolaga taqriz'},
            'Shartli muallif A ning «Boshlang‘ich sinflarda ovoz chiqarib o‘qish mashqlarining ahamiyati» nomli maqolasiga TAQRIZ',
            'Maqola 6 betdan iborat: annotatsiya, kirish, asosiy qism, xulosa va adabiyotlar ro‘yxati (9 ta manba). Mavzu dolzarb: o‘qish ko‘nikmasi boshqa fanlarni o‘zlashtirishga ham ta’sir qiladi.',
            'Yutuqlari: 1) muallif bitta sinfda 8 hafta davomida o‘tkazgan kuzatuvini tasvirlagan va natijani jadvalda bergan; 2) xulosalar keltirilgan ma’lumotlardan kelib chiqadi; 3) matn tushunarli tilda yozilgan.',
            'Kamchilik va takliflar: 1) kuzatuv bitta sinfda o‘tkazilgani xulosada cheklov sifatida ko‘rsatilmagan; 2) 3-jadvalda o‘lchov birligi yozilmagan; 3) ikki manbaning nashr yili matnda va ro‘yxatda har xil.',
            'Xulosa: ko‘rsatilgan kamchiliklar tuzatilgach, maqolani konferensiya to‘plamida nashr etishga tavsiya etaman.',
            'Taqrizchi: kafedra dotsenti B · 12.11.2026; haqiqiy imzo qo‘yilmagan.',
            {'heading': '3-misol. Bitiruv malakaviy ishiga taqriz'},
            'Shartli oliygoh talabasi A ning «Kichik korxonada mijozlar murojaatlarini hisobga olishni takomillashtirish» mavzusidagi bitiruv malakaviy ishiga TAQRIZ',
            'Ish kirish, ikki bob, xulosa, adabiyotlar ro‘yxati (32 ta manba) va 3 ta ilovadan iborat; hajmi 58 bet. Mavzu amaliy ahamiyatga ega: murojaatlar hisobi xizmat sifatini baholashga asos bo‘ladi.',
            'Yutuqlari: 1) maqsad va vazifalar xulosadagi natijalarga mos; 2) ikkinchi bobda shartli korxonaning uch oylik ma’lumoti tahlil qilingan; 3) takliflar hisob-kitob bilan asoslangan; 4) ish belgilangan talablar bo‘yicha rasmiylashtirilgan.',
            'Kamchilik va takliflar: 1) birinchi bobda so‘nggi besh yilda chiqqan manbalar kam; 2) 2.2-banddagi diagrammalarga izoh berilmagan; 3) takliflarni joriy etish xarajati hisoblanmagan.',
            'Xulosa: ko‘rsatilgan kamchiliklar ishning umumiy qiymatini pasaytirmaydi. Ish bitiruv malakaviy ishlariga qo‘yiladigan talablarga javob beradi va himoyaga tavsiya etiladi.',
            'Taqrizchi: shartli «Namuna-1» korxonasi bo‘lim boshlig‘i B · 12.11.2026; haqiqiy imzo va muhr qo‘yilmagan.',
            {'heading': '4-misol. Kitobga taqriz'},
            'Shartli muallif A ning «5-sinf uchun matnli masalalar to‘plami» nomli o‘quv qo‘llanmasiga TAQRIZ',
            'Qo‘llanma 96 betdan iborat: 6 bo‘lim, 240 ta masala va javoblar. U 5-sinf matematika dasturidagi mavzular tartibida tuzilgan, darsda va uy vazifasida foydalanishga mo‘ljallangan.',
            'Yutuqlari: 1) masalalar osondan murakkabga qarab joylashtirilgan; 2) har bo‘lim boshida yechim namunasi berilgan; 3) masala shartlari kundalik hayotga yaqin va tushunarli tilda yozilgan.',
            'Kamchilik va takliflar: 1) 4-bo‘limdagi 7 ta masalaning javobi berilmagan; 2) ayrim chizmalar mayda, chop etilganda o‘qilishi qiyin; 3) har bo‘lim oxiriga o‘z-o‘zini tekshirish testini qo‘shish foydali bo‘ladi.',
            'Xulosa: kamchiliklar tuzatilgach, qo‘llanmani nashrga va darsda qo‘shimcha material sifatida qo‘llashga tavsiya etaman.',
            'Taqrizchi: oliy toifali matematika o‘qituvchisi B · 12.11.2026; haqiqiy imzo qo‘yilmagan.',
        ],
    },
    {
        'slug': 'tezis',
        'article': '/uz/blog/tezis-namuna/',
        'title': 'KONFERENSIYA TEZISI',
        'subtitle': 'Tezis uchun tahrirlanadigan shablon, talablar jadvali va shartli mavzudagi ikki o‘quv misoli',
        'sections': [
            {'heading': 'Sarlavha qismi', 'lines': [
                '[TEZIS NOMI — BOSH HARFLARDA, QISQA VA ANIQ]',
                '[Muallifning familiyasi va ismi], [ilmiy darajasi, lavozimi yoki kursi]',
                '[Tashkilot: oliygoh yoki maktab, kafedra] · [shahar] · [e-mail]',
                'Ilmiy rahbar: [lavozim, F.I.Sh. — talaba yoki o‘quvchi ishida]',
            ]},
            {'heading': 'Annotatsiya va kalit so‘zlar (anjuman so‘rasa)', 'lines': [
                'Annotatsiya: [2–4 gap: nima o‘rganildi, qanday usulda va asosiy natija].',
                'Kalit so‘zlar: [5–7 ta so‘z yoki birikma].',
            ]},
            {'heading': 'Asosiy matn', 'lines': [
                'Dolzarblik: [muammo nimada va nega hozir muhim — 2–3 gap].',
                'Maqsad: [ish nimani aniqlaydi yoki taklif qiladi — bitta gap].',
                'Material va usullar: [nima asosida va qanday o‘rganildi: kuzatuv, so‘rovnoma, tajriba yoki manbalar tahlili].',
                'Natijalar: [asosiy 2–3 natija; raqam bo‘lsa — qanday olingani bilan].',
                'Xulosa: [natijalardan kelib chiqadigan 1–2 xulosa va amaliy taklif].',
            ]},
            {'heading': 'Foydalanilgan adabiyotlar (format — axborot xatidagi namunaga ko‘ra)', 'lines': [
                '1. [Familiya I.Sh.] [Kitob nomi]. — [Shahar]: [Nashriyot], [yil]. — [betlar soni] b.',
                '2. [Familiya I.Sh.] [Maqola nomi] // [Jurnal nomi]. — [yil]. — № [son]. — [betlar].',
            ]},
            {'heading': 'Rasmiylashtirish talablari: axborot xatidan ko‘chirib oling', 'lines': [
                'Yozishni boshlashdan oldin jadvalni anjumanning axborot xati bo‘yicha to‘ldiring.',
            ], 'table': THESIS_RULES},
        ],
        'check': 'Bu tuzilma shabloni, tayyor tezis emas. Har bir konferensiya o‘z talablarini axborot xatida e’lon qiladi: hajm, shrift, hoshiya va adabiyotlar formati o‘sha yerdan olinadi. Misollardagi raqamlar shartli — o‘z tezisingizga faqat o‘zingiz olgan natijalarni yozing.',
        'preview': [
            {'heading': '1-misol. Pedagogika yo‘nalishi'},
            'SINF KUTUBXONASI BURCHAGI O‘QUVCHILARNING KITOB O‘QISH ODATIGA TA’SIRI',
            'A, shartli pedagogika oliygohining 3-kurs talabasi · Ilmiy rahbar: katta o‘qituvchi B',
            'Annotatsiya: tezisda 4-sinfda tashkil etilgan sinf kutubxonasi burchagi bo‘yicha sakkiz haftalik kuzatuv natijalari berilgan. Kalit so‘zlar: kitobxonlik, sinf kutubxonasi, boshlang‘ich sinf, o‘qish kundaligi, kuzatuv.',
            'Dolzarblik: boshlang‘ich sinfda shakllangan mustaqil o‘qish odati keyingi sinflardagi o‘qishga tayanch bo‘ladi, ammo darsdan tashqari o‘qish ko‘pincha nazoratsiz qoladi.',
            'Maqsad: sinf kutubxonasi burchagi o‘quvchilarning haftalik mustaqil o‘qishiga qanday ta’sir qilishini kuzatish.',
            'Material va usullar: shartli maktabning 4-sinfida (26 o‘quvchi) 8 hafta davomida kuzatuv o‘tkazildi. Sinfga 40 ta kitobdan iborat burchak qo‘yildi, har bir o‘quvchi o‘qish kundaligi yuritdi.',
            'Natijalar: birinchi haftada 26 o‘quvchidan 9 nafari kamida bitta kitob oldi, sakkizinchi haftada — 19 nafari. Kundalik yuritgan o‘quvchilar o‘qigan kitobini og‘zaki so‘zlab berishda faolroq bo‘ldi.',
            'Xulosa: sinfdagi qulay kitob burchagi va o‘qish kundaligi mustaqil o‘qishni ko‘paytirishi mumkin. Natija bitta sinfga tegishli: uni tekshirish uchun kuzatuvni boshqa sinflarda takrorlash kerak.',
            'Adabiyotlar: o‘quv misolida ataylab berilmagan — o‘z tezisingizda faqat o‘zingiz o‘qigan manbalarni yozing.',
            {'heading': '2-misol. Ekologiya yo‘nalishi'},
            'MAKTABDA QOG‘OZ CHIQINDISINI ALOHIDA YIG‘ISH: TO‘RT HAFTALIK TAJRIBA NATIJALARI',
            'A, shartli maktabning 10-sinf o‘quvchisi · Ilmiy rahbar: biologiya o‘qituvchisi B',
            'Annotatsiya: tezisda maktabning bir qavatida qog‘oz chiqindisi uchun alohida qutilar qo‘yilgan to‘rt haftalik tajriba tasvirlangan. Kalit so‘zlar: chiqindini saralash, qog‘oz, maktab, ekologik odat, tajriba.',
            'Dolzarblik: maktabda har kuni ko‘p qog‘oz tashlanadi; uni alohida yig‘ish qog‘ozni qayta ishlashga topshirish imkonini beradi.',
            'Maqsad: alohida quti va qisqa tushuntirish o‘quvchilarning qog‘ozni saralab tashlashiga ta’sir qilishini aniqlash.',
            'Material va usullar: ikkinchi qavatdagi 6 ta sinf xonasiga qog‘oz uchun alohida quti qo‘yildi. Har juma kuni yig‘ilgan qog‘oz tarozida tortildi; ikkinchi haftadan boshlab sinf soatlarida 5 daqiqalik tushuntirish o‘tkazildi.',
            'Natijalar: birinchi haftada 7 kg, to‘rtinchi haftada 12 kg qog‘oz alohida yig‘ildi. Umumiy qutilardagi qog‘oz chamalab qaraganda kamaydi, lekin u o‘lchanmadi.',
            'Xulosa: alohida quti va qisqa tushuntirish birgalikda saralashni yaxshilashi mumkin. Aniqroq xulosa uchun umumiy qutilardagi qog‘ozni ham o‘lchash va tajribani butun maktabda o‘tkazish kerak.',
            'Adabiyotlar: bu misolda ham ataylab berilmagan.',
        ],
    },
    {
        'slug': 'cv-namuna',
        'article': '/uz/blog/cv-nima/',
        'title': 'CV (CURRICULUM VITAE)',
        'subtitle': 'Tahrirlanadigan CV shabloni hamda talaba, mutaxassis va ingliz tilidagi CV uchun shartli o‘quv misollari',
        'sections': [
            {'heading': 'Sarlavha va aloqa', 'lines': [
                '[ISM FAMILIYA]',
                '[Shahar, mamlakat] · [telefon] · [e-mail] · [LinkedIn yoki portfolio havolasi — bo‘lsa]',
            ]},
            {'heading': 'Profil (qisqacha ma’lumot)', 'lines': [
                '[2–3 gap: kim ekaningiz, qaysi sohada o‘qishingiz yoki ishlashingiz, nimaga ariza berayotganingiz].',
            ]},
            {'heading': 'Ta’lim', 'lines': [
                '[yil] — [yil] · [Oliygoh yoki maktab nomi], [yo‘nalish va daraja]',
                '[Asosiy fanlar, bitiruv ishi mavzusi yoki o‘rtacha ball — ariza uchun muhim bo‘lsa].',
            ]},
            {'heading': 'Ish tajribasi va amaliyot', 'lines': [
                '[oy.yil] — [oy.yil] · [Tashkilot nomi], [lavozim]',
                '[Nima qilganingiz va natijasi — 2–4 band; har biri fe’l bilan boshlanadi].',
            ]},
            {'heading': 'Ilmiy faoliyat va loyihalar (akademik CV uchun)', 'lines': [
                'Nashrlar: [Familiya I. Maqola yoki tezis nomi // To‘plam yoki jurnal. — yil. — betlar].',
                'Konferensiyalar: [yil, anjuman nomi, ma’ruza mavzusi].',
                'Loyihalar va grantlar: [nomi, yil, sizning vazifangiz].',
            ]},
            {'heading': 'Tillar va ko‘nikmalar', 'lines': [
                'Tillar: [til — daraja; sertifikat nomi va natijasi — bo‘lsa].',
                'Ko‘nikmalar: [dasturlar va kasbiy ko‘nikmalar — aniq ro‘yxat].',
            ]},
            {'heading': 'Qo‘shimcha ma’lumot', 'lines': [
                'Sertifikatlar va kurslar: [nomi, tashkilot, yil].',
                'Yutuqlar va volontyorlik: [nomi, yil].',
                'Tavsiya beruvchilar: [F.I.Sh., lavozim, aloqa — faqat ularning roziligi bilan; yoki «so‘rov bo‘yicha taqdim etiladi»].',
            ]},
        ],
        'check': 'Bu tuzilma shabloni, tasdiqlangan rasmiy shakl emas. Dastur, oliygoh yoki ish beruvchi o‘z shaklini — masalan, Europass yoki o‘z anketasini — so‘rasa, o‘shandan foydalaning. Faqat haqiqiy ma’lumot yozing; pasport raqami va JShShIRni CV’ga kiritmang.',
        'preview': [
            {'heading': '1-misol. Talaba CV’si'},
            'NAMUNA MISOLOVA · Toshkent, O‘zbekiston · +998 00 000 00 00 · namuna@example.com',
            'Profil: iqtisodiyot yo‘nalishining 3-kurs talabasiman. Ma’lumotlar tahlili va Excel bilan ishlashga qiziqaman. Moliya sohasida yozgi amaliyot o‘rni izlayapman.',
            'Ta’lim: 2024 — hozirgacha · shartli «Namuna universiteti», iqtisodiyot yo‘nalishi, bakalavriat. Asosiy fanlar: statistika, mikroiqtisodiyot, buxgalteriya hisobi.',
            'Amaliyot: 06.2026 — 07.2026 · shartli «Namuna-1» MCHJ, buxgalteriya bo‘limi amaliyotchisi. 120 ta birlamchi hujjatni reyestrga kiritdim. Oylik xarajatlar jadvalini Excel’da yangiladim.',
            'Loyiha: 2026 · «Talabalar oshxonasidagi navbat vaqtini o‘lchash» kurs loyihasi. 5 kun davomida ma’lumot yig‘dim va natijalarni diagrammalarda taqdim etdim.',
            'Tillar: o‘zbek — ona tili; rus — erkin; ingliz — B2.',
            'Ko‘nikmalar: Excel (formulalar, yig‘ma jadval), Word, PowerPoint; jamoada ishlash, taqdimot qilish.',
            'Qo‘shimcha: 2025 — fakultet talabalar ilmiy to‘garagi a’zosi; 2026 — shahar yoshlar tadbirida volontyor.',
            {'heading': '2-misol. Mutaxassis CV’si'},
            'MISOL NAMUNAYEV · Samarqand, O‘zbekiston · +998 00 000 00 00 · misol@example.com',
            'Profil: 9 yillik tajribaga ega ingliz tili o‘qituvchisi va metodistman. O‘qituvchilar uchun xalqaro malaka oshirish dasturiga ariza beryapman.',
            'Ta’lim: 2015 — 2017 · shartli «Namuna universiteti», lingvistika (ingliz tili), magistratura. 2011 — 2015 · shu universitet, xorijiy til va adabiyoti, bakalavriat.',
            'Ish tajribasi: 2019 — hozirgacha · shartli «Namuna-2» o‘quv markazi, katta o‘qituvchi va metodist. B1–B2 darajadagi guruhlar uchun 2 ta o‘quv dasturini tuzdim. 6 nafar yangi o‘qituvchiga murabbiylik qildim. 2017 — 2019 · shartli maktab, ingliz tili o‘qituvchisi.',
            'Nashrlar va ma’ruzalar: 2024 · «Katta guruhlarda juftlik ishini tashkil etish» — shartli ilmiy-amaliy konferensiya to‘plami, tezis. 2023 · o‘qituvchilar seminarida «Yozma ishga fikr-mulohaza berish» mavzusida ma’ruza.',
            'Sertifikatlar: 2022 · ingliz tilini o‘qitish metodikasi bo‘yicha xalqaro sertifikat (shartli). 2021 · ingliz tili bo‘yicha xalqaro imtihon sertifikati, C1 daraja (shartli).',
            'Tillar: o‘zbek — ona tili; ingliz — C1; rus — erkin.',
            'Ko‘nikmalar: dars va o‘quv dasturini loyihalash, onlayn platformalarda dars o‘tish, test tuzish; Word, Excel, PowerPoint.',
            'Tavsiya beruvchilar: so‘rov bo‘yicha taqdim etiladi.',
            {'heading': '3-misol. Ingliz tilidagi CV: o‘zbekcha izohlar bilan'},
            {'table': ENGLISH_CV},
        ],
    },
]
SLUGS = ['psixologik-tavsifnoma', 'taqriz', 'tezis', 'cv-namuna']


def table_cells(table):
    return list(table['headers']) + [cell for row in table['rows'] for cell in row]


def load_items():
    if [item['slug'] for item in TEMPLATES] != SLUGS:
        raise ValueError('The dataset must contain the approved document slugs exactly once, in order.')
    for item in TEMPLATES:
        if not re.fullmatch(r'[a-z0-9-]+', item['slug']):
            raise ValueError('Unexpected file name: ' + item['slug'])
        if not item['sections'] or not item['preview']:
            raise ValueError('Both editable sections and a complete example are required.')
        if not all(section['heading'] and section['lines'] for section in item['sections']):
            raise ValueError('Empty editable section: ' + item['slug'])
        if not isinstance(item['preview'][0], dict) or 'heading' not in item['preview'][0]:
            raise ValueError('Every example page starts with a labelled example: ' + item['slug'])
        tables = [s['table'] for s in item['sections'] if 'table' in s]
        tables += [p['table'] for p in item['preview'] if isinstance(p, dict) and 'table' in p]
        for table in tables:
            if not all(len(row) == len(table['headers']) for row in table['rows']):
                raise ValueError('Ragged table: ' + item['slug'])
            if 'ratios' in table and (len(table['ratios']) != len(table['headers']) or abs(sum(table['ratios']) - 1) > 0.001):
                raise ValueError('Column ratios must match the columns and add up to 1: ' + item['slug'])
        text = json.dumps(item, ensure_ascii=False)
        if re.search(r"[A-Za-zЀ-ӿ]['`ʻʼ´][A-Za-zЀ-ӿ]", text):
            raise ValueError('ASCII or modifier apostrophe between letters: ' + item['slug'])
    return TEMPLATES


def example_title(item):
    return item.get('example', EXAMPLE)


def example_note(item):
    return item.get('example_note', EXAMPLE_NOTE)


def clean_zip(data):
    result = BytesIO()
    with zipfile.ZipFile(BytesIO(data)) as source, zipfile.ZipFile(result, 'w') as target:
        for name in sorted(source.namelist()):
            info = zipfile.ZipInfo(name, (2026, 11, 17, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 0
            target.writestr(info, source.read(name))
    return result.getvalue()


def docx_table(doc, table):
    grid = doc.add_table(rows=1 + len(table['rows']), cols=len(table['headers']))
    grid.style = 'Table Grid'
    for column, text in enumerate(table['headers']):
        cell = grid.rows[0].cells[column]
        cell.text = ''
        run = cell.paragraphs[0].add_run(text)
        run.bold = True
        run.font.size = Pt(9)
    for index, row in enumerate(table['rows'], start=1):
        for column, text in enumerate(row):
            cell = grid.rows[index].cells[column]
            cell.text = ''
            cell.paragraphs[0].add_run(text).font.size = Pt(9)
    if 'ratios' in table:
        grid.autofit = False
        for row in grid.rows:
            for column, ratio in enumerate(table['ratios']):
                row.cells[column].width = Mm(TEXT_WIDTH_MM * ratio)
    doc.add_paragraph('')


def make_docx(item):
    doc = Document()
    props = doc.core_properties
    props.author = props.last_modified_by = 'GPTBot.uz'
    props.title, props.subject = item['title'], 'O‘zbekcha blanka va shartli o‘quv misoli'
    props.comments = 'Original static educational template. Conditional examples. No personal information.'
    props.created = props.modified = FIXED
    props.revision, props.language = 1, 'uz-Latn'
    section = doc.sections[0]
    section.page_width, section.page_height = Mm(210), Mm(297)
    section.top_margin = section.bottom_margin = Mm(17)
    section.left_margin = section.right_margin = Mm(20)
    normal = doc.styles['Normal']
    normal.font.name, normal.font.size = 'Arial', Pt(10)
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.1
    lang = OxmlElement('w:lang')
    lang.set(qn('w:val'), 'uz-Latn')
    normal.element.get_or_add_rPr().append(lang)
    for name, size in [('Title', 21), ('Heading 1', 12)]:
        style = doc.styles[name]
        style.font.name, style.font.size = 'Arial', Pt(size)
        style.font.color.rgb = RGBColor.from_string('10364A')
        style.paragraph_format.keep_with_next = True
    doc.add_paragraph(item['title'], 'Title')
    doc.add_paragraph(item['subtitle'])
    doc.add_paragraph(NOTE)
    for block in item['sections']:
        doc.add_paragraph(block['heading'], 'Heading 1')
        for line in block['lines']:
            doc.add_paragraph(line)
        if 'table' in block:
            docx_table(doc, block['table'])
    doc.add_paragraph(item['check'])
    doc.add_page_break()
    doc.add_paragraph(example_title(item), 'Title')
    doc.add_paragraph(example_note(item))
    for entry in item['preview']:
        if isinstance(entry, dict) and 'heading' in entry:
            doc.add_paragraph(entry['heading'], 'Heading 1')
        elif isinstance(entry, dict):
            docx_table(doc, entry['table'])
        else:
            doc.add_paragraph(entry)
    footer = section.footer.paragraphs[0]
    footer.add_run(STAMP).font.size = Pt(8)
    stream = BytesIO()
    doc.save(stream)
    return clean_zip(stream.getvalue())


def fonts():
    for regular, bold in [
        (Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
        (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
    ]:
        if regular.is_file() and bold.is_file():
            pdfmetrics.registerFont(TTFont('DocsTemplate', str(regular)))
            pdfmetrics.registerFont(TTFont('DocsTemplateBold', str(bold)))
            return regular.name
    raise RuntimeError('A Unicode Arial or DejaVu Sans regular/bold font pair is required.')


class WholeParagraph(Paragraph):
    """A paragraph that moves to the next page as a whole instead of being split."""

    def split(self, availWidth, availHeight):
        return []


def make_pdf(item):
    styles = {
        'title': ParagraphStyle('title', fontName='DocsTemplateBold', fontSize=20, leading=25, textColor=colors.HexColor('#10364A'), spaceAfter=9),
        'body': ParagraphStyle('body', fontName='DocsTemplate', fontSize=10, leading=14, spaceAfter=6),
        'heading': ParagraphStyle('heading', fontName='DocsTemplateBold', fontSize=11, leading=15, spaceBefore=9, spaceAfter=5, textColor=colors.HexColor('#10364A'), keepWithNext=True),
        'note': ParagraphStyle('note', fontName='DocsTemplate', fontSize=8.5, leading=12, textColor=colors.HexColor('#435864'), spaceAfter=8),
        'cell': ParagraphStyle('cell', fontName='DocsTemplate', fontSize=8.5, leading=11),
        'cellhead': ParagraphStyle('cellhead', fontName='DocsTemplateBold', fontSize=8.5, leading=11),
    }
    width = A4[0] - 112

    def whole(text, style):
        return WholeParagraph(escape(text), styles[style])

    def pdf_table(table):
        columns = len(table['headers'])
        if 'ratios' in table:
            widths = [width * ratio for ratio in table['ratios']]
        else:
            # A narrow first column for numbering, the rest share the remaining width.
            first = 24 if table['headers'][0] == '№' else None
            widths = [first] + [(width - first) / (columns - 1)] * (columns - 1) if first else [width / columns] * columns
        data = [[Paragraph(escape(text), styles['cellhead']) for text in table['headers']]]
        data += [[Paragraph(escape(text), styles['cell']) for text in row] for row in table['rows']]
        grid = Table(data, colWidths=widths, repeatRows=1)
        grid.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#9FB6C2')),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EAF3F6')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        return [grid, Spacer(1, 8)]

    stream = BytesIO()
    doc = SimpleDocTemplate(stream, pagesize=A4, leftMargin=56, rightMargin=56,
                            topMargin=45, bottomMargin=48, title=item['title'],
                            author='GPTBot.uz', subject='O‘zbekcha blanka va shartli o‘quv misoli',
                            creator='GPTBot.uz', invariant=1)
    story = [Paragraph(escape(item['title']), styles['title']),
             Paragraph(escape(item['subtitle']), styles['body']),
             Paragraph(escape(NOTE), styles['note'])]
    for block in item['sections']:
        # A blank section stays on one page when it fits there.
        group = [Paragraph(escape(block['heading']), styles['heading'])]
        group.extend(whole(line, 'body') for line in block['lines'])
        if 'table' in block:
            group.extend(pdf_table(block['table']))
        story.append(KeepTogether(group))
    story += [Spacer(1, 8), whole(item['check'], 'note'), PageBreak(),
              Paragraph(escape(example_title(item)), styles['title']), Paragraph(escape(example_note(item)), styles['note'])]
    group = []
    for entry in item['preview']:
        if isinstance(entry, dict) and 'heading' in entry:
            # Each example stays on one page when it fits there.
            if group:
                story.append(KeepTogether(group))
            group = [Paragraph(escape(entry['heading']), styles['heading'])]
        elif isinstance(entry, dict):
            group.extend(pdf_table(entry['table']))
        else:
            group.append(whole(entry, 'body'))
    story.append(KeepTogether(group))

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor('#C9DFE6'))
        canvas.line(56, 38, A4[0] - 56, 38)
        canvas.setFont('DocsTemplate', 8)
        canvas.setFillColor(colors.HexColor('#435864'))
        canvas.drawString(56, 25, STAMP)
        canvas.drawRightString(A4[0] - 56, 25, str(canvas.getPageNumber()))
        canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return stream.getvalue()


def compact(text):
    return re.sub(r'\s+', '', text)


def expected_text(item):
    texts = [item['title'], item['subtitle'], NOTE, item['check'], example_title(item), example_note(item)]
    for section in item['sections']:
        texts += [section['heading'], *section['lines']]
        if 'table' in section:
            texts += table_cells(section['table'])
    for entry in item['preview']:
        if isinstance(entry, dict) and 'heading' in entry:
            texts.append(entry['heading'])
        elif isinstance(entry, dict):
            texts += table_cells(entry['table'])
        else:
            texts.append(entry)
    return texts


def validate(item, generated):
    checks = []

    def check(name, result):
        checks.append({'name': name, 'pass': bool(result)})
    docx_path, pdf_path = (DEST / (item['slug'] + ext) for ext in ('.docx', '.pdf'))
    with zipfile.ZipFile(docx_path) as archive:
        check('DOCX CRC', archive.testzip() is None)
        all_xml = []
        for name in archive.namelist():
            if name.endswith(('.xml', '.rels')):
                text = archive.read(name).decode('utf-8')
                ET.fromstring(text)
                all_xml.append(text)
        xml = archive.read('word/document.xml').decode('utf-8')
        core = archive.read('docProps/core.xml').decode('utf-8')
        word_text = ' '.join(ET.fromstring(xml).itertext())
        check('DOCX complete blank and example text', all(compact(line) in compact(word_text) for line in expected_text(item)))
        check('DOCX editable placeholders and Uzbek language', '[' in word_text and 'uz-Latn' in ''.join(all_xml))
        check('DOCX separate example page', 'w:type="page"' in xml)
        check('DOCX example page is labelled after the page break',
              xml.index('w:type="page"') < xml.index(escape(example_title(item))))
        check('DOCX public author only', '<dc:creator>GPTBot.uz</dc:creator>' in core and '<cp:lastModifiedBy>GPTBot.uz</cp:lastModifiedBy>' in core)
        check('No private paths or macros', not re.search(r'Borinio|[CF]:[\\/]|vbaProject', ''.join(all_xml)))
        check('No external DOCX relationships', not any('TargetMode="External"' in value for value in all_xml))
    pdf = PdfReader(pdf_path)
    page_texts = [page.extract_text() or '' for page in pdf.pages]
    pdf_text = '\n'.join(page_texts)
    check(f'PDF printable A4 two to {MAX_PAGES} pages without blank pages',
          2 <= len(pdf.pages) <= MAX_PAGES and all(len(text.strip()) > 100 for text in page_texts)
          and all(abs(float(page.mediabox.width) - A4[0]) < 1 and abs(float(page.mediabox.height) - A4[1]) < 1 for page in pdf.pages))
    check('PDF complete blank and example text', all(compact(line) in compact(pdf_text) for line in expected_text(item)))
    first_example_page = next((index for index, text in enumerate(page_texts) if compact(example_title(item)) in compact(text)), -1)
    blank_part = compact(''.join(page_texts[:max(first_example_page, 0)]))
    example_part = compact(''.join(page_texts[max(first_example_page, 0):]))
    check('PDF examples start on their own page, after the whole blank',
          first_example_page >= 1
          and all(compact(text) in blank_part and compact(text) not in example_part for text in (NOTE, item['check']))
          and all(compact(entry['heading']) in example_part and compact(entry['heading']) not in blank_part
                  for entry in item['preview'] if isinstance(entry, dict) and 'heading' in entry))
    check('PDF Uzbek glyphs extract without replacements', '‘' in pdf_text and '’' in pdf_text and '\ufffd' not in pdf_text and '■' not in pdf_text)
    check('PDF public author', pdf.metadata.author == 'GPTBot.uz')
    descriptors = []
    for page in pdf.pages:
        for font in page['/Resources']['/Font'].get_object().values():
            font = font.get_object()
            if '/FontDescriptor' in font:
                descriptors.append(font['/FontDescriptor'].get_object())
    check('PDF Unicode fonts embedded', len(descriptors) >= 2 and all('/FontFile2' in font for font in descriptors))
    check('PDF has no external links or actions', '/OpenAction' not in pdf.trailer['/Root'] and all(not page.get('/Annots') for page in pdf.pages))
    check('DOCX deterministic regeneration', docx_path.read_bytes() == generated['docx'])
    check('PDF deterministic regeneration', pdf_path.read_bytes() == generated['pdf'])
    return {'slug': item['slug'], 'article': item['article'], 'pages': len(pdf.pages), 'checks': checks,
            'sha256': {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (docx_path, pdf_path)},
            'bytes': {path.name: path.stat().st_size for path in (docx_path, pdf_path)}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    items, font = load_items(), fonts()
    if not args.check:
        DEST.mkdir(parents=True, exist_ok=True)
    results = []
    for item in items:
        generated = {'docx': make_docx(item), 'pdf': make_pdf(item)}
        if not args.check:
            for extension, data in generated.items():
                (DEST / (item['slug'] + '.' + extension)).write_bytes(data)
        results.append(validate(item, generated))
    failed = [(result['slug'], check['name']) for result in results for check in result['checks'] if not check['pass']]
    report = {'status': 'FAIL' if failed else 'PASS', 'font': font, 'templates': results, 'failed': failed}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'templates': len(results), 'checks': sum(len(result['checks']) for result in results),
                      'failed': failed, 'pages': {result['slug']: result['pages'] for result in results}}, ensure_ascii=False))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
