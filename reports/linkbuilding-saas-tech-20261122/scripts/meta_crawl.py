import asyncio, json, os, re, sys, collections
from urllib.parse import urlparse, urljoin
import aiohttp
from bs4 import BeautifulSoup
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify as V
LR = sys.argv[1]
META = ["alldirectories.org", "bestaidirectories.online", "submit.co", "freeaidirectories.com", "launchpedia.co", "bestlaunchdirectories.co",
        "launchdirectories.com", "findlaunchsites.com", "bestlaunchplatforms.com", "startupdirs.com", "directoryfame.com", "saascity.io",
        "listbulb.com", "submitjuice.com", "submitwell.com", "submitator.com", "mydirs.com", "dirpilot.com", "aidirectori.es", "submitsaas.com"]
PATHS = ["/", "/directories", "/directory", "/list", "/all", "/ai-directories", "/startup-directories", "/saas-directories", "/free-directories", "/blog"]
known = set()
for name in ("queue.jsonl", "queue_extra.jsonl", "queue_snow.jsonl", "queue_snowB.jsonl"):
    p = os.path.join(LR, "verify", name)
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            known.add(json.loads(line)["root"])
for line in open(os.path.join(LR, "verify", "discourse_all_new.txt")):
    known.add(V.root_of(line.strip()))
SKIP = re.compile(r"^(google|youtube|facebook|twitter|x|linkedin|instagram|tiktok|github|discord|t|reddit|medium|apple|microsoft|stripe|notion|vercel|cloudflare|wordpress|wikipedia|chatgpt|openai|amazon|gumroad|buymeacoffee|ko-fi|patreon|substack|beehiiv)\.", re.I)
cnt = collections.Counter(); src = collections.defaultdict(set); urlmap = {}
async def grab(session, sem, meta, path):
    async with sem:
        pg = await V.fetch(session, f"https://{meta}{path}", max_bytes=3_000_000, timeout=20)
        if pg.get("status") != 200 or not pg.get("text"):
            return
        soup = BeautifulSoup(pg["text"], "lxml")
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href.startswith("http"):
                continue
            host = (urlparse(href).hostname or "").lower()
            if not host:
                continue
            rr = V.root_of(host)
            if rr == V.root_of(meta) or rr in known or SKIP.match(rr + "."):
                continue
            cnt[rr] += 1; src[rr].add(meta)
            urlmap.setdefault(rr, f"https://{host}/")
async def main():
    sem = asyncio.Semaphore(16)
    conn = aiohttp.TCPConnector(limit=32, limit_per_host=2, ssl=V.SSL_CTX)
    async with aiohttp.ClientSession(connector=conn, trust_env=True, cookie_jar=aiohttp.DummyCookieJar()) as s:
        await asyncio.gather(*(grab(s, sem, m, p) for m in META for p in PATHS))
    with open(os.path.join(LR, "verify", "queue_meta.jsonl"), "w", encoding="utf-8") as fh:
        for d in sorted(cnt, key=lambda x: -len(src[x])):
            fh.write(json.dumps({"host": urlparse(urlmap[d]).hostname, "url": urlmap[d], "root": d, "cat": "C", "cat_votes": {"C": 1}, "lang": "en",
                                 "sources": ["meta-directory list pages: " + ", ".join(sorted(src[d])[:4])], "n_sources": len(src[d]),
                                 "hints": [f"listed on {len(src[d])} meta-directory list(s)"], "names": [], "other_hosts": [], "agents": ["meta_crawl"]}) + "\n")
    print({"new_roots": len(cnt), "multi_source": sum(1 for d in cnt if len(src[d]) >= 2)})
asyncio.run(main())
