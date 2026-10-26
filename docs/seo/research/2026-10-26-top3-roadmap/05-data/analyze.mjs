import fs from 'node:fs';
import path from 'node:path';
const OUT = process.argv[2];
const REPO = process.argv[3];
const pages = JSON.parse(fs.readFileSync(path.join(OUT, 'pages.json'), 'utf8'));
const edges = JSON.parse(fs.readFileSync(path.join(OUT, 'edges.json'), 'utf8'));

function loadTsv(p, strip) {
  const m = new Map();
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || line.startsWith('url') || line.startsWith('page')) continue;
    const c = line.split('\t');
    let u = c[0].replace('https://gptbot.uz', '');
    if (!u) u = '/';
    m.set(u, { clicks: +c[1], imp: +c[2], pos: +c[3] });
  }
  return m;
}
const gscAll = loadTsv(path.join(REPO, 'docs/seo/research/2026-10-24-growth-audit/l5-data/gsc_page_28d_all.tsv'));
const gscUz = loadTsv(path.join(REPO, 'docs/seo/research/2026-10-24-growth-audit/raw/gsc_page_28d_uzb.tsv'));

const targets = [
  '/uz/gpt-uzbek-tilida/', '/ru/gpt-chat/', '/uz/blog/chatgpt-telefon-va-kompyuterga-yuklab-olish/', '/uz/blog/chatgptga-qanday-kirish-mumkin/',
  '/ru/blog/chat-gpt-online/', '/uz/blog/chatgpt-uzbek-tilida-promptlar/', '/ru/seo-prodvizhenie-saytov-tashkent/', '/uz/blog/target-reklama-nima/',
  '/uz/blog/insho-yozish-suniy-intellekt-bilan/', '/ru/blog/kak-oplatit-chatgpt-v-uzbekistane/', '/ru/blog/gpt-chat-bot-na-russkom-i-uzbekskom-kak-rabotaet/',
  '/uz/gpt-bot-biznes-uchun/', '/ru/gde-polzovatsya-gpt-besplatno/', '/ru/blog/telegram-ads-stoimost-i-zapusk-uzbekistan/', '/uz/blog/instagram-direct-ai-bot-qanday-ishlaydi/',
  '/ru/telegram-ads-uzbekistan/', '/ru/blog/telegram-bot-s-oplatoy-payme-click/', '/ru/razrabotka-saytov-tashkent/', '/ru/gpt-vs-chatgpt-sravnenie/', '/ru/blog/chto-takoe-smm-prodvizhenie/',
  // extra
  '/uz/gpt-uzbek-tilida-ai-chat/', '/ru/gpt-na-russkom/', '/ru/blog/chatgpt-i-claude-v-uzbekistane/', '/uz/blog/chatgpt-ozbekistonda-vpnsiz-ishlaydimi/', '/uz/suniy-intellekt/', '/uz/sayt-yaratish/', '/ru/blog/kak-skachat-chatgpt-na-telefon-i-kompyuter/',
];
const listPages = new Set(['/', '/uz/', '/ru/blog/', '/uz/blog/']);
const res = {};
for (const t of targets) {
  const p = pages[t];
  const inc = edges.filter((e) => e.dst === t && e.src !== t);
  const byZone = {};
  for (const e of inc) byZone[e.zone] = (byZone[e.zone] || 0) + 1;
  const srcAll = new Set(inc.map((e) => e.src));
  const body = inc.filter((e) => e.zone === 'body' && !listPages.has(e.src));
  const srcBody = new Set(body.map((e) => e.src));
  const anchors = {};
  for (const e of body) anchors[e.anchor] = (anchors[e.anchor] || 0) + 1;
  const bodySrcRank = [...srcBody].map((s) => ({ s, imp: gscAll.get(s)?.imp || 0, impUz: gscUz.get(s)?.imp || 0 })).sort((a, b) => b.imp - a.imp);
  const outBody = edges.filter((e) => e.src === t && e.zone === 'body');
  res[t] = {
    exists: !!p,
    gscAll: gscAll.get(t), gscUz: gscUz.get(t),
    inLinks: inc.length, inSources: srcAll.size, byZone,
    bodySources: srcBody.size,
    topBodySources: bodySrcRank.slice(0, 8),
    anchors: Object.entries(anchors).sort((a, b) => b[1] - a[1]).slice(0, 12),
    outBodyDistinct: new Set(outBody.map((e) => e.dst)).size,
    head: p ? { lang: p.lang, canonical: p.canonical, hreflang: p.hreflang, ogLocale: p.ogLocale, ogLocaleAlt: p.ogLocaleAlt, bc: p.breadcrumb, ldTypes: p.ldTypes, dates: p.dates, time: p.timeTags, bytes: p.bytes, faq: p.faqCount, app: p.app, h1: p.h1 } : null,
  };
}
fs.writeFileSync(path.join(OUT, 'targets.json'), JSON.stringify(res, null, 1));

// site-wide: breadcrumb name stats, hreflang reciprocity
let bcNamed = 0, bcUnnamed = 0, bcNone = 0; const unnamed = [];
let hrefPairs = 0, nonRecip = [];
for (const [u, p] of Object.entries(pages)) {
  if (!p.breadcrumb) bcNone++; else if (p.breadcrumb.name) bcNamed++; else { bcUnnamed++; unnamed.push(u); }
  const alts = p.hreflang.filter(([l]) => l !== 'x-default');
  if (alts.length > 1) {
    hrefPairs++;
    for (const [l, h] of alts) {
      const tu = h.replace('https://gptbot.uz', '');
      if (tu === u) continue;
      const q = pages[tu];
      if (!q || !q.hreflang.some(([, hh]) => hh === 'https://gptbot.uz' + u)) nonRecip.push([u, tu]);
    }
  }
}
// donors: high-imp pages by GSC, with protected flag and how many body links they already give to the chats/guides
const donors = [...gscAll.entries()].filter(([u]) => pages[u]).sort((a, b) => b[1].imp - a[1].imp).slice(0, 40).map(([u, g]) => {
  const out = edges.filter((e) => e.src === u && e.zone === 'body');
  const toT = {};
  for (const t of targets.slice(0, 6)) toT[t] = out.filter((e) => e.dst === t).map((e) => e.anchor);
  return { u, imp: g.imp, clicks: g.clicks, impUz: gscUz.get(u)?.imp || 0, lang: pages[u].lang, outBody: new Set(out.map((e) => e.dst)).size, toTargets: Object.fromEntries(Object.entries(toT).filter(([, v]) => v.length)) };
});
fs.writeFileSync(path.join(OUT, 'donors.json'), JSON.stringify(donors, null, 1));
console.log(JSON.stringify({ bcNamed, bcUnnamed, bcNone, unnamed, hrefPairs, nonRecip: nonRecip.slice(0, 20), nonRecipCount: nonRecip.length }, null, 1));
