#!/usr/bin/env python3
"""Write deliverables from LR/out/build_state.json.
Usage: python3 -I write_outputs.py LR_DIR OUT_DIR
"""
import collections
import csv
import json
import os
import re
import sys

LR, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
st = json.load(open(os.path.join(LR, "out", "build_state.json"), encoding="utf-8"))
rows, rejected, paid = st["rows"], st["rejected"], st["paid"]
merge = json.load(open(os.path.join(LR, "verify", "merge_stats.json")))
extra_stats = {}
if os.path.exists(os.path.join(LR, "verify", "merge_stats_extra.json")):
    extra_stats = json.load(open(os.path.join(LR, "verify", "merge_stats_extra.json")))
COLS = ["domain", "homepage_url", "submit_url", "registration_url", "category", "language", "country", "platform",
        "submission_type", "xrumer_compatibility", "registration_required", "free_submission", "external_links_allowed",
        "self_promotion_allowed", "moderation_required", "last_activity", "quality_score", "tier", "verification_status",
        "verification_date", "evidence_url", "notes"]
TORD = {"TIER 1": 0, "TIER 2": 1, "TIER 3": 2}
rows.sort(key=lambda r: (TORD.get(r["tier"], 9), -r["quality_score"], r["domain"]))


def xrumer_ok(r):
    if r["verification_status"] != "VERIFIED" or r["tier"] not in TORD:
        return False
    if r["xrumer_compatibility"] not in ("POTENTIAL", "CUSTOM") or r.get("_captcha"):
        return False
    if r["submission_type"] == "SUBMIT_FORM":
        if re.search(r"(order|checkout|pricing|payment|/buy|/pay|guest-post|sponsor|advertis)", r["submit_url"] or "", re.I):
            return False
        return bool(r["submit_url"]) and r.get("_form_in_html")
    if r["submission_type"] == "FORUM":
        return r["self_promotion_allowed"].startswith("yes") and bool(r["registration_url"]) and "not confirmed" not in r["notes"]
    return False


xr_rows = [r for r in rows if xrumer_ok(r)]   # strict subset (CAPTCHA-free HTML forms / forums with self-promo section)
xr_strict_urls = []
for r in xr_rows:
    u = r["registration_url"] if r["submission_type"] == "FORUM" else r["submit_url"]
    if u and u not in xr_strict_urls:
        xr_strict_urls.append(u)


def placement_url(r):
    """Most direct placement URL for one platform (one line per root domain)."""
    sub, reg, ev, home = r.get("submit_url") or "", r.get("registration_url") or "", r.get("evidence_url") or "", r.get("homepage_url") or ""
    if r["submission_type"] == "FORUM":
        return reg or sub or home
    if re.search(r"(sign-?in|log-?in|/auth|redirect=|next=|returnto=)", sub, re.I) and ev.startswith("http") and not re.search(r"(sign-?in|log-?in|/auth)", ev, re.I):
        return ev
    return sub or reg or ev or home


txt_rows = [r for r in rows if r["verification_status"] == "VERIFIED"]
xr_urls, _seen_roots = [], set()
for r in txt_rows:
    u = placement_url(r).strip()
    if not re.match(r"^https?://[^\s\"'<>]+$", u) or r["domain"] in _seen_roots or u in xr_urls:
        continue
    _seen_roots.add(r["domain"])
    xr_urls.append(u)
with open(os.path.join(OUT, "GPTBot_SaaS_Tech_XRumer_1000.txt"), "w", encoding="utf-8", newline="\n") as fh:
    fh.write("\n".join(xr_urls) + ("\n" if xr_urls else ""))

