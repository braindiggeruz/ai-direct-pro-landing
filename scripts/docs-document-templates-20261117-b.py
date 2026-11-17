"""Build four original document kits (DOCX + PDF) for the 2026-11-17 release, part B.

Kits: a Russian-language reference form «объективка» (маълумотнома), a weekly
practice diary for pedagogical and qualification practice, pedagogical council
minutes and an award certificate «Faxriy yorliq» with a decorative frame drawn
by code. Each kit has an editable blank and a separately labelled conditional
example on its own page. No user input, network, macros, real people, real
organisations, actual signatures or stamps.

Same document libraries, font strategy and checks as
docs-document-templates-20261116.py; that script and the earlier download
folders are not touched, and only the four kits named below are written into
public/downloads/docs-20261117/. Requires python-docx, reportlab, pypdf and
Pillow (available in the desktop bundled Python).

--check validates the committed files and their deterministic regeneration in
the same font environment; it never rewrites downloads. Optional --report saves
the QA result as JSON.
"""
from datetime import datetime, timezone
from io import BytesIO
from math import cos, pi, sin
from pathlib import Path
from xml.sax.saxutils import escape
import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
import zipfile

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor
from PIL import Image, ImageDraw
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/downloads/docs-20261117'
FIXED = datetime(2026, 11, 17, tzinfo=timezone.utc)
INK = '10364A'

UZ = {
    'lang': 'uz-Latn',
    'glyphs': '‘',
    'stamp': 'GPTBot.uz · O‘quv namunasi · 17.11.2026',
    'subject': 'O‘zbekcha blanka va shartli o‘quv misoli',
    'note': 'Tahrirlanadigan qism. Kvadrat qavslarni o‘z ma’lumotingiz bilan almashtiring; keraksiz bandlarni o‘chiring. Qabul qiluvchi bergan shakl bo‘lsa, o‘sha shakldan foydalaning.',
    'example': 'TO‘LDIRILGAN O‘QUV MISOLI',
    'example_note': 'Quyidagi matn tuzilmani ko‘rsatish uchun yozilgan. Undagi odamlar, tashkilotlar va voqealar to‘qima. Uni haqiqiy hujjat sifatida topshirmang.',
}
RU = {
    'lang': 'ru-RU',
    'glyphs': 'ё',
    'stamp': 'GPTBot.uz · Учебный образец · 17.11.2026',
    'subject': 'Бланк на русском языке и условный учебный пример',
    'note': 'Редактируемая часть. Замените текст в квадратных скобках своими данными, лишние строки удалите. Если организация выдала свой бланк или просит заполнять на узбекском языке, используйте её форму.',
    'example': 'ЗАПОЛНЕННЫЙ УЧЕБНЫЙ ПРИМЕР',
    'example_note': 'Текст ниже показывает, как выглядит заполненный документ. Все люди, организации, даты и адреса в нём вымышлены. Не подавайте его как настоящий документ.',
}

