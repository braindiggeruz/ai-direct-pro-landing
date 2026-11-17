"""Build the printable 2027 calendar of /uz/kalendar-2027/ and check the page tables.

Output: public/downloads/docs-20261117/kalendar-2027.pdf, A4, five pages:
page 1 is the whole year on one sheet, pages 2-5 are the four quarters with
large cells. Every date, weekday and ISO week number comes from Python's
calendar and datetime modules; nothing is typed by hand.

Holidays: the seven fixed dates of Article 208 of the Labour Code of the
Republic of Uzbekistan (lex.uz/docs/-6257288, read on 2026-11-17). The first
days of Ramazon hayiti and Qurbon hayiti are holidays too, but their 2027 dates
and the 2027 decree on additional days off were not published on that day, so
the calendar gives no date for them and says so. When they are published, add
them to MOVABLE_HOLIDAYS / EXTRA_DAYS_OFF below, rebuild and update the page.

Article 208 also moves a day off that coincides with a holiday to the working
day after it; for a five-day week with Saturday and Sunday off this is computed
here (22 March and 10 May 2027) and shown apart from the holidays.

Same font strategy and determinism as docs-document-templates-20261116.py
(Arial or DejaVu Sans, reportlab invariant mode). Requires reportlab and pypdf.

  python scripts/calendar-2027.py            build the PDF
  python scripts/calendar-2027.py --check    validate the committed PDF and, if
                                             present, the tables of the page
  python scripts/calendar-2027.py --blocks   print the page tables as JSON
"""
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape
import argparse
import calendar
import hashlib
import json
import sys

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/downloads/docs-20261117/kalendar-2027.pdf'
PAGE = ROOT / 'content/pages/uz/kalendar-2027.json'
YEAR = 2027
AS_OF = '2026-yil 17-noyabr'
STAMP = f'GPTBot.uz · gptbot.uz/uz/kalendar-2027/ · {AS_OF} holatiga ko‘ra'

MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
          'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr']
WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']
WEEKDAY_NAMES = ['dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba', 'yakshanba']
QUARTERS = ['I chorak: yanvar – mart', 'II chorak: aprel – iyun',
            'III chorak: iyul – sentabr', 'IV chorak: oktabr – dekabr']

# Labour Code, Article 208: the holidays with a fixed date.
FIXED_HOLIDAYS = [
    (1, 1, 'Yangi yil'),
    (3, 8, 'Xotin-qizlar kuni'),
    (3, 21, 'Navro‘z bayrami'),
    (5, 9, 'Xotira va qadrlash kuni'),
    (9, 1, 'Mustaqillik kuni'),
    (10, 1, 'O‘qituvchi va murabbiylar kuni'),
    (12, 8, 'O‘zbekiston Respublikasi Konstitutsiyasi kuni'),
]
# Article 208 again: the first day of each. No 2027 date until the official act is published.
UNDATED_HOLIDAYS = ['Ramazon hayiti (Ro‘za hayit) — birinchi kuni', 'Qurbon hayiti — birinchi kuni']
UNDATED_NOTE = ('Ramazon hayiti (Ro‘za hayit) va Qurbon hayitining birinchi kunlari ham ishlanmaydigan bayram kunlari; '
                f'{YEAR}-yildagi sanalari hali e’lon qilinmagan.')
MOVABLE_HOLIDAYS = []   # (month, day, name) once the President's resolution is published
EXTRA_DAYS_OFF = []     # (month, day) once the 2027 decree on additional days off is published

CAL = calendar.Calendar(firstweekday=calendar.MONDAY)
INK = colors.HexColor('#10364A')
GREY = colors.HexColor('#435864')
LINE = colors.HexColor('#9FB6C2')
SHADE = colors.HexColor('#EAF3F6')
WIDTH, HEIGHT = A4
MARGIN = 34


