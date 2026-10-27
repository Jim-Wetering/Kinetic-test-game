import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths so the built game also loads from disk (file://), e.g. inside the desktop app
  base: './',
  // three.js alone is ~500 kB, and the game ships as one bundle on purpose
  build: { outDir: 'dist', chunkSizeWarningLimit: 1000 },
});
