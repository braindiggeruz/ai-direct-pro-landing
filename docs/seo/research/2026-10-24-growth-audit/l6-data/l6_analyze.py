"""Extract comparable on-page signals from saved HTML (competitors + own dist build).
usage: py -3 -I analyze.py <fetch_dir> <dist_dir> <out_json>
"""
import json, sys, os, re
from html.parser import HTMLParser

FETCH, DIST, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

OWN_DIST = [
    ("q1", "/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/"),
    ("q2", "/uz/blog/chatgptga-qanday-kirish-mumkin/"),
    ("q2", "/uz/gpt-uzbek-tilida/"),
    ("q3", "/uz/suniy-intellekt/"),
    ("q4", "/ru/gpt-na-russkom/"),
    ("q4", "/ru/blog/chat-gpt-na-russkom/"),
    ("q4", "/ru/gpt-chat/"),
    ("q5", "/uz/telegram-bot-biznes-uchun/"),
    ("q5", "/uz/chat-bot-narxi/"),
    ("q6", "/ru/chat-bot-dlya-biznesa/"),
    ("q6", "/ru/razrabotka-telegram-bota-tashkent/"),
    ("q6", "/ru/blog/chat-bot-dlya-biznesa-v-tashkente-kak-vybrat-kanal/"),
    ("q6", "/ru/stoimost-chat-bota/"),
]

class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.title = ""
        self.in_title = False
        self.meta = {}
        self.links = []
        self.headings = []  # (level, text)
        self.cur_h = None
        self.cur_h_text = []
        self.text = []
        self.skip = 0
        self.scripts = []  # attrs
        self.ld = []
        self.in_ld = False
        self.ld_buf = []
        self.in_head = False
        self.head_blocking_js = 0
        self.css_links = 0
        self.imgs = []
        self.a = []
        self.forms = 0
        self.textareas = 0
        self.inputs = 0
        self.iframes = []
        self.details = 0
        self.tables = 0
        self.videos = 0
        self.lang = ""
        self.time_tags = []
        self.itemtypes = []
        self.inline_script_bytes = 0
        self.in_script = False
        self.cur_script_inline = False
        self.style_bytes = 0
        self.in_style = False

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html":
            self.lang = a.get("lang", "")
        if tag == "head":
            self.in_head = True
        if tag == "title" and not self.title:
            self.in_title = True
        if tag == "meta":
            k = (a.get("name") or a.get("property") or a.get("itemprop") or "").lower()
            if k:
                self.meta.setdefault(k, []).append(a.get("content", ""))
        if tag == "link":
            self.links.append(a)
            if "stylesheet" in a.get("rel", "").lower():
                self.css_links += 1
        if tag == "script":
            self.scripts.append(a)
            t = a.get("type", "").lower()
            if t == "application/ld+json":
                self.in_ld = True
                self.ld_buf = []
            else:
                self.in_script = True
                self.cur_script_inline = not a.get("src")
                if self.in_head and a.get("src") and "async" not in a and "defer" not in a and t != "module":
                    self.head_blocking_js += 1
        if tag == "style":
            self.in_style = True
        if tag in ("script", "style", "noscript", "svg"):
            self.skip += 1
        if re.fullmatch(r"h[1-6]", tag):
            self.cur_h = int(tag[1])
            self.cur_h_text = []
        if tag == "img":
            self.imgs.append(a)
        if tag == "a":
            self.a.append(a)
        if tag == "form":
            self.forms += 1
        if tag == "textarea":
            self.textareas += 1
        if tag == "input" and a.get("type", "text").lower() not in ("hidden",):
            self.inputs += 1
        if tag == "iframe":
            self.iframes.append(a.get("src", ""))
        if tag == "details":
            self.details += 1
        if tag == "table":
            self.tables += 1
        if tag == "video":
            self.videos += 1
        if tag == "time":
            self.time_tags.append(a.get("datetime", ""))
        if "itemtype" in a:
            self.itemtypes.append(a["itemtype"].rsplit("/", 1)[-1])
        if tag in ("p", "div", "li", "br", "section", "article", "td", "th", "tr"):
            self.text.append(" ")

    def handle_endtag(self, tag):
        if tag == "head":
            self.in_head = False
        if tag == "title":
            self.in_title = False
        if tag == "script":
            if self.in_ld:
                self.ld.append("".join(self.ld_buf))
                self.in_ld = False
            self.in_script = False
        if tag == "style":
            self.in_style = False
        if tag in ("script", "style", "noscript", "svg") and self.skip:
            self.skip -= 1
        if re.fullmatch(r"h[1-6]", tag) and self.cur_h:
            self.headings.append((self.cur_h, re.sub(r"\s+", " ", "".join(self.cur_h_text)).strip()))
            self.cur_h = None

    def handle_data(self, d):
        if self.in_title:
            self.title += d
        if self.in_ld:
            self.ld_buf.append(d)
            return
        if self.in_script and self.cur_script_inline:
            self.inline_script_bytes += len(d.encode("utf-8"))
        if self.in_style:
            self.style_bytes += len(d.encode("utf-8"))
        if self.skip:
            return
        if self.cur_h:
            self.cur_h_text.append(d)
        self.text.append(d)


