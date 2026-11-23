// Writes the OpenAI product feed (ChatGPT Business Hub → Products → Hosted URL):
//   public/openai-product-feed.jsonl.gz  Hosted URL https://gptbot.uz/openai-product-feed.jsonl.gz
//   public/openai-product-feed.tsv       fallback Hosted URL
//   public/openai-product-feed.jsonl     plain copy
// plus JPEG copies of WebP og:images in public/assets/feed/ (lock:
// scripts/openai-feed-images.json). Runs in prebuild, prebuild:fast and
// prebuild:cf, before `vite build` copies public/ to dist/.
//
//   tsx scripts/build-openai-feed.ts          build, validate, write what changed
//   tsx scripts/build-openai-feed.ts --check  build, validate, fail when a committed
//                                             file or image is stale (CI / tests)
//
// Nothing is rewritten when its content is current: the .gz is kept while it
// decompresses to the current JSONL, a JPEG is kept while its WebP is unchanged.
// So a build on any machine leaves an unchanged tree untouched, and the release
// guard's clean-tree check stays green.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildFeed, FEED_FILE, FEED_GZ_FILE, FEED_IMAGE_DIR, FEED_IMAGE_LOCK, FEED_TSV_FILE, gunzipText, gzipFeed,
  publicFile, readImageLock, refreshServicePricesManifest, serializeFeed, serializeTsv, sha256, validateFeedText,
  validateTsvText, webpSources, type FeedImageLock,
} from './openai-feed';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JPEG_WIDTH = 1200;

function fail(message: string): never {
  console.error(`openai-product-feed: ${message}`);
  process.exit(1);
}

/** Make or refresh the JPEG copy of every WebP og:image the feed uses; returns the lock. */
async function ensureImages(check: boolean): Promise<{ lock: FeedImageLock; changed: string[] }> {
  const previous = readImageLock(ROOT);
  const lock: FeedImageLock = {};
  const changed: string[] = [];
  for (const source of webpSources(ROOT)) {
    const bytes = fs.readFileSync(publicFile(ROOT, source));
    const sourceSha256 = sha256(bytes);
    const old = previous[source];
    if (old && old.sourceSha256 === sourceSha256 && fs.existsSync(publicFile(ROOT, old.jpg))
      && sha256(fs.readFileSync(publicFile(ROOT, old.jpg))) === old.jpgSha256) {
      lock[source] = old;
      continue;
    }
    if (check) fail(`JPEG copy of ${source} is missing or stale. Run: npx tsx scripts/build-openai-feed.ts and commit.`);
    const { default: sharp } = await import('sharp');
    const { data, info } = await sharp(bytes)
      .resize({ width: JPEG_WIDTH, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const jpgSha256 = sha256(data);
    const jpg = `${FEED_IMAGE_DIR}${path.basename(source).replace(/\.webp$/i, '')}-${jpgSha256.slice(0, 8)}.jpg`;
    fs.mkdirSync(path.dirname(publicFile(ROOT, jpg)), { recursive: true });
    fs.writeFileSync(publicFile(ROOT, jpg), data);
    if (old && old.jpg !== jpg && fs.existsSync(publicFile(ROOT, old.jpg))) fs.rmSync(publicFile(ROOT, old.jpg));
    lock[source] = { sourceSha256, jpg, jpgSha256, width: info.width, height: info.height };
    changed.push(jpg);
  }
  // Copies nobody links any more.
  const dir = publicFile(ROOT, FEED_IMAGE_DIR);
  const kept = new Set(Object.values(lock).map((entry) => path.basename(entry.jpg)));
  for (const file of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (kept.has(file)) continue;
    if (check) fail(`${FEED_IMAGE_DIR}${file} is not in ${FEED_IMAGE_LOCK}. Run the generator and commit.`);
    fs.rmSync(path.join(dir, file));
    changed.push(`removed ${FEED_IMAGE_DIR}${file}`);
  }
  const lockText = `${JSON.stringify(lock, null, 2)}\n`;
  const lockFile = path.join(ROOT, FEED_IMAGE_LOCK);
  const currentLock = fs.existsSync(lockFile) ? fs.readFileSync(lockFile, 'utf8') : '';
  if (currentLock !== lockText) {
    if (check) fail(`${FEED_IMAGE_LOCK} is stale. Run the generator and commit.`);
    fs.writeFileSync(lockFile, lockText, 'utf8');
  }
  return { lock, changed };
}

const readOr = (file: string): Buffer | null => (fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file)) : null);

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const { changed } = await ensureImages(check);
  const { records } = buildFeed(ROOT);
  const jsonl = serializeFeed(records);
  const tsv = serializeTsv(records);
  const errors = [...validateFeedText(jsonl), ...validateTsvText(tsv, jsonl)];
  if (errors.length) fail(`${errors.length} validation error(s):\n- ${errors.join('\n- ')}`);

  const currentGz = readOr(FEED_GZ_FILE);
  const gzCurrent = ((): boolean => {
    try { return currentGz !== null && currentGz[0] === 0x1f && currentGz[1] === 0x8b && gunzipText(currentGz) === jsonl; } catch { return false; }
  })();
  const outputs: Array<[string, boolean, () => void]> = [
    [FEED_FILE, readOr(FEED_FILE)?.toString('utf8') === jsonl, () => fs.writeFileSync(path.join(ROOT, FEED_FILE), jsonl, 'utf8')],
    [FEED_GZ_FILE, gzCurrent, () => fs.writeFileSync(path.join(ROOT, FEED_GZ_FILE), gzipFeed(jsonl))],
    [FEED_TSV_FILE, readOr(FEED_TSV_FILE)?.toString('utf8') === tsv, () => fs.writeFileSync(path.join(ROOT, FEED_TSV_FILE), tsv, 'utf8')],
  ];
  // public/llms.txt quotes the same package prices in its managed service-prices block.
  const llmsFile = 'public/llms.txt';
  const llmsText = readOr(llmsFile)?.toString('utf8') ?? '';
  const llmsFresh = refreshServicePricesManifest(llmsText, ROOT);
  outputs.push([llmsFile, llmsFresh === llmsText, () => fs.writeFileSync(path.join(ROOT, llmsFile), llmsFresh, 'utf8')]);
  const stale = outputs.filter(([, current]) => !current).map(([file]) => file);
  if (check) {
    if (stale.length) fail(`stale: ${stale.join(', ')}. Run: npx tsx scripts/build-openai-feed.ts and commit.`);
    console.log(`openai-product-feed: ${records.length} items; .jsonl, .jsonl.gz, .tsv, feed images and the llms.txt price block are up to date`);
    return;
  }
  for (const [, current, write] of outputs) if (!current) write();
  console.log(`openai-product-feed: ${records.length} items → ${FEED_GZ_FILE}, ${FEED_TSV_FILE}, ${FEED_FILE}`
    + `${stale.length ? ` (written: ${stale.map((f) => path.basename(f)).join(', ')})` : ' (unchanged)'}`
    + `${changed.length ? `; images: ${changed.join(', ')}` : ''}`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
