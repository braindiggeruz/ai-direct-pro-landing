"""Build nine original Uzbek document kits (DOCX + PDF) for the 2026-11-16 guides.

Kits: an explanatory letter, a course-paper and a referat title page with plan,
a service memo (bildirgi), a lesson analysis with a journal page, a receipt
(tilxat), a work report, a guarantee letter and a set of applications. Each kit
has an editable blank and a separately labelled conditional example on its own
page. No user input, network, macros, real people, real organisations or actual
signatures.

Same document libraries, font strategy and checks as pseo-document-templates.py;
the earlier download folders are not touched. Requires python-docx, reportlab
and pypdf (available in the desktop bundled Python).

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
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/downloads/docs-20261116'
FIXED = datetime(2026, 11, 16, tzinfo=timezone.utc)
STAMP = 'GPTBot.uz · O‘quv namunasi · 16.11.2026'
NOTE = 'Tahrirlanadigan qism. Kvadrat qavslarni o‘z ma’lumotingiz bilan almashtiring; keraksiz bandlarni o‘chiring. Qabul qiluvchi bergan shakl bo‘lsa, o‘sha shakldan foydalaning.'
EXAMPLE = 'TO‘LDIRILGAN O‘QUV MISOLI'
EXAMPLE_NOTE = 'Quyidagi matn tuzilmani ko‘rsatish uchun yozilgan. Undagi odamlar, tashkilotlar va voqealar to‘qima. Uni haqiqiy hujjat sifatida topshirmang.'
PLAN_EXAMPLE = 'SHARTLI MAVZUDAGI REJA MISOLI'
PLAN_EXAMPLE_NOTE = 'Quyidagi reja tuzilmani ko‘rsatish uchun shartli mavzuda yozilgan. Bu tayyor ish emas: mavzu, boblar va manbalarni o‘z topshirig‘ingizga moslang.'

LESSON_STAGES = {
    'headers': ['Bosqich', 'Vaqt', 'Kuzatilgan ish'],
    'rows': [
        ['Tashkiliy qism', '[daq.]', '[davomat, darsga tayyorgarlik]'],
        ['O‘tilgan mavzuni takrorlash', '[daq.]', '[savol-javob, uy vazifasini tekshirish]'],
        ['Yangi mavzu bayoni', '[daq.]', '[tushuntirish usuli, misollar, ko‘rgazma]'],
        ['Mustahkamlash', '[daq.]', '[mashq, mustaqil yoki guruhli ish]'],
        ['Yakun va uyga vazifa', '[daq.]', '[xulosa, baholash, vazifa]'],
    ],
}
LESSON_JOURNAL = {
    'headers': ['№', 'Sana', 'Sinf va fan', 'O‘qituvchi', 'Mavzu', 'Qisqa xulosa va tavsiya', 'Imzo'],
    'rows': [
        ['1', '[sana]', '[sinf, fan]', '[F.I.Sh.]', '[mavzu]', '[1–2 gap]', '[imzo]'],
        ['2', '[sana]', '[sinf, fan]', '[F.I.Sh.]', '[mavzu]', '[1–2 gap]', '[imzo]'],
        ['3', '[sana]', '[sinf, fan]', '[F.I.Sh.]', '[mavzu]', '[1–2 gap]', '[imzo]'],
    ],
}
REPORT_TASKS = {
    'headers': ['№', 'Vazifa', 'Reja', 'Natija', 'Izoh'],
    'rows': [
        ['1', '[vazifa]', '[rejadagi hajm yoki muddat]', '[haqiqiy natija]', '[izoh]'],
        ['2', '[vazifa]', '[rejadagi hajm yoki muddat]', '[haqiqiy natija]', '[izoh]'],
        ['3', '[vazifa]', '[rejadagi hajm yoki muddat]', '[haqiqiy natija]', '[izoh]'],
    ],
}

TEMPLATES = [
    {
        'slug': 'tushuntirish-xati',
        'article': '/uz/blog/tushuntirish-xati-va-ariza-yozish/',
        'title': 'TUSHUNTIRISH XATI',
        'subtitle': 'Tahrirlanadigan blanka va ishga kechikish haqidagi shartli o‘quv misoli',
        'sections': [
            {'heading': 'Kimga', 'lines': ['[Tashkilot nomi] [bo‘lim] boshlig‘i [F.I.Sh.]ga']},
            {'heading': 'Kimdan', 'lines': ['[Bo‘lim] [lavozim yoki guruh] [F.I.Sh.]dan']},
            {'heading': 'Sarlavha', 'lines': ['TUSHUNTIRISH XATI — alohida qatorda, sahifa o‘rtasida']},
            {'heading': 'Asosiy matn', 'lines': [
                'Men, [F.I.Sh.], [sana] kuni [nima bo‘lgani: masalan, ishga soat [vaqt] o‘rniga [vaqt]da keldim].',
                'Sababi: [haqiqatda bo‘lgan sabab — qisqa va aniq].',
                '[Holat haqida kimga va qachon xabar berganingiz — bo‘lsa].',
                'Ilova: [tasdiqlovchi hujjat nomi — bo‘lsa].',
            ]},
            {'heading': 'Xulosa', 'lines': ['[Holat takrorlanmasligi uchun nima qilishingiz — bitta gap, kerak bo‘lsa].']},
            {'heading': 'Sana va imzo', 'lines': ['[kun.oy.yil] · [imzo] · [F.I.Sh.]']},
        ],
        'check': 'Bu tasdiqlangan rasmiy shakl emas. Tashkilotingizning o‘z shakli bo‘lsa, o‘shandan foydalaning. Faqat haqiqatda bo‘lgan sana, vaqt va sababni yozing; misoldagi sababni o‘zingizniki sifatida qoldirmang.',
        'preview': [
            'Savdo bo‘limi boshlig‘i A ga',
            'Savdo bo‘limi menejeri B dan',
            'TUSHUNTIRISH XATI',
            'Men, B, 2026-yil 16-noyabr kuni ishga soat 09:00 o‘rniga 09:40 da, ya’ni 40 daqiqa kechikib keldim.',
            'Sababi: har kuni foydalanadigan avtobusim yo‘lda buzilib qoldi va keyingisini kutishga to‘g‘ri keldi.',
            'Kechikishim haqida bo‘lim boshlig‘iga soat 08:50 da telefon orqali xabar berdim. Bundan keyin uydan oldinroq chiqaman.',
            '16.11.2026 · B; haqiqiy imzo qo‘yilmagan.',
        ],
    },
    {
        'slug': 'kurs-ishi-titul-reja',
        'article': '/uz/blog/kurs-ishi-yozish/',
        'title': 'KURS ISHI: TITUL VARAQ VA REJA',
        'subtitle': 'Titul varaq, mundarija, kirish bandlari va adabiyotlar ro‘yxati uchun tahrirlanadigan shablon',
        'sections': [
            {'heading': 'Titul varaq', 'lines': [
                '[Oliy ta’lim muassasasi nomi]',
                '[Fakultet] · [Kafedra]',
                'Fan: [fan nomi]',
                'KURS ISHI',
                'Mavzu: [kurs ishi mavzusi]',
                'Bajardi: [guruh] talabasi [F.I.Sh.]',
                'Ilmiy rahbar: [lavozim, F.I.Sh.]',
                '[Shahar] — [yil]',
            ]},
            {'heading': 'Mundarija (reja)', 'lines': [
                'Kirish',
                'I bob. [Nazariy bob nomi]: 1.1. [paragraf nomi] · 1.2. [paragraf nomi]',
                'II bob. [Amaliy yoki tahliliy bob nomi]: 2.1. [paragraf nomi] · 2.2. [paragraf nomi]',
                'Xulosa va takliflar',
                'Foydalanilgan adabiyotlar',
                'Ilovalar [kerak bo‘lsa]',
            ]},
            {'heading': 'Kirish uchun bandlar', 'lines': [
                'Dolzarblik: [mavzu nega hozir muhim — bir necha aniq gap]',
                'Maqsad: [ish oxirida nimaga erishmoqchisiz — bitta gap]',
                'Vazifalar: 1) [birinchi vazifa]; 2) [ikkinchi vazifa]; 3) [uchinchi vazifa]',
                'Obyekt: [nima o‘rganiladi] · Predmet: [obyektning qaysi tomoni o‘rganiladi]',
                'Metodlar: [manbalar tahlili, kuzatuv, so‘rovnoma, taqqoslash yoki boshqa usul]',
                'Ishning tuzilishi: [nechta bob, paragraf va ilova borligi]',
            ]},
            {'heading': 'Foydalanilgan adabiyotlar (yozuv shakli kafedra talabiga ko‘ra)', 'lines': [
                '1. [Familiya I.Sh.] [Kitob nomi]. — [Shahar]: [Nashriyot], [yil]. — [betlar soni] b.',
                '2. [Familiya I.Sh.] [Maqola nomi] // [Jurnal nomi]. — [yil]. — № [son]. — [betlar].',
                '3. [Sayt yoki hujjat nomi]. [Havola] ([murojaat qilingan sana]).',
            ]},
        ],
        'check': 'Bu majburiy me’yor emas: titul varaq ko‘rinishi, hajm, shrift va adabiyotlar formati kafedraning uslubiy ko‘rsatmasidan olinadi. Shablon tayyor kurs ishi emas; har bir bob matnini manbalarni o‘qib, o‘zingiz yozasiz.',
        'example': PLAN_EXAMPLE,
        'example_note': PLAN_EXAMPLE_NOTE,
        'preview': [
            'Mavzu: Boshlang‘ich sinf o‘quvchilarida kitobxonlik ko‘nikmasini shakllantirish',
            'Maqsad: kitobxonlik ko‘nikmasini shakllantirish usullarini o‘rganish va tavsiyalar berish.',
            'Vazifalar: 1) tushunchalarni aniqlash; 2) usullarni taqqoslash; 3) kuzatuv natijalarini tahlil qilish; 4) takliflar ishlab chiqish.',
            'Kirish — dolzarblik, maqsad, vazifalar, obyekt, predmet va metodlar.',
            'I bob. Nazariy qism: 1.1. Kitobxonlik ko‘nikmasi tushunchasi · 1.2. Boshlang‘ich sinfda o‘qishga qiziqtirish usullari',
            'II bob. Amaliy qism: 2.1. Kuzatuv yoki so‘rovnoma tartibi · 2.2. Natijalar tahlili · 2.3. Tavsiyalar',
            'Xulosa va takliflar — har bir vazifa bo‘yicha 1–2 xulosa va o‘qituvchilar uchun 2–3 amaliy taklif.',
            'Foydalanilgan adabiyotlar — siz o‘qigan manbalar ro‘yxati. Ilova: so‘rovnoma shakli.',
            'Titul varaqdagi muassasa, talaba va ilmiy rahbar ma’lumotlari bu misolda ataylab to‘ldirilmagan.',
        ],
    },
    {
        'slug': 'referat-titul-reja',
        'article': '/uz/blog/referat-va-mustaqil-ish/',
        'title': 'REFERAT: TITUL VARAQ VA REJA',
        'subtitle': 'Titul varaq, reja va mustaqil ish rejasi uchun tahrirlanadigan shablon',
        'sections': [
            {'heading': 'Titul varaq (muqova)', 'lines': [
                '[Muassasa nomi]',
                'Fan: [fan nomi]',
                'REFERAT',
                'Mavzu: [referat mavzusi]',
                'Bajardi: [Ism Familiya], [sinf yoki guruh]',
                'Tekshirdi: [o‘qituvchi]',
                '[Shahar] — [yil]',
            ]},
            {'heading': 'Reja (mundarija)', 'lines': [
                'Kirish',
                'I bob. [Bob nomi]: 1.1. [band] · 1.2. [band]',
                'II bob. [Bob nomi]: 2.1. [band] · 2.2. [band]',
                'III bob. [Bob nomi]: 3.1. [band] · 3.2. [band]',
                'Xulosa',
                'Foydalanilgan adabiyotlar',
            ]},
            {'heading': 'Kirish uchun bandlar', 'lines': [
                'Mavzu nega muhim: [1–2 gap]',
                'Maqsad: [ish nimani ko‘rsatadi — bitta gap]',
                'Vazifalar: [2–3 vazifa]',
                'O‘rganilgan manbalar: [o‘zingiz o‘qigan darslik, maqola yoki sayt]',
            ]},
            {'heading': 'Mustaqil ish rejasi', 'lines': [
                'Topshiriq: [o‘qituvchi bergan matn]',
                'Shakl: [referat, taqdimot, esse, masala yechish yoki tahlil]',
                'Hajm va muddat: [necha bet yoki slayd; qachongacha topshiriladi]',
                'Manbalar: [nechta va qaysi turdagi manba kerak]',
                'Bajarish bosqichlari: 1) [birinchi qadam]; 2) [ikkinchi qadam]; 3) [uchinchi qadam]',
                'Baholash: [nimaga ball beriladi — mazmun, rasmiylashtirish yoki og‘zaki himoya]',
            ]},
            {'heading': 'Foydalanilgan adabiyotlar (yozuv shaklini o‘qituvchidan so‘rang)', 'lines': [
                '[Familiya I.Sh.] [Kitob nomi]. — [Shahar]: [Nashriyot], [yil]. — [betlar soni] b.',
            ]},
        ],
        'check': 'Bu tuzilma shabloni, tayyor referat emas. Hajm, shrift, titul varaq ko‘rinishi va adabiyotlar formatini o‘qituvchi yoki uslubiy qo‘llanmadan aniqlang; matnni manbalarni o‘qib, o‘z so‘zlaringiz bilan yozing.',
        'example': PLAN_EXAMPLE,
        'example_note': PLAN_EXAMPLE_NOTE,
        'preview': [
            'Mavzu: Maktab kutubxonasi va kitobxonlik madaniyati',
            'Maqsad: maktab kutubxonasi o‘quvchilarda kitob o‘qish odatini shakllantirishga qanday yordam berishini manbalar asosida ko‘rsatish.',
            'Kirish — mavzu nega muhim, ishning maqsadi va vazifalari, qaysi manbalar o‘rganilgani.',
            'I bob. Kitobxonlik tushunchasi: 1.1. Kitobxonlik nima · 1.2. Kitob o‘qishning foydasi',
            'II bob. Maktab kutubxonasining vazifalari: 2.1. Kutubxona fondi · 2.2. Kutubxonadagi tadbirlar',
            'III bob. Kitobxonlikni rivojlantirish yo‘llari: 3.1. Oilada kitob o‘qish · 3.2. Sinfdagi kitob klubi',
            'Xulosa — har bir bobdan bitta xulosa va o‘z fikringiz; yangi fakt qo‘shilmaydi.',
            'Foydalanilgan adabiyotlar — siz o‘qigan va tekshirgan kitob, maqola va saytlar.',
            'Titul varaqdagi muassasa, bajaruvchi va o‘qituvchi ma’lumotlari bu misolda ataylab to‘ldirilmagan.',
        ],
    },
    {
        'slug': 'bildirgi',
        'article': '/uz/blog/bildirishnoma-namuna/',
        'title': 'BILDIRGI',
        'subtitle': 'Rahbarga xizmat yuzasidan yozma axborot: tahrirlanadigan blanka va shartli o‘quv misoli',
        'sections': [
            {'heading': 'Kimga', 'lines': ['[Tashkilot yoki bo‘lim] rahbari [lavozim, F.I.Sh.]ga']},
            {'heading': 'Kimdan', 'lines': ['[Bo‘lim] [lavozim] [F.I.Sh.]dan']},
            {'heading': 'Hujjat nomi va mavzu', 'lines': [
                'BILDIRGI — alohida qatorda, sahifa o‘rtasida',
                '[Qisqa mavzu: nima haqida — masalan, hisobot muddatini uzaytirish haqida]',
            ]},
            {'heading': 'Holat', 'lines': [
                '[Sana va joy: nima yuz berdi yoki nima aniqlandi — tekshirsa bo‘ladigan fakt].',
                '[Sababi ma’lum bo‘lsa — sabab; noma’lum bo‘lsa, aynan shuni yozing].',
                '[Holatning ishga ta’siri].',
            ]},
            {'heading': 'Ko‘rilgan chora va so‘rov', 'lines': [
                'Hozirgacha [bajarilgan ish yoki ko‘rilgan chora].',
                'Sizdan [aniq qaror, ruxsat yoki topshiriq] berishingizni so‘rayman.',
                '[Taklif etilayotgan muddat yoki keyingi qadam — asosi bilan].',
            ]},
            {'heading': 'Ilova, sana va imzo', 'lines': [
                'Ilova: [hujjat nomi va varaqlar soni — bo‘lsa]',
                '[kun.oy.yil] · [imzo] · [F.I.Sh.]',
            ]},
        ],
        'check': 'Bu tasdiqlangan rasmiy shakl emas. Hujjat nomi (bildirgi, bildirishnoma yoki raport) va shakli tashkilotingizning ish yuritish tartibiga ko‘ra tanlanadi. Faqat tekshirsa bo‘ladigan faktlarni yozing; taxminni fakt sifatida bermang.',
        'preview': [
            'Bo‘lim boshlig‘i A ga · Bo‘lim mutaxassisi B dan · 16.11.2026',
            'BILDIRGI · Oylik hisobot muddatini uzaytirish haqida',
            'Oktabr oyi bo‘yicha hisobotni 2026-yil 20-noyabrgacha topshirish belgilangan. Hisobot uchun zarur bo‘lgan 12 ta ombor jadvalidan 16-noyabr holatiga ko‘ra 7 tasi olindi.',
            'Ombor bo‘limi qolgan 5 ta jadvalni 18-noyabrda yuborishini ma’lum qildi. Ma’lumotlar kechikayotganining sababi menga rasman bildirilmagan.',
            'Olingan 7 ta jadval bo‘yicha hisob-kitobni yakunladim va qolgan qismi uchun jadval shaklini tayyorlab qo‘ydim.',
            'Sizdan hisobotni topshirish muddatini 2026-yil 23-noyabrgacha uzaytirishingizni so‘rayman. Ma’lumotlar 18-noyabrda kelsa, tekshirish va rasmiylashtirishga uch ish kuni yetadi.',
            'Ilova: olingan jadvallar ro‘yxati, 1 varaq. Bo‘lim mutaxassisi B; haqiqiy imzo qo‘yilmagan.',
        ],
    },
    {
        'slug': 'dars-tahlili',
        'article': '/uz/blog/dars-tahlili-namuna/',
        'title': 'DARS TAHLILI',
        'subtitle': 'Darsni kuzatish va tahlil qilish uchun tahrirlanadigan blanka, daftar sahifasi va to‘ldirilgan o‘quv misoli',
        'sections': [
            {'heading': 'Umumiy ma’lumot', 'lines': [
                'Sana: [kun.oy.yil] · Sinf: [sinf] · Fan: [fan nomi]',
                'O‘qituvchi: [F.I.Sh.] · Dars mavzusi: [mavzu]',
                'Dars turi: [yangi bilim berish, mustahkamlash, takrorlash yoki boshqa]',
                'Darsning maqsadi: [ta’limiy, tarbiyaviy va rivojlantiruvchi maqsad]',
                'Tahlilchi: [lavozim, F.I.Sh.] · Tahlil maqsadi: [nima kuzatiladi]',
            ]},
            {'heading': 'Dars bosqichlari va vaqt', 'lines': [
                'Har bosqichda kim nima qilgani va qancha vaqt ketganini yozing.',
            ], 'table': LESSON_STAGES},
            {'heading': 'Usullar va o‘quvchilar faolligi', 'lines': [
                'Qo‘llangan usul va vositalar: [tushuntirish, ko‘rgazma, juftlikda ish, texnik vosita]',
                'O‘quvchilar faolligi: [nechta o‘quvchi javob berdi yoki topshiriq bajardi — kuzatuv bo‘yicha]',
                'Baholash: [qanday mezon bilan va nechta o‘quvchi baholandi]',
            ]},
            {'heading': 'Xulosa va tavsiyalar', 'lines': [
                'Yutuqlar: [kuzatilgan 2–3 ta kuchli jihat]',
                'Yaxshilash kerak bo‘lgan jihatlar: [kuzatilgan fakt bilan]',
                'Tavsiyalar: 1) [aniq harakat]; 2) [aniq harakat]; 3) [muddat yoki keyingi kuzatuv]',
                'Tahlilchi: [imzo] · Tahlil xulosalari bilan tanishdim: [o‘qituvchi imzosi, sana]',
            ]},
            {'heading': 'Dars tahlili daftari sahifasi', 'lines': [
                'Daftarga har bir kuzatilgan dars bitta qator bo‘lib yoziladi; to‘liq tahlil alohida varaqda saqlanadi.',
            ], 'table': LESSON_JOURNAL},
        ],
        'check': 'Bu tasdiqlangan rasmiy shakl emas. Ta’lim muassasangiz yoki metodika xizmati bergan shakl bo‘lsa, o‘shandan foydalaning. Faqat darsda kuzatilgan faktlarni yozing va tavsiyalarni o‘qituvchi bilan muhokama qiling.',
        'preview': [
            '12.11.2026 · 5-sinf · Matematika · O‘qituvchi A · Tahlilchi: direktor o‘rinbosari B',
            'Mavzu: Oddiy kasrlarni taqqoslash. Dars turi: yangi bilim berish. Tahlil maqsadi: yangi mavzuni tushuntirishda ko‘rgazmalilik va o‘quvchilar faolligini kuzatish.',
            {'table': {
                'headers': ['Bosqich', 'Vaqt', 'Kuzatilgan ish'],
                'rows': [
                    ['Tashkiliy qism', '3 daq.', 'Davomat qayd etildi, dars maqsadi doskaga yozildi.'],
                    ['O‘tilgan mavzuni takrorlash', '7 daq.', 'Og‘zaki savol-javob: 6 o‘quvchi javob berdi.'],
                    ['Yangi mavzu bayoni', '15 daq.', 'Doskada 3 ta misol tushuntirildi; kasr doiralari ko‘rgazma sifatida ishlatildi.'],
                    ['Mustahkamlash', '15 daq.', 'Juftlikda 4 ta misol yechildi; 2 o‘quvchi yechimni doskada ko‘rsatdi.'],
                    ['Yakun va uyga vazifa', '5 daq.', 'Xulosa savoli berildi, uyga vazifa tushuntirildi.'],
                ],
            }},
            'O‘quvchilar faolligi: 24 o‘quvchidan 15 nafari kamida bir marta javob berdi yoki doskada ishladi.',
            'Yutuqlar: ko‘rgazmali vosita mavzuga mos tanlandi; bosqichlar vaqti rejaga yaqin taqsimlandi.',
            'Tavsiyalar: 1) kam qatnashgan o‘quvchilarga alohida savol tayyorlash; 2) mustahkamlashda yakka mustaqil ishga 5 daqiqa ajratish; 3) baholash mezonini dars boshida aytish.',
            'Tahlilchi B; haqiqiy imzo qo‘yilmagan. O‘qituvchining tanishuv belgisi o‘quv misolida berilmagan.',
        ],
    },
    {
        'slug': 'tilxat',
        'article': '/uz/blog/tilxat-namuna/',
        'title': 'TILXAT',
        'subtitle': 'Pul, buyum yoki hujjat olinganini tasdiqlash uchun tahrirlanadigan blankalar va shartli o‘quv misollari',
        'sections': [
            {'heading': 'Qarzga pul olish haqida tilxat', 'lines': [
                'TILXAT — alohida qatorda, sahifa o‘rtasida',
                'Men, [F.I.Sh.], [yashash manzili], [F.I.Sh.]dan [summa raqam bilan] ([summa so‘z bilan]) so‘m miqdoridagi pulni qarzga oldim.',
                'Qarzni [kun.oy.yil] sanasigacha to‘liq qaytarish majburiyatini olaman.',
                'Shaxsni tasdiqlovchi hujjat: [turi va raqami — tomonlar shunday kelishgan bo‘lsa].',
                'Guvohlar: [F.I.Sh. va imzo — bo‘lsa].',
                '[kun.oy.yil] · [imzo] · [F.I.Sh.]',
            ]},
            {'heading': 'Buyum yoki hujjat olish haqida tilxat', 'lines': [
                'Men, [lavozim, F.I.Sh.], [F.I.Sh. yoki tashkilot nomi]dan [buyum yoki hujjatning aniq nomi va miqdori] oldim.',
                'Holati: [yangi, ishlatilgan yoki nuqsoni bor — texnik vosita bo‘lsa].',
                'Qaytarish muddati: [kun.oy.yil — vaqtincha olingan bo‘lsa].',
                '[kun.oy.yil] · [imzo] · [lavozim, F.I.Sh.]',
            ]},
            {'heading': 'Кирилл ёзувида: қарз тилхати', 'lines': [
                'ТИЛХАТ',
                'Мен, [Ф.И.Ш.], [яшаш манзили], [Ф.И.Ш.]дан [сумма рақам билан] ([сумма сўз билан]) сўм миқдоридаги пулни қарзга олдим.',
                'Қарзни [кун.ой.йил] санасигача тўлиқ қайтариш мажбуриятини оламан.',
                '[кун.ой.йил] · [имзо] · [Ф.И.Ш.]',
            ]},
        ],
        'check': 'Bu o‘quv namunasi, yuridik maslahat emas. Tilxatga tuzatish kiritilmaydi: xato ketsa, qaytadan yozing. Summani raqam va so‘z bilan ko‘rsating. Katta summa yoki nizoli holatda notarius yoki yuristga murojaat qiling.',
        'preview': [
            'TILXAT · qarzga pul olish haqida',
            'Men, Toshkent shahrida yashovchi A, B dan 2 000 000 (ikki million) so‘m miqdoridagi pulni qarzga oldim.',
            'Qarzni 2027-yil 16-fevral sanasigacha to‘liq qaytarish majburiyatini olaman.',
            'Guvoh: D. 16.11.2026 · A (qarz oluvchi); haqiqiy imzolar qo‘yilmagan.',
            'TILXAT · buyum olish haqida',
            'Men, o‘quv markazi administratori A, texnik mas’ul B dan 1 ta proyektor va 1 ta ulash kabelini oldim. Holati: ishlatilgan, ko‘rinadigan nuqsoni yo‘q.',
            'Qaytarish muddati: 2026-yil 20-noyabr. 16.11.2026 · A (qabul qiluvchi); haqiqiy imzo qo‘yilmagan.',
        ],
    },
    {
        'slug': 'hisobot',
        'article': '/uz/blog/hisobot-namuna/',
        'title': 'ISH HISOBOTI',
        'subtitle': 'Haftalik va oylik ish hisoboti uchun tahrirlanadigan blanka va shartli o‘quv misoli',
        'sections': [
            {'heading': 'Sarlavha qismi', 'lines': [
                '[Tashkilot yoki bo‘lim nomi]',
                '[Rahbarning lavozimi, F.I.Sh.]ga · [lavozim, F.I.Sh.]dan',
                'HISOBOT — [hafta yoki oy: sana] — [sana] davri uchun',
            ]},
            {'heading': 'Bajarilgan ishlar', 'lines': [
                'Natijani tekshirsa bo‘ladigan ko‘rinishda yozing: hujjat, raqam yoki sana.',
            ], 'table': REPORT_TASKS},
            {'heading': 'Bajarilmagan ishlar va sabablari', 'lines': [
                '[Vazifa] — [sababi] — [yangi muddat yoki kerakli yordam]',
            ]},
            {'heading': 'Keyingi davr rejasi', 'lines': [
                '1) [vazifa, muddat]; 2) [vazifa, muddat]; 3) [vazifa, muddat]',
            ]},
            {'heading': 'Oylik hisobot uchun qo‘shimcha', 'lines': [
                'Oy yakuni bo‘yicha asosiy ko‘rsatkichlar: [ko‘rsatkich — reja — haqiqat]',
                'Muammo va takliflar: [qisqa va aniq]',
            ]},
            {'heading': 'Sana va imzo', 'lines': ['[kun.oy.yil] · [imzo] · [lavozim, F.I.Sh.]']},
        ],
        'check': 'Bu tasdiqlangan rasmiy shakl emas. Tashkilotingizda hisobot shakli yoki elektron tizim bo‘lsa, o‘shandan foydalaning. Faqat haqiqatda bajarilgan ish va tekshirilgan raqamlarni yozing.',
        'preview': [
            'Savdo bo‘limi boshlig‘i A ga · Bo‘lim mutaxassisi B dan',
            'HISOBOT — 2026-yil 9–13-noyabr haftasi uchun',
            {'table': {
                'headers': ['№', 'Vazifa', 'Reja', 'Natija', 'Izoh'],
                'rows': [
                    ['1', 'Mijozlar so‘rovlariga javob berish', 'Har bir so‘rovga 1 ish kunida', '18 ta so‘rovdan 17 tasiga muddatida javob berildi', '1 ta so‘rov ombor ma’lumoti kutilgani uchun 2 kunda yopildi'],
                    ['2', 'Oktabr oyi hisobotiga ma’lumot yig‘ish', '12 ta jadval', '7 ta jadval olindi', 'Qolgan 5 tasi 18-noyabrda kutilmoqda'],
                    ['3', 'Yangi narxlar ro‘yxatini tekshirish', '1 ta ro‘yxat', 'Tekshirildi, 3 ta xato tuzatildi', 'Izoh yo‘q'],
                ],
            }},
            'Bajarilmagan ish: oktabr oyi hisoboti yakunlanmadi — 5 ta jadval kelmagan; yangi muddat rahbar bilan kelishiladi.',
            'Keyingi hafta rejasi: 1) qolgan jadvallarni olish va tekshirish — 18–19-noyabr; 2) oktabr oyi hisobotini topshirish — 23-noyabrgacha; 3) so‘rovlarga javob muddatini saqlash.',
            '13.11.2026 · B; haqiqiy imzo qo‘yilmagan.',
        ],
    },
    {
        'slug': 'kafolat-xati',
        'article': '/uz/blog/kafolat-xati-namuna/',
        'title': 'KAFOLAT XATI',
        'subtitle': 'To‘lov kafolati va ishga qabul qilish kafolati uchun tahrirlanadigan blankalar va shartli o‘quv misoli',
        'sections': [
            {'heading': 'Rekvizitlar', 'lines': [
                '[Tashkilot nomi va rekvizitlari — blankada]',
                '[kun.oy.yil] № [chiquvchi raqam]',
                '[Qabul qiluvchi tashkilot] [rahbar lavozimi, F.I.Sh.]ga',
            ]},
            {'heading': 'To‘lov kafolati haqida xat', 'lines': [
                'To‘lov kafolati haqida',
                'Hurmatli [Ism va otasining ismi]!',
                '[Tashkilot nomi] [sana]dagi [raqam]-sonli shartnoma bo‘yicha [summa] miqdoridagi to‘lovni [sana]gacha amalga oshirishni kafolatlaydi.',
                'To‘lov shartnomada ko‘rsatilgan hisob raqamiga o‘tkaziladi.',
                'Hurmat bilan, [rahbar lavozimi] [imzo] [F.I.Sh.] · [bosh buxgalter imzosi — qabul qiluvchi so‘rasa]',
            ]},
            {'heading': 'Ishga qabul qilish kafolati haqida xat', 'lines': [
                'Ishga qabul qilish kafolati haqida',
                '[Tashkilot nomi] [F.I.Sh.]ni [sana yoki shart: masalan, o‘qishni tugatgach] [bo‘lim] [lavozim] lavozimiga ishga qabul qilishni kafolatlaydi.',
                'Xat [ta’lim muassasasi yoki boshqa tashkilot nomi]ga taqdim etish uchun berildi.',
                'Hurmat bilan, [rahbar lavozimi] [imzo] [F.I.Sh.]',
            ]},
        ],
        'check': 'Bu tasdiqlangan rasmiy blanka ham, yuridik maslahat ham emas. Kafolat xati keyinchalik huquqiy ahamiyatga ega bo‘lishi mumkin: faqat tashkilotingiz haqiqatan bajara oladigan majburiyatni yozing va matnni vakolatli shaxsga tekshirtiring.',
        'preview': [
            'Shartli «Namuna-1» tashkiloti · 16.11.2026 № 45',
            'Shartli «Namuna-2» tashkiloti direktori B ga',
            'To‘lov kafolati haqida',
            '«Namuna-1» tashkiloti 2026-yil 2-noyabrdagi 12-sonli shartnoma bo‘yicha 8 500 000 (sakkiz million besh yuz ming) so‘m miqdoridagi to‘lovni 2026-yil 30-noyabrgacha amalga oshirishni kafolatlaydi.',
            'To‘lov shartnomada ko‘rsatilgan hisob raqamiga o‘tkaziladi.',
            'Direktor A; haqiqiy imzo va muhr qo‘yilmagan.',
        ],
    },
    {
        'slug': 'ariza-namunalari',
        'article': '/uz/blog/tushuntirish-xati-va-ariza-yozish/',
        'title': 'ARIZA NAMUNALARI',
        'subtitle': 'Ishga qabul qilish, ishdan bo‘shash, ta’til va moddiy yordam so‘rash uchun tahrirlanadigan blankalar',
        'sections': [
            {'heading': 'Barcha arizalar uchun bosh qism', 'lines': [
                '[Tashkilot nomi] [rahbar lavozimi] [F.I.Sh.]ga',
                '[Bo‘lim va lavozim yoki yashash manzili] [F.I.Sh.]dan',
                'ARIZA — alohida qatorda, sahifa o‘rtasida',
            ]},
            {'heading': 'Ishga qabul qilish haqida', 'lines': [
                'Meni [kun.oy.yil] sanasidan [bo‘lim] [lavozim] lavozimiga ishga qabul qilishingizni so‘rayman.',
                'Ilova: [tashkilot so‘ragan hujjatlar ro‘yxati].',
            ]},
            {'heading': 'Ishdan bo‘shash haqida', 'lines': [
                'Meni [kun.oy.yil] sanasidan o‘z xohishimga ko‘ra egallab turgan lavozimimdan ozod etishingizni so‘rayman.',
            ]},
            {'heading': 'Ta’til so‘rash', 'lines': [
                'Menga [yil] yil uchun yillik mehnat ta’tilining [necha] kalendar kunini [kun.oy.yil] sanasidan boshlab berishingizni so‘rayman.',
            ]},
            {'heading': 'Moddiy yordam so‘rash', 'lines': [
                'Menga [sabab — qisqa va aniq] munosabati bilan moddiy yordam ko‘rsatishingizni so‘rayman.',
                'Ilova: [tasdiqlovchi hujjat nomi va varaqlar soni].',
            ]},
            {'heading': 'Sana va imzo', 'lines': ['[kun.oy.yil] · [imzo] · [F.I.Sh.]']},
        ],
        'check': 'Bu tasdiqlangan rasmiy shakl emas. Ko‘p tashkilotlarda ariza shakli tayyor bo‘ladi — avval kadrlar bo‘limidan so‘rang. Ishdan bo‘shashda ogohlantirish muddati, ta’tilda esa muddat va sanalar mehnat shartnomangiz hamda tashkilot tartibiga ko‘ra aniqlanadi. Bir arizada bitta so‘rov yozing.',
        'preview': [
            'Shartli «Namuna-1» tashkiloti direktori A ga',
            'Savdo bo‘limi menejeri B dan',
            'ARIZA',
            'Menga 2026-yil uchun yillik mehnat ta’tilining 14 kalendar kunini 2026-yil 1-dekabr sanasidan boshlab berishingizni so‘rayman.',
            '16.11.2026 · B; haqiqiy imzo qo‘yilmagan.',
        ],
    },
]
SLUGS = ['tushuntirish-xati', 'kurs-ishi-titul-reja', 'referat-titul-reja', 'bildirgi', 'dars-tahlili',
         'tilxat', 'hisobot', 'kafolat-xati', 'ariza-namunalari']


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
        for table in [s['table'] for s in item['sections'] if 'table' in s] + [p['table'] for p in item['preview'] if isinstance(p, dict)]:
            if not all(len(row) == len(table['headers']) for row in table['rows']):
                raise ValueError('Ragged table: ' + item['slug'])
        text = json.dumps(item, ensure_ascii=False)
        if re.search(r"[A-Za-z]['`ʻʼ][A-Za-z]", text):
            raise ValueError('ASCII or modifier apostrophe in Uzbek text: ' + item['slug'])
    return TEMPLATES


def example_title(item):
    return item.get('example', EXAMPLE)


def example_note(item):
    return item.get('example_note', EXAMPLE_NOTE)


def clean_zip(data):
    result = BytesIO()
    with zipfile.ZipFile(BytesIO(data)) as source, zipfile.ZipFile(result, 'w') as target:
        for name in sorted(source.namelist()):
            info = zipfile.ZipInfo(name, (2026, 11, 16, 0, 0, 0))
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
        if isinstance(entry, dict):
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

    def pdf_table(table):
        columns = len(table['headers'])
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
        story.append(Paragraph(escape(block['heading']), styles['heading']))
        story.extend(Paragraph(escape(line), styles['body']) for line in block['lines'])
        if 'table' in block:
            story.extend(pdf_table(block['table']))
    story += [Spacer(1, 8), Paragraph(escape(item['check']), styles['note']), PageBreak(),
              Paragraph(escape(example_title(item)), styles['title']), Paragraph(escape(example_note(item)), styles['note'])]
    for entry in item['preview']:
        if isinstance(entry, dict):
            story.extend(pdf_table(entry['table']))
        else:
            story.append(Paragraph(escape(entry), styles['body']))

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
        texts += table_cells(entry['table']) if isinstance(entry, dict) else [entry]
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
        check('DOCX public author only', '<dc:creator>GPTBot.uz</dc:creator>' in core and '<cp:lastModifiedBy>GPTBot.uz</cp:lastModifiedBy>' in core)
        check('No private paths or macros', not re.search(r'Borinio|[CF]:[\\/]|vbaProject', ''.join(all_xml)))
        check('No external DOCX relationships', not any('TargetMode="External"' in value for value in all_xml))
    pdf = PdfReader(pdf_path)
    page_texts = [page.extract_text() or '' for page in pdf.pages]
    pdf_text = '\n'.join(page_texts)
    check('PDF printable A4 two to four pages without blank pages',
          2 <= len(pdf.pages) <= 4 and all(len(text.strip()) > 100 for text in page_texts)
          and all(abs(float(page.mediabox.width) - A4[0]) < 1 and abs(float(page.mediabox.height) - A4[1]) < 1 for page in pdf.pages))
    check('PDF complete blank and example text', all(compact(line) in compact(pdf_text) for line in expected_text(item)))
    check('PDF Uzbek glyphs extract without replacements', '‘' in pdf_text and '\ufffd' not in pdf_text and '■' not in pdf_text)
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