# ---------------------------------------------------------------------------
# 1. Объективка (маълумотнома), Russian
# ---------------------------------------------------------------------------
OBEKTIVKA_FIELDS = {
    'headers': ['Строка бланка', 'Ваши данные'],
    'widths': [45, 55],
    'rows': [
        ['Год рождения', '[дд.мм.гггг]'],
        ['Место рождения', '[область, район или город — полностью]'],
        ['Национальность', '[национальность]'],
        ['Партийность', '[название партии или «нет»]'],
        ['Образование', '[высшее / среднее специальное / среднее]'],
        ['Окончил(а)', '[год, полное название учебного заведения, форма обучения]'],
        ['Специальность по образованию', '[как в дипломе]'],
        ['Учёная степень', '[степень или «нет»]'],
        ['Учёное звание', '[звание или «нет»]'],
        ['Какими иностранными языками владеет', '[языки]'],
        ['Воинское (специальное) звание', '[звание или «нет»]'],
        ['Имеет ли государственные награды (какие)', '[год и название награды или «нет»]'],
        ['Является ли депутатом или членом других выборных органов (указать полностью)', '[с какого года и какого органа или «нет»]'],
    ],
}
RELATIVES_HEADERS = ['Степень родства', 'Фамилия, имя, отчество', 'Год и место рождения', 'Место работы и должность', 'Место жительства']
RELATIVES_WIDTHS = [13, 22, 20, 25, 20]
RELATIVES_BLANK = {
    'headers': RELATIVES_HEADERS,
    'widths': RELATIVES_WIDTHS,
    'rows': [
        ['Отец', '[ФИО полностью]', '[год, область, район или город]', '[место работы и должность полностью]', '[область, город или район, улица, дом]'],
        ['Мать', '[ФИО; девичья фамилия в скобках]', '[год, область, район или город]', '[место работы и должность]', '[адрес полностью]'],
        ['Брат, сестра', '[ФИО полностью]', '[год, область, район или город]', '[место работы и должность]', '[адрес полностью]'],
        ['Супруг(а)', '[ФИО; девичья фамилия в скобках]', '[год, область, район или город]', '[место работы и должность]', '[адрес полностью]'],
        ['Сын, дочь', '[ФИО полностью]', '[год, область, район или город]', '[место учёбы или работы]', '[адрес полностью]'],
        ['Тесть (свёкор)', '[ФИО полностью]', '[год, область, район или город]', '[на пенсии — последняя должность в скобках]', '[адрес полностью]'],
        ['Тёща (свекровь)', '[ФИО; девичья фамилия в скобках]', '[год, область, район или город]', '[если умерла — год смерти и последняя должность в скобках]', '[адрес полностью]'],
    ],
}
UZBEK_NAMES = {
    'headers': ['По-русски', 'Латиница', 'Кириллица'],
    'widths': [30, 35, 35],
    'rows': [
        ['Справка (объективка)', 'Ma’lumotnoma', 'Маълумотнома'],
        ['Год рождения', 'Tug‘ilgan yili', 'Туғилган йили'],
        ['Место рождения', 'Tug‘ilgan joyi', 'Туғилган жойи'],
        ['Национальность', 'Millati', 'Миллати'],
        ['Партийность', 'Partiyaviyligi', 'Партиявийлиги'],
        ['Образование', 'Ma’lumoti', 'Маълумоти'],
        ['Окончил(а)', 'Tamomlagan', 'Тамомлаган'],
        ['Специальность по образованию', 'Ma’lumoti bo‘yicha mutaxassisligi', 'Маълумоти бўйича мутахассислиги'],
        ['Учёная степень', 'Ilmiy darajasi', 'Илмий даражаси'],
        ['Учёное звание', 'Ilmiy unvoni', 'Илмий унвони'],
        ['Какими иностранными языками владеет', 'Qaysi chet tillarini biladi', 'Қайси чет тилларини билади'],
        ['Воинское (специальное) звание', 'Harbiy (maxsus) unvoni', 'Ҳарбий (махсус) унвони'],
        ['Имеет ли государственные награды (какие)', 'Davlat mukofotlari bilan taqdirlanganmi (qanaqa)', 'Давлат мукофотлари билан тақдирланганми (қанақа)'],
        ['Является ли депутатом или членом других выборных органов (указать полностью)', 'Xalq deputatlari, respublika, viloyat, shahar va tuman Kengashi deputatimi yoki boshqa saylanadigan organlarning a’zosimi (to‘liq ko‘rsatilishi lozim)', 'Халқ депутатлари, республика, вилоят, шаҳар ва туман Кенгаши депутатими ёки бошқа сайланадиган органларнинг аъзосими (тўлиқ кўрсатилиши лозим)'],
        ['Трудовая деятельность', 'Mehnat faoliyati', 'Меҳнат фаолияти'],
        ['Сведения о близких родственниках', 'Yaqin qarindoshlari to‘g‘risida ma’lumot', 'Яқин қариндошлари тўғрисида маълумот'],
        ['Степень родства', 'Qarindoshligi', 'Қариндошлиги'],
        ['Фамилия, имя, отчество', 'Familiyasi, ismi va otasining ismi', 'Фамилияси, исми ва отасининг исми'],
        ['Год и место рождения', 'Tug‘ilgan yili va joyi', 'Туғилган йили ва жойи'],
        ['Место работы и должность', 'Ish joyi va lavozimi', 'Иш жойи ва лавозими'],
        ['Место жительства', 'Turar joyi', 'Турар жойи'],
    ],
}
OBEKTIVKA = {
    'slug': 'obektivka-ru',
    'article': '/ru/blog/obektivka-obrazec/',
    'locale': RU,
    'pages': (5, 5),
    'title': 'СПРАВКА-ОБЪЕКТИВКА (МАЪЛУМОТНОМА)',
    'subtitle': 'Редактируемый бланк на русском языке, таблица близких родственников, узбекские названия строк и условный заполненный пример',
    'sections': [
        {'heading': 'Шапка', 'lines': [
            '[Место для фотографии 3×4 см — если её просит организация]',
            '[Фамилия Имя Отчество — полностью, как в паспорте]',
            'с [дд.мм.гггг]: [должность и полное название организации]',
        ]},
        {'heading': 'Сведения о себе', 'lines': [
            'Если сведений нет, пишите «нет»: строку не оставляют пустой.',
        ], 'table': OBEKTIVKA_FIELDS},
        {'heading': 'Трудовая деятельность', 'lines': [
            '[гггг–гггг гг.] — [студент: полное название учебного заведения]',
            '[гггг–гггг гг.] — [должность], [полное название организации]',
            '[гггг г. — н. в.] — [нынешняя должность], [полное название организации]',
        ]},
        {'heading': 'Сведения о близких родственниках (вторая страница)', 'break_before': True, 'lines': [
            'СВЕДЕНИЯ о близких родственниках [Фамилия Имя Отчество — в родительном падеже]',
        ], 'table': RELATIVES_BLANK, 'after': [
            'Фамилию, имя и отчество пишите полностью; у замужних женщин девичью фамилию указывают в скобках.',
            'Год и место рождения — с областью и районом или городом, без сокращений.',
            'Про пенсионера пишут «на пенсии» и в скобках последнюю должность; если родственник умер — год смерти и последнюю должность в скобках.',
            'Место жительства — с полными названиями области, города, района и улицы.',
        ]},
        {'heading': 'Названия строк на узбекском языке', 'break_before': True, 'lines': [
            'Если бланк нужно заполнить по-узбекски, строки называются так.',
        ], 'table': UZBEK_NAMES},
    ],
    'check': 'Это учебный образец, а не утверждённый официальный бланк и не юридическая консультация. Состав строк и оформление уточняйте в организации, которая просит объективку. Сведения о родственниках — персональные данные: заполняйте их только в файле на своём устройстве и передавайте только туда, где документ запросили.',
    'examples': [{
        'entries': [
            'Учебный пример. Намунаев Алишер Каримович, его родственники, организации «Образец-1», «Образец-2» и «Образец-3», Институт «Образец», даты и адреса вымышлены. Фамилия образована от слова «намуна» — «образец».',
            {'center': 'СПРАВКА-ОБЪЕКТИВКА'},
            {'center': 'Намунаев Алишер Каримович'},
            'с 3 марта 2023 года: главный специалист отдела кадров общества с ограниченной ответственностью «Образец-1»',
            {'table': {
                'headers': ['Строка', 'Запись'],
                'widths': [45, 55],
                'rows': [
                    ['Год рождения', '14.05.1990'],
                    ['Место рождения', 'Ферганская область, город Маргилан'],
                    ['Национальность', 'узбек'],
                    ['Партийность', 'нет'],
                    ['Образование', 'высшее'],
                    ['Окончил', '2012 г., Институт «Образец» (дневное отделение)'],
                    ['Специальность по образованию', 'экономист'],
                    ['Учёная степень', 'нет'],
                    ['Учёное звание', 'нет'],
                    ['Какими иностранными языками владеет', 'русский и английский языки'],
                    ['Воинское (специальное) звание', 'нет'],
                    ['Имеет ли государственные награды (какие)', 'нет'],
                    ['Является ли депутатом или членом других выборных органов (указать полностью)', 'нет'],
                ],
            }},
            {'center': 'ТРУДОВАЯ ДЕЯТЕЛЬНОСТЬ'},
            '2008–2012 гг. — студент Института «Образец»',
            '2012–2016 гг. — специалист отдела кадров общества с ограниченной ответственностью «Образец-2»',
            '2016–2023 гг. — ведущий специалист отдела кадров общества с ограниченной ответственностью «Образец-2»',
            '2023 г. — н. в. — главный специалист отдела кадров общества с ограниченной ответственностью «Образец-1»',
            {'break': True},
            {'center': 'СВЕДЕНИЯ о близких родственниках Намунаева Алишера Каримовича'},
            {'table': {
                'headers': RELATIVES_HEADERS,
                'widths': RELATIVES_WIDTHS,
                'rows': [
                    ['Отец', 'Намунаев Карим Собирович', '1962 год, Ферганская область, город Маргилан', 'На пенсии (учитель математики школы «Образец»)', 'Ферганская область, город Маргилан, улица Условная, дом 1'],
                    ['Мать', 'Намунаева (Андозова) Мавлуда Тахировна', '1965 год, Ферганская область, город Маргилан', 'На пенсии (медицинская сестра поликлиники «Образец»)', 'Ферганская область, город Маргилан, улица Условная, дом 1'],
                    ['Брат', 'Намунаев Шерзод Каримович', '1993 год, Ферганская область, город Маргилан', 'Инженер общества с ограниченной ответственностью «Образец-3»', 'Ферганская область, город Маргилан, улица Условная, дом 1'],
                    ['Супруга', 'Намунаева (Мисолова) Нигора Рустамовна', '1992 год, город Ташкент', 'Преподаватель учебного центра «Образец»', 'Город Ташкент, Юнусабадский район, улица Условная, дом 2, квартира 3'],
                    ['Дочь', 'Намунаева Зилола Алишеровна', '2018 год, город Ташкент', 'Ученица школы «Образец»', 'Город Ташкент, Юнусабадский район, улица Условная, дом 2, квартира 3'],
                    ['Тесть', 'Мисолов Рустам Ахмедович', '1960 год, город Ташкент', 'Умер в 2019 году (инженер завода «Образец»)', '—'],
                    ['Тёща', 'Мисолова (Нусхаева) Дилбар Юсуповна', '1963 год, город Ташкент', 'На пенсии (бухгалтер завода «Образец»)', 'Город Ташкент, Мирабадский район, улица Условная, дом 4'],
                ],
            }},
        ],
    }],
}

