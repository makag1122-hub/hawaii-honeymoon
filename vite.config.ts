import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const base = '/hawaii-honeymoon/'
const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'))
const pdfDirectories = ['cmaps', 'standard_fonts', 'wasm', 'iccs']

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

// Emit the complete PDF.js resources so documents with uncommon fonts and image
// encodings work after the first app installation, even if never opened online.
function offlinePdfAssets(): Plugin {
  return {
    name: 'aloha-offline-pdf-assets',
    configureServer(server) {
      server.middlewares.use(`${base}pdf-assets/`, (request, response, next) => {
        const requested = (request.url || '').split('?')[0]
        const path = resolve(pdfRoot, requested.replace(/^\//, ''))
        const rel = relative(pdfRoot, path).replaceAll('\\', '/')
        if (!pdfDirectories.some((directory) => rel.startsWith(`${directory}/`)) || rel.includes('..')) return next()
        try {
          response.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
          response.end(readFileSync(path))
        } catch { next() }
      })
    },
    generateBundle(_options, bundle) {
      const assets: string[] = []
      for (const directory of pdfDirectories) {
        for (const path of filesBelow(join(pdfRoot, directory))) {
          const fileName = `pdf-assets/${relative(pdfRoot, path).replaceAll('\\', '/')}`
          this.emitFile({ type: 'asset', fileName, source: readFileSync(path) })
          assets.push(fileName)
        }
      }
      const required = [...new Set([
        ...Object.keys(bundle), ...assets,
        'index.html', 'icon.svg', 'icon-192.png', 'icon-512.png',
        'manifest.webmanifest',
      ])].sort()
      this.emitFile({
        type: 'asset',
        fileName: 'offline-assets.json',
        source: JSON.stringify({ version: 1, assets: required }),
      })
    },
  }
}

export default defineConfig({
  base,
  plugins: [
    react(),
    offlinePdfAssets(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        id: base,
        name: '우리 둘의 알로하',
        short_name: '알로하',
        description: '우리 둘의 일정, 예산, 예약과 준비물을 담는 작은 여행 다이어리',
        lang: 'ko',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#fffaf0',
        theme_color: '#fffaf0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        cacheId: 'aloha-diary',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff,woff2,json,webmanifest,bcmap,pfb,ttf,wasm,icc}', 'pdf-assets/**'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        navigateFallbackAllowlist: [/^\/hawaii-honeymoon\/(?:$|index\.html$)/],
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: { sourcemap: false },
})
