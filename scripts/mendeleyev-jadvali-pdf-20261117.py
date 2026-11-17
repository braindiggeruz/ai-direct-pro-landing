"""Build the printable Uzbek periodic table for /uz/mendeleyev-jadvali/.

One data list (ELEMENTS) feeds both the PDF and the page: `--blocks` prints the
period tables and the rounded-values table that
content/pages/uz/mendeleyev-jadvali.json carries, so the page can be compared
with this list.

Data sources, read on 2026-11-17:
  - atomic numbers, symbols, element names and standard atomic weights:
    CIAAW (IUPAC Commission on Isotopic Abundances and Atomic Weights),
    «Abridged Standard Atomic Weights 2024», https://www.ciaaw.org/abridged-atomic-weights.htm
    (the values are kept below exactly as published);
  - mass numbers in square brackets for the elements without a standard atomic
    weight: IUPAC Periodic Table of the Elements dated 4 May 2022,
    https://iupac.org/what-we-do/periodic-table-of-elements/
Uzbek names follow school usage; Latin names are the traditional ones of school
tables (for 117 and 118 the IUPAC name). Periods and groups follow the 18-column
IUPAC table: lanthanoids (57-71) and actinoids (89-103) stand in two rows below.

Output: public/downloads/docs-20261117/mendeleyev-jadvali.pdf (A4 landscape, one
page). No user input, network or personal data. Same font strategy as
docs-document-templates-20261116.py (Arial on Windows, DejaVu Sans elsewhere).

--check validates the committed file and its deterministic regeneration in the
same font environment; it never rewrites the download.
"""
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape
import argparse
import hashlib
import json
import re

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/downloads/docs-20261117'
TARGET = DEST / 'mendeleyev-jadvali.pdf'
PAGE = landscape(A4)
TITLE = 'Kimyoviy elementlar davriy jadvali (Mendeleyev jadvali)'
SUBTITLE = '118 ta element: tartib raqami, kimyoviy belgisi, o‘zbekcha nomi va nisbiy atom massasi'
STAMP = 'GPTBot.uz · gptbot.uz/uz/mendeleyev-jadvali/ · 17.11.2026 · o‘quv materiali'
NOTES = [
    '* Lantanoidlar (57–71) va ** aktinoidlar (89–103) 6- va 7-davrga tegishli: jadval juda keng bo‘lib ketmasligi uchun ular pastda alohida qatorlarda berilgan.',
    'Nisbiy atom massasi — IUPAC (CIAAW) standart atom massalarining qisqartirilgan qiymatlari (2024-yil), verguldan keyin uch xonagacha yaxlitlangan. '
    'Kvadrat qavs ichida — barqaror izotopi yo‘q elementning eng uzoq yashaydigan izotopi massa soni (IUPAC davriy jadvali, 2022-yil 4-may).',
    'Guruh raqami 1 dan 18 gacha (IUPAC); qavs ichida — maktab darsligidagi qisqa shaklli jadval bo‘yicha guruh va guruhcha: A — bosh, B — yonaki guruhcha.',
]

