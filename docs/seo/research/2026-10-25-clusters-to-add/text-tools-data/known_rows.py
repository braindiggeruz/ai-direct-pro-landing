# Print series of already-measured lens heads (from earlier files) to dedupe against tt_kw1 rows.
import json, os, glob
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = r"F:\Claude\gptbot-snippets-translator-20261024\docs\seo\research"
rows = {}
files = [os.path.join(HERE, 'tt_kw1_metrics.json')] + glob.glob(BASE + r"\2026-10-24-growth-audit\l3-data\kw*_metrics.json") + glob.glob(BASE + r"\2026-10-25-roadmap-1000\data\kw*_metrics.json") + [f for f in glob.glob(BASE + r"\2026-10-25-clusters-to-add\*-data\*metrics*.json") if 'text-tools-data' not in f]
for f in files:
    for r in json.load(open(f, encoding='utf-8')).get('keywords', []):
        rows.setdefault(r['keyword'].lower(), dict(r, src=os.path.basename(f)))
def ser(r):
    return ' '.join(str(m['search_volume']) for m in sorted(r.get('monthly_searches') or [], key=lambda m: (m['year'], m['month'])))
heads = ["she'rlar", "sherlar", "sher", "maqollar", "maqol", "topishmoqlar", "topishmoq", "ertaklar", "hikoya", "hikoyalar",
         "imlo", "imlo tekshirish", "imlo uz", "matn yaratish", "matn", "tugilgan kun tabriklari", "tabriklar", "табриклар", "табрик",
         "yangi yil tabriklari", "sevgi she'rlari", "sevgi sherlari", "ism ma'nosi", "ismlar ma'nosi", "ismlar manosi", "esse", "insho",
         "поздравление с днем рождения", "поздравления с днем рождения", "проверка орфографии", "перефразировать текст", "xat yozish",
         "xulosa yozish", "inglizcha statuslar", "mantiqiy savollar", "zakovat savollari", "imlo qoidalari", "diktant", "kitob haqida she'r",
         "vatan haqida sher", "ustoz haqida sher", "лотин кирилл", "кирилл лотин", "kirill lotin", "lotin krill", "krill lotin"]
for h in heads:
    r = rows.get(h)
    print(f"{h} | {r.get('search_volume') if r else '-'} | {ser(r) if r else ''} | {r['src'] if r else ''}")
