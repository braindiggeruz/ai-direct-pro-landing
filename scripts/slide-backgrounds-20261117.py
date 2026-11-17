"""Build 24 original slide backgrounds (JPG) and two PPTX files for the 2026-11-17 guides.

Output, in public/downloads/docs-20261117/:
  slayd-fon-01.jpg ... slayd-fon-24.jpg  16:9, 1920x1080, each under 300 KB
  slayd-fonlar-24.pptx                   24 slides, one background each, set as the slide background
  slayd-shablon-maktab.pptx              a 10-slide school template with Uzbek placeholders

Six themes of four: maktab, tabiat, fan, biznes, bayram, minimal. Every picture is drawn
by the code below: gradients, geometric shapes and soft patterns. No photographs, logos,
fonts or text are baked into a picture, and each one keeps a calm zone for a title. The
recommended text colour of a background is checked against that zone (WCAG contrast of
at least 4.5:1 for 99% of its pixels).

Deterministic: fixed seed, fixed dates, sorted ZIP entries. --check validates the committed
files and their regeneration in the same Python environment and never rewrites downloads.
Optional --report saves the QA result as JSON; optional --sheet saves a contact sheet of
the 24 pictures for a visual review. Requires Pillow, numpy and python-pptx (available in
the desktop bundled Python). No user input, network, macros or personal data.
"""
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
import argparse
import hashlib
import json
import math
import random
import re
import xml.etree.ElementTree as ET
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_LINE
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml import parse_xml
from pptx.oxml.ns import nsdecls, qn
from pptx.util import Emu, Pt

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/downloads/docs-20261117'
SEED = 20261117
FIXED = datetime(2026, 11, 17, tzinfo=timezone.utc)
W, H, SS = 1920, 1080, 2
MAX_JPG_BYTES = 300_000
MIN_CONTRAST = 4.5
DARK, LIGHT = '16233A', 'FFFFFF'
SLIDE_W, SLIDE_H = 12192000, 6858000  # 13.333 x 7.5 in, PowerPoint's 16:9
DECK_FILE, TEMPLATE_FILE = 'slayd-fonlar-24.pptx', 'slayd-shablon-maktab.pptx'
THEMES = {'maktab': 'Maktab', 'tabiat': 'Tabiat', 'fan': 'Fan', 'biznes': 'Biznes', 'bayram': 'Bayram', 'minimal': 'Minimal'}

YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


# --- colour and geometry -------------------------------------------------------------

def rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def rgba(value, alpha=255):
    return (*rgb(value), int(alpha))


def gradient(stops, angle=90.0):
    """Linear gradient, float32 HxWx3. angle: 0 is left to right, 90 is top to bottom."""
    dx, dy = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    t = XX * dx + YY * dy
    t = (t - t.min()) / (t.max() - t.min())
    positions = [p for p, _ in stops]
    colours = np.array([rgb(c) for _, c in stops], np.float32)
    return np.stack([np.interp(t, positions, colours[:, ch]) for ch in range(3)], axis=-1).astype(np.float32)


def glow(base, cx, cy, radius, colour, strength=1.0, power=2.0):
    distance = np.sqrt((XX - cx) ** 2 + (YY - cy) ** 2) / radius
    mask = (np.clip(1.0 - distance, 0.0, 1.0) ** power * strength)[..., None]
    return base * (1 - mask) + np.array(rgb(colour), np.float32) * mask


def vignette(base, strength):
    distance = ((XX - W / 2) / (W / 2)) ** 2 + ((YY - H / 2) / (H / 2)) ** 2
    return base * (1 - strength * np.clip(distance / 2, 0.0, 1.0) ** 1.2)[..., None]


def place(points, cx, cy, angle=0.0, scale=1.0):
    ca, sa = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    return [(cx + scale * (x * ca - y * sa), cy + scale * (x * sa + y * ca)) for x, y in points]


def oval(rx, ry, steps=120):
    return [(rx * math.cos(2 * math.pi * i / steps), ry * math.sin(2 * math.pi * i / steps)) for i in range(steps)]


def leaf(length, width, steps=36):
    upper = [(length * i / steps, -width * math.sin(math.pi * i / steps)) for i in range(steps + 1)]
    return upper + [(x, -y) for x, y in reversed(upper[1:-1])]


def curve(p0, p1, p2, steps=40):
    """Quadratic Bezier."""
    out = []
    for i in range(steps + 1):
        t = i / steps
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


def wave(y0, parts, step=8):
    """A filled band below a sum of sines. parts: [(amplitude, wavelength, phase), ...]."""
    top = [(x, y0 + sum(a * math.sin(2 * math.pi * x / length + phase) for a, length, phase in parts))
           for x in range(0, W + step, step)]
    return top + [(W, H), (0, H)]


def ridge(rng, y0, amplitude, levels=5):
    heights = [rng.uniform(-0.4, 0.4) * amplitude, rng.uniform(-0.4, 0.4) * amplitude]
    scale = amplitude
    for _ in range(levels):
        nxt = []
        for a, b in zip(heights, heights[1:]):
            nxt += [a, (a + b) / 2 + rng.uniform(-1, 1) * scale]
        heights = nxt + [heights[-1]]
        scale *= 0.55
    last = len(heights) - 1
    return [(W * i / last, y0 + h) for i, h in enumerate(heights)] + [(W, H), (0, H)]


class Painter:
    """Drawing helpers in final-pixel units on a supersampled image."""

    def __init__(self, image, mode=None):
        self.image = image
        self.draw = ImageDraw.Draw(image, mode) if mode else ImageDraw.Draw(image)

    @staticmethod
    def _xy(points):
        return [(x * SS, y * SS) for x, y in points]

    @staticmethod
    def _w(width):
        return max(1, int(round(width * SS)))

    def poly(self, points, fill=None, outline=None, width=1.0):
        self.draw.polygon(self._xy(points), fill=fill, outline=outline, width=self._w(width))

    def line(self, points, fill, width=1.0, closed=False):
        points = list(points)
        self.draw.line(self._xy(points + points[:1] if closed else points), fill=fill, width=self._w(width), joint='curve')

    def circle(self, cx, cy, r, fill=None, outline=None, width=1.0):
        self.draw.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=fill, outline=outline, width=self._w(width))

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=1.0, radius=0.0):
        self.draw.rounded_rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], radius=radius * SS, fill=fill, outline=outline, width=self._w(width))

    def dashed(self, p0, p1, fill, width=1.0, dash=18.0, gap=12.0):
        length = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        ux, uy = (p1[0] - p0[0]) / length, (p1[1] - p0[1]) / length
        at = 0.0
        while at < length:
            end = min(at + dash, length)
            self.line([(p0[0] + ux * at, p0[1] + uy * at), (p0[0] + ux * end, p0[1] + uy * end)], fill, width)
            at += dash + gap


class Mask(Painter):
    """A single-colour layer: draw with 0..255, then paste a colour through it."""

    def __init__(self):
        super().__init__(Image.new('L', (W * SS, H * SS), 0))


class Canvas(Painter):
    def __init__(self, base):
        image = Image.fromarray(np.clip(np.rint(base), 0, 255).astype(np.uint8), 'RGB')
        super().__init__(image.resize((W * SS, H * SS), Image.Resampling.BICUBIC), 'RGBA')

    def paste(self, mask, colour, blur=0.0, opacity=1.0):
        layer = mask.image
        if blur:
            layer = layer.filter(ImageFilter.GaussianBlur(blur * SS))
        if opacity < 1:
            layer = layer.point([int(round(v * opacity)) for v in range(256)])
        self.image.paste(rgb(colour), box=None, mask=layer)

    def finish(self):
        return self.image.resize((W, H), Image.Resampling.LANCZOS)


def fade(canvas, zone, colour, opacity=0.88, blur=44.0, grow=34.0):
    """Calm the pattern under the title zone without a hard edge."""
    mask = Mask()
    mask.rect(zone[0] * W - grow, zone[1] * H - grow, zone[2] * W + grow, zone[3] * H + grow, fill=255, radius=70)
    canvas.paste(mask, colour, blur=blur, opacity=opacity)


# --- maktab ----------------------------------------------------------------------------