# (atomic number, symbol, Uzbek name, Latin name, abridged standard atomic weight as published by CIAAW or None,
#  mass number of the longest-lived nuclide from the IUPAC table for elements without a standard atomic weight)
ELEMENTS = [
    (1, 'H', 'Vodorod', 'Hydrogenium', '1.0080', None),
    (2, 'He', 'Geliy', 'Helium', '4.0026', None),
    (3, 'Li', 'Litiy', 'Lithium', '6.94', None),
    (4, 'Be', 'Berilliy', 'Beryllium', '9.0122', None),
    (5, 'B', 'Bor', 'Borum', '10.81', None),
    (6, 'C', 'Uglerod', 'Carboneum', '12.011', None),
    (7, 'N', 'Azot', 'Nitrogenium', '14.007', None),
    (8, 'O', 'Kislorod', 'Oxygenium', '15.999', None),
    (9, 'F', 'Ftor', 'Fluorum', '18.998', None),
    (10, 'Ne', 'Neon', 'Neon', '20.180', None),
    (11, 'Na', 'Natriy', 'Natrium', '22.990', None),
    (12, 'Mg', 'Magniy', 'Magnesium', '24.305', None),
    (13, 'Al', 'Alyuminiy', 'Aluminium', '26.982', None),
    (14, 'Si', 'Kremniy', 'Silicium', '28.085', None),
    (15, 'P', 'Fosfor', 'Phosphorus', '30.974', None),
    (16, 'S', 'Oltingugurt', 'Sulfur', '32.06', None),
    (17, 'Cl', 'Xlor', 'Chlorum', '35.45', None),
    (18, 'Ar', 'Argon', 'Argon', '39.95', None),
    (19, 'K', 'Kaliy', 'Kalium', '39.098', None),
    (20, 'Ca', 'Kalsiy', 'Calcium', '40.078', None),
    (21, 'Sc', 'Skandiy', 'Scandium', '44.956', None),
    (22, 'Ti', 'Titan', 'Titanium', '47.867', None),
    (23, 'V', 'Vanadiy', 'Vanadium', '50.942', None),
    (24, 'Cr', 'Xrom', 'Chromium', '51.996', None),
    (25, 'Mn', 'Marganes', 'Manganum', '54.938', None),
    (26, 'Fe', 'Temir', 'Ferrum', '55.845', None),
    (27, 'Co', 'Kobalt', 'Cobaltum', '58.933', None),
    (28, 'Ni', 'Nikel', 'Niccolum', '58.693', None),
    (29, 'Cu', 'Mis', 'Cuprum', '63.546', None),
    (30, 'Zn', 'Rux', 'Zincum', '65.38', None),
    (31, 'Ga', 'Galliy', 'Gallium', '69.723', None),
    (32, 'Ge', 'Germaniy', 'Germanium', '72.630', None),
    (33, 'As', 'Mishyak', 'Arsenicum', '74.922', None),
    (34, 'Se', 'Selen', 'Selenium', '78.971', None),
    (35, 'Br', 'Brom', 'Bromum', '79.904', None),
    (36, 'Kr', 'Kripton', 'Krypton', '83.798', None),
    (37, 'Rb', 'Rubidiy', 'Rubidium', '85.468', None),
    (38, 'Sr', 'Stronsiy', 'Strontium', '87.62', None),
    (39, 'Y', 'Ittriy', 'Yttrium', '88.906', None),
    (40, 'Zr', 'Sirkoniy', 'Zirconium', '91.222', None),
    (41, 'Nb', 'Niobiy', 'Niobium', '92.906', None),
    (42, 'Mo', 'Molibden', 'Molybdaenum', '95.95', None),
    (43, 'Tc', 'Texnetsiy', 'Technetium', None, 97),
    (44, 'Ru', 'Ruteniy', 'Ruthenium', '101.07', None),
    (45, 'Rh', 'Rodiy', 'Rhodium', '102.91', None),
    (46, 'Pd', 'Palladiy', 'Palladium', '106.42', None),
    (47, 'Ag', 'Kumush', 'Argentum', '107.87', None),
    (48, 'Cd', 'Kadmiy', 'Cadmium', '112.41', None),
    (49, 'In', 'Indiy', 'Indium', '114.82', None),
    (50, 'Sn', 'Qalay', 'Stannum', '118.71', None),
    (51, 'Sb', 'Surma', 'Stibium', '121.76', None),
    (52, 'Te', 'Tellur', 'Tellurium', '127.60', None),
    (53, 'I', 'Yod', 'Iodum', '126.90', None),
    (54, 'Xe', 'Ksenon', 'Xenon', '131.29', None),
    (55, 'Cs', 'Seziy', 'Caesium', '132.91', None),
    (56, 'Ba', 'Bariy', 'Barium', '137.33', None),
    (57, 'La', 'Lantan', 'Lanthanum', '138.91', None),
    (58, 'Ce', 'Seriy', 'Cerium', '140.12', None),
    (59, 'Pr', 'Prazeodim', 'Praseodymium', '140.91', None),
    (60, 'Nd', 'Neodim', 'Neodymium', '144.24', None),
    (61, 'Pm', 'Prometiy', 'Promethium', None, 145),
    (62, 'Sm', 'Samariy', 'Samarium', '150.36', None),
    (63, 'Eu', 'Yevropiy', 'Europium', '151.96', None),
    (64, 'Gd', 'Gadoliniy', 'Gadolinium', '157.25', None),
    (65, 'Tb', 'Terbiy', 'Terbium', '158.93', None),
    (66, 'Dy', 'Disproziy', 'Dysprosium', '162.50', None),
    (67, 'Ho', 'Golmiy', 'Holmium', '164.93', None),
    (68, 'Er', 'Erbiy', 'Erbium', '167.26', None),
    (69, 'Tm', 'Tuliy', 'Thulium', '168.93', None),
    (70, 'Yb', 'Itterbiy', 'Ytterbium', '173.05', None),
    (71, 'Lu', 'Lyutetsiy', 'Lutetium', '174.97', None),
    (72, 'Hf', 'Gafniy', 'Hafnium', '178.49', None),
    (73, 'Ta', 'Tantal', 'Tantalum', '180.95', None),
    (74, 'W', 'Volfram', 'Wolframium', '183.84', None),
    (75, 'Re', 'Reniy', 'Rhenium', '186.21', None),
    (76, 'Os', 'Osmiy', 'Osmium', '190.23', None),
    (77, 'Ir', 'Iridiy', 'Iridium', '192.22', None),
    (78, 'Pt', 'Platina', 'Platinum', '195.08', None),
    (79, 'Au', 'Oltin', 'Aurum', '196.97', None),
    (80, 'Hg', 'Simob', 'Hydrargyrum', '200.59', None),
    (81, 'Tl', 'Talliy', 'Thallium', '204.38', None),
    (82, 'Pb', 'Qo‘rg‘oshin', 'Plumbum', '207.2', None),
    (83, 'Bi', 'Vismut', 'Bismuthum', '208.98', None),
    (84, 'Po', 'Poloniy', 'Polonium', None, 209),
    (85, 'At', 'Astat', 'Astatum', None, 210),
    (86, 'Rn', 'Radon', 'Radon', None, 222),
    (87, 'Fr', 'Fransiy', 'Francium', None, 223),
    (88, 'Ra', 'Radiy', 'Radium', None, 226),
    (89, 'Ac', 'Aktiniy', 'Actinium', None, 227),
    (90, 'Th', 'Toriy', 'Thorium', '232.04', None),
    (91, 'Pa', 'Protaktiniy', 'Protactinium', '231.04', None),
    (92, 'U', 'Uran', 'Uranium', '238.03', None),
    (93, 'Np', 'Neptuniy', 'Neptunium', None, 237),
    (94, 'Pu', 'Plutoniy', 'Plutonium', None, 244),
    (95, 'Am', 'Ameritsiy', 'Americium', None, 243),
    (96, 'Cm', 'Kyuriy', 'Curium', None, 247),
    (97, 'Bk', 'Berkliy', 'Berkelium', None, 247),
    (98, 'Cf', 'Kaliforniy', 'Californium', None, 251),
    (99, 'Es', 'Eynshteyniy', 'Einsteinium', None, 252),
    (100, 'Fm', 'Fermiy', 'Fermium', None, 257),
    (101, 'Md', 'Mendeleviy', 'Mendelevium', None, 258),
    (102, 'No', 'Nobeliy', 'Nobelium', None, 259),
    (103, 'Lr', 'Lourensiy', 'Lawrencium', None, 262),
    (104, 'Rf', 'Rezerfordiy', 'Rutherfordium', None, 267),
    (105, 'Db', 'Dubniy', 'Dubnium', None, 268),
    (106, 'Sg', 'Siborgiy', 'Seaborgium', None, 269),
    (107, 'Bh', 'Boriy', 'Bohrium', None, 270),
    (108, 'Hs', 'Xassiy', 'Hassium', None, 269),
    (109, 'Mt', 'Meytneriy', 'Meitnerium', None, 277),
    (110, 'Ds', 'Darmshtadtiy', 'Darmstadtium', None, 281),
    (111, 'Rg', 'Rentgeniy', 'Roentgenium', None, 282),
    (112, 'Cn', 'Kopernitsiy', 'Copernicium', None, 285),
    (113, 'Nh', 'Nihoniy', 'Nihonium', None, 286),
    (114, 'Fl', 'Fleroviy', 'Flerovium', None, 290),
    (115, 'Mc', 'Moskoviy', 'Moscovium', None, 290),
    (116, 'Lv', 'Livermoriy', 'Livermorium', None, 293),
    (117, 'Ts', 'Tennessin', 'Tennessine', None, 294),
    (118, 'Og', 'Oganesson', 'Oganesson', None, 294),
]
# The page table gives the second, traditional Uzbek name of arsenic too.
PAGE_NAMES = {33: 'Mishyak (margimush)'}
PERIOD_STARTS = [1, 3, 11, 19, 37, 55, 87, 119]
SCHOOL_GROUPS = {1: 'IA', 2: 'IIA', 3: 'IIIB', 4: 'IVB', 5: 'VB', 6: 'VIB', 7: 'VIIB', 8: 'VIIIB', 9: 'VIIIB', 10: 'VIIIB',
                 11: 'IB', 12: 'IIB', 13: 'IIIA', 14: 'IVA', 15: 'VA', 16: 'VIA', 17: 'VIIA', 18: 'VIIIA'}
