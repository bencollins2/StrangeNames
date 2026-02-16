import { defineConfig } from 'vite';

export default defineConfig({
  // Don't copy embeddings data to dist — served from R2 CDN
  publicDir: false,
});
