# Builds the >=500/mo demand map for L3 from kw1_metrics.json + kw2_metrics.json
# (OpenSEO get_keyword_metrics, location 2860, 2026-10-24). Run: py -3 -I l3_map.py > l3_map_table.md
import json, os
from collections import Counter

D = os.path.dirname(os.path.abspath(__file__))
rows = {}
for f in ('kw1_metrics.json', 'kw2_metrics.json'):
    for k in json.load(open(os.path.join(D, f), encoding='utf-8'))['keywords']:
        m = {(x['year'], x['month']): x['search_volume'] for x in (k.get('monthly_searches') or [])}
        rows[k['keyword']] = dict(v=k['search_volume'] or 0, cpc=k['cpc'], comp=k['competition'],
                                  oct25=m.get((2025, 10)), sep26=m.get((2026, 9)), src=f[:3])

OWN, FAIL, GAP, REJ = 'OWNED', 'OWNER-FAILS', 'GAP', 'REJECT'
M = {}


def put(keys, status, url, note):
    for k in keys:
        M[k] = (status, url, note)


# AI general
put(['suniy intellekt', "sun'iy intellekt", 'sun iy intellekt', 'suniy intellekt nima', "sun'iy intellekt nima"],
    FAIL, '/uz/suniy-intellekt/', 'L3-02')
put(['сунъий интеллект', 'сунъий интеллект нима'], FAIL, '/uz/suniy-intellekt/ (кириллицы на странице нет)', 'L3-02')
put(['искусственный интеллект'], REJ, '—', 'SERP: Wikipedia, AWS, SAP, Azure, UN, Habr (serp3)')
put(['ии'], REJ, '—', 'голый термин без намерения')
put(['ии онлайн', 'ии чат'], OWN, '/ru/gpt-chat/ (защищена, идёт замер)', '')
put(['ai chat'], OWN, '/uz/blog/ai-chat-nima-va-qanday-turlari-bor/ (A6, защищена)', '')
put(['нейросеть', 'нейросети'], OWN, '/ru/gpt-chat/ («нейросеть онлайн»), голый термин не объявлен', 'одна корзина')
put(['prompt'], OWN, '/uz/blog/chatgpt-uzbek-tilida-promptlar/ (защищена), ключ не объявлен', 'SERP не снят')
put(['prompt nima'], GAP, '→ /uz/gpt-uzbek-tilida-ai-chat/ (владелец «prompt formulasi», C28)', 'L3-07')
put(['chatgpt kirish', 'chatgpt uzbekcha', 'chatgpt 4 uzbek tilida', 'chatgpt bepul'], OWN, '/uz/gpt-uzbek-tilida/ (защищена)', '')
put(['chatgpt yuklab olish'], OWN, '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/ (защищена)', '')
put(['chatgpt plus'], OWN, '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/ (защищена)', '')
put(['ии для презентаций'], OWN, '/ru/prezentatsiya-ai/ (A5)', '')
# brands
put(['gemini', 'gemini ai', 'claude ai', 'claude', 'гемини', 'grok', 'chatgpt 4', 'google gemini', 'grok ai', 'copilot',
     'perplexity', 'chat gpt 5', 'грок', 'чат гпт 5', 'дипсик', 'meta ai', 'qwen', 'gpt 5', 'deep seek', 'клод',
     'gemini скачать', 'гемини ии', 'gemini chat', 'чат гпт 4', 'gemini app', 'perplexity ai', 'deepseek chat',
     'gemini pro', 'deepseek ai', 'гугл гемини', 'грок ии', 'дипсик чат', 'gigachat', 'шедеврум'],
    REJ, '—', 'навигационный бренд')
put(['deepseek'], REJ, '—', 'навигационный: в топ-20 нет ни одной узбекской страницы (serp2)')
put(['chatgpt 5'], REJ, '—', 'SERP: openai.com, YouTube, англоязычные обзоры (serp3); GPT-5 в продукте не используется')
# translation
put(['english to uzbek', 'uzbek to english', 'english uzbek', 'uzbek english translator', 'english uzbek translator',
     'английский узбекский переводчик', 'ingliz uzbek tarjimon', 'inglizcha tarjima',
     'переводчик с английского на узбекский', 'ingliz tarjima', 'переводчик с узбекского на английский',
     'inglizcha tarjimon'], GAP, '— (ветка переводчика покрывает только RU↔UZ)', 'L3-01')
put(['переводчик с английского на русский'], REJ, '—', 'пара без узбекского')
put(["turkcha o'zbekcha tarjimon", "koreyscha o'zbekcha tarjima", 'arabcha tarjima'], GAP, '—', 'L3-10 (после L3-01)')
# school, owned
put(['esse', 'esse yozish', 'insho', 'insho yozish', 'esse namunalari'], OWN, '/uz/blog/insho-yozish-suniy-intellekt-bilan/', '')
put(['referat', 'referat namuna', 'mustaqil ish', 'mustaqil ish namuna'], OWN, '/uz/blog/referat-va-mustaqil-ish/', '')
put(['реферат'], OWN, '/uz/blog/referat-va-mustaqil-ish/ (кириллица не объявлена)', '')
put(['kurs ishi'], OWN, '/uz/blog/kurs-ishi-yozish/', '')
put(['rezyume'], OWN, '/uz/blog/rezyume-tayyorlash/', '')
put(['ariza yozish', 'ariza namunasi', 'tushuntirish xati'], OWN, '/uz/blog/tushuntirish-xati-va-ariza-yozish/', '')
put(['biznes reja'], OWN, '/uz/blog/biznes-reja-tuzish/', '')
put(['prezentatsiya', 'taqdimot'], OWN, '/uz/blog/slayd-tayyorlash/ + /uz/taqdimot-ai/', '')
put(['slayd yaratish', 'slayd ai', 'prezentatsiya ai'], OWN, '/uz/taqdimot-ai/ (C40)', '')
# school, gaps
put(['obyektivka namuna', 'obyektivka namunasi', 'obyektivka', "ma'lumotnoma namuna"], GAP,
    '— (раздел в /uz/blog/rezyume-tayyorlash/, ключ не объявлен)', 'L3-04')