# ---------------------------------------------------------------------------
# 2. Practice diary: pedagogical and qualification practice
# ---------------------------------------------------------------------------
WEEK_HEADERS = ['Sana', 'Vazifa va bajargan ishim', 'Natija va xulosa']
WEEK_WIDTHS = [16, 46, 38]
BLANK_DAY = ['[kun.oy.yil]', 'Vazifa: [dasturdagi vazifa]. [O‘zingiz bajargan ish — kuzatganingizdan alohida].', '[Qolgan hujjat, son yoki xulosa; savolingiz].', '[rahbar to‘ldiradi]']
DIARY = {
    'slug': 'amaliyot-kundaligi-pedagogik',
    'article': '/uz/blog/amaliyot-kundaligi-namuna/',
    'locale': UZ,
    'pages': (3, 4),
    'title': 'PEDAGOGIK VA MALAKAVIY AMALIYOT KUNDALIGI',
    'subtitle': 'Haftalik jadval ko‘rinishidagi tahrirlanadigan blanka va ikki shartli o‘quv misoli: maktabdagi pedagogik amaliyot va korxonadagi malakaviy amaliyot',
    'sections': [
        {'heading': 'Amaliyot ma’lumotlari', 'lines': [
            'Talaba: [F.I.Sh.] · Guruh: [guruh] · Ta’lim yo‘nalishi: [yo‘nalish nomi]',
            'Amaliyot turi: [pedagogik / malakaviy / ishlab chiqarish] · Davri: [kun.oy.yil] — [kun.oy.yil]',
            'Amaliyot joyi: [maktab yoki tashkilot nomi; sinf yoki bo‘lim]',
            'Oliy ta’lim muassasasidan rahbar (metodist): [lavozim, F.I.Sh.]',
            'Amaliyot joyidan rahbar: [lavozim, F.I.Sh.]',
        ]},
        {'heading': 'Haftalik jadval', 'lines': [
            'Har bir amaliyot kuni uchun bitta qator. Hafta tugagach, jadvalni nusxalab, keyingi haftani to‘ldiring.',
        ], 'table': {
            'headers': WEEK_HEADERS + ['Rahbar belgisi'],
            'widths': [14, 40, 30, 16],
            'rows': [list(BLANK_DAY) for _ in range(5)],
        }},
        {'heading': 'Hafta yakuni', 'lines': [
            'Bajarilgan asosiy ishlar: [qisqa ro‘yxat]',
            'Bajarilmagan vazifa va sababi: [bo‘lsa]',
            'Keyingi hafta rejasi: [2–3 vazifa]',
            'Talaba: [imzo, sana] · Amaliyot rahbari: [imzo va sanani rahbar o‘zi qo‘yadi]',
        ]},
        {'heading': 'Pedagogik amaliyot uchun qo‘shimcha qaydlar', 'lines': [
            'Kuzatilgan darslar: [sana, sinf, fan, mavzu, o‘qituvchi]',
            'O‘zim o‘tgan darslar: [sana, sinf, fan, mavzu, olingan tavsiya]',
            'Tarbiyaviy ishlar: [sana, tadbir nomi, mening vazifam]',
        ]},
    ],
    'check': 'Bu tasdiqlangan rasmiy shakl emas. Kundalik shaklini odatda oliy ta’lim muassasasi beradi: kafedra bergan kundalik bo‘lsa, o‘shani to‘ldiring. Faqat haqiqatda bajarilgan ishni yozing; rahbar belgisi va imzosini rahbarning o‘zi qo‘yadi.',
    'examples': [
        {'title': 'TO‘LDIRILGAN O‘QUV MISOLI: PEDAGOGIK AMALIYOT', 'entries': [
            'To‘qima o‘quv misoli: talaba A shartli 00-sonli maktabning 3-«A» sinfida pedagogik amaliyot o‘taydi. Maktab, sinf va odamlar shartli; bu haqiqiy kundalik o‘rniga topshirilmaydi.',
            'Talaba A · Yo‘nalish: boshlang‘ich ta’lim · Amaliyot joyi: shartli 00-sonli maktab, 3-«A» sinf · Metodist B · Sinf rahbari D · 19–23.10.2026',
            {'table': {'headers': WEEK_HEADERS, 'widths': WEEK_WIDTHS, 'rows': [
                ['19.10.2026, dushanba',
                 'Vazifa: maktab va sinf bilan tanishish. Direktor o‘rinbosari bilan suhbatda maktabning ichki tartibi va xavfsizlik qoidalari bilan tanishdim. 3-«A» sinfning dars jadvalini ko‘chirib oldim. Sinf rahbarining ikki darsida o‘quvchilarni kuzatdim.',
                 'Dars jadvali va sinf haqida bir sahifalik qayd: sinfda 28 o‘quvchi bor, darslar soat 08:30 da boshlanadi. Savolim: qo‘shimcha yordam kerak bo‘lgan o‘quvchilar bilan qanday ishlanadi?'],
                ['20.10.2026, seshanba',
                 'Vazifa: darslarni kuzatish. Ona tili va o‘qish savodxonligi hamda matematika darslarini kuzatdim. Har bir bosqichga ketgan vaqtni va o‘qituvchi bergan savollarni yozib bordim. Darsdan keyin kuzatuvimni sinf rahbari bilan muhokama qildim.',
                 'Ikki darsning kuzatuv varaqasi. O‘rganganim: matematika darsidagi 5 daqiqalik og‘zaki hisob barcha o‘quvchini darsga jalb qildi.'],
                ['21.10.2026, chorshanba',
                 'Vazifa: sinov darsiga tayyorlanish. «Ko‘paytirish jadvalini takrorlash» mavzusida dars ishlanmasini yozdim. 12 ta misol kartochkasi va bitta ko‘rgazma tayyorladim. Ishlanmani sinf rahbariga ko‘rsatdim.',
                 'Ikki sahifalik dars ishlanmasi. Sinf rahbari tavsiyasi bilan yakka mustaqil ishga 7 daqiqa ajratdim va ikki misolni soddalashtirdim.'],
                ['22.10.2026, payshanba',
                 'Vazifa: sinov darsini o‘tish. Sinf rahbari nazoratida matematika darsini o‘tdim: og‘zaki hisob, juftlikda ishlash va yakka mustaqil ish. Dars oxirida o‘quvchilarning ishini yig‘ib oldim.',
                 'Darsda 26 o‘quvchi qatnashdi; mustaqil ishni 19 nafari xatosiz bajardi. Xulosam: juftlikda ishlashga rejadagi 8 daqiqa o‘rniga 12 daqiqa ketdi. Keyingi darsda topshiriqni oldindan doskaga yozib qo‘yaman.'],
                ['23.10.2026, juma',
                 'Vazifa: tarbiyaviy soat va hafta yakuni. Sinf rahbariga «Kitob — bilim manbai» mavzusidagi tarbiyaviy soatni o‘tkazishda yordam berdim: uch o‘quvchi bilan she’r o‘qishni tayyorladim. Haftalik yozuvlarimni metodistga ko‘rsatdim.',
                 'Tarbiyaviy soat rejasining nusxasi. Metodist tavsiyasi: sinov darsining o‘z-o‘zini tahlilini alohida varaqqa yozish. Keyingi hafta: ikkita dars o‘tish va bitta darsni to‘liq tahlil qilish.'],
            ]}},
            'Hafta yakuni: 4 ta dars kuzatildi, 1 ta sinov darsi o‘tildi, 1 ta tarbiyaviy soatda yordam berildi. Hisobotga dars ishlanmasi, kuzatuv varaqalari va mustaqil ish natijalari kiradi.',
            'Rahbar belgisi: o‘quv misolida to‘ldirilmagan. Haqiqiy kundalikda uni metodist yoki sinf rahbari o‘zi yozadi.',
        ]},
        {'title': 'TO‘LDIRILGAN O‘QUV MISOLI: MALAKAVIY AMALIYOT', 'entries': [
            'To‘qima o‘quv misoli: talaba A shartli «Namuna-1» korxonasining hisob bo‘limida malakaviy amaliyot o‘taydi. Korxona, odamlar va raqamlar shartli; bu haqiqiy kundalik o‘rniga topshirilmaydi.',
            'Talaba A · Yo‘nalish: buxgalteriya hisobi va audit · Amaliyot joyi: shartli «Namuna-1» korxonasi, hisob bo‘limi · Korxonadan rahbar: bosh hisobchi B · Oliy ta’lim muassasasidan rahbar: D · 12–16.10.2026',
            {'table': {'headers': WEEK_HEADERS, 'widths': WEEK_WIDTHS, 'rows': [
                ['12.10.2026, dushanba',
                 'Vazifa: korxona va bo‘lim bilan tanishish. Mehnat muhofazasi va texnika xavfsizligi bo‘yicha yo‘riqnomadan o‘tdim. Hisob bo‘limining tuzilmasi va xodimlarning vazifalari bilan tanishdim. Amaliyot rahbari bilan dastur bo‘yicha ish rejasini tuzdim.',
                 'Yo‘riqnoma jurnalidagi qayd va to‘rt haftalik ish rejasi. O‘rganganim: bo‘limda har bir hisob yo‘nalishiga alohida xodim javob beradi.'],
                ['13.10.2026, seshanba',
                 'Vazifa: birlamchi hujjatlar bilan tanishish. O‘quv uchun berilgan 10 ta hujjat nusxasini — hisobvaraq-faktura, yuk xati va kassa orderlarini — turlarga ajratdim. Har birida majburiy rekvizitlar borligini tekshirdim.',
                 'Tekshiruv jadvali: 10 ta hujjatdan 2 tasida sana yoki imzo yetishmaydi. Savolim: xato topilgan hujjat qanday tartibda qaytariladi?'],
                ['14.10.2026, chorshanba',
                 'Vazifa: kassa hujjatlarini rasmiylashtirish. O‘quv ma’lumotlari asosida 3 ta kassa kirim orderi va 2 ta kassa chiqim orderi namunasini to‘ldirdim. Summani raqam va so‘z bilan yozishni mashq qildim.',
                 '5 ta namunaviy order. Rahbar tekshirganda bitta orderda summa so‘z bilan noto‘g‘ri yozilgani aniqlandi; uni qaytadan to‘ldirdim.'],
                ['15.10.2026, payshanba',
                 'Vazifa: ombor hisobi bilan tanishish. Ombor mudiri bilan birga 15 nomdagi tovar qoldig‘ini hisob ma’lumotlari bilan solishtirdim. Farqlarni alohida ro‘yxatga yozdim.',
                 'Solishtirish jadvali: 14 nomda qoldiq mos keldi, bittasida 2 dona farq chiqdi. Farq sababini bo‘lim aniqlamoqda; xulosani o‘zimcha yozmadim.'],
                ['16.10.2026, juma',
                 'Vazifa: hafta yakunini rasmiylashtirish. Hafta davomida tayyorlagan jadval va namunalarni papkaga tartib bilan joyladim. Hisobotning «Korxona tavsifi» bo‘limi qoralamasini yozdim. Kundalikni amaliyot rahbariga ko‘rsatdim.',
                 'Bir yarim sahifalik qoralama. Rahbar topshirig‘i: keyingi hafta ish haqi hisobi bilan tanishish. Haqiqiy mijoz va xodimlarning ma’lumotlarini hisobotga kiritmayman.'],
            ]}},
            'Hafta yakuni: 10 ta hujjat tekshirildi, 5 ta namunaviy kassa orderi to‘ldirildi, 15 nomdagi tovar qoldig‘i solishtirildi. Hisobotga tekshiruv jadvali, solishtirish jadvali va korxona tavsifi qoralamasi kiradi.',
            'Rahbar belgisi: o‘quv misolida to‘ldirilmagan. Haqiqiy kundalikni amaliyot joyidagi mas’ul rahbar o‘z imzosi bilan tasdiqlaydi.',
        ]},
    ],
}

