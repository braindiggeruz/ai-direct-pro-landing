#!/usr/bin/env python3
"""
Generate ready-to-apply unified diffs for wave 1 (T01–T05) WITHOUT touching the
tracked content files. Copies are edited in a scratch directory and diffed with
`git diff --no-index`; output goes to docs/seo/gsc-audit-2026-09-17/patches/.

Apply later (after owner approval) with:
    git apply docs/seo/gsc-audit-2026-09-17/patches/T01-login-article-snippet.diff
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
PATCHES = REPO / "docs" / "seo" / "gsc-audit-2026-09-17" / "patches"
PATCHES.mkdir(parents=True, exist_ok=True)
TMP = Path(tempfile.mkdtemp(prefix="wave1-"))
TODAY = "2026-09-18"


def load(rel: str) -> dict:
    return json.loads((REPO / rel).read_text(encoding="utf-8"))


def dump(rel: str, data: dict) -> Path:
    out = TMP / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    # match repo formatting: 2-space indent, no ASCII escaping, trailing newline
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out


def diff(rel: str, name: str) -> None:
    a, b = REPO / rel, TMP / rel
    res = subprocess.run(["git", "diff", "--no-index", "--", str(a), str(b)], capture_output=True, text=True, encoding="utf-8", cwd=REPO)
    out = []
    for line in res.stdout.splitlines():
        if line.startswith("diff --git "):
            line = f"diff --git a/{rel} b/{rel}"
        elif line.startswith("--- "):
            line = f"--- a/{rel}"
        elif line.startswith("+++ "):
            line = f"+++ b/{rel}"
        out.append(line)
    text = "\n".join(out) + "\n"
    with open(PATCHES / f"{name}.diff", "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    print(f"  {name}.diff  ({text.count(chr(10))} lines)")


def detect_style(rel: str) -> None:
    raw = (REPO / rel).read_text(encoding="utf-8")
    ind = "2sp" if raw.startswith("{\n  \"") else "other"
    if ind != "2sp":
        print(f"  WARNING: {rel} not 2-space indented; diff will include reformatting")


# --------------------------------------------------------------------- T01 login article
rel = "content/blog/uz/chatgptga-qanday-kirish-mumkin.json"
detect_style(rel)
d = load(rel)
d["title"] = "ChatGPT kirish (login): rasmiy sayt, ochish va ro‘yxatdan o‘tish"
d["ogTitle"] = d["title"]
d["h1"] = "ChatGPT kirish va ochish: rasmiy sayt, ro‘yxatdan o‘tish va xatolar"
d["description"] = "ChatGPT’ga kirish va ochish: rasmiy chatgpt.com, hisob ochish, kod kelmasa nima qilish, klon saytlardan saqlanish. O‘zbekiston uchun 2026 qo‘llanmasi."
d["ogDescription"] = d["description"]
d["intro"] = ("ChatGPT’ga kirish uchun brauzerda chatgpt.com manzilini oching va Log in tugmasini bosing; hisobingiz bo‘lmasa — Sign up. "
              "ChatGPT ochish uchun VPN odatda kerak emas: 2026-yil holatiga ko‘ra O‘zbekiston OpenAI qo‘llab-quvvatlaydigan mamlakatlar ro‘yxatida. "
              "Eng muhimi — rasmiy domenni tekshirish va parol yoki karta ma’lumotlarini klon saytlarga kiritmaslik.")
# insert an "ochish" section right after the first H2 block ("ChatGPT kirish: eng qisqa yo‘l") and its paragraphs
body = d["body"]
idx = next(i for i, b in enumerate(body) if b.get("type") == "h2" and b.get("text", "").startswith("Log in va Sign up"))
new_blocks = [
    {"type": "h2", "id": "ochish", "text": "ChatGPT ochish: 3 qadam"},
    {"type": "list", "items": [
        "Brauzerda chatgpt.com manzilini qo‘lda kiriting — reklama yoki «chatgpt uz» ko‘rinishidagi klon havolalarni ochmang.",
        "Log in tugmasini bosing va Google, Apple yoki e-mail orqali kiring; hisob yo‘q bo‘lsa — Sign up.",
        "Kirgandan keyin chat oynasida o‘zbek tilida yozing — til sozlamasi shart emas, model so‘rov tilini o‘zi tushunadi.",
    ]},
    {"type": "p", "text": "Ochilmasa yoki kod kelmasa — quyidagi «ChatGPT ochilmasa nima qilish kerak?» bo‘limiga qarang. O‘zbek tilida darhol savol berish uchun ro‘yxatsiz variant — GPTBot AI chati."},
]
body[idx:idx] = new_blocks
if body[3].get("type") == "toc":
    body[3]["links"].insert(1, {"anchor": "ochish", "label": "ChatGPT ochish: 3 qadam"})
# «chatgpt bepul kirish» stays with the product page /uz/gpt-uzbek-tilida/ (T03), not the login article
d["keywords"] = list(dict.fromkeys(["chatgpt kirish", "chatgpt ochish", "chatgptga kirish", "chatgpt login", "chatgpt online kirish"] + [k for k in d.get("keywords", []) if k.lower() != "chatgpt bepul kirish"]))
d["dateModified"] = TODAY
d["updatedAt"] = TODAY
dump(rel, d)
diff(rel, "T01-login-article-snippet")

# --------------------------------------------------------------------- T02 VPNsiz article
rel = "content/blog/uz/chatgpt-ozbekistonda-vpnsiz-ishlaydimi.json"
detect_style(rel)
d = load(rel)
d["title"] = "ChatGPT O‘zbekistonda ishlaydimi? VPNsiz va rasmiy usul (2026)"
d["ogTitle"] = d["title"]
d["h1"] = "ChatGPT O‘zbekistonda: ishlaydimi, VPN kerakmi va rasmiy usul"
d["description"] = "ChatGPT O‘zbekistonda rasman ishlaydimi, VPN kerakmi, OpenAI ro‘yxatda bormi, kartadan to‘lash mumkinmi — 2026 holati bo‘yicha tekshirilgan javoblar va manbalar."
d["ogDescription"] = d["description"]
body = d["body"]
# rename the first H2 away from the login intent, keep a short pointer to the login article
h2 = next(b for b in body if b.get("type") == "h2" and b.get("text", "").startswith("ChatGPT’ga kirish: 4 qadam"))
h2["text"] = "Qisqa javob: ishlaydi, VPN shart emas"
i = body.index(h2)
body[i + 1] = {"type": "p", "text": "Ha, ChatGPT O‘zbekistonda rasman ishlaydi: chatgpt.com brauzerda ochiladi, ilova Play Market va App Store’da mavjud, VPN odatiy kirish uchun kerak emas. Login, ro‘yxatdan o‘tish va xatolar bo‘yicha alohida qo‘llanma — «ChatGPT kirish» maqolasida."}
# ensure the contextual link to the login article uses the "kirish" anchor
for l in d["internalLinks"]:
    if l.get("target") == "/uz/blog/chatgptga-qanday-kirish-mumkin/":
        l["anchor"] = "ChatGPT’ga kirish"
# drop every kirish/ochish variant (owned by the login article, intent-manifest pair C18) and case duplicates
_seen: set = set()
d["keywords"] = [k for k in ["chatgpt o'zbekistonda ishlaydimi", "chatgpt vpnsiz", "chatgpt uzbekistan", "openai o'zbekiston"] + list(d.get("keywords", []))
                 if not ("kirish" in k.lower() or "ochish" in k.lower() or k.lower() in _seen or _seen.add(k.lower()))]
d["dateModified"] = TODAY
d["updatedAt"] = TODAY
dump(rel, d)
diff(rel, "T02-vpnsiz-article-detitle-kirish")

# --------------------------------------------------------------------- T03 UZ chat page
rel = "content/pages/uz/gpt-uzbek-tilida.json"
detect_style(rel)
d = load(rel)
d["title"] = "ChatGPT o‘zbek tilida (uzbekcha) — bepul kirish, ro‘yxatsiz chat"
d["ogTitle"] = d["title"]
d["description"] = "ChatGPT uzbekcha online: bepul kirish, ro‘yxatdan o‘tmasdan, VPNsiz. Savol bering — javob o‘zbek tilida, telefon va kompyuterda ishlaydi."
d["ogDescription"] = d["description"]
d["heroSubtitle"] = "ChatGPT uzbekcha: bepul kirish, ro‘yxatsiz — matn, tarjima, reja va savollar o‘zbek tilida."
b0 = d["bodyBlocks"][0]
b0["text"] = ("GPTBot.uz AI-chati — O‘zbekiston uchun o‘zbek va rus tillarida ishlaydigan mustaqil onlayn yordamchi. "
              "«ChatGPT uzbekcha», «chatgpt o‘zbekcha online» yoki «chatgpt uzbek tilida» deb qidirgan foydalanuvchi shu sahifada bepul kirib, brauzer orqali savol berishi mumkin: alohida APK yoki dastur yuklash shart emas. "
              + b0["text"].split("shart emas. ", 1)[-1])
d["secondaryKeywords"] = list(dict.fromkeys(d["secondaryKeywords"] + ["chatgpt bepul kirish", "chatgpt kirish uzbek tilida", "chatgpt o'zbekcha", "chatgpt 4 uzbek tilida", "chatgpt uzbek"]))
d["lastReviewedAt"] = TODAY
d["updatedAt"] = TODAY
dump(rel, d)
diff(rel, "T03-uz-chat-title-kirish-uzbekcha")

# --------------------------------------------------------------------- T04 RU chat page: explicit link to UZ version
rel = "content/pages/ru/gpt-chat.json"
detect_style(rel)
d = load(rel)
d["heroSubtitle"] = "Пишите по-русски: текст, перевод, учёба и работа — без установки. ChatGPT o‘zbek tilida — на узбекской версии."
d["bodyBlocks"].insert(0, {"type": "linkp", "text": "O‘zbek tilida kerakmi? {uzchat} — o‘sha chat, javoblar o‘zbekcha.",
                           "links": [{"token": "uzchat", "target": "/uz/gpt-uzbek-tilida/", "anchor": "ChatGPT o‘zbek tilida (uzbekcha) — bepul kirish"}]})
d["description"] = "ChatGPT онлайн в Узбекистане без регистрации и VPN: русскоязычный AI-чат прямо в браузере. Тексты, перевод, учёба и работа — бесплатно. Есть узбекская версия."
d["ogDescription"] = d["description"]
if not any(l.get("target") == "/uz/gpt-uzbek-tilida/" for l in d["internalLinks"]):
    d["internalLinks"].insert(0, {"target": "/uz/gpt-uzbek-tilida/", "anchor": "ChatGPT o‘zbek tilida (uzbekcha)", "locale": "ru", "type": "contextual", "priority": 1})
d["lastReviewedAt"] = TODAY
d["updatedAt"] = TODAY
dump(rel, d)
diff(rel, "T04-ru-chat-link-to-uz")

# --------------------------------------------------------------------- T05 redirects
rel = "content/seo/redirects.json"
d = load(rel)
ids = {r["id"] for r in d}
for r in (
    {"id": "gsc-typo-gpt-vs-chatgpt-sravnesie", "from": "/ru/gpt-vs-chatgpt-sravnesie/", "to": "/ru/gpt-vs-chatgpt-sravnenie/", "statusCode": 301,
     "reason": "GSC shows 1 click on a typo URL (sravnesie); live 404. Consolidate into the published comparison page (gsc-audit-2026-09-17).", "createdAt": TODAY},
    {"id": "gsc-legacy-uz-kompyuter-ga-yuklab-olish", "from": "/uz/blog/chatgpt-telefon-va-kompyuter-ga-yuklab-olish/", "to": "/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/", "statusCode": 301,
     "reason": "GSC shows impressions on a slug variant (kompyuter-ga); live 404. Consolidate into the published Uzbek download guide (gsc-audit-2026-09-17).", "createdAt": TODAY},
):
    if r["id"] not in ids:
        d.append(r)
dump(rel, d)
diff(rel, "T05-redirects-two-404s")

shutil.rmtree(TMP, ignore_errors=True)
print("patches written to", PATCHES)
