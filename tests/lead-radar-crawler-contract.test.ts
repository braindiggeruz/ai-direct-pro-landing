import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('crawler source, migration, worker route and owner UI are preserved together', () => {
  assert.match(read('migrations/0056_lead_radar_crawler.sql'), /CREATE TABLE IF NOT EXISTS lead_radar_crawler_jobs/);
  assert.match(read('functions/api/lead-radar/crawler/[[path]].ts'), /authenticateCrawlerWorker/);
  assert.match(read('functions/api/admin/lead-radar/[[path]].ts'), /crawlerOwnerStatus/);
  assert.match(read('src/admin/pages/LeadRadar.tsx'), /LeadRadarCrawlerCard/);
  assert.match(read('wrangler.toml'), /LEAD_RADAR_CRAWLER_ENABLED = "true"/);
});

test('crawler extension stays outside the stable research schema fingerprint', () => {
  const source = read('functions/platform/lead-radar/schema-contract.ts');
  for (const object of ['lead_radar_crawler_workers','lead_radar_crawler_jobs','lead_radar_crawler_receipts','lead_radar_crawler_hosts']) {
    assert.match(source, new RegExp(object));
  }
  assert.match(source, /idx_lr_crawler_/);
});

test('crawler UI and APIs remain fail-closed and do not expose raw worker credentials', () => {
  const files = [
    'src/shared/lead-radar-crawler.ts',
    'src/admin/components/lead-radar/LeadRadarCrawlerCard.tsx',
    'functions/platform/lead-radar/crawler.ts',
    'functions/api/lead-radar/crawler/[[path]].ts',
  ];
  const source = files.map(read).join('\n');
  assert.doesNotMatch(source, /token_hash[^\n]*(?:return|Response|ownerJson)/i);
  assert.doesNotMatch(source, /crawler.*(?:send|message).*(?:Telegram|provider)/i);
  assert.match(source, /crawler_unauthorized/);
});


test('recipient directory contact parsing is bounded once and reused by status filters', () => {
  const directory = read('functions/platform/lead-radar/recipient-directory.ts');
  const audiences = read('functions/platform/lead-radar/audiences.ts');
  assert.match(directory, /MAX_DIRECTORY_CONTACT_CANDIDATES_PER_COMPANY = 256/);
  assert.match(directory, /MAX_DIRECTORY_PHONE_EVIDENCE_PER_COMPANY = 128/);
  assert.match(directory, /const telegramContact = parse<LeadRadarTelegramContact \| null>/);
  assert.match(directory, /const businessById = new Map<string, boolean>/);
  assert.match(directory, /hasBusinessContact: members\.some/);
  assert.equal((directory.match(/parse<LeadRadarTelegramContact \| null>/g) ?? []).length, 1);
  assert.match(audiences, /matches\.filter\(\(group\)=>group\.hasBusinessContact\)/);
  assert.doesNotMatch(audiences, /JSON\.parse\(member\.telegram_contact_json/);
});
