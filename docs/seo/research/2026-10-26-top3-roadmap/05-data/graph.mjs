// Offline link graph + head facts over dist/ (read-only). Usage: node graph.mjs <distDir> <outDir>
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2];
const OUT = process.argv[3];
const SKIP = new Set(['admin', 'assets', 'lead-radar', 'boss-digital']);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const rel = path.relative(DIST, p).split(path.sep)[0];
      if (SKIP.has(rel)) continue;
      walk(p, acc);
    } else if (e.name === 'index.html') acc.push(p);
  }
  return acc;
}

const redirects = new Map();
try {
  const r = fs.readFileSync(path.join(DIST, '_redirects'), 'utf8');
  for (const line of r.split('\n')) {
    const m = line.trim().match(/^(\S+)\s+(\S+)\s+30[18]/);
    if (m) redirects.set(m[1], m[2]);
  }
} catch {}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const strip = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function normHref(href) {
  if (!href) return null;
  href = decode(href.trim());
  if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return null;
  let u;
  try { u = new URL(href, 'https://gptbot.uz/'); } catch { return null; }
  if (u.hostname !== 'gptbot.uz' && u.hostname !== 'www.gptbot.uz') return null;
  let p = u.pathname;
  if (/\.(xml|txt|md|pdf|png|jpg|webp|svg|ico|json|js|css)$/i.test(p)) return null;
  if (p.startsWith('/api/') || p.startsWith('/admin')) return null;
  if (!p.endsWith('/')) p += '/';
  return p;
}

const files = walk(DIST);
const pages = {};
const edges = []; // {src, dst, zone, anchor}

for (const f of files) {
  const rel = '/' + path.relative(DIST, path.dirname(f)).split(path.sep).join('/');
  const url = rel === '/' ? '/' : rel + '/';
  const html = fs.readFileSync(f, 'utf8');
  const head = html.slice(0, html.indexOf('</head>') > 0 ? html.indexOf('</head>') : 20000);
  const info = { url, bytes: Buffer.byteLength(html) };
  info.lang = (html.match(/<html[^>]*lang="([^"]+)"/) || [])[1];
  info.canonical = (head.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  info.robots = (head.match(/<meta name="robots" content="([^"]+)"/) || [])[1];
  info.hreflang = [...head.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]);
  info.ogLocale = (head.match(/<meta property="og:locale" content="([^"]+)"/) || [])[1];
  info.ogLocaleAlt = [...head.matchAll(/<meta property="og:locale:alternate" content="([^"]+)"/g)].map((m) => m[1]);
  info.title = strip((head.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
  info.preloads = [...head.matchAll(/<link rel="(preload|modulepreload)" href="([^"]+)"/g)].map((m) => m[2]);
  info.stylesheets = [...head.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  info.scripts = [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  // JSON-LD
  const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  info.ldTypes = [];
  info.breadcrumb = null;
  info.dates = {};
  for (const block of ld) {
    let j; try { j = JSON.parse(block); } catch { info.ldError = true; continue; }
    const nodes = Array.isArray(j) ? j : j['@graph'] ? j['@graph'] : [j];
    for (const n of nodes) {
      const t = n['@type'];
      info.ldTypes.push(Array.isArray(t) ? t.join('+') : t);
      if (t === 'BreadcrumbList') {
        info.breadcrumb = { name: n.name ?? null, items: (n.itemListElement || []).map((li) => ({ pos: li.position, name: li.name, item: typeof li.item === 'object' ? li.item : li.item })) };
      }
      for (const k of ['datePublished', 'dateModified']) if (n[k]) info.dates[`${t}.${k}`] = n[k];
      if (t === 'FAQPage') info.faqCount = (n.mainEntity || []).length;
      if (t === 'SoftwareApplication' || t === 'WebApplication') info.app = { type: t, name: n.name, applicationCategory: n.applicationCategory, operatingSystem: n.operatingSystem, offers: n.offers ? (Array.isArray(n.offers) ? n.offers.length : 1) : 0, aggregateRating: !!n.aggregateRating };
    }
  }
  // visible <time>
  info.timeTags = [...html.matchAll(/<time[^>]*datetime="([^"]+)"/g)].map((m) => m[1]).slice(0, 4);
  // H1
  info.h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => strip(m[1]));

  // Zone-aware link extraction
  const tagRe = /<(\/?)(header|footer|nav|aside|main|section|a)\b([^>]*)>/gi;
  const stack = [];
  let m; let openA = null;
  while ((m = tagRe.exec(html))) {
    const [full, close, tagRaw, attrs] = m;
    const tag = tagRaw.toLowerCase();
    if (tag === 'a') {
      if (!close) {
        const href = (attrs.match(/href="([^"]*)"/) || [])[1];
        openA = { href, start: m.index + full.length, attrs };
      } else if (openA) {
        const anchor = strip(html.slice(openA.start, m.index));
        const dst = normHref(openA.href);
        if (dst) {
          let zone = 'other';
          for (let i = stack.length - 1; i >= 0; i--) {
            const s = stack[i];
            if (s.tag === 'header') { zone = 'header'; break; }
            if (s.tag === 'footer') { zone = 'footer'; break; }
            if (s.tag === 'nav') { zone = /Breadcrumb/.test(s.attrs) ? 'breadcrumb' : /language-switch/.test(s.attrs) ? 'lang' : 'nav'; break; }
            if (s.tag === 'aside') { zone = 'chat-entry'; break; }
            if (s.tag === 'section' && /data-testid="(related-pages|article-related|related-articles|blog-grid|blog-recently-updated)"/.test(s.attrs)) { zone = 'related'; break; }
            if (s.tag === 'section' && /data-testid="article-sources|page-sources"/.test(s.attrs)) { zone = 'sources'; break; }
            if (s.tag === 'main') { zone = 'body'; break; }
          }
          edges.push({ src: url, dst: redirects.get(dst) || dst, viaRedirect: redirects.has(dst), zone, anchor });
        }
        openA = null;
      }
      continue;
    }
    if (!close) stack.push({ tag, attrs });
    else {
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.splice(i, 1); break; }
    }
  }
  pages[url] = info;
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'pages.json'), JSON.stringify(pages, null, 1));
fs.writeFileSync(path.join(OUT, 'edges.json'), JSON.stringify(edges));
console.log('pages', Object.keys(pages).length, 'edges', edges.length);