with open(os.path.join(OUT, "GPTBot_SaaS_Tech_Research.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(COLS)
    for r in rows:
        w.writerow([r.get(c, "") for c in COLS])

xr_set = set(id(r) for r in xr_rows)
manual = [r for r in rows if id(r) not in xr_set]
bp_rej = [x for x in rejected if x.get("reason_code") == "UNVERIFIABLE_BOT_PROTECTION"]
TYPE_RU = {"SUBMIT_FORM": "форма добавления", "FORUM": "форум", "ARTICLE": "статья/контрибьютор", "COMPANY_PROFILE": "профиль компании",
           "MANUAL": "ручной процесс", "UNVERIFIED": "не подтверждено"}
with open(os.path.join(OUT, "GPTBot_Manual_Submission.txt"), "w", encoding="utf-8", newline="\n") as fh:
    fh.write("GPTBot.uz — площадки для РУЧНОГО размещения (проверено 2026-11-22)\n")
    fh.write("Формат: URL | категория | способ | tier/балл | что учесть\n")
    fh.write("Причины ручного режима: регистрация/логин, CAPTCHA, JS-форма или внешняя форма (Tally/Typeform/Google Forms),\n")
    fh.write("редакционная проверка, правила форума, частичная проверка. Площадки с CAPTCHA сознательно не включены в XRumer-файл.\n")
    for tier in ("TIER 1", "TIER 2", "TIER 3"):
        part = [r for r in manual if r["tier"] == tier]
        if not part:
            continue
        fh.write(f"\n=== {tier} ({len(part)}) ===\n")
        bycat = collections.defaultdict(list)
        for r in part:
            bycat[r["category"]].append(r)
        for cat in ("AI Tools Directory", "SaaS Directory", "Startup & Tech Community", "Technology Forum"):
            if not bycat.get(cat):
                continue
            fh.write(f"\n--- {cat} ({len(bycat[cat])}) ---\n")
            for r in bycat[cat]:
                u = r["submit_url"] or r["registration_url"] or r["homepage_url"]
                bits = []
                if r["registration_required"].startswith("yes"):
                    bits.append("нужен аккаунт")
                if r.get("_captcha"):
                    bits.append("CAPTCHA")
                fs = r["free_submission"]
                bits.append("бесплатно" if fs.startswith("yes") else ("бесплатно + платные опции" if fs.startswith("freemium") else "условия оплаты не указаны"))
                if r["verification_status"] != "VERIFIED":
                    bits.append("частичная проверка: " + r["notes"].split(" | ")[0][:70])
                if r["submission_type"] == "FORUM":
                    bits.append(r["self_promotion_allowed"][:90])
                fh.write(f"{u} | {r['category']} | {TYPE_RU.get(r['submission_type'], r['submission_type'])} | {r['tier']}/{r['quality_score']} | {'; '.join(bits)}\n")
    if bp_rej:
        strong = [x for x in bp_rej if (x.get("_n_sources") or 0) >= 0]
        fh.write(f"\n=== ТРЕБУЮТ ПРОВЕРКИ В ОБЫЧНОМ БРАУЗЕРЕ ({len(bp_rej)}) — сайт онлайн, но anti-bot (Cloudflare и т.п.) блокирует автоматическую проверку; НЕ считаются подтверждёнными ===\n")
        for x in sorted(bp_rej, key=lambda z: z["domain"]):
            fh.write(f"{x.get('checked_url')} | {x['domain']}\n")

def _roots(name):
    pth = os.path.join(LR, "verify", name)
    return set(json.loads(l)["root"] for l in open(pth, encoding="utf-8")) if os.path.exists(pth) else set()
snow_roots = _roots("queue_snow2.jsonl")
seed_roots = set(json.loads(l)["root"] for l in open(os.path.join(LR, "verify", "queue_extra.jsonl"), encoding="utf-8") if json.loads(l).get("seed"))
NOISE = {"NOT_A_PLATFORM", "OFF_TOPIC", "DEAD", "PARKED", "NOT_LIVE", "HTTP_ERROR"}
omitted = collections.Counter()
rej_out = []
for x in rejected:
    d = x.get("domain") or ""
    if d in snow_roots and x["reason_code"] in NOISE:
        omitted["snowball_" + x["reason_code"]] += 1
        continue
    if d in seed_roots and x["reason_code"] in ("DEAD", "PARKED", "NOT_LIVE", "HTTP_ERROR"):
        omitted["seed_unresolved"] += 1
        continue
    rej_out.append(x)
acc_domains = set(r["domain"] for r in rows) | set(r["domain"] for r in paid)
_seen = set()
_dedup = []
for x in rej_out:
    d = x.get("domain") or ""
    if d in _seen or d in acc_domains:
        continue
    _seen.add(d)
    _dedup.append(x)
rej_out = _dedup
with open(os.path.join(OUT, "GPTBot_Rejected.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["domain", "reason_code", "reason", "checked_url", "score_if_scored", "verification_date"])
    for x in sorted(rej_out, key=lambda z: (z["reason_code"], z["domain"] or "")):
        w.writerow([x["domain"], x["reason_code"], x["reason"], x.get("checked_url", ""), x.get("score", ""), "2026-11-22"])

with open(os.path.join(OUT, "GPTBot_Paid_Only.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(COLS)
    for r in sorted(paid, key=lambda z: -z["quality_score"]):
        w.writerow([r.get(c, "") for c in COLS])

summary = {
    "accepted": len(rows), "xrumer_txt": len(xr_urls), "xrumer_strict": len(xr_strict_urls),
    "txt_captcha": sum(1 for r in txt_rows if r.get("_captcha")), "manual": len(manual), "rejected": len(rejected), "rejected_listed": len(rej_out),
    "rejected_omitted": dict(omitted), "paid_only": len(paid),
    "bot_protected": len(bp_rej), "tiers": dict(collections.Counter(r["tier"] for r in rows)),
    "cats": dict(collections.Counter(r["category"] for r in rows)), "types": dict(collections.Counter(r["submission_type"] for r in rows)),
    "xr": dict(collections.Counter(r["xrumer_compatibility"] for r in rows)), "vstatus": dict(collections.Counter(r["verification_status"] for r in rows)),
    "reject_codes": dict(collections.Counter(x["reason_code"] for x in rejected)), "dup_after_redirect": st.get("dup"),
    "merge": merge, "merge_extra": extra_stats,
    "lang": dict(collections.Counter(r["language"] for r in rows).most_common(15)),
    "country": dict(collections.Counter(r["country"] for r in rows).most_common(15)),
    "platform_forums": dict(collections.Counter(r["platform"] for r in rows if r["category"] == "Technology Forum")),
    "captcha": sum(1 for r in rows if r.get("_captcha")),
    "free": dict(collections.Counter(r["free_submission"].split(" ")[0] for r in rows)),
}
json.dump(summary, open(os.path.join(LR, "out", "summary.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in summary.items() if k not in ("merge", "merge_extra")}, ensure_ascii=False, indent=1))
