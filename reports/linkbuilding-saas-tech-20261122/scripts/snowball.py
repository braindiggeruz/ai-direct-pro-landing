#!/usr/bin/env python3
"""Snowball: collect outbound links (badges 'Featured on', 'Listed on', partner directories) from accepted directories.
Usage: python3 -I snowball.py LR
Writes LR/verify/queue_snow.jsonl (new roots only) and LR/verify/snow_stats.json
"""
import asyncio
import collections
import json
import os
import re
import sys
from urllib.parse import urlparse

import aiohttp
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify as V  # noqa: E402

LR = sys.argv[1]
st = json.load(open(os.path.join(LR, "out", "build_state.json"), encoding="utf-8"))
known = set()
for name in ("queue.jsonl", "queue_extra.jsonl"):
    p = os.path.join(LR, "verify", name)
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            known.add(json.loads(line)["root"])
for line in open(os.path.join(LR, "verify", "discourse_all_new.txt")):
    known.add(V.root_of(line.strip()))
src = [r for r in st["rows"] if r["category"] in ("AI Tools Directory", "SaaS Directory", "Startup & Tech Community")]
pages = []
for r in src:
    pages.append((r["_orig_root"], r["homepage_url"]))
    if r.get("submit_url", "").startswith("http"):
        pages.append((r["_orig_root"], r["submit_url"]))
BADGE = re.compile(r"(featured|listed|launch|directory|hunt|as seen|partner|badge|submit|tools?\b|\bai\b|saas|startup|product)", re.I)
NAMEY = re.compile(r"(tool|ai|saas|launch|hunt|director|list|startup|app|best|top|find|dir|index|hub|nav|stack|product|indie|maker|gpt|agent)", re.I)
SKIP = set(["google.com", "youtube.com", "facebook.com", "twitter.com", "x.com", "linkedin.com", "instagram.com", "tiktok.com", "github.com",
            "discord.gg", "discord.com", "t.me", "reddit.com", "medium.com", "apple.com", "microsoft.com", "stripe.com", "notion.so",
            "vercel.com", "cloudflare.com", "wordpress.org", "wikipedia.org", "producthunt.com", "ycombinator.com", "chatgpt.com", "openai.com"])
cnt = collections.Counter()
ex_url = {}
ex_src = collections.defaultdict(set)


async def grab(session, sem, root, url):
    async with sem:
        pg = await V.fetch(session, url, max_bytes=1_200_000, timeout=18)
        if not pg.get("text"):
            return
        try:
            soup = BeautifulSoup(pg["text"], "lxml")
        except Exception:
            return
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href.startswith("http"):
                continue
            try:
                host = (urlparse(href).hostname or "").lower()
            except Exception:
                continue
            if not host:
                continue
            rr = V.root_of(host)
            if rr == root or rr in known or rr in SKIP or rr.startswith("google."):
                continue
            txt = a.get_text(" ", strip=True)[:80]
            alt = " ".join(i.get("alt", "") for i in a.find_all("img"))[:80]
            if BADGE.search(txt + " " + alt) or NAMEY.search(rr):
                cnt[rr] += 1
                ex_src[rr].add(root)
                if rr not in ex_url:
                    ex_url[rr] = f"https://{host}/"


async def main():
    sem = asyncio.Semaphore(32)
    conn = aiohttp.TCPConnector(limit=64, limit_per_host=2, ssl=V.SSL_CTX, ttl_dns_cache=300)
    async with aiohttp.ClientSession(connector=conn, trust_env=True, cookie_jar=aiohttp.DummyCookieJar()) as s:
        await asyncio.gather(*(grab(s, sem, r, u) for r, u in pages))
    picks = [(d, c) for d, c in cnt.items() if len(ex_src[d]) >= 2 or (NAMEY.search(d) and c >= 1)]
    with open(os.path.join(LR, "verify", "queue_snow.jsonl"), "w", encoding="utf-8") as fh:
        for d, c in sorted(picks, key=lambda x: -len(ex_src[x[0]])):
            host = urlparse(ex_url[d]).hostname
            fh.write(json.dumps({"host": host, "url": ex_url[d], "root": d, "cat": "C", "cat_votes": {"C": 1}, "lang": "en",
                                 "sources": ["snowball: linked from accepted directories: " + ", ".join(sorted(ex_src[d])[:4])],
                                 "n_sources": len(ex_src[d]), "hints": [f"outbound badge/partner link from {len(ex_src[d])} accepted directories"],
                                 "names": [], "other_hosts": [], "agents": ["snowball"]}) + "\n")
    stt = {"pages_crawled": len(pages), "outbound_candidates": len(cnt), "picked": len(picks),
           "picked_multi_source": sum(1 for d, c in picks if len(ex_src[d]) >= 2)}
    json.dump(stt, open(os.path.join(LR, "verify", "snow_stats.json"), "w"), indent=1)
    print(stt)


asyncio.run(main())
