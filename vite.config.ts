import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 47321 },
  preview: { host: '0.0.0.0', port: 47322 },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