def ld_types(blobs):
    types, dates, authors, faq_q, agg = set(), {}, [], 0, None
    def walk(o):
        nonlocal faq_q, agg
        if isinstance(o, dict):
            t = o.get("@type")
            if isinstance(t, list):
                for x in t: types.add(str(x))
            elif t:
                types.add(str(t))
            for k in ("datePublished", "dateModified", "uploadDate"):
                if k in o and isinstance(o[k], str):
                    dates.setdefault(k, o[k])
            if "author" in o:
                au = o["author"]
                if isinstance(au, dict):
                    authors.append(f"{au.get('@type','')}:{au.get('name','')}")
                elif isinstance(au, list):
                    for x in au:
                        if isinstance(x, dict): authors.append(f"{x.get('@type','')}:{x.get('name','')}")
                elif isinstance(au, str):
                    authors.append(au)
            if o.get("@type") == "Question":
                faq_q += 1
            if "aggregateRating" in o and isinstance(o["aggregateRating"], dict):
                ar = o["aggregateRating"]
                agg = f"{ar.get('ratingValue')}/{ar.get('ratingCount') or ar.get('reviewCount')}"
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    bad = 0
    for b in blobs:
        try:
            walk(json.loads(b.strip()))
        except Exception:
            bad += 1
    return sorted(types), dates, authors[:5], faq_q, agg, bad