def pencil(c, cx, cy, angle, scale=1.0):
    t = 23.0
    shadow = Mask()
    shadow.poly(place([(-260, -t), (170, -t), (260, 0), (170, t), (-260, t)], cx + 8, cy + 14, angle, scale), 255)
    c.paste(shadow, '1F2937', blur=10, opacity=0.2)

    def part(points, colour):
        c.poly(place(points, cx, cy, angle, scale), fill=rgba(colour))
    part([(-260, -t), (-214, -t), (-214, t), (-260, t)], 'F28B9A')
    part([(-214, -t), (-174, -t), (-174, t), (-214, t)], 'AEB7C4')
    for x in (-205, -190):
        part([(x, -t), (x + 5, -t), (x + 5, t), (x, t)], '8792A2')
    part([(-174, -t), (170, -t), (170, -t / 3), (-174, -t / 3)], 'FFD766')
    part([(-174, -t / 3), (170, -t / 3), (170, t / 3), (-174, t / 3)], 'F9C846')
    part([(-174, t / 3), (170, t / 3), (170, t), (-174, t)], 'E3AC2C')
    part([(170, -t), (260, 0), (170, t)], 'F1D3AE')
    part([(232, -t * 28 / 90), (260, 0), (232, t * 28 / 90)], '3A3F4B')


def bg01(rng, zone):
    c = Canvas(gradient([(0, 'FFFEFA'), (1, 'F1F7FE')], 90))
    grid = Mask()
    for x in range(54, W, 54):
        grid.line([(x, 0), (x, H)], 255, 1.5)
    for y in range(54, H, 54):
        grid.line([(0, y), (W, y)], 255, 1.5)
    c.paste(grid, 'A6C8E8', opacity=0.8)
    c.line([(162, 0), (162, H)], rgba('F08F8F', 220), 2.6)
    fade(c, zone, 'FFFFFF', 0.9)
    c.circle(1722, 168, 56, outline=rgba('3B82F6'), width=13)
    c.poly(place([(-58, 50), (58, 50), (0, -52)], 1556, 236, 16), fill=rgba('FBBF24'))
    for angle in (12, 102):
        c.poly(place([(-34, -8), (34, -8), (34, 8), (-34, 8)], 1806, 338, angle), fill=rgba('F87171'))
    c.circle(1648, 372, 15, fill=rgba('34D399'))
    pencil(c, 1556, 944, -22, 1.22)
    return c.finish()


def bg02(rng, zone):
    base = gradient([(0, '2A5F4F'), (1, '1C473A')], 60)
    base = vignette(glow(base, 800, 470, 1000, '347463', 0.5), 0.26)
    c = Canvas(base)
    smudge = Mask()
    for _ in range(16):
        x, y = rng.uniform(100, W - 100), rng.uniform(100, H - 100)
        length, angle = rng.uniform(300, 760), math.radians(rng.uniform(-14, 14))
        dx, dy = math.cos(angle) * length / 2, math.sin(angle) * length / 2
        smudge.line([(x - dx, y - dy), (x + dx, y + dy)], 255, rng.uniform(40, 110))
    c.paste(smudge, 'FFFFFF', blur=46, opacity=0.045)
    chalk = Mask()
    chalk.circle(1668, 232, 72, outline=255, width=5)
    chalk.line(place([(-70, 58), (70, 58), (0, -62)], 1478, 286, -8), 255, 5, closed=True)
    chalk.line([(x, 476 + 26 * math.sin((x - 1390) / 400 * 4 * math.pi)) for x in range(1390, 1794, 6)], 255, 5)
    for x, y, angle in ((1322, 196, 0), (1800, 392, 45), (1356, 566, 20)):
        for turn in (0, 90):
            chalk.line(place([(-14, 0), (14, 0)], x, y, angle + turn), 255, 5)
    chalk.line([(1420, 660), (1420, 904), (1790, 904)], 255, 5)
    chalk.line([(1408, 684), (1420, 656), (1432, 684)], 255, 5)
    chalk.line([(1766, 892), (1794, 904), (1766, 916)], 255, 5)
    chalk.line([(x, 904 - ((x - 1420) / 330) ** 2 * 210) for x in range(1420, 1756, 6)], 255, 5)
    c.paste(chalk, 'FFFFFF', blur=0.7, opacity=0.74)
    frame = 34
    for box in ((0, 0, W, frame), (0, H - frame, W, H), (0, 0, frame, H), (W - frame, 0, W, H)):
        c.rect(*box, fill=rgba('8A5A33'))
    c.rect(7, 7, W - 7, H - 7, outline=rgba('A9743F'), width=3)
    c.rect(frame - 2, frame - 2, W - frame + 2, H - frame + 2, outline=rgba('5E3C20'), width=4)
    c.rect(frame, H - frame - 22, W - frame, H - frame, fill=rgba('A06B3C'))
    c.rect(frame, H - frame - 22, W - frame, H - frame - 18, fill=rgba('BC8752'))
    for x0, x1, colour in ((1490, 1562, 'FFFFFF'), (1584, 1642, 'FFE08A'), (1668, 1718, 'FFB3C1')):
        c.rect(x0, H - frame - 36, x1, H - frame - 22, fill=rgba(colour), radius=5)
    return c.finish()


def bg03(rng, zone):
    c = Canvas(gradient([(0, 'FFFCF4'), (1, 'FFF5E3')], 60))
    c.circle(W, 0, 430, fill=rgba('3B82F6'))
    c.circle(W, 0, 300, fill=rgba('60A5FA'))
    c.circle(1486, 520, 118, fill=rgba('FBBF24'))
    c.poly(place([(-112, 96), (112, 96), (0, -98)], 1742, 560, 10), fill=rgba('F87171'))
    c.poly(place([(-94, -94), (94, -94), (94, 94), (-94, 94)], 1712, 880, 16), fill=rgba('34D399'))
    c.circle(1404, 868, 78, outline=rgba('A78BFA'), width=24)
    for row in range(5):
        for col in range(6):
            c.circle(1278 + col * 36, 150 + row * 36, 6, fill=rgba('1E3A8A', 120))
    zigzag = Mask()
    zigzag.line([(1300 + i * 34, 350 + (22 if i % 2 else -22)) for i in range(7)], 255, 10)
    c.paste(zigzag, 'F87171')
    c.circle(0, H, 214, fill=rgba('FBBF24'))
    c.circle(0, H, 120, fill=rgba('FCD34D'))
    c.poly(place([(-44, 38), (44, 38), (0, -40)], 286, 1000, -14), fill=rgba('3B82F6'))
    c.circle(398, 1024, 16, fill=rgba('F87171'))
    return c.finish()


def bg04(rng, zone):
    c = Canvas(gradient([(0, 'FFFEF8'), (1, 'FBF6EA')], 90))
    lines = Mask()
    for y in range(132, H, 62):
        lines.line([(0, y), (W, y)], 255, 1.8)
    c.paste(lines, '9CC2E5', opacity=0.8)
    fade(c, zone, 'FFFEF8', 0.9)
    c.rect(0, 0, 118, H, fill=rgba('2A9D8F'))
    c.rect(118, 0, 127, H, fill=rgba('1F7F73'))
    for y in range(70, H, 94):
        c.circle(180, y, 15, fill=rgba('DFE6EE'))
        c.rect(50, y - 8, 188, y + 8, fill=rgba('5F6B7A'), radius=8)
        c.rect(56, y - 6, 182, y - 2, fill=rgba('97A3B3'), radius=2)
    for i, colour in enumerate(('F87171', 'FBBF24', '34D399', '60A5FA')):
        y = 150 + i * 196
        c.rect(W - 58, y, W + 30, y + 152, fill=rgba(colour), radius=22)
    return c.finish()


# --- tabiat ----------------------------------------------------------------------------

def cloud(c, cx, cy, s):
    c.rect(cx - 1.35 * s, cy + 0.1 * s, cx + 1.4 * s, cy + 0.62 * s, fill=rgba('FFFFFF'), radius=0.26 * s)
    for dx, dy, r in ((-0.9, 0.1, 0.55), (-0.3, -0.25, 0.75), (0.45, -0.05, 0.62), (1.0, 0.15, 0.45)):
        c.circle(cx + dx * s, cy + dy * s, r * s, fill=rgba('FFFFFF'))


