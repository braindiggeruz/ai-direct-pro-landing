#!/usr/bin/env python3
"""Merge candidate JSONL files -> one queue record per ROOT domain.
Usage: python3 -I merge.py LR_DIR [REF_DOMAINS_TXT]
Writes LR/verify/queue.jsonl, LR/verify/merge_stats.json, LR/verify/excluded_at_merge.csv
"""
import collections
import csv
import glob
import json
import os
import re
import sys
from urllib.parse import urlparse

import tldextract

LR = sys.argv[1]
REF = sys.argv[2] if len(sys.argv) > 2 else None
EXT = tldextract.TLDExtract(cache_dir=os.path.join(LR, ".tldcache"))

EXCLUDE_ROOTS = {
    # social / search / mega platforms without a directory-style placement mechanism
    "google.com", "youtube.com", "youtu.be", "facebook.com", "fb.com", "fb.me", "instagram.com", "twitter.com", "x.com",
    "t.co", "linkedin.com", "lnkd.in", "tiktok.com", "pinterest.com", "wikipedia.org", "wikimedia.org", "wikidata.org",
    "amazon.com", "amzn.to", "apple.com", "microsoft.com", "bing.com", "yahoo.com", "duckduckgo.com", "baidu.com",
    "yandex.ru", "yandex.com", "ya.ru", "vk.com", "vk.ru", "ok.ru", "mail.ru", "t.me", "telegram.org", "telegram.me",
    "whatsapp.com", "discord.com", "discord.gg", "slack.com", "bit.ly", "linktr.ee", "stripe.com", "paypal.com",
    "chatgpt.com", "anthropic.com", "claude.ai", "github.com", "gitlab.com", "githubusercontent.com", "bitbucket.org",
    "stackoverflow.com", "stackexchange.com", "superuser.com", "serverfault.com", "askubuntu.com", "mathoverflow.net",
    # hosting sub-domains (individual sites collapse into one root; not placement platforms)
    "blogspot.com", "wordpress.com", "tumblr.com", "wixsite.com", "wix.com", "weebly.com", "notion.site", "notion.so",
    "github.io", "gitbook.io", "vercel.app", "netlify.app", "herokuapp.com", "pages.dev", "web.app", "firebaseapp.com",
    "glitch.me", "replit.app", "repl.co", "framer.website", "framer.app", "framer.ai", "webflow.io", "bubbleapps.io",
    "softr.app", "super.site", "typedream.app", "carrd.co", "substack.com", "beehiiv.com", "ghost.io", "mystrikingly.com",
    "strikingly.com", "site123.me", "jimdosite.com", "tilda.ws", "lovable.app", "onrender.com", "fly.dev", "railway.app",
    "streamlit.app", "hf.space", "gumroad.com", "lemonsqueezy.com", "ko-fi.com", "patreon.com", "buymeacoffee.com",
    "squarespace.com", "godaddysites.com", "myshopify.com", "google.ru", "goo.gl", "forms.gle", "tally.so", "typeform.com",
    "airtable.com", "docs.google.com", "sites.google.com", "canva.site", "my.canva.site", "durable.co", "bolt.host",
    # pure news media / SEO tools vendors (no open placement mechanism)
    "techcrunch.com", "venturebeat.com", "forbes.com", "theverge.com", "wired.com", "bbc.com", "bbc.co.uk", "cnn.com",
    "nytimes.com", "wsj.com", "bloomberg.com", "reuters.com", "businessinsider.com", "cnbc.com", "theguardian.com",
    "zdnet.com", "cnet.com", "engadget.com", "mashable.com", "arstechnica.com", "techradar.com", "pcmag.com",
    "tomsguide.com", "gizmodo.com", "fastcompany.com", "huffpost.com", "theatlantic.com", "axios.com", "semrush.com",
    "ahrefs.com", "similarweb.com", "neilpatel.com", "archive.org", "web.archive.org", "w3.org", "mozilla.org-addons",
    "play.google.com", "apps.apple.com", "chromewebstore.google.com", "feedspot.com", "findaforum.net",
}
EXCLUDE_HOST_SUFFIX = (".gov", ".edu", ".mil")
SUBMIT_PATH = re.compile(r"(submit|suggest|/add(?:[-_/]|$)|add[-_]|list[-_]your|get[-_]listed|/launch|/new(?:[-_/]|$)|contribute|write[-_]for[-_]us|register|signup|sign-up|join|добав|eintragen|soumettre|ajouter)", re.I)
FORUM_HOST = re.compile(r"^(forum|forums|community|communities|discuss|discussion|discourse|talk|board|boards|bbs|users|devforum|developer-forum|answers)\.", re.I)
FORUM_PATH = re.compile(r"^/(forums?|community|board|boards|discuss(?:ion)?s?|talk|bbs|phpbb\d?|foro|foren)(/|$|\.php)", re.I)