# ---------------------------------------------------------------------------
# 3. Pedagogical council minutes
# ---------------------------------------------------------------------------
MINUTES = {
    'slug': 'pedagogik-kengash-bayonnomasi',
    'article': '/uz/blog/bayonnoma-namuna/',
    'locale': UZ,
    'pages': (2, 3),
    'title': 'PEDAGOGIK KENGASH BAYONNOMASI',
    'subtitle': 'Maktab pedagogik kengashi yig‘ilishi uchun tahrirlanadigan blanka va «1-sonli bayonnoma»ning shartli o‘quv misoli',
    'sections': [
        {'heading': 'Bosh qism', 'lines': [
            '[Maktab nomi] pedagogik kengashi yig‘ilishining [raqam]-SONLI BAYONNOMASI',
            '[kun.oy.yil] · [yig‘ilish o‘tgan joy]',
            'Rais: [maktab direktori, F.I.Sh.] · Kotib: [lavozim, F.I.Sh.]',
            'Kengash a’zolari: [jami] nafar · Qatnashdi: [soni] nafar (ro‘yxat ilova qilinadi)',
            'Taklif etilganlar: [lavozim, F.I.Sh. — bo‘lsa]',
        ]},
        {'heading': 'Kun tartibi', 'lines': [
            '1. [Birinchi masala]',
            '2. [Ikkinchi masala]',
            '3. [Uchinchi masala — bo‘lsa]',
        ]},
        {'heading': 'Har bir masala bo‘yicha yozuv', 'lines': [
            '[1]-masala. ESHITILDI: [ma’ruzachining lavozimi, F.I.Sh.] — [axborotning qisqa mazmuni].',
            'SO‘ZGA CHIQDILAR: [lavozim, F.I.Sh.] — [taklif yoki mulohaza].',
            'QAROR QILINDI: [1.1]. [Aniq ish yoki qaror]. Mas’ul: [lavozim]. Muddat: [kun.oy.yil].',
            'Ovoz berish: yoqlab — [soni], qarshi — [soni], betaraf — [soni].',
            'Keyingi masalalar uchun shu to‘rt qatorni nusxalang.',
        ]},
        {'heading': 'Ilova va imzolar', 'lines': [
            'Ilova: [qatnashganlar ro‘yxati va boshqa materiallar; varaqlar soni]',
            'Pedagogik kengash raisi: [imzo] [F.I.Sh.]',
            'Pedagogik kengash kotibi: [imzo] [F.I.Sh.]',
        ]},
    ],
    'check': 'Bu tasdiqlangan rasmiy blanka emas. Maktabingizda pedagogik kengash nizomi yoki tayyor bayonnoma shakli bo‘lsa, o‘shandan foydalaning. Faqat yig‘ilishda haqiqatda aytilgan fikr va qabul qilingan qarorlarni yozing; qatnashmagan a’zoni, bo‘lmagan ovoz berishni yoki imzoni qo‘shmang.',
    'examples': [{
        'entries': [
            'To‘qima o‘quv misoli: maktab, raqamlar va qarorlar shartli; odamlar faqat lavozimi bilan ko‘rsatilgan. Haqiqiy yig‘ilish o‘tkazilgani da’vo qilinmaydi.',
            {'center': 'Shartli 00-sonli umumiy o‘rta ta’lim maktabi pedagogik kengashi yig‘ilishining'},
            {'center': '1-SONLI BAYONNOMASI'},
            '27.08.2026 · maktab majlislar zali',
            'Rais: maktab direktori. Kotib: ona tili va adabiyot o‘qituvchisi. Kengash a’zolari: 36 nafar. Qatnashdi: 30 nafar (ro‘yxat ilova qilinadi) — yig‘ilish vakolatli. Taklif etilgan: ota-onalar qo‘mitasi raisi.',
            'Kun tartibi: 1. 2025–2026 o‘quv yili yakunlari va 2026–2027 o‘quv yiliga tayyorgarlik. 2. Pedagogik kengashning 2026–2027 o‘quv yili ish rejasi. 3. To‘garaklar (darsdan tashqari mashg‘ulotlar) dasturlarini muhokama qilish va tasdiqlash.',
            '1-masala. ESHITILDI: o‘quv ishlari bo‘yicha direktor o‘rinbosari o‘tgan o‘quv yili yakunlari va yangi o‘quv yiliga tayyorgarlik haqida axborot berdi. 24 ta sinf xonasidan 22 tasi tayyor, 2 tasida ta’mirlash davom etmoqda.',
            'SO‘ZGA CHIQDILAR: matematika o‘qituvchisi 5–6-sinflar uchun matematikadan qo‘shimcha mashg‘ulot tashkil etishni taklif qildi. Ota-onalar qo‘mitasi raisi ta’mirlash qachon tugashini so‘radi.',
            'QAROR QILINDI: 1.1. Axborot ma’lumot uchun qabul qilinsin. 1.2. Ikki sinf xonasining tayyorligi 31-avgust kuni qayta tekshirilsin. Mas’ul: maktab direktori. 1.3. 5–6-sinflar uchun matematikadan qo‘shimcha mashg‘ulotlar jadvali 5-sentabrgacha tuzilsin. Mas’ul: o‘quv ishlari bo‘yicha direktor o‘rinbosari. Ovoz berish: yoqlab — 30, qarshi — yo‘q, betaraf — yo‘q.',
            '2-masala. ESHITILDI: maktab direktori pedagogik kengashning yillik ish rejasi loyihasini tanishtirdi: o‘quv yili davomida 5 ta navbatdagi yig‘ilish rejalashtirilgan. SO‘ZGA CHIQDILAR: ma’naviy-ma’rifiy ishlar bo‘yicha direktor o‘rinbosari o‘quvchilar davomati masalasini noyabr yig‘ilishining kun tartibiga qo‘shishni taklif qildi.',
            'QAROR QILINDI: 2.1. Ish rejasi kiritilgan taklif bilan ma’qullansin va tasdiqlash uchun maktab direktoriga taqdim etilsin. Ovoz berish: yoqlab — 30, qarshi — yo‘q, betaraf — yo‘q.',
            '3-masala. ESHITILDI: o‘quv ishlari bo‘yicha direktor o‘rinbosari 6 ta to‘garak dasturini tanishtirdi. SO‘ZGA CHIQDILAR: ingliz tili o‘qituvchisi to‘garak mashg‘ulotlari dars jadvaliga to‘g‘ri kelib qolmasligi kerakligini aytdi.',
            'QAROR QILINDI: 3.1. 6 ta to‘garak dasturi tasdiqlansin. 3.2. To‘garaklar jadvali 5-sentabrgacha e’lon qilinsin. Mas’ul: o‘quv ishlari bo‘yicha direktor o‘rinbosari. Ovoz berish: yoqlab — 29, qarshi — yo‘q, betaraf — 1.',
            'Ilova: qatnashganlar ro‘yxati, 1 varaq; ish rejasi loyihasi, 3 varaq. Pedagogik kengash raisi: imzo joyi. Pedagogik kengash kotibi: imzo joyi. Namunada imzo va muhr qo‘yilmagan.',
        ],
    }],
}

