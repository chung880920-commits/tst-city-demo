import { defineConfig } from 'vite';

// GitHub Pages builds set BASE_PATH=/tst-city-demo/; local dev, preview and tunnels use relative paths.
const base = process.env.BASE_PATH || './';

export default defineConfig({
  base,
  server: { host: '0.0.0.0', port: 47321 },
  preview: { host: '0.0.0.0', port: 47322 },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