def holidays():
    return {date(YEAR, m, d): name for m, d, name in FIXED_HOLIDAYS + MOVABLE_HOLIDAYS}


def moved_days_off():
    """Article 208, part two, for a five-day week with Saturday and Sunday off."""
    days, moved = holidays(), {}
    for day in sorted(days):
        if day.weekday() < 5:
            continue
        target = day + timedelta(days=1)
        while target.weekday() >= 5 or target in days or target in moved:
            target += timedelta(days=1)
        moved[target] = day
    return moved


def month_weeks(month):
    """[(ISO week number, [seven dates, Monday first])] for the month's grid."""
    return [(week[0].isocalendar()[1], week) for week in CAL.monthdatescalendar(YEAR, month)]


def working_days(month):
    """Monday-Friday days, then without holidays, then without the moved days off as well."""
    days, moved = holidays(), moved_days_off()
    extra = {date(YEAR, m, d) for m, d in EXTRA_DAYS_OFF}
    in_month = [date(YEAR, month, d) for d in range(1, calendar.monthrange(YEAR, month)[1] + 1)]
    weekdays = [d for d in in_month if d.weekday() < 5]
    on_weekday = [d for d in weekdays if d in days]
    base = len(weekdays) - len(on_weekday)
    with_moved = base - len([d for d in weekdays if (d in moved or d in extra) and d not in days])
    return {'weekdays': len(weekdays), 'holidays': on_weekday, 'base': base, 'moved': with_moved}


def day_label(day):
    return f'{day.day}-{MONTHS[day.month - 1].lower()}'


def self_test():
    assert date(YEAR, 1, 1).weekday() == 4, '1 January 2027 must be a Friday'
    assert sum(calendar.monthrange(YEAR, m)[1] for m in range(1, 13)) == 365
    for month in range(1, 13):
        seen = [d.day for _, week in month_weeks(month) for d in week if d.month == month]
        assert seen == list(range(1, calendar.monthrange(YEAR, month)[1] + 1)), month
        assert all(len(week) == 7 and week[0].weekday() == 0 for _, week in month_weeks(month))
    assert [n for n, _ in month_weeks(1)][:2] == [53, 1] and month_weeks(12)[-1][0] == 52
    assert sum(working_days(m)['weekdays'] for m in range(1, 13)) == 261
    assert all(d.year == YEAR for d in moved_days_off())


# ── The page tables (content/pages/uz/kalendar-2027.json) ───────────────────

def page_tables():
    days, moved = holidays(), moved_days_off()
    months = []
    for month in range(1, 13):
        rows = []
        for number, week in month_weeks(month):
            cells = []
            for day in week:
                if day.month != month:
                    cells.append('')
                else:
                    cells.append(f'{day.day}' + ('*' if day in days else '**' if day in moved else ''))
            rows.append(cells + [str(number)])
        months.append({'id': MONTHS[month - 1].lower(), 'name': f'{MONTHS[month - 1]} {YEAR}',
                       'table': {'type': 'table', 'headers': WEEKDAYS + ['Hafta'], 'rows': rows}})
    holiday_rows = [[day_label(day), WEEKDAY_NAMES[day.weekday()], name] for day, name in sorted(days.items())]
    holiday_rows += [['Sana e’lon qilinmagan', '—', name] for name in UNDATED_HOLIDAYS if not MOVABLE_HOLIDAYS]
    work_rows, totals = [], [0, 0, 0, 0]
    for month in range(1, 13):
        w = working_days(month)
        work_rows.append([MONTHS[month - 1], str(w['weekdays']),
                          ', '.join(day_label(d) for d in w['holidays']) or '—', str(w['base']), str(w['moved'])])
        totals = [totals[0] + w['weekdays'], totals[1] + len(w['holidays']), totals[2] + w['base'], totals[3] + w['moved']]
    work_rows.append(['Jami', str(totals[0]), f'{totals[1]} kun', str(totals[2]), str(totals[3])])
    return {
        'months': months,
        'holidays': {'type': 'table', 'headers': ['Sana', 'Hafta kuni', 'Bayram'], 'rows': holiday_rows},
        'workingDays': {'type': 'table',
                        'headers': ['Oy', 'Du–Ju kunlari', 'Ish kuniga tushgan bayram', 'Ish kunlari', 'Ko‘chirish bilan'],
                        'rows': work_rows},
        'movedDaysOff': [[day_label(target), WEEKDAY_NAMES[target.weekday()], day_label(source)]
                         for target, source in sorted(moved_days_off().items())],
    }


