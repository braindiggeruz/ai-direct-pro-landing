#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Builds the birth-place search shards of the natal chart page from GeoNames dumps.

usage: py -3 -I scripts/natal/build-places.py <download dir> public/natal/places
       py -3 -I scripts/natal/build-places.py --normalize     (JSON array on stdin -> JSON array on stdout)

<download dir> holds cities15000.zip, UZ.zip, alt-UZ.zip, admin1CodesASCII.txt, countryInfo.txt and,
optionally, alt-world.zip (= alternateNamesV2.zip: 'uz'/'ru' names of the world cities; without it
the converter falls back to the Cyrillic names in the alternatenames column, which are often not Russian)
(GeoNames, https://download.geonames.org/export/dump/, licence CC BY 4.0).

Entry: [id, nameUz, nameRu, regionUz, regionRu, country, lat, lon, zoneIndex, population, keys]
keys = '|'-joined normalized names. regionRu '' means 'same as regionUz'. The normalize() function here and normalizePlace()
in src/tools/natal/places.ts MUST stay identical (tests/natal-places.test.ts compares them).
"""
import io
import json
import os
import re
import sys
import unicodedata
import zipfile

MAX_SHARD_BYTES = 190000
MAX_PREFIX = 12
ATTRIBUTION = 'Place names and coordinates: GeoNames (geonames.org), CC BY 4.0'
SOURCE = 'GeoNames (https://www.geonames.org/), https://download.geonames.org/export/dump/ cities15000 + UZ, CC BY 4.0'
UZ_EXCLUDED = {'PPLX', 'PPLQ', 'PPLH', 'PPLW', 'PPLCH'}

# ---------------------------------------------------------------- normalize

# One fixed table: Russian and Uzbek (and a few neighbour) Cyrillic letters -> Latin.
CYR = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z',
    'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 's', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh',
    'ъ': '', 'ы': 'i', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'ў': 'o', 'қ': 'q', 'ғ': 'g', 'ҳ': 'h', 'ҷ': 'j', 'ӣ': 'i', 'ӯ': 'u', 'ә': 'a', 'ө': 'o',
    'ү': 'u', 'ұ': 'u', 'ң': 'ng', 'һ': 'h', 'і': 'i', 'ї': 'yi', 'є': 'ye', 'ґ': 'g',
    'ѐ': 'e', 'ѝ': 'i', 'ј': 'j', 'љ': 'lj', 'њ': 'nj', 'ћ': 'c', 'џ': 'j', 'ђ': 'd', 'ѓ': 'g',
    'ќ': 'k', 'ѕ': 'z',
}
# Latin letters that Unicode decomposition leaves alone.
LAT = {'ı': 'i', 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th'}
APOSTROPHES = "ʻʼʽʹʾʿ’‘´`'"


def normalize(text):
    s = text.lower()
    out = []
    for ch in s:
        if ch in CYR:
            out.append(CYR[ch])
        elif ch in LAT:
            out.append(LAT[ch])
        elif ch in APOSTROPHES:
            continue
        else:
            out.append(ch)
    s = unicodedata.normalize('NFKD', ''.join(out))
    s = ''.join(c for c in s if not unicodedata.category(c).startswith('M'))
    s = ''.join(c for c in s if c not in APOSTROPHES)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return s.strip()


def shard_char(c):
    return c if 'a' <= c <= 'z' else '_'


def shard_prefix(normalized, n):
    return ''.join(shard_char(c) for c in normalized[:n])


# ---------------------------------------------------------------- display names

DISPLAY = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z',
    'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 's', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh',
    'ъ': 'ʼ', 'ы': 'i', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'ў': 'oʻ', 'қ': 'q', 'ғ': 'gʻ', 'ҳ': 'h', 'ҷ': 'j', 'ә': 'a', 'ө': 'oʻ', 'ү': 'u', 'ң': 'ng',
    'і': 'i', 'ї': 'yi', 'є': 'ye', 'ґ': 'g',
}
CYR_RE = re.compile('[Ѐ-ӿ]')
UK_ONLY = set('іїєґўәөүұңһ')  # letters that mark a name as not plainly Russian


def has_cyr(s):
    return bool(CYR_RE.search(s))


def has_latin(s):
    return bool(re.search('[A-Za-z]', s))


def uz_latin(text):
    """Uzbek Cyrillic -> Uzbek Latin for display."""
    out = []
    word_start = True
    for ch in text:
        low = ch.lower()
        if low in DISPLAY:
            rep = DISPLAY[low]
            if low == 'е' and word_start:
                rep = 'ye'
            if ch != low and rep:
                rep = rep[0].upper() + rep[1:]
            out.append(rep)
            word_start = False
        else:
            out.append(ch)
            word_start = not ch.isalpha()
    return ''.join(out)


# ---------------------------------------------------------------- countries

COUNTRY_NAMES = {
    'UZ': ('Oʻzbekiston', 'Узбекистан'), 'KZ': ('Qozogʻiston', 'Казахстан'),
    'KG': ('Qirgʻiziston', 'Киргизия'), 'TJ': ('Tojikiston', 'Таджикистан'),
    'TM': ('Turkmaniston', 'Туркменистан'), 'AF': ('Afgʻoniston', 'Афганистан'),
    'RU': ('Rossiya', 'Россия'), 'UA': ('Ukraina', 'Украина'), 'BY': ('Belarus', 'Беларусь'),
    'AZ': ('Ozarbayjon', 'Азербайджан'), 'AM': ('Armaniston', 'Армения'),
    'GE': ('Gruziya', 'Грузия'), 'TR': ('Turkiya', 'Турция'), 'CN': ('Xitoy', 'Китай'),
    'IN': ('Hindiston', 'Индия'), 'PK': ('Pokiston', 'Пакистан'), 'IR': ('Eron', 'Иран'),
    'US': ('AQSH', 'США'), 'DE': ('Germaniya', 'Германия'),
    'GB': ('Buyuk Britaniya', 'Великобритания'), 'KR': ('Janubiy Koreya', 'Южная Корея'),
    'AE': ('BAA', 'ОАЭ'), 'SA': ('Saudiya Arabistoni', 'Саудовская Аравия'),
    'EG': ('Misr', 'Египет'), 'IL': ('Isroil', 'Израиль'), 'PL': ('Polsha', 'Польша'),
    'FR': ('Fransiya', 'Франция'), 'IT': ('Italiya', 'Италия'), 'ES': ('Ispaniya', 'Испания'),
}

# ---------------------------------------------------------------- reading


def read_zip_text(path, member):
    with zipfile.ZipFile(path) as z:
        with z.open(member) as f:
            return io.TextIOWrapper(f, encoding='utf-8', newline='').read()


def rows(text):
    for line in text.split('\n'):
        line = line.rstrip('\r')
        if line and not line.startswith('#'):
            yield line.split('\t')


def read_alt(path, wanted=None):
    """geonameid -> {'uz': [(name, preferred, short, colloquial)], 'ru': [...]} non-historic only.
    Streams the file; `wanted` (a set of geonameids) keeps big dumps small."""
    out = {}
    with zipfile.ZipFile(path) as z:
        member = [n for n in z.namelist() if n.lower().endswith('.txt') and 'readme' not in n.lower()
                  and 'iso-languagecodes' not in n.lower() and 'alternatenames' in n.lower() or n == 'UZ.txt'][0]
        with z.open(member) as f:
            for line in io.TextIOWrapper(f, encoding='utf-8', newline=''):
                if '\tuz\t' not in line and '\tru\t' not in line:
                    continue
                r = line.rstrip('\r\n').split('\t')
                if len(r) < 4 or r[2] not in ('uz', 'ru'):
                    continue
                gid = int(r[1])
                if wanted is not None and gid not in wanted:
                    continue
                if len(r) > 7 and r[7] == '1':
                    continue
                name = r[3].strip()
                if not name:
                    continue
                pref = len(r) > 4 and r[4] == '1'
                short = len(r) > 5 and r[5] == '1'
                coll = len(r) > 6 and r[6] == '1'
                out.setdefault(gid, {'uz': [], 'ru': []})[r[2]].append((name, pref, short, coll))
    return out


def ranked(cands):
    """preferred first, then neither short nor colloquial, then file order."""
    idx = list(range(len(cands)))
    idx.sort(key=lambda i: (not cands[i][1], cands[i][2] or cands[i][3], i))
    return [cands[i][0] for i in idx]


def pick_uz(alts, name):
    names = ranked(alts.get('uz', [])) if alts else []
    for n in names:
        if has_latin(n) and not has_cyr(n):
            return n, 'uz-latin'
    for n in names:
        if has_cyr(n):
            return uz_latin(n), 'uz-cyrillic'
    return name, 'name'


def clean_ru_cyr(names):
    for n in names:
        if has_cyr(n) and not any(c in UK_ONLY for c in n.lower()):
            return n
    return None


def pick_ru(alts, column, name):
    names = ranked(alts.get('ru', [])) if alts else []
    n = clean_ru_cyr(names)
    if n:
        return n, 'ru'
    for x in names:
        if has_cyr(x):
            return x, 'ru'
    if names:
        return names[0], 'ru-latin'
    n = clean_ru_cyr(column)
    if n:
        return n, 'column'
    return name, 'name'


def collect_keys(ordered, cap):
    seen = []
    for n in ordered:
        if not n or len(n) > 60 or (len(n) <= 4 and n.isupper() and n.isascii()):
            continue  # too long, or an airport/abbreviation code such as TAS, NYC
        k = normalize(n)
        if k and k not in seen:
            seen.append(k)
            if len(seen) >= cap:
                break
    return '|'.join(seen)


def build(download_dir, out_dir):
    d = download_dir
    admin1_ascii = {}
    with open(os.path.join(d, 'admin1CodesASCII.txt'), encoding='utf-8') as f:
        for r in rows(f.read()):
            if len(r) >= 3:
                admin1_ascii[r[0]] = r[2] or r[1]

    country_en = {}
    with open(os.path.join(d, 'countryInfo.txt'), encoding='utf-8') as f:
        for r in rows(f.read()):
            if len(r) > 4:
                country_en[r[0]] = r[4]

    alt = read_alt(os.path.join(d, 'alt-UZ.zip'))
    uz_rows = list(rows(read_zip_text(os.path.join(d, 'UZ.zip'), 'UZ.txt')))
    world_rows = list(rows(read_zip_text(os.path.join(d, 'cities15000.zip'), 'cities15000.txt')))
    world_alt_path = os.path.join(d, 'alt-world.zip')  # optional: GeoNames alternateNamesV2.zip
    world_alt = {}
    if os.path.exists(world_alt_path):
        world_alt = read_alt(world_alt_path, set(int(r[0]) for r in world_rows if r[8] != 'UZ'))

    version = ''
    for r in uz_rows + world_rows:
        if len(r) > 18 and r[18] > version:
            version = r[18]

    # Uzbek regions from the ADM1 features
    regions = {}
    for r in uz_rows:
        if r[6] == 'A' and r[7] == 'ADM1':
            a = alt.get(int(r[0]))
            uz_name = pick_uz(a, r[1])[0]
            ru_name = pick_ru(a, [], r[1])[0]
            fallback = admin1_ascii.get('UZ.' + r[10], r[1])
            if not uz_name or uz_name == r[1]:
                uz_name = fallback
            regions[r[10]] = (uz_name, ru_name, r[17])

    stats = {'uz_total': 0, 'uz_name_from': {}, 'uz_ru_from': {}, 'world_total': 0,
             'skipped_no_zone': 0, 'skipped_no_key': 0}
    entries = []  # (country, id, population, entry)

    def bump(d_, k):
        d_[k] = d_.get(k, 0) + 1

    for r in uz_rows:
        if r[6] != 'P' or r[7] in UZ_EXCLUDED:
            continue
        gid = int(r[0])
        a = alt.get(gid)
        column = [x for x in r[3].split(',') if x]
        name_uz, how_uz = pick_uz(a, r[1])
        name_ru, how_ru = pick_ru(a, column, r[1])
        reg = regions.get(r[10], (admin1_ascii.get('UZ.' + r[10], ''), admin1_ascii.get('UZ.' + r[10], ''), ''))
        zone = r[17] or reg[2]
        if not zone:
            stats['skipped_no_zone'] += 1
            continue
        ordered = [name_uz, name_ru, r[1], r[2]]
        if a:
            ordered += ranked(a.get('uz', [])) + ranked(a.get('ru', []))
        ordered += column
        keys = collect_keys(ordered, 8)
        if not keys:
            stats['skipped_no_key'] += 1
            continue
        pop = int(r[14] or 0)
        entries.append(('UZ', gid, pop, [gid, name_uz, name_ru, reg[0], '' if reg[1] == reg[0] else reg[1], 'UZ',
                                         round(float(r[4]), 4), round(float(r[5]), 4), zone, pop, keys]))
        stats['uz_total'] += 1
        bump(stats['uz_name_from'], how_uz)
        bump(stats['uz_ru_from'], how_ru)

    for r in world_rows:
        cc = r[8]
        if cc == 'UZ':
            continue
        gid = int(r[0])
        zone = r[17]
        if not zone:
            stats['skipped_no_zone'] += 1
            continue
        column = [x for x in r[3].split(',') if x]
        a = world_alt.get(gid)
        if a:
            name_uz = pick_uz(a, r[1])[0]
            name_ru = pick_ru(a, column, r[1])[0]
        else:
            name_uz = r[1]
            name_ru = clean_ru_cyr(column) or next((x for x in column if has_cyr(x)), None) or r[1]
        reg_name = admin1_ascii.get(cc + '.' + r[10], '')
        ordered = [name_uz, name_ru, r[1], r[2]]
        if a:
            ordered += ranked(a.get('uz', [])) + ranked(a.get('ru', []))
        ordered += column
        keys = collect_keys(ordered, 5)
        if not keys:
            stats['skipped_no_key'] += 1
            continue
        pop = int(r[14] or 0)
        entries.append((cc, gid, pop, [gid, name_uz, name_ru, reg_name, '', cc,
                                       round(float(r[4]), 4), round(float(r[5]), 4), zone, pop, keys]))
        stats['world_total'] += 1

    zones = sorted(set(e[3][8] for e in entries))
    zone_index = {z: i for i, z in enumerate(zones)}
    for e in entries:
        e[3][8] = zone_index[e[3][8]]

    entries.sort(key=lambda e: (e[0] != 'UZ', -e[2], e[1]))
    flat = [e[3] for e in entries]

    countries = {}
    for e in flat:
        cc = e[5]
        if cc not in countries:
            if cc in COUNTRY_NAMES:
                countries[cc] = {'uz': COUNTRY_NAMES[cc][0], 'ru': COUNTRY_NAMES[cc][1]}
            else:
                en = country_en.get(cc, cc)
                countries[cc] = {'uz': en, 'ru': en}

    def dump(obj):
        return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

    # shards: split by growing prefix until every shard fits
    shards = {}

    def place_children(items, prefix, n):
        bucket = {}
        for e in items:
            seen = set()
            for k in e[10].split('|'):
                p = shard_prefix(k, n)
                if shard_prefix(k, n - 1) == prefix and p not in seen:
                    seen.add(p)
                    bucket.setdefault(p, []).append(e)
        for p in sorted(bucket):
            sub = bucket[p]
            size = len(dump(sub))
            if size > MAX_SHARD_BYTES and n < MAX_PREFIX and len(p) == n and \
               len(set(shard_prefix(k, n + 1) for e in sub for k in e[10].split('|') if shard_prefix(k, n) == p)) > 1:
                place_children(sub, p, n + 1)
            else:
                shards[p] = sub

    place_children(flat, '', 1)

    os.makedirs(out_dir, exist_ok=True)
    for fn in os.listdir(out_dir):
        if fn.endswith('.json'):
            os.remove(os.path.join(out_dir, fn))
    counts = {}
    total_bytes = 0
    biggest = 0
    for p in sorted(shards):
        data = dump(shards[p])
        if len(data) > MAX_SHARD_BYTES:
            print('WARNING: shard %s is %d bytes (> %d), cannot split further' % (p, len(data), MAX_SHARD_BYTES), file=sys.stderr)
        biggest = max(biggest, len(data))
        total_bytes += len(data)
        with open(os.path.join(out_dir, p + '.json'), 'wb') as f:
            f.write(data)
        counts[p] = len(shards[p])

    meta = {
        'version': version,
        'source': SOURCE,
        'attribution': ATTRIBUTION,
        'zones': zones,
        'countries': {k: countries[k] for k in sorted(countries)},
        'shards': counts,
    }
    mdata = dump(meta)
    with open(os.path.join(out_dir, 'meta.json'), 'wb') as f:
        f.write(mdata)
    stats.update({'version': version, 'entries': len(flat), 'shards': len(counts), 'zones': len(zones),
                  'shard_bytes': total_bytes, 'meta_bytes': len(mdata), 'biggest_shard': biggest})
    print(json.dumps(stats, ensure_ascii=False, indent=1, sort_keys=True))


def main(argv):
    if len(argv) == 2 and argv[1] == '--normalize':
        data = json.loads(sys.stdin.buffer.read().decode('utf-8'))
        sys.stdout.buffer.write(json.dumps([normalize(x) for x in data], ensure_ascii=False).encode('utf-8'))
        return 0
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    build(argv[1], argv[2])
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
