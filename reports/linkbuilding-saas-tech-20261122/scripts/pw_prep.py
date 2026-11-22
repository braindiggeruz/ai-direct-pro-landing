#!/usr/bin/env python3
"""Prepare browser passes.
  python3 -I pw_prep.py LR home   -> verify/pw_home_in.jsonl  (homepages of non-forum sites with no submit link found)
  python3 -I pw_prep.py LR check  -> verify/pw_check_in.jsonl (+ verify/pw_home_cands.jsonl)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify as V  # noqa: E402

LR, MODE = sys.argv[1], sys.argv[2]


def load(p):
    out = []
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except Exception:
                    pass
    return out


res = {}
for name in ("results.jsonl", "results_extra.jsonl"):
    for r in load(os.path.join(LR, "verify", name)):
        res[r["host"]] = r


def usable_sub(s):
    if not s or s.get("status") != 200 or s.get("soft404"):
        return False
    return True


def resolved(s):
    forms = s.get("forms") or []
    return any(f.get("url") and not f.get("search") and not f.get("newsletter") for f in forms) or bool(s.get("ext_form")) or bool(s.get("loginwall"))


if MODE == "home":
    n = 0
    with open(os.path.join(LR, "verify", "pw_home_in.jsonl"), "w") as fh:
        for host, r in res.items():
            h = r.get("home") or {}
            if r.get("platform") in V.FORUM_ENGINES:
                continue
            if r.get("outcome") in ("http_403", "http_429", "http_503"):
                fh.write(json.dumps({"key": r["root"], "host": host, "url": f"https://{host}/", "why": r["outcome"]}) + "\n")
                n += 1
                continue
            if r.get("outcome") != "ok" or not h.get("status") or h["status"] >= 400:
                continue
            subs = [s for s in (r.get("submit_checked") or []) if usable_sub(s)]
            if subs:
                continue
            fh.write(json.dumps({"key": r["root"], "host": host, "url": h.get("final_url") or f"https://{host}/"}) + "\n")
            n += 1
    print("homepages to render:", n)
elif MODE == "check":
    items = []
    seen = set()
    # (a) submit pages that loaded but whose form could not be confirmed from raw HTML
    for host, r in res.items():
        if r.get("platform") in V.FORUM_ENGINES:
            continue
        for s in r.get("submit_checked") or []:
            if usable_sub(s) and not resolved(s):
                k = (r["root"], s["url"])
                if k not in seen:
                    seen.add(k)
                    items.append({"key": r["root"], "host": host, "url": s["url"], "why": "unresolved_html"})
    # (b) submit links discovered on rendered homepages
    cands = {}
    for p in load(os.path.join(LR, "verify", "pw_home.jsonl")):
        if p.get("err") or p.get("cf_block") or not p.get("anchors"):
            continue
        root = p["key"]
        scored = []
        for href, txt in p["anchors"]:
            if not href or not href.startswith("http"):
                continue
            sc = V.score_submit_link(href, txt, root)
            if sc >= 6:
                scored.append((sc, href.split("#")[0], txt))
        scored.sort(key=lambda x: -x[0])
        urls = []
        for sc, u, t in scored:
            if u not in urls:
                urls.append(u)
            if len(urls) >= 2:
                break
        if urls:
            host = next((h for h, r in res.items() if r["root"] == root), None)
            cands[host or root] = urls
            for u in urls:
                k = (root, u)
                if k not in seen:
                    seen.add(k)
                    items.append({"key": root, "host": host, "url": u, "why": "pw_home_link"})
    with open(os.path.join(LR, "verify", "pw_check_in.jsonl"), "w") as fh:
        for it in items:
            fh.write(json.dumps(it) + "\n")
    with open(os.path.join(LR, "verify", "pw_home_cands.jsonl"), "w") as fh:
        for host, urls in cands.items():
            fh.write(json.dumps({"host": host, "urls": urls}) + "\n")
    print("pages to check:", len(items), "| homepages with new submit links:", len(cands))
