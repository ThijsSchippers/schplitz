import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HEAD, NOSCRIPT, LLMS_TXT } from './src/v2/site.js'

const ROOT_HTML = resolve('index.html');

/**
 * The launch build (VITE_V2_AT_ROOT=true) describes Schplitz 2 at "/": its meta tags and
 * noscript text in index.html, and llms.txt. The default build leaves Schplitz 1's in place.
 */
function siteForLaunch(on) {
  const swap = (html, name, content) => {
    const re = new RegExp(`[ \\t]*<!-- ${name}[^>]*-->[\\s\\S]*?<!-- /${name} -->\\n?`);
    if (!re.test(html)) throw new Error(`index.html: missing <!-- ${name} --> markers`);
    return html.replace(re, () => content);
  };
  let outDir;
  return {
    name: 'schplitz-site-for-launch',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!on || resolve(ctx.filename) !== ROOT_HTML) return html;
        return swap(swap(html, 'site-meta', HEAD), 'site-noscript', NOSCRIPT);
      },
    },
    closeBundle() { if (on) writeFileSync(join(outDir, 'llms.txt'), LLMS_TXT); },   // after public/ is copied
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), siteForLaunch(loadEnv(mode, process.cwd(), 'VITE_').VITE_V2_AT_ROOT === 'true')],
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
}))