def analyze(html, host):
    p = P()
    try:
        p.feed(html)
    except Exception as e:
        pass
    text = re.sub(r"\s+", " ", "".join(p.text)).strip()
    words = len(re.findall(r"[\wЀ-ӿ'‘’ʼ-]+", text))
    types, dates, authors, faq_q, agg, bad = ld_types(p.ld)
    canon = [l.get("href") for l in p.links if l.get("rel", "").lower() == "canonical"]
    hreflang = [l.get("hreflang") for l in p.links if l.get("hreflang")]
    preload = sum(1 for l in p.links if l.get("rel", "").lower() in ("preload", "modulepreload"))
    h = p.headings
    faq_heading = any(re.search(r"faq|savol|вопрос|ko.?p so.?ral|часто", t, re.I) for _, t in h)
    low = text.lower()
    yrs = sorted(set(re.findall(r"\b(20[12]\d)\b", text)))
    visible_dates = re.findall(r"\b\d{1,2}[./-]\d{1,2}[./-]20\d\d\b|\b20\d\d-\d\d-\d\d\b|\b\d{1,2}\s+(?:yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr|oktabr|noyabr|dekabr|январ\w*|феврал\w*|март\w*|апрел\w*|ма[яй]|июн\w*|июл\w*|август\w*|сентябр\w*|октябр\w*|ноябр\w*|декабр\w*)\s+20\d\d", text, re.I)
    ext_scripts = [s.get("src") for s in p.scripts if s.get("src")]
    imgs_no_alt = sum(1 for i in p.imgs if not i.get("alt"))
    lazy = sum(1 for i in p.imgs if i.get("loading") == "lazy")
    a_int = a_ext = 0
    for a in p.a:
        href = a.get("href", "")
        if href.startswith("http") and host not in href:
            a_ext += 1
        elif href and not href.startswith(("#", "mailto:", "tel:", "javascript:")):
            a_int += 1
    signals = {
        "not_affiliated_disclaimer": bool(re.search(r"not affiliated|не связан|не является официальн|не аффилир|aloqador emas|bog.?liq emas|rasmiy (?:sayti|vakili|hamkori) emas|neofitsial|неофициальн", low)),
        "claims_official": bool(re.search(r"rasmiy sayt|официальный сайт|official site", low)),
        "phone": bool(re.search(r"\+?998[\s\-()]*\d{2}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}", text)),
        "tel_link": any(a.get("href", "").startswith("tel:") for a in p.a),
        "address": bool(re.search(r"ташкент,|toshkent sh|ул\.|ko.?chasi|улица|mirzo|юнусабад|chilonzor|чиланзар|yunusobod", low)),
        "price_text": bool(re.search(r"\d[\d\s]*(?:so.?m|сум|mln|млн|\$|usd)", low)),
        "case_or_portfolio": bool(re.search(r"keys|кейс|portfolio|портфолио|loyihalar|наши работы|bizning ishlar", low)),
        "reviews_text": bool(re.search(r"otzыv|отзыв|sharh|fikrlar|mijozlarimiz fikri|review", low)),
        "author_text": bool(re.search(r"muallif|автор|author", low)),
        "steps_numbered": len(re.findall(r"(?:^|\s)(?:\d{1,2}[.)]|qadam|шаг)\s", text, re.I)),
        "mentions_apk": "apk" in low,
        "mentions_play_store": bool(re.search(r"google play|play market|play store", low)),
        "mentions_app_store": "app store" in low,
        "mentions_vpn": "vpn" in low,
        "mentions_free": bool(re.search(r"bepul|бесплатн|free", low)),
        "mentions_no_registration": bool(re.search(r"ro.?yxatsiz|ro.?yxatdan o.?tmasdan|без регистрации|no registration|no login", low)),
        "model_names": sorted(set(m.lower() for m in re.findall(r"gpt-?[3-6](?:\.\d)?o?|gpt-?4o|claude|gemini|deepseek|llama|grok", low))),
    }
    return {
        "title": re.sub(r"\s+", " ", p.title).strip()[:200],
        "title_len": len(re.sub(r"\s+", " ", p.title).strip()),
        "description": (p.meta.get("description") or [""])[0][:300],
        "lang": p.lang,
        "canonical": canon[:2],
        "hreflang_n": len(hreflang),
        "robots": p.meta.get("robots"),
        "og_type": (p.meta.get("og:type") or [None])[0],
        "article_modified": (p.meta.get("article:modified_time") or p.meta.get("og:updated_time") or [None])[0],
        "article_published": (p.meta.get("article:published_time") or [None])[0],
        "words": words,
        "h1": [t for l, t in h if l == 1][:3],
        "h2": [t for l, t in h if l == 2][:40],
        "h2_n": sum(1 for l, _ in h if l == 2),
        "h3_n": sum(1 for l, _ in h if l == 3),
        "faq_heading": faq_heading,
        "details_n": p.details,
        "jsonld_types": types,
        "jsonld_bad_blocks": bad,
        "jsonld_dates": dates,
        "jsonld_authors": authors,
        "jsonld_faq_questions": faq_q,
        "aggregateRating": agg,
        "microdata_types": sorted(set(p.itemtypes))[:10],
        "time_tags": p.time_tags[:5],
        "years_in_text": yrs,
        "visible_dates": visible_dates[:5],
        "forms": p.forms, "textareas": p.textareas, "inputs": p.inputs,
        "iframes": [s[:90] for s in p.iframes][:5],
        "videos": p.videos, "tables": p.tables,
        "imgs": len(p.imgs), "imgs_no_alt": imgs_no_alt, "imgs_lazy": lazy,
        "links_internal": a_int, "links_external": a_ext,
        "ext_scripts_n": len(ext_scripts),
        "ext_script_hosts": sorted(set(re.sub(r"^https?://([^/]+).*", r"\1", s) for s in ext_scripts if s.startswith("http")))[:12],
        "head_blocking_js": p.head_blocking_js,
        "css_links": p.css_links,
        "inline_script_kb": round(p.inline_script_bytes / 1024, 1),
        "inline_style_kb": round(p.style_bytes / 1024, 1),
        "preload_n": preload,
        "signals": signals,
    }

res = []
idx = json.load(open(os.path.join(FETCH, "_index.json"), encoding="utf-8"))
for rec in idx:
    fp = os.path.join(FETCH, rec["file"])
    if not os.path.exists(fp):
        res.append({**rec, "error": rec.get("error", "no file")}); continue
    raw = open(fp, "rb").read()
    m = re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", raw[:4000], re.I)
    enc = (m.group(1).decode() if m else "utf-8")
    try:
        html = raw.decode(enc, errors="replace")
    except LookupError:
        html = raw.decode("utf-8", errors="replace")
    host = re.sub(r"^https?://([^/]+).*", r"\1", rec["url"])
    out = {"q": rec["q"], "src": "live", "url": rec["url"], "status": rec.get("status"),
           "ttfb_s": rec.get("ttfb_s"), "html_kb": round(rec.get("html_bytes", 0) / 1024, 1),
           "transfer_kb": round(rec.get("transfer_bytes", 0) / 1024, 1),
           "headers": rec.get("headers")}
    out.update(analyze(html, host))
    res.append(out)
for q, path in OWN_DIST:
    fp = os.path.join(DIST, path.strip("/"), "index.html")
    html = open(fp, encoding="utf-8").read()
    out = {"q": q, "src": "dist", "url": "https://gptbot.uz" + path, "html_kb": round(len(html.encode()) / 1024, 1)}
    out.update(analyze(html, "gptbot.uz"))
    res.append(out)
json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("rows", len(res))