def check_page():
    """Compare the tables written in the page with the generated ones."""
    if not PAGE.is_file():
        return None
    blocks = json.loads(PAGE.read_text(encoding='utf-8'))['bodyBlocks']
    tables, failed = page_tables(), []
    for month in tables['months']:
        at = next((i for i, b in enumerate(blocks) if b.get('type') == 'h3' and b.get('id') == month['id']), None)
        if at is None or blocks[at].get('text') != month['name'] or blocks[at + 1] != month['table']:
            failed.append('month table: ' + month['id'])
    for key in ('holidays', 'workingDays'):
        if tables[key] not in blocks:
            failed.append('table: ' + key)
    return failed


# ── The PDF ─────────────────────────────────────────────────────────────────

def fonts():
    for regular, bold in [
        (Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
        (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
    ]:
        if regular.is_file() and bold.is_file():
            pdfmetrics.registerFont(TTFont('Calendar', str(regular)))
            pdfmetrics.registerFont(TTFont('CalendarBold', str(bold)))
            return regular.name
    raise RuntimeError('A Unicode Arial or DejaVu Sans regular/bold font pair is required.')


NOTE = ParagraphStyle('note', fontName='Calendar', fontSize=8.5, leading=11.5, textColor=GREY)
BODY = ParagraphStyle('body', fontName='Calendar', fontSize=9, leading=12.5, textColor=INK)


def paragraph(c, text, style, x, top, width):
    """Draw a wrapped paragraph whose top edge is at `top`; return the y under it."""
    flow = Paragraph(escape(text), style)
    _, height = flow.wrap(width, HEIGHT)
    flow.drawOn(c, x, top - height)
    return top - height


def footer(c):
    c.setStrokeColor(colors.HexColor('#C9DFE6'))
    c.setLineWidth(0.6)
    c.line(MARGIN, 36, WIDTH - MARGIN, 36)
    c.setFont('Calendar', 8)
    c.setFillColor(GREY)
    c.drawString(MARGIN, 24, STAMP)
    c.drawRightString(WIDTH - MARGIN, 24, str(c.getPageNumber()))


def day_mark(c, x, y, w, h, kind):
    """The box behind a number: a filled one for a holiday, an outline for a moved day off."""
    c.setLineWidth(0.9)
    c.setStrokeColor(INK)
    c.setFillColor(INK)
    c.roundRect(x, y, w, h, 2.2, stroke=1, fill=1 if kind == 'holiday' else 0)


def month_grid(c, x, top, width, month, *, big):
    """One month: the name, the weekday header and its four to six week rows. Returns the y under the last row."""
    days, moved = holidays(), moved_days_off()
    week_w = 34 if big else 17
    cell = (width - week_w) / 7
    name_h, head_h, row_h = (22, 16, 24) if big else (16, 12, 14.5)
    size, small = (12.5, 8) if big else (9, 6.5)
    weeks = month_weeks(month)

    c.setFillColor(INK)
    c.setFont('CalendarBold', 14 if big else 11)
    c.drawString(x + (0 if big else week_w + 2), top - (15 if big else 11.5), MONTHS[month - 1])
    if big:
        w = working_days(month)
        label = f'Ish kunlari (dastlabki): {w["base"]}'
        if w['moved'] != w['base']:
            label += f'; ko‘chirish bilan — {w["moved"]}'
        c.setFont('Calendar', 9)
        c.setFillColor(GREY)
        c.drawRightString(x + width, top - 15, label)

    head = top - name_h
    body = head - head_h
    c.setFillColor(SHADE)
    c.rect(x + week_w + 5 * cell, body - row_h * len(weeks), 2 * cell, row_h * len(weeks), stroke=0, fill=1)
    c.setFont('Calendar', small)
    c.setFillColor(GREY)
    c.drawCentredString(x + week_w / 2, head - head_h + (5 if big else 3.5), 'Hafta' if big else 'H')
    for i, short in enumerate(WEEKDAYS):
        text = WEEKDAY_NAMES[i].capitalize() if big else short
        c.setFont('CalendarBold' if i >= 5 else 'Calendar', small)
        c.setFillColor(INK if i >= 5 else GREY)
        c.drawCentredString(x + week_w + cell * (i + 0.5), head - head_h + (5 if big else 3.5), text)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(x, body, x + width, body)

    for row, (number, week) in enumerate(weeks):
        bottom = body - row_h * (row + 1)
        if big:
            c.setStrokeColor(LINE)
            c.setLineWidth(0.4)
            c.line(x, bottom, x + width, bottom)
        c.setFont('Calendar', small)
        c.setFillColor(GREY)
        c.drawCentredString(x + week_w / 2, bottom + (row_h - small) / 2 + 1, str(number))
        for i, day in enumerate(week):
            if day.month != month:
                continue
            centre = x + week_w + cell * (i + 0.5)
            kind = 'holiday' if day in days else 'moved' if day in moved else None
            if kind:
                box_w, box_h = (30, 17) if big else (15, 11.5)
                day_mark(c, centre - box_w / 2, bottom + (row_h - box_h) / 2, box_w, box_h, kind)
            c.setFont('CalendarBold' if kind or i >= 5 else 'Calendar', size)
            c.setFillColor(colors.white if kind == 'holiday' else INK)
            c.drawCentredString(centre, bottom + (row_h - size) / 2 + size * 0.14, str(day.day))
    return body - row_h * len(weeks)


def month_note(month):
    days = [(d, n) for d, n in sorted(holidays().items()) if d.month == month]
    moved = [d for d in sorted(moved_days_off()) if d.month == month]
    if not days:
        return 'Aniq sanali bayram yo‘q.'
    text = ('Bayram: ' if len(days) == 1 else 'Bayramlar: ') + '; '.join(
        f'{day_label(d)} ({WEEKDAY_NAMES[d.weekday()]}) — {n}' for d, n in days) + '.'
    if moved:
        text += ' Ko‘chiriladigan dam olish kuni: ' + ', '.join(
            f'{day_label(d)} ({WEEKDAY_NAMES[d.weekday()]})' for d in moved) + '.'
    return text


def year_page(c):
    inner = WIDTH - 2 * MARGIN
    c.setFillColor(INK)
    c.setFont('CalendarBold', 22)
    c.drawString(MARGIN, HEIGHT - 52, f'{YEAR}-yil kalendari')
    c.setFont('Calendar', 9.5)
    c.setFillColor(GREY)
    c.drawRightString(WIDTH - MARGIN, HEIGHT - 50, 'O‘zbekiston: ishlanmaydigan bayram kunlari va hafta raqamlari')
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(MARGIN, HEIGHT - 62, WIDTH - MARGIN, HEIGHT - 62)

    gap = 16
    col = (inner - 2 * gap) / 3
    top = HEIGHT - 74
    for index in range(12):
        row, column = divmod(index, 3)
        month_grid(c, MARGIN + column * (col + gap), top - row * 126, col, index + 1, big=False)

    y = top - 4 * 126 - 2
    c.setStrokeColor(LINE)
    c.line(MARGIN, y, WIDTH - MARGIN, y)
    y -= 16
    x = MARGIN
    for kind, text in [('holiday', 'bayram kuni'), ('moved', 'ko‘chiriladigan dam olish kuni'),
                       ('shade', 'shanba va yakshanba')]:
        if kind == 'shade':
            c.setFillColor(SHADE)
            c.rect(x, y - 2, 15, 11.5, stroke=0, fill=1)
        else:
            day_mark(c, x, y - 2, 15, 11.5, kind)
        c.setFont('Calendar', 8.5)
        c.setFillColor(INK)
        c.drawString(x + 20, y + 1, text)
        x += 20 + pdfmetrics.stringWidth(text, 'Calendar', 8.5) + 18
    c.drawString(x, y + 1, 'H — hafta raqami (ISO 8601)')

    y -= 20
    c.setFont('CalendarBold', 9.5)
    c.setFillColor(INK)
    c.drawString(MARGIN, y, 'Ishlanmaydigan bayram kunlari — Mehnat kodeksining 208-moddasi')
    lines = [f'{day_label(d)}, {WEEKDAY_NAMES[d.weekday()]} — {n}' for d, n in sorted(holidays().items())]
    half = (len(lines) + 1) // 2
    second = max(pdfmetrics.stringWidth(line, 'Calendar', 8.8) for line in lines[:half]) + 22
    if second + max(pdfmetrics.stringWidth(line, 'Calendar', 8.8) for line in lines[half:]) > inner:
        raise ValueError('The holiday list does not fit two columns.')
    c.setFont('Calendar', 8.8)
    for i, line in enumerate(lines):
        column, row = divmod(i, half)
        c.drawString(MARGIN + column * second, y - 14 - row * 12.5, line)
    y -= 14 + half * 12.5 + 1

    if not MOVABLE_HOLIDAYS:
        y = paragraph(c, UNDATED_NOTE, NOTE, MARGIN, y, inner) - 4
    moved = moved_days_off()
    if moved:
        sources = ' va '.join(day_label(d) for d in sorted(moved.values()))
        targets = ' va '.join(day_label(d) for d in sorted(moved))
        falls = 'yakshanbaga' if all(d.weekday() == 6 for d in moved.values()) else 'dam olish kuniga'
        y = paragraph(c, f'{sources} {falls} to‘g‘ri keladi. Mehnat kodeksining 208-moddasiga ko‘ra dam olish kuni '
                         f'bayramdan keyingi ish kuniga — {targets}ga ko‘chiriladi. To‘xtatib bo‘lmaydigan ishlarda '
                         '(uzluksiz ishlab chiqarish, navbatchilik va boshqalar) dam olish kuni ko‘chirilmaydi.',
                      NOTE, MARGIN, y, inner) - 4
    if not MOVABLE_HOLIDAYS and not EXTRA_DAYS_OFF:
        y = paragraph(c, 'Hayit sanalari Prezident qarori bilan, qo‘shimcha dam olish kunlari va ko‘chirishlar Prezident '
                         f'farmoni bilan e’lon qilinadi. {AS_OF} holatiga ko‘ra {YEAR}-yil uchun bunday hujjatlar e’lon '
                         'qilinmagan, shuning uchun ular kalendarda yo‘q. Yangilangan kalendar: gptbot.uz/uz/kalendar-2027/',
                      NOTE, MARGIN, y, inner)
    if y < 44:
        raise ValueError('The notes of the year page run into the footer.')
    footer(c)


def quarter_page(c, quarter):
    inner = WIDTH - 2 * MARGIN
    c.setFillColor(INK)
    c.setFont('CalendarBold', 18)
    c.drawString(MARGIN, HEIGHT - 50, f'{YEAR}-yil · {QUARTERS[quarter]}')
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(MARGIN, HEIGHT - 60, WIDTH - MARGIN, HEIGHT - 60)
    top = HEIGHT - 74
    for index in range(3):
        month = quarter * 3 + index + 1
        under = month_grid(c, MARGIN, top - index * 226, inner, month, big=True)
        paragraph(c, month_note(month), BODY, MARGIN, under - 6, inner)
    paragraph(c, 'Ish kunlari — dastlabki hisob: besh kunlik ish haftasi (dam olish kunlari — shanba va yakshanba), faqat aniq '
                 'sanali bayramlar chiqarilgan. Hayit kunlari va Prezident farmoni bilan belgilanadigan qo‘shimcha dam olish '
                 'kunlari hisobga olinmagan.', NOTE, MARGIN, 74, inner)
    footer(c)


def make_pdf():
    stream = BytesIO()
    c = canvas.Canvas(stream, pagesize=A4, invariant=1, lang='uz-Latn')
    c.setTitle(f'{YEAR}-yil kalendari')
    c.setAuthor('GPTBot.uz')
    c.setCreator('GPTBot.uz')
    c.setSubject('O‘zbekiston: ishlanmaydigan bayram kunlari va hafta raqamlari bilan A4 kalendar')
    year_page(c)
    c.showPage()
    for quarter in range(4):
        quarter_page(c, quarter)
        c.showPage()
    c.save()
    return stream.getvalue()


def validate(generated):
    checks = []

    def check(name, result):
        checks.append({'name': name, 'pass': bool(result)})
    pdf = PdfReader(DEST)
    texts = [page.extract_text() or '' for page in pdf.pages]
    everything = '\n'.join(texts)
    check('PDF five A4 pages', len(pdf.pages) == 5 and all(
        abs(float(p.mediabox.width) - A4[0]) < 1 and abs(float(p.mediabox.height) - A4[1]) < 1 for p in pdf.pages))
    check('Year page names every month', all(name in texts[0] for name in MONTHS))
    check('Quarter pages name their months', all(
        MONTHS[q * 3 + i] in texts[q + 1] for q in range(4) for i in range(3)))
    compact = ''.join(texts[0].split())
    check('Every fixed holiday is listed', all(''.join(name.split()) in compact for _, _, name in FIXED_HOLIDAYS))
    check('Undated holidays carry no date', MOVABLE_HOLIDAYS or ''.join(UNDATED_NOTE.split()) in compact)
    check('Uzbek glyphs extract without replacements', '‘' in everything and '’' in everything
          and '\ufffd' not in everything and '■' not in everything)
    check('PDF public author', pdf.metadata.author == 'GPTBot.uz')
    descriptors = []
    for page in pdf.pages:
        for font in page['/Resources']['/Font'].get_object().values():
            font = font.get_object()
            if '/FontDescriptor' in font:
                descriptors.append(font['/FontDescriptor'].get_object())
    check('PDF Unicode fonts embedded', len(descriptors) >= 2 and all('/FontFile2' in font for font in descriptors))
    check('PDF has no links or actions', '/OpenAction' not in pdf.trailer['/Root'] and all(not p.get('/Annots') for p in pdf.pages))
    check('PDF deterministic regeneration', DEST.read_bytes() == generated)
    page = check_page()
    if page is not None:
        check('Page tables equal the generated tables' + (': ' + ', '.join(page) if page else ''), not page)
    return checks


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--blocks', action='store_true')
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    self_test()
    if args.blocks:
        print(json.dumps(page_tables(), ensure_ascii=False, indent=1))
        return
    font = fonts()
    generated = make_pdf()
    if not args.check:
        DEST.parent.mkdir(parents=True, exist_ok=True)
        DEST.write_bytes(generated)
    checks = validate(generated)
    failed = [c['name'] for c in checks if not c['pass']]
    print(json.dumps({'status': 'FAIL' if failed else 'PASS', 'font': font, 'pages': 5, 'checks': len(checks), 'failed': failed,
                      'bytes': DEST.stat().st_size, 'sha256': hashlib.sha256(DEST.read_bytes()).hexdigest()}, ensure_ascii=False))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
