import sys, os, re, json
from html.parser import HTMLParser
D = sys.argv[1]
crawl = json.load(open(sys.argv[2], encoding='utf-8'))
class T(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.skip = 0; self.buf = []; self.inmain = 0
    def handle_starttag(self, t, a):
        if t in ('script', 'style', 'nav', 'footer', 'header', 'noscript'): self.skip += 1
    def handle_endtag(self, t):
        if t in ('script', 'style', 'nav', 'footer', 'header', 'noscript'): self.skip = max(0, self.skip - 1)
    def handle_data(self, d):
        if not self.skip: self.buf.append(d)
def text(f):
    p = T(); p.feed(open(f, encoding='utf-8').read()); return re.sub(r'\s+', ' ', ' '.join(p.buf)).lower()
def sh(t, k=5):
    w = re.findall(r"[\w‘’']+", t); return set(tuple(w[i:i+k]) for i in range(len(w)-k+1)), len(w)
target = 'https://gptbot.uz/uz/blog/slayd-tayyorlash/'
tf = os.path.join(D, 'uz', 'blog', 'slayd-tayyorlash', 'index.html')
ts, tw = sh(text(tf))
print('slayd words(main, no nav/footer):', tw)
res = []
for r in crawl['results']:
    if r['url'] == target: continue
    f = os.path.join(D, r['file'])
    s, w = sh(text(f))
    inter = len(ts & s)
    res.append((round(inter / max(1, len(ts)), 3), r['url'], w))
res.sort(reverse=True)
for x in res[:8]: print(x)
# same for a comparison indexed page
