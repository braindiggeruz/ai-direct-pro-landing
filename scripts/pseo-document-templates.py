"""Build ten original Uzbek document kits from the public editorial dataset.

Each kit includes an editable blank and a separately labelled fictional example.
No user input, network, macros, real people or actual signatures are included.
Uses the document libraries and font strategy of growth-document-templates.py,
without changing the existing six downloads. Requires python-docx, reportlab,
and pypdf (available in the desktop bundled Python).

--check validates existing assets and checks deterministic regeneration in the
same font environment; it never rewrites downloads. Optional --report saves QA.
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
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'content/pseo/documents-20261108.json'
DEST = ROOT / 'public/downloads/pseo-20261108'
FIXED = datetime(2026, 11, 8, tzinfo=timezone.utc)
NOTE = 'Tahrirlanadigan qism. Kvadrat qavslarni o‘z ma’lumotingiz bilan almashtiring; keraksiz bandlarni o‘chiring. Qabul qiluvchi bergan shakl bo‘lsa, o‘sha shakldan foydalaning.'
EXAMPLE = 'TO‘LDIRILGAN O‘QUV MISOLI'
EXAMPLE_NOTE = 'Quyidagi matn tuzilmani ko‘rsatish uchun yozilgan. Undagi odamlar, tashkilotlar va voqealar to‘qima. Uni haqiqiy hujjat sifatida topshirmang.'
SLUGS = {
    'tarjimai-hol-namuna', 'bayonnoma-namuna', 'dalolatnoma-namuna',
    'tavsiyanoma-namuna', 'amaliyot-kundaligi-namuna',
    'amaliyot-hisoboti-namuna', 'obyektivka-namuna',
    'bildirishnoma-namuna', 'javob-xati-namuna', 'motivatsion-xat-namuna',
}


def load_items():
    items = json.loads(DATA.read_text(encoding='utf-8'))
    if len(items) != 10 or {item['slug'] for item in items} != SLUGS:
        raise ValueError('The dataset must contain the ten approved document slugs exactly once.')
    for item in items:
        if item['article'] != '/uz/blog/' + item['slug'] + '/':
            raise ValueError('Unexpected document article URL: ' + item['slug'])
        if not item['sections'] or not item['preview']:
            raise ValueError('Both editable sections and a complete example are required.')
        if not all(section['heading'] and section['lines'] for section in item['sections']):
            raise ValueError('Empty editable section: ' + item['slug'])
    return items


def clean_zip(data):
    result = BytesIO()
    with zipfile.ZipFile(BytesIO(data)) as source, zipfile.ZipFile(result, 'w') as target:
        for name in sorted(source.namelist()):
            info = zipfile.ZipInfo(name, (2026, 11, 8, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 0
            target.writestr(info, source.read(name))
    return result.getvalue()


def make_docx(item):
    doc = Document()
    props = doc.core_properties
    props.author = props.last_modified_by = 'GPTBot.uz'
    props.title, props.subject = item['title'], 'O‘zbekcha blanka va to‘qima o‘quv misoli'
    props.comments = 'Original static educational template. Fictional examples. No personal information.'
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
    doc.add_paragraph(item['check'])
    doc.add_page_break()
    doc.add_paragraph(EXAMPLE, 'Title')
    doc.add_paragraph(EXAMPLE_NOTE)
    for line in item['preview']:
        doc.add_paragraph(line)
    footer = section.footer.paragraphs[0]
    footer.add_run('GPTBot.uz · O‘quv namunasi · 08.11.2026').font.size = Pt(8)
    stream = BytesIO()
    doc.save(stream)
    return clean_zip(stream.getvalue())


def fonts():
    for regular, bold in [
        (Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
        (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
    ]:
        if regular.is_file() and bold.is_file():
            pdfmetrics.registerFont(TTFont('PseoDocument', str(regular)))
            pdfmetrics.registerFont(TTFont('PseoDocumentBold', str(bold)))
            return regular.name
    raise RuntimeError('A Unicode Arial or DejaVu Sans regular/bold font pair is required.')


def make_pdf(item):
    styles = {
        'title': ParagraphStyle('title', fontName='PseoDocumentBold', fontSize=20, leading=25, textColor=colors.HexColor('#10364A'), spaceAfter=9),
        'body': ParagraphStyle('body', fontName='PseoDocument', fontSize=10, leading=14, spaceAfter=6),
        'heading': ParagraphStyle('heading', fontName='PseoDocumentBold', fontSize=11, leading=15, spaceBefore=9, spaceAfter=5, textColor=colors.HexColor('#10364A'), keepWithNext=True),
        'note': ParagraphStyle('note', fontName='PseoDocument', fontSize=8.5, leading=12, textColor=colors.HexColor('#435864'), spaceAfter=8),
    }
    stream = BytesIO()
    doc = SimpleDocTemplate(stream, pagesize=A4, leftMargin=56, rightMargin=56,
                            topMargin=45, bottomMargin=48, title=item['title'],
                            author='GPTBot.uz', subject='O‘zbekcha blanka va to‘qima o‘quv misoli',
                            creator='GPTBot.uz', invariant=1)
    story = [Paragraph(escape(item['title']), styles['title']),
             Paragraph(escape(item['subtitle']), styles['body']),
             Paragraph(escape(NOTE), styles['note'])]
    for block in item['sections']:
        story.append(Paragraph(escape(block['heading']), styles['heading']))
        story.extend(Paragraph(escape(line), styles['body']) for line in block['lines'])
    story += [Spacer(1, 8), Paragraph(escape(item['check']), styles['note']), PageBreak(),
              Paragraph(escape(EXAMPLE), styles['title']), Paragraph(escape(EXAMPLE_NOTE), styles['note'])]
    story.extend(Paragraph(escape(line), styles['body']) for line in item['preview'])

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor('#C9DFE6'))
        canvas.line(56, 38, A4[0] - 56, 38)
        canvas.setFont('PseoDocument', 8)
        canvas.setFillColor(colors.HexColor('#435864'))
        canvas.drawString(56, 25, 'GPTBot.uz · O‘quv namunasi · 08.11.2026')
        canvas.drawRightString(A4[0] - 56, 25, str(canvas.getPageNumber()))
        canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return stream.getvalue()


def compact(text):
    return re.sub(r'\s+', '', text)


def expected_text(item):
    return [item['title'], item['subtitle'], NOTE, item['check'], EXAMPLE, EXAMPLE_NOTE] + [
        text for section in item['sections'] for text in [section['heading'], *section['lines']]
    ] + item['preview']


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
    check('PDF printable A4 two to four pages without blank pages', 2 <= len(pdf.pages) <= 4 and all(len(text.strip()) > 100 for text in page_texts) and all(abs(float(page.mediabox.width) - A4[0]) < 1 and abs(float(page.mediabox.height) - A4[1]) < 1 for page in pdf.pages))
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
    return {'slug': item['slug'], 'pages': len(pdf.pages), 'checks': checks,
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
    print(json.dumps({'status': report['status'], 'templates': len(results), 'checks': sum(len(result['checks']) for result in results), 'failed': failed}, ensure_ascii=False))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
