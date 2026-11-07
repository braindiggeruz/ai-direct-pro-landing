from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parent
ROOT=R.parents[1]
D=ROOT/'dist'
before=json.loads((R/'first-release-inventory.json').read_text(encoding='utf-8'))
after={p.relative_to(D).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in D.rglob('*') if p.is_file()}
changed=sorted(k for k in before.keys()&after.keys() if before[k]!=after[k])
added=sorted(after.keys()-before.keys());removed=sorted(before.keys()-after.keys())
assert not added and not removed,(added,removed)
assert changed==['_headers','gptbot-release.json'],changed
def policy(raw):
 line=next(x for x in raw.splitlines() if x.strip().startswith('Content-Security-Policy:'))
 return {s.strip().split()[0]:set(s.strip().split()[1:]) for s in line.split(': ',1)[1].split(';') if s.strip()}
b=policy((ROOT.parent/'gptbot-seo-evidence-20261107/before-dist/_headers').read_text(encoding='utf-8'))
a=policy((D/'_headers').read_text(encoding='utf-8'))
assert a.keys()==b.keys()
changes={k:{'added':sorted(a[k]-b[k]),'removed':sorted(b[k]-a[k])} for k in a if a[k]!=b[k]}
assert changes=={k:{'added':['https://mc.yandex.com'],'removed':[]} for k in ['script-src','connect-src']},changes
result={'pass':True,'files':len(after),'onlyChanged':changed,'policyChanges':changes,'allHtmlAndAssetsIdenticalToFirstRelease':True}
(R/'csp-artifact-delta.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
