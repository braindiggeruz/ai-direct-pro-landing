// Validates an OpenAI product feed file or URL against the rules in
// scripts/openai-feed.ts. Exit code 1 on any violation.
//
//   tsx scripts/validate-openai-feed.ts                       the committed file
//   tsx scripts/validate-openai-feed.ts path/to/feed.jsonl
//   tsx scripts/validate-openai-feed.ts https://gptbot.uz/openai-product-feed.jsonl --live
//
// --live (after a deploy) also requires: the feed answers 200 with an NDJSON
// Content-Type; every url and image_url answers 200 with no redirect; the
// image is an image; and each page shows the record's price.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FEED_FILE, groupThousands, normaliseSpaces, validateFeedText } from './openai-feed';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USER_AGENT = 'gptbot-feed-check/1.0';

async function fetchNoRedirect(url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<Response> {
  return fetch(url, { method, redirect: 'manual', headers: { 'User-Agent': USER_AGENT, 'Cache-Control': 'no-cache' } });
}

const decodeEntities = (html: string): string => html
  .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
  .replace(/&amp;/g, '&');

async function liveChecks(feedUrl: string, text: string): Promise<string[]> {
  const errors: string[] = [];
  const feed = await fetchNoRedirect(feedUrl, 'HEAD');
  const type = feed.headers.get('content-type') ?? '';
  console.log(`HEAD ${feedUrl} → ${feed.status} | Content-Type: ${type} | Cache-Control: ${feed.headers.get('cache-control')} | ACAO: ${feed.headers.get('access-control-allow-origin')}`);
  if (feed.status !== 200) errors.push(`feed answered ${feed.status}`);
  if (!/^application\/x-ndjson/i.test(type)) errors.push(`feed Content-Type is "${type}", expected application/x-ndjson`);

  const records = text.trim().split('\n').map((line) => JSON.parse(line) as { item_id: string; url: string; image_url: string; price: string });
  const pages = new Map<string, Promise<{ status: number; location: string | null; html: string }>>();
  const page = (url: string) => {
    if (!pages.has(url)) {
      pages.set(url, fetchNoRedirect(url).then(async (response) => ({
        status: response.status,
        location: response.headers.get('location'),
        html: response.status === 200 ? normaliseSpaces(decodeEntities(await response.text())) : '',
      })));
    }
    return pages.get(url)!;
  };
  const images = new Map<string, Promise<Response>>();
  for (const record of records) {
    const result = await page(record.url);
    if (result.status !== 200) errors.push(`${record.item_id}: url ${record.url} → ${result.status}${result.location ? ` (Location: ${result.location})` : ''}`);
    const amount = Number(record.price.split(' ')[0]);
    if (result.status === 200 && amount > 0 && !result.html.includes(groupThousands(amount))) {
      errors.push(`${record.item_id}: ${record.url} does not show ${groupThousands(amount)}`);
    }
    if (!images.has(record.image_url)) images.set(record.image_url, fetchNoRedirect(record.image_url, 'HEAD'));
    const image = await images.get(record.image_url)!;
    const imageType = image.headers.get('content-type') ?? '';
    if (image.status !== 200) errors.push(`${record.item_id}: image_url ${record.image_url} → ${image.status}`);
    else if (!imageType.startsWith('image/')) errors.push(`${record.item_id}: image_url Content-Type is ${imageType}`);
  }
  console.log(`checked ${records.length} records, ${pages.size} pages, ${images.size} images`);
  return errors;
}

async function main(): Promise<void> {
  const target = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? path.join(ROOT, FEED_FILE);
  const remote = /^https?:\/\//.test(target);
  let text: string;
  if (remote) {
    const response = await fetchNoRedirect(target);
    if (response.status !== 200) throw new Error(`${target} answered ${response.status}`);
    text = await response.text();
  } else {
    text = fs.readFileSync(target, 'utf8');
  }
  const errors = validateFeedText(text);
  if (process.argv.includes('--live')) {
    if (!remote) throw new Error('--live needs the feed URL');
    errors.push(...await liveChecks(target, text));
  }
  const count = text.trim() ? text.trim().split('\n').length : 0;
  if (errors.length) {
    console.error(`FAIL ${target}: ${count} lines, ${errors.length} error(s):\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`OK ${target}: ${count} valid records`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
