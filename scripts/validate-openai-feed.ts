// Validates the OpenAI product feed against the rules in scripts/openai-feed.ts.
// Exit code 1 on any violation.
//
//   tsx scripts/validate-openai-feed.ts          the committed .jsonl, .jsonl.gz and .tsv
//   tsx scripts/validate-openai-feed.ts --live   the same three files on https://gptbot.uz
//
// --live (after a deploy) also requires: .jsonl.gz answers 200 with
// Content-Type application/gzip and NO Content-Encoding, and its bytes are a
// gzip archive of the live .jsonl; .tsv answers 200 as text/tab-separated-values
// and holds the same records; every url and image_url answers 200 with no
// redirect; every image is image/jpeg or image/png; each page shows its price.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FEED_FILE, FEED_GZ_FILE, FEED_GZ_URL, FEED_TSV_FILE, FEED_TSV_URL, FEED_URL, groupThousands, gunzipText,
  normaliseSpaces, validateFeedText, validateTsvText,
} from './openai-feed';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USER_AGENT = 'gptbot-feed-check/1.0';

// A client that accepts compression: if the edge added Content-Encoding to the
// .gz, this request is the one that would show it.
async function get(url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<Response> {
  return fetch(url, {
    method,
    redirect: 'manual',
    headers: { 'User-Agent': USER_AGENT, 'Cache-Control': 'no-cache', 'Accept-Encoding': 'gzip, deflate, br' },
  });
}

const decodeEntities = (html: string): string => html.replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&amp;/g, '&');
const line = (url: string, r: Response): string => `${r.status} ${url} | content-type: ${r.headers.get('content-type')}`
  + ` | content-encoding: ${r.headers.get('content-encoding') ?? '—'} | cache-control: ${r.headers.get('cache-control')}`
  + ` | access-control-allow-origin: ${r.headers.get('access-control-allow-origin')}`;

async function liveFiles(): Promise<{ jsonl: string; gz: Buffer; tsv: string; errors: string[] }> {
  const errors: string[] = [];
  const jsonlResponse = await get(FEED_URL);
  console.log(line(FEED_URL, jsonlResponse));
  if (jsonlResponse.status !== 200) errors.push(`${FEED_URL} answered ${jsonlResponse.status}`);
  const jsonl = await jsonlResponse.text();

  const gzResponse = await get(FEED_GZ_URL);
  console.log(line(FEED_GZ_URL, gzResponse));
  if (gzResponse.status !== 200) errors.push(`${FEED_GZ_URL} answered ${gzResponse.status}`);
  if (!/^application\/gzip\b/i.test(gzResponse.headers.get('content-type') ?? '')) errors.push('.jsonl.gz Content-Type is not application/gzip');
  if (gzResponse.headers.get('content-encoding')) errors.push(`.jsonl.gz carries Content-Encoding: ${gzResponse.headers.get('content-encoding')}`);
  const gz = Buffer.from(await gzResponse.arrayBuffer());

  const tsvResponse = await get(FEED_TSV_URL);
  console.log(line(FEED_TSV_URL, tsvResponse));
  if (tsvResponse.status !== 200) errors.push(`${FEED_TSV_URL} answered ${tsvResponse.status}`);
  if (!/^text\/tab-separated-values\b/i.test(tsvResponse.headers.get('content-type') ?? '')) errors.push('.tsv Content-Type is not text/tab-separated-values');
  const tsv = await tsvResponse.text();
  return { jsonl, gz, tsv, errors };
}

function localFiles(): { jsonl: string; gz: Buffer; tsv: string; errors: string[] } {
  const read = (file: string): Buffer => fs.readFileSync(path.join(ROOT, file));
  return { jsonl: read(FEED_FILE).toString('utf8'), gz: read(FEED_GZ_FILE), tsv: read(FEED_TSV_FILE).toString('utf8'), errors: [] };
}

async function liveLinks(jsonl: string): Promise<string[]> {
  const errors: string[] = [];
  const records = jsonl.trim().split('\n').map((l) => JSON.parse(l) as { item_id: string; url: string; image_url: string; price: string });
  const pages = new Map<string, Promise<{ status: number; location: string | null; html: string }>>();
  const images = new Map<string, Promise<Response>>();
  for (const record of records) {
    if (!pages.has(record.url)) {
      pages.set(record.url, get(record.url).then(async (r) => ({
        status: r.status, location: r.headers.get('location'), html: r.status === 200 ? normaliseSpaces(decodeEntities(await r.text())) : '',
      })));
    }
    const page = await pages.get(record.url)!;
    if (page.status !== 200) errors.push(`${record.item_id}: url ${record.url} → ${page.status}${page.location ? ` (Location: ${page.location})` : ''}`);
    const amount = Number(record.price.split(' ')[0]);
    if (page.status === 200 && amount > 0 && !page.html.includes(groupThousands(amount))) errors.push(`${record.item_id}: ${record.url} does not show ${groupThousands(amount)}`);
    if (!images.has(record.image_url)) images.set(record.image_url, get(record.image_url, 'HEAD'));
    const image = await images.get(record.image_url)!;
    const type = image.headers.get('content-type') ?? '';
    if (image.status !== 200) errors.push(`${record.item_id}: image_url ${record.image_url} → ${image.status}`);
    else if (!/^image\/(jpeg|png)\b/i.test(type)) errors.push(`${record.item_id}: image_url Content-Type is ${type}, not image/jpeg or image/png`);
  }
  for (const [url, image] of images) console.log(`${(await image).status} ${(await image).headers.get('content-type')} ${url}`);
  console.log(`checked ${records.length} records, ${pages.size} pages, ${images.size} images`);
  return errors;
}

async function main(): Promise<void> {
  const live = process.argv.includes('--live');
  const files = live ? await liveFiles() : localFiles();
  const errors = [...files.errors, ...validateFeedText(files.jsonl), ...validateTsvText(files.tsv, files.jsonl)];
  if (files.gz[0] !== 0x1f || files.gz[1] !== 0x8b) errors.push('.jsonl.gz does not start with the gzip magic bytes 1f 8b');
  else {
    try {
      if (gunzipText(files.gz) !== files.jsonl) errors.push('.jsonl.gz does not decompress to the .jsonl');
    } catch {
      errors.push('.jsonl.gz is not a valid gzip archive');
    }
  }
  if (live) errors.push(...await liveLinks(files.jsonl));
  const count = files.jsonl.trim() ? files.jsonl.trim().split('\n').length : 0;
  if (errors.length) {
    console.error(`FAIL ${live ? 'live' : 'local'} feed: ${count} records, ${errors.length} error(s):\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`OK ${live ? 'live' : 'local'} feed: ${count} valid records in .jsonl, .jsonl.gz and .tsv`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