def norm_host(h):
    h = (h or "").strip().lower().rstrip(".")
    h = re.sub(r":\d+$", "", h)
    return h


def main():
    rows = []
    for f in sorted(glob.glob(os.path.join(LR, "cand", "*.jsonl"))):
        agent = os.path.basename(f).replace(".jsonl", "")
        with open(f, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                r["_agent"] = agent
                rows.append(r)
    ref = set()
    if REF and os.path.exists(REF):
        with open(REF, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                u = line if "://" in line else "https://" + line
                h = norm_host(urlparse(u).hostname)
                if h:
                    e = EXT(h)
                    ref.add((e.top_domain_under_public_suffix or h).lower())
    by_root = collections.defaultdict(list)
    excluded = []
    bad = 0
    for r in rows:
        url = (r.get("url") or "").strip()
        host = None
        if url:
            if "://" not in url:
                url = "https://" + url
            try:
                host = norm_host(urlparse(url).hostname)
            except Exception:
                host = None
        if not host:
            host = norm_host(r.get("domain") or "")
            url = f"https://{host}/" if host else ""
        if not host or "." not in host or re.match(r"^\d+\.\d+\.\d+\.\d+$", host) or " " in host:
            bad += 1
            continue
        e = EXT(host)
        root = (e.top_domain_under_public_suffix or "").lower()
        if not root or not e.suffix:
            bad += 1
            continue
        if root in EXCLUDE_ROOTS or host in EXCLUDE_ROOTS or host.endswith(EXCLUDE_HOST_SUFFIX) or root.startswith("google."):
            excluded.append((root, host, "excluded_platform_type", r.get("source", "")))
            continue
        if root in ref:
            excluded.append((root, host, "in_reference_file", r.get("source", "")))
            continue
        r["_host"] = host
        r["_url"] = url
        by_root[root].append(r)
    queue = []
    for root, rs in by_root.items():
        def prio(r):
            p = 0
            path = urlparse(r["_url"]).path or "/"
            if SUBMIT_PATH.search(path):
                p += 5
            if FORUM_HOST.match(r["_host"]) or FORUM_PATH.match(path):
                p += 4 if r.get("cat") == "B" else 2
            if r["_host"] in (root, "www." + root):
                p += 1
            return p
        best = max(rs, key=prio)
        cats = collections.Counter((x.get("cat") or "").upper()[:1] for x in rs if x.get("cat"))
        langs = collections.Counter((x.get("lang") or "").lower()[:5] for x in rs if x.get("lang"))
        cat = cats.most_common(1)[0][0] if cats else ""
        if (FORUM_HOST.match(best["_host"]) or FORUM_PATH.match(urlparse(best["_url"]).path or "/")) and cats.get("B"):
            cat = "B"
        srcs, hints, names, hosts = [], [], [], []
        for x in rs:
            s = (x.get("source") or "").strip()
            if s and s not in srcs:
                srcs.append(s)
            h = (x.get("hint") or "").strip()
            if h and h not in hints:
                hints.append(h)
            n = (x.get("name") or "")
            if n and n not in names:
                names.append(n)
            if x["_host"] not in hosts:
                hosts.append(x["_host"])
        queue.append({"host": best["_host"], "url": best["_url"], "root": root, "cat": cat,
                      "cat_votes": dict(cats), "lang": langs.most_common(1)[0][0] if langs else "",
                      "sources": srcs[:6], "n_sources": len(srcs), "hints": hints[:5], "names": names[:3],
                      "other_hosts": [h for h in hosts if h != best["_host"]][:5],
                      "agents": sorted(set(x["_agent"] for x in rs))})
    queue.sort(key=lambda q: (-q["n_sources"], q["root"]))
    os.makedirs(os.path.join(LR, "verify"), exist_ok=True)
    with open(os.path.join(LR, "verify", "queue.jsonl"), "w", encoding="utf-8") as fh:
        for q in queue:
            fh.write(json.dumps(q, ensure_ascii=False) + "\n")
    with open(os.path.join(LR, "verify", "excluded_at_merge.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["root", "host", "reason", "source"])
        seen = set()
        for row in excluded:
            if (row[0], row[2]) in seen:
                continue
            seen.add((row[0], row[2]))
            w.writerow(row)
    hosts_total = len(set(r["_host"] for rs in by_root.values() for r in rs))
    stats = {"rows": len(rows), "bad_rows": bad, "excluded_rows": len(excluded),
             "excluded_roots": len(set((e[0]) for e in excluded)), "unique_hosts": hosts_total,
             "unique_roots": len(queue), "ref_roots": len(ref),
             "cat_counts": dict(collections.Counter(q["cat"] for q in queue)),
             "duplicate_rows_collapsed": len(rows) - bad - len(excluded) - len(queue)}
    with open(os.path.join(LR, "verify", "merge_stats.json"), "w") as fh:
        json.dump(stats, fh, indent=1)
    print(json.dumps(stats, indent=1))


if __name__ == "__main__":
    main()
