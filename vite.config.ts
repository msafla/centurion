import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const BACKEND = 'http://127.0.0.1:4317';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/web', import.meta.url)),
    },
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': BACKEND,
      '/internal': BACKEND,
      '/health': BACKEND,
    },
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    sourcemap: false,
  },
});
