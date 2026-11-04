import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Not `assets`, which is a page of the app (/assets/new). See apps/api/src/web-app.ts.
  build: { assetsDir: 'static' },
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
});
