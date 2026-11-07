from pathlib import Path
import os,subprocess,json,re,sys,time
root=Path(__file__).resolve().parents[2]
report=Path(__file__).resolve().parent
suites=[
'seo-analytics-privacy','yandex-metrika','lead-capture-templates','cta-analytics','ga4-attribution-boundary',
'publisher-schema','studio-contact','legal-oferta','seo-content-corrections-20261107',
'seo-intent-manifest','seo-anchor-intent','seo-cluster-quality','seo-link-graph','seo-page-integrity',
'seo-content-guards','tool-first','tool-pages','uz-translit','content-downloads','seo-protection',
'homepage-lists-frozen','studio-prerender']
if len(sys.argv)>1:suites=sys.argv[1:]
env=os.environ.copy()
env['NODE_OPTIONS']='--max-old-space-size=1024'
env['SEO_PUBLISHER_BASELINE_DIST']=str(root.parent/'gptbot-seo-evidence-20261107'/'before-dist')
env['TOOL_FIRST_BUILT']='1'
results=[]
for suite in suites:
    start=time.time()
    p=subprocess.run(['node','--import','tsx','--test',f'tests/{suite}.test.ts'],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
    (report/f'test-{suite}.log').write_text(p.stdout,encoding='utf-8')
    row={'suite':suite,'exit':p.returncode,'seconds':round(time.time()-start,1)}
    for metric in ['tests','pass','fail','skipped']:
        matches=re.findall(r'^[#ℹ] '+metric+r' (\d+)$',p.stdout,re.M)
        row[metric]=int(matches[-1]) if matches else None
    results.append(row)
    print(json.dumps(row),flush=True)
    (report/'targeted-tests.json').write_text(json.dumps({'results':results,'complete':len(results)==len(suites)},indent=2),encoding='utf-8')
    if p.returncode:
        print(p.stdout[-6000:],flush=True)
        raise SystemExit(p.returncode)
print('ALL TARGETED SUITES PASS',flush=True)
