/** Offline evaluation of the identical public-page corpus through Lead Radar's
 * actual extractor. Known anchors are not a complete ground-truth contact list. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { publishedPagePhones } from '../../functions/platform/lead-radar/business-contact-data';
import { publishedTelegramLocators } from '../../functions/platform/lead-radar/telegram-locators';

const root = path.resolve('tools/lead-radar-crawler');
const manifest = JSON.parse(await readFile(path.join(root, 'benchmarks/sites.json'), 'utf8'));
const reports = [];
for (const engine of ['scrapling', 'crawl4ai']) {
  const report = JSON.parse(await readFile(path.join(root, 'results', engine, 'report.json'), 'utf8'));
  const evaluated = [];
  for (const row of report.results) {
    const site = manifest.sites.find((item: { id: string }) => item.id === row.id);
    if (!row.ok) { evaluated.push(row); continue; }
    const html = await readFile(path.join(root, 'results', engine, row.html_file), 'utf8');
    const phones = publishedPagePhones(html);
    const telegram = [...new Set(publishedTelegramLocators(html).map(item => item.locator.url))];
    evaluated.push({ ...row, phone_candidates: phones.length, mobile_candidates: phones.filter(p => p.mobileLookupCandidate).length,
      published_telegram_locators: telegram.length,
      known_phone_found: site.known_phone ? phones.some(p => p.e164 === site.known_phone) : null,
      known_telegram_found: site.known_telegram ? telegram.includes(site.known_telegram) : null });
  }
  reports.push({ ...report, results: evaluated, summary: {
    attempted: evaluated.length, downloaded: evaluated.filter(r => r.ok).length,
    known_phones_tested: evaluated.filter(r => r.known_phone_found !== null && r.known_phone_found !== undefined).length,
    known_phones_found: evaluated.filter(r => r.known_phone_found === true).length,
    failures: evaluated.filter(r => !r.ok).map(r => ({ id: r.id, reason: r.error })),
  } });
}
const output = { scope: '15-public-sites-one-page-http-smoke', full_recall_measured: false, ownership_precision_measured: false,
  telegram_accounts_verified: 0, production_writes: 0, reports };
await writeFile(path.join(root, 'results', 'comparison.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(reports.map(r => ({ engine: r.engine, ...r.summary,
  contacts: r.results.filter((row: { ok: boolean }) => row.ok).map((row: {id:string;phone_candidates:number;mobile_candidates:number;published_telegram_locators:number;known_phone_found:boolean|null;known_telegram_found:boolean|null}) =>
    ({ id: row.id, phones: row.phone_candidates, mobiles: row.mobile_candidates, telegram_links: row.published_telegram_locators,
      known_phone_found: row.known_phone_found, known_telegram_found: row.known_telegram_found })) })), null, 2));