# School classification: 16 non-metals and 6 noble gases; the chemistry of 117 and 118 has not been studied in experiments.
NONMETALS = {1, 5, 6, 7, 8, 9, 14, 15, 16, 17, 33, 34, 35, 52, 53, 85}
NOBLE_GASES = {2, 10, 18, 36, 54, 86}
UNSTUDIED = {117, 118}
# Elements whose rounded relative atomic masses school problems use most often.
COMMON = [1, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17, 19, 20, 26, 29, 30, 35, 47, 53, 56]


def period(z):
    return next(i for i in range(1, 8) if PERIOD_STARTS[i - 1] <= z < PERIOD_STARTS[i])


def series(z):
    """'lantanoid' for 57-71, 'aktinoid' for 89-103, else None (the two rows below the 18-column table)."""
    return 'lantanoid' if 57 <= z <= 71 else 'aktinoid' if 89 <= z <= 103 else None


def group(z):
    """Group 1-18 of the IUPAC table; None for the lanthanoids and actinoids."""
    if series(z):
        return None
    p = period(z)
    offset = z - PERIOD_STARTS[p - 1] + 1
    if p == 1:
        return 1 if offset == 1 else 18
    if p in (2, 3):
        return offset if offset <= 2 else offset + 10
    if p in (4, 5):
        return offset
    return offset if offset <= 2 else offset - 14


