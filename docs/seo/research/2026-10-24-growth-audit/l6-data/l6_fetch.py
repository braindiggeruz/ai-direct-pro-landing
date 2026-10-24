import json, sys, time, os, hashlib, urllib.request, ssl, gzip, zlib

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36")
URLS = [
  # q1 chatgpt yuklab olish
  ("q1", "https://chatgpt.com/fa-IR/download/"),
  ("q1", "https://skillbox.ru/media/code/kak-skachat-chatgpt-na-android/"),
  ("q1", "https://chatgpt-chat-with-ai.softonic.ru/android"),
  ("q1", "https://chatgpt.uptodown.com/android"),
  # q2 chatgpt kirish uzbek tilida
  ("q2", "https://chatgpt.uz/"),
  ("q2", "https://textie.ai/uz/chat-gpt"),
  ("q2", "https://www.giti.ai/uz"),
  ("q2", "https://chatgpt.uz/ai/"),
  # q3 sun'iy intellekt
  ("q3", "https://salom-ai.uz/"),
  ("q3", "https://uz.wikipedia.org/wiki/Sun%CA%BCiy_intellekt"),
  ("q3", "https://minjusttraining.uz/news/suniy-intellekt-va-uning-kundalik-hayotdagi-ahamiyati"),
  ("q3", "https://mohirdev.uz/blog/SI-nima-SI-haqida-batafsil/"),
  # q4 chat gpt na russkom
  ("q4", "https://ai.mitup.ru/chatgpt-free"),
  ("q4", "https://deepai.org/chat/gpt-chat"),
  ("q4", "https://tochkagpt.ru/"),
  ("q4", "https://geekbot.ru/"),
  # q5 telegram bot yaratish
  ("q5", "https://dcamp.io/telegram_bot"),
  ("q5", "https://yoqubov.uz/bloglar/telegram-botlar/132-pythonda-telegrambot-yaratish.html"),
  ("q5", "https://soff.uz/service/telegram-bot-yaratish-7"),
  ("q5", "https://sayt-yaratish-xizmati.uz/telegram-bot-yaratish"),
  ("q5", "https://alfalab.uz/uz/xizmatlar/telegram-bot-yaratish"),
  # q6 chat bot dlya biznesa tashkent
  ("q6", "https://oe.uz/razrabotka-botov-facebook-telegram/"),
  ("q6", "https://mediasolutions.uz/telegram-bot/"),
  ("q6", "https://bothelp.io/ru/blog/luchshie-chat-boty-dlya-biznesa"),
  ("q6", "https://uzneo.uz/uslugi/telegram-bot-dlya-biznesa-tashkent"),
  ("q6", "https://alfalab.uz/services/telegram-bot"),
  # own live (for TTFB / headers parity)
  ("own", "https://gptbot.uz/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/"),
  ("own", "https://gptbot.uz/uz/suniy-intellekt/"),
  ("own", "https://gptbot.uz/ru/gpt-na-russkom/"),
  ("own", "https://gptbot.uz/uz/telegram-bot-biznes-uchun/"),
  ("own", "https://gptbot.uz/ru/razrabotka-telegram-bota-tashkent/"),
]
ctx = ssl.create_default_context()
index = []
for q, url in URLS:
    fn = hashlib.sha1(url.encode()).hexdigest()[:12] + ".html"
    rec = {"q": q, "url": url, "file": fn}
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "uz,ru;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate",
    })
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=25, context=ctx) as r:
            t1 = time.time()
            raw = r.read()
            t2 = time.time()
            enc = r.headers.get("Content-Encoding", "")
            body = raw
            if enc == "gzip":
                body = gzip.decompress(raw)
            elif enc == "deflate":
                try: body = zlib.decompress(raw)
                except Exception: body = zlib.decompress(raw, -zlib.MAX_WBITS)
            rec.update(status=r.status, final_url=r.geturl(), ttfb_s=round(t1 - t0, 3),
                       total_s=round(t2 - t0, 3), transfer_bytes=len(raw), html_bytes=len(body),
                       headers={k: v for k, v in r.headers.items() if k.lower() in (
                           "content-type", "cache-control", "server", "content-encoding",
                           "last-modified", "x-robots-tag", "cf-cache-status", "age", "link")})
            with open(os.path.join(OUT, fn), "wb") as f:
                f.write(body)
    except Exception as e:
        rec.update(error=repr(e)[:300], total_s=round(time.time() - t0, 3))
        if hasattr(e, "code"):
            rec["status"] = e.code
    index.append(rec)
    print(q, rec.get("status"), rec.get("ttfb_s"), rec.get("html_bytes"), url, rec.get("error", ""), flush=True)
    time.sleep(0.7)
with open(os.path.join(OUT, "_index.json"), "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False, indent=1)
