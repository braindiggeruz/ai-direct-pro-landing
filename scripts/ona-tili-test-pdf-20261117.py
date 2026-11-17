"""Build the printable Uzbek grammar practice test for /uz/ona-tili-test/.

80 original multiple-choice questions for grades 5-9 (four options, one
correct), in five groups of 16: phonetics and spelling, lexicology, parts of
speech, morphology, syntax and punctuation. The questions below are the single
source for the PDF and for the page: `--blocks` prints the body blocks that
content/pages/uz/ona-tili-test.json carries, so the page can be compared with
this list. These are practice questions written for GPTBot.uz, not official
exam material.

Output: public/downloads/docs-20261117/ona-tili-test.pdf (A4 portrait, two
columns, the answer key alone on the last page). No user input, network or
personal data. Same font strategy as docs-document-templates-20261116.py
(Arial on Windows, DejaVu Sans elsewhere), so o‘, g‘ and ’ render and embed.

--check validates the committed file and its deterministic regeneration in the
same font environment; it never rewrites the download.
"""
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape
import argparse
import hashlib
import json
import re

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, FrameBreak, KeepTogether, NextPageTemplate, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/downloads/docs-20261117'
TARGET = DEST / 'ona-tili-test.pdf'
STAMP = 'GPTBot.uz · Ona tili: 80 ta mashq savoli · 17.11.2026'
TITLE = 'Ona tili: 5–9-sinflar uchun 80 ta mashq savoli'
SUBTITLE = 'Fonetika va imlo · leksikologiya · so‘z turkumlari · morfologiya · sintaksis va tinish belgilari'
INTRO = ('Har bir savolda to‘rtta variant va bitta to‘g‘ri javob bor. Javoblar kaliti oxirgi sahifada, '
         'har bir javobning izohi esa gptbot.uz/uz/ona-tili-test/ sahifasida. Savollar mashq uchun tuzilgan: '
         'bu rasmiy imtihon, BSB, ChSB yoki DTM materiali emas.')
NAME_LINE = 'Ism: ________________________    Sinf: ________    Sana: ____________    To‘g‘ri javoblar: ____ / 80'
KEY_TITLE = 'Javoblar kaliti'
KEY_NOTE = ('Savollar 2026-yil 17-noyabr holatiga ko‘ra amaldagi alifbo va imlo qoidalariga tayanadi. '
            'Har bir javobning qisqa izohi: gptbot.uz/uz/ona-tili-test/')

GROUPS = [
    {'id': 'fonetika-va-imlo', 'title': 'Fonetika va imlo', 'range': (1, 16)},
    {'id': 'leksikologiya', 'title': 'Leksikologiya', 'range': (17, 32)},
    {'id': 'soz-turkumlari', 'title': 'So‘z turkumlari', 'range': (33, 48)},
    {'id': 'morfologiya', 'title': 'Morfologiya', 'range': (49, 64)},
    {'id': 'sintaksis-va-tinish-belgilari', 'title': 'Sintaksis va tinish belgilari', 'range': (65, 80)},
]

