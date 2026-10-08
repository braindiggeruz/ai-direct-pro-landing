import fs from 'node:fs';
import path from 'node:path';
import { BASELINE, seoContract } from '../../../../scripts/seo-protection';

const root = process.cwd();
const out = path.join(root, 'docs/seo/implementation/2026-10-08-recovery');
const baseline = JSON.parse(fs.readFileSync(path.join(root, BASELINE), 'utf8'));
// Cloudflare rewrites the unchanged download guide's public email anchors.
// Keep raw differences, then decode only the provider's explicit XOR format.
const decodeEmail = (hex: string) => {
  const bytes = Buffer.from(hex, 'hex');
  return Buffer.from(bytes.subarray(1).map(value => value ^ bytes[0])).toString('utf8');
};
const rows = [];
for (const page of baseline.pages) {
  const response = await fetch(`https://gptbot.uz${page.pathname}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const html = await response.text();
  const raw = seoContract(html);
  const rawDiff = Object.keys(raw).filter(key => JSON.stringify(raw[key as keyof typeof raw]) !== JSON.stringify(page.contract[key]));
  const decoded = html.replace(/href="\/cdn-cgi\/l\/email-protection#([a-f0-9]+)"/gi, (_match, hex: string) => `href="mailto:${decodeEmail(hex)}"`)
    .replace(/<span\b[^>]*data-cfemail="([a-f0-9]+)"[^>]*>[\s\S]*?<\/span>/gi, (_match, hex: string) => decodeEmail(hex));
  const actual = seoContract(decoded);
  const diff = Object.keys(actual).filter(key => JSON.stringify(actual[key as keyof typeof actual]) !== JSON.stringify(page.contract[key]));
  rows.push({path: page.pathname, status: response.status, rawDiff, cloudflareEmailDecodingApplied: decoded !== html, diff, pass: response.status === 200 && diff.length === 0, actual});
}
const result = { checkedAt: new Date().toISOString(), baseline: BASELINE, passed: rows.filter(row => row.pass).length, total: rows.length, rows };
fs.writeFileSync(path.join(out, 'PROTECTED_LIVE_READBACK.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({passed:result.passed,total:result.total,failures:rows.filter(row => !row.pass)}));
if (result.passed !== result.total) process.exitCode = 1;
