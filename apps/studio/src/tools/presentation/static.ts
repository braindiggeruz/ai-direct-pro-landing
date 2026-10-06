/**
 * The form's first state as static HTML, for the page written at build time
 * (scripts/prerender-studio.ts puts it inside #studio-root, T2.3) and for the
 * headless and unit checks of hydration.
 *
 * It renders with this app's own react-dom/server, so the build-time markup
 * and the browser's hydrateRoot come from the same React. Never imported by
 * main.tsx: react-dom/server is not part of the browser build.
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { StudioLocale } from '../../api';
import { Form } from './Form';

/** The island's markup for a page in `locale` (what goes inside <div id="studio-root">). */
export function renderForm(locale: StudioLocale): string {
  return renderToString(createElement(Form, { locale }));
}
