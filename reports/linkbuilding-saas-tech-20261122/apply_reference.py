#!/usr/bin/env python3
"""Remove reference-file domains from the GPTBot research deliverables (run inside the deliverables folder).

Usage:  python3 apply_reference.py GPTBot-NEW_300_BATCH2_1122.txt

- GPTBot_SaaS_Tech_Research.csv : rows whose root domain is in the reference are removed
- GPTBot_SaaS_Tech_XRumer_1000.txt, GPTBot_Manual_Submission.txt : matching URLs/lines are removed
- GPTBot_Rejected.csv : removed domains are appended with reason_code IN_REFERENCE
Root domains are compared with tldextract when it is installed, otherwise with a built-in heuristic.
"""
import csv
import re
import sys
from urllib.parse import urlparse

try:
    import tldextract
    _ext = tldextract.TLDExtract()

    def root(host):
        e = _ext(host or "")
        return (getattr(e, "top_domain_under_public_suffix", None) or getattr(e, "registered_domain", "") or host or "").lower()
except Exception:  # noqa: BLE001
    _two = {"co.uk", "org.uk", "ac.uk", "com.au", "net.au", "co.jp", "com.br", "com.ua", "org.ua", "com.tr", "co.in", "co.za",
            "com.cn", "com.ar", "com.mx", "co.kr", "com.sg", "co.il", "com.ru", "net.ru", "org.ru", "co.uz", "com.kz", "msk.ru", "spb.ru"}

    def root(host):
        h = (host or "").lower().strip(".")
        parts = h.split(".")
        if len(parts) >= 3 and ".".join(parts[-2:]) in _two:
            return ".".join(parts[-3:])
        return ".".join(parts[-2:])


def host_of(s):
    s = s.strip()
    if not s:
        return ""
    if "://" not in s:
        s = "https://" + s
    try:
        return (urlparse(s).hostname or "").lower()
    except Exception:  # noqa: BLE001
        return ""


ref_path = sys.argv[1]
ref = set()
for line in open(ref_path, encoding="utf-8", errors="replace"):
    for tok in re.findall(r"(?:https?://)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:/[^\s,;]*)?", line):
        h = host_of(tok)
        if h:
            ref.add(root(h))
print("reference root domains:", len(ref))
CSV, XR, MAN, REJ = "GPTBot_SaaS_Tech_Research.csv", "GPTBot_SaaS_Tech_XRumer_1000.txt", "GPTBot_Manual_Submission.txt", "GPTBot_Rejected.csv"
with open(CSV, encoding="utf-8-sig", newline="") as fh:
    rd = csv.DictReader(fh)
    cols = rd.fieldnames
    rows = list(rd)
keep = [r for r in rows if r["domain"].lower() not in ref]
gone = [r for r in rows if r["domain"].lower() in ref]
with open(CSV, "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=cols)
    w.writeheader()
    w.writerows(keep)
xr = [u for u in open(XR, encoding="utf-8").read().split("\n") if u.strip()]
xr_keep = [u for u in xr if root(host_of(u)) not in ref]
open(XR, "w", encoding="utf-8", newline="\n").write("\n".join(xr_keep) + ("\n" if xr_keep else ""))
man = open(MAN, encoding="utf-8").read().split("\n")
man_keep = [ln for ln in man if not (ln.startswith("http") and root(host_of(ln.split(" | ")[0])) in ref)]
open(MAN, "w", encoding="utf-8", newline="\n").write("\n".join(man_keep))
with open(REJ, "a", encoding="utf-8", newline="") as fh:
    w = csv.writer(fh)
    for r in gone:
        w.writerow([r["domain"], "IN_REFERENCE", "domain present in reference file " + ref_path, r["homepage_url"], r["quality_score"], r["verification_date"]])
print(f"CSV: {len(rows)} -> {len(keep)} (removed {len(gone)}); VERIFIED left: {sum(1 for r in keep if r['verification_status'] == 'VERIFIED')}")
print(f"XRumer TXT: {len(xr)} -> {len(xr_keep)};  Manual lines removed: {len(man) - len(man_keep)}")
