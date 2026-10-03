import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

/**
 * O MSW é importado dinamicamente (fica fora do build sem mocks), mas no build de demonstração
 * ele está no caminho crítico de dados. Este plugin injeta <link rel="modulepreload"> para o
 * chunk dos mocks e suas dependências, baixando-os em paralelo com o bundle principal.
 */
function preloadMocks(): Plugin {
  return {
    name: 'kurio:preload-mocks',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle || process.env.VITE_ENABLE_MSW === 'false') return
        const chunks = Object.values(ctx.bundle).filter((item) => item.type === 'chunk')
        const entry = chunks.find((chunk) => chunk.facadeModuleId?.replace(/\\/g, '/').endsWith('/src/mocks/browser.ts'))
        if (!entry) return
        const files = new Set<string>([entry.fileName, ...entry.imports])
        return [...files].map((file) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: '', href: `/${file}` },
          injectTo: 'head' as const,
        }))
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadMocks()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Ver src/mocks/tldts-lite.ts: remove a Public Suffix List do chunk do MSW.
      tldts: fileURLToPath(new URL('./src/mocks/tldts-lite.ts', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
})
