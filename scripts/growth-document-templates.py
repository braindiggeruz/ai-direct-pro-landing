"""Build the three public Uzbek templates (DOCX + PDF), without user data.

Requires python-docx, reportlab and pypdf. The desktop bundled Python provides
these packages. Reproducible dates/ZIP entries keep generated assets reviewable.
Run with --check to validate the committed files without rewriting them.
"""
from datetime import datetime, timezone
from io import BytesIO
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile
import xml.etree.ElementTree as ET

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/downloads/growth-20261106'
REPORT = ROOT / 'reports/growth-content-20261106'
FIXED = datetime(2026, 11, 6, tzinfo=timezone.utc)
NOTE = 'Tahrirlash uchun namuna. Kvadrat qavsdagi joylarni to‘ldiring, mos kelmagan bandlarni o‘chiring.'
TEMPLATES = [
    {
        'slug': 'rezyume', 'title': 'REZYUME',
        'article': '/uz/blog/rezyume-tayyorlash/',
        'subtitle': '[ISM FAMILIYA] · [MO‘LJALLANGAN LAVOZIM]',
        'sections': [
            ('Aloqa', ['[Shahar] · [Telefon] · [E-mail]', '[Portfolio havolasi — bo‘lsa]']),
            ('Qisqacha ma’lumot', ['[Tajribangiz yoki o‘qish yo‘nalishingiz haqida 1–2 gap. Qaysi vazifani bajarishingiz va vakansiyaga mos ko‘nikmangizni yozing.]']),
            ('Ish tajribasi yoki o‘quv loyihalari', ['[Tashkilot yoki loyiha] · [Lavozim / vazifa]', '[Boshlangan oy, yil] — [Tugagan oy, yil yoki hozirgacha]', '• [Nima qildingiz? Vazifa va qo‘llagan usulingiz.]', '• [Tasdiqlay oladigan natija. Aniq raqam bo‘lmasa, uni o‘ylab topmang.]']),
            ('Ta’lim', ['[Ta’lim muassasasi] · [Yo‘nalish]', '[Boshlangan yil] — [Tugagan yil yoki hozirgacha]']),
            ('Ko‘nikmalar', ['[Vakansiyaga mos 3–5 ko‘nikma va ulardan foydalangan vazifalaringiz]']),
            ('Tillar', ['[Til — amaldagi darajangiz; sertifikat bo‘lsa, uning nomi va sanasi]']),
        ],
        'check': 'Yuborishdan oldin barcha qavslarni almashtiring. Telefon va e-mailni faqat o‘z qurilmangizdagi faylga kiriting; ularni AI chatga yubormang. O‘zingizda yo‘q tajriba yoki sertifikatni qo‘shmang.',
    },
    {
        'slug': 'hamkorga-sorov-xati', 'title': 'HAMKORGA SO‘ROV XATI',
        'article': '/uz/blog/rasmiy-xat-yozish/',
        'subtitle': 'Mahsulot yoki xizmat haqida ma’lumot so‘rash uchun namuna',
        'sections': [
            ('Yuboruvchi va oluvchi', ['[Yuboruvchi tashkilot nomi]', '[Oluvchi tashkilot nomi yoki mas’ul shaxsning lavozimi]', 'Sana: [kun.oy.yil] · Xat raqami: [tashkilotingizda qo‘llansa]']),
            ('Mavzu: [mahsulot yoki xizmat] bo‘yicha ma’lumot so‘rovi', ['Hurmatli hamkor!', 'Quyidagi mahsulot yoki xizmat bo‘yicha ma’lumot yuborishingizni so‘raymiz: [nomi, miqdori yoki ish hajmi, zarur xususiyatlari].', 'Taklifingizda quyidagi ma’lumotlarni ko‘rsatishingizni so‘raymiz:', '• Narx va narxga nimalar kirishi;', '• Yetkazib berish yoki ishni bajarish muddati;', '• To‘lov shartlari va taklifning amal qilish muddati.', 'Javobni [sana]gacha [aloqa kanali] orqali yuborishingizni so‘raymiz.', 'Qo‘shimcha savollar bo‘lsa, [mas’ul shaxsning lavozimi va aloqa kanali] orqali bog‘lanishingiz mumkin.', 'E’tiboringiz uchun rahmat.']),
            ('Imzo', ['Hurmat bilan,', '[Lavozim] · [Ism Familiya] · [Imzo]', 'Ilova: [agar bo‘lsa, hujjat nomi va hajmi]']),
        ],
        'check': 'Bu tasdiqlangan rasmiy blanka emas. Matnni tashkilotingiz talablariga moslang; sana, hajm va rekvizitlarni yuborishdan oldin o‘zingiz tekshiring.',
    },
    {
        'slug': 'amaliyotchi-tavsifnoma', 'title': 'TAVSIFNOMA',
        'article': '/uz/blog/tavsifnoma-namuna/',
        'subtitle': 'Amaliyotchi talaba uchun tahrirlanadigan tuzilma namunasi',
        'sections': [
            ('Kim haqida', ['[Talabaning ismi va familiyasi], [ta’lim muassasasi, yo‘nalish, kurs].']),
            ('Amaliyot joyi va muddati', ['[Talabaning ismi va familiyasi] [boshlanish sanasi]dan [tugash sanasi]gacha [tashkilot va bo‘lim nomi]da amaliyot o‘tagan.']),
            ('Bajarilgan vazifalar', ['• [Rahbar kuzatgan vazifa yoki ish turi]', '• [Tayyorlangan hujjat, loyiha yoki boshqa natija]', '• [Qo‘llangan vosita yoki o‘rganilgan ko‘nikma]']),
            ('Rahbarning kuzatuvi', ['[Vazifalarni bajarish, muddatlarga rioya qilish va jamoa bilan ishlash haqida rahbar tasdiqlay oladigan 2–3 gap. Zarur bo‘lsa, rivojlantirish kerak bo‘lgan jihatni ham yozing.]']),
            ('Taqdim etish joyi', ['Tavsifnoma [qaysi ta’lim muassasasi yoki tashkilotga] taqdim etish uchun berildi.']),
            ('Tasdiqlash', ['Amaliyot rahbari: [lavozim, Ism Familiya]', 'Sana: [kun.oy.yil] · Imzo: [imzo]']),
        ],
        'check': 'Bu tasdiqlangan rasmiy shakl emas. Yakuniy matnni imzolovchi rahbar tekshirishi kerak. Faqat kuzatilgan faktlarni kiriting; tayyor namunadagi gapni dalilsiz qoldirmang.',
    },
]