# (question, [A, B, C, D], correct letter, short explanation)
QUESTIONS = [
    # 1-16: fonetika va imlo
    ('O‘zbek adabiy tilida nechta unli tovush bor?',
     ['5 ta', '6 ta', '8 ta', '10 ta'], 'B',
     'Unli tovushlar oltita: i, e, a, u, o‘, o.'),
    ('Qaysi qatorda faqat lablangan unlilar berilgan?',
     ['u, o‘, o', 'a, e, i', 'i, u, o‘', 'a, o, e'], 'A',
     'U, o‘, o lablar ishtirokida aytiladi; i, e, a — lablanmagan unlilar.'),
    ('Qaysi qatordagi undoshlarning barchasi jarangsiz?',
     ['b, d, g, z', 'm, n, l, r', 'v, j, g‘, y', 'p, t, k, s'], 'D',
     'P, t, k, s — jarangsiz undoshlar; qolgan qatorlardagi undoshlar jarangli.'),
    ('«Maktabimiz» so‘zida nechta bo‘g‘in bor?',
     ['3 ta', '4 ta', '5 ta', '6 ta'], 'B',
     'Mak-ta-bi-miz: so‘zda nechta unli bo‘lsa, shuncha bo‘g‘in bo‘ladi.'),
    ('«Chang» so‘zida nechta tovush bor?',
     ['3 ta', '4 ta', '5 ta', '6 ta'], 'A',
     'Ch, a, ng: ch va ng harf birikmalari bittadan tovushni bildiradi.'),
    ('O‘zbek tilida so‘z urg‘usi, odatda, qaysi bo‘g‘inga tushadi?',
     ['birinchi bo‘g‘inga', 'ikkinchi bo‘g‘inga', 'oxirgi bo‘g‘inga', 'oxiridan oldingi bo‘g‘inga'], 'C',
     'Urg‘u, odatda, oxirgi bo‘g‘inga tushadi; qo‘shimcha qo‘shilsa, u ham so‘z oxiriga ko‘chadi.'),
    ('Qaysi so‘zda tovushlar soni harflar sonidan kam?',
     ['kitob', 'qalam', 'daftar', 'sher'], 'D',
     '«Sher» so‘zi to‘rtta harfdan iborat, lekin sh harf birikmasi bitta tovushni bildiradi: sh, e, r — 3 ta tovush.'),
    ('Qaysi so‘z xato yozilgan?',
     ['ma’no', 'e’lon', 'sanat', 'mo‘jiza'], 'C',
     'To‘g‘risi — san’at: tutuq belgisi undoshni keyingi unlidan ajratadi. «Mo‘jiza» tutuq belgisisiz yoziladi.'),
    ('Qaysi so‘z to‘g‘ri yozilgan?',
     ['xabar', 'hursand', 'xurmat', 'xavo'], 'A',
     'Xabar — to‘g‘ri; qolganlari xursand, hurmat, havo shaklida yoziladi.'),
    ('«Sayla» fe’liga -v qo‘shimchasi qo‘shilsa, qaysi so‘z hosil bo‘ladi?',
     ['saylav', 'sayluv', 'saylov', 'sayliv'], 'C',
     'A unlisi bilan tugagan fe’lga -v qo‘shilsa, a tovushi o ga aylanadi: sayla — saylov.'),
    ('Qaysi so‘zga egalik qo‘shimchasi qo‘shilganda oxirgi undosh o‘zgarmaydi?',
     ['yurak', 'tilak', 'tayoq', 'ishtirok'], 'D',
     'Ishtirok — ishtiroki; lekin yurak — yuragi, tilak — tilagi, tayoq — tayog‘i.'),
    ('Qaysi so‘zga egalik qo‘shimchasi qo‘shilganda ikkinchi bo‘g‘indagi unli tushib qoladi?',
     ['kitob', 'burun', 'qalam', 'daftar'], 'B',
     'Burun — burni; kitobi, qalami, daftari so‘zlarida unli tushmaydi.'),
    ('Qaysi yuklama o‘zidan oldingi so‘zga qo‘shib yoziladi?',
     ['-mi', '-ku', '-chi', '-da'], 'A',
     '-mi qo‘shib yoziladi: keldimi? -ku, -chi, -da yuklamalari chiziqcha bilan yoziladi: keldi-ku, sen-chi, yaxshi-da.'),
    ('Qaysi qatorda tartib son to‘g‘ri yozilgan?',
     ['XXI-asr', '9 sinf', '5-chi qator', '2026-yil'], 'D',
     'Arab raqamidan keyin chiziqcha qo‘yiladi: 2026-yil, 9-sinf, 5-qator. Rim raqamidan keyin qo‘yilmaydi: XXI asr.'),
    ('Qaysi qatorda bosh harf to‘g‘ri qo‘llangan?',
     ['Mustaqillik Kuni', 'Mustaqillik kuni', 'mustaqillik kuni', 'mustaqillik Kuni'], 'B',
     'Bayram nomida faqat birinchi so‘z bosh harf bilan yoziladi.'),
    ('Qaysi so‘z keyingi satrga to‘g‘ri ko‘chirilgan?',
     ['a-badiy', 'mudofa-a', 'ma’-rifat', 'ma’r-ifat'], 'C',
     'Ma’rifat so‘zi ma’-ri-fat bo‘g‘inlariga bo‘linadi. «A-badiy» va «mudofa-a» variantlarida bir harfli bo‘g‘in alohida qoldirilgan yoki ko‘chirilgan, bu mumkin emas; «ma’r-ifat» bo‘g‘in chegarasini buzadi.'),
    # 17-32: leksikologiya
    ('Aytilishi va yozilishi bir xil, ma’nosi har xil so‘zlar nima deb ataladi?',
     ['ma’nodosh so‘zlar (sinonimlar)', 'zid ma’noli so‘zlar (antonimlar)', 'shakldosh so‘zlar (omonimlar)', 'paronimlar'], 'C',
     'Masalan: ot (hayvon), ot (ism), ot (otmoq fe’li).'),
    ('Qaysi qatorda ma’nodosh so‘zlar (sinonimlar) berilgan?',
     ['baland — past', 'kecha — bugun', 'asr — asir', 'botir — jasur'], 'D',
     'Botir va jasur — ma’nosi yaqin so‘zlar. Baland — past zid ma’noli, asr — asir esa paronimlar.'),
    ('Qaysi juftlik zid ma’noli so‘zlardan (antonimlardan) iborat?',
     ['saxiy — baxil', 'go‘zal — chiroyli', 'yurt — vatan', 'tez — ildam'], 'A',
     'Saxiy va baxil qarama-qarshi ma’noli; qolgan juftliklar ma’nodosh so‘zlar.'),
    ('Qaysi so‘z shakldosh (omonim) so‘zga misol bo‘ladi?',
     ['kitob', 'yoz', 'daraxt', 'maktab'], 'B',
     'Yoz — fasl nomi; yoz — «xat yoz» birikmasidagi fe’l.'),
    ('Qaysi juftlik paronimlardan iborat?',
     ['ot — ism', 'katta — ulkan', 'tana — ta’na', 'oq — qora'], 'C',
     'Tana (gavda) va ta’na (gina, kinoya) — aytilishi o‘xshash, yozilishi va ma’nosi boshqa so‘zlar.'),
    ('«Ko‘z» so‘zi qaysi birikmada o‘z ma’nosida qo‘llangan?',
     ['buloqning ko‘zi', 'uzukning ko‘zi', 'ignaning ko‘zi', 'bolaning ko‘zi'], 'D',
     'Qolgan birikmalarda «ko‘z» o‘xshashlik asosida ko‘chma ma’noda qo‘llangan.'),
    ('Qaysi birikmada «shirin» so‘zi ko‘chma ma’noda qo‘llangan?',
     ['shirin olma', 'shirin so‘z', 'shirin choy', 'shirin qovun'], 'B',
     'Shirin so‘z — yoqimli so‘z; qolgan birikmalarda «shirin» maza-ta’mni bildiradi.'),
    ('«Men Navoiyni sevib o‘qiyman» gapida ma’no ko‘chishining qaysi turi qo‘llangan?',
     ['metonimiya', 'metafora', 'sinekdoxa', 'vazifadoshlik'], 'A',
     'Muallif nomi uning asarlari o‘rnida qo‘llangan: bu — metonimiya.'),
    ('«Og‘zi qulog‘ida» iborasining ma’nosi qaysi javobda to‘g‘ri berilgan?',
     ['juda xafa', 'sergap', 'juda xursand', 'qulog‘i og‘ir'], 'C',
     'Og‘zi qulog‘ida — juda xursand, quvonchi yuzidan bilinib turibdi.'),
    ('«Tarvuzi qo‘ltig‘idan tushdi» iborasi qaysi holatni bildiradi?',
     ['hafsalasi pir bo‘ldi', 'qattiq charchadi', 'juda xursand bo‘ldi', 'og‘ir yuk ko‘tardi'], 'A',
     'Ibora umidi puchga chiqib, ruhi tushgan kishiga nisbatan aytiladi.'),
    ('«Oq oltin» tasviriy ifodasi nimani bildiradi?',
     ['tuzni', 'qorni', 'shakarni', 'paxtani'], 'D',
     'Oq oltin — paxta; qora oltin — neft.'),
    ('Qaysi so‘z tarixiy so‘z hisoblanadi (u bildirgan lavozim hozir yo‘q)?',
     ['o‘qituvchi', 'mingboshi', 'shifokor', 'haydovchi'], 'B',
     'Mingboshi — o‘tmishdagi amal nomi; bunday lavozim hozir yo‘q.'),
    ('Adabiy tildagi «narvon» so‘zining ayrim shevalardagi muqobili qaysi?',
     ['supa', 'tokcha', 'shoti', 'ayvon'], 'C',
     'Shoti ayrim shevalarda narvon ma’nosida qo‘llanadi.'),
    ('Qaysi qatorda faqat tilshunoslik atamalari berilgan?',
     ['ildiz, poya, barg', 'kasr, tenglama, burchak', 'atom, molekula, modda', 'ega, kesim, kelishik'], 'D',
     'Ega, kesim, kelishik — tilshunoslik atamalari; qolganlari botanika, matematika va kimyoga oid.'),
    ('Qaysi qatordagi so‘zlar o‘zbek tilining o‘z (turkiy) qatlamiga mansub?',
     ['kitob, maktab, ilm', 'tosh, suv, qo‘l', 'daraxt, dasturxon, go‘sht', 'telefon, stol, mashina'], 'B',
     'Kitob, maktab, ilm — arabcha; daraxt, dasturxon, go‘sht — forscha-tojikcha; telefon, stol, mashina — rus tili orqali kirgan so‘zlar.'),
    ('So‘zlarning ma’nosi tushuntirib beriladigan lug‘at qaysi?',
     ['izohli lug‘at', 'imlo lug‘ati', 'orfoepik (talaffuz) lug‘ati', 'ruscha-o‘zbekcha tarjima lug‘ati'], 'A',
     'Izohli lug‘at so‘z ma’nolarini tushuntiradi; imlo lug‘ati yozilishini, orfoepik lug‘at talaffuzini ko‘rsatadi.'),
    # 33-48: so‘z turkumlari
    ('Qaysi qatorda faqat mustaqil so‘z turkumlari berilgan?',
     ['ot, ko‘makchi, son', 'ot, sifat, fe’l', 'bog‘lovchi, fe’l, ravish', 'sifat, yuklama, son'], 'B',
     'Ko‘makchi, bog‘lovchi va yuklama — yordamchi so‘zlar.'),
    ('Qaysi qatorda faqat atoqli otlar berilgan?',
     ['shahar, daryo, bola', 'Toshkent, poytaxt, ko‘cha', 'Samarqand, Zarafshon, Alisher', 'kitob, Navoiy, shoir'], 'C',
     'Samarqand (shahar), Zarafshon (daryo), Alisher (kishi ismi) — atoqli otlar, ular bosh harf bilan yoziladi. Shahar, daryo, bola — turdosh otlar.'),
    ('Qaysi sifat orttirma darajada?',
     ['baland', 'balandroq', 'balandlik', 'eng baland'], 'D',
     'Eng, juda, g‘oyat so‘zlari orttirma daraja hosil qiladi; «balandlik» esa ot.'),
    ('«Uchala» so‘zi sonning qaysi ma’no turiga kiradi?',
     ['jamlovchi son', 'sanoq son', 'chama son', 'tartib son'], 'A',
     'Uchala, uchov, ikkovlon — jamlovchi sonlar.'),
    ('Qaysi qatorda chama son berilgan?',
     ['o‘nta', 'o‘ninchi', 'o‘ntacha', 'o‘ntadan'], 'C',
     'O‘ntacha — taxminiy miqdor; o‘nta — dona son, o‘ninchi — tartib son, o‘ntadan — taqsim son.'),
    ('«Hamma» so‘zi olmoshning qaysi turiga kiradi?',
     ['kishilik olmoshi', 'belgilash (jamlash) olmoshi', 'ko‘rsatish olmoshi', 'bo‘lishsizlik olmoshi'], 'B',
     'Hamma, barcha, bari, har kim — belgilash (jamlash) olmoshlari.'),
    ('Qaysi qatorda gumon olmoshlari berilgan?',
     ['kim, nima, qaysi', 'hech kim, hech nima, hech qaysi', 'men, sen, u', 'kimdir, allanima, birov'], 'D',
     'Gumon olmoshlari noaniq shaxs yoki narsani bildiradi: kimdir, allanima, birov.'),
    ('Qaysi fe’l o‘timli (tushum kelishigidagi so‘zni boshqara oladi)?',
     ['o‘qidi', 'uxladi', 'keldi', 'yugurdi'], 'A',
     'Nimani o‘qidi? — kitobni. Uxladi, keldi, yugurdi fe’llari tushum kelishigidagi so‘zni boshqarmaydi.'),
    ('«Olma» so‘zi qaysi gapda fe’l bo‘lib kelgan?',
     ['Olma pishdi.', 'Olma shirin ekan.', 'Bu kitobni olma.', 'Bog‘da olma ko‘p.'], 'C',
     'Bu gapda «olma» — «olmoq» fe’lining bo‘lishsiz buyruq shakli; qolgan gaplarda u meva nomi.'),
    ('Qaysi qatorda payt ravishlari berilgan?',
     ['tez, sekin, asta', 'bugun, kecha, hozir', 'pastda, yuqorida, ichkarida', 'ko‘p, oz, sal'], 'B',
     'Bugun, kecha, hozir «qachon?» so‘rog‘iga javob beradi.'),
    ('«Atayin» so‘zi ravishning qaysi ma’no turiga kiradi?',
     ['payt ravishi', 'o‘rin ravishi', 'miqdor-daraja ravishi', 'maqsad ravishi'], 'D',
     'Atayin, ataylab, jo‘rttaga — ish-harakatning maqsadini bildiradi.'),
    ('Qaysi qatorda faqat ko‘makchilar berilgan?',
     ['bilan, uchun, kabi', 'va, ammo, lekin', 'faqat, hatto, axir', 'oh, voy, eh'], 'A',
     'Va, ammo, lekin — bog‘lovchilar; faqat, hatto, axir — yuklamalar; oh, voy, eh — undov so‘zlar.'),
    ('Qaysi so‘z zidlov bog‘lovchisi hisoblanadi?',
     ['va', 'yoki', 'lekin', 'chunki'], 'C',
     'Lekin, ammo, biroq — zidlov bog‘lovchilari; va — biriktiruv, yoki — ayiruv, chunki — ergashtiruvchi bog‘lovchi.'),
    ('Qaysi gapda yuklama qatnashgan?',
     ['Anvar va Lola keldi.', 'Faqat Anvar keldi.', 'Anvar ukasi bilan keldi.', 'Anvar kecha keldi.'], 'B',
     'Faqat — ayirish-chegaralash yuklamasi; va — bog‘lovchi, bilan — ko‘makchi, kecha — ravish.'),
    ('Qaysi qatorda faqat taqlid so‘zlar berilgan?',
     ['taq-tuq, yalt-yult, g‘ir-g‘ir', 'oh, voy, eh', 'albatta, ehtimol, afsuski', 'hatto, faqat, axir'], 'A',
     'Taq-tuq, g‘ir-g‘ir — tovushga, yalt-yult — holatga taqlid.'),
    ('Qaysi so‘z modal so‘z hisoblanadi?',
     ['lekin', 'bilan', 'voy', 'albatta'], 'D',
     'Albatta — ishonchni bildiruvchi modal so‘z; lekin — bog‘lovchi, bilan — ko‘makchi, voy — undov so‘z.'),
    # 49-64: morfologiya
    ('«Bog‘bonlarimizga» so‘zida nechta qo‘shimcha bor?',
     ['2 ta', '3 ta', '4 ta', '5 ta'], 'C',
     'Bog‘ + -bon + -lar + -imiz + -ga: o‘zakka to‘rtta qo‘shimcha qo‘shilgan.'),
    ('Qaysi so‘zda so‘z yasovchi qo‘shimcha bor?',
     ['gulzor', 'gullar', 'gulni', 'gulim'], 'A',
     '-zor yangi so‘z yasaydi: gul — gulzor. -lar, -ni, -im qo‘shimchalari yangi so‘z yasamaydi.'),
    ('Qaysi qo‘shimcha otdan fe’l yasaydi?',
     ['-chi', '-li', '-lar', '-la'], 'D',
     'Ish — ishla, gul — gulla. -chi ot, -li sifat yasaydi; -lar — ko‘plik qo‘shimchasi.'),
    ('Qaysi so‘z tuzilishiga ko‘ra qo‘shma so‘z?',
     ['bog‘bon', 'belbog‘', 'ota-ona', 'bog‘lar'], 'B',
     'Belbog‘: bel + bog‘. Bog‘bon — yasama so‘z, ota-ona — juft so‘z.'),
    ('«Maktabdan» so‘zi qaysi kelishikda?',
     ['jo‘nalish kelishigida', 'o‘rin-payt kelishigida', 'tushum kelishigida', 'chiqish kelishigida'], 'D',
     '-dan — chiqish kelishigi qo‘shimchasi: qayerdan? — maktabdan.'),
    ('Qaysi gapda tushum kelishigi belgisiz qo‘llangan (qo‘shimchasi tushib qolgan)?',
     ['Men kitobni o‘qidim.', 'Men kitob o‘qidim.', 'Men kitobdan o‘qidim.', 'Men kitobga qaradim.'], 'B',
     'Nimani o‘qidim? — kitob(ni): -ni qo‘shimchasi tushib qolgan.'),
    ('«Daftaring» so‘zidagi egalik qo‘shimchasi qaysi shaxs va sonni bildiradi?',
     ['II shaxs birlik', 'I shaxs birlik', 'III shaxs birlik', 'II shaxs ko‘plik'], 'A',
     '-ing — II shaxs birlik qo‘shimchasi: sening daftaring.'),
    ('Qaysi gapda -lar qo‘shimchasi hurmat ma’nosini bildiradi?',
     ['Bolalar hovlida o‘ynashyapti.', 'Kitoblar javonda turibdi.', 'Dadamlar ishdan keldilar.', 'Qushlar janubga uchib ketdi.'], 'C',
     '«Dadamlar» bitta kishi haqida aytilgan: -lar bu yerda ko‘plikni emas, hurmatni bildiradi.'),
    ('Qaysi fe’l hozirgi zamon shaklida?',
     ['yozdi', 'yozgan edi', 'yozyapti', 'yozmoqchi'], 'C',
     '-yap — hozirgi zamon qo‘shimchasi. Yozdi, yozgan edi — o‘tgan zamon; yozmoqchi — kelasi zamonning maqsad shakli.'),
    ('«Boramiz» fe’li qaysi shaxs va sonda?',
     ['I shaxs birlik', 'I shaxs ko‘plik', 'II shaxs ko‘plik', 'III shaxs ko‘plik'], 'B',
     '-miz — I shaxs ko‘plik qo‘shimchasi: biz boramiz.'),
    ('Qaysi fe’l shart maylida?',
     ['o‘qisa', 'o‘qisin', 'o‘qidi', 'o‘qiydi'], 'A',
     'Shart mayli -sa qo‘shimchasi bilan yasaladi; o‘qisin — buyruq-istak mayli.'),
    ('«Yuvindi» fe’li qaysi nisbatda?',
     ['aniq nisbatda', 'majhul nisbatda', 'orttirma nisbatda', 'o‘zlik nisbatda'], 'D',
     'Yuv + -in + -di: harakat bajaruvchining o‘ziga qaratilgan — o‘zlik nisbat.'),
    ('Qaysi fe’l orttirma nisbatda?',
     ['o‘qidi', 'o‘qitdi', 'o‘qildi', 'o‘qishdi'], 'B',
     'O‘qi + -t: o‘qitdi — orttirma nisbat; o‘qildi — majhul, o‘qishdi — birgalik nisbat.'),
    ('Qaysi so‘z ravishdosh?',
     ['kulib', 'kulgan', 'kulish', 'kuldi'], 'A',
     'Kulib — ravishdosh (-ib); kulgan — sifatdosh, kulish — harakat nomi.'),
    ('Qaysi birikmada sifatdosh qatnashgan?',
     ['o‘qib keldi', 'o‘qish foydali', 'kitob o‘qidi', 'o‘qigan bola'], 'D',
     'O‘qigan (qanday bola?) — sifatdosh; o‘qib — ravishdosh, o‘qish — harakat nomi.'),
    ('Fe’llarning shaxs-son qo‘shimchalarini olib o‘zgarishi nima deb ataladi?',
     ['turlanish', 'yasalish', 'tuslanish', 'qiyoslash'], 'C',
     'Fe’llar tuslanadi: men bordim, sen bording. Otlar esa kelishiklar bilan turlanadi.'),
    # 65-80: sintaksis va tinish belgilari
    ('«Ukamning daftari» birikmasida so‘zlar qaysi usulda bog‘langan?',
     ['boshqaruv', 'bitishuv', 'moslashuv', 'teng bog‘lanish'], 'C',
     'Qaratqich kelishigidagi so‘z egalik qo‘shimchali so‘z bilan moslashuv usulida bog‘lanadi.'),
    ('Qaysi birikma bitishuv usulida bog‘langan?',
     ['kitobni o‘qimoq', 'shirin olma', 'maktabga bormoq', 'ukamning kitobi'], 'B',
     'Shirin olma: so‘zlar qo‘shimchasiz, tartib va ohang orqali bog‘langan. Kitobni o‘qimoq, maktabga bormoq — boshqaruv.'),
    ('«Kecha bog‘imizda birinchi gilos pishdi» gapida ega qaysi so‘z?',
     ['kecha', 'bog‘imizda', 'pishdi', 'gilos'], 'D',
     'Nima pishdi? — gilos.'),
    ('«Men xatni yozdim» gapidagi «xatni» so‘zi qaysi gap bo‘lagi?',
     ['to‘ldiruvchi', 'ega', 'aniqlovchi', 'hol'], 'A',
     'Nimani yozdim? — xatni: tushum kelishigidagi (vositasiz) to‘ldiruvchi.'),
    ('«Lola chiroyli gul terdi» gapida aniqlovchi qaysi so‘z?',
     ['Lola', 'chiroyli', 'gul', 'terdi'], 'B',
     'Qanday gul? — chiroyli: sifatlovchi aniqlovchi.'),
    ('«Biz ertaga sayohatga boramiz» gapidagi «ertaga» so‘zi qaysi gap bo‘lagi?',
     ['to‘ldiruvchi', 'aniqlovchi', 'o‘rin holi', 'payt holi'], 'D',
     'Qachon boramiz? — ertaga: payt holi.'),
    ('Qaysi gapda ega bilan kesim orasiga tire qo‘yilishi kerak?',
     ['Kitob bilim manbai.', 'Kitob javonda turibdi.', 'Kitob juda qiziqarli ekan.', 'Kitobni kecha o‘qidim.'], 'A',
     'Ega ham, kesim ham bosh kelishikdagi ot bilan ifodalangan, bog‘lama yo‘q: Kitob — bilim manbai.'),
    ('Qaysi gap atov gap hisoblanadi?',
     ['Kuz keldi.', 'Kuzda yomg‘ir yog‘adi.', 'Kuz.', 'Kuzni yaxshi ko‘raman.'], 'C',
     'Atov gap bitta bosh bo‘lakdan — bosh kelishikdagi otdan iborat bo‘lib, narsa yoki hodisaning mavjudligini bildiradi.'),
    ('Qaysi gapda uyushiq bo‘laklar bor?',
     ['Bozordan shirin olma oldik.', 'Biz bozorga bordik.', 'Bozordan olma, anor va uzum oldik.', 'Bozor uyimizga yaqin.'], 'C',
     'Olma, anor va uzum — bir xil so‘roqqa javob beradigan uyushiq to‘ldiruvchilar.'),
    ('Umumlashtiruvchi so‘z uyushiq bo‘laklardan oldin kelsa, undan keyin qaysi tinish belgisi qo‘yiladi?',
     ['vergul', 'ikki nuqta', 'tire', 'nuqtali vergul'], 'B',
     'Masalan: Bog‘da hamma meva pishgan: olma, anor, uzum.'),
    ('Qaysi gapda undalma bor?',
     ['Do‘stlar, kitob o‘qishni odat qiling.', 'Do‘stlar kitob o‘qishdi.', 'Do‘stlarim kitobni yaxshi ko‘radi.', 'Do‘stlarimga kitob sovg‘a qildim.'], 'A',
     '«Do‘stlar» — nutq qaratilgan shaxslar; undalma vergul bilan ajratiladi.'),
    ('Qaysi gapda kirish so‘z qatnashgan?',
     ['Bugun yomg‘ir yog‘adi.', 'Men bugun uyda qolaman.', 'Yomg‘ir yog‘sa, uyda qolaman.', 'Menimcha, bugun yomg‘ir yog‘adi.'], 'D',
     'Menimcha — fikr kimga tegishli ekanini bildiruvchi kirish so‘z; u vergul bilan ajratiladi.'),
    ('Qaysi gap ergashgan qo‘shma gap?',
     ['Yomg‘ir yog‘di va havo sovidi.', 'Agar yomg‘ir yog‘sa, biz uyda qolamiz.', 'Yomg‘ir yog‘di, havo sovidi.', 'Yomg‘ir tindi.'], 'B',
     '«Agar yomg‘ir yog‘sa» — shart ergash gap, «biz uyda qolamiz» — bosh gap.'),
    ('Qaysi gap bog‘lovchisiz qo‘shma gap?',
     ['Qo‘ng‘iroq chalindi va dars boshlandi.', 'Qo‘ng‘iroq chalingach, dars boshlandi.', 'Qo‘ng‘iroq chalindi.', 'Qo‘ng‘iroq chalindi, dars boshlandi.'], 'D',
     'Ikki sodda gap bog‘lovchisiz, faqat ohang yordamida bog‘langan.'),
    ('Qaysi gapda tinish belgilari to‘g‘ri qo‘yilgan?',
     ['«Men ertaga kelaman» dedi, Anvar.', 'Men ertaga kelaman — dedi Anvar.', '«Men ertaga kelaman», — dedi Anvar.', '«Men ertaga kelaman». Dedi Anvar.'], 'C',
     'Ko‘chirma gap qo‘shtirnoqqa olinadi; undan keyin vergul va tire qo‘yiladi, muallif gapi kichik harf bilan boshlanadi.'),
    ('Qaysi gap o‘zlashtirma gap?',
     ['O‘qituvchi ertaga majlis bo‘lishini aytdi.', 'O‘qituvchi aytdi: «Ertaga majlis bo‘ladi».', '«Ertaga majlis bo‘ladi», — dedi o‘qituvchi.', 'Ertaga majlis bo‘ladi.'], 'A',
     'O‘zlashtirma gapda o‘zganing gapi mazmunan beriladi, qo‘shtirnoq qo‘yilmaydi.'),
]
LETTERS = 'ABCD'


