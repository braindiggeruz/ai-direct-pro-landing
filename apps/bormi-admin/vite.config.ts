import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Bormi Admin builds into the root project under /admin/, which is why `base`
 * is absolute: the panel is served from one path on the same origin as the API
 * it reads, so the owner session that already exists is the session it uses and
 * there is no second login, no CORS surface and no second token.
 *
 * The output goes to the root `dist` after the root build has written it, so
 * this never runs as part of `vite build` upstairs and cannot clear it.
 */
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: '../../dist/admin',
    emptyOutDir: true,
    // Every screen is a route-level chunk, split by its own dynamic import.
    // The shell is what loads first and it is the only thing every visit pays
    // for; no manual chunking is needed on top of that, and inventing one only
    // moves bytes between files that all load together anyway.
  },
  server: {
    port: 5183,
    // Local development talks to the deployed API rather than a second copy of
    // it. Set VITE_ADMIN_API_ORIGIN to point somewhere else.
    proxy: {
      '/api': {
        target: process.env.VITE_ADMIN_API_ORIGIN ?? 'https://gptbot.uz',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
