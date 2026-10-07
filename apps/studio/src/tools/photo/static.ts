/**
 * The photo island's first state as static HTML, for the page written at
 * build time (scripts/studio-page.ts puts it inside #studio-root of a
 * `tool: "photo"` record) and for the headless and unit checks of
 * hydration. BUILD-PLAN contract: renderPhotoForm(locale).
 *
 * It renders with this app's own react-dom/server, so the build-time markup
 * and the browser's hydrateRoot come from the same React. Never imported by
 * main.tsx: react-dom/server is not part of the browser build.
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { StudioLocale } from '../../api';
import { PhotoIsland } from './Island';

/** The island's markup for a photo page in `locale` (what goes inside <div id="studio-root" data-tool="photo">). */
export function renderPhotoForm(locale: StudioLocale): string {
  return renderToString(createElement(PhotoIsland, { locale }));
}
