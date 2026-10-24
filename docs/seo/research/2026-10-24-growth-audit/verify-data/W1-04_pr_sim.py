import json, sys, csv
E = json.load(open(sys.argv[1], encoding='utf-8'))
pages = [r for r in csv.DictReader(open(sys.argv[2], encoding='utf-8'), delimiter='\t')]
nodes = [p['path'] for p in pages]
def pr_of(edges):
    outs = {n: [m for m in edges.get(n, {}).keys() if m in set(nodes)] for n in nodes}
    N = len(nodes); pr = {n: 1.0/N for n in nodes}; d = 0.85
    for _ in range(60):
        new = {n: (1-d)/N for n in nodes}
        dang = sum(pr[n] for n in nodes if not outs[n])
        for n in nodes:
            if outs[n]:
                s = d*pr[n]/len(outs[n])
                for m in outs[n]: new[m] += s
        for n in nodes: new[n] += d*dang/N
        pr = new
    rank = {n: i+1 for i, (n, _) in enumerate(sorted(pr.items(), key=lambda x: -x[1]))}
    return pr, rank
pr0, r0 = pr_of(E)
E2 = json.loads(json.dumps(E))
C = '/ru/blog/chatgpt-i-claude-v-uzbekistane/'; P = '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/'
add = [('/ru/gpt-vs-chatgpt-sravnenie/', P), ('/ru/gpt-vs-chatgpt-sravnenie/', C), ('/ru/chto-takoe-gpt-i-kak-polzovatsya/', C), ('/ru/gde-polzovatsya-gpt-besplatno/', C), ('/ru/blog/chat-gpt-na-russkom/', C)]
for s, t in add:
    print('exists before:', s, '->', t, t in E.get(s, {}))
    E2.setdefault(s, {}).setdefault(t, []).append(['content', 'sim', 'new'])
pr1, r1 = pr_of(E2)
for n in [C, P] + list({s for s, _ in add}) + ['/ru/gpt-chat/']:
    print(f"{n}\tPR {pr0[n]:.5f} -> {pr1[n]:.5f} ({(pr1[n]/pr0[n]-1)*100:+.1f}%)\trank {r0[n]} -> {r1[n]}")
print('nodes', len(nodes), 'median PR', sorted(pr0.values())[len(nodes)//2])
