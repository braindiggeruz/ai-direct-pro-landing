"""Release-specific discovery: default read-only checks, explicit --submit only.

Uses the existing published IndexNow ownership key and existing GSC service
helper. No key generation, credential logging, Indexing API or automatic retry.
An existing submission journal blocks --submit even if an attempt was uncertain;
--readback-only reads Google status without sending another notification.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import xml.etree.ElementTree as ET


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ORIGIN = "https://gptbot.uz"
PROPERTY = "sc-domain:gptbot.uz"
RELEASE_COMMIT = "504d3bac271a04bc8104dad1e0710fba61ca934d"
HELPER = Path("F:/Claude/gptbot-tools/gsc_tools.py")
INDEXNOW_ENDPOINT = "https://yandex.com/indexnow"
SURFACES = (
    "/sitemap.xml", "/sitemap-updates.xml",
    "/uz/blog/feed.xml", "/updates/atom.xml",
)
EXPECTED_PATHS = (
    "/uz/kirill-lotin/", "/ru/kirillica-v-latinicu/",
    "/uz/blog/slayd-tayyorlash/", "/uz/blog/tavsifnoma-namuna/",
    "/uz/blog/rezyume-tayyorlash/", "/uz/blog/tushuntirish-xati-va-ariza-yozish/",
    "/ru/oferta/", "/uz/oferta/",
)


class GuardError(ValueError):
    """Only our own non-sensitive validation messages are safe to report."""


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def require(condition, message):
    if not condition:
        raise GuardError(message)


def safe_error(exc):
    result = {"type": type(exc).__name__}
    status = getattr(getattr(exc, "resp", None), "status", None)
    if status is not None:
        result["httpStatus"] = int(status)
    if isinstance(exc, GuardError):
        result["message"] = str(exc)
    return result


def save(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def fetch(url, payload=None):
    """One request only; redirects, transient errors and POSTs are not retried."""
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"User-Agent": "GPTBot-Release-Discovery-20261107/1.0"}
    if body is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
    request = Request(url, data=body, headers=headers)
    try:
        response = build_opener(NoRedirects()).open(request, timeout=35)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.read(), dict(response.headers.items())


def header(headers, name):
    return next((value for key, value in headers.items() if key.lower() == name), "")


class Indexability(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonicals = []
        self.robots = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and "canonical" in attrs.get("rel", "").lower().split():
            self.canonicals.append(attrs.get("href"))
        if tag == "meta" and attrs.get("name", "").lower() in ("robots", "googlebot"):
            self.robots.append(attrs.get("content", ""))


def load_urls():
    urls = json.loads((HERE / "changed-urls.json").read_text(encoding="utf-8-sig"))
    expected = [ORIGIN + path for path in EXPECTED_PATHS]
    require(isinstance(urls, list) and urls == expected,
            "The reviewed eight-URL scope or its order changed")
    require(len(set(urls)) == 8, "Exactly eight unique changed URLs are required")
    return urls


def check_release(expected_commit, expected_raw=None):
    local = (ROOT / "dist/gptbot-release.json").read_bytes()
    manifest = json.loads(local)
    require(manifest.get("commit") == expected_commit, "Local artifact commit mismatch")
    require(manifest.get("schema") == 1 and bool(manifest.get("artifactSha256")),
            "Local release manifest is incomplete")
    if expected_raw is not None:
        require(local == expected_raw, "Local release manifest changed during checks")
    status, live, _ = fetch(ORIGIN + "/gptbot-release.json")
    require(status == 200 and live == local, "Live release is not the exact expected local manifest")
    return manifest, local


def parse_surface(path, raw):
    require(b"<!DOCTYPE" not in raw.upper() and b"<!ENTITY" not in raw.upper(),
            "Unexpected XML declaration in " + path)
    root = ET.fromstring(raw)
    sm = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    atom = "{http://www.w3.org/2005/Atom}"
    if path in ("/sitemap.xml", "/sitemap-updates.xml"):
        require(root.tag == sm + "urlset", "Unexpected sitemap root")
        urls = [item.text for item in root.findall(sm + "url/" + sm + "loc")]
    elif path == "/uz/blog/feed.xml":
        require(root.tag == "rss", "Unexpected RSS root")
        urls = [item.text for item in root.findall("channel/item/link")]
    else:
        require(root.tag == atom + "feed", "Unexpected Atom root")
        urls = [link.get("href") for entry in root.findall(atom + "entry")
                for link in entry.findall(atom + "link") if link.get("rel", "alternate") == "alternate"]
    require(bool(urls) and len(urls) == len(set(urls)), "Empty or duplicate discovery URLs: " + path)
    for url in urls:
        parsed = urlsplit(url or "")
        require(parsed.scheme == "https" and parsed.netloc == "gptbot.uz"
                and not parsed.query and not parsed.fragment,
                "Unsafe discovery URL in " + path)
    return set(urls)


def public_checks(expected_commit, urls):
    manifest, manifest_raw = check_release(expected_commit)
    surfaces = []
    coverage = {}
    for path in SURFACES:
        status, raw, headers = fetch(ORIGIN + path)
        require(status == 200, "Discovery surface HTTP status is not 200: " + path)
        require(raw == (ROOT / "dist" / path.lstrip("/")).read_bytes(),
                "Live discovery surface differs from the built artifact: " + path)
        require(header(headers, "content-type").split(";")[0].strip().lower() in
                ("application/xml", "text/xml", "application/rss+xml", "application/atom+xml"),
                "Unexpected XML content type: " + path)
        coverage[path] = parse_surface(path, raw)
        surfaces.append({"url": ORIGIN + path, "httpStatus": status, "sha256": sha(raw),
                         "matchesLocalArtifact": True, "urlCount": len(coverage[path]),
                         "changedUrlsPresent": [url for url in urls if url in coverage[path]]})
    main = coverage["/sitemap.xml"]
    require(set(urls) <= main, "Changed URLs missing from main sitemap")
    require(all(coverage[path] <= main for path in SURFACES[1:]),
            "A discovery feed includes a URL outside the main sitemap")
    pages = []
    for url in urls:
        status, raw, headers = fetch(url)
        require(status == 200, "Changed URL did not return HTTP 200: " + url)
        require(header(headers, "content-type").split(";")[0].strip().lower() == "text/html",
                "Changed URL did not return HTML: " + url)
        head_end = raw.lower().find(b"</head>")
        require(head_end >= 0, "Changed HTML has no head: " + url)
        parser = Indexability()
        parser.feed(raw[:head_end + 7].decode("utf-8"))
        require(parser.canonicals == [url], "Changed URL has a non-self canonical: " + url)
        directives = parser.robots + [header(headers, "x-robots-tag")]
        require(not any(set(re.split(r"[\s,;:]+", value.lower())) & {"noindex", "none"}
                        for value in directives), "Changed URL is not indexable: " + url)
        require(b"GTM-NLR4WFX8" not in raw, "Changed URL still has the removed GTM container: " + url)
        pages.append({"url": url, "httpStatus": status, "selfCanonical": True,
                      "indexingAllowed": True, "sha256": sha(raw)})
    status, raw_key, _ = fetch(ORIGIN + "/api/indexnow/key")
    require(status == 200, "Public IndexNow key route did not return 200")
    key = raw_key.decode("utf-8").strip()
    require(re.fullmatch(r"[A-Za-z0-9-]{8,128}", key) is not None, "Invalid published IndexNow key format")
    key_location = ORIGIN + "/" + key + ".txt"
    status, root_key, _ = fetch(key_location)
    require(status == 200 and root_key.decode("utf-8").strip() == key,
            "Existing root IndexNow key file is unavailable or differs")
    require((ROOT / "public" / (key + ".txt")).read_text(encoding="utf-8-sig").strip() == key,
            "Published IndexNow key differs from this worktree")
    check_release(expected_commit, manifest_raw)
    return ({"checkedAt": now(), "commit": expected_commit,
             "manifest": manifest, "manifestExactMatch": True, "pages": pages,
             "surfaces": surfaces, "indexNowKeyFileVerified": True,
             "feedCoverageNote": "Feeds are bounded existing surfaces; all eight URLs must be in the main sitemap."},
            key, key_location, manifest_raw)


def load_service():
    # gsc_tools.py has an unconditional CLI dispatcher. Do not execute it.
    source = HELPER.read_text(encoding="utf-8-sig")
    marker = "\ncmd = sys.argv[1]"
    require(source.count(marker) == 1 and "def svc(write=False):" in source,
            "Existing GSC helper layout changed; review before use")
    namespace = {"__name__": "gptbot_existing_gsc_service", "__file__": str(HELPER)}
    exec(compile(source.split(marker, 1)[0], str(HELPER), "exec"), namespace)
    require(namespace.get("PROP") == PROPERTY and callable(namespace.get("svc")),
            "Existing GSC helper property/service mismatch")
    return namespace["svc"], sha(source.encode("utf-8"))


def get_existing(service):
    raw = service.sitemaps().list(siteUrl=PROPERTY).execute(num_retries=0)
    rows = {row.get("path"): row for row in raw.get("sitemap", [])}
    require(all(ORIGIN + path in rows for path in SURFACES),
            "An existing Google discovery surface is missing; no new sitemap entry will be created")
    return raw, rows


def capture_response(row):
    # googleapiclient response callbacks receive one httplib2.Response argument.
    def callback(response):
        row["httpStatus"] = int(response.status)
    return callback


def google_readback(reader, journal, folder):
    raw, existing = get_existing(reader)
    save(folder / "google-after.json", {"readAt": now(), "response": raw})
    rows = []
    for attempt in journal["attempts"]:
        if attempt["provider"] != "google":
            continue
        current = existing[attempt["url"]]
        submitted = current.get("lastSubmitted")
        matched = False
        if submitted and attempt.get("completedAt"):
            start = datetime.fromisoformat(attempt["startedAt"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(attempt["completedAt"].replace("Z", "+00:00"))
            value = datetime.fromisoformat(submitted.replace("Z", "+00:00"))
            previous = attempt.get("previousLastSubmitted")
            advanced = not previous or value > datetime.fromisoformat(previous.replace("Z", "+00:00"))
            matched = advanced and start - timedelta(seconds=5) <= value <= end + timedelta(seconds=5)
        rows.append({"url": attempt["url"], "http204Recorded": attempt.get("httpStatus") == 204,
                     "lastSubmitted": submitted, "matchesAttemptWindow": matched,
                     "isPending": current.get("isPending"), "errors": current.get("errors"),
                     "warnings": current.get("warnings")})
    result = {"readAt": now(), "surfaces": rows,
              "allFourReadbackMatched": len(rows) == 4 and all(row["matchesAttemptWindow"] for row in rows),
              "noReportedErrors": all(str(row.get("errors", "0") or "0") == "0" for row in rows),
              "indexingConfirmed": False}
    save(folder / "google-readback.json", result)
    return result


def begin_attempt(journal, path, row):
    journal["attempts"].append(row)
    save(path, journal)  # Durable before any external mutation.


def submit(expected_commit, urls, key, key_location, manifest_raw, svc, reader, existing, journal_path, folder, helper_sha):
    journal = {"startedAt": now(), "commit": expected_commit, "property": PROPERTY,
               "helperSourceSha256": helper_sha, "urls": urls, "attempts": [], "indexingConfirmed": False}
    # Exclusive creation prevents another runner or an uncertain old attempt from
    # silently sending the same notification twice.
    with journal_path.open("x", encoding="utf-8") as handle:
        json.dump(journal, handle, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    writer = svc(write=True)
    for path in SURFACES:
        check_release(expected_commit, manifest_raw)
        url = ORIGIN + path
        row = {"provider": "google", "url": url, "startedAt": now(), "state": "attempt_started",
               "previousLastSubmitted": existing[url].get("lastSubmitted")}
        begin_attempt(journal, journal_path, row)
        try:
            request = writer.sitemaps().submit(siteUrl=PROPERTY, feedpath=url)
            request.add_response_callback(capture_response(row))
            request.execute(num_retries=0)
            row.update(completedAt=now(), state="accepted" if row.get("httpStatus") == 204 else "unconfirmed")
            save(journal_path, journal)
            require(row.get("httpStatus") == 204, "Google submission did not return HTTP 204")
        except Exception as exc:
            row.update(completedAt=now(), state="error_or_uncertain", error=safe_error(exc))
            save(journal_path, journal)
            raise
    check_release(expected_commit, manifest_raw)
    row = {"provider": "indexnow", "endpoint": INDEXNOW_ENDPOINT, "urlCount": len(urls),
           "startedAt": now(), "state": "attempt_started", "keyFileVerified": True}
    begin_attempt(journal, journal_path, row)
    try:
        status, _, _ = fetch(INDEXNOW_ENDPOINT, {"host": "gptbot.uz", "key": key,
                                                "keyLocation": key_location, "urlList": urls})
        row.update(completedAt=now(), httpStatus=status, keyValidationPending=status == 202,
                   state="accepted" if status in (200, 202) else "rejected")
        save(journal_path, journal)
    except Exception as exc:
        row.update(completedAt=now(), state="error_or_uncertain", error=safe_error(exc))
        save(journal_path, journal)
        raise
    readback = google_readback(reader, journal, folder)
    journal["completedAt"] = now()
    journal["googleReadbackMatched"] = readback["allFourReadbackMatched"]
    save(journal_path, journal)
    require(row["state"] == "accepted", "IndexNow rejected the batch; inspect the receipt before any further action")
    require(readback["allFourReadbackMatched"], "Google readback did not yet match every attempt; use --readback-only")
    require(readback["noReportedErrors"], "Google readback reports sitemap errors; inspect google-readback.json")
    return journal


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-commit", required=True)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--check-only", action="store_true", help="Default: public and GSC reads only")
    modes.add_argument("--submit", action="store_true", help="Explicitly send the reviewed five notifications once")
    modes.add_argument("--readback-only", action="store_true", help="Read Google state for an existing journal; no submissions")
    args = parser.parse_args()
    if args.expected_commit != RELEASE_COMMIT:
        parser.error("--expected-commit must be this reviewed release's exact SHA")
    folder = HERE / "search-discovery" / args.expected_commit[:12]
    folder.mkdir(parents=True, exist_ok=True)
    journal_path = folder / "submissions.json"
    try:
        if args.submit:
            require(not journal_path.exists(), "Submission journal exists; no retries allowed. Use --readback-only")
        urls = load_urls()
        if args.readback_only:
            journal = json.loads(journal_path.read_text(encoding="utf-8"))
            require(journal.get("commit") == args.expected_commit and journal.get("urls") == urls,
                    "Existing journal identity or URL scope mismatch")
            svc, _ = load_service()
            result = google_readback(svc(), journal, folder)
            print(json.dumps({"mode": "readback-only", "writes": 0, **result}))
            return 0 if result["allFourReadbackMatched"] and result["noReportedErrors"] else 1
        validation, key, key_location, manifest_raw = public_checks(args.expected_commit, urls)
        svc, helper_sha = load_service()
        reader = svc()
        before, existing = get_existing(reader)
        save(folder / "public-checks.json", validation)
        save(folder / "google-before.json", {"readAt": now(), "response": before})
        if not args.submit:
            print(json.dumps({"mode": "check-only", "ok": True, "writes": 0, "changedUrls": len(urls),
                              "googleSurfaces": len(SURFACES), "existingIndexNowKeyVerified": True}))
            return 0
        journal = submit(args.expected_commit, urls, key, key_location, manifest_raw, svc, reader,
                         existing, journal_path, folder, helper_sha)
        print(json.dumps({"mode": "submit", "ok": True, "attempts": len(journal["attempts"]),
                          "googleReadbackMatched": journal["googleReadbackMatched"], "indexingConfirmed": False}))
        return 0
    except Exception as exc:
        error = {"at": now(), "commit": args.expected_commit, "error": safe_error(exc),
                 "mutationsRetried": False, "journalExists": journal_path.exists()}
        save(folder / "error.json", error)
        print(json.dumps(error))
        return 1


if __name__ == "__main__":
    sys.exit(main())
