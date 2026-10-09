import json,pathlib,xml.etree.ElementTree as ET,datetime,collections,urllib.parse
from html.parser import HTMLParser
root=pathlib.Path.cwd();out=root/'reports/google-recrawl-implementation-20261009';dist=root/'dist';site='https://gptbot.uz'
ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9','a':'http://www.w3.org/2005/Atom'}
sitemap=ET.parse(dist/'sitemap.xml').getroot(); urls={n.find('s:loc',ns).text:n.find('s:lastmod',ns).text for n in sitemap}
atom=ET.parse(dist/'updates/atom.xml').getroot(); entries=atom.findall('a:entry',ns)
assert len(entries)==200
for e in entries:
 u=e.find('a:id',ns).text;updated=e.find('a:updated',ns).text
 assert u in urls,u
 assert e.find('a:link',ns).attrib['href']==u
 assert updated[:10]==urls[u],(u,updated,urls[u])
 datetime.datetime.fromisoformat(updated.replace('Z','+00:00'))
feedids={}
for lang in ['ru','uz']:
 items=ET.parse(dist/lang/'blog/feed.xml').getroot().findall('./channel/item');assert len(items)==50
 feedids[lang]=[i.find('guid').text for i in items]
 for i in items:
  u=i.find('link').text;assert u==i.find('guid').text and u in urls
  dt=i.find('a:updated',ns)
  if dt is not None: datetime.datetime.fromisoformat(dt.text.replace('Z','+00:00'))
previously_excluded=['ai-bot-uzbekskiy-yazyk-kak-rabotaet','chat-gpt-na-russkom','chat-s-ii-gde-poobshchatsya-s-iskusstvennym-intellektom','gpt-bot-vs-chat-bot','gpt-chat-bot-na-russkom-i-uzbekskom-kak-rabotaet','neyroseti-dlya-biznesa-v-uzbekistane','skolko-stoit-razrabotka-telegram-bota-v-tashkente']
assert all(site+'/ru/blog/'+s+'/' in feedids['ru'] for s in previously_excluded)
class Doc(HTMLParser):
 def __init__(self,text):
  super().__init__();self.links=[];self.ids=set();self.h1=0;self.canonical=None;self.robots='';self.feed(text)
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='a' and a.get('href'):self.links.append(a['href'])
  if 'id' in a:self.ids.add(a['id'])
  if tag=='h1':self.h1+=1
  if tag=='link' and a.get('rel')=='canonical':self.canonical=a.get('href')
  if tag=='meta' and a.get('name')=='robots':self.robots=a.get('content','')
docs={}
for u in urls:
 p=urllib.parse.urlparse(u).path; file=dist/p.lstrip('/')/'index.html'; assert file.exists(),p
 docs[p]=Doc(file.read_text(encoding='utf8'))
graph={p:set() for p in docs}
for p,d in docs.items():
 for href in d.links:
  url=urllib.parse.urlparse(urllib.parse.urljoin(site+p,href))
  if url.netloc=='gptbot.uz' and url.path in docs:graph[p].add(url.path)
distance={'/':0};queue=collections.deque(['/'])
while queue:
 p=queue.popleft()
 for dest in graph[p]:
  if dest not in distance:distance[dest]=distance[p]+1;queue.append(dest)
priority=['/ru/luchshie-razrabotchiki-chat-botov-tashkent/','/ru/razrabotka-telegram-bota-tashkent/','/ru/stoimost-chat-bota/','/uz/telegram-bot-biznes-uchun/','/uz/arizalarni-qabul-qiluvchi-bot/','/uz/chat-bot-narxi/']
rows=[]
for target in priority:
 incoming=[p for p,edges in graph.items() if target in edges and p!=target]
 blogs=[p for p in incoming if '/blog/' in p and p not in ['/ru/blog/','/uz/blog/']]
 assert blogs and distance.get(target,999)<=2,target
 rows.append({'url':target,'incomingPages':len(incoming),'blogDonors':len(blogs),'distanceFromHome':distance[target]})
for change in json.loads((out/'content-changes.json').read_text(encoding='utf8')):
 p=change['url'];d=docs[p];assert d.h1==1 and d.canonical==site+p and 'noindex' not in d.robots
 for href in d.links:
  u=urllib.parse.urlparse(urllib.parse.urljoin(site+p,href))
  if u.netloc=='gptbot.uz' and u.fragment and u.path in docs:assert urllib.parse.unquote(u.fragment) in docs[u.path].ids,(p,href)
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sitemapUrls':len(urls),'atomEntries':len(entries),'rssCounts':{k:len(v) for k,v in feedids.items()},'previouslyExcludedRuArticlesRestored':7,'allAtomEntriesCanonicalSitemapMembers':True,'allAtomDatesMatchSitemap':True,'commercialLinkGraph':rows,'changedArticlesMetadataAndFragments':'PASS'}
(out/'artifact-acceptance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(result,ensure_ascii=True))