import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    // Modern browsers only — drops legacy transforms/polyfills that Lighthouse
    // flags as "legacy JavaScript" (~33 KiB). All target browsers support ES2022.
    target: 'es2022',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      // Two entries:
      //   index     → landing SPA (index.html), chunk stays "index-[hash].js"
      //   gpt-chat  → standalone AI-chat island, emitted as
      //               "assets/gpt-chat-[hash].js" and injected ONLY on
      //               pageType === 'gpt-chat' pages by scripts/prerender.ts.
      input: {
        index: here('./index.html'),
        'gpt-chat': here('./src/gpt-chat/main.tsx'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('react-router') ||
              id.includes('/react-dom/') ||
              id.includes('/react/') ||
              id.includes('/scheduler/')
            ) {
              return 'vendor'
            }
          }
        },
      },
    },
  },
})
