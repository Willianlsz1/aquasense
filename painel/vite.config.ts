import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// O GitHub Pages publica a raiz da branch main sem compilar nada. Por isso o
// build vai para painel/dist e scripts/publicar.mjs copia o resultado para a raiz
// do repositório (index.html, relatorio.html e a pasta app/).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5180, strictPort: true },
  build: {
    outDir: 'dist', chunkSizeWarningLimit: 800,
    assetsDir: 'app',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        relatorio: resolve(import.meta.dirname, 'relatorio.html'),
      },
    },
  },
})
