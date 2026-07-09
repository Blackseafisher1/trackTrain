import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
// Static Vercel deploy: pure client, OPFS sqlite wasm served from /sqlite/
export default defineConfig({
  plugins: [svelte()],
  server: {
    // If the sqlite load error overlay still appears during dev (rare after fix),
    // you can temporarily set hmr.overlay: false. Root cause is handled in worker.
    hmr: { overlay: true },
  },
  // browser conditions for Svelte 5 runes + client mount in tests
  resolve: {
    conditions: ['browser'],
  },
  // worker for sqlite OPFS. es format.
  worker: {
    format: 'es',
  },
  // exclude heavy sqlite from dep optimize (loads via worker + public assets)
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  // sqlite index.mjs + .wasm live in /public/sqlite (for static deploy).
  // Loaded from worker via `new Function('u','return import(u)')` + baseUrl
  // so Vite never sees a source-level import('/sqlite/...') during transform.
  // Vitest config inline. Keep simple. jsdom for DOM tests.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,svelte}'],
    deps: {
      optimizer: {
        web: {
          include: ['@testing-library/svelte'],
        },
      },
    },
  },
})