def clean_zip(data):
    result = BytesIO()
    with zipfile.ZipFile(BytesIO(data)) as src, zipfile.ZipFile(result, 'w', zipfile.ZIP_DEFLATED) as dst:
        for name in sorted(src.namelist()):
            info = zipfile.ZipInfo(name, (2026, 11, 6, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 0
            dst.writestr(info, src.read(name))
    return result.getvalue()

def make_docx(item):
    doc = Document()
    props = doc.core_properties
    props.author = props.last_modified_by = 'GPTBot.uz'
    props.title = item['title']
    props.subject = 'O‘zbek tilida tahrirlanadigan namuna'
    props.comments = 'Static template; no personal information.'
    props.created = props.modified = FIXED
    props.revision = 1
    props.language = 'uz-Latn'
    section = doc.sections[0]
    section.page_width, section.page_height = Mm(210), Mm(297)
    section.top_margin, section.bottom_margin = Mm(16), Mm(16)
    section.left_margin = section.right_margin = Mm(20)
    style = doc.styles['Normal']
    style.font.name, style.font.size = 'Arial', Pt(10)
    style.paragraph_format.space_after = Pt(5)
    style.paragraph_format.line_spacing = 1.08
    lang = OxmlElement('w:lang'); lang.set(qn('w:val'), 'uz-Latn')
    style.element.get_or_add_rPr().append(lang)
    for name, size in [('Title', 22), ('Heading 1', 11)]:
        doc.styles[name].font.name = 'Arial'
        doc.styles[name].font.size = Pt(size)
        doc.styles[name].font.color.rgb = RGBColor.from_string('10364A')
    doc.add_paragraph(item['title'], 'Title')
    doc.add_paragraph(item['subtitle'])
    note = doc.add_paragraph(NOTE)
    note.runs[0].font.size = Pt(8)
    note.runs[0].font.color.rgb = RGBColor.from_string('526674')
    for title, paragraphs in item['sections']:
        doc.add_paragraph(title, 'Heading 1')
        for text in paragraphs: doc.add_paragraph(text)
    check = doc.add_paragraph(item['check'])
    check.runs[0].font.size = Pt(8)
    check.runs[0].italic = True
    footer = section.footer.paragraphs[0]
    run = footer.add_run('GPTBot.uz · Namuna · 06.11.2026')
    run.font.name, run.font.size = 'Arial', Pt(8)
    run.font.color.rgb = RGBColor.from_string('526674')
    stream = BytesIO(); doc.save(stream)
    return clean_zip(stream.getvalue())

def fonts():
    candidates = [
        (Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
        (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
    ]
    for regular, bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont('Template', str(regular)))
            pdfmetrics.registerFont(TTFont('TemplateBold', str(bold)))
            return
    raise RuntimeError('A Unicode TTF pair (Arial or DejaVu Sans) is required.')

def make_pdf(item):
    fonts()
    styles = {
        'title': ParagraphStyle('title', fontName='TemplateBold', fontSize=21, leading=25, textColor=colors.HexColor('#10364A'), spaceAfter=7),
        'body': ParagraphStyle('body', fontName='Template', fontSize=10, leading=14, spaceAfter=5, alignment=TA_LEFT),
        'heading': ParagraphStyle('heading', fontName='TemplateBold', fontSize=10.5, leading=14, spaceBefore=9, spaceAfter=5, textColor=colors.HexColor('#10364A'), keepWithNext=True),
        'note': ParagraphStyle('note', fontName='Template', fontSize=8, leading=11, textColor=colors.HexColor('#526674'), spaceAfter=6),
    }
    stream = BytesIO()
    doc = SimpleDocTemplate(stream, pagesize=A4, leftMargin=56, rightMargin=56, topMargin=43, bottomMargin=47, title=item['title'], author='GPTBot.uz', subject='O‘zbek tilida namuna', creator='GPTBot.uz', invariant=1)
    story = [Paragraph(escape(item['title']), styles['title']), Paragraph(escape(item['subtitle']), styles['body']), Paragraph(escape(NOTE), styles['note'])]
    for title, paragraphs in item['sections']:
        story.append(Paragraph(escape(title), styles['heading']))
        story.extend(Paragraph(escape(p), styles['body']) for p in paragraphs)
    story += [Spacer(1, 8), Paragraph(escape(item['check']), styles['note'])]
    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor('#C9DFE6')); canvas.line(56, 38, A4[0]-56, 38)
        canvas.setFont('Template', 8); canvas.setFillColor(colors.HexColor('#526674'))
        canvas.drawString(56, 25, 'GPTBot.uz · Namuna · 06.11.2026')
        canvas.drawRightString(A4[0]-56, 25, str(canvas.getPageNumber()))
        canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return stream.getvalue()

def validate(item):
    checks = []
    def check(name, ok): checks.append({'name': name, 'pass': bool(ok)})
    docx_path = DEST / (item['slug']+'.docx')
    pdf_path = DEST / (item['slug']+'.pdf')
    with zipfile.ZipFile(docx_path) as z:
        check('DOCX archive CRC', z.testzip() is None)
        for name in z.namelist():
            if name.endswith(('.xml','.rels')): ET.fromstring(z.read(name))
        xml = z.read('word/document.xml').decode('utf-8')
        core = z.read('docProps/core.xml').decode('utf-8')
        check('DOCX author is GPTBot.uz', '<dc:creator>GPTBot.uz</dc:creator>' in core and '<cp:lastModifiedBy>GPTBot.uz</cp:lastModifiedBy>' in core)
        check('No computer paths or personal author', not re.search(r'Borinio|C:\\|F:\\', ''.join(z.read(n).decode('utf-8') for n in z.namelist() if n.endswith(('.xml','.rels')))))
        check('DOCX has editable body, placeholders and Uzbek glyphs', '<w:t>' in xml and '[' in xml and '‘' in xml)
        check('No external document relationships', not any(b'TargetMode="External"' in z.read(n) for n in z.namelist() if n.endswith('.rels')))
    pdf = PdfReader(pdf_path)
    text = '\n'.join(page.extract_text() or '' for page in pdf.pages)
    check('PDF one printable page', len(pdf.pages)==1)
    check('PDF title and all sections extract', item['title'] in text and all(title in text for title,_ in item['sections']))
    check('PDF no replacement glyph', '\ufffd' not in text and '■' not in text and '‘' in text)
    check('PDF author', pdf.metadata.author=='GPTBot.uz')
    descriptors=[]
    for page in pdf.pages:
        for font in page['/Resources']['/Font'].get_object().values():
            font = font.get_object()
            if '/FontDescriptor' in font: descriptors.append(font['/FontDescriptor'].get_object())
    check('Unicode TTF fonts embedded', len(descriptors)>=2 and all('/FontFile2' in f for f in descriptors))
    return {'slug':item['slug'], 'checks': checks, 'sha256': {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (docx_path,pdf_path)}, 'pages':len(pdf.pages)}

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--check', action='store_true'); args=parser.parse_args()
    if not args.check:
        DEST.mkdir(parents=True, exist_ok=True)
        for item in TEMPLATES:
            (DEST/(item['slug']+'.docx')).write_bytes(make_docx(item))
            (DEST/(item['slug']+'.pdf')).write_bytes(make_pdf(item))
    results=[validate(item) for item in TEMPLATES]
    failed=[(r['slug'],c['name']) for r in results for c in r['checks'] if not c['pass']]
    REPORT.mkdir(parents=True, exist_ok=True)
    (REPORT/'document-qa.json').write_text(json.dumps({'status':'PASS' if not failed else 'FAIL','templates':results,'failed':failed},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'templates':len(results),'checks':sum(len(r['checks']) for r in results),'failed':failed},ensure_ascii=False))
    if failed: raise SystemExit(1)

if __name__=='__main__': main()
