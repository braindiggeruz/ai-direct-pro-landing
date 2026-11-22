// Render submit pages in Chromium and report form facts (no interaction, no submission).
// Usage: node pw_check.js INPUT.jsonl OUTPUT.jsonl [concurrency]
// INPUT lines: {"key": "<root>", "url": "<page>"}
const fs = require('fs');
const readline = require('readline');
const { chromium } = require('playwright');

const [, , inPath, outPath, concArg] = process.argv;
const CONC = parseInt(concArg || '5', 10);
const done = new Set();
if (fs.existsSync(outPath)) {
  for (const l of fs.readFileSync(outPath, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { done.add(JSON.parse(l).key + '|' + JSON.parse(l).url); } catch (e) { /* skip */ }
  }
}

async function analyze(page) {
  return await page.evaluate(() => {
    const txt = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ');
    const inputs = Array.from(document.querySelectorAll('input,textarea,select'))
      .filter(e => !['hidden', 'submit', 'button', 'checkbox', 'radio', 'image', 'reset'].includes((e.type || '').toLowerCase()))
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const desc = inputs.map(e => [(e.type || e.tagName).toLowerCase(), [e.name, e.id, e.placeholder, e.getAttribute('aria-label')].filter(Boolean).join(' ').toLowerCase().slice(0, 60)]);
    const hasUrl = desc.some(([t, n]) => t === 'url' || /(url|website|web site|\blink|site|домен|сайт|ссылк)/.test(n));
    const hasPass = desc.some(([t]) => t === 'password');
    const html = document.documentElement.outerHTML;
    const captcha = /(g-recaptcha|recaptcha\/api|grecaptcha|hcaptcha|h-captcha|cf-turnstile|challenges\.cloudflare\.com\/turnstile)/i.test(html);
    const ext = Array.from(new Set((html.match(/(tally\.so|typeform\.com|forms\.gle|docs\.google\.com\/forms|airtable\.com\/(?:shr|app|embed)|jotform\.com|fillout\.com|paperform\.co|formstack|cognitoforms|wufoo\.com|hsforms|formspree|youform|noteforms)/gi) || []).map(s => s.toLowerCase()))).slice(0, 4);
    const login = (txt.match(/(log\s?in to (?:submit|continue|add|post|create|list)|sign\s?in to (?:submit|continue|add|post|create|list)|you (?:must|need to) (?:be logged|log in|sign in|register|create an account)|please (?:log|sign) in|create an account to|login required|sign up to (?:submit|add|post|list)|continue with google|войдите|авторизуйтесь)/gi) || []).slice(0, 3);
    const price = (txt.match(/(\$\s?\d{1,4}(?:[.,]\d{1,2})?(?!\d)|€\s?\d{1,4}|\d{1,4}\s?€|£\s?\d{1,4}|\d{2,6}\s?(?:₽|руб))/gi) || []).slice(0, 8);
    const pay = Array.from(new Set((txt.match(/(payment|checkout|stripe|paypal|lemon\s?squeezy|gumroad|one[- ]time (?:fee|payment)|pay now|buy now|paid listing|paid submission|submission fee|listing fee|оплат)/gi) || []).map(s => s.toLowerCase()))).slice(0, 6);
    const freeSub = (txt.match(/(free (?:submission|listing|plan|option|tier|forever)|submit (?:for|it for) free|list(?:ed)? (?:for )?free|free to (?:submit|list|join|post)|\$0\b|бесплатн\w* (?:размещ|добавл|публикац))/gi) || []).slice(0, 4);
    const moder = (txt.match(/(review(?:ed)? (?:by our team|manually|within|before)|manual(?:ly)? review|approval|approved|moderat\w+|within \d+ (?:hours|days|business days)|модерац)/gi) || []).slice(0, 3);
    const backlink = (txt.match(/(dofollow|do-follow|nofollow|backlink|link back|reciprocal|badge)/gi) || []).slice(0, 5);
    const soft404 = /(404|page not found|not found|страница не найдена)/i.test(document.title) || (txt.length < 1500 && /\b404\b|page not found/i.test(txt));
    return { title: document.title.slice(0, 120), text_len: txt.length, n_inputs: inputs.length, fields: desc.map(d => d[1] || d[0]).slice(0, 12),
      has_url: hasUrl, has_pass: hasPass, captcha, ext_form: ext, loginwall: login, price_hits: price, pay_hits: pay,
      free_submit: freeSub, moderation: moder, backlink, soft404, snippet: txt.slice(0, 300) };
  });
}

(async () => {
  const lines = fs.readFileSync(inPath, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    .filter(r => !done.has(r.key + '|' + r.url));
  console.log('to check', lines.length);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const out = fs.createWriteStream(outPath, { flags: 'a' });
  let idx = 0, n = 0;
  async function worker() {
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', locale: 'en-US', viewport: { width: 1366, height: 900 } });
    await ctx.route('**/*', route => { const t = route.request().resourceType(); if (['image', 'media', 'font', 'stylesheet'].includes(t)) return route.abort(); return route.continue(); });
    while (idx < lines.length) {
      const r = lines[idx++];
      const page = await ctx.newPage();
      const rec = { key: r.key, url: r.url, checked_at: new Date().toISOString() };
      try {
        const resp = await page.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        rec.status = resp ? resp.status() : null;
        try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch (e) { /* ok */ }
        await page.waitForTimeout(1500);
        rec.final_url = page.url();
        Object.assign(rec, await analyze(page));
        rec.cf_block = /just a moment|attention required|security checkpoint/i.test(rec.title || '');
      } catch (e) {
        rec.err = String(e.message || e).slice(0, 160);
      }
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