def bg05(rng, zone):
    base = gradient([(0, 'C9E8FF'), (0.6, 'EEF9FF'), (1, 'FFFFFF')], 90)
    base = glow(base, 1610, 220, 330, 'FFF1A8', 0.9)
    c = Canvas(base)
    c.circle(1610, 220, 72, fill=rgba('FFE27A'))
    cloud(c, 1240, 118, 56)
    cloud(c, 1790, 430, 44)
    cloud(c, 250, 92, 40)
    layers = (
        (760, ((26, 1500, 0.4), (10, 420, 1.9)), 'C4E8B6'),
        (826, ((34, 1180, 2.2), (12, 380, 0.3)), '97D48E'),
        (896, ((30, 980, 4.4), (10, 330, 2.6)), '63B874'),
        (966, ((26, 820, 1.2), (8, 300, 4.0)), '3F9B5F'),
    )
    for y0, parts, colour in layers:
        c.poly(wave(y0, parts), fill=rgba(colour))
    for x, y, r in ((1380, 800, 30), (1452, 812, 22), (1700, 838, 34), (1772, 852, 24), (238, 842, 26)):
        c.rect(x - 4, y, x + 4, y + r * 1.5, fill=rgba('7A5A3A'))
        c.circle(x, y - r * 0.2, r, fill=rgba('2F8552'))
        c.circle(x - r * 0.3, y - r * 0.45, r * 0.42, fill=rgba('46A56A'))
    return c.finish()


def bg06(rng, zone):
    base = gradient([(0, '141A46'), (0.45, '35296F'), (0.7, '6E3F86'), (0.88, 'D97F6C'), (1, 'F7B77C')], 90)
    base = glow(base, 1548, 214, 300, 'FDF3D0', 0.32)
    c = Canvas(base)
    for _ in range(150):
        x, y = rng.uniform(0, W), rng.uniform(0, 560)
        c.circle(x, y, rng.uniform(0.9, 2.3), fill=rgba('FFFFFF', rng.uniform(90, 230) * (1 - y / 760)))
    c.circle(1548, 214, 58, fill=rgba('FDF3D0'))
    c.circle(1570, 198, 12, fill=rgba('EADFB6'))
    c.circle(1528, 236, 8, fill=rgba('EADFB6'))
    for y0, amplitude, colour in ((700, 150, '5B3F87'), (790, 130, '40306F'), (880, 110, '2A2357'), (980, 70, '171A40')):
        c.poly(ridge(rng, y0, amplitude), fill=rgba(colour))
    return c.finish()


def bg07(rng, zone):
    c = Canvas(gradient([(0, 'F5FBF4'), (1, 'E0F2E3')], 120))
    greens = ('2E8B57', '3FA36C', '5DBB86', '8FD3A8', 'B6E3C2')
    for anchor, sweep in (((W + 40, -40), (115, 170)), ((-40, H + 40), (-65, -10))):
        for i in range(11):
            angle = rng.uniform(*sweep)
            length = rng.uniform(250, 520)
            start = rng.uniform(0, 120)
            cx = anchor[0] + math.cos(math.radians(angle)) * start
            cy = anchor[1] + math.sin(math.radians(angle)) * start
            colour = greens[(i * 2 + rng.randrange(2)) % len(greens)]
            c.poly(place(leaf(length, length * 0.17), cx, cy, angle), fill=rgba(colour, 232))
            vein = Mask()
            vein.line(place([(length * 0.06, 0), (length * 0.94, 0)], cx, cy, angle), 255, 2.4)
            for k in range(2, 8):
                t = k / 9
                reach = length * 0.17 * math.sin(math.pi * t) * 0.78
                for side in (-1, 1):
                    vein.line(place([(length * t, 0), (length * (t + 0.07), side * reach)], cx, cy, angle), 255, 1.4)
            c.paste(vein, 'FFFFFF', opacity=0.32)
    for _ in range(26):
        corner = rng.choice(((W, 0), (0, H)))
        radius, turn = rng.uniform(380, 720), rng.uniform(0, 2 * math.pi)
        x, y = corner[0] + math.cos(turn) * radius, corner[1] + math.sin(turn) * radius
        if 0 < x < W and 0 < y < H:
            c.circle(x, y, rng.uniform(4, 10), fill=rgba('8FD3A8', 150))
    return c.finish()


def bg08(rng, zone):
    c = Canvas(gradient([(0, 'ECFBFF'), (0.55, 'D6F3FB'), (1, 'BDE9F6')], 90))
    layers = (
        (720, ((22, 620, 0.3), (8, 210, 1.4)), '9ADBEC'),
        (790, ((26, 540, 2.1), (9, 190, 0.2)), '5CC2DD'),
        (862, ((24, 480, 4.0), (8, 170, 2.9)), '2FA3C7'),
        (936, ((22, 430, 1.0), (7, 150, 4.6)), '1C82AB'),
        (1008, ((18, 380, 3.2), (6, 140, 0.9)), '125F86'),
    )
    for y0, parts, colour in layers:
        c.poly(wave(y0, parts, 6), fill=rgba(colour))
        crest = Mask()
        crest.line([(x, y - 3) for x, y in wave(y0, parts, 6)[:-2]], 255, 3)
        c.paste(crest, 'FFFFFF', opacity=0.35)
    for _ in range(34):
        x = rng.choice((rng.uniform(1340, W - 40), rng.uniform(40, 300)))
        y, r = rng.uniform(440, 700), rng.uniform(6, 24)
        c.circle(x, y, r, outline=rgba('FFFFFF', 220), width=3)
        c.circle(x - r * 0.3, y - r * 0.3, r * 0.18, fill=rgba('FFFFFF', 230))
    return c.finish()


# --- fan -------------------------------------------------------------------------------

