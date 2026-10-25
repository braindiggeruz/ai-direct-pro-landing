import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import postcss from 'postcss'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const studioRequire = createRequire(here('./apps/studio/package.json'))

// Studio uses prefixed Tailwind v4; the site uses v3. Compile only Studio's
// lazy stylesheet with its own pinned compiler before the site's CSS pipeline.
const studioStyles = () => ({
  name: 'embedded-studio-styles',
  enforce: 'pre' as const,
  async transform(code: string, id: string) {
    if (id.split('?')[0].replace(/\\/g, '/') !== here('./apps/studio/src/styles.css').replace(/\\/g, '/')) return
    const result = await postcss([studioRequire('@tailwindcss/postcss')()]).process(code, { from: id.split('?')[0] })
    return { code: result.css, map: null }
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [studioStyles(), react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'scheduler'],
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
    // dist/.vite/manifest.json names each entry's file: scripts/prerender.ts
    // takes the chat and calculator scripts from it (a lazy chunk may share an
    // entry's prefix), and scripts/chat-bundle-budget.ts walks it.
    manifest: true,
    minify: 'esbuild',
    rollupOptions: {
      // Six entries:
      //   index     → landing SPA (index.html), chunk stays "index-[hash].js"
      //   gpt-chat  → standalone AI-chat island, emitted as
      //               "assets/gpt-chat-[hash].js" and injected ONLY on
      //               pageType === 'gpt-chat' pages by scripts/prerender.ts.
      //   telegram-cost-calculator → isolated lead-magnet tool, injected ONLY
      //               on the money page that opts in via interactiveTool.
      //   uz-translit, calculator-widget, irregular-verbs → the widgets of the
      //               AI tool pages (Page.widgets, scripts/tool-widgets.ts),
      //               each injected ONLY on a gpt-chat page that lists it. They
      //               share no module with the chat (a type import at most), so
      //               no chunk of theirs reaches the chat's modulepreloads.
      input: {
        index: here('./index.html'),
        'gpt-chat': here('./src/gpt-chat/main.tsx'),
        'telegram-cost-calculator': here('./src/calculator/main.tsx'),
        'uz-translit': here('./src/uz-translit/main.ts'),
        'calculator-widget': here('./src/tools/calculator/main.ts'),
        'irregular-verbs': here('./src/tools/irregular-verbs/main.ts'),
      },
      output: {
        manualChunks(id) {
          // Billing dialogs and the editor share a small runtime, never each
          // other's UI. Keep that dependency out of the chat entry and avoid
          // lazy checkout importing the entire presentation workspace.
          if (/\/apps\/studio\/src\/(?:api|config|analytics|identity|attribution)\.ts$/.test(id)
            || /\/apps\/studio\/src\/billing\/(?:runtime|hint|providers)\.ts$/.test(id)) return 'studio-runtime'
          if (/\/apps\/studio\/src\/pptx\/(?:fit|layouts|palettes)\.ts$/.test(id)) return 'studio-slides'
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
