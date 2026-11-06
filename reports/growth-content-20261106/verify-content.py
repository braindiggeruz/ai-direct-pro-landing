"""Read-only verification of the three editorial additions against baseline."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
REPORT = Path(__file__).resolve().parent
BASE = '335727f0'
FILES = ['rezyume-tayyorlash', 'rasmiy-xat-yozish', 'tavsifnoma-namuna']
checks = []
for slug in FILES:
    path = 'content/blog/uz/' + slug + '.json'
    old = json.loads(subprocess.check_output(['git', '-c', 'safe.directory='+ROOT.as_posix(), '-C', str(ROOT), 'show', BASE+':'+path]))
    new = json.loads((ROOT/path).read_text(encoding='utf-8'))
    for key in old:
        if key not in ('body','dateModified','updatedAt'):
            checks.append({'name':slug+': unchanged '+key, 'pass':new.get(key)==old[key]})
    h2 = next(i for i,b in enumerate(new['body']) if b.get('id')=='word-pdf-namuna')
    restored = new['body'][:h2] + new['body'][h2+4:]
    checks.append({'name':slug+': existing body preserved', 'pass':restored==old['body']})
    links = new['body'][h2+2]['links']
    for link in links:
        checks.append({'name':slug+': '+link['target'], 'pass':(ROOT/'public'/link['target'].lstrip('/')).is_file()})
    checks.append({'name':slug+': real update dates', 'pass':new['dateModified']=='2026-11-06' and new['updatedAt'].startswith('2026-11-06')})
failed=[c['name'] for c in checks if not c['pass']]
out={'status':'PASS' if not failed else 'FAIL', 'baseline':BASE, 'checks':len(checks),'failed':failed,'details':checks}
(REPORT/'content-qa.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in out.items() if k!='details'},ensure_ascii=False))
if failed:raise SystemExit(1)
