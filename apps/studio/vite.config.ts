import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * The studio is a separate build that lands inside the root artifact under
 * /assets/studio/, so the year-long immutable cache the site already sets on
 * /assets/* covers it without a new _headers rule.
 *
 * It runs after the root `vite build` (which clears dist/) and after the admin
 * build; emptyOutDir clears only dist/assets/studio. The manifest is written
 * for apps/studio/scripts/prerender-studio.ts, which reads the entry's files
 * from it and then deletes it, so it is never published.
 *
 * assetsDir '' keeps every file directly in /assets/studio/: the base already
 * says "assets", and a second level would only lengthen every URL.
 */
export default defineConfig({
  root: here('.'),
  base: '/assets/studio/',
  plugins: [react()],
  // public/ holds versioned files only (og-*-v1.png): /assets/* is immutable.
  publicDir: here('./public'),
  build: {
    outDir: here('../../dist/assets/studio'),
    assetsDir: '',
    emptyOutDir: true,
    manifest: true,
    target: 'es2022',
    sourcemap: false,
    // Vite 8's own minifier (Oxc). 'esbuild' is not a dependency of the studio:
    // asking for it would quietly borrow the root install's copy.
    rollupOptions: {
      input: { studio: here('./src/main.tsx') },
    },
  },
});
