import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': here('./src'),
    },
  },
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
      // Three entries:
      //   index     → landing SPA (index.html), chunk stays "index-[hash].js"
      //   gpt-chat  → standalone AI-chat island, emitted as
      //               "assets/gpt-chat-[hash].js" and injected ONLY on
      //               pageType === 'gpt-chat' pages by scripts/prerender.ts.
      //   telegram-cost-calculator → isolated lead-magnet tool, injected ONLY
      //               on the money page that opts in via interactiveTool.
      input: {
        index: here('./index.html'),
        'gpt-chat': here('./src/gpt-chat/main.tsx'),
        'telegram-cost-calculator': here('./src/calculator/main.tsx'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // react-router deliberately NOT here: only the lazy admin chunk
            // uses it, so it must stay out of the landing-critical vendor.
            if (
              id.includes('/react-dom/') ||
              id.includes('/react/') ||
              id.includes('/scheduler/')
            ) {
              return 'vendor'
            }
            // motion (and its motion-dom/motion-utils internals) is only used
            // by the lazy admin tree — keep it in its own cacheable chunk so
            // it never leaks into the landing-critical path.
            if (
              id.includes('/motion/') ||
              id.includes('/motion-dom/') ||
              id.includes('/motion-utils/') ||
              id.includes('/framer-motion/')
            ) {
              return 'motion'
            }
          }
        },
      },
    },
  },
})
