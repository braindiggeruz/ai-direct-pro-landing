#!/usr/bin/env python3
"""
Public, read-only crawl of https://gptbot.uz for the GSC audit.

Fetches every <loc> from the live sitemap.xml (plus optional extra URLs, e.g.
pages seen in GSC but absent from the sitemap) and records the SEO-relevant
HTML contract of each page exactly as served to a crawler (no JS execution):
status, redirects, title, description, robots, canonical, lang, hreflang,
Open Graph / Twitter, JSON-LD @types, H1/H2, visible word count, internal and
external links, images without alt, FAQ signals.

Output: ../raw/site_pages.json + site_pages.csv, ../raw/site_links.csv (edge list).
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import csv
import datetime as dt
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import requests
from bs4 import BeautifulSoup

HOST = "gptbot.uz"
BASE = f"https://{HOST}"
HERE = Path(__file__).resolve().parent
RAW = HERE.parent / "raw"
UA = "Mozilla/5.0 (compatible; gptbot-seo-audit/1.0; +https://gptbot.uz/) read-only audit crawler"
HEADERS = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ru,uz;q=0.8,en;q=0.5"}


def norm(u: str) -> str:
    p = urlsplit(u)
    path = p.path or "/"
    return f"{p.scheme}://{p.netloc}{path}" + (f"?{p.query}" if p.query else "")


def fetch_sitemap() -> dict[str, dict]:
    r = requests.get(f"{BASE}/sitemap.xml", headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "xml")
    out = {}
    for url in soup.find_all("url"):
        loc = url.find("loc").text.strip()
        lastmod = url.find("lastmod").text.strip() if url.find("lastmod") else None
        alts = {a.get("hreflang"): a.get("href") for a in url.find_all("xhtml:link")} or \
               {a.get("hreflang"): a.get("href") for a in url.find_all("link")}
        out[loc] = {"lastmod": lastmod, "sitemap_hreflang": alts}
    return out


def text_words(soup: BeautifulSoup) -> tuple[int, str]:
    for t in soup(["script", "style", "noscript", "svg", "template"]):
        t.decompose()
    body = soup.body or soup
    txt = re.sub(r"\s+", " ", body.get_text(" ", strip=True))
    return len(txt.split()), txt[:400]


def crawl_one(url: str, sm: dict | None) -> dict:
    rec: dict = {"url": url, "in_sitemap": sm is not None, "sitemap_lastmod": (sm or {}).get("lastmod")}
    try:
        r = requests.get(url, headers=HEADERS, timeout=40, allow_redirects=True)
    except Exception as exc:  # noqa: BLE001
        rec.update(status=None, error=str(exc)[:200])
        return rec
    rec["status"] = r.status_code
    rec["final_url"] = r.url
    rec["redirected"] = r.url != url
    rec["redirect_chain"] = [f"{h.status_code} {h.url}" for h in r.history]
    rec["content_type"] = r.headers.get("Content-Type")
    rec["x_robots_tag"] = r.headers.get("X-Robots-Tag")
    rec["cache_control"] = r.headers.get("Cache-Control")
    rec["html_bytes"] = len(r.content)
    if "text/html" not in (rec["content_type"] or ""):
        return rec
    soup = BeautifulSoup(r.text, "lxml")
    head = soup.head or soup
    rec["title"] = (soup.title.string.strip() if soup.title and soup.title.string else None)
    rec["title_len"] = len(rec["title"] or "")

    def meta(name=None, prop=None):
        tag = head.find("meta", attrs={"name": name}) if name else head.find("meta", attrs={"property": prop})
        return tag.get("content", "").strip() if tag else None

    rec["description"] = meta(name="description")
    rec["description_len"] = len(rec["description"] or "")
    rec["meta_robots"] = meta(name="robots")
    rec["meta_googlebot"] = meta(name="googlebot")
    rec["noindex"] = bool(re.search(r"noindex", (rec["meta_robots"] or "") + (rec["meta_googlebot"] or "") + (rec["x_robots_tag"] or ""), re.I))
    can = head.find("link", rel=lambda v: v and "canonical" in v)
    rec["canonical"] = can.get("href") if can else None
    rec["canonical_self"] = (norm(rec["canonical"]) == norm(url)) if rec["canonical"] else None
    rec["canonical_count"] = len(head.find_all("link", rel=lambda v: v and "canonical" in v))
    rec["html_lang"] = (soup.html.get("lang") if soup.html else None)
    rec["hreflang"] = {l.get("hreflang"): l.get("href") for l in head.find_all("link", rel=lambda v: v and "alternate" in v) if l.get("hreflang")}
    rec["og_title"] = meta(prop="og:title")
    rec["og_description"] = meta(prop="og:description")
    rec["og_image"] = meta(prop="og:image")
    rec["og_url"] = meta(prop="og:url")
    rec["og_locale"] = meta(prop="og:locale")
    rec["twitter_card"] = meta(name="twitter:card")
    types = []
    ld_raw = []
    for s in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(s.string or "")
        except Exception:  # noqa: BLE001
            types.append("INVALID_JSON")
            continue
        items = data if isinstance(data, list) else [data]
        for it in items:
            if isinstance(it, dict):
                if "@graph" in it:
                    for g in it["@graph"]:
                        if isinstance(g, dict):
                            types.append(str(g.get("@type")))
                else:
                    types.append(str(it.get("@type")))
        ld_raw.append(data)
    rec["jsonld_types"] = types
    rec["jsonld_has_faq"] = any("FAQPage" in t for t in types)
    rec["jsonld_has_breadcrumb"] = any("BreadcrumbList" in t for t in types)
    rec["jsonld_has_org"] = any("Organization" in t for t in types)
    rec["jsonld_has_localbusiness"] = any("LocalBusiness" in t or "ProfessionalService" in t for t in types)
    rec["jsonld_has_service"] = any(t in ("Service", "Product", "Offer") or "Service" in t for t in types)
    rec["jsonld_has_article"] = any("Article" in t or "BlogPosting" in t for t in types)
    h1s = [h.get_text(" ", strip=True) for h in soup.find_all("h1")]
    rec["h1"] = h1s[0] if h1s else None
    rec["h1_count"] = len(h1s)
    rec["h2"] = [h.get_text(" ", strip=True) for h in soup.find_all("h2")][:40]
    rec["h2_count"] = len(rec["h2"])
    rec["h3_count"] = len(soup.find_all("h3"))
    rec["faq_heading"] = any(re.search(r"faq|вопрос|savol", h, re.I) for h in rec["h2"])
    imgs = soup.find_all("img")
    rec["img_count"] = len(imgs)
    rec["img_missing_alt"] = sum(1 for i in imgs if not (i.get("alt") or "").strip())
    internal, external = set(), set()
    anchors = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        full = urljoin(url, href)
        p = urlsplit(full)
        if p.netloc in (HOST, f"www.{HOST}"):
            target = norm(full.split("#")[0])
            internal.add(target)
            anchors.append((target, a.get_text(" ", strip=True)[:80]))
        elif p.scheme in ("http", "https"):
            external.add(full)
    rec["internal_links"] = sorted(internal)
    rec["internal_link_count"] = len(internal)
    rec["external_link_count"] = len(external)
    rec["telegram_links"] = sum(1 for e in external if "t.me" in e or "telegram" in e)
    rec["anchors"] = anchors[:200]
    rec["word_count"], rec["text_excerpt"] = text_words(soup)
    rec["has_root_div_only"] = rec["word_count"] < 40
    return rec


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--extra", help="file with extra URLs (one per line), e.g. GSC pages not in sitemap")
    ap.add_argument("--workers", type=int, default=6)
    ns = ap.parse_args()
    sm = fetch_sitemap()
    urls = dict(sm)
    if ns.extra:
        for line in Path(ns.extra).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and line not in urls:
                urls[line] = None
    print(f"sitemap urls={len(sm)} total to crawl={len(urls)}", flush=True)
    results = []
    with cf.ThreadPoolExecutor(max_workers=ns.workers) as ex:
        futs = {ex.submit(crawl_one, u, sm.get(u)): u for u in urls}
        for i, f in enumerate(cf.as_completed(futs), 1):
            results.append(f.result())
            if i % 25 == 0:
                print(f"  {i}/{len(urls)}", flush=True)
    results.sort(key=lambda r: r["url"])
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / "site_pages.json").write_text(json.dumps({
        "crawledAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "public HTTP GET of live gptbot.uz, no JS execution", "sitemapUrlCount": len(sm),
        "pages": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    cols = ["url", "in_sitemap", "sitemap_lastmod", "status", "final_url", "redirected", "noindex", "meta_robots", "x_robots_tag",
            "canonical", "canonical_self", "canonical_count", "html_lang", "title", "title_len", "description", "description_len",
            "h1", "h1_count", "h2_count", "h3_count", "word_count", "internal_link_count", "external_link_count", "telegram_links",
            "img_count", "img_missing_alt", "jsonld_types", "jsonld_has_faq", "jsonld_has_breadcrumb", "jsonld_has_org",
            "jsonld_has_localbusiness", "jsonld_has_service", "jsonld_has_article", "faq_heading", "og_title", "og_image",
            "twitter_card", "hreflang", "html_bytes"]
    with (RAW / "site_pages.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for r in results:
            w.writerow([json.dumps(r.get(c), ensure_ascii=False) if isinstance(r.get(c), (list, dict)) else r.get(c) for c in cols])
    with (RAW / "site_links.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["source", "target"])
        for r in results:
            for t in r.get("internal_links", []):
                w.writerow([r["url"], t])
    ok = sum(1 for r in results if r.get("status") == 200)
    print(f"done: {len(results)} pages, 200={ok}, noindex={sum(1 for r in results if r.get('noindex'))}, "
          f"non-self-canonical={sum(1 for r in results if r.get('canonical_self') is False)}, "
          f"shell-only={sum(1 for r in results if r.get('has_root_div_only'))}")


if __name__ == "__main__":
    main()
