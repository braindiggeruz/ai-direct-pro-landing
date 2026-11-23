// Writes public/openai-product-feed.jsonl (served at
// https://gptbot.uz/openai-product-feed.jsonl, the Hosted URL in ChatGPT
// Business Hub → Products). Runs before `vite build`, which copies public/ to
// dist/, so every build ships a feed read from the current prices.
//
//   tsx scripts/build-openai-feed.ts          build, validate, write
//   tsx scripts/build-openai-feed.ts --check  build, validate, and fail when the
//                                             committed file differs (CI / tests)
//
// The output is deterministic (no dates, fixed key order), so a build on an
// unchanged tree leaves the committed file untouched and the release guard's
// clean-tree check stays green.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFeed, FEED_FILE, serializeFeed, validateFeedText } from './openai-feed';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main(): void {
  const check = process.argv.includes('--check');
  const { records } = buildFeed(ROOT);
  const text = serializeFeed(records);
  const errors = validateFeedText(text);
  if (errors.length) {
    console.error(`openai-product-feed: ${errors.length} validation error(s):\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  const target = path.join(ROOT, FEED_FILE);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (check) {
    if (current !== text) {
      console.error(`openai-product-feed: ${FEED_FILE} is stale. Run: npx tsx scripts/build-openai-feed.ts and commit the file.`);
      process.exit(1);
    }
    console.log(`openai-product-feed: ${records.length} items, ${FEED_FILE} is up to date`);
    return;
  }
  if (current !== text) fs.writeFileSync(target, text, 'utf8');
  console.log(`openai-product-feed: ${records.length} items → ${FEED_FILE}${current === text ? ' (unchanged)' : ''}`);
}

main();