def group_questions(group):
    first, last = group['range']
    return [(number, *QUESTIONS[number - 1]) for number in range(first, last + 1)]


def question_line(number, text, options):
    """One question as the page shows it: the text, then the four lettered options."""
    return f'{number}. {text} ' + ' '.join(f'{LETTERS[i]}) {option}' for i, option in enumerate(options))


def body_blocks():
    """The question lists and answer tables of the page, in page order."""
    blocks = []
    for group in GROUPS:
        first, last = group['range']
        rows = group_questions(group)
        blocks.append({'type': 'h2', 'id': group['id'], 'text': f'{group["title"]}: {first}–{last}-savollar'})
        blocks.append({'type': 'list', 'items': [question_line(n, text, options) for n, text, options, _, _ in rows]})
        blocks.append({'type': 'h3', 'id': f'javoblar-{first}-{last}', 'text': f'{first}–{last}-savollarning javoblari va izohlari'})
        blocks.append({'type': 'table', 'headers': ['Savol', 'To‘g‘ri javob', 'Qisqa izoh'],
                       'rows': [[str(n), f'{answer}) {options[LETTERS.index(answer)]}', note] for n, _, options, answer, note in rows]})
    return blocks


def validate_questions():
    assert len(QUESTIONS) == 80, len(QUESTIONS)
    assert [g['range'] for g in GROUPS] == [(1, 16), (17, 32), (33, 48), (49, 64), (65, 80)]
    texts = [q[0] for q in QUESTIONS]
    assert len(set(texts)) == 80, 'a question is repeated'
    for number, (text, options, answer, note) in enumerate(QUESTIONS, 1):
        assert len(options) == 4 and len(set(options)) == 4, number
        assert answer in LETTERS and note.strip() and text.strip(), number
        for value in [text, note, *options]:
            assert not re.search(r"[A-Za-z]['`ʻʼ´][A-Za-z]", value), (number, value)
            assert not re.search(r'[oOgG]’[a-z]', value), (number, value)
    counts = {letter: sum(q[2] == letter for q in QUESTIONS) for letter in LETTERS}
    assert set(counts.values()) == {20}, counts