put(['tavsifnoma namuna', 'tavsifnoma'], GAP, '—', 'L3-03')
put(['dalolatnoma namuna'], REJ, '—', 'HOLD: SERP смешан с актами гражданского состояния lex.uz (serp2)')
put(['bildirishnoma namuna', 'diplom ishi namuna'], REJ, '—', 'HOLD: SERP не снят, ниже приоритета')
put(['ishonchnoma namuna'], REJ, '—', 'доверенность, юридический документ')
put(['misollar yechish', 'misol yechish', 'masala yechish', 'matematika misollar yechish', 'uyga vazifa', 'uy ishi'], GAP,
    '— (черновик /uz/rasmdan-yechim/, STUDIO_PHOTO=false)', 'L3-05')
put(['matematika misollar', 'misollar', 'karra jadvali', "ko'paytirish jadvali", 'masalalar'], GAP, '—', 'L3-06 (генератор, не ИИ)')
put(['tugilgan kun tabriklari', 'tabriklar', 'yangi yil tabriklari', 'табриклар'], GAP, '—', 'L3-08')
put(['поздравление с днем рождения'], REJ, '—', 'RU-архивы поздравлений, SERP не снят')
put(['xat yozish'], GAP, '— (сосед: /uz/blog/tushuntirish-xati-va-ariza-yozish/)', 'L3-09')
put(['maktub yozish'], REJ, '—', 'SERP: обращения в госорганы, шаблон приглашения, азербайджанские страницы (serp1)')
put(['xulosa yozish', 'xulosa'], REJ, '—', 'SERP: логика «xulosa chiqarish», философия (serp1)')
put(['matn yaratish'], REJ, '—', 'HOLD: SERP педагогический + один AI-генератор (#9); риск каннибализации UZ-чата')
put(['matn'], REJ, '—', 'голый термин')
put(['maqola'], REJ, '—', 'голый термин; «maqola yozish» 480/мес, ниже порога')
put(['imlo', "imlo lug'ati", 'imlo tekshirish'], REJ, '—', 'словари imlo.uz / izoh.uz / savodxon.uz, приложение Muharrir (serp2)')
put(['test savollari'], REJ, '—', 'банки тестов: qnb.uz, ziyonet, infotest, dtm-test (serp1)')
put(['informatika test', 'fizika test', 'matematika test', 'biologiya test', 'dtm test', 'milliy sertifikat',
     'ingliz tili test', 'geografiya test', 'tarix test', 'ona tili test', 'testlar', 'online test',
     'matematika test savollari', 'kimyo test'], REJ, '—', 'банки тестов / экзамены')
put(['kimyo masalalar'], REJ, '—', 'аномальный всплеск: окт-25 20 → сен-26 165 000')
put(["she'rlar", 'topishmoqlar', 'maqollar', 'sher', 'ertaklar', 'hikoya', "tush ta'biri", "sevgi she'rlari",
     "hikmatli so'zlar", 'latifalar', 'diktant', 'dissertatsiya', 'гдз'], REJ, '—', 'архив контента, нет связи с продуктом')
put(['python', 'matematika', 'ingliz tili', 'dasturlash', 'algebra', 'ingliz tili grammatika', "inglizcha so'zlar"],
    REJ, '—', 'обучение / общий термин')
put(['rasm chizish', 'rasmni tiniqlashtirish', 'logo yaratish'], REJ, '—', 'нет возможности в продукте')
put(['amocrm', 'bitrix24', 'амосрм', 'битрикс24'], REJ, '—', 'вендор CRM, навигационный')
put(['crm', 'crm система'], REJ, '—', 'HOLD: общий/инфо-термин, SERP не снят')
put(['chat bot', 'чат бот', 'telegram bot'], REJ, '—', 'голый термин; коммерческие фразы вернули null')
put(['перефразировать текст', 'сочинение', 'bayon yozish'], REJ, '—', 'вне ядра / SERP не снят')

out = []
for kw, r in sorted(rows.items(), key=lambda x: (-x[1]['v'], x[0])):
    if r['v'] < 500:
        continue
    st, url, note = M.get(kw, ('UNMAPPED', '?', ''))
    out.append((kw, r, st, url, note))

print('| Ключ | Объём/мес | окт-25 → сен-26 | CPC $ / comp | Статус | URL-владелец | Примечание |')
print('|---|---:|---|---|---|---|---|')
for kw, r, st, url, note in out:
    print(f"| {kw} | {r['v']} | {r['oct25']} → {r['sep26']} | {r['cpc']} / {r['comp']} | {st} | {url} | {note} |")
c = Counter(st for _, _, st, _, _ in out)
print()
print('COUNTS', dict(c), 'TOTAL', len(out))
print('UNMAPPED', [kw for kw, _, st, _, _ in out if st == 'UNMAPPED'])