def bg09(rng, zone):
    base = gradient([(0, '0A1A33'), (1, '10305E')], 35)
    base = glow(base, 1520, 270, 760, '1B4F8F', 0.5)
    c = Canvas(base)
    side = 62.0
    anchors = ((1660, 230, 900.0), (120, 1010, 560.0))

    def strength(x, y):
        return max(max(0.0, 1 - math.hypot(x - ax, y - ay) / reach) ** 1.5 for ax, ay, reach in anchors)

    edges, nodes = {}, {}
    for r in range(-2, 16):
        for q in range(-10, 22):
            cx, cy = side * math.sqrt(3) * (q + r / 2), side * 1.5 * r
            corners = [(cx + side * math.cos(math.radians(30 + 60 * k)), cy + side * math.sin(math.radians(30 + 60 * k))) for k in range(6)]
            for a, b in zip(corners, corners[1:] + corners[:1]):
                ka, kb = (round(a[0]), round(a[1])), (round(b[0]), round(b[1]))
                edges[tuple(sorted((ka, kb)))] = (a, b)
                nodes[ka] = a
    for key in sorted(edges):
        a, b = edges[key]
        power = strength((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if power > 0.02:
            c.line([a, b], rgba('5DD6FF', 190 * power), 2.2)
    halo, dots = Mask(), []
    for key in sorted(nodes):
        x, y = nodes[key]
        power = strength(x, y)
        if power > 0.2 and rng.random() < 0.3:
            r = rng.uniform(4, 9)
            halo.circle(x, y, r * 3.2, fill=int(255 * power))
            dots.append((x, y, r, power))
    c.paste(halo, '38BDF8', blur=9, opacity=0.4)
    for x, y, r, power in dots:
        c.circle(x, y, r, fill=rgba('A5EDFF', 255 * min(1.0, power + 0.35)))
    return c.finish()


def bg10(rng, zone):
    base = gradient([(0, '1B5CAB'), (1, '154A8E')], 90)
    base = glow(base, 700, 500, 1100, '2167BC', 0.5)
    c = Canvas(base)
    minor, major = Mask(), Mask()
    for x in range(0, W + 1, 40):
        (major if x % 200 == 0 else minor).line([(x, 0), (x, H)], 255, 1.2)
    for y in range(0, H + 1, 40):
        (major if y % 200 == 0 else minor).line([(0, y), (W, y)], 255, 1.2)
    c.paste(minor, 'FFFFFF', opacity=0.085)
    c.paste(major, 'FFFFFF', opacity=0.17)
    ink = Mask()
    cx, cy = 1500, 420
    for r in (88, 150, 212):
        ink.circle(cx, cy, r, outline=255, width=2.4)
    ink.dashed((cx - 268, cy), (cx + 268, cy), 255, 2)
    ink.dashed((cx, cy - 268), (cx, cy + 268), 255, 2)
    for k in range(12):
        ink.line(place([(212, 0), (232, 0)], cx, cy, 30 * k), 255, 2.4)
    ink.line(place([(0, 0), (150, 0)], cx, cy, -40), 255, 2.4)
    ink.circle(cx, cy, 7, fill=255)
    ink.line([(1280, 800), (1720, 800), (1720, 600)], 255, 2.4)
    ink.line([(1280, 800), (1720, 600)], 255, 2.4)
    ink.line([(1690, 800), (1690, 770), (1720, 770)], 255, 2)
    ink.line([(1280, 846), (1720, 846)], 255, 2)
    for x in (1280, 1720):
        ink.line([(x, 832), (x, 860)], 255, 2)
    ink.line([(1296, 838), (1280, 846), (1296, 854)], 255, 2)
    ink.line([(1704, 838), (1720, 846), (1704, 854)], 255, 2)
    ink.rect(1560, 940, 1880, 1040, outline=255, width=2)
    ink.line([(1560, 973), (1880, 973)], 255, 2)
    ink.line([(1560, 1006), (1880, 1006)], 255, 2)
    ink.line([(1720, 940), (1720, 1040)], 255, 2)
    c.paste(ink, 'FFFFFF', opacity=0.62)
    return c.finish()


def bg11(rng, zone):
    c = Canvas(gradient([(0, 'FCFBFF'), (1, 'EAE4FB')], 120))
    dots = Mask()
    for y in range(40, H, 44):
        for x in range(40, W, 44):
            dots.circle(x, y, 2.3, fill=255)
    c.paste(dots, '6D5BD0', opacity=0.24)
    fade(c, zone, 'FBFAFF', 0.9)
    cx, cy = 1520, 330
    orbit = Mask()
    for angle in (0, 60, 120):
        orbit.line(place(oval(262, 92), cx, cy, angle), 255, 4, closed=True)
    c.paste(orbit, '6D5BD0', opacity=0.72)
    for (dx, dy), colour in zip(((-16, -8), (16, -8), (0, 16)), ('6D5BD0', 'F472B6', '60A5FA')):
        c.circle(cx + dx, cy + dy, 25, fill=rgba(colour))
    for angle, turn, colour in ((0, 35, '60A5FA'), (60, 160, 'F472B6'), (120, 280, '34D399')):
        x, y = place([(262 * math.cos(math.radians(turn)), 92 * math.sin(math.radians(turn)))], cx, cy, angle)[0]
        c.circle(x, y, 13, fill=rgba('FFFFFF'))
        c.circle(x, y, 10, fill=rgba(colour))
    rings = Mask()
    for hx, hy in ((1560, 842), (1660, 900), (1660, 784), (1760, 842)):
        rings.line([(hx + 58 * math.cos(math.radians(30 + 60 * k)), hy + 58 * math.sin(math.radians(30 + 60 * k))) for k in range(6)], 255, 4, closed=True)
    c.paste(rings, '6D5BD0', opacity=0.42)
    for hx, hy, colour in ((1510, 813, 'F472B6'), (1810, 871, '60A5FA'), (1660, 726, '34D399')):
        c.circle(hx, hy, 11, fill=rgba(colour))
    return c.finish()


def bg12(rng, zone):
    base = gradient([(0, '070B1F'), (0.55, '141A46'), (1, '26195A')], 60)
    base = glow(glow(base, 1450, 300, 620, '5B2A86', 0.42), 480, 920, 720, '123E7A', 0.34)
    c = Canvas(base)
    for _ in range(520):
        x, y, r = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(0.6, 2.2)
        c.circle(x, y, r, fill=rgba('FFFFFF', rng.uniform(90, 255)))
    sparkle = Mask()
    for _ in range(14):
        x, y, s = rng.uniform(40, W - 40), rng.uniform(40, H - 40), rng.uniform(7, 15)
        sparkle.line([(x - s, y), (x + s, y)], 255, 1.6)
        sparkle.line([(x, y - s), (x, y + s)], 255, 1.6)
    c.paste(sparkle, 'FFFFFF', opacity=0.8)
    px, py, pr = 1640, 990, 300
    ring = place(oval(470, 96, 160), px, py, -18)
    back, front = Mask(), Mask()
    back.line(ring[80:] + ring[:1], 255, 13)
    front.line(ring[:81], 255, 13)
    c.paste(back, 'CDBBFF', opacity=0.8)
    c.circle(px, py, pr, fill=rgba('3F5FB5'))
    band = Mask()
    band.circle(px, py, pr, fill=255)
    band.rect(px - pr - 4, py - pr - 4, px + pr + 4, py - 150, fill=0)
    band.rect(px - pr - 4, py - 96, px + pr + 4, py + pr + 4, fill=0)
    c.paste(band, '6F8BDD', opacity=0.6)
    shade = Mask()
    shade.circle(px, py, pr, fill=255)
    shade.circle(px - 90, py - 80, pr, fill=0)
    c.paste(shade, '070B1F', blur=22, opacity=0.5)
    c.paste(front, 'CDBBFF', opacity=0.86)
    c.circle(236, 186, 46, fill=rgba('F59E7A'))
    moon = Mask()
    moon.circle(236, 186, 46, fill=255)
    moon.circle(220, 172, 46, fill=0)
    c.paste(moon, '070B1F', blur=5, opacity=0.5)
    return c.finish()


# --- biznes ----------------------------------------------------------------------------

def bg13(rng, zone):
    c = Canvas(gradient([(0, 'FFFFFF'), (1, 'F1F5FA')], 0))
    c.poly([(1330, 0), (1430, 0), (1170, H), (1070, H)], fill=rgba('E1E9F3'))
    c.poly([(1430, 0), (1470, 0), (1210, H), (1170, H)], fill=rgba('2EC4B6'))
    c.poly([(1470, 0), (1560, 0), (1300, H), (1210, H)], fill=rgba('1F6FEB'))
    c.poly([(1560, 0), (W, 0), (W, H), (1300, H)], fill=rgba('12355B'))
    stripes = Mask()
    for i in range(1, 8):
        shift = 76 * i
        stripes.line([(1560 + shift, 0), (1300 + shift, H)], 255, 2)
    c.paste(stripes, 'FFFFFF', opacity=0.09)
    c.rect(134, 846, 370, 852, fill=rgba('2EC4B6'))
    c.rect(134, 118, 158, 142, fill=rgba('1F6FEB'))
    return c.finish()


def bg14(rng, zone):
    c = Canvas(vignette(gradient([(0, '1E2228'), (1, '2B3139')], 45), 0.2))
    pins = Mask()
    for offset in range(-H, W, 28):
        pins.line([(offset, H), (offset + H, 0)], 255, 1.2)
    c.paste(pins, 'FFFFFF', opacity=0.035)
    gold = Mask()
    gold.line([(90, 300), (90, 90), (420, 90)], 255, 3)
    gold.line([(W - 90, H - 300), (W - 90, H - 90), (W - 420, H - 90)], 255, 3)
    gold.line(place([(-46, 0), (0, -46), (46, 0), (0, 46)], 1706, 292), 255, 3, closed=True)
    gold.line(place([(-22, 0), (0, -22), (22, 0), (0, 22)], 1706, 292), 255, 3, closed=True)
    c.paste(gold, 'D4AF37')
    thin = Mask()
    thin.line([(1300, H), (W, 460)], 255, 2)
    thin.line([(1400, H), (W, 560)], 255, 2)
    thin.line([(1500, H), (W, 660)], 255, 2)
    c.paste(thin, 'D4AF37', opacity=0.5)
    return c.finish()


def bg15(rng, zone):
    base = glow(gradient([(0, 'F8FAFD'), (1, 'E7EDF6')], 90), 0, 0, 760, 'DCE8FA', 0.8)
    c = Canvas(base)
    heights = (120, 170, 150, 230, 290, 260, 360, 430)
    tops = []
    for i, height in enumerate(heights):
        x = 1130 + i * 92
        t = (height - 120) / 310
        colour = tuple(int(round(a + (b - a) * t)) for a, b in zip(rgb('A9C7F5'), rgb('1F6FEB')))
        c.rect(x, 980 - height, x + 62, 980 - height + 30, fill=(*colour, 255), radius=12)
        c.rect(x, 980 - height + 14, x + 62, 980, fill=(*colour, 255))
        tops.append((x + 31, 980 - height - 46))
    c.rect(1090, 978, 1880, 981, fill=rgba('9FB3CC'))
    trend = Mask()
    trend.line(tops, 255, 5)
    c.paste(trend, 'F59E0B')
    for x, y in tops:
        c.circle(x, y, 11, fill=rgba('F59E0B'))
        c.circle(x, y, 6, fill=rgba('FFFFFF'))
    c.rect(134, 118, 196, 126, fill=rgba('1F6FEB'), radius=4)
    return c.finish()


def bg16(rng, zone):
    c = Canvas(gradient([(0, '0A3470'), (1, '124C9C')], 30))
    for cx, cy, w, h, alpha in ((1640, 300, 760, 420, 20), (1760, 620, 700, 380, 26), (1520, 900, 640, 300, 18)):
        c.poly(place([(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)], cx, cy, -22), fill=rgba('FFFFFF', alpha))
    c.circle(1700, 220, 300, fill=rgba('FFFFFF', 12))
    c.circle(1860, 800, 220, fill=rgba('FFFFFF', 14))
    for row in range(6):
        for col in range(9):
            c.circle(96 + col * 34, 880 + row * 30, 3.4, fill=rgba('FFFFFF', 70))
    c.rect(134, 128, 330, 133, fill=rgba('7CC4FF'))
    return c.finish()


# --- bayram ----------------------------------------------------------------------------

def bg17(rng, zone):
    c = Canvas(gradient([(0, 'FFFAF0'), (1, 'FFF2DE')], 90))
    colours = ('F94144', 'F3722C', 'F9C74F', '90BE6D', '43AA8B', '577590', '9B5DE5', 'F15BB5', '00BBF9')
    x0, y0, x1, y1 = zone[0] * W, zone[1] * H, zone[2] * W, zone[3] * H
    placed = 0
    while placed < 330:
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        outside = math.hypot(max(x0 - x, 0, x - x1), max(y0 - y, 0, y - y1))
        if outside < 46 or rng.random() > min(1.0, (outside - 46) / 230) ** 0.8:
            continue
        colour, angle, kind = rng.choice(colours), rng.uniform(0, 180), rng.random()
        if kind < 0.55:
            w, h = rng.uniform(12, 28), rng.uniform(6, 13)
            c.poly(place([(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)], x, y, angle), fill=rgba(colour, 238))
        elif kind < 0.82:
            c.circle(x, y, rng.uniform(4, 9), fill=rgba(colour, 238))
        else:
            s = rng.uniform(9, 16)
            c.poly(place([(-s, s * 0.8), (s, s * 0.8), (0, -s)], x, y, angle), fill=rgba(colour, 238))
        placed += 1
    for sx, sy, angle, colour in ((210, 120, 20, 'F15BB5'), (1680, 150, 160, '00BBF9'), (150, 930, -25, 'F9C74F'), (1750, 900, 200, '43AA8B')):
        ribbon = Mask()
        ribbon.line(place([(t * 4.2, 22 * math.sin(t / 9.0)) for t in range(0, 64)], sx, sy, angle), 255, 6)
        c.paste(ribbon, colour)
    return c.finish()


def snowflake(mask, cx, cy, r, turn):
    for k in range(6):
        angle = turn + 60 * k
        mask.line(place([(0, 0), (r, 0)], cx, cy, angle), 255, 2.6)
        for at in (0.5, 0.76):
            for side in (-1, 1):
                mask.line(place([(r * at, 0), (r * (at + 0.2), side * r * 0.2)], cx, cy, angle), 255, 2.2)


def fir(c, x, base, s):
    c.rect(x - 9 * s, base - 30 * s, x + 9 * s, base + 4 * s, fill=rgba('5B3F2A'))
    for i, (half, top, bottom) in enumerate(((96, -150, -20), (76, -230, -110), (54, -300, -196))):
        c.poly([(x - half * s, base + bottom * s), (x + half * s, base + bottom * s), (x, base + top * s)], fill=rgba(('17493C', '1E5C4B', '267059')[i]))
        c.poly([(x - half * 0.42 * s, base + (top + (bottom - top) * 0.42) * s), (x + half * 0.42 * s, base + (top + (bottom - top) * 0.42) * s), (x, base + top * s)], fill=rgba('F4F9FF', 235))


def bg18(rng, zone):
    base = glow(gradient([(0, '0A1B40'), (1, '15397A')], 90), 960, H, 900, '2B5DAE', 0.4)
    c = Canvas(base)
    bokeh = Mask()
    for _ in range(26):
        x = rng.choice((rng.uniform(0, 260), rng.uniform(W - 420, W), rng.uniform(0, W)))
        y = rng.uniform(0, 200) if 260 < x < W - 420 else rng.uniform(0, 780)
        bokeh.circle(x, y, rng.uniform(20, 66), fill=rng.randrange(90, 200))
    c.paste(bokeh, 'BFD9FF', blur=7, opacity=0.2)
    for _ in range(260):
        c.circle(rng.uniform(0, W), rng.uniform(0, 900), rng.uniform(1, 3.4), fill=rgba('FFFFFF', rng.uniform(110, 240)))
    flakes = Mask()
    for x, y, r in ((150, 150, 44), (330, 60, 26), (1760, 110, 48), (1560, 60, 24), (1850, 330, 30), (90, 420, 28), (1420, 190, 30), (640, 70, 22), (1100, 96, 28)):
        snowflake(flakes, x, y, r, rng.uniform(0, 60))
    c.paste(flakes, 'FFFFFF', opacity=0.86)
    c.poly(wave(900, ((24, 1300, 0.6), (8, 420, 2.0))), fill=rgba('8FB0DA'))
    for x, s in ((1500, 0.78), (1640, 1.0), (1772, 0.7)):
        fir(c, x, 950, s)
    c.poly(wave(950, ((22, 1050, 3.4), (7, 360, 0.8))), fill=rgba('BCD3EE'))
    c.poly(wave(1004, ((18, 900, 1.6), (6, 300, 4.1))), fill=rgba('E3EEFA'))
    return c.finish()


def tulip(c, x, base, height, colour, shade, lean, s):
    top = (x + lean, base - height)
    stem = Mask()
    stem.line(curve((x, base), (x - lean * 0.4, base - height * 0.5), top), 255, 8 * s)
    c.paste(stem, '3E9B4F')
    for angle, start in ((-58, 0.1), (-122, 0.16)):
        c.poly(place(leaf(height * 0.56, height * 0.07), x, base - height * start, angle), fill=rgba('58B368'))
    for angle, shift in ((-108, -15), (-72, 15)):
        c.poly(place(leaf(92, 30), top[0] + shift * s, top[1] + 30 * s, angle, s), fill=rgba(shade))
    c.poly(place(leaf(100, 32), top[0], top[1] + 34 * s, -90, s), fill=rgba(colour))


def bg19(rng, zone):
    base = glow(gradient([(0, 'FFF6F8'), (1, 'F1FBEE')], 100), 0, 0, 560, 'FFE9A8', 0.8)
    c = Canvas(base)
    for _ in range(22):
        x, y = rng.uniform(1180, W - 30), rng.uniform(40, 560)
        c.poly(place(oval(rng.uniform(9, 16), rng.uniform(5, 8), 24), x, y, rng.uniform(0, 180)), fill=rgba(rng.choice(('FF8FAB', 'FFB3C6', 'FFC2D1')), 190))
    flowers = (
        (1210, 330, 'FFD166', 'F2B441', -8, 0.86), (1322, 430, 'EF476F', 'D53A60', 10, 1.0), (1430, 350, 'C77DFF', 'A960E6', -6, 0.9),
        (1540, 470, 'FF7096', 'E85781', 12, 1.06), (1650, 370, 'FFD166', 'F2B441', -10, 0.92), (1756, 440, 'EF476F', 'D53A60', 8, 1.0),
        (1858, 340, 'F78C6B', 'E07355', -4, 0.86),
    )
    for x, height, colour, shade, lean, s in flowers:
        tulip(c, x, 1010, height, colour, shade, lean, s)
    c.poly(wave(988, ((14, 760, 0.8), (6, 230, 2.4))), fill=rgba('BFE3B1'))
    c.poly(wave(1024, ((12, 620, 3.0), (5, 210, 0.4))), fill=rgba('9DD492'))
    return c.finish()


def balloon(c, x, y, rx, ry, colour, knot):
    string = Mask()
    string.line(curve((x, y + ry + 12), (x + (knot[0] - x) * 0.2, (y + ry + knot[1]) / 2), knot), 255, 2.4)
    c.paste(string, '7B8794', opacity=0.9)
    c.poly(place(oval(rx, ry), x, y), fill=rgba(colour))
    c.poly([(x - 10, y + ry + 12), (x + 10, y + ry + 12), (x, y + ry - 4)], fill=rgba(colour))
    shine = Mask()
    shine.poly(place(oval(rx * 0.2, ry * 0.3, 40), x - rx * 0.36, y - ry * 0.38, 24), 255)
    c.paste(shine, 'FFFFFF', blur=5, opacity=0.5)


def bg20(rng, zone):
    c = Canvas(gradient([(0, 'D9EFFF'), (0.7, 'F7FCFF'), (1, 'FFFFFF')], 90))
    colours = ('F94144', 'F9C74F', '43AA8B', '4D96FF', '9B5DE5', 'F3722C')
    for y_left, y_right, sag, width, height, alpha, colour_shift in ((14, 34, 64, 70, 84, 150, 3), (56, 44, 118, 96, 112, 255, 0)):
        def hang(x):
            t = (x + 20) / (W + 40)
            return y_left + (y_right - y_left) * t + sag * 4 * t * (1 - t)
        string = Mask()
        string.line([(x, hang(x)) for x in range(-20, W + 24, 8)], 255, 3)
        c.paste(string, '7B8794', opacity=alpha / 255)
        index, x = 0, -10.0
        while x < W:
            c.poly([(x, hang(x)), (x + width, hang(x + width)), (x + width / 2, hang(x + width / 2) + height)], fill=rgba(colours[(index + colour_shift) % len(colours)], alpha))
            index += 1
            x += width + 26
    knot = (1690, 1020)
    balloon(c, 1560, 520, 78, 96, 'F94144', knot)
    balloon(c, 1790, 590, 74, 92, 'F9C74F', knot)
    balloon(c, 1680, 420, 82, 100, '4D96FF', knot)
    return c.finish()


# --- minimal ---------------------------------------------------------------------------

def bg21(rng, zone):
    c = Canvas(glow(gradient([(0, 'FCFCFA'), (1, 'F3F3EE')], 135), 1760, 1010, 640, 'D9EEE8', 0.9))
    c.rect(116, 330, 122, 750, fill=rgba('2A9D8F'))
    c.circle(1742, 150, 44, outline=rgba('2A9D8F', 130), width=3)
    c.circle(1742, 150, 8, fill=rgba('2A9D8F', 150))
    return c.finish()


def bg22(rng, zone):
    c = Canvas(gradient([(0, 'FFE2D1'), (0.4, 'F6DDF0'), (0.75, 'DDE3FF'), (1, 'D5EEFF')], 30))
    for cx, cy, r, colour, opacity in ((1500, 300, 330, 'FFFFFF', 0.36), (300, 960, 280, 'FFFFFF', 0.3), (1760, 910, 260, 'FFCDB2', 0.42)):
        blob = Mask()
        blob.circle(cx, cy, r, fill=255)
        c.paste(blob, colour, blur=70, opacity=opacity)
    return c.finish()


def bg23(rng, zone):
    c = Canvas(vignette(gradient([(0, '15171C'), (1, '242830')], 45), 0.25))
    rings = Mask()
    rings.circle(1560, 540, 360, outline=255, width=2)
    rings.circle(1560, 540, 250, outline=255, width=2)
    c.paste(rings, 'FFFFFF', opacity=0.1)
    c.circle(1560 + 360 * math.cos(math.radians(-38)), 540 + 360 * math.sin(math.radians(-38)), 9, fill=rgba('FF6B5E'))
    c.rect(150, 286, 270, 292, fill=rgba('FF6B5E'))
    return c.finish()


def bg24(rng, zone):
    base = gradient([(0, 'FBF8F3'), (1, 'F6F1E9')], 90)
    split = 640
    left = gradient([(0, '2F6F73'), (1, '275B5F')], 90)
    base[:, :split] = left[:, :split]
    c = Canvas(base)
    for row in range(7):
        for col in range(7):
            c.circle(70 + col * 34, 70 + row * 34, 3.2, fill=rgba('FFFFFF', 60))
    c.circle(split, 540, 96, fill=rgba('F4A261'))
    c.circle(split, 540, 58, fill=rgba('F7B984'))
    c.rect(770, 890, 1010, 895, fill=rgba('2F6F73'))
    return c.finish()


BACKGROUNDS = [
    (1, 'maktab', 'Katak daftar', DARK, (0.12, 0.20, 0.72, 0.78), bg01),
    (2, 'maktab', 'Yashil doska', LIGHT, (0.08, 0.16, 0.64, 0.84), bg02),
    (3, 'maktab', 'Rangli shakllar', DARK, (0.07, 0.18, 0.62, 0.76), bg03),
    (4, 'maktab', 'Chiziqli daftar', DARK, (0.13, 0.18, 0.92, 0.84), bg04),
    (5, 'tabiat', 'Yashil adirlar', DARK, (0.07, 0.16, 0.68, 0.62), bg05),
    (6, 'tabiat', 'Tog‘da shom', LIGHT, (0.07, 0.12, 0.70, 0.54), bg06),
    (7, 'tabiat', 'Barglar', DARK, (0.14, 0.26, 0.78, 0.76), bg07),
    (8, 'tabiat', 'To‘lqinlar', DARK, (0.08, 0.12, 0.68, 0.58), bg08),
    (9, 'fan', 'Molekulalar', LIGHT, (0.08, 0.26, 0.60, 0.78), bg09),
    (10, 'fan', 'Chizma', LIGHT, (0.07, 0.18, 0.60, 0.82), bg10),
    (11, 'fan', 'Atom', DARK, (0.07, 0.22, 0.62, 0.82), bg11),
    (12, 'fan', 'Koinot', LIGHT, (0.16, 0.26, 0.64, 0.66), bg12),
    (13, 'biznes', 'Diagonal chiziqlar', DARK, (0.07, 0.20, 0.54, 0.76), bg13),
    (14, 'biznes', 'Grafit va oltin', LIGHT, (0.08, 0.30, 0.66, 0.76), bg14),
    (15, 'biznes', 'Ustunli diagramma', DARK, (0.07, 0.18, 0.56, 0.74), bg15),
    (16, 'biznes', 'Ko‘k qatlamlar', LIGHT, (0.07, 0.20, 0.58, 0.76), bg16),
    (17, 'bayram', 'Konfetti', DARK, (0.20, 0.28, 0.80, 0.72), bg17),
    (18, 'bayram', 'Qish kechasi', LIGHT, (0.10, 0.24, 0.68, 0.70), bg18),
    (19, 'bayram', 'Bahor lolalari', DARK, (0.07, 0.24, 0.58, 0.78), bg19),
    (20, 'bayram', 'Bayroqchalar va sharlar', DARK, (0.07, 0.32, 0.70, 0.84), bg20),
    (21, 'minimal', 'Oq fon va chiziq', DARK, (0.09, 0.24, 0.74, 0.76), bg21),
    (22, 'minimal', 'Pastel gradient', DARK, (0.10, 0.24, 0.80, 0.76), bg22),
    (23, 'minimal', 'To‘q minimal', LIGHT, (0.08, 0.30, 0.60, 0.80), bg23),
    (24, 'minimal', 'Ikki rangli', DARK, (0.40, 0.22, 0.94, 0.78), bg24),
]


def file_name(number):
    return f'slayd-fon-{number:02d}.jpg'


def render(number, zone, painter):
    image = painter(random.Random(SEED * 100 + number), zone)
    noise = np.random.RandomState(SEED % 2 ** 31 + number).normal(0.0, 1.1, (H, W, 1)).astype(np.float32)
    pixels = np.clip(np.rint(np.asarray(image).astype(np.float32) + noise), 0, 255).astype(np.uint8)
    image = Image.fromarray(pixels, 'RGB')
    for quality, subsampling in ((90, 0), (86, 0), (86, 2), (82, 2), (78, 2), (74, 2), (70, 2)):
        buffer = BytesIO()
        image.save(buffer, 'JPEG', quality=quality, subsampling=subsampling, optimize=True, progressive=True)
        if buffer.tell() <= MAX_JPG_BYTES:
            return buffer.getvalue()
    raise SystemExit(f'{file_name(number)} does not fit {MAX_JPG_BYTES} bytes')


def luminance(values):
    linear = np.where(values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4)
    return 0.2126 * linear[..., 0] + 0.7152 * linear[..., 1] + 0.0722 * linear[..., 2]


def zone_contrast(data, zone, text):
    """Lowest WCAG contrast of the text colour against 99% of the title zone's pixels."""
    pixels = np.asarray(Image.open(BytesIO(data)).convert('RGB')).astype(np.float64) / 255
    area = pixels[int(zone[1] * H):int(zone[3] * H), int(zone[0] * W):int(zone[2] * W)]
    low, high = np.percentile(luminance(area), (0.5, 99.5))
    ink = float(luminance(np.array(rgb(text), np.float64) / 255))
    return min((max(ink, value) + 0.05) / (min(ink, value) + 0.05) for value in (low, high))


# --- PPTX ------------------------------------------------------------------------------

def clean_zip(data):
    result = BytesIO()
    with zipfile.ZipFile(BytesIO(data)) as source, zipfile.ZipFile(result, 'w') as target:
        for name in sorted(source.namelist()):
            info = zipfile.ZipInfo(name, (2026, 11, 17, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 0
            target.writestr(info, source.read(name))
    return result.getvalue()


def new_presentation(title, subject):
    prs = Presentation()
    ratio = SLIDE_W / prs.slide_width
    prs.slide_width, prs.slide_height = Emu(SLIDE_W), Emu(SLIDE_H)
    for part in [prs.slide_master, *prs.slide_layouts]:
        for xfrm in part._element.iter(qn('a:xfrm')):
            off, ext = xfrm.find(qn('a:off')), xfrm.find(qn('a:ext'))
            if off is not None and ext is not None:
                off.set('x', str(int(round(int(off.get('x')) * ratio))))
                ext.set('cx', str(int(round(int(ext.get('cx')) * ratio))))
    package = prs.part.package
    for rid, rel in list(package._rels.items()):
        if rel.reltype == RT.THUMBNAIL:
            package._rels.pop(rid)
    props = prs.core_properties
    props.author = props.last_modified_by = 'GPTBot.uz'
    props.title, props.subject = title, subject
    props.comments = 'Original static backgrounds drawn by code. No photographs, logos or personal information.'
    props.keywords = 'slayd, fon, taqdimot, shablon'
    props.created = props.modified = FIXED
    props.revision, props.language = 1, 'uz-Latn'
    return prs


def set_background(slide, jpeg):
    _, rid = slide.part.get_or_add_image_part(BytesIO(jpeg))
    common = slide._element.cSld
    for old in common.findall(qn('p:bg')):
        common.remove(old)
    common.insert(0, parse_xml(
        f'<p:bg {nsdecls("p", "a", "r")}><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="{rid}"/>'
        '<a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>'))


def box(shape, x0, y0, x1, y1):
    shape.left, shape.top = Emu(int(x0 * SLIDE_W)), Emu(int(y0 * SLIDE_H))
    shape.width, shape.height = Emu(int((x1 - x0) * SLIDE_W)), Emu(int((y1 - y0) * SLIDE_H))


def write(shape, lines, size, colour, bold=False, anchor=MSO_ANCHOR.TOP, align=PP_ALIGN.LEFT, bullets=False):
    """Fill a text shape; the same look is the shape's default, so retyped text keeps it."""
    frame = shape.text_frame
    frame.word_wrap = True
    frame.vertical_anchor = anchor
    side = {PP_ALIGN.LEFT: 'l', PP_ALIGN.CENTER: 'ctr'}[align]
    bullet = '<a:buFont typeface="Arial"/><a:buChar char="•"/>' if bullets else '<a:buNone/>'
    indent = ' marL="342900" indent="-342900"' if bullets else ' marL="0" indent="0"'
    body = shape._element.txBody
    old = body.find(qn('a:lstStyle'))
    style = parse_xml(
        f'<a:lstStyle {nsdecls("a")}><a:lvl1pPr algn="{side}"{indent}><a:spcBef><a:spcPts val="{600 if bullets else 0}"/></a:spcBef>{bullet}'
        f'<a:defRPr sz="{size * 100}" b="{int(bold)}" lang="uz-Latn-UZ"><a:solidFill><a:srgbClr val="{colour}"/></a:solidFill>'
        '<a:latin typeface="Arial"/><a:cs typeface="Arial"/></a:defRPr></a:lvl1pPr></a:lstStyle>')
    if old is None:
        body.insert(1, style)
    else:
        body.replace(old, style)
    for index, line in enumerate([lines] if isinstance(lines, str) else lines):
        paragraph = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        paragraph.alignment = align
        run = paragraph.add_run()
        run.text = line
        run.font.size, run.font.bold, run.font.name = Pt(size), bold, 'Arial'
        run.font.color.rgb = RGBColor.from_string(colour)
        run.font._element.set('lang', 'uz-Latn-UZ')


def note(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def make_deck(images):
    prs = new_presentation('Slayd uchun 24 ta fon', '16:9 fonlar: maktab, tabiat, fan, biznes, bayram, minimal')
    for number, theme, name, text, zone, _ in BACKGROUNDS:
        slide = prs.slides.add_slide(prs.slide_layouts[0])
        set_background(slide, images[number])
        title, subtitle = slide.shapes.title, slide.placeholders[1]
        middle = zone[1] + (zone[3] - zone[1]) * 0.56
        box(title, zone[0], zone[1], zone[2], middle)
        box(subtitle, zone[0], middle + 0.015, zone[2], zone[3])
        write(title, 'Sarlavha matni', 44, text, bold=True, anchor=MSO_ANCHOR.BOTTOM)
        write(subtitle, f'{number:02d}-fon · {name}', 24, text)
        tone = 'to‘q ko‘k (#16233A)' if text == DARK else 'oq (#FFFFFF)'
        note(slide, f'Fon: {file_name(number)} · {THEMES[theme]} · {name}. Tavsiya etilgan matn rangi: {tone}. '
                    'Kerakli slaydni nusxalang, matnni o‘zingizniki bilan almashtiring, keraksiz slaydlarni o‘chiring.')
    stream = BytesIO()
    prs.save(stream)
    return clean_zip(stream.getvalue())


TEMPLATE_SLIDES = [
    ('title', '[Taqdimot mavzusi]', ['Fan: [fan nomi]', 'Bajardi: [ism-familiya], [sinf]', 'O‘qituvchi: [F.I.Sh.]', '[sana]'],
     'Titul slayd. Mavzuni qisqa yozing. O‘zingizni tanishtiring va mavzuni bir gap bilan ayting.'),
    ('list', 'Reja', ['[Birinchi savol yoki bo‘lim]', '[Ikkinchi savol yoki bo‘lim]', '[Uchinchi savol yoki bo‘lim]', 'Xulosa'],
     'Reja slaydi. Nimalar haqida gapirishingizni 3–4 band bilan ayting.'),
    ('list', '[Mavzu nima uchun muhim?]', ['[Mavzuni bir gap bilan tushuntiring]', '[Hayotdan bitta misol keltiring]', '[Tinglovchilarga savol bering]'],
     'Kirish. Tinglovchini qiziqtiring: misol yoki savol bilan boshlang.'),
    ('list', '[Asosiy tushuncha]', ['[Ta’rif: bir yoki ikki gap]', '[Birinchi kalit so‘z va izohi]', '[Ikkinchi kalit so‘z va izohi]'],
     'Asosiy tushuncha. Ta’rifni darslikdan oling va manbasini oxirgi slaydga yozing.'),
    ('picture', '[Birinchi asosiy fikr]', ['[Fikrni qisqa yozing]', '[Dalil yoki raqam]', '[Rasmda nima ko‘rsatilgani]'],
     'Birinchi fikr va rasm. O‘ng tomondagi ramka o‘rniga o‘z rasmingiz yoki sxemangizni qo‘ying.'),
    ('list', '[Ikkinchi asosiy fikr]', ['[Fikrni qisqa yozing]', '[Dalil yoki raqam]', '[Birinchi fikr bilan bog‘lang]'],
     'Ikkinchi fikr. Bitta slaydda bitta fikr: ortiqcha matnni eslatmaga ko‘chiring.'),
    ('list', '[Misol yoki tajriba]', ['1-qadam: [nima qilinadi]', '2-qadam: [nima kuzatiladi]', '3-qadam: [natija]'],
     'Misol yoki tajriba. Qadamlarni tartib bilan ayting.'),
    ('table', '[Taqqoslash yoki qiziqarli fakt]', [['[Belgi]', '[Birinchi]', '[Ikkinchi]'], ['[1-belgi]', '[…]', '[…]'], ['[2-belgi]', '[…]', '[…]'], ['[3-belgi]', '[…]', '[…]']],
     'Jadval. Katakchalarni qisqa so‘zlar bilan to‘ldiring; raqamlar manbasini ayting.'),
    ('list', 'Xulosa', ['[Birinchi asosiy fikr]', '[Ikkinchi asosiy fikr]', '[Uchinchi asosiy fikr]'],
     'Xulosa. Asosiy fikrlarni takrorlang va tinglovchilarga savol bering.'),
    ('list', 'Manbalar', ['[Darslik: muallif, nomi, yili, beti]', '[Sayt yoki maqola nomi va manzili]', '[Rasmlar manbasi]', 'E’tiboringiz uchun rahmat! Savollaringiz bormi?'],
     'Manbalar va savollar. Foydalangan manbalaringizni yozing, so‘ng savollarga javob bering.'),
]


def make_template(images):
    prs = new_presentation('Maktab taqdimoti: 10 slaydli shablon', 'Kvadrat qavsdagi matnlarni o‘z ma’lumotingiz bilan almashtiring')
    cover, inner = images[3], images[1]
    for kind, heading, content, hint in TEMPLATE_SLIDES:
        if kind == 'title':
            slide = prs.slides.add_slide(prs.slide_layouts[0])
            set_background(slide, cover)
            box(slide.shapes.title, 0.07, 0.20, 0.62, 0.50)
            box(slide.placeholders[1], 0.07, 0.52, 0.62, 0.80)
            write(slide.shapes.title, heading, 44, DARK, bold=True, anchor=MSO_ANCHOR.BOTTOM)
            write(slide.placeholders[1], content, 22, DARK)
        else:
            slide = prs.slides.add_slide(prs.slide_layouts[5 if kind == 'table' else 1])
            set_background(slide, inner)
            box(slide.shapes.title, 0.12, 0.17, 0.74, 0.31)
            write(slide.shapes.title, heading, 36, DARK, bold=True, anchor=MSO_ANCHOR.MIDDLE)
            if kind == 'table':
                frame = slide.shapes.add_table(len(content), len(content[0]), Emu(int(0.12 * SLIDE_W)), Emu(int(0.35 * SLIDE_H)),
                                               Emu(int(0.62 * SLIDE_W)), Emu(int(0.40 * SLIDE_H)))
                for r, row in enumerate(content):
                    for col, value in enumerate(row):
                        cell = frame.table.cell(r, col)
                        cell.text = value
                        run = cell.text_frame.paragraphs[0].runs[0]
                        run.font.size, run.font.name, run.font.bold = Pt(20), 'Arial', r == 0
                        run.font._element.set('lang', 'uz-Latn-UZ')
            else:
                body = slide.placeholders[1]
                box(body, 0.12, 0.33, 0.46 if kind == 'picture' else 0.74, 0.78)
                write(body, content, 24, DARK, bullets=True)
            if kind == 'picture':
                frame = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(int(0.48 * SLIDE_W)), Emu(int(0.34 * SLIDE_H)),
                                               Emu(int(0.26 * SLIDE_W)), Emu(int(0.42 * SLIDE_H)))
                frame.fill.solid()
                frame.fill.fore_color.rgb = RGBColor.from_string('F4F8FC')
                frame.line.color.rgb = RGBColor.from_string('7FA6CF')
                frame.line.width, frame.line.dash_style = Pt(2), MSO_LINE.DASH
                frame.shadow.inherit = False
                write(frame, '[Rasm yoki sxema joyi]', 20, '4A6A8C', anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.CENTER)
        note(slide, hint + ' Ma’ruzachi eslatmasi: [bu yerga aytadigan gaplaringizni yozing].')
    stream = BytesIO()
    prs.save(stream)
    return clean_zip(stream.getvalue())


# --- build, check, report --------------------------------------------------------------

def build():
    images = {number: render(number, zone, painter) for number, _, _, _, zone, painter in BACKGROUNDS}
    files = {file_name(number): data for number, data in images.items()}
    files[DECK_FILE] = make_deck(images)
    files[TEMPLATE_FILE] = make_template(images)
    return files


def pptx_facts(path, slides, pictures):
    checks = {}
    with zipfile.ZipFile(path) as archive:
        checks['ZIP CRC'] = archive.testzip() is None
        names = archive.namelist()
        xml = {name: archive.read(name).decode('utf-8') for name in names if name.endswith(('.xml', '.rels'))}
        for text in xml.values():
            ET.fromstring(text)
        slide_names = sorted((n for n in names if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)), key=lambda n: int(re.search(r'\d+', n).group()))
        checks[f'{slides} slides'] = len(slide_names) == slides
        checks['every slide has a picture background'] = all('<p:bg>' in xml[n] and '<a:blipFill' in xml[n].split('<p:spTree>')[0] for n in slide_names)
        media = sorted(n for n in names if n.startswith('ppt/media/'))
        checks[f'{pictures} embedded pictures, all committed JPG files'] = len(media) == pictures and all(
            any(archive.read(n) == (DEST / file_name(number)).read_bytes() for number in range(1, 25)) for n in media)
        presentation = xml['ppt/presentation.xml']
        checks['16:9 slide size'] = f'cx="{SLIDE_W}"' in presentation and f'cy="{SLIDE_H}"' in presentation
        core = xml['docProps/core.xml']
        checks['public author only'] = '<dc:creator>GPTBot.uz</dc:creator>' in core and '<cp:lastModifiedBy>GPTBot.uz</cp:lastModifiedBy>' in core
        everything = ''.join(xml.values())
        checks['no private paths, macros or thumbnail'] = not re.search(r'Borinio|[CF]:[\\/]|vbaProject', everything) and 'docProps/thumbnail.jpeg' not in names
        checks['no external relationships'] = 'TargetMode="External"' not in everything
        words = ' '.join(' '.join(ET.fromstring(xml[n]).itertext()) for n in names if re.fullmatch(r'ppt/(slides|notesSlides)/\w+\.xml', n))
        checks['Uzbek apostrophes'] = not re.search(r"[A-Za-z]['`ʻʼ´][A-Za-z]|[oOgG]’[a-z]|[a-fh-np-zA-FH-NP-Z]‘[a-z]", words)
        checks['Uzbek language tag'] = 'uz-Latn' in everything
    return checks, words


def validate(generated):
    results, failed = [], []

    def record(name, checks, extra=None):
        path = DEST / name
        entry = {'file': name, 'bytes': path.stat().st_size if path.exists() else 0,
                 'sha256': hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else '',
                 'checks': [{'name': key, 'pass': bool(value)} for key, value in checks.items()], **(extra or {})}
        failed.extend((name, key) for key, value in checks.items() if not value)
        results.append(entry)

    for number, theme, name, text, zone, _ in BACKGROUNDS:
        path = DEST / file_name(number)
        checks, extra = {'file exists': path.exists()}, {'theme': theme, 'name': name, 'text': '#' + text}
        if path.exists():
            data = path.read_bytes()
            with Image.open(BytesIO(data)) as image:
                checks['JPEG 1920x1080 RGB'] = image.format == 'JPEG' and image.size == (W, H) and image.mode == 'RGB'
                checks['no EXIF or comment'] = not image.getexif() and 'comment' not in image.info
            checks[f'under {MAX_JPG_BYTES} bytes'] = len(data) <= MAX_JPG_BYTES
            contrast = zone_contrast(data, zone, text)
            extra['titleZoneContrast'] = round(contrast, 2)
            checks[f'title zone contrast at least {MIN_CONTRAST}:1'] = contrast >= MIN_CONTRAST
            checks['deterministic regeneration'] = data == generated[file_name(number)]
        record(file_name(number), checks, extra)
    for name, slides, pictures in ((DECK_FILE, 24, 24), (TEMPLATE_FILE, 10, 2)):
        path = DEST / name
        checks = {'file exists': path.exists()}
        if path.exists():
            facts, words = pptx_facts(path, slides, pictures)
            checks.update(facts)
            if name == TEMPLATE_FILE:
                checks['editable placeholders in square brackets'] = words.count('[') >= 30
                checks['every planned text is on a slide'] = all(
                    line in words for _, heading, content, _ in TEMPLATE_SLIDES for line in [heading, *(content if isinstance(content[0], str) else sum(content, []))])
            checks['deterministic regeneration'] = path.read_bytes() == generated[name]
        record(name, checks)
    return results, failed


def contact_sheet(files, target):
    sheet = Image.new('RGB', (6 * 484 + 4, 4 * 274 + 4), 'white')
    for index in range(24):
        with Image.open(BytesIO(files[file_name(index + 1)])) as image:
            sheet.paste(image.resize((480, 270), Image.Resampling.LANCZOS), (4 + index % 6 * 484, 4 + index // 6 * 274))
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target, 'PNG')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--report', type=Path)
    parser.add_argument('--sheet', type=Path)
    args = parser.parse_args()
    generated = build()
    if not args.check:
        DEST.mkdir(parents=True, exist_ok=True)
        for name, data in generated.items():
            (DEST / name).write_bytes(data)
    if args.sheet:
        contact_sheet(generated, args.sheet)
    results, failed = validate(generated)
    report = {'status': 'FAIL' if failed else 'PASS', 'seed': SEED, 'files': results, 'failed': failed}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'files': len(results), 'checks': sum(len(entry['checks']) for entry in results),
                      'failed': failed, 'bytes': {entry['file']: entry['bytes'] for entry in results},
                      'titleZoneContrast': {entry['file']: entry['titleZoneContrast'] for entry in results if 'titleZoneContrast' in entry}},
                     ensure_ascii=False))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
