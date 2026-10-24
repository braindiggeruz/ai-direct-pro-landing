import re, sys, os
D = sys.argv[1]
for p in ['uz/gpt-uzbek-tilida', 'uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish', 'index_root', 'ru/razrabotka-telegram-bota-tashkent']:
    f = os.path.join(D, 'index.html') if p == 'index_root' else os.path.join(D, p, 'index.html')
    h = open(f, encoding='utf-8').read()
    print('==', p, len(h.encode('utf-8')))
    for m in re.finditer(r'<script(?![^>]*type="application/ld\+json")([^>]*)>([\s\S]*?)</script>', h):
        attrs, body = m.group(1), m.group(2)
        if body.strip():
            print('  inline script', attrs.strip()[:80], len(body.encode('utf-8')))
    for m in re.finditer(r'<img[^>]*>', h):
        print('  img', m.group(0)[:260])
    # json-ld size
    for m in re.finditer(r'<script type="application/ld\+json">([\s\S]*?)</script>', h):
        print('  ld bytes', len(m.group(1).encode('utf-8')))
