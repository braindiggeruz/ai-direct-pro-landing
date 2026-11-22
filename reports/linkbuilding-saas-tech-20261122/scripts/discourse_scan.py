#!/usr/bin/env python3
"""Lightweight Discourse scan via public JSON API (about.json + categories.json).
Usage: python3 -I discourse_scan.py HOSTS.txt OUT.jsonl [CONC]
"""
import asyncio
import json
import os
import re
import sys

import aiohttp

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify as V  # noqa: E402

STRONG = re.compile(r"(showcase|show[- ]?(?:and|&|n|'n')[- ]?tell|self[- ]?promo|promote your|your (?:projects?|apps?|products?|work|creations|startups?|tools?|sites?)|projects? showcase|made with|built with|share (?:your|what)|what (?:i|you)(?:'ve)? built|creations|community projects|introduc|announce\w* (?:your|community)|launch)", re.I)
REL = re.compile(r"(\bai\b|artificial intelligence|machine learning|\bml\b|\bllm|gpt|chatbot|\bbots?\b|automat|no-?code|low-?code|saas|software|developer|programming|\bcode\b|\bapi\b|\bsdk\b|python|javascript|typescript|rust|golang|\bweb\b|data|analytics|cloud|devops|startup|marketing|\bseo\b|telegram|crypto|blockchain|open source|framework|database|platform)", re.I)


async def one(session, host, sem, out):
    async with sem:
        rec = {"host": host}
        a = await V.fetch(session, f"https://{host}/about.json", max_bytes=300_000, timeout=15)
        rec["about_status"] = a["status"]
        if a["status"] != 200 or not a["text"].strip().startswith("{"):
            out.write(json.dumps(rec) + "\n")
            return
        try:
            j = json.loads(a["text"])
            ab = j.get("about") or {}
            rec["title"] = (ab.get("title") or "")[:120]
            rec["desc"] = (ab.get("description") or "")[:240]
            stt = ab.get("stats") or {}
            rec["stats"] = {k: stt.get(k) for k in ("user_count", "post_count", "posts_7_days", "posts_30_days", "active_users_7_days", "active_users_30_days", "topics_30_days") if k in stt}
        except Exception:
            out.write(json.dumps(rec) + "\n")
            return
        st = rec.get("stats") or {}
        active = (st.get("posts_30_days") or 0) >= 20 or (st.get("posts_7_days") or 0) >= 5
        rec["active"] = active
        if active:
            c = await V.fetch(session, f"https://{host}/categories.json?include_subcategories=true", max_bytes=2_000_000, timeout=18)
            if c["status"] == 200 and c["text"].strip().startswith("{"):
                try:
                    cj = json.loads(c["text"])
                    cats = []
                    for cat in (cj.get("category_list") or {}).get("categories", []):
                        cats.append({"name": cat.get("name") or "", "desc": (cat.get("description_text") or "")[:140], "topics": cat.get("topic_count"), "slug": cat.get("slug"), "id": cat.get("id")})
                        for sc in cat.get("subcategory_list") or []:
                            cats.append({"name": (cat.get("name") or "") + " > " + (sc.get("name") or ""), "desc": (sc.get("description_text") or "")[:140], "topics": sc.get("topic_count"), "slug": sc.get("slug"), "id": sc.get("id")})
                    rec["n_cats"] = len(cats)
                    rec["showcase"] = [x for x in cats if STRONG.search(x["name"] + " " + x["desc"])][:6]
                    rec["cat_names"] = [x["name"] for x in cats][:40]
                except Exception as e:  # noqa: BLE001
                    rec["cat_err"] = str(e)[:80]
        blob = " ".join([rec.get("title", ""), rec.get("desc", "")] + rec.get("cat_names", []))
        rec["rel_hits"] = len(REL.findall(blob))
        out.write(json.dumps(rec, ensure_ascii=False) + "\n")
        out.flush()


async def main():
    hosts = [h.strip() for h in open(sys.argv[1]) if h.strip()]
    outp = sys.argv[2]
    conc = int(sys.argv[3]) if len(sys.argv) > 3 else 32
    done = set()
    if os.path.exists(outp):
        for line in open(outp):
            try:
                done.add(json.loads(line)["host"])
            except Exception:
                pass
    hosts = [h for h in hosts if h not in done]
    print("to scan", len(hosts), flush=True)
    sem = asyncio.Semaphore(conc)
    conn = aiohttp.TCPConnector(limit=conc * 2, limit_per_host=2, ssl=V.SSL_CTX, ttl_dns_cache=300)
    with open(outp, "a", encoding="utf-8") as out:
        async with aiohttp.ClientSession(connector=conn, trust_env=True, cookie_jar=aiohttp.DummyCookieJar()) as s:
            await asyncio.gather(*(one(s, h, sem, out) for h in hosts))
    print("done", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
