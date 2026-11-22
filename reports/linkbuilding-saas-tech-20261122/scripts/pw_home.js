// Render homepages in Chromium and dump anchors (href + text) for submit-link discovery.
// Usage: node pw_home.js INPUT.jsonl OUTPUT.jsonl [concurrency]   INPUT lines: {"key": root, "url": homepage}
const fs = require('fs');
const { chromium } = require('playwright');
const [, , inPath, outPath, concArg] = process.argv;
const CONC = parseInt(concArg || '5', 10);
const done = new Set();
if (fs.existsSync(outPath)) {
  for (const l of fs.readFileSync(outPath, 'utf8').split('\n')) { if (l.trim()) { try { done.add(JSON.parse(l).key); } catch (e) { /* skip */ } } }
}
(async () => {
  const lines = fs.readFileSync(inPath, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)).filter(r => !done.has(r.key));
  console.log('to render', lines.length);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const out = fs.createWriteStream(outPath, { flags: 'a' });
  let idx = 0, n = 0;
  async function worker() {
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', locale: 'en-US', viewport: { width: 1366, height: 900 } });
    await ctx.route('**/*', route => { const t = route.request().resourceType(); if (['image', 'media', 'font', 'stylesheet'].includes(t)) return route.abort(); return route.continue(); });
    while (idx < lines.length) {
      const r = lines[idx++];
      const page = await ctx.newPage();
      const rec = { key: r.key, host: r.host, url: r.url };
      try {
        const resp = await page.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        rec.status = resp ? resp.status() : null;
        try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch (e) { /* ok */ }
        await page.waitForTimeout(1200);
        rec.final_url = page.url();
        rec.title = (await page.title()).slice(0, 120);
        const data = await page.evaluate(() => {
          const as = Array.from(document.querySelectorAll('a[href], button, [role=button]')).slice(0, 3000).map(a => [a.href || '', (a.innerText || a.getAttribute('aria-label') || a.title || '').replace(/\s+/g, ' ').trim().slice(0, 100)]);
          const txt = (document.body ? document.body.innerText : '');
          const md = document.querySelector('meta[name="description"],meta[property="og:description"]'); return { anchors: as, text_len: txt.length, desc: md ? (md.content || '').slice(0, 300) : '', text: txt.replace(/\s+/g, ' ').slice(0, 6000) };
        });
        rec.anchors = data.anchors.filter(([h, t]) => h || t).slice(0, 1500);
        rec.text_len = data.text_len; rec.desc = data.desc; rec.text = data.text;
        rec.cf_block = /just a moment|attention required|security checkpoint/i.test(rec.title || '');
      } catch (e) { rec.err = String(e.message || e).slice(0, 160); }
      await page.close().catch(() => {});
      out.write(JSON.stringify(rec) + '\n');
      n++;
      if (n % 25 === 0) console.log(n, '/', lines.length);
    }
    await ctx.close();
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  out.end();
  await browser.close();
  console.log('done', n);
})();