def fonts():
    for regular, bold in [
        (Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
        (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
    ]:
        if regular.is_file() and bold.is_file():
            pdfmetrics.registerFont(TTFont('OnaTili', str(regular)))
            pdfmetrics.registerFont(TTFont('OnaTiliBold', str(bold)))
            return regular.name
    raise RuntimeError('A Unicode Arial or DejaVu Sans regular/bold font pair is required.')


def make_pdf():
    ink = colors.HexColor('#10364A')
    muted = colors.HexColor('#435864')
    styles = {
        'title': ParagraphStyle('title', fontName='OnaTiliBold', fontSize=17, leading=21, textColor=ink, spaceAfter=4),
        'subtitle': ParagraphStyle('subtitle', fontName='OnaTili', fontSize=9.5, leading=13, textColor=muted, spaceAfter=5),
        'intro': ParagraphStyle('intro', fontName='OnaTili', fontSize=9, leading=12.5, spaceAfter=6),
        'name': ParagraphStyle('name', fontName='OnaTili', fontSize=9.5, leading=14, spaceAfter=4),
        'group': ParagraphStyle('group', fontName='OnaTiliBold', fontSize=11, leading=14, textColor=ink, spaceBefore=6, spaceAfter=4, keepWithNext=True),
        'question': ParagraphStyle('question', fontName='OnaTiliBold', fontSize=9, leading=11.3, spaceAfter=1.5),
        'option': ParagraphStyle('option', fontName='OnaTili', fontSize=9, leading=11.3, leftIndent=10),
        'keytitle': ParagraphStyle('keytitle', fontName='OnaTiliBold', fontSize=16, leading=20, textColor=ink, spaceAfter=8),
        'keygroup': ParagraphStyle('keygroup', fontName='OnaTiliBold', fontSize=8.5, leading=11, textColor=ink),
        'keycell': ParagraphStyle('keycell', fontName='OnaTili', fontSize=10, leading=13),
        'note': ParagraphStyle('note', fontName='OnaTili', fontSize=8.5, leading=12, textColor=muted, spaceBefore=10),
    }
    left = right = 42
    top, bottom = 40, 46
    gap = 18
    width, height = A4
    column = (width - left - right - gap) / 2
    head_height = 104
    stream = BytesIO()
    doc = BaseDocTemplate(stream, pagesize=A4, leftMargin=left, rightMargin=right, topMargin=top, bottomMargin=bottom,
                          title=TITLE, author='GPTBot.uz', subject='O‘zbek tili grammatikasi va imlosidan mashq testi',
                          creator='GPTBot.uz', invariant=1)

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor('#C9DFE6'))
        canvas.line(left, 34, width - right, 34)
        canvas.setFont('OnaTili', 8)
        canvas.setFillColor(muted)
        canvas.drawString(left, 22, STAMP)
        canvas.drawRightString(width - right, 22, str(canvas.getPageNumber()))
        canvas.restoreState()

    body_height = height - top - bottom
    first = PageTemplate(id='first', onPage=footer, frames=[
        Frame(left, height - top - head_height, width - left - right, head_height, id='head', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0),
        Frame(left, bottom, column, body_height - head_height, id='c1', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0),
        Frame(left + column + gap, bottom, column, body_height - head_height, id='c2', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0),
    ])
    later = PageTemplate(id='later', onPage=footer, frames=[
        Frame(left, bottom, column, body_height, id='l1', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0),
        Frame(left + column + gap, bottom, column, body_height, id='l2', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0),
    ])
    key = PageTemplate(id='key', onPage=footer, frames=[
        Frame(left, bottom, width - left - right, body_height, id='k', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0),
    ])
    doc.addPageTemplates([first, later, key])

    story = [Paragraph(escape(TITLE), styles['title']), Paragraph(escape(SUBTITLE), styles['subtitle']),
             Paragraph(escape(INTRO), styles['intro']), Paragraph(escape(NAME_LINE), styles['name']),
             NextPageTemplate('later'), FrameBreak()]
    for group in GROUPS:
        first_number, last_number = group['range']
        heading = Paragraph(escape(f'{group["title"]} ({first_number}–{last_number})'), styles['group'])
        for number, text, options, _answer, _note in group_questions(group):
            # The group heading travels with its first question, so it never ends a column alone.
            block = [heading] if number == first_number else []
            block.append(Paragraph(escape(f'{number}. {text}'), styles['question']))
            block += [Paragraph(escape(f'{LETTERS[i]}) {option}'), styles['option']) for i, option in enumerate(options)]
            block.append(Spacer(1, 5))
            story.append(KeepTogether(block))
    story += [NextPageTemplate('key'), PageBreak(), Paragraph(escape(KEY_TITLE), styles['keytitle'])]
    data = [[Paragraph(escape(f'{g["title"]} ({g["range"][0]}–{g["range"][1]})'), styles['keygroup']) for g in GROUPS]]
    for row in range(16):
        data.append([Paragraph(escape(f'{g["range"][0] + row} — {QUESTIONS[g["range"][0] + row - 1][2]}'), styles['keycell']) for g in GROUPS])
    grid = Table(data, colWidths=[(width - left - right) / 5] * 5, repeatRows=1)
    grid.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#9FB6C2')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EAF3F6')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story += [grid, Paragraph(escape(KEY_NOTE), styles['note'])]
    doc.build(story)
    return stream.getvalue()


def compact(text):
    return re.sub(r'\s+', '', text)


def validate(generated):
    checks = []

    def check(name, result):
        checks.append({'name': name, 'pass': bool(result)})
    pdf = PdfReader(TARGET)
    pages = [page.extract_text() or '' for page in pdf.pages]
    questions_text = compact('\n'.join(pages[:-1]))
    last = compact(pages[-1])
    check('A4 portrait, 4 to 8 pages, none blank',
          4 <= len(pdf.pages) <= 8 and all(len(text.strip()) > 80 for text in pages)
          and all(abs(float(p.mediabox.width) - A4[0]) < 1 and abs(float(p.mediabox.height) - A4[1]) < 1 for p in pdf.pages))
    check('all 80 questions with their four options before the key page',
          all(compact(f'{n}. {q[0]}') in questions_text and all(compact(f'{LETTERS[i]}) {o}') in questions_text for i, o in enumerate(q[1]))
              for n, q in enumerate(QUESTIONS, 1)))
    # A key entry reads «17 — C»: no page before the last one may carry such an entry.
    check('the answer key is on the last page only, complete',
          compact(KEY_TITLE) in last and not re.search(r'\d—[ABCD](?![a-z‘’])', questions_text)
          and all(re.search(rf'(?<!\d){n}—{q[2]}', last) for n, q in enumerate(QUESTIONS, 1)))
    check('not presented as official exam material', compact('rasmiy imtihon, BSB, ChSB yoki DTM materiali emas') in compact(pages[0]))
    text = '\n'.join(pages)
    check('Uzbek glyphs extract without replacements', '‘' in text and '’' in text and '\ufffd' not in text and '■' not in text)
    check('public author', pdf.metadata.author == 'GPTBot.uz')
    descriptors = []
    for page in pdf.pages:
        for font in page['/Resources']['/Font'].get_object().values():
            font = font.get_object()
            if '/FontDescriptor' in font:
                descriptors.append(font['/FontDescriptor'].get_object())
    check('Unicode fonts embedded', len(descriptors) >= 2 and all('/FontFile2' in font for font in descriptors))
    check('no external links or actions', '/OpenAction' not in pdf.trailer['/Root'] and all(not page.get('/Annots') for page in pdf.pages))
    check('no private paths', not re.search(rb'Borinio|[CF]:[\\/]', TARGET.read_bytes()))
    check('deterministic regeneration', TARGET.read_bytes() == generated)
    return {'file': TARGET.name, 'pages': len(pdf.pages), 'checks': checks,
            'sha256': hashlib.sha256(TARGET.read_bytes()).hexdigest(), 'bytes': TARGET.stat().st_size}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='validate the committed PDF without rewriting it')
    parser.add_argument('--blocks', action='store_true', help='print the page body blocks built from the question list')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    validate_questions()
    if args.blocks:
        print(json.dumps(body_blocks(), ensure_ascii=False, indent=2))
        return
    font = fonts()
    generated = make_pdf()
    if not args.check:
        DEST.mkdir(parents=True, exist_ok=True)
        TARGET.write_bytes(generated)
    result = validate(generated)
    failed = [check['name'] for check in result['checks'] if not check['pass']]
    report = {'status': 'FAIL' if failed else 'PASS', 'font': font, 'questions': len(QUESTIONS), **result, 'failed': failed}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: report[key] for key in ('status', 'font', 'questions', 'pages', 'bytes', 'sha256', 'failed')}, ensure_ascii=False))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
