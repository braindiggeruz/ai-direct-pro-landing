/** @jsxRuntime automatic @jsxImportSource react */
/**
 * Studio island entry.
 *
 * The page around the island is static HTML written at build time by
 * scripts/prerender-studio.ts; the island owns only <div id="studio-root">,
 * which wraps the form and nothing else (H1, text and FAQ stay outside it).
 * The build writes the form's first state into it (tools/presentation/
 * static.ts) and this file hydrates that markup: the same tree, so the page
 * neither flashes nor shifts.
 *
 * On load the island makes no network request. robots.txt closes /api/ to
 * every crawler and Google indexes the page after running its JavaScript,
 * so anything fetched on load (and any error it could show) would be what
 * lands in the index. /config and /me are asked for on the first focus or
 * submit (config.ts); Turnstile loads on submit; pptxgenjs on download.
 *
 * The page's language is <html lang> ("uz" or "ru"). An empty root (a page
 * built without the prerendered form) is rendered instead of hydrated. A
 * hydration mismatch is marked on the root (data-hydration="recovered") for
 * scripts/check-pages.ts; React then re-renders the client tree, which is
 * still a working form.
 */
import { createRoot, hydrateRoot } from 'react-dom/client';
import './styles.css';
import { Form } from './tools/presentation/Form';
import { pageLocale } from './tools/presentation/texts';

const root = document.getElementById('studio-root');
if (root && root.dataset.tool !== 'photo') {
  // Exactly the tree static.ts renders at build time (no StrictMode around it), so the markup matches.
  const island = <Form locale={pageLocale(document.documentElement.lang)} />;
  if (root.firstElementChild) {
    hydrateRoot(root, island, {
      onRecoverableError: () => {
        root.dataset.hydration = 'recovered';
      },
    });
  } else {
    createRoot(root).render(island);
  }
}
