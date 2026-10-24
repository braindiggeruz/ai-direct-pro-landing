import json, re, sys, unicodedata
sys.stdout.reconfigure(encoding="utf-8")

V = {
    "current": {
        "ru": ("Аналог ChatGPT онлайн бесплатно — без регистрации",
               "AI-чат на русском и узбекском: 3 бесплатных пробных ответа без регистрации, затем AI-пакет. GPTBot.uz — независимый сервис, не OpenAI и не ChatGPT."),
        "uz": ("ChatGPT o‘zbek tilida? Muqobil AI chat, bepul kirish",
               "O‘zbek tilida AI chat: ro‘yxatsiz 3 ta bepul sinov javobi, keyin AI paket. Matn, reja va g‘oyalar. GPTBot.uz — mustaqil servis, OpenAI emas."),
    },
    "RU-A": ("Аналог ChatGPT онлайн в Узбекистане — без регистрации",
             "ИИ-чат на русском и узбекском в браузере, без установки: 3 бесплатных пробных ответа, затем AI-пакет. GPTBot.uz — независимый сервис, не OpenAI и не ChatGPT."),
    "RU-B": ("Аналог ChatGPT онлайн на русском и узбекском | GPTBot.uz",
             "Без регистрации и установки: тексты, учёба, работа в браузере. 3 бесплатных пробных ответа, затем AI-пакет. Это независимый сервис, не OpenAI и не ChatGPT."),
    "RU-C": ("Аналог ChatGPT в Узбекистане: на русском и узбекском",
             "Чат с ИИ онлайн без регистрации: 3 бесплатных пробных ответа, затем AI-пакет. Тексты, учёба и работа. GPTBot.uz — независимый сервис, не OpenAI и не ChatGPT."),
    "UZ-A": ("ChatGPT uzbekcha muqobili — bepul kirish, ro‘yxatsiz chat",
             "O‘zbekcha yozing: matn, reja va g‘oyalar brauzerda, ilovasiz. Ro‘yxatsiz 3 ta bepul sinov javobi, keyin AI paket. GPTBot.uz — mustaqil servis, OpenAI emas."),
    "UZ-B": ("O‘zbek tilida AI chat — ChatGPT muqobili | GPTBot.uz",
             "Savolni o‘zbekcha yozing: matn, e’lon, reja va g‘oyalar. Ro‘yxatsiz 3 ta bepul sinov javobi, keyin AI paket. GPTBot.uz — mustaqil servis, OpenAI emas."),
    "UZ-C": ("Akkauntsiz o‘zbekcha AI chat: ChatGPT muqobili, bepul sinov",
             "Ro‘yxatdan o‘tmasdan o‘zbekcha yozing — matn, reja va g‘oyalar uchun. Jami 3 ta bepul sinov javobi. GPTBot.uz — mustaqil servis, OpenAI emas."),
}

BANNED = re.compile(r"rasmiy|официальн|official|GPT-4|GPT-5|Plus|obuna|подписк|GPTBot AI|tarjim|перевод|безлимит|cheksiz|kunlik|чачи|чати|джипити|жпт|jaji|chati|chaji|piti", re.I)

def report(name, t, d):
    out = {
        "variant": name,
        "title": t, "title_len": len(t),
        "description": d, "description_len": len(d),
        "title_ok_le60": len(t) <= 60,
        "desc_ok_120_158": 120 <= len(d) <= 158,
        "desc_has_3": bool(re.search(r"3", d)),
        "desc_has_trial_word": bool(re.search(r"sinov|пробн", d)),
        "banned_hits": sorted(set(m.group(0) for m in BANNED.finditer(t + " " + d))),
        "ascii_apostrophe": ("'" in t) or ("'" in d),
        "u2018": (t + d).count("‘"), "u2019": (t + d).count("’"), "u02bb": (t + d).count("ʻ"),
        "independence_ru": "независимый сервис, не OpenAI и не ChatGPT" in d,
        "independence_uz": bool(re.search(r"[Mm]ustaqil servis, OpenAI emas", d)),
        "brand": "GPTBot.uz" in t + d,
        "nbsp": " " in t + d,
    }
    return out

rows = []
for k, v in V.items():
    if k == "current":
        for loc, (t, d) in v.items():
            rows.append(report("current-" + loc, t, d))
    else:
        rows.append(report(k, *v))
for r in rows:
    print(json.dumps(r, ensure_ascii=False))
