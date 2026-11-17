// Entry of the natal chart widget (Page.interactiveTool 'natal-chart'): its
// own Vite entry, loaded by scripts/prerender.ts only on a page that opts in.
// data-locale and data-mode on the root say the page's language and whether
// it opens on one chart or on a pair.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import NatalApp from './NatalApp';
import './natal.css';

const root = document.getElementById('natal-chart-root');
if (root) {
  const locale = root.dataset.locale === 'ru' ? 'ru' : 'uz';
  const mode = root.dataset.mode === 'pair' ? 'pair' : 'natal';
  createRoot(root).render(
    <StrictMode>
      <NatalApp locale={locale} mode={mode} />
    </StrictMode>,
  );
}
