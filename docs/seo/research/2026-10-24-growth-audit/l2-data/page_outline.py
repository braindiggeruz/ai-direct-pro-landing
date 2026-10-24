"""L2 helper: outline a prerendered page from dist/ and test whether query wording appears
in title / description / H1 / H2-H3 / FAQ summary / body text.

Usage: py -3 -I page_outline.py <dist_root> <pathname> [query ...]
Read-only. Normalises U+2018/U+2019/U+02BB/ASCII apostrophes to ' and lowercases before matching.
"""
import html as h
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

APOS = dict.fromkeys(map(ord, "‘’ʻʼ`´"), "'")


def norm(s: str) -> str:
    s = h.unescape(s).translate(APOS).lower()
    s = s.replace("ё", "е")
    return re.sub(r"\s+", " ", s).strip()


def strip_tags(s: str) -> str:
    return re.sub(r"<[^>]+>", " ", s)


def outline(dist: str, pathname: str):
    fn = f"{dist}/{pathname.strip('/')}/index.html" if pathname != "/" else f"{dist}/index.html"
    raw = open(fn, encoding="utf-8").read()
    clean = re.sub(r"<!--[\s\S]*?-->", "", raw)
    head = re.search(r"<head\b[^>]*>([\s\S]*?)</head>", clean, re.I).group(1)
    title = re.search(r"<title>([\s\S]*?)</title>", head, re.I)
    desc = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', head, re.I)
    body = re.search(r"<body\b[^>]*>([\s\S]*?)</body>", clean, re.I).group(1)
    body = re.sub(r"<(script|style|noscript)\b[^>]*>[\s\S]*?</\1>", " ", body, flags=re.I)
    heads = [(m.group(1).lower(), h.unescape(re.sub(r"\s+", " ", strip_tags(m.group(2)))).strip())
             for m in re.finditer(r"<(h[1-4]|summary)\b[^>]*>([\s\S]*?)</\1>", body, re.I)]
    text = h.unescape(re.sub(r"\s+", " ", strip_tags(body))).strip()
    return {
        "file": fn,
        "title": h.unescape(title.group(1)).strip() if title else "",
        "description": h.unescape(desc.group(1)) if desc else "",
        "heads": heads,
        "text": text,
        "words": len(text.split()),
    }


def check(o, q):
    nq = norm(q)
    where = []
    if nq in norm(o["title"]):
        where.append("title")
    if nq in norm(o["description"]):
        where.append("desc")
    for tag, t in o["heads"]:
        if nq in norm(t):
            where.append(tag if tag != "summary" else "faq")
    cnt = norm(o["text"]).count(nq)
    toks = [t for t in nq.split() if len(t) > 1]
    ntext = norm(o["text"])
    tok_hit = sum(1 for t in toks if t in ntext)
    return where, cnt, f"{tok_hit}/{len(toks)}"


if __name__ == "__main__":
    dist, path, *queries = sys.argv[1:]
    o = outline(dist, path)
    print("FILE", o["file"])
    print("TITLE", o["title"])
    print("DESC", o["description"])
    print("WORDS", o["words"])
    for tag, t in o["heads"]:
        print(f"  {tag:7} {t[:160]}")
    for q in queries:
        where, cnt, tok = check(o, q)
        print(f"Q «{q}»: exact-in={','.join(dict.fromkeys(where)) or '-'} body_exact_count={cnt} tokens_in_body={tok}")