KITS = [OBEKTIVKA, DIARY, MINUTES]

# ---------------------------------------------------------------------------
# 4. Award certificate «Faxriy yorliq»
# ---------------------------------------------------------------------------
CERT = {
    'slug': 'faxriy-yorliq',
    'article': '/uz/blog/faxriy-yorliq-matni/',
    'locale': UZ,
    'title': 'FAXRIY YORLIQ',
    'subject': 'Faxriy yorliq: tahrirlanadigan blanka va shartli o‘quv misoli',
    'verb': 'taqdirlanadi.',
    'stamp_place': 'M.O‘.',
    # DOCX: bracketed fields to type over.
    'blank': {
        'org': '[TASHKILOT YOKI MAKTAB NOMI]',
        'role': '[lavozimi, sinfi yoki guruhi]',
        'name': '[FAMILIYA ISM]',
        'reason': '[nima uchun: masalan, 2025–2026 o‘quv yilida a’lo o‘qigani va maktab hayotida faol qatnashgani uchun]',
        'signer_role': '[Rahbar lavozimi]',
        'signer_name': '[F.I.Sh.]',
        'place_date': '[Shahar yoki tuman] · [kun.oy.yil]',
    },
    # PDF: ruled lines to fill in by hand, each with a caption.
    'captions': {
        'org': '(tashkilot yoki maktab nomi)',
        'role': '(lavozimi, sinfi yoki guruhi)',
        'name': '(familiyasi va ismi)',
        'reason': '(nima uchun taqdirlanayotgani)',
        'signer_role': '(rahbar lavozimi)',
        'signature': '(imzo)',
        'signer_name': '(F.I.Sh.)',
        'date': '«____» ________________ 20____-yil',
    },
    'example_label': 'TO‘LDIRILGAN SHARTLI MISOL · maktab, ism va sana to‘qima · chop etishdan oldin bu sahifani olib tashlang',
    'example': {
        'org': 'SHARTLI 00-SONLI UMUMIY O‘RTA TA’LIM MAKTABI',
        'role': '9-«A» sinf o‘quvchisi',
        'name': 'FALONCHIYEV FALONCHI',
        'reason': '2025–2026 o‘quv yilida a’lo baholarga o‘qigani va maktab hayotida faol qatnashgani uchun',
        'signer_role': 'Maktab direktori',
        'signer_name': 'P. Pistonchiyev',
        'unsigned': '(namunada imzo va muhr qo‘yilmagan)',
        'place_date': 'Toshkent shahri · 2026-yil 25-may',
    },
}
SLUGS = ['obektivka-ru', 'amaliyot-kundaligi-pedagogik', 'pedagogik-kengash-bayonnomasi', 'faxriy-yorliq']

PAGE_W, PAGE_H = A4
NAVY, GOLD = '#12395B', '#B88A2A'


def table_cells(table):
    return list(table['headers']) + [cell for row in table['rows'] for cell in row]


def all_tables(item):
    tables = [s['table'] for s in item['sections'] if 'table' in s]
    for example in item['examples']:
        tables += [entry['table'] for entry in example['entries'] if isinstance(entry, dict) and 'table' in entry]
    return tables


def entry_texts(entry):
    """Text of one example entry: a paragraph, a centred line, a table or a page break."""
    if isinstance(entry, str):
        return [entry]
    if 'table' in entry:
        return table_cells(entry['table'])
    return [entry['center']] if 'center' in entry else []


def page_breaks(item):
    """Every example starts a page; a section or an example part may ask for one more."""
    return (len(item['examples']) + sum(1 for section in item['sections'] if section.get('break_before'))
            + sum(1 for example in item['examples'] for entry in example['entries'] if isinstance(entry, dict) and entry.get('break')))


def load_items():
    if [item['slug'] for item in KITS] + [CERT['slug']] != SLUGS:
        raise ValueError('The dataset must contain the approved document slugs exactly once, in order.')
    for item in KITS:
        if not re.fullmatch(r'[a-z0-9-]+', item['slug']):
            raise ValueError('Unexpected file name: ' + item['slug'])
        if not item['sections'] or not item['examples'] or not all(example['entries'] for example in item['examples']):
            raise ValueError('Both editable sections and a complete example are required.')
        if not all(section['heading'] and section['lines'] for section in item['sections']):
            raise ValueError('Empty editable section: ' + item['slug'])
        for table in all_tables(item):
            if not all(len(row) == len(table['headers']) for row in table['rows']):
                raise ValueError('Ragged table: ' + item['slug'])
            if 'widths' in table and len(table['widths']) != len(table['headers']):
                raise ValueError('Column widths do not match the headers: ' + item['slug'])
    for item in KITS + [CERT]:
        text = json.dumps({key: value for key, value in item.items() if key != 'locale'}, ensure_ascii=False)
        if re.search(r"[A-Za-zЀ-ӿ]['`ʻʼ][A-Za-zЀ-ӿ]", text):
            raise ValueError('ASCII or modifier apostrophe between letters: ' + item['slug'])
    return KITS


def example_title(item, example):
    return example.get('title', item['locale']['example'])


def example_note(item, example):
    return example.get('note', item['locale']['example_note'])


