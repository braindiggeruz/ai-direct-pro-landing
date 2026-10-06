/**
 * Studio island entry.
 *
 * The page around the island is static HTML written at build time by
 * scripts/prerender-studio.ts; the island owns only <div id="studio-root">,
 * which wraps the form and nothing else (H1, text and FAQ stay outside it).
 *
 * On load the island makes no network request. robots.txt closes /api/ to
 * every crawler and Google indexes the page after running its JavaScript, so
 * anything fetched on load (and any error it could show) would be what lands
 * in the index. /config and /me are asked for on the first focus or submit.
 *
 * T0.3 skeleton: no React tree yet (T2.2 replaces this with hydrateRoot of the
 * prerendered form). The one action wired is the last step every tool ends
 * with, building and saving the .pptx, so the lazy pptxgenjs chunk is in the
 * build and can be exercised by scripts/check-pages.ts.
 */
import './styles.css';
import { buildDeck, type DeckInput } from './pptx/build';

/** Dispatched on #studio-root with a DeckInput as `detail`. */
const DOWNLOAD_EVENT = 'studio:download';

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked later, not at once: some browsers read the URL after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const root = document.getElementById('studio-root');
if (root) {
  root.addEventListener(DOWNLOAD_EVENT, (event) => {
    const deck = (event as CustomEvent<DeckInput>).detail;
    root.dataset.state = 'building';
    buildDeck(deck)
      .then((blob) => {
        save(blob, 'taqdimot.pptx');
        root.dataset.state = 'saved';
      })
      .catch(() => {
        root.dataset.state = 'failed';
      });
  });
  root.dataset.island = 'ready';
}
