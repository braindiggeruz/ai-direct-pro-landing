#!/usr/bin/env python3
"""Build verify/queue_extra.jsonl from analyst seeds + Discourse API scan picks (roots not in main queue)."""
import json
import os
import re
import sys

import tldextract

LR = sys.argv[1]
E = tldextract.TLDExtract(cache_dir=os.path.join(LR, ".tldcache"))
main_roots = set(json.loads(l)["root"] for l in open(os.path.join(LR, "verify", "queue.jsonl")))
TECHT = re.compile(r"(\bai\b|artificial intelligence|machine learning|\bllm|gpt|chatbot|\bbots?\b|automat|no-?code|low-?code|saas|software|developer|programming|\bcode\b|\bapi\b|python|javascript|\bweb\b|data|analytics|cloud|devops|startup|marketing|\bseo\b|telegram|open source|framework|platform|app)", re.I)
out = {}
seed_n = 0
for line in open(os.path.join(LR, "cand", "seed_known.jsonl"), encoding="utf-8"):
    r = json.loads(line)
    host = r["domain"].lower()
    root = (E(host).top_domain_under_public_suffix or host).lower()
    if root in main_roots or root in out:
        continue
    out[root] = {"host": host, "url": r["url"], "root": root, "cat": r["cat"], "cat_votes": {r["cat"]: 1}, "lang": r["lang"],
                 "sources": [r["source"]], "n_sources": 1, "hints": [r["hint"]], "names": [], "other_hosts": [], "agents": ["seed"], "seed": True}
    seed_n += 1
disc_n = 0
scan_total = 0
for line in open(os.path.join(LR, "verify", "discourse_scan.jsonl"), encoding="utf-8"):
    scan_total += 1
    r = json.loads(line)
    if not r.get("active") or not r.get("showcase"):
        continue
    blob = " ".join([r.get("title") or "", r.get("desc") or ""] + (r.get("cat_names") or []))
    if r.get("rel_hits", 0) < 2 and not TECHT.search((r.get("title") or "") + " " + (r.get("desc") or "")):
        continue
    host = r["host"]
    root = (E(host).top_domain_under_public_suffix or host).lower()
    if root in main_roots or root in out:
        continue
    out[root] = {"host": host, "url": f"https://{host}/", "root": root, "cat": "B", "cat_votes": {"B": 1}, "lang": "en",
                 "sources": ["https://wiki.archiveteam.org/index.php/Discourse (host list) + Discourse JSON API scan"], "n_sources": 1,
                 "hints": ["Discourse; candidate showcase: " + "; ".join(x["name"] for x in r["showcase"][:3])], "names": [r.get("title") or ""],
                 "other_hosts": [], "agents": ["discourse_scan"]}
    disc_n += 1
with open(os.path.join(LR, "verify", "queue_extra.jsonl"), "w", encoding="utf-8") as fh:
    for q in out.values():
        fh.write(json.dumps(q, ensure_ascii=False) + "\n")
st = {"seed_candidates_new_roots": seed_n, "discourse_scanned": scan_total, "discourse_picked": disc_n, "extra_total": len(out)}
json.dump(st, open(os.path.join(LR, "verify", "merge_stats_extra.json"), "w"), indent=1)
print(st)
