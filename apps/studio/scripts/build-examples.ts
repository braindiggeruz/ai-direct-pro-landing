/** Offline asset preparation; never called by the public generation path. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { buildDeck, planSlides } from '../src/pptx/build';
import { PRESENTATION_EXAMPLES } from './examples-data';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export async function buildExamples(root = ROOT): Promise<void> {
  const output = path.join(root, 'public/studio-examples');
  const evidence = path.join(root, 'reports/seo-growth-20261106/studio');
  await fs.mkdir(output, { recursive: true });
  await fs.mkdir(evidence, { recursive: true });
  const records = [];
  for (const example of PRESENTATION_EXAMPLES) {
    const pictures = new Map<number, string>();
    if (planSlides(example.deck, pictures).some((slide) => slide.columns.some((column) => !column.fits))) {
      throw new Error(`${example.id}: example text does not fit the real export layout`);
    }
    const blob = await buildDeck({ locale: example.locale, deck: example.deck, palette: example.palette, pictures, aiLabel: true });
    const bytes = Buffer.from(await blob.arrayBuffer());
    await fs.writeFile(path.join(output, `${example.id}.pptx`), bytes);
    records.push({ id: example.id, locale: example.locale, slides: example.deck.slides.length + 2, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await fs.writeFile(path.join(evidence, 'manifest.json'), `${JSON.stringify({ kind: 'curated-examples', renderer: 'Studio buildDeck', examples: records }, null, 2)}\n`);
  console.log(JSON.stringify(records));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  buildExamples().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