def clean_zip(data):
    result = BytesIO()
    with zipfile.ZipFile(BytesIO(data)) as source, zipfile.ZipFile(result, 'w') as target:
        for name in sorted(source.namelist()):
            info = zipfile.ZipInfo(name, (2026, 11, 17, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 0
            target.writestr(info, source.read(name))
    return result.getvalue()


def new_document(title, locale, subject=None):
    doc = Document()
    props = doc.core_properties
    props.author = props.last_modified_by = 'GPTBot.uz'
    props.title, props.subject = title, subject or locale['subject']
    props.comments = 'Original static educational template. Conditional examples. No personal information.'
    props.created = props.modified = FIXED
    props.revision, props.language = 1, locale['lang']
    section = doc.sections[0]
    section.page_width, section.page_height = Mm(210), Mm(297)
    normal = doc.styles['Normal']
    normal.font.name, normal.font.size = 'Arial', Pt(10)
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.1
    lang = OxmlElement('w:lang')
    lang.set(qn('w:val'), locale['lang'])
    normal.element.get_or_add_rPr().append(lang)
    return doc, section


def docx_table(doc, table):
    grid = doc.add_table(rows=1 + len(table['rows']), cols=len(table['headers']))
    grid.style = 'Table Grid'
    if 'widths' in table:
        # Fixed column shares of the 170 mm text width; viewers without layout support still wrap the text.
        grid.autofit = False
        shares = [int(Mm(170) * weight / sum(table['widths'])) for weight in table['widths']]
        for row in grid.rows:
            for cell, width in zip(row.cells, shares):
                cell.width = width
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
    locale = item['locale']
    doc, section = new_document(item['title'], locale)
    section.top_margin = section.bottom_margin = Mm(17)
    section.left_margin = section.right_margin = Mm(20)
    for name, size in [('Title', 21), ('Heading 1', 12)]:
        style = doc.styles[name]
        style.font.name, style.font.size = 'Arial', Pt(size)
        style.font.color.rgb = RGBColor.from_string(INK)
        style.paragraph_format.keep_with_next = True
    doc.add_paragraph(item['title'], 'Title')
    doc.add_paragraph(item['subtitle'])
    doc.add_paragraph(locale['note'])
    for block in item['sections']:
        if block.get('break_before'):
            doc.add_page_break()
        doc.add_paragraph(block['heading'], 'Heading 1')
        for line in block['lines']:
            doc.add_paragraph(line)
        if 'table' in block:
            docx_table(doc, block['table'])
        for line in block.get('after', []):
            doc.add_paragraph(line)
    doc.add_paragraph(item['check'])
    for example in item['examples']:
        doc.add_page_break()
        doc.add_paragraph(example_title(item, example), 'Title')
        doc.add_paragraph(example_note(item, example))
        for entry in example['entries']:
            if isinstance(entry, str):
                doc.add_paragraph(entry)
            elif 'table' in entry:
                docx_table(doc, entry['table'])
            elif 'center' in entry:
                paragraph = doc.add_paragraph()
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = paragraph.add_run(entry['center'])
                run.bold = True
                run.font.size = Pt(11)
            else:
                doc.add_page_break()
    footer = section.footer.paragraphs[0]
    footer.add_run(locale['stamp']).font.size = Pt(8)
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
    locale = item['locale']
    ink = colors.HexColor('#' + INK)
    styles = {
        'title': ParagraphStyle('title', fontName='DocsTemplateBold', fontSize=20, leading=25, textColor=ink, spaceAfter=9),
        'title2': ParagraphStyle('title2', fontName='DocsTemplateBold', fontSize=16, leading=21, textColor=ink, spaceAfter=8),
        'body': ParagraphStyle('body', fontName='DocsTemplate', fontSize=10, leading=14, spaceAfter=6),
        'heading': ParagraphStyle('heading', fontName='DocsTemplateBold', fontSize=11, leading=15, spaceBefore=9, spaceAfter=5, textColor=ink, keepWithNext=True),
        'note': ParagraphStyle('note', fontName='DocsTemplate', fontSize=8.5, leading=12, textColor=colors.HexColor('#435864'), spaceAfter=8),
        'center': ParagraphStyle('center', fontName='DocsTemplateBold', fontSize=11, leading=15, spaceAfter=5, alignment=TA_CENTER),
        'cell': ParagraphStyle('cell', fontName='DocsTemplate', fontSize=8.5, leading=11),
        'cellhead': ParagraphStyle('cellhead', fontName='DocsTemplateBold', fontSize=8.5, leading=11),
    }
    width = A4[0] - 112

    def pdf_table(table):
        columns = len(table['headers'])
        if 'widths' in table:
            widths = [width * weight / sum(table['widths']) for weight in table['widths']]
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
                            author='GPTBot.uz', subject=locale['subject'],
                            creator='GPTBot.uz', invariant=1)
    story = [Paragraph(escape(item['title']), styles['title']),
             Paragraph(escape(item['subtitle']), styles['body']),
             Paragraph(escape(locale['note']), styles['note'])]
    for block in item['sections']:
        if block.get('break_before'):
            story.append(PageBreak())
        story.append(Paragraph(escape(block['heading']), styles['heading']))
        story.extend(Paragraph(escape(line), styles['body']) for line in block['lines'])
        if 'table' in block:
            story.extend(pdf_table(block['table']))
        story.extend(Paragraph(escape(line), styles['body']) for line in block.get('after', []))
    story += [Spacer(1, 8), Paragraph(escape(item['check']), styles['note'])]
    for example in item['examples']:
        story += [PageBreak(), Paragraph(escape(example_title(item, example)), styles['title2']),
                  Paragraph(escape(example_note(item, example)), styles['note'])]
        for entry in example['entries']:
            if isinstance(entry, str):
                story.append(Paragraph(escape(entry), styles['body']))
            elif 'table' in entry:
                story.extend(pdf_table(entry['table']))
            elif 'center' in entry:
                story.append(Paragraph(escape(entry['center']), styles['center']))
            else:
                story.append(PageBreak())

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor('#C9DFE6'))
        canvas.line(56, 38, A4[0] - 56, 38)
        canvas.setFont('DocsTemplate', 8)
        canvas.setFillColor(colors.HexColor('#435864'))
        canvas.drawString(56, 25, locale['stamp'])
        canvas.drawRightString(A4[0] - 56, 25, str(canvas.getPageNumber()))
        canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return stream.getvalue()


# ---------------------------------------------------------------------------
# Certificate: one list of drawing primitives, rendered as vectors in the PDF
# and as a page-sized picture behind the text in the DOCX.
# ---------------------------------------------------------------------------
def star8(cx, cy, radius):
    """Eight-pointed star outline: two squares turned 45° to each other."""
    inner = radius * 0.7654
    return [(cx + (radius if step % 2 == 0 else inner) * cos(step * pi / 8),
             cy + (radius if step % 2 == 0 else inner) * sin(step * pi / 8)) for step in range(16)]


def diamond(cx, cy, along, across, horizontal):
    half_x, half_y = (along, across) if horizontal else (across, along)
    return [(cx - half_x, cy), (cx, cy + half_y), (cx + half_x, cy), (cx, cy - half_y)]


def frame_primitives():
    shapes = []

    def rect(inset, color, width):
        shapes.append(('rect', inset, inset, PAGE_W - 2 * inset, PAGE_H - 2 * inset, color, width))

    rect(22, NAVY, 3.2)
    rect(28.5, GOLD, 1)
    rect(53.5, GOLD, 1)
    rect(58, NAVY, 1.2)
    band, gap = 41, 20
    for horizontal, length in ((True, PAGE_W), (False, PAGE_H)):
        usable = length - 2 * (band + gap)
        count = round(usable / 17)
        pitch = usable / count
        for index in range(count + 1):
            offset = band + gap + index * pitch
            for edge in (band, (PAGE_H if horizontal else PAGE_W) - band):
                centre = (offset, edge) if horizontal else (edge, offset)
                shapes.append(('poly', diamond(*centre, 5.4, 4.1, horizontal), GOLD, None, 0))
                if index < count:
                    dot = (offset + pitch / 2, edge) if horizontal else (edge, offset + pitch / 2)
                    shapes.append(('circle', *dot, 1.15, NAVY, None, 0))
    for cx in (band, PAGE_W - band):
        for cy in (band, PAGE_H - band):
            shapes.append(('poly', star8(cx, cy, 11.5), GOLD, NAVY, 0.9))
            shapes.append(('circle', cx, cy, 3.2, '#FFFFFF', NAVY, 0.9))
    for cy, reach in ((PAGE_H - 100, 122), (92, 96)):
        cx = PAGE_W / 2
        shapes.append(('line', cx - reach, cy, cx - 17, cy, GOLD, 1))
        shapes.append(('line', cx + 17, cy, cx + reach, cy, GOLD, 1))
        shapes.append(('line', cx - reach + 22, cy - 3.6, cx - 24, cy - 3.6, GOLD, 0.6))
        shapes.append(('line', cx + 24, cy - 3.6, cx + reach - 22, cy - 3.6, GOLD, 0.6))
        shapes.append(('poly', star8(cx, cy, 9), GOLD, NAVY, 0.8))
        shapes.append(('circle', cx, cy, 2.4, '#FFFFFF', NAVY, 0.8))
        for side in (-1, 1):
            shapes.append(('poly', diamond(cx + side * (reach + 7), cy, 4.2, 3.2, True), NAVY, None, 0))
    return shapes


