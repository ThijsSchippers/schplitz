import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // "/": Schplitz 1, or Schplitz 2 with VITE_V2_AT_ROOT=true (docs/launch.md). /v2/: Schplitz 2.
      // /classic/: Schplitz 1, always. All on one origin, so they share the v1 data.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        v2: fileURLToPath(new URL('./v2/index.html', import.meta.url)),
        classic: fileURLToPath(new URL('./classic/index.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
})
