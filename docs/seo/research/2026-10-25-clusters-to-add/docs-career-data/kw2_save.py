"""Persist the second get_keyword_metrics call of this lens (2026-10-25, 77 keyword rows returned, location 2860; the tool answered inline).
Series are copied from the tool output in its own order: Sep-2026 first ... Oct-2025 last. Null rows are kept with volume None.
Writes dc_kw2_metrics.json in the same shape as the other *_metrics.json files.
Run: py -3 -I kw2_save.py
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = {
 "amaliyot kundaligi to'ldirish": (110000, [165000,135000,165000,246000,201000,165000,110000,110000,74000,22200,1900,30]),
 "тилхат": (8100, [18100,8100,9900,12100,18100,14800,9900,9900,6600,2400,320,140]),
 "hisobot namuna": (2400, [1900,880,880,8100,5400,4400,2900,1900,1900,1600,590,390]),
 "farmoyish hujjatlari": (720, [480,320,170,480,880,1600,1000,880,590,880,1000,720]),
 "faxriy yorliq shablon": (720, [210,170,140,320,2400,720,880,880,880,1600,720,480]),
 "tashakkurnoma shablon": (720, [590,320,260,480,1900,590,590,590,480,1300,720,590]),
 "maqtov yorlig'i": (480, [210,170,140,210,1600,390,480,480,390,720,320,390]),
 "tashkiliy hujjatlar": (390, [40,10,10,110,390,880,390,210,390,880,720,720]),
 "rasmiy uslub": (390, [320,20,50,140,320,720,320,320,720,590,720,720]),
 "amaliyot kundaligi yozish": (390, [40,50,210,880,880,1000,590,480,480,210,110,70]),
 "rezyume namunasi pdf": (390, [320,390,390,480,480,590,480,480,320,260,170,260]),
 "e'lon yozish namunasi": (320, [110,70,90,70,210,320,170,260,880,390,1000,110]),
 "bayonnoma yozish": (260, [170,50,50,110,210,320,260,1300,260,140,110,70]),
 "sertifikat namuna": (210, [260,170,210,390,320,260,210,260,210,110,90,90]),
 "amaliyot kundaligi pdf": (210, [30,10,50,210,480,480,260,170,210,210,170,170]),
 "dalolatnoma nima": (210, [90,70,90,140,170,260,140,140,210,260,390,260]),
 "тилхат намуна": (210, [170,110,110,170,260,320,210,210,260,260,260,320]),
 "tarjimai hol blanka": (170, [210,110,70,90,90,210,170,210,170,140,140,390]),
 "rasmiy hujjatlar": (140, [140,70,70,90,170,260,170,110,110,140,70,140]),
 "bildirishnoma yozish namunasi": (140, [170,40,30,140,260,260,140,140,140,170,170,170]),
 "bayonnoma nima": (140, [40,20,30,70,110,170,140,260,210,260,260,170]),
 "кафолат хати": (140, [140,110,90,140,260,210,140,90,110,170,90,140]),
 "ish qog'ozlari": (110, [210,110,90,110,260,210,90,110,110,40,20,20]),
 "ish yuritish hujjatlari": (110, [70,50,70,140,210,320,110,110,90,140,70,50]),
 "баённома": (110, [90,50,90,110,110,140,140,170,110,140,140,110]),
 "bildirishnoma nima": (90, [30,40,40,50,70,110,50,50,110,170,260,140]),
 "tilxat nima": (90, [30,10,10,30,90,50,70,70,110,170,260,140]),
 "ishonchnoma nima": (90, [40,30,40,40,90,90,70,70,110,170,210,110]),
 "ariza nima": (90, [40,30,20,70,90,140,90,70,140,170,140,140]),
 "ish yuritish": (70, [70,20,30,40,90,90,70,70,90,70,90,90]),
 "kafolat xati yozish": (70, [20,20,20,20,170,30,50,50,50,170,70,70]),
 "tushuntirish xati nima": (70, [50,30,30,40,110,110,70,110,50,90,110,90]),
 "фахрий ёрлиқ": (70, [30,70,20,20,110,40,70,50,70,140,70,50]),
 "делопроизводство": (50, [50,30,40,30,70,40,50,50,40,50,40,40]),
 "tilxat qanday yoziladi": (50, [70,20,20,20,70,50,50,70,40,90,50,90]),
 "tarjimai hol nima": (50, [70,10,10,10,50,50,30,50,90,70,110,110]),
 "e'lon namuna": (50, [10,10,10,30,140,210,50,30,110,40,50,20]),
 "hujjat namunalari": (30, [20,10,10,20,20,30,20,10,30,140,40,20]),
 "амалиёт кундалиги": (30, [10,10,20,10,30,90,70,40,50,40,10,20]),
 "cv generator": (20, [10,10,10,10,10,10,20,20,20,10,10,20]),
 "sertifikat yaratish": (10, [10,10,10,10,20,30,20,20,30,0,0,0]),
 "резюме генератор": (10, [10,10,10,10,0,10,10,10,10,0,10,0]),
 "образцы документов": (10, [10,10,10,10,10,10,10,0,10,10,10,0]),
 "деловые бумаги": (10, [10,10,10,0,10,10,10,20,10,10,10,10]),
 "o'qituvchi hisoboti": (10, [0,10,0,10,10,10,10,10,20,20,10,10]),
 "sinf rahbar hisoboti": (10, [10,0,0,10,20,10,10,10,30,10,30,10]),
 "oylik hisobot": (10, [20,10,10,10,20,20,10,10,20,10,10,20]),
 "obyektivka namunasi pdf": (10, [10,10,10,0,0,10,10,10,0,10,20,30]),
 "ҳисобот намуна": (10, [0,0,0,0,10,0,0,0,10,10,0,10]),
}
NULL = ["ish qog'ozlari namunalari", "ish qogozlari", "davlat tilida ish yuritish", "hujjatlar namunasi",
        "rasmiy hujjatlar namunalari", "ma'lumot-axborot hujjatlari", "rasmiy uslub namuna", "ish qog'ozlari 8 sinf",
        "ish qog'ozlari 7 sinf", "maqtov yorlig'i namuna", "faxriy yorliq yaratish", "tashakkurnoma yaratish",
        "rezyume generator", "obyektivka generator", "hujjat yaratish", "amaliyot kundaligi namunasi",
        "amaliyot kundaligi word", "kundalik namuna", "amaliyot kundaligi shablon", "ish hisoboti",
        "bildirishnoma qanday yoziladi", "tilxat namunasi word", "qarz tilxati", "tarjimai hol yozish tartibi",
        "taqdimnoma yozish", "баённома намуна", "резюме самарканд", "ташаккурнома"]
months = [(2026, m) for m in range(9, 0, -1)] + [(2025, 12), (2025, 11), (2025, 10)]
kws = []
for kw, (v, ser) in ROWS.items():
    assert len(ser) == 12, kw
    kws.append({'keyword': kw, 'search_volume': v,
                'monthly_searches': [{'year': y, 'month': m, 'search_volume': s} for (y, m), s in zip(months, ser)]})
for kw in NULL:
    kws.append({'keyword': kw, 'search_volume': None, 'monthly_searches': None})
json.dump({'keywords': kws, 'meta': {'source': 'get_keyword_metrics 2026-10-25, location 2860, default language; copied from inline answer'}},
          open(os.path.join(HERE, 'dc_kw2_metrics.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(kws), 'rows written')
