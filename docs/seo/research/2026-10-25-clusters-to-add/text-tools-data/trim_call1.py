# Trim candidates.json "new" list to <=700 keywords for one get_keyword_metrics call.
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, 'candidates.json'), encoding='utf-8'))
drop = set("""ota haqida sherlar|
ustozlarga she'rlar|
tugilgan kunga sherlar|
yoz haqida she'r|
til haqida she'r|
hazil she'rlar|
uvaysiy she'rlari|
mashrab she'rlari|
ogahiy g'azallari|
tuyuq|
radif|
she'r tahlili|
uzbekcha sherlar|
she'r yaratish ai|
ai she'r yozish|
ertak yozib ber|
ertak nima|
hikoya nima|
сочинить сказку|
генератор сказок|
maqollar 3 sinf|
hunar haqida maqollar|
maqol nima|
qiyin topishmoqlar|
egizaklar uchun ismlar|
ismlar ro'yxati|
bola ismi|
ism qo'yish|
onamni tug'ilgan kuni bilan tabriklash|
singlimga tabrik|
ogilga tabrik|
o'qituvchilar kuni tabrik|
armiya kuni tabrik|
vatan himoyachilari kuni tabrik|
tabrik xati|
tabrik so'zlar|
chaqaloq tabrik|
70 yosh tabrik|
oxirgi qo'ng'iroq tabrik|
1 sentabr tabrik|
imlo dasturi|
vergul qo'yish|
орфо|
orfografiya tekshirish|
matnni tahrirlash|
matndan xulosa|
перефразировать предложение|
рерайт онлайн|
summarize|
harf sanash|
so'z sanagich|
сколько символов|
katta harflarga o'tkazish|
зеркальный текст|
kirilcha lotincha|
lotinchaga|
alifbo harflari|
o'zbek alifbosi harflari|
tunlaringiz osuda|
tilaklar|
hazillar|
kulgili hazillar|
лятифалар|
insho yozib ber|
esse generator|
biografiya yozish|
sevgi maktubi""".replace('\n', '').split('|'))
new = [k for k in d['new'] if k not in drop]
print(len(d['new']), '->', len(new))
print('not found:', [x for x in drop if x not in d['new']])
json.dump(new, open(os.path.join(HERE, 'call1_keywords.json'), 'w', encoding='utf-8'), ensure_ascii=False)
