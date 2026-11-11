/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En desarrollo la SPA se sirve en el mismo origen que la API (el proxy reenvía /api al backend),
// igual que en producción con Nginx: la cookie de sesión y la de CSRF funcionan sin CORS.
const API = process.env.SIGESER_API_URL ?? 'http://127.0.0.1:8001'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    strictPort: true,
    proxy: { '/api': { target: API, changeOrigin: false } },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/pruebas/setup.ts'],
    css: false,
  },
})