def category(z):
    if z in NOBLE_GASES:
        return 'noble'
    if z in NONMETALS:
        return 'nonmetal'
    if z in UNSTUDIED:
        return 'unstudied'
    return 'metal'


def mass(weight, mass_number):
    """School-table form: at most three decimals, decimal comma; [mass number] without a standard atomic weight."""
    if weight is None:
        return f'[{mass_number}]'
    value = Decimal(weight)
    if -value.as_tuple().exponent > 3:
        value = value.quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)
    return str(value).replace('.', ',')


def rounded(z, weight):
    """The whole number school problems use; chlorine is the one conventional exception, 35,5."""
    if z == 17:
        return '35,5'
    return str(Decimal(weight).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def group_label(z):
    kind = series(z)
    if kind:
        return f'{kind} (IIIB)'
    g = group(z)
    return f'{g} ({SCHOOL_GROUPS[g]})'


PERIOD_SIZES = {1: 2, 2: 8, 3: 8, 4: 18, 5: 18, 6: 32, 7: 32}


def body_blocks():
    """The seven period tables and the rounded-values table of the page."""
    blocks = []
    for p in range(1, 8):
        rows = [[str(z), symbol, PAGE_NAMES.get(z, name), latin, mass(weight, number), group_label(z)]
                for z, symbol, name, latin, weight, number in ELEMENTS if period(z) == p]
        assert len(rows) == PERIOD_SIZES[p]
        blocks.append({'type': 'h3', 'id': f'davr-{p}', 'text': f'{p}-davr: {len(rows)} ta element'})
        blocks.append({'type': 'table', 'headers': ['Tartib raqami', 'Belgi', 'O‘zbekcha nomi', 'Lotincha nomi', 'Nisbiy atom massasi', 'Guruh'], 'rows': rows})
    by_z = {e[0]: e for e in ELEMENTS}
    blocks.append({'type': 'table', 'headers': ['Element', 'Belgi', 'Jadvaldagi qiymat', 'Masalada olinadi'],
                   'rows': [[by_z[z][2], by_z[z][1], mass(by_z[z][4], by_z[z][5]), rounded(z, by_z[z][4])] for z in COMMON]})
    return blocks


def validate_data():
    assert [e[0] for e in ELEMENTS] == list(range(1, 119))
    assert len({e[1] for e in ELEMENTS}) == 118 and len({e[2] for e in ELEMENTS}) == 118
    for z, symbol, name, latin, weight, number in ELEMENTS:
        assert re.fullmatch(r'[A-Z][a-z]?', symbol), symbol
        assert (weight is None) != (number is None), z
        assert not re.search(r"[A-Za-z]['`ʻʼ´][A-Za-z]", name), name
    sizes = {p: sum(period(e[0]) == p for e in ELEMENTS) for p in range(1, 8)}
    assert sizes == PERIOD_SIZES, sizes
    groups = {}
    for z, *_ in ELEMENTS:
        groups.setdefault(group(z), []).append(z)
    assert groups[1] == [1, 3, 11, 19, 37, 55, 87] and groups[18] == [2, 10, 18, 36, 54, 86, 118]
    assert groups[2] == [4, 12, 20, 38, 56, 88] and groups[3] == [21, 39]
    assert all(len(groups[g]) == 4 for g in range(4, 13)) and all(len(groups[g]) == 6 for g in range(13, 18))
    assert len(groups[None]) == 30
    assert len(NONMETALS) == 16 and len(NOBLE_GASES) == 6 and not NONMETALS & NOBLE_GASES
    assert sum(category(e[0]) == 'metal' for e in ELEMENTS) == 94
    assert sum(e[4] is not None for e in ELEMENTS) == 84


def fonts():
    for regular, bold in [
        (Path('C:/Windows/Fonts/arial.ttf'), Path('C:/Windows/Fonts/arialbd.ttf')),
        (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')),
    ]:
        if regular.is_file() and bold.is_file():
            pdfmetrics.registerFont(TTFont('Jadval', str(regular)))
            pdfmetrics.registerFont(TTFont('JadvalBold', str(bold)))
            return regular.name
    raise RuntimeError('A Unicode Arial or DejaVu Sans regular/bold font pair is required.')


FILL = {'metal': colors.HexColor('#DCEBF5'), 'nonmetal': colors.HexColor('#FFF0B3'),
        'noble': colors.HexColor('#DDF1D6'), 'unstudied': colors.white}
LEGEND = [('metal', 'Metallar'), ('nonmetal', 'Metallmaslar'), ('noble', 'Nodir gazlar'),
          ('unstudied', '117 va 118: xossalari tajribada o‘rganilmagan')]
INK = colors.HexColor('#10242E')
LINE = colors.HexColor('#5A7D8C')
MUTED = colors.HexColor('#3F5560')


def fitted(c, text, font, size, width):
    """The font size at which the text fits the width (never below 4.4pt)."""
    while size > 4.4 and c.stringWidth(text, font, size) > width:
        size -= 0.1
    return size


def make_pdf():
    width, height = PAGE
    stream = BytesIO()
    c = pdfcanvas.Canvas(stream, pagesize=PAGE, invariant=1)
    c.setTitle(TITLE)
    c.setAuthor('GPTBot.uz')
    c.setSubject('Kimyoviy elementlar davriy jadvali, o‘zbek tilida')
    c.setCreator('GPTBot.uz')
    x0, right = 36.0, 20.0
    cw = (width - x0 - right) / 18
    ch = 51.0
    top = height - 31.0  # the top edge of period 1
    gap = 13.0

    def cell_origin(z):
        kind = series(z)
        if kind:
            row = 7 + (0 if kind == 'lantanoid' else 1)
            col = (z - 57 if kind == 'lantanoid' else z - 89) + 2
            return x0 + col * cw, top - row * ch - gap - ch
        return x0 + (group(z) - 1) * cw, top - period(z) * ch

    def box(x, y, kind, w=cw, h=ch):
        c.setFillColor(FILL[kind])
        c.setStrokeColor(LINE)
        c.setLineWidth(0.5)
        c.rect(x, y, w, h, stroke=1, fill=1)

    def draw_cell(x, y, z, symbol, name, value, w=cw, h=ch, scale=1.0):
        box(x, y, category(z), w, h)
        c.setFillColor(INK)
        c.setFont('JadvalBold', 7.4 * scale)
        c.drawString(x + 2.6 * scale, y + h - 8.8 * scale, str(z))
        c.setFont('JadvalBold', 15.5 * scale)
        c.drawCentredString(x + w / 2, y + h - 26.5 * scale, symbol)
        size = fitted(c, name, 'Jadval', 6.0 * scale, w - 3.0)
        c.setFont('Jadval', size)
        c.drawCentredString(x + w / 2, y + 13.4 * scale, name)
        c.setFont('Jadval', 6.4 * scale)
        c.drawCentredString(x + w / 2, y + 4.6 * scale, value)

    # Title in the empty band of period 1, between hydrogen and helium.
    c.setFillColor(INK)
    c.setFont('JadvalBold', 17)
    c.drawCentredString(x0 + 9 * cw, top - 22, TITLE)
    c.setFont('Jadval', 8.6)
    c.setFillColor(MUTED)
    c.drawCentredString(x0 + 9 * cw, top - 36, SUBTITLE)

    # Elements.
    for z, symbol, name, _latin, weight, number in ELEMENTS:
        x, y = cell_origin(z)
        draw_cell(x, y, z, symbol, name, mass(weight, number))

    # The two cells of group 3 that stand for the rows below.
    for row, (span, label, mark) in enumerate([('57–71', 'lantanoidlar', '*'), ('89–103', 'aktinoidlar', '**')]):
        x, y = x0 + 2 * cw, top - (6 + row) * ch
        box(x, y, 'metal')
        c.setFillColor(INK)
        c.setFont('JadvalBold', 9.5)
        c.drawCentredString(x + cw / 2, y + ch - 24, span)
        c.setFont('Jadval', 6.0)
        c.drawCentredString(x + cw / 2, y + 13.4, label)
        c.setFont('JadvalBold', 8)
        c.drawCentredString(x + cw / 2, y + 4.2, mark)
        # The same mark and name at the left of the row below.
        fy = top - (7 + row) * ch - gap - ch
        c.setFont('JadvalBold', 7.6)
        c.drawRightString(x0 + 2 * cw - 5, fy + ch / 2 + 1.5, f'{mark} {label.capitalize()}')
        c.setFont('Jadval', 6.4)
        c.setFillColor(MUTED)
        c.drawRightString(x0 + 2 * cw - 5, fy + ch / 2 - 8, f'{span}-elementlar')

    # Period numbers at the left, group numbers above the first element of every column.
    c.setFillColor(INK)
    c.setFont('JadvalBold', 6.4)
    c.drawCentredString(x0 - 9.5, top + 3.4, 'Davr')
    for p in range(1, 8):
        c.setFont('JadvalBold', 10)
        c.drawCentredString(x0 - 9.5, top - p * ch + ch / 2 - 3.5, str(p))
    for g in range(1, 19):
        first_period = 1 if g in (1, 18) else 2 if g in (2, 13, 14, 15, 16, 17) else 4
        y = top - (first_period - 1) * ch + 3.4
        label = f'{g} ({SCHOOL_GROUPS[g]})'
        c.setFont('JadvalBold', 6.8)
        c.setFillColor(INK)
        c.drawCentredString(x0 + (g - 1) * cw + cw / 2, y, label)

    # How to read a cell and the colour legend, in the empty area above the d-block.
    lx, ly = x0 + 2 * cw + 14, top - 3 * ch + 16
    sample = next(e for e in ELEMENTS if e[1] == 'Fe')
    sw, sh = cw * 1.5, ch * 1.5
    draw_cell(lx, ly, sample[0], sample[1], sample[2], mass(sample[4], sample[5]), sw, sh, 1.5)
    c.setStrokeColor(MUTED)
    c.setLineWidth(0.4)
    callouts = [(sh - 10.5, 'tartib raqami: yadrodagi protonlar soni'), (sh - 33.5, 'kimyoviy belgi'),
                (22.5, 'o‘zbekcha nomi'), (9.0, 'nisbiy atom massasi')]
    for dy, text in callouts:
        c.line(lx + sw + 3, ly + dy, lx + sw + 13, ly + dy)
        c.setFillColor(INK)
        c.setFont('Jadval', 7.4)
        c.drawString(lx + sw + 16, ly + dy - 2.5, text)
    kx = lx + sw + 190
    for i, (kind, text) in enumerate(LEGEND):
        y = ly + sh - 12 - i * 14.5
        box(kx, y, kind, 11, 9)
        c.setFillColor(INK)
        c.setFont('Jadval', 7.4)
        c.drawString(kx + 16, y + 1.8, text)
    c.setFont('Jadval', 7.0)
    c.setFillColor(MUTED)
    c.drawString(kx, ly + 6.2, 'Davr — gorizontal qator, guruh — tik ustun.')

    # Notes and the stamp under the table.
    style = ParagraphStyle('note', fontName='Jadval', fontSize=6.7, leading=8.6, textColor=MUTED)
    y = top - 9 * ch - gap - 7
    for note in NOTES:
        paragraph = Paragraph(escape(note), style)
        _w, h = paragraph.wrap(width - x0 - right, 60)
        y -= h
        paragraph.drawOn(c, x0, y)
        y -= 1.6
    c.setFont('Jadval', 6.7)
    c.setFillColor(MUTED)
    c.drawString(x0, 14, STAMP)
    assert y > 22, f'the notes run into the stamp: {y}'
    c.showPage()
    c.save()
    return stream.getvalue()


def compact(text):
    return re.sub(r'\s+', '', text)


def validate(generated):
    checks = []

    def check(name, result):
        checks.append({'name': name, 'pass': bool(result)})
    pdf = PdfReader(TARGET)
    page = pdf.pages[0]
    text = page.extract_text() or ''
    packed = compact(text)
    check('one A4 landscape page', len(pdf.pages) == 1 and abs(float(page.mediabox.width) - PAGE[0]) < 1
          and abs(float(page.mediabox.height) - PAGE[1]) < 1 and PAGE[0] > PAGE[1])
    check('all 118 Uzbek names and relative atomic masses', all(compact(e[2]) in packed and mass(e[4], e[5]) in packed for e in ELEMENTS))
    lines = [line.strip() for line in text.splitlines()]
    check('every symbol stands in a cell of its own', all(e[1] in lines for e in ELEMENTS))
    check('title, legend and notes', compact(TITLE) in packed and all(compact(label) in packed for _kind, label in LEGEND)
          and all(compact(note) in packed for note in NOTES))
    check('Uzbek glyphs extract without replacements', 'Qo‘rg‘oshin' in text and '\ufffd' not in text and '■' not in text)
    check('public author', pdf.metadata.author == 'GPTBot.uz')
    descriptors = []
    for font in page['/Resources']['/Font'].get_object().values():
        font = font.get_object()
        if '/FontDescriptor' in font:
            descriptors.append(font['/FontDescriptor'].get_object())
    check('Unicode fonts embedded', len(descriptors) >= 2 and all('/FontFile2' in font for font in descriptors))
    check('no external links or actions', '/OpenAction' not in pdf.trailer['/Root'] and not page.get('/Annots'))
    check('no private paths', not re.search(rb'Borinio|[CF]:[\\/]', TARGET.read_bytes()))
    check('deterministic regeneration', TARGET.read_bytes() == generated)
    return {'file': TARGET.name, 'pages': len(pdf.pages), 'checks': checks,
            'sha256': hashlib.sha256(TARGET.read_bytes()).hexdigest(), 'bytes': TARGET.stat().st_size}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='validate the committed PDF without rewriting it')
    parser.add_argument('--blocks', action='store_true', help='print the page tables built from the element list')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    validate_data()
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
    report = {'status': 'FAIL' if failed else 'PASS', 'font': font, 'elements': len(ELEMENTS), **result, 'failed': failed}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: report[key] for key in ('status', 'font', 'elements', 'pages', 'bytes', 'sha256', 'failed')}, ensure_ascii=False))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
