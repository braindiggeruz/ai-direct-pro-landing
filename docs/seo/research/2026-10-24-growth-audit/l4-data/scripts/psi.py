import sys, json, time, urllib.request, urllib.parse, os
out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)
urls = ['https://gptbot.uz/', 'https://gptbot.uz/uz/gpt-uzbek-tilida/', 'https://gptbot.uz/ru/gpt-chat/',
        'https://gptbot.uz/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/',
        'https://gptbot.uz/ru/razrabotka-telegram-bota-tashkent/', 'https://gptbot.uz/uz/blog/chatgptga-qanday-kirish-mumkin/']
names = ['home', 'uz-chat', 'ru-chat', 'uz-download-guide', 'ru-b2b-telegram-dev', 'uz-blog-kirish']
for u, n in zip(urls, names):
    q = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?' + urllib.parse.urlencode({'url': u, 'strategy': 'mobile'})
    t0 = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(q, headers={'User-Agent': 'Mozilla/5.0'}), timeout=180)
        data = json.loads(r.read().decode('utf-8'))
        json.dump(data, open(os.path.join(out_dir, 'psi-%s.json' % n), 'w', encoding='utf-8'), ensure_ascii=False)
        lh = data.get('lighthouseResult', {})
        print(n, 'ok', round(time.time() - t0, 1), 's perf=', lh.get('categories', {}).get('performance', {}).get('score'))
    except urllib.error.HTTPError as e:
        print(n, 'HTTP', e.code, e.read()[:300])
    except Exception as e:
        print(n, 'ERR', str(e)[:200])
    time.sleep(2)

