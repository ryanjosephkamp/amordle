import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Phase 17.2 (LOCAL-WORD-LISTS-SPEC-2026-05-28 §22.5): the 34 per-length
        // word-list JSONs at `src/latest/words_length_N.json` total ~8.3 MB raw
        // and would push the main gameplay chunk well over the §22.5 +20%
        // bundle-size budget if statically bundled into it. Split them into
        // dedicated chunks so the main chunk stays small (browsers parse less
        // JS upfront and gameplay code is unaffected at runtime — Rolldown
        // emits `<link rel="modulepreload">` for the split chunks via the
        // existing import graph). Daily length 5 lives in its own chunk too;
        // it is intentionally a small file so this is acceptable.
        manualChunks(id: string) {
          const match = /[\\/]src[\\/]latest[\\/]words_length_(\d+)\.json$/.exec(id)
          if (match) {
            return `word-list-${match[1]}`
          }
          return undefined
        },
      },
    },
  },
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
    setupFiles: ['./src/test/setupWordLists.ts'],
  },
})
