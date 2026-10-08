import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seoContract, PROTECTED_PATHS } from '../../../../scripts/seo-protection';

const root = process.cwd();
const out = path.join(root, 'docs/seo/implementation/2026-10-08-recovery');
const previousRevision = 'docs/seo/evidence/2026-10-08-chat-trial/reviewed-protected-pages.json';
const previousRaw = fs.readFileSync(path.join(root, previousRevision), 'utf8').replace(/\r\n/g, '\n');
const previous = JSON.parse(previousRaw);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const pages = PROTECTED_PATHS.map(pathname => {
  const file = path.join(root, 'dist', pathname.slice(1), 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const bodyText = (clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return { pathname, contract: seoContract(html), bodyText, htmlSha256: sha(html) };
});
const comparison = pages.map(page => {
  const before = previous.pages.find((p: { pathname: string }) => p.pathname === page.pathname);
  const fields = Object.keys(page.contract).filter(k => JSON.stringify(page.contract[k as keyof typeof page.contract]) !== JSON.stringify(before.contract[k]));
  return { pathname: page.pathname, fields, beforeDescription: before.contract.description, afterDescription: page.contract.description,
    beforeBody: before.bodyText, afterBody: page.bodyText };
});
fs.writeFileSync(path.join(out, 'candidate-protected-comparison.json'), JSON.stringify({ previousRevision, previousRevisionSha256: sha(previousRaw), pages, comparison }, null, 2) + '\n');
console.log(JSON.stringify(comparison.map(({ pathname, fields, beforeDescription, afterDescription }) => ({ pathname, fields, ...(fields.includes('description') ? { beforeDescription, afterDescription } : {}) })), null, 2));
