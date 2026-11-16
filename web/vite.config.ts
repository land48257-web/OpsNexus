import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'

// Handle CommonJS/ESM interop issue
const monacoPlugin = (monacoEditorPlugin as any).default || monacoEditorPlugin;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawBase = env.VITE_BASE_PATH || '/'
  const prefix = rawBase === '/' ? '' : `/${rawBase.replace(/^\/+|\/+$/g, '')}`
  const base = `${prefix}/`

  return {
    base,
    plugins: [
      react(),
      monacoPlugin({
        // URL prefixes belong to routing, not the embedded filesystem layout.
        customDistPath: (root: string, outDir: string) => path.join(root, outDir, 'monacoeditorwork'),
      })
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        [`${prefix}/api`]: {
          target: 'http://localhost:8080',
          changeOrigin: false,
          ws: true,
        },
        [`${prefix}/ws`]: {
          target: 'ws://localhost:8080',
          ws: true,
        }
      }
    }
  }
})