def draw_frame(canvas):
    for shape in frame_primitives():
        kind = shape[0]
        if kind == 'rect':
            _, x, y, w, h, color, width = shape
            canvas.setStrokeColor(colors.HexColor(color))
            canvas.setLineWidth(width)
            canvas.rect(x, y, w, h, stroke=1, fill=0)
        elif kind == 'line':
            _, x1, y1, x2, y2, color, width = shape
            canvas.setStrokeColor(colors.HexColor(color))
            canvas.setLineWidth(width)
            canvas.line(x1, y1, x2, y2)
        else:
            fill, stroke, width = shape[-3:]
            if fill:
                canvas.setFillColor(colors.HexColor(fill))
            if stroke:
                canvas.setStrokeColor(colors.HexColor(stroke))
                canvas.setLineWidth(width)
            if kind == 'circle':
                canvas.circle(shape[1], shape[2], shape[3], stroke=int(bool(stroke)), fill=int(bool(fill)))
            else:
                path = canvas.beginPath()
                path.moveTo(*shape[1][0])
                for point in shape[1][1:]:
                    path.lineTo(*point)
                path.close()
                canvas.drawPath(path, stroke=int(bool(stroke)), fill=int(bool(fill)))


def frame_png():
    """The same frame as a 200 dpi picture (drawn at 2x, then reduced) for the DOCX page background."""
    scale = 200 / 72 * 2
    size = (round(PAGE_W * scale), round(PAGE_H * scale))
    image = Image.new('RGB', size, 'white')
    draw = ImageDraw.Draw(image)

    def at(x, y):
        return (x * scale, (PAGE_H - y) * scale)

    def pen(width):
        return max(1, round(width * scale))

    for shape in frame_primitives():
        kind = shape[0]
        if kind == 'rect':
            _, x, y, w, h, color, width = shape
            half = width / 2
            draw.rectangle([at(x - half, y + h + half), at(x + w + half, y - half)], outline=color, width=pen(width))
        elif kind == 'line':
            _, x1, y1, x2, y2, color, width = shape
            draw.line([at(x1, y1), at(x2, y2)], fill=color, width=pen(width))
        elif kind == 'circle':
            _, cx, cy, radius, fill, stroke, width = shape
            draw.ellipse([at(cx - radius, cy + radius), at(cx + radius, cy - radius)], fill=fill,
                         outline=stroke, width=pen(width) if stroke else 0)
        else:
            _, points, fill, stroke, width = shape
            pixels = [at(*point) for point in points]
            draw.polygon(pixels, fill=fill)
            if stroke:
                draw.line(pixels + pixels[:2], fill=stroke, width=pen(width), joint='curve')
    image = image.resize((size[0] // 2, size[1] // 2), Image.LANCZOS)
    image = image.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    stream = BytesIO()
    image.save(stream, 'PNG', optimize=True, dpi=(200, 200))
    return stream.getvalue()


def add_page_background(paragraph, png):
    """Anchor a page-sized picture behind the text; in the header it repeats on every page."""
    inline = paragraph.add_run().add_picture(BytesIO(png), width=Mm(210), height=Mm(297))._inline
    anchor = OxmlElement('wp:anchor')
    for key, value in (('distT', '0'), ('distB', '0'), ('distL', '0'), ('distR', '0'), ('simplePos', '0'),
                       ('relativeHeight', '0'), ('behindDoc', '1'), ('locked', '1'), ('layoutInCell', '1'),
                       ('allowOverlap', '1')):
        anchor.set(key, value)
    simple = OxmlElement('wp:simplePos')
    simple.set('x', '0')
    simple.set('y', '0')
    anchor.append(simple)
    for tag in ('wp:positionH', 'wp:positionV'):
        position = OxmlElement(tag)
        position.set('relativeFrom', 'page')
        offset = OxmlElement('wp:posOffset')
        offset.text = '0'
        position.append(offset)
        anchor.append(position)
    anchor.append(inline.extent)
    effect = OxmlElement('wp:effectExtent')
    for side in 'ltrb':
        effect.set(side, '0')
    anchor.append(effect)
    anchor.append(OxmlElement('wp:wrapNone'))
    anchor.append(inline.docPr)
    anchor.append(OxmlElement('wp:cNvGraphicFramePr'))
    anchor.append(inline.graphic)
    inline.getparent().replace(inline, anchor)


def cert_docx_lines(values, signature):
    """(text, size, bold, colour, space before, space after) for one certificate page."""
    return [
        (values['org'], 12, True, INK, 0, 28),
        (CERT['title'], 38, True, INK, 26, 58),
        (values['role'], 14, False, '1F2A30', 0, 28),
        (values['name'], 26, True, '8A6417', 0, 31),
        (values['reason'], 14, False, '1F2A30', 0, 21),
        (CERT['verb'], 14, False, '1F2A30', 0, 100),
        (f"{values['signer_role']}        ______________        {values['signer_name']}", 12, False, '1F2A30', 0, 19),
        (signature, 10, False, '435864', 0, 26),
        (values['place_date'], 12, False, '1F2A30', 0, 0),
    ]


def make_cert_docx():
    doc, section = new_document(CERT['title'], CERT['locale'], CERT['subject'])
    # Text starts under the top ornament; a longer name or reason still stays inside the frame.
    section.top_margin, section.bottom_margin = Mm(51), Mm(30)
    section.left_margin = section.right_margin = Mm(34)
    section.header_distance = section.footer_distance = Mm(8)
    add_page_background(section.header.paragraphs[0], frame_png())

    def line(text, size, bold, color, before, after):
        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_before, paragraph.paragraph_format.space_after = Pt(before), Pt(after)
        paragraph.paragraph_format.line_spacing = 1.15
        run = paragraph.add_run(text)
        run.bold = bold
        run.font.size = Pt(size)
        run.font.color.rgb = RGBColor.from_string(color)
        return paragraph

    for values in cert_docx_lines(CERT['blank'], CERT['stamp_place']):
        line(*values)
    doc.add_page_break()
    line(CERT['example_label'], 8, False, '435864', 0, 4)
    for values in cert_docx_lines(CERT['example'], CERT['example']['unsigned']):
        line(*values)
    stream = BytesIO()
    doc.save(stream)
    return clean_zip(stream.getvalue())


def make_cert_pdf():
    stream = BytesIO()
    canvas = pdfcanvas.Canvas(stream, pagesize=A4, invariant=1)
    canvas.setTitle(CERT['title'])
    canvas.setAuthor('GPTBot.uz')
    canvas.setSubject(CERT['subject'])
    canvas.setCreator('GPTBot.uz')
    ink, text_color, muted = colors.HexColor('#' + INK), colors.HexColor('#1F2A30'), colors.HexColor('#435864')
    centre, column = PAGE_W / 2, 370

    def style(name, size, color, leading=None):
        return ParagraphStyle(name, fontName='DocsTemplateBold' if name.endswith('bold') else 'DocsTemplate',
                              fontSize=size, leading=leading or size * 1.3, textColor=color, alignment=TA_CENTER)

    def block(text, look, top, width=column):
        """Draw a centred paragraph whose top edge is `top`; return its bottom edge."""
        paragraph = Paragraph(escape(text), look)
        _, height = paragraph.wrap(width, 400)
        paragraph.drawOn(canvas, centre - width / 2, top - height)
        return top - height

    def rule(y, width, x=None):
        x = centre if x is None else x
        canvas.setStrokeColor(muted)
        canvas.setLineWidth(0.6)
        canvas.line(x - width / 2, y, x + width / 2, y)

    def caption(text, y, x=None):
        canvas.setFont('DocsTemplate', 7.5)
        canvas.setFillColor(muted)
        canvas.drawCentredString(centre if x is None else x, y, text)

    def title():
        # Letter spacing is part of the graphics state: keep it inside this one line.
        canvas.saveState()
        canvas.setFont('DocsTemplateBold', 38)
        canvas.setFillColor(ink)
        text, spacing = CERT['title'], 3
        width = pdfmetrics.stringWidth(text, 'DocsTemplateBold', 38) + spacing * (len(text) - 1)
        line = canvas.beginText(centre - width / 2, PAGE_H - 250)
        line.setCharSpace(spacing)
        line.textLine(text)
        canvas.drawText(line)
        canvas.restoreState()

    def plain(text, x, y, size=12, color=text_color):
        canvas.setFont('DocsTemplate', size)
        canvas.setFillColor(color)
        canvas.drawCentredString(x, y, text)

    # Page 1: lines to fill in by hand.
    draw_frame(canvas)
    captions = CERT['captions']
    rule(PAGE_H - 168, 330)
    caption(captions['org'], PAGE_H - 178)
    title()
    rule(PAGE_H - 322, 300)
    caption(captions['role'], PAGE_H - 332)
    rule(PAGE_H - 384, 360)
    caption(captions['name'], PAGE_H - 394)
    for step in range(3):
        rule(PAGE_H - 442 - step * 32, 370)
    caption(captions['reason'], PAGE_H - 516)
    block(CERT['verb'], style('verb', 14, text_color), PAGE_H - 540)
    for x, width, key in ((centre - 130, 120, 'signer_role'), (centre, 100, 'signature'), (centre + 130, 120, 'signer_name')):
        rule(222, width, x)
        caption(captions[key], 212, x)
    plain(CERT['stamp_place'], centre, 180, 9, muted)
    plain(captions['date'], centre, 140)
    canvas.showPage()

    # Page 2: the conditional example on the same grid.
    draw_frame(canvas)
    example = CERT['example']
    block(CERT['example_label'], style('label', 7.5, muted), PAGE_H - 66, 440)
    block(example['org'], style('org-bold', 12, ink), PAGE_H - 152)
    title()
    block(example['role'], style('role', 14, text_color), PAGE_H - 314)
    bottom = block(example['name'], style('name-bold', 26, colors.HexColor('#8A6417')), PAGE_H - 362)
    bottom = block(example['reason'], style('reason', 14, text_color, 21), bottom - 34)
    block(CERT['verb'], style('verb', 14, text_color), bottom - 12)
    plain(example['signer_role'], centre - 130, 226)
    plain(example['signer_name'], centre + 130, 226)
    rule(222, 100)
    caption(example['unsigned'], 208)
    plain(example['place_date'], centre, 140)
    canvas.showPage()
    canvas.save()
    return stream.getvalue()


def cert_texts(kind):
    shared = [CERT['title'], CERT['verb'], CERT['example_label'], *CERT['example'].values()]
    if kind == 'docx':
        return shared + [CERT['stamp_place'], *CERT['blank'].values()]
    return shared + [CERT['stamp_place'], *CERT['captions'].values()]


def compact(text):
    return re.sub(r'\s+', '', text)


def expected_text(item):
    locale = item['locale']
    texts = [item['title'], item['subtitle'], locale['note'], item['check']]
    for section in item['sections']:
        texts += [section['heading'], *section['lines'], *section.get('after', [])]
        if 'table' in section:
            texts += table_cells(section['table'])
    for example in item['examples']:
        texts += [example_title(item, example), example_note(item, example)]
        for entry in example['entries']:
            texts += entry_texts(entry)
    return texts


def validate(item, generated, certificate=False):
    checks = []
    locale = item['locale']

    def check(name, result):
        checks.append({'name': name, 'pass': bool(result)})
    docx_path, pdf_path = (DEST / (item['slug'] + ext) for ext in ('.docx', '.pdf'))
    docx_expected = cert_texts('docx') if certificate else expected_text(item)
    pdf_expected = cert_texts('pdf') if certificate else expected_text(item)
    pages = (2, 2) if certificate else item['pages']
    breaks = 1 if certificate else page_breaks(item)
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
        check('DOCX complete blank and example text', all(compact(line) in compact(word_text) for line in docx_expected))
        check('DOCX editable placeholders and document language', '[' in word_text and locale['lang'] in ''.join(all_xml))
        check('DOCX every example on its own page', xml.count('w:type="page"') == breaks)
        check('DOCX public author only', '<dc:creator>GPTBot.uz</dc:creator>' in core and '<cp:lastModifiedBy>GPTBot.uz</cp:lastModifiedBy>' in core)
        check('No private paths or macros', not re.search(r'Borinio|[CF]:[\\/]|vbaProject', ''.join(all_xml)))
        check('No external DOCX relationships', not any('TargetMode="External"' in value for value in all_xml))
        if certificate:
            media = [name for name in archive.namelist() if name.startswith('word/media/')]
            header = ''.join(archive.read(name).decode('utf-8') for name in archive.namelist() if re.fullmatch(r'word/header\d*\.xml', name))
            check('DOCX frame is one code-drawn PNG behind the text of every page',
                  len(media) == 1 and archive.read(media[0])[:8] == b'\x89PNG\r\n\x1a\n' and 'behindDoc="1"' in header)
    pdf = PdfReader(pdf_path)
    page_texts = [page.extract_text() or '' for page in pdf.pages]
    pdf_text = '\n'.join(page_texts)
    check(f'PDF printable A4, {pages[0]} to {pages[1]} pages, none blank',
          pages[0] <= len(pdf.pages) <= pages[1] and all(len(text.strip()) > 100 for text in page_texts)
          and all(abs(float(page.mediabox.width) - A4[0]) < 1 and abs(float(page.mediabox.height) - A4[1]) < 1 for page in pdf.pages))
    check('PDF complete blank and example text', all(compact(line) in compact(pdf_text) for line in pdf_expected))
    check('PDF glyphs extract without replacements', locale['glyphs'] in pdf_text and '\ufffd' not in pdf_text and '■' not in pdf_text)
    check('PDF public author', pdf.metadata.author == 'GPTBot.uz')
    descriptors = []
    for page in pdf.pages:
        for font in page['/Resources']['/Font'].get_object().values():
            font = font.get_object()
            if '/FontDescriptor' in font:
                descriptors.append(font['/FontDescriptor'].get_object())
    check('PDF Unicode fonts embedded', len(descriptors) >= 2 and all('/FontFile2' in font for font in descriptors))
    check('PDF has no external links or actions', '/OpenAction' not in pdf.trailer['/Root'] and all(not page.get('/Annots') for page in pdf.pages))
    if certificate:
        check('PDF frame is vector drawing, no embedded picture', all('/XObject' not in page['/Resources'] for page in pdf.pages))
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
    builders = [(item, False, lambda item=item: {'docx': make_docx(item), 'pdf': make_pdf(item)}) for item in items]
    builders.append((CERT, True, lambda: {'docx': make_cert_docx(), 'pdf': make_cert_pdf()}))
    results = []
    for item, certificate, build in builders:
        generated = build()
        if not args.check:
            for extension, data in generated.items():
                (DEST / (item['slug'] + '.' + extension)).write_bytes(data)
        results.append(validate(item, generated, certificate))
    failed = [(result['slug'], check['name']) for result in results for check in result['checks'] if not check['pass']]
    report = {'status': 'FAIL' if failed else 'PASS', 'font': font, 'templates': results, 'failed': failed}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'templates': len(results), 'checks': sum(len(result['checks']) for result in results),
                      'failed': failed, 'pages': {result['slug']: result['pages'] for result in results},
                      'bytes': {name: size for result in results for name, size in result['bytes'].items()}}, ensure_ascii=False))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
